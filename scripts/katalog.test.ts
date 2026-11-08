import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ABFRAGEN, ABSCHNITTE, aclAngeglichen, katalog, katalogAbfrage, katalogVergleich } from './katalog.mjs'
import { leerePostgres } from './pglite-postgres.mjs'
import { REPO } from './sicherung.mjs'

/**
 * **Der Vergleich zweier Kataloge** — die Produktion (Postgres 17) gegen die
 * Folge der Migrationen in PGlite (Postgres 16). Gleich heißen darf nur, was
 * gleich ist; verschieden aussehen darf, was zwischen den beiden Versionen
 * ohne Bedeutung abweicht. Beides hält diese Probe fest.
 */

type Katalog = Record<string, Record<string, unknown>[]>
const leer = (): Katalog => Object.fromEntries(ABSCHNITTE.map((a) => [a, []]))

describe('aclAngeglichen', () => {
  it('ordnet die Einträge — die Reihenfolge sagt nur, wann vergeben wurde', () => {
    expect(aclAngeglichen('{b=r/postgres,a=r/postgres}')).toBe(aclAngeglichen('{a=r/postgres,b=r/postgres}'))
  })

  it('nimmt MAINTAIN (`m`, ab Postgres 17) nur bei Tabellen heraus', () => {
    expect(aclAngeglichen('{postgres=arwdDxtm/postgres}', true)).toBe('postgres=arwdDxt/postgres')
    expect(aclAngeglichen('{postgres=arwdDxtm/postgres}')).toBe('postgres=arwdDxtm/postgres')
  })

  it('lässt „kein Recht gesetzt" von einem leeren Recht unterscheidbar', () => {
    expect(aclAngeglichen(null)).toBeNull()
    expect(aclAngeglichen('{}')).toBe('')
  })
})

describe('katalogVergleich', () => {
  it('nennt nichts, wo nur Version und Reihenfolge abweichen', () => {
    const live = leer()
    const kette = leer()
    live.tabellen = [{ relname: 'weeks', relacl: '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres}' }]
    kette.tabellen = [{ relname: 'weeks', relacl: '{authenticated=arwdDxt/postgres,postgres=arwdDxt/postgres}' }]
    // Später angefügt steht eine Spalte hinten — in einer frischen Datenbank dort, wo `create table` sie nennt.
    live.spalten = [{ tabelle: 'persons', attnum: 14, attname: 'grp', attacl: null }]
    kette.spalten = [{ tabelle: 'persons', attnum: 9, attname: 'grp', attacl: null }]
    expect(katalogVergleich(live, kette)).toEqual([])
  })

  it('nennt, was nur auf einer Seite steht — eine Spalte, die nur die Produktion hat', () => {
    // So stand bis zum 7.11.2026 der frühere Anzeigename in `persons`.
    const live = leer()
    const kette = leer()
    live.spalten = [
      { tabelle: 'persons', attnum: 1, attname: 'id' },
      { tabelle: 'persons', attnum: 5, attname: 'veraltet' },
    ]
    kette.spalten = [{ tabelle: 'persons', attnum: 1, attname: 'id' }]
    expect(katalogVergleich(live, kette)).toEqual([{ abschnitt: 'spalten', nurLinks: ['persons.veraltet'], nurRechts: [], anders: [] }])
  })

  it('nennt ein abweichendes Feld bei gleichem Namen — ein Spaltenrecht, ein Rumpf', () => {
    const live = leer()
    const kette = leer()
    live.spalten = [{ tabelle: 'persons', attnum: 2, attname: 'fn', attacl: '{authenticated=r/postgres}' }]
    kette.spalten = [{ tabelle: 'persons', attnum: 2, attname: 'fn', attacl: null }]
    live.funktionen = [{ proname: 'f', parameter: '', rumpf: 'aaa' }]
    kette.funktionen = [{ proname: 'f', parameter: '', rumpf: 'bbb' }]
    expect(katalogVergleich(live, kette)).toEqual([
      { abschnitt: 'spalten', nurLinks: [], nurRechts: [], anders: [{ name: 'persons.fn', feld: 'attacl', links: 'authenticated=r/postgres', rechts: null }] },
      { abschnitt: 'funktionen', nurLinks: [], nurRechts: [], anders: [{ name: 'f()', feld: 'rumpf', links: 'aaa', rechts: 'bbb' }] },
    ])
  })

  it('kennt einen Kommentar an seiner Spalte', () => {
    const live = leer()
    live.kommentare = [{ objekt: 'persons', spalte: 'fn', kommentar: 'Vorname' }]
    expect(katalogVergleich(live, leer())).toEqual([{ abschnitt: 'kommentare', nurLinks: ['persons.fn'], nurRechts: [], anders: [] }])
  })
})

describe('katalogAbfrage', () => {
  it('fragt jeden Abschnitt in einer Anweisung — für `db query`', () => {
    const sql = katalogAbfrage()
    for (const a of ABSCHNITTE) expect(sql).toContain(`'${a}', (select coalesce(json_agg(x), '[]'::json) from (${ABFRAGEN[a as keyof typeof ABFRAGEN].trim()}) x)`)
    expect(sql.trim().split(';').filter((s) => s.trim())).toHaveLength(1)
  })

  it('ergibt in Postgres denselben Katalog wie die Abfragen einzeln — jeder Abschnitt mit Zeilen', async () => {
    // In der Produktion läuft nur dieser Weg (über `db query`), in den übrigen
    // Proben nur `katalog()`. Ohne diese Probe fiele ein Abschnitt, der als JSON
    // anders aussieht oder keinen Schlüssel für den Vergleich hat, erst beim
    // Ausrollen auf — wenn Migrationen und Functions schon draußen sind.
    const db = await leerePostgres([fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')])
    try {
      const einzeln = (await katalog(db)) as Katalog
      const { rows } = await db.query<{ katalog: string }>(katalogAbfrage())
      const alsJson = JSON.parse(rows[0]!.katalog) as Katalog
      // Ein leerer Abschnitt riefe seinen Schlüssel nie auf.
      expect(ABSCHNITTE.filter((a) => !einzeln[a]?.length)).toEqual([])
      expect(katalogVergleich(alsJson, einzeln)).toEqual([])
    } finally {
      await db.close()
    }
  })
})
