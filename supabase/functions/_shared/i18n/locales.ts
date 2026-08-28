/**
 * App-Sprachcode → BCP-47-Locale (Intl-Datums-/Zahlenformatierung).
 *
 * **Liegt hier und nicht in `src/i18n/langs.ts`**, weil der Fragment-Übersetzer
 * daneben liegt (`translate.ts`) und beide Seiten ihn brauchen: der Client beim
 * Anzeigen, `send-reminders` beim Verschicken einer Push-Nachricht. `langs.ts`
 * reicht die Tabelle unverändert weiter — und zwar **getypt** (`Record<Lang,
 * string>`), sodass eine fehlende Sprache dort auffällt. Deshalb steht sie hier
 * ohne Typ-Annotation: Erst ein Objektliteral mit genauen Schlüsseln kann die
 * Vollständigkeit drüben beweisen.
 *
 * **Persisch trägt `-u-ca-gregory`, und das ist kein Schönheitsfehler.**
 * `fa-IR` bringt als Vorgabe den persischen (Dschalali-)Kalender mit — als
 * einzige der 34 Locales hier. Aus „Dienstag, 8. September" wurde damit
 * „سه‌شنبه ۱۷ شهریور": ein anderer Tag, ein anderer Monat. Das ist gleich
 * dreifach falsch:
 *
 * 1. **Das Arbeitsheft schreibt gregorianisch.** jw.org führt die Programmwoche
 *    weltweit als „7.–13. September"; ein persischer Aufseher hält dieselbe
 *    Seite in der Hand. Ein Datum, das darin nicht vorkommt, lässt sich nicht
 *    zuordnen.
 * 2. **Die Woche *ist* ihr gregorianisches Datum** (`Week.start`, T66). Ein
 *    zweiter Kalender in der Anzeige hätte nichts, woran er hinge.
 * 3. **Die Umrechnung war ohnehin unmöglich.** `makeTr` übersetzt einen
 *    kanonischen Text *ohne Jahr* („8. September") und rät sich das Jahr über
 *    den Wochentag zusammen. Gregorianisch geht das auf, im Dschalali-Kalender
 *    nicht: Der 8. September ist mal der 17., mal der 18. Schahriwar — je nach
 *    Jahr. Der Programmkopf (`intlRange`, festes Jahr 2025) und die Zeile
 *    darunter konnten sich dadurch um einen Tag unterscheiden.
 *
 * Die Erweiterung wirkt in **allen** Aufrufstellen zugleich (Programm,
 * Dashboard, Treffpunkte, Personen-Zeitleiste, Datumsauswahl) — genau deshalb
 * steht sie hier und nicht als `calendar: 'gregory'` in jedem einzelnen
 * `Intl.DateTimeFormat`. Zahl- und Monatsnamen bleiben persisch: „۸ سپتامبر".
 */
export const LOCALES = {
  de: 'de-DE', en: 'en-US', es: 'es-ES', fr: 'fr-FR', it: 'it-IT',
  pt: 'pt-PT', nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', uk: 'uk-UA',
  ro: 'ro-RO', el: 'el-GR', cs: 'cs-CZ', sk: 'sk-SK', hu: 'hu-HU',
  hr: 'hr-HR', sr: 'sr-Latn-RS', bg: 'bg-BG', sv: 'sv-SE', da: 'da-DK',
  fi: 'fi-FI', no: 'nb-NO', tr: 'tr-TR', zh: 'zh-CN', ja: 'ja-JP',
  ko: 'ko-KR', id: 'id-ID', tl: 'fil-PH', vi: 'vi-VN', sw: 'sw-KE',
  ar: 'ar', he: 'he-IL', fa: 'fa-IR-u-ca-gregory', ur: 'ur-PK',
}

/** Dieselbe Tabelle mit beliebigem Schlüssel — für Nachschläge zur Laufzeit. */
export const LOCALE_JE_CODE: Record<string, string> = LOCALES
