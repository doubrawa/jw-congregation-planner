import { describe, expect, it } from 'vitest'
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
    expect(sw.meldungen[0]?.[0]).toBe('Congregation Planner')
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
})
