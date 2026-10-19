# TalentStreams — контекст проекта

Платформа персонализированных подборок проверенных кандидатов для работодателей Центральной Азии.
Работодатели получают email-рассылку с анонимными карточками; ссылка в письме персонализирована по токену.

## Стек

- **Next.js 14** — App Router, Server Components, Server Actions (`"use server"` в `app/actions.ts`)
- **TypeScript**
- **Google Sheets** — не часть боевого пути (TASK-DB-4 ✅, кандидаты переехали в Neon); `lib/sheets.ts` остаётся фундаментом для будущего импорта (Service Account API v4)
- **Neon (PostgreSQL)** — `candidates`, `contactRequests`, `streams`, `employers`, `candidateResumes`, `companies` (Drizzle ORM + neon-http driver)
- **Vercel Blob** — приватное хранилище файлов резюме
- **SendPulse** — email-рассылки (адресные книги, кампании, merge-теги) и Telegram-бот работодателей
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
SENDPULSE_TG_BOT_ID=              # Telegram-бот в SendPulse (TASK-35)
SENDPULSE_TG_BOT_NAME=talentstreams_bot
SENDPULSE_TG_START_FLOW_ID=       # стартовая цепочка бота

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
    companies/page.tsx              # Список компаний с раскрытием — кто из людей в какой компании (TASK-36)
    candidates/page.tsx
    requests/page.tsx
    streams/page.tsx                # CRUD стримов (Neon)
    settings/page.tsx
  api/
    publish/[listId]/route.ts       # curl-запуск рассылки
    upload/route.ts                 # POST: загрузка резюме → Vercel Blob
    resume/route.ts                 # GET: прокси приватных blob-файлов

lib/
  sheets.ts                         # Google Sheets: типы, чтение, запись — НЕ часть боевого пути (TASK-DB-4 ✅), фундамент будущего импорта
  sendpulse.ts                      # SendPulse: OAuth, книги, кампании
  i18n/                             # Словари RU/EN для главной страницы (не для редактора)
    home.ts / candidate-form.ts / employer-form.ts
  db/
    index.ts                        # Drizzle клиент (neon-http)
    schema.ts                       # Схемы: candidates, contactRequests, streams, employers, candidateResumes, companies
    candidates.ts                   # CRUD кандидатов (TASK-DB-4); объединяет бывшие Profile+Candidate (lib/sheets.ts) в один тип
    contact-requests.ts             # CRUD запросов (FK на candidates/employers/streams)
    streams.ts                      # CRUD стримов
    employers.ts                    # CRUD работодателей (TASK-DB-3); employer.company — резолвленное имя через join на companies
    companies.ts                    # CRUD компаний, поиск для автодополнения, find-or-create (TASK-36)
    resumes.ts                      # История версий резюме кандидата (TASK-32), FK на candidates (ON DELETE CASCADE)
    mailing-lists.ts                # CRUD выпусков (TASK-DB-5); candidateId — FK на candidates (ON DELETE SET NULL)
    migrations/                     # SQL-миграции

components/
  language-provider.tsx             # RU/EN Context для главной страницы (localStorage, без смены URL)
  language-toggle.tsx                # Переключатель RU/EN в шапке
  home-page-content.tsx             # Вёрстка главной страницы (клиентский компонент — нужен для переключения языка)
  candidate-registration-modal.tsx  # Форма кандидата (публичная), мультиязычная (lib/i18n/candidate-form.ts)
  candidate-edit-modal.tsx          # Редактирование кандидата: контакты, резюме, уровень, стримы, страны, дата активности
  candidate-create-modal.tsx        # Быстрое добавление кандидата из редактора (без публичной формы)
  candidate-section.tsx             # Фильтры (поиск/статус/стрим/уровень) + список + Pencil + пагинация
  employer-registration-modal.tsx   # Экспортирует константы (страны/стримы/способы связи) для переиспользования; мультиязычная (lib/i18n/employer-form.ts), сами значения констант не переводятся
  employer-edit-modal.tsx           # Редактирование работодателя — форма как у регистрации, без чекбокса согласия
  employer-create-modal.tsx         # Быстрое добавление работодателя из редактора (переиспользует registerEmployer)
  employer-section.tsx              # Фильтры (поиск/статус/страна/стрим) + список + Pencil + пагинация
  pagination-controls.tsx           # Переиспользуемый футер пагинации (размер страницы 10/25/50/100/Все + prev/next) — используется в candidate-section.tsx и employer-section.tsx
  company-autocomplete-input.tsx    # Поле «Компания» с автодополнением (searchCompanies); используется во всех 3 формах работодателя (TASK-36)
  companies-section.tsx             # Список компаний с раскрытием по клику — показывает людей внутри компании (TASK-36)
  streams-table.tsx                 # Inline-редактор стримов + счётчик подходящих кандидатов (TASK-27)
  contact-requests-section.tsx
  editor-nav.tsx                    # Разделы: Выпуски/Работодатели/Компании/Кандидаты/Запросы/Стримы/Настройки
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

