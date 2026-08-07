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

### T7 · Offline: Ansichts-Aktionen freigeben ⚡ ✅ erledigt
**`src/app/readonly.ts:16-48`** — `openMyTask`, `closeMyTask` und `welcomeShown`
fehlen in der Positivliste. Offline lässt sich die eigene Aufgabe nicht öffnen,
und beim Start erscheint statt der Begrüßung ein „nur lesend"-Toast.

**Prüfen:** Debug-Hash `#stale=2`, Aufgabe antippen.

---

## Phase 2 — Edge Functions absichern (🔧 ein halber Tag, eine Sitzung)

### T8 · `CRON_SECRET` erzwingen ⚡ ✅ erledigt
**`supabase/functions/send-reminders/index.ts:322`** —
`if (CRON_SECRET && …)` lässt bei **fehlendem** Secret jeden durch; die Function
ist mit `--no-verify-jwt` deployt und gibt im Dry-Run die Vorschau **aller**
Versammlungen zurück. In der laufenden Instanz ist das Secret gesetzt (live
geprüft), die Konstruktion bleibt trotzdem fail-open.

Ohne Secret mit 500 abbrechen.

### T9 · `substitute: seek` gegen den Aufrufer prüfen ⚡ ✅ erledigt
**`supabase/functions/substitute/index.ts:253`** — geprüft wird nur die
Mitgliedschaft. Jedes Mitglied kann für **jeden beliebigen** Hilfsdienst-Slot eine
Ersatzsuche auslösen: Push an alle Qualifizierten mit der Aussage „*Name* kann
nicht."

Prüfen, dass der Aufrufer der eingetragene Bearbeiter ist **oder** eine
`verhindert`-Bestätigung für diesen `task_key` existiert.

### T10 · `substitute: take` gegen Doppelübernahme sichern 🔧 ✅ erledigt
**`substitute/index.ts:222-288`** — zwischen Lesen und `PATCH` liegt kein Lock und
keine Vorbedingung. Zwei gleichzeitige Übernahmen überschreiben sich; der zweite
Aufruf löscht per `DELETE confirmations?task_key=eq.…` sogar die Bestätigung des
ersten. Der erste steht danach nirgends, hat aber „übernommen" gesehen.

Vorbedingung mitschicken (nur schreiben, wenn der Slot noch `originalName` trägt)
oder wie `redeem_invite` (migration-012) mit `FOR UPDATE` arbeiten.

### T11 · `substitute` ohne `--no-verify-jwt` deployen ⚡ ⛔ kein Code-Mangel · ✅ deployt
Live-Test zeigt: Der Request erreicht die Function, die Plattform prüft **nicht**
— entgegen dem Deploy-Hinweis in `substitute/index.ts:24`. Der Schutz hängt damit
an einer einzigen Codestelle.

**Prüfen:** `curl -X POST …/functions/v1/substitute -d '{}'` muss
`UNAUTHORIZED_NO_AUTH_HEADER` liefern (wie `send-invite`), nicht
`{"error":"unauthorized"}`.
→ [umgebungspruefungen.md § D3](umgebungspruefungen.md)

> **Nichts zu ändern — Schritt beim Betreiber.** `supabase/config.toml:33`
> setzt für `substitute` bereits `verify_jwt = true`. Die laufende Instanz
> wurde nur vor dieser Datei (bzw. mit dem Flag) deployt. Behoben wird das
> durch ein erneutes `npx supabase functions deploy substitute` aus der
> Repo-Wurzel — die CLI liest die Einstellung dann mit.
>
> **Erledigt am 7. August 2026** — der Betreiber hat `substitute` und
> `send-reminders` neu deployt. Damit sind auch T9/T10/T24 (aus `substitute`)
> und T8/T12/T14 samt der Treffpunkt-Erinnerungen aus T31 (aus
> `send-reminders`) tatsächlich in Betrieb, nicht nur im Repo.
>
> **Nachweis gefahren, grün:** der Aufruf ohne Header liefert jetzt
> `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization
> header"}`. Das stammt von der Plattform, nicht aus `index.ts` — der Schutz
> hängt nicht mehr an einer einzigen Codestelle.
>
> Unter Windows ist `curl` in PowerShell ein Alias auf `Invoke-WebRequest`
> und versteht `-s -X -d` nicht; der Aufruf muss `curl.exe` heißen.

---

## Phase 3 — Themenblock „Datum" (🏗 ein Tag, zusammen erledigen)

> Diese vier hängen an derselben Ursache. Einzeln gemacht, macht man dieselbe
> Stelle viermal auf.

### T12 · Eine einzige Datumsquelle schaffen 🔧 ✅ erledigt
Heute gibt es **vier** Rechnungen für „welcher Kalendertag ist Woche *n*":
`meetingDate` (`meeting-dates.ts:86`, berücksichtigt Sondertermine),
`meetingDateMs` (Z. 106, tut es nicht), `personTimeline` (Z. 76-78, eigene
Variante) und `daysUntil` in `send-reminders` (Z. 236). Der Kommentar in
`meeting-dates.ts:83` behauptet, es gäbe nur eine.

`meetingDate()` zur alleinigen Quelle machen, die übrigen daraus ableiten.

