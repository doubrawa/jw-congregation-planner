import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alsKonto, fehlercode, leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Wer eine Meldung an alle schicken darf, die planen** (`notify_planners`) —
 * gegen eine echte Postgres gemessen.
 *
 * Die Funktion schreibt mit den Rechten der Datenbank in fremde Glocken: je
 * Admin und Planer der Versammlung eine Zeile, mit Titel, Rumpf und
 * Aufgaben-Schlüssel, wie der Aufrufer sie mitgibt. Dürfte das jedes Mitglied,
 * stünde in der Glocke des Planers „Verhinderung gemeldet — <irgendwer>" zu
 * einem Platz, den der Genannte nie abgesagt hat. Die Zeile trägt keinen
 * Absender, und der Planer besetzte den Platz neu.
 *
 * Eine Absage meldet deshalb die Function `substitute`, die prüft, ob der Platz
 * dem Absagenden gehört (`_test/substitute-absage.test.ts`). Über diese
 * Funktion meldet nur, wer selbst plant — so sagt die App allen, dass ein
 * Programm geholt ist.
 *
 * Gemessen wird wie in der App: als Rolle `authenticated` mit dem Konto im
 * Anspruch, ohne Anmeldung als `anon`.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')

const A = '00000000-0000-4000-8000-0000000000a1' // die Versammlung
const B = '00000000-0000-4000-8000-0000000000b1' // eine andere
const ADMIN = '00000000-0000-4000-8000-00000000a001'
const PLANER = '00000000-0000-4000-8000-00000000a002'
const AUFSEHER = '00000000-0000-4000-8000-00000000a003'
const VERKUENDIGER = '00000000-0000-4000-8000-00000000a004'
const ADMIN_B = '00000000-0000-4000-8000-00000000b001'
const OHNE_VERSAMMLUNG = '00000000-0000-4000-8000-00000000f001'
const P_AUFSEHER = '00000000-0000-4000-8000-0000000000e1'
const GRUPPE = '00000000-0000-4000-8000-0000000000c1'

const PLATZ = '2026-11-23|mid|helper|mikro|0'
const WER: Record<string, string> = { [ADMIN]: 'Admin', [PLANER]: 'Planer', [AUFSEHER]: 'Gruppenaufseher', [VERKUENDIGER]: 'Verkündiger', [ADMIN_B]: 'Admin in B' }

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}
let db: DB

/**
 * Die Funktion rufen, wie die App es tut (`rpc/notify_planners`) — der
 * Fehlercode, oder null. Als dieses Konto; `null`: ohne Anmeldung.
 */
const melden = (konto: string | null, art: string, titel: string, rumpf = '', platz: string | null = null): Promise<string | null> =>
  alsKonto(db, konto, () => fehlercode(() => db.query(`select public.notify_planners($1, $2, $3, $4)`, [art, titel, rumpf, platz])))

/** Was in den Glocken steht, lesbar: „Empfänger · Art · Titel · Rumpf". */
async function glocken(): Promise<string[]> {
  const { rows } = await db.query(`select user_id, type, title, body from public.notifications order by title, user_id`)
  return rows.map((r) => `${WER[String(r.user_id)] ?? String(r.user_id)} · ${String(r.type)} · ${String(r.title)} · ${String(r.body)}`)
}

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
  const konten = [ADMIN, PLANER, AUFSEHER, VERKUENDIGER, ADMIN_B, OHNE_VERSAMMLUNG]
  for (const [i, id] of konten.entries()) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `k${i}@konten.invalid`])
  await db.query(`insert into public.congregations (id, name) values ($1, 'A'), ($2, 'B')`, [A, B])
  await db.query(`insert into public.persons (id, congregation_id, fn, ln) values ($1, $2, 'Arno', 'Aufseher')`, [P_AUFSEHER, A])
  await db.query(`insert into public.groups (id, congregation_id, name, overseer_id) values ($1, $2, 'Gruppe 1', $3)`, [GRUPPE, A, P_AUFSEHER])
  // Vier Stufen in A — Admin, Planer, Gruppenaufseher, Verkündiger —, ein Admin
  // in B und ein Konto, das zu keiner Versammlung gehört.
  await db.query(
    `insert into public.members (user_id, congregation_id, person_id, admin, zuteiler) values
       ($1, $6, null, true, false), ($2, $6, null, false, true), ($3, $6, $8, false, false), ($4, $6, null, false, false),
       ($5, $7, null, true, false)`,
    [ADMIN, PLANER, AUFSEHER, VERKUENDIGER, ADMIN_B, A, B, P_AUFSEHER],
  )
}, 300_000)

