/**
 * Der S-89-Zettel: die Nutzlast für einen belegten Schulungsplatz und alle
 * Zettel einer Woche für den Druckbogen.
 */

import { istSchuelerBereich, programmPlaetze, slotsOf } from '../aux-class'
import { isSong, istAusgefallen } from '../helpers'
import { meetingDateText } from '../meeting-dates'
import { ersteZahl } from '../ziffern'
import type { MeetingTimes, MeetingSlotSelection, S89Payload, Week } from '../types'

/**
 * Baut die S-89-Nutzlast für einen belegten Schulungs-Slot (Schulungsaufgabe
 * oder Bibellesung). Liefert null, wenn der Slot leer ist oder keine
 * Schulungsaufgabe (Leser/Leiter zählen nicht). Rahmen und Schulungspunkt
 * werden aus der Meta-Zeile geparst.
 */
export function buildS89ForSlot(
  weeks: Week[],
  sel: MeetingSlotSelection,
  zeiten: MeetingTimes,
): S89Payload | null {
  if (sel.kind !== 'part') return null
  const week = weeks[sel.wi]
  const item = week?.[sel.tab].sections[sel.si]?.items[sel.ii]
  if (!week || !item || isSong(item)) return null
  const raum = sel.aux === true
  const slot = slotsOf(item, raum)[sel.ni]
  const current = slot?.name ?? ''
  if (!current) return null
  // Woran ein Schulungsplatz erkannt wird: am **Bereich**, nicht am Titel.
  // `item.title.startsWith('Bibellesung')` stand hier allein — und traf bei
  // einer fremdsprachigen Versammlung nie, denn der Import übernimmt den Titel
  // wörtlich aus der Zielsprache („Lectura de la Biblia"). Die Bibellesung bekam
  // dort **keinen S-89-Zettel**, ohne Fehler und ohne Hinweis; dieselbe Familie
  // wie T61 (Bibelstudium am deutschen Titel gesucht). Den Bereich vergibt der
  // Import in jeder Sprache (`bereichsKey: 'bibellesung'`, parse.ts). Dieselbe
  // Menge wie die Zusätzliche Klasse — seit dem 4.10.2026 samt dem Vortrag
  // eines Schülers (`schulungVortrag`).
  const isStudent = istSchuelerBereich(sel.priv)
  if (!isStudent) return null
  // Hauptteilnehmer (schulung) und Gesprächspartner (schulungPartner) stehen als
  // getrennte Slots im selben Punkt.
  const schulungsPlatz = slotsOf(item, raum).find((n) => n.bereichsKey === 'schulung')
  /*
   * **Ohne Schüler kein Zettel.**
   *
   * Der S-89 gehört dem Schüler; der Gesprächspartner steht nur mit darauf und
   * bekommt eine Abschrift. Ist der Schüler-Platz dieses Punkts noch offen und
   * nur der Partner zugeteilt — der Planer fängt beim Partner an, oder der
   * Schüler wird wieder entfernt —, fiel `leadName` leer aus und der
   * Rückfall `|| current` setzte den **Partner** an die Stelle des Schülers:
   * Der Zettel nannte dieselbe Person zweimal, als Schülerin und als
   * Gesprächspartnerin, und der Druckbogen legte ihn gleich zweimal aus.
   *
   * Der Rückfall bleibt, wofür er gedacht ist: Die **Bibellesung** und der
   * **Vortrag eines Schülers** haben gar keinen `schulung`-Platz (ihrer trägt
   * `bibellesung` bzw. `schulungVortrag`), dort ist der aktuelle Name der des
   * Schülers.
   */
  if (schulungsPlatz && !schulungsPlatz.name) return null
  const leadName = schulungsPlatz?.name ?? ''
  const partnerName = slotsOf(item, raum).find((n) => n.bereichsKey === 'schulungPartner')?.name ?? ''
  const metaFrags = (item.meta ?? '').split(' · ')
  // Der Rahmen („Von Haus zu Haus") — **an der Form erkannt, nicht am Wort**.
  //
  // Hier standen die drei deutschen Wendungen als Aufzählung. In einer
  // fremdsprachigen Versammlung steht im Meta „De casa en casa" oder „‏מבית
  // לבית", und der Zettel ging ohne Rahmen hinaus — der Schüler erfuhr nicht,
  // in welchem Rahmen er seine Aufgabe halten soll.
  //
  // Der Import setzt die Meta-Zeile als „[Rahmen ·] Zeit [· Quelle]" zusammen
  // und gewinnt den Rahmen bereits sprachunabhängig (`settingOf` in parse.ts:
  // der kurze Satz nach der Zeitklammer, **ohne Ziffer**). Genau daran ist er
  // auch hier wieder zu erkennen: Dauer und Quellenangabe tragen immer eine
  // Zahl, in welcher Schrift auch immer („٣ دق", „lmd lección 1"), der Rahmen
  // nie.
  const setting = metaFrags.find((f) => f !== '' && ersteZahl(f) === null) ?? ''
  // Der Schulungspunkt — die **Quelle** der Meta-Zeile, also das Stück hinter
  // der Dauer.
  //
  // Hier stand `/^(th|lmd) /`. Das Publikationskürzel ist aber keine Konstante:
  // zh/ja/ko/ar/he/fa/ur übersetzen es mit („th" → 教励, „教导", „הר"), und dort
  // ging der Schulungspunkt verloren — der Schüler bekam einen Zettel ohne den
  // Punkt, an dem er arbeiten soll. Nebenbei fehlte `lff`, obwohl es dieselbe
  // Rolle spielt wie `th`/`lmd`.
  //
  // Die Zerlegung nutzt dieselbe Zusicherung, auf der schon `itemMinutes`
  // ruht: Der Import setzt die Zeile als „[Rahmen ·] Zeit [· Quelle]" zusammen,
  // der Rahmen trägt nie eine Ziffer — die erste Zahl ist also immer die Dauer,
  // und was danach steht, ist die Quelle.
  const zeitIdx = metaFrags.findIndex((f) => ersteZahl(f) !== null)
  const point = (zeitIdx >= 0 ? metaFrags[zeitIdx + 1] : undefined) ?? ''
  return {
    name: leadName || current, // Bibellesung hat keinen schulung-Slot → aktueller Name
    partner: partnerName,
    date: meetingDateText(week, sel.tab, zeiten),
    type: item.title + (setting ? ` · ${setting}` : ''),
    point,
    // Der Ort stand hier frueher gar nicht im Modell — das Formular zeigte
    // immer 'Hauptsaal'. Jetzt kommt er aus der tatsaechlichen Zuteilung.
    aux: raum,
  }
}

