/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Absence, MyTask, PartItem, Person, S89Payload, Service, Week } from '../data/types'
import { DashboardScreen } from './DashboardScreen'

/**
 * **Der Start-Bildschirm — die Landeseite nach dem Anmelden.**
 *
 * Er ist für die meisten Nutzer die ganze App: die eigene nächste Aufgabe, die
 * laufende Woche, zwei Kacheln. Drei Zusicherungen tragen dabei Fachlogik:
 *
 * - Die **laufende Woche wird gerechnet**, nicht aus `week.current` gelesen.
 *   Das Flag setzt nur der Demo-Bestand und wird nie nachgeführt — die
 *   Konfliktzahl stand deshalb in der Produktion dauerhaft auf 0.
 * - **Entfallene Zusammenkünfte zählen nicht mit** (T30). Ihre Plätze sind
 *   nicht „offen", sie werden gar nicht gebraucht. Sonst stünde auf dem Start
 *   eine Zahl, die niemand abarbeiten kann.
 * - Die **Planungs-Kachel** gehört dem Planer. Ein Verkündiger, der sie sähe,
 *   käme auf einen Screen, den er nicht betreten darf.
 */

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

describe('Die Planungs-Kachel gehört dem Planer', () => {
  it('ein Verkündiger sieht sie nicht — er dürfte den Screen gar nicht betreten', () => {
    const { container } = zeige({ planner: false })
    expect(container.querySelector('.dash-plan')).toBeNull()
  })

  it('der Planer sieht offene Zuteilungen der laufenden Woche', () => {
    const { container } = zeige({ planner: true })
    // 1 Programmpunkt + 2 Mikrofone (unter der Woche) + 2 Mikrofone (Wochenende)
    expect(container.querySelector('.dash-plan-text')?.textContent).toContain('5')
  })

  it('ist alles zugeteilt und konfliktfrei, sagt sie genau das', () => {
    const w = laufendeWoche()
    platz(w).name = 'Anton Alt'
    w.mid.helpers.mik = [{ name: 'A' }, { name: 'B' }]
    w.we.helpers.mik = [{ name: 'C' }, { name: 'D' }]
    const { container } = zeige({ planner: true, weeks: [w] })
    expect(container.querySelector('.dash-plan-text')?.textContent).toBe(t.dashAllesZugeteilt)
  })

  it('eine entfallene Zusammenkunft zählt nicht mit (T30) — ihre Plätze braucht niemand', () => {
    const w = laufendeWoche({ dev: { we: { cancelled: true, reason: 'Kongress' } } })
    const { container } = zeige({ planner: true, weeks: [w] })
    // Ohne die zwei Wochenend-Mikrofone bleiben 3.
    expect(container.querySelector('.dash-plan-text')?.textContent).toContain('3')
  })

  it('Konflikte werden dazugezählt — auch die der Treffpunkte', () => {
    const w = laufendeWoche()
    platz(w).name = 'Anton Alt'
    platz(w).pid = 'p-a'
    const abwesend: Absence[] = [
      { id: 'a1', personId: 'p-a', userId: null, from: w.start!, to: '2099-12-31', reason: '' },
    ]
    const { container } = zeige({ planner: true, weeks: [w], absences: abwesend })
    expect(container.querySelector('.dash-plan-text')?.textContent).toContain(t.dashKonflikteN.replace('{n}', '1'))
  })

  it('zählt Konflikte auch, wenn heute in keine geladene Woche fällt', () => {
    /*
      **Beide Hälften der Kachel müssen dieselbe Woche meinen.**

      „Offene Zuteilungen" fällt auf die gerade **gewählte** Woche zurück, wenn
      heute in keine geladene fällt — die Konfliktzahl daneben tat das nicht und
      blieb dann stumm auf 0. Eine Kachel, zwei Wochen.

      Der Fall ist kein Randfall: Eine frisch eingerichtete Versammlung holt mit
      „Programm importieren" die **nächste** Woche. Bis der Montag kommt, liegt
      heute in keiner geladenen Woche — und genau in dieser Zeit plant der
      Koordinator. Er sah offene Plätze, aber keinen einzigen Konflikt.
    */
    const zukunft = laufendeWoche()
    const montag = new Date(`${zukunft.start}T12:00:00`)
    montag.setDate(montag.getDate() + 21) // drei Wochen voraus
    zukunft.start = `${montag.getFullYear()}-${String(montag.getMonth() + 1).padStart(2, '0')}-${String(montag.getDate()).padStart(2, '0')}`
    platz(zukunft).name = 'Anton Alt'
    platz(zukunft).pid = 'p-a'
    const abwesend: Absence[] = [
      { id: 'a1', personId: 'p-a', userId: null, from: zukunft.start, to: '2099-12-31', reason: '' },
    ]
    const { container } = zeige({ planner: true, weeks: [zukunft], week: 0, absences: abwesend })
    const text = container.querySelector('.dash-plan-text')?.textContent ?? ''
    expect(text, text).toContain(t.dashKonflikteN.replace('{n}', '1'))
  })

  it('sie führt ins Planen', () => {
    const { container, dispatch } = zeige({ planner: true })
    fireEvent.click(container.querySelector('.dash-plan')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen' })
  })

  it('ohne geladene Woche steht sie nicht da — es gibt nichts zu planen', () => {
    const { container } = zeige({ planner: true, weeks: [] })
    expect(container.querySelector('.dash-plan')).toBeNull()
  })
})
