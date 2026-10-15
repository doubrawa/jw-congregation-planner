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
import { demoZustand } from '../../tests/testdaten/demo-start'
import { syncAuxSlots } from '../data/aux-class'
import { fsTaskKey } from '../data/fs'
import { emptyQualifications } from '../data/helpers'
import { ratgeberKey } from '../data/planning'
import { dict } from '../i18n/ui'
import type { Absence, FsInstance, Group, Person, Week } from '../data/types'
import { AutoAssignRow } from './AutoAssignRow'
import { AuxCounselorPanel } from './AuxCounselorPanel'
import { FsPlan } from './FsPlan'
import { TreffpunkteAutomatikBlatt } from './TreffpunkteAutomatikBlatt'

/**
 * **Die drei Panels des Planen-Screens, die noch keiner angefasst hatte.**
 *
 * Der gemeinsame Nenner ist „Leeren": eine Handlung, die nicht rückgängig zu
 * machen ist und die eine ganze Woche Arbeit wegwischt. Sie ist deshalb an
 * beiden Stellen (Zusammenkünfte und Treffpunkte) mit **Zwei-Tipp-Bestätigung**
 * abgesichert — und das ist eine Zusicherung, die man messen muss, nicht eine,
 * die man sieht: Ein Fehler daran fällt erst auf, wenn die Planung weg ist.
 *
 * Dazu der Ratgeber der Zusätzlichen Klasse (S-38 Abs. 27) und die
 * Wochen-Bearbeitung der Treffpunkte samt Gruppenaufseher-Beschränkung.
 */

const t = dict('de')

// Die Blätter lassen sich nach unten wegwischen; die Geste fragt zuerst, ob wir
// am Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '', priv: emptyQualifications(),
})

const ANTON = person('p-a', 'Anton', 'Alt')
const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null },
  { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]

function woche(): Week {
  return {
    range: '1.–7. September', book: '', start: '2026-09-07', 
    mid: { date: '', end: '20:45', sections: [], helpers: {} },
    we: { date: '', end: '11:45', sections: [], helpers: {} },
  }
}

function buehne(kind: 'auto' | 'aux' | 'fs' | 'fsAuto', over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [ANTON], services: [], groups: GRUPPEN, absences: [], confirmations: {},
    weeks: [woche()], fsWeeks: [[]], week: 0,
    congregation: { name: 'Test', hall: 'Königreichssaal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            {kind === 'auto' && (
              // Zwei Zeilen, wie im Predigtdienst Treffpunkte und Schichten.
              <div className="plan-auto">
                <AutoAssignRow
                  label={t.navAufgaben}
                  automatisch={() => dispatch({ type: 'autoAssign', scope: 'parts' })}
                  leeren={() => dispatch({ type: 'clearAssignments', scope: 'parts' })}
                />
                <AutoAssignRow
                  label={t.hilfsdienste}
                  automatisch={() => dispatch({ type: 'autoAssign', scope: 'helpers' })}
                  leeren={() => dispatch({ type: 'clearAssignments', scope: 'helpers' })}
                />
              </div>
            )}
            {kind === 'aux' && <AuxCounselorPanel meeting={state.weeks[state.week]!.mid} />}
            {kind === 'fs' && <FsPlan />}
            {kind === 'fsAuto' && <TreffpunkteAutomatikBlatt onClose={vi.fn()} />}
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

/*
 * Welche Bereiche „Automatisch" bei den Zusammenkünften füllt, entscheiden seit
 * T121 (Phase 5c) die Kästchen im Blatt — `AutomatischBlatt.test.tsx`. Hier
 * bleibt die Zeile, die der Predigtdienst weiter nutzt.
 */
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

