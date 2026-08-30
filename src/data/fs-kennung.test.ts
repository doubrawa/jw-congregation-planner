/*
 * Die Kennung eines Treffpunkts darf nicht an der Position seiner Woche hängen
 * (T87, gefunden bei der Modellprüfung T68).
 *
 * **Der Fall, den niemand ausprobiert hat.** Das Ladefenster hält die jüngsten
 * 52 Wochen (`WEEK_LIMIT`). Solange die Versammlung weniger hat, fängt es
 * immer bei derselben Woche an — die Wochennummer einer Kalenderwoche steht
 * still, und alles sieht richtig aus. Vom ersten Import jenseits eines Jahres
 * an rutscht das Fenster mit jeder neuen Woche eine weiter: Dieselbe
 * Kalenderwoche heißt dann 51 statt 52, und die Kennung `"52|r1"` gibt es
 * nicht mehr.
 *
 * Was daran hängt, ist nicht nur ein Schlüssel: `regenFsWeeks` findet die
 * **gespeicherte Leitung** über die Kennung wieder. Findet sie sie nicht, ist
 * der Treffpunkt beim nächsten Laden wieder offen — ohne Meldung, ohne Spur,
 * mitten in einer fertigen Planung.
 */
import { describe, expect, it } from 'vitest'
import { buildFsWeeks, fsBaseFromWeeks, fsMigrateInstIds, fsTaskKey, fsWochenStart, regenFsWeeks } from './fs'
import { migrateFsTaskKeys } from '../lib/data'
import type { FsInstance, FsRule } from './types'

const RULES: FsRule[] = [
  { id: 'r-samstag', grp: '', wd: 6, time: '09:30', place: 'Saal', monthly: 0, skipCong: false },
  { id: 'r-mittwoch', grp: '', wd: 3, time: '18:00', place: 'Park', monthly: 0, skipCong: false },
]

/** Montag der Woche `i` ab dem 5.1.2026. */
const montag = (i: number): string =>
  new Date(Date.UTC(2026, 0, 5) + i * 7 * 864e5).toISOString().slice(0, 10)

/** Wochenkennungen ab Basis `i` — so viele, wie ein Aufruf braucht. */
const kennAb = (i: number, n = 8): string[] =>
  Array.from({ length: n }, (_unused, wi) => fsWochenStart(basisAb(i), wi))

const basisAb = (i: number): Date =>
  fsBaseFromWeeks([{ current: false, start: montag(i) }], new Date())

describe('Die Kennung eines Treffpunkts hängt nicht an der Wochennummer', () => {
  it('dieselbe Kalenderwoche hat dieselbe Kennung, egal wo im Fenster sie steht', () => {
    const alsDritte = buildFsWeeks(basisAb(0), 6, RULES)[3]!
    const alsZweite = buildFsWeeks(basisAb(1), 5, RULES)[2]!
    // Beide beschreiben den 26. Januar 2026 — die Kennungen müssen gleich sein.
    expect(fsWochenStart(basisAb(0), 3)).toBe(fsWochenStart(basisAb(1), 2))
    expect(alsZweite.map((i) => i.id)).toEqual(alsDritte.map((i) => i.id))
  })

  it('und damit auch derselbe task_key', () => {
    const dritte = buildFsWeeks(basisAb(0), 6, RULES)[3]!
    const zweite = buildFsWeeks(basisAb(1), 5, RULES)[2]!
    expect(fsTaskKey(fsWochenStart(basisAb(1), 2), zweite[0]!.id)).toBe(
      fsTaskKey(fsWochenStart(basisAb(0), 3), dritte[0]!.id),
    )
  })

  it('der zugeteilte Leiter überlebt das Weiterrutschen des Fensters', () => {
    // Genau der gemessene Ausfall: vorher „Emil Ernst", nachher "".
    const vorher = buildFsWeeks(basisAb(0), 6, RULES)
    vorher[3]![0]!.leader = 'Emil Ernst'
    const gespeichert = vorher.slice(1) // Woche 0 fällt aus dem Fenster
    const nachher = regenFsWeeks(kennAb(1), gespeichert, RULES, true)
    expect(nachher[2]![0]!.leader).toBe('Emil Ernst')
  })

  it('zwei Regeln bleiben unterscheidbar — die Kennung ist die Regel', () => {
    const woche = buildFsWeeks(basisAb(0), 1, RULES)[0]!
    expect(new Set(woche.map((i) => i.id)).size).toBe(2)
    expect(woche.map((i) => i.id).sort()).toEqual(['r-mittwoch', 'r-samstag'])
  })
})

