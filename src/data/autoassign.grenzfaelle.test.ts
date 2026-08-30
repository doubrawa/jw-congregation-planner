/*
 * Fairness der automatischen Zuteilung in Sonderfällen — Aufgaben,
 * Hilfsdienste und Treffpunkte.
 *
 * Die übrigen Simulationen (autoassign.sim, autoassign.fairness) prüfen den
 * Normalbetrieb: ein fester Personenkreis über viele Wochen. Hier geht es um
 * die Ränder, an denen eine Strichliste kippt:
 *
 *  - jemand kommt **neu** dazu und hat keine Vergangenheit,
 *  - jemand kommt aus **langem Urlaub** zurück, sein Fenster ist leer gelaufen,
 *  - jemand ist **selten qualifiziert** und konkurriert mit Vielseitigen,
 *  - der Kreis ist **sehr klein** oder fast vollständig abwesend.
 *
 * In allen Fällen gilt dieselbe Regel: niemand wird überschüttet, nur weil
 * seine Liste leer ist — und niemand fällt dauerhaft heraus.
 *
 * Gemessen wird über lange Zeiträume (40–60 Wochen), weil sich genau das kurz
 * nicht zeigt: der Ausschlag der ersten Wochen verschwindet im Mittel, wenn
 * man nur die Summe betrachtet.
 */
import { describe, expect, it } from 'vitest'
import type { AbsenceSet } from './absence'
import { buildImportWeek, DEMO_SERVICES } from './testdaten'
import { fsAutoAssign, FS_LOAD_WEEKS, fsWochenStart } from './fs'
import { displayName, emptyQualifications, partWorkload } from './helpers'
import { autoAssignMeeting } from './planning'
import type { Absence, FsInstance, Person, Qualifications, Week } from './types'

/* ---- Bausteine ----------------------------------------------------------- */

let lfd = 0
function mk(quals: string[], patch: Partial<Person> = {}): Person {
  lfd++
  const priv = { ...emptyQualifications() } as unknown as Record<string, boolean>
  for (const q of quals) priv[q] = true
  return {
    id: `p${lfd}`,
    fn: `V${lfd}`,
    ln: `N${lfd}`,
    role: 'verkuendiger',
    female: false,
    tel: '',
    mail: '',
    priv: priv as unknown as Qualifications,
    ...patch,
  }
}

/** Qualifikationen, die die Schülerteile und Lesungen abdecken. */
const SCHUL = ['schulung', 'schulungPartner', 'bibellesung', 'leser']

/** Montag der Woche `i` ab 5.10.2026 — fortlaufend, wie im echten Bestand. */
function montag(i: number): string {
  return new Date(Date.UTC(2026, 9, 5) + i * 7 * 864e5).toISOString().slice(0, 10)
}

/**
 * Wochenplan der Zusammenkünfte über `n` Wochen; `poolAb` darf je Woche
 * wechseln.
 *
 * Jede Woche trägt ihren **eigenen** Montag. Das ist keine Zierde: das
 * Auslastungs-Fenster rechnet in Wochen, nicht in Einträgen (`lastFenster`),
 * und `assignmentDistance` misst die Wartezeit am Datum. Trügen alle Wochen
 * dasselbe, fiele das Fenster auf eine einzige zusammen und jede Wartezeit auf
 * null — die Simulation prüfte dann eine Fairness, die es so nicht gibt.
 */
function planeWochen(
  n: number,
  poolAb: (wi: number) => Person[],
  abwesend: AbsenceSet = new Set<string>(),
): Week[] {
  let weeks: Week[] = Array.from({ length: n }, (_unused, i) => ({
    ...buildImportWeek(),
    start: montag(i),
  }))
  for (let wi = 0; wi < n; wi++) {
    const pool = poolAb(wi)
    weeks = autoAssignMeeting(weeks, wi, 'mid', pool, DEMO_SERVICES, [], 'all', abwesend).weeks
    weeks = autoAssignMeeting(weeks, wi, 'we', pool, DEMO_SERVICES, [], 'all', abwesend).weeks
  }
  return weeks
}

