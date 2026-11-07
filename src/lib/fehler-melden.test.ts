import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  // Mit Parameter deklariert, nicht ohne: Sonst ist `mock.calls` ein Tupel der
  // Länge 0, und `calls[0][0]` wäre schon dem Compiler ein Fehler — die Zeile,
  // die hier gerade das Interessante ist.
  const insert = vi.fn(async (_zeile: Record<string, string>) => ({ error: null }))
  return { insert, client: { from: vi.fn(() => ({ insert })) } }
})
vi.mock('./supabase', () => ({ supabase: db.client, isSupabaseConfigured: true }))

import {
  browserGrob,
  fehlerGrenzenEinhaengen,
  fehlerKontextSetzen,
  fehlerMelden,
  fehlerZaehlerLeeren,
  fehlerZeile,
  MELDUNG_MAX,
  meldungKuerzen,
  PRO_STUNDE,
  stapelKuerzen,
} from './fehler-melden'

/**
 * **Fehlermeldungen von den Geräten** (T171). Geprüft wird der Anwendungsfall,
 * nicht die Umsetzung: Was geht hinaus, was nicht, und steht in der Zeile
 * wirklich nichts über die Person?
 *
 * Die Zeile ist der heikle Teil. Eine Meldung ist bloß Text, und Text kann
 * tragen, was jemand getippt hat — deshalb hat jede Probe hier eine Sabotage
 * dabei: eine Id im Stapel, eine überlange Meldung, ein Wurf, der kein
 * `Error` ist.
 */

const VERSAMMLUNG = '00000000-0000-4000-8000-000000000001'
const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

beforeEach(() => {
  vi.clearAllMocks()
  fehlerZaehlerLeeren()
  fehlerKontextSetzen(VERSAMMLUNG, 'planen')
  vi.stubGlobal('navigator', { onLine: true, userAgent: UA_CHROME })
})
afterEach(() => {
  vi.unstubAllGlobals()
  fehlerKontextSetzen(null, '')
})

/** Die Zeile, die beim letzten Melden hinausging. */
const letzteZeile = (): Record<string, string> => db.insert.mock.calls.at(-1)?.[0] as unknown as Record<string, string>

