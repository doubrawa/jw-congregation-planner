import { describe, expect, it } from 'vitest'
import { nurNeue, wochenHolen } from './wochen-importieren.mjs'

/**
 * **Acht Wochen statt acht Klicks.**
 *
 * Geprüft wird ohne Netz: Der Aufruf der Edge Function ist ein Parameter. Was
 * gemessen wird, ist die Kette — jede Antwort nennt ihren Montag, und der ist
 * die Basis für die nächste Anfrage. Verliert das Skript diese Kette, holt es
 * achtmal **dieselbe** Woche, und weil `weeks` ein `unique (congregation_id,
 * start)` trägt, fiele das erst beim Schreiben auf.
 *
 * Die zweite Frage ist das Ende: Zur übernächsten Woche gibt es auf jw.org
 * irgendwann noch nichts. Das ist der Normalfall am Jahresrand und kein
 * Fehler — der Lauf muss mit dem enden, was da war.
 */

const woche = (start: string) => ({ week: { start, range: `Woche ${start}` } })

const antwort = (nutzlast: unknown, status = 200) => ({
  status,
  text: () => Promise.resolve(JSON.stringify(nutzlast)),
})

describe('wochenHolen', () => {
  it('hängt jede Woche an die vorige — acht Anfragen, acht Montage', async () => {
    const gefragt: string[] = []
    const holen = (_url: string, init: { body: string }) => {
      const { after } = JSON.parse(init.body)
      gefragt.push(after ?? '(ohne)')
      const naechster = after ? `2026-09-${String(Number(after.slice(-2)) + 7).padStart(2, '0')}` : '2026-09-07'
      return Promise.resolve(antwort(woche(naechster)))
    }

    const { wochen, fehler } = await wochenHolen({ url: 'https://x', key: 'k', ab: undefined, anzahl: 3, holen })

    expect(fehler).toBe('')
    expect(wochen.map((w) => w.start)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21'])
    expect(gefragt).toEqual(['(ohne)', '2026-09-07', '2026-09-14'])
  })

  it('schickt Sprache und Programmsprachen der Versammlung mit', async () => {
    let gesehen: { lang?: string; altLangs?: string[] } = {}
    const holen = (_url: string, init: { body: string }) => {
      gesehen = JSON.parse(init.body)
      return Promise.resolve(antwort(woche('2026-09-07')))
    }

    await wochenHolen({ url: 'https://x', key: 'k', lang: 'cmn-hant', altLangs: ['en'], anzahl: 1, holen })

    expect(gesehen.lang).toBe('cmn-hant')
    expect(gesehen.altLangs).toEqual(['en'])
  })

  it('meldet sich beim Function-Gateway mit Authorization an', async () => {
    // Gemessen am 18.9.2026: Ohne diese Kopfzeile antwortet das Gateway mit
    // 401 — anders als PostgREST, das genau sie nicht verträgt.
    let kopf: Record<string, string> = {}
    const holen = (_url: string, init: { headers: Record<string, string>; body: string }) => {
      kopf = init.headers
      return Promise.resolve(antwort(woche('2026-09-07')))
    }

    await wochenHolen({ url: 'https://x', key: 'sb_secret_abc', anzahl: 1, holen })

    expect(kopf.Authorization).toBe('Bearer sb_secret_abc')
    expect(kopf.apikey).toBe('sb_secret_abc')
  })

  it('endet mit dem, was da war, wenn jw.org noch keine Woche hat', async () => {
    let n = 0
    const holen = () =>
      Promise.resolve(n++ < 2 ? antwort(woche(`2026-09-${14 + n * 7}`)) : antwort({ error: 'keine Woche gefunden' }))

    const { wochen, fehler } = await wochenHolen({ url: 'https://x', key: 'k', anzahl: 8, holen })

    expect(wochen).toHaveLength(2)
    expect(fehler).toBe('keine Woche gefunden')
  })

  it('stirbt nicht an einer unlesbaren Antwort', async () => {
    const holen = () => Promise.resolve({ status: 502, text: () => Promise.resolve('<html>Gateway</html>') })

    const { wochen, fehler } = await wochenHolen({ url: 'https://x', key: 'k', anzahl: 3, holen })

    expect(wochen).toEqual([])
    expect(fehler).toMatch(/502/)
  })
})

describe('nurNeue', () => {
  it('lässt weg, was schon gespeichert ist', () => {
    const geholt = [{ start: '2026-09-07' }, { start: '2026-09-14' }]
    expect(nurNeue(['2026-09-07'], geholt).map((w) => w.start)).toEqual(['2026-09-14'])
  })

  it('wirft Wochen ohne Montag weg, statt sie zu schreiben', () => {
    // `weeks.start` ist `not null` mit Montags-Bedingung — eine Woche ohne
    // Startdatum brächte den ganzen Lauf zum Abbruch.
    expect(nurNeue([], [{ range: 'kaputt' }, { start: '2026-09-14' }]).map((w) => w.start)).toEqual(['2026-09-14'])
  })
})