/** Zwei Treffpunkte je Woche an verschiedenen Wochentagen. */
function leereTreffpunkte(n: number): FsInstance[][] {
  return Array.from({ length: n }, (_unused, wi) => [
    { id: `${wi}|a`, ruleId: 'a', grp: '', wd: 1, time: '09:30', place: 'Saal', leader: '' },
    { id: `${wi}|b`, ruleId: 'b', grp: '', wd: 3, time: '09:30', place: 'Halle', leader: '' },
  ])
}

function planeTreffpunkte(
  n: number,
  poolAb: (wi: number) => Person[],
  absences: readonly Absence[] = [],
  base?: Date,
): FsInstance[][] {
  let fsWeeks = leereTreffpunkte(n)
  for (let wi = 0; wi < n; wi++) {
    fsWeeks = fsAutoAssign(fsWeeks, wi, poolAb(wi), null, absences, fsWochenStart(base ?? null, wi)).fsWeeks
  }
  return fsWeeks
}

/** Zuteilungen je Woche (Programmpunkte). */
const aufgabenJeWoche = (weeks: Week[], person: Person): number[] =>
  weeks.map((w) => partWorkload([w], person))

/** Leitungen je Woche (Treffpunkte). */
const leitungenJeWoche = (fsWeeks: FsInstance[][], name: string): number[] =>
  fsWeeks.map((w) => w.filter((i) => i.leader === name).length)

/** Abwesenheit in bestimmten Wochen (beide Zusammenkuenfte). */
function abwesendIn(pid: string, ...wochen: number[]): AbsenceSet {
  return new Set(wochen.flatMap((wi) => [`${pid}|${wi}|mid`, `${pid}|${wi}|we`]))
}

const summe = (a: number[], von: number, bis: number): number =>
  a.slice(von, bis).reduce((x, y) => x + y, 0)

/** Montag der Woche 0 — für die Datums-Abwesenheiten der Treffpunkte. */
const BASE = new Date(2026, 8, 7, 12)
const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Abwesenheit über die Wochen [von, bis) als Datumsspanne. */
function urlaub(personId: string, von: number, bis: number): Absence[] {
  const a = new Date(BASE.getTime())
  a.setDate(a.getDate() + von * 7)
  const b = new Date(BASE.getTime())
  b.setDate(b.getDate() + bis * 7 - 1)
  return [{ id: 'u', personId, userId: '', from: iso(a), to: iso(b), reason: '' }]
}

/* ---- Wochen-Deckel ------------------------------------------------------- */

describe('Wochen-Deckel: niemand häuft Leitungen in einer Woche', () => {
  /** Enger Kreis, drei Treffpunkte je Woche — hier beißt der Deckel wirklich. */
  function engerKreis(n: number): FsInstance[][] {
    return Array.from({ length: n }, (_unused, wi) => [
      { id: `${wi}|a`, ruleId: 'a', grp: '', wd: 1, time: '09:00', place: 'A', leader: '' },
      { id: `${wi}|b`, ruleId: 'b', grp: '', wd: 3, time: '09:00', place: 'B', leader: '' },
      { id: `${wi}|c`, ruleId: 'c', grp: '', wd: 5, time: '09:00', place: 'C', leader: '' },
    ])
  }

  it('vier Leiter, drei Plätze je Woche — keine Doppelung über 40 Wochen', () => {
    // Ohne den Deckel gemessen: vier Wochen mit zwei oder drei Leitungen für
    // dieselbe Person. Der Lastvergleich allein verhindert das nicht — er sagt
    // nur, wer als Nächstes dran ist, nicht wie oft hintereinander.
    const stamm = Array.from({ length: 4 }, () => mk(['treffpunkt']))
    let fsWeeks = engerKreis(40)
    for (let wi = 0; wi < 40; wi++) fsWeeks = fsAutoAssign(fsWeeks, wi, stamm).fsWeeks
    for (const p of stamm) {
      const proWoche = leitungenJeWoche(fsWeeks, displayName(p))
      expect(Math.max(...proWoche), `${displayName(p)}: ${proWoche.join('')}`).toBeLessThanOrEqual(1)
    }
  })

  it('auch der Neuling bekommt nicht drei Leitungen in einer Woche', () => {
    // Gemessen ohne Deckel: der Neuling bekam in Woche 2 und 3 je drei
    // Leitungen (Verlauf 1 3 3 0 1); mit Deckel 1 1 1 1 1.
    const stamm = Array.from({ length: 4 }, () => mk(['treffpunkt']))
    const neu = mk(['treffpunkt'])
    const EINTRITT = 25
    let fsWeeks = engerKreis(40)
    for (let wi = 0; wi < 40; wi++) {
      fsWeeks = fsAutoAssign(fsWeeks, wi, wi < EINTRITT ? stamm : [...stamm, neu]).fsWeeks
    }
    const r = leitungenJeWoche(fsWeeks, displayName(neu))
    expect(Math.max(...r), `Verlauf ${r.slice(EINTRITT).join('')}`).toBeLessThanOrEqual(1)
  })
})

