import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { antwort, ladeServiceWorker, swQuelle } from './sw-umgebung'
import { alsCacheName, SW_PLATZHALTER, swMitKennung } from '../scripts/sw-kennung.mjs'

/**
 * **Der Service Worker, endlich nachgemessen.**
 *
 * Er war die einzige Datei ohne jede Prüfung — und die mit den teuersten
 * Fehlerbildern: Ein kaputter Offline-Start zeigt der installierten App eine
 * Browser-Fehlerseite, eine verschluckte Benachrichtigung erreicht niemanden.
 * Beide melden sich nicht; man merkt sie erst, wenn jemand nicht erscheint.
 *
 * Geprüft wird die **ausgelieferte Datei selbst** (`tests/sw-umgebung.ts` lädt
 * sie in eine nachgebaute Worker-Umgebung), nicht eine Abschrift.
 */

const SCOPE = 'https://app.test/planner/'
const req = (url: string, extra: Record<string, unknown> = {}) => ({
  url: new URL(url, SCOPE).href,
  method: 'GET',
  mode: 'no-cors',
  ...extra,
})

describe('Service Worker: die Shell für den Offline-Start', () => {
  it('legt beim Installieren die Shell in den Cache', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('install', {})
    const cache = [...sw.speicher.values()][0]
    expect(cache, 'gar kein Cache angelegt').toBeDefined()
    const abgelegt = [...cache!.eintraege.keys()].map((u) => u.replace(SCOPE, ''))
    expect(abgelegt).toContain('index.html')
    expect(abgelegt).toContain('manifest.webmanifest')
  })

  it('im Dev-Server bleibt das Caching aus', async () => {
    // Sonst finge der Worker Vites HMR ab.
    const sw = ladeServiceWorker({ dev: true })
    await sw.feuere('install', {})
    expect(sw.speicher.size).toBe(0)
  })

  it('offline liefert ein Seitenaufruf die gecachte Shell', async () => {
    /*
      Der eigentliche Zweck des Ganzen: Die installierte App startet ohne Netz
      mit ihrer eigenen Oberfläche statt mit einer Browser-Fehlerseite. Die
      Daten dazu kommen aus der Momentaufnahme im localStorage.
    */
    const sw = ladeServiceWorker()
    await sw.feuere('install', {})

    const offline = ladeServiceWorker({ netz: () => undefined })
    // Denselben Cache übernehmen, als wäre die App schon einmal online gewesen.
    for (const [name, c] of sw.speicher) offline.speicher.set(name, c)

    const res = await offline.feuere('fetch', {
      request: req('./', { mode: 'navigate' }),
    })
    expect(res, 'kein Rückfall auf die Shell — die App startet offline nicht').toBeDefined()
  })

  it('Supabase läuft ungefiltert durch — der Worker fasst fremde Daten nicht an', async () => {
    const sw = ladeServiceWorker()
    const res = await sw.feuere('fetch', {
      request: { url: 'https://xyz.supabase.co/rest/v1/weeks', method: 'GET', mode: 'cors' },
    })
    expect(res, 'der Worker hat die Datenabfrage beantwortet').toBeUndefined()
  })
})

