import type { Locale } from "@/components/language-provider"

type HomeDict = {
  hero: {
    title: string
    subtitle: string
    pills: { weekly: string; verified: string; consent: string }
  }
  logic: {
    eyebrow: string
    title: string
    description: string
    features: { title: string; text: string }[]
  }
  sources: {
    eyebrow: string
    title: string
    description: string
    items: string[]
    checklistTitle: string
    checklist: string[]
  }
  howItWorks: {
    eyebrow: string
    title: string
    description: string
    steps: { title: string; text: string }[]
  }
  setup: {
    title: string
    description: string
    columnsLabel: string
    recommendedColumnsLabel: string
  }
}

const ru: HomeDict = {
  hero: {
    title: "Проверенные кандидаты для работодателей Центральной Азии",
    subtitle:
      "Еженедельные подборки релевантных специалистов — с предварительной проверкой опыта и уважением к приватности каждого кандидата.",
    pills: {
      weekly: "Еженедельные подборки",
      verified: "Ручная верификация",
      consent: "Контакты по согласию",
    },
  },
  logic: {
    eyebrow: "Общая логика сервиса",
    title: "Качественный talent pipeline без спама и холодных контактов",
    description: "Сервис предоставляет работодателям Центральной Азии еженедельные подборки проверенных кандидатов.",
    features: [
      {
        title: "Кураторский отбор",
        text: "Кандидаты собираются вручную из открытых источников, профессиональных сетей, рекомендаций и входящих заявок.",
      },
      {
        title: "Предварительная проверка",
        text: "Каждый кандидат проходит верификацию опыта и готовности рассматривать предложения до попадания в подборку.",
      },
      {
        title: "Приватность по умолчанию",
        text: "Работодатель видит только анонимизированное summary — контакты передаются после явного согласия кандидата.",
      },
    ],
  },
  sources: {
    eyebrow: "Источники",
    title: "Откуда берутся кандидаты",
    description:
      "Мы не парсим базы ради количества. Каждый профиль добавляется осознанно — из проверенных каналов, где специалисты реально открыты к диалогу.",
    items: [
      "Открытые источники и публичные профили",
      "Профессиональные сети и сообщества",
      "Рекомендации от партнёров и клиентов",
      "Входящие заявки от самих кандидатов",
    ],
    checklistTitle: "Что проверяем до публикации",
    checklist: [
      "Подтверждение релевантного опыта",
      "Проверка соответствия заявленного опыта",
      "Готовность рассматривать предложения или быть открытым к диалогу",
    ],
  },
  howItWorks: {
    eyebrow: "Как это работает",
    title: "Связь только по взаимному интересу",
    description:
      "Работодатель не получает прямой доступ к контактам кандидата. Контакты передаются только после того, как кандидат подтвердил интерес к конкретной компании.",
    steps: [
      {
        title: "Анонимизированное summary",
        text: "Работодатель видит обезличенный профиль кандидата: опыт, навыки и контекст — без имён и контактов.",
      },
      {
        title: "«Хочу связаться»",
        text: "Если профиль заинтересовал, работодатель отправляет запрос на контакт через сервис.",
      },
      {
        title: "Контакты по согласию",
        text: "Кандидат рассматривает предложение и только после подтверждения интереса получает работодатель доступ к контактам.",
      },
    ],
  },
  setup: {
    title: "Подключите Google Sheets, чтобы начать",
    description: "Добавьте переменные окружения в проект, затем создайте таблицу с заголовками в первой строке.",
    columnsLabel: "Рекомендуемые колонки:",
    recommendedColumnsLabel: "id, name, title, email, phone, stream",
  },
}

const en: HomeDict = {
  hero: {
    title: "Vetted candidates for employers in Central Asia",
    subtitle:
      "Weekly shortlists of relevant specialists — with upfront experience verification and respect for every candidate's privacy.",
    pills: {
      weekly: "Weekly shortlists",
      verified: "Manual verification",
      consent: "Contacts by consent",
    },
  },
  logic: {
    eyebrow: "How the service works",
    title: "A quality talent pipeline without spam or cold outreach",
    description: "The service gives employers in Central Asia weekly shortlists of vetted candidates.",
    features: [
      {
        title: "Curated sourcing",
        text: "Candidates are hand-picked from open sources, professional networks, referrals, and inbound applications.",
      },
      {
        title: "Upfront verification",
        text: "Every candidate's experience and openness to offers is verified before they're added to a shortlist.",
      },
      {
        title: "Privacy by default",
        text: "Employers see only an anonymized summary — contacts are shared only after the candidate's explicit consent.",
      },
    ],
  },
  sources: {
    eyebrow: "Sources",
    title: "Where candidates come from",
    description:
      "We don't scrape databases for volume. Every profile is added deliberately — from vetted channels where specialists are genuinely open to a conversation.",
    items: [
      "Open sources and public profiles",
      "Professional networks and communities",
      "Referrals from partners and clients",
      "Inbound applications from candidates themselves",
    ],
    checklistTitle: "What we verify before publishing",
    checklist: [
      "Confirmation of relevant experience",
      "Verification that claimed experience matches reality",
      "Willingness to consider offers or stay open to a conversation",
    ],
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "Contact only on mutual interest",
    description:
      "Employers don't get direct access to candidate contacts. Contacts are shared only after the candidate confirms interest in a specific company.",
    steps: [
      {
        title: "Anonymized summary",
        text: "The employer sees a de-identified candidate profile: experience, skills, and context — no names or contacts.",
      },
      {
        title: '"I want to connect"',
        text: "If a profile looks interesting, the employer sends a contact request through the service.",
      },
      {
        title: "Contacts by consent",
        text: "The candidate reviews the offer, and only after confirming interest does the employer get access to their contacts.",
      },
    ],
  },
  setup: {
    title: "Connect Google Sheets to get started",
    description: "Add the environment variables to the project, then create a spreadsheet with headers in the first row.",
    columnsLabel: "Recommended columns:",
    recommendedColumnsLabel: "id, name, title, email, phone, stream",
  },
}

export const homeDict: Record<Locale, HomeDict> = { ru, en }
