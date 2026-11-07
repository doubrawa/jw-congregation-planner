#!/usr/bin/env node
/**
 * **Laufzeit-Messung** (T167): lädt die Zustände der Entwicklerseite
 * `/demo.html` in Chrome ohne Fenster und misst, was Unit-Tests nicht sehen —
 * ob etwas über den Fensterrand ragt, ob die Konsole schreit, ob eine
 * Fehlergrenze anspringt, ob ein `undefined` auf dem Bildschirm steht.
 *
 * Am 7.11.2026 fand die Messung, damals von Hand, bei Stufe 1,45 ein Wort, das
 * 17 px über den Rand stand — bei 7994 grünen Tests.
 *
 *   npm run laufzeit                             Kernsatz, wie in der CI (wenige Minuten)
 *   npm run laufzeit -- --satz voll              alle Breiten, alle Sprachen
 *   npm run laufzeit -- --nur "s=personen"       nur Aufträge, deren Name passt (Regex)
 *   npm run laufzeit -- --url http://localhost:5173   einen laufenden Dev-Server nutzen
 *   --parallel <n>   Tabs zugleich (Vorgabe: halbe Kernzahl, höchstens 4)
 *   --axe            dazu axe: WCAG 2.2 A und AA samt best practice (T173)
 *   --trennung       mit den Trennwörterbüchern des installierten Chrome (sonst ohne, wie die CI)
 *   --json <datei>   alle Ergebnisse als JSON
 *
 * Vor jedem Satz läuft die **Gegenprobe**: Sie stört eine Seite auf jede Art,
 * die gemessen wird. Meldet die Messung eine davon nicht, ist der Lauf rot.
 *
 * Exitcode 0 ohne Befund, 1 mit Befunden, 2 wenn die Gegenprobe nicht anschlug.
 * Die Seite hat keinen Datenbank-Client — nichts geht hinaus, und axe kommt aus
 * `node_modules`, nicht von einem fremden Server.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { starteChrome } from './chrome.mjs'
import { alsSkript, argumente } from './gemeinsam.mjs'
import { auftraege, auftragsName, fassung, hashVon, SPRACH_ZUSTAENDE } from './laufzeit-auftraege.mjs'
import {
  AXE_AUSNAHMEN,
  AXE_GEGENPROBE_ARTEN,
  AXE_STICHWOERTER,
  axeImDokument,
  befundeAus,
  bereitImDokument,
  blattImDokument,
  GEGENPROBE_ARTEN,
  gegenprobeLuecken,
  messenImDokument,
  ruhigImDokument,
  stoerungImDokument,
  zusammenfassen,
} from './laufzeit-befunde.mjs'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Ab dieser Breite misst Chrome wie am Schreibtisch: Rollbalken nehmen Platz, kein Touch. */
const SCHREIBTISCH_AB = 768

/** Die Höhe des Fensters, in dem gemessen wird. */
const FENSTER_HOEHE = 900

/** Wie viele Fälle je Befund der Bericht nennt. */
const FAELLE_IM_BERICHT = 4

/**
 * Den Dev-Server mit der Entwicklerseite starten. Ohne HMR und ohne
 * Dateiwächter: Eine Änderung mitten im Lauf soll keine gemessene Seite neu
 * laden — gemessen wird der Stand beim Start. Ohne `forwardConsole`: Die
 * Konsole der Seiten berichtet die Messung selbst, mit dem Lauf dazu.
 */
async function devServerStarten() {
  const { createServer } = await import('vite')
  const server = await createServer({
    root: WURZEL,
    configFile: join(WURZEL, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
    server: { host: '127.0.0.1', port: 5199, hmr: false, watch: null, forwardConsole: false },
  })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('Der Dev-Server nennt keine Adresse.')
  return { basis: url.replace(/\/$/, ''), schliessen: () => server.close() }
}

/**
 * Einen Tab für Messungen einrichten. Vor jedem Dokument leert er den Speicher
 * der Seite: Jeder Lauf beginnt wie ein erster Besuch, egal was der vorige
 * hinterließ. Die Uhr der Seite steht ohnehin (`tests/testdaten/uhr.ts`); die
 * Zeitzone kommt dazu, damit die CI in UTC dasselbe zeigt.
 */
async function messTab(chrome) {
  const tab = await chrome.neuerTab()
  await tab.sende('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.clear(); sessionStorage.clear() } catch {}' })
  await tab.sende('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' })
  await tab.sende('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  /** @type {import('./laufzeit-befunde.mjs').Meldung[]} */
  const meldungen = []
  tab.auf((m) => {
    const p = m.params
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(p.type)) {
      const text = p.args.map((a) => a.value ?? a.description ?? '').join(' ')
      meldungen.push({ art: 'konsole', text: `console.${p.type}: ${text}`.slice(0, 300) })
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails
      meldungen.push({ art: 'ausnahme', text: String(d.exception?.description ?? d.text).split('\n')[0].slice(0, 300) })
    } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) {
      meldungen.push({ art: 'log', text: `${p.entry.text} ${p.entry.url ?? ''}`.trim().slice(0, 300) })
    }
  })
  return { ...tab, meldungen }
}

