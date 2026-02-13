/**
 * Центральное хранилище типов проекта.
 * Все интерфейсы и типы определяются здесь, чтобы избежать циклических зависимостей
 * и держать типизацию в одном месте.
 */

/** Статусы задачи — соответствуют стейт-машине пайплайна */
export type TaskStatus = 'pending' | 'coding' | 'reviewing' | 'testing' | 'done' | 'failed';

/** Роли агентов — каждый агент пишет логи под своей ролью */
export type AgentRole = 'coder' | 'reviewer' | 'tester' | 'pipeline';

/** Запись задачи в БД — соответствует таблице tasks */
export interface TaskRecord {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  /** Абсолютный путь к целевому репозиторию */
  repo_path: string;
  /** Текущая ветка вида ai/task-{id}-attempt-{n}, null до первой попытки */
  branch_name: string | null;
  /** Номер текущей попытки (начиная с 1) */
  attempt: number;
  max_attempts: number;
  /** Последний фидбек от ревьюера или результат тестов — передаётся кодеру при повторе */
  reviewer_feedback: string | null;
  /** Сообщение об ошибке при статусе failed */
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Запись лога агента — соответствует таблице task_logs */
export interface TaskLogRecord {
  id: number;
  task_id: number;
  agent: AgentRole;
  action: string;
  input_summary: string | null;
  output_summary: string | null;
  tokens_used: number;
  duration_ms: number;
  created_at: string;
}

/** Описание изменения одного файла — часть ответа кодера */
export interface FileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  /** Полное содержимое файла (для create/update) или пустая строка (для delete) */
  content: string;
}

/** Структурированный ответ агента-кодера */
export interface CoderOutput {
  /** Рассуждения агента о подходе к решению */
  thinking: string;
  files: FileChange[];
  commitMessage: string;
}

/** Замечание ревьюера к конкретному месту в коде */
export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'nit';
  file: string;
  /** Номер строки или null, если замечание к файлу в целом */
  line: number | null;
  message: string;
}

/** Структурированный ответ агента-ревьюера */
export interface ReviewerOutput {
  decision: 'approve' | 'reject';
  issues: ReviewIssue[];
  summary: string;
}

/** Результат запуска линтера и тестов */
export interface TestResult {
  passed: boolean;
  lintOutput: string;
  testOutput: string;
  summary: string;
}

/** Опции запуска пайплайна — передаются из CLI */
export interface PipelineOptions {
  repoPath: string;
  model: string;
  maxAttempts: number;
  autoMerge: boolean;
}

/** SSE-событие: смена статуса задачи */
export interface SSETaskStatusEvent {
  taskId: number;
  status: TaskStatus;
  timestamp: string;
}

/** SSE-событие: новый лог агента */
export interface SSETaskLogEvent {
  taskId: number;
  log: Omit<TaskLogRecord, 'id' | 'task_id'>;
}

/** SSE-событие: ошибка задачи */
export interface SSETaskErrorEvent {
  taskId: number;
  error: string;
}

/** SSE-событие: фидбек ревьюера */
export interface SSETaskFeedbackEvent {
  taskId: number;
  feedback: string;
}

/** Собранный контекст репозитория — передаётся в промпт кодера */
export interface RepoContext {
  /** Содержимое конфигурационных файлов (package.json, tsconfig и т.д.) */
  metadata: string;
  /** Дерево файлов репозитория (текстовое представление) */
  fileTree: string;
  /** Ключевые файлы: точки входа, типы, файлы, связанные с задачей */
  keyFiles: Map<string, string>;
  /** Дополнительные файлы, найденные по импортам из ключевых */
  extraFiles: Map<string, string>;
  /** Примерное кол-во токенов во всём контексте */
  totalTokens: number;
}
