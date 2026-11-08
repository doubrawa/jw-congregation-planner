import fs from 'node:fs'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerePostgres } from './pglite-postgres.mjs'
import { AUSGENOMMEN, REPO, schemaFingerabdruck, tabellenAusSchema } from './sicherung.mjs'
import { BLEIBEN, gleich, zuruecksetzbare, zuruecksetzen } from './versammlung-auf-sicherung.mjs'
import { fremdschluessel } from './zurueckspielen.mjs'

/**
 * **Eine Beta in der echten Versammlung, danach zurück auf die Sicherung.**
 *
 * Gefahren gegen ein echtes Postgres (PGlite) mit dem ganzen `schema.sql` —
 * mit allen Fremdschlüsseln, Kaskaden und Triggern, an denen der Ablauf
 * hängt: `set null` und `cascade` beim Löschen einer Gruppe oder eines Kontos,
 * `absage_vermerken` beim Einfügen einer Absage, die Prüfung der
 * Trolley-Termine, `tausch_glocke_loeschen`.
 *
 * Geurteilt wird **nicht** mit der Gegenprobe des Skripts, sondern mit einer
 * eigenen: Die Sicherung ist das Orakel, und was der Fall davon abweichen
 * lässt, steht im Test ausdrücklich da (Konto fort, Person mit Konto).
 *
 * Alle Daten sind Platzhalter (Kennungen aus Nullen, „Probe").
 */

type Zeile = Record<string, unknown>
interface Tabelle {
  name: string
  pk: string[]
}
interface Sicherung {
  erstellt: string
  projekt: string
  schema_sha256: string
  konten: { id: string; email: string }[]
  tabellen: Record<string, Zeile[]>
}
const SCHEMA = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')
const TABELLEN: Tabelle[] = tabellenAusSchema(SCHEMA)
const GESICHERT = TABELLEN.filter((t) => !(t.name in AUSGENOMMEN))
const ZURUECK = new Set(zuruecksetzbare(TABELLEN).map((t: Tabelle) => t.name))

const k = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [C, CB, H1, G1, G2] = [k(1), k(2), k(11), k(31), k(32)]
const [P1, P2, P3, P4, P5, P6, P7, PB] = [k(21), k(22), k(23), k(24), k(25), k(26), k(27), k(28)]
const [U1, U2, U3, U4] = [k(41), k(42), k(43), k(44)]
const [W1, W2, WB, WB2, FW1] = [k(51), k(52), k(53), k(54), k(55)]
const [A1, A2, A3] = [k(61), k(62), k(63)]
const [N1, N2, N3, N5] = [k(71), k(72), k(73), k(75)]
const [K1, K2, K4] = [k(81), k(82), k(84)]
const [PS2, PS4, T1] = [k(91), k(94), k(111)]

