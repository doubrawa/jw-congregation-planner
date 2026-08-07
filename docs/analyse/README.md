# Analyse (August 2026)

Bestandsaufnahme aus einer reinen Lese-Session zu Commit `e2cdb41`.
**Am Code wurde nichts geändert.** Nichts wurde ausgeführt — kein Build, keine
Tests, kein Dev-Server. Befunde sind mit ✅ (im Code verifiziert, Datei + Zeile
genannt) oder ⚠️ (plausibel, nicht nachgestellt) gekennzeichnet.

| Datei | Inhalt |
| --- | --- |
| **[todo.md](todo.md)** | **Arbeitsliste in Abarbeitungsreihenfolge** — T1–T56 in 10 Phasen, nach Abhängigkeit sortiert. Hier anfangen. |
| [funktionsuebersicht.md](funktionsuebersicht.md) | Was die App kann — 134 Funktionen nach Bereich, Rollen/Rechte, Datenmodell, Backend |
| [befunde.md](befunde.md) | Was nicht stimmt — Fehler (B), fachliche Lücken (F), Ungereimtheiten (U), Übersetzungslücken (D), Testlücken (E), Sicherheit (S), Verbesserungen (V) |
| [code-review.md](code-review.md) | Warum es passiert — Wochen-Array als tragende Annahme, Robustheit, SOLID, Clean Code, Performance |
| [pruefergebnisse.md](pruefergebnisse.md) | **Messwerte statt Lesefunde** — Testlauf, Coverage, Build, Kontrast, Browser-Prüfungen. Enthält den schwersten Befund (B18) |
| [lesepruefungen.md](lesepruefungen.md) | CSS, Testinhalte, Demo-Daten, Migrationskette, Handbücher, Design-Handoff. Enthält B20 (unvollständiges `schema.sql`) |
| [umgebungspruefungen.md](umgebungspruefungen.md) | jw.org-Parser gegen die Live-Seiten, Last-Messung, RLS-Matrix — und was bewusst **nicht** gegen die Produktivdatenbank getestet wurde |
| [offene-pruefungen.md](offene-pruefungen.md) | Was noch offen bleibt — nur noch Prüfungen, die echte Umgebung, jw.org oder Geräte brauchen |

**Wenn du nur fünf Minuten hast:** [pruefergebnisse.md § 0](pruefergebnisse.md)
(reproduzierter Totalausfall, eine Zeile Ursache), dann die Prioritätenliste in
[befunde.md § 0](befunde.md#0-prioritätenliste) und die Sofortmaßnahmen in
[code-review.md § 7](code-review.md#7-empfehlungen-priorisiert).

Ausgeführt wurden inzwischen: `npm test` (727 Tests, grün), `tsc`, `oxlint`,
`build`, `test:coverage`, `contrast`, `npm audit` sowie Browser-Prüfungen im
Demo-Modus (alle Screens, Schriftgröße 1,45, RTL, Touch-Ziele). Nicht ausgeführt:
alles, was eine echte Datenbank, jw.org, Push oder ein echtes Gerät braucht.

Referenz-Kürzel (B1, F3, U7, S1 …) sind über alle drei Dateien hinweg eindeutig
und werden gegenseitig verlinkt.
