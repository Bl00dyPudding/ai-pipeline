/**
 * Агент-ревьюер — проводит автоматическое код-ревью по git diff.
 * Не знает задачу — оценивает код исключительно по техническому качеству.
 */

import { BaseAgent } from './base.js';
import { REVIEWER_SYSTEM_PROMPT, buildReviewerUserPrompt } from './prompts.js';
import type { ReviewerOutput } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

/** Результат вызова ревьюера — решение + метаинформация (токены, время) */
export interface ReviewerCallResult {
  output: ReviewerOutput;
  tokensUsed: number;
  durationMs: number;
}

export class ReviewerAgent extends BaseAgent {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, 'reviewer');
  }

  /**
   * Проводит ревью git diff.
   * @param diff — текст diff между веткой задачи и main
   * @returns решение (approve/reject) со списком замечаний
   */
  async review(diff: string): Promise<ReviewerCallResult> {
    const userPrompt = buildReviewerUserPrompt(diff);
    const start = Date.now();

    const { parsed: output, tokensUsed } = await this.callWithRetry<ReviewerOutput>(
      REVIEWER_SYSTEM_PROMPT, userPrompt,
    );
    const durationMs = Date.now() - start;

    // Валидация: decision должен быть строго approve или reject
    if (!output.decision || !['approve', 'reject'].includes(output.decision)) {
      throw new Error(`Reviewer returned invalid decision: ${output.decision}`);
    }

    const criticalCount = output.issues.filter(i => i.severity === 'critical').length;
    logger.debug(
      `Reviewer decision: ${output.decision} (${output.issues.length} issues, ${criticalCount} critical)`
    );

    return { output, tokensUsed, durationMs };
  }
}
