/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { Befund } from '../../supabase/functions/import-week/befunde.ts'
import { dict } from '../i18n/ui'
import type { Section, Service, Week } from '../data/types'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Programm holen — der einzige Weg zu einem Wochenprogramm** (T121, Phase
 * 10, Entwurf `GImport`).
 *
 * „Holen" holt die nächste Woche und legt sie im Blatt vor; übernommen wird
 * erst dort — mit oder ohne gleich zuzuteilen. Auf der Entwicklerseite ohne
 * Datenbank sagt derselbe Knopf, dass er nichts holen kann — vorgetäuscht wird
 * dort kein Abruf.
 *
 * Bis Phase 10 stand der Import als Karte in den Einstellungen und hängte die
 * Woche sofort an (`programm-import.test.tsx`); die Abläufe darin — Sprache,
 * Varianten, Blöcke, Fehler — gelten unverändert und stehen hier.
 */

const importNextWeek = vi.fn((_after?: string, _lang?: string, _alt?: string[]) =>
  Promise.resolve<{ ok: boolean; week?: Week; befunde?: Befund[]; error?: string }>({ ok: true, week: undefined }),
)
const importWeekVariants = vi.fn((_start: string, _lang: string, _codes: string[]) =>
  Promise.resolve<{ ok: boolean; week?: Week; befunde?: Befund[] }>({ ok: false }),
)

/** Wie `import.ts`: Ein Erfolg trägt immer seine Befunde, notfalls keine. */
const mitBefunden = <T extends { ok: boolean; befunde?: Befund[] }>(r: T): T => (r.ok ? { befunde: [], ...r } : r)

vi.mock('../lib/import', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  importNextWeek: (a?: string, b?: string, c?: string[]) => importNextWeek(a, b, c).then(mitBefunden),
  importWeekVariants: (a: string, b: string, c: string[]) => importWeekVariants(a, b, c).then(mitBefunden),
}))

const { HolenKnopf } = await import('./ProgrammHolen')

const t = dict('de')

// jsdom kennt `matchMedia` nicht; das Blatt fragt danach (Wischen am Handy).
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

