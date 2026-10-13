import { describe, expect, it } from 'vitest'
import { buildFsWeeks } from './fs'
import {
  besuchAustragen,
  besuchEintragen,
  besucheInNeueWoche,
  besuchHatKonflikt,
  besuchsMonat,
  besuchStand,
  besuchsWochenAuswahl,
  besuchVorschlag,
  nachWoche,
  type BesuchsLage,
} from './gruppenbesuche'
import { emptyQualifications } from './helpers'
import { montagNach } from './meeting-dates'
import type { Absence, FsInstance, FsRule, Group, Gruppenbesuch, Person } from './types'

/**
 * **Gruppenbesuche des Dienstaufsehers** (T120, Phase 2).
 *
 * Gemessen am od (Kap. 5 Abs. 36): Der Dienstaufseher besucht jeden Monat an
 * einem Wochenende eine andere Gruppe und leitet dann ihre Zusammenkünfte für
 * den Predigtdienst. Geprüft wird, dass der Besuch genau dort einträgt, wie er
 * seinen Stand meldet — samt dem ersten Samstag, an dem sich die Gruppen
 * nicht treffen — und was beim Anlegen eines neuen vorgeschlagen wird.
 */

/** Montag der ersten geladenen Woche; die Uhr der Proben steht auf ihm. */
const MONTAG_0 = '2026-09-07'
const HEUTE = new Date(2026, 8, 7, 9, 0)
/** Acht geladene Wochen: 7. September bis 26. Oktober 2026. */
const KENN = Array.from({ length: 8 }, (_unused, i) => montagNach(MONTAG_0, i))

/** Versammlung Mo/Mi wöchentlich und am 1. Samstag; je Gruppe samstags, außer am 1. Samstag. */
const RULES: FsRule[] = [
  { id: 'r1', grp: null, wd: 1, time: '14:00', place: 'Saal', monthly: 0, skipCong: false },
  { id: 'r3', grp: null, wd: 6, time: '09:30', place: 'Saal', monthly: 1, skipCong: false },
  { id: 'r4', grp: 'g1', wd: 6, time: '09:30', place: 'Bei A', monthly: 0, skipCong: true },
  { id: 'r5', grp: 'g2', wd: 6, time: '09:15', place: 'Nebenraum', monthly: 0, skipCong: true },
  { id: 'r6', grp: 'g3', wd: 6, time: '10:00', place: 'Video', monthly: 0, skipCong: true },
  { id: 'r7', grp: 'g4', wd: 6, time: '09:30', place: 'Bei V', monthly: 0, skipCong: true },
]

const GRUPPEN: Group[] = ['g1', 'g2', 'g3', 'g4'].map((id) => ({ id, name: id, overseerId: null, assistantId: null }))

function person(id: string, fn: string, ln: string): Person {
  return { id, fn, ln, role: 'aeltester', tel: '', mail: '', priv: { ...emptyQualifications(), treffpunkt: true } }
}
const KONRAD = person('p5', 'Konrad', 'Sommer')
const JONAS = person('p6', 'Jonas', 'Berger')
const PERSONEN = [KONRAD, JONAS]

const besuch = (woche: string, grp: string, pid: string | null = KONRAD.id, id = `b-${woche}-${grp}`): Gruppenbesuch => ({
  id,
  woche,
  grp,
  pid,
})

const wochen = (): FsInstance[][] => buildFsWeeks(KENN, RULES)
const lage = (fsWeeks: FsInstance[][] = wochen(), absences: Absence[] = []): BesuchsLage => ({
  kennungen: KENN,
  fsWeeks,
  fsRules: RULES,
  absences,
})
/** Der Gruppen-Treffpunkt einer geladenen Woche. */
const treffpunkt = (fsWeeks: FsInstance[][], woche: string, grp: string): FsInstance | undefined =>
  fsWeeks[KENN.indexOf(woche)]?.find((inst) => inst.grp === grp)

