import "server-only"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"

/** Shared minimal wrapper for every transactional email the app sends (candidate consent-request/
 * digest, employer release follow-ups) — dark header with the "Talent/Streams" text wordmark
 * (same treatment as docs/welcome-email-template.html; no separate logo image file exists in
 * this project), a white card for the body, a bare footer. No CTA buttons, no colored badges —
 * these letters are meant to read like a short personal note, not a marketing email (decided
 * with the user). */
export function buildEmailHtml(bodyHtml: string): string {
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
  return buildEmailHtml(body)
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
  return buildEmailHtml(body)
}

/** Follow-up to an employer who opened a release's email but never submitted a contact request
 * for any candidate — sent by runReleaseFollowUps() (app/actions.ts). Static text, no merge
 * tags/interpolation — exact copy given by the user, same for every recipient. */
export function buildFollowUpFeedbackEmailHtml(): string {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">Уважаемый коллега, добрый день!</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">Спасибо, что пользуетесь TalentStreams.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Мы надеемся, что наши подборки кандидатов вам полезны. Но нам важно, чтобы они не просто приходили, а действительно работали на задачи вашего бизнеса.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Поэтому, если кандидаты в рассылке не совсем те, кого вы ищете, пожалуйста, расскажите нам об этом в ответном письме. Уточните ваш запрос: возможно, вам нужен другой опыт, знание определённых языков или иные специализации. Мы учтём это в следующих подборках.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Так же важно для нас и ваше мнение о самом сервисе. Если что-то в нём кажется неудобным или чего-то не хватает — напишите, и мы постараемся это улучшить.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.65">
      Будем рады вашей обратной связи!<br>С уважением,<br>команда TalentStreams
    </p>
  `
  return buildEmailHtml(body)
}

/** Follow-up to an employer who never opened a release's email at all (per SendPulse's
 * per-recipient campaign open status) — sent by runReleaseFollowUps() (app/actions.ts).
 * Personalized per employer/release: name, stream name, and the same personal link
 * (`/list/[listId]?e=token`) the original campaign already used for both "view it" and
 * "leave a request" — the subscription page serves both purposes on one page, there's no
 * second, different link to point to. */
export function buildFollowUpReminderEmailHtml(params: { employerName: string; streamName: string; listUrl: string }): string {
  const name = escapeHtml(params.employerName)
  const stream = escapeHtml(params.streamName)
  const url = escapeHtml(params.listUrl)
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">${name}, добрый день!</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">Спасибо, что пользуетесь TalentStreams!</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      На этой неделе мы отправили вам новую подборку кандидатов по стриму <strong>${stream}</strong>. Возможно, письмо затерялось среди других, поэтому напоминаем о нём: <a href="${url}" style="color:#2563eb">${url}</a>.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      В подборке — руководители и специалисты, с которыми мы уже пообщались и проверили их опыт. Если кто-то из кандидатов вас заинтересует, оставьте заявку на сайте: <a href="${url}" style="color:#2563eb">${url}</a>. Мы уточним у кандидата готовность к диалогу и передадим вам его резюме с контактами.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65">
      Если ваш запрос изменился или поиск по этому направлению сейчас неактуален, напишите нам — мы скорректируем подборки под задачи вашего бизнеса.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.65">
      С уважением,<br>команда TalentStreams
    </p>
  `
  return buildEmailHtml(body)
}
