/**
 * Titel der Tausch-Mitteilungen je Sprache (T153).
 *
 * Wie bei den übrigen Functions eine eigene, kleine Liste statt des
 * App-Wörterbuchs (`_shared/texte.ts`). Ein Push ist fertiger Text, sobald er
 * das Gerät erreicht; die Glocke dagegen steht kanonisch deutsch in der
 * Datenbank und übersetzt beim Anzeigen (`NOTIF_TITLE_KEY` in
 * `src/i18n/ui.ts`) — dort stehen dieselben Titel in jeder Sprache.
 *
 * Der **Rumpf** wird hier nicht übersetzt: Dienst, Termin und Name gehen als
 * ` · `-Atome hinaus, die der Fragment-Übersetzer erledigt.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface TauschTexte {
  /** Jemand fragt dich, ob ihr tauscht (an den Gefragten). */
  angefragt: string
  /** Der Tausch ist geschehen (an den Fragenden und die Planer). */
  getauscht: string
  /** Der Gefragte will nicht tauschen (an den Fragenden). */
  abgelehnt: string
}

/** Kanonisch deutsch — zugleich die Schlüssel, unter denen die Glocke übersetzt. */
export const TITEL_ANGEFRAGT = 'Tausch angefragt'
export const TITEL_GETAUSCHT = 'Getauscht'
export const TITEL_ABGELEHNT = 'Tausch abgelehnt'

const DE: TauschTexte = { angefragt: TITEL_ANGEFRAGT, getauscht: TITEL_GETAUSCHT, abgelehnt: TITEL_ABGELEHNT }

const TEXTE: Record<string, TauschTexte> = {
  de: DE,
  ar: { angefragt: 'طلب تبادل', getauscht: 'تم التبادل', abgelehnt: 'رُفض التبادل' },
  en: { angefragt: 'Swap requested', getauscht: 'Swapped', abgelehnt: 'Swap declined' },
  es: { angefragt: 'Solicitud de intercambio', getauscht: 'Intercambio hecho', abgelehnt: 'Intercambio rechazado' },
  fa: { angefragt: 'درخواست تعویض', getauscht: 'تعویض انجام شد', abgelehnt: 'تعویض پذیرفته نشد' },
  fr: { angefragt: 'Demande d’échange', getauscht: 'Échange effectué', abgelehnt: 'Échange refusé' },
  it: { angefragt: 'Richiesta di scambio', getauscht: 'Scambio effettuato', abgelehnt: 'Scambio rifiutato' },
  pl: { angefragt: 'Prośba o zamianę', getauscht: 'Zamiana gotowa', abgelehnt: 'Zamiana odrzucona' },
  ro: { angefragt: 'Cerere de schimb', getauscht: 'Schimb făcut', abgelehnt: 'Schimb refuzat' },
  ru: { angefragt: 'Просьба об обмене', getauscht: 'Обмен состоялся', abgelehnt: 'Обмен отклонён' },
  tr: { angefragt: 'Değişim isteği', getauscht: 'Değişim yapıldı', abgelehnt: 'Değişim reddedildi' },
  uk: { angefragt: 'Прохання про обмін', getauscht: 'Обмін відбувся', abgelehnt: 'Обмін відхилено' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const tauschTexte = texteFuer(TEXTE, DE)
