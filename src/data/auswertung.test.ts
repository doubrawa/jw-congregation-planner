import { describe, expect, it } from 'vitest'
import { buildImportWeek, DEMO_SERVICES } from '../../tests/testdaten/testdaten'
import { KEINE_ABWESENHEIT } from './absence'
import {
  auswerten,
  ballungen,
  einseitig,
  grundlage,
  hinweise,
  istEinseitig,
  kennzahlen,
  lageVon,
  matrix,
  personBild,
  treffpunkte,
  verteilung,
  wartezeiten,
  zeitfenster,
  type Grundlage,
} from './auswertung'
import { emptyQualifications, isSong, privSetzen, serviceQualKey } from './helpers'
import { tagNach } from './meeting-dates'
import type { FsInstance, Group, Meeting, Person, Week } from './types'

/**
 * **Die Auswertung rechnet so, wie die Automatik verteilt** (T126). Jeder Fall
 * unten baut sich seine Wochen selbst: aus der Testwoche des Arbeitshefts, mit
 * genau den Namen, um die es geht.
 */

const HEUTE = '2026-09-09' // ein Mittwoch; die laufende Woche beginnt am 7.9.
const MONTAG = '2026-09-07'

function person(id: string, bereiche: string[], extra: Partial<Person> = {}): Person {
  const priv = emptyQualifications()
  for (const b of bereiche) privSetzen(priv, b, true)
  return { id, fn: id, ln: 'Test', role: 'verkuendiger', tel: '', mail: '', priv, ...extra }
}

/** Die `n`-te Woche vor der laufenden (1 = letzte Woche). */
function start(vorWochen: number): string {
  return tagNach(MONTAG, -7 * vorWochen)
}

/** Eine leere Testwoche mit diesem Montag. */
function woche(vorWochen: number): Week {
  const w = structuredClone(buildImportWeek())
  w.start = start(vorWochen)
  return w
}

/** Setzt `p` auf den `nth` Platz dieses Bereichs (Programm). */
function setze(meeting: Meeting, bereich: string, p: Person | string, nth = 0): void {
  let gefunden = 0
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.bereichsKey !== bereich) continue
        if (gefunden++ === nth) {
          if (typeof p === 'string') slot.name = p
          else Object.assign(slot, { name: `${p.fn} ${p.ln}`, pid: p.id })
          return
        }
      }
    }
  }
  throw new Error(`kein Platz ${bereich} #${nth}`)
}

function hilfsdienst(meeting: Meeting, svc: string, p: Person): void {
  meeting.helpers[svc] = [...(meeting.helpers[svc] ?? []), { name: `${p.fn} ${p.ln}`, pid: p.id }]
}

function g(weeks: Week[], persons: Person[], anzahlWochen = 13, abwesend = KEINE_ABWESENHEIT): Grundlage {
  return grundlage({ weeks, persons, services: DEMO_SERVICES, abwesend, fenster: zeitfenster(weeks, anzahlWochen, HEUTE) })
}

describe('Zeitraum', () => {
  it('die abgeschlossenen Wochen bis vor die laufende — die laufende zählt nicht', () => {
    const weeks = [woche(14), woche(13), woche(1), woche(0)]
    const f = zeitfenster(weeks, 13, HEUTE)
    expect(f.bis).toBe(MONTAG)
    expect(f.von).toBe(start(13))
    expect(f.wochen).toEqual([1, 2])
  })
})

