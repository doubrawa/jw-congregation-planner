import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { antwort, ladeServiceWorker, swQuelle, type FakeResponse } from './sw-umgebung'
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

  /*
   * **Ganz oder gar nicht.** Ginge die Installation mit einer Lücke durch,
   * räumte `activate` den vollständigen Cache des bisherigen Stands weg — und
   * die App startete offline mit einer leeren Seite. Scheitert sie, bleibt der
   * bisherige Worker mit seinem Cache, und der Browser versucht es beim
   * nächsten Mal wieder.
   */
  const fehlt: Array<[string, (u: string) => FakeResponse | undefined]> = [
    ['nicht erreichbar', () => undefined],
    ['404', (u) => antwort(u, false)],
  ]

  it.each(fehlt)('fehlt ein Bündel (%s), scheitert die Installation', async (_, wie) => {
    const sw = ladeServiceWorker({ netz: (u) => (u.includes('react-') ? wie(u) : mitIndex(u)) })
    await expect(sw.feuere('install', {})).rejects.toThrow()
    expect(abgelegt(sw).filter((u) => u.includes('/assets/')), 'halb abgelegt').toEqual([])
  })

  it.each(fehlt)('fehlt ein Teil der Hülle (%s), scheitert die Installation', async (_, wie) => {
    for (const huelle of [SCOPE, `${SCOPE}index.html`]) {
      const sw = ladeServiceWorker({ netz: (u) => (u === huelle ? wie(u) : mitIndex(u)) })
      await expect(sw.feuere('install', {}), huelle).rejects.toThrow()
    }
  })

  it('fehlt nur ein Bild oder das Manifest, geht die Installation trotzdem durch', async () => {
    // Ohne sie startet die App genauso — eine umbenannte Datei soll nicht jede
    // künftige Fassung des Workers aufhalten.
    const beiwerk = /(manifest\.webmanifest|logo-klein\.svg|icon-192\.png)$/
    const sw = ladeServiceWorker({ netz: (u) => (beiwerk.test(u) ? undefined : mitIndex(u)) })
    await sw.feuere('install', {})
    expect(abgelegt(sw)).toEqual(expect.arrayContaining([`${SCOPE}index.html`, ...BUENDEL]))
  })
})

describe('Service Worker: ein Serverfehler zählt wie kein Netz', () => {
  /*
   * Antwortet der Server beim Start der installierten App mit einer
   * Fehlerseite (5xx), kommt lieber die zuletzt abgelegte Hülle — die App
   * zeigt dann ihren letzten Stand statt der Fehlerseite.
   */
  const INDEX = '<!doctype html><title>Hülle</title>'
  const gestoert = async (status: number) => {
    const online = ladeServiceWorker({
      netz: (u) => (u.endsWith('/index.html') ? antwort(u, true, 'basic', INDEX) : antwort(u)),
    })
    await online.feuere('install', {})
    const sw = ladeServiceWorker({ netz: (u) => antwort(u, false, 'basic', 'Fehlerseite', undefined, status) })
    for (const [name, c] of online.speicher) sw.speicher.set(name, c)
    return sw
  }
  const seite = async (sw: ReturnType<typeof ladeServiceWorker>, url: string) =>
    (await sw.feuere('fetch', { request: req(url, { mode: 'navigate' }) })) as FakeResponse

  it.each([500, 503])('beim Start mit %i kommt die abgelegte Hülle', async (status) => {
    const sw = await gestoert(status)
    const res = await seite(sw, './')
    expect(res.status, 'die Fehlerseite des Servers statt der App').toBe(200)
  })

  it('eine Adresse, die nicht im Cache liegt, bekommt index.html', async () => {
    // Etwa der Start mit Parametern (`?l=…`): Der Cache kennt nur die Hülle.
    const res = await seite(await gestoert(502), './?l=fr')
    expect(await res.text()).toBe(INDEX)
  })

  it('ohne abgelegte Hülle bleibt es bei der Antwort des Servers', async () => {
    const sw = ladeServiceWorker({ netz: (u) => antwort(u, false, 'basic', 'Fehlerseite', undefined, 503) })
    const res = await seite(sw, './')
    expect(res.status).toBe(503)
  })
})

