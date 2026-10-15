/**
 * **Anmelde-Links ausstellen** (T121, Phase 8) — die App-Seite der Function
 * `send-invite`: je Person ein neuer Link, der den alten samt Zettel sofort
 * ersetzt, und mit `senden` die E-Mail dazu.
 *
 * Kann der Server nicht senden (kein `INVITE_FROM`), stellt er auf `senden`
 * hin **nichts** aus und sagt es (`mailBereit: false`): Sonst ersetzten neue
 * Links die alten, und keiner käme an. Für den Zettel und das eigene
 * Mail-Programm fragt der Aufrufer dann mit `senden: false`.
 */

import type { AnmeldeLink } from '../data/types'
import { supabase } from './supabase'

/** Ein eben ausgestellter Link — Link und Code im Klartext gibt es nur dieses eine Mal. */
export interface AusgestellterLink {
  personId: string
  /** Der Link für die E-Mail (`#anmelden=`). */
  url: string
  /** Der Link im QR-Code des Zettels (`#code=`). */
  zettelUrl: string
  /** Der Code zum Eintippen, gegliedert wie auf dem Zettel („K7RD-2QWM"). */
  code: string
  gueltigBis: string
  /** Ging die E-Mail hinaus? */
  gesendet: boolean
}

export interface Ausgestellt {
  links: AusgestellterLink[]
  /** Kann der Server E-Mails senden? */
  mailBereit: boolean
  /** Ging ein Aufruf schief, fehlen Links — die bis dahin ausgestellten stehen trotzdem in `links`. */
  fehler: boolean
}

/**
 * So viele Personen je Aufruf. Der Server legt zwischen zwei E-Mails eine
 * halbe Sekunde ein (Resend nimmt je Sekunde nur wenige an); bei hundert
 * Personen in einem Aufruf liefe die Function an ihre Zeitgrenze.
 */
const JE_AUFRUF = 40

/**
 * Links ausstellen und, mit `senden`, per E-Mail verschicken. `lang` ist der
 * App-Sprachcode der **Versammlung** — die Empfänger haben noch keine Sprache
 * gewählt.
 */
export async function linksAusstellen(personIds: readonly string[], { senden, lang }: { senden: boolean; lang: string }): Promise<Ausgestellt> {
  const ergebnis: Ausgestellt = { links: [], mailBereit: false, fehler: !supabase }
  if (!supabase) return ergebnis
  for (let i = 0; i < personIds.length; i += JE_AUFRUF) {
    const { data, error } = await supabase.functions.invoke('send-invite', {
      body: { personIds: personIds.slice(i, i + JE_AUFRUF), senden, lang },
    })
    const antwort = data as { links?: AusgestellterLink[]; mailBereit?: boolean } | null
    if (error || !Array.isArray(antwort?.links)) {
      console.error('[send-invite]', error?.message ?? 'Antwort ohne Links')
      return { ...ergebnis, fehler: true }
    }
    ergebnis.links.push(...antwort.links)
    ergebnis.mailBereit = antwort.mailBereit === true
    // Ohne Versand stellt der Server auf `senden` hin nichts aus — auch den
    // übrigen nicht.
    if (senden && !ergebnis.mailBereit) break
  }
  return ergebnis
}

/** Was der Zustand von einem eben ausgestellten Link weiß — so, wie es jetzt in der Datenbank steht. */
export function alsAnmeldeLink(link: AusgestellterLink, jetzt: Date): AnmeldeLink {
  const zeit = jetzt.toISOString()
  return { personId: link.personId, gueltigBis: link.gueltigBis, erstelltAt: zeit, gesendetAt: link.gesendet ? zeit : null, benutztAt: null }
}
