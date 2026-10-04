import { describe, expect, it } from 'vitest'
import { emptyQualifications } from './helpers'
import { montagVon } from './meeting-dates'
import {
  deriveMyOzTasks,
  ozAb,
  ozAutoAssign,
  ozDatum,
  ozEntzogeneZusagen,
  ozFreieSchichten,
  ozKannEintragen,
  ozKonflikte,
  ozNachDatum,
  ozOffeneMeldungen,
  ozSchicht,
  ozSchichten,
  ozStand,
  ozTaskKey,
  ozVorbei,
  ozWegBeiTagwechsel,
  ozZuletztGesendet,
  ozZusage,
} from './zeugnis'
import type { Absence, OzEintrag, OzTermin, Person } from './types'
import { OZ_DIENST } from '../../supabase/functions/_shared/zuteilungen.ts'

/**
 * **Öffentliches Zeugnisgeben** (T120, Phase 3) — gemessen am Königreichsdienst:
 * gleicher Ort, gleicher Tag, gleiche Zeit (Nov. 2013); am Infostand immer
 * zwei (Nov. 2014). Geprüft wird, wie aus Terminen Schichten werden, wer sich
 * eintragen darf, was als Konflikt gilt und wie die Auto-Zuteilung verteilt.
 */

const HEUTE = new Date(2026, 8, 7, 9, 0) // Montag, 7. September 2026
const AB = '2026-09-07'

const MITTWOCH: OzTermin = { id: 't1', wd: 3, von: '10:00', bis: '12:00', ort: 'Marktplatz', plaetze: 2 }
const SAMSTAG: OzTermin = { id: 't2', wd: 6, von: '09:00', bis: '11:00', ort: 'Bahnhof', plaetze: 2 }

function person(id: string, fn: string, zeugnis = true): Person {
  return { id, fn, ln: 'Test', role: 'verkuendiger', tel: '', mail: '', priv: { ...emptyQualifications(), zeugnis } }
}
const ANNA = person('p-a', 'Anna')
const BERT = person('p-b', 'Bert')
const CARL = person('p-c', 'Carl')
const OHNE = person('p-o', 'Otto', false)

const eintrag = (terminId: string, datum: string, pid: string, selbst = false): OzEintrag => ({
  id: `z-${terminId}-${datum}-${pid}`,
  terminId,
  datum,
  pid,
  selbst,
})

describe('Aus Terminen werden Schichten', () => {
  it('je Woche eine Schicht je Termin, nach Tag sortiert — mit den freien Plätzen', () => {
    const schichten = ozSchichten([SAMSTAG, MITTWOCH], [eintrag('t1', '2026-09-09', 'p-a')], AB, 2)
    expect(schichten.map((s) => `${s.datum} ${s.termin.ort} frei ${s.frei}`)).toEqual([
      '2026-09-09 Marktplatz frei 1',
      '2026-09-12 Bahnhof frei 2',
      '2026-09-16 Marktplatz frei 2',
      '2026-09-19 Bahnhof frei 2',
    ])
    expect(schichten[0]!.montag).toBe('2026-09-07')
  })

  it('Tag und Montag einer Woche rechnen sich gegenseitig aus — auch am Sonntag', () => {
    expect(ozDatum('2026-09-07', 0)).toBe('2026-09-13') // Sonntag am Ende der Woche
    expect(montagVon('2026-09-13')).toBe('2026-09-07')
    expect(montagVon('2026-09-07')).toBe('2026-09-07')
  })

  it('mehr Einträge als Plätze ergeben keine negativen freien Plätze', () => {
    const voll = ['p-a', 'p-b', 'p-c'].map((pid) => eintrag('t1', '2026-09-09', pid))
    expect(ozSchichten([MITTWOCH], voll, AB, 1)[0]!.frei).toBe(0)
  })
})