/** Der Stand, den der Betreiber sichert. */
const AUFBAU = `
insert into auth.users (id, email) values ('${U1}', 'u1@konten.invalid'), ('${U2}', 'u2@konten.invalid'), ('${U3}', 'u3@konten.invalid');
insert into public.congregations (id, name) values ('${C}', 'Probe'), ('${CB}', 'Probe Zwei');
insert into public.households (id, congregation_id) values ('${H1}', '${C}');
insert into public.persons (id, congregation_id, fn, ln, fam, priv) values
  ('${P1}', '${C}', 'Probe', 'Eins', '${H1}', '{}'),
  ('${P2}', '${C}', 'Probe', 'Zwei', null, '{"zeugnis": true}'),
  ('${P3}', '${C}', 'Probe', 'Drei', null, '{}'),
  ('${P4}', '${C}', 'Probe', 'Vier', null, '{}'),
  ('${PB}', '${CB}', 'Probe', 'Fremd', null, '{}');
insert into public.groups (id, congregation_id, name, overseer_id, position) values ('${G1}', '${C}', 'Gruppe 1', '${P1}', 0);
update public.persons set grp = '${G1}' where id in ('${P2}', '${P4}');
insert into public.services (congregation_id, key, name) values ('${C}', 'mik', 'Mikrofone');
insert into public.members (user_id, congregation_id, person_id, admin) values
  ('${U1}', '${C}', '${P1}', true), ('${U2}', '${C}', '${P2}', false), ('${U3}', '${C}', '${P3}', false);
insert into public.weeks (id, congregation_id, start, data) values
  ('${W1}', '${C}', '2099-01-05', '{"v": 1, "mid": {"teile": []}}'), ('${WB}', '${CB}', '2099-01-05', '{"v": 1}');
insert into public.absences (id, congregation_id, user_id, person_id, from_date, to_date, reason) values
  ('${A1}', '${C}', '${U2}', '${P2}', '2099-02-01', '2099-02-07', 'Urlaub'),
  ('${A3}', '${C}', '${U3}', '${P3}', '2099-03-01', '2099-03-02', '');
insert into public.notifications (id, congregation_id, user_id, title) values ('${N1}', '${C}', '${U2}', 'Probe'), ('${N3}', '${C}', '${U3}', 'Probe');
insert into public.confirmations (id, congregation_id, user_id, task_key, status) values
  ('${K1}', '${C}', '${U2}', '2099-01-05|mid|gebet', 'bestätigt'),
  ('${K4}', '${C}', '${U2}', '2099-01-05|mid|lesung', 'verhindert');
-- Die Absage zu K4 kennt die Sicherung nicht (wie von der Aufbewahrung geräumt):
-- Fügt das Zurücksetzen K4 wieder ein, legt der Trigger sie neu an, und sie muss wieder gehen.
delete from public.absagen where congregation_id = '${C}';
insert into public.push_subscriptions (id, congregation_id, user_id, endpoint, p256dh, auth) values ('${PS2}', '${C}', '${U2}', 'https://push.invalid/2', 'k', 'a');
insert into public.fs_rules (id, congregation_id, grp, wd, time) values ('r1', '${C}', '${G1}', 3, '17:00');
insert into public.fs_weeks (id, congregation_id, start, data) values ('${FW1}', '${C}', '2099-01-05', '[]');
insert into public.trolleys (id, congregation_id, name) values ('t1', '${C}', 'Trolley');
insert into public.trolley_termine (id, congregation_id, trolley_id, datum, von, bis, person_id) values ('tt1', '${C}', 't1', '2099-01-07', '10:00', '12:00', '${P2}');
insert into public.anmelde_links (person_id, congregation_id, token_hash, code_hash, gueltig_bis) values ('${P2}', '${C}', 'h2', 'c2', '2100-01-01');
`

/** Was die Beta daraus macht — Ausprobieren in der echten Versammlung. */
const BETA = `
-- Ein Konto geht, wie die App es löscht: mit der Mitgliedschaft (Trigger), und mit ihm seine Glocken.
delete from public.members where user_id = '${U3}';
-- Ein Tester kommt dazu, mit einer neuen Person; zwei weitere Personen, eine mit Anmelde-Link.
insert into auth.users (id, email) values ('${U4}', 'u4@konten.invalid');
insert into public.persons (id, congregation_id, fn, ln) values
  ('${P5}', '${C}', 'Probe', 'Fünf'), ('${P6}', '${C}', 'Probe', 'Sechs'), ('${P7}', '${C}', 'Probe', 'Sieben');
insert into public.members (user_id, congregation_id, person_id) values ('${U4}', '${C}', '${P5}');
update public.members set admin = true where user_id = '${U2}';
insert into public.anmelde_links (person_id, congregation_id, token_hash, code_hash, gueltig_bis) values ('${P7}', '${C}', 'h7', 'c7', '2100-01-01');
insert into public.push_subscriptions (id, congregation_id, user_id, endpoint, p256dh, auth) values ('${PS4}', '${C}', '${U4}', 'https://push.invalid/4', 'k', 'a');
insert into public.geraete_fehler (congregation_id, art, meldung) values ('${C}', 'fehler', 'Probe');
update public.congregations set name = 'Probe neu' where id = '${C}';
-- Eine neue Gruppe, in die eine Person und eine Treffpunkt-Regel wandern; ein anderer Aufseher.
insert into public.groups (id, congregation_id, name, position) values ('${G2}', '${C}', 'Gruppe 2', 1);
update public.persons set grp = '${G2}' where id = '${P2}';
update public.groups set overseer_id = '${P6}' where id = '${G1}';
update public.fs_rules set grp = '${G2}' where id = 'r1';
delete from public.persons where id = '${P4}';
-- Ohne Trolley-Recht kein Termin: Wer ihn zurückbringt, muss vorher das Recht zurückbringen.
delete from public.trolley_termine where id = 'tt1';
update public.persons set priv = '{}' where id = '${P2}';
update public.weeks set data = '{"v": 2, "mid": {"teile": [1]}}' where id = '${W1}';
insert into public.weeks (id, congregation_id, start, data) values ('${W2}', '${C}', '2099-01-12', '{"v": 1}');
update public.fs_weeks set data = '[{"id": "x1"}]' where id = '${FW1}';
update public.absences set reason = 'anders' where id = '${A1}';
insert into public.absences (id, congregation_id, user_id, person_id, from_date, to_date) values ('${A2}', '${C}', '${U2}', '${P2}', '2099-04-01', '2099-04-02');
insert into public.notifications (id, congregation_id, user_id, title) values ('${N2}', '${C}', '${U2}', 'Probe');
update public.confirmations set status = 'verhindert' where id = '${K1}';
delete from public.confirmations where id = '${K4}';
insert into public.confirmations (id, congregation_id, user_id, task_key, status) values ('${K2}', '${C}', '${U2}', '2099-01-12|mid|gebet', 'verhindert');
insert into public.tausch_anfragen (id, congregation_id, von_user, von_person, an_person, gibt_ab, nimmt, bis) values
  ('${T1}', '${C}', '${U2}', '${P2}', '${P1}', '2099-01-05|mid|gebet', '2099-01-12|mid|gebet', '2099-01-05');
insert into public.notifications (id, congregation_id, user_id, title, task_key) values ('${N5}', '${C}', '${U1}', 'Tausch angefragt', 'tausch|${T1}');
-- Die andere Versammlung lebt weiter — ihr Stand geht das Zurücksetzen nichts an.
insert into public.weeks (id, congregation_id, start, data) values ('${WB2}', '${CB}', '2099-01-12', '{"v": 2}');
`

