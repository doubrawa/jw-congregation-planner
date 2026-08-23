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
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { FsInstance, Group, Person, Week } from '../data/types'
import { AutoAssignPanel } from './AutoAssignPanel'
import { AuxCounselorPanel } from './AuxCounselorPanel'
import { FsPlan } from './FsPlan'

/**
 * **Die drei Panels des Planen-Screens, die noch keiner angefasst hatte.**
 *
 * Der gemeinsame Nenner ist „Leeren": eine Handlung, die nicht rückgängig zu
 * machen ist und die eine ganze Woche Arbeit wegwischt. Sie ist deshalb an
 * beiden Stellen (Zusammenkünfte und Treffpunkte) mit **Zwei-Tipp-Bestätigung**
 * abgesichert — und das ist eine Zusicherung, die man messen muss, nicht eine,
 * die man sieht: Ein Fehler daran fällt erst auf, wenn die Planung weg ist.
 *
 * Dazu der Ratgeber der Zusätzlichen Klasse (S-38 Abs. 26) und die
 * Wochen-Bearbeitung der Treffpunkte samt Gruppenaufseher-Beschränkung.
 */

const t = dict('de')

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '', priv: emptyQualifications(),
})

const ANTON = person('p-a', 'Anton', 'Alt')
const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', ov: null, as: null },
  { id: 'g2', name: 'Gruppe 2', ov: null, as: null },
]

function woche(): Week {
  return {
    range: '1.–7. September', book: '', start: '2026-09-07', current: false,
    mid: { date: '', end: '20:45', sections: [], helpers: {} },
    we: { date: '', end: '11:45', sections: [], helpers: {} },
  }
}

function buehne(kind: 'auto' | 'aux' | 'fs', over: Partial<AppState> = {}, onlyGroup: string | null = null) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [ANTON], services: [], groups: GRUPPEN, absences: [], pendingIds: [],
    weeks: [woche()], fsWeeks: [[]], week: 0,
    fsBase: new Date(2026, 8, 7, 12, 0),
    congregation: { name: 'Test', hall: 'Königreichssaal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {kind === 'auto' && <AutoAssignPanel />}
            {kind === 'aux' && <AuxCounselorPanel meeting={state.weeks[state.week]!.mid} />}
            {kind === 'fs' && <FsPlan onlyGroup={onlyGroup} />}
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const leerenKnoepfe = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLButtonElement>('.plan-auto-btn--clear')]

afterEach(cleanup)

describe('Auto-Zuteilen: Aufgaben und Hilfsdienste sind getrennt', () => {
  it('zwei Zeilen, jede mit ihrer Beschriftung', () => {
    const { container } = buehne('auto')
    expect([...container.querySelectorAll('.plan-auto-label')].map((x) => x.textContent)).toEqual([
      t.navAufgaben, t.hilfsdienste,
    ])
  })

  it('„Automatisch" der ersten Zeile besetzt nur die Programmpunkte', () => {
    const { container, dispatch } = buehne('auto')
    fireEvent.click(container.querySelectorAll('.plan-auto-btn--primary')[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'autoAssign', scope: 'parts' })
  })

  it('und die der zweiten nur die Hilfsdienste', () => {
    const { container, dispatch } = buehne('auto')
    fireEvent.click(container.querySelectorAll('.plan-auto-btn--primary')[1]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'autoAssign', scope: 'helpers' })
  })
})

