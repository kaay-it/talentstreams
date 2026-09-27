import type { Locale } from "@/components/language-provider"

type CandidateFormDict = {
  triggerButton: string
  modalTitle: string
  close: string
  success: { title: string; text: string; close: string }
  fields: {
    name: { label: string; placeholder: string }
    email: { label: string }
    phone: { label: string }
    resume: {
      label: string
      uploadTab: string
      linkTab: string
      filePlaceholder: string
      urlPlaceholder: string
    }
    coverLetter: { label: string; placeholder: string }
  }
  consent: string
  submitting: string
  submit: string
  errors: { uploadFailed: string; submitFailed: string }
}

const ru: CandidateFormDict = {
  triggerButton: "Стать кандидатом",
  modalTitle: "Стать кандидатом",
  close: "Закрыть",
  success: {
    title: "Заявка отправлена",
    text: "Мы рассмотрим вашу заявку и свяжемся с вами в ближайшее время.",
    close: "Закрыть",
  },
  fields: {
    name: { label: "Имя", placeholder: "Иван Иванов" },
    email: { label: "Email" },
    phone: { label: "Телефон" },
    resume: {
      label: "Резюме",
      uploadTab: "Загрузить файл",
      linkTab: "Указать ссылку",
      filePlaceholder: "PDF, DOC, DOCX, RTF, ODT · до 5 МБ",
      urlPlaceholder: "https://...",
    },
    coverLetter: {
      label: "Сопроводительное письмо",
      placeholder: "Расскажите о себе, своём опыте и чем вы можете быть полезны...",
    },
  },
  consent:
    "Я подтверждаю согласие на обработку персональных данных и рассмотрение моей кандидатуры для публикации в рассылках сервиса.",
  submitting: "Отправка…",
  submit: "Отправить заявку",
  errors: {
    uploadFailed: "Ошибка загрузки файла",
    submitFailed: "Не удалось отправить заявку. Попробуйте позже.",
  },
}

const en: CandidateFormDict = {
  triggerButton: "Become a candidate",
  modalTitle: "Become a candidate",
  close: "Close",
  success: {
    title: "Application submitted",
    text: "We'll review your application and get back to you soon.",
    close: "Close",
  },
  fields: {
    name: { label: "Name", placeholder: "John Smith" },
    email: { label: "Email" },
    phone: { label: "Phone" },
    resume: {
      label: "Resume",
      uploadTab: "Upload file",
      linkTab: "Provide a link",
      filePlaceholder: "PDF, DOC, DOCX, RTF, ODT · up to 5 MB",
      urlPlaceholder: "https://...",
    },
    coverLetter: {
      label: "Cover letter",
      placeholder: "Tell us about yourself, your experience, and how you can help...",
    },
  },
  consent:
    "I consent to the processing of my personal data and to my candidacy being considered for publication in the service's mailings.",
  submitting: "Submitting…",
  submit: "Submit application",
  errors: {
    uploadFailed: "File upload failed",
    submitFailed: "Couldn't submit the application. Please try again later.",
  },
}

export const candidateFormDict: Record<Locale, CandidateFormDict> = { ru, en }
