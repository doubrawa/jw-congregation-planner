#!/usr/bin/env node
/**
 * **Mehrere NWS-Stände zu einem vereinen** — damit ein Neuaufbau mit
 * Geschichte auch die Zuteilungen bekommt, die New World Scheduler schon
 * gelöscht hat.
 *
 * NWS löscht nach `ExpiryDate` (gemessen 18.10.2026): Unter der Woche reichen
 * die Zuteilungen rund neun Monate zurück, Vorsitz und Leser am Wochenende,
 * Hilfsdienste und Treffpunkte vier bis sechs, beendete Abwesenheiten sind
 * fast sofort weg. Die automatischen Sicherungen von NWS
 * (`%LocalAppData%\NW Scheduler\Backups`, alle paar Tage eine) haben sie noch.
 * Mit ihnen reichten am 18.10.2026 die Zuteilungen der Zusammenkünfte vor das
 * Jahr zurück, das ein Neuaufbau holt, Hilfsdienste und Treffpunkte bis Mitte
 * November 2025, die Abwesenheiten bis März 2026.
 *
 * **Die Regeln**
 *
 * - **Je Zeile gewinnt der jüngste Stand, der ihre `ID` kennt — auch mit
 *   Löschvermerk.** NWS löscht weich (`Deleted`) und behält den Vermerk, bis
 *   die Zeile abläuft. So kommt eine Zuteilung, die der Planer in NWS
 *   entfernt hat, nicht aus einer älteren Sicherung zurück; ganz fehlt im
 *   jüngeren Stand nur, was abgelaufen ist — das kommt aus dem älteren.
 * - **Was nur ältere Stände kennen, steht vorn.** Stehen doch zwei lebende
 *   Zeilen für denselben Platz da (die alte ersetzt, ihr Löschvermerk schon
 *   abgelaufen), nimmt der Import die letzte (`sammleNwsWochen`) — so die
 *   jüngere.
 * - **Der frische Stand muss jünger sein als jede Sicherung.** Ist eine nach
 *   dem Entschlüsseln entstanden, bricht das Skript ab: Die Fassungen des
 *   veralteten frischen Standes gewönnen sonst über neuere.
 * - **Personen über die `mid`, und es gewinnt die jüngste Fassung ohne
 *   Löschvermerk.** Bis April 2026 trug NWS eine 18-stellige Text-`ID`,
 *   seitdem eine neunstellige Zahl; die `mid` blieb. Wer nur in älteren
 *   Ständen ohne Vermerk steht (weggezogen, in NWS gelöscht), bleibt drin:
 *   Die Personen der App kommen weiter aus dem frischen Stand
 *   (`build-personen-sql.mjs`), die Importe brauchen die alten nur, damit
 *   deren Zuteilungen wenigstens den Namen tragen.
 * - **Verweise über die volle `ID` werden auf die neue umgeschrieben**
 *   (Abwesenheiten, Treffpunkt-Leiter — siehe `nws-personen.mjs`): Eine
 *   Abwesenheit aus der Zeit der alten ID zeigte sonst auf keine App-Person
 *   und fiele still weg.
 *
 * Geschrieben werden genau die Tabellen, die die drei Importe lesen
 * (`TABELLEN` in `abwesenheiten-`, `treffpunkte-` und
 * `wochenplanung-importieren.mjs`). Der Ordner geht als `--daten` an sie,
 * im Neuaufbau über `neuaufbau-fahren.mjs --daten`.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/nws-staende-vereinen.mjs \
 *     --frisch C:\DATA\Claude\nws-export\MyData-decrypted \
 *     --aelter C:\DATA\Claude\nws-export\Sicherungen \
 *     --nach C:\DATA\Claude\nws-export\MyData-vereint
 *
 *   --frisch   der jüngste Stand (decrypt-tool)
 *   --aelter   ein älterer Stand oder ein Ordner voller Stände: je Unterordner
 *              einer, benannt nach seinem Zeitstempel wie die Sicherungen
 *              (`2026-10-18_08-26-46`) — absteigend sortiert heißt jüngster
 *              zuerst; anders benannte Unterordner zählen nicht. Auch ein
 *              früher vereinter Ordner ist ein Stand, als `--aelter` genannt.
 *   --nach     wohin; darf keiner der Stände sein und in keinem liegen.
 */

