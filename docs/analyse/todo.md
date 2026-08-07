# TODO — Abarbeitungsreihenfolge

Arbeitsliste aus der Analyse vom 7. August 2026 (Commit `e2cdb41`).
Begründungen stehen in [befunde.md](befunde.md), [code-review.md](code-review.md),
[pruefergebnisse.md](pruefergebnisse.md), [lesepruefungen.md](lesepruefungen.md),
[umgebungspruefungen.md](umgebungspruefungen.md).

**So ist sortiert:** nach Abhängigkeit, nicht nur nach Schwere. Frühe Aufgaben
machen spätere überhaupt erst überprüfbar — insbesondere T4 (Tests in CI) und T5
(Schreibfehler sichtbar). Innerhalb einer Phase kann man die Reihenfolge tauschen.

**Angaben je Aufgabe:** Was zu tun ist · wo · wie man prüft, dass es wirkt.
Aufwand: ⚡ = Minuten · 🔧 = Stunden · 🏗 = Tag(e).

**Wenn nur ein Tag Zeit ist:** Phase 0 und 1 komplett (T1–T7). Das behebt einen
Totalausfall, verhindert stillen Datenverlust und schafft das Sicherheitsnetz für
alles Weitere.

---

## Phase 0 — Sofort (⚡ zusammen unter einer Stunde)

### T1 · Totalausfall in 30 Sprachen beheben ⚡ ✅ erledigt
**`src/i18n/translate.ts:165`** — in der Regel für die Kurzform
`(Mo|Di|…), <Tag>. <Monat>` steht `MON[m[3]]`; richtig ist **`MONA[m[3]]`**
(Kurzmonat-Tabelle). `MON['Sep']` ist `undefined` → `Invalid Date` →
`Intl.format()` wirft → weißer Bildschirm.

Dieselbe Regel in `makeTr` (Zeile 188) prüfen — dort erzeugt sie „Tue, undefined 8"
statt eines Absturzes, ist aber genauso falsch.

**Prüfen:** Demo-Modus → Profil → Sprache „Italiano" → Glocke antippen. Vorher:
App verschwindet. Nachher: Mitteilungen erscheinen.
→ [pruefergebnisse.md § 0](pruefergebnisse.md)

> **Umsetzung weicht ab (Commit folgt der T-Nummer):** `MON` → `MONA` wäre der
> falsche Fix — die Regel fängt den Monat als `[A-Za-zäöü]+` und bekommt beide
> Formen („8. September" aus dem Programmkopf, „8. Sep" aus den
> Erinnerungstexten). Der Tausch hätte den Absturz nur von der Kurz- auf die
> Langform verschoben und den bestehenden Test `en('Mo, 8. September')`
> gebrochen. Stattdessen: Hilfsfunktion `datumsRegel(...)`, die in **beiden**
> Tabellen nachschlägt und bei unbekanntem Monat die Regel ausfallen lässt
> (Datum bleibt deutsch, statt als `Invalid Date` bei `Intl.format()` zu
> landen). Gilt für alle acht Monats-Nachschläge in beiden Pfaden.
> Prüfung ausgeführt: 30 Sprachen × 9 Datumsformen, vorher 37 rote Tests.

### T2 · Error Boundary einziehen ⚡ ✅ erledigt
Im Projekt gibt es **null** Error Boundaries (`grep` über `src`). Deshalb reißt
jeder Komponentenfehler die ganze App mit.

Einen um `<Content />` in `AppShell.tsx` und einen um den Overlay-Block
(NotificationsPanel/AssignSheet/S89Sheet/MyTaskSheet) legen. Inhalt: Hinweistext
+ „Neu laden".

**Prüfen:** T1 rückgängig denken — ein Fehler im Overlay darf den Rest der App
stehen lassen.

### T3 · `"strict": true` einschalten ⚡ ✅ erledigt
**`tsconfig.app.json`** — kostet **nachweislich 0 Codeänderungen**: `tsc --strict`
über den ganzen Quellbaum meldet 0 Fehler. Der Code ist längst konform, nur
ungesichert.

**Prüfen:** `npx tsc -b` bleibt grün.
→ [pruefergebnisse.md § 2](pruefergebnisse.md)

### T4 · Tests und Lint in die CI ⚡ ✅ erledigt
**`.github/workflows/deploy.yml`** — zwischen `npm ci` und `npm run build` je einen
Schritt `npm test` und `npm run lint` einfügen. 727 Tests laufen heute in keiner
Pipeline.

