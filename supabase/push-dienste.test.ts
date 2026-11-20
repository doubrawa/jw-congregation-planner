import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { alsKonto, fehlercode, leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Push-Abos nur von den bekannten Diensten** (Sicherheit 19.11., Nr. 3) —
 * gegen eine echte Postgres gemessen.
 *
 * Die Functions rufen jeden Endpoint auf, der in `push_subscriptions` steht.
 * War er frei wählbar, ließ ein Mitglied die Function einen beliebigen Host
 * aufrufen. Die Regel `push_subscriptions_dienst` lässt nur Google, Apple,
 * Mozilla und Microsoft herein. Gemessen wird, wie die App einträgt: als
 * `authenticated` mit dem Konto im Anspruch, durch die Richtlinie
 * `push_subscriptions_own`.
 */

const hier = import.meta.dirname
const SCHEMA = fs.readFileSync(path.join(hier, 'schema.sql'), 'utf8')
const MIGRATIONEN = path.join(hier, 'migrations')
const DIESE_MIGRATION = '20261120110000_push-nur-bekannte-dienste.sql'

const A = '00000000-0000-4000-8000-0000000000a1'
const KONTO = '00000000-0000-4000-8000-00000000c001'

/** Endpoints, wie die Browser sie heute ausgeben. */
const BEKANNT = [
  'https://fcm.googleapis.com/fcm/send/f1x2',
  'https://fcm.googleapis.com/wp/f1x2',
  'https://web.push.apple.com/QGx3',
  'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
  'https://wns2-par02p.notify.windows.com/w/?token=BQYA',
]

/** Was ein Mitglied stattdessen eintragen könnte. */
const FREMD = [
  'https://beliebig.example/fcm.googleapis.com/x', // Dienst nur im Pfad
  'https://fcm.googleapis.com.beliebig.example/x', // Dienst als Vorsilbe eines fremden Hosts
  'https://fcm.googleapis.com@beliebig.example/x', // Dienst als Benutzername
  'https://fcm.googleapis.com:8443/x', // mit Port
  'http://fcm.googleapis.com/fcm/send/x', // ohne TLS
  'https://notify.windows.com/x', // ohne Unterdomain
  'https://evilnotify.windows.com/x', // Name endet nur ähnlich
  'https://127.0.0.1/x',
]

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}

const migrationen = (ohne?: string): string[] =>
  fs
    .readdirSync(MIGRATIONEN)
    .filter((f) => f.endsWith('.sql') && f !== ohne)
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONEN, f), 'utf8'))

/** Versammlung, Konto und Mitgliedschaft — ohne die nimmt die Richtlinie nichts an. */
async function grundstock(db: DB): Promise<void> {
  await db.query(`insert into auth.users (id, email) values ($1, 'c1@konten.invalid')`, [KONTO])
  await db.query(`insert into public.congregations (id, name) values ($1, 'A')`, [A])
  await db.query(`insert into public.members (user_id, congregation_id) values ($1, $2)`, [KONTO, A])
}

/** Ein Abo eintragen wie die App: als das Konto selbst. Zurück: der Fehlercode oder null. */
const eintragen = (db: DB, endpoint: string): Promise<string | null> =>
  fehlercode(() =>
    alsKonto(db, KONTO, () =>
      db.query(
        `insert into public.push_subscriptions (congregation_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, 'p', 'a')`,
        [A, KONTO, endpoint],
      ),
    ),
  )

describe('push_subscriptions_dienst: nur die bekannten Push-Dienste', () => {
  let db: DB
  beforeAll(async () => {
    db = (await leerePostgres([SCHEMA])) as unknown as DB
    await grundstock(db)
  })
  afterAll(async () => {
    await db.close()
  })

  it.each(BEKANNT)('nimmt %s an', async (endpoint) => {
    expect(await eintragen(db, endpoint)).toBeNull()
  })

  it.each(FREMD)('weist %s ab (23514)', async (endpoint) => {
    expect(await eintragen(db, endpoint)).toBe('23514')
  })

  it('die Meldung nennt die Regel — daran erkennt die App den unbekannten Dienst (`dienstUnbekannt`)', async () => {
    const meldung = await alsKonto(db, KONTO, () =>
      db
        .query(`insert into public.push_subscriptions (congregation_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, 'p', 'a')`, [
          A,
          KONTO,
          'https://beliebig.example/x',
        ])
        .then(
          () => '',
          (err: { message?: string }) => String(err.message),
        ),
    )
    expect(meldung).toContain('push_subscriptions_dienst')
  })
})

describe('die Migration räumt vorher ab, was die Regel nicht annähme', () => {
  let db: DB
  beforeAll(async () => {
    db = (await leerePostgres(migrationen(DIESE_MIGRATION))) as unknown as DB
    await grundstock(db)
  })
  afterAll(async () => {
    await db.close()
  })

  it('vorher nimmt die Datenbank jeden Endpoint an, danach stehen nur die bekannten da, und ein fremder kommt nicht mehr hinein', async () => {
    // Vorher: auch der fremde geht hinein — zugleich die Gegenprobe, dass die
    // Proben oben die Regel messen und nicht etwas anderes.
    for (const endpoint of [...BEKANNT, FREMD[0] as string]) expect(await eintragen(db, endpoint), endpoint).toBeNull()
    await db.exec(fs.readFileSync(path.join(MIGRATIONEN, DIESE_MIGRATION), 'utf8'))
    const { rows } = await db.query('select endpoint from public.push_subscriptions order by endpoint')
    expect(rows.map((r) => r.endpoint)).toEqual([...BEKANNT].sort())
    expect(await eintragen(db, FREMD[1] as string)).toBe('23514')
  })
})

describe('die Migration lässt zwischen Aufräumen und Regel nichts herein', () => {
  let db: DB
  beforeAll(async () => {
    db = (await leerePostgres(migrationen(DIESE_MIGRATION))) as unknown as DB
    await grundstock(db)
  })
  afterAll(async () => {
    await db.close()
  })

  /** Die Anweisungen der Migration einzeln — ohne die Kommentare, die selbst ein „;" tragen. */
  const schritte = () =>
    fs
      .readFileSync(path.join(MIGRATIONEN, DIESE_MIGRATION), 'utf8')
      .split('\n')
      .filter((zeile) => !zeile.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)

  it('schon nach dem ersten Schritt weist die Tabelle ein fremdes Abo ab, obwohl das alte noch dasteht', async () => {
    // Stünde das Aufräumen vorn, käme ein Abo, das ein Gerät genau dann
    // einträgt, noch durch — und die Prüfung der Regel danach scheiterte.
    expect(await eintragen(db, FREMD[0] as string)).toBeNull()
    const [erster, ...rest] = schritte()
    expect(rest).toHaveLength(2)
    await db.exec(erster as string)
    expect(await eintragen(db, FREMD[1] as string)).toBe('23514')
    const alt = await db.query('select count(*)::int as n from public.push_subscriptions where endpoint = $1', [FREMD[0]])
    expect(alt.rows[0]?.n).toBe(1)
    for (const schritt of rest) await db.exec(schritt)
    const { rows } = await db.query('select endpoint from public.push_subscriptions')
    expect(rows).toEqual([])
  })
})
