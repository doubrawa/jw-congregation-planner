import { fuellen } from '../../supabase/functions/_shared/texte.ts'
import type { Lang, Person } from '../data/types'
import { dict, loadOverlay } from '../i18n/ui'
import type { AusgestellterLink } from '../lib/links-ausstellen'

/**
 * **Die E-Mail mit dem Link als Entwurf im eigenen Mail-Programm**
 * (`mailto:`) — solange die App selbst keine senden kann (kein `INVITE_FROM`).
 * Derselbe Text wie vom Server (`linkMail`), in der Sprache der Versammlung;
 * nachgeladen, weil er alle Sprachen der E-Mail mitbringt.
 */
export async function linkMailEntwurf(
  person: Pick<Person, 'fn' | 'mail'>,
  link: AusgestellterLink,
  { lang, versammlung }: { lang: string; versammlung: string },
): Promise<string> {
  const { linkMail } = await import('../../supabase/functions/_shared/anmelde-mail.ts')
  const mail = linkMail(lang, { name: person.fn, versammlung, url: link.url, code: link.code, gueltigBis: link.gueltigBis })
  // Auch die Adresse kodieren, nicht nur Betreff und Text: Ein `?` oder `&`
  // darin hängt sonst eigene Kopfzeilen an den Entwurf — `a@b.de?bcc=…` setzt
  // beim Öffnen eine stille Kopie. Die Adresse ist ein Feld, das ein anderer
  // gepflegt haben kann; sie ist damit genauso wenig „unser Text" wie der Rest.
  // Das `@` bleibt stehen: Es gehört laut RFC 6068 unkodiert in die Adresse,
  // und `%40` verwirrt manche Mail-Programme.
  const an = encodeURIComponent(person.mail.trim()).replace(/%40/g, '@')
  return `mailto:${an}?subject=${encodeURIComponent(mail.betreff)}&body=${encodeURIComponent(mail.text)}`
}

/**
 * **Link und Code als Nachricht** — für WhatsApp, Signal oder SMS über
 * „Teilen" (24.10.2026). Derselbe Text wie die E-Mail ohne das, was nur zu ihr
 * gehört: Wer keine Adresse hat, bekommt einen abgelaufenen Link von den
 * Ältesten wieder, nicht über „Link senden" (`linkNachrichtText`). In der
 * Sprache der Versammlung wie die E-Mail — ihr Wörterbuch wird dafür
 * nachgeladen; `fuellen` setzt nur ein, ohne Zahlen zu binden: Der Code muss
 * sich so kopieren lassen, wie er dasteht.
 */
export async function linkNachricht(
  person: Pick<Person, 'fn'>,
  link: AusgestellterLink,
  { lang, versammlung }: { lang: Lang; versammlung: string },
): Promise<{ titel: string; text: string }> {
  await loadOverlay(lang)
  const d = dict(lang)
  const { linkDatum } = await import('../../supabase/functions/_shared/anmelde-mail.ts')
  const werte = { name: person.fn, versammlung, url: link.url, code: link.code, datum: linkDatum(link.gueltigBis, lang) }
  return { titel: fuellen(d.linkMailBetreff, werte), text: `${fuellen(d.linkNachrichtText, werte)}\n` }
}
