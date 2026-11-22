/** @vitest-environment happy-dom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { gebundenesDatum } from '../components/datum-anzeige'
import { dict, loadOverlay } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { KalenderAbo } from '../lib/kalender'

/**
 * **Die Karte „Kalender"**: die eigenen Aufgaben als Kalender-Abo. Gerufen wird
 * die Function über `lib/kalender.ts` — hier nachgestellt; was die Function
 * dabei prüft und in den Kalender schreibt, steht in
 * `supabase/functions/_test/kalender.test.ts`.
 *
 * Was hier schiefgehen kann: Der Link verschwindet, bevor man ihn abonniert hat;
 * ein Tipp sperrt den alten Link ohne Rückfrage; offline sieht es aus, als
 * ginge etwas; die Karte behauptet „kein Abo", obwohl sie es nicht weiß.
 */

const kalenderStand = vi.fn<() => Promise<KalenderAbo | null | undefined>>()
const kalenderAusstellen = vi.fn<(sprache: string) => Promise<string | null>>()
const kalenderBeenden = vi.fn<() => Promise<boolean>>()
vi.mock('../lib/kalender', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/kalender')>()),
  kalenderStand: () => kalenderStand(),
  kalenderAusstellen: (sprache: string) => kalenderAusstellen(sprache),
  kalenderBeenden: () => kalenderBeenden(),
}))
const copyText = vi.fn<(text: string) => Promise<boolean>>()
vi.mock('../lib/clipboard', () => ({ copyText: (text: string) => copyText(text) }))

const { KalenderKarte } = await import('./KalenderKarte')

const t = dict('de')
const URL_NEU = 'https://test.supabase.co/functions/v1/kalender?t=neu'
const ABGERUFEN = new Date(2026, 10, 22, 14, 5)
/** Ein Abo, dessen Kalender noch nie nachgesehen hat. */
const ABO: KalenderAbo = { erstelltAt: '2026-11-20T10:00:00Z', abgerufenAt: null }
/** Was die Karte sagt, wenn der Kalender um `ABGERUFEN` nachgesehen hat. */
const ZULETZT = fill(t.kalenderZuletzt, { tag: gebundenesDatum(ABGERUFEN, 'de', 'tagMonatKurz'), zeit: gebundenesDatum(ABGERUFEN, 'de', 'uhrzeit') })

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const basis: AppState = { ...demoZustand(), dataStatus: 'ready', userId: 'u1', personId: 'p-a', lang: 'de', staleAt: null, ...over }
  function Buehne({ state }: { state: AppState }) {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <KalenderKarte />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const r = render(<Buehne state={basis} />)
  /** Dieselbe Karte mit geändertem Zustand — etwa offline und wieder online. */
  const neuerZustand = (mehr: Partial<AppState>) => r.rerender(<Buehne state={{ ...basis, ...mehr }} />)
  return { dispatch, neuerZustand, ...r }
}

const knopf = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent === text)
const toasts = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.map(([a]) => a as { type: string; text?: string }).filter((a) => a.type === 'showToast').map((a) => a.text)
const blatt = () => document.body.querySelector('.kalender-blatt')

// Ohne Nachladen läse `dict('ru')` Englisch — und die Probe in Russisch mäße nichts.
beforeAll(() => loadOverlay('ru'))
beforeEach(() => {
  // happy-dom kennt `matchMedia` nicht; das Blatt fragt danach — die Handy-Fassung.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  kalenderStand.mockReset().mockResolvedValue(null)
  kalenderAusstellen.mockReset().mockResolvedValue(URL_NEU)
  kalenderBeenden.mockReset().mockResolvedValue(true)
  copyText.mockReset().mockResolvedValue(true)
})
afterEach(cleanup)

