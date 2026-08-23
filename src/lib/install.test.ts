/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **„App installieren" — der Weg zur Home-Bildschirm-App.**
 *
 * Chromium bietet die Installation über ein Ereignis an, das genau **einmal**
 * kommt und das der Browser sonst selbst als Mini-Leiste zeigt. Die App fängt
 * es ab, um zu einem passenden Zeitpunkt selbst zu fragen (Profil,
 * Push-Hinweis). Daran hängen drei Zusagen, die man erst bemerkt, wenn sie
 * fehlen:
 *
 * 1. Vor dem Ereignis wird **nichts** angeboten — ein Knopf, der nichts tut,
 *    ist schlimmer als keiner.
 * 2. Das Ereignis ist **verbraucht**, sobald es benutzt wurde. Ein zweiter
 *    Aufruf läuft ins Leere; das Angebot muss danach verschwinden.
 * 3. Ist die App **schon installiert**, wird nicht noch einmal gefragt — auch
 *    dann nicht, wenn man gerade im Browser-Tab sitzt.
 *
 * Push hängt hier ebenfalls dran (iOS): dort ist die Installation die
 * Voraussetzung, nicht die Kür.
 */

const standalone = { wert: false }
vi.mock('./push', () => ({ isStandalone: () => standalone.wert }))

/** Frisches Modul je Test — `deferred` ist Modulzustand und lebt sonst weiter. */
async function frisch() {
  vi.resetModules()
  return await import('./install')
}

/** Ein `beforeinstallprompt`, wie Chromium es schickt. */
function ereignis() {
  const prompt = vi.fn(() => Promise.resolve())
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  return { e, prompt }
}

beforeEach(() => {
  standalone.wert = false
  Reflect.deleteProperty(navigator, 'getInstalledRelatedApps')
})
afterEach(() => {
  vi.resetModules()
})

describe('Vor dem Ereignis wird nichts angeboten', () => {
  it('installAvailable ist false', async () => {
    const m = await frisch()
    expect(m.installAvailable()).toBe(false)
  })

  it('und promptInstall tut nichts, statt zu werfen', async () => {
    const m = await frisch()
    expect(await m.promptInstall()).toBe(false)
  })
})

describe('Das Ereignis macht die Installation möglich', () => {
  it('es wird abgefangen — sonst zeigt der Browser seine eigene Leiste', async () => {
    const m = await frisch()
    const { e } = ereignis()
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(m.installAvailable()).toBe(true)
  })

  it('Interessenten werden benachrichtigt — das Angebot erscheint ohne Neuladen', async () => {
    const m = await frisch()
    const gemeldet = vi.fn()
    m.onInstallChange(gemeldet)
    window.dispatchEvent(ereignis().e)
    expect(gemeldet).toHaveBeenCalled()
  })

  it('wer sich abmeldet, hört nichts mehr', async () => {
    const m = await frisch()
    const gemeldet = vi.fn()
    m.onInstallChange(gemeldet)()
    window.dispatchEvent(ereignis().e)
    expect(gemeldet).not.toHaveBeenCalled()
  })
})

describe('Der Dialog lässt sich genau einmal zeigen', () => {
  it('eine Zusage meldet true', async () => {
    const m = await frisch()
    const { e, prompt } = ereignis()
    window.dispatchEvent(e)
    expect(await m.promptInstall()).toBe(true)
    expect(prompt).toHaveBeenCalled()
  })

  it('eine Absage meldet false — der Nutzer hat entschieden', async () => {
    const m = await frisch()
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    window.dispatchEvent(e)
    expect(await m.promptInstall()).toBe(false)
  })

  it('danach ist das Angebot weg — das Ereignis ist verbraucht', async () => {
    const m = await frisch()
    window.dispatchEvent(ereignis().e)
    await m.promptInstall()
    expect(m.installAvailable()).toBe(false)
    expect(await m.promptInstall()).toBe(false)
  })

  it('und das Verschwinden wird gemeldet — der Knopf muss weg', async () => {
    const m = await frisch()
    window.dispatchEvent(ereignis().e)
    const gemeldet = vi.fn()
    m.onInstallChange(gemeldet)
    await m.promptInstall()
    expect(gemeldet).toHaveBeenCalled()
  })
})

describe('Nach der Installation wird nicht weiter gefragt', () => {
  it('das appinstalled-Ereignis nimmt das Angebot zurück', async () => {
    const m = await frisch()
    window.dispatchEvent(ereignis().e)
    expect(m.installAvailable()).toBe(true)
    const gemeldet = vi.fn()
    m.onInstallChange(gemeldet)
    window.dispatchEvent(new Event('appinstalled'))
    expect(m.installAvailable()).toBe(false)
    expect(gemeldet).toHaveBeenCalled()
  })
})

describe('Ist die App schon installiert?', () => {
  it('als installierte App: ja, ohne Nachfrage beim Browser', async () => {
    standalone.wert = true
    const m = await frisch()
    expect(await m.appInstalled()).toBe(true)
  })

  it('im Tab fragt sie den Browser — und glaubt ihm', async () => {
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn(() => Promise.resolve([{ id: 'x' }])),
    })
    const m = await frisch()
    expect(await m.appInstalled()).toBe(true)
  })

  it('meldet er nichts, ist sie es nicht — dann darf das Angebot stehen', async () => {
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn(() => Promise.resolve([])),
    })
    const m = await frisch()
    expect(await m.appInstalled()).toBe(false)
  })

  it('kennt der Browser die Frage nicht, wird lieber angeboten als versteckt', async () => {
    // Safari und ältere Chromium-Fassungen. Ein zu Unrecht verstecktes Angebot
    // ist der schlechtere Fehler: dann kommt der Nutzer gar nicht mehr hin.
    const m = await frisch()
    expect(await m.appInstalled()).toBe(false)
  })

  it('wirft die Abfrage, gilt dasselbe', async () => {
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error('nicht erlaubt'))),
    })
    const m = await frisch()
    expect(await m.appInstalled()).toBe(false)
  })
})
