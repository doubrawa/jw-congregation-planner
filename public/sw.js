/*
 * Service Worker: (1) zeigt Web-Push-Benachrichtigungen an (send-reminders) und
 * öffnet beim Antippen die App, (2) cacht die App-Shell, damit die installierte
 * App offline startet statt eine Browser-Fehlerseite zu zeigen.
 *
 * Nicht gecacht werden Supabase-Aufrufe (fremder Origin, dynamisch) — die
 * Daten selbst hält src/lib/snapshot.ts als Momentaufnahme im localStorage.
 *
 * Im Dev-Server ist das Caching aus (Registrierung mit `?dev=1`, siehe
 * src/lib/push.ts) — es würde Vites HMR abfangen. Push funktioniert trotzdem.
 */

/*
 * **Der Cache-Name trägt die Kennung des Stands** (V9). Beim Bauen ersetzt
 * (`scripts/sw-kennung.mjs`); im Dev-Server bleibt der Platzhalter stehen, dort
 * ist das Caching ohnehin aus.
 *
 * `activate` löscht jeden Cache mit **anderem** Namen, und es läuft nur, wenn
 * sich diese Datei geändert hat. Die Kennung ist deshalb beides zugleich — der
 * Grund fürs Aufräumen und sein Auslöser.
 */
const CACHE = 'shell-__BUILD_ID__'
const DEV = new URL(self.location.href).searchParams.has('dev')

// Relative URLs lösen gegen den SW-Pfad auf, also den App-Basispfad
// (unter versammlung.app und im Dev gleichermaßen /).
// Die Hülle: Ohne sie startet die App offline nicht.
const SHELL = ['./', 'index.html']
// Beiwerk: `logo-klein.svg` ist das Favicon, `icon-192.png` sein Ersatz. Fehlt
// eines, startet die App trotzdem. Das Logo in der App (Menü, Anmeldung)
// zeichnet `bausteine/Logo.tsx` selbst.
const BEIWERK = ['manifest.webmanifest', 'logo-klein.svg', 'icon-192.png']

/**
 * Die gehashten Bündel, auf die `index.html` verweist — Skript, vorab geladene
 * Module und Stylesheet (`src`/`href` unter `/assets/`).
 *
 * **Ohne sie startet die App offline nicht.** Der `fetch`-Hörer legt Assets
 * zwar beim Abruf ab, aber beim ersten Besuch lädt die Seite sie, bevor dieser
 * Worker die Kontrolle übernimmt — sie gehen an ihm vorbei. Deshalb legt sie
 * die Installation selbst ab.
 *
 * Gelesen wird die gerade abgelegte `index.html` selbst, keine Liste aus dem
 * Bauschritt: Sie ist die eine Stelle, die weiß, welche Bündel dieser Stand
 * braucht. Schriften und nachgeladene Sprachpakete stehen nicht darin; sie
 * kommen beim ersten Gebrauch über den `fetch`-Hörer dazu. Fehlen sie offline,
 * greifen Systemschrift und Englisch — die App startet trotzdem.
 */
function buendelAus(html) {
  return [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])
}

self.addEventListener('install', (event) => {
  // Neue SW-Fassung sofort aktiv werden lassen (statt bis zum Schließen aller
  // Fenster zu warten) — sonst laufen SW-Änderungen wie der Deep-Link-Klick
  // erst nach einem kompletten Neustart der App.
  self.skipWaiting()
  if (DEV) return
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      /*
       * **Hülle und Bündel ganz oder gar nicht.** Fehlt eines, scheitert die
       * Installation, und der bisherige Worker bleibt — mit seinem vollständigen
       * Cache. Ginge die Installation mit Lücken durch, räumte `activate` den
       * alten Cache weg, und die App startete offline mit einer leeren Seite.
       * `addAll` legt nichts ab, wenn eine Antwort fehlt.
       */
      await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))
      const index = await cache.match(new Request('index.html'))
      // Ohne `cache: 'reload'`: Die Namen tragen den Inhalts-Hash, und die
      // Seite hat sie eben erst geladen — der HTTP-Cache darf sie liefern.
      await cache.addAll(buendelAus(await index.text()).map((u) => new Request(u)))
      // Das Beiwerk darf fehlen.
      await Promise.allSettled(BEIWERK.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      // Offene Fenster sofort unter die Kontrolle dieser Fassung nehmen, damit
      // client.navigate() / postMessage aus notificationclick funktionieren.
      await self.clients.claim()
    })(),
  )
})