/** axe als Quelltext — erst nach der Messung in die Seite, damit er nichts an ihr ändert, was gemessen wird. */
const axeQuelle = () => readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8')

/**
 * Einen Auftrag messen: Fenster setzen, laden, warten bis die Seite steht und
 * das Netz ruht, messen. `stoeren` gilt nur für die Gegenprobe; `axe` ist der
 * Quelltext von axe, wenn er mitlaufen soll.
 *
 * @param {{ stoeren?: boolean, axe?: string }} [optionen]
 * @returns {Promise<import('./laufzeit-befunde.mjs').Ergebnis>}
 */
async function messen(tab, auftrag, basis, nr, { stoeren = false, axe } = {}) {
  const handy = auftrag.breite < SCHREIBTISCH_AB
  const fenster = (/** @type {number} */ height) =>
    tab.sende('Emulation.setDeviceMetricsOverride', { width: auftrag.breite, height, deviceScaleFactor: handy ? 2 : 1, mobile: handy })
  await fenster(FENSTER_HOEHE)
  await tab.sende('Emulation.setTouchEmulationEnabled', { enabled: handy, maxTouchPoints: handy ? 5 : 1 })
  tab.meldungen.length = 0
  // Eine neue Abfrage lädt die Seite neu; ein bloß anderer Hash täte das nicht.
  if (!(await tab.laden(`${basis}/demo.html?lauf=${nr}#${hashVon(auftrag)}`))) return { auftrag, fehler: 'Die Seite lud nicht (30 s).' }
  const bereit = await tab.werte(`(${bereitImDokument})(${JSON.stringify({ sprache: auftrag.sprache, schrift: auftrag.schrift })})`)
  await tab.netzRuhig()
  await tab.werte(`(${ruhigImDokument})()`)
  if (auftrag.warten) {
    bereit.push(...(await tab.werte(`(${blattImDokument})(${JSON.stringify({ klicks: auftrag.klicks ?? [], warten: auftrag.warten })})`)))
    await tab.netzRuhig()
    await tab.werte(`(${ruhigImDokument})()`)
  }
  if (stoeren) {
    await tab.werte(`(${stoerungImDokument})()`)
    await tab.netzRuhig()
  }
  const messung = await tab.werte(`(${messenImDokument})()`)
  if (!axe) return { auftrag, bereit, meldungen: [...tab.meldungen], messung }
  // axe sieht die ganze Seite auf einmal: Am Rand eines kurzen Fensters läge
  // die untere Leiste über dem, was beim Rollen frei wird, und axe nennte es
  // „verdeckt" (`target-size`). Was dann noch verdeckt ist, bleibt es.
  const hoehe = await tab.werte('document.documentElement.scrollHeight')
  if (hoehe > FENSTER_HOEHE) {
    await fenster(hoehe)
    await tab.werte(`(${ruhigImDokument})()`)
  }
  await tab.werte(`${axe}\n;undefined`)
  const verstoesse = await tab.werte(`(${axeImDokument})(${JSON.stringify({ stichwoerter: AXE_STICHWOERTER, ausnahmen: AXE_AUSNAHMEN })})`)
  return { auftrag, bereit, meldungen: [...tab.meldungen], messung, axe: verstoesse }
}

/**
 * Alle Aufträge auf die Tabs verteilen. Bricht ein Lauf ab, bekommt der Tab
 * einen Nachfolger — ein abgestürzter Tab soll nicht jeden weiteren Lauf
 * mitreißen.
 */
async function abarbeiten(liste, tabs, { chrome, basis, axe, melden }) {
  /** @type {import('./laufzeit-befunde.mjs').Ergebnis[]} */
  const ergebnisse = new Array(liste.length)
  let naechster = 0
  let fertig = 0
  await Promise.all(
    tabs.map(async (anfang) => {
      let tab = anfang
      while (naechster < liste.length) {
        const i = naechster++
        try {
          ergebnisse[i] = await messen(tab, liste[i], basis, i, { axe })
        } catch (e) {
          ergebnisse[i] = { auftrag: liste[i], fehler: String(e instanceof Error ? e.message : e) }
          await tab.schliessen()
          tab = await messTab(chrome)
        }
        melden(++fertig, liste.length)
      }
      await tab.schliessen()
    }),
  )
  return ergebnisse
}

/** Eine Zeile für GitHub Actions, die als Anmerkung am Lauf erscheint. */
const anmerkung = (titel, text) => `::error title=${titel}::${text.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`

/**
 * @param {ReturnType<typeof zusammenfassen>} gruppen
 * @returns {string[]}
 */
