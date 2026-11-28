/**
 * **Auf was für einem Gerät die App läuft** — für Anleitungen, die je Gerät
 * anders gehen (das Kalender-Abo: am iPhone ein Tipp, am Android-Handy nur
 * über einen Computer). Gelesen aus der Kennung des Browsers; was sie nicht
 * verrät, ist „anderes" — dort stehen alle Wege.
 *
 * Ein iPad meldet sich in Safari als Mac: Beides ist Apple, der Weg derselbe.
 */
export type GeraeteArt = 'apple' | 'android' | 'anderes'

export function geraeteArt(kennung: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): GeraeteArt {
  if (/Android/i.test(kennung)) return 'android'
  if (/iPhone|iPad|iPod|Macintosh/i.test(kennung)) return 'apple'
  return 'anderes'
}
