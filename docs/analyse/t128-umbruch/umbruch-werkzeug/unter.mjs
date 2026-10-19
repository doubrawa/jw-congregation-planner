// Alle Ziele der Einstellungen am Handy im echten Chrome: jede Zeile antippen,
// die Unteransicht bzw. das Blatt dahinter messen, zurück. Für T128: Die Karten
// der Einstellungen stellen per Container-Abfrage um — das trifft auch
// Sprachen, Gruppen und Trolleys, Erinnerungen und die Blätter.
//
// node unter.mjs --lauf nachher [--port 5173] [--sprachen de,pl] [--breiten 320,375] [--fs 1.15,1.45]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arg, profilOrdner, starteChrome } from './chrome.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const BASIS = `http://localhost:${arg('port', '5173')}/demo.html`
const LAUF = arg('lauf', 'nachher')
const SPRACHEN = String(arg('sprachen', 'de,en,es,fr,it,pl,ru,uk,ro,tr,ar,fa')).split(',')
const BREITEN = String(arg('breiten', '320,375')).split(',').map(Number)
const STUFEN = String(arg('fs', '1.15,1.45')).split(',')
const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')

const chrome = await starteChrome({ port: Number(arg('cdp', 9352)), profil: profilOrdner(arg('profil', 'profil-unter')) })
try {
  const { cdp, werte } = chrome
  const ergebnis = { lauf: LAUF, faelle: [] }
  let x = 0
  for (const breite of BREITEN) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: breite, height: 900, deviceScaleFactor: 2, mobile: true })
    for (const fs of STUFEN) {
      for (const lang of SPRACHEN) {
        await chrome.laden(`${BASIS}?u=${LAUF}${++x}#s=einstellungen&pl=1&l=${lang}&fs=${fs}`)
        await werte(SEITE_JS)
        await werte(`window.__umbruch.bereit(${JSON.stringify(lang)})`)
        // Im frischen Profil steht die Übersicht manchmal erst nach dem Laden der
        // Schriften: ohne Zeilen maß der Lauf sonst still nur die Übersicht.
        const zahl = await werte(`(async () => {
          const t0 = performance.now()
          while (performance.now() - t0 < 8000 && !document.querySelector('.einst-karte button.einst-zeile')) await new Promise((r) => setTimeout(r, 100))
          return document.querySelectorAll('.einst-karte button.einst-zeile').length
        })()`)
        if (zahl === 0) throw new Error(`${lang}:${breite}:${fs}: keine Zeilen in den Einstellungen`)
        const ansichten = [await werte(`window.__umbruch.messe('uebersicht', {})`)]
        for (let i = 0; i < zahl; i++) {
          // Jede Zeile auf frischer Übersicht: zurück über den Kopf oder den Schleier.
          const name = await werte(`(async () => {
            const zeile = document.querySelectorAll('.einst-karte button.einst-zeile')[${i}]
            if (!zeile) return null
            const text = zeile.querySelector('.einst-zeile-name')?.textContent ?? zeile.textContent
            zeile.click()
            await new Promise((r) => setTimeout(r, 900))
            await document.fonts.ready
            return text.trim().slice(0, 30)
          })()`)
          if (name === null) continue
          const blatt = await werte(`!!document.querySelector('[role=dialog] .sheet-kopf')`)
          const a = await werte(`window.__umbruch.messe(${JSON.stringify('ziel ' + i + ' ' + name)}, ${blatt ? "{ wurzel: '[role=dialog]' }" : '{}'})`)
          ansichten.push(a)
          await werte(`(async () => {
            if (document.querySelector('[role=dialog] .sheet-kopf')) document.querySelector('.sheet-backdrop')?.click()
            else document.querySelector('.unteransicht-kopf button')?.click()
            await new Promise((r) => setTimeout(r, 500))
          })()`)
        }
        const fall = `${lang}:${breite}:${fs}`
        ergebnis.faelle.push({ fall, ansichten })
        const kurz = ansichten
          .map((a) => {
            const imWort = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'im-wort')).length
            const z = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'zahl-getrennt')).length
            return imWort || z || a.ueber.zuBreit || a.ueber.roll.length || a.textRaus?.length
              ? `${a.ansicht}: wort ${imWort} zahl ${z}${a.ueber.zuBreit ? ' ZU BREIT' : ''}${a.ueber.roll.length ? ' ROLL' : ''}${a.textRaus?.length ? ' RAGT ' + a.textRaus.length : ''}`
              : null
          })
          .filter(Boolean)
        console.log(fall.padEnd(14), `${ansichten.length} Ansichten`, kurz.length ? '· ' + kurz.join(' | ') : '· sauber')
      }
    }
  }
  writeFileSync(join(HIER, `ergebnis-${LAUF}.json`), JSON.stringify(ergebnis, null, 1))
  console.log('fertig:', ergebnis.faelle.length, 'Fälle')
} finally {
  chrome.schliessen()
}
