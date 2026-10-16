/** @vitest-environment jsdom */
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
import { syncAuxSlots } from '../data/aux-class'
import { emptyQualifications } from '../data/helpers'
import { LOAD_WEEKS } from '../data/auslastung'
import { ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from '../data/helpers'
import { bibelbuecherLaden, makeTr } from '../i18n/translate'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type {
  Absence,
  FsInstance,
  Group,
  PartItem,
  Person,
  Qualifications,
  Service,
  SlotSelection,
  Week,
} from '../data/types'
import { AssignSheet } from './AssignSheet'
import { punktKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { privSetzen } from '../data/helpers'

/**
 * **Das Zuteilungs-Sheet — der Ort, an dem der Planer wirklich arbeitet.**
 *
 * Die Auswahlregeln stecken in `kandidaten.ts` und sind dort geprüft, die
 * Rangfolge in `rangfolge.test.ts`. Was hier geprüft wird, ist das Verhalten
 * des Blattes selbst, und das trägt eigene fachliche Entscheidungen:
 *
 * - Der **Redner-Platz** ist zweierlei zugleich (T29). Es gibt keinen
 *   Umschalter: der Freitext macht ihn auswärtig, ein Tipp auf eine Person
 *   macht ihn zum eigenen Redner. Beide Wege müssen in den jeweils anderen
 *   Zustand zurückführen, sonst ist ein Platz einmal gesetzt für immer falsch.
 * - **Abwesende** stehen in der Liste, sind aber nicht wählbar. Sie zu
 *   entfernen wäre falsch (der Planer will sehen, wen es gäbe), sie wählbar zu
 *   lassen auch.
 * - Ein **Gruppen-Slot ohne Gruppen** blieb wortlos leer, während die
 *   Auto-Zuteilung „Gruppe 1…3" eintrug.
 * - Jede Zeile sagt, **was für oder gegen die Person spricht** (T121,
 *   `GZuteilen`): abwesend mit Zeitraum, an diesem Tag schon dran, sonst wann
 *   zuletzt im Bereich und was am anderen Tag ansteht.
 */

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) privSetzen(q, k, true)
  return q
}

const person = (id: string, fn: string, ln: string, ...q: string[]): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: priv(...q), grp: null,
})

// Ältester und Dienstamtgehilfe: Den öffentlichen Vortrag kann jeder von ihnen
// halten (4.10.2026, `kandidaten.ts`). Carlo hat denselben Bereich, ist aber
// Verkündiger — er steht deshalb nicht in der Redner-Liste.
const ANTON: Person = { ...person('p-a', 'Anton', 'Alt', 'vorsitzWe', 'schulung', 'svc:mik'), role: 'aeltester' }
const BERND: Person = { ...person('p-b', 'Bernd', 'Brand', 'vorsitzWe', 'schulung', 'svc:mik'), role: 'dienstamtgehilfe' }
const CARLO = person('p-c', 'Carlo', 'Cohn', 'vorsitzWe')
const PERSONEN = [ANTON, BERND, CARLO]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** Eine Woche mit Redner-Platz (Wochenende) und einem Schülerteil (Mitte). */
function woche(start: string, rednerName = '', rednerRolle = ROLE_GUEST_SPEAKER, herkunft?: string): Week {
  const schueler: PartItem = { iid: 'i73',
    num: 4, title: 'Gespräche beginnen', meta: '3 Min.', mins: 3,
    names: [{ name: '', rolle: '', bereichsKey: 'schulung' }],
  }
  return {
    range: '1.–7. September', book: '', start,
    mid: {
      date: '', end: '',
      sections: [{ label: 'UNS IM DIENST VERBESSERN', farbe: 'gold', items: [schueler] }],
      helpers: { mik: [], rein: [] },
    },
    we: {
      date: '', end: '',
      sections: [{
        label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol',
        items: [{ iid: 'i72',
          num: 1, title: 'Öffentlicher Vortrag', meta: '',
          names: [{ name: rednerName, rolle: rednerRolle, bereichsKey: 'vorsitzWe', ...(herkunft ? { herkunft } : {}) }],
        }],
      }],
      helpers: { mik: [], rein: [] },
    },
  }
}