**Prüfen:** Eine Woche mit abweichendem Termin (Gedächtnismahl) — Countdown,
Erinnerung und Abwesenheitsprüfung müssen denselben Tag nennen.
→ [befunde.md U1](befunde.md)

### T13 · Aktuelle Woche aus dem Datum ableiten 🔧 ✅ erledigt
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

### T14 · Echtes Datum statt Wochenspanne anzeigen 🔧 ✅ erledigt
Importierte Wochen tragen als `Meeting.date` die **Wochenspanne**
(`parse.ts:288`: `date: range` → „7.–13. September"). An der Live-Seite bestätigt:
Das `h1` liefert weder Jahr noch Wochentag noch Uhrzeit.

Betroffen: „Meine Aufgaben", Dashboard-Hero, **S-89-Formular**
(`planning.ts:729`), Programm-Kopf, Push-Text. `person-timeline.ts` rechnet es
bereits richtig — dieselbe Logik (T12) überall verwenden.

**Prüfen:** Nach einem Import zeigt „Meine Aufgaben" „Dienstag, 8. September ·
19:00", nicht „7.–13. September".
→ [befunde.md B4](befunde.md)

### T15 · Import: Endzeit aus den Einstellungen rechnen 🔧 ✅ erledigt
`parse.ts:288/388` setzt fest `Ende ca. 20:45` bzw. `11:45`, unabhängig von den
gepflegten Zusammenkunftszeiten. Beginnt die Versammlung um 18:30, steht auf
jedem Programmblatt eine falsche Endzeit.

Ende aus Startzeit + Summe der Programmminuten erzeugen.
→ [befunde.md F5](befunde.md)

---

## Phase 4 — Datenintegrität (🏗 ein bis zwei Tage)

### T16 · Bestätigungen beim LAC-Bearbeiten mitverschieben 🔧 ✅ erledigt
`task_key` ist positionsbasiert. `lacMove` tauscht die Bestätigungen korrekt mit
(`swapPartConfirmations`), **`lacRemove` und `lacAdd` tun es nicht**
(`reducer.ts:755/794`, `persist.ts:196-203`).

Nach dem Löschen eines LAC-Punkts erbt der nachfolgende Punkt die fremde
Bestätigung; der eigentliche gilt wieder als offen und wird erneut erinnert.

**Prüfen:** Punkt bestätigen, davorliegenden Punkt löschen, Status prüfen.
Test analog zu `confirmations.test.ts:78` schreiben.
→ [befunde.md B3](befunde.md)

### T17 · Zusätzliche Klasse in der Doppelbelegungs-Prüfung 🔧 ✅ erledigt
**`planning.ts:183-196`** — `assignmentsInMeeting` iteriert nur `item.names`,
nicht `slotsOf(item, aux)`, und kennt `auxRatgeber` nicht. Direkt daneben machen es
`countOpenSlots`, `changedSlotKeys` und `clearAssignments` über `raeume()` richtig.

Folgen: Der Hinweis „heute schon zugeteilt" bleibt aus; das Dashboard zeigt „frei"
für jemanden, der in der Klasse eingeteilt ist; `takeSubstitute` übersieht den
Konflikt.

**Prüfen:** Person in der Klasse einteilen, dann im Hauptsaal zuteilen → Hinweis
muss erscheinen.
→ [befunde.md B5](befunde.md)

### T18 · Partner-Geschlecht am richtigen Raum prüfen ⚡ ✅ erledigt
**`AssignSheet.tsx:129-133`** — der Gesprächsführer wird in `partItem.names`
gesucht, unabhängig davon, ob der Platz zur Zusätzlichen Klasse gehört
(`partSel.aux`). Die **Auto**-Zuteilung macht es richtig und begründet es
ausdrücklich (`planning.ts:501-511`).
→ [befunde.md B6](befunde.md)

### T19 · Offene Slots einheitlich zählen ⚡ ✅ erledigt
**`planning.ts:320`** — `openSlotLabels` ignoriert Klasse und Ratgeber,
`countOpenSlots` (Z. 250) zählt beide. Der Planen-Kopf nennt deshalb eine höhere
Zahl, als das Banner darunter auflistet.
→ [befunde.md U2](befunde.md)

### T20 · Auslastung: Klasse nur zählen, wenn sie besteht ⚡ ✅ erledigt
**`helpers.ts:262`** — `partWorkload` zählt `item.aux` bedingungslos, auch nachdem
die Klasse abgeschaltet wurde (die Namen bleiben bewusst stehen). Dadurch
bevorzugt die Auto-Zuteilung dauerhaft die Falschen. `hatAuxKlasse` prüfen, wie
alle anderen Leser.
→ [befunde.md B9](befunde.md)

### T21 · Hilfsdienst-Last nur bis `svc.count` ⚡ ✅ erledigt
**`helpers.ts:277`** zählt alle Einträge, `deriveMyTasks` nur `pos < svc.count`.
Wird die Platzzahl reduziert, verschwindet die Aufgabe aus „Meine Aufgaben",
zählt aber weiter als Last.
→ [befunde.md B12](befunde.md)

### T22 · `togglePartner` gleicht die Klasse an ⚡ ✅ erledigt
**`meeting-edit.ts:204-212`** fügt den Partner-Slot nur in `item.names` ein.
Danach hat der Hauptsaal zwei Plätze, die Klasse einen — bis irgendwann
`setAuxClass` erneut läuft. `angleichen()` mit aufrufen.
→ [befunde.md B14](befunde.md)

### T23 · Kandidatenlogik aus `AssignSheet` herausziehen 🔧 ✅ erledigt
341 Zeilen mit UI **und** der gesamten Auswahllogik (Filter, Geschlechtsregeln,
Auslastung, Sortierung) — der wichtigste ungetestete Code der App. T18 wäre mit
einem Test aufgefallen.

Als reine Funktion `kandidaten(state, sel): Candidate[]` extrahieren und testen.
→ [code-review.md § 4.1](code-review.md)

---

## Phase 5 — Übersetzung (🔧 ein halber Tag)

### T24 · Ersatzsuche übersetzbar machen 🔧 ✅ erledigt
**`substitute/index.ts:265/266/300/301`** — „Ersatz gesucht: …", „… kann nicht.
Wer springt ein?" sind fest deutsch und dynamisch, können also nicht über
`NOTIF_TITLE_KEY` laufen. Glocke **und** Push erscheinen in allen 33 Sprachen
deutsch.

`send-reminders` macht es richtig vor: `pushTexte(lang)` + fester Titel-Schlüssel.
→ [befunde.md D5](befunde.md)

### T25 · Fehlende Programm-Fragmente ergänzen 🔧 ✅ erledigt (mit Rest)
30 von 33 Sprachen fehlen 26–34 Einträge in `FRAG` (`i18n/translate-data.ts`).
Produktiv sichtbar sind vor allem **`gerade eben`** (Zeitstempel jeder Mitteilung)
und **`ohne Zuteilungen`** (nach jedem Import); dazu das Gedächtnismahl-Vokabular.
→ [befunde.md D1](befunde.md)

> **Rest bewusst offen.** Ergänzt sind alle Fragmente, die die App selbst
> erzeugt — darunter die beiden produktiv sichtbaren (`gerade eben`,
> `ohne Zuteilungen`). Nicht ergänzt sind **22 veröffentlichte Titel**
> (Studienartikel, Vortragsthemen) und zwei Gedächtnismahl-Fachbegriffe: die
> stehen auf jw.org in jeder Sprache mit dem *dort* gewählten Wortlaut, eine
> eigene Übersetzung wäre eine Erfindung (vgl. B4 „Übersetzungswortlaut").
> Sie stehen als geschlossene Liste `NUR_GEMESSEN_UEBERSETZBAR` im neuen Test
> (`translate-data.test.ts`) — wer sie nachträgt, streicht sie dort und misst
> sie an jw.org. Neue Lücken kann die Liste nicht verstecken, sie ist
> namentlich.

### T26 · Vollständigkeitstest für `FRAG`/`EXTRA`/`REF` 🔧 ✅ erledigt
`ui.test.ts` sichert das UI-Wörterbuch vorbildlich ab (inkl. „kein stiller
EN-Rückfall") — für die Programm-Fragmente gibt es **nichts** Vergleichbares.
Genau deshalb blieben T25 und T1 unentdeckt: `translate-data.ts` hat 7,5 %
Funktionsabdeckung.

Zusätzlich einen Test, der `makeTrIntl` über **alle** Sprachen mit **allen**
Datumsformaten durchlaufen lässt (Lang- und Kurzmonat, Kürzel und ausgeschrieben).
→ [befunde.md D3](befunde.md), [pruefergebnisse.md § 3](pruefergebnisse.md)

### T27 · Sprache und Schreibrichtung vor dem ersten Paint ⚡ ✅ erledigt
**`index.html:2`** ist fest `<html lang="de">`; `store.tsx:91-92` setzt `lang`/`dir`
erst nach dem Mount. Arabisch, Hebräisch, Farsi und Urdu rendern zuerst LTR und
klappen dann um. Das Inline-Script macht es für Theme und Schriftgröße bereits
richtig — den gespeicherten `lang`-Wert dort mitlesen.
→ [befunde.md D6](befunde.md)

### T28 · `REF` für id, tl, vi, sw ergänzen ⚡ ⛔ geprüft, kein Mangel

> **Widerspruch (Befund D2 ist überholt).** `REF` enthält alle vier Sprachen
> vollständig — `translate-data.ts` hat für id, tl, vi und sw je neun
> Vorlagen (`th pelajaran N`, `th aralin N`, `th bài học số N`, `th somo la N`
> …). Der neue Vollständigkeitstest in `translate-data.test.ts` prüft das jetzt
> laufend; er meldete beim ersten Lauf **nur `bg`**, und dort fehlt allein
> `wcgKap` — begründet und schon vorher durch einen Test festgehalten
> (Bulgarisch behandelt im Versammlungsbibelstudium eine andere Publikation).
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

> **Entschieden (7.8.2026): umschaltbar.** Pro Woche wählbar — entweder ein
> Redner der eigenen Versammlung als echte Person (mit `pid`, Bestätigung,
> Erinnerung und Anrechnung auf die Auslastung) oder ein Gastredner als
> Freitext wie bisher. Beide Fälle müssen nebeneinander bestehen; ein
> auswärtiger Redner soll **nicht** als Person angelegt werden müssen.
> Damit ist T29 fachlich geklärt und nur noch Arbeit.

### T30 · Sonderwochen setzbar machen 🏗 — Zuschnitt erweitert
`week.co`, `week.mem`, `week.memCancel` werden **nur in `demo.ts`** gesetzt. Chips,
Banner und der Dienstvortrag-statt-VBS existieren im Produktionsbetrieb nicht.
Ebenso fehlt ein Konzept für Kongresswochen (Zusammenkunft entfällt).
→ [befunde.md F2](befunde.md)

> **Vom Betreiber erweitert (7.8.2026) — das ist mehr als drei Schalter.**
>
> Mehrere Versammlungen teilen sich oft einen Königreichssaal. Hat eine davon
> Dienstwoche (Kreisaufseher), muss eine **andere** ihren Zusammenkunftstag
> verlegen, weil man sich untereinander abstimmen muss. Eine Sonderwoche kann
> also **Tag und Uhrzeit verschieben**, nicht nur den Ablauf ändern. Und es
> gibt weitere Gründe, die einen **Ausfall** rechtfertigen.
>
> Daraus folgt: nicht drei Sonderfälle einzeln bauen, sondern **eine Woche
> kann von der Regel abweichen** — mit optionalem Tag, optionaler Uhrzeit,
> optionalem Ausfall und einem Grund. Die bekannten Fälle sind dann
> Ausprägungen davon:
>
> | Fall | Wirkung |
> | --- | --- |
> | Kreisaufseher-Woche | Dienstvortrag statt Versammlungsbibelstudium; kann bei **anderen** Versammlungen eine Verlegung auslösen |
> | Gedächtnismahl-Woche | Zusammenkunft kann entfallen (`memCancel`) |
> | Kongresswoche | Zusammenkunft entfällt |
> | Verlegung | anderer Tag und/oder andere Uhrzeit, Grund als Freitext |
> | Ausfall | Zusammenkunft entfällt, Grund als Freitext |
>
> **Offene Nebenwirkungen, die mitzudenken sind:** eine verschobene Woche
> verschiebt auch Erinnerungen (`send-reminders` rechnet mit dem regulären
> Tag), die Abwesenheitsprüfung und die Konfliktprüfung. Ein Ausfall darf
> keine Zuteilungen verwaisen lassen. **Nicht nebenbei zu bauen** — dieser
> Punkt gehört geplant, nicht unbeaufsichtigt erledigt.

### T31 · Treffpunkte in den Bestätigungs-Flow aufnehmen 🏗 ✅ erledigt
`eachAssignedSlot` läuft nur über `weeks`, nie über `fsWeeks`. Ein zugeteilter
Treffpunkt-Leiter sah die Aufgabe nicht in „Meine Aufgaben", konnte sie nicht
bestätigen und bekam keine Erinnerung. `FsInstance.leader` hatte zudem keine
`pid`. Widersprüchlich: `reducer.ts:486` setzte trotzdem `pendingNames`.
→ [befunde.md F3](befunde.md)

> **Zuschnitt vom Betreiber geändert (August 2026).** Treffpunkte werden
> **nicht** in Aufgaben oder Hilfsdienste integriert — sie bleiben ein eigener
> Strang. Ihre *Zuteilungsregeln* sollen sich aber eng an denen der Aufgaben
> orientieren, und in „Meine Aufgaben" müssen sie erscheinen.
>
> Umgesetzt: `FsInstance.lpid` (eigener `task_key` `fs|wi|instId`),
> `deriveMyFsTasks` in „Meine Aufgaben" samt Bestätigung, `fsWeekConflicts`
> (Abwesenheit, Doppelbelegung, Serien), Erinnerungen in `send-reminders`, und
> `fsAutoAssign` nach demselben Muster wie die Aufgaben: gleitendes Fenster
> statt aller Wochen (`FS_LOAD_WEEKS = 12`, gemessen), Wartezeit, Tagessperre,
> Wochen-Deckel. Die Erinnerungen brauchten dafür einen Deploy von
> `send-reminders` (derselbe Schritt wie T11) — **am 7. August 2026 erfolgt,
> sie laufen jetzt.**

### T32 · LAC-Minuten sprachunabhängig machen 🔧 — durch T59 belegt
`itemMinutes` (`meeting-edit.ts:16`) sucht `/(\d+) Min\./`; der Import übernimmt
die Zeit wörtlich aus der Zielsprache. Bei nicht-deutscher Versammlungssprache
bewirkt „+/−" **nichts** — ohne jede Rückmeldung.

> **Jetzt gemessen statt vermutet (T59).** In 19 geprüften Sprachen steht dort
> „Dak. 3" · „3 分钟" · „٣ دق" · „3 λεπτά" · „3 મિ." — der Ausdruck greift in
> **keiner** außer Deutsch. Der Parser kennt die Zahl inzwischen (er zerlegt die
> Zeitklammer ohnehin und rechnet Ziffern jeder Schrift um): der saubere Weg ist,
> sie als eigenes Feld mitzuführen, statt sie aus dem Anzeigetext zurückzulesen.

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
- **F6:** ✅ erledigt — `lacAdd` gab neuen Punkten `bereichsKey: 'vortrag'`
  (= öffentlicher Vortrag), jetzt `'studium'` (`meeting-edit.ts:227`). War die
  einzige Zeile des Blocks, die keine fachliche Absprache brauchte.
- **F12:** ⛔ **kein Mangel** (Betreiber, 7.8.2026) — „Wenn man Leser ist, dann
  darf man bei beiden Zusammenkünften lesen. Es braucht keine Unterscheidung."
  Die Asymmetrie zum Vorsitz (`vorsitzMid`/`vorsitzWe`) ist damit gewollt: der
  Vorsitz ist je Zusammenkunft verschieden, das Lesen nicht. Punkt geschlossen.
- **F7:** kein Hinweis, wenn zwei Personen `wtLeiter` gesetzt haben —
  ✔ freigegeben
- **F4:** kein Warnhinweis, wenn ein Brüder-Bereich bei einer Schwester gesetzt
  wird (nur `male: true` an Schülerteil-Vortrag und Ratgeber) — ✔ freigegeben,
  der gewichtigste der vier
- **F8:** `fsAutoAssign` bevorzugt bei Gruppentreffpunkten niemanden aus der
  Gruppe — ✔ freigegeben

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

### T43 · Touch-Ziele auf mindestens 24 px ⚡ ✅ erledigt
Gemessen unter WCAG 2.5.8: `switch` (Einstellungen) **40×22**, `auf-confirm`
86×23, `dash-s89` 82×**17**, `auf-s89` 75×**15**, `partner-toggle` 101×**16**.
Die S-89-Verweise sind reine Textzeilen ohne Trefferfläche.
→ [pruefergebnisse.md § 5](pruefergebnisse.md)

### T44 · Überschriften-Struktur ⚡ ✅ erledigt
Jeder Screen hat genau **ein** `<h1>` und **keine** `<h2>`/`<h3>`; Panel-Labels
sind `div`s. Einstellungen umfasst 13 000 Zeichen ohne jede Gliederung zum
Anspringen.

### T45 · RTL: doppelte Umkehrung der Wochen-Pfeile ⚡ ✅ erledigt
**`src/app/rtl.css:44`** — `flex-direction: row-reverse` kehrt in einem
`dir="rtl"`-Container **ein zweites Mal** um; heraus kommt die LTR-Anordnung
(gemessen: „vorherige" links bei x=20). Da die Glyphen zusätzlich gespiegelt
werden, zeigen beide Pfeile nach innen. `row-reverse` entfernen.
→ [lesepruefungen.md B21](lesepruefungen.md)

### T46 · Safe-Area für iPhone ⚡ ✅ erledigt
`index.html:12` setzt `viewport-fit=cover`, aber `env(safe-area-inset-*)` kommt in
5308 Zeilen CSS **kein einziges Mal** vor. Genau diese Kombination lässt Inhalt
unter Notch und Home-Indikator laufen — die Navigation sitzt unten.
→ [lesepruefungen.md B22](lesepruefungen.md)

### T47 · Überläufe bei Schriftgröße 1,45 ⚡ ✅ erledigt
Gemessen auf 375 px: `plan-item`/`plan-item-head` 317 > 307 px (Planen),
`mem-select` 159 > 146 px und `fs-select` 158 > 132 px (Einstellungen). Kein
Seitenscroll — nur diese vier laufen über.

### T48 · `prefers-reduced-motion` berücksichtigen ⚡ ✅ erledigt
3 `@keyframes` und 2 Transitions, keine einzige Regel dafür.

### T49 · Dunkle Paletten vervollständigen ⚡ ✅ erledigt
graphit, bernstein, aubergine und koralle erben `--load-free/task/helper`
(Auslastungs-Quadrate) und `--shade`/`--sh-*` (Schatten) von der **hellen** Basis.
„grau" und „kontrast" setzen sie ausdrücklich neu — die dunklen nicht.
→ [lesepruefungen.md B24](lesepruefungen.md)

### T50 · Toten Code entfernen ⚡ ✅ erledigt (2 Punkte ⛔ kein Mangel)
11 CSS-Klassen (u. a. `week-page--vor/--nach`, `lang-demo-hint`), 2 Tokens
(`--primary`, `--clear`), 5 Wörterbuch-Schlüssel (`appSprache`, `demoLangHint`,
`reinigungsgruppe`, `rolleVerkIn`, `privLesen` — Letzterer × 34 Sprachen).

> **Klassen und Schlüssel entfernt, die Tokens gibt es nicht.** `--primary` und
> `--clear` sind keine Tokens; die Treffer stammen von den Klassennamen
> `.plan-auto-btn--primary` / `.plan-auto-btn--clear` (`planen.css:57/69`),
> beide in `AutoAssignPanel.tsx` und `FsPlan.tsx` in Gebrauch.

### T51 · z-index-Ebenen benennen ⚡ ✅ erledigt (mit 7 statt 4 Ebenen)
11 Werte zwischen 20 und 50 ohne System. Vier Tokens (`--z-nav`, `--z-sheet`,
`--z-overlay`, `--z-toast`) genügen.

> **Vier hätten die Darstellung geändert.** Die 11 Werte kodieren echte
> Reihenfolgen: S-89 liegt über dem Zuteilungs-Sheet, die Bestätigung über dem
> Toast, das Popover über allem. Umgesetzt sind deshalb sieben Ebenen
> (`--z-nav`, `--z-panel`, `--z-sheet`, `--z-sheet-top`, `--z-toast`,
> `--z-dialog`, `--z-popover`), die die bestehende Schichtung 1:1 abbilden.

### T52 · `window.confirm` ersetzen ⚡ ✅ erledigt
`PersonDetail.tsx:208` ist der einzige native Dialog; überall sonst gibt es eigene
Dialoge bzw. die Zwei-Tipp-Bestätigung. Der Text warnt zudem nicht davor, dass die
Namen in bereits geplanten Wochen stehen bleiben.

---

## Phase 9 — Dokumentation und Wartung (⚡ nebenbei)

### T53 · Handbücher ergänzen ⚡ ✅ erledigt
Weder in `planer.md` noch `verkuendiger.md` beschrieben: **Einspringen /
Ersatzsuche** (der Verkündiger bekommt einen Push und findet nichts dazu) und das
**S-89-Formular**. Fehlen ebenfalls: Dubletten-Warnung, Konten ohne Person.

### T54 · Widersprüchliche Doku richtigstellen ⚡ ✅ erledigt
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

### T55 · Abhängigkeiten und Build ⚡ ✅ erledigt
- `npm audit fix` (postcss, 1× high, nur Build betroffen)
- `vite.config.ts:47`: `advancedChunks` → `codeSplitting` (Deprecation-Warnung)
- `import.meta.glob` in `ui.ts` schließt `en.ts` aus (Build-Warnung
  `INEFFECTIVE_DYNAMIC_IMPORT`)
- `__BUILD_ID__` enthält den Zeitstempel → jeder Build erzeugt einen neuen
  Bundle-Hash, auch ohne Codeänderung (321 kB Neuladen für alle)
- TypeScript 6 → 7 steht an

### T56 · Coverage ehrlich messen ⚡ ✅ erledigt
`package.json` misst nur `src/**/*.ts` — die `.tsx`-Dateien sind ausgenommen. Die
74,9 % beschreiben die Logikschicht, nicht die Anwendung.

---

## Nachgetragen (August 2026)

### T57 · Zuordnung durchgängig über die Person-Id, nicht über den Namen 🏗 ✅ erledigt
**Vorgabe des Betreibers.** Wo eine Zuteilung einer Person gehört, muss die
Person-Id entscheiden — der Anzeigename nur noch als Rückfall für Altdaten.
Zwei Personen desselben Namens bekommen sonst gegenseitig fremde Aufgaben,
Erinnerungen und Konflikte.

**Stand.** Die *Schreib*seite ist weitgehend fertig: `SlotAssignment.pid` steht
bei Programmpunkten, Ratgeber und Hilfsdiensten (`assignSlot`,
`autoAssignMeeting`, `AssignSheet`), und `FsInstance.lpid` kam im August dazu.
Über die Id gehen bereits `deriveMyTasks`, `deriveMyFsTasks`,
`person-timeline`, `fsWeekConflicts` und `send-reminders`.

**Umgesetzt (August 2026).** Zwei Bausteine in `helpers.ts` tragen das Ganze:
`gehoertZu(zuteilung, person)` als **einzige** Stelle, an der entschieden wird,
wem eine Zuteilung gehört, und `idAufloeser(persons)`, der beide Formen — Id
und Altdaten-Name — auf **eine** Id bringt, damit niemand unter zwei Schlüsseln
zählt.

Umgestellt: `partWorkload`, `helperWorkload`, `workloadOf`, `loadWindow`
(nehmen jetzt `Person` statt `name`), die beiden Strichlisten und die
`used`-Menge in `autoAssignMeeting`, `assignmentDistance` (je Bereich),
`weekConflicts` inklusive Serien- und Doppelbelegungs-Zählung,
`assignmentsInMeeting`, `fsAutoAssign` (Last, Wartezeit, Tagessperre,
Wochen-Deckel) und `state.pendingNames` → `state.pendingIds`.

**Was bewusst über den Namen bleibt:**
- die **Begleiter-Erwähnung** im Rollentext („mit A. Hoffmann") — dort steht
  ein Name, keine Id; Namensgleiche sind nicht unterscheidbar
- der **Tie-Break-Schlüssel** der Auto-Zuteilung: er soll sich lesbar aus der
  Person ergeben, nicht aus einer UUID, die bei jeder Neuanlage eine andere
  Reihenfolge ergäbe
- **Altdaten und Demo-Wochen** ohne `pid`: dort ist der Anzeigename der einzige
  Anhalt, und die Kennung lautet `name:<Anzeigename>`

**Warum das ein eigener Block ist:** die Zähl- und Vergleichsfunktionen nehmen
durchweg `name: string` entgegen. Der Umstieg heißt, sie auf eine
Personen-Identität umzustellen (Id mit Namensrückfall) — und dabei zu klären,
was mit Zuteilungen ohne Id geschieht: externe Redner, Gruppen-Rotationen
(„Gruppe 1" ist keine Person) und Altdaten, die vor `pid` gespeichert wurden.
Ohne diese Fallunterscheidung fallen genau die aus der Zählung, die heute
mitzählen.

**Prüfen:** zwei Personen mit identischem Anzeigenamen anlegen, eine davon
einteilen — die andere darf weder Aufgabe noch Erinnerung noch Konflikt
bekommen, und die Auslastung muss bei der richtigen steigen.

### T58 · Auto-Zuteilung: Fairness über lange Zeiträume absichern 🏗 ✅ erledigt
**Vorgabe des Betreibers.** Die automatische Zuteilung von Aufgaben,
Hilfsdiensten und Treffpunkten muss über lange Zeiträume gleichmäßig verteilen,
auch in Sonderfällen. Genannt: wer **neu** ist und keine Vergangenheit hat, und
wer aus dem **Urlaub** zurückkommt, darf nicht mit Zuteilungen überschüttet
werden, nur weil seine Strichliste leer ist.

Nötig sind Tests über viele Wochen mit vielen Szenarien und Grenzfällen, nicht
nur Einzelfälle.
→ Stand und Messungen: [nachtrag-fairness.md](nachtrag-fairness.md)

> **Der Neuling wurde tatsächlich überschüttet** — gemessen, nicht vermutet: bei
> Treffpunkten führte er 10 von 10 Terminen, weil die Last über **alle**
> gespeicherten Wochen zählte und eine leere Vergangenheit ihn dauerhaft an die
> Spitze setzte. Ursache war die Fensterbreite, nicht der Sortierschlüssel:
> `FS_LOAD_WEEKS = 12` (52/26/12 gegeneinander gemessen, Tabelle im
> Doc-Kommentar). Ein zweiter Anlauf über einen Startwert für Neulinge wurde
> **verworfen**, weil die Messung ihn als wirkungslos auswies — lieber nichts
> als eine Vorrichtung, die etwas zu tun vorgibt.
>
> 22 Grenzfall-Tests in `autoassign.grenzfaelle.test.ts` (Neuling ohne
> Vergangenheit, Rückkehr aus dem Urlaub, Verteilung über lange Zeiträume,
> entartete Fälle, Wochen-Deckel).

### T28-Vorfrage · geklärt: die Kurzformen sind Altbestand ✅
An der Quelle geprüft (jw.org, Ausgaben September/Oktober und
November/Dezember 2026): das heutige Arbeitsheft zitiert durchgängig
`th Lektion 11`, `lmd Lektion 4 Punkt 3`, `lff Lektion 20 Punkt 4` — die
Formen **ohne** Punktnummer (`lmd Lektion 3`, `lff Lektion 20`) und
`lmd Anhang A Punkt 21` kommen nicht mehr vor; die Anhang-A-Stelle wird
inzwischen als „lmd Lektion 1 Punkt 5" zitiert.

Damit sind von den 17 gemeldeten Lücken **16 Altbestand** und nur eine betrifft
eine aktuelle Form: `wcgKap` in bg — und die ist mit Grund offen (Bulgarisch
behandelt eine andere Publikation).

**Folge:** nichts zu messen, nichts zu übersetzen. Der Test unterscheidet jetzt
zwischen aktuellen Vorlagen (Pflicht) und Altbestand (Buchführung).

### T59 · Import in anderen Sprachen gegenprüfen 🔧 ✅ erledigt
**Vorgabe des Betreibers.** Gemessen an der echten Wochenseite
6.–12. Juli 2026 in **19 Sprachen** (ar cmn-hans de el en es fa fi he hi hu ja
ko pt ru sw th tl ur vi), Feld für Feld gegen die deutsche Fassung.

**Befund: in sieben Sprachen war die Meta-Zeile jedes Programmpunkts leer** —
keine Minuten, kein Rahmen, keine Quelle (ar, fa, he, ur, sw, ja, cmn-hans).
Dazu Lesehilfe (Furigana/Pinyin) mitten in jedem japanischen und chinesischen
Titel und die deutsche Rückfall-Zeile „Schlussworte · Gebet" mitten im
chinesischen Programm.

Bemerkenswert: **Swahili** schreibt lateinisch mit westlichen Ziffern und fiel
trotzdem komplett aus („(Dak. 10)" — das Wort steht vor der Zahl). Es hängt
nicht an fremden Schriften, sondern an jeder Annahme, die nur im Deutschen
geprüft wurde.

Behoben in `import-week/`: gemeinsame Textaufbereitung (`text.ts`, neu),
Klammern westlich und vollbreit, Ziffern über `\p{Nd}`, Zweirichtungs-Marken
übersprungen, Danda und die anderen Satzenden ergänzt, Lied-Zeilen zusätzlich
am Liederbuch-Link erkannt. Thai bleibt bewusst ohne Rahmen (kein Satztrenner).
18 neue Tests, alle fallen ohne den Fix um.

→ [nachtrag-sprachen.md](nachtrag-sprachen.md)

### T60 · Vollständigkeitsprobe auf Hebräisch 🔧 ✅ erledigt
**Vorgabe des Betreibers.** Echter Durchlauf mit **beiden** Sprachen auf
Hebräisch (`#s=programm&l=he&c=Hebräisch` — der Debug-Hash kann `c=` längst,
meine frühere Notiz war falsch), alle sieben Screens plus Overlays, jeder
Textknoten mit lateinischen Buchstaben eingesammelt.

**Ein echter Fund:** die Liste der Versammlungssprachen zeigte **alle 482 Namen
auf Deutsch**, in jeder Bediensprache — eine hebräischsprachige Versammlung las
ihre eigene Sprache als „Hebräisch". Behoben mit gemessenen Namen aus demselben
jw.org-Umschalter, aus dem die deutsche Liste stammt (ein Abruf je Sprache
liefert alle 482); nachgeladen, 4–8 KB gzip, gespeichert bleibt der deutsche
Name als Schlüssel.

Alles Übrige war Daten (Personennamen, Freitext-Abwesenheitsgründe) oder
begründete Entscheidung. **Zur Bestätigung offen:** die Farbschema-Namen
(„Jasmin", „Matcha") stehen in nicht-lateinischen Oberflächen lateinisch da.

→ [nachtrag-sprachen.md](nachtrag-sprachen.md)

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

Stand 7. August 2026 · ☑ erledigt · ⛔ geprüft, kein Mangel · ☐ offen

Phase 0 ☑☑☑☑ · Phase 1 ☑☑☑ · Phase 2 ☑☑☑⛔ · Phase 3 ☑☑☑☑ ·
Phase 4 ☑☑☑☑☑☑☑☑ · Phase 5 ☑☑☑☑⛔ · Phase 6 ☐☐☑☐☐☐ · Phase 7 ☐☐☐☐☐☐☐☐ ·
Phase 8 ☑☑☑☑☑☑☑☑☑☑ · Phase 9 ☑☑☑☑ · Nachgetragen ☑☑☑☑☑

**45 umgesetzt, 2 als „kein Mangel" begründet zurückgewiesen, 13 offen.**
Der Testbestand ist von 727 auf 1139 gewachsen; jede Korrektur hat einen Test,
der ohne sie rot wird.

### Was offen ist und warum

> **Der Deploy ist erledigt** (7. August 2026): `substitute` und
> `send-reminders` laufen in der Fassung des Repos. Alles, was bis dahin nur
> geschrieben, aber nicht in Betrieb war — T9/T10/T24, T8/T12/T14 und die
> Treffpunkt-Erinnerungen aus T31 —, ist damit scharf. Offen sind nur noch
> Code- und Fachfragen.

| | Aufgaben | Warum offen |
| --- | --- | --- |
| **Phase 6** | T29, T30, T32, T33, T34 | **Fachlich geklärt am 7.8.2026** (siehe die Kästen bei den Punkten): T29 wird umschaltbar (Person ↔ Freitext), von T34 sind F4/F7/F8 freigegeben und **F12 zurückgewiesen**, F6 war schon miterledigt. T32 und T33 brauchten ohnehin keine Absprache. **Nur T30 bleibt offen** — der Betreiber hat den Zuschnitt erweitert (Verlegung von Tag und Uhrzeit, nicht nur Ausfall), das gehört geplant. |
| **Phase 7** | T35–T42 | Empfohlene Reihenfolge: **T35 + T40 + T36** zuerst (klein, risikoarm) — **freigegeben am 7.8.2026**; danach **T39 + T37** als eigener Block mit Migration, weiterhin abzustimmen; T38/T41/T42 später oder gar nicht. |

> **Was heute Nacht unbeaufsichtigt laufen darf** (Task
> `jw-planner-todo-weiter`, einmalig um 3:07): **T32, T33, T35, T40, T36** und
> aus T34 **F4, F7, F8**. Gesperrt bleiben T29 (fachlich geklärt, aber ein
> größerer Umbau), T30 (Planung nötig), T39/T37 (Migration) sowie T38/T41/T42.
>
> Die **Farbschema-Namen** („Jasmin", „Matcha") bleiben in nicht-lateinischen
> Oberflächen lateinisch stehen — Eigennamen, wie Markennamen auch. Der Punkt
> aus T60 ist damit entschieden und geschlossen.

### Was zurückgewiesen wurde

| Befund | Ergebnis |
| --- | --- |
| **T1** (`MON` → `MONA`) | Absturz bestätigt, **Fix anders**: der Tausch hätte ihn nur auf die Langform verschoben → `datumsRegel(...)` schlägt in beiden Tabellen nach |
| **T11** (`config.toml`) | ⛔ kein Code-Mangel, nur die laufende Instanz war älter — am 7.8.2026 neu deployt |
| **T28** (`REF` für id/tl/vi/sw) | ⛔ kein Mangel, alle vier sind vollständig |
| **T50** (`--primary`/`--clear`) | ⛔ die Tokens gibt es nicht — es sind benutzte Klassennamen |
| **T51** (vier z-index-Ebenen) | umgesetzt mit **sieben**; vier hätten die Reihenfolge geändert |
| **T15** (Endzeit) | umgesetzt als feste 105 min statt Summe der Programmminuten — das Arbeitsheft führt Lieder und Gebete nicht auf |
| **T25** (Fragmente) | teilweise; 22 veröffentlichte Titel bleiben unübersetzt, als geschlossene Liste im Test festgehalten |
