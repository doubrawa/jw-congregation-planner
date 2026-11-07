#!/usr/bin/env node
/**
 * **Was auf den Geräten schiefgeht** (T171) — die Meldungen aus
 * `geraete_fehler`, gruppiert nach Stand der App und Meldung.
 *
 * Liest nur. Der Betreiber wirft es an; in der App gibt es dafür keine
 * Oberfläche — Administratives gehört in ein Skript, nicht vor jeden Planer.
 *
 * Gruppiert wird nach **Versammlung, Stand, Art und Meldung**: Derselbe Fehler
 * auf zwanzig Geräten ist ein Befund, nicht zwanzig, und der Stand sagt, ob er
 * mit dem letzten Ausrollen kam oder schon vorher da war. Was eine Gruppe
 * sonst noch unterscheidet (Bildschirme, Browser), steht als Aufzählung
 * daneben — daran erkennt man, ob es an einem Gerät hängt oder an allen.
 *
 * In den Zeilen steht **nichts über die Person**: keine Konto-Id, keine
 * Person-Id, keine Eingaben (siehe `geraete_fehler` in `schema.sql`). Der
 * Stapel kommt nur mit `--stapel` heraus, und auch dann gekürzt, wie er
 * gespeichert wurde.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/geraete-fehler.mjs [--tage 14] [--stapel] [--alle]
 *
 * `--tage` begrenzt den Zeitraum (Vorgabe 14; aufbewahrt werden sie acht
 * Wochen). `--stapel` zeigt je Gruppe den Stapel des jüngsten Falls.
 * `--alle` zeigt jede Zeile einzeln statt gruppiert.
 */

import { alleZeilen, alsSkript, argumente, restKlient, zugangsdaten } from './gemeinsam.mjs'

/** Ein Zeitpunkt, wie PostgREST ihn filtert — `at=gte.<ISO>`. */
export function abZeitpunkt(tage, jetzt = new Date()) {
  return new Date(jetzt.getTime() - tage * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Die Meldungen zu Gruppen zusammenfassen — rein, damit die Probe sie lesen
 * kann.
 *
 * Der Schlüssel nennt die Versammlung mit: Zwei Versammlungen im selben
 * Projekt (die Testversammlung) sollen nicht in einer Zeile landen, sonst
 * sieht ein Fehler aus wie zweimal derselbe.
 */
export function gruppieren(zeilen) {
  const gruppen = new Map()
  for (const z of zeilen) {
    const schluessel = `${z.congregation_id}|${z.stand}|${z.art}|${z.meldung}`
    const g = gruppen.get(schluessel) ?? {
      cong: z.congregation_id,
      stand: z.stand,
      art: z.art,
      meldung: z.meldung,
      anzahl: 0,
      zuerst: z.at,
      zuletzt: z.at,
      bildschirme: new Set(),
      browser: new Set(),
      stapel: '',
    }
    g.anzahl++
    if (z.at < g.zuerst) g.zuerst = z.at
    if (z.at >= g.zuletzt) {
      g.zuletzt = z.at
      g.stapel = z.stapel ?? ''
    }
    if (z.bildschirm) g.bildschirme.add(z.bildschirm)
    if (z.browser) g.browser.add(z.browser)
    gruppen.set(schluessel, g)
  }
  // Das Häufigste zuerst, bei Gleichstand das Jüngste — danach liest man.
  return [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl || String(b.zuletzt).localeCompare(String(a.zuletzt)))
}

/** Datum und Uhrzeit kurz, in Ortszeit — zum Lesen, nicht zum Rechnen. */
export function kurzeZeit(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}. ${z(d.getHours())}:${z(d.getMinutes())}`
}

export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const tage = arg.tage === undefined ? 14 : Number(arg.tage)
  if (!Number.isFinite(tage) || tage <= 0) {
    console.error(`--tage braucht eine Zahl über 0, nicht „${arg.tage}".`)
    process.exit(2)
  }
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)
  const ab = abZeitpunkt(tage)
  const zeilen = await alleZeilen(rest, `geraete_fehler?select=*&at=gte.${ab}&order=at`)

  console.log(`Fehlermeldungen der letzten ${tage} Tage: ${zeilen.length}\n`)
  if (zeilen.length === 0) {
    console.log('Nichts gemeldet. (Aufbewahrt werden sie acht Wochen.)')
    return
  }

  if (arg.alle) {
    for (const z of zeilen) {
      console.log(`${kurzeZeit(z.at)}  ${z.art.padEnd(12)} ${z.stand.padEnd(14)} ${z.bildschirm.padEnd(12)} ${z.browser}`)
      console.log(`    ${z.meldung}`)
      if (arg.stapel && z.stapel) console.log(z.stapel.replace(/^/gm, '      '))
    }
    return
  }

  const gruppen = gruppieren(zeilen)
  for (const g of gruppen) {
    console.log(`${String(g.anzahl).padStart(4)}×  ${g.art}  ${g.meldung}`)
    console.log(
      `       Stand ${g.stand || '(ohne)'} · ${kurzeZeit(g.zuerst)} bis ${kurzeZeit(g.zuletzt)}` +
        ` · ${[...g.bildschirme].join(', ') || 'ohne Bildschirm'} · ${[...g.browser].join(', ') || 'Browser unbekannt'}`,
    )
    if (arg.stapel && g.stapel) console.log(g.stapel.replace(/^/gm, '         '))
    console.log()
  }
  const staende = new Set(zeilen.map((z) => z.stand).filter(Boolean))
  console.log(`${gruppen.length} Gruppe(n) über ${staende.size} Stand/Stände.`)
}

alsSkript(import.meta.url, main)
