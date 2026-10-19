import { beforeEach, describe, expect, it, vi } from 'vitest'
import { letztenStandZeigen, loadAndHydrate, momentaufnahmeZeigen } from './hydrate'
import { loadCongregationData, type CongregationData, type LoadResult } from '../lib/data'
import { verfolgterFetch } from '../lib/schreiben-unterwegs'
import { clearSnapshot, readSnapshot, saveSnapshot } from '../lib/snapshot'
import type { AppAction } from './context'
import { ausstehendesSchreiben } from './persist'
import { sitzungBeendet } from './sitzung'
import { STANDARD_ZEITEN } from '../data/vorgaben'

vi.mock('../lib/data', () => ({ loadCongregationData: vi.fn() }))
vi.mock('../lib/snapshot', () => ({
  saveSnapshot: vi.fn(),
  readSnapshot: vi.fn(() => null),
  clearSnapshot: vi.fn(),
}))
vi.mock('./persist', () => ({ ausstehendesSchreiben: vi.fn() }))
const mockLoad = vi.mocked(loadCongregationData)
const mockSchreiben = vi.mocked(ausstehendesSchreiben)
const mockSave = vi.mocked(saveSnapshot)
const mockRead = vi.mocked(readSnapshot)
const mockClear = vi.mocked(clearSnapshot)

const emptyData: CongregationData = {
  congregation: { name: 'K', hall: '', times: STANDARD_ZEITEN },
  planner: true,
  zuteiler: false,
  personId: null,
  persons: [],
  services: [],
  groups: [],
  weeks: [],
  fsRules: [],
  fsWeeks: [],
  gruppenbesuche: [],
  vortraege: [],
  trolleys: [],
  trolleyTermine: [],
  plaene: [],
  planEintraege: [],
  absences: [],
  absagen: [],
  notifications: [],
  confirmations: {},
  sentLog: {},
  persoenlich: {},
  reminders: { first: 7, last: 1, repeat: false },
  congLang: 'de',
  progLangs: [],
  members: [],
  anmeldeLinks: [],
  auxClass: false,
}

/** Sammelt die dispatchten Aktionen. */
function collector() {
  const actions: AppAction[] = []
  return { actions, dispatch: (a: AppAction) => void actions.push(a) }
}

