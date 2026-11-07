/**
 * **Chrome ohne Fenster** — finden, starten und per DevTools-Protokoll steuern.
 * Für die Laufzeit-Messung (`laufzeit-messung.mjs`) und die App-Icons
 * (`make-icons.mjs`).
 *
 * Ohne Abhängigkeit: Node bringt `WebSocket` seit Version 22 mit, und mehr
 * braucht das Protokoll nicht. Puppeteer oder Playwright brächten je einen
 * eigenen Browser mit — gemessen werden soll aber der, den die Nutzer haben.
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/** Wie lange ein einzelner Aufruf warten darf — Headless-Chrome hängt gelegentlich (T128). */
const AUFRUF_MS = 30_000

/** Unter Linux und macOS liegt Chrome im `PATH`, unter einem dieser Namen. */
const NAMEN_IM_PFAD = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

/**
 * Die üblichen Orte je System. Unter Windows `ProgramFiles` & Co. aus der
 * Umgebung, damit auch ein Chrome auf einem anderen Laufwerk gefunden wird.
 *
 * @param {string} plattform
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
function ueblicheOrte(plattform, env) {
  if (plattform === 'win32') {
    const unter = (ordner) => `${ordner}/Google/Chrome/Application/chrome.exe`
    return [
      unter(env.ProgramFiles ?? 'C:/Program Files'),
      unter(env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)'),
      ...(env.LOCALAPPDATA ? [unter(env.LOCALAPPDATA)] : []),
    ]
  }
  if (plattform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  }
  return (env.PATH ?? '').split(':').filter(Boolean).flatMap((ordner) => NAMEN_IM_PFAD.map((name) => `${ordner}/${name}`))
}

/**
 * **Wo Chrome liegt:** die Umgebungsvariable `CHROME`, sonst der erste übliche
 * Ort, an dem eine Datei liegt. In GitHub Actions ist das `google-chrome` im
 * `PATH`.
 *
 * @param {{ env?: Record<string, string | undefined>, plattform?: string, gibtEs?: (pfad: string) => boolean }} [umgebung]
 * @returns {string}
 */
export function chromeFinden({ env = process.env, plattform = process.platform, gibtEs = existsSync } = {}) {
  if (env.CHROME) return env.CHROME
  const gefunden = ueblicheOrte(plattform, env).find((pfad) => gibtEs(pfad))
  if (!gefunden) throw new Error('Chrome nicht gefunden — den Pfad in der Umgebungsvariablen CHROME angeben.')
  return gefunden
}

/**
 * Die **Trennwörterbücher** des installierten Chrome. Chrome lädt sie als
 * Komponente ins Profil nach; ein frisches Profil hat keine, und ohne sie trennt
 * Chrome kein Wort. Fehlt der Ordner, gibt es `null`.
 *
 * @param {{ env?: Record<string, string | undefined>, plattform?: string, gibtEs?: (pfad: string) => boolean }} [umgebung]
 * @returns {string | null}
 */
export function trennwoerterbuecher({ env = process.env, plattform = process.platform, gibtEs = existsSync } = {}) {
  const ordner =
    plattform === 'win32'
      ? `${env.LOCALAPPDATA}/Google/Chrome/User Data/hyphen-data`
      : plattform === 'darwin'
        ? `${homedir()}/Library/Application Support/Google/Chrome/hyphen-data`
        : `${homedir()}/.config/google-chrome/hyphen-data`
  return gibtEs(ordner) ? ordner : null
}

/**
 * Die Schalter, mit denen Chrome für eine Messung startet.
 *
 * - `--remote-debugging-port=0`: Chrome sucht sich den Port selbst und schreibt
 *   ihn ins Profil (`DevToolsActivePort`) — zwei Läufe stören sich nicht.
 * - Die drei `--disable-…backgrounding…`: Alle Tabs rechnen gleich schnell,
 *   auch die, die gerade nicht vorne liegen.
 * - `--disable-component-update`: Ohne Trennwörterbücher soll Chrome sie auch
 *   nicht mitten in der Messung nachladen — sonst misst der Lauf mal so, mal so.
 * - `--no-sandbox` nur in der CI: Ubuntu 24 erlaubt die Namensräume der
 *   Sandbox nicht jedem Prozess, und geladen wird dort nur die eigene App.
 *
 * @param {{ profil: string, trennung: boolean, ci: boolean }} optionen
 * @returns {string[]}
 */
