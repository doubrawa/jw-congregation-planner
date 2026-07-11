# Handoff: JW Congregation Planner — Zusammenkunfts-Planer

## Überblick
Web-App (Deutsch, Mobile-first + Desktop) zur Organisation der Zusammenkünfte einer Versammlung der Zeugen Jehovas:

- Wochenprogramme anzeigen (Zusammenkunft unter der Woche „Leben und Dienst“ + Wochenende)
- Aufgaben/Rollen planen und zuteilen (mit Qualifikations-, Abwesenheits- und Auslastungsprüfung, inkl. Auto-Zuteilung)
- Personenverwaltung (Stammdaten, Rolle, Aufgabenbereiche)
- Persönlicher Bereich (eigene Aufgaben, Abwesenheiten)
- Mitteilungen (Zuteilung erzeugt Benachrichtigung)
- Einstellungen (Hilfsdienste konfigurierbar, Programm-Import)

## Zu den Design-Dateien
Die Dateien in `design/` sind **Design-Referenzen, erstellt in HTML** — klickbare Prototypen, die Aussehen und Verhalten zeigen. Sie sind **kein Produktionscode**. Aufgabe: Diese Designs in der Zielumgebung des Projekts nachbauen (React, Vue, SwiftUI, …) mit deren etablierten Patterns und Bibliotheken. Existiert noch keine Codebase, das passendste Framework wählen (Empfehlung: Web-App mit React o. Ä., da Login/Server nötig) und die Designs dort umsetzen.

Die `.dc.html`-Dateien direkt im Browser öffnen (mit `support.js` im selben Ordner). Maßgeblich ist **`Prototyp 2a v2.dc.html`**. Struktur der Dateien: HTML-Template (alle Styles inline) + eine JS-Logikklasse (State, Handler, Demo-Daten) am Dateiende — alle exakten Werte lassen sich dort nachschlagen.

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände, Radien und Interaktionen sind final gemeint und sollen pixelgenau übernommen werden. Demo-Daten (Namen, Wochen) sind Platzhalter; Datenmodell und Regeln darunter sind verbindlich.

## Informationsarchitektur
Bereiche (Navigation): **Programm** · **Aufgaben** (persönlich) · **Planen** · **Personen** · **Einstellungen**. Die letzten drei sind nur für Planer/Koordinatoren sichtbar (Rechtemodell). Mobile: Bottom-Nav (Punkt-Indikator über aktivem Label). Desktop (Breakpoint **≥ 920 px**): linke Seitenleiste 232 px (Wortmarke, Navigation als Pills, unten Profil + Abmelden), Inhaltsspalte max. 660 px; mobil max. 430 px, zentriert auf „Schreibtisch“-Hintergrund.

## Screens

### 1. Login
- Zentriert: Eyebrow „JW“ (10 px, 600, letter-spacing 0.22em, Akzentfarbe), Wortmarke „Congregation Planner“ (Newsreader 34 px, 500, zweizeilig), kursiver Untertitel „Versammlung Musterstadt“.
- Felder E-Mail/Passwort: Label 10 px caps (letter-spacing 0.14em, muted), Input 14 px, padding 12/14, radius 10, border 1 px `--bord`, bg `--card`.
- Primärbutton „ANMELDEN“: Vollbreite Pille (radius 999), bg `--acc`, Text `--onAcc` 12.5 px 600 ls 0.08em, hover bg `--accD`.
- Im Prototyp ohne echte Auth — Produktion: echtes Login (E-Mail+Passwort, Passwort-Reset), Daten versammlungsintern geschützt.