function woche(start: string | undefined, range = '7.–13. September', sections: Section[] = []): Week {
  return {
    range, book: '', start,
    mid: { date: '', end: '', sections, helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
  } as Week
}

/** Ein Abschnitt mit `n` nummerierten Punkten und einem Lied davor. */
function abschnitt(label: string, farbe: Section['farbe'], n: number): Section {
  return {
    label,
    farbe,
    items: [
      { song: 'Lied 1' },
      ...Array.from({ length: n }, (_, i) => ({ iid: `${label}-${i}`, num: i + 1, title: `Punkt ${i + 1}`, names: [] })),
    ],
  }
}

const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', admin: true,
    persons: [], services: DIENSTE, groups: [], weeks: [], fsWeeks: [],
    congLang: 'de', progLangs: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <HolenKnopf className="holen-probe" />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const holen = (root: Element) => fireEvent.click(root.querySelector('.holen-probe')!)
/** Das Blatt hängt an `body` (Portal), nicht unter dem Knopf. */
const blatt = () => document.body.querySelector('[role="dialog"]')
const blattKnopf = (text: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === text)
/** Bis das Blatt vorlegt, was kam — dann gilt „Nur übernehmen". */
const geholt = () => waitFor(() => expect(blattKnopf(t.nurUebernehmen)?.disabled).toBe(false))

beforeEach(() => {
  // „Heute" ist in jedem Fall Montag, der 7. September 2026, 9 Uhr — wie auf
  // der Entwicklerseite. Wonach „Holen" sucht, hängt am Tag (`holenNach`);
  // wer einen anderen braucht, stellt ihn selbst.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0))
  importNextWeek.mockClear().mockResolvedValue({ ok: true, week: woche('2026-09-14') })
  importWeekVariants.mockClear().mockResolvedValue({ ok: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Holen in der Produktion', () => {
  it('holt die nächste Woche in der Versammlungssprache', async () => {
    // Heute ist der Montag der geladenen Woche.
    const { container } = zeige({ weeks: [woche('2026-09-07')], congLang: 'en' })
    holen(container)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-09-07', 'en', []))
  })

  it('nach einer Pause die laufende Woche, nicht die nach der zuletzt geladenen (16.10.2026)', async () => {
    // Geladen bis zur Woche ab 7.9., heute ist Mittwoch, der 30. — gesucht
    // wird nach der Vorwoche, es kommt die Woche ab 28.9. (`holenNach`).
    vi.setSystemTime(new Date(2026, 8, 30, 9, 0))
    const { container } = zeige({ weeks: [woche('2026-09-07')], congLang: 'en' })
    holen(container)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-09-21', 'en', []))
  })

  it('ohne geladene Woche nach der Vorwoche — die App sagt, wonach gesucht wird (16.10.2026)', async () => {
    // Montag, 0:30 Uhr: Ohne Angabe rechnete der Server mit seinem UTC-Tag,
    // noch Sonntag, und lieferte die vergangene Woche.
    vi.setSystemTime(new Date(2026, 8, 14, 0, 30))
    const { container } = zeige()
    holen(container)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-09-07', 'de', []))
  })

  it('unbekannte Versammlungssprache fällt auf Deutsch zurück statt leer zu bleiben', async () => {
    const { container } = zeige({ congLang: 'xx-erfunden' })
    holen(container)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-08-31', 'de', []))
  })

  it('weitere Programmsprachen kommen als Varianten mit — ohne die Hauptsprache doppelt', async () => {
    const { container } = zeige({ congLang: 'de', progLangs: ['en', 'de'] })
    holen(container)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalledWith('2026-08-31', 'de', ['en']))
  })

  it('die geholte Woche wird erst mit „Nur übernehmen" angehängt', async () => {
    const neue = woche('2026-09-14')
    importNextWeek.mockResolvedValue({ ok: true, week: neue })
    const { container, dispatch } = zeige()
    holen(container)
    await geholt()
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'addImportedWeek', week: neue })
    fireEvent.click(blattKnopf(t.nurUebernehmen)!)
    // Ohne Befunde bleibt die Woche, wie sie kam — keine leere Liste an jeder.
    expect(dispatch).toHaveBeenCalledWith({ type: 'addImportedWeek', week: neue })
    expect(blatt()).toBeNull()
  })

  it('Übernehmen nimmt mit, was der Parser geraten hat — der Plan markiert es dann (Review Nr. 4)', async () => {
    // Bis zum 1.11.2026 ging der Kasten mit dem Blatt, und nichts erinnerte
    // im Plan an die geratenen Plätze.
    const neue = woche('2026-09-14')
    const befunde: Befund[] = [{ art: 'unbekannt', nr: 7, iid: 'neu-7', titel: 'Etwas ganz Neues', form: 'Rollenspiel' }]
    for (const knopf of [t.nurUebernehmen, t.uebernehmenZuteilen]) {
      importNextWeek.mockResolvedValue({ ok: true, week: neue, befunde })
      const { container, dispatch } = zeige()
      holen(container)
      await geholt()
      fireEvent.click(blattKnopf(knopf)!)
      expect(dispatch, knopf).toHaveBeenCalledWith({ type: 'addImportedWeek', week: { ...neue, befunde } })
      cleanup()
    }
  })

  it('„Übernehmen und zuteilen" hängt an, öffnet die Woche und besetzt sie', async () => {
    const neue = woche('2026-09-14')
    importNextWeek.mockResolvedValue({ ok: true, week: neue })
    const { container, dispatch } = zeige({ weeks: [woche('2026-09-07')] })
    holen(container)
    await geholt()
    dispatch.mockClear()
    fireEvent.click(blattKnopf(t.uebernehmenZuteilen)!)
    expect(dispatch.mock.calls.map(([a]) => a)).toEqual([
      { type: 'addImportedWeek', week: neue },
      { type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'mid' } },
      { type: 'autoAssign', scope: 'all', umfang: 'woche' },
    ])
  })

  it('von der Seite der Wochen geholt, führt Zurück aus der neuen Woche dorthin — aus dem Plan, wohin es vorher führte (T144)', async () => {
    const neue = woche('2026-09-14')
    for (const [over, von] of [
      [{ screen: 'wochen' }, 'wochen'],
      [{ screen: 'planen', planenVon: 'ansicht' }, 'ansicht'],
    ] as const) {
      importNextWeek.mockResolvedValue({ ok: true, week: neue })
      const { container, dispatch } = zeige({ weeks: [woche('2026-09-07')], ...over })
      holen(container)
      await geholt()
      fireEvent.click(blattKnopf(t.uebernehmenZuteilen)!)
      expect(dispatch, over.screen).toHaveBeenCalledWith({ type: 'navigate', screen: 'planen', woche: { wi: 1, tab: 'mid' }, von })
      cleanup()
    }
  })

  it('kam dieselbe Woche noch einmal, wird nur angehängt — der Reducer sagt dann, dass alles da ist', async () => {
    // `addImportedWeek` hängt eine schon geladene Woche nicht an. Ein Sprung
    // auf ihren Index wiese ins Leere, ein Zuteilen träfe die gezeigte Woche.
    const da = woche('2026-09-07')
    importNextWeek.mockResolvedValue({ ok: true, week: da })
    const { container, dispatch } = zeige({ weeks: [da] })
    holen(container)
    await geholt()
    dispatch.mockClear()
    fireEvent.click(blattKnopf(t.uebernehmenZuteilen)!)
    expect(dispatch.mock.calls.map(([a]) => a)).toEqual([{ type: 'addImportedWeek', week: da }])
  })

  it('ein Fehler beendet den Lauf, schließt das Blatt und sagt, was los ist — in der Sprache des Lesers', async () => {
    // Fehlt die Woche in der Sprache der Versammlung, sagt es ein eigener Satz;
    // bis Phase 10 (T121) kam der deutsche Satz des Servers in jeder Sprache.
    importNextWeek.mockResolvedValue({ ok: false, error: 'sprache-fehlt' })
    const { container, dispatch } = zeige()
    holen(container)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'stopImport' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.holenSpracheFehlt })
    await waitFor(() => expect(blatt()).toBeNull())
  })

  it('ohne angebundene Datenbank steht der passende Satz — nicht der vom Anmelden', async () => {
    // So endet der Knopf auch auf der Entwicklerseite: Sie hat keinen Client.
    // Bis zum 2.10.2026 hängte er dort eine erfundene Woche an (`finishImport`).
    importNextWeek.mockResolvedValue({ ok: false, error: 'ohne-datenbank' })
    const { container, dispatch } = zeige()
    holen(container)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.importOhneDb }))
  })

  it('hat das Heft keine weitere Woche, sagt der Knopf das — in der Sprache des Nutzers', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'ende' })
    const { container, dispatch } = zeige()
    holen(container)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastAlleWochen }))
  })

  it('ein unbekannter Fehler bekommt den allgemeinen Satz', async () => {
    importNextWeek.mockResolvedValue({ ok: false, error: 'unbekannt' })
    const { container, dispatch } = zeige()
    holen(container)
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.importFehler }))
  })

  it('fehlende Sprachvarianten geladener Wochen werden zuerst nachgezogen', async () => {
    // Eine Programmsprache, die nach dem Import hinzukam, fehlt sonst dauerhaft.
    // Heute ist der Montag der geladenen Woche.
    const alt = woche('2026-09-14')
    importWeekVariants.mockResolvedValue({ ok: true, week: { ...alt, alt: { en: alt } } })
    const { container, dispatch } = zeige({ weeks: [woche('2026-09-07')], congLang: 'de', progLangs: ['en'] })
    holen(container)
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledWith('2026-09-07', 'de', ['en']))
    await waitFor(() => expect(dispatch.mock.calls.some((c) => c[0].type === 'mergeWeekAlt')).toBe(true))
  })

  it('eine nachgeholte Sprache bringt nur mit, wie sie selbst sich gliedert (Review Nr. 4)', async () => {
    // Die Function parst die ganze Woche neu: Ihre übrigen Befunde gelten der
    // Fassung der Versammlung, und die kam schon mit ihren eigenen — samt
    // Kennungen, die die gespeicherte Woche nicht trägt.
    const alt = woche('2026-09-14')
    const enGliederung: Befund = { art: 'gliederung', sprache: 'en', ist: 'a', soll: 'b' }
    importWeekVariants.mockResolvedValue({
      ok: true,
      week: { ...alt, alt: { en: alt } },
      befunde: [
        { art: 'unbekannt', nr: 7, iid: 'frisch-geparst', titel: 'Neu', form: 'Rollenspiel' },
        { art: 'gliederung', sprache: 'es', ist: 'a', soll: 'b' },
        enGliederung,
      ],
    })
    const { container, dispatch } = zeige({ weeks: [woche('2026-09-07')], congLang: 'es', progLangs: ['en'] })
    holen(container)
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledWith('2026-09-07', 'es', ['en']))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'mergeWeekAlt', start: '2026-09-07', alt: { en: alt }, befunde: [enGliederung] }),
    )
  })

  it('mehrere Lücken werden in Blöcken geholt, nicht eine nach der anderen', async () => {
    /*
     * Wird eine zweite Programmsprache nachträglich eingerichtet, fehlt sie in
     * **jeder** geladenen Woche. Streng nacheinander lägen bei vollem
     * Ladefenster Minuten hinter einem Knopfdruck: jeder Aufruf ist eine Edge
     * Function, die rund zehn Seiten von jw.org holt.
     *
     * Gemessen wird, wie viele Aufrufe gleichzeitig offen sind — nicht die
     * Zeit: Das eine ist die Eigenschaft, das andere wäre eine Wette auf den
     * Testrechner.
     */
    let offen = 0
    let hoechstens = 0
    const warten: Array<() => void> = []
    importWeekVariants.mockImplementation((start: string) => {
      offen++
      hoechstens = Math.max(hoechstens, offen)
      return new Promise((fertig) => {
        warten.push(() => {
          offen--
          const w = woche(start)
          fertig({ ok: true, week: { ...w, alt: { en: w } } })
        })
      })
    })

    // Heute ist der 7.9.: Alle fünf Wochen kommen noch.
    const wochen = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((s) => woche(s))
    const { container } = zeige({ weeks: wochen, congLang: 'de', progLangs: ['en'] })
    holen(container)

    // Erster Block: vier gleichzeitig, die fünfte wartet noch.
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledTimes(4))
    expect(hoechstens).toBe(4)
    warten.splice(0).forEach((f) => f())
    // Zweiter Block: die übrige Woche.
    await waitFor(() => expect(importWeekVariants).toHaveBeenCalledTimes(5))
    warten.splice(0).forEach((f) => f())
    // Und nie mehr als ein Block auf einmal — sonst löge die Grenze.
    expect(hoechstens).toBe(4)
  })

  it('vergangene Wochen werden nicht mehr nachgezogen — auch nicht bei jedem Holen erneut (16.10.2026)', async () => {
    // Eine vergangene Woche braucht beim Planen niemand in einer weiteren
    // Sprache. Bis dahin kam auf jedes Holen für jede alte Woche ein
    // vergeblicher Aufruf — und seit `import-week` ein Jahr zurück findet
    // (18.10.2026), käme er durch: ein Jahr Wochen samt Sprachen je Holen.
    vi.setSystemTime(new Date(2026, 8, 16, 9, 0)) // Mittwoch der Woche ab 14.9.
    const wochen = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'].map((s) => woche(s))
    const { container } = zeige({ weeks: wochen, congLang: 'de', progLangs: ['en'] })
    holen(container)
    await waitFor(() => expect(importNextWeek).toHaveBeenCalled())
    // Die laufende Woche zählt noch mit, die beiden davor nicht.
    expect(importWeekVariants.mock.calls.map(([start]) => start)).toEqual(['2026-09-14', '2026-09-21'])
  })

  it('während eines laufenden Abrufs löst ein zweiter Tipp nichts aus', () => {
    const { container } = zeige({ importing: true })
    holen(container)
    expect(importNextWeek).not.toHaveBeenCalled()
    expect(blatt()).toBeNull()
  })

  it('gesperrt behält er den Fokus — wer das Blatt schließt, kommt bei ihm an (16.10.2026)', () => {
    // Mit `disabled` gab er den Fokus ab, sobald er sich mit dem eigenen Tipp
    // sperrte; das Blatt gab ihn beim Schließen an einen Knopf zurück, der ihn
    // nicht nehmen kann — und er landete auf der Seite.
    const { container } = zeige({ importing: true })
    const knopf = container.querySelector<HTMLButtonElement>('.holen-probe')!
    expect(knopf.disabled).toBe(false)
    expect(knopf.getAttribute('aria-disabled')).toBe('true')
    knopf.focus()
    expect(document.activeElement).toBe(knopf)
  })

  it('offline fängt er gar nicht erst an und öffnet auch kein Blatt', () => {
    const { container, dispatch } = zeige({ staleAt: Date.now() })
    holen(container)
    expect(importNextWeek).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.offlineReadOnly })
    expect(blatt()).toBeNull()
  })
})

