# Leseprüfungen — CSS, Tests, Demo-Daten, Migrationen, Doku

Ergebnisse zu Abschnitt **B** aus [offene-pruefungen.md](offene-pruefungen.md).
Ergänzt [pruefergebnisse.md](pruefergebnisse.md) (dort stehen die ausgeführten
Prüfungen). Stand: 7. August 2026, Commit `e2cdb41`. Keine Code-Änderungen.

---

## Inhalt

- [B7 — Migrationskette: `schema.sql` ist unvollständig](#b7--migrationskette-schemasql-ist-unvollständig)
- [B1 — CSS (5308 Zeilen)](#b1--css-5308-zeilen)
- [B2 — Was die Tests wirklich zusichern](#b2--was-die-tests-wirklich-zusichern)
- [B3 — Demo-Daten](#b3--demo-daten)
- [B5 — Benutzerhandbücher](#b5--benutzerhandbücher)
- [B6 — Design-Handoff](#b6--design-handoff)
- [B4 — Übersetzungsqualität](#b4--übersetzungsqualität)

---

## B7 — Migrationskette: `schema.sql` ist unvollständig

**B20 — Eine Neuinstallation nach README-Anleitung bekommt eine kaputte
Datenbank** ✅

Jede Migrationsdatei trägt im Kopf denselben Satz:

> „Neuinstallationen brauchen diese Datei nicht — **schema.sql enthält alles**."

Das stimmt nicht mehr. Verglichen wurden alle Objekte aus den 15 Migrationen
gegen `schema.sql`:

| Objekt | aus Migration | in `schema.sql`? |
| --- | --- | --- |
| Tabelle `fs_rules` | 010-treffpunkte | ❌ **fehlt** |
| Tabelle `fs_weeks` | 010-treffpunkte | ❌ **fehlt** |
| Funktion `is_group_overseer()` | 010-treffpunkte | ❌ **fehlt** |
| Tabelle `reminder_log` | 011-reminder-log | ❌ **fehlt** |
| Spalte `persons.fam` | 013-familie | ❌ **fehlt** |
| Spalte `persons.dn` | 004 | ✅ vorhanden |
| Spalte `persons.planner` | 006 | ✅ vorhanden |
| Spalte `push_subscriptions.lang` | 014 | ✅ vorhanden |
| `redeem_invite` mit `FOR UPDATE` | 012 | ✅ vorhanden |

`README.md:216` weist genau diesen Weg an: „Im **SQL-Editor** den Inhalt von
`supabase/schema.sql` ausführen". Wer das tut, erhält eine Versammlung, in der:

1. **Treffpunkte nicht funktionieren.** `loadCongregationData` fragt `fs_rules`
   und `fs_weeks` ab — und prüft deren Fehler **nicht**: die Fehlerabfrage
   (`lib/data.ts:604`) listet nur zehn der zwölf Ergebnisse auf und lässt
   `fsRulesRow` / `fsWeeksRows` aus. Der Ladefehler bleibt also stumm, die
   Treffpunkte sind einfach leer.
2. **Jedes Speichern einer Person fehlschlägt.** `personToRow` (`lib/data.ts:431`)
   schreibt `fam` — bei fehlender Spalte lehnt PostgREST die ganze Zeile ab. Der
   Fehler landet ausschließlich in `console.error` (siehe
   [code-review.md § 3.1](code-review.md)), der Nutzer sieht den Erfolgs-Toast.
   **Personendaten gehen verloren, ohne dass irgendetwas darauf hinweist.**
3. **Erinnerungen doppelt versendet werden können.** Ohne `reminder_log` greift in
   `send-reminders` der dokumentierte Notpfad „lieber senden als crashen"
   (`index.ts:95-99`) — die Doppel-Versand-Sperre ist wirkungslos.

Punkt 2 ist die unmittelbare Folge davon, dass Schreibfehler unsichtbar sind: Zwei
für sich beherrschbare Mängel ergeben zusammen stillen Datenverlust.

**Behebung:** die fehlenden Objekte in `schema.sql` nachtragen — oder den Satz in
den Migrationen streichen und im README auf „schema.sql **und dann** alle
`migration-*.sql` in Nummernfolge" umstellen. Ersteres ist ehrlicher zum
Anspruch der Datei.

---

## B1 — CSS (5308 Zeilen)

Analysiert über alle 17 Dateien: Token-Vollständigkeit je Palette, verwendete vs.
definierte Variablen, tote Klassen, z-index, Media Queries, a11y-Merkmale.

### Was auffällig gut ist ✅

- **`outline: none` kommt kein einziges Mal vor.** Vier `:focus-visible`-Regeln,
  kein nacktes `:focus`. Der Fokusring bleibt überall sichtbar — das ist der
  häufigste a11y-Fehler in Web-Apps, und er ist hier vermieden.
- **14 logische Eigenschaften** (`margin-inline`, `padding-block`) gegenüber nur
  4 physischen — die Grundlage dafür, dass RTL überhaupt funktioniert.
- **Nur 5 Media Queries** (380/430/768/920 px + print) und **13 `!important`** auf
  5308 Zeilen. Für ein bespoke Design sehr diszipliniert.
- **Keine Palette hat Token-Lücken**, die zu undefinierten Werten führen: Jede
  überschreibt 34–39 der 49 Basis-Tokens, der Rest erbt bewusst.

### B21 — RTL: doppelte Umkehrung der Wochen-Pfeile ✅

`src/app/rtl.css:44-46`:

```css
[dir='rtl'] .week-nav { flex-direction: row-reverse; }
[dir='rtl'] .week-arrow { transform: scaleX(-1); }
```

Der Kommentar darüber sagt: „Button-Positionen tauschen (zurück rechts, weiter
links)".

In einem `dir="rtl"`-Container ordnet `flex-direction: row` bereits von rechts
nach links. `row-reverse` kehrt das **ein zweites Mal** um — das Ergebnis ist die
LTR-Anordnung.

**Im Browser gemessen** (siehe [pruefergebnisse.md § 5](pruefergebnisse.md), App
auf Arabisch): „vorherige Woche" liegt bei x = 20 (links), „nächste Woche" bei
x = 319 (rechts) — also genau das Gegenteil der beabsichtigten Anordnung.

Da die Glyphen zusätzlich per `scaleX(-1)` gespiegelt werden, zeigen beide Pfeile
danach **nach innen** statt nach außen.

**Behebung:** `flex-direction: row-reverse` entfernen (die Umkehrung macht `dir`
allein) und die Spiegelung der Glyphen beibehalten.

### B22 — `viewport-fit=cover` ohne `env(safe-area-inset-*)` ✅

`index.html:12` setzt `viewport-fit=cover`, damit die App unter die Systemleisten
zeichnet. In den 5308 Zeilen CSS kommt **`env(safe-area-inset-…)` kein einziges
Mal** vor.

Genau diese Kombination führt auf iPhones mit Notch/Dynamic Island dazu, dass
Inhalt unter Statusleiste und Home-Indikator verschwindet — besonders relevant,
weil die App als installierte PWA im Vollbild läuft und die Navigation unten
sitzt.

### B23 — Keine Rücksicht auf `prefers-reduced-motion` ✅

3 `@keyframes` und 2 `transition`-Regeln, aber **keine einzige**
`@media (prefers-reduced-motion: reduce)`-Regel. Nutzer, die Bewegung
systemweit abgewählt haben (Vestibularstörungen), bekommen Toast-Einblendung,
Sheet-Animation und Wischbewegung unverändert.

### Weitere Beobachtungen

| Punkt | Befund |
| --- | --- |
| **z-index** | 11 verschiedene Werte (20, 30, 31, 34, 35, 38, 39, 40, 42, 43, 50) ohne benannte Ebenen. Wer ein neues Overlay baut, muss raten, wo es einzuordnen ist. Vier Token-Ebenen (`--z-nav`, `--z-sheet`, …) würden das auflösen. **Nachtrag 7.8.2026 (T51): umgesetzt, aber mit sieben Ebenen** — vier hätten die Reihenfolge geändert (S-89 muss über dem Zuteilungs-Sheet liegen, die Bestätigung über dem Toast, das Popover über allem). Tokens siehe `tokens.css` am Dateiende. |
| **Tote CSS-Klassen** | 11 von 477 werden nirgends im Code verwendet: `auf-empty`, `w3`, `week-page--vor`, `week-page--nach`, `mem-planner-lbl`, `mem-remove--ph`, `mem-inv-label`, `mem-inv-form`, `lang-demo-hint`, `plan-open-prefix`, `prog-lang-hint`. `week-page--vor/--nach` und `lang-demo-hint` sind Reste aus abgelösten Umsetzungen (Wochen-Streifen bzw. der tote Dict-Schlüssel `demoLangHint`). |
| **Unbenutzte Tokens** | `--primary` und `--clear` werden definiert, aber nie referenziert. **Nachtrag 7.8.2026 (T50) — ⛔ geprüft, kein Mangel:** diese beiden Tokens gibt es nicht. Die Treffer sind die Klassennamen `.plan-auto-btn--primary` und `.plan-auto-btn--clear` (`planen.css:57/69`), beide in `AutoAssignPanel.tsx` und `FsPlan.tsx` benutzt. Die 11 toten Klassen und 5 toten Wörterbuch-Schlüssel wurden entfernt. |
| **Variablen aus JavaScript** | `--week-shift` und `--sheet-drag` werden nur per JS gesetzt — beide mit sauberem Fallback (`var(--week-shift, 0px)`). Kein Mangel. |
| **Physische Abstände** | Nur zwei RTL-relevante Reste: `einstellungen.css:214` und `planen.css:318` (`margin-left: 4px` bzw. `5px`). In RTL landen sie auf der falschen Seite — optisch minimal. |

### B24 — Dunkle Paletten erben helle Werte ⚠️

Die vier dunklen Paletten (graphit, bernstein, aubergine, koralle) überschreiben
34 der 49 Tokens. Unter den 15 geerbten sind **Farbwerte**:

| Token | Basiswert (hell) | Wirkung in dunklen Paletten |
| --- | --- | --- |
| `--load-free` | `#5fd07a` | Mini-Quadrate der Auslastung behalten die hellen Farben |
| `--load-task` | `#f47160` | dito |
| `--load-helper` | `#a99cf7` | dito |
| `--shade` | `30, 25, 15` | Grundlage aller Schatten |
| `--sh-col` / `--sh-overlay` / `--sh-btn` | `rgba(30,25,15, …)` | dunkelbraune Schatten auf dunklem Grund — praktisch unsichtbar |
| `--logo-filter` | `none` | — |

Die Paletten „grau" und „kontrast" setzen `--load-*` und `--shade` ausdrücklich neu
(`tokens.css:324-325`, `380-382`, `446-448`) — die vier dunklen nicht. Das
Kontrast-Skript prüft diese Tokens offenbar nicht mit (es meldet 30/30 für alle
dunklen Paletten), der Mangel bleibt daher unentdeckt.

---

## B2 — Was die Tests wirklich zusichern

Bisher waren nur Testnamen gelesen; jetzt Inhalte und Aufbau.

### Qualität

| Datei | Tests | `expect`-Aufrufe | Verhältnis |
| --- | --- | --- | --- |
| `reducer.test.ts` | 76 | 168 | 2,2 |
| `planning.test.ts` | 50 | 94 | 1,9 |
| `persist.test.ts` | 31 | 54 | 1,7 |
| `autoassign.sim.test.ts` | 22 | 43 | 2,0 |
| `autoassign.fairness.test.ts` | 18 | 36 | 2,0 |
| `data-load.test.ts` | 10 | 29 | 2,9 |

Durchweg ~2 Zusicherungen je Test — keine Alibi-Tests. Im gesamten Bestand nur
**18** schwache Zusicherungen (`toBeDefined`, `toBeTruthy`, `not.toThrow`) auf
727 Tests.

### Der aufschlussreichste Fund ✅

`src/personen/person-timeline.test.ts:46-47` baut die Testdaten so:

```js
mid: { ...w.mid, date: w.range },   // Wochenspanne statt Termin
we:  { ...w.we,  date: w.range },
```

Der Test **modelliert B4 ausdrücklich als Vorbedingung**: Er setzt das
`date`-Feld auf die Wochenspanne, um zu prüfen, dass die Zeitleiste daraus das
echte Kalenderdatum rechnet.

Das bestätigt zweierlei:

1. B4 ist real und war bekannt — importierte Wochen tragen tatsächlich die
   Wochenspanne im `date`-Feld.
2. Behoben wurde es nur an **einer** Stelle. „Meine Aufgaben", das
   S-89-Formular, das Dashboard und der Programm-Kopf lesen `meeting.date`
   weiterhin roh — und kein Test prüft dort etwas.

### Was die Tests strukturell nicht abdecken

- **Keinen einzigen** der in [befunde.md](befunde.md) beschriebenen Fehler — die
  Suite ist vollständig grün (siehe [pruefergebnisse.md](pruefergebnisse.md)).
- Den **Intl-Übersetzungspfad**: `translate-data.ts` liegt bei 7,5 %
  Funktionsabdeckung. Genau dort steckt B18, der Totalausfall.
- **`Week.stub` / `weekFrom > 0`** außerhalb von `data-load.test.ts`.
- Die **Konsistenz zwischen Client und Edge Functions** (viermal duplizierte
  task_key-Logik).

---

## B3 — Demo-Daten

`demo.ts` ist die Vorlage für `seedCongregation`, landet also in jeder neu
befüllten Versammlung. Geprüft: Schlüssel-Gültigkeit, Referenzen, Struktur.

### Sauber gelöst ✅

Ein anfänglicher Verdacht bestätigte sich **nicht**: Die Datei verwendet
Bezeichner wie `mikrofon`, `ordner`, `zoomordner`, `lesen`, die es im aktuellen
Modell nicht mehr gibt. Sie sind aber nur **Eingabe** für die lokale
Hilfsfunktion `q()` (`demo.ts:54-72`), die sauber auf `serviceQualKey('mik')`
usw. abbildet. Ebenso wird der Alt-Schlüssel `vorsitz` durch
`normalizeChairKeys()` beim Bauen (`demo.ts:326`) korrekt in
`vorsitzMid`/`vorsitzWe` überführt.

### Der Absturzauslöser ✅

Das Muster „Wochentagskürzel + Kurzmonat" (`(Mo|Di|…), <Tag>. <Kurzmonat>`) kommt
im gesamten Datensatz **genau einmal** vor:

`demo.ts:245` — `'Gespräche beginnen (informell) · Di, 8. Sep · ca. 19:35'`

Dieser eine String legt die App in 30 Sprachen lahm (B18). Alle übrigen Daten
verwenden die Langform („Di, 8. September"), die korrekt aufgelöst wird.

Das heißt auch: Es genügt **nicht**, nur diesen String zu ändern — die Regel in
`translate.ts:165` bleibt sonst latent falsch und trifft beim nächsten
Kurzmonat wieder.

---

## B5 — Benutzerhandbücher

Beide Handbücher sind gut gegliedert (Planer: 10 Kapitel + Zusätzliche Klasse;
Verkündiger: 9 Kapitel) und mit 15 automatisch erzeugten Screenshots bebildert.
Die neueren Funktionen (Treffpunkte, Zusätzliche Klasse, Offline-Modus,
Installation, Push) sind beschrieben.

### Nicht beschriebene Funktionen ✅

| Funktion | Planer | Verkündiger | Bemerkung |
| --- | --- | --- | --- |
| **Einspringen / Ersatzsuche** | ❌ | ❌ | Der Verkündiger bekommt einen Push „Wer springt ein?" und findet im Handbuch nichts dazu |
| **S-89-Formular** | ❌ | ❌ | prominent in Dashboard, Meine Aufgaben und Zuteilungs-Sheet — die zentrale Unterlage für Schulungsaufgaben |
| Dubletten-Warnung | ❌ | — | erscheint ungefragt oben in der Personenliste |
| Konten ohne Person | ❌ | — | eigener Block im Personen-Screen |
| Dienstvortrag (Kreisaufseher-Woche) | ❌ | ❌ | — |

Die beiden ersten Zeilen wiegen am schwersten: Sie betreffen genau die Aktionen,
die ein Verkündiger selbst ausführt.

---

## B6 — Design-Handoff

### B25 — Widersprüchliche Angabe, welcher Prototyp maßgeblich ist ✅

| Quelle | Aussage |
| --- | --- |
| `README.md:152` | maßgeblich ist **`Prototyp 2a v2.dc.html`** |
| `docs/design-handoff/README.md:16` | „Maßgeblich ist **`Prototyp 2a v2.dc.html`**" |
| `docs/design-handoff/README.md:122-123` | listet nur v2 („maßgeblicher Prototyp") und v1 — **v3 fehlt in der Dateiliste** |
| `docs/design-handoff/design-notes-v3.md:24` | „`Prototyp 2a v3.dc.html` — **AKTUELL**. v2 + Mehrsprachigkeit" |

Die Dateien selbst stützen die letzte Aussage: v3 ist neuer (12. Juli, 126 kB)
als v2 (11. Juli, 86 kB) und enthält laut Notiz die Mehrsprachigkeit, die in der
App längst umgesetzt ist.

Wer die Design-Referenz sucht, bekommt je nach Einstiegspunkt eine andere Antwort
— bei einem Projekt, dessen README „pixelgenau nachbauen" verlangt, ist das eine
teure Unklarheit.

Ein inhaltlicher Soll-Ist-Abgleich der Prototypen mit der Umsetzung war nicht
möglich: Dazu müssten beide gerendert und verglichen werden.

---

## B4 — Übersetzungsqualität

Nur eingeschränkt prüfbar: Ob „UNS IM DIENST VERBESSERN" in jeder Sprache dem
aktuellen S-38-Wortlaut entspricht, lässt sich ohne Abgleich mit jw.org je Sprache
nicht feststellen. Das bleibt offen (siehe
[offene-pruefungen.md](offene-pruefungen.md) D5).

Geprüft wurde die **interne** Konsistenz:

- **Vollständigkeit der UI-Wörterbücher**: durch `ui.test.ts` lückenlos
  abgesichert (Schlüssel, Platzhalter, kein stiller EN-Rückfall, Leerraum).
- **Vollständigkeit der Programm-Fragmente**: **nicht** abgesichert — 30 von 33
  Sprachen fehlen 26–34 Einträge (D1 in [befunde.md](befunde.md)).
- **Tote Schlüssel**: 5 von 377 (siehe
  [pruefergebnisse.md § 7](pruefergebnisse.md)).
- **`REF`-Tabellen** fehlen für id, tl, vi, sw ohne dokumentierten Grund (D2).

---

## Neue Befunde aus diesen Prüfungen

| # | Befund | Schwere |
| --- | --- | --- |
| **B20** | `schema.sql` fehlen `fs_rules`, `fs_weeks`, `reminder_log`, `is_group_overseer()`, `persons.fam` — Neuinstallationen verlieren stillschweigend Personendaten | **hoch** |
| **B21** | `rtl.css`: doppelte Umkehrung der Wochen-Pfeile (gemessen) | mittel |
| **B22** | `viewport-fit=cover` ohne `env(safe-area-inset-*)` — iPhone-Vollbild | mittel |
| **B23** | Kein `prefers-reduced-motion` | niedrig |
| **B24** | Dunkle Paletten erben helle Auslastungsfarben und Schatten | niedrig |
| **B25** | Widersprüchliche Angabe zum maßgeblichen Prototyp | niedrig |
| — | Handbuch-Lücken: Einspringen, S-89 | mittel |
| — | 11 tote CSS-Klassen, 2 unbenutzte Tokens, z-index ohne System | niedrig |
