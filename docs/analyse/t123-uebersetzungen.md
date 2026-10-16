# T123 · Jede Übersetzung prüfen — Prüfliste

Aufgabe und Wortlaut stehen in `docs/analyse/todo.md` unter „T123". Hier steht,
was geprüft wurde, womit, was dabei herauskam und was offen bleibt.

Reihenfolge wie vorgegeben: erst Teil 2 (die Oberfläche) per Werkzeug, dann
Teil 1 (jede Übersetzung) Sprache für Sprache.

---

## Teil 2 · Wird in der Oberfläche jeder Text übersetzt?

Stand: 16. Oktober 2026.

### Das Werkzeug

| Datei | Was sie tut |
| --- | --- |
| `tests/oberflaeche-durchgang.test.tsx` | **Durchgang durch die ganze Oberfläche**: startet auf jedem Bildschirm, jedem Reiter und in 16 Sonderlagen (37 Starts), tippt von jeder neuen Ansicht aus jeden Knopf an, füllt jedes Textfeld (erfunden und leer), stellt jede Auswahl um — jedes Mal auf frisch gezeichneter App mit dem echten Reducer — und liest jede Ansicht ab. In der Suite: Ukrainisch, eine Ebene, zehn Starts (rund 15 s). Von Hand: `T123_SPRACHEN=alle T123_TIEFE=3 npx vitest run tests/oberflaeche-durchgang.test.tsx` (`T123_STARTS=…` für Teile, `T123_BERICHT=<Datei>` schreibt Blätter, Toasts und Befunde mit) |
| `tests/fremdsprachiger-bestand.ts` | Der Bestand der Entwicklerseite (`me=p9`, `konto=1`), in dem **nichts deutsch bleiben darf**: Namen, Freitext der Versammlung und Programmtext von jw.org werden zu erfundenen Folgen („Xabebo"); was der Fragment-Übersetzer in jeder App-Sprache kennt, bleibt als Vorlage kanonisch deutsch. Gruppennamen („Gruppe 1") bleiben, die App übersetzt sie |
| `tests/deutsch-erkennen.ts` | Der Prüfer. Kyrillisch und Arabisch (ru, uk, ar, fa): **jedes lateinische Wort** ist verdächtig — außer einer kurzen Liste mit Grund (Produktname, jw.org, PDF/XML/QR, S-89, Zoom, die Kürzel th/lmd/lff/wcg, die Namen der App-Sprachen). Lateinische Schrift: jedes Wort aus dem deutschen Wörterbuch oder den Programm-Begriffen, das die Zielsprache nicht kennt, und jeder Umlaut in einem fremden Wort. Abgelesen wird unter `body` (Blätter, Toasts und Druckbögen sind Portale): Text, `aria-label`, `title`, `placeholder`, `alt`, `aria-description`, `aria-roledescription`, `aria-valuetext`, Feldwerte |
| `src/mitteilungen/mitteilungen-fremdsprache.test.tsx` | **Jede Mitteilung, wie ihr Erzeuger sie schreibt**, in allen elf Sprachen: Rümpfe aus `offeneDerWoche` + `kanonisch` (send-plan, send-reminders), `trolleyRumpf`, den Atomen von `substitute` und dem Reducer selbst (Import, Absage) |

Erweitert:

- `src/i18n/oberflaeche-fremdsprache.test.tsx` liest jetzt unter `body` statt im
  Container — ein Blatt mit eigenem Zustand hängt sich als Portal an `body`,
  im Container stand davon kein Wort — und mit allen Attributen oben.
- `src/i18n/beschriftungen-quelle.test.ts` sieht jetzt auch **Wörter in
  Ausdrücken** der zugänglichen Beschriftungen (`aria-label={x ? 'Text' : …}`,
  `` title={`Woche ${n}`} ``) und einen `showToast` mit festem Satz.

### Die Durchgänge

| Sprache | Tiefe | Starts | Ansichten | Ergebnis |
| --- | --- | --- | --- | --- |
| uk | 3 | alle 37 (in neun Läufen) | rund 1 700, darunter 57 verschiedene Blätter, rund 20 Toasts, alle sechs Druckbögen | kein Deutsch |
| en es fr it pl ru ro tr ar fa (und uk) | 1 | alle 37 | je rund 255, je 52–53 Blätter, 7 Toasts, 4 Druckbögen | kein Deutsch |

Gewollt und nicht beanstandet: zwei Sprachnamen in der ukrainischen
Sprachliste („Cameroon Sign Language", „Swahili (Katanga)") — jw.org führt sie
auf Ukrainisch englisch, und die Liste ist dort abgelesen (siehe Teil 1,
Sprachnamen).