import fs from 'node:fs'
import path from 'node:path'
import { TABELLEN as ABWESENHEITEN } from './abwesenheiten-importieren.mjs'
import { alsSkript, argumente } from './gemeinsam.mjs'
import { lebend } from './nws-personen.mjs'
import { TABELLEN as TREFFPUNKTE } from './treffpunkte-importieren.mjs'
import { TABELLEN as WOCHENPLANUNG } from './wochenplanung-importieren.mjs'

/** Die Tabellen, die die Importe lesen — vereint wird genau diese Menge. */
export const NWS_TABELLEN = [
  ...new Set([WOCHENPLANUNG, ABWESENHEITEN, TREFFPUNKTE].flatMap((t) => Object.values(t))),
].sort()

const PERSONEN = WOCHENPLANUNG.persons

/**
 * Eine Zeile einer NWS-Tabelle, mit den Kurzfeldern der Assembly (`ID`, `a`, `b`, …).
 * @typedef {Record<string, unknown>} NwsZeile
 */

/**
 * Felder, die über die volle `ID` auf eine Person zeigen (`nws-personen.mjs`).
 * Zuteilungen zeigen über die `mid`, Verhinderungen über `"<cid>-<mid>"` —
 * beide blieben beim Wechsel der ID gleich.
 */
export const PERSONEN_VERWEISE = {
  [ABWESENHEITEN.awayPeriods]: 'a',
  [TREFFPUNKTE.meetings]: 'h',
}

/** Ein Ordner ist ein Stand, wenn er die Personen enthält — die hat jeder. */
export function istStand(dir) {
  return fs.existsSync(path.join(dir, PERSONEN))
}

/** Name einer entschlüsselten Sicherung: ihr Zeitstempel in Ortszeit, wie ihn NWS schreibt. */
const SICHERUNG_NAME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/

/**
 * Die Stände, jüngster zuerst: `frisch`, dann `aelter` — ein Stand oder ein
 * Ordner voller Sicherungen, nach ihrem Namen absteigend. Nur Namen mit
 * Zeitstempel: Ein anders benannter Ordner („MyData-kopie") sortierte
 * irgendwo hinein und gewänne womöglich über Jüngere.
 */
