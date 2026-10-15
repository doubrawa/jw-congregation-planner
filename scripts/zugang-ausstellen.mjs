#!/usr/bin/env node
/**
 * **Ein Anmelde-Link für eine Person — außerhalb der App** (T121, Phase 8).
 *
 * Der Notzugang: Kommt niemand mit Admin-Recht mehr hinein — Gerät verloren,
 * Link abgelaufen, die App kann noch keine E-Mails senden —, stellt dieses
 * Skript einer Person einen Link aus, mit dem Service-Role-Key, also ohne
 * Anmeldung. Es geht derselbe Weg wie „Link senden" in der App
 * (`_shared/anmelde-links.ts`): Ein neuer Link ersetzt den alten samt Zettel.
 *
 * Ein Konto legt das Skript nicht an. Das entsteht bei der ersten Anmeldung,
 * mit den Rechten aus der Vormerkung an der Person (Function `anmelden`) — wie
 * bei jedem anderen Link. Hat die Person schon ein Konto, meldet der Link
 * dieses an.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/zugang-ausstellen.mjs --person "Vorname Nachname" [--cong <id>] [--trocken]
 *   node scripts/zugang-ausstellen.mjs --person-id <id> [--cong <id>]
 *
 * `--cong` ist die Id der Versammlung; ohne sie gilt die einzige, die es gibt
 * (`versammlungHolen`). `--app` nennt die Adresse der App, falls sie nicht
 * `https://versammlung.app/` ist.
 *
 * **Die Ausgabe meldet an** — Link und Code. Nicht in Chats, Tickets oder
 * Protokolle kopieren; wer sie hat, ist die Person.
 *
 * **Nichts vorher setzen.** Die Projekt-URL holt sich das Skript aus
 * `.env.local`, nach dem Schlüssel fragt es verdeckt, wenn keiner in der
 * Umgebung steht (`SUPABASE_SECRET_KEY`). `--trocken` sucht nur die Person und
 * stellt nichts aus.
 */
import { alsSkript, appCodeBereit, argumente, personDisplayName, restKlient, versammlungHolen, zugangsdaten } from './gemeinsam.mjs'

const APP_URL = 'https://versammlung.app/'

/**
 * Wer gemeint ist: **genau eine** Person dieses Namens. Verglichen wie in der
 * App (`namensSchluessel`): Leerzeichen zusammengezogen, ohne Rand, klein.
 * Zwei gleichnamige kann es nicht geben (`persons_name_eindeutig`) — trifft es
 * trotzdem mehrere, bricht es ab, statt eine zu raten.
 */
export function personZumNamen(persons, name) {
  const schluessel = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const gesucht = schluessel(name)
  const treffer = persons.filter((p) => schluessel(personDisplayName(p.fn, p.ln)) === gesucht)
  if (treffer.length === 1) return treffer[0]
  throw new Error(
    treffer.length === 0
      ? `Keine Person „${name}" in dieser Versammlung.`
      : `„${name}" trifft ${treffer.length} Personen — mit --person-id wählen.`,
  )
}

/**
 * Der Node-Klient in der Form, die `linkAusstellen` erwartet — es braucht nur
 * `upsert`. Nicht `_shared/rest.ts` selbst: Das schickt den Schlüssel auch im
 * `Authorization`-Kopf, und den nimmt PostgREST von einem `sb_secret_…` nicht
 * an (`authKopf` in `gemeinsam.mjs`). `rest` wirft bei einem Fehler; dann gibt
 * es keinen Link, und das Skript bricht mit der Meldung ab.
 */
export function linkKlient(rest) {
  return {
    async upsert(pfad, zeilen) {
      await rest(pfad, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(zeilen),
      })
      return true
    },
  }
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  if (typeof arg.person !== 'string' && typeof arg['person-id'] !== 'string') {
    throw new Error('--person "Vorname Nachname" oder --person-id <id> fehlt. Aufruf siehe Kopf dieser Datei.')
  }
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)
  const cong = await versammlungHolen(rest, arg, 'name')
  const persons = await rest(`persons?select=id,fn,ln&congregation_id=eq.${encodeURIComponent(cong.id)}`)
  const person =
    typeof arg['person-id'] === 'string' ? persons.find((p) => p.id === arg['person-id']) : personZumNamen(persons, arg.person)
  if (!person) throw new Error(`Keine Person mit der Id ${arg['person-id']} in dieser Versammlung.`)

  console.log(`Versammlung:  ${cong.name}`)
  console.log(`Person:       ${personDisplayName(person.fn, person.ln)}`)
  if (arg.trocken) {
    console.log('\n--trocken: kein Link ausgestellt.')
    return
  }

  // Derselbe Code wie in den Functions — kein zweites Rezept für Token und Code.
  appCodeBereit()
  const { linkAusstellen } = await import('../supabase/functions/_shared/anmelde-links.ts')
  const { anmeldeUrl, codeAnzeige, codeUrl } = await import('../supabase/functions/_shared/anmeldung.ts')
  const neu = await linkAusstellen(linkKlient(rest), person.id, cong.id)
  if (!neu) throw new Error('Die Datenbank hat den Link nicht angenommen.')
  const app = typeof arg.app === 'string' ? arg.app : APP_URL
  console.log(`\nLink:         ${anmeldeUrl(app, neu.token)}`)
  console.log(`Code:         ${codeAnzeige(neu.code)}   (QR-Code-Link: ${codeUrl(app, neu.code)})`)
  console.log(`Gültig bis:   ${new Date(neu.gueltigBis).toLocaleString('de-DE')}`)
  console.log('\nLink und Code melden an — nicht weitergeben, nicht in Protokolle kopieren.')
}

alsSkript(import.meta.url, main)