describe('Was zählt', () => {
  const vorsitz = person('vorsitz', ['vorsitzMid', 'gebet'])
  const beter = person('beter', ['gebet'])

  it('das Anfangsgebet des Vorsitzenden kam mit dem Vorsitz — eines anderen zählt', () => {
    const a = woche(1)
    setze(a.mid, 'vorsitzMid', vorsitz)
    setze(a.mid, 'gebet', vorsitz, 0) // Anfangsgebet, folgt dem Vorsitz
    const b = woche(2)
    setze(b.mid, 'vorsitzMid', vorsitz)
    setze(b.mid, 'gebet', beter, 0) // ein anderer betet
    const e = g([b, a], [vorsitz, beter]).einteilungen
    expect(e.filter((x) => x.pid === 'vorsitz').map((x) => x.bereich)).toEqual(['vorsitzMid', 'vorsitzMid'])
    expect(e.filter((x) => x.pid === 'beter').map((x) => x.bereich)).toEqual(['gebet'])
  })

  it('der feste Wachtturm-Studium-Leiter zählt nicht — ohne festen Leiter rotiert der Platz und zählt', () => {
    const leiter = person('leiter', ['studium'])
    const w = woche(1)
    const studium = w.we.sections.find((s) => s.label === 'WACHTTURM-STUDIUM')!
    const item = studium.items.find((i) => !isSong(i))!
    if (isSong(item)) throw new Error('kein Punkt')
    Object.assign(item.names[0]!, { name: 'leiter Test', pid: 'leiter' })
    expect(g([w], [leiter]).einteilungen).toHaveLength(1)
    const fest = { ...leiter, priv: { ...leiter.priv, wtLeiter: true } }
    expect(g([w], [fest]).einteilungen).toHaveLength(0)
  })

  it('Gastredner, Namen ohne Person und ausgefallene Zusammenkünfte zählen nicht', () => {
    const w = woche(1)
    setze(w.we, 'vortrag', beter) // Rolle „Gastredner": kommt von außen
    setze(w.mid, 'bibellesung', 'Freitext ohne Person')
    const aus = woche(2)
    setze(aus.mid, 'gebet', beter, 1)
    aus.dev = { mid: { cancelled: true } }
    const grund = g([aus, w], [beter])
    expect(grund.einteilungen).toEqual([])
    expect(grund.zusammenkuenfte).toBe(3)
  })

  it('Hilfsdienste zählen je Platz, die Reinigung (Gruppen) nicht', () => {
    const mik = person('mik', [serviceQualKey('mik')])
    const w = woche(1)
    hilfsdienst(w.mid, 'mik', mik)
    w.mid.helpers['rein'] = [{ name: 'Gruppe 1' }]
    const e = g([w], [mik]).einteilungen
    expect(e).toEqual([expect.objectContaining({ pid: 'mik', bereich: 'svc:mik', hilfsdienst: true })])
  })
})

describe('Zu oft, zu selten', () => {
  it('die Grenzen: mehr als die Hälfte daneben und mindestens drei', () => {
    expect(lageVon(7, 3)).toBe('oft')
    expect(lageVon(4, 3)).toBe('rahmen') // 4 ≤ 4,5
    expect(lageVon(0, 3)).toBe('selten')
    expect(lageVon(0, 2)).toBe('rahmen') // nur zwei daneben
    expect(lageVon(5, 2)).toBe('oft')
    // Auch nach oben: doppelt so viel wie erwartet, aber nur einer oder zwei
    // daneben, fällt nicht auf — bei kleinen Erwartungen sonst fast jeder.
    expect(lageVon(2, 1)).toBe('rahmen')
    expect(lageVon(2, 0)).toBe('rahmen')
    expect(lageVon(3, 0)).toBe('oft')
  })

  it('erwartet ist der gleiche Anteil an den Plätzen des Bereichs', () => {
    const a = person('a', ['gebet'])
    const b = person('b', ['gebet'])
    const c = person('c', ['gebet'])
    // Neun Wochen mit je einem Schlussgebet (unter der Woche): a 7, b 2, c 0.
    const weeks = Array.from({ length: 9 }, (_, i) => {
      const w = woche(9 - i)
      setze(w.mid, 'gebet', i < 7 ? a : b, 1)
      return w
    })
    const v = verteilung(g(weeks, [a, b, c]), [a, b, c], 'aufgaben')
    expect(v.oft.map((z) => [z.pid, z.n, z.erwartet])).toEqual([['a', 7, 3]])
    expect(v.rahmen.map((z) => z.pid)).toEqual(['b'])
    expect(v.selten.map((z) => [z.pid, z.n, z.erwartet])).toEqual([['c', 0, 3]])
  })

  it('wer abwesend war, von dem wird weniger erwartet', () => {
    const a = person('a', ['gebet'])
    const b = person('b', ['gebet'])
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const w = woche(4 - i)
      setze(w.mid, 'gebet', a, 1)
      return w
    })
    // b fehlt in allen vier Zusammenkünften unter der Woche, ist am Wochenende da.
    const abwesend = new Set(weeks.map((_, wi) => `b|${wi}|mid`))
    const v = verteilung(g(weeks, [a, b], 13, abwesend), [a, b], 'aufgaben')
    const alle = [...v.oft, ...v.rahmen, ...v.selten]
    // a war in acht Zusammenkünften da, b in vier: a erwartet 4 · 8/12.
    expect(alle.find((z) => z.pid === 'a')?.erwartet).toBeCloseTo(8 / 3)
    expect(alle.find((z) => z.pid === 'b')?.erwartet).toBeCloseTo(4 / 3)
  })

  it('Hilfsdienste: verglichen wird die Gesamtlast, wie die Automatik sie verteilt', () => {
    const viel = person('viel', ['gebet', serviceQualKey('mik')])
    const wenig = person('wenig', [serviceQualKey('mik')])
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const w = woche(6 - i)
      setze(w.mid, 'gebet', viel, 1)
      hilfsdienst(w.mid, 'mik', wenig)
      return w
    })
    const grund = g(weeks, [viel, wenig])
    const v = verteilung(grund, [viel, wenig], 'hilfsdienste')
    const alle = [...v.oft, ...v.rahmen, ...v.selten]
    // viel: 6 Gebete, kein Mikrofon — mit der Gesamtlast im Rahmen, nicht „zu selten".
    expect(alle.find((z) => z.pid === 'viel')).toMatchObject({ n: 6, hilfsdienste: 0, lage: 'rahmen' })
    expect(alle.find((z) => z.pid === 'wenig')).toMatchObject({ n: 6, hilfsdienste: 6 })
  })

  it('Schulungsaufgaben: nur Schüler, Partner und Vortrag — und nur, wer sie hat', () => {
    const s = person('s', ['schulung'])
    const nur = person('nur', ['gebet'])
    const w = woche(1)
    setze(w.mid, 'schulung', s)
    setze(w.mid, 'gebet', nur, 1)
    const v = verteilung(g([w], [s, nur]), [s, nur], 'schulung')
    expect([...v.oft, ...v.rahmen, ...v.selten].map((z) => z.pid)).toEqual(['s'])
  })
})