export function staendeAus(frisch, aelter) {
  if (!aelter) return [frisch]
  if (istStand(aelter)) return [frisch, aelter]
  const unter = fs
    .readdirSync(aelter, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SICHERUNG_NAME.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse()
    .map((name) => path.join(aelter, name))
    .filter(istStand)
  return [frisch, ...unter]
}

/** Wann eine Sicherung entstand — aus ihrem Namen; `null`, wenn er keinen Zeitstempel trägt. */
export function sicherungsZeit(name) {
  const m = SICHERUNG_NAME.exec(name)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}

/**
 * Eine Sicherung, die nach dem frischen Stand entstand — dann ist er veraltet,
 * und seine Fassungen gewönnen über neuere. Entschlüsselt hat ihn das
 * decrypt-tool zur Zeit seiner Personen-Datei. Ihr Name, sonst `null`.
 */
export function juengereSicherung(frisch, aeltere) {
  const entschluesselt = fs.statSync(path.join(frisch, PERSONEN)).mtime
  return aeltere.map((d) => path.basename(d)).find((name) => (sicherungsZeit(name) ?? 0) > entschluesselt) ?? null
}

/**
 * Liegt `ziel` in `ordner` oder ist es `ordner` selbst? Über `path.relative`:
 * Das nimmt unter Windows Groß- und Kleinschreibung gleich wie das
 * Dateisystem, ein Vergleich der Zeichenketten nicht.
 */
export function liegtIn(ordner, ziel) {
  const rel = path.relative(path.resolve(ordner), path.resolve(ziel))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/** Die Tabellen eines Standes; fehlt eine (ältere NWS-Fassung), steht `null` da. */
export function ladeStand(dir) {
  /** @type {Record<string, NwsZeile[] | null>} */
  const tabellen = {}
  for (const datei of NWS_TABELLEN) {
    const pfad = path.join(dir, datei)
    if (!fs.existsSync(pfad)) {
      tabellen[datei] = null
      continue
    }
    const roh = fs.readFileSync(pfad, 'utf8').trim()
    tabellen[datei] = roh ? JSON.parse(roh) : []
  }
  return { name: path.basename(dir), tabellen }
}

/** Zeilenschlüssel; ohne `ID` ließe sich nicht sagen, welche Fassung gilt. */
function zeilenSchluessel(z, datei) {
  if (z.ID == null) throw new Error(`${datei}: eine Zeile ohne ID lässt sich nicht vereinen.`)
  return String(z.ID)
}

/** Personenschlüssel: die `mid` — sie überstand den Wechsel der ID im April 2026. */
function personSchluessel(p) {
  return p.mid != null ? `mid:${p.mid}` : `id:${zeilenSchluessel(p, PERSONEN)}`
}

/**
 * Zeilen aller Stände (jüngster zuerst) je `ID` — es gewinnt der jüngste
 * Stand, der sie kennt, auch mit Löschvermerk. Durchlaufen wird vom ältesten
 * her: Jüngere Fassungen überschreiben, und Zeilen, die nur ältere Stände
 * kennen, stehen vorn.
 */
export function vereineZeilen(listen, datei = '') {
  const out = new Map()
  for (const liste of [...listen].reverse()) {
    for (const z of liste ?? []) out.set(zeilenSchluessel(z, datei), z)
  }
  return [...out.values()]
}

/**
 * Personen aller Stände (jüngster zuerst) je `mid` — die jüngste Fassung
 * ohne Löschvermerk; nur wer in jedem Stand gelöscht ist, bleibt als Vermerk.
 */
export function vereinePersonen(listen) {
  const out = new Map()
  for (const liste of listen) {
    for (const p of liste ?? []) {
      const k = personSchluessel(p)
      const da = out.get(k)
      if (!da || (da.Deleted && !p.Deleted)) out.set(k, p)
    }
  }
  return [...out.values()]
}

/**
 * Verweise eines Standes über seine `ID` auf die `ID` umschreiben, die die
 * Person im vereinten Stand trägt — die `mid` verbindet beide.
 */
export function verweiseUmschreiben(stand, idJeMid) {
  const midJeId = new Map()
  for (const p of stand.tabellen[PERSONEN] ?? []) {
    if (p.mid != null) midJeId.set(String(p.ID), String(p.mid))
  }
  let umgeschrieben = 0
  const tabellen = { ...stand.tabellen }
  for (const [datei, feld] of Object.entries(PERSONEN_VERWEISE)) {
    if (!tabellen[datei]) continue
    tabellen[datei] = tabellen[datei].map((z) => {
      const mid = z[feld] == null ? undefined : midJeId.get(String(z[feld]))
      const neu = mid === undefined ? undefined : idJeMid.get(mid)
      if (neu === undefined || String(neu) === String(z[feld])) return z
      umgeschrieben++
      return { ...z, [feld]: neu }
    })
  }
  return { stand: { ...stand, tabellen }, umgeschrieben }
}

/** Alle Stände (jüngster zuerst) zu einem — je Tabelle die vereinten Zeilen. */
export function vereine(staende) {
  const personen = vereinePersonen(staende.map((s) => s.tabellen[PERSONEN]))
  const idJeMid = new Map(personen.filter((p) => p.mid != null).map((p) => [String(p.mid), p.ID]))
  let umgeschrieben = 0
  const umgestellt = staende.map((s) => {
    const r = verweiseUmschreiben(s, idJeMid)
    umgeschrieben += r.umgeschrieben
    return r.stand
  })
  /** @type {Record<string, NwsZeile[]>} */
  const tabellen = {}
  for (const datei of NWS_TABELLEN) {
    tabellen[datei] =
      datei === PERSONEN ? personen : vereineZeilen(umgestellt.map((s) => s.tabellen[datei]), datei)
  }
  return { tabellen, umgeschrieben }
}

/** Je Tabelle: lebende Zeilen im frischen Stand, vereint, und wie viele davon nur Ältere kannten. */
export function bericht(frisch, tabellen) {
  return NWS_TABELLEN.map((datei) => {
    const schluessel = datei === PERSONEN ? personSchluessel : (z) => zeilenSchluessel(z, datei)
    const imFrischen = new Set((frisch.tabellen[datei] ?? []).map(schluessel))
    const vereint = lebend(tabellen[datei])
    return {
      datei,
      lebendFrisch: lebend(frisch.tabellen[datei]).length,
      lebend: vereint.length,
      ausAelteren: vereint.filter((z) => !imFrischen.has(schluessel(z))).length,
    }
  })
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `nws-staende-vereinen.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const fehlt = ['frisch', 'nach'].filter((k) => typeof arg[k] !== 'string')
  if (fehlt.length) {
    console.error(`Es fehlen: ${fehlt.map((k) => '--' + k).join(', ')} — der Aufruf steht im Kopf dieser Datei.`)
    process.exitCode = 2
    return
  }
  if (!istStand(arg.frisch)) {
    console.error(`Kein NWS-Stand (ohne ${PERSONEN}): ${arg.frisch}`)
    process.exitCode = 2
    return
  }
  if (arg.aelter !== undefined && (typeof arg.aelter !== 'string' || !fs.existsSync(arg.aelter))) {
    console.error(`Den älteren Stand gibt es nicht: ${arg.aelter}`)
    process.exitCode = 2
    return
  }
  const dirs = staendeAus(arg.frisch, arg.aelter)
  const ordner = typeof arg.aelter === 'string' ? [...dirs, arg.aelter] : dirs
  if (ordner.some((d) => liegtIn(d, arg.nach))) {
    console.error(`Das Ziel ist selbst einer der Stände oder liegt darin: ${arg.nach}`)
    process.exitCode = 2
    return
  }
  const juenger = juengereSicherung(arg.frisch, dirs.slice(1))
  if (juenger) {
    console.error(`Die Sicherung ${juenger} ist jünger als der frische Stand — erst NWS neu entschlüsseln (decrypt-tool), dann vereinen.`)
    process.exitCode = 2
    return
  }

  const ziel = path.resolve(arg.nach)
  const staende = dirs.map(ladeStand)
  const { tabellen, umgeschrieben } = vereine(staende)
  fs.mkdirSync(ziel, { recursive: true })
  for (const [datei, zeilen] of Object.entries(tabellen)) {
    fs.writeFileSync(path.join(ziel, datei), JSON.stringify(zeilen), 'utf8')
  }
  fs.writeFileSync(
    path.join(ziel, 'vereint-aus.json'),
    JSON.stringify({ erstellt: new Date().toISOString(), staende: staende.map((s) => s.name) }, null, 2),
    'utf8',
  )

  console.log(`Vereint aus ${staende.length} Ständen: ${staende[0].name} … ${staende.at(-1).name}`)
  for (const z of bericht(staende[0], tabellen)) {
    console.log(`  ${z.datei.padEnd(34)} lebend ${String(z.lebendFrisch).padStart(4)} → ${String(z.lebend).padStart(4)} (nur in älteren: ${z.ausAelteren})`)
  }
  console.log(`Verweise auf die neue ID umgeschrieben: ${umgeschrieben}`)
  console.log(`Geschrieben nach ${ziel}`)
}

alsSkript(import.meta.url, main)
