# Nachtrag: Prüfung der Abarbeitung (7. August 2026)

Gegenprüfung der Umsetzung von `todo.md` durch dieselbe Session, die die
Analyse erstellt hat — gelesen wurde der Code, nicht die Commit-Nachricht.
Geprüft: die fünf bestrittenen Befunde, die zwei teilweise umgesetzten, die
neuen Tests, mitgenommenes Verhalten und was gar nicht adressiert wurde.

Die Belegdateien (`befunde.md`, `code-review.md`, `pruefergebnisse.md`,
`lesepruefungen.md`, `umgebungspruefungen.md`, `todo.md`) sind **unverändert**.
Was hier steht, ist der Stand danach.

---

## 1. Die fünf bestrittenen Befunde

| Befund | Ergebnis der Gegenprüfung |
| --- | --- |
| **T1** `MON`→`MONA` | **Widerspruch trägt.** `[A-Za-zäöü]+` fängt beide Monatsformen; der Tausch hätte den Absturz nur auf „Mo, 8. September" verschoben. `datumsRegel()` ist die richtige Lösung. Zusätzlich richtig entschieden: `??` statt `||` (Januar ist Index 0 und wäre bei `||` durchgefallen) und der Rückfall auf `m[0]` statt auf einen Ersatzmonat. |
| **T11** `config.toml` | **Widerspruch trägt.** `config.toml` stammt aus `b76995f` und ist Vorfahr von `e2cdb41` — die Datei lag zum Analysezeitpunkt vor und wurde übersehen. Im Repo ist nichts zu tun. |
| **T28** REF | **Widerspruch trägt nur halb — korrigiert.** id/tl/vi/sw sind vollständig (der ursprüngliche Befund war insoweit falsch). „Nur bg fehlt `wcgKap`" stimmt aber nicht: es fehlen **17 Vorlagen in 10 Sprachen**. Siehe § 2. |
| **T50** `--primary`/`--clear` | **Widerspruch trägt.** BEM-Modifier (`plan-auto-btn--primary`), definiert in `planen.css:57`/`:69`. Lesefehler der Analyse. |
| **T51** z-index | **Widerspruch trägt.** Die Begründung nennt die zwei echten Zwänge (S-89 öffnet aus dem Sheet; Dialog über Toast). Mit vier Ebenen wäre eine davon gekippt. |

**Ebenfalls geprüft und in Ordnung:** T5 (`melder` wird in `store.tsx:49-60`
produktiv registriert, mit 5-Sekunden-Drossel), T13 (`currentWeekIndex` fällt
sauber auf das alte Flag und dann auf `weekFrom` zurück), T16 (die
Sortierrichtung in `shiftPartConfirmations` stimmt in beiden Richtungen), T19
(`openSlotLabels` und `countOpenSlots` laufen jetzt über dieselben Quellen),
T20 (`ausschalten` löscht `auxRatgeber` wirklich), T23 (die Extraktion nach
`kandidaten.ts` ist gegen die alte Inline-Fassung verglichen — bis auf den
gewollten T18-Fix identisch).

**Nicht auf der Liste, aber miterledigt:** **B16** (zwei Personen springen
gleichzeitig in denselben Slot) ist behoben — `substitute/index.ts:368-379`
hängt `originalName` als Vorbedingung an den PATCH.

---

## 2. Was in dieser Session behoben wurde

Alle Änderungen sind sabotage-geprüft: die Korrektur wurde jeweils rückgängig
gemacht und geprüft, dass der zugehörige Test rot wird. Testbestand **967 →
999**, `tsc -b`, `oxlint` und `build` sauber.

### N1 · T21 war halb umgesetzt und erzeugte einen neuen Widerspruch
`helpers.ts` · Test: `helpers.test.ts` „loadWindow hält sich an dieselbe
Platzgrenze wie workloadOf"

