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
 * Fehlt sie, gilt Deutsch.
 *
 * Der **Rumpf** wird bewusst nicht hier übersetzt: er besteht aus Dienstname,
 * Termin und Personenname, die als ` · `-getrennte Atome in die Glocke gehen
 * und dort vom Fragment-Übersetzer erledigt werden.
 */

import { texteFuer } from '../_shared/texte.ts'

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
  pl: { gesucht: 'Szukamy zastępstwa', gefunden: 'Znaleziono zastępstwo' },
  ru: { gesucht: 'Нужна замена', gefunden: 'Замена найдена' },
  uk: { gesucht: 'Потрібна заміна', gefunden: 'Заміну знайдено' },
  ro: { gesucht: 'Se caută înlocuitor', gefunden: 'Înlocuitor găsit' },
  tr: { gesucht: 'Yerine biri aranıyor', gefunden: 'Yerine biri bulundu' },
  ar: { gesucht: 'مطلوب بديل', gefunden: 'تم إيجاد بديل' },
  fa: { gesucht: 'به جایگزین نیاز است', gefunden: 'جایگزین پیدا شد' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const substituteTexte = texteFuer(TEXTE, DE)
