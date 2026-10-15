/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { AppStoreContext, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { dict } from '../i18n/ui'

/**
 * **Der Scanner selbst** (T121, Phase 8) — in `login.test.tsx` steht eine
 * Attrappe für ihn. Hier die echte Komponente mit einer Kamera aus Pappe und
 * einem Leser, der sagt, was er „sieht": Sie meldet den ersten Fund genau
 * einmal, sagt, wenn die Kamera nicht aufgeht, und **schaltet die Kamera aus**,
 * sobald sie verschwindet — sonst bliebe am Handy das Kamera-Licht an.
 */

const gelesen: Array<string | null> = []
const leser = vi.fn(() => Promise.resolve(gelesen.shift() ?? null))
const leserLaden = vi.fn(() => Promise.resolve(leser))
vi.mock('./qr-leser', () => ({ leserFuer: () => leserLaden() }))

const { default: ZettelScanner } = await import('./ZettelScanner')
const t = dict('de')

function zeige({ onGefunden = vi.fn(), onAbbrechen = vi.fn() }: { onGefunden?: (text: string) => void; onAbbrechen?: () => void } = {}) {
  const state = { ...demoZustand(), screen: 'login' as const }
  function Buehne() {
    return (
      <AppStoreContext.Provider value={useStaticStore(state)}>
        <ZettelScanner onGefunden={onGefunden} onAbbrechen={onAbbrechen} />
      </AppStoreContext.Provider>
    )
  }
  return render(<Buehne />)
}

/** Ein Kamerabild, das „läuft", und eine Spur, deren Ausschalten man sieht. */
function kamera() {
  const spur = { stop: vi.fn() }
  return { spur, strom: { getTracks: () => [spur] } as unknown as MediaStream }
}

function kameraFrage(antwort: Promise<MediaStream>) {
  const getUserMedia = vi.fn(() => antwort)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  return getUserMedia
}

beforeEach(() => {
  gelesen.length = 0
  leser.mockClear()
  leserLaden.mockReset().mockImplementation(() => Promise.resolve(leser))
  // jsdom spielt kein Video ab und hat nie ein Bild — beides nachgestellt.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete (HTMLMediaElement.prototype as { readyState?: number }).readyState
})

describe('Zettel scannen', () => {
  it('fragt nach der Kamera auf der Rückseite, ohne Ton', () => {
    const frage = kameraFrage(new Promise(() => {}))
    zeige()
    expect(frage).toHaveBeenCalledWith({ video: { facingMode: 'environment' }, audio: false })
  })

  it('meldet den ersten Fund genau einmal — danach wird nicht weitergelesen', async () => {
    const { strom } = kamera()
    kameraFrage(Promise.resolve(strom))
    gelesen.push(null, 'https://versammlung.app/#code=ABCD2345')
    const onGefunden = vi.fn()
    zeige({ onGefunden })
    await waitFor(() => expect(onGefunden).toHaveBeenCalledWith('https://versammlung.app/#code=ABCD2345'))
    const lesungen = leser.mock.calls.length
    await new Promise((r) => setTimeout(r, 400))
    expect(onGefunden).toHaveBeenCalledTimes(1)
    expect(leser.mock.calls.length).toBe(lesungen)
  })

  it('verschwindet er, geht die Kamera aus', async () => {
    const { spur, strom } = kamera()
    kameraFrage(Promise.resolve(strom))
    const { unmount } = zeige()
    await waitFor(() => expect(leser).toHaveBeenCalled())
    expect(spur.stop).not.toHaveBeenCalled()
    unmount()
    expect(spur.stop).toHaveBeenCalled()
  })

  it('auch wenn er verschwindet, bevor die Kamera aufging', async () => {
    const { spur, strom } = kamera()
    let freigeben: (s: MediaStream) => void = () => {}
    kameraFrage(new Promise((r) => (freigeben = r)))
    const { unmount } = zeige()
    unmount()
    freigeben(strom)
    await waitFor(() => expect(spur.stop).toHaveBeenCalled())
    expect(leser).not.toHaveBeenCalled()
  })

  it('geht die Kamera nicht auf, sagt er es und nennt den anderen Weg', async () => {
    kameraFrage(Promise.reject(new DOMException('verweigert', 'NotAllowedError')))
    const { container } = zeige()
    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe(t.kameraFehlt))
    expect(container.querySelector('video')).toBeNull()
  })

  it('lädt der Leser nicht (offline), geht die Kamera aus, und er sagt es', async () => {
    const { spur, strom } = kamera()
    kameraFrage(Promise.resolve(strom))
    leserLaden.mockImplementation(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    const { container } = zeige()
    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe(t.kameraFehlt))
    expect(spur.stop).toHaveBeenCalled()
  })

  it('„Abbrechen" führt zurück', () => {
    kameraFrage(new Promise(() => {}))
    const onAbbrechen = vi.fn()
    const { getByText } = zeige({ onAbbrechen })
    fireEvent.click(getByText(t.abbrechen))
    expect(onAbbrechen).toHaveBeenCalledTimes(1)
  })
})
