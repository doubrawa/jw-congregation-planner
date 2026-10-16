# T123 · Jede Übersetzung prüfen — Prüfliste

Aufgabe und Wortlaut stehen in `docs/analyse/todo.md` unter „T123". Hier steht,
was geprüft wurde, womit, was dabei herauskam und was offen bleibt.

Reihenfolge wie vorgegeben: erst Teil 2 (die Oberfläche) per Werkzeug, dann
Teil 1 (jede Übersetzung) Sprache für Sprache.

---

## Teil 2 · Wird in der Oberfläche jeder Text übersetzt?

Stand: 16. Oktober 2026.

### Das Werkzeug

| Datei | Was sie tut |
| --- | --- |
| `tests/oberflaeche-durchgang.test.tsx` | **Durchgang durch die ganze Oberfläche**: startet auf jedem Bildschirm, jedem Reiter und in 16 Sonderlagen (37 Starts), tippt von jeder neuen Ansicht aus jeden Knopf an, füllt jedes Textfeld (erfunden und leer), stellt jede Auswahl um — jedes Mal auf frisch gezeichneter App mit dem echten Reducer — und liest jede Ansicht ab. In der Suite: Ukrainisch, eine Ebene, zehn Starts (rund 15 s). Von Hand: `T123_SPRACHEN=alle T123_TIEFE=3 npx vitest run tests/oberflaeche-durchgang.test.tsx` (`T123_STARTS=…` für Teile, `T123_BERICHT=<Datei>` schreibt Blätter, Toasts und Befunde mit) |
| `tests/fremdsprachiger-bestand.ts` | Der Bestand der Entwicklerseite (`me=p9`, `konto=1`), in dem **nichts deutsch bleiben darf**: Namen, Freitext der Versammlung und Programmtext von jw.org werden zu erfundenen Folgen („Xabebo"); was der Fragment-Übersetzer in jeder App-Sprache kennt, bleibt als Vorlage kanonisch deutsch. Gruppennamen („Gruppe 1") bleiben, die App übersetzt sie |
| `tests/deutsch-erkennen.ts` | Der Prüfer. Kyrillisch und Arabisch (ru, uk, ar, fa): **jedes lateinische Wort** ist verdächtig — außer einer kurzen Liste mit Grund (Produktname, jw.org, PDF/XML/QR, S-89, Zoom, die Kürzel th/lmd/lff/wcg, die Namen der App-Sprachen). Lateinische Schrift: jedes Wort aus dem deutschen Wörterbuch oder den Programm-Begriffen, das die Zielsprache nicht kennt, und jeder Umlaut in einem fremden Wort. Abgelesen wird unter `body` (Blätter, Toasts und Druckbögen sind Portale): Text, `aria-label`, `title`, `placeholder`, `alt`, `aria-description`, `aria-roledescription`, `aria-valuetext`, Feldwerte |
| `src/mitteilungen/mitteilungen-fremdsprache.test.tsx` | **Jede Mitteilung, wie ihr Erzeuger sie schreibt**, in allen elf Sprachen: Rümpfe aus `offeneDerWoche` + `kanonisch` (send-plan, send-reminders), `trolleyRumpf`, den Atomen von `substitute` und dem Reducer selbst (Import, Absage) |

Erweitert:

- `src/i18n/oberflaeche-fremdsprache.test.tsx` liest jetzt unter `body` statt im
  Container — ein Blatt mit eigenem Zustand hängt sich als Portal an `body`,
  im Container stand davon kein Wort — und mit allen Attributen oben.
- `src/i18n/beschriftungen-quelle.test.ts` sieht jetzt auch **Wörter in
  Ausdrücken** der zugänglichen Beschriftungen (`aria-label={x ? 'Text' : …}`,
  `` title={`Woche ${n}`} ``) und einen `showToast` mit festem Satz.

### Die Durchgänge

