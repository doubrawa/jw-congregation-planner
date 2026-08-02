/** @vitest-environment jsdom */
/*
 * Schwerpunkt liegt auf dem, was NICHT passieren darf: ein Neuladen zur
 * falschen Zeit reißt dem Nutzer die App unter den Fingern weg — schlimmer als
 * eine Fassung, die einen Wechsel später ankommt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateAvailable, watchForUpdates } from './version'

const LAEUFT = 'index-AAAA1111.js'
const NEU = 'index-BBBB2222.js'

/** Das Skript-Tag, an dem die laufende Fassung erkannt wird. */
function setRunning(name: string | null): void {
  document.head.innerHTML = ''
  if (name) {
    const s = document.createElement('script')
    s.type = 'module'
    s.setAttribute('src', `./assets/${name}`)
    document.head.appendChild(s)
  }
}

/** Antwort des Servers auf index.html. */
function serve(name: string | null, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      text: async () => (name ? `<script type="module" src="./assets/${name}"></script>` : '<html></html>'),
    })),
  )
}

function becomeVisible(state: DocumentVisibilityState = 'visible'): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  setRunning(LAEUFT)
  document.body.innerHTML = ''
  sessionStorage.clear()
  serve(LAEUFT)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('updateAvailable', () => {
  it('meldet den neuen Bündelnamen, wenn ausgeliefert ≠ laufend', async () => {
    serve(NEU)
    await expect(updateAvailable()).resolves.toBe(NEU)
  })

  it('meldet nichts, wenn die Fassung dieselbe ist', async () => {
    await expect(updateAvailable()).resolves.toBeNull()
  })

  it('meldet nichts ohne Netz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await expect(updateAvailable()).resolves.toBeNull()
  })

  it('meldet nichts bei einer Fehlerantwort', async () => {
    serve(NEU, false)
    await expect(updateAvailable()).resolves.toBeNull()
  })

  it('meldet nichts, wenn im HTML kein Bündel steht', async () => {
    serve(null)
    await expect(updateAvailable()).resolves.toBeNull()
  })

  it('meldet nichts, wenn die laufende Fassung unbekannt ist', async () => {
    setRunning(null)
    serve(NEU)
    await expect(updateAvailable()).resolves.toBeNull()
  })
})

describe('watchForUpdates', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0))

  // Jeder Beobachter hängt sich ans document. Ohne Abräumen liefen die aus
  // früheren Tests weiter mit und verfälschten die Zählungen.
  const laufende: Array<() => void> = []
  const start = (reload: () => void) => {
    const stop = watchForUpdates(reload)
    laufende.push(stop)
    return stop
  }
  afterEach(() => {
    laufende.splice(0).forEach((stop) => stop())
  })

  it('lädt beim Zurückkehren neu, wenn eine neue Fassung da ist', async () => {
    serve(NEU)
    const reload = vi.fn()
    start(reload)
    becomeVisible()
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('lädt NICHT neu, wenn die Fassung schon aktuell ist', async () => {
    const reload = vi.fn()
    start(reload)
    becomeVisible()
    await flush()
    expect(reload).not.toHaveBeenCalled()
  })

  it('lädt NICHT neu, während ein Sheet offen ist', async () => {
    // Sonst verschwindet mitten in einer Zuteilung die halbe Eingabe.
    serve(NEU)
    document.body.innerHTML = '<div class="sheet"></div>'
    const reload = vi.fn()
    start(reload)
    becomeVisible()
    await flush()
    expect(reload).not.toHaveBeenCalled()
  })

  it('lädt NICHT neu, während ein Dialog offen ist', async () => {
    serve(NEU)
    document.body.innerHTML = '<div role="dialog"></div>'
    const reload = vi.fn()
    start(reload)
    becomeVisible()
    await flush()
    expect(reload).not.toHaveBeenCalled()
  })

  it('prüft nichts, wenn die App in den Hintergrund geht', async () => {
    serve(NEU)
    const reload = vi.fn()
    start(reload)
    becomeVisible('hidden')
    await flush()
    expect(reload).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fragt bei schnellem Hin und Her nicht bei jedem Wechsel nach', async () => {
    // App-Wechsel kommen im Sekundentakt; jedes Mal index.html zu laden wäre
    // Unfug.
    const reload = vi.fn()
    start(reload)
    becomeVisible()
    await flush()
    becomeVisible()
    becomeVisible()
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('lädt für dieselbe Fassung kein zweites Mal (Schleifenschutz)', async () => {
    // Käme das Neuladen nicht durch, liefe die App sonst in eine Dauerschleife.
    serve(NEU)
    const reload = vi.fn()
    const stop = start(reload)
    becomeVisible()
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
    stop()

    start(reload) // wie nach einem gescheiterten Neuladen
    becomeVisible()
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('nach dem Abmelden wird nicht mehr geprüft', async () => {
    serve(NEU)
    const reload = vi.fn()
    start(reload)()
    becomeVisible()
    await flush()
    expect(reload).not.toHaveBeenCalled()
  })
})
