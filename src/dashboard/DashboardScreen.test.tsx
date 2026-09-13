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
import { helperTaskKey, partTaskKey, sentKey } from '../data/planning'
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

/**
 * **Der Start-Bildschirm — die Landeseite nach dem Anmelden.**
 *
 * Er ist für die meisten Nutzer die ganze App: die eigene nächste Aufgabe, die
 * laufende Woche, zwei Kacheln. Vier Zusicherungen tragen dabei Fachlogik:
 *
 * - Die **laufende Woche wird gerechnet**, nicht aus `week.current` gelesen.
 *   Das Flag setzt nur der Demo-Bestand und wird nie nachgeführt.
 * - **Nach Rolle sortiert** (T95): Der Planer sieht seine Arbeit zuerst, direkt
 *   unter dem Gruß. Ein Verkündiger sieht die Karte gar nicht — er käme über
 *   sie auf einen Screen, den er nicht betreten darf.
 * - Die **Planungs-Karte** nennt die kommenden Wochen, in denen etwas zu tun
 *   ist, mit den Zahlen der Banner in Planen — und was vorbei ist, zählt nicht
 *   (die Regeln selbst prüft `planungsstand.test.ts`; hier geht es darum, dass
 *   der Bildschirm sie mit dem heutigen Tag und dem echten Zustand aufruft).
 * - **„Aktuelle Woche" kennt die eigenen Treffpunkte** — bis T95 stand eine
 *   Treffpunkt-Leitung nur in der Aufgaben-Karte darüber, im Wochenblock nie.
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
      // Ausgeschriebener Wochentag — die Form, in der Wochen mit eigenem Termin
      // ihn tragen (Demo-Bestand, Gedächtnismahl). Die Kurzform „Di," kommt in
      // keiner Datenquelle vor und wird von `meetingDateParts` bewusst nicht
      // erkannt; sie stand hier und ließ den Test etwas anderes prüfen als das,
      // was der Bildschirm sieht.
      date: 'Dienstag, 8. September · 19:00', end: '20:45',
      sections: [{
        label: 'X', farbe: 'petrol',
        items: [{ num: 1, title: 'Bibellesung', meta: '', names: [{ name: '', bereichsKey: 'bibellesung' }] }],
      }],
      helpers: { mik: [] },
    },
    we: { date: 'Sonntag, 13. September · 10:00', end: '11:45', sections: [], helpers: { mik: [] } },
    ...over,
  }
}

/**
 * Woche, wie sie der jw.org-Import ablegt: im `date`-Feld steht die
 * **Wochenspanne**, kein Termin (die Überschrift der Wochenseite nennt weder
 * Wochentag noch Uhrzeit). Der Tag muss daraus gerechnet werden.
 */
function importierteWoche(): Week {
  const w = laufendeWoche()
  w.mid = { ...w.mid, date: w.range }
  w.we = { ...w.we, date: w.range }
  return w
}

/** Der eine Programm-Platz der Wochenmitte — die Testwoche hat genau einen. */
const platz = (w: Week) => (w.mid.sections[0]!.items[0] as PartItem).names[0]!

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'start', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a', planner: false,
    persons: [ICH], services: DIENSTE, groups: [], absences: [],
    weeks: [laufendeWoche()], fsWeeks: [[]], fsRules: [],
    myTasks: [], notifs: [], substituteReqs: [],
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
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

