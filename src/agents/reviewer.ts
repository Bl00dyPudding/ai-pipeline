import { BaseAgent } from './base.js';
import { REVIEWER_SYSTEM_PROMPT, buildReviewerUserPrompt } from './prompts.js';
import type { ReviewerOutput } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

export interface ReviewerCallResult {
  output: ReviewerOutput;
  tokensUsed: number;
  durationMs: number;
}

export class ReviewerAgent extends BaseAgent {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, 'reviewer');
  }

  async review(diff: string): Promise<ReviewerCallResult> {
    const userPrompt = buildReviewerUserPrompt(diff);
    const start = Date.now();

    const result = await this.call(REVIEWER_SYSTEM_PROMPT, userPrompt);
    const durationMs = Date.now() - start;

    let output: ReviewerOutput;
    try {
      output = this.parseJSON<ReviewerOutput>(result.content);
    } catch (err) {
      logger.error('Failed to parse reviewer response as JSON');
      logger.debug(`Raw response: ${result.content.slice(0, 500)}`);
      throw new Error(`Reviewer returned invalid JSON: ${(err as Error).message}`);
    }

    // Validate output structure
    if (!output.decision || !['approve', 'reject'].includes(output.decision)) {
      throw new Error(`Reviewer returned invalid decision: ${output.decision}`);
    }

    const criticalCount = output.issues.filter(i => i.severity === 'critical').length;
    logger.debug(
      `Reviewer decision: ${output.decision} (${output.issues.length} issues, ${criticalCount} critical)`
    );

    return {
      output,
      tokensUsed: result.inputTokens + result.outputTokens,
      durationMs,
    };
  }
}