/* ---- Neuling ------------------------------------------------------------- */

describe('Neuling ohne Vergangenheit wird nicht überschüttet', () => {
  it('Treffpunkte: reiht sich ein, statt alles zu bekommen', () => {
    // Mit einem Jahresfenster bekam der Neuling gemessen ALLE zehn Leitungen
    // der ersten fünf Wochen, der gesamte Stamm null.
    const stamm = Array.from({ length: 8 }, () => mk(['treffpunkt']))
    const neu = mk(['treffpunkt'])
    const WOCHEN = 60
    const EINTRITT = 40
    const fsWeeks = planeTreffpunkte(WOCHEN, (wi) => (wi < EINTRITT ? stamm : [...stamm, neu]))

    const neuling = leitungenJeWoche(fsWeeks, displayName(neu))
    const stammSchnitt =
      stamm.reduce((s, p) => s + summe(leitungenJeWoche(fsWeeks, displayName(p)), EINTRITT, WOCHEN), 0) /
      stamm.length
    const neuGesamt = summe(neuling, EINTRITT, WOCHEN)

    // Kein Ausbruch nach oben: höchstens die Hälfte mehr als der Stamm.
    expect(neuGesamt).toBeLessThanOrEqual(stammSchnitt * 1.5)
    // Und er fällt auch nicht heraus: ein zu hoher Einstieg wäre der
    // umgekehrte Fehler — ausgewählt wird das Minimum, wer darüber startet,
    // kommt nie dran.
    expect(neuGesamt).toBeGreaterThanOrEqual(stammSchnitt * 0.5)
  })

  it('Treffpunkte: kommt in den ersten Wochen dran, wartet kein Jahr', () => {
    const stamm = Array.from({ length: 8 }, () => mk(['treffpunkt']))
    const neu = mk(['treffpunkt'])
    const EINTRITT = 40
    const fsWeeks = planeTreffpunkte(60, (wi) => (wi < EINTRITT ? stamm : [...stamm, neu]))
    const neuling = leitungenJeWoche(fsWeeks, displayName(neu))
    expect(summe(neuling, EINTRITT, EINTRITT + 8)).toBeGreaterThan(0)
  })

  it('Treffpunkte: nie mehr als eine Leitung je Woche, solange andere frei sind', () => {
    const stamm = Array.from({ length: 8 }, () => mk(['treffpunkt']))
    const neu = mk(['treffpunkt'])
    const fsWeeks = planeTreffpunkte(60, (wi) => (wi < 40 ? stamm : [...stamm, neu]))
    for (const p of [...stamm, neu]) {
      const proWoche = leitungenJeWoche(fsWeeks, displayName(p))
      expect(Math.max(...proWoche), `${displayName(p)} häuft Leitungen`).toBeLessThanOrEqual(1)
    }
  })

  it('Aufgaben: bekommt in den ersten Wochen nicht das Vielfache der anderen', () => {
    const stamm = Array.from({ length: 14 }, () => mk(SCHUL))
    const neu = mk(SCHUL)
    const EINTRITT = 20
    const weeks = planeWochen(40, (wi) => (wi < EINTRITT ? stamm : [...stamm, neu]))

    const neuling = summe(aufgabenJeWoche(weeks, neu), EINTRITT, EINTRITT + 5)
    const schnitt =
      stamm.reduce((s, p) => s + summe(aufgabenJeWoche(weeks, p), EINTRITT, EINTRITT + 5), 0) /
      stamm.length
    // Das enge Fenster (LOAD_RADIUS) fängt das hier von selbst ab; der Test
    // hält fest, dass es so bleibt, falls das Fenster je verbreitert wird.
    expect(neuling).toBeLessThanOrEqual(schnitt * 2)
  })

  it('Aufgaben: gleicht sich über ein halbes Jahr aus', () => {
    const stamm = Array.from({ length: 14 }, () => mk(SCHUL))
    const neu = mk(SCHUL)
    const EINTRITT = 20
    const weeks = planeWochen(46, (wi) => (wi < EINTRITT ? stamm : [...stamm, neu]))
    const nach = EINTRITT + 6 // Einschwingen überspringen
    const neuling = summe(aufgabenJeWoche(weeks, neu), nach, 46)
    const schnitt =
      stamm.reduce((s, p) => s + summe(aufgabenJeWoche(weeks, p), nach, 46), 0) / stamm.length
    expect(neuling).toBeGreaterThan(schnitt * 0.6)
    expect(neuling).toBeLessThan(schnitt * 1.4)
  })
})

