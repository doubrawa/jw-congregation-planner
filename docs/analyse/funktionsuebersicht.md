# Funktionsübersicht — Congregation Planner

Bestandsaufnahme des Ist-Zustands (Stand: 7. August 2026, Commit `e2cdb41`).
Erstellt durch eine reine Analyse-Session — **keine Code-Änderungen**.

Zweck: Nachschlagewerk für die Entwicklungs-Session. Was gibt es, wo liegt es,
wer darf es sehen.

---

## 1. Kurzbild

| | |
| --- | --- |
| **Art** | Client-only SPA (React 19 + TypeScript + Vite 8), PWA-fähig |
| **Backend** | Supabase (Auth + Postgres mit RLS + 4 Edge Functions) — optional |
| **Ohne Backend** | Demo-Modus: In-Memory-Daten aus `src/data/demo.ts`, Login simuliert |
| **Styling** | reines CSS + Tokens (`src/styles/tokens.css`), keine UI-Bibliothek |
| **Zustand** | ein `useReducer` + Context; Reducer rein, Nebeneffekte in `persist.ts` |
| **Routing** | keines — `state.screen` schaltet um (kein React Router) |
| **Umfang** | ~49 000 Zeilen, davon 34 Sprach-Overlays; 51 Testdateien / 727 Testfälle (alle grün) |
| **Deployment** | GitHub Pages via `.github/workflows/deploy.yml` |

**Architektur-Kette:** `main.tsx` → `App.tsx` → `AppProvider` (`store.tsx`) →
`AppShell.tsx` → aktiver Screen. Jede Zustandsänderung läuft als Action durch
`reducer.ts` (rein) und danach durch `persist.ts` (schreibt nach Supabase).

---

## 2. Rollen und Sichtbarkeit

Rechte hängen an `state.planner` (gespiegelt aus `members.planner`), nicht an
der Person-Rolle (`aeltester`/`dienstamtgehilfe`/`verkuendiger`).

| Rolle | Sichtbare Bereiche | Einschränkung |
| --- | --- | --- |
| **Planer / Koordinator** (`planner: true`) | Start, Programm, Meine Aufgaben, Planen, Personen, Einstellungen, Profil | — |
| **Gruppenaufseher** (Aufseher/Gehilfe einer Gruppe, ohne Planer-Recht) | Start, Programm, Meine Aufgaben, Planen, Einstellungen, Profil | Planen zeigt **nur Treffpunkte der eigenen Gruppe**, Einstellungen nur deren Grundplan; **kein** Personen-Screen |
| **Verkündiger** | Start, Programm, Meine Aufgaben, Profil | — |

Durchgesetzt an zwei Stellen: Navigations-Liste in `AppShell.tsx:40-59` und
Rechteprüfung in `reducer.ts` (`case 'navigate'`, Zeile 231-256) — direkte
Navigation auf einen gesperrten Screen landet im Programm.

---

## 3. Funktionstabelle

