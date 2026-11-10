# TalentStreams — контекст проекта

Платформа персонализированных подборок проверенных кандидатов для работодателей Центральной Азии.
Работодатели получают email-рассылку с анонимными карточками; ссылка в письме персонализирована по токену.

## Стек

- **Next.js 16** — App Router, Server Components, Server Actions (`"use server"` в `app/actions.ts`), `proxy.ts` (переименованный в 16.x `middleware.ts`)
- **TypeScript**
- **Google Sheets** — не часть боевого пути приложения (TASK-DB-4 ✅, кандидаты переехали в Neon); `lib/sheets.ts` — опциональный канал массового ввода: менеджер заполняет таблицу вручную, кнопка в `/editor/settings` импортирует новых кандидатов в Neon (TASK-39 ✅, Service Account API v4)
- **Neon (PostgreSQL)** — `candidates`, `contactRequests`, `streams`, `employers`, `candidateResumes`, `companies` (Drizzle ORM + neon-http driver)
- **Vercel Blob** — приватное хранилище файлов резюме
- **SendPulse** — email-рассылки (адресные книги, кампании, merge-теги), транзакционные письма кандидатам (SMTP API) и Telegram-бот работодателей
- **Vercel Analytics** (`@vercel/analytics`) — подключена в `app/layout.tsx`, работает автоматически после деплоя на Vercel, смотреть в дашборде Vercel (вкладка Analytics)
- **Tailwind CSS + lucide-react**

## Переменные окружения

```env
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

SENDPULSE_CLIENT_ID=
SENDPULSE_CLIENT_SECRET=
SENDPULSE_MASTER_BOOK_NAME=Default
SENDPULSE_EMPLOYER_FROM_EMAIL=partner@talentlabstreams.com   # рассылки работодателям (подборки)
SENDPULSE_EMPLOYER_FROM_NAME=Talent Streams Partner
SENDPULSE_CANDIDATE_FROM_EMAIL=career@talentlabstreams.com   # письма кандидатам (триггерное + дайджест)
SENDPULSE_CANDIDATE_FROM_NAME=Talent Streams Career
SENDPULSE_CANDIDATE_BOOK_NAME=Candidates                     # одна книга под приветственный Automation 360-триггер и дайджест
SENDPULSE_CANDIDATE_DIGEST_SEND_BOOK_NAME=Candidates Digest Manual # отдельная постоянная книга только для ручных (с предпросмотром) отправок дайджеста — НЕ "Candidates", чтобы исключение кандидата из одной ручной отправки не трогало членство в книге-триггере Automation 360
SENDPULSE_TG_BOT_ID=              # Telegram-бот в SendPulse (TASK-35)
SENDPULSE_TG_BOT_NAME=talentstreams_bot
SENDPULSE_TG_START_FLOW_ID=       # стартовая цепочка бота

DATABASE_URL=                     # Neon connection string
BLOB_READ_WRITE_TOKEN=            # Vercel Blob

APP_URL=https://your-domain.com   # нужен для формирования proxy-URL резюме
EDITOR_SECRET=                    # защищает /editor (постранично) и мутирующие Server Actions (requireEditorAuth(), см. «Авторизация» ниже)
SESSION_SECRET=                   # подписывает куку сессии редактора (proxy.ts/lib/auth.ts) — отдельный секрет, не светится в URL; сгенерировать `openssl rand -base64 32` или аналог, разный для dev и Vercel Production/Preview
CRON_SECRET=                      # защищает /api/cron/* (Vercel Cron шлёт Authorization: Bearer <значение>); без неё роут открыт
```

## Структура

