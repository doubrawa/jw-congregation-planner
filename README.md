# Congregation Planner

Web-App (Deutsch, Mobile-first + Desktop) zur Organisation der Zusammenkünfte
einer Versammlung: Wochenprogramme anzeigen, Aufgaben/Rollen zuteilen (mit
Qualifikations-, Abwesenheits- und Auslastungsprüfung inkl. Auto-Zuteilung),
Personenverwaltung, persönlicher Bereich (eigene Aufgaben/Abwesenheiten),
Mitteilungen und Einstellungen.

> **© Alle Rechte vorbehalten — keine Lizenz zur Nachnutzung.**
> Dieses Repository ist nur zur Einsicht öffentlich. Der Quellcode ist **nicht**
> unter einer Open-Source-Lizenz freigegeben: Kopieren, Weiterverwenden,
> Verändern oder Betreiben durch Dritte ist nicht gestattet. „Öffentlich
> sichtbar" bedeutet nicht „frei nutzbar".

> **Status: Alle Screens + v3-Funktionen gebaut.** Shell, Login, Programm,
> Planen (Zuteilungs-Sheet, Auto-Zuteilung, LAC-Bearbeitung), Aufgaben,
> Personen und Einstellungen sind gemäß [Design-Handoff](docs/design-handoff/README.md)
> umgesetzt. Dazu die **v3-Funktionen**: Kreisaufseher- und Gedächtnismahl-Woche,
> Bestätigungs-Flow (Zuteilungen bestätigen/verhindern), S-89-Formular,
> konfigurierbare Erinnerungen und **Mehrsprachigkeit** (Oberfläche in
> 34 Sprachen, separate Versammlungssprache für die Programm-Inhalte). Mit
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
  Telefon und E-Mail bleiben: Offline ist die Nummer oft der Grund, die App
  überhaupt zu öffnen.

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
Trigger — nicht vom Client, sonst schriebe man sich daran vorbei,
[migration-016](supabase/migration-016-wochen-stand.sql)):

1. Beim Laden merkt sich der Client den Stand je Woche.
2. Beim Speichern nennt er ihn als Bedingung. Trifft er noch zu, wird
   geschrieben und der neue Stand übernommen.
3. Trifft er nicht mehr zu, wurde **nichts** überschrieben. Der Client lädt
   still neu und sagt es dem Nutzer.

Vor Schritt 3 wird nachgesehen, ob dort wirklich ein fremder Stand steht: ein
falscher Konfliktalarm würde die Arbeit des Nutzers verwerfen, und dieser eine
zusätzliche Umlauf kostet nur in genau dem Fall etwas. Schreibvorgänge derselben
Woche laufen hintereinander, sonst kämpfte man gegen sich selbst.

Zum Nachstellen ohne Netzabbruch: Debug-Hash `#stale=<Stunden>` (nur DEV, siehe
[docs/user-guide/README.md](docs/user-guide/README.md)).

## Logo & App-Icons

Einzige Quelle ist **[`public/logo.svg`](public/logo.svg)** (Vektor, `viewBox` eng um
das Motiv). Alles andere wird daraus erzeugt — die PNGs nie von Hand bearbeiten:

```bash
npm run icons    # scripts/make-icons.mjs, rendert mit Chrome (headless)
```

| Datei | Größe | Zweck |
| --- | --- | --- |
| `logo.svg` | Vektor | Sidebar, mobiler Header, Login, SVG-Favicon |
| `icon-192.png` | 192² | Manifest `any`, PNG-Favicon-Fallback, Push-Notification |
| `icon-512.png` | 512² | Manifest `any` |
| `icon-512-maskable.png` | 512² | Manifest `maskable` (Motiv in der Safe-Zone) |
| `apple-touch-icon.png` | 180² | iOS-Home-Bildschirm (kein SVG, keine Transparenz) |

Die Polsterung je Ziel steht als `share` in `scripts/make-icons.mjs`. Gerendert
wird mit Chrome, weil das Logo Gradienten und einen `feDropShadow` nutzt.

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
    ui.ts           UI-Wörterbücher (34 Sprachen) + Schlüssel-Maps
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
scripts/
  make-icons.mjs    Erzeugt die App-Icons aus public/logo.svg (npm run icons)
docs/
  design-handoff/   Maßgebliche Design-Referenz (README, HTML-Prototypen, Screenshots)
  user-guide/       Benutzerhandbücher (Planer/Verkündiger) + Auto-Screenshots
supabase/
  schema.sql        DB-Schema (Tabellen + RLS + Funktionen), im SQL-Editor ausführen
  migration-*.sql   Nachzügler-Migrationen für früher eingerichtete Datenbanken
