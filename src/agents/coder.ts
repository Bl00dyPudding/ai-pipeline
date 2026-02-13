/**
 * Агент-кодер — генерирует изменения файлов по описанию задачи.
 * Получает контекст репозитория + задачу (+ опционально фидбек), возвращает список файлов для изменения.
 */

import { BaseAgent } from './base.js';
import { CODER_SYSTEM_PROMPT, buildCoderUserPrompt } from './prompts.js';
import type { CoderOutput, PlannerOutput } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

/** Результат вызова кодера — ответ + метаинформация (токены, время) */
export interface CoderCallResult {
  output: CoderOutput;
  tokensUsed: number;
  durationMs: number;
}

export class CoderAgent extends BaseAgent {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, 'coder');
  }

  /**
   * Генерирует изменения файлов для выполнения задачи.
   * @param context — текстовый контекст репозитория (метаданные, дерево, ключевые файлы)
   * @param taskDescription — описание задачи от пользователя
   * @param plan — план реализации от планировщика
   * @param feedback — фидбек от ревьюера/тестов с предыдущей попытки (если есть)
   * @returns структурированный ответ с файлами для изменения
   */
  async generate(
    context: string,
    taskDescription: string,
    plan: PlannerOutput,
    feedback?: string,
  ): Promise<CoderCallResult> {
    const userPrompt = buildCoderUserPrompt(context, taskDescription, plan, feedback);
    const start = Date.now();

    const { parsed: output, tokensUsed } = await this.callWithRetry<CoderOutput>(
      CODER_SYSTEM_PROMPT, userPrompt,
    );
    const durationMs = Date.now() - start;

    // Валидация структуры ответа — модель могла вернуть JSON неправильного формата
    if (!output.files || !Array.isArray(output.files)) {
      throw new Error('Coder output missing "files" array');
    }
    if (!output.commitMessage) {
      throw new Error('Coder output missing "commitMessage"');
    }

    logger.debug(`Coder generated ${output.files.length} file change(s)`);

    return { output, tokensUsed, durationMs };
  }
}