### Google Sheets — `lib/sheets.ts` не часть боевого пути
TASK-DB-4 ✅ перенесла кандидатов в Neon полностью — ничего в приложении больше не читает и не пишет `lib/sheets.ts`. Файл сохранён нетронутым как фундамент отдельной будущей задачи: импорт дополнительных кандидатов из заполненной вручную Google-таблицы в Neon (механизм дедупа/триггера не спланирован). Если/когда эта задача стартует, актуальны те же технические детали, что и раньше:
- `HEADER_ALIASES` — словарь русских и английских синонимов заголовков → канонические ключи, через `mapHeader(header)`.
- `recoverPhoneColumn()` — чинит телефон, теряющий `+` из-за того, что Google Sheets трактует ячейку, начинающуюся с `+`/`-`/`=`, как формулу (`FORMATTED_VALUE` либо теряет `+`, либо отдаёт `#ERROR!`); тянет колонку «Phone» отдельным запросом с `valueRenderOption=FORMULA` и снимает ведущий `=`.

### Vercel Blob — резюме
- Загрузка: `POST /api/upload` → `put(filename, file, { access: "private" })`
- Прокси-URL хранится только в `candidateResumes.url` (Neon) — `candidates` не имеет колонки `resumeUrl` вовсе: `candidateResumes` — единственный источник правды, «текущая» версия — просто самая новая строка (`ORDER BY createdAt DESC`, см. `getResumeVersions()`)
- Прокси: `GET /api/resume` — читает blob server-side с `Authorization: Bearer BLOB_READ_WRITE_TOKEN`; необязательный `?filename=` задаёт имя скачиваемого файла (`Content-Disposition`, кириллица через `filename*=UTF-8''`) — иначе браузер скачивает файл под именем из blob-пути
- Защита от open redirect: проверка hostname `*.blob.vercel-storage.com`

### Neon — таблицы
- `candidates` — кандидаты (TASK-DB-4 ✅, было Google Sheets); `stream`/`excludedCompanies`/`excludedStreams` — нативные Postgres `text[]`; `activeSince` — настоящая `date`-колонка (`mode: "string"`, ISO `YYYY-MM-DD`, nullable = «не задано»), конвертация в/из привычного ru-RU текста («21.07.2026») изолирована на границе `lib/db/candidates.ts` — остальной код работает со строкой как раньше; нет колонки `resumeUrl` — резюме только в `candidateResumes` (см. выше). `email`/`phone` — `UNIQUE` + nullable (TASK-38 ✅; `NULL` = не указан — необязательное поле не может быть `NOT NULL DEFAULT ''` и `UNIQUE` одновременно, иначе второй кандидат без телефона не запишется: Postgres два `NULL` дублями не считает, а два `''` считал бы); конвертация `null ↔ ""` на той же границе модуля, внешний тип остаётся `string`
- `contactRequests` — запросы работодателей на контакт с кандидатами; `employerToken` (FK на `employers.token`, `ON DELETE CASCADE` — запрос без работодателя не имеет смысла), `streamId` и `candidateId` (оба FK, `ON DELETE SET NULL` — запрос может быть «общим», без привязки к конкретному кандидату или стриму, и переживает удаление кандидата)
- `streams` — стримы (Industry/Functional), полный CRUD через `/editor/streams`
- `employers` — работодатели (TASK-DB-3); `token` — тот же UUID, что `employer_token` в SendPulse и `?e=` в публичной ссылке; `streams`/`additionalCountries` — нативные Postgres `text[]`; `companyId` — FK на `companies.id` (`ON DELETE SET NULL`); `email`/`phone` — `UNIQUE` (TASK-38 ✅; всегда заполнены, nullability не трогали — уникальность в коде `registerEmployer()` уже была, `UNIQUE` в БД — подстраховка от гонки)
- `companies` — компании работодателей (TASK-36), отдельная сущность — одна компания может иметь несколько работодателей (людей); `name` — `unique()`. Поле «Компания» обязательно при регистрации, с автодополнением по существующим названиям (`findOrCreateCompanyByName()`, case-insensitive через `ilike`); записи без компании получают реальную строку-плейсхолдер «Не определено» (не NULL), управляемую как любая другая компания
- `candidateResumes` — история версий резюме кандидата (TASK-32); `candidateId` — FK на `candidates.id`, `ON DELETE CASCADE` (резюме не живёт без кандидата)
- `mailingListEntries` — строки выпусков рассылки (TASK-DB-5); `candidateId` — FK на `candidates.id`, `ON DELETE SET NULL` (история рассылок переживает удаление кандидата)
- Миграции: `scripts/migrate.mjs`