### 2. Programm (Startscreen)
- Wochen-Navigation: runde Blätter-Buttons ‹ › **36 px**, bg `--tGld`, border 1 px `--acc`, Pfeil `--acc` 19 px 600, Schatten 0 1 3 rgba(30,25,15,0.12); hover: bg `--acc`, Pfeil `--onAcc`; an den Enden opacity 0.35 (disabled). Mittig: Wochenbereich (Newsreader 24 px) + Bibelbuch kursiv (14 px, muted). Chip „AKTUELLE WOCHE“ (Pille, bg `--tGld`, Text `--acc` 10 px 600 ls 0.1em) nur bei aktueller Woche.
- Tabs „Unter der Woche“ / „Wochenende“: Textreiter 12.5 px 600, aktive Unterkante 2 px `--acc`, inaktiv muted.
- Meta-Zeile: „Dienstag, 8. September · 19:00 · Königreichssaal“ (12 px muted).
- **Bereichs-Panels** (Kernmuster, radius 16, padding 6/14): getönte Flächen mit Caps-Label (10 px 600 ls 0.16em) in Bereichsfarbe. Farb-Logik wie Arbeitsheft: ERÖFFNUNG/ABSCHLUSS neutral (`--tNeu`/Label `--mut`), SCHÄTZE AUS GOTTES WORT petrol (`--tPet`/`--pet`), UNS IM DIENST VERBESSERN gold (`--tGld`/`--gld`), UNSER LEBEN ALS CHRIST weinrot (`--tWein`/`--wein`), HILFSDIENSTE neutral (`--tNeu2`).
- Programmpunkt-Zeile: Grid `20px 1fr auto` (ohne Nummer `1fr auto`), Trennlinie 1 px in Bereichs-Hairline (`--line{Neu,Pet,Gld,Wein}`), letzte Zeile ohne. Links: Nummer kursiv serif in Bereichsfarbe. Mitte: Titel Newsreader 15 px 500 lh 1.35 + Meta 11.5 px muted (Dauer, Quelle, Rahmen z. B. „Von Haus zu Haus · 3 Min.“). Rechts: Name(n) 12.5 px 600 rechtsbündig, Rollenlabel darunter 11 px muted (Vorsitz, Gebet, Leiter, Leser, „mit A. Hoffmann“, „Gastredner · Vers. Nordheim“); mehrere Namen mit 5 px Abstand. Eigene Aufgabe: Chip „DU“ (Pille bg `--acc`, Text `--onAcc` 9 px 600 ls 0.08em) vor dem Namen. Offene Slots: „— offen —“.
- Lieder zwischen Punkten: zentriert, Newsreader kursiv 13 px muted.
- Hilfsdienste-Panel: 2-spaltiges Grid, je Zelle Caps-Label 9.5 px + Namen 12.5 px 600 („J. Roth · B. Klein“, fehlende Plätze „offen“).
- Fußzeile: „Ende ca. 20:45“ / „Stand: …“ (11 px muted).

### 3. Planen (nur Planer)
- Kopf: Titel (Newsreader 26 px) + rechts „N offene Zuteilungen“ (11.5 px muted); Wochen-Navigation + Tabs wie Programm; Hinweiszeile 11.5 px muted.
- Button „AUTOMATISCH ZUTEILEN“ (Vollbreite Pille, bg `--acc`, hover `--accD`).
- Bereichs-Panels wie Programm, aber je Punkt: Titel + Meta, darunter **Slot-Chips** (flex-wrap, gap 6): belegt = Pille bg `--card`, border solid `--bord`, Text `--ink` 11.5 px 600, Rollenpräfix („Leiter: F. Neumann“); offen = border dashed `--dash`, Text `--mut`, „— zuteilen“. Hover: border `--acc`.
- Hilfsdienste: je Dienst Label + so viele Chips wie in Einstellungen konfiguriert.
- **Zuteilungs-Sheet** (Chip-Tap): mobil Bottom-Sheet (radius 18 18 0 0, Breite ≤ 430), Desktop zentriertes Modal (radius 18, Breite ≤ 480); Backdrop rgba(30,25,15,0.32); max-height 74vh, scrollbar. Kopf: Slot-Titel (Newsreader 18 px) + Untertitel Woche/Meeting + ✕. Bei belegtem Slot Zeile „Aktuell: <Name>“ (bg `--tNeu`, radius 12) mit „Entfernen“ (Text `--wein`). Kandidatenliste (nur qualifizierte Personen): Grid 36 px Avatar (Initialen, bg `--tNeu`, Text `--acc`) + Name 13 px 600 + Sub „Rolle · N Aufgaben in 4 Wochen“ 11 px muted + Status-Chip: „frei“ (bg `--tPet`, Text `--pet`, bei 0 Aufgaben) oder „Abwesend“ (bg `--tWein`, Text `--wein`, Zeile opacity 0.45, Auswahl blockiert mit Toast). Abwesende ans Listenende sortiert. Auswahl = sofort zuteilen.
- Reinigungs-Slots: Kandidaten sind „Gruppe 1–3“.