describe('loadAndHydrate', () => {
  beforeEach(() => {
    mockLoad.mockReset()
    mockSave.mockClear()
    mockClear.mockClear()
    mockRead.mockReset()
    mockRead.mockReturnValue(null)
  })

  it('setzt zuerst loading, dann hydrate bei Erfolg (mit congregationId/userId/empty)', async () => {
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u1')
    expect(actions[0]).toEqual({ type: 'setDataStatus', status: 'loading' })
    expect(actions[1]!.type).toBe('hydrate')
    if (actions[1]!.type === 'hydrate') {
      expect(actions[1].payload).toMatchObject({ congregationId: 'c1', userId: 'u1', empty: false })
    }
  })

  /*
   * **Erst hinaus, was wartet** (15.10.2026). `hydrate` verwirft gebündelt
   * Wartendes — es beruht auf dem ersetzten Stand. Ohne den Schritt davor ging
   * eine eben getippte Änderung verloren, nur weil gerade nachgeladen wurde.
   */
  it('schreibt hinaus, was gebündelt wartet — vor dem Laden', async () => {
    mockSchreiben.mockClear()
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    await loadAndHydrate(collector().dispatch, 'u1', { silent: true })
    expect(mockSchreiben).toHaveBeenCalledTimes(1)
    expect(mockSchreiben.mock.invocationCallOrder[0]).toBeLessThan(mockLoad.mock.invocationCallOrder[0] ?? 0)
  })

  /*
   * **Was schon hinausging, steht im geladenen Stand** (15.10.2026). Bis dahin
   * wurde Gebündeltes nur losgeschickt, und die Abfrage konnte es überholen:
   * Der Bildschirm zeigte danach den Stand ohne die eben getippte Änderung.
   */
  it('liest erst, wenn angekommen ist, was schon unterwegs war', async () => {
    let ankommen = (): void => {}
    const langsam = verfolgterFetch(
      () =>
        new Promise<Response>((weiter) => {
          ankommen = () => weiter(new Response(null))
        }),
    )
    void langsam('https://db.test/rest/v1/confirmations', { method: 'POST' })
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    const fertig = loadAndHydrate(collector().dispatch, 'u1', { silent: true })
    await new Promise((r) => setTimeout(r, 20))
    expect(mockLoad).not.toHaveBeenCalled()
    ankommen()
    await fertig
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  /*
   * **Ging während des Ladens etwas hinaus, wird nachgeladen** (15.10.2026).
   * Ein Push-Klick lädt still nach, und man bestätigt auf „Meine Aufgaben"
   * gleich — die Abfrage las vor der Zusage, und die Aufgabe stand wieder offen
   * da, bis zum nächsten Laden. Erst eingespielt, dann nachgeholt (die Stände
   * der Wochen kommen mit dem ersten Laden, T39).
   */
  it('lädt still noch einmal, wenn während des Ladens etwas hinausging', async () => {
    const sofort = verfolgterFetch(async () => new Response(null))
    const geladen = { ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' } as const
    mockLoad
      .mockImplementationOnce(async () => {
        void sofort('https://db.test/rest/v1/confirmations', { method: 'POST' }) // die Zusage, getippt beim Laden
        return geladen
      })
      .mockResolvedValue(geladen)
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u1', { silent: true })
    expect(mockLoad).toHaveBeenCalledTimes(2)
    expect(actions.map((a) => a.type)).toEqual(['hydrate', 'hydrate'])
  })

  it('… einmal, nicht im Kreis — und ein bloßes Lesen zählt nicht', async () => {
    const sofort = verfolgterFetch(async () => new Response(null))
    mockLoad.mockImplementation(async () => {
      void sofort('https://db.test/rest/v1/confirmations', { method: 'POST' })
      return { ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' }
    })
    await loadAndHydrate(collector().dispatch, 'u1', { silent: true })
    expect(mockLoad).toHaveBeenCalledTimes(2)

    mockLoad.mockReset()
    mockLoad.mockImplementation(async () => {
      void sofort('https://db.test/rest/v1/weeks?select=*')
      return { ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' }
    })
    await loadAndHydrate(collector().dispatch, 'u1', { silent: true })
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it('sichert bei Erfolg die Offline-Momentaufnahme (dieselbe Payload)', async () => {
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u1')
    expect(mockSave).toHaveBeenCalledTimes(1)
    if (actions[1]!.type === 'hydrate') expect(mockSave.mock.calls[0]![0]).toEqual(actions[1].payload)
  })

  it('bei fehlender Mitgliedschaft → no-membership (mit userId für Retry), Aufnahme gelöscht', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'no-membership' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'setDataStatus', status: 'no-membership', userId: 'u9' })
    // Ohne Mitgliedschaft darf der alte Stand nicht offline weiterleben.
    expect(mockClear).toHaveBeenCalled()
  })

  it('bei Ladefehler ohne Aufnahme → error (mit userId)', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'error', message: 'kaputt' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'setDataStatus', status: 'error', userId: 'u9' })
  })

  it('bei Ladefehler MIT Aufnahme → hydrate aus der Aufnahme samt staleAt', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'error' })
    const stored = { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false }
    mockRead.mockReturnValue({ at: 1_700_000_000_000, payload: stored })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9')
    expect(actions[1]).toEqual({ type: 'hydrate', payload: stored, staleAt: 1_700_000_000_000 })
    expect(mockRead).toHaveBeenCalledWith('u9') // nur die eigene Aufnahme
    expect(mockClear).not.toHaveBeenCalled()
  })

  /*
   * **Ein stilles Nachladen, das scheitert, lässt den Bestand stehen**
   * (16.10.2026). Bis dahin fiel es auf die Momentaufnahme zurück: Ein
   * Netzaussetzer nach „Plan senden" ersetzte den Bildschirm durch den älteren
   * Stand und sperrte ihn; ohne Momentaufnahme stand die App auf der
   * Fehlerseite.
   */
  it('still gescheitert: nur ein Hinweis, keine Momentaufnahme, keine Fehlerseite', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'error' })
    mockRead.mockReturnValue({ at: 1, payload: { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false } })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9', { silent: true })
    expect(actions).toEqual([{ type: 'nachladenGescheitert' }])
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('auch still: Ohne Mitgliedschaft gilt der alte Stand nicht weiter', async () => {
    mockLoad.mockResolvedValue({ ok: false, reason: 'no-membership' })
    const { actions, dispatch } = collector()
    await loadAndHydrate(dispatch, 'u9', { silent: true })
    expect(actions).toEqual([{ type: 'setDataStatus', status: 'no-membership', userId: 'u9' }])
  })

  /*
   * **Ein Nachladen legt das Blatt beim Öffnen nicht erneut vor** (16.10.2026):
   * Das tut nur das Öffnen der App. Wer „Später" gesagt hatte, bekam es nach
   * jedem „Plan senden" und jedem Konflikt wieder vorgelegt.
   */
  it('still geladen trägt die Marke „nachgeladen" — das Öffnen der App nicht', async () => {
    mockLoad.mockResolvedValue({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u1' })
    const still = collector()
    await loadAndHydrate(still.dispatch, 'u1', { silent: true })
    expect(still.actions.find((a) => a.type === 'hydrate')).toMatchObject({ nachgeladen: true })
    const offen = collector()
    await loadAndHydrate(offen.dispatch, 'u1')
    expect(offen.actions.find((a) => a.type === 'hydrate')).not.toHaveProperty('nachgeladen')
  })

  /*
   * **Ob still, entscheidet sich mit der Antwort** (19.10.2026). Lässt sie beim
   * Öffnen auf sich warten, zeigt der Provider vorher den letzten Stand
   * (Offline-Start, `store.tsx`). Was danach ankommt, ist ein Nachladen über
   * ihm: Es legt das Blatt beim Öffnen nicht noch einmal vor, und scheitert es,
   * spielt es den letzten Stand kein zweites Mal ein.
   */
  describe('steht beim Eintreffen der Antwort inzwischen der letzte Stand', () => {
    /** Das Laden beginnt sichtbar; bevor die Antwort kommt, greift der Provider vor. */
    function mitVorgriff(antwort: LoadResult) {
      let vorgegriffen = false
      let antworten = (): void => {}
      mockLoad.mockImplementationOnce(
        () =>
          new Promise((weiter) => {
            antworten = () => weiter(antwort)
          }),
      )
      const { actions, dispatch } = collector()
      const laden = loadAndHydrate(dispatch, 'u9', { silent: () => vorgegriffen })
      return {
        actions,
        async vorgreifenUndAntworten(): Promise<void> {
          await vi.waitFor(() => expect(mockLoad).toHaveBeenCalled())
          vorgegriffen = true
          antworten()
          await laden
        },
      }
    }

    it('kommen die Daten still darüber — das Blatt lag beim Öffnen schon vor', async () => {
      const probe = mitVorgriff({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'u9' })
      await probe.vorgreifenUndAntworten()
      // Begonnen hat es sichtbar: Da stand noch das Startbild.
      expect(probe.actions[0]).toEqual({ type: 'setDataStatus', status: 'loading' })
      expect(probe.actions[1]).toMatchObject({ type: 'hydrate', nachgeladen: true })
    })

    it('scheitert es, bleibt er stehen — nur der Hinweis, kein zweites Einspielen', async () => {
      mockRead.mockReturnValue({ at: 1, payload: { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false } })
      const probe = mitVorgriff({ ok: false, reason: 'error' })
      await probe.vorgreifenUndAntworten()
      expect(probe.actions.map((a) => a.type)).toEqual(['setDataStatus', 'nachladenGescheitert'])
      expect(mockRead).not.toHaveBeenCalled()
    })
  })

  /*
   * **Abgemeldet, während noch geladen wurde** (16.10.2026). Die Antwort kam
   * danach an und spielte die Daten des Abgemeldeten in den eben geleerten
   * Zustand zurück, samt einer neuen Momentaufnahme im Speicher des Geräts.
   */
  it('eine Antwort nach dem Abmelden spielt nichts ein und legt nichts ab', async () => {
    let antworten = (): void => {}
    mockLoad.mockImplementationOnce(
      () =>
        new Promise((weiter) => {
          antworten = () => weiter({ ok: true, empty: false, data: emptyData, congregationId: 'c1', userId: 'uA' })
        }),
    )
    const { actions, dispatch } = collector()
    const laden = loadAndHydrate(dispatch, 'uA')
    await vi.waitFor(() => expect(mockLoad).toHaveBeenCalled())
    sitzungBeendet()
    antworten()
    await laden
    expect(actions.map((a) => a.type)).toEqual(['setDataStatus'])
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('auch der Rückfall auf die Momentaufnahme bleibt nach dem Abmelden aus', async () => {
    let antworten = (): void => {}
    mockLoad.mockImplementationOnce(
      () =>
        new Promise((weiter) => {
          antworten = () => weiter({ ok: false, reason: 'error' })
        }),
    )
    mockRead.mockReturnValue({ at: 1, payload: { ...emptyData, congregationId: 'c1', userId: 'uA', empty: false } })
    const { actions, dispatch } = collector()
    const laden = loadAndHydrate(dispatch, 'uA')
    await vi.waitFor(() => expect(mockLoad).toHaveBeenCalled())
    sitzungBeendet()
    antworten()
    await laden
    expect(actions.map((a) => a.type)).toEqual(['setDataStatus'])
  })
})

/*
 * **Den letzten Stand zeigen, ohne zu laden** (19.10.2026): der Rückfall von
 * oben, für sich, denn der Offline-Start greift direkt danach (`store.tsx`).
 * Ein Ladeversuch wäre dort zwecklos: Nach über einer Stunde wartet jede
 * Abfrage, bis supabase-js das Token erneuert hat, offline also 25 s; davor
 * wiederholt PostgREST jede, die am Netz scheitert, sieben Sekunden lang.
 */
describe('letztenStandZeigen', () => {
  beforeEach(() => {
    mockLoad.mockReset()
    mockRead.mockReset()
    mockRead.mockReturnValue(null)
  })

  it('zeigt die Momentaufnahme dieses Kontos nur lesend — ohne etwas zu laden', () => {
    const stored = { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false }
    mockRead.mockReturnValue({ at: 1_700_000_000_000, payload: stored })
    const { actions, dispatch } = collector()
    letztenStandZeigen(dispatch, 'u9')
    expect(actions).toEqual([{ type: 'hydrate', payload: stored, staleAt: 1_700_000_000_000 }])
    expect(mockRead).toHaveBeenCalledWith('u9') // nur die eigene Aufnahme
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('ohne Momentaufnahme die Fehlerseite — mit dem Konto, damit „Erneut versuchen" weiß, für wen', () => {
    const { actions, dispatch } = collector()
    letztenStandZeigen(dispatch, 'u9')
    expect(actions).toEqual([{ type: 'setDataStatus', status: 'error', userId: 'u9' }])
  })
})

/*
 * **Die Momentaufnahme zeigen, sonst nichts** (19.10.2026): für den Vorgriff,
 * während die Daten noch kommen (`store.tsx`). Eine Fehlerseite wäre dort
 * verfrüht — das Laden läuft ja noch, und ohne Momentaufnahme bleibt das
 * Startbild.
 */
describe('momentaufnahmeZeigen', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockRead.mockReturnValue(null)
  })

  it('zeigt die dieses Kontos nur lesend — und sagt, dass sie steht', () => {
    const stored = { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false }
    mockRead.mockReturnValue({ at: 1_700_000_000_000, payload: stored })
    const { actions, dispatch } = collector()
    expect(momentaufnahmeZeigen(dispatch, 'u9')).toBe(true)
    expect(actions).toEqual([{ type: 'hydrate', payload: stored, staleAt: 1_700_000_000_000 }])
    expect(mockRead).toHaveBeenCalledWith('u9')
  })

  it('ohne sie geschieht nichts — keine Fehlerseite, solange das Laden läuft', () => {
    const { actions, dispatch } = collector()
    expect(momentaufnahmeZeigen(dispatch, 'u9')).toBe(false)
    expect(actions).toEqual([])
  })

  it('„langsam" reicht sie an den Zustand weiter — der Streifen sagt dann „Verbindung langsam" (19.10.2026)', () => {
    const stored = { ...emptyData, congregationId: 'c1', userId: 'u9', empty: false }
    mockRead.mockReturnValue({ at: 1_700_000_000_000, payload: stored })
    const { actions, dispatch } = collector()
    momentaufnahmeZeigen(dispatch, 'u9', { langsam: true })
    letztenStandZeigen(dispatch, 'u9', { langsam: true })
    momentaufnahmeZeigen(dispatch, 'u9', { langsam: false })
    const langsam = { type: 'hydrate', payload: stored, staleAt: 1_700_000_000_000, langsam: true }
    expect(actions).toEqual([langsam, langsam, { type: 'hydrate', payload: stored, staleAt: 1_700_000_000_000 }])
  })
})