describe('Selbst eintragen', () => {
  const [schicht] = ozSchichten([MITTWOCH], [], AB, 1)

  it('wer den Aufgabenbereich hat, darf in einen freien Platz', () => {
    expect(ozKannEintragen(ANNA, schicht!, HEUTE)).toBe(true)
  })

  it('ohne den Aufgabenbereich nicht — die Ältestenschaft organisiert das Zeugnisgeben', () => {
    expect(ozKannEintragen(OHNE, schicht!, HEUTE)).toBe(false)
    expect(ozKannEintragen(undefined, schicht!, HEUTE)).toBe(false)
  })

  it('nicht doppelt, nicht in eine volle und nicht in eine vergangene Schicht', () => {
    const [mitAnna] = ozSchichten([MITTWOCH], [eintrag('t1', '2026-09-09', 'p-a')], AB, 1)
    expect(ozKannEintragen(ANNA, mitAnna!, HEUTE)).toBe(false)
    const [voll] = ozSchichten([MITTWOCH], ['p-a', 'p-b'].map((p) => eintrag('t1', '2026-09-09', p)), AB, 1)
    expect(ozKannEintragen(CARL, voll!, HEUTE)).toBe(false)
    const spaeter = new Date(2026, 8, 10, 9, 0)
    expect(ozVorbei(schicht!, spaeter)).toBe(true)
    expect(ozKannEintragen(ANNA, schicht!, spaeter)).toBe(false)
  })
})

describe('Konflikte', () => {
  it('wer am Tag der Schicht abwesend ist, steht als Konflikt da — Vergangenes nicht', () => {
    const urlaub: Absence = { id: 'u', personId: 'p-a', userId: null, from: '2026-09-09', to: '2026-09-09', reason: '' }
    const schichten = ozSchichten([MITTWOCH], [eintrag('t1', '2026-09-09', 'p-a')], AB, 1)
    expect(ozKonflikte(schichten, [ANNA], [urlaub], HEUTE).map((k) => k.name)).toEqual(['Anna Test'])
    expect(ozKonflikte(schichten, [ANNA], [urlaub], new Date(2026, 8, 10, 9))).toEqual([])
  })
})

describe('Freie Plätze automatisch besetzen', () => {
  let n = 0
  const neueId = () => `n${++n}`

  it('nur mit dem Aufgabenbereich, nur wer nicht abwesend ist, und niemand zweimal am Tag', () => {
    const urlaub: Absence = { id: 'u', personId: 'p-b', userId: null, from: '2026-09-09', to: '2026-09-09', reason: '' }
    const schichten = ozSchichten([MITTWOCH, { ...MITTWOCH, id: 't3', von: '14:00', ort: 'Park' }], [], AB, 1)
    const neu = ozAutoAssign({ schichten, persons: [ANNA, BERT, CARL, OHNE], absences: [urlaub], neueId, heute: HEUTE })
    // Vier Plätze am Mittwoch, aber nur Anna und Carl können: Bert ist weg, Otto ohne Bereich.
    expect(neu.map((e) => e.pid).sort()).toEqual(['p-a', 'p-c'])
    expect(new Set(neu.map((e) => e.pid)).size).toBe(neu.length)
    expect(neu.every((e) => !e.selbst)).toBe(true)
  })

  it('wer im Zeitraum am wenigsten hat, kommt zuerst — bestehende Einträge bleiben', () => {
    const schichten = ozSchichten([MITTWOCH], [eintrag('t1', '2026-09-09', 'p-a'), eintrag('t1', '2026-09-16', 'p-a')], AB, 3)
    const neu = ozAutoAssign({ schichten, persons: [ANNA, BERT, CARL], absences: [], neueId, heute: HEUTE })
    // Anna hat schon zwei. Die vier freien Plätze (9.: einer, 16.: einer,
    // 23.: zwei) gehen an Bert und Carl — sie bleiben unter Annas Zahl.
    expect(neu).toHaveLength(4)
    expect(neu.filter((e) => e.pid === 'p-a')).toEqual([])
    expect(neu.filter((e) => e.pid === 'p-b')).toHaveLength(2)
    expect(neu.filter((e) => e.pid === 'p-c')).toHaveLength(2)
  })

  it('wer im Vierteljahr davor oft dran war, kommt später — reihum über die Zeiträume', () => {
    const schichten = ozSchichten([MITTWOCH], [], AB, 1)
    const bisher = ['2026-08-12', '2026-08-19'].map((d) => eintrag('t1', d, 'p-a'))
    const neu = ozAutoAssign({ schichten, persons: [ANNA, BERT, CARL], absences: [], bisher, neueId, heute: HEUTE })
    // Zwei Plätze, drei Kandidaten: Anna war zweimal dran, Bert und Carl nie.
    expect(neu.map((e) => e.pid).sort()).toEqual(['p-b', 'p-c'])
  })

  it('vergangene Schichten bleiben, wie sie sind', () => {
    const schichten = ozSchichten([MITTWOCH], [], AB, 1)
    expect(ozAutoAssign({ schichten, persons: [ANNA, BERT], absences: [], neueId, heute: new Date(2026, 8, 10, 9) })).toEqual([])
  })
})