describe('Eintragen in den Treffpunkt der Gruppe', () => {
  it('ein freier Treffpunkt bekommt den Besucher — mit Person, nicht nur dem Namen', () => {
    const neu = besuchEintragen(wochen(), KENN, besuch('2026-09-14', 'g1'), PERSONEN)
    expect(treffpunkt(neu, '2026-09-14', 'g1')).toMatchObject({ leader: 'Konrad Sommer', lpid: 'p5' })
    // Die anderen Treffpunkte der Woche bleiben, wie sie sind.
    expect(treffpunkt(neu, '2026-09-14', 'g2')?.leader).toBe('')
  })

  it('einen anderen Leiter ersetzt er nicht ungefragt — erst mit „Übernehmen"', () => {
    const vorher = besuchEintragen(wochen(), KENN, besuch('2026-09-14', 'g1', JONAS.id), PERSONEN)
    const nachher = besuchEintragen(vorher, KENN, besuch('2026-09-14', 'g1'), PERSONEN)
    expect(nachher).toBe(vorher)
    const uebernommen = besuchEintragen(vorher, KENN, besuch('2026-09-14', 'g1'), PERSONEN, true)
    expect(treffpunkt(uebernommen, '2026-09-14', 'g1')).toMatchObject({ leader: 'Konrad Sommer', lpid: 'p5' })
  })

  it('ohne geladene Woche, ohne Besucher oder schon eingetragen: dieselbe Referenz', () => {
    const fsWeeks = wochen()
    expect(besuchEintragen(fsWeeks, KENN, besuch('2026-11-09', 'g3'), PERSONEN)).toBe(fsWeeks)
    expect(besuchEintragen(fsWeeks, KENN, besuch('2026-09-14', 'g1', null), PERSONEN)).toBe(fsWeeks)
    const einmal = besuchEintragen(fsWeeks, KENN, besuch('2026-09-14', 'g1'), PERSONEN)
    expect(besuchEintragen(einmal, KENN, besuch('2026-09-14', 'g1'), PERSONEN)).toBe(einmal)
  })

  it('nur die Woche des Besuchs ändert sich — die übrigen behalten ihre Referenz', () => {
    // Daran erkennt persist.ts, welche Wochen zu schreiben sind.
    const fsWeeks = wochen()
    const neu = besuchEintragen(fsWeeks, KENN, besuch('2026-09-14', 'g1'), PERSONEN)
    expect(neu.filter((w, i) => w !== fsWeeks[i])).toHaveLength(1)
  })

  it('austragen macht nur den Platz frei, den der Besucher hält', () => {
    const b = besuch('2026-09-14', 'g1')
    const eingetragen = besuchEintragen(wochen(), KENN, b, PERSONEN)
    expect(treffpunkt(besuchAustragen(eingetragen, KENN, b), '2026-09-14', 'g1')).toMatchObject({ leader: '' })
    expect(treffpunkt(besuchAustragen(eingetragen, KENN, b), '2026-09-14', 'g1')?.lpid).toBeUndefined()
    // Leitet dort jemand anderes, kam er nicht durch den Besuch — er bleibt.
    const fremd = besuchEintragen(wochen(), KENN, besuch('2026-09-14', 'g1', JONAS.id), PERSONEN)
    expect(besuchAustragen(fremd, KENN, b)).toBe(fremd)
  })

  it('leitete der Besucher den Treffpunkt schon vorher, geht er trotzdem mit (entschieden am 3.10.2026)', () => {
    // Etwa aus der Auto-Zuteilung: Eingetragen wird dann nichts (der Platz ist
    // schon seiner), ausgetragen aber doch — ein Platz merkt sich nicht, woher
    // sein Leiter kam. Der Planer sieht den leeren Platz und besetzt ihn neu.
    const schonSeiner = besuchEintragen(wochen(), KENN, besuch('2026-09-14', 'g1', KONRAD.id, 'b-alt'), PERSONEN)
    const b = besuch('2026-09-14', 'g1')
    expect(besuchEintragen(schonSeiner, KENN, b, PERSONEN)).toBe(schonSeiner)
    expect(treffpunkt(besuchAustragen(schonSeiner, KENN, b), '2026-09-14', 'g1')).toMatchObject({ leader: '' })
  })

  it('eine frisch importierte Woche bekommt ihre vorgemerkten Besuche', () => {
    const neueWoche = buildFsWeeks(['2026-11-09'], RULES)[0]!
    const mitBesuch = besucheInNeueWoche(neueWoche, '2026-11-09', [besuch('2026-11-09', 'g3')], PERSONEN)
    expect(mitBesuch.find((inst) => inst.grp === 'g3')).toMatchObject({ leader: 'Konrad Sommer', lpid: 'p5' })
    // Ohne Besuch in dieser Woche: dieselbe Liste.
    expect(besucheInNeueWoche(neueWoche, '2026-11-09', [besuch('2026-12-07', 'g4')], PERSONEN)).toBe(neueWoche)
  })
})

