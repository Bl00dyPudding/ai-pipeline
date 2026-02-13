/**
 * Агент-планировщик — анализирует кодовую базу и создаёт пошаговый план реализации.
 * Получает контекст репозитория + задачу (+ опционально фидбек), возвращает план для кодера.
 */

import { BaseAgent } from './base.js';
import { PLANNER_SYSTEM_PROMPT, buildPlannerUserPrompt } from './prompts.js';
import type { PlannerOutput } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

/** Результат вызова планировщика — план + метаинформация (токены, время) */
export interface PlannerCallResult {
  output: PlannerOutput;
  tokensUsed: number;
  durationMs: number;
}

export class PlannerAgent extends BaseAgent {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, 'planner');
  }

  /**
   * Создаёт план реализации задачи.
   * @param context — текстовый контекст репозитория (метаданные, дерево, ключевые файлы)
   * @param taskDescription — описание задачи от пользователя
   * @param feedback — фидбек от ревьюера/тестов с предыдущей попытки (если есть)
   * @returns структурированный план реализации
   */
  async plan(
    context: string,
    taskDescription: string,
    feedback?: string,
  ): Promise<PlannerCallResult> {
    const userPrompt = buildPlannerUserPrompt(context, taskDescription, feedback);
    const start = Date.now();

    const { parsed: output, tokensUsed } = await this.callWithRetry<PlannerOutput>(
      PLANNER_SYSTEM_PROMPT, userPrompt,
    );
    const durationMs = Date.now() - start;

    // Валидация структуры ответа
    if (!output.analysis) {
      throw new Error('Planner output missing "analysis"');
    }
    if (!output.steps || !Array.isArray(output.steps)) {
      throw new Error('Planner output missing "steps" array');
    }
    if (!output.strategy) {
      throw new Error('Planner output missing "strategy"');
    }
    if (!output.filesToModify || !Array.isArray(output.filesToModify)) {
      throw new Error('Planner output missing "filesToModify" array');
    }
    // Нормализация опциональных массивов — модель может не вернуть их
    if (!Array.isArray(output.patternsToFollow)) {
      output.patternsToFollow = [];
    }
    if (!Array.isArray(output.risks)) {
      output.risks = [];
    }

    logger.debug(`Planner created ${output.steps.length} step(s), ${output.filesToModify.length} file(s) to modify`);

    return { output, tokensUsed, durationMs };
  }
}