describe('Service Worker: die Versionsprüfung legt nichts ab', () => {
  /*
   * Sie fragt die ausgelieferte `index.html` mit `cache: 'no-store'` ab
   * (`lib/version.ts`). Legte der Worker die Antwort ab, stünde nach einem
   * Deployment die neue Hülle im Cache, ihre Bündel aber nicht. Offline mit
   * Parametern gestartet, bekäme die App genau diese Hülle — und bliebe leer.
   */
  const ALT = '<!doctype html><script type="module" src="/assets/index-alt111.js"></script>'
  const NEU = '<!doctype html><script type="module" src="/assets/index-neu222.js"></script>'

  it('nach der Prüfung bekommt ein Start mit Parametern offline weiter die abgelegte Hülle', async () => {
    const online = ladeServiceWorker({ netz: (u) => antwort(u, true, 'basic', u.endsWith('/index.html') ? ALT : '') })
    await online.feuere('install', {})
    // Inzwischen ist ein neuer Stand ausgeliefert.
    const pruefung = ladeServiceWorker({ netz: (u) => antwort(u, true, 'basic', u.endsWith('/index.html') ? NEU : '') })
    for (const [name, c] of online.speicher) pruefung.speicher.set(name, c)
    const res = await pruefung.feuere('fetch', { request: req('index.html', { mode: 'cors', cache: 'no-store' }) })
    expect(res, 'der Worker hat die Prüfung beantwortet').toBeUndefined()

    const offline = ladeServiceWorker({ netz: () => undefined })
    for (const [name, c] of online.speicher) offline.speicher.set(name, c)
    const start = (await offline.feuere('fetch', { request: req('./?l=fr', { mode: 'navigate' }) })) as FakeResponse
    expect(await start.text()).toBe(ALT)
  })

  it('Gegenprobe: eine gewöhnliche Abfrage derselben Datei geht weiter über den Worker', async () => {
    const sw = ladeServiceWorker({ netz: (u) => antwort(u, true, 'basic', NEU) })
    expect(await sw.feuere('fetch', { request: req('index.html', { mode: 'cors' }) })).toBeDefined()
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

  it('die Zahl am App-Symbol kommt mit dem Push — auch bei geschlossener App (T184)', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Neue Zuteilung', zahl: 3 }))
    expect(sw.zahlen).toEqual([3])
  })

  it('0 leert das Symbol', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Zuteilung zurückgezogen', zahl: 0 }))
    expect(sw.zahlen).toEqual([null])
  })

  it('Gegenprobe: ohne Zahl im Push bleibt sie, wie sie ist', async () => {
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Ersatz gesucht' }))
    expect(sw.zahlen).toEqual([])
  })

  it('ein Browser ohne Zahl am Symbol zeigt die Meldung trotzdem', async () => {
    const sw = ladeServiceWorker({ ohneZahl: true })
    await sw.feuere('push', push({ title: 'Neue Zuteilung', zahl: 3 }))
    expect(sw.meldungen).toHaveLength(1)
  })

  it('…ebenso einer, der nur das Setzen kennt oder dabei wirft', async () => {
    const nurSetzen = ladeServiceWorker({ navigator: { setAppBadge: () => Promise.resolve() } })
    await nurSetzen.feuere('push', push({ title: 'Zuteilung zurückgezogen', zahl: 0 }))
    expect(nurSetzen.meldungen).toHaveLength(1)
    const wirft = ladeServiceWorker({
      navigator: {
        setAppBadge: () => {
          throw new Error('nicht erlaubt')
        },
        clearAppBadge: () => Promise.resolve(),
      },
    })
    await wirft.feuere('push', push({ title: 'Neue Zuteilung', zahl: 2 }))
    expect(wirft.meldungen).toHaveLength(1)
  })

  it('in der Statusleiste stehen die Sitzreihen, kein weißer Klotz', async () => {
    /*
      Android liest vom Badge nur den Alphakanal und färbt jede deckende Stelle
      ein. Bis zum 29.10.2026 zeigte es auf `icon-192.png`, deckend bis auf die
      runden Ecken — in der Statusleiste stand ein weißer Klotz. Das Badge muss
      darum größtenteils durchsichtig sein: nur Plätze und Pult. `icon-192.png`
      deckt 78 % (gemessen am 29.10.2026), ein leeres Bild nichts.
    */
    const sw = ladeServiceWorker()
    await sw.feuere('push', push({ title: 'Erinnerung', body: 'Montag' }))
    const badge = String(sw.meldungen[0]?.[1].badge)
    const png = PNG.sync.read(readFileSync(new URL(`../public/${badge}`, import.meta.url)))
    let deckend = 0
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i]! > 0) deckend++
    const anteil = deckend / (png.width * png.height)
    expect(anteil, `${badge} deckt ${Math.round(anteil * 100)} % — eine Kachel statt der Plätze`).toBeLessThan(0.4)
    expect(anteil, `${badge} ist leer`).toBeGreaterThan(0.05)
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
