workspace "TalentStreams" "Платформа подборки проверенных кандидатов для работодателей Центральной Азии" {

  !identifiers hierarchical

  model {

    # ── Акторы ──────────────────────────────────────────────────────────────

    employer = person "Работодатель" "Просматривает анонимные подборки кандидатов, подписывается на рассылку, отправляет запросы на контакт" "User"
    candidate = person "Кандидат" "Регистрируется для включения в подборки" "User"
    editor = person "Редактор" "Ведёт данные кандидатов и стримов в Google Sheets; подтверждает заявки работодателей и запускает рассылки через /editor" "Internal"

    # ── Внешние системы ──────────────────────────────────────────────────────

    googleSheets = softwareSystem "Google Sheets" "Единое хранилище данных: профили кандидатов, подборки рассылок, стримы, заявки работодателей (со статусом), заявки кандидатов" "External"

    sendPulse = softwareSystem "SendPulse" "Email-маркетинг: адресные книги подписчиков (мастер + по стримам), рассылки кампаний" "External"

    # ── Основная система ─────────────────────────────────────────────────────

    talentStreams = softwareSystem "TalentStreams" "Next.js-приложение: публичный сайт с подборками кандидатов, формами регистрации и редактором выпусков" {

      webApp = container "Web Application" "Server-side рендеринг, Server Actions, интеграции с Google Sheets и SendPulse" "Next.js 14, TypeScript" "WebApp" {

        # Pages (Server Components)
        homePage = component "HomePage (/)" "Лендинг: описание сервиса, формы регистрации работодателя и кандидата, список стримов с сервера" "Next.js Server Component" "Page"

        mailingListPage = component "MailingListPage (/list/[listId])" "Страница подборки: анонимные карточки кандидатов (без имён и контактов), теги, summary, disclaimer. Noindex." "Next.js Server Component" "Page"

        profilePage = component "ProfilePage (/profile/[id])" "Полный профиль кандидата. Недоступна со страниц подборок. Noindex." "Next.js Server Component" "Page"

        editorPage = component "EditorPage (/editor)" "Редактор: список выпусков (стрим, дата, кандидаты, история кампаний, кнопка публикации), секция подтверждения работодателей. Защищён EDITOR_SECRET." "Next.js Server Component" "Page"

        # Client Components
        employerModal = component "EmployerRegistrationModal" "Форма подписки работодателя: имя, компания, email, телефон, способ связи, выбор стримов. После отправки — статус «На проверке»." "React Client Component" "UI"

        candidateModal = component "CandidateRegistrationModal" "Форма регистрации кандидата: имя, email, телефон, ссылка на резюме, сопроводительное письмо." "React Client Component" "UI"

        profileView = component "ProfileView" "Полная карточка профиля: имя, роль, bio, контакты, теги стримов, дополнительные поля. Кнопка «назад»." "React Client Component" "UI"

        contactButton = component "ContactButton" "Кнопка «Хочу связаться» на карточке подборки. Заглушка — TASK-01." "React Client Component" "UI"

        employerSection = component "EmployerSection" "Секция редактора: три коллапсируемые группы работодателей (На проверке / Отклонён / Подтверждён). Кнопки «Подтвердить» и «Отклонить»." "React Client Component" "UI"

        publishButton = component "PublishButton" "Кнопка запуска рассылки. Отключена если адресная книга пуста. Показывает статус кампании." "React Client Component" "UI"

        # Server Actions
        serverActions = component "Server Actions" "registerEmployer() — пишет со статусом «На проверке», не добавляет в SP.\nregisterCandidate() — пишет в Sheets.\npublishMailingList() — создаёт кампанию в SP.\nconfirmEmployer() — сначала SP, затем статус «Подтверждён».\nrejectEmployer() — статус «Отклонён».\naddProfileColumns() — миграция колонок." "Next.js Server Actions" "Logic"

        publishApi = component "Publish API (/api/publish/[listId])" "HTTP-роут для запуска рассылки через curl или внешние системы. Защищён EDITOR_SECRET." "Next.js Route Handler" "Logic"

        # Integrations
        sheetsLib = component "Sheets Library (lib/sheets.ts)" "Весь доступ к Google Sheets через Service Account JWT.\nЧтение: профили, подборки, стримы, работодатели.\nЗапись: регистрации, статусы работодателей.\nМиграция: ensureProfileColumns().\nАвтосоздание листов через ensureSheet()." "TypeScript, Google Sheets API v4" "Integration"

        sendPulseLib = component "SendPulse Library (lib/sendpulse.ts)" "OAuth 2.0 с кэшем токена (59 мин). Кэш адресных книг с TTL 60 с.\ngetOrCreateBook() — авто-создание книги.\ngetBookEmailCount() — проверка подписчиков до рассылки.\ncreateCampaign() / getCampaigns()." "TypeScript, SendPulse REST API" "Integration"
      }
    }

    # ── Отношения: системный контекст ────────────────────────────────────────

    employer -> talentStreams "Просматривает подборки, подписывается на рассылку, запрашивает контакт с кандидатом"
    candidate -> talentStreams "Регистрируется как кандидат"
    editor -> googleSheets "Заполняет листы: Candidates, Mailing lists, Streams"
    editor -> talentStreams "Подтверждает работодателей, запускает рассылки через /editor"

    talentStreams -> googleSheets "Читает профили, подборки, стримы, работодателей; пишет заявки и статусы" "HTTPS, Sheets API v4"
    talentStreams -> sendPulse "Добавляет подтверждённых работодателей; создаёт кампании" "HTTPS, REST API"

    # ── Отношения: контейнерный уровень ──────────────────────────────────────

    employer -> talentStreams.webApp "HTTPS"
    candidate -> talentStreams.webApp "HTTPS"
    editor -> talentStreams.webApp "HTTPS (/editor)"
    talentStreams.webApp -> googleSheets "Sheets API v4 / Service Account JWT" "HTTPS"
    talentStreams.webApp -> sendPulse "OAuth 2.0 + REST API" "HTTPS"

    # ── Отношения: компонентный уровень ──────────────────────────────────────

    talentStreams.webApp.homePage -> talentStreams.webApp.employerModal "Рендерит"
    talentStreams.webApp.homePage -> talentStreams.webApp.candidateModal "Рендерит"
    talentStreams.webApp.profilePage -> talentStreams.webApp.profileView "Рендерит"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит (по одной на карточку)"
    talentStreams.webApp.editorPage -> talentStreams.webApp.publishButton "Рендерит (по одной на выпуск)"
    talentStreams.webApp.editorPage -> talentStreams.webApp.employerSection "Рендерит"

    talentStreams.webApp.homePage -> talentStreams.webApp.sheetsLib "getStreams()"
    talentStreams.webApp.profilePage -> talentStreams.webApp.sheetsLib "getProfile(id)"
    talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
    talentStreams.webApp.editorPage -> talentStreams.webApp.sheetsLib "getMailingLists(), getEmployers()"
    talentStreams.webApp.editorPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount() — проверка пустой книги"

    talentStreams.webApp.employerModal -> talentStreams.webApp.serverActions "registerEmployer(EmployerData)"
    talentStreams.webApp.candidateModal -> talentStreams.webApp.serverActions "registerCandidate(CandidateData)"
    talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
    talentStreams.webApp.employerSection -> talentStreams.webApp.serverActions "confirmEmployer() / rejectEmployer()"

    talentStreams.webApp.publishApi -> talentStreams.webApp.serverActions "publishMailingList(listId)"

    talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "appendEmployerRow(), appendCandidateRow(), getMailingList(), updateEmployerStatus()"
    talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "addToSendPulse() / createCampaign()"

    editor -> talentStreams.webApp.editorPage "Просматривает выпуски, подтверждает работодателей, запускает рассылку"
    editor -> talentStreams.webApp.publishApi "curl /api/publish/{listId}?token=…"

    talentStreams.webApp.sheetsLib -> googleSheets "fetchSheetValues(), appendRow(), values.update()" "HTTPS, Sheets API v4"
    talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token, GET /addressbooks, POST /addressbooks/{id}/emails, POST /campaigns" "HTTPS"
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

    dynamic talentStreams.webApp "MailingListView" "Сценарий просмотра анонимной подборки" {
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000"
      talentStreams.webApp.sheetsLib -> googleSheets "GET профили основного листа"
      talentStreams.webApp.mailingListPage -> talentStreams.webApp.contactButton "Рендерит кнопку под каждой анонимной карточкой"
      autolayout lr
    }

    dynamic talentStreams.webApp "PublishMailingList" "Сценарий публикации выпуска редактором" {
      talentStreams.webApp.editorPage -> talentStreams.webApp.sheetsLib "getMailingLists(), getEmployers()"
      talentStreams.webApp.sheetsLib -> googleSheets "GET 'Mailing lists'!A1:Z1000, GET 'Employers'!A1:J1000"
      talentStreams.webApp.editorPage -> talentStreams.webApp.sendPulseLib "getBookEmailCount(stream)"
      talentStreams.webApp.sendPulseLib -> sendPulse "GET /addressbooks?limit=500"
      talentStreams.webApp.publishButton -> talentStreams.webApp.serverActions "publishMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sheetsLib "getMailingList(listId)"
      talentStreams.webApp.serverActions -> talentStreams.webApp.sendPulseLib "createCampaign(bookId, subject, html)"
      talentStreams.webApp.sendPulseLib -> sendPulse "POST /oauth/access_token → POST /campaigns"
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
