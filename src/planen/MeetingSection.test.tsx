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
import { syncAuxSlots } from '../data/aux-class'
import { LABEL_ABSCHLUSS, LABEL_EROEFFNUNG, LABEL_LAC, LABEL_VORTRAG } from '../data/constants'
import { emptyQualifications, ROLE_CIRCUIT } from '../data/helpers'
import { TALK_PLACEHOLDER } from '../data/meeting-edit'
import { ROLE_GUEST_SPEAKER, ROLE_OWN_SPEAKER, slotTaskKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { PartItem, Person, Section, Week } from '../data/types'
import { MeetingSection } from './MeetingSection'

/**
 * **Der Programm-Abschnitt beim Planen — was der Planer die meiste Zeit sieht.**
 *
 * Hier steht jeder Platz als Chip, und daran hängen mehrere Regeln, die sonst
 * nirgends geprüft sind:
 *
 * - Der **Ampel-Punkt** (grün bestätigt, gelb wartet, rot abgesagt) gilt dem
 *   einzelnen Platz und darf nur stehen, wo jemand bestätigen kann. Beim
 *   Gastredner behauptete er sonst eine Zusage, die es nie gab
 *   (`slot-status-quelle.test.ts` prüft, dass genau vier Aufrufer die Regel
 *   führen — hier wird gemessen, dass dieser sie auch anwendet).
 * - Der **Redner-Platz** muss das Sheet im Freitext-Modus öffnen, und zwar auch
 *   dann, wenn dort gerade ein *eigener* Redner steht — sonst gäbe es keinen
 *   Weg zurück zum Gastredner (T29).
 * - Die **Zusätzliche Klasse** bekommt eine zweite Reihe, aber nur bei
 *   Schülerteilen und nur, wenn es sie gibt. Die Raumnamen stehen nur da, wo
 *   es wirklich zwei Reihen gibt — sonst stünde „Hauptsaal" über dem Gebet.
 * - „**Unser Leben als Christ**" ist der einzige bearbeitbare Abschnitt: nur
 *   dort Minuten, Verschieben, Löschen und Hinzufügen.
 */

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(),
})

const PERSONEN = [person('p-a', 'Anton', 'Alt'), person('p-b', 'Bernd', 'Brand')]

function woche(mid: Section[], we: Section[] = []): Week {
  return {
    range: '1.–7. September', book: '', start: '2026-09-07', current: false,
    mid: { date: '', end: '20:45', sections: mid, helpers: {} },
    we: { date: '', end: '11:45', sections: we, helpers: {} },
  }
}

function zeige(
  section: Section,
  over: Partial<AppState> = {},
  props: Partial<{ si: number; mitAux: boolean }> = {},
) {
  const dispatch = vi.fn()
  const tab = over.tab ?? 'mid'
  const weeks = over.weeks ?? [tab === 'we' ? woche([], [section]) : woche([section])]
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN, services: [], groups: [], absences: [],
    confirmations: {}, weeks, fsWeeks: [[]],
    ...over,
    tab,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <MeetingSection
              si={props.si ?? 0}
              section={section}
              rawSection={section}
              mitAux={props.mitAux ?? false}
              tpw={(s) => s}
            />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const chips = (c: HTMLElement) => [...c.querySelectorAll('.slot-chip')]
const chipTexte = (c: HTMLElement) => chips(c).map((x) => x.textContent ?? '')
const knopf = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  )!

afterEach(cleanup)

