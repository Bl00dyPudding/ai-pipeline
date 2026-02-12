import Anthropic from '@anthropic-ai/sdk';
import type { AgentRole } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

export interface AgentCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export class BaseAgent {
  protected client: Anthropic;
  protected model: string;
  protected role: AgentRole;

  constructor(apiKey: string, model: string, role: AgentRole) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.role = role;
  }

  protected async call(systemPrompt: string, userPrompt: string): Promise<AgentCallResult> {
    logger.debug(`[${this.role}] Calling Claude API (model: ${this.model})...`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.text ?? '';

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    logger.debug(`[${this.role}] Tokens: ${inputTokens} in / ${outputTokens} out`);

    return { content, inputTokens, outputTokens };
  }

  protected parseJSON<T>(raw: string): T {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(cleaned) as T;
  }
}