`helperWorkload` bekam den `services`-Parameter, `loadWindow` rief es weiter
ohne auf. Im Zuteilungs-Sheet stehen beide Zahlen nebeneinander: nach einer
reduzierten Platzzahl zeigte dieselbe Zeile „0 Aufgaben in 5 Wochen" plus
grünes „frei" **und** ein eingefärbtes `helper`-Quadrat. Vorher zählten beide
alles und stimmten überein — der Fix hatte den Widerspruch erst geschaffen.

`loadWindow(weeks, name, wi, services?, radius?)` — `services` steht **vor**
`radius`, weil es der häufigere Parameter ist; die zwei Testaufrufe mit
explizitem Radius wurden angepasst. `kandidaten.ts:171` gibt `state.services`
durch.

### N2 · T15 ließ eine Tür offen, durch die derselbe Fehler zurückkam
`meeting-edit.ts` (neu: `endenNachziehen`), `reducer.ts`, `persist.ts` · Tests
in allen dreien

`end` steht in den Wochendaten und wurde nur beim Import gerechnet; die
Startzeit holt `meetingTime()` bei jeder Anzeige frisch aus den Einstellungen.
Stellte die Versammlung von 19:00 auf 18:30 um, zeigte der Programmkopf sofort
18:30 und die Fußzeile weiter „Ende ca. 20:45" — 2:15 auf dem Blatt. Genau der
Fehler, den T15 behebt, nur durch die andere Tür.

Drei Entscheidungen dabei:

- **Verschoben, nicht neu gerechnet.** `lacAdjust` hat die Endzeit womöglich
  schon um geänderte Programmminuten versetzt. Diese Anpassung des Planers darf
  eine Zeitumstellung nicht verwerfen.
- **Wochen mit eigener Uhrzeit im `date`-Feld bleiben unberührt** — nach
  derselben Regel, nach der `meetingTime()` die Startzeit bestimmt. Das betrifft
  Sondertermine ebenso wie Demo- und Altwochen. Übrig bleiben die importierten
  Wochen, und nur dort klaffte es.
