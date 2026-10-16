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

Nebenbei gefunden, nicht geändert: `ansehen`, `zuteilenChip`, `verhindert`
und `lacAdd` benutzt kein Code mehr (in allen zwölf Wörterbüchern; die beiden
letzten tragen nur zufällig denselben Namen wie ein Aufgabenstand bzw. eine
Aktion und fielen der ersten Suche deshalb nicht auf), FRAG `Treffpunkte` und die Regel
„N Zuteilungen" (`zut`) erzeugt kein Erzeuger mehr — sie stehen nur noch für
alte Zeilen da.

**Ein Schlüssel, zwei Rollen — getrennt (beim Polnischen gefunden):**
`nameLbl` benannte Versammlung, Gruppe, Trolley, Plan, Termin und Hilfsdienst
**und** zwei Felder für eine Person (Freitext-Leiter im Zuteilungs-Blatt,
Konto ohne Person). Polnisch, Russisch und Ukrainisch haben dafür zwei Wörter
(„Nazwa" / „Imię i nazwisko", „Название" / „Имя", „Назва" / „Ім’я") —
polnisch stand „Imię i nazwisko" über jedem Gruppen- und Trolleynamen. Neu:
`personNameLbl` für die beiden Personen-Felder. Ebenso bat ein neuer
Programmpunkt ohne Titel mit `toastNameEingeben` um einen Namen, polnisch
„Wpisz imię" (den Vornamen) — neu `toastTitelEingeben`. Beide Schlüssel stehen
in allen zwölf Wörterbüchern hinter `holenSpracheFehlt`; ab hier sind es 747.
Wachen: `AssignSheet.test.tsx` (auf Polnisch, mit Gegenprobe) und
`ProgrammBlatt.test.tsx`; Mutationsprobe `t123-freitext-leiter-personenname`
und `t123-programmpunkt-fragt-nach-titel` bewacht. Das Russische und
Ukrainische ziehen `nameLbl` in ihrem Durchgang nach.

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
jw.org) · 24 Korrekturen im Wörterbuch, 2 in FRAG, dazu 2 als Nachtrag (unten).

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

Nachtrag (beim Italienischen gefunden; die Doppelpunkt-Suche lief danach über
alle Sprachen):

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `planSendenOhneKonto` | Sin cuenta en la aplicación: avísales en persona: {namen} | Sin cuenta en la aplicación — avísales en persona: {namen} | Zwei Doppelpunkte in einem Satz; Deutsch hat den Gedankenstrich |
| `nameDoppelt` | … para distinguirlos. … | … para distinguir a las dos personas. … | Genus: „distinguirlos“ ist männlich, gleich heißen auch zwei Schwestern |

Offen, nicht geändert: die Zwei-Tipp-Fragen „¿… de verdad?" (`abmeldenSicher`,
`leerenSicher`, `loeschenSicher`, `entfernenSicher`) sind umgangssprachlich,
aber verständlich; „¿Seguro que…?" wäre üblicher und länger — eine
Geschmacksfrage für Muttersprachler.

### fr · Französisch

