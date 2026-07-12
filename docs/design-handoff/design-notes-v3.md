# JW Congregation Planner — Projektnotizen

## Zweck
Webseite (Handy + Desktop) zur Organisation der Zusammenkünfte einer Versammlung der Zeugen Jehovas: Programme anzeigen, Rollen/Aufgaben zuteilen, Personen verwalten, persönliche Abwesenheiten. Sprache: Deutsch.

## Anforderungen (vom Nutzer bestätigt)
- Zwei Meetings/Woche: „Unter der Woche“ (Leben-und-Dienst, Struktur lt. S-38: Eröffnung → Schätze aus Gottes Wort [Vortrag 10, Schätze graben 10, Bibellesung 4] → Uns im Dienst verbessern [Schulungsaufgaben, z. T. mit Partner] → Unser Leben als Christ [Lied, 1–2 Punkte, Versammlungsbibelstudium 30 mit Leiter+Leser] → Schlussworte) und „Wochenende“ (Vorsitz, Gebete, Öffentlicher Vortrag mit oft Gastredner, Wachtturm-Studium mit Leiter+Leser).
- Hilfsdienste: Ton/Video, Mikrofone, Zoom-Ordner, Eingangsordner, Saalordner (alle drei priv 'ordner'; Eingangsordner nutzt Datenkey 'ord'), Reinigung — Anzahl je Dienst konfigurierbar, eigene Dienste anlegbar (Einstellungen).
- Programme kommen aus dem Arbeitsheft auf jw.org (https://www.jw.org/de/bibliothek/jw-arbeitsheft/) und werden ohne Zuteilungen importiert (im Prototyp simulierter Button in Einstellungen; echte App: automatischer Import, technisch/rechtlich zu klären).
- Login nötig; Admin-Bereich (Personen anlegen, Aufgabenbereiche/Privilegien, Stammdaten); persönlicher Bereich (nächste Aufgaben, Abwesenheiten eintragen — Liste UNTER dem Eintragen-Button); Mitteilungen/Erinnerungen (Zuteilung erzeugt Mitteilung).
- Zielgruppe: alle Verkündiger lesen, wenige planen. Mobile first (430 px), Desktop ab 920 px mit Seitenleiste.
- Planen-Tab: Slots antippen → nur qualifizierte Personen, Abwesenheits-Sperre, Auslastung („N Aufgaben in 4 Wochen“, „frei“-Chip); Button „Automatisch zuteilen“ (geringste Auslastung, keine Doppelbelegung, Gastredner-Slots bleiben offen).

## Design (gewählt: Option „2a Programmheft, getönte Flächen“)
- Edel/ruhig: Elfenbein, Serifen (Newsreader) + IBM Plex Sans, Bronze-Akzent.
- Bereichsfarben nach Arbeitsheft-Logik: Petrol=Schätze, Gold=Dienst, Weinrot=Leben als Christ, Neutral=Eröffnung/Abschluss/Hilfsdienste.
- Theming via CSS-Variablen, per JS auf document.body gesetzt (THEMES light/dark in der Logik-Klasse). Dark = warmes Schwarzbraun + Gold. Umschalter: Meine Aufgaben → Profil → Darstellung; Tweak „darstellung“.
- Token: --bg --card --tNeu --tNeu2 --tPet --tGld --tWein --ink --mut --mut2 --acc --accD --pet --gld --wein --line --line2 --bord* --dash --weinB --knob --onAcc --hov --line{Neu,Pet,Gld,Wein} --focus.

## Dateien
- `Designvorschlaege.dc.html` — Options-Canvas: Turn 1 (1a Programmheft / 1b Mitternacht dunkel+Zeitleiste / 1c Klartag hell-App), Turn 2 (2a getönte Flächen / 2b farbige Kante / 2c Kapitelbänder). Nutzer wählte 2a. Nutzer-Edits an 1b-Zeiten nicht überschreiben.
- `Prototyp 2a.dc.html` — v1 (Login, Programm 4 Wochen, Meine Aufgaben, Personen-Admin, Mitteilungen).
- `Prototyp 2a v2.dc.html` — v1 + Planen (inkl. Auto-Zuteilung), Desktop-Sidebar, Einstellungen (Hilfsdienste konfigurierbar + Programm-Import), Dark Mode, Abwesenheiten-Liste unter Button, größere gold gefüllte Wochen-Blätter-Buttons (36 px).
- `Prototyp 2a v3.dc.html` — AKTUELL. v2 + Mehrsprachigkeit (siehe unten).
- `i18n.js` — ES-Modul (dynamischer Import aus v3): UI-Wörterbücher en/es/fr, Programm-Fragment-Übersetzer `makeTr(code)` (Muster für Lieder, Daten, Zeiten, „mit X“, Referenzen), komplette „LESEN IN“-Sprachliste von jw.org (~370 Einträge, deutsche Bezeichnungen). Deutsches UI-Wörterbuch liegt inline in der v3-Logik (`DE`).

## Mehrsprachigkeit (v3)
- App-Sprache (UI): Deutsch/English/Español/Français. Umschalten: Login-Screen (Chips), Meine Aufgaben → Profil → Sprache, Tweak `sprache` (NICHT in Einstellungen — dort nur Versammlungssprache). Offizielle S-38-Begriffe verwendet (z. B. „Uns im Dienst verbessern“ = „Apply Yourself to the Field Ministry“ = „Seamos mejores maestros“ = „Applique-toi au ministère“; „Interesse fördern“ = „Following Up“ = „Haga revisitas“ = „Entretiens l’intérêt“).
- Versammlungssprache: Einstellungen → SPRACHE → Versammlungssprache öffnet durchsuchbares Sheet mit der kompletten jw.org-Liste; bestimmt die Sprache der Programm-Inhalte (Arbeitsheft-Import). Wochendaten bleiben kanonisch Deutsch und werden beim Rendern via `makeTr` übersetzt (nur de/en/es/fr); andere Sprachen → Hinweis-Chip „Demo … Anzeige auf Deutsch“ (progFallback) in Programm + Einstellungen.
- Interne Konvention: Personen-Rollen, Dienste, Wochen-/Notif-Strings bleiben als deutsche kanonische Daten gespeichert; Übersetzung nur bei Anzeige (trU = App-Sprache für UI-nahe Daten, trP = Versammlungssprache für Programm).

## Kreisaufseher-Woche & LAC-Bearbeitung (v3)
- Woche 3 (21.–27. Sep) hat `co: true`: Chip „BESUCH DES KREISAUFSEHERS“ (tPet) in Programm+Planen unter der Wochenzeile. Unter der Woche ersetzt ein Dienstvortrag („Lauft so, dass ihr den Preis gewinnt“, K. Wagner, Rolle 'Kreisaufseher', priv null) das Versammlungsbibelstudium; am Wochenende hält der Kreisaufseher den Öffentlichen Vortrag, WT-Studium 30 Min., danach eigene Sektion DIENSTVORTRAG (gld, „Bleibt in Gottes Liebe“). autoAssign überspringt Rollen mit Gastredner|Kreisaufseher.
- „Unser Leben als Christ“ ist im Planen-Tab editierbar: je Programmpunkt Minuten-Stepper (±5, 5–45 Min.), ✕ Entfernen und ▲▼ rechts neben dem Titel zum Umsortieren (lacMove: tauscht Nicht-Lied-Items, Nummern bleiben positionsfest; deaktiviert = bord3); unten Eingabefeld „+ EINFÜGEN“ (neuer Punkt 10 Min., wird vor dem Versammlungsbibelstudium eingefügt). Änderungen verschieben „Ende ca. HH:MM“ via shiftEnd(). Funktionen lacAdjust/lacRemove/lacAdd/lacMove; editable = Sektion 'UNSER LEBEN ALS CHRIST' + meta enthält 'N Min.'.

## Gedächtnismahl-Woche (v3)
- Woche 4 (28. Sep – 4. Okt) hat `mem: true, memCancel: 'we'`: Chip „GEDÄCHTNISMAHL“ (tWein, isMemWeek, Co-Chip-Muster) in Programm+Planen. memCancel benennt die ausfallende Zusammenkunft ('mid'|'we'); auf deren Tab erscheint in Programm+Planen ein tWein-Banner „Zusammenkunft „{m}“ entfällt … stattdessen Gedächtnismahl“ + Datum (memNotice/memNoticeText/memNoticeDate, UI-Key memAusfall), und der Tab zeigt statt des normalen Programms nur das Gedächtnismahl: Sa 3. Okt 19:30 „— nach Sonnenuntergang“, Ende ca. 20:30; ERÖFFNUNG → GEDÄCHTNISMAHL (wein: „Gedächtnismahl-Ansprache — „Schätze Jehovas größtes Geschenk““, F. Neumann Redner; „Symbole herumreichen“, meta „Brot · Wein“, 4 ordner-Slots) → ABSCHLUSS. Die andere Zusammenkunft der Woche bleibt unverändert. Fragmente en/es/fr in i18n.js (GEDÄCHTNISMAHL, Ansprache, Titel, Symbole, Brot, Wein, Redner, nach Sonnenuntergang), UI-Key memWoche.

## S-89-Ansicht (v3)
- Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“) als Sheet (z-index 38/39, über dem Zuteilungs-Sheet): Felder Name, Gesprächspartner/in (falls vorhanden), Datum, Aufgabe (inkl. Rahmen), Schulungspunkt (th/lmd aus meta geparst), Durchzuführen im Hauptsaal + Hinweistext. Alle Feldnamen übersetzt (offizielle Begriffe: EN „Our Christian Life and Ministry Meeting Assignment“, ES „Asignación …“, FR „Devoir d’élève …“).
- Öffnen: Meine Aufgaben → Schulungsaufgaben-Zeilen („S-89 anzeigen ›“, Demo-Daten mit s89-Payload) und Planen → Zuteilungs-Sheet → Link „S-89 anzeigen“ neben „Entfernen“ (nur bei besetzten Schulungsaufgaben/Bibellesung: priv 'schulung' oder Titel beginnt mit „Bibellesung“; Leser/Leiter zählen nicht).

