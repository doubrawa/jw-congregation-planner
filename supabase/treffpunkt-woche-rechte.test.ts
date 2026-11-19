import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alsKonto, fehlercode, leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Die Treffpunkte einer Woche: was der Gruppenaufseher daran darf** — gegen
 * eine echte Postgres gemessen.
 *
 * Die Treffpunkte einer Woche liegen als eine Liste in einer Zeile
 * (`fs_weeks.data`). Der Gruppenaufseher darf die Zeile schreiben, aber nur die
 * Treffpunkte seiner Gruppe ändern; das hält der Trigger `fs_weeks_pruefen`,
 * indem er alt und neu vergleicht. Ein Vergleich hält nur fest, was er nennt:
 * Verschöbe der Aufseher die Zeile auf einen anderen Montag und legte an ihre
 * Stelle eine leere, wären die Treffpunkte aller anderen Gruppen für diese
 * Woche fort — ohne dass er einen einzigen davon „geändert" hätte.
 *
 * Gemessen wird wie in der App: als Rolle `authenticated` mit dem Konto im
 * Anspruch. **Ohne `set role` griffe keine Richtlinie** — dann wäre jede Zeile
 * hier grün und nichts gemessen.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')

const A = '00000000-0000-4000-8000-0000000000a1' // die Versammlung
const B = '00000000-0000-4000-8000-0000000000b1' // eine andere
const AUFSEHER = '00000000-0000-4000-8000-00000000a001'
const VERKUENDIGER = '00000000-0000-4000-8000-00000000a002'
const P_AUFSEHER = '00000000-0000-4000-8000-0000000000e1'
const P_FREMD = '00000000-0000-4000-8000-0000000000e2'
const G_EIGEN = '00000000-0000-4000-8000-0000000000c1'
const G_FREMD = '00000000-0000-4000-8000-0000000000c2'

/** Drei Montage: die Woche, die es gibt, die danach und einer weit weg. */
const WOCHE = '2026-11-23'
const NAECHSTE_WOCHE = '2026-11-30'
const FERNER_MONTAG = '2027-01-04'

/** Ein Treffpunkt in der Form, die die App schreibt (`FsInstance`). */
const treffpunkt = (id: string, grp: string | null, mehr: Record<string, unknown> = {}) => ({
  id, ruleId: null, grp, wd: 3, time: '09:30', place: 'Saal', leader: '', manual: true, ...mehr,
})
const EIGEN = treffpunkt('t-eigen', G_EIGEN)
const FREMD = treffpunkt('t-fremd', G_FREMD, { leader: 'Frank Fremd', lpid: P_FREMD })
const VERSAMMLUNG = treffpunkt('t-versammlung', null, { wd: 6 })
const UNVERAENDERT = [`${WOCHE}: t-eigen@Saal, t-fremd@Saal, t-versammlung@Saal`]

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}
let db: DB

/** Eine Liste als Text — die Abfragen wandeln ihn selbst (`$n::text::jsonb`). */
const json = (wert: unknown): string => JSON.stringify(wert)

/** Was die Datenbank zu einem Versuch dieses Kontos sagt: der Fehlercode — oder null, wenn er durchging. */
const versuch = (konto: string, sql: string, werte: unknown[] = []): Promise<string | null> =>
  alsKonto(db, konto, () => fehlercode(() => db.query(sql, werte)))

/**
 * Speichern, wie die App es tut: die ganze Liste der Woche, auf dem gelesenen
 * Stand (`treffpunkte_speichern`) — ohne Stand legt sie die Woche an.
 */
async function speichern(konto: string, start: string, data: unknown[]): Promise<string | null> {
  const { rows } = await db.query(`select updated_at::text as stand from public.fs_weeks where congregation_id = $1 and start = $2`, [A, start])
  const stand = rows[0]?.stand ?? null
  return versuch(konto, `select * from public.treffpunkte_speichern($1, $2, $3::timestamptz, $4::text::jsonb)`, [A, start, stand, json(data)])
}

/** Die Zeile der Woche auf einen anderen Montag setzen — an der App vorbei, über die Tabelle. */
const verschieben = (konto: string, nach: string): Promise<string | null> =>
  versuch(konto, `update public.fs_weeks set start = $3 where congregation_id = $1 and start = $2`, [A, WOCHE, nach])

/** Die Treffpunkt-Wochen einer Versammlung, lesbar: „Montag: Kennung@Ort, …". */
async function wochen(cong = A): Promise<string[]> {
  const { rows } = await db.query(
    `select to_char(start, 'YYYY-MM-DD') as start, data::text as data from public.fs_weeks where congregation_id = $1 order by start`,
    [cong],
  )
  return rows.map((r) => {
    const punkte = JSON.parse(String(r.data)) as { id: string; place: string }[]
    return `${String(r.start)}: ${punkte.map((t) => `${t.id}@${t.place}`).join(', ')}`
  })
}

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
  await db.query(`insert into auth.users (id, email) values ($1, 'a1@konten.invalid'), ($2, 'a2@konten.invalid')`, [AUFSEHER, VERKUENDIGER])
  await db.query(`insert into public.congregations (id, name) values ($1, 'A'), ($2, 'B')`, [A, B])
  await db.query(`insert into public.persons (id, congregation_id, fn, ln) values ($1, $3, 'Arno', 'Aufseher'), ($2, $3, 'Frank', 'Fremd')`, [P_AUFSEHER, P_FREMD, A])
  await db.query(
    `insert into public.groups (id, congregation_id, name, overseer_id) values ($1, $5, 'Gruppe 1', $3), ($2, $5, 'Gruppe 2', $4)`,
    [G_EIGEN, G_FREMD, P_AUFSEHER, P_FREMD, A],
  )
  // Der Gruppenaufseher ist weder Admin noch Planer; der Verkündiger leitet nichts.
  await db.query(`insert into public.members (user_id, congregation_id, person_id) values ($1, $3, $4), ($2, $3, null)`, [AUFSEHER, VERKUENDIGER, A, P_AUFSEHER])
}, 300_000)