describe('Reihenfolge im Zustand', () => {
  it('nach Tag, dann Termin', () => {
    const e = [eintrag('t2', '2026-09-12', 'p-a'), eintrag('t1', '2026-09-12', 'p-b'), eintrag('t1', '2026-09-09', 'p-c')]
    expect(ozNachDatum(e).map((x) => `${x.datum}/${x.terminId}`)).toEqual(['2026-09-09/t1', '2026-09-12/t1', '2026-09-12/t2'])
  })
})

describe('Eine einzelne Schicht', () => {
  it('nur an einem Tag, an dem der Termin stattfindet', () => {
    expect(ozSchicht([MITTWOCH], [], 't1', '2026-09-09')).toMatchObject({ montag: '2026-09-07', frei: 2 })
    expect(ozSchicht([MITTWOCH], [], 't1', '2026-09-10')).toBeNull() // Donnerstag
    expect(ozSchicht([MITTWOCH], [], 'weg', '2026-09-09')).toBeNull()
  })

  it('die Woche beginnt am Montag dieser Woche', () => {
    expect(ozAb(HEUTE)).toBe('2026-09-07')
    expect(ozAb(new Date(2026, 8, 13, 20))).toBe('2026-09-07') // Sonntagabend
  })
})

describe('Ein anderer Wochentag: welche Einträge gehen', () => {
  // Mittwoch, 9.9.2026, abends — die Schicht von heute ist schon gewesen.
  const mittwochAbend = new Date(2026, 8, 9, 20, 0)

  it('die kommenden gehen; was heute ist oder war, bleibt — andere Termine ohnehin', () => {
    const liste = [
      eintrag('t1', '2026-09-02', 'p-gestern'),
      eintrag('t1', '2026-09-09', 'p-heute'),
      eintrag('t1', '2026-09-16', 'p-kommend'),
      eintrag('t2', '2026-09-16', 'p-anderer'),
    ]
    expect(ozWegBeiTagwechsel(liste, 't1', mittwochAbend).map((e) => e.pid)).toEqual(['p-kommend'])
  })

  it('der Tag zählt, nicht die Uhrzeit: morgens um sieben geht der Eintrag von heute nicht', () => {
    const heuteFrueh = new Date(2026, 8, 9, 7, 0)
    expect(ozWegBeiTagwechsel([eintrag('t1', '2026-09-09', 'p-heute')], 't1', heuteFrueh)).toEqual([])
    // Am Vorabend gehört er noch zu den kommenden.
    expect(ozWegBeiTagwechsel([eintrag('t1', '2026-09-09', 'p-heute')], 't1', new Date(2026, 8, 8, 23, 0))).toHaveLength(1)
  })
})

