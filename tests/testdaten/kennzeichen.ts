/**
 * **Woran man die erfundenen Daten erkennt.**
 *
 * Die Bündelwache (`scripts/testdaten-grenze.mjs`, eingehängt in
 * `vite.config.ts`) sucht im gebauten Bündel nach genau diesen Zeichenketten.
 * Treffen kann sie nur, wenn die Testdaten sie auch tragen: jede erfundene
 * Person eine Adresse unter der Domain und eine Nummer aus dem Block hier,
 * jede erfundene Woche einen der Platzhalter. `tests/testdaten-grenze.test.ts`
 * hält das fest.
 *
 * **Gesucht wird, was der Bündler schreibt — nicht, was im Quelltext steht.**
 * Zuerst stand hier `@musterstadt.example`, und die Gegenprobe vom 2.10.2026
 * (die Testdaten absichtlich wieder ins Bündel gezogen) fand damit nichts: Der
 * Bündler legt die Domain als eigene Konstante ab und setzt die Adresse erst
 * zur Laufzeit zusammen (`${e}@${lp}`). Ein „@" direkt vor der Domain kam im
 * Bündel nicht vor. Dasselbe Muster wie am 13.8. mit „Manfred Albrecht".
 *
 * Bewusst **keine Namen**: Vornamen wie Daniel oder Jonas stehen zu Recht im
 * Bündel (Bibelbücher), Nachnamen wie Feld oder Sommer in gewöhnlichen
 * Sätzen. Und ein Modul aus diesem Ordner fängt die Wache ohnehin getrennt ab.
 */

/**
 * `.example` ist nach RFC 2606 für Beispiele reserviert: Unter dieser Domain
 * gibt es kein Postfach, also auch niemanden, den eine verirrte Einladung
 * erreichen könnte.
 */
export const TESTDATEN_DOMAIN = 'musterstadt.example'

/**
 * Berlin, `030 23125 000` bis `999`: Den Block hält die Bundesnetzagentur für
 * Film und Fernsehen frei, er ist niemandem zugeteilt.
 */
export const TESTDATEN_RUFNUMMERN = '+49 30 23125'

export const TESTDATEN_KENNZEICHEN: readonly string[] = [
  TESTDATEN_DOMAIN,
  TESTDATEN_RUFNUMMERN,
  'Demoaufgabe',
  'Demo-Studienartikel',
  'Demo-Vortragsthema',
]
