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
 * Wochen ein, braucht also beide; Treffpunkte brauchen die Wochen ebenso. Die
 * Abwesenheiten kommen vor die Wochen (18.10.2026): Beim Holen und beim
 * Wochenplan-Import kommt der feste Leiter des Wachtturm-Studiums in jede
 * Woche, und ob er da ist oder sein Vertreter leitet, sagen sie. Danach
 * geholt, stünde er auch in den Wochen, in denen er verreist ist.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/neuaufbau-fahren.mjs \
 *     --name "Musterstadt" --saal "Hauptstraße 12" \
 *     --mid "2 19:00" --we "0 10:00" \
 *     --vorname "Anna" --nachname "Beispiel" \
 *     --sql C:\DATA\Claude\nws-export\import-live-personen.sql \
 *     [--wochen 8] [--ab 2025-10-13] [--daten <ordner>] [--sprache de] [--ab-schritt 3] [--cong <id>] [--trocken]
 *
 *   --wochen      wie viele Wochenprogramme von jw.org (Standard 8, mit `--ab`
 *                 60 — sonst holte ein Neuaufbau mit Geschichte nur die ersten
 *                 acht Wochen vor einem Jahr, und die Lücke bis heute füllte
 *                 „Holen" nie: Es macht ab der laufenden Woche weiter).
 *   --ab          ab welcher Woche — für ein Jahr Geschichte der Montag vor
 *                 einem Jahr, dazu `--wochen 60`: das Jahr, die laufende Woche
 *                 und sieben voraus. Ohne Geschichte begänne die Auswertung
 *                 (T126) leer, denn das Zurücksetzen leert `weeks`. Geht an
 *                 die Wochen und an die Abwesenheiten (dort das früheste
 *                 Ende); Zuteilungen und Treffpunkte nehmen ohnehin jede Woche
 *                 bis ein Jahr zurück.
 *   --daten       der NWS-Ordner für die drei Schritte, die NWS lesen
 *                 (Abwesenheiten, Zuteilungen, Treffpunkte) — für ein Jahr
 *                 Geschichte der vereinte aus `nws-staende-vereinen.mjs`, denn
 *                 was NWS schon gelöscht hat, steht nur in seinen Sicherungen.
 *                 Ohne die Angabe lesen sie `nws-export\MyData-decrypted`.
 *   --ab-schritt  bei Schritt N fortsetzen — für den Fall, dass einer scheitert
 *                 (jw.org nicht erreichbar, Netz weg). Ohne das müsste man von
 *                 vorn anfangen, und Schritt 1 legte eine zweite Versammlung an.
 *   --cong        beim Fortsetzen die Versammlung — nötig, sobald eine zweite
 *                 daneben steht (die Testversammlung): Ohne die Angabe weist
 *                 jeder Schritt mit „Mehrere Versammlungen" ab. Nicht mit
 *                 Schritt 1, der legt eine neue an.
 *   --trocken     jeden Schritt trocken fahren. Auf einer leeren Datenbank
 *                 findet ab Schritt 2 nichts statt, was zu zeigen wäre — der
 *                 Trockenlauf lohnt vor allem auf einem bestehenden Bestand.
 *
 * Bricht ein Schritt ab, endet der Lauf dort und nennt die Nummer zum
 * Fortsetzen. Was danach noch von Hand kommt, sagt der Schlussbericht: die
 * erste Anmeldung mit dem Link aus Schritt 1 (er übersteht Schritt 2, siehe
 * `versammlung-zuruecksetzen.mjs`) und der Grundplan der Treffpunkte, den
 * `treffpunkte-importieren.mjs` bewusst nur vorschlägt.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { alsSkript, argumente, restKlient, zugangsdaten } from './gemeinsam.mjs'

/** Ohne diese Angaben kann Schritt 1 nicht laufen — Schritt 2 braucht davon nur die Personen-Datei. */
export const PFLICHT = ['name', 'vorname', 'nachname', 'sql']

/**
 * Welche Pflichtangaben fehlen **für die Schritte, die laufen**? Leer =
 * vollständig. Bis zum 16.10.2026 verlangte auch das Fortsetzen ab Schritt 2
 * Name, Vor- und Nachname — die braucht nur Schritt 1.
 */
export function fehlendeAngaben(arg) {
  const ab = Number(arg['ab-schritt'] ?? 1)
  const noetig = ab <= 1 ? PFLICHT : ab === 2 ? ['sql'] : []
  return noetig.filter((k) => typeof arg[k] !== 'string' || !arg[k].trim())
}

/** Die Angaben, die einen Wert brauchen — ohne ihn macht `argumente()` aus ihnen `true`. */
export const MIT_WERT = ['name', 'saal', 'mid', 'we', 'vorname', 'nachname', 'sql', 'wochen', 'ab', 'daten', 'sprache', 'ab-schritt', 'cong']

/**
 * Welche Angaben stehen ohne Wert da? Bis zum 18.10.2026 lief ein Neuaufbau
 * mit `--daten --cong <id>` still ohne die vereinten NWS-Stände: Der Schalter
 * wurde zu `true`, und `schritte()` reicht nur Text weiter. Bei `--ab` fehlte
 * ebenso still das ganze Jahr.
 */
export function ohneWert(arg) {
  return MIT_WERT.filter((k) => arg[k] === true)
}

/**
 * `--cong` mit Schritt 1 widerspricht sich: Schritt 1 legt eine **neue**
 * Versammlung an, die Schritte danach gingen aber an die genannte.
 */
export function congMitSchrittEins(arg) {
  return arg.cong !== undefined && Number(arg['ab-schritt'] ?? 1) <= 1
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
  // Ab Schritt 2 gibt es die Versammlung schon, und die Schritte fragen nach
  // ihr (`versammlungHolen`). Steht eine zweite daneben, weisen sie ohne
  // `--cong` ab — bis zum 16.10.2026 ließ sich die Wahl hier nicht
  // weiterreichen, und ein Fortsetzen ging gar nicht.
  const cong = typeof arg.cong === 'string' ? ['--cong', arg.cong] : []
  // Ein Jahr Geschichte (18.10.2026): dieselbe Grenze für Wochen und Abwesenheiten.
  const seit = typeof arg.ab === 'string' ? ['--ab', arg.ab] : []
  // Mit Geschichte das Jahr, die laufende Woche und sieben voraus — acht Wochen
  // ab vor einem Jahr ließen eine Lücke bis heute, die nichts mehr füllt.
  const wochen = String(arg.wochen ?? (seit.length ? 60 : 8))
  // Vereinte NWS-Stände (18.10.2026) gehen an jeden Schritt, der NWS liest.
  const daten = typeof arg.daten === 'string' ? ['--daten', arg.daten] : []
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
      argv: ['--sql', String(arg.sql), ...cong, ...trocken],
    },
    {
      titel: 'Abwesenheiten',
      skript: 'abwesenheiten-importieren.mjs',
      argv: [...seit, ...daten, ...cong, ...trocken],
    },
    {
      titel: `Wochenprogramme von jw.org (${wochen}${seit.length ? ` ab ${arg.ab}` : ''})`,
      skript: 'wochen-importieren.mjs',
      argv: ['--anzahl', wochen, ...seit, ...cong, ...trocken],
    },
    {
      titel: 'Zuteilungen, Hilfsdienste und Reinigung',
      skript: 'wochenplanung-importieren.mjs',
      argv: [...daten, ...cong, ...trocken],
    },
    {
      titel: 'Treffpunkte und ihre Leiter',
      skript: 'treffpunkte-importieren.mjs',
      argv: [...daten, ...cong, ...trocken],
    },
  ]
  const ab = Number(arg['ab-schritt'] ?? 1)
  return alle.map((s, i) => ({ ...s, nr: i + 1 })).filter((s) => s.nr >= ab)
}

