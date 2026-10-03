import { describe, expect, it } from 'vitest'
import {
  eigenerHaushalt,
  eintraegeImZeitraum,
  eintragSetzen,
  gruppenVerteilen,
  neuerPlan,
  planFuerMich,
  planNachDatum,
  planStand,
  planTage,
  planWochen,
  plaeneZumAnsehen,
  weiterePlaeneImMenue,
  wochenDerGruppe,
} from './weitere-plaene'
import type { Group, PlanEintrag, WeitererPlan } from './types'

/**
 * **Weitere Pläne** (T120, Phase 5): Ankündigungen ohne Zuteilung. Geprüft
 * wird, wie ein neuer Plan aussieht, wie reihum verteilt wird, was ein
 * Zeitraum mitnimmt und — vor allem — wer was sehen darf (dieselbe Regel wie
 * `plan_sichtbar` in schema.sql).
 */

const HEUTE = new Date(2026, 8, 7, 9, 0) // Montag, 7. September 2026

const G: Group[] = ['g1', 'g2', 'g3', 'g4'].map((id, i) => ({ id, name: `Gruppe ${i + 1}`, overseerId: null, assistantId: null }))

const saal = (over: Partial<WeitererPlan> = {}): WeitererPlan => ({
  id: 'pl-s',
  vorlage: 'saal',
  name: 'Winterdienst',
  von: '2026-09-07',
  bis: '2026-10-04', // vier Wochen
  entwurf: false,
  ...over,
})
const familien = (over: Partial<WeitererPlan> = {}): WeitererPlan => ({
  id: 'pl-f',
  vorlage: 'familien',
  name: 'Besuch des Kreisaufsehers',
  von: '2026-09-22',
  bis: '2026-09-27',
  entwurf: false,
  ...over,
})
const gast = (datum: string, pid: string, mahlzeit: PlanEintrag['mahlzeit'] = 'mittag'): PlanEintrag => ({
  id: `e-${datum}-${mahlzeit}`,
  planId: 'pl-f',
  datum,
  grp: null,
  pid,
  mahlzeit,
})

let zaehler = 0
const neueId = () => `neu${++zaehler}`

describe('Ein neuer Plan', () => {
  it('Königreichssaal: ab dem Montag dieser Woche ein Vierteljahr, als Entwurf', () => {
    const mittwoch = new Date(2026, 8, 9, 10)
    expect(neuerPlan('p1', 'saal', mittwoch)).toEqual({
      id: 'p1',
      vorlage: 'saal',
      name: '',
      von: '2026-09-07',
      bis: '2026-12-06', // 13 Wochen, bis Sonntag
      entwurf: true,
    })
  })

  it('Familien reihum: ab heute eine Woche', () => {
    expect(neuerPlan('p2', 'familien', HEUTE)).toMatchObject({ von: '2026-09-07', bis: '2026-09-13', entwurf: true })
  })

  it('Wochen sind Montage, Tage jeder Tag — beides einschließlich des letzten', () => {
    expect(planWochen(saal())).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
    // Ein Zeitraum, der mitten in der Woche beginnt, nimmt deren Montag mit.
    expect(planWochen({ von: '2026-09-09', bis: '2026-09-15' })).toEqual(['2026-09-07', '2026-09-14'])
    expect(planTage(familien())).toHaveLength(6)
    expect(planTage(familien())[0]).toBe('2026-09-22')
  })
})