describe('„Leeren" braucht zwei Tipps — es macht eine Woche Arbeit zunichte', () => {
  it('der erste Tipp leert noch nichts, sondern fragt nach', () => {
    const { container, dispatch } = buehne('auto')
    const knopf = leerenKnoepfe(container)[0]!
    expect(knopf.textContent).toBe(t.leeren)
    fireEvent.click(knopf)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'clearAssignments')).toBe(false)
    expect(knopf.textContent).toBe(t.leerenSicher)
    expect(knopf.className).toContain('is-armed')
  })

  it('erst der zweite leert wirklich', () => {
    const { container, dispatch } = buehne('auto')
    const knopf = leerenKnoepfe(container)[0]!
    fireEvent.click(knopf)
    fireEvent.click(knopf)
    expect(dispatch).toHaveBeenCalledWith({ type: 'clearAssignments', scope: 'parts' })
  })

  it('danach ist er wieder entschärft — ein dritter Tipp leert nicht noch einmal', () => {
    const { container, dispatch } = buehne('auto')
    const knopf = leerenKnoepfe(container)[0]!
    fireEvent.click(knopf)
    fireEvent.click(knopf)
    fireEvent.click(knopf)
    expect(dispatch.mock.calls.filter((c) => c[0].type === 'clearAssignments')).toHaveLength(1)
    expect(knopf.textContent).toBe(t.leerenSicher) // scharf für den nächsten Versuch
  })

  it('geht der Fokus weg, entschärft er sich — ein Tipp daneben nimmt die Frage zurück', () => {
    const { container, dispatch } = buehne('auto')
    const knopf = leerenKnoepfe(container)[0]!
    fireEvent.click(knopf)
    fireEvent.blur(knopf)
    expect(knopf.textContent).toBe(t.leeren)
    fireEvent.click(knopf)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'clearAssignments')).toBe(false)
  })

  it('„Automatisch" entschärft es ebenfalls — sonst leerte der nächste Tipp die Neuverteilung', () => {
    const { container, dispatch } = buehne('auto')
    const leeren = leerenKnoepfe(container)[0]!
    fireEvent.click(leeren)
    fireEvent.click(container.querySelectorAll('.plan-auto-btn--primary')[0]!)
    expect(leeren.textContent).toBe(t.leeren)
    fireEvent.click(leeren)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'clearAssignments')).toBe(false)
  })

  it('die beiden Zeilen sind unabhängig scharf — eine Frage gilt nicht für beide', () => {
    const { container } = buehne('auto')
    const [aufgaben, dienste] = leerenKnoepfe(container)
    fireEvent.click(aufgaben!)
    expect(aufgaben!.textContent).toBe(t.leerenSicher)
    expect(dienste!.textContent).toBe(t.leeren)
  })
})

describe('Der Ratgeber der Zusätzlichen Klasse (S-38 Abs. 26)', () => {
  const mitKlasse = () => {
    const w = woche()
    w.mid.sections = [{
      label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
      items: [{ num: 4, title: 'Gespräche beginnen', meta: '', names: [{ name: '', bereichsKey: 'schulung' }] }],
    }]
    return syncAuxSlots([w], true)
  }

  it('ohne eingerichtete Klasse steht die Karte gar nicht da', () => {
    const { container } = buehne('aux', { weeks: [woche()] })
    expect(container.querySelector('.panel')).toBeNull()
  })

  it('mit Klasse steht sie da — mit dem Hinweis aus S-38', () => {
    const { container } = buehne('aux', { weeks: mitKlasse(), auxClass: true })
    expect(container.querySelector('.panel-label')?.textContent).toBe(t.auxKlassen)
    expect(container.querySelector('.plan-item-title')?.textContent).toBe(t.auxRatgeber)
    expect(container.querySelector('.panel-hint')?.textContent).toBe(t.auxRatgeberHint)
  })

  it('offen zeigt sie die Aufforderung, ein Tipp öffnet den eigenen Slot-Typ', () => {
    const { container, dispatch } = buehne('aux', { weeks: mitKlasse(), auxClass: true })
    const chip = container.querySelector('.slot-chip')!
    expect(chip.textContent).toBe(t.zuteilenChip)
    fireEvent.click(chip)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({ kind: 'ratgeber', wi: 0, tab: 'mid', priv: 'ratgeber' }),
    })
  })

  it('besetzt trägt sie den Namen und ein Bestätigungs-Zeichen', () => {
    const weeks = mitKlasse()
    weeks[0]!.mid.auxRatgeber = { name: 'Anton Alt', pid: 'p-a' }
    const { container } = buehne('aux', { weeks, auxClass: true, pendingIds: ['p-a'] })
    const chip = container.querySelector('.slot-chip')!
    expect(chip.textContent).toContain('Anton Alt')
    expect(chip.querySelector('.slot-status')?.textContent).toBe('…')
  })
})

