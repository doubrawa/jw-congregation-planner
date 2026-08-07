/**
 * Titel der Ersatz-Benachrichtigungen je Sprache.
 *
 * Wie in send-reminders eine eigene, kleine Liste statt des App-Wörterbuchs:
 * die Function wird getrennt deployt und würde sonst die ganze i18n-Schicht
 * mitziehen.
 *
 * Ein Push ist fertiger Text, sobald er das Gerät erreicht — anders als die
 * Glocke in der App, die beim Anzeigen übersetzt wird. Bis hierher gingen
 * beide Meldungen fest auf Deutsch heraus, in allen 34 Sprachen.
 *
 * Die Sprache steht am Push-Abo (push_subscriptions.lang), also je Gerät.
 * Fehlt sie (Abos von vor migration-014), gilt Deutsch.
 *
 * Der **Rumpf** wird bewusst nicht hier übersetzt: er besteht aus Dienstname,
 * Termin und Personenname, die als ` · `-getrennte Atome in die Glocke gehen
 * und dort vom Fragment-Übersetzer erledigt werden.
 */

export interface SubstituteTexte {
  /** Es wird ein Ersatz gesucht (an alle Qualifizierten). */
  gesucht: string
  /** Jemand ist eingesprungen (an Ursprungsperson + Planer). */
  gefunden: string
}

/** Kanonisch deutsch — zugleich der Schlüssel, unter dem die Glocke übersetzt. */
export const TITEL_GESUCHT = 'Ersatz gesucht'
export const TITEL_GEFUNDEN = 'Ersatz gefunden'

const DE: SubstituteTexte = { gesucht: TITEL_GESUCHT, gefunden: TITEL_GEFUNDEN }

const TEXTE: Record<string, SubstituteTexte> = {
  de: DE,
  en: { gesucht: 'Substitute needed', gefunden: 'Substitute found' },
  es: { gesucht: 'Se busca sustituto', gefunden: 'Sustituto encontrado' },
  fr: { gesucht: 'Remplaçant recherché', gefunden: 'Remplaçant trouvé' },
  it: { gesucht: 'Cercasi sostituto', gefunden: 'Sostituto trovato' },
  pt: { gesucht: 'Procura-se substituto', gefunden: 'Substituto encontrado' },
  nl: { gesucht: 'Vervanger gezocht', gefunden: 'Vervanger gevonden' },
  pl: { gesucht: 'Szukamy zastępstwa', gefunden: 'Znaleziono zastępstwo' },
  ru: { gesucht: 'Нужна замена', gefunden: 'Замена найдена' },
  uk: { gesucht: 'Потрібна заміна', gefunden: 'Заміну знайдено' },
  ro: { gesucht: 'Se caută înlocuitor', gefunden: 'Înlocuitor găsit' },
  el: { gesucht: 'Ζητείται αντικαταστάτης', gefunden: 'Βρέθηκε αντικαταστάτης' },
  cs: { gesucht: 'Hledá se náhrada', gefunden: 'Náhrada nalezena' },
  sk: { gesucht: 'Hľadá sa náhrada', gefunden: 'Náhrada nájdená' },
  hu: { gesucht: 'Helyettes keresése', gefunden: 'Helyettes megvan' },
  hr: { gesucht: 'Traži se zamjena', gefunden: 'Zamjena pronađena' },
  sr: { gesucht: 'Traži se zamena', gefunden: 'Zamena pronađena' },
  bg: { gesucht: 'Търси се заместник', gefunden: 'Намерен заместник' },
  sv: { gesucht: 'Ersättare sökes', gefunden: 'Ersättare hittad' },
  da: { gesucht: 'Afløser søges', gefunden: 'Afløser fundet' },
  fi: { gesucht: 'Sijaista etsitään', gefunden: 'Sijainen löytyi' },
  no: { gesucht: 'Vikar søkes', gefunden: 'Vikar funnet' },
  tr: { gesucht: 'Yerine biri aranıyor', gefunden: 'Yerine biri bulundu' },
  zh: { gesucht: '需要有人替补', gefunden: '已找到替补' },
  ja: { gesucht: '代わりの人を探しています', gefunden: '代わりの人が決まりました' },
  ko: { gesucht: '대신할 사람을 찾습니다', gefunden: '대신할 사람을 찾았습니다' },
  id: { gesucht: 'Dicari pengganti', gefunden: 'Pengganti ditemukan' },
  tl: { gesucht: 'Naghahanap ng kapalit', gefunden: 'May nakitang kapalit' },
  vi: { gesucht: 'Cần người thay thế', gefunden: 'Đã có người thay thế' },
  sw: { gesucht: 'Anahitajika mbadala', gefunden: 'Mbadala amepatikana' },
  ar: { gesucht: 'مطلوب بديل', gefunden: 'تم إيجاد بديل' },
  he: { gesucht: 'דרוש מחליף', gefunden: 'נמצא מחליף' },
  fa: { gesucht: 'به جایگزین نیاز است', gefunden: 'جایگزین پیدا شد' },
  ur: { gesucht: 'متبادل درکار ہے', gefunden: 'متبادل مل گیا' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export function substituteTexte(lang: string | null | undefined): SubstituteTexte {
  return TEXTE[lang ?? ''] ?? DE
}
