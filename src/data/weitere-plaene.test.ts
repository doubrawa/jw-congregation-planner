import { describe, expect, it } from 'vitest'
import {
  beginntMit,
  eintraegeImZeitraum,
  eintragSetzen,
  gruppenVerteilen,
  neuerPlan,
  planNachDatum,
  planSpannen,
  planStand,
  plaeneZumAnsehen,
  spannenDerGruppe,
  spannenDerPerson,
  spannenImPlan,
  spanneVon,
  taktVon,
  taktWechseln,
  vorschauSpannen,
  weiterePlaeneImMenue,
  type Belegung,
} from './weitere-plaene'
import type { Group, PlanEintrag, WeitererPlan } from './types'

/**
 * **Weitere Pläne** (T120, Phase 5): Ankündigungen ohne Zuteilung. Geprüft
 * wird, wie ein neuer Plan aussieht, wie reihum verteilt wird, was ein
 * Zeitraum mitnimmt und wer was sehen darf (dieselbe Regel wie
 * `plan_sichtbar` in schema.sql).
 */

const HEUTE = new Date(2026, 8, 7, 9, 0) // Montag, 7. September 2026

const G: Group[] = ['g1', 'g2', 'g3', 'g4'].map((id, i) => ({ id, name: `Gruppe ${i + 1}`, overseerId: null, assistantId: null }))

const saal = (over: Partial<WeitererPlan> = {}): WeitererPlan => ({
  id: 'pl-s',
  name: 'Winterdienst',
  von: '2026-09-07',
  bis: '2026-10-04', // vier Wochen
  entwurf: false,
  ...over,
})
const woche = (datum: string, grp: string | null, id = `e-${datum}`): PlanEintrag => ({ id, planId: 'pl-s', datum, grp })

let zaehler = 0
const neueId = () => `neu${++zaehler}`

describe('Ein neuer Plan', () => {
  it('ab dem Montag dieser Woche ein Vierteljahr, als Entwurf', () => {
    const mittwoch = new Date(2026, 8, 9, 10)
    expect(neuerPlan('p1', mittwoch)).toEqual({
      id: 'p1',
      name: '',
      von: '2026-09-07',
      bis: '2026-12-06', // 13 Wochen, bis Sonntag
      entwurf: true,
    })
  })

  it('Wochen sind Montage — einschließlich der letzten', () => {
    expect(planSpannen(saal())).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
    // Ein Zeitraum, der mitten in der Woche beginnt, nimmt deren Montag mit.
    expect(planSpannen({ von: '2026-09-09', bis: '2026-09-15' })).toEqual(['2026-09-07', '2026-09-14'])
  })

  it('ohne Takt wechselt er wöchentlich — so steht jeder ältere Plan da', () => {
    expect(taktVon(saal())).toBe('woche')
    expect(taktVon(saal({ takt: 'monat' }))).toBe('monat')
  })
})

/**
 * **Der Takt** (4.10.2026, Betreiber: „den Takt soll wählbar sein"): je Woche
 * oder je Kalendermonat eine Gruppe. Ein Monat steht als sein Erster in den
 * Einträgen, eine Woche gehört zu dem Monat, in dem sie beginnt.
 */
describe('Monatstakt', () => {
  const monatlich = (over: Partial<WeitererPlan> = {}) => saal({ takt: 'monat', von: '2026-09-15', bis: '2026-12-31', ...over })

  it('die Monate eines Plans als Monatserste — der erste ist der, in dem er beginnt', () => {
    expect(planSpannen(monatlich())).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'])
  })

  it('über den Jahreswechsel, und ein Ende am Monatsersten nimmt diesen Monat noch mit', () => {
    expect(planSpannen(monatlich({ von: '2026-11-10', bis: '2027-02-01' }))).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ])
  })

  it('die Spanne eines Tages: sein Montag oder sein Monatserster', () => {
    expect(spanneVon('woche', '2026-10-01')).toBe('2026-09-28')
    expect(spanneVon('monat', '2026-10-31')).toBe('2026-10-01')
  })

  it('reihum verteilen wechselt die Gruppe je Monat, ab dem laufenden', () => {
    const plan = monatlich({ von: '2026-08-01' })
    const alt = { ...woche('2026-08-01', 'g4', 'alt') }
    const { eintraege, verteilt } = gruppenVerteilen({ plan, eintraege: [alt], groups: G, abGruppe: 'g2', heute: HEUTE, neueId })
    // Heute ist der 7. September: Der August ist vorbei und bleibt, der September läuft.
    expect(verteilt).toBe(4)
    expect(eintraege.map((e) => `${e.datum} ${e.grp}`)).toEqual([
      '2026-08-01 g4',
      '2026-09-01 g2',
      '2026-10-01 g3',
      '2026-11-01 g4',
      '2026-12-01 g1',
    ])
  })

  it('ein Montag ist kein Monat — ein Eintrag neben dem Takt geht mit', () => {
    const monat = woche('2026-10-01', 'g1')
    const montag = woche('2026-10-05', 'g2')
    expect(eintraegeImZeitraum([monat, montag], monatlich())).toEqual([monat])
    // Gegenprobe: Der Monat, in dem der Zeitraum beginnt, gehört ganz dazu.
    const september = [woche('2026-09-01', 'g3')]
    expect(eintraegeImZeitraum(september, monatlich())).toBe(september)
  })
})

