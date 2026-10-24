import type { LinkMailWerte } from '../../supabase/functions/_shared/anmelde-mail.ts'
import { fuellen } from '../../supabase/functions/_shared/texte.ts'
import type { Lang, Person } from '../data/types'
import { dict, loadOverlay } from '../i18n/ui'
import type { AusgestellterLink } from '../lib/links-ausstellen'

/** Was E-Mail und Nachricht einsetzen: wen sie grüßen, Link und Code, bis wann sie gelten. */
function mailWerte(person: Pick<Person, 'fn' | 'ln'>, link: AusgestellterLink, versammlung: string): LinkMailWerte {
  return { person, versammlung, url: link.url, code: link.code, gueltigBis: link.gueltigBis }
}

/**
 * **Die E-Mail mit dem Link als Entwurf im eigenen Mail-Programm**
 * (`mailto:`) — solange die App selbst keine senden kann (kein `INVITE_FROM`).
 * Derselbe Text wie vom Server (`linkMail`), in der Sprache der Versammlung;
 * nachgeladen, weil er alle Sprachen der E-Mail mitbringt.
 */
export async function linkMailEntwurf(
  person: Pick<Person, 'fn' | 'ln' | 'mail'>,
  link: AusgestellterLink,
  { lang, versammlung }: { lang: string; versammlung: string },
): Promise<string> {
  const { linkMail } = await import('../../supabase/functions/_shared/anmelde-mail.ts')
  const mail = linkMail(lang, mailWerte(person, link, versammlung))
  // Auch die Adresse kodieren, nicht nur Betreff und Text: Ein `?` oder `&`
  // darin hängt sonst eigene Kopfzeilen an den Entwurf — `a@b.de?bcc=…` setzt
  // beim Öffnen eine stille Kopie. Die Adresse ist ein Feld, das ein anderer
  // gepflegt haben kann; sie ist damit genauso wenig „unser Text" wie der Rest.
  // Das `@` bleibt stehen: Es gehört laut RFC 6068 unkodiert in die Adresse,
  // und `%40` verwirrt manche Mail-Programme.
  const an = encodeURIComponent(person.mail.trim()).replace(/%40/g, '@')
  return `mailto:${an}?subject=${encodeURIComponent(mail.betreff)}&body=${encodeURIComponent(mail.text)}`
}

/** Link und Code als Nachricht: der Betreff der E-Mail (für das Teilen des Geräts) und der Text. */
export interface LinkNachricht {
  titel: string
  text: string
}

/**
 * **Was E-Mail-Entwurf und Nachricht nachladen**: die E-Mail mit allen
 * Sprachen und das Wörterbuch der Versammlung. Das Blatt „Link senden" ruft es
 * **vor** dem Ausstellen auf: Fehlt nach einem Deploy der alte Teil der App,
 * scheitert es hier — und noch ist kein Link ersetzt (Review 24.10.2026).
 */
export function linkTexteLaden(lang: Lang) {
  return Promise.all([import('../../supabase/functions/_shared/anmelde-mail.ts'), loadOverlay(lang)])
}

const ABSATZ = '\n\n'
/**
 * Die letzten Absätze der E-Mail, die nur zu ihr gehören: wie lange Link und
 * Code gelten — mit „tippe auf ‚Link senden'" — und „Du bekommst diese E-Mail,
 * weil …". In der Nachricht steht statt ihrer `linkNachrichtSchluss`.
 */
const NUR_IN_DER_MAIL = 2

/**
 * **Link und Code als Nachricht** — für WhatsApp, Signal oder SMS über
 * „Teilen" (24.10.2026). Die Absätze der E-Mail ohne die, die nur zu ihr
 * gehören: Wer keine Adresse hat, bekommt einen abgelaufenen Link von den
 * Ältesten wieder, nicht über „Link senden" (`linkNachrichtSchluss`). In der
 * Sprache der Versammlung wie die E-Mail — ihr Wörterbuch wird dafür
 * nachgeladen, parallel zum Datum, wie beim Zettel: Safari lässt das Teilen nur
 * kurz nach dem Tipp zu. `fuellen` setzt nur ein, ohne Zahlen zu binden: Der
 * Code muss sich so kopieren lassen, wie er dasteht.
 */
export async function linkNachricht(
  person: Pick<Person, 'fn' | 'ln'>,
  link: AusgestellterLink,
  { lang, versammlung }: { lang: Lang; versammlung: string },
): Promise<LinkNachricht> {
  const [{ linkMailEinsetzen }] = await linkTexteLaden(lang)
  const d = dict(lang)
  const werte = linkMailEinsetzen(lang, mailWerte(person, link, versammlung))
  const absaetze = [...d.linkMailText.split(ABSATZ).slice(0, -NUR_IN_DER_MAIL), d.linkNachrichtSchluss]
  return { titel: fuellen(d.linkMailBetreff, werte), text: `${fuellen(absaetze.join(ABSATZ), werte)}\n` }
}
