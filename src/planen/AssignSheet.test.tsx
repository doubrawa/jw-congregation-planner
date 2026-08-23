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
import { initialState } from '../app/init'
import { syncAuxSlots } from '../data/aux-class'
import { emptyQualifications, LOAD_RADIUS } from '../data/helpers'
import { ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER } from '../data/planning'
import { dict } from '../i18n/ui'
import type { Absence, Group, PartItem, Person, Qualifications, Service, SlotSelection, Week } from '../data/types'
import { AssignSheet } from './AssignSheet'

/**
 * **Das Zuteilungs-Sheet — der Ort, an dem der Planer wirklich arbeitet.**
 *
 * Die Auswahlregeln stecken in `kandidaten.ts` und sind dort geprüft. Was hier
 * geprüft wird, ist das Verhalten des Blattes selbst, und das trägt eigene
 * fachliche Entscheidungen:
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
 */

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) q[k] = true
  return q
}

const person = (id: string, fn: string, ln: string, ...q: string[]): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: priv(...q), grp: null,
})

const ANTON = person('p-a', 'Anton', 'Alt', 'vorsitzWe', 'schulung', 'svc:mik')
const BERND = person('p-b', 'Bernd', 'Brand', 'vorsitzWe', 'schulung', 'svc:mik')
const CARLO = person('p-c', 'Carlo', 'Cohn', 'vorsitzWe')
const PERSONEN = [ANTON, BERND, CARLO]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** Eine Woche mit Redner-Platz (Wochenende) und einem Schülerteil (Mitte). */
function woche(start: string, rednerName = '', rednerRolle = ROLE_GUEST_SPEAKER): Week {
  const schueler: PartItem = {
    num: 4, title: 'Gespräche beginnen', meta: '',
    names: [{ name: '', rolle: '', bereichsKey: 'schulung' }],
  }
  return {
    range: '1.–7. September', book: '', start, current: false,
    mid: {
      date: '', end: '',
      sections: [{ label: 'UNS IM DIENST VERBESSERN', farbe: 'gold', items: [schueler] }],
      helpers: { mik: [], rein: [] },
    },
    we: {
      date: '', end: '',
      sections: [{
        label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol',
        items: [{
          num: 1, title: 'Öffentlicher Vortrag', meta: '',
          names: [{ name: rednerName, rolle: rednerRolle, bereichsKey: 'vorsitzWe' }],
        }],
      }],
      helpers: { mik: [], rein: [] },
    },
  }
}

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
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN,
    services: DIENSTE,
    groups: [],
    weeks: [woche('2026-09-07')],
    fsWeeks: [[]],
    absences: [],
    congregation: { name: 'Test', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
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

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.cand-row')]
const namen = (c: HTMLElement) => zeilen(c).map((r) => r.querySelector('.cand-name')?.textContent ?? '')
const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!

beforeEach(() => {
  // Das Sheet lässt sich wegwischen; die Geste fragt zuerst nach dem Schreibtisch.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Kopf und Schließen', () => {
  it('nennt Punkt und Rolle, Woche und Zusammenkunft', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(container.querySelector('.sheet-title')?.textContent).toBe('Gespräche beginnen')
    expect(container.querySelector('.sheet-sub')?.textContent).toContain('1.–7. September')
    expect(container.querySelector('.sheet-sub')?.textContent).toContain(t.tabMid)
  })

  it('ist ein modaler Dialog — mit dem Titel als Beschriftung', () => {
    const { container } = zeige(SEL_REDNER())
    const dlg = container.querySelector('.sheet')!
    expect(dlg.getAttribute('role')).toBe('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-label')).toBe('Öffentlicher Vortrag · Redner')
  })

  it('das ✕, der Hintergrund und Escape schließen alle drei', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER)
    fireEvent.click(container.querySelector('.sheet-close')!)
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'closeSlot')).toHaveLength(3)
  })
})

