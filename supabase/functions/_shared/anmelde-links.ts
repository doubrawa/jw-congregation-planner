// =============================================================================
// Geteilt: Anmelde-Links ausstellen (T121, Phase 8)
// =============================================================================
// Eine Zeile je Person in `anmelde_links` (siehe `schema.sql`). Geschrieben
// wird sie beim Ausstellen — neuer Link, neuer Code, der alte Zettel gilt nicht
// mehr: vom Admin (`send-invite`) oder vom Notzugang
// (`scripts/zugang-ausstellen.mjs`). Bis zum 31.10.2026 ließ man sich auch auf
// der Anmeldeseite einen neuen Link per E-Mail schicken; `gesendet_at` stammt
// aus dieser Zeit und bleibt seitdem leer.
// =============================================================================

import { gueltigBis, neuerCode, neuesToken, pruefsumme } from './anmeldung.ts'
import type { Rest } from './rest.ts'

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
 * Neue Links für diese Personen ausstellen — je Person Token und Code, alle in
 * **einem** Schreiben gespeichert. Jeder ersetzt den alten ganz: Token, Code,
 * Gültigkeit — der alte Zettel gilt danach nicht mehr. Bis zum 31.10.2026 ging
 * je Person ein Schreiben hinaus, nacheinander, weil zwischen zwei E-Mails eine
 * Pause lag; ohne E-Mail braucht es die nicht.
 *
 * `null`, wenn die Datenbank ablehnt — dann gilt keiner der neuen. Verlangt vom
 * Klienten nur `upsert`, so stellt auch der Notzugang
 * (`scripts/zugang-ausstellen.mjs`) mit seinem Node-Klienten aus.
 */
export async function linksAusstellen(
  rest: Pick<Rest, 'upsert'>,
  personIds: readonly string[],
  congregationId: string,
  jetzt = new Date(),
): Promise<Array<{ personId: string; link: NeuerLink }> | null> {
  const neu = personIds.map((personId) => ({ personId, link: { token: neuesToken(), code: neuerCode(), gueltigBis: gueltigBis(jetzt) } }))
  const zeilen = await Promise.all(
    neu.map(async ({ personId, link }) => ({
      person_id: personId,
      congregation_id: congregationId,
      token_hash: await pruefsumme(link.token),
      code_hash: await pruefsumme(link.code),
      gueltig_bis: link.gueltigBis,
      erstellt_at: jetzt.toISOString(),
      gesendet_at: null,
      benutzt_at: null,
    })),
  )
  return (await rest.upsert('anmelde_links?on_conflict=person_id', zeilen)) ? neu : null
}

/** Einen neuen Link für eine Person ausstellen (siehe `linksAusstellen`). `null`, wenn die Datenbank ablehnt. */
export async function linkAusstellen(
  rest: Pick<Rest, 'upsert'>,
  personId: string,
  congregationId: string,
  jetzt = new Date(),
): Promise<NeuerLink | null> {
  return (await linksAusstellen(rest, [personId], congregationId, jetzt))?.[0]?.link ?? null
}
