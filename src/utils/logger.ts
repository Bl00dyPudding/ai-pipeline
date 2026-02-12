import chalk from 'chalk';
import ora, { type Ora } from 'ora';

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

class Logger {
  private spinner: Ora | null = null;

  info(message: string): void {
    this.stopSpinner();
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string): void {
    this.stopSpinner();
    console.log(chalk.green('✔'), message);
  }

  warn(message: string): void {
    this.stopSpinner();
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string): void {
    this.stopSpinner();
    console.log(chalk.red('✖'), message);
  }

  debug(message: string): void {
    if (process.env['DEBUG']) {
      console.log(chalk.gray('⊡'), chalk.gray(message));
    }
  }

  step(message: string): void {
    this.stopSpinner();
    console.log(chalk.cyan('→'), message);
  }

  spin(message: string): Ora {
    this.stopSpinner();
    this.spinner = ora(message).start();
    return this.spinner;
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  table(data: Record<string, unknown>[]): void {
    console.table(data);
  }

  divider(): void {
    console.log(chalk.gray('─'.repeat(60)));
  }

  header(title: string): void {
    this.divider();
    console.log(chalk.bold.white(` ${title}`));
    this.divider();
  }

  taskStatus(id: number, status: string, title: string): void {
    const statusColors: Record<string, (s: string) => string> = {
      pending: chalk.gray,
      coding: chalk.blue,
      reviewing: chalk.yellow,
      testing: chalk.cyan,
      done: chalk.green,
      failed: chalk.red,
    };
    const colorFn = statusColors[status] ?? chalk.white;
    console.log(
      ` ${chalk.gray(`#${id}`)} ${colorFn(`[${status}]`)} ${title}`
    );
  }
}

export const logger = new Logger();