describe('Der Stand eines Besuchs', () => {
  it('eingetragen, offen, anderer Leiter — je nach Treffpunkt', () => {
    const b = besuch('2026-09-14', 'g1')
    expect(besuchStand(b, lage(), HEUTE).art).toBe('offen')
    expect(besuchStand(b, lage(besuchEintragen(wochen(), KENN, b, PERSONEN)), HEUTE).art).toBe('eingetragen')
    const fremd = besuchStand(b, lage(besuchEintragen(wochen(), KENN, besuch('2026-09-14', 'g1', JONAS.id), PERSONEN)), HEUTE)
    expect(fremd).toMatchObject({ art: 'andererLeiter', andererLeiter: 'Jonas Berger' })
  })

  it('eine Woche hinter den geladenen ist vorgemerkt — mit den Treffpunkten laut Grundplan', () => {
    const stand = besuchStand(besuch('2026-11-09', 'g3'), lage(), HEUTE)
    expect(stand).toMatchObject({ art: 'vorgemerkt', lautGrundplan: true })
    expect(stand.treffpunkte.map((inst) => inst.place)).toEqual(['Video'])
  })

  it('am ersten Samstag trifft sich die Gruppe nicht — geladen wie vorgemerkt', () => {
    // 28. September: Der Samstag ist der 3. Oktober, der erste im Monat.
    expect(besuchStand(besuch('2026-09-28', 'g1'), lage(), HEUTE).art).toBe('keinTreffpunkt')
    expect(besuchStand(besuch('2026-11-02', 'g1'), lage(), HEUTE).art).toBe('keinTreffpunkt')
  })

  it('vergangene Besuche sind vorbei — und melden keinen Konflikt mehr', () => {
    const b = besuch('2026-09-14', 'g1')
    const stand = besuchStand(b, lage(), new Date(2026, 8, 20, 9))
    expect(stand.art).toBe('vorbei')
    expect(besuchHatKonflikt(b, stand)).toBe(false)
  })

  it('ist der Besucher am Treffpunkt-Tag abwesend, steht es dabei', () => {
    const urlaub: Absence = { id: 'a', personId: 'p5', userId: null, from: '2026-09-19', to: '2026-09-19', reason: '' }
    const b = besuch('2026-09-14', 'g1')
    const stand = besuchStand(b, lage(wochen(), [urlaub]), HEUTE)
    expect(stand.abwesend).toBe(true)
    expect(besuchHatKonflikt(b, stand)).toBe(true)
    // Am Tag davor zählt es nicht.
    const vorher = { ...urlaub, from: '2026-09-18', to: '2026-09-18' }
    expect(besuchStand(b, lage(wochen(), [vorher]), HEUTE).abwesend).toBe(false)
  })

  it('Konflikt heißt: es geht so nicht auf — vorgemerkt und eingetragen sind keiner', () => {
    const vorgemerkt = besuch('2026-11-09', 'g3')
    expect(besuchHatKonflikt(vorgemerkt, besuchStand(vorgemerkt, lage(), HEUTE))).toBe(false)
    const b = besuch('2026-09-14', 'g1')
    const eingetragen = besuchStand(b, lage(besuchEintragen(wochen(), KENN, b, PERSONEN)), HEUTE)
    expect(besuchHatKonflikt(b, eingetragen)).toBe(false)
    // Ohne Besucher (Person gelöscht) dagegen schon.
    const ohne = besuch('2026-11-09', 'g3', null)
    expect(besuchHatKonflikt(ohne, besuchStand(ohne, lage(), HEUTE))).toBe(true)
  })
})