/** Die Zeilen einer Tabelle, wie PostgREST sie gäbe (`json_agg` — dieselbe Form wie `select=*`), nach Schlüssel geordnet. */
async function zeilen(db: PGlite, t: Tabelle, wo = '', werte: unknown[] = []): Promise<Zeile[]> {
  const ordnung = t.pk.map((c) => `x.${c}`).join(', ')
  const { rows } = await db.query<{ z: Zeile[] }>(
    `select coalesce(json_agg(x order by ${ordnung}), '[]'::json) as z from public.${t.name} x ${wo}`,
    werte,
  )
  return rows[0]!.z
}

/** Eine Sicherung wie `sicherung.mjs`: jede Tabelle, alle Versammlungen, die Konten. */
async function sichern(db: PGlite): Promise<Sicherung> {
  const tabellen: Record<string, Zeile[]> = {}
  for (const t of GESICHERT) tabellen[t.name] = await zeilen(db, t)
  const { rows } = await db.query<{ id: string; email: string }>('select id, email from auth.users order by id')
  return { erstellt: '2026-11-08T20:00:00.000Z', projekt: 'probe', schema_sha256: schemaFingerabdruck(SCHEMA), konten: rows, tabellen }
}

/** Alles, was in der Datenbank steht — jede Tabelle und die Konten. */
async function alles(db: PGlite): Promise<Record<string, Zeile[]>> {
  const out = await sichern(db)
  return { ...out.tabellen, 'auth.users': out.konten }
}

/** Der Zugriff gegen PGlite — dieselben fünf Handgriffe wie `restZugriff`, als SQL. */
function pgliteZugriff(db: PGlite) {
  const spalte = (t: Tabelle): string => (t.name === 'congregations' ? 'id' : 'congregation_id')
  const amSchluessel = (t: Tabelle): string => t.pk.map((c) => `x.${c} = r.${c}`).join(' and ')
  return {
    lesen: (t: Tabelle, cong: string) => zeilen(db, t, `where x.${spalte(t)} = $1`, [cong]),
    async loeschen(t: Tabelle, _cong: string, weg: Zeile[]) {
      await db.query(`delete from public.${t.name} x using json_populate_recordset(null::public.${t.name}, $1::json) r where ${amSchluessel(t)}`, [
        JSON.stringify(weg),
      ])
    },
    async einfuegen(t: Tabelle, neu: Zeile[]) {
      const sp = [...new Set(neu.flatMap((z) => Object.keys(z)))].join(', ')
      await db.query(`insert into public.${t.name} (${sp}) select ${sp} from json_populate_recordset(null::public.${t.name}, $1::json)`, [
        JSON.stringify(neu),
      ])
    },
    async aendern(t: Tabelle, _cong: string, zeile: Zeile, werte: Zeile) {
      const setzen = Object.keys(werte).map((c) => `${c} = r.${c}`).join(', ')
      const schluesselWerte = Object.fromEntries(t.pk.map((c) => [c, zeile[c]]))
      await db.query(`update public.${t.name} x set ${setzen} from json_populate_record(null::public.${t.name}, $1::json) r where ${amSchluessel(t)}`, [
        JSON.stringify({ ...werte, ...schluesselWerte }),
      ])
    },
    async konten() {
      const { rows } = await db.query<{ id: string }>('select id from auth.users')
      return new Set(rows.map((r) => r.id))
    },
  }
}