describe('Die eigenen Einträge als Aufgaben', () => {
  it('selbst eingetragen heißt zugesagt — zugeteilt wartet auf Bestätigung', () => {
    const selbst = eintrag('t1', '2026-09-09', 'p-a', true)
    const zugeteilt = eintrag('t2', '2026-09-12', 'p-a')
    const fremd = eintrag('t1', '2026-09-09', 'p-b')
    const tasks = deriveMyOzTasks([MITTWOCH, SAMSTAG], [selbst, zugeteilt, fremd], 'p-a', {})
    expect(tasks).toEqual([
      expect.objectContaining({
        id: `oz|2026-09-07|${selbst.id}`,
        rolle: OZ_DIENST,
        date: 'Mittwoch, 9. September · 10:00–12:00 · Marktplatz',
        status: 'bestätigt',
      }),
      expect.objectContaining({ id: ozTaskKey(zugeteilt), status: 'offen' }),
    ])
  })

  it('eine ausdrückliche Zusage gilt, auch für einen zugeteilten Eintrag', () => {
    const zugeteilt = eintrag('t1', '2026-09-09', 'p-a')
    expect(ozZusage(zugeteilt, { [ozTaskKey(zugeteilt)]: 'bestätigt' })).toBe('bestätigt')
  })

  it('ein kommender Eintrag am alten Wochentag ist keine Aufgabe mehr — heute und Vergangenes bleiben (4.10.2026)', () => {
    const donnerstag: OzTermin = { ...MITTWOCH, wd: 4 }
    const gestern = eintrag('t1', '2026-09-02', 'p-a')
    const heute = eintrag('t1', '2026-09-09', 'p-a')
    const naechsteWoche = eintrag('t1', '2026-09-16', 'p-a')
    const amNeuenTag = eintrag('t1', '2026-09-17', 'p-a')
    const tasks = deriveMyOzTasks(
      [donnerstag],
      [gestern, heute, naechsteWoche, amNeuenTag],
      'p-a',
      {},
      new Date(2026, 8, 9, 9, 0), // Mittwoch, 9. September
    )
    expect(tasks.map((t) => t.id)).toEqual([ozTaskKey(gestern), ozTaskKey(heute), ozTaskKey(amNeuenTag)])
  })

  it('ohne eigene Person oder ohne Termin keine Aufgabe', () => {
    const e = eintrag('t1', '2026-09-09', 'p-a')
    expect(deriveMyOzTasks([MITTWOCH], [e], undefined, {})).toEqual([])
    expect(deriveMyOzTasks([], [e], 'p-a', {})).toEqual([])
  })
})

describe('„Plan senden": was noch hinausmuss', () => {
  it('nur Zugeteiltes, Unbestätigtes, Kommendes und noch nicht Gemeldetes', () => {
    const offen = eintrag('t1', '2026-09-09', 'p-a')
    const selbst = eintrag('t1', '2026-09-09', 'p-b', true)
    const bestaetigt = eintrag('t2', '2026-09-12', 'p-b')
    const gemeldet = eintrag('t2', '2026-09-12', 'p-c')
    const vorbei = eintrag('t1', '2026-09-02', 'p-c')
    const liste = ozOffeneMeldungen(
      [MITTWOCH, SAMSTAG],
      [offen, selbst, bestaetigt, gemeldet, vorbei],
      [ANNA, BERT, CARL],
      { [ozTaskKey(bestaetigt)]: 'bestätigt' },
      { [`${ozTaskKey(gemeldet)} Carl Test`]: '2026-09-06T10:00:00Z' },
      HEUTE,
    )
    expect(liste).toEqual([{ key: ozTaskKey(offen), name: 'Anna Test' }])
  })

  it('ein kommender Eintrag am alten Wochentag geht nicht hinaus — der von heute schon (4.10.2026)', () => {
    // Der Termin liegt inzwischen auf Donnerstag; Anna und Bert stehen noch am
    // Mittwoch — Überbleibsel eines Wechsels, den die App nicht ganz abräumte.
    const donnerstag: OzTermin = { ...MITTWOCH, wd: 4 }
    const heute = eintrag('t1', '2026-09-09', 'p-a')
    const naechsteWoche = eintrag('t1', '2026-09-16', 'p-b')
    const amNeuenTag = eintrag('t1', '2026-09-17', 'p-c')
    const liste = ozOffeneMeldungen(
      [donnerstag],
      [heute, naechsteWoche, amNeuenTag],
      [ANNA, BERT, CARL],
      {},
      {},
      new Date(2026, 8, 9, 9, 0), // Mittwoch, 9. September
    )
    expect(liste.map((m) => m.name)).toEqual(['Anna Test', 'Carl Test'])
  })

  it('wann zuletzt etwas hinausging — nur aus dem eigenen Schlüsselraum', () => {
    expect(
      ozZuletztGesendet({
        'oz|2026-09-07|a Anna Test': '2026-09-05T10:00:00Z',
        'oz|2026-09-14|b Bert Test': '2026-09-06T10:00:00Z',
        '2026-09-07|mid|ratgeber Carl Test': '2026-09-07T10:00:00Z',
      }),
    ).toBe('2026-09-06T10:00:00Z')
    expect(ozZuletztGesendet({})).toBeNull()
  })
})

