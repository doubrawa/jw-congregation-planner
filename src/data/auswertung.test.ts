import { describe, expect, it } from 'vitest'
import { buildImportWeek, DEMO_SERVICES } from '../../tests/testdaten/testdaten'
import { KEINE_ABWESENHEIT } from './absence'
import {
  absagenJeBereich,
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
  TREFFPUNKT_BEREICH,
  verteilung,
  vieleAbsagen,
  wartezeiten,
  zeitfenster,
  type Grundlage,
} from './auswertung'
import { emptyQualifications, isSong, privSetzen, ROLE_OWN_SPEAKER, serviceQualKey } from './helpers'
import { tagNach } from './meeting-dates'
import { allePlaetze, platzKey } from './plaetze'
import { bereichVon } from './planning'
import type { Absage, FsInstance, Group, Meeting, Person, Week } from './types'

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

  it('der öffentliche Vortrag zählt nicht — auch nicht beim eigenen Redner; der Vortrag unter „Schätze" schon', () => {
    // Beide tragen `vortrag`. Zählte der Sonntag mit, verdoppelte sich die
    // Erwartung für jeden, der den Vortrag unter „Schätze" hält (Review
    // 17.10.2026; Betreiber: „man hat so selten einen Vortrag in der eigenen
    // Versammlung").
    const redner = person('redner', ['gebet'], { role: 'aeltester' })
    const schaetze = person('schaetze', ['vortrag'])
    const w = woche(1)
    setze(w.mid, 'vortrag', schaetze)
    const sonntag = w.we.sections.flatMap((s) => s.items).flatMap((i) => (isSong(i) ? [] : i.names)).find((n) => n.bereichsKey === 'vortrag')!
    Object.assign(sonntag, { name: 'redner Test', pid: 'redner', rolle: ROLE_OWN_SPEAKER })
    const grund = g([w], [redner, schaetze])
    expect(grund.einteilungen.map((e) => [e.pid, e.bereich])).toEqual([['schaetze', 'vortrag']])
    expect(grund.plaetze.get('vortrag')).toBe(1)
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

  it('wer den ganzen Zeitraum fehlte, war in keinem Bereich „nie dran" — ist er einmal da, schon', () => {
    const a = person('a', ['gebet', 'bibellesung'])
    const weg = person('weg', ['gebet', 'bibellesung'])
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const w = woche(6 - i)
      setze(w.mid, 'gebet', a, 1)
      setze(w.mid, 'bibellesung', a)
      return w
    })
    const ganz = new Set(weeks.flatMap((_, wi) => [`weg|${wi}|mid`, `weg|${wi}|we`]))
    expect(einseitig(g(weeks, [a, weg], 13, ganz), [a, weg]).map((z) => z.pid)).toEqual(['a'])
    // Gegenprobe: Am Sonntag der ersten Woche war er da — jetzt fällt er auf.
    const fastGanz = new Set([...ganz].filter((k) => k !== 'weg|0|we'))
    const zeile = einseitig(g(weeks, [a, weg], 13, fastGanz), [a, weg]).find((z) => z.pid === 'weg')
    expect([...(zeile?.nie ?? [])].sort()).toEqual(['bibellesung', 'gebet'])
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
    const z = wartezeiten(g(weeks, [a, b, c]), [a, b, c], 'gebet')
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
    const z = wartezeiten(g(mehr, alle), alle, 'gebet')
    expect(z.ueblich).toBe(4)
    expect(z.schnell.map((s) => [s.pid, s.abstand, s.mal])).toEqual([['d', 1, 12]])
    expect(z.schnell[0]?.wochen).toEqual(Array.from({ length: 12 }, () => true))
  })

  /*
   * Betreiber 17.10.2026 (Review T126): „Wartet lange" zählt nur Wochen, in
   * denen jemand da war — und wer im Bereich schon eingeteilt ist, wartet nicht.
   */
  it('Wochen, in denen jemand ganz fehlte, zählen nicht zur Wartezeit — fehlte er nur an einem Tag, schon', () => {
    // b war vor zehn Wochen dran und danach sechs Wochen ganz weg (vor 9 bis 4):
    // gewartet hat er vier — nicht mehr als doppelt so lange wie üblich.
    const ganz = [9, 8, 7, 6, 5, 4].flatMap((vor) => [`b|${12 - vor}|mid`, `b|${12 - vor}|we`])
    const abwesend = new Set([...ganz, `b|${12 - 3}|mid`])
    const z = wartezeiten(g(weeks, [a, b, c], 13, abwesend), [a, b, c], 'gebet')
    expect(z.warten.find((w) => w.pid === 'b')).toMatchObject({ wochen: 10, abwesend: 6, wartend: 4, lange: false })
  })

  it('wer im Bereich schon eingeteilt ist, wartet nicht — nur im selben Bereich und wo die Zusammenkunft stattfindet', () => {
    const d = person('d', ['gebet'])
    const naechste = woche(-1)
    setze(naechste.mid, 'gebet', b, 1)
    setze(naechste.mid, 'bibellesung', c) // ein anderer Bereich: c wartet weiter aufs Gebet
    setze(naechste.we, 'gebet', d, 1)
    naechste.dev = { we: { cancelled: true } } // d steht in einer Zusammenkunft, die ausfällt
    const alle = [...weeks, woche(0), naechste]
    const z = wartezeiten(g(alle, [a, b, c, d]), [a, b, c, d], 'gebet')
    const zeile = (pid: string) => z.warten.find((w) => w.pid === pid)
    expect(zeile('b')).toMatchObject({ wochen: 10, geplant: start(-1), lange: false })
    expect(zeile('c')).toMatchObject({ geplant: null, lange: true })
    expect(zeile('d')).toMatchObject({ geplant: null, lange: true })
    // Wer geplant ist, steht hinten.
    expect(z.warten.map((w) => w.pid)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('„Wartet lange" ordnet nach der Wartezeit ohne die Abwesenheit', () => {
    // b vor zehn Wochen, danach vier Wochen ganz weg: gewartet sechs. e vor acht Wochen: acht.
    const e = person('e', ['gebet'])
    const mitE = weeks.map((w, i) => {
      const kopie = structuredClone(w)
      if (12 - i === 8) setze(kopie.we, 'gebet', e, 1)
      return kopie
    })
    const ganz = new Set([9, 7, 6, 5].flatMap((vor) => [`b|${12 - vor}|mid`, `b|${12 - vor}|we`]))
    const w = wartezeiten(g(mitE, [a, b, e], 13, ganz), [a, b, e], 'gebet')
    expect(w.warten.filter((z) => z.lange).map((z) => [z.pid, z.wochen, z.wartend])).toEqual([['e', 8, 8], ['b', 10, 6]])
    expect(hinweise([], [], [w]).map((h) => (h.art === 'wartet' ? h.pid : h.art))).toEqual(['e', 'b'])
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
    const h = hinweise(v, einseitig(grund, persons), [wartezeiten(grund, persons, 'gebet')])
    const arten = h.map((x) => `${x.art}:${x.art === 'absagen' ? x.bereich : x.pid}`)
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

/**
 * **Absagen** (T126, 17.10.2026): Seit sie in `absagen` stehen, bleibt eine
 * Absage auch dann gezählt, wenn der Platz längst neu besetzt ist. Zugeordnet
 * wird über den Schlüssel des Platzes — so, wie die Automatik ihn baut.
 */
describe('Absagen', () => {
  const mik = person('mik', [serviceQualKey('mik')])
  const beter = person('beter', ['gebet'])
  const andere = person('andere', ['gebet', serviceQualKey('mik')])
  /** Der Schlüssel des `nth` Platzes dieses Bereichs in dieser Zusammenkunft — besetzt oder nicht. */
  const schluessel = (w: Week, tab: 'mid' | 'we', bereich: string, nth = 0): string => {
    const treffer = [...allePlaetze(w[tab], DEMO_SERVICES)].filter((p) => bereichVon(p) === bereich)
    const platz = treffer[nth]
    if (!platz) throw new Error(`kein Platz ${bereich} #${nth}`)
    return platzKey(platz, w.start, tab)
  }
  // Die Woche steckt im Schlüssel; `w` bleibt, damit jeder Fall sagt, welche gemeint ist.
  const absage = (personId: string, _w: Week, taskKey: string): Absage => ({ personId, taskKey })
  const grund = (weeks: Week[], absagen: Absage[], persons: Person[] = [mik, beter, andere]) =>
    grundlage({ weeks, persons, services: DEMO_SERVICES, abwesend: KEINE_ABWESENHEIT, fenster: zeitfenster(weeks, 13, HEUTE), absagen })

  it('jede Absage zählt in ihrem Bereich — auch wenn der Platz inzwischen ein anderer hat', () => {
    const w = woche(1)
    hilfsdienst(w.mid, 'mik', andere) // der Ersatz steht jetzt dort
    setze(w.mid, 'gebet', andere, 1)
    const g0 = grund([w], [absage('mik', w, schluessel(w, 'mid', serviceQualKey('mik'))), absage('beter', w, schluessel(w, 'mid', 'gebet', 1))])
    expect(g0.absagen).toEqual([
      { pid: 'mik', bereich: serviceQualKey('mik') },
      { pid: 'beter', bereich: 'gebet' },
    ])
  })

  it('auch auf einem Platz, der seitdem leer steht — der Planer hat den Absagenden nur ausgetragen', () => {
    const w = woche(1)
    const g0 = grund([w], [absage('mik', w, schluessel(w, 'mid', serviceQualKey('mik')))])
    expect(g0.absagen).toEqual([{ pid: 'mik', bereich: serviceQualKey('mik') }])
    // Ein leerer Platz ist trotzdem keine Zuteilung.
    expect(g0.plaetze.get(serviceQualKey('mik'))).toBeUndefined()
  })

  it('nicht gezählt: außerhalb des Zeitraums, in einer ausgefallenen Zusammenkunft, von jemandem, der nicht mehr da ist', () => {
    const alt = woche(20)
    const aus = woche(2)
    aus.dev = { mid: { cancelled: true } }
    const w = woche(1)
    const g0 = grund([alt, aus, w], [
      absage('beter', alt, schluessel(alt, 'mid', 'gebet')),
      absage('beter', aus, schluessel(aus, 'mid', 'gebet')),
      absage('weg', w, schluessel(w, 'mid', 'gebet')),
    ])
    expect(g0.absagen).toEqual([])
  })

  it('einen Platz, den es nicht mehr gibt, zählt die Person — ein Bereich ist nicht zu sagen', () => {
    const w = woche(1)
    const g0 = grund([w], [absage('beter', w, `${w.start}|mid|part|weg|0`)])
    expect(g0.absagen).toEqual([{ pid: 'beter', bereich: null }])
  })

  /*
   * Zähler und Nenner nach derselben Regel (Review 17.10.2026): Ein Platz, der
   * als Zuteilung nicht zählt, zählt auch abgesagt nicht — sonst stand nach
   * drei Absagen des festen Leiters „Viele Absagen: Studium" mit 50 % da.
   */
  it('der öffentliche Vortrag und der Platz des festen Leiters zählen auch abgesagt nicht — ohne festen Leiter zählt das Studium', () => {
    const redner = person('redner', ['gebet'], { role: 'aeltester' })
    const fest = person('fest', ['studium', 'wtLeiter'])
    const w = woche(1)
    const sonntag = schluessel(w, 'we', 'vortrag')
    const leiter = schluessel(w, 'we', 'studium')
    const absagen = [absage('redner', w, sonntag), absage('fest', w, leiter)]
    expect(grund([w], absagen, [redner, fest]).absagen).toEqual([])
    // Gegenprobe: Ohne festen Leiter rotiert der Platz — dann zählt seine Absage.
    const rotiert = person('fest', ['studium'])
    expect(grund([w], absagen, [redner, rotiert]).absagen).toEqual([{ pid: 'fest', bereich: 'studium' }])
  })

  it('was dem Vorsitz folgt, sagt der Vorsitzende mit dem Vorsitz ab — einmal gezählt; sagt ein anderer das Anfangsgebet ab, zählt es', () => {
    const vorsitz = person('vorsitz', ['vorsitzMid', 'gebet'])
    const ersatz = person('ersatz', ['vorsitzMid', 'gebet'])
    const beter2 = person('beter2', ['gebet'])
    const [w1, w2, w3] = [woche(3), woche(2), woche(1)]
    // w1: Er hat Vorsitz und Anfangsgebet noch und sagt nur das Gebet ab.
    setze(w1.mid, 'vorsitzMid', vorsitz)
    setze(w1.mid, 'gebet', vorsitz, 0)
    // w2: Er hat beides abgesagt, der Ersatz hat beides übernommen.
    setze(w2.mid, 'vorsitzMid', ersatz)
    setze(w2.mid, 'gebet', ersatz, 0)
    // w3: Ein anderer sollte das Anfangsgebet sprechen und sagt ab.
    setze(w3.mid, 'vorsitzMid', vorsitz)
    setze(w3.mid, 'gebet', beter2, 0)
    const absagen = [
      absage('vorsitz', w1, schluessel(w1, 'mid', 'gebet', 0)),
      absage('vorsitz', w2, schluessel(w2, 'mid', 'vorsitzMid')),
      absage('vorsitz', w2, schluessel(w2, 'mid', 'gebet', 0)),
      absage('beter2', w3, schluessel(w3, 'mid', 'gebet', 0)),
    ]
    expect(grund([w1, w2, w3], absagen, [vorsitz, ersatz, beter2]).absagen).toEqual([
      { pid: 'vorsitz', bereich: 'vorsitzMid' },
      { pid: 'beter2', bereich: 'gebet' },
    ])
  })

  it('ein abgesagter Treffpunkt zählt unter „Treffpunkte leiten" — gegen die geleiteten', () => {
    const w = woche(1)
    const g0 = grund([w], [absage('beter', w, `fs|${w.start}|inst-1`)])
    expect(g0.absagen).toEqual([{ pid: 'beter', bereich: TREFFPUNKT_BEREICH }])
    expect(absagenJeBereich(g0, 4)).toEqual([{ bereich: TREFFPUNKT_BEREICH, n: 1, von: 4, anteil: 0.25 }])
  })

  it('je Bereich: wie viele, gegen alle Zuteilungen des Bereichs — die meisten zuerst', () => {
    const weeks = [woche(3), woche(2), woche(1)]
    for (const w of weeks) {
      hilfsdienst(w.mid, 'mik', andere)
      hilfsdienst(w.mid, 'mik', mik)
      setze(w.mid, 'gebet', andere, 1)
    }
    const absagen = weeks.flatMap((w) => [absage('mik', w, schluessel(w, 'mid', serviceQualKey('mik'), 1))])
    absagen.push(absage('beter', weeks[0]!, schluessel(weeks[0]!, 'mid', 'gebet', 1)))
    const zeilen = absagenJeBereich(grund(weeks, absagen), 0)
    // Sechs Mikrofon-Plätze, drei Gebete.
    expect(zeilen).toEqual([
      { bereich: serviceQualKey('mik'), n: 3, von: 6, anteil: 0.5 },
      { bereich: 'gebet', n: 1, von: 3, anteil: 1 / 3 },
    ])
  })

  it('viele Absagen: mindestens drei, und doppelt so viel Anteil wie jeder andere Bereich', () => {
    const z = (bereich: string, n: number, von: number) => ({ bereich, n, von, anteil: n / von })
    expect(vieleAbsagen([z('a', 9, 212), z('b', 4, 598), z('c', 1, 50)]).map((x) => x.zeile.bereich)).toEqual(['a'])
    // Doppelt so viel Anteil fehlt: 4 % gegen 3 %.
    expect(vieleAbsagen([z('a', 8, 200), z('b', 3, 100)])).toEqual([])
    // Nur zwei — zu wenig, um aufzufallen.
    expect(vieleAbsagen([z('a', 2, 10)])).toEqual([])
    expect(vieleAbsagen([z('a', 3, 10)])).toEqual([{ zeile: z('a', 3, 10), sonst: 0 }])
  })

  it('der Hinweis steht nach den Personen, mit Anteil und dem höchsten der anderen', () => {
    const zeilen = [
      { bereich: 'schulung', n: 9, von: 212, anteil: 9 / 212 },
      { bereich: 'gebet', n: 1, von: 96, anteil: 1 / 96 },
    ]
    expect(hinweise([], [], [], zeilen)).toEqual([{ art: 'absagen', bereich: 'schulung', anteil: 9 / 212, sonst: 1 / 96 }])
  })

  it('die Person: ihre Absagen im Zeitraum — nicht die der anderen', () => {
    const weeks = [woche(2), woche(1)]
    const absagen = weeks.map((w) => absage('beter', w, schluessel(w, 'mid', 'gebet')))
    absagen.push(absage('mik', weeks[0]!, schluessel(weeks[0]!, 'mid', serviceQualKey('mik'))))
    const bild = personBild(grund(weeks, absagen), weeks, [mik, beter, andere], KEINE_ABWESENHEIT, 'beter')
    expect(bild?.absagen).toBe(2)
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

  it('wer den ganzen Zeitraum fehlte, ist weder „nie dran" noch in der Last — von ihm wird nichts erwartet', () => {
    const a = person('a', ['gebet'])
    const weg = person('weg', ['gebet'])
    const weeks = [woche(2), woche(1)]
    setze(weeks[0]!.mid, 'gebet', a, 1)
    const ganz = new Set(weeks.flatMap((_, wi) => [`weg|${wi}|mid`, `weg|${wi}|we`]))
    const k = kennzahlen(g(weeks, [a, weg], 13, ganz), [a, weg])
    expect(k).toMatchObject({ mitBereichen: 1, eingeteilt: 1, nie: 0 })
    expect(k.last.map((z) => z.pid)).toEqual(['a'])
    // Gegenprobe: eine Zusammenkunft da — dann war er nie dran.
    const einmalDa = new Set([...ganz].filter((x) => x !== 'weg|1|we'))
    expect(kennzahlen(g(weeks, [a, weg], 13, einmalDa), [a, weg])).toMatchObject({ mitBereichen: 2, nie: 1 })
  })

  it('auswerten fügt alles zusammen — ohne Wochen ist alles leer, nicht kaputt', () => {
    const a = auswerten({ weeks: [], fsWeeks: [], persons: [], services: DEMO_SERVICES, groups: [], abwesend: KEINE_ABWESENHEIT, heute: HEUTE, zeitraum: 12 })
    expect(a.kennzahlen.zuteilungen).toBe(0)
    expect(a.hinweise).toEqual([])
    expect(a.wartezeiten).toEqual([])
  })
})
