workspace "TalentStreams" "Платформа подборки проверенных кандидатов для работодателей Центральной Азии" {

  !identifiers hierarchical

  model {

    # ── Акторы ──────────────────────────────────────────────────────────────

    employer = person "Работодатель" "Просматривает подборки кандидатов и подписывается на еженедельные рассылки" "User"
    candidate = person "Кандидат" "Регистрируется для включения в подборки" "User"
    editor = person "Редактор" "Ведёт данные кандидатов, подборок и стримов напрямую в Google Sheets" "Internal"

    # ── Внешние системы ──────────────────────────────────────────────────────

    googleSheets = softwareSystem "Google Sheets" "Единое хранилище данных: профили кандидатов, подборки рассылок, список стримов, заявки работодателей и кандидатов" "External"

    sendPulse = softwareSystem "SendPulse" "Email-маркетинг: адресная книга подписчиков, автоматизации рассылок" "External"

    # ── Основная система ─────────────────────────────────────────────────────

    talentStreams = softwareSystem "TalentStreams" "Next.js-приложение: публичный сайт с профилями кандидатов, страницами подборок и формами регистрации" {

      webApp = container "Web Application" "Server-side рендеринг страниц, обработка форм через Server Actions, интеграции с внешними API" "Next.js 14, TypeScript" "WebApp" {

        # Pages (Server Components)
        homePage = component "HomePage" "Лендинг сервиса: описание, кнопки регистрации работодателя и кандидата. Загружает список стримов с сервера." "Next.js Server Component" "Page"

        profilePage = component "ProfilePage" "Профиль кандидата по его ID. Поддерживает параметр ?back= для возврата в подборку." "Next.js Server Component" "Page"

        mailingListPage = component "MailingListPage" "Страница подборки (/list/[listId]): список кандидатов выпуска с датой и стримом." "Next.js Server Component" "Page"

        # Client Components
        employerModal = component "EmployerRegistrationModal" "Форма подписки работодателя: имя, компания, email, телефон, способ связи (Email / Telegram / WhatsApp / LinkedIn), выбор до 2 стримов." "React Client Component" "UI"

        candidateModal = component "CandidateRegistrationModal" "Форма регистрации кандидата: имя, email, телефон, ссылка на резюме, сопроводительное письмо." "React Client Component" "UI"

        profileView = component "ProfileView" "Карточка профиля: имя, роль, bio, контакты, теги стримов, дополнительные поля. Кнопка «назад» ведёт к подборке или на главную." "React Client Component" "UI"

        editorPage = component "EditorPage" "Страница редактора (/editor): список всех выпусков из «Mailing lists» с датой, стримом, счётчиком кандидатов и кнопкой запуска рассылки. Защищена EDITOR_SECRET." "Next.js Server Component" "Page"

        # Server Actions
        serverActions = component "Server Actions" "registerEmployer(), registerCandidate(), publishMailingList() — валидация, параллельная запись в Google Sheets, управление кампаниями SendPulse." "Next.js Server Actions" "Logic"

        publishApi = component "Publish API" "API-роут /api/publish/[listId]: HTTP GET/POST для запуска рассылки через curl или внешние системы. Защищён EDITOR_SECRET через query-параметр token или заголовок x-editor-token." "Next.js Route Handler" "Logic"

        # Integrations
        sheetsLib = component "Sheets Library" "Весь доступ к Google Sheets: чтение профилей, подборок, стримов, выпусков, работодателей; запись заявок. Аутентификация через Service Account JWT." "TypeScript, Google Sheets API v4" "Integration"

        sendPulseIntegration = component "SendPulse Integration" "OAuth 2.0 Client Credentials с кэшем токена 59 мин. Добавление контактов в адресные книги (мастер + по стримам). Создание email-кампаний через POST /campaigns. node:https для обхода корпоративного TLS." "TypeScript, SendPulse REST API" "Integration"
      }
    }

    # ── Отношения: системный контекст ────────────────────────────────────────

    employer -> talentStreams "Просматривает подборки и профили кандидатов, подписывается на рассылку"
    candidate -> talentStreams "Регистрируется как кандидат"
    editor -> googleSheets "Заполняет листы: Candidates, Mailing lists, Streams, Employers"

    talentStreams -> googleSheets "Читает профили, подборки, стримы; пишет заявки" "HTTPS, Sheets API v4"
    talentStreams -> sendPulse "Добавляет контакты в адресную книгу" "HTTPS, REST API"

    # ── Отношения: контейнерный уровень ──────────────────────────────────────

    employer -> talentStreams.webApp "HTTPS"
    candidate -> talentStreams.webApp "HTTPS"
    editor -> talentStreams.webApp "HTTPS (редактор выпусков)"
    talentStreams.webApp -> googleSheets "Sheets API v4 / Service Account JWT" "HTTPS"
    talentStreams.webApp -> sendPulse "OAuth 2.0 + POST /addressbooks + POST /campaigns" "HTTPS"

    # ── Отношения: компонентный уровень ──────────────────────────────────────

    # Страницы рендерят компоненты
    talentStreams.webApp.homePage -> talentStreams.webApp.employerModal "Рендерит (передаёт список стримов)"
    talentStreams.webApp.homePage -> talentStreams.webApp.candidateModal "Рендерит"
    talentStreams.webApp.profilePage -> talentStreams.webApp.profileView "Рендерит (передаёт backUrl)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.profileView "Рендерит карточки кандидатов"

    # Страницы читают данные
    talentStreams.webApp.homePage -> talentStreams.webApp.sheetsLib "getStreams()"
    talentStreams.webApp.profilePage -> talentStreams.webApp.sheetsLib "getProfile(id)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
    talentStreams.webApp.editorPage -> talentStreams.webApp.sheetsLib "getMailingLists()"
    talentStreams.webApp.editorPage -> talentStreams.webApp.serverActions "publishMailingList(listId)"

    # Формы вызывают Server Actions
    talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(EmployerData)"
    talentStreams.webApp.candidateModal -> talentStreams.webApp.serverActions "registerCandidate(CandidateData)"

    # Publish API вызывает Server Action
    talentStreams.webApp.publishApi -> talentStreams.webApp.serverActions "publishMailingList(listId)"

    # Server Actions пишут данные и взаимодействуют с SendPulse
    talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "appendEmployerRow(), appendCandidateRow(), getMailingList()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseIntegration "addToSendPulse() / createCampaign()"

    # Редактор работает с EditorPage и PublishApi
    editor -> talentStreams.webApp.editorPage "Просматривает выпуски, запускает рассылку"
    editor -> talentStreams.webApp.publishApi "curl /api/publish/{listId}?token=…"

    # Интеграции взаимодействуют с внешними системами
    talentStreams.webApp.sheetsLib -> googleSheets "fetchSheetValues(), appendRow()" "HTTPS, Sheets API v4"
    talentStreams.webApp.sendPulseIntegration -> sendPulse "POST /oauth/access_token, POST /addressbooks/{id}/emails, POST /campaigns" "HTTPS"
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

    dynamic talentStreams.webApp "EmployerRegistration" "Сценарий регистрации работодателя" {
      talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(data)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "appendEmployerRow([...])"
      talentStreams.webApp.sheetsLib -> googleSheets "POST /values/Employers!A1:append"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseIntegration "addToSendPulse(name, email, phone, { Streams, ... })"
      talentStreams.webApp.sendPulseIntegration -> sendPulse "POST /addressbooks/MASTER/emails"
      talentStreams.webApp.sendPulseIntegration -> sendPulse "POST /addressbooks/STREAM_BOOK/emails (по каждому выбранному стриму)"
      autolayout lr
    }

    dynamic talentStreams.webApp "MailingListView" "Сценарий просмотра подборки" {
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000"
      talentStreams.webApp.sheetsLib -> googleSheets "GET профили основного листа"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.profileView "Рендерит карточки с ссылкой /{id}?back=/list/{listId}"
      autolayout lr
    }

    dynamic talentStreams.webApp "PublishMailingList" "Сценарий публикации выпуска редактором" {
      talentStreams.webApp.editorPage -> talentStreams.webApp.sheetsLib "getMailingLists()"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000"
      talentStreams.webApp.editorPage -> talentStreams.webApp.serverActions "publishMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
      talentStreams.webApp.sheetsLib -> googleSheets "GET профили для подсчёта кандидатов"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseIntegration "createCampaign(bookId, subject, html)"
      talentStreams.webApp.sendPulseIntegration -> sendPulse "POST /oauth/access_token → POST /campaigns"
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