- **Bei unklarer Zuordnung gar nichts.** `meetingTimesOf` liest positionsweise;
  fehlt in einem der beiden Texte eine Uhrzeit, rutscht die Zuordnung (aus
  „Di abends · So 10:00" würde für die Wochenmitte 10:00). Dann bleibt alles
  stehen.

`persist.ts` schreibt nur die Wochen, deren Referenz sich geändert hat — der
Reducer gibt unveränderte identisch zurück.

### N3 · U3 — die Treffpunkt-Zuteilung hatte den behobenen Fairness-Fehler noch
`helpers.ts` (`tieHash` hierher gezogen), `fs.ts`, `planning.ts` · Test:
`fs.test.ts` „wechselt die Reihenfolge bei Gleichstand von Woche zu Woche"

`fs.ts` hatte eine eigene Hash-Fassung ohne Avalanche — genau die, deren
Fehlerbild in `planning.ts` seit Langem ausführlich dokumentiert ist. Gemessen
über 20 Wochen mit fünf gleich ausgelasteten Kandidaten: die alte Fassung
erreichte **2** von 5 (und bei gleicher Stringlänge, `wi` 0–9, genau **einen** —
die zweite Rangliste entsteht erst, wenn die Wochennummer zweistellig wird), die
gemischte erreicht **alle 5**.

`tieHash` steht jetzt in `helpers.ts` und wird von beiden benutzt. Der
Schlüssel wird zusätzlich getrennt gefügt (`` `${name}|${wi}|${wd}` `` statt
`name + wi`): „Ann"+„a12" und „Anna"+„12" waren vorher derselbe.

### N4 · U9 — `partWorkload` zählte Begleiter per Teilzeichenkette
`helpers.ts` (neu: `rolleNennt`) · Test: `helpers.test.ts`

`slot.rolle?.includes(name)` gab „Anna" eine Aufgabe, die „mit Annalena Berg"
gehört. Eine solche Phantom-Last genügt, um jemanden bei der Auto-Zuteilung
dauerhaft hinten anzustellen. Jetzt Prüfung auf Wortgrenzen — bewusst ohne
regulären Ausdruck, weil Namen Sonderzeichen enthalten dürfen („O'Brien",
„Müller-Lüdenscheidt") und dann als Muster verstanden würden.

### N5 · B17 — unbehandelte Ablehnung beim Nachladen
`store.tsx:117-131` · Test: `store.test.tsx` „fängt einen abgelehnten
Overlay-Import ab"

`loadOverlay(...).then(...)` und `bibelbuecherLaden().then(...)` hatten kein
`.catch()`. Nach einem Deployment sind die alten Lazy-Chunks weg, der
dynamische Import scheitert, die Sprache bleibt still auf Englisch. **T2 deckt
das nicht ab**: eine Error Boundary fängt keine abgelehnte Promise, weil sie
außerhalb des Renderns entsteht.

### N6 · T25 — die Ausnahmeliste war nicht gegen Wachstum geschützt
`translate-data.test.ts` · Test: „die Ausnahmeliste wächst nicht heimlich"

`NUR_GEMESSEN_UEBERSETZBAR` hatte einen Schutz gegen Tippfehler, aber keinen
Deckel: ein neuer unübersetzter Titel konnte jederzeit hineinwandern, ohne dass
ein Test etwas merkt. Jetzt auf **28** festgenagelt. Die Vorlage dafür stand
zwei Blöcke weiter unten bei den REF-Ausnahmen.

### N7 · T28 — der REF-Test war auf den Datenstand zugeschnitten
`translate-data.test.ts` · Tests: drei, siehe unten

Die Pflichtliste enthielt fünf der neun Vorlagen und ließ genau die drei aus,
die fehlen (`lmdLek`, `lffLek`, `lmdAnh`). Dazu nahm `OHNE_KUERZEL` sieben
Sprachen ganz heraus mit der Begründung, in deren Arbeitsheften stünden die
Publikationskürzel gar nicht — was weder zur Tabelle passt (alle sieben *haben*
REF-Einträge) noch zum Kommentar in `verweisRegeln` („Ostasien und die
RTL-Sprachen übersetzen das Kürzel mit"). Vier der sieben Ausnahmen deckten
echte Lücken mit ab.

Ersetzt durch eine Lückenliste, die benennt, was wirklich fehlt:

| Vorlage | fehlt in |
| --- | --- |
| `lmdLek` + `lffLek` | cs, sk, hu, tr, zh, ko |
| `lmdAnh` | sr, tr, fa, ur |
| `wcgKap` | bg |

Drei Zusicherungen darauf: jede **nicht** angemeldete Lücke lässt den Test
scheitern; eine angemeldete, die inzwischen gefüllt ist, ebenfalls (sonst deckt
eine tote Ausnahme die nächste echte Lücke zu); und die Zahl (10 Sprachen, 17
Vorlagen) ist festgenagelt.

**Nicht gefüllt wurden die Lücken selbst** — dazu müsste der Wortlaut an jw.org
gemessen werden, und eine erfundene Vorlage wäre schlimmer als ein erkennbar
deutsch gebliebener Verweis. Das ist dieselbe Linie, die die andere Session bei
`bg`/`wcgKap` gezogen hat. Praktische Folge heute: `lmd Anhang A Punkt N` steht
im Demo-Datensatz zweimal und bleibt auf Serbisch, Türkisch, Persisch und Urdu
deutsch.

### N8 · T16 — Client und Datenbank konnten auseinanderlaufen
`planning.ts` in `shiftPartConfirmations`

`if (status) next[neu] = status` verwarf einen falsy Status stillschweigend,
schrieb aber trotzdem ein Rename-Paar für die Datenbank. `TaskStatus` kennt
heute keinen falsy Wert; die Kopplung soll aber auch dann halten, wenn einer
dazukommt. Jetzt bedingungslos übernommen.

---

## 3. Zur Testqualität

Der Anspruch „jede Korrektur hat einen Test, der ohne sie rot wird" hält bis
auf die eine Stelle, die bereits bekannt war (`supabase.test.ts`, behoben in
`dc16e22`). **Weitere umgebungsabhängige Tests gibt es nicht** — `supabase.test.ts`
ist die einzige Datei unter `src/` und `supabase/`, die `import.meta.env`,
`process.env` oder `VITE_` anfasst.

Die Lücke lag woanders und war eine andere Sorte: **auf den Datenstand
zugeschnittene Zusicherungen** (N7) und **Ausnahmelisten ohne Deckel** (N6).
Beide Muster sind jetzt geschlossen. Als Faustregel für künftige Ausnahmen:
Wer eine Ausnahmeliste anlegt, legt daneben die Prüfung an, dass sie nicht
wächst — und die Gegenprüfung, dass jeder Eintrag darin noch stimmt.

Zwei Beobachtungen ohne Handlungsbedarf: `expect(MEETING_MINUTES).toBe(105)`
ist tautologisch (als Sperre gegen unbedachte Änderung in Ordnung, als
Regressionstest wertlos), und `kandidaten.test.ts` prüft mit 12 Tests weder
`free` noch `load` — deshalb fiel N1 dort nicht auf. Die Lücke deckt jetzt
`helpers.test.ts` ab.

---

## 4. Was weiterhin offen ist

Zu den 14 in `todo.md` genannten kommen diese hinzu. Sie brauchen eine
Entscheidung, kein Nachbessern.

| Punkt | Wo | Worum es geht |
| --- | --- | --- |
| **T28-Lücken füllen** | `translate-data.ts` | 17 Vorlagen in 10 Sprachen. Braucht gemessenen Wortlaut von jw.org je Sprache. Vorfrage: kommt `lmd Lektion N` **ohne** Punktnummer (ältere Arbeitshefte) überhaupt noch vor? Wenn nein, gehören `lmdLek`/`lffLek` aus der Prüfliste heraus statt in die Lückenliste — dann bleiben nur 5 echte Lücken. |
| **T25-Titel** | `translate-data.test.ts` | 22 veröffentlichte Titel. Dieselbe Frage: messen oder deutsch lassen. |
| **B15** | `planning.ts:644` | Ohne konfigurierte Gruppen erzeugt die Auto-Zuteilung `Gruppe 1…3` (fest kodierte 3), während das Zuteilungs-Sheet eine leere Liste zeigt. Der Planer kann nicht auswählen, was die Automatik einträgt. Drei Wege: Gruppen anlegen erzwingen, Reinigung ohne Gruppen offen lassen, oder im Sheet einen Hinweis zeigen. |
| **U4** | `kandidaten.ts:109` vs. `:157` | Zwei Auslastungs-Fenster nebeneinander: Treffpunkte über **alle** Wochen, Programm über ±2. Die Extraktion hat das getreu übernommen und dadurch sichtbar gemacht. Welches Fenster gilt für Treffpunkte? |
| **S8** | `index.html:64-67` | IBM Plex und Newsreader kommen von `fonts.googleapis.com`. Jeder Aufruf meldet die IP an einen Dritten, und ohne Netz zu diesem Host fällt die Typografie aus. Selbst ausliefern (rund 200 kB im Repo), Systemschriften, oder so lassen. |
| **T15 Restfrage** | — | Eine importierte Woche, die von sich aus abweicht (Kreisaufseher, Gedächtnismahl), bekommt Start + 105 min. Gehört fachlich zu T29–T34. |

---

## 5. Für die andere Session

Der Stand ist committfähig: `npm test` (999), `npx tsc -b`, `npm run lint`,
`npm run build` — alles grün, im Browser geprüft (Demo-Modus, Zuteilungs-Sheet,
keine Konsolenfehler).

Zwei Dinge zum Weiterarbeiten:

1. **`loadWindow` hat eine neue Signatur** — `services` als vierter Parameter,
   `radius` als fünfter. Wer sie aufruft und Hilfsdienste korrekt gezählt haben
   will, muss `services` durchgeben.
2. **`tieHash` steht jetzt in `helpers.ts`**, nicht mehr in `planning.ts`. Wer
   einen weiteren Tie-Break braucht, nimmt diesen — nicht wieder einen eigenen.