/** Der Schülerteil der Woche (Hauptsaal, erster Platz). */
const schuelerPlatz = (w: Week) => (w.mid.sections[0]!.items[0] as PartItem).names[0]!

const SEL_REDNER = (guest = true): SlotSelection => ({
  kind: 'part', wi: 0, tab: 'we', si: 0, ii: 0, ni: 0,
  label: 'Öffentlicher Vortrag', labelRolle: 'Redner', priv: 'vorsitzWe', groups: false, guest,
})

const SEL_SCHUELER: SlotSelection = {
  kind: 'part', wi: 0, tab: 'mid', si: 0, ii: 0, ni: 0,
  label: 'Gespräche beginnen', labelRolle: '', priv: 'schulung', groups: false,
}

const SEL_HELFER: SlotSelection = {
  kind: 'helper', wi: 0, tab: 'mid', svc: 'mik', pos: 0,
  label: 'Mikrofone', priv: 'svc:mik', groups: false,
}

const SEL_GRUPPE: SlotSelection = {
  kind: 'helper', wi: 0, tab: 'mid', svc: 'rein', pos: 0,
  label: 'Reinigung', priv: 'svc:rein', groups: true,
}

function zeige(sel: SlotSelection, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN,
    services: DIENSTE,
    groups: [],
    weeks: [woche('2026-09-07')],
    week: 0,
    fsWeeks: [[]],
    absences: [],
    confirmations: {},
    congregation: { name: 'Test', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AssignSheet sel={sel} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.zuteilen-zeile')]
/** Der Name einer Zeile, ohne den Zusatz „· Vorschlag". */
const nameVon = (r: Element) => r.querySelector('.zuteilen-name')?.childNodes[0]?.textContent ?? ''
const namen = (c: HTMLElement) => zeilen(c).map(nameVon)
const zeile = (c: HTMLElement, name: string) => zeilen(c).find((r) => nameVon(r) === name)!
const info = (r: Element) => r.querySelector('.zuteilen-info')!
const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!

beforeEach(() => {
  // Das Sheet lässt sich wegwischen; die Geste fragt zuerst nach dem Schreibtisch.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Kopf und Schließen', () => {
  it('nennt den Abschnitt, den Punkt mit Nummer, den Tag und die Dauer', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(container.querySelector('.zuteilen-abschnitt')?.textContent).toBe('UNS IM DIENST VERBESSERN')
    expect(container.querySelector('.zuteilen-abschnitt')?.getAttribute('data-farbe')).toBe('gold')
    expect(container.querySelector('.sheet-title')?.textContent).toBe('4 Gespräche beginnen')
    // Die Woche beginnt Montag, 7.9.; die Zusammenkunft ist am Dienstag.
    expect(container.querySelector('.sheet-sub')?.textContent).toBe('Dienstag, 8. September · 3 Min.')
  })

  it('ist ein modaler Dialog — mit Punkt und Rolle als Beschriftung', () => {
    const { container } = zeige(SEL_REDNER())
    const dlg = container.querySelector('.sheet')!
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-label')).toBe('Öffentlicher Vortrag · Redner')
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER)
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeSlot')).toHaveLength(3)
  })
})

