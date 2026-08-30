import { describe, expect, it } from 'vitest'
import {
  deriveMyFsTasks,
  fsAutoAssign,
  fsClear,
  fsLeiterZuteilung,
  fsMigrateLeaderPids,
  fsRenameLeader,
  fsSetLeader,
  fsWeekConflicts,
  fsWochenStart,
} from './fs'
import { emptyQualifications } from './helpers'
import type { Absence, FsInstance, Person } from './types'

/**
 * T63 · Der Treffpunkt-Leiter als Freitext.
 *
 * Den Treffpunkt der Dienstwoche leitet in der Regel der **Kreisaufseher** — er
 * steht in keiner Personenliste. Derselbe Doppelweg wie beim Redner am Sonntag
 * (T29): Person aus der Liste **oder** Freitext.
 *
 * Der ganze Prüfstoff hängt an **einer** Verwechslung, und deshalb heißt der
 * Freitext-Leiter in fast jedem Test hier wie ein Bruder der Versammlung:
 * *K. Steiner*. Die Abwesenheit der `lpid` taugt nämlich nicht als Kennzeichen
 * — sie heißt schon „Altdaten, Person noch nachzutragen", und
 * `fsMigrateLeaderPids` trägt sie bei **jedem Laden** nach. Ohne ein eigenes
 * Flag würde der Kreisaufseher also stillschweigend zum gleichnamigen Bruder:
 * mit Auslastung, „Meine Aufgaben" und Erinnerungen.
 */

const KS = 'K. Steiner' // Anzeigename des Bruders — und Name des Kreisaufsehers

function person(patch: Partial<Person> = {}): Person {
  return {
    id: 'p1', fn: 'Klaus', ln: 'Steiner', dn: KS, role: 'aeltester', female: false,
    tel: '', mail: '',
    priv: { ...emptyQualifications(), treffpunkt: true },
    ...patch,
  }
}

function inst(patch: Partial<FsInstance> = {}): FsInstance {
  return { id: 'i1', ruleId: null, grp: '', wd: 1, time: '09:30', place: 'KH', leader: '', ...patch }
}

/** Montag der Woche 0 = 7. September 2026 (wie in fs.test.ts). */
const BASE = new Date(2026, 8, 7, 12)
/** Wochenkennungen zu BASE — Schlüssel und Datum hängen seit T100 daran. */
const KENN = Array.from({ length: 6 }, (_unused, wi) => fsWochenStart(BASE, wi))

describe('T63 · Freitext-Leiter: setzen und zurücknehmen', () => {
  it('Freitext setzt `lext` und lässt keine Person-Id stehen', () => {
    const vorher = [[inst({ leader: 'A. Bauer', lpid: 'p9' })]]
    const [woche] = fsSetLeader(vorher, 0, 'i1', KS, undefined, true)
    expect(woche?.[0]).toMatchObject({ leader: KS, lext: true })
    expect(woche?.[0]?.lpid).toBeUndefined()
  })

  it('eine Person danach räumt den Freitext weg — beides zugleich gäbe es nicht', () => {
    const vorher = [[inst({ leader: KS, lext: true })]]
    const [woche] = fsSetLeader(vorher, 0, 'i1', KS, 'p1')
    expect(woche?.[0]?.lpid).toBe('p1')
    expect(woche?.[0]?.lext).toBeUndefined()
  })

  it('Leeren nimmt beides zurück — ein offener Platz ist weder eigen noch auswärtig', () => {
    const vorher = [[inst({ leader: KS, lext: true })]]
    const [woche] = fsSetLeader(vorher, 0, 'i1', '')
    expect(woche?.[0]?.leader).toBe('')
    expect(woche?.[0]?.lext).toBeUndefined()
  })

  it('`fsClear` räumt das Kennzeichen mit weg', () => {
    const { fsWeeks } = fsClear([[inst({ leader: KS, lext: true })]], 0)
    expect(fsWeeks[0]?.[0]?.leader).toBe('')
    expect(fsWeeks[0]?.[0]?.lext).toBeUndefined()
  })

  it('`fsLeiterZuteilung` gibt den Freitext gar nicht erst als Person aus', () => {
    expect(fsLeiterZuteilung(inst({ leader: KS, lext: true }))).toBeUndefined()
    expect(fsLeiterZuteilung(inst({ leader: '' }))).toBeUndefined()
    expect(fsLeiterZuteilung(inst({ leader: KS, lpid: 'p1' }))).toEqual({ name: KS, pid: 'p1' })
  })
})

