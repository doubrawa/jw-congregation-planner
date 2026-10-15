import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **Links ausstellen** (T121, Phase 8) — die App-Seite von `send-invite`:
 * Viele Personen gehen in Teilen hinaus (die Function legt zwischen zwei
 * E-Mails eine Pause ein), und was schiefgeht, nimmt die schon ausgestellten
 * Links nicht mit.
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
const link = (personId: string, gesendet = true) => ({
  personId,
  url: 'https://versammlung.app/#anmelden=x',
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
  gesendet,
})
/** Der Server stellt für jede Id einen Link aus. */
const stelltAus = (mailBereit = true) =>
  invoke.mockImplementation((_name: string, { body }: { body: { personIds: string[] } }) =>
    Promise.resolve({ data: { links: body.personIds.map((id) => link(id)), mailBereit }, error: null }),
  )

beforeEach(() => {
  client.wert = true
  invoke.mockReset()
})

describe('Links ausstellen', () => {
  it('schickt die Personen, ob gesendet wird, und die Sprache der Versammlung', async () => {
    stelltAus()
    const r = await linksAusstellen(ids(2), { senden: true, lang: 'fr' })
    expect(invoke).toHaveBeenCalledWith('send-invite', { body: { personIds: ids(2), senden: true, lang: 'fr' } })
    expect(r).toEqual({ links: ids(2).map((id) => link(id)), mailBereit: true, fehler: false })
  })

  it('viele Personen gehen in Teilen hinaus — höchstens 40 je Aufruf, alle kommen an', async () => {
    stelltAus()
    const r = await linksAusstellen(ids(95), { senden: true, lang: 'de' })
    expect(invoke.mock.calls.map((c) => (c[1] as { body: { personIds: string[] } }).body.personIds.length)).toEqual([40, 40, 15])
    expect(r.links.map((l) => l.personId)).toEqual(ids(95))
  })

  it('kann der Server nicht senden, hört es nach dem ersten Teil auf — er hat nichts ausgestellt', async () => {
    invoke.mockResolvedValue({ data: { links: [], mailBereit: false }, error: null })
    const r = await linksAusstellen(ids(95), { senden: true, lang: 'de' })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ links: [], mailBereit: false, fehler: false })
  })

  it('ohne Senden (Zettel) geht es auch ohne Versand weiter', async () => {
    stelltAus(false)
    const r = await linksAusstellen(ids(45), { senden: false, lang: 'de' })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(r.links).toHaveLength(45)
  })

  it('scheitert ein Teil, bleiben die schon ausgestellten Links — mit Fehler', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stelltAus()
    invoke.mockImplementationOnce((_n: string, { body }: { body: { personIds: string[] } }) =>
      Promise.resolve({ data: { links: body.personIds.map((id) => link(id)), mailBereit: true }, error: null }),
    )
    invoke.mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }))
    const r = await linksAusstellen(ids(95), { senden: true, lang: 'de' })
    expect(r.fehler).toBe(true)
    expect(r.links).toHaveLength(40)
    expect(invoke).toHaveBeenCalledTimes(2)
    err.mockRestore()
  })

  it('ohne Datenbank gibt es keinen Link — und das ist ein Fehler, keine Stille', async () => {
    client.wert = false
    expect(await linksAusstellen(ids(1), { senden: false, lang: 'de' })).toEqual({ links: [], mailBereit: false, fehler: true })
  })
})

describe('Was der Zustand von einem ausgestellten Link weiß', () => {
  const jetzt = new Date('2026-10-15T09:00:00.000Z')

  it('so, wie es jetzt in der Datenbank steht: neu, noch nicht benutzt', () => {
    expect(alsAnmeldeLink(link('p-a', false), jetzt)).toEqual({
      personId: 'p-a',
      gueltigBis: '2026-11-14T09:00:00.000Z',
      erstelltAt: '2026-10-15T09:00:00.000Z',
      gesendetAt: null,
      benutztAt: null,
    })
  })

  it('gesendet ist er, wenn die E-Mail hinausging', () => {
    expect(alsAnmeldeLink(link('p-a', true), jetzt).gesendetAt).toBe('2026-10-15T09:00:00.000Z')
  })
})
