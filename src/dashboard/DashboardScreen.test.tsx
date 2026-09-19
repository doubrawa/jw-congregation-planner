/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { helperTaskKey, itemTaskKey, sentKey } from '../data/planning'
import { APP_TO_JW } from '../i18n/langs'
import { dict } from '../i18n/ui'
import type {
  Absence,
  ConfirmationMap,
  FsInstance,
  MyTask,
  PartItem,
  Person,
  S89Payload,
  Service,
  Week,
} from '../data/types'
import { DashboardScreen } from './DashboardScreen'
import { privSetzen } from '../data/helpers'
import { isoDay } from '../data/meeting-dates'

/**
 * **Der Start-Bildschirm — die Landeseite nach dem Anmelden.**
 *
 * Er ist für die meisten Nutzer die ganze App: Gruß, die eigene Zeitleiste der
 * nächsten zwei Wochen, zwei Kacheln. Vier Zusicherungen tragen dabei Fachlogik:
 *
 * - Die **Leiste zeigt ein Fenster**, nicht alles Geplante — und wenn darin
 *   nichts liegt, die nächste Aufgabe dahinter, statt „keine anstehende
 *   Aufgabe" zu behaupten (das Fenster selbst prüft `dash-timeline.test.ts`;
 *   hier geht es darum, dass der Bildschirm es mit dem heutigen Tag aufruft).
 * - **Nach Rolle sortiert** (T95): Der Planer sieht seine Arbeit zuerst, direkt
 *   unter dem Gruß. Ein Verkündiger sieht die Karte gar nicht — er käme über
 *   sie auf einen Screen, den er nicht betreten darf.
 * - Die **Planungs-Karte** nennt die kommenden Wochen, in denen etwas zu tun
 *   ist, mit den Zahlen der Banner in Planen — und was vorbei ist, zählt nicht
 *   (die Regeln selbst prüft `planungsstand.test.ts`; hier geht es darum, dass
 *   der Bildschirm sie mit dem heutigen Tag und dem echten Zustand aufruft).
 * - **Treffpunkt-Leitungen und Abwesenheiten stehen mit darin** — die Leiste
 *   liest `state.myTasks`, wo beide Quellen längst zusammenkommen.
 */

/*
 * Der Import geht in der Produktion an eine Edge Function. Die Testumgebung hat
 * Supabase konfiguriert — ein ungestellter Aufruf liefe gegen das Live-Projekt.
 */
const importNextWeek = vi.hoisted(() => vi.fn())
vi.mock('../lib/import', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  importNextWeek: (...args: unknown[]) => importNextWeek(...args),
  importWeekVariants: () => Promise.resolve({ ok: false, error: 'unbekannt' }),
}))

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}

