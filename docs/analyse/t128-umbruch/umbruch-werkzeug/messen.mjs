// Umbruchprobe im echten Chrome (mit den Trennwörterbüchern aus dem Chrome-Profil).
// Fährt /demo.html des laufenden Dev-Servers je Sprache × Breite × Schriftstufe:
// Einstellungen, Hilfsdienste, Blatt Reinigung, Blatt Eingangsordner.
//
// node messen.mjs --lauf vorher [--port 5176] [--sprachen de,en] [--breiten 320,375] [--fs 1,1.45]
//                 [--css nachher.css] [--nbsp] [--bilder de:320:1,ar:320:1.45] [--ohne-woerterbuch]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arg, profilOrdner, schlaf, starteChrome } from './chrome.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
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
const BILD_DIR = join(HIER, 'bilder-' + LAUF)
mkdirSync(BILD_DIR, { recursive: true })
const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')

const chrome = await starteChrome({
  port: Number(arg('cdp', OHNE_WB ? 9348 : 9347)),
  profil: profilOrdner(arg('profil', OHNE_WB ? 'profil-ohne' : 'profil')),
  ohneWoerterbuch: OHNE_WB,
})
try {
  const { cdp, werte } = chrome
  const laden = async (url) => {
    await chrome.laden(url)
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
        // Unter Last steht die Seite manchmal erst halb: den Fall dann neu laden.
        for (let versuch = 1; ; versuch++) {
        try {
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
        break
        } catch (e) {
          console.log('  !', fall, 'Versuch', versuch, e.message)
          if (versuch === 3) throw e
          await schlaf(2000)
        }
        }
      }
    }
  }
  writeFileSync(join(HIER, `ergebnis-${LAUF}.json`), JSON.stringify(ergebnis, null, 1))
  console.log('fertig:', ergebnis.faelle.length, 'Fälle')
} finally {
  chrome.schliessen()
}
