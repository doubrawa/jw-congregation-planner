# Versammlung.app

Web-App (Deutsch, Mobile-first + Desktop) zur Organisation der Zusammenkünfte
einer Versammlung: Wochenprogramme anzeigen, Aufgaben/Rollen zuteilen (mit
Qualifikations-, Abwesenheits- und Auslastungsprüfung inkl. Auto-Zuteilung),
Personenverwaltung, persönlicher Bereich (eigene Aufgaben/Abwesenheiten),
Mitteilungen und Einstellungen.

> **© 2026 Jürgen Doubrawa — alle Rechte vorbehalten, keine Lizenz zur Nachnutzung.**
> Dieses Repository ist öffentlich einsehbar, der Quellcode aber **nicht** unter
> einer Open-Source-Lizenz freigegeben: Kopieren, Weiterverwenden, Verändern oder
> Betreiben durch Dritte ist nicht gestattet. Erlaubt ist nur, was die
> Nutzungsbedingungen von GitHub für öffentliche Repositories vorsehen — ansehen
> und auf GitHub forken. „Öffentlich sichtbar" bedeutet nicht „frei nutzbar".
> Texte von jw.org und andere fremde Bestandteile gehören ihren Inhabern.
> Einzelheiten: [LICENSE](LICENSE).

> **Status: Alle Screens + v3-Funktionen gebaut.** Shell, Login, Programm,
> Planen (Zuteilungs-Sheet, Auto-Zuteilung, LAC-Bearbeitung), Aufgaben,
> Personen und Einstellungen sind gemäß [Design-Handoff](docs/design-handoff/README.md)
> umgesetzt. Dazu die **v3-Funktionen**: Kreisaufseher- und Gedächtnismahl-Woche,
> Bestätigungs-Flow (Zuteilungen bestätigen/verhindern), S-89-Formular,
> konfigurierbare Erinnerungen und **Mehrsprachigkeit** (Oberfläche in
> 12 Sprachen, separate Versammlungssprache für die Programm-Inhalte). Mit
> konfiguriertem **Supabase** (echtes Login + Postgres mit RLS) werden alle
> Versammlungsdaten geladen und zurückgeschrieben — inkl. abgeleiteter
> „Meine Aufgaben" und persistenter Bestätigungen. Erfundene Daten enthält die
> App nicht; die zeigt allein die Entwicklerseite im Dev-Server (siehe
> „Entwicklerseite").
> Offen: echter Arbeitsheft-Import (siehe unten).

## Stack

- **[Vite](https://vite.dev/)** (Build/Dev-Server) + **React 19** + **TypeScript**
- Styling mit **reinem CSS + CSS-Variablen** (Design-Tokens) — keine UI-Bibliothek,
  da das Design bespoke ist (siehe `src/styles/tokens.css`)
- Schriften: **Manrope**, für Rechts-nach-links **Vazirmatn**, **Noto Nastaliq Urdu**
  und **Heebo** — im Bündel über `@fontsource` (OFL), siehe `src/styles/fonts.css`
- Linting: **oxlint** (`npm run lint`)

## Loslegen

```bash
npm install     # einmalig (bereits ausgeführt)
npm run dev      # Dev-Server (http://localhost:5173)
npm run build    # Production-Build nach dist/
npm run preview  # Build lokal ansehen (mit --base, sonst 404 auf alle Assets)
npm run lint     # oxlint
npm run icons    # App-Icons aus public/logo.svg neu erzeugen
```

## Offline-Verhalten (PWA)

Zwei Schichten, damit die installierte App im Saal ohne Netz benutzbar bleibt:

**1. App-Shell** — [`public/sw.js`](public/sw.js) cacht HTML, JS/CSS und Icons:

| Anfrage | Strategie |
| --- | --- |
| Seitenaufruf (`navigate`) | Netz zuerst, sonst gecachte `index.html` |
| `/assets/*` (Inhalts-Hash im Namen) | Cache zuerst (unveränderlich) |
| übrige eigene Dateien | Netz zuerst, Cache als Rückfall |
| Google Fonts | Cache zuerst |
| **Supabase** | **nicht abgefangen** — keine Datenantworten im Cache |

Im Dev-Server ist das Caching aus (Registrierung mit `?dev=1`), sonst würde es
Vites HMR abfangen; Push funktioniert trotzdem. `npm run preview` cacht wie
Produktion — nur damit ist Offline lokal testbar.

**2. Datenstand** — [`src/lib/snapshot.ts`](src/lib/snapshot.ts) legt nach jedem
erfolgreichen Laden die `HydratePayload` im localStorage ab (an die Benutzer-Id
gebunden, beim Abmelden und bei verlorener Mitgliedschaft gelöscht). Scheitert
das Laden, spielt [`hydrate.ts`](src/app/hydrate.ts) sie über dieselbe
`hydrate`-Aktion zurück und setzt `staleAt`.

Zwei Grenzen dabei, weil die Aufnahme im Klartext liegt und **die Sitzung
überlebt** — nach Ablauf des Tokens ist sie auf einem geteilten Gerät weiterhin
lesbar:

- **Sie verfällt nach 14 Tagen** und wird beim Lesen nicht nur verworfen,
  sondern gelöscht. Wer so lange ohne Netz war, dem nützt der alte Stand nicht.
- **Der Abwesenheitsgrund bleibt draußen** — der einzige Freitext, der
  Gesundheitsangaben tragen kann, und der einzige, den offline niemand braucht.
  Die E-Mail-Adresse bleibt. Eine Telefonnummer führt die App seit dem
  25.10.2026 nicht mehr.

Solange `staleAt` gesetzt ist, ist die App **nur lesend**:

- [`readonly.ts`](src/app/readonly.ts) führt eine Positivliste der reinen
  Ansichts-Aktionen; alles andere weist der Provider ab und zeigt einen Hinweis.
  Neue Aktionen gelten damit automatisch als Schreibzugriff (fail-safe).
- [`persist.ts`](src/app/persist.ts) bricht zusätzlich ab (zweite Absicherung).
- Ein Banner nennt den Zeitpunkt des Stands und bietet „Neu laden".

Bewusst **kein** Offline-Schreiben mit späterem Abgleich: zwei Planer, die offline
unabhängig planen, würden sich beim Verbinden gegenseitig überschreiben.

### Online: Stand je Woche statt „der Letzte gewinnt"

Dasselbe Risiko bestand online unverändert — dort schrieb `saveWeek` die
komplette Woche als Upsert, ohne Sperre und ohne Versionskennzeichen. Zwei
gleichzeitig planende Koordinatoren überschrieben sich vollständig und lautlos.

Jede Zeile in `weeks` trägt jetzt einen Stand (`updated_at`, gesetzt von einem
Trigger — nicht vom Client, sonst schriebe man sich daran vorbei):

1. Beim Laden merkt sich der Client den Stand je Woche.
2. Beim Speichern nennt er ihn als Bedingung. Trifft er noch zu, wird
   geschrieben und der neue Stand übernommen.
3. Trifft er nicht mehr zu, wurde **nichts** überschrieben. Der Client lädt
   still neu und sagt es dem Nutzer.

Schreibvorgänge derselben Woche laufen hintereinander, sonst kämpfte man gegen
sich selbst. Die Edge Function, die Wochen schreibt (`substitute`), folgt
derselben Regel (`supabase/functions/_shared/woche-schreiben.ts`).

Bis zum 5.10.2026 wurde vor Schritt 3 nachgesehen und, stand dort noch der
eigene Stand, **ohne** Bedingung geschrieben — gegen einen falschen
Konfliktalarm, für den es keinen bekannten Auslöser gab. Genau dieser Schritt
öffnete das Fenster, in dem eine fremde Änderung lautlos verloren ging.

Zum Nachstellen ohne Netzabbruch: `/demo.html#stale=<Stunden>` auf der
Entwicklerseite (siehe [docs/user-guide/README.md](docs/user-guide/README.md)).

## Logo & App-Icons

Quelle der App-Icons ist **[`public/logo.svg`](public/logo.svg)** (Vektor, `viewBox`
eng um das Motiv). Daneben steht **[`public/logo-klein.svg`](public/logo-klein.svg)**
für kleine Größen. Die PNGs werden aus `logo.svg` erzeugt — nie von Hand
bearbeiten:

```bash
npm run icons    # scripts/make-icons.mjs, rendert mit Chrome (headless)
```

| Datei | Größe | Zweck |
| --- | --- | --- |
| `logo.svg` | Vektor | Login, Quelle der PNGs |
| `logo-klein.svg` | Vektor | Sidebar (40 px), mobiler Header (22 px), SVG-Favicon |
| `icon-192.png` | 192² | Manifest `any`, PNG-Favicon-Fallback, Push-Notification |
| `icon-512.png` | 512² | Manifest `any` |
| `icon-512-maskable.png` | 512² | Manifest `maskable` (Motiv in der Safe-Zone) |
| `apple-touch-icon.png` | 180² | iOS-Home-Bildschirm (kein SVG, keine Transparenz) |
| `badge-96.png` | 96² | Badge der Push-Meldung (Android-Statusleiste): nur Plätze und Pult aus `logo-klein.svg`, weiß auf durchsichtig — Android nimmt davon nur den Alphakanal |

Das Zeichen (seit dem 4.10.2026): drei Sitzreihen mit 4, 6 und 8 Plätzen um ein
goldenes Rednerpult, von oben gesehen, auf einer dunklen Petrol-Kachel — flach.
Klein verschwammen die 18 Plätze zu Streifen; dort steht deshalb die kleine
Fassung mit 3, 5 und 7 Plätzen und kräftigeren Punkten auf denselben Bögen
(Radien 112/176/240 um das Pult, 64 Einheiten Bogenabstand). Die Polsterung je Ziel steht als `share`
in `scripts/make-icons.mjs`. Das maskable-Icon liegt auf Weiß wie der
Startbildschirm der installierten App (`background_color`), denn Android zeigt
es dort groß — vollflächig hätte es spitze Ecken; das iOS-Icon bekommt die
Kachelfarbe als Fläche, die das Skript aus `logo.svg` liest (iOS rundet selbst).
Gerendert wird mit Chrome, demselben Renderer wie in der App.

## Projektstruktur

```
src/
  app/              Shell (Sidebar/Bottom-Nav, Mitteilungen, Toast) + Context/Reducer
  components/       Geteilte UI-Muster (Wochen-Navigation, Tabs, Bereichs-Panels)
  data/
    types.ts        Datenmodell aus dem Handoff (Week, Person, Service, …)
    constants.ts    Labels (Rollen, Aufgabenbereiche) + Bereichsfarben-Zuordnung
    helpers.ts      Anzeigename, Initialen, Qualifikations- und Auslastungsprüfung
    planning.ts     Zuteilungslogik (zuteilen/entfernen, Auto-Zuteilung, offene Slots)
  i18n/
    ui.ts           UI-Wörterbücher (12 Sprachen) + Schlüssel-Maps
    translate.ts    Programm-Inhalts-Übersetzer (makeTr): S-38-Begriffe, Daten, Referenzen
    langs.ts        jw.org-Sprachliste (Versammlungssprache) + App-Sprachen
    useT.ts         Hook: t (UI), tu (App-Sprache), tp (Versammlungssprache)
  lib/
    supabase.ts     Supabase-Client + Auth-Helfer (signIn/Logout/Reset)
    data.ts         Daten-Zugriff: Versammlungsdaten laden, Änderungen zurückschreiben
  aufgaben/         Meine Aufgaben (persönlicher Bereich) + Aufgaben-Ableitung
  auswertung/       Auswertung der Zuteilungen (T126; gerechnet in data/auswertung.ts)
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
scripts/
  make-icons.mjs    Erzeugt die App-Icons aus public/logo.svg (npm run icons)
  testdaten-grenze.mjs  Entwicklerseite /demo.html + Bündelwache gegen Testdaten
tests/
  testdaten/        Erfundene Daten für Tests und Entwicklerseite — nie für die App
docs/
  design-handoff/   Maßgebliche Design-Referenz (README, HTML-Prototypen, Screenshots)
  user-guide/       Benutzerhandbücher (Planer/Verkündiger) + Auto-Screenshots
supabase/
  schema.sql        DB-Schema (Tabellen + RLS + Funktionen), im SQL-Editor ausführen
  migration-*.sql   Nachzügler-Migrationen für früher eingerichtete Datenbanken
.github/workflows/
  deploy.yml        Auto-Deployment auf GitHub Pages (reicht Supabase-Secrets durch)
```

## Entwicklerseite

`npm run dev`, dann **`http://localhost:5173/demo.html`**: die App mit den
erfundenen Daten aus `tests/testdaten/` (Versammlung „Musterstadt", rund hundert
Personen, vier Wochen) — ohne Login und ohne Datenbank, auch wenn `.env.local`
eine nennt. Der Hash springt einen Zustand direkt an
(`#s=planen&tab=fs&pl=0&me=p1`, alle Schalter in
`tests/testdaten/demo-start.ts`); daraus entstehen die Handbuch-Bilder.

Die Seite läuft dieselben Wege wie der Betrieb — einen Demo-Modus mit
eigenem Verhalten gibt es seit dem 2.10.2026 nicht mehr: „Meine Aufgaben"
werden aus den Wochen abgeleitet (für die Person aus `me=`), Konto-Funktionen
fehlen mangels Anmeldung. Damit das nicht vom Kalender abhängt, steht ihre Uhr
auf Montag, 7. September 2026, 9 Uhr (`tests/testdaten/uhr.ts`) — der ersten
Testwoche. Die Auswertung (T126) zeigt nur Vergangenes; für sie stellt
`uhr=2026-10-12` im Hash einen späteren Tag.

Die Seite gibt es nur im Dev-Server (`scripts/testdaten-grenze.mjs`), gebaut
wird allein `index.html`. **Die App selbst kennt keine Testdaten:** Eine neue
Versammlung ist leer und wird von Hand oder per NWS-Import gefüllt. Damit das so
bleibt, bricht jeder Build ab, in dem ein Modul aus `tests/testdaten/` steckt
oder eines ihrer Kennzeichen im Ergebnis steht — Adressen unter
`musterstadt.example`, Platzhalter wie „Demoaufgabe".
Bis zum 2.10.2026 lag die erfundene Personenliste trotz `import.meta.env.DEV`
im ausgelieferten Bündel.


## Design-Referenz

Maßgeblich ist der HTML-Prototyp
[`docs/design-handoff/design/Prototyp 2a v3.dc.html`](docs/design-handoff/design/).
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

- Die App läuft unter der eigenen Domain **`https://versammlung.app/`** (bei
  IONOS registriert, DNS zeigt auf GitHub Pages). Deshalb steht `base` in
  `vite.config.ts` auf `/`, und `public/CNAME` trägt die Domain in jeden Build.
  In **Settings → Pages → Custom domain** muss `versammlung.app` eingetragen
  und **Enforce HTTPS** gesetzt sein; `.app` ist HSTS-vorgeladen und
  funktioniert ausschließlich über HTTPS.
- DNS-Einträge bei IONOS für den nackten Namen: vier `A`-Records auf
  `185.199.108.153`–`185.199.111.153`, vier `AAAA`-Records auf
  `2606:50c0:8000::153`–`2606:50c0:8003::153`, dazu `CNAME www` →
  `doubrawa.github.io`. Der alte Pfad
  `https://doubrawa.github.io/jw-congregation-planner/` leitet auf die Domain
  weiter.
- **SPA-Hinweis:** Sobald clientseitiges Routing dazukommt, braucht GitHub Pages
  einen 404-Fallback (`public/404.html`), sonst geben tiefe URLs beim Reload 404.
- Alternative statische Hosts (auch kostenlos, mit angenehmeren SPA-Defaults):
  **Cloudflare Pages** oder **Netlify**.

### Später: Backend (sobald echte Daten geteilt werden müssen)

GitHub Pages kann **kein** Backend (nur statische Dateien). Für echtes Login,
gemeinsame Daten mehrerer Nutzer, Persistenz und Mitteilungs-Versand ist ein
Backend nötig. Kostengünstigste Optionen ohne eigenen Server:

- **Supabase (Empfehlung):** kostenlose Stufe bietet **Auth** (die App meldet
  ohne Kennwort an, mit einem Link — siehe unten), **Postgres**-DB und
  **Row-Level-Security**.
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

Ohne Konfiguration hat die App keine Datenbank: Die Anmeldung wird nur
nachgestellt, und es gibt nichts zu sehen — erfundene Daten zeigt allein die
Entwicklerseite. Für echtes Login mit geschützten Daten:

1. Kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen
   (Region z. B. Frankfurt — personenbezogene Daten in der EU).
2. Im **SQL-Editor** den Inhalt von [`supabase/schema.sql`](supabase/schema.sql)
   ausführen (Tabellen + Row-Level-Security).
3. Versammlung und ersten Admin mit `scripts/versammlung-anlegen.mjs` anlegen
   (siehe unten) — es gibt den Anmelde-Link des Admins aus. Konten legt niemand
   von Hand an: Sie entstehen, wenn jemand seinen Link zum ersten Mal öffnet.
   Unter **Authentication → Sign In / Providers** das Registrieren abschalten
   (**Allow new users to sign up** aus) — hereinkommen soll nur, wem der Admin
   einen Link gegeben hat.
4. **Project Settings → API**: `Project URL` und `anon public`-Key kopieren.
5. Lokal: Datei `.env.local` nach Vorlage von [`.env.example`](.env.example)
   anlegen — `npm run dev` nutzt dann echtes Login.
6. Deployment: dieselben Werte im GitHub-Repo als **Actions-Secrets**
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` hinterlegen
   (Settings → Secrets and variables → Actions); `deploy.yml` reicht sie an
   den Build durch.
7. **Authentication → URL Configuration** (wichtig für Mail-Links): **Site URL**
   auf die App-Adresse setzen (`https://versammlung.app/`) statt
   des Standardwerts `http://localhost:3000`, und unter **Redirect URLs** die
   App-Adressen erlauben (`https://versammlung.app/**` sowie für lokale
   Entwicklung `http://localhost:5173/**`). Sonst führen Links aus Mails von
   Supabase ins Leere (localhost:3000).
8. **E-Mails mit dem Anmelde-Link** schickt die App über Resend: die Secrets
   `RESEND_API_KEY` und `INVITE_FROM` (Absender mit verifizierter Domain) in
   den Edge Functions setzen. Ohne sie geht es trotzdem — der Admin druckt
   Zettel oder schickt den Link aus seinem eigenen Mail-Programm.

Der `anon`-Key ist für den Browser gedacht und darf öffentlich sein — der
Schutz der Daten kommt aus den RLS-Policies (Mitglieder sehen nur die eigene
Versammlung, schreiben dürfen im Wesentlichen nur Planer).

Eine Richtlinie wählt Zeilen, keine Spalten. Was innerhalb einer sichtbaren
Zeile nicht jeder lesen soll, sperren **Spaltenrechte** (`grant select (…)`):
die Prüfsummen der Anmelde-Links, seit dem 29.10.2026 auch die E-Mail-Adressen
der Personen und der Grund einer Abwesenheit. Ein `select=*` auf diese
Tabellen scheitert deshalb, die App nennt ihre Spalten ausdrücklich. Adressen
und Gründe kommen über `personen_mails` (nur der Admin) und
`abwesenheit_gruende` (der Admin alle, sonst die eigenen). Eine neue Spalte in
`persons` oder `absences` gehört in die Freigabe — `tests/spaltenrechte.test.ts`
meldet, wenn sie fehlt.

### Neuaufbau: wenn sich das Schema ändert

[`supabase/schema.sql`](supabase/schema.sql) ist mit `create table if not
exists` formuliert und lässt eine bestehende Tabelle deshalb in Ruhe — eine
geänderte Spaltendefinition erreicht eine laufende Datenbank also **nicht**.
Solange die App nicht ausgerollt ist, wird neu aufgebaut statt migriert (eine
Migrationskette daneben soll es nicht wieder geben, siehe Kopf der Datei):

1. [`supabase/neuaufbau.sql`](supabase/neuaufbau.sql) im SQL-Editor ausführen —
   **löscht alle Daten**, aber keine Konten (`auth.users` bleibt).
2. `supabase/schema.sql` ausführen.
3. Alle Edge Functions deployen (`import-week`, `send-plan`,
   `send-reminders`, `send-invite`, `anmelden`, `substitute`, `trolley`,
   `tauschen`).
Den ganzen Rest — Versammlung, Personen, Wochen, Zuteilungen, Abwesenheiten,
Treffpunkte — fährt **ein** Aufruf:

```powershell
node scripts/neuaufbau-fahren.mjs `
  --name "Musterstadt" --saal "Hauptstraße 12" `
  --mid "2 19:00" --we "0 10:00" `
  --vorname "Anna" --nachname "Beispiel" `
  --sql C:\DATA\Claude\nws-export\import-live-personen.sql
```

Er ruft die sechs Einzelskripte in der Reihenfolge auf, die die Daten verlangen,
und holt dabei **acht Wochenprogramme** von jw.org (`--wochen N` ändert das) —
in der App wäre das achtmal „Nächste Woche importieren". Zuerst mit `--trocken`;
steigt ein Schritt aus, nennt der Lauf die Nummer zum Fortsetzen
(`--ab-schritt N`), damit Schritt 1 nicht eine zweite Versammlung anlegt. Steht
eine zweite Versammlung daneben (die Testversammlung), gehört zum Fortsetzen
`--cong <id>` dazu — sonst weist jeder Schritt mit „Mehrere Versammlungen" ab.

**Mit einem Jahr Geschichte:** `--ab <Montag vor einem Jahr> --wochen 60` holt
die Wochen ab dort — das Jahr, die laufende Woche und sieben voraus — und die
Abwesenheiten, die seitdem endeten. Ohne beginnt die Auswertung leer, denn
Schritt 2 leert `weeks`. Die Zuteilungen kommen aus NWS, soweit es sie noch
hat (unter der Woche rund zehn Monate, Hilfsdienste rund fünf).

**Was NWS schon gelöscht hat**, haben seine automatischen Sicherungen noch
(18.10.2026): `scripts/nws-staende-vereinen.mjs` vereint den frischen Stand mit
den entschlüsselten Sicherungen, und `--daten <ordner>` reicht den vereinten
Ordner an die drei Schritte, die NWS lesen (3, 5 und 6). Die Personen kommen
weiter aus dem frischen Stand. Am 18.10.2026 reichten so die Zuteilungen der
Zusammenkünfte vor das Jahr zurück, Hilfsdienste und Treffpunkte bis Mitte
November 2025, die Abwesenheiten bis März 2026.

Was er nacheinander tut — und was fehlte, wenn man einen Schritt ausließe:

| # | Schritt | Was fehlt sonst |
| --- | --- | --- |
| 1 | `scripts/versammlung-anlegen.mjs` | Versammlung, Planer-Person, Standard-Dienste, sein Anmelde-Link |
| 2 | `scripts/versammlung-zuruecksetzen.mjs --sql <personen.sql>` | Personen, Gruppen, Haushalte |
| 3 | `scripts/abwesenheiten-importieren.mjs [--ab <Montag>]` | **die Abwesenheiten** — ohne sie plant die App gegen einen leeren Kalender |
| 4 | `scripts/wochen-importieren.mjs --anzahl 8 [--ab <Montag>]` | die Programme, mit dem festen Leiter des Wachtturm-Studiums |
| 5 | `scripts/wochenplanung-importieren.mjs` | Zuteilungen, Hilfsdienste, Reinigung |
| 6 | `scripts/treffpunkte-importieren.mjs` | die Leiter der Treffpunkte |

**Die Reihenfolge ist nicht frei:** Schritt 2 leert `weeks`, `absences` und
`fs_weeks` mit — die Wochen kommen deshalb danach, und die Zuteilungen brauchen
beides. Die Abwesenheiten stehen vor den Wochen (18.10.2026): Mit jeder Woche
kommt der feste Leiter des Wachtturm-Studiums hinein, und wo er fehlt, sein
Vertreter — das wissen erst die Abwesenheiten. Diese Liste stand bis zum
18. September 2026 unvollständig im README,
und genau deshalb lief ein Neuaufbau ohne die Abwesenheiten durch; seitdem hält
`neuaufbau-fahren.test.ts` die Reihenfolge fest, statt sie dem Gedächtnis zu
überlassen.

Jeder Schritt bleibt einzeln aufrufbar (jeweils mit `--trocken`), etwa um später
nur Wochen nachzuholen:

```powershell
node scripts/wochen-importieren.mjs --anzahl 4
```

**Was bleibt:** sich mit dem Anmelde-Link aus Schritt 1 anmelden (er übersteht
Schritt 2; verloren: `node scripts/zugang-ausstellen.mjs --person "Vorname
Nachname"`), den übrigen ihre Links geben (in der App: Personen › Ohne Link ›
Links senden), und der **Grundplan der Treffpunkte**. Den schlägt `treffpunkte-importieren.mjs`
aus den NWS-Terminen nur vor — welche Regel dahintersteckt, ist eine
Entscheidung und keine Zeile in den Daten. Getroffen wird sie in den
Einstellungen (GRUNDPLAN TREFFPUNKTE) oder, wenn sie feststeht, damit:

```powershell
node scripts/treffpunkt-regeln-setzen.mjs --datei <regeln.json> --trocken
```

Die Datei ist eine Liste aus `wd` (0 = Sonntag), `time`, `place`, `monthly`
(0 = jede Woche, 1..4 = N-ter im Monat) und `grp` (`null` =
Versammlungstreffpunkt). Das Skript trägt die Regeln nicht nur ein, es **führt
sie mit den schon importierten Terminen zusammen**: Eine gleichartige Zeile geht
in der Regel auf und gibt ihren Leiter an sie ab, Einzeltermine ohne Regel
bleiben stehen. Ohne das stünde jeder importierte Treffpunkt danach doppelt da —
`regenFsWeeks` erzeugt die Regel-Treffpunkte und behält daneben jeden manuellen
Eintrag. Dass beide Rechnungen dasselbe ergeben, hält
`treffpunkt-regeln-setzen.test.ts` gegen `genFsWeek` aus der App fest.

**Zum Schluss nachsehen, ob der Bestand so dasteht, wie die App ihn lädt:**

```powershell
node scripts/wochen-angleichen.mjs --trocken
```

Die App gleicht beim Laden an (Zusätzliche Klasse, Treffpunkte nach dem
Grundplan), schreibt das aber nicht zurück. Weicht eine Woche davon ab, weist
der Trigger `fs_weeks_pruefen` den Gruppenaufseher dort ab — die App lädt nur
nach, bis Admin oder Planer die Woche einmal speichern. Meldet
das Skript abweichende Wochen, gleicht es sie ohne `--trocken` an (auf ihren
Stand, wie ein Admin). Ein zweiter Lauf muss „Nichts abweichend" melden.

**Erscheint eine neue Ausgabe des Arbeitshefts,** fährt dieses Skript sie gegen
den Parser — nur lesend, ohne Datenbank und ohne Schlüssel:

```powershell
node scripts/heft-pruefen.mjs en
```

Es holt die kommenden Wochen von jw.org (dieselbe Suche wie `import-week`,
`hefte.ts`), parst sie und meldet, was nach einer neuen Form der Seite aussieht:
Eröffnung oder Abschluss ohne Liednummer, kein Lied unter „Unser Leben als
Christ", Lücken in den Nummern, Punkte ohne Minuten oder Plätze, eine Form unter
„Uns im Dienst verbessern", die der Parser nicht kennt — und je genannter
Sprache, ob sich ihre Fassung wie die deutsche gliedert. Ohne Sprachcode prüft
es nur Deutsch, `--alle` auch vergangene Wochen. Anlass: Ab Januar 2027 wären
alle Lieder ohne Nummer gekommen und der „Vortrag des Vorsitzenden" als
Schülerteil; aufgefallen ist das am 16.10.2026 nur, weil jemand die nächste
Ausgabe gelesen hat. Meldet es etwas: erst die Seite ansehen, dann den Parser
anpassen.

**Vorher ist nichts zu setzen.** Die Projekt-URL holen sich die Skripte aus
`.env.local` (`VITE_SUPABASE_URL`), und nach dem Secret-Schlüssel fragen sie,
wenn keiner dasteht — verdeckt, mit dem Link aufs Dashboard daneben. Wer nicht
bei jedem Lauf tippen will, hinterlegt ihn **einmal**:

```powershell
node scripts/schluessel-setzen.mjs
```

Das fragt verdeckt, **prüft den Schlüssel am Projekt** (ein versehentlich
eingefügter Publishable-Key fliegt damit sofort auf statt erst beim ersten
Schreibversuch) und legt ihn als `SUPABASE_SECRET_KEY` in `.env.local` ab —
gitignored wie der Rest der Datei, und die übrigen Zeilen bleiben unberührt.
Danach findet ihn jedes Wartungsskript von selbst.

**Eingefügt wird zeilenweise.** Die Abfrage liest über `readline`, nicht Taste
für Taste — ein eingefügter Schlüssel kommt als **eine Zeile** an, auch in
eingebetteten Terminals. Eine Zwischenfassung las am 18. September 2026
Einzeltasten im Rohmodus: Im Terminal-Panel der Claude-Desktop-App kam davon
nichts an, die Aufforderung stand da, und der Lauf hing, bis jemand den Prozess
abschoss. Verdeckt bleibt die Eingabe, soweit die Konsole es zulässt; schreibt
sie selbst mit, ist der Schlüssel im Rückblick zu sehen — lieber sichtbar als
gar nicht. Wer nichts eingeben mag, schreibt die Zeile
`SUPABASE_SECRET_KEY=sb_secret_…` von Hand in `.env.local` und startet das
Skript danach: Es findet den Schlüssel dort und prüft ihn nur noch.

**Wird der Befehl nicht selbst getippt, sondern eingespeist** — etwa über den
Knopf „Ausführen" im Terminal der Claude-Desktop-App —, kehrt die Shell sofort
zu ihrem Prompt zurück, und der Prozess wartet ohne Tastatur weiter: Die
Aufforderung steht da, nichts kommt an. Gemessen am 18. September 2026 im
selben Panel: derselbe Lauf, von Hand gestartet, empfing den eingefügten
Schlüssel vollständig. Für den eingespeisten Fall gibt es zwei Wege ohne
Eingabe — der erste braucht nur einen Klick:

```powershell
node scripts/schluessel-setzen.mjs --zwischenablage
```

Schlüssel im Dashboard kopieren, Befehl unverändert ausführen: Das Skript holt
ihn aus der Zwischenablage, schält Zeilenumbruch, Anführungszeichen und ein
vorangestelltes `SUPABASE_SECRET_KEY=` ab und gibt ihn nie aus. In der History
landet dabei nichts. Der zweite Weg ist `--key sb_secret_…` in der
Befehlszeile; der Schlüssel steht danach allerdings in der PowerShell-History
(`(Get-PSReadLineOption).HistorySavePath`).

Warum abgelegt und nicht gesetzt: Eine Umgebungsvariable lebt nur in dem
Fenster, in dem sie gesetzt wurde, und ein Aufruf **ohne Terminal** (Cron, ein
zweites Werkzeug, eine Sitzung, die jeden Befehl in einer frischen Shell
startet) kann nicht einmal gefragt werden — er bräche mit „kein Terminal zum
Fragen" ab. Eine gesetzte Umgebungsvariable schlägt weiterhin die Datei;
`--neu` fragt nach dem Rotieren erneut, `--trocken` zeigt nur, was geschähe.
Entfernen heißt: die Zeile aus `.env.local` löschen.

Dass jedes Skript denselben Weg geht, hält `schluessel-einheitlich.test.ts`
fest: Der Weg stand vorher nur in `rollen-nachtragen.mjs`, und die übrigen
brachen mit „Invalid API key" ab — fünfmal hintereinander in einem einzigen
Neuaufbau.

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
App-Oberfläche deckt davon 12 Sprachen ab). Programm-Inhalte (Titel, Lieder,
Schriftstellen, Sektions-Überschriften, Rahmen) stehen dadurch **direkt in der
Zielsprache**; unsere eigenen Labels (ERÖFFNUNG/ABSCHLUSS, Rollen wie
Vorsitz/Gebet) bleiben app-sprachig.

Deploy (einmalig, [Supabase CLI](https://supabase.com/docs/guides/cli) nötig):

```bash
supabase login
supabase link --project-ref <dein-project-ref>   # aus der Supabase-URL
supabase functions deploy import-week
```

> **Nach einem Deploy prüfen, ob die Function überhaupt hochgekommen ist.**
> Ein Aufruf ohne Berechtigung antwortet immer mit 401 — aber **das Format
> verrät, wer geantwortet hat**:
>
> | Antwort | Wer | Bedeutung |
> | --- | --- | --- |
> | JSON, z. B. `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` | Plattform | Die Anfrage kam nie beim Code an (JWT-Prüfung davor). |
> | Klartext, z. B. `Unauthorized` | die Function selbst | Das Modul ist **geladen** — samt aller Importe. |
>
> Das zweite ist der Nachweis, dass geteilter Code aus
> [`_shared/`](supabase/functions/_shared/) mitgebündelt wurde: der Handler
> läuft erst nach dem Laden des Moduls. Fehlte eine Datei im Bündel, käme ein
> Boot-Fehler statt einer sauberen Ablehnung. Dort liegen inzwischen vier
> Bausteine — [`planung.ts`](supabase/functions/_shared/planung.ts) (Termine
> und Beschriftungen), [`zuteilungen.ts`](supabase/functions/_shared/zuteilungen.ts)
> (welche Plätze offen sind), [`rest.ts`](supabase/functions/_shared/rest.ts)
> (CORS, Antwortform, PostgREST) und [`push.ts`](supabase/functions/_shared/push.ts)
> (Web-Push samt Aufräumen abgelaufener Abos). Die letzten beiden standen bis
> T101 in bis zu fünf Abschriften nebeneinander und waren dabei schon
> auseinandergelaufen.
>
> ```bash
> curl -i -X POST https://<project-ref>.supabase.co/functions/v1/send-reminders
> ```
>
> Unter Windows PowerShell `curl.exe` schreiben — `curl` ist dort ein Alias für
> `Invoke-WebRequest` und versteht die Optionen nicht.

Danach funktioniert der Import-Button direkt (die App ruft die Function per
`functions.invoke` mit der Nutzer-Session auf). Die Function prüft selbst, wer
fragt: ein Mitglied einer Versammlung oder ein Wartungsskript mit
Secret-Schlüssel im `apikey`-Kopf. `verify_jwt` allein genügt dafür nicht — es
lässt auch den öffentlichen Publishable-Key durch (gemessen am 1.10.2026).
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

**Stand:** Angemeldet wird ohne Kennwort (T121, Phase 8): mit einem Link per
E-Mail oder einem Zettel mit QR-Code und Code (Function `anmelden`); eine
bestehende Session überspringt den Login. Nach dem Login werden alle Versammlungsdaten geladen (Rolle/
Versammlung aus `members`), Änderungen sofort zurückgeschrieben; eine leere
Versammlung zeigt Verkündigern den Hinweis auf den Koordinator, Planer füllen
sie über Personen und „Nächste Woche importieren" (angelegt wird sie mit
`scripts/versammlung-anlegen.mjs`, Demo-Daten gibt es dort seit dem 13.8.2026
nicht mehr, in der App seit dem 2.10.2026 gar keine). „Meine Aufgaben" entstehen aus den Zuteilungen der über
`members.person_id` verknüpften Person; Bestätigungen landen in
`confirmations`, Erinnerungen und Versammlungssprache in eigenen Spalten von
`congregations`. **Konten & Anmelde-Links laufen
personenzentriert im Personen-Screen:** Admin-Recht als feste Rolle im
Personen-Detail (gespiegelt in `members.planner`, vorgemerkt an der Person),
Konto-Karte mit „Link senden" (E-Mail über die Edge Function
`send-invite`/Resend, sobald das Secret `INVITE_FROM` mit verifizierter
eigener Domain gesetzt ist — sonst dieselbe E-Mail im eigenen Mail-Programm per
`mailto:`; oder ein Zettel mit QR-Code) und „Links senden" in der Liste. Das
Konto entsteht bei der ersten Anmeldung (Konto-Id = Person-Id, eine interne
Adresse unter `.invalid`, kein Kennwort), mit den vorgemerkten Rechten. Die
erste Versammlung samt erstem Admin legt `scripts/versammlung-anlegen.mjs` an;
den Notzugang stellt `scripts/zugang-ausstellen.mjs` aus.

**Das Schema hat genau eine Quelle: [`supabase/schema.sql`](supabase/schema.sql).**
Daneben lag bis zum 17. September 2026 eine Kette von 25 Migrationen, und jede
versicherte im Kopf „Neuinstallationen brauchen diese Datei nicht". Zwei Quellen
für dieselbe Sache laufen auseinander — was sie auch taten. Die Kette ist
gestrichen: Wer die Datenbank aufsetzt, führt `schema.sql` aus, sonst nichts.
Änderungen am Schema kommen dort hinein, und die Datenbank wird neu aufgesetzt
(die App ist noch nicht ausgerollt).

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
   Daten-Persistenz + Mitglieder-Verwaltung mit Anmelde-Links, siehe oben)
