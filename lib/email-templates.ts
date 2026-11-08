import "server-only"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"

/** Shared minimal wrapper for every candidate-facing email (consent-request, monthly digest) —
 * dark header with the "Talent/Streams" text wordmark (same treatment as
 * docs/welcome-email-template.html; no separate logo image file exists in this project), a white
 * card for the body, a bare footer. No CTA buttons, no colored badges — these letters are meant
 * to read like a short personal note, not a marketing email (decided with the user). */
export function buildCandidateEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>TalentStreams</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

  <tr>
    <td style="background:#0f1f3d;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;font-family:${FONT}">Talent<span style="color:#60a5fa">Streams</span></p>
    </td>
  </tr>

  <tr>
    <td style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px;font-family:${FONT}">
      ${bodyHtml}
    </td>
  </tr>

  <tr>
    <td style="padding:16px 8px 0;text-align:center">
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:${FONT}">TalentStreams — проверенные кандидаты для компаний Центральной Азии</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/** Sent from submitContactRequest() (app/actions.ts) the moment an employer clicks "Хочу
 * связаться" — asks the candidate to reply (not click a button — tested, reply converts to
 * consent far better) to approve sharing their resume. Only the employer's company is ever
 * named here, never the employer themselves (name/email/phone) — a hard rule, not a style
 * choice, decided with the user. */
export function buildConsentRequestEmailHtml(company: string): string {
  const c = escapeHtml(company)
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">Добрый день!</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Команда TalentStreams с хорошими новостями — вашим резюме заинтересовался работодатель: <strong>${c}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      По правилам сервиса мы должны получить ваше согласие на передачу резюме работодателю. Если вы согласны — просто <strong>ответьте на это письмо</strong>, и мы передадим ваше резюме.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Дальше работодатель будет общаться с вами напрямую.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.65">
      С уважением,<br>команда TalentStreams
    </p>
  `
  return buildCandidateEmailHtml(body)
}

/** Monthly digest body — one static HTML sent as a single SendPulse campaign to every eligible
 * candidate at once, not per-recipient (see runCandidateDigest(), app/actions.ts). No argument:
 * `{{digest_count}}` is a literal SendPulse merge tag, not a JS template value — SendPulse fills
 * it in per-recipient from that contact's variable in the address book at send time. */
export function buildDigestEmailHtml(): string {
  const contactEmail = process.env.SENDPULSE_CANDIDATE_FROM_EMAIL || ""
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">Добрый день!</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">Спасибо, что остаётесь с TalentStreams.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Делимся итогами месяца: ваше резюме увидели <strong>{{digest_count}}</strong> работодателей в выбранных вами специальностях и отраслях.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Хотим ещё раз напомнить, как устроен сервис, чтобы вы были спокойны за свои данные. Работодатели видят только анонимное резюме — без вашего имени, контактов и последнего места работы. Если компания заинтересуется вашим профилем, мы сначала обратимся к вам. Контакты передаются только с вашего согласия, и дальше вы общаетесь с работодателем напрямую.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Если откликов пока меньше, чем хотелось бы, это не повод расстраиваться. Чаще всего ситуацию меняют две вещи: более сильное резюме с точным саммари и расширение списка отраслей, в которых вы готовы себя рассматривать.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Мы с радостью поможем и с тем, и с другим. Просто напишите нам на <a href="mailto:${contactEmail}" style="color:#2563eb">${contactEmail}</a>.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.65">Желаем вам интересных предложений!</p>
  `
  return buildCandidateEmailHtml(body)
}