/**
 * **Den Takt wechseln: dieselbe Reihenfolge, ein anderer Takt.** Heute ist
 * Montag, der 7. September 2026 — vor ihm liegt Vergangenes, ab ihm wird neu
 * verteilt.
 */
describe('Den Takt wechseln', () => {
  const fremd: PlanEintrag = { id: 'fremd', planId: 'anderer', datum: '2026-09-07', grp: 'g1' }
  const wechseln = (plan: WeitererPlan, eintraege: PlanEintrag[]) =>
    taktWechseln({ plan, eintraege, groups: G, heute: HEUTE, neueId })
  const zeilen = (liste: readonly PlanEintrag[]) => liste.filter((e) => e.planId === 'pl-s').map((e) => `${e.datum} ${e.grp}`)

  it('Woche → Monat: reihum weiter, ab dem laufenden Monat, mit der Gruppe dieser Woche', () => {
    // Wöchentlich reihum verteilt: g3, g4, g1, g2, g3 … Eine Umrechnung
    // Woche für Woche ergäbe hier g3, g4, g4 — die Reihe ginge verloren.
    const plan = saal({ takt: 'monat', von: '2026-09-07', bis: '2026-11-29' })
    const reihum = ['g3', 'g4', 'g1', 'g2']
    const alt = planSpannen({ ...plan, takt: 'woche' }).map((w, i) => woche(w, reihum[i % 4]!))
    const { eintraege, verteilt } = wechseln(plan, [...alt, fremd])
    expect(zeilen(eintraege)).toEqual(['2026-09-01 g3', '2026-10-01 g4', '2026-11-01 g1'])
    expect(verteilt).toBe(3)
    expect(eintraege).toContain(fremd) // ein anderer Plan bleibt, wie er ist
  })

  it('Monat → Woche: reihum weiter, ab dieser Woche, mit der Gruppe dieses Monats', () => {
    const plan = saal({ takt: 'woche', von: '2026-09-07', bis: '2026-10-04' })
    const alt = [woche('2026-09-01', 'g2'), woche('2026-10-01', 'g3')]
    expect(zeilen(wechseln(plan, alt).eintraege)).toEqual([
      '2026-09-07 g2',
      '2026-09-14 g3',
      '2026-09-21 g4',
      '2026-09-28 g1',
    ])
  })

  it('Vergangenes geht ins neue Raster über, ohne dass eine Gruppe dazuerfunden wird', () => {
    // Juli und August sind vorbei: Aus jedem Monat werden seine Wochen mit
    // seiner Gruppe. Ab dem 7. September wird neu verteilt.
    const plan = saal({ takt: 'woche', von: '2026-07-06', bis: '2026-09-13' })
    const alt = [woche('2026-07-01', 'g1'), woche('2026-08-01', null), woche('2026-09-01', 'g4')]
    expect(zeilen(wechseln(plan, alt).eintraege)).toEqual([
      '2026-07-06 g1',
      '2026-07-13 g1',
      '2026-07-20 g1',
      '2026-07-27 g1',
      // August: Gruppe gelöscht — da steht nichts, und es kommt nichts dazu.
      '2026-09-07 g4',
    ])
  })

  it('ohne Einteilung ab jetzt wird nichts verteilt — ein Entwurf bleibt leer', () => {
    const plan = saal({ takt: 'monat', entwurf: true })
    expect(wechseln(plan, [])).toEqual({ eintraege: [], verteilt: 0 })
    // Auch nicht, wenn nur Vergangenes dasteht: Das geht ins neue Raster, mehr nicht.
    const vorbei = wechseln(saal({ takt: 'monat', von: '2026-07-06', bis: '2026-08-30' }), [woche('2026-07-06', 'g2')])
    expect(vorbei.verteilt).toBe(0)
    expect(zeilen(vorbei.eintraege)).toEqual(['2026-07-01 g2'])
  })

  it('ein Eintrag, dessen Tag bleibt, behält seine Kennung — die Datenbank kennt je Tag nur einen', () => {
    // Montag, 1. Juni 2026 — Wochenanfang und Monatserster zugleich.
    const juni = woche('2026-06-01', 'g3', 'juni')
    const plan = saal({ takt: 'woche', von: '2026-06-01', bis: '2026-06-14' })
    const { eintraege } = taktWechseln({ plan, eintraege: [juni], groups: G, heute: new Date(2026, 5, 1, 9), neueId })
    expect(eintraege[0]).toBe(juni)
    expect(zeilen(eintraege)).toEqual(['2026-06-01 g3', '2026-06-08 g4'])
  })

  it('hin und zurück bleibt eine Monatsreihe, wie sie war', () => {
    const monate = saal({ takt: 'monat', von: '2026-09-01', bis: '2026-11-30' })
    const start = [woche('2026-09-01', 'g1'), woche('2026-10-01', 'g2'), woche('2026-11-01', 'g3')]
    const wochen = wechseln({ ...monate, takt: 'woche' }, start).eintraege
    expect(zeilen(wechseln(monate, wochen).eintraege)).toEqual(zeilen(start))
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

describe('Reihum verteilen', () => {
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
    const alt = woche('2026-08-31', 'g4', 'alt')
    const { eintraege } = gruppenVerteilen({ plan, eintraege: [alt], groups: G, abGruppe: 'g1', heute: HEUTE, neueId })
    expect(eintraege[0]).toBe(alt)
    expect(eintraege.map((e) => e.datum)).not.toContain('2026-08-24') // vergangen und leer: bleibt leer
  })

  it('ein Platz behält seine Kennung — die Datenbank kennt je Woche nur einen', () => {
    const da = woche('2026-09-14', 'g1', 'da')
    const fremd: PlanEintrag = { ...da, id: 'fremd', planId: 'anderer' }
    const { eintraege } = gruppenVerteilen({ plan: saal(), eintraege: [da, fremd], groups: G, abGruppe: 'g1', heute: HEUTE, neueId })
    expect(eintraege.find((e) => e.planId === 'pl-s' && e.datum === '2026-09-14')).toMatchObject({ id: 'da', grp: 'g2' })
    // Andere Pläne bleiben unberührt — dieselbe Referenz.
    expect(eintraege).toContain(fremd)
  })

  it('was schon so dasteht, behält seine Referenz — der Speicherweg schreibt es nicht noch einmal', () => {
    const da = woche('2026-09-07', 'g1', 'da')
    const { eintraege } = gruppenVerteilen({ plan: saal(), eintraege: [da], groups: G, abGruppe: 'g1', heute: HEUTE, neueId })
    expect(eintraege.find((e) => e.datum === '2026-09-07')).toBe(da)
  })

  it('ohne Gruppen gibt es nichts zu verteilen', () => {
    expect(gruppenVerteilen({ plan: saal(), eintraege: [], groups: [], abGruppe: 'g1', heute: HEUTE, neueId }).verteilt).toBe(0)
  })
})

/**
 * **Gruppen aus der Reinigung genommen** (18.10.2026): Was im Blatt der
 * Reinigung abgeschaltet ist, ist auch im Königreichssaal nie dran.
 */
describe('Reihum verteilen ohne herausgenommene Gruppen', () => {
  const ohneG2 = G.map((g) => (g.id === 'g2' ? { ...g, ohneReinigung: true } : g))
  const verteilen = (groups: Group[], abGruppe: string) =>
    gruppenVerteilen({ plan: saal(), eintraege: [], groups, abGruppe, heute: HEUTE, neueId }).eintraege.map((e) => e.grp)

  it('eine herausgenommene Gruppe ist in keiner Woche dran — die übrigen der Reihe nach', () => {
    expect(verteilen(ohneG2, 'g1')).toEqual(['g1', 'g3', 'g4', 'g1'])
  })

  it('beginnt die Reihe bei ihr, übernimmt die nächste nach ihr', () => {
    // So beim Wechsel des Takts, wenn gerade sie dran war (`taktWechseln`).
    expect(verteilen(ohneG2, 'g2')).toEqual(['g3', 'g4', 'g1', 'g3'])
    const ohneG4 = G.map((g) => (g.id === 'g4' ? { ...g, ohneReinigung: true } : g))
    expect(verteilen(ohneG4, 'g4'), 'nach der letzten wieder die erste').toEqual(['g1', 'g2', 'g3', 'g1'])
  })

  it('sind alle herausgenommen, wird nichts verteilt', () => {
    const alle = G.map((g) => ({ ...g, ohneReinigung: true }))
    const vorher = [woche('2026-09-14', 'g1')]
    expect(gruppenVerteilen({ plan: saal(), eintraege: vorher, groups: alle, abGruppe: 'g1', heute: HEUTE, neueId })).toEqual({
      eintraege: vorher,
      verteilt: 0,
    })
  })

  it('auch der Wechsel des Takts lässt sie aus', () => {
    // Wöchentlich: g2 ist diese Woche dran, dann herausgenommen worden.
    const plan = saal({ takt: 'monat', von: '2026-09-07', bis: '2026-11-29' })
    const alt = planSpannen({ ...plan, takt: 'woche' }).map((w, i) => woche(w, ['g2', 'g3', 'g4', 'g1'][i % 4]!))
    const { eintraege } = taktWechseln({ plan, eintraege: alt, groups: ohneG2, heute: HEUTE, neueId })
    expect(eintraege.map((e) => `${e.datum} ${e.grp}`)).toEqual(['2026-09-01 g3', '2026-10-01 g4', '2026-11-01 g1'])
  })
})

/**
 * **„Beginnen mit"** (T121, `GPlaenePlanen`): Gedrückt steht die Gruppe, mit
 * der die Reihe ab jetzt beginnt — dort, wo `gruppenVerteilen` anfinge.
 */
describe('Womit die Reihe beginnt', () => {
  const TAG = '2026-09-09' // Mittwoch derselben Woche

  it('die Gruppe der laufenden Woche — nicht die der ersten Woche des Plans', () => {
    const plan = saal({ von: '2026-08-24' })
    const eintraege = [woche('2026-08-24', 'g4'), woche('2026-08-31', 'g1'), woche('2026-09-07', 'g2'), woche('2026-09-14', 'g3')]
    expect(beginntMit(plan, eintraege, TAG)).toBe('g2')
  })

  it('ein Plan, der erst kommt, beginnt mit seiner ersten Woche', () => {
    const plan = saal({ von: '2026-10-05', bis: '2026-10-25' })
    expect(beginntMit(plan, [woche('2026-10-05', 'g3'), woche('2026-10-12', 'g4')], TAG)).toBe('g3')
  })

  it('im Monatstakt der laufende Monat', () => {
    const plan = saal({ von: '2026-08-01', bis: '2026-10-31', takt: 'monat' })
    expect(beginntMit(plan, [woche('2026-08-01', 'g1'), woche('2026-09-01', 'g2')], TAG)).toBe('g2')
  })

  it('keine, wo die laufende Woche leer ist, der Plan einem anderen gehört oder vorbei ist', () => {
    expect(beginntMit(saal(), [woche('2026-09-14', 'g1')], TAG)).toBeNull()
    expect(beginntMit(saal(), [{ ...woche('2026-09-07', 'g1'), planId: 'anderer' }], TAG)).toBeNull()
    const vorbei = saal({ von: '2026-08-03', bis: '2026-08-30' })
    expect(beginntMit(vorbei, [woche('2026-08-24', 'g1')], TAG)).toBeNull()
  })
})

describe('Die Vorschau eines Plans', () => {
  const dreizehn = planSpannen(saal({ von: '2026-08-24', bis: '2026-11-22' }))

  it('zugeklappt die nächsten fünf ab der laufenden — Vergangenes nicht', () => {
    expect(vorschauSpannen(dreizehn, '2026-09-07')).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ])
  })

  it('gegen Ende, was übrig ist', () => {
    expect(vorschauSpannen(dreizehn, '2026-11-09')).toEqual(['2026-11-09', '2026-11-16'])
  })

  it('ist der Plan vorbei, alle — sonst bliebe die Vorschau leer', () => {
    expect(vorschauSpannen(dreizehn, '2026-12-07')).toEqual(dreizehn)
  })
})