3. Mitteilungs-Versand: **umgesetzt als Web-Push** — Edge Function
   `send-reminders` (Browser-Benachrichtigungen + Glocken-Mitteilungen) +
   Cron-Template (siehe unten); Konfiguration/Aktivierung pro Projekt nötig
4. Konfliktprüfungen über Wochen hinweg: **umgesetzt** — Warn-Banner im Planen
   (abwesend trotz Zuteilung, mehrfach in einer Zusammenkunft, Wochen-Serie,
   sowie **Hilfsdienst + Programmpunkt am selben Tag**)

## App-Sprachen (12)

Die App-Oberfläche gibt es in 12 Sprachen — Deutsch und 11 Übersetzungen: die
meistgesprochenen in Deutschland (Türkisch, Russisch, Arabisch, Polnisch,
Englisch, Rumänisch, Ukrainisch, Italienisch, Persisch), dazu Französisch und
Spanisch. Bis zum 15.10.2026 waren es 34; gekürzt, damit weniger zu übersetzen
ist. Umschaltbar
im Login und im Profil. DE ist die Basis; fehlt eine Übersetzung, greift
Englisch als Fallback. Datums-/Wochentagsnamen der Zusatz-Sprachen kommen über
`Intl` (keine handgepflegten Listen). Getrennt davon ist die
**Versammlungssprache** (Programm-Inhalte) frei aus der vollen jw.org-Liste
wählbar. Neue App-Sprache hinzufügen: Code in `Lang` ([types.ts](src/data/types.ts))
+ `APP_LANGS` ([langs.ts](src/i18n/langs.ts)) + Locale in
[locales.ts](supabase/functions/_shared/i18n/locales.ts) + Overlay in
[ui.ts](src/i18n/ui.ts) und optional `FRAG`/`EXTRA` in
[translate-data.ts](supabase/functions/_shared/i18n/translate-data.ts)
(Rollen/Dienste/Phrasen). Die E-Mail mit dem Anmelde-Link steht im Overlay
(`linkMailBetreff`, `linkMailText`); für die Functions wird sie daraus nach
[_shared/anmelde-texte.ts](supabase/functions/_shared/anmelde-texte.ts)
abgeschrieben, und ein Test hält beide gleich.