const S89: S89Payload = {
  name: 'Anton Alt', partner: '', date: 'Di, 8. September · 19:00',
  type: 'Bibellesung', point: 'lmd Lektion 1',
}

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'T1', title: 'Bibellesung', rolle: '', date: 'Di, 8. September · ca. 19:35',
  chip: '', at: null, status: 'offen', s89: null, ...over,
})

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Woche, die den heutigen Tag enthält — damit `currentWeekIndex` sie findet. */
function laufendeWoche(over: Partial<Week> = {}): Week {
  const heute = new Date()
  const montag = new Date(heute)
  montag.setDate(heute.getDate() - ((heute.getDay() + 6) % 7))
  const iso = `${montag.getFullYear()}-${String(montag.getMonth() + 1).padStart(2, '0')}-${String(montag.getDate()).padStart(2, '0')}`
  return {
    range: 'diese Woche', book: '', start: iso, current: false,
    mid: {
      // Anzeigetext, wie ihn der Demo-Bestand trägt. Gerechnet wird der Termin
      // seit T105 aus Kennung, Wochentag und Uhrzeit — aus diesem Feld liest
      // ihn niemand mehr zurück.
      date: 'Dienstag, 8. September · 19:00', end: '20:45',
      sections: [{
        label: 'X', farbe: 'petrol',
        items: [{ iid: 'i2', num: 1, title: 'Bibellesung', meta: '', names: [{ name: '', bereichsKey: 'bibellesung' }] }],
      }],
      helpers: { mik: [] },
    },
    we: { date: 'Sonntag, 13. September · 10:00', end: '11:45', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

/** Der eine Programm-Platz der Wochenmitte — die Testwoche hat genau einen. */
const platz = (w: Week) => (w.mid.sections[0]!.items[0] as PartItem).names[0]!

/** Sein Aufgaben-Schlüssel — über die Kennung des Punkts. */
const platzKey = (w: Week) => itemTaskKey(w.start, 'mid', (w.mid.sections[0]!.items[0] as PartItem).iid, 0)

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'start', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: DIENSTE, groups: [], absences: [],
    weeks: [laufendeWoche()], fsWeeks: [[]], fsRules: [],
    myTasks: [], notifs: [], substituteReqs: [],
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <DashboardScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

afterEach(cleanup)

describe('Gruß und Datum', () => {
  it('begrüßt mit dem Vornamen', () => {
    const { container } = zeige()
    expect(container.querySelector('.dash-greeting')?.textContent).toContain('Anton')
  })

  it('ohne verknüpfte Person bleibt der Name leer statt „undefined"', () => {
    const { container } = zeige({ personId: null })
    expect(container.querySelector('.dash-greeting')?.textContent).not.toContain('undefined')
  })

  it('der Gruß richtet sich nach der Tageszeit', () => {
    vi.useFakeTimers()
    try {
      for (const [stunde, erwartet] of [[8, t.grussMorgen], [13, t.grussTag], [20, t.grussAbend]] as const) {
        vi.setSystemTime(new Date(2026, 8, 8, stunde, 0))
        const { container } = zeige()
        expect(container.querySelector('.dash-greeting')?.textContent).toContain(erwartet)
        cleanup()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('das Datum steht in der Sprache des Lesers', () => {
    const { container } = zeige({ lang: 'de' })
    const eyebrow = container.querySelector('.dash-eyebrow')?.textContent ?? ''
    expect(eyebrow).toMatch(/MONTAG|DIENSTAG|MITTWOCH|DONNERSTAG|FREITAG|SAMSTAG|SONNTAG/)
  })
})

/* ---- Die Zeitleiste: die eigenen Aufgaben der nächsten zwei Wochen -------- */

/** Der Kalendertag in `n` Tagen als UTC-Mitternacht — die Form von `MyTask.at`. */
const inTagen = (n: number): number => {
  const h = new Date()
  return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate() + n)
}

/** Derselbe Tag als ISO-Datum — die Form, in der eine Abwesenheit steht. */
const isoIn = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

const zeilen = (container: HTMLElement) => [...container.querySelectorAll('.zeit-row')]
const titel = (container: HTMLElement) =>
  [...container.querySelectorAll('.dash-zeit-titel')].map((x) => x.textContent)

describe('Die Zeitleiste der nächsten zwei Wochen', () => {
  it('ohne jede Aufgabe steht der ruhige Satz statt einer leeren Leiste', () => {
    const { container } = zeige({ myTasks: [] })
    expect(container.querySelector('.zeit')).toBeNull()
    expect(container.querySelector('.dash-leer-text')?.textContent).toBe(t.dashKeineAufgabe)
  })

  it('mit Bezeichnung und Termin', () => {
    const { container } = zeige({ myTasks: [task({ at: inTagen(1) })] })
    expect(container.querySelector('.dash-zeit-titel')?.textContent).toContain('Bibellesung')
    expect(container.querySelector('.zeit-datum')?.textContent).toContain('8. September')
  })

  /*
   * Der Grund für den Umbau: Vorher stand hier **eine** Aufgabe groß, und
   * darunter die laufende Woche mit „frei". Die zweite Aufgabe stand nirgends,
   * und was nach Sonntag kam, erst recht nicht.
   */
  it('jede Aufgabe des Fensters steht da — nicht nur die nächste', () => {
    const { container } = zeige({
      myTasks: [
        task({ id: 'T1', title: 'Erste', at: inTagen(1) }),
        task({ id: 'T2', title: 'Zweite', at: inTagen(8) }),
      ],
    })
    expect(titel(container)).toEqual(['Erste', 'Zweite'])
  })

  it('was weiter weg liegt als zwei Wochen, bleibt weg', () => {
    const { container } = zeige({
      myTasks: [
        task({ id: 'T1', title: 'Bald', at: inTagen(3) }),
        task({ id: 'T2', title: 'Später', at: inTagen(20) }),
      ],
    })
    expect(titel(container)).toEqual(['Bald'])
  })

  it('… es sei denn, im Fenster liegt nichts — dann steht die nächste dahinter da', () => {
    // „Keine anstehende Aufgabe" wäre schlicht falsch: Es steht eine an, nur
    // später. In einer gut geplanten Versammlung ist das der Normalfall.
    const { container } = zeige({ myTasks: [task({ id: 'T2', title: 'Später', at: inTagen(20) })] })
    expect(titel(container)).toEqual(['Später'])
  })

  it('ein Tipp auf die Zeile öffnet das Aufgaben-Blatt', () => {
    const { container, dispatch } = zeige({ myTasks: [task()] })
    fireEvent.click(container.querySelector('.zeit-open')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openMyTask', id: 'T1' })
  })

  it('offen: sie lässt sich gleich hier bestätigen', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ status: 'offen' })] })
    fireEvent.click(container.querySelector('.dash-confirm')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T1' })
  })

  it('bestätigt: statt des Knopfs steht der Zustand', () => {
    const { container } = zeige({ myTasks: [task({ status: 'bestätigt' })] })
    expect(container.querySelector('.dash-confirm')).toBeNull()
    expect(container.querySelector('.dash-badge--best')?.textContent).toContain(t.bestaetigt)
  })

  it('verhindert: ebenso', () => {
    const { container } = zeige({ myTasks: [task({ status: 'verhindert' })] })
    expect(container.querySelector('.dash-confirm')).toBeNull()
    expect(container.querySelector('.dash-badge--verh')?.textContent).toBe(t.verhindertChip)
  })

  it('bei einer Schulungsaufgabe führt der Weg zum S-89-Formular', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ s89: S89 })] })
    fireEvent.click(container.querySelector('.dash-s89')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openS89', payload: S89 })
  })

  it('sonst nicht — für einen Hilfsdienst gibt es kein Formular', () => {
    const { container } = zeige({ myTasks: [task({ s89: null })] })
    expect(container.querySelector('.dash-s89')).toBeNull()
  })

  it('jede Zeile trägt ihre eigenen Knöpfe, nicht nur die erste', () => {
    // Die alte Karte konnte nur die nächste Aufgabe bestätigen; für die zweite
    // musste man auf „Meine Aufgaben".
    const { container } = zeige({
      myTasks: [
        task({ id: 'T1', at: inTagen(1), status: 'offen' }),
        task({ id: 'T2', at: inTagen(8), status: 'offen' }),
      ],
    })
    expect(container.querySelectorAll('.dash-confirm')).toHaveLength(2)
  })

  it('der Countdown rechnet aus dem echten Termin — nicht aus einem gespeicherten Satz', () => {
    /*
      `MyTask.at` ist ein **Kalendertag** als UTC-Mitternacht, kein Zeitpunkt
      (siehe dort). Hier stand `Date.now() + 24h` — eine Uhrzeit von jetzt aus,
      eine Form, die keine der beiden Quellen erzeugt. In den Stunden nach
      Mitternacht liegt ihr UTC-Tag noch auf heute, und der Test hing damit an
      der Uhrzeit des Testlaufs.
    */
    const { container } = zeige({ myTasks: [task({ at: inTagen(1) })] })
    expect(container.querySelector('.dash-zeit-chip')?.textContent).toBe('morgen')
  })

  it('ohne echten Termin (Demo) steht der mitgelieferte Text', () => {
    const { container } = zeige({ myTasks: [task({ at: null, chip: 'in 4 Tagen' })] })
    expect(container.querySelector('.dash-zeit-chip')?.textContent).toBe('in 4 Tagen')
  })
})