### 3.1 Zugang, Konten, Einladungen

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 1 | Anmelden (E-Mail + Passwort) | Login | alle | `login/LoginScreen.tsx`, `lib/supabase.ts` |
| 2 | Registrieren (inkl. Mail-Bestätigung) | Login | alle | `LoginScreen.tsx` → `signUp` |
| 3 | Passwort vergessen → Reset-Mail | Login | alle | `requestPasswordReset` |
| 4 | Neues Passwort setzen (Mail-Link) | Recovery | alle | `login/RecoveryScreen.tsx` |
| 5 | Bestehende Sitzung überspringt Login | — | alle | `store.tsx` (Auth-Listener) |
| 6 | Demo-Modus ohne Supabase (beliebige Zugangsdaten) | Login | alle | `lib/supabase.ts` (`isSupabaseConfigured`) |
| 7 | Abmelden | Sidebar / Profil | alle | `performLogout` |
| 8 | Sprachauswahl bereits im Login | Login | alle | `APP_LANGS_SORTED` |
| 9 | Einladungscode einlösen (Konto → Versammlung) | Statusansicht „keine Versammlung" | alle | `redeemInvite`, DB-Funktion `redeem_invite` |
| 10 | Person einladen (Code erzeugen) | Personen → Konto-Karte | Planer | `personen/KontoCard.tsx`, `invite-helpers.ts` |
| 11 | Einladungs-Mail versenden (Resend) | Konto-Karte | Planer | Edge Function `send-invite`, `lib/invite.ts` |
| 12 | Fallback ohne Mail-Domain: `mailto:` / Teilen / Kopieren | Konto-Karte | Planer | `KontoCard.tsx`, `lib/clipboard.ts` |
| 13 | „Alle ohne Konto einladen" (Sammel-Einladung) | Personenliste | Planer | `PersonenScreen.tsx` (`inviteAll`) |
| 14 | Konten ohne Person zuordnen / entfernen | Personen (oben) | Planer | `personen/OrphanAccounts.tsx` |
| 15 | Admin-Recht setzen (spiegelt `members.planner`) | Personen-Detail | Planer | `PrivToggle.tsx` (`PlannerToggle`), `reducer.ts` |
| 16 | Erstbefüllung leerer Versammlung mit Demo-Daten | Statusansicht „leer" | Planer | `seedCongregation` |

### 3.2 Start (Dashboard)

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 17 | Tageszeit-Gruß + lokalisiertes Datum | Start | alle | `dashboard/DashboardScreen.tsx` |
| 18 | Nächste eigene Aufgabe mit Live-Countdown | Start | alle | `relativeDayLabel`, `MyTask.at` |
| 19 | Aufgabe direkt bestätigen / S-89 öffnen | Start | alle | `confirmTask`, `openS89` |
| 20 | „Diese Woche": beide Zusammenkünfte, Chip „Deine Aufgabe" | Start | alle | `assignmentsInMeeting` |
| 21 | Kacheln: ungelesene Mitteilungen, offene Bestätigungen | Start | alle | `DashboardScreen.tsx` |
| 22 | Planungs-Kachel: offene Slots + Konflikte der laufenden Woche | Start | Planer | `countOpenSlots`, `weekConflicts` |

### 3.3 Programm (Anzeige)

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 23 | Wochenprogramm in Arbeitsheft-Farblogik (Panels petrol/gold/wein/neutral) | Programm | alle | `programm/ProgrammScreen.tsx`, `SECTION_TOKENS` |
| 24 | Drei Reiter: unter der Woche / Wochenende / Treffpunkte | Programm | alle | `components/MeetingTabs.tsx` |
| 25 | Wochen blättern per Pfeil | Programm | alle | `components/WeekNav.tsx` |
| 26 | Wochen blättern per Wischgeste (Touch-Events, drei Wochen im Streifen) | Programm, Planen | alle | `components/WeekStrip.tsx`, `useSwipeWeek.ts`, `bindTouch.ts` |
| 27 | Chips: aktuelle Woche, Kreisaufseher, Gedächtnismahl | Programm, Planen | alle | `components/WeekBadges.tsx` |
| 28 | Gedächtnismahl-Banner (ausfallende Zusammenkunft) | Programm, Planen | alle | `MemorialBanner` |
| 29 | „DU"-Chip an eigenen Zuteilungen | Programm | alle | `ProgrammScreen.tsx` |
| 30 | Zusätzliche Klasse: Hauptsaal + Klasse untereinander | Programm | alle | `data/aux-class.ts` (`hatAuxKlasse`) |
| 31 | Ratgeber der Zusätzlichen Klasse als eigene Zeile | Programm | alle | `ProgrammScreen.tsx` |
| 32 | Hilfsdienst-Übersicht je Woche | Programm | alle | `ProgrammScreen.tsx` |
| 33 | Drucken (eigenes Print-Stylesheet + Kopfzeile) | Programm | alle | `programm/print.css` |
| 34 | Treffpunkte-Ansicht (Tag, Zeit, Ort, Leiter) | Programm → Reiter | alle | `programm/FsProgram.tsx` |
| 35 | Fußzeile „Ende ca." + Stand-Datum (heute) | Programm | alle | `ProgrammScreen.tsx` |