describe('Service Worker: ein Besuch genügt für den Offline-Start', () => {
  /*
   * Gemessen am 1.10.2026 mit `vite preview`: einmal online öffnen, Server
   * stoppen, neu laden — **leere Seite**. Die Hülle kam aus dem Cache, das
   * Bündel nicht: Die Seite hatte es geladen, bevor der Worker die Kontrolle
   * übernahm, also lief der Abruf an ihm vorbei. Erst ein zweiter Besuch legte
   * es ab. Wer die App einmal daheim öffnet und danach ohne Netz im Saal steht,
   * hätte nichts gesehen.
   */
  const INDEX = `<!doctype html><html><head>
    <link rel="icon" type="image/svg+xml" href="/logo.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/react-def456.js">
    <link rel="stylesheet" crossorigin href="/assets/index-789xyz.css">
  </head><body><div id="root"></div></body></html>`
  const BUENDEL = [
    'https://app.test/assets/index-abc123.js',
    'https://app.test/assets/react-def456.js',
    'https://app.test/assets/index-789xyz.css',
  ]
  const mitIndex = (u: string) => (u.endsWith('/index.html') ? antwort(u, true, 'basic', INDEX) : antwort(u))
  const abgelegt = (sw: ReturnType<typeof ladeServiceWorker>) =>
    [...sw.speicher.values()].flatMap((c) => [...c.eintraege.keys()])

  it('beim Installieren landen auch die Bündel aus index.html im Cache', async () => {
    const sw = ladeServiceWorker({ netz: mitIndex })
    await sw.feuere('install', {})
    expect(abgelegt(sw)).toEqual(expect.arrayContaining(BUENDEL))
  })

  it('offline nach nur einem Besuch kommen Seite und Bündel aus dem Cache', async () => {
    const online = ladeServiceWorker({ netz: mitIndex })
    await online.feuere('install', {})
    const offline = ladeServiceWorker({ netz: () => undefined })
    for (const [name, c] of online.speicher) offline.speicher.set(name, c)

    const seite = await offline.feuere('fetch', { request: req('./', { mode: 'navigate' }) })
    expect(seite, 'keine Hülle').toBeDefined()
    for (const url of BUENDEL) {
      const res = await offline.feuere('fetch', { request: { url, method: 'GET', mode: 'cors' } })
      expect(res, `${url} fehlt — die Seite bliebe leer`).toBeDefined()
    }
  })

  it('das Modul-Skript der Seite trifft das vorab abgelegte Bündel — auch bei „Vary: Origin"', async () => {
    /*
     * Gemessen am 1.10.2026 mit `vite preview`, nach dem Vorab-Ablegen: Die
     * Bündel lagen im Cache, die Seite blieb offline trotzdem leer. Der Server
     * schickt `Vary: Origin`; abgelegt hat der Worker ohne `Origin`, die Seite
     * fragt das Modul-Skript (`crossorigin`) mit einem an — kein Treffer.
     * Gehashte Bündel sind unveränderlich; der Abgleich über `Vary` ist dort
     * ohne Sinn.
     */
    const mitVary = (u: string) =>
      u.endsWith('/index.html') ? antwort(u, true, 'basic', INDEX) : antwort(u, true, 'basic', '', 'Origin')
    const online = ladeServiceWorker({ netz: mitVary })
    await online.feuere('install', {})
    const offline = ladeServiceWorker({ netz: () => undefined })
    for (const [name, c] of online.speicher) offline.speicher.set(name, c)

    const modul = { url: BUENDEL[0], method: 'GET', mode: 'cors', headers: { origin: 'https://app.test' } }
    expect(await offline.feuere('fetch', { request: modul }), 'Bündel liegt da, wird aber nicht gefunden').toBeDefined()
  })

  it('fehlt ein Bündel im Netz, legt die Installation die übrigen trotzdem ab', async () => {
    const sw = ladeServiceWorker({ netz: (u) => (u.includes('react-') ? undefined : mitIndex(u)) })
    await sw.feuere('install', {})
    const da = abgelegt(sw)
    expect(da).toContain(BUENDEL[0])
    expect(da).toContain(BUENDEL[2])
    expect(da).not.toContain(BUENDEL[1])
  })

  it('ohne index.html im Cache bleibt es bei der Hülle — kein Absturz', async () => {
    const sw = ladeServiceWorker({ netz: (u) => (u.endsWith('/index.html') ? undefined : antwort(u)) })
    await sw.feuere('install', {})
    expect(abgelegt(sw).some((u) => u.includes('/assets/'))).toBe(false)
  })
})

