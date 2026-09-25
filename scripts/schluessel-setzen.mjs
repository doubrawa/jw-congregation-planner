#!/usr/bin/env node
/**
 * Den Secret-Schlüssel **einmal** hinterlegen — danach fragt kein Skript mehr.
 *
 * Bis zum 18. September 2026 musste vor jedem Wartungslauf `$env:…` im
 * **selben** Fenster stehen. Das ist zweimal unbequem und einmal unmöglich:
 *
 *  * Unbequem, weil eine Umgebungsvariable mit dem Fenster stirbt — fünf
 *    Läufe eines Neuaufbaus starben deshalb hintereinander an „Invalid API
 *    key" (siehe `schluessel-einheitlich.test.ts`).
 *  * Unmöglich für jeden Aufruf **ohne Terminal**: ein Cron-Lauf, ein zweites
 *    Werkzeug, eine KI-Sitzung, die jeden Befehl in einer frischen Shell
 *    startet. Dort greift die verdeckte Abfrage nicht — `zugangsdaten()`
 *    bricht mit „kein Terminal zum Fragen" ab, und eine dort gesetzte
 *    Variable wäre beim nächsten Befehl ohnehin weg.
 *
 * Dieses Skript fragt einmal (verdeckt, im Terminal), **prüft den Schlüssel am
 * Projekt** und legt ihn in `.env.local` ab — dieselbe gitignorte Datei, aus
 * der die Skripte schon die Projekt-URL holen. Ab dann findet ihn
 * `secretKey()` von selbst.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/schluessel-setzen.mjs [--zwischenablage] [--key <wert>]
 *                                     [--neu] [--trocken] [--ohne-probe]
 *
 *   --zwischenablage
 *                 den Schlüssel aus der Zwischenablage nehmen: im Dashboard
 *                 kopieren, dann diesen Befehl **unverändert** ausführen. Der
 *                 Weg für Konsolen, die einem laufenden Programm keine Eingabe
 *                 durchreichen und in denen sich auch die Befehlszeile nicht
 *                 bearbeiten lässt (Knopf „Ausführen" im Terminal der
 *                 Claude-Desktop-App). Anders als `--key` landet dabei nichts
 *                 in der History. Gelesen wird einmal, ausgegeben wird der
 *                 Wert nie.
 *
 *   --key <wert>  den Schlüssel mitgeben, statt ihn einzugeben. **Für
 *                 Konsolen, die einem laufenden Programm gar keine Eingabe
 *                 durchreichen** — im Terminal-Panel der Claude-Desktop-App
 *                 (18.9.2026) steht die Aufforderung da, die Shell kehrt
 *                 gleichzeitig zu ihrem Prompt zurück, und der Prozess wartet
 *                 verwaist weiter. Dort ist die Befehlszeile der einzige Weg,
 *                 etwas einzufügen. Preis: Der Schlüssel steht danach in der
 *                 PowerShell-History (`(Get-PSReadLineOption).HistorySavePath`)
 *                 — wer das nicht will, schreibt die Zeile von Hand in
 *                 `.env.local` und startet das Skript ohne Argument.
 *   --neu         nach einem neuen Schlüssel fragen, auch wenn schon einer
 *                 dasteht (nach dem Rotieren im Dashboard).
 *   --trocken     nur zeigen, was geschähe.
 *   --ohne-probe  nicht am Projekt prüfen (Notausgang, falls die Prüfung
 *                 einen gültigen Schlüssel einmal nicht erkennt).
 *
 * Entfernen: die Zeile `SUPABASE_SECRET_KEY=…` aus `.env.local` löschen.
 *
 * **Der Schlüssel wird nie ausgegeben** — weder hier noch beim Tippen. Was
 * dieses Skript zeigt, ist seine Länge.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import {
  alsSkript,
  argumente,
  authKopf,
  ENV_DATEIEN,
  istPlatzhalter,
  refAusUrl,
  verdecktLesen,
  wertAusEnvText,
  zeileGesetzt,
  zugangsdaten,
} from './gemeinsam.mjs'

export const SCHLUESSEL = 'SUPABASE_SECRET_KEY'

/** Steht über der Zeile in `.env.local` — für den, der die Datei später öffnet. */
export const KOMMENTAR = [
  'Secret-Schlüssel der Wartungsskripte (Project Settings -> API Keys -> Secret keys).',
  'Umgeht RLS: nie teilen, nie einchecken. Gesetzt von scripts/schluessel-setzen.mjs.',
].join('\n')

