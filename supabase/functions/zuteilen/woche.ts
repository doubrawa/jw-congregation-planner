// =============================================================================
// zuteilen, Aufruf 'woche': eine Woche schreiben, in der ein Planer zugeteilt hat
// =============================================================================
//   { action: 'woche', woche: '<Montag>', stand: '<updated_at>', data: <Week> }
//
// Rechte-Stufe „Planer" (4.10.2026): Ein Planer teilt zu, ändert aber den Plan
// nicht — das bleibt dem Admin (`members.planner`). Wochen schreiben darf laut
// RLS nur der Admin; der Planer kommt über diese Function, und sie ist damit
// die Rechteprüfung, nicht der ausgeblendete Knopf:
//
//  - Mitglied mit Planer- oder Admin-Recht (`members.zuteiler`/`planner`);
//  - die Woche gibt es, und sie steht noch auf dem Stand, auf dem der Client
//    gearbeitet hat (sonst 409 — die App lädt nach, wie bei T39);
//  - geändert ist **nur, was ein Planer setzen darf** (`nurZuteilungen` in
//    `_shared/zuteilen-grenze.ts`), sonst 403.
//
// Geschrieben wird wie im Client mit Vergleiche-und-Tausche auf `updated_at`,
// und zurück geht der neue Stand: Mit ihm schreibt der Client die nächste
// Änderung derselben Woche.
//
// Anlegen kann ein Planer keine Woche — das tut der Import, und der ist Sache
// des Admins.
// =============================================================================

import { json, type Rest, wert } from '../_shared/rest.ts'
import { nurZuteilungen } from '../_shared/zuteilen-grenze.ts'

const MONTAG = /^\d{4}-\d{2}-\d{2}$/

interface Mitglied {
  congregation_id: string
  planner: boolean
  zuteiler: boolean
}

/**
 * Schreiben mit Vergleiche-und-Tausche; der neue Stand oder `null`, wenn
 * inzwischen ein anderer geschrieben hat.
 *
 * Trifft der Vergleich nicht, wird nachgesehen, ob sich der Stand wirklich
 * geändert hat — dieselbe Abwägung wie `schreibeWoche` im Client und
 * `wocheSchreiben` beim Füllen eines freien Platzes: Ein falscher Konfliktalarm
 * verwürfe die Arbeit des Planers.
 */
async function schreiben(rest: Rest, cong: string, woche: string, stand: string, data: unknown): Promise<string | null> {
  const zeile = `congregation_id=eq.${wert(cong)}&start=eq.${wert(woche)}`
  const getroffen = await rest.patchZeilen<{ updated_at: string }>(
    `weeks?${zeile}&updated_at=eq.${wert(stand)}&select=updated_at`,
    { data },
  )
  if (getroffen?.[0]) return getroffen[0].updated_at
  if (getroffen === null) return null
  const jetzt = await rest.get<{ updated_at: string }[]>(`weeks?select=updated_at&${zeile}`)
  if (jetzt[0]?.updated_at !== stand) return null
  const erneut = await rest.patchZeilen<{ updated_at: string }>(`weeks?${zeile}&select=updated_at`, { data })
  return erneut?.[0]?.updated_at ?? null
}

/** Eine Woche des Aufrufers schreiben, wenn er nur zugeteilt hat. */
export async function wocheZuteilen(rest: Rest, userId: string, payload: unknown): Promise<Response> {
  const rumpf = (payload ?? {}) as { woche?: unknown; stand?: unknown; data?: unknown }
  const { woche, stand, data } = rumpf
  if (typeof woche !== 'string' || !MONTAG.test(woche) || typeof stand !== 'string' || !stand) {
    return json({ error: 'bad-request' }, 400)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return json({ error: 'bad-request' }, 400)

  // Die Versammlung aus der eigenen Mitgliedszeile, nie aus dem Rumpf.
  const eigene = await rest.get<Mitglied[]>(
    `members?select=congregation_id,planner,zuteiler&user_id=eq.${wert(userId)}`,
  )
  const ich = eigene[0]
  if (!ich || !(ich.planner || ich.zuteiler)) return json({ error: 'forbidden' }, 403)
  const cong = ich.congregation_id

  const zeilen = await rest.get<{ data: unknown; updated_at: string }[]>(
    `weeks?select=data,updated_at&congregation_id=eq.${wert(cong)}&start=eq.${wert(woche)}`,
  )
  const jetzt = zeilen[0]
  if (!jetzt) return json({ error: 'week-not-found' }, 404)
  if (jetzt.updated_at !== stand) return json({ error: 'conflict' }, 409)
  // Der Admin darf alles; er kommt hier nur vorbei, wenn sein Recht während
  // der Sitzung dazukam.
  if (!ich.planner && !nurZuteilungen(jetzt.data, data)) return json({ error: 'nur-zuteilen' }, 403)

  const neu = await schreiben(rest, cong, woche, stand, data)
  if (!neu) return json({ error: 'conflict' }, 409)
  return json({ ok: true, stand: neu })
}
