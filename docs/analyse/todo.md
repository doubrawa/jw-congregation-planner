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

### T33 · Schlusslied nachtragbar machen ⚡ ✅ erledigt · Rest ⛔ gemessen, kein Wort
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
> ⛔ **Gemessen am 17. August 2026 — es gibt kein durchgängiges Wort.** Der
> Auftrag lautete, die 32 Wortlaute an jw.org zu messen. Die Messung ist
> gelaufen, vollständig und an einer echten Parallelquelle; sie trägt nicht.
> `SONG_WORD` bleibt, jetzt aus Beleg statt aus Verlegenheit.
>
> **Die Quelle taugte.** Nicht die S-38-Anweisungen — die sagen „Die
> Zusammenkunft endet mit Lied und Gebet" und kennen den Begriff gar nicht —,
> sondern das **2018er Kongressprogramm** (`CO-pgm18`, Sonntag), dort als
> Programmpunkt „15.50 Schlusslied und Gebet". Es ist die beste erreichbare
> Parallelquelle: **eine** Dokumentkennung, die WOL in **jeder** Sprache
> ausliefert (`wol.jw.org/<lang>/wol/d/r<N>/lp-<lib>/1102018403`, die
> `r`/`lp`-Paare stehen in der Bibliotheksliste `/de/wol/li/r10/lp-x`). Alle
> 34 Fassungen geholt, alle 200.
>
> **Und daran scheitert es**, an derselben Stelle wie „entfällt" in T30: Der
> Programmpunkt nennt Lied **und** Gebet, das Wort für „Schluss" gehört mal
> allein dem Lied, mal beiden zusammen.
>
> | Trennbar (26) | Zeile → Begriff |
> | --- | --- |
> | de en pt nl ru uk cs sk hr sr bg hu el tr sv da fi no tl sw zh ja ko he fa ur | „Closing Song and Prayer" → `Closing Song`; „Zaključna pesma i molitva" → `Zaključna pesma`; „結びの歌と祈り" → `結びの歌`; „Loppulaulu ja -rukous" → `Loppulaulu` |
>
> | Nicht trennbar (8) | gemessene Zeile | was ein Schnitt ergäbe |
> | --- | --- | --- |
> | **fr** | Cantique et prière | — **kein Schlusswort im Text** |
> | es | Canción y oración de conclusión | „Canción" (bloß „Lied") |
> | it | Cantico e preghiera conclusivi | „Cantico" — `conclusivi` steht im Plural für beide, der Singular wäre erfunden |
> | ro | Cântarea și rugăciunea de încheiere | „Cântarea" |
> | pl | Pieśń i modlitwa końcowa | „Pieśń" |
> | id | Nyanyian dan Doa Penutup | „Nyanyian" |
> | vi | Bài hát và cầu nguyện kết thúc | „Bài hát" |
> | ar | الترنيمة والصلاة الختامية | „الترنيمة" |
>
> **Französisch entscheidet die Sache.** Für die sieben anderen ließe sich der
> richtige Alleinstand grammatisch herleiten — das wäre schon Erfindung mit
> Anlauf. Französisch gibt gar nichts her: Die Publikationen kennen
> nebeneinander „cantique final" (33 Treffer als exakte Wendung, durchweg
> erzählend: *„entonner le cantique final"*), „cantique de conclusion" und
> „cantique de clôture". Vier Kandidaten sind kein gemessenes Wort, sondern
> eine Auswahl — und die zu treffen ist genau das, was hier nicht passieren
> soll.
>
> **Der bestehende Weg ist der gemessene.** Die Panel-Überschrift `ABSCHLUSS`
> liegt in allen 34 Sprachen gemessen vor (`CONCLUSION` · `CONCLUSIÓN` ·
> `الختام` · `סיום`) und steht direkt über dem Feld; darunter das ebenfalls
> gemessene `SONG_WORD`. Beide Hälften sind belegt — nur eben getrennt, so wie
> der Schalter in T30 den Namen der Zusammenkunft trägt, statt „entfällt" zu
> erfinden.
>
> **Wer es erneut versucht, fängt hier an:** Die Kennung `1102018403` ist
> sprachunabhängig, die Sprachliste steht oben. Zu suchen wäre eine Quelle, die
> das Schlusslied **allein** nennt — im Kongressprogramm steht es nie ohne das
> Gebet.
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

### T63 · Die übrigen Termine der Dienstwoche 🏗 ✅ erledigt
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

