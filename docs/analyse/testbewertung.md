# Testbewertung — jeder Test einzeln geprüft

Stand: 23. August 2026, Commit `046509c`. Auftrag: **jeden** Test bewerten —
wie vollständig und sinnvoll er ist, ob Randfälle geprüft werden und ob der
Bereich als Ganzes abgedeckt ist. Maßstab war ausdrücklich **nicht** der Code,
sondern der Anwendungsfall dahinter.

Ergänzt [lesepruefungen.md § B2](lesepruefungen.md), das dieselbe Frage im
August an den Testnamen und Zusicherungsdichten gestellt hat.

---

## 1. Das Ergebnis in einem Satz

Die Fachlogik war hervorragend geprüft, die **Bedienoberfläche gar nicht** —
und weil dort Regeln stecken, die es sonst nirgends gibt, war das keine
Kosmetiklücke. Der Coverage-Bericht hat sie zudem aktiv verdeckt.

| | vorher | nach § 7 | nach § 8 |
| --- | --- | --- | --- |
| Testdateien | 113 | 134 | **138** |
| Testfälle | 1596 | 2637 | **2769** |
| Zeilen-Abdeckung | 82,9 % ¹ | 95,4 % | **96,9 %** |
| Funktions-Abdeckung | 71,1 % ¹ | 93,9 % | **95,9 %** |
| Zweig-Abdeckung | 74,3 % ¹ | 84,3 % | **86,4 %** |
| Dateien ohne jede Testberührung | **21** (2554 Zeilen) | 0 | 0 |
| Einträge in der Mutationsprobe | 48 | 60 | **67** |

¹ Alle drei Zahlen waren zu hoch — siehe § 3.

---

## 2. Was der Bestand gut macht

Das gehört vorweg, weil es die Ausnahme ist: Die vorhandenen 1596 Tests sind
nicht code-, sondern **anwendungsfall-orientiert** geschrieben. Sie tragen
Namen wie *„Schwester führt → Schwester als Partnerin, obwohl der Bruder freier
ist"* statt *„returns correct partner"*. Stichproben quer durch alle Bereiche:

