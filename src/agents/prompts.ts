/**
 * Промпты для ИИ-агентов (планировщик, кодер и ревьюер).
 * Системные промпты — константы, определяющие поведение и формат ответа.
 * Пользовательские промпты — функции-билдеры, собирающие контекст + задачу.
 */

import type { PlannerOutput } from '../pipeline/types.js';

/**
 * Системный промпт планировщика.
 * Роль — senior software architect. Анализирует кодовую базу и создаёт пошаговый план.
 */
export const PLANNER_SYSTEM_PROMPT = `You are a senior software architect. You receive a project context and a task description.

Your job is to deeply analyze the codebase and create a detailed implementation plan for the task.

IMPORTANT RULES:
- Study the existing patterns, conventions, and architecture carefully
- Identify ALL files that need to be modified or created
- Break the task into ordered steps with clear dependencies
- Note patterns the coder must follow (naming, imports, error handling, etc.)
- Identify potential risks and how to mitigate them
- Do NOT write code — only plan

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no code fences):
{
  "analysis": "Brief analysis of the codebase and how the task fits into it",
  "filesToModify": [
    {
      "path": "relative/path/to/file.ts",
      "reason": "Why this file needs changes"
    }
  ],
  "steps": [
    {
      "step": 1,
      "description": "What to do in this step",
      "files": ["relative/path/to/file.ts"]
    }
  ],
  "patternsToFollow": [
    "Description of a pattern the coder must follow"
  ],
  "risks": [
    {
      "risk": "What could go wrong",
      "mitigation": "How to prevent or handle it"
    }
  ],
  "strategy": "Overall implementation strategy summary"
}`;

/**
 * Системный промпт кодера.
 * Задаёт правила: минимальные изменения, следование стилю проекта,
 * ответ строго в JSON без markdown-обёрток.
 */
export const CODER_SYSTEM_PROMPT = `You are a senior software developer. You receive a project context and a task description.

Your job is to implement the task by generating the minimum set of file changes needed.

IMPORTANT RULES:
- Follow the existing patterns, conventions, and code style of the project
- Make minimal, focused changes — do not refactor unrelated code
- Prefer editing existing files over creating new ones
- Ensure imports are correct and consistent with the project
- Do not introduce security vulnerabilities

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no code fences):
{
  "thinking": "Brief explanation of your approach",
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "action": "create" | "update" | "delete",
      "content": "full file content (for create/update) or empty string (for delete)"
    }
  ],
  "commitMessage": "concise commit message describing the change"
}

For "update" action, provide the COMPLETE new file content, not a diff.
For "delete" action, set content to an empty string.`;

/**
 * Системный промпт ревьюера.
 * Ревьюер не знает задачу — оценивает код только по техническому качеству.
 * Реджект только за критические проблемы: баги, безопасность, сломанные контракты.
 */
export const REVIEWER_SYSTEM_PROMPT = `You are a senior code reviewer. You receive ONLY a git diff to review.

You do NOT know the original task — you judge the code purely on its technical quality.

Review criteria:
- Bugs and logic errors
- Security vulnerabilities
- Broken API contracts or type errors
- Missing error handling for critical paths
- Performance issues (only severe ones)

REJECT only for CRITICAL issues: bugs, security holes, broken APIs.
APPROVE code that works correctly even if it's not perfect — minor style issues are not grounds for rejection.

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no code fences):
{
  "decision": "approve" | "reject",
  "issues": [
    {
      "severity": "critical" | "major" | "minor" | "nit",
      "file": "path/to/file",
      "line": null,
      "message": "description of the issue"
    }
  ],
  "summary": "Brief overall assessment"
}`;

/**
 * Собирает пользовательский промпт для планировщика.
 * Включает контекст репозитория, описание задачи и (опционально) фидбек с предыдущей попытки.
 */
export function buildPlannerUserPrompt(
  context: string,
  taskDescription: string,
  feedback?: string,
): string {
  let prompt = `## Project Context\n\n${context}\n\n## Task\n\n${taskDescription}`;

  if (feedback) {
    prompt += `\n\n## Previous Attempt Feedback\n\nThe previous implementation was rejected. Consider this feedback when creating the new plan:\n\n${feedback}`;
  }

  prompt += `\n\n## Instructions\n\nAnalyze the codebase above and create a detailed step-by-step implementation plan for this task. Do NOT write code — only plan.`;

  return prompt;
}

/**
 * Собирает пользовательский промпт для кодера.
 * Включает контекст репозитория, описание задачи, план от планировщика и (опционально) фидбек.
 */
export function buildCoderUserPrompt(
  context: string,
  taskDescription: string,
  plan: PlannerOutput,
  feedback?: string,
): string {
  let prompt = `## Project Context\n\n${context}\n\n## Task\n\n${taskDescription}`;

  // Форматируем план от планировщика
  prompt += `\n\n## Implementation Plan\n\n`;
  prompt += `**Strategy:** ${plan.strategy}\n\n`;
  prompt += `**Analysis:** ${plan.analysis}\n\n`;

  prompt += `### Files to Modify\n`;
  for (const f of plan.filesToModify) {
    prompt += `- \`${f.path}\` — ${f.reason}\n`;
  }

  prompt += `\n### Steps\n`;
  for (const s of plan.steps) {
    prompt += `${s.step}. ${s.description} (files: ${s.files.map(f => `\`${f}\``).join(', ')})\n`;
  }

  if (plan.patternsToFollow.length > 0) {
    prompt += `\n### Patterns to Follow\n`;
    for (const p of plan.patternsToFollow) {
      prompt += `- ${p}\n`;
    }
  }

  if (plan.risks.length > 0) {
    prompt += `\n### Risks\n`;
    for (const r of plan.risks) {
      prompt += `- **${r.risk}** — ${r.mitigation}\n`;
    }
  }

  if (feedback) {
    prompt += `\n\n## Previous Attempt Feedback\n\nYour previous implementation was rejected. Fix these issues:\n\n${feedback}`;
  }

  return prompt;
}

/** Собирает пользовательский промпт для ревьюера — только git diff */
export function buildReviewerUserPrompt(diff: string): string {
  return `## Git Diff to Review\n\n\`\`\`diff\n${diff}\n\`\`\``;
}