describe('Plätze als Chips', () => {
  const mitPlaetzen = (): Section => ({
    label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
    items: [{
      num: 1, title: 'Bibellesung', meta: '4 Min.',
      names: [{ name: 'Anton Alt', pid: 'p-a', bereichsKey: 'bibellesung' }, { name: '', bereichsKey: 'leser' }],
    }],
  })

  it('ein besetzter Platz trägt den Namen, ein offener die Aufforderung', () => {
    const { container } = zeige(mitPlaetzen())
    expect(chipTexte(container)[0]).toContain('Anton Alt')
    expect(chipTexte(container)[1]).toBe(t.zuteilenChip)
  })

  it('der offene Platz ist als solcher gekennzeichnet, der besetzte nicht', () => {
    const { container } = zeige(mitPlaetzen())
    expect(chips(container)[0]!.className).not.toContain('is-open')
    expect(chips(container)[1]!.className).toContain('is-open')
  })

  it('auch der offene Platz nennt seine Rolle', () => {
    /*
      Vorher stand dort nur „— zuteilen". Beim Versammlungsbibelstudium sah
      der Planer damit zwei gleich aussehende Knöpfe und musste antippen, um
      zu erfahren, welcher der Leiter und welcher der Leser ist. Beim
      Schülerteil hängt daran mehr: Die Geschlechterregel gilt für den
      Partner-Platz (`partnerGenderOk`), und welcher das ist, stand nirgends.
    */
    const s = mitPlaetzen()
    ;(s.items[0] as PartItem).names[1]!.rolle = 'Leser'
    const { container } = zeige(s)
    expect(chipTexte(container)[1]).toBe(`Leser: ${t.zuteilenChip}`)
    // Offen bleibt er trotzdem — die Beschriftung ist kein Name.
    expect(chips(container)[1]!.className).toContain('is-open')
  })

  it('ohne Rolle bleibt der offene Platz bei der blanken Aufforderung', () => {
    // Die Hilfsdienste tragen keine Rolle — ihr Dienstname steht in der
    // Überschrift. Dort wäre ein Präfix ein leerer Doppelpunkt.
    const { container } = zeige(mitPlaetzen())
    expect(chipTexte(container)[1]).toBe(t.zuteilenChip)
  })

  it('die Rolle steht vor dem Namen — in der Sprache des Lesers', () => {
    const s = mitPlaetzen()
    ;(s.items[0] as PartItem).names[0]!.rolle = 'Leser'
    const { container } = zeige(s)
    expect(chipTexte(container)[0]).toContain('Leser: Anton Alt')
  })

  it('ein Tipp öffnet das Zuteilungs-Sheet mit Woche, Zusammenkunft, Position und Bereich', () => {
    const { container, dispatch } = zeige(mitPlaetzen(), { week: 0 }, { si: 2 })
    fireEvent.click(chips(container)[1]!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({
        kind: 'part', wi: 0, tab: 'mid', si: 2, ii: 0, ni: 1,
        label: 'Bibellesung', priv: 'leser', groups: false,
      }),
    })
  })

  it('ein Lied ist kein Platz — es steht nur da', () => {
    const s: Section = { label: 'ERÖFFNUNG', farbe: 'neutral', items: [{ song: 'Lied 12' }] }
    const { container } = zeige(s)
    expect(chips(container)).toHaveLength(0)
    expect(container.querySelector('.panel-song')?.textContent).toBe('Lied 12')
  })
})

/** Die Stufe des Ampel-Punkts an einem Chip — `null`, wenn er keinen trägt. */
function stufe(chip: Element | undefined): string | null {
  const punkt = chip?.querySelector('.zusage-punkt')
  if (!punkt) return null
  return ['is-bestaetigt', 'is-offen', 'is-verhindert'].find((k) => punkt.classList.contains(k)) ?? '?'
}

