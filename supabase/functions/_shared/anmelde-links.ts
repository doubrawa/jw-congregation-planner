// =============================================================================
// Geteilt: Anmelde-Links ausstellen (T121, Phase 8)
// =============================================================================
// Eine Zeile je Person in `anmelde_links` (siehe `schema.sql`). Zwei Wege
// schreiben sie, beide mit `linkAusstellen` — neuer Link, neuer Code, der alte
// Zettel gilt nicht mehr: Der Admin stellt aus (`send-invite`), oder jemand
// lässt sich auf der Anmeldeseite einen neuen Link schicken (`anmelden`). Seit
// T121 Phase 10 trägt die Mail den Code, und den gibt es nur beim Ausstellen
// im Klartext; bis dahin erneuerte die Anmeldeseite nur das Token.
// =============================================================================

import { gueltigBis, neuerCode, neuesToken, pruefsumme } from './anmeldung.ts'
import { type Rest, wert } from './rest.ts'

/** Was die App von einem Link sehen darf — ohne Prüfsummen. */
export interface LinkZeile {
  person_id: string
  congregation_id: string
  gueltig_bis: string
  gesendet_at: string | null
  benutzt_at: string | null
}

export const LINK_SPALTEN = 'person_id,congregation_id,gueltig_bis,gesendet_at,benutzt_at'

/** Ein frisch ausgestellter Link: Token und Code im Klartext — nur dieses eine Mal. */
export interface NeuerLink {
  token: string
  code: string
  gueltigBis: string
}

/**
 * Einen neuen Link für eine Person ausstellen. Ersetzt den alten ganz: Token,
 * Code, Gültigkeit. `null`, wenn die Datenbank ablehnt.
 *
 * Verlangt vom Klienten nur `upsert` — so stellt auch der Notzugang
 * (`scripts/zugang-ausstellen.mjs`) mit seinem Node-Klienten aus.
 */
export async function linkAusstellen(
  rest: Pick<Rest, 'upsert'>,
  personId: string,
  congregationId: string,
  jetzt = new Date(),
): Promise<NeuerLink | null> {
  const token = neuesToken()
  const code = neuerCode()
  const bis = gueltigBis(jetzt)
  const ok = await rest.upsert('anmelde_links?on_conflict=person_id', [
    {
      person_id: personId,
      congregation_id: congregationId,
      token_hash: await pruefsumme(token),
      code_hash: await pruefsumme(code),
      gueltig_bis: bis,
      erstellt_at: jetzt.toISOString(),
      gesendet_at: null,
      benutzt_at: null,
    },
  ])
  return ok ? { token, code, gueltigBis: bis } : null
}

/** Vermerken, dass der Link eben per E-Mail hinausging. */
export async function alsGesendet(rest: Pick<Rest, 'send'>, personId: string, jetzt = new Date()): Promise<void> {
  await rest.send('PATCH', `anmelde_links?person_id=eq.${wert(personId)}`, { gesendet_at: jetzt.toISOString() })
}
