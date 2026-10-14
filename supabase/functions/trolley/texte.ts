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
  bg: { eingetragen: 'Записаха те за щанда', abgesagt: 'Записът за щанда е отменен', dazu: 'Намерен партньор', entfaellt: 'Записът за щанда отпада' },
  cs: { eingetragen: 'Zápis ke stojanu', abgesagt: 'Termín u stojanu zrušen', dazu: 'Partner nalezen', entfaellt: 'Termín u stojanu odpadá' },
  da: { eingetragen: 'Du er skrevet på til standen', abgesagt: 'Standaftale aflyst', dazu: 'Forkyndermakker fundet', entfaellt: 'Standaftale bortfalder' },
  el: { eingetragen: 'Εγγραφήκατε για το σταντ', abgesagt: 'Το ραντεβού στο σταντ ακυρώθηκε', dazu: 'Βρέθηκε συνεργάτης', entfaellt: 'Το ραντεβού στο σταντ καταργήθηκε' },
  en: { eingetragen: 'Signed up for the literature cart', abgesagt: 'Cart booking cancelled', dazu: 'Partner found', entfaellt: 'Cart booking removed' },
  es: { eingetragen: 'Te han apuntado al carrito', abgesagt: 'Turno del carrito cancelado', dazu: 'Ya tienes compañero', entfaellt: 'Turno del carrito eliminado' },
  fa: { eingetragen: 'برای چرخ‌دستی ثبت‌نام شدید', abgesagt: 'نوبت چرخ‌دستی لغو شد', dazu: 'همخدمت پیدا شد', entfaellt: 'نوبت چرخ‌دستی حذف شد' },
  fi: { eingetragen: 'Sinut ilmoitettiin kärryvuoroon', abgesagt: 'Kärryvuoro peruttu', dazu: 'Kenttäkaveri löytyi', entfaellt: 'Kärryvuoro poistuu' },
  fr: { eingetragen: 'Inscription au présentoir', abgesagt: 'Créneau au présentoir annulé', dazu: 'Partenaire trouvé', entfaellt: 'Créneau au présentoir supprimé' },
  he: { eingetragen: 'נרשמת לעגלת הספרות', abgesagt: 'מועד בעגלת הספרות בוטל', dazu: 'נמצא שותף', entfaellt: 'מועד בעגלת הספרות הוסר' },
  hr: { eingetragen: 'Upis za stalak', abgesagt: 'Termin sa stalkom otkazan', dazu: 'Suradnik pronađen', entfaellt: 'Termin sa stalkom uklonjen' },
  hu: { eingetragen: 'Beírtak a tanúskodóállványhoz', abgesagt: 'Tanúskodóállványos időpont lemondva', dazu: 'Társ megvan', entfaellt: 'Tanúskodóállványos időpont elmarad' },
  id: { eingetragen: 'Didaftarkan untuk rak beroda', abgesagt: 'Jadwal rak beroda dibatalkan', dazu: 'Rekan dinas ditemukan', entfaellt: 'Jadwal rak beroda dihapus' },
  it: { eingetragen: 'Iscrizione all’espositore', abgesagt: 'Turno all’espositore annullato', dazu: 'Compagno di servizio trovato', entfaellt: 'Turno all’espositore rimosso' },
  ja: { eingetragen: 'カートの予定に登録されました', abgesagt: 'カートの予定が取り消されました', dazu: 'パートナーが見つかりました', entfaellt: 'カートの予定がなくなりました' },
  ko: { eingetragen: '전시대 일정에 등록되었습니다', abgesagt: '전시대 일정이 취소되었습니다', dazu: '봉사 짝을 찾았습니다', entfaellt: '전시대 일정이 없어졌습니다' },
  nl: { eingetragen: 'Ingeschreven voor de lectuurstand', abgesagt: 'Afspraak lectuurstand afgezegd', dazu: 'Velddienstpartner gevonden', entfaellt: 'Afspraak lectuurstand vervalt' },
  no: { eingetragen: 'Du er skrevet på til trallen', abgesagt: 'Tralleavtale avlyst', dazu: 'Samarbeidspartner funnet', entfaellt: 'Tralleavtale utgår' },
  pl: { eingetragen: 'Zapisano cię na termin przy wózku', abgesagt: 'Termin przy wózku odwołany', dazu: 'Znaleziono współpracownika', entfaellt: 'Termin przy wózku usunięty' },
  pt: { eingetragen: 'Inscrição no carrinho', abgesagt: 'Horário no carrinho cancelado', dazu: 'Companheiro de pregação encontrado', entfaellt: 'Horário no carrinho removido' },
  ro: { eingetragen: 'Înscriere la cărucior', abgesagt: 'Programare la cărucior anulată', dazu: 'Partener găsit', entfaellt: 'Programare la cărucior eliminată' },
  ru: { eingetragen: 'Вас записали на служение со стендом', abgesagt: 'Запись на стенд отменена', dazu: 'Напарник найден', entfaellt: 'Запись на стенд удалена' },
  sk: { eingetragen: 'Zápis k stojanu', abgesagt: 'Termín pri stojane zrušený', dazu: 'Spolupracovník nájdený', entfaellt: 'Termín pri stojane odpadá' },
  sr: { eingetragen: 'Upis za kolica', abgesagt: 'Termin s kolicima otkazan', dazu: 'Saradnik pronađen', entfaellt: 'Termin s kolicima uklonjen' },
  sv: { eingetragen: 'Uppskriven för litteraturvagnen', abgesagt: 'Tid vid litteraturvagnen inställd', dazu: 'Tjänstekamrat hittad', entfaellt: 'Tid vid litteraturvagnen utgår' },
  sw: { eingetragen: 'Umeandikishwa kwa ajili ya kigari', abgesagt: 'Zamu ya kigari imeghairishwa', dazu: 'Mwandamani amepatikana', entfaellt: 'Zamu ya kigari imeondolewa' },
  tl: { eingetragen: 'Nailista ka para sa cart', abgesagt: 'Kanselado ang iskedyul sa cart', dazu: 'May nakitang kapartner', entfaellt: 'Inalis ang iskedyul sa cart' },
  tr: { eingetragen: 'Yayın arabası için kaydedildin', abgesagt: 'Yayın arabası kaydı iptal edildi', dazu: 'Hizmet arkadaşı bulundu', entfaellt: 'Yayın arabası kaydı kaldırıldı' },
  uk: { eingetragen: 'Вас записали на служіння зі стендом', abgesagt: 'Запис на стенд скасовано', dazu: 'Напарника знайдено', entfaellt: 'Запис на стенд видалено' },
  ur: { eingetragen: 'ٹرالی کے لیے آپ کا نام لکھا گیا', abgesagt: 'ٹرالی کا وقت منسوخ ہو گیا', dazu: 'ساتھی مبشر مل گیا', entfaellt: 'ٹرالی کا وقت ختم کر دیا گیا' },
  vi: { eingetragen: 'Đã được ghi tên cho quầy di động', abgesagt: 'Lịch quầy di động đã bị hủy', dazu: 'Đã có bạn đồng hành', entfaellt: 'Lịch quầy di động đã bị xóa' },
  zh: { eingetragen: '已为你登记手拉车', abgesagt: '手拉车时段已取消', dazu: '已找到同伴', entfaellt: '手拉车时段已移除' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const trolleyTexte = texteFuer(TEXTE, DE)
