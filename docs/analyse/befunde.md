# Befunde — Tiefenanalyse Congregation Planner

Stand: 7. August 2026, Commit `e2cdb41`. Erstellt in einer reinen Analyse-Session
(**keine Code-Änderungen**). Ergänzt [funktionsuebersicht.md](funktionsuebersicht.md).

Gelesen wurden: alle Dateien in `src/data`, `src/app`, `src/lib`, `src/i18n`
(Struktur), alle Screens/Panels, `supabase/schema.sql`, alle vier Edge Functions,
`public/sw.js`, sowie alle 51 Testdateien (Testnamen).

**Kennzeichnung:** ✅ = im Code verifiziert (Datei + Zeile genannt) · ⚠️ = plausibel,
aber nicht zur Laufzeit nachgestellt. Es wurde nichts ausgeführt — kein Build, keine
Tests, kein Dev-Server.

---

## Inhalt

- [0. Prioritätenliste](#0-prioritätenliste)
- [A. Fehler (Bugs)](#a-fehler-bugs)
- [B. Fachliche Lücken (Versammlungsablauf)](#b-fachliche-lücken-versammlungsablauf)
- [C. Ungereimtheiten & Inkonsistenzen](#c-ungereimtheiten--inkonsistenzen)
- [D. Übersetzungslücken](#d-übersetzungslücken)
- [E. Fehlende Tests](#e-fehlende-tests)
- [F. Sicherheit & Datenschutz](#f-sicherheit--datenschutz)
- [G. Verbesserungen](#g-verbesserungen)
- [H. Datei-Schnellindex](#h-datei-schnellindex)

---

## 0. Prioritätenliste

Nach Wirkung auf den echten Betrieb, nicht nach Aufwand.

| # | Befund | Wirkung |
| --- | --- | --- |
| **B18** | **Totalausfall:** Mitteilungen öffnen stürzt die App in **30 von 34 Sprachen** ab (`MON` statt `MONA` in `translate.ts:165`) | Weißer Bildschirm — im Browser reproduziert, siehe [pruefergebnisse.md](pruefergebnisse.md) |
| **B19** | **Kein Error Boundary** im gesamten Projekt | Jeder Komponentenfehler nimmt die ganze App mit |
| **B20** | **`schema.sql` ist unvollständig** — `fs_rules`, `fs_weeks`, `reminder_log`, `is_group_overseer()`, `persons.fam` fehlen, obwohl jede Migration „schema.sql enthält alles" behauptet | **Nur Neuinstallationen**: Treffpunkte tot, **jedes Speichern einer Person schlägt still fehl**. Die laufende Instanz ist live geprüft und vollständig migriert |
| **B1** | App startet auf der **ältesten** geladenen Woche statt auf der aktuellen | Jeder Login landet bis zu 1 Jahr in der Vergangenheit |
| **B2** | `week.current` wird im Produktionsbetrieb **nie** gesetzt | Dashboard zeigt dauerhaft „0 Konflikte", Chip „AKTUELLE WOCHE" erscheint nie |
| **B3** | Bestätigungen verrutschen beim **Löschen/Einfügen** eines LAC-Punkts | Falsche Person gilt als bestätigt; „Meine Aufgaben" zeigt falschen Status |
| **B4** | Importierte Wochen zeigen als Termin die **Wochenspanne** statt des Zusammenkunftstags | „Meine Aufgaben", S-89-Formular und Programm-Kopf nennen kein Datum |
| **B5** | Doppelbelegungs-Prüfung ignoriert die **Zusätzliche Klasse** | Person kann unbemerkt in beiden Räumen gleichzeitig stehen |
| **B6** | Gesprächspartner-Geschlecht wird am **falschen Raum** geprüft | Manuelle Zuteilung in der Klasse folgt dem Hauptsaal-Führer |
| **S1** | `send-reminders` ist **offen**, wenn `CRON_SECRET` fehlt | Konstruktionsschwäche (fail-open). **Live geprüft: Secret ist gesetzt, aktuell nicht ausnutzbar** — siehe [umgebungspruefungen.md](umgebungspruefungen.md) |
| **B7** | Minuten-Steuerung im LAC ist bei **nicht-deutscher** Versammlungssprache tot | Klick auf ± bewirkt nichts, keine Rückmeldung |
| **F1** | Öffentlicher Vortrag ist fest **„Gastredner"** | Eigener Redner bekommt keine Aufgabe, Bestätigung, Erinnerung |
| **F2** | Kreisaufseher- und Gedächtnismahl-Woche sind **nicht setzbar** | Beide Sonderwochen existieren nur in den Demo-Daten |
| **S2** | Jedes Mitglied kann **fremde** Bestätigungen schreiben | Falsches „✓" beim Planer; falsche Ersatzgesuche auslösbar |
| **F3** | **Treffpunkte** haben keinen Bestätigungs-/Erinnerungs-Flow | Leiter erfährt seine Zuteilung nur beim Nachschauen |
| **D1** | 30 von 33 Sprachen fehlen 26–34 Programm-Fragmente | „gerade eben", „ohne Zuteilungen" u. a. bleiben deutsch |
| **B8** | `send-reminders` nutzt den **Array-Index** statt `position` | Bei Lücken in den Wochen-Positionen: Erinnerungen für falsche Slots |
| **S7** | `substitute: seek` prüft den Aufrufer nicht | Jedes Mitglied kann Push an alle Qualifizierten auslösen — im Namen einer dritten Person |
| **B16** | Einspringen ohne Sperre | Zwei Einspringende: der erste steht danach nirgends, sah aber „übernommen" |
| **D5** | Ersatzsuche kommuniziert nur deutsch | Glocke **und** Push in 33 Sprachen deutsch |
| **B10** | Offline lässt sich die eigene Aufgabe nicht öffnen | Genau der Fall, für den der Offline-Modus gebaut wurde |
| **S10** | `substitute` nahm die **Versammlung aus dem Anfrage-Rumpf** | Ein `#` daran schnitt die folgenden Filter ab: alle Wochen überschrieben, alle Bestätigungen und Mitteilungen gelöscht |
| **S11** | Abwesenheit ließ sich auf eine **fremde Person** eintragen | Der Betroffene fällt monatelang aus jeder Zuteilung — ohne sein Zutun, unter seinem Namen |
| **S12** | `import-week` holte **jede Adresse**, die im Rumpf stand | Bote ins interne Netz, offen erreichbar; der Fehlertext war der Rückkanal |
| **S13** | `substitute: take` prüfte nicht, ob **überhaupt Ersatz gesucht** war | Jeder Qualifizierte konnte jeden Platz an sich ziehen und die fremde Bestätigung löschen |

---

## A. Fehler (Bugs)

### B1 — App startet auf der ältesten geladenen Woche ✅

`src/app/reducer.ts:885` setzt beim Hydrieren `week: p.weekFrom`;
`src/app/init.ts:120` startet mit `week: 0`. `weekFrom` ist
`max(0, höchstePosition − 51)` (`src/lib/data.ts:582`) — also die **älteste** noch
geladene Woche, bei voller Historie ein Jahr zurück.

Es gibt **keine** Logik, die zur heutigen Woche springt. Nach dem Login zeigen
Programm und Planen ein altes Programm; der Nutzer muss sich bis zu 52-mal
vorwärtsblättern.

Im Demo-Modus fällt es nicht auf, weil dort Woche 0 zufällig `current: true` ist.

**Behebung:** Beim Hydrieren die Woche über das Kalenderdatum bestimmen —
`meetingDate()` bzw. `week.start` liefern das bereits. Fallback: letzte Woche mit
`start <= heute`.

### B2 — `week.current` wird im Produktionsbetrieb nie gesetzt ✅

`current: true` steht ausschließlich in `src/data/demo.ts:328`. Der Import setzt
`current: false` (`supabase/functions/import-week/parse.ts:289`), und kein Code-Pfad
führt das Flag je nach.

Folgen:

1. `src/dashboard/DashboardScreen.tsx:53-54`:
   ```
   const conflicts = curIdx >= 0 ? weekConflicts(...).length : 0
   ```
   `curIdx` ist −1 → **die Planer-Kachel meldet dauerhaft „0 Konflikte"**, egal wie
   viele es gibt.
2. `DashboardScreen.tsx:46`: „Diese Woche" fällt auf `state.weeks[state.week]`
   zurück — zusammen mit B1 also auf die älteste Woche.
3. `src/components/WeekBadges.tsx:12`: Der Chip „AKTUELLE WOCHE" erscheint nie.
4. Bei per `seedCongregation` befüllten Versammlungen bleibt `current` auf Woche 0
   stehen und veraltet dort dauerhaft.

`src/data/fs.ts:30-32` benennt das Problem für die Treffpunkt-Basis explizit
(„das `current`-Flag wird nicht gegen das echte Datum nachgeführt") — die
Konsequenz für Dashboard und Chips wurde nicht gezogen.

**Behebung:** `current` gar nicht speichern, sondern aus `week.start` + heute
ableiten (eine Funktion, überall verwendet).

### B3 — Bestätigungen verrutschen beim Löschen/Einfügen eines LAC-Punkts ✅

`task_key` ist positionsbasiert (`wi|tab|part|si|ii|ni`, `planning.ts:755`).

- `lacMove` tauscht die Bestätigungen korrekt mit
  (`reducer.ts:773-793` + `persist.ts:181-195`, `swapPartConfirmations`).
- **`lacRemove` und `lacAdd` tun das nicht.** `reducer.ts:755-760` und `794-799`
  ändern nur `weeks`; `persist.ts:196-203` ruft ausschließlich `saveWeek`.

Beispiel: LAC enthält `[A(ii=1), B(ii=2), VBS(ii=3)]`, B ist bestätigt
(`…|part|si|2|0`). Der Planer löscht A → `[B(ii=1), VBS(ii=2)]`. Die Bestätigung
liegt jetzt auf **VBS**; B gilt wieder als offen und bekommt erneut Erinnerungen,
VBS gilt fälschlich als bestätigt.

**Behebung:** Analog zu `lacMove` die Schlüssel ab der Einfüge-/Löschstelle
verschieben (lokal **und** in der DB) — oder task_keys von der Position lösen
(siehe V1).

### B4 — Importierte Wochen zeigen die Wochenspanne statt des Termins ✅

`parse.ts:288` setzt `date: range`, also `"7.–13. September"` statt
`"Dienstag, 8. September · 19:00 · Königreichssaal"`. Kein Lade-Pfad reichert das
Feld an (`lib/data.ts:614-625` migriert nur Namen/pids/Helper/Vorsitz-Keys).

`taskDate()` (`planning.ts:883`) schneidet daraus die ersten beiden `·`-Atome —
bei einer Wochenspanne bleibt die Wochenspanne. Betroffen:

| Stelle | Zeigt |
| --- | --- |
| „Meine Aufgaben" (`MyTask.date`) | „7.–13. September" |
| Dashboard-Hero | dito |
| S-89-Formular (`buildS89ForSlot`, `planning.ts:729`) | dito — das Formular verlangt ein Datum |
| Programm-Kopf (`ProgrammScreen.tsx:140`) | dito |
| Push-Erinnerung (`send-reminders/index.ts:220`) | dito |

`src/personen/person-timeline.ts:38-42` beschreibt genau dieses Problem und rechnet
das Datum selbst — die übrigen Stellen wurden nicht nachgezogen.

**Behebung:** `meetingDate()` (bzw. eine Variante davon, siehe U1) an allen Stellen
verwenden, statt `meeting.date` roh anzuzeigen.

### B5 — Doppelbelegungs-Prüfung ignoriert die Zusätzliche Klasse ✅

`assignmentsInMeeting` (`planning.ts:183-196`) iteriert `item.names` — **nicht**
`slotsOf(item, aux)` — und kennt `auxRatgeber` nicht. Direkt daneben machen es
`countOpenSlots` (Z. 255), `changedSlotKeys` (Z. 286) und `clearAssignments`
(Z. 663) über `raeume(meeting)` richtig.

Folgen:

- Zuteilungs-Sheet (`AssignSheet.tsx:195`): der Hinweis „heute schon zugeteilt"
  bleibt aus, wenn die Person in der Klasse steht → Doppelbelegung wird nicht
  gewarnt.
- Dashboard (`DashboardScreen.tsx:118`): wer **nur** in der Klasse eingeteilt ist,
  sieht „frei" statt „Deine Aufgabe".
- `takeSubstitute` (`reducer.ts:737`): die Konflikt-Erkennung beim Einspringen
  übersieht Klassen-Zuteilungen.

### B6 — Partner-Geschlecht wird am falschen Raum geprüft ✅

`AssignSheet.tsx:130-133` sucht den Gesprächsführer in `partItem.names` —
unabhängig davon, ob der zu besetzende Platz zur Zusätzlichen Klasse gehört
(`partSel.aux`). Auch `curSlot` (Z. 129) liest den Hauptsaal-Slot.

Die **Auto**-Zuteilung macht es richtig und begründet es explizit
(`planning.ts:501-511`: „Der Gesprächspartner muss zum Führer DESSELBEN Raums
passen"). Die manuelle Zuteilung folgt weiterhin dem Hauptsaal.

### B7 — LAC-Minuten funktionieren nur bei deutscher Versammlungssprache ✅

`itemMinutes` (`meeting-edit.ts:16`) sucht `/(\d+) Min\./`. Der Import übernimmt die
Zeitangabe **wörtlich aus der Zielsprache** (`parse.ts:346`, `firstParen(time)`) —
englisch also `„10 min."`, griechisch `„10 λεπτά"`.

Damit liefert `itemMinutes` `null`, und `lacAdjust` steigt bei
`meeting-edit.ts:64` aus, ohne etwas zu tun. Der Nutzer tippt auf „+"/„−", **nichts
passiert und es erscheint keine Meldung**. Ebenso kürzt `lacRemove` das Meeting-Ende
nicht.

Gleiches Muster: `shiftEnd` (Z. 26) erwartet `HH:MM` in `„Ende ca. 20:45"`.

### B8 — `send-reminders` verwechselt Array-Index und Position ✅

`supabase/functions/send-reminders/index.ts:396`:
```js
weeks.forEach((row, wi) => { … })
```
`wi` ist der Index im Ergebnis-Array. Die Abfrage (Z. 360) selektiert `position`
mit, verwendet es aber nicht. Der Client löst dasselbe Problem sauber über
`weekFrom` + `Week.stub` (`lib/data.ts:612-625`), weil die Position in **jedem**
task_key steckt.

Solange die Positionen lückenlos bei 0 beginnen, stimmt es zufällig. Sobald eine
Woche gelöscht wird oder Positionen nicht bei 0 starten, erinnert die Function an
**falsche Slots** und prüft die Bestätigungen der falschen Woche.

### B9 — `partWorkload` zählt die Klasse auch, wenn sie abgeschaltet ist ✅

`helpers.ts:262`: `for (const slot of item.aux ?? []) if (slot.name === name) count++`
— ohne `hatAuxKlasse`-Prüfung. Beim Ausschalten der Zusätzlichen Klasse bleiben die
Namen bewusst stehen (`aux-class.ts:99-102`), zählen aber weiter als Last.

Folge: Nach dem Abschalten bevorzugt die Auto-Zuteilung dauerhaft die Personen, die
früher **nicht** in der Klasse waren. Alle anderen Leser benutzen `raeume(meeting)`.
Gleiches gilt für `meeting.auxRatgeber` (Z. 254).

### B10 — Offline: eigene Aufgaben lassen sich nicht öffnen ✅

`src/app/readonly.ts:16-48` führt `openMyTask` / `closeMyTask` **nicht** in der
Positivliste. Beide sind reine Ansichts-Aktionen (Sheet auf/zu). Im Offline-Stand
antwortet die App stattdessen mit „nur lesend" — man kann seine Aufgabe nicht
einmal ansehen, obwohl genau dafür der Offline-Modus da ist.

Ebenfalls nicht gelistet: `welcomeShown`. Der Effekt in `AppShell.tsx:153-158`
dispatcht sie nach dem Anmelden → offline wird daraus ein „nur lesend"-Toast, und
die Begrüßung erscheint nie. Der Nutzer sieht beim Start einen irritierenden
Fehlertext.

### B11 — Zeitzonen-Versatz beim Speichern der Treffpunkt-Basis ✅

`lib/data.ts:650`: `fsBaseDate.toISOString().slice(0, 10)`.

`fsBaseDate` ist bewusst **lokaler Mittag** (`fs.ts:45`, um genau diesen Fehler zu
vermeiden). `toISOString()` rechnet nach UTC: bei UTC+13/+14 (Neuseeland Sommerzeit,
Samoa, Kiribati) wird aus 12:00 Ortszeit 23:00 **des Vortags** → die gespeicherte
Basis ist einen Tag zu früh. Das Lesen ist abgesichert (`reducer.ts:874`
`T12:00:00`), das Schreiben nicht. Dieselbe Stelle: `persist.ts:175`.

### B12 — `helperWorkload` zählt unsichtbare Plätze ✅

`helpers.ts:277` iteriert **alle** Einträge eines Dienstes, `deriveMyTasks` und
`derivePendingNames` dagegen nur `pos < svc.count` (`planning.ts:948`).

Reduziert der Planer die Platzzahl eines Dienstes von 3 auf 2, verschwindet die
Zuteilung auf Position 3 aus „Meine Aufgaben" — **zählt aber weiter als Last** und
benachteiligt die Person dauerhaft bei der Auto-Zuteilung. Auch
`clearAssignments('helpers')` leert diese Plätze mit und zählt sie im Toast
(`planning.ts:681-690`), während `changedSlotKeys` sie übergeht (Z. 297).

### B13 — Import-Toast/Mitteilung unabhängig vom tatsächlichen Ergebnis ⚠️

`reducer.ts:443-459` (`addImportedWeek`) hängt die Woche bedingungslos an
(`[...state.weeks, week]`) — ohne Prüfung, ob eine Woche mit demselben `start`
bereits existiert und ohne Sortierung nach `start`. Ein zweiter Import derselben
Woche (z. B. nach einem Fehlschlag mit dennoch geschriebener Antwort) legt eine
Dublette an, die alle nachfolgenden Positionen verschiebt — und damit **alle**
task_keys dahinter.

### B14 — `togglePartner` gleicht die Zusätzliche Klasse nicht an ✅

`meeting-edit.ts:204-212` fügt den Partner-Slot nur in `item.names` ein. `item.aux`
wird nur von `syncAuxSlots`/`angleichen` angepasst, die hier nicht laufen
(`persist.ts:199` ruft nur `saveWeek`).

Ergebnis: Der Hauptsaal hat zwei Plätze, die Klasse einen. Der Klassen-Partner
fehlt in Anzeige, Zählung und Erinnerung, bis irgendwann `setAuxClass` erneut
ausgelöst wird.

### B15 — Reinigungs-Gruppen: manuell und automatisch widersprechen sich ✅

Ohne konfigurierte Gruppen erzeugt die Auto-Zuteilung Namen wie `"Gruppe 1"…"Gruppe 3"`
(`planning.ts:619`, fest kodierte `3`). Das Zuteilungs-Sheet zeigt in diesem Fall
dagegen eine **leere** Kandidatenliste (`AssignSheet.tsx:164`, `state.groups.map`)
— ohne Hinweis, dass zuerst Gruppen anzulegen sind.

### B16 — Ersatzsuche: „Einspringen" ohne Sperre (zwei können denselben Slot nehmen) ✅

`supabase/functions/substitute/index.ts:222-288` liest die Woche, ändert den Slot im
Speicher und schreibt sie mit `PATCH` zurück — **ohne Lock, ohne
Vorbedingung-Prüfung** (kein `if-match`, kein „nur wenn Slot noch `originalName`
trägt").

Springen zwei Personen gleichzeitig ein, gewinnt der zweite `PATCH`. Beide bekommen
`{ ok: true, taken: true }`. Schlimmer: Der zweite Aufruf löscht mit
`DELETE confirmations?task_key=eq.…` (Z. 285) auch die soeben gesetzte Bestätigung
des ersten — der steht danach **weder im Slot noch in den Bestätigungen**, hat aber
die Erfolgsmeldung gesehen.

`redeem_invite` löst genau dieses Problem für Einladungscodes vorbildlich per
`FOR UPDATE` (migration-012). Hier fehlt das Gegenstück.

### B17 — Unbehandelte Promise-Ablehnungen beim Nachladen ✅

`store.tsx:99` (`loadOverlay`) und `store.tsx:111` (`bibelbuecherLaden`) haben kein
`.catch()`. Nach einem Deployment sind die alten Lazy-Chunks weg
(`sw.js` cacht `/assets/` zwar, aber nur bereits geholte); der dynamische Import
schlägt dann fehl. Ergebnis: unbehandelte Rejection, Sprache bleibt still auf
Englisch, keine Rückmeldung.

Verschärft durch `sw.js:25` (`skipWaiting()`) + `sw.js:42` (`clients.claim()`): eine
laufende Sitzung bekommt neue Assets untergeschoben.

---

## B. Fachliche Lücken (Versammlungsablauf)

### F1 — Der öffentliche Vortrag ist fest „Gastredner" ✅

`parse.ts:391` legt den Vortrags-Slot mit `rolle: 'Gastredner'` an. `SKIP_ROLE`
(`planning.ts:45`) filtert diese Rolle überall heraus:

- Auto-Zuteilung überspringt ihn (`planning.ts:560`)
- kein Eintrag in „Meine Aufgaben" (`planning.ts:909`)
- keine Erinnerung (`send-reminders/index.ts:282`)
- keine pid, selbst wenn eine echte Person gewählt wird (`AssignSheet.tsx:213`)

Fachlich hält den öffentlichen Vortrag regelmäßig auch ein Redner der **eigenen**
Versammlung. Für den gibt es derzeit keinen Weg: Er wird als Freitext eingetragen
und ist damit aus Bestätigung, Erinnerung, Zeitleiste und Auslastung ausgeschlossen.

**Vorschlag:** Der Slot sollte zwischen „eigener Redner" (Person, voller Flow) und
„Gastredner" (Freitext + Versammlung) umschaltbar sein.

### F2 — Kreisaufseher-Woche und Gedächtnismahl sind nicht setzbar ✅

`week.co`, `week.mem` und `week.memCancel` werden **ausschließlich** in
`src/data/demo.ts` gesetzt. Es gibt weder eine UI noch einen Import-Pfad dafür.
Angezeigt werden sie in `WeekBadges.tsx` und `MemorialBanner` — im Produktionsbetrieb
also nie.

Damit fehlen im echten Betrieb:

- Chip + Banner für beide Sonderwochen
- der Ersatz des Versammlungsbibelstudiums durch den **Dienstvortrag** beim
  Kreisaufseher-Besuch (in `demo.ts` fertig vorgebaut, produktiv nicht erzeugbar)
- das Ausfallen einer Zusammenkunft (`memCancel`)

Mit den vorhandenen Mitteln müsste ein Planer das VBS von Hand löschen und einen
Punkt hinzufügen — `lacAdd` erzeugt aber einen Slot mit `bereichsKey: 'vortrag'`
(`meeting-edit.ts:186`) und keinen Gastredner-Slot für den Kreisaufseher.

**Fehlt außerdem:** Kongresswochen (regional/Kreis), in denen eine oder beide
Zusammenkünfte entfallen. Dafür gibt es kein Konzept.

### F3 — Treffpunkte sind vom Bestätigungs- und Erinnerungs-Flow abgeschnitten ✅

`eachAssignedSlot` (`planning.ts:888-965`) läuft nur über `weeks`, nie über
`fsWeeks`. Folglich:

- ein zugeteilter Treffpunkt-Leiter sieht die Aufgabe **nicht** in „Meine Aufgaben"
- er kann sie nicht bestätigen und nicht absagen
- er bekommt **keine** Push-Erinnerung
- `FsInstance.leader` ist ein reiner Name ohne `pid` (`types.ts:88`) —
  bei gleichnamigen Personen nicht zuordenbar

Widersprüchlich dazu fügt `reducer.ts:486-489` den Namen bei einer fs-Zuteilung zu
`pendingNames` hinzu („wartet auf Bestätigung"). Im Produktionsmodus überschreibt
`derivePendingNames` das sofort wieder (die Aktion steht in `DERIVE_ACTIONS`), im
Demo-Modus bleibt der Name **dauerhaft** auf „wartet", weil es nichts zu bestätigen
gibt.

### F4 — Keine Geschlechts-Absicherung für Brüder-Aufgaben ✅

`male: true` steht nur an zwei Stellen: am Schülerteil-Vortrag
(`parse.ts:308`) und am Ratgeber (`aux-class.ts:179`).

Ohne Kennzeichnung sind damit **Vorsitz, Gebet, Bibellesung, Leser, Studium-Leiter,
öffentlicher Vortrag** rein über die Schalter im Personen-Detail geregelt.
`isQualified` (`helpers.ts:177`) begründet das bewusst — aber die Folge ist:

- ein versehentlich gesetzter Schalter bei einer Schwester führt die
  **Auto**-Zuteilung ohne Warnung zum Gebet oder Vorsitz
- die Personenliste zeigt keine Auffälligkeit an

Das ist inkonsistent zur `male`-Kennzeichnung, die für die zwei anderen Fälle
existiert.

**Vorschlag (ohne Bevormundung):** Warnhinweis im Personen-Detail bzw. im
Zuteilungs-Sheet, wenn ein Bereich gesetzt wird, der fachlich Brüdern vorbehalten
ist — blockieren muss man es nicht.

### F5 — Ende der Zusammenkunft ist fest verdrahtet ✅

`parse.ts:288` setzt `end: 'Ende ca. 20:45'`, `parse.ts:388` `'Ende ca. 11:45'` —
unabhängig von den in den Einstellungen gepflegten Zusammenkunftszeiten. Beginnt die
Versammlung um 18:30, steht auf jedem Programmblatt eine falsche Endzeit. Erst
nachträgliche LAC-Minutenänderungen verschieben den Wert (B7: bei nicht-deutschem
Import gar nicht).

**Behebung:** Ende aus Startzeit + Summe der Programmminuten rechnen.

### F6 — Ein neu angelegter LAC-Punkt verlangt „öffentlicher Vortrag" ✅

`meeting-edit.ts:186`: `names: [{ name: '', bereichsKey: 'vortrag' }]`.

`vortrag` ist der Bereich für den **öffentlichen Vortrag** am Wochenende. Ein
eigener Punkt unter „Unser Leben als Christ" (z. B. „Bedürfnisse der Versammlung")
ist etwas anderes; als Kandidaten erscheinen dadurch nur die für öffentliche
Vorträge freigegebenen Brüder — eine unnötig enge und fachlich falsche Auswahl.

### F7 — Fester Wachtturm-Leiter ohne Eindeutigkeitsprüfung ✅

`pickConductor` (`planning.ts:517-526`) nimmt die **erste** Person mit
`priv.wtLeiter`. Setzen zwei Personen dieses Flag (leicht möglich, keine UI-Sperre),
entscheidet die Datensatz-Reihenfolge. Es gibt keinen Hinweis im Personen-Screen.
Dasselbe für `wtVertreter`.

### F8 — Kein Gruppenbezug bei Treffpunkt-Leitern ✅

`fsAutoAssign` (`fs.ts:203`) wählt aus **allen** `treffpunkt`-Qualifizierten, auch
für Gruppentreffpunkte („ohne Gruppenbindung", Z. 190). Fachlich leitet den
Gruppentreffpunkt üblicherweise jemand aus der Gruppe (bevorzugt Aufseher/Gehilfe).
Zumindest eine Bevorzugung wäre angebracht.

### F11 — Schlusslied: doppeltes „Lied" und nicht nachtragbar ✅

`supabase/functions/import-week/index.ts:185-188` fügt das gefundene Schlusslied als
eigenes Song-Item **vorne** in die ABSCHLUSS-Sektion ein. Deren einziges Item trägt
aber weiterhin den Vorlagen-Titel `'Schlussworte · Lied · Gebet'`
(`parse.ts:393`).

Die Anzeige (`ProgrammScreen.tsx:146-177`) zieht bei ABSCHLUSS das Atom **mit
Ziffer** als Lied heraus (`splitOpeningSong`). „Lied" ohne Nummer hat keine Ziffer →
es bleibt im Titel stehen. Angezeigt wird also:

```
Lied 45
Schlussworte · Lied · Gebet
```

Wird kein Schlusslied gefunden (kleinere Sprachen, Artikel noch nicht online), fehlt
die Nummer ganz — und sie lässt sich **nicht nachtragen**: `setOpeningSong`
(`meeting-edit.ts:261`) sucht ausschließlich `LABEL_EROEFFNUNG`. Das Anfangslied ist
editierbar, das Schlusslied nicht.

### F12 — Leser ist nicht nach Zusammenkunft getrennt ✅

Der Vorsitz wurde bewusst in `vorsitzMid` / `vorsitzWe` aufgeteilt
(`helpers.ts:38-58`, eigene Migration `normalizeChairKeys`). Der **Leser** teilt
sich dagegen einen einzigen Bereich für zwei verschiedene Aufgaben: den
Versammlungsbibelstudium-Leser unter der Woche und den Wachtturm-Leser am
Wochenende (`parse.ts:360` und `parse.ts:392`).

In der Praxis sind das oft unterschiedliche Personenkreise. Wer nur eines von beiden
soll, lässt sich nicht abbilden.

### F13 — Nur eine Zusätzliche Klasse möglich ✅

`PartItem.aux` ist ein einzelnes Feld und `Meeting.auxRatgeber` ein einzelner Slot
(`types.ts:227`, `types.ts:261`). Größere Versammlungen führen gelegentlich **zwei**
Zusatzklassen. Das Modell schließt das aus — vertretbar als bewusste Grenze, aber
nirgends dokumentiert.

### F9 — Kein Redner-/Vortragsverzeichnis ⚠️

Der öffentliche Vortrag ist reiner Freitext (`TALK_PLACEHOLDER`). Es gibt keine
Vortragsnummer (S-99-Themenliste), keine Rednerliste mit Herkunftsversammlung und
keine Wiederholungsprüfung („dieses Thema hatten wir vor 3 Monaten"). Für einen
Vortragskoordinator ist das der Kern seiner Arbeit.

### F10 — Keine Behandlung von Personen ohne Konto in der Planung ⚠️

`send-reminders` meldet nicht erreichbare Personen an die Planer
(`index.ts:465-485`) — das ist gut gelöst. In der App selbst ist aber nirgends
sichtbar, **wer** kein Konto hat: Weder das Zuteilungs-Sheet noch die Konfliktbanner
weisen darauf hin, dass diese Person nie eine Erinnerung bekommen wird. Nur die
Konto-Karte im Personen-Detail zeigt es, eine Person nach der anderen.

---

## C. Ungereimtheiten & Inkonsistenzen

### U1 — Vier Implementierungen derselben Datumsfrage ✅

| Ort | Rechnung | Berücksichtigt Sondertermin? |
| --- | --- | --- |
| `meeting-dates.ts:86` `meetingDate` | `date`-Feld → `week.start` → `base + wi*7` | **ja** |
| `meeting-dates.ts:106` `meetingDateMs` | nur `week.start + offset` | nein |
| `person-timeline.ts:76-78` | `fsBase + wi*7 + offset`, `date`-Feld für Offset | teilweise |
| `send-reminders/index.ts:236` `daysUntil` | nur `week.start + offset` | nein |

`meetingDate` behauptet im Kommentar (Z. 83-85), die „einzige Stelle" zu sein.
Praktische Folge: Eine Woche mit abweichendem Termin (Gedächtnismahl, Kongress)
wird für **Abwesenheiten** korrekt, für **Countdown und Erinnerungen** falsch
gerechnet.

### U2 — `countOpenSlots` und `openSlotLabels` zählen Unterschiedliches ✅

Beide stehen in `planning.ts` direkt nebeneinander:

| | Zusätzliche Klasse | Ratgeber |
| --- | --- | --- |
| `countOpenSlots` (Z. 250) | zählt (`raeume`) | zählt (Z. 260) |
| `openSlotLabels` (Z. 320) | **ignoriert** (`item.names`) | **ignoriert** |

Der Planen-Kopf nennt also eine höhere Zahl offener Zuteilungen, als das Banner
darunter auflistet (`PlanenScreen.tsx:73` vs. `PlanBanners.tsx`).

### U3 — `fsTieHash` wiederholt den behobenen Fairness-Fehler ✅

`planning.ts:54-76` beschreibt ausführlich, warum ein Hash ohne Avalanche-Mixing
zu einer **festen Namensrangliste** führt („Wer darin hinten stand, kam nie dran").

`fs.ts:181-185` implementiert genau diesen alten Hash:
```js
for (…) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
return h >>> 0
```
Die Treffpunkt-Auto-Zuteilung hat damit weiterhin das Problem, das für die
Programm-Zuteilung behoben wurde.

### U4 — Zwei verschiedene Auslastungs-Fenster ✅

Programm-Zuteilung: gleitendes Fenster ±2 Wochen (`LOAD_RADIUS`, ausführlich
begründet in `helpers.ts:292-309`).
Treffpunkte: Gesamtzahl über **alle** Wochen (`fs.ts:222-225`).
Zuteilungs-Sheet, fs-Zweig: `free` über alle Wochen (`AssignSheet.tsx:159`), im
Programm-Zweig über das Fenster (Z. 183).

### U5 — `regenFsWeeks` ohne `weekFrom` im Reducer ✅

`lib/data.ts:657` ruft `regenFsWeeks(…, true, weekFrom)` — mit Schutz der
Platzhalter-Wochen. `reducer.ts:645/651/658` ruft dieselbe Funktion **ohne** beide
Parameter, materialisiert also auch Wochen vor `weekFrom` neu. Gespeichert werden
sie nicht (`persist.ts:178` beginnt bei `weekFrom`), der Zustand wird aber
inkonsistent zum Ladepfad.

### U6 — Anfangsgebet-Kopplung zählt nicht als neue Zuteilung ✅

`planning.ts:597-603` koppelt das Anfangsgebet an den Vorsitz und erhöht `count`,
ruft aber nicht `claim()` — der Name landet also nicht in `newly` und damit nicht in
`pendingNames`. Im Produktionsmodus heilt die Ableitung das; im Demo-Modus fehlt der
„wartet"-Status.

### U7 — Doku widerspricht dem Code

| Stelle | Doku sagt | Code tut |
| --- | --- | --- |
| `helpers.ts:185-190` | „Familienbezüge kennt die App noch nicht, daher vorerst strikt gleiches Geschlecht" | Familien-Ausnahme ist implementiert (Z. 196) |
| `context.ts:172` | `clearNotifs` „löscht den gesamten Mitteilungs-Feed der Versammlung" | `deleteNotifications(congId, userId)` löscht nur die eigenen |
| `ProfilScreen.tsx:26` | „8 Farbschemata" | `THEME_LIST` hat 11 |
| `schema.sql:53` | „Qualifications (9 Booleans)" | 11 feste + n dynamische |
| `README.md:21` | „Oberfläche DE/EN/ES/FR" | 34 Sprachen |
| `meeting-dates.ts:83` | „Einzige Stelle" für Woche→Datum | drei weitere (U1) |

### U8 — `personCompare` sortiert immer deutsch ✅

`helpers.ts:129` verwendet fest `'de'`. Die Filter-Dropdowns derselben Liste
sortieren dagegen mit `LOCALES[state.lang]` (`PersonenScreen.tsx:225`). Für
Griechisch, Russisch, Chinesisch oder Arabisch ist die Personenliste damit
sortiert, wie ein deutscher Leser es erwartet — nicht der Nutzer.

### U9 — `partWorkload` zählt Begleiter per Substring ✅

`helpers.ts:260`: `if (slot.rolle?.includes(name)) count++`. Bei kurzen oder
enthaltenen Anzeigenamen („Anna" in „mit Anna-Lena Müller") entstehen Fehltreffer;
außerdem wird doppelt gezählt, wenn Name und Rolle beide passen.

### U10 — Notification-Texte entstehen kanonisch deutsch, aber teils ungeschützt ✅

`reducer.ts:92` setzt `time: 'gerade eben'` und Z. 437/482/504/698 die Texte fest
deutsch. Beim Anzeigen läuft der **Titel** über `NOTIF_TITLE_KEY` (sauber), Text und
Zeit dagegen über `tu()` — den Programm-Fragment-Übersetzer, dem für 30 Sprachen
genau diese Fragmente fehlen (siehe D1).

---

## D. Übersetzungslücken

### D1 — 30 von 33 Sprachen fehlen Programm-Fragmente ✅

Gemessen an `FRAG` in `src/i18n/translate-data.ts` (Skript-Vergleich der Schlüssel):

| Sprachen | Schlüssel | fehlend ggü. EN |
| --- | --- | --- |
| en, es, fr | 82 | 0 |
| ar, he, fa, ur | 56 | 26 |
| die übrigen 26 (it, pt, nl, pl, ru, uk, ro, cs, sk, hr, sr, bg, hu, el, tr, sv, da, fi, no, id, tl, vi, sw, zh, ja, ko) | 48 | **34** |

Produktiv relevant (nicht nur Demo-Daten):

| Fragment | Wo sichtbar |
| --- | --- |
| `gerade eben` | Zeitstempel **jeder** neuen Mitteilung |
| `ohne Zuteilungen` | Mitteilung nach jedem Programm-Import |
| `Gedächtnismahl-Ansprache`, `Symbole herumreichen`, `Brot`, `Wein`, `nach Sonnenuntergang`, `„Schätze Jehovas größtes Geschenk"` | gesamtes Gedächtnismahl-Programm |
| `„Lauft so, dass ihr den Preis gewinnt"`, `„Bleibt in Gottes Liebe"` | Kongress-/Sonderprogramme |

Der Rest sind Demo-Inhalte (WT-Studienartikel-Titel, „vor 2 Std.", „heute, 08:00").

### D2 — `REF` fehlt für vier Sprachen ohne Begründung ⛔ geprüft, kein Mangel

`REF` (Verweis-Vorlagen: „th Lektion 5", „Gruppe 2", „Vers. X") existiert für 22
Sprachen. Der Kommentar in `translate.ts:82-85` erklärt das Fehlen für
zh/ja/ko/ar/he/fa/ur („dort stehen die Publikationskürzel gar nicht").

**Nicht erklärt** ist das Fehlen für **id, tl, vi, sw** — dort führt jw.org die
Kürzel sehr wohl. Konsequenz: „th Lektion 5" bleibt in diesen vier Sprachen
deutsch, ebenso „Gruppe 2" → „Gruppe 2" statt „Kelompok 2".

> **Nachtrag 7.8.2026 (T28) — geprüft, kein Mangel.** `REF` enthält id, tl, vi
> und sw vollständig: je neun Vorlagen in `translate-data.ts` (`th pelajaran N`,
> `th aralin N`, `th bài học số N`, `th somo la N` …). Der in T26 ergänzte
> Vollständigkeitstest (`src/i18n/translate-data.test.ts`) prüft das jetzt bei
> jedem Lauf; er meldete beim ersten Durchlauf **nur `bg`**, und dort fehlt
> allein `wcgKap` — begründet und bereits vorher durch einen Test festgehalten
> (Bulgarisch behandelt im Versammlungsbibelstudium eine andere Publikation).

### D3 — Kein Test schützt `FRAG` / `EXTRA` / `REF` ✅

`src/i18n/ui.test.ts` prüft das **UI-Wörterbuch** (`Dict`) sehr gründlich:
Vollständigkeit, kein stiller EN-Rückfall, Platzhalter-Gleichheit, Leerraum.

Für `FRAG`, `EXTRA` und `REF` in `translate-data.ts` gibt es **keine entsprechende
Prüfung**. Genau deshalb konnte D1/D2 entstehen. `translate.test.ts` prüft
Einzelfälle, keine Vollständigkeit.

### D4 — Die Zusammenkunftszeiten sind an deutsche Kürzel gebunden ✅

`meeting-dates.ts:13` und `send-reminders/index.ts:226`:
`{ Mo, Di, Mi, Do, Fr, Sa, So }`. Der gespeicherte Wert entsteht in
`CongregationPanel.tsx` aus `DAY_KEYS` — solange das immer die deutschen Kürzel
sind, geht es gut. Die **Anzeige** nutzt dagegen `Intl` (Z. 20). Wenn jemals ein
lokalisiertes Kürzel gespeichert würde, fällt die Erkennung stumm auf Di/So zurück
(`found[0] ?? 1`), ohne dass etwas auffällt.

### D5 — Die Ersatzsuche kommuniziert ausschließlich deutsch ✅

`supabase/functions/substitute/index.ts` erzeugt die Texte fest deutsch und
dynamisch, also unübersetzbar:

| Zeile | Text |
| --- | --- |
| 265 | `` `Ersatz gesucht: ${svcName}` `` |
| 266 | `` `${date} — ${declinedBy} kann nicht. Wer springt ein?` `` |
| 300 | `` `Ersatz gefunden: ${svcName}` `` |
| 301 | `` `${date}: ${callerName} übernimmt${…}.` `` |

Die Titel enthalten den Dienstnamen und können deshalb **nicht** in
`NOTIF_TITLE_KEY` (`i18n/ui.ts:108`) stehen — diese Map arbeitet mit exakten
Treffern. Ergebnis: Glocke **und** Push zur Ersatzsuche sind für alle 33
Nicht-Deutsch-Sprachen deutsch.

Auffällig, weil `send-reminders` es richtig macht: dort liefert `pushTexte(lang)`
(`send-reminders/texte.ts`) den Push in der Gerätesprache, und der Glocken-Titel ist
bewusst ein fester Schlüssel für `NOTIF_TITLE_KEY`. Dasselbe Muster wurde in
`substitute` nicht angewandt.

### D6 — Sprache und Schreibrichtung erst nach dem ersten Paint ✅

`index.html:2` deklariert fest `<html lang="de">`. `store.tsx:91-92` setzt `lang`
und `dir` erst im Effekt nach dem Mount.

Das Inline-Script im `<head>` setzt Theme und Schriftgröße **vor** dem ersten Paint,
um genau dieses Springen zu vermeiden — für Sprache und Richtung wurde es nicht
gemacht. Für Arabisch, Hebräisch, Farsi und Urdu rendert die App also zuerst
komplett von links nach rechts und klappt dann um. Der gespeicherte Wert liegt
bereits im `localStorage` (`lang`), das Script müsste ihn nur mitlesen.

### D7 — Der Parser erkennt Schülerteil-Typen nur auf Deutsch ✅

`parse.ts:295-298` (`CONVO_RE`, `TALK_RE`, `BELIEF_RE`) sind deutsche Regexe.
Abgefedert durch `applyGoldSlots` (Z. 326), das die Slot-Vorlagen von der deutschen
Referenzwoche überträgt. Das funktioniert nur, solange die Punktzahl in beiden
Sprachfassungen exakt gleich ist — eine stille Annahme ohne Prüfung. Weicht sie ab,
bekommt der lokalisierte Import stillschweigend falsche Slot-Vorlagen.

---

## E. Fehlende Tests

Vorbemerkung: Mit 727 Testfällen in 51 Dateien ist die Logikschicht überdurchschnittlich
gut abgedeckt — insbesondere `planning`, `autoassign` (zwei Simulationen), `i18n/ui`,
`persist` und die Gesten. Die Lücken liegen gezielt dort, wo die obigen Fehler sitzen.

### Direkt zu den Befunden

| Test fehlt für | Befund | Vorschlag |
| --- | --- | --- |
| Bestätigungen nach `lacRemove` / `lacAdd` | B3 | E2E wie `confirmations.test.ts:78`, aber mit Löschen/Einfügen |
| `assignmentsInMeeting` mit Zusätzlicher Klasse | B5 | Person in `aux` → muss als „heute schon zugeteilt" erscheinen |
| `openSlotLabels` mit Klasse + Ratgeber | U2 | Gleichstand mit `countOpenSlots` zusichern |
| `partWorkload` nach Abschalten der Klasse | B9 | `hatAuxKlasse`-Respekt prüfen |
| `itemMinutes` / `lacAdjust` mit fremdsprachiger Meta | B7 | `„10 min."`, `„10 λεπτά"` |
| `helperWorkload` jenseits `svc.count` | B12 | Gleichstand mit `deriveMyTasks` |
| Startwoche nach `hydrate` | B1 | „springt auf die Woche von heute" |
| `week.current` aus dem Datum abgeleitet | B2 | — |
| `FRAG`/`EXTRA`/`REF`-Vollständigkeit | D3 | Analog zu `ui.test.ts` |
| `readonly`: `openMyTask` erlaubt | B10 | Positivliste-Test erweitern |
| `fsBase`-Speicherung in UTC+13 | B11 | Zeitzone in Vitest fixieren |
| `send-reminders` mit Positions-Lücke | B8 | Fixture mit `position: 5,6,7` |
| `substitute: seek` durch Unbeteiligte | S7 | muss 403 liefern |
| `substitute: take` zweimal parallel | B16 | zweiter Aufruf muss ablehnen, nicht überschreiben |
| `togglePartner` mit Zusätzlicher Klasse | B14 | `item.aux.length === item.names.length` |
| ABSCHLUSS-Anzeige nach `applyStudy` | F11 | „Lied" darf nicht doppelt erscheinen |

### Ganze Bereiche ohne Test

| Bereich | Bemerkung |
| --- | --- |
| `src/data/meeting-edit.ts` | keine eigene Testdatei; teilweise über `planning.test.ts` (Z. 203-250) und `weekend.test.ts` abgedeckt — `lacMove`-Randfälle und die Varianten-Spiegelung nur punktuell |
| `src/data/demo.ts` | ungetestet; ist zugleich die Vorlage für `seedCongregation` — ein Strukturfehler dort landet in jeder neuen Versammlung |
| `src/planen/AssignSheet.tsx` | **die** Kandidatenlogik (Filter, Sortierung, Geschlechtsregeln, Auslastung) — komplett ungetestet, enthält B6 |
| `src/planen/MeetingSection.tsx` | LAC-/Wochenend-Sonderfälle, Lied-Extraktion — ungetestet |
| `src/dashboard/DashboardScreen.tsx` | enthält B2 — ungetestet |
| `supabase/functions/import-week/index.ts` | nur `parse.ts` und `study.ts` sind getestet; die Sprach-Auflösung über den „Lesen in"-Umschalter nicht |
| `supabase/functions/send-invite/` | keine Tests (`_test/` deckt nur send-reminders + substitute ab) |
| `src/lib/install.ts`, `src/lib/clipboard.ts` | ungetestet (geringes Risiko) |
| Alle übrigen Screens/Panels | ungetestet — bei diesem Projektzuschnitt vertretbar, außer den oben genannten |

### Testqualität

- **Positiv:** `autoassign.sim.test.ts` (100-Personen-Simulation) und
  `autoassign.fairness.test.ts` sind für die schwierigste Logik der App genau das
  richtige Mittel.
- **Lücke:** Es gibt keinen Test, der die **Konsistenz zwischen Client und Edge
  Function** prüft (task_key-Format, `SKIP_ROLE`, `displayName`,
  `meetingDayOffsets` sind viermal dupliziert). Ein gemeinsamer Fixture-Test
  („derselbe Wochendatensatz ergibt beidseitig dieselben task_keys") würde B8 und
  künftige Divergenzen fangen.
- **Lücke:** Keine Tests mit `Week.stub` in der Mitte / `weekFrom > 0` außerhalb von
  `data-load.test.ts`.

---

## F. Sicherheit & Datenschutz

### S1 — `send-reminders` ist offen, wenn `CRON_SECRET` fehlt ✅

`supabase/functions/send-reminders/index.ts:322`:
```js
if (CRON_SECRET && req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) …
```
Ist das Secret **nicht gesetzt**, entfällt die Prüfung ersatzlos. Die Function wird
laut README mit `--no-verify-jwt` deployt, ist also ohne jede Authentifizierung
erreichbar.

Im Dry-Run (dem Standard!) liefert sie `preview` zurück — **Namen, Aufgaben und
Termine aller Versammlungen der Instanz** (Z. 528). Das ist ein
Personendaten-Leck, ausgelöst durch eine vergessene Konfiguration.

**Fail-open statt fail-closed.** Empfehlung: ohne `CRON_SECRET` mit 500 abbrechen.

### S2 — Jedes Mitglied kann fremde Bestätigungen schreiben ✅

`schema.sql:331-335`:
```sql
create policy confirmations_write on public.confirmations
  for all using (… and user_id = auth.uid()) with check (… and user_id = auth.uid());
```
Geprüft wird nur, dass die Zeile dem eigenen Konto gehört — **nicht**, dass der
`task_key` zu einem Slot gehört, der dieser Person zugeteilt ist.

Beim Laden ignoriert `lib/data.ts:627-632` die `user_id` vollständig:
```js
confirmations[row.task_key] = row.status
```

Folgen (jeweils ohne Planer-Rechte möglich):

- fremden Slot als `bestätigt` markieren → der Planer sieht ✓ statt „…", die echte
  Person wird nicht mehr erinnert
- fremden **Hilfsdienst** als `verhindert` markieren → löst über
  `deriveSubstituteReqs` ein Ersatzgesuch aus und benachrichtigt per
  `substitute`-Function alle Qualifizierten

Kein Angriff von außen, aber eine Integritätslücke innerhalb der Versammlung — und
ein reales Fehlerpotenzial bei Doppelzeilen (`unique (congregation_id, task_key,
user_id)` erlaubt mehrere Zeilen je Slot; welche gewinnt, ist zufällig).

### S3 — Mitteilungen mit freiem Text an beliebige Mitglieder ✅

`schema.sql:304-309`: `notifications_insert` erlaubt jedem Mitglied Zeilen vom Typ
`verhindert` — mit **frei wählbarem** `title`, `body` und `user_id` innerhalb der
Versammlung. Ein Mitglied kann damit beliebige Mitteilungen im Namen der App an
andere schicken. Geringes Risiko (geschlossener Kreis), aber unnötig weit.

### S4 — Kein Fremdschlüssel auf `members.person_id` ✅

`schema.sql:36`: `person_id uuid,` — ohne `references public.persons(id)`. Die
Aufräumarbeit erledigt der Client (`persist.ts:255-257`). Bricht der Client ab
(Netz weg, Tab zu), bleibt eine verwaiste Verknüpfung stehen. Für `groups` und
`invites` ist derselbe Fall per FK `on delete set null` gelöst.

### S5 — Kein Mehrbenutzer-Schutz beim Schreiben ✅

`saveWeek` (`lib/data.ts:747`) schreibt die **komplette Woche** als JSONB-Upsert.
Es gibt kein optimistisches Locking, keine Versionsspalte, kein Realtime-Abgleich.

Zwei Planer, die gleichzeitig dieselbe Woche bearbeiten, überschreiben sich
gegenseitig vollständig — der zweite Save gewinnt und verwirft alle Änderungen des
ersten. Der README behandelt dieses Risiko ausführlich für den **Offline**-Fall
(„zwei Planer, die offline unabhängig planen, würden sich überschreiben"), online
besteht es unverändert.

Gleiches gilt für gleichzeitige Importe (beide schreiben Position `n`).

### S6 — Personenbezogene Daten in der Offline-Momentaufnahme ⚠️

`lib/snapshot.ts` legt die vollständige `HydratePayload` (alle Personen mit Telefon
und E-Mail, alle Abwesenheiten inkl. Grund) unverschlüsselt im `localStorage` ab.
Das ist bewusst so gebaut und beim Abmelden gelöscht — auf einem geteilten Gerät
bleibt es zwischen den Sitzungen aber lesbar. Erwähnenswert, weil die
Datenschutz-Argumentation des README („personenbezogene Daten in der EU") sonst
sorgfältig ist.

### S7 — `substitute: seek` prüft nicht, wer aufruft ✅

`supabase/functions/substitute/index.ts:253-269` verlangt nur, dass der Aufrufer
Mitglied der Versammlung ist (Z. 219-220). Es wird **nicht** geprüft, ob

- der Aufrufer der im Slot eingetragene Bearbeiter ist,
- überhaupt eine `verhindert`-Bestätigung für diesen `task_key` existiert.

Jedes Mitglied kann damit für **jeden beliebigen** Hilfsdienst-Slot eine Ersatzsuche
auslösen — die dann allen Qualifizierten per Push und Glocke mitteilt:
„*Name* kann nicht. Wer springt ein?" Also Push-Spam **und** eine falsche Aussage
über eine dritte Person, im Namen der App.

Der `take`-Pfad prüft dagegen sauber auf Qualifikation (Z. 274). Der Client ruft
`seek` nur nach `declineTask` auf (`persist.ts:312`) — die Function verlässt sich
darauf, dass der Client sich benimmt.

> **Nachtrag 24.8.2026:** Der letzte Absatz war der Fehlschluss. „Prüft auf
> Qualifikation" beantwortet die Frage, WER eingetragen werden darf — nicht, OB
> dieser Platz überhaupt frei wird. Genau diese zweite Frage fehlte auch bei
> `take`; sie steht jetzt als **S13** und ist geschlossen.

### S8 — Google Fonts von externem Host ✅

`index.html:60-66` lädt Newsreader und IBM Plex Sans von
`fonts.googleapis.com` / `fonts.gstatic.com`. Damit geht beim ersten Aufruf jedes
Nutzers die IP-Adresse an Google.

Das steht in Spannung zur sonst sorgfältigen Datenschutz-Argumentation des README
(„personenbezogene Daten in der EU", Region Frankfurt) und ist in Deutschland
gerichtlich beanstandet worden (LG München I, 3 O 17493/20). Beide Schriften sind
OFL-lizenziert und dürfen selbst ausgeliefert werden — der Service Worker cacht sie
ohnehin bereits (`sw.js:106`).

### S9 — `window.confirm` als einzige Löschbestätigung ✅

`PersonDetail.tsx:208` nutzt den nativen Dialog zum Löschen einer Person. Überall
sonst nutzt die App eigene Dialoge bzw. die Zwei-Tipp-Bestätigung
(`AutoAssignPanel.tsx`). Der native Dialog ist nicht übersetzt gestylt, auf iOS im
Standalone-Modus unterschiedlich und lässt sich nicht per Backdrop schließen.
Zudem: Das Löschen einer Person entfernt **nicht** ihre Namen aus bereits geplanten
Wochen (dokumentiert, `reducer.ts:294`) — davor warnt der Dialogtext nicht.

### S10 — `substitute` nahm die Versammlung aus dem Anfrage-Rumpf ✅

`congregationId` kam aus dem JSON des Aufrufers, wurde nur auf „nicht leer"
geprüft und ging **ungekodiert** in jeden REST-Pfad. Ein angehängtes `#` macht
beim URL-Parser alles Folgende zum Fragment — und Fragmente werden nicht
gesendet. Aus

    weeks?congregation_id=eq.<id>#&start=eq.2026-09-07&…->>name=eq."Otto"

wurde beim Server

    weeks?congregation_id=eq.<id>

Das PATCH verlor damit Woche **und** Vergleiche-und-Tausche und schrieb den Blob
einer Woche in **jede** Wochenzeile der Versammlung; die beiden DELETEs verloren
ihren `task_key` und räumten sämtliche Bestätigungen und Mitteilungen ab. Alles
mit Service-Role, also an RLS vorbei (`weeks_write` ist Planern vorbehalten), und
alles auslösbar von einem einfachen Mitglied mit einer einzigen Anfrage. Die
Mitgliedsprüfung selbst blieb wirksam — der Schaden endet an der Versammlungs-
grenze, ist darin aber vollständig und ohne Historie nicht rückholbar.

Die Ursache ist nicht das fehlende Kodieren, sondern der zweite Weg zu einer
Auskunft, die es schon gab: Der Aufrufer hat genau eine Versammlung. Sie wird
jetzt aus seiner Mitgliedszeile **gelesen**, nicht geglaubt — wie `send-invite`
es seit jeher tut. Das Kodieren (`wert()`) kommt als zweites Schloss dazu.

### S11 — Abwesenheit ließ sich auf eine fremde Person eintragen ✅

`absences_write` erlaubte das Schreiben unter anderem, wenn `user_id =
auth.uid()` — „die Zeile gehört mir". Über `person_id`, die Spalte, die
entscheidet **um wen** es geht, sagte dieser Zweig nichts. Eigene `user_id`
hinein, fremde `person_id` daneben: fertig. Die Person-Id ist keine Hürde,
`persons_select` gibt sie versammlungsweit heraus.

Der Betroffene fällt damit aus der automatischen Zuteilung, der Kandidatenliste,
dem Treffpunkt-Pool und den Verfügbarkeitszahlen — und auch aus der
serverseitigen Ersatzsuche, die dieselbe Tabelle liest. Der frei wählbare
`reason` steht dabei unter **seinem** Namen in der Zeitleiste, denn zugeordnet
wird nach Person, nicht nach Ersteller. Und weil `for all` gilt, ließ sich
`person_id` einer selbst angelegten Zeile später weiterreichen.

Dieselbe Bauart wie S2: eine Regel, die prüft, wem die **Zeile** gehört, statt
wem die **Sache** gehört. Geschlossen mit `migration-023`.

### S12 — `import-week` holte jede Adresse, die im Rumpf stand ✅

Das Feld `url` ging unverändert an `fetch` — kein Host, kein Protokoll geprüft.
`BASE` galt nur für Adressen, die die Function selbst gefunden hatte. Ein
`{"url":"http://10.0.0.5:8080/"}` wurde damit aus der Supabase-Umgebung heraus
abgerufen; erreichbar ist von dort, was von außen nicht erreichbar ist. Der
Rückkanal war der Fehlertext, den der Handler wörtlich zurückgab (`HTTP 403 bei
…`, oder die rohe Transportmeldung): genug, um interne Adressen und Ports
abzutasten.

Erreichbar war das **ohne Konto**. `verify_jwt = true` verlangt kein Nutzer-
Login, sondern nur ein Token, das mit dem Projekt-Geheimnis signiert ist — und
das ist auch der anon-Key, der per Design im Bundle steht. Die Funktion prüfte
als einzige nichts Eigenes. Der Kommentar in `config.toml`, der das Gegenteil
behauptete, ist mitkorrigiert.

Das Feld ist entfernt — **kein Aufrufer hat es je geschickt** (`src/lib/import.ts`
kennt nur `after`/`start`/`lang`/`altLangs`). Zusätzlich lässt `fetchText` als
einzige Engstelle nur `https://www.jw.org` durch; die Prüfung sitzt bewusst dort
und nicht beim Auswerten des Rumpfes, weil `localizedUrl` eine Adresse aus
**fremdem Markup** liest.

### S13 — `take` prüfte nicht, ob überhaupt Ersatz gesucht war ✅

Der Zwilling zu S7, in der damaligen Durchsicht mit einem Satz abgetan (siehe
Nachtrag dort). `take` verlangte Mitgliedschaft und Qualifikation — nicht, dass
jemand abgesagt hat. Wer einen Hilfsdienst kann, konnte sich damit in **jeden**
Platz dieses Dienstes schreiben: den Eingeteilten verdrängen, dessen Bestätigung
löschen und ihm und allen Planern „Ersatz gefunden" schicken. Über den
`is.null`-Zweig ging auch jeder **leere** Platz — den vergibt der Planer.

Vier der fünf Schreibzugriffe sind einem Mitglied per RLS verwehrt; die Function
führt sie mit Service-Role aus. Der einzige Riegel stand im Client
(`deriveSubstituteReqs` zeigt den Knopf nur bei offenem Gesuch) — und ein Knopf
ist keine Rechteprüfung.

Geschlossen mit derselben Quelle, aus der `seek` seine Antwort zieht: der
`verhindert`-Bestätigung zu genau diesem `task_key`.

### Kleineres, mitgenommen ✅

- **Fehlertexte**: `substitute` und `import-week` gaben die Ausnahme wörtlich
  zurück. Bei `restGet` steckt darin der rohe PostgREST-Rumpf samt Pfad — beim
  Suchen nützlich, beim Ausprobieren genauso. Geht jetzt in die Logs.
- **`mailto:`-Adresse**: Betreff und Text waren kodiert, die Empfängeradresse
  nicht. Ein gepflegtes `a@b.de?bcc=…` hätte dem Entwurf eine stille Kopie
  angehängt (`src/personen/invite-helpers.ts`).
- **Mitteilungs-Klick**: `sw.js` gab die Adresse aus der Push-Nutzlast direkt an
  `clients.openWindow()`. Heute baut sie der Server aus `APP_URL`; wer aber
  zustellen darf, bestimmte damit das Ziel. Wird jetzt gegen den
  Geltungsbereich geprüft.
- **`schema.sql` war unausführbar** (siehe `docs/analyse/todo.md`, T97): Ein
  Suchen-und-Ersetzen hatte `$$` auf `$` zusammenfallen lassen und den Dateirest
  sechsmal eingespleißt. Von sechs Fassungen jeder Richtlinie gewinnt die
  **letzte** — und das waren die schwachen von vor `migration-022`. Kein
  Sicherheitsbefund (die Datei lief gar nicht, die laufende Instanz hängt an der
  Migrationskette), aber jede Neuinstallation wäre gescheitert und eine naive
  Reparatur hätte S2 und S3 stillschweigend wieder aufgemacht.

---

## G. Verbesserungen

Sortiert nach Verhältnis von Nutzen zu Eingriffstiefe.

### V1 — task_keys von der Position lösen

Der positionsbasierte `task_key` ist die Ursache von B3, B13 und der Fragilität von
B8 und erzwingt das `Week.stub`-Konstrukt. Eine stabile Slot-Id (z. B. beim Anlegen
eines Punkts vergeben und in `PartItem`/`SlotAssignment` mitgeführt) würde all das
auf einen Schlag beseitigen. Migration nötig — aber der Umbau wird mit jeder weiteren
Funktion teurer.

### V2 — Eine einzige Datumsquelle

U1 auflösen: `meetingDate()` zur alleinigen Quelle machen, `meetingDateMs` daraus
ableiten, `personTimeline` und `send-reminders` darauf umstellen. Der bestehende
Kommentar in `meeting-dates.ts:83` beschreibt bereits den Sollzustand.

### V3 — Geteilte Logik zwischen Client und Edge Functions

`send-reminders/index.ts` dupliziert task_key-Bildung, `SKIP_ROLE`,
`personDisplayName`, `meetingDayOffsets` und die Slot-Iteration. `substitute`
dupliziert weitere Teile. Deno kann TypeScript-Dateien direkt importieren — ein
gemeinsames `shared/`-Verzeichnis (oder ein Fixture-Test über beide, siehe E) würde
das Auseinanderlaufen stoppen.

### V4 — Aktuelle Woche als abgeleiteter Wert

`current` aus den Daten entfernen und aus `week.start` + heute berechnen (behebt B1
und B2 gemeinsam und macht `fsBaseFromWeeks` einfacher).

### V5 — „Bei Zuteilung: sofort" einlösen ✅

`RemindersPanel.tsx` zeigt die Zeile „Bei Zuteilung → sofort" (`remBeiZut` /
`remSofort`). Tatsächlich geht bei einer neuen Zuteilung **nichts** an die
betroffene Person: `persist.ts:364-368` schickt Mitteilungen ausschließlich an die
**Planer** (`m.planner`). Der Mitteilungstyp `zuteilung` („Neue Zuteilung") ist in
`types.ts:473` definiert, wird aber nirgends erzeugt.

Der Typ wird derzeit **nur** beim Einspringen erzeugt
(`supabase/functions/substitute/index.ts:194`) — genau dort funktioniert es also
bereits, nur bei der gewöhnlichen Zuteilung nicht.

Entweder die Zusage einlösen (Push/Mitteilung an die zugeteilte Person, analog zu
`substitute`) oder die Zeile aus den Einstellungen entfernen. Beides ist besser als
der jetzige Zustand, der ein Versprechen macht, das die App nicht hält.

### V6 — Konfliktprüfung um die Zusätzliche Klasse und Familien erweitern

`weekConflicts` deckt bereits vier Fälle sauber ab. Es fehlen:
- „Person in Hauptsaal **und** Klasse zur selben Zeit" — wird von `meetingPartNames`
  über `raeume` zwar erfasst, landet aber im generischen `double`-Fall und ist damit
  nicht als Raumkonflikt erkennbar
- „Ratgeber ist gleichzeitig Programmpunkt-Teilnehmer" (er begleitet die ganze Klasse)
- Hinweis, wenn eine Person ohne App-Konto zugeteilt wird (F10)

### V7 — Rückmeldung, wenn eine Aktion nichts bewirkt

`lacAdjust` (B7), `editTalkTheme`, `setOpeningSong` und `lacMove` geben bei
Nichtstun stumm `weeks` zurück. Der Nutzer tippt und sieht nichts. Ein Toast
(„Minuten konnten nicht gelesen werden") kostet wenig und erklärt viel.

### V8 — Personenliste in der Sprache des Nutzers sortieren ✅ erledigt

`personCompare` nimmt die Sprache jetzt als Parameter (5.9.2026). Der
Typprüfer nennt jeden Aufrufer, der sie vergisst — es braucht keine Liste.
Gemessen in `sortiert-in-der-lesersprache.test.ts`: Å/Æ/Ø stehen auf Dänisch
und Schwedisch hinter Z, auf Deutsch bei A und O.

### V9 — Cache-Versionierung im Service Worker

`sw.js:13` `CACHE = 'shell-v1'` ist konstant, `activate` löscht nur **andere**
Namen. Alte Assets bleiben unbegrenzt liegen. Ein Cache-Name mit Build-Id
(`__BUILD_ID__` existiert bereits) räumt automatisch auf und behebt zugleich einen
Teil von B17.

### V10 — Push-Benachrichtigungen bündeln

`sw.js:117` `showNotification` ohne `tag` — bei täglicher Wiederholung stapeln sich
die Erinnerungen auf dem Sperrbildschirm. Ein fester `tag` je Art ersetzt statt zu
stapeln.

### V11 — Auto-Zuteilung: männliche Schülerteile konsistent behandeln ✅

`ministryOpts` (`planning.ts:496-513`): Der `slot.male`-Zweig kehrt **vor** dem
`schulung`-Zweig zurück und verliert damit `byTotal: true` und den
Älteste/DAG-Malus. Der Schülerteil-**Vortrag** wird also nach anderen Regeln
verteilt als das Gespräch im selben Abschnitt, obwohl beides Schülerteile sind.

### V12 — Import: Endzeit und Zusammenkunftstag aus den Einstellungen

F5 und B4 gemeinsam lösen: Beim Import `date` und `end` aus `meeting_times` +
Programmdauer erzeugen, statt Wochenspanne und Festwert zu schreiben.

### V13 — Personen ohne Konto in der Liste kennzeichnen

Ein kleines Symbol in der Personenliste („kein App-Zugang") würde den Planern die
Arbeit abnehmen, die `send-reminders` heute per Sammel-Push nachholt (F10).

### V14 — Leistung: doppelte Berechnungen im Reducer ⚠️

`withDerivedTasks` (`reducer.ts:142-168`) läuft nach 20 Aktionsarten und ruft
`localizedWeeks` (klont bei aktiver Sprachvariante **alle** Wochen via
`structuredClone`), `deriveMyTasks`, `derivePendingNames`, `deriveSubstituteReqs`
und `buildAbsences` — Letzteres zusätzlich zum bereits memoisierten `useAbwesend`.
Bei 52 Wochen und jeder einzelnen Zuteilung ist das spürbar. `autoAssignMeeting`
ruft `buildAbsences` erneut (Z. 539).

---

## H. Datei-Schnellindex

| Datei | Befunde |
| --- | --- |
| `src/app/reducer.ts` | B3, B13, U5, U6, U10, V14 |
| `src/app/persist.ts` | B3, B11, V5 |
| `src/app/readonly.ts` | B10 |
| `src/app/store.tsx` | B17 |
| `index.html` | D6, S8 |
| `src/app/init.ts` | B1 |
| `src/data/planning.ts` | B5, U2, U6, V11, (F1 via SKIP_ROLE) |
| `src/data/helpers.ts` | B9, B12, U8, U9, F4 |
| `src/data/meeting-edit.ts` | B7, B14, F6 |
| `src/data/meeting-dates.ts` | U1 |
| `src/data/fs.ts` | U3, U4, F8 |
| `src/data/aux-class.ts` | (Bezug B9, B14) |
| `src/data/demo.ts` | B2, F2 (einzige Quelle von `current`/`co`/`mem`) |
| `src/lib/data.ts` | B1, B4, B11, S2, S5 |
| `src/i18n/translate-data.ts` | D1, D2, D3 |
| `src/planen/AssignSheet.tsx` | B5, B6, B15, U4 |
| `src/dashboard/DashboardScreen.tsx` | B2 |
| `src/personen/PersonDetail.tsx` | S9, F7 |
| `src/personen/invite-helpers.ts` | (mailto-Kopfzeilen, siehe „Kleineres") |
| `supabase/schema.sql` | S2, S3, S4, S11 |
| `supabase/migration-021-abwesenheit-import.sql` | S11 |
| `supabase/config.toml` | S12 (was `verify_jwt` wirklich zusagt) |
| `supabase/functions/send-reminders/index.ts` | B8, S1, U1, V3 |
| `supabase/functions/substitute/index.ts` | B16, S7, S10, S13, D5 |
| `supabase/functions/import-week/parse.ts` | B4, B7, F1, F5, F12, D7 |
| `supabase/functions/import-week/index.ts` | F11, S12 |
| `public/sw.js` | B17, V9, V10, (Klick-Ziel, siehe „Kleineres") |

---

## Was gut ist (damit es nicht verloren geht)

Damit die Liste oben nicht das falsche Bild gibt — folgende Punkte sind
überdurchschnittlich gelöst und sollten beim Umbauen erhalten bleiben:

- **Reducer rein, Nebeneffekte getrennt** (`reducer.ts` / `persist.ts`) — dadurch
  waren die meisten der obigen Befunde überhaupt durch Lesen auffindbar.
- **Offline-Positivliste** (`readonly.ts`): fail-safe konstruiert, neue Aktionen
  gelten automatisch als Schreibzugriff.
- **`Week.stub`**: die Erklärung in `types.ts:282-294`, warum Positionen absolut
  bleiben müssen, ist vorbildlich — genau diese Sorgfalt fehlt in
  `send-reminders` (B8).
- **Auto-Zuteilung**: zwei Simulationstests, ein durchdachtes gleitendes Fenster,
  Wartezeit als Tie-Break, und die Begründungen stehen im Code.
- **i18n-Tests** für das UI-Wörterbuch — inklusive der Prüfung gegen stille
  EN-Rückfälle. Genau dieses Muster fehlt für `FRAG` (D3).
- **Der sprachunabhängige Parser** (Struktur statt Text) mit Fixture-Tests in einer
  erfundenen Sprache.
- **Kommentare, die das „warum" erklären** statt das „was" — ungewöhnlich konsequent
  durchgehalten.
