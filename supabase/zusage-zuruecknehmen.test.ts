import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alsKonto, leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **„Rückgängig" nach dem Bestätigen, gegen eine echte Postgres gemessen.**
 *
 * Die App nimmt eine eben gegebene Zusage zurück, indem sie die eigene Zeile in
 * `confirmations` löscht — ohne Zeile ist eine Zusage offen
 * (`zusageZuruecknehmen`, `src/lib/daten/zusagen.ts`). Ob ein Mitglied das
 * darf, steht in einer einzigen Richtlinie (`confirmations_write`, `for all`),
 * und ein Löschen, das die Richtlinie nicht trifft, **scheitert still**: kein
 * Fehler, null Zeilen. Die App zeigte dann „wieder offen", in der Datenbank
 * stünde weiter „bestätigt" — bis zum nächsten Laden.
 *
 * Deshalb beide Richtungen: Die eigene Zeile geht, die eines anderen bleibt —
 * auch wenn die Anfrage sie nicht ausnimmt. Unter demselben Schlüssel stehen
 * mitunter zwei Zeilen: wer abgesagt hat, und wer danach eingesprungen ist.
 *
 * Gemessen wird wie in der App: als Rolle `authenticated` mit einem
 * `request.jwt.claim.sub`. **Ohne `set role` greift keine Richtlinie.**
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')

const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b1'
const ANNA = '00000000-0000-4000-8000-00000000a001' // Verkündigerin in A
const BERND = '00000000-0000-4000-8000-00000000a002' // Verkündiger in A
const PLANER = '00000000-0000-4000-8000-00000000a003' // plant in A
const FREMD = '00000000-0000-4000-8000-00000000b001' // Verkündiger in B
const MIK = '2026-09-07|mid|helper|mik|0'
const TON = '2026-09-07|mid|helper|ton|0'

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}
let db: DB

const als = <T>(konto: string | null, tun: () => Promise<T>): Promise<T> => alsKonto(db, konto, tun)

/** Was in der Tabelle steht — als Superuser gelesen, an jeder Richtlinie vorbei. */
const bestand = async (): Promise<string[]> => {
  const { rows } = await db.query('select user_id, task_key, status from public.confirmations order by task_key, user_id')
  return rows.map((r) => `${String(r.user_id).slice(-4)} ${r.task_key} ${r.status}`)
}

/** So löscht die App: eingegrenzt auf Versammlung, Konto und Aufgaben. Zurück kommt, was wirklich ging. */
const zuruecknehmen = (konto: string, cong: string, wessen: string, keys: string[]) =>
  als(konto, async () => {
    const { rows } = await db.query(
      `delete from public.confirmations where congregation_id = $1 and user_id = $2 and task_key = any($3::text[]) returning task_key`,
      [cong, wessen, keys],
    )
    return rows.map((r) => r.task_key).sort()
  })

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
  await db.query(
    `insert into auth.users (id, email) values ($1, 'a1@konten.invalid'), ($2, 'a2@konten.invalid'), ($3, 'a3@konten.invalid'), ($4, 'b1@konten.invalid')`,
    [ANNA, BERND, PLANER, FREMD],
  )
  await db.query(`insert into public.congregations (id, name) values ($1, 'A'), ($2, 'B')`, [A, B])
  await db.query(
    `insert into public.members (user_id, congregation_id, admin, zuteiler)
     values ($1, $2, false, false), ($3, $2, false, false), ($4, $2, false, true), ($5, $6, false, false)`,
    [ANNA, A, BERND, PLANER, FREMD, B],
  )
}, 300_000)

beforeEach(async () => {
  // Der Ausgangsstand je Fall, als Superuser angelegt: Anna hat zwei Aufgaben
  // bestätigt; unter derselben Aufgabe steht Bernds Zeile (er hatte sie davor).
  await db.exec('delete from public.confirmations')
  await db.query(
    `insert into public.confirmations (congregation_id, user_id, task_key, status)
     values ($1, $2, $4, 'bestätigt'), ($1, $2, $5, 'bestätigt'), ($1, $3, $4, 'bestätigt')`,
    [A, ANNA, BERND, MIK, TON],
  )
})

afterAll(async () => {
  await db?.close()
})

describe('Die eigene Zusage zurücknehmen', () => {
  it('ein Mitglied löscht die eigenen Zeilen zu genau diesen Aufgaben — danach sind sie offen', async () => {
    expect(await zuruecknehmen(ANNA, A, ANNA, [MIK, TON])).toEqual([MIK, TON])
    // Bernds Zeile unter demselben Schlüssel steht noch.
    expect(await bestand()).toEqual([`a002 ${MIK} bestätigt`])
  })

  it('nur die genannte Aufgabe — die andere eigene bleibt bestätigt', async () => {
    expect(await zuruecknehmen(ANNA, A, ANNA, [MIK])).toEqual([MIK])
    expect(await bestand()).toEqual([`a002 ${MIK} bestätigt`, `a001 ${TON} bestätigt`])
  })
})

describe('Gegenprobe: Fremde Zusagen bleiben', () => {
  it('die Zeile eines anderen löscht ein Mitglied nicht — die Anfrage geht ohne Fehler durch und trifft nichts', async () => {
    expect(await zuruecknehmen(ANNA, A, BERND, [MIK])).toEqual([])
    expect(await bestand()).toContain(`a002 ${MIK} bestätigt`)
  })

  it('auch nicht, wenn die Anfrage das Konto gar nicht eingrenzt: Dann gehen nur die eigenen', async () => {
    const geloescht = await als(ANNA, async () => {
      const { rows } = await db.query(`delete from public.confirmations where congregation_id = $1 and task_key = $2 returning user_id`, [A, MIK])
      return rows.map((r) => r.user_id)
    })
    expect(geloescht).toEqual([ANNA])
    expect(await bestand()).toEqual([`a002 ${MIK} bestätigt`, `a001 ${TON} bestätigt`])
  })

  it('aus einer anderen Versammlung ist nichts zu erreichen', async () => {
    expect(await zuruecknehmen(FREMD, A, ANNA, [MIK, TON])).toEqual([])
    expect(await bestand()).toHaveLength(3)
  })

  it('ohne Anmeldung ebenso', async () => {
    const geloescht = await als(null, async () => (await db.query('delete from public.confirmations returning task_key')).rows)
    expect(geloescht).toEqual([])
    expect(await bestand()).toHaveLength(3)
  })
})

describe('Die Probe unterscheidet wirklich', () => {
  it('wer plant, räumt die Zeilen eines Platzes für alle ab — dort greift eine andere Richtlinie', async () => {
    // Die Positivkontrolle: Löschte hier niemand fremde Zeilen, bewiese „nichts
    // getroffen" oben nur, dass die Tabelle sich gar nicht löschen lässt.
    const geloescht = await als(PLANER, async () => {
      const { rows } = await db.query(`delete from public.confirmations where congregation_id = $1 and task_key = $2 returning user_id`, [A, MIK])
      return rows.map((r) => String(r.user_id)).sort()
    })
    expect(geloescht).toEqual([ANNA, BERND])
    expect(await bestand()).toEqual([`a001 ${TON} bestätigt`])
  })
})