describe('Einseitig', () => {
  it('zwei Drittel in einem Bereich, ab sechs Zuteilungen — und nie Gesprächsführerin', () => {
    const lena = person('lena', ['schulung'])
    const elke = person('elke', ['schulung'])
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const w = woche(8 - i)
      setze(w.mid, 'schulungPartner', lena, i % 3)
      setze(w.mid, 'schulung', elke, i % 3)
      return w
    })
    const zeile = einseitig(g(weeks, [lena, elke]), [lena, elke]).find((z) => z.pid === 'lena')!
    expect(zeile.ueberwiegt).toBe('schulungPartner')
    expect(zeile.nie).toEqual(['schulung'])
    expect(istEinseitig(zeile)).toBe(true)
  })

  it('unter sechs Zuteilungen überwiegt nichts — zu wenig, um es zu sagen', () => {
    const p = person('p', ['gebet', 'bibellesung'])
    const q = person('q', ['bibellesung'])
    const weeks = Array.from({ length: 5 }, (_, i) => {
      const w = woche(5 - i)
      setze(w.mid, 'gebet', p, 1)
      if (i === 0) setze(w.mid, 'bibellesung', q)
      return w
    })
    const [zeile] = einseitig(g(weeks, [p, q]), [p, q])
    expect(zeile).toMatchObject({ pid: 'p', gesamt: 5, ueberwiegt: null, nie: [] })
  })

  it('nie in einem Bereich, den die anderen im Schnitt viermal hatten', () => {
    const claus = person('claus', [serviceQualKey('mik'), serviceQualKey('saal')])
    const andere = person('andere', [serviceQualKey('saal')])
    const weeks = Array.from({ length: 5 }, (_, i) => {
      const w = woche(5 - i)
      hilfsdienst(w.mid, 'mik', claus)
      hilfsdienst(w.mid, 'saal', andere)
      return w
    })
    const zeilen = einseitig(g(weeks, [claus, andere]), [claus, andere])
    const z = zeilen.find((x) => x.pid === 'claus')!
    expect(z.nie).toEqual(['svc:saal'])
    expect(z.bereiche.find((b) => b.bereich === 'svc:saal')?.schnittAndere).toBe(5)
    // `andere` hat nur einen Bereich — einseitig kann dort niemand sein.
    expect(zeilen.map((x) => x.pid)).toEqual(['claus'])
  })

  it('die Tabelle Person × Bereich: null ohne Bereich, 0 mit Bereich und nie dran', () => {
    const a = person('a', ['gebet', 'bibellesung'])
    const b = person('b', ['gebet'])
    const w = woche(1)
    setze(w.mid, 'gebet', a, 1)
    setze(w.mid, 'bibellesung', a)
    const grund = g([w], [a, b])
    const m = matrix(grund, [a, b], einseitig(grund, [a, b]), ['gebet', 'bibellesung'])
    expect(m.bereiche).toEqual(['gebet', 'bibellesung'])
    expect(m.zeilen).toEqual([
      { pid: 'a', einseitig: false, werte: [1, 1] },
      { pid: 'b', einseitig: false, werte: [0, null] },
    ])
  })
})

