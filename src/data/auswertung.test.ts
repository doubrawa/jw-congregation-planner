import { describe, expect, it } from 'vitest'
import { buildImportWeek, DEMO_SERVICES } from '../../tests/testdaten/testdaten'
import { KEINE_ABWESENHEIT } from './absence'
import {
  absagenJeBereich,
  auswerten,
  ballungen,
  einseitig,
  engpaesse,
  grundlage,
  hinweise,
  istEinseitig,
  istKnapp,
  kennzahlen,
  KNAPP_UNTER,
  lageVon,
  matrix,
  nieGenutzt,
  ohneBereich,
  personBild,
  treffpunkte,
  TREFFPUNKT_BEREICH,
  VERGLEICHE,
  verteilung,
  vieleAbsagen,
  wartezeiten,
  zeitfenster,
  type Grundlage,
  type Hinweis,
  type Wartezeiten,
} from './auswertung'
import { emptyQualifications, isSong, privSetzen, ROLE_OWN_SPEAKER, serviceQualKey } from './helpers'
import { tagNach } from './meeting-dates'
import { allePlaetze, platzKey } from './plaetze'
import { bereichVon } from './planning'
import type { Absage, FsInstance, Group, Meeting, MeetingTimes, Person, Week } from './types'

/**
 * **Die Auswertung rechnet so, wie die Automatik verteilt** (T126). Jeder Fall
 * unten baut sich seine Wochen selbst: aus der Testwoche des Arbeitshefts, mit
 * genau den Namen, um die es geht.
 *
 * Die Jahresprobe vom 18.10.2026 (ein Jahr echter Daten) fand rund ein Drittel
 * Fehlalarme. Die Fälle dazu stehen hier mit dem, was vorher schieflief: der
 * feste Studienleiter „wartete" auf den Vorsitz am Wochenende, ein Zugezogener
 * stand unter „zu selten", Einteilungen ohne Bereich unter „zu oft", die
 * Mikrofon-Jugend unter „einseitig", der übliche Abstand war zu kurz und hing
 * vom Zeitraum ab.
 */

const HEUTE = '2026-09-09' // ein Mittwoch; die laufende Woche beginnt am 7.9.
const MONTAG = '2026-09-07'