/**
 * **Die Gegenrichtung gehört dazu** — wie im Personen-Detail.
 *
 * Eine Abwesenheit ist keine Aufgabe, erklärt aber eine leere Strecke: Ohne sie
 * stünde da nur „keine Aufgabe" und nicht, warum. Beginn und Ende sind zwei
 * Punkte, die Strecke dazwischen ist eingefärbt.
 */
describe('Die eigenen Abwesenheiten stehen in derselben Leiste', () => {
  const abw = (over: Partial<Absence> = {}): Absence => ({
    id: 'a1', personId: 'p-a', userId: null, from: isoIn(2), to: isoIn(2), reason: 'Urlaub', ...over,
  })

  it('ein einzelner Tag mit Grund, am Punkt in der Warnfarbe', () => {
    const { container } = zeige({ absences: [abw()] })
    const [zeile] = zeilen(container)
    expect(zeile?.querySelector('.zeit-dot--abw')).not.toBeNull()
    expect(zeile?.querySelector('.zeit-art')?.textContent).toBe(`${t.abwesendChip} · Urlaub`)
  })

  it('ohne Grund bleibt es beim Wort', () => {
    const { container } = zeige({ absences: [abw({ reason: '' })] })
    expect(container.querySelector('.zeit-art')?.textContent).toBe(t.abwesendChip)
  })

  it('fremde stehen nicht da — es ist die eigene Leiste', () => {
    const { container } = zeige({ absences: [abw({ personId: 'p-x' })] })
    expect(zeilen(container)).toHaveLength(0)
  })

  it('ein Zeitraum gibt zwei Punkte, und was dazwischen liegt, liegt sichtbar darin', () => {
    const { container } = zeige({
      absences: [abw({ from: isoIn(1), to: isoIn(5) })],
      myTasks: [task({ at: inTagen(3) })],
    })
    const klassen = zeilen(container).map((z) => z.className)
    expect(klassen).toHaveLength(3)
    // Der Beginn steht vor der Aufgabe dieses Zeitraums, das Ende dahinter …
    expect(klassen[0]).toContain('zeit-row--abw-unten')
    expect(klassen[2]).toContain('zeit-row--abw-oben')
    // … und die Aufgabe in der Mitte trägt die Strecke auf beiden Seiten.
    expect(klassen[1]).toContain('zeit-row--abw-oben')
    expect(klassen[1]).toContain('zeit-row--abw-unten')
  })

  it('ein Zeitraum, der vor heute beginnt, steht mit seinem echten Beginn da', () => {
    // Das Fenster gilt den Aufgaben, nicht den Abwesenheiten: Der Beginn liegt
    // zurück und steht blasser da, statt abgeschnitten zu werden.
    const { container } = zeige({
      absences: [abw({ from: isoIn(-3), to: isoIn(4) })],
      myTasks: [task({ at: inTagen(2) })],
    })
    const klassen = zeilen(container).map((z) => z.className)
    expect(klassen).toHaveLength(3)
    expect(klassen[0]).toContain('is-past')
    expect(klassen[0]).toContain('zeit-row--abw-unten')
    expect(klassen[1]).toContain('zeit-row--abw-oben')
    expect(klassen[1]).toContain('zeit-row--abw-unten')
    expect(klassen[2]).toContain('zeit-row--abw-oben')
  })

  it('eine Abwesenheit über die ganzen zwei Wochen lässt den Start nicht leer aussehen', () => {
    const { container } = zeige({ absences: [abw({ from: isoIn(-2), to: isoIn(20) })] })
    expect(zeilen(container)).toHaveLength(2)
    expect(container.querySelector('.dash-leer-text')).toBeNull()
  })
})