16. Oktober 2026 · alle 745 gelesen · Anrede: tu, Gruppen „vous" · 22
Korrekturen im Wörterbuch, 1 in FRAG. Satzzeichen per Skript nachgezählt:
vor `:` `;` `!` `?` und in `« »` überall das geschützte Leerzeichen (danach
123 statt 121).

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `linkMailText` | … ⏎⏎l’assemblée de {versammlung} planifie … | … ⏎⏎L’assemblée de {versammlung} planifie … | Nach der Anrede beginnt der französische Brieftext groß |
| `linkMailText` | … Ouvre-la alors depuis là, … | … Alors ouvre-la depuis cet écran, … | „depuis là“ ist holprig |
| `alleGelesen` | Tout marquer lu | Tout marquer comme lu | „comme“ fehlte |
| `fsShort` | Prédication | Réunions pour la prédication | „Treffpunkte“ hieß wie das Thema (tabFs „Prédication“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „réunions pour la prédication“ |
| `toastFsRuleAdd` | Ajouté au programme | Ajouté au programme de base | Der Grundplan heißt „Programme de base“ (fsGrundplan) |
| `toastFsRuleDel` | Retiré du programme | Retiré du programme de base | wie toastFsRuleAdd |
| `vpVorgemerkt` | Cette semaine n’est pas encore chargée. Le discours sera inscrit dès que son programme sera importé. | Cette semaine n’est pas encore créée. Le discours sera inscrit dès que son programme aura été récupéré. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Récupérer“ (holen) |
| `linkAbgelaufenHint` | … Un nouveau lien est de nouveau valable 30 jours. … | … Un nouveau lien sera valable 30 jours. … | „nouveau … de nouveau“ doppelt |
| `suchen` | Rechercher … | Rechercher… | Kein Leerzeichen vor den Auslassungspunkten (wie „Envoi en cours…“) |
| `langSearchPh` | Rechercher une langue … | Rechercher une langue… | wie suchen |
| `holtProgramm` | Récupération du programme … | Récupération du programme… | wie suchen |
| `laedt` | Chargement … | Chargement… | wie suchen |
| `rolleDag` | Assistant | Assistant ministériel | Amtliche Bezeichnung (jw.org: „assistant ministériel“) — „Assistant“ allein klang wie der Gehilfe (Adjoint) |
| `absagen` | Annuler | Me désister | Im Absage-Blatt standen zwei Knöpfe „Annuler“ — Absagen und Abbrechen (abbrechen) |
| `spurDuSagstAb` | Tu annules | Tu te désistes | wie absagen |
| `ersatzHint` | … Si tu annules un service auxiliaire, … | … Si tu te désistes d’un service auxiliaire, … | wie absagen |
| `freiePlaetzeHint` | … Le premier qui s’en charge est inscrit, ce qui vaut confirmation. | … La première personne qui s’en charge est inscrite, ce qui vaut confirmation. | Genus: freie Plätze übernehmen auch Schwestern — „Le premier … inscrit“ war männlich |
| `lacPh` | Nouveau point, p. ex. annonces locales | Nouvelle partie, p. ex. annonces locales | Programmpunkte heißen sonst „partie“ (programmpunktEinfuegen „Insérer une partie“) |
| `toastLacAdd` | Point inséré · horaires ajustés | Partie insérée · horaires ajustés | wie lacPh |
| `toastLacDel` | Point retiré · horaires ajustés | Partie retirée · horaires ajustés | wie lacPh |
| `stKeineVers` | Pas encore rattaché à une assemblée | Compte pas encore rattaché à une assemblée | Genus: „rattaché“ las sich als der Nutzer (männlich) — jetzt das Konto |
| `ohneGruppeHint` | … dans la partie Prédication les réunions … | … dans la partie « Prédication » les réunions … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen |
| FRAG `Treffpunkte` | Prédication | Réunions pour la prédication | wie `fsShort` |

Daten gelesen: FRAG (die Teil-Titel des Arbeitshefts stehen auf Französisch
weiter in der Du-Form — „Engage la conversation" in mwb26 novembre und mwb27
janvier, WOL-Suche; „Que diriez-vous ?" ist die Überschrift des Hefts und der
S-38), REF, D, Bibelbücher, Function-Titel.

Offen, nicht geändert: „Partenaire recherché" / „Partenaire trouvé" stehen im
grammatischen Maskulinum zu „partenaire" (epizön) — für eine Schwester ließe
sich „Recherche de partenaire" schreiben; die Function `trolley` müsste den
Titel mitziehen.

### it · Italienisch

16. Oktober 2026 · alle 745 gelesen · Anrede: tu, Gruppen „voi" · 26
Korrekturen im Wörterbuch, 1 in FRAG, 1 im Übersetzer.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `alleGelesen` | Segna tutto letto | Segna tutto come letto | „come“ fehlte |
| `fsShort` | Servizio di campo | Adunanze per il servizio | „Treffpunkte“ hieß wie das Thema (tabFs „Servizio di campo“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „adunanze per il servizio (di campo)“ (381 Treffer) |
| `toastFsRuleAdd` | Aggiunto al programma | Aggiunto al programma di base | Der Grundplan heißt „Programma di base“ (fsGrundplan) |
| `toastFsRuleDel` | Rimosso dal programma | Rimosso dal programma di base | wie toastFsRuleAdd |
| `vpVorgemerkt` | Questa settimana non è ancora caricata. Il discorso verrà inserito appena il suo programma sarà importato. | Questa settimana non è ancora stata creata. Il discorso verrà inserito appena il suo programma sarà stato scaricato. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Scarica“ (holen) |
| `offenWort` | aperto | da assegnare | „posto aperto“ ist kein italienischer Ausdruck für einen unbesetzten Platz; offeneZut sagt schon „da assegnare“ |
| `offenDash` | — aperto — | — da assegnare — | wie offenWort |
| `lageOffen` | Aperti: {n} | Da assegnare: {n} | wie offenWort |
| `toastKeineOffen` | Nessun posto aperto | Nessun posto da assegnare | wie offenWort |
| `toastKeinePassende` | Nessuna persona qualificata e libera per i posti aperti | Nessuna persona qualificata e libera per i posti da assegnare | wie offenWort |
| `spurErsatzGesucht` | Sostituto cercato | Cercasi sostituto | Wie die Mitteilung (notifErsatzGesucht, Function substitute) — „Sostituto cercato“ klang nach „gesuchter Ersatz“ |
| `absageErklaerung` | Il pianificatore viene avvisato subito e affida il compito a un altro. | Il pianificatore viene avvisato subito e affida l’incarico a un’altra persona. | Aufgabe heißt sonst „incarico“; „a un altro“ war männlich |
| `suchen` | Cerca … | Cerca… | Kein Leerzeichen vor den Auslassungspunkten |
| `langSearchPh` | Cerca lingua … | Cerca lingua… | wie suchen |
| `holtProgramm` | Scaricamento del programma … | Scaricamento del programma… | wie suchen |
| `laedt` | Caricamento … | Caricamento… | wie suchen |
| `linkAbgelaufenHint` | … Uno nuovo vale di nuovo 30 giorni. … | … Un nuovo link vale 30 giorni. … | „nuovo … di nuovo“ doppelt |
| `zettelAnleitung` | … sotto «{frage}». … | … sotto “{frage}”. … | Einzige Stelle mit « » — sonst überall “ ” (12 Schlüssel) |
| `absagen` | Annulla | Rinuncia | Im Absage-Blatt standen zwei Knöpfe „Annulla“ — Absagen und Abbrechen (abbrechen); erinAbsage heißt schon „Rinuncia“ |
| `spurDuSagstAb` | Annulli | Rinunci | wie absagen |
| `ersatzHint` | … Se annulli un servizio di supporto, … | … Se rinunci a un servizio di supporto, … | wie absagen |
| `freiePlaetzeHint` | … Chi se ne occupa per primo è iscritto e ha già confermato. … | … La prima persona che se ne occupa viene iscritta e ha così confermato. … | Genus: freie Plätze übernehmen auch Schwestern — „per primo … iscritto“ war männlich; „damit zugesagt“ heißt „così“, nicht „già“ |
| `planSendenOhneKonto` | Senza account nell’app: avvisali di persona: {namen} | Senza account nell’app — avvisali di persona: {namen} | Zwei Doppelpunkte in einem Satz; Deutsch hat den Gedankenstrich |
| `stKeineVers` | Non ancora assegnato a una congregazione | Account non ancora assegnato a una congregazione | Genus: „assegnato“ las sich als der Nutzer (männlich) — jetzt das Konto |
| `nameDoppelt` | … per distinguerli. … | … per distinguere le due persone. … | Genus: „distinguerli“ ist männlich, gleich heißen auch zwei Schwestern |
| `ohneGruppeHint` | … nella sezione Servizio di campo le adunanze … | … nella sezione “Servizio di campo” le adunanze … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen |
| FRAG `Treffpunkte` | Servizio di campo | Adunanze per il servizio | wie `fsShort` |
| `translate.ts` (Spanne) | 07–13 settembre · 28 settembre – 04 ottobre · 29 dicembre 2025 – 04 gennaio 2026 | 7–13 settembre · 28 settembre – 4 ottobre · 29 dicembre 2025 – 4 gennaio 2026 | ICU setzt im Italienischen trotz `day: 'numeric'` eine führende Null in jede Spanne; jw.org schreibt „8-14 febbraio" — jeder italienische Wochenkopf trug sie. Jetzt `spanneOhneNull`; Wache in `datum-alle-sprachen.test.ts` für alle Sprachen, Mutationsprobe `t123-spanne-ohne-fuehrende-null` bewacht |

Daten gelesen: FRAG (Teil-Titel des Arbeitshefts gemessen: „Spiegare quello
in cui si crede" in mwb26/mwb27 und der S-38, 40 Treffer; „Discorso di servizio
conclusivo" war schon belegt, siehe `TITEL_SCHLUSSVORTRAG`), REF, EXTRA
(Intl-Pfad), Bibelbücher (Namen und Kürzel der NWT), Function-Titel.
Fachwörter nachgesehen: „gruppo di servizio" / „sorvegliante del gruppo"
(Wachtturm Juni 2026), „adunanza Vita cristiana e ministero" (S-38, mwb27) und
„Guida per l’adunanza" (S-38) — stimmen.

Offen, nicht geändert: „compagno di servizio" (Trolley-Partner, zehn
Schlüssel samt `notifTrolleyDazu` „Compagno di servizio trovato", den die
Function `trolley` gleich schreibt) ist männlich
wie das deutsche „Partner"; eine neutrale Fassung wäre deutlich länger.
„Weitere Pläne" heißen „Altri programmi" — in `rechtPlanenUnter` steht deshalb
„Scarica il programma, prepara i programmi"; stimmig, aber doppelt („piani"
ginge für alle vier Schlüssel).

### pl · Polnisch

16. Oktober 2026 · alle 745 gelesen (dazu die zwei neuen) · Anrede: ty,
Gruppen „wy" · 26 Korrekturen im Wörterbuch (eine davon, `nameLbl`, mit der
Trennung der Schlüssel oben), 3 in FRAG.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `nameLbl` | Imię i nazwisko | Nazwa | benennt Versammlung, Gruppe, Trolley, Plan, Termin, Hilfsdienst — die Person hat jetzt `personNameLbl` „Imię i nazwisko“ |
| `linkMailText` | … i wpisz ten kod: … | … i wprowadź ten kod: … | „stuknij „Wpisz kod” i wpisz ten kod“ — dasselbe Verb zweimal |
| `anmeldungOhneDb` | Bez bazy danych · logowanie jest tylko udawane | Bez bazy danych · logowanie jest tylko symulowane | „udawane“ heißt „vorgetäuscht“; gemeint ist nachgestellt |
| `fsShort` | Służba | Zbiórki do służby | „Treffpunkte“ hieß wie das Thema (tabFs „Służba“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „zbiórki“ (Wachtturm Juni 2026), sonst im Wörterbuch „zbiórki do służby“ |
| `toastFsRuleAdd` | Dodano do planu | Dodano do planu stałego | Der Grundplan heißt „Plan stały“ (fsGrundplan) |
| `toastFsRuleDel` | Usunięto z planu | Usunięto z planu stałego | wie toastFsRuleAdd |
| `vpVorgemerkt` | Ten tydzień nie jest jeszcze wczytany. Wykład zostanie wpisany, gdy tylko jego program zostanie zaimportowany. | Ten tydzień nie jest jeszcze utworzony. Wykład zostanie wpisany, gdy tylko jego program zostanie pobrany. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Pobierz“ (holen) |
| `toastNameLeer` | Nie zmieniono imienia i nazwiska: bez nich się nie da | Nie zmieniono: to pole nie może być puste | Gilt auch für Gruppe und Trolley — „imię i nazwisko“ (Vor- und Nachname) passte dort nicht |
| `toastNameNichtGeaendert` | Nie zmieniono imienia i nazwiska: {name} już istnieje | Nie zmieniono: {name} już istnieje | wie toastNameLeer |
| `linkAbgelaufenHint` | … Nowy znów jest ważny przez 30 dni. … | … Nowy będzie ważny przez 30 dni. … | „Nowy znów“ doppelt (wie fr/it) |
| `suchen` | Szukaj … | Szukaj… | Kein Leerzeichen vor den Auslassungspunkten (wie „Wysyłanie…“) |
| `langSearchPh` | Szukaj języka … | Szukaj języka… | wie suchen |
| `holtProgramm` | Pobieranie programu … | Pobieranie programu… | wie suchen |
| `laedt` | Ładowanie … | Ładowanie… | wie suchen |
| `zuletztLange` | dawno nie | od dawna bez zadania | „dawno nie“ bricht mitten im Satz ab |
| `toastKeinePassende` | … na otwarte miejsca … | … na wolne miejsca … | Offene Plätze heißen sonst „wolne“ (offenWort, lageOffen, toastKeineOffen) |
| `toastNameEingeben` | Wpisz imię | Wpisz imię i nazwisko | Gefragt ist der ganze Name (Gastredner, Freitext-Leiter), nicht der Vorname |
| `auxRatgeber` | Prowadzący | Doradca | Der Ratgeber heißt in der S-38 „doradca“; „Prowadzący“ ist der Leiter |
| `auxRatgeberHint` | W każdej dodatkowej grupie rad powinien udzielać wykwalifikowany starszy zboru. | W każdej dodatkowej grupie rad powinien udzielać wykwalifikowany starszy zboru, a jeśli nie jest to możliwe — wykwalifikowany sługa pomocniczy. | „vorzugsweise ein Ältester“ fehlte — der Satz verlangte einen Ältesten; jetzt wie S-38, Abs. 27 |
| `privSchulung` | Zadania ucznia | Zadania uczestników | Die S-38 nennt den Schüler „uczestnik“; auxKurz sagt schon „Do zadań uczestników“ |
| `freiePlaetzeHint` | … Kto pierwszy się podejmie, zostaje zapisany i tym samym potwierdził. … | … Pierwsza osoba, która się tego podejmie, zostaje zapisana i tym samym potwierdza udział. … | Genus: freie Plätze übernehmen auch Schwestern — „zapisany … potwierdził“ war männlich |
| `rednerNamePh` | Imię mówcy | Imię i nazwisko mówcy | Ein Gastredner wird mit vollem Namen eingetragen, nicht nur dem Vornamen |
| `toastUebernommen` | Dziękujemy! To zadanie pomocnicze jest teraz Twoje | Dziękujemy! To zadanie pomocnicze jest teraz twoje | Sonst überall klein („twoje miejsce“; groß nur am Satzanfang) |
| `konfliktDouble` | {name}: przydziały na jednym zebraniu: {n} · {tab} | {name} — przydziały na jednym zebraniu: {n} · {tab} | Zwei Doppelpunkte in einem Satz |
| `nameDoppelt` | … aby dało się je rozróżnić. … | … aby dało się rozróżnić te osoby. … | „je“ bezog sich nicht klar auf die beiden Personen |
| `ohneGruppeHint` | … w sekcji Służba zbiórek grup … | … w sekcji „Służba” zbiórek grup … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen |
| FRAG `Treffpunkte` | Służba | Zbiórki do służby | wie `fsShort` |
| FRAG `Ratgeber` | Prowadzący | Doradca | wie `auxRatgeber` |
| FRAG `Schüler` | Uczeń | Uczestnik | wie `privSchulung` (S-38) |

Daten gelesen: FRAG (Teil-Titel gemessen: „Co byś powiedział?" steht so in
mwb26/mwb27 und der S-38 — männlich, aber der Titel des Hefts), REF, EXTRA
(Intl-Pfad), Bibelbücher („Pieśń" für das Hohelied führt die
WOL-Bücherliste genau so), Function-Titel. Fachwörter nachgesehen: „grupa
służby (kaznodziejskiej)", „nadzorca grupy", „asystent" (Wachtturm Juni
2026), „Dodatkowe grupy", „doradca", „pomocnik", „uczestnik", „Życie i
służba" und „zebranie chrześcijańskiego życia i służby" (S-38). Die Anrede
im Brief bleibt klein: nach dem Komma der Anrede schreibt das Polnische klein
weiter (Poradnia PWN), anders als Englisch, Spanisch, Französisch.

