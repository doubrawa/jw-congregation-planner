/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict } from '../i18n/ui'
import type { Dispatch } from 'react'

/**
 * **Der Weg zu Push-Mitteilungen — der einzige Kanal, über den die App von
 * sich aus etwas meldet.**
 *
 * Er ist auf drei Dateien verteilt, und das Zusammenspiel ist die eigentliche
 * Zusicherung:
 *
 * - Die **Berechtigung wird nie von allein angefragt.** Ein abgelehnter Dialog
 *   sperrt den Browser dauerhaft — er darf erst auf einen echten Tipp kommen.
 * - Die **Karte steht, wo man nach Mitteilungen sieht** (T121: oben auf ihrer
 *   Seite, bis dahin ein Hinweis unter „Meine Aufgaben", der sich wegklicken
 *   ließ) — und nicht, wenn Push ohnehin unerreichbar ist.
 * - Sie **geht von selbst**: mit dem Abo, und wenn der Browser die Berechtigung
 *   schon verweigert hat — dann richtete „Aktivieren" nichts mehr aus. Und sie
 *   **lässt sich wegklicken**, für immer auf diesem Gerät (13.10.2026).
 * - Auf **iOS im Browser** steht die Anleitung statt eines Knopfes: dort führt
 *   nur „Teilen → Zum Home-Bildschirm" zum Ziel.
 */

const push = {
  supported: true, needsInstall: false, verweigert: false,
  subscribePush: vi.fn(() => Promise.resolve<unknown>({ endpoint: 'https://push.test/abo' })),
  subscriptionFields: vi.fn(() => ({ endpoint: 'https://push.test/abo', p256dh: 'k', auth: 'a' })),
  currentSubscription: vi.fn(() => Promise.resolve<unknown>(null)),
}
const savePushSubscription = vi.fn()
const deletePushSubscription = vi.fn()
const savePushLanguage = vi.fn()
const promptInstall = vi.fn(() => Promise.resolve(true))
const installAvailable = { wert: false }
const appInstalledWert = { wert: false }

vi.mock('../lib/push', () => ({
  pushSupported: () => push.supported,
  pushNeedsInstall: () => push.needsInstall,
  pushVerweigert: () => push.verweigert,
  subscribePush: () => push.subscribePush(),
  subscriptionFields: (s: unknown) => (s ? push.subscriptionFields() : null),
  currentSubscription: () => push.currentSubscription(),
  isStandalone: () => false,
  registerServiceWorker: vi.fn(),
}))
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  savePushSubscription: (...a: unknown[]) => savePushSubscription(...a),
  deletePushSubscription: (...a: unknown[]) => deletePushSubscription(...a),
  savePushLanguage: (...a: unknown[]) => savePushLanguage(...a),
}))
vi.mock('../lib/install', () => ({
  promptInstall: () => promptInstall(),
  installAvailable: () => installAvailable.wert,
  appInstalled: () => Promise.resolve(appInstalledWert.wert),
  onInstallChange: () => () => {},
}))

const { usePush, useInstallAvailable } = await import('./usePush')
const { PushKarte } = await import('../mitteilungen/PushKarte')

const t = dict('de')

function huelle(state: AppState, dispatch: Dispatch<AppAction>) {
  return function Huelle({ children }: { children: ReactNode }) {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
}

function baseState(over: Partial<AppState> = {}): AppState {
  return {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', personId: 'p-a',
    myTasks: [], persons: [], weeks: [], fsWeeks: [],
    ...over,
  }
}

function hook(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const r = renderHook(() => usePush(), { wrapper: huelle(baseState(over), dispatch) })
  return { dispatch, ...r }
}

function zeigeKarte(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const Huelle = huelle(baseState(over), dispatch)
  return { dispatch, ...render(<Huelle><PushKarte /></Huelle>) }
}

const karte = (c: HTMLElement) => c.querySelector('.push-karte')
const kartenText = (c: HTMLElement) => c.querySelector('.push-karte .klein-text')?.textContent

const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => {
  Object.assign(push, { supported: true, needsInstall: false, verweigert: false })
  push.subscribePush.mockClear().mockResolvedValue({ endpoint: 'https://push.test/abo' })
  push.subscriptionFields.mockClear().mockReturnValue({
    endpoint: 'https://push.test/abo', p256dh: 'k', auth: 'a',
  })
  push.currentSubscription.mockClear().mockResolvedValue(null)
  savePushSubscription.mockClear()
  deletePushSubscription.mockClear()
  savePushLanguage.mockClear()
  promptInstall.mockClear()
  installAvailable.wert = false
  appInstalledWert.wert = false
  // Jeder Fall beginnt auf einem Gerät, auf dem die Karte nie weggeklickt wurde.
  localStorage.clear()
})
afterEach(cleanup)