describe('Der Ratgeber der Zusätzlichen Klasse (S-38 Abs. 27)', () => {
  const mitKlasse = () => {
    const w = woche()
    w.mid.sections = [{
      label: 'UNS IM DIENST VERBESSERN', farbe: 'gold',
      items: [{ iid: 'i100', num: 4, title: 'Gespräche beginnen', meta: '', names: [{ name: '', bereichsKey: 'schulung' }] }],
    }]
    return syncAuxSlots([w], true)
  }

  it('ohne eingerichtete Klasse steht die Karte gar nicht da', () => {
    const { container } = buehne('aux', { weeks: [woche()] })
    expect(container.querySelector('.prog-abschnitt')).toBeNull()
  })

  it('mit Klasse steht sie da — mit dem Hinweis aus S-38', () => {
    const { container } = buehne('aux', { weeks: mitKlasse(), auxClass: true })
    expect(container.querySelector('.prog-abschnitt-name')?.textContent).toBe(t.auxKlassen)
    expect(container.querySelector('.platz-rolle')?.textContent).toBe(t.auxRatgeber)
    expect(container.querySelector('.panel-hint')?.textContent).toBe(t.auxRatgeberHint)
  })

  it('offen zeigt sie die Aufforderung, ein Tipp öffnet den eigenen Slot-Typ', () => {
    const { container, dispatch } = buehne('aux', { weeks: mitKlasse(), auxClass: true })
    const platz = container.querySelector('.platz')!
    expect(platz.className).toContain('is-offen')
    expect(platz.querySelector('.platz-name')?.textContent).toBe(t.spurZuteilen)
    fireEvent.click(platz)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({ kind: 'ratgeber', wi: 0, tab: 'mid', priv: 'ratgeber' }),
    })
  })

  it('besetzt trägt sie den Namen und die Lage seiner Zusage', () => {
    const weeks = mitKlasse()
    weeks[0]!.mid.auxRatgeber = { name: 'Anton Alt', pid: 'p-a' }
    const wartet = buehne('aux', { weeks, auxClass: true }).container.querySelector('.platz')!
    expect(wartet.querySelector('.platz-name')?.textContent).toBe('Anton Alt')
    expect(wartet.className).toContain('is-wartet')
    cleanup()

    const zugesagt = buehne('aux', {
      weeks, auxClass: true, confirmations: { [ratgeberKey('2026-09-07', 'mid')]: 'bestätigt' },
    }).container.querySelector('.platz')!
    expect(zugesagt.className).toContain('is-voll')
  })
})

const inst = (over: Partial<FsInstance> = {}): FsInstance =>
  ({ id: 'f1', ruleId: 'r1', wd: 6, time: '09:30', place: 'Saal', leader: '', grp: null, ...over }) as FsInstance
/** Anton leitet — als Person der Versammlung, nicht als Freitext. */
const antons = (over: Partial<FsInstance> = {}): FsInstance => inst({ leader: 'Anton Alt', lpid: 'p-a', ...over })
const titel = (c: HTMLElement) => [...c.querySelectorAll('.treff-titel')].map((x) => x.textContent)
const plaetze = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.treff-leiter-zeile .platz')]
const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')
/** Öffnet „Treffpunkt für diese Woche". */
const neu = (c: HTMLElement) => fireEvent.click(c.querySelector('.knopf-neu')!)
const hinzufuegen = () => fireEvent.click(blatt()!.querySelector('.sheet-fuss .knopf-haupt')!)
const angelegt = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => c[0].type === 'fsInstAdd').map((c) => c[0].inst as FsInstance)

