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
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { helferKey, punktKey, sentKey } from '../data/planning'
import { APP_TO_JW } from '../i18n/langs'
import { makeTr } from '../i18n/translate'
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

/**
 * **Der Start-Bildschirm — die Landeseite nach dem Anmelden.**
 *
 * Er ist für die meisten Nutzer die ganze App (T121): Gruß, die nächste
 * eigene Aufgabe groß mit dem Saal darüber, die nächsten danach, die Woche der
 * Versammlung. Zusicherungen mit Fachlogik:
 *
 * - Die **große Karte** bietet an, was zum Stand der Aufgabe passt: bestätigen
 *   oder absagen, nach der Zusage doch absagen, nach der Absage doch bestätigen.
 * - Der **Saal** zählt die Plätze ihrer Zusammenkunft (die Verteilung selbst
 *   prüft `saal.test.ts`) und nennt die Zahlen in Worten.
 * - **Nach Rolle sortiert** (T95): Der Planer sieht seine Arbeit gleich neben
 *   der eigenen. Ein Verkündiger sieht die Karte gar nicht — er käme über sie
 *   auf einen Screen, den er nicht betreten darf.
 * - Die **Planungs-Karte** nennt die kommenden Wochen, in denen etwas zu tun
 *   ist, mit den Zahlen der Banner in Planen — und was vorbei ist, zählt nicht
 *   (die Regeln selbst prüft `planungsstand.test.ts`; hier geht es darum, dass
 *   der Bildschirm sie mit dem heutigen Tag und dem echten Zustand aufruft).
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
  at: null, status: 'offen', s89: null, ...over,
})

const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 2, groups: false }]

/** Woche, die den heutigen Tag enthält — damit `currentWeekIndex` sie findet. */
function laufendeWoche(over: Partial<Week> = {}): Week {
  const heute = new Date()
  const montag = new Date(heute)
  montag.setDate(heute.getDate() - ((heute.getDay() + 6) % 7))
  const iso = `${montag.getFullYear()}-${String(montag.getMonth() + 1).padStart(2, '0')}-${String(montag.getDate()).padStart(2, '0')}`
  return {
    range: 'diese Woche', book: '', start: iso, 
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
const platzKey = (w: Week) => punktKey(w.start, 'mid', (w.mid.sections[0]!.items[0] as PartItem).iid, 0)

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
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

describe('Der Gruß', () => {
  const gruss = (container: HTMLElement) => container.querySelector('h1')?.textContent ?? ''

  it('begrüßt mit dem Vornamen', () => {
    const { container } = zeige()
    expect(gruss(container)).toContain('Anton')
  })

  it('ohne verknüpfte Person bleibt es beim Gruß — ohne „undefined" und ohne Komma', () => {
    const { container } = zeige({ personId: null })
    expect(gruss(container)).not.toContain('undefined')
    expect(gruss(container)).not.toContain(',')
  })

  it('der Gruß richtet sich nach der Tageszeit', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (const [stunde, erwartet] of [[8, t.grussMorgen], [14, t.grussTag], [20, t.grussAbend]] as const) {
        vi.setSystemTime(new Date(2026, 8, 7, stunde, 0))
        const { container } = zeige()
        expect(gruss(container)).toContain(erwartet)
        cleanup()
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

/* ---- Die nächste eigene Aufgabe, groß (T121) -------------------------------- */

/** Der Kalendertag in `n` Tagen als UTC-Mitternacht — die Form von `MyTask.at`. */
const inTagen = (n: number): number => {
  const h = new Date()
  return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate() + n)
}

const karte = (container: HTMLElement) => container.querySelector('.aufgabe-karte')
const knopf = (root: Element | null, text: string) =>
  [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text)

describe('Die nächste Aufgabe steht groß oben', () => {
  it('ohne jede Aufgabe steht der ruhige Satz statt einer leeren Karte', () => {
    const { container } = zeige({ myTasks: [] })
    expect(karte(container)).toBeNull()
    expect(container.querySelector('.start-leer')?.textContent).toBe(t.dashKeineAufgabe)
  })

  it('mit Programmpunkt, Rolle und Termin — der Abstand in Worten vorn', () => {
    const { container } = zeige({ myTasks: [task({ rolle: 'Schüler', at: inTagen(1) })] })
    expect(container.querySelector('.aufgabe-titel')?.textContent).toBe('Bibellesung')
    expect(container.querySelector('.aufgabe-unter')?.textContent).toBe('Schüler')
    const wann = container.querySelector('.aufgabe-wann')?.textContent ?? ''
    expect(wann).toMatch(/^Morgen · /)
    expect(wann).toContain('8. September')
  })

  it('bei einer Schulungsaufgabe steht der Partner dabei', () => {
    const { container } = zeige({ myTasks: [task({ rolle: 'Schüler', s89: { ...S89, partner: 'Bruno Bauer' } })] })
    expect(container.querySelector('.aufgabe-unter')?.textContent).toBe(`Schüler · ${t.s89Partner}: Bruno Bauer`)
  })

  it('wo die Rolle allein trägt, steht sie oben', () => {
    const { container } = zeige({ myTasks: [task({ title: '', rolle: 'Mikrofone' })] })
    expect(container.querySelector('.aufgabe-titel')?.textContent).toBe('Mikrofone')
    expect(container.querySelector('.aufgabe-unter')).toBeNull()
  })

  it('offen: Bestätigen und „Ich kann nicht" — das öffnet das Absage-Blatt', () => {
    const { container, dispatch } = zeige({ myTasks: [task()] })
    fireEvent.click(knopf(karte(container), t.bestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T1' })
    fireEvent.click(knopf(karte(container), t.kannNicht)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openAbsage', id: 'T1' })
  })

  it('bestätigt: statt des Knopfs steht der Stand — absagen geht weiter', () => {
    const { container } = zeige({ myTasks: [task({ status: 'bestätigt' })] })
    expect(knopf(karte(container), t.bestaetigen)).toBeUndefined()
    expect(container.querySelector('.aufgabe-stand')?.textContent).toBe(t.bestaetigt)
    expect(knopf(karte(container), t.kannNicht)).toBeDefined()
  })

  it('verhindert: der Stand, und „Doch bestätigen"', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ status: 'verhindert' })] })
    expect(container.querySelector('.aufgabe-stand.is-problem')?.textContent).toBe(t.verhindertChip)
    expect(knopf(karte(container), t.kannNicht)).toBeUndefined()
    fireEvent.click(knopf(karte(container), t.dochBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: 'T1' })
  })

  it('bei einer Schulungsaufgabe führt der Weg zum S-89-Formular', () => {
    const { container, dispatch } = zeige({ myTasks: [task({ s89: S89 })] })
    fireEvent.click(knopf(karte(container), 'S-89')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openS89', payload: S89 })
  })

  it('sonst nicht — für einen Hilfsdienst gibt es kein Formular', () => {
    const { container } = zeige({ myTasks: [task({ s89: null })] })
    expect(knopf(karte(container), 'S-89')).toBeUndefined()
  })
})

describe('Über einer Aufgabe in einer Zusammenkunft steht der Saal', () => {
  /** Die laufende Woche mit dem eigenen Platz besetzt — die Aufgabe dazu trägt seinen Schlüssel. */
  function meinAbend(): { woche: Week; meine: MyTask } {
    const woche = laufendeWoche()
    platz(woche).name = 'Anton Alt'
    platz(woche).pid = 'p-a'
    woche.mid.helpers.mik = [{ name: 'Bruno Test', pid: 'p-b' }]
    return { woche, meine: task({ id: platzKey(woche), at: inTagen(1) }) }
  }

  it('mit Worten für Vorleseprogramme: wie viele Plätze besetzt sind, und dass der eigene markiert ist', () => {
    const { woche, meine } = meinAbend()
    const { container } = zeige({ weeks: [woche], myTasks: [meine] })
    const saal = container.querySelector('svg.saal')
    expect(saal?.getAttribute('role')).toBe('img')
    // Bibellesung (ich) + Mikrofon 1 besetzt, Mikrofon 2 offen.
    expect(saal?.getAttribute('aria-label')).toBe(`${t.saalBesetzung}: 2/3 · ${t.saalDeinPlatz}`)
    expect(container.querySelectorAll('.saal-du')).toHaveLength(1)
  })

  it('eine Absage im Abend steht rot im Saal', () => {
    const { woche, meine } = meinAbend()
    const confirmations: ConfirmationMap = { [helferKey(woche.start, 'mid', 'mik', 0)]: 'verhindert' }
    const { container } = zeige({ weeks: [woche], myTasks: [meine], confirmations })
    expect(container.querySelectorAll('.saal-platz.is-problem').length).toBeGreaterThan(0)
  })

  it('ein Treffpunkt hat keinen Saal', () => {
    const { container } = zeige({ myTasks: [task({ id: `fs|${laufendeWoche().start}|r1`, title: '', rolle: t.fsLeiterLbl })] })
    expect(container.querySelector('svg.saal')).toBeNull()
  })
})

describe('Die nächsten Aufgaben danach, je eine Zeile', () => {
  const vier = (): MyTask[] => [1, 2, 3, 4, 5].map((n) => task({ id: `T${n}`, title: `Aufgabe ${n}`, at: inTagen(n) }))

  it('höchstens drei unter der großen Karte — die ganze Liste hat „Meine Aufgaben"', () => {
    const { container } = zeige({ myTasks: vier() })
    const zeilen = [...container.querySelectorAll('.start-spalte > .start-liste .start-zeile-text')].map((z) => z.textContent)
    expect(zeilen).toEqual(['Aufgabe 2', 'Aufgabe 3', 'Aufgabe 4'])
  })

  it('ein Tipp öffnet das Blatt genau dieser Aufgabe', () => {
    const { container, dispatch } = zeige({ myTasks: vier() })
    fireEvent.click(container.querySelector('.start-spalte > .start-liste .start-zeile')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openMyTask', id: 'T2' })
  })

  /** Ein eigener Trolley-Termin (T121, Phase 7) in `n` Tagen — ohne Zusage, also nie die große Karte. */
  const trolley = (n: number): Partial<AppState> => ({
    trolleys: [{ id: 'tr1', name: 'Trolley 1', ort: '', hinweis: '' }],
    trolleyTermine: [
      {
        id: 'r1', trolleyId: 'tr1', datum: new Date(inTagen(n)).toISOString().slice(0, 10),
        von: '09:00', bis: '11:00', pid: 'p-a', partner: null, gemeinsam: false,
      },
    ],
  })
  const zeilen = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.start-spalte > .start-liste .start-zeile')]

  it('dazwischen, nach dem Tag, die eigenen Trolley-Termine — ein Tipp führt zu den Trolleys', () => {
    const { container, dispatch } = zeige({ myTasks: vier(), ...trolley(3) })
    const z = zeilen(container)
    // Am selben Tag steht die Aufgabe vorn.
    expect(z.map((e) => e.querySelector('.start-zeile-text')?.textContent)).toEqual([
      'Aufgabe 2', 'Aufgabe 3', `${t.privZeugnis} · 09:00–11:00`,
    ])
    fireEvent.click(z[2]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'trolleys' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'programm', thema: 'predigtdienst' })
  })

  it('auch ohne Aufgabe steht der Trolley-Termin da', () => {
    const { container } = zeige(trolley(2))
    expect(container.querySelector('.start-leer')).not.toBeNull()
    expect(zeilen(container).map((e) => e.querySelector('.start-zeile-text')?.textContent)).toEqual([`${t.privZeugnis} · 09:00–11:00`])
  })
})

describe('Diese Woche in der Versammlung', () => {
  it('nennt die Zusammenkünfte und die Treffpunkte der eigenen Gruppe, nicht die fremder', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag
    try {
      const woche = { ...laufendeWoche(), start: '2026-09-07' }
      const eigene: FsInstance = { id: 'g1', ruleId: 'g1', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Albrechts', leader: '' }
      const fremde: FsInstance = { ...eigene, id: 'g2', ruleId: 'g2', grp: 'g2', place: 'Anderswo' }
      const { container } = zeige({
        weeks: [woche],
        fsWeeks: [[fremde, eigene]],
        persons: [{ ...ICH, grp: 'g1' }],
        groups: [
          { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
          { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
        ],
      })
      const was = [...container.querySelectorAll('.start-woche .start-zeile-text')].map((z) => z.textContent)
      expect(was).toEqual([t.tabMid, 'Gruppe 1 · Bei Albrechts', t.tabWe])
    } finally {
      vi.useRealTimers()
    }
  })

  it('… und die der Gruppe, die man leitet — wie im Predigtdienst (`eigeneGruppen`)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag
    try {
      const woche = { ...laufendeWoche(), start: '2026-09-07' }
      const geleitet: FsInstance = { id: 'g2', ruleId: 'g2', grp: 'g2', wd: 6, time: '09:30', place: 'Anderswo', leader: '' }
      const { container } = zeige({
        weeks: [woche],
        fsWeeks: [[geleitet]],
        persons: [{ ...ICH, grp: 'g1' }],
        groups: [
          { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
          { id: 'g2', name: 'Gruppe 2', overseerId: ICH.id, assistantId: null },
        ],
      })
      const was = [...container.querySelectorAll('.start-woche .start-zeile-text')].map((z) => z.textContent)
      expect(was).toEqual([t.tabMid, 'Gruppe 2 · Anderswo', t.tabWe])
    } finally {
      vi.useRealTimers()
    }
  })

  it('der Ort steht in der Sprache des Lesers — wie im Programm', () => {
    // Bis zum 15.10.2026 stand hier „Congregation field service meeting ·
    // Königreichssaal": Der Vorgabewert steht im Wörterbuch, nur der Start
    // ließ ihn aus.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag
    try {
      const woche = { ...laufendeWoche(), start: '2026-09-07' }
      const saal: FsInstance = { id: 'v1', ruleId: 'v1', grp: null, wd: 6, time: '09:30', place: 'Königreichssaal', leader: '' }
      const { container } = zeige({ lang: 'en', weeks: [woche], fsWeeks: [[saal]] })
      const en = makeTr('en')
      expect(en('Königreichssaal')).not.toBe('Königreichssaal')
      const was = [...container.querySelectorAll('.start-woche .start-zeile-text')].map((z) => z.textContent)
      expect(was).toContain(`${dict('en').fsVers} · ${en('Königreichssaal')}`)
    } finally {
      vi.useRealTimers()
    }
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
    range, book: '', start, 
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
      for (const pos of [0, 1]) map[helferKey(start, tab, 'mik', pos)] = 'bestätigt'
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
      eintrag(helferKey(w.start, tab, 'mik', 0), 'Bruno Test')
      eintrag(helferKey(w.start, tab, 'mik', 1), 'Carl Test')
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
    ? { titel: el.firstElementChild?.textContent, n: el.querySelector('.dash-chip-n')?.textContent }
    : null
}

/** Der Import-Knopf auf der Karte — er heißt wie der in den Einstellungen. */
const importKnopf = (root: Element) => root.querySelector<HTMLButtonElement>('.dash-plan-vorrat button')

describe('Die Planungs-Karte gehört dem Planer — und steht bei ihm gleich daneben (T95)', () => {
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

  it('beim Planer steht sie in einer eigenen Spalte neben den eigenen Aufgaben', () => {
    // Bis T95 stand die Arbeit des Planers als letzte Zeile unter seinem
    // eigenen Verkündiger-Teil. Seit T121 steht sie daneben — am Handy darunter.
    const { container } = planer({ weeks: [importiert(W1)], myTasks: [task()] })
    const spalten = [...container.querySelectorAll('.start-spalten.is-planer > .start-spalte')]
    expect(spalten).toHaveLength(2)
    expect(spalten[0]!.querySelector('.aufgabe-karte')).not.toBeNull()
    expect(spalten[1]!.querySelector('.dash-planung')).not.toBeNull()
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

  it('Konflikte der Gruppenbesuche stehen dabei — auch Monate voraus (T120)', () => {
    // Alles zugeteilt, aber ein Besuch am 7. November: dem ersten Samstag, an
    // dem sich die Gruppen nicht treffen. Er liegt weit hinter den vier
    // Wochen der Karte — gerade dann ist noch Zeit, ihn zu verlegen.
    const weeks = WOCHEN.map(besetzt)
    const { container, dispatch } = planer({
      weeks,
      confirmations: allesBestaetigt(weeks),
      gruppenbesuche: [{ id: 'b1', woche: '2026-11-02', grp: 'g1', pid: 'p-a' }],
    })
    expect(container.querySelector('.dash-plan-text')).toBeNull() // kein „Alles zugeteilt"
    const zeile = [...container.querySelectorAll('.dash-plan-woche')].find((z) => z.textContent?.includes(t.gbTitel))!
    expect(chip(zeile, 'konflikte')?.n).toBe('1')
    fireEvent.click(zeile)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFsBereich', bereich: 'gruppenbesuche' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'predigtdienst' })
  })

  /*
   * **Trolleys plant niemand** (T121, Phase 7): Wer einen Partner sucht,
   * findet ihn selbst — die Karte der Planer nennt dazu nichts.
   */
  it('ein Trolley-Termin, bei dem ein Partner gesucht wird, ändert an „Alles zugeteilt" nichts', () => {
    const weeks = WOCHEN.map(besetzt)
    const { container } = planer({
      weeks,
      confirmations: allesBestaetigt(weeks),
      trolleys: [{ id: 'tr1', name: 'Trolley 1', ort: '', hinweis: '' }],
      trolleyTermine: [
        { id: 'r1', trolleyId: 'tr1', datum: '2026-09-09', von: '10:00', bis: '12:00', pid: 'p-b', partner: null, gemeinsam: false },
      ],
    })
    expect(container.querySelector('.dash-plan-text')?.textContent).toBe(t.dashAllesZugeteilt)
  })

  it('ist nichts zu tun, schrumpft sie auf eine Zeile „Alles zugeteilt"', () => {
    const weeks = WOCHEN.map(besetzt)
    const { container, dispatch } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(container.querySelector('.dash-planung')).toBeNull()
    expect(container.querySelector('.dash-plan-text')?.textContent).toBe(t.dashAllesZugeteilt)
    fireEvent.click(container.querySelector('.dash-plan .dash-plan-woche')!)
    // Mit Thema: Wer zuletzt im Predigtdienst war, käme sonst dort heraus.
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' })
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
    expect(importKnopf(container)?.textContent).toBe(t.importBtn)
  })

  it('auch der Planer holt das Programm — wer die Woche plant, holt sie (15.10.2026)', () => {
    const weeks = [besetzt(W1)]
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks), planner: false, zuteiler: true })
    expect(importKnopf(container)?.textContent).toBe(t.importBtn)
  })

  it('der Knopf holt die nächste Woche — derselbe Ablauf wie in den Einstellungen', async () => {
    const neu = importiert(W2)
    importNextWeek.mockResolvedValue({ ok: true, week: neu })
    const weeks = [besetzt(W1)]
    const { container, dispatch } = planer({ weeks, confirmations: allesBestaetigt(weeks), dataStatus: 'ready' })
    fireEvent.click(importKnopf(container)!)
    // Ab der zuletzt geladenen Woche, in der Versammlungssprache.
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'addImportedWeek', week: neu }))
    expect(importNextWeek).toHaveBeenCalledWith(W1, 'de', [])
    expect(dispatch).toHaveBeenCalledWith({ type: 'startImport' })
  })

  it('offline fängt er gar nicht erst an', () => {
    const weeks = [besetzt(W1)]
    const { container, dispatch } = planer({ weeks, staleAt: Date.now() })
    fireEvent.click(importKnopf(container)!)
    expect(importNextWeek).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.offlineReadOnly })
  })

  it('ohne jede Woche: „Noch keine Woche geladen" — der erste Import steht aus', () => {
    const { container } = planer({ weeks: [] })
    expect(container.querySelector('.dash-plan-vorrat-text')?.textContent).toBe(t.geladenNichts)
    expect(importKnopf(container)).not.toBeNull()
  })

  it('reicht der Vorrat, steht nichts davon da', () => {
    const weeks = WOCHEN.map(besetzt)
    const { container } = planer({ weeks, confirmations: allesBestaetigt(weeks) })
    expect(container.querySelector('.dash-plan-vorrat')).toBeNull()
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