/**
 * Exportiert für `schema-probe.test.ts`: `main` startet die Schritte als eigene
 * Prozesse, geprüft wird deshalb nur, was dieses Skript selbst abfragt. Das
 * lohnt gerade hier — ein Fehler wird unten zur leeren Zeile, eine vertippte
 * Spalte stünde im Abschlussbericht also still als „0".
 */
export async function bestand(url, key, congId) {
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
  // Mit `--cong` die genannte — sonst zählte der Bericht die erste, die die
  // Datenbank liefert, auch wenn die Schritte an eine andere gingen.
  const cong = (await hole(`congregations?select=id,name${congId ? `&id=eq.${congId}` : ''}`))[0]
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
    // Konten und Anmelde-Links (T121, Phase 8) — ohne `id`-Spalte gezählt.
    konten: (await hole(`members?select=user_id&congregation_id=eq.${cong.id}`)).length,
    links: (await hole(`anmelde_links?select=person_id&congregation_id=eq.${cong.id}`)).length,
  }
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `neuaufbau-fahren.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const leer = ohneWert(arg)
  if (leer.length) {
    console.error(`Ohne Wert angegeben: ${leer.map((k) => '--' + k).join(', ')}`)
    process.exit(2)
  }
  const fehlt = fehlendeAngaben(arg)
  const ab = Number(arg['ab-schritt'] ?? 1)
  if (fehlt.length) {
    console.error(`Es fehlen: ${fehlt.map((k) => '--' + k).join(', ')}`)
    console.error('Beispiel steht im Kopf dieser Datei und im README unter „Neuaufbau".')
    process.exit(2)
  }
  if (typeof arg.sql === 'string' && !fs.existsSync(arg.sql)) {
    console.error(`Die Personen-Datei gibt es nicht: ${arg.sql}`)
    process.exit(2)
  }
  if (typeof arg.daten === 'string' && !fs.existsSync(arg.daten)) {
    console.error(`Den NWS-Ordner gibt es nicht: ${arg.daten}`)
    process.exit(2)
  }
  if (congMitSchrittEins(arg)) {
    console.error('--cong nennt eine bestehende Versammlung — Schritt 1 legte aber eine neue an.')
    console.error('Mit --cong fortsetzen: --ab-schritt 2 (oder später).')
    process.exit(2)
  }
  const congId = typeof arg.cong === 'string' ? arg.cong : undefined

  const { url, key } = await zugangsdaten()
  const vorher = await bestand(url, key)
  if (vorher.cong && ab === 1) {
    console.error(`Es gibt schon eine Versammlung: ${vorher.cong.name} (${vorher.cong.id}).`)
    console.error('Schritt 1 legte eine zweite an. Entweder mit --ab-schritt 2 fortsetzen,')
    console.error('oder die Datenbank vorher mit supabase/neuaufbau.sql + schema.sql leeren.')
    process.exit(2)
  }

  const liste = schritte(arg)
  const hier = path.dirname(fileURLToPath(import.meta.url))
  // URL und Schlüssel an die Schritte weiter, wie hier erfragt: Stand der
  // Schlüssel nicht in `.env.local`, fragte bis zum 16.10.2026 jeder der sechs
  // Schritte noch einmal danach (`zugangsdaten`).
  const umgebung = { ...process.env, SUPABASE_URL: url, SUPABASE_SECRET_KEY: key }
  for (const s of liste) {
    console.log(`\n${'='.repeat(72)}\nSchritt ${s.nr}/6 — ${s.titel}\n${'='.repeat(72)}`)
    const lauf = spawnSync(process.execPath, [path.join(hier, s.skript), ...s.argv], { stdio: 'inherit', env: umgebung })
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

  const nachher = await bestand(url, key, congId)
  console.log(`\n${'='.repeat(72)}\nFertig — ${nachher.cong?.name ?? '?'}\n${'='.repeat(72)}`)
  console.log(`Personen ${nachher.personen} · Gruppen ${nachher.gruppen} · Haushalte ${nachher.haushalte}`)
  console.log(`Wochen ${nachher.wochen} · Abwesenheiten ${nachher.abwesenheiten} · Treffpunkt-Wochen ${nachher.fsWochen}`)

  console.log('\nWas jetzt noch von Hand kommt:')
  if (!nachher.konten && nachher.links) {
    console.log('  · Mit dem Link aus Schritt 1 anmelden — er gilt ein Jahr. Verloren?')
    console.log('    node scripts/zugang-ausstellen.mjs --person "Vorname Nachname"')
  }
  console.log('  · Den übrigen ihre Links geben: in der App unter Personen › Ohne Link › Links senden.')
  if (!nachher.fsRegeln) {
    console.log('  · Den Grundplan der Treffpunkte in den Einstellungen eintragen —')
    console.log('    das Import-Skript schlägt ihn oben nur vor, es trägt ihn nicht ein.')
  }
}

alsSkript(import.meta.url, main)