Der Fragment-Übersetzer und die Locale-Tabelle liegen in
`supabase/functions/_shared/i18n/`, weil **beide Seiten** sie brauchen: der
Client beim Anzeigen, `send-reminders` beim Verschicken. `src/i18n/translate.ts`
reicht sie nur durch. Ausgehende Texte tragen ihre Sprache selbst — eine
verschickte Nachricht lässt sich beim Lesen nicht mehr übersetzen: die
Push-Erinnerung die des Geräts, die E-Mail mit dem Anmelde-Link und der Zettel
die der Versammlung (der Empfänger hat noch kein Konto und also auch keine
eingestellte Sprache) — außer beim Link, den jemand auf der Anmeldeseite selbst
anfordert: Der kommt in der Sprache, die er dort gewählt hat.

## Mitteilungen: wer wann was erfährt

Vier Kanäle mit je eigener Aufgabe — sie sauber zu trennen ist der Kern von T99:

| Kanal | wofür |
| --- | --- |
| **Bestätigungsblatt** beim Öffnen der App | handeln: offene Zuteilungen bestätigen oder absagen |
| **Push** | „schau jetzt hin" — führt über `#go=` in die App |
| **Glocke** (Mitteilungen) | „das ist passiert", als Verlauf; lädt beim Öffnen still nach — erst nur die Zeilen, den ganzen Bestand nur, wenn eine neue dabei ist |
| **Planen-Screen** | „das ist der Stand" — Konflikte, offene Plätze, Engpässe, „…" |

