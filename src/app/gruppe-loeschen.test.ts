import { describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import type { AppState } from './context'
import { fsGruppeEntfernen, fsTaskKey, fsWochenKennungen, regenFsWeeks } from '../data/fs'
import { emptyQualifications, ohneGruppe } from '../data/helpers'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_PERSONS,
  FS_BASE,
} from '../data/testdaten'
import type { FsInstance, Group, Person } from '../data/types'

/**
 * **Eine Predigtdienstgruppe löschen — und wer danach ohne Gruppe dasteht.**
 *
 * Gemeldet vom Betreiber am 13. September 2026: Eine Gruppe ließ sich mit einem
 * Tipp löschen, ohne Rückfrage, und ihre Mitglieder standen danach still ohne
 * Gruppe da. Die Rückfrage selbst prüft `einstellungen/panels.test.tsx`; hier
 * geht es um das, was das Löschen **anrichtet**, und um die Frage, die die
 * Warnung danach stellt:
 *
 * - **Die Mitglieder verlieren ihre Zuordnung** — und genau sie nennt die
 *   Warnung „Ohne Predigtdienstgruppe" (`ohneGruppe`), niemand sonst.
 * - **Die Treffpunkte der Gruppe gehen mit.** Bis dahin blieben ihre Regeln im
 *   Grundplan liegen. Die Einstellungen zeigen den Grundplan je Gruppe, also
 *   stand keine davon mehr irgendwo zum Löschen da — erzeugt wurden sie
 *   trotzdem Woche für Woche, im Programm betitelt mit der rohen Gruppen-Id.
 * - **Nichts anderes geht mit**: nicht die Treffpunkte der übrigen Gruppen,
 *   nicht die der Versammlung, nicht ihre Leiter.
 *
 * Die Vorgaben sind der Demo-Bestand: vier Gruppen, je eine Samstagsregel, die
 * am ersten Samstag im Monat dem Versammlungstreffpunkt weicht (Woche 3).
 */

/** Demo-Zustand mit dem, was `removeGroup` liest und schreibt. */
function stand(over: Partial<AppState> = {}): AppState {
  return {
    dataStatus: 'demo',
    lang: 'de',
    toast: null,
    week: 0,
    congregation: { ...CONGREGATION },
    weeks: buildDemoWeeks(),
    persons: [...DEMO_PERSONS],
    groups: [...DEMO_GROUPS],
    fsRules: [...DEMO_FS_RULES],
    fsWeeks: buildDemoFsWeeks(),
    fsBase: FS_BASE,
    // Die Zusagen gehören dazu: Verschwindet ein Treffpunkt, verfällt seine.
    confirmations: {},
    ...over,
  } as AppState
}

const loeschen = (s: AppState, id: string): AppState => reducer(s, { type: 'removeGroup', id })

/** Alle Treffpunkte einer Gruppe über alle Wochen. */
const treffpunkteVon = (fsWeeks: FsInstance[][], grp: string): FsInstance[] =>
  fsWeeks.flat().filter((inst) => inst.grp === grp)

