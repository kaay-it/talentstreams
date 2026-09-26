# TalentStreams — контекст проекта

Платформа персонализированных подборок проверенных кандидатов для работодателей Центральной Азии.
Работодатели получают email-рассылку с анонимными карточками; ссылка в письме персонализирована по токену.

## Стек

- **Next.js 14** — App Router, Server Components, Server Actions (`"use server"` в `app/actions.ts`)
- **TypeScript**
- **Google Sheets** — профили кандидатов, подборки (Service Account API v4)
- **Neon (PostgreSQL)** — `contactRequests`, `streams`, `employers`, `candidateResumes` (Drizzle ORM + neon-http driver)
- **Vercel Blob** — приватное хранилище файлов резюме
- **SendPulse** — email-рассылки (адресные книги, кампании, merge-теги)
- **Tailwind CSS + lucide-react**

## Переменные окружения

```env
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

SENDPULSE_CLIENT_ID=
SENDPULSE_CLIENT_SECRET=
SENDPULSE_MASTER_BOOK_NAME=Default
SENDPULSE_FROM_EMAIL=
SENDPULSE_FROM_NAME=TalentStreams

DATABASE_URL=                     # Neon connection string
BLOB_READ_WRITE_TOKEN=            # Vercel Blob

APP_URL=https://your-domain.com   # нужен для формирования proxy-URL резюме
EDITOR_SECRET=                    # защищает /editor и /api/publish
```

## Структура

```
app/
  actions.ts                        # ВСЕ Server Actions
  page.tsx                          # Главная: лендинг + формы регистрации
  list/[listId]/page.tsx            # Подборка (требует ?e= или ?secret=)
  profile/[id]/page.tsx             # Полный профиль кандидата
  editor/
    layout.tsx / page.tsx           # Выпуски (Releases)
    employers/page.tsx
    candidates/page.tsx
    requests/page.tsx
    streams/page.tsx                # CRUD стримов (Neon)
    settings/page.tsx
  api/
    publish/[listId]/route.ts       # curl-запуск рассылки
    upload/route.ts                 # POST: загрузка резюме → Vercel Blob
    resume/route.ts                 # GET: прокси приватных blob-файлов

lib/
  sheets.ts                         # Google Sheets: типы, чтение, запись
  sendpulse.ts                      # SendPulse: OAuth, книги, кампании
  db/
    index.ts                        # Drizzle клиент (neon-http)
    schema.ts                       # Схемы: contactRequests, streams, employers, candidateResumes
    contact-requests.ts             # CRUD запросов (FK на employers/streams)
    streams.ts                      # CRUD стримов
    employers.ts                    # CRUD работодателей (TASK-DB-3)
    resumes.ts                      # История версий резюме кандидата (TASK-32)
    migrations/                     # SQL-миграции

components/
  candidate-registration-modal.tsx  # Форма кандидата (публичная)
  candidate-edit-modal.tsx          # Редактирование кандидата: контакты, резюме, уровень, стримы, страны, дата активности
  candidate-create-modal.tsx        # Быстрое добавление кандидата из редактора (без публичной формы)
  candidate-section.tsx             # Фильтры (поиск/статус/стрим/уровень) + список + Pencil
  employer-registration-modal.tsx   # Экспортирует константы (страны/стримы/способы связи) для переиспользования
  employer-edit-modal.tsx           # Редактирование работодателя — форма как у регистрации, без чекбокса согласия
  employer-create-modal.tsx         # Быстрое добавление работодателя из редактора (переиспользует registerEmployer)
  employer-section.tsx              # Фильтры (поиск/статус/страна/стрим) + список + Pencil
  streams-table.tsx                 # Inline-редактор стримов + счётчик подходящих кандидатов (TASK-27)
  contact-requests-section.tsx
  editor-nav.tsx                    # Разделы: Выпуски/Работодатели/Кандидаты/Запросы/Стримы/Настройки
  publish-button.tsx
  contact-button.tsx
  general-inquiry-button.tsx
  profile-view.tsx                  # Полная карточка профиля кандидата
  campaign-history.tsx              # История отправленных кампаний на странице выпусков

docs/
  backlog.adoc                      # ГЛАВНЫЙ ДОКУМЕНТ: все задачи и статусы
  manager-playbook.adoc             # Инструкция для нетехнического менеджера: кандидаты/работодатели/рассылка
  workspace.dsl                     # C4-архитектура (Structurizr)
  editor-stream-flow.puml           # Sequence-диаграмма жизненного цикла
```

## Ключевые решения и соглашения

### Google Sheets — маппинг заголовков
`lib/sheets.ts` содержит `HEADER_ALIASES` — словарь русских и английских синонимов заголовков → канонические ключи.
Функция `mapHeader(header)` используется везде при чтении/записи. При добавлении нового поля:
1. Добавить ключ в `KNOWN_KEYS`
2. Добавить тип в `Profile` или `Candidate`
3. Добавить алиасы в `HEADER_ALIASES`
4. Заполнить в `buildProfile()` или `rowToRecord()`

