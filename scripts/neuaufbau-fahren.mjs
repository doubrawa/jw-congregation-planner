#!/usr/bin/env node
/**
 * **Den ganzen Neuaufbau in einem Lauf** — von der leeren Datenbank bis zum
 * fertigen Bestand.
 *
 * Die sechs Schritte darunter gibt es einzeln; jeder tut genau eine Sache und
 * bleibt für sich aufrufbar. Was fehlte, war die Reihenfolge: Sie stand im
 * README, und beim Neuaufbau am 18. September 2026 blieb trotzdem einer liegen
 * — die Abwesenheiten, wonach die App gegen einen leeren Kalender plante. Eine
 * Liste, die man abarbeiten muss, ist eine Liste, die man vergisst.
 *
 * **Die Reihenfolge ist nicht frei.** `versammlung-zuruecksetzen.mjs` leert
 * `weeks` mit, also kommen die Wochen danach; die Wochenplanung trägt Namen in
 * Wochen ein, braucht also beide; Treffpunkte brauchen die Wochen ebenso.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/neuaufbau-fahren.mjs \
 *     --name "Musterstadt" --saal "Hauptstraße 12" \
 *     --mid "2 19:00" --we "0 10:00" \
 *     --vorname "Anna" --nachname "Beispiel" \
 *     --sql C:\DATA\Claude\nws-export\import-live-personen.sql \
 *     [--wochen 8] [--sprache de] [--ab-schritt 3] [--trocken]
 *
 *   --wochen      wie viele Wochenprogramme von jw.org (Standard 8).
 *   --ab-schritt  bei Schritt N fortsetzen — für den Fall, dass einer scheitert
 *                 (jw.org nicht erreichbar, Netz weg). Ohne das müsste man von
 *                 vorn anfangen, und Schritt 1 legte eine zweite Versammlung an.
 *   --trocken     jeden Schritt trocken fahren. Auf einer leeren Datenbank
 *                 findet ab Schritt 2 nichts statt, was zu zeigen wäre — der
 *                 Trockenlauf lohnt vor allem auf einem bestehenden Bestand.
 *
 * Bricht ein Schritt ab, endet der Lauf dort und nennt die Nummer zum
 * Fortsetzen. Was danach noch von Hand kommt, sagt der Schlussbericht:
 * Anmeldung mit dem Einladungscode und der Grundplan der Treffpunkte, den
 * `treffpunkte-importieren.mjs` bewusst nur vorschlägt.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { argumente, restKlient, zugangsdaten } from './gemeinsam.mjs'

/** Ohne diese Angaben kann Schritt 1 nicht laufen. */
export const PFLICHT = ['name', 'vorname', 'nachname', 'sql']

/** Welche Pflichtangaben fehlen? Leer = vollständig. */
export function fehlendeAngaben(arg) {
  return PFLICHT.filter((k) => typeof arg[k] !== 'string' || !arg[k].trim())
}

/**
 * Die Kette als Daten — Reihenfolge, Skript und Argumente je Schritt.
 *
 * Rein, damit eine Probe die Reihenfolge und die durchgereichten Schalter
 * messen kann, ohne irgendetwas zu starten. Genau daran hängt der Nutzen
 * dieses Skripts.
 */
export function schritte(arg) {
  const trocken = arg.trocken ? ['--trocken'] : []
  const alle = [
    {
      titel: 'Versammlung, Planer-Person und Standard-Dienste anlegen',
      skript: 'versammlung-anlegen.mjs',
      argv: [
        '--name', String(arg.name),
        '--saal', String(arg.saal ?? ''),
        '--mid', String(arg.mid ?? '2 19:00'),
        '--we', String(arg.we ?? '0 10:00'),
        '--vorname', String(arg.vorname),
        '--nachname', String(arg.nachname),
        ...(arg.sprache ? ['--sprache', String(arg.sprache)] : []),
        ...trocken,
      ],
    },
    {
      titel: 'Personen, Gruppen und Haushalte aus den NWS-Daten',
      skript: 'versammlung-zuruecksetzen.mjs',
      argv: ['--sql', String(arg.sql), ...trocken],
    },
    {
      titel: `Wochenprogramme von jw.org (${arg.wochen ?? 8})`,
      skript: 'wochen-importieren.mjs',
      argv: ['--anzahl', String(arg.wochen ?? 8), ...trocken],
    },
    {
      titel: 'Zuteilungen, Hilfsdienste und Reinigung',
      skript: 'wochenplanung-importieren.mjs',
      argv: [...trocken],
    },
    {
      titel: 'Abwesenheiten',
      skript: 'abwesenheiten-importieren.mjs',
      argv: [...trocken],
    },
    {
      titel: 'Treffpunkte und ihre Leiter',
      skript: 'treffpunkte-importieren.mjs',
      argv: [...trocken],
    },
  ]
  const ab = Number(arg['ab-schritt'] ?? 1)
  return alle.map((s, i) => ({ ...s, nr: i + 1 })).filter((s) => s.nr >= ab)
}