Und drei Takte:

1. **Auf Knopfdruck — „Plan senden".** Der Planer arbeitet die Woche fertig und
   gibt sie frei ([`supabase/functions/send-plan/`](supabase/functions/send-plan/)).
   Jede eingeteilte Person bekommt **eine** Nachricht mit allen ihren Aufgaben
   dieser Woche. Verschickt wird nur, was noch nicht verschickt war — das
   Versand-Tagebuch `assignment_log` merkt sich Platz und Name. Das Panel zeigt dem Planer, wie viele noch nichts wissen,
   wann zuletzt etwas hinausging und wen er mangels App-Konto persönlich
   ansprechen muss. Gelesen werden Bestätigungen und Tagebuch nur für **diese**
   Woche — die steht im Aufgaben-Schlüssel selbst, in zwei Formen
   (`<Montag>|…` und `fs|<Montag>|…`); beide Tabellen wachsen sonst ungebremst
   in jeden Knopfdruck hinein. Das **öffentliche Zeugnisgeben** (T120) hat einen
   eigenen Knopf (Aktion `zeugnis`): über alle kommenden Schichten statt je
   Woche, nur an Zugeteilte — wer sich selbst einträgt, hat damit zugesagt. Sein
   Schlüssel `oz|<Montag>|<Eintrag>` gehört deshalb nicht zu den Präfixen der
   Woche.
