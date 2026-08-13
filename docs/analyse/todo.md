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

### T29 · Öffentlicher Vortrag: eigener Redner möglich machen 🏗 ✅ erledigt
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

> **Umgesetzt am 8. August 2026.** Der Schalter ist die Wahl selbst — kein
> zusätzliches Bedienelement:
>
> | Weg im Zuteilungs-Sheet | Rolle im Slot | Folge |
> | --- | --- | --- |
> | Freitext (Name + Versammlung) | `Gastredner · <Vers.>` | wie bisher: kein Flow, keine Anrechnung |
> | Person aus der Liste antippen | `Redner` + `pid` | Aufgabe, Bestätigung, Erinnerung, Auslastung |
>
> Beide Wege stehen im selben Sheet untereinander, jeder führt also zurück.
> `Entfernen` und `Leeren` setzen auf `Gastredner` zurück: ein leerer Platz ist
> auswärtig, sonst besetzte ihn die Auto-Zuteilung — den Redner vereinbart man.
>
> **Kein einziger Sonderweg.** `Redner` steht schlicht nicht in `SKIP_ROLE`;
> alles Weitere folgt daraus von selbst, in den Edge Functions ebenso wie im
> Client. Auch der Begriff musste nicht erfunden werden: `translate-data.ts`
> übersetzt „Redner" seit jeher in allen 33 Fremdsprachen.
>
> Die zweite Hälfte saß im Reducer: er entschied über den Bestätigungs-Flow am
> Auswahl-Flag `sel.guest` statt an der geschriebenen Rolle. Das Flag sagt nur
> „das ist der Redner-Platz" und steht bei **beiden** Fällen auf true — es
> öffnet die Freitext-Felder. Jetzt liest der Reducer die Rolle zurück
> (`slotRolle`).
>
> **Dabei aufgefallen, eigene Ursache, mitkorrigiert:** `gehoertZu` fiel ohne
> `pid` auf den Anzeigenamen zurück — auch bei externen Rednern. Ein Gastredner,
> der zufällig wie ein Bruder der eigenen Versammlung heißt, erhöhte dessen
> Auslastung und galt für ihn als „heute schon zugeteilt"; die Auto-Zuteilung
> überging ihn daraufhin. Die Warnung vor doppelten Anzeigenamen greift dort
> nicht, denn der Gast steht in keiner Personenliste. Für ihn ist der Name kein
> schwächerer Anhalt, sondern gar keiner.
>
> Damit `gehoertZu` das entscheiden kann, ist das Rollen-Vokabular
> (`isGuestRole`, `isSpeakerRole`, `ROLE_OWN_SPEAKER`, `rolleBasis`) von
> `planning.ts` nach `helpers.ts` gewandert — die untere Schicht darf nicht
> nach oben greifen. `planning.ts` reicht es weiter, alle bestehenden
> Import-Wege bleiben gültig, und der Paritätstest vergleicht weiterhin
> Client gegen Edge (er kennt jetzt auch „Redner").
>
> 13 Tests in `src/data/t29.test.ts`, drei im Reducer, zwei in
> `edge-parity.test.ts`. Gegenprobe für beide Hälften einzeln gefahren: ohne
> den `gehoertZu`-Schutz fallen 3, ohne die Reducer-Korrektur 1.
>
> Im Browser nachgestellt: Gastredner-Platz geöffnet, Bruder gewählt → der Slot
> liest „Redner: Uwe Bergmann…" (das `…` ist die ausstehende Bestätigung, die
> es vorher nicht gab); Sheet erneut geöffnet → Freitext-Felder leer und
> erreichbar; Gastredner eingetragen → „Gastredner · Vers. Westtal: K. Steiner✓"
> ohne Flow. Konsole sauber.

### T30 · Sonderwochen setzbar machen 🏗 ✅ erledigt — Zuschnitt erweitert
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

> **Umgesetzt am 8. August 2026 — als eine Aussage, nicht als Sammlung
> Sonderfälle.** `Week.dev` hält je Zusammenkunft eine `Abweichung`
> (`day`, `time`, `cancelled`, `reason`). Die bekannten Fälle sind
> Ausprägungen davon; ein Kongress ist ein Ausfall mit Grund, eine Verlegung
> ein anderer Tag mit Grund.
>
> **Ein eigenes Feld, nicht `Meeting.date`.** Dort steht Anzeigetext in der
> Sprache der Wochenseite; aus Anzeigetext Werte zurückzulesen war schon
> zweimal die Ursache (T32 die Minuten, T33 das Lied). `Meeting.date` bleibt
> als Quelle bestehen — es trägt die Termine der Alt-Datensätze —, hat aber
> den niedrigeren Rang. Rangfolge überall gleich:
> **Abweichung → `date`-Feld → Einstellungen.**
>
> **Die Nebenwirkungen sind mitgebaut**, alle vier:
>
> | Wirkung | Wo |
> | --- | --- |
> | Erinnerungen folgen dem verlegten Tag, Ausfall erinnert gar nicht | `send-reminders` über `_shared/planung.ts` |
> | Auslastung zählt eine ausgefallene Zusammenkunft nicht | `partWorkload`, `helperWorkload` |
> | Keine Aufgabe, keine Bestätigung, kein Ersatzgesuch | `eachAssignedSlot` |
> | Keine Konflikte, keine offenen Plätze, keine Auto-Zuteilung | `weekConflicts`, `countOpenSlots`, `autoAssignMeeting` |
>
> **Verwaist wird dabei nichts.** Die Zuteilungen bleiben in den Daten stehen;
> sie zählen nur so lange nicht, wie die Zusammenkunft nicht stattfindet. Wird
> der Ausfall zurückgenommen, ist die Planung wieder da.
>
> **Ein Denkfehler, den erst die Tests aufdeckten:** `memCancel` sieht aus wie
> ein Ausfall, ist aber eine **Ersetzung** — der Tab zeigt dann das
> Gedächtnismahl, und das hat eigene Zuteilungen (Vortrag, Gebete, Symbole
> herumreichen). Als Ausfall gelesen, fielen genau diese aus Auslastung,
> Aufgaben und Erinnerungen heraus. Die erste Fassung tat das; vier bestehende
> Tests fielen und hatten recht. `cancelled` meint jetzt das Engere: **es kommt
> niemand zusammen.**
>
> **Die Bedienung kommt ohne einen einzigen neuen Wörterbuch-Schlüssel aus**
> (`src/planen/SonderwochePanel.tsx`) — ein neuer hieße 33 erfundene
> Übersetzungen:
>
> | Element | Woher |
> | --- | --- |
> | Name der Zusammenkunft | `tabMid` / `tabWe` |
> | Wochentage | `Intl` über `LOCALES` — wie im Treffpunkt-Konfliktbanner |
> | „Wochentag" / „Uhrzeit" | `a11yWeekday` / `a11yTime` |
> | „Grund (optional)" | `grundOpt` |
>
> Für „entfällt" gibt es **kein** gemessenes Wort. Geprüft und verworfen: den
> ersten Teil aus `memAusfall` herauszuschneiden — Spanisch trennt mit `;`,
> Japanisch und Koreanisch haben gar keine Trennstelle, Chinesisch nutzt `——`.
> Ein Schnitt hätte in vier Sprachen Bruchstücke ergeben. Stattdessen ist der
> Schalter **positiv** formuliert und trägt den Namen der Zusammenkunft:
> ausgeschaltet neben „Zusammenkunft am Wochenende" ist unmissverständlich, und
> Screenreader sagen es genauso an. Im Banner steht dann der Grund — die Worte
> des Planers, in seiner Sprache, wie ein Name oder ein Vortragsthema.
>
> Mitgezogen: die **Reiter** zeigen den echten Tag der gezeigten Woche
> (`MeetingTabs` bekommt sie jetzt), sonst stünde „Sonntag" über einer
> Zusammenkunft, die auf Samstag verlegt wurde.
>
> 16 Tests in `src/data/t30.test.ts`, 10 weitere in `edge-parity.test.ts`
> (beide Seiten an denselben Eingaben). Gegenprobe: mit `istAusgefallen` fest
> auf `false` fallen 4 — Auslastung, Aufgaben, Konflikte, Auto-Zuteilung.
>
> Im Browser nachgestellt: Wochenende auf Samstag 17:00 verlegt → Reiter
> „Samstag" (Nachbarwoche weiter „Sonntag"), Chip in der Wochen-Navigation;
> abgeschaltet → Termin-Felder verschwinden, Banner mit durchgestrichenem Namen
> und „Kongress in Nürnberg", „0 offene Zuteilungen".
>
> ✅ **Damals offen geblieben, inzwischen erledigt:** Die Kreisaufseher-Woche
> setzte zunächst nur den Chip (`week.co`); **„Dienstvortrag statt
> Versammlungsbibelstudium" tauschte den Programmpunkt nicht aus.** Das ist ein
> Eingriff in den importierten Ablauf, kein Terminthema, und brauchte die
> fachliche Vorgabe (Titel, Dauer, Plätze). Der Betreiber hat sie am 8.8.2026
> gegeben → **T62**.

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

### T32 · LAC-Minuten sprachunabhängig machen 🔧 ✅ erledigt
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

> **Umgesetzt am 8. August 2026.** `PartItem.mins` bzw. `ImportedPart.mins`
> tragen die Zahl; der Parser legt sie beim Import ab (`ersteZahl` über die
> Zeitklammer). Der Rückfall auf die Meta-Zeile ist geblieben, aber
> schriftunabhängig — dadurch funktionieren **auch bereits importierte Wochen
> ohne erneuten Import**, was eine Datenmigration erspart.
>
> Neu: `src/data/ziffern.ts` liest und **schreibt** Ziffern jeder Schrift ohne
> Tabelle (Unicode legt jeden Ziffernsatz als lückenlosen Zehnerblock ab, die
> Null zuerst). Das Schreiben brauchte es, weil `lacAdjust` die Anzeige
> mitziehen muss: aus „٣ دق" wird „١٥ دق", nicht „15 دق". Die alte Zeile für
> die Sprachvarianten (`.replace(/\d+/, …)`) hätte dort ohnehin nie getroffen —
> derselbe Fehler ein zweites Mal, nur unbemerkt.
>
> Warum die *erste* Zahl der Meta-Zeile die Dauer ist und nicht irgendeine:
> der Parser setzt sie aus Rahmen · Zeit · Quelle zusammen, `settingOf`
> verwirft ziffernhaltige Rahmen, und ohne Zeitangabe entsteht gar keine
> Meta-Zeile. Im thailändischen „3 นาที · lmd บทเรียน 1 ข้อ 5" stehen zwei
> weitere Zahlen — die erste ist trotzdem die richtige.
>
> Abgesichert mit 42 Tests (`src/data/minuten.test.ts`, Ergänzung in
> `parse.sprachen.test.ts`). Gegenprobe gefahren: mit dem alten Ausdruck fallen
> **14** davon, und zwar genau die zehn nicht-deutschen Fassungen plus die
> Feld-Tests — Deutsch bleibt grün. Das ist der Punkt: es war keine Lücke,
> sondern eine deutsche Annahme.

### T61 · `lacAdd` findet das Versammlungsbibelstudium nur auf Deutsch 🔧 ✅ erledigt
Beim Umsetzen von T32 aufgefallen, **nicht** mit erledigt (eigener Punkt, damit
er nicht untergeht): `lacAddIndex` (`meeting-edit.ts`) sucht die Einfügestelle
mit `title.startsWith('Versammlungsbibelstudium')`. Bei nicht-deutscher
Versammlungssprache trifft das nie — ein neuer eigener Punkt landet dann **hinter**
dem Bibelstudium statt davor.

Dieselbe Familie wie T32, aber gutartiger: es passiert etwas, nur an der
falschen Stelle. Strukturell lösbar ohne Textvergleich — das Bibelstudium ist
der Punkt mit einem `leser`-Slot. In `umgebungspruefungen.md` war die Ursache
schon notiert (Soft-Hyphens im Rohtext), ohne dass daraus eine Aufgabe wurde.

> **Umgesetzt am 8. August 2026.** `lacAddIndex` sucht jetzt den Punkt mit
> einem `leser`-Slot. Den vergibt `parse.ts` genau einmal je Zusammenkunft
> (letzter Unser-Leben-Punkt → Leiter + Leser); die von `lacAdd` erzeugten
> Punkte tragen nur `studium`, ein zweiter eigener Punkt reiht sich also hinter
> dem ersten ein statt davor.
>
> `src/data/lac-einfuegestelle.test.ts` prüft sechs Sprachen und vier
> Grenzfälle. Gegenprobe: mit dem alten `startsWith` fallen **7 von 10** —
> genau die fünf nicht-deutschen Fassungen plus die beiden Struktur-Tests,
> Deutsch bleibt grün. Das ist der Beleg, dass es eine deutsche Annahme war.
>
> Dabei aufgefallen: die Fixture in `localize.test.ts` legte das Bibelstudium
> **ohne** Leser-Slot an — so entsteht es real nirgends. Sie ist jetzt
> vollständig; das ist keine Anpassung des Tests an den Code, sondern an den
> Import.

### T33 · Schlusslied nachtragbar machen ⚡ ✅ erledigt
`applyStudy` fügt das Lied als eigenes Item ein, während der Titel weiterhin
„Schlussworte · **Lied** · Gebet" lautet → das Wort erscheint doppelt. Fehlt das
Lied, lässt sich die Nummer **nicht** nachtragen: `setOpeningSong` kennt nur die
Eröffnung.
→ [befunde.md F11](befunde.md)