### 4. Aufgaben (persönlicher Bereich)
- Titel + kursiver Untertitel (Name · Versammlung).
- Panel „NÄCHSTE AUFGABEN“ (gold): Zeilen Titel serif 15 + Datum 11.5 muted, rechts Countdown-Chip („in 4 Tagen“, bg `--acc`).
- Panel „ABWESENHEITEN“ (neutral): Formular VON/BIS (date-Inputs) + GRUND (optional) + Outline-Button „ABWESENHEIT EINTRAGEN“ (border/Text `--acc`, hover bg `--tGld`); **darunter** „DEINE EINTRÄGE“: Liste (Zeitraum serif + Grund muted, ✕-Rundbutton zum Löschen), Leerzustand kursiv „Keine Abwesenheiten eingetragen.“ Validierung: Von+Bis Pflicht (Toast).
- Panel „PROFIL“: Zeilen Name/Versammlung/Rolle, **Darstellung** Hell/Dunkel als Chips, „Abmelden“ (Text `--wein`, zentriert).

### 5. Personen (nur Planer)
- Liste: Titel + „N Personen“, Suchfeld (Pille, Live-Filter), Outline-Button „+ NEUE PERSON ANLEGEN“, Zeilen: Avatar 40 px (Initialen) + Name 14 px 600 + Sub „Rolle · N Aufgabenbereiche“ + Chevron ›; hover bg `--hov`.
- Detail: Backlink „‹ Alle Personen“, Avatar 54 px + Name (Newsreader 24 px) + Sub. Panel „STAMMDATEN“: Inputs Vorname/Nachname/Telefon/E-Mail; ROLLE als Chips (Ältester / Dienstamtgehilfe / Verkündiger; aktiv bg `--acc`). Panel „AUFGABENBEREICHE“ (petrol): 9 Toggles (Vorsitz, Vorträge, Gebete, Bibellesung/Leser, Schulungsaufgaben, Studium leiten, Mikrofone, Ton/Video, Ordner/Eingang) — Switch 40×22, Track an `--pet` / aus `--bord3`, Knopf 18 px `--knob`, transition 0.15 s. Button „SPEICHERN“ (kehrt zur Liste zurück, Toast „Gespeichert“). Neue Person: leerer Datensatz, Rolle Verkündiger.

### 6. Einstellungen (nur Planer)
- Panel „VERSAMMLUNG“: Name / Königreichssaal / Zeiten (Anzeige).
- Panel „HILFSDIENSTE“ (petrol): je Dienst Name + Sub (Bereich bzw. „Gruppen-Rotation“/„Alle Verkündiger“), Stepper − n + (26-px-Rundbuttons, min 1 / max 6) und ✕ (Rand `--weinB`, Text `--wein`). Zeile Textfeld + „+ HINZUFÜGEN“ für eigene Dienste. Änderungen wirken sofort auf Programm („offen“) und Planen (Slot-Anzahl).
- Panel „PROGRAMM-IMPORT“: Erklärtext (Programme stammen aus dem Arbeitsheft auf jw.org, Import **ohne Zuteilungen**), Statuszeile „Arbeitsheft Sep/Okt 2026 · N Wochen geladen“, Button „NÄCHSTE WOCHE IMPORTIEREN“ → Ladezustand „IMPORTIERE …“ (~0.9 s) → neue Woche hinten anfügen, Mitteilung erzeugen, danach „ALLE WOCHEN IMPORTIERT“.

### Overlays
- **Mitteilungen**: Kopf-Chip (ungelesen: „N neu“, bg `--tGld`, Text `--acc`; sonst Outline „Mitteilungen“) öffnet Panel (fixed top 60, Breite ≤ 390, radius 18, bg `--card`): Titel + „Alle gelesen“, Zeilen mit Ungelesen-Punkt 7 px `--acc`, Titel 13 px 600, Text 12 px muted, Zeit 10.5 px. Typen: „Neue Zuteilung“, „Erinnerung“, „Zuteilung(en) gesendet“, „Programm importiert“.
- **Toast**: fixed bottom 92 px zentriert, Pille bg `--ink`, Text `--onAcc` 12.5 px 600, Einblendung 0.2 s (translateY 8→0), auto-hide 2.4 s.

