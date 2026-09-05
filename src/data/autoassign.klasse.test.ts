import { describe, expect, it } from 'vitest'
import { syncAuxSlots } from './aux-class'
import {
  emptyQualifications,
  idAufloeser,
  MEETING_TABS,
  partnerGenderOk,
  programmPlaetze,
} from './helpers'
import { autoAssignMeeting } from './planning'
import { buildImportWeek, DEMO_SERVICES } from './testdaten'
import type { Person, Qualifications, Week } from './types'

/**
 * **Die Auto-Zuteilung über zehn Wochen — mit eingeschalteter Zusätzlicher
 * Klasse.**
 *
 * `autoassign.sim.test.ts` simuliert dasselbe, aber ohne Klasse: Seine
 * Hilfsfunktionen lesen `item.names` und sehen die zweite Platzreihe gar nicht.
 * Genau die ist der Wiederholungstäter dieses Projekts — `alle-plaetze.test.ts`
 * steht ihretwegen da: „Seither ist derselbe Fehler viermal passiert: eine
 * Funktion wurde erweitert, die nächste nicht."
 *
 * Was hier gemessen wird, lässt sich nicht durch Lesen entscheiden, weil es aus
 * dem Zusammenspiel von zehn Läufen entsteht:
 *
 *  1. Die Klasse wird **überhaupt** besetzt — samt Ratgeber je Zusammenkunft.
 *  2. **Niemand steht zur selben Zeit in zwei Räumen.** Die einzige erlaubte
 *     Doppelung ist Vorsitz + Anfangsgebet.
 *  3. Der Gesprächspartner passt zum Führer **desselben** Raums — die Regel,
 *     die sich vorher nach dem Hauptsaal richtete.
 *
 * Gezählt wird über die **Person-Id** (`idAufloeser`), nicht über den Namen:
 * Sonst prüfte der Test etwas anderes als die Zuteilung entscheidet.
 */

let n = 0
const priv = (keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) q[k] = true
  return q
}
const mk = (quals: string[], female = false): Person => {
  n += 1
  return { id: `a${n}`, fn: 'T', ln: `P${n}`, role: 'verkuendiger', female, tel: '', mail: '', priv: priv(quals) }
}

/** Bereiche, die ein Bruder mit allen Programm-Rechten hat. */
const PROGRAMM = ['vorsitzMid', 'vorsitzWe', 'gebet', 'vortrag', 'bibellesung', 'leser', 'studium', 'ratgeber']

/** Eine Versammlung, die groß genug für zwei Räume ist. */
function versammlung(): Person[] {
  n = 0
  const dienste = DEMO_SERVICES.filter((s) => !s.groups).map((s) => `svc:${s.key}`)
  return [
    ...Array.from({ length: 12 }, () => mk(PROGRAMM)),
    ...Array.from({ length: 14 }, () => mk(['schulung', 'schulungPartner'], true)),
    ...Array.from({ length: 8 }, () => mk(['schulung', 'schulungPartner'])),
    ...Array.from({ length: 10 }, () => mk(dienste)),
  ]
}

function simulieren(leute: Person[], wochen: number): Week[] {
  let weeks: Week[] = Array.from({ length: wochen }, (_unused, i) => ({
    ...buildImportWeek(),
    // Eigener Montag je Woche (T66): der Abstand steckt im Datum, nicht im Index.
    start: new Date(Date.UTC(2026, 8, 7 + i * 7)).toISOString().slice(0, 10),
  }))
  weeks = syncAuxSlots(weeks, true) // Zusätzliche Klasse einschalten
  for (let wi = 0; wi < wochen; wi++) {
    for (const tab of MEETING_TABS) {
      weeks = autoAssignMeeting(weeks, wi, tab, leute, DEMO_SERVICES, [], 'all').weeks
    }
  }
  return weeks
}

