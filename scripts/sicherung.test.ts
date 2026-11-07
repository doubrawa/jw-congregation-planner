import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fahre } from './schema-attrappe'
import {
  AUSGENOMMEN,
  DATEI_MUSTER,
  dateiName,
  fehlendeTabellen,
  main,
  ohneKommentare,
  REPO,
  tabellenAusSchema,
  ZIEL_VORGABE,
  zielGeprueft,
  zuLoeschen,
} from './sicherung.mjs'

/**
 * **Was hier geprüft wird, ist die Vollständigkeit.** Eine Sicherung, der eine
 * Tabelle fehlt, sieht aus wie eine Sicherung — gemerkt wird es erst beim
 * Zurückspielen, und dann ist das Fehlende weg. Deshalb steht im Mittelpunkt
 * die Probe „jede Tabelle aus `schema.sql` ist drin", mit der Gegenprobe, dass
 * eine neue Tabelle sie rot macht.
 *
 * Alle Daten unten sind Platzhalter (Kennungen aus Nullen, „Probe").
 */

const SCHEMA = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')
const C = '00000000-0000-4000-8000-000000000001'
const P1 = '00000000-0000-4000-8000-000000000011'
const U1 = '00000000-0000-4000-8000-000000000021'

const ordner: string[] = []
const temp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sicherung-probe-'))
  ordner.push(d)
  return d
}
afterEach(() => {
  for (const d of ordner.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('tabellenAusSchema', () => {
  it('findet jede Tabelle mit ihrem Primärschlüssel', () => {
    const t = tabellenAusSchema(SCHEMA)
    // So viele, wie `create table` in schema.sql steht — gezählt, nicht geglaubt.
    expect(t.length).toBe((SCHEMA.match(/create table if not exists/g) ?? []).length)
    expect(t[0]!.name).toBe('congregations') // die Reihenfolge der Datei, nicht alphabetisch
    expect(t.find((x) => x.name === 'members')!.pk).toEqual(['user_id'])
    expect(t.find((x) => x.name === 'absagen')!.pk).toEqual(['congregation_id', 'task_key', 'person_id'])
    // Ohne Primärschlüssel gäbe es keine feste Ordnung fürs seitenweise Lesen.
    expect(t.filter((x) => x.pk.length === 0)).toEqual([])
  })

  it('erkennt, was die Datenbank selbst vergibt, und was null sein darf', () => {
    const t = tabellenAusSchema(SCHEMA)
    expect(t.find((x) => x.name === 'anmelde_fehlversuche')!.generiert).toEqual(['id'])
    expect(t.filter((x) => x.generiert.length).map((x) => x.name)).toEqual(['anmelde_fehlversuche'])
    const persons = t.find((x) => x.name === 'persons')!
    expect(persons.nichtNull.has('congregation_id')).toBe(true)
    expect(persons.nichtNull.has('id')).toBe(true) // Primärschlüssel, auch ohne das Wort
    expect(persons.nichtNull.has('grp')).toBe(false) // darf warten (siehe zurueckspielen.mjs)
  })
})

describe('ohneKommentare', () => {
  it('nimmt Zeilen- und Blockkommentare heraus und lässt die Zeilen stehen', () => {
    const sql = 'a -- weg\nb /* auch\nweg */ c'
    expect(ohneKommentare(sql).split('\n').length).toBe(sql.split('\n').length)
    expect(ohneKommentare(sql)).not.toMatch(/weg/)
    expect(ohneKommentare(sql)).toMatch(/a/)
    expect(ohneKommentare(sql)).toMatch(/c/)
  })

  it('rettet die Klammerzählung vor einer Klammer im Kommentar', () => {
    // Ohne das Herausnehmen zählte `rumpfAb` die Klammer im Kommentar mit und
    // läse den Rumpf bis weit hinter das Tabellenende.
    const sql = 'create table if not exists public.x (\n  id uuid primary key, -- ein ( im Text\n  b text not null\n);\n'
    const t = tabellenAusSchema(sql)
    expect(t).toHaveLength(1)
    expect(t[0]!.pk).toEqual(['id'])
    expect(t[0]!.nichtNull.has('b')).toBe(true)
  })
})

describe('fehlendeTabellen', () => {
  const sicherung = { tabellen: Object.fromEntries(tabellenAusSchema(SCHEMA).map((t) => [t.name, []])) }

  it('meldet nichts, wenn jede Tabelle dabei ist', () => {
    expect(fehlendeTabellen(SCHEMA, sicherung)).toEqual([])
  })

  it('meldet eine neue Tabelle, die in der Sicherung fehlt', () => {
    // Die Gegenprobe zur Probe darüber: Käme morgen eine Tabelle ins Schema,
    // die niemand sichert, muss genau das hier rot werden.
    const neu = `${SCHEMA}\ncreate table if not exists public.neue_tabelle (\n  id uuid primary key\n);\n`
    expect(fehlendeTabellen(neu, sicherung)).toEqual(['neue_tabelle'])
  })

  it('lässt nur durch, was mit Grund ausgenommen ist', () => {
    for (const [tabelle, grund] of Object.entries(AUSGENOMMEN)) {
      expect(SCHEMA).toContain(`create table if not exists public.${tabelle} (`)
      expect(grund.length, `${tabelle} braucht einen Grund, keinen Vermerk`).toBeGreaterThan(40)
    }
    expect(fehlendeTabellen(SCHEMA, { tabellen: {} }).length).toBe(tabellenAusSchema(SCHEMA).length - Object.keys(AUSGENOMMEN).length)
  })
})

describe('dateiName und zuLoeschen', () => {
  it('benennt nach der Zeit und sortiert damit chronologisch', () => {
    const frueh = dateiName(new Date(2026, 10, 7, 9, 5, 3))
    const spaet = dateiName(new Date(2026, 10, 7, 9, 5, 41))
    expect(frueh).toBe('sicherung-2026-11-07_090503.json')
    expect(DATEI_MUSTER.test(frueh)).toBe(true)
    // Mit Sekunden, damit zwei Läufe in derselben Minute zwei Dateien geben.
    expect(spaet).not.toBe(frueh)
    expect([spaet, frueh].sort()).toEqual([frueh, spaet])
  })

  it('löscht die ältesten und lässt genau so viele stehen, wie gewünscht', () => {
    const dateien = ['sicherung-2026-11-01_030000.json', 'sicherung-2026-11-08_030000.json', 'sicherung-2026-10-25_030000.json']
    expect(zuLoeschen(dateien, 2)).toEqual(['sicherung-2026-10-25_030000.json'])
    expect(zuLoeschen(dateien, 3)).toEqual([])
    expect(zuLoeschen(dateien, 1)).toEqual(['sicherung-2026-10-25_030000.json', 'sicherung-2026-11-01_030000.json'])
  })

  it('fasst nichts an, was nicht von ihr ist', () => {
    // Im Zielordner kann anderes liegen (das Lauf-Protokoll der geplanten
    // Aufgabe, ältere Sicherungen von Hand); ein Aufräumen, das fremde Dateien
    // mitnimmt, wäre schlimmer als keines.
    const dateien = ['lauf.log', 'live-sicherung-2026-11-06.json', 'sicherung-2026-11-08_030000.json']
    expect(zuLoeschen(dateien, 1)).toEqual([])
  })
})

describe('die geplante Aufgabe', () => {
  const cmd = fs.readFileSync(path.join(REPO, 'scripts', 'sicherung-aufgabe.cmd'), 'utf8')

  it('nennt denselben Ablageort wie das Skript', () => {
    // Der Pfad steht zweimal da — hier und als `ZIEL_VORGABE`. Liefen beide
    // auseinander, schriebe die Aufgabe jahrelang woandershin als jeder
    // Handgriff, und gemerkt würde es erst, wenn eine Sicherung gebraucht wird.
    expect(cmd).toContain(ZIEL_VORGABE.replace(/\//g, '\\'))
  })

  it('wechselt ins Projekt, bevor sie node ruft', () => {
    // Ohne das findet `zugangsdaten()` die `.env.local` nicht, und die Aufgabe
    // bräche jede Woche mit „Kein Schlüssel und kein Terminal zum Fragen" ab.
    expect(cmd).toMatch(/cd \/d "%~dp0\.\."/)
    expect(cmd.indexOf('cd /d')).toBeLessThan(cmd.indexOf('node scripts'))
  })
})

describe('zielGeprueft', () => {
  it('weist den Projektordner ab — das Repo ist öffentlich', () => {
    expect(() => zielGeprueft(REPO)).toThrow(/öffentlich/)
    expect(() => zielGeprueft(path.join(REPO, 'sicherungen'))).toThrow(/Projektordner/)
    expect(() => zielGeprueft(path.join(REPO, 'docs', 'analyse', '..', '..', 'tmp'))).toThrow(/Projektordner/)
  })

  it('lässt einen Ordner daneben durch', () => {
    const daneben = path.join(REPO, '..', 'jw-sicherungen')
    expect(zielGeprueft(daneben)).toBe(path.resolve(daneben))
  })
})

describe('ein ganzer Lauf', () => {
  const bestand = {
    congregations: [{ id: C, name: 'Probeversammlung' }],
    persons: [{ id: P1, congregation_id: C, fn: 'Probe', ln: 'Person' }],
    members: [{ user_id: U1, congregation_id: C, planner: true }],
  }
  const konten = [{ id: U1, email: `${P1}@konten.invalid` }]

  it('schreibt jede Tabelle und die Konten in eine Datei außerhalb des Repos', async () => {
    const ziel = temp()
    await fahre(() => main(['--ziel', ziel]), { bestand, konten })
    const dateien = fs.readdirSync(ziel)
    expect(dateien.filter((d) => DATEI_MUSTER.test(d))).toHaveLength(1)
    const inhalt = JSON.parse(fs.readFileSync(path.join(ziel, dateien[0]!), 'utf8'))
    expect(fehlendeTabellen(SCHEMA, inhalt)).toEqual([])
    expect(inhalt.tabellen.persons).toEqual(bestand.persons)
    expect(inhalt.konten).toEqual([{ id: U1, email: konten[0]!.email, created_at: undefined }])
    expect(inhalt.schema_sha256).toMatch(/^[0-9a-f]{64}$/)
    // Die ausgenommene Tabelle ist nicht einfach weg, sie steht mit Grund da.
    expect(Object.keys(inhalt.tabellen)).not.toContain('anmelde_fehlversuche')
    expect(inhalt.ausgenommen.anmelde_fehlversuche).toMatch(/IP-Adressen/)
  })

  it('--trocken schreibt keine Datei', async () => {
    const ziel = temp()
    const { ausgabe } = await fahre(() => main(['--ziel', ziel, '--trocken']), { bestand, konten })
    expect(fs.readdirSync(ziel)).toEqual([])
    expect(ausgabe.join('\n')).toMatch(/nichts geschrieben/)
  })

  it('räumt ältere Stände ab, aber erst nachdem der neue steht', async () => {
    const ziel = temp()
    fs.writeFileSync(path.join(ziel, 'sicherung-2020-01-01_000000.json'), '{}')
    await fahre(() => main(['--ziel', ziel, '--staende', '1']), { bestand, konten })
    const geblieben = fs.readdirSync(ziel)
    expect(geblieben).toHaveLength(1)
    expect(geblieben[0]).not.toBe('sicherung-2020-01-01_000000.json')
    expect(JSON.parse(fs.readFileSync(path.join(ziel, geblieben[0]!), 'utf8')).tabellen.persons).toHaveLength(1)
  })

  it('weigert sich, ins Repo zu schreiben', async () => {
    await expect(fahre(() => main(['--ziel', path.join(REPO, 'docs')]), { bestand })).rejects.toThrow(/Projektordner/)
  })
})