describe('Die Kandidatenliste', () => {
  it('zeigt nur, wer den Bereich hat — und sagt, wie viele das sind', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(namen(container).sort()).toEqual(['Anton Alt', 'Bernd Brand'])
    const zaehler = container.querySelector('.zuteilen-zaehler')?.textContent
    expect(zaehler).toContain(fill(t.mitBereichN, { n: 2 }))
    expect(zaehler).toContain(fill(t.aufgabenInWochen, { w: LOAD_WEEKS }))
  })

  it('oben steht der Vorschlag — der eine, den „Automatisch" nähme', () => {
    const { container } = zeige(SEL_SCHUELER)
    const markiert = zeilen(container).filter((r) => r.querySelector('.zuteilen-vorschlag'))
    expect(markiert).toEqual([zeilen(container)[0]])
    expect(markiert[0]!.querySelector('.zuteilen-vorschlag')?.textContent).toBe(` · ${t.vorschlag}`)
  })

  it('ein Tipp teilt zu — mit Person-Id, nicht nur mit dem Namen', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER)
    fireEvent.click(zeile(container, 'Bernd Brand'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Bernd Brand', pid: 'p-b' })
  })

  it('die Punkte zählen die Aufgaben im Fenster — für Vorleseprogramme mit Zahl', () => {
    // Anton hatte in der Woche davor die Mikrofone.
    const vorher = woche('2026-08-31')
    vorher.mid.helpers.mik = [{ name: 'Anton Alt', pid: 'p-a' }]
    const { container } = zeige({ ...SEL_SCHUELER, wi: 1 } as SlotSelection, { weeks: [vorher, woche('2026-09-07')], week: 1 })
    const punkte = zeile(container, 'Anton Alt').querySelector('.zuteilen-last')!
    expect(punkte.getAttribute('role')).toBe('img')
    expect(punkte.getAttribute('aria-label')).toBe(fill(t.aufgabenInW, { n: 1, w: LOAD_WEEKS }))
    expect(punkte.querySelectorAll('.zuteilen-last-punkt')).toHaveLength(LOAD_WEEKS)
    expect(punkte.querySelectorAll('.zuteilen-last-punkt.is-voll')).toHaveLength(1)
    // Bernd hat nichts — und steht deshalb als Vorschlag vorn.
    expect(namen(container)[0]).toBe('Bernd Brand')
  })

  it('jede Zeile sagt, wann die Person zuletzt in diesem Bereich dran war', () => {
    const vorher = woche('2026-08-24')
    schuelerPlatz(vorher).name = 'Anton Alt'
    schuelerPlatz(vorher).pid = 'p-a'
    const { container } = zeige({ ...SEL_SCHUELER, wi: 1 } as SlotSelection, { weeks: [vorher, woche('2026-09-07')], week: 1 })
    expect(info(zeile(container, 'Anton Alt')).textContent).toBe(fill(t.zuletztWann, { wann: 'vor 2 Wochen' }))
    expect(info(zeile(container, 'Bernd Brand')).textContent).toBe(t.zuletztLange)
  })

  it('und was am anderen Tag der Woche schon ansteht', () => {
    const w = woche('2026-09-07')
    w.we.helpers.mik = [{ name: 'Bernd Brand', pid: 'p-b' }]
    const { container } = zeige(SEL_SCHUELER, { weeks: [w] })
    // Der Wochentag aus Intl — allein steht er im Deutschen ohne Punkt.
    expect(info(zeile(container, 'Bernd Brand')).textContent).toBe(`${t.zuletztLange} · So Mikrofone`)
  })

  it('die Suche findet Namen auch ohne Umlaute und in beliebiger Reihenfolge', () => {
    const JOERG = person('p-j', 'Jörg', 'Müller', 'schulung')
    // Im Blatt bekommt die Suche den Fokus nie, auch nicht für einen Augenblick:
    // Am Handy klappte schon der die Tastatur über die Liste. Danach setzt
    // `useDialogFocus` ihn ohnehin auf das erste Bedienelement — am Ende sähe
    // man den Unterschied nicht, deshalb wird jeder Aufruf mitgeschrieben.
    const fokus = vi.spyOn(HTMLElement.prototype, 'focus')
    const { container } = zeige(SEL_SCHUELER, { persons: [...PERSONEN, JOERG] })
    const suche = container.querySelector<HTMLInputElement>('.zuteilen-suche input')!
    expect(fokus.mock.contexts).not.toContain(suche)
    fokus.mockRestore()
    expect(suche.type).toBe('search')
    expect(container.querySelector('.zuteilen-suche label')?.textContent).toBe(t.werUebernimmt)
    fireEvent.change(suche, { target: { value: 'muller' } })
    expect(namen(container)).toEqual(['Jörg Müller'])
    fireEvent.change(suche, { target: { value: 'brand b' } })
    expect(namen(container)).toEqual(['Bernd Brand'])
    // Die Zahl darüber bleibt die des Bereichs, nicht die der Treffer.
    expect(container.querySelector('.zuteilen-zaehler')?.textContent).toContain(fill(t.mitBereichN, { n: 3 }))
  })
})