describe('Der Ampel-Punkt gehört dem Platz, nicht der Person', () => {
  /*
   * Bis zum 14. September 2026 stand hier eine Personen-Markierung: „…" an
   * jedem Platz einer Person, solange sie irgendwo etwas offen hatte. Robert
   * sagt den Vorsitz zu, das Gebet noch nicht — und beide Chips standen auf
   * „…". Der Planer las daraus, der Vorsitz sei unbestätigt.
   */
  const eroeffnung = (): Section => ({
    label: LABEL_EROEFFNUNG, farbe: 'neutral',
    items: [{
      title: 'Lied 74 · Gebet · Einleitende Worte', meta: '1 Min.',
      names: [
        { name: 'Anton Alt', pid: 'p-a', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
        { name: 'Anton Alt', pid: 'p-a', rolle: 'Gebet', bereichsKey: 'gebet' },
      ],
    }],
  })
  const schluessel = (s: Section, ni: number) =>
    slotTaskKey(s.items[0] as PartItem, '2026-09-07', 'mid', 0, 0, ni)

  it('Vorsitz bestätigt, Gebet noch offen: grün und gelb nebeneinander', () => {
    const s = eroeffnung()
    const { container } = zeige(s, { confirmations: { [schluessel(s, 0)]: 'bestätigt' } })
    expect(chips(container).map(stufe)).toEqual(['is-bestaetigt', 'is-offen'])
  })

  it('eine Absage ist rot — nicht gelb wie eine ausstehende Antwort', () => {
    const s = eroeffnung()
    const { container } = zeige(s, { confirmations: { [schluessel(s, 1)]: 'verhindert' } })
    expect(chips(container).map(stufe)).toEqual(['is-offen', 'is-verhindert'])
  })

  it('der Screenreader hört die Stufe als Wort, hinter einem geschützten Leerzeichen', () => {
    // Die Farbe allein sagt einem blinden Planer nichts. Ohne Leerzeichen läse
    // er „Anton Altbestätigt"; mit einem gewöhnlichen dürfte der Punkt in einem
    // umbrechenden Chip allein in die nächste Zeile rutschen.
    const s = eroeffnung()
    const { container } = zeige(s, { confirmations: { [schluessel(s, 0)]: 'bestätigt' } })
    expect(chipTexte(container)).toEqual([
      `Vorsitz: Anton Alt\u00A0${t.zusageBestaetigt}`,
      `Gebet: Anton Alt\u00A0${t.zusageWartet}`,
    ])
    expect(chips(container)[0]!.querySelector('.zusage-punkt')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('die Zusage einer anderen Woche färbt diesen Platz nicht', () => {
    // Gegenprobe zum Schlüssel: dieselbe Position eine Woche später ist ein
    // anderer Platz.
    const s = eroeffnung()
    const andereWoche = slotTaskKey(s.items[0] as PartItem, '2026-09-14', 'mid', 0, 0, 0)
    const { container } = zeige(s, { confirmations: { [andereWoche]: 'bestätigt' } })
    expect(chips(container).map(stufe)).toEqual(['is-offen', 'is-offen'])
  })
})

describe('Der Ampel-Punkt steht nur, wo jemand bestätigen kann', () => {
  const rednerAbschnitt = (rolle: string): Section => ({
    label: LABEL_VORTRAG, farbe: 'petrol',
    items: [{ num: 1, title: 'Öffentlicher Vortrag', meta: '', names: [{ name: 'Gustav Gast', rolle }] }],
  })

  it('ein offener Platz trägt keinen — es gibt noch nichts zu bestätigen', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: '' }] }],
    }
    expect(zeige(s).container.querySelector('.zusage-punkt')).toBeNull()
  })

  it('ein Gastredner bekommt keinen — er hat weder Aufgabe noch App', () => {
    const { container } = zeige(rednerAbschnitt(`${ROLE_GUEST_SPEAKER} · Nordheim`), { tab: 'we' })
    expect(container.querySelector('.zusage-punkt')).toBeNull()
  })

  it('der Kreisaufseher ebenso wenig', () => {
    const { container } = zeige(rednerAbschnitt(ROLE_CIRCUIT), { tab: 'we' })
    expect(container.querySelector('.zusage-punkt')).toBeNull()
  })

  it('ein eigener Redner dagegen schon — für ihn gibt es den Flow', () => {
    const { container } = zeige(rednerAbschnitt(ROLE_OWN_SPEAKER), { tab: 'we' })
    expect(stufe(chips(container)[0])).toBe('is-offen')
  })

  it('eine ausgefallene Zusammenkunft trägt keinen — auch nicht mit einer Zusage von vorher (T30)', () => {
    // Die Namen bleiben stehen, die Zusammenkunft findet nicht statt: keine
    // Aufgabe, keine Erinnerung, nichts zu bestätigen. Ein gelber Punkt wartete
    // dort für immer, ein grüner meldete eine Zusage für einen leeren Abend.
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const ausgefallen = woche([s])
    ausgefallen.dev = { mid: { cancelled: true } }
    const key = slotTaskKey(s.items[0] as PartItem, '2026-09-07', 'mid', 0, 0, 0)
    const { container } = zeige(s, { weeks: [ausgefallen], confirmations: { [key]: 'bestätigt' } })
    expect(chipTexte(container)[0]).toContain('Anton Alt')
    expect(container.querySelector('.zusage-punkt')).toBeNull()
  })

  it('… die andere Zusammenkunft derselben Woche zeigt ihn weiter', () => {
    // Gegenprobe: Der Ausfall gilt der einen Zusammenkunft, nicht der Woche.
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const nurMitteAus = woche([], [s])
    nurMitteAus.dev = { mid: { cancelled: true } }
    const { container } = zeige(s, { tab: 'we', weeks: [nurMitteAus] })
    expect(stufe(chips(container)[0])).toBe('is-offen')
  })
})

