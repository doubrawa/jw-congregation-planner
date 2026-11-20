import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alsKonto, fehlercode, leerePostgres } from '../scripts/pglite-postgres.mjs'

/**
 * **Ein Kennwort entfernen darf nur die Dienstrolle** — gegen eine echte
 * Postgres gemessen.
 *
 * `kennwort_entfernen` leert das Kennwort eines Kontos in `auth.users`; die
 * Function `anmelden` ruft sie bei „Zugang erneuern" für das eigene Konto auf.
 * Sie läuft mit den Rechten ihres Eigentümers (`security definer`). Dürfte ein
 * Mitglied sie rufen, nähme es jedem anderen Konto das Kennwort — die
 * Mitgliedsrechte-Probe etwa, die sich mit Kennwort anmeldet, stünde vor der
 * Tür. Gemessen wird in den Rollen, die PostgREST setzt: `authenticated` mit
 * dem Konto im Anspruch, `anon` und `service_role`.
 */

const SCHEMA = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8')

const KONTO = '00000000-0000-4000-8000-00000000b001'
const ANDERES = '00000000-0000-4000-8000-00000000b002'

type DB = {
  query: (sql: string, werte?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  exec: (sql: string) => Promise<unknown>
  close: () => Promise<void>
}
let db: DB

beforeAll(async () => {
  db = (await leerePostgres([SCHEMA])) as unknown as DB
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('delete from auth.users')
  await db.query(
    `insert into auth.users (id, email, encrypted_password)
     values ($1, 'a@konten.invalid', 'hash-a'), ($2, 'b@konten.invalid', 'hash-b')`,
    [KONTO, ANDERES],
  )
})

/** Kennwort je Konto, wie es in `auth.users` steht. */
const kennwoerter = async (): Promise<Record<string, unknown>> =>
  Object.fromEntries((await db.query('select id, encrypted_password from auth.users')).rows.map((r) => [r.id, r.encrypted_password]))

const entfernen = (konto: string) => db.query('select public.kennwort_entfernen($1)', [konto])

/** Als Dienstrolle — so ruft die Function `anmelden` über PostgREST. */
async function alsDienst<T>(tun: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role')
  try {
    return await tun()
  } finally {
    await db.exec('set role postgres')
  }
}

const UNVERAENDERT = { [KONTO]: 'hash-a', [ANDERES]: 'hash-b' }

describe('kennwort_entfernen: nur die Dienstrolle, nur das genannte Konto', () => {
  it('die Dienstrolle leert das Kennwort genau dieses Kontos — das andere bleibt', async () => {
    await alsDienst(() => entfernen(KONTO))
    expect(await kennwoerter()).toEqual({ [KONTO]: '', [ANDERES]: 'hash-b' })
  })

  it('ein Mitglied darf sie nicht rufen — weder für ein fremdes Konto noch für das eigene', async () => {
    expect(await fehlercode(() => alsKonto(db, KONTO, () => entfernen(ANDERES)))).toBe('42501')
    expect(await fehlercode(() => alsKonto(db, KONTO, () => entfernen(KONTO)))).toBe('42501')
    expect(await kennwoerter()).toEqual(UNVERAENDERT)
  })

  it('ohne Anmeldung auch nicht', async () => {
    expect(await fehlercode(() => alsKonto(db, null, () => entfernen(KONTO)))).toBe('42501')
    expect(await kennwoerter()).toEqual(UNVERAENDERT)
  })

  it('Gegenprobe: Mit dem Recht käme ein Mitglied durch — die Probe misst den Grant, nicht einen Fehler der Funktion', async () => {
    await db.exec('grant execute on function public.kennwort_entfernen(uuid) to authenticated')
    try {
      expect(await fehlercode(() => alsKonto(db, KONTO, () => entfernen(ANDERES)))).toBeNull()
      expect((await kennwoerter())[ANDERES]).toBe('')
    } finally {
      await db.exec('revoke execute on function public.kennwort_entfernen(uuid) from authenticated')
    }
  })
})