describe('Auto-Zuteilung mit Zusätzlicher Klasse (10 Wochen)', () => {
  const leute = versammlung()
  const weeks = simulieren(leute, 10)
  const werIst = idAufloeser(leute)

  it('besetzt die zweite Platzreihe und den Ratgeber', () => {
    // Ohne diesen Fall wären die beiden darunter grün, weil gar nichts
    // zugeteilt wurde.
    let auxBesetzt = 0
    for (const w of weeks) for (const { aux, slot } of programmPlaetze(w.mid)) if (aux && slot.name) auxBesetzt++
    expect(auxBesetzt, 'Plätze der Klasse').toBeGreaterThan(10)
    expect(weeks.filter((w) => w.mid.auxRatgeber?.name), 'Ratgeber je Woche').toHaveLength(weeks.length)
  })

  it('niemand steht zur selben Zeit in zwei Räumen', () => {
    const doppelt: string[] = []
    weeks.forEach((w, wi) => {
      for (const tab of MEETING_TABS) {
        const wo = new Map<string, string[]>()
        for (const { slot, section, aux } of programmPlaetze(w[tab])) {
          const id = werIst(slot)
          if (!id) continue
          const stelle = `${aux ? 'Klasse' : 'Saal'}/${section.label}/${slot.rolle ?? slot.bereichsKey ?? '?'}`
          wo.set(id, [...(wo.get(id) ?? []), stelle])
        }
        const ratgeber = werIst(w[tab].auxRatgeber)
        if (ratgeber) wo.set(ratgeber, [...(wo.get(ratgeber) ?? []), 'Ratgeber'])
        for (const [id, stellen] of wo) {
          if (stellen.length === 1) continue
          // Die eine erlaubte Doppelung: Vorsitz + Anfangsgebet der Eröffnung.
          const vorsitzUndGebet =
            stellen.length === 2 &&
            stellen.every((s) => s.includes('ERÖFFNUNG')) &&
            stellen.some((s) => s.endsWith('Vorsitz')) &&
            stellen.some((s) => s.endsWith('Gebet'))
          if (!vorsitzUndGebet) doppelt.push(`W${wi}/${tab}: ${id} → ${stellen.join(' + ')}`)
        }
      }
    })
    expect(doppelt, doppelt.slice(0, 5).join(' | ')).toEqual([])
  })

  /*
    **Wer von Hand in der Klasse steht, ist für den Lauf besetzt.**

    Die drei Fälle darüber laufen jedes Mal aus dem Leeren; die `used`-Menge,
    mit der `autoAssignMeeting` beginnt, ist dabei ohnehin leer und sagt nichts.
    Genau sie war aber der Fehler: Gelesen wurde lange nur `item.names` — wer
    von Hand in die Klasse eingeteilt war, fehlte darin und bekam vom nächsten
    Lauf **zusätzlich** einen Platz im Hauptsaal. Dieselbe Person zur selben
    Zeit in zwei Räumen, und niemand sah es: Die Klasse steht in der Ansicht
    daneben, nicht darin.

    Deshalb hier der Weg, den ein Planer wirklich geht: erst von Hand, dann
    „automatisch zuteilen".
  */
  it('eine von Hand besetzte Klasse sperrt für den Hauptsaal', () => {
    /*
      **Genau eine Kandidatin.** Ohne diese Zuspitzung sagt der Fall nichts:
      Unter zwanzig Bewerbern wäre es Zufall, ob ausgerechnet sie ein zweites
      Mal gezogen wird. Hier kann die Automatik nur sie nehmen — oder den Platz
      offen lassen. Offen lassen ist die richtige Antwort: Sie ist zur selben
      Zeit im anderen Raum.
    */
    const nurEine = mk(['schulung', 'schulungPartner'], true)
    let weeks2: Week[] = [{ ...buildImportWeek(), start: '2026-09-07' }]
    weeks2 = syncAuxSlots(weeks2, true)

    // Den ersten Schülerteil suchen und ihn **in der Klasse** von Hand besetzen.
    const punkt = weeks2[0]!.mid.sections
      .flatMap((sec) => sec.items)
      .find((it) => !('song' in it) && (it.aux ?? []).some((sl) => sl.bereichsKey === 'schulung'))
    expect(punkt, 'kein Schülerteil mit Klassen-Platz gefunden').toBeDefined()
    const klassenPlatz = (punkt as { aux?: Array<{ name: string; pid?: string; bereichsKey?: string }> })
      .aux!.find((sl) => sl.bereichsKey === 'schulung')!
    const hauptsaalPlatz = (punkt as { names: Array<{ name: string; bereichsKey?: string }> })
      .names.find((sl) => sl.bereichsKey === 'schulung')!
    klassenPlatz.name = `${nurEine.fn} ${nurEine.ln}`
    klassenPlatz.pid = nurEine.id
    expect(hauptsaalPlatz.name, 'der Hauptsaal-Platz muss offen sein').toBe('')

    const { weeks: fertig, unfilled } = autoAssignMeeting(
      weeks2, 0, 'mid', [nurEine], DEMO_SERVICES, [], 'parts',
    )

    // Sie steht danach genau einmal da — in der Klasse, wo der Planer sie
    // hingesetzt hat. Der Hauptsaal-Platz bleibt offen und wird gezählt.
    const stellen: string[] = []
    for (const { slot, aux } of programmPlaetze(fertig[0]!.mid)) {
      if (slot.pid !== nurEine.id) continue
      stellen.push(aux ? 'Klasse' : 'Saal')
    }
    expect(stellen, stellen.join(' + ')).toEqual(['Klasse'])
    expect(unfilled, 'nicht besetzbare Plätze').toBeGreaterThan(0)
  })

  it('der Gesprächspartner passt zum Führer DESSELBEN Raums', () => {
    // Die Regel richtete sich einmal nach dem Hauptsaal — die Klasse bekam
    // dadurch ein Paar, das nicht zusammenpasst (siehe `ministryOpts`).
    const falsch: string[] = []
    const nachId = new Map(leute.map((p) => [p.id, p]))
    weeks.forEach((w, wi) => {
      for (const section of w.mid.sections) {
        for (const item of section.items) {
          if ('song' in item) continue
          for (const [istKlasse, plaetze] of [[false, item.names], [true, item.aux ?? []]] as const) {
            const fuehrer = plaetze.find((s) => s.bereichsKey === 'schulung')
            const partner = plaetze.find((s) => s.bereichsKey === 'schulungPartner')
            if (!fuehrer?.name || !partner?.name) continue
            const f = nachId.get(werIst(fuehrer) ?? '')
            const p = nachId.get(werIst(partner) ?? '')
            if (f && p && !partnerGenderOk(f, p)) {
              falsch.push(`W${wi} ${istKlasse ? 'Klasse' : 'Saal'}: ${f.ln}/${p.ln}`)
            }
          }
        }
      }
    })
    expect(falsch, falsch.slice(0, 5).join(' | ')).toEqual([])
  })
})