describe('Einschalten fragt die Berechtigung — und erst dann', () => {
  it('vor dem Tipp wird nichts angefragt und nichts gespeichert', () => {
    hook()
    expect(push.subscribePush).not.toHaveBeenCalled()
    expect(savePushSubscription).not.toHaveBeenCalled()
  })

  it('ein erteiltes Abo wird mit Sprache gespeichert und gemeldet', async () => {
    const { result, dispatch } = hook({ lang: 'de' })
    await act(async () => {
      expect(await result.current.enable()).toBe(true)
    })
    expect(savePushSubscription).toHaveBeenCalledWith(
      'c1', 'u1', { endpoint: 'https://push.test/abo', p256dh: 'k', auth: 'a' }, 'de',
    )
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPushAn })
    expect(result.current.subscribed).toBe(true)
  })

  it('eine verweigerte Berechtigung sagt es und speichert nichts', async () => {
    push.subscribePush.mockResolvedValue(null)
    const { result, dispatch } = hook()
    await act(async () => {
      expect(await result.current.enable()).toBe(false)
    })
    expect(savePushSubscription).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPushVerweigert })
  })

  it('ein Fehler im Browser wird abgefangen — kein unbehandelter Absturz', async () => {
    push.subscribePush.mockRejectedValue(new Error('kaputt'))
    const { result, dispatch } = hook()
    await act(async () => {
      expect(await result.current.enable()).toBe(false)
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPushVerweigert })
  })

  it('ohne Konto (Demo) wird nichts gespeichert — das Abo gehört einem Nutzer', async () => {
    const { result } = hook({ congregationId: null, userId: null })
    await act(async () => {
      expect(await result.current.enable()).toBe(false)
    })
    expect(savePushSubscription).not.toHaveBeenCalled()
  })
})

describe('Ausschalten meldet das Gerät ab', () => {
  it('löscht das Abo hier und beim Browser', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve(true))
    push.currentSubscription.mockResolvedValue({ endpoint: 'https://push.test/abo', unsubscribe })
    const { result, dispatch } = hook()
    await act(async () => {
      await result.current.disable()
    })
    expect(deletePushSubscription).toHaveBeenCalledWith('https://push.test/abo')
    expect(unsubscribe).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPushAus })
  })

  it('ohne bestehendes Abo bleibt es beim Umschalten — ohne Löschversuch', async () => {
    push.currentSubscription.mockResolvedValue(null)
    const { result, dispatch } = hook()
    await act(async () => {
      await result.current.disable()
    })
    expect(deletePushSubscription).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastPushAus })
  })
})

describe('Ein Sprachwechsel erreicht das bestehende Abo', () => {
  it('sonst kämen die Erinnerungen dauerhaft in der alten Sprache', async () => {
    // Der Push-Text entsteht beim Versand auf dem Server; die Sprache steht am Abo.
    push.currentSubscription.mockResolvedValue({ endpoint: 'https://push.test/abo' })
    const { result } = hook({ lang: 'fr' })
    await act(async () => {
      await result.current.enable()
    })
    await waitFor(() =>
      expect(savePushLanguage).toHaveBeenCalledWith('https://push.test/abo', 'fr'),
    )
  })

  it('ohne Abo wird nichts nachgeführt', async () => {
    push.currentSubscription.mockResolvedValue(null)
    hook({ lang: 'fr' })
    await waitFor(() => expect(push.currentSubscription).toHaveBeenCalled())
    expect(savePushLanguage).not.toHaveBeenCalled()
  })
})

