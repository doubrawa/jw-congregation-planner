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
import type { Group, Person } from '../data/types'
import { CongregationPanel } from './CongregationPanel'
import { EinstellungenScreen } from './EinstellungenScreen'
import { GroupsPanel } from './GroupsPanel'
import { LanguagePanel } from './LanguagePanel'
import { RemindersPanel } from './RemindersPanel'

/**
 * **Die Einstellungen — hier stellt der Koordinator ein, was für alle gilt.**
 *
 * `meeting-times.ts` prüft das Zerlegen und Zusammensetzen der Zeiten für sich;
 * geprüft wird hier, was der Screen daraus macht. Drei Dinge tragen Fachlogik:
 *
 * - Die **Zusammenkunftszeit** wird als *ein* kanonischer String gespeichert
 *   („Di 19:00 · So 10:00"). Ändert man nur den Tag der Wochenmitte, muss der
 *   Rest unverändert mitgeschrieben werden — sonst verliert das Wochenende
 *   seine Zeit.
 * - **Aufseher und Gehilfe** einer Predigtdienstgruppe sind nicht beliebig
 *   besetzbar: Aufseher nur Älteste/Dienstamtgehilfen, Gehilfe keine Schwester.
 * - Der **Gruppenaufseher** sieht in den Einstellungen ausschließlich den
 *   Grundplan seiner Gruppe — die Versammlungsdaten gehen ihn nichts an.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: vi.fn() }))

const t = dict('de')

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(),
  grp: null, ...over,
})

const AELTESTER = person('p-ae', 'Anton', 'Alt', { role: 'aeltester' })
const GEHILFE = person('p-dg', 'Bernd', 'Brand', { role: 'dienstamtgehilfe' })
const BRUDER = person('p-v', 'Carlo', 'Cohn')
const SCHWESTER = person('p-s', 'Dora', 'Dietz', { female: true })
const PERSONEN = [AELTESTER, GEHILFE, BRUDER, SCHWESTER]

const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: 'p-ae', as: null }]

function zeige(
  was: 'cong' | 'groups' | 'reminders' | 'lang' | 'screen',
  over: Partial<AppState> = {},
) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'einstellungen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-ae', planner: true,
    persons: PERSONEN, groups: GRUPPEN, services: [],
    weeks: [], fsWeeks: [], fsRules: [], absences: [],
    congregation: { name: 'Nordheim', hall: 'Königreichssaal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {was === 'cong' && <CongregationPanel />}
            {was === 'groups' && <GroupsPanel />}
            {was === 'reminders' && <RemindersPanel />}
            {was === 'lang' && <LanguagePanel />}
            {was === 'screen' && <EinstellungenScreen />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const patches = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => c[0].type === 'updateCongregation').map((c) => c[0].patch)

afterEach(cleanup)

describe('Versammlung: Name und Saal', () => {
  it('stehen in Feldern und werden beim Tippen gespeichert', () => {
    const { container, dispatch } = zeige('cong')
    const name = container.querySelector<HTMLInputElement>('#cong-name')!
    expect(name.value).toBe('Nordheim')
    fireEvent.change(name, { target: { value: 'Südheim' } })
    expect(patches(dispatch)).toContainEqual({ name: 'Südheim' })
    fireEvent.change(container.querySelector('#cong-hall')!, { target: { value: 'Saal 2' } })
    expect(patches(dispatch)).toContainEqual({ hall: 'Saal 2' })
  })
})

describe('Zusammenkunftszeiten', () => {
  it('Tag und Uhrzeit stehen je Zusammenkunft getrennt zur Wahl', () => {
    const { container } = zeige('cong')
    const tage = [...container.querySelectorAll<HTMLSelectElement>('.cong-day')]
    const zeiten = [...container.querySelectorAll<HTMLSelectElement>('.cong-time')]
    expect(tage.map((s) => s.value)).toEqual(['Di', 'So'])
    expect(zeiten.map((s) => s.value)).toEqual(['19:00', '10:00'])
  })

  it('die Wochentage stehen in der Sprache des Lesers, gespeichert wird das Kürzel', () => {
    const { container } = zeige('cong')
    const wahl = container.querySelector<HTMLSelectElement>('.cong-day')!
    const optionen = [...wahl.querySelectorAll('option')]
    expect(optionen[0]?.textContent).toBe('Montag')
    expect(optionen[0]?.value).toBe('Mo')
    expect(optionen).toHaveLength(7)
  })

  it('ein neuer Tag der Wochenmitte lässt das Wochenende unangetastet', () => {
    // Beides steht in EINEM String — wird der Rest nicht mitgeschrieben, ist er weg.
    const { container, dispatch } = zeige('cong')
    fireEvent.change(container.querySelectorAll('.cong-day')[0]!, { target: { value: 'Do' } })
    expect(patches(dispatch)).toContainEqual({ meetings: 'Do 19:00 · So 10:00' })
  })

  it('und eine neue Wochenend-Uhrzeit die Wochenmitte ebenso', () => {
    const { container, dispatch } = zeige('cong')
    fireEvent.change(container.querySelectorAll('.cong-time')[1]!, { target: { value: '09:30' } })
    expect(patches(dispatch)).toContainEqual({ meetings: 'Di 19:00 · So 09:30' })
  })

  it('eine krumme Bestandszeit bleibt wählbar — sonst spränge sie beim Öffnen um', () => {
    const { container } = zeige('cong', {
      congregation: { name: 'N', hall: 'S', meetings: 'Di 19:20 · So 10:00' },
    })
    const wahl = container.querySelector<HTMLSelectElement>('.cong-time')!
    expect(wahl.value).toBe('19:20')
    expect([...wahl.querySelectorAll('option')].map((o) => o.value)).toContain('19:20')
  })

  it('unlesbare Bestandsdaten fallen auf Di 19:00 / So 10:00 zurück, statt leer zu bleiben', () => {
    const { container } = zeige('cong', {
      congregation: { name: 'N', hall: 'S', meetings: 'völlig kaputt' },
    })
    expect([...container.querySelectorAll<HTMLSelectElement>('.cong-day')].map((s) => s.value)).toEqual([
      'Di', 'So',
    ])
  })
})

describe('Zusätzliche Klasse (S-38 Abs. 26)', () => {
  it('ist ein Schalter der Versammlung, nicht des Geräts — mit der Begründung darunter', () => {
    const { container } = zeige('cong')
    const schalter = container.querySelector('.rem-toggle-row [role="switch"]')!
    expect(schalter.getAttribute('aria-checked')).toBe('false')
    expect(container.querySelector('.panel-hint')?.textContent).toBe(t.auxDesc)
  })

  it('ein Tipp schaltet sie ein, ein weiterer aus', () => {
    const { container, dispatch } = zeige('cong', { auxClass: false })
    fireEvent.click(container.querySelector('.rem-toggle-row [role="switch"]')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setAuxClass', on: true })
    cleanup()
    const zweiter = zeige('cong', { auxClass: true })
    fireEvent.click(zweiter.container.querySelector('.rem-toggle-row [role="switch"]')!)
    expect(zweiter.dispatch).toHaveBeenCalledWith({ type: 'setAuxClass', on: false })
  })
})

describe('Predigtdienstgruppen', () => {
  it('jede Gruppe nennt Namen und Mitgliederzahl', () => {
    const { container } = zeige('groups', {
      persons: [{ ...AELTESTER, grp: 'g1' }, { ...BRUDER, grp: 'g1' }, SCHWESTER],
    })
    expect(container.querySelector('.grp-name')?.textContent).toBe('Gruppe 1')
    expect(container.querySelector('.grp-count')?.textContent).toBe('2 Mitglieder')
  })

  it('bei genau einem Mitglied die Einzahl — nicht „1 Mitglieder"', () => {
    const { container } = zeige('groups', { persons: [{ ...AELTESTER, grp: 'g1' }] })
    expect(container.querySelector('.grp-count')?.textContent).toBe(t.mitglied1)
  })

  it('als Aufseher stehen nur Älteste und Dienstamtgehilfen zur Wahl', () => {
    const { container } = zeige('groups')
    const ov = container.querySelectorAll<HTMLSelectElement>('.mem-select')[0]!
    const namen = [...ov.querySelectorAll('option')].map((o) => o.textContent)
    expect(namen).toEqual(['—', 'Anton Alt', 'Bernd Brand'])
  })

  it('als Gehilfe jeder Bruder — aber keine Schwester', () => {
    const { container } = zeige('groups')
    const as = container.querySelectorAll<HTMLSelectElement>('.mem-select')[1]!
    const namen = [...as.querySelectorAll('option')].map((o) => o.textContent)
    expect(namen).toEqual(['—', 'Anton Alt', 'Bernd Brand', 'Carlo Cohn'])
    expect(namen).not.toContain('Dora Dietz')
  })

  it('„—" nimmt die Besetzung zurück — als null, nicht als leerer String', () => {
    const { container, dispatch } = zeige('groups')
    fireEvent.change(container.querySelectorAll('.mem-select')[0]!, { target: { value: '' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateGroup', id: 'g1', patch: { ov: null },
    })
  })

  it('eine Gruppe lässt sich löschen', () => {
    const { container, dispatch } = zeige('groups')
    fireEvent.click(container.querySelector('.svc-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeGroup', id: 'g1' })
  })

  it('eine neue Gruppe zählt weiter — nicht wieder bei 1', () => {
    const { container, dispatch } = zeige('groups', {
      groups: [
        { id: 'g1', name: 'Gruppe 1', ov: null, as: null },
        { id: 'g3', name: 'Gruppe 3', ov: null, as: null },
      ],
    })
    fireEvent.click(container.querySelector('.grp-add')!)
    expect(dispatch.mock.calls.find((c) => c[0].type === 'addGroup')![0].group.name).toBe('Gruppe 4')
  })

  it('ohne Gruppen fängt sie bei 1 an', () => {
    const { container, dispatch } = zeige('groups', { groups: [] })
    fireEvent.click(container.querySelector('.grp-add')!)
    expect(dispatch.mock.calls.find((c) => c[0].type === 'addGroup')![0].group.name).toBe('Gruppe 1')
  })
})

describe('Erinnerungen', () => {
  const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.svc-row')]

  /*
   * Drei Zeilen, nicht mehr vier. Die erste war „Bei Zuteilung · Sofort" (T74)
   * und steuerte die Mitteilung „Zuteilung gesendet" an die **Planer**. Mit
   * T99 gibt es die nicht mehr — der Planer drückt jetzt „Plan senden", und
   * die Nachricht geht an die eingeteilte Person. Damit steuerte der Schalter
   * nichts mehr, und ein Schalter ohne Wirkung ist schlimmer als keiner.
   */
  it('drei Zeilen: erste, letzte, wiederholen', () => {
    const { container } = zeige('reminders')
    expect(zeilen(container).map((r) => r.querySelector('.svc-name')?.textContent)).toEqual([
      t.remErste, t.remLetzte, t.remRepeat,
    ])
  })

  it('die Tage lassen sich in Einerschritten verstellen', () => {
    const { container, dispatch } = zeige('reminders')
    const erste = zeilen(container)[0]!
    fireEvent.click(erste.querySelector(`[aria-label="${t.a11yIncrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeReminder', key: 'first', delta: 1 })
    fireEvent.click(erste.querySelector(`[aria-label="${t.a11yDecrease}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'changeReminder', key: 'first', delta: -1 })
  })

  it('unter der Zahl steht, was sie bedeutet — in Worten', () => {
    const { container } = zeige('reminders', {
      reminders: { first: 7, last: 1, repeat: false },
    })
    expect(zeilen(container)[0]!.querySelector('.svc-sub')?.textContent).toBe('7 Tage vorher')
    expect(zeilen(container)[1]!.querySelector('.svc-sub')?.textContent).toBe(t.remTagVorher)
  })

  it('null Tage heißt „am Tag der Aufgabe", nicht „0 Tage vorher"', () => {
    const { container } = zeige('reminders', {
      reminders: { first: 7, last: 0, repeat: false },
    })
    expect(zeilen(container)[1]!.querySelector('.svc-sub')?.textContent).toBe(t.remAmTag)
  })

  it('„täglich wiederholen" ist der letzte Schalter', () => {
    const { container, dispatch } = zeige('reminders')
    fireEvent.click(zeilen(container)[2]!.querySelector('[role="switch"]')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleReminderRepeat' })
  })
})

describe('Sprache', () => {
  it('nennt die Versammlungssprache und führt ins Sheet', () => {
    const { container, dispatch } = zeige('lang', { congLang: 'Deutsch' })
    expect(container.querySelector('.lang-card-val')?.textContent).toContain('Deutsch')
    fireEvent.click(container.querySelector('.lang-card-row')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openLangSheet' })
  })

  it('weitere Programmsprachen stehen als Chips und lassen sich entfernen', () => {
    const { container, dispatch } = zeige('lang', { progLangs: ['Englisch', 'Spanisch'] })
    const chips = [...container.querySelectorAll('.proglang-chip')]
    expect(chips).toHaveLength(2)
    fireEvent.click(chips[0]!.querySelector('.proglang-chip-x')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeProgLang', name: 'Englisch' })
  })

  it('„hinzufügen" öffnet dasselbe Sheet im anderen Modus — sonst überschriebe es die Hauptsprache', () => {
    const { container, dispatch } = zeige('lang')
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === t.hinzufuegen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'openLangSheet', mode: 'alt' })
  })

  it('ohne weitere Sprachen bleibt nur der Hinzufügen-Knopf stehen', () => {
    const { container } = zeige('lang', { progLangs: [] })
    expect(container.querySelectorAll('.proglang-chip')).toHaveLength(0)
  })
})

describe('Wer welche Einstellungen sieht', () => {
  it('der Planer bekommt alle sieben Panels', () => {
    const { container } = zeige('screen')
    const ueberschriften = [...container.querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(ueberschriften).toContain(t.versammlungCard)
    expect(ueberschriften).toContain(t.gruppenCard)
    expect(ueberschriften).toContain(t.spracheCard)
    expect(ueberschriften).toContain(t.erinnerungenCard)
  })

  it('der Gruppenaufseher nur den Grundplan — Versammlungsdaten gehen ihn nichts an', () => {
    const { container } = zeige('screen', {
      planner: false,
      personId: 'p-ae', // Aufseher der Gruppe g1
    })
    const ueberschriften = [...container.querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(ueberschriften).not.toContain(t.versammlungCard)
    expect(ueberschriften).not.toContain(t.gruppenCard)
    expect(ueberschriften).not.toContain(t.erinnerungenCard)
  })

  it('der Kopf nennt die Versammlung — man sieht, worauf man gerade schreibt', () => {
    const { container } = zeige('screen')
    expect(container.querySelector('.screen-subtitle')?.textContent).toContain('Nordheim')
  })
})