2. **Sofort.** Was eine Zusage bricht oder Eile hat: eine bestätigte Zuteilung
   wird zurückgezogen (`send-plan`, Aktion `entzug`), ein Hilfsdienst wird
   abgesagt und ein Ersatz gesucht, jemand springt ein — oder der Absagende
   kann doch, dann verschwindet das Gesuch wieder aus allen Glocken
   ([`substitute`](supabase/functions/substitute/)), eine Verhinderung wird an
   die Planer gemeldet. Ebenso das **Tauschen** (T153,
   [`tauschen`](supabase/functions/tauschen/)): die Anfrage an den Gefragten,
   seine Absage an den Fragenden, der Tausch an den Fragenden und die Planer —
   beide gelten danach als benachrichtigt (`assignment_log`). Im
   **Zeugnisgeben** (5.10.2026) heißt ein Entzug
   „Schicht fällt aus", wenn die Schicht wegfällt (`entzug` mit `grund`), und
   eine neue Uhrzeit oder ein neuer Ort geht als „Schicht geändert" hinaus
   (Aktion `zeugnis-geaendert`) — beides an jeden, der von seinem Eintrag weiß,
   die Änderung erst, wenn die Eingabe ruht (`ozAenderungen` in `persist.ts`).

   Der Entzug wird an **einer** Stelle erkannt ([`persist.ts`](src/app/persist.ts),
   Vorher/Nachher-Vergleich der Woche) statt an jeder auslösenden Aktion — sonst
   fehlte irgendwann eine, und niemand merkte es. Alle Entzüge einer Änderung
   gehen in **einem** Aufruf hinaus und je Person als **eine** Nachricht: Eine
   Auto-Zuteilung fasst eine ganze Zusammenkunft an, `setAuxClass` und
   `fsRuleAdd` fassen alle 52 Wochen an. Damit das trägt, gelten zwei
   Regeln in [`plan-versand.ts`](src/data/plan-versand.ts): Wer **dieselbe
   Person** ist, entscheidet die Person-Id (am Anzeigenamen meldete das
   Berichtigen einer Schreibweise einen Entzug, und zwischen zwei Gleichnamigen
   umzuteilen meldete keinen), und den **Platz muss es noch geben** — fällt die
   Zusammenkunft aus oder ist die Zusätzliche Klasse abgeschaltet, ruhen die
   Zuteilungen, sie sind nicht verwaist.
