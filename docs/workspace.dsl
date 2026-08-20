workspace "TalentStreams" "Платформа подборки проверенных кандидатов для работодателей Центральной Азии" {

  !identifiers hierarchical

  model {

    # ── Акторы ──────────────────────────────────────────────────────────────

    employer = person "Работодатель" "Просматривает анонимные подборки кандидатов, подписывается на рассылку, отправляет запросы на контакт" "User"
    candidate = person "Кандидат" "Регистрируется для включения в подборки" "User"
    editor = person "Редактор" "Ведёт данные кандидатов и стримов в Google Sheets; подтверждает заявки работодателей и запускает рассылки через /editor" "Internal"

    # ── Внешние системы ──────────────────────────────────────────────────────

    googleSheets = softwareSystem "Google Sheets" "Хранилище данных: профили кандидатов, подборки рассылок, заявки работодателей. Стримы и Contact Requests перенесены в Neon." "External"

    neon = softwareSystem "Neon (PostgreSQL)" "Serverless PostgreSQL через Vercel Marketplace. Таблицы: contactRequests, streams. Подключение через neon-http driver (HTTP, без WebSocket)." "External"

    sendPulse = softwareSystem "SendPulse" "Email-маркетинг: адресные книги подписчиков (мастер + по стримам), рассылки кампаний" "External"

    vercelBlob = softwareSystem "Vercel Blob" "Приватное файловое хранилище резюме кандидатов. Доступ через прокси /api/resume с Bearer-токеном. Хранит файлы: PDF, DOC, DOCX, RTF, ODT (до 5 МБ)." "External"

    # ── Основная система ─────────────────────────────────────────────────────

    talentStreams = softwareSystem "TalentStreams" "Next.js-приложение: публичный сайт с подборками кандидатов, формами регистрации и редактором выпусков" {

      webApp = container "Web Application" "Server-side рендеринг, Server Actions, интеграции с Google Sheets и SendPulse" "Next.js 14, TypeScript" "WebApp" {

        # Pages (Server Components)
        homePage = component "HomePage (/)" "Лендинг: описание сервиса, формы регистрации работодателя и кандидата, список стримов с сервера" "Next.js Server Component" "Page"

        mailingListPage = component "MailingListPage (/list/[listId])" "Страница подборки: анонимные карточки кандидатов (без имён и контактов), теги, summary, disclaimer. Noindex. Доступ: ?e=[token] → персонализированная подборка с фильтрацией; ?secret=[EDITOR_SECRET] → все кандидаты; без параметров → 404." "Next.js Server Component" "Page"

        profilePage = component "ProfilePage (/profile/[id])" "Полный профиль кандидата. Недоступна со страниц подборок. Noindex." "Next.js Server Component" "Page"

        editorLayout = component "EditorLayout (/editor/*)" "Общий макет редактора: боковое меню с разделами. Каждый подмаршрут независимо защищён EDITOR_SECRET." "Next.js Layout" "Page"

        editorNav = component "EditorNav" "Боковая навигация редактора: читает ?secret= из URL и передаёт во все ссылки при переходе. Разделы: Выпуски, Работодатели, Кандидаты, Запросы, Стримы, Настройки." "React Client Component" "UI"

        releasesPage = component "ReleasesPage (/editor)" "Список выпусков: стрим, дата, кандидаты, история кампаний, кнопка рассылки, проверка пустой адресной книги, ссылка на подборку с секретом." "Next.js Server Component" "Page"

        employersPage = component "EmployersPage (/editor/employers)" "Управление работодателями: панель фильтров (поиск, статус — по умолчанию все, страна, стрим), плоский список вместо секций (TASK-30). Кнопки «Подтвердить» и «Отклонить»; Pencil открывает EmployerEditModal (TASK-31)." "Next.js Server Component" "Page"

        settingsPage = component "SettingsPage (/editor/settings)" "Настройки: миграция колонок Google Sheets через AddColumnsButton." "Next.js Server Component" "Page"

        candidatesPage = component "CandidatesPage (/editor/candidates)" "Список кандидатов: панель фильтров (поиск, статус — по умолчанию все, стрим, уровень), плоский список вместо секций (TASK-30). Рендерит CandidateSection." "Next.js Server Component" "Page"

        # Client Components
        employerModal = component "EmployerRegistrationModal" "Форма подписки работодателя: имя, компания, email, телефон, способ связи, выбор стримов. После отправки — статус «На проверке»." "React Client Component" "UI"

        candidateModal = component "CandidateRegistrationModal" "Форма регистрации кандидата: имя, email, телефон, сопроводительное письмо. Резюме — загрузить файл (PDF/DOC/DOCX/RTF/ODT, до 5 МБ) или указать URL — альтернативные варианты. Загрузка файла происходит при сабмите формы через POST /api/upload." "React Client Component" "UI"

        profileView = component "ProfileView" "Полная карточка профиля: имя, роль, bio, контакты, теги стримов, дополнительные поля. Кнопка «назад»." "React Client Component" "UI"

        contactButton = component "ContactButton" "Кнопка «Хочу связаться» на карточке подборки. Вызывает `submitContactRequest`, записывает запрос в лист «Contact Requests». Без токена — неактивна." "React Client Component" "UI"

        employerSection = component "EmployerSection" "Секция редактора (TASK-30): панель фильтров (поиск, статус, страна, стрим) вместо коллапсируемых групп; useMemo-фильтрация, комбинируются одновременно. Кнопки «Подтвердить» и «Отклонить»; Pencil на каждой строке открывает EmployerEditModal (TASK-31)." "React Client Component" "UI"

        candidateSection = component "CandidateSection" "Секция редактора (TASK-30): панель фильтров (поиск, статус, стрим, уровень) вместо коллапсируемых групп; useMemo-фильтрация. Кнопки «Добавить» / «Отклонить» для статуса «На проверке». Кнопка-карандаш (Pencil) на каждой строке открывает CandidateEditModal." "React Client Component" "UI"

        candidateEditModal = component "CandidateEditModal" "Модальная форма редактирования кандидата: контакты (имя, email, телефон), резюме файл/URL, сопроводительное письмо, уровень, стримы (multi-select), страна текущая/желаемая, дата активности (date-picker с конвертацией ISO↔ru-RU на границе компонента). При выборе файла резюме — загрузка в Vercel Blob через /api/upload на сабмит. После сохранения — экран подтверждения." "React Client Component" "UI"

        employerEditModal = component "EmployerEditModal" "Модальная форма редактирования работодателя (TASK-31): те же поля, что в EmployerRegistrationModal (имя, компания, email, телефон, способ связи, Telegram/LinkedIn, стримы, страна, доп. страны), без чекбокса согласия. Не переотправляет данные в SendPulse — только Sheets." "React Client Component" "UI"

        publishButton = component "PublishButton" "Кнопка запуска рассылки. Отключена если адресная книга пуста. Показывает статус кампании." "React Client Component" "UI"

        requestsPage = component "RequestsPage (/editor/requests)" "Управление запросами: два раздела — «Общие запросы» (без кандидата, 3 статуса) и «По кандидатам» (7 статусов). Выпадающий список для смены статуса." "Next.js Server Component" "Page"

        streamsPage = component "StreamsPage (/editor/streams)" "Редактор стримов: список Stream / Тип / Описание из Neon. Полный CRUD через inline-редактирование (StreamsTable), удаление и добавление новых строк. Пункт «Стримы» в EditorNav." "Next.js Server Component" "Page"

        contactRequestsSection = component "ContactRequestsSection" "Список запросов с цветными бейджами и выпадающим статусом. Разделён на «Общие запросы» и «По кандидатам»." "React Client Component" "UI"

        generalInquiryButton = component "GeneralInquiryButton" "Кнопка «Связаться с нами» в блоке «Не нашли подходящих». Пишет в Contact Requests без candidateId." "React Client Component" "UI"

        # Server Actions
        serverActions = component "Server Actions" "registerEmployer() — пишет в Sheets со статусом «На проверке».\nregisterCandidate() — пишет в Sheets.\npublishMailingList() — создаёт кампанию в SendPulse, тело письма без точного счётчика кандидатов (TASK-26).\nconfirmEmployer() — добавляет в SendPulse, затем статус «Подтверждён» в Sheets.\nrejectEmployer() — статус «Отклонён» в Sheets.\napproveCandidate() / rejectCandidate() — статусы кандидата в Sheets.\naddAllColumns() — миграция колонок (Sheets).\nsubmitContactRequest() — записывает запрос по кандидату в Neon.\nsubmitGeneralInquiry() — записывает общий запрос (candidateId='') в Neon.\nsetContactRequestStatus(id, status) — меняет статус запроса в Neon по id (UUID).\nupdateStream(id, data) / createStream(data) / deleteStream(id) — CRUD стримов в Neon (revalidatePath /editor/streams).\nupdateCandidate(rowIndex, data) — обновляет поля кандидата (включая stream/level/countryPrimary/countryDesired/activeSince) в Sheets через updateCandidateFields() (revalidatePath /editor/candidates).\nupdateEmployer(rowIndex, data) — обновляет поля работодателя в Sheets через updateEmployerFields(), не трогает SendPulse (revalidatePath /editor/employers)." "Next.js Server Actions" "Logic"

        publishApi = component "Publish API (/api/publish/[listId])" "HTTP-роут для запуска рассылки через curl или внешние системы. Защищён EDITOR_SECRET." "Next.js Route Handler" "Logic"

        uploadApi = component "Upload API (/api/upload)" "POST-роут загрузки резюме: принимает multipart/form-data, проверяет тип (PDF/DOC/DOCX/RTF/ODT) и размер (≤5 МБ), сохраняет в Vercel Blob (private, папка resumes/). Возвращает proxy URL вида APP_URL/api/resume?url=<encodedBlobUrl> для хранения в Google Sheets." "Next.js Route Handler" "Logic"

        resumeApi = component "Resume API (/api/resume)" "GET-роут прокси для приватных файлов Vercel Blob: получает ?url=, проверяет hostname (*.blob.vercel-storage.com), делает fetch с Authorization: Bearer BLOB_READ_WRITE_TOKEN и стримит ответ клиенту. Защита от open redirect по hostname." "Next.js Route Handler" "Logic"

        # Integrations
        sheetsLib = component "Sheets Library (lib/sheets.ts)" "Весь доступ к Google Sheets через Service Account JWT.\nАутентификация: safeJsonParse() устойчив к сырым переносам строк в private_key GOOGLE_SERVICE_ACCOUNT_JSON (артефакт vercel env pull); ошибки конфигурации — конкретные (что не задано/невалидно), не общая фраза.\nЧтение: профили, подборки, работодатели. Стримы перенесены в Neon.\nЗапись: регистрации работодателей и кандидатов (appendCandidateRow вызывает ensureCandidateColumns автоматически); статусы работодателей и кандидатов; поля кандидата (updateCandidateFields, включая stream/level/countryPrimary/countryDesired/activeSince); поля работодателя (updateEmployerFields, TASK-31).\nМиграция: ensureProfileColumns(), ensureEmployerColumns(), ensureCandidateColumns().\nАвтосоздание листов через ensureSheet().\ngetEmployerByToken() — поиск по токену.\nfilterCandidatesForEmployer() — фильтрация кандидатов: excludedCompanies, excludedIndustries, гео (countryPrimary/countryDesired vs employer.country/additionalCountries); «Любая» снимает гео-ограничение (TASK-24 ✅).\ncandidateMatchesStream() / getCandidatesForStream() — сопоставление кандидата стриму по колонке Stream (multi-select), без учёта регистра (TASK-27 ✅).\nContact Requests перенесены в Neon → lib/db/contact-requests.ts." "TypeScript, Google Sheets API v4" "Integration"

        dbLib = component "DB Library (lib/db/)" "Drizzle ORM + @neondatabase/serverless (neon-http driver).\nschema.ts — схемы таблиц contactRequests и streams.\nindex.ts — клиент drizzle(neon(DATABASE_URL)).\ncontact-requests.ts — appendContactRequest(), getContactRequests(), updateContactRequestStatus(id).\nstreams.ts — getStreams(), getStreamsDetailed(), createStreamRecord(), updateStreamRecord(), deleteStreamRecord().\nMigrations: scripts/migrate.mjs." "TypeScript, Drizzle ORM, Neon" "Integration"

        sendPulseLib = component "SendPulse Library (lib/sendpulse.ts)" "OAuth 2.0 с кэшем токена (59 мин). Кэш адресных книг с TTL 60 с.\ngetOrCreateBook() — авто-создание книги.\ngetBookEmailCount() — проверка подписчиков до рассылки.\ncreateCampaign() / getCampaigns()." "TypeScript, SendPulse REST API" "Integration"
      }
    }

    # ── Отношения: системный контекст ────────────────────────────────────────

    employer -> talentStreams "Просматривает подборки, подписывается на рассылку, запрашивает контакт с кандидатом"
    candidate -> talentStreams "Регистрируется как кандидат"
    editor -> googleSheets "Заполняет листы: Candidates, Mailing lists, Streams"
    editor -> talentStreams "Подтверждает работодателей, запускает рассылки через /editor"

    talentStreams -> googleSheets "Читает профили, подборки, работодателей; пишет заявки и статусы. Стримы перенесены в Neon." "HTTPS, Sheets API v4"
    talentStreams -> neon "INSERT/SELECT/UPDATE contactRequests и streams" "HTTPS, Neon HTTP API"
    talentStreams -> sendPulse "Добавляет подтверждённых работодателей; создаёт кампании" "HTTPS, REST API"
    talentStreams -> vercelBlob "Загружает резюме (PUT) и читает их (GET с Bearer-токеном) через /api/upload и /api/resume" "HTTPS, Vercel Blob API"

    # ── Отношения: контейнерный уровень ──────────────────────────────────────

    employer -> talentStreams.webApp "HTTPS"
    candidate -> talentStreams.webApp "HTTPS"
    editor -> talentStreams.webApp "HTTPS (/editor)"
    talentStreams.webApp -> googleSheets "Sheets API v4 / Service Account JWT" "HTTPS"
    talentStreams.webApp -> neon "Neon HTTP API / Drizzle ORM" "HTTPS"
    talentStreams.webApp -> sendPulse "OAuth 2.0 + REST API" "HTTPS"
    talentStreams.webApp -> vercelBlob "PUT resumes (upload) / GET resumes (proxy с Bearer-токеном)" "HTTPS"

    # ── Отношения: компонентный уровень ──────────────────────────────────────

    talentStreams.webApp.homePage -> talentStreams.webApp.employerModal "Рендерит"
    talentStreams.webApp.homePage -> talentStreams.webApp.candidateModal "Рендерит"
    talentStreams.webApp.profilePage -> talentStreams.webApp.profileView "Рендерит"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит (по одной на карточку)"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.publishButton "Рендерит (по одной на выпуск)"
    talentStreams.webApp.employersPage -> talentStreams.webApp.employerSection "Рендерит"
    talentStreams.webApp.editorLayout -> talentStreams.webApp.editorNav "Рендерит"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.sheetsLib "getCandidates()"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.dbLib "getStreams() — опции фильтра"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.candidateSection "Рендерит"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.serverActions "approveCandidate() / rejectCandidate()"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.candidateEditModal "Открывает при клике на Pencil"
    talentStreams.webApp.candidateEditModal -> talentStreams.webApp.uploadApi "POST /api/upload (при выборе файла)"
    talentStreams.webApp.candidateEditModal -> talentStreams.webApp.serverActions "updateCandidate(rowIndex, data)"
    editor -> talentStreams.webApp.candidatesPage "Модерирует, фильтрует и редактирует данные кандидатов"

    talentStreams.webApp.homePage -> talentStreams.webApp.sheetsLib "getStreams()"
    talentStreams.webApp.profilePage -> talentStreams.webApp.sheetsLib "getProfile(id)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getStreamsDetailed() — типы стримов для тегов на карточке (TASK-27)"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.sheetsLib "getMailingLists()"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount() — проверка пустой книги"
    talentStreams.webApp.employersPage -> talentStreams.webApp.sheetsLib "getEmployers()"
    talentStreams.webApp.employersPage -> talentStreams.webApp.dbLib "getStreams() — опции фильтра"

    talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(EmployerData)"
    talentStreams.webApp.candidateModal -> talentStreams.webApp.serverActions "registerCandidate(CandidateData)"
    talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
    talentStreams.webApp.employerSection -> talentStreams.webApp.serverActions "confirmEmployer() / rejectEmployer()"
    talentStreams.webApp.employerSection -> talentStreams.webApp.employerEditModal "Открывает при клике на Pencil"
    talentStreams.webApp.employerEditModal -> talentStreams.webApp.serverActions "updateEmployer(rowIndex, data)"

    talentStreams.webApp.publishApi -> talentStreams.webApp.serverActions "publishMailingList(listId)"

    talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "appendEmployerRow(), appendCandidateRow(), getMailingList(), updateEmployerStatus()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "addToSendPulse() / createCampaign()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "appendContactRequest() / updateContactRequestStatus(id)"

    editor -> talentStreams.webApp.releasesPage "Просматривает выпуски, запускает рассылку"
    editor -> talentStreams.webApp.employersPage "Подтверждает и отклоняет заявки работодателей"
    editor -> talentStreams.webApp.settingsPage "Управляет настройками и миграцией колонок"
    editor -> talentStreams.webApp.streamsPage "Управляет стримами: добавляет, редактирует, удаляет"
    editor -> talentStreams.webApp.publishApi "curl /api/publish/{listId}?token=…"

    talentStreams.webApp.sheetsLib -> googleSheets "fetchSheetValues(), values.update()" "HTTPS, Sheets API v4"
    talentStreams.webApp.dbLib -> neon "INSERT / SELECT / UPDATE contactRequests и streams" "HTTPS, Neon HTTP API"
    talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token, GET /addressbooks, POST /addressbooks/{id}/emails, POST /campaigns" "HTTPS"

    talentStreams.webApp.candidateModal -> talentStreams.webApp.uploadApi "POST /api/upload (при сабмите, если выбран файл)"
    talentStreams.webApp.uploadApi -> vercelBlob "put(filename, file, { access: 'private' })" "HTTPS, Vercel Blob API"
    talentStreams.webApp.resumeApi -> vercelBlob "fetch(blobUrl, { Authorization: Bearer token })" "HTTPS, Vercel Blob API"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.serverActions "updateStream() / createStream() / deleteStream()"

    talentStreams.webApp.requestsPage -> talentStreams.webApp.dbLib "getContactRequests()"
    talentStreams.webApp.requestsPage -> talentStreams.webApp.sheetsLib "getProfiles()"
    talentStreams.webApp.requestsPage -> talentStreams.webApp.contactRequestsSection "Рендерит"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.dbLib "getStreamsDetailed()"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.sheetsLib "getProfiles() — подсчёт подходящих кандидатов на стрим (TASK-27)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.generalInquiryButton "Рендерит (при наличии токена)"
    talentStreams.webApp.contactRequestsSection -> talentStreams.webApp.serverActions "setContactRequestStatus(id)"
    talentStreams.webApp.generalInquiryButton -> talentStreams.webApp.serverActions "submitGeneralInquiry()"
    talentStreams.webApp.contactButton -> talentStreams.webApp.serverActions "submitContactRequest()"
    editor -> talentStreams.webApp.requestsPage "Управляет запросами"
  }

  views {

    systemContext talentStreams "SystemContext" {
      include *
      autolayout lr
      description "Системный контекст TalentStreams — акторы и внешние зависимости"
    }

    container talentStreams "Containers" {
      include *
      autolayout lr
      description "Контейнеры TalentStreams"
    }

    component talentStreams.webApp "Components" {
      include *
      autolayout lr
      description "Компоненты Web Application"
    }

    dynamic talentStreams.webApp "EmployerRegistration" "Сценарий регистрации работодателя (заявка)" {
      talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(data)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "appendEmployerRow([..., 'На проверке'])"
      talentStreams.webApp.sheetsLib -> googleSheets "POST /values/Employers!A1:append"
      autolayout lr
    }

    dynamic talentStreams.webApp "EmployerApproval" "Сценарий подтверждения работодателя редактором" {
      talentStreams.webApp.employerSection -> talentStreams.webApp.serverActions "confirmEmployer(rowIndex, employerData)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "addToSendPulse(name, email, phone, { Streams, … })"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /addressbooks/MASTER/emails"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /addressbooks/STREAM_BOOK/emails"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "updateEmployerStatus(rowIndex, 'Подтверждён')"
      talentStreams.webApp.sheetsLib -> googleSheets "PUT /values/Employers!J{row}"
      autolayout lr
    }

    dynamic talentStreams.webApp "MailingListView" "Сценарий просмотра персонализированной подборки" {
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getEmployerByToken(?e= из searchParams)"
      talentStreams.webApp.sheetsLib -> googleSheets "GET Employers — поиск по token"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000"
      talentStreams.webApp.sheetsLib -> googleSheets "GET профили основного листа"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "filterCandidatesForEmployer(entries, employer)"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит кнопку под каждой анонимной карточкой (с employerToken)"
      autolayout lr
    }

    dynamic talentStreams.webApp "PublishMailingList" "Сценарий публикации выпуска редактором" {
      talentStreams.webApp.releasesPage -> talentStreams.webApp.sheetsLib "getMailingLists()"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000"
      talentStreams.webApp.releasesPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount(stream)"
      talentStreams.webApp.sendPulseLib -> sendPulse "GET /addressbooks?limit=500"
      talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "createCampaign(bookId, subject, html)"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token → POST /campaigns"
      autolayout lr
    }

    dynamic talentStreams.webApp "ContactRequest" "Сценарий запроса работодателя на контакт с кандидатом" {
      talentStreams.webApp.contactButton -> talentStreams.webApp.serverActions "submitContactRequest(candidateId, listId, employerToken)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "getEmployerByToken(token)"
      talentStreams.webApp.sheetsLib -> googleSheets "GET Employers — поиск по token"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "getMailingLists() — получение stream"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "appendContactRequest({id: uuid, listId, stream, candidateId, …, status: 'Новый запрос'})"
      talentStreams.webApp.dbLib -> neon "INSERT INTO contactRequests"
      autolayout lr
    }

    styles {
      element "Person" {
        shape Person
        background #1168bd
        color #ffffff
        fontSize 14
      }
      element "Internal" {
        background #08427b
        color #ffffff
      }
      element "Software System" {
        background #1168bd
        color #ffffff
        fontSize 14
      }
      element "External" {
        background #999999
        color #ffffff
      }
      element "Container" {
        background #438dd5
        color #ffffff
        fontSize 13
      }
      element "WebApp" {
        shape WebBrowser
      }
      element "Component" {
        background #85bbf0
        color #000000
        fontSize 12
      }
      element "Page" {
        background #438dd5
        color #ffffff
      }
      element "UI" {
        background #85bbf0
        color #000000
      }
      element "Logic" {
        background #e8a838
        color #000000
      }
      element "Integration" {
        background #85bbf0
        color #000000
        shape Hexagon
      }
    }
  }
}
