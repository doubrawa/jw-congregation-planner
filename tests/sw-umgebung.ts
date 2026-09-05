/**
 * **Eine nachgebaute Service-Worker-Umgebung.**
 *
 * `public/sw.js` war die einzige Datei dieses Projekts, an der nichts geprüft
 * werden konnte — und ausgerechnet dort sind die Fehlerbilder am teuersten: ein
 * kaputter Offline-Start und Benachrichtigungen, die nicht ankommen. Genau
 * deshalb blieben zwei bekannte Befunde (V9, V10) den ganzen Tag liegen: Eine
 * Änderung ohne Nachweis wäre dort die schlechteste aller Möglichkeiten.
 *
 * Der Worker ist einfaches JavaScript und braucht nur eine Handvoll Globale.
 * Sie stehen hier — klein gehalten, aber mit dem Verhalten, auf das der Worker
 * sich verlässt: `caches` ist ein echter Speicher (was hineingelegt wird, kommt
 * wieder heraus), `fetch` antwortet nach Vorgabe und kann auch scheitern.
 *
 * Geladen wird die **ausgelieferte Datei selbst**, nicht eine Abschrift: Der
 * Quelltext wird gelesen und mit diesen Globalen ausgeführt. Was hier geprüft
 * ist, gilt damit für das, was auf dem Gerät läuft.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Eine Antwort, wie der Worker sie erwartet. */
export interface FakeResponse {
  ok: boolean
  type?: string
  url?: string
  clone: () => FakeResponse
}

/** Der ausgelieferte Worker im Original — so, wie er in `public/` liegt. */
export function swQuelle(): string {
  return readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8')
}

export function antwort(url: string, ok = true, type = 'basic'): FakeResponse {
  const res: FakeResponse = { ok, type, url, clone: () => res }
  return res
}

/** Ein Cache-Speicher, der sich merkt, was hineingelegt wurde. */
class FakeCache {
  readonly eintraege = new Map<string, FakeResponse>()
  add(request: { url: string }): Promise<void> {
    this.eintraege.set(request.url, antwort(request.url))
    return Promise.resolve()
  }
  put(request: { url: string }, res: FakeResponse): Promise<void> {
    this.eintraege.set(request.url, res)
    return Promise.resolve()
  }
  match(request: { url: string } | string): Promise<FakeResponse | undefined> {
    const url = typeof request === 'string' ? request : request.url
    return Promise.resolve(this.eintraege.get(url))
  }
}

export interface SwUmgebung {
  /** Ein Ereignis an den Worker geben; wartet auf `waitUntil`/`respondWith`. */
  feuere: (typ: string, event: Record<string, unknown>) => Promise<unknown>
  /** Alle Cache-Speicher, nach Namen. */
  speicher: Map<string, FakeCache>
  /** Die Aufrufe von `showNotification`: [Titel, Optionen]. */
  meldungen: Array<[string, Record<string, unknown>]>
  /** Die Adressen, die der Worker aus dem Netz geholt hat. */
  geholt: string[]
  skipWaiting: () => void
  /** Nachrichten an offene Fenster und `openWindow`-Ziele. */
  gesendet: unknown[]
  geoeffnet: string[]
}

export interface SwOptionen {
  /** Registrierung mit `?dev=1` — dann ist das Caching aus. */
  dev?: boolean
  scope?: string
  /** Antwort je Adresse; fehlt eine, wirft `fetch` (offline). */
  netz?: (url: string) => FakeResponse | undefined
  /** Bereits offene Fenster (für `notificationclick`). */
  fenster?: Array<{ focus?: boolean; navigate?: boolean }>
  /**
   * Anderer Quelltext statt `public/sw.js` — für die Fassung, wie sie der
   * Bauschritt ausliefert (Stand-Kennung eingetragen).
   */
  quelle?: string
}

/**
 * Den ausgelieferten Worker laden und seine Ereignis-Hörer greifbar machen.
 */