describe('Service Worker: der Cache räumt sich auf (V9)', () => {
  it('beim Aktivieren fliegt jeder fremde Cache heraus', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('install', {})
    const eigener = [...sw.speicher.keys()][0]!
    // Ein Cache aus einem früheren Stand.
    sw.speicher.set('shell-alt', sw.speicher.get(eigener)!)

    await sw.feuere('activate', {})
    expect([...sw.speicher.keys()]).toEqual([eigener])
  })

  it('der Cache-Name trägt die Kennung des Stands', async () => {
    /*
      **Der Kern von V9.** `activate` löscht nur Caches mit *anderem* Namen —
      hieß er immer gleich (`shell-v1`), wurde nie etwas gelöscht. Die
      gehashten Assets jedes Builds blieben unbegrenzt liegen, und irgendwann
      räumt der Browser unter Speicherdruck die ganze Herkunft ab, samt der
      Offline-Momentaufnahme im localStorage.

      Und der Name muss sich mit dem Stand ändern, nicht nur variabel sein:
      `activate` läuft überhaupt nur, wenn sich `sw.js` selbst geändert hat.
      Die Kennung im Namen ist deshalb beides — der Grund für das Aufräumen
      **und** der Auslöser dafür.
    */
    // Die ganze Kette in einem Zug: Der ausgelieferte Worker trägt den
    // Platzhalter, der Bauschritt ersetzt ihn, und der Cache heißt danach nach
    // dem Stand. Fehlt ein Glied, fällt es hier auf — nicht erst nach dem
    // dritten Deployment an einem vollen Speicher.
    const roh = ladeServiceWorker()
    await roh.feuere('install', {})
    const platzhalter = [...roh.speicher.keys()][0]!
    expect(platzhalter, 'der Cache-Name ist wieder fest verdrahtet').toContain(SW_PLATZHALTER)

    const { quelle, ersetzt } = swMitKennung(swQuelle(), alsCacheName('a1b2c3d'))
    expect(ersetzt).toBe(true)
    const gebaut = ladeServiceWorker({ quelle })
    await gebaut.feuere('install', {})
    expect([...gebaut.speicher.keys()]).toEqual(['shell-a1b2c3d'])
  })

  it('ein Stand räumt den Cache des vorigen weg', () => {
    // Der eigentliche Zweck: Zwei Stände haben verschiedene Namen, und
    // `activate` löscht jeden fremden. Das war mit `shell-v1` unmöglich.
    const a = swMitKennung(swQuelle(), alsCacheName('a1b2c3d')).quelle
    const b = swMitKennung(swQuelle(), alsCacheName('9f8e7d6')).quelle
    expect(a).not.toBe(b)
  })
})

describe('Service Worker: Benachrichtigungen (V10)', () => {
  const push = (data: unknown) => ({ data: { json: () => data } })

  it('zeigt Titel und Rumpf aus der Nutzlast', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Erinnerung', body: 'Bibellesung', url: '#go=aufgaben' }))
    expect(sw.meldungen[0]?.[0]).toBe('Erinnerung')
    expect(sw.meldungen[0]?.[1].body).toBe('Bibellesung')
  })

  it('gleiche Art ersetzt statt zu stapeln', async () => {
    /*
      **V10.** Ohne `tag` legt jede Erinnerung eine weitere Meldung auf den
      Sperrbildschirm. Bei täglicher Wiederholung stehen dort nach einer Woche
      sieben Mal dieselbe Sache, und die eine neue Nachricht daneben geht darin
      unter. Ein `tag` je Art ersetzt die vorige.

      `renotify` gehört dazu: Eine Ersetzung ohne es wäre lautlos, und der
      Leser bekäme von der neuen Fassung nichts mit.
    */
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Erinnerung', body: 'Montag' }))
    const opt = sw.meldungen[0]?.[1] ?? {}
    expect(opt.tag, 'ohne tag stapeln sich die Erinnerungen').toBeTruthy()
    expect(opt.renotify, 'die Ersetzung bliebe lautlos').toBe(true)
  })

  it('der Absender darf die Art bestimmen', async () => {
    // Damit sich später verschiedene Sorten getrennt bündeln lassen, ohne den
    // Worker erneut anzufassen.
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Ersatz gesucht', tag: 'ersatz' }))
    expect(sw.meldungen[0]?.[1].tag).toBe('ersatz')
  })

  it('ohne Nutzlast bleibt es bei den Standardtexten', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('push', { data: null })
    expect(sw.meldungen[0]?.[0]).toBe('Versammlung.app')
  })
})