function person(id: string, bereiche: string[], extra: Partial<Person> = {}): Person {
  const priv = emptyQualifications()
  for (const b of bereiche) privSetzen(priv, b, true)
  return { id, fn: id, ln: 'Test', role: 'verkuendiger', mail: '', priv, ...extra }
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

/** Die Wochen vor `n` bis vor 1, die älteste zuerst — Index `i` ist die Woche vor `n - i`. */
function wochen(n: number): Week[] {
  return Array.from({ length: n }, (_, i) => woche(n - i))
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

/** Der Leiter des Wachtturm-Studiums am Wochenende. */
function wtLeiter(w: Week, p: Person): void {
  const studium = w.we.sections.find((s) => s.label === 'WACHTTURM-STUDIUM')!
  const item = studium.items.find((i) => !isSong(i))!
  if (isSong(item)) throw new Error('kein Punkt')
  Object.assign(item.names[0]!, { name: `${p.fn} ${p.ln}`, pid: p.id })
}

function hilfsdienst(meeting: Meeting, svc: string, p: Person): void {
  meeting.helpers[svc] = [...(meeting.helpers[svc] ?? []), { name: `${p.fn} ${p.ln}`, pid: p.id }]
}

function g(weeks: Week[], persons: Person[], anzahlWochen = 13, abwesend = KEINE_ABWESENHEIT): Grundlage {
  return grundlage({ weeks, persons, services: DEMO_SERVICES, abwesend, fenster: zeitfenster(weeks, anzahlWochen, HEUTE) })
}

/** Alle Zeilen eines Vergleichs, gleich in welcher Lage. */
function zeilenVon(v: ReturnType<typeof verteilung>) {
  return [...v.oft, ...v.rahmen, ...v.selten]
}

/** Was auf die Person in diesem Bereich erwartet wurde. */
function erwartet(grund: Grundlage, bereich: string, pid: string): number {
  return grund.erwartet.get(bereich)?.get(pid) ?? 0
}

describe('Zeitraum', () => {
  it('die abgeschlossenen Wochen bis vor die laufende — die laufende zählt nicht', () => {
    const weeks = [woche(14), woche(13), woche(1), woche(0)]
    const f = zeitfenster(weeks, 13, HEUTE)
    expect(f.bis).toBe(MONTAG)
    expect(f.von).toBe(start(13))
    expect(f.wochen).toEqual([1, 2])
    // Die Montage stehen in derselben Reihenfolge wie die Indizes, die älteste
    // zuerst — nach ihnen werden die Wochenfelder beschriftet und die Streifen
    // „Schnell wieder" gefüllt.
    expect(f.montage).toEqual([start(13), start(1)])
  })

  it('der Streifen „Schnell wieder" folgt den Montagen: jede Woche ihr Feld, die älteste zuerst', () => {
    // a betet in den Wochen vor 6, 5 und 4, b vor 6 und 3: fünf Gebete in sechs
    // Wochen, zwei Personen — üblich sind 2,4 Wochen. a ist mit einer Woche
    // Abstand „schnell wieder", sein Streifen zeigt die ersten drei Felder.
    const a = person('a', ['gebet'])
    const b = person('b', ['gebet'])
    const weeks = wochen(6)
    weeks.forEach((w, i) => {
      const vor = 6 - i
      if (vor >= 4) setze(w.mid, 'gebet', a, 1)
      if (vor === 6 || vor === 3) setze(w.we, 'gebet', b, 1)
    })
    const z = wartezeiten(g(weeks, [a, b]), [a, b], 'gebet')
    expect(z.ueblich).toBeCloseTo(2.4)
    expect(z.schnell.map((s) => s.pid)).toEqual(['a'])
    expect(z.schnell[0]?.wochen).toEqual([true, true, true, false, false, false])
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

  it('am Wochenende kam das Lesen des Vorsitzenden mit dem Vorsitz — leitet er das Studium selbst, zählt es (T131)', () => {
    const vorsitzWe = person('vorsitzwe', ['vorsitzWe', 'leser', 'studium'])
    const leser = person('leser', ['leser'])
    const a = woche(1)
    setze(a.we, 'vorsitzWe', vorsitzWe)
    setze(a.we, 'leser', vorsitzWe) // liest, folgt dem Vorsitz
    const b = woche(2)
    setze(b.we, 'vorsitzWe', vorsitzWe)
    setze(b.we, 'leser', leser) // ein anderer liest
    const c = woche(3)
    setze(c.we, 'vorsitzWe', vorsitzWe)
    wtLeiter(c, vorsitzWe) // leitet selbst …
    setze(c.we, 'leser', vorsitzWe) // … und liest von Hand auch: eine eigene Aufgabe
    const e = g([c, b, a], [vorsitzWe, leser]).einteilungen
    expect(e.filter((x) => x.pid === 'vorsitzwe').map((x) => x.bereich).sort()).toEqual(['leser', 'studium', 'vorsitzWe', 'vorsitzWe', 'vorsitzWe'])
    expect(e.filter((x) => x.pid === 'leser').map((x) => x.bereich)).toEqual(['leser'])
  })

  it('der feste Wachtturm-Studium-Leiter zählt nicht — ohne festen Leiter rotiert der Platz und zählt', () => {
    const leiter = person('leiter', ['studium'])
    const w = woche(1)
    wtLeiter(w, leiter)
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

/*
 * Erwartet wird Platz für Platz: Jeder Platz verteilt sich gleich auf alle, die
 * ihn in seiner Zusammenkunft hätten haben können (Jahresprobe 18.10.2026).
 */
describe('Erwartet wird Platz für Platz', () => {
  it('der gleiche Anteil an den Plätzen des Bereichs', () => {
    const a = person('a', ['gebet'])
    const b = person('b', ['gebet'])
    const c = person('c', ['gebet'])
    // Neun Wochen mit je einem Schlussgebet unter der Woche: a 7, b 2, c 0. In
    // der ersten hilft a am Mikrofon aus — so sind alle drei von Anfang an dabei.
    const weeks = wochen(9)
    weeks.forEach((w, i) => setze(w.mid, 'gebet', i === 0 || i === 8 ? b : a, 1))
    hilfsdienst(weeks[0]!.mid, 'mik', a)
    const v = verteilung(g(weeks, [a, b, c]), [a, b, c], 'aufgaben')
    expect(v.oft.map((z) => [z.pid, z.n, z.erwartet])).toEqual([['a', 7, 3]])
    expect(v.rahmen.map((z) => z.pid)).toEqual(['b'])
    expect(v.selten.map((z) => [z.pid, z.n, z.erwartet])).toEqual([['c', 0, 3]])
  })

  it('wer in einer Zusammenkunft fehlte, von dem wird für ihre Plätze nichts erwartet — fehlte er in der anderen, zählt das nicht', () => {
    const a = person('a', ['gebet'])
    const b = person('b', ['gebet'])
    // Vier Schlussgebete unter der Woche, alle von a.
    const weeks = wochen(4)
    for (const w of weeks) setze(w.mid, 'gebet', a, 1)
    // b fehlt unter der Woche in den ersten zwei: Diese Gebete kommen allein auf a.
    const mitte = new Set(['b|0|mid', 'b|1|mid'])
    const v = verteilung(g(weeks, [a, b], 13, mitte), [a, b], 'aufgaben')
    expect(zeilenVon(v).find((z) => z.pid === 'a')?.erwartet).toBeCloseTo(3)
    expect(zeilenVon(v).find((z) => z.pid === 'b')?.erwartet).toBeCloseTo(1)
    // Gegenprobe: Fehlt b nur an den Wochenenden, wo kein Gebet zu vergeben war,
    // wird von ihm genauso viel erwartet wie von a.
    const wochenende = new Set(weeks.map((_, wi) => `b|${wi}|we`))
    const w2 = verteilung(g(weeks, [a, b], 13, wochenende), [a, b], 'aufgaben')
    expect(zeilenVon(w2).map((z) => z.erwartet)).toEqual([2, 2])
  })

  /*
   * Jahresprobe: Der feste Studienleiter „wartete lange" auf den Vorsitz am
   * Wochenende (nie in 27 Wochen) — er leitet ja jedes Wochenende das Studium.
   */
  it('wer das Wachtturm-Studium fest leitet, von dem werden am Wochenende kein Vorsitz und kein Lesen erwartet — unter der Woche schon', () => {
    const leiter = person('leiter', ['vorsitzWe', 'vorsitzMid', 'leser', 'studium', 'wtLeiter'])
    const v1 = person('v1', ['vorsitzWe', 'vorsitzMid', 'leser'])
    const v2 = person('v2', ['vorsitzWe', 'vorsitzMid', 'leser', 'studium', 'wtVertreter'])
    const persons = [leiter, v1, v2]
    const weeks = wochen(4)
    weeks.forEach((w, i) => {
      wtLeiter(w, leiter)
      setze(w.we, 'vorsitzWe', i % 2 ? v1 : v2)
      setze(w.we, 'leser', i % 2 ? v2 : v1)
      setze(w.mid, 'vorsitzMid', [leiter, v1, v2, leiter][i]!)
    })
    const grund = g(weeks, persons)
    expect(erwartet(grund, 'vorsitzWe', 'leiter')).toBe(0)
    expect(erwartet(grund, 'leser', 'leiter')).toBe(0)
    expect(erwartet(grund, 'vorsitzWe', 'v1')).toBe(2)
    expect(erwartet(grund, 'vorsitzMid', 'leiter')).toBeCloseTo(4 / 3)
    // Er wartet deshalb auch nicht auf den Vorsitz am Wochenende.
    expect(wartezeiten(grund, persons, 'vorsitzWe').warten.map((z) => z.pid)).not.toContain('leiter')

    // Leitet in einer Woche der Vertreter, ist er es, von dem dort nichts erwartet wird.
    wtLeiter(weeks[3]!, v2)
    setze(weeks[3]!.we, 'vorsitzWe', v1)
    setze(weeks[3]!.we, 'leser', leiter)
    const vertreten = g(weeks, persons)
    expect(erwartet(vertreten, 'vorsitzWe', 'leiter')).toBeCloseTo(0.5)
    expect(erwartet(vertreten, 'vorsitzWe', 'v2')).toBeCloseTo(1.5)

    // Gegenprobe: Ohne festen Leiter rotiert das Studium und zählt — dann ist
    // der Leiter in der Woche eingeteilt wie jeder andere und nicht gesperrt.
    const ohne = persons.map((p) => ({ ...p, priv: { ...p.priv, wtLeiter: false, wtVertreter: false } }))
    const rotierend = wochen(4)
    for (const w of rotierend) {
      wtLeiter(w, leiter)
      setze(w.we, 'vorsitzWe', v1)
    }
    expect(erwartet(g(rotierend, ohne), 'vorsitzWe', 'leiter')).toBeCloseTo(4 / 3)
  })

  /*
   * Jahresprobe: Ein zugezogener Ältester — 47 leere Wochen, dann drei Aufgaben
   * — stand unter „zu selten 3 statt 20" und „einseitig".
   */
  it('dabei seit: von einem Zugezogenen wird erst ab seiner ersten Einteilung etwas erwartet — wer nie eingeteilt war, ist von Anfang an dabei', () => {
    const alt = ['alt1', 'alt2', 'alt3'].map((id) => person(id, ['gebet']))
    const neu = person('neu', ['gebet'])
    const nie = person('nie', ['gebet'])
    const persons = [...alt, neu, nie]
    // Zwanzig Wochen, je zwei Schlussgebete; neu betet erst in den letzten beiden.
    const weeks = wochen(20)
    weeks.forEach((w, i) => {
      setze(w.mid, 'gebet', i >= 18 ? neu : alt[i % 3]!, 1)
      setze(w.we, 'gebet', alt[(i + 1) % 3]!, 1)
    })
    const grund = g(weeks, persons, 26)
    const v = verteilung(grund, persons, 'aufgaben')
    // Für neu: die vier Gebete seiner zwei Wochen, auf fünf verteilt.
    expect(zeilenVon(v).find((z) => z.pid === 'neu')).toMatchObject({ n: 2, lage: 'rahmen' })
    expect(erwartet(grund, 'gebet', 'neu')).toBeCloseTo(4 / 5)
    // nie ist nirgends eingeteilt — von Anfang an dabei, und zu selten. (In der
    // ersten Woche betet alt3 noch nicht: Ihre zwei Gebete teilen sich drei.)
    expect(v.selten.map((z) => z.pid)).toEqual(['nie'])
    expect(erwartet(grund, 'gebet', 'nie')).toBeCloseTo(2 / 3 + 34 / 4 + 4 / 5)
  })

  it('wer erst kommende Woche zum ersten Mal eingeteilt ist, gilt schon vorher als dabei — er wartet als „geplant", statt aus der Rechnung zu fallen', () => {
    // Plant der Planer auf „Lange Wartezeit" hin jemanden ein, der nie dran war,
    // soll er dort als „geplant" stehen — nicht rückwirkend verschwinden.
    const a = person('a', ['gebet'])
    const kommt = person('kommt', ['gebet'])
    const weeks = wochen(4)
    for (const w of weeks) setze(w.mid, 'gebet', a, 1)
    const naechste = woche(-1)
    setze(naechste.mid, 'gebet', kommt, 1)
    const grund = g([...weeks, naechste], [a, kommt])
    expect(kennzahlen(grund, [a, kommt])).toMatchObject({ mitBereichen: 2, nie: 1 })
    expect(erwartet(grund, 'gebet', 'kommt')).toBe(2)
    expect(wartezeiten(grund, [a, kommt], 'gebet').warten.find((z) => z.pid === 'kommt')).toMatchObject({ wochen: null, geplant: start(-1), lange: false })
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

  it('Hilfsdienste: verglichen wird die Gesamtlast, wie die Automatik sie verteilt', () => {
    const viel = person('viel', ['gebet', serviceQualKey('mik')])
    const wenig = person('wenig', [serviceQualKey('mik')])
    const weeks = wochen(6)
    for (const w of weeks) {
      setze(w.mid, 'gebet', viel, 1)
      hilfsdienst(w.mid, 'mik', wenig)
    }
    const grund = g(weeks, [viel, wenig])
    const v = verteilung(grund, [viel, wenig], 'hilfsdienste')
    // viel: 6 Gebete, kein Mikrofon — mit der Gesamtlast im Rahmen, nicht „zu selten".
    expect(zeilenVon(v).find((z) => z.pid === 'viel')).toMatchObject({ n: 6, hilfsdienste: 0, lage: 'rahmen' })
    expect(zeilenVon(v).find((z) => z.pid === 'wenig')).toMatchObject({ n: 6, hilfsdienste: 6 })
  })

  /*
   * Jahresprobe: Ein Ältester mit drei Bereichen und zwölf Einteilungen in fünf
   * anderen stand als „zu oft 9 statt 4" da.
   */
  it('Einteilungen in einem Bereich, den die Person nicht hat, zählen nicht als „zu oft" — sie stehen unter „Ohne Bereich eingeteilt"', () => {
    const aelt = person('aelt', ['gebet'])
    const b = person('b', ['gebet'])
    const leser = person('leser', ['leser'])
    const weeks = wochen(8)
    weeks.forEach((w, i) => {
      setze(w.mid, 'gebet', i % 2 ? aelt : b, 1)
      setze(w.mid, 'leser', aelt) // ohne den Bereich „Leser"
      setze(w.we, 'leser', leser)
    })
    const grund = g(weeks, [aelt, b, leser])
    const v = verteilung(grund, [aelt, b, leser], 'aufgaben')
    expect(zeilenVon(v).find((z) => z.pid === 'aelt')).toMatchObject({ n: 4, lage: 'rahmen' })
    expect(ohneBereich(grund, [aelt, b, leser])).toEqual([{ pid: 'aelt', bereiche: [{ bereich: 'leser', n: 8 }] }])
  })

  it('zwei Vergleiche: die Aufgaben und alles mit den Hilfsdiensten — die Schulungsaufgaben zählen unter den Aufgaben', () => {
    // Bis zur Jahresprobe gab es „Schulungsaufgaben" eigens; bei ein bis vier im
    // Jahr meldete der Vergleich nie etwas.
    expect(VERGLEICHE).toEqual(['aufgaben', 'hilfsdienste'])
    const s = person('s', ['schulung'], { female: true })
    const w = woche(1)
    setze(w.mid, 'schulung', s)
    expect(zeilenVon(verteilung(g([w], [s]), [s], 'aufgaben')).map((z) => [z.pid, z.n])).toEqual([['s', 1]])
  })
})

describe('Einseitig', () => {
  it('zwei Drittel in einem Bereich, ab sechs Zuteilungen — und nie Gesprächsführerin', () => {
    const lena = person('lena', ['schulung'])
    const elke = person('elke', ['schulung'])
    const weeks = wochen(8)
    weeks.forEach((w, i) => {
      setze(w.mid, 'schulungPartner', lena, i % 3)
      setze(w.mid, 'schulung', elke, i % 3)
    })
    const zeile = einseitig(g(weeks, [lena, elke]), [lena, elke]).find((z) => z.pid === 'lena')!
    expect(zeile.ueberwiegt).toBe('schulungPartner')
    expect(zeile.nie).toEqual(['schulung'])
    expect(istEinseitig(zeile)).toBe(true)
  })

  it('unter sechs Zuteilungen überwiegt nichts — zu wenig, um es zu sagen', () => {
    const p = person('p', ['gebet', 'bibellesung'])
    const q = person('q', ['bibellesung'])
    const weeks = wochen(5)
    weeks.forEach((w, i) => {
      setze(w.mid, 'gebet', p, 1)
      if (i === 0) setze(w.mid, 'bibellesung', q)
    })
    const [zeile] = einseitig(g(weeks, [p, q]), [p, q])
    expect(zeile).toMatchObject({ pid: 'p', gesamt: 5, ueberwiegt: null, nie: [] })
  })

  /*
   * Jahresprobe: Mikrofone hat vier Plätze je Zusammenkunft — wer Mikrofone und
   * Bibellesung hat, hat zwangsläufig vor allem Mikrofone. Zwei junge Brüder
   * standen deshalb als „einseitig" da.
   */
  it('vor allem ein Bereich ist erst einseitig, wenn er deutlich über seinem erwarteten Anteil liegt', () => {
    const mik = serviceQualKey('mik')
    const jung = person('jung', [mik, 'bibellesung'])
    const mikro = ['m2', 'm3', 'm4', 'm5', 'm6'].map((id) => person(id, [mik]))
    const leser = ['b2', 'b3', 'b4'].map((id) => person(id, ['bibellesung']))
    const weeks = wochen(12)
    weeks.forEach((w, i) => {
      // Vier Mikrofone je Woche: jung in acht der 48, sonst reihum die anderen.
      for (const [tab, k] of [['mid', 0], ['mid', 1], ['we', 2], ['we', 3]] as const) {
        hilfsdienst(w[tab], 'mik', i < 8 && k === 0 ? jung : mikro[(i + k) % 5]!)
      }
      setze(w.mid, 'bibellesung', i < 2 ? jung : leser[i % 3]!)
    })
    // Erwartet: 8,5 Mikrofone und 4,8 Lesungen — Mikrofone sollen fast zwei
    // Drittel sein, sind 80 %: nicht deutlich darüber.
    const alle = [jung, ...mikro, ...leser]
    const zeile = einseitig(g(weeks, alle), alle).find((z) => z.pid === 'jung')!
    expect(zeile).toMatchObject({ gesamt: 10, ueberwiegt: null })
    expect(zeile.bereiche.map((b) => [b.bereich, b.n, Math.round(b.erwartet * 10) / 10])).toEqual([
      [mik, 8, 8.5],
      ['bibellesung', 2, 4.8],
    ])
    // Gegenprobe: Hat nur jung die Bibellesung, sollte er sie zwölfmal haben —
    // dann sind 80 % Mikrofone einseitig.
    const ohneLeser = [jung, ...mikro, ...leser.map((p) => ({ ...p, priv: emptyQualifications() }))]
    expect(einseitig(g(weeks, ohneLeser), ohneLeser).find((z) => z.pid === 'jung')?.ueberwiegt).toBe(mik)
  })

  it('nie in einem Bereich, den die anderen im Schnitt viermal hatten', () => {
    const claus = person('claus', [serviceQualKey('mik'), serviceQualKey('saal')])
    const andere = person('andere', [serviceQualKey('saal')])
    const weeks = wochen(5)
    for (const w of weeks) {
      hilfsdienst(w.mid, 'mik', claus)
      hilfsdienst(w.mid, 'saal', andere)
    }
    const zeilen = einseitig(g(weeks, [claus, andere]), [claus, andere])
    const z = zeilen.find((x) => x.pid === 'claus')!
    expect(z.nie).toEqual(['svc:saal'])
    expect(z.bereiche.find((b) => b.bereich === 'svc:saal')?.schnittAndere).toBe(5)
    // `andere` hat nur einen Bereich — einseitig kann dort niemand sein.
    expect(zeilen.map((x) => x.pid)).toEqual(['claus'])
  })

  it('wer den ganzen Zeitraum fehlte, war in keinem Bereich „nie dran" — erst ab einem Platz, der auf ihn gekommen wäre', () => {
    const a = person('a', ['gebet', 'bibellesung'])
    const weg = person('weg', ['gebet', 'bibellesung'])
    const weeks = wochen(6)
    for (const w of weeks) {
      setze(w.mid, 'gebet', a, 1)
      setze(w.mid, 'bibellesung', a)
    }
    const ganz = new Set(weeks.flatMap((_, wi) => [`weg|${wi}|mid`, `weg|${wi}|we`]))
    expect(einseitig(g(weeks, [a, weg], 13, ganz), [a, weg]).map((z) => z.pid)).toEqual(['a'])
    // Einmal da, unter der Woche: Auf ihn wäre je Bereich ein halber Platz
    // gekommen — noch nicht „nie".
    const einmal = new Set([...ganz].filter((k) => k !== 'weg|0|mid'))
    expect(einseitig(g(weeks, [a, weg], 13, einmal), [a, weg]).find((z) => z.pid === 'weg')?.nie).toEqual([])
    // Zweimal da: je ein ganzer — jetzt fällt er auf.
    const zweimal = new Set([...einmal].filter((k) => k !== 'weg|1|mid'))
    const zeile = einseitig(g(weeks, [a, weg], 13, zweimal), [a, weg]).find((z) => z.pid === 'weg')
    expect([...(zeile?.nie ?? [])].sort()).toEqual(['bibellesung', 'gebet'])
  })

  it('ein Bereich, der schon „Bereich im Jahr ungenutzt" meldet, steht nicht zusätzlich unter „nie"', () => {
    const a = person('a', ['gebet', 'bibellesung'])
    const b = person('b', ['gebet', 'bibellesung'])
    const weeks = wochen(6)
    weeks.forEach((w, i) => {
      setze(w.mid, 'gebet', a, 1)
      setze(w.mid, 'bibellesung', a)
      // b betet fünfmal — unter sechs überwiegt nichts, es geht nur um „nie".
      if (i < 5) setze(w.we, 'gebet', b, 1)
    })
    const grund = g(weeks, [a, b])
    expect(einseitig(grund, [a, b]).find((z) => z.pid === 'b')?.nie).toEqual(['bibellesung'])
    const gemeldet = new Map([['b', ['bibellesung']]])
    expect(einseitig(grund, [a, b], gemeldet).find((z) => z.pid === 'b')).toMatchObject({ nie: [], ueberwiegt: null })
  })

  it('die Tabelle Person × Bereich: ob die Person den Bereich hat, und wie oft — auch ohne ihn', () => {
    const a = person('a', ['gebet', 'bibellesung'])
    const b = person('b', ['gebet'])
    const ohne = person('ohne', [])
    const w = woche(1)
    setze(w.mid, 'gebet', a, 1)
    setze(w.mid, 'bibellesung', a)
    setze(w.we, 'gebet', ohne, 1)
    const grund = g([w], [a, b, ohne])
    const m = matrix(grund, [a, b, ohne], einseitig(grund, [a, b, ohne]), ['gebet', 'bibellesung'])
    expect(m.bereiche).toEqual(['gebet', 'bibellesung'])
    expect(m.zeilen).toEqual([
      { pid: 'a', einseitig: false, zellen: [{ n: 1, hat: true }, { n: 1, hat: true }] },
      { pid: 'b', einseitig: false, zellen: [{ n: 0, hat: true }, { n: 0, hat: false }] },
      // Ohne einen einzigen Bereich, aber eingeteilt: Er hat trotzdem eine Zeile.
      { pid: 'ohne', einseitig: false, zellen: [{ n: 1, hat: false }, { n: 0, hat: false }] },
    ])
  })
})

/*
 * Engpässe (Jahresprobe 18.10.2026): je Bereich Plätze je Woche gegen die
 * Personen, die ihn haben — Ton und Video mit acht Personen hieß zehnmal im Jahr.
 */
describe('Engpässe', () => {
  const gebet = ['g1', 'g2', 'g3', 'g4'].map((id) => person(id, ['gebet']))
  const leser = ['l1', 'l2', 'l3', 'l4', 'l5'].map((id) => person(id, ['leser']))
  const mik = ['m1', 'm2'].map((id) => person(id, [serviceQualKey('mik')]))
  const x = person('x', [])
  const alle = [...gebet, ...leser, ...mik, x]
  const weeks = wochen(10)
  weeks.forEach((w, i) => {
    setze(w.mid, 'gebet', gebet[(2 * i) % 4]!, 1)
    setze(w.we, 'gebet', gebet[(2 * i + 1) % 4]!, 1)
    setze(w.mid, 'leser', leser[i % 5]!)
    // Mikrofone kennt die App erst seit vier Wochen.
    if (i >= 6) for (const m of mik) hilfsdienst(w.mid, 'mik', m)
    // Die Bibellesung hat niemand — x liest trotzdem zweimal.
    if (i < 2) setze(w.mid, 'bibellesung', x)
  })
  const liste = engpaesse(g(weeks, alle))

  it('je Bereich Plätze je Woche gegen die Personen mit dem Bereich — die knappsten zuerst', () => {
    const zeile = (b: string) => liste.find((z) => z.bereich === b)
    expect(zeile('gebet')).toMatchObject({ plaetze: 20, wochen: 10, jeWoche: 2, personen: 4, abstand: 2, jePersonJahr: 26 })
    expect(zeile('leser')).toMatchObject({ jeWoche: 1, personen: 5, abstand: 5 })
    expect(zeile('leser')?.jePersonJahr).toBeCloseTo(10.4)
    expect(liste.map((z) => z.bereich)).toEqual(['bibellesung', serviceQualKey('mik'), 'gebet', 'leser'])
  })

  it('die Wochen zählen ab dem ersten Platz des Bereichs — die App kennt Hilfsdienste oft erst später', () => {
    // Acht Mikrofone in vier Wochen sind zwei je Woche, nicht 0,8.
    expect(liste.find((z) => z.bereich === serviceQualKey('mik'))).toMatchObject({ plaetze: 8, wochen: 4, jeWoche: 2, abstand: 1, jePersonJahr: 52 })
  })

  it('einen Bereich, den niemand hat, steht ganz vorn — ohne Abstand', () => {
    expect(liste[0]).toMatchObject({ bereich: 'bibellesung', personen: 0, abstand: null, jePersonJahr: null })
  })

  it('knapp ist, wo jeder öfter als alle vier Wochen dran wäre oder niemand den Bereich hat (T139)', () => {
    // Der Leser mit fünf Personen ist es nicht: jeder alle fünf Wochen.
    expect(KNAPP_UNTER).toBe(4)
    expect(liste.filter(istKnapp).map((z) => z.bereich)).toEqual(['bibellesung', serviceQualKey('mik'), 'gebet'])
  })

  it('gerundet wie der Abstand daneben — „Abstand: 4 Wochen" ist nicht knapp', () => {
    const leser = liste.find((z) => z.bereich === 'leser')!
    expect(istKnapp({ ...leser, abstand: 3.49 })).toBe(true)
    expect(istKnapp({ ...leser, abstand: 3.5 })).toBe(false)
    expect(istKnapp({ ...leser, abstand: 0.3 })).toBe(true)
  })
})

/*
 * Wartezeiten (Jahresprobe 18.10.2026): Der übliche Abstand ist der des
 * Bereichs — Personen mit dem Bereich durch Plätze je Woche. Vorher war es der
 * mittlere Abstand derer, die im Zeitraum zweimal dran waren: zu kurz (Gebet 9
 * statt 18 Wochen) und je nach Zeitraum anders (bei drei Monaten 2,5).
 */
describe('Wartezeiten', () => {
  // Zwölf Wochen, je ein Schlussgebet unter der Woche: d vor 12, a vor 11 bis 4
  // (jede Woche), b vor 3 bis 1, c nie. Vier Personen, ein Platz je Woche.
  const a = person('a', ['gebet'])
  const b = person('b', ['gebet'])
  const c = person('c', ['gebet'])
  const d = person('d', ['gebet'])
  const vier = [a, b, c, d]
  const weeks = wochen(12)
  weeks.forEach((w, i) => {
    const vor = 12 - i
    setze(w.mid, 'gebet', vor === 12 ? d : vor >= 4 ? a : b, 1)
  })

  it('üblich ist der Abstand des Bereichs — wer mehr als doppelt so lange wartet, wartet lange', () => {
    const z = wartezeiten(g(weeks, vier), vier, 'gebet')
    // Der mittlere Abstand von a und b wäre eine Woche gewesen — dann „wartete"
    // schon a nach vier Wochen lange.
    expect(z.ueblich).toBe(4)
    expect(z.warten.map((w) => [w.pid, w.wochen, w.wartend, w.lange])).toEqual([
      ['c', null, 13, true], // nie — gewartet seit der ersten Woche des Bereichs
      ['d', 12, 12, true],
      ['a', 4, 4, false],
      ['b', 1, 1, false],
    ])
  })

  it('schnell wieder: höchstens halb so lange wie üblich, mit den Wochen als Streifen', () => {
    // Drei beten reihum alle vier Wochen, e jede Woche das Anfangsgebet am
    // Sonntag (ohne Vorsitz eingetragen): 21 Gebete in zwölf Wochen, vier Personen.
    const drei = ['v1', 'v2', 'v3'].map((id) => person(id, ['gebet']))
    const e = person('e', ['gebet'])
    const mehr = wochen(12)
    mehr.forEach((w, i) => {
      setze(w.we, 'gebet', e, 0)
      const wer = drei[i % 4]
      if (wer) setze(w.mid, 'gebet', wer, 1)
    })
    const alle = [...drei, e]
    const z = wartezeiten(g(mehr, alle), alle, 'gebet')
    expect(z.ueblich).toBeCloseTo(4 / (21 / 12))
    expect(z.schnell.map((s) => [s.pid, s.abstand, s.mal])).toEqual([['e', 1, 12]])
    expect(z.schnell[0]?.wochen).toEqual(Array.from({ length: 12 }, () => true))
  })

  /*
   * Betreiber 17.10.2026 (Review T126): „Wartet lange" zählt nur Wochen, in
   * denen jemand eingeteilt werden konnte — und wer im Bereich schon eingeteilt
   * ist, wartet nicht.
   */
  it('Wochen, in denen jemand nicht eingeteilt werden konnte, zählen nicht zur Wartezeit — fehlte er nur in der anderen Zusammenkunft, schon', () => {
    // d war vor zwölf Wochen dran und danach sechs Wochen ganz weg (vor 9 bis 4),
    // vor 3 nur am Wochenende — gebetet wird hier unter der Woche.
    const ganz = [9, 8, 7, 6, 5, 4].flatMap((vor) => [`d|${12 - vor}|mid`, `d|${12 - vor}|we`])
    const amWochenende = new Set([...ganz, `d|${12 - 3}|we`])
    const z = wartezeiten(g(weeks, vier, 13, amWochenende), vier, 'gebet')
    expect(z.warten.find((w) => w.pid === 'd')).toMatchObject({ wochen: 12, nichtEinteilbar: 6, wartend: 6, lange: false })
    // Fehlte er vor 3 unter der Woche, wo gebetet wurde, zählt auch die nicht.
    const unterDerWoche = new Set([...ganz, `d|${12 - 3}|mid`])
    expect(wartezeiten(g(weeks, vier, 13, unterDerWoche), vier, 'gebet').warten.find((w) => w.pid === 'd')).toMatchObject({ nichtEinteilbar: 7, wartend: 5 })
  })

  it('wer im Bereich schon eingeteilt ist, wartet nicht — nur im selben Bereich und wo die Zusammenkunft stattfindet', () => {
    // e betete vor zwölf Wochen am Sonntag: fünf Personen, 13 Gebete in zwölf Wochen.
    const e = person('e', ['gebet'])
    const mitE = weeks.map((w) => structuredClone(w))
    setze(mitE[0]!.we, 'gebet', e, 1)
    const naechste = woche(-1)
    setze(naechste.mid, 'gebet', d, 1)
    setze(naechste.mid, 'bibellesung', e) // ein anderer Bereich: e wartet weiter aufs Gebet
    setze(naechste.we, 'gebet', e, 1)
    naechste.dev = { we: { cancelled: true } } // … und eine Zusammenkunft, die ausfällt
    const alle = [...vier, e]
    const z = wartezeiten(g([...mitE, woche(0), naechste], alle), alle, 'gebet')
    const zeile = (pid: string) => z.warten.find((w) => w.pid === pid)
    expect(zeile('d')).toMatchObject({ wochen: 12, geplant: start(-1), lange: false })
    expect(zeile('e')).toMatchObject({ wochen: 12, geplant: null, lange: true })
    // Wer geplant ist, steht hinten.
    expect(z.warten.map((w) => w.pid)).toEqual(['c', 'e', 'a', 'b', 'd'])
  })

  /*
   * Jahresprobe: Die vielbeschäftigten Ältesten „warteten lange" auf ein Gebet.
   */
  it('wer insgesamt über seiner Erwartung liegt, wartet nicht — sein Balken bleibt grau', () => {
    const z = wartezeiten(g(weeks, vier), vier, 'gebet', new Set(['d']))
    expect(z.warten.find((w) => w.pid === 'd')).toMatchObject({ wartend: 12, ueber: true, lange: false })
    expect(z.warten.find((w) => w.pid === 'c')).toMatchObject({ ueber: false, lange: true })
  })
})

/*
 * Die Pflege der Bereiche (Jahresprobe 18.10.2026): Wer ohne den Bereich
 * eingeteilt ist, dem fehlt er wohl; wer ihn ein Jahr nicht nutzt, hat ihn
 * vielleicht nicht mehr.
 */
describe('Pflege der Bereiche', () => {
  it('ohne Bereich eingeteilt: ab zweimal je Bereich — einmal ist Aushilfe', () => {
    const x = person('x', ['gebet'])
    const leser = person('leser', ['leser'])
    const weeks = wochen(4)
    weeks.forEach((w, i) => {
      if (i < 3) setze(w.mid, 'leser', x)
      if (i === 0) hilfsdienst(w.mid, 'mik', x)
      setze(w.we, 'leser', leser)
    })
    expect(ohneBereich(g(weeks, [x, leser]), [x, leser])).toEqual([{ pid: 'x', bereiche: [{ bereich: 'leser', n: 3 }] }])
  })

  it('Bereich im Jahr ungenutzt: wo auf die Person mindestens drei Plätze gekommen wären', () => {
    const alt = person('alt', ['gebet', 'leser'])
    const leser = ['r1', 'r2', 'r3'].map((id) => person(id, ['leser']))
    const neu = person('neu', ['gebet', 'leser'])
    const weeks = wochen(12)
    weeks.forEach((w, i) => {
      setze(w.mid, 'leser', leser[i % 3]!)
      setze(w.we, 'leser', leser[(i + 1) % 3]!)
      if (i === 0) setze(w.mid, 'gebet', alt, 1)
      // neu ist erst seit zwei Wochen dabei — auf ihn kam noch kein Leser.
      if (i >= 10) setze(w.mid, 'gebet', neu, 1)
    })
    const alle = [alt, ...leser, neu]
    // Von 24 Lesungen wären auf alt rund sechs gekommen, auf neu keine ganze.
    expect(nieGenutzt(g(weeks, alle, 52), alle)).toEqual([{ pid: 'alt', bereiche: ['leser'] }])
  })
})

describe('Treffpunkte', () => {
  const gruppe: Group = { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }
  const ohne: Group = { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null }
  const co: Group = { id: 'g3', name: 'Gruppe 3', overseerId: null, assistantId: null }
  const leiter = person('leiter', ['treffpunkt'], { grp: 'g1' })
  const nie = person('nie', ['treffpunkt'], { grp: 'g1' })
  const zwei = person('zwei', ['treffpunkt'], { grp: 'g2' })
  const drei = person('drei', ['treffpunkt'], { grp: 'g3' })
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

  it('eine Gruppe ohne eigene Treffpunkte im Zeitraum steht nicht da — leitete sie der Kreisaufseher, schon', () => {
    // Jahresprobe: Die Versammlung hatte keine Gruppentreffpunkte, und alle sechs
    // Gruppen listeten ihre Leiter mit „nie".
    const weeks = [woche(1)]
    const fs = [[inst(null, 'leiter'), inst('g3', undefined, true)]]
    const t = treffpunkte(fs, zeitfenster(weeks, 13, HEUTE), [leiter, nie, zwei, drei], [gruppe, ohne, co])
    expect(t).toEqual([
      { gruppe: 'g3', zeilen: [{ pid: 'drei', n: 0 }] },
      { gruppe: null, zeilen: [{ pid: 'leiter', n: 1 }] },
    ])
  })
})

describe('Ballungen', () => {
  /*
   * Jahresprobe: Zwei Drittel der Fälle „zweimal" waren gewollte Paare — der
   * Vorsitzende liest am Wochenende den Wachtturm, Vorsitz und Besprechung,
   * Vortrag und Gebet. Ein echtes Signal war nur, wer zugleich einen
   * Hilfsdienst hatte.
   */
  it('zweimal in einer Zusammenkunft nur mit einem Hilfsdienst — zwei Programmpunkte sind kein Befund', () => {
    const p = person('p', ['bibellesung', 'leser', 'vorsitzWe', serviceQualKey('mik'), serviceQualKey('ton')])
    const weeks = wochen(3)
    setze(weeks[0]!.mid, 'bibellesung', p)
    setze(weeks[0]!.mid, 'leser', p)
    setze(weeks[1]!.we, 'vorsitzWe', p)
    setze(weeks[1]!.we, 'leser', p)
    setze(weeks[2]!.mid, 'leser', p)
    hilfsdienst(weeks[2]!.mid, 'mik', p)
    hilfsdienst(weeks[2]!.we, 'mik', p)
    hilfsdienst(weeks[2]!.we, 'ton', p)
    expect(ballungen(g(weeks, [p])).zweimal).toEqual([
      { pid: 'p', start: start(1), tab: 'mid', bereiche: ['leser', serviceQualKey('mik')] },
      { pid: 'p', start: start(1), tab: 'we', bereiche: [serviceQualKey('ton'), serviceQualKey('mik')] },
    ])
  })

  it('drei Wochen hintereinander im selben Bereich', () => {
    const p = person('p', [serviceQualKey('mik')])
    const weeks = wochen(4)
    weeks.forEach((w, i) => {
      if (i < 3) hilfsdienst(w.mid, 'mik', p)
    })
    expect(ballungen(g(weeks, [p])).folge).toEqual([{ pid: 'p', bereich: 'svc:mik', ab: start(4), wochen: 3 }])
  })
})

describe('Was auffällt', () => {
  /** Wer oder was ein Hinweis meint — für Listen wie „selten:c". */
  const marke = (h: Hinweis): string => `${h.art}:${'pid' in h ? h.pid : h.bereich}`

  it('zu selten vor zu oft vor einseitig vor wartet — je Person der deutlichste Fall', () => {
    const a = person('a', ['gebet', serviceQualKey('mik')])
    const b = person('b', ['gebet', serviceQualKey('mik')])
    const c = person('c', ['gebet', serviceQualKey('mik')])
    const weeks = wochen(9)
    weeks.forEach((w, i) => {
      setze(w.mid, 'gebet', a, 1)
      hilfsdienst(w.mid, 'mik', i < 8 ? a : b)
    })
    const grund = g(weeks, [a, b, c])
    const persons = [a, b, c]
    const v = VERGLEICHE.map((x) => verteilung(grund, persons, x))
    const arten = hinweise(v, einseitig(grund, persons), [wartezeiten(grund, persons, 'gebet')]).map(marke)
    // c ist zu selten (in beiden Vergleichen, steht aber einmal da), a zu oft.
    expect(arten.filter((x) => x === 'selten:c')).toHaveLength(1)
    expect(arten.indexOf('selten:c')).toBeLessThan(arten.indexOf('oft:a'))
  })

  it('wer lange wartet, steht je Bereich — der mit den meisten Wartenden zuerst, darin wer am längsten wartet', () => {
    const zeilen = (pids: [string, number, boolean][]) =>
      pids.map(([pid, wartend, lange]) => ({ pid, wochen: wartend, nichtEinteilbar: 0, wartend, zuletzt: null, geplant: null, ueber: false, lange }))
    const w = (bereich: string, ueblich: number, warten: [string, number, boolean][]): Wartezeiten => ({ bereich, ueblich, warten: zeilen(warten), schnell: [] })
    const h = hinweise([], [], [
      w('leser', 5, [['d', 30, true]]),
      w('gebet', 4, [['a', 9, true], ['b', 12, true], ['c', 3, false]]),
    ])
    expect(h).toEqual([
      { art: 'wartet', bereich: 'gebet', pids: ['b', 'a'], ueblich: 4 },
      { art: 'wartet', bereich: 'leser', pids: ['d'], ueblich: 5 },
    ])
  })

  it('die Pflege der Bereiche steht nach den Absagen', () => {
    const absagen = [{ bereich: 'gebet', n: 3, von: 10, anteil: 0.3 }]
    const pflege = { ohneBereich: [{ pid: 'x', bereiche: [{ bereich: 'leser', n: 3 }] }], nieGenutzt: [{ pid: 'y', bereiche: ['gebet'] }] }
    expect(hinweise([], [], [], absagen, pflege).map(marke)).toEqual(['absagen:gebet', 'ohneBereich:x', 'nieGenutzt:y'])
  })
})

/** Je Woche die Felder ihrer Zusammenkünfte — unter der Woche, Wochenende. */
const felderVon = (bild: { wochen: readonly { felder: { mid: unknown; we: unknown } }[] }) => bild.wochen.map((w) => [w.felder.mid, w.felder.we])

/** Dienstag 19 Uhr und Sonntag 10 Uhr — die Testwoche hat keine Abweichung. */
const ZEITEN: MeetingTimes = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const OHNE_TREFFPUNKTE = { fsWeeks: [], zeiten: ZEITEN }

/** Ein Treffpunkt am Wochentag `wd` (0 = Sonntag), geleitet von `lpid`. */
function treffpunkt(wd: number, lpid: string, extra: Partial<FsInstance> = {}): FsInstance {
  return { id: `tp-${wd}-${lpid}`, ruleId: null, grp: null, wd, time: '09:30', place: 'Saal', leader: lpid, lpid, ...extra }
}

/**
 * **Die Wochen einer Person** (Entwurf `GWochenbildKalender`, 23.10.2026): je
 * Zusammenkunft ein Feld. Bis dahin stand je Woche eines — „Aufgabe" verdeckte
 * jeden Hilfsdienst derselben Woche, und das Bild zeigte 27 graue Felder neben
 * einer Kachel mit 32 Hilfsdiensten.
 */
describe('Eine Person', () => {
  it('je Zusammenkunft ein Feld: Aufgabe und Hilfsdienst zugleich sind „beides", der Hilfsdienst am Wochenende bleibt zu sehen', () => {
    const p = person('p', ['gebet', serviceQualKey('mik')])
    const q = person('q', ['gebet'])
    const weeks = wochen(4)
    setze(weeks[0]!.mid, 'gebet', p, 1)
    hilfsdienst(weeks[0]!.mid, 'mik', p)
    hilfsdienst(weeks[0]!.we, 'mik', p)
    hilfsdienst(weeks[1]!.we, 'mik', p)
    setze(weeks[3]!.mid, 'gebet', q, 1)
    const abwesend = new Set(['p|2|mid', 'p|2|we'])
    const bild = personBild(g(weeks, [p, q], 13, abwesend), weeks, [p, q], abwesend, 'p', OHNE_TREFFPUNKTE)!
    expect(felderVon(bild)).toEqual([
      ['beides', 'hilfsdienst'],
      [null, 'hilfsdienst'],
      ['abwesend', 'abwesend'],
      [null, null],
    ])
    // Die älteste zuerst, nichts davon geplant; neben dem Monat steht das Gebet — die Hilfsdienste nicht.
    expect(bild.wochen.map((w) => [w.start, w.geplant.mid, w.geplant.we])).toEqual([start(4), start(3), start(2), start(1)].map((s) => [s, false, false]))
    expect(bild.wochen.map((w) => w.eintraege)).toEqual([[{ art: 'aufgabe', bereich: 'gebet', geplant: false }], [], [], []])
    expect(bild).toMatchObject({ aufgaben: 1, hilfsdienste: 3, abwesend: 2 })
    expect(bild.bereiche.find((b) => b.bereich === 'gebet')).toMatchObject({ hat: true, n: 1, zuletzt: start(4), vorWochen: 4 })
    // Zwei Gebete: das erste ganz auf p — q kam erst in der letzten Woche
    // dazu —, das zweite halb.
    expect(bild.erwartetAufgaben).toBeCloseTo(1.5)
  })

  it('die Bereiche, in denen sie ohne ihn eingeteilt war, stehen hinten — ohne Erwartung, nicht unter den Aufgaben', () => {
    const p = person('p', ['gebet'])
    const weeks = wochen(2)
    for (const w of weeks) setze(w.mid, 'leser', p)
    setze(weeks[1]!.mid, 'gebet', p, 1)
    const bild = personBild(g(weeks, [p]), weeks, [p], KEINE_ABWESENHEIT, 'p', OHNE_TREFFPUNKTE)!
    expect(bild.bereiche.map((b) => [b.bereich, b.hat, b.n, b.erwartet])).toEqual([
      ['gebet', true, 1, 1],
      ['leser', false, 2, 0],
    ])
    expect(bild.aufgaben).toBe(1)
  })

  it('eine unbekannte Person hat kein Bild', () => {
    expect(personBild(g([], []), [], [], KEINE_ABWESENHEIT, 'x', OHNE_TREFFPUNKTE)).toBeNull()
  })

  it('eine Zusammenkunft, die ausfiel, sagt es — leer sähe ein Kongress aus wie eine Woche ohne Aufgabe', () => {
    const p = person('p', ['gebet'])
    const weeks = wochen(2)
    weeks[0]!.dev = { mid: { cancelled: true }, we: { cancelled: true } }
    weeks[1]!.dev = { mid: { cancelled: true } }
    setze(weeks[1]!.we, 'gebet', p, 1)
    // Abwesend in der Kongresswoche: Die Zusammenkünfte fanden nicht statt, gezählt wird nichts.
    const abwesend = new Set(['p|0|mid', 'p|0|we'])
    const bild = personBild(g(weeks, [p], 13, abwesend), weeks, [p], abwesend, 'p', OHNE_TREFFPUNKTE)!
    expect(felderVon(bild)).toEqual([
      ['ausgefallen', 'ausgefallen'],
      ['ausgefallen', 'aufgabe'],
    ])
    expect(bild.abwesend).toBe(0)
  })

  it('was ansteht: ab der laufenden Woche bis zur letzten, in der die Person eingeteilt oder abwesend ist — gezählt wird es nicht', () => {
    const p = person('p', ['gebet', serviceQualKey('mik')])
    // Zwei Wochen zurück, dann die laufende (vor 0) und drei kommende.
    const weeks = [...wochen(2), woche(0), woche(-1), woche(-2), woche(-3)]
    setze(weeks[2]!.mid, 'gebet', p, 1)
    hilfsdienst(weeks[3]!.we, 'mik', p)
    const abwesend = new Set(['p|4|mid'])
    const bild = personBild(g(weeks, [p], 13, abwesend), weeks, [p], abwesend, 'p', OHNE_TREFFPUNKTE)!
    expect(bild.wochen.map((w) => [w.start, w.geplant.mid, w.geplant.we])).toEqual([
      [start(2), false, false],
      [start(1), false, false],
      // Die laufende Woche nach dem Tag (Betreiber 24.10.2026): Am Mittwoch ist
      // der Dienstag gehalten, der Sonntag steht aus.
      [start(0), false, true],
      [start(-1), true, true],
      [start(-2), true, true],
    ])
    expect(felderVon(bild).slice(2)).toEqual([
      ['aufgabe', null],
      [null, 'hilfsdienst'],
      ['abwesend', null],
    ])
    expect(bild.wochen[2]!.eintraege).toEqual([{ art: 'aufgabe', bereich: 'gebet', geplant: false }])
    // Die Kacheln zählen den Zeitraum — was ansteht, gehört nicht dazu, auch der gehaltene Dienstag nicht.
    expect(bild).toMatchObject({ aufgaben: 0, hilfsdienste: 0, abwesend: 0 })

    // Gegenprobe: Steht für jemanden nichts an, endet das Bild mit dem Zeitraum.
    const q = person('q', ['gebet'])
    expect(personBild(g(weeks, [p, q], 13, abwesend), weeks, [p, q], abwesend, 'q', OHNE_TREFFPUNKTE)!.wochen.map((w) => w.start)).toEqual([start(2), start(1)])
  })

  it('nach dem Tag der Zusammenkunft: am Dienstag selbst steht er noch aus, eine verlegte nach ihrem Tag', () => {
    const p = person('p', ['gebet'])
    const weeks = [woche(1), woche(0)]
    setze(weeks[1]!.mid, 'gebet', p, 1)
    const amTag = (heute: string, w: Week[]) =>
      personBild(grundlage({ weeks: w, persons: [p], services: DEMO_SERVICES, abwesend: KEINE_ABWESENHEIT, fenster: zeitfenster(w, 13, heute) }), w, [p], KEINE_ABWESENHEIT, 'p', OHNE_TREFFPUNKTE)!
        .wochen.at(-1)!
    // Vorbei ist ein Tag ab dem Tag danach — wie in „Meine Aufgaben" (`istVorbei`).
    expect(amTag('2026-09-08', weeks).geplant.mid).toBe(true)
    expect(amTag('2026-09-09', weeks).geplant.mid).toBe(false)
    // Auf Donnerstag verlegt: am Mittwoch steht sie noch aus.
    const verlegt = structuredClone(weeks)
    verlegt[1]!.dev = { mid: { wd: 4 } }
    expect(amTag('2026-09-09', verlegt).geplant.mid).toBe(true)
  })

  it('geleitete Treffpunkte stehen beim Monat — ohne Feld, ohne Freitext-Leiter, und sie halten das Kommende offen', () => {
    // Betreiber 24.10.2026: „Geleitete dazu" — sonst stand eine Absage allein da.
    const p = person('p', ['treffpunkt'])
    const weeks = [woche(1), woche(0), woche(-1), woche(-2)]
    const fsWeeks: FsInstance[][] = [
      // Letzte Woche: einer von p, einer von q, und ein Freitext-Leiter, der zufällig p's Id trägt.
      [treffpunkt(3, 'p'), treffpunkt(6, 'q'), treffpunkt(5, 'p', { lext: true })],
      // Die laufende: Montag (gehalten), Mittwoch — heute, steht also aus.
      [treffpunkt(1, 'p'), treffpunkt(3, 'p')],
      [],
      // Die übernächste: Ihretwegen reicht das Bild bis dorthin.
      [treffpunkt(6, 'p')],
    ]
    const bild = personBild(g(weeks, [p]), weeks, [p], KEINE_ABWESENHEIT, 'p', { fsWeeks, zeiten: ZEITEN })!
    const geleitet = (geplant: boolean) => ({ art: 'aufgabe', bereich: TREFFPUNKT_BEREICH, geplant })
    expect(bild.wochen.map((w) => w.eintraege)).toEqual([[geleitet(false)], [geleitet(false), geleitet(true)], [], [geleitet(true)]])
    expect(felderVon(bild)).toEqual([[null, null], [null, null], [null, null], [null, null]])
    // Die Kacheln zählen keine Treffpunkte — wie „Zu oft, zu selten".
    expect(bild.aufgaben).toBe(0)

    // Gegenprobe ohne Treffpunkte: Das Bild endet mit dem Zeitraum.
    expect(personBild(g(weeks, [p]), weeks, [p], KEINE_ABWESENHEIT, 'p', OHNE_TREFFPUNKTE)!.wochen.map((w) => w.start)).toEqual([start(1)])
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
    // Mit Woche und Zusammenkunft: Die Wochen einer Person zeigen sie an ihrem Platz.
    expect(g0.absagen).toEqual([
      { pid: 'mik', bereich: serviceQualKey('mik'), wi: 0, tab: 'mid' },
      { pid: 'beter', bereich: 'gebet', wi: 0, tab: 'mid' },
    ])
  })

  it('auch auf einem Platz, der seitdem leer steht — der Planer hat den Absagenden nur ausgetragen', () => {
    const w = woche(1)
    const g0 = grund([w], [absage('mik', w, schluessel(w, 'mid', serviceQualKey('mik')))])
    expect(g0.absagen).toEqual([{ pid: 'mik', bereich: serviceQualKey('mik'), wi: 0, tab: 'mid' }])
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
    expect(g0.absagen).toEqual([{ pid: 'beter', bereich: null, wi: 0, tab: 'mid' }])
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
    expect(grund([w], absagen, [redner, rotiert]).absagen).toEqual([{ pid: 'fest', bereich: 'studium', wi: 0, tab: 'we' }])
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
      { pid: 'vorsitz', bereich: 'vorsitzMid', wi: 1, tab: 'mid' },
      { pid: 'beter2', bereich: 'gebet', wi: 2, tab: 'mid' },
    ])
  })

  it('ein abgesagter Treffpunkt zählt unter „Treffpunkte leiten" — gegen die geleiteten', () => {
    const w = woche(1)
    const g0 = grund([w], [absage('beter', w, `fs|${w.start}|inst-1`)])
    // Ein Treffpunkt ist keine Zusammenkunft — er hat seine Woche, aber keinen Tag darin.
    expect(g0.absagen).toEqual([{ pid: 'beter', bereich: TREFFPUNKT_BEREICH, wi: 0, tab: null }])
    expect(absagenJeBereich(g0, 4)).toEqual([{ bereich: TREFFPUNKT_BEREICH, n: 1, von: 4, anteil: 0.25 }])
  })

  it('je Bereich: wie viele, gegen alle Zuteilungen des Bereichs — die meisten zuerst', () => {
    const weeks = wochen(3)
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
    const weeks = wochen(2)
    const absagen = weeks.map((w) => absage('beter', w, schluessel(w, 'mid', 'gebet')))
    absagen.push(absage('mik', weeks[0]!, schluessel(weeks[0]!, 'mid', serviceQualKey('mik'))))
    const bild = personBild(grund(weeks, absagen), weeks, [mik, beter, andere], KEINE_ABWESENHEIT, 'beter', OHNE_TREFFPUNKTE)
    expect(bild?.absagen).toBe(2)
  })

  it('die Person: eine Absage steht an ihrem Platz — im Feld vor der Abwesenheit, mit Bereich neben dem Monat; ein Treffpunkt nur daneben', () => {
    const weeks = wochen(2)
    setze(weeks[0]!.mid, 'gebet', andere, 1) // der Ersatz
    const absagen = [absage('beter', weeks[0]!, schluessel(weeks[0]!, 'mid', 'gebet', 1)), absage('beter', weeks[1]!, `fs|${weeks[1]!.start}|inst-1`)]
    // Er sagte ab, weil er weg war: Das Feld sagt „abgesagt", die Kachel zählt beides.
    const abwesend = new Set(['beter|0|mid'])
    const g0 = grundlage({ weeks, persons: [mik, beter, andere], services: DEMO_SERVICES, abwesend, fenster: zeitfenster(weeks, 13, HEUTE), absagen })
    const bild = personBild(g0, weeks, [mik, beter, andere], abwesend, 'beter', OHNE_TREFFPUNKTE)!
    expect(felderVon(bild)).toEqual([
      ['abgesagt', null],
      [null, null],
    ])
    expect(bild.wochen.map((w) => w.eintraege)).toEqual([
      [{ art: 'absage', bereich: 'gebet', geplant: false }],
      [{ art: 'absage', bereich: TREFFPUNKT_BEREICH, geplant: false }],
    ])
    expect(bild).toMatchObject({ absagen: 2, abwesend: 1 })
  })
})

describe('Kennzahlen', () => {
  it('Zuteilungen, wer eingeteilt war und wer nie', () => {
    const a = person('a', ['gebet'])
    const nie = person('nie', ['gebet'])
    const ohne = person('ohne', [])
    const w = woche(1)
    setze(w.mid, 'gebet', a, 1)
    setze(w.we, 'gebet', a, 1)
    expect(kennzahlen(g([w], [a, nie, ohne]), [a, nie, ohne])).toEqual({ zuteilungen: 2, mitBereichen: 2, eingeteilt: 1, nie: 1 })
  })

  it('wer den ganzen Zeitraum fehlte, ist nicht „nie dran" — von ihm wird nichts erwartet', () => {
    const a = person('a', ['gebet'])
    const weg = person('weg', ['gebet'])
    const weeks = wochen(2)
    setze(weeks[0]!.mid, 'gebet', a, 1)
    const ganz = new Set(weeks.flatMap((_, wi) => [`weg|${wi}|mid`, `weg|${wi}|we`]))
    expect(kennzahlen(g(weeks, [a, weg], 13, ganz), [a, weg])).toMatchObject({ mitBereichen: 1, eingeteilt: 1, nie: 0 })
    // Gegenprobe: eine Zusammenkunft da — dann war er nie dran.
    const einmalDa = new Set([...ganz].filter((x) => x !== 'weg|1|we'))
    expect(kennzahlen(g(weeks, [a, weg], 13, einmalDa), [a, weg])).toMatchObject({ mitBereichen: 2, nie: 1 })
  })

  it('auswerten fügt alles zusammen — ohne Wochen ist alles leer, nicht kaputt', () => {
    const a = auswerten({ weeks: [], fsWeeks: [], persons: [], services: DEMO_SERVICES, groups: [], abwesend: KEINE_ABWESENHEIT, heute: HEUTE, zeitraum: 12 })
    expect(a.kennzahlen.zuteilungen).toBe(0)
    expect(a.hinweise).toEqual([])
    expect(a.wartezeiten).toEqual([])
    expect(a.engpaesse).toEqual([])
    expect(a.pflege).toEqual({ ohneBereich: [], nieGenutzt: [] })
  })
})

/*
 * Wartezeiten, Engpässe und die Pflege der Bereiche rechnen über das ganze Jahr
 * (Jahresprobe 18.10.2026): Wer vor einem halben Jahr zuletzt betete, wartet —
 * auch wenn oben drei Monate gewählt sind.
 */
describe('auswerten: das Jahr', () => {
  const beter = ['b1', 'b2', 'b3', 'b4'].map((id) => person(id, ['gebet']))
  const lang = person('lang', ['gebet'])
  const persons = [...beter, lang]
  const weeks = wochen(30)
  weeks.forEach((w, i) => setze(w.mid, 'gebet', i === 0 ? lang : beter[i % 4]!, 1))
  const rechne = (zeitraum: 12 | 3) =>
    auswerten({ weeks, fsWeeks: [], persons, services: DEMO_SERVICES, groups: [], abwesend: KEINE_ABWESENHEIT, heute: HEUTE, zeitraum })

  it('Wartezeiten, Engpässe und die Pflege sind bei drei Monaten dieselben wie beim Jahr', () => {
    const jahr = rechne(12)
    const quartal = rechne(3)
    expect(quartal.wartezeiten).toEqual(jahr.wartezeiten)
    expect(quartal.engpaesse).toEqual(jahr.engpaesse)
    expect(quartal.pflege).toEqual(jahr.pflege)
    // lang betete vor dreißig Wochen — im Vierteljahr nie, gewartet hat er trotzdem dreißig.
    const zeile = quartal.wartezeiten[0]!.warten.find((z) => z.pid === 'lang')
    expect(zeile).toMatchObject({ wochen: 30, lange: true })
    expect(quartal.hinweise).toContainEqual({ art: 'wartet', bereich: 'gebet', pids: ['lang'], ueblich: 5 })
    // Der Zeitraum gilt weiter für alles andere.
    expect(quartal.kennzahlen.zuteilungen).toBe(13)
    expect(jahr.kennzahlen.zuteilungen).toBe(30)
  })

  it('wer übers Jahr insgesamt über seiner Erwartung liegt, wartet nicht', () => {
    // lang liest dazu jede Woche, obwohl alle lesen dürfen: weit über seiner Erwartung.
    const mitLeser = [...beter, lang].map((p) => ({ ...p, priv: { ...p.priv, leser: true } }))
    const viel = weeks.map((w) => {
      const kopie = structuredClone(w)
      setze(kopie.mid, 'leser', lang)
      return kopie
    })
    const a = auswerten({ weeks: viel, fsWeeks: [], persons: mitLeser, services: DEMO_SERVICES, groups: [], abwesend: KEINE_ABWESENHEIT, heute: HEUTE, zeitraum: 12 })
    expect(a.wartezeiten.find((w) => w.bereich === 'gebet')?.warten.find((z) => z.pid === 'lang')).toMatchObject({ ueber: true, lange: false })
    // Auf ein Gebet wartet niemand mehr — aufs Lesen die anderen, die nie dran sind.
    expect(a.hinweise.filter((h) => h.art === 'wartet').map((h) => h.art === 'wartet' && h.bereich)).toEqual(['leser'])
  })
})

/*
 * **Ein Platz ohne Bereich** — Altbestand aus der Zeit vor `bereichsKey`. Die
 * Auswertung blickt ein Jahr zurück, solche Wochen liegen also im Zeitraum.
 * Der Platz ist eine Zuteilung (die Person war dran), aber in keinem Bereich:
 * Er darf weder als eigene Spalte noch als „Ohne Bereich eingeteilt" noch als
 * Folge im selben Bereich auftauchen, und gegen die Erwartung zählt er nicht.
 */
describe('Ein Platz ohne Bereich (Altbestand)', () => {
  /** Setzt `p` auf den ersten Platz dieses Bereichs und nimmt dem Platz den Bereich. */
  function ohneBereichSetzen(meeting: Meeting, bereich: string, p: Person): void {
    setze(meeting, bereich, p)
    const slot = meeting.sections
      .flatMap((s) => s.items)
      .flatMap((i) => (isSong(i) ? [] : i.names))
      .find((n) => n.pid === p.id && n.bereichsKey === bereich)!
    delete slot.bereichsKey
  }

  const a = person('a', ['gebet'])
  const b = person('b', ['gebet'])
  // Drei Wochen hintereinander — genug für eine „Folge" und für „Ohne Bereich eingeteilt".
  const weeks = wochen(3)
  for (const w of weeks) ohneBereichSetzen(w.mid, 'besprechung', a)
  const grund = g(weeks, [a, b])

  it('zählt als Zuteilung — a war dran, also nicht „nie"', () => {
    expect(grund.einteilungen.filter((e) => e.pid === 'a').map((e) => e.bereich)).toEqual([null, null, null])
    expect(kennzahlen(grund, [a, b])).toMatchObject({ zuteilungen: 3, eingeteilt: 1 })
  })

  it('ist keine Spalte und kein „Ohne Bereich eingeteilt"', () => {
    expect([...grund.plaetze.keys()]).not.toContain(null)
    expect(matrix(grund, [a, b], einseitig(grund, [a, b]), ['gebet']).bereiche).not.toContain(null)
    expect(ohneBereich(grund, [a, b])).toEqual([])
  })

  it('bildet keine Folge — drei Wochen ohne Bereich sind nicht „dreimal derselbe Bereich"', () => {
    expect(ballungen(grund).folge).toEqual([])
  })

  it('zählt nicht gegen die Erwartung — und eine Woche mit Bereich daneben schon', () => {
    const zeile = (grundlage_: Grundlage) => zeilenVon(verteilung(grundlage_, [a, b], 'aufgaben')).find((z) => z.pid === 'a')
    expect(zeile(grund)?.n ?? 0).toBe(0)
    // Positivkontrolle: Derselbe Platz mit Bereich zählt.
    const mit = wochen(3)
    for (const w of mit) setze(w.mid, 'gebet', a, 1)
    expect(zeile(g(mit, [a, b]))?.n).toBe(3)
  })
})

describe('Reihenfolge bei Gleichstand — dieselbe bei jedem Aufbau', () => {
  /** Eine Grundlage von Hand: nur die Felder, um die es geht. */
  const von = (teile: Partial<Grundlage>): Grundlage => ({ ...g([], []), ...teile })

  it('die Tabelle: Bereiche, die die Ordnung nicht kennt, stehen hinten — untereinander nach dem Alphabet', () => {
    // Ein neuer Hilfsdienst kennt die Ordnung der Spalten noch nicht. In der
    // Reihenfolge, in der die Einteilungen kamen, wanderten die Spalten von
    // Aufbau zu Aufbau.
    const grund = von({ plaetze: new Map([['svc:zett', 1], ['gebet', 2], ['svc:alpha', 1]]) })
    expect(matrix(grund, [], [], ['gebet']).bereiche).toEqual(['gebet', 'svc:alpha', 'svc:zett'])
  })

  it('die Absagen: bei gleich vielen der höhere Anteil zuerst, bei gleichem Anteil nach dem Alphabet', () => {
    const absage = (bereich: string) => ({ pid: 'x', bereich, wi: 0, tab: 'mid' as const })
    const grund = von({
      absagen: [absage('gebet'), absage('leser'), absage('bibellesung')],
      plaetze: new Map([['gebet', 10], ['leser', 2], ['bibellesung', 2]]),
    })
    expect(absagenJeBereich(grund, 0).map((z) => [z.bereich, z.anteil])).toEqual([
      ['bibellesung', 0.5],
      ['leser', 0.5],
      ['gebet', 0.1],
    ])
  })

  it('„Bereich im Jahr ungenutzt": bei gleicher Erwartung nach dem Alphabet', () => {
    const p = person('p', ['leser', 'gebet'])
    const grund = von({
      plaetze: new Map([['leser', 9], ['gebet', 9]]),
      erwartet: new Map([['leser', new Map([['p', 3]])], ['gebet', new Map([['p', 3]])]]),
    })
    expect(nieGenutzt(grund, [p])).toEqual([{ pid: 'p', bereiche: ['gebet', 'leser'] }])
  })
})

/*
 * **Zu oft, ohne dass etwas erwartet war.** Wer den ganzen Zeitraum als
 * abwesend geführt ist (die Abwesenheit kam im Nachhinein), aber dreimal
 * eingeteilt wurde, liegt bei der Erwartung null — und dreimal darüber. Sein
 * Verhältnis ist dann die Zahl selbst, nicht unendlich: Sonst stünde er vor
 * jedem, der wirklich ein Vielfaches seiner Erwartung trägt.
 */
describe('Zu oft ohne Erwartung', () => {
  const a = person('a', ['gebet'])
  const b = person('b', ['gebet'])
  const einteilung = (pid: string, wi: number) => ({ pid, wi, start: start(13 - wi), tab: 'mid' as const, bereich: 'gebet', hilfsdienst: false })
  const grund: Grundlage = {
    ...g([], []),
    einteilungen: [...[0, 1, 2].map((wi) => einteilung('a', wi)), ...Array.from({ length: 12 }, (_, wi) => einteilung('b', wi))],
    plaetze: new Map([['gebet', 15]]),
    erwartet: new Map([['gebet', new Map([['b', 2]])]]),
  }

  it('in der Liste „zu oft": b (sechsmal die Erwartung) vor a (dreimal, ohne Erwartung)', () => {
    const v = verteilung(grund, [a, b], 'aufgaben')
    expect(v.oft.map((z) => [z.pid, z.n, z.erwartet])).toEqual([
      ['b', 12, 2],
      ['a', 3, 0],
    ])
  })

  it('unter „Was auffällt" dieselbe Reihenfolge', () => {
    const h = hinweise([verteilung(grund, [a, b], 'aufgaben')], [], [])
    expect(h.map((x) => `${x.art}:${'pid' in x ? x.pid : ''}`)).toEqual(['oft:b', 'oft:a'])
  })
})
