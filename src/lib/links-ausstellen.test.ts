import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Links ausstellen** (T121, Phase 8) — die App-Seite von `send-invite`:
 * Viele Personen gehen in Teilen hinaus (die Function nimmt höchstens 200),
 * und was schiefgeht, nimmt die schon ausgestellten Links nicht mit. E-Mails
 * schickt die App seit dem 31.10.2026 keine mehr — ausgestellt wird nur.
 */

const invoke = vi.fn()
const client = { wert: true as boolean }
vi.mock('./supabase', () => ({
  get supabase() {
    return client.wert ? { functions: { invoke } } : null
  },
}))

const { alsAnmeldeLink, linksAusstellen } = await import('./links-ausstellen')

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const link = (personId: string) => ({
  personId,
  url: 'https://versammlung.app/#anmelden=x',
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
})
/** Der Server stellt für jede Id einen Link aus. */
const stelltAus = () =>
  invoke.mockImplementation((_name: string, { body }: { body: { personIds: string[] } }) =>
    Promise.resolve({ data: { links: body.personIds.map((id) => link(id)) }, error: null }),
  )

beforeEach(() => {
  client.wert = true
  invoke.mockReset()
})

describe('Links ausstellen', () => {
  it('schickt nur die Personen — keine Sprache, kein Versand', async () => {
    stelltAus()
    const r = await linksAusstellen(ids(2))
    expect(invoke).toHaveBeenCalledWith('send-invite', { body: { personIds: ids(2) } })
    expect(r).toEqual({ links: ids(2).map((id) => link(id)), fehler: false })
  })

  it('viele Personen gehen in Teilen hinaus — höchstens 100 je Aufruf, alle kommen an', async () => {
    stelltAus()
    const r = await linksAusstellen(ids(230))
    expect(invoke.mock.calls.map((c) => (c[1] as { body: { personIds: string[] } }).body.personIds.length)).toEqual([100, 100, 30])
    expect(r.links.map((l) => l.personId)).toEqual(ids(230))
  })

  it('scheitert ein Teil, bleiben die schon ausgestellten Links — mit Fehler', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stelltAus()
    invoke.mockImplementationOnce((_n: string, { body }: { body: { personIds: string[] } }) =>
      Promise.resolve({ data: { links: body.personIds.map((id) => link(id)) }, error: null }),
    )
    invoke.mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }))
    const r = await linksAusstellen(ids(230))
    expect(r.fehler).toBe(true)
    expect(r.links).toHaveLength(100)
    expect(invoke).toHaveBeenCalledTimes(2)
    err.mockRestore()
  })

  it('ohne Datenbank gibt es keinen Link — und das ist ein Fehler, keine Stille', async () => {
    client.wert = false
    expect(await linksAusstellen(ids(1))).toEqual({ links: [], fehler: true })
  })
})

describe('Was der Zustand von einem ausgestellten Link weiß', () => {
  it('so, wie es jetzt in der Datenbank steht: neu, noch nicht benutzt', () => {
    expect(alsAnmeldeLink(link('p-a'), new Date('2026-10-15T09:00:00.000Z'))).toEqual({
      personId: 'p-a',
      gueltigBis: '2026-11-14T09:00:00.000Z',
      erstelltAt: '2026-10-15T09:00:00.000Z',
      gesendetAt: null,
      benutztAt: null,
    })
  })
})
