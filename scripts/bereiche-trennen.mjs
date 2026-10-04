/**
 * **Vortrag, Besprechung, Vortrag eines Schülers — im Bestand trennen.**
 *
 * Seit dem 4.10.2026 sind es drei Aufgabenbereiche, wo vorher einer stand
 * (Betreiber): `vortrag` nur noch für den Vortrag unter „Schätze aus Gottes
 * Wort", `besprechung` für alles, was ein Bruder mit den Anwesenden bespricht,
 * und `schulungVortrag` für den Vortrag eines Schülers. Der Import vergibt sie
 * seither so (`parse.ts`). Der **Bestand** trägt noch die alten — und eine
 * importierte Woche lässt sich über die App nicht auffrischen
 * (siehe `rollen-nachtragen.mjs`).
 *
 * Eilig ist es nicht: Eine alte Woche verhält sich mit den alten Bereichen wie
 * bisher, solange die Personen sie behalten — die Vorbelegung der neuen
 * Bereiche lässt `vortrag` und `schulung` stehen. Erst danach fragt aber jeder
 * Platz den Bereich, den er meint. **Vorher** müssen die Personen die neuen
 * Bereiche haben, sonst stehen die umgestellten Plätze ohne Kandidaten da.
 *
 * Geändert wird nur unter der Woche (`mid`), im Hauptsaal und in der
 * Zusätzlichen Klasse (`item.aux`). Erkannt wird an Abschnitt und Stellung, nie
 * am Text — eine fremdsprachige Versammlung speichert ihren eigenen:
 *
 *  - „Schätze aus Gottes Wort": `vortrag` außer im ersten Punkt → `besprechung`
 *    („Nach geistigen Schätzen graben").
 *  - „Uns im Dienst verbessern": `vortrag` → `besprechung` (eine Besprechung
 *    wie „Was würdest du sagen?"); `schulung` mit `male` und ohne Partner →
 *    `schulungVortrag`.
 *  - „Unser Leben als Christ": `vortrag` → `besprechung`; ein eigener Punkt
 *    (`lacAdd`) trug `studium` ohne Rolle → ebenso. Das Versammlungsbibelstudium
 *    (`Leiter` + `Leser`) bleibt, wie es ist.
 *
 * Ein Redner-Platz behält `vortrag`, wo er auch steht — über ihn entscheidet
 * seit dem 4.10.2026 die Stellung (`kandidaten.ts`, `isSpeakerRole`); dazu
 * gehört der Dienstvortrag des Kreisaufsehers (T62). Das Wochenende bleibt
 * deshalb ganz unberührt. Ebenso Namen, Kennungen (`pid`), Bestätigungen — und
 * die Sprachvarianten (`week.alt`), die keine Zuteilungen tragen.
 *
 * Aufruf — der Schlüssel wird erfragt (siehe `rollen-nachtragen.mjs`):
 *
 *   node scripts/bereiche-trennen.mjs --trocken
 *
 * `--trocken`   zeigt nur, was geschähe, und schreibt nichts.
 * `--cong <id>` beschränkt auf eine Versammlung (sonst: alle).
 *
 * Idempotent: Ein zweiter Lauf meldet „0 zu ändern".
 */

import { alsSkript, argumente, restKlient, zugangsdaten } from './gemeinsam.mjs'

/**
 * Art eines Abschnitts unter der Woche: gespeichert (`kind`) oder an der Farbe,
 * die der Import vergibt (`parse.ts`, `FARBE` und `ART`). Der Name taugt nicht —
 * er steht in der Sprache der Versammlung.
 */
const ART_NACH_FARBE = { petrol: 'schaetze', gold: 'dienst', wein: 'lac' }

export function abschnittsArt(sektion) {
  return sektion?.kind ?? ART_NACH_FARBE[sektion?.farbe]
}

/**
 * Ein Redner-Platz — eigener oder auswärtiger Redner, Kreisaufseher. Dieselbe
 * Regel wie `isSpeakerRole` in `helpers.ts`; `bereiche-trennen.test.ts` hält
 * beide zusammen.
 */
export function istRedner(rolle) {
  const r = rolle ?? ''
  return /Gastredner|Kreisaufseher/.test(r) || r.split(' · ')[0] === 'Redner'
}

