import type { Locale } from "@/components/language-provider"

type EmployerFormDict = {
  triggerButton: string
  modalTitle: string
  close: string
  success: { title: string; text: string; close: string; telegramText: string; telegramButton: string }
  fields: {
    name: { label: string; placeholder: string }
    company: { label: string; placeholder: string }
    email: { label: string; placeholder: string }
    phone: { label: string; placeholder: string }
    contactMethod: { label: string }
    telegram: { label: string; placeholder: string }
    linkedin: { label: string; placeholder: string }
    streams: {
      label: string
      chooseRange: (max: number) => string
      maxSelected: (max: number) => string
      notConfigured: string
    }
    country: { label: string; hint: string; placeholder: string }
    additionalCountries: {
      label: string
      any: string
      anySelectedHint: string
      countHint: (n: number) => string
      defaultHint: string
    }
  }
  consent: string
  submitting: string
  submit: string
  errors: { submitFailed: string }
}

const ru: EmployerFormDict = {
  triggerButton: "Подписаться на рассылку",
  modalTitle: "Подписаться на рассылку",
  close: "Закрыть",
  success: {
    title: "Заявка отправлена",
    text: "Мы свяжемся с вами удобным способом в ближайшее время.",
    close: "Закрыть",
    telegramText: "Получайте подборки и уведомления в Telegram — подключите нашего бота.",
    telegramButton: "Подключить Telegram",
  },
  fields: {
    name: { label: "Имя", placeholder: "Иван Иванов" },
    company: { label: "Компания", placeholder: "ООО Пример" },
    email: { label: "Email", placeholder: "you@company.com" },
    phone: { label: "Телефон", placeholder: "+_ ___ ___ ____" },
    contactMethod: { label: "Предпочтительный способ связи" },
    telegram: { label: "Telegram", placeholder: "username" },
    linkedin: { label: "LinkedIn", placeholder: "username" },
    streams: {
      label: "Стримы для рассылки",
      chooseRange: (max) => `Выберите от 1 до ${max}`,
      maxSelected: (max) => `Выбрано максимум (${max})`,
      notConfigured: "Стримы не настроены",
    },
    country: {
      label: "Страна нахождения",
      hint: "Страна, в которой работает ваша компания",
      placeholder: "— выберите —",
    },
    additionalCountries: {
      label: "Дополнительные страны",
      any: "Любая",
      anySelectedHint: "Рассматриваете кандидатов из любой страны",
      countHint: (n) => `Выбрано: ${n}`,
      defaultHint: "Необязательно — если рассматриваете кандидатов из нескольких стран",
    },
  },
  consent: "Я подтверждаю согласие на обработку персональных данных и получение информационных сообщений сервиса.",
  submitting: "Отправка…",
  submit: "Отправить заявку",
  errors: { submitFailed: "Не удалось отправить заявку. Попробуйте позже." },
}

const en: EmployerFormDict = {
  triggerButton: "Subscribe to updates",
  modalTitle: "Subscribe to updates",
  close: "Close",
  success: {
    title: "Application submitted",
    text: "We'll reach out via your preferred method soon.",
    close: "Close",
    telegramText: "Get candidate digests and updates in Telegram — connect our bot.",
    telegramButton: "Connect Telegram",
  },
  fields: {
    name: { label: "Name", placeholder: "John Smith" },
    company: { label: "Company", placeholder: "Acme Inc." },
    email: { label: "Email", placeholder: "you@company.com" },
    phone: { label: "Phone", placeholder: "+_ ___ ___ ____" },
    contactMethod: { label: "Preferred contact method" },
    telegram: { label: "Telegram", placeholder: "username" },
    linkedin: { label: "LinkedIn", placeholder: "username" },
    streams: {
      label: "Streams to subscribe to",
      chooseRange: (max) => `Choose 1 to ${max}`,
      maxSelected: (max) => `Maximum selected (${max})`,
      notConfigured: "No streams configured",
    },
    country: {
      label: "Country",
      hint: "The country your company operates in",
      placeholder: "— select —",
    },
    additionalCountries: {
      label: "Additional countries",
      any: "Any",
      anySelectedHint: "Considering candidates from any country",
      countHint: (n) => `Selected: ${n}`,
      defaultHint: "Optional — if you consider candidates from multiple countries",
    },
  },
  consent: "I consent to the processing of my personal data and to receiving informational messages from the service.",
  submitting: "Submitting…",
  submit: "Submit application",
  errors: { submitFailed: "Couldn't submit the application. Please try again later." },
}

export const employerFormDict: Record<Locale, EmployerFormDict> = { ru, en }
