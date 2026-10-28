// Das Menü messen: die Schublade am Handy und am Tablet, die Leiste am Desktop
// (28.10.2026, „My / Assignment|s"). Je Lage die Namen wie die App sie zeigt
// (aktiv ist „Meine Aufgaben") und alle fett — so steht jeder Eintrag da, wenn
// er aktiv ist. Dazu die Anordnung: ob der Zähler unter den Namen gerückt ist,
// ob er dann am Ende der Zeile steht und das Zeichen neben dem Namen bleibt.
//
// node menue.mjs --lauf vorher [--sprachen en] [--fs 1.45] [--breiten 320,360,768]
//                [--css "<Regel nur für B>"] [--port 5173] [--cdp 9391] [--profil profil-menue]
// node menue.mjs --lauf leiste --leiste          (die Leiste am Desktop, 1180 und 1440 px)
//
// Mit `--css` misst es je Lage A (wie sie ist) und B (mit der Regel) im selben
// Laden, wie ab.mjs. `--hash` wählt die Seite darunter (Vorgabe: „Meine
// Aufgaben" mit Zählern); am Handy nur eine Seite mit Kopfzeile — beim Planen
// und auf Unterseiten ersetzt ein eigener Kopf den Menüknopf.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arg, bereit, profilOrdner, schlaf, starteChrome, warteAuf } from './chrome.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')

const BASIS = `http://localhost:${arg('port', '5173')}/demo.html`
const LAUF = String(arg('lauf', 'menue'))
const LEISTE = arg('leiste', false) === true
const WURZEL = LEISTE ? '.leiste' : '.schublade'
const SPRACHEN = String(arg('sprachen', 'de,en,es,fr,it,pl,ru,uk,ro,tr,ar,fa')).split(',')
const BREITEN = String(arg('breiten', LEISTE ? '1180,1440' : '320,360,768')).split(',').map(Number)
const STUFEN = String(arg('fs', '0.9,1,1.15,1.3,1.45')).split(',')
const CSS = arg('css', null)
const HASH = String(arg('hash', 's=aufgaben&pl=1&me=p9'))
const START = { port: Number(arg('cdp', 9391)), profil: profilOrdner(String(arg('profil', 'profil-menue'))) }

// Am Handy öffnet der Knopf im Kopf die Schublade, ab 768 px der in der schmalen Leiste.
const OEFFNEN = `[...document.querySelectorAll('.kopfzeile-menue, .schmale-leiste-menue')].find((k) => k.offsetParent)?.click()`
const FETT = `(() => { const s = document.createElement('style'); s.setAttribute('data-fett', ''); s.textContent = ${JSON.stringify(WURZEL + ' .menue-eintrag { font-weight: 700 !important; }')}; document.head.appendChild(s); return true })()`
const NICHT_FETT = `(() => { document.querySelector('style[data-fett]')?.remove(); return true })()`

const MASSE = `(() => {
  const w = document.querySelector(${JSON.stringify(WURZEL)}).getBoundingClientRect().width
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
  return [...document.querySelectorAll(${JSON.stringify(WURZEL + ' .menue-eintrag')})].map((e) => {
    const t = e.querySelector('.menue-eintrag-text')
    const tr = t.getBoundingClientRect()
    const z = e.querySelector('.menue-zahl')?.getBoundingClientRect()
    const er = e.getBoundingClientRect()
    const ep = parseFloat(getComputedStyle(e).paddingInlineEnd)
    const zeichen = e.querySelector('.zeichen')?.getBoundingClientRect()
    return {
      text: t.textContent,
      spalte: Math.round(tr.width * 10) / 10,
      zahl: !!z,
      zahlUnten: z ? z.top >= tr.bottom - 1 : false,
      zahlAmEnde: z ? Math.round(rtl ? z.left - er.left - ep : er.right - ep - z.right) : null,
      hoehe: Math.round(er.height),
      zeichenNebenText: zeichen ? Math.abs((zeichen.top + zeichen.bottom) / 2 - (tr.top + tr.bottom) / 2) < tr.height / 2 + 1 : null,
      ragt: Math.round(Math.max(0, tr.right - er.right, er.left - tr.left)),
      wurzel: Math.round(w * 10) / 10,
    }
  })
})()`

let chrome = await starteChrome(START)
const ergebnis = []
let x = 0
try {
  for (const breite of BREITEN) {
    for (const fs of STUFEN) {
      for (const lang of SPRACHEN) {
        // Unter Last fehlt das Menü gelegentlich (28.10.2026: einer von 240 Fällen) —
        // dann wie in ab.mjs einmal frisch starten und wiederholen.
        for (let versuch = 1; versuch <= 2; versuch++) {
          try {
            await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: breite, height: 860, deviceScaleFactor: LEISTE ? 1 : 2, mobile: !LEISTE })
            await chrome.laden(`${BASIS}?menue=${LAUF}${++x}#${HASH}&l=${lang}&fs=${fs}`)
            await chrome.werte(SEITE_JS)
            await chrome.werte(bereit(lang, fs))
            if (!LEISTE) await chrome.werte(OEFFNEN)
            if (!(await chrome.werte(warteAuf(WURZEL + ' .menue-eintrag')))) throw new Error('Menü nicht da')
            const lage = []
            for (const [variante, css] of CSS ? [['A', null], ['B', CSS]] : [['ist', null]]) {
              if (css) await chrome.werte(`window.__umbruch.cssEinhaengen(${JSON.stringify(css)})`)
              for (const fett of [false, true]) {
                if (fett) await chrome.werte(FETT)
                const m = await chrome.werte(`window.__umbruch.messe('menue', { wurzel: ${JSON.stringify(WURZEL)} })`)
                lage.push({ breite, fs, lang, variante, fett, funde: m.funde, textRaus: m.textRaus, ueber: m.ueber, masse: await chrome.werte(MASSE) })
                if (fett) await chrome.werte(NICHT_FETT)
              }
            }
            ergebnis.push(...lage)
            const wo = (e) => `${e.variante}${e.fett ? '/fett' : ''}`
            const ohne = lage.flatMap((e) => e.funde.flatMap((f) => f.b.filter((b) => b.art === 'im-wort').map(() => `${wo(e)} ${f.text}`)))
            const unten = lage.flatMap((e) => e.masse.filter((m) => m.zahlUnten).map((m) => `${wo(e)} ${m.text}`))
            console.log(`${breite} ${fs} ${lang}: ${ohne.length ? 'OHNE STRICH ' + ohne.join('; ') : 'ok'}${unten.length ? ' · Zahl unten: ' + unten.join('; ') : ''}`)
            break
          } catch (e) {
            console.log(`${breite} ${fs} ${lang}: FEHLER ${versuch} ${e.message}`)
            chrome.schliessen()
            await schlaf(1000)
            chrome = await starteChrome(START)
            if (versuch === 2) ergebnis.push({ breite, fs, lang, fehler: e.message })
          }
        }
      }
    }
  }
} finally {
  chrome.schliessen()
}
writeFileSync(join(HIER, `ergebnis-${LAUF}.json`), JSON.stringify(ergebnis, null, 1))