/* ---- Rückkehr aus dem Urlaub --------------------------------------------- */

describe('Rückkehr aus langem Urlaub führt nicht zur Nachschlag-Welle', () => {
  it('Treffpunkte: nach zwölf Wochen Abwesenheit kein Schwall', () => {
    const alle = Array.from({ length: 9 }, () => mk(['treffpunkt']))
    const weg = alle[0]
    const VON = 30
    const BIS = 42
    const fsWeeks = planeTreffpunkte(60, () => alle, urlaub(weg.id, VON, BIS), BASE)
    const r = leitungenJeWoche(fsWeeks, displayName(weg))

    expect(summe(r, VON, BIS), 'während des Urlaubs eingeteilt').toBe(0)
    // Fünf Wochen nach der Rückkehr: höchstens zwei, nicht das Nachholen von zwölf.
    expect(summe(r, BIS, BIS + 5)).toBeLessThanOrEqual(2)
  })

  it('Treffpunkte: der Rückkehrer verschwindet aber nicht dauerhaft', () => {
    const alle = Array.from({ length: 9 }, () => mk(['treffpunkt']))
    const weg = alle[0]
    const fsWeeks = planeTreffpunkte(60, () => alle, urlaub(weg.id, 30, 42), BASE)
    const r = leitungenJeWoche(fsWeeks, displayName(weg))
    expect(summe(r, 42, 60), 'nach der Rückkehr nie wieder dran').toBeGreaterThan(0)
  })

  it('Aufgaben: nach zwölf Wochen Abwesenheit höchstens leicht erhöht', () => {
    const alle = Array.from({ length: 15 }, () => mk(SCHUL))
    const weg = alle[0]
    const VON = 20
    const BIS = 32
    const abwesend = abwesendIn(weg.id, ...Array.from({ length: BIS - VON }, (_u, i) => VON + i))
    const weeks = planeWochen(50, () => alle, abwesend)
    const r = aufgabenJeWoche(weeks, weg)
    const andere =
      alle.slice(1).reduce((s, p) => s + summe(aufgabenJeWoche(weeks, p), BIS, BIS + 5), 0) /
      (alle.length - 1)

    expect(summe(r, VON, BIS), 'während der Abwesenheit eingeteilt').toBe(0)
    expect(summe(r, BIS, BIS + 5)).toBeLessThanOrEqual(Math.ceil(andere * 1.6))
  })

  it('Aufgaben: kurze Abwesenheit (zwei Wochen) verschiebt nichts nennenswert', () => {
    const alle = Array.from({ length: 15 }, () => mk(SCHUL))
    const weg = alle[0]
    const abwesend = abwesendIn(weg.id, 20, 21)
    const weeks = planeWochen(40, () => alle, abwesend)
    const r = summe(aufgabenJeWoche(weeks, weg), 0, 40)
    const schnitt =
      alle.slice(1).reduce((s, p) => s + summe(aufgabenJeWoche(weeks, p), 0, 40), 0) /
      (alle.length - 1)
    expect(r).toBeGreaterThan(schnitt * 0.7)
    expect(r).toBeLessThan(schnitt * 1.3)
  })
})