describe('Ohne Abo', () => {
  it('ohne Person keine Karte — ohne sie gibt es keine eigenen Aufgaben', () => {
    const { container } = zeige({ personId: null })
    expect(container.textContent).toBe('')
    expect(kalenderStand).not.toHaveBeenCalled()
  })

  it('sagt, was das Abo tut und was in der App bleibt — und bietet das Abonnieren an', async () => {
    const { container } = zeige()
    await waitFor(() => expect(kalenderStand).toHaveBeenCalledTimes(1))
    expect(container.textContent).toContain(t.kalenderText)
    expect(container.textContent).toContain(t.kalenderHinweis)
    expect(knopf(t.kalenderAbonnieren)).toBeDefined()
    expect(container.textContent).not.toContain(t.kalenderAbonniert)
  })

  it('„Kalender abonnieren" stellt in der Sprache der App aus und zeigt das Blatt mit dem Link — zum Abonnieren und zum Kopieren', async () => {
    expect(dict('ru').kalenderAbonnieren).not.toBe(dict('en').kalenderAbonnieren)
    zeige({ lang: 'ru' })
    fireEvent.click(knopf(dict('ru').kalenderAbonnieren)!)
    await waitFor(() => expect(blatt()).not.toBeNull())
    expect(kalenderAusstellen).toHaveBeenCalledWith('ru')
    // Am iPhone und Mac öffnet webcal:// gleich das Abonnieren.
    expect(blatt()!.querySelector('a')?.getAttribute('href')).toBe('webcal://test.supabase.co/functions/v1/kalender?t=neu')
    fireEvent.click(knopf(dict('ru').kopierenBtn)!)
    // Kopiert wird die https-Adresse: Google und Outlook nehmen sie, webcal nicht überall.
    await waitFor(() => expect(copyText).toHaveBeenCalledWith(URL_NEU))
    expect(knopf(dict('ru').markeKopiert)).toBeDefined()
  })

  it('das Blatt nennt die Wege je Gerät und dass der Link ein Schlüssel ist', async () => {
    zeige()
    fireEvent.click(knopf(t.kalenderAbonnieren)!)
    await waitFor(() => expect(blatt()).not.toBeNull())
    const text = blatt()!.textContent ?? ''
    expect(text).toContain(fill(t.kalenderApple, { knopf: t.kalenderOeffnen }))
    expect(text).toContain(t.kalenderGoogle)
    expect(text).toContain(t.kalenderOutlook)
    expect(text).toContain(t.kalenderGeheim)
    expect(text).toContain(t.kalenderTakt)
    // Danach steht die Karte auf „Abonniert" — noch ohne Abruf.
    expect(document.body.textContent).toContain(t.kalenderNochNie)
  })

  it('geht es nicht, sagt es ein Hinweis — und kein Blatt geht auf', async () => {
    kalenderAusstellen.mockResolvedValue(null)
    const { dispatch } = zeige()
    fireEvent.click(knopf(t.kalenderAbonnieren)!)
    await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangFehler]))
    expect(blatt()).toBeNull()
  })

  it('ein Abo, das die Karte nicht kannte: „Kalender abonnieren" zeigt es — und sperrt den Link nicht', async () => {
    // Die erste Frage kam nicht durch; abonniert war vom anderen Gerät aus.
    kalenderStand.mockResolvedValueOnce(undefined).mockResolvedValue(ABO)
    const { container } = zeige()
    await waitFor(() => expect(kalenderStand).toHaveBeenCalledTimes(1))
    fireEvent.click(knopf(t.kalenderAbonnieren)!)
    await waitFor(() => expect(container.textContent).toContain(t.kalenderAbonniert))
    expect(kalenderAusstellen).not.toHaveBeenCalled()
    expect(blatt()).toBeNull()
  })

  it('kommt die erste Antwort erst nach dem Abonnieren, bleibt das Abo stehen', async () => {
    let ersteAntwort: (stand: KalenderAbo | null) => void = () => {}
    kalenderStand.mockReturnValueOnce(new Promise<KalenderAbo | null>((fertig) => (ersteAntwort = fertig)))
    const { container } = zeige()
    fireEvent.click(knopf(t.kalenderAbonnieren)!)
    await waitFor(() => expect(blatt()).not.toBeNull())
    await act(async () => ersteAntwort(null))
    expect(container.textContent).toContain(t.kalenderAbonniert)
  })

  it('offline: kein Aufruf, nur der Hinweis, dass es gerade nicht geht', async () => {
    const { dispatch } = zeige({ staleAt: Date.now() })
    fireEvent.click(knopf(t.kalenderAbonnieren)!)
    expect(toasts(dispatch)).toEqual([t.offlineReadOnly])
    expect(kalenderAusstellen).not.toHaveBeenCalled()
    expect(kalenderStand).not.toHaveBeenCalled()
  })
})