describe('Treffpunkte planen (T121, Entwurf `GTreffpunktePlanen`)', () => {
  it('nennt vorweg, dass Änderungen nur für diese Woche gelten', () => {
    const { container } = buehne('fs')
    expect(container.querySelector('.klein-text')?.textContent).toBe(t.fsNurWoche)
  })

  it('ohne Treffpunkte sagt eine Karte, dass es keine gibt', () => {
    const { container } = buehne('fs')
    expect(container.querySelector('.treff-leer')?.textContent).toBe(t.fsKeine)
  })

  it('jeder Tag bekommt eine Karte, überschrieben mit dem echten Datum', () => {
    const { container } = buehne('fs', { fsWeeks: [[inst({ wd: 1 }), inst({ id: 'f2', wd: 6 })]] })
    const tage = [...container.querySelectorAll('.treff-tag-name')].map((x) => x.textContent)
    expect(tage[0]).toContain('Montag')
    expect(tage[0]).toContain('7. September')
    expect(tage[1]).toContain('Samstag')
    expect(container.querySelector('.treff-leer')).toBeNull()
  })

  it('ein Versammlungstreffpunkt heißt so, ein Gruppentreffpunkt nach seiner Gruppe', () => {
    const { container } = buehne('fs', {
      fsWeeks: [[inst({ grp: null }), inst({ id: 'f2', grp: 'g1', time: '10:00' })]],
    })
    expect(titel(container)).toEqual([t.fsVers, 'Gruppe 1'])
  })

  it('Zeit und Ort lassen sich für diese Woche ändern', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: [[inst()]] })
    fireEvent.change(container.querySelector('.treff-zeit-wahl')!, { target: { value: '10:00' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsInstUpdate', wi: 0, id: 'f1', patch: { time: '10:00' } })
    fireEvent.change(container.querySelector('.treff-ort-feld')!, { target: { value: 'Marktplatz' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsInstUpdate', wi: 0, id: 'f1', patch: { place: 'Marktplatz' } })
  })

  it('eine krumme Zeit aus dem Import steht so da, wie sie gilt — nicht als erste der Liste (15.10.2026)', () => {
    // Ohne eigene Option wählt React still die erste (06:00), und der Planer
    // las eine Zeit, die nirgends gilt.
    const { container } = buehne('fs', { fsWeeks: [[inst({ time: '09:40' })]] })
    const wahl = container.querySelector<HTMLSelectElement>('.treff-zeit-wahl')!
    expect(wahl.value).toBe('09:40')
    expect(wahl.selectedOptions[0]?.textContent).toBe('09:40')
  })

  it('ein Treffpunkt lässt sich aus der Woche entfernen — erst nach der Rückfrage', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: [[inst()]] })
    fireEvent.click(container.querySelector('.treff-entfernen')!)
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'fsInstRemove', wi: 0, id: 'f1' })
    fireEvent.click(container.querySelector('.treff-entfernen')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsInstRemove', wi: 0, id: 'f1' })
  })
})

