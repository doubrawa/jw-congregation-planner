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
import { QUALIFICATION_ORDER, ROLE_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { dict, ROLE_KEY } from '../i18n/ui'
import type { Group, Person, Service } from '../data/types'
import { PersonDetail } from './PersonDetail'

/**
 * **Das Personen-Detail — das einzige Formular, das die Planung wirklich
 * steuert.**
 *
 * `PersonDetail.test.tsx` prüft die Aufteilung in Aufgaben und Hilfsdienste
 * (T73), `PrivToggle.test.tsx` die Kopplungen an den Schaltern. Hier steht,
 * was der Screen selbst zusagt:
 *
 * - **Vollständigkeit**: Jeder feste Aufgabenbereich und jeder Hilfsdienst
 *   muss einen Schalter haben. Fehlt einer, lässt sich die Qualifikation
 *   nirgends setzen — und der zugehörige Platz bleibt für immer offen, ohne
 *   dass es auffiele.
 * - **Löschen mit Zwei-Tipp-Bestätigung**: Es löst Gruppen-, Konto- und
 *   Code-Verknüpfungen und ist nicht rückgängig zu machen.
 * - Die **Familie** ist symmetrisch und darf niemanden doppelt anbieten —
 *   auch die Person selbst nicht.
 */

vi.mock('../lib/clipboard', () => ({ copyText: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../lib/invite', () => ({
  sendInviteMails: vi.fn(() => Promise.resolve({ ok: true, sent: 0, skipped: 0, notConfigured: false })),
}))

const t = dict('de')

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '0123', mail: 'anton@example.org', priv: emptyQualifications(), grp: null, ...over,
})

const BRAND = person({ id: 'p-b', fn: 'Bernd', ln: 'Brand' })
const COHN = person({ id: 'p-c', fn: 'Clara', ln: 'Cohn', female: true })

const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: null, as: null }]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'ord', name: 'Ordner', count: 1, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

function zeige(p: Person, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'personen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    persons: [p, BRAND, COHN], groups: GRUPPEN, services: DIENSTE,
    members: [], invites: [], weeks: [], fsWeeks: [], absences: [],
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PersonDetail person={p} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const patches = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => c[0].type === 'updatePerson').map((c) => c[0].patch)
const chip = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('.role-chip')].find((b) => b.textContent === text)!
const schalterLabels = (c: HTMLElement, panelLabel: string) => {
  const panel = [...c.querySelectorAll('.panel')].find(
    (p) => p.querySelector('.panel-label')?.textContent === panelLabel,
  )!
  return [...panel.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute('aria-label') ?? '')
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '', pathname: '/', search: '', hash: '', origin: 'https://app.test' },
  })
})
afterEach(cleanup)

describe('Stammdaten', () => {
  it('alle fünf Felder stehen da und tragen ihren Wert', () => {
    const { container } = zeige(person({ dn: 'Anton A.' }))
    expect(container.querySelector<HTMLInputElement>('#pers-fn')?.value).toBe('Anton')
    expect(container.querySelector<HTMLInputElement>('#pers-ln')?.value).toBe('Alt')
    expect(container.querySelector<HTMLInputElement>('#pers-dn')?.value).toBe('Anton A.')
    expect(container.querySelector<HTMLInputElement>('#pers-tel')?.value).toBe('0123')
    expect(container.querySelector<HTMLInputElement>('#pers-mail')?.value).toBe('anton@example.org')
  })

  it('jedes Feld schreibt nur sein eigenes', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.change(container.querySelector('#pers-fn')!, { target: { value: 'Andreas' } })
    expect(patches(dispatch)).toContainEqual({ fn: 'Andreas' })
    fireEvent.change(container.querySelector('#pers-mail')!, { target: { value: 'neu@x.de' } })
    expect(patches(dispatch)).toContainEqual({ mail: 'neu@x.de' })
  })

  it('ein fehlender Anzeigename ergibt ein leeres Feld, kein „undefined"', () => {
    const { container } = zeige(person({ dn: undefined }))
    expect(container.querySelector<HTMLInputElement>('#pers-dn')?.value).toBe('')
  })
})