> **Fachlich geklärt (Betreiber, 17. August 2026).** Vier Fragen gestellt, vier
> beantwortet — und drei davon schneiden den Punkt kleiner, als er aussah:
>
> | Frage | Entscheidung | Folge |
> | --- | --- | --- |
> | Zuschnitt | **eine allgemeine Terminart**, nicht zwei feste Sonderfälle | wie T30: eine Aussage statt einer Sammlung. Pionier- und Ältestenbesprechung sind nur zwei Ausprägungen |
> | Teilnehmerkreis | **alle sehen alles** | kein Pionier-Merkmal, keine Migration, keine Rechteprüfung |
> | Zuteilung | **nur Ankündigung** | kein `task_key`, keine Bestätigung, keine Erinnerung, keine Ersatzsuche — der Termin fasst die Aufgaben-Maschinerie nicht an |
> | Treffpunkte | **etwas anderes fehlt** (siehe unten) | nicht der Termin, sondern der Leiter |
>
> **Zuerst geprüft, was schon geht — ein Drittel des Punktes war bereits da.**
> `FsInstance` trägt Tag, Zeit, Ort und Leiter **je Woche**; `fsInstUpdate`
> ändert Zeit und Ort für genau eine Woche, `fsInstAdd`/`fsInstRemove` fügen
> hinzu und nehmen weg — der Kommentar in `FsPlan.tsx` nennt „z. B.
> Pioniertage" ausdrücklich als Zweck. Die „abweichenden Zeiten der
> Dienstwoche" aus der Tabelle oben brauchen also nichts Neues. Nicht direkt
> umstellbar ist allein der **Wochentag** (heute nur über Entfernen und
> Neuanlegen); das war dem Betreiber nicht der fehlende Punkt.
>
> #### Was zu bauen ist — A: der Termin
>
> `Week.termine`: eine Liste je Woche, jeder Eintrag mit Bezeichnung
> (Freitext), Wochentag, Uhrzeit und Ort. Sichtbar für alle, ohne Bearbeiter.
> Der Ort ist der Wochen-Reiter aus T64 (`WochePanel`) — dieselbe Ebene, die
> auch den Anlass trägt, nach derselben Regel: ein Bedienelement gehört auf die
> Ebene, die es verändert.
>
> Die Bezeichnung **bleibt unübersetzt**, wie `Abweichung.reason`: es sind die
> Worte des Planers. Damit braucht die Bedienung fast nichts Neues —
> `a11yWeekday`, `a11yTime`, `fsOrtPh`, `hinzufuegen`, `entfernen` liegen alle
> gemessen vor.
>
> ✅ **Teil A umgesetzt am 17. August 2026.** `Week.termine` hält die Liste,
> `data/termine.ts` die Logik (anlegen, ändern, entfernen, Reihenfolge). Die
> Bedienung steht im Wochen-Reiter unter dem Anlass — dieselbe Ebene, dieselbe
> Regel wie T64. Angezeigt wird sie im Programm **über** den Reitern, denn ein
> Termin gehört zu keiner der drei Zusammenkünfte, sondern zur Woche; damit
> sieht ihn jeder, auf jedem Reiter.
>
> **Die Wortfrage hat sich erledigt, ohne einen neuen Schlüssel.** Für das
> Bezeichnungsfeld trägt `nameLbl` („Name") — es *ist* der Name des Termins.
> Der Rest kommt aus geprüften Bausteinen: `a11yWeekday`, `a11yTime`,
> `fsOrtPh`, `hinzufuegen`, `a11yRemove`, für „kein Tag" ein Gedankenstrich,
> und die Wochentage aus `Intl` statt aus 34 Wörterbüchern. Eine Überschrift
> braucht der Block nicht: Er steht im Panel des Anlasses, dem er ohnehin
> gehört.
>
> **Übersetzt wird nur, was gemessen vorliegt.** Die Bezeichnung und der Ort
> sind die Worte des Planers und bleiben stehen — wie `Abweichung.reason`. Im
> Browser auf Japanisch nachgestellt: `木曜日 · 19:00 · Pionierbesprechung ·
> Königreichssaal`. Der Wochentag wechselt, der Rest nicht, und genau so ist es
> gemeint.
>
> **Zwei Entscheidungen, die erst beim Bauen auffielen:**
>
> - **Sortiert wird beim Lesen, nicht beim Schreiben** (`termineVon`). Spränge
>   die Zeile schon beim Eintippen des Tages an ihren Platz, verlöre das Feld
>   darunter den Fokus mitten in der Eingabe. `fsSort` darf es beim Schreiben
>   tun, weil dort Zeit und Ort aus fertigen Auswahlfeldern kommen.
> - **Der letzte Termin nimmt das Feld mit.** Sonst bliebe in den Daten für
>   immer ein `termine: []` stehen, und jede Woche, die einmal einen Termin
>   trug, wäre von den übrigen unterscheidbar, ohne es zu sein.
>
> `WEEKDAY_OFFSET` ist dafür aus `meeting-dates.ts` exportiert und die
> Wochentags-Auswahl aus `SonderwochePanel` nach `planen/wochentage.ts`
> gewandert: Zwei Listen deutscher Wochentage wären zwei Gelegenheiten,
> „Sonnabend" zu vergessen — ein eigener Test hält genau das fest.
>
> **11 Tests** in `src/data/termine.test.ts`. Alle vier CI-Schritte grün
> (1860 Tests), Konsole sauber.
>
> #### Was zu bauen ist — B: der Treffpunkt-Leiter als Freitext
>
> **Vom Betreiber am 17.8.2026 nachgereicht** und der eigentliche Kern der
> dritten Zeile: „Der Kreisaufseher leitet in der Regel den Treffpunkt, und der
> ist ja kein Teil der Versammlungspersonen." Gewünscht ist derselbe Weg wie
> beim Redner am Sonntag (T29): Person aus der Liste **oder** Freitext.
>
> ⚠ **Beim Nachsehen eine Falle gefunden — die Abwesenheit der `lpid` reicht
> als Kennzeichen nicht.** `fsMigrateLeaderPids` (`data/fs.ts`) läuft bei jedem
> Laden und hängt **jedem** Leiter-Namen, der eindeutig auf eine Person passt,
> deren Id an. Ein Freitext-Leiter, der zufällig wie ein Bruder der
> Versammlung heißt, würde damit stillschweigend zu ihm: Auslastung, „Meine
> Aufgaben", Erinnerungen. Dieselbe Ursache wie in T29 (`gehoertZu` fiel ohne
> `pid` auf den Namen zurück), nur an der zweiten Datenquelle — und dort
> zusätzlich mit einem Migrationsschritt, der es aktiv wieder herstellt.
>
> Folgerung: Der Freitext braucht ein **eigenes Kennzeichen** an der Instanz,
> so wie T29 die Rolle in den Platz schreibt statt sich auf die fehlende `pid`
> zu verlassen. Die Leser des Namens sind einzeln durchzugehen — mindestens
> `fsMigrateLeaderPids`, `fsWeekConflicts`, `deriveMyFsTasks`, die
> Auslastung, `fsAutoAssign` und `fsRenamePerson`. Genau die Fehlerart, gegen
> die es hier die Vollständigkeitsproben gibt; eine davon (`alle-plaetze`)
> ist der passende Ort.
>
> ✅ **Teil B umgesetzt am 17. August 2026.** `FsInstance.lext` sagt „der
> Leiter ist Freitext"; im Sheet steht dasselbe Paar wie beim Redner —
> Namensfeld mit `ÜBERNEHMEN`, darunter „Oder aus der eigenen Versammlung
> wählen". Ohne neuen Wörterbuch-Schlüssel: `nameLbl`, `uebernehmenBtn` und
> `oderPersonWaehlen` liegen gemessen vor.
>
> **Die Regel hat einen Namen bekommen, statt sich zu wiederholen.**
> `fsLeiterZuteilung(inst)` gibt den Freitext-Leiter gar nicht erst als Person
> aus. Sie war an sechs Stellen fällig, und **vier davon lagen außerhalb von
> `fs.ts`** — genau die „vergessenen Aufrufer", von denen es hier elf im
> Review gab:
>
> | Wo | Was ohne die Regel geschähe |
> | --- | --- |
> | `fsMigrateLeaderPids` | macht den Freitext bei **jedem Laden** wieder zur Person — der Fehler wäre selbstheilend in die falsche Richtung |
> | `fsAutoAssign` (Last) | der Kreisaufseher erhöht die Auslastung des Gleichnamigen, die Auto-Zuteilung übergeht ihn daraufhin |
> | `deriveMyFsTasks` | fremde Leitung in „Meine Aufgaben" |
> | `fsWeekConflicts` | Abwesenheit des Gleichnamigen wird als Konflikt gemeldet |
> | `fsRenameLeader` | Umbenennen des Bruders benennt den Kreisaufseher mit um |
> | `person-timeline`, `kandidaten`, `FsProgram`, `FsPlan` | fremde Leitung in der Zeitleiste, blockierter Kandidat, falsches „DU", falsche Markierung |
> | **`send-reminders`** | erinnert den gleichnamigen Bruder an eine Leitung, die er nicht hat ⚠ **Deploy nötig** |
>
> **Dabei aufgefallen und mitkorrigiert:** Der Chip trug das
> Bestätigungs-Zeichen `✓` auch beim Freitext — „✓" heißt *bestätigt*, und der
> Kreisaufseher hat die App gar nicht.
>
> ✅ **Und beim Gastredner nachgezogen (17.8.2026, auf Ansage des Betreibers).**
> Dieselbe Ursache, eigene Stelle: `MeetingSection` setzte `showStatus` auf
> `Boolean(slot.name)`. Jetzt fragt es `isGuestRole` — damit fällt der Haken
> nicht nur beim Gastredner weg, sondern auch bei den
> **Kreisaufseher**-Plätzen aus T62 (Dienstvortrag, Schlussvortrag,
> öffentlicher Vortrag der Dienstwoche); beide stehen in `SKIP_ROLE`, und am
> Wort zu prüfen wäre der stille Rückschritt gewesen.
>
> **Die Regel war zweimal vergessen worden, deshalb hat sie jetzt einen
> Wächter.** `HelpersPanel` führte sie seit jeher richtig („Gruppen-Rotation
> ist keine Person"), aber als gewöhnlichen Ausdruck mitten in einer
> Eigenschaft — sichtbar nur, wer genau diese Datei liest. T29 baute daneben
> und übernahm sie nicht; T63 wäre denselben Weg gegangen, wäre es beim
> Nachstellen im Browser nicht aufgefallen. Ein Verhaltenstest trägt hier
> wenig (MeetingSection 0 %, FsPlan 1,5 % Abdeckung), also eine **Probe am
> Quelltext** nach dem Muster von `aufgaben-label-quelle.test.ts`:
> `src/planen/slot-status-quelle.test.ts` führt alle vier `SlotChip`-Aufrufer
> namentlich samt ihrer `showStatus`-Angabe. Genau einer darf unbedingt sein —
> der Ratgeber der Zusätzlichen Klasse, und der ist immer ein Bruder der
> eigenen Versammlung. Wer einen fünften Aufrufer hinzufügt oder eine Angabe
> ändert, wird rot und muss sich entscheiden.
>
> Gegenprobe auch hier gefahren: mit dem alten `Boolean(slot.name)` fällt die
> Probe. Im Browser nachgestellt: „Gastredner · Vers. Nordheim: M. Hartmann"
> ohne Haken, „Vorsitz: A. Brenner✓" mit, „Simon Krüger…" behält das
> ausstehende Zeichen, die Gruppen wie bisher ohne.
>
> **11 Tests** in `src/data/t63-leiter-freitext.test.ts`, in denen der
> Freitext-Leiter absichtlich wie ein Bruder der Versammlung heißt
> („K. Steiner"). Gegenprobe gefahren: mit zurückgenommenen Wachen fallen
> **8 von 11**; jede Wache ist einzeln belegt. Im Browser nachgestellt: „Jonas
> Berger" als Freitext eingetragen → Chip „Leiter: Jonas Berger" **ohne** ✓,
> während der echte Jonas Berger am Mittwoch seines behält. Konsole sauber,
> alle vier CI-Schritte grün (1846 Tests).
>
> ✅ **`send-reminders` ist deployt** (17.8.2026, 21:29:47 — Version 26), also
> nach dem Commit `7c75489` (21:17:06), der die Wache trägt. `functions list`
> zeigt `verify_jwt: false`, wie `config.toml` es für diese eine Function
> vorsieht: Sie ruft der Cron-Job ohne Nutzer-Login, geschützt über
> `CRON_SECRET`. Das Flag `--no-verify-jwt` beim Deploy passt hier deshalb —
> anders als bei `substitute`, wo es 2026 der Fehler war (T11).
>
> **Rauchtest gefahren, beide Wege 401:** ohne Header und mit falschem Secret.
> Der Rumpf ist das schlichte `Unauthorized` aus dem Handler, nicht das JSON
> der Plattform — es kommt also von Code, der erst **nach** dem Laden des
> Moduls samt `_shared/` läuft. Damit ist belegt, dass das neue Bündel
> wirklich hochgekommen ist und nicht nur hochgeladen wurde. Mit gültigem
> Secret wurde bewusst **nicht** gerufen: `SEND_PUSH` ist scharf.
>
> **T63 ist damit vollständig** — beide Teile gebaut, belegt und in Betrieb.

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
| Spalte `start date not null` + `unique (congregation_id, start)` | `migration-017`, [schema.sql](../../supabase/schema.sql) |
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
| 10 Tests auf die Umschreibung | `lib/taskkey-migration.test.ts` (mit der Umschreibung in Stufe 3 wieder entfallen) |

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
| Restliche Positions-Schlüssel umschreiben, dann Spalte löschen | `migration-018` |

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
> `migration-016` ergänzt
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
> ✅ **`migration-016` ist
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

## Aufgenommen am 15. August 2026 — Vorhaben (T67–T72)

Zwölf Punkte aus der Durchsicht des Betreibers: sechs Vorhaben, sechs Fehler
(T73–T78 unten). Reihenfolge wie genannt, der Aufwand ist geschätzt und nicht
gemessen. Wo der Ort im Code schon feststeht, steht er dabei — nachgesehen ist
damit **wo** etwas liegt, nicht warum es so ist und erst recht nicht, wie es zu
lösen wäre.

### T67 · Die Tests selbst prüfen — wirklichkeitsnah und vollständig? 🏗 ✅ erledigt
**Vorgabe des Betreibers.** 1708 grüne Tests sind kein Beleg für Abdeckung. Zu
prüfen ist beides: ob sie **die Wirklichkeit** treffen (echte Wochen, echte
Zuteilungen, echte Abläufe statt bequemer Fixtures) und ob sie **vollständig**
sind — welche Regel hat gar keinen Test, welcher Zweig läuft nie.

Anhaltspunkt für den Zuschnitt: die beiden Vollständigkeitsproben
(`alle-plaetze`, `aufgaben-label-quelle`) haben beim Anlegen sofort echte Funde
geliefert, die Hunderte von Einzeltests nicht hatten. Die Frage ist also nicht
„mehr Tests", sondern welche Proben **von den Daten her** denken statt von den
Funktionen.

**Prüfen:** Coverage ehrlich lesen (T56), dazu je Bereich stichprobenweise eine
Regel absichtlich brechen und sehen, ob überhaupt etwas rot wird.

> **Umgesetzt am 16. August 2026 — und zwar genau so: gemessen, nicht
> geschätzt.** Aus „stichprobenweise eine Regel brechen" ist ein Messgerät
> geworden, das man wieder ansetzen kann:
> **[`npm run mutationsprobe`](../../scripts/mutationsprobe.mjs)**.
>
> #### Wie sie fragt
>
> Sie bricht eine Regel im Quelltext absichtlich und lässt den **ganzen**
> Testbestand darüber laufen. Wird er rot, ist die Regel bewacht. Bleibt er
> grün, könnte man sie morgen versehentlich entfernen, und 1800 Tests
> schwiegen dazu.
>
> Der ganze Bestand, nicht die „zuständige" Datei: **Welcher Test eine Regel
> deckt, ist ja die Frage.** Wer die Auswahl vorher trifft, bekommt die
> Antwort heraus, die er hineingesteckt hat. `--bail=1` macht das bezahlbar —
> bewachte Regeln brechen nach Sekunden ab, nur ungewachte kosten den vollen
> Lauf.
>
> Die eigentliche Arbeit ist der **Katalog**: 37 Einträge, jeder eine fachliche
> Aussage („niemand ist zur selben Zeit in zwei Räumen", „eine ausgefallene
> Zusammenkunft zählt nicht zur Auslastung"), keine Syntaxvariante. Eine
> Mutation, die keine Regel bricht, darf grün bleiben und gehört nicht hinein.
>
> Und sie **rostet laut**: Findet ein Eintrag seine Stelle nicht mehr — gar
> nicht oder zweimal —, bricht der Lauf ab. Sonst stünde eines Tages ein
> Katalog da, der nichts mehr misst und lauter Häkchen meldet. Genau das ist
> beim ersten Anlauf passiert (ein Ausdruck kam zweimal vor) und war sofort
> sichtbar.
>
> #### Was herauskam: 27 von 31
>
> Vier Regeln standen ungeschützt da — und es sind nicht die, die man geraten
> hätte:
>
> | Regel | Wirkung, wenn sie stillschweigend wegfällt |
> | --- | --- |
> | Jeder Platz eines Hilfsdienstes wird besetzt | Von zwei Mikrofonen ist jede Woche eines offen |
> | Der Partner der Klasse folgt **ihrem** Führer (T18) | Die Zusätzliche Klasse richtet sich nach dem Hauptsaal |
> | Partner und Führer haben dasselbe Geschlecht | Ein Bruder wird einer Schwester als Begleitung zugeteilt |
> | Die ausgefallene Zusammenkunft erinnert nicht (T30) | Push an alle für einen Abend, an dem niemand kommt |
>
> **Alle vier sind Aufrufer-Lücken** — dieselbe Fehlerart, die schon die beiden
> Vollständigkeitsproben aufgedeckt haben. Die Regel selbst war je geprüft
> (`partnerGenderOk` in `helpers.test.ts`, T18 im Zuteilungs-Sheet
> `kandidaten.test.ts`, `istAusgefallenFuer` in `edge-parity.test.ts`) — die
> **Anwendung** nicht. Wer nur nach fehlenden Tests sucht, findet sie nie: Es
> gibt ja einen.
>
> #### Der Fund, der die Frage des Betreibers beantwortet
>
> Ein Test hieß „Gesprächsteil: Führer + Partner gleiches Geschlecht" — und
> blieb grün, als die Geschlechtsprüfung entfernt wurde. Sein Aufbau war so
> bequem gewählt, dass die beiden Schwestern ohnehin als Einzige übrig blieben
> (der eine Bruder am Ton, der andere mit Ältesten-Malus beim männlichen
> Vortrag). **Die Regel entschied dort gar nichts** — und was nichts
> entscheidet, kann man auch nicht messen.
>
> Das ist die Antwort auf „wirklichkeitsnah?": Nicht die Fixtures sind das
> Problem, sondern Vorgaben, in denen das Erwartete auch ohne die Regel
> herauskommt. Der Test steht jetzt daneben, mit einer Vorgabe, in der allein
> sie entscheidet: Der Bruder ist der Unbelastetste und gewönne jeden
> Vergleich — er darf nur nicht.
>
> #### Zwei weitere Lücken, die die Abdeckung zeigte
>
> * **`kandidaten.ts`, Zweig „Treffpunkt".** T23 hat die Kandidatenlogik
>   ausdrücklich als reine Funktion herausgezogen, damit sie prüfbar ist —
>   zwei ihrer drei Zweige wurden geprüft, der dritte von keinem Test je
>   aufgerufen. Er hat eigene Regeln: „schon heute" meint den Wochentag
>   **dieses** Treffpunkts, und die Abwesenheit wird an **seinem** Datum
>   gemessen.
> * **`clipboard.ts`, 0 %.** Die Reihenfolge ist die ganze Datei: der
>   gestensichere `execCommand`-Weg **zuerst**, die moderne API nur als
>   Rückfall — wer sie zuerst abwartet, verlässt die Nutzergeste und beide Wege
>   scheitern (genau der behobene Fehler). Sieht man einer Datei nicht an;
>   beide Wege kopieren ja.
>
> Beim Schreiben dieses Tests kam **ein echter Mangel** heraus: Wirft
> `execCommand` — in älteren Browsern und unter strengen Berechtigungen tut es
> das, statt `false` zu liefern —, blieb das versteckte Textfeld im Dokument
> stehen. Unsichtbar, aber bei jedem Versuch eines mehr. Behoben mit `finally`.
>
> #### Die Abdeckungszahl war selbst nicht ehrlich
>
> `npm run test:coverage` maß **nur `src/`**. Die drei Edge Functions — der
> Code, der unbeaufsichtigt mit Service-Role läuft — kamen in der Zahl gar
> nicht vor. Nachgemessen und aufgenommen; dabei fiel auf:
>
> **`send-invite` stand bei 0 %** — 137 Zeilen ohne einen einzigen Test, und
> es ist die einzige Function, die **an Menschen hinausgeht**. Ungefährlich war
> das nur, weil sie mangels `INVITE_FROM` bisher gar nicht sendet; mit der
> gekauften Domain wird sie scharf. Jetzt 16 Tests auf
> genau das, was nicht gehen darf: Nur Planer dürfen aufrufen, die Adresse
> kommt **immer** aus der Personen-Tabelle der eigenen Versammlung (sonst
> stünde ein offenes Mail-Relay im Netz), ohne verifizierten Absender wird
> nicht gesendet — und zwar vor der ersten Datenbank-Abfrage.
>
> Ebenso ungleich behandelt: `send-reminders/texte.ts` hat seit T24 eine
> Vollständigkeitsprüfung über alle 34 Sprachen, `substitute/texte.ts` hatte
> keine. Zwei Wörterbücher derselben Bauart; käme eine 35. Sprache dazu, würde
> der eine Versand rot und der andere schickte still auf Deutsch hinaus.
>
> #### Stand danach
>
> | | vorher | nachher |
> | --- | --- | --- |
> | Tests | 1782 in 96 Dateien | 1822 in 99 Dateien |
> | Bewachte Regeln im Katalog | 27/31 | **37/37** |
> | Abdeckung (Anweisungen) | 79,6 % — ohne `supabase/` | **81,0 %** — mit |
> | `send-invite` | 0 % | 93 % |
> | `kandidaten.ts` | 61 % | 89 % |
>
> Jede der sieben geschlossenen Lücken ist **einzeln nachgewiesen**: Die
> Mutation, die vorher durchging, macht jetzt genau den neuen Test rot — mit
> demselben Werkzeug, das sie gefunden hat.
>
> #### Was die Probe nicht kann — und was offen bleibt
>
> Sie misst nur, was im Katalog steht. Eine Regel, die niemand aufgeschrieben
> hat, bleibt ungemessen; der Katalog ist damit selbst ein Dokument, das
> gepflegt sein will. Und sie sagt nichts über **Bedienoberflächen**: Dort
> steht die Abdeckung weiter niedrig — `MeetingSection.tsx` (363 Zeilen) bei
> 0 %, `FsPlan.tsx` bei 1,5 %, `PlanBanners.tsx` bei 9 %, die Bildschirme
> Programm und Aufgaben bei 27 %. Ob das eine Lücke ist oder die richtige
> Grenze, ist eine eigene Frage: Die **Regeln** dieser Ansichten liegen
> ausnahmslos in geprüften reinen Funktionen; ungeprüft ist ihr Zusammenbau.
> Ein Fehler dort ist sichtbar, kein stiller — und stille Fehler waren der
> Grund für diese Runde.

### T68 · Datenmodell und Schlüssel prüfen 🏗 ✅ erledigt
**Vorgabe des Betreibers.** Ergibt das Modell als Ganzes noch Sinn, sind die
Schlüssel gut gewählt? Der Anlass ist berechtigt: T37 (`task_key` an der
Kennung statt an der Position), T66 (eine Woche ist ihr Datum) und die vier
Platzsorten (`PartItem.names`, `PartItem.aux`, `Meeting.auxRatgeber`,
`Meeting.helpers`) sind allesamt aus Schlüssel-Entscheidungen entstanden, die
sich später als zu eng erwiesen haben.

Anzusehen: der Aufbau des `task_key` (`wi|tab|part|si|ii|ni`), `FsInstance.id`,
die JSONB-Blobs `weeks.data`/`fs_weeks.data` gegenüber echten Spalten, und ob
`Qualifications` mit der Index-Signatur `svc:<key>` noch trägt.

> **Geprüft am 16. August 2026 — vier Fragen, vier Antworten.** Drei davon
> lauten „trägt", eine hat einen Fehler zutage gefördert, der seine eigene
> Nummer bekommen hat (**T87**, unten).
>
> #### 1. `task_key` — trägt, mit einer Naht
>
> Der Schlüssel besteht aus Woche, Zusammenkunft, Art und dem, was die Art
> braucht:
>
> | Art | Form |
> | --- | --- |
> | Programmpunkt | `2026-09-07\|mid\|part\|k3f9x\|0` |
> | Zusätzliche Klasse | dasselbe mit `aux` an der Stelle von `part` |
> | Hilfsdienst | `2026-09-07\|mid\|helper\|mik\|1` |
> | Ratgeber | `2026-09-07\|mid\|ratgeber` |
> | **Treffpunkt** | `fs\|2026-09-07\|r1c8…` |
>
> Die ersten vier sind nach T37 und T66 in Ordnung: vorn das **Datum** der
> Woche, in der Mitte die **stabile Kennung** des Punkts. Beides ist gegen
> Verschieben und Umsortieren unempfindlich, und beide Umstellungen laufen als
> Lade-Migration weiter, bis der letzte Altbestand gehoben ist.
>
> Die Naht ist der Treffpunkt: Er trägt seine Art **vorn** statt an dritter
> Stelle, weil er kein mid/we hat. Das ist begründet (der Kommentar an
> `fsTaskKey` sagt es) und hat eine Folge, die dort nicht steht: `taskKeyWeek`
> liest Woche und Zusammenkunft aus den ersten beiden Feldern und liefert für
> einen `fs`-Schlüssel `null` — womit `taskKeyVorbei` (T77) einen abgelaufenen
> Treffpunkt-Hinweis nie als abgelaufen erkennt.
>
> **Folgenlos, aber wissenswert:** Heute trägt gar keine Mitteilung einen
> `fs`-Schlüssel. `substitute` kennt nur Hilfsdienste, und die Erinnerungen aus
> `send-reminders` schreiben überhaupt keinen — eine Erinnerung bündelt die
> Aufgaben eines Tages in **einer** Zeile, ein einzelner `task_key` würde sie
> gar nicht beschreiben. Der richtige Schlüssel wäre dort Woche + Zusammenkunft,
> nicht der Platz. Deshalb ist hier nichts zu ändern, sondern etwas zu
> vermerken: Wer je Treffpunkt-Mitteilungen mit Schlüssel schreibt, muss
> `taskKeyWeek` vorher beibringen, was ein `fs` ist.
>
> #### 2. `FsInstance.id` — **trug nicht.** Siehe T87.
>
> #### 3. JSONB-Blob gegen echte Spalten — bewusst so, und richtig so
>
> `weeks.data` und `fs_weeks.data` halten die ganze Woche als ein Dokument.
> Dagegen spricht das Übliche: keine Integrität in der Datenbank, keine Abfrage
> auf einzelne Plätze, und jede Edge Function muss die Struktur selbst lesen
> können. Dafür spricht der Zuschnitt dieser Anwendung:
>
> * Eine Versammlung, ein Planer, der schreibt — der Wettlauf ist der zwischen
>   zwei Planern, und den löst T39 je Woche über `updated_at`. Feinere Zeilen
>   brächten feinere Sperren für ein Problem, das es nicht gibt.
> * Die Struktur einer Woche hat sich in einem Jahr **mehrfach** geändert
>   (`aux`, `auxRatgeber`, `iid`, `mins`, `dev`, `anlass`). Als Spalten wäre
>   jede dieser Änderungen eine Migration gewesen; als Blob war keine nötig —
>   die 20 Migrationen betreffen fast alle andere Tabellen.
> * Das doppelte Lesen ist gesehen und abgesichert: `_shared/planung.ts` teilt
>   die Regeln, und `edge-parity.test.ts` hält Client und Function an denselben
>   Eingaben gegeneinander.
>
> Was der Blob **kostet**, ist die Ordnung darin — und genau die ist zweimal
> teuer geworden (T66, T87). Nicht die Ablageform war das Problem, sondern
> Ordnungszahlen als Identität. Die sind jetzt weg.
>
> #### 4. `Qualifications` mit `[svc:<key>]` — trägt
>
> Die Index-Signatur erlaubt jedem Hilfsdienst seinen eigenen Bereich, ohne
> dass eine Zeile Code dazukommt (T79 hat davon gelebt). Der Preis: ein Tippfehler
> in einem **festen** Bereich fällt dem Compiler nicht auf, weil jeder String
> ein gültiger Schlüssel ist.
>
> Nachgezählt statt befürchtet: Im Produktionscode stehen **sechs** feste
> Bereiche als Zeichenkette (`vorsitzMid`, `vorsitzWe`, `bibellesung`, `leser`,
> `schulung`, `schulungPartner`) und vier bei `isQualified` — alle gültig, alle
> von der Auto-Zuteilung durchlaufen, die bei einem Tippfehler sofort Plätze
> offen ließe. Der Rest geht über `QUALIFICATION_ORDER` und `serviceQualKey`.
> Zehn Stellen rechtfertigen keine eigene Probe; die Signatur bleibt.
>
> #### 5. Die vier Platzsorten — bleiben, weil die Probe sie bewacht
>
> Eine Zuteilung steht in `item.names`, `item.aux`, `meeting.auxRatgeber` oder
> `meeting.helpers` — drei verschiedene Formen (Liste, Einzelplatz, Verzeichnis
> von Listen). Zusammenzulegen wäre theoretisch schöner und praktisch eine
> Migration jedes Wochen-Blobs **und** jedes `task_key`, für einen rein inneren
> Gewinn. Die Fehlerart, die daraus entsteht — ein Aufrufer kennt nur eine
> Sorte —, ist seit dem 15. August durch `alle-plaetze.test.ts` abgedeckt, und
> die Mutationsprobe (T67) hat dort zwei weitere Lücken gefunden und
> geschlossen. Damit ist die Asymmetrie bezahlt; sie bleibt.

### T87 · Der Treffpunkt vergisst seinen Leiter, sobald das Jahr voll ist 🔧 ✅ erledigt
Bei der Modellprüfung (T68) gefunden, **eigener Punkt, damit er nicht
untergeht** — und der schwerwiegendste Fund dieser Runde: stiller Datenverlust,
mit Zeitzünder.

`FsInstance.id` lautete `"<wi>|<ruleId>"` — mit `wi` = **Position der Woche im
Ladefenster**. Das ist dieselbe Ordnungszahl als Identität, die T66 überall
sonst abgeschafft hat; im Treffpunkt-Strang ist sie stehen geblieben.

**Warum es bisher nicht aufgefallen ist.** Das Fenster hält die jüngsten 52
Wochen (`WEEK_LIMIT`). Solange die Versammlung weniger hat, beginnt es immer
bei derselben Woche, und die Nummer einer Kalenderwoche steht still. Vom ersten
Import jenseits eines Jahres an rutscht es mit **jeder** neuen Woche eine
weiter.

**Was dann geschieht — gemessen, nicht überlegt:**

| | vor dem Rutschen | danach |
| --- | --- | --- |
| Kalenderwoche | 26.01.2026 | 26.01.2026 |
| Kennung | `3\|r1` | `2\|r1` |
| `task_key` | `fs\|2026-01-26\|3\|r1` | `fs\|2026-01-26\|2\|r1` |
| Zugeteilter Leiter | Emil Ernst | **""** |

Der Leiter ist weg. Nicht die Bestätigung — der **Eintrag**: `regenFsWeeks`
richtet die gespeicherten Wochen beim Laden am Grundplan aus und findet die
gespeicherte Leitung über die Kennung wieder. Findet sie sie nicht, steht der
Treffpunkt wieder offen. Ohne Meldung, ohne Spur, mitten in einer fertigen
Planung — und ein Jahr nach dem Start jede Woche aufs Neue.

**Behoben:** Die Kennung ist jetzt die **Regel** (`instanzId`), sonst nichts.
Eindeutig ist sie auch allein — jede Regel wird höchstens einmal je Woche
materialisiert, und gespeichert wird ohnehin je Woche eine eigene Zeile. Die
Woche steht im `task_key` davor; dort gehört sie hin.

Zwei Lade-Migrationen heben den Bestand, jede rein und idempotent:
`fsMigrateInstIds` die Kennungen im Blob, `migrateFsTaskKeys` die
Bestätigungen (`fs|<Datum>|3|r1` → `fs|<Datum>|r1`) über denselben Weg, den
T37 dafür gebaut hat. Von Hand angelegte Treffpunkte (`x<uuid>`) bleiben
unberührt: Sie tragen keine Zahl vorn.

**Dabei mitgezogen:** `buildFsWeeks` belegt seine Demo-Leiter weiterhin je
Woche — die Vorbelegung ist jetzt ausdrücklich mit `"<wi>|<instanzId>"`
adressiert. Ohne diese Trennung hätte derselbe Leiter in allen vier
Demo-Wochen gestanden: Die Kennung beschreibt den Treffpunkt, nicht seinen
Termin.

**Die dritte Stelle liest gar nicht mit — sie liest direkt.** `send-reminders`
holt den Blob aus der Datenbank, nicht aus der App, und der trägt die alte
Kennung so lange, bis ein Planer die Woche das nächste Mal anfasst. Zwischen
dem Umbenennen der Bestätigungen (beim ersten Laden) und diesem Anfassen
rechnete der Versand mit `fs|<Montag>|3|r1`, während die Bestätigung längst
`fs|<Montag>|r1` heißt: Der Leiter hätte bestätigt und würde weiter erinnert.
Der Versand greift jetzt selbst nach der stabilen Kennung (`stabileKennung`) —
**das ist die vierte Aufrufer-Lücke dieses Tages**, gefunden durch dieselbe
Frage wie die anderen drei: Wer liest diese Daten noch?

> **Nutzer-Schritt — nur `send-reminders`.** Nachgesehen mit
> `git log <letzter Deploy>..HEAD -- supabase/functions`: `import-week` ist
> seit dem Deploy vom 15. August unberührt, an `substitute` hat sich seit dem
> 16. August nur eine **Testdatei** geändert (`texte.test.ts`, liegt wie ihre
> Schwester neben der `index.ts` und wird nie importiert). Zu deployen ist
> also genau eine Function:
>
> ```
> npx supabase functions deploy send-reminders --project-ref izxrhrufdbpbuwbvxdqr
> ```
>
> **Kein `--no-verify-jwt`** — `supabase/config.toml` hält die Einstellung je
> Function fest, damit ein vergessenes Flag die Sicherheitsgrenze nicht still
> verstellt. „WARNING: Docker is not running" ist harmlos, die CLI lädt über
> die API; `_shared/planung.ts` kommt automatisch mit.
>
> **Danach prüfen, in dieser Reihenfolge:**
>
> 1. `npx supabase functions list --project-ref izxrhrufdbpbuwbvxdqr` —
>    `updated_at` von `send-reminders` muss **hinter** dem Commit `08bca56`
>    liegen. Das ist der einzige harte Beleg; „lief schon" ist keiner.
> 2. Rauchtest ohne Nebenwirkung: POST mit absichtlich falschem
>    `Authorization: Bearer falsch` → **401**. Beweist, dass der neue Code
>    läuft und die Abwehr greift, ohne etwas auszulösen. (Unter Windows
>    `curl.exe` schreiben — `curl` ist in PowerShell ein Alias auf
>    `Invoke-WebRequest` und versteht `-s -X -d` nicht.)
>
> **Nicht von Hand mit gültigem Secret aufrufen:** `SEND_PUSH=true` ist
> gesetzt, der Versand ist scharf — ein Handaufruf schickt echte Push-Nachrichten
> an die ganze Versammlung. Der Cron läuft ohnehin täglich um 08:00 UTC.
>
> **Ohne den Deploy passiert nichts Schlimmes:** Die Erinnerungen laufen weiter
> wie bisher. Erst wenn die App die Schlüssel gehoben hat, könnte ein
> bestätigter Treffpunkt noch einmal erinnert werden — und auch das nur, bis
> der Planer die betroffene Woche das nächste Mal anfasst.
>
> ✅ **Beim Betreiber erledigt am 16. August 2026, 20:05 Uhr.** `functions list`
> zeigt `send-reminders` als **v25** mit `updated_at` = 20:05:18 und damit
> hinter dem Commit `08bca56` (19:27:51). `verify_jwt` steht dort auf `false`
> und bei allen übrigen auf `true` — der Soll-Zustand aus `config.toml` ist
> beim Deploy nicht verrutscht.
>
> Der Rauchtest lieferte **401**, und das sagt hier mehr als „abgewiesen":
> Weil `send-reminders` ohne Plattform-Prüfung läuft, kommt die Absage aus dem
> **Handler** — der erst arbeitet, nachdem das Modul samt `_shared/planung.ts`
> geladen ist. Ein Fehler am Import hätte einen 500 oder einen Boot-Fehler
> ergeben, kein glattes 401. Damit ist belegt, dass das neue Bündel läuft und
> nicht nur hochgeladen wurde.

**Geprüft:** 11 Tests in `src/data/fs-kennung.test.ts` (gleiche Kennung über
verschiedene Fensterpositionen, gleicher `task_key`, überlebender Leiter,
Altbestand heben, Idempotenz, manuelle Treffpunkte, Bestätigungen) und zwei in
`send-reminders.test.ts` (Altbestand mit und ohne Bestätigung). Gegenprobe
mit der alten Kennung gefahren: **6 von 11** fallen. Vier Einträge im Katalog
der Mutationsprobe halten die vier Hälften künftig fest.

### T69 · „Einspringen" beim Öffnen der App zeigen — wie das Bestätigen 🔧 ✅ erledigt
**Vorgabe des Betreibers.** Ein offenes Ersatzgesuch muss beim Öffnen der App
vorgelegt werden, genau wie eine offene Bestätigung — und zwar **allen**
Nutzern, nicht nur denen, die über einen Push hereinkommen. Heute lädt die App
die Daten still nach, wenn ein Deep-Link aus einem Push-Klick kommt, damit der
„Einspringen"-Bereich die neue Anfrage sofort zeigt (`app/AppShell.tsx:138`);
ohne Push sieht sie nur, wer von selbst nachschaut.

**Es ist eine Ergänzung geworden, keine zweite Mechanik.** Die Vorlage entsteht
in `withDerivedTasks` — dieselbe Ableitung, die `myTasks` **und**
`substituteReqs` berechnet. Sie standen also längst nebeneinander im Zustand;
gezeigt wurde nur das eine. Das Blatt beim Öffnen zeigt jetzt beides: oben die
Bestätigungen, darunter — durch eine Haarlinie getrennt — die Gesuche.

**Der Unterschied zwischen Pflicht und Bitte bleibt stehen.** Eine offene
Bestätigung hält das Blatt wie bisher (kein ✕, kein Klick auf den Hintergrund).
Steht dort **nur** ein Gesuch, lässt es sich weglegen: Einspringen kann man,
müssen tut man es nicht. `closeConfirm` verweigert deshalb, solange eine
Bestätigung offen ist — die Regel steht im Reducer, nicht in der Ansicht.

**Eine Stelle entscheidet, ob es etwas vorzulegen gibt.** `vorzulegen(myTasks,
substituteReqs)` benutzen der Reducer (setzt `confirmOpen`) und die Hülle (zeigt
das Blatt). Zwei Bedingungen, die dasselbe meinen, laufen früher oder später
auseinander — dann steht ein leeres Blatt da oder ein volles bleibt weg. Aus
demselben Grund hält jetzt auch ein Gesuch das Blatt, wenn die **letzte**
Bestätigung gegeben wird: vorher verschwand es unter der Hand.

Ohne neuen Wörterbuch-Schlüssel: `einspringenTitle`, `einspringenHint` und
`uebernehmen` gibt es seit dem Aufgaben-Bildschirm in allen 34 Sprachen.

**Geprüft:** 5 Tests am Blatt (Gesuch allein, Gesuch neben Pflicht, ✕ und
Hintergrund, Übernehmen, unverändertes Verhalten ohne Gesuch) und einer am
Reducer; Gegenprobe durch Zurücknehmen von `vorzulegen` — der Reducer-Test wurde
rot. Beide Fassungen am laufenden Stand angesehen.

### T70 · Zusammengesetzte Klassennamen — gibt es das noch woanders? 🔧 ✅ erledigt
**Vorgabe des Betreibers.** Er erinnert einen Kommentar, wonach ein Klassenname
zusammengesetzt war und eine Referenz deshalb nicht gefunden wurde: „das klingt
sehr schlecht."

**Der Fall ist echt**, nachzulesen in `components/week-strip.css:44` und
`components/WeekStrip.tsx:64`: `week-page--${…}` war interpoliert, die Suche
nach `week-page--vor` fand nichts, die CSS-Regeln galten als tot und wurden
entfernt — danach lagen beide Nachbarwochen ohne Versatz über der aktuellen,
Programm und Planen zeigten zwei Wochen übereinander. **Dort** ist es behoben
(Namen ausgeschrieben in `SEITE`, ein Test hält beide Seiten zusammen).

**Die Verallgemeinerung steht jetzt als dritte Vollständigkeitsprobe**
(`styles/klassennamen.test.ts`). Die Regel, die sie durchsetzt: Eingesetzt
werden darf nur ein **ganzer** Name oder ein **ganzer** Zusatz —
`${basis} is-armed` ist recht, `week-page--${richtung}` und `'plan-' + art`
sind es nicht. Erkennbar am Rand der Einsetzung: Klebt sie an einem
Namenszeichen, ist der Name zerschnitten.

**Ergebnis der Durchsicht: kein weiterer Fall.** Die Probe meldete sechs
Stellen, keine davon ein Mangel — und beide Sorten waren lehrreich genug, um sie
festzuhalten:

* Viermal `…${armed ? ' is-armed' : ''}` — klebt am Namen, setzt aber nur einen
  ganzen Zusatz ein. Die Probe prüft das jetzt am Inhalt: Beginnt jede
  Zeichenkette darin mit Leerraum (oder ist leer), ist es recht. Eine Einsetzung
  ohne jede Zeichenkette (`${key}`) fällt durch — was sie liefert, weiß niemand.
* Zweimal `htmlFor={`pers-${key}`}` — eine zusammengesetzte **Kennung**, kein
  Klassenname. Dafür liest die Probe seither genau den Ausdruck hinter
  `className=` statt des Restes der Zeile. Wer eine Probe dreimal umsonst
  gelesen hat, glaubt ihr beim vierten Mal nicht mehr.

**Gegenprobe:** Ein zusammengesetzter Name in `SlotChip.tsx` eingebaut — die
Probe meldete genau ihn und sonst nichts; danach zurückgenommen. Dabei kam
heraus, dass sie den Ausdruck **an** der Fundstelle statt **dahinter** las und
Sammelvariablen (`const klassen = […]`) gar nicht ansah: Beides hätte sie
stillschweigend blind gemacht.

**Was sie nicht sieht** (im Kopf der Datei vermerkt): einen Namen, der drei
Ecken weiter in einer beliebig benannten Variablen entsteht. Und die CSS-Seite —
`import.meta.glob(…, '?raw')` liefert für `.css` im Testlauf eine **leere**
Zeichenkette, ein Test darauf wäre grün und hielte nichts.

### T71 · Schülerzettel drucken — 4 oder 6 auf ein A4 🔧 ✅ erledigt
**Vorgabe des Betreibers.** Die Zuteilungen für die Schulungsaufgaben sollen
gedruckt werden können, 4 oder 6 Stück eingepasst auf ein DIN A4. Der einzelne
Zettel besteht schon (`components/S89Sheet.tsx`); zu bauen ist der Bogen darum
herum: Raster, Seitenumbruch und ein `@media print`, das nur ihn zeigt.

**Die drei Fragen sind entschieden** — zwei davon vom Betreiber am fertigen
Ausdruck: **Sechs je Blatt, fest.** Beide Aufteilungen lagen zum Vergleich vor;
sechs füllen das A4 sauber und bleiben lesbar, also ist die Auswahl wieder weg —
eine Einstellung, die man einmal ansieht und nie wieder anfasst, ist eine zu
viel. **Die Woche, die offen ist** — dieselbe Regel wie beim Programm-Ausdruck.
Und die **Zusätzliche Klasse ist dabei**, mit ihrem Ort auf dem Zettel: Wer ihn
bekommt, muss wissen, in welchem Raum er drankommt.

**Der Zettel eines Gesprächs kommt zweimal** — einer für den Schüler, einer für
den Partner; beide bekommen ihn in die Hand. Ein Schalter im Panel schaltet das
ab, für Versammlungen, die es anders halten. Gezählt wird trotzdem die
**Aufgabe** und nicht der Platz: Sonst hinge die Zahl daran, wie viele Plätze
ein Programmpunkt zufällig hat.

**Der Zettel selbst ist derselbe Baustein wie am Bildschirm** (`S89Karte`, aus
`S89Sheet` herausgelöst). Das Papier soll nicht etwas anderes zeigen als die
App; zwei Fassungen desselben Formulars wären früher oder später zwei Inhalte.

**Drei Dinge, die erst das Messen gezeigt hat** — alle drei hätte man am
Reißbrett nicht gesehen:

1. **Der Wochenstreifen druckte mit.** Das Planen hängt in `WeekStrip`: Links
   und rechts steht je eine **vollständige zweite Ansicht** der Nachbarwoche
   (`week-page`), mit eigenem Bogen. Der Ausdruck hätte drei Wochen enthalten,
   und am Bildschirm sieht man davon nichts. Aufgefallen beim Nachzählen der
   Blätter: Es lagen mehr im Baum als gedacht.
2. **Der Browser bricht dort um, wo er will.** Weder ein CSS-Raster noch eine
   durchgehende Tabelle brachten verlässlich drei Reihen auf ein Blatt — aus
   „6 je Seite" wurden stillschweigend 4. Jetzt ist **je Blatt eine eigene
   Tabelle** mit erzwungenem Umbruch dahinter; die Aufteilung rechnet `seiten()`
   und ein Test hält sie fest.
3. **Ein Blatt so hoch wie das Papier kippt.** Der Versuch, die Höhe auf 297 mm
   festzunageln, erzeugte hinter jedem Blatt ein zweites, leeres — an
   `printToPDF` gemessen (aus einer Seite wurden zwei). Die Höhe ist deshalb
   wieder frei; den Umbruch macht allein `break-after`.

**Ohne neuen Wörterbuch-Schlüssel:** Die Überschrift ist `S-89` + `drucken`, der
Schalter trägt `s89Partner` („Gesprächspartner/in") und der Knopf `drucken`.

**Geprüft:** 13 Tests (Aufzählung inkl. Zusätzlicher Klasse, doppelter
Partner-Zettel und dessen Abschalten, Aufteilung auf Blätter, Bedienung,
Kennzeichen beim Drucken) — und am laufenden Stand als **PDF**: die Blätter
zählen richtig, die Nachbarwochen sind nicht dabei.

### T72 · Abwesenheiten als Zeitstrahl — erst zu überlegen 🏗 ✅ erledigt
**Vorgabe des Betreibers, ausdrücklich als Überlegung** („das muss man noch
überlegen"): eine Übersicht aller Abwesenheiten, eventuell als Zeitstrahl.

Vor dem Bauen zu klären, wozu sie dient. Beim **Planen** sehen, wer wann fehlt —
dann gehört sie in den Planen-Reiter und zeigt die Wochen der Planung. Oder die
**Verwaltung** der Meldungen — dann eher eine Liste je Person. Ein Baustein
existiert: `PersonTimeline` zeigt die Zeitleiste einer einzelnen Person.

> **Vom Betreiber am 16. August 2026 weiter zurückgestellt.** Die Frage nach
> dem Zweck wurde vorgelegt (Planen-Ansicht, Verwaltungs-Liste oder beides) —
> die Antwort lautet: noch nicht. Der Punkt bleibt offen, ohne dass etwas
> daran gebaut wird; ein Zuschnitt auf Verdacht wäre die falsche Reihenfolge.

> **Erledigt am 23. August 2026 — und die Reihenfolge hat sich gelohnt.** Die
> Frage nach dem Zweck hat der Betrieb beantwortet, nicht die Überlegung: Erst
> als 59 Abwesenheiten aus New World Scheduler in der App standen (T90), wurde
> gefragt, wo man sie eigentlich sieht. Gebaut wurde daraufhin die
> **Verwaltungs-Hälfte** — die Zeiträume stehen in der Zeitleiste des
> Personen-Details, Beginn und Ende als eigene Punkte, die Strecke dazwischen
> eingefärbt (T93). Genau der Baustein, der hier schon als vorhanden notiert
> war.
>
> Die **Planungs-Hälfte** („wer fehlt diese Woche") ist damit nicht gebaut und
> wird es vorerst nicht: „das passt erst mal so." Sie stünde als eigener Punkt
> wieder auf, wenn sie im Betrieb vermisst wird — dann aber mit einem Zweck aus
> der Erfahrung statt aus der Vermutung.

---

## Aufgenommen am 15. August 2026 — Fehler (T73–T81)

### T73 · Personen-Detail: Aufgaben und Hilfsdienste gehören getrennt ⚡ ✅ erledigt
Ein einziges Panel „AUFGABENBEREICHE" hielt beides: die festen Programm-Bereiche
aus `QUALIFICATION_ORDER` und darunter je Hilfsdienst einen Schalter. Jetzt sind
es **zwei** Karten — AUFGABENBEREICHE (petrol) und HILFSDIENSTE (neutral2, wie
derselbe Begriff im Planen-Reiter) —, **beide alphabetisch**.

Sortiert wird nach der **übersetzten** Beschriftung (`localeCompare` mit der
Sprache des Lesers, `numeric` für „Ordner 2" vor „Ordner 10") — nach dem
Schlüssel stünde jede Sprache in deutscher Reihenfolge. Kein neuer
i18n-Schlüssel: `hilfsdienste` gibt es längst (Einstellungen, Planen, Programm).
Gruppen-Dienste (Reinigung) bleiben wie vorher draußen — sie rotieren Gruppen,
nicht Personen.

**Geprüft:** `personen/PersonDetail.test.tsx` (vier Fälle: eigener Bereich,
beide alphabetisch, Gruppen-Dienst draußen, leere Dienstliste) und am laufenden
Demo-Stand nachgesehen.

### T74 · Erinnerungen: „Bei Zuteilung · Sofort" ist gar keine Auswahl ⚡ ✅ erledigt
Die Zeile stand als fester Text (`kv-row`) neben zwei echten Steppern und einem
Schalter und sah dadurch aus wie ein vergessenes Feld. **Entschieden (Betreiber,
15.8.2026): ein echter Schalter**, an/aus — nicht der kleinere Weg, den Satz in
den Hinweistext zu schieben.

Umgesetzt als `reminders.onAssign` (Standard `true`, liegt in
`congregations.settings` → **keine Migration**; fehlt das Feld, gilt „an", denn
so lief es vorher). Beschriftung `${remBeiZut} · ${remSofort}` aus den
vorhandenen Bausteinen — 34 Sprachen ohne neuen Schlüssel.

**Beim Bauen gemessen, was der Schalter wirklich schaltet:** Die Mitteilung
„Zuteilung gesendet" geht an die **Planer** (`persist.ts` verteilt lokale
Mitteilungen an `members.planner`), nicht an die eingeteilte Person. Die erfährt
es über die zeitlichen Erinnerungen — `send-reminders` kennt nur die Arten
`main`/`self`/`planner`, alle tagbasiert, keine sofortige. Der Schalter nimmt
ihr also nichts weg; er entscheidet, ob die Glocke des Planers bei jeder
Zuteilung eine Zeile bekommt. **Ein sofortiger Anstoß an die zugeteilte Person
wäre ein eigenes Stück Arbeit** (Web-Push kann nur die Edge Function) — nicht
Teil von T74.

Alle vier Zuteilungswege (einzeln, Treffpunkt-Leiter, Auto-Zuteilung,
Treffpunkt-Auto) laufen dafür durch **eine** Funktion `zuteilungsNotif` — den
Schalter an jedem Weg einzeln abzufragen ist die Fehlerart aus
`alle-plaetze.test.ts`. `reducer.test.ts` prüft jeden der vier Wege in beiden
Stellungen.

### T75 · Personenliste: „Nachname, Vorname" — so, wie sortiert wird ⚡ ✅ erledigt
Sortiert wird nach `ln`, dann `fn` (`personCompare`), angezeigt wurde aber
„Vorname Nachname" — der sichtbare erste Buchstabe hatte mit der Reihenfolge
nichts zu tun. Neu: `listName` (helpers.ts) liefert „Krüger, Simon" und wird
**nur** in der Personenliste verwendet.

Zwei Fälle stecken drin: ein gesetzter **Anzeigename** gewinnt unverändert (er
unterscheidet Namensgleiche und ließe sich nicht umstellen, ohne ihn zu
zerlegen), und halbe Datensätze fallen nicht auseinander (nur Vorname, nur
Nachname, ganz leer → „—"). Überall sonst bleibt `personLabel` — dort ist der
Name Anrede, nicht Sortierschlüssel.

### T76 · Konflikt-Banner: „+N weitere" muss aufklappen — und färben 🔧 ✅ erledigt
Die Zeile „+{n} weitere mögliche Konflikte" war toter Text; jetzt ist sie der
Schalter, der sie schon immer sein sollte (`aria-expanded`, Winkel dreht sich,
Beschriftung unverändert `konfMehr` — kein neuer Schlüssel für 34 Sprachen).
Gekürzt werden weiterhin nur die **Serien**: die häufigste und am wenigsten
dringende Art.

**Die Markierung im Plan** trägt `Conflict.kennung` — die Person-Id, sonst
`name:<Anzeigename>`. `useKonflikte(tab)` rechnet die Konflikte **einmal** und
gibt beides heraus: die Liste fürs Banner und `betrifft(slot)` für die Chips.
Zwei Quellen hätten früher oder später auseinandergelegen, und dann nennt das
Banner einen Namen, den im Programm nichts hervorhebt. Markiert wird an allen
vier Platzsorten plus den Treffpunkten; die Gruppen-Rotation ist keine Person
und bleibt außen vor.

**Am laufenden Stand gefunden, nicht am Reißbrett:** Die Konfliktprüfung löst
den Namen über die Personenliste zu einer Id auf (`idAufloeser`), die
Markierung verglich zuerst `pid`/Name direkt — und im Demo-Bestand tragen die
Hilfsdienst-Plätze **keine** `pid`. Der abwesende Ordner stand also im Banner,
sein Chip blieb blass. Beide Seiten benutzen jetzt dieselbe Auflösung
(`machBetrifft`); ein Test hält den Fall fest.

Dabei mitgenommen: `fsWeekConflicts` zählte die Doppelbelegung über den
**Namen** — zwei Gleichnamige wurden zu einer Meldung, und die Markierung träfe
beide. Jetzt über die Kennung, wie bei den Zusammenkünften.

**Geprüft:** `planen/konflikte.test.tsx` (8 Fälle: Aufklappen und Zuklappen,
kein Schalter ohne Rest, Markierung mit und ohne `pid`, Namensgleiche,
Gruppen-Rotation) und am Demo-Stand nachgesehen — die drei Namen des Banners
haben genau drei markierte Chips.

### T77 · Vergangenes verschwindet: Bestätigen, Dashboard, Mitteilungen 🔧 ✅ erledigt
Zuteilungen, deren Termin vorbei ist, dürfen weder zum Bestätigen vorgelegt
werden noch im Dashboard stehen; abgelaufene Mitteilungen gehören weg — „die
interessieren keinen mehr". Der Zeitbezug war vorhanden und wurde beim Filtern
nur nicht benutzt: `deriveMyTasks` trägt `at`, und seit T66 trägt jede Woche ihr
Datum.

**Die beiden offenen Fragen sind entschieden** — beide so, wie es der Rest der
App inzwischen hält:

1. **Vorbei ist der Termin am Tag danach** (`istVorbei`, tagesgenau). Dieselbe
   Körnung wie bei T82 und aus demselben Grund: Die Anfangszeit steht in den
   Einstellungen, aber wann eine Zusammenkunft *zu Ende* ist, weiß niemand. Eine
   Aufgabe, die um 20:47 aus der Liste fällt, wäre geraten.
2. **Für den Betroffenen verschwindet sie, für den Planer nicht.** Gefiltert
   wird die abgeleitete Aufgabenliste (`myTasks`) — damit ist sie aus dem
   Bestätigen, aus „Meine Aufgaben" und aus beiden Zahlen des
   Start-Bildschirms heraus („nächste Aufgabe", „noch zu bestätigen"). Die
   **„…"-Markierung im Planen** bleibt: Sie ist die Auskunft darüber, wer nie
   zugesagt hat, und die gilt auch hinterher noch. Bestätigen kann man nichts
   mehr, was vorbei ist; nachsehen schon.

Mitgenommen: Ein **Ersatzgesuch** für einen vergangenen Termin fällt ebenfalls
heraus — niemand springt für gestern ein.

**Die Mitteilungen kamen mit T86 hinterher**, denn dieselbe Lücke stand im Weg:
Sie trugen keinen Bezug zur Aufgabe. Seit migration-020 (eingespielt am
16. August) tun sie es, und was zu einem vergangenen Termin gehört, fällt beim
Laden heraus (`taskKeyVorbei`). Zeilen von **vor** dem Deploy tragen keinen
Schlüssel und bleiben stehen, bis sie über die 50er-Grenze hinauslaufen — sie
nachträglich zu deuten hieße, aus dem Anzeigetext zu raten.

**Geprüft:** `istVorbei` in vier Fällen (Tag selbst abends, Tag danach,
Künftiges, ohne Datum) und die Ableitung im Reducer — mit Gegenprobe, dass in
der zurückliegenden Woche wirklich eine Zuteilung für den Leser steckt.

### T78 · Mandantentrennung nachweisen, bevor es zwei Versammlungen gibt 🏗 ✅ erledigt
Sobald eine zweite Versammlung dazukommt, muss alles getrennt sein — keine
fremden Personen, Wochen, Mitteilungen, Abos. Angelegt ist das (RLS über
`my_congregation_id()`), **nachgewiesen ist es nicht**: genau deshalb stehen S2
und S3 unten unter „Was bewusst offen bleibt" — der Nachweis braucht zwei echte
Konten. Mit einer zweiten Versammlung wird er erst möglich — und dann Pflicht,
Tabelle für Tabelle.

> **Gemessen am 19. August 2026 — bestanden.** Es fehlte nie die Richtlinie,
> sondern der zweite Mandant. Der ist jetzt da:
> [testversammlung-anlegen.mjs](../../scripts/testversammlung-anlegen.mjs) legt
> „Probeversammlung Talheim" an — 30 erfundene Personen, drei Gruppen, die
> Dienste, Treffpunkt-Regeln, **echte** jw.org-Wochen über `import-week` samt
> Zuteilungen und zwei Konten (Planer und einfaches Mitglied). Erfundener
> Bestand steht bewusst in einem **eigenen** Skript: `versammlung-anlegen.mjs`
> legt aus gutem Grund keinen an, und ein Schalter hätte diese Doktrin
> aufgeweicht. `--entfernen <id|name> --wirklich` nimmt alles restlos zurück,
> Konten ohne `members`-Zeile eingeschlossen.
>
> Gemessen wird mit
> [mandanten-nachweis.mjs](../../scripts/mandanten-nachweis.mjs), und zwar mit
> dem **anon**-Key plus Anmeldung — nie mit dem Service-Role-Key, der RLS
> umgeht. Geprüft wird genau das, was ein Besucher in der Hand hat.
>
> | Probe | Ergebnis |
> | --- | --- |
> | **ohne Anmeldung** | 14 Tabellen → **0 Zeilen**. Ohne diese Kontrolle bewiese der Rest nichts: Eine Abfrage, die jedem nichts liefert, sähe genauso aus wie eine, die richtig filtert. |
> | **Liste, je Tabelle** | Der Talheim-Planer sieht 30 Personen, 3 Gruppen, 7 Dienste, 2 Wochen, 1 `fs_rules` — und **0 fremde Zeilen** in allen 14 Tabellen. `reminder_log` liefert auch der eigenen Versammlung nichts (RLS ohne Policy, wie vorgesehen). |
> | **gezielt über Kreuz** | Bekannte Zeilen der anderen Seite, über ihre Id geholt, kommen leer zurück — schärfer als eine Liste, die auch zufällig nichts Fremdes enthalten kann. |
> | **Schreiben** | Einfügen in die fremde Versammlung abgewiesen, Ändern trifft null Zeilen. Beides in beide Richtungen. |
>
> **Die schärfste Zahl ist `congregations = 1`:** Eine Abfrage ohne Filter,
> während nachweislich **zwei** Versammlungen existieren.
>
> Die Schreibprobe fasst echte Daten an und ist deshalb entschärft: Das Ändern
> schreibt den **vorhandenen** Wert zurück (`tel` auf sich selbst), gelöscht
> wird nichts, und ein durchgerutschtes Einfügen räumt das Skript sofort wieder
> weg. Eine Vollständigkeitsprobe hält die Prüfliste an `schema.sql`: Jede
> Tabelle mit `enable row level security` muss darin stehen, sonst wird der
> Test rot — eine neue Tabelle kann nicht stillschweigend ungeprüft bleiben.
>
> **Dabei aufgefallen:** Der erste scharfe Lauf des Anlege-Skripts brach an
> einer vertippten Kennung ab (`planner` statt `planer`) — in `main()`, das
> kein Test betritt, und oxlint sah es nicht. Die Regel `no-undef` findet
> genau das; sie ist jetzt in [.oxlintrc.json](../../.oxlintrc.json) an (mit
> `env` für Browser und Node und drei Globals). Über den ganzen Baum meldete
> sie **einen** Treffer: diesen.

### T79 · Auto-Zuteilung lässt Hilfsdienste aus — und sagt nichts 🔧 ✅ erledigt
Der Betreiber meldet: Beim automatischen Verteilen bleiben **selbst angelegte**
Hilfsdienste leer, und der **Rundgangsordner** wird nicht zugeteilt.

Die Zuteilung läuft über `state.services` und ist dem Namen nach vollständig —
sie geht jeden Dienst der Liste durch, gleich ob Standard oder selbst angelegt
([planning.ts:712](../../src/data/planning.ts)). Es hakt eine Stufe tiefer, bei
der Frage, **wer** für einen Dienst überhaupt infrage kommt. Zwei Stellen kommen
dafür in Betracht; welche davon es beim Betreiber ist, ist **gelesen, nicht
gemessen**:

1. **Ein neuer Dienst kennt niemanden.** Jeder Dienst ist sein eigener
   Aufgabenbereich (`svc:<key>`), und ein selbst angelegter bekommt den
   Schlüssel `svc-<uuid>` — einen Bereich, den bis dahin keine einzige Person
   gesetzt hat. `pick('helper', serviceQualKey(...))` findet also keinen
   Kandidaten, der Platz bleibt leer, und das bleibt so, bis der Planer den
   Schalter in **jedem** Personen-Detail einzeln umlegt. Beim Rundgangsordner
   liefe es auf dasselbe hinaus, wenn im Bestand des Betreibers nur
   „Eingangsordner" und „Saalordner" angehakt sind — nachzusehen ist das an den
   echten Daten, nicht an der Demo (die setzt alle drei Ordner-Bereiche).
2. **Der letzte Dienst geht leer aus.** Die Dienste werden in Listenreihenfolge
   besetzt, erst nach den Programmpunkten, und niemand bekommt zweierlei in
   einer Zusammenkunft (`used`). Der Rundgangsordner steht in
   `STANDARD_DIENSTE` an letzter Stelle — ist der Kreis der Ordner vorher
   aufgebraucht, bleibt ausgerechnet er übrig. Das wäre dann kein Zufall,
   sondern Bauart.
3. **Kommt der Bereich überhaupt aus NWS mit?** Der Betreiber vermutet, der
   Rundgangsordner sei bei **allen** Personen ausgeschaltet. Der Erzeuger ist es
   nicht: `build-personen-sql.mjs` bildet `svc:rund` auf das NWS-Flag `dk` ab
   (die anderen fünf Dienste liegen auf `ch`–`cl`, `rund` fällt aus der Reihe —
   auffällig, aber offenbar richtig), und beide erzeugten Dateien setzen den
   Bereich bei **14 Personen** von 111 — genauso viele wie Saalordner (13) und
   Eingangsordner (11–12). Nachzusehen bleibt also das andere Ende: ob die
   **lebende** Datenbank diese 14 heute noch trägt, und ob die Dienstliste der
   Versammlung den Schlüssel `rund` überhaupt noch führt. Trüge sie stattdessen
   einen selbst angelegten `svc-<uuid>`, zeigten beide Hälften dieses Fehlers
   auf **dieselbe** Ursache: Der Bereich der Person und der Schlüssel des
   Dienstes gingen aneinander vorbei.

**Was fehlte, war nicht das *Ob*, sondern das *Warum*.** Ein erster Entwurf
dieses Eintrags behauptete, der Planer erfahre gar nicht, dass ein Dienst offen
blieb — das stimmt nicht: Das Banner „Offene Zuteilungen" nennt jeden
unbesetzten Hilfsdienst beim Namen (`openSlotLabels` geht die Dienste mit
durch). Nur steht dort dasselbe, ob niemand mehr **frei** war oder ob überhaupt
niemand **freigegeben** ist — im zweiten Fall bleibt der Platz auch nächste
Woche und übernächste offen, und nichts sagt es.

**Umgesetzt: die Zahl steht jetzt am Dienst.** Einstellungen → Hilfsdienste
zeigt unter jedem Dienst „Eigener Aufgabenbereich · {n} Personen"; bei **0** in
Warnfarbe. Damit ist die Frage, die diesen Fehler aufwirft, in einem Blick
beantwortet — und zwar an der Stelle, an der der Planer sie auch beheben kann.
Der Text kommt ohne neuen Schlüssel aus: `personenCount` gibt es in allen 34
Sprachen. Die Gruppen-Rotation bleibt außen vor, sie hat keinen Bereich; eine
0 wäre dort eine falsche Warnung.

**Am lebenden Stand gemessen — es ist Fall 1/3.** Der Betreiber liest ab:
Rundgangsordner **0 Personen**. Und im Personen-Detail eines Ordner-Bruders:
Eingangs- und Saalordner an, Rundgang aus. Es fehlt also genau **ein** Bereich,
nicht der ganze Block — Fall 2 (die Reihenfolge) ist es nicht, und die
Algorithmus-Änderung dafür bleibt ungeschrieben. Sie hätte eine Ursache
repariert, die es nicht gibt.

Woran es beim Anlegen gelegen hat, ist damit nicht bewiesen: Der Erzeuger setzt
`svc:rund` bei 14 Personen (Flag `dk`, das als einziges aus der Reihe `ch`–`cl`
fällt), in der Datenbank ist es bei keiner. Entweder ist beim Einspielen eine
ältere Fassung gelaufen, oder der Dienst wurde in der App einmal gelöscht und
neu angelegt — dann trägt er einen `svc-<uuid>` und die alten Freigaben zeigen
ins Leere. Beides ist Vergangenheit; **repariert wird über die App**, nicht über
ein Skript, damit derselbe Fall beim nächsten neuen Dienst nicht wiederkommt.

**Umgesetzt, zweiter Teil: die Freigabe-Liste je Dienst.** Ein Tippen auf den
Dienst öffnet alle Personen mit je einem Schalter, mit Suchfeld und in der
Ordnung der Personenliste. Es sind dieselben `PrivToggle`-Zeilen wie im
Personen-Detail — derselbe Schalter, dasselbe Speichern, nur nach der anderen
Seite aufgezogen: dort eine Person und ihre Bereiche, hier ein Bereich und
seine Personen. Ein zweiter Schalter mit eigener Logik wäre früher oder später
ein zweites Verhalten. Auch das ohne neuen Wörterbuch-Schlüssel (Titel ist der
Dienstname, Unterzeile `eigenerBereich` + `personenCount`, Suchfeld `suchen`).

Die Zeile im Panel nennt seither nur noch die Zahl: dass es ein eigener Bereich
ist, sagt sie von selbst, und der Satz davor stand im Weg.

**Geprüft:** 10 Tests (Panel und Sheet), dazu die Reducer-Fälle — inklusive:
wird der Dienst gelöscht, während seine Liste offen steht, schließt sie mit.
Am laufenden Stand durchgespielt: Schalter um → Kopf 52 → 53 Personen → nach
dem Schließen steht die 53 auch am Dienst.

**Entschieden (Betreiber, 17. August 2026): „niemand freigegeben".** Ein neuer
Dienst startet leer, wie heute — es bleibt also alles, wie es ist, und **nichts
zu ändern**. Der Grund, aus dem die Frage überhaupt aufkam, ist mit der
Freigabe-Liste weggefallen: Der leere Dienst ist keine Sackgasse mehr, sondern
ein Schritt, den der Planer an einer Stelle erledigt. „Alle Verkündiger" hätte
das Gegenteil bedeutet — einen Dienst, der von selbst mit Leuten besetzt wird,
die niemand dafür vorgesehen hat. Damit ist T79 in allen Teilen geschlossen.

### T80 · Konflikt-Markierung und „Unser Leben als Christ" tragen dieselbe Farbe ⚡ ✅ erledigt
Aus T76: Der markierte Chip bekommt `background: var(--tWein)` und Rand/Schrift
in `--wein` ([planen.css:365](../../src/planen/planen.css)). Genau diese beiden
Marken sind aber die **Bereichsfarbe** von „Unser Leben als Christ"
(`farbe: 'wein'` → Panel `tWein`, Akzent `wein`,
[constants.ts:74](../../src/data/constants.ts)). In diesem Bereich sitzt die
Markierung damit auf ihrem eigenen Ton: ein gewöhnlicher Chip ist `--card` und
hebt sich vom Panel ab, der markierte verschwindet **in** ihm — die
Hervorhebung wirkt dort wie ein Chip, dem die Füllung fehlt. Und dieselbe Farbe
bedeutet zweierlei: einmal „dieser Programmteil", einmal „hier stimmt etwas
nicht".

Der Grund steht im Kommentar der Regel: die Farbe war bewusst die des
Konflikt-Banners, damit man Banner und Chip zusammendenkt. Das bleibt richtig —
nur darf die Verbindung nicht dieselbe Marke benutzen, die ein Bereich schon
für sich beansprucht.

**Gelöst mit Form statt Fläche.** Der Chip behält seine eigene Fläche
(`--card`) und markiert mit Rand und einem **Punkt** vor dem Namen — demselben
Punkt, den das Banner vor jeder Zeile führt. Eine andere Tönung wäre keine
Lösung gewesen: `tNeu`, `tNeu2`, `tPet`, `tGld`, `tWein` — **jede** Panel-Fläche
der App ist die Farbe irgendeines Bereichs, ein freier Ton existiert nicht.

**Dabei aufgefallen, am laufenden Stand gemessen:** Der „kräftigere Rand" aus
T76 war auf diesem Bildschirm gar keiner. Chrome rundet Randbreiten auf ganze
**Geräte**pixel ab; bei 125 % Skalierung (Windows-Standard) wurden aus 1,5 px
1,875 → 1 Gerätepixel, genau so viel wie beim gewöhnlichen Chip. Getragen hatte
die Markierung also allein die Farbfläche — die jetzt weg ist. Mit 2 px sind es
2 Gerätepixel, sichtbar doppelt so dick; der Ausgleich im Polster hält die
Chip-Höhe (gemessen: 27,9 px gegenüber 28,3 px).

**Geprüft:** Ein Test hält den Punkt fest (nur der markierte Chip trägt ihn),
und nachgesehen im Bereich „Unser Leben als Christ" in drei Schemata — hell
(Jasmin), einfarbig (Sesam) und dunkel (Matcha). Kontrastprobe grün.

### T81 · „X ist 3 Wochen in Folge eingeteilt" gehört nicht mehr ins Banner ⚡ ✅ erledigt
Der Betreiber: „es gibt einfach zu viele Meldungen von dieser Sorte und dauernd
wird das angezeigt. das stört nur." Damit ist die Serie (`kind: 'streak'`) aus
der Konfliktanzeige zu nehmen.

Das ist kein Widerruf von T36 — die Serienzählung ist sauber, sie überspringt
Kongresswochen, zählt über die Kennung und nur Programmpunkte. Sie ist bloß
**keine Warnung**: Die anderen drei Arten nennen etwas, das so nicht bleiben
kann (abwesend und trotzdem eingeteilt, zweimal in derselben Zusammenkunft,
Aufgabe und Hilfsdienst zugleich). Dreimal hintereinander eingeteilt zu sein ist
in einer kleinen Versammlung der Normalfall. Eine Meldung, die fast immer steht,
bringt der Planer sich ab — und übersieht daneben die, auf die es ankommt.

**Was dranhängt:** Die Serie ist die **einzige** gekürzte Art — „+{n} weitere
mögliche Konflikte" aus T76 klappt nichts anderes auf. Fällt sie weg, ist der
Schalter ohne Inhalt und gehört mit weg (`STREAK_SHOWN`, der Zustand `offen`,
die Winkel-Regeln). Fällt auch die Berechnung weg, werden `STREAK_THRESHOLD`,
der Punkt `[data-kind='streak']` und der Textschlüssel `konfSerie` zu totem Code
— sauberer wäre, sie in einem Zug mit zu entfernen (T50).

**So umgesetzt: an der Quelle gestrichen, nicht in der Anzeige gefiltert.** Ein
Konflikt, den `weekConflicts` liefert und niemand zeigt, wäre beim nächsten
Umbau ungefragt wieder ins Bild gewandert. Weg sind damit: die Serienrechnung,
`STREAK_THRESHOLD`, die Art `'streak'`, der Aufklapper samt Winkel-Regeln
(`STREAK_SHOWN`, RTL- und Bewegungs-Varianten), der Punkt
`[data-kind='streak']` — und die beiden Wörterbuch-Schlüssel `konfliktStreak`
und `konfMehr` in **allen 34 Sprachen**. Der Kopf des Abschnitts in
`planning.ts` sagt, warum es sie nicht mehr gibt; das verhindert die
Wiedereinführung besser als eine leere Stelle.

**Ein Test hing daran, ohne dass es zunächst auffiel.** Die Langzeit-Fairness
maß ihren Erfolg mit `weekConflicts(...).kind === 'streak'`: „erzeugt keine
Serien, die die Konfliktprüfung anschließend anmahnt". Nach dem Streichen wäre
er grün geblieben, ohne noch etwas zu prüfen — 0 = 0. Die **Eigenschaft** ist
weiter richtig (die Reihenfolge der Wartezeiten verhindert, dass jemand drei
Wochen am Stück drankommt), also zählt der Test die Serien jetzt selbst. Zur
Gegenprobe die Schwelle auf 2 gesenkt: 8 Personen mit einer Serie der Länge 2 —
die Messung sieht also wirklich etwas.

**Geprüft:** Zwei Tests halten die Streichung fest (in `planning.ts`, dass drei
Wochen in Folge nichts mehr melden; im Banner, dass genau dieser Fall gar kein
Banner mehr erzeugt), und am laufenden Stand nachgesehen: Wo vorher Serien
standen, nennt das Banner nur noch die zwei Abwesenden.

### T83 · „du bist qualifiziert" ist eine Selbstverständlichkeit ⚡ ✅ erledigt
**Vorgabe des Betreibers.** Der Hinweis über den Ersatzgesuchen lautete: „Für
diese Hilfsdienste wird ein Ersatz gesucht — du bist qualifiziert." Wer den Satz
überhaupt zu sehen bekommt, **ist** qualifiziert; die zweite Hälfte sagt also
nichts und nimmt der ersten die Frage. Jetzt: „… — kannst du übernehmen?"

**Die Bedingung dahinter stand schon und ist nachgeprüft**, nicht angenommen:
`deriveSubstituteReqs` überspringt jedes Gesuch, für dessen Dienst der Leser
nicht freigegeben ist (`isQualified(me, serviceQualKey(...))`) — ebenso den
eigenen Slot, abgesagte Wochen, an denen er abwesend ist, und die
Gruppen-Rotation. Ein Test hält es fest („nicht qualifiziert → kein Gesuch").
Auch die Edge Function verteilt Mitteilung und Push nur an
`priv[svc:<key>]`-Träger und weist ein `take` ohne Freigabe mit 403 ab. Und weil
Aufgaben-Bildschirm und das Blatt beim Öffnen **dieselbe** Ableitung benutzen,
gilt die Regel an beiden Stellen — es gibt nur eine.

**Die 33 Übersetzungen sind mitgezogen**, nicht liegen geblieben: Von jeder
Sprache bleibt die geprüfte erste Hälfte stehen, ersetzt wird allein der
Schlussteil. Das ist gewöhnlicher Bedientext, kein jw.org-Fachbegriff — die
Regel „lieber zusammensetzen als erfinden" gilt der Terminologie, und ein
deutscher Satz in 33 Sprachen wäre schlechter als ein übersetzter.

### T82 · Programm und Planen öffnen mit der nächsten Zusammenkunft ⚡ ✅ erledigt
**Vorgabe des Betreibers.** Wer Programm oder Planen aufruft, soll den Reiter
der **nächsten** Zusammenkunft vorfinden: Am Samstag also den Sonntag mit dem,
was als Nächstes ansteht — nicht den Reiter, der zuletzt offen war oder fest
voreingestellt ist.

Heute steht der Reiter fest auf `mid` (`init.ts:117`, nur ein Debug-Hash
überschreibt ihn) und bleibt danach, wo der Nutzer ihn zuletzt gelassen hat. Die
**Woche** wird bereits nach dem Datum gewählt (`currentWeekIndex`), die
Zusammenkunft darin nicht.

**`naechsteZusammenkunft(weeks, meetings, heute)`** liefert Woche **und** Reiter
— beides zusammen, weil der Reiter allein am Sonntagabend auf einen Termin
spränge, der schon vorbei ist. Gemessen wird auf den **Tag**: Die Anfangszeit
steht zwar in den Einstellungen, aber wann eine Zusammenkunft *vorbei* ist, weiß
niemand — ein Umspringen um 20:47 wäre geraten. Der laufende Tag zählt deshalb
mit.

Die Wochentage kommen aus `meetingDateMs` und damit aus derselben Quelle wie
Erinnerungen und Countdown: Abweichung der Woche vor eigenem Termin vor
Einstellungen. Entfallenes wird übersprungen (T30). Gesucht wird über **alle**
Wochen und in jeder über beide Zusammenkünfte statt die erste passende zu
nehmen: In der Woche des Gedächtnismahls liegt der Sondertermin auch mal vor
dem der Wochenmitte.

**Die offene Frage ist entschieden: Der Sprung gilt, bis der Nutzer selbst
wählt.** `terminGewaehlt` wird von `setTab`, `prevWeek` und `nextWeek` gesetzt;
danach bleibt die Ansicht, wo sie ist. Wer die übernächste Woche plant, kurz in
die Personenliste geht und zurückkommt, macht dort weiter. Mit dem nächsten
Laden (`hydrate`) fängt es wieder von vorn an — es ist eine Sitzungs-Sache, kein
gespeicherter Zustand. Die Treffpunkte bleiben ebenfalls unangetastet: Wer sie
ansieht, meint sie und keine Zusammenkunft.

**Geprüft:** 8 Fälle am Datum (Samstag → Wochenende, Montag → Wochenmitte, der
laufende Tag zählt mit, Sonntagabend → Folgewoche, eigene Wochentage aus den
Einstellungen, Kongresswoche übersprungen, Gedächtnismahl vor der Wochenmitte,
und „keine nächste" → alles bleibt stehen) und die Weichen im Reducer.

### T84 · Das erledigte Ersatzgesuch kam nach dem Neuladen wieder 🔧 ✅ erledigt
**Befund des Betreibers.** Er ist eingesprungen, wurde zugeteilt — und nach dem
Neuladen der Seite stand das Gesuch wieder da. „Das sollte doch erledigt sein,
sobald jemand einspringt. Und dann weder mir noch irgendjemand anderen mehr
angezeigt werden."

**Ein Platz kann zwei Bestätigungs-Zeilen haben.** Sagt A ab und springt B ein,
steht unter demselben `task_key` A mit „verhindert" und B mit „bestätigt". Die
Abfrage beim Laden kommt **ungeordnet** zurück, und die Karte `task_key →
Status` nahm schlicht die zuletzt gelesene Zeile. Mal stand der Platz danach als
besetzt da, mal als abgesagt — und im zweiten Fall leitete `deriveSubstituteReqs`
daraus wieder ein offenes Gesuch ab, für **alle** Qualifizierten.

Jetzt gewinnt **„bestätigt"** (`confirmationMap`, `lib/data.ts`): Ein Platz hat
genau einen Bearbeiter; hat einer bestätigt, ist er besetzt, gleich wer vorher
abgesagt hat. Wer selbst erst zusagt und dann absagt, hat nur **eine** Zeile
(dieselbe wird überschrieben) — dieser Fall wird also nicht verdeckt. Die
Reihenfolge der Zeilen spielt keine Rolle mehr, und das ist der Punkt: Sie war
nie garantiert.

**Was nicht gemessen ist:** ob beim Betreiber tatsächlich beide Zeilen standen.
Die Edge Function löscht die alten Bestätigungen vor dem Eintragen — dann gäbe
es das Paar gar nicht, und die Ursache läge woanders (etwa: die Übernahme kam
serverseitig nie an, dann wäre nach dem Neuladen auch die **Zuteilung** wieder
weg). Die Reihenfolge-Abhängigkeit war unabhängig davon falsch und ist die
einzige Erklärung, die zum Bild passt — „mal so, mal so" beim Neuladen.
Bleibt es dabei, ist die nächste Messung: Steht die Zuteilung nach dem Neuladen
noch?

### T85 · „An diesem Tag schon" kam erst nach dem Zusagen 🔧 ✅ erledigt
**Befund des Betreibers.** Er ist eingesprungen und war an dem Tag längst
eingeteilt. Den Hinweis gab es — aber als Toast **hinterher**
(`toastUebernommenKonflikt`). Das ist die falsche Reihenfolge: Wer es vorher
weiß, entscheidet anders.

`SubstituteReq` trägt jetzt `schonHeute` — dieselbe Liste, die das
Zuteilungs-Sheet dem Planer seit jeher neben jedem Namen zeigt
(`assignmentsInMeeting`, Beschriftung `sheetSchonHeute`, Warnfarbe wie dort).
Sie steht in **beiden** Ansichten des Gesuchs: im Aufgaben-Bildschirm und im
Blatt beim Öffnen — eine Quelle, zwei Anzeigen. Der offene Platz selbst zählt
nicht mit.

Kein neuer Wörterbuch-Schlüssel: `sheetSchonHeute` gibt es in allen 34 Sprachen.

### T86 · Die Glocke behält „Ersatz gesucht", auch wenn längst jemand da ist 🔧 ✅ erledigt
Aus T84 mitgenommen und **nicht** behoben: Die Mitteilung „Ersatz gesucht", die
beim Absagen an alle Qualifizierten geht, bleibt in deren Glocke stehen — auch
nachdem jemand eingesprungen ist. Die Ursprungsperson und die Planer bekommen
danach zwar „Ersatz gefunden", die übrigen aber behalten die alte Zeile.

**Warum es nicht nebenbei ging:** `notifications` trägt keinen Bezug zur Aufgabe
(`id, congregation_id, user_id, type, title, body, read, created_at`) — es gibt
nichts, wonach man die erledigten löschen könnte. Das braucht eine Migration
(`task_key` an der Mitteilung) und dann zwei Zeilen in der Edge Function.

**Der Rest von T77 hängt an derselben Migration:** Auch „diese Mitteilung
betrifft einen Termin, der vorbei ist" lässt sich ohne Bezug nicht sagen. Die
beiden gehören deshalb in einen Zug — und in einen Deploy, denn beides ist
Server-Arbeit.

**Geschrieben ist es, scharf noch nicht.** Fertig im Repo:

1. **`migration-020`** —
   `notifications.task_key` (NULL-bar, mit Index; Altbestand bleibt stehen und
   läuft über die 50er-Grenze aus). Auch in `schema.sql` nachgetragen, sonst
   schlägt die Schema-Probe an.
2. **`substitute`** schreibt den Schlüssel bei der Suche und **löscht beim
   Einspringen** die „Ersatz gesucht"-Zeilen zu genau diesem Platz — bei allen
   Empfängern. „Ersatz gefunden" entsteht danach und bleibt.
3. **Die App** liest den Schlüssel und lässt beim Laden weg, was zu einem
   vergangenen Termin gehört (`taskKeyVorbei`) — gemessen am echten Termin der
   Woche, nicht am Montag; bei nicht geladenen Wochen am spätestmöglichen Tag
   der Woche. Fremdformate bleiben stehen: Wer nichts über den Termin weiß,
   löscht nichts.

**Beim Betreiber erledigt am 16. August 2026:** migration-020 eingespielt,
`substitute` neu deployt. Nachgesehen mit `functions list`: `updated_at` steht
auf 15:30 Uhr und liegt damit hinter dem Commit `0e07f08` (15:01 Uhr), der die
Function anfasst; seither gibt es keinen weiteren Commit unter
`supabase/functions` — der Stand des Repos ist also in Betrieb.

**Was das nicht heilt:** Mitteilungen, die **vor** dem Deploy entstanden sind,
tragen keinen Schlüssel. Sie lassen sich weder aufräumen noch als abgelaufen
erkennen und bleiben stehen, bis sie über die 50er-Grenze hinauslaufen. Das ist
Absicht: Sie nachträglich zu deuten hieße, aus dem Anzeigetext zu raten.

### T88 · Die Actions des Deploys sind zwei bis drei Hauptversionen zurück ⚡ ✅ erledigt
Beim Push vom 16. August aufgefallen — der Lauf war grün, meldete aber:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are
> being forced to run on Node.js 24: `actions/checkout@v4`,
> `actions/setup-node@v4`, `actions/upload-artifact@v4`, `actions/deploy-pages@v4`.

**Heute harmlos, irgendwann ein Stillstand.** GitHub zwingt die alten Actions
derzeit auf Node 24; fällt diese Brücke weg, bleibt der Deploy stehen — und
zwar an der Stelle, an der die Versammlung die App bekommt. Das merkt man erst,
wenn ein Push nicht ankommt (genau so stand die Seite am 15. August sechs
Stunden auf einem alten Stand).

**Der Abstand ist größer als gedacht.** Gemessen am 16.8.2026 über
`gh api repos/<action>/releases/latest`, nicht geschätzt:

| In `.github/workflows/deploy.yml` | dort | aktuell |
| --- | --- | --- |
| `actions/checkout` | v4 | **v7** |
| `actions/setup-node` | v4 | **v7** |
| `actions/upload-pages-artifact` | v3 | **v5** |
| `actions/deploy-pages` | v4 | **v5** |

**`actions/upload-artifact@v4` steht gar nicht in der Datei.** Die Meldung
nennt es trotzdem, weil `upload-pages-artifact@v3` es intern benutzt — wer nur
hebt, was er sieht, wird diese eine Warnung nicht los. Sie verschwindet mit dem
Heben von `upload-pages-artifact`.

**Warum das kein reines Nachziehen von Zahlen ist:** Hauptversionen dieser
Actions haben schon Verhalten geändert (Artefakte unveränderlich, Namen
eindeutig), und `upload-pages-artifact` und `deploy-pages` müssen
zusammenpassen — beide zugleich heben, nicht einzeln.

**Prüfen:** heben, pushen, den Lauf ansehen. Grün **und** ohne
Deprecation-Anmerkung ist das Ziel; danach `gh run list` und die Seite selbst
gegen den neuen Commit prüfen. Geht es schief, ist die Rücknahme ein Commit —
nur eben einer, der erst auffällt, wenn jemand die Seite aufruft.

> **Gehoben am 17. August 2026.** Alle vier auf den heutigen Stand, am selben
> Tag über `gh api .../releases/latest` nachgemessen (nicht aus der Tabelle
> oben übernommen — sie ist einen Tag alt): `checkout@v7`, `setup-node@v7`,
> `upload-pages-artifact@v5`, `deploy-pages@v5`. Alle vier laufen jetzt auf
> `node24`, damit ist die Meldung an der Wurzel behoben und nicht übertönt.
>
> **Drei Brüche standen auf dem Weg — keiner trifft dieses Repo, alle drei
> nachgesehen statt vermutet:**
>
> | Bruch | Nachgesehen | Ergebnis |
> | --- | --- | --- |
> | `upload-pages-artifact@v4`: Dotfiles fallen aus dem Artefakt | `find dist -name '.*'` | keine — kein `.nojekyll`, keine `CNAME` |
> | `setup-node@v5/v6`: cacht von selbst, wenn `packageManager` in `package.json` steht | `package.json` | Feld gibt es nicht, und `cache: npm` steht ohnehin ausdrücklich da |
> | `checkout@v7`: Fork-PRs bei `pull_request_target`/`workflow_run` gesperrt | `on:` im Workflow | nur `push` auf main und `workflow_dispatch` |
>
> Ebenfalls geprüft statt angenommen: Die drei benutzten Eingaben
> (`node-version`, `cache`, `path`) stehen in den `action.yml` der neuen
> Fassungen unverändert, und die Artefaktnamen passen weiter zusammen — beide
> Pages-Actions haben `github-pages` als Vorgabe. Genau daran hängt, dass die
> beiden nur **gemeinsam** gehoben werden dürfen; ein Kommentar an der Stelle
> sagt es jetzt, damit die nächste Runde nicht eine von beiden vergisst.
>
> Die gleitenden Hauptversions-Tags bleiben (`@v7` statt einer SHA) — so war es
> hier schon, und kleine Versionen kommen dann von selbst nach.
>
> **Beleg gefahren, grün — und zwar beide Hälften.** Lauf `32055303642` zu
> `c5a28ae`: build 54 s, deploy 8 s, alle Schritte ✓. Entscheidend ist die
> zweite Hälfte, und die ist an der API gemessen, nicht am Auge:
> `check-runs/<job>/annotations` liefert für diesen Lauf **null Anmerkungen**,
> für den Lauf davor (`31969450599`) noch zwei — „Node.js 20 is deprecated …
> `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`"
> und dieselbe Meldung für `actions/deploy-pages@v4`. Damit ist auch die
> Vermutung bestätigt, dass `upload-artifact` nur mitgeschleift war: Es taucht
> nirgends in der Datei auf und ist trotzdem mit verschwunden.
>
> Und angekommen ist es auch: Das Pages-Deployment steht auf `c5a28ae` (vorher
> `04b3414`), die Seite lädt, zeigt die Anmeldung samt Sprachwahl, Konsole
> ohne Fehler. Genau die Kette, deren Stillstand dieser Punkt verhindern
> sollte.

### T89 · S2 und S3 messen, nicht lesen 🔧 ✅ erledigt (gemessen 19.8., geschlossen 23.8.2026)
Beide Befunde stammten aus dem Lesen der Richtlinien und standen seit dem
7. August unter „Was bewusst offen bleibt" — der Nachweis brauchte **zwei
Mitgliedskonten derselben Versammlung**. Seit T78 gibt es die.

[mitgliedsrechte-probe.mjs](../../scripts/mitgliedsrechte-probe.mjs) misst mit
dem anon-Key und zwei Anmeldungen, was ein **einfaches** Mitglied schreiben
kann. Vier Versuche, davon zwei Gegenproben — ohne sie bliebe offen, ob die
Richtlinie überhaupt etwas tut:

| | Versuch | Ergebnis |
| --- | --- | --- |
| 1 | Bestätigung auf eine **fremde** Aufgabe, eigene `user_id` | **angekommen (201)** — S2 bestätigt |
| 2 | dieselbe Zeile mit **fremder** `user_id` | abgewiesen (403) — die Grenze greift |
| 3 | Mitteilung `verhindert` mit freiem Text an den Planer | **angekommen (201)** — S3 bestätigt |
| 4 | dieselbe Mitteilung als Typ `zuteilung` (nur Planer) | abgewiesen (403) — die Grenze greift |

Gemessen am schärfsten Fall: Das Mitglied setzte **„verhindert" auf einen
fremden Hilfsdienst** (Mikrofon, Fabian Ziegler) — genau die Zeile, aus der
`deriveSubstituteReqs` ein Ersatzgesuch macht. Der Planer sah sie anschließend
auf dem fremden Platz. Jede geschriebene Zeile hat die Probe sofort wieder
gelöscht; nachgesehen: `confirmations` und `notifications` sind hinterher leer.

> **Beinahe ein falscher Freispruch.** Die erste Fassung schrieb mit
> `Prefer: return=representation` und bekam auf die Mitteilung ein **403** —
> S3 wäre als „greift nicht mehr" abgehakt worden. Ursache ist nicht die
> Richtlinie: PostgreSQL wendet SELECT-Richtlinien auf die
> `RETURNING`-Klausel an, und der Absender darf eine Mitteilung an jemand
> anderen nicht zurücklesen. Mit `return=minimal` geht dieselbe Zeile durch.
> Die App macht es von sich aus richtig ([data.ts:1336](../../src/lib/data.ts:1336)
> fügt ohne `.select()` ein) — die Probe tat es nicht. Seither hängt das Urteil
> daran, ob die Zeile **am Ziel** liegt, nicht am Status; ein Test hält den
> Fall fest.

**Was daraus folgt** — der Befund ist bestätigt, die Lücke damit offen:
`confirmations_write` prüft nur, wem die Zeile gehört, nicht ob der `task_key`
dieser Person zugeteilt ist. Zu schließen wäre das in der Richtlinie (der
`task_key` müsste gegen die Zuteilung geprüft werden) — beim Programmpunkt
steckt die Zuteilung allerdings im JSONB der Woche, was eine Prüfung in SQL
teuer macht. Der Zuschnitt gehört mit dem Betreiber besprochen, bevor jemand
eine Migration schreibt.

> **Geschlossen am 23. August 2026 —
> `migration-022`.**
> Der Betreiber hat den Zuschnitt entschieden („mach T89"), und die Prüfung ist
> billiger als befürchtet: Der `task_key` **sagt selbst, wo die Zuteilung
> steht** — Wochen-Kennung, Zusammenkunft und der Weg zum Platz. Nachgeschlagen
> wird damit nur die **Speicherform** (`data->'mid'->'sections'->…`), nicht die
> Fachregel; das Wissen wird also nicht in einer zweiten Sprache verdoppelt.
> Teuer ist es auch nicht: Eine Bestätigung schreibt jemand ein paar Mal die
> Woche, kein Massenpfad.
>
> `public.task_gehoert_mir(task_key)` kennt alle sechs Formen (Programmpunkt
> mit stabiler Kennung und in der alten Position, beides auch für die
> Zusätzliche Klasse, Ratgeber, Hilfsdienst, Treffpunkt), dazu die beiden
> Speicherarten eines Hilfsdienst-Platzes (Objekt und Alt-String) und den
> Namens-Rückfall für Plätze ohne `pid`. Ein **Freitext**-Leiter gehört
> niemandem hier (T63) — ihn kann auch niemand bestätigen.
>
> **Unbekannte Formen bleiben ausdrücklich erlaubt.** Eine zu strenge
> Richtlinie bräche das Bestätigen, und zwar fast lautlos — der Client schreibt
> fire-and-forget. Ein Schlüssel, den die App liest, ist immer eine der sechs
> Formen; eine erfundene trifft keinen Platz und bleibt wirkungslos. Damit ist
> der schlimmste Ausgang „so offen wie bisher", nicht „App kaputt".
>
> Gegen das Rosten dieser Liste steht eine Vollständigkeitsprobe:
> `src/data/task-key-formen.test.ts` liest die Schlüssel-Erzeuger im Quelltext
> und wird rot, sobald eine Form dazukommt oder sich ändert — sonst fiele die
> siebte still in den Durchlass.
>
> **Offen: die Gegenprobe.** Die Migration ist am 23. August eingespielt, aber
> noch nicht gemessen — und gerade hier zählt nur das Messen. Dafür ist
> `scripts/mitgliedsrechte-probe.mjs` umgestellt: Sie prüft nicht mehr, ob die
> Lücke da ist, sondern ob sie zu ist — **in beide Richtungen**. Vier Versuche
> müssen scheitern, zwei müssen durchkommen (eigene Aufgabe bestätigen; Absage
> an den Planer). Ohne die letzten beiden bewiese sie nichts: Eine Richtlinie,
> die alles abweist, bestünde jede Fremd-Probe glänzend und bräche dabei die
> App — fast lautlos, weil der Client fire-and-forget schreibt.
>
> `node scripts/mitgliedsrechte-probe.mjs --versammlung 0a43ea1b-…` (Talheim,
> nicht die echte Versammlung — die Probe schreibt kurz).
>
> **Nachtrag 24.8.2026:** Die Probe deckt jetzt auch S10, S11 und S13 ab (siehe
> T97) — zehn Fälle statt sechs, drei davon Gegenproben. Erwartet: **0 von 7
> verbotenen Schreibversuchen kamen durch**. Die Gegenprobe zu 022 ist damit
> immer noch nicht *gelaufen*, aber sie wäre jetzt eine Messung aller fünf
> Befunde in einem Durchgang statt zweier getrennter Termine.
>
> Die zweite Hälfte (S3) ist mitgeschlossen: Eine Mitteilung vom Typ
> `verhindert` darf nur noch an **Planer** gehen, nicht mehr an beliebige
> Mitglieder. Was bleibt und hier offen benannt sei: Ein Mitglied kann den
> Planern eine erfundene Absage schicken. Dafür bräuchte die Mitteilung den
> `task_key` — den setzt der Client an dieser Stelle noch nicht, und ihn
> nachzurüsten hieße, die Reihenfolge zweier unabhängiger Schreibvorgänge zu
> garantieren (beide laufen fire-and-forget). Der Rest-Schaden ist ein Planer,
> der einmal nachfragt.

---

## Aufgenommen am 22. August 2026 — NWS-Import und Gruppentreffpunkte (T90–T92)

Aus einer Frage des Betreibers: „Kannst du Treffpunkte auch aus NWS
extrahieren?" — und, im selben Atemzug: „Meine Abwesenheiten scheinen nicht
importiert worden zu sein."

### T90 · Abwesenheiten kamen nie in die App — und wurden dabei gelöscht 🏗 ✅ erledigt
Der Verdacht des Betreibers war zu freundlich („vielleicht hat niemand
importiert"). Es gab **keinen Weg**: Kein Skript hat je in `absences`
geschrieben. Umgekehrt schon: Der Personen-Neuaufbau
(`nws-export/build-personen-sql.mjs`) begann mit `delete from public.absences;`
— er löschte damit das einzige, was Verkündiger selbst erfassen, und baute es
nicht wieder auf, weil Abwesenheiten gar nicht aus den Stammdaten kommen.

Die Planung liest `absences` seit `migration-015`
versammlungsweit. Ohne Import plante die App also gegen einen leeren Kalender
und teilte Verreiste ein, ohne dass es jemandem auffiel — dieselbe stille
Fehlerart, die dieses Dokument von der ersten Seite an verfolgt.

> **Erledigt.** [abwesenheiten-importieren.mjs](../../scripts/abwesenheiten-importieren.mjs)
> holt `AwayPeriods` (72 lebende Zeiträume) über die stabile Id
> (`uuid5("person:<NWS-ID>")`) an die App-Person. `UnavailablePeriods`
> („nicht verfügbar") sind mit `--auch-unverfuegbar` dazuzunehmen — fachlich
> etwas anderes, für die Planung dieselbe Folge; voreingestellt aus, weil davon
> fast alles Vergangenheit ist. Vergangenes bleibt ohnehin draußen (Grenze ist
> das **Bis**-Datum, nicht das Von — der laufende Zeitraum ist der wichtigste),
> und ein zweiter Lauf legt nichts doppelt an.
>
> **Person statt Konto.** Eine importierte Abwesenheit hat keinen Ersteller.
> Trüge sie ersatzweise das Konto des Planers, stünden dessen „Deine Einträge"
> voll mit den Abwesenheiten der ganzen Versammlung —
> [AufgabenScreen.tsx:38](../../src/aufgaben/AufgabenScreen.tsx:38) filtert auf
> `userId === meiner || personId === meine`. Deshalb macht
> `migration-021`
> `user_id` NULL-bar. Das riss aber den Schreibschutz auf: Die alte Regel war
> `user_id = auth.uid() or is_planner()`, und bei NULL hätte nicht einmal der
> Betroffene seine eigene Abwesenheit löschen können. Also kam der Zweig über
> die **Person** dazu (`my_person_id()`, gebaut wie `is_planner()`).
>
> **Am Trockenlauf aufgefallen (23. August):** NWS behält beim Ändern die alte
> Zeile. Eine ganze Familie stand mit `10.–30.08.` (Zeitstempel 8. Januar)
> **und** `10.–31.08.` (30. Januar, ein Tag drangehängt) im Bestand, beide
> lebend; dazu Zeiträume, die ganz in einem anderen liegen (`01.–28.12.` neben
> `11.–21.12.`, sogar mit demselben Zeitstempel), und eine exakte Dublette mit
> zwei IDs. Gemessen: **7 Personen, 12 überlappende Paare** von 72 Zeiträumen.
> Der Import fasst sie jetzt je Person zusammen — die **Vereinigung**, nicht
> „die neuere gewinnt": Abwesend ist ein Ja/Nein je Tag, zwei überlappende
> Zeiträume können nichts Verschiedenes behaupten, und am Zeitstempel zu
> entscheiden hieße raten (bei den enthaltenen ist er identisch). Zusammengefasst
> wird **vor** dem Datumsfilter, weil ein abgelaufener Zeitraum einen laufenden
> verlängern kann. Aus 69 einzufügenden Zeilen wurden so 59.
>
> `build-personen-sql.mjs` löscht die Abwesenheiten nicht mehr — und hebt die
> Verknüpfung zur Person über den Neuaufbau (der Fremdschlüssel steht auf
> `on delete set null`, das Löschen der Personen kappte sie sonst; möglich ist
> das Zurückschreiben, weil die Person-Ids deterministisch sind). Im selben Zug
> ist dort die Spalte `absent` aus dem `insert` verschwunden: migration-015 hat
> sie entfernt, das erzeugte SQL wäre an der ersten Personenzeile gescheitert.

### T91 · Treffpunkte aus NWS — die Leiter fehlten 🏗 ✅ erledigt
NWS führt in `FieldServiceMeetings` jeden Treffpunkt mit Datum, Uhrzeit, Ort
(`FieldServiceLocations`) und Leiter; die App kannte davon nichts. Der
**Grundplan** bleibt bewusst beim Planer — importiert wird, was sich Woche für
Woche ändert.

> **Erledigt.** [treffpunkte-importieren.mjs](../../scripts/treffpunkte-importieren.mjs)
> ordnet jeden Termin über den Montag seiner Woche und darin über
> **Wochentag + Uhrzeit** einem Treffpunkt zu und setzt dessen Leiter (Name und
> `lpid`). Was der Grundplan nicht kennt — Pioniertag, „Großer Treffpunkt", ein
> einzelner Nachmittag —, wird als Treffpunkt **nur für diese Woche** angelegt,
> mit einer aus der NWS-Kennung abgeleiteten Id: Beim zweiten Lauf steht er
> nicht ein zweites Mal da. Am echten Bestand gemessen: 74 Termine in 29
> Wochen, mit einem Grundplan aus Mo 14:30 / Mi 09:30 ergibt das 48 gesetzte
> Leiter und 18 zusätzliche Termine.
>
> Zwei Regeln, an denen mehr hängt, als es aussieht. **Ein leerer NWS-Leiter
> löscht nichts** — in NWS steht dann `-2`, und ein fehlender Wert ist keine
> Aussage; überschriebe er, wäre die Zuteilung des Planers weg, ohne dass es
> auffiele. Und **die Freitext-Marke fällt weg**, wenn eine Person aus der
> Versammlung übernimmt (T63): Bliebe `lext` stehen, zählte die Leitung in
> keiner Auslastung und in keiner Aufgabenliste — der Import hätte jemanden
> eingeteilt, der davon nie erführe.
>
> **Gruppen kennt NWS nicht.** Alles Importierte ist deshalb
> Versammlungstreffpunkt; passt ein Termin auf mehrere Gruppentreffpunkte und
> auf keinen der Versammlung, wird er gemeldet statt geraten.

### T92 · Ein Gruppentreffpunkt geht nur seine Gruppe an 🔧 ✅ erledigt
Anlegen und Planen war längst richtig zugeschnitten (`is_group_overseer()`,
`onlyGroup` in Grundplan und Planen-Tab). Das **Sehen** nicht: Der
Programm-Reiter zeigte jedem alle Gruppentreffpunkte — bei vier Gruppen vier
Samstagstermine, von denen drei niemanden angehen. Das Handbuch behauptete
dabei seit jeher das Richtige („die Gruppentreffpunkte **deiner**
Predigtdienstgruppe"), nur die App tat es nicht.

> **Erledigt.** `fsVisible` ([fs.ts](../../src/data/fs.ts)) ist die eine Stelle:
> Versammlungstreffpunkte für alle, ein Gruppentreffpunkt für seine Gruppe
> (`Person.grp`) und für den, der sie leitet — Aufseher und Gehilfe stehen nicht
> zwingend selbst in ihrer Gruppe, säßen sonst vor einem leeren Programm. Der
> Planer sieht weiter alles; er plant für jede Gruppe.
>
> Es ist eine **Anzeige-Regel, keine Sperre**: Alle Treffpunkte einer Woche
> liegen in *einer* jsonb-Zeile (`fs_weeks.data`), RLS kann darin nichts
> ausblenden. Eine echte Trennung bräuchte eine Zeile je Gruppe — bewusst nicht
> gebaut, Treffpunkte sind innerhalb der Versammlung nichts Vertrauliches.
>
> Bewacht ist **der Aufrufer**, nicht nur die Regel: Ein DOM-Test rendert den
> Programm-Reiter als Verkündiger der Gruppe 1 und verlangt, dass Gruppe 2 nicht
> darin vorkommt; zwei Einträge im
> [Mutationskatalog](../../scripts/mutationsprobe.mjs) messen beide Hälften.
> Genau daran hätte die alte Fehlerart wieder gegriffen — Regel richtig, Ansicht
> fragt sie nicht.
>
> **Nebenbefund:** Die Verkündiger-Ansicht war gar nicht anzusehen. Der
> Debug-Hash kannte nur `p=` (*ausgewählte* Person); im Demo-Modus gehörte die
> App niemandem, `state.personId` blieb null. Neu ist `me=<Person-Id>` — damit
> zeigt der Doku-Screenshot `verkuendiger-treffpunkte.png` erstmals, was ein
> Verkündiger wirklich sieht.

### T93 · Abwesenheiten gehören der Person, nicht dem Konto 🔧 ✅ erledigt
Nach dem Import (T90) stellte der Betreiber die naheliegende Frage: „Wo sehe ich
meine Abwesenheiten und die von anderen?" Die eigenen: unter **Meine Aufgaben**.
Die von anderen: **nirgends**. Sie wirkten nur, wo sie etwas verhindern — als
Chip „Abwesend" im Zuteil-Blatt, im Konflikt-Banner, in der Auto-Zuteilung.
Eintragen konnte der Planer für niemanden, obwohl die Datenbank es ihm erlaubt
(`is_planner()`): Die meisten Verkündiger haben gar kein Konto und können es
selbst nicht.

> **Erledigt.** Die Karte steht jetzt auch im **Personen-Detail**, direkt unter
> der Zeitleiste — die Gegenrichtung zu ihr: die Zeitleiste sagt, wann jemand
> dran war, die Abwesenheiten, wann er nicht kann. Eine **gemeinsame**
> Komponente (`src/components/AbsencePanel.tsx`) bedient beide Stellen; zweimal
> abgeschrieben wäre die Prüfung „Von vor Bis" beim zweiten Mal verloren
> gegangen. Bearbeiten darf, wen es selbst betrifft, oder ein Planer — dieselbe
> Grenze wie `absences_write`, sonst zeigte das Formular etwas an, das die
> Datenbank abweist.
>
> **Zwei Fehler kamen dabei heraus, beide von der Sorte „zweiter Aufrufer".**
>
> `persist.ts` gab `saveAbsence` die Person des **Angemeldeten** mit
> (`next.personId`) statt der aus dem Datensatz. Solange jeder nur seine eigenen
> erfassen konnte, stimmte das; beim ersten Eintrag des Planers für jemand
> anderen wäre die Zeile auf ihm gelandet — und aufgefallen wäre es niemandem,
> weil sie in **keiner** der beiden Listen erschiene. `saveAbsence` nimmt Person
> und Ersteller jetzt aus dem Datensatz; die Parameter daneben sind weg.
>
> „Deine Einträge" filterte auf `userId === meiner || personId === meine`. Der
> erste Zweig war schon vor dem Import zu weit — mit ihm hätte der Planer alles,
> was er für andere einträgt, in seiner **persönlichen** Liste stehen. Jetzt
> entscheidet die **Person**; der Ersteller trägt nur noch den Fall, für den er
> gedacht war: ein Konto ohne eigene Person, das seine Einträge sonst nicht
> wiederfände. Beide Regeln stehen im
> [Mutationskatalog](../../scripts/mutationsprobe.mjs), und
> `src/components/abwesenheiten.test.tsx` stellt jede Frage an **beide**
> Aufrufer.
>
> **Nebenbefund:** `ui.test.ts` verlangt jeden Schlüssel in jedem Overlay (kein
> stiller Englisch-Rückfall). Das neue „EINTRÄGE" ist deshalb in allen 33
> Sprachen nachgetragen — aus der jeweils vorhandenen Wendung für „DEINE
> EINTRÄGE" abgeleitet.
>
> **Nachgezogen am 23. August — in die Zeitleiste statt darunter.** Die Liste
> unter dem Formular zeigte, *dass* jemand weg ist, aber nicht, was in den
> Zeitraum fällt: Eine Zuteilung mitten in einer Abwesenheit stand ein Panel
> weiter oben und hatte damit nichts zu tun. Jetzt stehen die Zeiträume **in**
> der Leiste — zwei Punkte für Beginn und Ende, die Strecke dazwischen
> eingefärbt. Was hineinfällt, sitzt sichtbar darin.
>
> Der Punkt trägt die volle Farbe (`--wein`), die Strecke dieselbe leicht
> gedämpft und etwas breiter. Die Dämpfung war zuerst zu stark: Über den gold
> getönten Grund gemischt wandert Rot nach Braun und steht dann neben der
> goldenen Grundlinie — zwei warme Töne, die man erst beim Hinsehen
> unterscheidet (gemessen `164,117,81` gegen `201,176,116`; der Betreiber hat
> es prompt gemeldet). Bei 85 % sind es `131,65,50` und damit ein klares Rot.
> **Lehre:** Eine Farbe auf getöntem Grund ist nicht die Farbe, die im Token
> steht — sie gehört am gerenderten Bild nachgemessen, nicht am Wert.
>
> Gerechnet wird die Färbung nicht paarweise, sondern mit einem Zähler offener
> Zeiträume: Bei zwei überlappenden hätte das erste Ende die Farbe sonst
> abgeschaltet, obwohl der zweite noch läuft.
>
> Die Ränder fassen den Tag ein — der Beginn steht vor den Zuteilungen seines
> Tages, das Ende dahinter. Ohne diese Reihenfolge liefe die Strecke an einer
> Zuteilung vorbei, die sehr wohl in den Zeitraum fällt.
>
> Die Überschrift heißt darum nicht mehr „AUFGABEN", sondern **„ZEITLEISTE"**:
> Sie führt jetzt beide Richtungen — wann jemand dran ist und wann er nicht
> kann. Entfernt wird mit dem ✕ am Beginn; ohne das ließe sich ein Eintrag nur
> noch anlegen, nie wieder löschen.
>
> **Dabei aufgefallen:** Die Blätter-Pfeile der Datumsauswahl saßen nicht mittig
> im Kreis. `.dp-nav` zentrierte seinen Inhalt nicht — und das Chevron ist ein
> `display:block`-SVG (Chevron.tsx), also ein Block-Kind, das an den Anfang der
> Inhaltsbox rückt und auf das `text-align` nicht wirkt. Gemessen: 1 px links
> gegen 18,3 px rechts, senkrecht mittig. `.week-arrow` hatte die drei
> Flex-Zeilen von Anfang an, `.dp-nav` nie.

### T94 · Der Admin-Schalter zeigte die falsche der zwei Wahrheiten 🔧 ✅ erledigt
Der Betreiber fragte, warum „Admin" bei seinem eigenen Konto ausgegraut ist.
Ausgegraut ist es mit Absicht — es ist die eigene Person, und niemand soll sich
mit einem Fingertipp aussperren; dieselbe Grenze zieht die Datenbank
(`members_delete` … `user_id <> auth.uid()`). Dass der Schalter dabei **aus**
zeigte, war jedoch falsch: Er ist Admin.

Das Recht steht an zwei Stellen. `persons.planner` ist die **Vormerkung** (wird
beim Einladen in den Code übernommen, damit jemand das Recht ab der ersten
Anmeldung hat); sobald ein Konto verknüpft ist, entscheidet `members.planner` —
daran hängen `is_planner()` und `state.planner`. Angezeigt wurde die
Vormerkung.

Solange beide gemeinsam entstanden, fiel das nicht auf. Der Personen-Neuaufbau
aus New World Scheduler schreibt die Spalte aber gar nicht mit — in
`import-live-personen.sql` kommt das Wort `planner` **null Mal** vor. Seither
stand sie bei allen 111 Personen auf `false`, während die Konten ihr Recht
behielten.

> **Erledigt.** Der Schalter nimmt jetzt das Konto, wo es eines gibt, und die
> Vormerkung nur dort, wo keines existiert (Eingeladene, die sich noch nicht
> angemeldet haben). Im Katalog der Mutationsprobe bewacht.
>
> `build-personen-sql.mjs` legt die Vormerkung über den Neuaufbau beiseite und
> schreibt sie zurück — dieselbe Stelle, an der seit T90 schon die
> Abwesenheiten gerettet werden. Ohne das verlöre jeder Ohne-Konto-Admin sein
> Recht bei jedem Personen-Import, still.

### T95 · Start-Bildschirm: Ideen sammeln 🔧 ✅ erledigt
Vom Betreiber am 23. August 2026 nebenbei aufgenommen: **Ideen für eine bessere
Dashboard-Ansicht.** Ausdrücklich noch kein Auftrag zu bauen — erst sammeln.

Was heute darauf steht: Begrüßung mit Datum, die **nächste eigene Aufgabe** als
Hero-Karte (mit Bestätigen/Öffnen), zwei Kacheln (offene Zuteilungen, mögliche
Konflikte), die aktuelle Woche und für Planer ein Sprung ins Planen.

Fragen, die eine Idee beantworten sollte, bevor sie hier steht:

- **Für wen?** Verkündiger und Planer sehen denselben Bildschirm, brauchen aber
  Verschiedenes — der eine seine nächste Aufgabe, der andere den Stand der
  Woche. Bisher ist es beides in einer Spalte.
- **Was ist die Handlung?** Jede Kachel sollte zu etwas führen. „3 mögliche
  Konflikte" tut das (Sprung ins Planen), eine reine Zahl täte es nicht.
- **Was fehlt heute wirklich?** Kandidaten aus dem Betrieb: wie viele Wochen
  noch geladen sind (der Import läuft nicht von selbst), wer diese Woche fehlt
  (siehe T72), ob Erinnerungen rausgegangen sind.

Die Reihenfolge ist die Lehre aus T72: erst der Zweck, dann der Zuschnitt.
Ein Dashboard „schöner machen" ohne Frage dahinter wird eine Kachelwand.

#### Gesammelt am 2. September 2026

Nachgesehen wurde im Code, nicht geschätzt: Für jeden Kandidaten unten steht
fest, ob die Daten heute schon im Zustand liegen und wer sie bisher zu sehen
bekommt. Zwei der drei Kandidaten aus dem Betrieb (oben) haben das nicht
überstanden — sie stehen weiter unten mit Begründung.

**Der Befund, der über allen Kacheln steht.** `src/dashboard/DashboardScreen.tsx`
baut in dieser Reihenfolge: Gruß → eigene nächste Aufgabe → diese Woche →
Mitteilungen/zu bestätigen → und **ganz unten, nur für Planer**, ein Knopf mit
„N offene Zuteilungen · M mögliche Konflikte". Der Planer sieht also zuerst sein
eigenes Verkündiger-Leben und seine Arbeit als letzte Zeile. **Der Bildschirm
ist nach Person sortiert, nicht nach Rolle.** Das ist die Antwort auf „für wen?"
und fällt vor jede einzelne Kachelidee: Solange die Reihenfolge fest ist,
schiebt jede neue Planer-Kachel den Planer-Teil nur weiter nach unten.

**Vier Kandidaten, die die drei Fragen bestehen:**

| Idee | Für wen | Handlung | Daten |
| --- | --- | --- | --- |
| **1 · Der Wochenvorrat läuft leer** | Planer | Sprung nach Einstellungen → Import | `loadedUntilMs(state.weeks)` — liegt fertig |
| **2 · Geplant, aber nicht gesendet** | Planer | Sprung nach Planen → Plan senden | `zuletztGesendet` / `offeneMeldungen` — liegen fertig |
| **3 · „3 offen, davon 1 gar nicht besetzbar"** | Planer | kein neues Element — ein besserer Satz auf der vorhandenen Kachel | `engpaesse` / `offenTrotzAllem` (T96) |
| **4 · Treffpunkte fehlen in „Diese Woche"** | beide | dieselbe wie heute | `state.fsWeeks` — schon auf dem Bildschirm |

**Zu 1:** Der Import holt **eine** Woche je Knopfdruck (`ImportPanel.tsx`) und
läuft nicht von selbst. Wie weit die Programme reichen, sagt `loadedUntilMs` in
`src/lib/import.ts` — und diese Funktion wird an **genau einer** Stelle benutzt:
im Import-Panel selbst. Also dort, wo man nur hingeht, wenn man ohnehin
importieren will. Wer zwei Wochen nicht daran denkt, plant ins Leere, und nichts
sagt es ihm. Der Kandidat mit dem klarsten „ohne diesen Hinweis merkt es keiner".

**Zu 2:** Seit T99 ist das Senden ein eigener Knopfdruck. Damit gibt es einen
Zustand, den es vorher nicht gab: eine fertig geplante Woche, von der die
Eingeteilten nichts wissen. `zuletztGesendet(sentLog, week.start)` und
`offeneMeldungen(…)` stehen fertig in `src/data/plan-versand.ts` — heute liest
sie nur das `PlanSendenPanel`, also erst, wenn man schon dort ist. Diese Lücke
hat T99 selbst aufgemacht; der Start-Bildschirm ist der Ort, an dem sie auffiele.

**Zu 3:** T96 hat `engpaesse` gebaut — was nicht besetzbar ist, weil zu wenige da
sind. Das lebt heute in einem Banner **innerhalb** von Planen, je Reiter. Auf dem
Start-Bildschirm steht daneben „N offene Zuteilungen", was etwas anderes meint
(was der Planer noch nicht getan hat). Das ist keine neue Kachel wert — aber die
vorhandene sagt heute die schwächere von zwei Aussagen. „3 offen, davon 1 gar
nicht besetzbar" ist ein anderer Arbeitstag als „3 offen".

**Zu 4:** Der Wochenblock läuft über `MEETING_TABS` — Wochenmitte und Wochenende,
sonst nichts. Die Konfliktzahl desselben Bildschirms rechnet Treffpunkte aber
**mit** (`fsWeekConflicts`). Ein Treffpunkt-Leiter sieht seine Einteilung in der
Hero-Karte, sobald sie die nächste ist (über `deriveMyFsTasks` landet sie in
`myTasks`) — im Wochenüberblick darunter nie. Zwei Zeilen auf einem Bildschirm,
die verschieden viel von derselben Woche wissen.

**Drei, die durchfallen — damit sie nicht wiederkommen:**

- **„Wer diese Woche fehlt"** (stand oben als Kandidat): Die Daten gibt es
  (`state.absences`, `useAbwesend`), aber die Handlung fehlt. Für den Verkündiger
  ist es fremde Information. Für den Planer zählt eine Abwesenheit erst, wo sie
  auf eine Zuteilung trifft — und **genau das** sagt die Konfliktzahl schon. Eine
  rohe Abwesenheitsliste ist eine Zahl ohne Griff. Wörtlich die Lehre aus T72.
- **„Ob Erinnerungen rausgegangen sind"** (stand oben als Kandidat): fällt an der
  dritten Frage. `reminder_log` existiert serverseitig (migration-011), wird aber
  **nicht** in den Client-Zustand geladen; im ganzen `src/` kommt der Name nicht
  vor. Das wäre neue Verkabelung, nicht eine Kachel. Kandidat 2 beantwortet die
  bessere Nachbarfrage mit Daten, die schon da sind.
- **Ersatzgesuche auf den Start-Bildschirm:** stehen schon an zwei Stellen — im
  Dialog beim Öffnen (T69, bewusst dort, weil zeitkritisch) und im
  Aufgaben-Screen. Eine dritte Stelle ist Wiederholung, keine neue Auskunft.

**Weiterhin `☐ offen`, und zwar richtig so:** Gesammelt ist, entschieden nicht.
Die Rollenfrage aus dem Befund oben trennt sich im Text nicht mehr — ob geteilter
Bildschirm, zwei Reiter oder eine nach Rolle umsortierte Spalte, das ist der
Punkt, an dem ein Bild schneller ist als ein Absatz. Kandidat 1–3 sind alle
Planer-Sachen und landen nach heutiger Reihenfolge alle unter dem persönlichen
Teil; das ist die Entscheidung, die vor dem Bauen steht.

#### Entschieden und gebaut am 13. September 2026

> **Der Bauauftrag kam vom Betreiber** („das neue Dashboard machen"). Die
> offene Zuschnitt-Frage ging als Skizze an ihn — eine nach Rolle sortierte
> Spalte, zwei Reiter, ein geteilter Bildschirm — und ist entschieden: **eine
> Spalte, nach Rolle sortiert.** Zwei Reiter verdecken immer eine Hälfte, und
> ein Hinweis hinter einem Reiter wird nicht gesehen; der geteilte Bildschirm
> löst die Frage nur am Schreibtisch, am Handy stünde die Planung wieder unten.
> Dazu zwei Folgefragen: Die Karte schaut auf die **kommenden Wochen** statt auf
> die laufende, und **Gruppenaufseher** bekommen vorerst keine eigene Karte
> (stand nicht unter den Kandidaten und wurde im Betrieb nicht vermisst).

**Was jetzt dasteht.** Beim Planer direkt unter dem Gruß die **Planungs-Karte**:
eine Zeile je Woche, in der etwas zu tun ist — ab der laufenden
Kalenderwoche, höchstens vier. Ihre Chips heißen wie die Banner in Planen
(Mögliche Konflikte, Nicht besetzbar, Offene Zuteilungen, Plan senden), und
die Zähler tragen deren Farbe. Ein Tipp öffnet Planen auf genau dieser Woche
und dem Reiter, in dem etwas offen ist — über `navigate` mit Zielwoche, also
durch dieselbe Rechteprüfung. Ist nichts zu tun, schrumpft die Karte auf
„Alles zugeteilt"; Verkündiger und Gruppenaufseher sehen den Bildschirm wie
bisher. Die eigenen unbestätigten Aufgaben verliert der Planer dabei nicht aus
dem Blick — die legt ihm das Blatt beim Öffnen vor (T69).

Alle vier Kandidaten sind damit umgesetzt:

- **1 · Wochenvorrat** — als Hinweis **mit Handlung**: Reichen die Programme
  weniger als drei Wochen voraus, steht der Import-Knopf gleich auf der Karte,
  statt in die Einstellungen zu springen (dort ist das Panel das letzte von
  sieben). Der Ablauf liegt dafür in `einstellungen/useWochenImport.ts` statt
  im Panel — mit seinen Grenzen: offline wird gar nicht erst angefangen,
  fehlende Sprachvarianten werden zuerst nachgeholt.
- **2 · Geplant, nicht gesendet** und **3 · nicht besetzbar** — als Chips
  derselben Zeile.
- **4 · Treffpunkte in „Aktuelle Woche"** — die **eigenen**, in der Folge der
  Woche einsortiert (der Montag vor dem Dienstag). Wem eine Leitung gehört,
  entscheiden dieselben zwei Stellen wie beim DU-Chip im Programm:
  `fsLeiterZuteilung` (Freitext gehört niemandem) und `gehoertZu` (Id vor
  Name).

**Was die alte Kachel falsch machte, und warum die Karte es nicht wiederholt.**
Sie nannte die laufende Woche — am Sonntag eine abgelaufene. Und sie zählte,
was vorbei ist: Am Donnerstag stand der offene Platz vom Dienstag bis zum
Wochenende als Arbeit da, die niemand mehr erledigen kann. Die Karte zählt nur,
was ansteht (T77), tagesgenau wie `istVorbei`. Neu gerechnet wird dabei
nichts: Jede Zahl kommt aus der Funktion hinter dem gleichnamigen Banner
(`src/data/planungsstand.ts`). Gezählt wird je Woche statt je Reiter; und was
vorbei ist, lassen die Banner in Planen stehen — „Plan senden" dagegen lässt es
seit der Durchsicht unten auf allen Seiten weg.

**Kein neuer Wörterbuch-Schlüssel.** Alle Texte der Karte gab es schon in 34
Sprachen (die Banner-Titel, „Geladen bis", der Import-Knopf). Die Form „Titel +
Zahl" hat das Pluralproblem nicht, das T96 beim Übersetzen fand — die alte
Kachel schrieb „1 Konflikte". Ihr Schlüssel `dashKonflikteN` ist aus allen 34
Wörterbüchern entfernt. `npm run contrast` prüft jetzt auch die Zähler auf Wein
und Gold, die seit T96/T99 in den Bannern stehen und nun auf der Karte (in allen
elf Paletten über 4,5 : 1).

**Geprüft:** `planungsstand.test.ts` (25 Fälle — vergangene Woche, Sonntag,
Donnerstag, Lücke im Bestand, Kongress, Treffpunkte, offline, Vorrat an der
Grenze), `DashboardScreen.test.tsx` (Rolle und Reihenfolge, Chips mit Titel und
Zahl, Sprung auf die Woche, Import-Knopf gegen eine gestellte Function,
Treffpunkt-Zeilen mit Freitext-Leiter und Namensvetter) und `reducer.test.ts`
(Sprung nur mit Recht, Rand des Bestands). **16 neue Einträge in der
Mutationsprobe**; im ersten Lauf war einer ungewacht: Der Test zur Startwoche
hatte nur eine vergangene Woche vor der Lücke — die zählt ohnehin nichts und
fällt heraus, egal wo die Karte beginnt. Schief geht der falsche Anfang erst
mit einem ganzen Jahr Bestand, wie die App ihn lädt: Dann belegen vier
vergangene Wochen die vier Zeilen, und die kommende fehlt. Mit diesem Bestand
ist der Test jetzt rot, wenn man die Regel bricht — 16 von 16. Am laufenden
Demo-Stand nachgesehen in Reinweiß, Graphit und Hoher Kontrast, auf Arabisch
(Pfeile und Chips in Leserichtung) und bei größter Schrift; der Screenshot im
Planer-Handbuch ist neu aufgenommen.

#### Durchsicht am selben Tag — zwölf Befunde, alle behoben

Eine Durchsicht des fertigen Stands (`/code-review max`) fand zwölf Punkte; der
Betreiber hat alle zur Behebung gegeben und für den ersten die gründlichere
Variante gewählt: **„Plan senden" überspringt Vergangenes.**

1. **Die Karte kündigte eine andere Zahl an, als der Knopf verschickte.** Sie
   ließ die Plätze vom Dienstag am Donnerstag weg, der Knopf in Planen zählte
   sie mit, und `send-plan` schickte ihnen eine Nachricht über eine
   Zusammenkunft, die gewesen ist. Jetzt lassen **alle drei** Vergangenes weg —
   `offeneMeldungen` im Client, `offeneDerWoche` in `_shared/zuteilungen.ts`
   für die Function (die Sammel-Schleife stand bis hierher unprüfbar im
   Handler). Der Client schickt seinen Kalendertag mit (`heute`): Der Server
   rechnet in UTC, und zwischen Mitternacht und 02:00 wären das in Mitteleuropa
   zwei Tage. Geglaubt wird der Tag nur, wenn er höchstens einen Tag neben der
   Serveruhr liegt (`heuteUtc`). Auch **Entzüge** für vergangene Plätze gehen
   nicht mehr hinaus — gefiltert im Client, der den alten Stand der Woche kennt
   (`entzogeneZusagen`). `daysUntil` aus `send-reminders` heißt jetzt
   `tageBisTermin` und steht in `_shared/planung.ts`.
2. **Eine Kongresswoche fiel samt ihren Treffpunkten aus der Karte.** Der
   Horizont begann bei der nächsten *Zusammenkunft*, und die überspringt Wochen,
   in denen alles entfällt — deren Treffpunkte aber nicht. Jetzt beginnt er bei
   der laufenden Kalenderwoche; Vergangenes darin fällt ohnehin einzeln heraus.
3. **Über Mitternacht blieb die Karte stehen.** Sie merkt sich ihre Rechnung,
   das Datum war keine Abhängigkeit. `useKalendertag` meldet den Tag neu — um
   Mitternacht und beim Zurückkehren aus dem Hintergrund, wo das Betriebssystem
   Zeitgeber anhält. Genutzt von Karte, Start-Bildschirm und „Plan senden".
4. **Nur ein ungesendeter Treffpunkt-Leiter öffnete die Wochenmitte.** Jetzt die
   Treffpunkte (`zielReiter`).
5. **„Alles zugeteilt" behauptete mehr, als geprüft war.** Darunter steht jetzt
   der Zeitraum der angesehenen Wochen — über `formatRange`, ohne neues Wort.
6. **Die Wochenspanne ignorierte die Sprachvariante**, die Planen zeigt. Die
   Regel aus `useProgWeek` ist jetzt `useProgWeeks` und gilt für beide.
7. **Die Eingaben der Karte waren ungeprüft** — Treffpunkte, Abwesenheiten,
   Tagebuch. Bildschirm-Tests und drei Einträge in der Mutationsprobe.
8. **`leitetTreffpunkt` war eine dritte Fassung** von `gehoertZu` +
   `fsLeiterZuteilung`. Entfernt; Start und Programm fragen dieselben Stellen.
9. **„nichtBesetzbar ist ein Teil von offen" stimmte nicht** — nach
   nachträglichen Abwesenheiten steht der Engpass auch ohne offenen Platz.
   Kommentar berichtigt, der Fall ist jetzt ein Test.
10. **Das Datumsformat des Import-Hooks entstand bei jedem Render neu.** Gemerkt;
    der Hook liefert auch das Ende des Vorrats, statt dass die Karte es zweimal
    rechnet.
11. **Die Konfliktprüfung lief je Zusammenkunft**; jetzt einmal je Woche, nach
    Zusammenkunft verteilt.
12. **Die Kodierung „Kalendertag als UTC-Mitternacht" stand in fünf
    Abschriften** — jetzt `kalendertagMs` in `meeting-dates.ts`, genutzt von
    `istVorbei`, `naechsteZusammenkunft`, `tageZwischen`, Countdown,
    Datumswähler, Treffpunkt-Aufgaben und der Karte.

> ✅ **Deploy erledigt (13. September 2026):** `send-plan` steht als Version 6
> seit 15:02 Uhr, `verify_jwt` weiter an. Rauchtest ohne Nebenwirkung
> bestanden: Die CORS-Vorabanfrage beantwortet der Handler selbst („ok"), ohne
> Kopfzeile und mit kaputtem Token weist die Plattform ab (401), mit dem
> öffentlichen Schlüssel antwortet der Handler `401 unauthorized` — das Modul
> samt der neuen Importe (`heuteUtc`, `offeneDerWoche`) kommt also hoch.
> `send-reminders` bleibt auf v32 vom 10.9.: nur umbenannt, verhält sich gleich.
> Gesendet wurde beim Prüfen nichts; ein echter Druck auf „Plan senden" steht
> noch aus.

### T96 · Warnen, wenn Plätze gar nicht besetzbar sind 🔧 ✅ erledigt
**Vorgabe des Betreibers am 23. August 2026**, an die Stelle der
Wochenübersicht aus T72 getreten und die bessere Frage: Nicht *wer* fehlt,
sondern *was daraus folgt*. Wörtlich: „wenn es 10 Personen gibt, die Mikrofon
machen können, 3 Mikrofonplätze besetzt werden müssen, aber von den 10 an einem
Tag 8 nicht da sind — dann bleibt 1 Platz frei, weil gar nicht genügend Leute
da sind."

Ohne diesen Hinweis lässt die Auto-Zuteilung die Plätze **kommentarlos** offen,
und warum, sieht man ihr nicht an. Der Planer sucht den Fehler bei sich.

> **Erledigt.** `src/data/bedarf.ts` zählt je Bereich die Plätze der
> Zusammenkunft (über **alle vier Platzsorten** — in `alle-plaetze.test.ts`
> eingetragen) gegen die Qualifizierten, die an **diesem Tag** da sind. Das
> Banner „NICHT BESETZBAR" steht im Planen zwischen den Konflikten und den
> offenen Zuteilungen: Es erklärt einen Teil von deren Zahl, deshalb darüber.
>
> **Die Zahl ist eine Untergrenze, keine Vorhersage.** Wer für zwei Bereiche
> taugt, zählt in beiden mit, obwohl er nur eine Aufgabe übernimmt — der
> Engpass kann größer ausfallen als gemeldet, nie kleiner. Das ist die richtige
> Richtung: Eine Warnung, die auch nur manchmal grundlos erscheint, wird
> weggeklickt und dann auch dann übersehen, wenn sie stimmt. Gezählt werden
> **alle** Plätze, nicht nur die offenen — sonst verschwände die Warnung,
> sobald der Planer die zwei Verfügbaren einträgt, und der dritte Platz stünde
> unerklärt da.
>
> **Beim Übersetzen aufgefallen:** Die erste Fassung war ein Satz („{b} Plätze,
> {v} verfügbar"). „1 Plätze" ist schon im Deutschen falsch, und
> Russisch/Polnisch/Kroatisch haben **drei** Pluralformen — in mindestens einem
> Fall wäre jede der 34 Übersetzungen falsch gewesen, ohne dass es je jemand
> meldet. Jetzt steht Beschriftung neben Zahl („nötig 3 · verfügbar 2 ·
> abwesend 8 von 10"); die Form hat das Problem nicht.

### T97 · Sicherheitsdurchsicht des ganzen Bestands 🏗 ✅ erledigt
**Vorgabe des Betreibers am 24. August 2026:** Durchsicht nicht nur der
Änderungen, sondern des **ganzen Repos** — und anschließend alles beheben, auch
das, was kein Sicherheitsrisiko ist.

Vier Befunde haben die Gegenprüfung überstanden (**S10–S13** in
[befunde.md](befunde.md)), dazu vier kleinere Härtungen und ein
Korrektheitsmangel, der beinahe zwei geschlossene Löcher wieder aufgemacht
hätte.

> **Erledigt.** Der Reihe nach:
>
> **S10 — `substitute` glaubte dem Rumpf.** `congregationId` kam aus dem JSON
> des Aufrufers und ging ungekodiert in jeden REST-Pfad. Ein angehängtes `#`
> schnitt beim URL-Parser alles Folgende ab: Das PATCH verlor Woche und
> Vergleiche-und-Tausche und überschrieb **jede** Wochenzeile der Versammlung,
> die DELETEs verloren ihren `task_key` und räumten alle Bestätigungen und
> Mitteilungen ab — mit Service-Role, also an RLS vorbei, ausgelöst von einem
> einfachen Mitglied mit einer einzigen Anfrage. Die Versammlung kommt jetzt aus
> der **eigenen Mitgliedszeile**; `wert()` kodiert zusätzlich jeden Pfadwert.
>
> **S11 — fremde Abwesenheiten.** Der Zweig „die Zeile gehört mir"
> (`user_id = auth.uid()`) sagte nichts über `person_id`. `migration-023`
> bindet ihn an die eigene Person und lässt ihn nur noch für Konten ohne
> verknüpfte Person offen — genau den Fall, für den es ihn gibt. Das `using`
> bleibt breiter als das `with check`, damit Altbestand löschbar bleibt.
>
> **S12 — `import-week` als Bote.** Das Feld `url` wurde geholt, wie es kam.
> **Kein Aufrufer hat es je geschickt** — es ist entfernt, und `fetchText`
> lässt als einzige Engstelle nur `https://www.jw.org` durch. Die Prüfung sitzt
> dort und nicht beim Auswerten des Rumpfes, weil `localizedUrl` eine Adresse
> aus fremdem Markup liest.
>
> **S13 — Einspringen ohne Gesuch.** Der Zwilling zu T81/S7, damals mit einem
> Satz abgetan („der take-Pfad prüft sauber auf Qualifikation"). Das beantwortet
> aber, WER eingetragen werden darf, nicht OB der Platz frei wird. Jetzt verlangt
> `take` dieselbe Absage, aus der `seek` seine Berechtigung zieht.
>
> **Was `verify_jwt = true` wirklich zusagt.** Nämlich: dass ein Token
> mitkommt, das mit dem Projekt-Geheimnis signiert ist. Das ist auch der
> anon-Key, der per Design im Bundle steht — ein Nutzer-Login ist es **nicht**.
> Der Kommentar in `config.toml` behauptete das Gegenteil und war damit die
> Wurzel von S12. Korrigiert, samt der Regel: Wer wissen muss, wer da ruft,
> fragt `/auth/v1/user` (`send-invite`, `substitute`).
>
> **`schema.sql` war unausführbar.** Beim Einarbeiten von `migration-022` hatte
> ein Suchen-und-Ersetzen `$'` in der Regex `'^\d+$'` als Ersetzungsmuster
> gelesen: `$$` fiel auf `$` zusammen (Syntaxfehler ab Zeile 295, also **vor**
> jedem `enable row level security`), und der Dateirest wurde sechsmal
> eingespleißt — 570 → 2110 Zeilen. Von sechs Fassungen jeder Richtlinie gewinnt
> beim Ausführen die **letzte**, und das waren die schwachen von vor
> `migration-022`. Kein Sicherheitsbefund (die Datei lief gar nicht, die
> laufende Instanz hängt an der Migrationskette), aber jede Neuinstallation wäre
> gescheitert, und die naheliegende Reparatur `$` → `$$` hätte S2 und S3
> stillschweigend wieder aufgemacht. Neu erzeugt aus der letzten heilen Fassung
> plus 022 und 023; ein Abgleich meldet **null Abweichung** gegen die Kette.
>
> **Warum `schema.test.ts` grün blieb** — und was sie jetzt prüft: Sie suchte
> nur **Namen** (`create function public.task_gehoert_mir` stand ja da). Neu
> sind vier Proben: vollständige Dollar-Rümpfe, jede Richtlinie genau einmal,
> und jeder Rumpf so wie in der jüngsten Migration — dazu drei Fälle, die die
> Rechteprüfungen einzeln festnageln, für den Fall, dass eine Regel aus Schema
> **und** Migration zugleich verschwindet.
>
> **Kleineres:** Fehlertexte (roher PostgREST-Rumpf) gehen in die Logs statt zum
> Aufrufer; die `mailto:`-Adresse wird kodiert (`?bcc=…` hängte sonst eine
> stille Kopie an); der Mitteilungs-Klick im Service Worker wird gegen den
> Geltungsbereich geprüft; der README-Hinweis `migration-00*.sql` übersprang
> stillschweigend alles ab der zehnten.
>
> **Tests:** +51 Fälle (2769 → 2820) und elf neue Einträge in der
> Mutationsprobe (67 → 78), alle als *bewacht* nachgewiesen. Die Attrappe in
> `substitute.test.ts` wertet jetzt **Filter aus**, statt jede Tabelle pauschal
> auszugeben — vorher sah „Filter weg" genauso aus wie „Filter da", und das ist
> genau der Unterschied, um den es bei S10 ging.
>
> **Nach dem Ausrollen (24.8.).** Zwei Nachzüge, die erst gehen, wenn die neue
> Fassung läuft:
>
> `congregationId` ist aus `substituteSeek`/`substituteTake` verschwunden. Das
> Feld war der Angriffsweg aus S10, und ein Feld, das niemand mehr auswertet,
> ist genau die offene Fläche, die bei `import-week` zu S12 geführt hat. Die
> Function duldet es weiter, weil eine installierte PWA eine ältere Fassung im
> Cache haben kann; der Client schickt es nicht mehr, und ein Test in
> `data-save.test.ts` hält den Rumpf auf genau `{ action, taskKey }` fest.
>
> `scripts/mitgliedsrechte-probe.mjs` misst jetzt zehn Fälle statt sechs. Neu:
> Abwesenheit auf eine fremde Person (S11) mit der Gegenprobe „eigene
> Abwesenheit geht weiter", fremden Platz übernehmen ohne Absage (S13), und
> Ersatzsuche mit einer per `#` gefälschten Versammlungskennung (S10). Die
> beiden letzten rufen die Edge Function mit dem **Nutzer-Token** auf — sie
> arbeitet intern mit Service-Role, ihre Grenze hängt also allein daran, wen
> dieses Token ausweist. Fall 9 sagt ausdrücklich „nicht gemessen", wenn das
> Probe-Mitglied für den Dienst gar nicht qualifiziert ist: Dann antwortet die
> Function schon vorher mit `not-qualified`, und das sähe wie ein Erfolg aus,
> ohne dass die Prüfung, um die es geht, je erreicht wurde.

---

## Aufgenommen am 28. August 2026 — Dokumentation (T98)

### T98 · Die Dokumentation auf den Stand des Codes bringen 🔧 ✅ erledigt (17. September 2026)
**Vorgabe des Betreibers am 28. August 2026.** Seit dem letzten Stand der
Handbücher (25.8., `84dbe05`) sind neun Commits gelaufen, drei davon am
Sprachverhalten der ganzen App. Die Handbücher beschreiben also eine App, die
es so nicht mehr gibt — und das fällt hier später auf als überall sonst, weil
kein Test eine Doku liest.

**Was gemessen veraltet ist:**

- **Die Zahl stimmt nicht.** `README.md:389` sagt „~30 Sprachen"; `APP_LANGS`
  zählt **34**. Dieselbe Zahl steht in acht Dateien unter `docs/analyse/` in
  drei verschiedenen Fassungen (30, 33, 34) — 33 meint dort meist „die
  Fremdsprachen ohne Deutsch" und ist richtig, 30 ist überall falsch.
- **Sechs Pfadangaben zeigen ins Leere.** `src/i18n/translate.ts`,
  `translate-data.ts` und `bible-books.ts` liegen seit `4326b45` unter
  `supabase/functions/_shared/i18n/`. Dabei zu unterscheiden: Ein **Befund**
  beschreibt den Stand seines Tages und behält seinen Pfad (T1 nennt
  `translate.ts:165` — dort stand der Absturz); eine **Wegweisung** wie die
  Tabelle in `befunde.md:1079` gehört richtiggestellt.
- **Die Handbücher kennen drei Neuerungen nicht:** die Herkunft eines Redners
  als eigenes Feld (`4f1c554`), die Art eines Abschnitts (`266acbb`) und das
  ganze Sprachverhalten — Rechts-nach-links, der übersetzte Rumpf der
  Push-Erinnerung, die Einladungs-Mail in der Sprache der Versammlung. In
  `verkuendiger.md` steht dazu bisher **ein Satz**.
- **Die 16 Aufnahmen sind vom 23. August** (`1d5c185`) und damit älter als die
  Bildschirme, die sie zeigen: `266acbb` und `4f1c554` haben `MeetingSection`,
  `AssignSheet` und `ProgrammScreen` angefasst — betroffen sind also
  `planer-planen-woche`, `programm-woche` und `programm-wochenende`. [`capture-screenshots.sh`](../user-guide/capture-screenshots.sh) erzeugt sie
  neu (Chrome-Headless über den Debug-Hash, danach `trim.mjs`).

**Prüfen:** Ein Leser, der nur die Handbücher kennt, muss die App bedienen
können, ohne auf etwas zu stoßen, das anders heißt oder anders aussieht.
Konkret nachziehbar: kein Vorkommen von „~30 Sprachen" mehr; `grep` nach den
drei alten `src/i18n/`-Pfaden findet nur noch Befundtexte; jede Aufnahme jünger
als der letzte Commit, der ihren Bildschirm anfasst.

**Nicht Teil der Aufgabe:** `docs/analyse/` rückwirkend umschreiben. Die
Analysen sind datierte Protokolle; was dort steht, galt an seinem Tag. Zu
ändern sind nur Angaben, die als Wegweiser gemeint sind.

> **Umgesetzt am 17. September 2026**, im selben Zug wie T104 — die
> Aufräumung hat die Handbücher ohnehin an mehreren Stellen berührt.
>
> - **Die Zahl steht jetzt richtig:** „34 Sprachen" im README (Deutsch plus 33
>   Übersetzungen), und die Kommentare, die von „~30" sprachen, meinen die 30
>   Sprachen ohne eigene Datumsregel — das ist die Zahl, die dort hingehört.
> - **Die Wegweiser zeigen wieder irgendwohin:** Der Datei-Schnellindex in
>   `befunde.md` nennt `testdaten.ts` statt `demo.ts`, die i18n-Dateien unter
>   `supabase/functions/_shared/i18n/` und statt einer Migration die Richtlinie
>   im Schema. Er trägt jetzt selbst den Hinweis, dass er ein Wegweiser ist und
>   kein Protokoll — damit die Unterscheidung nicht wieder verlorengeht.
> - **Ein echter Fehler im Handbuch:** `planer.md` beschrieb den Schalter „Bei
>   Zuteilung · Sofort" in den Erinnerungen. Den gibt es seit T99 nicht mehr;
>   an seiner Stelle steht „Plan senden". Wer danach suchte, fand nichts.
> - **Das Sprachverhalten steht beschrieben**, in beiden Handbüchern und an der
>   Stelle, an der man es sucht: Push in der Sprache des **Geräts** (zwei
>   Geräte, zwei Sprachen), Glocken-Zeilen in der gerade eingestellten,
>   Rechts-nach-links für ar/he/fa/ur, und die Einladungs-Mail als einzige
>   Ausnahme in der Sprache der Versammlung — ihr Empfänger hat noch kein
>   Konto und damit keine eigene.
> - **Die Herkunft eines Redners** war schon beschrieben („Name und Versammlung
>   in die Freitext-Felder"); die Art eines Abschnitts (`Section.kind`) ist
>   nichts, was ein Leser je zu sehen bekommt.
> - **Alle 17 Aufnahmen sind neu** (`capture-screenshots.sh` gegen den
>   Dev-Server). Sieben haben sich geändert — die übrigen zeigen Bildschirme,
>   an denen sich nichts bewegt hat.
> - **Die Migrationsverweise sind weg**, alle 53 außerhalb von `docs/analyse/`.
>   Sie zeigten nach T104 auf gelöschte Dateien; an ihrer Stelle steht jetzt
>   die Sache selbst (`assignment_log`, `task_gehoert_mir`, `weeks.start`).

---

## Aufgenommen am 17. September 2026 — Altlasten (T104)

### T104 · Es darf nichts mit „legacy" geben 🏗 ✅ erledigt
**Vorgabe des Betreibers am 17. September 2026:** *„die software, die wir hier
entwickeln, ist brand neu und noch nicht mal ausgerollt. es darf nichts mit
legacy geben! wir räumen sowas auf und machen es richtig. ich kann alle daten
löschen, wenn nötig — es sind nur testdaten."*

Der Bestand war größer als erwartet: **zehn Lade-Migrationen**, die bei jedem
Anmelden liefen, dazu die Mechanik, die ihr Ergebnis in die Datenbank
zurückschrieb — mitten in die Arbeit des Planers hinein.

**Was weggefallen ist**

| Weg | Was es tat |
| --- | --- |
| `migrateItemIds` | trug Programmpunkten ihre Kennung nach |
| `umstellungSchreiben` + `renameConfirmationKeys` + `swapConfirmationKeys` | schrieben das Ergebnis zurück |
| `migrateAssignmentNames` + `mapMeetingNames` + `shortDisplayName` | hob „V. Nachname" auf den vollen Namen |
| `migrateServicePrivs` + `Service.legacyPriv` + Spalte `services.priv` | alte gemeinsame Dienst-Bereiche |
| `migrateFsTaskKeys`, `migrateFsWochenKeys`, `fsMigrateInstIds`, `stabileKennung` | Treffpunkt-Schlüssel ohne Ordnungszahl |
| `normalizeWeekHelpers` + `HelperEntry` als String | Hilfsdienste als reine Namen |
| `normalizePriv`: `lesen`, `vorsitz` | zusammengefasste Bereiche von früher |
| `partTaskKey`, `slotTaskKey`, `shiftPartConfirmations`, `swapPartConfirmations`, `partSwapKeyPairs` | der positionsbasierte Aufgaben-Schlüssel und alles, was ihn verschieben musste |
| `itemMinutes`-Rückfall auf die Meta-Zeile | Minuten aus Anzeigetext zurückrechnen |
| `herkunftVon`-Rückfall auf den Rollentext | Heimatversammlung im Feld `rolle` |
| `LEGACY_THEME`, `gruppenPositionenNachtragen`, `ohneFremdePid` | einmalige Umstellungen |
| `rolleNennt`, `eigeneRolle` und der `„mit …“`-Zweig in `zuteilungsLabel` | der Gesprächspartner als Beschriftung **in** der Rolle des Schülers |
| 25 Dateien `supabase/migration-0*.sql` | die Migrationskette |

**Wodurch es ersetzt wurde — der Kern der Sache:** `PartItem.iid` ist
**Pflichtfeld**. Die Kennung entsteht dort, wo der Punkt entsteht: beim Import
(`parse.ts`, über `neueItemId` in `_shared/zuteilungen.ts`) und beim Einfügen
von Hand (`meeting-edit.ts`). Der Compiler hält das durch — eine Stelle, die
einen Punkt ohne Kennung baut, übersetzt nicht. Damit hat der Aufgaben-Schlüssel
**eine** Form statt zweier, und Einfügen, Löschen und Verschieben lassen die
Bestätigungen in Ruhe: Was bleibt, ist `itemZusagenKeys` — die Zusagen eines
gelöschten Punkts verfallen, sonst nichts.

**Geblieben, aber umbenannt:** `migrateAssignmentPids` → `pidsNachtragen`,
`fsMigrateLeaderPids` → `fsLeiterBinden`. Beide sind **keine** Migrationen,
sondern eine laufende Regel: Wird eine Person gelöscht, nimmt `dropPersonPid`
ihre Id aus den Wochen und lässt den Namen stehen; legt der Planer sie neu an,
finden die beiden sie wieder. Ohne sie bliebe ein Name ohne Person, und die
Zuteilung zählte in keiner Auslastung, keinem Konflikt und keiner Aufgabenliste
mehr.

**Nebenbei gefallen:** Der Gesprächspartner stand einmal als Text in der Rolle
des Schülers („mit A. Hoffmann“). Er hat längst einen eigenen Platz
(`schulungPartner`); geblieben war nur die Mechanik, die seinen Namen aus dem
Rollentext wieder herausklaubte — `rolleNennt` samt Wortgrenzen-Prüfung, weil
„Anna“ auch in „Annalena“ steckt. Damit fällt zugleich der Grund weg, der in
[[strukturumbauten-offen]] gegen eine geschlossene `RolleKey`-Union sprach.

**Der Ladevorgang liest jetzt nur noch.** `loadCongregationData` schrieb bis
hierher beim Laden zurück; das ist weg. Was bleibt, geschieht rein im Speicher.

**Die Datenbank hat eine einzige Quelle:** `supabase/schema.sql`. Die 25
Migrationen versicherten jede für sich „Neuinstallationen brauchen diese Datei
nicht — schema.sql enthält alles"; niemand hielt das nach, und dreimal stimmte
es nicht (fs_rules, fs_weeks, reminder_log). Zwei Quellen für dieselbe Sache
laufen auseinander. `schema.test.ts` vergleicht deshalb nicht mehr zwei Seiten,
sondern prüft die eine: RLS auf jeder Tabelle, vollständige Dollar-Rümpfe, jede
Richtlinie und jede Funktion genau einmal, die drei Rechteprüfungen aus T89/T97
im Wortlaut — und zwei neue Proben, dass der Altbestand wirklich weg ist.

**Testdaten mit aufgeräumt:** Die Kurzform-Namen („A. Hoffmann", „R. Simon")
waren die Schreibweise von früher; sie stehen jetzt voll da. Der
`vorsitz`-Bereichsschlüssel in den Demo-Wochen ist `vorsitzMid`/`vorsitzWe`.
Und die Kennungen der Testdaten werden **durchgezählt statt gewürfelt** — zwei
Aufrufe von `buildDemoWeeks()` ergeben dieselben Wochen, sonst misst ein Test,
der sie vergleicht, den Zufall.

**Nachgereicht am selben Tag — der Dienst-Schlüssel `ord`.** Er hieß so „aus
Rückwärtskompatibilität zur helpers-Struktur der Wochen", während der Dienst
„Eingangsordner" heißt. Jetzt `eingang` — in `STANDARD_DIENSTE`, den Testdaten,
den Anlege-Skripten, `DUTY_KEY` des NWS-Imports und im Personen-Generator
(`nws-export/build-personen-sql.mjs`, samt seiner Vergleichsgrundlage, damit
`--pruefen` weiter etwas aussagt).

**Dabei aufgefallen:** `versammlung-zuruecksetzen.mjs` leerte `assignment_log`
nicht. Die Tabelle kam mit T99 dazu und hätte sich in die handgepflegte Liste
`LEEREN` selbst eintragen müssen — das Versand-Tagebuch überlebte damit jedes
Zurücksetzen, mit Schlüsseln auf Wochen, die es nicht mehr gab. Behoben, und
gegen die nächste Tabelle abgesichert: `versammlung-zuruecksetzen.test.ts` liest
`schema.sql` und verlangt, dass **jede** Tabelle mit `congregation_id` entweder
geleert wird oder mit Begründung in der neuen Liste `BEHALTEN` steht.

**Stand danach:** 5166 Tests grün, `tsc -b` sauber, Lint ohne Meldung, und die
Sperrklinke aus T42 fiel von 727 auf 658 Meldungen.

**Was der Betreiber noch tun muss** (die App ist noch nicht ausgerollt, deshalb
ist das der einfache Weg):

1. Datenbank neu aufsetzen: `supabase/schema.sql` im SQL-Editor ausführen.
2. Alle fünf Edge Functions neu deployen — `parse.ts` vergibt jetzt die
   Kennungen, `_shared/zuteilungen.ts` kennt nur noch eine Schlüsselform.
3. Stammdaten und Wochen nach dem Runbook neu einspielen.

---

## Aufgenommen am 29. August 2026 — Mitteilungen (T99)

### T99 · Der Mitteilungs-Mechanismus als Ganzes 🏗 ✅ erledigt
**Vorgabe des Betreibers am 29. August 2026**, nach einer Durchsicht des
Bestands: „wer kriegt wieviele und welche Mitteilungen, macht das alles Sinn,
bringt mir das was oder stört es nur." Und danach: ein durchdachter Ablauf,
„das ist ein wichtiger Bestandteil der App".

**Was die Durchsicht ergab.** Die Mitteilungen waren falsch adressiert —
benachrichtigt wurde, wer handelt, nicht, wen es angeht.

- **Wer eingeteilt wurde, erfuhr es nicht.** „Zuteilung gesendet" ging an die
  **Planer**; für die eingeteilte Person passierte bis zur zeitlichen
  Erinnerung nichts, also bis `first` Tage vor der Zusammenkunft. Wer drei
  Wochen im Voraus plant, dessen Leute wussten zwei Wochen lang nichts. (In
  T74 beim Bauen gemessen und ausdrücklich vertagt.)
- **Wer eine bestätigte Zusage wieder verlor, erfuhr es auch nicht.** Das
  Umteilen verwarf die Bestätigung still (`dropConfirmations`); es gab keinen
  Erzeuger für „deine Aufgabe ist weg". Wer zugesagt hatte, bereitete weiter
  vor.
- **Der Planer bekam zu viel.** Gemessen an der Demo-Woche hat eine Woche
  **35 Plätze** (22 unter der Woche, 13 am Wochenende, alle vier Platzsorten).
  Von Hand geteilt hieß das 35 Glocken-Zeilen je Planer — für Klicks, die er
  selbst getan und als Toast quittiert bekommen hatte. Dieselbe Woche per
  Auto-Zuteilung: **eine** Zeile. Das Ladefenster von 50 war damit nach
  anderthalb Wochen voll und verdrängte alles andere.
- **Drei Dinge funktionierten schlicht nicht:** Der Bestätigen-Knopf in der
  Glocke erschien im Betrieb nie (`send-reminders` schrieb kein `task_key`;
  nur der Demo-Bestand stellte den Zustand her). Die Planer-Meldung „nicht
  erreichbar" ging **nur** als Push hinaus — ein Planer ohne Abo bekam sie nie,
  wurde aber im `reminder_log` als benachrichtigt verbucht. Und zwei Titel
  („Neue Zuteilung", „Plan veröffentlicht") standen in 34 Sprachfassungen ohne
  jeden Erzeuger.
- **Der Takt war laut:** Voreinstellung `repeat: true` — sieben Push-Nachrichten
  an sieben Tagen in Folge für dieselbe Aufgabe, davon fünf ohne neuen Inhalt
  (die Glocke bekommt nur an `first` und `last` eine Zeile).

**Der Grundsatz, nach dem umgebaut wurde:** Eine Mitteilung ist eine Bitte um
Handlung oder die Nachricht, dass eine Zusage nicht mehr gilt. Adressiert wird,
wen es angeht — nie, wer es ausgelöst hat. Gebündelt wird nach Person, nicht
nach Ereignis. Und den Zeitpunkt bestimmt der Planer, nicht der Klick: Planen
ist eine Sitzung, kein Einzelakt.

**Umgesetzt:**

1. **„Plan senden"** (`PlanSendenPanel` → neue Edge Function `send-plan`). Der
   Planer arbeitet die Woche fertig und gibt sie frei; jede eingeteilte Person
   bekommt **eine** Nachricht mit allen ihren Aufgaben dieser Woche, als Glocke
   und als Push. Der Knopf gilt für die ganze Woche, beide Zusammenkünfte und
   die Treffpunkte, und steht deshalb in beiden Ansichten.
2. **Versand-Tagebuch** `assignment_log`
   (`migration-024`) —
   dasselbe Muster wie `reminder_log`. Gesendet wird nur, was noch nicht
   gesendet war; ein zweiter Druck nach einer Nachbesserung erreicht nur die
   neue Person. Der Schlüssel führt **Platz und Name**, weil ein Platz die
   Person wechseln kann.
3. **Der Planer sieht, wer wann informiert wurde** — das Panel nennt die Zahl,
   bei wenigen auch die Namen, dazu den Zeitpunkt des letzten Versands. Wer
   kein App-Konto hat, bleibt nach dem Senden sichtbar stehen: Ihn muss der
   Planer persönlich ansprechen, und ein Toast wäre dafür zu flüchtig.
4. **Entzogene Zusagen gehen sofort hinaus** (`send-plan`, Aktion 'entzug').
   Erkannt wird das an **einer** Stelle in `persist.ts` über den
   Vorher/Nachher-Vergleich der Woche — nicht als Aufzählung der auslösenden
   Aktionen, denn wer eine vergisst, merkt es nie.
5. **Das Planer-Protokoll ist entfallen:** „Zuteilung gesendet" und
   „Zuteilungen gesendet" gibt es nicht mehr, und mit ihnen den Schalter
   `reminders.onAssign`, der nichts anderes steuerte. Was der Planer über den
   Stand seiner Woche wissen muss, steht im Planen-Screen.
6. **Vier Reparaturen am Bestand:** `task_key` in der Erinnerung (der
   Bestätigen-Knopf funktioniert jetzt); „nicht erreichbar" auch als
   Glocken-Zeile; die Glocke lädt beim Öffnen still nach (bis dahin kam sie nur
   beim App-Start aus der Datenbank — eine dauerhaft offene PWA sah nie etwas
   Neues); und `repeat` steht voreingestellt auf **aus**.

**Geteilt statt abgeschrieben:** Die Aufzählung der Plätze wohnt jetzt in
`supabase/functions/_shared/zuteilungen.ts` — dieselbe Datei für
`send-reminders` und `send-plan`. Zwei Fassungen einer solchen Aufzählung waren
hier schon einmal die Ursache eines Fehlers (B8/T40).

**Was das mengenmäßig heißt:**

| | vorher | nachher |
| --- | --- | --- |
| Planer, vier Wochen von Hand geplant | ~140 Glocken-Zeilen | 2–5 (nur Absagen) |
| Verkündiger, 2 Aufgaben im Monat | 0 bei der Zuteilung, dann 4 Glocken + bis zu 14 Push | 1–2 „Neue Zuteilung" + 0–2 Erinnerungen |

**Beim Bauen gefunden — zwei Dinge, die niemand gesucht hatte:**

- In `send-plan` war der Trenner des Tagebuch-Schlüssels zwischenzeitlich kein
  Leerzeichen, sondern ein Steuerzeichen. **Alle Tests der Function blieben
  grün** — sie verglich ja mit sich selbst; nur der Client hätte nicht dazu
  gepasst. Daraus ist die Gleichlauf-Probe in `edge-parity.test.ts` geworden,
  die beide Seiten an denselben Eingaben misst, und die geteilte Funktion
  `tagebuchSchluessel`.
- Die neue Kontrast-Paarung `mut/tGld` deckte einen **Bestandsmangel** auf: In
  der Palette „grau" stand der gedämpfte Hinweistext auf goldenen Panels bei
  3.86:1. Das betraf nicht das neue Panel, sondern jedes `panel-hint` auf Gold
  — Treffpunkte, Aufgaben, Zeitleiste. `--mut` ist dort jetzt dunkler.

**Prüfen:** Eine Woche von Hand zuteilen — in der Glocke des Planers steht
nichts. „Plan senden" drücken — jede eingeteilte Person mit Konto hat genau
eine Mitteilung, der Zähler steht auf null, die Antwort nennt die ohne Konto.
Erneut drücken — es geht nichts hinaus. Einen **bestätigten** Platz umteilen —
der bisherige Inhaber bekommt sofort „Zuteilung zurückgezogen".

**Absichtlich nicht umgesetzt: „Zusammenkunft fällt aus" als eigene Nachricht.**
Der Betreiber am 29.8.: „das kommt eigentlich nie vor. man weiß zur planzeit
schon, ob eine zusammenkunft an einem anderen tag als gewöhnlich ist. dieser
punkt sollte nur umgesetzt werden, wenn es kaum aufwand darstellt." Ehrlich
gerechnet wäre es kein kleiner: ein neuer Titel in 34 Sprachfassungen, ein
neuer Auslöser, eine eigene Empfängerregel. Und die eigentliche Abhilfe ist
geschenkt — steht die Verlegung zur Planzeit fest, trägt die gesendete
Zuteilung von vornherein den richtigen Tag (`terminText` liest `week.dev`).
Wer nach dem Senden verlegt, ändert damit bestätigte Zusagen und löst Punkt 4
aus.

**Tests:** `src/data/plan-versand.test.ts` (21), `supabase/functions/_test/send-plan.test.ts` (19),
`src/planen/PlanSendenPanel.test.tsx` (13), dazu die Gleichlauf-Proben in
`edge-parity.test.ts` und sieben neue Einträge im Mutationskatalog — alle
bewacht.

**Vom Betreiber ausgeführt (29. August 2026):**
`migration-024`
eingespielt, `send-plan` deployt, `send-reminders` neu deployt. Damit ist
scharf, was hier steht — offen bleibt nur die Probe im Betrieb: eine Woche
freigeben und nachsehen, ob die Nachricht ankommt.

---

## Aufgenommen am 30. August 2026 — Durchsicht der Mitteilungen (T100/T101)

### T100 · Durchsicht von T99 — was daran falsch war 🏗 ✅ erledigt

Der Mitteilungs-Mechanismus wurde am 30. August im Ganzen gegengelesen. Der
Befund verteilte sich auf einen einzigen Entwurfsfehler und seine Folgen.

**Die Wurzel.** „Wem wurde etwas genommen?" wurde aus dem reinen Vorher/Nachher-
Vergleich der Wochen erschlossen. Diese Schicht sieht aber **jede**
Zustandsänderung, nicht nur das Umteilen — und drei ganz alltägliche Vorgänge
schreiben Namen in Wochen, ohne dass jemandem etwas genommen wird:

| Vorgang | was hinausging | warum |
| --- | --- | --- |
| eine Schreibweise berichtigen | „Zuteilung zurückgezogen" an genau die Person, deren Namen man gerade berichtigte — **je Tastenanschlag** | am Namen verglichen; die Datenbank führte wegen der Bündelung noch den alten, also kam die Nachricht wirklich an |
| Zusätzliche Klasse abschalten | ein Entzug je bestätigtem Platz der Klasse, in **allen** geladenen Wochen | ohne die Marke `auxRatgeber` zählt die Aufzählung den Raum nicht mehr auf — der Reducer speichert die Wochen dabei nicht einmal |
| eine Zusammenkunft ausfallen lassen | ein Entzug je bestätigtem Platz — im Regelfall die **Kongress-Woche**, wo alle ausfallen | ausgefallene Zusammenkünfte tragen keine Aufgaben (T30); der Unterschied las sich wie „alle Plätze geleert" |

Und derselbe Namensvergleich versagte in die andere Richtung: Zwischen zwei
Gleichnamigen umzuteilen meldete **gar nichts** — der, der zugesagt und
vorbereitet hatte, erfuhr es nie.

**Behoben** in `entzogeneZusagen` durch zwei Regeln statt einer Aufzählung
auslösender Aktionen (die wäre die zweite Buchführung gewesen, gegen die T99
selbst argumentiert):

1. **Wer dieselbe Person ist, entscheidet die Person-Id** — der Name nur, wo
   keine Id dasteht. Dieselbe Rangfolge wie `deriveMyTasks`. Die Id geht auch an
   `send-plan` mit, sonst stellte die Function nach dem Namen zu.
2. **Den Platz muss es im neuen Stand noch geben.** Fällt die Zusammenkunft aus
   oder ist die Klasse abgeschaltet, ist der Platz nicht leer, sondern
   *abwesend*. Ein einzeln gelöschter Punkt bleibt ein Entzug.

**Warum es niemand gemerkt hat.** Die reine Rechenfunktion hatte 23 Tests, der
**Auslöser** keinen: `persist.test.ts` bekam für T99 zwei leere Felder
(`confirmations: {}`), und ohne Bestätigungen kann nichts entzogen werden. Jetzt
prüfen sechs Fälle den Auslöser selbst, jeder mit seiner Gegenprobe.

**Weiteres aus derselben Durchsicht:**

- **Die Sperrklinke lief nicht.** `mutationsprobe.mjs` brach beim ersten Eintrag
  ab (seine Stelle war beim NUL-Byte-Umbau verschoben worden) — und damit liefen
  **alle** Regeln nicht mehr. Dahinter lag ein zweiter verschütteter Eintrag.
  Nachgezogen, dazu fünf neue Regeln für die Entzugs-Logik.
- **Das Tagebuch konnte sich selbst blockieren.** Ein INSERT ist ganz oder gar
  nicht: War `assignment_log` einmal nicht lesbar (der Fang liefert dann eine
  leere Liste), enthielt der Stapel vorhandene Zeilen, **keine** wurde
  geschrieben — und von da an schickte jeder Druck allen alles erneut, für
  immer. Jetzt `resolution=ignore-duplicates`.
- **`send-plan` fehlte in `config.toml`.** Fünf Functions auf der Platte, vier
  eingetragen — die Datei gibt es genau dafür.
- **Das Nachladen trug den Planer aus seiner Woche.** Sowohl nach „Plan senden"
  als auch beim bloßen Öffnen der Glocke sprang die App auf die laufende Woche
  zurück. `hydrate` hält eine selbst gewählte Woche jetzt fest — wiedergefunden
  über ihre Kennung, nicht über die Ordnungszahl.
- **Der Knopf lief am Offline-Stand vorbei** (`staleAt`): Er ruft die Function
  unmittelbar, nicht über den Reducer, und hätte eine Woche freigegeben, die der
  Planer so gar nicht vor sich hatte.
- **Die Namen ohne Konto blieben beim Blättern stehen** — unter einer Woche, in
  der die Genannten nichts haben. Sie hängen jetzt an der Wochenkennung.
- **Der Treffpunkt-Entzug nannte keinen Tag** („10:00 · Bahnhof"), obwohl jede
  andere Nachricht über denselben Platz das Datum trägt.
- **Ein fehlgeschlagener Versand meldete „Änderung konnte nicht gespeichert
  werden"** — gespeichert war längst, nur die Nachricht ging nicht hinaus.
- **Das Tagebuch wurde beim Start unbegrenzt geladen**, als einzige Abfrage ohne
  Grenze, und wächst ohne Aufräumen. Jetzt jüngste zuerst und gedeckelt.
- Kleinkram: verwaister Doku-Block für das entfernte `onAssign`, fehlende Zeile
  im Screenshot-Verzeichnis, und vier Mitteilungs-Titel, die zwar nicht mehr
  entstehen, aber noch 30 Tage in den Glocken stehen und sonst unübersetzt
  blieben.

### T101 · Die Ordnungszahl als Anker — zweimal beseitigt 🏗 ✅ erledigt

Zwei Punkte, die bei der Durchsicht als „zu groß für einen Review-Fix" beiseite
gelegt und danach ausdrücklich nachgeholt wurden.

**1. Der Montag einer Treffpunkt-Woche kommt aus der Woche, nicht aus ihrer
Position.** Der Client rechnete ihn als `fsBase + wi·7`. Seit T66 stehen die
Wochen aber nach Datum nebeneinander, ohne Platzhalter — „eine fehlende Woche
ist eine fehlende Woche und verschiebt nichts". Fehlt eine Zeile, liegt von dort
an jede Woche sieben Tage daneben, und zwar dreifach:

| was daran hängt | was schiefging |
| --- | --- |
| Aufgaben-Schlüssel `fs\|<montag>\|<id>` | Die Edge Functions nehmen den Montag aus der **Datenbankzeile**. Client und Server redeten über verschiedene Wochen: Der Knopf zeigte „1 noch nicht gesendet", der Druck meldete „0 gesendet", und die Zahl blieb stehen — genau die Fehlerart, gegen die `plan-versand.ts` geschrieben ist. |
| das angezeigte Datum | „Meine Aufgaben" nannte einen Tag, an dem nichts stattfand. |
| die Monatsregel („1. Samstag") | griff in der falschen Woche und materialisierte den Treffpunkt am falschen Termin. |

Behoben durch **eine** Auskunft (`fsWochenKennungen`), die alle drei speist;
`fsBase + wi·7` bleibt der Rückfall für Wochen ohne Kennung (Vorlagen, Demo).
`genFsWeek`, `regenFsWeeks`, `deriveMyFsTasks`, `fsPendingIds`, `fsWeekConflicts`
und `fsAutoAssign` nehmen jetzt die Kennung statt `(fsBase, wi)`. Bestätigungen
aus der Zeit davor schreibt `migrateFsWochenKeys` beim Laden um — **in einem
Zug**, denn bei einer Lücke rutscht die ganze Kette und der alte Schlüssel der
einen Woche ist der neue der nächsten.

Der Fehler war unsichtbar, weil ohne Lücke **beide** Rechnungen dasselbe
liefern: Jeder Test mit lückenlosem Bestand ist grün, auch der falsche Code.
`fs-wochenkennung.test.ts` prüft deshalb ausdrücklich einen Bestand *mit* Lücke,
und `edge-parity.test.ts` vergleicht dort erstmals die **Menge** der Schlüssel
zwischen Client und Function statt nur ihre Form.

**2. Die vierfach kopierte Präambel der Edge Functions liegt in `_shared/`.**
CORS, `json()`, `wert()`, die REST-Hüllen, die JWT-Auflösung und die
Push-Zustellung standen in bis zu fünf Abschriften — und waren bereits
auseinandergelaufen: Ein abgelaufenes Abo bestellte `substitute` über
`endpoint` ab, `send-plan` über `id`, `send-reminders` schickte die Id
**unkodiert** in den Pfad. Jetzt `_shared/rest.ts` (als Fabrik, damit `_shared`
frei von `Deno` bleibt und importierbar ist) und `_shared/push.ts`.

Nebenbei fielen zwei Sachfehler weg: `send-plan` bündelte den Push nur
*innerhalb* eines Empfängers und lief die Empfänger nacheinander durch — bei
gut zwei Dutzend Personen mit ein bis zwei Geräten griff die Bündelung damit
nie. Und `send-reminders` rief `setVapidDetails` ungeprüft am Anfang jedes
Laufs, was bei leerem Schlüssel flog, obwohl ein Lauf ohne Push in Ordnung ist.

Die Mutationsregel „jeder Wert im REST-Pfad wird kodiert" ist mitgezogen: Sie
stand an einer Function und deckt jetzt alle ab.

---

## Aufgenommen am 31. August 2026 — der Rest aus der Durchsicht (T102)

### T102 · Die fünf offenen Punkte des `/simplify` 🔧 ✅ erledigt
**Vorgabe des Betreibers am 31. August 2026:** „fix die offenen sachen aus dem
simplify". Gemeint sind die Punkte, die die Durchsicht vom 30.8. als *Aufwand
oder Entscheidung* zurückgestellt hatte — kein Fehler war darunter, aber vier
davon kosten im Betrieb messbar, und einer sagt dem Empfänger zweierlei.

**1. Ein Aufruf für alle Entzüge.** `sendPlanEntzug` ging je zurückgezogenem
Platz einzeln hinaus, und `send-plan` wiederholte für jeden davon dieselben
fünf REST-Runden über alle Mitglieder, Personen und Push-Abos. Eine
Auto-Zuteilung fasst aber eine ganze Zusammenkunft an; `setAuxClass` und
`fsRuleAdd` fassen alle 52 Wochen auf einmal an. Aus **einer** Handlung wurden
Dutzende voller Aufrufe. `persist.ts` sammelt jetzt erst und schickt einmal;
die Function nimmt eine Liste und bündelt sie **je Person** zu einer Nachricht
— dieselbe Regel wie beim „Plan senden": Wer beim Umbesetzen zwei Plätze
verliert, soll einmal hinsehen müssen und nicht zweimal erschrecken.

> **Vertragsänderung, also Reihenfolge beachten:** `npx supabase functions
> deploy send-plan` muss **vor** dem Client hinausgehen. Umgekehrt ist es
> unkritisch — die alte Einzelform nimmt die Function weiter an, denn ein
> Browser-Tab, der seit Tagen offen liegt, schickt noch sie.

**2. Der Druck liest nur seine Woche.** `confirmations` und `assignment_log`
wurden je Knopfdruck **ganz** gelesen. Beide wachsen mit jeder geplanten Woche,
und das Tagebuch wird nie aufgeräumt (siehe Punkt 3) — nach ein paar Jahren
holte ein Druck Zehntausende Zeilen, um in dreißig davon nachzusehen. Die Woche
steht im Schlüssel selbst, in genau zwei Formen (T66): `<Montag>|…` und
`fs|<Montag>|…`. Also zwei schlichte `like`-Abfragen je Tabelle statt eines
`or=` — sie laufen parallel, und ihre Bedeutung ist ohne Nachschlagen in der
PostgREST-Grammatik zu erkennen. Die Analyse hatte eine Spalte `week_start`
vorgeschlagen; die hätte eine Migration gekostet und dasselbe geleistet.
Die zweite Form ist die wichtige: Fehlt sie, gilt jede Treffpunkt-Leitung als
noch nicht gemeldet, und der Leiter bekommt bei **jedem** Druck dieselbe
Nachricht erneut.

> **Gegen echtes PostgREST gemessen**, nicht angenommen — das war der
> ausdrückliche Vorbehalt des Befunds. Beide Filter antworten am Live-Projekt
> mit 200 (`…&task_key=like.2026-09-07%7C*` und `…like.fs%7C2026-09-07%7C*`);
> die Gegenprobe mit einem unbekannten Operator antwortet 400 (`PGRST100`), die
> Endpunkte melden Syntaxfehler also durchaus. Ohne Anmeldung kommen wegen RLS
> keine Zeilen zurück — **dass** der Filter greift, prüft die Attrappe, die
> `like` jetzt selbst auswertet (`likeMuster`/`passtAufMuster` in
> `_test/attrappe.ts`); vorher sah „ganze Tabelle" dort genauso aus wie „eine
> Woche".

**3. Aufbewahrungsfrist für `assignment_log` — verworfen, nicht vergessen.**
Der Betreiber hat entschieden: **keine Löschregel.** Nach dem Lesefilter aus
Punkt 2 liest niemand mehr die ganze Tabelle; rund 2000 Zeilen im Jahr sind für
Postgres nichts, und das Tagebuch bleibt als vollständiger Nachweis erhalten,
wer wann benachrichtigt wurde. Die Entscheidung ist reversibel — eine
Löschregel lässt sich jederzeit nachrüsten, gelöschte Zeilen nicht.

**4. Die Glocke lädt in zwei Stufen.** Ihr Öffnen löste den **vollen**
Ladevorgang aus: dreizehn Abfragen, darunter 52 Wochen als JSONB, alle
Bestätigungen und das Versand-Tagebuch — für fünfzig Zeilen Text. Jetzt holt
die erste Stufe nur die Glocken-Zeilen (`loadNotifications`, eine Abfrage); ist
keine neue dabei, bleibt es dabei.

Die zweite Stufe ist dabei **nicht** wegzulassen, und genau darin lag die
Frage, die der Befund offengelassen hatte („Fix ändert, wie frisch der Stand
danach ist"): Eine frische Zeile trägt oft einen Aufgaben-Schlüssel, und ob
daraus ein Bestätigen-Knopf wird, entscheidet `state.myTasks` — abgeleitet aus
Wochen und Bestätigungen. Ohne den vollen Nachlauf zeigte die Glocke die neue
Zuteilung an und verschwiege genau den Knopf, für den sie den Schlüssel
mitbringt. Also: neue Zeile → voller Lauf wie bisher, sonst nur die Liste.

**5. Eine Bezeichnung für den Treffpunkt-Leiter.** Die Function schrieb
`Treffpunkt-Leiter · <Ort>` und ließ den Termin ohne Ort; der Client schrieb
`Treffpunkt-Leiter` und setzte den Ort in den Termin. Dieselbe Auskunft in zwei
Reihenfolgen, je nachdem, ob die Nachricht aus dem Versand oder aus dem Browser
kam — wer erst erinnert und dann entzogen wurde, las zweierlei. Es gilt die
Client-Form: **der Ort gehört zum Termin**, er beantwortet „wo und wann", nicht
„was", und so steht es auch in „Meine Aufgaben". Die Zeichenkette liegt jetzt
einmal da (`FS_LEITER` in `_shared/zuteilungen.ts`, vom Client mit eingebunden)
statt zweimal.

**Nicht angefasst:** Punkt 6 der Durchsicht (`_shared/zuteilungen.ts` filtert
`conf` innerhalb der Aufzählung). Den Filter herauszuziehen verlöre still die
Doppelprüfung gegen `posKey` **und** `idKey`; das war und bleibt Absicht.

**Prüfen:** `npm test` (4801), `tsc -b`, `oxlint`, Sperrklinke unverändert.
Fünf neue Einträge in `scripts/mutationsprobe.mjs` (126) — jede der fünf Regeln
einmal gebrochen und der Lauf rot gesehen, beim Nachladen der Glocke in
**beide** Richtungen (nie nachladen · immer nachladen).

---

## Aufgenommen am 13. September 2026 — Predigtdienstgruppen (T103)

### T103 · Eine Gruppe ließ sich ohne Rückfrage löschen — und niemand sah, wer ohne Gruppe dastand 🔧 ✅ erledigt
**Meldung des Betreibers am 13. September 2026:** „ich konnte eine gruppe
einfach so löschen, ohne dass ich gewarnt werde. die gruppenzuweisungen sind ja
dann auch weg. für planer muss es auch eine warnmeldung generell geben, wenn
personen keiner gruppe zugeordnet sind — das sollte nicht sein."

**1. Löschen nur mit Rückfrage.** Das ✕ an einer Gruppe (Einstellungen →
Predigtdienstgruppen) löschte beim ersten Tipp. Jetzt dieselbe
Zwei-Tipp-Bestätigung wie beim Löschen einer Person und beim Leeren der
Zuteilungen: Der erste Tipp macht aus dem ✕ „Wirklich löschen?" und nennt
darunter die Folgen, erst der zweite löscht; verlässt der Fokus den Knopf,
entschärft er sich. Genannt wird nur, was wirklich verloren geht — die
Zuordnung der Mitglieder, die Treffpunkte der Gruppe —, und zwar aus
**derselben** Funktion, die beim Löschen streicht (`fsGruppeEntfernen`). Eine
leere Gruppe fragt nur.

**2. Beim Nachsehen gefunden: Die Treffpunkte einer gelöschten Gruppe lebten
weiter.** `removeGroup` räumte `persons.grp` ab, den Grundplan aber nicht. Die
Regeln liegen als ein Blob ohne Fremdschlüssel in `fs_rules`, die Datenbank
räumte also auch nichts. Weil die Einstellungen den Grundplan je **Gruppe**
zeigen, stand keine dieser Regeln mehr irgendwo zum Löschen da — erzeugt wurden
sie trotzdem Woche für Woche, und Programm und Planen betitelten sie mit der
rohen Gruppen-Id. Jetzt gehen mit der Gruppe ihre Regeln **und** jeder ihrer
Treffpunkte, auch die nur für eine Woche angelegten (die `regenFsWeeks`
ausdrücklich festhält). Gespeichert wird über den gebündelten Grundplan-Writer:
Ein eben noch getippter Ort desselben Treffpunkts hätte sonst 600 ms später den
alten Grundplan samt der gelöschten Regeln zurückgeschrieben. Bestätigte Leiter
künftiger Treffpunkte erfahren den Wegfall wie jeden Entzug (T99).

**3. Die Warnung „Ohne Predigtdienstgruppe"** (`ohneGruppe` in `helpers.ts`)
steht an zwei Stellen: als Banner in der Personenliste — mit den Namen als
Knöpfen, ein Tipp öffnet das Detail, in dem die Gruppe gesetzt wird — und als
Hinweiszeile mit Anzahl in der Gruppen-Karte der Einstellungen, dort, wo eine
gelöschte Gruppe ihre Mitglieder zurücklässt. Die Folge, die das Banner nennt:
Ohne Gruppe zeigt das Programm keine Gruppentreffpunkte (`fsVisible`).

Bewusst **nicht** gewarnt wird bei der Rolle „Keine" (Schüler ohne
Verkündiger-Status gehören zu keiner Gruppe — eine Warnung, die sich nicht
beheben lässt, lernt man zu übersehen) und solange gar keine Gruppe angelegt
ist. Ein Verweis auf eine Gruppe, die es nicht mehr gibt, zählt als keine.
Nicht auf den Start-Bildschirm: Die Planungs-Karte dort gilt den kommenden
Wochen (T95), das hier ist Stammdatenpflege — wie die Dubletten-Warnung.

> **Bestand:** Was vor diesem Stand gelöscht wurde, ist nicht nachträglich
> geheilt. Mitglieder ohne Gruppe nennt jetzt das Banner; hatte eine schon
> gelöschte Gruppe Treffpunkt-Regeln, liegen die weiter im Grundplan — keine
> Aufräum-Migration, weil der Bestand vor dem Start ohnehin zurückgesetzt wird.

**Prüfen:** `src/app/gruppe-loeschen.test.ts` (neu: was das Löschen anrichtet,
auch nach dem nächsten Laden, und wen die Warnung nennt), Rückfrage und Hinweis
in `einstellungen/panels.test.tsx`, Banner in `personen/PersonenScreen.test.tsx`,
Speichern samt Bündel-Wettlauf in `app/persist.test.ts`. Fünf neue Schlüssel in
allen 34 Sprachen. 13 neue Einträge in `scripts/mutationsprobe.mjs` (173) —
alle 13 bewacht. `npm test` (5185), `tsc -b`, `oxlint`, Sperrklinke unverändert.
Im Browser nachgesehen: Rückfrage und Löschen in der Demo, Hinweis und Banner,
Beheben über den Namen, keine verwaisten Treffpunkte im Programm; auf
Handybreite in Griechisch und rechts-nach-links in Arabisch (Graphit).

> **Nebenbei:** Am 14. September wurde `reducer.test.ts` („übernimmt die
> Nutzdaten, setzt ready und Woche 0") von selbst rot — er rechnete mit dem
> echten Kalender, und der lag ab da in der zweiten Demo-Woche. Der Test hat
> jetzt einen festen Tag wie seine Nachbarn. **Gemessen, ob weitere Tests so am
> Kalender hängen:** Der ganze Bestand lief unter verschobener Uhr an 18
> Zeitpunkten — Wochenwechsel 21./28.9., letzter Demo-Abend 4.10. 23:30, 5.10.,
> November, beide Zeitumstellungen, Jahreswechsel, Schalttag 2028, ein Jahr
> später, dazu späte Abende in UTC wie in der CI. **Kein weiterer roter Test.**
> Die Sonde (eine abgeleitete `Date`-Klasse in einer vorübergehenden
> Setup-Datei) hat nachweislich Zähne: Die alte Fassung des Tests vom 14.9. war
> mit ihr am 9.9. grün und am 15.9. rot.

---

## Aufgenommen am 20. September 2026 — Vorhaben des Betreibers (T105–T109)

Fünf Punkte aus einer Nachricht des Betreibers vom 20. September 2026, in seiner
Reihenfolge. **Festgehalten, nicht umgesetzt** — der Aufwand ist geschätzt und
nicht gemessen. Wo die Stelle im Code schon feststeht, steht sie dabei;
nachgesehen ist damit **wo** etwas liegt, nicht wie es zu lösen wäre.

### T105 · Pläne drucken 🔧 ✅ erledigt (21. September 2026)

> **Gebaut ist der Zeitraum, nicht der Umfang.** Von den drei Fragen oben ist
> eine beantwortet: **welcher Zeitraum** — der Druckknopf klappt jetzt eine
> Wahl auf, „Diese Woche" oder „Ganzer Monat · September 2026", statt sofort
> die angezeigte Woche zu drucken. Der Reiter **Predigtdienst** hat überhaupt
> erst einen Knopf bekommen, auch über einer Woche ohne Treffpunkte (der Monat
> hat vielleicht welche).
>
> **Zum Monat gehört jede Woche, deren Montag in ihm liegt** (`druck.ts`) — so
> hängt die Woche vom 28. September bis 4. Oktober an genau einem Aushang.
> Nicht aus der Position im Bestand und nicht aus der Überschrift, die in der
> Sprache der Versammlung steht, sondern aus `week.start` (T66). Gedruckt wird
> jede Woche mit **demselben Baustein wie die einzelne** (`MitWoche`, aus dem
> Wochenstreifen herausgezogen) — ein eigenes Monatsblatt liefe mit der Zeit
> vom Wochen-Ausdruck weg. Nur was geladen ist: fehlende Wochen werden nicht
> erfunden.
>
> Die Weiche, die der Punkt oben verlangt, steht als drittes Kennzeichen
> `data-print="monat"` an einer Stelle (`druckKennzeichen`, nicht an jedem
> Knopf von Hand) — ein stehengebliebenes Kennzeichen ließe sonst den nächsten
> Wochen-Ausdruck still als Monat herauskommen. Der Block entsteht erst beim
> Klick (`flushSync`, kein Effekt — StrictMode öffnete sonst zwei
> Druckdialoge) und verschwindet nach `afterprint`. Unter der Woche je Woche
> eine Seite, am Wochenende und bei den Treffpunkten mehrere untereinander;
> eine Woche wird nie zerteilt. Die Treffpunkte drucken jetzt in festen Größen
> wie das Programm.
>
> **Offen bleibt, welche Pläne** — die beiden anderen Fragen sind nicht
> entschieden: **Hilfsdienste** stehen weiterhin auf keinem Ausdruck, und
> **Gruppenlisten** gibt es nicht. Wer ohne Konto in der App den Zettel für
> den Einzelnen braucht, hat weiter nur den S-89-Bogen.
>
> **Nachgezogen (nach dem Commit):** Handbuch `planer.md` § 9, jetzt
> „Pläne drucken" statt „Programm drucken", samt der Monatsregel und dem
> Hinweis auf den geladenen Bestand; `verkuendiger.md` § 3 hat einen kurzen
> Abschnitt „Ausdrucken" bekommen, denn der Knopf steht bei jedem — dort stand
> bisher gar nichts davon. Screenshots neu erzeugt: die Treffpunkte tragen
> jetzt eine Druckzeile.

> **Vom Betreiber am 21. September 2026 entschieden — damit erledigt:**
> „vorerst keine Ausdrucke für Hilfsdienste und Gruppenlisten." Die offene
> Frage nach dem Umfang ist beantwortet: Es bleibt bei Programm, Treffpunkten
> und S-89-Bogen, je Woche oder Monat. Wird ein weiterer Ausdruck im Betrieb
> vermisst, kommt er als eigener Punkt wieder — die Weiche `data-print` nimmt
> ein weiteres Regelwerk ohne Umbau auf.

**Wortlaut:** *„setze das drucken von plänen auf die TODO liste."*

**Was es schon gibt:** zwei Ausdrucke, beide eng zugeschnitten. Das **Programm**
druckt die gerade sichtbare Woche und den gerade sichtbaren Reiter — ohne
App-Chrome, ohne Hilfsdienste (Knopf `.prog-print-btn` in
`src/programm/ProgrammScreen.tsx:162`, Regeln in `src/programm/print.css`, Kopf
des Blattes `.prog-print-head` mit Versammlungsname und Reiter). Und der
**S89-Bogen** aus dem Planen-Tab (`src/planen/S89Bogen.tsx`,
`print-s89.css`).

**Was fehlt:** Der Planer selbst hat nichts zum Ausdrucken. Zuteilungen einer
Woche oder eines Monats, die Hilfsdienste, der Treffpunkt-Plan (`FsPlan`,
`FsProgram`), Gruppenlisten — alles nur am Bildschirm. Für den Aushang am
schwarzen Brett und für jeden, der kein Konto in der App hat, gibt es damit
keinen Weg aufs Papier.

**Vor dem Anfangen zu klären:** welche Pläne (Zuteilungen, Hilfsdienste,
Treffpunkte, Gruppenlisten), welcher Zeitraum (nur die sichtbare Woche wie beim
Programm, oder ein Monat am Stück) und für wen (Aushang für alle oder Zettel
für den Einzelnen). Zwei Vorgaben stehen fest, weil die bestehenden Ausdrucke
sie schon tragen: **keine Tonflächen** — Browser drucken Hintergründe
standardmäßig nicht, die Struktur muss über Überschriften und Haarlinien tragen
(`print.css`) —, und ein drittes Regelwerk braucht dieselbe Weiche wie die
beiden vorhandenen (`data-print` am Wurzelelement, gesetzt beim Klick, abgeräumt
bei `afterprint`), sonst drucken sie übereinander.

**Prüfen:** Druckvorschau des Browsers je Plan, mit und ohne
„Hintergrundgrafiken drucken", auf A4 und Letter; und der jeweils andere
Ausdruck danach noch einmal, damit die Weiche wirklich trennt.

### T106 · Bei der Inbetriebnahme alle auf einmal benachrichtigen — vielleicht per WhatsApp 🔧 ⏸ zurückgestellt (21. September 2026)

> **Vom Betreiber am 21. September 2026 zurückgestellt** („erstmal
> zurückstellen"). Nichts daran gebaut. Stand beim Zurückstellen, damit die
> Suche beim Wiederaufnehmen nicht von vorn beginnt: In der Datenbank und im
> NWS-Export steht **keine einzige Telefonnummer** — `wa.me` hätte heute
> nichts zu öffnen. Der Mail-Weg über `send-invite` ist gebaut, läuft aber im
> Rückfall (Mail-Programm/Teilen/Kopieren), weil das Secret `INVITE_FROM` nicht
> gesetzt ist; die Domain versammlung.app gibt es inzwischen.

**Wortlaut:** *„auch wie man beim initialen inbetriebnahme der app alle user
benachrichtigt - vielleicht am einfachsten per whatsapp."*

**Was es schon gibt:** „Alle einladen" in der Personenliste
(`src/personen/PersonenScreen.tsx`) legt für jeden ohne Konto und ohne offenen
Code eine Einladung an, schickt Mails an alle mit Adresse (Edge Function
`send-invite`, aber nur, wenn dort eine Absender-Domain konfiguriert ist) und
legt eine Liste „Name: Code" in die Zwischenablage. Einzeln geht es an der
Konto-Karte (`src/personen/KontoCard.tsx`): Mail-Programm, Teilen
(`navigator.share`) oder Kopieren.

**Der Haken beim Ausrollen:** Jeder Code gehört zu **genau einer Person**
(`makeInvite`, serverseitig `redeem_invite`). Eine Nachricht an die Gruppe kann
ihn also nicht tragen. Die Liste in der Zwischenablage ist eine Hilfe für den
Planer, keine Nachricht für den Verkündiger — jede Zeile müsste von Hand
herausgesucht und einzeln verschickt werden. Bei einer ganzen Versammlung auf
einmal ist genau das die Arbeit, die niemand machen will.

**Warum WhatsApp naheliegt:** Es braucht keinen Server und keine
Absender-Domain. `https://wa.me/<nummer>?text=<text>` öffnet den Chat mit
fertigem Text, und die Nummer steht schon an der Person (`Person.tel`).

**Zu klären:** Die Nummern sind Freitext und müssten für `wa.me` in die
internationale Form gebracht werden (ohne `+`, ohne Leerzeichen) — was tun,
wenn das nicht geht oder keine Nummer da ist. Ob der Planer eine Liste
abarbeitet (je Person ein Tipp, der Stand sichtbar: verschickt / offen), weil
die App immer nur einen Chat nach dem anderen öffnen kann. Ob daneben ein
allgemeiner Text für die Gruppe gehört, der nur ankündigt, dass es die App gibt
und dass jeder seinen persönlichen Code einzeln bekommt. Und ob dieselbe
Mechanik auch für SMS taugen soll (`sms:`), damit niemand ausgeschlossen ist,
der kein WhatsApp hat.

**Prüfen:** Auf einem echten Handy, nicht im Simulator — ob `wa.me` den Chat
öffnet und der Text vollständig ankommt. Dazu der Offline-Stand: Wer Codes
erzeugt, muss sie speichern können, sonst geht eine Einladung hinaus, die
`redeem_invite` nicht kennt (die Wache dafür steht in `PersonenScreen` und
`KontoCard` und darf nicht umgangen werden).

### T107 · Auf dem Handy gehört der Name der Versammlung in die Kopfzeile ⚡ ✅ erledigt (21. September 2026)

> **Umgesetzt:** Im Kopf steht **nur der Name** („MUSTERSTADT"), auf allen
> Handybreiten — ohne das Wort „Versammlung" davor, denn das sagte der
> Wortlaut des Betreibers („nicht ,versammlung' sondern name der versammlung")
> und es spart genau den Platz, der hier knapp ist. Großgeschrieben wird per
> CSS, im Text steht der Name, wie der Planer ihn eingibt (ein Screenreader
> läse „KRUMBACH" sonst als Abkürzung). Der Produktname räumt den Kopf; er
> steht weiter im Menü und auf der Anmeldung — und im Kopf nur noch, solange
> keine Versammlung geladen ist (Laden, Konto ohne Versammlung), damit dort
> nichts leer bleibt. Die Weiche `.brand-long`/`.brand-short` bei 400 px ist
> entfallen. **Gemessen** per DevTools-Protokoll auf 320, 360 und 412 px, je
> in Schriftstufe 1 und 1,45, mit „Musterstadt" und einem 49 Zeichen langen
> Namen: Mitteilungen und Avatar enden immer 20 px vor dem Rand, der Kopf
> scrollt nie, gekürzt wird mit „…". Kürzung schon bei „Musterstadt" nur auf
> 320 px in der größten Stufe — dieselbe Ecke, in der vorher die Wortmarke
> abgeschnitten wurde. `oberflaeche-fremdsprache` prüft den Kopf jetzt mit
> (die Ausnahme galt der Wortmarke), `beschriftungen-quelle` hat die zwei
> Ausnahmen `VERSAMMLUNG.APP`/`VERSAMMLUNG` verloren. Sieben Fälle in
> `shell.test.tsx`, sechs davon werden mit der alten Kurzform rot.
**Wortlaut:** *„auch auf todo: Überschrift auf handy soll nicht ,versammlung'
sein sondern name der versammlung."*

**Gemeint ist die mobile Kopfzeile** (`src/app/AppShell.tsx`, `.mobile-header`):
Logo, daneben die Wortmarke — ab 400 px „VERSAMMLUNG.APP", darunter die Kurzform
**„VERSAMMLUNG"** ohne Endung (`.brand-long`/`.brand-short`,
`src/app/shell.css`). Genau diese Kurzform ist gemeint: Sie sieht auf dem Handy
aus wie eine Überschrift, sagt aber nichts, weil „Versammlung" in dieser App
ohnehin überall steht.

**Was stattdessen dort stehen soll:** der Name der Versammlung. Den gibt es im
Zustand (`state.congregation.name`); die Seitenleiste zeigt ihn schon unter der
Wortmarke (`congSub` = „Versammlung {name}", `SidebarBrand` in
`src/app/Sidebar.tsx`).

**Zu bedenken:** Der Platz ist der Grund für die Kurzform — neben Menü, Logo,
Mitteilungen und Avatar passt der volle Produktname erst ab 400 px.
Versammlungsnamen sind beliebig lang; die Kopfzeile kürzt bereits mit „…"
(`.mobile-header-name`), das trägt auch hier. Zu entscheiden ist, ob das Wort
„Versammlung" davor bleibt oder nur der Name steht (kürzer und sagt dasselbe),
und ob der Produktname auf dem Handy ganz aus dem Kopf verschwinden darf — im
Drawer steht er weiter, und einen anderen Ort hat er auf dem Handy nicht.

**Prüfen:** Demo-Modus bei 360 px mit einem langen Versammlungsnamen, auf der
größten Schriftstufe und rechts-nach-links. Zwei Tests kennen die Wortmarke und
müssen mitgezogen werden: `src/i18n/beschriftungen-quelle.test.ts` (fester
JSX-Text, Grund `produktname`) und `src/i18n/oberflaeche-fremdsprache.test.tsx`
(`.mobile-header-name` ist dort vom sichtbaren Text ausgenommen — steht künftig
ein übersetzbares Wort darin, gilt die Ausnahme so nicht mehr).

### T108 · Treffpunkte: man sieht nicht, für welche Gruppe man gerade etwas einstellt 🔧 ✅ erledigt (21. September 2026)

> **Entschieden und umgesetzt:** eine **eigene Karte je Abschnitt**, alle in
> derselben Farbe (`neutral`) — die Wahl des Betreibers aus zwei Entwürfen
> (die andere waren getönte Blöcke in einer Karte). Die Überschrift setzt sich
> aus zwei übersetzten Bausteinen zusammen, „Treffpunkte · Versammlung" bzw.
> „Treffpunkte · Gruppe 1" (`fsShort` · `versammlungCard` bzw. Gruppenname),
> großgeschrieben per CSS nach der Seitensprache. Der Erklärtext steht einmal,
> in der ersten Karte; der Gruppenaufseher bekommt genau eine Karte samt
> Erklärtext, und eine Gruppe, die es nicht mehr gibt, ergibt gar keine. Die
> beiden Schlüssel `fsGrundplan` und `fsVersSection` las danach niemand mehr —
> aus allen 34 Wörterbüchern entfernt, `.fsr-section*` aus dem CSS. **Im
> Browser nachgesehen** auf 360 px: hell, dunkel (Matcha), Arabisch (der
> Gruppenname wird mit übersetzt) und als Aufseher von Gruppe 2 — fünf Karten
> bzw. eine, kein seitlicher Überlauf; die Karten heben sich von
> „Predigtdienstgruppen" (neutral2) davor und „Hilfsdienste" (petrol) danach
> ab. 13 Fälle in `FsRulesPanel.test.tsx` und `panels.test.tsx`, elf werden mit
> der alten Ein-Karten-Fassung rot.
>
> **Dabei gefunden, eigener Commit:** Im dunklen Schema kachelten die
> Auswahlfelder dieser Karten ein Zickzack-Muster — **T111**, direkt
> nach T110.
**Wortlaut:** *„auch muss die einstellung der treffpunkte der versammlung und
der gruppen nochmal leicht angepasst werden, da man schwer sieht, für welche
gruppe man gerade den treffpunkt einstellt, weil es keine visuelle trennung gibt
zwischen den gruppen. vielleicht einzelne bereiche draus machen, die alle die
gleiche hintergrundfarbe haben."*

**Die Stelle:** Einstellungen → „Grundplan der Treffpunkte"
(`src/einstellungen/FsRulesPanel.tsx`). **Ein** Panel, darin nacheinander die
Versammlung und jede Gruppe. Getrennt wird nur durch eine kleine graue
Kapitälchen-Zeile (`.fsr-section-title`) und 14 px Abstand (`.fsr-section`,
`src/einstellungen/einstellungen.css`); die Zeilen darunter sehen überall gleich
aus und sind untereinander mit derselben Haarlinie abgesetzt wie die Abschnitte
(`.fsr-row`). Beim Scrollen ist die Überschrift schnell aus dem Bild, und der
„+"-Knopf am Ende eines Abschnitts steht unmittelbar über der Überschrift des
nächsten — man tippt leicht in die falsche Gruppe.

**Vorschlag des Betreibers:** je Abschnitt ein eigener Bereich, alle mit
derselben Hintergrundfarbe. Das Bauteil dafür gibt es schon: `panel` mit
`data-farbe` wie bei den übrigen Einstellungs-Panels.

**Zu entscheiden:** ein eigenes Panel je Gruppe (dann trägt die Gruppe die
Panel-Überschrift, und „Grundplan der Treffpunkte" samt Erklärtext steht
darüber) oder getönte Blöcke innerhalb des einen Panels. Und: Der
Gruppenaufseher sieht ohnehin nur seinen einen Abschnitt (`onlyGroup`) — für ihn
darf daraus kein leerer Rahmen und keine doppelte Überschrift werden.

**Prüfen:** `src/einstellungen/FsRulesPanel.test.tsx` und
`panels.test.tsx`; im Browser auf Handybreite mit drei Gruppen, im dunklen
Farbschema und rechts-nach-links, dazu die Sicht des Gruppenaufsehers.

### T109 · Eine eigene Seite fürs Einspringen? 🔧 ✅ entschieden und erledigt (21. September 2026)

> **Entscheidung des Betreibers (21.9.2026): keine eigene Seite** — sie wäre
> fast immer leer. Stattdessen **springt ein Klick auf „Ersatz gesucht" direkt
> zum Bereich Einspringen**, statt oben auf „Meine Aufgaben" zu landen.
>
> **Umgesetzt:** Der Push-Link trägt einen Zusatz,
> `#go=aufgaben&abschnitt=einspringen` (nur „Ersatz gesucht"; „Ersatz
> gefunden" führt weiter ohne Sprung — dort ist nichts mehr zu übernehmen).
> `parseGoAbschnitt` (`src/app/deeplink.ts`) liest ihn und nimmt ihn nur, wenn
> er zum Screen des Links gehört; alte Links ohne Zusatz öffnen die Seite wie
> bisher. Die Navigation merkt sich den Bereich (`sprungZiel`), und „Meine
> Aufgaben" springt hin, **sobald das Gesuch dasteht** — beim Push-Klick kommen
> die Daten still hinterher, deshalb wartet der Sprung auf den Bereich, nicht
> auf den Screen. Dort wird hingescrollt (mit Abstand zur klebenden
> Kopfzeile) und die Überschrift fokussiert, damit ein Screenreader dort
> weiterliest; jede andere Navigation und das Abmelden räumen das Ziel ab.
> **Gleichlauf geprüft:** Der Function-Test liest die gesendeten Links mit dem
> Parser der App. 23 neue Fälle in fünf Dateien; zwei Einträge in der
> Mutationsprobe (`push-gesucht-einspringen`, `sprung-wartet-auf-bereich`),
> von Hand sabotiert, beide bewacht.
>
> **Braucht einen Deploy von `substitute`** — bis dahin kommt der Push weiter
> ohne Zusatz, und die App öffnet die Seite oben wie bisher. ✅ **Deployt am
> 21. September 2026, 15:07** (`substitute` v20, mit den übrigen vier).

**Wortlaut:** *„und todo: sollte man eine extra ,einspringen' page haben"*

**Wo es heute steht:** an zwei Stellen. Als goldener Bereich unten auf „Meine
Aufgaben" (`src/aufgaben/AufgabenScreen.tsx`), sichtbar nur, wenn es offene
Gesuche für mich gibt — und als Vorlage beim Öffnen der App zusammen mit den
Bestätigungen (`ConfirmDialog`, T69). Ein Push-Klick landet auf „Aufgaben"
(`AppShell`), nicht auf einer eigenen Seite.

**Was heute überhaupt ein Gesuch ist:** nur ein Hilfsdienst, den jemand
abgesagt hat, gefiltert auf das, wofür ich qualifiziert und an dem Tag nicht
abwesend bin (`deriveSubstituteReqs`, `src/data/planning.ts`). Gruppengebundene
Dienste und Schulungsaufgaben erzeugen gar keins.

**Die Frage ist offen und keine reine Umbauaufgabe.** Gegen eine eigene Seite:
Sie hätte einen festen Platz in der Navigation, auch wenn nichts offen ist —
eine Seite, die meistens leer ist, lernt man zu übersehen; und das Einspringen
gehört inhaltlich in dieselbe Frage wie die Aufgaben („was habe ich zu tun").
Dafür: wenn mehr daraus werden soll als heute — Gesuche der ganzen Versammlung
statt nur der zu mir passenden, ein Verlauf, wer schon eingesprungen ist, ein
eigener Einstieg aus dem Push heraus.

**Zu entscheiden, bevor etwas gebaut wird:** Der Betreiber hat die Frage
gestellt, nicht die Antwort gegeben.

## Aufgenommen am 21. September 2026 — Personennamen (T110)

### T110 · Der Anzeigename fällt weg — Vor- und Nachname sind eindeutig 🏗 ✅ erledigt (21. September 2026)

> **Alle drei Punkte gebaut.** `dn` ist aus Typ, Eingabefeld, Schema, den drei
> Edge Functions, sechs Wartungsskripten und allen 34 Wörterbüchern
> verschwunden; Vor- und Nachname sind je Versammlung eindeutig, geprüft an
> drei Stellen; Namensgleichheit löst ein Zusatz am Vornamen („Josef sen.").
>
> **Die Regel steht einmal und heißt `namensSchluessel`** (`data/helpers.ts`).
> Entschieden wie oben vorgeschlagen: Groß-/Kleinschreibung und mehrfache
> Leerzeichen zählen nicht, **Akzente sehr wohl** — Müller und Muller dürfen
> zwei Menschen sein, und wer sie zusammenwürfe, verböte einen zulässigen
> Namen. Verglichen wird der **angezeigte** Name, nicht das Feldpaar:
> „Anna Lisa"+„Meier" und „Anna"+„Lisa Meier" stehen überall als dieselbe
> Zeichenkette und ordnen an jedem Platz ohne `pid` derselben Person zu —
> genau das soll die Regel verhindern. Namenlose zählen nicht mit.
>
> **Drei Stellen, drei Aufgaben:**
>
> | Wo | Was sie leistet |
> | --- | --- |
> | Feld im Personen-Detail | nennt die andere Person beim Namen; markiert **beide** Namensfelder, denn die Regel gilt dem Paar |
> | `persist.ts` | hält das **Schreiben** an, nicht die Eingabe |
> | Index `persons_name_eindeutig` | die eigentliche Zusicherung — sie hält auch einen zweiten Planer, einen offenen alten Tab und die Wartungsskripte |
>
> **Der Zwischenstand beim Tippen war der interessante Teil.** Von „Josef
> Mayer" zu „Josef Mayer sen." führt kein Weg, der nicht durch die Dublette
> ginge. Angehalten wird deshalb das Speichern: Der Zustand nimmt jeden
> Tastendruck an, das Feld meldet, und geschrieben wird erst wieder, sobald
> der Name eindeutig ist. Angehalten wird dabei **alles, was am Namen hängt**
> — die Personenzeile, die Treffpunkte und die Wochen, in denen er als Text
> steht (`renameInWeeks` hat ihn im Zustand längst nachgezogen; schriebe man
> sie, stünde er zweimal in der Datenbank). Das **Planer-Recht** geht weiter
> hinaus: Es liegt in `members` und hat mit dem Namen nichts zu tun.
>
> **Dabei entfallen, weil ihr Gegenstand weg ist:** die Warnung „DOPPELTE
> ANZEIGENAMEN" in der Personenliste samt `duplicateDisplayNames` und den
> Schlüsseln `dublettenTitle`/`dublettenHint` — man meldet keinen Zustand, den
> das Schema ausschließt. Ebenso `fullName`, das nach dem Wegfall von `dn`
> Zeichen für Zeichen dasselbe lieferte wie `displayName` (sieben Aufrufer
> umgestellt, statt 91 in die andere Richtung).
>
> **Der Gewinn für die Rechte, wie vorhergesagt:** `mein_anzeigename()` ordnet
> Plätze ohne `pid` über den Namen zu. Solange er doppelt sein konnte, war
> genau das die Lücke in der Bestätigungs-Richtlinie — wer „Josef Mayer" hieß,
> durfte die namenlosen Plätze des anderen bestätigen. Jetzt ist der Rückfall
> eindeutig.
>
> **Geprüft:** `namensSchluessel` und `namensDublette` als reine Funktionen
> (Schreibweise, Leerzeichen, Akzente, leere Namen, der eigene Name, der
> Zusatz am Vornamen); sechs Fälle am Feld; vier in `persist.ts` (Zeile,
> Wochen, das Planer-Recht daneben, und dass es nach der Auflösung hinausgeht);
> fünf am Index in `schema.test.ts`, den Ausdruck wörtlich, damit App und
> Datenbank nicht auseinanderlaufen; fünf an `gleichnamige` im Reset-Skript.
> Dazu **`tests/kein-anzeigename.test.ts`**, eine Vollständigkeitsprobe über
> alle vier Dateiarten: Der Compiler deckt `src/` ab, aber nicht die Spalte im
> `select=`-String, nicht die Skripte ohne Typen und nicht `schema.sql` — und
> genau dort saß sie. Testbestand 5403 → 5430, alles grün.
>
> **Sechs neue Einträge in der Mutationsprobe, samt dem nachgezogenen
> `schema-dollar-rumpf` gemessen: 7 von 7 bewacht** — der Vergleich ohne
> Rücksicht auf die Schreibweise, dass niemand seine eigene Dublette ist, dass
> Namenlose nicht mitzählen, die Schreibsperre für Zeile und Wochen, und die
> Meldung am Feld. Die Wächter sind drei verschiedene Dateien, jede zur Sache
> passend.
>
> **Zwei Dinge liegen beim Betreiber:**
>
> 1. **`build-personen-sql.mjs` in `nws-export` zieht noch nicht mit.** Es
>    erzeugt `dn` für Gleichnamige (`Josef Mayer (M)`), schreibt die Spalte in
>    den `insert` **und legt sie mit einem `alter table … add column if not
>    exists dn` wieder an**. Die App liest sie nicht mehr, und die beiden
>    Josef Mayer scheitern am Index. Das Reset-Skript fängt das jetzt vorher
>    ab (`gleichnamige`, Abbruch mit Namen, bevor irgendetwas gelöscht ist) —
>    richtig behoben ist es aber erst, wenn der Generator den **Vornamen**
>    eindeutig macht statt eines zweiten Feldes. Eigenes Verzeichnis, eigene
>    Aufgabe.
> 2. **Neu aufsetzen und deployen:** `schema.sql` ausführen (der Index kommt
>    nur so in die Datenbank) und `send-plan`, `send-reminders` und
>    `substitute` neu deployen — sie fragen `persons` sonst weiter nach einer
>    Spalte, die es nicht mehr gibt, und PostgREST beantwortet das mit 400,
>    also mit gar keinen Personen.
>
> **Stand 21. September abends:** Punkt 1 ist erledigt — der Generator
> behält bei Gleichnamigen den Zähler aus NWS im Nachnamen („Josef Mayer 2")
> und bricht bei einer echten Dublette mit Namen ab. Von Punkt 2 ist der
> **Deploy erledigt** (alle fünf, 15:07); er durfte vorgehen, weil die neuen
> Functions `dn` nur nicht mehr lesen. `schema.sql` kommt mit dem Neuaufbau
> **zum echten Start**, so der Betreiber — bis dahin fehlt nur der Index.

**Wortlaut:** *„anzeigename raus - vor- und nachname sollte reichen. wenn
jemand gleich heißt, dann muss man eben etwas an den vornamen anhängen. es muss
auch auf unique geprüft werden bei den personen vor- und nachname, damit sicher
keine doppelten vorkommen."*

**Was es heute gibt:** `Person.dn` (Spalte `persons.dn`, Feld „ANZEIGENAME
(OPTIONAL)" im Personen-Detail) ersetzt den vollen Namen überall, wo er steht
oder als Rückfall zuordnet: `displayName`/`listName` (`src/data/helpers.ts`),
`personDisplayName` (`supabase/functions/_shared/planung.ts` — benutzt von
`send-plan`, `send-reminders`, `substitute` und fünf Wartungsskripten),
`mein_anzeigename()` in `schema.sql` (der Namensrückfall der
Bestätigungs-Richtlinie aus migration-022 für Plätze ohne `pid`), die Suche
(`person-filter.ts`) und `isNameless` im Reducer. **Doppelte Namen sind heute
nur eine Warnung:** das Banner „DOPPELTE ANZEIGENAMEN" oben in der
Personenliste (`duplicateDisplayNames`); speichern lässt sich eine Dublette
trotzdem. In der Live-Versammlung gibt es genau einen Fall — zweimal Josef
Mayer, unterschieden über `dn` „(1)"/„(2)".

**Was werden soll:**

1. `dn` verschwindet — aus Typ, Eingabefeld, Wörterbüchern (`anzeigename` in
   34 Sprachen), Schema und allen Aufrufern. Der Name ist immer „Vorname
   Nachname".
2. Vor- und Nachname sind zusammen **eindeutig je Versammlung**, geprüft an
   zwei Stellen: in der App (Personen-Detail und „Person hinzufügen" nehmen
   einen Namen, den es schon gibt, nicht an und sagen es am Feld) und in der
   Datenbank (eindeutiger Index über `congregation_id` und den bereinigten
   Namen). Erst der Index hält auch einen zweiten Planer, einen offenen alten
   Tab und die Wartungsskripte auf.
3. Heißen zwei gleich, hängt der Planer etwas an den Vornamen an („Josef sen.").

**Vor dem Anfangen zu klären:**

- **Was „gleich" heißt:** Groß-/Kleinschreibung und doppelte Leerzeichen
  ignorieren (Vorschlag: ja — „josef mayer" und „Josef  Mayer" sind derselbe
  Name); Akzente nicht (Müller und Muller können zwei Menschen sein).
- **Leere Namen:** Eine frisch angelegte Person hat zunächst weder Vor- noch
  Nachnamen; zwei davon dürfen nicht am Index scheitern (Index nur über
  nicht leere Namen).
- **Tippen erzeugt Zwischenstände:** Das Personen-Detail speichert je
  Tastendruck (gebündelt). Ein Zwischenstand, der kurz einem anderen Namen
  gleicht, darf nicht in die Datenbank gehen und dort als Schreibfehler
  zurückkommen — die App hält ihn vorher an und speichert erst den eindeutigen
  Stand.
- **Bestand:** Die beiden Josef Mayer müssen **vor** dem Index umbenannt sein,
  sonst scheitert die Migration. Da vor dem Produktivstart ohnehin neu
  importiert wird, gehört dieselbe Regel auch in den NWS-Import
  (`versammlung-zuruecksetzen.mjs`): Dublette → Abbruch mit Namen, statt still
  ein `dn` zu setzen.
- **Namen in den Wochen:** Zuteilungen tragen `name` neben `pid`. Fällt `dn`
  weg, ändert sich der angezeigte Name der beiden — `renameInWeeks` zieht ihn
  beim Umbenennen im Client nach, ein Neuimport erzeugt ihn ohnehin neu.
- **Der Gewinn für die Rechte:** `mein_anzeigename()` ordnet Plätze ohne `pid`
  über den Namen zu. Solange Namen doppelt sein konnten, war genau das die
  Lücke darin; mit dem Index ist der Rückfall eindeutig.

**Prüfen:** Regel als reine Funktion (Groß/Klein, Leerzeichen, leere Namen,
Umbenennen auf den eigenen Namen ist keine Dublette); das Personen-Detail weist
eine Dublette ab und nennt sie; `schema.test.ts` kennt den Index; eine
Vollständigkeitsprobe, dass `dn` nirgends mehr gelesen wird; der
Mutationsprobe-Eintrag zu `mein_anzeigename` (sucht heute `btrim(p.dn)`) zieht
mit; alle drei Functions, die `dn` lesen, neu deployen.

### T111 · Im dunklen Schema kachelten Auswahlfelder ein Zickzack-Muster 🔧 ✅ erledigt (21. September 2026)
**Gefunden beim Nachsehen von T108**, nicht gemeldet: In allen vier dunklen
Farbschemata waren die Auswahlfelder der Treffpunkte (Einstellungen und
Planen → Predigtdienst) und des Wochen-Reiters im Planen (Anlass der Woche,
Wochentag der Zusammenkünfte) von einem Zickzack überzogen — das Anlass-Feld
war kaum noch lesbar.

**Ursache:** `.fs-select` und `.sonder-select` setzten `background:` als
Kurzschreibweise. Die setzt Bild, Wiederholung und Lage des app-weiten
Chevrons (`components.css`) mit zurück. Hell verschwand es still — deshalb fiel
es nie auf —, dunkel setzte `:root[data-dark] select` das Bild mit höherer
Spezifität wieder ein, aber mit `repeat` aus der Kurzschreibweise. Bei
`.mem-select` war genau das schon einmal behoben worden; die Falle stand dort
als Kommentar, nicht als Prüfung.

**Behoben:** `background-color` statt `background`, dazu der Platz für das
Chevron am Zeilenende. In den dichten Treffpunkt-Zeilen sitzt es kompakter
(8 px vom Rand, 26 px Endabstand), das Uhrzeit-Feld ist so breit wie sein
Inhalt statt fest 78 px, und Wochentag und Häufigkeit brechen um, wenn beide
nicht mehr ganz in eine Reihe passen — das ✕ bleibt daneben. **Gemessen** per
DevTools-Protokoll auf 320, 360 und 412 px in allen vier Schriftstufen:
kein Treffpunkt-Feld wird gekürzt (vorher schnitt „Jeden 1. im Monat" ab
Stufe 1,15 ab), die Zeile läuft nie über, das ✕ steht nie allein. Einzige
Kürzung bleibt „Versammlungstreffpunkt" im Hinzufügen-Raster des Planens — die
war vorher schon da. **Wache:** `tests/auswahlfeld-chevron.test.ts` liest,
welche Klassen an einem `<select>` hängen, und weist für sie die
Kurzschreibweise ab sowie ein `padding:` ohne zurückgegebenen Endabstand; mit
dem alten CSS meldet sie genau die vier Stellen.

### T112 · Die Mutationsprobe prüft seit Tagen nichts mehr 🔧 ✅ erledigt (21. September 2026)

> **Alle 14 nachgezogen, keiner gestrichen.** Die Regeln waren nicht
> weggefallen, sie waren umgezogen — und zwar in Gruppen:
>
> | Wohin | Einträge |
> | --- | --- |
> | `helpers.ts` → `auslastung.ts` (eigene Datei für die Auslastungs-Rechnung) | `last-hilfsdienst-platzzahl`, `last-ausfall`, `last-fenster-nach-datum` |
> | `AppShell.tsx` → `rechte.ts` (wer welchen Bildschirm betreten darf) | `nav-gruppenaufseher-ohne-personen` |
> | `send-plan` → `_shared/aufgaben-schluessel.ts` (`wochenPraefixe`) | `plan-liest-nur-die-woche` |
> | Start-Karten → Zeitleiste bzw. Ableitung | `start-termin-gerechnet`, `start-nur-eigene-treffpunkte`, `start-wochenfolge` |
> | nur umbenannt/umformuliert an Ort und Stelle | die übrigen sechs |
>
> **Die drei `start-*` sind der interessante Fall.** Der Punkt oben schlug vor,
> sie zu streichen, weil der Start-Bildschirm seine Karten am 19.9. gegen die
> Zeitleiste getauscht hat. Beim Nachsehen gilt das nur für die *Stelle*, nicht
> für die *Regel*: Der Termin wird weiterhin gerechnet — jetzt eine Ebene
> tiefer, in `deriveMyTasks`, und damit für alle, die ihn lesen. „Nur die
> eigenen Treffpunkte" entscheidet jetzt `deriveMyFsTasks` über die Person-Id
> (ohne die Zeile sähen Namensgleiche gegenseitig ihre Treffpunkte — überall,
> nicht nur auf dem Start). Und die Terminfolge sortiert `dashTimeline`.
> Gestrichen hätte drei Regeln unbewacht zurückgelassen, die es sehr wohl noch
> gibt. `import-entity-numerisch`, oben als 15. Name genannt, saß bereits
> wieder — die Zählung „14" stimmte, die Namensliste hatte einen zu viel.
>
> **Damit es nicht wieder still passiert**, wie der Punkt verlangt:
> `scripts/mutationsprobe.test.ts` prüft im **normalen Testlauf**, dass jeder
> Eintrag seine Stelle genau einmal findet und keine Kennung doppelt vorkommt —
> 218 ms, nur Dateien lesen. Beide Fälle von Hand sabotiert, beide rot, mit
> der Meldung, welcher Eintrag wohin zeigte.
>
> Dafür war zweierlei nötig: `ankerFehler()` ist exportiert, und der Lauf liegt
> hinter `selbstGestartet()` — **ein Import der Datei hätte sonst die ganze
> Probe ausgelöst**, mitten im Testlauf, Quelldateien umschreibend, mit einem
> zweiten vitest darin. Pfadvergleich statt `import.meta.main`: Das gibt es
> erst ab Node 24.2, und wo es fehlt, täte die Probe beim Aufruf
> stillschweigend nichts — genau der Fehler, um den es hier geht.
>
> **Und die Wache hätte beinahe die Probe erschlagen.** Beim ersten Messlauf
> standen 14 von 14 Regeln als „bewacht" da — Wächter jedes Mal
> `mutationsprobe.test.ts`. Kein Wunder: Die Mutation räumt ja gerade die
> Stelle weg, deren Vorhandensein die Ankerprüfung verlangt. Sie war damit bei
> **jeder** Mutation der erste rote Test, `--bail=1` brach dort ab, und die
> Probe hätte allen 192 Regeln ein Häkchen gegeben, ohne eine einzige gemessen
> zu haben. Dieselbe Falle wie am 5.9.2026 mit dem wackligen Test, nur diesmal
> systematisch. **Behoben:** Der Probelauf setzt `MUTATIONSPROBE=1`, und nur
> die Ankerprüfung tritt dann zurück. Ungeprüft bleibt dabei nichts — die
> Probe fährt dieselbe Prüfung selbst, bevor sie die erste Mutation setzt.
>
> Die Lehre der Memory hat sich damit ein zweites Mal bewährt: **Passt der
> genannte Wächter fachlich zur Regel?** Steht überall dieselbe Datei, ist
> nicht der Testbestand gut, sondern die Messung kaputt.
>
> **Gemessen, danach: 14 von 14 bewacht**, und diesmal von vierzehn Läufen mit
> acht verschiedenen Wächtern, die alle zur Sache passen — `last-ausfall` von
> `t30.test.ts` (dem Ausfall-Prüfstand selbst), `last-fenster-nach-datum` von
> `wochenabstand.test.ts`, `start-wochenfolge` von `dash-timeline.test.ts`,
> `ohne-gruppe-warnung-personen` von `PersonenScreen.test.tsx`. Die drei
> `start-*`, die zur Streichung vorgeschlagen waren, sind darunter: Sie werden
> an ihrer neuen Stelle sehr wohl verteidigt.
>
> **Nicht gemessen war der Rest** — die übrigen 178 Einträge liefen seit dem
> 5. September nicht mehr. ✅ **Am Abend des 21. September nachgeholt:** der
> volle Durchgang über alle 201 Regeln, 61 Minuten, **201 bewacht, keine
> ungewacht.** Die Schätzung stimmte auf die Minute.
>
> **Nebenbei:** Die Vorprüfung meldet jetzt **alle** verrutschten Einträge auf
> einmal statt nur des ersten. Nach einem Umbau sind es selten einzelne, und
> wer sie nacheinander erfährt, sucht sie nacheinander.

**Gefunden am 21. September 2026** beim Eintragen der zwei Regeln aus T109:
`npm run mutationsprobe` bricht ab, bevor sie eine einzige Regel prüft. Von
192 Einträgen fanden **16 ihre Stelle nicht mehr** — die Probe verlangt je
Eintrag genau einen Treffer und steigt beim ersten fehlenden aus, und zwar
absichtlich („nicht stillschweigend überspringen"). Das heißt aber auch: Seit
dem ersten verrutschten Eintrag ist keine der 192 Regeln mehr gemessen worden.
Der älteste Bruch liegt in `supabase/functions/import-week/text.ts` (zuletzt
geändert am 5.9.), die meisten stammen aus den Umbauten vom 18. bis 20.9.
(`planning.ts`, `helpers.ts`, `plan-versand.ts`, `DashboardScreen.tsx`,
`reducer.ts`, `PersonenScreen.tsx`, `send-plan`).

**Schon nachgezogen:** `zuteilung-beide-raeume` (jetzt über `allePlaetze`) und
`nav-deeplink-rechte` (die Zeile hatte T109 geändert). **Offen, 14 Einträge:**
`zuteilung-gruppen-rotation`, `zuteilung-vorsitz-betet`,
`last-hilfsdienst-platzzahl`, `last-ausfall`, `last-fenster-nach-datum`,
`nav-gruppenaufseher-ohne-personen`, `start-termin-gerechnet`,
`import-entity-numerisch`, `plan-entzug-ausfall-schweigt`,
`plan-entzug-klasse-schweigt`, `plan-liest-nur-die-woche`,
`navigation-woche-nur-mit-recht`, `start-nur-eigene-treffpunkte`,
`start-wochenfolge`, `ohne-gruppe-warnung-personen` — je die Regel an ihrer
neuen Stelle suchen und die Mutation so fassen, dass sie wieder genau den
alten Fehler herstellt. Wo es die Regel nicht mehr gibt (der Start-Bildschirm
hat seine Karten am 19.9. gegen die Zeitleiste getauscht), den Eintrag mit
Begründung streichen. Danach **einmal ganz durchlaufen lassen** (im
Hintergrund, weit über zehn Minuten) und jede „ungewacht"-Meldung ernst
nehmen.

**Und damit es nicht wieder still passiert:** Eine schnelle Prüfung gehört in
den normalen Testlauf — dass jeder Eintrag seine Stelle genau einmal findet.
Das kostet Millisekunden (nur Dateien lesen, nichts mutieren) und hätte jeden
dieser Umbauten am selben Tag angehalten.

## Aufgenommen am 21. September 2026 — Anmeldeseite und Registrieren (T113, T114)

### T113 · Die Anmeldeseite sagt nicht, wofür die App da ist — und nicht, wo man eine Versammlung anfragt 🔧 ✅ erledigt (21. September 2026)

> **Umgesetzt.** Unter dem Namen steht jetzt „Zusammenkünfte planen, Aufgaben
> verteilen, die Versammlung verwalten.", ganz unten „Neue Versammlung
> anfragen: doubrawa@gmx.de" — die Adresse sichtbar zum Abschreiben und als
> `mailto:`-Verweis mit vorbelegtem Betreff, auch in der Demo. Beides in allen
> 34 Sprachen, mit den Wörtern, die das jeweilige Wörterbuch für Versammlung,
> Zusammenkunft und Aufgaben schon führt.
>
> **Die Fragen von unten, so entschieden:**
>
> | Frage | Entscheidung |
> | --- | --- |
> | Wortlaut | drei Tätigkeiten statt der vorgeschlagenen Aufzählung von Bereichen: „Treffpunkte" führen die Wörterbücher uneinheitlich (meist als „Predigtdienst"), und ein „du planst" stimmte für Verkündiger nicht |
> | Adresse | einmal, als Konstante in `login/kontakt.ts`, im Klartext — als Commit-Autor steht sie ohnehin öffentlich; `kontakt.test.ts` hält fest, dass sie im Quelltext nur dort steht |
> | Betreff | ja, in der Sprache des Lesers, aber in jeder Sprache mit dem Namen der App („新会众：Versammlung.app"), damit der Betreiber die Anfrage auch in fremder Schrift erkennt |
> | Demo | ja |
> | Meta-Beschreibung | mitgezogen, ebenso die Beschreibung im Manifest |
>
> **Dabei:** Die Adresse bleibt in Rechts-nach-links-Sprachen
> links-nach-rechts (`dir="ltr"`). Bezeichnung und Adresse stehen als
> Flex-Elemente nebeneinander statt durch ein Leerzeichen getrennt — sie
> brechen je als Ganzes um, und der Abstand gilt auch hinter dem breiten
> Doppelpunkt von Chinesisch und Japanisch. Trefferfläche 24 px wie in T43.
> Der Satz bricht ausgeglichen um (`text-wrap: balance`), und
> `font-synthesis-style: none` verhindert, dass Arabisch, Hebräisch,
> Chinesisch und Japanisch künstlich schräg gestellt werden; Latein bleibt
> echt kursiv. **Gemessen** per DevTools-Protokoll auf 320 und 360 px bis
> Schriftstufe 1,45, hell und dunkel, auf Deutsch, Arabisch, Japanisch,
> Rumänisch und Französisch: nirgends ein Überlauf.
>
> **Geprüft:** sechs Fälle am gerenderten Login (Satz, sichtbare Adresse,
> Mail-Verweis, Demo, Japanisch mit kodiertem Betreff, Arabisch mit
> LTR-Adresse) und sieben in `kontakt.test.ts` (Betreff in allen 34 Sprachen
> unversehrt und nur kodiert, `&` und `#`, App-Name in jedem Betreff, die
> Adresse an genau einer Stelle). Sabotage: sieben Regeln einzeln gebrochen,
> alle rot — eine Lücke dabei gefunden und geschlossen: Die Demo prüfte nur
> den Text der Adresse, nicht, dass sie auch eine Mail öffnet. Drei neue
> Einträge in der Mutationsprobe, 3 von 3 bewacht. Testbestand 5430 → 5443.
> Handbuch `verkuendiger.md` § 1 und die Aufnahme `login.png` nachgezogen;
> deren Aufnahmehöhe steht jetzt auf 860 statt 780.
>
> **Nebenbei gefunden, nicht hier behoben:** In Persisch, Hebräisch und Urdu
> tragen Betreff und Teilen-Text der Einladung noch den alten App-Namen, in
> den Wörterbüchern wie in `send-invite/texte.ts` — als eigene Aufgabe
> vorgeschlagen.

**Wortlaut:** *„auf der login seite muss es einen satz geben, was die app macht:
planen/verwalten der versammlung. und es muss eine kontakt email geben, wo man
hinschreiben kann, wenn man eine neue versammlung anfragen möchte an mich.
email ist: doubrawa@gmx.de"*

**Was es heute gibt:** Die Anmeldeseite (`src/login/LoginScreen.tsx`) zeigt
Logo und Wortmarke „Versammlung.app", das Formular, die Sprachwahl und darunter
einen einzigen Hinweis: `nurMitglieder` („Zugang nur für Mitglieder der
Versammlung", im Demo `demoHinweis`). Wer die Adresse ohne Einladung aufruft,
erfährt weder, wofür die App da ist, noch, an wen er sich wenden kann. Eine
Beschreibung steht nur unsichtbar in `<meta name="description">` (`index.html`,
nur deutsch). Eine neue Versammlung legt allein der Betreiber an
(`scripts/versammlung-anlegen.mjs`) — einen Weg zu ihm nennt die App nirgends.

**Was werden soll:**

1. Unter der Wortmarke **ein Satz, was die App macht:** die Zusammenkünfte
   einer Versammlung planen und die Versammlung verwalten.
2. **Eine Kontaktzeile:** Wer eine neue Versammlung anfragen möchte, schreibt
   an **doubrawa@gmx.de**, als `mailto:`-Link.

**Vor dem Anfangen zu klären:**

- **Wortlaut.** Vorschlag in der Du-Form der übrigen Oberfläche: „Plant die
  Zusammenkünfte deiner Versammlung und verwaltet Aufgaben, Personen und
  Treffpunkte." und „Neue Versammlung anfragen: doubrawa@gmx.de".
- **Übersetzt wie jeder Text:** beide Sätze in `de.ts` und allen 33 Overlays,
  sonst fällt die Seite in 33 Sprachen still auf Englisch zurück. Die Adresse
  selbst gehört **nicht** in die Wörterbücher, sondern einmal als Konstante —
  34 Abschriften liefen beim nächsten Wechsel auseinander.
- **Auch im Demo-Modus?** Vorschlag: ja — wer die Demo ansieht, ist genau der,
  der eine Versammlung anfragen würde.
- **Betreff vorbelegen?** `mailto:…?subject=…` in der Sprache der Oberfläche,
  damit die Anfrage im Posteingang als solche erkennbar ist.
- **Spam:** Die Adresse steht dann öffentlich auf der Seite und im Bundle. Ob
  sie im Klartext stehen darf oder erst beim Anzeigen zusammengesetzt wird,
  entscheidet der Betreiber.
- **`<meta name="description">`** gleich mitziehen, damit Suchmaschine und
  Seite dasselbe sagen.

**Prüfen:** `src/login/login.test.tsx` — Satz und Link sichtbar, in Produktion
und im Demo, `href` mit `mailto:doubrawa@gmx.de`; beide Schlüssel in allen 34
Sprachen. Schriftgrößen wie überall als `calc(px * var(--fs))`. Aufnahme auf
320 px in der größten Schriftstufe und in einer RTL-Sprache: Die Adresse muss
dort links-nach-rechts stehen bleiben (`dir="ltr"` bzw. `<bdi>` am Link), sonst
stellt der Bidi-Algorithmus `@` und Punkt um. Danach die Aufnahme der
Anmeldeseite in `docs/user-guide/` neu erzeugen.

### T114 · Registrieren, wenn es mehrere Versammlungen gibt — erst zu klären 🏗 ☐ offen
**Wortlaut:** *„es muss noch geklärt werden, wie das mit den registrieren läuft
wenn es mehrere versammlungen gibt."*

**Was es heute gibt:**

- **Registrieren kann jeder**, ohne Code („Konto erstellen" auf der
  Anmeldeseite, `signUp` in `src/lib/supabase.ts`). Das Konto gehört danach zu
  keiner Versammlung und bleibt auf „Code einlösen" stehen (`AppShell.tsx`).
- **Welche Versammlung, entscheidet allein der Einladungscode:**
  `redeem_invite` (`supabase/schema.sql`) legt die Mitgliedschaft in der
  Versammlung des Codes an und verknüpft die Person, für die er erzeugt wurde.
- **Ein Konto, eine Versammlung:** `members.user_id` ist Primärschlüssel, und
  `redeem_invite` antwortet mit `already-member`, sobald das Konto irgendwo
  Mitglied ist. Alle Richtlinien fragen `my_congregation_id()` — ein Wert,
  keine Liste.
- **Eine neue Versammlung legt nur der Betreiber an**
  (`scripts/versammlung-anlegen.mjs`: Versammlung, Planer-Person,
  Standard-Dienste, erster Einladungscode). Wie man ihn erreicht, ist T113.
- **Die Trennung selbst ist nachgewiesen** (T78: zweite Versammlung, alle
  RLS-Tabellen, beide Richtungen). Offen ist nicht die Sicherheit, sondern der
  Ablauf.

**Zu klären:**

- **Der erste Planer einer neuen Versammlung:** bleibt es bei Anfrage →
  Skript → Code an den Koordinator, oder soll eine Versammlung sich selbst
  anlegen können?
- **Registrieren ohne Code:** Soll „Konto erstellen" überhaupt ohne Code gehen?
  Heute entstehen Konten ohne Versammlung, die kein Planer sieht und niemand
  aufräumt — bei mehreren Versammlungen werden es mehr.
- **Wechsel und Doppelmitgliedschaft:** Wer umzieht, braucht heute zuerst das
  Entfernen durch den Planer der alten Versammlung, sonst scheitert der neue
  Code an `already-member`. Soll ein Konto in **zwei** Versammlungen sein
  dürfen (etwa bei Aushilfe in einer fremdsprachigen Versammlung)? Das hieße
  Umschalter in der App und einen anderen Schlüssel in `members` samt aller
  Richtlinien — der größte der möglichen Wege.
- **Was sieht, wer `already-member` bekommt?** Heute nur die Fehlermeldung;
  weder er noch der einladende Planer erfährt, wo das Konto schon hängt (und
  soll es auch nicht ohne Weiteres — das wäre eine Auskunft über eine fremde
  Versammlung).

**Prüfen, sobald entschieden:** den Ablauf mit zwei Versammlungen einmal ganz
durchspielen — am Testbestand „Probeversammlung Talheim" aus T78 neben der
echten Versammlung: Konto anlegen, Code aus der einen einlösen, Code aus der
anderen versuchen, Konto entfernen, erneut einlösen.

### T115 · Persisch, Hebräisch und Urdu laden noch unter dem alten Namen ein 🔧 ✅ erledigt und deployt (21. September 2026)

> **Umgesetzt.** Sechs Zeichenketten im Wörterbuch und drei Betreffe in
> `send-invite/texte.ts` tragen jetzt „Versammlung.app" — damit nennen alle 34
> Sprachen die App gleich. Der Name bleibt in allen drei Schriften lateinisch,
> wie ihn Arabisch und Türkisch seit dem 20.9. schon tragen und wie es die
> Farbschema-Namen halten.
>
> | | vorher | jetzt |
> | --- | --- | --- |
> | he Betreff | הזמנה: מתכנן הקהילה JW | הזמנה: Versammlung.app |
> | he Teilen | הזמנה למתכנן הקהילה JW: … | הזמנה ל-Versammlung.app: … |
> | fa Betreff | دعوت: برنامه‌ریز جماعت JW | دعوت: Versammlung.app |
> | fa Teilen | دعوت به برنامه‌ریز جماعت JW: … | دعوت به Versammlung.app: … |
> | ur Betreff | دعوت: JW کلیسیا پلانر | دعوت: Versammlung.app |
> | ur Teilen | JW کلیسیا پلانر کی دعوت: … | Versammlung.app کی دعوت: … |
>
> Hebräisch hängt das `ל` mit Maqaf an den lateinischen Namen (`ל-`), wie es
> die Sprache mit Fremdwörtern hält; Urdu behält sein „کی دعوت" und stellt den
> Namen voran, wie Türkisch es tut. Persisch und Urdu haben seither denselben
> Betreff — „دعوت" ist in beiden Sprachen dasselbe Wort, das ist kein Versehen.

**Wie es entstand — und warum eine Suche nach dem alten Namen es nicht
gefunden hätte.** Die Umbenennung vom 20.9. (`b370710`) war eine
Textersetzung „Congregation Planner" → „Versammlung.app" über 34 Wörterbücher.
An `fa`, `he` und `ur` hat sie **keine einzige Zeile** angefasst (`ar` und `tr`
je zwei) — die drei hatten den alten Namen seinerzeit nicht stehen lassen,
sondern *übersetzt*. Wonach ersetzt wurde, stand dort gar nicht. Eine
Umbenennung per Textersetzung ist für jede Sprache blind, die den Namen
übersetzt hat.

**Die Prüfung ist deshalb positiv gedreht** (`src/i18n/produktname.test.ts`):
Welche Schlüssel den Namen tragen, wird aus dem **deutschen** Wörterbuch
abgeleitet — wer dort den Namen nennt, muss ihn in allen 34 Sprachen nennen.
Keine gepflegte Liste, und unabhängig davon, wie der alte Name lautete. Die
Serverseite braucht keine eigene Zeile: `send-invite.test.ts` hält Wörterbuch
und `texte.ts` zeichengenau zusammen, `ui.test.ts` schließt den stillen
Rückfall aufs Deutsche aus. Daneben steht die wörtliche Suche nach dem alten
Namen (`tests/kein-alter-app-name.test.ts`, Bauart von T110) samt der
Gegenprobe, dass `index.html` und das Manifest den Namen tragen — die Stellen,
die keine Sprache kennt. **Gegengeprüft:** beide Proben laufen rot, wenn man
die Änderung zurücknimmt.

**Nachgesehen, was Tests nicht sehen:** die drei Wortlaute mit `dir="rtl"`
gesetzt, neben dem schon ausgelieferten Arabisch. Alle vier brechen gleich um;
der lateinische Name steht dort, wo er hingehört.

> ✅ **Deployt am 21. September, 17:12** — `send-invite` v10. **Nachgewiesen,
> nicht angenommen:** Der laufende Stand wurde mit `functions download` in ein
> Wegwerf-Verzeichnis geholt und gegen das Repo gehalten — `index.ts`,
> `texte.ts`, `_shared/rest.ts` und `_shared/texte.ts` sind zeichengenau
> gleich, und keiner der drei Betreffe trägt noch den alten Namen. Mails gehen
> in allen 34 Sprachen unter „Versammlung.app" hinaus.
>
> **Nebenbei gelernt:** Die CLI bündelt nicht `_shared/` als Ganzes, sondern
> nur, was wirklich importiert wird — `send-invite` lädt weder `planung.ts`
> noch `zuteilungen.ts` herunter. Das beantwortet die Frage, die bei jedem
> Deploy aufkam: Eine Änderung an einem geteilten Modul betrifft genau die
> Functions, die es einbinden, und keine weiteren.

## Aufgenommen am 21. September 2026 — Code-Review der Umbau-Woche (T116)

### T116 · Das Zurücksetzen nahm die Gruppen-Treffpunkte mit 🔧 ✅ erledigt (21. September 2026)

> **Ein Review über die 45 Commits vom 17. bis 21. September** (356 Dateien,
> +15.500/−9.000) — die Woche, in der Datenmodell, Schema und Schreibschicht
> zugleich umgebaut wurden. Zehn Befunde, alle behoben.

**Der eine, der vor dem Produktivgang zählte.** Das Reset-Skript führt
`fs_rules` unter `BEHALTEN` — „der Grundplan beschreibt die Versammlung, nicht
eine Woche". Das stimmte, solange er ein JSONB-Blob war. Seit T105 ist er eine
Zeile je Regel, `fs_rules.grp` zeigt per Fremdschlüssel auf `groups` und ist
`on delete cascade`: Das Skript löscht alle Gruppen und legt sie neu an, und
dazwischen nimmt die Datenbank **jeden Gruppen-Treffpunkt** mit. Übrig blieb
nur der Versammlungstreffpunkt (`grp is null` — dort greift der
zusammengesetzte Fremdschlüssel nicht). `treffpunkte-importieren.mjs` schreibt
den Grundplan ausdrücklich nicht, gemerkt hätte es also niemand: Im nächsten
Reset des Runbooks wären die Treffpunkte aller Gruppen still verschwunden.

*Behoben (Variante 2, vom Betreiber gewählt):* Die Regeln werden auf den
**Gruppennamen** umgeschrieben und gesichert, bevor etwas gelöscht ist —
denselben Weg gehen die Konto-Verknüpfungen seit jeher, samt Sidecar-Datei für
den Teilabbruch. Danach zurück auf die neuen Ids. Eine Gruppe, die es im SQL
nicht mehr gibt, nimmt ihre Regel mit, wird aber genannt.

**Warum der Wächter es nicht sah — und was er jetzt tut.** Er prüft, dass jede
Tabelle in genau einer der drei Listen steht. Eine Kaskade steht in keiner:
Sie leert eine Tabelle, ohne dass das Skript sie anfasst. Er liest jetzt die
Fremdschlüssel aus `schema.sql` und verlangt für jede Kaskade auf eine
gelöschte Tabelle einen Eintrag in `LEEREN`, `NEU_ANGELEGT` oder der neuen
Liste `KASKADIERT` — und dass das Skript zurückschreibt, was dort steht.

**Die übrigen neun:**

| | Befund | Behoben durch |
| --- | --- | --- |
| `data.ts` | `select('*')` hatte die Schema-Prüfung verloren: Fehlt eine Spalte, kam die Zeile ohne sie zurück, und `zeitenAus` warf beim `.slice()` auf `undefined` — an `void loadAndHydrate(…)` vorbei, das keinen `catch` hat. Die App blieb auf „lädt…" stehen, ohne Fehler und ohne Offline-Stand. | Spalten wieder ausgeschrieben (aus dem Typ abgeleitet); `zeitenAus` fällt je Feld auf die Vorgabe zurück |
| `data.ts` | `saveFsRules` löschte alles, was nicht in der eigenen Liste stand — also auch die Regel, die ein zweiter Planer gerade angelegt hatte. Ohne Fehler, auf beiden Bildschirmen unbemerkt. | löscht nur noch, was **dieser** Planer entfernt hat; der Bündler sammelt die Streichungen über ein `merge` |
| `rechte.ts` | Kein einziger Test, obwohl die Funktion entscheidet, wer die Personenliste öffnet — und `ALLE` ist eine Abschrift des Typs `Screen`, bei der ein vergessener Eintrag den Bildschirm für **alle** unerreichbar macht | `rechte.test.ts`, zweimal mutationsgeprüft |
| `fs.ts` | Beim Prüfen aufgefallen: Die Mutationsprobe meldete den Wächter in `fsGruppeEntfernen` als unbewacht. Der Test übergab `''`, und darauf passt seit dem Wechsel auf `grp: null` keine Regel mehr — er lief mit und ohne Wächter durch | geprüft wird `null`, und das ist der Fall, der zählt: ohne den Wächter verschwänden **alle** Versammlungstreffpunkte, weil eine Gruppe gelöscht wurde |
| `versammlung-anlegen.mjs` | `zeitSpalten` nahm `„2 25:99"` an; der Abbruch kam erst aus PostgreSQL, in einer Meldung ohne den Schalter | Bereichsprüfung, Stunde wird aufgefüllt |
| `persist.ts` (+ Test) | Kommentar: `fs_rules` sei ein Blob ohne Fremdschlüssel, die Datenbank räume nichts | richtiggestellt |
| `helpers.ts` | `zuteilungsLabel` nannte `eigeneRolle` als Baustein — seit T104 gelöscht | richtiggestellt, mit dem Warum |
| `langs.ts` | `JW_TO_CONG` als Umsetzung an der Datenbankgrenze beschrieben — die Sprache ist auf beiden Seiten ein Code | richtiggestellt |
| `edge-parity.test.ts` | prüfte noch die Begleiter-Beschriftung „mit X" und kombinierte sie im Fixture mit `bereichsKey: 'schulungPartner'` — eine Form, die keine Stelle mehr erzeugt | geprüft wird das Paar Schüler/Partner |

**Zwei Dinge, die das Review über sich selbst gelernt hat.** Erstens: Fünf der
zehn Befunde sind veraltete Kommentare aus dem Speicher-Umbau, und das ist
kein Kosmetikum — der in `persist.ts` hat beim Lesen den Blick von der Kaskade
weggeführt. Zweitens: Das Umhängen dieses Kommentars ließ zwei Anker der
Mutationsprobe verrosten, und die Ankerprüfung aus T112 hat es sofort
gemeldet. Beide neu verankert und nachgemessen — alle acht Regeln um das
Löschen einer Gruppe sind bewacht.

**Nicht beanstandet, obwohl verdächtig** (damit die Nullbefunde nicht als
Lücke durchgehen): die RLS-Abdeckung aller 16 Tabellen (der erste Eindruck
täuschte, `schema.test.ts` erzwingt sie), die Übereinstimmung von
`persons_name_eindeutig` mit `namensSchluessel` bis in den Leerraum, die
ersatzlose Entfernung von `eigeneRolle` (in `7a5d9f5` begründet), die
Erinnerungs-Grenzen (Reducer und Datenbank klemmen gleich, `send-reminders`
nimmt sie sortiert), `erlaubteScreens` gegen die alte Bedingung
(wahrheitswertgleich), sowie `MinutenFeld`, `dashTimeline`, `changedSlotKeys`,
`allePlaetze`, `schluesselTeile` und `gemeinsam.mjs`.

---

## Aufgenommen am 25. September 2026 — Durchsicht des ganzen Repos (T117, T118)

### T117 · Eine Verhinderung erreichte nie einen Planer 🔧 ✅ erledigt (25. September 2026)

> **Eine Durchsicht des ganzen Repos am 24. und 25. September**, Vorgabe des
> Betreibers: „such und fixe fehler, finde fehler in der ui oder lücken in der
> bedienung, prüfe die texte und übersetzung und finde lücken in den tests".
> Gelesen wurde der gesamte Produktivcode, das Schema, die fünf Functions und
> die Handbücher; dazu eine Klickprobe im Dev-Server als Planer und als
> Verkündiger. Acht Befunde behoben, acht offen gehalten (T118).

**Der eine, der zählte.** „Ich kann nicht" in den Aufgaben versprach im Toast
„der Koordinator wird informiert" — und kein Koordinator hat je etwas erfahren.
`persist.ts` suchte die Empfänger im Client: `next.members.filter((m) =>
m.planner)`. Ein Verkündiger sieht in `members` aber nur die eigene Zeile
(`members_select`), die Liste war leer, und `insertNotifications` brach über
einer leeren Liste still ab. Der Test blieb grün, weil dem Fixture ein Planer
beilag — der Stand des Planers, nicht der des Verkündigers. Der Zweig in
`notifications_insert`, der jedem Mitglied das Schreiben von `verhindert` an
Planer erlaubte, war damit seit T89 nie erreichbar.

*Behoben:* Die Empfänger bestimmt die Datenbank. `notify_planners(kind,
subject, message)` (security definer) legt je Planer der eigenen Versammlung
eine Zeile an; ein Nicht-Planer darf darüber nur eine Verhinderung melden,
Import und „Plan gesendet" bleiben Planern. Jede lokal entstandene Mitteilung
läuft seither über `notifyPlanners()`, der Verkündiger-Zweig der Richtlinie ist
gestrichen. Der Fanout-Test läuft ohne Mitglieder, `schema.test.ts` bewacht die
Function, zwei Anker der Mutationsprobe zeigen auf sie (beide gemessen).

**Nachzuziehen beim Betreiber:** Die Function und die Richtlinie stehen nur in
`schema.sql`. Bis sie im SQL-Editor angelegt sind, schlägt jede lokale
Mitteilung mit dem Speicherfehler-Toast fehl — `schema.sql` erneut ausführen
(idempotent) oder nur den Block `notify_planners` samt `notifications_insert`.
✅ Am 25. September erledigt: `schema.sql` neu ausgeführt.

**Die übrigen sieben:**

| | Befund | Behoben durch |
| --- | --- | --- |
| `AppShell.tsx` | Ein Planer in einer Versammlung ohne Personen und Wochen hing auf „Versammlung ist noch leer, wende dich an einen Koordinator" — er war der Koordinator, und Import wie Personen lagen hinter dem Hinweis | der Hinweis gilt nur Verkündigern; Test in `shell.test.tsx` |
| `PersonDetail.tsx` / `personen.css` | Die Meldung „Diesen Namen trägt bereits …" hatte keine einzige CSS-Regel und stand als schlichter Absatz hinter dem E-Mail-Feld | Regel in der Weinfarbe der Fehlerkästen, Meldung direkt unter dem Nachnamen |
| `RecoveryScreen.tsx` | „Neues Passwort setzen" zeigte eine ungestaltete Zeile „JW" statt des Logos (Rest des Prototyps) | Logo; der Pfad steht einmal in `lib/logo.ts` statt in drei Kopien |
| `de.ts` + 33 Overlays | Toast „Zugeteilt · Mitteilung gesendet", obwohl Zuteilen seit T99 nichts sendet | „Zugeteilt · noch nicht gesendet" in 34 Sprachen, das Verb je Sprache wie in „Zuletzt gesendet" |
| `de.ts` | „Einladung zum Versammlung.app" | „zu" |
| `README.md` | versprach eine Erstbefüllung mit Demo-Daten (weg seit dem 13. August) und `congregations.settings` (weg seit dem 17. September); `demo.ts` heißt `testdaten.ts` | richtiggestellt |
| fünf Stylesheets | sieben Regeln für Klassen, die kein Bildschirm mehr setzt (`mem-inv-form`, `prog-lang-hint`, …) | gestrichen — und `tests/css-klassen.test.ts` hält seither beide Richtungen über den ganzen Bestand: jede `className`-Literal hat eine Regel, jede Regel einen Leser (fünf Marken für Tests stehen in einer Liste, die sich selbst prüft) |

**Geprüft, kein Mangel:** der Absage-Ablauf, Arabisch mit dunklem Schema,
alle Bildschirme der Klickprobe ohne Konsolenfehler; `s89Hauptsaal` ist der
einzige tote Wörterbuch-Schlüssel (siehe T118).

### T118 · Offene Befunde der Durchsicht 🔧 ✅ erledigt (25. September 2026)

Acht kleine Punkte aus T117, am selben Tag abgearbeitet (Vorgabe des
Betreibers: „mach die acht Punkte auch noch"):

| | Befund | Behoben durch |
| --- | --- | --- |
| `persist.ts` (`confirmTask`) | Sagt jemand einen Hilfsdienst ab und bestätigt später doch, blieben die „Ersatz gesucht"-Zeilen in den Glocken der Angepingten stehen; nur `take` räumte sie ab | dritte Aktion `withdraw` in `substitute` (dieselbe Grenze wie `seek`: der Eingeteilte oder wer abgesagt hat), Client `substituteWithdraw()` beim „Doch bestätigen" nach einer Absage; vier Function-Tests, zwei Anker der Mutationsprobe. Die Function ist am 25. September neu deployt. |
| `persist.ts` (`updateCongregation`) | Eine Zeitänderung schrieb die Endzeit aller geladenen Wochen sofort, ungebündelt — Stunde und Minute sind zwei Felder, also zweimal bis zu 52 Anfragen | `updateCongregation` in `GEBUENDELT`: jede Woche geht einmal hinaus, mit dem letzten Stand |
| `reducer.ts` (`removePerson`) | Abwesenheiten der gelöschten Person blieben mit toter `personId` im Zustand — und in der Datenbank, die nur die Person nullt | der Reducer nimmt sie mit, `persist.ts` löscht die Zeilen; zwei Anker |
| `LoginScreen.tsx` | „Passwort vergessen" ohne Adresse zeigte nur den Toast „E-MAIL" | `resetMailFehlt` („Bitte zuerst deine E-Mail-Adresse eintragen") in 34 Sprachen |
| `KontoCard.tsx` | Der Einladen-Hinweis beschrieb nur den mailto-Weg | `einladenHintMail` nennt beide Wege (Versand über `send-invite`, sonst das Mail-Programm), 34 Sprachen |
| `public/sw.js` | `FONT_HOSTS` und der Google-Fonts-Zweig, der seit den eigenen Schriften nie mehr traf | gestrichen; `service-worker.test.ts` hält fremde Schrift-Hosts draußen |
| `de.ts` | `s89Hauptsaal`, toter Schlüssel in 34 Sprachen | gestrichen; `bible-books.test.ts` hält fest, dass es nur noch `auxHauptsaal` gibt |
| `testdaten.ts` | Demo-Aufgaben mit festem Chip „in 4 Tagen" neben festem Datum | `at` aus dem Demo-Datum, der Countdown rechnet gegen das echte Heute; das Feld `MyTask.chip` (nur Demo) ist weg |

Die Idee einer Start-Karte „N Verhinderungen diese Woche" bleibt eine Idee.

## Aufgenommen am 26. September 2026 — Sperrklinke (T119)

### T119 · Die Sperrklinke meldete „aufgeräumt", ohne gemessen zu haben 🔧 ✅ erledigt (26. September 2026)

> **Behoben, samt einer zweiten Lücke derselben Sorte.**
> `scripts/check-index-access.mjs` sucht tsc jetzt so, wie Node Pakete sucht
> (`tscPfad()`: von `scripts/` aus aufwärts bis zum ersten `node_modules` mit
> TypeScript), und zählt nur Meldungen eines tsc, das auch geprüft hat
> (`tscBefund()`). Verworfen wird ein Lauf, wenn tsc nicht startet oder
> abgebrochen wird, wenn Node auf stderr „Cannot find module" meldet, wenn tsc
> mit einem Wert ≠ 0 endet, ohne eine einzige Meldung zu einer Datei — und
> wenn irgendwo ein Syntaxfehler steht. Der Lauf endet dann mit 2 statt 1, sagt
> „Nichts gemessen — die Grundlinie bleibt, wie sie ist." und schreibt auch mit
> `--update` nichts.
>
> **Die zweite Lücke:** Ein Syntaxfehler in einer einzigen Datei lässt tsc die
> Typprüfung im **ganzen** Projekt auslassen. Gemessen: `const = 1` an
> `hydrate.test.ts` gehängt ergab „Aufgeräumt — 4 → 2, alle anderen → 0" und
> die Bitte, `--update` zu fahren. In der CI fängt `npm run lint` das vorher
> ab, ein Lauf von Hand nicht. Welche Codes als Syntaxfehler gelten, ist an
> Parser und Scanner von TypeScript 6.0 gemessen: 1000–1999, 17000–17999 und
> 17 Einzelgänger. Einen ganzen 18000er-Block darf die Liste nicht nehmen —
> TS18048 („possibly 'undefined'") ist genau die Meldung, die die Sperrklinke
> zählt. Zwei der Einzelgänger kommen allein vor: Ein nicht geschlossener
> JSX-Tag meldet nur TS17008, zwei JSX-Wurzeln nebeneinander nur TS2657.
>
> **Damit es nicht wieder still passiert:** `scripts/check-index-access.test.ts`
> stellt jeden Fall mit gemessenen Ausgaben nach, ohne tsc zu starten, und hält
> die Liste der Syntax-Codes gegen das installierte TypeScript — bringt ein
> Update einen neuen Parserfehler, wird die Probe rot. Jede Wache ist per
> Gegenprobe geprüft (alte Entscheidung, alter fester Pfad, Syntax-Wache aus,
> nur TS1xxx, ein ganzer 18000er-Block): Jedes Mal werden genau die passenden
> Fälle rot.

**Gefunden am 26. September 2026** in einem Worktree der Desktop-App
(`.claude/worktrees/<name>`): `npm run typecheck:index` meldete für alle 32
Dateien der Grundlinie „Aufgeräumt — bitte die Grundlinie nachziehen", jede
„N → 0". Gemessen hatte es nichts. Das Skript startete tsc über den festen Pfad
`<wurzel>/node_modules/typescript/bin/tsc`, und ein Worktree hat kein eigenes
`node_modules` mit Paketen: `npx` findet sie durch Hochwandern im
Hauptcheckout, der feste Pfad nicht. Node starb an „Cannot find module" mit
Rückgabewert 1, das Skript sah nur nach, ob der Prozess **startete**, und null
gezählte Meldungen hießen „aufgeräumt". Ein `--update` darauf hätte die
Grundlinie geleert; im Hauptcheckout wären danach alle 32 Dateien „neu"
gewesen, die CI rot, und kein Deploy wäre mehr durchgegangen.

**Prüfen:** `npm run typecheck:index` im Worktree → „noUncheckedIndexedAccess:
642 Meldungen in 32 Dateien — unverändert." Einen Syntaxfehler in eine Datei
der Grundlinie setzen → Abbruch mit 2 samt der Zeile des Fehlers, die
Grundlinie bleibt unverändert.

**Dieselbe Sorte in der Mutationsprobe:** Sie startet vitest über einen ebenso
festen Pfad und wertet jeden Rückgabewert ≠ 0 als „rot" — im Worktree bekam
so jede Regel ihr Häkchen. Das behebt eine eigene Sitzung im Branch
`claude/intelligent-herschel-fda09f`, die dabei auch diese Sperrklinke
angefasst hat (gemeinsame Pfadsuche `werkzeugPfad()` in `gemeinsam.mjs`). Wer
als Zweiter nach `main` kommt, führt die beiden Fassungen zusammen.

---

## Was bewusst offen bleibt

| Punkt | Warum |
| --- | --- |
| ~~**S2/S3 praktisch nachweisen**~~ | ✅ **gemessen am 19., geschlossen am 23. August 2026** (migration-022). Siehe T89. |
| **S10/S11/S13 praktisch nachweisen** | Code und Regeln sind ausgerollt (24.8.), die Messung steht aus. `scripts/mitgliedsrechte-probe.mjs` kann alle drei — ein Lauf gegen die Probeversammlung genügt, siehe T97. |
| **D7 Mehrbenutzer-Konflikt** | die Voraussetzung ist seit T78 da (zwei Konten derselben Versammlung); statisch belegt (siehe T39), praktisch noch nicht |
| **D4 echte Geräte** | das dokumentierte `pointercancel`-Verhalten ist nicht emulierbar |
| **D5 fachliche Abnahme** | nur ein Koordinator kann beurteilen, ob die Abläufe stimmen |

**Vom Betreiber am 23. August 2026 gestrichen**, nicht vergessen:

- **B4 Übersetzungswortlaut** — „das machen die Nutzer im Produktiveinsatz, das
  kann ich nicht verifizieren." Der Abgleich beträfe ohnehin nur das
  UI-Wörterbuch; die Programm-Inhalte kommen amtlich aus dem jw.org-Import. Und
  der Präzedenzfall T33 zeigt den Aufwand: 34 Sprachfassungen für ein einziges
  Wort, Ergebnis „gibt es nicht einheitlich".
- **B6 Design-Soll-Ist** — „wir sind schon weit weg vom Prototyp und brauchen da
  nichts mehr vergleichen." Der Handoff bleibt die Referenz für Tokens und
  Bauteile, nicht mehr für den Bildvergleich.

---

## Fortschritt

Stand 26. September 2026 · ☑ erledigt · ⛔ geprüft, kein Mangel · ⚠ teilweise · ⏸ zurückgestellt · ☐ offen

Phase 0 ☑☑☑☑ · Phase 1 ☑☑☑ · Phase 2 ☑☑☑⛔ · Phase 3 ☑☑☑☑ ·
Phase 4 ☑☑☑☑☑☑☑☑ · Phase 5 ☑☑☑☑⛔ · Phase 6 ☑☑☑☑☑☑☑☑☑☑ · Phase 7 ☑☑☑☑☑☑☑☑☑ ·
Phase 8 ☑☑☑☑☑☑☑☑☑☑ · Phase 9 ☑☑☑☑ · Nachgetragen ☑☑☑☑☑☑ ·
15. August ☑☑☑☑☑☑ ☑☑☑☑☑☑☑☑☑ · 16. August ☑☑☑☑☑☑☑ ·
22./23. August ☑☑☑☑☑☑ ☑ · 28. August ☑ · 29. August ☑ · 30. August ☑☑ ·
31. August ☑ · 13. September ☑ · 17. September ☑ · 20. September ☑⏸☑☑☑ ·
21. September ☑☑☑☑☐☑☑ · 25. September ☑☑ · 26. September ☑

**118 der 119 Punkte sind abgearbeitet** — erledigt oder mit Begründung als
„kein Mangel" zurückgewiesen. **Offen sind zwei, einer davon zurückgestellt:**

| | Aufgabe | Stand |
| --- | --- | --- |
| **T106** | Alle auf einmal benachrichtigen | ⏸ am 21. September zurückgestellt — keine Telefonnummern im Bestand, `INVITE_FROM` nicht gesetzt |
| **T114** | Registrieren bei mehreren Versammlungen | ☐ erst zu klären: wie ein Konto zu seiner Versammlung kommt, ob es ohne Code entstehen darf und ob es in zwei Versammlungen sein darf |

**Beim Betreiber steht nichts aus (Stand 26. September, abends):**
✅ `import-week` ist neu deployt (15:14 Uhr, Version 33). Mit Commit `e6388f7`
liest der Import unter „Uns im Dienst verbessern" die Form eines Punkts am
Beschreiber der Zeitzeile: „Was würdest du sagen?" bekommt den Platz eines
Bruders statt eines Schülers, und „Unsere Glaubensansichten erklären" als
gespielte Szene Schüler und Partner statt einer Ansprache für Brüder
(S-38-X 8/26, Abs. 6, 9 und 11). Nachgesehen mit `functions list`,
`functions download` — alle 14 Dateien gleich dem Stand von `f9eb2ea` — und
einem Rauchtest: OPTIONS mit dem `ok` des Handlers; die Woche vom
28. September kommt mit „Was würdest du sagen?" als `vortrag`-Platz, die vom
5. Oktober mit der gespielten Szene als Schüler und Partner. Schon importierte
Wochen frischt der Import nicht auf, sie kommen erst mit dem Neuaufbau neu.
`treffpunkte-importieren.mjs` (Commit `6a251db`, NWS-Treffpunkte als
Versammlungstreffpunkt) braucht keinen Deploy — es läuft lokal und braucht nur
den Stand von `main`. T119 braucht ebenso nichts: Es ändert nur ein Prüfskript
der CI.

**Am Nachmittag des 26. September stand beim Betreiber nichts mehr aus:** Die
Übersetzungs-Durchsicht (Commit `0819591`) brauchte vier Deploys, alle
erledigt: ✅ `send-plan`, `send-reminders`, `substitute` und `send-invite` sind
neu deployt (13:43–13:44 Uhr, Versionen 16, 42, 27 und 12). `send-plan` und
`send-reminders` bringen den Push-Rumpf mit der neu gemessenen
Programm-Übersetzung hinaus, `substitute` übersetzt ihn überhaupt erst jetzt je
Gerätesprache — vorher ging er in jeder Sprache deutsch hinaus —, `send-invite`
trägt die angeglichenen Einladungstexte. Rauchtest danach: `send-plan` und
`substitute` antworten auf OPTIONS mit dem `ok` des Handlers und ohne
Nutzer-Token mit `401 unauthorized` — `substitute` also samt dem neu
eingebundenen Übersetzer —, `send-reminders` ohne `CRON_SECRET` mit `401`,
`send-invite` mit `not-configured`, weil `INVITE_FROM` fehlt (T106).
`import-week` braucht keinen Deploy: Aus dem geteilten Code nutzt es nur die
Vergabe der Punkt-Kennungen. Die Commits danach (`6f8b8b5`, `395f95e`,
`c7b8d27`) ändern nur Texte der App; der Client ist über Pages mitgelaufen.

**Am Morgen des 26. September stand beim Betreiber nichts mehr aus:** Die
Durchsicht vom 25./26. September (Commit `71e4539`) brauchte drei Schritte, alle erledigt:
✅ die Spalte `fs_rules.aus` ist angelegt (Wochen, in denen eine
Grundplan-Regel ausgesetzt ist), ✅ `task_gehoert_mir` ist im SQL-Editor neu
eingespielt (eine bekannte Art in fremder Schreibweise wird abgewiesen),
✅ `import-week`, `send-plan`, `send-reminders` und `substitute` sind neu
deployt. Rauchtest danach: `import-week` mit `after: 2099-01-05` antwortet
`404` mit `ende: true` — das gibt es erst in der neuen Fassung, die alte
lieferte die letzte Woche erneut; `send-plan` und `substitute` antworten auf
OPTIONS mit dem `ok` des Handlers und ohne Nutzer-Token mit
`401 unauthorized`, `send-reminders` ohne `CRON_SECRET` mit `401`. Der Client
ist über Pages mitgelaufen.

**Am 25. September stand beim Betreiber nichts mehr aus:** ✅ `notify_planners`
und die verengte Richtlinie `notifications_insert` aus T117 sind im SQL-Editor
angelegt, ✅ `substitute` ist mit der Aktion `withdraw` aus T118 neu deployt.
Rauchtest danach: OPTIONS mit dem `ok` des Handlers, ohne Nutzer-Token
`401 unauthorized` aus dem Handler — das Modul ist samt Importen hochgekommen.

**Am 21. September stand beim Betreiber nichts mehr aus:** Alle fünf Edge Functions laufen seit
dem Abend des 21. September auf dem Stand des Repos — `send-invite` mit den
drei nachgezogenen Sprachen (T115), die übrigen vier mit dem geteilten
`planung.ts`. Nachgesehen mit `functions list`, `functions download` und einem
Rauchtest.

Am Abend des 21. September entschieden: **T105** ist mit dem Zeitraum fertig —
Hilfsdienste und Gruppenlisten druckt die App vorerst nicht —, **T106** ist
zurückgestellt, neu aufgenommen sind **T113** (Anmeldeseite) und **T114**
(Registrieren bei mehreren Versammlungen). **T113** ist am selben Abend
gebaut: Die Anmeldeseite sagt jetzt in 34 Sprachen, wofür die App da ist,
und nennt die Adresse für eine neue Versammlung. Beim Bauen fiel **T115** auf
und ist gleich mit geschlossen: Persisch, Hebräisch und Urdu luden noch unter
dem alten Namen ein, weil die Umbenennung vom Vortag nur die lateinische
Zeichenkette suchte und diese drei den Namen übersetzt hatten. Die Mail
braucht dafür noch einen Deploy.

Zum Schluss desselben Tages ein **Code-Review über die ganze Umbau-Woche**
(**T116**): zehn Befunde, alle behoben. Der schwerste hätte beim Produktivgang
zugeschlagen — das Reset-Skript versprach, den Treffpunkt-Grundplan zu
behalten, und eine Kaskade nahm ihm alle Gruppen-Treffpunkte weg.

Der **21. September** hat die vier kleinen Punkte des Vortags abgeräumt:
**T107** (der Name der Versammlung im Handy-Kopf statt der Wortmarke),
**T108** (eine Karte je Treffpunkt-Abschnitt, aus zwei Entwürfen gewählt),
**T109** (keine eigene Seite fürs Einspringen — der Push springt stattdessen
hin) und von **T105** den Monatsdruck. Beim Nachsehen von T108 fiel **T111**
an, das Zickzack in den dunklen Auswahlfeldern; beim Eintragen der Regeln aus
T109 fiel **T112** auf, und der ist am selben Tag geschlossen: alle 14
verrutschten Einträge nachgezogen, die Ankerprüfung fährt jetzt im normalen
Testlauf mit. Am selben Tag fiel auch **T110**, der größte der Reihe: Der
Anzeigename ist aus vierzehn Dateien, drei Edge Functions und 34
Wörterbüchern verschwunden, und Vor- und Nachname sind seither je Versammlung
eindeutig — am Feld gemeldet, beim Schreiben angehalten, von einem Index
erzwungen.

✅ **Der volle Durchgang der Mutationsprobe ist gelaufen** (21. September
2026, abends): **201 von 201 Regeln bewacht**, keine einzige ungewacht. 61
Minuten, je Regel ein vollständiger Testlauf. Vorher waren nur die 14
nachgezogenen und die 7 aus T110 gemessen — jetzt der ganze Katalog, samt der
Einträge, die seit T67 nie wieder angefasst worden sind.

Damit steht zum ersten Mal für **jede** verzeichnete Regel fest, dass ihr
Entfernen wirklich einen Test rot färbt. Das ist die Aussage, die die
Testzahl (5487) und die Abdeckung (95 %) beide nicht treffen: Sie sagen, dass
Code ausgeführt wird, nicht, dass jemand hinsieht.

> **Zur Ausgabe:** Der Lauf nennt je Regel **eine** Datei, die rot geworden
> ist — nicht zwingend die naheliegendste. Bei
> `kontakt-betreff-kodiert` stand dort `tests/kein-anzeigename.test.ts`;
> nachgestellt fallen in Wahrheit `src/login/kontakt.test.ts` (zwei Tests)
> und `src/login/login.test.tsx`. Die Bewachung stimmt also, der Fingerzeig
> ist nur ungenau. Wer einer gemeldeten Datei nachgeht und dort nichts
> Passendes findet, sucht deshalb besser mit dem Regel-Text weiter.

**Beim Betreiber, Stand 21. September abends:**

1. ✅ **Alle fünf Functions sind deployt** (21. September, 15:07 —
   `send-plan` v10, `send-reminders` v36, `substitute` v20, `send-invite` v9,
   `import-week` v27). Bis dahin lief der Stand von `cefd413` vom
   18. September (mit `functions download` gegen die Commits verglichen);
   jetzt sind der Sprung aus T109, die Adresse versammlung.app, der neue Name
   in den Einladungstexten, der gebündelte Varianten-Import und T110 live.
   **Vorher geprüft,** ob das Tor die ES256-Tokens des Projekts annimmt, denn
   `substitute` lief mit `verify_jwt=false` — vermutlich die Umgehung aus
   supabase/supabase#42244. `send-plan` mit echtem Nutzer-Token und
   ungültiger Aktion antwortete `400 bad-request` aus dem Handler: Das Tor
   lässt durch. `substitute` steht damit wieder auf `true` wie in
   `config.toml`. Rauchtest danach: alle fünf kommen hoch (OPTIONS vom
   Handler), ohne Nutzer-Token 401 aus dem Handler, `send-reminders` mit
   falschem Geheimnis 401, `send-invite` meldet `not-configured`.
2. **Neuaufbau erst zum echten Start** (entschieden am 21. September), dann
   kommt der Index aus T110 mit. `build-personen-sql.mjs` in `nws-export` ist
   schon nachgezogen: kein `dn` mehr, Gleichnamige behalten den Zähler aus
   NWS im Nachnamen („Josef Mayer 2"), eine echte Dublette bricht mit Namen
   ab. Bis zum Neuaufbau heißen die beiden in der App gleich — einen davon
   dort umbenennen.
3. **Einladungs-Mail** (`INVITE_FROM`) ist mit T106 zurückgestellt.
4. ✅ **`send-invite` v10** (21. September, 17:12) — T115, die drei
   übersetzten Namen. Der Lauf um 15:07 hatte v9 gebracht, mit dem neuen
   Namen in 31 Sprachen; Persisch, Hebräisch und Urdu waren außen vor
   geblieben, weil sie ihn übersetzt hatten.
5. ✅ **Die übrigen vier neu deployt** (21. September, 18:26 —
   `import-week` v28, `send-plan` v11, `send-reminders` v37, `substitute`
   v21). Anlass war nicht ein Fehler, sondern der **gleiche Stand**:
   `_shared/planung.ts` hatte sich um 17:54 und 18:12 geändert (Härtung von
   `zeitenAus`, ein herausgezogener Export), und die vier binden es ein —
   `send-invite` als einzige nicht. Verhaltensneutral für einen wohlgeformten
   Datensatz; hinausgegangen ist es trotzdem, damit nicht wieder die Frage
   im Raum steht, welche Function welches `_shared` trägt. Genau daran hing
   der Ausfall vom 13./15. August.

   **Nachgesehen, nicht angenommen:** `functions list` zeigt alle fünf ACTIVE
   mit neuer Versionsnummer. Rauchtest danach — `import-week`, `send-plan`,
   `substitute` und `send-invite` beantworten OPTIONS mit dem `ok` **ihres
   eigenen Handlers** (200), `send-reminders` (verify_jwt=false) antwortet
   ohne Geheimnis mit einem schlichten `Unauthorized` als Text. Beides heißt:
   Das Modul ist samt seiner Importe hochgekommen. Wäre eine Function gar
   nicht gestartet, käme die Plattform-Meldung als JSON — die Unterscheidung
   stammt vom 8. August.

Was ohne Aufgabennummer aussteht, steht unter „Was bewusst offen bleibt".

Am 17. September fielen die letzten beiden der Analyse-Liste auf einen Streich,
weil sie zusammengehören. **T104** hat die Altlasten geräumt: zehn Lade-Migrationen, die
bei jeder Anmeldung liefen, samt der Mechanik, die ihr Ergebnis in die Datenbank
zurückschrieb — mitten in die Arbeit des Planers hinein. An ihrer Stelle steht
eine Zusicherung im Typ: Jeder Programmpunkt trägt seine Kennung vom Entstehen
an (`PartItem.iid` ist Pflichtfeld), also gibt es den Aufgaben-Schlüssel nur
noch in einer Form, und Einfügen, Löschen und Verschieben lassen die
Bestätigungen in Ruhe. Die 25 SQL-Migrationen sind gestrichen; `schema.sql` ist
die einzige Quelle der Datenbank. Und **T98** hat die Dokumentation
nachgezogen, die dieselbe Aufräumung zuletzt ohnehin berührt hätte: die
Sprachzahl, die Wegweiser, ein Handbuch-Abschnitt über einen Schalter, den es
seit T99 nicht mehr gibt, das Sprachverhalten in beiden Handbüchern und alle
17 Aufnahmen neu.

Am 13. September fiel **T103**: Eine
Predigtdienstgruppe ließ sich mit einem Tipp löschen, ihre Mitglieder standen
still ohne Gruppe da, und ihre Treffpunkte lebten unlöschbar weiter — jetzt mit
Rückfrage, die die Folgen nennt, und einer Warnung für alle ohne Gruppe. Am
selben Tag davor **T95**, der
Start-Bildschirm: am 23. August als Ideensammlung aufgenommen, am 2. September
gesammelt und geprüft, dann vom Betreiber als Bauauftrag gegeben — eine Spalte,
nach Rolle sortiert, mit einer Planungs-Karte über die kommenden Wochen.
Davor fiel **T99**: der Mitteilungs-Mechanismus, vom Betreiber am 29. August
im Ganzen zur Durchsicht gegeben und danach umgebaut — die Nachricht geht jetzt
an die eingeteilte Person statt an den Planer, auf dessen Knopfdruck. Und
**T100**, die Gegenprobe dazu am 30. August: Der Umbau erkannte einen Entzug am
Anzeigenamen und aus dem bloßen Wochen-Unterschied — davon meldete das
Berichtigen einer Schreibweise, das Abschalten der Zusätzlichen Klasse und jede
Kongress-Woche einen Verlust, den es nicht gab. Jetzt entscheidet die
Person-Id, und der Platz muss es noch geben. **T101** holte danach die beiden
Punkte nach, die dabei als „zu groß" beiseite lagen: Der Montag einer
Treffpunkt-Woche kommt jetzt aus der Woche statt aus ihrer Ordnungszahl (eine
Lücke im Bestand verschob sonst Schlüssel, Datum und Monatsregel um sieben
Tage), und die vierfach kopierte Präambel der Edge Functions liegt in
`_shared/` — sie war bereits auseinandergelaufen. **T102** hat am 31. August
den Rest jener Durchsicht abgeräumt: Entzüge gehen in einem Aufruf hinaus statt
einzeln, „Plan senden" liest nur noch seine Woche statt beider Tabellen ganz,
die Glocke lädt in zwei Stufen, und der Ort eines Treffpunkts steht auf beiden
Seiten im Termin. Eine Aufbewahrungsfrist für das Versand-Tagebuch hat der
Betreiber dabei ausdrücklich verworfen. Davor fielen die beiden
letzten: **T72** (Abwesenheiten als Zeitstrahl) hat der Betrieb beantwortet,
nachdem der NWS-Import sie überhaupt erst in die App gebracht hatte, und
**T89** ist am 23. August mit der Richtlinie `task_gehoert_mir` nicht nur
gemessen, sondern geschlossen. Am selben Tag hat der Betreiber **B4** und **B6** gestrichen
(siehe „Was bewusst offen bleibt"). **T78** ist am 19. August gemessen und
bestanden — mit einer zweiten Versammlung als Testbestand, in beide
Richtungen, Tabelle für Tabelle (siehe dort). Sie brachte zugleich **zwei
Mitgliedskonten derselben Versammlung** und damit **T89**: S2 und S3 sind am
selben Tag gemessen worden und **beide bestätigt** — die Lücke bei den
Bestätigungen ist keine Lesart mehr, sondern ein Befund mit Beleg. Offen
bleibt daraus D7. **T63** ist am
17. August fachlich geklärt und in beiden Teilen gebaut worden — eine
allgemeine Terminart für die Woche und der Treffpunkt-Leiter als Freitext.
**T88** ist am 17. August gehoben **und belegt** — der Lauf danach ist grün und
trägt keine Deprecation-Anmerkung mehr, die Seite steht auf dem neuen Commit;
**T79** ist mit der Entscheidung vom selben Tag („niemand freigegeben" bleibt)
in allen Teilen geschlossen. Am selben Tag ist der **Rest von T33**
gemessen worden — 34 Sprachfassungen desselben Kongressprogramms — und
**negativ ausgegangen**: ein durchgängiges Wort für „Schlusslied" gibt es
nicht. Das ist kein Ausweichen mehr, sondern ein Befund mit Beleg; er steht
dort samt Quelle, damit die Suche nicht ein drittes Mal beginnt.
**T67** — die Tests selbst geprüft — ist am 16. August dazugekommen: eine
[Mutationsprobe](../../scripts/mutationsprobe.mjs), die Regeln absichtlich
bricht und nachsieht, ob etwas rot wird. Sieben ungewachte Regeln gefunden und
geschlossen, darunter ein Test, der seine eigene Regel nicht prüfte. **T68**
(Datenmodell und Schlüssel) hat drei Fragen mit „trägt" beantwortet und eine
mit **T87**: Die Kennung eines Treffpunkts hing an der Wochennummer und hätte
ein Jahr nach dem Start jede Woche einen zugeteilten Leiter verschluckt.
**T73–T76** sind noch am 15. August erledigt worden;
**T79 bis T81** kamen beim Benutzen desselben Tages dazu (T80 als Nachwehe von
T76, T81 als Widerruf seiner Kürzungs-Mechanik) und sind erledigt.

Am **16. August** kamen **T69** (Einspringen beim Öffnen), die Freigabe-Liste
aus T79, **T82** (Reiter der nächsten Zusammenkunft), **T83** (Wortlaut),
**T84** (erledigtes Gesuch kam wieder) und **T85** („an diesem Tag schon" vor
dem Zusagen) hinzu — die letzten drei aus dem Benutzen heraus. Am selben Tag
erledigt: **T77** (Vergangenes verschwindet) und **T86** (die Glocke räumt sich
auf, migration-020 eingespielt), dazu **T70** — die dritte
Vollständigkeitsprobe, die zusammengesetzte Klassennamen aufspürt. **T66** — der
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

> **Am 15. August 2026, Bestands-Review:** kein Punkt aus dieser Liste, sondern
> eine eigene Runde über den gewachsenen Stand. Daraus entstanden: die Rolle
> **„keine"** für Personen ohne Verkündiger-Status (samt
> `migration-019`), Skripte zum
> **Zurücksetzen der Versammlung** und zum Einspielen der Wochenplanung, fünf
> Befunde aus dem Review selbst (`fb29d3f`), an ihre Person gebundene
> **Treffpunkt-Leitungen** — und die **Sprachhälften** durchgezogen: Rollen in
> der Sprache des Lesers, Titel in der der Versammlung.
>
> **Zwei Vollständigkeitsproben** sind dabei entstanden, beide von den Daten her
> gedacht statt von den Funktionen: `src/data/alle-plaetze.test.ts` fragt jeden
> Aufrufer nach allen vier Platzsorten (Hauptsaal, Zusätzliche Klasse, Ratgeber,
> Hilfsdienste), `src/i18n/aufgaben-label-quelle.test.ts` prüft am Quelltext,
> dass keine Anzeige die beiden Sprachhälften selbst zusammensetzt. (Eine
> **dritte** kam am 16. August dazu: `src/styles/klassennamen.test.ts`, T70 —
> kein Klassenname wird zusammengesetzt.) Beide haben
> beim Anlegen sofort einen echten, bis dahin unbekannten Fund geliefert — und
> genau darauf zielen sie: die häufigste Fehlerart hier ist die zentral
> richtiggestellte Regel mit dem vergessenen Aufrufer, im Review elfmal. Einzelne
> Regressionstests haben das nie verhindert, weil sie je Funktion geschrieben
> werden und die nächste Funktion niemandem einfällt.
>
> Testbestand nach dieser Runde: **1708** in 88 Dateien, grün (15.8., 19:34).

### Was offen ist und warum

> ✅ **Beim Betreiber erledigt (29. August 2026)** — T99 ist damit vollständig
> in Betrieb:
>
> 1. **`migration-024` ist
>    eingespielt** → `assignment_log` steht, die Wiederholungssperre greift.
> 2. **`send-plan` ist deployt** → der Knopf „Plan senden" hat seine
>    Gegenstelle.
> 3. **`send-reminders` ist neu deployt** → die Erinnerung trägt jetzt den
>    `task_key` (Bestätigen direkt in der Glocke), die Sammelmeldung „nicht
>    erreichbar" geht auch als Glocken-Zeile hinaus, und der Rückfall für
>    `repeat` steht auf `false` wie im Client.
>
> ✅ **Zweiter Deploy erledigt (30. August 2026)** — nach T100/T101 gingen
> **alle fünf** Functions neu hinaus, nicht nur `send-plan`: Seit die Hülle in
> `_shared/rest.ts` liegt, binden sie alle dieselbe Datei ein. Damit ist auch
> der Entzug über die Person-Id scharf und das Tagebuch verträgt Dubletten.
>
> **Was jetzt noch aussteht, ist keine Technik, sondern der Betrieb:** eine
> Woche freigeben und nachsehen, ob die Nachricht wirklich ankommt.

> **Der Deploy ist erledigt** (7. August 2026): `substitute` und
> `send-reminders` laufen in der Fassung des Repos. Alles, was bis dahin nur
> geschrieben, aber nicht in Betrieb war — T9/T10/T24, T8/T12/T14 und die
> Treffpunkt-Erinnerungen aus T31 —, ist damit scharf.

| | Aufgabe | Warum offen |
| --- | --- | --- |
| **Phase 7** | T42 (Testdateien) | Der Produktionscode ist vollständig sauber. Die restlichen Meldungen stehen in Testdateien — dort ist ein `undefined` ein roter Test, kein Absturz beim Planer. Die Sperrklinke hält den Stand und lässt ihn nur fallen: 727 in 34 Dateien am 27.8., 661 in 32 nach T104. |
| **Phase 6** | — | **T63** ist am 17. August geklärt und gebaut: eine allgemeine Terminart für die Woche, dazu der Treffpunkt-Leiter als Freitext. Die abweichenden Treffpunkt-Zeiten der Dienstwoche konnte die App schon. |
| **15. August** | T72 | Nur noch das Vorhaben „Abwesenheiten" — es ist ausdrücklich erst zu überlegen. T67–T71 und T73–T81 sind erledigt. |
| **19. August** | — | **T78** ist gemessen und bestanden: zweite Versammlung als Testbestand angelegt, Trennung in beide Richtungen und über alle 14 Tabellen mit RLS geprüft — mit dem anon-Key, nicht mit der Service-Role. Darauf **T89**: S2 und S3 gemessen, beide bestätigt. Nebenbei entstand der Wächter `no-undef` im Lint. |
| **16. August** | — | T67, T68, T70, T71 und T82–T87 sind am selben Tag erledigt; migration-020 ist eingespielt, `substitute` und `send-reminders` sind deployt. **T88** kam beim Push desselben Tages dazu und ist am 17. August gehoben und belegt. |
| **17. August** | — | **T79** ist mit der Entscheidung des Betreibers geschlossen: Ein neu angelegter Hilfsdienst startet weiter mit „niemand freigegeben". Zu ändern war daran nichts. Ebenso der **Rest von T33**: die Wortlaute für „Schlusslied" sind an einer echten Parallelquelle gemessen — 26 Sprachen geben ihn her, 8 nicht, Französisch gar nicht. `SONG_WORD` bleibt. |

> ✅ **Beim Betreiber erledigt (15. August 2026)** — der Stand des Repos ist
> vollständig in Betrieb:
>
> 1. **`import-week`, `substitute` und `send-reminders` sind neu deployt**
>    (15:44 Uhr). Nachgesehen mit `functions list`: `updated_at` aller drei liegt
>    hinter `92b4a9e` (14:28 Uhr), dem letzten Commit, der `supabase/functions/`
>    anfasst. Damit ist scharf, was seit dem 8. August dort auflief: der
>    **Ratgeber der Zusätzlichen Klasse** in den Erinnerungen, die **Ausfälle in
>    der Ersatzsuche** (`a915a0c`), die an ihre Person gebundenen
>    **Treffpunkt-Leitungen** (`92b4a9e`) und die fünf Befunde aus `fb29d3f`.
> 2. **`migration-019` ist
>    eingespielt** → `persons.role` lässt „keine" zu. Damit nehmen das
>    Rücksetz- und das Wochenplanungs-Skript auch Personen ohne
>    Verkündiger-Status an; vorher hätte die Datenbank sie abgewiesen.
>
> **Dabei aufgefallen — eine Lücke im Eintrag vom 13. August.** Dort steht,
> `send-reminders` und `substitute` liefen „schon aus der Runde davor", also in
> der Fassung vom 8. August. Die las `weeks?select=position,data` — und
> migration-018 hat `position` am selben 13. August gelöscht. Der Hinweis stand
> im Kopf der Migration („müssen vor dieser Migration ebenfalls neu deployt
> sein"); die eingehaltene Reihenfolge galt aber nur dem Seiten-Deploy. In
> `send-reminders` hängt die Wochen-Abfrage ohne `catch` im `Promise.all` (nur
> `fs_weeks` fängt ab) — der Lauf bricht also als Ganzes ab. **Daraus folgt:**
> die Cron-Läufe vom 14. und 15. August (08:00 UTC) sind ausgefallen, und
> „Einspringen" war zwei Tage lang tot. Das ist geschlossen, nicht gemessen —
> belegt sind Code und Zeitstempel, die Function-Logs sind ungelesen.
> Nachzuholen ist nichts: der Lauf am 16. August greift wieder; verloren sind
> nur die Erinnerungen, deren Tag genau in die Lücke fiel.
>
> **Regel für den nächsten Deploy:** Ein Eintrag „X ist deployt, Y lief schon"
> muss belegen, dass Y seither unberührt ist. `git log <letzter Deploy>..HEAD --
> supabase/functions` beantwortet das in einer Zeile — und `functions list`
> zeigt hinterher, ob der Stand wirklich hochgekommen ist.

> ✅ **Beim Betreiber erledigt (13. August 2026)** — T64, T65 und T66 sind
> vollständig scharf:
>
> 1. **`migration-018` ist
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
> 1. **`migration-016` ist
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
| **T33** (Beschriftung „Schlusslied") | ⛔ gemessen, kein Wort: das Kongressprogramm nennt Lied und Gebet zusammen — in 8 Sprachen ergäbe ein Schnitt bloß „Lied", auf Französisch steht gar kein Schlusswort. `SONG_WORD` unter der gemessenen Überschrift `ABSCHLUSS` bleibt |