describe('Der Leiter steht als Platz unter seinem Treffpunkt', () => {
  it('offen lädt er zum Zuteilen ein — ein Tipp öffnet es für genau diesen Treffpunkt', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: [[inst()]] })
    const platz = plaetze(container)[0]!
    expect(platz.className).toContain('is-offen')
    expect(platz.querySelector('.platz-name')?.textContent).toBe(t.spurZuteilen)
    fireEvent.click(platz)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'openSlot',
      sel: expect.objectContaining({ kind: 'fs', wi: 0, instId: 'f1', priv: 'treffpunkt' }),
    })
  })

  it('ein Freitext-Leiter ist besetzt — ohne Zusage, er hat die App nicht', () => {
    const { container } = buehne('fs', { fsWeeks: [[inst({ leader: 'Kreisaufseher', lext: true })]] })
    const platz = plaetze(container)[0]!
    expect(platz.className).toContain('is-voll')
    expect(platz.querySelector('.platz-name')?.textContent).toBe('Kreisaufseher')
    expect(platz.textContent).not.toContain(t.zusageWartet)
  })

  it('eine Person wartet, solange sie nicht zugesagt hat', () => {
    const { container } = buehne('fs', { fsWeeks: [[antons()]] })
    expect(plaetze(container)[0]!.className).toContain('is-wartet')
  })

  it('ihre Zusage steht am Treffpunkt — gesucht unter dem Montag der Woche', () => {
    const { container } = buehne('fs', {
      fsWeeks: [[antons({ id: 'f2', wd: 3 }), antons()]],
      confirmations: { [fsTaskKey('2026-09-07', 'f1')]: 'bestätigt', [fsTaskKey('2026-09-07', 'f2')]: 'verhindert' },
    })
    // Sortiert wie aus `fsSort`: Mittwoch (f2) vor Samstag (f1).
    const [mittwoch, samstag] = plaetze(container)
    expect(samstag!.className).toContain('is-voll')
    expect(mittwoch!.className).toContain('is-problem')
    expect(mittwoch!.querySelector('.platz-hinweis')?.textContent).toBe(t.zusageAbgesagt)
  })

  it('wer an diesem Tag fehlt, steht rot da — am Tag davor leitet er trotzdem', () => {
    // Abwesend nur am Samstag, 12.9. — der Mittwoch, 9.9., bleibt seiner.
    const absences: Absence[] = [{ id: 'a1', personId: 'p-a', userId: null, from: '2026-09-12', to: '2026-09-12', reason: '' }]
    const { container } = buehne('fs', { fsWeeks: [[antons({ id: 'f2', wd: 3 }), antons()]], absences })
    const [mittwoch, samstag] = plaetze(container)
    expect(samstag!.className).toContain('is-problem')
    expect(samstag!.querySelector('.platz-hinweis')?.textContent).toBe(t.abwesendChip)
    expect(mittwoch!.className).toContain('is-wartet')
  })

  it('zweimal am selben Tag: beide rot, „An diesem Tag schon"', () => {
    const { container } = buehne('fs', { fsWeeks: [[antons(), antons({ id: 'f2', grp: 'g1', time: '10:00' })]] })
    for (const platz of plaetze(container)) {
      expect(platz.className).toContain('is-problem')
      expect(platz.querySelector('.platz-hinweis')?.textContent).toBe(t.sheetSchonHeute)
    }
  })

  it('der Treffpunkt, der gerade zugeteilt wird, ist hervorgehoben', () => {
    const { container } = buehne('fs', {
      fsWeeks: [[inst(), inst({ id: 'f2', time: '10:00' })]],
      slotSel: { kind: 'fs', wi: 0, instId: 'f2', label: '', priv: 'treffpunkt', groups: false },
    })
    expect(plaetze(container).map((p) => p.getAttribute('aria-current'))).toEqual([null, 'true'])
  })
})

