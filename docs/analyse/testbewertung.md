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

| | vorher | nachher |
| --- | --- | --- |
| Testdateien | 113 | 134 |
| Testfälle | 1596 | 2637 |
| Zeilen-Abdeckung | 82,9 % ¹ | **95,4 %** |
| Funktions-Abdeckung | 71,1 % ¹ | **93,9 %** |
| Dateien ohne jede Testberührung | **21** (2554 Zeilen) | 0 |
| Einträge in der Mutationsprobe | 48 | **60** |

¹ Beide Zahlen waren zu hoch — siehe § 3.

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

## 8. Was offen bleibt

Bewusst nicht angefasst, mit Begründung:

| Stelle | Abdeckung | Warum offen |
| --- | --- | --- |
| `import-week/index.ts` | 68 % | Die Fehlerpfade hängen an echten jw.org-Antworten. Parser, Gedächtnismahl-Woche und Studienartikel sind einzeln geprüft; der Orchestrierungsrest wäre Mock-Arithmetik. |
| `planen/PlanenScreen.tsx` | 64 % | Reine Zusammensetzung — jedes eingebettete Panel ist jetzt für sich geprüft. |
| `app/store.tsx` | 80 % | Der ungedeckte Rest ist der Supabase-Sitzungs-Listener; er braucht eine echte Instanz (siehe `offene-pruefungen.md`). |
| `components/AbsencePanel.tsx`, `DatePicker.tsx` | 79 / 88 % | Über `abwesenheiten.test.tsx` fachlich abgedeckt; offen ist nur Kalender-Navigation. |
| Zweig-Abdeckung insgesamt | 84 % | Der Rest sind Defensiv-Zweige (`?? ''`, `if (!x) return`), die als Ränder bereits geprüft sind. |

**Nicht durch Tests ersetzbar** bleibt, was `offene-pruefungen.md` schon nennt:
echte Geräte, die fachliche Abnahme durch einen Koordinator und der
Mehrbenutzer-Betrieb.
