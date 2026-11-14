import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Eine Absage und was an ihr hängt** (Gesamt-Review 14.11.2026) — zwei
 * Trigger an `confirmations`, gegen eine echte Postgres gemessen.
 *
 * 1. **Seit wann die Absage gilt** (`absage_vermerken`, `absagen.created_at`):
 *    Daran erkennt die Function `substitute` (Aufruf 'absage'), ob sie eine
 *    Absage schon gemeldet hat — ohne das schickte jeder Aufruf allen, die
 *    planen, denselben Push noch einmal. Eine neue Absage muss die Zeit neu
 *    setzen, auch wenn die Zeile von einer früheren derselben Person noch
 *    steht; dieselbe Absage noch einmal geschrieben darf es nicht.
 * 2. **Ein Ersatzgesuch endet mit seiner Absage** (`ersatzgesuch_beenden`):
 *    „Ersatz gesucht" blieb in den Glocken stehen, wenn der Planer einen
 *    abgesagten Hilfsdienst neu besetzte — wer darauf tippte, fand nichts.
 *    Gemessen als Planer über die Richtlinien, wie die App die Zusage beim
 *    Umbesetzen löscht: Die Zeilen stehen in fremden Glocken, an die kein
 *    Konto herankommt — der Trigger muss es trotzdem können.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')

const A = '00000000-0000-4000-8000-0000000000a1' // die Versammlung
const PLANER = '00000000-0000-4000-8000-00000000a001' // teilt zu, ist nicht Admin
const ANNA_KONTO = '00000000-0000-4000-8000-00000000a002'
const BERND_KONTO = '00000000-0000-4000-8000-00000000a003'
const ANNA = '00000000-0000-4000-8000-0000000000e1'
const BERND = '00000000-0000-4000-8000-0000000000e2'

const MIKRO = '2026-11-23|mid|helper|mikro|0' // Annas Hilfsdienst
const MIKRO_2 = '2026-11-23|mid|helper|mikro|1' // ein anderer Platz desselben Dienstes
const LESUNG = '2026-11-23|mid|part|k3|0'

const LANGE_HER = '2026-01-01 00:00:00+00'

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

/** Die Zusage eines Kontos setzen, wie die App es tut (Upsert auf Versammlung, Platz und Konto). */
const zusage = (konto: string, platz: string, status: 'bestätigt' | 'verhindert') =>
  db.query(
    `insert into public.confirmations (congregation_id, user_id, task_key, status) values ($1, $2, $3, $4)
     on conflict (congregation_id, task_key, user_id) do update set status = excluded.status`,
    [A, konto, platz, status],
  )

/** Die Absagen einer Person: Platz → seit wann (als Text, wie PostgREST ihn liefert). */
async function absagenVon(person: string): Promise<Record<string, string>> {
  const { rows } = await db.query(
    `select task_key, created_at::text as seit from public.absagen where congregation_id = $1 and person_id = $2`,
    [A, person],
  )
  return Object.fromEntries(rows.map((r) => [String(r.task_key), String(r.seit)]))
}

/** Die Absage zurückdatieren — `now()` ist in PGlite nicht fein genug, um zwei Schritte zu unterscheiden. */
const zurueckdatieren = (person: string, platz: string) =>
  db.query(`update public.absagen set created_at = $3 where person_id = $1 and task_key = $2`, [person, platz, LANGE_HER])

/** Eine Zeile in die Glocke — als Service-Role, wie die Function. */
const glocke = (konto: string, titel: string, platz: string) =>
  db.query(
    `insert into public.notifications (congregation_id, user_id, type, title, body, task_key) values ($1, $2, 'zuteilung', $3, '', $4)`,
    [A, konto, titel, platz],
  )

/** Was in den Glocken steht, lesbar: „Titel · Platz · wie oft". */
async function glocken(): Promise<string[]> {
  const { rows } = await db.query(
    `select title, task_key, count(*)::int as n from public.notifications where congregation_id = $1 group by 1, 2 order by 1, 2`,
    [A],
  )
  return rows.map((r) => `${String(r.title)} · ${String(r.task_key)} · ${String(r.n)}`)
}

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
  await db.query(`insert into auth.users (id, email) values ($1, 'p@konten.invalid'), ($2, 'a@konten.invalid'), ($3, 'b@konten.invalid')`, [
    PLANER,
    ANNA_KONTO,
    BERND_KONTO,
  ])
  await db.query(`insert into public.congregations (id, name) values ($1, 'A')`, [A])
  await db.query(`insert into public.persons (id, congregation_id, fn, ln) values ($1, $3, 'Anna', 'Müller'), ($2, $3, 'Bernd', 'Klein')`, [
    ANNA,
    BERND,
    A,
  ])
  await db.query(
    `insert into public.members (user_id, congregation_id, person_id, admin, zuteiler) values
       ($1, $4, null, false, true), ($2, $4, $5, false, false), ($3, $4, $6, false, false)`,
    [PLANER, ANNA_KONTO, BERND_KONTO, A, ANNA, BERND],
  )
}, 300_000)

beforeEach(async () => {
  await db.exec('set role postgres')
  await db.exec('delete from public.notifications; delete from public.confirmations; delete from public.absagen;')
})

afterAll(async () => {
  await db?.close()
})

