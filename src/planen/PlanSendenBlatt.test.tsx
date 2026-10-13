/** @vitest-environment jsdom */
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
import { fsTaskKey } from '../data/fs'
import { emptyQualifications } from '../data/helpers'
import { sentKey } from '../data/planning'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { FsInstance, Group, PartItem, Person, Service, Week } from '../data/types'
import type { PlanArt } from './planen-raster'
import { PlanenAktionen } from './PlanenAktionen'

/**
 * **Plan senden** (T121, Phase 5c, Entwurf `GSenden`) — das Blatt hinter dem
 * Knopf der Aktionsleiste. Es ist die einzige Stelle, an der eine Nachricht an
 * die halbe Versammlung ausgelöst wird; geprüft wird deshalb, was man nicht
 * sieht:
 *
 *  1. Den Knopf hat nur, wer senden darf — jeder andere bekäme von der
 *     Function ein 403, und ein Knopf, der verlässlich scheitert, ist
 *     schlimmer als keiner. Der Gruppenaufseher sendet die Treffpunkte seiner
 *     Gruppe (seit Phase 5e hier statt im eigenen Kasten).
 *  2. Es sagt, **wie viele** noch nichts wissen, bei den letzten mit Namen,
 *     Tag und Aufgabe; Vergangenes zählt nicht mehr.
 *  3. Ist nichts zu tun, lässt sich nichts drücken.
 *  4. Wer kein Konto hat, bleibt danach **sichtbar** stehen — den muss der
 *     Planer persönlich ansprechen, und ein Toast wäre nach drei Sekunden weg.
 *     Er gehört zu seiner Woche: Beim Blättern verschwindet er.
 */

const t = dict('de')

const sendPlan = vi.fn()
vi.mock('../lib/data', () => ({ sendPlan: (w: string, heute: string) => sendPlan(w, heute) }))
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn(() => Promise.resolve()) }))

// Das Blatt lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const MONTAG = '2026-09-07'
const DIENSTE: Service[] = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '', priv: emptyQualifications(),
})
const AUFSEHER = person('p-ov', 'Olaf', 'Overseer')
const GRUPPEN: Group[] = [
  { id: 'g1', name: 'Gruppe 1', overseerId: AUFSEHER.id, assistantId: null },
  { id: 'g2', name: 'Gruppe 2', overseerId: null, assistantId: null },
]

const punkt = (iid: string, titel: string, name: string): PartItem => ({ iid, title: titel, mins: 5, names: [{ name }] })