describe('Treffpunkte planen', () => {
  const inst = (over: Partial<FsInstance> = {}): FsInstance =>
    ({ id: 'f1', ruleId: 'r1', wd: 6, time: '09:30', place: 'Saal', leader: '', grp: '', ...over }) as FsInstance

  it('nennt vorweg, dass Änderungen nur für diese Woche gelten', () => {
    const { container } = buehne('fs')
    expect(container.querySelector('.plan-hint')?.textContent).toBe(t.fsNurWoche)
  })

  it('jeder Tag bekommt eine Karte, überschrieben mit dem echten Datum', () => {
    const { container } = buehne('fs', { fsWeeks: [[inst({ wd: 1 }), inst({ id: 'f2', wd: 6 })]] })
    const labels = [...container.querySelectorAll('.panel-label')].map((x) => x.textContent)
    expect(labels[0]).toContain('Montag')
    expect(labels[0]).toContain('7. September')
    expect(labels[1]).toContain('Samstag')
  })

  it('ein Versammlungstreffpunkt heißt so, ein Gruppentreffpunkt nach seiner Gruppe', () => {
    const { container } = buehne('fs', {
      fsWeeks: [[inst({ grp: '' }), inst({ id: 'f2', grp: 'g1', time: '10:00' })]],
    })
    expect([...container.querySelectorAll('.fs-edit-title')].map((x) => x.textContent)).toEqual([
      t.fsVers, 'Gruppe 1',
    ])
  })

  it('Zeit und Ort lassen sich für diese Woche ändern', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: [[inst()]] })
    fireEvent.change(container.querySelector('.fs-select--time')!, { target: { value: '10:00' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'fsInstUpdate', wi: 0, id: 'f1', patch: { time: '10:00' },
    })
    fireEvent.change(container.querySelector('.fs-input')!, { target: { value: 'Marktplatz' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'fsInstUpdate', wi: 0, id: 'f1', patch: { place: 'Marktplatz' },
    })
  })

  it('ein Treffpunkt lässt sich aus der Woche entfernen', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: [[inst()]] })
    fireEvent.click(container.querySelector('.fs-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsInstRemove', wi: 0, id: 'f1' })
  })

  it('offene Leitungen stehen als Banner darüber — mit Tag und Treffpunkt', () => {
    const { container } = buehne('fs', { fsWeeks: [[inst(), inst({ id: 'f2', leader: 'Anton Alt' })]] })
    expect(container.querySelector('.plan-banner-count')?.textContent).toBe('1')
    expect(container.querySelector('.plan-open-label')?.textContent).toContain(t.fsVers)
  })

  it('ist jede Leitung vergeben, steht das Banner nicht da', () => {
    const { container } = buehne('fs', { fsWeeks: [[inst({ leader: 'Anton Alt' })]] })
    expect(container.querySelector('.plan-open')).toBeNull()
  })

  it('ein Freitext-Leiter bekommt kein Bestätigungs-Zeichen — er hat die App nicht', () => {
    const { container } = buehne('fs', {
      fsWeeks: [[inst({ leader: 'Kreisaufseher', lext: true })]],
    })
    expect(container.querySelector('.slot-chip')?.textContent).toContain('Kreisaufseher')
    expect(container.querySelector('.slot-status')).toBeNull()
  })

  it('eine Person schon — für sie gibt es den Bestätigungs-Flow', () => {
    const { container } = buehne('fs', {
      fsWeeks: [[inst({ leader: 'Anton Alt', lpid: 'p-a' })]],
    })
    expect(container.querySelector('.slot-status')).toBeTruthy()
  })

  it('„Leeren" braucht auch hier zwei Tipps', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: [[inst({ leader: 'Anton Alt' })]] })
    const knopf = leerenKnoepfe(container)[0]!
    fireEvent.click(knopf)
    expect(dispatch.mock.calls.some((c) => c[0].type === 'fsClear')).toBe(false)
    fireEvent.click(knopf)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsClear', onlyGroup: null })
  })

  it('ein neuer Treffpunkt gilt nur für diese Woche und nimmt den Saal dieser Versammlung', () => {
    const { container, dispatch } = buehne('fs')
    fireEvent.click(container.querySelector('.fs-add-btn')!)
    const aktion = dispatch.mock.calls.find((c) => c[0].type === 'fsInstAdd')![0]
    expect(aktion.inst).toMatchObject({
      ruleId: null, manual: true, grp: '', wd: 6, time: '09:30',
      place: 'Königreichssaal', leader: '',
    })
  })

  it('zwei nacheinander angelegte bekommen verschiedene Kennungen — daran hängt die Bestätigung', () => {
    const { container, dispatch } = buehne('fs')
    fireEvent.click(container.querySelector('.fs-add-btn')!)
    fireEvent.click(container.querySelector('.fs-add-btn')!)
    const ids = dispatch.mock.calls.filter((c) => c[0].type === 'fsInstAdd').map((c) => c[0].inst.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('ein eingegebener Ort schlägt den Saal — und das Feld wird danach frei', () => {
    const { container, dispatch } = buehne('fs')
    const feld = container.querySelectorAll<HTMLInputElement>('.fs-add .fs-input')[0]!
    fireEvent.change(feld, { target: { value: '  Marktplatz  ' } })
    fireEvent.click(container.querySelector('.fs-add-btn')!)
    expect(dispatch.mock.calls.find((c) => c[0].type === 'fsInstAdd')![0].inst.place).toBe('Marktplatz')
    expect(feld.value).toBe('')
  })
})

describe('Der Gruppenaufseher plant nur seine eigene Gruppe', () => {
  const inst = (over: Partial<FsInstance> = {}): FsInstance =>
    ({ id: 'f1', ruleId: 'r1', wd: 6, time: '09:30', place: 'Saal', leader: '', grp: '', ...over }) as FsInstance

  const beide = [[
    inst({ id: 'f1', grp: 'g1' }),
    inst({ id: 'f2', grp: 'g2', time: '10:00' }),
    inst({ id: 'f3', grp: '', time: '10:30' }),
  ]]

  it('sieht die fremde Gruppe und den Versammlungstreffpunkt gar nicht', () => {
    const { container } = buehne('fs', { fsWeeks: beide }, 'g1')
    expect([...container.querySelectorAll('.fs-edit-title')].map((x) => x.textContent)).toEqual([
      'Gruppe 1',
    ])
  })

  it('sein Banner zählt nur seine offenen Leitungen', () => {
    const { container } = buehne('fs', { fsWeeks: beide }, 'g1')
    expect(container.querySelector('.plan-banner-count')?.textContent).toBe('1')
  })

  it('„Leeren" und „Automatisch" wirken nur auf seine Gruppe', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: beide }, 'g1')
    fireEvent.click(container.querySelector('.plan-auto-btn--primary')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: 'g1' })
    const knopf = leerenKnoepfe(container)[0]!
    fireEvent.click(knopf)
    fireEvent.click(knopf)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsClear', onlyGroup: 'g1' })
  })

  it('ein neuer Treffpunkt gehört automatisch seiner Gruppe — die Wahl entfällt', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: beide }, 'g1')
    // Ohne Gruppen-Auswahl: er kann gar keine andere wählen.
    const auswahlen = [...container.querySelectorAll('.fs-add .fs-select')]
    expect(auswahlen.every((s) => s.getAttribute('aria-label') !== t.fsVers)).toBe(true)
    fireEvent.click(container.querySelector('.fs-add-btn')!)
    expect(dispatch.mock.calls.find((c) => c[0].type === 'fsInstAdd')![0].inst.grp).toBe('g1')
  })

  it('der Planer dagegen wählt die Gruppe — Versammlung oder eine der angelegten', () => {
    const { container } = buehne('fs', { fsWeeks: beide })
    const wahl = [...container.querySelectorAll('.fs-add .fs-select')].find(
      (s) => s.getAttribute('aria-label') === t.fsVers,
    )!
    expect([...wahl.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      t.fsVers, 'Gruppe 1', 'Gruppe 2',
    ])
  })
})