export function ladeServiceWorker(opts: SwOptionen = {}): SwUmgebung {
  const scope = opts.scope ?? 'https://app.test/planner/'
  const speicher = new Map<string, FakeCache>()
  const meldungen: Array<[string, Record<string, unknown>]> = []
  const geholt: string[] = []
  const gesendet: unknown[] = []
  const geoeffnet: string[] = []
  const hoerer = new Map<string, (e: Record<string, unknown>) => void>()
  let skipWaitingGerufen = false

  const caches = {
    open: (name: string) => {
      const vorhanden = speicher.get(name) ?? new FakeCache()
      speicher.set(name, vorhanden)
      return Promise.resolve(vorhanden)
    },
    keys: () => Promise.resolve([...speicher.keys()]),
    delete: (name: string) => Promise.resolve(speicher.delete(name)),
    match: async (request: { url: string } | string) => {
      const url = typeof request === 'string' ? request : request.url
      for (const c of speicher.values()) {
        const hit = c.eintraege.get(url)
        if (hit) return hit
      }
      return undefined
    },
  }

  const fensterListe = (opts.fenster ?? []).map((f, i) => {
    const client: Record<string, unknown> = {
      id: `w${i}`,
      postMessage: (m: unknown) => gesendet.push(m),
    }
    if (f.focus !== false) client.focus = () => Promise.resolve(client)
    if (f.navigate) client.navigate = (u: string) => {
      geoeffnet.push(u)
      return Promise.resolve(client)
    }
    return client
  })

  const clients = {
    matchAll: () => Promise.resolve(fensterListe),
    openWindow: (u: string) => {
      geoeffnet.push(u)
      return Promise.resolve(null)
    },
    claim: () => Promise.resolve(),
  }

  const self = {
    // Eine echte `URL`, keine Attrappe mit nur `href`: Der Worker liest auch
    // `self.location.origin` (im fetch-Hörer), und ein fehlendes Feld hätte den
    // ganzen Zweig stillschweigend übersprungen — der Prüfstand hätte grün
    // gemeldet, dass nichts geholt wurde.
    location: new URL(`${scope}sw.js${opts.dev ? '?dev=1' : ''}`),
    addEventListener: (typ: string, fn: (e: Record<string, unknown>) => void) => {
      hoerer.set(typ, fn)
    },
    skipWaiting: () => {
      skipWaitingGerufen = true
    },
    clients,
    registration: {
      scope,
      showNotification: (titel: string, opt: Record<string, unknown>) => {
        meldungen.push([titel, opt])
        return Promise.resolve()
      },
    },
  }

  const fetchFake = (request: { url: string } | string) => {
    const url = typeof request === 'string' ? request : request.url
    geholt.push(url)
    const res = opts.netz ? opts.netz(url) : antwort(url)
    return res ? Promise.resolve(res) : Promise.reject(new Error(`offline: ${url}`))
  }

  class FakeRequest {
    url: string
    method = 'GET'
    mode = 'no-cors'
    constructor(input: string) {
      this.url = new URL(input, scope).href
    }
  }

  const quelle = opts.quelle ?? swQuelle()
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const lauf = new Function('self', 'caches', 'clients', 'fetch', 'Request', quelle) as (
    ...args: unknown[]
  ) => void
  lauf(self, caches, clients, fetchFake, FakeRequest)

  return {
    speicher,
    meldungen,
    geholt,
    gesendet,
    geoeffnet,
    skipWaiting: () => skipWaitingGerufen as unknown as void,
    async feuere(typ, event) {
      const fn = hoerer.get(typ)
      if (!fn) throw new Error(`kein Hörer für ${typ}`)
      let erwartet: Promise<unknown> | undefined
      let antwortete: Promise<unknown> | undefined
      fn({
        ...event,
        waitUntil: (p: Promise<unknown>) => {
          erwartet = p
        },
        respondWith: (p: Promise<unknown>) => {
          antwortete = p
        },
      })
      if (erwartet) await erwartet
      return antwortete ? await antwortete : undefined
    },
  }
}
