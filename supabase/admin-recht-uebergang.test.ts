import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **E4, Schritt 1: Das Admin-Recht heißt `admin`** (8. November 2026).
 *
 * Bis Schritt 2 stehen `members.planner` und `persons.planner_vorgemerkt`
 * neben den neuen Spalten: Ältere App-Stände auf den Geräten und die Functions
 * bis zu ihrem Ausrollen lesen und schreiben die alten. Zwei Zusagen hängen
 * daran, und keine zeigt sich in einer frischen Datenbank:
 *
 *  - **Die Migration übernimmt die Werte.** Wer vorher Admin war, ist es danach
 *    — sonst verlöre die Produktion mit dem Ausrollen ihren einzigen Admin, und
 *    niemand käme mehr an Personen und Einstellungen.
 *  - **Beide Spalten bleiben gleich**, egal welche ein Client schreibt.
 *
 * Gefahren in PGlite auf dem Stand vor der Migration, mit einem Konto als Admin
 * und einer Person mit Vormerkung — dann die Migration darüber. Mit Schritt 2
 * (die alten Spalten fort) entfällt diese Probe.
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

/** Der Bestand vor der Migration: ein Admin-Konto, ein gewöhnliches, eine Person mit Vormerkung. */
const BESTAND = `
  insert into public.congregations (id, name) values ('${CONG}', 'Probe');
  insert into public.persons (id, congregation_id, fn, ln, planner_vorgemerkt) values ('${PERSON}', '${CONG}', 'Probe', 'Eins', true);
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

const konto = async (id: string) =>
  (await db.query(`select admin, planner from public.members where user_id = '${id}'`)).rows[0]
const person = async () =>
  (await db.query(`select admin_vorgemerkt, planner_vorgemerkt from public.persons where id = '${PERSON}'`)).rows[0]

describe('E4, Schritt 1 — das Admin-Recht unter neuem Namen', () => {
  it('die Migration übernimmt Recht und Vormerkung — der Admin bleibt Admin', async () => {
    expect(await konto(ADMIN)).toEqual({ admin: true, planner: true })
    expect(await konto(MITGLIED)).toEqual({ admin: false, planner: false })
    expect(await person()).toEqual({ admin_vorgemerkt: true, planner_vorgemerkt: true })
  })

  it('ist_admin() antwortet am neuen Recht, is_planner() gibt es nicht mehr', async () => {
    const frage = async (wer: string) => {
      await db.query(`select set_config('request.jwt.claim.sub', '${wer}', false)`)
      return (await db.query('select public.ist_admin() as ja')).rows[0]!.ja
    }
    expect([await frage(ADMIN), await frage(MITGLIED)]).toEqual([true, false])
    const alt = await db.query(`select count(*)::int as n from pg_proc where proname = 'is_planner'`)
    expect(alt.rows[0]!.n).toBe(0)
  })

  it('ein älterer App-Stand schreibt die alte Spalte — die neue zieht mit', async () => {
    await db.query(`update public.members set planner = true where user_id = '${MITGLIED}'`)
    expect(await konto(MITGLIED)).toEqual({ admin: true, planner: true })
    await db.query(`update public.persons set planner_vorgemerkt = false where id = '${PERSON}'`)
    expect(await person()).toEqual({ admin_vorgemerkt: false, planner_vorgemerkt: false })
  })

  it('die neue App schreibt die neue Spalte — die alte zieht mit, auch beim Anlegen', async () => {
    await db.query(`update public.members set admin = false where user_id = '${MITGLIED}'`)
    expect(await konto(MITGLIED)).toEqual({ admin: false, planner: false })
    await db.query(`update public.persons set admin_vorgemerkt = true where id = '${PERSON}'`)
    expect(await person()).toEqual({ admin_vorgemerkt: true, planner_vorgemerkt: true })

    // Anlegen: `anmelden` schreibt im Übergang je nach Stand die eine oder die andere.
    const NEU_ALT = '00000000-0000-4000-8000-0000000000d4'
    const NEU = '00000000-0000-4000-8000-0000000000e5'
    await db.query(`insert into auth.users (id) values ('${NEU_ALT}'), ('${NEU}')`)
    await db.query(`insert into public.members (user_id, congregation_id, planner) values ('${NEU_ALT}', '${CONG}', true)`)
    await db.query(`insert into public.members (user_id, congregation_id, admin) values ('${NEU}', '${CONG}', true)`)
    expect([await konto(NEU_ALT), await konto(NEU)]).toEqual([{ admin: true, planner: true }, { admin: true, planner: true }])
  })

  it('eine Änderung an etwas anderem lässt das Recht, wie es ist', async () => {
    await db.query(`update public.members set zuteiler = true where user_id = '${ADMIN}'`)
    expect(await konto(ADMIN)).toEqual({ admin: true, planner: true })
    await db.query(`update public.persons set fn = 'Probe' where id = '${PERSON}'`)
    expect(await person()).toEqual({ admin_vorgemerkt: true, planner_vorgemerkt: true })
  })
})
