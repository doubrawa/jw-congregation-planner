// Jede `Wahl` an ihrer echten Stelle im echten Chrome (Rest aus T128): Profil,
// Erinnerungen, Auswertung, die Blätter „Person anlegen", „Person bearbeiten",
// „Automatisch", ein Weiterer Plan und das Eintragen eines Trolleys. Dazu jedes
// Blatt mit Knöpfen nebeneinander im Fuß (`--ziele fuss`), die Unteransichten
// der Auswertung am Handy (`--ziele aw`) — „Was bleibt" aus T128 — und die
// Stellen mit einem Datum hinter einem Klick (`--ziele daten`).
// Blätter werden per Klick geöffnet; gemessen wird die ganze Ansicht (bzw. das
// Blatt), `vergleich.mjs` trennt nach Element.
//
// node wahl.mjs --lauf nachher [--port 5173] [--ziele profil,automatisch]
//               [--sprachen de,pl] [--breiten 320,1180] [--fs 1.15,1.45]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arg, profilOrdner, schlaf, starteChrome } from './chrome.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const BASIS = `http://localhost:${arg('port', '5173')}/demo.html`
const LAUF = arg('lauf', 'nachher')
const SPRACHEN = String(arg('sprachen', 'de,en,es,fr,it,pl,ru,uk,ro,tr,ar,fa')).split(',')
const BREITEN = String(arg('breiten', '320,1180')).split(',').map(Number)
const STUFEN = String(arg('fs', '1.15,1.45')).split(',')
const START = { port: Number(arg('cdp', 9360)), profil: profilOrdner(arg('profil', 'profil-wahl')) }
const SEITE_JS = readFileSync(join(HIER, 'seite.js'), 'utf8')

const DIALOG = '[role=dialog]'
const klick = (sel, i = 0) => `document.querySelectorAll(${JSON.stringify(sel)})[${i}]?.click()`

/** Mehrere Schritte nacheinander: je Schritt warten, bis `sel` dasteht, dann `tun` ausführen. */
const kette = (...schritte) => `(async () => {
  const warte = async (sel) => {
    const t0 = performance.now()
    while (performance.now() - t0 < 8000 && !document.querySelector(sel)) await new Promise((r) => setTimeout(r, 100))
  }
  ${schritte.map(([sel, tun]) => `await warte(${JSON.stringify(sel)}); ${tun}; await new Promise((r) => setTimeout(r, 600))`).join('\n  ')}
})()`

/**
 * Wo eine Wahl steht: der Hash, ein Klick dorthin (wenn nötig), worauf zu warten
 * ist und was gemessen wird. `nur` begrenzt auf Handy oder Tablet/Desktop — die
 * Unteransichten der Auswertung stehen ab 768 px schon auf der Seite.
 */
const ZIELE = {
  profil: { hash: 's=profil&pl=0&me=p9', warte: '.wahl' },
  erinnerungen: {
    hash: 's=einstellungen&pl=1',
    // Desktop: die Leiste (Erinnerungen ist der fünfte Abschnitt); Handy: die neunte Zeile.
    schritt: `document.querySelectorAll('.einst-nav-eintrag').length ? ${klick('.einst-nav-eintrag', 4)} : ${klick('.einst-karte button.einst-zeile', 8)}`,
    vorher: '.einst-nav-eintrag, .einst-karte button.einst-zeile',
    warte: '.erin-wahl .wahl',
  },
  auswertung: { hash: 's=auswertung&uhr=2026-10-12&pl=1', warte: '.aw-zeitraum .wahl' },
  'aw-verteilung': { hash: 's=auswertung&uhr=2026-10-12&pl=1', nur: 'handy', schritt: klick('.aw-kachel', 0), vorher: '.aw-kachel', warte: '.unteransicht-kopf ~ * .wahl, .aw-ansicht .wahl' },
  'aw-einseitig': { hash: 's=auswertung&uhr=2026-10-12&pl=1', nur: 'handy', schritt: klick('.aw-kachel', 1), vorher: '.aw-kachel', warte: '.aw-ansicht .wahl' },
  'person-anlegen': {
    hash: 's=personen&pl=1',
    schritt: `(document.querySelector('.personen-kopf .knopf-haupt') ?? document.querySelector('.personen-kopf .rund-knopf--akzent'))?.click()`,
    vorher: '.personen-kopf button',
    warte: `${DIALOG} .wahl`,
    wurzel: DIALOG,
  },
  'person-bearbeiten': {
    hash: 's=personen&pl=1&p=p9',
    // Am Handy steht der Stift im Kopf der Unteransicht (hinter dem Zurück), am Desktop im Kopf der Person.
    schritt: `(document.querySelector('.person-kopf .rund-knopf') ?? document.querySelector('.unteransicht-kopf .rund-knopf:last-child'))?.click()`,
    vorher: '.person-kopf .rund-knopf, .unteransicht-kopf .rund-knopf:last-child',
    warte: `${DIALOG} .wahl`,
    wurzel: DIALOG,
  },
  automatisch: { hash: 's=planen&tab=mid&pl=1', schritt: klick('.aktion-neben'), vorher: '.aktion-neben', warte: `${DIALOG} .wahl`, wurzel: DIALOG },
  plan: { hash: 's=planen&tab=wp&pl=1', schritt: klick('.wp-plan-zeile'), vorher: '.wp-plan-zeile', warte: '.wahl' },
  trolley: {
    hash: 's=programm&tab=fs&fb=trolleys&pl=0&me=p9',
    // Am Desktop steht das Formular rechts; am Handy öffnet ein freies Feld das Blatt.
    schritt: `document.querySelector('.trolley-seite .wahl') ? null : ${klick('.trolley-frei')}`,
    vorher: '.trolley-seite .wahl, .trolley-frei',
    warte: '.trolley-seite .wahl, [role=dialog] .wahl',
  },
}
/**
 * Blätter mit Knöpfen nebeneinander im Fuß (`--ziele fuss` nimmt alle). Dazu
 * gehören „person-anlegen", „automatisch" und „plan" oben; „person-bearbeiten"
 * hat einen Fuß, der schon umbricht (`.sheet-fuss-ende`). Das Absage-Blatt
 * zeigt dazu eine Spur.
 */
