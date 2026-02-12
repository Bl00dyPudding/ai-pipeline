const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

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

export function truncateToTokenBudget(text: string, budgetTokens: number): string {
  const maxChars = budgetTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n... [truncated]';
}

export const TOKEN_BUDGETS = {
  totalContext: 80_000,
  repoContext: 60_000,
  metadata: 5_000,
  fileTree: 5_000,
  keyFiles: 30_000,
  extraFiles: 20_000,
} as const;