describe('Abwesende sieht man, wählen kann man sie nicht', () => {
  const ABWESEND: Absence[] = [
    { id: 'a1', personId: 'p-a', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
  ]

  it('stehen am Ende der Liste, statt zu verschwinden — mit ihrem Zeitraum', () => {
    const { container } = zeige(SEL_SCHUELER, { absences: ABWESEND })
    expect(namen(container)).toEqual(['Bernd Brand', 'Anton Alt'])
    const letzte = zeilen(container).at(-1)!
    expect(letzte.className).toContain('is-abwesend')
    expect(info(letzte).className).toContain('is-problem')
    expect(info(letzte).textContent).toBe(fill(t.abwesendZeitraum, { zeitraum: '1.–30. September' }))
  })

  it('ein Tipp darauf teilt NICHT zu, sondern erklärt warum', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER, { absences: ABWESEND })
    fireEvent.click(zeilen(container).at(-1)!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'showToast',
      text: 'Anton Alt ist in dieser Woche abwesend',
    })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'assign')).toBe(false)
  })
})

describe('Wer an diesem Tag schon dran ist, wird genannt — nicht gesperrt', () => {
  const belegt = () => {
    const w = woche('2026-09-07')
    w.mid.helpers.mik = [{ name: 'Anton Alt', pid: 'p-a' }]
    return w
  }

  it('nennt die andere Zuteilung desselben Tages', () => {
    const { container } = zeige(SEL_SCHUELER, { weeks: [belegt()] })
    const anton = info(zeile(container, 'Anton Alt'))
    expect(anton.className).toContain('is-doppelt')
    expect(anton.textContent).toBe(`${t.sheetSchonHeute}: Mikrofone`)
  })

  it('aber der Planer darf trotzdem — es ist ein Hinweis, keine Sperre', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER, { weeks: [belegt()] })
    fireEvent.click(zeile(container, 'Anton Alt'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Anton Alt', pid: 'p-a' })
  })
})