describe('was hinausgeht', () => {
  it('meldet einen Fehler mit Stand, Bildschirm und Browser', async () => {
    await fehlerMelden('fehler', new Error('kaputt'))
    expect(db.client.from).toHaveBeenCalledWith('geraete_fehler')
    expect(letzteZeile()).toMatchObject({
      congregation_id: VERSAMMLUNG,
      bildschirm: 'planen',
      art: 'fehler',
      meldung: 'kaputt',
      browser: 'Chrome 142',
    })
    expect(letzteZeile().stand).toBeTruthy()
  })

  it('schreibt nichts über die Person — auch kein leeres Feld dafür', async () => {
    // Die Sabotage zur Zeile: Fiele hier je eine Konto- oder Person-Spalte
    // hinein, stünde in der Tabelle, WER den Fehler hatte. Das soll sie nicht
    // wissen (T171), und die Datenbank hätte die Spalte gar nicht.
    await fehlerMelden('fehler', new Error('kaputt'))
    expect(Object.keys(letzteZeile()).sort()).toEqual(
      ['art', 'bildschirm', 'browser', 'congregation_id', 'meldung', 'stand', 'stapel'].sort(),
    )
  })

  it('meldet vor der Anmeldung nichts', async () => {
    // Sonst stünde die Tabelle jedem offen — die Richtlinie weist es ohnehin
    // ab, aber die App soll es nicht einmal versuchen.
    fehlerKontextSetzen(null, 'login')
    await fehlerMelden('fehler', new Error('kaputt'))
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('verwirft ohne Netz', async () => {
    vi.stubGlobal('navigator', { onLine: false, userAgent: UA_CHROME })
    await fehlerMelden('fehler', new Error('kaputt'))
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('übersteht eine Datenbank, die wirft', async () => {
    // Melden darf nie selbst scheitern: Eine App, die beim Melden abstürzt,
    // hat zwei Fehler statt einem.
    db.insert.mockRejectedValueOnce(new Error('keine Verbindung'))
    await expect(fehlerMelden('fehler', new Error('kaputt'))).resolves.toBeUndefined()
  })
})

describe('die Bremsen', () => {
  it('meldet Gleiches nur einmal je Sitzung', async () => {
    await fehlerMelden('fehler', new Error('immer wieder'))
    await fehlerMelden('fehler', new Error('immer wieder'))
    await fehlerMelden('fehler', new Error('immer wieder'))
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it('unterscheidet dabei Art und Bildschirm', async () => {
    // Derselbe Text auf einem anderen Bildschirm ist ein anderer Befund.
    await fehlerMelden('fehler', new Error('gleich'))
    fehlerKontextSetzen(VERSAMMLUNG, 'personen')
    await fehlerMelden('fehler', new Error('gleich'))
    await fehlerMelden('grenze', new Error('gleich'))
    expect(db.insert).toHaveBeenCalledTimes(3)
  })

  it('lässt höchstens zehn je Stunde durch und danach wieder', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
      for (let i = 0; i < PRO_STUNDE + 5; i++) await fehlerMelden('fehler', new Error(`nummer ${i}`))
      expect(db.insert).toHaveBeenCalledTimes(PRO_STUNDE)
      // Eine Stunde später ist wieder Platz — sonst bliebe ein Gerät nach
      // einer schlechten Minute den ganzen Tag stumm.
      vi.setSystemTime(new Date(2026, 10, 7, 13, 1))
      await fehlerMelden('fehler', new Error('danach'))
      expect(db.insert).toHaveBeenCalledTimes(PRO_STUNDE + 1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('stapelKuerzen', () => {
  it('nimmt Adressparameter heraus und lässt Zeile und Spalte stehen', () => {
    const stapel = 'Error: x\n    at f (https://versammlung.app/assets/index-ab12.js?t=1762000000:42:17)'
    expect(stapelKuerzen(stapel)).toBe('Error: x\n    at f (https://versammlung.app/assets/index-ab12.js:42:17)')
  })

  it('nimmt einen Deeplink mitsamt seiner Aufgaben-Id heraus', () => {
    // Die eigentliche Gefahr: Im Hash steht `#go=<aufgabe>` — und ein
    // Aufgaben-Schlüssel nennt Woche und Platz.
    const stapel = 'at r (https://versammlung.app/#go=2026-11-02|mid|ratgeber:3:4)'
    expect(stapelKuerzen(stapel)).not.toContain('ratgeber')
    expect(stapelKuerzen(stapel)).toContain(':3:4')
  })

  it('kürzt und verträgt einen fehlenden Stapel', () => {
    expect(stapelKuerzen(undefined)).toBe('')
    expect(stapelKuerzen('x'.repeat(5000)).length).toBe(1200)
  })
})

describe('meldungKuerzen', () => {
  it('nimmt Error, Text und Objekt', () => {
    expect(meldungKuerzen(new Error('aus dem Error'))).toBe('aus dem Error')
    expect(meldungKuerzen('einfach Text')).toBe('einfach Text')
    expect(meldungKuerzen({ a: 1 })).toBe('{"a":1}')
  })

  it('kürzt und hat für nichts einen Platzhalter', () => {
    expect(meldungKuerzen('y'.repeat(1000)).length).toBe(MELDUNG_MAX)
    expect(meldungKuerzen(undefined)).toBe('(ohne Meldung)')
    expect(meldungKuerzen(new Error(''))).toBe('(ohne Meldung)')
  })

  it('verträgt ein Objekt, das sich nicht in JSON schreiben lässt', () => {
    // Ein Zyklus oder ein werfender Getter — `JSON.stringify` wirft dann, und
    // das Melden wäre genau an der Stelle gescheitert, für die es da ist.
    const zyklus: Record<string, unknown> = {}
    zyklus.selbst = zyklus
    expect(meldungKuerzen(zyklus)).toBe('[object Object]')
    expect(meldungKuerzen({ get x() { throw new Error('nein') } })).toBe('[object Object]')
  })
})

describe('browserGrob', () => {
  it('erkennt den spezifischsten, nicht den ersten', () => {
    // Edge und Opera nennen sich auch Chrome, Chrome nennt sich auch Safari.
    expect(browserGrob('… Chrome/142.0.0.0 Safari/537.36 Edg/142.0.3595.53')).toBe('Edge 142')
    expect(browserGrob('… Chrome/141.0.0.0 Safari/537.36 OPR/121.0.0.0')).toBe('Opera 121')
    expect(browserGrob(UA_CHROME)).toBe('Chrome 142')
    expect(browserGrob('Mozilla/5.0 (Macintosh) Version/18.2 Safari/605.1.15')).toBe('Safari 18')
    expect(browserGrob('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/145.0')).toBe('Firefox 145')
  })

  it('nennt nur Familie und Hauptversion, nicht die ganze Kennung', () => {
    // Die vollständige Kennung ist ein Fingerabdruck und sagt über den Fehler
    // nichts mehr aus.
    expect(browserGrob(UA_CHROME)).not.toContain('Windows')
    expect(browserGrob(UA_CHROME)).not.toContain('142.0.0.0')
    expect(browserGrob('etwas ganz anderes')).toBe('')
  })
})

describe('fehlerZeile', () => {
  it('kürzt Stand und Bildschirm auf die Länge der Spalten', () => {
    const zeile = fehlerZeile('fehler', new Error('x'), { congregationId: VERSAMMLUNG, bildschirm: 'b'.repeat(99) }, 's'.repeat(99), '')
    expect(zeile.stand!.length).toBe(40)
    expect(zeile.bildschirm!.length).toBe(40)
  })
})

describe('die globalen Horcher', () => {
  it('melden einen ungefangenen Fehler und ein abgelehntes Versprechen', async () => {
    const ziel = new EventTarget()
    const aushaengen = fehlerGrenzenEinhaengen(ziel)
    try {
      // `Event` plus Feld statt `ErrorEvent`: Die Probe braucht dafür kein DOM,
      // und der Horcher liest ohnehin nur `error` bzw. `reason`.
      ziel.dispatchEvent(Object.assign(new Event('error'), { error: new Error('global kaputt') }))
      ziel.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('nicht abgefangen') }))
      await vi.waitFor(() => expect(db.insert).toHaveBeenCalledTimes(2))
      expect(db.insert.mock.calls.map((c) => (c[0] as unknown as Record<string, string>).art)).toEqual(['fehler', 'versprechen'])
    } finally {
      aushaengen()
    }
  })

  it('hängt sich wieder aus', async () => {
    // Ohne das hingen nach jedem Lauf welche nach — und ein späterer Fehler
    // ginge mehrfach hinaus.
    const ziel = new EventTarget()
    fehlerGrenzenEinhaengen(ziel)()
    ziel.dispatchEvent(Object.assign(new Event('error'), { error: new Error('nach dem Aushängen') }))
    await Promise.resolve()
    expect(db.insert).not.toHaveBeenCalled()
  })
})