### Telegram-бот (SendPulse)
- Работодатель подписывается по ссылке `tg.pulse.is/<бот>?start=<flow_id>&employer_token=<token>` — SendPulse сохраняет токен в переменную контакта бота
- Контакт ищется по `employer_token` через API (`getByVariable`); отправка — `sendTelegramToEmployer()`, отключение/удаление контакта в боте — `disableTelegramContact()`/`deleteTelegramContact()` (вызываются из `rejectEmployer()`/`deleteEmployer()`) — всё в `lib/sendpulse.ts`, best-effort
- **Токен бота — наш** (создан через @BotFather, вставлен в SendPulse, не наоборот) — при желании можно перейти на self-hosted бота без потери подписчиков (см. `docs/backlog.adoc`)
- `employers.telegramId` (Neon) — Telegram user id, синхронизируется при каждой загрузке `/editor/employers` из ответа SendPulse (пишется при подключении, чистится, если SendPulse контакт больше не находит); задел на случай перехода на self-hosted бота — этот id адресуется напрямую через Telegram Bot API, независимо от SendPulse
- Та же синхронизация поправляет и `employers.telegram` (@username) на реальный подключённый аккаунт — работодатель вписывает его вручную при регистрации, но может открыть ссылку-приглашение с другого Telegram-аккаунта; обновляется только при реальном совпадении (никогда не затирается в пустую строку)

### Server Actions
Все мутации — в `app/actions.ts`. После мутации, меняющей UI редактора, вызывать `revalidatePath(...)`.

Пользовательские ошибки валидации (не баги) возвращаются как `{ ok: true } | { ok: false, error }`, не через `throw` — Next.js подменяет сообщение любого `throw new Error()` из Server Action на обобщённый текст в продакшен-сборке. Паттерн у `registerEmployer`/`updateEmployer`/`registerCandidate`/`createCandidate`/`updateCandidate` (TASK-38); неожиданные ошибки (не связанные с вводом пользователя) всё ещё пробрасываются как есть.

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
| Редактирование кандидата в редакторе (расширено: уровень/стримы/страны/дата/«Исключённые компании»/«Исключённые стримы» с автодополнением и визуальным выделением) | ✅ TASK-23 |
| Пагинация в /editor/candidates и /editor/employers (10/25/50/100/Все) | ✅ |
| Редактирование работодателя в редакторе | ✅ TASK-31 |
| Фильтры вместо секций в /editor/candidates и /editor/employers | ✅ TASK-30 |
| Гео-фильтрация кандидатов в подборке | ✅ TASK-24 |
| Авто-маппинг кандидат → стрим (по колонке Stream) | ✅ TASK-27 |
| Персонализация рассылок (токен работодателя) | ✅ TASK-13 |
| Модерация кандидатов (Добавить/Отклонить) | ✅ TASK-11 |
| Contact Requests → Neon (+ FK на employers/streams) | ✅ TASK-DB-2 |
| Стримы → Neon + CRUD-редактор | ✅ TASK-DB-8 |
| Работодатели → Neon (было Sheets) | ✅ TASK-DB-3 |
| Кандидаты → Neon (было Sheets; Sheets остаётся опциональным каналом массового ввода) | ✅ TASK-DB-4 |
| История версий резюме кандидата (Neon) | ✅ TASK-32 |
| Отключение/удаление/быстрое добавление кандидата и работодателя в редакторе | ✅ TASK-33 |
| Приветственное письмо работодателю | ✅ TASK-10 |
| Автоподбор кандидатов в выпуск | ✅ TASK-28 |
| Пауза публикации кандидата (2 недели/3 месяца/статус «Не публиковать» после 3-й отправки) | ✅ TASK-05 |
| Мультиязычная главная страница (RU/EN, переключатель без смены URL) | ✅ |
| Подключение работодателя к Telegram-боту SendPulse, уведомление о подтверждении | ✅ TASK-35 (часть 1) |
| Компания работодателя — обязательное поле, отдельная сущность с FK, автодополнение, раздел «Компании» | ✅ TASK-36 |
| Страны работодателя — страна нахождения обязательна (+ опция «Другая»), пустой список доп. стран трактуется как «Любая» | ✅ TASK-37 |
| Уникальность email/телефона у кандидатов и работодателей (`UNIQUE` на уровне БД, дружелюбная ошибка) | ✅ TASK-38 |

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