describe('„App installieren" wird nur angeboten, wo es Sinn hat', () => {
  it('nicht, wenn der Browser es gar nicht anbietet', async () => {
    installAvailable.wert = false
    const { result } = renderHook(() => useInstallAvailable(), { wrapper: huelle(baseState(), vi.fn()) })
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('ja, wenn er es anbietet und die App noch nicht installiert ist', async () => {
    installAvailable.wert = true
    appInstalledWert.wert = false
    const { result } = renderHook(() => useInstallAvailable(), { wrapper: huelle(baseState(), vi.fn()) })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('nicht, wenn sie schon installiert ist — das Angebot stünde in der App selbst', async () => {
    installAvailable.wert = true
    appInstalledWert.wert = true
    const { result } = renderHook(() => useInstallAvailable(), { wrapper: huelle(baseState(), vi.fn()) })
    await waitFor(() => expect(result.current).toBe(false))
  })
})

describe('Die Karte auf den Mitteilungen', () => {
  it('steht da, mit Titel und Text — auch ohne anstehende Aufgabe, denn es kommen welche', () => {
    const { container } = zeigeKarte({ myTasks: [] })
    expect(container.querySelector('.push-karte-titel')?.textContent).toBe(t.pushPromptTitle)
    expect(kartenText(container)).toBe(t.pushPromptText)
  })

  it('ohne angemeldetes Konto nicht — ein Abo gehört einem Nutzer (Entwicklerseite)', () => {
    const { container } = zeigeKarte({ userId: null, congregationId: null })
    expect(karte(container)).toBeNull()
  })

  it('kann der Browser gar kein Push und ist auch nichts zu installieren, bleibt sie weg', () => {
    Object.assign(push, { supported: false, needsInstall: false })
    installAvailable.wert = false
    const { container } = zeigeKarte()
    expect(karte(container)).toBeNull()
  })

  it('„Aktivieren" fragt die Berechtigung — erst jetzt, nie vorher', async () => {
    const { container } = zeigeKarte()
    expect(push.subscribePush).not.toHaveBeenCalled()
    fireEvent.click(knopf(container, t.pushAktivieren)!)
    await waitFor(() => expect(push.subscribePush).toHaveBeenCalled())
  })

  it('nach dem Aktivieren verschwindet sie', async () => {
    const { container } = zeigeKarte()
    fireEvent.click(knopf(container, t.pushAktivieren)!)
    await waitFor(() => expect(karte(container)).toBeNull())
  })

  it('hat das Gerät schon ein Abo, steht sie nicht da', async () => {
    push.currentSubscription.mockResolvedValue({ endpoint: 'https://push.test/abo' })
    const { container } = zeigeKarte()
    await waitFor(() => expect(karte(container)).toBeNull())
  })

  it('hat der Browser die Berechtigung schon verweigert, auch nicht — „Aktivieren" richtete nichts mehr aus', () => {
    // Wegklicken müsste man sie sonst von Hand, und ihr Knopf meldete nur noch
    // „verweigert". Freigeben lässt es sich nur im Browser.
    push.verweigert = true
    const { container } = zeigeKarte()
    expect(karte(container)).toBeNull()
  })

  it('das ✕ blendet sie auf diesem Gerät aus — auch nach dem Neuladen', () => {
    // Entscheid vom 13.10.2026: wie der Hinweis unter „Meine Aufgaben" bis zum
    // Umbau. Einschalten geht weiter im Profil.
    const { container } = zeigeKarte()
    const weg = container.querySelector<HTMLButtonElement>('.push-karte-weg')!
    expect(weg.getAttribute('aria-label')).toBe(t.pushKarteWeg)
    fireEvent.click(weg)
    expect(karte(container)).toBeNull()
    cleanup()
    expect(karte(zeigeKarte().container)).toBeNull()
  })

  it('weggeklickt fragt sie auch nichts an', () => {
    fireEvent.click(zeigeKarte().container.querySelector('.push-karte-weg')!)
    expect(push.subscribePush).not.toHaveBeenCalled()
  })
})

describe('Auf iOS im Browser steht die Anleitung statt eines Knopfes', () => {
  beforeEach(() => {
    Object.assign(push, { supported: false, needsInstall: true })
  })

  it('der Text nennt den Weg über „Zum Home-Bildschirm"', () => {
    const { container } = zeigeKarte()
    expect(kartenText(container)).toBe(t.pushPromptIos)
  })

  it('und es gibt keinen Knopf, der dort nichts bewirken könnte — nur das ✕', () => {
    const { container } = zeigeKarte()
    expect(karte(container)).not.toBeNull()
    expect(container.querySelector('.push-karte-knopf')).toBeNull()
    expect(container.querySelector('.push-karte-weg')).not.toBeNull()
  })

  it('bietet der Browser dagegen die Installation an, führt der Knopf dorthin', () => {
    installAvailable.wert = true
    const { container } = zeigeKarte()
    const b = knopf(container, t.appInstallieren)!
    expect(b).toBeTruthy()
    fireEvent.click(b)
    expect(promptInstall).toHaveBeenCalled()
  })
})