describe('Der Stand für die Planungs-Karte', () => {
  it('freie Plätze nur in den ersten Wochen und ohne Vergangenes', () => {
    const schichten = ozSchichten([MITTWOCH], [eintrag('t1', '2026-09-09', 'p-a')], AB, 13)
    expect(ozFreieSchichten(schichten, AB, 2, HEUTE).map((s) => `${s.datum}:${s.frei}`)).toEqual([
      '2026-09-09:1',
      '2026-09-16:2',
    ])
    // Am Donnerstag ist der erste Mittwoch vorbei.
    expect(ozFreieSchichten(schichten, AB, 2, new Date(2026, 8, 10, 9)).map((s) => s.datum)).toEqual(['2026-09-16'])
  })

  it('Konflikte im ganzen Vierteljahr, freie Plätze in vier Wochen, Versand nur, wenn er geht', () => {
    const urlaub: Absence = { id: 'u', personId: 'p-a', userId: null, from: '2026-11-25', to: '2026-11-25', reason: '' }
    const args = {
      termine: [MITTWOCH],
      eintraege: [eintrag('t1', '2026-09-09', 'p-b'), eintrag('t1', '2026-11-25', 'p-a', true)],
      persons: [ANNA, BERT],
      absences: [urlaub],
      confirmations: {},
      sentLog: {},
      sendenMoeglich: true,
      heute: HEUTE,
    }
    // Der 25. November liegt in Woche 12 — weit hinter den vier Wochen, aber im Vierteljahr.
    expect(ozStand(args)).toEqual({ konflikte: 1, frei: 7, nichtGesendet: 1 })
    expect(ozStand({ ...args, sendenMoeglich: false }).nichtGesendet).toBe(0)
    expect(ozStand({ ...args, termine: [] })).toEqual({ konflikte: 0, frei: 0, nichtGesendet: 0 })
  })
})

describe('Entzug: wer einen zugesagten Eintrag verliert', () => {
  const zugesagt = eintrag('t1', '2026-09-09', 'p-a')
  const selbst = eintrag('t1', '2026-09-09', 'p-b', true)
  const unbestaetigt = eintrag('t2', '2026-09-12', 'p-c')
  const conf = { [ozTaskKey(zugesagt)]: 'bestätigt' as const }

  it('bestätigt oder selbst eingetragen — beides ist eine Zusage', () => {
    const weg = ozEntzogeneZusagen([MITTWOCH, SAMSTAG], [zugesagt, selbst, unbestaetigt], [], [ANNA, BERT, CARL], conf, undefined, HEUTE)
    expect(weg.map((z) => z.name)).toEqual(['Anna Test', 'Bert Test'])
    expect(weg[0]).toEqual({
      key: ozTaskKey(zugesagt),
      name: 'Anna Test',
      pid: 'p-a',
      label: 'Öffentliches Zeugnisgeben',
      datum: 'Mittwoch, 9. September · 10:00–12:00 · Marktplatz',
    })
  })

  it('die eigene Absage ist keine Wegnahme', () => {
    expect(ozEntzogeneZusagen([MITTWOCH], [selbst], [], [BERT], conf, 'p-b', HEUTE)).toEqual([])
  })

  it('Vergangenes nicht, Unverändertes nicht, und keine gelöschte Person', () => {
    const vorbei = eintrag('t1', '2026-09-02', 'p-b', true)
    expect(ozEntzogeneZusagen([MITTWOCH], [vorbei], [], [BERT], conf, undefined, HEUTE)).toEqual([])
    expect(ozEntzogeneZusagen([MITTWOCH], [selbst], [selbst], [BERT], conf, undefined, HEUTE)).toEqual([])
    expect(ozEntzogeneZusagen([MITTWOCH], [selbst], [], [], conf, undefined, HEUTE)).toEqual([])
  })
})