> **Umgesetzt am 8. August 2026.** Beide Hälften hatten dieselbe Ursache: das
> Lied wurde als *Ding daneben* behandelt statt als Atom des Titels.
>
> - **Import:** `mitLiedNummer` schreibt die Nummer in das vorhandene
>   „Lied"-Atom, statt ein eigenes Item davorzusetzen. Damit ist der
>   Wochenend-Abschluss genauso gebaut wie die Eröffnung und der Abschluss
>   unter der Woche — und die `insertClose`-Gymnastik, die die Sprachvarianten
>   strukturgleich halten musste, erübrigt sich von selbst.
> - **Nachtragen:** `setOpeningSong` griff stur auf Atom **0** zu; beim
>   Abschluss steht das Lied in der Mitte. Jetzt sucht `songAtomIndex` es.
>   Daraus wurden `setOpeningSong`/`setClosingSong` über einen gemeinsamen
>   Kern, dazu `closingSongNr` und ein Eingabefeld im ABSCHLUSS-Block.
> - **Alt-Wochen** tragen das Lied weiter als eigenes Item; dort schreibt
>   `setClosingSong` die Nummer hinein statt in den Titel, sonst stünde sie
>   zweimal da. Die Dopplung in der *Anzeige* solcher Wochen verschwindet erst
>   mit einem erneuten Import — bewusst nicht nachträglich umgebaut, weil ein
>   entferntes Item alle `task_key` der Sektion verschöbe.
>
> **Zur Beschriftung:** „SCHLUSSLIED" gibt es nur auf Deutsch, und `ui.test.ts`
> verlangt zu Recht, dass jede der 33 Sprachen jeden UI-Schlüssel **selbst**
> übersetzt („Genau so stand der Familien-Block monatelang in 32 Sprachen
> englisch da"). 32 Wörter zu erfinden schied aus. Stattdessen das bereits
> gemessene `SONG_WORD` — das Feld heißt schlicht „LIED" / „SONG" / „שיר",
> im ABSCHLUSS-Block darüber eindeutig genug.
> **Offen, falls gewünscht:** die 32 Wortlaute für „Schlusslied" an jw.org
> messen, dann wird daraus ein normaler UI-Schlüssel.
>
> Im Browser geprüft (Demo-Daten, Planen → Sonntag): Eintrag „151" macht aus
> „Schlussworte · Lied 76 · Gebet" → „Schlussworte · Lied 151 · Gebet";
> Beschriftungen auf Hebräisch `שיר פתיחה` / `שיר`; Konsole ohne Fehler.

### T34 · Weitere fachliche Punkte 🔧 ✅ erledigt (F12 ⛔ kein Mangel)
- **F6:** ✅ erledigt — `lacAdd` gab neuen Punkten `bereichsKey: 'vortrag'`
  (= öffentlicher Vortrag), jetzt `'studium'` (`meeting-edit.ts:227`). War die
  einzige Zeile des Blocks, die keine fachliche Absprache brauchte.
- **F12:** ⛔ **kein Mangel** (Betreiber, 7.8.2026) — „Wenn man Leser ist, dann
  darf man bei beiden Zusammenkünften lesen. Es braucht keine Unterscheidung."
  Die Asymmetrie zum Vorsitz (`vorsitzMid`/`vorsitzWe`) ist damit gewollt: der
  Vorsitz ist je Zusammenkunft verschieden, das Lesen nicht. Punkt geschlossen.
- **F7:** ✅ erledigt (8.8.2026) — die Personen-Übersicht zeigt jetzt dieselbe
  Warnkachel wie bei doppelten Anzeigenamen, sobald eine feste Rolle mehrfach
  vergeben ist (`doppelteFesteRollen`). Leiter und Vertreter getrennt gezählt.
- **F4:** ✅ erledigt (8.8.2026) — `BRUDER_BEREICHE` benennt die Bereiche, die
  fachlich Brüdern vorbehalten sind; ist einer bei einer Schwester gesetzt,
  steht ein ⚠ neben der Beschriftung. **Keine Sperre** — die Schalter bleiben
  bedienbar, so wie es `PrivToggle` und `isQualified` seit je begründen. Ein
  eigener Test hält fest, dass der Schalter bedienbar bleibt, damit daraus
  nicht versehentlich eine Bevormundung wird. Schulungsaufgaben stehen
  bewusst **nicht** auf der Liste.
- **F8:** ✅ erledigt (8.8.2026) — `fsAutoAssign` reiht Gruppenmitglieder vor
  allen anderen ein. Die Bevorzugung steht **vor** dem Lastvergleich: dahinter
  wäre sie wirkungslos, weil außerhalb der Gruppe fast immer jemand weniger
  geleitet hat. *Innerhalb* der Gruppe entscheidet unverändert dieselbe
  Staffelung, die Fairness bleibt also erhalten — gemessen über sechs Wochen:
  der Gruppentreffpunkt wechselt weiter zwischen den beiden Qualifizierten
  (3 : 3) statt bei einem hängenzubleiben. Kann die Gruppe nicht, greift der
  Rest; ein Platz bleibt nicht offen. Aufseher und Gehilfe gewinnen erst bei
  sonst völligem Gleichstand — stünden sie weiter vorn, leitete der Aufseher
  jede Woche.

---

### T62 · Kreisaufseher-Woche: Dienstvortrag statt Versammlungsbibelstudium 🏗 ✅ erledigt
Beim Umsetzen von T30 aufgefallen, **nicht** mit erledigt (eigener Punkt, damit
er nicht untergeht): `week.co` setzt weiterhin nur den Chip. Der Ablauf bleibt
unverändert — das Versammlungsbibelstudium steht dort, wo in der Dienstwoche
der Dienstvortrag des Kreisaufsehers gehört.

Das ist kein Terminthema (T30 deckt Verlegung und Ausfall ab), sondern ein
Eingriff in den importierten Ablauf: Punkte werden ersetzt, gekürzt und
ergänzt.

> **Fachlich vollständig geklärt (8.8.2026).** Der Betreiber hat den Ablauf
> beider Zusammenkünfte beschrieben; die Umsetzung ist damit nur noch Arbeit.

#### Was sich ändert

| | Punkt | Wirkung |
| --- | --- | --- |
| **Unter der Woche** | Versammlungsbibelstudium | wird zum **Dienstvortrag**, 30 Min., **kein Leser** |
| **Wochenende** | Öffentlicher Vortrag | hält der Kreisaufseher **oder seine Begleitung** |
| **Wochenende** | Wachtturm-Studium | **auf 30 Min. verkürzt** (statt 60) und **ohne Leser** — die Absätze werden nicht gelesen, es werden nur die Fragen des Artikels besprochen |
| **Wochenende** | *neu:* **Schlussvortrag** | 30 Min., am Ende, vom Kreisaufseher oder seiner Begleitung |

**Die Endzeiten verschieben sich nicht** — unter der Woche 30 gegen 30, am
Wochenende −30 (Studium) +30 (Schlussvortrag). `shiftEnd` bleibt außen vor.

#### Titel

„**Dienstvortrag**" und „**Schlussvortrag**" als fester Begriff, das Thema als
zweites Atom dahinter — wie „Bibellesung · Jer 32:6-18". Damit ist der Kopf
übersetzbar und das Thema bleibt Freitext des Planers. „Dienstvortrag" steht in
`translate-data.ts` bereits in allen 34 Sprachen gemessen bereit;
„Schlussvortrag" ist **noch zu messen** (jw.org, nicht erfinden).

#### Plätze — und die Regel dahinter

Alle drei Aufgaben (Dienstvortrag, öffentlicher Vortrag, Schlussvortrag) haben
**je einen Platz, Freitext**, keinen Leser und keine zweite Zeile.

> **Der Kreisaufseher wird nirgends automatisch eingetragen.** Er bringt
> manchmal jemanden mit, den er schult, und diese Begleitung kann eine der drei
> Aufgaben übernehmen — welche, steht nicht fest. Ein „Kreisaufseher-Haken, der
> die Woche füllt" wäre deshalb regelmäßig falsch. Jeder Platz wird einzeln von
> Hand besetzt.

Freitext **nur an diesen drei Plätzen**, nicht an allen: die übrigen Aufgaben
der Woche vergibt die Versammlung wie sonst auch. Der Rednerplatz kann es seit
T29 bereits (`isSpeakerRole`); Dienstvortrag und Schlussvortrag brauchen
dieselbe Behandlung, Rolle `Kreisaufseher` (steht schon in `SKIP_ROLE`: kein
Bestätigungs-Flow, keine Erinnerung, keine Anrechnung, keine Auto-Zuteilung).

#### Lieder — nichts zu tun

Verwendet werden die Lieder des Wachtturm-Artikels, also **wie importiert
vorbelegt**. Ändert der Kreisaufseher eines, ist es praktisch immer das
**Schlusslied**, und das lässt sich seit T33 bereits eintragen. Das Lied im
Wachtturm-Studium bleibt reine Anzeige — der Betreiber hat das am 8.8.2026
ausdrücklich so bestätigt, es wird dort nicht getauscht.

#### Umsetzung (8. August 2026)

**Umgebaut, nicht abgeleitet.** Ausschlaggebend war die Reichweite: an einer
abgeleiteten Woche müssten `countOpenSlots`, `weekConflicts`, `deriveMyTasks`,
die Auto-Zuteilung, das S-89-Formular **und die Edge Functions** vorbeikommen —
letztere lesen rohes JSONB und müssten die Ableitung ein zweites Mal enthalten.
Genau daraus entstand B8. Umgebaute Daten sehen dagegen alle gleich; die Edge
Functions brauchten **keine Zeile** Änderung.

Umbauen heißt nicht wegwerfen: was ersetzt wurde, steht in `week.coData` —
mitsamt Zuteilungen, und je Sprachvariante auch deren Texte. Ausschalten stellt
alles wieder her.

**Vier Dinge, die erst beim Bauen auffielen:**

1. **Die erste Zahl der Meta-Zeile ist nicht immer die Dauer.** Beim
   Wachtturm-Studium steht dort zuerst die Nummer des Studienartikels
   („Studienartikel 28 · 60 Min."). `ersteZahlErsetzen` machte daraus beim
   Kürzen „Studienartikel 30 · 60 Min." — falscher Artikel, unveränderte Dauer.
   Neu: `zahlErsetzen(text, alt, neu)` sucht die Zahl **über ihren Wert**, und
   die alte Dauer kommt aus `item.mins` (T32), nicht aus dem Text. Fehlt `mins`,
   bleibt der Anzeigetext unangetastet — geraten wird nicht.
2. **Die Sprachvarianten tragen eigene Texte.** Ohne Nachführung stand über dem
   Dienstvortrag weiter „Congregation Bible Study", und die englische Fassung
   zeigte „60 Min." für ein Studium mit 30. Beim Zurücknehmen kam der Titel nur
   kanonisch-deutsch wieder. Alle drei Fälle sind jetzt abgelegt und
   wiederhergestellt.
3. **Der Test bestand aus dem falschen Grund.** Er prüfte die Struktur der
   Variante — und `localizedWeek` liefert bei Strukturbruch stillschweigend die
   kanonische Woche, also bestand er in beiden Fällen. Er prüft jetzt den
   **englischen Titel**.
4. **Der Planer kann den Dienstvortrag löschen** (das ✕ der LAC-Zeile). Dann
   fand das Zurücknehmen den Punkt nicht wieder und das Bibelstudium wäre
   verloren gewesen. Es kommt jetzt ans Ende des Abschnitts zurück.

**Der öffentliche Vortrag bleibt bei „Gastredner".** Er nimmt seit T29 Freitext,
funktional ist alles gleich (beide Rollen stehen in `SKIP_ROLE`), und der
Kreisaufseher **ist** ein auswärtiger Redner. Eine zustandsabhängige
Voreinstellung nur für die Beschriftung wäre Aufwand ohne Gewinn.

20 Tests in `src/data/t62.test.ts`, 4 weitere zu `zahlErsetzen` in
`minuten.test.ts`. Im Browser hin und zurück gefahren: eingeschaltet →
„Dienstvortrag · Bleibt wachsam", „Studienartikel 28 · 30 Min." nur noch mit
Leiter, „Vortrag · 30 Min."; ausgeschaltet → alles wieder da, samt Leser und
„60 Min.".

### T63 · Die übrigen Termine der Dienstwoche 🏗 — vom Betreiber zurückgestellt
Zur Dienstwoche gehört mehr als die beiden Zusammenkünfte. Der Betreiber hat es
am 8.8.2026 genannt und ausdrücklich **auf später** gelegt — hier notiert, damit
es nicht untergeht:

| Termin | Besonderheit |
| --- | --- |
| **Pionierbesprechung** | zu einem variablen Zeitpunkt in der Woche |
| **Besprechung mit Dienstamtgehilfen und Ältesten** | zu einem weiteren, anderen Zeitpunkt |
| **Versammlungstreffpunkte** | in dieser Woche zu abweichenden Zeiten |

Die ersten beiden sind **neue Terminarten** — sie hängen an keiner
Zusammenkunft und passen weder in `weeks` noch in `fsWeeks`. Der dritte könnte
mit den vorhandenen Treffpunkt-Instanzen abgedeckt sein (`FsInstance` ist je
Woche änderbar); das ist beim Angehen zuerst zu prüfen, bevor etwas Neues
gebaut wird.

Vor der Umsetzung zu klären: Wer sieht diese Termine (alle, nur Pioniere, nur
Älteste)? Werden sie zugeteilt oder nur angekündigt? Gibt es Erinnerungen?

### T64 · Der Anlass der Woche — und wo er eingestellt wird 🏗 ✅ erledigt
Aufgefallen beim Nachziehen des Designs: Hakt man **BESUCH DES KREISAUFSEHERS**
an, ändert sich auch das Wochenende — der Schalter steht aber im Panel der
Zusammenkunft **unter der Woche**.

#### Der Befund

[SonderwochePanel](../../src/planen/SonderwochePanel.tsx) bekommt `tab={mtab}`;
alles darin gilt **einer** Zusammenkunft, und `setAbweichung` trägt den Reiter
als Argument. Der Kreisaufseher-Schalter ruft dagegen `setDienstwoche` **ohne**
Reiter — er gilt der Woche. Zwei Geltungsbereiche in einer Box, benannt nach dem
kleineren; der Quelltext gibt es im Kommentar darüber selbst zu.

Daraus drei Folgen:

1. Auf dem Wochenend-Reiter ist der Ablauf umgebaut, der Griff dazu fehlt.
2. Der Schalter erscheint und verschwindet beim Reiterwechsel, obwohl sich an
   der Sache nichts ändert.
3. Die Termine aus **T63** hätten dasselbe Problem — sie gehören der Woche und
   haben heute keinen Ort.

#### Die Regel

> Ein Bedienelement gehört auf die Ebene, die es verändert. Ein **Schalter oder
> Auswahlfeld** existiert genau dort, wo sich **das Programm selbst** ändert;
> alles andere ist **Dokumentation** — Freitext, der nichts steuert.

#### Der Anlass der Woche (neues Feld)

| Wert | Was er mit der Woche macht | Termin |
| --- | --- | --- |
| Normal | nichts | — |
| Besuch des Kreisaufsehers | baut beide Zusammenkünfte um (T62) | — |
| Gedächtnismahl | **die** Zusammenkunft entfällt, auf deren Tag es fällt | Datum + Uhrzeit |
| Kongress | **beide** entfallen | Zeitraum: von – bis |

Das Gedächtnismahl ist damit **erstmals einstellbar**; bisher stand es nur im
Datensatz.

**Welche Zusammenkunft das Mahl verdrängt, wird abgeleitet, nicht geraten**
(Betreiber, 8.8.2026): „wenn unter der Woche, fällt diese Zusammenkunft aus;
wenn am Wochenende, dann die am Wochenende." Beides ist bekannt — der Wochentag
steht im Datum des Mahls, die Zusammenkunftstage in den Einstellungen. Trifft
das Mahl keinen der beiden Tage, entfällt keine. Und eine Korrektur des Datums
nimmt den alten Strich zurück, sonst stünden nach „erst Dienstag, dann Sonntag"
beide durchgestrichen da.

> **Abweichung vom Plan:** `co`, `mem` und `memCancel` gehen **nicht** im neuen
> Feld auf, sondern bleiben als seine *Wirkungen* bestehen — der Anlass ist die
> *Ursache*. Zwei Gründe, beide hart:
>
> 1. **Die Edge Functions lesen rohes JSONB.** Ersetzte der Anlass die
>    Wirkungen, müssten `send-reminders` und `substitute` die Ableitung ein
>    zweites Mal enthalten — genau daraus entstand B8, und genau deshalb baut
>    T62 den Ablauf in den Daten um, statt ihn abzuleiten.
> 2. **„Der Anlass schlägt vor, die Zusammenkunft entscheidet."** Ginge das
>    Streichen nur über den Anlass, ließe sich der Fall nicht abbilden, in dem
>    der Kongress bloß das Wochenende frisst.
>
> Der angenehme Nebeneffekt: `anlassArt()` liest bei alten Wochen `co`/`mem` —
> es braucht **keine Datenwanderung**.

**„Anderer Grund" ist kein Anlass**, sondern dessen Abwesenheit plus eine Notiz:
„Normal" oben, Freitext unten bei der betroffenen Zusammenkunft. Nähme man ihn
in die Liste auf, verstecke man das Feld für die drei echten Anlässe — und
„Dienstwoche, deshalb Freitag statt Dienstag" ließe sich nicht mehr
danebenschreiben.

**Der Anlass schlägt vor, die Zusammenkunft entscheidet.** „Kongress" schaltet
beide aus, die Schalter darunter bleiben bedienbar — sonst ließe sich der Fall
nicht abbilden, in dem nur das Wochenende ausfällt. Dasselbe Verhältnis wie
zwischen Rhythmus (Einstellungen) und Abweichung (Woche).

#### Warum das Datum der eigentliche Gewinn ist

Der Grund ist Freitext und bleibt **bewusst unübersetzt** — es sind die Worte
des Planers. Wer heute „Kongress" hineinschreibt, lässt ihn für jeden spanischen
oder koreanischen Verkündiger auf Deutsch dastehen. Mit Anlass **und** Termin
bildet die App den Satz selbst: „Kongress vom 16. bis 18. Oktober", aus
gemessenen Bausteinen plus `Intl`.

Die Datumsfelder kosten **kein neues Vokabular**: `s89Datum` („Datum"), `von`
(„VON") und `bis` („BIS") stehen bereits in allen 34 Sprachen.

**„Kongress" ist gemessen** (8.8.2026). Quelle:
<https://www.jw.org/de/bibliothek/broschueren/wille-jehovas/jehovas-zeugen-kongresse/>
— vom Betreiber genannt. Geholt über denselben Weg, den `import-week` geht: Die
deutsche Seite trägt im `otherAvailLangsChooser` je Sprache ein `data-url`
(450 Sprachen), daraus die 33 nach `JW_TO_APP`. Gegengeprobt wurde jede Form
einzeln — sie steht **wörtlich** im Fließtext ihrer Seite, nicht nur im
Fragetitel und nicht abgeleitet:

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| de | Kongress | en | assembly | es | asamblea |
| fr | rassemblement | it | congresso | pt | assembleia |
| nl | bijeenkomst | pl | zgromadzenie | ru | конгресс |
| uk | конгрес | ro | congres | el | συνέλευση |
| cs | sjezd | sk | zjazd | hu | kongresszus |
| hr | skup | sr | skup | bg | конгрес |
| sv | sammankomst | da | stævne | fi | konventti |
| no | stevne | tr | ibadet | zh | 大会 |
| ja | 大会 | ko | 대회 | id | kebaktian |
| tl | asamblea | vi | hội nghị | sw | kusanyiko |
| ar | محفل | he | כינוס | fa | گردهمایی |
| ur | اجتماع | | | | |

Aufgeführt ist die **Grundform**, wie sie im Text steht; die Großschreibung
folgt beim Einbau der jeweiligen Sprache. Es ist ein **UI-Schlüssel**, gehört
also nach [de.ts](../../src/i18n/de.ts) und in die 33 Overlays unter
`src/i18n/overlays/`, nicht in `translate-data.ts`.

**Wichtig — es ist der Oberbegriff, nicht der Fachbegriff.** Der Artikel nennt
die drei Anlässe im Jahr einzeln, und dabei zeigt sich: Manche Sprachen haben
ein Wort für beide Arten, andere zwei.

| Sprache | eintägig (Kreis) | dreitägig (Region) | Oberbegriff |
| --- | --- | --- | --- |
| de | Kreiskongress | regionaler Kongress | **Kongress** |
| el | συνέλευση περιοχής | περιφερειακή συνέλευση | **συνέλευση** |
| tr | çevre ibadeti | bölge ibadeti | **ibadet** |
| ja | 巡回大会 | 地区大会 | **大会** |
| fi | kierroskonventti | aluekonventti | **konventti** |
| en | circuit assembly | regional **convention** | **assembly** |
| it | assemblea di circoscrizione | **congresso** di zona | **congresso** |
| hr/sr | pokrajinski sastanak | regionalni **kongres** | **skup** |

Für die App ist der **Oberbegriff** das Richtige: Der Anlass sagt „diese Woche
fallen beide Zusammenkünfte aus", gleich welcher der drei Anlässe es ist. Die
Tabelle oben ist genau dieser Oberbegriff — und zwar so, wie jw.org ihn selbst
verwendet („Sie besuchen einen unserer Kongresse", englisch „attending one of
our assemblies"), nicht als eigene Wahl. Wer es in einer Sprache dennoch
schärfer will, entscheidet das dort bewusst; erfunden ist dann nichts, es steht
beides gemessen da.

**Der erste Eintrag der Liste braucht kein Wort:** ein **„—"** genügt. Ein
Gedankenstrich ist in jeder Sprache und jeder Schrift derselbe, und die drei
anderen Einträge tragen die Bedeutung. Die Alternativen kosten mehr und leisten
weniger: das Hausmuster `keinePersonOpt` („— keine Person —") bräuchte „Anlass"
als gemessenes Wort, und `ohneAngabe` („Ohne Angabe") gibt es zwar fertig in
allen 34, sagt aber etwas anderes — dass ein Anlass besteht, den nur niemand
genannt hat.

**Entschieden (Betreiber, 8.8.2026):** Der Kongress trägt **von und bis**, und
**„bis" wird beim Eintragen von „von" mit demselben Wert vorbelegt.** Ein
Kreiskongress dauert einen Tag, ein Regionalkongress drei — mit der Vorbelegung
muss für den kurzen Fall nichts geändert werden, und trotzdem sind **beide Werte
immer gefüllt**. Das ist der eigentliche Gewinn gegenüber einem leeren Ende: es
gibt keinen Sonderfall „kein bis", weder in der Anzeige noch in der
Konfliktprüfung noch beim Erinnerungsversand.

Vorbelegt wird nur, solange „bis" leer ist oder vor „von" läge — ein bereits
eingetragenes Ende darf eine spätere Korrektur des Anfangs nicht überschreiben.
Die Anzeige bildet daraus beides: „Kongress am 17. Oktober", wenn von und bis
gleich sind, sonst „Kongress vom 16. bis 18. Oktober".

Beide Beschriftungen (`von`, `bis`) stehen bereits in allen 34 Sprachen gemessen
bereit.

**Dieselbe Vorbelegung gilt bei den Abwesenheiten** (Betreiber, 8.8.2026) — und
beim Umsetzen stellte sich heraus: **dort gibt es sie längst.** In
[AufgabenScreen.tsx](../../src/aufgaben/AufgabenScreen.tsx) steht
`if (iso && (!to || to < iso)) setTo(iso)`, Buchstabe für Buchstabe dieselbe
Regel, die hier für den Kongress beschlossen wurde. Die Notiz, dort sei sie
nicht vorhanden, war falsch. Die Wochen-Ansicht folgt damit einem vorhandenen
Muster, statt ein zweites zu erfinden — und `toastVonNachBis` bleibt in beiden
Fällen als Rückversicherung für den, der das Ende absichtlich vor den Anfang
setzt.

#### Wo es eingestellt wird: ein vierter Reiter

Vorschlag des Betreibers (8.8.2026): rechts von „Predigtdienst" ein weiterer
Reiter als **Stift-Symbol**, der die Konfiguration der Woche öffnet. Sonst sind
diese Einstellungen nicht zu sehen.

Er schlägt die Alternativen: ein Panel über den Reitern kostet auf jeder
gewöhnlichen Woche Höhe; ein verstecktes Stift-Symbol am Wochenbereich findet
man nicht; und ein Chip als Schalter existiert nicht, solange nichts gesetzt ist.

Strukturell ist es eine Wiederholung. `MeetingTab = MeetingKey | 'fs'` kennt
bereits einen Reiter, der keine Zusammenkunft ist, und
[persist.ts](../../src/app/persist.ts) ist mit `mtab` der eine Trichter zurück.
Wird der Typ breiter, hört diese Zeile auf, sauber zu verengen — der Compiler
zeigt also jede Stelle, die sich entscheiden muss.
[reducer.ts](../../src/app/reducer.ts) hat die Regel „dieser Reiter ist nicht
erlaubt → zurück auf `mid`" schon (heute für `fs`).

Zuschnitt:

- Eine **Ansicht**, kein Sheet — alle anderen Reiter tauschen den Inhaltsbereich.
  Ein Overlay wäre ein Knopf, der wie ein Reiter aussieht.
- Nur im **Planen**, nur für **Planer**: das Programm ist für alle nur lesend,
  der Gruppenaufseher sieht ohnehin nur „Predigtdienst".
- Inhalt: Anlass + Termin, darunter **beide** Zusammenkünfte mit findet statt /
  Wochentag / Uhrzeit / Grund. Heute geht nur die des aktuellen Reiters —
  „Mittwoch statt Dienstag" **und** „Wochenende entfällt" sind zwei
  Reiterwechsel.
- Später der Ort für **T63**: dessen Termine sind dann keine neue Terminart mehr,
  sondern eine weitere Zeile in einer Liste, die es schon gibt.
- Neues Vokabular: der vorgelesene Name des Reiters und der Titel der Ansicht.
- **Achtung:** Die Reiterleiste bricht bei großem Schriftgrad um, statt seitlich
  zu scrollen. Ein Symbol-Reiter muss das mitmachen und darf nicht wie ein
  kaputter Reiter aussehen, wenn er allein in der zweiten Zeile landet; im
  RTL-Layout bleibt er am Ende der Zeile.

#### Was gleich mit erledigt wird

**1 · Der Schlussvortrag bekommt eine eigene Sektion.**
[meeting-edit.ts](../../src/data/meeting-edit.ts) hängt ihn heute mit
`wtItems.push(vortrag)` unter die Überschrift WACHTTURM-STUDIUM — dort steht
dann ein zweiter Punkt, der keiner ist. Der v3-Prototyp sah dafür eine eigene
Sektion in **Gold** vor; Gold ist am Wochenende unbenutzt (dort nur neutral,
petrol, wein) und in allen elf Farbschemata tokenisiert — **keine neue
Bereichsfarbe nötig**, und inhaltlich passend, denn Gold ist unter der Woche die
Farbe von „Uns im Dienst verbessern". Das Etikett `DIENSTVORTRAG` steht in allen
33 Sprachen gemessen bereit. Die Rücknahme muss dann die **Sektion** entfernen
statt nur den Punkt, und die Sprachvarianten (`Week.alt`) brauchen dieselbe
Sektion — sonst fällt `localizedWeek` stumm aufs Deutsche zurück.

**2 · `TITEL_SCHLUSSVORTRAG` von `'Vortrag'` auf `'Schlussvortrag'`.** In T62 als
Platzhalter markiert, weil nicht gemessen. Der Betreiber hat am 8.8.2026 18
Wortlaute von jw.org geliefert:

| Sprache | Wortlaut | | Sprache | Wortlaut |
| --- | --- | --- | --- | --- |
| en | Concluding Service Talk | | sr | Zaključni službeni govor |
| es | Discurso de servicio final | | bg | Заключителен служебен доклад |
| fr | Discours de service de conclusion | | fi | Viimeinen palveluspuhe |
| it | Discorso di servizio conclusivo | | el | Τελική Υπηρεσιακή Ομιλία |
| pt | Discurso de Serviço Final | | cs | Závěrečný služební proslov |
| nl | Slotlezing | | sk | Záverečný služobný prejav |
| pl | Końcowe przemówienie służbowe | | zh | 最后的演讲 |
| ru | Заключительная служебная речь | | ja | 結びの奉仕の話 |
| uk | Заключна службова промова | | id | Khotbah Dinas Penutup |

Mehr gibt es dort derzeit nicht. Die übrigen 15 Sprachen bekommen **ihr eigenes
gemessenes „Vortrag"** — geprüft: der Schlüssel steht in allen 33 Sprachen.
Im Quelltext als **Rückfall markieren** und die Liste in einem Test festnageln,
wie bei T25 mit den 22 unübersetzten Titeln; sonst liest das später jemand als
Übersetzung von „Schlussvortrag". Der Vollständigkeitstest aus T26 verlangt den
Schlüssel ohnehin in jeder Sprache.

Zwei der 18 brechen das Bildungsmuster: Niederländisch **Slotlezing** und
Chinesisch **最后的演讲** kommen ohne „Dienst" aus. Das sind gut 10 % der
Stichprobe — der Beleg dafür, dass sich die fehlenden nicht zusammensetzen
lassen, sondern gemessen werden müssen.

**3 · Abstand am Kreisaufseher-Schalter** — hat sich erledigt: Der Schalter ist
aus dem Zusammenkunfts-Panel ausgezogen und im Auswahlfeld der Woche
aufgegangen. Wo nichts mehr klebt, braucht es keine Haarlinie.

#### Umsetzung (8. August 2026)

| Was | Wo |
| --- | --- |
| Anlass, Termin, Vorbelegung, Ableitung des Mahl-Ausfalls | [data/anlass.ts](../../src/data/anlass.ts) |
| Bearbeiten-Ansicht | [planen/WochePanel.tsx](../../src/planen/WochePanel.tsx) |
| vierter Reiter (Symbol) | [components/MeetingTabs.tsx](../../src/components/MeetingTabs.tsx) |
| eigene Sektion für den Schlussvortrag | [data/meeting-edit.ts](../../src/data/meeting-edit.ts) |
| `kongress` in 34 Wörterbüchern, `Schlussvortrag` in 33 FRAG-Blöcken | `i18n/` |

**Nur ein neuer Schlüssel**, und der war gemessen: `kongress`. Reiter und
Ansicht heißen `einstellungen`, „kein Anlass" ist ein Gedankenstrich, die
Termin-Felder nutzen `s89Datum`/`a11yTime`/`von`/`bis` — alles vorhanden. Der
Plan hatte zwei weitere veranschlagt.

**Nebenbei aufgeräumt:** `mtab` (View-Tab → Zusammenkunft) stand in drei
Abschriften, alle als `tab === 'fs' ? 'mid' : tab`. Der vierte Reiter machte sie
still falsch — der Compiler zeigte jede, weil `MeetingTab` nicht mehr auf
`MeetingKey` zuweisbar war. Jetzt eine Stelle in `data/helpers.ts`.

**Ein Befund aus der Gegenprobe:** Der Wochentag des Gedächtnismahls kam
zunächst aus `new Date(iso)`. Das ist Mitternacht UTC und in westlichen
Zeitzonen lokal noch der Vortag — es entfiele die falsche Zusammenkunft. Ein
Test dagegen bleibt in Mitteleuropa grün, gleich ob die Absicherung dasteht oder
nicht. Was die Gegenprobe nicht fassen kann, wird nicht abgesichert, sondern
beseitigt: Der Wochentag wird jetzt **gerechnet** (Sakamoto), ganz ohne `Date`.

**Was nicht gebaut wurde:** Das Programm des Gedächtnismahls (Ansprache,
Symbole herumreichen, Ordner-Plätze) erzeugt der Anlass **nicht** — er setzt die
Marke, den Termin und den Ausfall. Wochen, die ein solches Programm mitbringen,
zeigen es weiterhin über `memCancel`. Das Erzeugen wäre ein eigener Punkt.

29 Tests in [data/anlass.test.ts](../../src/data/anlass.test.ts), 8 in
[planen/WochePanel.test.tsx](../../src/planen/WochePanel.test.tsx), 2 in
`t62.test.ts` umgeschrieben. Jede Korrektur einzeln zurückgenommen und der
Testlauf wiederholt — sieben Mutationen, sieben rote Läufe. Im Browser
nachgefahren: Kongress → Chip, beide Zusammenkünfte durchgestrichen, „0 offene
Zuteilungen"; eine wieder angeschaltet → „3 offene", Anlass bleibt;
Kreisaufseher → Sektion DIENSTVORTRAG mit `data-farbe="gold"` zwischen Studium
und Abschluss.

### T65 · Die Gedächtnismahl-Woche fehlt im Arbeitsheft 🏗 ✅ erledigt (13. August 2026)
Vom Betreiber genannt und **an jw.org nachgemessen**: In der Woche des
Gedächtnismahls steht im Arbeitsheft kein Programm — und zwar nicht ein leeres,
sondern **gar keine Seite**.

Ausgabe März/April 2026, acht Wochen, eine Lücke:

| Woche | Seite |
| --- | --- |
| 23.–29. März 2026 | ✓ |
| **30. März – 5. April 2026** | **fehlt** |
| 6.–12. April 2026 | ✓ |

An ihrer Stelle steht `Bibelleseprogramm-für-das-Gedächtnismahl-2026`, und dort
ausgeschrieben: „DONNERSTAG, 2. APRIL — GEDÄCHTNISMAHL (NACH SONNENUNTERGANG)",
14. Nisan. Der 2. April 2026 ist ein Donnerstag und liegt genau in der Lücke.
Das ist ein redaktionelles Mittel, kein Versehen — **und es gilt in jedem Jahr**
(Betreiber, 8.8.2026).

#### Was heute passiert

`discoverWeeks()` ([import-week/index.ts](../../supabase/functions/import-week/index.ts))
sammelt nur Seiten mit `Zusammenkunft-…` im Pfad. Die Gedächtnismahl-Woche ist
keine — der Import springt von 23.–29. März direkt auf 6.–12. April und legt
für sie **gar keine Zeile** an.

Das ist eine Lücke mit Folgen, denn die **Zusammenkunft am Wochenende dieser
Woche findet statt**: Öffentlicher Vortrag und Wachtturm-Studium laufen normal —
nur gibt es keine Woche, in der man sie planen könnte. Und der Anlass
„Gedächtnismahl" aus T64 braucht eine Woche, auf der er sitzen kann.

**Was nicht bricht:** T36 rechnet den Wochenabstand aus `week.start`, nicht aus
dem Index — „N Wochen in Folge" bleibt richtig, obwohl zwei benachbarte Einträge
zwei Kalenderwochen auseinanderliegen. Und `currentWeekIndex` hat den Rückfall
auf die gewählte Woche, wenn heute in keine geladene fällt. Es stürzt nichts ab;
es fehlt etwas.

#### Zuschnitt

**Die App soll die Lücke selbst erkennen** (Betreiber, 8.8.2026), nicht der
Planer die Woche von Hand anlegen. Erkennbar ist sie leicht: `discoverWeeks()`
liefert die Wochen nach `start` sortiert — beginnt die nächste mehr als sieben
Tage nach der vorigen, fehlt eine. Zur Gegenprobe steht auf derselben
Ausgabenseite die Bibelleseprogramm-Seite.

Gebaut werden muss dafür **kein neuer Mechanismus**, nur der vorhandene ohne
seine erste Hälfte: Der Import baut das Wochenende ohnehin als editierbare
Vorlage (im Arbeitsheft steht nur die Zusammenkunft unter der Woche). Für die
Gedächtnismahl-Woche also: Vorlage fürs Wochenende, Zusammenkunft unter der
Woche entfallen, Anlass `mem` samt Datum gesetzt. Das Datum lässt sich aus der
Bibelleseprogramm-Seite **messen** — sie nennt den Tag ausgeschrieben —, und
dann setzt die Ableitung aus T64 den Ausfall von selbst auf die richtige
Zusammenkunft.

> **~~Falle, die zuerst zu bedenken ist:~~ erledigt durch T66.** Der Index einer
> Woche **war** ihre `position` in der Datenbank und steckte in jedem
> gespeicherten `task_key` (T37/T35). Die fehlende Woche hätte deshalb nur
> entstehen dürfen, wenn der Import **an ihr vorbeikäme** — sie nachträglich
> einzuschieben, wenn schon spätere Wochen lagen, verschob alle Positionen
> dahinter und ließ jede bestehende Bestätigung auf die falsche Woche zeigen.
> Seit T66 ist eine Woche ihr Datum: Sie lässt sich jederzeit einschieben, und
> die Reihenfolge, in der importiert wird, spielt keine Rolle mehr.

**Entschieden (Betreiber, 8.8.2026):** Die Woche bekommt einen sichtbaren
Hinweis — es genügt „Gedächtnismahl-Woche" oder Ähnliches —, und der Import legt
sie **stillschweigend** an, ohne eigene Meldung.

> Der Hinweis ist damit **schon gebaut**: `memWoche` („GEDÄCHTNISMAHL") steht
> gemessen in allen 34 Sprachen, und `WeekChips` zeigt den Chip seit T64, sobald
> `anlassArt(week) === 'mem'` gilt. Setzt der Import den Anlass, erscheint er von
> selbst — kein neues Vokabular, kein neuer Baustein.

Die Positions-Falle oben war die erste Entscheidung beim Bauen — **solange**
`position` die Kennung einer Woche war. Genau das war der eigentliche Mangel; er
steht als **T66** und ist erledigt. T65 konnte damit ohne Rücksicht auf die
Reihenfolge gebaut werden.

#### Gebaut am 13. August 2026 — und beim Messen anders geworden

**Die Lücke gibt es nicht in jedem Jahr.** Das war die Annahme im Zuschnitt
oben („es gilt in jedem Jahr"), und sie hält der Messung nicht stand:

| Ausgabe | Gedächtnismahl | Wochenseiten | Lücke |
| --- | --- | --- | --- |
| März/April 2024 | **Sonntag**, 24. März | 9 | **keine** |
| März/April 2026 | **Donnerstag**, 2. April | 8 | 23.3. → 6.4. |

Der Grund ist sauber und erklärt beides: Im Arbeitsheft steht **nur die
Zusammenkunft unter der Woche**. Fällt das Mahl auf einen Werktag, entfällt
genau diese — dann gibt es für die Woche nichts zu drucken. Fällt es aufs
Wochenende, läuft sie normal, und die Seite ist da.

Deshalb wird die Lücke **nicht an ihrem Abstand erkannt**. Das wäre verlockend
und falsch: Zwischen zwei Ausgaben klafft ebenfalls eine, wenn die folgende noch
nicht veröffentlicht ist. Stattdessen wird das Datum auf der
Bibelleseprogramm-Seite gemessen — die es in **beiden** Jahren gibt —, und erst
der Vergleich mit den gefundenen Wochenseiten sagt, ob eine fehlt.

| Was | Wo |
| --- | --- |
| Datum messen, Woche erzeugen, Wochenkopf bilden | [import-week/gedaechtnismahl.ts](../../supabase/functions/import-week/gedaechtnismahl.ts) |
| `discoverWeeks` trägt sie ein — als fehlende oder als vorhandene mit Anlass | [import-week/index.ts](../../supabase/functions/import-week/index.ts) |
| `weekendTemplate` exportiert: das Wochenende findet statt | [import-week/parse.ts](../../supabase/functions/import-week/parse.ts) |
| Der Ausfall wird **im Client** abgeleitet, nicht im Import | [app/reducer.ts](../../src/app/reducer.ts) |
| 26 Tests auf die Messung, 4 auf den Import | [gedaechtnismahl.test.ts](../../supabase/functions/import-week/gedaechtnismahl.test.ts), [reducer.test.ts](../../src/app/reducer.test.ts) |

**Der Ausfall bleibt an einer Stelle.** Die Edge Function setzt nur den Anlass
samt Datum; welche Zusammenkunft er streicht, rechnet `setAnlassTermin` im
Client. Die Regel ein zweites Mal serverseitig zu führen war schon einmal die
Ursache eines Fehlers (B8/T40) — und sie steht ohnehin schon dort, seit T64.

#### Zwei Korrekturen, die dabei anfielen

**1. `memAusfall` aus T64 war zu eng.** Es ließ die Zusammenkunft entfallen,
deren **Tag** mit dem Mahl zusammenfiel. Die Messung widerlegt das: 2026 fehlt
das ganze Wochenprogramm — für **alle** Versammlungen, gleich an welchem Werktag
sie zusammenkommen. Eine Versammlung mit Zusammenkunft am Dienstag hat für den
2. April kein Programm, also kommt sie auch nicht zusammen. Richtig ist die
Kategorie, und das ist genau der Satz des Betreibers vom 8.8.2026: Mahl Mo–Fr →
die Zusammenkunft unter der Woche entfällt, Sa/So → die am Wochenende. Immer
genau eine, nie keine. `setAnlassTermin` braucht die Zusammenkunftszeiten damit
**gar nicht mehr** — der Parameter ist weg.

**2. Wochen über den Monatswechsel wurden nie übersetzt.** Gemessen am
Übersetzer:

| Kopfzeile | Ergebnis (en) |
| --- | --- |
| `23.–29. März` | `March 23–29` ✓ |
| `27. April–3. Mai` | `27. April–3. Mai` ✗ |
| `28. Sep – 4. Okt` | `Sep 28 – Oct 4` ✓ |

Die mittlere ist die Form, die **jw.org tatsächlich liefert** (nachgemessen an
der Ausgabe März/April 2026); die untere steht nur in den Demo- und
Vorlagenwochen dieser App — deshalb passte die Regel zu den eigenen Daten und
nicht zu den fremden. Rund **jede vierte Woche** trug damit in 33 Sprachen eine
deutsche Kopfzeile. Nichts stürzte ab, nichts fiel auf. Der Kopf der
Gedächtnismahl-Woche 2026 heißt „30. März–5. April" — genau diese Form —, also
fiel es hier mit. Die drei Muster stehen jetzt beisammen und werden von **beiden**
Übersetzer-Pfaden benutzt; ein Test verlangt für jede der 33 Sprachen eine
Übersetzung, nicht bloß „wirft nicht".

**Gegenprobe:** 13 Mutationen, 13-mal rot.

> **Was die Tests nicht abdecken, und das steht hier absichtlich:**
> `discoverWeeks` und der Handler in `import-week/index.ts` haben keinen
> Test-Aufbau — sie holen Seiten, und ein Test dagegen wäre entweder ein
> Netzzugriff oder eine nachgebaute jw.org. Die Bausteine sind einzeln geprüft;
> ihr Zusammenspiel wurde stattdessen **gegen die echten Seiten gemessen** (März/
> April 2024 → nur Anlass setzen, März/April 2026 → Woche erzeugen, Januar/
> Februar 2026 → gar keine Leseprogramm-Seite). Ein Test-Aufbau für den Handler
> wäre eine eigene Aufgabe.

> **`import-week` muss neu deployt werden**, sonst ändert sich nichts:
> `npx supabase functions deploy import-week`

### T66 · Eine Woche ist ihr Datum, nicht ihre Nummer 🏗 ✅ erledigt (drei Stufen)
Beim Zuschnitt von T65 aufgefallen und vom Betreiber sofort als Mangel erkannt:
*„das klingt nach einem Problem — müssen wir da die DB fixen, damit hier nicht
Annahmen vorausgesetzt werden, sondern richtige Daten drin liegen?"*

Ja. Der Befund in einem Bild — [schema.sql](../../supabase/schema.sql):

```sql
create table if not exists public.weeks (
  id              uuid primary key default gen_random_uuid(),   -- existiert …
  position        integer not null,                             -- … und wird nicht benutzt
  unique (congregation_id, position)
);
```

**Der stabile Schlüssel ist längst da und liegt brach.** Identität läuft
stattdessen über `position` — eine **Ordnungszahl**, die zugleich als **Kennung**
dient. Das ist die Verwechslung, aus der alles Weitere folgt.

#### Was daran hängt

| Stelle | Was sie annimmt |
| --- | --- |
| `confirmations.task_key` | beginnt mit der Position: `"0\|mid\|part\|2\|1\|0"` |
| `Week.stub` | Platzhalter, **nur** damit der Array-Index die Position bleibt |
| `send-reminders`, `substitute` | lesen `task_key` aus rohem JSONB |
| jede Einfügung in der Mitte | verschiebt alle Positionen dahinter |

T37 hat den Schlüssel **innerhalb** der Zusammenkunft schon von der Position
gelöst (`iid` statt `2|1`). Die **Woche** steht weiterhin als Nummer vorn drin —
der Umbau blieb auf halbem Weg stehen. T36 hat unabhängig davon den
Wochenabstand auf `week.start` umgestellt; die Codebasis wandert also ohnehin in
diese Richtung.

#### Zuschnitt

Die richtige Kennung ist **das Startdatum der Woche** (ISO-Montag): eindeutig je
Versammlung, stabil, für Menschen lesbar und fachlich das, was eine Woche
*ist*. `weeks.id` (uuid) wäre die Alternative, sagt aber nichts — und beim
Bilden eines `task_key` im Client liegt sie nicht vor.

> **Und zwar als Spalte, nicht im Blob** (Betreiber, 8.8.2026: „die Woche sollte
> nicht einfach eine Position haben, sondern ein Startdatum oder so"). Heute
> steht `start` **innerhalb** von `weeks.data` (JSONB). Die Datenbank kann es
> deshalb weder prüfen noch eindeutig halten noch danach sortieren — die einzige
> Integritätsbedingung ist `unique (congregation_id, position)`, also
> ausgerechnet die auf der Ordnungszahl. Genau das ist gemeint mit „richtige
> Daten statt Annahmen".

> **Der Wochenanfang ist immer Montag — und das ist keine Konvention, die wir
> wählen.** Der Betreiber hat zu Recht eingewandt, dass Kulturen die Woche
> verschieden beginnen (Sonntag in Nordamerika, Samstag in Teilen der
> arabischen Welt). Für die *Anzeige* stimmt das; für die *Kennung* ist es
> gegenstandslos: **jw.org definiert die Programmwoche selbst als Montag bis
> Sonntag**, in jeder Sprache. Nachgemessen an der Ausgabe März/April 2026 —
> „2.–8. März", „9.–15. März", „16.–22. März" …, und der 2. März 2026 ist ein
> Montag. Die App übernimmt also die Festlegung des Herausgebers, statt eine
> eigene zu treffen.
>
> Der Code hält das bereits durchgehend ein: der Datumswähler rastert ab Montag
> (`(first.getUTCDay() + 6) % 7`), `fsBase` ist „der Montag der Woche 0", die
> Wochentags-Versätze zählen ab Montag. Neu ist nur, dass es als Entscheidung
> dasteht. **Nicht** verwenden: `Intl.Locale#getWeekInfo()` und alles, was den
> Wochenanfang aus der Sprache ableitet — das gehört in die Anzeige eines
> Kalenders, nie in die Bildung eines Schlüssels.

1. **Neue Spalte** `start date not null` mit `unique (congregation_id, start)`.
   Damit hält die Datenbank selbst, was bisher nur Absprache war: eine Woche je
   Kalenderwoche, keine zwei, keine namenlose.
2. `Week.start` wird **verpflichtend**. Heute setzt es nur der Import; Demo- und
   Vorlagenwochen tragen es nicht (siehe README, Erinnerungs-Versand). Nachtragen
   lässt es sich aus `position` + `fsBase`, und genau das tut die Migration beim
   Füllen der neuen Spalte.
3. `task_key` führt vorn das Datum statt der Nummer:
   `"2026-09-07|mid|part|k3f9x|0"`.
4. Migration schreibt die bestehenden `task_key` um — **eine** Wanderung, danach
   ist die Annahme weg.
5. `send-reminders` und `substitute` ziehen nach und werden neu deployt.
6. **`position` entfällt.** Die Reihenfolge ist `order by start`; eine zweite
   Quelle für dieselbe Aussage wäre wieder eine Annahme, die auseinanderlaufen
   kann.
7. **`Week.stub` wird überflüssig** — seine einzige Begründung ist die
   Index-Ausrichtung. Das ist der Gradmesser dafür, dass der Umbau vollständig
   war: Solange es Platzhalter braucht, trägt der Index noch Bedeutung.

**T65 wartet nicht darauf.** Solange die Lücke erkannt wird, *bevor* die folgende
Woche geladen ist, wird nie in die Mitte eingefügt. T66 nimmt der Sache
anschließend die Zerbrechlichkeit — und mit ihr die Reihenfolge-Abhängigkeit
beim Import überhaupt.

#### Stufe 1 — gebaut am 8. August 2026

**Rein additiv.** `position` bleibt unangetastet, der laufende Client
funktioniert unverändert weiter; erst Stufe 2 stellt den `task_key` um, erst
Stufe 3 lässt `position` und die Platzhalter fallen. So kann der Betreiber die
Migration einspielen, ohne auf einen Deploy warten zu müssen.

| Was | Wo |
| --- | --- |
| `Week.start` ist **verpflichtend** | [data/types.ts](../../src/data/types.ts) |
| Spalte `start date not null` + `unique (congregation_id, start)` | [migration-017](../../supabase/migration-017-wochen-startdatum.sql), [schema.sql](../../supabase/schema.sql) |
| `saveWeek` und die Erstbefüllung schreiben sie mit | [lib/data.ts](../../src/lib/data.ts) |
| auch Platzhalter tragen ihr Datum (`montagAn`) | [lib/data.ts](../../src/lib/data.ts) |
| 6 Tests auf die Form der Kennung | [data/wochenkennung.test.ts](../../src/data/wochenkennung.test.ts) |

**Der Compiler hat die Baustellen gezeigt:** 31 Geburtsorte einer Woche, davon
5 im Produktionscode. Genau dafür wurde das Feld verpflichtend gemacht, bevor
irgendetwas anderes umgestellt wurde.

**Dabei aufgefallen** — und das ist der eigentliche Ertrag: Mehrere Testdaten
gaben allen Wochen **dasselbe** Startdatum, obwohl sie Folgen bauen (die
Fairness-Simulation über zwölf Wochen, die Abwesenheits-Zuordnung, der
Fenster-Test). Solange das Datum optional war, fiel das nicht auf — der
Wochenabstand kam aus dem Index. Zwölf gleiche Startdaten sind aber zwölfmal
dieselbe Woche. Zwei weitere Stellen führten ihre Startdaten als **zweite
Liste** neben den Wochen mit; die ist jetzt weg.

„Kein Datum bekannt" ist der **leere String** — die Form für Altbestand, den
migration-017 nachträgt. Zwei Tests prüfen genau diesen Fall weiter
(`wochenAbstand` ohne Datum, `missingVariants`).

#### Stufe 2 — gebaut am 8. August 2026 (migration-017 war eingespielt)

Der `task_key` trägt vorn die Kennung: `"2026-09-07|mid|part|k3f9x|0"` statt
`"60|mid|part|k3f9x|0"`, und `"fs|2026-09-07|inst7"` statt `"fs|60|inst7"`.

| Was | Wo |
| --- | --- |
| alle Schlüsselbauer nehmen die Kennung | [data/planning.ts](../../src/data/planning.ts), [data/fs.ts](../../src/data/fs.ts) |
| `istWochenKennung` / `wochenIndex` — hin und zurück | [data/planning.ts](../../src/data/planning.ts) |
| `migrateTaskKeyWeeks` schreibt den Bestand beim Laden um | [lib/data.ts](../../src/lib/data.ts) |
| `send-reminders` und `substitute` nachgezogen | [supabase/functions](../../supabase/functions) |
| 10 Tests auf die Umschreibung | [lib/taskkey-migration.test.ts](../../src/lib/taskkey-migration.test.ts) |

**Keine SQL-Migration.** Umgeschrieben wird im Client beim Laden — dieselbe
Bauart wie `migrateItemIds` (T37) und aus demselben Grund: Der Ladepfad kennt
die Wochen samt Kennungen ohnehin, und eine Migration, die beim Laden heilt,
kommt ohne Stillstand aus. Der erste Planer, der sich anmeldet, stellt den
Bestand um; wer eine ältere Fassung der App offen hat, schreibt weiter
Positions-Schlüssel, und die werden beim nächsten Laden mitgenommen.

Beide Edge Functions **lesen deshalb weiterhin auch die alte Form** — sonst
erinnerte der Versand an etwas, das längst bestätigt ist, nur eben unter dem
alten Schlüssel.

> **Der Compiler hat 18 von 19 Stellen gezeigt** — die neunzehnte nicht:
> `shiftPartConfirmations` baute den Präfix als Template-Literal
> (`` `${wi}|${tab}|` ``), und darin ist eine Zahl so gültig wie ein Datum. Sie
> fiel erst im Testlauf auf. **Wo eine Signatur den Typ trägt, hilft der
> Compiler; wo ein Template-Literal ihn verschluckt, hilft nur der Test.**

**Und ein echter Fehler, gefunden von der Gegenprobe:** Zwei von vier Mutationen
blieben zunächst grün. Beim Nachsehen war die eine äquivalent — aber die andere
deckte auf, dass **`Number('')` gleich 0 ist, nicht `NaN`**. Ein Schlüssel mit
leerem erstem Feld wäre der Woche 0 zugeschlagen worden, und eine Bestätigung
wäre an einen Punkt gewandert, zu dem sie nie gehörte. Ein Test dafür steht
jetzt da, und mit ihm werden alle vier Mutationen erkannt.

#### Stufe 3 — gebaut am 13. August 2026

**`position` entfällt.** Laden und Speichern laufen über die Kennung, die
Platzhalter sind weg, und die Spalte wird gelöscht.

| Was | Wo |
| --- | --- |
| `Week.stub` und `AppState.weekFrom` ersatzlos gestrichen | [data/types.ts](../../src/data/types.ts), [app/context.ts](../../src/app/context.ts) |
| Ladefenster über das Datum; `start` kommt aus der **Spalte** | [lib/data.ts](../../src/lib/data.ts) |
| `saveWeek(congId, week)` — die Woche sagt selbst, welche Zeile gemeint ist | [lib/data.ts](../../src/lib/data.ts) |
| `saveFsWeek` und die Bündelung je Woche statt je Index | [lib/data.ts](../../src/lib/data.ts), [app/persist.ts](../../src/app/persist.ts) |
| Treffpunkte werden über das Datum zugeordnet, nicht über die Zeilenfolge | [lib/data.ts](../../src/lib/data.ts) |
| `send-reminders` und `substitute` lesen `start`, nicht `position` | [supabase/functions](../../supabase/functions) |
| Restliche Positions-Schlüssel umschreiben, dann Spalte löschen | [migration-018](../../supabase/migration-018-position-entfaellt.sql) |

**Die Client-Migration aus Stufe 2 ist weg — und das war keine Aufräumarbeit,
sondern zwingend.** `migrateTaskKeyWeeks` hob einen Schlüssel über `weeks[60]`
auf sein Datum; diese Brücke ist der Array-Index als Datenbank-Position, also
genau das, was Stufe 3 abreißt. Wäre sie stehen geblieben, hätte sie
Bestätigungen der falschen Woche zugeordnet. **migration-018 macht dieselbe
Arbeit in SQL** — dort liegen `position` und `start` ein letztes Mal
nebeneinander, und zwar für alle Versammlungen, nicht nur für die, deren Planer
sich anmeldet. Der Sonderfall dabei: derselbe Bruder kann beide Formen tragen
(unter einer älteren, noch offenen Fassung bestätigt, nachdem der Schlüssel
schon umgeschrieben war). Dann gewinnt die datierte, sonst scheiterte das
Umbenennen an `unique (congregation_id, task_key, user_id)`.

**Zwei Dinge wurden dabei nebenbei richtig**, beide vorher stumm falsch:

1. **Treffpunkte hingen an der Zeilenfolge.** `fsByPos.get(i)` nahm den
   Array-Index, `startOf.get(row.position)` im Versand die Positionsnummer.
   Fehlte eine Woche, saßen die Treffpunkte eine Woche daneben. Jetzt führen
   beide Tabellen dieselbe Kennung, und zugeordnet wird darüber.
2. **`data->>'start'` konnte fehlen.** migration-017 füllte die *Spalte*, nicht
   den Blob. Wer die Kennung aus `data` las — Client wie Versand —, bekam bei
   Zeilen von vor migration-017 nichts. Beide lesen sie jetzt aus der Spalte.

**Und ein Fehler in `schema.sql`, aus Stufe 1 übrig:** `weeks` bekam dort die
Regel `unique (congregation_id, start)` nie — migration-017 legt sie per `alter
table` an, `schema.sql` beschreibt aber die *frische* Installation. Eine neue
Instanz hätte die Eindeutigkeit auf der Kennung nicht gehabt. Nachgetragen, und
migration-018 trägt sie auch bestehenden Instanzen nach.

> **Reihenfolge: erst deployen, dann migration-018.** Der neue Client kennt
> `position` nicht mehr; solange die Spalte `not null` dasteht, scheitern
> deshalb genau zwei Dinge — das Einfügen einer neuen Woche (Import) und das
> erste Materialisieren von Treffpunkten. Beide melden sich sichtbar. Umgekehrt
> wäre es schlimmer: der alte Client holt `select position, data` und bekäme
> nach dem Löschen gar nichts mehr. Die Edge Functions müssen vorher ebenfalls
> neu deployt sein.

**Gegenprobe:** zehn Mutationen, zehnmal rot. Eine blieb zunächst grün — die
Bündelung der gepufferten Schreibvorgänge (`weekSaves`) je Index statt je
Kennung. Sie ist **nicht** gleichwertig: verschiebt sich die geladene Menge
zwischen zwei Änderungen (stilles Nachladen nach einem Schreibkonflikt), steht
dieselbe Woche an einem anderen Index, und über den Index gebündelt schriebe der
ältere Eintrag seine überholte Fassung hinterher. Der Test dafür steht jetzt da.

## Phase 7 — Struktur (🏗 planen, nicht nebenbei)

> Reihenfolge beachten: T35 ist die kleine Absicherung, T36 die günstige
> Verbesserung, T37 der eigentliche Umbau.

### T35 · Wochen beim Laden an ihrer `position` ausrichten 🔧 ✅ erledigt
**`lib/data.ts:614-625`** reiht die geladenen Zeilen **positionsblind**
aneinander. Fehlt eine Position (etwa nach einem stillen Schreibfehler, vgl. T5),
verschieben sich alle Indizes — und damit **jeder** gespeicherte `task_key`.

Ein Array der Länge `höchstePosition+1` anlegen und jede Zeile an ihren
`position`-Index setzen; Lücken werden `stubWeek()`. Zehn Zeilen.
→ [code-review.md § 2.6](code-review.md)

> **Umgesetzt am 8. August 2026** — genau so, plus eine Schranke: eine Zeile mit
> einer Position außerhalb des geladenen Fensters wird ausgelassen statt an
> falscher Stelle gezeigt. Zwei Tests in `data-load.test.ts` halten es fest
> (Lücke in der Mitte, Lücke am Anfang des Fensters); ohne die Änderung fallen
> beide.

### T36 · Wochenabstand aus `week.start` statt aus dem Index 🔧 ✅ erledigt
`LOAD_RADIUS = 2` heißt heute „±2 **Einträge**", nicht „±2 Wochen". Fehlt eine
Woche im Import (Kongress, Urlaub), misst die Fairness-Logik über einen ganz
anderen Zeitraum — während das Sheet weiter „*n* Aufgaben in 5 Wochen" schreibt.
Betroffen: `assignmentDistance` (`planning.ts:117`), `loadWindow`
(`helpers.ts:323`), Serien-Konflikt (`planning.ts:1131`).

Eine Funktion `wochenAbstand(a, b)` aus `start` (Fallback: Indexdifferenz).
Kein Datenmodell-Umbau.

> **Umgesetzt am 8. August 2026.** `wochenAbstand` liegt in `helpers.ts` und
> rechnet aus `week.start`; fehlt das Datum (Demo, Platzhalter, von Hand
> angelegte Wochen), bleibt es beim Indexabstand.
>
> Drei Stellen hängen daran, und jede hatte ihren eigenen Fehler:
> - `assignmentDistance` — die Wartezeit zählte Einträge.
> - `loadWindow` — die fünf Quadrate liefen über Indizes. Fehlt eine Woche,
>   zeigten sie eine zwei Wochen alte Aufgabe als „vorige Woche". Jetzt wird
>   die Woche zum jeweiligen Datum gesucht; gibt es sie nicht, bleibt das
>   Quadrat leer.
> - **Serien-Konflikt** — „drei Wochen in Folge" zählte drei *Einträge*. Lag
>   dazwischen eine Kongresswoche, meldete die App eine Serie, die keine war.
>
> Gegenprobe für alle drei einzeln gefahren. Beim Serien-Test fiel dabei auf,
> dass die erste Fassung grün blieb, ohne etwas zu prüfen: `weekConflicts`
> meldet nur Serien, die *kürzer* als der geladene Zeitraum sind, und bei genau
> drei Wochen greift das. Der Test hat jetzt eine vierte Woche — und fällt ohne
> die Korrektur.

### T37 · `task_key` von der Position lösen 🏗 ✅ erledigt
Der positionsbasierte Schlüssel ist die Ursache von T16, der Fragilität von T35
und des `Week.stub`-Konstrukts. Eine stabile Slot-Id im Datenmodell beseitigt
alles auf einmal. Braucht eine Migration — wird mit jeder weiteren Funktion teurer.
→ [code-review.md § 2](code-review.md)

> **Umgesetzt am 8. August 2026.** `PartItem.iid` ist die stabile Kennung; der
> Schlüssel lautet jetzt `"60|mid|part|k3f9x|0"` statt `"60|mid|part|2|1|0"`.
> Abschnitt und laufende Nummer sind weg — und damit die Ursache von T16.
>
> **Die Kennung sitzt am Punkt, nicht am Platz.** Ein Platz (`ni`) wird nur am
> Ende eines Punkts hinzugefügt oder entfernt (`togglePartner`), verschiebt sich
> also nie; Abschnitte bewegen sich gar nicht. Bewegt hat sich immer nur die
> laufende Nummer des Punkts — genau die ist raus.
>
> **Eine einzige Stelle entscheidet**: `slotTaskKey(item, …)` nimmt die Kennung,
> wenn es eine gibt, sonst die Position. Alles andere ruft nur noch dort an.
> Beide Formen sind an ihrer Länge unterscheidbar (fünf Felder gegen sechs).
>
> **Die Migration läuft beim Laden** (`migrateItemIds`), ist idempotent und
> verlustfrei: ein Punkt mit Kennung wird übersprungen, eine Bestätigung ohne
> passenden Punkt bleibt liegen. Erst werden die Bestätigungen in der Datenbank
> umbenannt, **dann** die Wochen gespeichert — bricht das Umbenennen ab, bleiben
> die Wochen ohne Kennung und der nächste Ladevorgang versucht es erneut.
> Andersherum wären die Bestätigungen verwaist.
>
> **`send-reminders` prüft beide Formen.** Zwischen dem Deploy des Clients und
> dem nächsten Laden einer Versammlung stehen dort noch Positions-Schlüssel;
> würde die Function nur die neue Form kennen, hielte sie in dieser Zeit jede
> Bestätigung für nicht vorhanden und erinnerte doppelt. `substitute` ist nicht
> betroffen — sein `parseKey` nimmt ausschließlich Hilfsdienst-Schlüssel, und
> die haben sich nicht geändert.
>
> **`shiftPartConfirmations`/`swapPartConfirmations` bleiben stehen**, betreffen
> aber nur noch Wochen ohne Kennungen (Demo, Vorlagen, noch nicht migriert). Bei
> einem Punkt mit Kennung finden sie keinen passenden Schlüssel und tun nichts.
> Sie zu löschen wäre verfrüht, solange es Wochen der alten Form gibt.
>
> **`Week.stub` bleibt nötig** — nur seine Begründung ist schmaler geworden: die
> **Woche** steht weiterhin vorn im Schlüssel, gelöst wurde die Position
> *innerhalb* der Zusammenkunft.
>
> 14 Tests in `src/data/t37.test.ts`, darunter die Gegenprobe am reinen
> Positions-Schlüssel: nach dem Einfügen zeigt er auf den neuen Punkt, während
> das Bibelstudium ohne Bestätigung dasteht — genau T16. Mit Kennung passiert
> das nicht.
>
> ✅ **`send-reminders` ist neu deployt** (8.8.2026, zusammen mit T40 und T30).
> Damit prüft der Versand beide Schlüsselformen; die Umstellung einer
> Versammlung geschieht beim nächsten Laden, ohne dass in der Zwischenzeit eine
> Bestätigung übersehen wird.

### T38 · `pid` verpflichtend, Name nur noch Anzeige 🏗 ✅ erledigt
Heute ersetzen **fünf** Mechanismen einen Fremdschlüssel: zwei Lade-Migrationen,
`renameInWeeks`, die Dubletten-Warnung, das Feld `dn` und ein serverseitiger
Rückweg Name → Konto. `FsInstance.leader` hat gar keine `pid`.
→ [code-review.md § 3.3](code-review.md)

> **Umgesetzt am 8. August 2026.** Der Umbau selbst kam schon mit **T57**: seither
> trägt jede Zuteilung einer echten Person ihre `pid`, und `gehoertZu`
> entscheidet daran. `FsInstance.lpid` kam mit **T31**. Beim Nachprüfen der
> verbliebenen fünf Mechanismen blieben zwei Stellen übrig, an denen der
> Fremdschlüssel seine Zusage brach — beide sind jetzt geschlossen:
>
> **1. Umbenennen erreichte nicht jeden Ort.** `renameInWeeks` lief nur über
> `item.names`. Die **Zusätzliche Klasse** (`item.aux`) und der **Ratgeber**
> (`meeting.auxRatgeber`) blieben auf dem alten Anzeigenamen stehen. Beide
> tragen `pid`, funktional stimmte also alles — auf dem Programmblatt der Klasse
> stand aber ein Name, den es nicht mehr gibt. Umbenennen und Lösen teilen sich
> jetzt einen Durchlauf (`mapPersonSlots`), der alle vier Orte kennt: Hauptsaal,
> Klasse, Ratgeber, Hilfsdienst.
>
> **2. Löschen ließ die `pid` stehen** — ein Fremdschlüssel ohne Ziel. Die
> Folgen waren still: `gehoertZu` entscheidet über die Id, fand niemanden mehr,
> und der Slot zählte nirgends (nicht in der Auslastung, nicht in den
> Konflikten, nicht in den Aufgaben). Legte der Planer dieselbe Person neu an,
> bekam sie eine neue Id und passte nie wieder dazu. `dropPersonPid` bzw.
> `fsDropPersonPid` lösen die Id jetzt und **lassen den Namen stehen** (so war
> es immer dokumentiert). Damit greift wieder der Namensweg: die Zuteilung
> verhält sich wie ein Altdatensatz und wird beim nächsten Laden erneut
> zugeordnet, sobald es wieder jemanden dieses Namens gibt.
>
> Gelöst wird **nur über die Id**, nicht über den Namen — sonst träfe es eine
> zweite Person desselben Anzeigenamens mit.
>
> Die verbliebenen drei Mechanismen sind **kein Mangel**, sondern haben ihren
> Grund: die beiden Lade-Migrationen sind einmalige Nachträge für Altdaten,
> `dn` ist ein Anzeige-Merkmal, und der serverseitige Rückweg Name → Konto ist
> seit T57 ein dokumentierter *Rückfall* (`userOf` fragt zuerst die `pid`).
>
> 13 Tests in `src/data/t38.test.ts`, einer im Reducer (die Verdrahtung, nicht
> nur die reine Funktion). Gegenprobe für beide Hälften einzeln gefahren.

### T39 · Schreibkonflikte zwischen Planern verhindern 🔧 ✅ erledigt
`saveWeek` schreibt die **komplette Woche** als JSONB-Upsert, ohne Locking und
ohne Versionsspalte. Zwei gleichzeitig planende Koordinatoren überschreiben sich
vollständig. Der README behandelt dieses Risiko ausführlich für den
**Offline**-Fall — online besteht es unverändert.

`updated_at` in `weeks`, beim Speichern mitschicken, bei Konflikt neu laden und
den Nutzer informieren.
→ [code-review.md § 3.7](code-review.md)

> **Umgesetzt am 8. August 2026** — genau so, mit drei Zusätzen, die sich beim
> Bauen als nötig erwiesen.
>
> [migration-016](../../supabase/migration-016-wochen-stand.sql) ergänzt
> `weeks.updated_at` und einen Trigger. **Der Trigger setzt den Stand, nicht der
> Client** — sonst könnte ein veralteter Client ihn mitliefern und sich an der
> Prüfung vorbeischreiben; die Sicherung säße auf der falschen Seite. Der Client
> erfindet den Wert nie: er reicht die Zeichenkette zurück, die PostgREST ihm
> gegeben hat, womit Genauigkeit und Zeitzone kein Thema sind.
>
> Ablauf in `saveWeek`: Stand unbekannt → einfügen (ein Unique-Verstoß heißt
> dann: ein anderer hat die Zeile angelegt, also Konflikt). Stand bekannt →
> Update mit Bedingung `updated_at = <Stand>`.
>
> **Zusatz 1 — nachsehen, bevor Alarm geschlagen wird.** Ein *falscher*
> Konfliktalarm verwirft die Arbeit des Nutzers. Trifft das geschützte Update
> keine Zeile, wird der Stand zuerst gelesen: steht dort noch der eigene, war
> niemand schneller, und es wird ungeschützt geschrieben. Der zusätzliche Umlauf
> kostet nur in dem Fall etwas, in dem sonst etwas verlorenginge.
>
> **Zusatz 2 — Schreibvorgänge je Position hintereinander.** Ohne das gingen
> zwei rasch aufeinanderfolgende Änderungen derselben Woche mit demselben Stand
> los, und die zweite meldete einen Konflikt gegen sich selbst.
>
> **Zusatz 3 — bei Konflikt wird alles neu geladen**, nicht nur die eine Woche:
> derselbe Weg wie beim Anmelden, also ohne zweite Zusammenbau-Logik, die
> auseinanderlaufen könnte. Konflikte sind selten; eine Handvoll Planer teilt
> sich eine Versammlung.
>
> **Der Text ist `toastSpeicherFehler`** („Änderung konnte nicht gespeichert
> werden — bitte neu laden"). Er trifft zu und liegt in allen 34 Sprachen
> gemessen vor. Ein eigener Wortlaut wäre schärfer, hieße aber 33 erfundene
> Übersetzungen — und eine erfundene ist schlimmer als eine zutreffende, die es
> schon gibt.
>
> 8 Tests in `src/lib/week-konflikt.test.ts` (Stand lernen und nachziehen,
> echter Konflikt, Unique-Verstoß, falscher Alarm, Serialisierung,
> Platzhalter, echter Schreibfehler). Gegenprobe: ohne die Stand-Bedingung
> fallen 4.
>
> ✅ **[migration-016](../../supabase/migration-016-wochen-stand.sql) ist
> eingespielt** (8.8.2026). `schema.sql` enthält sie für Neuinstallationen.
>
> ✅ **Im Betrieb nachgestellt** (8.8.2026): Speichern läuft durch. Damit greift
> der geschützte Weg gegen die echte Datenbank — Stand lesen, als Bedingung
> mitschicken, neuen Stand übernehmen. Der Vorbehalt zum Zeitstempel-Vergleich
> (Genauigkeit, Zeitzone, Kodierung in der Abfrage) ist damit ausgeräumt; er war
> der Grund für den Umweg über das Nachsehen vor dem Konfliktalarm, und den
> braucht es nun als Sicherung, nicht als Krücke.

### T40 · Geteilte Logik für Client und Edge Functions 🔧 ✅ erledigt
Viermal dupliziert: `meetingDayOffsets`, `displayName`, `taskDate`,
task_key-Bildung, `SKIP_ROLE`. Daraus entstand B8 (`send-reminders` nutzt den
Array-Index statt `position`, während `substitute` es richtig macht).

Gemeinsames `shared/`-Verzeichnis — oder mindestens ein Fixture-Test über beide
Seiten.
→ [code-review.md § 5.1](code-review.md)

> **Umgesetzt am 8. August 2026 — beides.**
>
> `supabase/functions/_shared/planung.ts` hält jetzt `SKIP_ROLE`/`isGuestRole`,
> `personDisplayName`, `taskDateText`, `meetingDayOffsets`, `DAY_OFFSET` und
> `WEEKDAY_OFFSET`. `send-reminders` und `substitute` binden sie ein; ihre
> eigenen Kopien sind weg. Der Unterstrich im Ordnernamen ist Absicht — die
> Supabase-CLI hält den Ordner sonst für eine eigene Function.
>
> Dazu `src/data/edge-parity.test.ts`: er bindet **beide** Seiten ein und
> vergleicht sie an denselben Eingaben (Anzeigename inkl. der Randfälle „nur
> Nachname" und „leerer dn", sieben Schreibweisen der Zusammenkunftszeiten,
> externe Rollen, Termin-Zuschnitt, beide Schreibweisen des Samstags). Der Test
> ist der eigentliche Schutz: eine geteilte Datei kann man wieder auseinander
> kopieren, ein Vergleich fällt auf.
>
> **Zwei Dinge dazu — beide am 8.8.2026 erledigt:**
> 1. ✅ **Beide Functions sind neu deployt.** Bis dahin liefen sie mit ihren
>    alten Kopien — funktional identisch, aber die Zusammenführung war erst
>    danach real.
> 2. ✅ **Die CLI bündelt `_shared/` mit** — nachgewiesen, nicht angenommen:
>    `send-reminders` antwortet ohne Secret mit einem schlichten `Unauthorized`
>    (401), und das kommt aus dem Handler (`index.ts:452`), der erst läuft, wenn
>    das Modul samt `import … from '../_shared/planung.ts'` geladen ist. Fehlte
>    die Datei im Bündel, käme ein Boot-Fehler. Der Unterschied ist am
>    Antwortformat erkennbar: die **Plattform** meldet JSON
>    (`UNAUTHORIZED_NO_AUTH_HEADER`, so bei `substitute`, siehe T11), der
>    **Code** Klartext. Der Ausweichplan (Datei in beide Ordner kopieren) wird
>    damit nicht gebraucht.

### T41 · `AppState` aufteilen 🏗 ✅ erledigt — alle drei Schritte
~60 Felder mischen Serverdaten, UI-Zustand und Gerätevorlieben; der Context hat
keine Selektoren, also rendert jede Änderung alles neu. Eine Aufteilung in drei
Kontexte macht `readonly.ts` und einen Teil von `persist.ts` überflüssig.
→ [code-review.md § 4.3](code-review.md)

> **Am 8. August 2026 umgesetzt, in zwei Anläufen.** Zuerst die beiden
> Vorarbeiten, danach — mit eigenem Sicherheitsnetz — die Selektoren:
>
> **1. Zustand und Versand liegen in getrennten Kontexten.** `dispatch` ist über
> die ganze Sitzung dieselbe Funktion, das gemeinsame Objekt aber nicht: jede
> Zustandsänderung erzeugte ein neues und rief damit auch die Bausteine auf den
> Plan, die gar nichts lesen, sondern nur auslösen. `useAppDispatch()` rendert
> jetzt nicht mehr mit; `useApp()` gibt es unverändert weiter (41 Bausteine
> nutzen es). Vier Bausteine sind umgestellt: `S89Sheet`, `RecoveryScreen`,
> `AutoAssignPanel`, `FsPlan`.
>
> **2. Die Felder sind nach Zuständigkeit gruppiert** — Ansichtszustand,
> Gerätevorlieben, Sitzung, Serverdaten, Abgeleitetes. Das ist nicht Kosmetik:
> die Gruppe sagt bei jedem Feld, ob eine Änderung gespeichert werden muss
> (`persist.ts`), ob sie offline erlaubt ist (`readonly.ts`) und ob sie in die
> Momentaufnahme gehört. Bisher stand das nirgends und musste je Feld erraten
> werden — und genau daran hängt der Rest.
>
> 4 Tests in `src/app/context.test.tsx` messen die Rendezahl. Gegenprobe:
> hängt man `useAppDispatch` wieder an den Zustands-Kontext, fällt einer. Der
> erste Testlauf fiel übrigens auf die eigene Bühne herein — ein bei jedem
> Render neu erzeugtes `vi.fn()` ist ein anderer Kontextwert und hätte die
> Trennung genau um das gebracht, was sie leisten soll.
>
> ---
>
> **3. Die Selektoren.** Wer den Zustand liest, rendert bei jeder Änderung neu —
> daran ändert eine Kontext-Trennung nichts, React verteilt Kontexte ganz oder
> gar nicht. `useAppSelector(fn)` geht am Kontext vorbei: der Provider hält den
> Zustand ohnehin schon in einer Referenz (`stateRef`), gibt sie über einen
> dritten Kontext als Speicher nach außen und weckt nach jedem `dispatch` die
> Abonnenten. `useSyncExternalStore` liest daraus und weckt einen Baustein nur,
> wenn sich **sein** Ausschnitt geändert hat.
>
> **Zuerst das Netz, dann der Umbau.** Der Grund für den früheren Aufschub war,
> dass es keinen Test für Render-Verhalten gab; die 11 neuen in
> `context.test.tsx` messen genau das — Renderzahlen, an der Hand-Bühne und am
> echten Provider. Erst danach wurde umgestellt.
>
> **Umgestellt wurde einer: `useT`.** Und das ist der Punkt. Der Hook liest
> genau zwei Felder, `lang` und `congLang` — **44 Bausteine hängen an ihm**.
> Über `useApp()` rief jede Aktion, gleich welche, sie alle auf den Plan: ein
> Tastendruck in einem Personenfeld rendert die halbe Anwendung neu, obwohl
> sich an keiner Übersetzung etwas geändert hat. Zwei Selektoren auf zwei
> einfache Werte beenden das. Die übrigen 42 Aufrufer von `useApp()` bleiben,
> wie sie sind: sie lesen breit, und ein Selektor darauf wäre eine Umschreibung
> ohne Gewinn.
>
> **Zwei Dinge fielen beim Bauen auf:**
>
> 1. **Die Wochen-Vorschau überschreibt den Zustand** (`WeekStrip.Vorschau`
>    zeigt die Nachbarwochen). Mit Selektoren reicht der Kontext dafür nicht
>    mehr — derselbe Baustein läse die Nachbarwoche über `useAppState` und die
>    aktuelle über `useAppSelector`: **zwei Wochen gleichzeitig in einer
>    Ansicht**, und nichts würde werfen. `useStaticStore(zustand)` überschreibt
>    jetzt beides; `WeekStrip.test.tsx` prüft, dass die drei Wochen des
>    Streifens auf beiden Lesewegen dieselben sind.
> 2. **Die Objekt-Falle.** Ein Selektor, der bei jedem Aufruf ein neues Objekt
>    baut, sieht für React immer geändert aus. Ohne Vergleich läuft das in eine
>    Endlosschleife („The result of getSnapshot should be cached") — im Test
>    nachgestellt und mit `flachGleich` behoben.
>
> Beide Wege bleiben nebeneinander gültig und werden im **selben Commit**
> aktualisiert; ein Test am echten Provider hält fest, dass Kontext-Leser und
> Selektor-Leser nie verschiedene Stände sehen.
>
> Der Nebensatz des Befunds — „macht `readonly.ts` überflüssig" — trifft
> übrigens nicht zu: `readonly.ts` führt eine **Positivliste** der reinen
> Ansichts-Aktionen, damit eine neu hinzugefügte Aktion automatisch als
> Schreibzugriff gilt. Diese Sicherung hängt an den Aktionen, nicht an der Form
> des Zustands, und bliebe auch nach einer Aufteilung nötig.

### T42 · `noUncheckedIndexedAccess` schrittweise 🏗 ✅ erledigt — Produktionscode vollständig
213 Treffer, konzentriert genau in den Wochen-Dateien (`translate.ts` 48,
`meeting-edit.ts` 37, `planning.ts` 31). Die Regel, die zum Datenmodell passt —
und die T1 verhindert hätte.

> **Umgesetzt am 8. August 2026 — „schrittweise" wörtlich genommen.**
>
> Gemessen waren es **965** Meldungen in 57 Dateien, davon 232 in 23
> Produktionsdateien. Auf einen Schlag ist das nicht zu machen, ohne die
> Prüfung mit `!` zu entwerten.
>
> **18 der 23 Produktionsdateien sind aufgeräumt** — jede Stelle einzeln
> angesehen, nichts pauschal weggeworfen: `demo.ts`, `fs.ts`, `helpers.ts`,
> `localize.ts`, `meeting-dates.ts`, `kandidaten.ts`, `AssignSheet`,
> `PlanenScreen`, `MeetingSection`, `ProfilScreen`, `ProgrammScreen`,
> `useDialogFocus`, `useSwipeDown`, `useSwipeWeek`, `meeting-times.ts`,
> `bible-books.ts`, `translate-data.ts`, `lib/data.ts` — dazu
> `_shared/planung.ts`. Offen blieben fünf: `translate.ts` (48),
> `meeting-edit.ts` (39), `planning.ts` (33), `persist.ts` (25),
> `reducer.ts` (16) — **inzwischen erledigt, siehe unten.**
>
> **Die Sperrklinke ist der eigentliche Punkt.** `npm run typecheck:index`
> läuft mit der Regel und hält das Ergebnis gegen
> `scripts/index-access-baseline.json` — je Datei die Zahl der noch geduldeten
> Meldungen. Der Lauf schlägt an, wenn eine Datei **mehr** bekommt oder eine
> **neue** hinzukommt; wird aufgeräumt, bittet er darum, die Grundlinie
> nachzuziehen. **Die Zahl kann damit nur fallen**, und neue Dateien halten die
> Regel von Anfang an ein. In der CI vor `npm test`.
>
> **Warum keine zweite tsconfig mit `exclude`:** ausprobiert und verworfen —
> TypeScript zieht ausgeschlossene Dateien über Importe trotzdem herein,
> `exclude` steuert nur die Wurzelliste. Eine Grundlinie ist der einzige Weg zu
> echter Datei-Granularität.
>
> Auch `incremental` ist bewusst aus: mit Cache meldete der zweite Lauf weniger
> als der erste, und eine Grundlinie, die vom Cache abhängt, ist keine.
>
> Gegenprobe gefahren: eine Wegwerf-Datei mit `xs[0].toUpperCase()` angelegt →
> der Lauf schlägt an und nennt sie.

> **Die letzten fünf — erledigt.** Damit halten **alle 23 Produktionsdateien**
> die Regel ein. Die Grundlinie stand danach bei **731 Meldungen in 34 Dateien,
> alle davon Testdateien** (vorher 892 in 39); heute sind es 727 — T66 hat die
> Ladefenster-Tests von Positionen auf Datumsangaben umgestellt und dabei vier
> Index-Zugriffe mitgenommen.
>
> Es war keine Typkosmetik. Jede der fünf Dateien griff auf Indizes zu, die ins
> Leere zeigen können, und warf dann — **im Reducer**, also mit der ganzen
> Ansicht im Schlepptau. 20 neue Tests halten das fest; 17 davon fallen ohne
> die jeweilige Korrektur, durchweg mit „Cannot read properties of undefined".
>
> **Die drei wiederkehrenden Muster und ihre Antwort:**
>
> | Muster | Wo | Antwort |
> | --- | --- | --- |
> | `saveWeek(congId, wi, weeks[wi])` | persist.ts, 25× | `wocheSpeichern`/`fsWocheSpeichern`/`wochePlanen` — kein Index, kein Schreiben. `saveWeek` liest als Erstes `week.stub`; `undefined` warf mitten im Dispatch. |
> | `weeks[wi][tab].sections[si].items[ii]` | meeting-edit.ts, planning.ts | `stelle(weeks, wi, tab, si)` liefert Woche, Zusammenkunft und Punkte in einem Griff — oder nichts. Bricht die Kette, bleiben die Wochen **unverändert**: dieselbe Antwort wie auf jede andere unmögliche Bearbeitung. |
> | `m[1]` aus einem Regex-Treffer | translate.ts, ~40× | `g(m, i)`. Alle Gruppen dort sind Pflichtgruppen; vierzigmal `?? ''` hätte die Stellen, an denen wirklich etwas fehlen kann, unter Rauschen begraben. |
>
> **Drei Befunde, die erst beim Aufräumen sichtbar wurden:**
>
> 1. **Der Wochentag war nie geprüft.** `datumsRegel` fing den unbekannten
>    *Monat* ab (das war die T1-Korrektur) — der Wochentag ging daneben
>    ungeprüft aus `WD[m[1]]` in `Intl`. Dass Ausdruck und Tabelle
>    übereinstimmen, ist eine Verabredung zwischen zwei Dateien, und genau ihr
>    Auseinanderlaufen *war* T1. Jetzt schlagen `tagDatumRegel`, `tagZeitRegel`
>    und `monatsRegel` **vor** dem Formatieren nach und lassen die Regel ganz
>    aus, wenn eine Tabelle den Namen nicht kennt.
> 2. **Auch die Namenslisten der Sprache konnten Lücken haben** (`L.wd[i]`,
>    `L.mon[i]` — kein Test prüfte ihre Länge). `translate-luecke.test.ts`
>    kürzt sie über einen Mock und weist nach, was ohne die Korrektur
>    herauskommt: **„undefined, January 8"** und **„Monday, undefined 8"** —
>    die T1-Signatur, diesmal aus einem Pflegefehler statt aus einer
>    Tabellendifferenz.
> 3. **`assignSlot` gab bei einem fehlenden Punkt einen frischen Klon zurück**
>    statt der Eingabe. Reducer und `persist.ts` entscheiden über die
>    *Identität*, ob gespeichert werden muss — ein gleicher, aber neuer Klon
>    löste ein Schreiben ohne Änderung aus. Aufgefallen ist das am eigenen
>    Test, nicht am Compiler.
>
> Nebenbei: `shiftPartConfirmations` läuft jetzt über `Object.entries` statt
> über `Object.keys` + Nachschlag. Der Nachschlag war sicher — aber nur durch
> ein Argument; jetzt trägt ihn die Struktur.
>
> **Offen bleiben die 34 Testdateien.** Dort ist ein `undefined` ein roter
> Test, kein Absturz beim Planer; der Nutzen steht nicht im Verhältnis zum
> Umbau. Die Sperrklinke hält den Stand, die Zahl kann nur fallen.

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

Stand 8. August 2026 · ☑ erledigt · ⛔ geprüft, kein Mangel · ⚠ teilweise · ☐ offen

Phase 0 ☑☑☑☑ · Phase 1 ☑☑☑ · Phase 2 ☑☑☑⛔ · Phase 3 ☑☑☑☑ ·
Phase 4 ☑☑☑☑☑☑☑☑ · Phase 5 ☑☑☑☑⛔ · Phase 6 ☑☑☑☑☑☑☑☑☑☑ · Phase 7 ☑☑☑☑☑☑☑☑☑ ·
Phase 8 ☑☑☑☑☑☑☑☑☑☑ · Phase 9 ☑☑☑☑ · Nachgetragen ☑☑☑☑☑☑

**65 umgesetzt, 3 als „kein Mangel" begründet zurückgewiesen, 1 neu
aufgenommen und offen (T63, vom Betreiber zurückgestellt).** **T66** — der
strukturelle Mangel, den T65 ans Licht gebracht hat — ist in drei Stufen
erledigt: eine Woche ist ihr Datum, nicht ihre Nummer. **T65** hat beim Messen
zwei weitere Fehler aufgedeckt und mitgenommen (siehe dort).
Der Testbestand ist von 727 auf 1514 gewachsen; jede Korrektur hat einen Test,
der ohne sie rot wird — bei jeder einzeln nachgewiesen, indem die Korrektur
zurückgenommen und der Testlauf wiederholt wurde.

> **Am 8. August 2026 erledigt, erste Runde:** T32, T33, T34 (F4/F7/F8), T35,
> T36, T40. Dabei zurückgewiesen: **F12** (Leser braucht keine Trennung nach
> Zusammenkunft). Neu aufgenommen: **T61**.
>
> **Am 8. August 2026 erledigt, zweite Runde — die verbliebenen acht:**
> **T61** (Einfügestelle am Leser-Slot), **T29** (eigener Redner umschaltbar),
> **T39** (Stand je Woche gegen Schreibkonflikte), **T30** (Sonderwochen als
> *eine* Abweichung), **T38** (Fremdschlüssel hält), **T37** (Bestätigung am
> Programmpunkt statt an seiner Position), **T42** (Sperrklinke für
> `noUncheckedIndexedAccess`, 18 von 23 Produktionsdateien sauber) und **T41**
> zur Hälfte (Kontexte getrennt, Felder gruppiert — Selektoren stehen aus).
>
> **Am 8. August 2026, dritte Runde:** die letzten fünf Produktionsdateien von
> **T42** — `translate.ts`, `meeting-edit.ts`, `planning.ts`, `persist.ts`,
> `reducer.ts`. Der Produktionscode hält die Regel jetzt vollständig ein; die
> Grundlinie fiel von 892 auf 731, und was übrig ist, steht ausnahmslos in
> Testdateien. Dabei drei Befunde: der **Wochentag** war in den Datumsregeln
> nie geprüft, die **Namenslisten der Sprachen** konnten Lücken haben, und
> **`assignSlot`** löste bei einem fehlenden Punkt ein Schreiben ohne Änderung
> aus.
>
> **Und der dritte Schritt von T41:** `useAppSelector` über
> `useSyncExternalStore`. Zuerst 11 Tests, die Renderzahlen messen — das Netz,
> dessen Fehlen der Grund für den Aufschub war —, dann `useT` umgestellt: zwei
> Felder statt des ganzen Zustands, und **44 Bausteine** hören auf, bei jeder
> fremden Aktion mitzurendern. Dabei aufgefallen: die Wochen-Vorschau muss den
> Speicher mit überschreiben, sonst zeigte ein Baustein zwei Wochen zugleich.
>
> Dabei aufgefallen und gleich mitgebaut: **T62** (Kreisaufseher-Woche —
> Dienstvortrag, verkürztes Wachtturm-Studium, Schlussvortrag). Neu
> aufgenommen und vom Betreiber zurückgestellt: **T63**.
>
> **Beim Nachziehen des Designs aufgefallen und ausgeschrieben: T64.** Der
> Kreisaufseher-Schalter steht im Panel einer Zusammenkunft, ändert aber beide.
> Daraus wurde die Regel — ein Bedienelement gehört auf die Ebene, die es
> verändert — und daraus der **Anlass der Woche** samt Termin, ein **vierter
> Reiter** als sein Ort, und drei kleine Korrekturen aus T62 (eigene Sektion für
> den Schlussvortrag, sein gemessener Titel, der Abstand am Schalter).

### Was offen ist und warum

> **Der Deploy ist erledigt** (7. August 2026): `substitute` und
> `send-reminders` laufen in der Fassung des Repos. Alles, was bis dahin nur
> geschrieben, aber nicht in Betrieb war — T9/T10/T24, T8/T12/T14 und die
> Treffpunkt-Erinnerungen aus T31 —, ist damit scharf.

| | Aufgabe | Warum offen |
| --- | --- | --- |
| **Phase 7** | T42 (Testdateien) | Der Produktionscode ist vollständig sauber (alle 23 Dateien). Die restlichen 727 Meldungen stehen in 34 Testdateien — dort ist ein `undefined` ein roter Test, kein Absturz beim Planer. Die Sperrklinke hält den Stand. |
| **Phase 6** | T63 | Neu. Die übrigen Termine der Dienstwoche — vom Betreiber ausdrücklich zurückgestellt. |

> ✅ **Beim Betreiber erledigt (13. August 2026)** — T64, T65 und T66 sind
> vollständig scharf:
>
> 1. **[migration-018](../../supabase/migration-018-position-entfaellt.sql) ist
>    eingespielt** → `position` ist aus `weeks` und `fs_weeks` gelöscht, die
>    verbliebenen Positions-`task_key` sind auf die Kennung gehoben. Damit gibt
>    es die Ordnungszahl als Identität nirgends mehr (T66).
> 2. **`import-week` ist neu deployt** → die Woche des Gedächtnismahls wird
>    erkannt und angelegt (T65). `send-reminders` und `substitute` liefen schon
>    aus der Runde davor.
>
> Reihenfolge eingehalten: erst der Seiten-Deploy (T66 Stufe 3), dann die
> Migration. Andersherum hätte der noch laufende Client `select position, data`
> geholt und gar nichts mehr bekommen.

> ✅ **Beim Betreiber erledigt (8. August 2026)** — damit ist alles aus dieser
> Runde scharf:
>
> 1. **[migration-016](../../supabase/migration-016-wochen-stand.sql) ist
>    eingespielt** → `weeks.updated_at` samt Trigger steht, der Schutz gegen
>    Schreibkonflikte greift (T39).
> 2. **`send-reminders` und `substitute` sind neu deployt** → geteilte Regeln
>    (T40), Verlegung und Ausfall (T30), Schlüssel über die stabile Kennung
>    (T37).
>
> **Dabei nachgewiesen, was vorher offen war:** die Supabase-CLI bündelt
> `_shared/` mit. `send-reminders` antwortet ohne Secret mit einem schlichten
> `Unauthorized` (401) — das kommt aus dem Handler, der erst nach dem Laden des
> Moduls samt Import läuft. Die Plattform meldet dagegen JSON
> (`UNAUTHORIZED_NO_AUTH_HEADER`, so bei `substitute`). Am Antwortformat lässt
> sich also unterscheiden, ob eine Function überhaupt hochgekommen ist —
> nützlich bei jedem künftigen Deploy.
>
> **Und im Betrieb nachgestellt:** Speichern läuft durch. Das belegt zweierlei
> auf einmal — den geschützten Schreibweg aus T39 gegen die echte Datenbank,
> und dass der Ladepfad samt der T37-Migration (`migrateItemIds`) durchgelaufen
> ist; wäre sie gescheitert, hätte es gar nicht erst bis zum Speichern gereicht.
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
