import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { auth } }))
const pushAboLoesen = vi.fn()
vi.mock('./push-abo', () => ({ pushAboLoesen: () => pushAboLoesen() }))
const schreibenAbwarten = vi.fn()
vi.mock('./schreiben-unterwegs', () => ({ schreibenAbwarten: () => schreibenAbwarten() }))
const sitzungVergessen = vi.fn()
vi.mock('./gespeicherte-sitzung', () => ({ sitzungVergessen: () => sitzungVergessen() }))

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
    auth.signOut.mockImplementation(async () => {
      folge.push('signOut')
      return { error: null }
    })
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

  /*
   * Offline mit abgelaufenem Token kann auth-js die Sitzung nicht erneuern —
   * `signOut` gibt dann nur einen Fehler zurück und lässt sie auf dem Gerät.
   * Die App stünde auf „abgemeldet", und mit dem nächsten Netz wäre der
   * Vorgänger wieder angemeldet: auf dem Tablet im Saal womöglich ein Admin.
   */
  it('lässt auth-js die Sitzung liegen, nimmt die App sie selbst vom Gerät', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    auth.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    performLogout(vi.fn())
    await vi.waitFor(() => expect(sitzungVergessen).toHaveBeenCalledTimes(1))
    fehler.mockRestore()
  })

  /*
   * Bis dieser Fehler kommt, vergehen offline fast eine Minute: Push-Abo und
   * Abmelden warten je bis zu 25 s auf ein neues Token. Wer die App in dieser
   * Zeit schließt — nach dem Abmelden das Naheliegende —, ist beim nächsten
   * Öffnen wieder angemeldet.
   */
  describe('wartet das Netz zu lange', () => {
    beforeEach(() => void vi.useFakeTimers())
    afterEach(() => void vi.useRealTimers())

    it('geht die Sitzung nach fünf Sekunden vom Gerät, auch wenn noch nichts geantwortet hat', async () => {
      pushAboLoesen.mockImplementation(() => new Promise(() => {}))
      performLogout(vi.fn())
      await vi.advanceTimersByTimeAsync(4900)
      expect(sitzungVergessen).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(100)
      expect(sitzungVergessen).toHaveBeenCalledTimes(1)
      expect(auth.signOut).not.toHaveBeenCalled()
    })

    it('Gegenprobe: Antwortet alles rechtzeitig, fasst die App die Sitzung auch danach nicht an', async () => {
      performLogout(vi.fn())
      await vi.advanceTimersByTimeAsync(0)
      expect(auth.signOut).toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(sitzungVergessen).not.toHaveBeenCalled()
    })
  })

  it('Gegenprobe: meldet auth-js ab, räumt es selbst — die App fasst nichts an', async () => {
    performLogout(vi.fn())
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    await Promise.resolve()
    expect(sitzungVergessen).not.toHaveBeenCalled()
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
