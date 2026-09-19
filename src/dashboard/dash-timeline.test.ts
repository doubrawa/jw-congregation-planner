import { describe, expect, it } from 'vitest'
import { isoDay } from '../data/meeting-dates'
import type { Absence, MyTask } from '../data/types'
import { DASH_TAGE, dashTimeline } from './dash-timeline'

/**
 * **Das Zeitfenster der Start-Leiste.**
 *
 * Der Start soll sagen, was ansteht, nicht was geplant ist: Der
 * Programm-Vorrat reicht oft Monate, und zwanzig Zeilen sind keine Auskunft
 * mehr. Die Regeln, die daraus folgen und die hier stehen:
 *
 * - Zwei Wochen, **heute mitgezählt** — der laufende Tag gehört dazu, wer am
 *   Sonntagvormittag hereinschaut, will den Sonntag sehen.
 * - Ist darin nichts, steht die **nächste Aufgabe dahinter** da. „Keine
 *   anstehende Aufgabe" wäre falsch, sobald eine in drei Wochen liegt.
 * - Abwesenheiten werden über die **ganze** Liste eingefärbt und erst danach
 *   beschnitten, sonst verliert ein Zeitraum, der vor heute beginnt, sein Band.
 */

const HEUTE = new Date(2026, 8, 7, 9, 0) // Montag, 7. September 2026

/** Tag als UTC-Mitternacht, `n` Tage nach HEUTE — die Form von `MyTask.at`. */
const at = (n: number): number => Date.UTC(2026, 8, 7 + n)

const iso = (n: number): string => isoDay(new Date(2026, 8, 7 + n))

const task = (id: string, tage: number | null): MyTask => ({
  id, title: id, date: id, chip: '', at: tage == null ? null : at(tage),
  status: 'offen', s89: null,
})

const abw = (id: string, von: number, bis: number, personId = 'p-a'): Absence => ({
  id, personId, userId: null, from: iso(von), to: iso(bis), reason: '',
})

const leiste = (tasks: MyTask[], absences: Absence[] = [], personId: string | null = 'p-a') =>
  dashTimeline(tasks, absences, personId, HEUTE)

const keys = (tasks: MyTask[], absences: Absence[] = [], personId: string | null = 'p-a') =>
  leiste(tasks, absences, personId).map((z) => z.key)

describe('Das Fenster reicht zwei Wochen weit', () => {
  it('heute zählt mit', () => {
    expect(keys([task('heute', 0)])).toEqual(['heute'])
  })

  it('der letzte Tag des Fensters auch', () => {
    expect(keys([task('rand', DASH_TAGE - 1)])).toEqual(['rand'])
  })

  it('der Tag danach nicht mehr — solange etwas davor liegt', () => {
    expect(keys([task('drin', 3), task('draußen', DASH_TAGE)])).toEqual(['drin'])
  })

  it('Vergangenes nicht (der Reducer wirft es schon heraus, hier die Gegenprobe)', () => {
    expect(keys([task('gestern', -1), task('heute', 0)])).toEqual(['heute'])
  })

  it('ohne Termin (Demo, Vorlagen) bleibt eine Aufgabe stehen — verglichen werden kann nichts', () => {
    expect(keys([task('demo', null)])).toEqual(['demo'])
  })

  it('nach Termin geordnet, nicht in der Reihenfolge der Eingabe', () => {
    expect(keys([task('spät', 5), task('früh', 1)])).toEqual(['früh', 'spät'])
  })
})

describe('Liegt im Fenster nichts, steht die nächste Aufgabe dahinter da', () => {
  it('genau sie, und nur sie', () => {
    expect(keys([task('in drei Wochen', 21), task('in vier', 28)])).toEqual(['in drei Wochen'])
  })

  it('gar nichts geplant: gar keine Zeile — dann sagt der Bildschirm es selbst', () => {
    expect(keys([])).toEqual([])
  })

  it('Vergangenes ist keine nächste Aufgabe', () => {
    expect(keys([task('gestern', -1)])).toEqual([])
  })

  it('eine Abwesenheit allein füllt das Fenster auch — sie ist die Auskunft', () => {
    // Sonst stünde „keine anstehende Aufgabe" über einem Zeitraum, der genau
    // sagt, warum keine da ist.
    expect(keys([], [abw('a1', 2, 2)])).toEqual(['abw|a1|einzel'])
  })
})

describe('Abwesenheiten stehen in derselben Leiste', () => {
  it('ein Zeitraum gibt zwei Punkte, ein einzelner Tag einen', () => {
    expect(keys([], [abw('a1', 1, 4), abw('a2', 6, 6)])).toEqual([
      'abw|a1|start', 'abw|a1|ende', 'abw|a2|einzel',
    ])
  })

  it('nur die eigenen — geladen wird die ganze Versammlung', () => {
    expect(keys([], [abw('fremd', 2, 2, 'p-x'), abw('meine', 3, 3)])).toEqual(['abw|meine|einzel'])
  })

  it('ohne verknüpfte Person gehört keine Abwesenheit hierher', () => {
    expect(keys([], [abw('a1', 2, 2)], null)).toEqual([])
  })

  it('der Beginn fasst den Tag vorn ein, das Ende hinten', () => {
    // Sonst liefe die Färbung an einer Aufgabe vorbei, die am Rand-Tag liegt
    // und sehr wohl in den Zeitraum fällt.
    expect(keys([task('am Anfang', 1), task('am Ende', 4)], [abw('a1', 1, 4)])).toEqual([
      'abw|a1|start', 'am Anfang', 'am Ende', 'abw|a1|ende',
    ])
  })

  it('was dazwischen liegt, trägt die Strecke auf beiden Seiten', () => {
    const zeilen = leiste([task('mitten drin', 2)], [abw('a1', 1, 4)])
    const mitte = zeilen.find((z) => z.key === 'mitten drin')!
    expect([mitte.abwOben, mitte.abwUnten]).toEqual([true, true])
  })

  it('was daneben liegt, nicht', () => {
    const zeilen = leiste([task('danach', 6)], [abw('a1', 1, 4)])
    const danach = zeilen.find((z) => z.key === 'danach')!
    expect([danach.abwOben, danach.abwUnten]).toEqual([false, false])
  })

  it('ein Zeitraum, der vor heute beginnt, behält sein Band', () => {
    // Gefärbt wird über die ganze Liste, beschnitten erst danach: Der Beginn
    // liegt zurück und fällt heraus, die Strecke bis zum Ende bleibt.
    const zeilen = leiste([task('drin', 1)], [abw('a1', -3, 4)])
    expect(zeilen.map((z) => z.key)).toEqual(['drin', 'abw|a1|ende'])
    expect(zeilen[0]!.abwOben).toBe(true)
  })

  it('überlappende Zeiträume schalten sich nicht gegenseitig aus', () => {
    // Zwei offene gleichzeitig: Ein Zähler trägt durch, ein Vergleich je Paar
    // hätte beim ersten Ende aufgehört.
    const zeilen = leiste([task('drin', 5)], [abw('a1', 1, 6), abw('a2', 3, 8)])
    const drin = zeilen.find((z) => z.key === 'drin')!
    expect([drin.abwOben, drin.abwUnten]).toEqual([true, true])
  })
})
