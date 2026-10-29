import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANWESENDE_HOECHSTENS, ANWESENHEIT_DIENSTE } from '../src/data/anwesenheit'

/**
 * Dieselben Regeln stehen in der Datenbank (`schema.sql`): welche Dienste
 * eintragen dürfen und wie groß eine Zahl sein darf. Laufen sie auseinander,
 * böte die App das Eintragen an, und die Datenbank wiese es ab — oder
 * umgekehrt.
 */
describe('App und Datenbank sagen dasselbe', () => {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  const funktion = /create or replace function public\.darf_anwesenheit[\s\S]*?end \$\$;/.exec(schema)?.[0] ?? ''

  it('dieselben Dienste', () => {
    const dienste = /unnest\(array\[([^\]]*)\]\)/.exec(funktion)?.[1]?.split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(dienste).toEqual([...ANWESENHEIT_DIENSTE])
  })

  it('dieselbe Grenze', () => {
    const tabelle = /create table if not exists public\.anwesenheit \(([\s\S]*?)\n\);/.exec(schema)?.[1] ?? ''
    expect(tabelle).toContain(`saal            integer check (saal between 0 and ${ANWESENDE_HOECHSTENS})`)
    expect(tabelle).toContain(`video           integer check (video between 0 and ${ANWESENDE_HOECHSTENS})`)
  })
})