describe('Die beiden Kacheln', () => {
  it('zählen ungelesene Mitteilungen und offene Bestätigungen', () => {
    const { container } = zeige({
      notifs: [
        { id: 'n1', type: 'zuteilung', title: 'x', text: 'y', at: new Date().toISOString(), read: false },
        { id: 'n2', type: 'zuteilung', title: 'x', text: 'y', at: new Date().toISOString(), read: true },
      ],
      myTasks: [task({ id: 'T1', status: 'offen' }), task({ id: 'T2', status: 'bestätigt' })],
    })
    const werte = [...container.querySelectorAll('.dash-tile-value')].map((x) => x.textContent)
    expect(werte[0]).toContain('1')
    expect(werte[1]).toContain('1')
  })

  it('führen dorthin, wo man sie abarbeitet', () => {
    const { container, dispatch } = zeige()
    const kacheln = [...container.querySelectorAll('.dash-tile')]
    fireEvent.click(kacheln[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openNotifs' })
    fireEvent.click(kacheln[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'aufgaben' })
  })
})

/* ---- Die Planungs-Karte (T95) ---------------------------------------------- */

/**
 * Montag, 7. September 2026, 9 Uhr. Die Karte fragt, was **ansteht** — ohne
 * festen Tag hinge jede Zahl davon ab, an welchem Wochentag der Test läuft.
 */
const MONTAG = new Date(2026, 8, 7, 9, 0)
const WOCHEN = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'] as const
const [W1, W2] = WOCHEN

/** Wer die Plätze der Testwochen übernehmen kann — genug, dass nichts „nicht besetzbar" ist. */
const qualifiziert = (id: string, fn: string, ...bereiche: string[]): Person => {
  const priv = emptyQualifications()
  for (const b of bereiche) privSetzen(priv, b, true)
  return { id, fn, ln: 'Test', role: 'verkuendiger', female: false, tel: '', mail: '', priv }
}
const LEUTE: Person[] = [
  { ...ICH, priv: { ...emptyQualifications(), bibellesung: true, [serviceQualKey('mik')]: true } },
  qualifiziert('p-b', 'Bruno', serviceQualKey('mik')),
  qualifiziert('p-c', 'Carl', serviceQualKey('mik')),
]

/**
 * Eine Woche, wie der Import sie ablegt: Wochenspanne statt Termin im
 * `date`-Feld, der Tag kommt aus den Zusammenkunftszeiten (Di 19:00 · So 10:00).
 * Offen: eine Bibellesung und zwei Mikrofone unter der Woche, zwei Mikrofone am
 * Wochenende — fünf Plätze.
 */
function importiert(start: string): Week {
  const range = `Woche ab ${start}`
  return {
    range, book: '', start, current: false,
    mid: {
      date: range, end: '',
      sections: [{
        label: 'X', farbe: 'petrol',
        items: [{ iid: 'i1', num: 1, title: 'Bibellesung', meta: '', names: [{ name: '', bereichsKey: 'bibellesung' }] }],
      }],
      helpers: { mik: [] },
    },
    we: { date: range, end: '', sections: [], helpers: { mik: [] } },
  }
}

/** Dieselbe Woche, vollständig besetzt. */
function besetzt(start: string): Week {
  const w = importiert(start)
  platz(w).name = 'Anton Alt'
  platz(w).pid = 'p-a'
  w.mid.helpers.mik = [{ name: 'Bruno Test', pid: 'p-b' }, { name: 'Carl Test', pid: 'p-c' }]
  w.we.helpers.mik = [{ name: 'Bruno Test', pid: 'p-b' }, { name: 'Carl Test', pid: 'p-c' }]
  return w
}

/** Alle Plätze dieser Wochen bestätigt — wer zugesagt hat, weiß Bescheid. */
function allesBestaetigt(weeks: Week[]): ConfirmationMap {
  const map: ConfirmationMap = {}
  for (const w of weeks) {
    const start = w.start
    map[platzKey(w)] = 'bestätigt'
    for (const tab of ['mid', 'we'] as const) {
      for (const pos of [0, 1]) map[helperTaskKey(start, tab, 'mik', pos)] = 'bestätigt'
    }
  }
  return map
}

/** Alle Plätze dieser Wochen als gesendet — über das Tagebuch, nicht über Zusagen. */
function allesGesendet(weeks: Week[]): Record<string, string> {
  const log: Record<string, string> = {}
  const eintrag = (key: string, name: string) => (log[sentKey(key, name)] = '2026-09-01T08:00:00Z')
  for (const w of weeks) {
    eintrag(platzKey(w), 'Anton Alt')
    for (const tab of ['mid', 'we'] as const) {
      eintrag(helperTaskKey(w.start, tab, 'mik', 0), 'Bruno Test')
      eintrag(helperTaskKey(w.start, tab, 'mik', 1), 'Carl Test')
    }
  }
  return log
}

/** Ein Planer mit festem Tag, vier geladenen Wochen und genug Leuten. */
function planer(over: Partial<AppState> = {}) {
  return zeige({
    planner: true,
    persons: LEUTE,
    fsWeeks: [],
    ...over,
  })
}

const chip = (root: Element, art: string) => {
  const el = root.querySelector(`.dash-chip[data-art="${art}"]`)
  return el
    ? { titel: el.querySelector('.dash-chip-titel')?.textContent, n: el.querySelector('.dash-chip-n')?.textContent }
    : null
}

describe('Die Planungs-Karte gehört dem Planer — und steht bei ihm zuerst (T95)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG)
  })
  afterEach(() => vi.useRealTimers())

  it('ein Verkündiger sieht sie nicht — er dürfte den Screen dahinter gar nicht betreten', () => {
    const { container } = zeige({ planner: false, weeks: [importiert(W1)] })
    expect(container.querySelector('.dash-planung')).toBeNull()
    expect(container.querySelector('.dash-plan')).toBeNull()
  })

  it('ein Gruppenaufseher auch nicht — seine Treffpunkte plant er in Planen', () => {
    const { container } = zeige({
      planner: false,
      weeks: [importiert(W1)],
      groups: [{ id: 'g1', name: 'Gruppe 1', overseerId: 'p-a', assistantId: null }],
    })
    expect(container.querySelector('.dash-planung')).toBeNull()
  })

  it('beim Planer steht sie direkt unter dem Gruß, vor der eigenen Leiste', () => {
    // Bis T95 stand die Arbeit des Planers als letzte Zeile unter seinem
    // eigenen Verkündiger-Teil.
    const { container } = planer({ weeks: [importiert(W1)], myTasks: [task()] })
    const reihenfolge = [...container.querySelector('.dash')!.children].map((el) => el.className)
    const karte = reihenfolge.findIndex((c) => c.includes('dash-planung'))
    expect(karte, reihenfolge.join(' | ')).toBe(2) // nach Datum und Gruß
    expect(karte).toBeLessThan(reihenfolge.findIndex((c) => c.includes('panel')))
  })
})