describe('T63 · der Freitext wird nicht zur gleichnamigen Person', () => {
  it('der Backfill lässt ihn in Ruhe — sonst wäre der Fehler selbstheilend in die falsche Richtung', () => {
    const vorher = [[inst({ leader: KS, lext: true })]]
    const nachher = fsMigrateLeaderPids(vorher, [person()])
    expect(nachher[0]?.[0]?.lpid).toBeUndefined()
    // Gegenprobe am selben Namen: ohne das Flag ist der Backfill richtig und
    // greift weiterhin — das Flag schaltet ihn nicht generell ab.
    const alt = fsMigrateLeaderPids([[inst({ leader: KS })]], [person()])
    expect(alt[0]?.[0]?.lpid).toBe('p1')
  })

  it('er steht nicht in „Meine Aufgaben" des Bruders', () => {
    const frei = deriveMyFsTasks([[inst({ leader: KS, lext: true })]], KENN, KS, {}, 'p1', 'T')
    expect(frei).toHaveLength(0)
    // Gegenprobe: derselbe Name ohne Flag gehört ihm sehr wohl.
    const eigen = deriveMyFsTasks([[inst({ leader: KS })]], KENN, KS, {}, 'p1', 'T')
    expect(eigen).toHaveLength(1)
  })

  it('seine Abwesenheit wird nicht gemeldet — die App kennt von ihm keine', () => {
    const abw: Absence[] = [
      { id: 'a1', personId: 'p1', userId: 'u1', from: '2026-09-07', to: '2026-09-13', reason: '' },
    ]
    const frei = fsWeekConflicts([[inst({ leader: KS, lext: true })]], 0, [person()], abw, KENN[0]!)
    expect(frei.filter((c) => c.kind === 'fsAbsent')).toHaveLength(0)
    // Gegenprobe: der Bruder selbst, am selben Tag abwesend, wird gemeldet.
    const eigen = fsWeekConflicts([[inst({ leader: KS, lpid: 'p1' })]], 0, [person()], abw, KENN[0]!)
    expect(eigen.filter((c) => c.kind === 'fsAbsent')).toHaveLength(1)
  })

  it('zweimal am selben Tag bleibt trotzdem ein Konflikt — auch beim Kreisaufseher', () => {
    const woche = [
      inst({ id: 'i1', leader: KS, lext: true }),
      inst({ id: 'i2', leader: KS, lext: true, time: '14:00' }),
    ]
    const doppelt = fsWeekConflicts([woche], 0, [person()], [], KENN[0]!).filter(
      (c) => c.kind === 'fsDouble',
    )
    expect(doppelt).toHaveLength(1)
  })

  it('das Umbenennen des Bruders zieht ihn nicht mit', () => {
    const vorher = [[inst({ leader: KS, lext: true })]]
    expect(fsRenameLeader(vorher, 'p1', KS, 'K. Steinert')[0]?.[0]?.leader).toBe(KS)
    // Gegenprobe: die echte Zuteilung wird umbenannt.
    const eigen = [[inst({ leader: KS, lpid: 'p1' })]]
    expect(fsRenameLeader(eigen, 'p1', KS, 'K. Steinert')[0]?.[0]?.leader).toBe('K. Steinert')
  })

  it('er zählt nicht auf die Auslastung des Bruders — sonst überginge die Auto-Zuteilung ihn', () => {
    // So gebaut, dass die Zahlen in **beide** Richtungen eindeutig entscheiden
    // und nicht der Tie-Hash: In Woche 0 leitet der Kreisaufseher zweimal
    // (Freitext, Name des Bruders), U. Berg einmal wirklich. Woche 1 ist offen.
    //
    //   mit Wache:  Bruder 0 · Berg 1  → der Bruder ist dran
    //   ohne Wache: Bruder 2 · Berg 1  → Berg ist dran
    const bruder = person({ id: 'p1', dn: KS })
    const andere = person({ id: 'p2', fn: 'Uwe', ln: 'Berg', dn: 'U. Berg' })
    const wochen = [
      [
        inst({ id: 'i1', leader: KS, lext: true }),
        inst({ id: 'i2', wd: 3, leader: KS, lext: true }),
        inst({ id: 'i3', wd: 6, leader: 'U. Berg', lpid: 'p2' }),
      ],
      [inst({ id: 'i4' })],
    ]
    const { fsWeeks } = fsAutoAssign(wochen, 1, [bruder, andere], null, [], KENN[0]!)
    expect(fsWeeks[1]?.[0]?.lpid).toBe('p1')
  })
})
