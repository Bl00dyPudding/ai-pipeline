# CLAUDE.md — Контекст для AI-ассистентов

Этот файл содержит всю необходимую информацию для работы с проектом `ai-pipeline`. Если ты AI-ассистент (Claude Code, Cursor, Copilot и т.д.) — прочитай этот файл перед тем, как вносить изменения.

---

## Что это за проект

**ai-pipeline** — CLI-утилита на Node.js/TypeScript, реализующая мультиагентный конвейер разработки. Три ИИ-агента (кодер, ревьюер, тест-раннер) автоматизируют цикл: задача → код → ревью → тесты → мерж. Целевые проекты — JS/TS/Vue/Nuxt.

**Основной сценарий использования:**
```bash
ai-pipeline run "добавь валидацию формы" --repo ~/my-app
```

Пайплайн создаёт ветку в целевом репозитории, генерирует код через Claude API, проводит автоматическое код-ревью, запускает lint/тесты и (опционально) мержит в main.

---

## Технологический стек и ограничения

- **TypeScript** — ESM (`"type": "module"`), strict mode, target ES2022, module Node16
- **Все импорты с расширением `.js`** — обязательно для ESM (`import { foo } from './bar.js'`)
- **Node.js >= 18** — используются `node:fs/promises`, `node:path`, `node:child_process`
- **Синхронный SQLite** — `better-sqlite3` (НЕ async, все SQL-операции синхронные)
- **Claude API** — `@anthropic-ai/sdk`, модель по умолчанию `claude-sonnet-4-20250514`

---

## Структура проекта

```
ai-pipeline/
├── package.json              # type: "module", bin: ai-pipeline
├── tsconfig.json             # ESM strict, outDir: dist, rootDir: src
├── .env.example              # Шаблон переменных окружения
├── .gitignore                # node_modules, dist, *.db, .env
│
├── src/
│   ├── index.ts              # CLI (commander): run, tasks, show, retry
│   ├── config.ts             # getConfig() — .env из корня проекта (не cwd), кешируется
│   │
│   ├── pipeline/
│   │   ├── types.ts          # ВСЕ типы проекта (TaskRecord, CoderOutput, ReviewerOutput, etc.)
│   │   └── runner.ts         # PipelineRunner — стейт-машина: coding → reviewing → testing → done
│   │
│   ├── agents/
│   │   ├── base.ts           # BaseAgent — Anthropic SDK client, call(), parseJSON()
│   │   ├── coder.ts          # CoderAgent extends BaseAgent — generate()
│   │   ├── reviewer.ts       # ReviewerAgent extends BaseAgent — review()
│   │   └── prompts.ts        # CODER_SYSTEM_PROMPT, REVIEWER_SYSTEM_PROMPT, билдеры user prompt
│   │
│   ├── context/
│   │   ├── gatherer.ts       # gatherContext() — 4 уровня: metadata, tree, key files, imports
│   │   └── filters.ts        # shouldIgnoreDir/File, isBinaryFile, safeReadFile, METADATA_FILES
│   │
│   ├── db/
│   │   ├── sqlite.ts         # getDatabase() — singleton, WAL mode, createTables()
│   │   └── tasks.ts          # TaskRepository — create, getById, list, updateStatus, addLog, etc.
│   │
│   ├── git/
│   │   └── operations.ts     # GitOperations — createBranch, commitAll, getDiff, mergeBranch
│   │
│   ├── test-runner/
│   │   └── executor.ts       # runTests() — detect PM, run lint + test через child_process
│   │
│   └── utils/
│       ├── logger.ts         # logger singleton — info/success/warn/error/debug/spin
│       └── tokens.ts         # estimateTokens, fitWithinBudget, TOKEN_BUDGETS
│
└── dist/                     # Результат компиляции (npm run build)
```

---

## Ключевые паттерны и конвенции

### Общие правила кода

1. **Все типы — в `pipeline/types.ts`**. Не создавай типы в других файлах (кроме локальных интерфейсов для конкретного модуля, вроде `CoderCallResult` в `coder.ts`).