/**
 * Der neue Bereich eines Platzes — oder `null`, wenn er bleibt.
 *
 * @param {{ bereichsKey?: string, rolle?: string, male?: boolean }} slot
 * @param {{ art?: string, ersterPunkt: boolean, mitPartner: boolean }} punkt
 *   `art` des Abschnitts (`abschnittsArt`); ob der Punkt der erste seines
 *   Abschnitts ist; ob ihm ein Gesprächspartner-Platz gegenübersteht
 */
export function neuerBereich(slot, { art, ersterPunkt, mitPartner }) {
  const key = slot?.bereichsKey
  if (!key || istRedner(slot.rolle)) return null
  if (art === 'schaetze') return key === 'vortrag' && !ersterPunkt ? 'besprechung' : null
  if (art === 'dienst') {
    if (key === 'vortrag') return 'besprechung'
    // Ein Vortrag mit Partner ist keiner mehr: Bis zum 4.10.2026 bot die App
    // den Partner-Knopf auch dort an, und wer ihn drückte, machte daraus ein
    // Gespräch. Das bleibt es.
    if (key === 'schulung' && slot.male === true && !mitPartner) return 'schulungVortrag'
    return null
  }
  if (art === 'lac') {
    if (key === 'vortrag') return 'besprechung'
    // Ein eigener Punkt (`lacAdd`) — der Leiter des Studiums trägt `Leiter`.
    if (key === 'studium' && !slot.rolle) return 'besprechung'
    return null
  }
  return null
}

/** Eine Platzreihe umstellen, an Ort und Stelle. Gibt zurück: geändert, davon besetzt. */
function reiheTrennen(slots, art, ersterPunkt) {
  const zahl = { geaendert: 0, besetzt: 0 }
  if (!Array.isArray(slots)) return zahl
  const punkt = { art, ersterPunkt, mitPartner: slots.some((s) => s?.bereichsKey === 'schulungPartner') }
  for (const slot of slots) {
    const neu = neuerBereich(slot, punkt)
    if (!neu) continue
    slot.bereichsKey = neu
    zahl.geaendert++
    if (slot.name) zahl.besetzt++
  }
  return zahl
}

/**
 * Eine Woche umstellen (nur `mid`, Hauptsaal und Zusätzliche Klasse), an Ort
 * und Stelle. Gibt zurück, wie viele Plätze sich geändert haben und wie viele
 * davon schon besetzt sind — 0 heißt: hier war schon alles richtig.
 */
export function wocheTrennen(data) {
  const zahl = { geaendert: 0, besetzt: 0 }
  for (const sektion of data?.mid?.sections ?? []) {
    const art = abschnittsArt(sektion)
    // Lieder zählen nicht mit: „der erste Punkt" ist der erste mit Plätzen.
    const punkte = (sektion?.items ?? []).filter((item) => Array.isArray(item?.names))
    punkte.forEach((item, i) => {
      for (const reihe of [item.names, item.aux]) {
        const z = reiheTrennen(reihe, art, i === 0)
        zahl.geaendert += z.geaendert
        zahl.besetzt += z.besetzt
      }
    })
  }
  return zahl
}

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)

  const filter = arg.cong ? `&congregation_id=eq.${arg.cong}` : ''
  const rows = await rest(`weeks?select=congregation_id,start,data&order=start.asc${filter}`)
  if (!rows?.length) { console.error('Keine Wochen gefunden.'); process.exit(1) }

  const zuSchreiben = []
  for (const row of rows) {
    const zahl = wocheTrennen(row.data)
    if (zahl.geaendert) zuSchreiben.push({ ...row, ...zahl })
  }

  console.log(`${rows.length} Wochen gelesen, ${zuSchreiben.length} zu ändern:`)
  for (const w of zuSchreiben) console.log(`  ${w.start}  ${w.geaendert} Plätze, davon ${w.besetzt} besetzt`)
  if (!zuSchreiben.length) { console.log('Nichts zu tun — die Bereiche sind schon getrennt.'); return }

  if (arg.trocken) {
    console.log(`\n--trocken: nichts geschrieben (${zuSchreiben.length} Wochen wären betroffen).`)
    return
  }

  for (const w of zuSchreiben) {
    await rest(`weeks?congregation_id=eq.${w.congregation_id}&start=eq.${w.start}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: w.data }),
    })
  }
  console.log(`\n${zuSchreiben.length} Wochen geschrieben. Zur Kontrolle noch einmal mit --trocken: „0 zu ändern".`)
}

alsSkript(import.meta.url, main)
