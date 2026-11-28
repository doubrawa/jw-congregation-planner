import { describe, expect, it } from 'vitest'
import { geraeteArt } from './geraet'

/**
 * **Auf was für einem Gerät die App läuft.** Daran hängt, welchen Weg zum
 * Kalender-Abo die App zeigt: am iPhone „Im Kalender öffnen", am Android-Handy
 * den Hinweis, dass es einen Computer braucht. Eine falsche Zuordnung schickte
 * jemanden auf einen Weg, den sein Gerät nicht geht.
 *
 * Die Kennungen sind die, mit denen sich die Browser melden.
 */
describe('Die Art des Geräts aus der Kennung des Browsers', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
  const IPAD_ALS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

  it('iPhone, iPad und Mac sind Apple — ein iPad meldet sich in Safari als Mac', () => {
    expect(geraeteArt(IPHONE)).toBe('apple')
    expect(geraeteArt(IPAD_ALS_MAC)).toBe('apple')
  })

  it('ein Android-Handy ist Android — auch wenn seine Kennung „Safari" und „Linux" nennt', () => {
    expect(geraeteArt(ANDROID)).toBe('android')
  })

  it('alles andere ist „anderes": Dort stehen alle Wege — auch am Linux-Rechner, der kein Android ist', () => {
    expect(geraeteArt(WINDOWS)).toBe('anderes')
    expect(geraeteArt(LINUX)).toBe('anderes')
    expect(geraeteArt('')).toBe('anderes')
  })
})