| Sprache | Tiefe | Starts | Ansichten | Ergebnis |
| --- | --- | --- | --- | --- |
| uk | 3 | alle 37 (in neun Läufen) | rund 1 700, darunter 57 verschiedene Blätter, rund 20 Toasts, alle sechs Druckbögen | kein Deutsch |
| en es fr it pl ru ro tr ar fa (und uk) | 1 | alle 37 | je rund 255, je 52–53 Blätter, 7 Toasts, 4 Druckbögen | kein Deutsch |

Gewollt und nicht beanstandet: zwei Sprachnamen in der ukrainischen
Sprachliste („Cameroon Sign Language", „Swahili (Katanga)") — jw.org führt sie
auf Ukrainisch englisch, und die Liste ist dort abgelesen (siehe Teil 1,
Sprachnamen).

Was der Durchgang nicht erreicht und deshalb eigens geprüft ist: die Rümpfe
echter Mitteilungen (der Demo-Bestand schreibt sie von Hand, siehe unten), die
Meldungen der Functions (sie kommen als Schlüssel zurück — `lib/trolley.ts`,
`lib/import.ts`, `login/anmelde-fehler.ts` — und sind damit Wörterbuch,
Teil 1).

### Funde

| Nr. | Fläche | Sprachen | Befund | Behoben | Wache |
| --- | --- | --- | --- | --- | --- |
| 1 | **Mitteilungen** (Glocke): „Neue Zuteilung", „Zuteilung zurückgezogen", „Erinnerung: Zuteilung bestätigen", „Unbestätigte Zuteilungen (nicht erreichbar)" | alle elf | Die Bezeichnung jeder Aufgabe stand deutsch da: „Tuesday, September 8 · 19:00: **Bibellesung**", „… 09:30 · Kingdom Hall: **Treffpunkt-Leiter**". `send-plan` und `send-reminders` schreiben je Zeile Termin und Bezeichnung mit „: " verbunden (`kanonisch`); der Fragment-Übersetzer zerlegt an „ · " und fand „19:00: Bibellesung" in keinem Wörterbuch. Der Push war nie betroffen (er übersetzt die Hälften getrennt), der Demo-Bestand auch nicht — seine Rümpfe sind von Hand geschrieben | ja: `supabase/functions/_shared/i18n/translate.ts` — ein Atom mit „: " geht wie eines mit „ — " in seinen Hälften durch den Übersetzer | `src/mitteilungen/mitteilungen-fremdsprache.test.tsx` (ohne die Korrektur in allen elf Sprachen rot, von Hand gegengeprüft); Mutationsprobe `t123-glocke-termin-doppelpunkt`: bewacht |

### Offen aus Teil 2

- **Manifest und Seitenbeschreibung sind deutsch** (`public/manifest.webmanifest`
  `description`, `index.html` `<meta name="description">`, beide `lang: "de"`).
  Ein Manifest gibt es nur einmal; ein ukrainischer Nutzer sieht die
  Beschreibung beim Installieren deutsch. Abhilfe wäre je Sprache ein Manifest
  und ein `<link rel="manifest">`, den die App umstellt — eine Entscheidung,
  keine Korrektur. Nicht geändert.
- **Französischer Doppelpunkt in erzeugten Zeilen**: „mardi 8 septembre · 19:00:
  Lecture de la Bible" (Glocke und Push) — das „: " setzt der Code zwischen
  Termin und Bezeichnung, ohne das geschützte Leerzeichen davor. Ebenso in den
  zusammengesetzten `aria-label` (`${label}: ${t.bestaetigen}`). Nicht geändert;
  wäre eine Regel je Sprache im Übersetzer und in `uebersetzt`.
- **„Studienartikel 28"** übersetzt nur der Wörterbuch-Pfad (en, es, fr); der
  Kommentar „FEHLT HIER" in `translate.ts` beschreibt die Lücke. Kein Erzeuger
  der App schreibt den Verweis (nur die Testdaten), deshalb kein Befund.
- **„lmd Lektion 9"** (ältere Arbeitshefte ohne Punktnummer) kennt `REF` auf
  Türkisch nicht. Die heutigen Hefte schreiben „lmd Lektion 9 Punkt 3"; nicht
  gemessen, nicht geändert.

---

## Teil 1 · Jede einzelne Übersetzung

(folgt Sprache für Sprache)
