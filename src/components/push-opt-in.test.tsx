/** @vitest-environment jsdom */
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
import { initialState } from '../app/init'
import { dict } from '../i18n/ui'
import type { Dispatch } from 'react'
import type { MyTask } from '../data/types'

/**
 * **Der Weg zu Push-Mitteilungen — der einzige Kanal, über den die App von
 * sich aus etwas meldet.**
 *
 * Er ist auf drei Dateien verteilt, und das Zusammenspiel ist die eigentliche
 * Zusicherung:
 *
 * - Die **Berechtigung wird nie von allein angefragt.** Ein abgelehnter Dialog
 *   sperrt den Browser dauerhaft — er darf erst auf einen echten Tipp kommen.
 * - Der **Hinweis erscheint im richtigen Moment**: auf „Meine Aufgaben", sobald
 *   jemand Zuteilungen hat, und nicht, wenn Push ohnehin unerreichbar ist.
 * - **Einmal weggeklickt bleibt weggeklickt** (localStorage) — sonst ist er
 *   Werbung. Über das Profil geht es weiterhin jederzeit.
 * - Auf **iOS im Browser** steht die Anleitung statt eines Knopfes: dort führt
 *   nur „Teilen → Zum Home-Bildschirm" zum Ziel.
 */

const push = {
  supported: true, needsInstall: false,
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
const { PushPrompt } = await import('./PushPrompt')

const t = dict('de')

const task = (id: string): MyTask => ({
  id, title: 'Bibellesung', rolle: '', date: '', chip: '', at: null, status: 'offen', s89: null,
})

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
    ...initialState(),
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

function zeigePrompt(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const Huelle = huelle(baseState(over), dispatch)
  return { dispatch, ...render(<Huelle><PushPrompt /></Huelle>) }
}

const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => {
  localStorage.clear()
  Object.assign(push, { supported: true, needsInstall: false })
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

describe('Der Opt-in-Hinweis erscheint im richtigen Moment', () => {
  it('ohne anstehende Aufgabe nicht — dann gäbe es nichts zu verpassen', () => {
    const { container } = zeigePrompt({ myTasks: [] })
    expect(container.querySelector('.push-prompt')).toBeNull()
  })

  it('mit Aufgabe steht er da, mit Titel und Begründung', () => {
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    expect(container.querySelector('.push-prompt-title')?.textContent).toBe(t.pushPromptTitle)
    expect(container.querySelector('.push-prompt-text')?.textContent).toBe(t.pushPromptText)
  })

  it('im Demo-Modus nicht — dort gibt es keine Erinnerungen', () => {
    const { container } = zeigePrompt({ myTasks: [task('T1')], dataStatus: 'demo' })
    expect(container.querySelector('.push-prompt')).toBeNull()
  })

  it('kann der Browser gar kein Push und ist auch nichts zu installieren, bleibt er weg', () => {
    Object.assign(push, { supported: false, needsInstall: false })
    installAvailable.wert = false
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    expect(container.querySelector('.push-prompt')).toBeNull()
  })

  it('„Aktivieren" fragt die Berechtigung — erst jetzt, nie vorher', async () => {
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    expect(push.subscribePush).not.toHaveBeenCalled()
    fireEvent.click(knopf(container, t.pushAktivieren)!)
    await waitFor(() => expect(push.subscribePush).toHaveBeenCalled())
  })

  it('nach dem Aktivieren verschwindet er', async () => {
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    fireEvent.click(knopf(container, t.pushAktivieren)!)
    await waitFor(() => expect(container.querySelector('.push-prompt')).toBeNull())
  })

  it('einmal weggeklickt kehrt er nicht wieder — auch nach einem Neustart nicht', () => {
    const erste = zeigePrompt({ myTasks: [task('T1')] })
    fireEvent.click(erste.container.querySelector('.push-prompt-x')!)
    expect(erste.container.querySelector('.push-prompt')).toBeNull()
    cleanup()
    const zweite = zeigePrompt({ myTasks: [task('T1')] })
    expect(zweite.container.querySelector('.push-prompt')).toBeNull()
  })
})

describe('Auf iOS im Browser steht die Anleitung statt eines Knopfes', () => {
  beforeEach(() => {
    Object.assign(push, { supported: false, needsInstall: true })
  })

  it('der Text nennt den Weg über „Zum Home-Bildschirm"', () => {
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    expect(container.querySelector('.push-prompt-text')?.textContent).toBe(t.pushPromptIos)
  })

  it('und es gibt keinen Knopf, der dort nichts bewirken könnte', () => {
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    expect(container.querySelector('.push-prompt-actions')).toBeNull()
  })

  it('bietet der Browser dagegen die Installation an, führt der Knopf dorthin', () => {
    installAvailable.wert = true
    const { container } = zeigePrompt({ myTasks: [task('T1')] })
    const b = knopf(container, t.appInstallieren)!
    expect(b).toBeTruthy()
    fireEvent.click(b)
    expect(promptInstall).toHaveBeenCalled()
  })
})
