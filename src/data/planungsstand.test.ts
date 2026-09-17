import { describe, expect, it } from 'vitest'
import { buildAbsences } from './absence'
import { emptyQualifications, serviceQualKey } from './helpers'
import { loadedUntilMs } from '../lib/import'
import { helperTaskKey, itemTaskKey, sentKey } from './planning'
import { fsTaskKey } from './fs'
import {
  planungsstand,
  VORRAT_TAGE,
  WOCHEN_VORAUS,
  type PlanungsQuellen,
  type Wochenstand,
} from './planungsstand'
import type {
  Absence,
  ConfirmationMap,
  FsInstance,
  PartItem,
  Person,
  SentLog,
  Service,
  Week,
} from './types'

/**
 * **Die Planungs-Karte des Start-Bildschirms: was der Planer in den kommenden
 * Wochen noch zu tun hat (T95).**
 *
 * Verteidigt werden drei Zusagen, an denen der Planer handelt:
 *
 *  1. **Die richtigen Wochen.** Ab der laufenden Kalenderwoche, höchstens vier,
 *     und nur, wo etwas zu tun ist. Die alte Kachel nannte allein die laufende
 *     Woche — die Arbeit liegt in den nächsten.
 *  2. **Was vorbei ist, zählt nicht** (T77). Am Donnerstag ist der offene Platz
 *     vom Dienstag keine Aufgabe mehr. Stünde er da, hätte die Karte bis Sonntag
 *     eine Zahl, die niemand abarbeiten kann — und würde danach übersehen.
 *  3. **Jede Zahl ist die des gleichnamigen Banners in Planen** — Konflikte,
 *     nicht besetzbar, offene Zuteilungen, Plan senden. Eine eigene Zählweise
 *     liefe auseinander, und dann fände der Planer die Zahl dort nicht wieder.
 *
 * Dazu der Import-Hinweis: Die Programme holt niemand von selbst. Wer ihn
 * vergisst, plant ins Leere.
 *
 * Die Versammlung dieser Tests hält die Zusammenkünfte dienstags 19:00 und
 * sonntags 10:00; die Wochen tragen wie importierte Wochen nur die
 * Wochenspanne im `date`-Feld, der Tag wird gerechnet.
 */

const MEETINGS = 'Di 19:00 · So 10:00'
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Montage im September/Oktober 2026. */
const A = '2026-09-07'
const B = '2026-09-14'
const C = '2026-09-21'
const D = '2026-09-28'
const E = '2026-10-05'
const F = '2026-10-12'

/** Ein Zeitpunkt im September 2026 (örtlich). */
const am = (tag: number, stunde = 9, monat = 8): Date => new Date(2026, monat, tag, stunde, 0)

const person = (id: string, ...bereiche: string[]): Person => {
  const priv = emptyQualifications()
  for (const b of bereiche) priv[b] = true
  return { id, fn: id, ln: 'Test', role: 'verkuendiger', female: false, tel: '', mail: '', priv }
}

/**
 * Genug Leute für jeden Platz — damit „nicht besetzbar" nur dort anschlägt, wo
 * ein Test es will.
 */
const GENUG = ['p1', 'p2', 'p3', 'p4'].map((id) => person(id, 'bibellesung', serviceQualKey('mik')))

/**
 * Eine Woche, wie der Import sie ablegt: Unter der Woche eine Bibellesung und
 * zwei Mikrofone, am Wochenende zwei Mikrofone — alles offen, zusammen fünf
 * Plätze.
 */
