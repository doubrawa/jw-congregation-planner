# Code-Review — Congregation Planner

Stand: 7. August 2026, Commit `e2cdb41`. Reine Analyse-Session, **keine
Code-Änderungen**. Schwester-Dokumente: [befunde.md](befunde.md) (konkrete Fehler),
[funktionsuebersicht.md](funktionsuebersicht.md) (was die App kann).

Dieses Dokument bewertet **Struktur** statt Einzelfehler: Tragfähigkeit des
Datenmodells, Robustheit gegen sich ändernde Annahmen, SOLID, Clean Code,
Performance.

---

## Inhalt

- [1. Gesamteindruck](#1-gesamteindruck)
- [2. Das Wochen-Array — die tragende Annahme](#2-das-wochen-array--die-tragende-annahme)
- [3. Robustheit: Annahmen, die umkippen können](#3-robustheit-annahmen-die-umkippen-können)
- [4. SOLID](#4-solid)
- [5. Clean Code](#5-clean-code)
- [6. Performance](#6-performance)
- [7. Empfehlungen, priorisiert](#7-empfehlungen-priorisiert)

---

## 1. Gesamteindruck

Das ist überdurchschnittlich gebauter Code. Bevor die Kritik kommt, die Punkte,
die man beim Umbauen **nicht** verlieren sollte:

- **Reiner Reducer, Nebeneffekte getrennt.** `reducer.ts` ist frei von I/O,
  `persist.ts` macht ausschließlich I/O, `init.ts` den Startzustand, `store.tsx`
  verdrahtet. Diese Trennung ist der Grund, warum sich die App überhaupt so gut
  lesen und testen lässt.
- **Kommentare erklären das „warum".** `helpers.ts:292-309` (warum LOAD_RADIUS = 2),
  `planning.ts:54-76` (warum der Hash gemischt wird), `types.ts:282-294` (warum
  Positionen absolut bleiben müssen) — das ist Dokumentation, die echte
  Fehlersuchen konserviert. Selten und wertvoll.
- **Fail-safe-Design an der richtigen Stelle.** `readonly.ts` führt bewusst eine
  Positivliste, damit eine vergessene neue Aktion als Schreibzugriff gilt.
- **Sprachunabhängiger Parser** mit Fixture-Tests in einer erfundenen Sprache.
- **Zwei Simulationstests** für die Auto-Zuteilung — genau am schwierigsten Punkt.

Die Kritik unten betrifft fast ausschließlich **Struktur**, nicht Handwerk.

---

## 2. Das Wochen-Array — die tragende Annahme

> Dein Verdacht stimmt. Der Array-Index **ist** das Datum — und das trägt weiter,
> als es sollte.

### 2.1 Was der Index alles bedeutet

`state.weeks` ist ein `Week[]`. Der Index dieses Arrays ist gleichzeitig:

| Rolle des Index | Wo | Beleg |
| --- | --- | --- |
| **Primärschlüssel in der Datenbank** | `weeks.position`, `fs_weeks.position` | `schema.sql:93`, `lib/data.ts:755` |
| **Bestandteil jedes `task_key`** | Bestätigungen, Erinnerungen | `planning.ts:763` `` `${wi}|${tab}|part|…` `` |
| **Kalenderabstand in Wochen** | Auslastungs-Fenster | `helpers.ts:323` `for (i = wi−radius … wi+radius)` |
| **Kalenderabstand in Wochen** | Wartezeit-Tie-Break | `planning.ts:117` `Math.abs(wi − weekIndex)` |
| **Kalenderabstand in Wochen** | Serien-Konflikt („3 Wochen in Folge") | `planning.ts:1131-1141` (Nachbarschaft im Array) |
| **Kalenderdatum** | Treffpunkte | `fs.ts:59` `base + wi*7 + wd` |
| **Kalenderdatum** | Zeitleiste | `person-timeline.ts:77` `pos.wi * 7 + offset` |
| **Kalenderdatum** | Abwesenheiten (Demo/Vorlagen) | `meeting-dates.ts:97` `base + wi*7 + offset` |
| **Rotationszähler** | Reinigungsgruppe | `planning.ts:390` `groups[weekIndex % groups.length]` |
| **Kopplung zweier Arrays** | `weeks[i]` ↔ `fsWeeks[i]` | `context.ts:108-109` |
| **Schlüssel der Abwesenheits-Menge** | `<personId>\|<wi>\|<tab>` | `absence.ts:53` |

Elf Bedeutungen für eine Zahl. Jede davon setzt still voraus:

> **Der Index n ist genau n Wochen nach Index 0, lückenlos, aufsteigend sortiert.**

Diese Annahme steht nirgends im Code, wird nirgends geprüft und ist an keiner Stelle
erzwungen.

### 2.2 Es ist bereits einmal gebrochen — und wurde geflickt statt gelöst

Das Projekt kennt das Problem. Zwei Krücken belegen es:

1. **`Week.stub`** (`types.ts:282-294`): Als das Ladefenster auf 52 Wochen begrenzt
   wurde, hätten sich alle Indizes verschoben. Statt die Kopplung zu lösen, werden
   jetzt leere Platzhalter vorne eingesetzt, damit „der Index weiterhin der
   DB-Position entspricht". Das rettet den **Anfang** des Arrays — Lücken in der
   **Mitte** rettet es nicht.
2. **`migration-015-abwesenheit-datum.sql`**: Abwesenheiten waren als Wochenindizes
   gespeichert. Die Migration begründet den Wechsel auf Datumswerte wörtlich:
   „Ein Index zeigt auf ‚die n-te geladene Woche'. Sobald nicht mehr alle …" —
   also genau diese Diagnose, aber nur für **eine** von elf Verwendungen gezogen.

Die Lehre wurde also gezogen und dann nicht zu Ende geführt.

### 2.3 Wann es bricht — drei realistische Wege

**Weg A: Lücke in den DB-Positionen durch einen stillen Schreibfehler** ✅

`addImportedWeek` hängt die Woche im State an; `persist.ts:204-208` schreibt sie mit
`position = next.weeks.length − 1` — **fire and forget**. Schlägt der Write fehl
(RLS, Netz, Timeout), landet der Fehler ausschließlich in `console.error`
(`lib/data.ts:744`). Der Nutzer sieht den Erfolgs-Toast.

Importiert er anschließend die nächste Woche, geht die auf Position `n+1`.
In der Datenbank fehlt jetzt `n`. Beim nächsten Laden baut
`lib/data.ts:614-625`:

```js
const weekList = [...Array.from({length: weekFrom}, stubWeek), ...geladeneZeilen]
```

Die geladenen Zeilen werden **positionsblind aneinandergereiht**. Aus Positionen
`[…, n−1, n+1]` wird `[…, index n−1, index n]`. Ab hier zeigt **jeder** gespeicherte
`task_key` der letzten Woche auf die falsche Woche: Bestätigungen gehören zur
falschen Person, Erinnerungen gehen für die falsche Zusammenkunft raus.

**Weg B: Lücke im Kalender bei lückenlosen Positionen** ✅

Der Planer importiert nicht jede Woche (Kongresswoche, Urlaub, später Einstieg).
Positionen bleiben lückenlos — der **Kalender** hat aber ein Loch.

Ab hier misst die Fairness-Logik falsch:

- `LOAD_RADIUS = 2` heißt dann nicht mehr „±2 Wochen", sondern „±2 Einträge",
  also z. B. ±6 Kalenderwochen. Das Zuteilungs-Sheet schreibt trotzdem
  „*n* Aufgaben in 5 Wochen" unter den Namen (`AssignSheet.tsx:187`).
- `assignmentDistance` (`planning.ts:117`) meldet „vor 2 Wochen dran gewesen",
  obwohl es zwei Monate her ist.
- Der Serien-Konflikt („3 Wochen in Folge", `planning.ts:1131`) meldet eine Serie,
  wo Lücken von Wochen liegen.

Das ist besonders unangenehm, weil `helpers.ts:292-309` ausführlich begründet,
warum genau diese Zahl gezeigt **und** verwendet wird: „also gilt die Zahl, die man
auch sieht". Die Zahl stimmt nur, solange lückenlos importiert wird.

**Weg C: Wochen nicht in Kalenderreihenfolge** ✅

`addImportedWeek` (`reducer.ts:450`) hängt bedingungslos an. Es gibt **keine**
Sortierung nach `week.start` und keine Duplikatprüfung. Die Reihenfolge im Array ist
die **Import-Reihenfolge**. `importNextWeek(latestImportedStart(...))` hält das
üblicherweise ein — aber niemand erzwingt es.

### 2.4 Der Reinigungs-Sonderfall

`planning.ts:390`: `groups[weekIndex % groups.length]`

Die Rotation hängt an der **absoluten Position** und an der **aktuellen Anzahl**
Gruppen. Legt die Versammlung eine vierte Gruppe an, ändert sich rückwirkend die
Zuordnung für jede Woche — auch für vergangene und für bereits ausgedruckte
Programme. Fachlich rotiert die Reinigung aber entlang der **Zeit**, nicht entlang
einer Array-Position.

Dass hier ein Datum gemeint ist, sieht man auch am Fallback
(`planning.ts:619`): `` `Gruppe ${1 + (weekIndex % 3)}` `` — eine fest verdrahtete 3.

### 2.5 Wo es (noch) nicht problematisch ist

Fairnesshalber: In drei Fällen ist der Index die **richtige** Wahl.

- Als **Datenbank-Primärschlüssel** ist eine fortlaufende Position sauber, solange
  sie nie neu vergeben wird.
- Für **`prevWeek`/`nextWeek`** ist Array-Navigation genau richtig.
- Für die **Anzeige-Nachbarschaft** im `WeekStrip` ebenfalls.

Das Problem ist nicht der Index an sich — es ist, dass er **zusätzlich** als
Kalenderabstand und als Datum interpretiert wird.

### 2.6 Empfehlung

Nicht alles auf einmal. Drei Stufen, jede für sich nützlich:

1. **Datum als Wahrheit einführen, Index als Adresse behalten.**
   `week.start` ist bei importierten Wochen bereits vorhanden. Eine Funktion
   `wochenAbstand(a: Week, b: Week): number` — aus `start` gerechnet, mit Fallback
   auf die Indexdifferenz — ersetzt `Math.abs(wi − weekIndex)` in
   `assignmentDistance`, das Fenster in `loadWindow`/`AssignSheet` und die
   Nachbarschaft in `weekConflicts`. **Kein Datenmodell-Umbau, kein Migrationsrisiko**,
   behebt Weg B vollständig.
2. **Lücken beim Laden erkennen statt annehmen.**
   `lib/data.ts:614` an der Position der Zeile ausrichten statt aneinanderreihen:
   ein Array der Länge `höchstePosition+1` anlegen und jede Zeile an ihren
   `position`-Index setzen; Fehlstellen werden `stubWeek()`. Zehn Zeilen, behebt
   Weg A vollständig und macht `Week.stub` konsequent statt halb.
3. **`task_key` von der Position lösen.** Der große Schritt: eine stabile Slot-Id
   im Datenmodell. Beseitigt zusätzlich B3, B13 und die Fragilität von B8. Braucht
   eine Migration — je später, desto teurer.

Für die Reinigungs-Rotation: aus `week.start` die ISO-Kalenderwoche rechnen und
`kw % gruppen.length` verwenden. Dann bleibt die Zuordnung stabil, wenn Wochen
fehlen — nicht aber, wenn Gruppen dazukommen; letzteres bräuchte eine gespeicherte
Zuordnung.

---

## 3. Robustheit: Annahmen, die umkippen können

### 3.1 Schreibfehler sind für den Nutzer unsichtbar ✅ — größtes Robustheitsrisiko

`lib/data.ts:742-745` ist die **einzige** Fehlerbehandlung für **alle**
Schreibvorgänge:

```js
async function run(promise) {
  const { error } = await promise
  if (error) console.error('[persistenz]', error.message)
}
```

Alle 20 `save*`/`delete*`-Funktionen rufen `void run(...)`. Der Erfolgs-Toast
(„Zugeteilt", „Person gelöscht") entsteht im **Reducer**, also bevor überhaupt
geschrieben wurde. Konsequenz:

- RLS-Verstoß, abgelaufenes Token, 500er, Timeout → der Nutzer sieht Erfolg
- der State bleibt „richtig", die Datenbank nicht
- beim nächsten Laden ist die Arbeit weg, ohne dass je etwas gemeldet wurde

Das steht in scharfem Kontrast zur sorgfältigen Offline-Behandlung: Ist das Netz
**erkennbar** weg, blockiert die App vorbildlich (`readonly.ts`, Banner, Hinweis).
Geht ein einzelner Schreibvorgang schief, passiert nichts.

**Minimalfix:** `run()` einen Callback geben, der bei Fehler einen Toast auslöst
(„Änderung konnte nicht gespeichert werden — bitte neu laden"). Der Wrapper
existiert bereits, es fehlt nur der Weg zurück in die UI.

### 3.2 Strings tragen Semantik ✅

Das Datenmodell speichert an vielen Stellen strukturierte Information in Fließtext
und liest sie per Regex/`split` zurück:

| Feld | Beispiel | Wird zerlegt in |
| --- | --- | --- |
| `Meeting.date` | `"Dienstag, 8. September · 19:00 · Königreichssaal"` | Wochentag, Zeit, Ort (`meeting-dates.ts:58`, `planning.ts:884`) |
| `Meeting.end` | `"Ende ca. 20:45"` | Uhrzeit (`meeting-edit.ts:26`) |
| `PartItem.meta` | `"Von Haus zu Haus · 10 Min. · th Lektion 5"` | Rahmen, Minuten, Quelle (`planning.ts:720`) |
| `PartItem.title` | `"Schlussworte · Lied 76 · Gebet"` | Lied vs. Rest (`helpers.ts:22`) |
| `SlotAssignment.rolle` | `"Gastredner · Vers. Nordheim"` | Rolle + Herkunft (`AssignSheet.tsx:87`) |
| `Congregation.meetings` | `"Di 19:00 · So 10:00"` | zwei Wochentage + zwei Zeiten (`meeting-dates.ts:20`) |
| `Group.name` | `"Gruppe 3"` | Rotationsträger **und** Anzeigename (`planning.ts:619`) |
| `task_key` | `"60\|mid\|part\|2\|1\|0"` | 6 Felder (`planning.ts:791`) |

Das ist bewusst so entstanden (Portierung aus dem HTML-Prototyp) und wird durch die
Übersetzungsschicht sogar erzwungen — `translate.ts:151` teilt an `' · '`, um
Atome einzeln zu übersetzen. Aber es erzeugt harte Kopplungen:

- **B7** (LAC-Minuten tot bei fremdsprachigem Import) ist eine direkte Folge:
  `/(\d+) Min\./` trifft „10 min." nicht.
- `HelpersPanel.tsx:41` erkennt eine Gruppen-Zuteilung an
  `name.startsWith('Gruppe')` — eine Person namens „Gruppe" oder eine umbenannte
  Gruppe kippt das.
- `planning.ts:192` prüft `rolle.startsWith('mit')`, `planning.ts:919` dagegen
  `rolle.startsWith('mit ')` **mit Leerzeichen**. Eine Rolle „mitwirkend" würde an
  einer Stelle als Begleiter gelten, an der anderen nicht. ✅
- `SKIP_ROLE = /Gastredner|Kreisaufseher/` (`planning.ts:45`) läuft gegen einen
  String, der zur Hälfte aus **Nutzer-Freitext** besteht (der Versammlungsname im
  zweiten Atom). Ein Ortsname, der eines der beiden Wörter enthält, verwandelt einen
  gewöhnlichen Slot in einen externen.
- `task_key` wird per `join('|')` gebaut und per `split('|')` zerlegt, ohne
  Escaping. Dienst-Keys sind heute UUID-basiert, also unkritisch — die Annahme ist
  aber ungeprüft (`helperKeyParts` erkennt nur die Feldanzahl, `planning.ts:792`).

**Empfehlung:** Nicht alles umbauen. Aber die drei Felder, an denen Logik hängt —
Minuten, Zusammenkunftstermin, Rolle-vs-Herkunft — als eigene Felder führen und den
Anzeigetext daraus **erzeugen**, statt ihn zu parsen.

### 3.3 Der Anzeigename ist die Identität ✅

Zuteilungen speichern `name: string`; `pid` ist optional und fehlt bei
Hilfsdiensten aus Altdaten, externen Rednern, Gruppen-Rotationen und **allen**
Treffpunkt-Leitern (`FsInstance.leader`, `types.ts:88`).

Daran hängt:
- zwei Migrationen beim Laden (`migrateAssignmentNames`, `migrateAssignmentPids`,
  `lib/data.ts:196`/`312`)
- eine Umbenennungs-Kaskade durch alle Wochen (`renameInWeeks`, Z. 224)
- eine eigene Warnung für doppelte Anzeigenamen (`duplicateDisplayNames`)
- ein zusätzliches Feld `dn` allein zur Auflösung von Kollisionen
- serverseitig ein Rückweg Name → Konto (`send-reminders/index.ts:385`)

Fünf Mechanismen, um einen Fremdschlüssel zu ersetzen. Das ist bereits erkannt
(`helpers.ts:134-142` beschreibt es klar) — der letzte Schritt fehlt: `pid`
verpflichtend machen und den Namen nur noch als Anzeige-Cache führen.

### 3.4 Umgebungsannahmen, die auf echten Geräten kippen ✅

| Annahme | Wo | Was passiert |
| --- | --- | --- |
| `localStorage` ist verfügbar | `init.ts:42,46,50`, `store.tsx:72,85,90`, `PushPrompt.tsx:23` | Wirft in Safari-Privatmodus / bei blockierten Cookies. `initialState()` läuft beim Start → **die App startet gar nicht**. `snapshot.ts` und das Inline-Script in `index.html` fangen es korrekt ab — die Startpfade nicht. |
| `crypto.randomUUID` existiert | `reducer.ts:92`, `AufgabenScreen.tsx:59`, `GroupsPanel.tsx:40`, `ServicesPanel.tsx:26`, `helpers.ts:215`, `invite-helpers.ts:27` | Nur in Secure Contexts. Ein Test über `http://192.168.x.x` (Handy im LAN — laut Commit-Historie genau das Vorgehen) lässt jedes Anlegen abstürzen. |
| `structuredClone` existiert | 11 Stellen | Ab Safari 15.4 / Chrome 98 — heute unkritisch, aber ohne Fallback. |
| `navigator.share` | `KontoCard.tsx` | wird geprüft — vorbildlich |

### 3.5 `strict` ist aus — kostet aber nichts, es einzuschalten ✅ gemessen

`tsconfig.app.json`, `tsconfig.node.json` und die Root-`tsconfig.json` setzen
**nirgends** `"strict": true`. Aktiv sind nur `noUnusedLocals`,
`noUnusedParameters`, `erasableSyntaxOnly` und `noFallthroughCasesInSwitch`.

**Gemessen** (siehe [pruefergebnisse.md § 2](pruefergebnisse.md)):

| Konfiguration | Fehler |
| --- | --- |
| wie heute | 0 |
| `--strictNullChecks` | **0** |
| `--strict` | **0** |
| `--strict --noUncheckedIndexedAccess` | **213** |

Der Code ist also **bereits vollständig `strict`-konform** — die Disziplin mit
`?.`, `??` und Guards ist durchgehend. `"strict": true` einzuschalten kostet
**keine einzige Codeänderung** und sichert den erreichten Stand nur ab.

Der eigentliche Hebel ist **`noUncheckedIndexedAccess`** mit 213 Treffern,
konzentriert in genau den Dateien, die mit Wochen, Sektionen und Punkten arbeiten
(`translate.ts` 48, `meeting-edit.ts` 37, `planning.ts` 31, `persist.ts` 19,
`reducer.ts` 14). Das ist die Regel, die zum Datenmodell aus § 2 passt — und
genau der Zugriff, an dem B18 hängt (`MON[m[3]]` in `translate.ts`), wäre damit
als möglicherweise `undefined` markiert worden.

### 3.6 CI führt weder Lint noch Tests aus ✅

`.github/workflows/deploy.yml` besteht aus `npm ci` → `npm run build` → Deploy.
`npm test` (727 Fälle) und `npm run lint` laufen **nicht**.

Die Tests sind damit reine Handarbeit: Wer sie lokal vergisst, deployt trotzdem.
Bei einem Testbestand dieser Qualität ist das die günstigste verpasste Absicherung
im ganzen Projekt — zwei zusätzliche `run`-Schritte.

### 3.7 Lint-Regelsatz sehr schmal ✅

`.oxlintrc.json` aktiviert genau zwei Regeln (`react/rules-of-hooks`,
`react/only-export-components`); es gibt keine `categories`-Angabe, also greifen
nur oxlints Vorgaben.

Nicht abgedeckt sind unter anderem:

- **schwebende Promises** — Ursache von B17 (`loadOverlay(...).then()` ohne
  `.catch()`); `void`-Präfixe stehen zwar konsequent da, aber ungeprüft
- **`react-hooks/exhaustive-deps`** — bei den vielen `useEffect`/`useMemo` mit
  handgepflegten Dependency-Listen (`AppShell.tsx:149`, `useAbwesend.ts:18`) die
  naheliegendste Regel

### 3.8 Zeit als impliziter Eingabewert ✅

`fs.ts:37` (`fsBaseFromWeeks(weeks, today)`) und `person-timeline.ts:46`
(`heute = new Date()`) nehmen die Zeit als Parameter — testbar, sauber.

`DashboardScreen.tsx:27` (`new Date().getHours()` für den Gruß),
`ProgrammScreen.tsx:20` (Stand-Datum), `version.ts:75` und `relative-time.ts:26`
tun es teils nicht. Uneinheitlich, aber nur die ersten beiden sind ungetestet.

### 3.9 Externe Struktur als Vertrag ⚠️

Der jw.org-Parser ist bemerkenswert sorgfältig (Struktur statt Text, Fixtures in
einer erfundenen Sprache). Trotzdem bleibt: **HTML-Parsing per Regex**
(`parse.ts:107`) gegen eine Seite, die sich jederzeit ändern kann. Das ist
dokumentiert und akzeptiert.

Was fehlt: Ein **Plausibilitätscheck** nach dem Parsen. Aktuell wirft nur der Fall
„gar keine Tokens" (`parse.ts:188`). Eine Woche mit 0 Schülerteilen oder ohne
Bibellesung geht stillschweigend durch und landet als kaputtes Programm in der
Datenbank. Zwei Zeilen Prüfung („mindestens eine teal-, gold- und maroon-Sektion mit
je ≥1 Punkt") würden das abfangen.

### 3.10 Mehrbenutzer ✅

Bereits in [befunde.md](befunde.md) S5/B16, hier nur der strukturelle Kern:
`saveWeek` schreibt die **komplette Woche** als JSONB-Upsert. Kein `updated_at`,
keine Versionsspalte, kein Realtime. Zwei gleichzeitig arbeitende Koordinatoren
überschreiben sich vollständig.

Der README diskutiert dieses Risiko ausführlich für den Offline-Fall und entscheidet
sich bewusst gegen Offline-Schreiben. Online besteht dasselbe Risiko unbehandelt —
und die Zielgruppe (mehrere Älteste planen gemeinsam) trifft es direkt.

**Kleinster wirksamer Schritt:** `updated_at` in `weeks`, beim Speichern mitschicken
und serverseitig per Bedingung prüfen; bei Konflikt neu laden und den Nutzer
informieren.

---

## 4. SOLID

### 4.1 Single Responsibility

| Einheit | Umfang | Verantwortlichkeiten |
| --- | --- | --- |
| `reducer.ts` | 895 Zeilen, **78 `case`-Zweige** | Navigation, Rechte, Personen, Gruppen, Dienste, Zuteilung, Treffpunkte, Import, Bestätigungen, Sprache, Erinnerungen, Hydration |
| `persist.ts` | 369 Zeilen, **52 `case`-Zweige** | derselbe Aktionsraum noch einmal, nur mit I/O |
| `planning.ts` | 1148 Zeilen | Slot-Zugriff, Auto-Zuteilung, task_key-Format, Aufgaben-Ableitung, S-89-Erzeugung, Konfliktprüfung, Ersatzgesuche |
| `lib/data.ts` | 1094 Zeilen | Row↔Objekt-Mapping, 5 Lade-Migrationen, Laden, 20 Schreibfunktionen, Seeding, Einladungen |
| `AssignSheet.tsx` | 341 Zeilen | UI **und** die gesamte Kandidaten-Auswahllogik (Filter, Geschlechtsregeln, Auslastung, Sortierung) |

Der Reducer ist als Sammelstelle systembedingt groß — das ist bei `useReducer`
normal und für sich kein Fehler. Kritischer sind die anderen vier:

- **`planning.ts`** vermischt drei unabhängige Themen: *Zuteilen* (schreibend),
  *Ableiten* (lesend) und *Prüfen* (Diagnose). Die Datei enthält außerdem das
  `task_key`-Format, das eigentlich ein eigenes, winziges Modul sein sollte —
  es wird von `persist.ts`, `reducer.ts`, `MyTaskSheet.tsx`, `person-timeline.ts`
  und **zwei Edge Functions** gebraucht.
- **`AssignSheet.tsx`** ist der wichtigste ungetestete Code der App (siehe
  [befunde.md](befunde.md) E). Die Kandidatenlogik ließe sich als reine Funktion
  `kandidaten(state, sel): Candidate[]` herausziehen — dann wäre B6 durch einen Test
  gefallen.

### 4.2 Open/Closed — die parallelen Listen

Eine neue Aktion hinzuzufügen erfordert Änderungen an **fünf** Stellen:

1. `context.ts` — Union-Typ (TypeScript erzwingt es ✅)
2. `reducer.ts` — `case` (TypeScript erzwingt es über die erschöpfende Union ✅)
3. `persist.ts` — `case`, falls sie schreibt (**nicht erzwungen** ⚠️)
4. `readonly.ts` — Positivliste, falls sie nur liest (**fail-safe**: vergessen =
   blockiert, also harmlos ✅)
5. `reducer.ts` `DERIVE_ACTIONS` — falls sie Aufgaben beeinflusst
   (**fail-unsafe**: vergessen = Aufgaben werden stillschweigend nicht neu
   abgeleitet ⚠️)

Punkt 5 ist der gefährliche: Dieselbe Datei, die für `readonly` das
fail-safe-Prinzip ausdrücklich begründet (`readonly.ts:9-11`), führt daneben eine
zweite Liste mit umgekehrter Fehlerrichtung. Genau dort steckt bereits ein Loch:
`lacRemove` und `lacAdd` **stehen** in `DERIVE_ACTIONS`, verschieben aber die
Bestätigungen nicht (B3) — die Ableitung läuft also über inkonsistente Daten.

Weitere geschlossene Erweiterungspunkte:

- `NOTIF_TITLE_KEY` (`i18n/ui.ts:108`) ist eine **exakte** String-Map. Jede neue
  oder dynamische Mitteilungsart fällt stillschweigend auf Deutsch zurück — genau
  das ist bei der Ersatzsuche passiert (D5).
- `PRIV_KEY`, `ROLE_KEY`, `THEME_LIST`, `FS_LABELS` sind alle
  vollständigkeitspflichtig; nur `PRIV_KEY` und `ROLE_KEY` sind über
  `Record<Union, …>` typgesichert.

### 4.3 Interface Segregation — das Gott-Objekt

`AppState` hat **rund 60 Felder** von `screen` bis `langSearch`. `useApp()` liefert
alles; jede Komponente hängt am kompletten Zustand.

Praktische Folgen:

- **Jede** Zustandsänderung rendert **jede** Komponente neu — der Context-Wert ist
  ein neues Objekt (`store.tsx:123`), Selektoren gibt es nicht. Ein Tastendruck im
  Suchfeld der Personenliste rendert das Zuteilungs-Sheet mit.
- Reine Anzeigekomponenten wie `SlotChip` bekommen ihre Daten sauber per Props —
  dieses Muster ist stellenweise schon da und könnte weiter gezogen werden.
- Es vermischt drei Lebenszyklen: **Serverdaten** (persons, weeks, …),
  **UI-Zustand** (notifOpen, slotSel, langSearch) und **Gerätevorlieben** (theme,
  fontScale, lang). `persist.ts` und `readonly.ts` müssen deshalb je Aktion
  entscheiden, worum es geht — eine Aufteilung in drei Kontexte würde beide Listen
  überflüssig machen.

### 4.4 Dependency Inversion

`lib/data.ts` importiert den Supabase-Client direkt und exportiert 20 konkrete
Schreibfunktionen; `persist.ts` importiert sie einzeln (30 Zeilen Import-Block).
Es gibt keine Repository-Schnittstelle.

Das ist für eine App dieser Größe eine vertretbare Entscheidung — der Preis ist
sichtbar: Tests müssen das Modul mocken (`data-save.test.ts`), und die
Fehlerbehandlung sitzt an der falschen Ebene (3.1), weil es keine Stelle gibt, an
der man sie zentral einhängen könnte.

Die Edge Functions gehen den umgekehrten Weg und **duplizieren** die Logik
(4× `meetingDayOffsets`, 2× `displayName`, 2× `taskDate`, 2× `meetingDate`,
2× task_key-Bildung). Das ist die teuerste Form der Entkopplung.

---

## 5. Clean Code

### 5.1 Duplizierung — konkrete Liste ✅

| Was | Wo | Bemerkung |
| --- | --- | --- |
| `mtab()` | `reducer.ts:62`, `persist.ts:45` (identisch), `PlanenScreen.tsx:64` (inline) | 3× |
| Tie-Break-Hash | `planning.ts:67`, `fs.ts:181` | **unterschiedliche Qualität** — der Fairness-Fix fehlt in `fs.ts` (U3) |
| `meetingDayOffsets` | `meeting-dates.ts:19`, `send-reminders:228`, `substitute:114` | 3× |
| `displayName` | `helpers.ts:112`, `send-reminders:209`, `substitute:144` | 3× |
| `taskDate` | `planning.ts:883`, `send-reminders:220` | 2× |
| task_key-Bildung | `planning.ts:755-773`, `send-reminders:283`, `substitute:151` | 3× — Ursache von B8 |
| `SKIP_ROLE` | `planning.ts:45`, `send-reminders:206` | 2× |
| Datumsrechnung | 4 Varianten (U1 in befunde.md) | mit **unterschiedlicher Semantik** |
| „Zwei-Tipp-Bestätigung" | `AutoAssignPanel.tsx`, `FsPlan.tsx` | gleiches Muster, zweimal geschrieben |
| Push-Versand + Abo-Aufräumen | `send-reminders:488-509`, `substitute:158-178` | 2× |

Nicht jede Duplizierung ist falsch — bei `mtab` ist sie harmlos. Bei `tieHash` und
den task_keys hat sie bereits zu echten Fehlern geführt.

### 5.2 Sprachmischung in Bezeichnern ✅

Innerhalb **derselben Datei** stehen deutsche und englische Namen nebeneinander:

- `planning.ts`: `assignmentDistance` mit den lokalen Variablen `merkenJe`,
  `bereichDist`; `autoAssignMeeting` mit `cleaningLeaders` und `unfilled` neben
  `abwesend`
- `aux-class.ts`: durchgängig deutsch (`istSchuelerteil`, `raeume`, `angleichen`,
  `einschalten`) — aber importiert `isSong` und exportiert `syncAuxSlots`
- `fs.ts`: englisch (`fsAutoAssign`, `poolFor`) mit deutschen Kommentaren
- `absence.ts`: durchgängig deutsch (`istAbwesend`, `KEINE_ABWESENHEIT`)

Erkennbar ist ein Wandel über die Zeit — neuere Module sind deutscher. Ohne
Konvention muss man bei jedem Aufruf raten, wie die Funktion heißt. Eine Zeile in
einer `CLAUDE.md`/`CONTRIBUTING.md` würde reichen (aktuell existiert **keine**
`CLAUDE.md` im Repo).

### 5.3 Funktionslänge

`autoAssignMeeting` (`planning.ts:373-636`) ist **263 Zeilen** mit sechs
verschachtelten Closures (`pl`, `tl`, `claim`, `pick`, `ministryOpts`,
`pickConductor`) und vier Phasen. Die Phasen sind sauber nummeriert und
kommentiert — trotzdem ist das die Funktion, die man am wenigsten anfassen möchte,
und sie enthält mit V11 (männliche Schülerteile umgehen den Malus) genau die Art
Fehler, die in so einer Länge entsteht.

Die vier Phasen (WT-Leiter reservieren, Programmpunkte, Ratgeber, Gebet koppeln,
Hilfsdienste) wären fünf benannte Funktionen mit einem gemeinsamen Kontext-Objekt.

### 5.4 Kommentare, die nicht mehr stimmen ✅

Die Kommentarkultur ist die Stärke des Projekts — umso auffälliger, wo sie kippt
(vollständige Liste in [befunde.md](befunde.md) U7). Die drei irreführendsten:

- `helpers.ts:185-190`: „Familienbezüge kennt die App noch nicht" — sie kennt sie,
  vier Zeilen darunter.
- `meeting-dates.ts:83`: „Einzige Stelle, an der aus ‚Woche + Zusammenkunft' ein
  Datum wird" — es sind vier.
- `context.ts:172`: `clearNotifs` „löscht den gesamten Mitteilungs-Feed der
  Versammlung" — löscht nur die eigenen Zeilen.

Ein Kommentar, der eine Invariante behauptet, die nicht gilt, ist schädlicher als
gar keiner: Er verhindert genau die Prüfung, die den Fehler gefunden hätte.

### 5.5 Kleinere Auffälligkeiten

- `reducer.ts:633`: `id: \`r${Date.now()}\`` — überall sonst `crypto.randomUUID()`.
  Zwei Regeln in derselben Millisekunde kollidieren; vor allem aber: warum hier
  anders?
- `GroupsPanel.tsx:36`: die nächste Gruppennummer wird aus dem **Namen** geparst
  (`g.name.replace(/\D/g, '')`). Nach „Gruppe 10" gelöscht → nächste heißt wieder
  „Gruppe 10".
- `planning.ts:52-53`: zwei Leerzeilen mitten in einer Deklarationsfolge (Rest einer
  entfernten Funktion).
- `reducer.ts:528-606`: der `if (doParts) { … }`-Block ist **nicht eingerückt**
  (bewusst, um das Diff klein zu halten) — erschwert das Lesen genau in der
  längsten Funktion.
- `MeetingSection.tsx:68` übersetzt Rollen mit `tpw` (Programmsprache),
  `ProgrammScreen.tsx:266` mit `tu` (App-Sprache). **Dieselbe Rolle erscheint im
  Programm und im Planen in verschiedenen Sprachen**, sobald App- und
  Versammlungssprache auseinanderfallen. ✅
- `AufgabenScreen.tsx:38-42`: `eigeneAbwesenheiten` filtert nur, wenn `state.userId`
  gesetzt ist — im Demo-Modus sieht man alle Abwesenheiten als „Deine Einträge".
  Dokumentiert, aber die Bedingung wirkt wie ein Versehen.

---

## 6. Performance

> **Nachträglich gemessen — dieser Abschnitt war zu pessimistisch.** Siehe
> [umgebungspruefungen.md § D6](umgebungspruefungen.md): Bei der tatsächlichen
> Obergrenze (`WEEK_LIMIT = 52`) kostet eine Zuteilung **2–11 ms**, die
> derive-Funktionen je ~1 ms. **Kein Handlungsbedarf.** Einzige Ausnahme:
> `autoAssignMeeting` mit **42 ms** (100 Personen/52 Wochen) bzw. 145 ms bei
> 300/200 — dort lohnt eine Optimierung tatsächlich.
>
> Die folgende Aufstellung bleibt als Landkarte der Kostenstellen stehen; die
> Dringlichkeit ist deutlich geringer als hier formuliert.

Kein Problem im heutigen Maßstab (eine Versammlung, ~100 Personen, 52 Wochen) —
aber mehrere Stellen skalieren schlecht mit der Wochenzahl:

| Stelle | Aufwand | Häufigkeit |
| --- | --- | --- |
| `withDerivedTasks` (`reducer.ts:142`) | `localizedWeeks` klont bei aktiver Sprachvariante **alle** Wochen (`structuredClone`), dann 3 volle Durchläufe über alle Slots | nach **20** Aktionsarten, also praktisch bei jeder Zuteilung |
| `buildAbsences` | 52 Wochen × 2 Zusammenkünfte × alle Abwesenheiten | im Reducer (Z. 163) **und** in `autoAssignMeeting` (Z. 539) **und** memoisiert in `useAbwesend` — dreifach |
| `assignSlot` / `lac*` | `structuredClone(weeks)` — das **gesamte** Array für die Änderung eines Namens | bei jeder Zuteilung |
| `AssignSheet` Kandidaten | je Kandidat `workloadOf` (5 Wochen) + `loadWindow` (5× `partWorkload`) | bei jedem Render des Sheets, ohne Memoisierung |
| Context ohne Selektoren | alle Komponenten rendern bei jeder Änderung | immer |

Die günstigsten Hebel: `structuredClone` durch gezieltes Kopieren des betroffenen
Pfads ersetzen (die `lac*`-Funktionen tun das für die Sprachvarianten bereits
referenz-erhaltend) und `buildAbsences` einmal berechnen statt dreimal.

---

## 7. Empfehlungen, priorisiert

Nach Nutzen pro Aufwand. Die Nummern verweisen auf [befunde.md](befunde.md).

### Sofort, klein, hohe Wirkung

0. **B18 beheben** (`translate.ts:165`: `MON` → `MONA`) und **einen Error Boundary
   einziehen** (B19) — eine Zeile bzw. wenige Zeilen gegen einen reproduzierten
   Totalausfall in 30 Sprachen. Dazu **`"strict": true`**, das nachweislich null
   Codeänderungen kostet. Siehe [pruefergebnisse.md](pruefergebnisse.md).
1. **Schreibfehler sichtbar machen** (3.1) — ein Callback in `run()`. Ohne das ist
   jeder andere Fix Glückssache, weil man nicht merkt, wenn Speichern scheitert.
2. **Wochen beim Laden an ihrer `position` ausrichten** (2.6 Stufe 2) — zehn Zeilen
   in `lib/data.ts:614`, beseitigt Weg A dauerhaft.
3. **`CRON_SECRET` erzwingen** (S1) — drei Zeilen, verhindert ein Datenleck.
4. **`seek` gegen den Aufrufer prüfen** (S7) — fünf Zeilen.
5. **`localStorage`-Zugriffe im Startpfad kapseln** (3.4) — das Muster steht fertig
   in `snapshot.ts`.
6. **`openMyTask`/`closeMyTask`/`welcomeShown` in `readonly.ts`** (B10).
7. **`npm test` und `npm run lint` in `deploy.yml`** (3.6) — zwei Zeilen für 727
   Tests, die heute niemand automatisch ausführt.

### Als Nächstes

8. **Startwoche und `current` aus dem Datum ableiten** (B1/B2) — eine Funktion,
   zwei Aufrufstellen, behebt den auffälligsten Alltagsfehler.
9. **`wochenAbstand()` aus `week.start`** (2.6 Stufe 1) — macht die Fairness-Logik
   von der Lückenlosigkeit unabhängig.
10. **Bestätigungen bei `lacAdd`/`lacRemove` mitverschieben** (B3) — das Muster
    steht fertig in `swapPartConfirmations`.
11. **Kandidatenlogik aus `AssignSheet.tsx` herausziehen** und testen (4.1) —
    fängt B6 und macht die wichtigste Interaktion der App prüfbar.
12. **`FRAG`-Vollständigkeitstest** (D3) — das Muster steht fertig in `ui.test.ts`.
13. **`noUncheckedIndexedAccess` schrittweise** (3.5) — 213 Stellen, aber der
    eigentliche Hebel gegen die Fehlerklasse, die dieses Datenmodell begünstigt.
    (`"strict": true` selbst gehört in die Sofort-Liste: es kostet nachweislich
    null Codeänderungen.)

### Mittelfristig

12. **task_key von der Position lösen** (V1) — der eine Umbau, der B3, B13 und die
    Fragilität von B8 gemeinsam erledigt.
13. **`pid` verpflichtend, Name nur noch Anzeige** (3.3) — macht fünf
    Hilfsmechanismen überflüssig.
14. **Gemeinsamer Code für Client und Edge Functions** (4.4/5.1) — oder mindestens
    ein Fixture-Test über beide.
15. **`updated_at`-Konfliktprüfung für `weeks`** (3.7) — bevor zwei Koordinatoren
    sich zum ersten Mal gegenseitig eine Woche löschen.
16. **`AppState` in drei Kontexte teilen** (Serverdaten / UI / Gerät) — macht
    `readonly.ts` und einen Teil von `persist.ts` überflüssig und behebt die
    Render-Kaskade.
