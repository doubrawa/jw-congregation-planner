import { istVorbei } from '../data/meeting-dates'
import type { SubstituteReq } from '../data/types'

/**
 * **Ersatzgesuche, die auf diesem Gerät abgelehnt wurden** („Nein, danke" im
 * Blatt beim Öffnen, 1.11.2026): Kennung → Termin des Gesuchs.
 *
 * Bis dahin kannte das Blatt nur „Später", und das legt es beim nächsten
 * Öffnen wieder vor. Wer nicht einspringen konnte, wurde bis zum Termin bei
 * jedem Laden gefragt. Abgelehnt fällt das Gesuch aus dem Blatt; unter „Freie
 * Plätze" steht es weiter, wer es sich anders überlegt, übernimmt es dort.
 *
 * **Auf dem Gerät, nicht in der Datenbank**: Die Antwort ändert für niemanden
 * etwas — gesucht wird weiter, und der Planer sieht den Platz ohnehin offen.
 * Auf einem zweiten Gerät fragt das Blatt deshalb noch einmal.
 */
export type AbgelehnteGesuche = Readonly<Record<string, number | null>>

const SPEICHER = 'abgelehnteGesuche'

/**
 * Wer lehnt ab, welcher Platz, für wen.
 *
 * **Mit dem Absagenden**: Teilt der Planer den Platz jemand anderem zu und sagt
 * der auch ab, ist das ein neues Gesuch und liegt wieder vor. Zieht derselbe
 * seine Absage zurück und sagt erneut ab, bleibt es abgelehnt.
 *
 * **Mit der eigenen Person**: Die Liste gehört dem Gerät, und an ihm kann sich
 * auch jemand anderes anmelden.
 */
export function gesuchKennung(personId: string, req: Pick<SubstituteReq, 'key' | 'declinedBy'>): string {
  return JSON.stringify([personId, req.key, req.declinedBy])
}

/** Was das Gerät sich gemerkt hat — ohne Gesuche, deren Termin vorbei ist. */
export function abgelehnteLesen(heute = new Date()): AbgelehnteGesuche {
  try {
    const roh: unknown = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}')
    if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {}
    return Object.fromEntries(
      Object.entries(roh).filter(([, at]) => (at === null || typeof at === 'number') && !istVorbei(at, heute)),
    )
  } catch {
    return {}
  }
}

/**
 * Zu dem dazu, was schon dasteht. Ein zweites Fenster der App kennt nur seine
 * eigenen Ablehnungen; schrieb es sie allein hin, waren die des ersten weg,
 * und beim nächsten Öffnen fragte das Blatt wieder (Review 1.11.2026). Heraus
 * fällt nur Vergangenes, und das beim Lesen.
 */
export function abgelehnteMerken(abgelehnt: AbgelehnteGesuche): void {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify({ ...abgelehnteLesen(), ...abgelehnt }))
  } catch {
    // Ohne Speicher (privates Fenster) gilt die Ablehnung bis zum Neuladen.
  }
}