describe('Eine Woche belegen', () => {
  const basis = [woche('2026-09-07', 'g1')]
  const setzen = (eintraege: PlanEintrag[], datum: string, belegung: Belegung) =>
    eintragSetzen({ eintraege, planId: 'pl-s', datum, belegung, neueId })

  it('neu, geändert (mit derselben Kennung) oder geräumt', () => {
    const neu = setzen(basis, '2026-09-14', { grp: 'g2' })
    expect(neu).toHaveLength(2)
    const anders = setzen(basis, '2026-09-07', { grp: 'g3' })
    expect(anders).toEqual([{ ...basis[0], grp: 'g3' }])
    const weg = setzen(basis, '2026-09-07', null)
    expect(weg).toEqual([])
  })

  it('bleibt alles, wie es war, kommt dieselbe Liste zurück — es geht nichts hinaus', () => {
    expect(setzen(basis, '2026-09-07', { grp: 'g1' })).toBe(basis)
    expect(setzen(basis, '2026-09-14', null)).toBe(basis)
    const person = [{ ...woche('2026-09-07', null), pid: 'p1' }]
    expect(setzen(person, '2026-09-07', { pid: 'p1' })).toBe(person)
    const aus = [{ ...woche('2026-09-07', null), aus: true }]
    expect(setzen(aus, '2026-09-07', { aus: true })).toBe(aus)
  })

  it('dieselbe Woche eines anderen Plans bleibt unberührt', () => {
    const fremd: PlanEintrag = { ...basis[0]!, id: 'fremd', planId: 'anderer' }
    const liste = [fremd]
    const neu = setzen(liste, '2026-09-07', { grp: 'g2' })
    expect(neu).toHaveLength(2)
    expect(neu[0]).toBe(fremd)
  })

  /**
   * **Eine Person statt einer Gruppe** (31.10.2026, Betreiber: „einzelne
   * Personen einzuplanen und nicht nur Gruppen"): Gruppe und Person schließen
   * einander aus, wie in der Datenbank (`plan_eintraege_wer`).
   */
  it('eine Person ersetzt die Gruppe und umgekehrt — mit derselben Kennung', () => {
    const person = setzen(basis, '2026-09-07', { pid: 'p1' })
    expect(person).toEqual([{ id: 'e-2026-09-07', planId: 'pl-s', datum: '2026-09-07', grp: null, pid: 'p1' }])
    expect(setzen(person, '2026-09-07', { grp: 'g2' })).toEqual([{ id: 'e-2026-09-07', planId: 'pl-s', datum: '2026-09-07', grp: 'g2' }])
    expect(setzen(person, '2026-09-07', { pid: 'p2' })[0]).toMatchObject({ grp: null, pid: 'p2' })
  })

  /**
   * **Auslassen** (31.10.2026, „Wochen/Monate auslassen können durch Löschen —
   * so wie es auch bei der Planung von Gruppenbesuchen ist"): Die Woche bleibt
   * als Eintrag, ohne Gruppe und Person; räumen holt sie offen zurück.
   */
  it('ausgelassen hat weder Gruppe noch Person — und räumen holt die Woche zurück', () => {
    const person = setzen(basis, '2026-09-07', { pid: 'p1' })
    const aus = setzen(person, '2026-09-07', { aus: true })
    expect(aus).toEqual([{ id: 'e-2026-09-07', planId: 'pl-s', datum: '2026-09-07', grp: null, aus: true }])
    expect(setzen(aus, '2026-09-07', null)).toEqual([])
    // Auch eine Woche ohne Eintrag lässt sich auslassen.
    expect(setzen([], '2026-09-14', { aus: true })[0]).toMatchObject({ datum: '2026-09-14', grp: null, aus: true })
  })
})