describe('Der Redner-Platz ist Gastredner und eigener Redner zugleich (T29)', () => {
  const felder = (c: HTMLElement) => c.querySelectorAll<HTMLInputElement>('.sheet-guest .feld')

  it('am leeren Platz stehen beide Wege: Freitext und Personenliste', () => {
    const { container } = zeige(SEL_REDNER())
    expect(container.querySelector('.sheet-guest')).toBeTruthy()
    // Die Liste ist der andere Weg — und sagt das, statt zu fragen, wer übernimmt.
    expect(container.querySelector('.zuteilen-suche label')?.textContent).toBe(t.oderPersonWaehlen)
    expect(namen(container).length).toBeGreaterThan(0)
  })

  it('zur Wahl stehen die Ältesten und Dienstamtgehilfen — nach Stellung, nicht nach Bereich', () => {
    // Carlo hat den Bereich des Platzes, ist aber Verkündiger; Dieter hat ihn
    // nicht, ist aber Ältester. Entschieden wird am Redner-Platz über die
    // Stellung (Betreiber, 4.10.2026).
    const DIETER: Person = { ...person('p-d', 'Dieter', 'Dietz'), role: 'aeltester' }
    const { container } = zeige(SEL_REDNER(), { persons: [...PERSONEN, DIETER] })
    expect(namen(container)).toEqual(['Anton Alt', 'Bernd Brand', 'Dieter Dietz'])
    // „Mit diesem Aufgabenbereich" stimmte hier nicht — die Zahl fehlt.
    expect(container.querySelector('.zuteilen-zaehler')?.textContent).not.toContain(fill(t.mitBereichN, { n: 3 }))
  })

  it('der Freitext macht ihn auswärtig — Name und Herkunftsversammlung', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    fireEvent.change(felder(container)[0]!, { target: { value: '  Gustav Gast  ' } })
    fireEvent.change(felder(container)[1]!, { target: { value: 'Nordheim' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    // Die Herkunft steht in ihrem eigenen Feld, nicht als zweites Atom in der
    // Rolle: ein Versammlungsname trägt keine Regel, er wird nur angezeigt.
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Gustav Gast', rolle: ROLE_GUEST_SPEAKER, herkunft: 'Nordheim',
    })
  })

  it('ohne Herkunft bleibt es bei der bloßen Rolle — kein Trenner ins Leere', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    fireEvent.change(felder(container)[0]!, { target: { value: 'Gustav Gast' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Gustav Gast', rolle: ROLE_GUEST_SPEAKER, herkunft: '',
    })
  })

  it('ein leerer Name teilt nicht zu, sondern bittet um einen', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    fireEvent.change(felder(container)[0]!, { target: { value: '   ' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameEingeben })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'assign')).toBe(false)
  })

  it('eine Person aus der Liste macht ihn zum EIGENEN Redner — mit Rolle und Id', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    fireEvent.click(zeile(container, 'Anton Alt'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Anton Alt', rolle: ROLE_OWN_SPEAKER, pid: 'p-a',
    })
  })

  it('steht schon ein eigener Redner, bleiben die Freitext-Felder leer', () => {
    // Vorbelegt wären sie ein Angebot, die Person als Gast zu verdoppeln.
    const { container } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Anton Alt', ROLE_OWN_SPEAKER)],
    })
    expect(felder(container)[0]!.value).toBe('')
    expect(felder(container)[1]!.value).toBe('')
  })

  it('steht ein Gastredner, sind sie vorbelegt — man will ihn korrigieren, nicht neu tippen', () => {
    const { container } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Gustav Gast', ROLE_GUEST_SPEAKER, 'Nordheim')],
    })
    expect(felder(container)[0]!.value).toBe('Gustav Gast')
    expect(felder(container)[1]!.value).toBe('Nordheim')
  })

  it('der Weg zurück: Freitext über einem eigenen Redner macht ihn wieder auswärtig', () => {
    const { container, dispatch } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Anton Alt', ROLE_OWN_SPEAKER)],
    })
    fireEvent.change(felder(container)[0]!, { target: { value: 'Gustav Gast' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Gustav Gast', rolle: ROLE_GUEST_SPEAKER, herkunft: '',
    })
  })

  it('„Entfernen" gibt den Platz als auswärtigen zurück — so kommt er aus dem Import', () => {
    // Bliebe er „Redner", holte ihn die Auto-Zuteilung; den Redner vereinbart man.
    const { container, dispatch } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Anton Alt', ROLE_OWN_SPEAKER)],
    })
    fireEvent.click(knopf(container, t.entfernen))
    fireEvent.click(knopf(container, t.entfernenSicher))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: '', rolle: ROLE_GUEST_SPEAKER })
  })

  it('an einem gewöhnlichen Platz entfernt „Entfernen" ohne Rollenwechsel', () => {
    const w = woche('2026-09-07')
    schuelerPlatz(w).name = 'Anton Alt'
    const { container, dispatch } = zeige(SEL_SCHUELER, { weeks: [w] })
    fireEvent.click(knopf(container, t.entfernen))
    fireEvent.click(knopf(container, t.entfernenSicher))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: '' })
  })

  it('„Entfernen" fragt erst nach — wer zugesagt hatte, bekäme sofort eine Nachricht', () => {
    const w = woche('2026-09-07')
    schuelerPlatz(w).name = 'Anton Alt'
    const { container, dispatch } = zeige(SEL_SCHUELER, { weeks: [w] })
    fireEvent.click(knopf(container, t.entfernen))
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'assign' }))
    // Ein Tipp daneben bricht ab.
    fireEvent.blur(knopf(container, t.entfernenSicher))
    expect(knopf(container, t.entfernenSicher)).toBeUndefined()
    expect(knopf(container, t.entfernen)).toBeDefined()
  })
})

