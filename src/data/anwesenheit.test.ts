/**
 * **Die Anwesenden einer Zusammenkunft** (T152): wer sie eintragen darf, ab
 * wann es etwas zu zählen gibt, und wie die Auswertung daraus je Monat den
 * Durchschnitt rechnet.
 *
 * Verteidigt wird, was der Saalordner und der Planer erleben: Der Saalordner
 * sieht das Eintragen nur in seiner Zusammenkunft und erst ab ihrem Beginn; ein
 * Mikrofon-Helfer nie. Die Auswertung zählt nach dem Tag der Zusammenkunft —
 * ein Sonntag am Monatsanfang gehört dem neuen Monat —, und eine Zusammenkunft
 * ohne Zahl fehlt im Durchschnitt nicht still, sondern steht als „Ohne Zahl" da.
 */
import { describe, expect, it } from 'vitest'
import {
  anwesendeAusEingabe,
  anwesendGesamt,
  anwesenheitJeMonat,
  beginnVon,
  darfAnwesenheit,
  heuteZuZaehlen,
  zaehltSchon,
  type Anwesenheit,
} from './anwesenheit'
import type { MeetingTimes, Week } from './types'
import { anwesenheitToRow } from '../lib/zeilen'

const ZEITEN: MeetingTimes = { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } }
const SIMON = { id: 'p9', name: 'Simon Krüger' }

/** Eine Woche mit Saalordner und Zoom-Ordner unter der Woche, am Wochenende nur einem Mikrofon. */
function woche(start: string, over: Partial<Week> = {}): Week {
  return {
    range: '', book: '', start,
    mid: { date: '', end: '', sections: [], helpers: { saal: [{ name: 'Simon Krüger', pid: 'p9' }], zoom: [{ name: 'Lena Hoffmann', pid: 'p4' }] } },
    we: { date: '', end: '', sections: [], helpers: { mik: [{ name: 'Simon Krüger', pid: 'p9' }] } },
    ...over,
  }
}

const eintrag = (w: string, tab: 'mid' | 'we', saal: number | null, video: number | null): Anwesenheit => ({ woche: w, tab, saal, video, pid: null })

describe('Wer die Anwesenden eintragen darf', () => {
  it('der Saalordner und der Zoom-Ordner ihrer Zusammenkunft', () => {
    expect(darfAnwesenheit(woche('2026-09-07'), 'mid', SIMON, false)).toBe(true)
    expect(darfAnwesenheit(woche('2026-09-07'), 'mid', { id: 'p4', name: 'Lena Hoffmann' }, false)).toBe(true)
  })

  it('nicht, wer in derselben Zusammenkunft nur ein Mikrofon hat — und nicht in einer anderen', () => {
    expect(darfAnwesenheit(woche('2026-09-07'), 'we', SIMON, false)).toBe(false)
    expect(darfAnwesenheit(woche('2026-09-07'), 'mid', { id: 'p1', name: 'Manfred Albrecht' }, false)).toBe(false)
  })

  it('wer zuteilt, immer — auch ohne Platz und ohne eigene Person', () => {
    expect(darfAnwesenheit(woche('2026-09-07'), 'we', null, true)).toBe(true)
  })

  it('Id vor Name: Ein Namensvetter mit anderer Id darf nicht, beim Altbestand ohne Id zählt der Name', () => {
    expect(darfAnwesenheit(woche('2026-09-07'), 'mid', { id: 'p99', name: 'Simon Krüger' }, false)).toBe(false)
    const alt = woche('2026-09-07')
    alt.mid.helpers.saal = [{ name: 'Simon Krüger' }]
    expect(darfAnwesenheit(alt, 'mid', { id: 'p99', name: 'Simon Krüger' }, false)).toBe(true)
  })

  it('ohne eigene Person nichts', () => {
    expect(darfAnwesenheit(woche('2026-09-07'), 'mid', null, false)).toBe(false)
  })
})

describe('Ab wann es etwas zu zählen gibt', () => {
  it('ab dem Beginn der Zusammenkunft — Tag und Uhrzeit, nicht schon am Morgen', () => {
    const w = woche('2026-09-07')
    expect(beginnVon(w, 'mid', ZEITEN)).toEqual(new Date(2026, 8, 8, 19, 0))
    expect(zaehltSchon(w, 'mid', ZEITEN, new Date(2026, 8, 8, 18, 59))).toBe(false)
    expect(zaehltSchon(w, 'mid', ZEITEN, new Date(2026, 8, 8, 19, 0))).toBe(true)
  })

  it('eine verlegte Zusammenkunft zählt ab ihrem neuen Tag und ihrer neuen Zeit', () => {
    const w = woche('2026-09-07', { dev: { mid: { wd: 4, time: '18:30' } } })
    expect(beginnVon(w, 'mid', ZEITEN)).toEqual(new Date(2026, 8, 10, 18, 30))
  })

  it('eine ausgefallene nie', () => {
    const w = woche('2026-09-07', { dev: { mid: { cancelled: true } } })
    expect(zaehltSchon(w, 'mid', ZEITEN, new Date(2026, 8, 9, 12, 0))).toBe(false)
  })
})

