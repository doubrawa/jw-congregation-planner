# Umgebungsprüfungen — Abschnitt D

Ergebnisse zu **D** aus [offene-pruefungen.md](offene-pruefungen.md): Prüfungen,
die über den Quellcode hinausgehen. Stand: 7. August 2026, Commit `e2cdb41`.
Am Code wurde nichts geändert.

| # | Prüfung | Status |
| --- | --- | --- |
| D1 | RLS gegen die echte Instanz | ✅ **ausgeführt — RLS hält dicht** |
| D2 | Parser gegen echtes jw.org | ✅ **ausgeführt — alle Anker intakt** |
| D3 | Edge Functions ohne Authentifizierung | ✅ **ausgeführt — alle vier weisen ab** |
| D4 | Echte Geräte | ⚠️ Emulation versucht, **nicht aussagekräftig** |
| D5 | Fachliche Abnahme | ⛔ nicht ersetzbar |
| D6 | Last (300 Personen / 200 Wochen) | ✅ **gemessen** |
| D7 | Mehrbenutzer real | ⛔ braucht zwei Mitgliedskonten (statisch belegt) |

Die Live-Prüfungen liefen nach ausdrücklicher Freigabe („ich bin noch nicht
produktiv") gegen die Instanz aus `.env.local`. Sie waren **rein lesend bzw.
erfolglos schreibend**: keine Daten angelegt, kein Konto erzeugt, keine
Benachrichtigung versendet. Personenbezogene Inhalte sind in dieser
Dokumentation nirgends wiedergegeben — nur Statuscodes und Zeilenzahlen.

---

## D1 — RLS gegen die echte Instanz ✅

Der `anon`-Key steht per Design im Frontend-Bundle, ist also öffentlich. Der
gesamte Schutz der Daten hängt damit an RLS. Genau das wurde geprüft.

### Lesezugriff ohne Login — alle 14 Tabellen

| Tabelle | HTTP | Ergebnis |
| --- | --- | --- |
| `congregations`, `members`, `persons`, `services`, `groups`, `weeks`, `absences`, `notifications`, `confirmations`, `push_subscriptions`, `invites`, `fs_rules`, `fs_weeks`, `reminder_log` | 200 | **je 0 Zeilen** |

**Kein einziges Datum ist ohne Anmeldung erreichbar.** Die Mandantentrennung
greift auch praktisch, nicht nur auf dem Papier.

### Schreibversuche ohne Login

| Tabelle | Ergebnis |
| --- | --- |
| `persons` | **HTTP 401** — `new row violates row-level security policy` |
| `notifications` | **HTTP 401** — dito |
| `confirmations` | **HTTP 401** — dito |

Alle drei sauber abgewiesen, auch `notifications` (dessen Policy Mitgliedern
`type = 'verhindert'` erlaubt — ohne Mitgliedschaft greift sie nicht).

### Nicht durchgeführt

Der Test „**eingeloggter Fremder ohne Mitgliedschaft**" scheiterte an der
E-Mail-Validierung: Supabase lehnt `example.org` als ungültig ab
(`email_address_invalid`). Eine echte fremde Domain habe ich dafür nicht
verwendet.

Der Erkenntnisgewinn wäre gering gewesen: `my_congregation_id()` liefert für ein
Konto ohne `members`-Zeile `NULL`, und `congregation_id = NULL` ist in SQL nie
`true`. Alle Policies prüfen ausnahmslos gegen diese Funktion.

**S2 und S3 bleiben statisch belegt** — sie brauchen zwei echte Mitgliedskonten
derselben Versammlung, was ohne Einladungscode nicht herstellbar ist.

---

## D3 — Edge Functions ohne Authentifizierung ✅

Alle vier Functions mit leerem POST und **ohne** `Authorization`-Header:

| Function | HTTP | Antwort | Woher |
| --- | --- | --- | --- |
| `send-reminders` | **401** | `Unauthorized` | **aus der Function** — `CRON_SECRET` ist gesetzt |
| `substitute` | **401** | `{"error":"unauthorized"}` | aus der Function (eigene JWT-Prüfung) |
| `send-invite` | **401** | `UNAUTHORIZED_NO_AUTH_HEADER` | von der Supabase-Plattform |
| `import-week` | **401** | `UNAUTHORIZED_NO_AUTH_HEADER` | von der Supabase-Plattform |

### Wichtige Präzisierung zu S1

`send-reminders` antwortet mit dem Text aus dem eigenen Code (`Unauthorized`),
nicht mit der Plattform-Meldung. Das beweist: **`CRON_SECRET` ist in dieser
Instanz gesetzt** — die in [befunde.md](befunde.md) beschriebene
Fail-open-Konstruktion ist hier **nicht ausnutzbar**.

S1 bleibt als **Konstruktionsschwäche** gültig (`if (CRON_SECRET && …)` lässt bei
fehlendem Secret jeden durch, und die Function ist mit `--no-verify-jwt`
deployt), ist aber kein akutes Leck. Der Fix bleibt sinnvoll: ohne Secret mit 500
abbrechen, statt still zu öffnen.

### Nebenbefund: `substitute` ist anders deployt als dokumentiert ✅

`send-invite` und `import-week` werden von der **Plattform** abgefangen (JWT-Prüfung
aktiv). `substitute` dagegen erreicht der Request, und erst der Function-Code
weist ab — sie ist also mit `--no-verify-jwt` deployt.

Der Deploy-Hinweis in `substitute/index.ts:24` sagt ausdrücklich das Gegenteil:
„**OHNE** `--no-verify-jwt` — der Aufruf braucht ein gültiges Nutzer-Login."

Der Schutz greift trotzdem, weil die Function selbst prüft (Zeile 202-203). Aber
er hängt an **einer** Codestelle statt an zwei unabhängigen Schichten — und
zusammen mit S7 (`seek` prüft den Aufrufer nicht) ist das die Function, bei der
das am wenigsten wünschenswert ist.

---

## Nebenbefund: Diese Instanz ist vollständig migriert ✅

Geprüft, ob die Objekte aus den 15 Migrationen tatsächlich existieren:

| Objekt | Ergebnis |
| --- | --- |
| `persons.fam` / `.dn` / `.planner` / `.grp` | ✅ vorhanden |
| `push_subscriptions.lang` | ✅ vorhanden |
| `fs_rules.base` / `.rules` | ✅ vorhanden |
| `fs_weeks.position` / `.data` | ✅ vorhanden |
| `reminder_log.user_id` / `.kind` / `.sent_on` | ✅ vorhanden |
| `members.email`, `congregations.settings` | ✅ vorhanden |

**Damit ist B20 (unvollständiges `schema.sql`) für die laufende Instanz
folgenlos** — die Migrationen wurden eingespielt. Der Befund bleibt für **jede
Neuinstallation** gültig: die nächste Versammlung, eine Testinstanz oder ein
anderer Betreiber bekommt nach README-Anleitung eine Datenbank ohne
Treffpunkte, ohne `persons.fam` (→ jedes Speichern einer Person schlägt still
fehl) und ohne `reminder_log`.

---

## D2 — Parser gegen echtes jw.org ✅

Geprüft am 7. August 2026 gegen die Live-Seiten. Methode: Seiten im Browser
geladen und **exakt die Regexe und Selektoren aus dem Quellcode** auf das
HTML angewendet — nicht der Parser selbst ausgeführt, sondern seine Anker
verifiziert.

### Arbeitsheft-Index (`import-week/index.ts:66-68`)

| Anker | Ergebnis |
| --- | --- |
| `jw-arbeitsheft/([a-zä]+-[a-zä]+-\d{4}-mwb)/` | ✅ **8 Perioden** gefunden, aktuellste `november-dezember-2026-mwb` |

### Periodenseite (`index.ts:81`)

| Anker | Ergebnis |
| --- | --- |
| `…/<slug>/[^"'>]*Zusammenkunft-[^"'>]*` | ✅ **9 Wochenlinks**, z. B. `…Zusammenkunft-20-26-Juli-2026/` |

### Wochenseite (`parse.ts`) — der Kern

Geprüft an `…/Programm-für-die-Leben-und-Dienst-Zusammenkunft-20-26-Juli-2026/`:

| Anker im Parser | Ergebnis |
| --- | --- |
| `<article>…</article>` | ✅ vorhanden |
| `<h1\|h2\|h3\|p\|li … data-pid …>` | ✅ **36 Tokens** |
| Farbklassen teal / gold / maroon | ✅ **4 / 4 / 3** |
| `dc-icon--music` | ✅ **3** (Anfangs-, Zwischen-, Schlusslied) |
| `h1` → Wochenspanne | ✅ „20.-26. Juli" |
| Sektionsüberschriften | ✅ alle drei: SCHÄTZE AUS GOTTES WORT / UNS IM DIENST VERBESSERN / UNSER LEBEN ALS CHRIST |
| nummerierte Punkte (`^\d+\.`) | ✅ **8** (1.–8., über alle drei Farben) |
| Zeitklammer `^\s*\(\s*\d` | ✅ **8 Zeilen**, z. B. `(4 Min.) Jer 19:1-11 ( th Lektion 5 )` |
| `otherAvailLangsChooser` | ✅ vorhanden |
| `data-url` (Sprachvarianten) | ✅ **482** — deckt sich mit den „~480 Sprachen" der Doku |

**Der Parser ist aktuell.** Die Fixtures sind nicht veraltet, ein Import würde
heute funktionieren.

Zwei Beobachtungen am Rand, die den Befunden entsprechen:

1. Das `h1` liefert **„20.-26. Juli" ohne Jahr, ohne Wochentag, ohne Uhrzeit** —
   und genau dieser String wird `Meeting.date` (bestätigt B4).
2. Die Zeitangabe steht als **„(10 Min.)" auf Deutsch** in der Seite. In anderen
   Sprachen steht dort der lokalisierte Text — womit `itemMinutes`
   (`/(\d+) Min\./`) dort ins Leere greift (bestätigt B7).
3. Der Rohtext enthält `&nbsp;` und Soft-Hyphens („Versammlungs­bibelstudium",
   „8.&nbsp;Versammlungs­bibelstudium"). Der Parser räumt beides in
   `decodeEntities()`/`clean()` korrekt ab — **kein Mangel**, aber es erklärt,
   warum `lacAdd` mit `title.startsWith('Versammlungsbibelstudium')` nur bei
   deutschen Importen trifft.

### Wachtturm-Studienausgabe (`study.ts`)

Übersicht `…/zeitschriften/wachtturm-studienausgabe-mai-2026/`:

| Anker | Ergebnis |
| --- | --- |
| `.synopsis`-Karten | ✅ **7** |
| `.contextTitle` je Karte | ✅ z. B. „6.-12. JULI 2026" |
| `h2 > a` (Titel + href) | ✅ vorhanden |
| Kopf-Karte ohne Titel | ✅ existiert („DER WACHTTURM – STUDIENAUSGABE") — genau der Fall, den der kartenweise Ansatz in `study.ts` abfängt |

Artikelseite `…/Biblische-Grundsätze-warum-so-wichtig/`:

| Anker | Ergebnis |
| --- | --- |
| `pub-sjj` (Liederbuch-Symbol) | ✅ **2** |
| Liednummern | ✅ „LIED 98", „LIED 95" |
| `h1[data-pid]` (Artikeltitel) | ✅ „Biblische Grundsätze – warum so wichtig?" |
| `otherAvailLangsChooser` | ✅ vorhanden |

**Auch der Studienausgaben-Parser ist aktuell.**

---

## D6 — Last gemessen ✅

Gemessen mit synthetischen Daten über die echten Logikfunktionen (Testdatei lief
aus dem Scratchpad, nicht aus dem Projekt).

### Kernfunktionen

| Funktion | 100 Personen / 52 Wochen | 300 Personen / 200 Wochen |
| --- | --- | --- |
| `buildAbsences` | 1 ms | 6 ms |
| **`autoAssignMeeting`** | **42 ms** | **145 ms** |
| `deriveMyTasks` | 1 ms | 1 ms |
| `derivePendingNames` | 2 ms | 1 ms |
| `weekConflicts` | 1 ms | 1 ms |
| `workloadOf` × alle Personen | 1 ms | 18 ms |
| `loadWindow` × alle Personen | 0 ms | 1 ms |

### Klon-Pfade

| Szenario | `localizedWeeks` | `assignSlot` | Summe je Zuteilung |
| --- | --- | --- | --- |
| 52 Wochen, keine Sprachvariante | 0 ms | 2 ms | **2 ms** |
| 52 Wochen, 2 Varianten | 4 ms | 7 ms | **11 ms** |
| 200 Wochen, 2 Varianten | 23 ms | 22 ms | 45 ms |
| 200 Wochen, 5 Varianten | 40 ms | 48 ms | 88 ms |

### Korrektur zu [code-review.md § 6](code-review.md)

Dort ist die Performance deutlich pessimistischer dargestellt, als sie ist.
Richtigstellung:

> Das Ladefenster ist auf **`WEEK_LIMIT = 52`** begrenzt. Der realistische
> Worst Case ist damit „52 Wochen, wenige Sprachvarianten" — und der liegt bei
> **2–11 ms je Zuteilung**. Die dreifach berechnete `buildAbsences` kostet 1 ms,
> `deriveMyTasks`/`derivePendingNames`/`weekConflicts` je ~1 ms. **Das ist kein
> Problem und braucht keine Optimierung.**

Bestehen bleibt genau ein Punkt:

- **`autoAssignMeeting` mit 42 ms** (bei heutiger Obergrenze) bis 145 ms ist die
  mit Abstand teuerste Operation — verursacht durch `structuredClone(weeks)` über
  alle Wochen plus `assignmentDistance`, das ebenfalls alle Wochen durchläuft. Bei
  einer bewussten Nutzeraktion („Automatisch zuteilen") ist das vertretbar; es ist
  aber die Stelle, an der eine Optimierung tatsächlich etwas brächte.

Die 200-Wochen-Zeilen sind nur Vorsorge: Sie zeigen, was passiert, falls
`WEEK_LIMIT` je erhöht wird. Ab dort wird der Klon-Pfad spürbar.

**Nicht gemessen:** das React-Rendering. Der Context ohne Selektoren
([code-review.md § 4.3](code-review.md)) lässt bei jeder Änderung alle
Komponenten neu rendern — das ist ein Rendering-, kein Logikproblem und mit
diesen Mitteln nicht sauber messbar.

---

## D1 (Anhang) — RLS-Matrix aus dem Schema

Ergänzung zum Praxistest oben: alle 24 Policies aus `schema.sql`, ausgewertet
nach Rolle. Der Live-Test bestätigt die Spalte „ohne Login" vollständig; die
Spalten „Mitglied" und „Planer" sind weiterhin nur gelesen.

| Tabelle | Mitglied liest | Mitglied schreibt | Planer schreibt | Anmerkung |
| --- | --- | --- | --- | --- |
| `congregations` | eigene | — | ✅ update | — |
| `members` | **nur eigene Zeile** | — | ✅ update/delete | Selbstlöschung gesperrt (`user_id <> auth.uid()`); **kein insert** — Beitritt nur über `redeem_invite` |
| `persons` | ganze Versammlung | — | ✅ alles | — |
| `services` | ganze Versammlung | — | ✅ alles | — |
| `groups` | ganze Versammlung | — | ✅ alles | — |
| `weeks` | ganze Versammlung | — | ✅ alles | — |
| `absences` | ganze Versammlung | ✅ **eigene** (`user_id = auth.uid()`) | ✅ alles | bewusst: die Planung braucht alle |
| `notifications` | **nur eigene** | ✅ insert, wenn `type = 'verhindert'` | ✅ insert für beliebige Empfänger | **S3**: Text und Empfänger frei wählbar |
| `confirmations` | ganze Versammlung | ✅ **jede Zeile mit eigener `user_id`** | ✅ delete | **S2**: `task_key` wird **nicht** gegen den Slot-Inhaber geprüft |
| `invites` | — | — | ✅ alles | — |
| `push_subscriptions` | eigene | ✅ eigene | — | `with check` bindet zusätzlich an die eigene Versammlung |

### Was die Matrix bestätigt

1. **Mandantentrennung ist durchgängig.** Jede einzelne Policy prüft
   `congregation_id = my_congregation_id()`. Es gibt keine Tabelle, über die man
   in eine fremde Versammlung sehen könnte. Die zwei `security definer`-Funktionen
   setzen sauber `search_path = public`.
2. **Die zwei Lücken sind Feinheiten innerhalb der Versammlung**, nicht nach außen:
   - `confirmations_write` prüft nur die Identität des Schreibers, nicht die
     Zuständigkeit für den `task_key` (S2)
   - `notifications_insert` erlaubt jedem Mitglied Mitteilungen mit freiem Text an
     beliebige Mitglieder derselben Versammlung (S3)
3. **`members` hat keine insert-Policy** — der einzige Weg hinein ist
   `redeem_invite` (security definer, mit `FOR UPDATE`-Sperre seit
   migration-012). Sauber gelöst.

Nicht aus der Policy ablesbar und weiterhin offen: ob die Policies zur Laufzeit
so greifen, wie sie gelesen werden — insbesondere das Zusammenspiel von
`is_planner()` mit fehlender Mitgliedschaft (`coalesce(…, false)` sieht korrekt
aus) und das Verhalten bei gleichzeitigen Schreibvorgängen.

---

## D4 — Echte Geräte ⚠️ nicht ersetzbar

Versucht: Wischgeste im Browser mit synthetischen `TouchEvent`s auf dem
`.week-strip` nachgestellt (touchstart → 6 × touchmove über 220 px → touchend).
Die Woche wechselte **nicht**.

**Daraus folgt kein Befund.** Die Emulation ist schwächer als das, was bereits
vorhanden ist: `gestures.test.tsx` prüft dieselben Handler mit 511 Zeilen und
erreicht 95,7 % Abdeckung von `useSwipeWeek` — und ist grün. Mein synthetischer
Wisch trifft die Erwartungen der Handler offenbar nicht genau (Touch-Objekte,
`targetTouches`, Zeitverhalten).

Wichtiger: Das Problem, das laut Commit-Historie mehrfach auftrat, ist
**gerade nicht** emulierbar. `useSwipeWeek.ts:14-30` beschreibt es genau: Der
Browser übernimmt die Geste fürs Scrollen und schickt `pointercancel` — deshalb
wurde von Zeiger- auf Touch-Ereignisse umgestellt. Dieses Verhalten hängt an
echter Touch-Hardware und der Scroll-Heuristik des Geräts.

**D4 bleibt offen.** Ein Tablet im Saal ist durch nichts zu ersetzen — was das
Projekt mit der versteckten Gesten-Diagnose (`profil/Diagnose.tsx`) auch
anerkennt.

---

## D5 / D7 — nicht ersetzbar

- **D5 (fachliche Abnahme):** Ob die Auto-Zuteilung *im Sinne der Versammlung*
  fair ist, ob Rubriken korrekt benannt sind und ob eine Aufgabe fehlt, kann nur
  ein Koordinator beurteilen. Die fachlichen Befunde in
  [befunde.md](befunde.md) (F1–F13) sind Hinweise für dieses Gespräch, kein
  Ersatz dafür.
- **D7 (Mehrbenutzer):** Statisch belegt (S5: `saveWeek` schreibt die komplette
  Woche ohne Locking; B16: `substitute take` ohne Vorbedingung). Der praktische
  Nachweis braucht zwei Sitzungen auf einer Testinstanz — und würde nach heutigem
  Stand vorhersagbar Daten verlieren.

---

## Zusammenfassung

**Vier gute Nachrichten — alle live geprüft:**

1. **RLS hält dicht.** 14 Tabellen anonym abgefragt: durchgehend 0 Zeilen. Drei
   Schreibversuche: alle mit RLS-Verstoß abgewiesen. Der öffentliche `anon`-Key
   gibt nichts preis.
2. **Alle vier Edge Functions weisen unauthentifizierte Aufrufe ab.**
   `CRON_SECRET` ist gesetzt, S1 ist in dieser Instanz nicht ausnutzbar.
3. **Der jw.org-Import ist nicht gefährdet.** Beide Parser treffen; alle
   Struktur-Anker existieren unverändert, inklusive der 482 Sprachvarianten.
4. **Die Performance ist kein Problem.** Bei der tatsächlichen Obergrenze von 52
   Wochen liegt eine Zuteilung bei 2–11 ms. Meine frühere Einschätzung in
   [code-review.md § 6](code-review.md) war zu pessimistisch und ist oben
   richtiggestellt. Einzig `autoAssignMeeting` (42 ms) sticht heraus.

**Zwei Präzisierungen:**

- **B20** ist für die laufende Instanz folgenlos (vollständig migriert), gilt
  aber unverändert für jede Neuinstallation.
- **`substitute`** ist entgegen dem eigenen Deploy-Hinweis mit `--no-verify-jwt`
  deployt; der Schutz hängt allein am Function-Code.

**Offen bleibt**, was zwei echte Mitgliedskonten oder Hardware braucht: S2/S3 im
Betrieb, Mehrbenutzer-Konflikte (D7), Geräte-Gesten (D4) und die fachliche
Abnahme (D5).
