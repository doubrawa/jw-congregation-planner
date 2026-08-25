import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Der Klick auf eine Mitteilung führt in die App — und nirgendwo sonst.
 *
 * `public/sw.js` liest das Sprungziel aus der Push-Nutzlast und übergibt es an
 * `clients.openWindow()` bzw. `client.navigate()`. Heute setzt der Server diese
 * Adresse aus `APP_URL` plus einem festen `#go=…` zusammen; wer eine Mitteilung
 * zustellen darf, bestimmt damit aber, wohin ein Klick führt. `openWindow`
 * folgt jeder Adresse, auch einer fremden. Deshalb wird das Ziel geprüft,
 * bevor irgendetwas geöffnet wird.
 *
 * Steht außerhalb von `src/`, weil die Datei als **Text** gelesen und in einer
 * nachgebauten Service-Worker-Umgebung ausgeführt wird: `public/` wird nicht
 * gebündelt, es gibt also nichts zu importieren. Geprüft wird damit die Datei,
 * die tatsächlich ausgeliefert wird — nicht eine Nachbildung ihrer Regeln.
 */

const QUELLE = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8')

const SCOPE = 'https://example.test/jw-congregation-planner/'

interface Fenster {
  focus: () => unknown
  navigate: (url: string) => Promise<unknown>
  postMessage: (msg: unknown) => void
}

interface Bühne {
  /** Adressen, zu denen ein offenes Fenster geschickt wurde. */
  navigiert: string[]
  /** Adressen, für die ein neues Fenster geöffnet wurde. */
  geoeffnet: string[]
  /** Nachrichten an offene Fenster. */
  nachrichten: unknown[]
  klick: (url: unknown) => Promise<void>
}

/**
 * Lädt `sw.js` in einer nachgebauten Worker-Umgebung und gibt einen Auslöser
 * für den Mitteilungs-Klick zurück. `mitFenster` entscheidet, welcher der
 * beiden Wege genommen wird — beide öffnen etwas und gehören geprüft.
 */
function bühne(mitFenster: boolean): Bühne {
  const navigiert: string[] = []
  const geoeffnet: string[] = []
  const nachrichten: unknown[] = []

  const fenster: Fenster = {
    focus: () => 'fokussiert',
    navigate: (url) => {
      navigiert.push(url)
      return Promise.resolve(null)
    },
    postMessage: (msg) => {
      nachrichten.push(msg)
    },
  }

  const listeners = new Map<string, (event: unknown) => void>()
  const self = {
    location: { href: SCOPE + 'sw.js' },
    registration: { scope: SCOPE, showNotification: () => Promise.resolve() },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
    addEventListener: (art: string, fn: (event: unknown) => void) => listeners.set(art, fn),
  }
  const clients = {
    matchAll: () => Promise.resolve(mitFenster ? [fenster] : []),
    openWindow: (url: string) => {
      geoeffnet.push(url)
      return Promise.resolve(null)
    },
  }
  const caches = {
    open: () => Promise.resolve({ add: () => Promise.resolve(), put: () => Promise.resolve() }),
    keys: () => Promise.resolve([]),
    match: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(true),
  }

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'clients', 'caches', 'fetch', QUELLE)(self, clients, caches, () =>
    Promise.reject(new Error('kein Netz im Test')),
  )

  const klick = async (url: unknown): Promise<void> => {
    const fn = listeners.get('notificationclick')
    if (!fn) throw new Error('sw.js meldet keinen notificationclick an')
    let warten: Promise<unknown> = Promise.resolve()
    fn({
      notification: { close: () => {}, data: url === undefined ? undefined : { url } },
      waitUntil: (p: Promise<unknown>) => {
        warten = p
      },
    })
    await warten
  }

  return { navigiert, geoeffnet, nachrichten, klick }
}

/** Alles, wohin dieser Klick geführt hat — egal auf welchem Weg. */
function ziele(b: Bühne): string[] {
  return [...b.navigiert, ...b.geoeffnet]
}

describe('Service Worker: der Mitteilungs-Klick bleibt in der App', () => {
  let mitFenster: Bühne
  let ohneFenster: Bühne

  beforeEach(() => {
    mitFenster = bühne(true)
    ohneFenster = bühne(false)
  })

  it('das gewöhnliche Ziel kommt unverändert an', async () => {
    // Gegenprobe zu allem Weiteren: Griffe die Prüfung zu hart, landete auch
    // der Deep-Link im Nichts und die Mitteilung führte nirgendwo mehr hin.
    const ziel = `${SCOPE}#go=aufgaben`
    await mitFenster.klick(ziel)
    await ohneFenster.klick(ziel)
    expect(mitFenster.navigiert).toEqual([ziel])
    expect(ohneFenster.geoeffnet).toEqual([ziel])
    expect(mitFenster.nachrichten).toEqual([{ type: 'navigate', url: ziel }])
  })

  it.each([
    ['fremde Herkunft', 'https://evil.example/phish'],
    ['Protokoll-relativ', '//evil.example/phish'],
    ['dieselbe Herkunft, andere App', 'https://example.test/andere-app/'],
    ['Präfix-Trick ohne Schrägstrich', 'https://example.test/jw-congregation-planner-fremd/'],
    ['javascript:', 'javascript:alert(1)'],
    ['Datenadresse', 'data:text/html,<h1>x'],
  ])('%s führt in die App, nicht nach draußen', async (_name, url) => {
    await mitFenster.klick(url)
    await ohneFenster.klick(url)
    for (const gegangen of [...ziele(mitFenster), ...ziele(ohneFenster)]) {
      expect(gegangen).toBe(SCOPE)
    }
    // Auch das offene Fenster darf die fremde Adresse nicht zugestellt
    // bekommen: Es navigiert selbst, sobald es sie liest.
    expect(JSON.stringify(mitFenster.nachrichten)).not.toContain('evil.example')
    expect(JSON.stringify(mitFenster.nachrichten)).not.toContain('javascript:')
  })

  it.each([
    ['gar kein Ziel', undefined],
    ['leeres Ziel', ''],
  ])('%s öffnet die App statt zu scheitern', async (_name, url) => {
    await ohneFenster.klick(url)
    expect(ohneFenster.geoeffnet).toEqual([SCOPE])
  })

  it.each([
    ['Zahl', 42],
    ['Objekt', { boese: 'https://evil.example/' }],
    ['null', null],
  ])('%s als Ziel bleibt in jedem Fall innerhalb der App', async (_name, url) => {
    // Was keine Adresse ist, wird zu einer relativen — die löst gegen den
    // Geltungsbereich auf und bleibt damit drinnen. Geprüft wird genau das,
    // nicht eine bestimmte Zeichenkette.
    await ohneFenster.klick(url)
    expect(ohneFenster.geoeffnet).toHaveLength(1)
    expect(ohneFenster.geoeffnet[0].startsWith(SCOPE)).toBe(true)
  })

  it('ein Unterpfad der App bleibt erlaubt', async () => {
    const ziel = `${SCOPE}index.html#go=programm`
    await ohneFenster.klick(ziel)
    expect(ohneFenster.geoeffnet).toEqual([ziel])
  })

  it('jeder Klick öffnet genau ein Ziel', async () => {
    // Sonst könnte die Prüfung „die App zusätzlich" öffnen und das fremde
    // Ziel trotzdem durchlassen — beide Zusagen wären erfüllt, die Absicht
    // nicht.
    await mitFenster.klick('https://evil.example/phish')
    expect(ziele(mitFenster)).toHaveLength(1)
  })
})
