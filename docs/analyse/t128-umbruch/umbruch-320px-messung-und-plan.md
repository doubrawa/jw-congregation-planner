# Umbruch mitten im Wort: Messung und Plan

Sitzung 00f3b826, 18.10.2026. **Im geteilten Ordner nichts geändert.** Stand bei
Abschluss: T127 ist als `359c7d4b` committet; im Ordner arbeitet inzwischen eine
andere Sitzung an `src/i18n/*` und `src/planen/*` (Vortragsplan).

Beim Start: `git status`
zeigte die uncommitteten Änderungen der Aufgabe „Reinigung: Gruppen an- und
abschalten" (T127), u. a. `src/einstellungen/*` und `einstellungen.css`. Später
kamen fremde Änderungen an `src/i18n/de.ts` und allen elf Overlays dazu
(`anlassMemText`, eine dritte Sitzung).

## Wie gemessen

- **Fester Stand:** HEAD `546f7f73` im eigenen Worktree
  `.claude/worktrees/umbruch-messung`, eigenes Vite auf Port 5176. Die Hülle
  `vite.messung.config.mjs` setzt `server.fs.allow`, damit die Schriften laden.
  Der geteilte Ordner lieferte während der Messung Zwischenstände von
  `HilfsdienstBlatt.tsx` aus („fill is not defined", „Switch is not defined"),
  das Blatt landete dort in der Fehlergrenze.
- **Echter Chrome 155** ohne Fenster, per CDP, mit den Trennwörterbüchern aus
  dem Chrome-Profil (`hyphen-data`). Gemessen: 12 Sprachen × 320/375/768/1024/
  1180/1440 px × Stufe 1 und 1.45 = 144 Fälle, je Fall vier Ansichten
  (Einstellungen, Hilfsdienste, Blatt Reinigung, Blatt Eingangsordner). `l=` und
  `fs=` standen immer im Hash.
- Bruchstellen werden Zeichen für Zeichen bestimmt. Ein Bruch zählt als
  **getrennt** (mit Strich), wenn ein Klon bei gleicher Breite ohne
  `overflow-wrap` genauso bricht, sonst als **im Wort** (Notumbruch ohne Strich).