describe('Altbestand wird beim Laden gehoben', () => {
  /** Eine gespeicherte Woche, wie sie vor der Umstellung im Blob stand. */
  const altWoche = (wi: number, leader: string): FsInstance[] => [
    { id: `${wi}|r-samstag`, ruleId: 'r-samstag', grp: '', wd: 6, time: '09:30', place: 'Saal', leader },
  ]

  it('die Wochennummer fällt vorn weg', () => {
    const [woche] = fsMigrateInstIds([altWoche(7, 'Emil Ernst')])
    expect(woche?.[0]?.id).toBe('r-samstag')
    expect(woche?.[0]?.leader).toBe('Emil Ernst')
  })

  it('ein zweiter Lauf ändert nichts mehr (idempotent, gleiche Referenz)', () => {
    const einmal = fsMigrateInstIds([altWoche(7, 'Emil Ernst')])
    expect(fsMigrateInstIds(einmal)).toBe(einmal)
  })

  it('von Hand angelegte Treffpunkte bleiben unberührt', () => {
    const manuell: FsInstance[] = [
      { id: 'x9f3e-4a', ruleId: null, grp: '', wd: 2, time: '10:00', place: 'Halle', leader: '', manual: true },
    ]
    expect(fsMigrateInstIds([manuell])[0]?.[0]?.id).toBe('x9f3e-4a')
  })

  it('nach der Umstellung findet das Ausrichten die Leitung wieder', () => {
    // Der ganze Weg, wie beim Laden: Blob heben → ausrichten.
    const gehoben = fsMigrateInstIds([altWoche(7, 'Emil Ernst')])
    const ausgerichtet = regenFsWeeks(kennAb(0), gehoben, RULES, true)
    expect(ausgerichtet[0]?.find((i) => i.ruleId === 'r-samstag')?.leader).toBe('Emil Ernst')
  })
})

describe('Die Bestätigungen wandern mit', () => {
  it('der Schlüssel verliert die Wochennummer, der Status bleibt', () => {
    const { confirmations, renames } = migrateFsTaskKeys({
      'fs|2026-01-26|3|r-samstag': 'bestätigt',
    })
    expect(renames).toEqual([['fs|2026-01-26|3|r-samstag', 'fs|2026-01-26|r-samstag']])
    expect(confirmations).toEqual({ 'fs|2026-01-26|r-samstag': 'bestätigt' })
  })

  it('und trifft genau den Schlüssel, den die Woche danach bildet', () => {
    // Die Probe darauf, dass beide Seiten dieselbe Form meinen: hier der
    // gehobene Alt-Schlüssel, dort der aus der Instanz gerechnete.
    const { confirmations } = migrateFsTaskKeys({ 'fs|2026-01-26|3|r-samstag': 'bestätigt' })
    const woche = regenFsWeeks(kennAb(0), fsMigrateInstIds([[]]), RULES, true)[0]!
    const key = fsTaskKey('2026-01-26', woche.find((i) => i.ruleId === 'r-samstag')!.id)
    expect(confirmations[key]).toBe('bestätigt')
  })

  it('schon umgestellte und fremde Schlüssel bleiben unberührt', () => {
    const rein = {
      'fs|2026-01-26|r-samstag': 'bestätigt' as const,
      'fs|2026-01-26|x9f3e-4a': 'verhindert' as const,
      '2026-01-26|mid|helper|ton|0': 'bestätigt' as const,
    }
    const { confirmations, renames } = migrateFsTaskKeys(rein)
    expect(renames).toEqual([])
    expect(confirmations).toBe(rein)
  })
})
