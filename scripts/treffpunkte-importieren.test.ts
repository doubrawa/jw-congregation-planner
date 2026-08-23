import { describe, expect, it } from 'vitest'
import {
  grundplanVorschlag,
  manuelleKennung,
  nachWoche,
  passenderPlatz,
  sammleTreffpunkte,
  verteileFsWoche,
  wochentag,
} from './treffpunkte-importieren.mjs'
import { mondayOf } from './wochenplanung-importieren.mjs'

/**
 * Der Treffpunkt-Import schreibt in die zweite Datenquelle der App (`fs_weeks`)
 * — dieselbe, an der schon einmal ein Wochenversatz unbemerkt blieb. Geprüft
 * ist deshalb alles, was **entscheidet**: das Lesen der NWS-Termine, die
 * Zuordnung zur Woche und zum Platz, und was beim zweiten Lauf geschieht. Der
 * Netzteil (`main`) bleibt außen vor.
 *
 * Die Fixtures bilden `FieldServiceMeetings_7.5.json` nach: `a` Datum+Zeit,
 * `g` Ort, `h` Leiter (-2 = offen), `i` Zusatz.
 */

const ORTE = [
  { ID: 2645169, Deleted: false, a: 'Treffpunkt Nord' },
  { ID: 8444099, Deleted: false, a: 'Beliebig' },
]

const termin = (id: number, a: string, g: number | undefined, h: number, weitere = {}) => ({
  ID: id, Deleted: false, a, g, h, o: [], t: [], ...weitere,
})

/** Leiter-Auflösung wie im Skript: Referenz → { name, pid }. */
const bind = (ref: number | null) =>
  ref === 4711 ? { name: 'Anna Beispiel', pid: 'p-anna' }
  : ref === 4712 ? { name: 'Bernd Ohnekonto' } // in NWS, aber nicht in der App
  : { name: '' }

/** Treffpunkt aus dem Grundplan, wie ihn `genFsWeek` materialisiert. */
const ausRegel = (id: string, wd: number, time: string, grp = '', leader = '') => ({
  id, ruleId: id, grp, wd, time, place: 'Königreichssaal', leader,
})

describe('wochentag', () => {
  it('zählt wie die App (0 = Sonntag) und kippt nicht über die Zeitzone', () => {
    expect(wochentag('2026-08-17')).toBe(1) // Montag
    expect(wochentag('2026-08-22')).toBe(6) // Samstag
    expect(wochentag('2026-08-23')).toBe(0) // Sonntag
  })
})

describe('sammleTreffpunkte', () => {
  const roh = [
    termin(1, '2026-08-19 09:30:00', 2645169, 4711),
    termin(2, '2026-08-17 14:30:00', 8444099, -2),
    termin(3, '2026-08-20 09:30:00', 2645169, 4711, { Deleted: true }),
    termin(4, '2026-08-22 09:30:00', undefined, -2, { i: 'Pioniertag' }),
  ]

  it('liest Datum, Uhrzeit, Ort, Leiter und Zusatz', () => {
    const [erster] = sammleTreffpunkte(roh, ORTE)
    expect(erster).toEqual({
      nwsId: 2, datum: '2026-08-17', zeit: '14:30', montag: '2026-08-17',
      wd: 1, ort: 'Beliebig', etikett: '', leiterRef: null,
    })
  })

  it('macht aus „kein Leiter" (-2) und „kein Ort" nichts Erfundenes', () => {
    const pioniertag = sammleTreffpunkte(roh, ORTE).find((t) => t.nwsId === 4)
    expect(pioniertag?.leiterRef).toBeNull()
    expect(pioniertag?.ort).toBe('')
    expect(pioniertag?.etikett).toBe('Pioniertag')
  })

  it('überspringt Gelöschte', () => {
    expect(sammleTreffpunkte(roh, ORTE).map((t) => t.nwsId)).toEqual([2, 1, 4])
  })

  it('hängt jeden Termin an den Montag SEINER Woche', () => {
    /*
     * Der Fehler, der hier am teuersten wäre: ein Samstag- oder Sonntagstermin,
     * der eine Woche daneben landet. Die App rechnet ihr Datum aus
     * Montag + Wochentags-Versatz (`fsDate`) — also muss der Samstag zum Montag
     * DAVOR gehören und der Sonntag ans Ende derselben Woche, nicht an den
     * Anfang der nächsten.
     */
    const wochenende = sammleTreffpunkte(
      [termin(5, '2026-08-22 09:30:00', 2645169, -2), termin(6, '2026-08-23 12:00:00', 2645169, -2)],
      ORTE,
    )
    expect(wochenende.map((t) => t.montag)).toEqual(['2026-08-17', '2026-08-17'])
    expect(wochenende.map((t) => t.wd)).toEqual([6, 0])
    expect(mondayOf('2026-08-23')).toBe('2026-08-17')
  })
})