const ZIELE_FUSS = {
  'person-filter': {
    hash: 's=personen&pl=1',
    schritt: klick('.personen-auswahl[aria-haspopup]'),
    vorher: '.personen-auswahl[aria-haspopup]',
    warte: `${DIALOG} .sheet-fuss`,
    wurzel: DIALOG,
  },
  'hilfsdienst-neu': {
    hash: 's=einstellungen&pl=1',
    // Desktop: die Leiste (Hilfsdienste ist der dritte Abschnitt); Handy: die letzte Zeile der zweiten Karte.
    schritt: kette(
      ['.einst-nav-eintrag, .einst-karte', `document.querySelectorAll('.einst-nav-eintrag').length ? ${klick('.einst-nav-eintrag', 2)} : [...document.querySelectorAll('.einst-karte')[1].querySelectorAll('.einst-zeile')].at(-1)?.click()`],
      ['.zeile-hinzu', klick('.zeile-hinzu')],
    ),
    vorher: '.einst-nav-eintrag, .einst-karte',
    warte: `${DIALOG} .sheet-fuss`,
    wurzel: DIALOG,
  },
  'treffpunkt-neu': { hash: 's=planen&tab=fs&fb=treffpunkte&pl=1', schritt: klick('.knopf-neu'), vorher: '.knopf-neu', warte: `${DIALOG} .sheet-fuss`, wurzel: DIALOG },
  'regel-neu': { hash: 's=planen&tab=fs&fb=grundplan&pl=1', schritt: klick('.knopf-neu'), vorher: '.knopf-neu', warte: `${DIALOG} .sheet-fuss`, wurzel: DIALOG },
  'gruppenbesuch-neu': { hash: 's=planen&tab=fs&fb=gruppenbesuche&pl=1', schritt: klick('.gb-neu'), vorher: '.gb-neu', warte: `${DIALOG} .sheet-fuss`, wurzel: DIALOG },
  oeffnen: { hash: 's=start&pl=0&me=p9&vorlage=1', warte: `${DIALOG} .sheet-fuss`, wurzel: DIALOG },
  absage: {
    hash: 's=aufgaben&pl=0&me=p9',
    schritt: klick('.aufgabe-handlungen .knopf-umriss'),
    vorher: '.aufgabe-handlungen .knopf-umriss',
    warte: `${DIALOG} .absage-fuss`,
    wurzel: DIALOG,
  },
  // Bis zum Rest aus T128 hießen die Füße `senden-fuss` und `druck-fuss` — der Vorher-Stand braucht sie.
  senden: {
    hash: 's=planen&tab=mid&pl=1',
    schritt: klick('.aktion-haupt'),
    vorher: '.aktion-haupt',
    warte: `${DIALOG} .sheet-fuss, ${DIALOG} .senden-fuss`,
    wurzel: DIALOG,
  },
  drucken: { hash: 's=programm&pl=1', schritt: klick('.druck-knopf'), vorher: '.druck-knopf', warte: `${DIALOG} .sheet-fuss, ${DIALOG} .druck-fuss`, wurzel: DIALOG },
  // „Programm holen" fehlt: Ohne Verbindung holt die Entwicklerseite nichts, das Blatt öffnet nicht.
}

