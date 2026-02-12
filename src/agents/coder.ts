import { BaseAgent } from './base.js';
import { CODER_SYSTEM_PROMPT, buildCoderUserPrompt } from './prompts.js';
import type { CoderOutput } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

export interface CoderCallResult {
  output: CoderOutput;
  tokensUsed: number;
  durationMs: number;
}

export class CoderAgent extends BaseAgent {
  constructor(apiKey: string, model: string) {
    super(apiKey, model, 'coder');
  }

  async generate(
    context: string,
    taskDescription: string,
    feedback?: string,
  ): Promise<CoderCallResult> {
    const userPrompt = buildCoderUserPrompt(context, taskDescription, feedback);
    const start = Date.now();

    const result = await this.call(CODER_SYSTEM_PROMPT, userPrompt);
    const durationMs = Date.now() - start;

    let output: CoderOutput;
    try {
      output = this.parseJSON<CoderOutput>(result.content);
    } catch (err) {
      logger.error('Failed to parse coder response as JSON');
      logger.debug(`Raw response: ${result.content.slice(0, 500)}`);
      throw new Error(`Coder returned invalid JSON: ${(err as Error).message}`);
    }

    // Validate output structure
    if (!output.files || !Array.isArray(output.files)) {
      throw new Error('Coder output missing "files" array');
    }
    if (!output.commitMessage) {
      throw new Error('Coder output missing "commitMessage"');
    }

    logger.debug(`Coder generated ${output.files.length} file change(s)`);

    return {
      output,
      tokensUsed: result.inputTokens + result.outputTokens,
      durationMs,
    };
  }
}
