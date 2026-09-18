import { describe, expect, it } from 'vitest'
import { genFsWeek } from '../src/data/fs'
import type { FsRule } from '../src/data/types'
import { giltInWoche, regelFehler, tagDerWoche, wocheNeu } from './treffpunkt-regeln-setzen.mjs'

/**
 * **Zwei Rechnungen über dieselbe Sache.**
 *
 * Die App materialisiert den Grundplan in `genFsWeek` (src/data/fs.ts). Dieses
 * Skript muss dasselbe tun — es kann die Funktion nur nicht laden: `fs.ts`
 * importiert seine Nachbarn ohne Dateiendung, und Node löst das nicht auf.
 * Also steht die Rechnung ein zweites Mal da, und diese Probe hält beide
 * zusammen: Wo sie auseinanderlaufen, stünde nach dem Eintragen in der App
 * etwas anderes als in der Datenbank.
 *
 * Der Zusatz, den die App nicht kennt: Beim Eintragen liegen schon importierte
 * Treffpunkte in den Wochen (`manual`). Eine gleichartige Zeile geht in der
 * Regel-Instanz auf und gibt ihre Besetzung ab — sonst stünde der Montag
 * zweimal da, und der zugeteilte Leiter hinge an der falschen Hälfte.
 */

const regel = (teil: Partial<FsRule> & { id: string }): FsRule => ({
  grp: null,
  wd: 1,
  time: '14:30',
  place: 'Beliebig',
  monthly: 0,
  skipCong: false,
  ...teil,
})

const MONTAG = regel({ id: 'r-mo' })
const MITTWOCH = regel({ id: 'r-mi', wd: 3, time: '09:30', place: 'Munding & Zoom' })
const SAMSTAG_1 = regel({ id: 'r-sa', wd: 6, time: '09:30', place: 'Munding & Zoom', monthly: 1 })

describe('Gleichstand mit der App (genFsWeek)', () => {
  const wochen = ['2026-09-14', '2026-09-28', '2026-10-05', '2026-11-02', '2026-12-28']

  it.each(wochen)('rechnet für die Woche %s dasselbe', (start) => {
    const regeln = [MONTAG, MITTWOCH, SAMSTAG_1]
    expect(wocheNeu(start, regeln)).toEqual(genFsWeek(start, regeln))
  })

  it('lässt eine Gruppen-Regel mit skipCong genauso entfallen', () => {
    const gruppe = regel({ id: 'r-grp', grp: 'g1', wd: 1, time: '18:00', skipCong: true })
    const regeln = [MONTAG, gruppe]
    expect(wocheNeu('2026-09-14', regeln)).toEqual(genFsWeek('2026-09-14', regeln))
    // Gegenprobe: ohne den Versammlungstreffpunkt am selben Tag bleibt sie.
    expect(wocheNeu('2026-09-14', [gruppe])).toEqual(genFsWeek('2026-09-14', [gruppe]))
    expect(wocheNeu('2026-09-14', [gruppe])).toHaveLength(1)
  })
})

describe('Monatsregel', () => {
  it('gilt nur in der Woche, in der ihr Wochentag der N-te des Monats ist', () => {
    // 2026: der 1. Samstag im Oktober ist der 3.10. (Woche ab 28.9.),
    // der zweite der 10.10. (Woche ab 5.10.).
    expect(giltInWoche(SAMSTAG_1, '2026-09-28')).toBe(true)
    expect(giltInWoche(SAMSTAG_1, '2026-10-05')).toBe(false)
  })

  it('rechnet den Wochentag vom Montag aus, ohne Zeitzonen-Versatz', () => {
    expect(tagDerWoche('2026-09-14', 6)?.toISOString().slice(0, 10)).toBe('2026-09-19') // Samstag
    expect(tagDerWoche('2026-09-14', 0)?.toISOString().slice(0, 10)).toBe('2026-09-20') // Sonntag danach
    expect(tagDerWoche('unsinn', 1)).toBeNull()
  })
})

describe('Zusammenführen mit dem Import', () => {
  const importiert = (teil: Record<string, unknown>) => ({
    id: 'x1430',
    ruleId: null,
    grp: null,
    wd: 1,
    time: '14:30',
    place: 'Beliebig',
    leader: '',
    manual: true,
    ...teil,
  })

  it('führt eine gleichartige importierte Zeile in der Regel zusammen', () => {
    const neu = wocheNeu('2026-09-14', [MONTAG], [importiert({})])
    expect(neu).toHaveLength(1)
    expect(neu[0].ruleId).toBe('r-mo')
    expect(neu[0].manual).toBeUndefined()
  })

  it('nimmt den zugeteilten Leiter mit — samt Person und Freitext-Kennzeichen', () => {
    const mitLeiter = importiert({ leader: 'Simon Krüger', lpid: 'p-1' })
    const neu = wocheNeu('2026-09-14', [MONTAG], [mitLeiter])
    expect(neu[0].leader).toBe('Simon Krüger')
    expect(neu[0].lpid).toBe('p-1')

    const extern = importiert({ leader: 'Kreisaufseher', lext: true })
    expect(wocheNeu('2026-09-14', [MONTAG], [extern])[0].lext).toBe(true)
  })

  it('lässt Einzeltermine stehen, die keine Regel abdeckt', () => {
    // Der zusätzliche Samstag 13:30 — bewusst keine Regel (nur 2× in 5 Monaten).
    const einzeln = importiert({ id: 'x1330', wd: 6, time: '13:30', place: 'Munding & Zoom' })
    const neu = wocheNeu('2026-09-14', [MONTAG], [importiert({}), einzeln])
    expect(neu.map((i) => i.time)).toEqual(['14:30', '13:30'])
    expect(neu.find((i) => i.time === '13:30')?.manual).toBe(true)
  })

  it('räumt eine importierte Zeile nicht weg, wenn die Regel in dieser Woche gar nicht gilt', () => {
    // Sonst verschwände der Treffpunkt: Die Monatsregel greift hier nicht, die
    // importierte Zeile ist also das Einzige, was den Termin belegt.
    const sa = importiert({ id: 'xsa', wd: 6, time: '09:30', place: 'Munding & Zoom' })
    const neu = wocheNeu('2026-10-05', [SAMSTAG_1], [sa])
    expect(neu).toHaveLength(1)
    expect(neu[0].manual).toBe(true)
  })
})

describe('regelFehler', () => {
  it('nimmt eine brauchbare Regel an', () => {
    expect(regelFehler({ wd: 1, time: '14:30', place: 'Beliebig', monthly: 0, grp: null })).toEqual([])
  })

  it('weist Unsinn mit Begründung ab', () => {
    expect(regelFehler({ wd: 7, time: '14:30', place: '', monthly: 0 })[0]).toMatch(/wd/)
    expect(regelFehler({ wd: 1, time: '14.30', place: '', monthly: 0 })[0]).toMatch(/time/)
    expect(regelFehler({ wd: 1, time: '14:30', place: '', monthly: 9 })[0]).toMatch(/monthly/)
  })

  it('lässt keine Gruppe zu, die es in dieser Versammlung nicht gibt', () => {
    // Der zusammengesetzte Fremdschlüssel wiese es ab — aber erst beim
    // Schreiben, mitten in einem halb ausgeführten Lauf.
    expect(regelFehler({ wd: 1, time: '14:30', place: '', monthly: 0, grp: 'fremd' }, ['g1'])[0]).toMatch(/fremd/)
    expect(regelFehler({ wd: 1, time: '14:30', place: '', monthly: 0, grp: 'g1' }, ['g1'])).toEqual([])
  })
})
