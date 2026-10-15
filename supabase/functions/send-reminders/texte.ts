/**
 * Texte der Push-Erinnerungen je Sprache.
 *
 * Eigene, kleine Liste statt des App-Wörterbuchs: die Function wird getrennt
 * deployt und würde sonst die gesamte i18n-Schicht der App mitziehen. Nur die
 * drei Titel, die tatsächlich verschickt werden, stehen hier.
 *
 * Warum überhaupt serverseitig übersetzt wird: Eine Push-Nachricht ist fertiger
 * Text, sobald sie das Gerät erreicht — anders als die Glocke in der App, die
 * beim Anzeigen übersetzt wird. Vorher gingen alle Erinnerungen auf Deutsch
 * heraus, egal welche Sprache der Empfänger eingestellt hatte.
 *
 * Die Sprache steht am Push-Abo (push_subscriptions.lang), also je Gerät —
 * dort, wo sie gewählt wurde. Fehlt sie, gilt
 * Deutsch wie bisher.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface PushTexte {
  /** Titel der persönlichen Erinnerung an eine offene Zuteilung. */
  erinnerung: string
  /** Titel der Sammelmeldung an die Planer über nicht erreichbare Personen. */
  unerreichbar: string
  /** Titel der Erinnerung am Vortag eines Trolley-Termins (T121, Phase 7). */
  trolley: string
}

/*
 * Kanonisch deutsch — und zugleich der Schlüssel, unter dem die **Glocke** die
 * Zeile übersetzt (NOTIF_TITLE_KEY in src/i18n/ui.ts). Beide Meldungen stehen
 * inzwischen in beiden Kanälen: als Push (hier je Sprache) und als
 * Glocken-Zeile (kanonisch deutsch in der Datenbank).
 *
 * Als benannte Konstanten und nicht bloß als Feld von `DE`, damit
 * `mitteilungs-titel.test.ts` sie im Quelltext findet — dieselbe Machart wie in
 * `substitute/texte.ts` und `send-plan/texte.ts`. `index.ts` schreibt beide
 * Titel über diese Konstanten in die Glocke; stünde dort noch das Literal,
 * gäbe es den kanonisch deutschen Text zweimal.
 */
export const TITEL_ERINNERUNG = 'Erinnerung: Zuteilung bestätigen'
export const TITEL_UNERREICHBAR = 'Unbestätigte Zuteilungen (nicht erreichbar)'
export const TITEL_TROLLEY = 'Erinnerung: Trolley morgen'

const DE: PushTexte = {
  erinnerung: TITEL_ERINNERUNG,
  unerreichbar: TITEL_UNERREICHBAR,
  trolley: TITEL_TROLLEY,
}

const TEXTE: Record<string, PushTexte> = {
  de: DE,
  en: { erinnerung: 'Reminder: confirm your assignment', unerreichbar: 'Unconfirmed assignments (not reachable)', trolley: 'Reminder: literature cart tomorrow' },
  es: { erinnerung: 'Recordatorio: confirma tu asignación', unerreichbar: 'Asignaciones sin confirmar (no localizables)', trolley: 'Recordatorio: carrito de publicaciones mañana' },
  fr: { erinnerung: 'Rappel\u00a0: confirme ton attribution', unerreichbar: 'Attributions non confirmées (injoignables)', trolley: 'Rappel\u00a0: présentoir mobile demain' },
  it: { erinnerung: 'Promemoria: conferma il tuo incarico', unerreichbar: 'Incarichi non confermati (non raggiungibili)', trolley: 'Promemoria: espositore mobile domani' },
  pl: { erinnerung: 'Przypomnienie: potwierdź swoje zadanie', unerreichbar: 'Niepotwierdzone zadania (brak kontaktu)', trolley: 'Przypomnienie: wózek z literaturą jutro' },
  ru: { erinnerung: 'Напоминание: подтвердите задание', unerreichbar: 'Неподтверждённые задания (нет связи)', trolley: 'Напоминание: стенд с литературой завтра' },
  uk: { erinnerung: 'Нагадування: підтвердьте завдання', unerreichbar: 'Непідтверджені завдання (немає зв’язку)', trolley: 'Нагадування: стенд з літературою завтра' },
  ro: { erinnerung: 'Memento: confirmă-ți însărcinarea', unerreichbar: 'Însărcinări neconfirmate (fără contact)', trolley: 'Memento: cărucior cu literatură mâine' },
  tr: { erinnerung: 'Hatırlatma: görevini onayla', unerreichbar: 'Onaylanmamış görevler (ulaşılamıyor)', trolley: 'Hatırlatma: yarın yayın arabası' },
  ar: { erinnerung: 'تذكير: أكِّد تعيينك', unerreichbar: 'تعيينات غير مؤكَّدة (تعذَّر الوصول)', trolley: 'تذكير: عربة المطبوعات غدًا' },
  fa: { erinnerung: 'یادآوری: وظیفهٔ خود را تأیید کنید', unerreichbar: 'وظایف تأییدنشده (در دسترس نیستند)', trolley: 'یادآوری: چرخ‌دستی فردا' },
}

/** Texte für eine Sprache; unbekannt oder fehlend → Deutsch. */
export const pushTexte = texteFuer(TEXTE, DE)

/** Nur für Tests/Prüfungen: welche Sprachen abgedeckt sind. */
export const PUSH_SPRACHEN = Object.keys(TEXTE)
