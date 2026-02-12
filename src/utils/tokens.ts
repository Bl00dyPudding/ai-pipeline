/**
 * Управление бюджетом токенов для контекста.
 * Используется при сборе контекста репозитория — чтобы не превысить лимит промпта.
 */

/**
 * Грубая оценка: ~4 символа на один токен.
 * Точность не критична — нужно лишь уложиться в разумные пределы.
 */
const CHARS_PER_TOKEN = 4;

/** Оценивает количество токенов по длине текста */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Отбирает элементы из Map, пока суммарный размер укладывается в бюджет.
 * Элементы, не влезающие — отбрасываются (жадная стратегия, без перебора).
 */
export function fitWithinBudget(
  items: Map<string, string>,
  budgetTokens: number,
): Map<string, string> {
  const result = new Map<string, string>();
  let used = 0;

  for (const [path, content] of items) {
    const tokens = estimateTokens(content);
    if (used + tokens > budgetTokens) break;
    result.set(path, content);
    used += tokens;
  }

  return result;
}

/** Обрезает текст до указанного бюджета токенов, добавляя метку [truncated] */
export function truncateToTokenBudget(text: string, budgetTokens: number): string {
  const maxChars = budgetTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n... [truncated]';
}

/**
 * Бюджеты токенов по категориям контекста.
 * Общий бюджет 80k токенов распределён так, чтобы самые важные файлы
 * (ключевые + доп. по импортам) получили наибольшую долю.
 */
export const TOKEN_BUDGETS = {
  /** Общий лимит контекста, включая промпт и задачу */
  totalContext: 80_000,
  /** Суммарный лимит на весь контекст репозитория */
  repoContext: 60_000,
  /** Конфигурационные файлы: package.json, tsconfig и т.д. */
  metadata: 5_000,
  /** Текстовое дерево файлов репозитория */
  fileTree: 5_000,
  /** Ключевые файлы: точки входа, типы, файлы по ключевым словам задачи */
  keyFiles: 30_000,
  /** Дополнительные файлы, найденные по импортам из ключевых */
  extraFiles: 20_000,
} as const;