describe('Die eigene nächste Aufgabe', () => {
  it('ohne Aufgabe steht dort der ruhige Satz statt einer leeren Karte', () => {
    const { container } = zeige({ myTasks: [] })
    expect(container.querySelector('.dash-hero-empty-text')?.textContent).toBe(t.dashKeineAufgabe)
  })

  it('mit Aufgabe stehen Bezeichnung und Termin da', () => {
    const { container } = zeige({ myTasks: [task()] })
    expect(container.querySelector('.dash-hero-title')?.textContent).toContain('Bibellesung')
    expect(container.querySelector('.dash-hero-date')?.textContent).toContain('8. September')
  })

  it('es ist die ERSTE der Liste — sie steht in Programmreihenfolge', () => {
    const { container } = zeige({
      myTasks: [task({ id: 'T1', title: 'Erste' }), task({ id: 'T2', title: 'Zweite' })],
    })
    expect(container.querySelector('.dash-hero-title')?.textContent).toContain('Erste')
  })

  it('ein Tipp öffnet das Aufgaben-Blatt', () => {
    const { container, dispatch } = zeige({ myTasks: [task()] })
    fireEvent.click(container.querySelector('.dash-hero-open')!)
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

  it('der Countdown rechnet aus dem echten Termin — nicht aus einem gespeicherten Satz', () => {
    /*
      `MyTask.at` ist ein **Kalendertag** als UTC-Mitternacht, kein Zeitpunkt
      (siehe dort). Hier stand `Date.now() + 24h` — eine Uhrzeit von jetzt aus,
      eine Form, die keine der beiden Quellen erzeugt. In den Stunden nach
      Mitternacht liegt ihr UTC-Tag noch auf heute, und der Test hing damit an
      der Uhrzeit des Testlaufs.
    */
    const heute = new Date()
    const morgen = Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate() + 1)
    const { container } = zeige({ myTasks: [task({ at: morgen })] })
    expect(container.querySelector('.dash-hero-chip')?.textContent).toBe('morgen')
  })

  it('ohne echten Termin (Demo) steht der mitgelieferte Text', () => {
    const { container } = zeige({ myTasks: [task({ at: null, chip: 'in 4 Tagen' })] })
    expect(container.querySelector('.dash-hero-chip')?.textContent).toBe('in 4 Tagen')
  })
})

describe('„Diese Woche"', () => {
  it('nennt beide Zusammenkünfte mit Tag und Uhrzeit', () => {
    const { container } = zeige()
    const zeilen = [...container.querySelectorAll('.dash-week-row')]
    expect(zeilen.map((z) => z.querySelector('.dash-week-name')?.textContent)).toEqual([
      t.tabMid, t.tabWe,
    ])
    expect(zeilen[0]!.querySelector('.dash-week-date')?.textContent).toBe('Dienstag, 8. September · 19:00')
  })

  it('ein angehängter Ort fällt weg — auf dem Start zählt der Termin, nicht der Saal', () => {
    const w = laufendeWoche()
    w.mid.date = 'Dienstag, 8. September · 19:00 · Königreichssaal Nord'
    const { container } = zeige({ weeks: [w] })
    expect(container.querySelector('.dash-week-date')?.textContent).toBe('Dienstag, 8. September · 19:00')
  })

  /*
   * Der wichtigste Fall und der einzige, den es in der Produktion überhaupt
   * gibt: eine **importierte** Woche. Ihr `date`-Feld trägt die Wochenspanne,
   * keinen Termin. Roh angezeigt las „Diese Woche" deshalb zweimal dieselbe
   * Zeile — „unter der Woche · 7.–13. September" und darunter „Wochenende ·
   * 7.–13. September" —, also gerade nicht das, wonach gefragt ist. Gerechnet
   * wird aus Startdatum und Wochentag, wie in „Meine Aufgaben", im Programm und
   * in den Erinnerungen (`meetingDateText`).
   */
  it('importierte Woche: der Termin wird gerechnet, nicht die Wochenspanne gezeigt', () => {
    const { container } = zeige({ weeks: [importierteWoche()] })
    const zeilen = [...container.querySelectorAll('.dash-week-row')]
    const daten = zeilen.map((z) => z.querySelector('.dash-week-date')?.textContent ?? '')
    for (const d of daten) expect(d).not.toContain('diese Woche')
    // Dienstag/Sonntag aus den Zusammenkunftszeiten der Versammlung, samt Uhrzeit.
    expect(daten[0]).toMatch(/^Dienstag, \d+\. \S+ · 19:00$/)
    expect(daten[1]).toMatch(/^Sonntag, \d+\. \S+ · 10:00$/)
    // Und vor allem: zwei verschiedene Tage, nicht zweimal derselbe Text.
    expect(daten[0]).not.toBe(daten[1])
  })

  it('verlegte Zusammenkunft: der Start zeigt den neuen Tag, nicht den geplanten', () => {
    // Eine Abweichung (T30) schlägt den Rhythmus — sonst stünde auf dem
    // Start-Bildschirm ein Abend, an dem niemand kommt.
    const w = importierteWoche()
    w.dev = { mid: { day: 'Donnerstag', time: '18:30' } }
    const { container } = zeige({ weeks: [w] })
    expect(container.querySelector('.dash-week-date')?.textContent).toMatch(
      /^Donnerstag, \d+\. \S+ · 18:30$/,
    )
  })

  it('markiert die Zusammenkunft, in der ich selbst dran bin', () => {
    const w = laufendeWoche()
    platz(w).name = 'Anton Alt'
    platz(w).pid = 'p-a'
    const { container } = zeige({ weeks: [w] })
    const zeilen = [...container.querySelectorAll('.dash-week-row')]
    expect(zeilen[0]!.querySelector('.dash-week-chip')?.textContent).toBe(t.dashDeineAufgabe)
    expect(zeilen[1]!.querySelector('.dash-week-frei')?.textContent).toBe(t.freiChip)
  })

  it('eine fremde Zuteilung markiert nichts — es geht um die eigene', () => {
    const w = laufendeWoche()
    platz(w).name = 'Wer Anders'
    platz(w).pid = 'p-x'
    const { container } = zeige({ weeks: [w] })
    expect(container.querySelector('.dash-week-chip')).toBeNull()
  })

  it('ohne geladene Woche steht der ganze Block nicht da', () => {
    const { container } = zeige({ weeks: [] })
    expect(container.querySelector('.dash-week')).toBeNull()
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
  for (const b of bereiche) priv[b] = true
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
        items: [{ num: 1, title: 'Bibellesung', meta: '', names: [{ name: '', bereichsKey: 'bibellesung' }] }],
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
    map[partTaskKey(start, 'mid', 0, 0, 0)] = 'bestätigt'
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
    eintrag(partTaskKey(w.start, 'mid', 0, 0, 0), 'Anton Alt')
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
      groups: [{ id: 'g1', name: 'Gruppe 1', ov: 'p-a', as: null }],
    })
    expect(container.querySelector('.dash-planung')).toBeNull()
  })

  it('beim Planer steht sie direkt unter dem Gruß, vor der eigenen Aufgabe', () => {
    // Bis T95 stand die Arbeit des Planers als letzte Zeile unter seinem
    // eigenen Verkündiger-Teil.
    const { container } = planer({ weeks: [importiert(W1)], myTasks: [task()] })
    const reihenfolge = [...container.querySelector('.dash')!.children].map((el) => el.className)
    const karte = reihenfolge.findIndex((c) => c.includes('dash-planung'))
    expect(karte, reihenfolge.join(' | ')).toBe(2) // nach Datum und Gruß
    expect(karte).toBeLessThan(reihenfolge.findIndex((c) => c.includes('dash-hero')))
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

/* ---- „Aktuelle Woche" und die Treffpunkte (T95) ---------------------------- */

describe('„Aktuelle Woche" kennt die eigenen Treffpunkte', () => {
  const treffpunkt = (over: Partial<FsInstance> = {}): FsInstance => ({
    id: 'r1', ruleId: 'r1', grp: '', wd: 3, time: '09:30', place: 'Bahnhof',
    leader: 'Anton Alt', lpid: 'p-a', ...over,
  })

  const fsZeilen = (container: HTMLElement) =>
    [...container.querySelectorAll('.dash-week-row')].filter((z) =>
      z.getAttribute('data-zeile')?.startsWith('fs|'),
    )

  it('ein eigener Treffpunkt steht mit Tag, Uhrzeit und Ort — wie in „Meine Aufgaben"', () => {
    const { container } = zeige({ fsWeeks: [[treffpunkt()]] })
    const [zeile] = fsZeilen(container)
    expect(zeile?.querySelector('.dash-week-name')?.textContent).toBe(t.tabFs)
    expect(zeile?.querySelector('.dash-week-date')?.textContent).toMatch(/^Mittwoch, \d+\. \S+ · 09:30 · Bahnhof$/)
    expect(zeile?.querySelector('.dash-week-chip')?.textContent).toBe(t.dashDeineAufgabe)
  })

  it('die Zeilen stehen in der Folge der Woche: Montag vor Dienstag, Mittwoch vor Sonntag', () => {
    const { container } = zeige({
      fsWeeks: [[treffpunkt({ id: 'mi', wd: 3 }), treffpunkt({ id: 'mo', wd: 1, time: '14:00' })]],
    })
    const folge = [...container.querySelectorAll('.dash-week-row')].map((z) => z.getAttribute('data-zeile'))
    expect(folge).toEqual(['fs|mo', 'mid', 'fs|mi', 'we'])
  })

  it('fremde Treffpunkte stehen nicht da — die Liste aller steht im Programm', () => {
    const { container } = zeige({ fsWeeks: [[treffpunkt({ leader: 'Wer Anders', lpid: 'p-x' })]] })
    expect(fsZeilen(container)).toHaveLength(0)
  })

  it('ein auswärtiger Leiter gleichen Namens ist nicht man selbst', () => {
    // Freitext (T63): der Kreisaufseher, der zufällig so heißt wie ein Bruder.
    const { container } = zeige({
      fsWeeks: [[treffpunkt({ lpid: undefined, lext: true })]],
    })
    expect(fsZeilen(container)).toHaveLength(0)
  })

  it('ein Namensvetter mit eigener Person-Id auch nicht — die Id entscheidet', () => {
    const { container } = zeige({ fsWeeks: [[treffpunkt({ lpid: 'p-zwilling' })]] })
    expect(fsZeilen(container)).toHaveLength(0)
  })

  it('ohne angemeldete Person gehört niemandem ein Treffpunkt', () => {
    const { container } = zeige({ personId: null, fsWeeks: [[treffpunkt()]] })
    expect(fsZeilen(container)).toHaveLength(0)
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
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks), lang: 'en', congLang: 'Deutsch' })
    expect(container.querySelector('.dash-plan-range')?.textContent).toBe('Week of September 7')
  })

  it('Gegenprobe: ohne Variante bleibt es bei der Spanne der Versammlung', () => {
    const weeks = [importiert(W1), ...WOCHEN.slice(1).map(besetzt)]
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks), lang: 'en', congLang: 'Deutsch' })
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
    const offen: FsInstance = { id: 'mi', ruleId: 'mi', grp: '', wd: 3, time: '09:30', place: 'Saal', leader: '' }
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
      id: 'mi', ruleId: 'mi', grp: '', wd: 3, time: '09:30', place: 'Saal', leader: 'Anton Alt', lpid: 'p-a',
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
