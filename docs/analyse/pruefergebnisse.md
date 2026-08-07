# Prüfergebnisse — ausgeführte Prüfungen

Ergänzung zu [befunde.md](befunde.md) und [code-review.md](code-review.md).
Hier stehen **Messwerte statt Lesefunde**: Was passiert ist, als die Prüfungen
tatsächlich liefen (7. August 2026, Commit `e2cdb41`, Windows 11, Node 22).

Am Code wurde nichts geändert. Der Build schreibt nach `dist/`, die Coverage nach
`coverage/` — beides ist in `.gitignore`.

---

## 0. Der schwerste Befund: die App stürzt in 30 Sprachen ab

**B18 — Weißer Bildschirm beim Öffnen der Mitteilungen in fast jeder Sprache** ✅
**reproduziert**

### Reproduktion (echter Nutzerweg, kein Debug-Trick)

1. App im Demo-Modus öffnen
2. Profil → Sprache → **Italiano** (oder eine der 29 anderen Zusatz-Sprachen)
3. Auf die Mitteilungs-Glocke tippen
4. → **Die gesamte App verschwindet.** `document.body.innerText.length === 0`

Konsole:

```
Uncaught RangeError: Invalid time value
    at intlWeekdayDate (src/i18n/translate.ts:64)
An error occurred in the <NotificationsPanel> component.
Consider adding an error boundary to your tree …
```

### Ursache ✅

`src/i18n/translate.ts:165` (Pfad `makeTrIntl`, gilt für **alle 30 Sprachen ohne
eigenes Datums-Wörterbuch**):

```js
[/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/,
   m => intlWeekdayDate(locale, WDA[m[1]], +m[2], MON[m[3]], 'short')]
```