**Prüfen:** Einen Test absichtlich brechen, pushen, Workflow muss rot werden.

---

## Phase 1 — Stille Fehler sichtbar machen (🔧 ein halber Tag)

> T5 zuerst: Ohne sichtbare Schreibfehler lässt sich bei T6 nicht feststellen,
> ob der Fix greift.

### T5 · Fehlgeschlagene Schreibvorgänge melden 🔧 ✅ erledigt
**`src/lib/data.ts:742-745`** — `run()` schluckt jeden Fehler in `console.error`.
Alle 20 `save*`/`delete*`-Funktionen sind fire-and-forget, der Erfolgs-Toast
entsteht im Reducer **bevor** geschrieben wird. RLS-Verstoß, abgelaufenes Token,
Timeout: Der Nutzer sieht Erfolg, die Datenbank hat nichts.

`run()` einen Fehler-Callback geben, der einen Toast auslöst
(„Änderung konnte nicht gespeichert werden — bitte neu laden").

**Prüfen:** Netz in den DevTools drosseln/blocken, eine Zuteilung vornehmen →
Fehlermeldung statt „Zugeteilt".
→ [code-review.md § 3.1](code-review.md)

### T6 · `schema.sql` vervollständigen 🔧 ✅ erledigt
Es fehlen **`fs_rules`, `fs_weeks`, `is_group_overseer()`** (aus migration-010),
**`reminder_log`** (011) und **`persons.fam`** (013) — obwohl jede Migration
behauptet „schema.sql enthält alles" und `README.md:216` genau diesen Weg anweist.

Folge für jede Neuinstallation: Treffpunkte tot, und **jedes Speichern einer
Person schlägt fehl** (`personToRow` schreibt `fam`) — still, wegen T5.

Zusätzlich: **`lib/data.ts:604`** prüft nur 10 der 12 Abfrageergebnisse —
`fsRulesRow` und `fsWeeksRows` fehlen in der Fehlerliste, deshalb bleibt ein
Ladefehler dort stumm.

**Prüfen:** Frische Supabase-Instanz nur mit `schema.sql` aufsetzen, Person
anlegen und speichern.
→ [lesepruefungen.md § B7](lesepruefungen.md) · Die laufende Instanz ist bereits
vollständig migriert, betroffen sind nur neue.

### T7 · Offline: Ansichts-Aktionen freigeben ⚡
**`src/app/readonly.ts:16-48`** — `openMyTask`, `closeMyTask` und `welcomeShown`
fehlen in der Positivliste. Offline lässt sich die eigene Aufgabe nicht öffnen,
und beim Start erscheint statt der Begrüßung ein „nur lesend"-Toast.

**Prüfen:** Debug-Hash `#stale=2`, Aufgabe antippen.

---

## Phase 2 — Edge Functions absichern (🔧 ein halber Tag, eine Sitzung)

### T8 · `CRON_SECRET` erzwingen ⚡
**`supabase/functions/send-reminders/index.ts:322`** —
`if (CRON_SECRET && …)` lässt bei **fehlendem** Secret jeden durch; die Function
ist mit `--no-verify-jwt` deployt und gibt im Dry-Run die Vorschau **aller**
Versammlungen zurück. In der laufenden Instanz ist das Secret gesetzt (live
geprüft), die Konstruktion bleibt trotzdem fail-open.

Ohne Secret mit 500 abbrechen.

### T9 · `substitute: seek` gegen den Aufrufer prüfen ⚡
**`supabase/functions/substitute/index.ts:253`** — geprüft wird nur die
Mitgliedschaft. Jedes Mitglied kann für **jeden beliebigen** Hilfsdienst-Slot eine
Ersatzsuche auslösen: Push an alle Qualifizierten mit der Aussage „*Name* kann
nicht."

Prüfen, dass der Aufrufer der eingetragene Bearbeiter ist **oder** eine
`verhindert`-Bestätigung für diesen `task_key` existiert.

### T10 · `substitute: take` gegen Doppelübernahme sichern 🔧
**`substitute/index.ts:222-288`** — zwischen Lesen und `PATCH` liegt kein Lock und
keine Vorbedingung. Zwei gleichzeitige Übernahmen überschreiben sich; der zweite
Aufruf löscht per `DELETE confirmations?task_key=eq.…` sogar die Bestätigung des
ersten. Der erste steht danach nirgends, hat aber „übernommen" gesehen.

Vorbedingung mitschicken (nur schreiben, wenn der Slot noch `originalName` trägt)
oder wie `redeem_invite` (migration-012) mit `FOR UPDATE` arbeiten.

### T11 · `substitute` ohne `--no-verify-jwt` deployen ⚡
Live-Test zeigt: Der Request erreicht die Function, die Plattform prüft **nicht**
— entgegen dem Deploy-Hinweis in `substitute/index.ts:24`. Der Schutz hängt damit
an einer einzigen Codestelle.

**Prüfen:** `curl -X POST …/functions/v1/substitute -d '{}'` muss
`UNAUTHORIZED_NO_AUTH_HEADER` liefern (wie `send-invite`), nicht
`{"error":"unauthorized"}`.
→ [umgebungspruefungen.md § D3](umgebungspruefungen.md)

---

## Phase 3 — Themenblock „Datum" (🏗 ein Tag, zusammen erledigen)

> Diese vier hängen an derselben Ursache. Einzeln gemacht, macht man dieselbe
> Stelle viermal auf.

### T12 · Eine einzige Datumsquelle schaffen 🔧
Heute gibt es **vier** Rechnungen für „welcher Kalendertag ist Woche *n*":
`meetingDate` (`meeting-dates.ts:86`, berücksichtigt Sondertermine),
`meetingDateMs` (Z. 106, tut es nicht), `personTimeline` (Z. 76-78, eigene
Variante) und `daysUntil` in `send-reminders` (Z. 236). Der Kommentar in
`meeting-dates.ts:83` behauptet, es gäbe nur eine.

`meetingDate()` zur alleinigen Quelle machen, die übrigen daraus ableiten.

**Prüfen:** Eine Woche mit abweichendem Termin (Gedächtnismahl) — Countdown,
Erinnerung und Abwesenheitsprüfung müssen denselben Tag nennen.
→ [befunde.md U1](befunde.md)

### T13 · Aktuelle Woche aus dem Datum ableiten 🔧
`week.current` wird **nur** in `demo.ts` gesetzt und nie nachgeführt. Folgen:
- **`reducer.ts:885`** startet nach dem Login auf `weekFrom` = der **ältesten**
  geladenen Woche (bis zu ein Jahr zurück)
- **`DashboardScreen.tsx:53`** meldet dauerhaft **„0 Konflikte"** (`curIdx` ist −1)
- Der Chip „AKTUELLE WOCHE" erscheint nie

`current` aus `week.start` + heute berechnen und beim Hydrieren auf diese Woche
springen.

**Prüfen:** Login → Programm zeigt die laufende Woche; Dashboard nennt echte
Konfliktzahlen.
→ [befunde.md B1, B2](befunde.md)

### T14 · Echtes Datum statt Wochenspanne anzeigen 🔧
Importierte Wochen tragen als `Meeting.date` die **Wochenspanne**
(`parse.ts:288`: `date: range` → „7.–13. September"). An der Live-Seite bestätigt:
Das `h1` liefert weder Jahr noch Wochentag noch Uhrzeit.

Betroffen: „Meine Aufgaben", Dashboard-Hero, **S-89-Formular**
(`planning.ts:729`), Programm-Kopf, Push-Text. `person-timeline.ts` rechnet es
bereits richtig — dieselbe Logik (T12) überall verwenden.

**Prüfen:** Nach einem Import zeigt „Meine Aufgaben" „Dienstag, 8. September ·
19:00", nicht „7.–13. September".
→ [befunde.md B4](befunde.md)

### T15 · Import: Endzeit aus den Einstellungen rechnen 🔧
`parse.ts:288/388` setzt fest `Ende ca. 20:45` bzw. `11:45`, unabhängig von den
gepflegten Zusammenkunftszeiten. Beginnt die Versammlung um 18:30, steht auf
jedem Programmblatt eine falsche Endzeit.

Ende aus Startzeit + Summe der Programmminuten erzeugen.
→ [befunde.md F5](befunde.md)

---

## Phase 4 — Datenintegrität (🏗 ein bis zwei Tage)

### T16 · Bestätigungen beim LAC-Bearbeiten mitverschieben 🔧
`task_key` ist positionsbasiert. `lacMove` tauscht die Bestätigungen korrekt mit
(`swapPartConfirmations`), **`lacRemove` und `lacAdd` tun es nicht**
(`reducer.ts:755/794`, `persist.ts:196-203`).

Nach dem Löschen eines LAC-Punkts erbt der nachfolgende Punkt die fremde
Bestätigung; der eigentliche gilt wieder als offen und wird erneut erinnert.

**Prüfen:** Punkt bestätigen, davorliegenden Punkt löschen, Status prüfen.
Test analog zu `confirmations.test.ts:78` schreiben.
→ [befunde.md B3](befunde.md)

### T17 · Zusätzliche Klasse in der Doppelbelegungs-Prüfung 🔧
**`planning.ts:183-196`** — `assignmentsInMeeting` iteriert nur `item.names`,
nicht `slotsOf(item, aux)`, und kennt `auxRatgeber` nicht. Direkt daneben machen es
`countOpenSlots`, `changedSlotKeys` und `clearAssignments` über `raeume()` richtig.

Folgen: Der Hinweis „heute schon zugeteilt" bleibt aus; das Dashboard zeigt „frei"
für jemanden, der in der Klasse eingeteilt ist; `takeSubstitute` übersieht den
Konflikt.

**Prüfen:** Person in der Klasse einteilen, dann im Hauptsaal zuteilen → Hinweis
muss erscheinen.
→ [befunde.md B5](befunde.md)

### T18 · Partner-Geschlecht am richtigen Raum prüfen ⚡
**`AssignSheet.tsx:129-133`** — der Gesprächsführer wird in `partItem.names`
gesucht, unabhängig davon, ob der Platz zur Zusätzlichen Klasse gehört
(`partSel.aux`). Die **Auto**-Zuteilung macht es richtig und begründet es
ausdrücklich (`planning.ts:501-511`).
→ [befunde.md B6](befunde.md)

### T19 · Offene Slots einheitlich zählen ⚡
**`planning.ts:320`** — `openSlotLabels` ignoriert Klasse und Ratgeber,
`countOpenSlots` (Z. 250) zählt beide. Der Planen-Kopf nennt deshalb eine höhere
Zahl, als das Banner darunter auflistet.
→ [befunde.md U2](befunde.md)

### T20 · Auslastung: Klasse nur zählen, wenn sie besteht ⚡
**`helpers.ts:262`** — `partWorkload` zählt `item.aux` bedingungslos, auch nachdem
die Klasse abgeschaltet wurde (die Namen bleiben bewusst stehen). Dadurch
bevorzugt die Auto-Zuteilung dauerhaft die Falschen. `hatAuxKlasse` prüfen, wie
alle anderen Leser.
→ [befunde.md B9](befunde.md)

### T21 · Hilfsdienst-Last nur bis `svc.count` ⚡
**`helpers.ts:277`** zählt alle Einträge, `deriveMyTasks` nur `pos < svc.count`.
Wird die Platzzahl reduziert, verschwindet die Aufgabe aus „Meine Aufgaben",
zählt aber weiter als Last.
→ [befunde.md B12](befunde.md)

### T22 · `togglePartner` gleicht die Klasse an ⚡
**`meeting-edit.ts:204-212`** fügt den Partner-Slot nur in `item.names` ein.
Danach hat der Hauptsaal zwei Plätze, die Klasse einen — bis irgendwann
`setAuxClass` erneut läuft. `angleichen()` mit aufrufen.
→ [befunde.md B14](befunde.md)

### T23 · Kandidatenlogik aus `AssignSheet` herausziehen 🔧
341 Zeilen mit UI **und** der gesamten Auswahllogik (Filter, Geschlechtsregeln,
Auslastung, Sortierung) — der wichtigste ungetestete Code der App. T18 wäre mit
einem Test aufgefallen.

Als reine Funktion `kandidaten(state, sel): Candidate[]` extrahieren und testen.
→ [code-review.md § 4.1](code-review.md)

---

## Phase 5 — Übersetzung (🔧 ein halber Tag)

### T24 · Ersatzsuche übersetzbar machen 🔧
**`substitute/index.ts:265/266/300/301`** — „Ersatz gesucht: …", „… kann nicht.
Wer springt ein?" sind fest deutsch und dynamisch, können also nicht über
`NOTIF_TITLE_KEY` laufen. Glocke **und** Push erscheinen in allen 33 Sprachen
deutsch.

`send-reminders` macht es richtig vor: `pushTexte(lang)` + fester Titel-Schlüssel.
→ [befunde.md D5](befunde.md)

### T25 · Fehlende Programm-Fragmente ergänzen 🔧
30 von 33 Sprachen fehlen 26–34 Einträge in `FRAG` (`i18n/translate-data.ts`).
Produktiv sichtbar sind vor allem **`gerade eben`** (Zeitstempel jeder Mitteilung)
und **`ohne Zuteilungen`** (nach jedem Import); dazu das Gedächtnismahl-Vokabular.
→ [befunde.md D1](befunde.md)

### T26 · Vollständigkeitstest für `FRAG`/`EXTRA`/`REF` 🔧
`ui.test.ts` sichert das UI-Wörterbuch vorbildlich ab (inkl. „kein stiller
EN-Rückfall") — für die Programm-Fragmente gibt es **nichts** Vergleichbares.
Genau deshalb blieben T25 und T1 unentdeckt: `translate-data.ts` hat 7,5 %
Funktionsabdeckung.

Zusätzlich einen Test, der `makeTrIntl` über **alle** Sprachen mit **allen**
Datumsformaten durchlaufen lässt (Lang- und Kurzmonat, Kürzel und ausgeschrieben).
→ [befunde.md D3](befunde.md), [pruefergebnisse.md § 3](pruefergebnisse.md)

### T27 · Sprache und Schreibrichtung vor dem ersten Paint ⚡
**`index.html:2`** ist fest `<html lang="de">`; `store.tsx:91-92` setzt `lang`/`dir`
erst nach dem Mount. Arabisch, Hebräisch, Farsi und Urdu rendern zuerst LTR und
klappen dann um. Das Inline-Script macht es für Theme und Schriftgröße bereits
richtig — den gespeicherten `lang`-Wert dort mitlesen.
→ [befunde.md D6](befunde.md)

### T28 · `REF` für id, tl, vi, sw ergänzen ⚡
Die Verweis-Vorlagen fehlen für vier Sprachen ohne dokumentierten Grund (für
zh/ja/ko/ar/he/fa/ur ist das Fehlen begründet). „th Lektion 5" und „Gruppe 2"
bleiben dort deutsch.
→ [befunde.md D2](befunde.md)

---

## Phase 6 — Fachliche Lücken (🏗 mehrere Tage — vorher mit dem Koordinator klären)

> Diese Punkte betreffen Abläufe, nicht Code-Qualität. Vor der Umsetzung
> abstimmen, wie die Versammlung es tatsächlich handhabt.

### T29 · Öffentlicher Vortrag: eigener Redner möglich machen 🏗
`parse.ts:391` legt den Slot fest mit `rolle: 'Gastredner'` an; `SKIP_ROLE` filtert
ihn überall heraus. Ein Redner der **eigenen** Versammlung bekommt dadurch keine
`pid`, keine Aufgabe, keine Bestätigung, keine Erinnerung und zählt nicht in der
Auslastung. Umschaltbar machen: eigener Redner (Person) ↔ Gastredner (Freitext).
→ [befunde.md F1](befunde.md)

### T30 · Kreisaufseher- und Gedächtnismahl-Woche setzbar machen 🏗
`week.co`, `week.mem`, `week.memCancel` werden **nur in `demo.ts`** gesetzt. Chips,
Banner und der Dienstvortrag-statt-VBS existieren im Produktionsbetrieb nicht.
Ebenso fehlt ein Konzept für Kongresswochen (Zusammenkunft entfällt).
→ [befunde.md F2](befunde.md)

### T31 · Treffpunkte in den Bestätigungs-Flow aufnehmen 🏗
`eachAssignedSlot` läuft nur über `weeks`, nie über `fsWeeks`. Ein zugeteilter
Treffpunkt-Leiter sieht die Aufgabe nicht in „Meine Aufgaben", kann sie nicht
bestätigen und bekommt keine Erinnerung. `FsInstance.leader` hat zudem keine
`pid`. Widersprüchlich: `reducer.ts:486` setzt trotzdem `pendingNames`.
→ [befunde.md F3](befunde.md)

### T32 · LAC-Minuten sprachunabhängig machen 🔧
`itemMinutes` (`meeting-edit.ts:16`) sucht `/(\d+) Min\./`; der Import übernimmt
die Zeit wörtlich aus der Zielsprache (an der Live-Seite bestätigt: „(10 Min.)" auf
Deutsch, lokalisiert in anderen Sprachen). Bei nicht-deutscher Versammlungssprache
bewirkt „+/−" **nichts** — ohne jede Rückmeldung.

Minuten als eigenes Feld führen statt aus dem Anzeigetext zu parsen. Bis dahin
mindestens einen Toast zeigen, wenn nichts passiert.
→ [befunde.md B7](befunde.md)

### T33 · Schlusslied nachtragbar machen ⚡
`applyStudy` fügt das Lied als eigenes Item ein, während der Titel weiterhin
„Schlussworte · **Lied** · Gebet" lautet → das Wort erscheint doppelt. Fehlt das
Lied, lässt sich die Nummer **nicht** nachtragen: `setOpeningSong` kennt nur die
Eröffnung.
→ [befunde.md F11](befunde.md)

### T34 · Weitere fachliche Punkte 🔧
- **F6:** `lacAdd` gibt neuen Punkten `bereichsKey: 'vortrag'` (= öffentlicher
  Vortrag) — fachlich falsch für einen LAC-Punkt
- **F12:** `leser` ist nicht nach Zusammenkunft getrennt (der Vorsitz schon:
  `vorsitzMid`/`vorsitzWe`)
- **F7:** kein Hinweis, wenn zwei Personen `wtLeiter` gesetzt haben
- **F4:** kein Warnhinweis, wenn ein Brüder-Bereich bei einer Schwester gesetzt
  wird (nur `male: true` an Schülerteil-Vortrag und Ratgeber)
- **F8:** `fsAutoAssign` bevorzugt bei Gruppentreffpunkten niemanden aus der Gruppe

---

## Phase 7 — Struktur (🏗 planen, nicht nebenbei)

> Reihenfolge beachten: T35 ist die kleine Absicherung, T36 die günstige
> Verbesserung, T37 der eigentliche Umbau.

### T35 · Wochen beim Laden an ihrer `position` ausrichten 🔧
**`lib/data.ts:614-625`** reiht die geladenen Zeilen **positionsblind**
aneinander. Fehlt eine Position (etwa nach einem stillen Schreibfehler, vgl. T5),
verschieben sich alle Indizes — und damit **jeder** gespeicherte `task_key`.

Ein Array der Länge `höchstePosition+1` anlegen und jede Zeile an ihren
`position`-Index setzen; Lücken werden `stubWeek()`. Zehn Zeilen.
→ [code-review.md § 2.6](code-review.md)

### T36 · Wochenabstand aus `week.start` statt aus dem Index 🔧
`LOAD_RADIUS = 2` heißt heute „±2 **Einträge**", nicht „±2 Wochen". Fehlt eine
Woche im Import (Kongress, Urlaub), misst die Fairness-Logik über einen ganz
anderen Zeitraum — während das Sheet weiter „*n* Aufgaben in 5 Wochen" schreibt.
Betroffen: `assignmentDistance` (`planning.ts:117`), `loadWindow`
(`helpers.ts:323`), Serien-Konflikt (`planning.ts:1131`).

Eine Funktion `wochenAbstand(a, b)` aus `start` (Fallback: Indexdifferenz).
Kein Datenmodell-Umbau.

### T37 · `task_key` von der Position lösen 🏗
Der positionsbasierte Schlüssel ist die Ursache von T16, der Fragilität von T35
und des `Week.stub`-Konstrukts. Eine stabile Slot-Id im Datenmodell beseitigt
alles auf einmal. Braucht eine Migration — wird mit jeder weiteren Funktion teurer.
→ [code-review.md § 2](code-review.md)

### T38 · `pid` verpflichtend, Name nur noch Anzeige 🏗
Heute ersetzen **fünf** Mechanismen einen Fremdschlüssel: zwei Lade-Migrationen,
`renameInWeeks`, die Dubletten-Warnung, das Feld `dn` und ein serverseitiger
Rückweg Name → Konto. `FsInstance.leader` hat gar keine `pid`.
→ [code-review.md § 3.3](code-review.md)

### T39 · Schreibkonflikte zwischen Planern verhindern 🔧
`saveWeek` schreibt die **komplette Woche** als JSONB-Upsert, ohne Locking und
ohne Versionsspalte. Zwei gleichzeitig planende Koordinatoren überschreiben sich
vollständig. Der README behandelt dieses Risiko ausführlich für den
**Offline**-Fall — online besteht es unverändert.

`updated_at` in `weeks`, beim Speichern mitschicken, bei Konflikt neu laden und
den Nutzer informieren.
→ [code-review.md § 3.7](code-review.md)

### T40 · Geteilte Logik für Client und Edge Functions 🔧
Viermal dupliziert: `meetingDayOffsets`, `displayName`, `taskDate`,
task_key-Bildung, `SKIP_ROLE`. Daraus entstand B8 (`send-reminders` nutzt den
Array-Index statt `position`, während `substitute` es richtig macht).

Gemeinsames `shared/`-Verzeichnis — oder mindestens ein Fixture-Test über beide
Seiten.
→ [code-review.md § 5.1](code-review.md)

### T41 · `AppState` aufteilen 🏗
~60 Felder mischen Serverdaten, UI-Zustand und Gerätevorlieben; der Context hat
keine Selektoren, also rendert jede Änderung alles neu. Eine Aufteilung in drei
Kontexte macht `readonly.ts` und einen Teil von `persist.ts` überflüssig.
→ [code-review.md § 4.3](code-review.md)

### T42 · `noUncheckedIndexedAccess` schrittweise 🏗
213 Treffer, konzentriert genau in den Wochen-Dateien (`translate.ts` 48,
`meeting-edit.ts` 37, `planning.ts` 31). Die Regel, die zum Datenmodell passt —
und die T1 verhindert hätte.

---

## Phase 8 — Oberfläche und Politur (🔧 verteilt, jederzeit einschiebbar)

### T43 · Touch-Ziele auf mindestens 24 px ⚡
Gemessen unter WCAG 2.5.8: `switch` (Einstellungen) **40×22**, `auf-confirm`
86×23, `dash-s89` 82×**17**, `auf-s89` 75×**15**, `partner-toggle` 101×**16**.
Die S-89-Verweise sind reine Textzeilen ohne Trefferfläche.
→ [pruefergebnisse.md § 5](pruefergebnisse.md)

### T44 · Überschriften-Struktur ⚡
Jeder Screen hat genau **ein** `<h1>` und **keine** `<h2>`/`<h3>`; Panel-Labels
sind `div`s. Einstellungen umfasst 13 000 Zeichen ohne jede Gliederung zum
Anspringen.

### T45 · RTL: doppelte Umkehrung der Wochen-Pfeile ⚡
**`src/app/rtl.css:44`** — `flex-direction: row-reverse` kehrt in einem
`dir="rtl"`-Container **ein zweites Mal** um; heraus kommt die LTR-Anordnung
(gemessen: „vorherige" links bei x=20). Da die Glyphen zusätzlich gespiegelt
werden, zeigen beide Pfeile nach innen. `row-reverse` entfernen.
→ [lesepruefungen.md B21](lesepruefungen.md)

### T46 · Safe-Area für iPhone ⚡
`index.html:12` setzt `viewport-fit=cover`, aber `env(safe-area-inset-*)` kommt in
5308 Zeilen CSS **kein einziges Mal** vor. Genau diese Kombination lässt Inhalt
unter Notch und Home-Indikator laufen — die Navigation sitzt unten.
→ [lesepruefungen.md B22](lesepruefungen.md)

### T47 · Überläufe bei Schriftgröße 1,45 ⚡
Gemessen auf 375 px: `plan-item`/`plan-item-head` 317 > 307 px (Planen),
`mem-select` 159 > 146 px und `fs-select` 158 > 132 px (Einstellungen). Kein
Seitenscroll — nur diese vier laufen über.

### T48 · `prefers-reduced-motion` berücksichtigen ⚡
3 `@keyframes` und 2 Transitions, keine einzige Regel dafür.

### T49 · Dunkle Paletten vervollständigen ⚡
graphit, bernstein, aubergine und koralle erben `--load-free/task/helper`
(Auslastungs-Quadrate) und `--shade`/`--sh-*` (Schatten) von der **hellen** Basis.
„grau" und „kontrast" setzen sie ausdrücklich neu — die dunklen nicht.
→ [lesepruefungen.md B24](lesepruefungen.md)

### T50 · Toten Code entfernen ⚡
11 CSS-Klassen (u. a. `week-page--vor/--nach`, `lang-demo-hint`), 2 Tokens
(`--primary`, `--clear`), 5 Wörterbuch-Schlüssel (`appSprache`, `demoLangHint`,
`reinigungsgruppe`, `rolleVerkIn`, `privLesen` — Letzterer × 34 Sprachen).

### T51 · z-index-Ebenen benennen ⚡
11 Werte zwischen 20 und 50 ohne System. Vier Tokens (`--z-nav`, `--z-sheet`,
`--z-overlay`, `--z-toast`) genügen.

### T52 · `window.confirm` ersetzen ⚡
`PersonDetail.tsx:208` ist der einzige native Dialog; überall sonst gibt es eigene
Dialoge bzw. die Zwei-Tipp-Bestätigung. Der Text warnt zudem nicht davor, dass die
Namen in bereits geplanten Wochen stehen bleiben.

---

## Phase 9 — Dokumentation und Wartung (⚡ nebenbei)

### T53 · Handbücher ergänzen ⚡
Weder in `planer.md` noch `verkuendiger.md` beschrieben: **Einspringen /
Ersatzsuche** (der Verkündiger bekommt einen Push und findet nichts dazu) und das
**S-89-Formular**. Fehlen ebenfalls: Dubletten-Warnung, Konten ohne Person.

### T54 · Widersprüchliche Doku richtigstellen ⚡
- Maßgeblicher Prototyp: README und `design-handoff/README.md` sagen v2,
  `design-notes-v3.md` sagt v3 („AKTUELL") — v3 ist neuer und fehlt in der
  Dateiliste
- `helpers.ts:185`: „Familienbezüge kennt die App noch nicht" — sie kennt sie
  vier Zeilen darunter
- `meeting-dates.ts:83`: „Einzige Stelle" — es sind vier (T12)
- `context.ts:172`: `clearNotifs` löscht nur die eigenen Zeilen, nicht den
  Versammlungs-Feed
- `ProfilScreen.tsx:26`: „8 Farbschemata" — es sind 11
- `schema.sql:53`: „9 Booleans" — 11 feste + dynamische
- `README.md:21`: „Oberfläche DE/EN/ES/FR" — 34 Sprachen

### T55 · Abhängigkeiten und Build ⚡
- `npm audit fix` (postcss, 1× high, nur Build betroffen)
- `vite.config.ts:47`: `advancedChunks` → `codeSplitting` (Deprecation-Warnung)
- `import.meta.glob` in `ui.ts` schließt `en.ts` aus (Build-Warnung
  `INEFFECTIVE_DYNAMIC_IMPORT`)
- `__BUILD_ID__` enthält den Zeitstempel → jeder Build erzeugt einen neuen
  Bundle-Hash, auch ohne Codeänderung (321 kB Neuladen für alle)
- TypeScript 6 → 7 steht an

### T56 · Coverage ehrlich messen ⚡
`package.json` misst nur `src/**/*.ts` — die `.tsx`-Dateien sind ausgenommen. Die
74,9 % beschreiben die Logikschicht, nicht die Anwendung.

---

## Was bewusst offen bleibt

| Punkt | Warum |
| --- | --- |
| **S2/S3 praktisch nachweisen** | braucht zwei echte Mitgliedskonten derselben Versammlung |
| **D7 Mehrbenutzer-Konflikt** | dito; statisch belegt (siehe T39) |
| **D4 echte Geräte** | das dokumentierte `pointercancel`-Verhalten ist nicht emulierbar |
| **D5 fachliche Abnahme** | nur ein Koordinator kann beurteilen, ob die Abläufe stimmen |
| **B4 Übersetzungswortlaut** | Abgleich mit jw.org je Sprache |
| **B6 Design-Soll-Ist** | erfordert Rendern und Vergleichen der Prototypen |

---

## Fortschritt

Phase 0 ☑☑☑☑ · Phase 1 ☑☑☐ · Phase 2 ☐☐☐☐ · Phase 3 ☐☐☐☐ ·
Phase 4 ☐☐☐☐☐☐☐☐ · Phase 5 ☐☐☐☐☐ · Phase 6 ☐☐☐☐☐☐ · Phase 7 ☐☐☐☐☐☐☐☐ ·
Phase 8 ☐☐☐☐☐☐☐☐☐☐ · Phase 9 ☐☐☐☐