Was der Durchgang nicht erreicht und deshalb eigens geprüft ist: die Rümpfe
echter Mitteilungen (der Demo-Bestand schreibt sie von Hand, siehe unten), die
Meldungen der Functions (sie kommen als Schlüssel zurück — `lib/trolley.ts`,
`lib/import.ts`, `login/anmelde-fehler.ts` — und sind damit Wörterbuch,
Teil 1).

### Funde

| Nr. | Fläche | Sprachen | Befund | Behoben | Wache |
| --- | --- | --- | --- | --- | --- |
| 1 | **Mitteilungen** (Glocke): „Neue Zuteilung", „Zuteilung zurückgezogen", „Erinnerung: Zuteilung bestätigen", „Unbestätigte Zuteilungen (nicht erreichbar)" | alle elf | Die Bezeichnung jeder Aufgabe stand deutsch da: „Tuesday, September 8 · 19:00: **Bibellesung**", „… 09:30 · Kingdom Hall: **Treffpunkt-Leiter**". `send-plan` und `send-reminders` schreiben je Zeile Termin und Bezeichnung mit „: " verbunden (`kanonisch`); der Fragment-Übersetzer zerlegt an „ · " und fand „19:00: Bibellesung" in keinem Wörterbuch. Der Push war nie betroffen (er übersetzt die Hälften getrennt), der Demo-Bestand auch nicht — seine Rümpfe sind von Hand geschrieben | ja: `supabase/functions/_shared/i18n/translate.ts` — ein Atom mit „: " geht wie eines mit „ — " in seinen Hälften durch den Übersetzer | `src/mitteilungen/mitteilungen-fremdsprache.test.tsx` (ohne die Korrektur in allen elf Sprachen rot, von Hand gegengeprüft); Mutationsprobe `t123-glocke-termin-doppelpunkt`: bewacht |

### Offen aus Teil 2

- **Manifest und Seitenbeschreibung sind deutsch** (`public/manifest.webmanifest`
  `description`, `index.html` `<meta name="description">`, beide `lang: "de"`).
  Ein Manifest gibt es nur einmal; ein ukrainischer Nutzer sieht die
  Beschreibung beim Installieren deutsch. Abhilfe wäre je Sprache ein Manifest
  und ein `<link rel="manifest">`, den die App umstellt — eine Entscheidung,
  keine Korrektur. Nicht geändert.
- **Französischer Doppelpunkt in erzeugten Zeilen**: „mardi 8 septembre · 19:00:
  Lecture de la Bible" (Glocke und Push) — das „: " setzt der Code zwischen
  Termin und Bezeichnung, ohne das geschützte Leerzeichen davor. Ebenso in den
  zusammengesetzten `aria-label` (`${label}: ${t.bestaetigen}`). Nicht geändert;
  wäre eine Regel je Sprache im Übersetzer und in `uebersetzt`.
- **„Studienartikel 28"** übersetzt nur der Wörterbuch-Pfad (en, es, fr); der
  Kommentar „FEHLT HIER" in `translate.ts` beschreibt die Lücke. Kein Erzeuger
  der App schreibt den Verweis (nur die Testdaten), deshalb kein Befund.
- **„lmd Lektion 9"** (ältere Arbeitshefte ohne Punktnummer) kennt `REF` auf
  Türkisch nicht. Die heutigen Hefte schreiben „lmd Lektion 9 Punkt 3"; nicht
  gemessen, nicht geändert.

---

## Teil 1 · Jede einzelne Übersetzung

**So gelesen:** je Sprache alle 745 Schlüssel als Matrix — Schlüssel ·
Deutsch · Übersetzung · wo im Code verwendet (mit dem deutschen Kommentar in
`de.ts` daneben) —, dazu, was nicht im Wörterbuch steht: der FRAG-Block der
Sprache in `translate-data.ts`, ihre Verweis-Vorlagen (REF), Datum und
Kurzphrasen (D bzw. EXTRA, an Proben durch `makeTr` gelesen), die 66
Bibelbücher mit Kürzel und die Titel der Functions (`send-plan`,
`send-reminders`, `substitute`, `trolley`) samt Anmelde-Mail. Geändert wurde
nur, wo der alte Wert geprüft gleich war (Skript, idempotent); die
Anmelde-Mail der Functions entsteht danach neu aus dem Wörterbuch
(`scripts/anmelde-texte-erzeugen.mjs`).

Nebenbei gefunden, nicht geändert: `ansehen` und `zuteilenChip` benutzt kein
Code mehr (in allen zwölf Wörterbüchern), FRAG `Treffpunkte` und die Regel
„N Zuteilungen" (`zut`) erzeugt kein Erzeuger mehr — sie stehen nur noch für
alte Zeilen da.

### en · Englisch

