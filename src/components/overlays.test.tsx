/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict, loadOverlay } from '../i18n/ui'
import { APP_LANGS } from '../i18n/langs'
import { zahlBinden } from '../i18n/zahl-binden'
import type { MyTask, Notification, S89Payload } from '../data/types'
import { AbsageBlatt } from '../aufgaben/AbsageBlatt'
import { AufgabeBlatt } from '../aufgaben/AufgabeBlatt'
import { S89Sheet } from './S89Sheet'

/**
 * **Die Blätter, die dem Verkündiger gehören.**
 *
 * Ein Verkündiger sieht von der App im Wesentlichen das Blatt zu seiner
 * Aufgabe (seit T121 mit dem Absage-Blatt dahinter) und das S-89-Formular;
 * die Mitteilungen, früher ein drittes Overlay, sind seit T121 eine Seite
 * (`MitteilungenScreen.test.tsx`).
 *
 * Fachlich hängt daran der ganze **Bestätigungs-Flow**: bestätigen, absagen,
 * eine Absage zurücknehmen. Er hat drei Zustände und für jeden andere
 * Handlungen — steht die falsche da, sagt jemand ab, der zusagen wollte. Und
 * beim Hilfsdienst zieht das Absagen eine Ersatzsuche nach sich; darauf muss
 * hingewiesen werden, bevor getippt wird, nicht danach.
 */

const t = dict('de')

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: '2026-09-07|mid|part|0|1|0', title: 'Bibellesung', rolle: 'Leser',
  date: 'Dienstag, 8. September · 19:00', s89: null,
  status: 'offen', at: Date.now() + 86_400_000, ...over,
})

