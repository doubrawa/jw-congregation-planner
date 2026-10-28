// Gemeinsam für die Messskripte (T128): Chrome ohne Fenster mit den
// Trennwörterbüchern aus dem Chrome-Profil starten und per DevTools-Protokoll
// steuern. Das Browser-Pane der Desktop-App trennt nicht — gemessen wird hier.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const WOERTERBUCH = join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data/hyphen-data')

export const schlaf = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Der Ordner eines Chrome-Profils — **außerhalb des Repos**. Ein Profil im
 * Repo legt beim ersten Start Hunderte HTML-Dateien seiner Erweiterungen ab;
 * der Dev-Server sieht sie und lädt jede gemessene Seite neu (19.10.2026: die
 * Bilder zeigten nur noch das Startbild, die Läufe waren wertlos).
 */
export function profilOrdner(name) {
  return join(tmpdir(), 'umbruch-messung', name)
}

/** Ein Schalter aus der Befehlszeile: `--name wert`, `--name` allein ist `true`. */
export function arg(name, vorgabe) {
  const i = process.argv.indexOf('--' + name)
  if (i < 0) return vorgabe
  const v = process.argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}

/**
 * Bis die Seite in Sprache und Schriftstufe dasteht und die Schriften geladen
 * sind — ein Ausdruck für `werte`. Aus ab.mjs (27.10.2026), gemeinsam seit
 * menue.mjs; breit.mjs und wahl.mjs warten noch mit eigenen Zeiten.
 */
export const bereit = (lang, fs) => `(async () => {
  const t0 = performance.now()
  while (performance.now() - t0 < 10000) {
    const fsJetzt = getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()
    if (document.documentElement.lang === ${JSON.stringify(lang)} && fsJetzt === ${JSON.stringify(fs)} && document.querySelector('.app-main')) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 800))
})()`

/** Bis `sel` dasteht (oder die Zeit um ist) — `true`, wenn es dasteht. Ein Ausdruck für `werte`. */
export const warteAuf = (sel, ms = 8000) => `(async () => {
  const t0 = performance.now()
  while (performance.now() - t0 < ${ms}) {
    if (document.querySelector(${JSON.stringify(sel)})) {
      await document.fonts.ready
      await new Promise((r) => setTimeout(r, 600))
      return true
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
})()`

/**
 * Chrome starten und verbinden. Parallele Läufe brauchen je eigenen `port` und
 * eigenes `profil` (Chrome sperrt es). `ohneWoerterbuch` misst ohne
 * Trennregeln — und ohne dass der Komponenten-Updater sie nachlädt.
 */
export async function starteChrome({ port, profil, ohneWoerterbuch = false }) {
  mkdirSync(profil, { recursive: true })
  if (ohneWoerterbuch) rmSync(join(profil, 'hyphen-data'), { recursive: true, force: true })
  else if (!existsSync(join(profil, 'hyphen-data'))) cpSync(WOERTERBUCH, join(profil, 'hyphen-data'), { recursive: true })
  // Nach einem abgeschossenen Chrome hält der alte Prozess Profil und Port noch
  // einen Moment (19.10.2026: der Neustart scheiterte an „antwortet nicht").
  for (let versuch = 1; ; versuch++) {
    try {
      return await einmalStarten({ port, profil, ohneWoerterbuch })
    } catch (e) {
      if (versuch === 3) throw e
      await schlaf(3000)
    }
  }
}

async function einmalStarten({ port, profil, ohneWoerterbuch }) {
  const prozess = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profil,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      ...(ohneWoerterbuch ? ['--disable-component-update'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  try {
    return await verbinden(port, prozess)
  } catch (e) {
    prozess.kill()
    throw e
  }
}

async function verbinden(port, prozess) {
  let liste = null
  for (let i = 0; i < 100 && !liste; i++) {
    try {
      liste = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    } catch {
      await schlaf(200)
    }
  }
  if (!liste) throw new Error('Chrome antwortet nicht auf Port ' + port)
  const ws = new WebSocket(liste.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((ok, fehler) => {
    ws.onopen = ok
    ws.onerror = fehler
  })
  let id = 0
  const offen = new Map()
  const ereignisse = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && offen.has(d.id)) {
      offen.get(d.id)(d)
      offen.delete(d.id)
    } else if (d.method) ereignisse.push(d)
  }
  // Headless-Chrome hängt gelegentlich: jeder Aufruf mit Zeitlimit.
  const cdp = (method, params = {}) =>
    new Promise((ok, fehler) => {
      const n = ++id
      const uhr = setTimeout(() => {
        offen.delete(n)
        fehler(new Error('Zeitlimit: ' + method))
      }, 30000)
      offen.set(n, (d) => {
        clearTimeout(uhr)
        if (d.error) fehler(new Error(method + ': ' + d.error.message))
        else ok(d.result)
      })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const werte = async (ausdruck) => {
    const r = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  /** Eine Seite laden und warten, bis sie geladen ist. */
  const laden = async (url) => {
    ereignisse.length = 0
    await cdp('Page.navigate', { url })
    for (let i = 0; i < 150 && !ereignisse.some((e) => e.method === 'Page.loadEventFired'); i++) await schlaf(100)
  }
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  })
  const schliessen = () => {
    try {
      ws.close()
    } catch {}
    prozess.kill()
  }
  return { cdp, werte, laden, schliessen }
}