/* ---- Langzeit-Gleichmaß --------------------------------------------------- */

describe('Gleichmaß über lange Zeiträume', () => {
  it('Treffpunkte: ein Jahr, niemand mehr als das Doppelte des Schwächsten', () => {
    const alle = Array.from({ length: 9 }, () => mk(['treffpunkt']))
    const fsWeeks = planeTreffpunkte(52, () => alle)
    const summen = alle.map((p) => summe(leitungenJeWoche(fsWeeks, displayName(p)), 0, 52))
    const min = Math.min(...summen)
    const max = Math.max(...summen)
    expect(min, `Verteilung ${summen.join(' ')}`).toBeGreaterThan(0)
    expect(max - min, `Verteilung ${summen.join(' ')}`).toBeLessThanOrEqual(3)
  })

  it('Treffpunkte: auch bei ungerader Teilung bleibt der Abstand klein', () => {
    // 7 Personen auf 2 Plätze je Woche — geht nicht glatt auf, darf aber nicht
    // dazu führen, dass zwei dauerhaft vorn und zwei dauerhaft hinten stehen.
    const alle = Array.from({ length: 7 }, () => mk(['treffpunkt']))
    const fsWeeks = planeTreffpunkte(52, () => alle)
    const summen = alle.map((p) => summe(leitungenJeWoche(fsWeeks, displayName(p)), 0, 52))
    expect(Math.max(...summen) - Math.min(...summen), `Verteilung ${summen.join(' ')}`).toBeLessThanOrEqual(3)
  })

  /*
    Eigene Frist: 52 Wochen × 16 Personen ist die längste Simulation im ganzen
    Bestand. Ohne Instrumentierung läuft sie in gut einer Sekunde; unter
    `npm run test:coverage` zählt V8 jede Verzweigung mit, und dieselbe Rechnung
    überschreitet die Vorgabe von 5 s. Der Lauf wurde dadurch **nur unter
    Coverage** rot — also ausgerechnet dann, wenn man Lücken sucht und eine rote
    Zeile für einen Befund hält.
  */
  it('Aufgaben: ein Jahr, niemand geht leer aus', () => {
    const alle = Array.from({ length: 16 }, () => mk(SCHUL))
    const weeks = planeWochen(52, () => alle)
    const summen = alle.map((p) => summe(aufgabenJeWoche(weeks, p), 0, 52))
    expect(Math.min(...summen), `Verteilung ${summen.join(' ')}`).toBeGreaterThan(0)
  }, 20_000)

  it('Hilfsdienste: ein enger Kreis wird gleichmäßig durchgetauscht', () => {
    // Nur vier Personen für den Ton — die Strichliste muss sie durchrotieren.
    const ton = Array.from({ length: 4 }, () => mk(['svc:ton']))
    const rest = Array.from({ length: 12 }, () => mk([...SCHUL, 'svc:mik', 'svc:ord']))
    const weeks = planeWochen(40, () => [...ton, ...rest])
    const zaehl = (name: string): number =>
      weeks.reduce(
        (s, w) =>
          s +
          [w.mid, w.we].reduce(
            (t, m) => t + (m.helpers.ton ?? []).filter((slot) => slot.name === name).length,
            0,
          ),
        0,
      )
    const summen = ton.map((p) => zaehl(displayName(p)))
    expect(Math.min(...summen), `Verteilung ${summen.join(' ')}`).toBeGreaterThan(0)
    expect(Math.max(...summen) - Math.min(...summen), `Verteilung ${summen.join(' ')}`).toBeLessThanOrEqual(4)
  })
})

/* ---- Enge und entartete Fälle -------------------------------------------- */

