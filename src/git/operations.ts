/**
 * Git-операции над целевым репозиторием.
 * Обёртка над simple-git для создания веток, коммитов, диффов и мержа.
 */

import { simpleGit, type SimpleGit } from 'simple-git';
import { logger } from '../utils/logger.js';

export class GitOperations {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /** Проверяет, что рабочее дерево чистое — иначе пайплайн может затереть незакоммиченные изменения */
  async ensureClean(): Promise<void> {
    const status = await this.git.status();
    if (!status.isClean()) {
      throw new Error(`Repository at ${this.repoPath} has uncommitted changes. Please commit or stash them first.`);
    }
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  }

  /**
   * Определяет основную ветку репозитория.
   * Цепочка фолбеков: origin/HEAD → main → master → текущая ветка.
   * origin/HEAD может быть не настроен (клон без --set-upstream), поэтому нужны фолбеки.
   */
  async getDefaultBranch(): Promise<string> {
    try {
      const result = await this.git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
      return result.trim().replace('origin/', '');
    } catch {
      const branches = await this.git.branchLocal();
      if (branches.all.includes('main')) return 'main';
      if (branches.all.includes('master')) return 'master';
      return branches.current;
    }
  }

  /**
   * Создаёт чистую ветку от main для новой попытки.
   * Многошаговый процесс: переключиться на main → подтянуть изменения →
   * удалить старую ветку (если осталась от предыдущей попытки) → создать новую.
   */
  async createBranch(branchName: string): Promise<void> {
    const defaultBranch = await this.getDefaultBranch();

    await this.git.checkout(defaultBranch);
    // Pull с graceful catch — может не быть remote или сети
    await this.git.pull().catch(() => {
      logger.debug('Pull failed (may be offline or no remote), continuing...');
    });

    // Удаляем ветку, если она осталась от предыдущего запуска
    const branches = await this.git.branchLocal();
    if (branches.all.includes(branchName)) {
      await this.git.deleteLocalBranch(branchName, true);
    }

    await this.git.checkoutLocalBranch(branchName);
    logger.debug(`Created and checked out branch: ${branchName}`);
  }

  async commitAll(message: string): Promise<string> {
    await this.git.add('.');
    const result = await this.git.commit(message);
    return result.commit;
  }

  /**
   * Получает diff между текущей веткой и main.
   * Синтаксис triple-dot (base...HEAD) показывает изменения с момента ответвления,
   * игнорируя коммиты, добавленные в main после создания ветки.
   */
  async getDiff(baseBranch?: string): Promise<string> {
    const base = baseBranch ?? await this.getDefaultBranch();
    const diff = await this.git.diff([`${base}...HEAD`]);
    return diff;
  }

  /**
   * Мержит ветку в main.
   * Флаг --no-ff создаёт merge-коммит даже при fast-forward,
   * сохраняя историю отдельной ветки в графе коммитов.
   */
  async mergeBranch(branchName: string): Promise<void> {
    const defaultBranch = await this.getDefaultBranch();
    await this.git.checkout(defaultBranch);
    await this.git.merge([branchName, '--no-ff', '-m', `Merge ${branchName}`]);
    logger.success(`Merged ${branchName} into ${defaultBranch}`);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
  }

  async getLastCommitHash(): Promise<string> {
    const log = await this.git.log({ maxCount: 1 });
    return log.latest?.hash ?? '';
  }
}