async function bestand(url, key) {
  const rest = restKlient(url, key)
  /**
   * Lesen für den **Abschlussbericht**: Ein Fehler ist hier kein Abbruch,
   * sondern eine leere Zeile. Der Lauf ist an dieser Stelle vorbei — eine
   * Tabelle, die sich nicht zählen lässt, soll den Bericht nicht verschlucken.
   */
  const hole = async (pfad) => {
    try {
      return (await rest(pfad)) ?? []
    } catch {
      return []
    }
  }
  const cong = (await hole('congregations?select=id,name'))[0]
  if (!cong) return { cong: null }
  const zahl = async (t) => (await hole(`${t}?select=id&congregation_id=eq.${cong.id}`)).length
  return {
    cong,
    personen: await zahl('persons'),
    gruppen: await zahl('groups'),
    haushalte: await zahl('households'),
    wochen: await zahl('weeks'),
    abwesenheiten: await zahl('absences'),
    fsWochen: await zahl('fs_weeks'),
    fsRegeln: (await hole(`fs_rules?select=id&congregation_id=eq.${cong.id}`)).length,
    einladungen: await hole(`invites?select=code,person_id,redeemed_by&congregation_id=eq.${cong.id}`),
  }
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  const fehlt = fehlendeAngaben(arg)
  const ab = Number(arg['ab-schritt'] ?? 1)
  if (fehlt.length && ab <= 2) {
    console.error(`Es fehlen: ${fehlt.map((k) => '--' + k).join(', ')}`)
    console.error('Beispiel steht im Kopf dieser Datei und im README unter „Neuaufbau".')
    process.exit(2)
  }
  if (typeof arg.sql === 'string' && !fs.existsSync(arg.sql)) {
    console.error(`Die Personen-Datei gibt es nicht: ${arg.sql}`)
    process.exit(2)
  }

  const { url, key } = await zugangsdaten()
  const vorher = await bestand(url, key)
  if (vorher.cong && ab === 1) {
    console.error(`Es gibt schon eine Versammlung: ${vorher.cong.name} (${vorher.cong.id}).`)
    console.error('Schritt 1 legte eine zweite an. Entweder mit --ab-schritt 2 fortsetzen,')
    console.error('oder die Datenbank vorher mit supabase/neuaufbau.sql + schema.sql leeren.')
    process.exit(2)
  }

  const liste = schritte(arg)
  const hier = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  for (const s of liste) {
    console.log(`\n${'='.repeat(72)}\nSchritt ${s.nr}/6 — ${s.titel}\n${'='.repeat(72)}`)
    const lauf = spawnSync(process.execPath, [path.join(hier, s.skript), ...s.argv], { stdio: 'inherit' })
    if (lauf.status !== 0) {
      console.error(`\nSchritt ${s.nr} ist ausgestiegen (Rückgabewert ${lauf.status}).`)
      console.error(`Nach dem Beheben weiter mit: --ab-schritt ${s.nr}`)
      process.exitCode = 1
      return
    }
  }

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  const nachher = await bestand(url, key)
  console.log(`\n${'='.repeat(72)}\nFertig — ${nachher.cong?.name ?? '?'}\n${'='.repeat(72)}`)
  console.log(`Personen ${nachher.personen} · Gruppen ${nachher.gruppen} · Haushalte ${nachher.haushalte}`)
  console.log(`Wochen ${nachher.wochen} · Abwesenheiten ${nachher.abwesenheiten} · Treffpunkt-Wochen ${nachher.fsWochen}`)

  const offen = (nachher.einladungen ?? []).filter((i) => !i.redeemed_by)
  console.log('\nWas jetzt noch von Hand kommt:')
  for (const i of offen) console.log(`  · In der App anmelden und den Einladungscode ${i.code} einlösen.`)
  if (!nachher.fsRegeln) {
    console.log('  · Den Grundplan der Treffpunkte in den Einstellungen eintragen —')
    console.log('    das Import-Skript schlägt ihn oben nur vor, es trägt ihn nicht ein.')
  }
}

// Nur ausführen, wenn direkt aufgerufen — beim Import aus dem Test nicht.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
  })
}