3. **Täglich.** Die Erinnerungen an Unbestätigtes (siehe unten).

**Zuteilen selbst meldet nichts.** Bis T99 schrieb jeder Zuteilungsklick eine
Zeile „Zuteilung gesendet" in die Glocke der **Planer** — bei einer von Hand
geplanten Woche gut 35 Stück, für Klicks, die der Planer selbst getan hatte,
während die eingeteilte Person nichts erfuhr. Der Planer sieht den Stand seiner
Woche im Planen-Screen; die Nachricht geht an den, den sie angeht.

## Erinnerungs-Versand (Web-Push)

[`supabase/functions/send-reminders/`](supabase/functions/send-reminders/)
erinnert Mitglieder an noch **nicht bestätigte** Zuteilungen: per
**Web-Push-Benachrichtigung** (Ende-zu-Ende verschlüsselt, keine E-Mails, keine
Telefonnummern) und als Glocken-Mitteilung in der App. Läuft serverseitig mit
Service-Role und wird täglich per Cron ausgelöst
([`supabase/cron-reminders.sql`](supabase/cron-reminders.sql)).

Empfangen kann, wer im **Profil → Push-Mitteilungen** aktiviert hat (Abo je
Gerät in `push_subscriptions`).
Die App ist dafür eine PWA (`public/manifest.webmanifest` + `public/sw.js`);
auf dem iPhone gibt es Push erst, nachdem die App über Teilen → „Zum
Home-Bildschirm“ installiert wurde (iOS 16.4+).