describe('Die Karte auf dem Start: heute, begonnen, eigener Platz', () => {
  const weeks = [woche('2026-09-07'), woche('2026-09-14')]

  it('am Dienstag ab 19 Uhr die eigene Zusammenkunft — nur sie', () => {
    const zaehlen = heuteZuZaehlen(weeks, ZEITEN, SIMON, new Date(2026, 8, 8, 19, 5))
    expect(zaehlen.map(({ week, tab }) => `${week.start}|${tab}`)).toEqual(['2026-09-07|mid'])
  })

  it('vorher nichts, am nächsten Tag nichts mehr', () => {
    expect(heuteZuZaehlen(weeks, ZEITEN, SIMON, new Date(2026, 8, 8, 18, 0))).toEqual([])
    expect(heuteZuZaehlen(weeks, ZEITEN, SIMON, new Date(2026, 8, 9, 8, 0))).toEqual([])
  })

  it('am Sonntag nicht — dort hat Simon ein Mikrofon, nicht den Saal', () => {
    expect(heuteZuZaehlen(weeks, ZEITEN, SIMON, new Date(2026, 8, 13, 10, 30))).toEqual([])
  })
})

describe('Die Anwesenheit je Monat', () => {
  // September: zwei Zusammenkünfte unter der Woche mit Zahl, der 15.9. ohne.
  // Die Woche ab 28.9. gibt ihren Sonntag, den 4.10., dem Oktober.
  const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((s) => woche(s))
  const liste = [
    eintrag('2026-09-07', 'mid', 60, 20),
    eintrag('2026-09-21', 'mid', 61, 22),
    eintrag('2026-09-07', 'we', 90, null),
    eintrag('2026-09-14', 'we', 80, 15),
    eintrag('2026-09-21', 'we', null, 25),
    eintrag('2026-09-28', 'we', 100, 10),
  ]
  const heute = new Date(2026, 9, 12, 9, 0)
  const monate = anwesenheitJeMonat(liste, weeks, ZEITEN, '2026-09-01', '2026-10-01', heute)

  it('der jüngste Monat zuerst', () => {
    expect(monate.map((m) => m.monat)).toEqual(['2026-10-01', '2026-09-01'])
  })

  it('Durchschnitt aus Saal und Video, ganz gerundet — 80 und 83 ergeben 82', () => {
    const sept = monate[1]!
    expect(sept.je.mid).toMatchObject({ anzahl: 2, summe: 163, schnitt: 82 })
    // Fehlt eine der beiden Zahlen, zählt die andere: 90, 95, 25.
    expect(sept.je.we).toMatchObject({ anzahl: 3, summe: 210, schnitt: 70 })
  })

  it('der Sonntag, 4. Oktober, gehört dem Oktober, obwohl seine Woche im September beginnt', () => {
    expect(monate[0]!.je.we).toMatchObject({ anzahl: 1, summe: 110, schnitt: 110 })
  })

  it('wo eine Zusammenkunft stattfand und keine Zahl hat, steht sie unter „Ohne Zahl" — mit ihrer Woche', () => {
    expect(monate[1]!.je.mid.fehlt).toEqual([
      { tag: '2026-09-15', woche: '2026-09-14' },
      { tag: '2026-09-29', woche: '2026-09-28' },
    ])
    expect(monate[1]!.je.we.fehlt).toEqual([])
  })

  it('eine ausgefallene Zusammenkunft fehlt nicht — und was noch kommt, auch nicht', () => {
    const mitAusfall = weeks.map((w) => (w.start === '2026-09-14' ? { ...w, dev: { mid: { cancelled: true } } } : w))
    const am16 = anwesenheitJeMonat(liste, mitAusfall, ZEITEN, '2026-09-01', '2026-09-01', new Date(2026, 8, 16, 9, 0))
    expect(am16[0]!.je.mid.fehlt).toEqual([])
  })

  it('eine Art ohne eine einzige Zahl hat keinen Durchschnitt — nicht 0', () => {
    const nurSonntag = anwesenheitJeMonat([eintrag('2026-09-07', 'we', 90, null)], weeks, ZEITEN, '2026-09-01', '2026-09-01', heute)
    expect(nurSonntag[0]!.je.mid).toMatchObject({ anzahl: 0, schnitt: null })
    expect(nurSonntag[0]!.je.we.schnitt).toBe(90)
  })

  /*
   * Betreiber 31.10.2026: Fehlen kann eine Zahl erst ab der ersten
   * Zusammenkunft mit Zahl. Ein Neuaufbau holt ein Jahr Wochen, aber keine
   * Anwesenden — ohne diese Grenze stünde jede Zusammenkunft des Jahres unter
   * „Ohne Zahl", und die Kachel nennte rund hundert, die niemand nachtragen kann.
   */
  it('vor der ersten Zusammenkunft mit Zahl fehlt nichts — danach jede ohne', () => {
    // Die erste Zahl am Dienstag, 22.9.: 8.9., 13.9., 15.9. und 20.9. fehlen nicht.
    const ab22 = anwesenheitJeMonat([eintrag('2026-09-21', 'mid', 61, 22)], weeks, ZEITEN, '2026-09-01', '2026-10-01', heute)
    const [oktober, september] = ab22
    expect(september!.je.mid.fehlt).toEqual([{ tag: '2026-09-29', woche: '2026-09-28' }])
    expect(september!.je.we.fehlt).toEqual([{ tag: '2026-09-27', woche: '2026-09-21' }])
    expect(oktober!.je.we.fehlt).toEqual([{ tag: '2026-10-04', woche: '2026-09-28' }])
  })

  it('die erste Zahl zählt aus allem Geladenen — nicht nur aus dem gezeigten Zeitraum', () => {
    // Gezeigt wird nur der Oktober; gezählt wird seit dem 8.9. Der Sonntag 4.10. fehlt.
    const nurOktober = anwesenheitJeMonat([eintrag('2026-09-07', 'mid', 60, 20)], weeks, ZEITEN, '2026-10-01', '2026-10-01', heute)
    expect(nurOktober).toHaveLength(1)
    expect(nurOktober[0]!.je.we.fehlt).toEqual([{ tag: '2026-10-04', woche: '2026-09-28' }])
  })

  it('ohne eine einzige Zahl fehlt nichts — kein Monat mit „Ohne Zahl"', () => {
    expect(anwesenheitJeMonat([], weeks, ZEITEN, '2026-09-01', '2026-10-01', heute)).toEqual([])
    // Auch nicht eine Zeile ohne Zahl (beide Felder leer): Sie zählt nicht als erste.
    expect(anwesenheitJeMonat([eintrag('2026-09-07', 'mid', null, null)], weeks, ZEITEN, '2026-09-01', '2026-10-01', heute)).toEqual([])
  })

  it('Monate außerhalb des Zeitraums bleiben draußen', () => {
    const nurOktober = anwesenheitJeMonat(liste, weeks, ZEITEN, '2026-10-01', '2026-10-01', heute)
    expect(nurOktober.map((m) => m.monat)).toEqual(['2026-10-01'])
  })
})