function zeige(
  was: 'myTask' | 'absage' | 's89',
  over: Partial<AppState> = {},
  payload?: S89Payload,
) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: false,
    notifs: [], myTasks: [], persons: [], weeks: [], fsWeeks: [],
    ...over,
  }
  // Wie die Hülle (AppShell): ein Blatt nur, solange es seine Aufgabe gibt.
  const meine = state.myTasks.find((x) => x.id === state.myTaskId)
  const abzusagen = state.myTasks.find((x) => x.id === state.absageId)
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'myTask' && meine && <AufgabeBlatt task={meine} />}
            {was === 'absage' && abzusagen && <AbsageBlatt task={abzusagen} />}
            {was === 's89' && <S89Sheet payload={payload!} />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

/** Ein Knopf an seiner Beschriftung. */
const text = (c: HTMLElement, beschriftung: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent === beschriftung)

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Das Blatt zur eigenen Aufgabe — drei Zustände, drei Angebote', () => {
  const mitAufgabe = (over: Partial<MyTask> = {}) => {
    const eigene = task(over)
    return zeige('myTask', { myTasks: [eigene], myTaskId: eigene.id })
  }

  it('nennt Aufgabe, Rolle und Termin', () => {
    const { container } = mitAufgabe()
    expect(container.querySelector('.sheet-title')?.textContent).toBe('Bibellesung')
    expect(container.querySelector('.sheet-sub')?.textContent).toBe('Leser')
    // Tag und Monat gebunden (T128).
    expect(container.querySelector('.aufgabe-wann')?.textContent).toContain(zahlBinden('8. September'))
  })

  it('der Titel trägt die Sprache des Programms — er trennt, und das nach ihren Regeln (T128)', () => {
    // Russische App, deutsche Versammlung: „Bibellesung" trennte sonst russisch.
    const programm = task()
    const { container } = zeige('myTask', { myTasks: [programm], myTaskId: programm.id, lang: 'ru', congLang: 'de' })
    expect(container.querySelector('.sheet-title [lang]')?.getAttribute('lang')).toBe('de')
    cleanup()
    // Mit Sprachvariante steht der Titel in der Sprache des Lesers.
    const variante = task({ lesersprache: true })
    const zwei = zeige('myTask', { myTasks: [variante], myTaskId: variante.id, lang: 'ru', congLang: 'de' })
    expect(zwei.container.querySelector('.sheet-title [lang]')?.getAttribute('lang')).toBe('ru')
    cleanup()
    // Ohne Programmpunkt steht oben die Rolle — in der Sprache des Lesers, ohne eigenes `lang`.
    const rolle = task({ title: '', rolle: 'Vorsitz' })
    const drei = zeige('myTask', { myTasks: [rolle], myTaskId: rolle.id, lang: 'ru', congLang: 'de' })
    expect(drei.container.querySelector('.sheet-title [lang]')).toBeNull()
  })

  it('offen: bestätigen — oder „Ich kann nicht", das ins Absage-Blatt führt', () => {
    const { container, dispatch } = mitAufgabe({ status: 'offen' })
    fireEvent.click(text(container, t.bestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
    fireEvent.click(text(container, t.kannNicht)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openAbsage', id: task().id })
  })

  it('bestätigt: der Zustand steht da, und man kann noch absagen', () => {
    const { container, dispatch } = mitAufgabe({ status: 'bestätigt' })
    expect(container.querySelector('.aufgabe-stand')?.textContent).toBe(t.bestaetigt)
    expect(text(container, t.bestaetigen)).toBeUndefined()
    fireEvent.click(text(container, t.kannNicht)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openAbsage', id: task().id })
  })

  it('verhindert: die Absage lässt sich zurücknehmen — es ist keine Einbahnstraße', () => {
    const { container, dispatch } = mitAufgabe({ status: 'verhindert' })
    expect(container.querySelector('.aufgabe-stand.is-problem')?.textContent).toBe(t.verhindertChip)
    expect(text(container, t.kannNicht)).toBeUndefined()
    fireEvent.click(text(container, t.dochBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    // Escape fehlte hier einmal — ausgerechnet in einer der beiden Dateien,
    // wegen derer `useEscape` überhaupt herausgelöst wurde.
    const { container, dispatch } = mitAufgabe()
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeMyTask')).toHaveLength(3)
  })

  it('zeigt gar nichts, wenn die Aufgabe inzwischen weg ist — statt abzustürzen', () => {
    const { container } = zeige('myTask', { myTasks: [], myTaskId: 'gibt-es-nicht' })
    expect(container.querySelector('.sheet')).toBeNull()
  })
})

/**
 * **Absagen** (T121): „Du kannst nicht?" — mit dem Weg, der danach kommt, einer
 * Nachricht an den Planer und dem Tag als abwesend (freiwillig, aus).
 */
describe('Das Absage-Blatt', () => {
  const HILFSDIENST = '2026-09-07|mid|helper|mik|0'
  /** Dienstag, 8. September — der Tag der Testaufgabe als UTC-Mitternacht. */
  const DIENSTAG = Date.UTC(2026, 8, 8)
  const absagen = (over: Partial<MyTask> = {}, zustand: Partial<AppState> = {}) => {
    const eigene = task({ at: DIENSTAG, ...over })
    return zeige('absage', { myTasks: [eigene], absageId: eigene.id, personId: 'p-a', ...zustand })
  }
  const schritte = (c: HTMLElement) => [...c.querySelectorAll('.spur-name')].map((s) => s.textContent)
  const schalter = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[role="switch"]')

  it('fragt und nennt die Aufgabe, um die es geht', () => {
    const { container } = absagen()
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.absageFrage)
    expect(container.querySelector('.sheet-marke')?.textContent).toContain('Bibellesung · Leser')
  })

  it('beim Programmpunkt: Der Planer erfährt es und teilt neu zu', () => {
    const { container } = absagen()
    expect(schritte(container)).toEqual([t.spurDuSagstAb, t.spurPlanerErfaehrt, t.spurNeuZugeteilt])
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(t.spurDuSagstAb)
    expect(container.querySelector('.absage-erklaerung')?.textContent).toBe(t.absageErklaerung)
  })

  it('beim Hilfsdienst: Es wird von selbst ein Ersatz gesucht — gesagt VOR dem Absagen', () => {
    const { container } = absagen({ id: HILFSDIENST })
    expect(schritte(container)).toEqual([t.spurDuSagstAb, t.spurErsatzGesucht, t.spurUebernommen])
    expect(container.querySelector('.absage-erklaerung')?.textContent).toBe(t.ersatzHint)
  })

  it('„Absagen" sagt ab und gibt die Nachricht mit', () => {
    const { container, dispatch } = absagen()
    fireEvent.change(container.querySelector('input.feld')!, { target: { value: 'bin verreist' } })
    fireEvent.click(text(container, t.absagen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'declineTask', id: task().id, nachricht: 'bin verreist' })
  })

  /*
   * T123 (16.10.2026): In acht von elf Sprachen hießen „Absagen" und
   * „Abbrechen" gleich — „Cancel", „Annulla", „إلغاء", „لغو" … Untereinander
   * standen zwei gleiche Knöpfe, der eine sagt ab, der andere schließt nur.
   */
  it.each(APP_LANGS.map((l) => l.code))('%s: kein Knopf des Blatts heißt wie ein anderer — Absagen ist nicht Abbrechen', async (lang) => {
    await loadOverlay('en')
    await loadOverlay(lang)
    const { container } = absagen({ status: 'offen' }, { lang })
    const beschriftungen = [...container.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((s) => s.trim() !== '')
    // Gegenprobe: Das Blatt spricht wirklich die Sprache, nicht Deutsch.
    expect(beschriftungen).toContain(dict(lang).absagen)
    expect(new Set(beschriftungen).size, beschriftungen.join(' | ')).toBe(beschriftungen.length)
  })

  it('der Tag als abwesend: der Schalter steht aus, und ohne ihn wird nichts eingetragen', () => {
    const { container, dispatch } = absagen()
    expect(schalter(container)?.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(text(container, t.absagen)!)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addAbsence')).toBe(false)
  })

  it('mit Schalter: genau dieser Tag, für die eigene Person — die Nachricht nicht als Grund', () => {
    // Eine Abwesenheit kann jedes Mitglied lesen, die Nachricht gilt dem Planer.
    const { container, dispatch } = absagen()
    fireEvent.change(container.querySelector('input.feld')!, { target: { value: 'krank' } })
    fireEvent.click(schalter(container)!)
    fireEvent.click(text(container, t.absagen)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addAbsence',
      absence: expect.objectContaining({ personId: 'p-a', from: '2026-09-08', to: '2026-09-08', reason: '' }),
    })
    // Erst die Abwesenheit, dann die Absage — beides geht hinaus.
    const typen = dispatch.mock.calls.map((c) => c[0].type)
    expect(typen.indexOf('addAbsence')).toBeLessThan(typen.indexOf('declineTask'))
  })

  it('kein Schalter, wo es nichts einzutragen gibt: Tag schon abwesend, keine eigene Person, kein Termin', () => {
    const abwesend = { id: 'a', personId: 'p-a', userId: null, from: '2026-09-07', to: '2026-09-09', reason: '' }
    expect(schalter(absagen({}, { absences: [abwesend] }).container)).toBeNull()
    cleanup()
    expect(schalter(absagen({}, { personId: null }).container)).toBeNull()
    cleanup()
    expect(schalter(absagen({ at: null }).container)).toBeNull()
  })

  it('„Doch bestätigen" sagt stattdessen zu — nur, solange die Aufgabe offen ist', () => {
    const { container, dispatch } = absagen()
    fireEvent.click(text(container, t.dochBestaetigen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmTask', id: task().id })
    cleanup()
    expect(text(absagen({ status: 'bestätigt' }).container, t.dochBestaetigen)).toBeUndefined()
  })

  it('„Abbrechen", ✕, Hintergrund und Escape legen das Blatt weg, ohne abzusagen', () => {
    const { container, dispatch } = absagen()
    fireEvent.click(text(container, t.abbrechen)!)
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeAbsage')).toHaveLength(4)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'declineTask')).toBe(false)
  })

  describe('beantwortet ist gelesen — die Mitteilung zur Aufgabe bleibt nicht „Neu" (16.10.2026)', () => {
    // „Ich kann nicht" in der Glocke öffnet nur dieses Blatt. Bis dahin blieb
    // die Mitteilung danach „Neu", ohne dass es darunter noch etwas zu tun gab.
    const notifs = (): Notification[] => [
      { id: 'n1', type: 'zuteilung', title: 'Neue Zuteilung', text: '', at: '2026-09-01T10:00:00Z', read: false, taskId: task().id },
      { id: 'n2', type: 'zuteilung', title: 'Neue Zuteilung', text: '', at: '2026-09-01T10:00:00Z', read: false, taskId: 'andere-aufgabe' },
    ]
    const gelesen = (dispatch: ReturnType<typeof vi.fn>) =>
      dispatch.mock.calls.map((c) => c[0]).filter((a) => a.type === 'mitteilungGelesen')

    it('nach „Absagen" — nur die Mitteilung dieser Aufgabe', () => {
      const { container, dispatch } = absagen({}, { notifs: notifs() })
      fireEvent.click(text(container, t.absagen)!)
      expect(gelesen(dispatch)).toEqual([{ type: 'mitteilungGelesen', id: 'n1' }])
    })

    it('nach „Doch bestätigen" ebenso', () => {
      const { container, dispatch } = absagen({}, { notifs: notifs() })
      fireEvent.click(text(container, t.dochBestaetigen)!)
      expect(gelesen(dispatch)).toEqual([{ type: 'mitteilungGelesen', id: 'n1' }])
    })

    it('nicht nach „Abbrechen" — und offline gar nicht', () => {
      const weg = absagen({}, { notifs: notifs() })
      fireEvent.click(text(weg.container, t.abbrechen)!)
      expect(gelesen(weg.dispatch)).toEqual([])
      cleanup()
      const offline = absagen({}, { notifs: notifs(), staleAt: Date.now() })
      fireEvent.click(text(offline.container, t.absagen)!)
      expect(gelesen(offline.dispatch)).toEqual([])
    })
  })
})

describe('Das S-89-Formular', () => {
  const PAYLOAD: S89Payload = {
    name: 'Anton Alt',
    partner: 'Bernd Brand',
    date: 'Di, 8. September · 19:00',
    type: 'Gespräche beginnen · Informell',
    point: 'lmd Lektion 1',
  }

  it('nennt sich beim Namen — das Formular heißt S-89', () => {
    const { container } = zeige('s89', {}, PAYLOAD)
    expect(container.querySelector('.s89-eyebrow')?.textContent).toBe('S-89')
    expect(container.querySelector('.sheet-title')?.textContent).toBe(t.s89Title)
  })

  it('ist ein modaler Dialog über dem Blatt darunter und trägt die Karte mit den Daten', () => {
    const { container } = zeige('s89', {}, PAYLOAD)
    const dlg = container.querySelector('.sheet--oben')!
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.textContent).toContain('Anton Alt')
  })

  it('✕, Hintergrund und Escape schließen alle drei', () => {
    const { container, dispatch } = zeige('s89', {}, PAYLOAD)
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop--oben')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeS89')).toHaveLength(3)
  })

  /*
   * „Durchzuführen im" wie auf dem Formular (Entwurf GDruckS89): beide Räume,
   * der richtige angekreuzt. Vorgelesen wird nur der angekreuzte — sonst hörte
   * man „Hauptsaal Zusätzliche Klasse" und wüsste nicht, welcher gilt.
   */
  it('nennt beide Räume, kreuzt den richtigen an und liest nur ihn vor', () => {
    const ort = (c: HTMLElement) => c.querySelector('.s89-row--ort')!
    const { container } = zeige('s89', {}, PAYLOAD)
    expect(ort(container).querySelector('.s89-ort.is-an')?.textContent).toBe(t.auxHauptsaal)
    expect(ort(container).querySelector('.s89-ort:not(.is-an)')?.getAttribute('aria-hidden')).toBe('true')
    cleanup()
    const { container: klasse } = zeige('s89', {}, { ...PAYLOAD, aux: true })
    expect(ort(klasse).querySelector('.s89-ort.is-an')?.textContent).toBe(t.auxKlasse)
  })

  it('am Handy kein Druckknopf — ab dem Tablet druckt er genau diesen Zettel', () => {
    const { container } = zeige('s89', {}, PAYLOAD)
    expect(container.querySelector('.s89-drucken')).toBeNull()
    cleanup()
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    let imDruck = { zettel: [] as string[], kennzeichen: undefined as string | undefined }
    window.print = vi.fn(() => {
      imDruck = {
        zettel: [...document.querySelectorAll('.druck-bogen .s89-zettel .s89-value')].map((v) => v.textContent ?? '').slice(0, 1),
        kennzeichen: document.documentElement.dataset.print,
      }
    })
    const { container: breit } = zeige('s89', {}, PAYLOAD)
    fireEvent.click(breit.querySelector('.s89-drucken')!)
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(imDruck).toEqual({ zettel: ['Anton Alt'], kennzeichen: 'bogen' })
    expect(document.querySelectorAll('.druck-bogen .s89-zettel-titel')).toHaveLength(1)
    delete document.documentElement.dataset.print
  })
})