describe('Eine Zeile je Woche, in der etwas zu tun ist', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG)
  })
  afterEach(() => vi.useRealTimers())

  /** Vier Wochen: die erste frisch importiert, die übrigen fertig und bestätigt. */
  const ersteOffen = (): Week[] => [importiert(W1), ...WOCHEN.slice(1).map(besetzt)]

  it('nennt die Woche und die offenen Zuteilungen — Titel und Zahl des Banners in Planen', () => {
    const weeks = ersteOffen()
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    const zeilen = container.querySelectorAll('.dash-plan-woche')
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]!.querySelector('.dash-plan-range')?.textContent).toBe(`Woche ab ${W1}`)
    expect(chip(zeilen[0]!, 'offen')).toEqual({ titel: t.offeneTitle, n: '5' })
    // Nur, was zutrifft: keine Konflikte, nichts nicht besetzbar, nichts zu senden.
    expect(chip(zeilen[0]!, 'konflikte')).toBeNull()
    expect(chip(zeilen[0]!, 'engpass')).toBeNull()
    expect(chip(zeilen[0]!, 'senden')).toBeNull()
  })

  it('ein Konflikt steht als Titel neben seiner Zahl — nicht mehr „1 Konflikte"', () => {
    const weeks = WOCHEN.map(besetzt)
    const absences: Absence[] = [
      // Anton hält am Dienstag die Bibellesung und ist an dem Tag weg.
      { id: 'a1', personId: 'p-a', userId: null, from: '2026-09-08', to: '2026-09-08', reason: '' },
    ]
    const { container } = planer({ weeks, absences, confirmations: allesBestaetigt(weeks) })
    const karte = container.querySelector('.dash-planung')!
    expect(chip(karte, 'konflikte')).toEqual({ titel: t.konflikteTitle, n: '1' })
    expect(karte.textContent).not.toMatch(/1 Konflikte/)
  })

  it('nicht besetzbar: an einem Tag zu wenige Leute für die Plätze (T96)', () => {
    // Nur Anton kann Mikrofone — zwei Plätze je Zusammenkunft, je einer bleibt offen.
    const weeks = ersteOffen()
    const { container } = planer({ weeks, persons: [LEUTE[0]!], confirmations: allesBestaetigt(weeks) })
    const erste = container.querySelector('.dash-plan-woche')!
    expect(chip(erste, 'engpass')).toEqual({ titel: t.engpassTitle, n: '2' })
  })

  it('eine fertig geplante Woche, von der noch niemand weiß, sagt „Plan senden" (T99)', () => {
    const weeks = WOCHEN.map(besetzt)
    // Nur die erste Woche ist noch nicht hinaus.
    const confirmations = allesBestaetigt(weeks.slice(1))
    const { container } = planer({ weeks, confirmations })
    const zeilen = container.querySelectorAll('.dash-plan-woche')
    expect(zeilen).toHaveLength(1)
    expect(chip(zeilen[0]!, 'senden')).toEqual({ titel: t.planSendenTitle, n: '5' })
  })

  it('offline kein „Plan senden" — Planen blendet den Knopf dann auch aus', () => {
    const weeks = WOCHEN.map(besetzt)
    const { container } = planer({ weeks, confirmations: {}, staleAt: Date.now() })
    expect(container.querySelector('.dash-chip[data-art="senden"]')).toBeNull()
  })

  it('ein Tipp öffnet Planen auf genau dieser Woche', () => {
    const weeks = [...WOCHEN.slice(0, 2).map(besetzt), importiert(WOCHEN[2]), besetzt(WOCHEN[3])]
    const { container, dispatch } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    fireEvent.click(container.querySelector('.dash-plan-woche')!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'navigate', screen: 'planen', woche: { wi: 2, tab: 'mid' },
    })
  })

  it('am Donnerstag ist der Dienstag vorbei — es zählt nur noch das Wochenende', () => {
    // Der Bildschirm fragt mit dem heutigen Tag, nicht mit dem Wochenanfang.
    vi.setSystemTime(new Date(2026, 8, 10, 9, 0))
    const weeks = ersteOffen()
    const { container, dispatch } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    const erste = container.querySelector('.dash-plan-woche')!
    expect(chip(erste, 'offen')?.n).toBe('2')
    fireEvent.click(erste)
    // Und Planen öffnet dort, wo noch etwas zu tun ist.
    expect(dispatch).toHaveBeenCalledWith({
      type: 'navigate', screen: 'planen', woche: { wi: 0, tab: 'we' },
    })
  })

  it('ist nichts zu tun, schrumpft sie auf eine Zeile „Alles zugeteilt"', () => {
    const weeks = WOCHEN.map(besetzt)
    const { container, dispatch } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(container.querySelector('.dash-planung')).toBeNull()
    expect(container.querySelector('.dash-plan-text')?.textContent).toBe(t.dashAllesZugeteilt)
    fireEvent.click(container.querySelector('.dash-plan')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen' })
  })
})

