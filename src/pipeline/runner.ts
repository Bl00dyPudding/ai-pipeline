/**
 * Оркестратор пайплайна — управляет полным циклом: задача → код → ревью → тесты → мерж.
 * Реализует стейт-машину с петлёй обратной связи: при реджекте или провале тестов
 * кодер получает фидбек и пробует заново (до maxAttempts попыток).
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { AppConfig } from '../config.js';
import type { PipelineOptions, TaskRecord } from './types.js';
import { TaskRepository } from '../db/tasks.js';
import { GitOperations } from '../git/operations.js';
import { CoderAgent } from '../agents/coder.js';
import { ReviewerAgent } from '../agents/reviewer.js';
import { gatherContext, formatContextForPrompt } from '../context/gatherer.js';
import { runTests } from '../test-runner/executor.js';
import { logger } from '../utils/logger.js';

export class PipelineRunner {
  private config: AppConfig;
  private repo: TaskRepository;
  private coder: CoderAgent;
  private reviewer: ReviewerAgent;

  constructor(config: AppConfig, repo: TaskRepository) {
    this.config = config;
    this.repo = repo;
    this.coder = new CoderAgent(config.anthropicApiKey, config.model);
    this.reviewer = new ReviewerAgent(config.anthropicApiKey, config.model);
  }

  /**
   * Запускает полный цикл пайплайна.
   * Алгоритм: создать задачу → для каждой попытки (1..maxAttempts):
   *   1. Кодинг: собрать контекст → сгенерировать код → закоммитить в ветку
   *   2. Ревью: получить diff → отправить ревьюеру → при реджекте — к шагу 1 с фидбеком
   *   3. Тесты: запустить lint + test → при провале — к шагу 1 с выводом ошибок
   *   4. Мерж: (если autoMerge) влить ветку в main
   */
  async run(taskDescription: string, options: PipelineOptions): Promise<TaskRecord> {
    // Создаём задачу в БД
    const task = this.repo.create({
      title: taskDescription.slice(0, 100),
      description: taskDescription,
      repoPath: options.repoPath,
      maxAttempts: options.maxAttempts,
    });

    logger.header(`Task #${task.id}: ${task.title}`);

    try {
      const git = new GitOperations(options.repoPath);
      await git.ensureClean();

      /** Фидбек от ревьюера/тестов — передаётся кодеру при следующей попытке */
      let feedback: string | undefined;

      for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        // Каждая попытка — чистая ветка от main
        const branchName = `ai/task-${task.id}-attempt-${attempt}`;
        this.repo.updateAttempt(task.id, attempt, branchName);

        logger.info(`Attempt ${attempt}/${options.maxAttempts}`);

        // === ФАЗА КОДИНГА ===
        this.repo.updateStatus(task.id, 'coding');
        const spinner = logger.spin('Generating code...');

        const context = await gatherContext(options.repoPath, taskDescription);
        const contextText = formatContextForPrompt(context);

        const coderResult = await this.coder.generate(contextText, taskDescription, feedback);
        spinner.succeed('Code generated');

        if (coderResult.output.thinking) {
          logger.step(`Coder: ${coderResult.output.thinking}`);
        }

        this.repo.addLog({
          taskId: task.id,
          agent: 'coder',
          action: 'generate',
          inputSummary: `Task: ${taskDescription.slice(0, 200)}${feedback ? ' + feedback' : ''}`,
          outputSummary: `${coderResult.output.files.length} files, commit: ${coderResult.output.commitMessage}`,
          tokensUsed: coderResult.tokensUsed,
          durationMs: coderResult.durationMs,
        });

        // Создаём ветку от main и применяем изменения
        await git.createBranch(branchName);
        await this.applyFileChanges(options.repoPath, coderResult.output.files);
        await git.commitAll(coderResult.output.commitMessage);
        logger.success(`Committed to branch: ${branchName}`);

        // === ФАЗА РЕВЬЮ ===
        this.repo.updateStatus(task.id, 'reviewing');
        const reviewSpinner = logger.spin('Reviewing code...');

        const diff = await git.getDiff();
        const reviewResult = await this.reviewer.review(diff);
        reviewSpinner.succeed(`Review: ${reviewResult.output.decision}`);

        this.repo.addLog({
          taskId: task.id,
          agent: 'reviewer',
          action: 'review',
          inputSummary: `Diff: ${diff.length} chars`,
          outputSummary: `${reviewResult.output.decision}: ${reviewResult.output.summary}`,
          tokensUsed: reviewResult.tokensUsed,
          durationMs: reviewResult.durationMs,
        });

        // При реджекте — сохраняем фидбек и переходим к следующей попытке
        if (reviewResult.output.decision === 'reject') {
          feedback = this.formatReviewFeedback(reviewResult.output);
          this.repo.setReviewerFeedback(task.id, feedback);
          logger.warn(`Rejected: ${reviewResult.output.summary}`);
          for (const issue of reviewResult.output.issues) {
            logger.info(`  [${issue.severity}] ${issue.file}: ${issue.message}`);
          }
          continue;
        }

        // === ФАЗА ТЕСТИРОВАНИЯ ===
        this.repo.updateStatus(task.id, 'testing');
        const testSpinner = logger.spin('Running tests...');

        const testResult = await runTests(options.repoPath);
        if (testResult.passed) {
          testSpinner.succeed(`Tests: ${testResult.summary}`);
        } else {
          testSpinner.fail(`Tests: ${testResult.summary}`);
        }

        this.repo.addLog({
          taskId: task.id,
          agent: 'tester',
          action: 'test',
          inputSummary: `Branch: ${branchName}`,
          outputSummary: testResult.summary,
          tokensUsed: 0,
          durationMs: 0,
        });

        // При провале тестов — сохраняем вывод ошибок как фидбек для кодера
        if (!testResult.passed) {
          feedback = `Tests/lint failed:\n\nLint output:\n${testResult.lintOutput}\n\nTest output:\n${testResult.testOutput}`;
          this.repo.setReviewerFeedback(task.id, feedback);
          logger.warn(`Tests failed — will retry`);
          continue;
        }

        // === ФАЗА МЕРЖА ===
        if (options.autoMerge) {
          await git.mergeBranch(branchName);
          logger.success(`Merged ${branchName} into main`);
        } else {
          logger.info(`Branch ${branchName} ready for manual merge`);
        }

        this.repo.updateStatus(task.id, 'done');
        this.repo.addLog({
          taskId: task.id,
          agent: 'pipeline',
          action: 'complete',
          outputSummary: options.autoMerge ? 'Merged to main' : `Branch ready: ${branchName}`,
          tokensUsed: 0,
          durationMs: 0,
        });

        logger.success(`Task #${task.id} completed successfully!`);
        return this.repo.getById(task.id)!;
      }

      // Все попытки исчерпаны — задача переходит в статус failed
      this.repo.setError(task.id, `Failed after ${options.maxAttempts} attempts`);
      logger.error(`Task #${task.id} failed after ${options.maxAttempts} attempts`);
      return this.repo.getById(task.id)!;

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.repo.setError(task.id, message);
      logger.error(`Task #${task.id} failed: ${message}`);
      return this.repo.getById(task.id)!;
    }
  }

  /** Повторяет упавшую задачу — сбрасывает статус и запускает пайплайн заново */
  async retry(taskId: number, options: PipelineOptions): Promise<TaskRecord> {
    const task = this.repo.getById(taskId);
    if (!task) throw new Error(`Task #${taskId} not found`);
    if (task.status !== 'failed') throw new Error(`Task #${taskId} is not in failed state`);

    this.repo.updateStatus(taskId, 'pending');
    return this.run(task.description, options);
  }

  /**
   * Применяет изменения файлов от кодера к рабочему дереву.
   * create/update — создаёт директории (если нужно) и записывает файл.
   * delete — удаляет файл.
   */
  private async applyFileChanges(
    repoPath: string,
    files: Array<{ path: string; action: string; content: string }>,
  ): Promise<void> {
    for (const file of files) {
      const fullPath = join(repoPath, file.path);

      if (file.action === 'delete') {
        await rm(fullPath, { force: true });
        logger.debug(`Deleted: ${file.path}`);
      } else {
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, file.content, 'utf-8');
        logger.debug(`${file.action === 'create' ? 'Created' : 'Updated'}: ${file.path}`);
      }
    }
  }

  /** Форматирует фидбек ревьюера в текст для передачи кодеру при повторной попытке */
  private formatReviewFeedback(review: { issues: Array<{ severity: string; file: string; line: number | null; message: string }>; summary: string }): string {
    const lines = [`Review summary: ${review.summary}`, '', 'Issues:'];
    for (const issue of review.issues) {
      const loc = issue.line ? `:${issue.line}` : '';
      lines.push(`- [${issue.severity}] ${issue.file}${loc}: ${issue.message}`);
    }
    return lines.join('\n');
  }
}