describe('Wer den Platz gerade hat, steht oben — mit derselben Lage wie im Plan', () => {
  const belegt = () => {
    const w = woche('2026-09-07')
    schuelerPlatz(w).name = 'Anton Alt'
    schuelerPlatz(w).pid = 'p-a'
    return w
  }
  const karte = (c: HTMLElement) => c.querySelector('.zuteilen-aktuell')!

  it('mit Namen, der Stufe der Zusage und der Möglichkeit, ihn zu entfernen', () => {
    const { container } = zeige(SEL_SCHUELER, { weeks: [belegt()] })
    expect(karte(container).textContent).toContain(t.aktuellLbl)
    expect(karte(container).querySelector('.zuteilen-name')?.textContent).toBe('Anton Alt')
    // Noch niemand hat bestätigt: blass, „wartet auf Bestätigung".
    expect(karte(container).querySelector('.punkt')?.className).toContain('is-wartet')
    expect(info(karte(container)).textContent).toBe(t.zusageWartet)
    expect(knopf(container, t.entfernen)).toBeTruthy()
  })

  it('mit der Zusage aus der Woche seines Platzes — nicht aus der gezeigten (16.10.2026)', () => {
    // Am Desktop bleibt das Blatt beim Blättern offen. Bis dahin las die Karte
    // die Zusage der gezeigten Woche: „wartet" für einen bestätigten Platz.
    const zweite = { ...belegt(), start: '2026-09-14' }
    const { container } = zeige({ ...SEL_SCHUELER, wi: 1 }, {
      weeks: [woche('2026-09-07'), zweite],
      week: 0,
      fsWeeks: [[], []],
      confirmations: { [punktKey('2026-09-14', 'mid', 'i73', 0)]: 'bestätigt' },
    })
    expect(info(karte(container)).textContent).toBe(t.zusageBestaetigt)
  })

  it('ist die Person abwesend, steht der Platz rot da — mit dem Zeitraum', () => {
    const { container } = zeige(SEL_SCHUELER, {
      weeks: [belegt()],
      absences: [{ id: 'a1', personId: 'p-a', userId: null, from: '2026-09-07', to: '2026-09-11', reason: '' }],
    })
    expect(karte(container).querySelector('.punkt')?.className).toContain('is-problem')
    expect(info(karte(container)).className).toContain('is-problem')
    expect(info(karte(container)).textContent).toBe(fill(t.abwesendZeitraum, { zeitraum: '7.–11. September' }))
  })

  it('an einem leeren Platz steht die Karte gar nicht', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(container.querySelector('.zuteilen-aktuell')).toBeNull()
  })

  /*
   * Der Name geht nicht durch den Übersetzer (15.10.2026): Der erkennt
   * Bibelstellen und zeigte auf Englisch „Mark 2 Weber" für den Zusatz gegen
   * Namensgleichheit. Nur eine Gruppe (Reinigung) steht übersetzt da.
   */
  it('in fremder Oberfläche steht die Person da, wie sie heißt — die Gruppe übersetzt', async () => {
    // Die Buchtabellen kommen nachgeladen; ohne sie griffe die Buch-Regel gar
    // nicht, und der Test prüfte nichts — deshalb erst die Gegenprobe.
    await bibelbuecherLaden()
    expect(makeTr('en')('Markus 2 Weber')).toBe('Mark 2 Weber')
    const w = woche('2026-09-07')
    schuelerPlatz(w).name = 'Markus 2 Weber'
    w.mid.helpers.rein = [{ name: 'Gruppe 1' }]
    const person = zeige(SEL_SCHUELER, { weeks: [w], lang: 'en' })
    expect(karte(person.container).querySelector('.zuteilen-name')?.textContent).toBe('Markus 2 Weber')
    cleanup()
    const gruppe = zeige(SEL_GRUPPE, { weeks: [w], lang: 'en' })
    expect(makeTr('en')('Gruppe 1')).not.toBe('Gruppe 1')
    expect(karte(gruppe.container).querySelector('.zuteilen-name')?.textContent).toBe(makeTr('en')('Gruppe 1'))
  })

  it('bei einer Schulungsaufgabe führt von hier das S-89-Formular weg', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER, { weeks: [belegt()] })
    const s89 = knopf(container, t.s89Open)
    expect(s89).toBeTruthy()
    fireEvent.click(s89)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'openS89')).toBe(true)
  })

  it('an einem Hilfsdienst gibt es kein S-89 — dafür gibt es kein Formular', () => {
    const w = woche('2026-09-07')
    w.mid.helpers.mik = [{ name: 'Anton Alt', pid: 'p-a' }]
    const { container } = zeige(SEL_HELFER, { weeks: [w] })
    expect(container.querySelector('.zuteilen-aktuell')).toBeTruthy()
    expect(container.querySelector('.zuteilen-s89')).toBeNull()
  })
})