/**
 * **Eine Schicht fällt aus** (4.10.2026): „Es kann ja sein, dass mal eine
 * Woche nichts stattfindet." Der gestrichene Tag steht am Termin
 * (`OzTermin.aus`); die Schicht bleibt in der Liste, damit Planen und Ansehen
 * „Fällt aus" zeigen können — aber ohne Einträge und ohne freien Platz.
 */
describe('Eine gestrichene Schicht', () => {
  const GESTRICHEN: OzTermin = { ...MITTWOCH, aus: ['2026-09-16'] }
  // Ein Eintrag am gestrichenen Tag — die Datenbank räumt ihn ab, bis zum
  // nächsten Laden kann er hier aber noch stehen.
  const uebrig = eintrag('t1', '2026-09-16', 'p-a', true)

  it('bleibt in der Liste, gestrichen, ohne Einträge und ohne Platz — die Wochen davor und danach nicht', () => {
    const schichten = ozSchichten([GESTRICHEN], [uebrig, eintrag('t1', '2026-09-09', 'p-b')], AB, 3)
    expect(schichten.map((s) => `${s.datum} ${s.gestrichen ? 'aus' : `frei ${s.frei}`} ${s.eintraege.length}`)).toEqual([
      '2026-09-09 frei 1 1',
      '2026-09-16 aus 0',
      '2026-09-23 frei 2 0',
    ])
    expect(ozSchicht([GESTRICHEN], [uebrig], 't1', '2026-09-16')).toMatchObject({ gestrichen: true, frei: 0, eintraege: [] })
  })

  it('niemand trägt sich ein, keine Zahl zählt sie: freie Plätze, Konflikte, Karte auf Start', () => {
    const urlaub: Absence = { id: 'u', personId: 'p-a', userId: null, from: '2026-09-16', to: '2026-09-16', reason: '' }
    const schichten = ozSchichten([GESTRICHEN], [uebrig], AB, 2)
    expect(ozKannEintragen(BERT, schichten[1]!, HEUTE)).toBe(false)
    expect(ozFreieSchichten(schichten, AB, 2, HEUTE).map((s) => s.datum)).toEqual(['2026-09-09'])
    // Anna wäre am 16. abwesend — aber an dem Tag findet nichts statt.
    expect(ozKonflikte(schichten, [ANNA], [urlaub], HEUTE)).toEqual([])
    const stand = ozStand({
      termine: [GESTRICHEN],
      eintraege: [uebrig],
      persons: [ANNA],
      absences: [urlaub],
      confirmations: {},
      sentLog: {},
      sendenMoeglich: true,
      heute: HEUTE,
    })
    // Vier Wochen zu zwei Plätzen, eine davon fällt aus.
    expect(stand).toMatchObject({ konflikte: 0, frei: 6 })
  })

  it('automatisch besetzt wird sie nicht', () => {
    let n = 0
    const schichten = ozSchichten([GESTRICHEN], [], AB, 2)
    const neu = ozAutoAssign({ schichten, persons: [ANNA, BERT, CARL], absences: [], neueId: () => `n${++n}`, heute: HEUTE })
    expect(neu.map((e) => e.datum)).toEqual(['2026-09-09', '2026-09-09'])
  })

  it('ein übrig gebliebener Eintrag ist keine Aufgabe mehr', () => {
    const anderer = eintrag('t1', '2026-09-09', 'p-a', true)
    expect(deriveMyOzTasks([GESTRICHEN], [uebrig, anderer], 'p-a', {}).map((t) => t.id)).toEqual([ozTaskKey(anderer)])
  })
})
