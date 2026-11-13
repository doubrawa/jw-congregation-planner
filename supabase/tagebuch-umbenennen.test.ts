import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Das Versand-Tagebuch folgt einer Umbenennung** (13.11.2026) — gegen eine
 * echte Postgres gemessen.
 *
 * `assignment_log` führt je Platz und **Name**, wer schon Bescheid weiß, und
 * jeder Leser fragt so: „Plan senden", die Erinnerungen, der Haken „persönlich
 * Bescheid gesagt", die App. Wurde jemand umbenannt — eine Heirat, ein
 * berichtigter Tippfehler —, stand er unter dem alten Namen im Tagebuch: Seine
 * gemeldeten, noch unbestätigten Plätze galten wieder als ungemeldet, und das
 * nächste „Plan senden" schickte ihm dieselbe Nachricht ein zweites Mal.
 *
 * Der Trigger `persons_tagebuch_umbenennen` zieht den Namen nach. Gemessen wird
 * als Admin über die Richtlinien, wie die App umbenennt: Das Tagebuch darf kein
 * Konto schreiben — der Trigger muss es trotzdem können, und nur er.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')

const A = '00000000-0000-4000-8000-0000000000a1' // die Versammlung
const B = '00000000-0000-4000-8000-0000000000b1' // eine andere, mit einer Namensvetterin
const ADMIN_A = '00000000-0000-4000-8000-00000000a001'
const ANNA = '00000000-0000-4000-8000-0000000000e1'
const BERND = '00000000-0000-4000-8000-0000000000e2'
const ANNA_IN_B = '00000000-0000-4000-8000-0000000000e3'

const PLATZ_1 = '2026-11-23|mid|helper|mikro|0'
const PLATZ_2 = '2026-11-30|we|helper|mikro|1'

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}
let db: DB

/** Etwas als dieses Konto tun — Rolle und Anspruch wie bei PostgREST. */
async function als<T>(konto: string, tun: () => Promise<T>): Promise<T> {
  await db.exec(`set role postgres`)
  await db.exec(`set request.jwt.claim.sub = '${konto}'`)
  await db.exec(`set role authenticated`)
  try {
    return await tun()
  } finally {
    await db.exec('set role postgres')
  }
}

/** Eine Zeile ins Tagebuch — als Service-Role, wie `send-plan`. */
async function gemeldet(cong: string, platz: string, name: string, person: string | null, wann = '2026-11-10T08:00:00Z'): Promise<void> {
  await db.query(
    `insert into public.assignment_log (congregation_id, task_key, name, person_id, sent_at) values ($1, $2, $3, $4, $5)`,
    [cong, platz, name, person, wann],
  )
}

/** Das Tagebuch einer Versammlung, lesbar geordnet: „Platz · Name · Person". */
async function tagebuch(cong = A): Promise<string[]> {
  const { rows } = await db.query(
    `select task_key, name, person_id from public.assignment_log where congregation_id = $1 order by task_key, name`,
    [cong],
  )
  const wer: Record<string, string> = { [ANNA]: 'Anna', [BERND]: 'Bernd', [ANNA_IN_B]: 'Anna in B' }
  return rows.map((r) => `${String(r.task_key)} · ${String(r.name)} · ${r.person_id ? wer[String(r.person_id)] : 'ohne Person'}`)
}

/** Umbenennen, wie die App es tut: der Admin ändert nur die Namensspalten. */
const umbenennen = (id: string, fn: string, ln: string) =>
  als(ADMIN_A, () => db.query(`update public.persons set fn = $2, ln = $3 where id = $1`, [id, fn, ln]))

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
  await db.query(`insert into auth.users (id, email) values ($1, 'a1@konten.invalid')`, [ADMIN_A])
  await db.query(`insert into public.congregations (id, name) values ($1, 'A'), ($2, 'B')`, [A, B])
  await db.query(`insert into public.members (user_id, congregation_id, admin, zuteiler) values ($1, $2, true, true)`, [ADMIN_A, A])
}, 300_000)

beforeEach(async () => {
  await db.exec('set role postgres')
  await db.exec('delete from public.assignment_log; delete from public.persons;')
  await db.query(
    `insert into public.persons (id, congregation_id, fn, ln) values ($1, $4, 'Anna', 'Müller'), ($2, $4, 'Bernd', 'Klein'), ($3, $5, 'Anna', 'Müller')`,
    [ANNA, BERND, ANNA_IN_B, A, B],
  )
})

afterAll(async () => {
  await db?.close()
})