describe('Eine Predigtdienstgruppe löschen', () => {
  it('ihre Mitglieder stehen danach ohne Gruppe da — und die Warnung nennt genau sie', () => {
    const vorher = stand()
    const mitglieder = vorher.persons.filter((p) => p.grp === 'g1').map((p) => p.id)
    // Gegenprobe der Vorgabe: Die Gruppe hat Mitglieder, und vorher fehlt niemandem eine.
    expect(mitglieder.length).toBeGreaterThan(3)
    expect(ohneGruppe(vorher.persons, vorher.groups)).toEqual([])

    const nachher = loeschen(vorher, 'g1')

    expect(nachher.groups.map((g) => g.id)).toEqual(['g2', 'g3', 'g4'])
    expect(ohneGruppe(nachher.persons, nachher.groups).map((p) => p.id)).toEqual(mitglieder)
  })

  it('die Mitglieder der übrigen Gruppen behalten ihre Zuordnung', () => {
    const vorher = stand()
    const nachher = loeschen(vorher, 'g1')
    const andere = vorher.persons.filter((p) => p.grp && p.grp !== 'g1')
    for (const p of andere) {
      expect(nachher.persons.find((q) => q.id === p.id)?.grp, p.id).toBe(p.grp)
    }
  })

  it('ihre Treffpunkte verschwinden aus dem Grundplan und aus jeder Woche', () => {
    const vorher = stand()
    expect(treffpunkteVon(vorher.fsWeeks, 'g1').length, 'Vorgabe: g1 hat Treffpunkte').toBeGreaterThan(0)

    const nachher = loeschen(vorher, 'g1')

    expect(nachher.fsRules.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r5', 'r6', 'r7'])
    expect(treffpunkteVon(nachher.fsWeeks, 'g1')).toEqual([])
  })

  it('die Zusagen ihrer Treffpunkte verfallen mit — die der übrigen bleiben', () => {
    // Blieben sie stehen, erbte sie ein Treffpunkt, der später unter derselben
    // Kennung wieder entsteht, und die Datenbank trüge Zusagen zu nichts.
    const vorher = stand()
    const kennungen = fsWochenKennungen(vorher.weeks, vorher.fsBase)
    const schluessel = (grp: string) =>
      vorher.fsWeeks.flatMap((w, wi) =>
        w.filter((inst) => inst.grp === grp && inst.leader).map((inst) => fsTaskKey(kennungen[wi] ?? '', inst.id)),
      )
    const g1 = schluessel('g1')
    const g2 = schluessel('g2')
    expect(g1.length, 'Vorgabe: g1 hat besetzte Treffpunkte').toBeGreaterThan(0)
    const zusagen = Object.fromEntries([...g1, ...g2].map((k) => [k, 'bestätigt' as const]))

    const nachher = loeschen(stand({ confirmations: zusagen }), 'g1')

    expect(Object.keys(nachher.confirmations).sort()).toEqual([...g2].sort())
  })

  it('die übrigen Treffpunkte bleiben — samt ihren Leitern', () => {
    const vorher = stand()
    const nachher = loeschen(vorher, 'g1')
    const ohneG1 = (weeks: FsInstance[][]) => weeks.map((w) => w.filter((inst) => inst.grp !== 'g1'))
    expect(nachher.fsWeeks).toEqual(ohneG1(vorher.fsWeeks))
    // Stichprobe mit Namen, damit die Gleichheit oben nicht zwei leere Listen vergleicht.
    expect(nachher.fsWeeks[0]?.find((inst) => inst.id === 'r5')?.leader).toBe('Paul Schröder')
    expect(nachher.fsWeeks[0]?.find((inst) => inst.id === 'r1')?.leader).toBe('Thomas Lindner')
  })

  it('auch ein nur für eine Woche angelegter Treffpunkt der Gruppe geht mit', () => {
    /*
      Die Regeln allein genügen nicht: `regenFsWeeks` hält einmalige Treffpunkte
      ausdrücklich fest. Neu ausgerichtet statt gestrichen, bliebe dieser hier
      stehen — unter einer Gruppe, die es nicht mehr gibt.
    */
    const einmalig: FsInstance = {
      id: 'x-pioniertag', ruleId: null, manual: true, grp: 'g1', wd: 5, time: '09:00',
      place: 'Königreichssaal', leader: 'Manfred Albrecht',
    }
    const vorher = stand({ week: 1 })
    const mitEinmaligem = reducer(vorher, { type: 'fsInstAdd', inst: einmalig })
    expect(mitEinmaligem.fsWeeks[1]?.some((inst) => inst.id === 'x-pioniertag')).toBe(true)

    const nachher = loeschen(mitEinmaligem, 'g1')

    expect(nachher.fsWeeks[1]?.some((inst) => inst.id === 'x-pioniertag')).toBe(false)
  })

  it('nach dem nächsten Laden kommen sie nicht wieder', () => {
    /*
      Beim Laden richtet `loadCongregationData` die gespeicherten Wochen am
      Grundplan neu aus (`regenFsWeeks(…, true)`). Blieben die Regeln der
      Gruppe liegen, stünden ihre Treffpunkte danach wieder in jeder Woche.
    */
    const nachher = loeschen(stand(), 'g1')
    const kennungen = fsWochenKennungen(nachher.weeks, nachher.fsBase)

    const neuGeladen = regenFsWeeks(kennungen, nachher.fsWeeks, nachher.fsRules, true)

    expect(treffpunkteVon(neuGeladen, 'g1')).toEqual([])
    // Gegenprobe: Mit dem alten Grundplan wären sie wieder da.
    expect(treffpunkteVon(regenFsWeeks(kennungen, nachher.fsWeeks, DEMO_FS_RULES, true), 'g1').length)
      .toBeGreaterThan(0)
  })

  it('eine Woche ohne Treffpunkt dieser Gruppe bleibt dieselbe — sie wird nicht geschrieben', () => {
    // Woche 3 enthält den ersten Samstag im Oktober: Der Versammlungstreffpunkt
    // verdrängt dort alle Gruppentreffpunkte. `persist.ts` schreibt, was eine
    // neue Referenz hat.
    const vorher = stand()
    expect(treffpunkteVon([vorher.fsWeeks[3] ?? []], 'g1')).toEqual([])

    const nachher = loeschen(vorher, 'g1')

    expect(nachher.fsWeeks[3]).toBe(vorher.fsWeeks[3])
    expect(nachher.fsWeeks[0]).not.toBe(vorher.fsWeeks[0])
  })

  it('eine Gruppe ohne Treffpunkte lässt Grundplan und Wochen unberührt', () => {
    const neu: Group = { id: 'g-neu', name: 'Gruppe 5', ov: null, as: null }
    const vorher = stand({ groups: [...DEMO_GROUPS, neu] })

    const nachher = loeschen(vorher, 'g-neu')

    expect(nachher.fsRules).toBe(vorher.fsRules)
    expect(nachher.fsWeeks).toBe(vorher.fsWeeks)
  })

  it('die leere Kennung ist die Versammlung, keine Gruppe — dafür wird nichts gestrichen', () => {
    // Die Versammlungstreffpunkte tragen `grp: ''`. Ein Streichen „der Gruppe ''"
    // nähme sie alle mit.
    const vorher = stand()
    const { fsRules, fsWeeks } = fsGruppeEntfernen(vorher.fsRules, vorher.fsWeeks, '')
    expect(fsRules).toBe(vorher.fsRules)
    expect(fsWeeks).toBe(vorher.fsWeeks)
  })
})

describe('Wer keiner Predigtdienstgruppe zugeordnet ist (ohneGruppe)', () => {
  const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: null, as: null }]
  const person = (id: string, over: Partial<Person> = {}): Person => ({
    id, fn: id, ln: id, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(), ...over,
  })

  it('nennt jeden ohne Gruppe, in der übergebenen Reihenfolge — und niemanden mit', () => {
    const liste = [person('c'), person('a', { grp: 'g1' }), person('b', { grp: null })]
    expect(ohneGruppe(liste, GRUPPEN).map((p) => p.id)).toEqual(['c', 'b'])
  })

  it('Älteste und Dienstamtgehilfen gehören genauso zu einer Gruppe', () => {
    const liste = [person('ae', { role: 'aeltester' }), person('dg', { role: 'dienstamtgehilfe' })]
    expect(ohneGruppe(liste, GRUPPEN).map((p) => p.id)).toEqual(['ae', 'dg'])
  })

  it('die Rolle „Keine" braucht keine Gruppe — Schüler ohne Verkündiger-Status', () => {
    const liste = [person('schueler', { role: 'keine' }), person('verk')]
    expect(ohneGruppe(liste, GRUPPEN).map((p) => p.id)).toEqual(['verk'])
  })

  it('ein Verweis auf eine Gruppe, die es nicht mehr gibt, zählt als keine Gruppe', () => {
    // Die Auswahl im Personen-Detail zeigt dann ebenfalls „—".
    const liste = [person('verwaist', { grp: 'g-geloescht' })]
    expect(ohneGruppe(liste, GRUPPEN).map((p) => p.id)).toEqual(['verwaist'])
  })

  it('ohne angelegte Gruppen gibt es nichts zu melden — zuordnen ließe sich ohnehin nichts', () => {
    expect(ohneGruppe([person('a'), person('b')], [])).toEqual([])
  })

  it('eine leere Versammlung meldet nichts', () => {
    expect(ohneGruppe([], GRUPPEN)).toEqual([])
  })
})