## Bestätigungs-Flow (v3)
- Zuteilungen an den Nutzer haben Status offen/bestätigt/verhindert (state.myTasks, Demo: a1+a2 offen, a3 bestätigt).
- Modal „Bitte bestätige deine Zuteilungen“ (z-index 42/43, kein Backdrop-Close, kein ✕) erscheint beim Öffnen der App (doLogin bzw. skipLogin-Mount), solange offene Aufgaben existieren; je Aufgabe „✓ Bestätigen“ oder „Ich bin verhindert“ (→ Notif „Verhinderung gemeldet“ an Koordinator). Schließt automatisch, wenn nichts mehr offen ist.
- Bestätigen auch unter Meine Aufgaben (Button je Zeile) und in der Mitteilung (notif.taskId → Inline-Button).
- Planen: besetzte Slots zeigen ✓ (bestätigt, petrol) oder … (wartet, muted) via state.pendingNames (Seed: S. Krüger, J. Roth, E. Brandt); Legende unter „Automatisch zuteilen“. assignTo/autoAssign setzen neu Vergebene auf pending; Bestätigung aller eigenen Aufgaben entfernt S. Krüger daraus.
- Erinnerungszeitpunkte konfigurierbar: Einstellungen → ERINNERUNGEN (tWein-Karte vor PROGRAMM-IMPORT): fix „Bei Zuteilung – Sofort“, Stepper „Erste Erinnerung“ (1–21 Tage vorher, Default 7) und „Letzte Erinnerung“ (0–7, Default 1, 0 = „Am Tag der Aufgabe“), Toggle „Täglich wiederholen, bis bestätigt“ (state.reminders {first,last,repeat}, nur Demo-Setting ohne Auswirkung).

## Demo-Daten/Konventionen (v2)
- Eingeloggter Nutzer: Simon Krüger („SK“, „DU“-Chip, mine: n==='S. Krüger').
- Wochen 0–3 fest (7.–13. Sep bis 28. Sep–4. Okt 2026, Jeremia 32–45; Woche 1 = „7.–13. September“ mit echten Arbeitsheft-Inhalten), Import fügt Woche 4 (5.–11. Okt) ohne Zuteilungen hinzu.
- Personen mit priv-Flags (vorsitz, vortrag, gebet, lesen, schulung, studium, mikrofon, ton, ordner) und absent:[Wochen-Indizes]. Reinigung über „Gruppe 1–3“.
- Tweaks: skipLogin (bool), demoRolle (Koordinator|Verkündiger — Verkündiger blendet Planen/Personen/Einstellungen aus), darstellung (Hell|Dunkel), sprache (Deutsch|English|Español|Français).
- Alles In-Memory, keine Persistenz (Demo).

## Offene Ideen
Echter jw.org-Import, Persistenz/echtes Login, echte Push-Benachrichtigungen (Demo simuliert nur In-App), PDF-Aushang-Export, Konfliktwarnungen über Wochen hinweg.
