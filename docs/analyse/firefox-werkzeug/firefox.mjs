// Echtes Firefox ohne Fenster über WebDriver BiDi fahren (T162, 6.11.2026):
// Seite laden, ein Aufbau-Skript im Tab ausführen, dann je Variante (eigenes
// CSS) ein Mess-Skript und ein Bildschirmfoto. Aufruf und Beispiel in README.md.
//
// Profil und Bilder liegen außerhalb des Repos (TEMP): Dateien im Repo sähe der
// Dev-Server.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe'
/** So lange darf ein Befehl dauern — danach gilt Firefox als hängend, und das Skript räumt auf. */
const ANTWORT_MS = 60_000
const HIER = dirname(fileURLToPath(import.meta.url))
const { values: a } = parseArgs({
  options: {
    url: { type: 'string' },
    aufbau: { type: 'string' },
    messen: { type: 'string' },
    varianten: { type: 'string' },
    breite: { type: 'string', default: '1000' },
    hoehe: { type: 'string', default: '1100' },
    aus: { type: 'string', default: join(tmpdir(), 'firefox-messung') },
  },
})
if (!a.url || !a.aufbau) throw new Error('--url und --aufbau fehlen')

const datei = (name) => readFileSync(resolve(HIER, name), 'utf8')
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms))

const port = 9300 + Math.floor(Math.random() * 600)
const profil = mkdtempSync(join(tmpdir(), 'firefox-profil-'))
const firefox = spawn(FIREFOX, ['--headless', '--no-remote', '--profile', profil, '--remote-debugging-port', String(port), 'about:blank'], {
  stdio: ['ignore', 'ignore', 'pipe'],
})
const beendet = new Promise((r) => firefox.once('exit', r))
let protokoll = ''
firefox.stderr.on('data', (d) => (protokoll += d))

/**
 * Verbindet, sobald Firefox „WebDriver BiDi listening" meldet. `senden` wartet
 * auf die Antwort, höchstens `ANTWORT_MS`; reißt die Verbindung ab, scheitern
 * alle offenen Befehle, statt ewig zu warten.
 */
async function verbinden() {
  for (let i = 0; i < 80 && !protokoll.includes('WebDriver BiDi listening'); i++) await schlaf(250)
  const ws = new WebSocket(`ws://127.0.0.1:${port}/session`)
  await new Promise((ok, fehler) => {
    ws.onopen = ok
    ws.onerror = () => fehler(new Error(`keine Verbindung zu Firefox\n${protokoll}`))
  })
  const offen = new Map()
  const abholen = (id) => {
    const befehl = offen.get(id)
    offen.delete(id)
    clearTimeout(befehl?.uhr)
    return befehl
  }
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    const befehl = abholen(d.id)
    if (!befehl) return
    if (d.type === 'error') befehl.fehler(new Error(`${befehl.method}: ${d.error} ${d.message}`))
    else befehl.ok(d.result)
  }
  ws.onclose = () => {
    for (const id of [...offen.keys()]) abholen(id).fehler(new Error(`Firefox hat die Verbindung getrennt\n${protokoll}`))
  }
  let zaehler = 0
  return (method, params = {}) =>
    new Promise((ok, fehler) => {
      const id = ++zaehler
      const uhr = setTimeout(() => abholen(id)?.fehler(new Error(`${method}: keine Antwort nach ${ANTWORT_MS / 1000} s`)), ANTWORT_MS)
      offen.set(id, { ok, fehler, method, uhr })
      ws.send(JSON.stringify({ id, method, params }))
    })
}

let code = 1
try {
  const senden = await verbinden()
  await senden('session.new', { capabilities: {} })
  const { contexts } = await senden('browsingContext.getTree')
  const context = contexts[0].context
  const ausfuehren = async (skript) => {
    const r = await senden('script.evaluate', { expression: skript, target: { context }, awaitPromise: true, resultOwnership: 'none' })
    if (r.type !== 'success') throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  await senden('browsingContext.setViewport', { context, viewport: { width: Number(a.breite), height: Number(a.hoehe) } })
  await senden('browsingContext.navigate', { context, url: a.url, wait: 'complete' })
  console.log('Aufbau:', await ausfuehren(datei(a.aufbau)))

  mkdirSync(a.aus, { recursive: true })
  const messen = a.messen && datei(a.messen)
  const varianten = a.varianten ? JSON.parse(datei(a.varianten)) : [{ name: 'stand', css: '' }]
  for (const v of varianten) {
    await ausfuehren(`(() => {
      const stil = document.getElementById('ff-variante') ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'ff-variante' }))
      stil.textContent = ${JSON.stringify(v.css)}
    })()`)
    await schlaf(400)
    if (messen) console.log(`${v.name}:`, await ausfuehren(messen))
    const { data } = await senden('browsingContext.captureScreenshot', { context })
    writeFileSync(join(a.aus, `${v.name}.png`), Buffer.from(data, 'base64'))
  }
  console.log(`Bilder in ${a.aus}`)
  // Beendet Firefox samt Sitzung; die Verbindung reißt dabei ab.
  await senden('browser.close').catch(() => {})
  code = 0
} catch (e) {
  console.error(e.message)
} finally {
  // Nach `browser.close` geht Firefox von selbst, nach einem Fehler hart. Das
  // Profil gibt er erst frei, wenn er weg ist.
  if (code !== 0) firefox.kill()
  await Promise.race([beendet, schlaf(5000)])
  firefox.kill()
  try {
    rmSync(profil, { recursive: true, force: true, maxRetries: 5 })
  } catch (e) {
    console.warn(`Profil nicht gelöscht (${e.code}): ${profil}`)
  }
  process.exit(code)
}