describe('Was im Feld steht', () => {
  it('leer heißt „nicht eingetragen", nicht 0', () => {
    expect(anwesendeAusEingabe('')).toBeNull()
    expect(anwesendeAusEingabe('  ')).toBeNull()
  })

  it('Ziffern bis 9999; alles andere ist ungültig', () => {
    expect(anwesendeAusEingabe('87')).toBe(87)
    expect(anwesendeAusEingabe(' 0 ')).toBe(0)
    for (const falsch of ['-3', '8,5', '1e3', '10000', 'acht']) expect(anwesendeAusEingabe(falsch), falsch).toBe('ungueltig')
  })

  it('arabisch-indische und persische Ziffern zählen wie 0–9 — so tippen die Tastaturen in ar und fa (Review 30.10.2026)', () => {
    // Als Zeichencodes: Die Ziffern selbst im Quelltext läse niemand nach.
    expect(anwesendeAusEingabe(String.fromCharCode(0x668, 0x667))).toBe(87)
    expect(anwesendeAusEingabe(String.fromCharCode(0x6f1, 0x6f2, 0x6f0))).toBe(120)
    expect(anwesendeAusEingabe(String.fromCharCode(0x6f1, 0x6f0, 0x6f0, 0x6f0, 0x6f0))).toBe('ungueltig')
  })

  it('zusammen nur, wenn eine der beiden Zahlen da ist', () => {
    expect(anwesendGesamt({ saal: null, video: null })).toBeNull()
    expect(anwesendGesamt({ saal: 0, video: null })).toBe(0)
    expect(anwesendGesamt({ saal: 64, video: 23 })).toBe(87)
  })
})

describe('Was in die Datenbank geht', () => {
  /*
   * Nur die genannten Zahlen: Eine fehlende Spalte lässt das Upsert stehen,
   * eine mitgeschickte `null` löscht. Schickte der Zoom-Ordner den Saal mit,
   * löschte sein leeres Feld die Zahl des Saalordners.
   */
  const EINTRAG: Anwesenheit = { woche: '2026-09-07', tab: 'we', saal: null, video: 23, pid: 'p2' }

  it('nur das Video — der Saal fehlt in der Zeile, statt als null mitzugehen', () => {
    expect(anwesenheitToRow(EINTRAG, 'c1', ['video'])).toEqual({ congregation_id: 'c1', woche: '2026-09-07', zusammenkunft: 'we', video: 23 })
  })

  it('beide, wenn beide sich geändert haben — eine geleerte als null', () => {
    expect(anwesenheitToRow(EINTRAG, 'c1', ['saal', 'video'])).toEqual({ congregation_id: 'c1', woche: '2026-09-07', zusammenkunft: 'we', saal: null, video: 23 })
  })
})
