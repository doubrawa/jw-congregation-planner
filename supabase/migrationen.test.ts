import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ABSCHNITTE, katalog as katalogVon, katalogVergleich } from '../scripts/katalog.mjs'
import { leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Zwei Wege in dieselbe Datenbank — und die Probe, die sie gleich hält.**
 *
 * `supabase/schema.sql` ist der Gesamtstand; daneben steht seit T169 eine Folge
 * von Migrationen (`supabase/migrations/`), die die Supabase-CLI einspielt und
 * sich merkt. Genau diese Doppelung hat das Projekt am 17. September 2026
 * schon einmal abgeschafft: Eine Kette von 25 Migrationen lief neben
 * `schema.sql` her, jede versicherte im Kopf „Neuinstallationen brauchen diese
 * Datei nicht", und drei Tabellen fehlten im Gesamtstand monatelang
 * (`fs_rules`, `fs_weeks`, `reminder_log`). Gemerkt hat es niemand, weil
 * niemand die beiden Wege gegeneinander gehalten hat.
 *
 * Diese Probe tut das: Sie spielt **beide** in je eine leere Postgres 16
 * (PGlite, im Prozess) und vergleicht die Kataloge — Tabellen, Spalten samt
 * Typ und Vorgabe, Bedingungen, Indizes, Funktionen samt Rumpf, Trigger,
 * Richtlinien, Sequenzen, Rechte und Kommentare (`scripts/katalog.mjs`). Nur
 * deshalb darf die Doppelung wieder existieren.
 *
 * **Verglichen werden Kataloge, nicht Texte.** `schema.sql` nimmt jede
 * spätere Migration in sich auf, die erste bleibt der Stand ihres Tages, und
 * eine Migration darf aufräumen, was eine frische Datenbank nie hatte
 * (`20261107195500_persons-altlasten.sql`). Gleich sein muss, was am Ende in
 * der Datenbank steht.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')
const MIGRATIONS = path.join(hier, 'migrations')

/** Die Migrationen in der Reihenfolge, in der die CLI sie einspielt. */
function migrationsDateien(ordner = MIGRATIONS): string[] {
  return fs
    .readdirSync(ordner)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/*
 * Die Abfragen je Abschnitt stehen in `scripts/katalog.mjs` — dieselben, mit
 * denen `ausrollen-pruefen.mjs` die Produktion gegen die Migrationen hält.
 * Ein neuer Abschnitt dort ist von selbst auch hier im Vergleich.
 */
type Zeile = Record<string, unknown>
type Katalog = Record<string, Zeile[]>

const katalog = (db: { query: (sql: string) => Promise<{ rows: unknown[] }> }): Promise<Katalog> =>
  katalogVon(db) as Promise<Katalog>

let ausSchema: Katalog
let ausMigrationen: Katalog
/** Derselbe Gesamtstand, aber heimlich verändert — die Gegenprobe. */
let gestoert: Katalog
/** Die drei Datenbanken — zum Schließen, siehe `afterAll`. */
let datenbanken: { close: () => Promise<void> }[] = []

beforeAll(async () => {
  const migrationen = migrationsDateien().map((f) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
  /*
   * Die Störung der Gegenprobe trifft vier Abschnitte auf einmal: eine Spalte,
   * die es nur hier gibt, eine aufgeweichte Richtlinie, ein entzogenes Recht
   * und ein Kommentar. Ohne sie bestünde die Probe auch dann, wenn `katalog()`
   * an der falschen Stelle fragte und überall leere Listen zurückkäme.
   */
  const STOERUNG = `
    alter table public.persons add column probe_spalte text;
    alter policy persons_select on public.persons using (true);
    revoke select on public.weeks from authenticated;
    comment on column public.persons.role is 'Probe';
  `
  datenbanken = await Promise.all([leerePostgres([SCHEMA]), leerePostgres(migrationen), leerePostgres([SCHEMA, STOERUNG])])
  const [a, b, c] = datenbanken as unknown as { query: (sql: string) => Promise<{ rows: unknown[] }> }[]
  ;[ausSchema, ausMigrationen, gestoert] = await Promise.all([katalog(a!), katalog(b!), katalog(c!)])
}, 300_000)

/**
 * **Die drei Postgres wieder schließen.** Jede hält eine eigene
 * WebAssembly-Instanz im Speicher, und vitest gibt einen Worker nach der
 * Testdatei nicht frei, sondern nimmt ihn für die nächste — ohne das hier
 * trüge er drei Datenbanken durch den restlichen Lauf.
 */
afterAll(async () => {
  await Promise.all(datenbanken.map((db) => db.close()))
  datenbanken = []
})

describe('schema.sql und die Migrationen ergeben dieselbe Datenbank', () => {
  it('die Migrationen heißen, wie die CLI es erwartet', () => {
    const dateien = migrationsDateien()
    expect(dateien.length, 'keine Migration gefunden').toBeGreaterThan(0)
    // `<zeitstempel>_<name>.sql` — die CLI spielt sie in dieser Ordnung ein
    // und merkt sich den Zeitstempel. Ein anderer Name fiele still heraus.
    for (const f of dateien) expect(f).toMatch(/^\d{14}_[a-z0-9_-]+\.sql$/)
    // Dass die Namensordnung die zeitliche ist, ist die ganze Zusage des
    // Formats — und sie gilt nur, solange alle Zeitstempel gleich lang sind.
    // (Zu prüfen, dass eine sortierte Liste sortiert ist, prüfte nichts.)
    const stempel = dateien.map((f) => Number(f.slice(0, 14)))
    expect(stempel).toEqual([...stempel].sort((x, y) => x - y))
    expect(new Set(stempel).size, 'zwei Migrationen mit demselben Zeitstempel').toBe(stempel.length)
  })

  it('die Probe greift überhaupt', () => {
    // Fragte `katalog()` ins Leere, wären alle Abschnitte beidseitig leer und
    // jeder Vergleich grün. Die Zahlen sind Untergrenzen, keine Zusagen.
    expect(ausSchema.tabellen.length).toBeGreaterThan(25)
    expect(ausSchema.spalten.length).toBeGreaterThan(200)
    expect(ausSchema.richtlinien.length).toBeGreaterThan(50)
    expect(ausSchema.funktionen.length).toBeGreaterThan(10)
    expect(ausSchema.trigger.length).toBeGreaterThan(5)
    expect(ausSchema.indizes.length).toBeGreaterThan(30)
    expect(ausSchema.bedingungen.length).toBeGreaterThan(80)
    // Die Spaltenrechte sind der Grund, `pg_attribute.attacl` zu fragen:
    // Darauf beruht, dass niemand den Grund einer Abwesenheit mitliest.
    expect(ausSchema.spalten.filter((s) => s.attacl).length).toBeGreaterThan(5)
    // Und keine Abfrage läuft ins Leere: Eine, die nichts findet (vertippter
    // Schemaname, falscher `relkind`), wäre beidseitig leer und damit still
    // grün — die Zahlen darüber fangen nur die, die hier genannt sind.
    expect(ABSCHNITTE.filter((a) => ausSchema[a]!.length === 0)).toEqual([])
  })

  /**
   * Verglichen wie gegen die Produktion (`katalogVergleich`): Zeile für Zeile
   * nach Namen, ohne die Stelle einer Spalte. Eine Migration hängt eine neue
   * Spalte hinten an, eine entfernte lässt eine Lücke in der Zählung —
   * `schema.sql` nennt sie, wo sie hingehört. Bis E4 (8.11.2026) legte keine
   * Migration eine Spalte an, und der Vergleich der rohen Listen fiel nicht auf.
   */
  const unterschiede = (links: Katalog, rechts: Katalog, abschnitt: string) =>
    katalogVergleich({ [abschnitt]: links[abschnitt] }, { [abschnitt]: rechts[abschnitt] })

  it.each(ABSCHNITTE)('%s sind gleich', (abschnitt) => {
    expect(unterschiede(ausMigrationen, ausSchema, abschnitt)).toEqual([])
  })

  it.each(['spalten', 'richtlinien', 'tabellen', 'kommentare'] as const)('Gegenprobe: eine Änderung an %s fällt auf', (abschnitt) => {
    // **Gegen die Migrationen verglichen, nicht gegen sich selbst.** Genau so
    // liefe der Vergleich oben, stünde die Störung in `schema.sql`: eine
    // Spalte, eine Richtlinie, ein Recht nur dort — und der Abschnitt wird rot.
    expect(unterschiede(gestoert, ausMigrationen, abschnitt)).not.toEqual([])
    expect(unterschiede(gestoert, ausSchema, abschnitt)).not.toEqual([])
  })

  it('die Gegenprobe nennt genau das, was gestört wurde', () => {
    // Nicht nur „irgendwas ist anders": Eine Störung, die zufällig an einer
    // anderen Stelle auffiele, wäre kein Beweis für den Abschnitt.
    // Tabelle **und** Spalte: Über den bloßen Namen fiele eine Störspalte
    // nicht auf, die anderswo schon so heißt (`person_id`, `congregation_id`).
    const spalte = (s: Zeile): string => `${String(s.tabelle)}.${String(s.attname)}`
    const alt = new Set(ausSchema.spalten.map(spalte))
    expect(gestoert.spalten.map(spalte).filter((n) => !alt.has(n))).toEqual(['persons.probe_spalte'])
    const regel = (k: Katalog): unknown =>
      k.richtlinien.find((r) => r.tablename === 'persons' && r.policyname === 'persons_select')?.qual
    expect(regel(gestoert)).toBe('true')
    expect(regel(ausSchema)).not.toBe('true')
    const recht = (k: Katalog): unknown => k.tabellen.find((t) => t.relname === 'weeks')?.relacl
    expect(recht(ausSchema)).toContain('authenticated=')
    expect(recht(gestoert)).not.toBe(recht(ausSchema))
    const kommentar = (k: Katalog): unknown => k.kommentare.find((c) => c.objekt === 'persons' && c.spalte === 'role')?.kommentar
    expect(kommentar(gestoert)).toBe('Probe')
    expect(kommentar(ausSchema)).toBeUndefined()
  })
})