2. **Singleton-паттерн** используется для:
   - БД (`sqlite.ts` → `getDatabase()`)
   - Логгера (`logger.ts` → `export const logger`)
   - Конфига (`config.ts` → `getConfig()` с кешем)

3. **`.env` загружается из корня проекта ai-pipeline** (через `import.meta.url`), а НЕ из текущей рабочей директории. Это позволяет вызывать CLI из любой папки.

4. **Все импорты — с `.js`**:
   ```typescript
   // ПРАВИЛЬНО:
   import { logger } from '../utils/logger.js';
   // НЕПРАВИЛЬНО:
   import { logger } from '../utils/logger';
   ```

5. **Агенты наследуют `BaseAgent`**. Не создавай агентов без наследования.

6. **Логирование через `logger`**, не через `console.log` напрямую (кроме `console.table` в logger.ts).

7. **Debug-логи** через `logger.debug()` — выводятся только при `DEBUG=1`.

### Формат ответов агентов

Оба агента возвращают **чистый JSON** (без markdown code fences). BaseAgent.parseJSON() умеет снимать code fences, но промпты требуют чистый JSON.

**Coder:**
```json
{
  "thinking": "string",
  "files": [{ "path": "string", "action": "create|update|delete", "content": "string" }],
  "commitMessage": "string"
}
```

**Reviewer:**
```json
{
  "decision": "approve|reject",
  "issues": [{ "severity": "critical|major|minor|nit", "file": "string", "line": "number|null", "message": "string" }],
  "summary": "string"
}
```

### Стейт-машина пайплайна

```
pending → coding → reviewing → testing → done
                      ↓            ↓
                   (reject)      (fail)
                      ↓            ↓
                   coding ← ─── coding   (новая попытка, чистая ветка от main)
                      ↓
               (попытки исчерпаны)
                      ↓
                    failed
```

Каждая попытка — **чистая ветка** `ai/task-{id}-attempt-{n}` от main.

### Git-конвенции

- Ветки: `ai/task-{id}-attempt-{n}`
- Merge: `--no-ff` для сохранения истории
- Перед стартом: проверка `ensureClean()`
- Pull: с graceful catch (работает offline)
- Определение main-ветки: `origin/HEAD` → `main` → `master` → текущая

### Бюджет токенов контекста

| Категория | Токенов | Символов (~) |
|-----------|---------|-------------|
| Метаданные | 5 000 | 20 000 |
| Дерево файлов | 5 000 | 20 000 |
| Ключевые файлы | 30 000 | 120 000 |
| Доп. файлы (импорты) | 20 000 | 80 000 |
| **Итого репо** | **60 000** | **240 000** |
| **Общий бюджет** | **80 000** | **320 000** |

Оценка: 1 токен ~ 4 символа.

---

## SQLite схема

```sql
-- Задачи
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|coding|reviewing|testing|done|failed
  repo_path TEXT NOT NULL,
  branch_name TEXT,                        -- ai/task-{id}-attempt-{n}
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  reviewer_feedback TEXT,                  -- последний фидбек ревьюера/тестов
  error_message TEXT,                      -- ошибка при failed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Логи агентов
CREATE TABLE task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,      -- coder|reviewer|tester|pipeline
  action TEXT NOT NULL,     -- generate|review|test|complete
  input_summary TEXT,
  output_summary TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Индексы
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
```

Настройки: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`

---

## Конфигурация

### Переменные окружения

| Переменная | Обязательная | Умолчание | Описание |
|-----------|:---:|-----------|----------|
| `ANTHROPIC_API_KEY` | да | — | API-ключ Anthropic |
| `AI_PIPELINE_MODEL` | нет | `claude-sonnet-4-20250514` | Модель Claude |
| `AI_PIPELINE_MAX_ATTEMPTS` | нет | `3` | Макс. попыток кодера |
| `AI_PIPELINE_AUTO_MERGE` | нет | `false` | Автомерж (`true`/`false`) |
| `AI_PIPELINE_DB_PATH` | нет | `./ai-pipeline.db` | Путь к SQLite |
| `DEBUG` | нет | — | Debug-логи (любое значение) |

### Приоритет источников

CLI-флаги > переменные окружения > значения по умолчанию.

### Интерфейс AppConfig

```typescript
interface AppConfig {
  anthropicApiKey: string;
  model: string;
  maxAttempts: number;
  autoMerge: boolean;
  dbPath: string;
}
```

---

## CLI-команды

```bash
# Запуск задачи
ai-pipeline run <описание> --repo <путь> [--model <m>] [--max-attempts <n>] [--auto-merge]