/**
 * Alle S-89-Zettel einer Woche — für den Druckbogen (T71).
 *
 * Schulungsaufgaben gibt es nur unter der Woche, deshalb nur `mid`. Gelaufen
 * wird über **beide Räume**: Die Zusätzliche Klasse ist überall gleichberechtigt,
 * und ihre Zettel sind sogar die, bei denen der Ort auf dem Papier zählt.
 *
 * **Ein Zettel je Aufgabe — mit Partner zwei.** Ein Gespräch hat zwei Plätze
 * (Schüler und Partner); `buildS89ForSlot` liefert für beide denselben Zettel,
 * er nennt ja beide Namen. Gezählt wird deshalb die **Aufgabe**, nicht der
 * Platz — sonst hinge die Zahl daran, wie viele Plätze ein Punkt zufällig hat.
 * Und weil beide je einen Zettel in die Hand bekommen, wird er zweimal
 * gedruckt: derselbe Inhalt, zwei Blattstücke.
 *
 * Die Reihenfolge ist die des Programms: So liegen die Zettel hinterher in der
 * Reihenfolge, in der die Teile drankommen.
 *
 * **Fällt die Zusammenkunft aus, gibt es keine Zettel** — die Zuteilungen ruhen
 * dann nur (`eachAssignedSlot`), gehalten wird keine Aufgabe. Bis zum
 * 15.10.2026 bot der Bogen in einer Kongress-Woche trotzdem ihre Zettel an.
 */
export function alleS89DerWoche(
  weeks: Week[],
  wi: number,
  zeiten: MeetingTimes,
  /** Bei einem Gespräch zwei Zettel drucken — einen für den Partner. */
  partnerZweimal = true,
): S89Payload[] {
  const week = weeks[wi]
  if (!week || istAusgefallen(week, 'mid')) return []
  const out: S89Payload[] = []
  // Je Aufgabe und Raum genau ein Zettel: der erste Platz, für den einer
  // entsteht, deckt den Punkt ab (der Gesprächspartner steht mit darauf).
  // `programmPlaetze` liefert die Plätze eines Punkts zusammenhängend, deshalb
  // genügt es, sich den zuletzt erledigten Raum zu merken.
  let erledigt = ''
  for (const { si, ii, ni, aux, slot } of programmPlaetze(week.mid)) {
    const raum = `${si}|${ii}|${aux}`
    if (raum === erledigt) continue
    const zettel = buildS89ForSlot(weeks, {
      kind: 'part', wi, tab: 'mid', si, ii, ni,
      aux: aux || undefined,
      label: '', priv: slot.bereichsKey ?? null, groups: false,
    }, zeiten)
    if (zettel) {
      // Mit Gesprächspartner zweimal: beide bekommen einen in die Hand.
      out.push(zettel, ...(partnerZweimal && zettel.partner ? [zettel] : []))
      erledigt = raum
    }
  }
  return out
}