describe('Der Redner-Platz öffnet immer den Freitext-Weg (T29)', () => {
  const abschnitt = (rolle: string): Section => ({
    label: LABEL_VORTRAG, farbe: 'petrol',
    items: [{ num: 1, title: 'Öffentlicher Vortrag', meta: '', names: [{ name: 'X', rolle }] }],
  })

  it('beim Gastredner', () => {
    const { container, dispatch } = zeige(abschnitt(ROLE_GUEST_SPEAKER), { tab: 'we' })
    fireEvent.click(chips(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.guest).toBe(true)
  })

  it('und auch beim eigenen Redner — sonst gäbe es keinen Weg zurück', () => {
    const { container, dispatch } = zeige(abschnitt(ROLE_OWN_SPEAKER), { tab: 'we' })
    fireEvent.click(chips(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.guest).toBe(true)
  })

  it('an einem gewöhnlichen Platz nicht', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: '', rolle: 'Leser' }] }],
    }
    const { container, dispatch } = zeige(s)
    fireEvent.click(chips(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.guest).toBeFalsy()
  })
})

describe('Die Zusätzliche Klasse als zweite Reihe', () => {
  const schuelerWoche = () => {
    const item: PartItem = {
      num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
      names: [{ name: 'Anton Alt', pid: 'p-a', bereichsKey: 'schulung' }],
    }
    return syncAuxSlots([woche([{ label: 'UNS IM DIENST VERBESSERN', farbe: 'gold', items: [item] }])], true)
  }

  it('ohne eingerichtete Klasse bleibt es bei einer Reihe — ohne Raumnamen', () => {
    const weeks = schuelerWoche()
    const { container } = zeige(weeks[0]!.mid.sections[0]!, { weeks }, { mitAux: false })
    expect(container.querySelectorAll('.plan-slots')).toHaveLength(1)
    expect(container.querySelector('.plan-raum')).toBeNull()
  })

  it('mit Klasse stehen zwei Reihen da, jede mit ihrem Raumnamen', () => {
    const weeks = schuelerWoche()
    const { container } = zeige(weeks[0]!.mid.sections[0]!, { weeks, auxClass: true }, { mitAux: true })
    expect(container.querySelectorAll('.plan-slots')).toHaveLength(2)
    expect([...container.querySelectorAll('.plan-raum')].map((x) => x.textContent)).toEqual([
      t.auxHauptsaal, t.auxKlasse,
    ])
  })

  it('nur Schülerteile bekommen die zweite Reihe — Gebet und Vorsitz nicht', () => {
    const s: Section = {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ title: 'Lied 12 · Gebet', meta: '', names: [{ name: '', rolle: 'Gebet' }] }],
    }
    const { container } = zeige(s, { auxClass: true }, { mitAux: true })
    expect(container.querySelectorAll('.plan-slots')).toHaveLength(1)
    expect(container.querySelector('.plan-raum')).toBeNull()
  })

  it('der Platz der Klasse öffnet das Sheet mit dem Raum im Titel', () => {
    const weeks = schuelerWoche()
    const { container, dispatch } = zeige(
      weeks[0]!.mid.sections[0]!, { weeks, auxClass: true }, { mitAux: true },
    )
    fireEvent.click(chips(container).at(-1)!)
    const sel = dispatch.mock.calls[0]![0].sel
    expect(sel.aux).toBe(true)
    expect(sel.labelRolle).toContain(t.auxKlasse)
  })

  it('der Hauptsaal-Platz trägt kein aux-Kennzeichen', () => {
    const weeks = schuelerWoche()
    const { container, dispatch } = zeige(
      weeks[0]!.mid.sections[0]!, { weeks, auxClass: true }, { mitAux: true },
    )
    fireEvent.click(chips(container)[0]!)
    expect(dispatch.mock.calls[0]![0].sel.aux).toBeUndefined()
  })
})

