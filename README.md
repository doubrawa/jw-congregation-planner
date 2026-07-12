# JW Congregation Planner

Web-App (Deutsch, Mobile-first + Desktop) zur Organisation der Zusammenkünfte
einer Versammlung: Wochenprogramme anzeigen, Aufgaben/Rollen zuteilen (mit
Qualifikations-, Abwesenheits- und Auslastungsprüfung inkl. Auto-Zuteilung),
Personenverwaltung, persönlicher Bereich (eigene Aufgaben/Abwesenheiten),
Mitteilungen und Einstellungen.

> **Status: Alle Screens gebaut.** Shell (Navigation, Mitteilungen, Toast,
> Theming), Login (simuliert), Programm, Planen (inkl. Zuteilungs-Sheet und
> Auto-Zuteilung), Aufgaben (persönlicher Bereich mit Abwesenheiten), Personen
> (Liste + Detail) und Einstellungen (Hilfsdienste, Programm-Import) sind gemäß
> [Design-Handoff](docs/design-handoff/README.md) umgesetzt und laufen mit
> In-Memory-Demo-Daten aus dem Prototyp. Offen sind die Produktionsthemen
> Persistenz/Auth/echter Import (siehe unten).

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
.github/workflows/
  deploy.yml        Auto-Deployment auf GitHub Pages
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

## Offene Punkte (aus dem Handoff)

1. Echter Arbeitsheft-Import von jw.org (Format/Parsing, Nutzungsrechte klären)
2. Auth + Mandantenfähigkeit (mehrere Versammlungen), Rollen/Rechte
3. Persistenz, Mitteilungs-Versand (Push/E-Mail), S-89-konforme Benachrichtigung
4. Konfliktprüfungen über Wochen hinweg (z. B. gleiche Person zu oft hintereinander)
