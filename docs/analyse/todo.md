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
> ⚠ **Offen geblieben:** Die Kreisaufseher-Woche setzt weiterhin nur den Chip
> (`week.co`); **„Dienstvortrag statt Versammlungsbibelstudium" tauscht den
> Programmpunkt nicht aus.** Das ist ein Eingriff in den importierten Ablauf,
> kein Terminthema, und braucht die Vorlage des Dienstvortrags — dafür fehlt
> die fachliche Vorgabe (Titel, Dauer, Slots). Als eigener Punkt notiert.

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

### T34 · Weitere fachliche Punkte 🔧
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

### T62 · Kreisaufseher-Woche: Dienstvortrag statt Versammlungsbibelstudium 🏗
Beim Umsetzen von T30 aufgefallen, **nicht** mit erledigt (eigener Punkt, damit
er nicht untergeht): `week.co` setzt weiterhin nur den Chip. Der Ablauf bleibt
unverändert — das Versammlungsbibelstudium steht dort, wo in der Dienstwoche
der Dienstvortrag des Kreisaufsehers gehört.

Das ist kein Terminthema (T30 deckt Verlegung und Ausfall ab), sondern ein
Eingriff in den importierten Ablauf: ein Punkt wird ersetzt, mit eigenem Titel,
eigener Dauer und eigenen Plätzen. **Vor der Umsetzung zu klären:**

- Wie heißt der Punkt (kanonisch deutsch, damit ihn `translate-data.ts` fassen
  kann)? „Dienstvortrag" steht dort bereits in allen Sprachen.
- Wie lang ist er, und verschiebt sich dadurch das Ende der Zusammenkunft?
- Welche Plätze hat er — nur den Kreisaufseher (extern, wie `Gastredner`), oder
  auch einen Leser?
- Was passiert mit den Zuteilungen des ersetzten Bibelstudiums? Nach dem Muster
  von T30 sollten sie stehen bleiben und nur nicht zählen.

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

> **Umgesetzt am 8. August 2026** — genau so, plus eine Schranke: eine Zeile mit
> einer Position außerhalb des geladenen Fensters wird ausgelassen statt an
> falscher Stelle gezeigt. Zwei Tests in `data-load.test.ts` halten es fest
> (Lücke in der Mitte, Lücke am Anfang des Fensters); ohne die Änderung fallen
> beide.

### T36 · Wochenabstand aus `week.start` statt aus dem Index 🔧
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

### T40 · Geteilte Logik für Client und Edge Functions 🔧
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

### T41 · `AppState` aufteilen 🏗 ⚠ teilweise — Selektoren stehen aus
~60 Felder mischen Serverdaten, UI-Zustand und Gerätevorlieben; der Context hat
keine Selektoren, also rendert jede Änderung alles neu. Eine Aufteilung in drei
Kontexte macht `readonly.ts` und einen Teil von `persist.ts` überflüssig.
→ [code-review.md § 4.3](code-review.md)

> **Am 8. August 2026 zur Hälfte umgesetzt — und die andere Hälfte bewusst
> nicht.** Was gemacht ist:
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
> **Was aussteht: die Selektoren.** Wer den Zustand liest, rendert weiterhin bei
> jeder Änderung neu — daran ändert eine Kontext-Trennung nichts, React verteilt
> Kontexte ganz oder gar nicht. Der Weg dahin ist `useSyncExternalStore`: der
> Provider hält den Zustand in einer Referenz und benachrichtigt Abonnenten,
> `useAppSelector(fn)` weckt nur, wenn sich der gewählte Ausschnitt ändert.
>
> **Bewusst nicht heute gemacht.** Es rührt an den Kern von 45 Bausteinen, und
> es gibt keinen einzigen Test, der Render-Verhalten im Zusammenspiel prüft —
> eine falsch gesetzte Abhängigkeit fällt dort nicht auf, sondern erst im
> Betrieb als veraltete Anzeige. Die beiden Schritte oben sind die Vorarbeit
> dafür und für sich genommen richtig; der dritte gehört in eine eigene Sitzung
> mit einem eigenen Sicherheitsnetz.
>
> Der Nebensatz des Befunds — „macht `readonly.ts` überflüssig" — trifft
> übrigens nicht zu: `readonly.ts` führt eine **Positivliste** der reinen
> Ansichts-Aktionen, damit eine neu hinzugefügte Aktion automatisch als
> Schreibzugriff gilt. Diese Sicherung hängt an den Aktionen, nicht an der Form
> des Zustands, und bliebe auch nach einer Aufteilung nötig.

### T42 · `noUncheckedIndexedAccess` schrittweise 🏗 ✅ erledigt (Sperrklinke steht, Rest folgt)
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
> `_shared/planung.ts`. Offen sind fünf: `translate.ts` (48),
> `meeting-edit.ts` (39), `planning.ts` (33), `persist.ts` (25),
> `reducer.ts` (16).
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
Phase 4 ☑☑☑☑☑☑☑☑ · Phase 5 ☑☑☑☑⛔ · Phase 6 ☑☑☑☑☑☑☑ · Phase 7 ☑☑☑☑☑☑⚠☑ ·
Phase 8 ☑☑☑☑☑☑☑☑☑☑ · Phase 9 ☑☑☑☑ · Nachgetragen ☑☑☑☑☑☑

**60 umgesetzt, 3 als „kein Mangel" begründet zurückgewiesen, 1 teilweise
(T41), 1 neu aufgenommen (T62).**
Der Testbestand ist von 727 auf 1335 gewachsen; jede Korrektur hat einen Test,
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
> Dabei aufgefallen und neu aufgenommen: **T62** (Dienstvortrag statt
> Versammlungsbibelstudium in der Kreisaufseher-Woche).

### Was offen ist und warum

> **Der Deploy ist erledigt** (7. August 2026): `substitute` und
> `send-reminders` laufen in der Fassung des Repos. Alles, was bis dahin nur
> geschrieben, aber nicht in Betrieb war — T9/T10/T24, T8/T12/T14 und die
> Treffpunkt-Erinnerungen aus T31 —, ist damit scharf.

| | Aufgabe | Warum offen |
| --- | --- | --- |
| **Phase 7** | T41 (Selektoren) | Zwei von drei Schritten sind gemacht. Der dritte — `useSyncExternalStore` mit Selektoren — rührt an den Kern von 45 Bausteinen, und es gibt keinen Test, der Render-Verhalten im Zusammenspiel prüft. Gehört in eine eigene Sitzung mit eigenem Sicherheitsnetz. |
| **Phase 7** | T42 (Rest) | Fünf Produktionsdateien und 34 Testdateien tragen noch Meldungen. Die Sperrklinke hält den Stand; die Zahl kann nur fallen. |
| **Phase 6** | T62 | Neu, fachliche Vorgabe fehlt (Titel, Dauer, Slots des Dienstvortrags). |

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