describe('Eine Person wird umbenannt', () => {
  it('ihre Zeilen im Tagebuch tragen danach den neuen Namen — die der anderen bleiben', async () => {
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA)
    await gemeldet(A, PLATZ_2, 'Anna Müller', ANNA)
    await gemeldet(A, PLATZ_2.replace('|1', '|0'), 'Bernd Klein', BERND)
    await umbenennen(ANNA, 'Anna', 'Schmidt')
    expect(await tagebuch()).toEqual([
      `${PLATZ_2.replace('|1', '|0')} · Bernd Klein · Bernd`,
      `${PLATZ_1} · Anna Schmidt · Anna`,
      `${PLATZ_2} · Anna Schmidt · Anna`,
    ].sort())
  })

  it('auch nur der Vorname zählt, und mehrfache Leerzeichen am Rand nicht', async () => {
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA)
    await umbenennen(ANNA, ' Anna-Lena', 'Müller ')
    expect(await tagebuch()).toEqual([`${PLATZ_1} · Anna-Lena Müller · Anna`])
  })

  it('die Namensvetterin einer anderen Versammlung behält ihre Zeilen', async () => {
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA)
    await gemeldet(B, PLATZ_1, 'Anna Müller', ANNA_IN_B)
    await umbenennen(ANNA, 'Anna', 'Schmidt')
    expect(await tagebuch(B)).toEqual([`${PLATZ_1} · Anna Müller · Anna in B`])
  })

  it('eine Zeile ohne Person unter dem alten Namen gehört ihr — sie zieht mit und trägt danach die Person', async () => {
    // So stehen Zeilen da, die ein Wartungsskript ohne Person-Id geschrieben
    // hat: Zugeordnet werden sie überall über den Namen.
    await gemeldet(A, PLATZ_1, 'Anna Müller', null)
    await umbenennen(ANNA, 'Anna', 'Schmidt')
    expect(await tagebuch()).toEqual([`${PLATZ_1} · Anna Schmidt · Anna`])
  })

  it('wer sonst etwas an der Person ändert, fasst das Tagebuch nicht an', async () => {
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA)
    const vorher = await db.query(`select xmin::text as stand from public.assignment_log`)
    await als(ADMIN_A, () => db.query(`update public.persons set role = 'aeltester', female = true where id = $1`, [ANNA]))
    // Auch ein Speichern der ganzen Zeile mit demselben Namen ist keine Umbenennung.
    await als(ADMIN_A, () => db.query(`update public.persons set fn = 'Anna', ln = 'Müller' where id = $1`, [ANNA]))
    const nachher = await db.query(`select xmin::text as stand from public.assignment_log`)
    expect(nachher.rows).toEqual(vorher.rows)
    expect(await tagebuch()).toEqual([`${PLATZ_1} · Anna Müller · Anna`])
  })
})

describe('Was an der Eindeutigkeit (Platz, Name) scheitern würde', () => {
  it('zwei eigene Zeilen zum selben Platz — unter dem alten und einem noch älteren Namen — werden eine, die jüngste', async () => {
    // Vor dem Trigger umbenannt und danach noch einmal gemeldet: beide Zeilen gehören ihr.
    await gemeldet(A, PLATZ_1, 'Anna Meier', ANNA, '2026-11-01T08:00:00Z')
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA, '2026-11-10T08:00:00Z')
    await umbenennen(ANNA, 'Anna', 'Schmidt')
    expect(await tagebuch()).toEqual([`${PLATZ_1} · Anna Schmidt · Anna`])
    const { rows } = await db.query(`select sent_at from public.assignment_log`)
    expect(new Date(String(rows[0]!.sent_at)).toISOString()).toBe('2026-11-10T08:00:00.000Z')
  })

  it('stand an ihrem Platz schon jemand unter dem neuen Namen, weicht dessen Zeile — die Umbenennung gelingt', async () => {
    // Eine frühere „Anna Schmidt", längst entfernt: Ihre Zeile blieb ohne Person stehen.
    await gemeldet(A, PLATZ_1, 'Anna Schmidt', null, '2026-10-01T08:00:00Z')
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA)
    await gemeldet(A, PLATZ_2, 'Anna Schmidt', null, '2026-10-01T08:00:00Z')
    await umbenennen(ANNA, 'Anna', 'Schmidt')
    expect(await tagebuch()).toEqual([
      `${PLATZ_1} · Anna Schmidt · Anna`,
      // An einem Platz ohne eigene Zeile bleibt die fremde, wie sie war.
      `${PLATZ_2} · Anna Schmidt · ohne Person`,
    ])
    const { rows } = await db.query(`select fn, ln from public.persons where id = $1`, [ANNA])
    expect(rows[0]).toEqual({ fn: 'Anna', ln: 'Schmidt' })
  })
})

describe('Die Gegenprobe', () => {
  it('ohne den Trigger bliebe der alte Name stehen — und kein Konto schreibt das Tagebuch selbst', async () => {
    await gemeldet(A, PLATZ_1, 'Anna Müller', ANNA)
    await db.exec('alter table public.persons disable trigger persons_tagebuch_umbenennen')
    try {
      await umbenennen(ANNA, 'Anna', 'Schmidt')
      expect(await tagebuch()).toEqual([`${PLATZ_1} · Anna Müller · Anna`])
    } finally {
      await db.exec('set role postgres')
      await db.exec('alter table public.persons enable trigger persons_tagebuch_umbenennen')
    }
    // Der Admin selbst kommt an die Zeile nicht heran: Nur der Trigger darf.
    const geaendert = await als(ADMIN_A, async () => {
      try {
        const { rows } = await db.query(`update public.assignment_log set name = 'gefälscht' returning id`)
        return rows.length
      } catch {
        return 0
      }
    })
    expect(geaendert).toBe(0)
    expect(await tagebuch()).toEqual([`${PLATZ_1} · Anna Müller · Anna`])
  })
})