describe('„Unser Leben als Christ" ist der einzige bearbeitbare Abschnitt', () => {
  const lac = (): Section => ({
    label: LABEL_LAC, farbe: 'wein',
    items: [
      { num: 8, title: 'Örtliche Hinweise', meta: '5 Min.', mins: 5, names: [{ name: '' }] },
      { num: 9, title: 'Versammlungsbibelstudium', meta: '30 Min.', mins: 30, names: [{ name: '', rolle: 'Leiter' }, { name: '', rolle: 'Leser' }] },
    ],
  })

  it('jeder Punkt trägt seine Minuten und lässt sie in Fünferschritten ändern', () => {
    const { container, dispatch } = zeige(lac())
    expect([...container.querySelectorAll('.lac-mins')].map((x) => x.textContent)).toEqual([
      '5 Min.', '30 Min.',
    ])
    // Der **zweite** Punkt (30 Min.) liegt zwischen den Grenzen; beim ersten
    // steht „–" am Anschlag und ist abgeschaltet (siehe unten).
    const knopf = [...container.querySelectorAll('.lac-step-btn')]
    fireEvent.click(knopf[3]!) // „+" beim zweiten Punkt
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacAdjust', si: 0, ii: 1, delta: 5 })
    fireEvent.click(knopf[2]!) // „–" beim zweiten Punkt
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacAdjust', si: 0, ii: 1, delta: -5 })
  })

  it('am Anschlag ist der Schritt gesperrt — wie das Verschieben am Rand (V7)', () => {
    /*
      `lacAdjust` klemmt auf 5..45 und gab am Anschlag stumm dieselbe Woche
      zurück: Der Planer tippte, und nichts geschah. Ein Hinweis wäre die
      zweitbeste Antwort — was nicht wirken kann, wird gar nicht erst
      angeboten. Genau so hält es das Verschieben daneben seit je.
    */
    const rand: Section = {
      label: LABEL_LAC, farbe: 'wein',
      items: [
        { num: 8, title: 'Kurz', meta: '5 Min.', mins: 5, names: [{ name: '' }] },
        { num: 9, title: 'Lang', meta: '45 Min.', mins: 45, names: [{ name: '' }] },
      ],
    }
    const { container } = zeige(rand)
    const knopf = [...container.querySelectorAll<HTMLButtonElement>('.lac-step-btn')]
    expect(knopf[0]!.disabled, '„–" bei 5 Min. muss gesperrt sein').toBe(true)
    expect(knopf[1]!.disabled, '„+" bei 5 Min. muss gehen').toBe(false)
    expect(knopf[2]!.disabled, '„–" bei 45 Min. muss gehen').toBe(false)
    expect(knopf[3]!.disabled, '„+" bei 45 Min. muss gesperrt sein').toBe(true)
  })

  it('am Rand ist das Verschieben gesperrt — nach oben beim ersten, nach unten beim letzten', () => {
    const { container } = zeige(lac())
    const hoch = [...container.querySelectorAll<HTMLButtonElement>('.lac-move-btn')].filter(
      (b) => b.getAttribute('aria-label') === t.a11yMoveUp,
    )
    const runter = [...container.querySelectorAll<HTMLButtonElement>('.lac-move-btn')].filter(
      (b) => b.getAttribute('aria-label') === t.a11yMoveDown,
    )
    expect(hoch[0]!.disabled).toBe(true)
    expect(hoch[1]!.disabled).toBe(false)
    expect(runter[0]!.disabled).toBe(false)
    expect(runter[1]!.disabled).toBe(true)
  })

  it('Verschieben nennt die Richtung', () => {
    const { container, dispatch } = zeige(lac())
    const runter = [...container.querySelectorAll('.lac-move-btn')].find(
      (b) => b.getAttribute('aria-label') === t.a11yMoveDown,
    )!
    fireEvent.click(runter)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacMove', si: 0, ii: 0, dir: 1 })
  })

  it('Löschen entfernt den Punkt', () => {
    const { container, dispatch } = zeige(lac())
    fireEvent.click(container.querySelector('.lac-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacRemove', si: 0, ii: 0 })
  })

  it('ein neuer Punkt braucht einen Titel — leer bittet darum', () => {
    const { container, dispatch } = zeige(lac())
    fireEvent.click(container.querySelector('.lac-add-btn')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameEingeben })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'lacAdd')).toBe(false)
  })

  it('mit Titel wird er eingefügt und das Feld geleert', () => {
    const { container, dispatch } = zeige(lac())
    const feld = container.querySelector<HTMLInputElement>('.lac-add-input')!
    fireEvent.change(feld, { target: { value: 'Örtliche Hinweise' } })
    fireEvent.click(container.querySelector('.lac-add-btn')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'lacAdd', si: 0, title: 'Örtliche Hinweise' })
    expect(feld.value).toBe('')
  })

  it('ein anderer Abschnitt hat weder Minuten noch Einfügefeld', () => {
    const s: Section = {
      label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '10 Min.', mins: 10, names: [{ name: '' }] }],
    }
    const { container } = zeige(s)
    expect(container.querySelector('.lac-edit')).toBeNull()
    expect(container.querySelector('.lac-add-row')).toBeNull()
  })
})