```
app/
  layout.tsx                        # Корневой layout — подключает <Analytics /> (@vercel/analytics)
  actions.ts                        # ВСЕ Server Actions
  page.tsx                          # Главная: лендинг + формы регистрации
  list/[listId]/page.tsx            # Рассылка — резолвит, какую подборку показать: ?e= всегда резолвится «как у работодателя» (личная без фильтра, если есть, иначе дефолтная с фильтром), независимо от secret; secret без e — дефолтная подборка без фильтра, либо «подборка не готова», если дефолтной нет вовсе; без обоих — 404
  selection/[selectionId]/page.tsx  # Прямой просмотр ОДНОЙ подборки (в пуле или присоединённой к выпуску, отправленному или нет) по её id — только ?secret=, без гео-фильтра/exclusions: инструмент редактора, не публичная ссылка работодателя. Для ограниченной — отдельно список компаний (полный, не усечённый label) и список работодателей с их компанией у каждого
  profile/[id]/page.tsx             # Профиль кандидата — полный (isEditor) или анонимизированный (имя/контакты/резюме заблюрены и не попадают в HTML), по тому же паттерну `?secret=`, что `/editor/*`
  editor/
    layout.tsx / page.tsx           # Выпуски (Releases) — только выбирают уже подготовленные подборки, не создают и не редактируют их состав
    selections/page.tsx             # Подборки — отдельный раздел (TASK-44 ✅): готовятся заранее для стрима и даты, без привязки к конкретному выпуску; по умолчанию видны все, фильтр по стриму опционален; выбираются (не создаются) при создании/редактировании выпуска
    employers/page.tsx
    companies/page.tsx              # Список компаний с раскрытием — кто из людей в какой компании (TASK-36)
    candidates/page.tsx
    requests/page.tsx
    streams/page.tsx                # CRUD стримов (Neon)
    settings/page.tsx             # Импорт кандидатов из Google-таблицы в Neon (TASK-39), гейтится по isSheetsConfigured(); + тумблеры автоматики дайджеста/фоллоу-апа (CandidateDigestToggle/ReleaseFollowUpToggle, TASK-49 ✅) — только вкл/выкл расписания, без предпросмотра/истории (те переехали в /editor/communications)
    communications/page.tsx       # Раздел «Коммуникации» (TASK-49 ✅): ручная отправка с предпросмотром — дайджест кандидатам и фоллоу-ап работодателям (CandidateDigestSection/ReleaseFollowUpSection), у каждого своя схлопнутая по умолчанию история запусков (`<details>`)
  api/
    publish/[listId]/route.ts       # curl-запуск рассылки
    upload/route.ts                 # POST: загрузка резюме → Vercel Blob
    resume/route.ts                 # GET: прокси приватных blob-файлов
    cron/cleanup-adhoc-books/route.ts # Ежедневный Vercel Cron (vercel.json): удаляет одноразовые SendPulse-книги ограниченных рассылок — после реальной отправки, после удаления выпуска из редактора, либо после долгого простоя без отправки (TASK-43)
    cron/candidate-monthly-digest/route.ts # Еженедельный Vercel Cron (каждый понедельник), сам себя гасит, если не первый понедельник месяца или если автодайджест выключен в /editor/settings; вызывает runCandidateDigest("cron") из app/actions.ts напрямую (server-to-server импорт экспорта из "use server"-файла — не RPC, ограничение не действует)
    cron/release-follow-ups/route.ts # Ежедневный Vercel Cron — проверяет все отправленные выпуски в окне 3–21 день после отправки и шлёт фоллоу-апы работодателям (см. ниже), гасится тумблером в /editor/settings; runReleaseFollowUps() идемпотентна (releaseFollowUps — учёт уже вынесенных решений), так что ежедневный запуск безопасен

lib/
  sheets.ts                         # Google Sheets: типы, чтение, запись — не часть боевого пути приложения; читается только lib/sheets-import.ts (TASK-39)
  sheets-import.ts                  # Импорт кандидатов из Google-таблицы в Neon (TASK-39): общая categorize() + превью/реальный импорт
  sendpulse.ts                      # SendPulse: OAuth, книги, кампании; sendTransactionalEmail() — одно письмо через SMTP API (POST /smtp/emails), best-effort, никогда не бросает — используется для триггерного письма кандидату (submitContactRequest в app/actions.ts) и для фоллоу-апов работодателям (runReleaseFollowUps()), не для дайджеста (см. mailing-lists.ts/candidate-digest.ts — политика SendPulse не допускает периодическую рассылку через транзакционный канал). getCampaignSendDate(id, token) — send_date кампании (GET /campaigns/{id}); getCampaignEmailStatus(id, email, token) — статус конкретного получателя в конкретной кампании (GET /campaigns/{id}/email/{email}, ЕДИНСТВЕННОЕ число в пути — похожий на вид путь с emails во множественном числе существует и выглядит правдоподобно, но отдаёт 404 на каждый запрос; поймано драй-раном против реальных данных, не в проде)
  email-templates.ts                # Общая HTML-обёртка писем кандидату/работодателю (тёмная шапка, текстовый wordmark «Talent/Streams», без CTA-кнопок) + buildConsentRequestEmailHtml(company) (триггерное письмо кандидату, только company, никогда employer.name/контакты) + buildDigestEmailHtml() (дайджест кандидатам, литеральный мердж-тег {{digest_count}}, не JS-переменная) + buildFollowUpFeedbackEmailHtml()/buildFollowUpReminderEmailHtml() (фоллоу-апы работодателям после рассылки, см. ниже)
  i18n/                             # Словари RU/EN для главной страницы (не для редактора)
    home.ts / candidate-form.ts / employer-form.ts
  db/
    index.ts                        # Drizzle клиент (neon-http)
    schema.ts                       # Схемы: candidates, contactRequests, streams, employers, candidateResumes, companies, settings, candidateDigestRuns
    settings.ts                     # Генеричный key-value доступ к таблице settings (GENERATED BY DEFAULT AS IDENTITY PK) — getSetting/setSetting/getBooleanSetting, задел под любые будущие тумблеры/настройки, не точечная таблица на каждую
    candidate-digest.ts             # Настройки автодайджеста (тумблер в settings) + история запусков (candidateDigestRuns) — только БД, SendPulse-оркестрация живёт в app/actions.ts (runCandidateDigest)
    candidates.ts                   # CRUD кандидатов (TASK-DB-4); объединяет бывшие Profile+Candidate (lib/sheets.ts) в один тип; getConfirmedCandidates() — статус «Активный» ИЛИ «Не публиковать» (в отличие от getActiveCandidates(), строго «Активный»), нужен книге/дайджесту кандидатов — «Не публиковать» (ручная пауза менеджером, `pauseCandidate()`, TASK-51; авто-пауза после 3-й отправки, TASK-05, убрана) не отказ, кандидат остаётся в книге SendPulse и дайджесте
    contact-requests.ts             # CRUD запросов (FK на candidates/employers/streams); getEmployerTokensWithRequestForList(listId) — работодатели, отправившие запрос именно по этому выпуску (запрос из другого выпуска не считается), нужна runReleaseFollowUps() (app/actions.ts)
    release-follow-ups.ts           # Настройки автофоллоу-апа работодателям (тумблер в settings) + история запусков (releaseFollowUpRuns) + getEvaluatedFollowUpKeys(listIds)/recordFollowUpOutcome() — учёт уже вынесенных решений (releaseFollowUps, unique по listId+employerToken), чтобы ежедневный крон не повторял решение по одной и той же паре; только БД, оркестрация в app/actions.ts (runReleaseFollowUps())
    streams.ts                      # CRUD стримов
    employers.ts                    # CRUD работодателей (TASK-DB-3); employer.company — резолвленное имя через join на companies
    companies.ts                    # CRUD компаний, поиск для автодополнения, find-or-create (TASK-36)
    resumes.ts                      # История версий резюме кандидата (TASK-32), FK на candidates (ON DELETE CASCADE)
    mailing-lists.ts                # CRUD выпусков (TASK-DB-5; заголовочная таблица mailingLists + sentCampaignId, TASK-40 ✅); campaignNameFor() — имя кампании SendPulse, живёт здесь (не app/actions.ts, "use server" требует async от каждого экспорта); replaceMailingListRecipients() — полная замена узкой аудитории существующего выпуска (TASK-41 ✅); getMailingListCleanupStatuses(listIds) — пакетный sentCampaignId/targetDate по id для крон-очистки одноразовых книг (TASK-43 ✅). «Подборка» (selections/selectionEntries/selectionEmployers, TASK-44 ✅) — пул, не дочерняя сущность выпуска, со своей датой (targetDate — «стрим, потом дата, потом состав», как раньше у выпуска, редактируется отдельно от даты выпуска, в который подборку в итоге заберут): getSelectionsForStream(streamId)/getAllSelections() отдают подборки стрима/всех стримов разом (пул + присоединённые к любому выпуску, по полю listId: null|string, с именем стрима у getAllSelections()); createSelection(streamId, date, ...)/updateSelection(selectionId, date, ...)/deleteSelection() — CRUD пула; attachSelectionsToMailingList(listId, ids)/detachSelection(id) — единственный способ подборке получить/потерять listId. getMailingList(listId) — дефолтная + ограниченные, но только ПРИСОЕДИНЁННЫЕ к этому listId; resolveMailingListForEmployer()/getAllSelectionCandidateIds()/getEmployersWithoutSelection() — резолюция «что увидит работодатель»/объединение по рассылке/проверка покрытия перед отправкой, все работают с присоединённым набором. getCandidateExposureCounts() — для дайджеста кандидатам: по каждому кандидату считает множество токенов работодателей, реально его увидевших (та же резолюция, что /list/[listId], прогнанная по всем отправленным рассылкам и их аудиториям разом; попадание засчитывается один раз даже при нескольких рассылках). getReleaseAudience(listId, stream, allEmployers?) — кто реально получил письмо конкретного выпуска (узкая аудитория TASK-40, если есть, иначе все подтверждённые подписчики стрима) — НЕ резолвит, что именно они увидели (это getCandidateExposureCounts() выше); нужна runReleaseFollowUps() (app/actions.ts), которой важно только «дошло ли письмо», не его содержимое
    migrations/                     # SQL-миграции

components/
  language-provider.tsx             # RU/EN Context для главной страницы (localStorage, без смены URL)
  language-toggle.tsx                # Переключатель RU/EN в шапке
  home-page-content.tsx             # Вёрстка главной страницы (клиентский компонент — нужен для переключения языка)
  candidate-registration-modal.tsx  # Форма кандидата (публичная), мультиязычная (lib/i18n/candidate-form.ts)
  candidate-form-modal.tsx          # Одна модалка на добавление и редактирование кандидата через необязательный проп candidate (тот же приём, что release-detail-modal.tsx) — контакты, резюме, уровень, стримы, страны, дата активности (с кнопкой «Очистить»); история резюме/рассылок и «Исключённые компании»/«Исключённые стримы» — только в режиме редактирования
  candidate-section.tsx             # Фильтры (поиск/статус/стрим/уровень) + список + Pencil + пагинация; ссылка на `/profile/[id]` несёт `?secret=`, иначе менеджер увидел бы анонимную версию своего же кандидата. Для «Активный» рядом с «Отключить» — кнопка «Не публиковать» (`pauseCandidate()`, TASK-51) — ручная пауза, снимается кнопкой «Подтвердить» (как и «Отклонён»)
  employer-registration-modal.tsx   # Экспортирует константы (страны/стримы/способы связи) для переиспользования; мультиязычная (lib/i18n/employer-form.ts), сами значения констант не переводятся
  employer-edit-modal.tsx           # Редактирование работодателя — форма как у регистрации, без чекбокса согласия
  employer-create-modal.tsx         # Быстрое добавление работодателя из редактора (переиспользует registerEmployer)
  employer-section.tsx              # Фильтры (поиск/статус/страна/стрим) + список + Pencil + пагинация
  pagination-controls.tsx           # Переиспользуемый футер пагинации (размер страницы 10/25/50/100/Все + prev/next) — используется в candidate-section.tsx и employer-section.tsx
  company-autocomplete-input.tsx    # Поле «Компания» с автодополнением (searchCompanies); используется во всех 3 формах работодателя (TASK-36)
  companies-section.tsx             # Список компаний с раскрытием по клику — показывает людей внутри компании (TASK-36)
  streams-table.tsx                 # Inline-редактор стримов + счётчик подходящих кандидатов (TASK-27)
  contact-requests-section.tsx      # Имя кандидата (не только роль) кликабельно → `/profile/[id]?secret=...` в новой вкладке
  picker-rows.tsx                    # CandidateRow/EmployerPickerRow/CompanyGroup/EligibleCandidate (TASK-44 ✅, вынесены из release-create-modal.tsx) — нужны и разделу «Подборки» (состав), и разделу «Выпуски» (только employer-пикер узкой аудитории письма — кандидатов там больше не выбирают). CandidateRow — три строки слева (ФИО+«Активен с», уровень-пилюля, роли из `title` сплитом по " / ", та же логика, что в `profile-view.tsx`/`candidate-entry-card.tsx`) + колонка summary справа (`line-clamp-3`) — менеджер часто не помнит кандидата по фамилии, помнит по содержанию
  selections-section.tsx            # Раздел «Подборки» (TASK-44 ✅): по умолчанию видны подборки ВСЕХ стримов разом (фильтр «Все»/по стриму — опциональный, не обязательная навигация), в таблице — бейдж стрима, бейдж Общая/Ограниченная, дата подборки, статус (В пуле / Используется в неотправленном выпуске от … / Отправлена в выпуске от …); у ограниченной — работодатели с компанией у каждого в скобках («Имя (Компания)»), не просто имя. Unlink открепляет от неотправленного выпуска, Trash удаляет — оба недоступны для подборки уже отправленного выпуска. Форма создания/редактирования (`SelectionFormModal`) — тот же порядок полей, что раньше был у выпуска (стрим → дата → состав), дата редактируема и после создания; открывается компактной (только «Стрим»/«Дата», без кнопки «Сохранить») и расширяется до почти полного экрана (`max-w-[95vw] h-[90vh]`, с `transition-[max-width,height]`) только после выбора стрима — `compact = status === "success" || !stream`; кнопка «Сохранить» — отдельный `shrink-0`-футер под `border-t`, вне прокручиваемой области, всегда у низа диалога, рендерится только когда стрим выбран. Секция работодателей схлопываема (своя toggle-кнопка, тот же паттерн, что у «Кандидаты на паузе») — развёрнута по умолчанию для пустого выбора, свёрнута при редактировании уже ограниченной подборки, в свёрнутом виде показывает сводную строку выбранных «Имя (Компания)» вместо пикера. Кандидаты ищутся по ФИО (фильтрует и активный список, и «на паузе» разом — автораскрытие «на паузе», если совпадение только там); строка кандидата (`CandidateRow`, `components/picker-rows.tsx`) — ФИО/уровень/роли слева, полный `summary` без обрезки по центру (ряд растёт под него), `activeSince` колонкой справа
  editor-nav.tsx                    # Разделы: Выпуски/Подборки/Работодатели/Компании/Кандидаты/Запросы/Коммуникации/Стримы/Настройки
  publish-button.tsx
  contact-button.tsx
  general-inquiry-button.tsx
  profile-view.tsx                  # Карточка профиля кандидата, флаг `isEditor` переключает полный/анонимизированный рендер (имя/контакты/резюме — реальные значения в анонимном режиме не попадают в JSX вовсе, не просто CSS-блюр); `summary`, роли и уровень — исключение, видны в обоих режимах (не идентифицируют кандидата, та же логика, что уже на анонимной карточке подборки). `title` (роли через " / ") сплитуется на отдельные пилюли, не единой строкой — та же логика, что в `candidate-entry-card.tsx`; `level` рядом — тоже пилюля (раньше не отображался на этой странице вовсе)
  campaign-history.tsx              # История отправленных кампаний на странице выпусков
  import-candidates-button.tsx      # Кнопка на /editor/settings: проверить таблицу → превью → подтвердить импорт (TASK-39)
  candidate-digest-toggle.tsx        # Секция на /editor/settings (TASK-49 ✅, выделена из candidate-digest-section.tsx): только тумблер автоматической ежемесячной отправки
  candidate-digest-section.tsx      # Секция на /editor/communications: двухшаговая ручная отправка (TASK-48 ✅, тумблер переехал в CandidateDigestToggle/Настройки, TASK-49 ✅) — «Загрузить список» (previewCandidateDigest) → таблица с чекбоксами (по умолчанию все отмечены) + «Выбрать все»/«Снять все» → «Отправить выбранным (N)» (sendCandidateDigestToApproved, с confirm) + история запусков в `<details>`, схлопнута по умолчанию (TASK-49 ✅)
  release-follow-up-toggle.tsx       # Секция на /editor/settings (TASK-49 ✅, выделена из release-follow-up-section.tsx): только тумблер автоматической ежедневной проверки
  release-follow-up-section.tsx     # Секция на /editor/communications: та же двухшаговая ручная отправка (TASK-48 ✅, тумблер переехал в ReleaseFollowUpToggle/Настройки, TASK-49 ✅, previewReleaseFollowUps/sendReleaseFollowUpsToApproved) — таблица сгруппирована по выпуску (стрим — дата), под каждой группой строка «Уже оставили заявку: N — не отправляем», история запусков в `<details>`, схлопнута по умолчанию (TASK-49 ✅)
  candidate-entry-card.tsx          # Карточка кандидата в подборке — общая для /list/[listId] («Хочу связаться» активна) и /selection/[selectionId] (showContactButton=false, просто осмотр содержимого). `title` (роли через " / ") сплитуется на отдельные пилюли — менеджер вводит несколько ролей одной строкой, раньше показывались единым текстом
  release-create-modal.tsx          # Модалка создания выпуска — чистый пикер (TASK-44 ✅): переключатель «Все подписчики стрима»/«Выбранные получатели» (кому физически уйдёт письмо, TASK-40) + чекбокс-список уже подготовленных подборок стрима (SelectionPickerRow — бейдж, число кандидатов, ссылка «Просмотреть →»), без создания/правки состава на месте. RosterTable (всегда видимая таблица «кому что попадёт», подсвечивает недостающих) и SelectionPickerRow экспортируются, переиспользуются release-detail-modal.tsx
  release-detail-modal.tsx          # Одна модалка на два режима через readOnly: редактирование неотправленного выпуска (дата/узкая аудитория письма/выбор подборок — состав подборок не редактируется, только в /editor/selections) или просмотр отправленного (TASK-41, переписан под TASK-44 ✅). Доступные+присоединённые подборки стрима грузятся через getSelectionsForStream(stream) в режиме редактирования, полная резолюция через getMailingListDetail(listId) в readOnly

docs/
  backlog.adoc                      # ГЛАВНЫЙ ДОКУМЕНТ: все задачи и статусы
  manager-playbook.adoc             # Инструкция для нетехнического менеджера: кандидаты/работодатели/подборки/рассылка
  workspace.dsl                     # C4-архитектура (Structurizr)
  editor-stream-flow.puml           # Sequence-диаграмма жизненного цикла
  welcome-email-template.html       # Шаблон приветственного письма работодателю (TASK-10) — загружается вручную в SendPulse Automation 360
  welcome-email-template-candidate.html # Шаблон приветственного письма кандидату — тот же стиль, загружается вручную в SendPulse Automation 360 по триггеру «контакт добавлен в книгу „Candidates“» (см. «Email-уведомления кандидату» ниже)

public/
  telegram-notify-v8.png            # Картинка для Telegram-уведомления о выпуске (TASK-35 часть 2) — 640×180, сплошная заливка #007e80 + белая молния 150×150 (крупнее, чем в первой версии этой же пропорции, там была 100×100). Пользователь вернулся к этому соотношению сторон после экспериментов с каноническим Open Graph 1.91:1 (v5–v7) — на реальном устройстве 640×180 подтверждён чистым (без полос), несмотря на то что формально не совпадает с OG-стандартом. SendPulse шлёт это как is_external_attachment: true (Telegram рендерит как карточку превью ссылки) — имя версионировано намеренно: Telegram кэширует внешнее фото по точному URL (подтверждено тестом) — при следующей правке картинки увеличивать суффикс (-v9…), не перезаписывать файл на том же имени
```

## Ключевые решения и соглашения

### Google Sheets — `lib/sheets.ts` не часть боевого пути, но не мёртвый код
TASK-DB-4 ✅ перенесла кандидатов в Neon полностью — обычная работа приложения (регистрация, модерация, рассылки) не читает и не пишет `lib/sheets.ts`. Но файл не мёртвый: TASK-39 ✅ сделала его опциональным каналом массового ввода — менеджер заполняет таблицу вручную, кнопка на `/editor/settings` (`lib/sheets-import.ts`) читает новые строки и заводит кандидатов в Neon. Единственный потребитель файла — `lib/sheets-import.ts`.
- `HEADER_ALIASES` — словарь русских и английских синонимов заголовков → канонические ключи, через `mapHeader(header)`.
- `recoverPhoneColumn()` — чинит телефон, теряющий `+` из-за того, что Google Sheets трактует ячейку, начинающуюся с `+`/`-`/`=`, как формулу (`FORMATTED_VALUE` либо теряет `+`, либо отдаёт `#ERROR!`); тянет колонку «Phone» отдельным запросом с `valueRenderOption=FORMULA` и снимает ведущий `=`.
- `writeCandidateId()` — единственный оставшийся путь записи в лист: после импорта строки без собственного `id` дописывает сгенерированный `crypto.randomUUID()` обратно в ячейку `id`, иначе повторный импорт той же строки не распознал бы её как уже импортированную (дедуп по `id`/`email`/`phone` — а у строки без контактов не остаётся другого признака) и дублировал бы кандидата при каждом запуске.
- `getCandidates()` отдаёт `Status` как есть, без легаси-дефолта «пусто → Активный» — решение, что делать с пустым/неизвестным статусом, принимает только `importCandidatesFromSheet()` (`lib/sheets-import.ts`), не этот read-слой.

### Импорт кандидатов из Google-таблицы (TASK-39)
`lib/sheets-import.ts` — общая `categorize()` сортирует строки на «к импорту»/«дубликат»/«невалидная», переиспользуется и read-only превью (`previewCandidatesImport()`), и реальным импортом (`importCandidatesFromSheet()`) — превью и фактический запуск гарантированно совпадают по числам. Дубликат — совпадение `id`/`email`/`phone` с существующим кандидатом в Neon (всегда пропускается, импорт безопасно запускать повторно). Невалидна только строка без имени (`email`/`phone` — опциональны). `Status`: `"На проверке"`/`"Активный"` — как есть, иначе (включая пусто) — принудительно `"На проверке"`. `Stream`/`Excluded Streams` сверяются со списком активных стримов (`getStreams()`) — неизвестное название в ячейке тихо отбрасывается, остальные известные в той же ячейке сохраняются.

### Vercel Blob — резюме
- Загрузка: `POST /api/upload` → `put(filename, file, { access: "private" })`
- Прокси-URL хранится только в `candidateResumes.url` (Neon) — `candidates` не имеет колонки `resumeUrl` вовсе: `candidateResumes` — единственный источник правды, «текущая» версия — просто самая новая строка (`ORDER BY createdAt DESC`, см. `getResumeVersions()`)
- Прокси: `GET /api/resume` — читает blob server-side с `Authorization: Bearer BLOB_READ_WRITE_TOKEN`; необязательный `?filename=` задаёт имя скачиваемого файла (`Content-Disposition`, кириллица через `filename*=UTF-8''`) — иначе браузер скачивает файл под именем из blob-пути
- Защита от open redirect: проверка hostname `*.blob.vercel-storage.com`

### Neon — таблицы
- `candidates` — кандидаты (TASK-DB-4 ✅, было Google Sheets); `stream`/`excludedCompanies`/`excludedStreams` — нативные Postgres `text[]`; `activeSince` — настоящая `date`-колонка (`mode: "string"`, ISO `YYYY-MM-DD`, nullable = «не задано»), конвертация в/из привычного ru-RU текста («21.07.2026») изолирована на границе `lib/db/candidates.ts` — остальной код работает со строкой как раньше; нет колонки `resumeUrl` — резюме только в `candidateResumes` (см. выше). `email`/`phone` — `UNIQUE` + nullable (TASK-38 ✅; `NULL` = не указан — необязательное поле не может быть `NOT NULL DEFAULT ''` и `UNIQUE` одновременно, иначе второй кандидат без телефона не запишется: Postgres два `NULL` дублями не считает, а два `''` считал бы); конвертация `null ↔ ""` на той же границе модуля, внешний тип остаётся `string`. `salaryFrom`/`salaryTo` — нативный nullable `integer`, задел на будущее (зарплатные ожидания): колонки есть в БД, но ещё не читаются/не пишутся нигде в коде — ни в `Candidate`-типе (`lib/db/candidates.ts`), ни в формах, ни в UI; появятся вместе с конкретной задачей, которая их использует
- `contactRequests` — запросы работодателей на контакт с кандидатами; `employerToken` (FK на `employers.token`, `ON DELETE CASCADE` — запрос без работодателя не имеет смысла), `streamId` и `candidateId` (оба FK, `ON DELETE SET NULL` — запрос может быть «общим», без привязки к конкретному кандидату или стриму, и переживает удаление кандидата)
- `streams` — стримы (Industry/Functional), полный CRUD через `/editor/streams`
- `employers` — работодатели (TASK-DB-3); `token` — тот же UUID, что `employer_token` в SendPulse и `?e=` в публичной ссылке; `streams`/`additionalCountries` — нативные Postgres `text[]`; `companyId` — FK на `companies.id` (`ON DELETE SET NULL`); `email`/`phone` — `UNIQUE` (TASK-38 ✅; всегда заполнены, nullability не трогали — уникальность в коде `registerEmployer()` уже была, `UNIQUE` в БД — подстраховка от гонки). `name`/`email`/`phone`/`primaryContact`/`country` — `NOT NULL` без `DEFAULT` (TASK-38 ✅; все пять всегда валидируются перед записью, `''` для них никогда не было реальным состоянием — без default забытое поле падает на ограничении БД, а не тихо записывается пустым); `telegram`/`linkedin` сохранили `DEFAULT ''` — там пустая строка законна (другой способ связи)
- `companies` — компании работодателей (TASK-36), отдельная сущность — одна компания может иметь несколько работодателей (людей); `name` — `unique()`. Поле «Компания» обязательно при регистрации, с автодополнением по существующим названиям (`findOrCreateCompanyByName()`, case-insensitive через `ilike`); записи без компании получают реальную строку-плейсхолдер «Не определено» (не NULL), управляемую как любая другая компания
- `candidateResumes` — история версий резюме кандидата (TASK-32); `candidateId` — FK на `candidates.id`, `ON DELETE CASCADE` (резюме не живёт без кандидата)
- `mailingLists` — заголовок выпуска рассылки (TASK-40 ✅, одна строка на выпуск; раньше `streamId`/`targetDate` были продублированы на каждой строке `mailingListEntries`): `streamId` (FK на `streams.id`, `ON DELETE SET NULL`); `targetDate` — `timestamp` (не `date`, `mode: "string"` по той же причине, что `candidates.activeSince`), задел на будущую автоматизацию по дате и времени — UI пока выбирает только дату; `recipientLabel` — имена компаний ограниченной рассылки (`""` = весь стрим), только для читаемости (суффикс имени кампании, бейдж в редакторе); `sentCampaignId` — реальный id кампании SendPulse, пишется один раз на первой успешной отправке (`markMailingListSent()`), **единственный источник истины «отправлен ли выпуск» во всём приложении** — заменил хрупкое сравнение строки `${stream} — ${date}` с именами кампаний SendPulse везде, где оно использовалось (`publishMailingList()`, `deleteMailingList()`, `streamHasSentReleases()`, бейдж «Отправлено», история рассылок кандидата)
- `mailingListRecipients` — переопределение получателей ПИСЬМА ограниченной рассылки (TASK-40 ✅; ось «кому физически уйдёт письмо», отдельная от «подборки» ниже — наличие строк для `listId` = узкая SendPulse-книга только для этих работодателей, отсутствие = весь стрим (по умолчанию); `listId` — FK на `mailingLists.id`, `ON DELETE CASCADE`; `employerToken` — FK на `employers.token`, `ON DELETE CASCADE`
- `selections`/`selectionEntries`/`selectionEmployers` — **подборка** («что увидит конкретный работодатель по ссылке»), отделена от **рассылки** (`mailingLists` — «кому и когда уйдёт письмо») — TASK-44 ✅, раздел `/editor/selections`. `selections` — пул, не дочерняя сущность выпуска: `streamId` (`NOT NULL`, `ON DELETE CASCADE` — какому стриму подготовлена, нужно и до присоединения к выпуску), `targetDate` (`NOT NULL`, `mode: "string"`, своя дата подборки — задаётся при создании, редактируется отдельно, независимо от даты выпуска, в который подборку в итоге заберут) и `listId` (nullable, `ON DELETE SET NULL` — `NULL` = свободна в пуле; удаление выпуска открепляет его подборки обратно в пул, не уничтожает их). У одного ПРИСОЕДИНЁННОГО к выпуску набора может быть не более одной дефолтной `selections`-строки (без `selectionEmployers` — видна всем, у кого нет ограниченной) и любое число ограниченных (с ≥1 `selectionEmployers` — видны только этим работодателям, их `filterCandidatesForEmployer` вообще не касается — ни гео-фильтр, ни `excludedCompanies`/`excludedStreams` кандидата, менеджер уже решил вручную); в самом пуле одновременно может быть сколько угодно no-employer подборок — ограничение проверяется в коде (`validateSelectionChoice()`, `app/actions.ts`) только на момент присоединения к конкретному `listId`. Дефолтная опциональна — валидный случай, когда ограниченные покрывают всех подписчиков стрима; тогда работодатель без своей увидит на `/list/[listId]` состояние «подборка не готова» (не 404 — письмо он всё равно получил, если рассылка не сужена через `mailingListRecipients`). `selectionEntries.selectionId`/`selectionEmployers.selectionId` — `ON DELETE CASCADE`. Состав подборки (кандидаты/работодатели) редактируется только в `/editor/selections` — независимо от того, свободна она в пуле или присоединена к ещё не отправленному выпуску; сторона выпуска — только выбор (attach/detach), никогда редактирование состава. Все исторические «ограниченные рассылки» (TASK-40, `mailingListRecipients` непуст) при бэкафилле TASK-44 сначала получили общую подборку по ошибке — донастроены отдельным скриптом: их `selectionEmployers` заполнены теми же токенами, что были в `mailingListRecipients`, `label` — тем же `recipientLabel` (19 из 23 исторических выпусков оказались фактически ограниченными, не общими)
- Миграции: `scripts/migrate.mjs`

### Telegram-бот (SendPulse)
- Работодатель подписывается по ссылке `tg.pulse.is/<бот>?start=<flow_id>&employer_token=<token>` — SendPulse сохраняет токен в переменную контакта бота
- Контакт ищется по `employer_token` через API (`getByVariable`); отправка — `sendTelegramToEmployer()` (находит контакт только среди активных, `status === 1`), отключение/удаление контакта в боте — `disableTelegramContact()`/`deleteTelegramContact()` (вызываются из `rejectEmployer()`/`deleteEmployer()`), обратное включение — `enableTelegramContact()` (вызывается из `confirmEmployer()`, ДО `sendTelegramToEmployer()` — иначе приветственное сообщение молча не уйдёт отключённому контакту; возвращает `true`, только если контакт реально был отключён и его пришлось включать обратно — на это `confirmEmployer()` ориентируется, чтобы НЕ слать повторное «заявка одобрена» при реактивации после отключения: это сообщение уже уходило один раз при первом подтверждении, а при отключении никакого сообщения не было, так что и при обратном включении его тоже быть не должно) — всё в `lib/sendpulse.ts`, best-effort
- **Токен бота — наш** (создан через @BotFather, вставлен в SendPulse, не наоборот) — при желании можно перейти на self-hosted бота без потери подписчиков (см. `docs/backlog.adoc`)
- `employers.telegramId` (Neon) — Telegram user id, синхронизируется при каждой загрузке `/editor/employers` из ответа SendPulse (пишется при подключении, чистится, если SendPulse контакт больше не находит); задел на случай перехода на self-hosted бота — этот id адресуется напрямую через Telegram Bot API, независимо от SendPulse
- Та же синхронизация поправляет и `employers.telegram` (@username) на реальный подключённый аккаунт — работодатель вписывает его вручную при регистрации, но может открыть ссылку-приглашение с другого Telegram-аккаунта; обновляется только при реальном совпадении (никогда не затирается в пустую строку)

### Email-уведомления кандидату

Три письма кандидату, два разных механизма — выбор механизма определяется политикой SendPulse (транзакционный SMTP-канал — только для писем по конкретному разовому событию, не для периодических bulk-рассылок всем разом):

- **Триггерное письмо согласия** — уходит сразу, как только работодатель нажимает «Хочу связаться» (`submitContactRequest()` → `sendTransactionalEmail()`, `lib/sendpulse.ts`, SMTP API). Только кандидатам с email. Содержит **только** `employer.company` — никогда `employer.name`/email/телефон. Просит подтвердить согласие **ответом на письмо** (не кнопкой — у пользователя уже проверено, что так выше конверсия в согласие); дальше работодатель получает контакты и общается с кандидатом напрямую. Сбор и обработка ответов кандидатов — осознанно не реализованы в этой итерации.
- **Приветственное письмо при подтверждении** (`approveCandidate()`) — как и у работодателя (TASK-10): код приложения не шлёт HTML, только добавляет кандидата в адресную книгу SendPulse «Candidates» (`SENDPULSE_CANDIDATE_BOOK_NAME`); сама отправка — Automation 360-флоу «контакт добавлен в книгу», настраивается вручную в интерфейсе SendPulse по шаблону `docs/welcome-email-template-candidate.html`.
- **Ежемесячный дайджест** («сколько работодателей увидели ваше резюме») — **книга + кампания + мердж-тег**, не транзакционный цикл: периодическая рассылка всем подтверждённым кандидатам разом — по сути bulk-механика, даже при персональном содержимом (число работодателей у каждого своё). `runCandidateDigest("cron")` (`app/actions.ts`, не тронута TASK-48) при каждом крон-запуске реконсилирует книгу «Candidates» (убирает тех, кто больше не подходит, добавляет/обновляет остальных с переменной `digest_count`), затем создаёт одну кампанию с мердж-тегом `{{digest_count}}` в теме и теле (`buildDigestEmailHtml()`, `lib/email-templates.ts`). Число — реальный подсчёт через `getCandidateExposureCounts()` (`lib/db/mailing-lists.ts`), но если меньше 8 — случайное 8–16. «Показан работодателю» = кандидат попал в подборку, которую этот работодатель реально увидел (та же резолюция, что `/list/[listId]`), один раз на работодателя, даже при нескольких рассылках. Ручная отправка (TASK-48 ✅, `previewCandidateDigest()`/`sendCandidateDigestToApproved()`) использует ТУ ЖЕ формулу для `shown`, но отдельную книгу — см. ниже.
  **`digest_count` обязательно передаётся В ОДНОМ вызове `addToAddressBook()` вместе с `Имя`/`phone`, не отдельным вызовом** — реальный баг TASK-45 (пойман пользователем вживую на уже отправленном письме, исправлен в TASK-48): `POST /addressbooks/{id}/emails/variable` (отдельное обновление одной переменной) молча ничего не делает, если это имя переменной ещё не зарегистрировано в схеме адресной книги — схему создаёт только массовое добавление контактов (`POST /addressbooks/{id}/emails`) из переданных `variables`. Раньше код ставил `digest_count` вторым отдельным вызовом, и переменная никогда не попадала в схему — мердж-тег `{{digest_count}}` оставался пустым в реально отправленных письмах, баг жил с первого шипа TASK-45 незамеченным.
- **Одна книга «Candidates» на приветственный триггер и КРОН-дайджест**, не две раздельные. Риск ложного приветственного письма всем существующим кандидатам при первой же реконсиляции дайджеста снимается **порядком действий**, не архитектурой — книгу сначала наполняют первым прогоном дайджеста, потом включают Automation 360 в SendPulse (см. `docs/welcome-email-template-candidate.html` и шаги в PR/бэклоге). **Ручная отправка с предпросмотром (TASK-48 ✅) книгу «Candidates» не трогает вообще** — у неё своя отдельная постоянная книга `SENDPULSE_CANDIDATE_DIGEST_SEND_BOOK_NAME` (дефолт «Candidates Digest Manual»), которую каждый ручной запуск полностью очищает и наполняет заново только менеджер-одобренным подмножеством; причина разделения — если бы снятие галочки с кандидата означало удаление его из «Candidates», то его следующее добавление туда (например, в следующем месяце) было бы настоящим новым событием «контакт добавлен в книгу» и ошибочно повторно триггернуло бы приветственное письмо через Automation 360.
- **Отклонение/удаление кандидата** (`rejectCandidate()`/`deleteCandidate()`) убирает его из книги «Candidates» — симметрично `removeEmployerFromSendPulse()`. **Статус «Не публиковать»** (ручная пауза менеджером, `pauseCandidate()`, TASK-51 — бывшая авто-пауза TASK-05 после 3-й отправки убрана) — технический, не отказ: кандидат остаётся в книге и в дайджесте (`getConfirmedCandidates()`, `lib/db/candidates.ts`, статус «Активный» ИЛИ «Не публиковать»).
- **Отправитель** — `career@talentlabstreams.com` (`SENDPULSE_CANDIDATE_FROM_EMAIL`/`_NAME`) для обоих писем кандидату; рассылки работодателям — `partner@talentlabstreams.com` (`SENDPULSE_EMPLOYER_FROM_EMAIL`/`_NAME`); `hello@` — только приветственное письмо работодателю (TASK-10, не трогается кодом). DKIM настроен на уровне домена, по ящикам — только регистрация имени отправителя в SendPulse (Settings → Senders).
- `/editor/settings` — тумблер автоматической плановой отправки (`CandidateDigestToggle`, крон, первый понедельник месяца, не затронут TASK-48/49), ничего больше. `/editor/communications` — секция «Ежемесячный дайджест кандидатам» (`CandidateDigestSection`, TASK-49 ✅, выделена из прежней `/editor/settings`-секции): кнопка «Загрузить список» (TASK-48 ✅, `previewCandidateDigest()`) открывает предпросмотр с чекбоксами (по умолчанию все отмечены) перед ручной отправкой — «Отправить выбранным (N)» (`sendCandidateDigestToApproved()`) шлёт только одобренному подмножеству через ОТДЕЛЬНУЮ постоянную книгу `SENDPULSE_CANDIDATE_DIGEST_SEND_BOOK_NAME` (дефолт «Candidates Digest Manual»), не «Candidates» — чтобы снятие галочки с кандидата никогда не трогало членство в книге-триггере Automation 360 (см. ниже); число `shown`, увиденное менеджером в таблице, замораживается на этапе предпросмотра и не пересчитывается при отправке. История запусков (`candidateDigestRuns`) показывает оба вида запуска одинаково, схлопнута по умолчанию (`<details>`, TASK-49 ✅).

### Email-фоллоу-апы работодателям после рассылки

Постоянный процесс (TASK-46), работает на каждый будущий отправленный выпуск, не разовая акция по текущим. Решает per (выпуск, работодатель) пара, что́ отправить, по двум сигналам от SendPulse/приложения — **транзакционный SMTP** (`sendTransactionalEmail()`), не книга+кампания: в отличие от дайджеста кандидатам (одно письмо всем разом по календарю), здесь каждая отправка по-настоящему обусловлена поведением конкретного работодателя вокруг его собственного выпуска.

- **Два письма, статичные тексты от пользователя**: «Помогите нам сделать подборки точнее» (`buildFollowUpFeedbackEmailHtml()`) — тем, кто открыл письмо выпуска, но не оставил запрос; персонализированное напоминание (`buildFollowUpReminderEmailHtml()`, имя/стрим/ссылка на тот же `/list/[listId]?e=token`) — тем, кто письмо вообще не открыл. Третий исход — «skipped» (решение вынесено, письмо не нужно): работодатель, уже отправивший запрос именно по этому выпуску (`getEmployerTokensWithRequestForList()`, `lib/db/contact-requests.ts`), никогда не получает ни одно из двух писем — **запрос перевешивает статус открытия** (open-tracking пиксель ненадёжен — блокировка картинок и т.п. даёт `opened=false` даже у реально вовлечённого работодателя; обратное — поймано вживую драй-раном, см. ниже).
- **Открыл/не открыл** — `getCampaignEmailStatus(campaignId, email, token)` (`lib/sendpulse.ts`, `GET /campaigns/{id}/email/{email}`, **единственное число** в пути — похожий путь с `emails` во множественном числе существует и выглядит правдоподобно, но отдаёт 404 на каждый запрос; это разошлось с `mcp__claude_ai_SendPulse__email_campaigns_emails_show`, который вызывает правильный путь под капотом, так и было поймано). `detailStatus >= 3` = открыто (3 = Opened, 4 = Link redirected — переход по ссылке подразумевает открытие).
- **Окно 3–21 день после отправки** (`FOLLOW_UP_MIN_DAYS_AFTER_SEND`/`FOLLOW_UP_MAX_DAYS_AFTER_SEND`, `app/actions.ts`) — защита от того, что первый/запоздавший запуск ретроактивно обработает весь исторический бэклог выпусков (23+, за месяцы) в момент запуска фичи или возобновления после паузы: только недавние выпуски вообще попадают в окно, и это же окно — реалистичный срок «успел ли открыть».
- **Каждая пара (выпуск, работодатель) решается один раз навсегда** — `releaseFollowUps` (unique по `listId`+`employerToken`), `getEvaluatedFollowUpKeys()`/`recordFollowUpOutcome()` (`lib/db/release-follow-ups.ts`). Ежедневный крон (`app/api/cron/release-follow-ups/route.ts`) поэтому безопасно гонять каждый день — уже решённые пары просто пропускаются, включая «skipped».
- **Аудитория выпуска** — `getReleaseAudience(listId, stream, allEmployers?)` (`lib/db/mailing-lists.ts`): узкая аудитория (TASK-40), если есть, иначе все подтверждённые подписчики стрима — кто реально получил письмо, не что в нём увидел (это отдельный вопрос, `getCandidateExposureCounts()` выше).
- `/editor/settings` — тумблер ежедневного автозапуска (`ReleaseFollowUpToggle`, крон, `runReleaseFollowUps("cron")`, не тронут TASK-48/49), ничего больше. `/editor/communications` — секция «Фоллоу-ап после рассылки работодателям» (`ReleaseFollowUpSection`, TASK-49 ✅, выделена из прежней `/editor/settings`-секции): двухшаговая ручная отправка (TASK-48 ✅) — «Загрузить список» (`previewReleaseFollowUps()`) считает ту же классификацию (включая живые вызовы `getCampaignEmailStatus()`), ничего не шлёт и не пишет, группирует actionable-строки по выпуску, уже решённых «skipped» показывает только числом; «Отправить выбранным (N)» (`sendReleaseFollowUpsToApproved()`) перед каждой строкой сверяется с `getEvaluatedFollowUpKeys()` (защита от гонки с конкурентным кроном между предпросмотром и подтверждением — SendPulse повторно не перезапрашивается, открытие/заявка не могут «отмениться» в опасную сторону). История запусков (`releaseFollowUpRuns`) показывает оба вида запуска одинаково, схлопнута по умолчанию (`<details>`, TASK-49 ✅).
- Telegram-часть (третье письмо из исходного запроса пользователя) **сознательно не реализована** — пользователь прислал текст с пометкой «на согл.», ещё не финализирован; добавится отдельно, когда текст будет готов.

### Server Actions
Все мутации — в `app/actions.ts`. После мутации, меняющей UI редактора, вызывать `revalidatePath(...)`.

Пользовательские ошибки валидации (не баги) возвращаются как `{ ok: true } | { ok: false, error }`, не через `throw` — Next.js подменяет сообщение любого `throw new Error()` из Server Action на обобщённый текст в продакшен-сборке. Паттерн у `registerEmployer`/`updateEmployer`/`registerCandidate`/`createCandidate`/`updateCandidate` (TASK-38); неожиданные ошибки (не связанные с вводом пользователя) всё ещё пробрасываются как есть.

`"use server"` в начале файла требует, чтобы КАЖДЫЙ экспорт был async-функцией — поэтому чистые синхронные хелперы, которые нужны и `app/actions.ts`, и server-компонентам (например `campaignNameFor()`), живут в `lib/db/*.ts` (только `import "server-only"`, без этого ограничения), не в `app/actions.ts`.

### Доступ к редактору
`/editor/*` защищён: `if (editorSecret && secret !== editorSecret) notFound()`.
Параметр `?secret=` передаётся через `EditorNav` во все ссылки. Этот постраничный чек не трогает мутации — см. «Авторизация Server Actions» ниже.

### Авторизация Server Actions (TASK-50)

До этой задачи `?secret=`-проверка существовала только на уровне страниц — ни один экспорт `app/actions.ts` её не повторял, а «use server» делает каждый экспорт отдельным сетевым POST-эндпоинтом независимо от того, вызывает ли его реально какой-то клиентский компонент: раздобыв action-id (devtools, логи), можно было дёрнуть `approveCandidate`/`deleteCandidate`/`publishMailingList` и любой другой мутирующий экшен напрямую, мимо страницы.

Два независимых слоя, не один — постраничные `?secret=`-проверки не изменились, они и дальше решают, что показывать при рендере. Новый слой — `requireEditorAuth()` (`lib/auth.ts`), первой строкой в каждом editor-only экшене `app/actions.ts` (~43 из 50 экспортов): пропускает при валидной куке ИЛИ заголовке `x-editor-token === EDITOR_SECRET`, иначе бросает `Unauthorized`. Если `EDITOR_SECRET` не задан вовсе — не гейтит, как и постраничные проверки.

- **`proxy.ts`** (переименованный в Next.js 16 `middleware.ts`, matcher `/editor/:path*`) — единственная роль: по валидному `?secret=` (а) ставит подписанную (`jose`, `SESSION_SECRET`) HttpOnly-куку `ts_editor_session` на будущие запросы и (б) пробрасывает заголовок `x-editor-token` на ТЕКУЩИЙ запрос (`NextResponse.next({ request: { headers } })`) — иначе первый визит по `?secret=`-ссылке сломался бы: кука долетит до браузера только со следующего запроса, а SSR-чтения на этой же странице (`getCandidateDigestRuns()` и т.п.) случаются раньше. Домен куки не указывается явно — по умолчанию она скопирована на хост текущего запроса, поэтому продакшен и любой preview-домен Vercel (`*.vercel.app`) получают каждый свою рабочую куку без дополнительной настройки.
- **Исключения, без `requireEditorAuth()`**: публичные экшены (`registerCandidate`, `registerEmployer`, `searchCompanies` — нужен и публичной форме, и редактору, `submitContactRequest`, `submitGeneralInquiry`) и `runCandidateDigest`/`runReleaseFollowUps` (вызываются только крон-роутами через `CRON_SECRET`, другой секрет и другой заголовок — ни один клиентский бандл их не импортирует, action-id никогда не попадает в браузер).
- **`publishMailingList` не требует спецкейса** — вызывается И кнопкой в редакторе (браузер, кука), И `/api/publish/[listId]/route.ts` (curl, свой же `EDITOR_SECRET`-чек через заголовок `x-editor-token`, `?token=` убран как неиспользуемый — см. ниже). Рассмотренная и отклонённая альтернатива: передавать флаг типа `{ preAuthorized: true }` третьим аргументом — отклонено как дырявое решение: Server Action — сетевой endpoint, и такой флаг может прислать любой вызывающий в raw POST, минуя проверку (аргумент функции — не граница доверия, в отличие от куки/заголовка из реального запроса). Вместо этого маршрут вызывает `publishMailingList()` как обычный функциональный вызов в том же контексте запроса — `headers()` внутри `requireEditorAuth()` видит тот же `x-editor-token`, что был в исходном curl-запросе, и пропускает без всяких исключений.

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
| Пауза публикации кандидата — ручная (кнопка «Не публиковать» в `/editor/candidates`, снимается «Подтвердить»); автоматика (2 недели/3 месяца/после 3-й отправки, TASK-05) убрана как мешающая | ✅ TASK-51 |
| Мультиязычная главная страница (RU/EN, переключатель без смены URL) | ✅ |
| Подключение работодателя к Telegram-боту SendPulse, уведомление о подтверждении + рассылка выпусков в Telegram (после перехода на платный тариф) | ✅ TASK-35 |
| Компания работодателя — обязательное поле, отдельная сущность с FK, автодополнение, раздел «Компании» | ✅ TASK-36 |
| Страны работодателя — страна нахождения обязательна (+ опция «Другая»), пустой список доп. стран трактуется как «Любая» | ✅ TASK-37 |
| Уникальность email/телефона у кандидатов и работодателей (`UNIQUE` на уровне БД, дружелюбная ошибка) | ✅ TASK-38 |
| Импорт кандидатов из Google-таблицы в Neon (`/editor/settings`, превью → подтверждение, дедуп по id/email/phone) | ✅ TASK-39 |
| Рассылка по выбранным получателям (компании/работодатели, не только весь стрим) + заголовочная таблица выпусков (`mailingLists`), `sentCampaignId` вместо сравнения по имени кампании | ✅ TASK-40 |
| Редактирование неотправленного выпуска (дата/кандидаты/получатели) + просмотр отправленного в рид-онли режиме («кому мы это направляем») | ✅ TASK-41 |
| Ретрай гонки индексации при отправке ограниченной рассылки (`error_code 798`) + ежедневный крон-очистка одноразовых SendPulse-книг после модерации | ✅ TASK-43 |
| Подборки — отдельный раздел редактора (видны все сразу, фильтр по стриму опционален), готовятся заранее со своей датой (общая/ограниченная), выпуск только выбирает их (attach/detach, не создаёт/редактирует состав); резолв по ссылке (ограниченная → дефолтная → «не готова»), всегда видимый ростер «кому что попадёт», подтверждение перед отправкой при пробелах | ✅ TASK-44 |
| Email-уведомления кандидату (триггерное письмо-согласие при «Хочу связаться», приветственное письмо при подтверждении через книгу SendPulse + Automation 360, ежемесячный дайджест «сколько работодателей увидели» через книгу+кампанию+мердж-тег с ручным/плановым управлением из `/editor/settings`) + Vercel Analytics | ✅ TASK-45 |
| Email-фоллоу-апы работодателям после рассылки (через 3–21 день: «отзыв» — открыл, но не оставил заявку; «напоминание» — не открыл вовсе; запрос перевешивает статус открытия) — транзакционные письма, ежедневный крон/ручной запуск из `/editor/settings`, каждая пара выпуск+работодатель решается один раз навсегда | ✅ TASK-46 |
| Предпросмотр перед ручной массовой отправкой (дайджест кандидатам + фоллоу-ап работодателям) — «Загрузить список» показывает получателей с чекбоксами перед реальной отправкой, снятая галочка не запоминается как решение; крон не затронут, остаётся полностью автоматическим; ручная отправка дайджеста использует отдельную постоянную книгу SendPulse, не «Candidates» (чтобы не трогать триггер Automation 360) | ✅ TASK-48 |
| Раздел «Коммуникации» (`/editor/communications`) — ручная отправка с предпросмотром (дайджест кандидатам + фоллоу-ап работодателям, TASK-48) вынесена из «Настроек» в отдельный раздел; в «Настройках» остались только тумблеры автоматики; история запусков в обоих — схлопнутый `<details>`, раскрывается по клику | ✅ TASK-49 |

## Активные задачи (приоритет)

1. **TASK-25** — гео-сегментация рассылки: ждёт решения о переходе на Unisender (исследование SendPulse завершено, все тарифы не подходят)
2. **TASK-12** — summary кандидата в теле email-рассылки
3. **TASK-45 (ручные шаги)** — после деплоя: добавить env-переменные в Vercel, зарегистрировать `career@`/`partner@` как отправителей в SendPulse, затем **в этом порядке** — наполнить книгу «Candidates» первым запуском дайджеста, только потом включить Automation 360-флоу приветственного письма (см. `docs/backlog.adoc`, TASK-45)
4. **TASK-47 (идея)** — ретрай отправки выпуска через Vercel Workflows при лимите SendPulse «4 кампании в час»; сознательно НЕ распространять на фоллоу-апы TASK-46 (у них уже есть самовосстанавливающийся cron-свип, workflow тут лишняя эксплуатационная поверхность)
5. **TASK-48 (ручной шаг)** — после деплоя: добавить `SENDPULSE_CANDIDATE_DIGEST_SEND_BOOK_NAME` в Vercel (локально уже в `.env.local`)

Полный список с деталями — `docs/backlog.adoc`.

## Запуск локально

```bash
npm install
npm run dev   # http://localhost:3000
```

## Архитектура и диаграммы

- `docs/workspace.dsl` — C4-модель (Structurizr DSL, открывается на structurizr.com/dsl)
- `docs/editor-stream-flow.puml` — PlantUML sequence-диаграмма всего жизненного цикла
