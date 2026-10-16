/**
 * **Trolley-Termine schreiben** (T121, Phase 7) — über die Edge Function
 * `trolley`, nie direkt in die Tabelle.
 *
 * Jede der vier Aktionen sagt einem anderen etwas: dem Partner, dem, der
 * gesucht hat, dem, der bleibt. Das tut die Function, damit keine Mitteilung
 * von einem Gerät aus entstehen kann (`supabase/functions/trolley/index.ts`).
 * Deshalb wartet die App hier auf die Antwort, statt wie sonst gleich weiter
 * zu zeichnen: Ob der Trolley zu der Zeit noch frei war, weiß erst die
 * Datenbank.
 *
 * **Ohne Datenbank** (Entwicklerseite, Tests) gilt der Wunsch als angenommen —
 * gerechnet mit denselben Regeln (`wasBleibt`), damit die Abläufe dort
 * dieselben sind.
 */

import { wasBleibt } from '../../supabase/functions/_shared/trolley.ts'
import type { TrolleyHindernis } from '../data/trolleys'
import type { TrolleyTermin } from '../data/types'
import { trolleyTerminFromRow, type TrolleyTerminRow } from './data'
import { fehlerAntwort } from './function-antwort'
import { supabase } from './supabase'

/**
 * Warum es nicht ging: was schon die App vorher prüft (`TrolleyHindernis`),
 * dazu, was erst der Server weiß — und `netz`, wenn keine Antwort kam.
 */
export type TrolleyFehler = TrolleyHindernis | 'schon-partner' | 'weg' | 'stand' | 'netz'

/** Der Termin, wie er jetzt dasteht (`null`: Er ist weg) — oder der Grund. */
export type TrolleyErgebnis = { ok: true; termin: TrolleyTermin | null } | { ok: false; fehler: TrolleyFehler }

const BEKANNT: ReadonlySet<string> = new Set<TrolleyFehler>([
  'kein-recht',
  'vorbei',
  'zeit',
  'belegt',
  'doppelt',
  'partner-doppelt',
  'partner-ohne-recht',
  'schon-partner',
  'weg',
  'stand',
])

/**
 * Ein Aufruf der Function. Den Grund einer Abweisung liest `fehlerAntwort`;
 * ein unbekannter gilt als veralteter Stand — die App lädt dann nach.
 */
async function aufrufen(body: object): Promise<{ ok: true; termin?: TrolleyTerminRow | null } | { ok: false; fehler: TrolleyFehler }> {
  if (!supabase) return { ok: true }
  const { data, error } = await supabase.functions.invoke('trolley', { body })
  if (!error) return { ok: true, termin: (data as { termin?: TrolleyTerminRow | null } | null)?.termin }
  const grund = (await fehlerAntwort(error))?.error
  if (!grund) {
    console.error('[trolley]', error.message)
    return { ok: false, fehler: 'netz' }
  }
  return { ok: false, fehler: BEKANNT.has(grund) ? (grund as TrolleyFehler) : 'stand' }
}

/** Was nach einer Antwort im Zustand steht: der Termin vom Server — ohne Datenbank der lokal gerechnete. */
function ergebnis(
  antwort: Awaited<ReturnType<typeof aufrufen>>,
  ohneDatenbank: TrolleyTermin | null,
): TrolleyErgebnis {
  if (!antwort.ok) return antwort
  if (antwort.termin === undefined) return { ok: true, termin: ohneDatenbank }
  return { ok: true, termin: antwort.termin ? trolleyTerminFromRow(antwort.termin) : null }
}

/**
 * Eintragen — die eigene Person (`termin.pid`), mit Partner oder allein.
 * `heute` ist der Kalendertag des Geräts; Vergangenes weist die Function ab.
 */
export async function trolleyEintragen(termin: TrolleyTermin, heute: string): Promise<TrolleyErgebnis> {
  const { id, trolleyId, datum, von, bis, partner } = termin
  return ergebnis(await aufrufen({ aktion: 'eintragen', termin: { id, trolleyId, datum, von, bis, partner }, heute }), termin)
}

/** Zu einem Termin mit „Partner gesucht" dazukommen. */
export async function trolleyDazukommen(termin: TrolleyTermin, ich: string, heute: string): Promise<TrolleyErgebnis> {
  return ergebnis(await aufrufen({ aktion: 'dazukommen', id: termin.id, heute }), {
    ...termin,
    partner: ich,
    gemeinsam: false,
  })
}

/** Sich austragen — bleibt der andere, sucht er wieder einen Partner. */
export async function trolleyAustragen(termin: TrolleyTermin, ich: string, heute: string): Promise<TrolleyErgebnis> {
  const bleibt = wasBleibt(termin.pid, termin.partner, ich)
  return ergebnis(
    await aufrufen({ aktion: 'austragen', id: termin.id, heute }),
    bleibt ? { ...termin, pid: bleibt.person, partner: null, gemeinsam: false } : null,
  )
}

/** Der Admin entfernt einen Trolley; wer für einen kommenden Termin eingetragen war, erfährt es. */
export async function trolleyEntfernen(
  trolleyId: string,
  heute: string,
): Promise<{ ok: true } | { ok: false; fehler: TrolleyFehler }> {
  const antwort = await aufrufen({ aktion: 'entfernen', trolleyId, heute })
  return antwort.ok ? { ok: true } : antwort
}