describe('Ein Gruppen-Slot ohne angelegte Gruppen bleibt nicht wortlos', () => {
  it('benennt, was fehlt, und führt in die Einstellungen', () => {
    const { container, dispatch } = zeige(SEL_GRUPPE, { groups: [] })
    const hinweis = container.querySelector('.sheet-empty')!
    expect(hinweis.textContent).toContain(t.gruppenCard)
    fireEvent.click(container.querySelector('.sheet-empty-action')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'closeSlot' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'einstellungen' })
  })

  it('mit Gruppen stehen die Gruppen zur Wahl — ohne Person-Id, ohne Suche und Punkte', () => {
    const gruppen: Group[] = [
      { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
      { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
    ]
    const { container, dispatch } = zeige(SEL_GRUPPE, { groups: gruppen })
    expect(container.querySelector('.sheet-empty')).toBeNull()
    expect(zeilen(container)).toHaveLength(2)
    expect(container.querySelector('.zuteilen-suche')).toBeNull()
    expect(container.querySelector('.zuteilen-last')).toBeNull()
    fireEvent.click(zeilen(container)[0]!)
    // Eine Gruppe ist keine Person — eine pid gäbe es nicht, und sie stünde falsch.
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Gruppe 1', pid: undefined })
  })

  it('bei einem gewöhnlichen Dienst kommt der Hinweis nicht — dort ist Leere etwas anderes', () => {
    const { container } = zeige(SEL_HELFER, { persons: [CARLO] })
    expect(zeilen(container)).toHaveLength(0)
    expect(container.querySelector('.sheet-empty')).toBeNull()
  })
})

describe('Der Treffpunkt-Leiter kennt denselben Doppelweg', () => {
  const FS_WOCHE = [[{ id: 'f1', ruleId: 'r1', wd: 6, time: '09:30', place: 'Saal', leader: '', grp: null }]]
  const SEL_FS: SlotSelection = { kind: 'fs', wi: 0, instId: 'f1', label: 'Treffpunkt', priv: 'treffpunkt' } as SlotSelection

  const mitTreffpunkt = (over: Partial<AppState> = {}) =>
    zeige(SEL_FS, {
      fsWeeks: FS_WOCHE as unknown as AppState['fsWeeks'],
      persons: [person('p-t', 'Theo', 'Treff', 'treffpunkt')],
      ...over,
    })
  const feld = (c: HTMLElement) => c.querySelector('.sheet-guest .feld')!

  it('nennt im Kopf Zeit und Ort statt der Zusammenkunft', () => {
    const { container } = mitTreffpunkt()
    expect(container.querySelector('.sheet-sub')?.textContent).toBe('09:30 · Saal')
  })

  it('ein Freitext-Name wird als auswärtig eingetragen', () => {
    const { container, dispatch } = mitTreffpunkt()
    fireEvent.change(feld(container), { target: { value: '  Kreisaufseher  ' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Kreisaufseher', extern: true })
  })

  it('ein leerer Freitext bittet auch hier um einen Namen', () => {
    const { container, dispatch } = mitTreffpunkt()
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameEingeben })
  })

  it('eine Person aus der Liste wird ganz normal zugeteilt — nicht als Freitext', () => {
    const { container, dispatch } = mitTreffpunkt()
    fireEvent.click(zeilen(container)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Theo Treff', pid: 'p-t' })
  })

  it('nur ein Feld — eine Herkunftsversammlung hat ein Treffpunkt-Leiter nicht', () => {
    const { container } = mitTreffpunkt()
    expect(container.querySelectorAll('.sheet-guest .feld')).toHaveLength(1)
  })

  it('der Leiter steht oben mit seiner Lage — ein Freitext-Leiter ohne Zusage', () => {
    const extern = [[{ ...FS_WOCHE[0]![0]!, leader: 'Kreisaufseher', lext: true }]]
    const { container } = mitTreffpunkt({ fsWeeks: extern as unknown as AppState['fsWeeks'] })
    const karte = container.querySelector('.zuteilen-aktuell')!
    expect(karte.querySelector('.zuteilen-name')?.textContent).toBe('Kreisaufseher')
    // Er hat die App nicht — es gibt nichts zu bestätigen, der Platz ist voll.
    expect(karte.querySelector('.punkt')?.className).toContain('is-voll')
    expect(karte.querySelector('.zuteilen-info')).toBeNull()
  })

  /** Theo leitet am Mittwoch (f1) und am Samstag (f2) — f2 in Gruppe 2. */
  const theosWoche = (f2: Partial<FsInstance> = {}) =>
    [[
      { ...FS_WOCHE[0]![0]!, wd: 3, leader: 'Theo Treff', lpid: 'p-t' },
      { ...FS_WOCHE[0]![0]!, id: 'f2', leader: 'Theo Treff', lpid: 'p-t', ...f2 },
    ]] as unknown as AppState['fsWeeks']
  const theoFehltSamstag: Absence[] = [{ id: 'a1', personId: 'p-t', userId: null, from: '2026-09-12', to: '2026-09-13', reason: '' }]
  const aktuell = (c: HTMLElement) => c.querySelector('.zuteilen-aktuell')!

  it('fehlt der Leiter an seinem Tag, steht er rot da — mit dem Zeitraum', () => {
    const samstag: SlotSelection = { kind: 'fs', wi: 0, instId: 'f2', label: 'Treffpunkt', priv: 'treffpunkt', groups: false }
    const { container } = zeige(samstag, {
      fsWeeks: theosWoche(),
      persons: [person('p-t', 'Theo', 'Treff', 'treffpunkt')],
      absences: theoFehltSamstag,
    })
    expect(aktuell(container).querySelector('.punkt')?.className).toContain('is-problem')
    expect(info(aktuell(container)).textContent).toBe(fill(t.abwesendZeitraum, { zeitraum: '12.–13. September' }))
  })

  it('am Mittwoch davor leitet er trotzdem — die Abwesenheit trifft nur ihren Tag', () => {
    const { container } = mitTreffpunkt({ fsWeeks: theosWoche(), absences: theoFehltSamstag })
    expect(aktuell(container).querySelector('.punkt')?.className).toContain('is-wartet')
  })

  it('beim Gruppenaufseher dieselbe Lage wie im Plan — gezählt wird nur seine Gruppe', () => {
    // Zweimal am selben Tag, aber einmal in der fremden Gruppe: Sein Plan
    // zeigt sie nicht, also steht sein Platz dort nicht rot — hier auch nicht.
    const zweimalSamstag = theosWoche({ wd: 6, grp: 'g2' })
    zweimalSamstag[0]![0] = { ...zweimalSamstag[0]![0]!, wd: 6, grp: 'g1' }
    const { container } = mitTreffpunkt({
      fsWeeks: zweimalSamstag,
      planner: false,
      zuteiler: false,
      personId: 'p-ov',
      groups: [
        { id: 'g1', name: 'Gruppe 1', overseerId: 'p-ov', assistantId: null },
        { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
      ],
    })
    expect(aktuell(container).querySelector('.punkt')?.className).toContain('is-wartet')
  })
})

describe('Die Zusätzliche Klasse ist ein eigener Platz, kein zweiter Hauptsaal', () => {
  const mitKlasse = () => syncAuxSlots([woche('2026-09-07')], true)

  it('der Kopf nennt den Raum in der Sprache des Lesers', () => {
    const sel: SlotSelection = { ...SEL_SCHUELER, aux: true, labelRolle: 'Zusätzliche Klasse' } as SlotSelection
    const { container } = zeige(sel, { weeks: mitKlasse(), auxClass: true })
    expect(container.querySelector('.sheet-title')?.textContent).toContain('Zusätzliche Klasse')
  })

  it('wer im Hauptsaal steht, gilt in der Klasse als „an diesem Tag schon"', () => {
    const weeks = mitKlasse()
    schuelerPlatz(weeks[0]!).name = 'Anton Alt'
    const sel: SlotSelection = { ...SEL_SCHUELER, aux: true } as SlotSelection
    const { container } = zeige(sel, { weeks, auxClass: true })
    expect(info(zeile(container, 'Anton Alt')).className).toContain('is-doppelt')
  })
})
