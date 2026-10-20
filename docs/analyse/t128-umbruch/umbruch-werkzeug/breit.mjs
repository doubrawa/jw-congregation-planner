// Breite Ansichten im echten Chrome: Werden die Leisten mit der Schrift breiter
// (T128), darf der Inhalt daneben weder überlaufen noch mitten im Wort brechen.
// Nutzt messe() aus seite.js auf beliebigen Bildschirmen der Entwicklerseite.
//
// node breit.mjs --lauf nachher [--port 5173] [--seiten planen,start,programm]
//                [--sprachen de,pl] [--breiten 768,1440] [--fs 1.3,1.45] [--css datei.css]
//                [--mobil]
//
// Ohne `--mobil` misst es auch schmale Breiten als Desktop — mit Rollbalken, also
// 15 px schmaler als ein Handy. `--mobil` emuliert unter 768 px ein Handy (wie `wahl.mjs`).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arg, profilOrdner, schlaf, starteChrome } from './chrome.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const BASIS = `http://localhost:${arg('port', '5173')}/demo.html`
const LAUF = arg('lauf', 'nachher')
const SEITEN = String(arg('seiten', 'planen,start,programm')).split(',')
const SPRACHEN = String(arg('sprachen', 'de,en,es,fr,it,pl,ru,uk,ro,tr,ar,fa')).split(',')
const BREITEN = String(arg('breiten', '768,1024,1180,1400,1440')).split(',').map(Number)
const STUFEN = String(arg('fs', '1.3,1.45')).split(',')
const START = { port: Number(arg('cdp', 9349)), profil: profilOrdner(arg('profil', 'profil-breit')) }
const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')
// --css datei.css: Regeln als <style> im Tab einhängen (Simulation, nichts im Repo).
const CSS = arg('css', null) ? readFileSync(join(HIER, arg('css')), 'utf8') : null
const MOBIL = Boolean(arg('mobil', false))

/** Bis die Seite in Sprache und Schriftstufe dasteht und die Schriften geladen sind. */
const bereit = (lang, fs) => `(async () => {
  const t0 = performance.now()
  while (performance.now() - t0 < 8000) {
    const fsJetzt = getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()
    if (document.documentElement.lang === ${JSON.stringify(lang)} && fsJetzt === ${JSON.stringify(fs)} && document.querySelector('.app-main')) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 1200))
})()`

let chrome = await starteChrome(START)
const ergebnis = { lauf: LAUF, faelle: [] }
let x = 0
try {
  for (const breite of BREITEN) {
    for (const fs of STUFEN) {
      for (const seite of SEITEN) {
        for (const lang of SPRACHEN) {
          const fall = `${seite}:${lang}:${breite}:${fs}`
          // Hängt Chrome, einmal frisch starten und den Fall wiederholen.
          for (let versuch = 1; versuch <= 2; versuch++) {
            try {
              const handy = MOBIL && breite < 768
              await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: breite, height: 1000, deviceScaleFactor: handy ? 2 : 1, mobile: handy })
              await chrome.laden(`${BASIS}?b=${LAUF}${++x}#s=${seite}&pl=1&l=${lang}&fs=${fs}`)
              await chrome.werte(SEITE_JS)
              if (CSS) await chrome.werte(`window.__umbruch.cssEinhaengen(${JSON.stringify(CSS)})`)
              await chrome.werte(bereit(lang, fs))
              const a = await chrome.werte(`window.__umbruch.messe(${JSON.stringify(seite)}, {})`)
              ergebnis.faelle.push({ fall, ansichten: [a] })
              const imWort = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'im-wort')).length
              const zahl = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'zahl-getrennt')).length
              console.log(
                fall.padEnd(24),
                `wort ${imWort} zahl ${zahl}${a.ueber.zuBreit ? ' ZU BREIT' : ''}${a.ueber.roll.length ? ' ROLL' : ''}${a.textRaus?.length ? ' RAGT ' + a.textRaus.length : ''}`,
              )
              break
            } catch (e) {
              console.log(fall.padEnd(24), 'FEHLER', versuch, e.message)
              chrome.schliessen()
              await schlaf(1000)
              chrome = await starteChrome(START)
              if (versuch === 2) ergebnis.faelle.push({ fall, ansichten: [{ ansicht: seite, fehler: e.message, funde: [], ueber: { roll: [], ragt: [] } }] })
            }
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