describe('Kleine Kreise und Ausnahmezustände', () => {
  it('Treffpunkte: ein einziger Kandidat bekommt beide Plätze — Deckel weicht', () => {
    // Der Wochen-Deckel darf nicht dazu führen, dass ein Platz offen bleibt,
    // obwohl jemand da ist.
    const einer = mk(['treffpunkt'])
    const fsWeeks = planeTreffpunkte(3, () => [einer])
    expect(fsWeeks[0].every((i) => i.leader === displayName(einer))).toBe(true)
  })

  it('Treffpunkte: ohne Kandidaten bleibt alles offen, ohne Fehler', () => {
    const fsWeeks = planeTreffpunkte(3, () => [])
    expect(fsWeeks[0].every((i) => i.leader === '')).toBe(true)
  })

  it('Treffpunkte: sind alle abwesend, bleibt der Platz offen', () => {
    const alle = Array.from({ length: 3 }, () => mk(['treffpunkt']))
    const abw = alle.flatMap((p) => urlaub(p.id, 0, 4))
    const fsWeeks = planeTreffpunkte(3, () => alle, abw, BASE)
    expect(fsWeeks[0].every((i) => i.leader === '')).toBe(true)
  })

  it('Treffpunkte: der zuletzt Verbliebene wird nicht doppelt am selben Tag gesetzt', () => {
    // Zwei Treffpunkte am GLEICHEN Wochentag, nur eine Person: der zweite
    // bleibt offen — niemand kann an zwei Orten zugleich sein.
    let fsWeeks: FsInstance[][] = [
      [
        { id: 'a', ruleId: null, grp: '', wd: 6, time: '09:00', place: 'A', leader: '' },
        { id: 'b', ruleId: null, grp: 'g1', wd: 6, time: '09:00', place: 'B', leader: '' },
      ],
    ]
    fsWeeks = fsAutoAssign(fsWeeks, 0, [mk(['treffpunkt'])]).fsWeeks
    expect(fsWeeks[0].filter((i) => i.leader).length).toBe(1)
  })

  it('Aufgaben: eine seltene Qualifikation wird nicht von Vielseitigen verdrängt', () => {
    // Nur zwei Personen dürfen das Studium leiten, sind aber auch für alles
    // andere qualifiziert. Die Leiter-Plätze müssen trotzdem besetzt werden —
    // die Auto-Zuteilung darf sie nicht anderswo verbrauchen.
    const leiter = Array.from({ length: 2 }, () => mk([...SCHUL, 'studium']))
    const rest = Array.from({ length: 12 }, () => mk(SCHUL))
    const weeks = planeWochen(20, () => [...leiter, ...rest])
    const offeneLeiter = weeks.reduce(
      (n, w) =>
        n +
        [w.mid, w.we].reduce(
          (m, meeting) =>
            m +
            meeting.sections.reduce(
              (s, sec) =>
                s +
                sec.items.filter(
                  (it) =>
                    'names' in it &&
                    it.names.some((slot) => slot.bereichsKey === 'studium' && !slot.name),
                ).length,
              0,
            ),
          0,
        ),
      0,
    )
    expect(offeneLeiter, 'Studium blieb offen, obwohl jemand qualifiziert war').toBe(0)
  })

  it('der Gastredner-Platz bleibt der Auto-Zuteilung entzogen', () => {
    // Der öffentliche Vortrag wird von außen vermittelt („Gastredner").
    // Die Automatik darf ihn nicht mit einem eigenen Bruder füllen.
    const alle = Array.from({ length: 12 }, () => mk([...SCHUL, 'vortrag', 'gebet', 'studium']))
    const weeks = planeWochen(6, () => alle)
    for (const w of weeks) {
      for (const sec of w.we.sections) {
        for (const it of sec.items) {
          if (!('names' in it)) continue
          for (const slot of it.names) {
            if (slot.rolle?.includes('Gastredner')) {
              expect(slot.name, 'Gastredner-Platz wurde automatisch besetzt').toBe('')
            }
          }
        }
      }
    }
  })

  it('das Lastfenster der Treffpunkte ist die gemessene Breite', () => {
    // Die Zahl steckt in der Dokumentation mit ihrer Messung; ändert sie sich,
    // gehört die Messung wiederholt (siehe FS_LOAD_WEEKS in fs.ts).
    expect(FS_LOAD_WEEKS).toBe(12)
  })
})