/**
 * **Was zum Plan gehört**: Ausgelassene Wochen fehlen beim Ansehen und im
 * Druck; beim Planen stehen sie weiter da (`planSpannen`).
 */
describe('Ausgelassene Wochen', () => {
  const aus = (datum: string): PlanEintrag => ({ ...woche(datum, null), aus: true })

  it('fehlen in den Spannen des Plans — die übrigen bleiben, auch offene', () => {
    expect(spannenImPlan(saal(), [woche('2026-09-07', 'g1'), aus('2026-09-14')])).toEqual(['2026-09-07', '2026-09-21', '2026-09-28'])
    // Gegenprobe: dieselbe Woche eines anderen Plans lässt nichts aus.
    expect(spannenImPlan(saal(), [{ ...aus('2026-09-14'), planId: 'anderer' }])).toEqual(planSpannen(saal()))
  })

  it('reihum verteilen geht an ihnen und an Personen vorbei — die nächste Gruppe ist eine Woche später dran', () => {
    const ausgelassen = aus('2026-09-14')
    const person = { ...woche('2026-09-21', null), pid: 'p1' }
    const { eintraege, verteilt } = gruppenVerteilen({
      plan: saal(),
      eintraege: [ausgelassen, person],
      groups: G,
      abGruppe: 'g1',
      heute: HEUTE,
      neueId,
    })
    expect(verteilt).toBe(2)
    expect(eintraege.map((e) => `${e.datum} ${e.grp ?? e.pid ?? (e.aus ? 'aus' : '-')}`)).toEqual([
      '2026-09-07 g1',
      '2026-09-14 aus',
      '2026-09-21 p1',
      '2026-09-28 g2',
    ])
    expect(eintraege).toContain(ausgelassen)
    expect(eintraege).toContain(person)
  })

  it('„Beginnen mit" zeigt die Gruppe der ersten Woche, durch die die Reihe geht', () => {
    const eintraege = [aus('2026-09-07'), { ...woche('2026-09-14', null), pid: 'p1' }, woche('2026-09-21', 'g3')]
    expect(beginntMit(saal(), eintraege, '2026-09-09')).toBe('g3')
    // Gegenprobe: ohne die beiden ist die laufende Woche die erste — und leer.
    expect(beginntMit(saal(), [woche('2026-09-21', 'g3')], '2026-09-09')).toBeNull()
  })
})