### Vercel Blob — резюме
- Загрузка: `POST /api/upload` → `put(filename, file, { access: "private" })`
- В Sheets хранится прокси-URL: `APP_URL/api/resume?url=<encodedBlobUrl>`
- Прокси: `GET /api/resume` — читает blob server-side с `Authorization: Bearer BLOB_READ_WRITE_TOKEN`; необязательный `?filename=` задаёт имя скачиваемого файла (`Content-Disposition`, кириллица через `filename*=UTF-8''`) — иначе браузер скачивает файл под именем из blob-пути
- Защита от open redirect: проверка hostname `*.blob.vercel-storage.com`
- История версий резюме кандидата хранится в Neon (`candidateResumes`, TASK-32) — Sheets по-прежнему держит только URL последней версии

### Neon — таблицы
- `contactRequests` — запросы работодателей на контакт с кандидатами; `employerToken` (FK на `employers.token`, `ON DELETE CASCADE` — запрос без работодателя не имеет смысла) и `streamId` (FK на `streams.id`, `ON DELETE SET NULL`)
- `streams` — стримы (Industry/Functional), полный CRUD через `/editor/streams`
- `employers` — работодатели (TASK-DB-3); `token` — тот же UUID, что `employer_token` в SendPulse и `?e=` в публичной ссылке; `streams`/`additionalCountries` — нативные Postgres `text[]`
- `candidateResumes` — история версий резюме кандидата (TASK-32); кандидаты сами остаются в Google Sheets
- Миграции: `scripts/migrate.mjs`

### Server Actions
Все мутации — в `app/actions.ts`. После мутации, меняющей UI редактора, вызывать `revalidatePath(...)`.

### Доступ к редактору
`/editor/*` защищён: `if (editorSecret && secret !== editorSecret) notFound()`.
Параметр `?secret=` передаётся через `EditorNav` во все ссылки.

### Доступ к подборке `/list/[listId]`
- `?e=[employer_token]` → персонализированная подборка (фильтр по предпочтениям)
- `?secret=[EDITOR_SECRET]` → все кандидаты без фильтра
- без параметров → 404

## Что реализовано (актуальное состояние)

| Задача | Статус |
|---|---|
| Главная, подборка, профиль, редактор | ✅ |
| Регистрация и подтверждение работодателя | ✅ |
| Регистрация кандидата (форма + Blob) | ✅ TASK-19 |
| Редактирование кандидата в редакторе (расширено: уровень/стримы/страны/дата) | ✅ TASK-23 |
| Редактирование работодателя в редакторе | ✅ TASK-31 |
| Фильтры вместо секций в /editor/candidates и /editor/employers | ✅ TASK-30 |
| Гео-фильтрация кандидатов в подборке | ✅ TASK-24 |
| Авто-маппинг кандидат → стрим (по колонке Stream) | ✅ TASK-27 |
| Персонализация рассылок (токен работодателя) | ✅ TASK-13 |
| Модерация кандидатов (Добавить/Отклонить) | ✅ TASK-11 |
| Contact Requests → Neon (+ FK на employers/streams) | ✅ TASK-DB-2 |
| Стримы → Neon + CRUD-редактор | ✅ TASK-DB-8 |
| Работодатели → Neon (было Sheets) | ✅ TASK-DB-3 |
| История версий резюме кандидата (Neon) | ✅ TASK-32 |
| Отключение/удаление/быстрое добавление кандидата и работодателя в редакторе | ✅ TASK-33 |
| Приветственное письмо работодателю | ✅ TASK-10 |
| Автоподбор кандидатов в выпуск | ✅ TASK-28 |
| Пауза публикации кандидата (2 недели/3 месяца/статус «Не публиковать» после 3-й отправки) | ✅ TASK-05 |

## Активные задачи (приоритет)

1. **TASK-25** — гео-сегментация рассылки: ждёт решения о переходе на Unisender (исследование SendPulse завершено, все тарифы не подходят)
2. **TASK-12** — summary кандидата в теле email-рассылки
3. **TASK-05 (остаток)** — статус «Не публиковать» по прямой просьбе кандидата (сейчас только автоматически после 3-й отправки)

Полный список с деталями — `docs/backlog.adoc`.

## Запуск локально

```bash
npm install
npm run dev   # http://localhost:3000
```

## Архитектура и диаграммы

- `docs/workspace.dsl` — C4-модель (Structurizr DSL, открывается на structurizr.com/dsl)
- `docs/editor-stream-flow.puml` — PlantUML sequence-диаграмма всего жизненного цикла