# Список задач
ai-pipeline tasks [--status <pending|coding|reviewing|testing|done|failed>]

# Детали задачи + логи агентов
ai-pipeline show <task-id>

# Повтор упавшей задачи
ai-pipeline retry <task-id> [--repo <путь>] [--model <m>] [--max-attempts <n>] [--auto-merge]
```

Коды завершения: `0` — успех (`done`), `1` — ошибка/fail.

---

## Как вносить изменения

### Добавление нового агента

1. Создай файл `src/agents/my-agent.ts`
2. Наследуй от `BaseAgent`:
   ```typescript
   import { BaseAgent } from './base.js';

   export class MyAgent extends BaseAgent {
     constructor(apiKey: string, model: string) {
       super(apiKey, model, 'my-role');
     }
     // ...
   }
   ```
3. Добавь роль в `AgentRole` тип в `pipeline/types.ts`
4. Добавь системный промпт в `agents/prompts.ts`

### Добавление нового CLI-команды

1. В `src/index.ts` добавь новый `program.command()`
2. Используй паттерн: getConfig → getDatabase → действие → closeDatabase

### Изменение схемы БД

1. Измени SQL в `src/db/sqlite.ts` → `createTables()`
2. Обнови типы в `pipeline/types.ts`
3. Обнови методы в `db/tasks.ts`
4. **Важно**: `CREATE TABLE IF NOT EXISTS` — для новых таблиц этого достаточно. Для изменения существующих таблиц потребуется миграция или пересоздание БД.

### Изменение промптов

Все промпты в одном файле: `src/agents/prompts.ts`. Системные промпты — константы, пользовательские — билдер-функции. Меняй промпты осторожно — от них зависит формат ответа агентов.

### Добавление нового фильтра файлов

Файл: `src/context/filters.ts`. Добавь расширение в нужный `Set`:
- `IGNORE_EXTENSIONS` — файлы не попадут в дерево и контекст
- `BINARY_EXTENSIONS` — файлы будут помечены как бинарные
- `IGNORE_DIRS` — директории полностью пропускаются при обходе

---

## Сборка и запуск

```bash
# Установить зависимости
npm install

# Скомпилировать TypeScript
npm run build        # однократная сборка
npm run dev          # watch-режим

# Запустить
node dist/index.js run "задача" --repo ~/project
# или после npm link:
ai-pipeline run "задача" --repo ~/project
```

**Компиляция без ошибок — обязательное требование перед коммитом.**

---

## Частые ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `ANTHROPIC_API_KEY is required` | Нет `.env` в корне ai-pipeline | Создать `.env` рядом с `package.json` (не в cwd) |
| `Repository has uncommitted changes` | Грязное рабочее дерево | `git stash` или `git commit` |
| `Coder returned invalid JSON` | Модель не вернула JSON | Повторить через `retry` |
| `This expression is not callable` при импорте simple-git | Неправильный импорт | Использовать `import { simpleGit }` (named export) |
| ERR_MODULE_NOT_FOUND | Импорт без `.js` | Добавить `.js` к относительным импортам |
| `Cannot find module` | Не скомпилировано | Выполнить `npm run build` |

---

## Зависимости

| Пакет | Зачем |
|-------|-------|
| `@anthropic-ai/sdk` | Клиент Claude API |
| `better-sqlite3` | Синхронный SQLite драйвер |
| `simple-git` | Git-операции (named export: `simpleGit`) |
| `commander` | Парсинг CLI-команд |
| `chalk` | Цветной вывод (ESM) |
| `ora` | Спиннеры в терминале (ESM) |
| `glob` | Поиск файлов по паттернам |
| `dotenv` | Загрузка .env |
| `typescript` | Компилятор (dev) |
| `@types/better-sqlite3` | Типы для better-sqlite3 (dev) |
| `@types/node` | Типы для Node.js (dev) |
