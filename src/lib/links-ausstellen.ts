/**
 * **Anmelde-Links ausstellen** (T121, Phase 8) — die App-Seite der Function
 * `send-invite`: je Person ein neuer Link, der den alten samt Zettel sofort
 * ersetzt. Hinaus geht er als Nachricht oder auf dem Zettel; E-Mails schickt
 * die App seit dem 31.10.2026 keine mehr.
 */

import type { AnmeldeLink } from '../data/types'
import { supabase } from './supabase'

/** Ein eben ausgestellter Link — Link und Code im Klartext gibt es nur dieses eine Mal. */
export interface AusgestellterLink {
  personId: string
  /** Der Link für die Nachricht (`#anmelden=`). */
  url: string
  /** Der Link im QR-Code des Zettels (`#code=`). */
  zettelUrl: string
  /** Der Code zum Eintippen, gegliedert wie auf dem Zettel („K7RD-2QWM"). */
  code: string
  gueltigBis: string
}

export interface Ausgestellt {
  links: AusgestellterLink[]
  /** Ging ein Aufruf schief, fehlen Links — die bis dahin ausgestellten stehen trotzdem in `links`. */
  fehler: boolean
}

/** So viele Personen je Aufruf — die Function nimmt höchstens 200 und speichert sie in einem Schreiben. */
const JE_AUFRUF = 100

/** Links ausstellen. */
export async function linksAusstellen(personIds: readonly string[]): Promise<Ausgestellt> {
  const ergebnis: Ausgestellt = { links: [], fehler: !supabase }
  if (!supabase) return ergebnis
  for (let i = 0; i < personIds.length; i += JE_AUFRUF) {
    const { data, error } = await supabase.functions.invoke('send-invite', {
      body: { personIds: personIds.slice(i, i + JE_AUFRUF) },
    })
    const antwort = data as { links?: AusgestellterLink[] } | null
    if (error || !Array.isArray(antwort?.links)) {
      console.error('[send-invite]', error?.message ?? 'Antwort ohne Links')
      return { ...ergebnis, fehler: true }
    }
    ergebnis.links.push(...antwort.links)
  }
  return ergebnis
}

/** Was der Zustand von einem eben ausgestellten Link weiß — so, wie es jetzt in der Datenbank steht. */
export function alsAnmeldeLink(link: AusgestellterLink, jetzt: Date): AnmeldeLink {
  return { personId: link.personId, gueltigBis: link.gueltigBis, erstelltAt: jetzt.toISOString(), gesendetAt: null, benutztAt: null }
}