describe('Der Monat eines Besuchs ist der seines Wochenendes', () => {
  it('eine Woche über den Monatswechsel gehört zum Monat ihres Samstags', () => {
    expect(besuchsMonat('2026-09-28')).toBe('2026-10')
    expect(besuchsMonat('2026-09-21')).toBe('2026-09')
  })
})

/**
 * **Was beim Anlegen schon dasteht** (13.10.2026): keine Automatik, nur ein
 * Vorschlag — „die gruppe, die am längsten nicht dran war … einen monat nach
 * dem letzten bestehenden termin". Angepasst wird im Blatt.
 */
describe('Der Vorschlag für einen neuen Besuch', () => {
  const vorschlag = (besuche: Gruppenbesuch[], dieseWoche = MONTAG_0) => besuchVorschlag(besuche, GRUPPEN, dieseWoche)

  it('ohne Besuche: diese Woche, die erste Gruppe, kein Besucher', () => {
    expect(vorschlag([])).toEqual({ woche: MONTAG_0, grp: 'g1', pid: null })
  })

  it('die Gruppe, die am längsten nicht dran war — noch nie besuchte zuerst, in ihrer Reihenfolge', () => {
    expect(vorschlag([besuch('2026-09-14', 'g1')]).grp).toBe('g2')
    const alle = [besuch('2026-09-14', 'g1'), besuch('2026-10-12', 'g2'), besuch('2026-11-16', 'g3'), besuch('2026-12-14', 'g4')]
    expect(vorschlag(alle).grp).toBe('g1')
  })

  it('ein schon geplanter Besuch zählt mit — die Gruppe ist dann nicht dran', () => {
    // Gruppe 2 kommt im Dezember dran: vor ihr die nie besuchten.
    expect(vorschlag([besuch('2026-09-14', 'g1'), besuch('2026-12-14', 'g2')]).grp).toBe('g3')
  })

  it('die Woche einen Monat nach dem letzten Besuch — dasselbe Wochenende im nächsten Monat', () => {
    expect(vorschlag([besuch('2026-09-14', 'g1')]).woche).toBe('2026-10-12') // 3. Sa 19.9. → 3. Sa 17.10.
    expect(vorschlag([besuch('2026-09-07', 'g1')]).woche).toBe('2026-10-05') // 2. Sa 12.9. → 2. Sa 10.10.
  })

  it('vom fünften Wochenende zum letzten des nächsten Monats', () => {
    expect(vorschlag([besuch('2026-10-26', 'g1')]).woche).toBe('2026-11-23') // Sa 31.10. → Sa 28.11.
  })

  it('nie vor dieser Woche — liegt der letzte Besuch lange zurück, ist es diese', () => {
    expect(vorschlag([besuch('2026-03-09', 'g1')]).woche).toBe(MONTAG_0)
  })

  it('der Besucher des letzten Besuchs, der einen hat', () => {
    expect(vorschlag([besuch('2026-09-14', 'g1', JONAS.id), besuch('2026-10-12', 'g2', null)]).pid).toBe(JONAS.id)
  })

  it('ohne Gruppen keine Gruppe', () => {
    expect(besuchVorschlag([], [], MONTAG_0).grp).toBeNull()
  })
})

describe('Die Wochen zur Wahl', () => {
  it('ein halbes Jahr ab dieser Woche', () => {
    const w = besuchsWochenAuswahl('2026-09-07')
    expect(w).toHaveLength(30)
    expect(w[0]).toBe('2026-09-07')
    expect(w.at(-1)).toBe('2027-03-29')
  })

  it('liegt der Besuch weiter hinten, reicht die Liste bis einen Monat dahinter', () => {
    const w = besuchsWochenAuswahl('2026-09-07', '2027-06-07')
    expect(w).toContain('2027-06-07')
    expect(w.at(-1)).toBe('2027-07-05')
    expect(new Set(w).size).toBe(w.length)
  })
})

describe('Reihenfolge im Zustand', () => {
  it('nach Woche, bei gleicher Woche nach Gruppe', () => {
    const b = [besuch('2026-11-09', 'g3'), besuch('2026-09-14', 'g2'), besuch('2026-09-14', 'g1')]
    expect(nachWoche(b).map((x) => `${x.woche}/${x.grp}`)).toEqual(['2026-09-14/g1', '2026-09-14/g2', '2026-11-09/g3'])
  })
})