function woche(start: string, over: Partial<Week> = {}): Week {
  return {
    range: `Woche ${start}`,
    book: '',
    start,
    current: false,
    mid: {
      date: '7.–13. September',
      end: '',
      sections: [
        {
          label: 'SCHÄTZE AUS GOTTES WORT',
          farbe: 'petrol',
          items: [{ iid: 'i49', num: 3, title: 'Bibellesung', meta: '', names: [{ name: '', bereichsKey: 'bibellesung' }] }],
        },
      ],
      helpers: { mik: [] },
    },
    we: { date: '7.–13. September', end: '', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

/** Dieselbe Woche, vollständig besetzt. */
function fertigeWoche(start: string): Week {
  const w = woche(start)
  ;(w.mid.sections[0]!.items[0] as PartItem).names[0] = { name: 'p1 Test', pid: 'p1', bereichsKey: 'bibellesung' }
  w.mid.helpers.mik = [{ name: 'p2 Test', pid: 'p2' }, { name: 'p3 Test', pid: 'p3' }]
  w.we.helpers.mik = [{ name: 'p2 Test', pid: 'p2' }, { name: 'p4 Test', pid: 'p4' }]
  return w
}

/** Alle Plätze einer fertigen Woche als bereits gesendet. */
function gesendet(w: Week): SentLog {
  const log: SentLog = {}
  const k = (key: string, name: string) => (log[sentKey(key, name)] = '2026-09-01T08:00:00Z')
  const start = w.start
  k(itemTaskKey(start, 'mid', (w.mid.sections[0]!.items[0] as PartItem).iid, 0), 'p1 Test')
  for (const tab of ['mid', 'we'] as const) {
    for (const [pos, slot] of (w[tab].helpers.mik ?? []).entries()) {
      k(helperTaskKey(start, tab, 'mik', pos), slot.name)
    }
  }
  return log
}

const treffpunkt = (id: string, wd: number, over: Partial<FsInstance> = {}): FsInstance => ({
  id, ruleId: id, grp: '', wd, time: '09:30', place: 'Königreichssaal', leader: '', ...over,
})

/** Die Quellen, mit ruhigen Vorgaben: genug Leute, nichts abwesend, nichts gesendet. */
function quellen(over: Partial<PlanungsQuellen> & { weeks: Week[] }): PlanungsQuellen {
  const absences: readonly Absence[] = over.absences ?? []
  const fsBase = new Date(2026, 8, 7, 12)
  return {
    fsWeeks: [],
    fsBase,
    persons: GENUG,
    services: DIENSTE,
    confirmations: {},
    sentLog: {},
    meetings: MEETINGS,
    geladenBisMs: loadedUntilMs(over.weeks),
    sendenMoeglich: true,
    ...over,
    absences,
    abwesend: over.abwesend ?? buildAbsences(absences, over.weeks, fsBase, MEETINGS),
  }
}

/** Die Wochen der Karte, an ihrem Montag benannt — so lesen sich Fehlschläge. */
const montage = (weeks: Week[], wochen: Wochenstand[]): string[] =>
  wochen.map((w) => weeks[w.wi]?.start ?? '?')

/* ---- 1. Die richtigen Wochen ---------------------------------------------- */

describe('Die Karte schaut auf die kommenden Wochen, nicht auf die laufende', () => {
  it('eine vergangene Woche mit offenen Plätzen steht nicht da — niemand kann sie noch besetzen', () => {
    const weeks = [woche(A), woche(B)]
    // Montag der Woche B: Die Woche A ist ganz vorbei, ihre fünf Plätze offen.
    const { wochen } = planungsstand(quellen({ weeks }), am(14))
    expect(montage(weeks, wochen)).toEqual([B])
  })

  it('liegt heute in keiner geladenen Woche, beginnt sie bei der nächsten — nicht bei der ältesten', () => {
    /*
      Die App lädt ein Jahr zurück (lib/data.ts), und die Woche B fehlt im
      Bestand. Wer „ab der laufenden Woche" rechnet, findet keine und fällt auf
      die erste geladene zurück. Die vier Zeilen der Karte gingen dann an vier
      vergangene Wochen — die zählen nichts mehr und stehen nicht da —, und die
      kommende Woche C mit ihren offenen Plätzen fiele heraus. Die Karte zeigte
      „nichts zu tun".

      Mit nur einer vergangenen Woche davor hätte der Test das nicht bemerkt:
      Sie fällt ohnehin heraus, und für C bleibt eine Zeile übrig. Genau so
      stand er zuerst da — die Mutationsprobe hat ihn als zahnlos entlarvt.
    */
    const weeks = [
      woche('2026-08-10'), woche('2026-08-17'), woche('2026-08-24'), woche('2026-08-31'),
      woche(A), woche(C),
    ]
    const { wochen } = planungsstand(quellen({ weeks }), am(16))
    expect(montage(weeks, wochen)).toEqual([C])
  })

  it('am Sonntag zählt die laufende Woche noch — die Zusammenkunft ist heute', () => {
    // Tagesgenau wie überall (`naechsteZusammenkunft`): Wann eine Zusammenkunft
    // zu Ende ist, weiß niemand; ab dem Tag danach ist sie unstrittig vorbei.
    const weeks = [woche(A), woche(B)]
    const { wochen } = planungsstand(quellen({ weeks }), am(13, 20))
    expect(montage(weeks, wochen)).toEqual([A, B])
  })

  it(`höchstens ${WOCHEN_VORAUS} Wochen, auch wenn mehr geladen sind`, () => {
    // Acht frisch importierte Wochen wären acht Zeilen „offen" — und die eine,
    // um die es heute geht, ginge darin unter.
    const weeks = [woche(A), woche(B), woche(C), woche(D), woche(E), woche(F)]
    // Am Sonntag: Die Zusammenkunft heute gehört zur Woche A, und vier
    // Kalenderwochen reichten bis in die Woche E. Es bleibt bei vier Zeilen.
    const { wochen } = planungsstand(quellen({ weeks }), am(13, 8))
    expect(montage(weeks, wochen)).toEqual([A, B, C, D])
  })

  it('eine Lücke im Bestand streckt den Horizont nicht über vier Kalenderwochen hinaus', () => {
    // C und D fehlen (T66: eine fehlende Woche verschiebt nichts). Nach Zeilen
    // gezählt reichten „vier Wochen" sonst bis Mitte Oktober.
    const weeks = [woche(A), woche(B), woche(E), woche(F)]
    const { wochen } = planungsstand(quellen({ weeks }), am(7))
    expect(montage(weeks, wochen)).toEqual([A, B])
  })

  it('eine fertig geplante und gesendete Woche erscheint gar nicht', () => {
    const fertig = fertigeWoche(A)
    const weeks = [fertig, woche(B)]
    const { wochen } = planungsstand(quellen({ weeks, sentLog: gesendet(fertig) }), am(7))
    expect(montage(weeks, wochen)).toEqual([B])
  })

  it('ist alles vorbei, gibt es keine Zeile — aber den Hinweis auf den Import', () => {
    const weeks = [woche(A), woche(B)]
    const stand = planungsstand(quellen({ weeks }), am(5, 9, 9)) // 5. Oktober
    expect(stand.wochen).toEqual([])
    expect(stand.vorratKnapp).toBe(true)
  })

  it('ohne Kalenderdaten (Demo, Vorlagen) gilt die als laufend markierte Woche', () => {
    // Eine Woche ohne Kennung trägt ein leeres `start` (T66).
    const ohne = (current: boolean): Week => woche('', { current })
    const weeks = [ohne(false), ohne(true), ohne(false)]
    const { wochen } = planungsstand(quellen({ weeks, geladenBisMs: null }), am(7))
    expect(wochen.map((w) => w.wi)).toEqual([1, 2])
  })
})

/* ---- 2. Was vorbei ist, zählt nicht --------------------------------------- */

describe('Was in der Woche schon vorbei ist, zählt nicht mehr (T77)', () => {
  it('am Donnerstag zählen nur die Plätze vom Sonntag — der Dienstag ist gewesen', () => {
    const weeks = [woche(A)]
    const [a] = planungsstand(quellen({ weeks }), am(10)).wochen
    // Zwei Mikrofone am Sonntag. Die Bibellesung und die zwei Mikrofone vom
    // Dienstag sind nicht mehr zu besetzen.
    expect(a?.offen).toBe(2)
    expect(a?.tab).toBe('we')
  })

  it('Gegenprobe: am Montag zählt die ganze Woche', () => {
    const [a] = planungsstand(quellen({ weeks: [woche(A)] }), am(7)).wochen
    expect(a?.offen).toBe(5)
    expect(a?.tab).toBe('mid')
  })

  it('ein Treffpunkt ohne Leiter zählt, solange sein Tag nicht vorbei ist', () => {
    const weeks = [fertigeWoche(A)]
    // Montag 7.9. und Samstag 12.9., beide ohne Leiter — gesehen am Mittwoch.
    const fsWeeks = [[treffpunkt('mo', 1), treffpunkt('sa', 6)]]
    const [a] = planungsstand(quellen({ weeks, fsWeeks, sentLog: gesendet(weeks[0]!) }), am(9)).wochen
    expect(a?.offen).toBe(1)
    // Nichts in den Zusammenkünften offen: Planen öffnet bei den Treffpunkten.
    expect(a?.tab).toBe('fs')
  })

  it('„Plan senden" zählt keine Zuteilung, deren Zusammenkunft vorbei ist', () => {
    // Am Donnerstag noch eine Nachricht über den Dienstag zu verlangen hieße,
    // um etwas zu bitten, das keinem mehr nützt.
    const weeks = [fertigeWoche(A)]
    const [a] = planungsstand(quellen({ weeks }), am(10)).wochen
    // Sonntag: p2 und p4 an den Mikrofonen — die drei vom Dienstag fallen weg.
    expect(a?.nichtGesendet).toBe(2)
  })

  it('eine entfallene Zusammenkunft zählt gar nicht (T30) — ihre Plätze braucht niemand', () => {
    const weeks = [woche(A, { dev: { we: { cancelled: true, reason: 'Kongress' } } })]
    const [a] = planungsstand(quellen({ weeks }), am(7)).wochen
    expect(a?.offen).toBe(3)
  })
})

/* ---- 3. Die Zahlen der Banner --------------------------------------------- */

describe('Jede Zahl ist die des gleichnamigen Banners in Planen', () => {
  it('offene Zuteilungen: alle Plätze beider Zusammenkünfte und die Treffpunkte ohne Leiter', () => {
    const weeks = [woche(A)]
    const fsWeeks = [[treffpunkt('sa', 6), treffpunkt('sa2', 6, { leader: 'p1 Test', lpid: 'p1' })]]
    const [a] = planungsstand(quellen({ weeks, fsWeeks }), am(7)).wochen
    expect(a?.offen).toBe(6) // 1 Bibellesung + 4 Mikrofone + 1 Treffpunkt
  })

  it('nicht besetzbar: an einem Tag weniger Leute da als Plätze (T96)', () => {
    // Nur einer kann Mikrofone, zwei Plätze je Zusammenkunft: je einer bleibt
    // offen, egal wie gut geplant wird.
    const persons = [person('p1', 'bibellesung', serviceQualKey('mik'))]
    const [a] = planungsstand(quellen({ weeks: [woche(A)], persons }), am(7)).wochen
    expect(a?.nichtBesetzbar).toBe(2)
    expect(a?.offen).toBe(5)
  })

  it('nicht besetzbar kann ohne offene Zuteilung stehen — wenn die Eingeteilten nachträglich fehlen', () => {
    /*
     * Die Engpass-Rechnung zählt alle Plätze gegen die Leute, die an dem Tag da
     * sind — besetzte eingeschlossen. Melden sich zwei Eingeteilte später
     * abwesend, ist nichts offen, und trotzdem reichen die Leute nicht. Wer
     * `nichtBesetzbar` für einen Teil von `offen` hielte, rechnete hier negativ.
     */
    const w = fertigeWoche(A)
    const persons = [
      person('p1', 'bibellesung', serviceQualKey('mik')),
      person('p2', serviceQualKey('mik')),
      person('p3', serviceQualKey('mik')),
    ]
    const absences: Absence[] = [
      // p2 und p3 stehen am Dienstag an den Mikrofonen und sind beide weg.
      { id: 'a', personId: 'p2', userId: null, from: '2026-09-08', to: '2026-09-08', reason: '' },
      { id: 'b', personId: 'p3', userId: null, from: '2026-09-08', to: '2026-09-08', reason: '' },
    ]
    const [a] = planungsstand(quellen({ weeks: [w], persons, absences, sentLog: gesendet(w) }), am(7)).wochen
    expect(a?.offen).toBe(0)
    expect(a?.nichtBesetzbar).toBeGreaterThan(0)
    expect(a?.konflikte).toBe(2)
  })

  it('Gegenprobe: mit genug Leuten ist nichts „nicht besetzbar"', () => {
    const [a] = planungsstand(quellen({ weeks: [woche(A)] }), am(7)).wochen
    expect(a?.nichtBesetzbar).toBe(0)
  })

  it('nicht besetzbar rechnet mit den Abwesenden des Tages', () => {
    // Zwei können Mikrofone, einer ist am Sonntag weg: Sonntag knapp, Dienstag nicht.
    const persons = [
      person('p1', 'bibellesung', serviceQualKey('mik')),
      person('p2', serviceQualKey('mik')),
    ]
    const absences: Absence[] = [
      { id: 'a', personId: 'p2', userId: null, from: '2026-09-13', to: '2026-09-13', reason: '' },
    ]
    const [a] = planungsstand(quellen({ weeks: [woche(A)], persons, absences }), am(7)).wochen
    expect(a?.nichtBesetzbar).toBe(1)
  })

  it('Konflikte: ein Abwesender, der eingeteilt ist — auch als Treffpunkt-Leiter', () => {
    const w = fertigeWoche(B)
    const absences: Absence[] = [
      // p1 hält am Dienstag die Bibellesung und leitet am Montag einen Treffpunkt.
      { id: 'a', personId: 'p1', userId: null, from: '2026-09-14', to: '2026-09-15', reason: '' },
    ]
    const fsWeeks = [[], [treffpunkt('mo', 1, { leader: 'p1 Test', lpid: 'p1' })]]
    const weeks = [woche(A), w]
    const stand = planungsstand(quellen({ weeks, fsWeeks, absences, sentLog: gesendet(w) }), am(14, 8))
    const b = stand.wochen.find((x) => x.wi === 1)
    expect(b?.konflikte).toBe(2)
  })

  it('Plan senden: nur, wer weder bestätigt hat noch schon benachrichtigt ist', () => {
    const w = fertigeWoche(A)
    const log = gesendet(w)
    // Zwei zurück ins Ungesendete: der eine hat inzwischen bestätigt (weiß also
    // Bescheid), der andere nicht.
    delete log[sentKey(helperTaskKey(A, 'we', 'mik', 0), 'p2 Test')]
    delete log[sentKey(helperTaskKey(A, 'we', 'mik', 1), 'p4 Test')]
    const confirmations: ConfirmationMap = { [helperTaskKey(A, 'we', 'mik', 0)]: 'bestätigt' }
    const [a] = planungsstand(quellen({ weeks: [w], sentLog: log, confirmations }), am(7)).wochen
    expect(a?.nichtGesendet).toBe(1)
  })

  it('Plan senden zählt die Treffpunkt-Leiter mit — der Knopf gilt für die ganze Woche', () => {
    const w = fertigeWoche(A)
    const fsWeeks = [[treffpunkt('sa', 6, { leader: 'p3 Test', lpid: 'p3' })]]
    const [a] = planungsstand(quellen({ weeks: [w], fsWeeks, sentLog: gesendet(w) }), am(7)).wochen
    expect(a?.nichtGesendet).toBe(1)
    // Gesendet, und die Woche verschwindet von der Karte.
    const log = { ...gesendet(w), [sentKey(fsTaskKey(A, 'sa'), 'p3 Test')]: '2026-09-02T08:00:00Z' }
    expect(planungsstand(quellen({ weeks: [w], fsWeeks, sentLog: log }), am(7)).wochen).toEqual([])
  })

  it('offline kein „Plan senden" — Planen zeigt den Knopf dann auch nicht', () => {
    const w = fertigeWoche(A)
    const stand = planungsstand(quellen({ weeks: [w], sendenMoeglich: false }), am(7))
    expect(stand.wochen).toEqual([])
  })

  it('am Donnerstag zählen die Konflikte vom Dienstag nicht mehr, die vom Sonntag schon', () => {
    // p2 ist unter der Woche und am Wochenende eingeteilt — und an beiden Tagen weg.
    const w = fertigeWoche(A)
    const absences: Absence[] = [
      { id: 'a', personId: 'p2', userId: null, from: '2026-09-08', to: '2026-09-13', reason: '' },
    ]
    const [a] = planungsstand(quellen({ weeks: [w], absences, sentLog: gesendet(w) }), am(10)).wochen
    expect(a?.konflikte).toBe(1)
    expect(a?.tab).toBe('we')
  })
})

/* ---- 3b. Die Kongresswoche und der Reiter --------------------------------- */

describe('Eine Woche ohne Zusammenkunft bleibt sichtbar, wenn ihre Treffpunkte etwas brauchen', () => {
  it('Kongresswoche: der offene Treffpunkt am Mittwoch steht da — Planen öffnet bei den Treffpunkten', () => {
    /*
     * In einer Kongresswoche entfallen alle Zusammenkünfte (T30), die Treffpunkte
     * nicht. Wer die Karte bei der nächsten **Zusammenkunft** beginnen ließ,
     * übersprang die ganze Woche — und der fehlende Leiter für übermorgen stand
     * nirgends.
     */
    const kongress = woche(A, { dev: { mid: { cancelled: true }, we: { cancelled: true } } } as Partial<Week>)
    const weeks = [kongress, fertigeWoche(B), fertigeWoche(C), fertigeWoche(D)]
    const log = { ...gesendet(weeks[1]!), ...gesendet(weeks[2]!), ...gesendet(weeks[3]!) }
    const fsWeeks = [[treffpunkt('mi', 3)], [], [], []]
    const { wochen } = planungsstand(quellen({ weeks, fsWeeks, sentLog: log }), am(7))
    expect(montage(weeks, wochen)).toEqual([A])
    expect(wochen[0]).toMatchObject({ offen: 1, tab: 'fs' })
  })

  it('ist nur ein Treffpunkt-Leiter noch nicht benachrichtigt, öffnet Planen bei den Treffpunkten', () => {
    /*
     * Die Wochenmitte zeigte ihn gar nicht, und das Senden-Panel stand erst am
     * Ende einer langen Seite. Bei den Treffpunkten steht er, und das Panel
     * gleich darunter.
     */
    const w = fertigeWoche(A)
    const fsWeeks = [[treffpunkt('sa', 6, { leader: 'p3 Test', lpid: 'p3' })]]
    const [a] = planungsstand(quellen({ weeks: [w], fsWeeks, sentLog: gesendet(w) }), am(7)).wochen
    expect(a).toMatchObject({ nichtGesendet: 1, tab: 'fs' })
  })

  it('Gegenprobe: ist ein Platz der Zusammenkunft ungesendet, öffnet Planen dort', () => {
    const w = fertigeWoche(A)
    const log = gesendet(w)
    delete log[sentKey(helperTaskKey(A, 'we', 'mik', 1), 'p4 Test')]
    const [a] = planungsstand(quellen({ weeks: [w], sentLog: log }), am(7)).wochen
    expect(a).toMatchObject({ nichtGesendet: 1, tab: 'we' })
  })
})

/* ---- 3c. Wofür „Alles zugeteilt" gilt ------------------------------------- */

describe('Die Karte nennt den Zeitraum, den sie angesehen hat', () => {
  it('vom Montag der ersten bis zum Sonntag der letzten Woche', () => {
    // Vier fertige Wochen und dahinter weitere: „Alles zugeteilt" gilt nur für
    // diese vier, und die Karte muss das sagen können.
    const weeks = [A, B, C, D, E].map(fertigeWoche)
    const log = Object.assign({}, ...weeks.map(gesendet)) as SentLog
    const stand = planungsstand(quellen({ weeks, sentLog: log }), am(7))
    expect(stand.wochen).toEqual([])
    expect(stand.zeitraum).toEqual({ vonMs: Date.UTC(2026, 8, 7), bisMs: Date.UTC(2026, 9, 4) })
  })

  it('ohne Kalenderdaten gibt es keinen Zeitraum — dann wird auch keiner behauptet', () => {
    expect(planungsstand(quellen({ weeks: [woche('', { current: true })] }), am(7)).zeitraum).toBeNull()
  })

  it('liegt nichts mehr vor uns, auch nicht', () => {
    expect(planungsstand(quellen({ weeks: [fertigeWoche(A)] }), am(5, 9, 9)).zeitraum).toBeNull()
  })
})

/* ---- 4. Der Vorrat -------------------------------------------------------- */

describe('Reichen die Programme nicht mehr, erinnert die Karte an den Import', () => {
  // Geladen bis Sonntag, 4. Oktober (Woche D).
  const weeks = [woche(A), woche(B), woche(C), woche(D)]

  it(`noch ${VORRAT_TAGE} Tage voraus: still`, () => {
    expect(planungsstand(quellen({ weeks }), am(13)).vorratKnapp).toBe(false)
  })

  it('einen Tag weniger: die Karte erinnert', () => {
    expect(planungsstand(quellen({ weeks }), am(14)).vorratKnapp).toBe(true)
  })

  it('ohne jede Woche erinnert sie immer — der erste Import steht noch aus', () => {
    expect(planungsstand(quellen({ weeks: [] }), am(14)).vorratKnapp).toBe(true)
  })

  it('ohne Kalenderdaten behauptet sie nichts', () => {
    const ohne = woche('')
    expect(planungsstand(quellen({ weeks: [ohne] }), am(14)).vorratKnapp).toBe(false)
  })
})