/**
 * **Ist das ein brauchbarer Secret-Schlüssel — laut Server, nicht laut Form?**
 *
 * Gefragt wird die Wurzel der REST-Schnittstelle, und die ist als Prüfstein
 * gewählt: Sie antwortet einem Publishable-Key mit „Only secret API keys can be
 * used for this endpoint" und einem falschen mit „Invalid API key". Eine
 * Leseabfrage auf eine Tabelle könnte das nicht trennen — die beantwortet sie
 * beiden gleich (leere Liste, denn RLS verbirgt statt abzuweisen), und vor dem
 * ersten `schema.sql` gibt es nicht einmal eine Tabelle.
 *
 * `holen` ist ein Parameter, damit die Probe ohne Netz messen kann.
 */
export async function pruefen(url, key, holen = fetch) {
  let antwort
  try {
    antwort = await holen(`${url}/rest/v1/`, { headers: authKopf(key) })
  } catch (err) {
    return { ok: false, meldung: `Projekt nicht erreichbar: ${err instanceof Error ? err.message : err}` }
  }
  if (antwort.status === 200) {
    return { ok: true, meldung: 'Geprüft: die Plattform nimmt ihn an — und dort nur Secret-Schlüssel.' }
  }
  const text = await antwort.text().catch(() => '')
  if (/secret api key/i.test(text)) {
    return {
      ok: false,
      meldung:
        'Das ist ein Publishable-Key (der aus .env.local fürs Frontend), kein Secret-Schlüssel.\n' +
        'Der gesuchte beginnt mit sb_secret_ und steht unter Secret keys.',
    }
  }
  if (antwort.status === 401) {
    return { ok: false, meldung: `Die Plattform weist ihn ab: ${text.slice(0, 160)}` }
  }
  return { ok: false, meldung: `Unerwartete Antwort ${antwort.status}: ${text.slice(0, 160)}` }
}

/**
 * Den Schlüssel aus dem herausschälen, was in der Zwischenablage liegt.
 *
 * Kopiert wird selten nur der nackte Wert: Am Zeilenende hängt ein
 * Zeilenumbruch, manche Oberfläche gibt Anführungszeichen mit, und wer die
 * Zeile aus einer `.env`-Datei kopiert, hat `SUPABASE_SECRET_KEY=` davor. All
 * das hier abzuräumen ist billiger als ein „Invalid API key", dessen Ursache
 * ein unsichtbares Zeichen ist.
 *
 * Der Name vor dem `=` wird nur dann als solcher gelesen, wenn er wie ein
 * Variablenname aussieht (Großbuchstaben und Unterstriche) — ein Schlüssel,
 * der selbst ein `=` enthält, bleibt damit unversehrt.
 */