describe('nachWoche', () => {
  it('bündelt die Termine je Programmwoche', () => {
    const tps = sammleTreffpunkte(
      [
        termin(1, '2026-08-19 09:30:00', 2645169, -2),
        termin(2, '2026-08-22 09:30:00', 2645169, -2),
        termin(3, '2026-08-26 09:30:00', 2645169, -2),
      ],
      ORTE,
    )
    const je = nachWoche(tps)
    expect([...je.keys()].sort()).toEqual(['2026-08-17', '2026-08-24'])
    expect(je.get('2026-08-17')).toHaveLength(2)
  })
})

describe('passenderPlatz', () => {
  const tp = { nwsId: 9, datum: '2026-08-19', zeit: '09:30', montag: '2026-08-17', wd: 3, ort: '', etikett: '', leiterRef: null }

  it('nimmt den Versammlungstreffpunkt, nicht den einer Gruppe', () => {
    // NWS kennt keine Gruppen — ein Gruppentreffpunkt darf nie fremdbesetzt
    // werden, auch wenn Tag und Zeit zufällig passen.
    const insts = [ausRegel('r-grp', 3, '09:30', 'g1'), ausRegel('r-vers', 3, '09:30')]
    expect(passenderPlatz(insts, tp)).toMatchObject({ id: 'r-vers' })
  })

  it('meldet mehrere Gruppentreffpunkte als mehrdeutig, statt zu raten', () => {
    const insts = [ausRegel('r-g1', 3, '09:30', 'g1'), ausRegel('r-g2', 3, '09:30', 'g2')]
    expect(passenderPlatz(insts, tp)).toBe('mehrdeutig')
  })

  it('nimmt den einzigen passenden, auch wenn er einer Gruppe gehört', () => {
    // Ein einziger Kandidat ist keine Wahl — und der Planer sieht am Bericht,
    // dass nichts angelegt wurde.
    const insts = [ausRegel('r-g1', 3, '09:30', 'g1')]
    expect(passenderPlatz(insts, tp)).toMatchObject({ id: 'r-g1' })
  })

  it('findet denselben Termin aus einem früheren Lauf über seine Kennung wieder', () => {
    const alt = { id: manuelleKennung(9), ruleId: null, grp: '', wd: 5, time: '18:00', place: '', leader: '', manual: true }
    expect(passenderPlatz([alt], tp)).toMatchObject({ id: manuelleKennung(9) })
  })

  it('findet gar nichts, wenn die Uhrzeit nicht stimmt', () => {
    expect(passenderPlatz([ausRegel('r-vers', 3, '10:00')], tp)).toBeNull()
  })
})

