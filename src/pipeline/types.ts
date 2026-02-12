export type TaskStatus = 'pending' | 'coding' | 'reviewing' | 'testing' | 'done' | 'failed';

export type AgentRole = 'coder' | 'reviewer' | 'tester' | 'pipeline';

export interface TaskRecord {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  repo_path: string;
  branch_name: string | null;
  attempt: number;
  max_attempts: number;
  reviewer_feedback: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface FileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  content: string;
}

export interface CoderOutput {
  thinking: string;
  files: FileChange[];
  commitMessage: string;
}

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'nit';
  file: string;
  line: number | null;
  message: string;
}

export interface ReviewerOutput {
  decision: 'approve' | 'reject';
  issues: ReviewIssue[];
  summary: string;
}

export interface TestResult {
  passed: boolean;
  lintOutput: string;
  testOutput: string;
  summary: string;
}

export interface PipelineOptions {
  repoPath: string;
  model: string;
  maxAttempts: number;
  autoMerge: boolean;
}

export interface RepoContext {
  metadata: string;
  fileTree: string;
  keyFiles: Map<string, string>;
  extraFiles: Map<string, string>;
  totalTokens: number;
}
