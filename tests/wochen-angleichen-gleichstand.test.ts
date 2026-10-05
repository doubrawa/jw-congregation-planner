import { describe, expect, it, vi } from 'vitest'

/**
 * **Das Prüfskript rechnet, was das Laden rechnet** (5.10.2026, Befund 9).
 *
 * `scripts/wochen-angleichen.mjs` bringt den Bestand dorthin, wo die App ihn
 * nach dem Laden hat — sonst weisen `zuteilen` und `fs_weeks_pruefen` Planer
 * und Gruppenaufseher ab. Es nimmt dieselben Funktionen, aber die Kette, in der
 * sie laufen, steht dort ein zweites Mal. Kommt beim Laden ein Schritt dazu
 * (`loadCongregationData`, `hydrate`) und im Skript nicht, fällt es hier auf —
 * gemessen am echten Ladeweg, nicht an einer Nacherzählung.
 *
 * Die Datenbank ist eine Warteschlange je Tabelle: jeder Aufruf bekommt die
 * nächste hinterlegte Antwort, nicht hinterlegte Tabellen liefern nichts.
 */

const antworten = vi.hoisted(() => ({ je: {} as Record<string, unknown[]> }))

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (tabelle: string) => {
      const kette: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'in', 'is', 'order', 'limit', 'maybeSingle']) kette[m] = () => kette
      kette.then = (fertig: (v: unknown) => void) => fertig({ data: (antworten.je[tabelle] ?? []).shift() ?? null, error: null })
      return kette
    },
  },
}))

import { loadCongregationData } from '../src/lib/data'
import { fsRuleToRow, personToRow } from '../src/lib/zeilen'
import { initialState } from '../src/app/init'
import { reducer } from '../src/app/reducer'
import { buildDemoWeeks, DEMO_FS_RULES, DEMO_PERSONS } from './testdaten/testdaten'
import { angleichen, appFunktionen, GRUND_KLASSE, GRUND_NAMEN, GRUND_TREFFPUNKTE_FEHLEN } from '../scripts/wochen-angleichen.mjs'

describe('wochen-angleichen.mjs: dieselbe Kette wie Laden und hydrate', () => {
  it('Wochen und Treffpunkte gleichen dem Zustand nach dem Laden', async () => {
    // Absteigend, wie die Abfrage sie liefert — ohne Bindung, ohne Klasse, ohne Treffpunkt-Zeilen.
    const wochen = buildDemoWeeks()
      .slice(0, 2)
      .map((w, i) => ({ start: w.start, data: w, updated_at: `S${i}` }))
      .reverse()
    const personen = DEMO_PERSONS.map((p) => personToRow(p, 'c1'))
    const regeln = DEMO_FS_RULES.map((r) => fsRuleToRow(r, 'c1'))
    antworten.je = {
      members: [{ congregation_id: 'c1', person_id: null, planner: true }, []],
      congregations: [{ name: 'Probe', hall: '', mid_wd: 2, mid_time: '19:00:00', we_wd: 0, we_time: '10:00:00', cong_lang: 'de', prog_langs: [], aux_class: true }],
      persons: [personen],
      weeks: [wochen],
      fs_rules: [regeln],
      fs_weeks: [[]],
    }
    const res = await loadCongregationData('u1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // `initialState` liest die Geräte-Einstellungen — hier gibt es keine.
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    const leer = initialState()
    vi.unstubAllGlobals()
    const payload = { ...res.data, congregationId: res.congregationId, userId: res.userId, empty: res.empty }
    const geladen = reducer(leer, { type: 'hydrate', payload })

    const ergebnis = angleichen({ wochen, fsWochen: [], regeln, personen, auxClass: true }, await appFunktionen())
    const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
    expect(json(ergebnis.map((e) => e.nachher))).toEqual(json(geladen.weeks))
    expect(json(ergebnis.map((e) => e.fsNachher))).toEqual(json(geladen.fsWeeks))

    // Und es war nicht der Leerlauf beider Seiten: Jeder Schritt hat gewirkt.
    const gruende = ergebnis.flatMap((e) => e.gruende)
    expect(gruende).toEqual(expect.arrayContaining([GRUND_NAMEN, GRUND_KLASSE, GRUND_TREFFPUNKTE_FEHLEN]))
  })
})
