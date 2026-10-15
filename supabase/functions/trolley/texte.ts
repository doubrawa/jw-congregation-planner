/**
 * Titel der Trolley-Mitteilungen je Sprache (T121, Phase 7).
 *
 * Wie bei den übrigen Functions eine eigene, kleine Liste statt des
 * App-Wörterbuchs (`_shared/texte.ts`). Ein Push ist fertiger Text, sobald er
 * das Gerät erreicht; die Glocke dagegen steht kanonisch deutsch in der
 * Datenbank und übersetzt beim Anzeigen (`NOTIF_TITLE_KEY` in
 * `src/i18n/ui.ts`) — dort stehen dieselben Titel in jeder Sprache.
 *
 * Der **Rumpf** wird hier nicht übersetzt: Name, Trolley, Tag und Zeit gehen
 * als ` · `-Atome hinaus (`trolleyRumpf`), die der Fragment-Übersetzer erledigt.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface TrolleyTexte {
  /** Jemand hat dich als Partner eingetragen. */
  eingetragen: string
  /** Wer mit dir eingetragen war, hat sich ausgetragen — du suchst wieder. */
  abgesagt: string
  /** Zu deinem Termin mit „Partner gesucht" ist jemand dazugekommen. */
  dazu: string
  /** Der Admin hat den Trolley entfernt; der Termin entfällt. */
  entfaellt: string
}

/** Kanonisch deutsch — zugleich die Schlüssel, unter denen die Glocke übersetzt. */
export const TITEL_EINGETRAGEN = 'Für den Trolley eingetragen'
export const TITEL_ABGESAGT = 'Trolley-Termin abgesagt'
export const TITEL_DAZU = 'Partner gefunden'
export const TITEL_ENTFAELLT = 'Trolley-Termin entfällt'

const DE: TrolleyTexte = {
  eingetragen: TITEL_EINGETRAGEN,
  abgesagt: TITEL_ABGESAGT,
  dazu: TITEL_DAZU,
  entfaellt: TITEL_ENTFAELLT,
}

const TEXTE: Record<string, TrolleyTexte> = {
  de: DE,
  ar: { eingetragen: 'تم تسجيلك لعربة المطبوعات', abgesagt: 'أُلغي موعد عربة المطبوعات', dazu: 'تم إيجاد رفيق', entfaellt: 'أُزيل موعد عربة المطبوعات' },
  en: { eingetragen: 'Signed up for the literature cart', abgesagt: 'Cart booking cancelled', dazu: 'Partner found', entfaellt: 'Cart booking removed' },
  es: { eingetragen: 'Te han apuntado al carrito', abgesagt: 'Turno del carrito cancelado', dazu: 'Ya tienes compañero', entfaellt: 'Turno del carrito eliminado' },
  fa: { eingetragen: 'برای چرخ‌دستی ثبت‌نام شدید', abgesagt: 'نوبت چرخ‌دستی لغو شد', dazu: 'همخدمت پیدا شد', entfaellt: 'نوبت چرخ‌دستی حذف شد' },
  fr: { eingetragen: 'Inscription au présentoir', abgesagt: 'Créneau au présentoir annulé', dazu: 'Partenaire trouvé', entfaellt: 'Créneau au présentoir supprimé' },
  it: { eingetragen: 'Iscrizione all’espositore', abgesagt: 'Turno all’espositore annullato', dazu: 'Compagno di servizio trovato', entfaellt: 'Turno all’espositore rimosso' },
  pl: { eingetragen: 'Zapisano cię na termin przy wózku', abgesagt: 'Termin przy wózku odwołany', dazu: 'Znaleziono współpracownika', entfaellt: 'Termin przy wózku usunięty' },
  ro: { eingetragen: 'Înscriere la cărucior', abgesagt: 'Programare la cărucior anulată', dazu: 'Partener găsit', entfaellt: 'Programare la cărucior eliminată' },
  ru: { eingetragen: 'Вас записали на служение со стендом', abgesagt: 'Запись на стенд отменена', dazu: 'Напарник найден', entfaellt: 'Запись на стенд удалена' },
  tr: { eingetragen: 'Yayın arabası için kaydedildin', abgesagt: 'Yayın arabası kaydı iptal edildi', dazu: 'Hizmet arkadaşı bulundu', entfaellt: 'Yayın arabası kaydı kaldırıldı' },
  uk: { eingetragen: 'Вас записали на служіння зі стендом', abgesagt: 'Запис на стенд скасовано', dazu: 'Напарника знайдено', entfaellt: 'Запис на стенд видалено' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const trolleyTexte = texteFuer(TEXTE, DE)