.github/workflows/
  deploy.yml        Auto-Deployment auf GitHub Pages (reicht Supabase-Secrets durch)
```


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
App-Oberfläche deckt davon 34 Sprachen ab). Programm-Inhalte (Titel, Lieder,
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
Versammlungssprache in `congregations.settings`. **Konten & Einladungen laufen
personenzentriert im Personen-Screen:** Admin-Recht als feste Rolle im
Personen-Detail (gespiegelt in `members.planner`, migration-006), KONTO-Karte
mit Einladen-Aktion (E-Mail über die Edge Function `send-invite`/Resend, sobald
Secret `INVITE_FROM` mit verifizierter eigener Domain gesetzt ist — sonst
Fallback aufs eigene Mail-Programm per `mailto:`; ohne E-Mail-Adresse
Teilen/Kopieren) und „Alle ohne Konto einladen" in der Liste. Neue Mitglieder
registrieren sich in der App und lösen ihren Code ein (`redeem_invite`). Nur
die allererste Versammlung + Koordinator-Mitgliedschaft entsteht per SQL
(siehe Ende der `schema.sql`). Bereits eingerichtete Datenbanken einmalig mit
den `supabase/migration-*.sql`-Dateien nachziehen (in Nummern-Reihenfolge).
Nicht `migration-00*` — das Muster übergeht alles ab der zehnten, und darunter
sind die Treffpunkte und sämtliche Rechteverschärfungen.

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
3. Mitteilungs-Versand: **umgesetzt als Web-Push** — Edge Function
   `send-reminders` (Browser-Benachrichtigungen + Glocken-Mitteilungen) +
   Cron-Template (siehe unten); Konfiguration/Aktivierung pro Projekt nötig
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
+ `APP_LANGS` ([langs.ts](src/i18n/langs.ts)) + Locale in
[locales.ts](supabase/functions/_shared/i18n/locales.ts) + Overlay in
[ui.ts](src/i18n/ui.ts) und optional `FRAG`/`EXTRA` in
[translate-data.ts](supabase/functions/_shared/i18n/translate-data.ts)
(Rollen/Dienste/Phrasen) sowie die zwei Sätze der Einladungs-Mail in
[send-invite/texte.ts](supabase/functions/send-invite/texte.ts).

Der Fragment-Übersetzer und die Locale-Tabelle liegen in
`supabase/functions/_shared/i18n/`, weil **beide Seiten** sie brauchen: der
Client beim Anzeigen, `send-reminders` beim Verschicken. `src/i18n/translate.ts`
reicht sie nur durch. Ausgehende Texte tragen ihre Sprache selbst — eine
verschickte Nachricht lässt sich beim Lesen nicht mehr übersetzen: die
Push-Erinnerung die des Geräts, die Einladungs-Mail die der Versammlung (der
Empfänger hat noch kein Konto und also auch keine eingestellte Sprache).

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
   Versand-Tagebuch `assignment_log`
   ([migration-024](supabase/migration-024-zuteilungs-tagebuch.sql)) merkt sich
   Platz und Name. Das Panel zeigt dem Planer, wie viele noch nichts wissen,
   wann zuletzt etwas hinausging und wen er mangels App-Konto persönlich
   ansprechen muss. Gelesen werden Bestätigungen und Tagebuch nur für **diese**
   Woche — die steht im Aufgaben-Schlüssel selbst, in zwei Formen
   (`<Montag>|…` und `fs|<Montag>|…`); beide Tabellen wachsen sonst ungebremst
   in jeden Knopfdruck hinein.
2. **Sofort.** Was eine Zusage bricht oder Eile hat: eine bestätigte Zuteilung
   wird zurückgezogen (`send-plan`, Aktion `entzug`), ein Hilfsdienst wird
   abgesagt und ein Ersatz gesucht, jemand springt ein
   ([`substitute`](supabase/functions/substitute/)), eine Verhinderung wird an
   die Planer gemeldet.

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
Gerät in `push_subscriptions`, [migration-005](supabase/migration-005-push.sql)).
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
- `migration-005-push.sql` im SQL-Editor ausführen (Tabelle + RLS).
- Deploy: `npx supabase functions deploy send-reminders --no-verify-jwt`, dann
  `cron-reminders.sql` mit Projekt-Ref + `CRON_SECRET` im SQL-Editor ausführen.
- Test: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<ref>.supabase.co/functions/v1/send-reminders`
  im Dry-Run prüfen, dann `SEND_PUSH=true` setzen.
- Das Zeitfenster nutzt `week.start` (ISO), das nur bei importierten Wochen
  gesetzt ist. Abgelaufene Push-Abos (404/410) räumt der Versand automatisch ab.