beforeEach(async () => {
  await db.exec('set role postgres')
  await db.exec('delete from public.fs_weeks')
  await db.query(`insert into public.fs_weeks (congregation_id, start, data) values ($1, $2, $3::text::jsonb)`, [A, WOCHE, json([EIGEN, FREMD, VERSAMMLUNG])])
})

afterAll(async () => {
  await db?.close()
})

describe('Die Gegenprobe: seine Gruppe pflegt er', () => {
  it('er verlegt einen Treffpunkt seiner Gruppe', async () => {
    // Ginge das nicht, bewiesen die strengen Fälle darunter nichts: Ein
    // Trigger, der alles abweist, bestünde sie alle — und der Aufseher könnte
    // seine Treffpunkte nicht mehr pflegen.
    expect(await speichern(AUFSEHER, WOCHE, [{ ...EIGEN, place: 'Parkplatz' }, FREMD, VERSAMMLUNG])).toBeNull()
    expect(await wochen()).toEqual([`${WOCHE}: t-eigen@Parkplatz, t-fremd@Saal, t-versammlung@Saal`])
  })

  it('er legt eine Woche an, in der nur Treffpunkte seiner Gruppe stehen', async () => {
    expect(await speichern(AUFSEHER, NAECHSTE_WOCHE, [treffpunkt('t-neu', G_EIGEN)])).toBeNull()
    expect(await wochen()).toEqual([...UNVERAENDERT, `${NAECHSTE_WOCHE}: t-neu@Saal`])
  })
})

describe('Fremde Treffpunkte bleiben, wie sie sind', () => {
  it('er entfernt keinen Treffpunkt einer anderen Gruppe und keinen der Versammlung', async () => {
    expect(await speichern(AUFSEHER, WOCHE, [EIGEN, VERSAMMLUNG])).toBe('42501')
    expect(await speichern(AUFSEHER, WOCHE, [EIGEN, FREMD])).toBe('42501')
    expect(await wochen()).toEqual(UNVERAENDERT)
  })

  it('er verlegt keinen davon', async () => {
    expect(await speichern(AUFSEHER, WOCHE, [EIGEN, { ...FREMD, place: 'Parkplatz' }, VERSAMMLUNG])).toBe('42501')
    expect(await speichern(AUFSEHER, WOCHE, [EIGEN, FREMD, { ...VERSAMMLUNG, place: 'Parkplatz' }])).toBe('42501')
    expect(await wochen()).toEqual(UNVERAENDERT)
  })
})

describe('Die Woche bleibt, wo sie ist', () => {
  it('er verschiebt sie nicht auf einen anderen Montag', async () => {
    // Der Weg an der Regel darüber vorbei: Kein fremder Treffpunkt ist
    // „geändert", und doch stünde in dieser Woche keiner mehr.
    expect(await verschieben(AUFSEHER, FERNER_MONTAG)).toBe('42501')
    expect(await wochen()).toEqual(UNVERAENDERT)
  })

  it('auch nicht zusammen mit einer Änderung, die ihm sonst zusteht', async () => {
    const eigeneAenderung = json([{ ...EIGEN, place: 'Parkplatz' }, FREMD, VERSAMMLUNG])
    expect(
      await versuch(AUFSEHER, `update public.fs_weeks set start = $3, data = $4::text::jsonb where congregation_id = $1 and start = $2`, [
        A, WOCHE, FERNER_MONTAG, eigeneAenderung,
      ]),
    ).toBe('42501')
    expect(await wochen()).toEqual(UNVERAENDERT)
  })

  it('und über die Woche legt er keine leere', async () => {
    // Der zweite Schritt desselben Wegs, für sich: eine Zeile für denselben
    // Montag, in der die Treffpunkte der anderen fehlen.
    expect(await versuch(AUFSEHER, `insert into public.fs_weeks (congregation_id, start, data) values ($1, $2, '[]'::jsonb)`, [A, WOCHE])).toBe('42501')
    expect(await wochen()).toEqual(UNVERAENDERT)
  })

  it('in eine andere Versammlung wandert sie ohnehin nicht', async () => {
    // Hier stehen zwei Wände hintereinander: Auch die Richtlinie ließe die
    // Zeile dort nicht zu (`with check`).
    expect(await versuch(AUFSEHER, `update public.fs_weeks set congregation_id = $3 where congregation_id = $1 and start = $2`, [A, WOCHE, B])).toBe('42501')
    expect(await wochen()).toEqual(UNVERAENDERT)
    expect(await wochen(B)).toEqual([])
  })

  it('wer keine Gruppe leitet, trifft die Zeile gar nicht', async () => {
    // Kein Fehler: Die Richtlinie gibt ihm die Zeile nicht zum Ändern, also
    // ändert er null Zeilen. Gemessen wird deshalb am Ergebnis, nicht am Status.
    expect(await verschieben(VERKUENDIGER, FERNER_MONTAG)).toBeNull()
    expect(await wochen()).toEqual(UNVERAENDERT)
  })
})
