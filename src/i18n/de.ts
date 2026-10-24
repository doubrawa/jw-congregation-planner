/**
 * DE-Basiswörterbuch (v3): alle UI-Schlüssel auf Deutsch — Quelle für den
 * Dict-Typ und Basis der Fallback-Kette (DE ← EN ← Sprache, siehe ui.ts).
 * `{n}` / `{name}` / `{m}` sind Platzhalter.
 */

export const DE = {
    congLabel: 'Versammlung {name}',
    navStart: 'Start', navAufgaben: 'Aufgaben', navAufgabenLong: 'Meine Aufgaben',
    navPersonen: 'Personen', navEinstellungen: 'Einstellungen',
    navProfil: 'Profil', menueLbl: 'Menü',
    // Hauptmenü nach Themen (T120): das Thema „Zusammenkünfte", die Überschrift
    // des Admin-Abschnitts und die erste Stellung des Schalters Ansehen/Planen.
    navZusammenkuenfte: 'Zusammenkünfte', navVerwaltung: 'Verwaltung', ansehen: 'Ansehen',
    abmelden: 'Abmelden', rolleKoordinator: 'Admin', rolleVerkuendiger: 'Verkündiger',
    // Unter dem Namen in der Seitenleiste (5.10.2026): Wer eine Gruppe leitet, darf
    // ihre Treffpunkte ändern und senden — „Verkündiger" sagte das nicht. Die
    // Wörter wie `aufseherLbl`/`gehilfeLbl`, gemessen am Wachtturm Juni 2026.
    rolleGruppenaufseher: 'Gruppenaufseher', rolleGehilfe: 'Gehilfe',
    // Die Rechte-Stufe zwischen Verkündiger und Admin (4.10.2026): teilt zu und
    // sendet, ändert die Pläne aber nicht. Steht im Kopf und als Schalter unter
    // „Feste Rollen".
    rollePlaner: 'Planer',
    // Zwei-Tipp-Bestätigung beim Abmelden (AbmeldenKnopf), wie `loeschenSicher`.
    abmeldenSicher: 'Wirklich abmelden?',
    // Offline-Stand (lib/snapshot.ts): {m} = Zeitpunkt der Momentaufnahme
    offlineBanner: 'Offline · Stand von {m}', offlineBannerHint: 'Nur lesen — keine Änderungen möglich', offlineLangsam: 'Verbindung langsam · Stand von {m}',
    offlineReadOnly: 'Offline — Änderungen sind erst wieder online möglich',
    offlineRetry: 'Neu laden',
    emailPh: 'name@beispiel.de',
    anmeldungOhneDb: 'Ohne Datenbank · Anmelden ist nur nachgestellt',
    // Anmelden per Link (T121, Phase 8): kein Kennwort, ein Link per E-Mail
    // oder ein Zettel mit QR-Code und Code. `anmeldenTitel` ist die Überschrift,
    // `anmeldenKnopf` der Knopf — in manchen Sprachen zwei Wortformen.
    // „Link senden" steht in der E-Mail (`linkMailText`) und auf dem Zettel
    // als zitierter Knopf: Beide müssen ihn wörtlich so nennen.
    anmeldenTitel: 'Anmelden', anmeldenKnopf: 'Anmelden',
    ohnePasswort: 'Ein Passwort gibt es nicht. Du bekommst einen Link per E-Mail.',
    linkSenden: 'Link senden',
    linkUnterwegs: 'Ist die Adresse in einer Versammlung eingetragen, kommt gleich eine E-Mail mit deinem Link.',
    mailNichtEingerichtet: 'Die App kann gerade keine E-Mails senden. Nimm den Code von deinem Zettel oder frag die Ältesten.',
    ohneMailFrage: 'Ohne E-Mail-Adresse?',
    ohneMailHinweis: 'Scanne den QR-Code auf deinem Zettel oder tippe den Code darunter ein. Ist der Zettel weg, bekommst du von den Ältesten einen neuen.',
    // Wo die App nicht scannt (Desktop, ohne Kamera): nur das Eintippen, das Scannen geht mit dem Handy.
    ohneMailHinweisTippen: 'Tippe den Code von deinem Zettel ein. Ist der Zettel weg, bekommst du von den Ältesten einen neuen. Am Handy scannst du einfach den QR-Code.',
    zettelScannen: 'Zettel scannen', codeEintippen: 'Code eintippen', mitCodeAnmelden: 'Mit Code anmelden',
    codeLbl: 'Code', codeHinweis: 'Der Code steht auf deinem Zettel unter dem QR-Code.',
    codePasst: 'Der Code passt',
    codeNichtDu: 'Das bist nicht du? Dann frag bitte in deiner Versammlung nach.',
    codeUnbekannt: 'Diesen Code gibt es nicht. Prüfe ihn bitte noch einmal.',
    codeAbgelaufen: 'Dieser Code gilt nicht mehr. Frag die Ältesten nach einem neuen Zettel.',
    angemeldetBleiben: 'Danach bleibst du auf diesem Gerät angemeldet.',
    linkUngueltig: 'Dieser Link gilt nicht mehr. Lass dir einen neuen schicken oder frag die Ältesten.',
    anmeldenFehler: 'Die Anmeldung hat nicht geklappt. Versuche es bitte noch einmal.',
    zuVieleVersuche: 'Zu viele Versuche. Versuche es in einer Stunde noch einmal.',
    scannenHinweis: 'Halte den QR-Code auf deinem Zettel vor die Kamera.',
    kameraFehlt: 'Die Kamera lässt sich nicht öffnen. Tippe den Code stattdessen ein.',
    scanFremd: 'Das ist kein Anmelde-Zettel dieser App.',
    // Die E-Mail mit dem Link — vom Server (`send-invite`, `anmelden`) wie aus
    // dem eigenen Mail-Programm. {versammlung} ist der Name der Versammlung,
    // {datum} der letzte Tag, an dem der Link gilt (aus `Intl`), {code} der
    // Code zum Eintippen (T121, Phase 10): Auf dem iPhone öffnet der Link
    // Safari, nie die App vom Home-Bildschirm — dort hilft nur der Code.
    linkMailBetreff: 'Dein Zugang zur Versammlung {versammlung}',
    linkMailText: 'Hallo {name},\n\ndie Versammlung {versammlung} plant die Zusammenkünfte und den Predigtdienst mit Versammlung.app. Dein Zugang ist eingerichtet.\n\nJetzt anmelden:\n{url}\n\nHast du die App auf dem Home-Bildschirm? Dann öffne sie dort, tippe auf „Code eintippen“ und gib diesen Code ein:\n{code}\n\nLink und Code gelten bis {datum} und melden nur dich an. Ein Passwort brauchst du nicht. Sind sie abgelaufen, öffne die App und tippe auf „Link senden“.\n\nDu bekommst diese E-Mail, weil du in der Versammlung {versammlung} eingetragen bist. Bei Fragen sprich die Ältesten an.',
    nurMitglieder: 'Zugang nur für Mitglieder der Versammlung',
    // Anmeldeseite (T113): wofür die App da ist, und der Weg zum Betreiber für
    // eine neue Versammlung. Die Adresse selbst steht in login/kontakt.ts.
    appZweck: 'Zusammenkünfte planen, Aufgaben verteilen, die Versammlung verwalten.',
    versammlungAnfragen: 'Neue Versammlung anfragen:', anfrageBetreff: 'Neue Versammlung: Versammlung.app',
    mitteilungen: 'Mitteilungen', neuN: 'Neu: {n}', alleGelesen: 'Alle gelesen',
    keineMitteilungen: 'Keine Mitteilungen',
    // Die beiden Abschnitte der Mitteilungen (T121): ungelesen, schon gelesen.
    mitteilungenNeu: 'Neu', mitteilungenFrueher: 'Früher',
    aktuelleWoche: 'Aktuelle Woche', tabMid: 'Zusammenkunft unter der Woche', tabWe: 'Zusammenkunft am Wochenende',
    // Kurzlabel der Programm-/Planen-Reiter: „Versammlung <Wochentag>"
    versammlungTag: 'Versammlung {tag}',
    // Treffpunkte (Zusammenkünfte für den Predigtdienst)
    tabFs: 'Predigtdienst', fsShort: 'Treffpunkte',
    fsVers: 'Versammlungstreffpunkt', fsKeine: 'Keine Treffpunkte in dieser Woche.',
    privTreffpunkt: 'Treffpunkte leiten',
    // Der Aufgabenbereich „Trolley" (T121, Phase 7; davor „Öffentliches
    // Zeugnisgeben" mit Stand und Schicht). Der Schlüssel ist geblieben: Er
    // steht als `zeugnis` in `persons.priv` jeder Person.
    privZeugnis: 'Trolley',
    fsNurWoche: 'Änderungen hier gelten nur für diese Woche.',
    fsLeiterLbl: 'Treffpunkt-Leiter',
    // Dasselbe Wort als Rolle **einer** Aufgabe („Meine Aufgaben", Glocke, Push).
    // Im Deutschen gleich lautend, in den anderen Sprachen nicht: `fsLeiterLbl`
    // beschriftet die Zeile „Automatisch zuteilen" und steht dort im Plural.
    fsLeiterRolle: 'Treffpunkt-Leiter',
    fsOrtPh: 'Ort (z. B. Königreichssaal)',
    // Treffpunkte planen (T121, Entwurf `GTreffpunktePlanen`): der Knopf unter
    // den Tagen und der Titel seines Blatts. `ortLbl` und `hinzufuegenKnopf`
    // sind allgemein, für jedes Blatt mit Ort bzw. Anlegen.
    fsFuerDieseWoche: 'Treffpunkt für diese Woche', ortLbl: 'Ort', hinzufuegenKnopf: 'Hinzufügen',
    fsFuerJedeWoche: 'Treffpunkt für jede Woche', haeufigkeitLbl: 'Häufigkeit',
    toastFsAdd: 'Treffpunkt hinzugefügt', toastFsDel: 'Treffpunkt entfernt',
    // Die Reiter des Predigtdienstes beim Planen (T120). Nicht `fsShort`: Das
    // steht in vielen Sprachen gleich wie `tabFs` („Field Service") und hieße
    // dort unter dem Thema noch einmal genauso.
    fsTreffpunkteTab: 'Treffpunkte', fsGrundplan: 'Grundplan',
    fsGrundDesc: 'Regelmäßige Zeiten und Orte. Änderungen setzen die Wochenpläne neu auf; einzelne Wochen passt du unter „Treffpunkte“ an.',
    fsFreqW: 'Jede Woche', fsFreqM1: 'Jeden 1. im Monat', fsFreqM2: 'Jeden 2. im Monat',
    fsFreqM3: 'Jeden 3. im Monat', fsFreqM4: 'Jeden 4. im Monat',
    fsSkipCong: 'Außer bei Versammlungstreffpunkt',
    toastFsRuleAdd: 'Zum Grundplan hinzugefügt', toastFsRuleDel: 'Aus dem Grundplan entfernt',
    // Gruppenbesuche des Dienstaufsehers (T120, Phase 2). „Dienstaufseher" ist
    // gemessen: od Kap. 5 Abs. 33/36 in jeder Sprache, fa/ur über die WOL-Suche
    // (dort fehlt das od). Abwesenheit sagt `toastAbsentP`.
    // Die weiche Trennstelle (U+00AD): Am Handy bricht der Name in der Leiste
    // des Predigtdienstes (`FsBereichTabs`) an der Fuge — sonst trennte das
    // Wörterbuch so spät wie möglich („Gruppenbesu-che").
    fsGruppenbesucheTab: 'Gruppen\u00adbesuche',
    gbTitel: 'Gruppenbesuche des Dienstaufsehers',
    gbWirkung: 'In der Besuchswoche leitet der Besucher die Treffpunkte der Gruppe. Zusage, Erinnerung und „Plan senden“ laufen über den Treffpunkt – wie bei jedem anderen Leiter.',
    gbBesucher: 'Besucher', gbBesucherWaehlen: 'Besucher wählen',
    gbLeer: 'Noch keine Besuche geplant.',
    gbVorgemerkt: 'vorgemerkt', gbVorbei: 'vorbei',
    gbVorgemerktHint: 'Die Woche ist noch nicht geladen. Eingetragen wird, sobald ihr Programm importiert ist.',
    gbAndererLeiter: 'Den Treffpunkt leitet schon {name}.', gbUebernehmen: 'Übernehmen',
    gbOffen: 'Der Treffpunkt hat noch keinen Leiter.', gbEintragen: 'Eintragen',
    gbKeinTreffpunkt: 'Die Gruppe trifft sich in dieser Woche nicht.',
    gbHinzufuegen: 'Besuch hinzufügen', gbWoche: 'Woche', gbGruppe: 'Gruppe',
    gbDeineGruppe: 'Deine Gruppe', gbAlle: 'Alle Besuche',
    gbLeitetDann: '{name} leitet dann euren Treffpunkt.',
    gbMarker: 'Besuch des Dienstaufsehers',
    toastBesuchAdd: 'Besuch eingetragen', toastBesuchDel: 'Besuch entfernt',
    // Vortragsplan aus dem Planungsprogramm (T122). Die Datei liest das Gerät;
    // nur Redner, Versammlung, Thema und Lied gehen weiter. Zahlen stehen
    // hinter einer Bezeichnung („Unverändert: 3"), damit keine Sprache zählen
    // muss. Abbrechen und die Anlässe der Woche sagen schon `abbrechen`,
    // `coWoche`, `kongress` und `memWoche`. „Übernehmen" und „vorgemerkt" nicht
    // von den Gruppenbesuchen leihen: Dort heißen sie „Take over" und reden in
    // den Übersetzungen vom Besuch. Die Karte steht bei den Wochen unter
    // „Holen": Titel, darunter was kommt, daneben der Knopf.
    vpTitel: 'Vortragsplan',
    vpKarteUnter: 'Redner, Thema und Lied für die kommenden Wochen',
    vpDateiWaehlen: 'XML-Datei wählen',
    vpVorschau: 'Vortragsplan übernehmen', vpUebernehmen: 'Übernehmen',
    vpNeu: 'Neu', vpGeaendert: 'Geändert', vpEntfaellt: 'Entfällt', vpNichtUebernommen: 'Nicht übernommen',
    vpUnveraendert: 'Unverändert: {n}',
    vpVergangen: 'Vergangene Wochen, nicht angefasst: {n}',
    vpBisher: 'Bisher: {name}',
    vpVorgemerkt: 'Die Woche ist noch nicht angelegt. Der Vortrag wird eingetragen, sobald ihr Programm geholt ist.',
    vpOhnePerson: 'Keine Person mit diesem Namen – ohne Aufgabe und Erinnerung.',
    vpIgnoriert: 'Bleibt auf diesem Gerät: {felder}',
    vpNichtsZuTun: 'Die Datei bringt nichts Neues.',
    vpFehlerDatum: 'Datum ungültig', vpFehlerRedner: 'Redner fehlt',
    vpFehlerVersammlung: 'Versammlung fehlt', vpFehlerLied: 'Lied ist keine Nummer',
    vpFehlerDoppelt: 'Zwei Vorträge in einer Woche',
    vpKeinXml: 'Die Datei ist kein lesbares XML.',
    vpFormat: 'Die Datei ist kein Vortragsplan in Version 1.',
    vpZeitraum: 'Der Zeitraum in der Datei (von/bis) ist ungültig.',
    toastVortraegeUebernommen: 'Vortragsplan übernommen',
    // „Verlegen" öffnet in „Woche einrichten" die Abweichung einer
    // Zusammenkunft (`WochePanel`).
    verlegen: 'Verlegen', abbrechen: 'Abbrechen',
    // Trolleys (T121, Phase 7): Wer das Trolley-Recht hat, verabredet sich und
    // trägt sich ein — frei von 6 bis 22 Uhr in halben Stunden, mit Partner
    // oder allein mit „Partner gesucht". Niemand plant, niemand sagt zu.
    fsTrolleysTab: 'Trolleys',
    toastTrolleyEingetragen: 'Eingetragen',
    toastTrolleyDazu: 'Du bist dabei',
    toastTrolleyAusgetragen: 'Ausgetragen',
    toastTrolleyEntfernt: 'Trolley entfernt',
    // Die Ansicht (Entwürfe `GZeugnis`, `GDesktopTrolleys`). Namen, Tage und
    // Zeiten stehen hinter einer Bezeichnung oder in einem eigenen Satzteil —
    // keine Sprache muss beugen.
    trolleyIntro: 'Verabredet euch und tragt euch ein. So sehen alle, wann ein Trolley unterwegs ist.',
    trolleyDeineTermine: 'Deine Termine',
    trolleyPartnerGesucht: 'Partner gesucht',
    trolleyDazukommen: 'Dazukommen',
    trolleyEintragen: 'Eintragen',
    trolleyEintragenLabel: 'Für den Trolley eintragen',
    trolleyMit: 'mit {name}',
    trolleyBeideEingetragen: '{name} hat euch beide eingetragen',
    trolleyAbholen: 'abholen: {ort}',
    trolleyTag: 'Tag',
    trolleyTagMitTerminen: '{tag}, mit Terminen',
    trolleyWocheLabel: 'Trolleys in der Woche {woche}',
    trolleyTippFrei: 'Tippe auf eine freie Zeit, um dich dort einzutragen.',
    trolleyKlickFrei: 'Klicke in ein freies Feld, dann stehen Tag und Trolley rechts schon drin.',
    trolleyFreiWaehlen: '{trolley}: freie Zeit wählen und eintragen',
    trolleyFreiZelle: '{tag}, {trolley}: frei, eintragen',
    trolleyTerminLabel: '{trolley}, {zeit}: {wer}',
    trolleyUnd: '{a} und {b}',
    trolleySuchtPartner: '{name} sucht einen Partner',
    // Das Blatt „Eintragen" (`GTrolleyEintragen`) und das Blatt eines Termins.
    trolleyZeitHinweis: 'Zwischen 6 und 22 Uhr, in halben Stunden.',
    trolleyMitWem: 'Mit wem',
    trolleyMitPartner: 'Mit Partner',
    trolleyPartner: 'Partner',
    trolleyPartnerWaehlen: 'Partner wählen',
    trolleyPartnerHinweis: '{name} bekommt eine Mitteilung. Am Vortag erinnert die App euch beide.',
    trolleyGesuchtHinweis: 'Wer mitkommen möchte, sieht dich unter „Partner gesucht“. Am Vortag erinnert dich die App.',
    trolleyWer: 'Wer dabei ist',
    trolleyAustragen: 'Austragen',
    trolleyAustragenHinweis: '{name} bekommt Bescheid und sucht dann wieder einen Partner.',
    // Was nicht ging — dieselben Gründe, die die Function `trolley` nennt.
    trolleyFehlerKeinRecht: 'Eintragen kann sich, wer mit dem Trolley gehen darf. Sprich dafür die Ältesten an.',
    trolleyFehlerVorbei: 'Dieser Tag ist schon vorbei.',
    trolleyFehlerZeit: '„Bis“ muss nach „Von“ liegen.',
    trolleyFehlerBelegt: 'Der Trolley ist zu dieser Zeit schon unterwegs.',
    trolleyFehlerDoppelt: 'Du bist zu dieser Zeit schon eingetragen.',
    trolleyFehlerPartnerDoppelt: '{name} ist zu dieser Zeit schon eingetragen.',
    trolleyFehlerPartnerRecht: '{name} darf nicht mit dem Trolley gehen.',
    trolleyFehlerSchonPartner: 'Da ist schon jemand dazugekommen.',
    trolleyFehlerWeg: 'Diesen Termin gibt es nicht mehr.',
    trolleyFehlerStand: 'Inzwischen hat sich etwas geändert. Der Stand ist neu geladen.',
    trolleyFehlerNetz: 'Keine Verbindung. Versuche es später noch einmal.',
    // Die Trolleys der Versammlung pflegt der Admin (Einstellungen „Gruppen und
    // Trolleys", Entwürfe `GGruppenStandorte`, `GTrolley`).
    trolleyHinzu: 'Trolley hinzufügen',
    trolleyOrtLbl: 'Wo man ihn abholt',
    trolleyHinweisLbl: 'Hinweis (freiwillig)',
    trolleyOrtKopf: 'Abholen',
    trolleyHinweisKopf: 'Hinweis',
    trolleyKommende: 'Kommende Termine',
    trolleyTermineN: 'Termine: {n}',
    trolleyWennEntfernt: 'Wenn du den Trolley entfernst',
    trolleyDelTermine: 'Die kommenden Termine entfallen.',
    trolleyDelBescheid: 'Wer eingetragen ist, bekommt Bescheid.',
    trolleyEntfernen: 'Trolley entfernen',
    // Der eigene Termin in „Meine Aufgaben" (Entwurf `GAufgaben`): verabredet, keine Zusage.
    trolleyOhneZusage: 'verabredet, ohne Zusage',
    // Weitere Pläne (T120, Phase 5): Ankündigungen ohne Zuteilung. Ein Plan
    // heißt „Königreichssaal" wie `saal`; gemessen am od Kap. 11 Abs. 10 („Im
    // Allgemeinen wechseln sich die Predigtdienstgruppen mit der Saalreinigung
    // ab").
    navWeiterePlaene: 'Weitere Pläne',
    wpHinweis: 'Ankündigungen ohne Zuteilung: Niemand muss etwas bestätigen, und es gibt keine Erinnerung.',
    wpNeu: 'Neuer Plan',
    wpAktuell: 'Aktuell', wpEntwuerfe: 'Entwürfe', wpAbgeschlossen: 'Abgeschlossen',
    wpKeine: 'Zurzeit gibt es keine weiteren Pläne.',
    wpOhneName: 'Ohne Namen',
    // Der Takt (4.10.2026): je Woche oder je Monat eine Gruppe. „Jede Woche"
    // steht schon bei den Treffpunkten (`fsFreqW`) und wird hier mitbenutzt.
    wpTakt: 'Die Gruppen wechseln', wpJedenMonat: 'Jeden Monat',
    wpNamePhSaal: 'z. B. Winterdienst',
    // Seit dem 4.10.2026 auch der Planer (`plan_sichtbar` in schema.sql); seit
    // dem 15.10.2026 veröffentlicht er auch selbst.
    wpEntwurf: 'Entwurf', wpEntwurfHint: 'Einen Entwurf sehen nur Admins und Planer.',
    wpVeroeffentlichen: 'Veröffentlichen', wpZurueckziehen: 'Zurück zum Entwurf',
    wpSichtSaal: 'Veröffentlicht sieht ihn die ganze Versammlung.',
    wpAbGruppe: 'Beginnen mit',
    wpVerteilenHint: 'Die Wochen ab dieser bis zum Ende, die Gruppen der Reihe nach. Vergangene Wochen bleiben, wie sie sind.',
    wpVerteilenHintMonat: 'Die Monate ab diesem bis zum Ende, die Gruppen der Reihe nach. Vergangene Monate bleiben, wie sie sind.',
    wpLoeschen: 'Plan löschen',
    wpDeineGruppe: 'Deine Gruppe ist dran:',
    wpNurInfo: 'Nur zur Info – nichts zu bestätigen.',
    // Plan bearbeiten (T121, Phase 5f): die Unteransicht mit Spur, Zeitraum im
    // Kalender und Vorschau; in der Liste je nach Stand, ab oder bis wann er gilt.
    wpPlanBearbeiten: 'Plan bearbeiten', wpVorschau: 'Vorschau', alleAnzeigen: 'Alle anzeigen',
    wpAbDatum: 'ab {datum}', wpBisDatum: 'bis {datum}', wpEndete: 'endete am {datum}',
    zeitraumLbl: 'Zeitraum',
    toastWpVeroeffentlicht: 'Plan veröffentlicht', toastWpEntwurf: 'Plan zurück im Entwurf',
    toastWpGeloescht: 'Plan gelöscht', toastWpVerteilt: 'Verteilte Wochen: {n}',
    toastWpVerteiltMonate: 'Verteilte Monate: {n}',
    hilfsdienste: 'Hilfsdienste', stand: 'Stand: {datum}', drucken: 'Drucken',
    // Druck-Auswahl (T105): die angezeigte Woche oder alle Wochen des Monats.
    druckWoche: 'Diese Woche', druckMonat: 'Ganzer Monat · {monat}',
    // Unter dem Titel des Druck-Blatts der Zusammenkünfte (T121).
    druckZusammenkuenfte: 'Zusammenkünfte mit allen Zuteilungen.',
    // Druckbögen (T121, Phase 9): Fuß jedes Blatts hinter „Stand: …"; unter den
    // Hilfsdiensten, was die gepunktete Linie heißt; auf dem Monatsbogen
    // Schüler und Partner in einer Zeile.
    aenderungenInDerApp: 'Änderungen stehen in der App',
    druckNochFrei: 'noch frei – wer übernehmen kann, meldet sich in der App oder bei den Ältesten.',
    druckMit: '{a} mit {b}',
    // Bogen der Treffpunkte (Entwurf GDruckTreffpunkte): Überschriften, Spalten
    // und was gegenüber dem Grundplan anders ist — „statt {alt}" nennt Zeit und
    // Ort, die sonst gelten.
    druckVersammlungstreffpunkte: 'Versammlungstreffpunkte', druckGruppentreffpunkte: 'Gruppentreffpunkte',
    druckAndersAlsSonst: 'Anders als sonst', druckEntfaellt: 'entfällt', druckZusaetzlich: 'zusätzlich',
    druckStatt: 'statt {alt}', druckTag: 'Tag', druckZeit: 'Zeit', druckTreffpunkt: 'Treffpunkt',
    // Bogen eines Weiteren Plans (Entwurf GDruckPlaene), je nach Takt.
    druckPlanJeWoche: 'Jede Woche ist eine Gruppe dran, von Montag bis Sonntag.',
    druckPlanJeMonat: 'Jeden Monat ist eine Gruppe dran.', druckMonatSpalte: 'Monat',
    // Bogen der Trolleys (Entwurf GDruckTrolleys); {weg} ist „Predigtdienst · Trolleys".
    druckTrolleyIntro: 'Verabredet euch und tragt euch in der App ein, unter {weg}. Gestrichelt: Hier sucht jemand einen Partner – wer mitgehen möchte, trägt sich dazu.',
    // Kongresswoche (T121): statt des Programms der leere Saal und zwei Wege.
    kongressAusfall: 'In dieser Woche fallen alle Zusammenkünfte aus.',
    treffpunkteDieserWoche: 'Treffpunkte dieser Woche',
    naechsteZusammenkunft: 'Nächste Zusammenkunft · {wann}',
    planen: 'Planen', offeneZut: 'Offene Zuteilungen: {n}',
    leeren: 'Leeren', leerenSicher: 'Wirklich leeren?',
    zuteilenChip: '— zuteilen', offenWort: 'offen', offenDash: '— offen —',
    // Das Schlussgebet am Wochenende plant niemand (T133): Es spricht der Redner,
    // wenn er bleibt, sonst bittet der Studienleiter vor Ort jemanden.
    schlussgebetVorOrt: 'Redner oder vor Ort',
    // Start / Dashboard
    grussMorgen: 'Guten Morgen', grussTag: 'Guten Tag', grussAbend: 'Guten Abend',
    dashKeineAufgabe: 'Keine anstehende Aufgabe',
    dashZuBest: 'Zu bestätigen', dashPlanung: 'Planung',
    dashAllesZugeteilt: 'Alles zugeteilt',
    abwesenheiten: 'Abwesenheiten',
    von: 'Von', bis: 'Bis', grundOpt: 'Grund (optional)', grundPh: 'z. B. Urlaub',
    datumPh: 'Datum wählen',
    abwEintragen: 'Abwesenheit eintragen',
    abwHinweis: 'In dieser Zeit wirst du nicht eingeteilt. Bestehende Zuteilungen sehen die Planer als Konflikt.',
    // Warnung im Planen: Für diesen Bereich sind an dem Tag weniger Leute da
    // als Plätze — Plätze, die offen bleiben MÜSSEN, anders als „offene
    // Zuteilungen", die nur noch nicht getan sind.
    engpassZeile: '{bereich} · nötig {b} · verfügbar {v} · abwesend {a} von {q}',
    // Überschrift der Leiste im Personen-Detail. Sie hieß „AUFGABEN", zeigt
    // aber seit den Abwesenheiten beide Richtungen — wann jemand dran ist und
    // wann er nicht kann.
    zeitleiste: 'Zeitleiste',
    nameLbl: 'Name', versammlungLbl: 'Versammlung',
    darstellung: 'Darstellung', spracheLbl: 'Sprache',
    // Darstellung (T121): Dunkel, Hell, Automatisch.
    themeDunkel: 'Dunkel', themeHell: 'Hell', themeAuto: 'Automatisch',
    // Menü und Planen im neuen Design (T121).
    navPlanenVerwalten: 'Planen und verwalten', fertig: 'Fertig', planenBeenden: 'Planen beenden',
    // „Für mich" (T121, Phase 3): der Saal auf dem Start, die Woche der
    // Versammlung, das Blatt beim Öffnen und das Absagen mit seiner Spur.
    saalBesetzung: 'Besetzung', saalDeinPlatz: 'dein Platz ist markiert',
    dieseWocheVersammlung: 'Diese Woche in der Versammlung',
    alleBestaetigen: 'Alle bestätigen', spaeter: 'Später',
    absageFrage: 'Du kannst nicht?', absageIntro: 'Kein Problem. So geht es danach weiter:',
    spurDuSagstAb: 'Du sagst ab', spurErsatzGesucht: 'Ersatz gesucht', spurUebernommen: 'Übernommen',
    spurPlanerErfaehrt: 'Planer erfährt es', spurNeuZugeteilt: 'Neu zugeteilt',
    absageErklaerung: 'Der Planer erfährt es sofort und gibt die Aufgabe jemand anderem.',
    absageNachricht: 'Nachricht an den Planer (freiwillig)', absageNachrichtBeispiel: 'z. B. bin an dem Tag verreist',
    absageAbwesend: 'Den Tag als abwesend eintragen',
    personen: 'Personen', personenCount: 'Personen: {n}', suchen: 'Suchen …',
    // Personenliste und „Person anlegen" (T121, Phase 6a). Der Stand steht als
    // Etikett unter einer Zahl, an einer einzelnen Person („Gruppe 3 · Link
    // gesendet") und als Schritt der Spur ihres Kontos — übersetzt deshalb
    // ohne Numerus und Genus. „Link gesendet" heißt seit Phase 8 auch: als
    // Zettel ausgegeben; ein abgelaufener Link zählt als „Ohne Link".
    personAnlegen: 'Person anlegen',
    personAnlegenHinweis: 'Aufgabenbereiche legst du danach bei der Person fest.',
    emailFreiwillig: 'E-Mail (freiwillig)',
    standDerAnmeldung: 'Stand der Anmeldung',
    standAngemeldet: 'Angemeldet', standLink: 'Link gesendet', standOhneLink: 'Ohne Link',
    filterAlle: 'Alle', filterWeitere: 'Filter', filterZuruecksetzen: 'Zurücksetzen',
    personWaehlen: 'Wähle eine Person in der Liste, um sie hier zu sehen.',
    // Die Person (T121, Phase 6b). „Angelegt" ist der erste Schritt der Spur des
    // Kontos, vor `standLink` und `standAngemeldet` — deshalb wie diese
    // ohne Numerus und Genus. {w} ist die feste Zahl der Wochen der Auslastung
    // (8): Für sie stimmt die Mehrzahl in jeder Sprache.
    person: 'Person', personBearbeiten: 'Person bearbeiten', aendern: 'Ändern',
    spurAngelegt: 'Angelegt',
    auslastung: 'Auslastung',
    aufgabenLetzteW: 'Aufgaben in den letzten {w} Wochen: {n}',
    keineAbwesenheiten: 'Keine eingetragen.',
    keineBereiche: 'Noch keine Aufgabenbereiche.',
    rechte: 'Rechte', rechtPlanen: 'Darf planen',
    // Seit dem 15.10.2026 plant der Planer alles; beim Admin kommt die Verwaltung dazu.
    rechtPlanenUnter: 'Holt das Programm, richtet die Pläne ein, teilt zu und sendet.',
    rechtAdminUnter: 'Verwaltet auch Personen und Einstellungen.',
    toastNameLeer: 'Name nicht geändert: Ohne Namen geht es nicht',
    vorname: 'Vorname', nachname: 'Nachname', telefon: 'Telefon', emailLbl: 'E-Mail',
    kontoCard: 'Konto',
    persLoeschen: 'Person entfernen',
    confirmPersonDel: '„{name}“ wirklich entfernen? Bereits geplante Zuteilungen bleiben als Text in den Wochen stehen.',
    confirmPersonDelKonto: 'Auch das Konto wird entfernt. Anmelden geht erst wieder mit einem neuen Link.',
    toastPersonDel: 'Person entfernt',
    kontoVerknuepft: 'Konto verknüpft',
    // Der Link einer Person (T121, Phase 8; Entwürfe GPerson, GEinladen). {name}
    // ist ihr Vorname. „Link senden" heißt der Knopf auf der Anmeldeseite
    // (`linkSenden`) wie hier: Es ist derselbe Link.
    neuerLinkBtn: 'Neuen Link senden', zettelDrucken: 'Zettel drucken',
    linkOffenHint: 'Der Link ist noch nicht geöffnet. Bis dahin gibst du {name} persönlich Bescheid.',
    linkAbgelaufenHint: 'Der Link ist abgelaufen, ohne dass {name} sich angemeldet hat. Ein neuer gilt wieder 30 Tage.',
    ohneLinkHintMail: 'Ein Tipp auf den Link in der E-Mail, und {name} ist angemeldet — ein Passwort braucht es nicht.',
    ohneLinkHintZettel: 'Ohne E-Mail-Adresse bekommt {name} den Link auf einem Zettel mit QR-Code.',
    perEmail: 'Per E-Mail', perEmailHint: 'Ein Tipp auf den Link, und {name} ist angemeldet.',
    keineAdresseHint: 'Bei {name} ist keine E-Mail-Adresse eingetragen.',
    aufZettel: 'Auf einem Zettel', aufZettelHint: 'Mit QR-Code und Code zum Eintippen. Gültig bis {datum}.',
    neuerLinkErsetzt: 'Ein neuer Link ersetzt den alten — auch den auf einem Zettel.',
    ohneKontoHint: 'Ein Konto anlegen oder ein Passwort wählen muss {name} nicht. Nach der Anmeldung bleibt das Gerät angemeldet.',
    wirdGesendet: 'Wird gesendet …',
    toastLinkGesendet: 'Link an {name} gesendet', toastMailFehler: 'Die E-Mail an {name} ging nicht hinaus',
    linkFehler: 'Nicht jeder Link ließ sich ausstellen. Versuche es später noch einmal.',
    // „Links senden" für alle, die die Liste „Ohne Link" zeigt (Entwurf
    // GAlleEinladen). Nur Links — den Plan sendet der Planer wie gewohnt.
    linksSenden: 'Links senden',
    linksSendenIntro: 'Jede Person bekommt ihren eigenen Link: ein Tipp darauf, und sie ist angemeldet. Ein Passwort braucht niemand.',
    mailVorschau: 'So sieht die E-Mail aus', betreffLbl: 'Betreff: {betreff}',
    eineAdresseMehrere: 'Eine Adresse für mehrere',
    eineAdresseMehrereHint: '{namen} bekommen je ihren eigenen Link an dieselbe Adresse. Jeder Link meldet genau eine Person an.',
    ohneEmail: 'Ohne E-Mail-Adresse',
    ohneEmailListeHint: 'Sie bekommen ihren Link auf einem Zettel mit QR-Code. Scannen, und sie sind angemeldet.',
    ohneAppHint: 'Ohne App geht es auch: Beim Senden und bei den Zusagen steht eigens da, wem du die Aufgaben persönlich sagst.',
    werIstDas: 'Wer ist das?',
    toastLinksGesendet: 'Links gesendet: {n}', toastLinksTeils: 'Links gesendet: {n} · nicht angekommen: {m}',
    mailNichtBereit: 'Die App kann gerade keine E-Mails senden. Druck die Zettel, oder schick den Link bei der Person aus deinem Mail-Programm.',
    // Der Bogen der Anmelde-Zettel (Entwurf GEinladungsZettel), gedruckt in der
    // Sprache der Versammlung. {adresse} ist die der App („versammlung.app"),
    // {frage} die Überschrift auf der Anmeldeseite (`ohneMailFrage`).
    anmeldeZettel: 'Anmelde-Zettel', zumAusschneiden: 'zum Ausschneiden', seiteVon: 'Seite {n} von {m}',
    anmeldungFuer: 'Anmeldung für', gueltigBisDatum: 'gültig bis {datum}',
    zettelAnleitung: 'Mit der Handy-Kamera scannen, und du bist angemeldet. Geht es nicht: {adresse} öffnen und unter „{frage}“ den Code eintippen.',
    kontenOhnePerson: 'Konten ohne Person',
    kontenOhnePersonHint: 'Diese Konten sind noch keiner Person zugeordnet.',
    pushLbl: 'Push-Mitteilungen',
    pushPromptTitle: 'Keine Zuteilung verpassen',
    pushPromptText: 'Benachrichtigungen auf diesem Gerät einschalten.',
    pushPromptIos: 'Auf dem iPhone zuerst installieren: Teilen-Symbol → „Zum Home-Bildschirm“. Danach kannst du im Profil Benachrichtigungen aktivieren.',
    pushAktivieren: 'Aktivieren',
    // Das ✕ der Push-Karte: Sie kommt auf diesem Gerät nicht wieder.
    pushKarteWeg: 'Nicht mehr anzeigen',
    appInstallieren: 'App installieren',
    pushIosHint: 'Für Benachrichtigungen die App installieren: Teilen → „Zum Home-Bildschirm“.',
    // Der Film „Erste Schritte" (22.10.2026, src/erste-schritte): die Karte auf
    // Start, der Knopf im Profil, die Worte der sechs Szenen und die Knöpfe zum
    // Abspielen. {knopf} ist jeweils der Knopf, den der Satz zitiert
    // (`bestaetigen`, `kannNicht`, `appInstallieren`, `codeEintippen`,
    // `pushAktivieren`) — so steht im Film wörtlich, was in der App steht.
    // „Teilen" und „Zum Home-Bildschirm" sind die Wörter des iPhones wie in
    // `pushIosHint`.
    ersteSchritte: 'Erste Schritte',
    ersteSchritteKarte: 'Neu hier? Der kurze Film zeigt dir, wie es losgeht.',
    ersteSchritteAnsehen: 'Ansehen',
    ersteSchritteFuer: 'Versammlung.app für Verkündiger',
    ersteSchritteSchritt: 'Schritt {n} von {m}',
    ersteSchritteLinkTitel: 'Tippe auf den Link in der E-Mail.',
    ersteSchritteLinkText: 'Oder scanne den QR-Code auf dem Zettel. Ein Passwort gibt es nicht.',
    ersteSchritteLinkNotiz: 'Du bist angemeldet.',
    ersteSchritteAufgabeTitel: 'Deine nächste Aufgabe steht ganz oben.',
    ersteSchritteAufgabeText: 'Tippe auf „{knopf}“, dann weiß der Planer Bescheid.',
    ersteSchritteAufgabeNotiz: 'Verhindert? Dann tippe auf „{knopf}“.',
    ersteSchritteInstallTitel: 'Leg die App auf den Startbildschirm.',
    ersteSchritteInstallText: 'Android: Menü ⋮, dann „{knopf}“. iPhone: in Safari „Teilen“, dann „Zum Home-Bildschirm“.',
    ersteSchritteInstallNotiz: 'iPhone: Tippe danach in der App auf „{knopf}“.',
    ersteSchritteErinnernTitel: 'Schalte die Erinnerungen ein.',
    ersteSchritteErinnernText: 'Tippe auf die Glocke, dann auf „{knopf}“. So kommen Zuteilungen und Erinnerungen aufs Handy.',
    ersteSchritteFragen: 'Fragen? Sprich die Ältesten an.',
    ersteSchrittePause: 'Pause', ersteSchritteAbspielen: 'Abspielen', ersteSchritteNochmal: 'Nochmal ansehen',
    ersteSchritteZurueck: 'Zurück', ersteSchritteWeiter: 'Weiter',
    familieLabel: 'Familie',
    // Amtlicher Wortlaut aus Absatz 7 der jw.org-„Anweisungen" — in jeder
    // Sprache der dortige Satz, statt einer eigenen Umschreibung. Zuletzt
    // in allen 34 Sprachen gegen WOL 1201038 gehalten am 27.9.2026.
    familieHint: 'Der Gesprächspartner soll dasselbe Geschlecht haben oder ein Familienangehöriger sein.',
    familieHinzu: 'Familienmitglied hinzufügen',
    partnerHinzu: '+ Partner',
    partnerEntfernen: '– Partner',
    schriftgroesse: 'Schriftgröße',
    // Vorlesbare Beschriftungen für Icon-Schaltflächen (Screenreader)
    a11yClose: 'Schließen',
    a11yZurueck: 'Zurück',
    a11yRemove: 'Entfernen',
    a11yDecrease: 'Verringern',
    a11yIncrease: 'Erhöhen',
    a11yMoveUp: 'Nach oben',
    a11yMoveDown: 'Nach unten',
    a11yMinuten: 'Minuten',
    a11yPrevMonth: 'Voriger Monat',
    a11yNextMonth: 'Nächster Monat',
    a11yPrevWeek: 'Vorherige Woche',
    a11yNextWeek: 'Nächste Woche',
    a11yMainNav: 'Hauptnavigation',
    a11yWeekday: 'Wochentag',
    a11yTime: 'Uhrzeit',
    a11yCongLang: 'Versammlungssprache',
    schriftKlein: 'Klein',
    schriftStandard: 'Standard',
    schriftGross: 'Groß',
    schriftGroesser: 'Größer',
    schriftSehrGross: 'Sehr groß',
    toastPushAn: 'Push-Mitteilungen aktiviert',
    toastPushAus: 'Push-Mitteilungen deaktiviert',
    toastPushVerweigert: 'Push-Mitteilungen wurden nicht erlaubt',
    keineWochenTitel: 'KEIN PROGRAMM GELADEN',
    keineWochenHinweis: 'Es sind noch keine Wochen geladen. Wer plant, holt das Programm unter „Planung“ mit „Holen“.',
    rolle: 'Rolle', aufgabenbereiche: 'Aufgabenbereiche',
    einstellungen: 'Einstellungen', versammlungCard: 'Versammlung', saal: 'Königreichssaal',
    // Einstellungen (T121, Phase 6c): Zeilen und Abschnitte.
    unterDerWoche: 'Unter der Woche', amWochenende: 'Am Wochenende',
    auxKurz: 'Für die Schulungsaufgaben',
    gruppenTitel: 'Gruppen', gruppenN: 'Gruppen: {n}', diensteN: 'Dienste: {n}',
    gruppenUndTrolleys: 'Gruppen und Trolleys', trolleysN: 'Trolleys: {n}',
    mitteilungenUndErinnerungen: 'Mitteilungen und Erinnerungen',
    werPlant: 'Wer plant', werPlantNiemand: 'Noch niemand.', beiDerPersonAendern: 'Bei der Person ändern',
    // „Erste 7 Tage vorher, letzte am Tag" — {dauer} kommt aus Intl („1 Tag", „7 Tage").
    remKurz: 'Erste {erste}, letzte {letzte}', remVorher: '{dauer} vorher', remAmTagKurz: 'am Tag',
    // Hilfsdienste (Phase 6c-2) und Gruppen (Phase 6c-3).
    hdPlaetzeVon: 'Plätze für {name}', hilfsdienstHinzu: 'Hilfsdienst hinzufügen',
    werDarfWas: 'Wer darf was?', bereicheBeiPerson: 'Aufgabenbereiche vergibst du bei der Person',
    hdEntfernen: 'Hilfsdienst entfernen',
    hdEntfernenHinweis: 'Mit dem Dienst gehen seine Plätze in allen Wochen und die Freigaben bei den Personen.',
    // Für die Reinigung: Sie hat keine Freigaben, und neu anlegen lässt sich nur
    // ein Dienst für Personen (`HilfsdienstNeuBlatt`).
    hdEntfernenHinweisGruppen: 'Mit dem Dienst gehen seine Plätze in allen Wochen. Neu anlegen lässt sich ein Gruppen-Dienst nicht.',
    ohneGruppeN: 'Ohne Gruppe: {n}', ohneGruppeKurz: 'Bei der Person eine Gruppe wählen',
    gruppeTrolleyBeiPerson: 'Wer zu welcher Gruppe gehört und wer mit dem Trolley gehen darf, legst du bei der Person fest.',
    // Aufseher und Gehilfe kommen aus der Gruppe (14.10.2026): im Blatt der
    // Gruppe, warum jemand fehlt; bei der Person, was ein Gruppenwechsel mitnimmt.
    gruppeWahlMitglieder: 'Zur Wahl stehen nur Mitglieder dieser Gruppe. Wer zu ihr gehört, legst du bei der Person fest.',
    gruppeWechselAufseher: 'Aufseher dieser Gruppe – bei einem Wechsel endet das Amt.',
    gruppeWechselGehilfe: 'Gehilfe dieser Gruppe – bei einem Wechsel endet das Amt.',
    gruppeWennEntfernt: 'Wenn du die Gruppe entfernst', gruppeDelBesuche: 'Ihre Gruppenbesuche entfallen.',
    gruppeDelPlaene: 'In den weiteren Plänen bleiben ihre Zeiträume ohne Gruppe.',
    gruppeEntfernen: 'Gruppe entfernen',
    hdDesc: 'Die Zahl sagt, wie viele Plätze es je Zusammenkunft gibt. Die Reihenfolge gilt auch im Programm.',
    gruppenRotation: 'Gruppen-Rotation', eigenerBereich: 'Eigener Aufgabenbereich',
    gruppenCard: 'Predigtdienstgruppen',
    aufseherLbl: 'Aufseher', gehilfeLbl: 'Gehilfe', gruppeLbl: 'Predigtdienstgruppe',
    mitgliederN: 'Mitglieder: {n}', gruppeHinzu: 'Gruppe hinzufügen',
    neuerDienstPh: 'Neuer Dienst, z. B. Parkplatz', hinzufuegen: '+ HINZUFÜGEN',
    programmsprachen: 'Programmsprachen', spracheHinzu: 'Sprache hinzufügen',
    versSprache: 'Versammlungssprache',
    versSpracheDesc: 'Bestimmt die Sprache des Arbeitshefts beim Programm-Import.',
    progLangsLbl: 'Weitere Programmsprachen',
    progLangsDesc: 'Neue Importe holen das Programm zusätzlich in diesen Sprachen — jeder sieht es dann automatisch in seiner App-Sprache.',
    langSearchPh: 'Sprache suchen …', langCount: 'Sprachen: {n}', langListNote: 'Sprachliste von jw.org',
    geladenBis: 'Geladen bis {datum}', geladenNichts: 'Noch keine Woche geladen',
    // Planung: alle Wochen und „Holen" (T121, Phase 10, Entwürfe `GWochen`,
    // `GDesktopPlanen`, `GImport`). Die Zahlen stehen hinter dem Wort —
    // „Probleme: 2", nicht „2 Probleme" —, damit die Form in jeder Sprache stimmt.
    alleWochen: 'Alle Wochen', wochenLbl: 'Wochen', naechsteWoche: 'Nächste Woche',
    lageProbleme: 'Probleme: {n}', lageOffen: 'Offen: {n}', lageBereit: 'Bereit zum Senden',
    // Auf der Planungs-Karte des Starts: was noch hinaus muss (`nichtGesendet`).
    lageSenden: 'Zu senden: {n}',
    programmNichtGeholt: 'Programm noch nicht geholt', holen: 'Holen',
    programmHolen: 'Programm holen',
    programmHolenText: 'Das Programm der Woche kommt aus dem Arbeitsheft auf jw.org.',
    // Die Schritte im Blatt — eigene Schlüssel neben dem Knopf „Holen": Manche
    // Sprachen nennen Schritte im Infinitiv und Knöpfe im Imperativ (it).
    holtProgramm: 'Das Programm wird geholt …', spurHolen: 'Holen', spurPruefen: 'Prüfen',
    programmpunkteN: 'Programmpunkte: {n}', punkteN: 'Punkte: {n}',
    holenHinweis: 'Beim Übernehmen kommt der feste Leiter des Wachtturm-Studiums gleich mit, bei Abwesenheit sein Vertreter. Abwesenheiten werden beim Zuteilen beachtet.',
    uebernehmenZuteilen: 'Übernehmen und zuteilen', nurUebernehmen: 'Nur übernehmen',
    auchZuPlanen: 'Auch zu planen', treffpunkteBesuche: 'Treffpunkte und Gruppenbesuche',
    aktuellLbl: 'Aktuell:', entfernen: 'Entfernen', abwesendChip: 'Abwesend',
    sheetSchonHeute: 'An diesem Tag schon',
    // {w} = Breite des Auslastungs-Fensters (LOAD_WEEKS in data/auslastung.ts).
    // Nicht ausschreiben: beim letzten Wechsel von 4 auf 5 blieben ar/fa/ur
    // bei der alten Zahl stehen, ohne dass es jemandem auffiel.
    aufgabenInW: 'Aufgaben in {w} Wochen: {n}',
    // Zuteilen (T121, Entwurf `GZuteilen`). Die Zeile unter einem Namen beginnt
    // klein: {wann} ist „vor 12 Wochen" aus Intl, {zeitraum} „7.–11. September".
    werUebernimmt: 'Wer übernimmt?', nameSuchen: 'Name suchen',
    mitBereichN: 'Mit diesem Aufgabenbereich: {n}', aufgabenInWochen: 'Aufgaben in {w} Wochen',
    vorschlag: 'Vorschlag', zuletztWann: 'zuletzt {wann}', zuletztLange: 'länger nicht dran',
    abwesendZeitraum: 'abwesend {zeitraum}',
    // Die Spalte zum Zuteilen am Desktop, solange kein Platz gewählt ist.
    zuteilenLeer: 'Wähle im Programm einen Platz, um ihn zu besetzen.',
    toastWillkommen: 'Willkommen, {name}!', toastZugeteilt: 'Zugeteilt · noch nicht gesendet',
    toastEntfernt: 'Zuteilung entfernt', toastKeineOffen: 'Keine offenen Plätze',
    toastKeinePassende: 'Für die offenen Plätze ist niemand Passendes frei',
    toastAutoN: 'Automatisch vergebene Zuteilungen: {n}', toastGeleertN: 'Geleerte Zuteilungen: {n}',
    toastAbsentP: '{name} ist in dieser Woche abwesend',
    toastVonBis: 'Bitte Von und Bis angeben',
    toastAbwAdd: 'Abwesenheit eingetragen', toastAbwDel: 'Abwesenheit entfernt',
    toastPersonNeu: 'Neue Person angelegt',
    toastDienstDel: 'Dienst entfernt', toastDienstAdd: 'Dienst hinzugefügt', toastNameEingeben: 'Bitte einen Namen eingeben',
    toastGruppeNeu: 'Gruppe hinzugefügt', toastGruppeDel: 'Gruppe entfernt',
    toastProgLangAdd: 'Programmsprache hinzugefügt — beim nächsten Holen kommt sie auch für geladene Wochen',
    toastProgLangDel: 'Programmsprache entfernt',
    toastAuxAn: 'Zusätzliche Klasse eingerichtet', toastAuxAus: 'Zusätzliche Klasse aufgehoben',
    // Nach „Holen" und „Übernehmen" (T121, Phase 10) — bis dahin sprachen sie vom Import.
    toastAlleWochen: 'Das Arbeitsheft hat noch keine weitere Woche', toastImportiert: 'Woche übernommen',
    importOhneDb: 'Holen nicht möglich — keine Datenbank angebunden',
    importFehler: 'Das Programm ließ sich nicht holen',
    // Die Woche gibt es auf jw.org noch nicht in der Sprache der Versammlung —
    // `import-week` meldet `sprache-fehlt` (bis Phase 10 kam der Satz deutsch).
    holenSpracheFehlt: 'Diese Woche gibt es auf jw.org noch nicht in der Sprache der Versammlung',
    // T123: Der Name einer Person hat einen eigenen Schlüssel — `nameLbl`
    // benennt auch Versammlung, Gruppe, Trolley, Plan, Termin und Hilfsdienst,
    // und das sind im Polnischen, Russischen und Ukrainischen zwei Wörter
    // („Nazwa" / „Imię i nazwisko"). Ebenso der fehlende Titel eines neuen
    // Programmpunkts: Dort stand bis T123 „Bitte einen Namen eingeben", auf
    // Polnisch „Wpisz imię" — der Vorname einer Person.
    personNameLbl: 'Name', toastTitelEingeben: 'Bitte einen Titel eingeben',
    notifZuteilung: 'Neue Zuteilung', notifErinnerung: 'Erinnerung', notifPlan: 'Plan veröffentlicht',
    notifEntzug: 'Zuteilung zurückgezogen',
    // Abgelegt (Stand und Schicht, 5. bis 14.10.2026): Eine Schicht fiel aus
    // oder hatte eine neue Zeit oder einen neuen Ort. Die Glocke hält die
    // Zeilen 30 Tage.
    notifOzAusfall: 'Schicht fällt aus', notifOzGeaendert: 'Schicht geändert',
    // Trolleys (T121, Phase 7) — aus der Function `trolley` und, am Vortag,
    // aus `send-reminders`.
    notifTrolleyEingetragen: 'Für den Trolley eingetragen',
    notifTrolleyAbgesagt: 'Trolley-Termin abgesagt',
    notifTrolleyDazu: 'Partner gefunden',
    notifTrolleyEntfaellt: 'Trolley-Termin entfällt',
    notifTrolleyMorgen: 'Erinnerung: Trolley morgen',
    notifUnerreichbar: 'Unbestätigte Zuteilungen (nicht erreichbar)',
    notifErinnerungBest: 'Erinnerung: Zuteilung bestätigen',
    notifErsatzGesucht: 'Ersatz gesucht', notifErsatzGefunden: 'Ersatz gefunden',
    notifZutGesendet: 'Zuteilung gesendet', notifZutsGesendet: 'Zuteilungen gesendet', notifProgImportiert: 'Programm importiert',
    rolleAeltester: 'Ältester', rolleDag: 'Dienstamtgehilfe', rolleVerk: 'Verkündiger', rolleKeine: 'Keine',
    // Zusätzliche Klasse (jw.org S-38, Absatz 27). Die Begriffe stammen aus
    // dem Artikel „Anweisungen für die Leben-und-Dienst-Zusammenkunft" in der
    // jeweiligen Sprache — auxKlassen ist dort die Abschnittsüberschrift.
    // Bis zum 14.10.2026 stand hier auch `auxDesc`, der erste Satz von Absatz
    // 27 im Singular, gemessen in allen 34 Sprachen; die neuen Einstellungen
    // (T121) zeigen statt seiner nur „Für die Schulungsaufgaben" (`auxKurz`) —
    // wer den Satz wieder braucht, findet ihn in der Git-Geschichte.
    // auxRatgeberHint ist der Satz zum Ratgeber — wo er allein nicht lesbar
    // ist („Cada una …"), mit der Klasse ausgeschrieben. Die Stärke des Verbs
    // folgt der S-38 der jeweiligen Sprache („soll", nicht „muss"). Gegen
    // WOL 1201038 in allen 34 Sprachen gehalten am 27.9.2026. Der
    // deutsche Satz ist für sich lesbar und steht deshalb wörtlich da („zur
    // Verfügung stehen"; bis zum 1.10.2026 umschrieben als „da sein").
    auxKlassen: 'Zusätzliche Klassen',
    auxKlasse: 'Zusätzliche Klasse',
    auxHauptsaal: 'Hauptsaal',
    auxRatgeber: 'Ratgeber',
    auxRatgeberHint: 'Für jede zusätzliche Klasse soll ein befähigter Ratgeber zur Verfügung stehen, vorzugsweise ein Ältester.',
    privVorsitz: 'Vorsitz', privVortrag: 'Vorträge', privGebet: 'Gebete',
    // Der Programmteil vor dem Vortrag (4.10.2026): „Schätze aus Gottes Wort ·
    // Vorträge“ (`privLabel`), gebaut wie „Schulungsaufgaben · Vorträge“ — vorher
    // hieß der Bereich nur „Vorträge“ und las sich als jeder Vortrag. Gemessen am
    // Inhaltsverzeichnis der S-38 (WOL 1201038, p4) in allen 34 Sprachen und
    // gegen die Überschrift des Arbeitshefts gehalten (FRAG); ru ohne die «» der S-38.
    privSchaetze: 'Schätze aus Gottes Wort',
    // Besprechungen leiten (4.10.2026) — das Wort ist das des Arbeitshefts
    // („Besprechung." vor der Zeit), je Sprache gemessen (FRAG in translate-data.ts),
    // die Form folgt „Studium leiten“.
    privBesprechung: 'Besprechungen leiten',
    privSchulung: 'Schulungsaufgaben', privStudium: 'Studium leiten',
    privBibellesung: 'Bibellesung', privLeser: 'Leser',
    geschlecht: 'Geschlecht', bruder: 'Bruder', schwester: 'Schwester',
    privWtLeiter: 'Wachtturm-Studium-Leiter', privWtVertreter: 'Vertreter (Wachtturm-Studium)',
    wtRollenLabel: 'Feste Rollen',wtRollenHint: 'Der feste Leiter des Wachtturm-Studiums kommt von selbst in jede neue Woche, bei Abwesenheit sein Vertreter.',
    // Die Warnung über der Personenliste, wenn eine feste Rolle mehrfach vergeben ist.
    wtRollenDoppeltHint: 'Leiter und Vertreter sind je eine Person. Ist eine Rolle mehrfach vergeben, nimmt die automatische Zuteilung irgendeinen davon. Tippe auf einen Namen, um die Rolle dort abzuschalten.',
    // `s89Partner` beschriftet drei Flächen: den Druckbogen, den einzelnen
    // Zettel und — über `privLabel` — den Aufgabenbereich „nur Partner". Seit
    // die Rolle im Programm „Partner" heißt, hieß das Feld daneben noch
    // „Gesprächspartner/in". Nur Deutsch gekürzt; die anderen 33 Sprachen
    // trugen dort ohnehin schon ein kurzes Einzelwort (Assistant, Ayudante, 補助).
    s89Title: 'Aufgabe in der Leben-und-Dienst-Zusammenkunft', s89Name: 'Name', s89Partner: 'Partner',
    s89Datum: 'Datum', s89Aufgabe: 'Aufgabe', s89Punkt: 'Schulungspunkt', s89Ort: 'Durchzuführen im',
    s89Open: 'S-89 anzeigen',
    // Im S-89-Blatt ab dem Tablet (Entwurf GDesktopAufgaben): druckt den einen Zettel.
    s89DieserZettel: 'Diesen Zettel drucken',
    s89Note: 'Hinweis: Quelle und Schulungspunkt für deine Aufgabe findest du im Arbeitsheft.',
    confirmTitle: 'Bitte bestätige deine Zuteilungen',
    bestaetigen: 'Bestätigen', bestaetigt: 'Bestätigt', verhindert: 'Ich bin verhindert', verhindertChip: 'Verhindert',
    kannNicht: 'Ich kann nicht', absagen: 'Absagen', dochBestaetigen: 'Doch bestätigen',
    ersatzHint: 'Wenn du einen Hilfsdienst absagst, wird automatisch ein Ersatz aus dem Kreis der Qualifizierten gesucht.',
    einspringenTitle: 'Einspringen', einspringenHint: 'Für diese Hilfsdienste wird ein Ersatz gesucht — kannst du übernehmen?',
    uebernehmen: 'Übernehmen',
    // Freie Plätze unter „Meine Aufgaben" (4.10.2026): unbesetzte Plätze
    // gesendeter Wochen, für die man den Aufgabenbereich hat.
    freiePlaetzeTitle: 'Freie Plätze',
    // Seit T134 eine eigene Seite: der Abschnitt der freien Plätze und die leere Seite.
    freiePlaetzeNochFrei: 'Noch niemand eingeteilt',
    freiePlaetzeLeer: 'Gerade sucht niemand Ersatz, und es ist nichts frei, was du übernehmen kannst.',
    freiePlaetzeHint: 'Hier ist noch niemand eingeteilt, und du hast den Aufgabenbereich dafür. Wer zuerst übernimmt, ist eingetragen und hat damit zugesagt.',
    toastPlatzUebernommen: 'Danke! Du bist eingetragen',
    // Die drei Stufen des Ampel-Punkts im Planen — Legende und Screenreader
    // („Gebet: Jörg Roth wartet auf Bestätigung"). Aus Sicht des Planers,
    // deshalb nicht `verhindertChip`: Der steht beim Eingeteilten selbst und
    // heißt in manchen Sprachen „ich kann nicht".
    zusageBestaetigt: 'bestätigt',
    zusageWartet: 'wartet auf Bestätigung',
    zusageAbgesagt: 'abgesagt',
    // Planen (T121, Entwurf `GPlanen`): die Spur der Woche und die Lage der
    // Plätze. „Problem" steht in der Legende für abgesagt oder im Konflikt;
    // „Zuteilen" heißt auch der offene Platz — er sagt, was dort zu tun ist.
    spurWoche: 'Stand der Woche', spurZuteilen: 'Zuteilen', spurSenden: 'Senden', spurZusagen: 'Zusagen',
    // Die Spur eines Weiteren Plans (Phase 5f): Einzahl, wo der Abschnittstitel
    // `wpAbgeschlossen` in vielen Sprachen Mehrzahl ist; „Entwurf" ist `wpEntwurf`.
    spurPlan: 'Stand des Plans', spurVeroeffentlicht: 'Veröffentlicht', spurAbgeschlossen: 'Abgeschlossen',
    // Die Zusagen der Woche (Phase 5g, Entwurf `GRueckmeldungen`); der Titel ist
    // `spurZusagen`, „Zu klären" `zuKlaeren`. `{zeit}` ist „vor 13 Stunden" (Intl).
    zusagenWarten: 'Warten auf Zusage', zusagenZugesagt: 'Zugesagt',
    zusagenGesendet: 'gesendet {zeit}', zusagenNichtGesendet: 'noch nicht gesendet',
    zusagenLeer: 'In dieser Woche gibt es nichts zu bestätigen.',
    // Wer kein Konto hat, erreicht keine Nachricht (Phase 5g-2): Der Planer sagt
    // es selbst und hakt ab. `{name}` beschriftet den Haken für Vorleseprogramme.
    zusagenOhneKonto: 'Noch nicht angemeldet',
    zusagenOhneKontoHinweis: 'Bitte persönlich Bescheid geben und hier abhaken.',
    zusagenWeissBescheid: '{name} weiß Bescheid',
    // Unter „Warten auf Zusage" (Phase 5g-3). `{wann}` kommt aus Intl: „heute",
    // „morgen", „in 5 Tagen" — ein Zeitadverb mitten im Satz.
    zusagenNaechsteErinnerung: 'Die nächste Erinnerung geht {wann} von selbst raus.',
    zusagenKeineErinnerung: 'Von selbst geht keine Erinnerung mehr raus.',
    zusagenErinnern: 'Jetzt erinnern',
    lageProblem: 'Problem', zuKlaeren: 'Zu klären',
    // Woche einrichten und Programm (T121, Entwurf `GWochePlanen`, `GProgramm`).
    wocheEinrichten: 'Woche einrichten',
    anlassDerWoche: 'Anlass der Woche',
    anlassNormal: 'Normale Woche',
    anlassNormalText: 'Programm wie im Arbeitsheft',
    anlassCoText: 'Dienstvortrag statt Versammlungsbibelstudium',
    // Welche, hängt am Datum des Mahls (`memAusfall`): Montag bis Freitag die
    // unter der Woche, sonst die am Wochenende.
    anlassMemText: 'Eine Zusammenkunft dieser Woche entfällt',
    zusammenkuenfteDieserWoche: 'Zusammenkünfte dieser Woche',
    weitereTermine: 'Weitere Termine',
    weitereTermineText: 'Für alles, was in dieser Woche zusätzlich stattfindet. Erscheint bei allen im Programm.',
    programmTitel: 'Programm',
    programmpunkteBearbeiten: 'Programmpunkte bearbeiten',
    ausArbeitsheft: 'aus dem Arbeitsheft',
    programmHinweis: 'Unter „{abschnitt}“ änderst du Titel und Minuten, ordnest um und fügst eigene Punkte ein. Alles andere kommt aus dem Arbeitsheft und bleibt, wie es ist.',
    programmpunktEinfuegen: 'Programmpunkt einfügen',
    programmpunktTitel: 'Titel',
    // Automatisch und Plan senden (T121, Entwürfe `GAutomatisch`, `GSenden`).
    // „Nur {tag}": der Wochentag der gezeigten Zusammenkunft, aus `Intl`.
    autoKnopf: 'Automatisch',
    autoTitel: 'Automatisch zuteilen',
    autoHinweis: 'Füllt nur offene Plätze. Abwesenheiten, Aufgabenbereiche und Auslastung werden beachtet.',
    autoAufgaben: 'Aufgaben im Programm',
    autoUmfang: 'Umfang',
    autoNurTag: 'Nur {tag}',
    ganzeWoche: 'Ganze Woche',
    planSendenAndere: 'Alle anderen wissen schon Bescheid.',
    // „Plan senden": der Planer gibt die fertige Woche frei, und erst dann
    // erfahren die Eingeteilten davon. Der Knopf spricht von der ganzen Woche,
    // nicht vom Reiter darüber — sonst hielte man ihn für dessen Aktion.
    planSenden: 'Plan senden',
    planSendenOffen: 'Noch niemandem mitgeteilte Zuteilungen dieser Woche: {n}',
    planSendenAlle: 'Alle Eingeteilten dieser Woche wissen Bescheid.',
    // Dasselbe für den Gruppenaufseher: nur die Treffpunkte seiner Gruppe.
    fsSendenOffen: 'Noch niemandem mitgeteilte Zuteilungen deiner Gruppe: {n}',
    fsSendenAlle: 'Alle Eingeteilten deiner Gruppe wissen Bescheid.',
    planSendenZuletzt: 'Zuletzt gesendet {zeit}',
    planSendenOhneKonto: 'Ohne App-Konto — bitte persönlich Bescheid geben: {namen}',
    toastPlanGesendet: 'Benachrichtigte Personen: {n}',
    toastPlanNichts: 'Es war nichts zu senden',
    // Nach „Jetzt erinnern" (Phase 5g-3): je Person und Tag höchstens eine Erinnerung.
    toastErinnert: 'Erinnerte Personen: {n}',
    toastSchonErinnert: 'Heute wurde schon erinnert',
    toastNiemandZuErinnern: 'Es war niemand zu erinnern',
    erinnerungenCard: 'Erinnerungen',
    remErste: 'Erste Erinnerung', remLetzte: 'Letzte Erinnerung',
    remRepeat: 'Täglich wiederholen, bis bestätigt',
    // Die Erinnerungen als Zeitleiste (T121, Phase 6c-4, Entwurf `GErinnerungen`).
    // {titel} ist der echte Titel der Mitteilung (`notifZuteilung`) — zitiert,
    // nicht abgeschrieben. Die beiden `…Option` stehen allein in der Wahl der
    // letzten Erinnerung und beginnen deshalb groß; `remAmTagKurz` und
    // `remVorher` stehen mitten im Satz. {dauer} kommt aus Intl („1 Tag").
    erinEinleitung: 'So begleitet die App eine Aufgabe – von der Zuteilung bis zum Tag selbst.',
    erinPlanGesendet: 'Plan gesendet', erinPlanSofort: 'Sofort: „{titel}“ mit der Bitte um Zusage',
    erinTageVorAufgabe: 'Tage vor der Aufgabe', erinTaeglich: 'Täglich wiederholen', erinBisZusage: 'bis die Zusage da ist',
    remAmTagOption: 'Am Tag', remVorherOption: '{dauer} vorher',
    erinDieAufgabe: 'Die Aufgabe', erinDanachStill: 'Ab hier meldet sich die App nicht mehr.',
    // Was ohne Einstellung sofort hinausgeht und an wen — am Code gemessen
    // (14.10.2026): die Absage über `notify_planners` (an jedes Mitglied mit
    // `planner` oder `zuteiler`, also Admins und Planer — Wortlaut wie
    // `wpEntwurfHint`), das Ersatzgesuch in `substitute` (nur Hilfsdienste,
    // ohne die an dem Tag Abwesenden), der Entzug in `send-plan` (eine
    // Zuteilung, von der die Person wusste: mitgeteilt oder zugesagt — seit dem
    // 15.10.2026, `entzogeneZuteilungen`).
    erinSofortGemeldet: 'Sofort gemeldet', erinAbsage: 'Absage', erinAnPlaner: 'an Admins und Planer',
    erinErsatzAn: 'nur bei Hilfsdiensten: an alle mit diesem Aufgabenbereich, die an dem Tag nicht abwesend sind',
    erinEntzugAn: 'an die Person, wenn ihr die Zuteilung schon mitgeteilt war oder sie zugesagt hatte',
    // Die Function `trolley` meldet dem anderen im Termin, was der eine getan
    // hat; entfernt der Admin einen Trolley, allen Eingetragenen. Am Vortag
    // erinnert `send-reminders` jeden, der eingetragen ist.
    erinTrolley: 'Trolley-Termin eingetragen, dazugekommen oder abgesagt',
    erinTrolleyAn: 'an den Partner; wird ein Trolley entfernt, an alle Eingetragenen',
    erinTrolleyVortag: 'Am Vortag eines Trolley-Termins erinnert die App alle, die eingetragen sind.',
    // Auch das Anmelden verschickt welche (Supabase: Bestätigung, neues Kennwort;
    // ab Phase 8 der Link) — erinnert wird dagegen nie per E-Mail.
    erinMailNur: 'E-Mails verschickt die App nur für Einladungen und die Anmeldung.',
    coWoche: 'Besuch des Kreisaufsehers',
    memWoche: 'Gedächtnismahl',
    kongress: 'Kongress',
    lacPh: 'Neuer Programmpunkt, z. B. Örtliche Hinweise', lacAdd: '+ EINFÜGEN',
    vortragThemaPh: 'Vortragsthema eintragen', anfangsliedLbl: 'ANFANGSLIED', liedNrPh: 'Nr.',
    rednerNamePh: 'Name des Redners', rednerVersPh: 'Versammlung des Redners',
    uebernehmenBtn: 'Übernehmen', oderPersonWaehlen: 'Oder aus der eigenen Versammlung wählen:',
    toastLacAdd: 'Programmpunkt eingefügt · Zeiten angepasst', toastLacDel: 'Programmpunkt entfernt · Zeiten angepasst',
    // Seit „Alles Planen" (15.10.2026) sehen es Admin und Planer — wer plant.
    toastBestaetigt: 'Bestätigt · wer plant, sieht es',
    toastVerhindert: 'Gemeldet · wer plant, erfährt es',
    toastErsatzGesucht: 'Abgesagt · es wird ein Ersatz gesucht',
    toastUebernommen: 'Danke! Du hast den Hilfsdienst übernommen',
    toastUebernommenKonflikt: 'Übernommen · Achtung: du bist an dem Tag schon eingeteilt',
    notifVerhindert: 'Verhinderung gemeldet',
    // Konten & Mitglieder
    resetMailFehlt: 'Bitte zuerst deine E-Mail-Adresse eintragen',
    laedt: 'Lädt …',
    stKeineVersText: 'Dein Konto gehört zu keiner Versammlung mehr. Frag bitte die Ältesten nach einem neuen Link.',
    stFehler: 'Daten konnten nicht geladen werden', stFehlerText: 'Es gab ein Problem beim Laden aus der Datenbank.',
    // Error Boundary — Anzeigefehler, nicht Ladefehler
    errTitel: 'Anzeige gestört', errText: 'Dieser Bereich konnte nicht angezeigt werden. Der Rest der App funktioniert weiter.',
    toastSpeicherFehler: 'Änderung konnte nicht gespeichert werden — bitte neu laden',
    stErneut: 'ERNEUT VERSUCHEN', stLeer: 'Versammlung ist noch leer',
    stLeerText: 'Es sind noch keine Daten hinterlegt. Bitte wende dich an einen Admin.',
    keinePersonOpt: '— keine Person —', planerLbl: 'Admin', duMarker: ' (du)',
    // Der eigene Platz in den Programm-Ansichten: dasselbe Wort wie `duMarker`,
    // seit T121 in Satzschreibung — es steht dort statt des eigenen Namens.
    chipDu: 'Du',
    toastMitgliedEntfernt: 'Mitglied entfernt',
    // Konfliktprüfungen (Planen)
    konfliktAbsent: '{name} ist abwesend, aber eingeteilt · {tab}',
    konfliktDouble: '{name} ist {n}× in einer Zusammenkunft · {tab}',
    konfliktHelperTask: '{name} hat Hilfsdienst und Aufgabe am selben Tag · {tab}',
    // Zählzeile der Warnung „mehrfach vergebene feste Rollen" (Personen).
    // Hier stand daneben die Warnung vor doppelten Anzeigenamen — mit T110
    // entfallen, weil ein doppelter Name sich nicht mehr speichern lässt.
    dublettenRow: '„{name}“ · {n} Personen',
    // Meldung am Namensfeld, wenn den Namen schon jemand trägt (T110).
    nameDoppelt: 'Diesen Namen trägt bereits {name}. Ergänze den Vornamen, damit beide unterscheidbar sind.',
    // Toasts, wenn man das Detail mit dieser Meldung verlässt: Der Name springt
    // auf den Stand beim Öffnen zurück, eine neue Person wird nicht angelegt.
    toastNameNichtGeaendert: 'Name nicht geändert: {name} gibt es schon',
    // Predigtdienstgruppe löschen (Zwei-Tipp-Bestätigung) und Warnung „ohne Gruppe"
    loeschenSicher: 'Wirklich löschen?',
    // Dasselbe für das, was nur herausgenommen wird (`EntfernenKnopf`): eine
    // Person von ihrem Platz, eine Sprache aus dem Programm, ein Konto.
    entfernenSicher: 'Wirklich entfernen?',
    gruppeDelMitglieder: 'Die Mitglieder dieser Gruppe sind danach keiner Gruppe mehr zugeordnet.',
    gruppeDelTreffpunkte: 'Die Treffpunkte dieser Gruppe entfallen.',
    ohneGruppeTitle: 'Ohne Predigtdienstgruppe',
    ohneGruppeHint: 'Jeder Verkündiger gehört zu einer Predigtdienstgruppe. Ohne Zuordnung sieht die Person unter „Predigtdienst“ keine Gruppentreffpunkte. Tippe auf einen Namen, um die Gruppe festzulegen.',
    // Auswertung der Zuteilungen (T126, Entwurf vom 16.10.2026). Mengen von
    // Wochen ({dauer}, {ueblich}) kommen aus `zeitspanne` (Intl), Zahlen ohne
    // Einheit stehen als „Bezeichnung: {n}". Kein „er" und „sie": Wer im Bereich
    // nie dran war, heißt „Bereich vorhanden, nie dran".
    navAuswertung: 'Auswertung', awZeitraum: 'Zeitraum', awZusammenkuenfte: 'Zusammenkünfte: {n}',
    awZuteilungen: 'Zuteilungen', awEingeteilt: 'eingeteilt', awVonGesamt: 'von {m}', awNieDran: 'nie dran',
    awWasAuffaellt: 'Was auffällt', awHinweiseZahl: 'Hinweise: {n}',
    awNichtsAuffaellig: 'Nichts fällt auf – die Zuteilungen liegen im Rahmen.',
    awAlleHinweise: 'Alle Hinweise', awWeniger: 'Weniger zeigen', awAlleZeigen: 'Alle zeigen',
    awHinweisSelten: 'Zu selten: {name}', awHinweisOft: 'Zu oft: {name}',
    awHinweisEinseitig: 'Einseitig: {name}',
    awTextAufgaben: 'Aufgaben: {n} · erwartet: {e}',
    awTextGesamt: 'Mit Hilfsdiensten: {n} · erwartet: {e}',
    awVorAllemNie: 'Vor allem {bereich}, nie {nie}', awVorAllem: 'Vor allem {bereich}', awNieBereich: 'Nie {nie}',
    awAusgewogen: 'Kein Bereich überwiegt',
    // Wer lange wartet, steht je Bereich (Jahresprobe 18.10.2026): {namen} sind
    // die ersten drei, der Rest als „+2". „Abstand: …" statt „alle …": „alle 1
    // Woche" wäre falsch, und so trägt der Satz jede Zahl.
    awHinweisWartezeit: 'Lange Wartezeit: {bereich}',
    awTextWartezeit: '{namen} · üblicher Abstand: {ueblich}',
    // Die Pflege der Bereiche (Jahresprobe): {liste} sind Paare aus `awBereichZahl`,
    // {bereiche} Namen — einer oder mehrere, die Frage passt zu beidem.
    awHinweisOhneBereich: 'Ohne Bereich eingeteilt: {name}', awTextOhneBereich: '{liste} – bei der Person ergänzen?',
    awBereichZahl: '{bereich}: {n}',
    awHinweisNieGenutzt: 'Bereich im Jahr ungenutzt: {name}', awTextNieGenutzt: '{bereiche} – noch aktuell?',
    awPerson: 'Person', awErwartet: 'erwartet',
    awGenauer: 'Genauer ansehen', awVerteilungTitel: 'Zu oft, zu selten', awVerteilungStat: 'Zu oft: {n} · zu selten: {m}',
    awEinseitigTitel: 'Einseitig verteilt', awPersonenZahl: 'Personen: {n}',
    awWartezeitenTitel: 'Wartezeiten', awWartenLangeZahl: 'Warten lange: {n}',
    awWeiteresTitel: 'Treffpunkte, Absagen, Ballungen', awBallungenZahl: 'Ballungen: {n}',
    awFussnote: 'Gerechnet aus den Wochen in der App, gespeichert wird nichts. Wer abwesend war oder noch nicht dabei, von dem wird für diese Zeit nichts erwartet. Der öffentliche Vortrag, feste Rollen und was dem Vorsitz folgt, zählen nicht mit. Wartezeiten und Engpässe rechnen immer über das ganze Jahr.',
    awKeineDaten: 'Im gewählten Zeitraum fand noch keine Zusammenkunft statt, die die App kennt.',
    awVergleich: 'Vergleich', awDarstellung: 'Darstellung', awAufgaben: 'Aufgaben', awHilfsdienste: 'Hilfsdienste',
    awDiagramm: 'Diagramm', awTabelle: 'Tabelle',
    awErklaerungAufgaben: 'Verglichen wird mit dem, was auf jede Person käme, wenn die Plätze ihrer Bereiche gleich verteilt wären. Auffällig ist, wer um mehr als die Hälfte darüber oder darunter liegt.',
    awErklaerungHilfsdienste: 'Hilfsdienste verteilt die App nach der Gesamtlast: Wer viele Aufgaben hat, bekommt weniger Hilfsdienste. Verglichen wird deshalb alles zusammen.',
    awErklaerungOhneBereich: 'Einteilungen in Bereichen, die jemand nicht hat, zählen hier nicht mit – sie stehen unter „Was auffällt“ als „Ohne Bereich eingeteilt“.',
    awUeblich: 'üblich', awDarueber: 'darüber', awDarunter: 'darunter',
    awZuOft: 'Zu oft', awImRahmen: 'Im Rahmen', awZuSelten: 'Zu selten',
    awNErwartet: '{n} · erwartet {e}', awDavonHilfsdienste: 'davon Hilfsdienste: {n}',
    awBalkenAria: '{n}, erwartet {e}, {lage}',
    awLageOft: 'deutlich mehr', awLageRahmen: 'im üblichen Bereich', awLageSelten: 'deutlich weniger',
    awEinseitigErklaerung: 'Wer zwei Drittel der Zuteilungen in einem Bereich hat und damit deutlich mehr, als dort zu erwarten ist – oder in einem eigenen Bereich nie dran war, obwohl die anderen ihn oft hatten.',
    awAuffaellig: 'Auffällig', awAlle: 'Alle', awNie: 'nie',
    awNieSchnitt: '{bereich}: bei den anderen im Schnitt {n}',
    awMatrixTitel: 'Wer bekommt was',
    awMatrixText: 'Zuteilungen je Person und Bereich. Gestrichelt: Bereich vorhanden, dort aber nie dran.',
    awUndMehr: '{n} und mehr', awNieVorhanden: 'nie dran, Bereich vorhanden', awOhneBereich: 'Bereich nicht vorhanden',
    awOhneBereichEingeteilt: 'eingeteilt, Bereich nicht vorhanden',
    awEinseitigMarke: 'einseitig', awZelle: '{name}, {bereich}: {wert}',
    awBereich: 'Bereich',
    // Wartezeiten über das ganze Jahr (Jahresprobe 18.10.2026): Der übliche
    // Abstand ist der des Bereichs, gewartet wird nur in Wochen, in denen jemand
    // eingeteilt werden konnte — nicht abwesend, nicht auf einem festen Platz.
    awUeblichText: 'Üblicher Abstand: {ueblich} – die Personen mit dem Bereich geteilt durch seine Plätze je Woche, über das ganze Jahr. Gezählt werden nur Wochen, in denen jemand eingeteilt werden konnte.',
    awUeblichKeins: 'Niemand hat diesen Bereich – einen üblichen Abstand gibt es deshalb nicht.',
    awWartetLaengsten: 'Wartet am längsten', awSeit: 'seit {dauer}', awNieImZeitraum: 'nie im Zeitraum',
    awNieImJahr: 'nie im Jahr', awDavonNichtEinteilbar: 'davon nicht einteilbar: {dauer}',
    awUeberErwartung: 'insgesamt über der Erwartung',
    awBisDoppelt: 'bis doppelt so lange', awLaenger: 'länger',
    awSchnellTitel: 'Schnell wieder dran', awSchnellText: 'Höchstens halb so lange wie üblich zwischen zwei Malen.',
    awAlleDauer: 'Abstand: {dauer}', awMale: 'Male: {n}',
    awStreifenText: 'Je Woche ein Feld, die älteste zuerst. Gefüllt: in dieser Woche dran.',
    awTreffpunkteTitel: 'Treffpunkte leiten', awTreffpunkteText: 'Zusammenkünfte für den Predigtdienst, je Gruppe',
    awKeineTreffpunkte: 'Im Zeitraum hat niemand einen Treffpunkt geleitet.',
    awBallungenTitel: 'Ballungen', awZweimal: 'Zweimal in einer Zusammenkunft, mit Hilfsdienst',
    awHintereinander: 'Wochen hintereinander im selben Bereich', awFolgeText: '{bereich} · {dauer} hintereinander',
    awKeineBallungen: 'Keine Ballungen im Zeitraum.',
    awAufgabenErwartet: 'Aufgaben, erwartet {e}', awAbwesend: 'Zusammenkünfte abwesend',
    awLetzte: 'Die letzten {dauer}', awAufgabe: 'Aufgabe', awHilfsdienst: 'Hilfsdienst', awAbwesendKurz: 'abwesend',
    // Über den Wochen einer Person, wenn oben Geplantes steht (Betreiber 24.10.2026: „Ergänzen").
    awLetzteUndKommend: 'Die letzten {dauer} und was ansteht',
    awWochenBild: '{name}: Aufgaben {a}, Hilfsdienste {h}, abwesend {w}',
    // Die Wochen einer Person als Kalender (Entwurf `GWochenbildKalender`, 23.10.2026).
    awBeides: 'beides', awAbgesagt: 'abgesagt', awAusgefallen: 'ohne Zusammenkunft', awGeplantKurz: 'geplant',
    awEintragStand: '{bereich} · {stand}',
    awZweiFelder: 'Je Woche zwei Felder: erst die Zusammenkunft unter der Woche, dann die am Wochenende.',
    awJeBereich: 'Je Bereich', awZuletztVor: 'zuletzt vor {dauer}',
    // Wartezeiten (Review 17.10.2026): Wer im Bereich schon eingeteilt ist, wartet nicht.
    awGeplant: 'geplant: {datum}',
    // Engpässe (Jahresprobe 18.10.2026): je Bereich Plätze je Woche gegen die
    // Personen, die ihn haben. Die Zahlen stehen als „Bezeichnung: {n}".
    awEngpaesseTitel: 'Engpässe', awEngpassStat: 'Am knappsten: {bereich}',
    awEngpaesseText: 'Je Bereich über das ganze Jahr: wie viele Plätze je Woche anfallen und wie viele Personen den Bereich haben – daraus, alle wie viele Wochen jeder dran wäre. Die knappsten zuerst.',
    awPlaetzeJeWoche: 'Plätze je Woche: {n}', awJePersonJahr: 'je Person im Jahr: {n}',
    awNiemandHatIhn: 'niemand hat den Bereich',
    // Absagen (T126, seit 17.10.2026 aufgezeichnet). {anteil}/{sonst} sind Prozente aus `Intl`.
    awAbsagenTitel: 'Absagen je Bereich', awAbsagenZahl: 'Absagen: {n}', awAnteilVon: '{anteil} von {m}',
    awAbsagenText: 'Gezählt wird, wer seine Zuteilung abgesagt hat – auch wenn der Platz danach neu besetzt wurde. Der Anteil bezieht sich auf alle Zuteilungen des Bereichs.',
    awKeineAbsagen: 'Im Zeitraum hat niemand abgesagt.',
    awHinweisAbsagen: 'Viele Absagen: {bereich}', awTextAbsagen: '{anteil} der Zuteilungen abgesagt · sonst höchstens {sonst}',
    awAbsagen: 'Absagen',
    // Befristet (T124): die App mit den Rechten einer anderen Stufe ansehen —
    // mit `data/ansicht.ts` wieder ausbauen. {stufe} ist der Name der Stufe.
    ansichtTitel: 'Ansicht zum Testen',
    ansichtHinweis: 'Zeigt die App so, wie ein Konto dieser Stufe sie sieht. Was du dabei tust, ist echt und geschieht mit deinen Rechten. Nach dem Neuladen gilt wieder dein eigenes Recht.',
    ansichtAlsLbl: 'Ansehen als', ansichtLeiste: 'Ansicht als {stufe}',
    ansichtLeisteHinweis: 'Was du tust, ist echt – mit deinen Rechten.', ansichtBeenden: 'Beenden'
}
