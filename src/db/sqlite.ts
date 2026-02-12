/**
 * Инициализация SQLite-базы данных.
 * Используется singleton-паттерн: одно соединение на весь процесс,
 * т.к. better-sqlite3 синхронный и не требует пула соединений.
 */

import Database from 'better-sqlite3';
import { type AppConfig } from '../config.js';

/** Единственный экземпляр соединения с БД */
let db: Database.Database | null = null;

/**
 * Возвращает соединение с БД (создаёт при первом вызове).
 * Включает WAL-режим для лучшей производительности при параллельном чтении/записи
 * и foreign_keys для обеспечения ссылочной целостности (каскадное удаление логов).
 */
export function getDatabase(config: AppConfig): Database.Database {
  if (db) return db;

  db = new Database(config.dbPath);
  // WAL (Write-Ahead Logging) — ускоряет запись, позволяет параллельное чтение
  db.pragma('journal_mode = WAL');
  // Включаем проверку внешних ключей (по умолчанию в SQLite выключена)
  db.pragma('foreign_keys = ON');

  createTables(db);

  return db;
}

/** Создаёт таблицы и индексы, если они ещё не существуют */
function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      repo_path TEXT NOT NULL,
      branch_name TEXT,
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      reviewer_feedback TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      input_summary TEXT,
      output_summary TEXT,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
  `);
}

/** Закрывает соединение с БД — вызывается при завершении CLI */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