describe('Wo ein Plan steht', () => {
  it('aktuell, Entwurf oder abgeschlossen — vorbei geht vor', () => {
    expect(planStand(saal(), HEUTE)).toBe('aktuell')
    expect(planStand(saal({ entwurf: true }), HEUTE)).toBe('entwurf')
    expect(planStand(saal({ von: '2026-08-03', bis: '2026-09-06', entwurf: true }), HEUTE)).toBe('abgeschlossen')
    // Am letzten Tag läuft er noch.
    expect(planStand(saal({ bis: '2026-09-07' }), HEUTE)).toBe('aktuell')
  })

  it('der Zustand hält die Pläne nach Beginn', () => {
    expect(planNachDatum([saal({ id: 'b', von: '2026-10-05' }), saal({ id: 'a' })]).map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('Reihum verteilen (Königreichssaal)', () => {
  it('die Wochen ab dieser, die Gruppen der Reihe nach ab der gewählten', () => {
    const { eintraege, verteilt } = gruppenVerteilen({ plan: saal(), eintraege: [], groups: G, abGruppe: 'g3', heute: HEUTE, neueId })
    expect(verteilt).toBe(4)
    expect(eintraege.map((e) => `${e.datum} ${e.grp}`)).toEqual([
      '2026-09-07 g3',
      '2026-09-14 g4',
      '2026-09-21 g1',
      '2026-09-28 g2',
    ])
  })

  it('vergangene Wochen bleiben, wie sie sind', () => {
    const plan = saal({ von: '2026-08-24' })
    const alt: PlanEintrag = { id: 'alt', planId: plan.id, datum: '2026-08-31', grp: 'g4', pid: null, mahlzeit: null }
    const { eintraege } = gruppenVerteilen({ plan, eintraege: [alt], groups: G, abGruppe: 'g1', heute: HEUTE, neueId })
    expect(eintraege[0]).toBe(alt)
    expect(eintraege.map((e) => e.datum)).not.toContain('2026-08-24') // vergangen und leer: bleibt leer
  })

  it('ein Platz behält seine Kennung — die Datenbank kennt je Woche nur einen', () => {
    const da: PlanEintrag = { id: 'da', planId: 'pl-s', datum: '2026-09-14', grp: 'g1', pid: null, mahlzeit: null }
    const fremd: PlanEintrag = { ...da, id: 'fremd', planId: 'anderer' }
    const { eintraege } = gruppenVerteilen({ plan: saal(), eintraege: [da, fremd], groups: G, abGruppe: 'g1', heute: HEUTE, neueId })
    const woche = eintraege.find((e) => e.planId === 'pl-s' && e.datum === '2026-09-14')
    expect(woche).toMatchObject({ id: 'da', grp: 'g2' })
    // Andere Pläne bleiben unberührt — dieselbe Referenz.
    expect(eintraege).toContain(fremd)
  })

  it('ohne Gruppen gibt es nichts zu verteilen', () => {
    expect(gruppenVerteilen({ plan: saal(), eintraege: [], groups: [], abGruppe: 'g1', heute: HEUTE, neueId }).verteilt).toBe(0)
  })
})

describe('Einen Platz setzen', () => {
  const basis = [gast('2026-09-22', 'p1')]

  it('neu, geändert (mit derselben Kennung) oder geräumt', () => {
    const neu = eintragSetzen({ eintraege: basis, planId: 'pl-f', datum: '2026-09-22', mahlzeit: 'abend', grp: null, pid: 'p2', neueId })
    expect(neu).toHaveLength(2)
    const anders = eintragSetzen({ eintraege: basis, planId: 'pl-f', datum: '2026-09-22', mahlzeit: 'mittag', grp: null, pid: 'p3', neueId })
    expect(anders).toEqual([{ ...basis[0], pid: 'p3' }])
    const weg = eintragSetzen({ eintraege: basis, planId: 'pl-f', datum: '2026-09-22', mahlzeit: 'mittag', grp: null, pid: null, neueId })
    expect(weg).toEqual([])
  })

  it('bleibt alles, wie es war, kommt dieselbe Liste zurück — es geht nichts hinaus', () => {
    expect(eintragSetzen({ eintraege: basis, planId: 'pl-f', datum: '2026-09-22', mahlzeit: 'mittag', grp: null, pid: 'p1', neueId })).toBe(basis)
    expect(eintragSetzen({ eintraege: basis, planId: 'pl-f', datum: '2026-09-23', mahlzeit: 'mittag', grp: null, pid: null, neueId })).toBe(basis)
  })
})

describe('Ein anderer Zeitraum', () => {
  it('nimmt die Einträge außerhalb mit, die anderer Pläne nicht', () => {
    const drin = gast('2026-09-23', 'p1')
    const draussen = gast('2026-09-27', 'p2')
    const fremd = { ...draussen, id: 'fremd', planId: 'anderer' }
    expect(eintraegeImZeitraum([drin, draussen, fremd], familien({ bis: '2026-09-25' }))).toEqual([drin, fremd])
  })

  it('beim Königreichssaal zählt die Woche, in der der Zeitraum beginnt', () => {
    const montag: PlanEintrag = { id: 'm', planId: 'pl-s', datum: '2026-09-07', grp: 'g1', pid: null, mahlzeit: null }
    const liste = [montag]
    expect(eintraegeImZeitraum(liste, saal({ von: '2026-09-09' }))).toBe(liste)
  })
})

describe('Wer was sieht — wie `plan_sichtbar` in schema.sql', () => {
  const persons = [
    { id: 'p1', fam: 'h1' },
    { id: 'p2', fam: 'h1' }, // derselbe Haushalt wie p1
    { id: 'p3', fam: null },
  ]
  const eintraege = [gast('2026-09-22', 'p1')]

  it('Planer alles, auch Entwürfe', () => {
    expect(planFuerMich({ plan: familien({ entwurf: true }), eintraege, planner: true, me: undefined, persons })).toBe(true)
  })

  it('einen Entwurf sonst niemand', () => {
    expect(planFuerMich({ plan: saal({ entwurf: true }), eintraege, planner: false, me: persons[0], persons })).toBe(false)
  })

  it('den Königreichssaal jeder, Familien reihum nur Gastgeber und ihr Haushalt', () => {
    expect(planFuerMich({ plan: saal(), eintraege: [], planner: false, me: persons[2], persons })).toBe(true)
    expect(planFuerMich({ plan: familien(), eintraege, planner: false, me: persons[0], persons })).toBe(true)
    expect(planFuerMich({ plan: familien(), eintraege, planner: false, me: persons[1], persons })).toBe(true)
    expect(planFuerMich({ plan: familien(), eintraege, planner: false, me: persons[2], persons })).toBe(false)
    expect(planFuerMich({ plan: familien(), eintraege, planner: false, me: undefined, persons })).toBe(false)
  })

  it('ohne Haushalt zählt nur man selbst — `null` ist kein gemeinsamer Haushalt', () => {
    expect(eigenerHaushalt('p3', persons[2], persons)).toBe(true)
    expect(eigenerHaushalt('p3', { id: 'px', fam: null }, persons)).toBe(false)
  })

  it('beim Ansehen nur Veröffentlichtes, das läuft oder kommt — auch für Planer', () => {
    const plaene = [saal(), saal({ id: 'entwurf', entwurf: true }), saal({ id: 'alt', von: '2026-08-03', bis: '2026-09-06' })]
    const sicht = plaeneZumAnsehen({ plaene, eintraege: [], planner: true, me: undefined, persons, heute: HEUTE })
    expect(sicht.map((p) => p.id)).toEqual(['pl-s'])
  })

  it('der Menüpunkt: für Planer immer, sonst nur mit etwas zum Ansehen', () => {
    const args = { plaene: [familien()], eintraege, me: persons[2], persons, heute: HEUTE }
    expect(weiterePlaeneImMenue({ ...args, planner: true, plaene: [] })).toBe(true)
    expect(weiterePlaeneImMenue({ ...args, planner: false })).toBe(false)
    expect(weiterePlaeneImMenue({ ...args, planner: false, me: persons[1] })).toBe(true)
  })
})

describe('Deine Gruppe ist dran', () => {
  it('die Wochen einer Gruppe, nach Datum', () => {
    const e = (datum: string, grp: string): PlanEintrag => ({ id: datum, planId: 'pl-s', datum, grp, pid: null, mahlzeit: null })
    expect(wochenDerGruppe([e('2026-09-21', 'g1'), e('2026-09-07', 'g1'), e('2026-09-14', 'g2')], 'pl-s', 'g1')).toEqual([
      '2026-09-07',
      '2026-09-21',
    ])
  })
})
