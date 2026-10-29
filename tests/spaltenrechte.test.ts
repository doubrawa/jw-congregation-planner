import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: null }))

import { schemaSpalten, SCHEMA_SQL } from '../scripts/schema-attrappe'
import { ABWESENHEIT_SPALTEN, PERSON_SPALTEN } from '../src/lib/data'
import { absenceFromRow, personFromRow } from '../src/lib/zeilen'

/**
 * **Spaltenrechte an `persons` und `absences`** (Sicherheits-Review 29.10.2026).
 *
 * Die Versammlung liest beide Tabellen, aber nicht jede Spalte: Die
 * E-Mail-Adresse und der Grund einer Abwesenheit sind gesperrt und kommen über
 * `personen_mails` und `abwesenheit_gruende`. Drei Listen müssen dafür
 * zusammenpassen, und jede steht an einem anderen Ort:
 *
 * - die Spalten der Tabelle (`schema.sql`, samt späterer `add column`),
 * - die freigegebenen (`grant select (…)`) — alle außer der gesperrten,
 * - die, die die App lädt — genau das, was ihr Mapper liest, außer der
 *   gesperrten.
 *
 * Fehlt eine neue Spalte in der Freigabe, liest sie niemand; lädt die App eine
 * nicht freigegebene, scheitert das ganze Laden — bei jedem.
 */

const freigabe = (tabelle: string): string[] => {
  const m = new RegExp(`grant select \\(([^)]*)\\)\\s+on public\\.${tabelle} to authenticated;`).exec(SCHEMA_SQL)
  return m ? m[1]!.split(',').map((s) => s.trim()) : []
}

/** Die Felder einer Zeile, die ein Mapper liest — gemessen, nicht abgeschrieben. */
const gelesen = (mapper: (zeile: never) => unknown): string[] => {
  const felder = new Set<string>()
  const zeile = new Proxy(
    {},
    {
      get: (_ziel, feld) => {
        if (typeof feld === 'string') felder.add(feld)
        return undefined
      },
    },
  )
  mapper(zeile as never)
  return [...felder]
}

const nachName = (spalten: string[]): string[] => [...spalten].sort()

describe.each([
  { tabelle: 'persons', gesperrt: 'mail', app: PERSON_SPALTEN, mapper: personFromRow as (zeile: never) => unknown },
  { tabelle: 'absences', gesperrt: 'reason', app: ABWESENHEIT_SPALTEN, mapper: absenceFromRow as (zeile: never) => unknown },
])('$tabelle: „$gesperrt" liest die Versammlung nicht', ({ tabelle, gesperrt, app, mapper }) => {
  it('erst wird das Leserecht an der ganzen Tabelle entzogen, dann Spalte für Spalte gegeben', () => {
    const entzug = SCHEMA_SQL.indexOf(`revoke select on public.${tabelle} from anon, authenticated;`)
    const gabe = SCHEMA_SQL.search(new RegExp(`grant select \\([^)]*\\)\\s+on public\\.${tabelle} to authenticated;`))
    expect(entzug).toBeGreaterThan(-1)
    expect(gabe).toBeGreaterThan(entzug)
  })

  it('gegeben ist jede Spalte der Tabelle — außer der gesperrten', () => {
    const alle = [...schemaSpalten(tabelle).keys()]
    expect(alle).toContain(gesperrt)
    expect(nachName(freigabe(tabelle))).toEqual(nachName(alle.filter((s) => s !== gesperrt)))
  })

  it('kein anderes `grant` gibt die Tabelle wieder frei', () => {
    const gaben = [...SCHEMA_SQL.matchAll(new RegExp(`grant [^;]*\\bon (?:table )?public\\.${tabelle}\\b[^;]*;`, 'gi'))]
    expect(gaben).toHaveLength(1)
    expect(SCHEMA_SQL).not.toMatch(/grant [^;]*on all tables in schema public/i)
  })

  it('die App lädt genau, was ihr Mapper liest — ohne die gesperrte, nur Gegebenes', () => {
    const appSpalten = app.split(',').map((s) => s.trim())
    expect(nachName(appSpalten)).toEqual(nachName(gelesen(mapper).filter((s) => s !== gesperrt)))
    for (const s of appSpalten) expect(freigabe(tabelle)).toContain(s)
  })
})

describe('Die Funktionen für Adresse und Grund', () => {
  const rumpf = (name: string): string =>
    new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\n\\$\\$;`).exec(SCHEMA_SQL)?.[0] ?? ''

  it('beide lesen mit eigenen Rechten — und nur in der eigenen Versammlung', () => {
    for (const name of ['personen_mails', 'abwesenheit_gruende']) {
      const r = rumpf(name)
      expect(r, name).toMatch(/security definer\s+set search_path = public/)
      expect(r, name).toMatch(/\.congregation_id = public\.my_congregation_id\(\)/)
    }
  })

  it('die Adressen bekommt nur der Admin', () => {
    const r = rumpf('personen_mails')
    expect(r).toMatch(/and public\.is_planner\(\)/)
    expect(r).not.toMatch(/darf_zuteilen|auth\.uid/)
  })

  it('die Gründe der Admin — sonst nur, wem die Abwesenheit gehört oder wer sie eintrug; der Planer nicht', () => {
    const r = rumpf('abwesenheit_gruende')
    expect(r).toMatch(/public\.is_planner\(\)\s+or a\.user_id = auth\.uid\(\)\s+or \(a\.person_id is not null and a\.person_id = public\.my_person_id\(\)\)/)
    expect(r).not.toMatch(/darf_zuteilen/)
  })

  it('aufrufen dürfen sie nur Angemeldete', () => {
    for (const name of ['personen_mails', 'abwesenheit_gruende']) {
      expect(SCHEMA_SQL).toContain(`revoke all on function public.${name}() from public, anon;`)
      expect(SCHEMA_SQL).toContain(`grant execute on function public.${name}() to authenticated;`)
    }
  })
})