const zurVersammlung = (tabelle: string, cong: string) => (z: Zeile): boolean => (tabelle === 'congregations' ? z.id === cong : z.congregation_id === cong)
const ohneStand = (z: Zeile): Zeile => Object.fromEntries(Object.entries(z).filter(([s]) => s !== 'updated_at'))
const nachId = (a: Zeile, b: Zeile): number => JSON.stringify(a).localeCompare(JSON.stringify(b))

/** Die Zeilen einer Versammlung je Tabelle, ohne `updated_at`, in fester Ordnung — so wird verglichen. */
function versammlung(stand: Record<string, Zeile[]>, cong: string, nur: (name: string) => boolean): Record<string, Zeile[]> {
  return Object.fromEntries(
    Object.entries(stand)
      .filter(([name]) => nur(name))
      .map(([name, z]) => [name, z.filter(zurVersammlung(name, cong)).map(ohneStand).sort(nachId)]),
  )
}

describe('versammlung-auf-sicherung — eine Beta in der echten Versammlung, danach zurück', () => {
  let db: PGlite
  let sicherung: Sicherung
  let vorher: Record<string, Zeile[]>
  const lauf = (trocken = false) => zuruecksetzen({ zugriff: pgliteZugriff(db), schema: SCHEMA, sicherung, cong: C, trocken })

  beforeAll(async () => {
    db = await leerePostgres([SCHEMA])
    await db.exec(AUFBAU)
    sicherung = await sichern(db)
    await db.exec(BETA)
    vorher = await alles(db)
  }, 120_000)

  it('trocken: zählt, was geschähe — und schreibt nichts', async () => {
    const erg = await lauf(true)
    expect(await alles(db)).toEqual(vorher)
    // P6 geht; P5 (Konto) und P7 (Anmelde-Link) bleiben; P4 kommt wieder.
    expect(erg.bericht.get('persons')).toMatchObject({ geloescht: 1, bleibt: 2, eingefuegt: 1 })
    expect(erg.bericht.get('notifications')).toMatchObject({ ohneKonto: 1 })
    expect(erg.abweichungen).toEqual([])
  })

  it('setzt die Versammlung zurück — Konten, Links, Push-Abos und die andere Versammlung bleiben, wie sie sind', async () => {
    const erg = await lauf()
    const nachher = await alles(db)

    // Das Orakel ist die Sicherung — mit genau den Abweichungen, die der Fall verlangt.
    const soll = versammlung(sicherung.tabellen, C, (n) => ZURUECK.has(n))
    // Das Konto U3 ist fort: seine Glocke ging mit ihm (cascade), seine Abwesenheit bleibt ohne Konto (set null).
    soll.notifications = soll.notifications!.filter((z) => z.id !== N3)
    soll.absences = soll.absences!.map((z) => (z.id === A3 ? { ...z, user_id: null } : z))
    // P5 (Konto des neuen Testers) und P7 (Anmelde-Link) bleiben, wie die Beta sie hinterließ.
    const geschuetzt = vorher.persons!.filter((z) => z.id === P5 || z.id === P7).map(ohneStand)
    soll.persons = [...soll.persons!, ...geschuetzt].sort(nachId)
    expect(versammlung(nachher, C, (n) => ZURUECK.has(n))).toEqual(soll)

    // Was bleibt, bleibt: Konten, Mitgliedschaften (auch das geänderte Recht), Links, Push, Fehlermeldungen.
    const bleibt = (n: string): boolean => n in BLEIBEN
    expect(versammlung(nachher, C, bleibt)).toEqual(versammlung(vorher, C, bleibt))
    expect(nachher['auth.users']).toEqual(vorher['auth.users'])
    // Die andere Versammlung ist unberührt — auch ihre Woche aus der Beta.
    expect(versammlung(nachher, CB, () => true)).toEqual(versammlung(vorher, CB, () => true))

    expect(erg.abweichungen).toEqual([])
    expect(erg.mitglieder).toEqual({ gleich: 1, dazu: 1, anders: 1, fort: 1 })
    // Die Treffpunkt-Regel ging mit der neuen Gruppe (cascade) und kam aus der Sicherung wieder.
    expect(nachher.fs_rules!.filter(zurVersammlung('fs_rules', C))).toEqual([expect.objectContaining({ id: 'r1', grp: G1 })])
    // Personen ohne Gruppe kamen zurück in ihre (der Ring persons.grp ↔ groups).
    expect(erg.bericht.get('persons')!.nachgetragen).toBe(2)
  })

  it('ein zweiter Lauf hat nichts mehr zu tun', async () => {
    const vorZweitem = await alles(db)
    const erg = await lauf()
    for (const [name, b] of erg.bericht) {
      expect({ name, ...b }).toMatchObject({ name, geloescht: 0, eingefuegt: 0, geaendert: 0, nachgetragen: 0 })
    }
    expect(erg.abweichungen).toEqual([])
    expect(versammlung(await alles(db), C, () => true)).toEqual(versammlung(vorZweitem, C, () => true))
  })
})

