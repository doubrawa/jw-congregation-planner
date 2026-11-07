import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerePostgres } from '../scripts/pglite-postgres.mjs'
import { ARTEN, BILDSCHIRM_MAX, BROWSER_MAX, MELDUNG_MAX, STAND_MAX, STAPEL_MAX } from '../src/lib/fehler-melden'

/**
 * **Die Rechte an `geraete_fehler`, gegen eine echte Postgres gemessen** (T171).
 *
 * Eine Tabelle, in die jedes angemeldete Mitglied schreiben darf, ist die
 * heikelste Art Tabelle in diesem Schema. Alles, was sie schützt, steht in drei
 * Richtlinien und einem Trigger — und keine davon prüft sich selbst. Die
 * Mitgliedsrechte-Probe gegen den Betrieb fährt der Betreiber von Hand und nur
 * gelegentlich; diese Probe läuft bei jedem Push.
 *
 * Gemessen wird wie in der App: als Rolle `authenticated` mit einem
 * `request.jwt.claim.sub`, nicht als Superuser. **Ohne `set role` greift keine
 * Richtlinie** — dann wäre jede Zeile hier grün und nichts gemessen.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')

const A = '00000000-0000-4000-8000-0000000000a1' // Versammlung A
const B = '00000000-0000-4000-8000-0000000000b1' // Versammlung B
const ADMIN_A = '00000000-0000-4000-8000-00000000a001'
const VERKUENDIGER_A = '00000000-0000-4000-8000-00000000a002'
const ADMIN_B = '00000000-0000-4000-8000-00000000b001'

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}
let db: DB

/** Etwas als dieses Konto tun — Rolle und Anspruch wie bei PostgREST. */
async function als<T>(konto: string | null, tun: () => Promise<T>): Promise<T> {
  await db.exec(`set role postgres`)
  await db.exec(konto ? `set request.jwt.claim.sub = '${konto}'` : `set request.jwt.claim.sub = ''`)
  await db.exec(`set role ${konto ? 'authenticated' : 'anon'}`)
  try {
    return await tun()
  } finally {
    await db.exec('set role postgres')
  }
}

/** Eine Meldung einfügen — gibt den Fehlercode zurück, oder null. */
async function melden(konto: string | null, cong: string, meldung = 'kaputt'): Promise<string | null> {
  return als(konto, async () => {
    try {
      await db.query(
        `insert into public.geraete_fehler (congregation_id, art, meldung, stand, bildschirm, browser)
         values ($1, 'fehler', $2, 'abc1234', 'planen', 'Chrome 142')`,
        [cong, meldung],
      )
      return null
    } catch (err) {
      return String((err as { code?: string }).code ?? (err as Error).message)
    }
  })
}

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
  // Zwei Versammlungen, drei Konten: Admin und Verkündiger in A, Admin in B.
  await db.query(`insert into auth.users (id, email) values ($1, 'a1@konten.invalid'), ($2, 'a2@konten.invalid'), ($3, 'b1@konten.invalid')`, [
    ADMIN_A,
    VERKUENDIGER_A,
    ADMIN_B,
  ])
  await db.query(`insert into public.congregations (id, name) values ($1, 'A'), ($2, 'B')`, [A, B])
  await db.query(
    `insert into public.members (user_id, congregation_id, planner, zuteiler)
     values ($1, $2, true, true), ($3, $2, false, false), ($4, $5, true, true)`,
    [ADMIN_A, A, VERKUENDIGER_A, ADMIN_B, B],
  )
}, 300_000)

afterAll(async () => {
  await db?.close()
})

describe('Schreiben', () => {
  it('jedes angemeldete Mitglied meldet in die eigene Versammlung', async () => {
    // Die Gegenprobe zu allem darunter: Ginge das nicht, wäre das Melden tot
    // und die strengen Zeilen bewiesen nichts.
    expect(await melden(VERKUENDIGER_A, A, 'vom Verkuendiger')).toBeNull()
    expect(await melden(ADMIN_A, A, 'vom Admin')).toBeNull()
  })

  it('niemand meldet in eine fremde Versammlung', async () => {
    // 42501 ist der Richtlinien-Verstoß. Dass er kommt und nicht erst der
    // Fremdschlüssel greift, ist der Punkt: Die Richtlinie urteilt zuerst.
    expect(await melden(VERKUENDIGER_A, B)).toBe('42501')
    expect(await melden(ADMIN_A, B)).toBe('42501')
  })

  it('ohne Anmeldung geht nichts', async () => {
    // Sonst stünde die Tabelle jedem offen, der den öffentlichen Schlüssel hat
    // — und der steht im Bündel jedes Besuchers.
    expect(await melden(null, A)).toBe('42501')
  })

  it('auch eine erfundene Versammlung ist ein Richtlinien-Verstoß, kein Fremdschlüssel-Fehler', async () => {
    /*
     * Wichtig für die Mitgliedsrechte-Probe (115)–(117): Sie zählt nur 401 und
     * 403 als Urteil der Richtlinien; ein 409 vom Fremdschlüssel wäre eine
     * gescheiterte Probe, die wie ein Erfolg aussieht
     * ([[pruefungen-die-nicht-pruefen]]). Gemessen: Die Richtlinie urteilt
     * zuerst, die Versammlung muss dafür nicht einmal existieren.
     */
    expect(await melden(VERKUENDIGER_A, '00000000-0000-4000-8000-0000000000ff')).toBe('42501')
  })
})