- **Gegenproben sind Standard.** Fast jede Regel hat einen Test, der das
  Gegenteil festhält (`autoassign.grenzfaelle.test.ts`: *„der Rückkehrer
  verschwindet aber nicht dauerhaft"*).
- **Vollständigkeitsproben** sichern die häufigste Fehlerart dieses Projekts ab
  — ein vergessener Aufrufer (`alle-plaetze.test.ts` prüft alle vier
  Platzsorten gegen jede Funktion, die Plätze anfasst).
- **Messen statt raten**: `nachtrag-fairness.md` und `translate-data.test.ts`
  belegen Zahlen und Übersetzungen an der Quelle, statt sie zu erfinden.
- **Die Mutationsprobe** (`scripts/mutationsprobe.mjs`) beantwortet die Frage,
  die grüne Tests offenlassen: Verteidigen die Tests die Regel wirklich?

Von den geprüften ~1600 Tests war **kein einziger** ein Alibi-Test. Was gefehlt
hat, war nicht Qualität, sondern **Reichweite**.

---

## 3. Der strukturelle Befund: der Coverage-Bericht hat gelogen

`npm run test:coverage` wies 21 Dateien mit **100 %** aus — bei
**0 Anweisungen**. Der v8-Anbieter kann eine `.tsx`-Datei, die kein Test je
importiert, nicht instrumentieren und trägt sie als leer und damit als
vollständig ein.

Betroffen waren unter anderem:

| Datei | Zeilen | ausgewiesen | tatsächlich |
| --- | --- | --- | --- |
| `app/AppShell.tsx` | 469 | 100 % | nie ausgeführt |
| `planen/AssignSheet.tsx` | 323 | 100 % | nie ausgeführt |
| `personen/PersonenScreen.tsx` | 282 | 100 % | nie ausgeführt |
| `profil/ProfilScreen.tsx` | 165 | 100 % | nie ausgeführt |
| `login/LoginScreen.tsx` | 144 | 100 % | nie ausgeführt |
| … 16 weitere | | | |

**Das ist die schwerwiegendere Hälfte des Befundes.** Eine Lücke, die der
Bericht als Lücke zeigt, wird irgendwann geschlossen; eine, die er als „fertig"
meldet, nie. Nachgewiesen wurde sie nicht über den Bericht, sondern über den
Import-Graphen: welche Quelldatei erreicht von den Testdateien aus überhaupt
niemand.

---

## 4. Warum die Lücke fachlich zählte

Die naheliegende Einordnung wäre gewesen: „nur Darstellung, die Logik ist ja
geprüft". Sie stimmt nicht. In den 2554 ungeprüften Zeilen standen Regeln, die
es an keiner anderen Stelle gibt:

| Regel | wo sie stand | was ohne sie passiert |
| --- | --- | --- |
| **Navigationsliste je Rolle** | `AppShell.tsx:42-62` | Die Rechteprüfung hat **zwei** Hälften. `reducer.test.ts` prüft den Wächter — die Liste war ungeprüft. Ein Verkündiger hätte „Personen" gesehen und wäre beim Antippen ins Programm zurückgeworfen worden. |
| **Deep-Link-Rechte** | `AppShell.tsx:147` | Ein Push-Klick hätte einen Verkündiger auf „Planen" geführt. |
| **Zwei-Tipp-Bestätigung** | `AutoAssignPanel`, `FsPlan`, `PersonDetail` | Ein Fehltipp löscht eine Woche Planung bzw. eine Person samt Bezügen. Fällt erst auf, wenn es passiert ist. |
| **Redner-Rückweg (T29)** | `AssignSheet.tsx:100` | Ein Platz, einmal auf „eigener Redner" gesetzt, hätte nie wieder zum Gastredner zurückgefunden. |
| **Abwesenden-Sperre** | `AssignSheet.tsx:139` | Der Planer hätte jemanden einteilen können, der nachweislich fehlt. |
| **Bestätigungs-Zeichen** | `MeetingSection.tsx:267` | Das „✓" hätte am Gastredner eine Zusage behauptet, die es nie gab. |
| **Fokusfalle** | `useDialogFocus.ts` | Sieben Overlays hängen daran. Ohne sie bedient man mit der Tastatur, was man nicht sieht. |
| **Installations-Ereignis** | `install.ts:76` | Es kommt genau einmal; wird es nicht verbraucht, bleibt ein toter Knopf stehen. |

---

## 5. Bewertung je Bereich

| Bereich | Bewertung vorher | Maßnahme |
| --- | --- | --- |
| `src/data/*` (Fachlogik) | **sehr gut** — 96 % Zeilen, Gegenproben, Simulationen über ein Jahr | unverändert |
| `src/app/reducer.ts` | **sehr gut** — 107 Fälle inkl. Index-außerhalb-Fenster | unverändert |
| `supabase/functions/*` | **gut** — Zugang, Dry-Run, Nicht-Erreichbare, Wettläufe | unverändert |
| `src/i18n/*` (Wörterbücher) | **gut**, mit einer Lücke — siehe § 6 | REF-Durchreiche ergänzt |
| `src/lib/*` | **gut** — bis auf `install.ts` (nie berührt) | `install.test.ts` |
| **Bildschirme und Overlays** | **nicht vorhanden** | 21 neue Dateien |
| **Bedien-Hooks** (Gesten) | **sehr gut** — 36 Fälle inkl. abgebrochener Berührungen | Fokusfalle ergänzt |

---

## 6. Fachliche Funde nebenbei

Drei Dinge, die beim Schreiben der Tests herauskamen und keine bloßen
Abdeckungslücken sind:

### 6.1 Die Verweis-Vorlagen wurden nie aufgerufen

`translate-data.test.ts` prüfte für `REF` (die Vorlagen hinter „th Lektion 11",
„lmd Lektion 4 Punkt 3", „Gruppe 2", „Vers. Nordheim") nur, ob es die Vorlage
*gibt* — `typeof === 'function'`. **281 dieser Vorlagen** (33 Sprachen × 9)
wurden nie ausgeführt.

Der Fehlerfall ist konkret: `thLek: () => 'th Lektion'` ist eine Funktion und
käme durch; jede Schulungsaufgabe dieser Sprache stünde danach ohne
Lektionsnummer da. Die EXTRA-Prüfung nebenan führt genau gegen diesen Fall eine
Durchreiche-Probe — REF hatte sie nicht.

Ergänzt: jede Vorlage wird jetzt am **echten Weg** durch `makeTr` gemessen,
inklusive der Reihenfolge zweier Zahlen (*„Lektion 3 Punkt 4" ist nicht
„Lektion 4 Punkt 3"*) und der Unterscheidung verschiedener Publikationen.

### 6.2 Dänisch und Norwegisch sagen ebenfalls „Gruppe"

Beim Schreiben der Probe fiel eine falsche Annahme auf: „übersetzt" heißt nicht
„anders". `REF.da.gruppe('2')` liefert `Gruppe 2` — richtig, nicht durchgefallen.
Die Probe vergleicht deshalb gegen die Vorlage selbst statt gegen „ungleich der
Eingabe".

### 6.3 Der Formatvertrag des `date`-Felds war ungeschrieben

`meetingDateParts` erkennt nur **ausgeschriebene** Wochentage. Stünde in einem
`date`-Feld „Fr, 11. September · 19:30", übernähme die Anzeige die Uhrzeit, den
Tag aber weiter aus dem Rhythmus — Dienstag, 19:30. Alles, was die App selbst
schreibt, ist ausgeschrieben; der Fall steht jetzt als Grenze in
`ProgrammScreen.test.tsx`, damit ein von Hand oder aus fremder Quelle gefülltes
Feld nicht unbemerkt einen falschen Tag zeigt.

---

## 7. Was dazugekommen ist

1041 Testfälle in 21 neuen Dateien und einer Ergänzung:

| Datei | Fälle | Deckt ab |
| --- | --- | --- |
| `app/shell.test.tsx` | 48 | Navigationsrechte, Mitteilungs-Chip, Offline-Banner, Status-Ansichten, Einladungscode, Drawer, Deep-Link, Begrüßung |
| `planen/MeetingSection.test.tsx` | 39 | Slot-Chips, Bestätigungs-Zeichen, Redner-Platz, Zusätzliche Klasse, LAC-Bearbeitung, Wochenend-Lieder |
| `planen/AssignSheet.test.tsx` | 37 | Kandidatenliste, Abwesenden-Sperre, Gastredner ↔ eigener Redner, S-89, Auslastungs-Quadrate |
| `personen/PersonenScreen.test.tsx` | 36 | Liste, Zähler, Suche, Filter, Dubletten- und Rollen-Warnung, Sammel-Einladung, Waisen-Konten |
| `planen/panels.test.tsx` | 31 | Auto-Zuteilung, Zwei-Tipp-Leeren, Ratgeber, Treffpunkte planen, Gruppenaufseher-Grenze |
| `einstellungen/panels.test.tsx` | 30 | Zusammenkunftszeiten, Zusätzliche Klasse, Gruppen, Erinnerungen, Sprache, Rechte |
| `components/WeekBadges.test.tsx` | 30 | Wochen-Chips, Gedächtnismahl- und Ausfall-Banner, Termine, Wochennavigation |
| `programm/ProgrammScreen.test.tsx` | 30 | Termin-Rechnung, DU-Chip, zwei Räume, Hilfsdienst-Übersicht, Drucken |
| `dashboard/DashboardScreen.test.tsx` | 29 | Gruß, nächste Aufgabe, „Diese Woche", Kacheln, Planungs-Kachel |
| `profil/ProfilScreen.test.tsx` | 27 | Push-Schalter, iOS-Hinweis, Farbschema, Schriftgröße, Sprache, Diagnose |
| `personen/PersonDetail.form.test.tsx` | 26 | Stammdaten, Rolle, Gruppe, Familie, Bereichs-Vollständigkeit, Löschen |
| `login/login.test.tsx` | 26 | Anmelden, Registrieren, Passwort vergessen, Demo-Modus, Recovery |
| `components/overlays.test.tsx` | 26 | Mitteilungen, Aufgaben-Blatt (drei Zustände), S-89-Formular |
| `einstellungen/import-dienste.test.tsx` | 26 | Programm-Import (Demo + Produktion), Hilfsdienste, Freigabe-Zahl |
| `einstellungen/FsRulesPanel.test.tsx` | 24 | Grundplan der Treffpunkte, Sprach-Sheet |
| `planen/wochen-bearbeiten.test.tsx` | 23 | Sonderwochen (Verlegung, Ausfall), weitere Termine |
| `components/push-opt-in.test.tsx` | 22 | Push an/aus, Sprachwechsel am Abo, Opt-in-Hinweis, iOS |
| `planen/PlanBanners.test.tsx` | 21 | Offene Zuteilungen, „nicht besetzbar" (T96), Treffpunkt-Konflikte |
| `personen/KontoCard.test.tsx` | 20 | Drei Konto-Zustände, Mail-Versand mit `mailto:`-Rückfall |
| `aufgaben/AufgabenScreen.test.tsx` | 20 | Aufgabenliste, Einspringen, „Deine Einträge" |
| `lib/install.test.ts` | 15 | Installations-Ereignis, einmalige Verwendung, schon installiert |
| `components/useDialogFocus.test.tsx` | 10 | Fokusfalle: hinein, drinnen bleiben, zurückgeben |
| `i18n/translate-data.test.ts` (ergänzt) | +4 | REF-Durchreiche in jeder Sprache |

**Jeder** dieser Tests wurde sabotage-geprüft: Die zugehörige Regel wurde im
Quellcode gebrochen und der Lauf musste rot werden. Zwölf davon sind als
dauerhafte Einträge in `scripts/mutationsprobe.mjs` hinterlegt und dort einzeln
als *bewacht* nachgewiesen.

---

## 8. Die zunächst offenen Punkte — nachgezogen

Fünf Stellen waren mit Begründung liegengeblieben. Beim Nachziehen hat sich
gezeigt, dass **vier der fünf Begründungen nicht trugen**: Was wie „braucht
eine echte Umgebung" aussah, war in Wahrheit die Seite der App an einem
Vertrag — und die lässt sich messen, ohne die Gegenseite zu haben.

| Stelle | vorher | jetzt | Was die Begründung übersehen hatte |
| --- | --- | --- | --- |
| `import-week/index.ts` | 68 % | **88,5 %** | Nicht die jw.org-Antworten waren ungeprüft, sondern der **fremdsprachige Import**: der „Lesen in"-Umschalter ist der einzige Anker zur übersetzten Wochenseite. Fällt er weg, importiert jede nichtdeutsche Versammlung ab dann stillschweigend Deutsch. |
| `app/store.tsx` | 80 % | **97,5 %** | Der Sitzungs-Listener braucht keine Instanz — geprüft wird, was die App auf `SIGNED_IN`/`SIGNED_OUT`/`PASSWORD_RECOVERY` tut, nicht was Supabase sendet. Dazu die beiden Melder (Schreibfehler-Sperrfrist, Konflikt-Nachladen nach T39). |
| `planen/PlanenScreen.tsx` | 64 % | **95,5 %** | „Reine Zusammensetzung" stimmt nicht: Die **Auswahl** ist die Regel — der Gruppenaufseher bekommt keine Reiterleiste und keine Bearbeiten-Ansicht. |
| `AbsencePanel` / `DatePicker` | 79 / 88 % | **93 / 100 %** | Nicht „nur Kalender-Navigation": Dort sitzt die Vorbelegung von „Bis" und die Untergrenze, die verhindert, dass ein Zeitraum entsteht, den keine Prüfung je trifft. |
| `planen/WochePanel.tsx`, `PlanBanners.tsx` | 69 / 77 % | **100 / 100 %** | Standen gar nicht in der Liste — dabei fehlten dort das Eintragen des Gedächtnismahl-Datums und alle drei Konflikt-Sätze. |
| Zweig-Abdeckung | 84 % | **86,4 %** | Trug am ehesten — der Rest sind wirklich Defensiv-Zweige. |

Dabei kam eine Lücke heraus, die in der Liste gar nicht stand: Das
**Konflikt-Banner** war nur auf sein *Ausbleiben* geprüft (T81). Was es
schreibt, wenn ein Konflikt vorliegt — die drei Sätze und ihre feste
Reihenfolge —, stand nirgends. Genau daran handelt der Planer.

132 weitere Fälle in vier neuen Dateien und sieben Ergänzungen:

| Datei | Fälle | Deckt ab |
| --- | --- | --- |
| `components/abwesenheit-eintragen.test.tsx` | 27 | Datumswähler (Monatswechsel, Untergrenze, „heute"), Vorbelegung, wer eintragen darf |
| `app/store.effekte.test.tsx` | 26 | Schreibfehler-Meldung, Konflikt-Nachladen, Sitzung, Theme/Schrift/Sprache auf `<html>`, Toast-Auslauf |
| `planen/PlanenScreen.test.tsx` | 21 | Reiter je Rolle, Bearbeiten-Ansicht, Gruppenaufseher-Grenze, Sprachvariante mit Struktur-Abweichung |
| `import-week/text.test.ts` | 18 | HTML-Entities in allen drei Schreibweisen, Ruby, CJK-Fugen |
| `_test/import-week.test.ts` (ergänzt) | +14 | „Lesen in"-Umschalter, Sprachvarianten, Deckel bei vier, Zwischenspeicher, OPTIONS |
| `planen/WochePanel.test.tsx` (ergänzt) | +7 | Gedächtnismahl-Datum und Kongress-Zeitraum eintragen |
| `planen/konflikte.test.tsx` (ergänzt) | +6 | Die drei Konflikt-Sätze und ihre Reihenfolge |
| `components/WeekStrip.test.tsx` (ergänzt) | +4 | Wischgeste verdrahtet, Grenzen, Vorschau löst nichts aus |
| `components/ConfirmDialog.test.tsx` (ergänzt) | +4 | Bestätigen/Absagen treffen die richtige Karte |
| `i18n/relative-time.test.ts` (ergänzt) | +3 | Unbekanntes Sprach-Tag: kein Chip statt Absturz |
| `components/ErrorBoundary.test.tsx` (ergänzt) | +2 | „Neu laden" lädt wirklich neu |

Sieben weitere Regeln stehen jetzt in `scripts/mutationsprobe.mjs` (67 statt 60)
und sind dort einzeln als *bewacht* nachgewiesen.

---

## 9. Was nicht durch Tests zu ersetzen ist

Hier hört das Messen auf — und zwar nicht aus Aufwandsgründen:

| Prüfung | Warum kein Test sie ersetzt |
| --- | --- |
| **Echte Geräte** | Wischgesten brechen auf einem Android-Handy ab, wo sie in der Emulation durchlaufen. Genau dafür gibt es die versteckte Gesten-Diagnose im Profil (fünf Antipper auf die Build-Zeile). |
| **Fachliche Abnahme** | Ob die Auto-Zuteilung *richtig* verteilt, entscheidet ein Koordinator, keine Zusicherung. Die Tests halten fest, was einmal entschieden wurde. |
| **Mehrbenutzer real** | Zwei Planer, zwei Konten, dieselbe Woche. Der Schreibkonflikt (T39) ist einseitig geprüft — dass die Datenbank ihn erzeugt, belegt nur die echte Instanz. |
| **RLS gegen die Produktivinstanz** | Steht in `umgebungspruefungen.md`; die Richtlinien selbst sind kein Anwendungscode. |

Alles davon steht seit August in [offene-pruefungen.md](offene-pruefungen.md)
und bleibt dort.