/**
 * **Den Takt wechseln mit Personen und Auslassen**: Was vorbei ist, geht mit
 * ins neue Raster; ab jetzt zählt die Reihe — eine Person oder eine
 * ausgelassene Spanne meinte das alte Raster.
 */
describe('Den Takt wechseln mit Personen und ausgelassenen Spannen', () => {
  const zeilen = (liste: readonly PlanEintrag[]) =>
    liste.map((e) => `${e.datum} ${e.grp ?? e.pid ?? (e.aus ? 'aus' : '-')}`)

  it('Monat → Woche: ein vergangener Monat mit Person oder ausgelassen gibt das seinen Wochen weiter', () => {
    const plan = saal({ takt: 'woche', von: '2026-07-06', bis: '2026-09-13' })
    const alt = [{ ...woche('2026-07-01', null), pid: 'p1' }, { ...woche('2026-08-01', null), aus: true }, woche('2026-09-01', 'g4')]
    expect(zeilen(taktWechseln({ plan, eintraege: alt, groups: G, heute: HEUTE, neueId }).eintraege)).toEqual([
      '2026-07-06 p1',
      '2026-07-13 p1',
      '2026-07-20 p1',
      '2026-07-27 p1',
      '2026-08-03 aus',
      '2026-08-10 aus',
      '2026-08-17 aus',
      '2026-08-24 aus',
      '2026-08-31 aus',
      '2026-09-07 g4',
    ])
  })

  it('Woche → Monat: ein vergangener Monat nimmt seine erste Woche mit Gruppe oder Person — nicht die ausgelassene', () => {
    const plan = saal({ takt: 'monat', von: '2026-08-03', bis: '2026-09-27' })
    const alt = [{ ...woche('2026-08-03', null), aus: true }, { ...woche('2026-08-10', null), pid: 'p1' }, woche('2026-09-07', 'g2')]
    expect(zeilen(taktWechseln({ plan, eintraege: alt, groups: G, heute: HEUTE, neueId }).eintraege)).toEqual([
      '2026-08-01 p1',
      '2026-09-01 g2',
    ])
  })

  it('Woche → Monat: ein vergangener Monat, dessen Wochen alle ausgelassen waren, bleibt ausgelassen', () => {
    // Sonst stünde der Sommer, den der Planer gestrichen hat, wieder als offene Zeile auf dem Bogen.
    const plan = saal({ takt: 'monat', von: '2026-08-03', bis: '2026-09-27' })
    const august = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].map((d) => ({ ...woche(d, null), aus: true }))
    const wechseln = (alt: PlanEintrag[]) => zeilen(taktWechseln({ plan, eintraege: alt, groups: G, heute: HEUTE, neueId }).eintraege)
    expect(wechseln([...august, woche('2026-09-07', 'g2')])).toEqual(['2026-08-01 aus', '2026-09-01 g2'])
    // Gegenprobe: Ist eine Woche nur offen, ist es der Monat auch — ausgelassen hat ihn niemand.
    expect(wechseln([...august.slice(1), woche('2026-09-07', 'g2')])).toEqual(['2026-09-01 g2'])
  })

  it('ab jetzt nur die Reihe: Person und Auslassen auf einem Tag des neuen Rasters gehen, die Kennung bleibt', () => {
    // Montag, 1. Juni 2026 — Wochenanfang und Monatserster zugleich.
    const plan = saal({ takt: 'monat', von: '2026-06-01', bis: '2026-07-31' })
    const alt = [woche('2026-05-25', 'g1'), { ...woche('2026-06-01', null, 'juni'), pid: 'p1' }]
    // Heute ist Mittwoch, der 27. Mai: Diese Woche ist g1 dran, also beginnt der Juni mit ihr.
    const { eintraege } = taktWechseln({ plan, eintraege: alt, groups: G, heute: new Date(2026, 4, 27, 9), neueId })
    expect(eintraege.find((e) => e.datum === '2026-06-01')).toEqual({ id: 'juni', planId: 'pl-s', datum: '2026-06-01', grp: 'g1' })
  })
})