### 3.4 Planen

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 36 | Alle Slots als Chips; Tippen öffnet Zuteilungs-Sheet | Planen | Planer | `planen/PlanenScreen.tsx`, `MeetingSection.tsx`, `SlotChip.tsx` |
| 37 | Zuteilungs-Sheet mit Kandidatenliste (qualifiziert, sortiert) | Planen | Planer | `planen/AssignSheet.tsx` |
| 38 | Auslastungs-Anzeige: 5 Mini-Quadrate (Woche ±2) je Kandidat | Zuteilungs-Sheet | Planer | `loadWindow`, `LOAD_RADIUS` in `helpers.ts` |
| 39 | Abwesende ausgegraut ans Listenende | Zuteilungs-Sheet | Planer | `data/absence.ts` |
| 40 | Hinweis „heute schon zugeteilt" (warnen statt blocken) | Zuteilungs-Sheet | Planer | `assignmentsInMeeting` |
| 41 | Externe Redner als Freitext (Gastredner/Kreisaufseher) | Zuteilungs-Sheet | Planer | `PartSlotSelection.guest`, `isGuestRole` |
| 41a | Öffentlicher Vortrag umschaltbar: Gastredner ↔ eigener Redner (T29) | Zuteilungs-Sheet | Planer | `isSpeakerRole`, `ROLE_OWN_SPEAKER`, `slotRolle` |
| 41b | Sonderwoche: Tag/Uhrzeit verlegen, Zusammenkunft absagen, Grund (T30) | Planen | Planer | `Week.dev`, `SonderwochePanel`, `istAusgefallen` |
| 42 | Auto-Zuteilung, getrennt nach Aufgaben / Hilfsdiensten | Planen | Planer | `planen/AutoAssignPanel.tsx`, `autoAssignMeeting` |
| 43 | Leeren mit Zwei-Tipp-Bestätigung | Planen | Planer | `AutoAssignPanel.tsx` |
| 44 | Konflikt-Banner: abwesend, Doppelbelegung, Hilfsdienst+Aufgabe (Serien seit T81 nicht mehr) | Planen | Planer | `planen/PlanBanners.tsx`, `weekConflicts` |
| 45 | Banner der offenen Slots (ganze Woche) | Planen | Planer | `openSlotLabels` |
| 46 | Status je Chip: ✓ bestätigt / … wartet | Planen | Planer | `pendingNames` |
| 47 | „Unser Leben als Christ": Punkte hinzufügen, löschen, verschieben, Minuten ±, Endzeit zieht mit | Planen | Planer | `data/meeting-edit.ts` (`lacAdd/lacRemove/lacMove/lacAdjust`, `shiftEnd`) |
| 48 | Gesprächspartner-Slot an/aus | Planen | Planer | `togglePartner` |
| 49 | Vortragsthema (Freitext) am Wochenende | Planen | Planer | `editTalkTheme` |
| 50 | Anfangslied-Nummer am Wochenende | Planen | Planer | `setOpeningSong` |
| 51 | Ratgeber der Zusätzlichen Klasse zuteilen | Planen | Planer | `planen/AuxCounselorPanel.tsx` |
| 52 | Hilfsdienste zuteilen (je Dienst n Plätze) | Planen | Planer | `planen/HelpersPanel.tsx` |
| 53 | Reinigung als Gruppen-Rotation („Gruppe N", Wochenindex mod Anzahl) | Planen | Planer | `Service.groups`, `autoAssignMeeting` |
| 54 | Treffpunkt-Leiter zuteilen, Zeit/Ort je Woche ändern, Termin hinzufügen/löschen | Planen → Reiter | Planer, Gruppenaufseher (eigene Gruppe) | `planen/FsPlan.tsx`, `data/fs.ts` |
| 55 | Auto-Zuteilung der Treffpunkt-Leiter | Planen → Reiter | dito | `fsAutoAssign` |
| 56 | S-89-Formular aus dem Zuteilungs-Sheet erzeugen | Planen | Planer | `buildS89ForSlot`, `components/S89Sheet.tsx` |

**Auto-Zuteilungs-Regeln** (`data/planning.ts:355-372`, abgesichert durch
`autoassign.sim.test.ts` + `autoassign.fairness.test.ts`):

- Vorsitz betet zu Beginn (einzige erlaubte Doppelaufgabe)
- niemand bekommt Hilfsdienst **und** Programmpunkt am selben Tag
- fester Wachtturm-Leiter (`wtLeiter`) wird zuerst reserviert; bei Abwesenheit `wtVertreter`
- Ausgleich über zwei Strichlisten im gleitenden Fenster ±2 Wochen:
  Aufgaben nach reiner Aufgabenlast, Hilfsdienste nach Gesamtlast
- Tie-Break über Abstand zur letzten Einteilung (gesamt und je Bereich)
- Reinigungs-Aufseher bekommen weichen Malus auf weitere Hilfsdienste
- nicht besetzbare Slots bleiben offen (kein Notnagel)

### 3.5 Meine Aufgaben (persönlicher Bereich)

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 57 | Eigene Aufgaben mit Countdown-Chip | Meine Aufgaben | alle | `aufgaben/AufgabenScreen.tsx`, `deriveMyTasks` |
| 58 | Bestätigen / „Ich bin verhindert" | Meine Aufgaben, Start, Sheet | alle | `confirmTask`, `declineTask` |
| 59 | Aktions-Sheet je Aufgabe (auch Verhinderung zurücknehmen) | Overlay | alle | `components/MyTaskSheet.tsx` |
| 60 | Blatt beim Öffnen der App: Bestätigungen (Pflicht) + Ersatzgesuche (freiwillig, wegzulegen) | Overlay | alle | `components/ConfirmDialog.tsx`, `vorzulegen` |
| 61 | S-89 anzeigen (Schulungsaufgaben) | Meine Aufgaben | alle | `components/S89Sheet.tsx` |
| 62 | Abwesenheit eintragen (Von–Bis + Grund, eigener Datepicker) | Meine Aufgaben | alle | `components/DatePicker.tsx`, `addAbsence` |
| 63 | Eigene Abwesenheiten löschen | Meine Aufgaben | alle | `removeAbsence` |
| 64 | Einspringen: offene Ersatzgesuche für Hilfsdienste übernehmen | Meine Aufgaben | qualifizierte | `deriveSubstituteReqs`, `takeSubstitute`, Edge Function `substitute` |
| 65 | Push-Opt-in-Hinweis im richtigen Moment | Meine Aufgaben | alle | `components/PushPrompt.tsx` |

### 3.6 Personen

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 66 | Personenliste mit Zähler | Personen | Planer | `personen/PersonenScreen.tsx` |
| 67 | Live-Suche über Name, Telefon, E-Mail | Personen | Planer | `personen/person-filter.ts` |
| 68 | Vier Filter: Geschlecht, Rolle, Gruppe, Aufgabenbereich | Personen | Planer | `person-filter.ts`, `FilterSelect` |
| 69 | Dubletten-Warnung bei gleichem Anzeigenamen | Personen | Planer | `duplicateDisplayNames` |
| 70 | Person anlegen / löschen (löst Gruppen-/Konto-/Code-Referenzen) | Personen | Planer | `addPerson`, `removePerson` |
| 71 | Stammdaten: Vor-/Nachname, Anzeigename, Telefon, E-Mail | Detail | Planer | `personen/PersonDetail.tsx` |
| 72 | Geschlecht, Rolle, Predigtdienstgruppe | Detail | Planer | `PersonDetail.tsx` |
| 73 | Familie/Haushalt verknüpfen | Detail | Planer | `linkFamily`, `unlinkFamily` |
| 74 | Aufgabenbereiche: 11 feste + je Hilfsdienst einer | Detail | Planer | `QUALIFICATION_ORDER`, `serviceQualKey` |
| 74a | Freigabe je Hilfsdienst: alle Personen mit Schalter, Zahl am Dienst | Einstellungen | Planer | `einstellungen/ServicePersonsSheet.tsx` |
| 74b | S-89-Druckbogen der Woche, 6 je A4, Partner-Zettel schaltbar | Planen | Planer | `planen/S89Bogen.tsx`, `alleS89DerWoche`, `planen/print-s89.css` |
| 75 | Feste Wachtturm-Rollen (Leiter, Vertreter) | Detail | Planer | `WT_ROLE_ORDER` |
| 76 | Zeitleiste der Zuteilungen (Datum + Art, Vergangenes blasser) | Detail | Planer | `personen/PersonTimeline.tsx`, `person-timeline.ts` |
| 77 | Konto-Karte (Status App-Zugang, einladen) | Detail | Planer | `personen/KontoCard.tsx` |
| 78 | Auto-Speichern (debounced), leere Neuanlagen fallen weg | Detail | Planer | `persist.ts`, `isNameless` |

### 3.7 Einstellungen

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 79 | Versammlungsname + Saal | Einstellungen | Planer | `einstellungen/CongregationPanel.tsx` |
| 80 | Zusammenkunftszeiten (Wochentag + Uhrzeit je Zusammenkunft) | Einstellungen | Planer | `einstellungen/meeting-times.ts` |
| 80a | Zusätzliche Klasse an/aus (versammlungsweit, S-38 Abs. 26) | Einstellungen → Versammlung | Planer | `CongregationPanel.tsx:88-101`, `setAuxClass`, `syncAuxSlots` |
| 81 | Predigtdienstgruppen: anlegen, löschen, Aufseher/Gehilfe, Mitgliederzahl | Einstellungen | Planer | `einstellungen/GroupsPanel.tsx` |
| 82 | Treffpunkt-Grundplan: Regeln je Versammlung/Gruppe (Wochentag, Zeit, Ort, monatlich N-ter, „entfällt bei Versammlungstreffpunkt") | Einstellungen | Planer, Gruppenaufseher (eigene) | `einstellungen/FsRulesPanel.tsx`, `data/fs.ts` |
| 83 | Hilfsdienste anlegen/löschen, Platzanzahl 1–6 | Einstellungen | Planer | `einstellungen/ServicesPanel.tsx` |
| 84 | Versammlungssprache wählen (volle jw.org-Liste, durchsuchbar) | Einstellungen | Planer | `einstellungen/LanguagePanel.tsx`, `components/LanguageSheet.tsx` |
| 85 | Weitere Programmsprachen als Varianten | Einstellungen | Planer | `addProgLang`, `data/localize.ts` |
| 86 | Erinnerungen: erste (1–21 Tage), letzte (0–7 Tage), täglich wiederholen | Einstellungen | Planer | `einstellungen/RemindersPanel.tsx` |
| 87 | Programm-Import „nächste Woche importieren" + „Geladen bis …" | Einstellungen | Planer | `einstellungen/ImportPanel.tsx`, `lib/import.ts` |
| 88 | Fehlende Sprachvarianten nachziehen | Einstellungen | Planer | `missingVariants`, `importWeekVariants` |

> Der Schalter für die Zusätzliche Klasse sitzt nicht in einem eigenen Panel,
> sondern unten im Versammlungs-Panel — leicht zu übersehen, wenn man nach
> `AuxPanel` o. ä. sucht.

### 3.8 Profil

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 89 | Name, Konto-E-Mail, Versammlung | Profil | alle | `profil/ProfilScreen.tsx` |
| 90 | Push-Mitteilungen an/aus (je Gerät) | Profil | alle | `components/usePush.ts`, `lib/push.ts` |
| 91 | iOS-Hinweis „erst installieren" | Profil | alle | `pushNeedsInstall` |
| 92 | App installieren (Chromium) | Profil | alle | `lib/install.ts` |
| 93 | 11 Farbschemata (7 hell, 4 dunkel, inkl. „Hoher Kontrast") | Profil | alle | `THEME_LIST`, `styles/tokens.css` |
| 94 | Schriftgröße in 5 Stufen (0,9–1,45) | Profil | alle | `FONT_SCALES`, `--fs` |
| 95 | App-Sprache umschalten (34 Sprachen) | Profil | alle | `APP_LANGS_SORTED` |
| 96 | Build-Kennung, dahinter versteckte Gesten-Diagnose (5× tippen) | Profil | alle | `profil/Diagnose.tsx`, `lib/gesture-log.ts` |

### 3.9 Mitteilungen und Push

| # | Funktion | Wo | Wer | Umsetzung |
| --- | --- | --- | --- | --- |
| 97 | Glocken-Chip mit Zähler ungelesener Mitteilungen | Kopfzeile | alle | `AppShell.tsx` (`NotifChip`) |
| 98 | Mitteilungs-Overlay, alle-gelesen, Feed leeren | Overlay | alle | `app/NotificationsPanel.tsx` |
| 99 | 5 Mitteilungsarten: Zuteilung, Erinnerung, gesendet, Import, Verhinderung | — | alle | `NotificationType` |
| 100 | Inline-„Bestätigen" in der Mitteilung | Overlay | alle | `Notification.taskId` |
| 101 | Web-Push-Erinnerungen an unbestätigte Zuteilungen (täglicher Cron) | Server | — | Edge Function `send-reminders` |
| 102 | Push in der Sprache des Empfängers | Server | — | `migration-014-push-sprache.sql` |
| 103 | Sammel-Push an Planer für nicht erreichbare Personen | Server | Planer | `send-reminders/index.ts` |
| 104 | Doppel-Versand-Sperre pro Tag/Art/Empfänger | Server | — | `reminder_log`, `migration-011` |
| 105 | Push-Klick öffnet den richtigen Screen (Deep-Link `#go=`) | — | alle | `app/deeplink.ts`, `public/sw.js` |
| 106 | Ersatzsuche bei abgesagtem Hilfsdienst (Push an Qualifizierte) | Server | — | Edge Function `substitute` (`seek`/`take`) |

### 3.10 Programm-Import (jw.org)

| # | Funktion | Umsetzung |
| --- | --- | --- |
| 107 | Nächste Woche automatisch ermitteln (Übersicht → Zeitraum → Woche) | `supabase/functions/import-week/index.ts` |
| 108 | Sprachunabhängiger Parser (Farbklassen, Noten-Icon, Nummerierung, Zeitklammer, Position) | `import-week/parse.ts` |
| 109 | Abruf in der Versammlungssprache über den „Lesen in"-Umschalter (~480 Sprachen) | `import-week/index.ts` |
| 110 | Wachtturm-Studienartikel ergänzen: Titel, Lied vor dem Studium, Schlusslied | `import-week/study.ts` |
| 111 | Wochenende als editierbare Vorlage (nur die Woche unter der Woche steht im Arbeitsheft) | `import-week/index.ts` |
| 112 | Frisch importierte Woche erbt die Zusätzliche Klasse | `syncAuxSlots` in `reducer.ts` |
| 113 | Fixture-Tests: Deutsch + erfundene Sprache | `import-week/parse.test.ts` |

### 3.11 Mehrsprachigkeit

| # | Funktion | Umsetzung |
| --- | --- | --- |
| 114 | 34 App-Sprachen (Oberfläche), Englisch als Fallback | `i18n/langs.ts`, `i18n/overlays/*.ts` |
| 115 | Separate Versammlungssprache für Programm-Inhalte (volle jw.org-Liste) | `CONG_LANGS`, `CONG_TO_JW` |
| 116 | Drei Übersetzer-Hooks: `t` (UI), `tu` (App-Sprache), `tp` (Programmsprache) | `i18n/useT.ts` |
| 117 | Programm-Inhalts-Übersetzer für Demo-Wochen (S-38-Begriffe, Daten, Bibelstellen) | `i18n/translate.ts`, `translate-data.ts` |
| 118 | RTL-Layout für Arabisch, Hebräisch, Farsi, Urdu | `app/rtl.css`, `isRTL` |
| 119 | Datums-/Wochentagsnamen über `Intl`, keine gepflegten Listen | `LOCALES` |
| 120 | Lücken-Test gegen fehlende Schlüssel | `i18n/fill.test.ts`, `ui.test.ts` |

### 3.12 Offline und PWA

| # | Funktion | Umsetzung |
| --- | --- | --- |
| 121 | Service Worker: App-Shell cachen (Navigate netzfirst, Assets cachefirst, Supabase nie) | `public/sw.js` |
| 122 | Datenstand-Momentaufnahme im localStorage, an die Benutzer-Id gebunden | `lib/snapshot.ts` |
| 123 | Offline = **nur lesend**, Positivliste der Ansichts-Aktionen (fail-safe) | `app/readonly.ts`, `persist.ts` |
| 124 | Offline-Banner mit Zeitpunkt + „Neu laden" | `AppShell.tsx` (`OfflineBanner`) |
| 125 | Debug-Hash `#stale=<Stunden>` (nur DEV) | `app/hydrate.ts` |
| 126 | Manifest + Icons (192/512/maskable/apple-touch), erzeugt aus `logo.svg` | `public/manifest.webmanifest`, `scripts/make-icons.mjs` |
| 127 | Update-Erkennung: neue Version → Reload | `lib/version.ts` |

### 3.13 Querschnitt / Bedienung

| # | Funktion | Umsetzung |
| --- | --- | --- |
| 128 | Mobil ≤430 px zentrierte Spalte, Desktop ≥920 px mit Sidebar | `app/shell.css` |
| 129 | Mobiles Seitenmenü (Drawer) mit Fokusfalle und Escape | `AppShell.tsx`, `useDialogFocus.ts` |
| 130 | Zurück-Taste schließt Overlays statt die App | `components/useBackDismiss.ts` |
| 131 | Bottom-Sheets per Wisch-nach-unten schließen | `components/useSwipeDown.ts` |
| 132 | Toast-Meldungen mit Neustart-Timer | `AppShell.tsx`, `nextToast` |
| 133 | Hell/Dunkel ohne Flackern (Inline-Script vor erstem Paint) | `index.html` |
| 134 | Kontrast-Prüfung als Skript | `scripts/check-contrast.mjs` |

---

## 4. Datenmodell (Kurzreferenz)

| Typ | Bedeutung | Schlüsselfelder |
| --- | --- | --- |
| `Week` | eine Programmwoche | `range`, `book`, `start` (ISO), `current`, `co`, `mem`, `mid`, `we`, `alt`, `stub` |
| `Meeting` | eine Zusammenkunft | `date`, `end`, `sections[]`, `helpers{}`, `auxRatgeber` |
| `Section` | Bereichs-Panel | `label` (kanonisch **deutsch**), `farbe`, `items[]` |
| `PartItem` | Programmpunkt | `num`, `title`, `meta`, `names[]`, `aux[]` |
| `SlotAssignment` | Zuteilung | `name` (Anzeigename), `pid`, `rolle`, `bereichsKey`, `male` |
| `Person` | Person | `fn`, `ln`, `dn`, `role`, `female`, `priv`, `grp`, `fam`, `planner` |
| `Qualifications` | Aufgabenbereiche | 11 feste + dynamisch `svc:<dienstKey>` |
| `Group` | Predigtdienstgruppe | `name`, `ov`, `as` |
| `Service` | Hilfsdienst | `key`, `name`, `count`, `groups` |
| `FsRule` / `FsInstance` | Treffpunkt-Grundplan / Woche | `wd`, `time`, `place`, `monthly`, `skipCong` / `leader` |
| `Absence` | Abwesenheit | `personId`, `userId`, `from`, `to` (ISO-**Daten**) |
| `MyTask` | eigene Aufgabe | `id` = `task_key`, `status`, `at`, `s89` |
| `ConfirmationMap` | Bestätigungen | `task_key` → `offen`/`bestätigt`/`verhindert` |

**Zwei Konventionen, die überall durchschlagen:**

1. **Sektions-Labels bleiben deutsch.** Sie sind Logik-Schlüssel
   (`LABEL_LAC`, `LABEL_WT_STUDIUM` …). Übersetzt wird nur die Anzeige.
2. **`task_key` ist positionsbasiert** (`"60|mid|part|2|1|0"`). Deshalb bleiben
   nicht geladene Wochen als `stub` im Array stehen — sonst zeigten alle
   gespeicherten Bestätigungen auf die falsche Woche.

---

## 5. Backend

### Tabellen (`supabase/schema.sql` + 15 Migrationen)

`congregations` · `members` · `persons` · `services` · `groups` · `weeks` ·
`absences` · `notifications` · `confirmations` · `push_subscriptions` ·
`invites` (+ `reminder_log` aus migration-011)

RLS über zwei Hilfsfunktionen: `my_congregation_id()` und `is_planner()`.
Lesen darf jedes Mitglied der eigenen Versammlung, schreiben im Wesentlichen
nur Planer. DB-Funktion `redeem_invite` löst Codes ein (mit Sperre,
migration-012).

### Edge Functions

| Function | Zweck | Deploy |
| --- | --- | --- |
| `import-week` | jw.org-Arbeitsheft holen und parsen | mit JWT |
| `send-reminders` | Web-Push-Erinnerungen, per Cron; **Dry-Run ist Standard** (`SEND_PUSH=true` nötig) | `--no-verify-jwt` |
| `send-invite` | Einladungs-Mails über Resend; ohne `INVITE_FROM` → `not-configured`, Client nutzt `mailto:` | mit JWT |
| `substitute` | Ersatzsuche für Hilfsdienste (`seek` / `take`) | mit JWT |

---

## 6. Beobachtungen für die Entwicklungs-Session

> **Die vollständige Fehler-, Lücken- und Verbesserungsliste steht in
> [befunde.md](befunde.md)** (Bugs, fachliche Lücken, Ungereimtheiten,
> Übersetzungslücken, Testlücken, Sicherheit). Hier stehen nur die
> Doku-Abweichungen, die beim Lesen dieser Übersicht auffallen.

| Punkt | Beobachtung |
| --- | --- |
| **README-Sprachangabe** | `README.md:21` nennt „Oberfläche DE/EN/ES/FR"; tatsächlich sind es 34 Sprachen (`APP_LANGS`). Abschnitt „App-Sprachen (~30)" weiter unten sagt es richtig. |
| **README-Screenliste** | Der Status-Absatz zählt Shell, Login, Programm, Planen, Aufgaben, Personen, Einstellungen — der **Start/Dashboard-Screen** und **Profil** fehlen dort, obwohl `start` die Landeseite nach dem Login ist. |
| **README-Projektstruktur** | Der Baum in `README.md:107-146` listet `src/dashboard/`, `src/profil/`, `src/components/` (Sheets, Gesten-Hooks) und `src/i18n/overlays/` nicht. |
| **Zusätzliche Klasse** | Der Schalter hängt am Ende von `CongregationPanel.tsx` (Versammlungs-Panel), nicht an einem eigenen Panel. Funktional vollständig; nur beim Suchen im Code unerwartet platziert. |
| **`Theme`-Anzahl** | `ProfilScreen.tsx:26` sagt im Kommentar „8 Farbschemata", `THEME_LIST` hat 11. |
| **Demo-Import** | Im Demo-Modus liefert `finishImport` immer dieselbe `buildImportWeek()` und setzt `imported: true` — mehr als ein simulierter Import ist nicht vorgesehen. |