describe('Service Worker: der Klick führt nur in die eigene App', () => {
  const klick = (url: string) => ({
    notification: { close: () => {}, data: { url } },
  })

  it('ein fremdes Ziel wird durch die App ersetzt', async () => {
    // Wer eine Mitteilung zustellen darf, bestimmt sonst, wohin ein Klick führt.
    const sw = ladeServiceWorker()
    await sw.feuere('notificationclick', klick('https://boese.test/'))
    expect(sw.geoeffnet).toEqual([SCOPE])
  })

  it('ein Präfix-Nachbar zählt nicht als eigene App', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('notificationclick', klick('https://app.test/planner-fremd/'))
    expect(sw.geoeffnet).toEqual([SCOPE])
  })

  it('ein eigenes Ziel wird geöffnet', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('notificationclick', klick('#go=aufgaben'))
    expect(sw.geoeffnet[0]).toBe(`${SCOPE}#go=aufgaben`)
  })

  it('ein offenes Fenster bekommt das Ziel auf beiden Wegen', async () => {
    // Je nach Browser greift mal postMessage, mal client.navigate.
    const sw = ladeServiceWorker({ fenster: [{ navigate: true }] })
    await sw.feuere('notificationclick', klick('#go=planen'))
    expect(sw.gesendet).toEqual([{ type: 'navigate', url: `${SCOPE}#go=planen` }])
    expect(sw.geoeffnet).toEqual([`${SCOPE}#go=planen`])
  })
})

describe('Service Worker: Assets', () => {
  it('gehashte Assets kommen beim zweiten Mal aus dem Cache', async () => {
    const sw = ladeServiceWorker()
    const asset = req('assets/index-abc123.js')
    await sw.feuere('fetch', { request: asset })
    await sw.feuere('fetch', { request: asset })
    expect(sw.geholt.filter((u) => u.includes('assets/')).length, 'zweimal geholt').toBe(1)
  })

  it('index.html kommt immer zuerst aus dem Netz', async () => {
    // Sonst zeigte die App nach einem Deployment weiter den alten Stand.
    const sw = ladeServiceWorker()
    await sw.feuere('fetch', { request: req('index.html') })
    await sw.feuere('fetch', { request: req('index.html') })
    expect(sw.geholt.filter((u) => u.endsWith('index.html')).length).toBe(2)
  })

  it('eine fehlgeschlagene Antwort landet nicht im Cache', async () => {
    // Sonst servierte der Worker eine 404-Seite als Anwendung.
    const sw = ladeServiceWorker({ netz: (u) => antwort(u, false) })
    await sw.feuere('fetch', { request: req('assets/index-abc123.js') })
    const abgelegt = [...sw.speicher.values()].flatMap((c) => [...c.eintraege.keys()])
    expect(abgelegt).toEqual([])
  })

  it('kennt keine fremden Schrift-Hosts mehr — die Schriften liegen unter /assets/', () => {
    // Bis August 2026 kamen sie von Google; der Zweig dafür stand noch bis zum
    // 25.9.2026 da, obwohl `src/styles/fonts.css` sie längst selbst auslieferte.
    expect(swQuelle()).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|FONT_HOSTS/)
  })
})

describe('… und der Absender nutzt das auch (Ersatzgesuche)', () => {
  /**
   * **Die andere Hälfte desselben Vertrags.**
   *
   * Der Worker bündelt nach `data.tag` und fällt ohne ihn auf den **Titel**
   * zurück. Das ist für eine täglich wiederholte Erinnerung genau richtig — und
   * für ein Ersatzgesuch falsch: Alle tragen den Titel „Ersatz gesucht", das
   * zweite offene Gesuch löschte damit das erste vom Sperrbildschirm. Geschickt
   * hat den `tag` lange gar niemand; das Feld war im Worker vorgesehen und im
   * Versand nicht vorhanden.
   *
   * Geprüft wird deshalb der Quelltext beider Seiten: Trägt die Nutzlast den
   * `tag`, und gibt `substitute` je Aufgabe einen mit?
   */
  const lies = (rel: string): string =>
    readFileSync(new URL(rel, import.meta.url), 'utf8')

  it('die Push-Nutzlast trägt den tag', () => {
    const push = lies('../supabase/functions/_shared/push.ts')
    expect(push).toContain('tag?: string')
    expect(push, 'der tag steht in der Schnittstelle, geht aber nicht hinaus').toMatch(
      /JSON\.stringify\(\{[^}]*tag/,
    )
  })

  it('substitute gibt je Aufgabe einen eigenen tag mit', () => {
    const quelle = lies('../supabase/functions/substitute/index.ts')
    // Beide Meldungen dieser Function betreffen genau eine Aufgabe: das Gesuch
    // und die Entwarnung danach.
    const mitTag = [...quelle.matchAll(/payload\.taskKey/g)].length
    expect(mitTag, 'zu wenige Stellen reichen den Aufgabenschlüssel weiter').toBeGreaterThanOrEqual(3)
    expect(quelle).toContain('pushTag')
  })
})
