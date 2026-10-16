import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { auth } }))
const pushAboLoesen = vi.fn()
vi.mock('./push-abo', () => ({ pushAboLoesen: () => pushAboLoesen() }))
const schreibenAbwarten = vi.fn()
vi.mock('./schreiben-unterwegs', () => ({ schreibenAbwarten: () => schreibenAbwarten() }))

import { performLogout } from './abmelden'

/*
 * **Abmelden** (16.10.2026): erst die Ansicht, dann das Push-Abo, zuletzt die
 * Sitzung — und die nur auf diesem Gerät.
 */
describe('Abmelden', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushAboLoesen.mockResolvedValue(undefined)
    schreibenAbwarten.mockResolvedValue(undefined)
    auth.signOut.mockResolvedValue({ error: null })
  })

  /*
   * `logout` schickt hinaus, was gebündelt wartete (`persist`). Endete die
   * Sitzung vor der Antwort, wiese die Datenbank es ab — die letzte Eingabe
   * vor dem Abmelden wäre verloren.
   */
  it('die Sitzung endet erst, wenn angekommen ist, was das Abmelden noch hinausschickte', async () => {
    let ankommen = (): void => {}
    schreibenAbwarten.mockImplementation(() => new Promise<void>((weiter) => (ankommen = weiter)))
    performLogout(vi.fn())
    await vi.waitFor(() => expect(schreibenAbwarten).toHaveBeenCalled())
    expect(auth.signOut).not.toHaveBeenCalled()
    ankommen()
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  })

  it('leert sofort, löst dann das Push-Abo und beendet zuletzt die Sitzung', async () => {
    const folge: string[] = []
    const dispatch = vi.fn(() => void folge.push('logout'))
    pushAboLoesen.mockImplementation(async () => void folge.push('push'))
    auth.signOut.mockImplementation(async () => void folge.push('signOut'))
    performLogout(dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'logout' })
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    // Die eigene Zeile löschen darf nur, wer noch angemeldet ist (RLS).
    expect(folge).toEqual(['logout', 'push', 'signOut'])
  })

  /*
   * Ohne Angabe meldet supabase-js **global** ab: jede Sitzung des Kontos auf
   * jedem Gerät. Wer sich am Tablet im Saal abmeldete, war spätestens nach
   * einer Stunde auch am eigenen Handy draußen und kam nur mit einem neuen Link
   * wieder hinein.
   */
  it('meldet nur dieses Gerät ab, nicht jedes Gerät des Kontos', async () => {
    performLogout(vi.fn())
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }))
  })

  it('ein Abo, das sich nicht lösen lässt, hält das Abmelden nicht auf', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    pushAboLoesen.mockRejectedValue(new Error('kein Netz'))
    performLogout(vi.fn())
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }))
    expect(fehler).toHaveBeenCalled()
    fehler.mockRestore()
  })
})