/** Aus dem Netz holen und (nur erfolgreiche Antworten) in den Cache legen. */
async function fromNetwork(request) {
  const res = await fetch(request)
  if (res && (res.ok || res.type === 'opaque')) {
    const cache = await caches.open(CACHE)
    void cache.put(request, res.clone())
  }
  return res
}

/**
 * Cache zuerst — für unveränderliche Dateien (gehashte Assets, Schriften).
 *
 * **`ignoreVary`**, weil der Inhalts-Hash im Namen schon alles sagt. Schickt der
 * Server `Vary: Origin` (`vite preview` tut es), trifft ein Eintrag sonst nur
 * eine Anfrage mit demselben `Origin`: Das beim Installieren abgelegte Bündel
 * (ohne `Origin`) fände das Modul-Skript der Seite (`crossorigin`, mit `Origin`)
 * nicht — offline bliebe die Seite leer, obwohl alles im Cache liegt.
 */
async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreVary: true })
  if (hit) return hit
  return fromNetwork(request)
}

/**
 * Netz zuerst, Cache als Rückfall — für HTML und selten geänderte Dateien.
 *
 * Ein Serverfehler (5xx) zählt wie kein Netz: Antwortet der Server beim Start
 * der installierten App mit einer Fehlerseite, kommt lieber die zuletzt
 * geladene Hülle — die App zeigt dann ihren letzten Stand.
 */
async function networkFirst(request, fallbackUrl) {
  try {
    const res = await fromNetwork(request)
    if (res.status < 500) return res
    return (await ausDemCache(request, fallbackUrl)) || res
  } catch (err) {
    const hit = await ausDemCache(request, fallbackUrl)
    if (hit) return hit
    throw err
  }
}

/** Die abgelegte Fassung der Anfrage, sonst die Hülle (`fallbackUrl`). */
async function ausDemCache(request, fallbackUrl) {
  const hit = await caches.match(request)
  if (hit) return hit
  return fallbackUrl ? caches.match(fallbackUrl) : undefined
}

self.addEventListener('fetch', (event) => {
  if (DEV) return
  const { request } = event
  if (request.method !== 'GET') return
  // Wer ausdrücklich nichts ablegen lässt (die Versionsprüfung, `lib/version.ts`),
  // kommt am Worker vorbei. Sonst läge danach die neue `index.html` im Cache,
  // ohne ihre Bündel: Offline mit Parametern gestartet (`?l=…`), bekäme die App
  // diese Hülle (`networkFirst`), und die Seite bliebe leer.
  if (request.cache === 'no-store') return
  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // Seitenaufruf (auch der Start der installierten App): immer die aktuelle
  // Fassung versuchen, offline die gecachte Shell ausliefern.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('index.html', self.registration.scope).href))
    return
  }

  if (url.origin === self.location.origin) {
    // Vite-Assets tragen einen Inhalts-Hash im Namen → unveränderlich.
    if (url.pathname.includes('/assets/')) {
      event.respondWith(cacheFirst(request))
    } else {
      event.respondWith(networkFirst(request))
    }
    return
  }

  // Alles Fremde (Supabase!) läuft ungefiltert durch — kein respondWith. Die
  // Schriften kommen aus dem Paket (`src/styles/fonts.css`) und damit über
  // `/assets/` oben.
})

/**
 * **Die Zahl am App-Symbol** (T184): wie viele Zuteilungen noch auf eine
 * Antwort warten. Ist die App zu, kann nur der Worker sie setzen — mit der
 * Zahl, die der Push mitbringt (`zahl`, `_shared/app-zahl.ts`). Ohne Zahl im
 * Push bleibt sie, wie sie ist; 0 leert das Symbol. Ein Browser ohne diese
 * Möglichkeit zeigt die Meldung trotzdem.
 */
