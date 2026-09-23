workspace "TalentStreams" "Платформа подборки проверенных кандидатов для работодателей Центральной Азии" {

  !identifiers hierarchical

  model {

    # ── Акторы ──────────────────────────────────────────────────────────────

    employer = person "Работодатель" "Просматривает анонимные подборки кандидатов, подписывается на рассылку, отправляет запросы на контакт" "User"
    candidate = person "Кандидат" "Регистрируется для включения в подборки" "User"
    editor = person "Редактор" "Ведёт данные кандидатов и стримов в Google Sheets; подтверждает заявки работодателей и запускает рассылки через /editor" "Internal"

    # ── Внешние системы ──────────────────────────────────────────────────────

    googleSheets = softwareSystem "Google Sheets" "Хранилище данных: профили кандидатов. Стримы, работодатели, Contact Requests и подборки рассылок (Mailing Lists, TASK-DB-5) перенесены в Neon — лист Mailing Lists удалён из таблицы полностью." "External"

    neon = softwareSystem "Neon (PostgreSQL)" "Serverless PostgreSQL через Vercel Marketplace. Таблицы: contactRequests (FK на employers/streams), streams, candidateResumes (TASK-32 — история версий резюме кандидата), employers (TASK-DB-3). Подключение через neon-http driver (HTTP, без WebSocket)." "External"

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

        releasesPage = component "ReleasesPage (/editor)" "Список выпусков: стрим, дата, кандидаты, история кампаний, кнопка рассылки, проверка пустой адресной книги, ссылка на подборку с секретом. Кнопка «Создать рассылку» (упрощённые TASK-28/TASK-29) открывает ReleaseCreateModal — для каждого стрима заранее считает подходящих кандидатов (getEligibleCandidatesForRelease) и подтверждённых подписчиков (confirmedEmployersForStream), передаёт готовыми map'ами. Рядом с PublishButton рендерит ReleaseDeleteButton, только если выпуск ни разу не отправлялся (alreadySent === false — та же переменная, что решает «Отправить»/«Отправить повторно»)." "Next.js Server Component" "Page"

        employersPage = component "EmployersPage (/editor/employers)" "Управление работодателями: панель фильтров (поиск, статус — по умолчанию все, страна, стрим), плоский список вместо секций (TASK-30). Кнопки «Подтвердить» и «Отклонить»; Pencil открывает EmployerEditModal (TASK-31)." "Next.js Server Component" "Page"

        settingsPage = component "SettingsPage (/editor/settings)" "Пустая заглушка «Пока здесь нечего настраивать» — задел на будущее. Раньше здесь была кнопка ручной миграции колонок Google Sheets (AddColumnsButton) для полей, добавленных после создания боевой таблицы; убрана — все нужные колонки уже есть, новых миграций не планируется." "Next.js Server Component" "Page"

        candidatesPage = component "CandidatesPage (/editor/candidates)" "Список кандидатов: панель фильтров (поиск, статус — по умолчанию все, стрим, уровень), плоский список вместо секций (TASK-30). Рендерит CandidateSection." "Next.js Server Component" "Page"

        # Client Components
        employerModal = component "EmployerRegistrationModal" "Форма подписки работодателя: имя, компания, email, телефон, способ связи, выбор стримов. После отправки — статус «На проверке»." "React Client Component" "UI"

        candidateModal = component "CandidateRegistrationModal" "Форма регистрации кандидата: имя, email, телефон, сопроводительное письмо. Резюме — загрузить файл (PDF/DOC/DOCX/RTF/ODT, до 5 МБ) или указать URL — альтернативные варианты. Загрузка файла происходит при сабмите формы через POST /api/upload. Передаёт, для файла, resumeFilename (тип 'file'/'link' сервер определяет сам по URL, не по клиенту) — первая версия резюме попадает в историю (TASK-32), так как id кандидата генерируется этой же формой синхронно (crypto.randomUUID()), не внешним скриптом." "React Client Component" "UI"

        profileView = component "ProfileView" "Полная карточка профиля: имя, роль, контакты (email/телефон), теги стримов, произвольные дополнительные поля из неопознанных колонок таблицы. Кнопка «назад»." "React Client Component" "UI"

        contactButton = component "ContactButton" "Кнопка «Хочу связаться» на карточке подборки. Вызывает `submitContactRequest`, записывает запрос в лист «Contact Requests». Без токена — неактивна." "React Client Component" "UI"

        employerSection = component "EmployerSection" "Секция редактора (TASK-30): панель фильтров (поиск, статус, страна, стрим) вместо коллапсируемых групп; useMemo-фильтрация, комбинируются одновременно. Кнопка «+ Добавить работодателя» открывает EmployerCreateModal. В строке EmployerRow: «Подтвердить»/«Отклонить» для «На проверке», «Отключить» для «Подтверждён», снова «Подтвердить» для «Отклонён» (возврат в рассылку — переиспользует тот же confirmEmployer(), что и первое подтверждение); «Отклонить» и «Отключить» вызывают один и тот же rejectEmployer() — SendPulse трогается по факту текущего статуса на сервере. Значок корзины (всегда) переключает строку в отдельный шаг подтверждения удаления вместо browser confirm(). Pencil на каждой строке открывает EmployerEditModal (TASK-31, только сохранение полей)." "React Client Component" "UI"

        candidateSection = component "CandidateSection" "Секция редактора (TASK-30): панель фильтров (поиск, статус, стрим, уровень) вместо коллапсируемых групп; useMemo-фильтрация. Список — настоящая таблица (TASK-32-доп.), не карточки: Кандидат / Контакты / Файлы / Ссылки / Дата регистрации / Активен с / Действия; колонки «Файлы»/«Ссылки» — до 3 последних версий резюме как чипы-ссылки (данные приходят страницей одним батч-запросом на всех кандидатов, не по одному). Заголовки «Дата регистрации»/«Активен с» кликабельны — сортировка по убыванию/возрастанию поверх уже отфильтрованного списка (useMemo), строки без распознаваемой даты всегда в конце независимо от направления; timestamp — ISO, activeSince — ru-RU текст, разные парсеры. В строке: «Добавить»/«Отклонить» для «На проверке», «Отключить» для «Активный», снова «Подтвердить» для «Отклонён» (TASK-33 — оба вызывают rejectCandidate()/approveCandidate(), без изменений в этих экшенах, т. к. кандидаты не участвуют в SendPulse); корзина (всегда) переключает строку в отдельный шаг подтверждения удаления. «+ Добавить кандидата» в панели фильтров открывает CandidateCreateModal (TASK-33). Кнопка-карандаш (Pencil) на каждой строке открывает CandidateEditModal." "React Client Component" "UI"

        candidateCreateModal = component "CandidateCreateModal" "Модалка быстрого добавления кандидата редактором (TASK-33), max-w-2xl, тот же двухколоночный layout, что у CandidateEditModal, но без истории резюме и без «текущего резюме» — кандидат новый, показывать нечего; «Активен с» предзаполнено сегодняшней датой. Резюме — те же независимые кнопки «Добавить файл»/«Добавить ссылку», что в CandidateEditModal. Вызывает createCandidate(data) — статус остаётся «На проверке» (как у публичной регистрации): заносить кандидата может секретарь, проверять — рекрутёр." "React Client Component" "UI"

        candidateEditModal = component "CandidateEditModal" "Модальная форма редактирования кандидата, max-w-2xl, двухколоночная сетка (как у EmployerEditModal): контакты (имя, email, телефон), роль (title), summary — оба ранее правились только в Sheets, сопроводительное письмо, уровень, стримы (multi-select), страна текущая/желаемая, дата активности (date-picker с конвертацией ISO↔ru-RU на границе компонента). Сама форма — max-h-[75vh] overflow-y-auto, скроллится модалка, не вся страница. Резюме: текущее значение (если есть) показывается как read-only чип со ссылкой «Открыть», не трогается сабмитом сам по себе; две независимые кнопки «+ Добавить файл» / «+ Добавить ссылку» (resumeAction) открывают файл-пикер или url-инпут с «Отмена» — переключение не затирает уже сохранённое резюме, в отличие от прежнего toggle-переключателя. Под полем резюме — история (TASK-32): подгружается через getCandidateResumeHistory(candidate.id) при открытии, разбита на две подгруппы «Файлы»/«Ссылки» (kind определяется сервером по isOwnFileUrl(), не клиентом), в каждой — дата и ссылка «Открыть»; новая версия пишется в Neon только если итоговый resumeUrl реально отличается от исходного. После сохранения — экран подтверждения." "React Client Component" "UI"

        employerEditModal = component "EmployerEditModal" "Модальная форма редактирования работодателя (TASK-31): те же поля, что в EmployerRegistrationModal (имя, компания, email, телефон, способ связи, Telegram/LinkedIn, стримы, страна, доп. страны), без чекбокса согласия. Правки переотправляются в SendPulse, если работодатель уже подтверждён (syncEmployerToSendPulse). Только сохранение полей — отключение и удаление вынесены в строку EmployerRow (EmployerSection), не в эту форму." "React Client Component" "UI"

        employerCreateModal = component "EmployerCreateModal" "Модалка быстрого добавления работодателя редактором, форма в стиле EmployerEditModal (без чекбокса согласия), но вызывает registerEmployer() целиком — та же валидация (обязательные поля, дубли email/телефона), тот же статус «На проверке» по умолчанию. Новой бизнес-логики нет, только UI. Открывается по кнопке «+ Добавить работодателя» в панели фильтров EmployerSection." "React Client Component" "UI"

        publishButton = component "PublishButton" "Кнопка запуска рассылки. Отключена если адресная книга пуста. Показывает статус кампании." "React Client Component" "UI"

        releaseCreateModal = component "ReleaseCreateModal" "Самодостаточная модалка создания выпуска (свой триггер-кнопка + open-состояние — родитель ReleasesPage серверный, без обёртки-клиента): выбор стрима и даты → число подходящих кандидатов/подтверждённых подписчиков + предупреждения (< 6 / > 10, 0 подписчиков) → предзаполненный чекбокс-список кандидатов (getEligibleCandidatesForRelease, все выбраны по умолчанию) → createMailingList(). Кандидаты урезаны до id/name/title/level — остальные поля Profile в клиентский бандл не попадают." "React Client Component" "UI"

        releaseDeleteButton = component "ReleaseDeleteButton" "Кнопка удаления выпуска рядом с PublishButton — рендерится только пока выпуск не отправлялся ни разу. Инлайн-подтверждение («Удалить выпуск?» → «Да, удалить»/«Отмена»), тот же паттерн, что у корзины CandidateSection/EmployerSection, а не мгновенное удаление, как у StreamsTable — потому что стирает реальные данные Mailing lists, а не служебную запись. Вызывает deleteMailingList(listId)." "React Client Component" "UI"

        requestsPage = component "RequestsPage (/editor/requests)" "Управление запросами: два раздела — «Общие запросы» (без кандидата, 3 статуса) и «По кандидатам» (7 статусов). Выпадающий список для смены статуса." "Next.js Server Component" "Page"

        streamsPage = component "StreamsPage (/editor/streams)" "Редактор стримов: список Stream / Тип / Описание из Neon. Полный CRUD через inline-редактирование (StreamsTable), удаление и добавление новых строк. Колонка «Кандидаты» (TASK-27) и «Подписчики» — число подтверждённых работодателей на стрим (confirmedEmployersForStream, lib/db/employers.ts), оба счётчика считаются в памяти на одном запросе, без отдельного похода в БД на стрим. Пункт «Стримы» в EditorNav." "Next.js Server Component" "Page"

        contactRequestsSection = component "ContactRequestsSection" "Список запросов с цветными бейджами и выпадающим статусом. Разделён на «Общие запросы» и «По кандидатам»." "React Client Component" "UI"

        generalInquiryButton = component "GeneralInquiryButton" "Кнопка «Связаться с нами» в блоке «Не нашли подходящих». Пишет в Contact Requests без candidateId." "React Client Component" "UI"

        # Server Actions
        serverActions = component "Server Actions" "registerEmployer() — пишет в Neon (employers, TASK-DB-3) со статусом «На проверке»; валидация (обязательные поля, дубли email/телефона) возвращается как { ok, error } вместо throw — Next.js в production-сборке иначе подменяет сообщение любого throw new Error() из Server Action на общий текст. Тот же action переиспользует и EmployerCreateModal (быстрое добавление из редактора).\nregisterCandidate() — пишет в Sheets с id = crypto.randomUUID() (сгенерирован здесь же, синхронно); если resumeUrl не пустой — пишет первую версию резюме в Neon (candidateResumes, TASK-32), kind определяется через isOwnFileUrl(resumeUrl) на сервере.\npublishMailingList() — создаёт кампанию в SendPulse, тело письма без точного счётчика кандидатов (TASK-26).\ncreateMailingList({ stream, date, candidateIds }) — валидирует стрим/дату, вызывает createMailingListRows() (упрощённые TASK-28/TASK-29 — авто-подбор + создание выпуска через UI, хранение остаётся в Sheets), revalidatePath /editor.\ndeleteMailingList(listId) — сначала проверяет через getCampaigns() (SendPulse), не отправлялся ли уже выпуск (по имени кампании ${stream} — ${date}, тому же, что использует publishMailingList()); если да — бросает ошибку и не удаляет, иначе вызывает deleteMailingListRows(), revalidatePath /editor.\nconfirmEmployer(token, employerData) — syncEmployerToSendPulse(), затем статус «Подтверждён» в Neon.\nrejectEmployer(token) — если запись была «Подтверждён», сначала removeEmployerFromSendPulse() (полная отписка от мастер-книги и всех книг текущих стримов), затем статус «Отклонён» в Neon; для «На проверке» — только смена статуса.\ndeleteEmployer(token) — та же условная отписка от SendPulse, что у rejectEmployer(), затем deleteEmployer() (lib/db/employers.ts) физически удаляет строку из Neon.\napproveCandidate() / rejectCandidate() — статусы кандидата в Sheets; переиспользуются без изменений для «Отключить»/«Подтвердить» уже активных/отклонённых кандидатов (TASK-33), не только для первой модерации.\ncreateCandidate(data) (TASK-33) — id = crypto.randomUUID(), appendCandidateRow() только с проверенным набором ключей (id/timestamp/name/email/phone/resume url/cover letter/status: 'На проверке' — как у публичной регистрации, заносить и проверять может быть разный человек), затем updateCandidateFields(rowIndex, {...}) для title/level/activeSince/stream/countryPrimary/countryDesired/summary — та же функция, что уже надёжно резолвит колонки независимо от языка заголовков.\ndeleteCandidate(rowIndex, candidateId) (TASK-33) — удаляет файлы кандидата из Vercel Blob (resolveBlobUrl() + del(), best-effort — ошибка одного файла не блокирует остальное), затем deleteResumeVersions() в Neon, затем deleteCandidateRow() в Sheets.\nsubmitContactRequest() / submitGeneralInquiry() — резолвят streamId через getStreamIdByName() и записывают запрос в Neon (employerToken/streamId — FK, employerName/company/employerEmail больше не дублируются в строке запроса).\nsetContactRequestStatus(id, status) — меняет статус запроса в Neon по id (UUID).\nupdateStream(id, data) / createStream(data) / deleteStream(id) — CRUD стримов в Neon (revalidatePath /editor/streams).\nupdateCandidate(rowIndex, data) — обновляет поля кандидата (включая title/summary/stream/level/countryPrimary/countryDesired/activeSince) в Sheets через updateCandidateFields(); если resumeUrl реально изменился (data.resumeVersionChanged передан клиентом) — доп. пишет новую версию резюме в Neon, kind определяется на сервере через isOwnFileUrl() (revalidatePath /editor/candidates).\ngetCandidateResumeHistory(candidateId) — история версий резюме кандидата из Neon, новые сверху (TASK-32).\nupdateEmployer(token, data) — обновляет поля работодателя в Neon через updateEmployerFields(); та же { ok, error }-валидация, что у registerEmployer(); если работодатель уже подтверждён, доп. синхронизирует правки в SendPulse через syncEmployerToSendPulse() (revalidatePath /editor/employers)." "Next.js Server Actions" "Logic"

        publishApi = component "Publish API (/api/publish/[listId])" "HTTP-роут для запуска рассылки через curl или внешние системы. Защищён EDITOR_SECRET." "Next.js Route Handler" "Logic"

        uploadApi = component "Upload API (/api/upload)" "POST-роут загрузки резюме: принимает multipart/form-data, проверяет тип (PDF/DOC/DOCX/RTF/ODT) и размер (≤5 МБ), сохраняет в Vercel Blob (private, папка resumes/). Возвращает proxy URL вида APP_URL/api/resume?url=<encodedBlobUrl> для хранения в Google Sheets." "Next.js Route Handler" "Logic"

        resumeApi = component "Resume API (/api/resume)" "GET-роут прокси для приватных файлов Vercel Blob: получает ?url=, проверяет hostname (*.blob.vercel-storage.com), делает fetch с Authorization: Bearer BLOB_READ_WRITE_TOKEN и стримит ответ клиенту. Защита от open redirect по hostname." "Next.js Route Handler" "Logic"

        # Integrations
        sheetsLib = component "Sheets Library (lib/sheets.ts)" "Весь доступ к Google Sheets через Service Account JWT.\nАутентификация: safeJsonParse() устойчив к сырым переносам строк в private_key GOOGLE_SERVICE_ACCOUNT_JSON (артефакт vercel env pull); ошибки конфигурации — конкретные (что не задано/невалидно), не общая фраза.\nЧтение: профили кандидатов. Стримы (TASK-DB-8), работодатели (TASK-DB-3) и подборки (TASK-DB-5) перенесены в Neon.\nЗапись: регистрации кандидатов (appendCandidateRow вызывает ensureCandidateColumns автоматически, возвращает { rowIndex } из updates.updatedRange — нужен createCandidate() для донаполнения строки сразу после вставки, TASK-33); статусы и поля кандидата (updateCandidateStatus, updateCandidateFields, включая title/summary/stream/level/countryPrimary/countryDesired/activeSince).\nУдаление: deleteCandidateRow(rowIndex) (TASK-33) — batchUpdate/deleteDimension, целится в первый лист таблицы (sheets[0]), т. к. диапазоны кандидатов нигде не квалифицированы именем листа.\nАвто-миграция колонок кандидатов: ensureCandidateColumns() — вызывается внутри appendCandidateRow() при каждой записи, не разовая ручная операция.\nАвтосоздание листов через ensureSheet().\ncandidateMatchesStream() / getCandidatesForStream() — сопоставление кандидата стриму по колонке Stream (multi-select), без учёта регистра (TASK-27 ✅).\nparseRuDate() / getEligibleCandidatesForRelease() — кандидаты стрима со статусом «Активный» (уже гарантирован getProfiles()) и уже наступившей/пустой датой Active Since (упрощённый TASK-28); parseRuDate() также используется lib/db/mailing-lists.ts для одноразовой конвертации ru-RU→ISO в бэкафилле (TASK-DB-5).\nContact Requests, Streams, Employers и Mailing Lists перенесены в Neon → lib/db/contact-requests.ts, lib/db/streams.ts, lib/db/employers.ts, lib/db/mailing-lists.ts (TASK-DB-5)." "TypeScript, Google Sheets API v4" "Integration"

        dbLib = component "DB Library (lib/db/)" "Drizzle ORM + @neondatabase/serverless (neon-http driver).\nschema.ts — схемы таблиц contactRequests, streams, candidateResumes (TASK-32), employers (TASK-DB-3) и mailingListEntries (TASK-DB-5).\nindex.ts — клиент drizzle(neon(DATABASE_URL)).\ncontact-requests.ts — appendContactRequest(), getContactRequests(), updateContactRequestStatus(id).\nstreams.ts — getStreams(), getStreamsDetailed(), createStreamRecord(), updateStreamRecord(), deleteStreamRecord().\nmailing-lists.ts (TASK-DB-5) — getMailingList(listId) (джойн с getProfiles() из lib/sheets.ts — кандидаты не переехали), getMailingListMeta(listId) (лёгкий вариант без джойна, для publishMailingList()/deleteMailingList()/submitContactRequest()/submitGeneralInquiry() — им нужны только stream/date), getMailingLists() (сортировка по убыванию targetDate — прямое сравнение ISO-строк, без parseRuDate), createMailingListRows({stream, date, candidateIds}) (date — ISO с <input type=\"date\">, пишется напрямую в нативную колонку targetDate), deleteMailingListRows(listId). Публичный date остаётся ru-RU текстом (isoToRu()) — конвертация происходит один раз на границе модуля, вызывающий код (кампании SendPulse, alreadySent-сопоставление, письмо) не меняется.\nresumes.ts (TASK-32) — addResumeVersion({candidateId, kind, filename?, url}) (no-op если candidateId/url пустые), getResumeVersions(candidateId) — история версий резюме, новые сверху, getResumeVersionsForCandidates(ids) — то же батчем, deleteResumeVersions(candidateId) (TASK-33) — удаляет всю историю кандидата.\nemployers.ts (TASK-DB-3) — getEmployers(), getEmployerByToken(token) (прямой WHERE token = ..., не выгрузка всех строк с поиском в JS, как было в Sheets), getEmployersByStream(stream), createEmployer(data), updateEmployerFields(token, data) (объединяет прежние updateEmployerStatus+updateEmployerFields в одну функцию — в Sheets они были раздельными только из-за ячеечной записи), deleteEmployer(token), filterCandidatesForEmployer() (чистая функция без I/O, перенесена вместе с типом Employer). streams/additionalCountries — нативные Postgres text[], не comma-joined строка.\nMigrations: scripts/migrate.mjs." "TypeScript, Drizzle ORM, Neon" "Integration"

        sendPulseLib = component "SendPulse Library (lib/sendpulse.ts)" "OAuth 2.0 с кэшем токена (59 мин). Кэш адресных книг с TTL 60 с.\ngetOrCreateBook() — авто-создание книги.\ngetBookEmailCount() — проверка подписчиков до рассылки.\ncreateCampaign() / getCampaigns()." "TypeScript, SendPulse REST API" "Integration"
      }
    }

    # ── Отношения: системный контекст ────────────────────────────────────────

    employer -> talentStreams "Просматривает подборки, подписывается на рассылку, запрашивает контакт с кандидатом"
    candidate -> talentStreams "Регистрируется как кандидат"
    editor -> googleSheets "Заполняет лист Candidates. Лист Mailing lists удалён (TASK-DB-5) — выпуски хранятся в Neon"
    editor -> talentStreams "Подтверждает работодателей, запускает рассылки через /editor"

    talentStreams -> googleSheets "Читает профили; пишет заявки и статусы кандидатов. Стримы, работодатели и подборки перенесены в Neon." "HTTPS, Sheets API v4"
    talentStreams -> neon "INSERT/SELECT/UPDATE contactRequests, streams, employers, candidateResumes, mailingListEntries" "HTTPS, Neon HTTP API"
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
    talentStreams.webApp.releasesPage -> talentStreams.webApp.releaseCreateModal "Рендерит"
    talentStreams.webApp.releaseCreateModal -> talentStreams.webApp.serverActions "createMailingList({ stream, date, candidateIds })"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.releaseDeleteButton "Рендерит (только пока не отправлен)"
    talentStreams.webApp.releaseDeleteButton -> talentStreams.webApp.serverActions "deleteMailingList(listId)"
    talentStreams.webApp.employersPage -> talentStreams.webApp.employerSection "Рендерит"
    talentStreams.webApp.editorLayout -> talentStreams.webApp.editorNav "Рендерит"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.sheetsLib "getCandidates()"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.dbLib "getStreams() — опции фильтра"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.candidateSection "Рендерит"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.serverActions "approveCandidate() / rejectCandidate()"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.candidateEditModal "Открывает при клике на Pencil"
    talentStreams.webApp.candidateEditModal -> talentStreams.webApp.uploadApi "POST /api/upload (при выборе файла)"
    talentStreams.webApp.candidateEditModal -> talentStreams.webApp.serverActions "updateCandidate(rowIndex, data) / getCandidateResumeHistory(candidate.id)"
    editor -> talentStreams.webApp.candidatesPage "Модерирует, фильтрует и редактирует данные кандидатов"

    talentStreams.webApp.homePage -> talentStreams.webApp.sheetsLib "getStreams()"
    talentStreams.webApp.profilePage -> talentStreams.webApp.sheetsLib "getProfile(id)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getMailingList(listId) — джойн с getProfiles() (кандидаты остаются в Sheets)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getStreamsDetailed() — типы стримов для тегов на карточке (TASK-27)"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.sheetsLib "getProfiles() — подходящие кандидаты на стрим для ReleaseCreateModal"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.dbLib "getMailingLists() / getStreams() / getEmployers() — выпуски и подтверждённые подписчики на стрим для ReleaseCreateModal"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount() — проверка пустой книги"
    talentStreams.webApp.employersPage -> talentStreams.webApp.dbLib "getEmployers()"
    talentStreams.webApp.employersPage -> talentStreams.webApp.dbLib "getStreams() — опции фильтра"

    talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(EmployerData)"
    talentStreams.webApp.candidateModal -> talentStreams.webApp.serverActions "registerCandidate(CandidateData)"
    talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
    talentStreams.webApp.employerSection -> talentStreams.webApp.serverActions "confirmEmployer() / rejectEmployer() / deleteEmployer()"
    talentStreams.webApp.employerSection -> talentStreams.webApp.employerEditModal "Открывает при клике на Pencil"
    talentStreams.webApp.employerEditModal -> talentStreams.webApp.serverActions "updateEmployer(token, data)"
    talentStreams.webApp.employerSection -> talentStreams.webApp.employerCreateModal "Открывает по кнопке «+ Добавить работодателя»"
    talentStreams.webApp.employerCreateModal -> talentStreams.webApp.serverActions "registerEmployer(data)"

    talentStreams.webApp.publishApi -> talentStreams.webApp.serverActions "publishMailingList(listId)"

    talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "appendCandidateRow()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createEmployer(), updateEmployerFields(), getMailingListMeta(), createMailingListRows(), deleteMailingListRows()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "syncEmployerToSendPulse() / createCampaign()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "appendContactRequest() / updateContactRequestStatus(id) / addResumeVersion() / getResumeVersions(candidateId)"

    editor -> talentStreams.webApp.releasesPage "Просматривает выпуски, запускает рассылку"
    editor -> talentStreams.webApp.employersPage "Подтверждает и отклоняет заявки работодателей"
    editor -> talentStreams.webApp.settingsPage "Раздел настроек (пока пустой)"
    editor -> talentStreams.webApp.streamsPage "Управляет стримами: добавляет, редактирует, удаляет"
    editor -> talentStreams.webApp.publishApi "curl /api/publish/{listId}?token=…"

    talentStreams.webApp.sheetsLib -> googleSheets "fetchSheetValues(), values.update()" "HTTPS, Sheets API v4"
    talentStreams.webApp.dbLib -> neon "INSERT / SELECT / UPDATE contactRequests, streams, employers, candidateResumes, mailingListEntries" "HTTPS, Neon HTTP API"
    talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token, GET /addressbooks, POST /addressbooks/{id}/emails, POST /campaigns" "HTTPS"

    talentStreams.webApp.candidateModal -> talentStreams.webApp.uploadApi "POST /api/upload (при сабмите, если выбран файл)"
    talentStreams.webApp.uploadApi -> vercelBlob "put(filename, file, { access: 'private' })" "HTTPS, Vercel Blob API"
    talentStreams.webApp.resumeApi -> vercelBlob "fetch(blobUrl, { Authorization: Bearer token })" "HTTPS, Vercel Blob API"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.serverActions "updateStream() / createStream() / deleteStream()"

    talentStreams.webApp.requestsPage -> talentStreams.webApp.dbLib "getContactRequests()"
    talentStreams.webApp.requestsPage -> talentStreams.webApp.sheetsLib "getProfiles()"
    talentStreams.webApp.requestsPage -> talentStreams.webApp.contactRequestsSection "Рендерит"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.dbLib "getStreamsDetailed() / getEmployers() — подсчёт подтверждённых подписчиков на стрим"
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
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createEmployer({..., status: 'На проверке'})"
      talentStreams.webApp.dbLib -> neon "INSERT INTO employers"
      autolayout lr
    }

    dynamic talentStreams.webApp "EmployerApproval" "Сценарий подтверждения работодателя редактором" {
      talentStreams.webApp.employerSection -> talentStreams.webApp.serverActions "confirmEmployer(token, employerData)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "syncEmployerToSendPulse(employer)"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /addressbooks/MASTER/emails"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /addressbooks/STREAM_BOOK/emails"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "updateEmployerFields(token, { status: 'Подтверждён' })"
      talentStreams.webApp.dbLib -> neon "UPDATE employers SET status = ... WHERE token = ..."
      autolayout lr
    }

    dynamic talentStreams.webApp "MailingListView" "Сценарий просмотра персонализированной подборки" {
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getEmployerByToken(?e= из searchParams)"
      talentStreams.webApp.dbLib -> neon "SELECT * FROM employers WHERE token = ..."
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getMailingList(listId)"
      talentStreams.webApp.dbLib -> neon "SELECT * FROM mailingListEntries WHERE listId = ..."
      talentStreams.webApp.dbLib -> talentStreams.webApp.sheetsLib "getProfiles() — джойн с кандидатами, которые остаются в Sheets"
      talentStreams.webApp.sheetsLib -> googleSheets "GET профили основного листа"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "filterCandidatesForEmployer(entries, employer)"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит кнопку под каждой анонимной карточкой (с employerToken)"
      autolayout lr
    }

    dynamic talentStreams.webApp "CreateRelease" "Сценарий автоматического создания выпуска редактором (упрощённые TASK-28/TASK-29, хранение — TASK-DB-5)" {
      talentStreams.webApp.releaseCreateModal -> talentStreams.webApp.serverActions "createMailingList({ stream, date, candidateIds }) — date уже ISO с <input type=\"date\">"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createMailingListRows({ stream, date, candidateIds })"
      talentStreams.webApp.dbLib -> neon "INSERT INTO mailingListEntries (одним батчем, по строке на кандидата, общий listId, targetDate = date как есть)"
      autolayout lr
    }

    dynamic talentStreams.webApp "DeleteRelease" "Сценарий удаления ещё не отправленного выпуска редактором" {
      talentStreams.webApp.releaseDeleteButton -> talentStreams.webApp.serverActions "deleteMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListMeta(listId) — только stream/date, без джойна с кандидатами"
      talentStreams.webApp.dbLib -> neon "SELECT stream, targetDate FROM mailingListEntries WHERE listId = ... LIMIT 1"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "getCampaigns() — проверка, не отправлен ли уже"
      talentStreams.webApp.sendPulseLib -> sendPulse "GET /campaigns"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "deleteMailingListRows(listId)"
      talentStreams.webApp.dbLib -> neon "DELETE FROM mailingListEntries WHERE listId = ..."
      autolayout lr
    }

    dynamic talentStreams.webApp "PublishMailingList" "Сценарий публикации выпуска редактором" {
      talentStreams.webApp.releasesPage -> talentStreams.webApp.dbLib "getMailingLists()"
      talentStreams.webApp.dbLib -> neon "SELECT * FROM mailingListEntries"
      talentStreams.webApp.releasesPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount(stream)"
      talentStreams.webApp.sendPulseLib -> sendPulse "GET /addressbooks?limit=500"
      talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListMeta(listId)"
      talentStreams.webApp.dbLib -> neon "SELECT stream, targetDate FROM mailingListEntries WHERE listId = ... LIMIT 1"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "createCampaign(bookId, subject, html)"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token → POST /campaigns"
      autolayout lr
    }

    dynamic talentStreams.webApp "ContactRequest" "Сценарий запроса работодателя на контакт с кандидатом" {
      talentStreams.webApp.contactButton -> talentStreams.webApp.serverActions "submitContactRequest(candidateId, listId, employerToken)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getEmployerByToken(token) — только проверка существования"
      talentStreams.webApp.dbLib -> neon "SELECT * FROM employers WHERE token = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListMeta(listId) — получение имени стрима"
      talentStreams.webApp.dbLib -> neon "SELECT stream, targetDate FROM mailingListEntries WHERE listId = ... LIMIT 1"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getStreamIdByName(name) — резолвит streamId"
      talentStreams.webApp.dbLib -> neon "SELECT id FROM streams WHERE name = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "appendContactRequest({id: uuid, listId, streamId, candidateId, employerToken, status: 'Новый запрос'})"
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
