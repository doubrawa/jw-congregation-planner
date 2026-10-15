import { describe, expect, it, vi } from 'vitest'
import { schreibenAbwarten, schreibStand, verfolgterFetch } from './schreiben-unterwegs'

/**
 * **Was gerade hinausgeht** — der Zähler hinter dem Nachladen
 * (`loadAndHydrate`). Der Zustand des Moduls gilt für die ganze Datei; die
 * Tests vergleichen deshalb vorher und nachher, keine festen Zahlen.
 */

/** Ein `fetch`, dessen Antwort der Test selbst freigibt. */
function haengend() {
  const freigaben: Array<() => void> = []
  const fehler: Array<() => void> = []
  const fetchFn = vi.fn(
    () =>
      new Promise<Response>((weiter, scheitern) => {
        freigaben.push(() => weiter(new Response(null)))
        fehler.push(() => scheitern(new TypeError('Failed to fetch')))
      }),
  )
  return { fetchFn, freigaben, fehler }
}

describe('Was zählt', () => {
  it('ändernde Aufrufe zählen — Tabellen, RPC, Functions', async () => {
    const f = verfolgterFetch(async () => new Response(null))
    const vorher = schreibStand()
    await f('https://db.test/rest/v1/confirmations', { method: 'POST' })
    await f('https://db.test/rest/v1/weeks?start=eq.2026-09-07', { method: 'PATCH' })
    await f('https://db.test/rest/v1/absences?id=eq.a1', { method: 'DELETE' })
    await f('https://db.test/rest/v1/rpc/notify_planners', { method: 'POST' })
    await f(new Request('https://db.test/functions/v1/substitute', { method: 'POST' }))
    expect(schreibStand() - vorher).toBe(5)
  })

  it('Lesen zählt nicht — PostgREST liest mit GET und HEAD', async () => {
    const f = verfolgterFetch(async () => new Response(null))
    const vorher = schreibStand()
    await f('https://db.test/rest/v1/weeks?select=*')
    await f('https://db.test/rest/v1/weeks?select=*', { method: 'GET' })
    await f(new URL('https://db.test/rest/v1/persons?select=id'), { method: 'HEAD' })
    expect(schreibStand()).toBe(vorher)
  })

  it('die Anmeldung zählt nicht — auch nicht das Erneuern ihres Tokens', async () => {
    const f = verfolgterFetch(async () => new Response(null))
    const vorher = schreibStand()
    await f('https://db.test/auth/v1/token?grant_type=refresh_token', { method: 'POST' })
    expect(schreibStand()).toBe(vorher)
  })

  it('die Antwort geht unverändert an den Aufrufer zurück', async () => {
    const antwort = new Response('{"ok":true}')
    const f = verfolgterFetch(async () => antwort)
    expect(await f('https://db.test/rest/v1/confirmations', { method: 'POST' })).toBe(antwort)
  })
})

describe('schreibenAbwarten', () => {
  it('ohne Unterwegs kehrt es gleich zurück', async () => {
    await expect(schreibenAbwarten()).resolves.toBeUndefined()
  })

  it('wartet, bis angekommen ist — auch, was währenddessen dazukommt', async () => {
    const { fetchFn, freigaben } = haengend()
    const f = verfolgterFetch(fetchFn)
    void f('https://db.test/rest/v1/confirmations', { method: 'POST' })
    let fertig = false
    const warten = schreibenAbwarten().then(() => {
      fertig = true
    })
    void f('https://db.test/rest/v1/notifications', { method: 'PATCH' })
    freigaben[0]!()
    await new Promise((r) => setTimeout(r, 10))
    expect(fertig).toBe(false) // der zweite ist noch unterwegs
    freigaben[1]!()
    await warten
    expect(fertig).toBe(true)
  })

  it('ein gescheiterter Aufruf ist auch angekommen', async () => {
    const { fetchFn, fehler } = haengend()
    const f = verfolgterFetch(fetchFn)
    void f('https://db.test/rest/v1/confirmations', { method: 'POST' }).catch(() => {})
    const warten = schreibenAbwarten()
    fehler[0]!()
    await expect(warten).resolves.toBeUndefined()
  })

  it('ein Aufruf ohne Antwort hält höchstens die Frist auf', async () => {
    const { fetchFn, freigaben } = haengend()
    const f = verfolgterFetch(fetchFn)
    void f('https://db.test/rest/v1/confirmations', { method: 'POST' })
    const start = Date.now()
    await schreibenAbwarten(30)
    expect(Date.now() - start).toBeLessThan(1000)
    freigaben[0]!() // aufräumen: sonst wartete der nächste Test mit
    await schreibenAbwarten()
  })
})