describe('Wartezeiten', () => {
  // Gebete: a alle zwei Wochen, b einmal vor zehn Wochen, c nie.
  const a = person('a', ['gebet'])
  const b = person('b', ['gebet'])
  const c = person('c', ['gebet'])
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const vor = 12 - i
    const w = woche(vor)
    if (vor % 2 === 0) setze(w.mid, 'gebet', a, 1)
    if (vor === 10) setze(w.we, 'gebet', b, 1)
    return w
  })

  it('üblich ist der mittlere Abstand; wartet lange, wer doppelt so lange nicht dran war', () => {
    const z = wartezeiten(g(weeks, [a, b, c]), weeks, [a, b, c], 'gebet')
    expect(z.ueblich).toBe(2)
    expect(z.warten.map((w) => [w.pid, w.wochen, w.lange])).toEqual([
      ['c', null, true], // nie — und auf ihn wären vier Gebete gekommen
      ['b', 10, true],
      ['a', 2, false],
    ])
  })

  it('schnell wieder: höchstens halb so lange wie üblich, mit den Wochen als Streifen', () => {
    // Drei beten alle vier Wochen, d jede Woche: Üblich bleiben vier Wochen —
    // einer, der ständig dran ist, verschiebt das Übliche nicht.
    const vier = ['v1', 'v2', 'v3'].map((id) => person(id, ['gebet']))
    const d = person('d', ['gebet'])
    const mehr = Array.from({ length: 12 }, (_, i) => {
      const w = woche(12 - i)
      setze(w.we, 'gebet', d, 0) // das Anfangsgebet am Sonntag, ohne Vorsitz eingetragen
      const wer = vier[i % 4]
      if (wer) setze(w.mid, 'gebet', wer, 1)
      return w
    })
    const alle = [...vier, d]
    const z = wartezeiten(g(mehr, alle), mehr, alle, 'gebet')
    expect(z.ueblich).toBe(4)
    expect(z.schnell.map((s) => [s.pid, s.abstand, s.mal])).toEqual([['d', 1, 12]])
    expect(z.schnell[0]?.wochen).toEqual(Array.from({ length: 12 }, () => true))
  })
})

describe('Treffpunkte', () => {
  const gruppe: Group = { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }
  const leiter = person('leiter', ['treffpunkt'], { grp: 'g1' })
  const nie = person('nie', ['treffpunkt'], { grp: 'g1' })
  const inst = (grp: string | null, lpid?: string, lext = false): FsInstance => ({
    id: 'r', ruleId: 'r', grp, wd: 6, time: '09:30', place: 'Saal', leader: lpid ?? 'Kreisaufseher', ...(lpid ? { lpid } : {}), ...(lext ? { lext } : {}),
  })

  it('je Gruppe, wer wie oft leitete — wer leiten kann und nie leitete, mit 0', () => {
    const weeks = [woche(2), woche(1)]
    const fs = [[inst('g1', 'leiter'), inst(null, 'leiter')], [inst('g1', 'leiter'), inst('g1', undefined, true)]]
    const t = treffpunkte(fs, zeitfenster(weeks, 13, HEUTE), [leiter, nie], [gruppe])
    expect(t).toEqual([
      { gruppe: 'g1', zeilen: [{ pid: 'leiter', n: 2 }, { pid: 'nie', n: 0 }] },
      { gruppe: null, zeilen: [{ pid: 'leiter', n: 1 }] },
    ])
  })
})

describe('Ballungen', () => {
  it('zweimal in einer Zusammenkunft und drei Wochen hintereinander im selben Bereich', () => {
    const p = person('p', ['bibellesung', 'leser', serviceQualKey('mik')])
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const w = woche(4 - i)
      if (i < 3) hilfsdienst(w.mid, 'mik', p)
      return w
    })
    setze(weeks[3]!.mid, 'bibellesung', p)
    setze(weeks[3]!.mid, 'leser', p)
    const b = ballungen(g(weeks, [p]))
    expect(b.zweimal).toEqual([{ pid: 'p', start: start(1), tab: 'mid', bereiche: ['bibellesung', 'leser'] }])
    expect(b.folge).toEqual([{ pid: 'p', bereich: 'svc:mik', ab: start(4), wochen: 3 }])
  })
})