describe('„Treffpunkt für diese Woche"', () => {
  it('gilt nur für diese Woche und nimmt den Saal dieser Versammlung', () => {
    const { container, dispatch } = buehne('fs')
    neu(container)
    hinzufuegen()
    expect(angelegt(dispatch)[0]).toMatchObject({
      ruleId: null, manual: true, grp: null, wd: 6, time: '09:30', place: 'Königreichssaal', leader: '',
    })
    // Danach ist das Blatt zu.
    expect(blatt()).toBeNull()
  })

  it('zwei nacheinander angelegte bekommen verschiedene Kennungen — daran hängt die Bestätigung', () => {
    const { container, dispatch } = buehne('fs')
    neu(container)
    hinzufuegen()
    neu(container)
    hinzufuegen()
    const ids = angelegt(dispatch).map((i) => i.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('ein eingegebener Ort schlägt den Saal — und das nächste Blatt beginnt leer', () => {
    const { container, dispatch } = buehne('fs')
    neu(container)
    fireEvent.change(blatt()!.querySelector('input.feld')!, { target: { value: '  Marktplatz  ' } })
    hinzufuegen()
    expect(angelegt(dispatch)[0]!.place).toBe('Marktplatz')
    neu(container)
    expect(blatt()!.querySelector<HTMLInputElement>('input.feld')!.value).toBe('')
  })

  it('Tag und Uhrzeit nimmt er aus dem Blatt', () => {
    const { container, dispatch } = buehne('fs')
    neu(container)
    const [tag, zeit] = [...blatt()!.querySelectorAll<HTMLSelectElement>('select')].slice(-2)
    fireEvent.change(tag!, { target: { value: '3' } })
    fireEvent.change(zeit!, { target: { value: '10:00' } })
    hinzufuegen()
    expect(angelegt(dispatch)[0]).toMatchObject({ wd: 3, time: '10:00' })
  })

  it('„Abbrechen" legt nichts an', () => {
    const { container, dispatch } = buehne('fs')
    neu(container)
    fireEvent.click(blatt()!.querySelector('.sheet-fuss .knopf-leise')!)
    expect(angelegt(dispatch)).toEqual([])
    expect(blatt()).toBeNull()
  })
})

describe('Der Gruppenaufseher plant nur seine eigene Gruppe', () => {
  const beide = [[
    inst({ id: 'f1', grp: 'g1' }),
    inst({ id: 'f2', grp: 'g2', time: '10:00' }),
    inst({ id: 'f3', grp: null, time: '10:30' }),
  ]]
  // Wirklich Gruppenaufseher: kein Admin, aber Aufseher von Gruppe 1. Die
  // Einschränkung liest `FsPlan` selbst aus den Rechten (`treffpunktGruppe`).
  const AUFSEHER: Partial<AppState> = {
    planner: false,
    zuteiler: false,
    personId: 'p-a',
    groups: [{ ...GRUPPEN[0]!, overseerId: 'p-a' }, GRUPPEN[1]!],
  }

  it('sieht die fremde Gruppe und den Versammlungstreffpunkt gar nicht', () => {
    const { container } = buehne('fs', { fsWeeks: beide, ...AUFSEHER })
    expect(titel(container)).toEqual(['Gruppe 1'])
  })

  it('Zeit, Ort und Entfernen stehen an seinem Treffpunkt — er ändert ihn, nicht nur den Leiter (4.10.2026)', () => {
    const { container } = buehne('fs', { fsWeeks: beide, ...AUFSEHER })
    const kopf = container.querySelector('.treff-planen-kopf')!
    expect(kopf.querySelector('.treff-zeit-wahl')).not.toBeNull()
    expect(kopf.querySelector('.treff-ort-feld')).not.toBeNull()
    expect(kopf.querySelector('.treff-entfernen')).not.toBeNull()
  })

  it('ein neuer Treffpunkt gehört automatisch seiner Gruppe — die Wahl entfällt', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: beide, ...AUFSEHER })
    neu(container)
    // Nur Wochentag und Uhrzeit — keine Wahl der Gruppe.
    expect(blatt()!.querySelectorAll('select')).toHaveLength(2)
    hinzufuegen()
    expect(angelegt(dispatch)[0]!.grp).toBe('g1')
  })

  it('der Admin dagegen wählt die Gruppe — Versammlung oder eine der angelegten', () => {
    const { container, dispatch } = buehne('fs', { fsWeeks: beide })
    neu(container)
    const wahl = blatt()!.querySelector('select')!
    expect([...wahl.querySelectorAll('option')].map((o) => o.textContent)).toEqual([t.fsVers, 'Gruppe 1', 'Gruppe 2'])
    fireEvent.change(wahl, { target: { value: 'g2' } })
    hinzufuegen()
    expect(angelegt(dispatch)[0]!.grp).toBe('g2')
  })
})