describe('Reichen die Programme nicht mehr, steht der Import gleich auf der Karte', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG)
    importNextWeek.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('eine Woche Vorrat: der Stand und der Knopf', () => {
    const weeks = [besetzt(W1)]
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(container.querySelector('.dash-plan-vorrat-text')?.textContent).toMatch(/^Geladen bis 13\. Sept\. 2026$/)
    expect(container.querySelector('.dash-plan-import')?.textContent).toBe(t.importBtn)
  })

  it('der Knopf holt die nächste Woche — derselbe Ablauf wie in den Einstellungen', async () => {
    const neu = importiert(W2)
    importNextWeek.mockResolvedValue({ ok: true, week: neu })
    const weeks = [besetzt(W1)]
    const { container, dispatch } = planer({ weeks, confirmations: allesBestaetigt(weeks), dataStatus: 'ready' })
    fireEvent.click(container.querySelector('.dash-plan-import')!)
    // Ab der zuletzt geladenen Woche, in der Versammlungssprache.
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'addImportedWeek', week: neu }))
    expect(importNextWeek).toHaveBeenCalledWith(W1, 'de', [])
    expect(dispatch).toHaveBeenCalledWith({ type: 'startImport' })
  })

  it('offline fängt er gar nicht erst an', () => {
    const weeks = [besetzt(W1)]
    const { container, dispatch } = planer({ weeks, staleAt: Date.now() })
    fireEvent.click(container.querySelector('.dash-plan-import')!)
    expect(importNextWeek).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.offlineReadOnly })
  })

  it('ohne jede Woche: „Noch keine Woche geladen" — der erste Import steht aus', () => {
    const { container } = planer({ weeks: [] })
    expect(container.querySelector('.dash-plan-vorrat-text')?.textContent).toBe(t.geladenNichts)
    expect(container.querySelector('.dash-plan-import')).not.toBeNull()
  })

  it('reicht der Vorrat, steht nichts davon da', () => {
    const weeks = WOCHEN.map(besetzt)
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(container.querySelector('.dash-plan-vorrat')).toBeNull()
  })
})

