/**
 * CRUD-операции с задачами и логами агентов в SQLite.
 * Все методы синхронные (better-sqlite3) — не требуют await.
 */

import type Database from 'better-sqlite3';
import type { TaskRecord, TaskLogRecord, TaskStatus, AgentRole } from '../pipeline/types.js';

export class TaskRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Создаёт новую задачу и возвращает полную запись (включая сгенерированный id) */
  create(params: {
    title: string;
    description: string;
    repoPath: string;
    maxAttempts: number;
  }): TaskRecord {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (title, description, repo_path, max_attempts)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(params.title, params.description, params.repoPath, params.maxAttempts);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  /** Находит задачу по ID или возвращает undefined */
  getById(id: number): TaskRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    return stmt.get(id) as TaskRecord | undefined;
  }

  /** Список задач, опционально отфильтрованный по статусу */
  list(status?: TaskStatus): TaskRecord[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC');
      return stmt.all(status) as TaskRecord[];
    }
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC');
    return stmt.all() as TaskRecord[];
  }

  /** Обновляет статус задачи (переход в стейт-машине) */
  updateStatus(id: number, status: TaskStatus): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(status, id);
  }

  /** Обновляет номер попытки и имя ветки перед началом новой итерации */
  updateAttempt(id: number, attempt: number, branchName: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET attempt = ?, branch_name = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(attempt, branchName, id);
  }

  /** Сохраняет фидбек ревьюера/тестов — передаётся кодеру при следующей попытке */
  setReviewerFeedback(id: number, feedback: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET reviewer_feedback = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(feedback, id);
  }

  /** Атомарно устанавливает ошибку и переводит задачу в статус failed */
  setError(id: number, error: string): void {
    const stmt = this.db.prepare(`
      UPDATE tasks SET error_message = ?, status = 'failed', updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(error, id);
  }

  /** Добавляет лог-запись о действии агента (кодер, ревьюер, тестер, пайплайн) */
  addLog(params: {
    taskId: number;
    agent: AgentRole;
    action: string;
    inputSummary?: string;
    outputSummary?: string;
    tokensUsed?: number;
    durationMs?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO task_logs (task_id, agent, action, input_summary, output_summary, tokens_used, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      params.taskId,
      params.agent,
      params.action,
      params.inputSummary ?? null,
      params.outputSummary ?? null,
      params.tokensUsed ?? 0,
      params.durationMs ?? 0,
    );
  }

  /** Возвращает pending-задачи для указанного репозитория в FIFO-порядке (старые первыми) */
  listPending(repoPath: string, limit?: number): TaskRecord[] {
    const sql = limit
      ? 'SELECT * FROM tasks WHERE status = ? AND repo_path = ? ORDER BY created_at ASC LIMIT ?'
      : 'SELECT * FROM tasks WHERE status = ? AND repo_path = ? ORDER BY created_at ASC';
    const stmt = this.db.prepare(sql);
    return (limit ? stmt.all('pending', repoPath, limit) : stmt.all('pending', repoPath)) as TaskRecord[];
  }

  /** Возвращает все логи задачи в хронологическом порядке */
  getLogs(taskId: number): TaskLogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at ASC');
    return stmt.all(taskId) as TaskLogRecord[];
  }
}
