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
  schema.sql        DB-Schema (Tabellen + Row-Level-Security), im SQL-Editor ausführen
  migration-001-…   Nachzügler-Migration für Datenbanken, die vor ihr eingerichtet wurden
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

Der `anon`-Key ist für den Browser gedacht und darf öffentlich sein — der
Schutz der Daten kommt aus den RLS-Policies (Mitglieder sehen nur die eigene
Versammlung, schreiben dürfen im Wesentlichen nur Planer).

**Stand:** Anmelden/Abmelden/Reset-Mail sind verdrahtet; eine bestehende
Session überspringt den Login. Nach dem Login werden alle Versammlungsdaten
geladen (Rolle/Versammlung aus `members`), Änderungen sofort zurückgeschrieben;
eine leere Versammlung bietet Planern eine Erstbefüllung mit dem Demo-Datensatz
an. „Meine Aufgaben" entstehen aus den Zuteilungen der über `members.person_id`
verknüpften Person; Bestätigungen landen in `confirmations`, Erinnerungen und
Versammlungssprache in `congregations.settings`. Bereits eingerichtete
Datenbanken einmalig mit
[`supabase/migration-001-aufgaben.sql`](supabase/migration-001-aufgaben.sql)
nachziehen. **Noch offen:** Passwort-Reset-Seite (`PASSWORD_RECOVERY`),
Mitglieder-Verwaltung in der App (members-Zeilen entstehen per SQL).

## Offene Punkte (aus dem Handoff)

1. Echter Arbeitsheft-Import von jw.org (Format/Parsing, Nutzungsrechte klären)
2. Auth + Mandantenfähigkeit: **umgesetzt** (Supabase Auth + Schema/RLS +
   Daten-Persistenz, siehe oben) — offen: Einladungen/Mitglieder-Verwaltung in der App
3. Mitteilungs-Versand (Push/E-Mail), S-89-konforme Benachrichtigung
4. Konfliktprüfungen über Wochen hinweg (z. B. gleiche Person zu oft hintereinander)