describe('Die Kandidatenliste', () => {
  it('zeigt nur Qualifizierte, alphabetisch nach Nachname', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(namen(container)).toEqual(['Anton Alt', 'Bernd Brand'])
  })

  it('ein Tipp teilt zu — mit Person-Id, nicht nur mit dem Namen', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER)
    fireEvent.click(zeilen(container)[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Bernd Brand', pid: 'p-b' })
  })

  it('jeder Kandidat trägt seine fünf Auslastungs-Quadrate — die geplante Woche umrandet', () => {
    const { container } = zeige(SEL_SCHUELER)
    const felder = zeilen(container)[0]!.querySelectorAll('.cand-load-cell')
    expect(felder).toHaveLength(2 * LOAD_RADIUS + 1)
    const jetzt = [...felder].filter((f) => f.hasAttribute('data-jetzt'))
    expect(jetzt).toHaveLength(1)
    expect([...felder].indexOf(jetzt[0]!)).toBe(LOAD_RADIUS)
  })

  it('jedes Quadrat einer geladenen Woche nennt Art und Woche — auch ohne Augen', () => {
    // Fünf geladene Wochen: dann trägt jedes der fünf Quadrate einen Text.
    const wochen = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'].map((s) =>
      woche(s),
    )
    const { container } = zeige({ ...SEL_SCHUELER, wi: 2 } as SlotSelection, { weeks: wochen })
    const titel = [...zeilen(container)[0]!.querySelectorAll('.cand-load-cell')].map((f) =>
      f.getAttribute('title'),
    )
    expect(titel).toHaveLength(2 * LOAD_RADIUS + 1)
    expect(titel.every((x) => Boolean(x))).toBe(true)
    expect(titel[LOAD_RADIUS]).toContain(t.loadFrei)
  })

  it('eine nicht geladene Woche bleibt ohne Text — über sie ist nichts bekannt', () => {
    // Am Rand des Fensters gibt es die Nachbarwochen nicht. Ein Text wie
    // „frei vor 2 Wochen" wäre dort eine Behauptung, keine Auskunft.
    const { container } = zeige(SEL_SCHUELER)
    const felder = [...zeilen(container)[0]!.querySelectorAll('.cand-load-cell')]
    expect(felder[0]!.getAttribute('data-load')).toBe('void')
    expect(felder[0]!.getAttribute('title')).toBe('')
    expect(felder[LOAD_RADIUS]!.getAttribute('title')).toContain(t.loadFrei)
  })
})

describe('Abwesende sieht man, wählen kann man sie nicht', () => {
  const ABWESEND: Absence[] = [
    { id: 'a1', personId: 'p-a', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' },
  ]

  it('stehen ausgegraut am Ende der Liste, statt zu verschwinden', () => {
    const { container } = zeige(SEL_SCHUELER, { absences: ABWESEND })
    expect(namen(container)).toEqual(['Bernd Brand', 'Anton Alt'])
    const letzte = zeilen(container).at(-1)!
    expect(letzte.className).toContain('is-absent')
    expect(letzte.querySelector('.cand-chip--absent')?.textContent).toBe(t.abwesendChip)
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
    const anton = zeilen(container)[0]!
    expect(anton.className).toContain('is-busy')
    expect(anton.querySelector('.cand-today')?.textContent).toContain(t.sheetSchonHeute)
    expect(anton.querySelector('.cand-today')?.textContent).toContain('Mikrofone')
  })

  it('aber der Planer darf trotzdem — es ist ein Hinweis, keine Sperre', () => {
    const { container, dispatch } = zeige(SEL_SCHUELER, { weeks: [belegt()] })
    fireEvent.click(zeilen(container)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Anton Alt', pid: 'p-a' })
  })

  it('wer nichts hat, trägt den „frei"-Chip', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(zeilen(container)[0]!.querySelector('.cand-chip--frei')?.textContent).toBe(t.freiChip)
  })
})

describe('Der Redner-Platz ist Gastredner und eigener Redner zugleich (T29)', () => {
  it('am leeren Platz stehen beide Wege: Freitext und Personenliste', () => {
    const { container } = zeige(SEL_REDNER())
    expect(container.querySelector('.sheet-guest')).toBeTruthy()
    expect(container.querySelector('.sheet-guest-hint')?.textContent).toBe(t.oderPersonWaehlen)
    expect(namen(container).length).toBeGreaterThan(0)
  })

  it('der Freitext macht ihn auswärtig — Name und Herkunftsversammlung', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    const felder = container.querySelectorAll<HTMLInputElement>('.sheet-guest .lac-add-input')
    fireEvent.change(felder[0]!, { target: { value: '  Gustav Gast  ' } })
    fireEvent.change(felder[1]!, { target: { value: 'Nordheim' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Gustav Gast', rolle: `${ROLE_GUEST_SPEAKER} · Nordheim`,
    })
  })

  it('ohne Herkunft bleibt es bei der bloßen Rolle — kein Trenner ins Leere', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    const felder = container.querySelectorAll<HTMLInputElement>('.sheet-guest .lac-add-input')
    fireEvent.change(felder[0]!, { target: { value: 'Gustav Gast' } })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: 'Gustav Gast', rolle: ROLE_GUEST_SPEAKER })
  })

  it('ein leerer Name teilt nicht zu, sondern bittet um einen', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    fireEvent.change(container.querySelectorAll('.sheet-guest .lac-add-input')[0]!, {
      target: { value: '   ' },
    })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameEingeben })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'assign')).toBe(false)
  })

  it('eine Person aus der Liste macht ihn zum EIGENEN Redner — mit Rolle und Id', () => {
    const { container, dispatch } = zeige(SEL_REDNER())
    fireEvent.click(zeilen(container)[0]!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Anton Alt', rolle: ROLE_OWN_SPEAKER, pid: 'p-a',
    })
  })

  it('steht schon ein eigener Redner, bleiben die Freitext-Felder leer', () => {
    // Vorbelegt wären sie ein Angebot, die Person als Gast zu verdoppeln.
    const { container } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Anton Alt', ROLE_OWN_SPEAKER)],
    })
    const felder = container.querySelectorAll<HTMLInputElement>('.sheet-guest .lac-add-input')
    expect(felder[0]!.value).toBe('')
    expect(felder[1]!.value).toBe('')
  })

  it('steht ein Gastredner, sind sie vorbelegt — man will ihn korrigieren, nicht neu tippen', () => {
    const { container } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Gustav Gast', `${ROLE_GUEST_SPEAKER} · Nordheim`)],
    })
    const felder = container.querySelectorAll<HTMLInputElement>('.sheet-guest .lac-add-input')
    expect(felder[0]!.value).toBe('Gustav Gast')
    expect(felder[1]!.value).toBe('Nordheim')
  })

  it('der Weg zurück: Freitext über einem eigenen Redner macht ihn wieder auswärtig', () => {
    const { container, dispatch } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Anton Alt', ROLE_OWN_SPEAKER)],
    })
    fireEvent.change(container.querySelectorAll('.sheet-guest .lac-add-input')[0]!, {
      target: { value: 'Gustav Gast' },
    })
    fireEvent.click(knopf(container, t.uebernehmenBtn))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assign', name: 'Gustav Gast', rolle: ROLE_GUEST_SPEAKER,
    })
  })

  it('„Entfernen" gibt den Platz als auswärtigen zurück — so kommt er aus dem Import', () => {
    // Bliebe er „Redner", holte ihn die Auto-Zuteilung; den Redner vereinbart man.
    const { container, dispatch } = zeige(SEL_REDNER(), {
      weeks: [woche('2026-09-07', 'Anton Alt', ROLE_OWN_SPEAKER)],
    })
    fireEvent.click(knopf(container, t.entfernen))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: '', rolle: ROLE_GUEST_SPEAKER })
  })

  it('an einem gewöhnlichen Platz entfernt „Entfernen" ohne Rollenwechsel', () => {
    const w = woche('2026-09-07')
    ;(w.mid.sections[0]!.items[0] as PartItem).names[0]!.name = 'Anton Alt'
    const { container, dispatch } = zeige(SEL_SCHUELER, { weeks: [w] })
    fireEvent.click(knopf(container, t.entfernen))
    expect(dispatch).toHaveBeenCalledWith({ type: 'assign', name: '' })
  })
})