export function schluesselAusText(roh) {
  for (const zeile of String(roh ?? '').split(/\r?\n/)) {
    const wert = zeile.trim().replace(/^["']|["']$/g, '')
    if (!wert) continue
    const gleich = wert.indexOf('=')
    const name = gleich > 0 ? wert.slice(0, gleich).trim() : ''
    const ohneNamen = /^[A-Z][A-Z0-9_]*$/.test(name) ? wert.slice(gleich + 1).trim() : wert
    return ohneNamen.replace(/^["']|["']$/g, '')
  }
  return ''
}

/**
 * Die Zwischenablage des Systems lesen. Windows über PowerShell, macOS über
 * `pbpaste`, sonst über `xclip` — schlägt der Aufruf fehl, bleibt es leer, und
 * der Aufrufer sagt, was stattdessen zu tun ist.
 */
export function zwischenablage(starte = spawnSync) {
  const [befehl, argv] =
    process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw']]
      : process.platform === 'darwin'
        ? ['pbpaste', []]
        : ['xclip', ['-selection', 'clipboard', '-o']]
  try {
    const lauf = starte(befehl, argv, { encoding: 'utf8', windowsHide: true })
    return lauf.status === 0 ? String(lauf.stdout ?? '') : ''
  } catch {
    return ''
  }
}

/**
 * Der Schlüssel aus `--key`, falls einer mitgegeben wurde — sonst leer.
 *
 * `--key` ohne Wert wird von `argumente()` zu `true`; das ist ein Vertipper und
 * kein Schlüssel, zählt hier also als „nicht angegeben" statt als Wert `true`
 * in die Datei zu wandern.
 */
export function schluesselAusArgument(arg) {
  if (arg.key === undefined || arg.key === true) return ''
  return String(arg.key).trim()
}

/** Verdeckt nach einem neuen Schlüssel fragen — nur für `--neu`. */
async function neuFragen(url) {
  if (!process.stdin.isTTY) {
    console.error('--neu braucht ein Terminal: ohne eines kann niemand den Schlüssel eingeben.')
    process.exit(2)
  }
  console.error(`Secret-Schlüssel: https://supabase.com/dashboard/project/${refAusUrl(url)}/settings/api-keys`)
  process.stderr.write('sb_secret_… (bleibt verdeckt): ')
  const key = (await verdecktLesen()).trim()
  if (istPlatzhalter(key)) {
    console.error('Das sieht nicht nach einem Schlüssel aus. Abgebrochen.')
    process.exit(2)
  }
  return key
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const mitgegeben = arg.zwischenablage ? schluesselAusText(zwischenablage()) : schluesselAusArgument(arg)
  if (mitgegeben) {
    if (istPlatzhalter(mitgegeben)) {
      console.error('--key sieht nicht nach einem Schlüssel aus. Abgebrochen.')
      process.exitCode = 2
      return
    }
    // In die oberste Quelle von `secretKey()` legen, statt an `zugangsdaten()`
    // vorbeizuarbeiten: So geht auch dieser Weg durch dieselbe Tür, und die
    // Abfrage unterbleibt von selbst, weil schon ein Schlüssel dasteht.
    process.env.SUPABASE_SECRET_KEY = mitgegeben
  }

  // Holt die URL und — wenn noch keiner dasteht — verdeckt den Schlüssel.
  const { url, key: vorhandener } = await zugangsdaten()
  const key = arg.neu && !mitgegeben ? await neuFragen(url) : vorhandener

  console.log(`Projekt: ${refAusUrl(url)}`)
  const probe = arg['ohne-probe']
    ? { ok: true, meldung: 'Prüfung übersprungen (--ohne-probe).' }
    : await pruefen(url, key)
  console.log(probe.meldung)
  if (!probe.ok) {
    process.exitCode = 2
    return
  }

  const ziel = ENV_DATEIEN[0]
  const vorher = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : ''
  const stand = wertAusEnvText(vorher, SCHLUESSEL)
  const nachher = zeileGesetzt(vorher, SCHLUESSEL, key, stand ? '' : KOMMENTAR)

  if (nachher === vorher) {
    console.log(`${ziel} trägt ihn schon genau so — nichts zu tun.`)
    return
  }
  const was = stand ? 'ersetzt den hinterlegten Schlüssel' : vorher ? 'hängt die Zeile an' : 'legt die Datei an'
  if (arg.trocken) {
    console.log(`Trocken: ${ziel} bliebe unverändert — scharf ${was} (Länge ${key.length}).`)
    return
  }

  fs.writeFileSync(ziel, nachher)
  console.log(`Gespeichert in ${ziel} (${was}, Länge ${key.length}). Die Datei ist gitignored.`)
  console.log('Ab jetzt findet ihn jedes Wartungsskript von selbst — auch ohne Terminal.')
}

alsSkript(import.meta.url, main)