- Skripte und Bilder liegen im Scratchpad unter
  `…\00f3b826-ad17-400d-95ed-ff03308d7b10\scratchpad\umbruch\`: `messen.mjs`,
  `seite.js`, `auswerten.mjs`, `nachher-k6.css`, die Bilder in `vergleich\`.

## Befund 1: Das Browser-Pane trennt gar nicht

Dem Pane fehlen die Trennwörterbücher. Probe mit `lang=de|en|ru|fr`, 70 px,
`hyphens: auto`: Das Wort bleibt einzeilig. „Königreichssaa|l", „Eingangsordne|r"
und „Rundgangsord|ner" sind deshalb **Artefakte des Messbrowsers**. Derselbe
Stand zeigt im echten Chrome „Königreichs-saal", „Eingangsord-ner" und
„Rundgangs-ordner", jeweils mit Strich. `.einst-zeile-name` hat schon
`hyphens: auto` + `overflow-wrap: break-word`. `overflow-wrap: anywhere` ist dort
**nicht** die Ursache.

Chrome und Edge haben Wörterbücher für **de en es fr it ru uk**, **nicht** für
**pl ro tr ar fa**. Dort bleibt nur der Notumbruch ohne Strich. Dazu kommt:
**Englisch trennt Chrome nie in großgeschriebenen Wörtern** („Notifications",
„Kingdom"). Beschriftungen fangen fast immer groß an.

## Befund 2: Echte Funde im echten Chrome (HEAD, 144 Fälle)

| Art | Anzahl | Wo |
|---|---|---|
| Bruch im Wort ohne Strich | 33 | `.einst-zeile-name`, nur 320 px bei Stufe 1.45, alle Sprachen. Wert bzw. Plus/Minus nehmen ihre volle Breite, der Name bekommt ~70 px. |
| Bruch im Wort ohne Strich | 76 | `.leisten-text` (schmale Leiste, 768/1024): 72 bei Stufe 1.45, 4 bei Türkisch auch bei Stufe 1 („Değerlendir\|me") |
| Zahl von der Bezeichnung getrennt | 94 | „Personen:\|26" (Hilfsdienste), Blattkopf „… · Personen:\|52", Desktop-Abschnitte „Trolleys:\|3", Erinnerungen „1\|Tag vorher", Datum der Kopfzeile „7\|września" |
| Seite zu breit | 3 Ansichten | ru 320/1.45: Titel „Вспомогательные обязанности" (373 px); im Blatt ragt „Удалить вспомогательную обязанность" links 40 px hinaus |
| Waagerechter Rollbalken | 8 Ansichten | Seitenleiste am Desktop, de 1180/1440 Stufe 1.45: „Zusammenkünfte" 31 px zu breit. Im Bild zusätzlich: en „Notifications" läuft unter den Zähler. |

Die Zahl „Gruppen:\|4" im Kopf des Reinigungsblatts kommt aus T127 (uncommittet).
Auf HEAD steht dort nur „Gruppen-Rotation". Dieselbe Regel wie bei „Personen: n"
deckt sie mit ab.

## Plan (erst nach dem Commit von T127, auf dessen Stand)

Alles unten ist im echten Chrome als **Simulation** gemessen: CSS als `<style>`
im Tab eingehängt, das geschützte Leerzeichen und das weiche Trennzeichen in die
Textknoten gesetzt. Die Regeln stehen in `nachher-k6.css` im Scratchpad.

### 1. Die Zahl bleibt bei ihrer Bezeichnung

Empfehlung: **zentral in `fill()`** (`src/i18n/useT.ts`). Nach dem Einsetzen der
Werte wird ein Leerzeichen zum geschützten Leerzeichen, wenn es zwischen einem
Doppelpunkt und einer Ziffer steht („Personen: 26", „الأشخاص: 26") oder zwischen
einer Ziffer und einem Buchstaben („3 kişi", „1 Tag vorher", „{n} نفر"). Die
Regel arbeitet mit `\p{Nd}`/`\p{L}`, gilt also in allen zwölf Sprachen, auch für
Werte aus `Intl` („1 Tag" aus `zeitspanne`).
- Das Datum der Kopfzeile kommt nicht durch `fill`. Dort wird jedes Leerzeichen
  geschützt, das nicht hinter einem Komma steht („Montag,␣7. September",
  „poniedziałek,␣7 września").
- Gespeicherte Mitteilungen baut niemand mit `fill`; geprüft wurde, dass
  `src/data`, `src/lib` und `supabase/functions` es nicht importieren. Die
  Übersetzung der Mitteilungs-Atome bleibt also unberührt.
- Geschrieben wird das Zeichen als Escape-Folge im Stil von `fr.ts`, per
  `.mjs` (`String.fromCharCode(92) + 'u00a0'`), danach nachgezählt.
- Die Alternative wären die Wörterbücher selbst: rund 90 Schlüssel × 12 Sprachen
  plus eine Wache für jeden neuen Text. Das ist mehr Handarbeit und genau die Art
  handgepflegter Liste, die sonst vergessen wird.

### 2. CSS

| Datei | Regel | Wirkung |
|---|---|---|
| `bausteine/bausteine.css` | `.seitentitel`: `hyphens: auto` (+ `-webkit-`), `overflow-wrap: break-word` | „Вспомога-тельные" statt 53 px Überbreite |
| `einstellungen/einstellungen.css` | `.einst-karte { container-type: inline-size }`, `@container (max-width: 15em)`: Wert unter den Namen (`.einst-zeile`, ohne `--entfernbar`), Plus/Minus unter den Dienst (`.hd-zeile`) | greift nur am Handy ab Stufe 1.15 (320 px) bzw. 1.45 (375 px); bei Stufe 1 bleibt alles, wie es ist |
| `components/overlays.css` | `.sheet-fuss-ende { flex-wrap: wrap }` | „Fertig" rückt unter „Hilfsdienst entfernen", statt dass der linke Knopf hinausragt |
| `app/menue.css` | `.schmale-leiste { width: calc(88px * max(1, var(--fs))) }` | Leiste am Tablet wächst mit der Schrift; bei Stufe ≤ 1 bleiben 88 px |
| `app/menue.css` | `.leiste { width: max(248px, calc(124px * (1 + var(--fs)))) }` | Seitenleiste am Desktop: 248 px bei Stufe 1, 304 px bei 1.45 (gemessen: 272 und 288 reichen für „Powiadomienia" mit Zähler nicht) |
| `app/menue.css` | `.menue-eintrag-text`: `hyphens: auto`, `overflow-wrap: break-word` | kein Text mehr unter dem Zähler, kein Rollbalken |
| `components/overlays.css` | `.sheet-title`: `hyphens: auto`, `overflow-wrap: break-word` | „Eingangsordner" ragte 7 px, „Распорядитель у входа" 9 px aus dem Kasten |
| `bausteine/bausteine.css` | `.schalter-text`: `hyphens: auto`, `overflow-wrap: break-word` | „Дополнительный класс" ragte 3 px hinaus |

Dazu der Kommentar an `.leisten-eintrag`, der die 88 px nennt.

### 3. Ein weiches Trennzeichen

`overlays/tr.ts`, `navAuswertung`: „Değerlen|dirme" — an „|" ein weiches Trennzeichen U+00AD,
per `.mjs` geschrieben, nachgezählt). Türkisch hat kein Wörterbuch in Chrome, und
„Değerlendirme" passt in keiner Stufe in die Leiste.

### 4. Tests

- `fill.test.ts`: aus den zwölf Wörterbüchern abgeleitet. Jede Vorlage mit
  Zahl-Platzhalter neben einem Leerzeichen liefert die Zahl gebunden. Dazu eine
  Sabotage-Probe: Ohne die Regel wird der Test rot.
- Rund 18 Zusicherungen mit „Bezeichnung: n" als Wortlaut (`toBe('Personen: 1')`
  u. a.) bekommen das geschützte Leerzeichen.
- CSS lässt sich unter jsdom nicht messen. Den Beleg liefert das Messskript im
  echten Chrome, Vorher und Nachher auf dem dann aktuellen Stand, ausgedehnt auf
  alle Unteransichten der Einstellungen (Sprachen, Gruppen und Trolleys,
  Erinnerungen), denn `.einst-karte` steht auch dort.
- `npx oxlint`, `npx tsc -b`, `npx vitest run --testTimeout=60000`, im eigenen
  Worktree, solange andere Sitzungen im Ordner arbeiten.

### 5. Danach

- `.claude/skills/verify/SKILL.md`: eine Zeile „Silbentrennung nur im echten
  Chrome prüfen" (das Pane hat keine Wörterbücher).
- Auf Wunsch das Messskript als `scripts/umbruch-probe.mjs` ins Repo (wie die
  Mutationsprobe).
- `/simplify`, danach `/code-review max` anbieten.

## Ergebnis der Simulation (echter Chrome 155)

| Lauf | Fälle | Bruch im Wort ohne Strich | Zahl getrennt | Seite zu breit | waagerechter Rollbalken | Text ragt aus seinem Kasten |
|---|---|---|---|---|---|---|
| Vorher, HEAD `546f7f73`: 12 Sprachen × 6 Breiten × Stufe 1/1.45 | 144 | 109 | 94 | 3 | 8 | (nicht erfasst) |
| Nachher, gleiche Matrix | 144 | 0 | 0 | 0 | 0 | 0 |
| Nachher, Desktop 1180/1440 × Stufe 1.15/1.3 | 48 | 0 | 0 | 0 | 0 | 0 |
| Nachher, Stufen 0.9/1.15/1.3 × 320/375/768 (ohne das weiche Trennzeichen) | 108 | 4, nur tr „Değerlendirme" | 0 | 0 | 0 | – |
| Vorher, neuer Stand `359c7d4b` (mit T127), Handy 320/375 × Stufe 1/1.45 | 48 | 33 | 67 | 3 | 0 | 9 |
| Nachher, neuer Stand, Handy | 48 | 0 | 0 | 0 | 0 | 0 |

Auf dem neuen Stand zeigt die Messung auch den gemeldeten Fall im Kopf des
Reinigungsblatts: „Grupy:|4" (pl), „4|grup" (tr).

Nicht gemessen: Safari/iPhone und Firefox, denn beide gibt es auf diesem Rechner
nicht. Die Layout-Regeln wirken dort genauso; welche Sprachen dort trennen, hängt
an deren eigenen Wörterbüchern.

Bilder (Vorher | Nachher) im Scratchpad unter `umbruch\vergleich\`:
0 Pane gegen Chrome, 1 Einstellungen de 320/1.45, 2 Hilfsdienste pl, 3 Blatt
Reinigung ru, 4 Hilfsdienste ar, 5 Leiste tr 768/1, 6 Leiste fr 768/1.45,
7 Seitenleiste en 1440/1.45.

## Stand danach

Der Betreiber hat die Umsetzung auf später gelegt. Der Plan steht als **T128** in
`docs/analyse/todo.md` (uncommittet, drei eigene Hunks). Die Skripte liegen als
Kopie in `umbruch-werkzeug\` neben dieser Notiz.