describe('Der Planer besetzt Treffpunkte, ändert sie aber nicht (4.10.2026)', () => {
  const woche = [[
    inst({ id: 'f1', grp: 'g1' }),
    inst({ id: 'f2', grp: 'g2', time: '10:00', place: 'Am Markt' }),
  ]]
  const PLANER: Partial<AppState> = { planner: false, zuteiler: true, personId: null }

  it('sieht alle Gruppen und setzt überall den Leiter — Zeit und Ort stehen als Text', () => {
    const { container } = buehne('fs', { fsWeeks: woche, ...PLANER })
    expect(titel(container)).toEqual(['Gruppe 1', 'Gruppe 2'])
    // Nichts, was den Treffpunkt ändert …
    expect(container.querySelector('.treff-planen-kopf.is-aenderbar')).toBeNull()
    expect(container.querySelector('.treff-zeit-wahl, .treff-ort-feld, .treff-entfernen')).toBeNull()
    expect(container.querySelector('.knopf-neu')).toBeNull()
    // … aber Zeit und Ort zum Ansehen, und der Leiter-Platz zum Zuteilen.
    expect([...container.querySelectorAll('.treff-zeit-pille')].map((x) => x.textContent)).toEqual(['09:30', '10:00'])
    expect(container.querySelector('.treff-ort')?.textContent).toBe('Saal')
    expect(container.textContent).toContain('Am Markt')
    expect(plaetze(container)).toHaveLength(2)
  })

  it('ist er zugleich Gruppenaufseher, ändert er seine Gruppe — und nur sie', () => {
    const { container } = buehne('fs', {
      fsWeeks: woche,
      ...PLANER,
      personId: 'p-a',
      groups: [{ ...GRUPPEN[0]!, overseerId: 'p-a' }, GRUPPEN[1]!],
    })
    const koepfe = [...container.querySelectorAll('.treff-planen-kopf')]
    expect(koepfe.map((k) => k.classList.contains('is-aenderbar'))).toEqual([true, false])
    // Anlegen in seiner Gruppe — ohne Wahl.
    neu(container)
    expect(blatt()!.querySelectorAll('select')).toHaveLength(2)
  })
})

describe('„Automatisch" bei den Treffpunkten (T121, Phase 5e)', () => {
  const zwei = [[inst({ id: 'f1', grp: 'g1', leader: 'Anton Alt', lpid: 'p-a' }), inst({ id: 'f2', grp: 'g2' })]]
  const zuteilen = () => fireEvent.click(blatt()!.querySelector('.auto-fuss .knopf-haupt')!)
  const leeren = () => blatt()!.querySelector<HTMLButtonElement>('.auto-leeren')!

  it('nennt, wie viele Leiter besetzt sind, und besetzt die offenen aller Gruppen', () => {
    const { dispatch } = buehne('fsAuto', { fsWeeks: zwei })
    expect(blatt()!.querySelector('.auto-bereich')?.textContent).toContain(`${t.saalBesetzung}: 1/2`)
    zuteilen()
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: null })
  })

  it('„Leeren" braucht auch hier zwei Tipps', () => {
    const { dispatch } = buehne('fsAuto', { fsWeeks: zwei })
    fireEvent.click(leeren())
    expect(dispatch.mock.calls.some((c) => c[0].type === 'fsClear')).toBe(false)
    expect(leeren().textContent).toBe(t.leerenSicher)
    fireEvent.click(leeren())
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsClear', onlyGroup: null })
  })

  it('ist alles besetzt, gibt es nichts zuzuteilen; ist nichts besetzt, nichts zu leeren', () => {
    buehne('fsAuto', { fsWeeks: [[inst({ leader: 'Anton Alt', lpid: 'p-a' })]] })
    expect(blatt()!.querySelector<HTMLButtonElement>('.auto-fuss .knopf-haupt')!.disabled).toBe(true)
    cleanup()
    buehne('fsAuto', { fsWeeks: [[inst()]] })
    expect(leeren().disabled).toBe(true)
  })

  it('beim Gruppenaufseher wirkt beides nur auf seine Gruppe — und zählt nur sie', () => {
    const { dispatch } = buehne('fsAuto', {
      fsWeeks: [[inst({ id: 'f1', grp: 'g1', leader: 'Anton Alt', lpid: 'p-a' }), inst({ id: 'f2', grp: 'g1', time: '10:00' }), inst({ id: 'f3', grp: 'g2' })]],
      planner: false,
      zuteiler: false,
      personId: 'p-a',
      groups: [{ ...GRUPPEN[0]!, overseerId: 'p-a' }, GRUPPEN[1]!],
    })
    expect(blatt()!.querySelector('.auto-bereich')?.textContent).toContain(`${t.saalBesetzung}: 1/2`)
    zuteilen()
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsAutoAssign', onlyGroup: 'g1' })
    fireEvent.click(leeren())
    fireEvent.click(leeren())
    expect(dispatch).toHaveBeenCalledWith({ type: 'fsClear', onlyGroup: 'g1' })
  })
})

