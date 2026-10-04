import { describe, expect, it } from 'vitest'
import { abschnittsArt, istRedner, neuerBereich, wocheTrennen } from './bereiche-trennen.mjs'
import { parseWorkbookWeek } from '../supabase/functions/import-week/parse.ts'
import { isSpeakerRole, ROLE_CIRCUIT, ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from '../src/data/helpers'
import { syncAuxSlots } from '../src/data/aux-class'
import type { PartItem, Week } from '../src/data/types'

/**
 * Das Skript fasst **Produktivdaten** an und ist der einzige Weg, die
 * getrennten Bereiche in schon importierte Wochen zu bringen. Gemessen wird es
 * am **Import selbst**: Eine Woche, wie `parse.ts` sie heute liefert, wird auf
 * die alten Bereiche zurückgedreht — und das Skript muss genau die heutige
 * Fassung wiederherstellen. Eine Abschrift der Regel stünde daneben und könnte
 * mit ihr zusammen falsch sein.
 *
 * Und, wie bei `rollen-nachtragen`: Es darf **nichts anderes anfassen**.
 */

/** Eine Wochenseite in der Form der echten — Platzhaltertext, nur die Struktur zählt. */
const SEITE = `
<article>
  <h1 data-pid="1" class="du-color--textSubdued">1.-7. Juli</h1>
  <h2 data-pid="2" class="du-fontSize--base">MUSTERBUCH 1-3</h2>
  <h3 data-pid="3" class="x"><span class="dc-icon--music"></span> Lied 1 und Gebet | Einleitende Worte (1 Min.)</h3>
  <h2 data-pid="4" class="du-color--teal-700">SCHÄTZE AUS GOTTES WORT</h2>
  <h3 data-pid="5" class="du-color--teal-700">1. Erster Vortrag</h3>
  <p data-pid="6">(10 Min.)</p>
  <h3 data-pid="7" class="du-color--teal-700">2. Nach geistigen Schätzen graben</h3>
  <p data-pid="8">(10 Min.)</p>
  <h3 data-pid="9" class="du-color--teal-700">3. Bibellesung</h3>
  <p data-pid="10">(4 Min.) Mus 1:1-9 ( th Lektion 2 )</p>
  <h2 data-pid="18" class="du-color--gold-700">UNS IM DIENST VERBESSERN</h2>
  <h3 data-pid="19" class="du-color--gold-700">4. Gespräche beginnen</h3>
  <p data-pid="20">(3 Min.) VON HAUS ZU HAUS. Irgendein Satz.</p>
  <h3 data-pid="21" class="du-color--gold-700">5. Vortrag</h3>
  <p data-pid="22">(5 Min.) Vortrag. Irgendein Satz.</p>
  <h3 data-pid="23" class="du-color--gold-700">6. Was würdest du sagen?</h3>
  <p data-pid="24">(6 Min.) Besprechung. VON HAUS ZU HAUS. Irgendein Satz.</p>
  <h2 data-pid="40" class="du-color--maroon-600">UNSER LEBEN ALS CHRIST</h2>
  <h3 data-pid="41" class="x"><span class="dc-icon--music"></span> Lied 2</h3>
  <h3 data-pid="42" class="du-color--maroon-600">7. Erster eigener Punkt</h3>
  <p data-pid="43">(15 Min.) Besprechung.</p>
  <h3 data-pid="44" class="du-color--maroon-600">8. Versammlungsbibelstudium</h3>
  <p data-pid="45">(30 Min.) lfb Geschichte 1</p>
  <h3 data-pid="46" class="x"><span class="dc-icon--music"></span> Schlussworte (3 Min.) | Lied 3 und Gebet</h3>
</article>`

/** Die Woche, wie der Import sie heute liefert — samt Zusätzlicher Klasse. */
function heute(): Week {
  const w = parseWorkbookWeek(SEITE) as unknown as Week
  w.start = '2026-07-06'
  return syncAuxSlots([w], true)[0]!
}

/** Alle Plätze einer Woche, Hauptsaal und Klasse — zum Drehen und Vergleichen. */
function plaetze(w: Week) {
  return [w.mid, w.we].flatMap((m) =>
    m.sections.flatMap((s) => s.items.flatMap((i) => ('names' in i ? [...i.names, ...(i.aux ?? [])] : []))),
  )
}

/** Auf den Stand vor dem 4.10.2026 zurückdrehen: so liegt der Bestand in der Datenbank. */
function wieFrueher(w: Week): Week {
  const alt = structuredClone(w)
  for (const slot of plaetze(alt)) {
    if (slot.bereichsKey === 'besprechung') slot.bereichsKey = 'vortrag'
    if (slot.bereichsKey === 'schulungVortrag') slot.bereichsKey = 'schulung'
  }
  return alt
}

describe('Der Bestand wird zu dem, was der Import heute liefert', () => {
  it('die Probe hat etwas zu tun — sonst bewiese sie nichts', () => {
    // Graben, Besprechung im Dienstteil, Vortrag eines Schülers, ein
    // Unser-Leben-Punkt — je Hauptsaal; zwei davon auch in der Klasse.
    const alt = wieFrueher(heute())
    expect(plaetze(alt).filter((s) => s.bereichsKey === 'besprechung' || s.bereichsKey === 'schulungVortrag')).toEqual([])
    expect(wocheTrennen(alt).geaendert).toBeGreaterThanOrEqual(5)
  })

  it('Hauptsaal und Zusätzliche Klasse stehen danach wie frisch importiert', () => {
    const neu = heute()
    const alt = wieFrueher(neu)
    wocheTrennen(alt)
    expect(alt.mid).toEqual(neu.mid)
  })

  it('ein zweiter Lauf hat nichts mehr zu tun', () => {
    const alt = wieFrueher(heute())
    wocheTrennen(alt)
    expect(wocheTrennen(alt)).toEqual({ geaendert: 0, besetzt: 0 })
  })

  it('das Wochenende bleibt, wie es ist — dort trägt nur der Redner-Platz `vortrag`', () => {
    const alt = wieFrueher(heute())
    const vorher = structuredClone(alt.we)
    wocheTrennen(alt)
    expect(alt.we).toEqual(vorher)
  })
})

describe('Was das Skript nicht anfasst', () => {
  /** Ein besetzter Platz im Graben-Punkt (zweiter Schätze-Punkt), in der alten Form. */
  const mitBesetzung = () => {
    const alt = wieFrueher(heute())
    const graben = alt.mid.sections.find((s) => s.kind === 'schaetze')!.items[1] as PartItem
    graben.names[0] = { name: 'Probe Eins', pid: 'p-1', bereichsKey: 'vortrag' }
    return { alt, graben }
  }

  it('Namen und Kennungen bleiben — nur der Bereich ändert sich', () => {
    const { alt, graben } = mitBesetzung()
    expect(wocheTrennen(alt)).toMatchObject({ besetzt: 1 })
    expect(graben.names[0]).toEqual({ name: 'Probe Eins', pid: 'p-1', bereichsKey: 'besprechung' })
  })

  it('der Vortrag unter „Schätze aus Gottes Wort" bleibt `vortrag` — er ist der erste Punkt', () => {
    const alt = wieFrueher(heute())
    wocheTrennen(alt)
    const schaetze = alt.mid.sections.find((s) => s.kind === 'schaetze')!.items as PartItem[]
    expect(schaetze.map((p) => p.names[0]!.bereichsKey)).toEqual(['vortrag', 'besprechung', 'bibellesung'])
  })

  it('das Versammlungsbibelstudium bleibt — Leiter und Leser', () => {
    const alt = wieFrueher(heute())
    wocheTrennen(alt)
    const lac = alt.mid.sections.find((s) => s.kind === 'lac')!.items.filter((i) => 'names' in i) as PartItem[]
    expect(lac.at(-1)!.names.map((n) => `${n.rolle}:${n.bereichsKey}`)).toEqual(['Leiter:studium', 'Leser:leser'])
  })

  it('die Sprachvarianten tragen keine Zuteilungen und bleiben unberührt', () => {
    const alt = wieFrueher(heute())
    alt.alt = { en: structuredClone({ mid: alt.mid, we: alt.we, range: '', book: '' }) } as unknown as Week['alt']
    const vorher = structuredClone(alt.alt)
    wocheTrennen(alt)
    expect(alt.alt).toEqual(vorher)
  })
})

describe('Die Sonderfälle', () => {
  const dienst = { art: 'dienst', ersterPunkt: false, mitPartner: false }
  const lac = { art: 'lac', ersterPunkt: false, mitPartner: false }

  it('ein eigener Punkt unter „Unser Leben als Christ" (`studium` ohne Rolle) wird Besprechung', () => {
    // So legte `lacAdd` ihn bis zum 4.10.2026 an; heute bekommt er `besprechung`.
    expect(neuerBereich({ bereichsKey: 'studium' }, lac)).toBe('besprechung')
    expect(neuerBereich({ bereichsKey: 'studium', rolle: 'Leiter' }, lac)).toBeNull()
  })

  it('der Dienstvortrag des Kreisaufsehers bleibt `vortrag` — ein Redner-Platz', () => {
    expect(neuerBereich({ bereichsKey: 'vortrag', rolle: ROLE_CIRCUIT }, lac)).toBeNull()
  })

  it('ein Vortrag mit Partner ist ein Gespräch geworden und bleibt `schulung`', () => {
    // Den Partner-Knopf bot die App bis zum 4.10.2026 auch am Vortrag an.
    expect(neuerBereich({ bereichsKey: 'schulung', male: true }, { ...dienst, mitPartner: true })).toBeNull()
    expect(neuerBereich({ bereichsKey: 'schulung', male: true }, dienst)).toBe('schulungVortrag')
    // Ein Gesprächsführer (ohne `male`) bleibt ohnehin.
    expect(neuerBereich({ bereichsKey: 'schulung' }, dienst)).toBeNull()
  })

  it('ein Abschnitt ohne gespeicherte Art wird an seiner Farbe erkannt — nie am Namen', () => {
    expect(abschnittsArt({ label: 'SERVO XI', farbe: 'gold' })).toBe('dienst')
    expect(abschnittsArt({ label: 'XORBI SATO', farbe: 'petrol' })).toBe('schaetze')
    expect(abschnittsArt({ label: 'VIVO KRISTO', farbe: 'wein' })).toBe('lac')
    expect(abschnittsArt({ label: 'PROBE', farbe: 'neutral' })).toBeUndefined()
    // Die gespeicherte Art geht vor.
    expect(abschnittsArt({ label: 'X', farbe: 'gold', kind: 'eroeffnung' })).toBe('eroeffnung')
  })

  it('`istRedner` entscheidet wie `isSpeakerRole` in der App', () => {
    const rollen = [
      ROLE_OWN_SPEAKER, ROLE_GUEST_SPEAKER, ROLE_CIRCUIT, 'Gastredner · Vers. Probe', 'Redner · Probe',
      'Vorsitz', 'Gebet', 'Leiter', 'Leser', 'Schüler', 'Partner', 'Ratgeber', '', undefined,
    ]
    for (const r of rollen) expect(`${r}: ${istRedner(r)}`).toBe(`${r}: ${isSpeakerRole(r)}`)
  })
})