Offen, nicht geändert: Die Regel `zut` („3 Zuteilungen") schreibt „3 zadań"
— richtig wäre „3 zadania" (2–4); ebenso im Russischen und Ukrainischen. Sie
erzeugt kein Erzeuger mehr (siehe oben), deshalb nur vermerkt.
„współpracownik" (Trolley-Partner) ist männlich wie das deutsche „Partner".

### ru · Russisch

16. Oktober 2026 · alle 747 gelesen · Anrede: вы (klein, wie im übrigen
Wörterbuch) — sie macht die Vergangenheitsformen geschlechtsneutral
(„Вы записаны") · 29 Korrekturen im Wörterbuch, 1 in FRAG, 1 Function-Titel.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `alleGelesen` | Прочитать все | Отметить все как прочитанные | „Прочитать все“ heißt „alle lesen“ — gemeint ist „als gelesen markieren“ |
| `fsShort` | Служение | Встречи для проповеди | „Treffpunkte“ hieß wie das Thema (tabFs „Служение“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „встречи для проповеди“ (Wachtturm Juni 2026) |
| `toastFsRuleAdd` | Добавлено в расписание | Добавлено в основное расписание | Der Grundplan heißt „Основное расписание“ (fsGrundplan) |
| `toastFsRuleDel` | Удалено из расписания | Удалено из основного расписания | wie toastFsRuleAdd |
| `vpVorgemerkt` | Эта неделя ещё не загружена. Речь будет внесена, как только её программа будет импортирована. | Эта неделя ещё не создана. Речь будет внесена, как только её программа будет загружена. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Загрузить“ (holen) |
| `grundPh` | напр. отпуск | напр., отпуск | „напр.,“ mit Komma wie in den übrigen Platzhaltern (fsOrtPh, absageNachrichtBeispiel) |
| `wpNamePhSaal` | напр., Уборка снега | напр., уборка снега | Nach „напр.,“ klein wie in den übrigen Platzhaltern |
| `neuerDienstPh` | Новая обязанность, напр. парковка | Новая обязанность, напр., парковка | wie grundPh |
| `lacPh` | Новый пункт, напр. местные объявления | Новый пункт, напр., местные объявления | wie grundPh |
| `druckAndersAlsSonst` | Не как обычно | Не так, как обычно | „Не как обычно“ ist unvollständig |
| `absageErklaerung` | Планировщик сразу узнаёт об этом и назначает задание другому. | Планировщик сразу узнаёт об этом и назначает задание другому человеку. | „другому“ allein meint einen Mann |
| `suchen` | Поиск … | Поиск… | Kein Leerzeichen vor den Auslassungspunkten (wie „Отправка…“) |
| `langSearchPh` | Поиск языка … | Поиск языка… | wie suchen |
| `holtProgramm` | Загрузка программы … | Загрузка программы… | wie suchen |
| `laedt` | Загрузка … | Загрузка… | wie suchen |
| `linkAbgelaufenHint` | … Новая ссылка снова действует 30 дней. … | … Новая ссылка будет действовать 30 дней. … | „Новая … снова“ doppelt (wie fr/it/pl) |
| `zuletztLange` | давно не | давно без заданий | „давно не“ bricht mitten im Satz ab |
| `toastKeinePassende` | … на открытые места … | … на свободные места … | Offene Plätze heißen sonst „свободные“ (offenWort, lageOffen, toastKeineOffen) |
| `toastVonBis` | Укажите С и По | Укажите «С» и «По» | „С“ und „По“ sind Feldnamen (von, bis) — ohne Anführungszeichen lesen sie sich als Präpositionen; trolleyFehlerZeit setzt sie schon in « » |
| `toastPersonNeu` | Человек создан | Человек добавлен | „Человек создан“ heißt „ein Mensch wurde erschaffen“ |
| `notifEntzug` | Задание отменено | Назначение отменено | Zuteilung heißt sonst „назначение“ (notifZuteilung „Новое назначение“); Function `send-plan` zieht mit |
| `spurErsatzGesucht` | Ищется замена | Нужна замена | Wie die Mitteilung (notifErsatzGesucht, Function substitute) |
| `nameLbl` | Имя | Название | benennt Versammlung, Gruppe, Trolley, Plan, Termin, Hilfsdienst — „Имя“ ist der Name einer Person; die hat jetzt `personNameLbl` |
| `toastNameLeer` | Имя не изменено: без имени нельзя | Не изменено: поле не может быть пустым | Gilt auch für Gruppe und Trolley — „имя“ passte dort nicht |
| `toastNameNichtGeaendert` | Имя не изменено: {name} уже есть | Не изменено: {name} уже есть | wie toastNameLeer |
| `freiePlaetzeHint` | … Кто первым возьмёт на себя, тот записан и уже подтвердил. … | … Кто первым возьмёт место, получает его и тем самым подтверждает участие. … | Genus: „записан … подтвердил“ war männlich (das Präsens ist es nicht); „damit zugesagt“ heißt „тем самым“, nicht „уже“; „возьмёт на себя“ fehlte das Objekt |
| `notifVerhindert` | Сообщено о невозможности | Не сможет выполнить задание | „Сообщено о невозможности“ bricht ab (Unmöglichkeit wovon?); der Rumpf nennt Aufgabe und Person |
| `stKeineVers` | Ещё не привязан к собранию | Учётная запись ещё не привязана к собранию | Genus: „привязан“ las sich als der Nutzer (männlich) — jetzt das Konto (wie fr/it) |
| `toastMitgliedEntfernt` | Член удалён | Аккаунт удалён из собрания | „Член удалён“ allein ist missverständlich; entfernt wird das Konto aus der Versammlung (kontoCard „Аккаунт“) |
| FRAG `Treffpunkte` | Служение | Встречи для проповеди | wie `fsShort` |
| `send-plan` `entzug` | Задание отменено | Назначение отменено | wie `notifEntzug` (Push-Titel) |

Daten gelesen: FRAG, REF, EXTRA (Intl-Pfad), Bibelbücher, Function-Titel.
Fachwörter nachgesehen und so gelassen: „помощник собрания" für den
Dienstamtgehilfen (Wachtturm Juni 2026: „Такой помощник собрания называется
служителем группы" — das ältere „служебный помощник" steht dort nicht),
„группа для проповеднического служения", „ответственный за группу",
„встреча для проповеди" (Wachtturm Juni 2026), „районный старейшина" und
„Приезд районного старейшины", „дополнительные классы", „учащийся",
„рабочая тетрадь" (S-38), „Руководитель изучения «Сторожевой башни»" (20
Treffer auf WOL, „ведущий изучения" keiner).

Offen, nicht geändert: Den Ratgeber der zusätzlichen Klasse nennt die S-38
nicht „советник", sondern umschreibt ihn („брат, дающий советы"); als
Rollenwort neben einem Namen bleibt `auxRatgeber` „Советник" — ein
Muttersprachler könnte „Дающий советы" vorziehen. „напарник" (Trolley-Partner)
ist männlich wie das deutsche „Partner". Die tote Regel `zut` schreibt
„3 назначений" (siehe Polnisch).

### uk · Ukrainisch

16. Oktober 2026 · alle 747 gelesen · Anrede: ви · 41 Korrekturen im
Wörterbuch, 1 in FRAG, 1 Function-Titel. Apostrophe per Skript gezählt: jetzt
überall ’ (U+2019), vorher dreimal ʼ (U+02BC).

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `alleGelesen` | Прочитати всі | Позначити всі як прочитані | „Прочитати всі“ heißt „alle lesen“ — gemeint ist „als gelesen markieren“ |
| `fsShort` | Служіння | Зустрічі для служіння | „Treffpunkte“ hieß wie das Thema (tabFs „Служіння“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „зустріч для служіння“ (Wachtturm Juni 2026) |
| `toastFsRuleAdd` | Додано до розкладу | Додано до основного розкладу | Der Grundplan heißt „Основний розклад“ (fsGrundplan) |
| `toastFsRuleDel` | Видалено з розкладу | Видалено з основного розкладу | wie toastFsRuleAdd |
| `vpVorgemerkt` | Цей тиждень ще не завантажено. Промову буде внесено, щойно його програму імпортують. | Цей тиждень ще не створено. Промову буде внесено, щойно його програму буде завантажено. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Завантажити“ (holen) |
| `grundPh` | напр. відпустка | напр., відпустка | „напр.,“ mit Komma wie in den übrigen Platzhaltern (fsOrtPh, absageNachrichtBeispiel) |
| `wpNamePhSaal` | напр., Прибирання снігу | напр., прибирання снігу | Nach „напр.,“ klein wie in den übrigen Platzhaltern |
| `neuerDienstPh` | Новий обов’язок, напр. паркування | Новий обов’язок, напр., паркування | wie grundPh |
| `lacPh` | Новий пункт, напр. місцеві оголошення | Новий пункт, напр., місцеві оголошення | wie grundPh |
| `druckAndersAlsSonst` | Не як завжди | Не так, як завжди | „Не як завжди“ ist unvollständig |
| `absageErklaerung` | Планувальник одразу дізнається про це й призначає завдання іншому. | Планувальник одразу дізнається про це й призначає завдання іншій людині. | „іншому“ allein meint einen Mann |
| `suchen` | Пошук … | Пошук… | Kein Leerzeichen vor den Auslassungspunkten (wie „Надсилання…“) |
| `langSearchPh` | Пошук мови … | Пошук мови… | wie suchen |
| `holtProgramm` | Завантаження програми … | Завантаження програми… | wie suchen |
| `laedt` | Завантаження … | Завантаження… | wie suchen |
| `linkAbgelaufenHint` | … Нове посилання знову діє 30 днів. … | … Нове посилання діятиме 30 днів. … | „Нове … знову“ doppelt (wie fr/it/pl/ru) |
| `zuletztLange` | давно не | давно без завдань | „давно не“ bricht mitten im Satz ab |
| `toastKeinePassende` | … на відкриті місця … | … на вільні місця … | Offene Plätze heißen sonst „вільні“ (offenWort, lageOffen, toastKeineOffen) |
| `toastVonBis` | Вкажіть З і По | Вкажіть «З» і «По» | „З“ und „По“ sind Feldnamen (von, bis) — ohne Anführungszeichen lesen sie sich als Präpositionen; trolleyFehlerZeit setzt sie schon in « » |
| `toastPersonNeu` | Людину створено | Людину додано | „Людину створено“ heißt „ein Mensch wurde erschaffen“ |
| `notifEntzug` | Завдання скасовано | Призначення скасовано | Zuteilung heißt sonst „призначення“ (notifZuteilung „Нове призначення“); Function `send-plan` zieht mit |
| `spurErsatzGesucht` | Шукається заміна | Потрібна заміна | Wie die Mitteilung (notifErsatzGesucht, Function substitute) |
| `nameLbl` | Ім’я | Назва | benennt Versammlung, Gruppe, Trolley, Plan, Termin, Hilfsdienst — „Ім’я“ ist der Name einer Person; die hat jetzt `personNameLbl` |
| `toastNameLeer` | Ім’я не змінено: без імені не можна | Не змінено: поле не може бути порожнім | Gilt auch für Gruppe und Trolley — „ім’я“ passte dort nicht |
| `toastNameNichtGeaendert` | Ім’я не змінено: {name} вже є | Не змінено: {name} вже є | wie toastNameLeer |
| `kontoVerknuepft` | Акаунт звʼязано | Акаунт зв’язано | Apostroph U+02BC statt ’ (U+2019) wie in den übrigen 42 Schlüsseln — eine Suche nach „зв’язано“ fand ihn nicht |
| `kontenOhnePersonHint` | … привʼязані … | … прив’язані … | wie kontoVerknuepft |
| `rednerNamePh` | Імʼя промовця | Ім’я промовця | wie kontoVerknuepft |
| `pushPromptIos` | … «На екран „Дім“» … | … «На Початковий екран» … | Das ukrainische iOS nennt den Home-Bildschirm „Початковий екран“ (Apple-Hilfe), die Anmelde-Mail sagt schon „на початковому екрані“ — „Дім“ war aus dem Russischen übernommen |
| `pushIosHint` | … «На екран „Дім“» … | … «На Початковий екран» … | wie pushPromptIos |
| `freiePlaetzeHint` | … Хто першим візьме на себе, той записаний і вже підтвердив. … | … Хто першим візьме місце, отримує його й тим самим підтверджує участь. … | Genus: „записаний … підтвердив“ war männlich (das Präsens ist es nicht); „damit zugesagt“ heißt „тим самим“, nicht „вже“ (wie ru) |
| `anlassMemText` | Зустріч цього дня не відбувається | Зібрання цього дня не відбувається | Zusammenkunft heißt sonst „зібрання“; „зустріч“ ist der Treffpunkt |
| `zusammenkuenfteDieserWoche` | Зустрічі цього тижня | Зібрання цього тижня | wie anlassMemText |
| `notifVerhindert` | Повідомлено про неможливість | Не зможе виконати завдання | „Повідомлено про неможливість“ bricht ab (wie ru); der Rumpf nennt Aufgabe und Person |
| `toastMitgliedEntfernt` | Члена видалено | Акаунт видалено зі збору | Entfernt wird das Konto aus der Versammlung (kontoCard „Акаунт“) |
| `gruppenCard` | Групи для служіння | Групи для проповідницького служіння | jw.org: „група для проповідницького служіння“ (Wachtturm Juni 2026) — das Deutsche sagt auch „Predigtdienstgruppe“ |
| `gruppeLbl` | Група для служіння | Група для проповідницького служіння | wie gruppenCard |
| `ohneGruppeTitle` | Без групи для служіння | Без групи для проповідницького служіння | wie gruppenCard |
| `ohneGruppeHint` | … належить до групи для служіння. … | … належить до групи для проповідницького служіння. … | wie gruppenCard |
| `wpSaalText` | … групи для служіння чергуються … | … групи для проповідницького служіння чергуються … | wie gruppenCard |
| `wpSaalTextMonat` | … групи для служіння чергуються … | … групи для проповідницького служіння чергуються … | wie gruppenCard |
| FRAG `Treffpunkte` | Служіння | Зустрічі для служіння | wie `fsShort` |
| `send-plan` `entzug` | Завдання скасовано | Призначення скасовано | wie `notifEntzug` (Push-Titel) |

Daten gelesen: FRAG (gemessen: „Кінцеві слова" und „Що можна сказати?" stehen
so in mwb27 und der S-38), REF, EXTRA (Intl-Pfad), Bibelbücher,
Function-Titel. Fachwörter nachgesehen und so gelassen: „служитель збору",
„наглядач групи", „помічник", „зустріч для служіння" (Wachtturm Juni 2026),
„районний наглядач" und „Візит районного наглядача", „учень",
„напарник", посібник «Наше християнське життя і служіння» (S-38).

Offen, nicht geändert: Den Ratgeber umschreibt auch die ukrainische S-38
(„брат, який дає поради"); `auxRatgeber` bleibt „Порадник". Den genauen
Wortlaut des iOS-Menüpunkts („На Початковий екран") habe ich nur aus der
Apple-Hilfe („Початковий екран") erschlossen, nicht am Gerät gesehen.
„напарник" (Trolley-Partner) ist männlich wie das deutsche „Partner"; die
tote Regel `zut` schreibt „3 призначень".

### ro · Rumänisch

16. Oktober 2026 · alle 747 gelesen · Anrede: tu, Gruppen „voi" · 38
Korrekturen im Wörterbuch, 3 in FRAG, 1 Function-Titel.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `alleGelesen` | Marchează tot citit | Marchează tot ca citit | „ca“ fehlte |
| `fsShort` | Serviciul de teren | Întruniri pentru serviciu | „Treffpunkte“ hieß wie das Thema (tabFs „Serviciul de teren“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „întrunirile pentru serviciul de teren“, im Wörterbuch sonst kurz „întrunire pentru serviciu“ |
| `toastFsRuleAdd` | Adăugat în program | Adăugat în programul de bază | Der Grundplan heißt „Program de bază“ (fsGrundplan) |
| `toastFsRuleDel` | Eliminat din program | Eliminat din programul de bază | wie toastFsRuleAdd |
| `vpVorgemerkt` | Această săptămână nu este încă încărcată. Cuvântarea va fi trecută imediat ce programul ei este importat. | Această săptămână nu este încă creată. Cuvântarea va fi trecută imediat ce programul ei va fi preluat. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Preia“ (holen) |
| `vpOhnePerson` | … fără sarcină și fără memento … | … fără însărcinare și fără memento … | Aufgabe heißt sonst „însărcinare“; „sarcină“ ist der Hilfsdienst |
| `wpNamePhSaal` | de ex. Deszăpezire | de ex. deszăpezire | Nach „de ex.“ klein wie in den übrigen Platzhaltern |
| `grundPh` | ex. concediu | de ex. concediu | „de ex.“ wie in den übrigen Platzhaltern (fsOrtPh, absageNachrichtBeispiel) |
| `neuerDienstPh` | Sarcină nouă, ex. parcare | Sarcină nouă, de ex. parcare | wie grundPh |
| `abwHinweis` | În această perioadă nu vei primi sarcini. Planificatorii vor vedea sarcinile existente drept conflict. | În această perioadă nu vei primi însărcinări. Planificatorii vor vedea însărcinările existente drept conflict. | Zuteilungen heißen sonst „însărcinări“ (notifZuteilung, offeneZut) |
| `absageErklaerung` | Planificatorul află imediat și dă sarcina altcuiva. | Planificatorul află imediat și dă însărcinarea altcuiva. | wie abwHinweis |
| `suchen` | Caută … | Caută… | Kein Leerzeichen vor den Auslassungspunkten (wie „Se trimite…“) |
| `langSearchPh` | Caută limbă … | Caută limbă… | wie suchen |
| `holtProgramm` | Se preia programul … | Se preia programul… | wie suchen |
| `laedt` | Se încarcă … | Se încarcă… | wie suchen |
| `linkAbgelaufenHint` | … Unul nou este din nou valabil 30 de zile. … | … Un link nou va fi valabil 30 de zile. … | „nou … din nou“ doppelt (wie fr/it/pl/ru/uk) |
| `werIstDas` | Cine sunt? | Cine sunt aceste persoane? | „Cine sunt?“ heißt auch „Wer bin ich?“ — gemeint ist die Liste der Personen ohne Adresse |
| `toastKeinePassende` | … pentru locurile deschise … | … pentru locurile libere … | Offene Plätze heißen sonst „libere“ (offenWort, lageOffen, toastKeineOffen) |
| `toastVonBis` | Completează De la și Până la | Completează „De la” și „Până la” | Feldnamen (von, bis) in Anführungszeichen, wie trolleyFehlerZeit |
| `notifEntzug` | Sarcină retrasă | Însărcinare retrasă | Zuteilung heißt sonst „însărcinare“ (notifZuteilung „Însărcinare nouă“); Function `send-plan` zieht mit |
| `privSchulung` | Însărcinări de elev | Teme pentru cursanți | S-38: „temă pentru cursanți“, der Schüler heißt „cursant“; auxKurz sagt schon „temele cursanților“ |
| `privWtLeiter` | Conducătorul Studiului Turnul de veghe | Conducătorul Studiului Turnului de veghe | Genitiv: „Studiul Turnului de veghe“ (116 Treffer auf WOL) |
| `privWtVertreter` | Înlocuitor (Studiul Turnul de veghe) | Înlocuitor (Studiul Turnului de veghe) | wie privWtLeiter |
| `wtRollenHint` | … al Studiului Turnul de veghe; … | … al Studiului Turnului de veghe; … | wie privWtLeiter |
| `absagen` | Anulează | Renunț | Im Absage-Blatt standen zwei Knöpfe „Anulează“ — Absagen und Abbrechen (abbrechen); wie „Preiau eu“ (uebernehmen) in der ersten Person |
| `spurDuSagstAb` | Anulezi | Renunți | wie absagen |
| `ersatzHint` | … Dacă anulezi o sarcină de sprijin, … | … Dacă renunți la o sarcină de sprijin, … | wie absagen |
| `erinAbsage` | Anulare | Renunțare | wie absagen |
| `freiePlaetzeHint` | … Cine preia primul este înscris și a confirmat deja. … | … Prima persoană care preia locul este înscrisă și astfel confirmă. … | Genus: freie Plätze übernehmen auch Schwestern — „primul … înscris“ war männlich; „damit zugesagt“ heißt „astfel“, nicht „deja“ |
| `planSendenOffen` | Sarcini din această săptămână încă necomunicate: {n} | Însărcinări din această săptămână încă necomunicate: {n} | wie abwHinweis |
| `fsSendenOffen` | Sarcini din grupa ta încă necomunicate: {n} | Însărcinări din grupa ta încă necomunicate: {n} | wie abwHinweis |
| `erinEntzugAn` | persoanei, dacă sarcina i-a fost deja comunicată sau a confirmat deja | persoanei, dacă însărcinarea i-a fost deja comunicată sau dacă a confirmat-o deja | wie abwHinweis |
| `lacPh` | Punct nou, ex. anunțuri locale | Parte nouă, de ex. anunțuri locale | Programmpunkte heißen sonst „parte“ (programmpunktEinfuegen „Inserează o parte“); „de ex.“ wie grundPh |
| `toastLacAdd` | Punct inserat · orare ajustate | Parte inserată · orare ajustate | wie lacPh |
| `toastLacDel` | Punct eliminat · orare ajustate | Parte eliminată · orare ajustate | wie lacPh |
| `stKeineVers` | Încă neasociat unei congregații | Cont încă neasociat unei congregații | Genus: „neasociat“ las sich als der Nutzer (männlich) — jetzt das Konto (wie fr/it/ru) |
| `nameDoppelt` | … ca să poată fi deosebiți. … | … ca cele două persoane să poată fi deosebite. … | Genus: „deosebiți“ ist männlich, gleich heißen auch zwei Schwestern |
| `ohneGruppeHint` | … în secțiunea Serviciul de teren întrunirile … | … în secțiunea „Serviciul de teren” întrunirile … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen |
| FRAG `Treffpunkte` | Serviciul de teren | Întruniri pentru serviciu | wie `fsShort` |
| FRAG `Schüler` | Elev | Cursant | wie `privSchulung` (S-38) |
| FRAG `WACHTTURM-STUDIUM` | STUDIUL TURNULUI DE VEGHERE | STUDIUL TURNULUI DE VEGHE | Die Zeitschrift heißt „Turnul de veghe“; „de veghere“ steht auf WOL nur im alten Titel „Turnul de veghere al Sionului“ |
| `send-plan` `entzug` | Sarcină retrasă | Însărcinare retrasă | wie `notifEntzug` (Push-Titel) |

Daten gelesen: FRAG, REF, EXTRA (Intl-Pfad), Bibelbücher, Function-Titel.
Fachwörter nachgesehen: Zusammenkunft „Viața creștină și predicarea",
„Caietul pentru întrunirea …", „cursant", „partener", „consilier",
„clase suplimentare", „supraveghetorul de circumscripție" (S-38); „grupă de
serviciu", „supraveghetorul grupei", „asistentul său", „slujitor auxiliar",
„întrunirile pentru serviciul de teren" (Wachtturm Juni 2026).

Offen, nicht geändert: In der Anmelde-Mail geht es nach „Bună, {name}," klein
weiter. Ob das Rumänische dort groß schreibt (wie Englisch, Spanisch,
Französisch) oder klein (wie Deutsch, Italienisch, Polnisch), habe ich nicht
belegen können — eine Frage für einen Muttersprachler. „partener"
(Trolley-Partner) ist männlich wie das deutsche „Partner".

### tr · Türkisch

16. Oktober 2026 · alle 747 gelesen · Anrede: sen, Gruppen „siz" · 46
Korrekturen im Wörterbuch (13 davon das eine Fachwort, unten in einer Zeile),
2 in FRAG. Das Türkische kennt kein Genus und setzt nach Zahlen den Singular
(„{n} kayıt" ist richtig) — beides prüfte sich hier von selbst.

| Schlüssel | alt | neu | Grund |
| --- | --- | --- | --- |
| `anmeldungOhneDb` | … giriş yalnızca canlandırılıyor … | … giriş yalnızca simüle ediliyor … | „canlandırılıyor“ heißt „wird belebt/gespielt“; gemeint ist nachgestellt |
| `linkMailText` | … ve yalnızca seni giriş yaptırır. … | … ve yalnızca senin içindir. … | „seni giriş yaptırır“ ist kein Türkisch („lässt dich anmelden“ ohne Objekt) |
| `alleGelesen` | Tümünü okundu işaretle | Tümünü okundu olarak işaretle | „olarak“ fehlte |
| `fsShort` | Tarla hizmeti | Tarla hizmeti buluşmaları | „Treffpunkte“ hieß wie das Thema (tabFs „Tarla hizmeti“) — auf dem Treffpunkt-Bogen stand es doppelt; jw.org: „tarla hizmeti buluşmaları“ (Wachtturm Juni 2026) |
| `toastFsRuleAdd` | Programa eklendi | Temel programa eklendi | Der Grundplan heißt „Temel program“ (fsGrundplan) |
| `toastFsRuleDel` | Programdan kaldırıldı | Temel programdan kaldırıldı | wie toastFsRuleAdd |
| `vpVorgemerkt` | Bu hafta henüz yüklenmedi. Konuşma, haftanın programı içe aktarılır aktarılmaz işlenecek. | Bu hafta henüz oluşturulmadı. Konuşma, haftanın programı getirilir getirilmez işlenecek. | Deutsch: „angelegt“ und „geholt“ — der Knopf heißt „Getir“ (holen) |
| `wpNamePhSaal` | örn. Kar temizliği | örn. kar temizliği | Nach „örn.“ klein wie in den übrigen Platzhaltern |
| `absageNachrichtBeispiel` | ör. o gün yolculuktayım | örn. o gün yolculuktayım | Sonst überall „örn.“ |
| `spurDuSagstAb` | İptal ediyorsun | Görevden çekiliyorsun | wie absagen |
| `spurErsatzGesucht` | Yedek aranıyor | Yerine biri aranıyor | Wie die Mitteilung (notifErsatzGesucht, Function substitute) |
| `suchen` | Ara … | Ara… | Kein Leerzeichen vor den Auslassungspunkten (wie „Gönderiliyor…“) |
| `langSearchPh` | Dil ara … | Dil ara… | wie suchen |
| `holtProgramm` | Program getiriliyor … | Program getiriliyor… | wie suchen |
| `laedt` | Yükleniyor … | Yükleniyor… | wie suchen |
| `keineAbwesenheiten` | Kayıtlı devamsızlık yok. | Henüz kayıt yok. | Abwesenheit heißt sonst „yokluk“ (abwesenheiten, abwEintragen); „devamsızlık“ ist das Fehlen in der Schule |
| `linkAbgelaufenHint` | … Yenisi yine 30 gün geçerli. … | … Yeni bağlantı 30 gün geçerli olacak. … | „yine“ doppelt zu „yeni“ (wie fr/it/pl/ru/uk/ro) |
| `ohneLinkHintMail` | … {name} içeride — şifre gerekmez. … | … {name} giriş yapmış olur — şifre gerekmez. … | „içeride“ (drinnen) ist salopp; sonst „giriş yap“ |
| `perEmailHint` | Bağlantıya bir dokunuş yeter, {name} içeride. | Bağlantıya bir dokunuş yeter, {name} giriş yapmış olur. | wie ohneLinkHintMail |
| `linksSendenIntro` | … bir dokunuşla içeridedir. … | … bir dokunuşla giriş yapar. … | wie ohneLinkHintMail |
| `eineAdresseMehrereHint` | … Her bağlantı yalnızca bir kişiyi içeri alır. … | … Her bağlantıyla yalnızca bir kişi giriş yapar. … | wie ohneLinkHintMail |
| `ohneEmailListeHint` | … Bir tarama yeter, içeridedirler. … | … Bir tarama yeter, giriş yapmış olurlar. … | wie ohneLinkHintMail |
| `zettelAnleitung` | … hemen içeridesin. … | … hemen giriş yapmış olursun. … | wie ohneLinkHintMail |
| `toastKeinePassende` | Açık yerler için uygun ve müsait kişi yok | Boş yerler için uygun ve müsait kişi yok | Offene Plätze heißen sonst „boş“ (offenWort, lageOffen, toastKeineOffen) |
| `toastVonBis` | Başlangıç ve Bitiş gir | “Başlangıç” ve “Bitiş” gir | Feldnamen (von, bis) in Anführungszeichen, wie trolleyFehlerZeit |
| `absagen` | İptal et | Görevden çekil | Im Absage-Blatt standen „İptal et“ (Absagen) und „İptal“ (Abbrechen) nebeneinander |
| `ersatzHint` | Bir yardımcı görevi iptal edersen, uygun olanlar arasından otomatik olarak bir yedek aranır. | Bir yardımcı görevden çekilirsen, uygun olanlar arasından otomatik olarak yerine biri aranır. | wie absagen; Ersatz wie in der Mitteilung |
| `erinAbsage` | İptal | Görevden çekilme | wie absagen |
| `toastErsatzGesucht` | İptal edildi · yedek aranıyor | Görevden çekildin · yerine biri aranıyor | wie absagen und spurErsatzGesucht |
| `lacPh` | Yeni madde, örn. yerel duyurular | Yeni bölüm, örn. yerel duyurular | Programmpunkte heißen sonst „bölüm“ (programmpunktEinfuegen „Bölüm ekle“) |
| `toastLacAdd` | Madde eklendi · saatler ayarlandı | Bölüm eklendi · saatler ayarlandı | wie lacPh |
| `toastLacDel` | Madde kaldırıldı · saatler ayarlandı | Bölüm kaldırıldı · saatler ayarlandı | wie lacPh |
| `ohneGruppeHint` | … Grubu olmayan kişi Tarla hizmeti bölümünde grupların tarla buluşmalarını görmez. … | … Grubu olmayan kişi “Tarla hizmeti” bölümünde grupların tarla hizmeti buluşmalarını görmez. … | Zitierter Menüpunkt (tabFs) in Anführungszeichen wie im Deutschen; Fachwort wie fsShort |
| 13 Schlüssel: `fsVers`, `fsKeine`, `privTreffpunkt`, `fsLeiterLbl`, `fsLeiterRolle`, `toastFsAdd`, `toastFsDel`, `fsSkipCong`, `gbWirkung`, `druckVersammlungstreffpunkte`, `druckGruppentreffpunkte`, `treffpunkteDieserWoche`, `gruppeDelTreffpunkte` | … tarla buluşması/-ları/-larını … | … tarla hizmeti buluşması/-ları/-larını … | jw.org: „tarla hizmeti buluşması“ (Wachtturm Juni 2026), wie fsShort; das bloße „buluşma“ (Reiter, Blatt) blieb |
| FRAG `Treffpunkte` | Tarla hizmeti | Tarla hizmeti buluşmaları | wie `fsShort` |
| FRAG `Treffpunkt-Leiter` (`FS_LEADER_WORD`) | Tarla buluşmasını idare eden | Tarla hizmeti buluşmasını idare eden | wie `fsLeiterRolle` (`rollen-uebersetzt.test.ts` hält beide zusammen) |

Daten gelesen: FRAG (gemessen: „TARLA HİZMETİNDE KENDİNİZİ GELİŞTİRİN" und
„Rastlantıda şahitlik" stehen so in mwb26), REF, EXTRA (Intl-Pfad),
Bibelbücher, Function-Titel. Fachwörter nachgesehen: „İkinci Oda",
„Hayatımız ve Hizmetimiz İbadeti (Kitapçığı)", „öğrenci", „yardımcısı",
„Çevre Gözetmeninin Ziyareti", „Anma Toplantısı", „Çevre Toplantısı veya
Bölge Kongresi" (S-38); „tarla hizmeti grubu", „grup gözetmeni",
„hizmet görevlisi" (Wachtturm Juni 2026).

Offen, nicht geändert: Den Ratgeber der zweiten Klasse nennt die S-38
„öğüt verecek yeterli biri" (kein Rollenwort); der Hauptratgeber heißt dort
„rehber gözetmen". `auxRatgeber` bleibt „Danışman". Die Wochenspanne setzt ICU
als „7 – 13 Eylül" (schmale Leerzeichen), jw.org schreibt „7-13 Eylül". Für
„lmd Lektion 9" und „lff Lektion 20" ohne Punkt fehlt die Vorlage
(`lmdLek`, `lffLek`, siehe Teil 2) — die Zeile bleibt deutsch.
