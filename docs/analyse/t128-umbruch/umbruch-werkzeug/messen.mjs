// Umbruchprobe im echten Chrome (mit den Trennwörterbüchern aus dem Chrome-Profil).
// Fährt /demo.html des laufenden Dev-Servers (5173) je Sprache × Breite × Schriftstufe:
// Einstellungen, Hilfsdienste, Blatt Reinigung, Blatt Eingangsordner.
//
// node messen.mjs --lauf vorher [--sprachen de,en] [--breiten 320,375] [--fs 1,1.45]
//                 [--css nachher.css] [--nbsp] [--bilder de:320:1,ar:320:1.45] [--ohne-woerterbuch]
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const WOERTERBUCH = join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data/hyphen-data')
const arg = (name, vorgabe) => {
  const i = process.argv.indexOf('--' + name)
  if (i < 0) return vorgabe
  const v = process.argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
// 5176: Worktree auf HEAD (fester Stand); 5173: der geteilte Ordner.
const BASIS = `http://localhost:${arg('port', '5176')}/demo.html`
const LAUF = arg('lauf', 'vorher')
const SPRACHEN = String(arg('sprachen', 'de,en,es,fr,it,pl,ru,uk,ro,tr,ar,fa')).split(',')
const BREITEN = String(arg('breiten', '320,375,768,1024,1180,1440')).split(',').map(Number)
const STUFEN = String(arg('fs', '1,1.45')).split(',')
const CSS = arg('css', null) ? readFileSync(join(HIER, arg('css')), 'utf8') : null
const NBSP = arg('nbsp', false) === true
// --weich "Değerlendirme=Değerlen|dirme,…": weiche Trennstelle an „|" (nur Simulation)
const WEICH = arg('weich', null) ? String(arg('weich')).split(',').map((p) => p.split('=')) : null
const OHNE_WB = arg('ohne-woerterbuch', false) === true
const BILDER = new Set(String(arg('bilder', '')).split(',').filter(Boolean))
// Parallele Läufe brauchen je eigenen Port und eigenes Profil (Chrome sperrt es).
const PORT = Number(arg('cdp', OHNE_WB ? 9348 : 9347))
const PROFIL = join(HIER, arg('profil', OHNE_WB ? 'profil-ohne' : 'profil'))
mkdirSync(PROFIL, { recursive: true })
if (OHNE_WB) rmSync(join(PROFIL, 'hyphen-data'), { recursive: true, force: true })
else if (!existsSync(join(PROFIL, 'hyphen-data'))) cpSync(WOERTERBUCH, join(PROFIL, 'hyphen-data'), { recursive: true })
const BILD_DIR = join(HIER, 'bilder-' + LAUF)
mkdirSync(BILD_DIR, { recursive: true })

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFIL,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    // Ohne Wörterbuch: kein Nachladen durch den Komponenten-Updater.
    ...(OHNE_WB ? ['--disable-component-update'] : []),
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
try {
  let liste = null
  for (let i = 0; i < 100 && !liste; i++) {
    try {
      liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    } catch {
      await schlaf(200)
    }
  }
  const seite = liste.find((t) => t.type === 'page')
  ws = new WebSocket(seite.webSocketDebuggerUrl)
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
  const cdp = (method, params = {}) =>
    new Promise((ok, fehler) => {
      const n = ++id
      offen.set(n, (d) => (d.error ? fehler(new Error(method + ': ' + d.error.message)) : ok(d.result)))
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')
  const werte = async (ausdruck) => {
    const r = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  })

  const laden = async (url) => {
    ereignisse.length = 0
    await cdp('Page.navigate', { url })
    for (let i = 0; i < 150 && !ereignisse.some((e) => e.method === 'Page.loadEventFired'); i++) await schlaf(100)
    await werte(SEITE_JS)
    if (CSS) await werte(`window.__umbruch.cssEinhaengen(${JSON.stringify(CSS)})`)
  }
  const bild = async (datei) => {
    const r = await cdp('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(BILD_DIR, datei), Buffer.from(r.data, 'base64'))
  }

  // Erst klären, ob dieser Chrome überhaupt trennt.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  await laden(`${BASIS}?probe=1#s=einstellungen&pl=1&l=de&fs=1`)
  const trennt = await werte('window.__umbruch.trennProbe()')
  console.log('Trennprobe:', trennt.join('  ·  '))
  const schriften = await werte(
    "document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status !== 'unloaded').map((f) => f.family + ':' + f.weight + ':' + f.status).slice(0, 8))",
  )
  console.log('Schriften:', schriften.join(', '), '·', BASIS)

  // Versuch: ein Ausdruck aus einer Datei, je Sprache/Breite/Stufe auf der frisch geladenen Seite.
  if (arg('ausdruck', null)) {
    const ausdruck = readFileSync(join(HIER, arg('ausdruck')), 'utf8')
    let n = 0
    for (const breite of BREITEN) {
      const mobil = breite < 768
      await cdp('Emulation.setDeviceMetricsOverride', { width: breite, height: 900, deviceScaleFactor: mobil ? 2 : 1, mobile: mobil })
      for (const fs of STUFEN)
        for (const lang of SPRACHEN) {
          await laden(`${BASIS}?v=${++n}#s=einstellungen&pl=1&l=${lang}&fs=${fs}`)
          await werte(`window.__umbruch.bereit(${JSON.stringify(lang)})`)
          console.log(`${lang}:${breite}:${fs}`, JSON.stringify(await werte(ausdruck)))
          if (BILDER.has(`${lang}:${breite}:${fs}`)) await bild(`versuch-${lang}-${breite}-fs${fs}.png`)
        }
    }
    BREITEN.length = 0
  }

  const ergebnis = { lauf: LAUF, css: !!CSS, nbsp: NBSP, ohneWoerterbuch: OHNE_WB, trennt, faelle: [] }
  let x = 0
  for (const breite of BREITEN) {
    const mobil = breite < 768
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: breite,
      height: mobil ? 900 : 1000,
      deviceScaleFactor: mobil ? 2 : 1,
      mobile: mobil,
    })
    for (const fs of STUFEN) {
      for (const lang of SPRACHEN) {
        const fall = `${lang}:${breite}:${fs}`
        const mitBild = BILDER.has(fall)
        const stamm = `${lang}-${breite}-fs${fs}`
        await laden(`${BASIS}?x=${LAUF}${++x}#s=einstellungen&pl=1&l=${lang}&fs=${fs}`)
        const stand = await werte(`window.__umbruch.bereit(${JSON.stringify(lang)})`)
        const opt = JSON.stringify({ nbsp: NBSP, weich: WEICH })
        // In einem Blatt zählt nur das Blatt — die Seite darunter ist schon gemessen.
        const imBlatt = JSON.stringify({ nbsp: NBSP, weich: WEICH, wurzel: '[role=dialog]' })
        const ansichten = []
        ansichten.push(await werte(`window.__umbruch.messe('einstellungen', ${opt})`))
        if (mitBild) await bild(`${stamm}-1-einstellungen.png`)
        await werte('window.__umbruch.zuHilfsdiensten()')
        ansichten.push(await werte(`window.__umbruch.messe('hilfsdienste', ${opt})`))
        if (mitBild) await bild(`${stamm}-2-hilfsdienste.png`)
        // Reinigung ist der letzte der sieben Dienste, Eingangsordner der vierte.
        const r6 = await werte('window.__umbruch.oeffneDienst(6)')
        if (typeof r6 !== 'string') console.log('  !', fall, 'Reinigung:', JSON.stringify(r6))
        ansichten.push(await werte(`window.__umbruch.messe('blatt-reinigung', ${imBlatt})`))
        if (mitBild) await bild(`${stamm}-3-reinigung.png`)
        await werte('window.__umbruch.schliesseBlatt()')
        const r3 = await werte('window.__umbruch.oeffneDienst(3)')
        if (typeof r3 !== 'string') console.log('  !', fall, 'Eingang:', JSON.stringify(r3))
        ansichten.push(await werte(`window.__umbruch.messe('blatt-eingang', ${imBlatt})`))
        if (mitBild) await bild(`${stamm}-4-eingang.png`)
        ergebnis.faelle.push({ fall, stand, ansichten })
        const kurz = ansichten
          .map((a) => {
            const imWort = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'im-wort')).length
            const zahl = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'zahl-getrennt')).length
            const getr = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'getrennt')).length
            return `${a.ansicht}: wort ${imWort} zahl ${zahl} trenn ${getr}${a.ueber.zuBreit ? ' ZU BREIT' : ''}${a.ueber.roll.length ? ' ROLL' : ''}`
          })
          .join(' | ')
        console.log(fall.padEnd(14), stand.lang, stand.dir, stand.fs, stand.desktop ? 'desktop' : 'handy', '·', kurz)
      }
    }
  }
  writeFileSync(join(HIER, `ergebnis-${LAUF}.json`), JSON.stringify(ergebnis, null, 1))
  console.log('fertig:', ergebnis.faelle.length, 'Fälle')
} finally {
  try {
    ws?.close()
  } catch {}
  chrome.kill()
}
