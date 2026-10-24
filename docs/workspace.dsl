workspace "TalentStreams" "Платформа подборки проверенных кандидатов для работодателей Центральной Азии" {

  !identifiers hierarchical

  model {

    # ── Акторы ──────────────────────────────────────────────────────────────

    employer = person "Работодатель" "Просматривает анонимные подборки кандидатов, подписывается на рассылку, отправляет запросы на контакт" "User"
    candidate = person "Кандидат" "Регистрируется для включения в подборки" "User"
    editor = person "Редактор" "Модерирует и редактирует кандидатов через /editor (Neon); подтверждает заявки работодателей и запускает рассылки" "Internal"

    # ── Внешние системы ──────────────────────────────────────────────────────

    googleSheets = softwareSystem "Google Sheets" "Не часть боевого пути приложения (TASK-DB-4 ✅ — кандидаты, последняя оставшаяся сущность, перенесены в Neon). Опциональный канал массового ввода (TASK-39 ✅): менеджер заполняет таблицу вручную, кнопка на /editor/settings читает новые строки в Neon; единственная запись обратно в таблицу — сгенерированный id новой строки, для идемпотентности повторного импорта." "External"

    neon = softwareSystem "Neon (PostgreSQL)" "Serverless PostgreSQL через Vercel Marketplace. Таблицы: candidates (TASK-DB-4 — было Google Sheets; activeSince — настоящая date-колонка; email/phone — UNIQUE + nullable, TASK-38), contactRequests (FK на candidates/employers/streams), streams (+status: Активный/Архивный), candidateResumes (TASK-32 — история версий резюме кандидата, FK на candidates ON DELETE CASCADE), employers (TASK-DB-3, companyId — FK на companies.id, ON DELETE SET NULL; email/phone — UNIQUE, TASK-38), companies (TASK-36 — отдельная сущность, одна компания — несколько работодателей; name unique, записи без компании получают реальную строку-плейсхолдер «Не определено»), mailingLists (TASK-40 ✅ — заголовок выпуска: streamId, targetDate — timestamp, задел на будущую автоматизацию по времени, recipientLabel — имена компаний узкого выпуска для читаемости, sentCampaignId — реальный id кампании SendPulse, единственный источник истины «отправлен ли выпуск»), mailingListEntries (TASK-DB-5; listId — теперь настоящий FK на mailingLists.id ON DELETE CASCADE, TASK-40; candidateId — FK, ON DELETE SET NULL), mailingListRecipients (TASK-40 ✅ — переопределение получателей узкого выпуска: наличие строк = сужено, отсутствие = весь стрим; listId FK на mailingLists.id ON DELETE CASCADE, employerToken FK на employers.token ON DELETE CASCADE). Подключение через neon-http driver (HTTP, без WebSocket)." "External"

    sendPulse = softwareSystem "SendPulse" "Email-маркетинг: адресные книги подписчиков (мастер + по стримам), рассылки кампаний" "External"

    vercelBlob = softwareSystem "Vercel Blob" "Приватное файловое хранилище резюме кандидатов. Доступ через прокси /api/resume с Bearer-токеном. Хранит файлы: PDF, DOC, DOCX, RTF, ODT (до 5 МБ)." "External"

    # ── Основная система ─────────────────────────────────────────────────────

    talentStreams = softwareSystem "TalentStreams" "Next.js-приложение: публичный сайт с подборками кандидатов, формами регистрации и редактором выпусков" {

      webApp = container "Web Application" "Server-side рендеринг, Server Actions, интеграции с Google Sheets и SendPulse" "Next.js 14, TypeScript" "WebApp" {

        # Pages (Server Components)
        homePage = component "HomePage (/)" "Тонкая серверная обёртка: загружает streams, оборачивает HomePageContent в LanguageProvider (RU/EN — только эта страница, редактор не тронут)." "Next.js Server Component" "Page"

        homePageContent = component "HomePageContent" "Вся вёрстка главной страницы (лендинг, формы регистрации работодателя и кандидата, LanguageToggle в шапке) — клиентский компонент: переключение языка без смены URL требует реактивного состояния, серверный компонент для этого не подходит. Текст берёт из lib/i18n/home.ts через useLocale()." "React Client Component" "UI"

        languageProvider = component "LanguageProvider" "React Context для RU/EN на главной странице: useLocale(). По умолчанию RU и на сервере, и при первом клиентском рендере (совпадает с сервером — без этого гидратация конфликтует); сохранённое значение (localStorage, ключ ts-locale) подхватывается в useEffect сразу после монтирования. Не затрагивает /editor/*." "React Client Component" "UI"

        languageToggle = component "LanguageToggle" "Кнопка-переключатель RU/EN в шапке главной страницы." "React Client Component" "UI"

        i18nLib = component "i18n Dictionaries (lib/i18n/)" "Типизированные словари Record<Locale, ...> для главной страницы: home.ts (лендинг), candidate-form.ts / employer-form.ts (формы регистрации). Без внешней i18n-библиотеки (next-intl и подобные заточены на URL-роутинг по языку — здесь переключение без смены URL). Переводится только статичный текст интерфейса — данные, которые вводят кандидаты/работодатели, не переводятся." "TypeScript" "Integration"

        mailingListPage = component "MailingListPage (/list/[listId])" "Страница подборки: анонимные карточки кандидатов (без имён и контактов), теги, summary, disclaimer. Noindex. Доступ: ?e=[token] → персонализированная подборка с фильтрацией; ?secret=[EDITOR_SECRET] → все кандидаты; без параметров → 404." "Next.js Server Component" "Page"

        profilePage = component "ProfilePage (/profile/[id])" "Полный профиль кандидата. Недоступна со страниц подборок (работодателю не показывается) и не запрашивает EDITOR_SECRET — доступна всем, у кого есть id (getCandidateById(id) не фильтрует по статусу). Единственная точка входа — имя кандидата в /editor/candidates, ссылка ведёт сюда. Noindex." "Next.js Server Component" "Page"

        editorLayout = component "EditorLayout (/editor/*)" "Общий макет редактора: боковое меню с разделами. Каждый подмаршрут независимо защищён EDITOR_SECRET." "Next.js Layout" "Page"

        editorNav = component "EditorNav" "Боковая навигация редактора: читает ?secret= из URL и передаёт во все ссылки при переходе. Разделы: Выпуски, Работодатели, Компании, Кандидаты, Запросы, Стримы, Настройки." "React Client Component" "UI"

        releasesPage = component "ReleasesPage (/editor)" "Список выпусков: стрим, дата, кандидаты, история кампаний, кнопка рассылки, проверка пустой адресной книги, ссылка на подборку с секретом. Кнопка «Создать рассылку» (упрощённые TASK-28/TASK-29) открывает ReleaseCreateModal — для каждого стрима заранее считает подходящих кандидатов (getEligibleCandidatesForRelease) и подтверждённых подписчиков (confirmedEmployersForStream), передаёт готовыми map'ами. Рядом с PublishButton рендерит ReleaseDeleteButton, только если выпуск ни разу не отправлялся (alreadySent === false — та же переменная, что решает «Отправить»/«Отправить повторно»)." "Next.js Server Component" "Page"

        employersPage = component "EmployersPage (/editor/employers)" "Управление работодателями: панель фильтров (поиск, статус — по умолчанию все, страна, стрим), плоский список вместо секций (TASK-30). Кнопки «Подтвердить» и «Отклонить»; Pencil открывает EmployerEditModal (TASK-31). getTelegramConnectionInfo() (параллельно с getStreams()) — для бейджа «Telegram» на строке работодателя и для синхронизации: на каждой загрузке страницы сверяет найденные telegram_id/username с уже сохранёнными employers.telegramId/telegram в Neon и пишет через updateEmployerFields() только при расхождении. telegramId стирается в null, если SendPulse контакт больше не находит (задел для возможного перехода на self-hosted бота, portable Telegram user id, не завязан на SendPulse) — telegram (@username) никогда не стирается, только перезаписывается реальным username, если он есть и отличается от того, что работодатель вписал при регистрации (мог подключиться с другого Telegram-аккаунта)." "Next.js Server Component" "Page"

        companiesPage = component "CompaniesPage (/editor/companies)" "Список компаний работодателей (TASK-36): getCompaniesWithEmployers() — один left join компаний с людьми, без N+1. Рендерит CompaniesSection." "Next.js Server Component" "Page"

        settingsPage = component "SettingsPage (/editor/settings)" "Импорт кандидатов из Google-таблицы в Neon (TASK-39): рендерит ImportCandidatesButton, если isSheetsConfigured() (lib/sheets.ts), иначе заметку «Google Sheets не настроен»." "Next.js Server Component" "Page"

        candidatesPage = component "CandidatesPage (/editor/candidates)" "Список кандидатов: панель фильтров (поиск, статус — по умолчанию все, стрим, уровень), плоский список вместо секций (TASK-30). Рендерит CandidateSection." "Next.js Server Component" "Page"

        # Client Components
        employerModal = component "EmployerRegistrationModal" "Форма подписки работодателя: имя, компания (TASK-36 — обязательное поле, автодополнение через CompanyAutocompleteInput), email, телефон, способ связи, выбор стримов. После отправки — статус «На проверке»." "React Client Component" "UI"

        candidateModal = component "CandidateRegistrationModal" "Форма регистрации кандидата: имя, email, телефон, сопроводительное письмо. Резюме — загрузить файл (PDF/DOC/DOCX/RTF/ODT, до 5 МБ) или указать URL — альтернативные варианты. Загрузка файла происходит при сабмите формы через POST /api/upload. Передаёт, для файла, resumeFilename (тип 'file'/'link' сервер определяет сам по URL, не по клиенту) — первая версия резюме попадает в историю (TASK-32), так как id кандидата генерируется этой же формой синхронно (crypto.randomUUID()), не внешним скриптом." "React Client Component" "UI"

        profileView = component "ProfileView" "Полная карточка профиля: имя, роль, контакты (email/телефон), теги стримов. Кнопка «назад»." "React Client Component" "UI"

        contactButton = component "ContactButton" "Кнопка «Хочу связаться» на карточке подборки. Вызывает `submitContactRequest`, записывает запрос в лист «Contact Requests». Без токена — неактивна." "React Client Component" "UI"

        employerSection = component "EmployerSection" "Секция редактора (TASK-30): панель фильтров (поиск, статус, страна, стрим) вместо коллапсируемых групп; useMemo-фильтрация, комбинируются одновременно. Таблица (как CandidateSection): Работодатель / Контакты / Стримы / Страна / Статус / Дата регистрации / Действия — «Статус» и «Дата регистрации» через SortableHeader (та же кнопка-стрелка в <th>, что и у кандидатов; повторный клик меняет направление); без явного выбора — сортировка по умолчанию: «Подтверждён» вперёд, внутри группы статусов по дате регистрации от старых к новым. Кнопка «+ Добавить работодателя» открывает EmployerCreateModal. В строке EmployerRow: «Подтвердить»/«Отклонить» для «На проверке», «Отключить» для «Подтверждён», снова «Подтвердить» для «Отклонён» (возврат в рассылку — переиспользует тот же confirmEmployer(), что и первое подтверждение); «Отклонить» и «Отключить» вызывают один и тот же rejectEmployer() — SendPulse трогается по факту текущего статуса на сервере. Значок корзины (всегда) переключает строку в отдельный шаг подтверждения удаления вместо browser confirm(). Pencil на каждой строке открывает EmployerEditModal (TASK-31, только сохранение полей). Голубой бейдж «Telegram» в колонке «Статус» — только если работодатель реально подключён к боту (getTelegramConnectionInfo(), см. EmployersPage), независимо от статуса заявки." "React Client Component" "UI"

        candidateSection = component "CandidateSection" "Секция редактора (TASK-30): панель фильтров (поиск, статус, стрим, уровень) вместо коллапсируемых групп; useMemo-фильтрация. Список — настоящая таблица (TASK-32-доп.), не карточки: Кандидат / Контакты / Файлы / Ссылки / Дата регистрации / Активен с / Действия; колонки «Файлы»/«Ссылки» — до 3 последних версий резюме как чипы-ссылки (данные приходят страницей одним батч-запросом на всех кандидатов, не по одному). Заголовки «Дата регистрации»/«Активен с» кликабельны — сортировка по убыванию/возрастанию поверх уже отфильтрованного списка (useMemo), строки без распознаваемой даты всегда в конце независимо от направления; timestamp — ISO, activeSince — ru-RU текст, разные парсеры. В строке: «Добавить»/«Отклонить» для «На проверке», «Отключить» для «Активный», снова «Подтвердить» для «Отклонён» (TASK-33 — оба вызывают rejectCandidate()/approveCandidate(), без изменений в этих экшенах, т. к. кандидаты не участвуют в SendPulse); корзина (всегда) переключает строку в отдельный шаг подтверждения удаления. «+ Добавить кандидата» в панели фильтров открывает CandidateCreateModal (TASK-33). Кнопка-карандаш (Pencil) на каждой строке открывает CandidateEditModal." "React Client Component" "UI"

        candidateCreateModal = component "CandidateCreateModal" "Модалка быстрого добавления кандидата редактором (TASK-33), max-w-2xl, тот же двухколоночный layout, что у CandidateEditModal, но без истории резюме и без «текущего резюме» — кандидат новый, показывать нечего; «Активен с» предзаполнено сегодняшней датой. Резюме — те же независимые кнопки «Добавить файл»/«Добавить ссылку», что в CandidateEditModal. Вызывает createCandidate(data) — статус остаётся «На проверке» (как у публичной регистрации): заносить кандидата может секретарь, проверять — рекрутёр." "React Client Component" "UI"

        candidateEditModal = component "CandidateEditModal" "Модальная форма редактирования кандидата, max-w-2xl, двухколоночная сетка (как у EmployerEditModal): контакты (имя, email, телефон), роль (title), summary — оба ранее правились только в Sheets, сопроводительное письмо, уровень, стримы (multi-select), страна текущая/желаемая, дата активности (date-picker с конвертацией ISO↔ru-RU на границе компонента). Сама форма — max-h-[75vh] overflow-y-auto, скроллится модалка, не вся страница. Резюме: текущее значение (если есть) показывается как read-only чип со ссылкой «Открыть», не трогается сабмитом сам по себе; две независимые кнопки «+ Добавить файл» / «+ Добавить ссылку» (resumeAction) открывают файл-пикер или url-инпут с «Отмена» — переключение не затирает уже сохранённое резюме, в отличие от прежнего toggle-переключателя. Под полем резюме — история (TASK-32): подгружается через getCandidateResumeHistory(candidate.id) при открытии, разбита на две подгруппы «Файлы»/«Ссылки» (kind определяется сервером по isOwnFileUrl(), не клиентом), в каждой — дата и ссылка «Открыть»; новая версия пишется в Neon только если итоговый URL реально отличается от текущего (самой новой записи истории — candidates не хранит резюме отдельной колонкой). Под полем «Стримы» — блок «История рассылок» (TASK-05, первый инкремент — видимость): подгружается через getCandidateMailingHistory(candidate.id) при открытии, тот же паттерн useEffect, что у истории резюме; список выпусков (дата/стрим/отправлен ли), новые сверху, read-only. После сохранения — экран подтверждения." "React Client Component" "UI"

        employerEditModal = component "EmployerEditModal" "Модальная форма редактирования работодателя (TASK-31): те же поля, что в EmployerRegistrationModal (имя, компания — обязательное, автодополнение, email, телефон, способ связи, Telegram/LinkedIn, стримы, страна, доп. страны), без чекбокса согласия. Правки переотправляются в SendPulse, если работодатель уже подтверждён (syncEmployerToSendPulse). Только сохранение полей — отключение и удаление вынесены в строку EmployerRow (EmployerSection), не в эту форму." "React Client Component" "UI"

        employerCreateModal = component "EmployerCreateModal" "Модалка быстрого добавления работодателя редактором, форма в стиле EmployerEditModal (без чекбокса согласия), но вызывает registerEmployer() целиком — та же валидация (обязательные поля включая компанию, дубли email/телефона), тот же статус «На проверке» по умолчанию. Новой бизнес-логики нет, только UI. Открывается по кнопке «+ Добавить работодателя» в панели фильтров EmployerSection." "React Client Component" "UI"

        companyAutocompleteInput = component "CompanyAutocompleteInput" "Переиспользуемое поле «Компания» (TASK-36): текстовый input + выпадающий список подсказок (дебаунс 200мс, searchCompanies() — ilike по подстроке, до 10 результатов). Выбор подсказки или ввод нового названия — оба валидны, сервер резолвит текст в компанию через findOrCreateCompanyByName() (case-insensitive). Используется в EmployerRegistrationModal, EmployerCreateModal, EmployerEditModal." "React Client Component" "UI"

        companiesSection = component "CompaniesSection" "Список компаний редактора (TASK-36): строка раскрывается по клику — показывает людей внутри компании с цветным бейджем статуса (На проверке/Подтверждён/Отклонён)." "React Client Component" "UI"

        publishButton = component "PublishButton" "Кнопка запуска рассылки. Отключена если адресная книга пуста. Показывает статус кампании." "React Client Component" "UI"

        releaseCreateModal = component "ReleaseCreateModal" "Самодостаточная модалка создания выпуска (свой триггер-кнопка + open-состояние — родитель ReleasesPage серверный, без обёртки-клиента): выбор стрима и даты → число подходящих кандидатов/подтверждённых подписчиков + предупреждения (< 6 / > 10, 0 подписчиков) → предзаполненный чекбокс-список кандидатов (getEligibleCandidatesForRelease, все выбраны по умолчанию), рядом — схлопнутый список «Кандидаты на паузе, дата не наступила» (getPausedCandidatesForRelease, TASK-05, закрыт по умолчанию, чекбоксы на той же переменной selectedIds — editor может включить вручную при нехватке подходящих). Переключатель «Все подписчики стрима» / «Выбранные получатели» (TASK-40 ✅) — во втором режиме список подтверждённых работодателей стрима, сгруппированный по компании, тройное состояние чекбокса группы (checked/indeterminate/unchecked) выбирает/снимает всех работодателей компании разом, можно комбинировать с ручным выбором отдельных работодателей; выбор сбрасывается при смене стрима. → createMailingList() с candidateIds и (если режим «Выбранные получатели») employerTokens. В обоих списках кандидатов рядом с кандидатом показана activeSince. Кандидаты урезаны до id/name/title/level/activeSince, работодатели — до token/name/email/company — остальные поля Profile/Employer в клиентский бандл не попадают." "React Client Component" "UI"

        releaseDeleteButton = component "ReleaseDeleteButton" "Кнопка удаления выпуска рядом с PublishButton — рендерится только пока выпуск не отправлялся ни разу. Инлайн-подтверждение («Удалить выпуск?» → «Да, удалить»/«Отмена»), тот же паттерн, что у корзины CandidateSection/EmployerSection, а не мгновенное удаление, как у StreamsTable — потому что стирает реальные данные Mailing lists, а не служебную запись. Вызывает deleteMailingList(listId)." "React Client Component" "UI"

        requestsPage = component "RequestsPage (/editor/requests)" "Управление запросами: два раздела — «Общие запросы» (без кандидата, 3 статуса) и «По кандидатам» (7 статусов). Выпадающий список для смены статуса." "Next.js Server Component" "Page"

        streamsPage = component "StreamsPage (/editor/streams)" "Редактор стримов: список Stream / Тип / Описание из Neon. Полный CRUD через inline-редактирование (StreamsTable) для активных стримов, удаление и добавление новых строк. Колонка «Кандидаты» (TASK-27) и «Подписчики» — число подтверждённых работодателей на стрим (confirmedEmployersForStream, lib/db/employers.ts), оба счётчика считаются в памяти на одном запросе, без отдельного похода в БД на стрим. Доп. getMailingLists()+getCampaigns() на всю страницу — группирует выпуски по streamId в mailingHistoryByStreamId (с пометкой sent), делит стримы на activeStreams/archivedStreams по status. Рендерит StreamsTable (активные) и ArchivedStreamsSection (архивные, ниже). Пункт «Стримы» в EditorNav." "Next.js Server Component" "Page"

        archivedStreamsSection = component "ArchivedStreamsSection" "Отдельная схлопнутая секция страницы стримов («Архивные стримы (N)», закрыта по умолчанию, null если архивных нет) — не часть строки, как ReleaseDeleteButton, а весь блок целиком. Упрощённая read-only таблица (без inline-редактирования — архивный стрим не редактируется, только восстанавливается): ID/Название/Тип/Кандидаты/Подписчики/Описание + кнопка «Восстановить» (unarchiveStream(id), без подтверждения). Та же раскрываемая история рассылок на строку, что в StreamsTable." "React Client Component" "UI"

        contactRequestsSection = component "ContactRequestsSection" "Список запросов с цветными бейджами и выпадающим статусом. Разделён на «Общие запросы» и «По кандидатам»." "React Client Component" "UI"

        generalInquiryButton = component "GeneralInquiryButton" "Кнопка «Связаться с нами» в блоке «Не нашли подходящих». Пишет в Contact Requests без candidateId." "React Client Component" "UI"

        importCandidatesButton = component "ImportCandidatesButton" "Кнопка на SettingsPage (TASK-39): «Проверить таблицу» → previewCandidatesImport() → три схлопываемых списка (готово к импорту/дубликаты/невалидные) → «Импортировать N»/«Отмена» → importCandidatesFromSheets() → тот же вид списков с финальным результатом. Ничего не пишет до явного подтверждения вторым кликом." "React Client Component" "UI"

        # Server Actions
        serverActions = component "Server Actions" "registerEmployer() — пишет в Neon (employers, TASK-DB-3) со статусом «На проверке»; валидация (обязательные поля включая компанию — TASK-36, дубли email/телефона) возвращается как { ok, error } вместо throw — Next.js в production-сборке иначе подменяет сообщение любого throw new Error() из Server Action на общий текст. Компания резолвится из свободного текста в companyId через findOrCreateCompanyByName() (lib/db/companies.ts, TASK-36) перед записью. Тот же action переиспользует и EmployerCreateModal (быстрое добавление из редактора).
searchCompanies(query) (TASK-36) — тонкая обёртка над lib/db/companies.ts для автодополнения поля «Компания» в клиентских формах.\nregisterCandidate() — возвращает { ok, error } вместо throw (TASK-38, та же причина, что у registerEmployer() ниже — продакшен-сборка Next.js подменяет сообщение любого throw в Server Action); пишет в Neon (candidates, TASK-DB-4) с id = crypto.randomUUID() (сгенерирован здесь же, синхронно, нужен немедленно для addResumeVersion); если resumeUrl не пустой — пишет первую версию резюме в Neon (candidateResumes, TASK-32), kind определяется через isOwnFileUrl(resumeUrl) на сервере. Нарушение UNIQUE на email/phone (candidates_email_unique/candidates_phone_unique, TASK-38) ловится через err.cause.constraint (neon-http оборачивает исходную ошибку Postgres) и превращается в дружелюбное сообщение той же uniqueViolationConstraint()-функцией, которой пользуются и createCandidate()/updateCandidate() ниже, и registerEmployer()/updateEmployer().\npublishMailingList() (TASK-40 ✅) — alreadySent через mailingLists.sentCampaignId (не getCampaigns()/имя кампании); если первая отправка и сегодняшняя дата отличается от сохранённой — обновляет дату/время выпуска в Neon (updateMailingListTimestamp(), полный текущий момент — дата была ISO-датой, теперь timestamp; план, а не обязательство: менеджер может отправить не в тот день, что планировал) и использует новую дату для темы/имени кампании; при повторной отправке дата не трогается. Узкая рассылка (recipientTokens из getMailingListRecipientTokens() непусты) — строит одноразовую адресную книгу `${stream} — ${date} — ${listId}` через getOrCreateBook(), заполняет выбранными работодателями (addToAddressBook() с теми же переменными, что syncEmployerToSendPulse() — Имя/phone/Streams/employer_token, иначе персонализированная ссылка в письме не резолвится), шлёт кампанию в неё вместо книги стрима, затем best-effort deleteAddressBook() (в try/finally — выполняется даже если createCampaign() бросил). На первой реальной отправке — markMailingListSent(listId, campaign.id) рядом с applyPublicationPauseRules(candidateIds) (TASK-05, теперь без параметра campaignNames — подсчёт реальных отправок через sentCampaignId каждой записи истории, не сравнение имён). Создаёт кампанию в SendPulse, тело письма без точного счётчика кандидатов (TASK-26). Только при первой отправке — applyPublicationPauseRules() (TASK-05, приватный helper): getMailingListCandidateIds(listId) + для каждого кандидата getMailingListsForCandidate() считает, сколько раз он уже реально отправлялся (по campaignNames — снимок getCampaigns(), взятый до этой отправки, чтобы не задвоить счёт), затем updateCandidateStatus(id, ...) (lib/db/candidates.ts, TASK-DB-4 — адресация по id, не rowIndex): 1-я отправка → activeSince +2 недели, 2-я → +3 месяца, 3-я → статус «Не публиковать» + activeSince +10 лет (кандидат перестаёт предлагаться getActiveCandidates() навсегда). revalidatePath /editor.\ncreateMailingList({ stream, date, candidateIds, employerTokens? }) — валидирует стрим/дату; если employerTokens непусто (TASK-40 ✅, узкая рассылка) — считает recipientLabel из компаний выбранных работодателей (getEmployerByToken() на каждый токен, не более 3 названий явно, дальше «и ещё N») и после createMailingListRows() пишет переопределения через createMailingListRecipientRows(); вызывает createMailingListRows() (упрощённые TASK-28/TASK-29 — авто-подбор + создание выпуска через UI; хранение в Neon с TASK-DB-5), revalidatePath /editor.\ndeleteMailingList(listId) (TASK-40 ✅ — проверка через mailingLists.sentCampaignId, не через getCampaigns()/имя кампании) — если выпуск уже отправлен (sentCampaignId !== null) — бросает ошибку и не удаляет, иначе вызывает deleteMailingListRows() (удаляет заголовок mailingLists — FK ON DELETE CASCADE сам сносит mailingListEntries и mailingListRecipients), revalidatePath /editor.\nconfirmEmployer(token, employerData) — syncEmployerToSendPulse(), затем статус «Подтверждён» в Neon.\nrejectEmployer(token) — если запись была «Подтверждён», сначала removeEmployerFromSendPulse() (полная отписка от мастер-книги и всех книг текущих стримов), затем безусловно disableTelegramContact(token) (Telegram можно подключить и до подтверждения заявки — проверка статуса тут не годится), затем статус «Отклонён» в Neon.\ndeleteEmployer(token) — та же условная отписка от email-книг, что у rejectEmployer(), затем безусловно deleteTelegramContact(token), затем deleteEmployer() (lib/db/employers.ts) физически удаляет строку из Neon.\napproveCandidate(id, currentActiveSince?) / rejectCandidate(id) — статусы кандидата в Neon (TASK-DB-4 — адресация по id, не rowIndex); переиспользуются без изменений для «Отключить»/«Подтвердить» уже активных/отклонённых кандидатов (TASK-33), не только для первой модерации.\ncreateCandidate(data) (TASK-33) — также { ok, error } (TASK-38); id = crypto.randomUUID(), один createCandidateRecord() со всеми полями сразу (title/level/activeSince/stream/countryPrimary/countryDesired/summary включая status: 'На проверке' — как у публичной регистрации, заносить и проверять может быть разный человек; TASK-DB-4 убрала прежний append+update в два шага).\ndeleteCandidate(id) (TASK-33, TASK-DB-4 — сигнатура упростилась до одного параметра, раньше rowIndex и candidateId отдельно) — удаляет файлы кандидата из Vercel Blob (resolveBlobUrl() + del(), best-effort — ошибка одного файла не блокирует остальное), затем deleteCandidateRecord() в Neon — candidateResumes удаляются автоматически через FK ON DELETE CASCADE, явный вызов deleteResumeVersions() больше не нужен.\nsubmitContactRequest() / submitGeneralInquiry() — резолвят streamId через getStreamIdByName() и записывают запрос в Neon (employerToken/streamId/candidateId — FK, employerName/company/employerEmail больше не дублируются в строке запроса).\nsetContactRequestStatus(id, status) — меняет статус запроса в Neon по id (UUID).\nupdateStream(id, data) — CRUD стрима в Neon; сначала getStreamById(id), если data.name отличается от текущего и streamHasSentReleases(id) (приватный helper — пересекает getMailingLists() с getCampaigns() по имени кампании, тот же приём, что у deleteMailingList()) — бросает ошибку, переименование недоступно. createStream(data) — без проверок, новый стрим всегда Активный. deleteStream(id) — тот же streamHasSentReleases(id)-guard, недоступно при отправленных рассылках. archiveStream(id) / unarchiveStream(id) (новые) — updateStreamRecord(id, {status}), без проверок. Все — revalidatePath /editor/streams.\nupdateCandidate(id, data) — также { ok, error } (TASK-38); обновляет поля кандидата (включая title/summary/stream/level/countryPrimary/countryDesired/activeSince) в Neon через updateCandidateFields() (TASK-DB-4 — адресация по id, массивы передаются как есть, без join(\", \")); если resumeUrl реально изменился (data.resumeVersionChanged передан клиентом) — доп. пишет новую версию резюме в Neon, kind определяется на сервере через isOwnFileUrl() (revalidatePath /editor/candidates).\ngetCandidateResumeHistory(candidateId) — история версий резюме кандидата из Neon, новые сверху (TASK-32).\ngetCandidateMailingHistory(candidateId) (TASK-05, видимость) — вызывает getMailingListsForCandidate() (lib/db/mailing-lists.ts) и getCampaigns() (SendPulse) параллельно, помечает каждый выпуск sent: boolean по совпадению имени кампании ${stream} — ${date} — не пишет ничего, чисто чтение для истории рассылок в CandidateEditModal.\nupdateEmployer(token, data) — обновляет поля работодателя в Neon через updateEmployerFields(); та же { ok, error }-валидация, что у registerEmployer() (включая обязательную компанию, TASK-36), та же резолюция компании через findOrCreateCompanyByName(); если работодатель уже подтверждён, доп. синхронизирует правки в SendPulse через syncEmployerToSendPulse() (revalidatePath /editor/employers). registerEmployer()/updateEmployer() оба дополнены try/catch вокруг createEmployer()/updateEmployerFields() (TASK-38) — подстраховка на случай гонки, которую штатная проверка дублей (только среди активных заявок, по нормализованным значениям) теоретически может пропустить; UNIQUE на уровне БД (employers_email_unique/employers_phone_unique) ловится той же uniqueViolationConstraint(), что и у кандидатов." "Next.js Server Actions" "Logic"

        publishApi = component "Publish API (/api/publish/[listId])" "HTTP-роут для запуска рассылки через curl или внешние системы. Защищён EDITOR_SECRET." "Next.js Route Handler" "Logic"

        uploadApi = component "Upload API (/api/upload)" "POST-роут загрузки резюме: принимает multipart/form-data, проверяет тип (PDF/DOC/DOCX/RTF/ODT) и размер (≤5 МБ), сохраняет в Vercel Blob (private, папка resumes/). Возвращает proxy URL вида APP_URL/api/resume?url=<encodedBlobUrl> для хранения в Google Sheets." "Next.js Route Handler" "Logic"

        resumeApi = component "Resume API (/api/resume)" "GET-роут прокси для приватных файлов Vercel Blob: получает ?url=, проверяет hostname (*.blob.vercel-storage.com), делает fetch с Authorization: Bearer BLOB_READ_WRITE_TOKEN и стримит ответ клиенту. Защита от open redirect по hostname." "Next.js Route Handler" "Logic"

        # Integrations
        sheetsLib = component "Sheets Library (lib/sheets.ts)" "TASK-DB-4 ✅ — не часть боевого пути приложения. Единственный потребитель — sheetsImportLib (TASK-39): getCandidates() (чтение, Status отдаётся как есть, без легаси-дефолта «пусто → Активный» — это решает importCandidatesFromSheet(), не этот модуль), appendCandidateRow()/deleteCandidateRow() (используются только тестами), writeCandidateId() — единственная запись в саму таблицу, дописывает сгенерированный id новой строки обратно в ячейку, иначе повторный импорт той же строки без id/email/phone не распознал бы её как уже импортированную." "TypeScript, Google Sheets API v4" "Integration"

        sheetsImportLib = component "Sheets Import Library (lib/sheets-import.ts)" "TASK-39 ✅ — общая categorize() сортирует строки Google-таблицы на «к импорту»/«дубликат» (совпадение id/email/phone с Neon)/«невалидная» (нет имени); переиспользуется и read-only previewCandidatesImport(), и реальным importCandidatesFromSheet(), так что превью и факт совпадают по числам. Status — «На проверке»/«Активный» как есть, иначе принудительно «На проверке». Stream/Excluded Streams сверяются со списком активных стримов (dbLib.getStreams()) — неизвестное имя в ячейке отбрасывается, известные в той же ячейке сохраняются." "TypeScript" "Integration"

        dbLib = component "DB Library (lib/db/)" "Drizzle ORM + @neondatabase/serverless (neon-http driver).\nschema.ts — схемы таблиц candidates (TASK-DB-4), contactRequests, streams (id/name/type/description/status), candidateResumes (TASK-32), employers (TASK-DB-3), mailingLists (TASK-40 ✅ — заголовок выпуска: id/streamId (FK, ON DELETE SET NULL)/targetDate (timestamp, mode: \"string\")/recipientLabel/sentCampaignId), mailingListEntries (TASK-DB-5) — id/listId (FK на mailingLists.id, ON DELETE CASCADE, TASK-40)/candidateId (FK, ON DELETE SET NULL) и mailingListRecipients (TASK-40 ✅ — id/listId (FK на mailingLists.id, ON DELETE CASCADE)/employerToken (FK на employers.token, ON DELETE CASCADE)).\nindex.ts — клиент drizzle(neon(DATABASE_URL)).\ncandidates.ts (TASK-DB-4) — объединяет бывшие Profile+Candidate (lib/sheets.ts) в один тип Candidate (без rowIndex — адресация по id; без catch-all extra — проверка перед переносом подтвердила, что оно пусто у всех реальных кандидатов). getCandidates() (все статусы, для редактора), getActiveCandidates() (только «Активный», публичная сторона), getCandidateById(id) (без фильтра по статусу), createCandidateRecord(data) (один INSERT, в отличие от прежнего append+update в Sheets), updateCandidateFields(id, data), updateCandidateStatus(id, status, activeSince?), deleteCandidateRecord(id) (candidateResumes каскадно удаляются через FK, mailingListEntries/contactRequests отвязываются через ON DELETE SET NULL). stream/excludedCompanies/excludedStreams — нативные Postgres text[]. Нет колонки resumeUrl — candidateResumes единственный источник правды, «текущая» версия — самая новая запись (ORDER BY createdAt DESC). activeSince — настоящая date-колонка (mode: \"string\", ISO, nullable = «не задано»); конвертация в/из привычного ru-RU текста («21.07.2026») изолирована на границе этого модуля — остальной код (CandidateEditModal, approveCandidate(), фильтры-хелперы) работает со строкой как раньше. Перенесённые чистые фильтры-хелперы: getCandidatesForStream(), getEligibleCandidatesForRelease(), getPausedCandidatesForRelease() (TASK-27/TASK-05/TASK-28 — без изменений в логике).\ncontact-requests.ts — appendContactRequest(), getContactRequests(), updateContactRequestStatus(id); candidateId — FK на candidates.id, ON DELETE SET NULL, null↔\"\" конвертация на границе модуля (внешний тип остаётся string).\nstreams.ts — getStreams() (только status='Активный' — архивный стрим не предлагается ни в одном месте, где выбирается стрим для нового действия), getStreamsDetailed() (все, только для страницы стримов), getStreamById(id), createStreamRecord(), updateStreamRecord(id, Partial<{name,type,description,status}>) (объединяет правки полей и смену статуса в одну функцию — тот же приём, что updateEmployerFields), deleteStreamRecord().\nmailing-lists.ts (TASK-DB-5; переписан под заголовочную таблицу mailingLists, TASK-40 ✅) — getMailingList(listId) (заголовок mailingLists джойн на streams + отдельный запрос candidateId из mailingListEntries + джойн с getActiveCandidates() из candidates.ts, TASK-DB-4), getMailingListMeta(listId) (лёгкий вариант без кандидатов, для publishMailingList()/deleteMailingList()/submitContactRequest()/submitGeneralInquiry() — включает recipientLabel и sentCampaignId), getMailingLists() (сортировка по убыванию targetDate; MailingListSummary несёт streamId/recipientLabel/sentCampaignId), createMailingListRows({stream, date, candidateIds, recipientLabel?}) (создаёт заголовок mailingLists — stream резолвится в streamId через getStreamIdByName(), date → timestamp полночь — и строки mailingListEntries, два отдельных insert'а), updateMailingListTimestamp(listId, timestamp) (было updateMailingListDate — снимает плановую дату/время на фактический момент первой отправки, полный timestamp, не только дата), markMailingListSent(listId, campaignId) (TASK-40 ✅ — пишет sentCampaignId один раз на первой реальной отправке, единственный источник истины «отправлен ли выпуск» вместо сравнения имени кампании), campaignNameFor(stream, date, recipientLabel) (TASK-40 ✅ — имя кампании SendPulse, живёт здесь, не в app/actions.ts из-за \"use server\"), deleteMailingListRows(listId) (удаляет заголовок — FK ON DELETE CASCADE сам сносит mailingListEntries и mailingListRecipients), getMailingListCandidateIds(listId) (TASK-05, пауза публикации), getMailingListsForCandidate(candidateId) (TASK-05 — все выпуски кандидата с sentCampaignId на каждом, для видимости в CandidateEditModal и подсчёта реальных отправок при вычислении паузы), createMailingListRecipientRows(listId, employerTokens) / getMailingListRecipientTokens(listId) (TASK-40 ✅ — переопределение получателей узкого выпуска: наличие строк = сужено, отсутствие = весь стрим). Публичный date остаётся ru-RU текстом (isoToRu(), экспортируется — переиспользуется в app/actions.ts; candidates.ts не импортирует его обратно — своя локальная копия, иначе цикл модулей).\nresumes.ts (TASK-32) — addResumeVersion({candidateId, kind, filename?, url}) (no-op если candidateId/url пустые), getResumeVersions(candidateId) — история версий резюме, новые сверху, getResumeVersionsForCandidates(ids) — то же батчем, deleteResumeVersions(candidateId) (TASK-33) — удаляет всю историю кандидата; candidateId — FK на candidates.id, ON DELETE CASCADE (TASK-DB-4 — резюме не живёт без кандидата, удаление кандидата каскадно подчищает и эту таблицу).\nemployers.ts (TASK-DB-3) — getEmployers(), getEmployerByToken(token) (прямой WHERE token = ..., не выгрузка всех строк с поиском в JS, как было в Sheets), getEmployersByStream(stream), createEmployer(data), updateEmployerFields(token, data) (объединяет прежние updateEmployerStatus+updateEmployerFields в одну функцию — в Sheets они были раздельными только из-за ячеечной записи; Partial<> дополнен telegramId — синхронизация из EmployersPage; telegram — ранее только из EmployerEditModal, теперь ещё и из той же синхронизации), deleteEmployer(token), filterCandidatesForEmployer() (чистая функция без I/O, тип аргумента — Candidate из candidates.ts, TASK-DB-4). streams/additionalCountries — нативные Postgres text[], не comma-joined строка. employers.telegramId (text, nullable) — Telegram user id работодателя, задел на переход с SendPulse на self-hosted бота (см. workspace.dsl/backlog.adoc TASK-35); пишется/чистится только из EmployersPage, не через форму редактирования. employers.telegram (@username) — вписывается вручную при регистрации, но EmployersPage может перезаписать его реальным подключённым username (никогда не стирает).\nMigrations: scripts/migrate.mjs." "TypeScript, Drizzle ORM, Neon" "Integration"

        sendPulseLib = component "SendPulse Library (lib/sendpulse.ts)" "OAuth 2.0 с кэшем токена (59 мин). Кэш адресных книг с TTL 60 с.\ngetOrCreateBook() — авто-создание книги (по имени — для узкой рассылки, TASK-40 ✅, имя одноразовой книги включает listId, так что каждый publish создаёт свежую).\ngetBookEmailCount() — проверка подписчиков до рассылки.\ndeleteAddressBook(bookId, token) (TASK-40 ✅) — удаляет одноразовую книгу узкой рассылки после отправки, best-effort (тот же приём, что setTelegramContactState() ниже — весь body в try/catch, никогда не бросает, очистка не должна ломать уже ушедшую кампанию).\ncreateCampaign() / getCampaigns().\nTelegram-бот (TASK-35): telegramConnectUrl(employerToken) — персональная tg.pulse.is-ссылка, null если бот не настроен; sendTelegramToEmployer(employerToken, text) — поиск контакта по переменной employer_token (getByVariable) + sendText, best-effort; getTelegramConnectionInfo(employerTokens) — Map<employerToken, {telegramId, username}> для бейджа «Telegram» и для синхронизации employers.telegramId/telegram (Neon) на /editor/employers, best-effort (пустая Map при недоступности); getTelegramContactRecords() (внутренняя) отдаёт telegram_id — Telegram user id, отдельная величина от внутреннего id-контакта SendPulse — и channel_data.username — реальный @username подключённого аккаунта, может отличаться от того, что работодатель вписал при регистрации; disableTelegramContact(employerToken) / deleteTelegramContact(employerToken) — POST /telegram/contacts/disable|delete, вызываются из rejectEmployer()/deleteEmployer(); ищут контакт по любому статусу (getTelegramContactRecords(), не findTelegramContactId()), иначе уже отключённый контакт нельзя было бы найти повторно для удаления; best-effort — на бесплатном тарифе SendPulse обе отвечают 400 \"Available only on a paid tariff\" (та же граница, что у sendText), код рассчитан заработать сам после перехода на платный тариф." "TypeScript, SendPulse REST API" "Integration"
      }
    }

    # ── Отношения: системный контекст ────────────────────────────────────────

    employer -> talentStreams "Просматривает подборки, подписывается на рассылку, запрашивает контакт с кандидатом"
    candidate -> talentStreams "Регистрируется как кандидат"
    editor -> talentStreams "Подтверждает работодателей, модерирует кандидатов, запускает рассылки через /editor"

    talentStreams -> neon "INSERT/SELECT/UPDATE candidates, contactRequests, streams, employers, companies, candidateResumes, mailingLists, mailingListEntries, mailingListRecipients" "HTTPS, Neon HTTP API"
    talentStreams -> sendPulse "Добавляет подтверждённых работодателей; создаёт кампании" "HTTPS, REST API"
    talentStreams -> vercelBlob "Загружает резюме (PUT) и читает их (GET с Bearer-токеном) через /api/upload и /api/resume" "HTTPS, Vercel Blob API"

    # ── Отношения: контейнерный уровень ──────────────────────────────────────

    employer -> talentStreams.webApp "HTTPS"
    candidate -> talentStreams.webApp "HTTPS"
    editor -> talentStreams.webApp "HTTPS (/editor)"
    talentStreams.webApp -> neon "Neon HTTP API / Drizzle ORM" "HTTPS"
    talentStreams.webApp -> sendPulse "OAuth 2.0 + REST API" "HTTPS"
    talentStreams.webApp -> vercelBlob "PUT resumes (upload) / GET resumes (proxy с Bearer-токеном)" "HTTPS"

    # ── Отношения: компонентный уровень ──────────────────────────────────────

    talentStreams.webApp.homePage -> talentStreams.webApp.languageProvider "Оборачивает HomePageContent"
    talentStreams.webApp.homePage -> talentStreams.webApp.homePageContent "Рендерит (configured, streams)"
    talentStreams.webApp.homePageContent -> talentStreams.webApp.languageToggle "Рендерит в шапке"
    talentStreams.webApp.homePageContent -> talentStreams.webApp.employerModal "Рендерит"
    talentStreams.webApp.homePageContent -> talentStreams.webApp.candidateModal "Рендерит"
    talentStreams.webApp.homePageContent -> talentStreams.webApp.i18nLib "useLocale() + homeDict"
    talentStreams.webApp.employerModal -> talentStreams.webApp.i18nLib "useLocale() + employerFormDict"
    talentStreams.webApp.candidateModal -> talentStreams.webApp.i18nLib "useLocale() + candidateFormDict"
    talentStreams.webApp.profilePage -> talentStreams.webApp.profileView "Рендерит"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит (по одной на карточку)"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.publishButton "Рендерит (по одной на выпуск)"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.releaseCreateModal "Рендерит"
    talentStreams.webApp.releaseCreateModal -> talentStreams.webApp.serverActions "createMailingList({ stream, date, candidateIds, employerTokens? })"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.releaseDeleteButton "Рендерит (только пока не отправлен)"
    talentStreams.webApp.releaseDeleteButton -> talentStreams.webApp.serverActions "deleteMailingList(listId)"
    talentStreams.webApp.employersPage -> talentStreams.webApp.employerSection "Рендерит"
    talentStreams.webApp.companiesPage -> talentStreams.webApp.companiesSection "Рендерит"
    talentStreams.webApp.companiesPage -> talentStreams.webApp.dbLib "getCompaniesWithEmployers()"
    talentStreams.webApp.employerModal -> talentStreams.webApp.companyAutocompleteInput "Рендерит"
    talentStreams.webApp.employerEditModal -> talentStreams.webApp.companyAutocompleteInput "Рендерит"
    talentStreams.webApp.employerCreateModal -> talentStreams.webApp.companyAutocompleteInput "Рендерит"
    talentStreams.webApp.companyAutocompleteInput -> talentStreams.webApp.serverActions "searchCompanies(query) — автодополнение"
    talentStreams.webApp.editorLayout -> talentStreams.webApp.editorNav "Рендерит"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.dbLib "getCandidates()"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.dbLib "getStreams() — опции фильтра"
    talentStreams.webApp.candidatesPage -> talentStreams.webApp.candidateSection "Рендерит"
    talentStreams.webApp.settingsPage -> talentStreams.webApp.importCandidatesButton "Рендерит, если isSheetsConfigured()"
    talentStreams.webApp.importCandidatesButton -> talentStreams.webApp.serverActions "previewCandidatesImport() / importCandidatesFromSheets()"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.serverActions "approveCandidate() / rejectCandidate()"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.candidateEditModal "Открывает при клике на Pencil"
    talentStreams.webApp.candidateSection -> talentStreams.webApp.profilePage "Имя кандидата — ссылка (новая вкладка)"
    talentStreams.webApp.candidateEditModal -> talentStreams.webApp.uploadApi "POST /api/upload (при выборе файла)"
    talentStreams.webApp.candidateEditModal -> talentStreams.webApp.serverActions "updateCandidate(candidate.id, data) / getCandidateResumeHistory(candidate.id) / getCandidateMailingHistory(candidate.id)"
    editor -> talentStreams.webApp.candidatesPage "Модерирует, фильтрует и редактирует данные кандидатов"

    talentStreams.webApp.homePage -> talentStreams.webApp.dbLib "getStreams()"
    talentStreams.webApp.profilePage -> talentStreams.webApp.dbLib "getCandidateById(id)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getMailingList(listId) — джойн с getActiveCandidates() (candidates.ts, TASK-DB-4)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "getStreamsDetailed() — типы стримов для тегов на карточке (TASK-27)"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.dbLib "getActiveCandidates() — подходящие кандидаты на стрим для ReleaseCreateModal"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.dbLib "getMailingLists() / getStreams() / getEmployers() — выпуски и подтверждённые подписчики на стрим для ReleaseCreateModal"
    talentStreams.webApp.releasesPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount() — проверка пустой книги"
    talentStreams.webApp.employersPage -> talentStreams.webApp.dbLib "getEmployers()"
    talentStreams.webApp.employersPage -> talentStreams.webApp.dbLib "getStreams() — опции фильтра"
    talentStreams.webApp.employersPage -> talentStreams.webApp.sendPulseLib "getTelegramConnectionInfo(employerTokens)"
    talentStreams.webApp.employersPage -> talentStreams.webApp.dbLib "updateEmployerFields(token, { telegramId, telegram }) — только при расхождении с найденным у SendPulse; telegram не стирается, только перезаписывается реальным username"

    talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(EmployerData)"
    talentStreams.webApp.candidateModal -> talentStreams.webApp.serverActions "registerCandidate(CandidateData)"
    talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
    talentStreams.webApp.employerSection -> talentStreams.webApp.serverActions "confirmEmployer() / rejectEmployer() / deleteEmployer()"
    talentStreams.webApp.employerSection -> talentStreams.webApp.employerEditModal "Открывает при клике на Pencil"
    talentStreams.webApp.employerEditModal -> talentStreams.webApp.serverActions "updateEmployer(token, data)"
    talentStreams.webApp.employerSection -> talentStreams.webApp.employerCreateModal "Открывает по кнопке «+ Добавить работодателя»"
    talentStreams.webApp.employerCreateModal -> talentStreams.webApp.serverActions "registerEmployer(data)"

    talentStreams.webApp.publishApi -> talentStreams.webApp.serverActions "publishMailingList(listId)"

    talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createCandidateRecord(), getCandidates() / updateCandidateStatus() — TASK-05, пауза публикации; updateCandidateFields(), deleteCandidateRecord()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createEmployer(), updateEmployerFields(), getMailingListMeta(), createMailingListRows(), deleteMailingListRows(), getMailingListCandidateIds(), getMailingListsForCandidate()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "syncEmployerToSendPulse() / createCampaign()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "appendContactRequest() / updateContactRequestStatus(id) / addResumeVersion() / getResumeVersions(candidateId)"
    talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsImportLib "previewCandidatesImport() / importCandidatesFromSheet() (TASK-39)"
    talentStreams.webApp.sheetsImportLib -> talentStreams.webApp.sheetsLib "getCandidates() — читает строки таблицы; writeCandidateId(rowIndex, id) — только для строк без собственного id"
    talentStreams.webApp.sheetsImportLib -> talentStreams.webApp.dbLib "getCandidates() / createCandidateRecord() — дедуп и запись кандидата; getStreams() — валидация Stream/Excluded Streams; addResumeVersion() — если указан Resume URL"
    talentStreams.webApp.sheetsLib -> googleSheets "GET values (чтение всех строк) / PUT values (writeCandidateId)" "HTTPS, Google Sheets API v4"

    editor -> talentStreams.webApp.releasesPage "Просматривает выпуски, запускает рассылку"
    editor -> talentStreams.webApp.employersPage "Подтверждает и отклоняет заявки работодателей"
    editor -> talentStreams.webApp.companiesPage "Просматривает компании и людей внутри каждой"
    editor -> talentStreams.webApp.settingsPage "Проверяет и импортирует кандидатов из Google-таблицы (TASK-39)"
    editor -> talentStreams.webApp.streamsPage "Управляет стримами: добавляет, редактирует, удаляет"
    editor -> talentStreams.webApp.publishApi "curl /api/publish/{listId}?token=…"

    talentStreams.webApp.dbLib -> neon "INSERT / SELECT / UPDATE candidates, contactRequests, streams, employers, companies, candidateResumes, mailingLists, mailingListEntries, mailingListRecipients" "HTTPS, Neon HTTP API"
    talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token, GET /addressbooks, POST /addressbooks/{id}/emails, POST /campaigns" "HTTPS"

    talentStreams.webApp.candidateModal -> talentStreams.webApp.uploadApi "POST /api/upload (при сабмите, если выбран файл)"
    talentStreams.webApp.uploadApi -> vercelBlob "put(filename, file, { access: 'private' })" "HTTPS, Vercel Blob API"
    talentStreams.webApp.resumeApi -> vercelBlob "fetch(blobUrl, { Authorization: Bearer token })" "HTTPS, Vercel Blob API"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.serverActions "updateStream() / createStream() / deleteStream() / archiveStream()"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.archivedStreamsSection "Рендерит"
    talentStreams.webApp.archivedStreamsSection -> talentStreams.webApp.serverActions "unarchiveStream(id)"

    talentStreams.webApp.requestsPage -> talentStreams.webApp.dbLib "getContactRequests()"
    talentStreams.webApp.requestsPage -> talentStreams.webApp.dbLib "getActiveCandidates()"
    talentStreams.webApp.requestsPage -> talentStreams.webApp.contactRequestsSection "Рендерит"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.dbLib "getStreamsDetailed() / getEmployers() — подсчёт подтверждённых подписчиков на стрим / getMailingLists() + история рассылок по streamId"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.dbLib "getActiveCandidates() — подсчёт подходящих кандидатов на стрим (TASK-27)"
    talentStreams.webApp.streamsPage -> talentStreams.webApp.sendPulseLib "getCampaigns() — какие выпуски стрима реально отправлены"
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
      talentStreams.webApp.dbLib -> neon "SELECT streams.name, targetDate FROM mailingLists LEFT JOIN streams ON streamId = streams.id WHERE id = ... LIMIT 1 (TASK-40)"
      talentStreams.webApp.dbLib -> neon "SELECT candidateId FROM mailingListEntries WHERE listId = ..."
      talentStreams.webApp.dbLib -> neon "SELECT * FROM candidates WHERE status = 'Активный' — джойн, TASK-DB-4"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.dbLib "filterCandidatesForEmployer(entries, employer)"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит кнопку под каждой анонимной карточкой (с employerToken)"
      autolayout lr
    }

    dynamic talentStreams.webApp "CreateRelease" "Сценарий автоматического создания выпуска редактором (упрощённые TASK-28/TASK-29, хранение — TASK-DB-5, заголовочная таблица — TASK-40)" {
      talentStreams.webApp.releaseCreateModal -> talentStreams.webApp.serverActions "createMailingList({ stream, date, candidateIds, employerTokens? }) — date уже ISO с <input type=\"date\">"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getEmployerByToken(t) на каждый employerToken — только если непусто, считает recipientLabel"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createMailingListRows({ stream, date, candidateIds, recipientLabel })"
      talentStreams.webApp.dbLib -> neon "INSERT INTO mailingLists (заголовок выпуска: id/streamId/targetDate=полночь/recipientLabel)"
      talentStreams.webApp.dbLib -> neon "INSERT INTO mailingListEntries (одним батчем, по строке на кандидата, общий listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "createMailingListRecipientRows(listId, employerTokens) — только если узкая рассылка"
      talentStreams.webApp.dbLib -> neon "INSERT INTO mailingListRecipients"
      autolayout lr
    }

    dynamic talentStreams.webApp "DeleteRelease" "Сценарий удаления ещё не отправленного выпуска редактором" {
      talentStreams.webApp.releaseDeleteButton -> talentStreams.webApp.serverActions "deleteMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListMeta(listId) — stream/date/recipientLabel/sentCampaignId, без джойна с кандидатами"
      talentStreams.webApp.dbLib -> neon "SELECT streams.name, targetDate, recipientLabel, sentCampaignId FROM mailingLists LEFT JOIN streams ON streamId = streams.id WHERE id = ... LIMIT 1"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "deleteMailingListRows(listId) — guard: list.sentCampaignId !== null блокирует удаление (TASK-40, не getCampaigns())"
      talentStreams.webApp.dbLib -> neon "DELETE FROM mailingLists WHERE id = ... (каскад сносит mailingListEntries и mailingListRecipients)"
      autolayout lr
    }

    dynamic talentStreams.webApp "StreamRenameGuard" "Сценарий: редактор пытается переименовать/удалить стрим, у которого уже есть отправленная рассылка" {
      talentStreams.webApp.streamsPage -> talentStreams.webApp.serverActions "updateStream(id, { name: новое, type, description })"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getStreamById(id) — текущее имя для сравнения"
      talentStreams.webApp.dbLib -> neon "SELECT * FROM streams WHERE id = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingLists() — все выпуски, с sentCampaignId на каждом (TASK-40)"
      talentStreams.webApp.dbLib -> neon "SELECT ... FROM mailingLists LEFT JOIN streams ON streamId = streams.id"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "streamHasSentReleases(): lists.some(l => l.streamId === streamId && l.sentCampaignId !== null) — без getCampaigns()"
      autolayout lr
    }

    dynamic talentStreams.webApp "PublishMailingList" "Сценарий публикации выпуска редактором (узкая рассылка — TASK-40)" {
      talentStreams.webApp.releasesPage -> talentStreams.webApp.dbLib "getMailingLists()"
      talentStreams.webApp.dbLib -> neon "SELECT ... FROM mailingLists LEFT JOIN streams, затем SELECT listId, candidateId FROM mailingListEntries"
      talentStreams.webApp.releasesPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount(stream)"
      talentStreams.webApp.sendPulseLib -> sendPulse "GET /addressbooks?limit=500"
      talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListMeta(listId) — включая recipientLabel/sentCampaignId"
      talentStreams.webApp.dbLib -> neon "SELECT streams.name, targetDate, recipientLabel, sentCampaignId FROM mailingLists LEFT JOIN streams ON streamId = streams.id WHERE id = ... LIMIT 1"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "updateMailingListTimestamp(listId, now) — только если первая отправка (sentCampaignId === null) и план разошёлся с фактом"
      talentStreams.webApp.dbLib -> neon "UPDATE mailingLists SET targetDate = ... WHERE id = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListRecipientTokens(listId) — пусто = весь стрим, иначе узкая рассылка"
      talentStreams.webApp.dbLib -> neon "SELECT employerToken FROM mailingListRecipients WHERE listId = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "узкая: getOrCreateBook(adhocName) + addToAddressBook() на каждого получателя; иначе: getOrCreateBook(stream)"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /addressbooks (если нет в кэше) + POST /addressbooks/{id}/emails"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "createCampaign(bookId, subject, html, campaignNameFor(stream,date,recipientLabel))"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token → POST /campaigns"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "узкая: deleteAddressBook(adhocBookId) — best-effort, в try/finally"
      talentStreams.webApp.sendPulseLib -> sendPulse "DELETE /addressbooks/{id}"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "markMailingListSent(listId, campaign.id) — только при первой отправке"
      talentStreams.webApp.dbLib -> neon "UPDATE mailingLists SET sentCampaignId = ... WHERE id = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListCandidateIds(listId) — только если первая отправка"
      talentStreams.webApp.dbLib -> neon "SELECT candidateId FROM mailingListEntries WHERE listId = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "applyPublicationPauseRules(): getCandidates() — резолвит id по каждому кандидату выпуска (TASK-DB-4)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListsForCandidate(id) — sentCampaignId на каждой записи, сколько раз кандидат уже реально отправлялся (TASK-40, не сравнение имён кампаний)"
      talentStreams.webApp.dbLib -> neon "SELECT listId FROM mailingListEntries WHERE candidateId = ..., затем SELECT ... FROM mailingLists WHERE id IN (...)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "updateCandidateStatus(id, status, activeSince) — на каждого кандидата: 1-я отправка +2 недели, 2-я +3 месяца, 3-я «Не публиковать» +10 лет"
      autolayout lr
    }

    dynamic talentStreams.webApp "ContactRequest" "Сценарий запроса работодателя на контакт с кандидатом" {
      talentStreams.webApp.contactButton -> talentStreams.webApp.serverActions "submitContactRequest(candidateId, listId, employerToken)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getEmployerByToken(token) — только проверка существования"
      talentStreams.webApp.dbLib -> neon "SELECT * FROM employers WHERE token = ..."
      talentStreams.webApp.serverActions -> talentStreams.webApp.dbLib "getMailingListMeta(listId) — получение имени стрима"
      talentStreams.webApp.dbLib -> neon "SELECT streams.name, targetDate FROM mailingLists LEFT JOIN streams ON streamId = streams.id WHERE id = ... LIMIT 1"
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