describe('Ein anderer Zeitraum', () => {
  it('nimmt die Wochen außerhalb mit, die anderer Pläne nicht', () => {
    const drin = woche('2026-09-14', 'g1')
    const draussen = woche('2026-09-28', 'g2')
    const fremd: PlanEintrag = { ...draussen, id: 'fremd', planId: 'anderer' }
    expect(eintraegeImZeitraum([drin, draussen, fremd], saal({ bis: '2026-09-20' }))).toEqual([drin, fremd])
  })

  it('es zählt die Woche, in der der Zeitraum beginnt', () => {
    const liste = [woche('2026-09-07', 'g1')]
    expect(eintraegeImZeitraum(liste, saal({ von: '2026-09-09' }))).toBe(liste)
  })
})

describe('Wer was sieht — wie `plan_sichtbar` in schema.sql', () => {
  it('beim Ansehen nur Veröffentlichtes, das läuft oder kommt — auch für Planer', () => {
    const plaene = [saal(), saal({ id: 'entwurf', entwurf: true }), saal({ id: 'alt', von: '2026-08-03', bis: '2026-09-06' })]
    expect(plaeneZumAnsehen(plaene, HEUTE).map((p) => p.id)).toEqual(['pl-s'])
  })

  it('der Menüpunkt: für Admin und Planer immer, sonst nur mit etwas zum Ansehen', () => {
    expect(weiterePlaeneImMenue({ plaene: [], zuteilen: true, heute: HEUTE })).toBe(true)
    expect(weiterePlaeneImMenue({ plaene: [saal()], zuteilen: false, heute: HEUTE })).toBe(true)
    // Ein Entwurf allein bringt den Menüpunkt nicht — ihn sehen nur Admin und Planer.
    expect(weiterePlaeneImMenue({ plaene: [saal({ entwurf: true })], zuteilen: false, heute: HEUTE })).toBe(false)
  })
})

describe('Deine Gruppe ist dran', () => {
  it('die Wochen einer Gruppe, nach Datum', () => {
    expect(spannenDerGruppe([woche('2026-09-21', 'g1'), woche('2026-09-07', 'g1'), woche('2026-09-14', 'g2')], 'pl-s', 'g1')).toEqual([
      '2026-09-07',
      '2026-09-21',
    ])
  })

  it('du bist dran: die Wochen einer Person, nach Datum — nicht die ihrer Gruppe', () => {
    const eintraege = [{ ...woche('2026-09-21', null), pid: 'p1' }, woche('2026-09-07', 'g1'), { ...woche('2026-09-14', null), pid: 'p1' }]
    expect(spannenDerPerson(eintraege, 'pl-s', 'p1')).toEqual(['2026-09-14', '2026-09-21'])
    expect(spannenDerPerson(eintraege, 'anderer', 'p1')).toEqual([])
  })
})
