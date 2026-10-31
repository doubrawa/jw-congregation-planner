/**
 * **Woran man die erfundenen Daten erkennt.**
 *
 * Die Bündelwache (`scripts/testdaten-grenze.mjs`, eingehängt in
 * `vite.config.ts`) sucht im gebauten Bündel nach genau diesen Zeichenketten.
 * Treffen kann sie nur, wenn die Testdaten sie auch tragen: jede erfundene
 * Woche einen der Platzhalter. Die erfundenen Personen liegen im selben Modul
 * (`testdaten.ts`) — gerät es ins Bündel, kommen die Wochen mit. Bis zum
 * 31.10.2026 trug jede Person auch eine Adresse unter `musterstadt.example`,
 * bis zum 25.10.2026 eine Nummer aus dem Block `+49 30 23125`; beide Felder
 * sind entfallen. `tests/testdaten-grenze.test.ts` hält das fest.
 *
 * **Gesucht wird, was der Bündler schreibt — nicht, was im Quelltext steht.**
 * Die Gegenprobe vom 2.10.2026 (die Testdaten absichtlich wieder ins Bündel
 * gezogen) fand `@musterstadt.example` nicht: Der Bündler legte die Domain als
 * eigene Konstante ab und setzte die Adresse erst zur Laufzeit zusammen. Ein
 * Kennzeichen muss deshalb als Ganzes in einer Zeichenkette stehen. Dasselbe
 * Muster wie am 13.8. mit „Manfred Albrecht".
 *
 * Bewusst **keine Namen**: Vornamen wie Daniel oder Jonas stehen zu Recht im
 * Bündel (Bibelbücher), Nachnamen wie Feld oder Sommer in gewöhnlichen
 * Sätzen. Und ein Modul aus diesem Ordner fängt die Wache ohnehin getrennt ab.
 */

export const TESTDATEN_KENNZEICHEN: readonly string[] = [
  'Demoaufgabe',
  'Demo-Studienartikel',
  'Demo-Vortragsthema',
]
