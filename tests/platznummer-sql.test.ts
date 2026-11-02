import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schluesselTeile } from '../supabase/functions/_shared/aufgaben-schluessel.ts'

/**
 * **Die Platznummer im `task_key` — in TypeScript und SQL dieselbe Regel.**
 *
 * Zerlegt wird der Schlüssel zweimal: von `schluesselTeile` (App und
 * Functions) und von `task_gehoert_mir` in `supabase/schema.sql` (ob eine
 * Zusage zur eigenen Aufgabe gehört). Lässt eine Seite „01" durch und die
 * andere nicht, steht neben der Zusage zu „…|1" eine zweite zu „…|01" — die
 * Datenbank hielte sie für die eigene, jeder Vergleich der Schlüssel für einen
 * anderen Platz.
 *
 * Gelesen wird die SQL-Fassung als Text; jedes ihrer Muster für die
 * Platznummer muss genau dort ja sagen, wo `schluesselTeile` es tut.
 */
const SCHEMA = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

function sqlMuster(): string[] {
  const start = SCHEMA.indexOf('create or replace function public.task_gehoert_mir')
  const ende = SCHEMA.indexOf('end $$;', start)
  expect(start, 'task_gehoert_mir nicht gefunden').toBeGreaterThanOrEqual(0)
  const rumpf = SCHEMA.slice(start, ende)
  return [...rumpf.matchAll(/teile\[5\] ~ '([^']+)'/g)].map((m) => m[1]!)
}

const KANDIDATEN = ['0', '1', '9', '10', '123', '01', '00', '007', '0.0', '1.5', '+0', '-1', '', ' 1', '1 ', '1e2', '٣']

describe('Platznummer: dieselbe Regel in schluesselTeile und task_gehoert_mir', () => {
  it('die SQL-Fassung prüft die Nummer an beiden Stellen — Hilfsdienst und Programmpunkt', () => {
    expect(sqlMuster()).toHaveLength(2)
  })

  it.each(['helper|mik', 'part|k3f9x', 'aux|k3f9x'])('%s: jede Schreibweise gilt in beiden — oder in keiner', (mitte) => {
    for (const muster of sqlMuster()) {
      const sql = new RegExp(muster)
      for (const nr of KANDIDATEN) {
        const ts = schluesselTeile(`2026-09-07|mid|${mitte}|${nr}`) !== null
        expect(sql.test(nr), `„${nr}" in ${muster}`).toBe(ts)
      }
    }
  })

  it('Gegenprobe: die kanonische Nummer gilt, die mit führender Null nicht', () => {
    expect(schluesselTeile('2026-09-07|mid|helper|mik|1')).not.toBeNull()
    expect(schluesselTeile('2026-09-07|mid|helper|mik|01')).toBeNull()
  })
})
