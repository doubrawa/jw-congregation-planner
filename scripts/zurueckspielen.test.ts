import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ATTRAPPE_URL, type Aufruf, befunde, fahre, tabelleVon } from './schema-attrappe'
import { AUSGENOMMEN, REPO, tabellenAusSchema } from './sicherung.mjs'
import { aufgeschobene, fremdeSpalten, fremdschluessel, main, pkFilter, zeileTeilen } from './zurueckspielen.mjs'

/**
 * **Geprüft wird, ob alles wieder dasteht — und in einer Reihenfolge, die die
 * Datenbank annimmt.** Der Ring `persons.grp ↔ groups.overseer_id` ist dabei
 * der Kern: Er wird aus `schema.sql` erkannt, nicht aufgezählt, und genau das
 * muss die Probe nachhalten.
 *
 * Alle Daten unten sind Platzhalter (Kennungen aus Nullen, „Probe").
 */

const SCHEMA = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')
const C = '00000000-0000-4000-8000-000000000001'
const P1 = '00000000-0000-4000-8000-000000000011'
const G1 = '00000000-0000-4000-8000-000000000031'
const U1 = '00000000-0000-4000-8000-000000000021'

const dateien: string[] = []
function sicherungsDatei(inhalt: Record<string, unknown>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zurueck-probe-'))
  dateien.push(d)
  const p = path.join(d, 'sicherung-2026-11-07_0900.json')
  fs.writeFileSync(p, JSON.stringify(inhalt), 'utf8')
  return p
}
afterEach(() => {
  for (const d of dateien.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

/** Eine Sicherung über alle Tabellen; gefüllt ist nur, was der Fall braucht. */
function sicherung(gefuellt: Record<string, unknown[]> = {}, konten: unknown[] = []): Record<string, unknown> {
  const tabellen: Record<string, unknown[]> = {}
  for (const t of tabellenAusSchema(SCHEMA)) if (!(t.name in AUSGENOMMEN)) tabellen[t.name] = gefuellt[t.name] ?? []
  return { erstellt: '2026-11-07T08:00:00.000Z', projekt: 'probe', konten, tabellen }
}

const BESTAND = {
  congregations: [{ id: C, name: 'Probeversammlung' }],
  groups: [{ id: G1, congregation_id: C, name: 'Gruppe 1', position: 0, overseer_id: P1 }],
  persons: [{ id: P1, congregation_id: C, fn: 'Probe', ln: 'Person', grp: G1 }],
  members: [{ user_id: U1, congregation_id: C, planner: true, person_id: P1 }],
}
const KONTEN = [{ id: U1, email: `${P1}@konten.invalid`, created_at: '2026-10-01T00:00:00.000Z' }]

describe('fremdschluessel', () => {
  const fks = fremdschluessel(SCHEMA)

  it('liest alle drei Schreibweisen aus schema.sql', () => {
    const hat = (tabelle: string, spalten: string[], ziel: string): boolean =>
      fks.some((f) => f.tabelle === tabelle && f.ziel === ziel && f.spalten.join() === spalten.join())
    expect(hat('persons', ['congregation_id'], 'congregations')).toBe(true) // an der Spalte
    expect(hat('persons', ['fam', 'congregation_id'], 'households')).toBe(true) // als Bedingung, zweizeilig
    expect(hat('persons', ['grp', 'congregation_id'], 'groups')).toBe(true) // nachgereicht per alter table
    expect(hat('members', ['user_id'], 'users')).toBe(true) // nach auth.users
  })

  it('erfindet keine — jedes Ziel ist eine Tabelle', () => {
    const tabellen = new Set(tabellenAusSchema(SCHEMA).map((t) => t.name))
    const unbekannt = fks.filter((f) => f.schema === 'public' && !tabellen.has(f.ziel))
    expect(unbekannt).toEqual([])
  })

  it('liest nicht über die deutschen Kommentare hinweg', () => {
    /*
     * Die Gegenprobe zum Herausnehmen der Kommentare: Genau so steht es in
     * `absences` — ein Komma im Fließtext, zwei Zeilen später die Spalte mit
     * dem Verweis. Ohne `ohneKommentare` entstand daraus der Fremdschlüssel
     * `absences.und` (gemessen am 7.11.2026).
     */
    const sql = [
      'create table if not exists public.x (',
      '  id uuid primary key,',
      '  -- ein gelöschtes Konto nahm die Zeile sonst mit, und die',
      '  -- Planung teilte den Verreisten wieder ein.',
      '  user_id uuid references auth.users (id) on delete set null',
      ');',
    ].join('\n')
    expect(fremdschluessel(sql)).toEqual([{ tabelle: 'x', spalten: ['user_id'], ziel: 'users', schema: 'auth' }])
  })
})

describe('aufgeschobene', () => {
  it('erkennt genau den Ring im echten Schema', () => {
    // `persons.grp` zeigt auf `groups`, das später angelegt wird; der Rückweg
    // (`groups.overseer_id` → `persons`) zeigt nach hinten und braucht nichts.
    expect(aufgeschobene(tabellenAusSchema(SCHEMA), fremdschluessel(SCHEMA))).toEqual({ persons: ['grp'] })
  })

  it('bricht ab, wenn sich ein Verweis nach vorn nicht aufschieben lässt', () => {
    // Eine Pflichtspalte lässt sich nicht leer schreiben. Das muss hier
    // auffallen und nicht erst mitten im Schreiben an einem 409 von PostgREST.
    const sql = [
      'create table if not exists public.a (',
      '  id uuid primary key,',
      '  b_id uuid not null references public.b (id)',
      ');',
      'create table if not exists public.b (',
      '  id uuid primary key',
      ');',
    ].join('\n')
    expect(() => aufgeschobene(tabellenAusSchema(sql), fremdschluessel(sql))).toThrow(/zeigt auf b/)
  })
})

describe('zeileTeilen', () => {
  it('schiebt nur gesetzte Werte auf und lässt den Rest, wie er ist', () => {
    expect(zeileTeilen({ id: 'x', grp: 'g', fn: 'Probe' }, ['grp'])).toEqual({
      jetzt: { id: 'x', grp: null, fn: 'Probe' },
      nach: { grp: 'g' },
    })
    // Ein leerer Verweis braucht keinen Nachtrag — sonst stünde für jede Person
    // ohne Gruppe ein PATCH an, der nichts ändert.
    expect(zeileTeilen({ id: 'x', grp: null }, ['grp'])).toEqual({ jetzt: { id: 'x', grp: null }, nach: {} })
  })

  it('lässt weg, was die Datenbank selbst vergibt', () => {
    expect(zeileTeilen({ id: 7, ip: '0.0.0.0' }, [], ['id'])).toEqual({ jetzt: { ip: '0.0.0.0' }, nach: {} })
  })
})

describe('fremdeSpalten', () => {
  const spalten = new Set(['id', 'fn'])

  it('lässt eine fort, die das Ziel nicht kennt und die in jeder Zeile leer ist', () => {
    expect(fremdeSpalten([{ id: 1, fn: 'a', alt: '' }, { id: 2, fn: 'b', alt: null }], spalten)).toEqual({ weglassen: ['alt'], gefuellt: [] })
  })

  it('nennt eine, die etwas trägt, mit der Zahl ihrer Zeilen — auch 0 und false sind ein Wert', () => {
    expect(fremdeSpalten([{ id: 1, alt: 'x', n: 0 }, { id: 2, alt: '', n: false }], spalten)).toEqual({
      weglassen: [],
      gefuellt: [
        { spalte: 'alt', zeilen: 1 },
        { spalte: 'n', zeilen: 2 },
      ],
    })
  })

  it('meldet nichts, wenn jede Spalte bekannt ist', () => {
    expect(fremdeSpalten([{ id: 1, fn: 'a' }], spalten)).toEqual({ weglassen: [], gefuellt: [] })
  })
})

describe('pkFilter', () => {
  it('filtert über eine Spalte und über mehrere', () => {
    expect(pkFilter({ id: 'abc' }, ['id'])).toBe('id=eq.abc')
    expect(pkFilter({ congregation_id: C, woche: '2026-11-02', zusammenkunft: 'mid' }, ['congregation_id', 'woche', 'zusammenkunft'])).toBe(
      `and=(congregation_id.eq.${C},woche.eq.2026-11-02,zusammenkunft.eq.mid)`,
    )
  })
})

describe('ein ganzer Lauf', () => {
  it('spielt Konten und Zeilen zurück und trägt den Ring nach', async () => {
    const datei = sicherungsDatei(sicherung(BESTAND, KONTEN))
    const { tabellen, aufrufe, ausgabe } = await fahre(() => main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000']))

    expect(tabellen.congregations).toHaveLength(1)
    expect(tabellen.groups?.[0]).toMatchObject({ id: G1, overseer_id: P1 })
    expect(tabellen.members?.[0]).toMatchObject({ user_id: U1, person_id: P1 })
    // Der Kern: Die Person steht mit ihrer Gruppe da, obwohl die Gruppe erst
    // nach ihr geschrieben wurde.
    expect(tabellen.persons?.[0]).toMatchObject({ id: P1, grp: G1 })

    const folge = aufrufe.map((a) => `${a.method} ${a.pfad.split('?')[0]}`)
    expect(folge.indexOf('POST persons')).toBeLessThan(folge.indexOf('POST groups'))
    expect(folge.lastIndexOf('PATCH persons')).toBeGreaterThan(folge.indexOf('POST groups'))
    expect(ausgabe.join('\n')).toMatch(/Alle Tabellen gleich/)
  })

  it('legt das Konto mit seiner alten Kennung an — sonst passte kein Anmelde-Link mehr', async () => {
    const datei = sicherungsDatei(sicherung(BESTAND, KONTEN))
    await fahre(() => main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000']))
    // `members.user_id` zeigt auf `auth.users`: Hätte das Konto eine neue Id,
    // stünde die Zeile in der echten Datenbank vor einem leeren Fremdschlüssel.
    expect(BESTAND.members[0]!.user_id).toBe(KONTEN[0]!.id)
  })

  it('--trocken schreibt nichts', async () => {
    const datei = sicherungsDatei(sicherung(BESTAND, KONTEN))
    const { tabellen, ausgabe } = await fahre(() =>
      main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000', '--trocken']),
    )
    expect(tabellen.persons ?? []).toEqual([])
    expect(ausgabe.join('\n')).toMatch(/nichts geschrieben/)
  })

  it('weigert sich, in eine Datenbank zu schreiben, in der schon etwas steht', async () => {
    const datei = sicherungsDatei(sicherung(BESTAND, KONTEN))
    await expect(
      fahre(() => main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000']), {
        bestand: { congregations: [{ id: C, name: 'Schon da' }] },
      }),
    ).rejects.toThrow(/process\.exit\(1\)/)
  })

  it('schreibt nicht ins Projekt aus .env.local, ohne dass es jemand sagt', async () => {
    // Ohne Ziel wäre das Ziel der Betrieb. Ein ganzer Bestand gehört dort nur
    // hinein, wenn jemand es ausdrücklich so meint (`--hierher`).
    const datei = sicherungsDatei(sicherung(BESTAND, KONTEN))
    await expect(fahre(() => main([datei]))).rejects.toThrow(/process\.exit\(2\)/)
  })

  it('warnt, wenn die Sicherung von einem anderen Schema stammt', async () => {
    const datei = sicherungsDatei({ ...sicherung(BESTAND, KONTEN), schema_sha256: 'a'.repeat(64) })
    const { ausgabe } = await fahre(() => main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000']))
    expect(ausgabe.join('\n')).toMatch(/anderen Stand von schema\.sql/)
  })
})

/**
 * **Eine Spalte, die das Ziel nicht kennt.** Gesichert wird mit `select=*`:
 * Hat die Quelle mehr als `schema.sql`, steht das Mehr in jeder Sicherung — so
 * bis zum 7.11.2026 `persons.dn`, ein Rest, den nur die Produktion hatte.
 * PostgREST nimmt eine Zeile mit unbekannter Spalte nicht an, die Attrappe
 * meldet sie als Befund. Die Probe nennt die Spalte `veraltet`: Welche es ist,
 * spielt keine Rolle, nur dass `schema.sql` sie nicht kennt.
 */
describe('Spalten, die das Ziel nicht kennt', () => {
  const mitAltlast = (wert: string): Record<string, unknown[]> => ({
    ...BESTAND,
    persons: BESTAND.persons.map((p) => ({ ...p, veraltet: wert })),
  })

  it('lässt eine fort, die in jeder Zeile leer ist, und sagt es', async () => {
    const datei = sicherungsDatei(sicherung(mitAltlast(''), KONTEN))
    const { tabellen, aufrufe, ausgabe } = await fahre(() => main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000']))
    expect(befunde(aufrufe)).toEqual([])
    expect(tabellen.persons?.[0]).not.toHaveProperty('veraltet')
    expect(ausgabe.join('\n')).toMatch(/persons\.veraltet/)
    expect(ausgabe.join('\n')).toMatch(/Alle Tabellen gleich/)
  })

  it('bricht ab, bevor es das Ziel anfasst, wenn so eine Spalte etwas trägt', async () => {
    // Was darin steht, ginge verloren — das entscheidet kein Skript still.
    const datei = sicherungsDatei(sicherung(mitAltlast('Probe'), KONTEN))
    const gesehen: string[] = []
    const mitschreiben = (a: Aufruf): undefined => {
      gesehen.push(`${a.method} ${tabelleVon(a)}`)
    }
    await expect(
      fahre(() => main([datei, '--ziel-url', ATTRAPPE_URL, '--ziel-key', 'sb_secret_probe_000000000000']), { stoerung: mitschreiben }),
    ).rejects.toThrow(/process\.exit\(1\).*persons\.veraltet/)
    expect(gesehen).toEqual([])
  })
})