describe('Der aktuell Zugeteilte steht oben', () => {
  const belegt = () => {
    const w = woche('2026-09-07')
    ;(w.mid.sections[0]!.items[0] as PartItem).names[0]!.name = 'Anton Alt'
    return w
  }

  it('mit Namen und der Möglichkeit, ihn zu entfernen', () => {
    const { container } = zeige(SEL_SCHUELER, { weeks: [belegt()] })
    const kopf = container.querySelector('.sheet-current')!
    expect(kopf.textContent).toContain(t.aktuellLbl)
    expect(kopf.querySelector('strong')?.textContent).toBe('Anton Alt')
    expect(knopf(container, t.entfernen)).toBeTruthy()
  })

  it('an einem leeren Platz steht die Zeile gar nicht', () => {
    const { container } = zeige(SEL_SCHUELER)
    expect(container.querySelector('.sheet-current')).toBeNull()
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
    expect(container.querySelector('.sheet-current')).toBeTruthy()
    expect(container.querySelector('.sheet-s89-link')).toBeNull()
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

  it('mit Gruppen stehen die Gruppen zur Wahl — ohne Person-Id', () => {
    const gruppen: Group[] = [
      { id: 'g1', name: 'Gruppe 1', ov: null, as: null },
      { id: 'g2', name: 'Gruppe 2', ov: null, as: null },
    ]
    const { container, dispatch } = zeige(SEL_GRUPPE, { groups: gruppen })
    expect(container.querySelector('.sheet-empty')).toBeNull()
    expect(zeilen(container)).toHaveLength(2)
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

  it('nennt im Kopf Zeit und Ort statt der Zusammenkunft', () => {
    const { container } = mitTreffpunkt()
    expect(container.querySelector('.sheet-sub')?.textContent).toBe('09:30 · Saal')
  })

  it('ein Freitext-Name wird als auswärtig eingetragen', () => {
    const { container, dispatch } = mitTreffpunkt()
    fireEvent.change(container.querySelector('.sheet-guest .lac-add-input')!, {
      target: { value: '  Kreisaufseher  ' },
    })
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
    expect(container.querySelectorAll('.sheet-guest .lac-add-input')).toHaveLength(1)
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
    ;(weeks[0]!.mid.sections[0]!.items[0] as PartItem).names[0]!.name = 'Anton Alt'
    const sel: SlotSelection = { ...SEL_SCHUELER, aux: true } as SlotSelection
    const { container } = zeige(sel, { weeks, auxClass: true })
    const anton = zeilen(container).find((r) => r.textContent?.includes('Anton Alt'))!
    expect(anton.className).toContain('is-busy')
  })
})