describe('Der Gesprächspartner-Platz lässt sich an- und abschalten', () => {
  const gespraech = (mitPartner: boolean): Section => ({
    label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
    items: [{
      num: 4, title: 'Gespräche beginnen', meta: '3 Min.',
      names: [
        { name: '', bereichsKey: 'schulung' },
        ...(mitPartner ? [{ name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' }] : []),
      ],
    }],
  })

  it('ohne Partner bietet er das Hinzufügen an', () => {
    const { container, dispatch } = zeige(gespraech(false))
    const b = knopf(container, t.partnerHinzu)
    fireEvent.click(b)
    expect(dispatch).toHaveBeenCalledWith({ type: 'togglePartner', si: 0, ii: 0 })
  })

  it('mit Partner das Entfernen', () => {
    const { container } = zeige(gespraech(true))
    expect(knopf(container, t.partnerEntfernen)).toBeTruthy()
  })

  it('an einem Punkt ohne Schulungs-Platz gibt es den Schalter gar nicht', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: '', bereichsKey: 'leser' }] }],
    }
    const { container } = zeige(s)
    expect(container.querySelector('.partner-toggle')).toBeNull()
  })
})

describe('Am Wochenende: Vortragsthema und Lieder', () => {
  const vortrag = (titel: string): Section => ({
    label: LABEL_VORTRAG, farbe: 'petrol',
    items: [{ num: 1, title: titel, meta: '', names: [{ name: '', rolle: ROLE_GUEST_SPEAKER }] }],
  })

  it('der Platzhalter erscheint als leeres Feld, nicht als Text', () => {
    const { container } = zeige(vortrag(TALK_PLACEHOLDER), { tab: 'we' })
    const feld = container.querySelector<HTMLInputElement>('.talk-title-input')!
    expect(feld.value).toBe('')
    expect(feld.placeholder).toBe(t.vortragThemaPh)
  })

  it('ein eingetragenes Thema steht im Feld und wird beim Verlassen gespeichert', () => {
    const { container, dispatch } = zeige(vortrag('Wer ist wirklich glücklich?'), { tab: 'we' })
    const feld = container.querySelector<HTMLInputElement>('.talk-title-input')!
    expect(feld.value).toBe('Wer ist wirklich glücklich?')
    fireEvent.blur(feld, { target: { value: 'Neues Thema' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'talkEdit', si: 0, ii: 0, title: 'Neues Thema' })
  })

  it('Enter übernimmt ebenfalls — man muss nicht wegtippen', () => {
    const { container, dispatch } = zeige(vortrag('Alt'), { tab: 'we' })
    const feld = container.querySelector<HTMLInputElement>('.talk-title-input')!
    document.body.append(container) // damit `focus()` in jsdom greift
    feld.focus()
    fireEvent.change(feld, { target: { value: 'Neu' } })
    fireEvent.keyDown(feld, { key: 'Enter' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'talkEdit', si: 0, ii: 0, title: 'Neu' })
  })

  it('das Anfangslied ist ein Nummernfeld — Buchstaben kommen nicht hinein', () => {
    const s: Section = { label: LABEL_EROEFFNUNG, farbe: 'neutral', items: [{ song: 'Lied 44' }] }
    const { container, dispatch } = zeige(s, { tab: 'we', weeks: [woche([], [s])] })
    const feld = container.querySelector<HTMLInputElement>('.talk-song-input')!
    expect(container.querySelector('.plan-helper-label')?.textContent).toBe(t.anfangsliedLbl)
    feld.value = '4a4'
    fireEvent.input(feld)
    expect(feld.value).toBe('44')
    fireEvent.blur(feld, { target: { value: '44' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'openingSong', song: '44' })
  })

  it('das Schlusslied schreibt in seine eigene Aktion', () => {
    const s: Section = { label: LABEL_ABSCHLUSS, farbe: 'neutral', items: [{ song: 'Lied 100' }] }
    const { container, dispatch } = zeige(s, { tab: 'we', weeks: [woche([], [s])] })
    fireEvent.blur(container.querySelector('.talk-song-input')!, { target: { value: '100' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'closingSong', song: '100' })
  })

  it('unter der Woche gibt es die Lied-Nummernfelder nicht — sie stehen im Arbeitsheft', () => {
    const s: Section = { label: LABEL_EROEFFNUNG, farbe: 'neutral', items: [{ song: 'Lied 44' }] }
    const { container } = zeige(s, { tab: 'mid' })
    expect(container.querySelector('.talk-song-input')).toBeNull()
  })

  it('ohne Platz für die Nummer steht auch kein Feld da (V7)', () => {
    /*
      `setSong` schreibt die Zahl entweder in ein Lied-Item oder in das
      Lied-Atom eines Sammeltitels. Trägt der Abschnitt keins von beidem, hätte
      es nichts, wohin — und gab stumm dieselbe Woche zurück: Der Planer tippte
      eine Nummer ein und sah nichts. Was nicht wirken kann, wird nicht
      angeboten.
    */
    const ohneLied: Section = {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ num: null as unknown as number, title: 'Gebet', meta: '', names: [{ name: '' }] }],
    }
    const { container } = zeige(ohneLied, { tab: 'we', weeks: [woche([], [ohneLied])] })
    expect(container.querySelector('.talk-song-input')).toBeNull()
  })

  it('… mit Lied-Atom im Sammeltitel dagegen schon', () => {
    // Gegenprobe: So legt der Import die Wochenend-Eröffnung an.
    const mitAtom: Section = {
      label: LABEL_EROEFFNUNG, farbe: 'neutral',
      items: [{ title: 'Lied · Gebet', meta: '', names: [{ name: '' }] }],
    }
    const { container } = zeige(mitAtom, { tab: 'we', weeks: [woche([], [mitAtom])] })
    expect(container.querySelector('.talk-song-input')).not.toBeNull()
  })
})

describe('Die Kreisaufseher-Woche: fester Begriff, freies Thema (T62)', () => {
  const coPunkt = (): Section => ({
    label: LABEL_LAC, farbe: 'wein',
    items: [{
      num: 8, title: 'Dienstvortrag · Bleiben wir wachsam', meta: '30 Min.', mins: 30,
      names: [{ name: 'Kreisaufseher', rolle: ROLE_CIRCUIT }],
    }],
  })

  it('der Begriff steht fest davor, das Thema im Feld dahinter', () => {
    const { container } = zeige(coPunkt())
    expect(container.querySelector('.co-begriff')?.textContent).toBe('Dienstvortrag')
    expect(container.querySelector<HTMLInputElement>('.talk-title-input')?.value).toBe(
      'Bleiben wir wachsam',
    )
  })

  it('das Thema wird unter seinem Begriff gespeichert — der Begriff bleibt', () => {
    const { container, dispatch } = zeige(coPunkt())
    fireEvent.blur(container.querySelector('.talk-title-input')!, { target: { value: 'Neu' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setPartThema', tab: 'mid', si: 0, ii: 0, begriff: 'Dienstvortrag', thema: 'Neu',
    })
  })
})

describe('Konflikte heben sich im Plan ab', () => {
  it('wer abwesend und trotzdem eingeteilt ist, bekommt den Punkt am Chip', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const { container } = zeige(s, {
      weeks: [woche([s])],
      absences: [{ id: 'a1', personId: 'p-a', userId: null, from: '2026-09-01', to: '2026-09-30', reason: '' }],
      congregation: { name: '', hall: '', meetings: 'Di 19:00 · So 10:00' },
    })
    expect(chips(container)[0]!.className).toContain('is-konflikt')
    expect(chips(container)[0]!.querySelector('.slot-konflikt-dot')).toBeTruthy()
  })

  it('ohne Konflikt bleibt der Chip schlicht', () => {
    const s: Section = {
      label: 'X', farbe: 'petrol',
      items: [{ num: 1, title: 'Punkt', meta: '', names: [{ name: 'Anton Alt', pid: 'p-a' }] }],
    }
    const { container } = zeige(s, { weeks: [woche([s])] })
    expect(chips(container)[0]!.className).not.toContain('is-konflikt')
  })
})