export function startSchalter({ profil, trennung, ci }) {
  return [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    ...(trennung ? [] : ['--disable-component-update']),
    ...(ci ? ['--no-sandbox'] : []),
    'about:blank',
  ]
}

const schlaf = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** Bis Chrome seinen Port ins Profil geschrieben hat — oder vorher beendet ist. */
async function aktiverPort(profil, prozess) {
  const datei = join(profil, 'DevToolsActivePort')
  let beendet = false
  prozess.once('exit', () => (beendet = true))
  for (let i = 0; i < 200 && !beendet; i++) {
    if (existsSync(datei)) {
      const [port, pfad] = readFileSync(datei, 'utf8').split(/\r?\n/)
      if (port && pfad) return `ws://127.0.0.1:${port}${pfad}`
    }
    await schlaf(100)
  }
  throw new Error(beendet ? 'Chrome beendete sich gleich nach dem Start.' : 'Chrome meldet keinen Port (20 s).')
}

/**
 * Die Verbindung zum Browser. Tabs hängen als Sitzungen daran (`flatten`), ihre
 * Ereignisse tragen die `sessionId`.
 */
async function verbinden(adresse) {
  const ws = new WebSocket(adresse)
  await new Promise((ok, fehler) => {
    ws.onopen = ok
    ws.onerror = () => fehler(new Error(`Keine Verbindung zu Chrome (${adresse}).`))
  })
  let zaehler = 0
  const offen = new Map()
  const lauscher = new Set()
  ws.onmessage = (nachricht) => {
    const m = JSON.parse(String(nachricht.data))
    const warter = m.id === undefined ? undefined : offen.get(m.id)
    if (warter) {
      offen.delete(m.id)
      if (m.error) warter.fehler(new Error(`${warter.methode}: ${m.error.message}`))
      else warter.ok(m.result)
    } else if (m.method) for (const l of lauscher) l(m)
  }
  ws.onclose = () => {
    for (const w of offen.values()) w.fehler(new Error(`${w.methode}: Verbindung zu Chrome geschlossen`))
    offen.clear()
  }
  /**
   * @param {string} methode
   * @param {Record<string, unknown>} [params]
   * @param {string} [sessionId]
   * @returns {Promise<any>}
   */
  const sende = (methode, params = {}, sessionId) =>
    new Promise((ok, fehler) => {
      const id = ++zaehler
      const uhr = setTimeout(() => {
        offen.delete(id)
        fehler(new Error(`Zeitlimit: ${methode}`))
      }, AUFRUF_MS)
      offen.set(id, {
        methode,
        ok: (r) => (clearTimeout(uhr), ok(r)),
        fehler: (f) => (clearTimeout(uhr), fehler(f)),
      })
      ws.send(JSON.stringify(sessionId ? { id, method: methode, params, sessionId } : { id, method: methode, params }))
    })
  return { sende, lauscher, schliessen: () => ws.close() }
}

/**
 * **Ein Tab in eigenem Browser-Kontext** — mit eigenem Speicher, wie ein
 * privates Fenster. Parallele Tabs teilen so weder `localStorage` noch Cache.
 *
 * Er führt Buch über offene Netzanfragen (`netzRuhig`) und reicht seine
 * Ereignisse an `auf` weiter.
 */