Ablauf laut Einstellungen → ERINNERUNGEN (`settings.reminders`): erste
Erinnerung `first` Tage vorher, letzte `last` Tage vorher (jeweils Push +
Glocke), mit `repeat` zusätzlich täglich per Push an den Tagen **dazwischen**.
`repeat` ist **voreingestellt aus** (T99): Zwei Anstöße für eine Zuteilung
genügen, sieben Push-Nachrichten in Folge sind eine Zumutung — und wer dann
noch nicht reagiert hat, wird ohnehin den Planern gemeldet.
Nach `last` kommt nichts mehr — „letzte Erinnerung“ heißt letzte; wer auch am
Tag der Zusammenkunft erinnern will, setzt `last = 0`.
Bestätigt/verhindert beendet die Erinnerungen; Gastredner/Kreisaufseher und
Gruppen-Rotationen sind ausgenommen. Der Zusammenkunftstag wird aus
`meeting_times` gelesen („Di 19:00 · So 10:00“ → Di/So der Programmwoche).
Betrifft die Erinnerung genau **eine** Aufgabe, trägt die Glocken-Zeile deren
`task_key` — dann lässt sie sich an Ort und Stelle bestätigen.
Personen ohne verknüpftes App-Konto können nicht erinnert werden — steht ihre
letzte Erinnerung an, bekommen die Planer einen Sammel-Push **und** eine
Glocken-Zeile (ohne die zweite ging die Meldung an jedem Planer ohne Push-Abo
vorbei).

