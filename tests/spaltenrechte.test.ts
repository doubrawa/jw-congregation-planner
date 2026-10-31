import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: null }))

import { schemaSpalten, SCHEMA_SQL } from '../scripts/schema-attrappe'
import { ABWESENHEIT_SPALTEN } from '../src/lib/data'
import { absenceFromRow } from '../src/lib/zeilen'

/**
 * **Spaltenrechte an `absences`** (Sicherheits-Review 29.10.2026).
 *
 * Die Versammlung liest die Tabelle, aber nicht jede Spalte: Der Grund einer
 * Abwesenheit ist gesperrt und kommt über `abwesenheit_gruende`. Drei Listen
 * müssen dafür zusammenpassen, und jede steht an einem anderen Ort:
 *
 * - die Spalten der Tabelle (`schema.sql`, samt späterer `add column`),
 * - die freigegebenen (`grant select (…)`) — alle außer der gesperrten,
 * - die, die die App lädt — genau das, was ihr Mapper liest, außer der
 *   gesperrten.
 *
 * Fehlt eine neue Spalte in der Freigabe, liest sie niemand; lädt die App eine
 * nicht freigegebene, scheitert das ganze Laden — bei jedem.
 *
 * `persons` war vom 29. bis 31.10.2026 ebenso gesperrt (die E-Mail-Adresse).
 * Seit die Spalte fort ist, liest die Versammlung die Tabelle wieder ganz —
 * das hält der letzte Block fest.
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

describe('Die Funktion für den Grund', () => {
  const rumpf = (name: string): string =>
    new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\n\\$\\$;`).exec(SCHEMA_SQL)?.[0] ?? ''

  it('liest mit eigenen Rechten — und nur in der eigenen Versammlung', () => {
    const r = rumpf('abwesenheit_gruende')
    expect(r).toMatch(/security definer\s+set search_path = public/)
    expect(r).toMatch(/\.congregation_id = public\.my_congregation_id\(\)/)
  })

  it('die Gründe der Admin — sonst nur, wem die Abwesenheit gehört oder wer sie eintrug; der Planer nicht', () => {
    const r = rumpf('abwesenheit_gruende')
    expect(r).toMatch(/public\.is_planner\(\)\s+or a\.user_id = auth\.uid\(\)\s+or \(a\.person_id is not null and a\.person_id = public\.my_person_id\(\)\)/)
    expect(r).not.toMatch(/darf_zuteilen/)
  })

  it('aufrufen dürfen sie nur Angemeldete', () => {
    expect(SCHEMA_SQL).toContain('revoke all on function public.abwesenheit_gruende() from public, anon;')
    expect(SCHEMA_SQL).toContain('grant execute on function public.abwesenheit_gruende() to authenticated;')
  })
})

/**
 * **Keine E-Mail-Adresse mehr** (31.10.2026): Die Spalte geht beim Einspielen,
 * vorher die Funktion, die sie las — und die Versammlung liest `persons`
 * wieder ganz, denn dort ist nichts mehr gesperrt.
 */
describe('persons ohne Adresse', () => {
  it('die Tabelle hat keine Spalte `mail` mehr — und das Schema räumt sie ab, nach der Funktion', () => {
    expect([...schemaSpalten('persons').keys()]).not.toContain('mail')
    const funktion = SCHEMA_SQL.indexOf('drop function if exists public.personen_mails();')
    const spalte = SCHEMA_SQL.indexOf('alter table public.persons drop column if exists mail;')
    expect(funktion).toBeGreaterThan(-1)
    expect(spalte).toBeGreaterThan(funktion)
    expect(SCHEMA_SQL).not.toContain('create or replace function public.personen_mails')
  })

  it('das Leserecht gilt wieder der ganzen Tabelle — anon bekommt keins', () => {
    expect(SCHEMA_SQL).toContain('grant select on public.persons to authenticated;')
    expect(SCHEMA_SQL).not.toMatch(/grant select \([^)]*\)\s+on public\.persons/)
    expect(SCHEMA_SQL).toContain('revoke select on public.persons from anon;')
  })
})