describe('Geschlecht, Rolle, Gruppe', () => {
  it('das Geschlecht steht als Auswahl mit gedrücktem Zustand', () => {
    const { container } = zeige(person({ female: true }))
    expect(chip(container, t.schwester).getAttribute('aria-pressed')).toBe('true')
    expect(chip(container, t.bruder).getAttribute('aria-pressed')).toBe('false')
  })

  it('ein Tipp ändert es', () => {
    const { container, dispatch } = zeige(person({ female: false }))
    fireEvent.click(chip(container, t.schwester))
    expect(patches(dispatch)).toContainEqual({ female: true })
  })

  it('jede Rolle steht zur Wahl — genau die vier aus der Vorgabe', () => {
    const { container } = zeige(person({ role: 'aeltester' }))
    const rollenBlock = [...container.querySelectorAll('.pers-role-block')].find(
      (b) => b.querySelector('.field-label')?.textContent === t.rolle,
    )!
    expect([...rollenBlock.querySelectorAll('.role-chip')].map((b) => b.textContent)).toEqual(
      ROLE_ORDER.map((r) => t[ROLE_KEY[r]]),
    )
    const aktiv = rollenBlock.querySelector('.role-chip[aria-pressed="true"]')
    expect(aktiv?.textContent).toBe(t.rolleAeltester)
  })

  it('ein Tipp setzt die Rolle', () => {
    const { container, dispatch } = zeige(person({ role: 'verkuendiger' }))
    const rollenBlock = [...container.querySelectorAll('.pers-role-block')].find(
      (b) => b.querySelector('.field-label')?.textContent === t.rolle,
    )!
    const dag = [...rollenBlock.querySelectorAll('.role-chip')].find(
      (b) => b.textContent === t.rolleDag,
    )!
    fireEvent.click(dag)
    expect(patches(dispatch)).toContainEqual({ role: 'dienstamtgehilfe' })
  })

  it('die Gruppe lässt sich zuweisen und wieder lösen', () => {
    const { container, dispatch } = zeige(person())
    const wahl = container.querySelector<HTMLSelectElement>('#pers-grp')!
    expect([...wahl.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['—', 'Gruppe 1'])
    fireEvent.change(wahl, { target: { value: 'g1' } })
    expect(patches(dispatch)).toContainEqual({ grp: 'g1' })
    cleanup()
    const zweiter = zeige(person({ grp: 'g1' }))
    fireEvent.change(zweiter.container.querySelector('#pers-grp')!, { target: { value: '' } })
    expect(patches(zweiter.dispatch)).toContainEqual({ grp: null })
  })
})

describe('Familie / Haushalt', () => {
  it('ohne Verknüpfung stehen nur die anderen zur Auswahl — nicht man selbst', () => {
    const { container } = zeige(person())
    const wahl = container.querySelector<HTMLSelectElement>(`[aria-label="${t.familieHinzu}"]`)!
    const namen = [...wahl.querySelectorAll('option')].map((o) => o.textContent)
    expect(namen).toEqual([t.familieHinzu, 'Bernd Brand', 'Clara Cohn'])
  })

  it('eine Auswahl verknüpft', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.change(container.querySelector(`[aria-label="${t.familieHinzu}"]`)!, {
      target: { value: 'p-c' },
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setFamily', id: 'p-a', memberId: 'p-c', add: true,
    })
  })

  it('bereits Verknüpfte stehen als Chips und nicht mehr in der Auswahl', () => {
    const { container } = zeige(person({ fam: 'f1' }), {
      persons: [person({ fam: 'f1' }), { ...COHN, fam: 'f1' }, BRAND],
    })
    expect([...container.querySelectorAll('.fam-chip')].map((c) => c.textContent)).toEqual([
      'Clara Cohn✕',
    ])
    const wahl = container.querySelector<HTMLSelectElement>(`[aria-label="${t.familieHinzu}"]`)!
    expect([...wahl.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      t.familieHinzu, 'Bernd Brand',
    ])
  })

  it('ein Chip lässt sich lösen', () => {
    const { container, dispatch } = zeige(person({ fam: 'f1' }), {
      persons: [person({ fam: 'f1' }), { ...COHN, fam: 'f1' }],
    })
    fireEvent.click(container.querySelector('.fam-remove')!)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setFamily', id: 'p-a', memberId: 'p-c', add: false,
    })
  })

  it('erklärt, wozu die Verknüpfung dient — sie wirkt bei den Gesprächspartnern', () => {
    const { container } = zeige(person())
    expect(container.textContent).toContain(t.familieHint)
  })

  it('eine leere Auswahl verknüpft nichts', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.change(container.querySelector(`[aria-label="${t.familieHinzu}"]`)!, {
      target: { value: '' },
    })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'setFamily')).toBe(false)
  })
})