describe('Seit wann eine Absage gilt (`absagen.created_at`)', () => {
  it('eine Absage wird vermerkt — eine Zusage nicht', async () => {
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    await zusage(BERND_KONTO, MIKRO, 'bestätigt')
    expect(Object.keys(await absagenVon(ANNA))).toEqual([LESUNG])
    expect(await absagenVon(BERND)).toEqual({})
  })

  it('dieselbe Absage noch einmal geschrieben (App und ältere App zugleich) behält ihren Beginn', async () => {
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    await zurueckdatieren(ANNA, LESUNG)
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    expect((await absagenVon(ANNA))[LESUNG]).toBe(LANGE_HER)
  })

  it('zurückgenommen und neu abgesagt beginnt neu', async () => {
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    await zusage(ANNA_KONTO, LESUNG, 'bestätigt')
    expect(await absagenVon(ANNA)).toEqual({})
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    expect((await absagenVon(ANNA))[LESUNG]).not.toBe(LANGE_HER)
  })

  it('der Platz war dazwischen bei einem anderen: Die neue Absage beginnt neu, obwohl die alte Zeile noch steht', async () => {
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    await zurueckdatieren(ANNA, LESUNG)
    // Der Planer besetzt um — die Zusage geht, die Absage bleibt für die Auswertung.
    await als(PLANER, () => db.query(`delete from public.confirmations where task_key = $1`, [LESUNG]))
    expect((await absagenVon(ANNA))[LESUNG]).toBe(LANGE_HER)
    // Später ist der Platz wieder bei ihr, und sie sagt wieder ab.
    await zusage(ANNA_KONTO, LESUNG, 'verhindert')
    expect((await absagenVon(ANNA))[LESUNG]).not.toBe(LANGE_HER)
  })
})

describe('Ein Ersatzgesuch endet mit seiner Absage', () => {
  /** Anna hat ihren Hilfsdienst abgesagt; Ersatz gesucht wurde bei Planer und Bernd. */
  async function gesucht(): Promise<void> {
    await zusage(ANNA_KONTO, MIKRO, 'verhindert')
    await glocke(PLANER, 'Ersatz gesucht', MIKRO)
    await glocke(BERND_KONTO, 'Ersatz gesucht', MIKRO)
    // Was bleiben muss: die Absage selbst beim Planer und das Gesuch eines anderen Platzes.
    await glocke(PLANER, 'Verhinderung gemeldet', MIKRO)
    await glocke(BERND_KONTO, 'Ersatz gesucht', MIKRO_2)
  }
  const OHNE_GESUCH = [`Ersatz gesucht · ${MIKRO_2} · 1`, `Verhinderung gemeldet · ${MIKRO} · 1`]
  const MIT_GESUCH = [`Ersatz gesucht · ${MIKRO} · 2`, ...OHNE_GESUCH].sort()

  it('besetzt der Planer den Platz neu, verschwindet „Ersatz gesucht" aus jeder Glocke — sonst nichts', async () => {
    await gesucht()
    expect(await glocken()).toEqual(MIT_GESUCH)
    const { rows } = await als(PLANER, () => db.query(`delete from public.confirmations where task_key = $1 returning 1`, [MIKRO]))
    expect(rows).toHaveLength(1)
    expect(await glocken()).toEqual(OHNE_GESUCH)
  })

  it('bestätigt der Absagende doch, ebenso', async () => {
    await gesucht()
    await zusage(ANNA_KONTO, MIKRO, 'bestätigt')
    expect(await glocken()).toEqual(OHNE_GESUCH)
  })

  it('geht das Konto des Absagenden, ebenso', async () => {
    await gesucht()
    await db.query(`delete from public.confirmations where user_id = $1`, [ANNA_KONTO])
    expect(await glocken()).toEqual(OHNE_GESUCH)
  })

  it('Gegenprobe: dieselbe Absage noch einmal geschrieben lässt das Gesuch stehen', async () => {
    await gesucht()
    await zusage(ANNA_KONTO, MIKRO, 'verhindert')
    expect(await glocken()).toEqual(MIT_GESUCH)
  })

  it('Gegenprobe: Geht eine andere Zusage zum Platz, bleibt das Gesuch — die Absage steht ja noch', async () => {
    await gesucht()
    await zusage(BERND_KONTO, MIKRO, 'bestätigt')
    await als(PLANER, () => db.query(`delete from public.confirmations where user_id = $1`, [BERND_KONTO]))
    expect(await glocken()).toEqual(MIT_GESUCH)
  })

  it('Gegenprobe: Steht zum Platz noch eine andere Absage, sucht sie weiter', async () => {
    // Ein Gesuch steht, solange zu seinem Platz eine Absage steht — gleich wessen.
    await gesucht()
    await zusage(BERND_KONTO, MIKRO, 'verhindert')
    await als(PLANER, () => db.query(`delete from public.confirmations where user_id = $1 and task_key = $2`, [ANNA_KONTO, MIKRO]))
    expect(await glocken()).toEqual(MIT_GESUCH)
  })

  it('der Planer selbst kommt an fremde Glocken nicht heran — nur der Trigger', async () => {
    await gesucht()
    const { rows } = await als(PLANER, () =>
      db.query(`delete from public.notifications where user_id = $1 and task_key = $2 returning 1`, [BERND_KONTO, MIKRO]),
    )
    expect(rows).toHaveLength(0)
    expect(await glocken()).toEqual(MIT_GESUCH)
  })
})