**Der Push-Text geht in der Sprache des Geräts hinaus** (`push_subscriptions.lang`),
Titel *und* Rumpf — er ist fertiger Text, sobald er das Gerät erreicht, und lässt
sich beim Lesen nicht mehr übersetzen. Die Glocken-Mitteilung dagegen bleibt
kanonisch deutsch: Sie wird beim Anzeigen übersetzt, also in der Sprache, die der
Empfänger *heute* eingestellt hat.

**Konfiguration (einmalig pro Projekt):**
- **Dry-Run ist Standard**: ohne Secret `SEND_PUSH=true` wird nichts versendet
  und nichts geschrieben — die Antwort enthält eine Vorschau.
- Secrets (`npx supabase secrets set NAME=wert --project-ref …`): `CRON_SECRET`,
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (Schlüsselpaar; der öffentliche steht
  zusätzlich als Konstante in [src/lib/push.ts](src/lib/push.ts)),
  `VAPID_SUBJECT` (mailto-URI), optional `APP_URL`.
- Deploy: `npx supabase functions deploy send-reminders --no-verify-jwt`, dann
  `cron-reminders.sql` mit Projekt-Ref + `CRON_SECRET` im SQL-Editor ausführen.
- Test: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<ref>.supabase.co/functions/v1/send-reminders`
  im Dry-Run prüfen, dann `SEND_PUSH=true` setzen.
- Das Zeitfenster nutzt `week.start` (ISO), das nur bei importierten Wochen
  gesetzt ist. Abgelaufene Push-Abos (404/410) räumt der Versand automatisch ab.

## Aufbewahrung (T125)

„Wir wollen ja keine Daten sammeln, die wir nicht brauchen." Zwei Fristen,
beide ab dem Montag der laufenden Woche gezählt
([`src/data/aufbewahrung.ts`](src/data/aufbewahrung.ts)):

| Frist | Was |
| --- | --- |
| **ein Jahr** | die Wochen und was zu ihnen gehört: Programm samt Zuteilungen (`weeks`), Treffpunkte (`fs_weeks`), Zusagen, Absagen (`absagen`), Versand-Tagebuch, Gruppenbesuche, vorgemerkte Vorträge, Weitere Pläne samt Einträgen — die gerechte Verteilung fragt, wer am längsten wartet; dazu die Abwesenheiten (ab ihrem Ende), mit denen die Auswertung rechnet; und die Anmeldung eines Geräts (`auth.sessions`, IP-Adresse und Browserkennung), wenn sie ein Jahr nicht benutzt wurde — das Gerät braucht danach einen neuen Link |
| **acht Wochen** | Mitteilungen, Erinnerungs-Tagebuch, der Grund einer Abwesenheit (ab ihrem Ende; der Lauf leert `absences.reason`), Trolley-Termine, abgelaufene Anmelde-Links, das Protokoll von Supabase Auth (`auth.audit_log_entries`: E-Mail und IP-Adresse je Anmeldung) |
| **ein Tag** | Fehlversuche beim Anmelden (IP-Adressen) |

Abwesenheiten und Absagen bleiben seit dem 17.10.2026 ein Jahr, für die
Auswertung (T126): Wer weg war, von dem erwartet sie für diese Zeit nichts, und
die Absagen zählt sie je Bereich. Eine Absage hält der Trigger
`confirmations_absage` fest, sobald ein Platz als „verhindert" gemeldet wird. Sie
bleibt, auch wenn der Platz danach neu besetzt wird; nimmt der Absagende sie
zurück, geht sie wieder. Lesen dürfen sie nur Admin und Planer, schreiben nur
der Trigger. Ebenso die Abwesenheiten über die acht Wochen hinaus: Was länger
vorbei ist, liest nur, wer zuteilt (`absences_select`), jeder andere nur die
eigenen (Review 17.10.2026).

Stammdaten (Personen, Haushalte, Gruppen, Dienste, Konten, Grundplan,
Trolleys, Push-Abos) haben kein Alter.

Das Protokoll von Supabase Auth schreibt dieses Projekt gar nicht erst in die
Datenbank (Dashboard: Authentication → Audit Logs, „Write audit logs to the
database" aus; die Tabelle war am 16.10.2026 leer). Die Regel greift, falls
jemand den Schalter einschaltet. Mitteilungen löscht der Erinnerungslauf schon
nach 30 Tagen, sobald er wirklich sendet (`SEND_PUSH`, `pruneNotifications` in
`send-reminders`); die acht Wochen sind für sie die Obergrenze.

Dieselbe Grenze gilt an drei Stellen:

- **Laden:** Die App holt nichts Älteres (`loadCongregationData`).
- **Aufräumen:** `public.alte_daten_loeschen()` in
  [`supabase/schema.sql`](supabase/schema.sql), einmal die Woche per pg_cron
  ([`supabase/cron-aufraeumen.sql`](supabase/cron-aufraeumen.sql)): montags um
  03:30 UTC, gleich nachdem die Grenzen weitergerückt sind. Der Lauf bleibt in
  der Datenbank, ohne Function und ohne Secret; aufrufen darf ihn nur der
  Zeitplan.
- **Importe:** NWS und jw.org holen nichts, was älter ist (`aufbewahrtAb`,
  `nichtVorDerFrist` in `scripts/gemeinsam.mjs`).

[`tests/aufbewahrung.test.ts`](tests/aufbewahrung.test.ts) hält die Fristen in
App und SQL gleich und verlangt für jede Tabelle im Schema eine Regel oder einen
Grund, warum sie keine braucht.

**Eingeschaltet am 16.10.2026:** erst das Schema, dann ohne Löschen
nachgesehen, was ginge (überall 0, ein alter Fehlversuch beim Anmelden), dann
`supabase/cron-aufraeumen.sql`. Der Probelauf geht jederzeit wieder:

```sql
select * from public.alte_daten_loeschen(true);  -- zählt nur
```

Gelöscht ist gelöscht: Was der Lauf entfernt, steht nur noch in den
Sicherungen von Supabase, solange diese reichen.