describe('Vollständigkeitsprobe: jeder Bereich hat seinen Schalter', () => {
  it('jeder feste Aufgabenbereich steht in der Aufgaben-Karte', () => {
    // Fehlte einer, ließe er sich nirgends setzen — der zugehörige Platz
    // bliebe für immer offen, ohne dass es auffiele.
    const { container } = zeige(person())
    const gezeigt = schalterLabels(container, t.aufgabenbereiche)
    expect(gezeigt).toHaveLength(QUALIFICATION_ORDER.length)
  })

  it('jeder Hilfsdienst mit eigenem Bereich steht in der Hilfsdienst-Karte', () => {
    const { container } = zeige(person())
    expect(schalterLabels(container, t.hilfsdienste)).toEqual(['Mikrofone', 'Ordner'])
  })

  it('die Gruppen-Rotation nicht — sie rotiert Gruppen statt Personen', () => {
    const { container } = zeige(person())
    expect(schalterLabels(container, t.hilfsdienste)).not.toContain('Reinigung')
  })

  it('jede feste Wachtturm-Rolle steht in ihrer eigenen Karte', () => {
    const { container } = zeige(person())
    // Die Karte trägt zusätzlich den Planer-Schalter.
    expect(schalterLabels(container, t.wtRollenLabel).length).toBe(WT_ROLE_ORDER.length + 1)
  })

  it('ein Schalter schreibt genau seinen Bereich', () => {
    const { container, dispatch } = zeige(person())
    const panel = [...container.querySelectorAll('.panel')].find(
      (p) => p.querySelector('.panel-label')?.textContent === t.hilfsdienste,
    )!
    const mik = [...panel.querySelectorAll('[role="switch"]')].find(
      (s) => s.getAttribute('aria-label') === 'Mikrofone',
    )!
    fireEvent.click(mik)
    const patch = patches(dispatch).at(-1)!
    expect(Object.keys(patch.priv).filter((k) => patch.priv[k])).toEqual([serviceQualKey('mik')])
  })

  it('ohne konfigurierte Dienste bleibt die Karte leer, aber vorhanden', () => {
    const { container } = zeige(person(), { services: [] })
    expect(schalterLabels(container, t.hilfsdienste)).toEqual([])
  })
})

describe('Löschen braucht zwei Tipps', () => {
  it('der erste löscht nicht, sondern nennt die Folge', () => {
    const { container, dispatch } = zeige(person())
    const knopf = container.querySelector<HTMLButtonElement>('.pers-delete')!
    expect(knopf.textContent).toBe(t.persLoeschen)
    fireEvent.click(knopf)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'removePerson')).toBe(false)
    expect(knopf.textContent).toContain('Anton Alt')
    expect(knopf.className).toContain('is-armed')
  })

  it('erst der zweite löscht', () => {
    const { container, dispatch } = zeige(person())
    const knopf = container.querySelector<HTMLButtonElement>('.pers-delete')!
    fireEvent.click(knopf)
    fireEvent.click(knopf)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removePerson', id: 'p-a' })
  })

  it('geht der Fokus weg, entschärft er sich wieder', () => {
    const { container, dispatch } = zeige(person())
    const knopf = container.querySelector<HTMLButtonElement>('.pers-delete')!
    fireEvent.click(knopf)
    fireEvent.blur(knopf)
    expect(knopf.textContent).toBe(t.persLoeschen)
    fireEvent.click(knopf)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'removePerson')).toBe(false)
  })
})

describe('Zurück und Konto-Karte', () => {
  it('„Alle Personen" führt zur Liste zurück', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(container.querySelector('.pers-back')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: null })
  })

  it('die Konto-Karte gibt es nur in der Produktion — im Demo gibt es keine Konten', () => {
    expect(zeige(person()).container.textContent).toContain(t.kontoCard)
    cleanup()
    expect(zeige(person(), { dataStatus: 'demo' }).container.textContent).not.toContain(t.kontoCard)
  })

  it('der Kopf nennt Namen, Rolle und Versammlung', () => {
    const { container } = zeige(person())
    expect(container.querySelector('.pers-detail-name')?.textContent).toBe('Anton Alt')
    expect(container.querySelector('.pers-detail-sub')?.textContent).toContain('Nordheim')
  })
})