/* ---- Treffpunkt-Leitungen (T95) -------------------------------------------- */

/**
 * **Eine Treffpunkt-Leitung ist eine Aufgabe wie jede andere.**
 *
 * Bis T95 stand sie nur in der Karte „Deine nächste Aufgabe", sobald sie die
 * nächste war — im Wochenüberblick darunter nie: zwei Stellen auf einem
 * Bildschirm, die verschieden viel von derselben Woche wussten. Beide sind der
 * Leiste gewichen, und die liest `state.myTasks`, wo der Reducer
 * Zusammenkünfte und Treffpunkte längst zusammenführt (`reducer.test.ts`:
 * „Treffpunkt fehlt in myTasks"). Hier geht es darum, dass der Start sie nicht
 * anders behandelt als eine Zuteilung.
 */
describe('Eine Treffpunkt-Leitung steht mit in der Leiste', () => {
  const leitung = (over: Partial<MyTask> = {}): MyTask =>
    task({
      id: `fs|${W1}|r1`,
      title: '',
      rolle: t.fsLeiterLbl,
      date: 'Mittwoch, 9. September · 09:30 · Bahnhof',
      at: inTagen(2),
      ...over,
    })

  it('mit Rolle, Tag, Uhrzeit und Ort — der Ort sagt erst, wohin man kommt', () => {
    const { container } = zeige({ myTasks: [leitung()] })
    expect(container.querySelector('.dash-zeit-titel')?.textContent).toBe(t.fsLeiterLbl)
    expect(container.querySelector('.zeit-datum')?.textContent).toBe(
      'Mittwoch, 9. September · 09:30 · Bahnhof',
    )
  })

  it('und lässt sich von hier aus bestätigen', () => {
    const { container, dispatch } = zeige({ myTasks: [leitung({ status: 'offen' })] })
    fireEvent.click(container.querySelector('.dash-confirm')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: `fs|${W1}|r1` })
  })

  it('in der Folge der Termine, zwischen den Zusammenkünften', () => {
    const { container } = zeige({
      myTasks: [
        task({ id: 'T1', title: 'Dienstag', at: inTagen(1) }),
        leitung({ at: inTagen(2) }),
        task({ id: 'T2', title: 'Sonntag', at: inTagen(6) }),
      ],
    })
    expect(titel(container)).toEqual(['Dienstag', t.fsLeiterLbl, 'Sonntag'])
  })
})

/* ---- Nachgezogen aus der Durchsicht (T95) ---------------------------------- */

describe('Die Karte zeigt an, wofür „Alles zugeteilt" gilt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG)
  })
  afterEach(() => vi.useRealTimers())

  it('mit dem Zeitraum der angesehenen Wochen — dahinter kann noch Arbeit liegen', () => {
    /*
     * Die eingeklappte Karte sagte „Alles zugeteilt", geprüft waren aber nur vier
     * Wochen. Acht importierte Wochen, die ersten vier fertig: Der Satz las sich
     * wie „nichts mehr zu tun", und dahinter lagen 140 offene Plätze.
     */
    const weeks = WOCHEN.map(besetzt)
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(container.querySelector('.dash-plan-text')?.textContent).toBe(t.dashAllesZugeteilt)
    expect(container.querySelector('.dash-plan-zeitraum')?.textContent).toMatch(/^7\.\sSept\.\s–\s4\.\sOkt\.\s2026$/) // formatRange setzt schmale Leerzeichen
  })
})