describe('Mit Abo', () => {
  it('„Abonniert" und wann der Kalender zuletzt nachgesehen hat', async () => {
    kalenderStand.mockResolvedValue({ ...ABO, abgerufenAt: ABGERUFEN.toISOString() })
    const { container } = zeige()
    await waitFor(() => expect(container.textContent).toContain(t.kalenderAbonniert))
    expect(container.textContent).toContain(ZULETZT)
    expect(knopf(t.kalenderAbonnieren)).toBeUndefined()
  })

  it('wieder im Netz fragt die Karte neu — dann steht da, wann der Kalender inzwischen nachgesehen hat', async () => {
    kalenderStand.mockResolvedValueOnce(ABO).mockResolvedValue({ ...ABO, abgerufenAt: ABGERUFEN.toISOString() })
    const { container, neuerZustand } = zeige()
    await waitFor(() => expect(container.textContent).toContain(t.kalenderNochNie))
    neuerZustand({ staleAt: Date.now() })
    neuerZustand({ staleAt: null })
    await waitFor(() => expect(container.textContent).toContain(ZULETZT))
    expect(kalenderStand).toHaveBeenCalledTimes(2)
  })

  it('noch nie abgerufen: Das steht so da — dann trägt das Abo noch nicht', async () => {
    kalenderStand.mockResolvedValue(ABO)
    const { container } = zeige()
    await waitFor(() => expect(container.textContent).toContain(t.kalenderNochNie))
  })

  it('„Neuer Link" fragt erst — der zweite Tipp sperrt den alten und zeigt den neuen', async () => {
    kalenderStand.mockResolvedValue(ABO)
    zeige()
    await waitFor(() => expect(knopf(t.kalenderNeuerLink)).toBeDefined())
    fireEvent.click(knopf(t.kalenderNeuerLink)!)
    expect(kalenderAusstellen).not.toHaveBeenCalled()
    bestaetigen(knopf(t.kalenderNeuerLinkSicher))
    await waitFor(() => expect(blatt()).not.toBeNull())
    expect(kalenderAusstellen).toHaveBeenCalledTimes(1)
  })

  it('„Abo beenden" fragt erst — danach steht die Karte wieder ohne Abo da', async () => {
    kalenderStand.mockResolvedValue(ABO)
    const { container } = zeige()
    await waitFor(() => expect(knopf(t.kalenderBeenden)).toBeDefined())
    fireEvent.click(knopf(t.kalenderBeenden)!)
    expect(kalenderBeenden).not.toHaveBeenCalled()
    bestaetigen(knopf(t.kalenderBeendenSicher))
    await waitFor(() => expect(knopf(t.kalenderAbonnieren)).toBeDefined())
    expect(kalenderBeenden).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain(t.kalenderAbonniert)
  })

  it('geht das Beenden nicht, sagt es ein Hinweis — und das Abo steht weiter da', async () => {
    kalenderStand.mockResolvedValue(ABO)
    kalenderBeenden.mockResolvedValue(false)
    const { container, dispatch } = zeige()
    await waitFor(() => expect(knopf(t.kalenderBeenden)).toBeDefined())
    fireEvent.click(knopf(t.kalenderBeenden)!)
    bestaetigen(knopf(t.kalenderBeendenSicher))
    await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangFehler]))
    expect(container.textContent).toContain(t.kalenderAbonniert)
  })

  it('wirft der Aufruf, sagt es ein Hinweis — und die Knöpfe gehen wieder', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      kalenderStand.mockResolvedValue(ABO)
      kalenderBeenden.mockRejectedValueOnce(new Error('weg'))
      const { dispatch } = zeige()
      await waitFor(() => expect(knopf(t.kalenderBeenden)).toBeDefined())
      fireEvent.click(knopf(t.kalenderBeenden)!)
      bestaetigen(knopf(t.kalenderBeendenSicher))
      await waitFor(() => expect(toasts(dispatch)).toEqual([t.zugangFehler]))
      expect(knopf(t.kalenderBeenden)?.getAttribute('aria-disabled')).toBe('false')
    } finally {
      fehler.mockRestore()
    }
  })
})
