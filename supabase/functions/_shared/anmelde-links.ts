// =============================================================================
// Geteilt: Anmelde-Links ausstellen und erneuern (T121, Phase 8)
// =============================================================================
// Eine Zeile je Person in `anmelde_links` (siehe `schema.sql`). Zwei Wege
// schreiben sie: Der Admin stellt aus (`send-invite`) — neuer Link, neuer Code,
// der alte Zettel gilt nicht mehr. Und jemand lässt sich auf der Anmeldeseite
// einen neuen Link schicken (`anmelden`) — dann wird nur das Token erneuert:
// Der Zettel mit seinem Code bleibt gültig, sonst nähme jeder, der eine Adresse
// kennt, ihrem Besitzer den Zettel weg.
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

/**
 * Nur das Token erneuern — für die Selbstbedienung per E-Mail. Gilt der Link
 * noch, bleiben Code und Gültigkeit: Der Zettel gilt weiter, sonst nähme jeder,
 * der eine Adresse kennt, ihrem Besitzer den Zettel weg.
 *
 * Ist er abgelaufen, gilt der neue wieder dreißig Tage — mit einem **neuen
 * Code**, den niemand kennt. Bis zum 15.10.2026 blieb der alte, und damit
 * lebte jeder abgelaufene (oder weggeworfene) Zettel wieder auf, sobald
 * irgendwer mit der Adresse seines Besitzers „Link senden" drückte: Wer den
 * Zettel gefunden hatte, war damit angemeldet. Den Link bekommt der Besitzer
 * ja per E-Mail; einen Code braucht er dafür nicht.
 */
export async function tokenErneuern(
  rest: Pick<Rest, 'patchZeilen'>,
  link: Pick<LinkZeile, 'person_id' | 'gueltig_bis'>,
  jetzt = new Date(),
): Promise<{ token: string; gueltigBis: string } | null> {
  const token = neuesToken()
  const gilt = new Date(link.gueltig_bis) > jetzt
  const bis = gilt ? link.gueltig_bis : gueltigBis(jetzt)
  const zeilen = await rest.patchZeilen<{ person_id: string }>(
    `anmelde_links?person_id=eq.${wert(link.person_id)}&select=person_id`,
    gilt
      ? { token_hash: await pruefsumme(token) }
      : { token_hash: await pruefsumme(token), code_hash: await pruefsumme(neuerCode()), gueltig_bis: bis },
  )
  return zeilen && zeilen.length > 0 ? { token, gueltigBis: bis } : null
}

/** Vermerken, dass der Link eben per E-Mail hinausging. */
export async function alsGesendet(rest: Pick<Rest, 'send'>, personId: string, jetzt = new Date()): Promise<void> {
  await rest.send('PATCH', `anmelde_links?person_id=eq.${wert(personId)}`, { gesendet_at: jetzt.toISOString() })
}
