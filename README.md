# JW Congregation Planner

Web-App (Deutsch, Mobile-first + Desktop) zur Organisation der Zusammenkünfte
einer Versammlung: Wochenprogramme anzeigen, Aufgaben/Rollen zuteilen (mit
Qualifikations-, Abwesenheits- und Auslastungsprüfung inkl. Auto-Zuteilung),
Personenverwaltung, persönlicher Bereich (eigene Aufgaben/Abwesenheiten),
Mitteilungen und Einstellungen.

> **Status: Alle Screens + v3-Funktionen gebaut.** Shell, Login, Programm,
> Planen (Zuteilungs-Sheet, Auto-Zuteilung, LAC-Bearbeitung), Aufgaben,
> Personen und Einstellungen sind gemäß [Design-Handoff](docs/design-handoff/README.md)
> umgesetzt. Dazu die **v3-Funktionen**: Kreisaufseher- und Gedächtnismahl-Woche,
> Bestätigungs-Flow (Zuteilungen bestätigen/verhindern), S-89-Formular,
> konfigurierbare Erinnerungen und **Mehrsprachigkeit** (Oberfläche
> DE/EN/ES/FR, separate Versammlungssprache für die Programm-Inhalte). Mit
> konfiguriertem **Supabase** (echtes Login + Postgres mit RLS) werden alle
> Versammlungsdaten geladen und zurückgeschrieben — inkl. abgeleiteter
> „Meine Aufgaben" und persistenter Bestätigungen; ohne Konfiguration läuft
> die App im Demo-Modus mit In-Memory-Daten (siehe „Supabase einrichten").
> Offen: echter Arbeitsheft-Import (siehe unten).

## Stack

- **[Vite](https://vite.dev/)** (Build/Dev-Server) + **React 19** + **TypeScript**
- Styling mit **reinem CSS + CSS-Variablen** (Design-Tokens) — keine UI-Bibliothek,
  da das Design bespoke ist (siehe `src/styles/tokens.css`)
- Schriften: **Newsreader** (Serif) + **IBM Plex Sans** (UI), via Google Fonts (OFL)
- Linting: **oxlint** (`npm run lint`)

## Loslegen

```bash
npm install     # einmalig (bereits ausgeführt)
npm run dev      # Dev-Server (http://localhost:5173)
npm run build    # Production-Build nach dist/
npm run preview  # Build lokal ansehen
npm run lint     # oxlint
```

## Projektstruktur

```
src/
  app/              Shell (Sidebar/Bottom-Nav, Mitteilungen, Toast) + Context/Reducer
  components/       Geteilte UI-Muster (Wochen-Navigation, Tabs, Bereichs-Panels)
  data/
    types.ts        Datenmodell aus dem Handoff (Week, Person, Service, …)
    constants.ts    Labels (Rollen, Aufgabenbereiche) + Bereichsfarben-Zuordnung
    demo.ts         Demo-Daten, 1:1 aus dem Prototyp portiert
    helpers.ts      Anzeigename, Initialen, Qualifikations- und Auslastungsprüfung
    planning.ts     Zuteilungslogik (zuteilen/entfernen, Auto-Zuteilung, offene Slots)
  i18n/
    ui.ts           UI-Wörterbücher DE/EN/ES/FR + Schlüssel-Maps
    translate.ts    Programm-Inhalts-Übersetzer (makeTr): S-38-Begriffe, Daten, Referenzen
    langs.ts        jw.org-Sprachliste (Versammlungssprache) + App-Sprachen
    useT.ts         Hook: t (UI), tu (App-Sprache), tp (Versammlungssprache)
  lib/
    supabase.ts     Supabase-Client + Auth-Helfer (signIn/Logout/Reset, Demo-Fallback)
    data.ts         Daten-Zugriff: Versammlungsdaten laden, Änderungen zurückschreiben
  aufgaben/         Meine Aufgaben (persönlicher Bereich) + Aufgaben-Ableitung
  einstellungen/    Einstellungen (Hilfsdienste, Programm-Import)
  login/            Login (simuliert, wie im Prototyp)
  personen/         Personenliste + Detail (Stammdaten, Rolle, Aufgabenbereiche)
  programm/         Programm-Screen (Startscreen)
  planen/           Planen-Screen + Zuteilungs-Sheet
  styles/
    tokens.css      Alle Design-Tokens, hell + dunkel ([data-theme])
  App.tsx           Einstieg: AppProvider + AppShell
  index.css         Reset/Basis + Import der Tokens
  main.tsx          React-Einstieg
docs/
  design-handoff/   Maßgebliche Design-Referenz (README, HTML-Prototypen, Screenshots)
supabase/
  schema.sql        DB-Schema (Tabellen + RLS + Funktionen), im SQL-Editor ausführen
  migration-00*.sql Nachzügler-Migrationen für früher eingerichtete Datenbanken
.github/workflows/
  deploy.yml        Auto-Deployment auf GitHub Pages (reicht Supabase-Secrets durch)
```


## Design-Referenz

Maßgeblich ist der HTML-Prototyp
[`docs/design-handoff/design/Prototyp 2a v2.dc.html`](docs/design-handoff/design/).
Er ist **kein Produktionscode**, sondern eine High-Fidelity-Referenz für Aussehen
und Verhalten — pixelgenau nachbauen. Farben, Typografie, Abstände, Radien und
Interaktionen sind final gemeint. Alle exakten Werte stehen zusätzlich in
[`docs/design-handoff/README.md`](docs/design-handoff/README.md) (inkl. Token-Tabelle
und State-/Datenmodell).

Zum Anschauen: `.dc.html`-Datei mit dem `support.js` im selben Ordner im Browser
öffnen. `support.js` **nicht** portieren — es ist nur Laufzeit für die Prototypen.

## Theming

Hell/Dunkel über `data-theme` auf `<html>`. Ein Inline-Script in `index.html`
setzt das Attribut vor dem ersten Paint (gespeicherte Wahl in `localStorage`,
sonst Systempräferenz) — kein Flackern. In der App via
`document.documentElement.dataset.theme = 'light' | 'dark'` umschalten.

## Hosting & Kosten

Ziel: **möglichst kostengünstig.** Die Empfehlung ist zweistufig.

### Jetzt: statisches Frontend, kostenlos

Das Frontend ist eine reine Client-App und lässt sich **kostenlos** statisch
hosten. `deploy.yml` ist bereits für **GitHub Pages** eingerichtet — nach dem
ersten Push nur noch **Settings → Pages → Source: „GitHub Actions"** wählen.
Solange die App mit lokalem State / `localStorage` läuft, reicht das komplett.

- URL wäre `https://doubrawa.github.io/jw-congregation-planner/` — der
  `base`-Pfad in `vite.config.ts` ist darauf eingestellt.
- **SPA-Hinweis:** Sobald clientseitiges Routing dazukommt, braucht GitHub Pages
  einen 404-Fallback (`public/404.html`), sonst geben tiefe URLs beim Reload 404.
- Alternative statische Hosts (auch kostenlos, mit angenehmeren SPA-Defaults):
  **Cloudflare Pages** oder **Netlify**.

### Später: Backend (sobald echte Daten geteilt werden müssen)

GitHub Pages kann **kein** Backend (nur statische Dateien). Für echtes Login,
gemeinsame Daten mehrerer Nutzer, Persistenz und Mitteilungs-Versand ist ein
Backend nötig. Kostengünstigste Optionen ohne eigenen Server:

- **Supabase (Empfehlung):** kostenlose Stufe bietet **Auth** (E-Mail+Passwort +
  Passwort-Reset — genau wie im Design), **Postgres**-DB und **Row-Level-Security**.
  RLS passt ideal zu „versammlungsintern geschützt" + Rollenmodell +
  Mandantenfähigkeit (mehrere Versammlungen). Frontend bleibt statisch (GitHub
  Pages/Cloudflare), spricht Supabase per JS-SDK an. Kostenlose Stufe pausiert
  inaktive Projekte — für regelmäßige Nutzung unkritisch.
- **Cloudflare (Pages + Workers + D1):** sehr großzügige kostenlose Stufe,
  Frontend + Backend + SQLite-DB aus einer Hand; Auth müsste man selbst
  bauen/einbinden (mehr Aufwand als Supabase).
- **Firebase (Firestore + Auth):** kostenlose Spark-Stufe; NoSQL-Datenmodell.

Für eine Versammlung (überschaubare Nutzer- und Datenmenge) bleiben alle
Varianten dauerhaft in der kostenlosen Stufe. **Datenschutz** beachten: Es geht
um personenbezogene Daten von Versammlungsmitgliedern — Zugriff strikt
authentifiziert und versammlungsintern begrenzen.

## Supabase einrichten (echtes Login)

Ohne Konfiguration läuft die App im **Demo-Modus** (Login simuliert, Daten
in-memory). Für echtes Login mit geschützten Daten:

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen
   (Region z. B. Frankfurt — personenbezogene Daten in der EU).
2. Im **SQL-Editor** den Inhalt von [`supabase/schema.sql`](supabase/schema.sql)
   ausführen (Tabellen + Row-Level-Security).
3. **Authentication → Users**: Benutzer mit E-Mail + Passwort anlegen; dann
   Versammlung anlegen und den Benutzer als Mitglied verknüpfen (fertige
   `INSERT`-Beispiele stehen am Ende der `schema.sql`).
4. **Project Settings → API**: `Project URL` und `anon public`-Key kopieren.
5. Lokal: Datei `.env.local` nach Vorlage von [`.env.example`](.env.example)
   anlegen — `npm run dev` nutzt dann echtes Login.
6. Deployment: dieselben Werte im GitHub-Repo als **Actions-Secrets**
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` hinterlegen
   (Settings → Secrets and variables → Actions); `deploy.yml` reicht sie an
   den Build durch.
7. **Authentication → URL Configuration** (wichtig für Mail-Links): **Site URL**
   auf die App-Adresse setzen (z. B. `https://<user>.github.io/<repo>/`) statt
   des Standardwerts `http://localhost:3000`, und unter **Redirect URLs** die
   App-Adressen erlauben (`https://<user>.github.io/<repo>/**` sowie für lokale
   Entwicklung `http://localhost:5173/**`). Sonst führen Bestätigungs- und
   Passwort-Reset-Links ins Leere (localhost:3000).

Der `anon`-Key ist für den Browser gedacht und darf öffentlich sein — der
Schutz der Daten kommt aus den RLS-Policies (Mitglieder sehen nur die eigene
Versammlung, schreiben dürfen im Wesentlichen nur Planer).

## Arbeitsheft-Import (Edge Function)

Der Import „NÄCHSTE WOCHE IMPORTIEREN" (Einstellungen → Programm-Import) holt
das Programm der Leben-und-Dienst-Zusammenkunft aus dem Arbeitsheft auf jw.org.
Da der Browser jw.org **nicht** direkt abrufen kann (CORS), läuft der Abruf +
das Parsen serverseitig in einer **Supabase Edge Function**
([`supabase/functions/import-week/`](supabase/functions/import-week/)). Sie
ermittelt automatisch die nächste kommende Woche (Übersicht → Zeitraum → Woche),
lädt die Seite (ein Abruf je Seite, kurzer Cache, klarer User-Agent) und gibt
die Woche als `Week`-JSON zurück. Nur die Zusammenkunft **unter der Woche**
steht im Arbeitsheft; das **Wochenende** (Öffentlicher Vortrag +
Wachtturm-Studium) kommt als editierbare Vorlage. Der **Wachtturm-Studienartikel**
wird automatisch aus der Studienausgabe auf jw.org ergänzt — **in der
Versammlungssprache** (alle ~480 Sprachen): **Titel**, das **Lied vor dem
Studium** und das **Schlusslied**. Die Zuordnung läuft immer über den deutschen
Studienausgabe-Anker und das Startdatum der Woche; die lokalisierte Artikelseite
wird über den „Lesen in“-Umschalter geholt. Erkennung sprachunabhängig über
Struktur (Synopsis-Karten, `pub-sjj`-Liederbuchsymbol, `h1[data-pid]`). Fehlt die
Sprache oder ist der Volltext (bei erst in ~2 Monaten behandelten Artikeln in
kleineren Sprachen) noch nicht online, bleibt das jeweilige Feld editierbarer
Platzhalter. Der öffentliche Vortrag wird lokal vergeben und bleibt Platzhalter.

**Mehrsprachig (~480 Sprachen):** Die Woche wird in der eingestellten
**Versammlungssprache** geholt. Die Function ermittelt die Woche immer zuerst
auf Deutsch (verlässlicher Anker) und löst dann über den „Lesen in"-Umschalter
der jw.org-Seite (`otherAvailLangsChooser`, je Sprache ein `data-url`) die
lokalisierte URL auf. Der Client schickt den jw.org-Sprachcode aus
[`langs.ts`](src/i18n/langs.ts) (`CONG_TO_JW`, Name → Code); die
Versammlungssprache lässt sich frei aus der vollen jw.org-Liste wählen (die
App-Oberfläche bleibt bei DE/EN/ES/FR). Programm-Inhalte (Titel, Lieder,
Schriftstellen, Sektions-Überschriften, Rahmen) stehen dadurch **direkt in der
Zielsprache**; unsere eigenen Labels (ERÖFFNUNG/ABSCHLUSS, Rollen wie
Vorsitz/Gebet) bleiben app-sprachig.

Deploy (einmalig, [Supabase CLI](https://supabase.com/docs/guides/cli) nötig):

```bash
supabase login
supabase link --project-ref <dein-project-ref>   # aus der Supabase-URL
supabase functions deploy import-week
```

Danach funktioniert der Import-Button direkt (die App ruft die Function per
`functions.invoke` mit der Nutzer-Session auf — nur eingeloggte Mitglieder).
Der Parser ([`parse.ts`](supabase/functions/import-week/parse.ts)) ist
**sprachunabhängig**: Er keyt ausschließlich auf **Struktur** — Farbklassen
(teal/gold/maroon), Noten-Icon, 1./2./3.-Nummerierung, die „(Zahl …)"-Zeitklammer
und die **Position** (letzter Schätze-Punkt = Bibellesung, letzter
Unser-Leben-Punkt = VBS) — nicht auf deutschen/englischen Text; der sichtbare
Text wird wörtlich aus der Zielsprache übernommen. Fixture-Tests decken die
deutsche **und** eine erfundene Sprache ab. Ändert jw.org das Layout
grundlegend, muss der Parser angepasst werden. **Rechtehinweis:** Der Abruf dient der internen
Zusammenkunfts-Planung deiner Versammlung; es werden keine Inhalte öffentlich
weiterverbreitet. Beachte die Nutzungsbedingungen von jw.org.

**Stand:** Anmelden/Registrieren/Abmelden und Passwort-Reset (Mail-Link →
„Neues Passwort setzen") sind verdrahtet; eine bestehende Session überspringt
den Login. Nach dem Login werden alle Versammlungsdaten geladen (Rolle/
Versammlung aus `members`), Änderungen sofort zurückgeschrieben; eine leere
Versammlung bietet Planern eine Erstbefüllung mit dem Demo-Datensatz an.
„Meine Aufgaben" entstehen aus den Zuteilungen der über `members.person_id`
verknüpften Person; Bestätigungen landen in `confirmations`, Erinnerungen und
Versammlungssprache in `congregations.settings`. **Mitglieder-Verwaltung ohne
SQL:** Planer verwalten Konten unter Einstellungen → Mitglieder (Person
verknüpfen, Planer-Rechte, Einladungscodes); neue Mitglieder registrieren sich
in der App und lösen einen Code ein (`redeem_invite`). Nur die allererste
Versammlung + Koordinator-Mitgliedschaft entsteht per SQL (siehe Ende der
`schema.sql`). Bereits eingerichtete Datenbanken einmalig mit den
`supabase/migration-00*.sql`-Dateien nachziehen (in Nummern-Reihenfolge).

### Auto-Zuteilung (Regeln)

„Automatisch zuteilen" im Planen füllt offene Slots nach festen Regeln: der
**Vorsitz betet zu Beginn** (Anfangsgebet wird an die Vorsitz-Person gekoppelt,
manuell änderbar); niemand bekommt **Hilfsdienst und Programmpunkt am selben
Tag**; die Verteilung bleibt über eine mitlaufende **Strichliste** ausgeglichen;
der **Wachtturm-Studium-Leiter** ist fest (Aufgabenbereich der Person), sein
**Vertreter** springt bei Abwesenheit ein; nicht besetzbare Slots (z. B. alle
Qualifizierten abwesend) bleiben **offen**. Die Strichliste zählt nur ein
**gleitendes Fenster** (3 Wochen davor + 3 danach), damit uralte Einteilungen
nicht ewig nachwirken. **Aufgaben** werden dabei unabhängig von den
Hilfsdiensten verteilt (bleiben regelmäßig), **Hilfsdienste** dagegen nach der
Gesamtlast — wer viele Aufgaben hat, bekommt weniger Hilfsdienste, aber nicht
umgekehrt. Die Regeln sind in
[`autoassign.sim.test.ts`](src/data/autoassign.sim.test.ts) über eine
100-Personen-Simulation abgesichert.

## Offene Punkte (aus dem Handoff)

1. Arbeitsheft-Import von jw.org: **umgesetzt** (Edge Function `import-week`,
   siehe oben) — nur die Zusammenkunft unter der Woche; Wochenende als Vorlage
2. Auth + Mandantenfähigkeit: **umgesetzt** (Supabase Auth + Schema/RLS +
   Daten-Persistenz + Mitglieder-Verwaltung mit Einladungscodes, siehe oben)
3. Mitteilungs-Versand (Push/E-Mail): **umgesetzt** — Edge Function
   `send-reminders` (E-Mail via Resend + Glocken-Mitteilungen) + Cron-Template
   (siehe unten); Konfiguration/Aktivierung pro Projekt nötig
4. Konfliktprüfungen über Wochen hinweg: **umgesetzt** — Warn-Banner im Planen
   (abwesend trotz Zuteilung, mehrfach in einer Zusammenkunft, Wochen-Serie,
   sowie **Hilfsdienst + Programmpunkt am selben Tag**)

## App-Sprachen (~30)

Die App-Oberfläche gibt es in ~30 Sprachen (Europa + Weltsprachen). Umschaltbar
im Login und im Profil. DE ist die Basis; fehlt eine Übersetzung, greift
Englisch als Fallback. Datums-/Wochentagsnamen der Zusatz-Sprachen kommen über
`Intl` (keine handgepflegten Listen). Getrennt davon ist die
**Versammlungssprache** (Programm-Inhalte) frei aus der vollen jw.org-Liste
wählbar. Neue App-Sprache hinzufügen: Code in `Lang` ([types.ts](src/data/types.ts))
+ `APP_LANGS`/`LOCALES` ([langs.ts](src/i18n/langs.ts)) + Overlay in
[ui.ts](src/i18n/ui.ts) und optional `FRAG`/`EXTRA` in
[translate.ts](src/i18n/translate.ts) (Rollen/Dienste/Phrasen).

## Erinnerungs-Versand

[`supabase/functions/send-reminders/`](supabase/functions/send-reminders/)
erinnert Mitglieder an noch **nicht bestätigte** Zuteilungen: per E-Mail (Resend)
und als Glocken-Mitteilung in der App. Läuft serverseitig mit Service-Role
(sieht alle Versammlungen) und wird täglich per Cron ausgelöst
([`supabase/cron-reminders.sql`](supabase/cron-reminders.sql)).

Ablauf laut Einstellungen → ERINNERUNGEN (`settings.reminders`): erste
Erinnerung `first` Tage vorher, letzte `last` Tage vorher (jeweils E-Mail +
Glocke), mit `repeat` zusätzlich täglich per E-Mail bis zur Bestätigung.
Bestätigt/verhindert beendet die Erinnerungen; Gastredner/Kreisaufseher und
Gruppen-Rotationen sind ausgenommen. Der Zusammenkunftstag wird aus
`meeting_times` gelesen („Di 19:00 · So 10:00“ → Di/So der Programmwoche).
Personen ohne verknüpftes App-Konto können nicht erinnert werden — steht ihre
letzte Erinnerung an, bekommen stattdessen alle Planer eine Sammel-Mail.

**Konfiguration (einmalig pro Projekt):**
- **Dry-Run ist Standard**: ohne Secret `SEND_EMAILS=true` wird nichts versendet
  und nichts geschrieben — die Antwort enthält eine Vorschau der Mails.
- Secrets setzen (`npx supabase secrets set NAME=wert --project-ref …`):
  `CRON_SECRET` (eigenes Geheimnis), `RESEND_API_KEY`, optional `REMINDER_FROM`
  und `APP_URL`; `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sind automatisch da.
- Deploy: `npx supabase functions deploy send-reminders --no-verify-jwt`, dann
  `cron-reminders.sql` mit Projekt-Ref + `CRON_SECRET` im SQL-Editor ausführen.
- Test: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<ref>.supabase.co/functions/v1/send-reminders`
  im Dry-Run prüfen, dann `SEND_EMAILS=true` setzen.
- **Resend-Testmodus**: ohne verifizierte eigene Domain stellt Resend nur an die
  eigene Konto-Adresse zu — für Mails an alle Mitglieder Domain bei Resend
  verifizieren und `REMINDER_FROM` darauf umstellen.
- Das Zeitfenster nutzt `week.start` (ISO), das nur bei importierten Wochen
  gesetzt ist.
