# Nachtrag: Import und Oberfläche in fremden Sprachen (T59, T60)

Vorgabe des Betreibers: *„prüfen, ob beim import alles auch richtig gemacht
wird in anderen sprachen. und mal testweise auf hebräisch umstellen und sehen
ob alle texte hebräisch sind."*

Beides ist **gemessen**, nicht gelesen: der Import an 19 echten
jw.org-Wochenseiten, die Oberfläche an einem echten Durchlauf mit hebräischer
Bedien- **und** Versammlungssprache.

---

## T59 · Der Import in 19 Sprachen

### Wie gemessen wurde

Die Wochenseite 6.–12. Juli 2026 in 19 Sprachen geholt (über den
„LESEN IN"-Umschalter, denselben Weg, den `localizedUrl` geht) und durch
`parseWorkbookWeek` geschickt. Verglichen wurde Feld für Feld gegen die
deutsche Fassung: Wochenüberschrift, Bibelbuch, Sektionsbeschriftungen,
Punktnummer, Titel, Meta-Zeile (Rahmen · Minuten · Quelle), Eröffnung,
Abschluss.

Sprachen: ar · cmn-hans · de · el · en · es · fa · fi · he · hi · hu · ja · ko ·
pt · ru · sw · th · tl · ur · vi.

### Was dabei herauskam

**In sieben von 19 Sprachen war die Meta-Zeile jedes Programmpunkts leer** —
keine Minuten, kein Rahmen, keine Quellenangabe, und bei der Bibellesung fehlte
zusätzlich die Schriftstelle im Titel. Betroffen: **ar, fa, he, ur, sw, ja,
cmn-hans**.

Die Ursachen liegen alle in derselben Annahme — dass „Struktur" heißt, was im
Deutschen strukturell ist:

| Was | Wo es auffiel | Warum |
| --- | --- | --- |
| **Zeitzeile nicht erkannt** | sw | `(Dak. 10)` — das Wort steht **vor** der Zahl, die alte Regel verlangte die Ziffer direkt hinter der Klammer |
| dito | he, ur | `‏(‏10 דק׳)‏` — eine unsichtbare RTL-Marke **vor** der Klammer und eine dahinter; eine Marke ist kein Leerraum |
| dito | ar, fa | `(١٠ دق)` — `\d` kennt nur 0–9 |
| dito | ja, cmn-hans | `（10 分钟）` — vollbreite Klammern |
| **Punktnummer blieb im Titel** | ar, fa | `١-‏` — arabisch-indische Ziffer und **Bindestrich** statt Punkt; `Number('١')` ist `NaN` |
| dito | cmn-hans | `1．` — vollbreiter Punkt |
| **Lesehilfe mitten im Titel** | ja, cmn-hans | Furigana/Pinyin (`<ruby><rb>従</rb><rt>したが</rt></ruby>`) blieb stehen — **und** das allgemeine Tag→Leerzeichen zerlegte jeden Satz in Einzelzeichen: „言 こと 葉 ば" statt „言葉" |
| **Deutscher Text im Programm** | cmn-hans | die chinesische Ausgabe setzt beim Schlusswort **kein** Noten-Symbol → Abschluss nicht erkannt → die deutsche Rückfall-Vorlage „Schlussworte · Gebet · 3 Min." stand mitten im chinesischen Programm |
| **Rahmen leer** | hi | der Rahmen endet am Danda `।`, nicht am Punkt — er lief bis in die Quellenangabe und fiel dort durch die Ziffernprüfung |

**Bemerkenswert:** Swahili nutzt lateinische Schrift und westliche Ziffern und
fiel trotzdem komplett aus. Es hängt nicht an fremden Schriften, sondern an
jeder Annahme, die nur im Deutschen geprüft wurde.

### Was geändert wurde

Alles in `supabase/functions/import-week/`:

- **`text.ts` (neu)** — die Textaufbereitung, die sich `parse.ts` und `study.ts`
  jetzt teilen. Vorher hatte jede ihre eigene: `study.ts` konnte Ruby und
  CJK-Fugen, kannte aber nur vier Entities; `parse.ts` dekodierte alle
  Entities, ließ dafür die Lesehilfe stehen. Ergebnis: der Wachtturm-Artikel
  kam auf Japanisch sauber an, das Programm derselben Woche nicht.
- **Inline-Auszeichnung fällt ersatzlos weg** statt zur Leerstelle zu werden.
  Das entspricht auch HTML (`<b>Wort</b><i>zwei</i>` liest sich „Wortzwei") und
  ist die Wurzel des CJK-Problems, nicht nur sein Symptom.
- **`parse.ts`** — Klammern westlich und vollbreit, Ziffern über `\p{Nd}`,
  Zweirichtungs-Marken beim Vergleichen übersprungen, Satzende um Danda,
  arabisches Satzende, Verjaket und den äthiopischen Punkt erweitert;
  Lied-Zeilen zusätzlich am Liederbuch-Link `pub-sjj` erkannt.
- **Zahlenwert schriftunabhängig** (`ziffernWert`): von einer Ziffer rückwärts
  zählen, bis das Zeichen davor keine Ziffer mehr ist. Gilt für jede Schrift,
  auch für die, an die niemand gedacht hat — statt einer Tabelle, die veraltet.

**Bewusst nicht behoben:** Thai. Thai trennt Sätze durch Leerzeichen, nicht
durch Satzzeichen — es gibt nichts, woran der Rahmen enden könnte. Er bleibt
leer, statt den halben Folgesatz mitzunehmen. Als Test festgehalten, damit es
eine Entscheidung bleibt und keine unbemerkte Lücke.

**Ergebnis nach der Änderung:** in allen 19 Sprachen keine leere Meta-Zeile
mehr, kein deutscher Rückfalltext, 19 von 20 mit Rahmen (Thai wie begründet
ohne). Die deutsche Fassung kommt Zeichen für Zeichen unverändert heraus.

### Was **kein** Mangel war

Drei Verdachtsstellen aus der Aufgabenbeschreibung haben sich nicht bestätigt:

- **Quellenangaben** („greift keine `verweisRegeln`-Regel"): Für eine
  griechische Versammlung steht dort `lmd μάθημα 1 σημείο 5` — richtig so.
  `verweisRegeln` übersetzt **aus dem Deutschen**; ein bereits griechischer
  Verweis braucht keine Regel und bekommt keine.
- **Wochentag/Datum**: `meeting-dates.ts` rechnet ausschließlich mit
  `week.start` (ISO), nie mit der Wochenüberschrift. Die
  Überschrift ist reiner Anzeigetext.
- **Sprachcodes**: `CONG_TO_JW` liefert die jw.org-Codes samt Skriptvarianten
  (`cmn-hans`, `sr-latn`) korrekt. (Mein erster Messversuch scheiterte an
  `zh-hans` — mein Fehler im Messskript, nicht im Code.)

### Was offen bleibt

**T32 wird durch diese Messung konkret.** `itemMinutes` liest die Minuten mit
`/(\d+) Min\./` aus dem Anzeigetext. Nach dem Fix stehen dort „Dak. 3",
„3 分钟", „٣ دق", „3 λεπτά" — der Ausdruck greift in **keiner** davon. Die
„+/−"-Knöpfe im Planen-Screen bewirken bei nicht-deutscher Versammlungssprache
nichts, ohne jede Rückmeldung. Der Parser kennt die Zahl inzwischen (er
zerlegt die Zeitklammer ohnehin) — der saubere Weg ist, sie als eigenes Feld
mitzuführen, wie T32 es beschreibt.

---

## T60 · Vollständigkeitsprobe auf Hebräisch

### Wie gemessen wurde

Echter Durchlauf mit **beiden** Sprachen auf Hebräisch
(`#s=programm&l=he&c=Hebräisch`) — der Debug-Hash kann das längst, meine
frühere Notiz („kennt bisher nur `l=`") war falsch: `c=` ist seit jeher
verdrahtet (`init.ts:162`).

Dann alle sieben Screens plus Overlays durchlaufen und **jeden Textknoten**
eingesammelt, der lateinische Buchstaben enthält.

### Was dabei herauskam

**Ein echter Fund — und der wog schwer:** Die Liste der Versammlungssprachen
zeigte **alle 482 Namen auf Deutsch**, in jeder Bediensprache. Eine
hebräischsprachige Versammlung las ihre eigene Sprache als „Hebräisch" und
wählte aus 482 deutschen Wörtern. Die Herkunft erklärt es: `JW_LANGS` wurde aus
dem Umschalter der **deutschen** Wochenseite erzeugt.

Alles andere war entweder Daten oder eine begründete Entscheidung:

| Fund | Bewertung |
| --- | --- |
| Personennamen, Versammlungsname | Daten — stehen zu Recht, wie eingegeben |
| Abwesenheitsgründe („Urlaub", „Dienstreise") | Freitext des Nutzers (`reason`), Rückfall `t.ohneAngabe` |
| Bediensprachen-Auswahl („Deutsch", „English", „עברית") | native Namen — richtig so, wie in jedem Sprachwähler |
| Farbschema-Namen („Jasmin", „Matcha", „Safran") | bewusste Entscheidung (`constants.ts`): Eigennamen aus einer Familie, die in allen Sprachen als Lehnwort existiert. **In nicht-lateinischen Schriften bleibt es lateinisch** — das ist der Preis dafür, 11 Eigennamen nicht 34-mal erfinden zu müssen. Zur Bestätigung vorgelegt. |
| „Build ⟨Kennung⟩" im Profil | Diagnosezeile, absichtlich unübersetzt (wie der Protokolltext direkt darunter) — sie wird kopiert und weitergegeben |
| „Was wir von den Rechabitern lernen" | einer der 22 veröffentlichten Titel aus `NUR_GEMESSEN_UEBERSETZBAR` (T25). Nur im Demo sichtbar; importierte Wochen tragen den Titel längst in der Zielsprache (siehe T59). |

### Was geändert wurde

**Die 482 Sprachnamen gibt es jetzt in allen 33 Bediensprachen** — und keiner
davon ist erfunden.

Die Quelle ist derselbe Umschalter, aus dem die deutsche Liste stammt: öffnet
man dieselbe Seite in einer anderen Sprache, stehen dort alle 482 Namen in
**dieser** Sprache. Ein Abruf je Sprache genügt, 33 insgesamt. Damit gilt hier
dieselbe Linie wie bei den Verweis-Vorlagen: gemessen, nicht ausgedacht.

- **`src/i18n/langnames/*.ts`** (33 Dateien, erzeugt) — je Zeile `code|name`.
  Getrennt wird mit Zeilenumbruch, nicht mit Semikolon: Finnisch schreibt
  `kiina (kantoni; perint.)`, das Semikolon steht **im Namen**. Der Generator
  bricht bei einem Trennzeichen im Namen ab, statt stille Trümmer zu erzeugen —
  genau daran fiel es auf.
- **`src/i18n/langnames.ts`** — Nachladen nach dem Muster der UI-Overlays. Je
  Sprache 4–8 KB gzip, geladen **nur** beim Öffnen der Einstellungen. Bis dahin
  (und wenn nach einem Deployment der alte Chunk fehlt) steht der deutsche
  Name: lesbar bleibt es immer.
- **Gespeichert wird weiter der deutsche Name.** Er steht so in der Datenbank;
  eine Umstellung der Anzeige darf ihn nicht mitnehmen, sonst fände keine
  bestehende Versammlung ihre Sprache wieder. Angezeigt wird die Übersetzung,
  sortiert mit der Kollation der Bediensprache.
- **Gesucht wird über beide Namen.** Wer „Griechisch" tippt, findet „יוונית",
  und wer „עברית" tippt, findet es auch — nach einem Sprachwechsel weiß man oft
  nur noch einen von beiden.

Geprüft im Browser: 482 hebräische Einträge in hebräischer Sortierfolge, die
gewählte Sprache als „עברית ✓", und beide Suchwege funktionieren.

### Zur Entscheidung

**Farbschema-Namen in nicht-lateinischen Schriften.** „Jasmin", „Matcha",
„Safran" stehen einer hebräisch-, arabisch- oder chinesischsprachigen
Oberfläche in lateinischer Schrift gegenüber. Die Begründung in `constants.ts`
(Lehnwörter, die überall verstanden werden) trägt für das **Wort**, nicht für
die **Schrift**: auf Hebräisch schriebe man יסמין. Drei Wege:

1. **So lassen** — Eigennamen, wie Markennamen auch. Kein Aufwand.
2. **Umschreiben lassen** für die 11 Sprachen mit eigener Schrift (11 × 11 =
   121 Einträge). Das wäre erfunden, nicht gemessen — gegen die Linie des
   Projekts.
3. **Durch etwas ersetzen, das keine Schrift braucht** — z. B. nur den
   Farbfleck plus hell/dunkel. Ändert die Oberfläche für alle.

Empfehlung: **1**, mit dem Vermerk im Code, dass es eine bewusste Grenze ist.