describe('Die Karte rechnet mit dem Tag, der gerade ist', () => {
  afterEach(() => vi.useRealTimers())

  it('am Mittwochmorgen zählt sie den Dienstag nicht mehr — auch ohne dass sich an den Wochen etwas ändert', () => {
    /*
     * Die Karte merkt sich ihre Rechnung. Das Datum stand darin, war aber keine
     * Abhängigkeit: Eine installierte App, die über Nacht im Hintergrund lag,
     * zählte am Morgen noch den Dienstag — bis jemand etwas an den Wochen
     * änderte. Jetzt liest sie den Tag beim Zurückkehren neu.
     */
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 21, 0)) // Dienstagabend
    const weeks = [importiert(W1), ...WOCHEN.slice(1).map(besetzt)]
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(chip(container.querySelector('.dash-plan-woche')!, 'offen')?.n).toBe('5')

    vi.setSystemTime(new Date(2026, 8, 9, 7, 30)) // die Nacht vergeht im Hintergrund
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(chip(container.querySelector('.dash-plan-woche')!, 'offen')?.n).toBe('2')
  })
})

describe('Die Wochenspanne steht in derselben Sprache wie in Planen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG)
  })
  afterEach(() => vi.useRealTimers())

  it('mit Sprachvariante der App-Sprache die Spanne der Variante', () => {
    /*
     * Planen zeigt den Kopf der Woche aus der mitgeholten Sprachvariante
     * (`useProgWeek`). Die Karte nahm die kanonische Spanne: Eine englische App
     * mit deutscher Versammlung las auf dem Start „Woche ab …" und nach dem
     * Tippen die englische Fassung.
     */
    const erste = importiert(W1)
    const jw = APP_TO_JW.en!
    erste.alt = { [jw]: { ...importiert(W1), range: 'Week of September 7' } }
    const weeks = [erste, ...WOCHEN.slice(1).map(besetzt)]
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks), lang: 'en', congLang: 'de' })
    expect(container.querySelector('.dash-plan-range')?.textContent).toBe('Week of September 7')
  })

  it('Gegenprobe: ohne Variante bleibt es bei der Spanne der Versammlung', () => {
    const weeks = [importiert(W1), ...WOCHEN.slice(1).map(besetzt)]
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks), lang: 'en', congLang: 'de' })
    expect(container.querySelector('.dash-plan-range')?.textContent).toBe(`Woche ab ${W1}`)
  })
})

/**
 * **Was die Karte aus dem Zustand übernimmt, muss auch ankommen.**
 *
 * Die Rechnung selbst prüft `planungsstand.test.ts`. Hier geht es um den
 * Aufrufer: Gibt die Karte die Treffpunkte, die Abwesenheiten oder das
 * Versand-Tagebuch nicht weiter, rechnet sie still mit leeren Listen — die
 * häufigste Fehlerart dieses Projekts (Regel geprüft, Aufrufer nicht).
 */
describe('Die Karte gibt Treffpunkte, Abwesenheiten und Tagebuch weiter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MONTAG)
  })
  afterEach(() => vi.useRealTimers())

  const fertig = (): Week[] => WOCHEN.map(besetzt)

  it('ein Treffpunkt ohne Leiter macht die Woche zu einer mit offener Zuteilung', () => {
    const weeks = fertig()
    const offen: FsInstance = { id: 'mi', ruleId: 'mi', grp: null, wd: 3, time: '09:30', place: 'Saal', leader: '' }
    const { container, dispatch } = planer({
      weeks,
      confirmations: allesBestaetigt(weeks),
      fsWeeks: [[offen], [], [], []],
    })
    const zeile = container.querySelector('.dash-plan-woche')!
    expect(chip(zeile, 'offen')).toEqual({ titel: t.offeneTitle, n: '1' })
    fireEvent.click(zeile)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 0, tab: 'fs' } })
  })

  it('ein abwesender Treffpunkt-Leiter ist ein Konflikt', () => {
    const weeks = fertig()
    const leitung: FsInstance = {
      id: 'mi', ruleId: 'mi', grp: null, wd: 3, time: '09:30', place: 'Saal', leader: 'Anton Alt', lpid: 'p-a',
    }
    const confirmations: ConfirmationMap = { ...allesBestaetigt(weeks), [`fs|${W1}|mi`]: 'bestätigt' }
    const absences: Absence[] = [
      { id: 'a1', personId: 'p-a', userId: null, from: '2026-09-09', to: '2026-09-09', reason: '' },
    ]
    const { container } = planer({ weeks, confirmations, absences, fsWeeks: [[leitung], [], [], []] })
    expect(chip(container.querySelector('.dash-plan-woche')!, 'konflikte')).toEqual({
      titel: t.konflikteTitle,
      n: '1',
    })
  })

  it('was im Tagebuch steht, ist gesendet — die Woche verschwindet von der Karte', () => {
    const weeks = fertig()
    const { container } = planer({ weeks, confirmations: {}, sentLog: allesGesendet(weeks) })
    expect(container.querySelector('.dash-planung')).toBeNull()
    expect(container.querySelector('.dash-plan-text')?.textContent).toBe(t.dashAllesZugeteilt)
  })
})