## Interaktionen & Verhalten (Kernregeln)
- Wochen blättern (Prototyp: 4 Wochen + 1 importierbare), Tabs pro Woche.
- Zuteilen: nur Personen mit passendem Aufgabenbereich; Abwesende blockiert; Auslastung = Namens-Vorkommen über alle geladenen Wochen.
- **Auto-Zuteilung** (je Woche+Meeting): alle offenen Slots; Kandidaten = qualifiziert + anwesend + noch nicht in diesem Meeting eingeteilt; wähle geringste Auslastung; Gastredner-Slots überspringen; Reinigung rotiert Gruppe (Wochenindex mod 3); danach Sammel-Mitteilung „N Zuteilungen · <Woche>“ + Toast.
- Jede manuelle Zuteilung erzeugt Mitteilung „Zuteilung gesendet · <Name> — <Slot> · <Woche>“ (Produktion: Push/E-Mail an die Person, min. 3 Wochen vorher, vgl. S-89-Formular).
- Rollen-Sichtbarkeit: Verkündiger sehen nur Programm + Aufgaben.
- Import: Programme kommen von jw.org (https://www.jw.org/de/bibliothek/jw-arbeitsheft/) — im Prototyp simuliert; Produktion: automatischer Abruf/Parsing zu klären (technisch + rechtlich/Nutzungsbedingungen).

## State (Prototyp-Logikklasse, als Referenz fürs Datenmodell)
- `screen`, `week`, `tab (mid|we)`, `vw` (Breakpoint), `theme (light|dark)`
- `weeks[]`: je Woche `{range, book, current, mid|we: {date, end, sections[], helpers{dienstKey: string[]}}}`; Section `{label, farbe, items[]}`; Item `{num?, title, meta?, song?, names: [name, rolle, bereichsKey][]}` — leerer Name = offener Slot
- `persons[]`: `{id, fn, ln, role, tel, mail, absent: [wochenIndizes], priv: {vorsitz, vortrag, gebet, lesen, schulung, studium, mikrofon, ton, ordner}}`
- `services[]` (Hilfsdienste): `{key, name, count, priv|null, groups?}`
- `absences[]` (eigene): `{id, from, to, reason}`
- `notifs[]`, `slotSel` (offenes Sheet), `toast`, `search`, Formularfelder, `importing/imported`
- Produktion: Persistenz (DB) + echtes Auth/Rollenmodell statt In-Memory + Tweaks (`skipLogin`, `demoRolle`, `darstellung` sind nur Demo-Schalter).

## Design-Tokens
Theming über CSS-Variablen (im Prototyp per JS auf `document.body`; in Produktion z. B. `[data-theme]`-Scope). Alle Flächen/Farben referenzieren ausschließlich Tokens.

| Token | Hell | Dunkel | Verwendung |
|---|---|---|---|
| desk/body | #E7E3DA | #0F0E0B | Hintergrund um die App |
| --bg | #F7F4ED | #1A1813 | App-/Sidebar-Fläche |
| --bgT | rgba(247,244,237,0.96) | rgba(26,24,19,0.96) | Sticky Header/Bottom-Nav |
| --card | #FDFBF5 | #221F18 | Inputs, Sheets, Chips |
| --tNeu / --tNeu2 | #EDE8DD / #ECE7DC | #242118 / #221F17 | neutrale Panels |
| --tPet | #E4EDEA | #1E2724 | Panel Schätze |
| --tGld | #F1E8D3 | #2A2418 | Panel Dienst, Akzent-Tint |
| --tWein | #F2E2DE | #2A1E1C | Panel Leben als Christ |
| --ink | #211C14 | #EDE9DE | Text |
| --mut / --mut2 | #756D5C / #9A9284 | #A79E8C / #7A7466 | Sekundärtext |
| --acc / --accD | #8A6A34 / #6E5326 | #C9A86A / #B08F52 | Akzent Bronze/Gold (+hover) |
| --pet / --gld / --wein | #446F6B / #96742C / #8E4A44 | #7FA89F / #C2A05C / #C08078 | Bereichsfarben |
| --line / --line2 | #E6DFCE / #EFE9DA | #2E2A20 / #282419 | Trennlinien |
| --bord / --bord2 / --bord3 / --bord4 | #E0D9C8 / #DDD6C6 / #D8D1C0 / #C9C2B0 | #3A3427 / #3A3427 / #403A2C / #4A4335 | Ränder |
| --dash | #B9AE96 | #5A5240 | offene Slots (dashed) |
| --weinB | #E4CCC7 | #4A322E | Lösch-Buttons Rand |
| --knob | #FFFDF6 | #FFFDF6 | Toggle-Knopf |
| --onAcc | #F7F4ED | #1A1813 | Text auf Akzent/Ink |
| --hov | rgba(237,232,221,0.5) | rgba(42,38,28,0.5) | Zeilen-Hover |
| --lineNeu/Pet/Gld/Wein | rgba(110,100,80,.16) / rgba(62,102,99,.14) / rgba(138,106,52,.16) / rgba(142,74,68,.14) | rgba(200,190,160,.12) / rgba(127,168,159,.16) / rgba(201,168,106,.16) / rgba(192,128,120,.16) | Hairlines in Panels |
| --focus | rgba(138,106,52,0.35) | rgba(201,168,106,0.4) | Input-Focus-Ring |

**Typografie**: Newsreader (Serif; 400/500/600 + kursiv) für Titel, Programmpunkt-Titel, Nummern, Zitate; IBM Plex Sans (400/500/600) für UI/Meta/Namen. Skala: 26/24 (Titel serif), 19/18 (Sheet/Planen-Woche), 15 (Punkt-Titel), 14/13/12.5 (UI), 11.5/11 (Meta), 10/9.5 (Caps-Labels, letter-spacing 0.12–0.22em). Zeilenhöhe Titel 1.3–1.35.
**Radien**: Panels 16 · Inputs 9–10 · Sheets/Overlays 18 · Pillen/Buttons 999 · Avatare 50 %.
**Abstände**: Screen-Padding mobil 22/20, Desktop 26/36; Panel-Padding 6/14; Zeilen-Padding 10–12/0; Panel-Abstand 12.
**Schatten**: App-Spalte 0 0 60 rgba(30,25,15,0.18); Overlays 0 24 48 rgba(30,25,15,0.25); Buttons ‹› 0 1 3 rgba(30,25,15,0.12).

## Assets
Keine Bilder/Icon-Fonts. Google Fonts: „Newsreader“ + „IBM Plex Sans“ (Lizenz OFL). Pfeile/✕ sind Textzeichen (‹ › ✕ –), Avatare = Initialen-Kreise, Logo = reine Wortmarke.

## Dateien in diesem Paket
- `design/Prototyp 2a v2.dc.html` — **maßgeblicher Prototyp** (alle Screens, beide Themes, gesamte Logik)
- `design/Prototyp 2a.dc.html` — Vorversion (Referenz)
- `design/Designvorschlaege.dc.html` — Design-Exploration (gewählt: Option „2a“)
- `design/support.js` — Laufzeit für die Prototyp-Dateien (nur zum lokalen Öffnen nötig, nicht portieren)

## Screenshots
Ordner `screenshots/` — Viewport-Ausschnitte (oberer Seitenbereich) zur schnellen Orientierung; maßgeblich sind die HTML-Prototypen:
01 Login · 02 Programm Woche · 03 Programm Wochenende · 04 Planen · 05 Zuteilungs-Sheet · 06 Aufgaben/Abwesenheiten · 07 Personenliste · 08 Personen-Detail · 09 Einstellungen (alle mobil hell) · 10–12 Programm/Planen/Aufgaben mobil dunkel · 13 Programm Desktop hell · 14 Einstellungen Desktop hell · 15 Planen Desktop dunkel.

## Offene Punkte für die Umsetzung
1. Echter Arbeitsheft-Import von jw.org (Format/Parsing, Nutzungsrechte klären)
2. Auth + Mandantenfähigkeit (mehrere Versammlungen), Rollen/Rechte
3. Persistenz, Mitteilungs-Versand (Push/E-Mail), S-89-konforme Zuteilungsbenachrichtigung
4. Konfliktprüfungen über Wochen hinweg (z. B. gleiche Person zu oft hintereinander)