beforeEach(async () => {
  await db.exec('set role postgres')
  await db.exec('delete from public.notifications')
})

afterAll(async () => {
  await db?.close()
})

describe('Wer plant, meldet', () => {
  it.each([
    ['der Planer', PLANER],
    ['der Admin', ADMIN],
  ])('%s: Die Meldung steht bei jedem, der in seiner Versammlung plant — und nur dort', async (_wer, konto) => {
    // Die Gegenprobe zu allem darunter: Wiese die Funktion jeden ab, erführe
    // niemand mehr, dass ein Programm geholt ist.
    expect(await melden(konto, 'import', 'Programm importiert', '23.–29. November')).toBeNull()
    // Nicht beim Gruppenaufseher, nicht beim Verkündiger, nicht in B.
    expect(await glocken()).toEqual([
      'Admin · import · Programm importiert · 23.–29. November',
      'Planer · import · Programm importiert · 23.–29. November',
    ])
  })

  it('der Schlüssel der Aufgabe reist mit — gekürzt, und ein leerer gar nicht', async () => {
    // Er ist nur der Wegweiser für den Tipp in der Glocke, kein Recht.
    expect(await melden(PLANER, 'gesendet', 'mit Platz', '', PLATZ)).toBeNull()
    expect(await melden(PLANER, 'gesendet', 'zu lang', '', 'x'.repeat(400))).toBeNull()
    expect(await melden(PLANER, 'gesendet', 'leer', '', '')).toBeNull()
    const { rows } = await db.query(`select title, task_key from public.notifications where user_id = $1 order by title`, [ADMIN])
    expect(rows.map((r) => [r.title, r.task_key === null ? null : String(r.task_key).length])).toEqual([
      ['leer', null],
      ['mit Platz', PLATZ.length],
      ['zu lang', 300],
    ])
  })
})

describe('Wer nicht plant, meldet nicht', () => {
  it('ein Verkündiger schreibt keine Absage in die Glocken der Planer — schon gar nicht im Namen eines anderen', async () => {
    expect(await melden(VERKUENDIGER, 'verhindert', 'Verhinderung gemeldet', 'Mikrofone — Frank Fremd', PLATZ)).toBe('42501')
    expect(await glocken()).toEqual([])
  })

  it('auch keine andere Art', async () => {
    for (const art of ['import', 'gesendet', 'zuteilung', 'erinnerung', 'anmeldung']) {
      expect(await melden(VERKUENDIGER, art, 'x'), art).toBe('42501')
    }
    expect(await glocken()).toEqual([])
  })

  it('der Gruppenaufseher plant die Treffpunkte seiner Gruppe, nicht die Versammlung — auch er nicht', async () => {
    expect(await melden(AUFSEHER, 'verhindert', 'Verhinderung gemeldet', 'Mikrofone — Frank Fremd', PLATZ)).toBe('42501')
    expect(await glocken()).toEqual([])
  })

  it('ein Konto ohne Versammlung', async () => {
    expect(await melden(OHNE_VERSAMMLUNG, 'verhindert', 'Verhinderung gemeldet')).toBe('42501')
    expect(await glocken()).toEqual([])
  })

  it('ohne Anmeldung ist die Funktion nicht einmal zu rufen', async () => {
    // Der öffentliche Schlüssel steht im Bündel jedes Besuchers.
    expect(await melden(null, 'verhindert', 'Verhinderung gemeldet')).toBe('42501')
    expect(await glocken()).toEqual([])
    // 42501 sagt auch die Funktion selbst. Dass schon das Recht fehlt, sie zu
    // rufen, steht deshalb am Recht — sonst hinge alles an ihrer einen Prüfung.
    const { rows } = await db.query(
      `select r as rolle, has_function_privilege(r, 'public.notify_planners(text, text, text, text)', 'execute') as darf
         from unnest(array['anon', 'authenticated']) as r order by r`,
    )
    expect(rows).toEqual([
      { rolle: 'anon', darf: false },
      { rolle: 'authenticated', darf: true },
    ])
  })
})
