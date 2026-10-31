/** @vitest-environment happy-dom */
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gespeicherteSitzung, sitzungsSchluessel } from './gespeicherte-sitzung'
import { speicherSpion } from '../../tests/speicher-spion'

/**
 * **Die abgelegte Sitzung lesen, ohne auf Supabase zu warten** (19.10.2026).
 *
 * Beim Start will der Provider wissen, ob ein Konto auf dem Gerät liegt
 * (`store.tsx`, Offline-Start). supabase-js selbst gibt darüber erst Auskunft,
 * wenn es das Token erneuert hat, offline nach 25 s. Deshalb liest die App den
 * Eintrag selbst, und dafür muss sie dieselbe Stelle lesen, an der supabase-js
 * ihn ablegt.
 */

const URL_DER_DATENBANK = 'https://abcdefghijklmnop.supabase.co'
const SCHLUESSEL = 'sb-probe-auth-token'

/** Ein Eintrag, wie auth-js 2.110.2 ihn ablegt (gekürzt auf das, was gelesen wird). */
function ablegen(eintrag: unknown): void {
  localStorage.setItem(SCHLUESSEL, typeof eintrag === 'string' ? eintrag : JSON.stringify(eintrag))
}
const SITZUNG = {
  access_token: 'a.b.c',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1_790_000_000,
  refresh_token: 'r',
  user: { id: 'u7', aud: 'authenticated' },
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('Wo supabase-js die Sitzung ablegt', () => {
  it('der Schlüssel ist der, den supabase-js ohnehin wählt — wer angemeldet ist, bleibt es', () => {
    // `lib/supabase.ts` gibt ihn dem Client ausdrücklich mit. Wiche er vom
    // Standard ab, fände supabase-js die abgelegten Sitzungen nicht mehr, und
    // jeder müsste sich neu anmelden.
    const client = createClient(URL_DER_DATENBANK, 'anon', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const standard = (client as unknown as { storageKey: string }).storageKey
    expect(sitzungsSchluessel(URL_DER_DATENBANK)).toBe(standard)
    expect(standard).toBe('sb-abcdefghijklmnop-auth-token')
  })
})

describe('Die abgelegte Sitzung', () => {
  it('nennt das Konto', () => {
    ablegen(SITZUNG)
    expect(gespeicherteSitzung(SCHLUESSEL)).toEqual({ userId: 'u7' })
  })

  it('ohne Eintrag gibt es keine — dann meldet sich niemand vorab an', () => {
    expect(gespeicherteSitzung(SCHLUESSEL)).toBeNull()
  })

  it('ohne Datenbank (leerer Schlüssel) wird gar nicht erst gelesen', () => {
    const lesen = speicherSpion('getItem')
    expect(gespeicherteSitzung('')).toBeNull()
    expect(lesen).not.toHaveBeenCalled()
    // Die Gegenprobe zum Spion: Mit Schlüssel liest sie, und er sieht es.
    gespeicherteSitzung(SCHLUESSEL)
    expect(lesen).toHaveBeenCalledWith(SCHLUESSEL)
  })

  it.each([
    ['ohne Erneuerungs-Token', { ...SITZUNG, refresh_token: undefined }],
    ['ohne Zugangs-Token', { ...SITZUNG, access_token: undefined }],
    ['ohne Ablauf', { ...SITZUNG, expires_at: undefined }],
    ['ohne Konto', { ...SITZUNG, user: undefined }],
    ['mit einem Konto ohne Kennung', { ...SITZUNG, user: { aud: 'authenticated' } }],
  ])('%s ist es keine Sitzung — auth-js ließe sie auch nicht gelten', (_name, eintrag) => {
    ablegen(eintrag)
    expect(gespeicherteSitzung(SCHLUESSEL)).toBeNull()
  })

  it('ein beschädigter Eintrag ist keine Sitzung — und kein Absturz beim Start', () => {
    ablegen('{nicht json')
    expect(gespeicherteSitzung(SCHLUESSEL)).toBeNull()
    ablegen('null')
    expect(gespeicherteSitzung(SCHLUESSEL)).toBeNull()
  })

  it('ist der Speicher gesperrt (privater Modus), gibt es keine — und keinen Absturz', () => {
    // Eine gültige Sitzung liegt da — `null` kommt also vom gesperrten Speicher, nicht vom leeren.
    ablegen(SITZUNG)
    const lesen = speicherSpion('getItem').mockImplementation(() => {
      throw new DOMException('gesperrt', 'SecurityError')
    })
    expect(gespeicherteSitzung(SCHLUESSEL)).toBeNull()
    expect(lesen).toHaveBeenCalled()
  })

  it('gelöscht wird hier nichts — das bleibt auth-js überlassen', () => {
    ablegen({ ...SITZUNG, refresh_token: undefined })
    gespeicherteSitzung(SCHLUESSEL)
    expect(localStorage.getItem(SCHLUESSEL)).not.toBeNull()
  })
})
