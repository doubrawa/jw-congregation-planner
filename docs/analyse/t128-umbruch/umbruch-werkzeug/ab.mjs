// Jede Ansicht zweimal im selben Laden messen: wie sie ist (A) und mit einer
// CSS-Regel dazu (B, `--css`). Was sich zwischen A und B ändert, liegt allein an
// der Regel — kein zweiter Ladevorgang, kein anderer Stand dazwischen. Erst
// eingesetzt für `hyphenate-limit-chars` an der Wurzel (27.10.2026). Die Blätter
// öffnen wie in wahl.mjs; `ab-summe.mjs` fasst einen oder mehrere Läufe zusammen.
//
// node ab.mjs --lauf wurzel --css ":root { hyphenate-limit-chars: auto auto 5; }"
//             [--ziele start-p3,absage] [--sprachen de,ru] [--breiten 320,1440] [--fs 1,1.45]
//             [--weich "Reasignado=Reasig|nado"] [--cdp 9381] [--profil profil-ab]
//
// `--weich` setzt weiche Trennstellen nur für B in den Text (wie messen.mjs).
// Der Druck (`druck`) misst mit `@media print` — mit `--breiten 688`, der Breite
// von A4 abzüglich der Ränder.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arg, bereit, profilOrdner, schlaf, starteChrome, warteAuf } from './chrome.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const BASIS = `http://localhost:${arg('port', '5173')}/demo.html`
const LAUF = arg('lauf', 'ab')
const CSS = arg('css', null)
if (typeof CSS !== 'string') throw new Error('--css fehlt: die Regel, die B von A unterscheidet')
const SPRACHEN = String(arg('sprachen', 'de,en,es,fr,it,ru,uk')).split(',')
const BREITEN = String(arg('breiten', '320,393,768,1440')).split(',').map(Number)
const STUFEN = String(arg('fs', '1,1.15,1.3,1.45')).split(',')
const WEICH = arg('weich', null) ? String(arg('weich')).split(',').map((p) => p.split('=')) : null
const START = { port: Number(arg('cdp', 9381)), profil: profilOrdner(arg('profil', 'profil-ab')) }
// Wie in chrome.mjs — `setEmulatedMedia` setzt Medium und Merkmale zusammen.
const MERKMALE = [
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'reduce' },
]
const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')

const DIALOG = '[role=dialog]'
const klick = (sel, i = 0) => `document.querySelectorAll(${JSON.stringify(sel)})[${i}]?.click()`

/**
 * Wo gemessen wird: jede Seite mit einer Stelle, die trennt (`hyphens: auto`),
 * und die Blätter mit Spur, Wahl und Schaltern. `nur: 'handy'` — ab 768 px
 * steht die Unteransicht schon auf der Seite. `css` gilt in A und B: Der Film
 * blendet seine Szenen nacheinander ein, gemessen werden alle.
 */