/**
 * Die übrigen Unteransichten der Auswertung am Handy (`--ziele aw` nimmt alle
 * fünf): Ab 768 px stehen sie auf der Seite und misst sie `breit.mjs`.
 */
const ZIELE_AW = {
  'aw-wartezeiten': { hash: 's=auswertung&uhr=2026-10-12&pl=1', nur: 'handy', schritt: klick('.aw-kachel', 2), vorher: '.aw-kachel', warte: '.unteransicht-kopf' },
  'aw-engpaesse': { hash: 's=auswertung&uhr=2026-10-12&pl=1', nur: 'handy', schritt: klick('.aw-kachel', 3), vorher: '.aw-kachel', warte: '.unteransicht-kopf' },
  'aw-weiteres': { hash: 's=auswertung&uhr=2026-10-12&pl=1', nur: 'handy', schritt: klick('.aw-kachel', 4), vorher: '.aw-kachel', warte: '.unteransicht-kopf' },
}
/** In der angezeigten Woche: der Streifen hält die Nachbarwochen mit eigenen Knöpfen bereit. */
const inDerWoche = (sel, i = 0) =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((a) => !a.closest('.week-page--vor, .week-page--nach'))[${i}]?.click()`
const WEITER = inDerWoche('.week-arrow', 1)

/**
 * „Woche einrichten" öffnet das Zahnrad neben den Reitern (der Hash kennt den
 * Reiter nicht). Ein Datumsfeld hat nur die Woche mit dem Gedächtnismahl — in
 * den Testdaten die vierte: dreimal weiterblättern, mit dem Pfeil der
 * angezeigten Woche (die Nachbarwochen im Streifen tragen eigene).
 */
const WOCHE_EINRICHTEN = [
  ['.week-arrow', WEITER],
  ['.week-arrow', WEITER],
  ['.week-arrow', WEITER],
  ['.meeting-tab--icon', inDerWoche('.meeting-tab--icon')],
]

/**
 * Wo ein Datum mit Monatsnamen hinter einem Klick steht (`--ziele daten`, Daten
 * aus Intl, T128-Nachlauf): eine Person in der Auswertung, der Kalender eines
 * Weiteren Plans, das Zuteilen-Blatt eines Hilfsdienstes, „Woche einrichten"
 * mit Datumsfeld und dieses Feld geöffnet. Dazu gehören „absage", „trolley"
 * und „plan" oben.
 */
const ZIELE_DATEN = {
  'aw-person': {
    hash: 's=auswertung&uhr=2026-10-12&pl=1',
    // Am Handy erst die Wartezeiten, am Desktop steht die Liste schon auf der Seite.
    // Ein Name ist ein Knopf; in der Liste der Absagen steht als Name ein Bereich (`span`).
    schritt: kette(
      ['.aw-kachel, button.aw-zeile-name', `document.querySelector('.aw-kachel') && ${klick('.aw-kachel', 2)}`],
      ['button.aw-zeile-name', klick('button.aw-zeile-name')],
    ),
    vorher: '.aw-kachel, button.aw-zeile-name',
    warte: '.unteransicht-kopf',
  },
  kalender: {
    hash: 's=planen&tab=wp&pl=1',
    schritt: kette(['.wp-plan-zeile', klick('.wp-plan-zeile')], ['.wp-datum', klick('.wp-datum')]),
    vorher: '.wp-plan-zeile',
    warte: `${DIALOG} .kal-monat`,
    wurzel: DIALOG,
  },
  'zuteilen-hilfsdienst': {
    hash: 's=planen&tab=mid&pl=1',
    nur: 'handy',
    schritt: inDerWoche('.prog-abschnitt[data-farbe=neutral2] .platz'),
    vorher: '.prog-abschnitt[data-farbe=neutral2] .platz',
    warte: `${DIALOG} .sheet-sub`,
    wurzel: DIALOG,
  },
  'woche-einrichten': {
    hash: 's=planen&tab=mid&pl=1',
    schritt: kette(...WOCHE_EINRICHTEN),
    vorher: '.week-arrow',
    warte: '.dp-field',
  },
  // Dort das Datumsfeld geöffnet: die Köpfe der Wochentage („niedz.", „dum.").
  datumswaehler: {
    hash: 's=planen&tab=mid&pl=1',
    schritt: kette(...WOCHE_EINRICHTEN, ['.dp-field', klick('.dp-field')]),
    vorher: '.week-arrow',
    warte: '.dp-pop',
  },
}
const ALLE = { ...ZIELE, ...ZIELE_FUSS, ...ZIELE_AW, ...ZIELE_DATEN }
const GRUPPEN = {
  fuss: ['person-anlegen', 'automatisch', 'plan', ...Object.keys(ZIELE_FUSS)],
  aw: ['aw-verteilung', 'aw-einseitig', ...Object.keys(ZIELE_AW)],
  daten: ['absage', 'trolley', 'plan', ...Object.keys(ZIELE_DATEN)],
}
const NAMEN = String(arg('ziele', Object.keys(ZIELE).join(',')))
  .split(',')
  .flatMap((n) => GRUPPEN[n] ?? [n])

/** Bis die Seite in Sprache und Schriftstufe dasteht und die Schriften geladen sind. */
const bereit = (lang, fs) => `(async () => {
  const t0 = performance.now()
  while (performance.now() - t0 < 10000) {
    const fsJetzt = getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()
    if (document.documentElement.lang === ${JSON.stringify(lang)} && fsJetzt === ${JSON.stringify(fs)} && document.querySelector('.app-main')) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await document.fonts.ready
  await new Promise((r) => setTimeout(r, 1000))
})()`

/** Bis `sel` dasteht (oder die Zeit um ist) — `true`, wenn es dasteht. */
const warteAuf = (sel, ms = 8000) => `(async () => {
  const t0 = performance.now()
  while (performance.now() - t0 < ${ms}) {
    if (document.querySelector(${JSON.stringify(sel)})) {
      await document.fonts.ready
      await new Promise((r) => setTimeout(r, 700))
      return true
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
})()`

let chrome = await starteChrome(START)
const ergebnis = { lauf: LAUF, faelle: [] }
let x = 0
try {
  for (const breite of BREITEN) {
    const handy = breite < 768
    for (const fs of STUFEN) {
      for (const lang of SPRACHEN) {
        for (const name of NAMEN) {
          const ziel = ALLE[name]
          if (!ziel) throw new Error(`unbekanntes Ziel ${name}`)
          if (ziel.nur === 'handy' && !handy) continue
          const fall = `${name}:${lang}:${breite}:${fs}`
          for (let versuch = 1; versuch <= 2; versuch++) {
            try {
              await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: breite, height: 1000, deviceScaleFactor: handy ? 2 : 1, mobile: handy })
              await chrome.laden(`${BASIS}?w=${LAUF}${++x}#${ziel.hash}&l=${lang}&fs=${fs}`)
              await chrome.werte(SEITE_JS)
              await chrome.werte(bereit(lang, fs))
              if (ziel.vorher && !(await chrome.werte(warteAuf(ziel.vorher)))) throw new Error(`nicht da: ${ziel.vorher}`)
              if (ziel.schritt) await chrome.werte(ziel.schritt)
              const da = await chrome.werte(warteAuf(ziel.warte))
              const a = da
                ? await chrome.werte(`window.__umbruch.messe(${JSON.stringify(name)}, ${ziel.wurzel ? JSON.stringify({ wurzel: ziel.wurzel }) : '{}'})`)
                : { ansicht: name, fehler: `nicht offen: ${ziel.warte}`, funde: [], ueber: { roll: [], ragt: [] } }
              ergebnis.faelle.push({ fall, ansichten: [a] })
              const wahl = a.funde.filter((f) => f.el.startsWith('button.wahl-knopf'))
              const imWort = wahl.flatMap((f) => f.b.filter((b) => b.art === 'im-wort')).length
              const zahl = wahl.flatMap((f) => f.b.filter((b) => b.art === 'zahl-getrennt')).length
              const ragt = (a.textRaus ?? []).filter((t) => t.startsWith('button.wahl-knopf')).length
              // Über die ganze Ansicht (bzw. das Blatt) — für die Ziele ohne Wahl.
              const alleWort = a.funde.flatMap((f) => f.b.filter((b) => b.art === 'im-wort')).length
              const alleRagt = (a.textRaus ?? []).length
              console.log(
                fall.padEnd(30),
                a.fehler
                  ? `FEHLT ${a.fehler}`
                  : `wahl: wort ${imWort} zahl ${zahl}${ragt ? ' RAGT ' + ragt : ''} | alle: wort ${alleWort} ragt ${alleRagt}${a.ueber.zuBreit ? ' ZU BREIT' : ''}`,
              )
              break
            } catch (e) {
              console.log(fall.padEnd(30), 'FEHLER', versuch, e.message)
              chrome.schliessen()
              await schlaf(1000)
              chrome = await starteChrome(START)
              if (versuch === 2) ergebnis.faelle.push({ fall, ansichten: [{ ansicht: name, fehler: e.message, funde: [], ueber: { roll: [], ragt: [] } }] })
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