function bericht(gruppen) {
  const zeilen = []
  for (const g of gruppen) {
    zeilen.push(`  ${g.art}: ${g.wo}  (${g.faelle.length}×)`)
    for (const f of g.faelle.slice(0, FAELLE_IM_BERICHT)) zeilen.push(`      ${f.lauf}${f.wert ? `  ${f.wert}` : ''}`)
    if (g.faelle.length > FAELLE_IM_BERICHT) zeilen.push(`      … und ${g.faelle.length - FAELLE_IM_BERICHT} weitere`)
  }
  return zeilen
}

export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const satz = typeof arg.satz === 'string' ? arg.satz : 'kern'
  const liste = auftraege(satz, typeof arg.nur === 'string' ? arg.nur : undefined)
  if (!liste.length) throw new Error(`Kein Auftrag im Satz „${satz}" passt zu --nur ${arg.nur}.`)
  const parallel = Math.max(1, Number(arg.parallel) || Math.min(4, Math.floor(availableParallelism() / 2)))
  const axe = arg.axe === true ? axeQuelle() : undefined
  const gestoert = axe ? [...GEGENPROBE_ARTEN, ...AXE_GEGENPROBE_ARTEN] : GEGENPROBE_ARTEN
  const lauf = (/** @type {import('./laufzeit-befunde.mjs').Ergebnis} */ e) => auftragsName(e.auftrag)

  const server = typeof arg.url === 'string' ? { basis: arg.url.replace(/\/$/, ''), schliessen: async () => {} } : await devServerStarten()
  /** @type {Awaited<ReturnType<typeof starteChrome>> | undefined} */
  let chrome
  const aufraeumen = async () => {
    await chrome?.schliessen()
    await server.schliessen()
  }
  const abbrechen = () => void aufraeumen().finally(() => process.exit(130))
  process.once('SIGINT', abbrechen)
  try {
    chrome = await starteChrome({ trennung: arg.trennung === true })
    console.log(`Laufzeit-Messung · Satz ${satz}${axe ? ' mit axe' : ''} · ${liste.length} Läufe · ${parallel} Tabs · ${server.basis}`)
    const start = Date.now()

    // Anwärmen: Der Dev-Server übersetzt jedes Modul beim ersten Abruf.
    const erster = await messTab(chrome)
    for (const [i, zustand] of SPRACH_ZUSTAENDE.entries()) {
      await messen(erster, { zustand, ...fassung(375, 'de', 'hell', '1') }, server.basis, `warm-${i}`)
    }

    const probe = await messen(erster, { zustand: 's=login', ...fassung(375, 'de', 'hell', '1') }, server.basis, 'gegenprobe', { stoeren: true, axe })
    const luecken = gegenprobeLuecken(befundeAus(probe), gestoert)
    if (luecken.length) {
      console.error(`Gegenprobe schlug nicht an: ${luecken.join(', ')} — die Messung misst nicht, was sie soll.`)
      if (process.env.GITHUB_ACTIONS) console.log(anmerkung('Gegenprobe', `nicht erkannt: ${luecken.join(', ')}`))
      process.exitCode = 2
      await erster.schliessen()
      return
    }
    console.log(`Gegenprobe: alle ${gestoert.length} Arten erkannt (${gestoert.join(', ')})`)

    const tabs = [erster, ...(await Promise.all(Array.from({ length: parallel - 1 }, () => messTab(chrome))))]
    let gemeldet = 0
    const ergebnisse = await abarbeiten(liste, tabs, {
      chrome,
      basis: server.basis,
      axe,
      melden: (/** @type {number} */ n, /** @type {number} */ gesamt) => {
        if (n === gesamt || n - gemeldet >= Math.max(10, Math.ceil(gesamt / 10))) {
          console.log(`  ${n}/${gesamt}`)
          gemeldet = n
        }
      },
    })
    const gruppen = zusammenfassen(ergebnisse, lauf)
    const mitBefund = ergebnisse.filter((e) => befundeAus(e).length).length
    const sekunden = Math.round((Date.now() - start) / 1000)
    if (typeof arg.json === 'string') {
      writeFileSync(arg.json, JSON.stringify({ satz, basis: server.basis, sekunden, gruppen, ergebnisse }, null, 1))
    }
    if (!gruppen.length) {
      console.log(`${liste.length} Läufe in ${sekunden} s — kein Befund.`)
      return
    }
    console.log(`${liste.length} Läufe in ${sekunden} s — ${gruppen.length} Befunde in ${mitBefund} Läufen:`)
    for (const zeile of bericht(gruppen)) console.log(zeile)
    if (process.env.GITHUB_ACTIONS) for (const g of gruppen) console.log(anmerkung(`Laufzeit: ${g.art}`, `${g.wo} — ${g.faelle[0]?.lauf} (${g.faelle.length}×)`))
    process.exitCode = 1
  } finally {
    process.off('SIGINT', abbrechen)
    await aufraeumen()
  }
}

alsSkript(import.meta.url, main)
