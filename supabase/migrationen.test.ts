import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
 * Richtlinien und Rechte. Nur deshalb darf die Doppelung wieder existieren.
 *
 * **Verglichen werden Kataloge, nicht Texte.** Die erste Migration ist der
 * Gesamtstand *ohne* die Einmal-Aufräumblöcke (Spalten, die aus einer
 * bestehenden Datenbank weichen sollten und in einer frischen nichts zu tun
 * haben) — die beiden Dateien sind also absichtlich nicht gleich. Gleich sein
 * muss, was am Ende in der Datenbank steht.
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

/**
 * **Je Abschnitt des Katalogs eine Abfrage** — und damit nur eine Liste, nicht
 * zwei: Verglichen wird, was hier steht (`ABSCHNITTE` leitet sich daraus ab).
 * Eine neunte Abfrage ist von selbst im Vergleich; eine zweite, von Hand
 * gepflegte Liste hätte sie vergessen können, und der neue Abschnitt wäre
 * stillschweigend ungeprüft geblieben.
 *
 * Gefragt wird `pg_catalog`, nicht `information_schema`, wo es genauer ist:
 * Die Rechte stehen dort als ACL am Objekt (`relacl`, `attacl`, `proacl`) und
 * nennen damit auch die **Spaltenrechte**, auf denen in diesem Projekt der
 * Schutz der Abwesenheitsgründe und der Link-Prüfsummen beruht.
 */
const ABFRAGEN = {
  tabellen: `
    select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    order by c.relname`,
  spalten: `
    select c.relname as tabelle, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as typ,
           a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) as vorgabe, a.attacl::text
    from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`,
  bedingungen: `
    select conrelid::regclass::text as tabelle, conname, contype, pg_get_constraintdef(oid) as def
    from pg_constraint where connamespace = 'public'::regnamespace
    order by conrelid::regclass::text, conname`,
  indizes: `
    select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'
    order by tablename, indexname`,
  funktionen: `
    select p.proname, pg_get_function_identity_arguments(p.oid) as parameter,
           pg_get_function_result(p.oid) as ergebnis, p.prosecdef, p.provolatile,
           p.proconfig::text, p.proacl::text, l.lanname, md5(p.prosrc) as rumpf
    from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
    order by p.proname, pg_get_function_identity_arguments(p.oid)`,
  trigger: `
    select tgrelid::regclass::text as tabelle, tgname, pg_get_triggerdef(oid) as def
    from pg_trigger
    where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
    order by tgrelid::regclass::text, tgname`,
  richtlinien: `
    select tablename, policyname, cmd, permissive, roles::text, qual, with_check
    from pg_policies where schemaname = 'public'
    order by tablename, policyname`,
  sequenzen: `
    select c.relname, s.seqtypid::regtype::text as typ, s.seqstart, s.seqincrement
    from pg_sequence s join pg_class c on c.oid = s.seqrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' order by c.relname`,
}

type Abschnitt = keyof typeof ABFRAGEN
type Katalog = Record<Abschnitt, Zeile[]>
type Zeile = Record<string, unknown>
const ABSCHNITTE = Object.keys(ABFRAGEN) as Abschnitt[]

/** Der Katalog einer Datenbank: jede Abfrage aus `ABFRAGEN`, der Reihe nach. */
async function katalog(db: { query: (sql: string) => Promise<{ rows: unknown[] }> }): Promise<Katalog> {
  const out = {} as Katalog
  for (const abschnitt of ABSCHNITTE) out[abschnitt] = (await db.query(ABFRAGEN[abschnitt])).rows as Zeile[]
  return out
}

let ausSchema: Katalog
let ausMigrationen: Katalog
/** Derselbe Gesamtstand, aber heimlich verändert — die Gegenprobe. */
let gestoert: Katalog
/** Die drei Datenbanken — zum Schließen, siehe `afterAll`. */
let datenbanken: { close: () => Promise<void> }[] = []

beforeAll(async () => {
  const migrationen = migrationsDateien().map((f) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
  /*
   * Die Störung der Gegenprobe trifft drei Abschnitte auf einmal: eine Spalte,
   * die es nur hier gibt, eine aufgeweichte Richtlinie und ein entzogenes
   * Recht. Ohne sie bestünde die Probe auch dann, wenn `katalog()` an der
   * falschen Stelle fragte und überall leere Listen zurückkäme.
   */
  const STOERUNG = `
    alter table public.persons add column probe_spalte text;
    alter policy persons_select on public.persons using (true);
    revoke select on public.weeks from authenticated;
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
    // grün — die Zahlen darüber fangen nur die acht, die hier genannt sind.
    expect(ABSCHNITTE.filter((a) => ausSchema[a].length === 0)).toEqual([])
  })

  it.each(ABSCHNITTE)('%s sind gleich', (abschnitt) => {
    expect(ausMigrationen[abschnitt]).toEqual(ausSchema[abschnitt])
  })

  it.each(['spalten', 'richtlinien', 'tabellen'] as const)('Gegenprobe: eine Änderung an %s fällt auf', (abschnitt) => {
    // **Gegen die Migrationen verglichen, nicht gegen sich selbst.** Genau so
    // liefe der Vergleich oben, stünde die Störung in `schema.sql`: eine
    // Spalte, eine Richtlinie, ein Recht nur dort — und der Abschnitt wird rot.
    expect(gestoert[abschnitt]).not.toEqual(ausMigrationen[abschnitt])
    expect(gestoert[abschnitt]).not.toEqual(ausSchema[abschnitt])
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
  })
})
