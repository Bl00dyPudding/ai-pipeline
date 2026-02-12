import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { TestResult } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

const EXEC_TIMEOUT = 120_000; // 2 minutes

function runCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: EXEC_TIMEOUT, shell: true }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? '',
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(repoPath: string): Promise<'npm' | 'yarn' | 'pnpm'> {
  if (await fileExists(join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(repoPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

async function hasScript(repoPath: string, scriptName: string): Promise<boolean> {
  try {
    const pkgPath = join(repoPath, 'package.json');
    const { readFile } = await import('node:fs/promises');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    return !!pkg.scripts?.[scriptName];
  } catch {
    return false;
  }
}

export async function runTests(repoPath: string): Promise<TestResult> {
  const pm = await detectPackageManager(repoPath);

  let lintOutput = '';
  let lintPassed = true;
  let testOutput = '';
  let testPassed = true;

  // Run lint
  if (await hasScript(repoPath, 'lint')) {
    logger.debug('Running lint...');
    const lint = await runCommand(pm, ['run', 'lint'], repoPath);
    lintOutput = (lint.stdout + '\n' + lint.stderr).trim();
    lintPassed = lint.exitCode === 0;
    logger.debug(`Lint ${lintPassed ? 'passed' : 'failed'} (exit code: ${lint.exitCode})`);
  } else {
    lintOutput = 'No lint script found — skipped';
    logger.debug('No lint script found, skipping');
  }

  // Run tests
  if (await hasScript(repoPath, 'test')) {
    logger.debug('Running tests...');
    const test = await runCommand(pm, ['run', 'test'], repoPath);
    testOutput = (test.stdout + '\n' + test.stderr).trim();
    testPassed = test.exitCode === 0;
    logger.debug(`Tests ${testPassed ? 'passed' : 'failed'} (exit code: ${test.exitCode})`);
  } else {
    testOutput = 'No test script found — skipped';
    logger.debug('No test script found, skipping');
  }

  const passed = lintPassed && testPassed;
  const summaryParts: string[] = [];
  if (!lintPassed) summaryParts.push('Lint failed');
  if (!testPassed) summaryParts.push('Tests failed');
  const summary = passed ? 'All checks passed' : summaryParts.join('; ');

  return { passed, lintOutput, testOutput, summary };
}