describe('Das Blatt zeigt, was kam (Entwurf `GImport`)', () => {
  it('hängt an `body`, nicht unter dem Knopf — am Desktop läge es sonst unter dem Plan (16.10.2026)', async () => {
    // Der Knopf steht dort in der klebenden Wochenspalte; deren Ebene liegt
    // unter dem Wochenstreifen. Im Browser bei 1440 px gemessen.
    const { container } = zeige()
    holen(container)
    await geholt()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(blatt()?.parentElement).toBe(document.body)
  })

  it('solange geholt wird: ein Satz dazu, beide Übernehmen gesperrt', () => {
    importNextWeek.mockReturnValue(new Promise(() => {}))
    const { container } = zeige()
    holen(container)
    expect(blatt()?.textContent).toContain(t.holtProgramm)
    expect(blattKnopf(t.uebernehmenZuteilen)?.disabled).toBe(true)
    expect(blattKnopf(t.nurUebernehmen)?.disabled).toBe(true)
    // Die Spur steht beim Holen.
    expect(blatt()?.querySelector('[aria-current="step"]')?.textContent).toBe(t.spurHolen)
  })

  it('die Woche, ihre Abschnitte mit der Zahl der Punkte und die Sprachen', async () => {
    importNextWeek.mockResolvedValue({
      ok: true,
      week: woche('2026-09-14', '14.–20. September', [
        abschnitt('SCHÄTZE AUS GOTTES WORT', 'petrol', 3),
        abschnitt('UNS IM DIENST VERBESSERN', 'gold', 3),
        abschnitt('UNSER LEBEN ALS CHRIST', 'wein', 2),
        // Ohne nummerierte Punkte (Eröffnung, Lied): kein eigener Abschnitt im Blatt.
        { label: 'ABSCHLUSS', farbe: 'neutral', items: [{ song: 'Lied 2' }] },
      ]),
    })
    const { container } = zeige({ congLang: 'de', progLangs: ['en'] })
    holen(container)
    await geholt()
    const dialog = blatt()!
    expect(dialog.querySelector('.holen-spanne')?.textContent).toBe(zahlBinden('14.–20. September'))
    expect(dialog.querySelector('.holen-kopf .klein-text')?.textContent).toBe(zahlBinden('Programmpunkte: 8'))
    const zeilen = [...dialog.querySelectorAll('.holen-abschnitt')].map((z) => [z.getAttribute('data-farbe'), z.textContent])
    expect(zeilen).toEqual([
      ['petrol', zahlBinden('SCHÄTZE AUS GOTTES WORTPunkte: 3')],
      ['gold', zahlBinden('UNS IM DIENST VERBESSERNPunkte: 3')],
      ['wein', zahlBinden('UNSER LEBEN ALS CHRISTPunkte: 2')],
    ])
    expect(dialog.querySelector('.holen-sprachen')?.textContent).toBe(`${t.programmsprachen}Deutsch, Englisch`)
    expect(dialog.textContent).toContain(t.holenHinweis)
    expect(dialog.querySelector('[aria-current="step"]')?.textContent).toBe(t.spurPruefen)
  })

  it('in einer fremden Sprache steht das Blatt in ihr — kein deutsches Wort aus dem Wörterbuch', async () => {
    importNextWeek.mockResolvedValue({
      ok: true,
      week: woche('2026-09-14', '14.–20. September', [abschnitt('SCHÄTZE AUS GOTTES WORT', 'petrol', 3)]),
    })
    const en = dict('en')
    const { container } = zeige({ lang: 'en' })
    holen(container)
    await waitFor(() => expect(blattKnopf(en.nurUebernehmen)?.disabled).toBe(false))
    const text = blatt()!.textContent ?? ''
    for (const k of ['programmHolen', 'programmHolenText', 'spurHolen', 'spurPruefen', 'holenHinweis', 'uebernehmenZuteilen'] as const) {
      expect(text, k).toContain(en[k])
      expect(text, k).not.toContain(t[k])
    }
    expect(text).toContain(zahlBinden('Program parts: 3'))
  })

  /*
   * **Unerwartetes im Arbeitsheft** (31.10.2026). Bis dahin übernahm „Holen"
   * eine Woche mit einer neuen Form still: Der Parser riet die Plätze, und
   * „Übernehmen und zuteilen" besetzte sie gleich. Jetzt steht über der Woche,
   * was er nicht kannte — je Stelle eine Zeile.
   */
  const MIT_BEFUNDEN: Befund[] = [
    // Ein Punkt, den die gezeigte Woche nicht hat: Es gilt, was der Import sah.
    { art: 'unbekannt', nr: 7, iid: 'nicht-da', titel: 'Etwas ganz Neues', form: 'Rollenspiel zu dritt' },
    // Der Abschnitt steht mit seiner Art im Befund; die Überschrift kommt aus der Woche.
    { art: 'lied', abschnitt: 'eroeffnung' },
    { art: 'gliederung', sprache: 'en', ist: 'a', soll: 'b' },
    { art: 'zeitraum' },
  ]
  /** Eine Woche mit Eröffnung, wie der Import sie baut — Überschrift kanonisch deutsch. */
  const mitEroeffnung = () =>
    woche('2026-09-14', '14.–20. September', [
      { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [{ iid: 'e', title: 'Lied 1', names: [] }] },
      { ...abschnitt('SCHÄTZE AUS GOTTES WORT', 'petrol', 3), kind: 'schaetze' },
    ])
  const kasten = () => blatt()?.querySelector('.holen-befunde') ?? null
  const zeilen = () => [...(kasten()?.querySelectorAll('li') ?? [])].map((li) => li.textContent)

  it('was der Parser nicht kannte, steht über der Woche — Stelle, Titel und was dort ist', async () => {
    importNextWeek.mockResolvedValue({ ok: true, week: mitEroeffnung(), befunde: MIT_BEFUNDEN })
    const { container } = zeige({ progLangs: ['en'] })
    holen(container)
    await geholt()
    expect(kasten()?.querySelector('h3')?.textContent).toBe(t.heftBefundeTitel)
    expect(kasten()?.querySelector('p')?.textContent).toBe(t.heftBefundeText)
    // Ein Alarm: Er erscheint erst nach dem Abruf und wird angesagt.
    expect(kasten()?.getAttribute('role')).toBe('alert')
    expect(zeilen()).toEqual([
      `Punkt 7 · Etwas ganz Neues${t.heftUnbekannt}`,
      `ERÖFFNUNG${t.heftLied}`,
      `Englisch${t.heftGliederung}`,
      // Die ganze Woche: keine Stelle, nur der Satz.
      t.heftZeitraum,
    ])
    // Über der Woche, damit es vor „Übernehmen und zuteilen" gelesen wird.
    const woche_ = blatt()!.querySelector('.holen-woche')!
    expect(kasten()!.compareDocumentPosition(woche_) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Übernehmen bleibt möglich — der Planer entscheidet.
    expect(blattKnopf(t.uebernehmenZuteilen)?.disabled).toBe(false)
  })

  it('Gegenprobe: eine gewöhnliche Woche zeigt keinen Kasten', async () => {
    // Eine Function von vor dem 31.10.2026 ohne das Feld fängt `import.ts` ab
    // (`import.test.ts`).
    importNextWeek.mockResolvedValue({ ok: true, week: woche('2026-09-14'), befunde: [] })
    const { container } = zeige()
    holen(container)
    await geholt()
    expect(blatt()?.querySelector('.holen-woche')).not.toBeNull() // Positivkontrolle: die Woche steht da
    expect(kasten()).toBeNull()
  })

  it('ein Abschnitt, den die Woche nicht hat, steht ohne Stelle da — nie als Schlüssel', async () => {
    // Gefunden auf der Entwicklerseite: Ihre Wochen tragen keine Art an den
    // Abschnitten, und der Kasten zeigte „eroeffnung".
    importNextWeek.mockResolvedValue({ ok: true, week: woche('2026-09-14'), befunde: [{ art: 'lied', abschnitt: 'eroeffnung' }] })
    const { container } = zeige()
    holen(container)
    await geholt()
    expect(zeilen()).toEqual([t.heftLied])
  })

  it('eine Befund-Art, die dieses Bündel nicht kennt, fehlt nur in der Liste — das Blatt steht (Review 31.10.2026)', async () => {
    // Die Function wird vor der App ausgerollt; ein Gerät behält sein Bündel,
    // bis es neu lädt. Bis dahin warf das Blatt beim Zeichnen.
    const neu = { art: 'kuenftig', nr: 3 } as unknown as Befund
    importNextWeek.mockResolvedValue({ ok: true, week: mitEroeffnung(), befunde: [neu, { art: 'zeitraum' }] })
    const { container } = zeige()
    holen(container)
    await geholt()
    expect(kasten()?.querySelector('h3')?.textContent).toBe(t.heftBefundeTitel)
    expect(zeilen()).toEqual([t.heftZeitraum])
  })

  it('der Abschnitt heißt wie in der Fassung, die das Blatt zeigt — nicht wie im Heft der Versammlung (Review 31.10.2026)', async () => {
    // Spanische Versammlung, App auf Englisch, Englisch als Programmsprache:
    // Das Blatt zeigt die englische Fassung. Der Befund trug bis dahin die
    // spanische Überschrift, und `tu` übersetzt keinen spanischen Text.
    const es = woche('2026-09-14', '14–20 de septiembre', [
      { ...abschnitt('TESOROS DE LA BIBLIA', 'petrol', 3), kind: 'schaetze' },
    ])
    const enFassung = woche('2026-09-14', 'September 14-20', [
      { ...abschnitt('TREASURES FROM GOD’S WORD', 'petrol', 3), kind: 'schaetze' },
    ])
    importNextWeek.mockResolvedValue({
      ok: true,
      week: { ...es, lang: 'es', alt: { en: enFassung } } as Week,
      befunde: [{ art: 'bibellesung', abschnitt: 'schaetze', iid: 'TESOROS DE LA BIBLIA-2' }],
    })
    const en = dict('en')
    const { container } = zeige({ lang: 'en', congLang: 'es', progLangs: ['en'] })
    holen(container)
    await waitFor(() => expect(blattKnopf(en.nurUebernehmen)?.disabled).toBe(false))
    // Positivkontrolle: Die Liste darunter zeigt die englische Fassung.
    expect(blatt()!.querySelector('.holen-abschnitt-name')?.textContent).toBe('TREASURES FROM GOD’S WORD')
    expect(zeilen()).toEqual([`TREASURES FROM GOD’S WORD${en.heftBibellesung}`])
  })

  it('in der Sprache des Lesers — und der Abschnitt in der des Programms', async () => {
    importNextWeek.mockResolvedValue({ ok: true, week: mitEroeffnung(), befunde: MIT_BEFUNDEN })
    const en = dict('en')
    const { container } = zeige({ lang: 'en', congLang: 'en' })
    holen(container)
    await waitFor(() => expect(blattKnopf(en.nurUebernehmen)?.disabled).toBe(false))
    expect(kasten()?.querySelector('h3')?.textContent).toBe(en.heftBefundeTitel)
    // Die Sprachnamen kommen nachgeladen (`useLangNames`); bis dahin steht der
    // deutsche — unter der Last der ganzen Suite lange genug, um es zu sehen.
    await waitFor(() =>
      expect(zeilen()).toEqual([
        `Part 7 · Etwas ganz Neues${en.heftUnbekannt}`,
        // „ERÖFFNUNG" steht kanonisch deutsch in der Woche — übersetzt wie im Programm.
        `OPENING${en.heftLied}`,
        `English${en.heftGliederung}`,
        en.heftZeitraum,
      ]),
    )
    for (const k of ['heftBefundeTitel', 'heftBefundeText', 'heftUnbekannt', 'heftLied', 'heftGliederung'] as const) {
      expect(kasten()!.textContent, k).not.toContain(t[k])
    }
  })

  it('wird das Blatt geschlossen, während geholt wird, verfällt das Ergebnis', async () => {
    let liefern: (r: { ok: boolean; week?: Week }) => void = () => {}
    importNextWeek.mockReturnValue(new Promise((r) => (liefern = r)))
    const { container, dispatch } = zeige()
    holen(container)
    fireEvent.click(blattKnopf(t.abbrechen)!)
    expect(blatt()).toBeNull()
    liefern({ ok: true, week: woche('2026-09-14') })
    // Der Lauf endet sauber — aber das Blatt kommt nicht von selbst zurück.
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'stopImport' }))
    expect(blatt()).toBeNull()
  })
})
