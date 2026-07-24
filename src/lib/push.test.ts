/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSubscription, pushSupported, registerServiceWorker, subscribePush, subscriptionFields } from './push'

describe('subscriptionFields', () => {
  it('extrahiert endpoint/p256dh/auth aus dem Abo', () => {
    const sub = { toJSON: () => ({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } }) } as unknown as PushSubscription
    expect(subscriptionFields(sub)).toEqual({ endpoint: 'e', p256dh: 'p', auth: 'a' })
  })
  it('null bei unvollständigen Feldern', () => {
    const sub = { toJSON: () => ({ endpoint: 'e', keys: {} }) } as unknown as PushSubscription
    expect(subscriptionFields(sub)).toBeNull()
  })
})

describe('pushSupported ohne Browser-Features', () => {
  it('false, wenn serviceWorker/PushManager/Notification fehlen', () => {
    expect(pushSupported()).toBe(false)
  })
})

describe('mit unterstütztem Browser (gestubbt)', () => {
  const fakeSub = { endpoint: 'x' } as unknown as PushSubscription
  const pushManager = { getSubscription: vi.fn(async () => fakeSub), subscribe: vi.fn(async () => fakeSub) }
  const register = vi.fn(async () => ({}))

  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve({ pushManager }) },
    })
    vi.stubGlobal('PushManager', function () {})
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') })
  })
  afterEach(() => {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('pushSupported → true', () => {
    expect(pushSupported()).toBe(true)
  })

  it('registerServiceWorker registriert sw.js', () => {
    registerServiceWorker()
    expect(register).toHaveBeenCalledWith(expect.stringContaining('sw.js'))
  })

  it('currentSubscription liefert das bestehende Abo', async () => {
    expect(await currentSubscription()).toBe(fakeSub)
    expect(pushManager.getSubscription).toHaveBeenCalled()
  })

  it('subscribePush: Berechtigung erteilt → Abo mit VAPID-Schlüssel', async () => {
    expect(await subscribePush()).toBe(fakeSub)
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.anything() }),
    )
  })

  it('subscribePush: Berechtigung verweigert → null', async () => {
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'denied') })
    expect(await subscribePush()).toBeNull()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })
})