describe('Lesen', () => {
  it('der Admin sieht die Meldungen der eigenen Versammlung', async () => {
    const { rows } = await als(ADMIN_A, () => db.query('select meldung from public.geraete_fehler'))
    expect(rows.map((r) => r.meldung).sort()).toEqual(['vom Admin', 'vom Verkuendiger'])
  })

  it('ein Verkündiger sieht keine — auch nicht die eigene', async () => {
    // In einer Meldung kann stehen, woran ein anderer gerade gearbeitet hat.
    // Wer melden darf, darf deshalb nicht lesen.
    const { rows } = await als(VERKUENDIGER_A, () => db.query('select meldung from public.geraete_fehler'))
    expect(rows).toEqual([])
  })

  it('der Admin einer anderen Versammlung sieht nichts', async () => {
    const { rows } = await als(ADMIN_B, () => db.query('select meldung from public.geraete_fehler'))
    expect(rows).toEqual([])
  })
})

describe('Ändern und Löschen', () => {
  it('niemand verstellt oder löscht eine Meldung', async () => {
    // Ohne Richtlinie dafür trifft ein Ändern oder Löschen null Zeilen — eine
    // Meldung lässt sich nicht nachträglich schönen oder verschwinden lassen.
    for (const konto of [ADMIN_A, VERKUENDIGER_A]) {
      await als(konto, () => db.query(`update public.geraete_fehler set meldung = 'geschoent'`))
      await als(konto, () => db.query(`delete from public.geraete_fehler`))
    }
    const { rows } = await db.query('select meldung from public.geraete_fehler order by meldung')
    expect(rows.map((r) => r.meldung)).toEqual(['vom Admin', 'vom Verkuendiger'])
  })
})

describe('Die Bremse', () => {
  it('nimmt ab 30 Meldungen je Stunde und Versammlung nichts mehr an — still', async () => {
    /*
     * Der Fall, für den sie da ist: ein Fehler, der zum Neuladen führt, und
     * eine Seite, die danach wieder scheitert. Die Zähler im Tab sind dann weg;
     * nur diese Bremse bleibt. Abgewiesen wird **ohne** Fehler, denn das Melden
     * eines Fehlers darf nie selbst einen auslösen.
     */
    const vorher = Number((await db.query('select count(*)::int as n from public.geraete_fehler')).rows[0]!.n)
    for (let i = 0; i < 40; i++) expect(await melden(VERKUENDIGER_A, A, `kreis ${i}`)).toBeNull()
    const { rows } = await db.query('select count(*)::int as n from public.geraete_fehler')
    expect(Number(rows[0]!.n)).toBe(30)
    expect(vorher).toBeLessThan(30)
  })

  it('bremst je Versammlung, nicht für alle zusammen', async () => {
    // Sonst machte eine Versammlung im Kreis die Meldungen aller anderen stumm.
    expect(await melden(ADMIN_B, B, 'aus B')).toBeNull()
    const { rows } = await db.query('select count(*)::int as n from public.geraete_fehler where congregation_id = $1', [B])
    expect(Number(rows[0]!.n)).toBe(1)
  })
})

describe('Die App kürzt auf genau die Grenzen der Tabelle', () => {
  /*
   * **Die eigentliche Falle an dieser Tabelle.** Die App kürzt aus Höflichkeit,
   * die Datenbank setzt die Grenze. Liefen die beiden auseinander — in der App
   * 400, in der Spalte 300 —, wiese Postgres jede Meldung mit 23514 ab, und
   * `fehlerMelden` verschluckt jeden Fehler: Es würde einfach nie wieder etwas
   * gemeldet, ohne ein Zeichen. Deshalb kommen die Zahlen hier aus `schema.sql`
   * und nicht aus einer zweiten Liste.
   */
  const grenze = (spalte: string): number => {
    const t = new RegExp(`length\\(${spalte}\\) <= (\\d+)`).exec(SCHEMA)
    expect(t, `keine check-Bedingung für ${spalte} in schema.sql`).not.toBeNull()
    return Number(t![1])
  }

  it('Meldung, Stapel, Stand, Bildschirm und Browser', () => {
    expect(MELDUNG_MAX).toBe(grenze('meldung'))
    expect(STAPEL_MAX).toBe(grenze('stapel'))
    expect(STAND_MAX).toBe(grenze('stand'))
    expect(BILDSCHIRM_MAX).toBe(grenze('bildschirm'))
    expect(BROWSER_MAX).toBe(grenze('browser'))
  })

  it('und sie kennt genau die Arten, die die Spalte erlaubt', () => {
    // Eine fünfte Art in der App wäre ebenso lautlos: 23514 bei jeder Meldung
    // dieser Art.
    const t = /art\s+text not null check \(art in \(([^)]+)\)\)/.exec(SCHEMA)
    expect(t, 'keine check-Bedingung für art in schema.sql').not.toBeNull()
    const imSchema = t![1]!.split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect([...ARTEN].sort()).toEqual([...imSchema].sort())
  })
})

describe('Die Länge', () => {
  it('weist eine überlange Meldung ab', async () => {
    // Die App kürzt (`MELDUNG_MAX` in `src/lib/fehler-melden.ts`); ein
    // verstellter Client tut es nicht, und dann hält die Datenbank.
    const lang = 'x'.repeat(301)
    expect(await melden(ADMIN_B, B, lang)).toBe('23514')
  })

  it('nimmt nur bekannte Arten', async () => {
    const code = await als(ADMIN_B, async () => {
      try {
        await db.query(`insert into public.geraete_fehler (congregation_id, art, meldung) values ($1, 'erfunden', 'x')`, [B])
        return null
      } catch (err) {
        return String((err as { code?: string }).code)
      }
    })
    expect(code).toBe('23514')
  })
})