const ZIELE = {
  'start-p3': { hash: 's=start&pl=0&me=p3', warte: '.aufgabe-titel' },
  'start-planer': { hash: 's=start&pl=1&me=p9', warte: '.aufgabe-titel' },
  aufgaben: { hash: 's=aufgaben&pl=0&me=p9', warte: '.aufgabe-titel' },
  freie: { hash: 's=freie&pl=0&me=p7', warte: '.seitentitel' },
  mitteilungen: { hash: 's=mitteilungen&pl=1&me=p6', warte: '.app-main' },
  'programm-mid': { hash: 's=programm&tab=mid&pl=0&me=p9', warte: '.prog-title' },
  'programm-we': { hash: 's=programm&tab=we&pl=0&me=p9', warte: '.prog-title' },
  treffpunkte: { hash: 's=programm&tab=fs&fb=treffpunkte&pl=0&me=p9', warte: '.bereich-tab' },
  gruppenbesuche: { hash: 's=programm&tab=fs&fb=gruppenbesuche&pl=0&me=p9', warte: '.bereich-tab' },
  trolleys: { hash: 's=programm&tab=fs&fb=trolleys&pl=0&me=p9', warte: '.trolley-spaltenkopf' },
  'weitere-plaene': { hash: 's=programm&tab=wp&pl=0&me=p9', warte: '.seitentitel' },
  planung: { hash: 's=planung&me=p6', warte: '.app-main' },
  wochen: { hash: 's=wochen&me=p6', warte: '.app-main' },
  'planen-mid': { hash: 's=planen&tab=mid&pl=1', warte: '.prog-title' },
  'planen-we': { hash: 's=planen&tab=we&pl=1', warte: '.prog-title' },
  'planen-treffpunkte': { hash: 's=planen&tab=fs&fb=treffpunkte&pl=1', warte: '.app-main' },
  grundplan: { hash: 's=planen&tab=fs&fb=grundplan&pl=1', warte: '.app-main' },
  auswertung: { hash: 's=auswertung&me=p6&uhr=2026-10-12', warte: '.app-main' },
  'aw-weiteres': { hash: 's=auswertung&uhr=2026-10-12&pl=1', nur: 'handy', schritt: klick('.aw-kachel', 4), vorher: '.aw-kachel', warte: '.unteransicht-kopf' },
  personen: { hash: 's=personen&pl=1', warte: '.personen-kopf button' },
  person: { hash: 's=personen&pl=1&p=p1', warte: '.app-main' },
  einstellungen: { hash: 's=einstellungen&pl=1', warte: '.einst-zeile-name, .einst-nav-eintrag' },
  profil: { hash: 's=profil&pl=0&me=p9', warte: '.wahl' },
  oeffnen: { hash: 's=start&pl=0&me=p9&vorlage=1', warte: `${DIALOG} .sheet-fuss`, wurzel: DIALOG },
  absage: {
    hash: 's=aufgaben&pl=0&me=p9',
    schritt: klick('.aufgabe-handlungen .knopf-umriss'),
    vorher: '.aufgabe-handlungen .knopf-umriss',
    warte: `${DIALOG} .absage-fuss`,
    wurzel: DIALOG,
  },
  'person-anlegen': {
    hash: 's=personen&pl=1',
    schritt: `(document.querySelector('.personen-kopf .knopf-haupt') ?? document.querySelector('.personen-kopf .rund-knopf--akzent'))?.click()`,
    vorher: '.personen-kopf button',
    warte: `${DIALOG} .wahl`,
    wurzel: DIALOG,
  },
  automatisch: { hash: 's=planen&tab=mid&pl=1', schritt: klick('.aktion-neben'), vorher: '.aktion-neben', warte: `${DIALOG} .wahl`, wurzel: DIALOG },
  senden: { hash: 's=planen&tab=mid&pl=1', schritt: klick('.aktion-haupt'), vorher: '.aktion-haupt', warte: `${DIALOG} .sheet-fuss`, wurzel: DIALOG },
  film: {
    hash: 's=start&pl=0&me=p9',
    schritt: klick('.erste-schritte-knopf'),
    vorher: '.erste-schritte-knopf',
    warte: '.film',
    wurzel: '.film',
    css: '.film [data-szene] { visibility: visible !important; }',
  },
  // Nur auf ausdrücklichen Wunsch (`--ziele druck`): Er gehört zu einer eigenen Breite.
  druck: { hash: 's=programm&tab=mid&pl=1', warte: '.prog-title', medium: 'print', extra: true },
}
const NAMEN = arg('ziele', null) ? String(arg('ziele')).split(',') : Object.keys(ZIELE).filter((n) => !ZIELE[n].extra)

/**
 * Sperrt die Regel auch eine weiche Trennstelle? Je ein Wort mit vier
 * Buchstaben danach („Confir|mări", „Versammlungs|saal"), so schmal, dass nur
 * die Stelle hilft: zwei Zeilen heißt getrennt, eine heißt nicht.
 */
const WEICH_PROBE = `(() => {
  const SHY = String.fromCharCode(0xad)
  const zeilen = (lang, wort, hyphens, mitRegel) => {
    const m = document.createElement('span')
    m.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:16px sans-serif'
    m.textContent = wort.split('|')[0] + '-'
    document.body.appendChild(m)
    const breite = m.getBoundingClientRect().width + 4
    m.remove()
    const d = document.createElement('div')
    d.lang = lang
    d.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;font:16px sans-serif;line-height:20px;overflow-wrap:normal;width:' + breite + 'px;hyphens:' + hyphens + (mitRegel ? ';hyphenate-limit-chars:auto auto 5' : '')
    d.textContent = wort.split('|').join(SHY)
    document.body.appendChild(d)
    const n = Math.round(d.getBoundingClientRect().height / 20)
    d.remove()
    return n
  }
  const out = {}
  for (const [lang, wort] of [['ro', 'Confir|mări'], ['de', 'Versammlungs|saal']])
    for (const hyphens of ['manual', 'auto']) out[lang + ' ' + hyphens] = zeilen(lang, wort, hyphens, false) + ' → ' + zeilen(lang, wort, hyphens, true) + ' Zeilen'
  return out
})()`

/** Je Fund ein Schlüssel „art | element | stelle | nach" — dazu Überbreite, Rollbalken, Text, der hinausragt. */
function schluessel(m) {
  const liste = []
  for (const f of m.funde) for (const x of f.b) liste.push(`${x.art} | ${f.el} | ${x.stelle} | ${x.nach ?? ''}`)
  if (m.ueber.zuBreit) liste.push(`zu-breit | ${m.ueber.sw} > ${m.ueber.B}`)
  for (const r of m.ueber.roll) liste.push(`rollbalken | ${r}`)
  for (const t of m.textRaus ?? []) liste.push(`ragt | ${t}`)
  return liste
}

