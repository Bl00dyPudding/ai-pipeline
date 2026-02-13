#!/usr/bin/env node

/**
 * Точка входа CLI — определяет команды: run, add, process, tasks, show, retry.
 * Паттерн каждой команды: getConfig → getDatabase → действие → closeDatabase.
 * Коды завершения: 0 — успех (done), 1 — ошибка или failed.
 */

import { resolve } from 'node:path';
import { Command } from 'commander';
import { getConfig } from './config.js';
import { getDatabase, closeDatabase } from './db/sqlite.js';
import { TaskRepository } from './db/tasks.js';
import { PipelineRunner } from './pipeline/runner.js';
import { logger } from './utils/logger.js';
import type { TaskStatus } from './pipeline/types.js';

const program = new Command();

program
  .name('ai-pipeline')
  .description('Multi-agent AI coding pipeline: task → code → review → test → merge')
  .version('1.0.0');

/** Команда run — запускает задачу через полный цикл пайплайна */
program
  .command('run')
  .description('Run a task through the AI pipeline')
  .argument('<description>', 'Task description')
  .requiredOption('--repo <path>', 'Path to target repository')
  .option('--model <model>', 'Claude model to use')
  .option('--max-attempts <n>', 'Maximum coding attempts', parseInt)
  .option('--auto-merge', 'Automatically merge into main branch')
  .action(async (description: string, opts: { repo: string; model?: string; maxAttempts?: number; autoMerge?: boolean }) => {
    try {
      const config = getConfig({
        model: opts.model,
        maxAttempts: opts.maxAttempts,
        autoMerge: opts.autoMerge,
      });
      const db = getDatabase(config);
      const repo = new TaskRepository(db);
      const runner = new PipelineRunner(config, repo);

      const task = await runner.run(description, {
        repoPath: resolve(opts.repo),
        model: config.model,
        maxAttempts: config.maxAttempts,
        autoMerge: config.autoMerge,
      });

      if (task.status === 'done') {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/** Команда add — добавляет задачу в очередь без запуска пайплайна */
program
  .command('add')
  .description('Add a task to the queue without running it')
  .argument('<description>', 'Task description')
  .requiredOption('--repo <path>', 'Path to target repository')
  .option('--max-attempts <n>', 'Maximum coding attempts', parseInt)
  .option('--auto-merge', 'Automatically merge into main branch')
  .action((description: string, opts: { repo: string; maxAttempts?: number; autoMerge?: boolean }) => {
    try {
      const config = getConfig({
        maxAttempts: opts.maxAttempts,
        autoMerge: opts.autoMerge,
      });
      const db = getDatabase(config);
      const repo = new TaskRepository(db);

      const task = repo.create({
        title: description.slice(0, 100),
        description,
        repoPath: resolve(opts.repo),
        maxAttempts: config.maxAttempts,
      });

      logger.success(`Task #${task.id} added: ${task.title}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/** Команда process — последовательно выполняет pending-задачи из очереди */
program
  .command('process')
  .description('Process pending tasks from the queue')
  .requiredOption('--repo <path>', 'Path to target repository')
  .option('--model <model>', 'Claude model to use')
  .option('--max-attempts <n>', 'Maximum coding attempts', parseInt)
  .option('--auto-merge', 'Automatically merge into main branch')
  .option('--limit <n>', 'Maximum number of tasks to process', parseInt)
  .action(async (opts: { repo: string; model?: string; maxAttempts?: number; autoMerge?: boolean; limit?: number }) => {
    try {
      const config = getConfig({
        model: opts.model,
        maxAttempts: opts.maxAttempts,
        autoMerge: opts.autoMerge,
      });
      const db = getDatabase(config);
      const repo = new TaskRepository(db);
      const repoPath = resolve(opts.repo);

      const tasks = repo.listPending(repoPath, opts.limit);
      if (tasks.length === 0) {
        logger.info('No pending tasks found for this repository');
        return;
      }

      logger.header(`Processing ${tasks.length} pending task(s)`);

      const runner = new PipelineRunner(config, repo);
      let doneCount = 0;
      let failedCount = 0;

      for (const task of tasks) {
        const result = await runner.runExisting(task.id, {
          repoPath,
          model: config.model,
          maxAttempts: opts.maxAttempts ?? task.max_attempts,
          autoMerge: config.autoMerge,
        });

        if (result.status === 'done') {
          doneCount++;
        } else {
          failedCount++;
        }
      }

      logger.header('Summary');
      logger.info(`Done: ${doneCount}, Failed: ${failedCount}, Total: ${tasks.length}`);

      if (failedCount > 0) {
        process.exit(1);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/** Команда tasks — выводит список всех задач с фильтрацией по статусу */
program
  .command('tasks')
  .description('List all tasks')
  .option('--status <status>', 'Filter by status')
  .action((opts: { status?: string }) => {
    try {
      const config = getConfig();
      const db = getDatabase(config);
      const repo = new TaskRepository(db);

      const tasks = repo.list(opts.status as TaskStatus | undefined);

      if (tasks.length === 0) {
        logger.info('No tasks found');
        return;
      }

      logger.header('Tasks');
      for (const task of tasks) {
        logger.taskStatus(task.id, task.status, task.title);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/** Команда show — показывает детали задачи и логи всех агентов */
program
  .command('show')
  .description('Show task details and agent logs')
  .argument('<task-id>', 'Task ID')
  .action((taskId: string) => {
    try {
      const config = getConfig();
      const db = getDatabase(config);
      const repo = new TaskRepository(db);

      const task = repo.getById(parseInt(taskId, 10));
      if (!task) {
        logger.error(`Task #${taskId} not found`);
        process.exit(1);
      }

      logger.header(`Task #${task.id}`);
      console.log(`  Title:       ${task.title}`);
      console.log(`  Status:      ${task.status}`);
      console.log(`  Repository:  ${task.repo_path}`);
      console.log(`  Branch:      ${task.branch_name ?? '—'}`);
      console.log(`  Attempt:     ${task.attempt}/${task.max_attempts}`);
      console.log(`  Created:     ${task.created_at}`);
      console.log(`  Updated:     ${task.updated_at}`);

      if (task.error_message) {
        console.log(`  Error:       ${task.error_message}`);
      }
      if (task.reviewer_feedback) {
        console.log(`\n  Reviewer Feedback:\n${task.reviewer_feedback.split('\n').map(l => `    ${l}`).join('\n')}`);
      }

      const logs = repo.getLogs(task.id);
      if (logs.length > 0) {
        logger.header('Agent Logs');
        for (const log of logs) {
          console.log(`  [${log.created_at}] ${log.agent}/${log.action}`);
          if (log.input_summary) console.log(`    Input:  ${log.input_summary}`);
          if (log.output_summary) console.log(`    Output: ${log.output_summary}`);
          if (log.tokens_used) console.log(`    Tokens: ${log.tokens_used}`);
          if (log.duration_ms) console.log(`    Duration: ${log.duration_ms}ms`);
        }
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

/** Команда retry — повторяет упавшую задачу с возможностью изменить параметры */
program
  .command('retry')
  .description('Retry a failed task')
  .argument('<task-id>', 'Task ID')
  .option('--repo <path>', 'Override repository path')
  .option('--model <model>', 'Claude model to use')
  .option('--max-attempts <n>', 'Maximum coding attempts', parseInt)
  .option('--auto-merge', 'Automatically merge into main branch')
  .action(async (taskId: string, opts: { repo?: string; model?: string; maxAttempts?: number; autoMerge?: boolean }) => {
    try {
      const config = getConfig({
        model: opts.model,
        maxAttempts: opts.maxAttempts,
        autoMerge: opts.autoMerge,
      });
      const db = getDatabase(config);
      const repo = new TaskRepository(db);

      const task = repo.getById(parseInt(taskId, 10));
      if (!task) {
        logger.error(`Task #${taskId} not found`);
        process.exit(1);
      }

      const runner = new PipelineRunner(config, repo);
      const result = await runner.retry(task.id, {
        repoPath: opts.repo ? resolve(opts.repo) : task.repo_path,
        model: config.model,
        maxAttempts: config.maxAttempts,
        autoMerge: config.autoMerge,
      });

      if (result.status === 'done') {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

program.parse();
