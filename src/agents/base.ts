/**
 * Базовый класс для всех ИИ-агентов.
 * Инкапсулирует взаимодействие с Claude API: отправку запроса, парсинг JSON-ответа.
 * Конкретные агенты (кодер, ревьюер) наследуют от BaseAgent.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentRole } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

/** Результат вызова Claude API — текст ответа + использованные токены */
export interface AgentCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
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

  /**
   * Отправляет запрос к Claude API.
   * Принимает системный и пользовательский промпты, возвращает текст ответа и статистику токенов.
   * max_tokens = 16384 — достаточно для генерации нескольких файлов.
   */
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

    return { content, inputTokens, outputTokens, stopReason: response.stop_reason };
  }

  /**
   * Обёртка над call() + parseJSON() с ретраем при ошибке парсинга.
   * Если stop_reason === 'max_tokens' — ответ обрезан лимитом, повтор не поможет.
   * Если stop_reason === 'end_turn' и парсинг упал — ретраим (транзиентная ошибка модели).
   * Суммирует токены по всем попыткам.
   */
  protected async callWithRetry<T>(
    systemPrompt: string,
    userPrompt: string,
    maxRetries: number = 2,
  ): Promise<{ parsed: T; tokensUsed: number }> {
    let totalTokens = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.call(systemPrompt, userPrompt);
      totalTokens += result.inputTokens + result.outputTokens;

      try {
        const parsed = this.parseJSON<T>(result.content);
        return { parsed, tokensUsed: totalTokens };
      } catch (err) {
        if (result.stopReason === 'max_tokens') {
          logger.error(`[${this.role}] Response truncated (max_tokens), retry won't help`);
          logger.debug(`Raw response: ${result.content.slice(0, 500)}`);
          throw new Error(`${this.role} returned truncated response (max_tokens): ${(err as Error).message}`);
        }

        if (attempt < maxRetries) {
          logger.warn(`[${this.role}] JSON parse failed (attempt ${attempt}/${maxRetries}), retrying...`);
          logger.debug(`Raw response: ${result.content.slice(0, 500)}`);
          continue;
        }

        logger.error(`[${this.role}] JSON parse failed after ${maxRetries} attempts`);
        logger.debug(`Raw response: ${result.content.slice(0, 500)}`);
        throw new Error(`${this.role} returned invalid JSON after ${maxRetries} attempts: ${(err as Error).message}`);
      }
    }

    // Unreachable, но TypeScript требует return
    throw new Error(`${this.role} callWithRetry: unexpected end of loop`);
  }

  /**
   * Парсит JSON из ответа модели.
   * Снимает markdown code fences (```json ... ```), если модель их добавила,
   * хотя промпт требует чистый JSON — это защита от нестабильного поведения.
   */
  protected parseJSON<T>(raw: string): T {
    let cleaned = raw.trim();
    // Снимаем открывающий и закрывающий fence независимо —
    // модель может оборвать ответ без закрывающего ```
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\n?```\s*$/, '');
    }
    return JSON.parse(cleaned) as T;
  }
}