describe('versammlung-auf-sicherung — Kinder vor Eltern', () => {
  it('löscht von hinten nach vorn: ein Verweis ohne Kaskade hielte sonst die Eltern fest', async () => {
    /*
     * In `schema.sql` löscht heute jeder Verweis mit (`cascade`, `set null`) —
     * dort ginge auch die falsche Reihenfolge noch auf. Ein Verweis ohne Regel
     * (`no action`) verbietet es, die Eltern vor den Kindern zu löschen; das
     * hält dieser kleine Ausschnitt fest.
     */
    const schema = [
      'create table if not exists public.congregations (id uuid primary key, name text not null);',
      'create table if not exists public.eltern (id uuid primary key, congregation_id uuid not null references public.congregations (id) on delete cascade);',
      'create table if not exists public.kinder (id uuid primary key, congregation_id uuid not null references public.congregations (id) on delete cascade, eltern_id uuid references public.eltern (id));',
    ].join('\n')
    const db = await leerePostgres([schema])
    await db.exec(`insert into public.congregations values ('${C}', 'Probe');`)
    const sicherung = { erstellt: '', projekt: 'probe', konten: [], tabellen: { congregations: [{ id: C, name: 'Probe' }], eltern: [], kinder: [] } }
    await db.exec(`insert into public.eltern values ('${k(901)}', '${C}'); insert into public.kinder values ('${k(902)}', '${C}', '${k(901)}');`)
    const erg = await zuruecksetzen({ zugriff: pgliteZugriff(db), schema, sicherung, cong: C })
    expect(erg.abweichungen).toEqual([])
    const { rows } = await db.query<{ e: number; k: number }>('select (select count(*) from public.eltern)::int as e, (select count(*) from public.kinder)::int as k')
    expect(rows[0]).toEqual({ e: 0, k: 0 })
  })
})

describe('versammlung-auf-sicherung — was zurückgeht und was bleibt', () => {
  it('jede Tabelle in BLEIBEN gibt es in schema.sql, und jede hat einen Grund', () => {
    const namen = new Set(TABELLEN.map((t) => t.name))
    expect(Object.keys(BLEIBEN).filter((n) => !namen.has(n))).toEqual([])
    expect(Object.values(BLEIBEN).filter((g) => String(g).length < 40)).toEqual([])
  })

  it('Stolperdraht: was am Konto hängt und trotzdem zurückgeht, ist entschieden — eine neue Tabelle mit Konto nicht', () => {
    /*
     * Diese Tabellen zeigen auf `auth.users` und gehen trotzdem auf die
     * Sicherung zurück: Sie sind Planung, die ein Konto berührt hat —
     * Abwesenheiten, Glocken, Zusagen, Tausch-Anfragen, „Nein, danke",
     * Erinnerungs- und Versand-Tagebuch. Was in der Beta dort entstand, ist
     * Ausprobieren. Eine neue Tabelle mit Konto fällt hier auf, bis jemand
     * entschieden hat: Planung (hier eintragen) oder Konto (`BLEIBEN`).
     */
    const mitKonto = fremdschluessel(SCHEMA)
      .filter((f: { schema: string; ziel: string; tabelle: string }) => f.schema === 'auth' && f.ziel === 'users' && ZURUECK.has(f.tabelle))
      .map((f: { tabelle: string }) => f.tabelle)
    expect([...new Set(mitKonto)].sort()).toEqual(
      ['abgelehnte_gesuche', 'absences', 'assignment_log', 'confirmations', 'notifications', 'reminder_log', 'tausch_anfragen'].sort(),
    )
  })

  it('gleich: jsonb unabhängig von der Reihenfolge der Schlüssel, sonst genau', () => {
    expect(gleich({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(gleich({ a: 1 }, { a: 1, b: null })).toBe(false)
    expect(gleich([1, 2], [2, 1])).toBe(false)
    expect(gleich('1', 1)).toBe(false)
    expect(gleich(null, {})).toBe(false)
  })
})