describe('Was auffällt', () => {
  it('zu selten vor zu oft vor einseitig vor wartet — je Person der deutlichste Fall', () => {
    const a = person('a', ['gebet', serviceQualKey('mik')])
    const b = person('b', ['gebet', serviceQualKey('mik')])
    const c = person('c', ['gebet', serviceQualKey('mik')])
    const weeks = Array.from({ length: 9 }, (_, i) => {
      const w = woche(9 - i)
      setze(w.mid, 'gebet', a, 1)
      hilfsdienst(w.mid, 'mik', i < 8 ? a : b)
      return w
    })
    const grund = g(weeks, [a, b, c])
    const persons = [a, b, c]
    const v = (['aufgaben', 'hilfsdienste'] as const).map((x) => verteilung(grund, persons, x))
    const h = hinweise(v, einseitig(grund, persons), [wartezeiten(grund, weeks, persons, 'gebet')])
    const arten = h.map((x) => `${x.art}:${x.pid}`)
    // c ist zu selten (in beiden Vergleichen, steht aber einmal da), a zu oft.
    expect(arten.filter((x) => x === 'selten:c')).toHaveLength(1)
    expect(arten.indexOf('selten:c')).toBeLessThan(arten.indexOf('oft:a'))
  })
})

describe('Eine Person', () => {
  it('je Woche Aufgabe vor Hilfsdienst vor abwesend — und je Bereich wie oft, erwartet, zuletzt', () => {
    const p = person('p', ['gebet', serviceQualKey('mik')])
    const q = person('q', ['gebet'])
    const weeks = [woche(4), woche(3), woche(2), woche(1)]
    setze(weeks[0]!.mid, 'gebet', p, 1)
    hilfsdienst(weeks[0]!.mid, 'mik', p)
    hilfsdienst(weeks[1]!.we, 'mik', p)
    setze(weeks[3]!.mid, 'gebet', q, 1)
    const abwesend = new Set(['p|2|mid', 'p|2|we'])
    const bild = personBild(g(weeks, [p, q], 13, abwesend), weeks, [p, q], abwesend, 'p')!
    expect(bild.wochen).toEqual(['aufgabe', 'hilfsdienst', 'abwesend', null])
    expect(bild).toMatchObject({ aufgaben: 1, hilfsdienste: 2, abwesend: 2 })
    expect(bild.bereiche.find((b) => b.bereich === 'gebet')).toMatchObject({ n: 1, zuletzt: start(4), vorWochen: 4 })
    // Zwei Gebete im Zeitraum; p war in sechs von acht Zusammenkünften da, q in allen.
    expect(bild.erwartetAufgaben).toBeCloseTo((2 * 6) / 14)
  })

  it('eine unbekannte Person hat kein Bild', () => {
    expect(personBild(g([], []), [], [], KEINE_ABWESENHEIT, 'x')).toBeNull()
  })
})

describe('Kennzahlen', () => {
  it('Zuteilungen, wer eingeteilt war, wer nie — und der Anteil der zehn oberen', () => {
    const a = person('a', ['gebet'])
    const nie = person('nie', ['gebet'])
    const ohne = person('ohne', [])
    const w = woche(1)
    setze(w.mid, 'gebet', a, 1)
    setze(w.we, 'gebet', a, 1)
    const k = kennzahlen(g([w], [a, nie, ohne]), [a, nie, ohne])
    expect(k).toMatchObject({ zuteilungen: 2, mitBereichen: 2, eingeteilt: 1, nie: 1, anteilOben: 1 })
    expect(k.last).toEqual([{ pid: 'a', n: 2 }, { pid: 'nie', n: 0 }])
  })

  it('auswerten fügt alles zusammen — ohne Wochen ist alles leer, nicht kaputt', () => {
    const a = auswerten({ weeks: [], fsWeeks: [], persons: [], services: DEMO_SERVICES, groups: [], abwesend: KEINE_ABWESENHEIT, heute: HEUTE, zeitraum: 12 })
    expect(a.kennzahlen.zuteilungen).toBe(0)
    expect(a.hinweise).toEqual([])
    expect(a.wartezeiten).toEqual([])
  })
})
