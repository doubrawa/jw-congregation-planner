import { fuellen } from '../../supabase/functions/_shared/texte.ts'
import { gebundenesDatum } from '../components/datum-anzeige'
import type { Lang, Person } from '../data/types'
import { dict, loadOverlay } from '../i18n/ui'
import type { AusgestellterLink } from '../lib/links-ausstellen'

/**
 * **Mit welchem Namen die Nachricht grüßt:** mit dem Vornamen, sonst mit dem
 * Nachnamen — eine Person braucht nur einen der beiden. Bis zum 24.10.2026
 * stand ohne Vornamen „Hallo ," da (Review).
 */
export function anrede({ fn, ln }: Pick<Person, 'fn' | 'ln'>): string {
  return fn.trim() || ln.trim()
}

/** Link und Code als Nachricht: der Titel (für das Teilen des Geräts) und der Text. */
export interface LinkNachricht {
  titel: string
  text: string
}

/**
 * **Was die Nachricht nachlädt:** das Wörterbuch der Versammlung. Die Blätter
 * rufen es **vor** dem Ausstellen auf: Fehlt nach einem Deploy der alte Teil
 * der App, scheitert es hier — und noch ist kein Link ersetzt (Review
 * 24.10.2026).
 */
export function linkTexteLaden(lang: Lang): Promise<unknown> {
  return loadOverlay(lang)
}

/**
 * **Link und Code als Nachricht** — für WhatsApp, Signal oder SMS über
 * „Teilen" oder „Kopieren" (24.10.2026; seit dem 31.10.2026 der einzige Weg
 * neben dem Zettel, E-Mails schickt die App keine mehr). In der Sprache der
 * Versammlung, ihr Wörterbuch wird dafür nachgeladen. `fuellen` setzt nur ein,
 * ohne Zahlen zu binden: Der Code muss sich so kopieren lassen, wie er dasteht.
 * Gebunden ist nur das Datum, wie überall in der App — im Chat bricht es so
 * ebenso wenig zwischen Tag und Monat.
 */
export async function linkNachricht(
  person: Pick<Person, 'fn' | 'ln'>,
  link: AusgestellterLink,
  { lang, versammlung }: { lang: Lang; versammlung: string },
): Promise<LinkNachricht> {
  await linkTexteLaden(lang)
  const d = dict(lang)
  const werte = {
    name: anrede(person),
    versammlung,
    url: link.url,
    code: link.code,
    datum: gebundenesDatum(new Date(link.gueltigBis), lang, 'tagMonatJahr'),
  }
  return { titel: fuellen(d.linkNachrichtTitel, werte), text: `${fuellen(d.linkNachrichtText, werte)}\n` }
}