function woche(namen: string[] = ['A. Berg']): Week {
  return {
    range: '7.–13. September', book: '', start: MONTAG,
    mid: {
      date: '', end: '',
      sections: [{ label: 'SCHÄTZE AUS GOTTES WORT', farbe: 'petrol', items: namen.map((n, i) => punkt(`i${i}`, `Punkt ${i}`, n)) }],
      helpers: {},
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

const key = (i: number) => `${MONTAG}|mid|part|i${i}|0`

const stand = (over: Partial<AppState>): AppState => ({
  ...demoZustand(),
  dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
  persons: [AUFSEHER], groups: GRUPPEN, services: DIENSTE,
  weeks: [woche()], fsWeeks: [[]], week: 0, confirmations: {}, sentLog: {},
  congregation: { name: 'Test', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
  ...over,
})

/** Die Aktionsleiste — das Blatt noch zu. */
function leiste(over: Partial<AppState> = {}, art: PlanArt = 'zusammenkuenfte') {
  const dispatch = vi.fn()
  function Buehne({ s }: { s: AppState }) {
    const store = useStaticStore(s)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={s}>
            <PlanenAktionen art={art} leiste />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const { container, rerender } = render(<Buehne s={stand(over)} />)
  /*
   * Neuer Zustand, **derselbe** eingehängte Baustein — genau die Lage beim
   * Blättern: Die Leiste wird nicht neu eingehängt, wenn die Woche wechselt.
   * Ein `render()` mit anderen Daten prüfte das nicht, weil es den inneren
   * Zustand mit zurücksetzt.
   */
  const wechsle = (o: Partial<AppState>) => rerender(<Buehne s={stand(o)} />)
  return { container, dispatch, wechsle }
}

/** Die Leiste mit offenem Blatt. */
function zeige(over: Partial<AppState> = {}, art: PlanArt = 'zusammenkuenfte') {
  const l = leiste(over, art)
  const oeffnen = () => fireEvent.click(l.container.querySelector('.aktion-haupt')!)
  oeffnen()
  return { ...l, oeffnen }
}

const blatt = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const zeilen = () => [...blatt().querySelectorAll<HTMLElement>('.senden-zeile')]
const namen = () => zeilen().map((z) => z.querySelector('.senden-name')?.textContent)
const senden = () => blatt().querySelector<HTMLButtonElement>('.senden-fuss .knopf-haupt')!
const ausgang = () => blatt().querySelector<HTMLButtonElement>('.senden-fuss .knopf-leise')!

beforeEach(() => {
  // Montagmorgen der Testwoche: Vergangenes geht nicht hinaus (T77).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 8, 0))
  sendPlan.mockReset()
  sendPlan.mockResolvedValue({ personen: 1, ohneKonto: [] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Wer den Knopf bekommt', () => {
  it('der Admin und der Planer — sie senden die ganze Woche', () => {
    expect(leiste().container.querySelector('.aktion-haupt')).not.toBeNull()
    cleanup()
    expect(leiste({ planner: false, zuteiler: true }).container.querySelector('.aktion-haupt')).not.toBeNull()
  })

  it('ein Verkündiger nicht — die Function wiese ihn ohnehin ab', () => {
    const { container } = leiste({ planner: false, zuteiler: false, personId: 'p-x' })
    expect(container.querySelector('.aktion-haupt')).toBeNull()
  })

  it('auf altem Stand niemand — es ginge an der Momentaufnahme vorbei hinaus', () => {
    expect(leiste({ staleAt: 1_700_000_000_000 }).container.querySelector('.aktion-haupt')).toBeNull()
    cleanup()
    const aufseher: Partial<AppState> = { planner: false, zuteiler: false, personId: AUFSEHER.id, staleAt: 1_700_000_000_000 }
    expect(leiste(aufseher, 'treffpunkte').container.querySelector('.aktion-haupt')).toBeNull()
  })
})

describe('Der Gruppenaufseher sendet die Treffpunkte seiner Gruppe (4.10.2026)', () => {
  const treffpunkt = (id: string, grp: string, leader: string): FsInstance =>
    ({ id, ruleId: null, grp, wd: 6, time: '09:30', place: 'Saal', leader })
  const GRUPPENAUFSEHER: Partial<AppState> = {
    planner: false, zuteiler: false, personId: AUFSEHER.id,
    weeks: [woche()],
    fsWeeks: [[treffpunkt('f1', 'g1', 'C. Dorn'), treffpunkt('f2', 'g2', 'E. Falk')]],
  }

  it('nur was seine Gruppe betrifft — nicht die Zusammenkunft, nicht die andere Gruppe', () => {
    const { container } = zeige(GRUPPENAUFSEHER, 'treffpunkte')
    expect(container.querySelector('.aktion-haupt .zahl-marke')?.textContent).toBe('1')
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(fill(t.fsSendenOffen, { n: 1 }))
    expect(namen()).toEqual(['C. Dorn'])
  })

  it('ohne die Spur der Zusammenkunft — sie betrifft ihn nicht', () => {
    zeige(GRUPPENAUFSEHER, 'treffpunkte')
    expect(blatt().querySelector('.spur')).toBeNull()
  })

  /** Der Anfang von „Zuletzt gesendet {zeit}" — die Zeit selbst hängt an der Uhr. */
  const ZULETZT = t.planSendenZuletzt.split('{zeit}')[0]!

  it('hat er alles gesendet, sagt der Satz es für seine Gruppe — samt der Zeit', () => {
    zeige(
      { ...GRUPPENAUFSEHER, sentLog: { [sentKey(fsTaskKey(MONTAG, 'f1'), 'C. Dorn')]: '2026-09-05T10:00:00Z' } },
      'treffpunkte',
    )
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.fsSendenAlle)
    expect(blatt().textContent).toContain(ZULETZT)
  })

  it('ein Versand an die andere Gruppe ist nicht seiner', () => {
    zeige(
      { ...GRUPPENAUFSEHER, sentLog: { [sentKey(fsTaskKey(MONTAG, 'f2'), 'E. Falk')]: '2026-09-05T10:00:00Z' } },
      'treffpunkte',
    )
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(fill(t.fsSendenOffen, { n: 1 }))
    expect(blatt().textContent).not.toContain(ZULETZT)
  })

  it('der Planer dagegen sieht die Spur der Woche', () => {
    zeige()
    expect(blatt().querySelector('.spur')).not.toBeNull()
  })
})

describe('Wer noch nichts weiß', () => {
  it('steht mit Namen, Tag und Aufgabe da — die Zahl am Knopf', () => {
    zeige({ weeks: [woche(['A. Berg', 'B. Cohn'])] })
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.planSendenOffen.replace('{n}', '2'))
    expect(namen()).toEqual(['A. Berg', 'B. Cohn'])
    expect(zeilen()[0]!.querySelector('.klein-text')?.textContent).toMatch(/^Dienstag, 8\. September.* · Punkt 0$/)
    expect(senden().querySelector('.zahl-marke')?.textContent).toBe('2')
  })

  it('ein Treffpunkt-Leiter steht als solcher da, mit dem Ort im Termin', () => {
    const treffpunkt: FsInstance = { id: 'r1', ruleId: 'r1', grp: null, wd: 4, time: '09:30', place: 'Saal', leader: 'C. Dorn' }
    zeige({ weeks: [woche([])], fsWeeks: [[treffpunkt]] })
    expect(zeilen().map((z) => z.textContent)).toEqual([expect.stringContaining('C. Dorn')])
    expect(zeilen()[0]!.querySelector('.klein-text')?.textContent).toMatch(/Saal.* · Treffpunkt-Leiter$/)
  })

  it('bei vielen bleibt es beim Satz — eine Wand von Namen liest niemand', () => {
    zeige({ weeks: [woche(Array.from({ length: 12 }, (_u, i) => `P${i}. Beispiel`))] })
    expect(blatt().querySelector('.senden-liste')).toBeNull()
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.planSendenOffen.replace('{n}', '12'))
  })
})

describe('Was vorbei ist, zählt nicht mehr', () => {
  /*
   * Am Donnerstag zählte der Knopf noch die Plätze vom Dienstag, und die
   * Function schickte ihnen eine Nachricht über eine Zusammenkunft, die gewesen
   * ist — während die Planungs-Karte auf dem Start sie schon wegließ. Zwei
   * Zahlen für dieselbe Woche, und ein Druck verschickte mehr, als angekündigt
   * war.
   */
  const mitSonntag = (): Week => {
    const w = woche(['A. Berg'])
    w.we.helpers = { mik: [{ name: 'S. Sonntag' }] }
    return w
  }
  const donnerstag = () => vi.setSystemTime(new Date(2026, 8, 10, 9, 0))

  it('am Donnerstag nennt es nur noch das Wochenende', () => {
    donnerstag()
    const { container } = zeige({ weeks: [mitSonntag()] })
    expect(container.querySelector('.aktion-haupt .zahl-marke')?.textContent).toBe('1')
    expect(namen()).toEqual(['S. Sonntag'])
  })

  it('und schickt den Tag mit, an dem es gezählt hat', async () => {
    donnerstag()
    zeige({ weeks: [mitSonntag()] })
    fireEvent.click(senden())
    await waitFor(() => expect(sendPlan).toHaveBeenCalledWith(MONTAG, '2026-09-10'))
  })

  it('ist nur Vergangenes ungesendet, gibt es nichts mehr freizugeben', () => {
    donnerstag()
    const { container } = zeige({ weeks: [woche(['A. Berg'])] })
    expect(container.querySelector('.aktion-haupt .zahl-marke')).toBeNull()
    expect(senden().getAttribute('aria-disabled')).toBe('true')
  })
})

describe('Senden', () => {
  it('gibt die ganze Woche hinaus — über ihre Kennung, mit dem Kalendertag, an dem gezählt wurde', async () => {
    // Der Index ordnet seit T66 nur noch; die Kennung ist der Montag.
    zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(sendPlan).toHaveBeenCalledWith(MONTAG, '2026-09-07'))
  })

  it('danach sagt ein Toast, wie viele benachrichtigt wurden', async () => {
    sendPlan.mockResolvedValue({ personen: 3, ohneKonto: [] })
    const { dispatch } = zeige()
    fireEvent.click(senden())
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: fill(t.toastPlanGesendet, { n: 3 }) }),
    )
  })

  it('war niemand Neues dabei, sagt er auch das', async () => {
    sendPlan.mockResolvedValue({ personen: 0, ohneKonto: [] })
    const { dispatch } = zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPlanNichts }))
  })

  it('scheitert der Aufruf, sagt es die App — statt so zu tun, als sei es getan', async () => {
    sendPlan.mockResolvedValue(null)
    const { dispatch } = zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastSpeicherFehler }))
  })

  it('wer kein Konto hat, steht danach da — auch wenn das Blatt zwischendurch zu war', async () => {
    // Ein Toast wäre nach drei Sekunden weg, und ein Blatt, das beim Schließen
    // vergisst, ebenso: Die Leiste hält den Stand, bis die Woche wechselt.
    sendPlan.mockResolvedValue({ personen: 0, ohneKonto: ['A. Berg'] })
    const { oeffnen } = zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(blatt().querySelector('.senden-ohne')?.textContent).toContain('A. Berg'))
    fireEvent.click(ausgang())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    oeffnen()
    expect(blatt().querySelector('.senden-ohne')?.textContent).toContain('A. Berg')
  })

  it('beim Blättern verschwindet er wieder — er gehört zu seiner Woche', async () => {
    // Ohne die Kennung daneben standen die Nachzügler von Woche 37 unter
    // Woche 38 — unter Namen, die dort gar nichts haben.
    sendPlan.mockResolvedValue({ personen: 1, ohneKonto: ['Karl Onto'] })
    const { wechsle } = zeige()
    fireEvent.click(senden())
    await waitFor(() => expect(blatt().querySelector('.senden-ohne')?.textContent).toContain('Karl Onto'))

    wechsle({ weeks: [{ ...woche(['C. Dorn']), start: '2026-09-14' }] })
    expect(blatt().querySelector('.senden-ohne')).toBeNull()

    // Und zurück: Er war nicht verworfen, nur der falschen Woche vorenthalten.
    wechsle({})
    expect(blatt().querySelector('.senden-ohne')?.textContent).toContain('Karl Onto')
  })

  it('ist alles gemeldet: der Satz sagt es, der Knopf ist gesperrt, der Ausgang heißt „Fertig"', () => {
    zeige({ sentLog: { [sentKey(key(0), 'A. Berg')]: '2026-08-29T10:00:00Z' } })
    expect(blatt().querySelector('.senden-satz')?.textContent).toBe(t.planSendenAlle)
    expect(senden().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(senden())
    expect(sendPlan).not.toHaveBeenCalled()
    expect(ausgang().textContent).toBe(t.fertig)
  })

  it('sind noch welche offen und wurde schon gesendet, wissen die anderen Bescheid', () => {
    zeige({
      weeks: [woche(['A. Berg', 'B. Cohn'])],
      sentLog: { [sentKey(key(0), 'A. Berg')]: '2026-08-29T10:00:00Z' },
    })
    const zuletzt = [...blatt().querySelectorAll('.sheet-inhalt > .klein-text')].map((p) => p.textContent).at(-1)
    expect(zuletzt?.startsWith(`${t.planSendenAndere} `)).toBe(true)
    expect(ausgang().textContent).toBe(t.spaeter)
  })

  it('in einer Woche, in der noch niemand eingeteilt ist, sagt es nicht „alle wissen Bescheid"', () => {
    zeige({ weeks: [woche([])] })
    expect(blatt().querySelector('.senden-satz')).toBeNull()
    expect(senden().getAttribute('aria-disabled')).toBe('true')
  })

  it('„Später" schließt das Blatt', () => {
    zeige()
    fireEvent.click(ausgang())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