16. Oktober 2026 · alle 745 gelesen · Anrede: du (you) · 27 Korrekturen im
Wörterbuch, 1 in FRAG.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `linkMailText` | … ⏎⏎the {versammlung} Congregation plans … | … ⏎⏎The {versammlung} Congregation plans … | Nach der Anrede beginnt der englische Brieftext groß (im Deutschen klein) |
| `fsShort` | Field Service | Meetings for field service | „Treffpunkte“ hieß wie das Thema „Predigtdienst“ (tabFs) — auf dem Treffpunkt-Bogen stand „Field service · Field Service“; jw.org: „meetings for field service“ |
| `toastFsRuleAdd` | Added to schedule | Added to base schedule | Der Grundplan heißt „Base schedule“ (fsGrundplan) |
| `toastFsRuleDel` | Removed from schedule | Removed from base schedule | wie toastFsRuleAdd |
| `vpVorgemerkt` | This week has not been loaded yet. The talk is entered as soon as its program is imported. | This week has not been created yet. The talk is entered as soon as its program has been fetched. | Deutsch sagt „angelegt“ und „geholt“ (seit Phase 10 heißt der Knopf „Fetch“) |
| `wpNamePhSaal` | e.g. Snow clearing | e.g., Snow clearing | „e.g.,“ wie in den übrigen Platzhaltern |
| `absageNachrichtBeispiel` | e.g. I’m away that day | e.g., I’m away that day | „e.g.,“ wie in den übrigen Platzhaltern |
| `personAnlegenHinweis` | You set the assignment areas on the person afterwards. | You can set the assignment areas on the person’s page afterwards. | „on the person“ ist kein Englisch; sonst überall „on the person’s page“ |
| `standDerAnmeldung` | Sign-in status | Login status | Anmelden heißt überall „Log in“ (anmeldenKnopf, angemeldetBleiben) |
| `standAngemeldet` | Signed in | Logged in | wie standDerAnmeldung |
| `kontenOhnePerson` | Accounts without person | Accounts without a person | Artikel fehlte |
| `spurErsatzGesucht` | Substitute sought | Substitute needed | Derselbe Stand heißt in der Mitteilung „Substitute needed“ (notifErsatzGesucht) |
| `absagen` | Cancel | Decline | Im Absage-Blatt standen zwei Knöpfe „Cancel“ — Absagen und Abbrechen (abbrechen); die Absage heißt sonst „declined“ (notifVerhindert, zusageAbgesagt) |
| `spurDuSagstAb` | You cancel | You decline | wie absagen |
| `ersatzHint` | If you cancel a support duty, a substitute is automatically sought among those qualified. | If you decline a support duty, a substitute is automatically sought among those qualified. | wie absagen |
| `toastErsatzGesucht` | Cancelled · a substitute is being sought | Declined · a substitute is being sought | wie absagen |
| `erinAbsage` | Cancellation | Declined assignment | wie absagen |
| `anlassMemText` | The meeting on this day is canceled | The meeting on this day is cancelled | sonst überall „cancelled“ |
| `erinMailNur` | The app only sends emails for invitations and for signing in. | The app only sends emails for invitations and for logging in. | Anmelden heißt überall „log in“ |
| `lacPh` | New item, e.g., local announcements | New part, e.g., local announcements | Programmpunkte heißen sonst „part“ (programmpunktEinfuegen, programmpunkteN) |
| `toastLacAdd` | Item inserted · times adjusted | Part inserted · times adjusted | wie lacPh |
| `toastLacDel` | Item removed · times adjusted | Part removed · times adjusted | wie lacPh |
| `ohneGruppeHint` | … under Field service. … | … under “Field service”. … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen |
| `suchen` | Search … | Search… | Auslassungspunkte ohne Leerzeichen wie in „Sending…“ |
| `langSearchPh` | Search languages … | Search languages… | wie suchen |
| `holtProgramm` | Fetching the program … | Fetching the program… | wie suchen |
| `laedt` | Loading … | Loading… | wie suchen |
| FRAG `Treffpunkte` | Field Service | Meetings for field service | wie `fsShort` (zweite Ablage desselben Worts) |

Daten gelesen: FRAG, REF, D, Bibelbücher (NWT-Kürzel, „Ca" für das Hohelied
ist das amtliche), Function-Titel — sonst nichts zu ändern.

