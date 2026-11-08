import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **E4: Das Admin-Recht heißt `admin` — und keiner verliert es auf dem Weg**
 * (8. November 2026).
 *
 * Bis E4 hieß das Recht `members.planner`, die Vormerkung
 * `persons.planner_vorgemerkt`. Zwei Migrationen benennen um: Schritt 1 legt
 * die neuen Spalten daneben und übernimmt die Werte, Schritt 2 entfernt die
 * alten. Die Zusage, die keine frische Datenbank zeigt: **Wer vorher Admin war,
 * ist es danach** — sonst verlöre die Produktion mit dem Ausrollen ihren
 * einzigen Admin, und niemand käme mehr an Personen und Einstellungen.
 *
 * Gefahren in PGlite auf dem Stand vor E4, mit einem Konto als Admin und einer
 * Person mit Vormerkung — dann beide Migrationen darüber.
 */

const hier = import.meta.dirname
const MIGRATIONS = path.join(hier, 'migrations')
const E4 = '20261108150000_admin-recht.sql'
const dateien = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
const lesen = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')

const CONG = '00000000-0000-4000-8000-000000000001'
const ADMIN = '00000000-0000-4000-8000-0000000000a1'
const MITGLIED = '00000000-0000-4000-8000-0000000000b2'
const PERSON = '00000000-0000-4000-8000-0000000000c3'
const OHNE = '00000000-0000-4000-8000-0000000000c4'

/** Der Bestand vor E4: ein Admin-Konto, ein gewöhnliches, eine Person mit Vormerkung und eine ohne. */
const BESTAND = `
  insert into public.congregations (id, name) values ('${CONG}', 'Probe');
  insert into public.persons (id, congregation_id, fn, ln, planner_vorgemerkt)
    values ('${PERSON}', '${CONG}', 'Probe', 'Eins', true), ('${OHNE}', '${CONG}', 'Probe', 'Zwei', false);
  insert into auth.users (id) values ('${ADMIN}'), ('${MITGLIED}');
  insert into public.members (user_id, congregation_id, planner) values ('${ADMIN}', '${CONG}', true), ('${MITGLIED}', '${CONG}', false);
`

type Db = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> }
let db: Db

beforeAll(async () => {
  const vorher = dateien.filter((f) => f < E4).map(lesen)
  const danach = dateien.filter((f) => f >= E4).map(lesen)
  db = (await leerePostgres([...vorher, BESTAND, ...danach])) as unknown as Db
}, 300_000)

afterAll(async () => {
  await db?.close()
})

describe('E4 — das Admin-Recht unter neuem Namen', () => {
  it('beide Migrationen laufen über einen Bestand von vorher, und das Recht bleibt, wo es war', async () => {
    const konten = await db.query(`select user_id, admin from public.members order by user_id`)
    expect(konten.rows).toEqual([{ user_id: ADMIN, admin: true }, { user_id: MITGLIED, admin: false }])
    const personen = await db.query(`select id, admin_vorgemerkt from public.persons order by id`)
    expect(personen.rows).toEqual([{ id: PERSON, admin_vorgemerkt: true }, { id: OHNE, admin_vorgemerkt: false }])
  })

  it('die alten Namen sind fort — Spalten, Trigger, is_planner()', async () => {
    const spalten = await db.query(`
      select table_name || '.' || column_name as spalte from information_schema.columns
       where table_schema = 'public' and column_name in ('planner', 'planner_vorgemerkt')`)
    expect(spalten.rows).toEqual([])
    const funktionen = await db.query(`
      select proname from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('is_planner', 'admin_recht_angleichen', 'admin_vormerkung_angleichen')`)
    expect(funktionen.rows).toEqual([])
  })

  it('ist_admin() antwortet am neuen Recht', async () => {
    const frage = async (wer: string) => {
      await db.query(`select set_config('request.jwt.claim.sub', '${wer}', false)`)
      return (await db.query('select public.ist_admin() as ja')).rows[0]!.ja
    }
    expect([await frage(ADMIN), await frage(MITGLIED)]).toEqual([true, false])
  })
})