function zahlSetzen(zahl) {
  if (typeof zahl !== 'number') return Promise.resolve()
  // Was das Symbol auch tut — die Meldung darf daran nicht scheitern. Ein
  // Browser ohne diese Möglichkeit (oder mit nur einer Hälfte) wirft hier; das
  // fängt dasselbe `catch` wie einen, der den Aufruf ablehnt.
  try {
    const nav = self.navigator
    return Promise.resolve(zahl > 0 ? nav.setAppBadge(zahl) : nav.clearAppBadge()).catch(() => {})
  } catch {
    return Promise.resolve()
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* kein JSON-Payload → Standardtexte */
  }
  const meldung = self.registration.showNotification(data.title || 'Versammlung.app', {
    body: data.body || '',
    icon: 'icon-192.png',
    // Android liest vom Badge nur den Alphakanal: nur Plätze und Pult, ohne
    // Kachel — mit `icon-192.png` stand dort ein weißer Klotz (make-icons.mjs).
    badge: 'badge-96.png',
    /*
     * **Gleiche Art ersetzt, statt zu stapeln** (V10). Ohne `tag` legt jede
     * Erinnerung eine weitere Meldung auf den Sperrbildschirm; bei täglicher
     * Wiederholung stehen dort nach einer Woche sieben Mal dieselbe Sache,
     * und die eine neue Nachricht daneben geht darin unter.
     *
     * Der Titel ist die Art („Erinnerung", „Ersatz gesucht") und damit der
     * natürliche Schlüssel. Der Absender darf ihn überschreiben, falls sich
     * eine Sorte später feiner trennen soll — dann ohne diese Datei erneut
     * anzufassen.
     *
     * `renotify` gehört dazu: Eine Ersetzung ohne es wäre lautlos, und vom
     * neuen Inhalt bekäme der Leser nichts mit. Verloren geht dabei nichts —
     * die Glocke in der App führt jede Zeile einzeln.
     */
    tag: data.tag || data.title || 'cp',
    renotify: true,
    data: { url: data.url || '.' },
  })
  event.waitUntil(Promise.all([meldung, zahlSetzen(data.zahl)]))
})

/**
 * Ziel eines Mitteilungs-Klicks — aber nur innerhalb dieser App.
 *
 * Die Adresse kommt aus der Push-Nutzlast. Heute baut sie der Server aus
 * `APP_URL` plus festem `#go=…`, aber wer eine Mitteilung zustellen darf,
 * bestimmt damit, wohin ein Klick führt. `openWindow` folgt jeder Adresse;
 * `navigate` bleibt zwar von sich aus in der Herkunft, meldet dann aber nur
 * einen Fehler. Deshalb wird hier verglichen, bevor irgendetwas geöffnet wird
 * — und im Zweifel die App selbst geöffnet.
 */
function zielInDerApp(roh) {
  // Der Geltungsbereich endet auf '/'; ohne diesen Schrägstrich wäre
  // '…/planner-fremd/' ein Präfixtreffer von '…/planner'.
  const scope = self.registration.scope
  const start = new URL(scope.endsWith('/') ? scope : scope + '/')
  try {
    const ziel = new URL(roh, start)
    return ziel.href.startsWith(start.href) ? ziel.href : start.href
  } catch {
    return start.href
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = zielInDerApp((event.notification.data && event.notification.data.url) || '.')
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          // Bereits offenes Fenster: Ziel (#go=…) auf zwei Wegen zustellen, weil
          // je nach Browser/Installationsart mal der eine, mal der andere greift:
          //  (a) postMessage — die App wertet es im message-Listener aus,
          //  (b) client.navigate — setzt den #go=-Hash, die App reagiert per
          //      hashchange. Danach den Fokus holen.
          client.postMessage({ type: 'navigate', url })
          if ('navigate' in client) {
            return client.navigate(url).then(
              (c) => (c || client).focus(),
              () => client.focus(),
            )
          }
          return client.focus()
        }
      }
      // Kein Fenster offen: neu öffnen; die App liest #go= aus der URL.
      return clients.openWindow(url)
    }),
  )
})