async function tabOeffnen(verbindung) {
  const { sende, lauscher } = verbindung
  const { browserContextId } = await sende('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await sende('Target.createTarget', { url: 'about:blank', browserContextId })
  const { sessionId } = await sende('Target.attachToTarget', { targetId, flatten: true })
  const offeneAnfragen = new Set()
  const eigene = new Set()
  const verteiler = (m) => {
    if (m.sessionId !== sessionId) return
    if (m.method === 'Network.requestWillBeSent') offeneAnfragen.add(m.params.requestId)
    else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') offeneAnfragen.delete(m.params.requestId)
    for (const l of eigene) l(m)
  }
  lauscher.add(verteiler)
  /** @type {(methode: string, params?: Record<string, unknown>) => Promise<any>} */
  const tabSende = (methode, params) => sende(methode, params, sessionId)
  for (const domaene of ['Page', 'Runtime', 'Log', 'Network']) await tabSende(`${domaene}.enable`)

  /** Bis `methode` eintrifft (`true`) oder die Zeit um ist (`false`). */
  const einmal = (methode, ms) =>
    new Promise((ok) => {
      const fertig = (wert) => {
        clearTimeout(uhr)
        eigene.delete(l)
        ok(wert)
      }
      const l = (m) => m.method === methode && fertig(true)
      const uhr = setTimeout(() => fertig(false), ms)
      eigene.add(l)
    })

  return {
    sende: tabSende,
    /** Ereignisse dieses Tabs mithören; gibt eine Abmeldung zurück. */
    auf(l) {
      eigene.add(l)
      return () => eigene.delete(l)
    },
    /** Einen Ausdruck in der Seite auswerten, Versprechen eingeschlossen. Wirft, wenn er wirft. */
    async werte(ausdruck) {
      const r = await tabSende('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    },
    /** Eine Adresse laden und bis zum `load` warten — `false`, wenn er nicht kommt. */
    async laden(url, ms = 30_000) {
      offeneAnfragen.clear()
      const geladen = einmal('Page.loadEventFired', ms)
      const r = await tabSende('Page.navigate', { url })
      if (r.errorText) throw new Error(`${url}: ${r.errorText}`)
      return geladen
    },
    /**
     * Bis `ruhe` ms lang keine Anfrage offen war — nachgeladene Teile (Sprache,
     * QR-Baustein) sind dann da. `false`, wenn es nach `hoechstens` ms nicht
     * ruhig wurde.
     */
    async netzRuhig(ruhe = 300, hoechstens = 8_000) {
      const ende = Date.now() + hoechstens
      let ruhigSeit = offeneAnfragen.size ? 0 : Date.now()
      while (Date.now() < ende) {
        if (offeneAnfragen.size) ruhigSeit = 0
        else if (!ruhigSeit) ruhigSeit = Date.now()
        else if (Date.now() - ruhigSeit >= ruhe) return true
        await schlaf(50)
      }
      return false
    },
    async schliessen() {
      lauscher.delete(verteiler)
      await sende('Target.closeTarget', { targetId }).catch(() => {})
    },
  }
}

/**
 * **Chrome starten und verbinden.** Das Profil liegt in einem frischen Ordner
 * unter dem Temp-Verzeichnis, **nie im Repo**: Ein Profil dort legt beim ersten
 * Start Hunderte Dateien ab, der Dev-Server sieht sie und lädt jede gemessene
 * Seite neu (T128, 19.10.2026).
 *
 * @param {{ chrome?: string, trennung?: boolean }} [optionen] `trennung`: mit den
 *   Trennwörterbüchern des installierten Chrome, sonst ohne (wie in der CI)
 */
export async function starteChrome({ chrome = chromeFinden(), trennung = false } = {}) {
  const profil = mkdtempSync(join(tmpdir(), 'chrome-messung-'))
  const woerterbuecher = trennung ? trennwoerterbuecher() : null
  if (trennung && !woerterbuecher) console.warn('Keine Trennwörterbücher gefunden — gemessen wird ohne.')
  if (woerterbuecher) cpSync(woerterbuecher, join(profil, 'hyphen-data'), { recursive: true })
  const prozess = spawn(chrome, startSchalter({ profil, trennung: Boolean(woerterbuecher), ci: Boolean(process.env.CI) }), {
    stdio: 'ignore',
  })
  const aufraeumen = () => rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  let verbindung
  try {
    verbindung = await verbinden(await aktiverPort(profil, prozess))
  } catch (e) {
    prozess.kill()
    aufraeumen()
    throw e
  }
  return {
    neuerTab: () => tabOeffnen(verbindung),
    async schliessen() {
      await verbindung.sende('Browser.close').catch(() => {})
      verbindung.schliessen()
      // Chrome braucht einen Moment, bis es das Profil freigibt.
      for (let i = 0; i < 50 && prozess.exitCode === null && prozess.signalCode === null; i++) await schlaf(100)
      if (prozess.exitCode === null && prozess.signalCode === null) prozess.kill()
      aufraeumen()
    },
  }
}