Die Regel behandelt die **Kurzform** des Wochentags („Di, 8. Sep"), schlägt den
Monat aber in `MON` nach — der Tabelle der **ausgeschriebenen** Monate
(`translate-data.ts:1411`). Für Kurzmonate ist `MONA` zuständig
(`translate-data.ts:1412`).

`MON['Sep']` ist `undefined` → `findDateForWeekday(undefined, 8, 1)` liefert ein
`Invalid Date` (die 28-Jahre-Schleife findet nie einen Treffer, weil
`NaN !== undefined` immer wahr ist) → `Intl.DateTimeFormat().format(InvalidDate)`
wirft `RangeError`.

Auslösender Text im Demo-Datensatz (`demo.ts:245`):
`'Gespräche beginnen (informell) · Di, 8. Sep · ca. 19:35'`

### Zwei Ausprägungen desselben Fehlers ✅ beide reproduziert

| Sprachen | Pfad | Verhalten |
| --- | --- | --- |
| **de** | Identität (`makeTr` gibt `s => s` zurück) | korrekt |
| **en, es, fr** | `makeTr` (eigenes Datums-Wörterbuch `D`) | App lebt, zeigt aber sichtbar kaputten Text: **„Tue, undefined 8"** |
| **die übrigen 30** | `makeTrIntl` (Intl-Pfad) | **Totalausfall der App** |

Gemessener Beleg für en:
`"Reminder | Starting a Conversation (informal) · Tue, undefined 8 · approx. 19:35"`

### Warum es besonders wiegt

Die öffentlich erreichbare Fassung auf GitHub Pages läuft **ohne**
Supabase-Secrets, also im Demo-Modus — genau dort, wo dieser Datensatz aktiv ist.
Ein Interessent, der die Sprache umstellt und die Glocke antippt, sieht einen
weißen Bildschirm.

### B19 — Es gibt keinen Error Boundary ✅

`grep` über `src`: **0 Treffer** für `componentDidCatch` / `ErrorBoundary` /
`getDerivedStateFromError`. `main.tsx` rendert `<StrictMode><App /></StrictMode>`
ohne Absicherung.

Deshalb wird aus einem Fehler in **einer** Komponente der Totalausfall der
gesamten Anwendung. React weist in der Konsole selbst darauf hin. Ein Error
Boundary um `<Content />` (oder um jedes Overlay) hätte hier einen Hinweis statt
eines weißen Bildschirms gezeigt.

---

## 1. Testlauf, Typen, Lint, Build

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | ✅ **51 Dateien, 727 Tests, alle grün**, 7,6 s |
| `npx tsc -b` | ✅ **0 Fehler** |
| `npm run lint` (oxlint) | ✅ **0 Meldungen** |
| `npm run build` | ✅ erfolgreich, 262 ms |

**Korrektur zu befunde.md:** Dort steht „681 Testfälle" — das war meine
`grep`-Zählung. Tatsächlich sind es **727**.

Bemerkenswert: Trotz der in [befunde.md](befunde.md) beschriebenen Fehler ist die
gesamte Suite grün. Kein einziger der Befunde ist von einem Test abgedeckt — was
die dortige Lückenanalyse (Abschnitt E) empirisch bestätigt.

### Build-Warnungen ✅

1. `WARN advancedChunks option is deprecated, please use codeSplitting instead.`
   → `vite.config.ts:47` nutzt eine veraltete Rolldown-Option.
2. `[INEFFECTIVE_DYNAMIC_IMPORT] src/i18n/overlays/en.ts is dynamically imported
   by src/i18n/ui.ts but also statically imported` → gewollt (EN soll im
   Start-Bundle bleiben), aber der `import.meta.glob` erfasst `en.ts` unnötig mit.
   Ließe sich durch Ausschluss im Glob sauber lösen.

### Bundle-Größen ✅

| Datei | roh | gzip |
| --- | --- | --- |
| `index-*.js` | 321,2 kB | 98,7 kB |
| `supabase-*.js` | 204,1 kB | 52,3 kB |
| `react-*.js` | 189,6 kB | 59,7 kB |
| `index-*.css` | 64,0 kB | 12,9 kB |
| **Summe Startlast** | **779 kB** | **≈ 224 kB** |
| je Sprach-Overlay (lazy) | 13,6–24,8 kB | 6,2–8,3 kB |
| `bible-books` (lazy) | 35,0 kB | 14,7 kB |

Das Code-Splitting funktioniert wie beabsichtigt: 33 Overlays und die
Bibelbuch-Tabellen liegen in eigenen Chunks.

**Nebenbefund:** Zwei aufeinanderfolgende Builds ohne Codeänderung erzeugen
**unterschiedliche Hashes** für `index-*.js` (`index-C-y_keJT.js` →
`index-3FN3uxN-.js`). Ursache ist `__BUILD_ID__` (`vite.config.ts:15`), das den
Zeitstempel auf die Minute genau enthält. Jeder Build zwingt damit alle Nutzer,
321 kB neu zu laden, auch wenn sich nichts geändert hat.

---

## 2. `strict` — Korrektur einer früheren Einschätzung

In [code-review.md § 3.5](code-review.md) steht, `strict` sei aus und der Code
arbeite „freihändig ohne Compiler-Rückhalt". Der erste Teil stimmt, der zweite
war zu negativ. Gemessen (jeweils voller Quellbaum ohne Tests, ohne die
Projekt-tsconfig, damit die Optionen einzeln wirken):

| Konfiguration | Fehler |
| --- | --- |
| wie heute (kein `strict`) | 0 |
| `--strictNullChecks` | **0** |
| `--strict` (alle Teilregeln) | **0** |
| `--strict --noUncheckedIndexedAccess` | **213** |

> Der Code ist **bereits vollständig `strict`-konform**. `"strict": true` in
> `tsconfig.app.json` kostet **keine einzige Codeänderung** — es ist eine Zeile,
> die den erreichten Stand nur noch absichert.

Das ist eine deutlich bessere Nachricht als vermutet und ändert die Empfehlung:
statt „erzeugt einmalig Arbeit" heißt es „sofort machen".

### Die 213 Treffer von `noUncheckedIndexedAccess` ✅

Sie bestätigen die These aus [code-review.md § 2](code-review.md) empirisch — die
Verteilung folgt exakt den Dateien, die mit Wochen, Sektionen und Punkten
arbeiten:

| Datei | ungeprüfte Index-Zugriffe |
| --- | --- |
| `src/i18n/translate.ts` | 48 |
| `src/data/meeting-edit.ts` | 37 |
| `src/data/planning.ts` | 31 |
| `src/app/persist.ts` | 19 |
| `src/app/reducer.ts` | 14 |
| `src/planen/MeetingSection.tsx` | 9 |
| `src/data/localize.ts` | 9 |
| `src/components/useSwipeWeek.ts` | 9 |
| `src/data/meeting-dates.ts` | 6 |
| `src/planen/AssignSheet.tsx` | 5 |
| übrige | 26 |

Mit 48 Treffern führt ausgerechnet `translate.ts` — die Datei, in der B18
steckt. Genau der Zugriff `MON[m[3]]` wäre mit dieser Regel als
möglicherweise `undefined` markiert worden.

---

## 3. Testabdeckung (gemessen)

`npm run test:coverage`:

| Metrik | Wert |
| --- | --- |
| Statements | **74,88 %** (2725/3639) |
| Branches | **79,90 %** (1785/2234) |
| Functions | **53,18 %** (643/1209) |
| Lines | **79,53 %** (2254/2834) |

**Wichtige Einschränkung:** Das npm-Skript misst nur
`--coverage.include=src/**/*.ts` — die **`.tsx`-Dateien sind größtenteils
ausgenommen**. Die Zahl beschreibt also im Wesentlichen die Logikschicht, nicht
die Anwendung. Die tatsächliche Gesamtabdeckung inklusive UI liegt deutlich
darunter.

### Bereiche nach Abdeckung

| Bereich | Statements |
| --- | --- |
| `src/data` | 93,63 % |
| `src/app` | 87,67 % |
| `src/personen` | 79,01 % |
| `src/lib` | 78,53 % |
| `src/components` | 69,50 % |
| `src/einstellungen` | 43,47 % |
| `src/i18n` | 35,57 % |

### Vollständig ungetestet (0 %)

`src/app/useAbwesend.ts` · `src/components/useDialogFocus.ts` ·
`src/components/usePush.ts` · `src/lib/clipboard.ts` · `src/lib/install.ts` ·
`src/personen/priv-label.ts`

`useAbwesend` ist dabei der Hook, über den **jede** Abwesenheitsprüfung der
Oberfläche läuft.

### Treffer, die die Befunde bestätigen

- **`meeting-edit.ts`: Branches nur 68,57 %**, unabgedeckt sind ausgerechnet die
  Zeilen **205–211** — das ist `togglePartner`, also genau B14.
- **`translate-data.ts`: 10,9 % Statements, 7,54 % Functions.** Die Datums- und
  Fragment-Funktionen der 33 Sprachen werden von den Tests praktisch nie
  aufgerufen. Das ist der unmittelbare Grund, warum B18 unentdeckt blieb: Kein
  Test führt den Intl-Pfad je aus.
- `aux-class.ts`: unabgedeckt 161–167 (`schuelerteile()`).

---

## 4. Kontrast (alle 11 Paletten)

`npm run contrast` — das Skript existiert und prüft 30 bzw. 33 Farbpaarungen je
Palette:

| Palette | Ergebnis |
| --- | --- |
| weiss, indigo, blatt, papaya, grau, graphit, bernstein, aubergine, koralle | ✅ 30/30 |
| **kontrast** (verbindlich) | ✅ 33/33 |
| **pastell** („Vanille") | ⚠️ **25/30** |

Die fünf Verstöße in „pastell" betreffen alle Rahmenkontraste (WCAG 1.4.11
verlangt 3:1 für Bedienelement-Begrenzungen):

| Paarung | Ist | Soll |
| --- | --- | --- |
| Rahmen auf Seite (`--bord` auf `--bg`) | 1,33:1 | 3:1 |
| Rahmen auf Karte (`--bord2` auf `--card`) | 1,36:1 | 3:1 |
| Rahmen kräftig (`--bord3`) | 1,47:1 | 3:1 |
| Rahmen sehr kräftig (`--bord4`) | 1,73:1 | 3:1 |
| gestrichelter Rahmen (`--dash`) | 2,19:1 | 3:1 |

Das Skript markiert sie als „nur berichtet, keine Vorgabe" — die Abweichung ist
also bekannt und toleriert. In dieser Palette sind Feld- und Kartenränder
faktisch unsichtbar.

---

## 5. Oberfläche im Browser (Demo-Modus, Vite-Dev-Server)

### Alle sieben Screens gerendert ✅

Start, Programm, Meine Aufgaben, Planen, Personen, Einstellungen, Profil — **keine
Konsolenfehler** außer dem unter § 0 beschriebenen Absturz.

| Screen | fokussierbare Elemente | Textmenge |
| --- | --- | --- |
| Start | 6 | 417 Zeichen |
| Programm | 12 | 1 243 |
| Meine Aufgaben | 16 | 614 |
| Planen | 93 | 1 726 |
| Personen | 106 | 5 758 |
| **Einstellungen** | **95** | **13 284** |
| Profil | 4 | 479 |

Einstellungen und Personen sind sehr lange Tab-Ketten ohne Sprungmarken.

### Was sich als unbegründet erwiesen hat ✅

Zwei Verdachtsmomente aus der Lese-Analyse haben sich **nicht** bestätigt — beide
sind sauber gelöst:

1. **Doppelte Bedienelemente durch mobilen Header + Desktop-Topbar:** Der jeweils
   inaktive Container steht auf `display: none`; die Buttons sind nicht
   fokussierbar (`offsetParent === null`).
2. **Mehrfache `<h1>` durch den Wochen-Streifen:** Die Nachbarwochen liegen
   korrekt in `aria-hidden="true"` + `inert`.

### Überschriften-Struktur ⚠️

Auf **jedem** Screen existiert genau **ein** `<h1>` und **keine** `<h2>`/`<h3>`.
Die Panel-Beschriftungen („Deine nächste Aufgabe", „Hilfsdienste",
„Aufgabenbereiche" …) sind `div`s.

Für Screenreader-Nutzer heißt das: Es gibt keine Gliederung zum Anspringen; ein
Screen wie Einstellungen mit 13 000 Zeichen ist nur linear erreichbar.

### Touch-Ziele unter 24 × 24 px ✅ gemessen

WCAG 2.5.8 (AA) verlangt mindestens 24 × 24 CSS-Pixel:

| Screen | Element | Größe |
| --- | --- | --- |
| Start | `dash-s89` „S-89 anzeigen ›" | 82 × **17** |
| Meine Aufgaben | `auf-s89` „S-89 anzeigen ›" | 75 × **15** |
| Meine Aufgaben | `auf-confirm` „✓ Bestätigen" | 86 × **23** |
| Planen | `partner-toggle` „± Gesprächspartner" | 101 × **16** |
| Einstellungen | `switch` (Schalter) | 40 × **22** |

Die Schalter (Zusätzliche Klasse, Erinnerungen wiederholen) und die
S-89-Verweise sind die kritischsten — Letztere sind reine Textzeilen ohne
Trefferfläche.

### Schriftgröße 1,45 auf 375 px ✅ gemessen

Grundsätzlich hält das Layout: **kein horizontaler Seiten-Scroll** in keiner
Kombination. Vier Elemente laufen jedoch über ihren Container hinaus
(`overflow-x: visible`, wird also abgeschnitten oder überlappt):

| Screen | Element | Ist > Soll |
| --- | --- | --- |
| Planen | `plan-item` | 317 > 307 px |
| Planen | `plan-item-head` | 317 > 307 px |
| Einstellungen | `mem-select` | 159 > 146 px |
| Einstellungen | `fs-select fsr-grow` | 158 > 132 px |

Bei Normalgröße (1,0) tritt kein Überlauf auf.

### RTL (Arabisch) ✅

- `lang="ar"`, `dir="rtl"` korrekt gesetzt
- **kein** Seiten- oder Element-Überlauf
- die App bleibt funktionsfähig, `aria-label`s sind übersetzt
- ⚠️ Die Wochen-Pfeile behalten die LTR-Anordnung (》vorherige《 links bei x = 20,
  》nächste《 rechts bei x = 319). Ob das Absicht ist (chronologische Navigation)
  oder ein Versehen, lässt sich von außen nicht entscheiden — es ist der einzige
  auffällige Punkt im RTL-Layout.

---

## 6. Abhängigkeiten

`npm audit --omit=dev`: **0 Schwachstellen** in den Produktionsabhängigkeiten.

`npm audit` (inkl. Entwicklung): **1 × high** —
`postcss <= 8.5.22`, Path Traversal beim automatischen Laden von Source Maps
(GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp). Betrifft nur den Build, nicht die
ausgelieferte App; `npm audit fix` behebt es.

`npm outdated` — alles nur leicht zurück, ein Major-Sprung offen:

| Paket | installiert | aktuell |
| --- | --- | --- |
| **typescript** | 6.0.3 | **7.0.2** (Major) |
| jsdom | 29.1.1 | 30.0.1 (Major, dev) |
| @types/node | 24.13.3 | 26.1.2 (Major, dev) |
| vite | 8.1.4 | 8.2.1 |
| oxlint | 1.73.0 | 1.77.0 |
| @supabase/supabase-js | 2.110.2 | 2.112.2 |
| react / react-dom | 19.2.7 | 19.2.8 |

---

## 7. Tote Wörterbuch-Schlüssel ✅

377 Schlüssel in `src/i18n/de.ts`, davon **5 nirgends im Code referenziert**:

| Schlüssel | Wert | Vermutlicher Grund |
| --- | --- | --- |
| `appSprache` | „App-Sprache" | durch `spracheLbl` ersetzt |
| `demoLangHint` | „Demo: Programminhalte sind nur auf Deutsch, Englisch, Spanisch und Französisch verfügbar …" | Hinweis entfernt — der Sachverhalt gilt aber weiterhin (siehe D1) |
| `reinigungsgruppe` | „Reinigungsgruppe" | — |
| `rolleVerkIn` | „Verkündigerin" | `roleLabel()` baut die Form selbst zusammen |
| `privLesen` | „Bibellesung / Leser" | Rest des früher **zusammengefassten** Bereichs — passt zu F12 (Leser ist bis heute nicht nach Zusammenkunft getrennt) |

Jeder tote Schlüssel wird durch `ui.test.ts` in **allen 34 Sprachen**
eingefordert — 5 × 34 = 170 Übersetzungen ohne Zweck.

---

## 8. Git-Historie als Fehlerspur ✅

199 Commits. Am häufigsten geänderte Dateien:

| Datei | Änderungen |
| --- | --- |
| `src/i18n/ui.ts` | 51 |
| `src/data/planning.ts` | 39 |
| `src/data/types.ts` | 37 |
| `src/lib/data.ts` | 31 |
| `src/i18n/de.ts` / `overlays/en.ts` | je 31 |
| `src/app/context.ts` | 30 |
| `src/app/store.tsx` | 29 |

Das Muster stützt die SRP-Analyse aus [code-review.md § 4.1](code-review.md):
Die Dateien, die bei **jeder** Erweiterung mit angefasst werden müssen
(`context.ts` + `ui.ts` + `de.ts` + `en.ts` + `planning.ts`), stehen an der
Spitze. Eine neue Funktion kostet immer denselben Rundgang durch fünf Dateien.

---

## 9. Konsequenzen für die Prioritätenliste

Neu einzuordnen, vor allem bisher Genannten:

| Rang | Maßnahme | Aufwand |
| --- | --- | --- |
| **1** | **B18 beheben** — in `translate.ts:165` `MON` durch `MONA` ersetzen | eine Zeile |
| **2** | **Error Boundary einziehen** (B19) — damit ein Komponentenfehler nie wieder die ganze App mitnimmt | wenige Zeilen |
| **3** | **`"strict": true`** in `tsconfig.app.json` — kostet nachweislich **0** Codeänderungen | eine Zeile |
| **4** | **Test für den Intl-Übersetzungspfad** — `makeTrIntl` über alle 30 Sprachen mit allen Datumsformaten; hätte B18 gefangen | überschaubar |
| **5** | `npm test` + `npm run lint` in `deploy.yml` | zwei Zeilen |
| 6 | `noUncheckedIndexedAccess` schrittweise (213 Stellen) | größer, aber der eigentliche Hebel gegen die Index-Fehlerklasse |
| 7 | Touch-Ziele auf ≥ 24 px, Überschriften-Struktur, die vier Überläufe bei Schriftgröße 1,45 | klein, je Stelle |
| 8 | `npm audit fix` (postcss), `advancedChunks` → `codeSplitting` | klein |
