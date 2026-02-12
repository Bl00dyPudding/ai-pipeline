/**
 * Логирование в терминал — цветной вывод, спиннеры, форматирование.
 * Экспортирует singleton logger, который используется по всему проекту.
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

class Logger {
  /** Текущий активный спиннер (может быть только один одновременно) */
  private spinner: Ora | null = null;

  info(message: string): void {
    // Останавливаем спиннер перед выводом, иначе текст перемешается с анимацией
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

  /** Debug-логи выводятся только при наличии переменной окружения DEBUG */
  debug(message: string): void {
    if (process.env['DEBUG']) {
      console.log(chalk.gray('⊡'), chalk.gray(message));
    }
  }

  step(message: string): void {
    this.stopSpinner();
    console.log(chalk.cyan('→'), message);
  }

  /** Запускает анимированный спиннер; предыдущий останавливается автоматически */
  spin(message: string): Ora {
    this.stopSpinner();
    this.spinner = ora(message).start();
    return this.spinner;
  }

  /** Останавливает спиннер, если он запущен — вызывается перед каждым выводом */
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

  /** Выводит статус задачи с цветовой индикацией по текущей фазе */
  taskStatus(id: number, status: string, title: string): void {
    // Маппинг статусов на цвета: серый — ожидание, синий — кодинг,
    // жёлтый — ревью, голубой — тесты, зелёный — готово, красный — ошибка
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