describe('verteileFsWoche', () => {
  const mittwoch = (nwsId: number, h: number | null, ort = 'Treffpunkt Nord') => ({
    nwsId, datum: '2026-08-19', zeit: '09:30', montag: '2026-08-17', wd: 3, ort, etikett: '', leiterRef: h,
  })

  it('setzt den Leiter samt Person-Id in den Treffpunkt des Grundplans', () => {
    const z = verteileFsWoche([ausRegel('r1', 3, '09:30')], [mittwoch(1, 4711)], bind)
    expect(z.gesetzt).toBe(1)
    expect(z.insts[0]).toMatchObject({ id: 'r1', leader: 'Anna Beispiel', lpid: 'p-anna' })
  })

  it('legt einen Termin, den der Grundplan nicht kennt, nur für diese Woche an', () => {
    const z = verteileFsWoche(
      [ausRegel('r1', 3, '09:30')],
      [{ ...mittwoch(2, 4711), zeit: '13:30', etikett: 'Pioniertag' }],
      bind,
    )
    expect(z.angelegt).toBe(1)
    const neu = z.insts.find((i) => i.manual)
    expect(neu).toMatchObject({
      grp: '', wd: 3, time: '13:30', place: 'Treffpunkt Nord · Pioniertag', leader: 'Anna Beispiel',
    })
    expect(neu?.ruleId).toBeNull()
  })

  it('nimmt den Saal der Versammlung, wenn NWS keinen Ort führt', () => {
    const z = verteileFsWoche([], [mittwoch(3, null, '')], bind, { standardOrt: 'Unser Saal' })
    expect(z.insts[0]?.place).toBe('Unser Saal')
  })

  it('löscht mit einem leeren NWS-Leiter keine Zuteilung', () => {
    /*
     * Der gefährlichste Fall: In NWS steht -2 („offen"), in der App hat der
     * Planer längst jemanden eingetragen. Ein fehlender Wert ist keine Aussage
     * — würde er überschreiben, wäre die Zuteilung weg, ohne dass es auffiele.
     */
    const z = verteileFsWoche([ausRegel('r1', 3, '09:30', '', 'Clara Vorher')], [mittwoch(4, null)], bind)
    expect(z.insts[0]?.leader).toBe('Clara Vorher')
    expect(z.gesetzt).toBe(0)
    expect(z.offen).toBe(1)
  })

  it('gewinnt sonst über einen gesetzten Namen — mit --nur-leere nicht', () => {
    const besetzt = [ausRegel('r1', 3, '09:30', '', 'Clara Vorher')]
    expect(verteileFsWoche(besetzt, [mittwoch(5, 4711)], bind).insts[0]?.leader).toBe('Anna Beispiel')
    const geschuetzt = verteileFsWoche(besetzt, [mittwoch(5, 4711)], bind, { nurLeere: true })
    expect(geschuetzt.insts[0]?.leader).toBe('Clara Vorher')
    expect(geschuetzt.geschuetzt).toBe(1)
  })

  it('nimmt einem Leiter ohne App-Person die Person-Id ab, statt eine alte stehen zu lassen', () => {
    const alt = { ...ausRegel('r1', 3, '09:30'), leader: 'Wer Auchimmer', lpid: 'p-falsch' }
    const z = verteileFsWoche([alt], [mittwoch(6, 4712)], bind)
    expect(z.insts[0]).toMatchObject({ leader: 'Bernd Ohnekonto' })
    expect(z.insts[0]).not.toHaveProperty('lpid')
    expect(z.ohnePid).toBe(1)
  })

  it('nimmt die Freitext-Marke weg, wenn eine Person aus der Versammlung übernimmt', () => {
    /*
     * `lext` heißt „gehört niemandem hier" (T63). Bliebe die Marke stehen,
     * zählte die Leitung in keiner Auslastung und in keiner Aufgabenliste mit —
     * der Import hätte jemanden eingeteilt, der davon nie erführe.
     */
    const kreisaufseher = { ...ausRegel('r1', 3, '09:30'), leader: 'Br. Kreisaufseher', lext: true }
    const z = verteileFsWoche([kreisaufseher], [mittwoch(7, 4711)], bind)
    expect(z.insts[0]).not.toHaveProperty('lext')
  })

  it('lässt die Vorlage unangetastet (reine Funktion)', () => {
    const vorher = [ausRegel('r1', 3, '09:30')]
    verteileFsWoche(vorher, [mittwoch(8, 4711)], bind)
    expect(vorher[0]?.leader).toBe('')
  })

  it('legt beim zweiten Lauf nichts doppelt an und zieht Verschiebungen nach', () => {
    const erst = verteileFsWoche([], [{ ...mittwoch(9, 4711), zeit: '13:30' }], bind)
    expect(erst.insts).toHaveLength(1)
    // Derselbe Termin, in NWS auf Samstag 10:00 verschoben.
    const zweit = verteileFsWoche(
      erst.insts,
      [{ ...mittwoch(9, 4711), zeit: '10:00', wd: 6, datum: '2026-08-22' }],
      bind,
    )
    expect(zweit.insts).toHaveLength(1)
    expect(zweit.insts[0]).toMatchObject({ wd: 6, time: '10:00' })
  })

  it('gibt zwei Termine derselben Zeit nicht demselben Platz', () => {
    // Sonst schluckte ein Platz beide, und der zweite Termin verschwände.
    const z = verteileFsWoche([ausRegel('r1', 3, '09:30')], [mittwoch(10, 4711), mittwoch(11, 4711)], bind)
    expect(z.angelegt).toBe(1)
    expect(z.insts).toHaveLength(2)
  })

  it('sortiert wie die App: Montag zuerst, Sonntag zuletzt', () => {
    const so = { ...mittwoch(12, null), wd: 0, zeit: '12:00', datum: '2026-08-23' }
    const mo = { ...mittwoch(13, null), wd: 1, zeit: '14:30', datum: '2026-08-17' }
    const z = verteileFsWoche([], [so, mo], bind)
    expect(z.insts.map((i) => i.wd)).toEqual([1, 0])
  })
})

describe('grundplanVorschlag', () => {
  it('erkennt ein wöchentliches Muster und einen „N-ten im Monat"', () => {
    const tps = sammleTreffpunkte(
      [
        termin(1, '2026-06-03 09:30:00', 2645169, -2),
        termin(2, '2026-06-10 09:30:00', 2645169, -2),
        termin(3, '2026-06-17 09:30:00', 2645169, -2),
        termin(4, '2026-06-24 09:30:00', 2645169, -2),
        termin(5, '2026-06-06 09:30:00', 8444099, -2), // 1. Samstag
        termin(6, '2026-07-04 09:30:00', 8444099, -2), // 1. Samstag
      ],
      ORTE,
    )
    const vorschlag = grundplanVorschlag(tps)
    const mittwochs = vorschlag.find((v) => v.wd === 3)
    expect(mittwochs?.woechentlich).toBe(true)
    expect(mittwochs?.monatlich).toBe(0)
    const samstags = vorschlag.find((v) => v.wd === 6)
    expect(samstags?.monatlich).toBe(1)
    expect(samstags?.text).toContain('1. Samstag im Monat')
  })
})