Offen: keine. (Erwogen und gelassen: `fsFreqM1` „1st of the month" für „jeden
1. [Samstag] im Monat" — steht immer neben dem Wochentag und liest sich dort so.)

### es · Spanisch

16. Oktober 2026 · alle 745 gelesen · Anrede: tú, Gruppen „ustedes" (wie
jw.org) · 24 Korrekturen im Wörterbuch, 2 in FRAG.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `linkMailText` | … ⏎⏎la congregación {versammlung} organiza … | … ⏎⏎La congregación {versammlung} organiza … | Nach dem Doppelpunkt der Anrede beginnt der spanische Brieftext groß |
| `alleGelesen` | Marcar todo leído | Marcar todo como leído | „como“ fehlte |
| `fsShort` | Servicio del campo | Reuniones para el servicio del campo | „Treffpunkte“ hieß wie das Thema (tabFs) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „reuniones para el servicio del campo“ |
| `toastFsRuleAdd` | Añadido al horario | Añadido al horario base | Der Grundplan heißt „Horario base“ (fsGrundplan) |
| `toastFsRuleDel` | Eliminado del horario | Eliminado del horario base | wie toastFsRuleAdd |
| `gbWirkung` | … «Enviar el programa» … | … “Enviar el programa” … | Anführungszeichen wie im übrigen Wörterbuch (“…”) |
| `zettelAnleitung` | … «{frage}» … | … “{frage}” … | wie gbWirkung |
| `vpVorgemerkt` | Esta semana aún no está cargada. El discurso se anotará cuando se importe su programa. | Esta semana aún no está creada. El discurso se anotará cuando se obtenga su programa. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Obtener“ (holen) |
| `wpSaalText` | … los grupos de servicio del campo … | … los grupos para el servicio del campo … | Fachwort wie gruppenCard/gruppeLbl („grupo para el servicio del campo“) |
| `wpSaalTextMonat` | … los grupos de servicio del campo … | … los grupos para el servicio del campo … | wie wpSaalText |
| `absageIntro` | No pasa nada. Así sigue después: | No pasa nada. Esto es lo que pasará: | „Así sigue después“ ist kein Spanisch |
| `suchen` | Buscar … | Buscar… | Auslassungspunkte ohne Leerzeichen (wie „Enviando…“) |
| `langSearchPh` | Buscar idioma … | Buscar idioma… | wie suchen |
| `holtProgramm` | Obteniendo el programa … | Obteniendo el programa… | wie suchen |
| `laedt` | Cargando … | Cargando… | wie suchen |
| `personAnlegenHinweis` | Después indicas las áreas de asignación en la persona. | Después indicas las áreas de asignación en los datos de la persona. | „en la persona“ ist eine Lehnübersetzung; sonst überall „en los datos de la persona“ |
| `rechtPlanenUnter` | Obtiene el programa, prepara los programas, hace las asignaciones y las envía. | Obtiene el programa, prepara los planes, hace las asignaciones y las envía. | „Pläne“ sind die Pläne (navWeiterePlaene „Otros planes“) — „programa“ zweimal im selben Satz war missverständlich |
| `absagen` | Cancelar | Avisar que no puedo | Im Absage-Blatt standen zwei Knöpfe „Cancelar“ — Absagen und Abbrechen (abbrechen) |
| `freiePlaetzeHint` | … Quien se encargue primero queda apuntado y ya ha confirmado. | … La primera persona que se encargue queda anotada y con eso ya ha confirmado. | Genus: freie Plätze übernehmen auch Schwestern — „apuntado“ war männlich |
| `lacPh` | Nuevo punto, p. ej., avisos locales | Nueva parte, p. ej., avisos locales | Programmpunkte heißen sonst „parte“ (programmpunktEinfuegen „Insertar parte“) |
| `toastLacAdd` | Punto insertado · horarios ajustados | Parte insertada · horarios ajustados | wie lacPh |
| `toastLacDel` | Punto eliminado · horarios ajustados | Parte eliminada · horarios ajustados | wie lacPh |
| `notifVerhindert` | Impedimento avisado | No puede asistir | „Impedimento avisado“ ist kein Spanisch; der Rumpf nennt Aufgabe und Person |
| `ohneGruppeHint` | … en la sección Servicio del campo … | … en la sección “Servicio del campo” … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen |
| FRAG `Treffpunkte` | Servicio del campo | Reuniones para el servicio del campo | wie `fsShort` |
| FRAG `Unsere Glaubensansichten erklären` | Explique sus creencias | Expliquemos nuestras creencias | Das Arbeitsheft schreibt seit November 2026 in der Wir-Form — WOL-Suche nach der genauen Wendung: mwb26 noviembre (28.12.2026–3.1.2027) und die S-38; „Hagamos revisitas" stand schon so |

Daten gelesen: FRAG, REF, D, Bibelbücher, Function-Titel — sonst nichts zu
ändern.

Offen, nicht geändert: die Zwei-Tipp-Fragen „¿… de verdad?" (`abmeldenSicher`,
`leerenSicher`, `loeschenSicher`, `entfernenSicher`) sind umgangssprachlich,
aber verständlich; „¿Seguro que…?" wäre üblicher und länger — eine
Geschmacksfrage für Muttersprachler.