const spaete = (m) => m.funde.flatMap((f) => f.b.filter((x) => x.art === 'getrennt' && x.nach <= 4).map((x) => `${f.el} | ${x.stelle} | ${x.nach}`))

function zaehle(m) {
  const b = m.funde.flatMap((f) => f.b)
  return {
    getrennt: b.filter((x) => x.art === 'getrennt').length,
    spaet: b.filter((x) => x.art === 'getrennt' && x.nach <= 4).length,
    imWort: b.filter((x) => x.art === 'im-wort').length,
    zahl: b.filter((x) => x.art === 'zahl-getrennt').length,
    zuBreit: m.ueber.zuBreit ? 1 : 0,
    roll: m.ueber.roll.length,
    ragt: (m.textRaus ?? []).length,
  }
}

/** Was in B dazukam und was aus A wegfiel — je Schlüssel, mit Vielfachheit. */
function unterschied(a, b) {
  const rest = schluessel(a)
  const neu = []
  for (const s of schluessel(b)) {
    const i = rest.indexOf(s)
    if (i >= 0) rest.splice(i, 1)
    else neu.push(s)
  }
  return { a: zaehle(a), b: zaehle(b), neu, weg: rest, spaetA: spaete(a), spaetB: spaete(b) }
}

let chrome = await starteChrome(START)
const ergebnis = { lauf: LAUF, css: CSS, weichProbe: null, faelle: [] }
let x = 0
try {
  await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false })
  await chrome.laden(`${BASIS}?ab=probe#s=start&pl=0&me=p9&l=de&fs=1`)
  ergebnis.weichProbe = await chrome.werte(WEICH_PROBE)
  console.log('Weiche Trennstelle ohne → mit Regel:', JSON.stringify(ergebnis.weichProbe))
  for (const breite of BREITEN) {
    const handy = breite < 768
    for (const fs of STUFEN) {
      for (const lang of SPRACHEN) {
        for (const name of NAMEN) {
          const ziel = ZIELE[name]
          if (!ziel) throw new Error(`unbekanntes Ziel ${name}`)
          if (ziel.nur === 'handy' && !handy) continue
          const fall = `${name}:${lang}:${breite}:${fs}`
          // Hängt Chrome oder steht die Ansicht nicht da, einmal frisch starten und wiederholen.
          for (let versuch = 1; versuch <= 2; versuch++) {
            try {
              await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: breite, height: 1000, deviceScaleFactor: handy ? 2 : 1, mobile: handy })
              await chrome.laden(`${BASIS}?ab=${LAUF}${++x}#${ziel.hash}&l=${lang}&fs=${fs}`)
              await chrome.werte(SEITE_JS)
              await chrome.werte(bereit(lang, fs))
              if (ziel.vorher && !(await chrome.werte(warteAuf(ziel.vorher)))) throw new Error(`nicht da: ${ziel.vorher}`)
              if (ziel.schritt) await chrome.werte(ziel.schritt)
              if (!(await chrome.werte(warteAuf(ziel.warte)))) throw new Error(`nicht offen: ${ziel.warte}`)
              if (ziel.css) await chrome.werte(`window.__umbruch.cssEinhaengen(${JSON.stringify(ziel.css)})`)
              if (ziel.medium) await chrome.cdp('Emulation.setEmulatedMedia', { media: ziel.medium, features: MERKMALE })
              const opt = ziel.wurzel ? { wurzel: ziel.wurzel } : {}
              const a = await chrome.werte(`window.__umbruch.messe(${JSON.stringify(name)}, ${JSON.stringify(opt)})`)
              await chrome.werte(`window.__umbruch.cssEinhaengen(${JSON.stringify(CSS)})`)
              const b = await chrome.werte(`window.__umbruch.messe(${JSON.stringify(name)}, ${JSON.stringify({ ...opt, weich: WEICH })})`)
              if (ziel.medium) await chrome.cdp('Emulation.setEmulatedMedia', { media: '', features: MERKMALE })
              const d = unterschied(a, b)
              ergebnis.faelle.push({ fall, ...d })
              const z = (s) => `spät ${s.spaet} im-wort ${s.imWort}${s.zuBreit ? ' ZU BREIT' : ''}${s.roll ? ' ROLL' : ''}${s.ragt ? ' RAGT ' + s.ragt : ''}`
              console.log(fall.padEnd(34), `A: ${z(d.a)} | B: ${z(d.b)}${d.neu.length || d.weg.length ? ` | +${d.neu.length} −${d.weg.length}` : ''}`)
              break
            } catch (e) {
              console.log(fall.padEnd(34), 'FEHLER', versuch, e.message)
              chrome.schliessen()
              await schlaf(1000)
              chrome = await starteChrome(START)
              if (versuch === 2) ergebnis.faelle.push({ fall, fehler: e.message })
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
