#!/usr/bin/env node
/**
 * **S2 und S3 praktisch messen** — was ein einfaches Mitglied in seiner eigenen
 * Versammlung schreiben darf, und was nicht.
 *
 * Beide Befunde stammen aus dem Lesen der Richtlinien, nicht aus dem Betrieb;
 * sie standen seit dem 7. August unter „Was bewusst offen bleibt", weil der
 * Nachweis **zwei Mitgliedskonten derselben Versammlung** braucht. Seit T78
 * gibt es die (Planer und Mitglied in der Probeversammlung).
 *
 * | Befund | Behauptung |
 * | --- | --- |
 * | **S2** | `confirmations_write` prüft nur `user_id = auth.uid()`, **nicht**, ob der `task_key` zu einem Slot gehört, der dieser Person zugeteilt ist. Ein Mitglied könnte damit eine fremde Aufgabe als „bestätigt" markieren — der Planer sähe ✓, und die eigentlich zuständige Person würde nicht mehr erinnert. Über einen fremden **Hilfsdienst** als „verhindert" ließe sich sogar ein Ersatzgesuch auslösen. |
 * | **S3** | `notifications_insert` erlaubt jedem Mitglied Zeilen vom Typ `verhindert` — mit frei wählbarem `title`, `body` und **Empfänger**. Ein Mitglied könnte im Namen der App beliebige Mitteilungen verschicken. |
 *
 * **Sie misst den geschlossenen Zustand** (seit dem 23. August 2026).
 * Beide Befunde sind behoben; die Probe belegt es jetzt in beide Richtungen —
 * denn eine Richtlinie, die *alles* abweist, bestünde jede Fremd-Probe glänzend
 * und bräche dabei die App:
 *
 *   1. fremder `task_key`, eigene `user_id`   → muss **abgewiesen** werden (S2)
 *   2. fremde `user_id`, eigene Aufgabe       → muss **abgewiesen** werden
 *   3. `verhindert` an einen Nicht-Planer      → muss **abgewiesen** werden (S3)
 *   4. Mitteilung `zuteilung` (nur Planer)     → muss **abgewiesen** werden
 *   5. **eigene** Aufgabe bestätigen           → muss **durchkommen**
 *   6. Absage an die Planer (legitimer Weg)    → muss **durchkommen**
 *  6b. derselbe Weg mit Art `zuteilung`        → muss **abgewiesen** werden
 *
 * Den legitimen Weg (6) geht ein Mitglied seit dem 24.9.2026 nicht mehr über
 * eine eigene Zeile, sondern über `notify_planners`: Es sieht die Planer
 * nicht und könnte sie nicht adressieren. (6b) misst, dass dieser Weg nur
 * eine Verhinderung durchlässt.
 *
 * Kommt (1) oder (3) durch, steht der jeweilige Befund wieder offen. Scheitert
 * (5) oder (6), ist die Richtlinie zu streng — das wiegt schwerer, weil der
 * Client fire-and-forget schreibt und der Verlust fast lautlos wäre.
 *
 * **Seit dem 24. August 2026 misst sie zusätzlich S10, S11 und S13** — dieselbe
 * Anlage, andere Grenzen. (7)–(8) hängen wieder an RLS, (9)–(10) an der Edge
 * Function `substitute`, die mit Service-Role arbeitet und sich deshalb selbst
 * schützen muss:
 *
 *   7. Abwesenheit auf eine **fremde** Person  → muss **abgewiesen** werden (S11)
 *   8. **eigene** Abwesenheit                  → muss **durchkommen**
 *   9. fremden Platz übernehmen, ohne Absage   → muss **abgewiesen** werden (S13)
 *  10. Ersatzsuche mit gefälschter Versammlung → muss **abgewiesen** werden (S10)
 *
 * (10) ist die einzige, die nicht bloß eine Regel prüft, sondern einen **Weg**:
 * Der Rumpfwert trägt ein angehängtes `#`. Ging der ungekodiert in die
 * REST-Pfade, schnitt er dort alles Folgende ab — und die Prüfung, wer eine
 * Ersatzsuche auslösen darf, lief ins Leere. Kommt (10) durch, ist nicht eine
 * Richtlinie offen, sondern die ganze Kodierung.
 *
 * **Seit dem 3. Oktober 2026 misst sie auch die Rechte aus T120** — die Pläne
 * der Versammlung. Dort geht es auch ums **Sehen**: Einen Entwurf sieht nur,
 * wer planen darf.
 *
 *  11. einen Gruppenbesuch anlegen                      → abgewiesen
 *  12. einen Gruppenbesuch sehen                        → sichtbar
 *  28. einen Plan im Entwurf sehen                      → unsichtbar
 *  29. den veröffentlichten Königreichssaal sehen       → sichtbar
 *  33. einen Plan anlegen                               → abgewiesen
 *  34. eine Woche eines Plans selbst besetzen           → abgewiesen
 *
 * (22)–(27) maßen die Redner auswärts, (30)–(32) die Vorlage „Familien
 * reihum" — beides gab es vom 3. bis 4.10.2026. (13)–(21), (37), (56), (57),
 * (62)–(64) maßen Stand und Schicht (3. bis 14.10.2026). Die Nummern bleiben
 * frei, damit Protokolle und Notizen von damals weiter auf dieselben Fälle
 * zeigen.
 *
 * Anders als (1)–(10) findet die Probe dafür **keinen Bestand** vor:
 * Gruppenbesuche und Pläne gibt es in der Probeversammlung nicht von selbst.
 * Der Admin legt sie an — im Jahr 2099, jede Kennung mit dem Kennzeichen des
 * Laufs —, und am Ende räumt die Probe genau diese Zeilen wieder weg, auch
 * nach einem Fehler mittendrin. **Vorübergehend ändert sie die Rechte von
 * Personen** und stellt sie danach wieder her: beim Mitglied die
 * Freischaltung für den Hilfsdienst aus (9), wenn sie fehlt, und das
 * Trolley-Recht für (71)–(79) in beiden Stellungen, bei Mitglied und
 * Gruppenaufseher die Freischaltung für den Dienst, den sie in (93)–(110)
 * tauschen (siehe unten).
 *
 * **Jede durchgekommene Zeile wird sofort wieder gelöscht.** Wer aufräumen darf,
 * hängt am Empfänger: `notifications_delete` verlangt `user_id = auth.uid()`,
 * also räumt bei (6) der Planer seine eigene Zeile weg. Deshalb braucht die
 * Probe beide Anmeldungen.
 *
 * **Seit dem 4. Oktober 2026 misst sie die Rechte-Stufen** — mit vier Konten
 * statt zwei, je Stufe eines (`testversammlung-anlegen.mjs` legt sie an). Das
 * Konto `planer@` ist dabei der **Admin** (`members.planner`, die App nannte
 * ihn bis dahin „Planer"); die Stufe „Planer" (`members.zuteiler`) hat
 * `zuteiler@`. Im Code heißt das Admin-Konto deshalb weiter `planer`, in der
 * Ausgabe „Admin". **Seit dem 15.10.2026 plant der Planer alles wie der
 * Admin** („Alles Planen"): Wochen schreibt er unmittelbar, Treffpunkte,
 * Grundplan, Gruppenbesuche und Weitere Pläne ändert er ganz — bis dahin teilte
 * er nur zu und schrieb Wochen über die Edge Function `zuteilen`, die es nicht
 * mehr gibt. Personen und Einstellungen bleiben beim Admin (80, 81). Der
 * Gruppenaufseher ändert die Treffpunkte seiner Gruppe, keine fremden.
 *
 *  35. Mitglied: einen Programmpunkt der Woche umbenennen       → abgewiesen
 *  36. Mitglied: „Plan senden"                                  → abgewiesen
 *  38. Planer: einen Programmpunkt der Woche umbenennen         → durch
 *  39. Planer: einen Platz der Woche freigeben                  → durch
 *  40. Planer: eine Woche anlegen, wie der Import               → durch
 *  41. Planer: sich selbst zum Admin machen                     → abgewiesen
 *  42. Planer: den Ort eines Treffpunkts ändern                 → durch
 *  43. Planer: den Leiter eines Treffpunkts setzen              → durch
 *  44. Gruppenaufseher: Ort, Treffpunkt einer fremden Gruppe    → abgewiesen
 *  45. Gruppenaufseher: Leiter, Treffpunkt einer fremden Gruppe → abgewiesen
 *  46. Gruppenaufseher: Ort eines Versammlungstreffpunkts       → abgewiesen
 *  47. Gruppenaufseher: Ort, Treffpunkt der eigenen Gruppe      → durch
 *  48. dasselbe, dazu die nachgetragene Person eines fremden
 *      Leiters (`fsLeiterBinden` beim Laden)                    → durch
 *  49. Mitglied: einen Treffpunkt ändern                        → abgewiesen
 *  50. Planer: eine Regel im Grundplan anlegen                  → durch
 *  51. Gruppenaufseher: eine Regel für eine fremde Gruppe       → abgewiesen
 *  52. Gruppenaufseher: eine Regel für die eigene Gruppe        → durch
 *  53. Planer: einen Gruppenbesuch verschieben                  → durch
 *  54. Planer: den Besucher eines Gruppenbesuchs wechseln       → durch
 *  55. Planer: einen Gruppenbesuch anlegen                      → durch
 *  58. Planer: einen Plan im Entwurf sehen                      → sichtbar
 *  59. Planer: eine Woche eines Plans besetzen                  → durch
 *  60. Planer: einen Plan anlegen                               → durch
 *  61. Planer: die Absage eines Mitglieds bekommen              → angekommen
 *  65. Mitglied: einen vorgemerkten Vortrag sehen               → unsichtbar
 *  66. Gruppenaufseher: einen vorgemerkten Vortrag sehen        → unsichtbar
 *  67. Mitglied: einen Vortrag vormerken                        → abgewiesen
 *  68. Gruppenaufseher: einen Vortrag vormerken                 → abgewiesen
 *  69. Planer: einen vorgemerkten Vortrag sehen                 → sichtbar
 *  70. Planer: einen Vortrag vormerken (Upsert wie die App)     → durch
 *  80. Planer: eine Person anlegen                              → abgewiesen
 *  81. Planer: den Namen der Versammlung ändern                 → abgewiesen
 *  82. Mitglied: eine fremde Abwesenheit, neun Wochen vorbei    → unsichtbar
 *  83. Gruppenaufseher: dieselbe Abwesenheit                    → unsichtbar
 *  84. Planer: dieselbe Abwesenheit                             → sichtbar
 *  85. Mitglied: die eigene Abwesenheit, neun Wochen vorbei     → sichtbar
 *  86. Mitglied: die E-Mail-Adressen über die Tabelle           → abgewiesen
 *  87. Mitglied: die Gründe der Abwesenheiten über die Tabelle  → abgewiesen
 *  88. Admin: die Adressen über personen_mails                  → sichtbar
 *  89. Mitglied: die Adressen über personen_mails               → leer
 *  90. Planer: den Grund einer fremden Abwesenheit              → unsichtbar
 *  91. Mitglied: den Grund der eigenen Abwesenheit              → sichtbar
 *  92. Admin: den Grund der Abwesenheit des Mitglieds           → sichtbar
 *
 * (86)–(92) kamen am 29.10.2026 dazu, mit dem Sicherheits-Review: Adressen und
 * Gründe las bis dahin jedes Mitglied über die REST-Schnittstelle. Seither
 * sperren Spaltenrechte beide Spalten, und zwei Funktionen liefern sie nur,
 * wem die App sie zeigt.
 *
 * (82)–(85) kamen am 19.10.2026 dazu: die Leseregel der Abwesenheiten vom
 * 17.10.2026 (`absences_select`). Seit die Auswertung ein Jahr zurückblickt,
 * bleiben Abwesenheiten ein Jahr; älter als acht Wochen sieht sie nur, wer
 * zuteilt — und wem sie gehört.
 *
 * (36) zielt ins Leere — eine Woche im Jahr 2100, die es nicht gibt —, damit
 * eine offene Tür nichts verschickt; dass die Function dann „keine Woche"
 * meldet, heißt bereits: durchgelassen.
 *
 * Wo ein Versuch an einer **bestehenden** Zeile durchkommt (die
 * Programmwoche, ein Treffpunkt, das eigene Konto des Planers, ein
 * Gruppenbesuch, der Name der Versammlung), stellt der Admin sofort den vorigen
 * Stand her. Alles Übrige legt der Admin wieder im Jahr 2099 an — die Woche
 * aus (40) der Planer —, und am Ende geht es weg.
 *
 * (65)–(70) kamen am 12.10.2026 mit dem Vortragsplan (T122). Vorgemerkt werden
 * Vorträge für Wochen, die es noch nicht gibt, mit dem Namen des auswärtigen
 * Redners und seiner Versammlung. Die sieht nur, wer zuteilt
 * (`vortraege_zuteilen`); Mitglied und Gruppenaufseher zeigt die Tabelle
 * nichts. Sie brauchen weder Personen noch Gruppen und messen deshalb auch
 * dann, wenn (42)–(61) mangels Gruppe ungemessen bleiben.
 *
 * **Seit dem 14. Oktober 2026 misst sie die Trolleys** (T121, Phase 7) — sie
 * lösten Stand und Schicht ab. Einen Termin schreibt kein Mitglied selbst:
 * Eintragen und Austragen gehen über die Edge Function `trolley`, die das
 * Recht prüft und dem Partner Bescheid sagt; eine Schreib-Richtlinie für
 * `trolley_termine` gibt es nicht. Die Trolleys pflegt der Admin.
 *
 *  71. Mitglied: einen Termin direkt in die Tabelle schreiben   → abgewiesen
 *  72. Mitglied: einen Trolley anlegen                          → abgewiesen
 *  73. Planer: einen Trolley anlegen                            → abgewiesen
 *  74. Mitglied ohne Trolley-Recht: sich eintragen              → abgewiesen
 *  75. Mitglied mit Trolley-Recht: sich eintragen, allein       → durch
 *  76. Mitglied: den eigenen Termin sehen                       → sichtbar
 *  77. Gruppenaufseher: den Termin des Mitglieds austragen      → abgewiesen
 *  78. Mitglied: sich wieder austragen                          → durch
 *  79. Planer: einen Trolley entfernen                          → abgewiesen
 *
 * (71)–(73) schreiben an der Function vorbei in die Tabellen, (74), (75) und
 * (77)–(79) gehen wie die App über sie. Der Admin legt dafür einen Trolley an
 * (2099, Kennzeichen); am Ende löscht er ihn, und seine Termine gehen mit
 * (`on delete cascade`) — direkt löschen darf sie niemand. Das Trolley-Recht
 * des Mitglieds (`priv.zeugnis`) setzt die Probe für (71) und (75) und nimmt
 * es für (74). Bei (71) gehört es dazu: Ohne wiese schon der Trigger ab
 * (`trolley_ohne_recht`, ein 400), bevor die Richtlinie gefragt ist.
 * Eingetragen wird allein, mit „Partner gesucht" — so geht keine Mitteilung
 * hinaus. Ob ein Versuch an der Function etwas bewirkt hat, sieht der Admin
 * danach in der Tabelle nach; ein Urteil ist neben dem Erfolg allein die
 * Abweisung über das Recht (`kein-recht`, `forbidden`).
 *
 * **Seit dem 31. Oktober 2026 misst sie das Tauschen** (T153). Die Function
 * `tauschen` und die Datenbankfunktion `wochen_tauschen` liefen bis dahin nur
 * gegen Attrappen. Getauscht wird über die Function, wie die App
 * (`src/lib/tauschen.ts`); was sie schreibt — Wochen, Zusagen,
 * Versand-Tagebuch, Mitteilungen —, sieht die Probe danach in den Tabellen
 * nach. Anfragen schreibt nur die Function, lesen dürfen sie die beiden, um
 * die es geht (`tausch_anfragen_select`).
 *
 *  93.  Ohne Anmeldung: die Function tauschen rufen              → abgewiesen
 *  94.  Mitglied: eine Anfrage an der Function vorbei schreiben  → abgewiesen
 *  95.  Mitglied: einen fremden Platz gleich weggeben            → abgewiesen
 *  96.  Mitglied: um einen Platz ohne „Plan senden" bitten       → abgewiesen
 *  97.  Mitglied: eine Zusammenkunft tauschen, die schon war     → abgewiesen
 *  98.  Mitglied: gleich tauschen mit jemandem mit Konto         → abgewiesen
 *  99.  Mitglied: die Angebote für den eigenen Platz holen       → sichtbar
 *  100. Mitglied: den Gruppenaufseher um einen Tausch bitten     → durch
 *  101. Gruppenaufseher: die Anfrage an ihn sehen, samt Glocke   → sichtbar
 *  102. Planer: die Anfrage sehen                                → unsichtbar
 *  103. Planer: die Anfrage annehmen                             → abgewiesen
 *  104. Gruppenaufseher: die Anfrage ablehnen                    → durch
 *  105. Mitglied: eine neue Anfrage zurückziehen                 → durch
 *  106. Gruppenaufseher: annehmen — beide Wochen auf einmal      → durch
 *  107. … Zusagen und Versand-Tagebuch der beiden                → sichtbar
 *  108. … „Getauscht" an Mitglied, Admin und Planer              → sichtbar
 *  109. Mitglied: mit einer Person ohne Konto gleich tauschen    → durch
 *  110. … sie „weiß Bescheid", „Getauscht" an Admin und Planer   → sichtbar
 *
 * Die Anlage legt der Admin an (`tauschAnlage`): vier Wochen im Jahr 2099 mit
 * je einem Platz eines Dienstes und eine Person ohne Konto, das Kennzeichen
 * im Vornamen. Mitglied und Gruppenaufseher schaltet die Probe für den Dienst
 * frei. Getauscht wird erst, wenn der Plan einer Woche hinausging — also
 * drückt der Admin „Plan senden" für die Probewochen, bis auf die eine für
 * (96). Das schreibt Mitteilungen an Mitglied und Gruppenaufseher; hat eines
 * der Konten ein Push-Abo, kommt dort auch die Nachricht an, wie bei jedem
 * Fall mit Bescheid.
 *
 * (97) braucht eine Zusammenkunft, die schon war und deren Plan doch
 * hinausging. „Plan senden" nimmt nur, was noch ansteht, und den Tag des
 * Geräts glaubt der Server nur, wenn er höchstens einen neben dem eigenen
 * liegt (`heuteUtc`). Also legt die Probe die Woche von gestern an, ihr
 * Wochenende auf gestern verlegt, sendet sie mit dem Tag von gestern und
 * tauscht mit dem von heute — ist die Woche belegt, montags ersatzweise mit
 * der Zusammenkunft von heute und dem Tag von morgen. Steht in beiden Wochen
 * schon eine, bleibt (97) ungemessen.
 *
 * Was niemand direkt löschen darf, räumt die Probe auf dem Weg der App weg:
 * offene Anfragen zieht das Mitglied zurück, das Versand-Tagebuch der
 * Probewochen nimmt der Admin per „Entzug" heraus (`send-plan`). Die
 * Mitteilungen, die dabei und vorher entstanden, löscht jeder Empfänger selbst.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 * Gemessen wird mit dem **anon**-Key plus Anmeldung — wie in
 * `mandanten-nachweis.mjs` und aus demselben Grund: Der Service-Role-Key
 * umgeht RLS, ein Nachweis damit wäre wertlos.
 *
 *   node scripts/testversammlung-anlegen.mjs --wochen 2      (zuerst --trocken)
 *   node scripts/mitgliedsrechte-probe.mjs
 *
 * **Nichts vorher setzen, nichts abtippen.** URL und anon-Schlüssel stehen in
 * `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); Versammlung,
 * Adressen und Kennwörter der vier Konten in der Kontendatei, die
 * `testversammlung-anlegen.mjs` schreibt (`.env.probe`, seit 5.10.2026 —
 * siehe `PROBE_DATEI` in `gemeinsam.mjs`). Die Konten heißen dort
 * `planer@probe.invalid` (Admin), `mitglied@`, `zuteiler@` (Planer) und
 * `aufseher@` (Gruppenaufseher). Umgebungsvariablen gehen vor (`SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`, `PROBE_VERSAMMLUNG`, `PROBE_PLANER_MAIL`/`_PASS`,
 * `PROBE_MITGLIED_MAIL`/`_PASS`, `PROBE_ZUTEILER_MAIL`/`_PASS`,
 * `PROBE_AUFSEHER_MAIL`/`_PASS`), etwa für andere Konten. Fehlt ein Kennwort
 * überall, fragt die Probe verdeckt danach.
 *
 * `--versammlung <id>` nennt die Versammlung ausdrücklich, sonst gilt die der
 * Kontendatei; geprüft wird sie so oder so gegen alle Konten. Die Probe
 * **schreibt**, wenn auch nur kurz — sie soll das nicht in der echten
 * Versammlung tun, weil jemand versehentlich sein eigenes Konto einträgt.
 */

import { alsSkript, anfrageKaputt, istDienstSchluessel, probeDatei, pruefKlient, verdecktLesen, wertAusEnvDatei } from './gemeinsam.mjs'

/* ===================== Schlüssel (Spiegel von planning.ts) ================ */

/**
 * Stabiler Schlüssel eines Programmpunkt-Slots — dasselbe wie `punktKey` in
 * `supabase/functions/_shared/aufgaben-schluessel.ts`: Woche, Zusammenkunft,
 * Raum, Kennung des Punkts, Platz. Node lädt die TypeScript-Datei nicht,
 * deshalb steht die Regel hier ein zweites Mal;
 * `mitgliedsrechte-probe.test.ts` hält beide Fassungen aneinander.
 *
 * Ein falsch gebauter Schlüssel wäre hier besonders tückisch: Die Probe schriebe
 * ihn anstandslos und meldete „durchgelassen" — nur bezöge er sich auf gar
 * keinen Slot, und der Befund wäre nicht belegt, sondern bloß behauptet.
 */
export function slotSchluessel(item, woche, tab, ni, aux = false) {
  return `${woche}|${tab}|${aux ? 'aux' : 'part'}|${item.iid}|${ni}`
}

/** Stabiler Schlüssel eines Hilfsdienst-Slots (Spiegel von `helferKey`). */
export function helferSchluessel(woche, tab, svc, pos) {
  return `${woche}|${tab}|helper|${svc}|${pos}`
}

/**
 * Der Dienst aus einem Hilfsdienst-Schlüssel — oder null, wenn es keiner ist.
 *
 * Gebraucht für (9): `take` weist zuerst ab, wer für den Dienst gar nicht
 * qualifiziert ist. Wäre das Mitglied es nicht, bekäme die Probe `not-qualified`
 * und hätte über S13 nichts gemessen, sähe aber genauso aus wie ein Erfolg.
 */
export function dienstAusSchluessel(key) {
  const p = String(key ?? '').split('|')
  return p.length === 5 && p[2] === 'helper' ? p[3] : null
}

/** Ist die Person für diesen Dienst freigeschaltet? (Spiegel von `isQualified`.) */
export function qualifiziertFuer(person, svc) {
  return Boolean(person?.priv?.[`svc:${svc}`])
}

/**
 * Alle besetzten Slots einer Woche, die **nicht** der angegebenen Person
 * gehören — samt fertigem Schlüssel. Externe Redner (ohne `pid`) bleiben außen
 * vor: Sie haben keinen Bestätigungs-Flow, und eine Bestätigung darauf bewiese
 * nichts über fremde Aufgaben.
 */
export function fremdeSlots(week, eigenePid) {
  const out = []
  for (const tab of ['mid', 'we']) {
    const meeting = week[tab]
    if (!meeting) continue
    ;(meeting.sections ?? []).forEach((sec) => {
      ;(sec.items ?? []).forEach((item) => {
        if (!Array.isArray(item.names)) return
        item.names.forEach((slot, ni) => {
          if (!slot.pid || slot.pid === eigenePid) return
          out.push({ art: 'Programm', wer: slot.name, key: slotSchluessel(item, week.start, tab, ni) })
        })
      })
    })
    for (const [svc, plaetze] of Object.entries(meeting.helpers ?? {})) {
      plaetze.forEach((slot, pos) => {
        if (!slot.pid || slot.pid === eigenePid) return
        out.push({ art: `Hilfsdienst ${svc}`, wer: slot.name, key: helferSchluessel(week.start, tab, svc, pos) })
      })
    }
  }
  return out
}

/**
 * Das Gegenstück: die Slots, die der Person **gehören**. Ohne einen davon misst
 * die Probe nur die halbe Wahrheit — dass die Richtlinie Fremdes abweist,
 * bewiese nichts, wenn sie alles abwiese. Genau das ist die Gefahr an
 * `task_gehoert_mir`: Eine zu strenge Prüfung bräche das Bestätigen, und der
 * Client schreibt fire-and-forget.
 */
export function eigeneSlots(week, eigenePid) {
  if (!eigenePid) return []
  const out = []
  for (const tab of ['mid', 'we']) {
    const meeting = week[tab]
    if (!meeting) continue
    ;(meeting.sections ?? []).forEach((sec) => {
      ;(sec.items ?? []).forEach((item) => {
        if (!Array.isArray(item.names)) return
        item.names.forEach((slot, ni) => {
          if (slot.pid !== eigenePid) return
          out.push({ art: 'Programm', wer: slot.name, key: slotSchluessel(item, week.start, tab, ni) })
        })
      })
    })
    for (const [svc, plaetze] of Object.entries(meeting.helpers ?? {})) {
      plaetze.forEach((slot, pos) => {
        if (slot.pid !== eigenePid) return
        out.push({ art: `Hilfsdienst ${svc}`, wer: slot.name, key: helferSchluessel(week.start, tab, svc, pos) })
      })
    }
  }
  return out
}

/* ===================== Bewertung ========================================== */

/**
 * Einen Schreibversuch bewerten. `erwartetDurch` sagt, was der **Befund**
 * behauptet: Kommt die Zeile an, ist er bestätigt — das ist dann kein
 * „bestanden", sondern eine Lücke. Deshalb hat diese Probe zwei Achsen, und
 * die Ausgabe nennt beide.
 *
 * **Das Urteil hängt am `angekommen`, nicht am Status** — und das ist teuer
 * gelernt: Die erste Fassung schrieb mit `Prefer: return=representation` und
 * bekam auf die Mitteilung ein **403**, obwohl die Zeile erlaubt war. PostgreSQL
 * wendet SELECT-Richtlinien auf die `RETURNING`-Klausel an, und der Absender
 * darf eine Mitteilung an jemand anderen nicht zurücklesen. Um ein Haar wäre S3
 * als „greift nicht mehr" abgehakt worden, obwohl der Befund steht.
 *
 * Die App macht es richtig: `data.ts:1336` fügt ohne `.select()` ein, also ohne
 * `RETURNING`. Genau das ahmt die Probe seither nach — geschrieben wird mit
 * `return=minimal`, und ob etwas ankam, wird **am Ziel** nachgesehen, mit einem
 * Konto, das dort lesen darf.
 *
 * **Und nur, wenn überhaupt gemessen wurde** (seit dem 26.9.2026). „Nicht
 * angekommen" ist ein Urteil nur, wenn das Schreiben an der Regel scheiterte
 * und das Nachsehen gelang. Scheiterte das Schreiben an etwas anderem — ein
 * 400 für eine vertippte Spalte, ein 5xx —, oder scheiterte das Nachsehen
 * selbst, dann kam nichts an, weil nichts gefragt wurde; vorher hieß das bei
 * jedem verbotenen Fall „abgewiesen". `urteil` sagt, ob der Schreibstatus ein
 * Urteil ist: bei PostgREST 401/403 (`anfrageKaputt`), bei einer Edge Function
 * ihr Fehlercode, den nur der Aufrufer kennt.
 *
 * `vielleichtDurch`: Das Schreiben kam durch, nur das Nachsehen scheiterte —
 * die Zeile kann also dastehen. Allein dann räumt die Probe vorsorglich auf.
 *
 * `erwartet` geht mit hinaus: Die Schlussrechnung zählt daran, welche Fälle
 * verboten waren und welche Gegenproben. `woerter` benennen das Ergebnis, wo
 * „angekommen" nicht passt — beim Ändern, an einer Tür, beim Ein- und
 * Austragen.
 */
export function bewerteVersuch(
  status,
  angekommen,
  erwartetDurch,
  { leseStatus = 200, urteil = !anfrageKaputt(status), woerter = ['ANGEKOMMEN', 'nicht angekommen'] } = {},
) {
  if (!urteil || leseStatus >= 400) {
    return {
      durch: false,
      wieErwartet: false,
      kaputt: true,
      erwartet: erwartetDurch,
      vielleichtDurch: urteil && status < 400,
      text: `PROBE KAPUTT — ${urteil ? `Nachsehen scheiterte (HTTP ${leseStatus})` : `Schreiben scheiterte (HTTP ${status})`}, kein Urteil über die Regel`,
    }
  }
  return {
    durch: angekommen,
    wieErwartet: angekommen === erwartetDurch,
    erwartet: erwartetDurch,
    text: `${angekommen ? woerter[0] : woerter[1]} (HTTP ${status})`,
  }
}

/**
 * Einen **Leseversuch** bewerten (T120): Sieht das Mitglied die Zeile?
 *
 * Bei einer Abfrage antwortet RLS nicht mit 403, sondern mit **weniger
 * Zeilen** — eine leere Antwort ist das Urteil. Darum ist hier jeder
 * Fehlerstatus „kaputt", auch 401 und 403: Ein Lesen, das scheiterte, zeigte
 * ebenfalls nichts und sähe sonst aus wie die Grenze, die greift. Dass es die
 * Zeile überhaupt gibt, sichert der Aufrufer vorher (Anlage beim Planer
 * nachgesehen); `detail` sagt, was zu sehen war.
 */
export function bewerteSicht(leseStatus, sichtbar, erwartet, detail = '') {
  const wo = detail ? `; ${detail}` : ''
  if (leseStatus >= 400) {
    return { durch: false, wieErwartet: false, kaputt: true, erwartet, text: `PROBE KAPUTT — Lesen scheiterte (HTTP ${leseStatus}${wo}), kein Urteil über die Regel` }
  }
  return { durch: sichtbar, wieErwartet: sichtbar === erwartet, erwartet, text: `${sichtbar ? 'SICHTBAR' : 'nicht sichtbar'} (HTTP ${leseStatus}${wo})` }
}

/** Die Zeilen einer Antwort — bei einem Fehler keine, statt eines Fehlerobjekts, das `for … of` sprengt. */
const zeilenVon = (antwort) => (Array.isArray(antwort?.daten) ? antwort.daten : [])

/* ===================== T120: Tage und Anlage ============================== */

/** Ein Tag `n` Tage nach `iso` — über UTC gerechnet, ohne Sommerzeitsprung. */
export function tagPlus(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Der Wochentag wie `extract(dow …)` in Postgres: 0 = Sonntag. */
export function wochentag(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

/** Der erste Montag ab `iso` — er selbst, wenn er einer ist. */
export function ersterMontagAb(iso) {
  return tagPlus(iso, (8 - wochentag(iso)) % 7)
}

/**
 * **Was die Probe für T120 anlegt** — und was das Mitglied zu schreiben
 * versucht. Rein, damit der Test prüfen kann, dass jede Zeile die Regeln der
 * Datenbank erfüllt, die mit den Rechten nichts zu tun haben: Ein
 * Gruppenbesuch, der nicht an einem Montag liegt, oder ein zweiter Eintrag in
 * derselben Woche eines Plans scheiterte an der Datenbank — beides sähe aus
 * wie eine Abweisung und wäre doch keine über die Rechte.
 *
 * Alles liegt in der Woche von `tag0` (ein Montag, 2099) und der danach;
 * jede Kennung trägt `marke`, daran findet das Aufräumen genau diese Zeilen.
 *
 * @param {{
 *   marke: string, versammlung: string, tag0: string,
 *   planerPid: string, mitgliedPid: string, gruppe?: string | null
 * }} auftrag
 */
export function t120Anlage({ marke, versammlung: c, tag0, planerPid, mitgliedPid, gruppe = null }) {
  const id = (name) => `${marke}-${name}`
  const montag = (wochen) => tagPlus(tag0, 7 * wochen)
  const sonntag = (wochen) => tagPlus(tag0, 7 * wochen + 6)
  // Zwei Wochen: Der Versuch des Mitglieds (34) liegt in der zweiten, sonst
  // träfe er den Platz der ersten — und scheiterte an `plan_eintraege_woche`.
  const plan = (name, entwurf) => ({
    id: id(name), congregation_id: c, name: marke, von: tag0, bis: sonntag(1), entwurf,
  })
  const eintrag = (name, planId, datum = montag(0)) => ({
    id: id(name), congregation_id: c, plan_id: planId, datum, grp: gruppe,
  })

  const plaene = {
    entwurf: plan('plan-entwurf', true),
    saal: plan('plan-saal', false),
  }
  return {
    besuch: gruppe ? { id: id('besuch'), congregation_id: c, woche: montag(1), grp: gruppe, person_id: planerPid } : null,
    besuchVersuch: gruppe ? { id: id('besuch-mitglied'), congregation_id: c, woche: montag(0), grp: gruppe, person_id: mitgliedPid } : null,
    plaene,
    eintraege: {
      entwurf: [eintrag('e-entwurf', plaene.entwurf.id)],
      saal: [eintrag('e-saal', plaene.saal.id)],
    },
    planVersuch: plan('plan-versuch', false),
    // Eine Woche des veröffentlichten Plans selbst besetzen — schreiben darf
    // dort nur ein Planer.
    eintragVersuch: eintrag('e-versuch', plaene.saal.id, montag(1)),
  }
}

/* ===================== Zugang ============================================= */

/**
 * Die Konten, wie `testversammlung-anlegen.mjs` sie anlegt (`TEST_KONTEN`) —
 * deren Versammlung misst die Probe gewöhnlich. `planer` ist der Admin,
 * `zuteiler` die Stufe „Planer" (siehe Kopf).
 */
export const PROBE_KONTEN = {
  planer: 'planer@probe.invalid',
  mitglied: 'mitglied@probe.invalid',
  zuteiler: 'zuteiler@probe.invalid',
  aufseher: 'aufseher@probe.invalid',
}

/**
 * **Woher die Probe ihren Zugang nimmt** — rein, damit der Test es ohne Datei
 * und Terminal prüfen kann. Die Umgebung schlägt die Dateien, wie in
 * `gemeinsam.mjs`: URL und anon-Schlüssel stehen im Projekt (`.env.local`,
 * die Namen der App, `ausDatei`); Versammlung, Adressen und Kennwörter in der
 * Kontendatei, die `testversammlung-anlegen.mjs` schreibt (`.env.probe`,
 * `ausKonten`). Fehlt ein Kennwort überall, fragt `zugang()` danach.
 *
 * Bis zum 3.10.2026 verlangte die Probe sechs Umgebungsvariablen im selben
 * Fenster: das Muster, an dem am 17.9. fünf Läufe starben und das
 * `zugangsdaten()` seither für alle anderen Skripte abgelöst hat. Am 3.10.
 * scheiterte so auch ihr eigener erster Lauf — an einem Platzhalter im Aufruf.
 * Die Kontendatei kam am 5.10.2026 dazu (siehe `PROBE_DATEI`): Die verdeckte
 * Abfrage nahm im Terminal der Desktop-App keine Eingabe an, und die
 * Kennwörter aus dem Rückblick waren am nächsten Tag weg.
 *
 * `dienstSchluessel`: Ein Schlüssel, der RLS umgeht, machte jede Messung
 * wertlos — der alte Service-Role-Schlüssel wie der neue `sb_secret_…`.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(name: string) => string} ausDatei
 * @param {(name: string) => string} [ausKonten]
 */
export function zugangAus(env, ausDatei, ausKonten = () => '') {
  const anon = env.SUPABASE_ANON_KEY || ausDatei('VITE_SUPABASE_ANON_KEY')
  const wert = (name) => env[name] || ausKonten(name)
  return {
    url: env.SUPABASE_URL || ausDatei('VITE_SUPABASE_URL'),
    anon,
    versammlung: wert('PROBE_VERSAMMLUNG'),
    planerMail: wert('PROBE_PLANER_MAIL') || PROBE_KONTEN.planer,
    mitgliedMail: wert('PROBE_MITGLIED_MAIL') || PROBE_KONTEN.mitglied,
    zuteilerMail: wert('PROBE_ZUTEILER_MAIL') || PROBE_KONTEN.zuteiler,
    aufseherMail: wert('PROBE_AUFSEHER_MAIL') || PROBE_KONTEN.aufseher,
    planerPass: wert('PROBE_PLANER_PASS'),
    mitgliedPass: wert('PROBE_MITGLIED_PASS'),
    zuteilerPass: wert('PROBE_ZUTEILER_PASS'),
    aufseherPass: wert('PROBE_AUFSEHER_PASS'),
    dienstSchluessel: istDienstSchluessel(anon, env),
  }
}

/** Der Zugang aus Umgebung, `.env.local` und Kontendatei — noch ohne zu fragen. */
function zugangOhneFragen() {
  return zugangAus(process.env, (name) => wertAusEnvDatei(name), (name) => wertAusEnvDatei(name, [probeDatei()]))
}

/** Den Zugang vervollständigen: abbrechen, wo etwas fehlt; fehlende Kennwörter verdeckt erfragen. */
async function zugang(z) {
  if (!z.url || !z.anon) {
    console.error('Keine Projekt-URL oder kein anon-Schlüssel — weder SUPABASE_URL/SUPABASE_ANON_KEY gesetzt noch VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in .env.local.')
    process.exit(2)
  }
  if (z.dienstSchluessel) {
    console.error('Der anon-Schlüssel ist ein Dienst-Schlüssel. Der umgeht RLS — die Probe wäre wertlos.')
    process.exit(2)
  }
  const konten = [
    ['planerPass', z.planerMail],
    ['mitgliedPass', z.mitgliedMail],
    ['zuteilerPass', z.zuteilerMail],
    ['aufseherPass', z.aufseherMail],
  ]
  for (const [feld, mail] of konten) {
    if (z[feld]) continue
    if (!process.stdin.isTTY) {
      console.error(
        `Kein Kennwort für ${mail} und kein Terminal zum Fragen — PROBE_PLANER_PASS / PROBE_MITGLIED_PASS / PROBE_ZUTEILER_PASS / PROBE_AUFSEHER_PASS setzen.`,
      )
      process.exit(2)
    }
    process.stderr.write(`Kennwort für ${mail} (bleibt verdeckt): `)
    z[feld] = await verdecktLesen()
  }
  return z
}

/**
 * Eine Edge Function aufrufen — mit dem **Nutzer-Token**, wie die App es tut.
 * Die Function arbeitet intern mit Service-Role; ihre Rechteprüfung hängt
 * also allein daran, wen dieses Token ausweist. Genau das ist die Grenze,
 * die (9) und (10) messen.
 *
 * Ohne Sitzung schickt die App den öffentlichen Schlüssel als Token mit —
 * `token` ist dann `anon`, so ruft (93).
 */
function funktionsKlient(url, anon, token) {
  return async (name, rumpf) => {
    const antwort = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(rumpf),
    })
    const text = await antwort.text()
    let daten = null
    try {
      daten = text ? JSON.parse(text) : null
    } catch {
      daten = text
    }
    return { status: antwort.status, daten }
  }
}

async function anmelden(url, anon, mail, pass) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: pass }),
  })
  if (!res.ok) throw new Error(`Anmeldung ${mail} fehlgeschlagen (${res.status}): ${await res.text()}`)
  const { access_token: token, user } = await res.json()

  const rest = pruefKlient(url, anon, token)
  const funktion = funktionsKlient(url, anon, token)

  // Die **eigene** Zeile, nach dem Konto gefiltert: Einem Admin zeigt
  // `members_select` alle Zeilen seiner Versammlung, und welche davon vorne
  // liegt, entscheidet die Speicherreihenfolge. Bis zum 4.10.2026 fehlte der
  // Filter — dass der Admin sich selbst fand, war Glück: Seine Zeile war die
  // zuerst angelegte.
  const { status, daten: mitglied } = await rest(`members?select=congregation_id,person_id,planner,zuteiler&user_id=eq.${user.id}`)
  // Ein Fehler hier hieße sonst „in keiner Versammlung" — die falsche Spur.
  if (status >= 400) throw new Error(`${mail}: members nicht lesbar (${status}): ${JSON.stringify(mitglied)}`)
  if (!mitglied?.[0]) throw new Error(`${mail} ist in keiner Versammlung.`)
  const ich = mitglied[0]
  return {
    mail,
    rest,
    funktion,
    uid: user.id,
    cong: ich.congregation_id,
    pid: ich.person_id,
    planer: Boolean(ich.planner),
    zuteiler: Boolean(ich.zuteiler),
  }
}

/* ===================== T120: die Fälle 11–34 ============================== */

/**
 * Als Admin anlegen und nachsehen, ob es dasteht. Ohne das misst ein
 * Lesefall nichts: Eine leere Antwort hieße sonst „unsichtbar", obwohl es die
 * Zeile gar nicht gab.
 */
async function anlegen(planer, tabelle, zeilen) {
  const s = await planer.rest(tabelle, 'POST', zeilen, 'return=minimal')
  if (s.status >= 400) return { ok: false, grund: `Anlage als Admin scheiterte (${tabelle}, HTTP ${s.status})` }
  const l = await planer.rest(`${tabelle}?select=id&id=in.(${zeilen.map((z) => z.id).join(',')})`)
  if (l.status >= 400) return { ok: false, grund: `Anlage nicht nachprüfbar (${tabelle}, HTTP ${l.status})` }
  const da = zeilenVon(l).length
  return da === zeilen.length ? { ok: true } : { ok: false, grund: `Anlage unvollständig (${tabelle}: ${da} von ${zeilen.length})` }
}

/**
 * Ein Upsert, wie die App ihn schickt (`upsert` in `data.ts`). Eine Zeile, die
 * es schon gibt, ändert er — und kommt dabei als INSERT an, deshalb vergleichen
 * die Trigger der Rechte-Stufen mit der bestehenden Zeile. Die Probe geht den
 * Weg der App, nicht einen eigenen: Ein PATCH träfe andere Richtlinien.
 */
const UPSERT = 'resolution=merge-duplicates,return=minimal'

/**
 * Ein Schreibversuch: ohne RETURNING schreiben, beim Admin nachsehen,
 * Angekommenes wegräumen. Es schreibt das Mitglied, wenn `wer` nichts anderes
 * sagt; `prefer` ist für den Upsert (`UPSERT`), `loeschen` für eine Zeile, die
 * auch der Admin nicht selbst löschen darf (71), `leser` für eine, die er gar
 * nicht sieht (94).
 */
async function schreibVersuch(k, nr, was, tabelle, zeile, erwartet, folge, { wer = k.mitglied, prefer = 'return=minimal', loeschen, leser = k.planer } = {}) {
  const s = await wer.rest(tabelle, 'POST', zeile, prefer)
  const l = await leser.rest(`${tabelle}?select=id&id=eq.${zeile.id}`)
  const e = bewerteVersuch(s.status, zeilenVon(l).length > 0, erwartet, { leseStatus: l.status })
  k.ergebnis(nr, was, e, e.durch ? folge[0] : folge[1])
  await k.aufraeumen(e, loeschen ?? (() => k.planer.rest(`${tabelle}?id=eq.${zeile.id}`, 'DELETE', undefined, 'return=minimal')))
}

/** Was `wer` von einer Zeile sieht — gelesen über ihre Kennung, für `leseVersuch`. */
const zeileSicht = (wer, tabelle, id) => async () => {
  const r = await wer.rest(`${tabelle}?select=id&id=eq.${id}`)
  return { status: r.status, sichtbar: zeilenVon(r).length > 0 }
}

/** Ein Leseversuch des Mitglieds — gemessen nur, wenn die Anlage dasteht. */
async function leseVersuch(k, nr, was, anlage, lesen, erwartet, folge) {
  if (!anlage.ok) return k.kaputt(nr, was, anlage.grund, erwartet)
  const r = await lesen()
  const e = bewerteSicht(r.status, r.sichtbar, erwartet, r.detail)
  k.ergebnis(nr, was, e, e.durch ? folge[0] : folge[1])
}

/**
 * Was das Mitglied von einem Plan sieht: den Plan und seine Einträge. Verboten
 * ist schon ein Teil davon; erlaubt heißt: alles — wer den Plan sieht, soll
 * auch sehen, welche Gruppe wann dran ist.
 */
async function planSicht(mitglied, plan, eintraege, ganz) {
  const [p, e] = await Promise.all([
    mitglied.rest(`plaene?select=id&id=eq.${plan.id}`),
    mitglied.rest(`plan_eintraege?select=id&plan_id=eq.${plan.id}`),
  ])
  const nP = zeilenVon(p).length
  const nE = zeilenVon(e).length
  return {
    status: Math.max(p.status, e.status),
    sichtbar: ganz ? nP === 1 && nE === eintraege.length : nP + nE > 0,
    detail: `Plan ${nP}/1, Einträge ${nE}/${eintraege.length}`,
  }
}

/** (11)–(12) Gruppenbesuche (Phase 2): lesen alle, schreiben nur Planer. */
async function gruppenbesucheProben(k, a) {
  if (!a.besuch) {
    k.ungemessen(11, 'einen Gruppenbesuch anlegen', 'keine Gruppe in der Versammlung')
    k.ungemessen(12, 'einen Gruppenbesuch sehen', 'keine Gruppe in der Versammlung')
    return
  }
  await schreibVersuch(k, 11, 'einen Gruppenbesuch anlegen', 'gruppenbesuche', a.besuchVersuch, false, [
    'AUCH DAS!',
    'abgewiesen — gruppenbesuche_write greift',
  ])
  const anlage = await anlegen(k.planer, 'gruppenbesuche', [a.besuch])
  const lesen = zeileSicht(k.mitglied, 'gruppenbesuche', a.besuch.id)
  await leseVersuch(k, 12, 'einen Gruppenbesuch sehen, den der Planer angelegt hat', anlage, lesen, true, [
    'die Gruppe erfährt, wann der Dienstaufseher kommt',
    'ZU STRENG — die Gruppe erfährt nicht, wann der Dienstaufseher kommt',
  ])
}

/**
 * (28), (29), (33), (34) Weitere Pläne (Phase 5): sehen über `plan_sichtbar` —
 * einen Entwurf nie, Veröffentlichtes alle; schreiben nur Planer.
 */
async function plaeneProben(k, a) {
  const { planer, mitglied } = k
  const p = a.plaene
  const plaene = await anlegen(planer, 'plaene', [p.entwurf, p.saal])
  const anlage = plaene.ok ? await anlegen(planer, 'plan_eintraege', Object.values(a.eintraege).flat()) : plaene

  await leseVersuch(k, 28, 'einen Plan im Entwurf sehen', anlage, () => planSicht(mitglied, p.entwurf, a.eintraege.entwurf, false), false, [
    'AUCH DAS!',
    'unsichtbar — einen Entwurf sehen nur Admin und Planer',
  ])
  await leseVersuch(k, 29, 'den veröffentlichten Königreichssaal sehen', anlage, () => planSicht(mitglied, p.saal, a.eintraege.saal, true), true, [
    'die ganze Versammlung sieht ihn',
    'ZU STRENG — die Versammlung sieht den Saalplan nicht',
  ])

  await schreibVersuch(k, 33, 'einen Plan anlegen', 'plaene', a.planVersuch, false, ['AUCH DAS!', 'abgewiesen — nur der Admin'])
  const was34 = 'eine Woche eines Plans selbst besetzen'
  if (anlage.ok) await schreibVersuch(k, 34, was34, 'plan_eintraege', a.eintragVersuch, false, ['AUCH DAS!', 'abgewiesen — nur Admin und Planer'])
  else k.kaputt(34, was34, anlage.grund, false)
}

/**
 * Die Schritte eines Aufräumens, einer nach dem anderen — einer, der
 * scheitert, hält die übrigen nicht auf. Am Ende ein Satz, was blieb;
 * `nachsatz` nennt, was außer den Zeilen mit Kennzeichen wieder stimmt. Ein
 * Schritt aus mehreren Aufrufen sieht danach nach und nennt mit `grund`, was
 * stehen blieb.
 */
async function nacheinanderAufraeumen(marke, schritte, nachsatz = '') {
  const offen = []
  for (const [was, tun] of schritte) {
    const r = await tun()
    if (r.status >= 400 || r.grund) offen.push(`${was} (${r.grund ?? `HTTP ${r.status}`})`)
  }
  console.log(
    offen.length
      ? `  !! Nicht aufgeräumt: ${offen.join(', ')} — Kennzeichen ${marke} !!`
      : `  (alles mit Kennzeichen ${marke} wieder entfernt${nachsatz})`,
  )
}

/**
 * Alles wieder weg, was die Probe für T120 angelegt hat — über das
 * Kennzeichen, damit es auch die Zeilen trifft, die gar nicht hätten ankommen
 * sollen. Die Einträge gehen ausdrücklich vor ihrem Plan, statt sich auf
 * `on delete cascade` zu verlassen: So prüft die Attrappe, die keine Kaskade
 * kennt, das Aufräumen mit.
 */
async function t120Aufraeumen(k) {
  const { planer, marke } = k
  const weg = (tabelle) => () => planer.rest(`${tabelle}?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')
  await nacheinanderAufraeumen(marke, [
    ['die Plan-Einträge', weg('plan_eintraege')],
    ['die Pläne', weg('plaene')],
    ['die Gruppenbesuche', weg('gruppenbesuche')],
  ])
}

/**
 * Die Fälle (11)–(34) — siehe Kopf. `k` bringt die Anmeldungen und die
 * Ausgabe-Helfer aus `main` mit. Aufgeräumt wird in jedem Fall, auch wenn ein
 * Fall mittendrin wirft.
 */
async function t120Proben(k) {
  const { planer, mitglied, versammlung, marke } = k
  console.log('\nDie Rechte aus T120 (angelegt als Admin, im Jahr 2099):')
  if (!mitglied.pid || !planer.pid || mitglied.pid === planer.pid) {
    k.ungemessen('11–34', 'die Pläne der Versammlung', 'Admin und Mitglied brauchen je eine eigene Person')
    return
  }
  const [personen, gruppen] = await Promise.all([
    planer.rest(`persons?select=id&id=in.(${mitglied.pid},${planer.pid})`),
    planer.rest('groups?select=id&limit=1'),
  ])
  if (zeilenVon(personen).length < 2) {
    k.ungemessen('11–34', 'die Pläne der Versammlung', `die beiden Personen sind nicht lesbar (HTTP ${personen.status})`)
    return
  }
  const gruppe = zeilenVon(gruppen)[0]?.id ?? null
  const a = t120Anlage({
    marke,
    versammlung,
    tag0: ersterMontagAb('2099-01-01'),
    planerPid: planer.pid,
    mitgliedPid: mitglied.pid,
    gruppe,
  })
  try {
    await gruppenbesucheProben(k, a)
    await plaeneProben(k, a)
  } finally {
    await t120Aufraeumen(k)
  }
}

/* ===================== Rechte-Stufen: die Fälle 35–70 ===================== */

/** Die Programmpunkte unter der Woche mit ihrer Stelle. */
function punkteUnterDerWoche(daten) {
  const out = []
  ;(daten?.mid?.sections ?? []).forEach((sec, si) => {
    ;(sec?.items ?? []).forEach((item, ii) => out.push({ item, si, ii }))
  })
  return out
}

/** Die Plätze eines Programmpunkts — leer bei einer Lied-Zeile. */
const plaetzeVon = (item) => (Array.isArray(item?.names) ? item.names : [])

/**
 * **Eine Änderung am Plan** für (35) und (38): Der erste Programmpunkt unter
 * der Woche mit einem Titel bekommt das Kennzeichen angehängt. `null`, wenn
 * die Woche keinen hat.
 */
export function planAenderung(daten, marke) {
  const treffer = punkteUnterDerWoche(daten).find(({ item }) => typeof item?.title === 'string')
  if (!treffer) return null
  const data = structuredClone(daten)
  data.mid.sections[treffer.si].items[treffer.ii].title = `${treffer.item.title} ${marke}`
  return { data, si: treffer.si, ii: treffer.ii }
}

/**
 * **Eine Zuteilung** für (39): Der erste besetzte Platz unter der Woche wird
 * frei — Name, Person und Herkunft weg, wie „Entfernen" in der App. Das
 * Kleinste, was ein Planer tut; der Admin stellt die Woche danach zurück.
 */
export function zuteilungAenderung(daten) {
  for (const { item, si, ii } of punkteUnterDerWoche(daten)) {
    const ni = plaetzeVon(item).findIndex((s) => s?.pid)
    if (ni < 0) continue
    const data = structuredClone(daten)
    const platz = data.mid.sections[si].items[ii].names[ni]
    platz.name = ''
    delete platz.pid
    delete platz.herkunft
    return { data, si, ii, ni }
  }
  return null
}

/**
 * Welche Gruppe der Gruppenaufseher leitet (`eigene`) — und eine, die keines
 * der Probekonten leitet (`fremde`): Nur an der misst ein Versuch die Grenze
 * „fremde Gruppe" und nicht zufällig das Recht eines Gruppenaufsehers.
 * `mitgliedLeitet`: Dann mäße (49) den Gruppenaufseher statt des Mitglieds.
 */
export function gruppenWahl(gruppen, { aufseherPid, zuteilerPid, mitgliedPid }) {
  const leitet = (g, pid) => Boolean(pid) && (g.overseer_id === pid || g.assistant_id === pid)
  const eigene = gruppen.find((g) => leitet(g, aufseherPid))?.id ?? null
  const fremde = gruppen.find((g) => g.id !== eigene && ![aufseherPid, zuteilerPid, mitgliedPid].some((pid) => leitet(g, pid)))?.id ?? null
  return { eigene, fremde, mitgliedLeitet: gruppen.some((g) => leitet(g, mitgliedPid)) }
}

/**
 * **Was die Probe für die Rechte-Stufen anlegt** — und was Planer,
 * Gruppenaufseher und Mitglied daran zu ändern versuchen. Rein, damit der Test
 * prüfen kann, dass jeder Versuch genau **eine** Regel trifft: Jeder ändert
 * genau einen Treffpunkt in genau einem Feld — bis auf (48), das zur eigenen
 * Gruppe die nachgetragene Person eines fremden Leiters mitschickt, wie die App
 * es nach `fsLeiterBinden` tut. Ohne Ausnahme für `lpid` im Trigger scheiterte
 * daran jede Änderung eines Gruppenaufsehers.
 *
 * Alles liegt hinter den Wochen von T120 (Woche 6–8 nach `tag0`); jede
 * Kennung trägt `marke`, daran findet das Aufräumen genau diese Zeilen.
 *
 * @param {{
 *   marke: string, versammlung: string, tag0: string, adminPid: string,
 *   zuteilerPid: string, eigeneGruppe: string, fremdeGruppe: string
 * }} auftrag
 */
export function stufenAnlage({ marke, versammlung: c, tag0, adminPid, zuteilerPid, eigeneGruppe, fremdeGruppe }) {
  const id = (name) => `${marke}-${name}`
  const montag = (wochen) => tagPlus(tag0, 7 * wochen)

  // Drei Treffpunkte einer Woche: der eigenen Gruppe des Gruppenaufsehers,
  // einer fremden und der ganzen Versammlung — in der Form, die die App
  // schreibt (`FsInstance`).
  const treffpunkt = (name, grp, wd, leader = '') => ({ id: id(`fs-${name}`), ruleId: null, grp, wd, time: '09:30', place: marke, leader, manual: true })
  const fs = {
    eigen: treffpunkt('eigen', eigeneGruppe, 3),
    fremd: treffpunkt('fremd', fremdeGruppe, 3, 'Probe Leiter'),
    versammlung: treffpunkt('versammlung', null, 6),
  }
  const treffpunkte = Object.values(fs)
  /** Die Treffpunkte der Woche, an den genannten geändert. */
  const mit = (aenderung) => treffpunkte.map((t) => ({ ...t, ...(aenderung[Object.keys(fs).find((n) => fs[n] === t)] ?? {}) }))
  const ort = `${marke} verlegt`
  const leiter = 'Probe Leiter Zwei'
  const fsVersuche = [
    {
      nr: 42, wer: 'zuteiler', was: 'Planer: den Ort eines Treffpunkts ändern',
      ziel: fs.versammlung.id, feld: 'place', wert: ort, data: mit({ versammlung: { place: ort } }),
      erwartet: true, folge: ['der Weg steht offen', 'ZU STRENG — der Planer kann Treffpunkte nicht ändern'],
    },
    {
      nr: 43, wer: 'zuteiler', was: 'Planer: den Leiter eines Treffpunkts setzen',
      ziel: fs.versammlung.id, feld: 'leader', wert: leiter, data: mit({ versammlung: { leader: leiter, lpid: adminPid } }),
      erwartet: true, folge: ['der Weg steht offen', 'ZU STRENG — der Planer kann keine Leiter einteilen'],
    },
    {
      nr: 44, wer: 'aufseher', was: 'Gruppenaufseher: den Ort eines Treffpunkts einer fremden Gruppe ändern',
      ziel: fs.fremd.id, feld: 'place', wert: ort, data: mit({ fremd: { place: ort } }),
      erwartet: false, folge: ['AUCH DAS!', 'fremde Gruppen bleiben, wie sie sind'],
    },
    {
      nr: 45, wer: 'aufseher', was: 'Gruppenaufseher: den Leiter eines Treffpunkts einer fremden Gruppe setzen',
      ziel: fs.fremd.id, feld: 'leader', wert: leiter, data: mit({ fremd: { leader: leiter } }),
      erwartet: false, folge: ['AUCH DAS!', 'die Leiter fremder Gruppen setzt er nicht'],
    },
    {
      nr: 46, wer: 'aufseher', was: 'Gruppenaufseher: den Ort eines Versammlungstreffpunkts ändern',
      ziel: fs.versammlung.id, feld: 'place', wert: ort, data: mit({ versammlung: { place: ort } }),
      erwartet: false, folge: ['AUCH DAS!', 'ein Treffpunkt ohne Gruppe gehört keinem Gruppenaufseher'],
    },
    {
      nr: 47, wer: 'aufseher', was: 'Gruppenaufseher: den Ort eines Treffpunkts der eigenen Gruppe ändern',
      ziel: fs.eigen.id, feld: 'place', wert: ort, data: mit({ eigen: { place: ort } }),
      erwartet: true, folge: ['der Weg steht offen', 'ZU STRENG — der Gruppenaufseher kann seine Treffpunkte nicht ändern'],
    },
    {
      nr: 48, wer: 'aufseher', was: 'Gruppenaufseher: dasselbe, während die App einen fremden Leiter an seine Person gebunden hat',
      ziel: fs.eigen.id, feld: 'place', wert: ort, data: mit({ eigen: { place: ort }, fremd: { lpid: adminPid } }),
      erwartet: true, folge: ['der Weg steht offen — die Person des Leiters zählt nicht', 'ZU STRENG — jede Änderung scheitert, sobald die App irgendwo einen Leiter bindet'],
    },
    {
      nr: 49, wer: 'mitglied', was: 'Mitglied: einen Treffpunkt ändern',
      ziel: fs.versammlung.id, feld: 'place', wert: ort, data: mit({ versammlung: { place: ort } }),
      erwartet: false, folge: ['AUCH DAS!', 'Treffpunkte schreiben Admin, Planer und Gruppenaufseher'],
    },
  ]

  const regel = (name, grp) => ({ id: id(`regel-${name}`), congregation_id: c, grp, wd: 3, time: '09:30', place: marke, monthly: 0, skip_cong: false, aus: [] })
  const besuch = { id: id('besuch-stufe'), congregation_id: c, woche: montag(6), grp: fremdeGruppe, person_id: adminPid }
  const plan ={ id: id('plan-stufe'), congregation_id: c, name: marke, von: montag(6), bis: tagPlus(montag(7), 6), entwurf: true }
  return {
    fsStart: montag(6),
    treffpunkte,
    fsVersuche,
    regeln: {
      planer: regel('planer', fremdeGruppe),
      aufseherFremd: regel('aufseher-fremd', fremdeGruppe),
      aufseherEigen: regel('aufseher-eigen', eigeneGruppe),
    },
    besuch,
    besuchVersuche: {
      verschoben: { ...besuch, woche: montag(7) },
      besucher: { ...besuch, person_id: zuteilerPid },
      neu: { id: id('besuch-planer'), congregation_id: c, woche: montag(8), grp: fremdeGruppe, person_id: zuteilerPid },
    },
    plan,
    planEintrag: { id: id('e-stufe'), congregation_id: c, plan_id: plan.id, datum: montag(6), grp: fremdeGruppe },
    eintragVersuch: { id: id('e-planer'), congregation_id: c, plan_id: plan.id, datum: montag(7), grp: fremdeGruppe },
    planVersuch: { ...plan, id: id('plan-planer'), entwurf: false },
    absage: `${marke} — Absage auch an den Planer`,
  }
}

/**
 * Was der Planer für (40) und (80) anlegt — hinter allem anderen der Probe, im
 * Jahr 2099: eine Woche, wie der Import sie anlegt (ohne Programm), und eine
 * Person. Die Woche trägt das Kennzeichen in ihrem Zeitraum, die Person im
 * Vornamen; die Person braucht eine echte `uuid` (`persons.id`).
 */
export function verwaltungAnlage({ marke, versammlung: c, tag0, personId }) {
  const start = tagPlus(tag0, 7 * 20)
  return {
    woche: {
      congregation_id: c,
      start,
      data: { range: marke, book: '', start, mid: { date: '', end: '', sections: [], helpers: {} }, we: { date: '', end: '', sections: [], helpers: {} } },
    },
    person: { id: personId, congregation_id: c, fn: marke, ln: 'Probe' },
  }
}

/**
 * Die Anlage für (65)–(70), die Vormerkungen des Vortragsplans (T122): ein
 * Vortrag, den der Admin vormerkt, und je Versuch ein eigener. Jeder liegt in
 * einer anderen Woche — `vortraege` hält eine Vormerkung je Woche
 * (`unique (congregation_id, woche)`), und ein Versuch in einer belegten Woche
 * scheiterte am Schlüssel. Das sähe aus wie eine Abweisung über die Rechte.
 * Ein auswärtiger Redner, wie ihn der Import vormerkt: Name und Versammlung,
 * keine Person.
 */
export function vortragAnlage({ marke, versammlung: c, tag0 }) {
  const vortrag = (name, wochen) => ({
    id: `${marke}-${name}`,
    congregation_id: c,
    woche: tagPlus(tag0, 7 * wochen),
    redner: `${marke} Redner`,
    versammlung: marke,
    eigener: false,
    person_id: null,
    thema: '',
    lied: '',
  })
  return {
    vortrag: vortrag('vortrag', 10),
    versuche: {
      mitglied: vortrag('vortrag-mitglied', 11),
      aufseher: vortrag('vortrag-aufseher', 12),
      planer: vortrag('vortrag-planer', 13),
    },
  }
}

/**
 * Die Anlage für (82)–(85), die Leseregel der Abwesenheiten (`absences_select`,
 * 17.10.2026): je eine Abwesenheit des Admins und des Mitglieds, die neun Wochen
 * vor dem Montag dieser Woche endete — eine mehr als die Grenze der Regel
 * (acht Wochen), damit kein Wochenwechsel während des Laufs sie verschiebt.
 * `absences.id` ist eine echte `uuid`; der Grund trägt das Kennzeichen.
 */
export function abwesenheitAnlage({ marke, versammlung: c, heute, admin, mitglied, ids }) {
  const montag = ersterMontagAb(tagPlus(heute, -6))
  const bis = tagPlus(montag, -7 * 9)
  const abwesenheit = (id, wer) => ({
    id,
    congregation_id: c,
    user_id: wer.uid,
    person_id: wer.pid,
    from_date: tagPlus(bis, -2),
    to_date: bis,
    reason: marke,
  })
  return { fremde: abwesenheit(ids[0], admin), eigene: abwesenheit(ids[1], mitglied) }
}

/** Was nach einem durchgekommenen Änderungsversuch geschieht — zurückstellen, nicht löschen. */
const ZURUECK = ['wieder zurückgestellt', 'vorsorglich zurückgestellt']

/**
 * Ein Versuch, eine **bestehende** Zeile zu ändern: schreiben, beim Admin
 * nachsehen, ob die Änderung dasteht, und sie dann zurücknehmen.
 *
 * „Angekommen" heißt hier: geändert. Auf ein PATCH, das RLS gar nicht erst
 * trifft, antwortet PostgREST mit 204 — wie beim Löschen zählt deshalb, was
 * danach dasteht, nicht der Status. `nachsehen` liefert `{ status,
 * angekommen }` und `fehlt`, wenn die Zeile selbst nicht zu finden ist: Dann
 * ist nichts gemessen. Zurückgestellt wird auch, wenn nur das Nachsehen
 * scheiterte — die Änderung kann trotzdem dastehen. `urteil` sagt bei einer
 * Edge Function, welche Antwort ein Urteil ist.
 */
async function aenderVersuch(k, { nr, was, schreiben, nachsehen, zurueck, erwartet, folge, urteil }) {
  const s = await schreiben()
  let l
  try {
    l = await nachsehen()
  } catch (err) {
    if (s.status < 400) await zurueck()
    throw err
  }
  if (l.fehlt) {
    k.kaputt(nr, was, `nichts nachzusehen: ${l.fehlt}`, erwartet)
    await k.aufraeumen({ durch: false, vielleichtDurch: s.status < 400 }, zurueck, ZURUECK)
    return
  }
  const e = bewerteVersuch(s.status, l.angekommen, erwartet, { leseStatus: l.status, urteil: urteil?.(s), woerter: ['GEÄNDERT', 'nicht geändert'] })
  k.ergebnis(nr, was, e, e.durch ? folge[0] : folge[1])
  if (e.kaputt) console.log(`      Die Antwort: ${JSON.stringify(s.daten)}`)
  await k.aufraeumen(e, zurueck, ZURUECK)
}

/**
 * Ein Versuch an der Tür einer Edge Function — (36), (93). Gezielt wird ins
 * Leere, damit eine offene Tür nichts verschickt und nichts schreibt. Deshalb
 * heißt nicht nur ein 2xx „durchgelassen", sondern auch eine Antwort, die erst
 * **hinter** der Rechteprüfung kommt (`nachDerTuer`, etwa „keine Woche"). Ein
 * Urteil über die Tür ist sonst allein ihre Abweisung — `forbidden`, ohne
 * Anmeldung `unauthorized` (`tuer`).
 */
async function tuerVersuch(k, nr, was, wer, name, rumpf, nachDerTuer, folge, tuer = 'forbidden') {
  const a = await wer.funktion(name, rumpf)
  const fehler = a.daten?.error
  const durch = a.status < 400 || nachDerTuer.includes(fehler)
  const e = bewerteVersuch(a.status, durch, false, { urteil: durch || fehler === tuer, woerter: ['DURCHGELASSEN', 'abgewiesen'] })
  k.ergebnis(nr, was, e, e.durch ? 'AUCH DAS!' : `${folge} (${fehler ?? '—'})`)
  if (e.kaputt || e.durch) console.log(`      Die Function antwortete: ${JSON.stringify(a.daten)}`)
}

/**
 * (35), (38)–(41) Die Programmwoche: Seit dem 15.10.2026 schreibt der Planer
 * sie unmittelbar, wie der Admin — umbenennen, zuteilen, eine neue anlegen;
 * das Mitglied nicht. Sich selbst zum Admin machen kann der Planer nicht. Nach
 * jedem Versuch, der durchkam, stellt der Admin den vorigen Stand her.
 */
async function wochenProben(k, woche, neu) {
  const { planer, zuteiler, mitglied, versammlung, marke } = k
  const zeile = `weeks?congregation_id=eq.${versammlung}&start=eq.${woche}`
  const vorher = await planer.rest(`weeks?select=data&start=eq.${woche}`)
  const original = zeilenVon(vorher)[0]?.data
  if (!original) {
    for (const nr of [35, 38, 39]) k.kaputt(nr, `die Woche ${woche} ändern`, `für den Admin nicht lesbar (HTTP ${vorher.status})`, nr !== 35)
  } else {
    const zurueck = () => planer.rest(zeile, 'PATCH', { data: original }, 'return=minimal')
    const beimAdmin = (pruefe) => async () => {
      const r = await planer.rest(`weeks?select=data&start=eq.${woche}`)
      const d = zeilenVon(r)[0]?.data
      return { status: r.status, angekommen: Boolean(d) && pruefe(d), fehlt: r.status < 400 && !d ? 'die Woche ist weg' : null }
    }

    const plan = planAenderung(original, marke)
    if (!plan) {
      for (const [nr, was] of [[35, 'Mitglied: einen Programmpunkt der Woche umbenennen'], [38, 'Planer: einen Programmpunkt der Woche umbenennen']]) {
        k.ungemessen(nr, was, 'kein Programmpunkt mit Titel in der Woche')
      }
    } else {
      const umbenannt = (d) => String(d?.mid?.sections?.[plan.si]?.items?.[plan.ii]?.title ?? '').includes(marke)
      await aenderVersuch(k, {
        nr: 35,
        was: 'Mitglied: einen Programmpunkt der Woche umbenennen',
        schreiben: () => mitglied.rest(zeile, 'PATCH', { data: plan.data }, 'return=minimal'),
        nachsehen: beimAdmin(umbenannt),
        zurueck,
        erwartet: false,
        folge: ['AUCH DAS!', 'Wochen schreiben Admin und Planer'],
      })
      await aenderVersuch(k, {
        nr: 38,
        was: 'Planer: einen Programmpunkt der Woche umbenennen',
        schreiben: () => zuteiler.rest(zeile, 'PATCH', { data: plan.data }, 'return=minimal'),
        nachsehen: beimAdmin(umbenannt),
        zurueck,
        erwartet: true,
        folge: ['der Weg steht offen', 'ZU STRENG — der Planer kann die Woche nicht einrichten'],
      })
    }

    const zuteilung = zuteilungAenderung(original)
    if (!zuteilung) {
      k.ungemessen(39, 'Planer: einen Platz der Woche freigeben', 'kein besetzter Platz unter der Woche')
    } else {
      const frei = (d) => !d?.mid?.sections?.[zuteilung.si]?.items?.[zuteilung.ii]?.names?.[zuteilung.ni]?.pid
      await aenderVersuch(k, {
        nr: 39,
        was: 'Planer: einen Platz der Woche freigeben',
        schreiben: () => zuteiler.rest(zeile, 'PATCH', { data: zuteilung.data }, 'return=minimal'),
        nachsehen: beimAdmin(frei),
        zurueck,
        erwartet: true,
        folge: ['der Weg steht offen', 'ZU STRENG — der Planer kann nicht mehr zuteilen'],
      })
    }
  }

  await neueWocheVersuch(k, neu)

  const konto = `members?user_id=eq.${zuteiler.uid}`
  await aenderVersuch(k, {
    nr: 41,
    was: 'Planer: sich selbst zum Admin machen',
    schreiben: () => zuteiler.rest(konto, 'PATCH', { planner: true }, 'return=minimal'),
    nachsehen: async () => {
      const r = await planer.rest(`members?select=planner&user_id=eq.${zuteiler.uid}`)
      const m = zeilenVon(r)[0]
      return { status: r.status, angekommen: Boolean(m?.planner), fehlt: r.status < 400 && !m ? 'der Admin sieht das Konto des Planers nicht' : null }
    },
    zurueck: () => planer.rest(konto, 'PATCH', { planner: false }, 'return=minimal'),
    erwartet: false,
    folge: ['AUCH DAS!', 'Rechte vergibt nur der Admin'],
  })
}

/**
 * (42)–(49) Die Treffpunkte einer Woche — angelegt vom Admin im Jahr 2099,
 * geschrieben als ganze Woche. Die App schreibt seit dem 15.10.2026 mit Stand
 * (`saveFsWeek`: einfügen, sonst ändern unter `updated_at`); der Upsert hier
 * geht durch dieselben Richtlinien (`fs_weeks_einfuegen`, `fs_weeks_aendern`)
 * und denselben Trigger (`fs_weeks_pruefen`, vor Einfügen wie Ändern) — er
 * misst also dieselbe Grenze, nur ohne Stand. Ob ein Versuch ankam, steht
 * danach am Treffpunkt selbst.
 *
 * Vorher wird nachgesehen: Eine Woche mit Treffpunkten, die nicht von einer
 * Probe stammen, wird nicht überschrieben — eine, die ein abgebrochener Lauf
 * hinterließ (nur Kennungen mit „PROBE-"), schon. `merker.treffpunktWoche`
 * sagt dem Aufräumen, ob die Woche der Probe gehört.
 */
async function treffpunktProben(k, a, konten, mitgliedLeitet, merker) {
  const { planer, versammlung } = k
  const zeile = `fs_weeks?congregation_id=eq.${versammlung}&start=eq.${a.fsStart}`
  const upsert = (wer, data) => wer.rest('fs_weeks?on_conflict=congregation_id,start', 'POST', { congregation_id: versammlung, start: a.fsStart, data }, UPSERT)
  const lesen = () => planer.rest(`fs_weeks?select=data&start=eq.${a.fsStart}`)

  const vorher = await lesen()
  const bestand = zeilenVon(vorher)[0]?.data
  let anlage
  if (vorher.status >= 400) {
    anlage = { ok: false, grund: `die Treffpunkt-Woche ${a.fsStart} ist nicht lesbar (HTTP ${vorher.status})` }
  } else if (Array.isArray(bestand) && bestand.some((i) => !String(i?.id ?? '').startsWith('PROBE-'))) {
    anlage = { ok: false, grund: `in der Woche ${a.fsStart} stehen Treffpunkte, die nicht von der Probe sind — nicht überschrieben` }
  } else {
    merker.treffpunktWoche = true
    const s = await upsert(planer, a.treffpunkte)
    const l = await lesen()
    const da = zeilenVon(l)[0]?.data ?? []
    anlage =
      s.status < 400 && da.length === a.treffpunkte.length
        ? { ok: true }
        : { ok: false, grund: `Anlage als Admin scheiterte (fs_weeks, HTTP ${s.status}/${l.status})` }
  }

  for (const v of a.fsVersuche) {
    if (!anlage.ok) {
      k.kaputt(v.nr, v.was, anlage.grund, v.erwartet)
      continue
    }
    if (v.wer === 'mitglied' && mitgliedLeitet) {
      k.ungemessen(v.nr, v.was, 'das Mitglied leitet selbst eine Gruppe')
      continue
    }
    await aenderVersuch(k, {
      nr: v.nr,
      was: v.was,
      schreiben: () => upsert(konten[v.wer], v.data),
      nachsehen: async () => {
        const r = await lesen()
        const t = (zeilenVon(r)[0]?.data ?? []).find((i) => i?.id === v.ziel)
        return { status: r.status, angekommen: t?.[v.feld] === v.wert, fehlt: r.status < 400 && !t ? 'der Treffpunkt ist weg' : null }
      },
      zurueck: () => planer.rest(zeile, 'PATCH', { data: a.treffpunkte }, 'return=minimal'),
      erwartet: v.erwartet,
      folge: v.folge,
    })
  }
}

/** (50)–(52) Der Grundplan: Regeln legen Admin und Planer an — der Gruppenaufseher nur für seine Gruppe. */
async function grundplanProben(k, a) {
  const { zuteiler, aufseher } = k
  const r = a.regeln
  await schreibVersuch(k, 50, 'Planer: eine Regel im Grundplan anlegen', 'fs_rules', r.planer, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann den Grundplan nicht pflegen'], { wer: zuteiler, prefer: UPSERT })
  await schreibVersuch(k, 51, 'Gruppenaufseher: eine Regel für eine fremde Gruppe anlegen', 'fs_rules', r.aufseherFremd, false, ['AUCH DAS!', 'abgewiesen — nur für die eigene Gruppe'], { wer: aufseher, prefer: UPSERT })
  await schreibVersuch(k, 52, 'Gruppenaufseher: eine Regel für die eigene Gruppe anlegen', 'fs_rules', r.aufseherEigen, true, ['der Weg steht offen', 'ZU STRENG — der Gruppenaufseher kann seinen Grundplan nicht pflegen'], { wer: aufseher, prefer: UPSERT })
}

/**
 * (53)–(55) Gruppenbesuche: Seit dem 15.10.2026 plant der Planer sie ganz —
 * verschieben, den Besucher wechseln, anlegen. Bis dahin wechselte er nur den
 * Besucher (`gruppenbesuche_pruefen`, fort).
 */
async function besuchProben(k, a) {
  const { planer, zuteiler } = k
  const anlage = await anlegen(planer, 'gruppenbesuche', [a.besuch])
  const v = a.besuchVersuche
  const versuche = [
    [53, 'Planer: einen Gruppenbesuch in eine andere Woche verschieben', v.verschoben, 'woche', true, ['der Weg steht offen', 'ZU STRENG — der Planer kann Besuche nicht verschieben']],
    [54, 'Planer: den Besucher eines Gruppenbesuchs wechseln', v.besucher, 'person_id', true, ['der Weg steht offen', 'ZU STRENG — der Planer kann den Besucher nicht wechseln']],
  ]
  for (const [nr, was, zeile, feld, erwartet, folge] of versuche) {
    if (!anlage.ok) {
      k.kaputt(nr, was, anlage.grund, erwartet)
      continue
    }
    await aenderVersuch(k, {
      nr,
      was,
      schreiben: () => zuteiler.rest('gruppenbesuche', 'POST', zeile, UPSERT),
      nachsehen: async () => {
        const r = await planer.rest(`gruppenbesuche?select=woche,person_id&id=eq.${a.besuch.id}`)
        const b = zeilenVon(r)[0]
        return { status: r.status, angekommen: b?.[feld] === zeile[feld], fehlt: r.status < 400 && !b ? 'der Besuch ist weg' : null }
      },
      zurueck: () => planer.rest(`gruppenbesuche?id=eq.${a.besuch.id}`, 'PATCH', { woche: a.besuch.woche, person_id: a.besuch.person_id }, 'return=minimal'),
      erwartet,
      folge,
    })
  }
  await schreibVersuch(k, 55, 'Planer: einen Gruppenbesuch anlegen', 'gruppenbesuche', v.neu, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann keine Besuche anlegen'], { wer: zuteiler, prefer: UPSERT })
}

/** (58)–(60) Weitere Pläne: Der Planer sieht den Entwurf, besetzt und legt an — wie der Admin. */
async function besetzenProben(k, a) {
  const { planer, zuteiler } = k
  const plan = await anlegen(planer, 'plaene', [a.plan])
  const anlage = plan.ok ? await anlegen(planer, 'plan_eintraege', [a.planEintrag]) : plan
  await leseVersuch(k, 58, 'Planer: einen Plan im Entwurf sehen', anlage, () => planSicht(zuteiler, a.plan, [a.planEintrag], true), true, [
    'er plant ihn, bevor er veröffentlicht wird',
    'ZU STRENG — der Planer sieht den Entwurf nicht',
  ])
  const was59 = 'Planer: eine Woche eines Plans besetzen'
  if (anlage.ok) {
    await schreibVersuch(k, 59, was59, 'plan_eintraege', a.eintragVersuch, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann keine Gruppen verteilen'], { wer: zuteiler, prefer: UPSERT })
  } else k.kaputt(59, was59, anlage.grund, true)
  await schreibVersuch(k, 60, 'Planer: einen Plan anlegen', 'plaene', a.planVersuch, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann keine Pläne anlegen'], { wer: zuteiler, prefer: UPSERT })
}

/** (61) Die Absage eines Mitglieds geht an alle, die zuteilen — seit dem 4.10.2026 auch an den Planer. */
async function absageProbe(k, a) {
  const { mitglied, zuteiler } = k
  const s = await mitglied.rest('rpc/notify_planners', 'POST', { kind: 'verhindert', subject: a.absage, message: '' }, 'return=minimal')
  const l = await zuteiler.rest(`notifications?select=id&title=eq.${encodeURIComponent(a.absage)}`)
  const e = bewerteVersuch(s.status, zeilenVon(l).length > 0, true, { leseStatus: l.status })
  k.ergebnis(61, 'Planer: die Absage eines Mitglieds bekommen (notify_planners)', e, e.durch ? 'kommt an' : 'ZU STRENG — Absagen erreichen den Planer nicht')
}

/**
 * (65)–(70) Vorgemerkte Vorträge (T122): Die Namen auswärtiger Redner sieht und
 * schreibt nur, wer zuteilt — Admin und Planer (`vortraege_zuteilen`). Der
 * Planer schreibt wie die App per Upsert (`loeschenDannSchreiben` in `data.ts`).
 */
async function vortragProben(k, a) {
  const { planer, mitglied, zuteiler, aufseher } = k
  const anlage = await anlegen(planer, 'vortraege', [a.vortrag])
  const sicht = (wer) => zeileSicht(wer, 'vortraege', a.vortrag.id)
  const v = a.versuche
  await leseVersuch(k, 65, 'Mitglied: einen vorgemerkten Vortrag sehen', anlage, sicht(mitglied), false, [
    'AUCH DAS!',
    'unsichtbar — Namen auswärtiger Redner sieht nur, wer zuteilt',
  ])
  await leseVersuch(k, 66, 'Gruppenaufseher: einen vorgemerkten Vortrag sehen', anlage, sicht(aufseher), false, [
    'AUCH DAS!',
    'unsichtbar — der Gruppenaufseher teilt nicht zu',
  ])
  await schreibVersuch(k, 67, 'Mitglied: einen Vortrag vormerken', 'vortraege', v.mitglied, false, ['AUCH DAS!', 'abgewiesen — vormerken nur Admin und Planer'], { wer: mitglied, prefer: UPSERT })
  await schreibVersuch(k, 68, 'Gruppenaufseher: einen Vortrag vormerken', 'vortraege', v.aufseher, false, ['AUCH DAS!', 'abgewiesen — vormerken nur Admin und Planer'], { wer: aufseher, prefer: UPSERT })
  await leseVersuch(k, 69, 'Planer: einen vorgemerkten Vortrag sehen', anlage, sicht(zuteiler), true, [
    'er übernimmt den Vortragsplan',
    'ZU STRENG — der Planer sieht die Vormerkungen nicht',
  ])
  await schreibVersuch(k, 70, 'Planer: einen Vortrag vormerken (Upsert wie die App)', 'vortraege', v.planer, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann den Vortragsplan nicht übernehmen'], { wer: zuteiler, prefer: UPSERT })
}

/**
 * (82)–(85) Alte Abwesenheiten (17.10.2026, `absences_select`): Über acht Wochen
 * zurück sieht eine Abwesenheit nur, wer zuteilt — für die Auswertung über das
 * Jahr — und wem sie gehört. Der Grund steht noch darin, solange das Aufräumen
 * ihn nicht geleert hat; ein Mitglied sähe sonst, warum ein anderer fehlte.
 * Weg kommen beide mit den übrigen Zeilen der Stufen (`stufenAufraeumen`, am
 * Kennzeichen im Grund).
 */
async function abwesenheitProben(k, a) {
  const { planer, mitglied, zuteiler, aufseher } = k
  const anlage = await anlegen(planer, 'absences', [a.fremde, a.eigene])
  const sicht = (wer, zeile) => zeileSicht(wer, 'absences', zeile.id)
  await leseVersuch(k, 82, 'Mitglied: eine fremde Abwesenheit, neun Wochen vorbei', anlage, sicht(mitglied, a.fremde), false, [
    'AUCH DAS!',
    'unsichtbar — alte Abwesenheiten sieht nur, wer zuteilt',
  ])
  await leseVersuch(k, 83, 'Gruppenaufseher: dieselbe Abwesenheit', anlage, sicht(aufseher, a.fremde), false, [
    'AUCH DAS!',
    'unsichtbar — der Gruppenaufseher teilt nicht zu',
  ])
  await leseVersuch(k, 84, 'Planer: dieselbe Abwesenheit', anlage, sicht(zuteiler, a.fremde), true, [
    'er sieht sie für die Auswertung über das Jahr',
    'ZU STRENG — die Auswertung des Planers verlöre die alten Abwesenheiten',
  ])
  await leseVersuch(k, 85, 'Mitglied: die eigene Abwesenheit, neun Wochen vorbei', anlage, sicht(mitglied, a.eigene), true, [
    'die eigene bleibt sichtbar',
    'ZU STRENG — das Mitglied sieht seine eigene Abwesenheit nicht mehr',
  ])
  // Die Gründe beider tragen das Kennzeichen — gefragt wird, wem
  // `abwesenheit_gruende` welchen davon liefert.
  const grund = (wer, zeile) => async () => {
    const r = await wer.rest('rpc/abwesenheit_gruende', 'POST', {})
    return { status: r.status, sichtbar: zeilenVon(r).some((g) => g.id === zeile.id) }
  }
  await leseVersuch(k, 90, 'Planer: den Grund einer fremden Abwesenheit', anlage, grund(zuteiler, a.fremde), false, [
    'AUCH DAS!',
    'unsichtbar — für die Planung zählt nur der Zeitraum',
  ])
  await leseVersuch(k, 91, 'Mitglied: den Grund der eigenen Abwesenheit', anlage, grund(mitglied, a.eigene), true, [
    'der eigene bleibt sichtbar',
    'ZU STRENG — das Mitglied sieht seinen eigenen Grund nicht mehr',
  ])
  await leseVersuch(k, 92, 'Admin: den Grund der Abwesenheit des Mitglieds', anlage, grund(planer, a.eigene), true, [
    'der Admin sieht ihn im Personen-Detail',
    'ZU STRENG — der Admin sieht die Gründe nicht mehr',
  ])
}

/**
 * (86)–(89) Adresse und Grund (Sicherheits-Review 29.10.2026): Die Spalten
 * `persons.mail` und `absences.reason` liest die Versammlung nicht mehr über
 * die Tabelle — ein Mitglied, das sie dort verlangt, bekommt 403 statt der
 * Daten. Die Adressen liefert `personen_mails` allein dem Admin; ob ein
 * Mitglied dort leer ausgeht, sagt nur etwas, wenn der Admin etwas bekommt.
 */
async function spaltenProben(k) {
  const { planer, mitglied } = k
  const spalte = async (nr, was, pfad) => {
    const r = await mitglied.rest(pfad)
    const e = bewerteVersuch(r.status, r.status < 400, false, { woerter: ['GELESEN', 'abgewiesen'] })
    k.ergebnis(nr, was, e, e.durch ? 'AUCH DAS!' : 'die Spalte ist gesperrt')
  }
  await spalte(86, 'Mitglied: die E-Mail-Adressen über die Tabelle', 'persons?select=id,mail&limit=1')
  await spalte(87, 'Mitglied: die Gründe der Abwesenheiten über die Tabelle', 'absences?select=id,reason&limit=1')

  const mails = (wer) => wer.rest('rpc/personen_mails', 'POST', {})
  const beimAdmin = await mails(planer)
  if (beimAdmin.status >= 400) {
    for (const [nr, was] of [[88, 'Admin: die Adressen über personen_mails'], [89, 'Mitglied: die Adressen über personen_mails']]) {
      k.kaputt(nr, was, `der Admin bekam keine Antwort (HTTP ${beimAdmin.status})`, nr === 88)
    }
    return
  }
  if (zeilenVon(beimAdmin).length === 0) {
    for (const nr of [88, 89]) k.ungemessen(nr, 'Adressen über personen_mails', 'keine Person der Versammlung hat eine Adresse')
    return
  }
  k.ergebnis(88, 'Admin: die Adressen über personen_mails', bewerteSicht(beimAdmin.status, true, true), 'er lädt ein und verschickt die Links')
  const beimMitglied = await mails(mitglied)
  const e = bewerteSicht(beimMitglied.status, zeilenVon(beimMitglied).length > 0, false)
  k.ergebnis(89, 'Mitglied: die Adressen über personen_mails', e, e.durch ? 'AUCH DAS!' : 'leer — nur der Admin bekommt sie')
}

/**
 * Alles wieder weg, was die Probe für die Rechte-Stufen angelegt hat — über das
 * Kennzeichen, wie bei T120; die Treffpunkt-Woche nur, wenn sie der Probe
 * gehört. Dazu die Mitteilungen mit dem Kennzeichen beim Planer und beim
 * Admin: auch die aus (6), denn die Absage an die Planer erreicht seit dem
 * 4.10.2026 beide.
 */
async function stufenAufraeumen(k, fsStart, merker, neueWoche) {
  const { planer, zuteiler, marke, versammlung } = k
  const weg = (tabelle) => () => planer.rest(`${tabelle}?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')
  const mitteilungen = (wer) => () => wer.rest(`notifications?title=like.${marke}*`, 'DELETE', undefined, 'return=minimal')
  await nacheinanderAufraeumen(marke, [
    ['die Plan-Einträge', weg('plan_eintraege')],
    ['die Pläne', weg('plaene')],
    ['die Gruppenbesuche', weg('gruppenbesuche')],
    ['die Regeln des Grundplans', weg('fs_rules')],
    ['die Vormerkungen der Vorträge', weg('vortraege')],
    // `absences.id` ist eine echte uuid, das Kennzeichen steht im Grund (82–85)
    // — und den liest seit dem 29.10.2026 niemand mehr über die Tabelle, auch
    // nicht als Filter. Also über die Kennungen, die die Probe vergab.
    ...(merker.abwesenheiten.length
      ? [['die alten Abwesenheiten', () => planer.rest(`absences?id=in.(${merker.abwesenheiten.join(',')})`, 'DELETE', undefined, 'return=minimal')]]
      : []),
    ...(merker.treffpunktWoche
      ? [['die Treffpunkt-Woche', () => planer.rest(`fs_weeks?congregation_id=eq.${versammlung}&start=eq.${fsStart}`, 'DELETE', undefined, 'return=minimal')]]
      : []),
    ...(merker.woche
      ? [['die Woche des Planers', () => planer.rest(`weeks?congregation_id=eq.${versammlung}&start=eq.${neueWoche}`, 'DELETE', undefined, 'return=minimal')]]
      : []),
    ['die Mitteilungen an den Planer', mitteilungen(zuteiler)],
    ['die Mitteilungen an den Admin', mitteilungen(planer)],
  ])
}

/**
 * (40) Eine Woche anlegen, wie der Import es tut: Seit dem 15.10.2026 holt der
 * Planer das Programm selbst. Angelegt wird hinter allem anderen der Probe —
 * steht dort schon eine Woche, wird nichts überschrieben und nichts gemessen.
 * `merker.woche` sagt dem Aufräumen, ob die Woche der Probe gehört.
 */
async function neueWocheVersuch(k, neu) {
  const { planer, zuteiler, versammlung } = k
  const was = 'Planer: eine Woche anlegen, wie der Import'
  const zeile = `weeks?congregation_id=eq.${versammlung}&start=eq.${neu.woche.start}`
  const vorher = await planer.rest(`weeks?select=start&start=eq.${neu.woche.start}`)
  if (vorher.status >= 400 || zeilenVon(vorher).length > 0) {
    k.kaputt(40, was, vorher.status >= 400 ? `die Woche ist nicht lesbar (HTTP ${vorher.status})` : `in der Woche ${neu.woche.start} steht schon eine — nicht überschrieben`, true)
    return
  }
  neu.merker.woche = true
  const s = await zuteiler.rest('weeks', 'POST', neu.woche, 'return=minimal')
  const l = await planer.rest(`weeks?select=start&start=eq.${neu.woche.start}`)
  const e = bewerteVersuch(s.status, zeilenVon(l).length > 0, true, { leseStatus: l.status })
  k.ergebnis(40, was, e, e.durch ? 'der Weg steht offen' : 'ZU STRENG — der Planer kann kein Programm holen')
  await k.aufraeumen(e, () => planer.rest(zeile, 'DELETE', undefined, 'return=minimal'))
}

/**
 * (80) und (81) Was beim Admin bleibt (15.10.2026): Der Planer plant alles,
 * Personen und Einstellungen aber nicht. Kommt einer durch, räumt der Admin die
 * Person weg und stellt den Namen der Versammlung zurück.
 */
async function verwaltungProben(k, neu) {
  const { planer, zuteiler, versammlung, marke } = k
  await schreibVersuch(k, 80, 'Planer: eine Person anlegen', 'persons', neu.person, false, ['AUCH DAS!', 'abgewiesen — Personen pflegt der Admin'], { wer: zuteiler })
  const was = 'Planer: den Namen der Versammlung ändern'
  const zeile = `congregations?id=eq.${versammlung}`
  const vorher = await planer.rest(`congregations?select=name&id=eq.${versammlung}`)
  const name = zeilenVon(vorher)[0]?.name
  if (typeof name !== 'string') {
    k.kaputt(81, was, `der Name ist nicht lesbar (HTTP ${vorher.status})`, false)
    return
  }
  await aenderVersuch(k, {
    nr: 81,
    was,
    schreiben: () => zuteiler.rest(zeile, 'PATCH', { name: `${name} ${marke}` }, 'return=minimal'),
    nachsehen: async () => {
      const r = await planer.rest(`congregations?select=name&id=eq.${versammlung}`)
      const n = zeilenVon(r)[0]?.name
      return { status: r.status, angekommen: String(n ?? '').includes(marke), fehlt: r.status < 400 && n === undefined ? 'die Versammlung ist weg' : null }
    },
    zurueck: () => planer.rest(zeile, 'PATCH', { name }, 'return=minimal'),
    erwartet: false,
    folge: ['AUCH DAS!', 'Einstellungen ändert der Admin'],
  })
}

/**
 * Die Fälle (35)–(70) und (80)–(85) — siehe Kopf. Aufgeräumt wird in jedem
 * Fall, auch wenn ein Fall mittendrin wirft.
 */
async function stufenProben(k, woche) {
  const { planer, mitglied, zuteiler, aufseher, versammlung, marke } = k
  console.log('\nDie Rechte-Stufen (seit 4.10.2026; angelegt als Admin, im Jahr 2099):')
  const merker = { treffpunktWoche: false, woche: false, abwesenheiten: [] }
  const tag0 = ersterMontagAb('2099-01-01')
  const verwaltung = verwaltungAnlage({ marke, versammlung, tag0, personId: crypto.randomUUID() })
  let fsStart = null
  try {
    // Ins Leere: Eine Woche im Jahr 2100 gibt es nicht — eine offene Tür
    // antwortete mit „keine Woche", statt etwas zu senden.
    const leer = ersterMontagAb('2100-01-01')
    await tuerVersuch(k, 36, 'Mitglied: „Plan senden"', mitglied, 'send-plan', { action: 'plan', weekStart: leer }, ['no-week'], 'senden nur Admin, Planer und Gruppenaufseher')

    await wochenProben(k, woche, { woche: verwaltung.woche, merker })
    await verwaltungProben(k, verwaltung)
    // Vor der Prüfung auf Personen und Gruppen: Die Vormerkungen brauchen keine.
    await vortragProben(k, vortragAnlage({ marke, versammlung, tag0 }))
    // Die alten Abwesenheiten brauchen eine eigene Person je Konto: Teilten
    // Mitglied oder Gruppenaufseher die des Admins, wäre die „fremde"
    // Abwesenheit für sie die eigene — (82) und (83) meldeten ein Loch, das
    // keines ist.
    if (planer.pid && mitglied.pid && mitglied.pid !== planer.pid && aufseher.pid !== planer.pid) {
      const heute = new Date().toISOString().slice(0, 10)
      const ids = [crypto.randomUUID(), crypto.randomUUID()]
      merker.abwesenheiten = ids
      await abwesenheitProben(k, abwesenheitAnlage({ marke, versammlung, heute, admin: planer, mitglied, ids }))
    } else {
      for (const nr of [82, 83, 84, 85, 90, 91, 92]) k.ungemessen(nr, 'alte Abwesenheit sehen', 'Admin, Mitglied und Gruppenaufseher brauchen je eine eigene Person')
    }
    await spaltenProben(k)

    const g = await planer.rest('groups?select=id,overseer_id,assistant_id&order=position')
    const wahl = gruppenWahl(zeilenVon(g), { aufseherPid: aufseher.pid, zuteilerPid: zuteiler.pid, mitgliedPid: mitglied.pid })
    const ohneGruppe = g.status >= 400
      ? `die Gruppen sind nicht lesbar (HTTP ${g.status})`
      : !wahl.eigene
        ? 'der Gruppenaufseher leitet keine Gruppe'
        : null
    const fehlt = !planer.pid || !zuteiler.pid || !mitglied.pid
      ? 'Admin, Planer und Mitglied brauchen je eine Person'
      : (ohneGruppe ?? (!wahl.fremde ? 'keine Gruppe, die keines der Probekonten leitet' : null))
    if (fehlt) {
      k.ungemessen('42–61', 'Treffpunkte, Grundplan, Gruppenbesuche und Pläne der Stufen', fehlt)
      return
    }
    const a = stufenAnlage({
      marke,
      versammlung,
      tag0,
      adminPid: planer.pid,
      zuteilerPid: zuteiler.pid,
      eigeneGruppe: wahl.eigene,
      fremdeGruppe: wahl.fremde,
    })
    fsStart = a.fsStart
    await treffpunktProben(k, a, { zuteiler, aufseher, mitglied }, wahl.mitgliedLeitet, merker)
    await grundplanProben(k, a)
    await besuchProben(k, a)
    await besetzenProben(k, a)
    await absageProbe(k, a)
  } finally {
    await stufenAufraeumen(k, fsStart, merker, verwaltung.woche.start)
  }
}

/* ===================== Trolleys: die Fälle 71–79 ========================== */

/**
 * **Was die Probe für die Trolleys anlegt** (T121, Phase 7) — und was die
 * Konten daran versuchen. Rein, damit der Test prüfen kann, dass jeder Versuch
 * die Regeln erfüllt, die mit den Rechten nichts zu tun haben: eine Zeit aus
 * dem Raster (`zeitraumGueltig`, `trolley_termine_zeit`), ein Trolley, den es
 * gibt, niemand doppelt. Sonst wiese der Trigger ab (`trolley_belegt`,
 * `trolley_doppelt`, ein 400) oder die Function (`belegt`, `doppelt`, `weg`)
 * — das sähe aus wie eine Abweisung und wäre doch keine über die Rechte.
 *
 * Jeder Termin liegt an einem eigenen Tag: Kommt einer unerwartet durch,
 * belegt er weder den Trolley noch das Mitglied für den nächsten. Und jeder
 * ist allein, mit „Partner gesucht" — so geht keine Mitteilung hinaus.
 *
 * @param {{ marke: string, versammlung: string, tag0: string, mitgliedPid: string }} auftrag
 */
export function trolleyAnlage({ marke, versammlung: c, tag0, mitgliedPid }) {
  const id = (name) => `${marke}-${name}`
  const trolley = (name) => ({ id: id(name), congregation_id: c, name: marke, ort: marke, hinweis: '' })
  const anlage = trolley('trolley')
  // Ein Termin, wie die App ihn der Function schickt (`trolleyEintragen`).
  const termin = (name, tage) => ({ id: id(name), trolleyId: anlage.id, datum: tagPlus(tag0, tage), von: '10:00', bis: '11:30', partner: null })
  const direkt = termin('termin-direkt', 0)
  return {
    trolley: anlage,
    versuche: { mitglied: trolley('trolley-mitglied'), planer: trolley('trolley-planer') },
    // (71): die Zeile, die die Function für das Mitglied schriebe — nur an ihr vorbei.
    direkt: {
      id: direkt.id, congregation_id: c, trolley_id: direkt.trolleyId, datum: direkt.datum, von: direkt.von, bis: direkt.bis,
      person_id: mitgliedPid, partner_id: null, gemeinsam: false,
    },
    ohneRecht: termin('termin-ohne-recht', 1),
    eigener: termin('termin-eigen', 2),
  }
}

/**
 * Das Trolley-Recht des Mitglieds (`priv.zeugnis`) setzen oder nehmen — und
 * nachsehen, ob es so dasteht. Den vorigen Stand stellt `trolleyAufraeumen`
 * wieder her.
 */
function trolleyRecht(k, privVorher) {
  const { planer, mitglied } = k
  return async (wert) => {
    const s = await planer.rest(`persons?id=eq.${mitglied.pid}`, 'PATCH', { priv: { ...privVorher, zeugnis: wert } }, 'return=minimal')
    const l = await planer.rest(`persons?select=priv&id=eq.${mitglied.pid}`)
    return s.status < 400 && Boolean(zeilenVon(l)[0]?.priv?.zeugnis) === wert
      ? { ok: true }
      : { ok: false, grund: `Trolley-Recht nicht ${wert ? 'gesetzt' : 'genommen'} (HTTP ${s.status}/${l.status})` }
  }
}

/**
 * Ein Versuch an einer Edge Function, die etwas bewirkt — die Trolleys und das
 * Tauschen. Anders als die Türen aus (35) und (36) zielt er nicht ins Leere:
 * Was er trifft, gibt es (2099, mit Kennzeichen), und ob etwas geschah, steht
 * danach in den Tabellen — `nachsehen` liefert `{ status, geschehen }`, dazu
 * `detail`, was im Einzelnen dastand. Ein Urteil ist neben dem Erfolg allein
 * eine Abweisung aus `urteile`: Jede andere hieße, der Versuch traf eine
 * andere Regel als die, die er messen soll.
 *
 * Gemessen wird nur, wenn die Voraussetzung steht (`voraus`, wie die Anlage
 * bei `leseVersuch`). Kam ein verbotener Versuch durch, nimmt ihn `zurueck`
 * wieder heraus. Zurück kommen das Ergebnis und die Antwort der Function.
 */
async function funktionsVersuch(k, { funktion, urteile, nr, was, voraus, wer, rumpf, nachsehen, woerter, erwartet, folge, zurueck, zurueckWoerter }) {
  if (!voraus.ok) return k.kaputt(nr, was, voraus.grund, erwartet)
  const a = await wer.funktion(funktion, rumpf)
  const l = await nachsehen()
  const fehler = a.daten?.error
  const e = bewerteVersuch(a.status, l.geschehen, erwartet, { leseStatus: l.status, urteil: a.status < 400 || urteile.includes(fehler), woerter })
  k.ergebnis(nr, was, e, e.durch ? folge[0] : `${folge[1]} (${fehler ?? '—'})`)
  if (e.kaputt || e.durch !== erwartet) {
    console.log(`      Die Function antwortete: ${JSON.stringify(a.daten)}`)
    if (l.detail) console.log(`      Nachgesehen: ${l.detail}`)
  }
  if (zurueck) await k.aufraeumen(e, zurueck, zurueckWoerter)
  return { ...e, antwort: a }
}

/** Die Abweisungen der Function `trolley`, die ein Urteil über das Recht sind — beide mit 403. */
const TROLLEY_RECHT = ['kein-recht', 'forbidden']

/**
 * Ein Versuch an der Function `trolley` — (74), (75), (77)–(79). Trolley und
 * Termin gibt es, nachgesehen wird beim Admin. Ein Urteil ist neben dem Erfolg
 * allein die Abweisung über das Recht (`TROLLEY_RECHT`): `belegt` oder `weg`
 * hießen, der Versuch traf eine andere Regel, `no-person` (ebenfalls 403), dass
 * dem Konto die Person fehlt.
 */
const trolleyVersuch = (k, versuch) =>
  funktionsVersuch(k, { funktion: 'trolley', urteile: TROLLEY_RECHT, zurueckWoerter: ['wieder ausgetragen', 'vorsorglich ausgetragen'], ...versuch })

/**
 * (71)–(73) An der Function vorbei: Termine schreibt niemand direkt, Trolleys
 * nur der Admin. (71) schreibt mit dem Trolley-Recht (`mit`) — ohne wiese schon
 * der Trigger ab (`trolley_ohne_recht`, ein 400), bevor die Richtlinie gefragt
 * ist. (72) und (73) schreiben wie die App per Upsert (`saveTrolleys`).
 */
async function trolleyTabellenProben(k, a, mit) {
  const { mitglied, zuteiler } = k
  const was71 = 'Mitglied: einen Trolley-Termin an der Function vorbei schreiben'
  if (mit.ok) {
    await schreibVersuch(k, 71, was71, 'trolley_termine', a.direkt, false, ['AUCH DAS!', 'abgewiesen — Termine schreibt nur die Function'], {
      // Direkt löschen darf ihn niemand; angekommen, trägt die Function ihn wieder aus.
      loeschen: () => mitglied.funktion('trolley', { aktion: 'austragen', id: a.direkt.id }),
    })
  } else k.kaputt(71, was71, mit.grund, false)
  const nurAdmin = ['AUCH DAS!', 'abgewiesen — Trolleys pflegt der Admin']
  await schreibVersuch(k, 72, 'Mitglied: einen Trolley anlegen', 'trolleys', a.versuche.mitglied, false, nurAdmin, { prefer: UPSERT })
  await schreibVersuch(k, 73, 'Planer: einen Trolley anlegen', 'trolleys', a.versuche.planer, false, nurAdmin, { wer: zuteiler, prefer: UPSERT })
}

/** Was ein Versuch an der Function bewirkt hat — oder nicht. */
const EINGETRAGEN = ['EINGETRAGEN', 'nicht eingetragen']
const AUSGETRAGEN = ['AUSGETRAGEN', 'nicht ausgetragen']

/**
 * (74)–(79) Über die Function `trolley`, wie die App (`lib/trolley.ts`) — nur
 * ohne `heute`: Dann gilt der Tag des Servers, und 2099 ist nicht vorbei.
 * Eintragen nur mit dem Trolley-Recht, austragen nur, wer im Termin steht,
 * einen Trolley entfernen nur der Admin. `recht` setzt und nimmt das Recht des
 * Mitglieds; (76)–(78) brauchen den Termin, den (75) einträgt.
 */
async function trolleyFunktionProben(k, a, anlage, recht) {
  const { planer, mitglied, zuteiler, aufseher } = k
  /** Steht der Termin da? Der Admin sieht jeden der Versammlung. */
  const terminDa = async (id) => {
    const r = await planer.rest(`trolley_termine?select=id&id=eq.${id}`)
    return { status: r.status, da: zeilenVon(r).length > 0 }
  }
  const eingetragen = (id) => async () => {
    const t = await terminDa(id)
    return { status: t.status, geschehen: t.da }
  }
  const ausgetragen = (id) => async () => {
    const t = await terminDa(id)
    return { status: t.status, geschehen: !t.da }
  }
  const austragen = (id) => ({ aktion: 'austragen', id })

  const ohne = anlage.ok ? await recht(false) : anlage
  await trolleyVersuch(k, {
    nr: 74, was: 'Mitglied ohne Trolley-Recht: sich über die Function eintragen', voraus: ohne,
    wer: mitglied, rumpf: { aktion: 'eintragen', termin: a.ohneRecht }, nachsehen: eingetragen(a.ohneRecht.id), woerter: EINGETRAGEN,
    erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — eintragen nur mit dem Trolley-Recht'],
    zurueck: () => mitglied.funktion('trolley', austragen(a.ohneRecht.id)),
  })
  const mit = anlage.ok ? await recht(true) : anlage
  const e75 = await trolleyVersuch(k, {
    nr: 75, was: 'Mitglied mit Trolley-Recht: sich über die Function eintragen (allein, „Partner gesucht")', voraus: mit,
    wer: mitglied, rumpf: { aktion: 'eintragen', termin: a.eigener }, nachsehen: eingetragen(a.eigener.id), woerter: EINGETRAGEN,
    erwartet: true, folge: ['der Weg steht offen', 'ZU STRENG — niemand kann sich mehr eintragen'],
  })

  const eigener = e75?.durch ? { ok: true } : { ok: false, grund: 'kein eigener Termin aus (75)' }
  const lesen = zeileSicht(mitglied, 'trolley_termine', a.eigener.id)
  await leseVersuch(k, 76, 'Mitglied: den eigenen Trolley-Termin sehen', eigener, lesen, true, [
    'er steht in der App',
    'ZU STRENG — das Mitglied sieht den eigenen Termin nicht',
  ])
  await trolleyVersuch(k, {
    nr: 77, was: 'Gruppenaufseher: den Termin des Mitglieds über die Function austragen', voraus: eigener,
    wer: aufseher, rumpf: austragen(a.eigener.id), nachsehen: ausgetragen(a.eigener.id), woerter: AUSGETRAGEN,
    erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — austragen nur, wer im Termin steht'],
  })
  await trolleyVersuch(k, {
    nr: 78, was: 'Mitglied: sich über die Function wieder austragen', voraus: eigener,
    wer: mitglied, rumpf: austragen(a.eigener.id), nachsehen: ausgetragen(a.eigener.id), woerter: AUSGETRAGEN,
    erwartet: true, folge: ['der Weg steht offen', 'ZU STRENG — niemand kann sich mehr austragen'],
  })
  await trolleyVersuch(k, {
    nr: 79, was: 'Planer: über die Function einen Trolley entfernen', voraus: anlage,
    wer: zuteiler, rumpf: { aktion: 'entfernen', trolleyId: a.trolley.id },
    nachsehen: async () => {
      const r = await planer.rest(`trolleys?select=id&id=eq.${a.trolley.id}`)
      return { status: r.status, geschehen: zeilenVon(r).length === 0 }
    },
    woerter: ['ENTFERNT', 'nicht entfernt'],
    erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — Trolleys entfernt nur der Admin'],
  })
}

/**
 * Alles wieder weg, was die Probe für die Trolleys angelegt hat: die Trolleys
 * mit dem Kennzeichen — ihre Termine gehen mit (`on delete cascade`); direkt
 * löschen dürfte sie niemand. Danach das Trolley-Recht des Mitglieds, wie es
 * vorher war.
 */
async function trolleyAufraeumen(k, privVorher) {
  const { planer, mitglied, marke } = k
  await nacheinanderAufraeumen(
    marke,
    [
      ['die Trolleys samt ihren Terminen', () => planer.rest(`trolleys?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')],
      ['das Trolley-Recht des Mitglieds', () => planer.rest(`persons?id=eq.${mitglied.pid}`, 'PATCH', { priv: privVorher }, 'return=minimal')],
    ],
    ', das Trolley-Recht des Mitglieds wie vorher',
  )
}

/**
 * Die Fälle (71)–(79) — siehe Kopf. Der Admin legt einen Trolley an; das
 * Trolley-Recht des Mitglieds setzt die Probe für (71) und (75) und nimmt es
 * für (74) — sonst hinge das Ergebnis daran, wie die Probeversammlung
 * zufällig eingerichtet ist, und eine der beiden Richtungen bliebe
 * ungemessen. Aufgeräumt wird in jedem Fall, auch wenn ein Fall mittendrin
 * wirft.
 */
async function trolleyProben(k) {
  const { planer, mitglied, zuteiler, aufseher, versammlung, marke } = k
  console.log('\nDie Trolleys (seit 14.10.2026; angelegt als Admin, im Jahr 2099):')
  // Die Function verlangt von jedem, der sie ruft, eine Person — und (77)
  // mäße nichts, wäre der Gruppenaufseher das Mitglied selbst.
  const personen = [mitglied.pid, zuteiler.pid, aufseher.pid]
  if (personen.some((pid) => !pid) || new Set(personen).size < personen.length) {
    k.ungemessen('71–79', 'die Trolleys', 'Mitglied, Planer und Gruppenaufseher brauchen je eine eigene Person')
    return
  }
  const person = await planer.rest(`persons?select=priv&id=eq.${mitglied.pid}`)
  const ich = zeilenVon(person)[0]
  if (!ich) {
    k.ungemessen('71–79', 'die Trolleys', `die Person des Mitglieds ist nicht lesbar (HTTP ${person.status})`)
    return
  }
  const a = trolleyAnlage({ marke, versammlung, tag0: ersterMontagAb('2099-01-01'), mitgliedPid: mitglied.pid })
  const privVorher = ich.priv ?? {}
  try {
    const anlage = await anlegen(planer, 'trolleys', [a.trolley])
    const recht = trolleyRecht(k, privVorher)
    await trolleyTabellenProben(k, a, anlage.ok ? await recht(true) : anlage)
    await trolleyFunktionProben(k, a, anlage, recht)
  } finally {
    await trolleyAufraeumen(k, privVorher)
  }
}

/* ===================== Tauschen: die Fälle 93–110 ========================= */

/**
 * Die Titel der Tausch-Mitteilungen, wie sie in der Glocke stehen — Spiegel von
 * `supabase/functions/tauschen/texte.ts` (`mitgliedsrechte-probe.test.ts` hält
 * beide aneinander). Erkannt wird eine Mitteilung an Schlüssel **und** Titel:
 * Auf demselben Platz steht meist schon die Nachricht von „Plan senden".
 */
export const TAUSCH_TITEL = { angefragt: 'Tausch angefragt', getauscht: 'Getauscht', abgelehnt: 'Tausch abgelehnt' }

/** Der Montag der Woche, in der ein Tag liegt. */
export const montagVon = (tag) => ersterMontagAb(tagPlus(tag, -6))

/**
 * Die Tage, an denen die Zusammenkunft für (97) liegen kann — eine, die schon
 * war, deren Plan aber hinausging. „Plan senden" nimmt nur, was noch ansteht,
 * und den Tag des Geräts glaubt der Server nur einen neben dem eigenen
 * (`heuteUtc`): Gesendet wird am Tag der Zusammenkunft, getauscht am Tag
 * danach — das geht nur für gestern und heute. Gestern zuerst: Dann ist der Tag
 * danach der wirkliche.
 */
export const vorbeiKandidaten = (heute) => [tagPlus(heute, -1), heute]

/**
 * **Was die Probe fürs Tauschen anlegt** (T153) — und welchen Platz jeder Fall
 * nennt. Rein, damit der Test jeden Versuch an die Regeln der Function halten
 * kann (`tauschen/regeln.ts`): Jeder trifft genau die Regel, die er messen
 * soll, und keine davor.
 *
 * Vier Wochen im Jahr 2099 (30 bis 33 Wochen nach `tag0`, hinter allem anderen
 * der Probe), jede mit dem Dienst `svc` an Platz 0:
 *
 *  - `abgeben`: am Wochenende das Mitglied — der Platz, den es abgibt (`a`);
 *  - `nehmen`: am Wochenende der Gruppenaufseher — den will es dafür (`b`);
 *  - `direkt`: unter der Woche das Mitglied, am Wochenende die Person ohne
 *    Konto — der Tausch ohne Anfrage, in einer einzigen Woche;
 *  - `ungesendet`: am Wochenende der Gruppenaufseher, ohne „Plan senden".
 *
 * Nennt `vorbei` einen Tag, kommt dessen Woche dazu: ihr Wochenende auf diesen
 * Tag verlegt, mit dem Mitglied — gesendet an diesem Tag, getauscht am Tag
 * danach. Jede Woche trägt das Kennzeichen als Zeitraum, die Person ohne Konto
 * im Vornamen. `anfrageVersuch` ist die Zeile, die (94) an der Function vorbei
 * schreibt — eine Anfrage wie die aus (100).
 *
 * @param {{
 *   marke: string, versammlung: string, tag0: string, svc: string, vorbei: string | null,
 *   mitglied: { id: string, uid: string, name: string }, aufseher: { id: string, name: string },
 *   ohneKontoId: string, anfrageId: string
 * }} auftrag
 */
export function tauschAnlage({ marke, versammlung: c, tag0, svc, vorbei, mitglied, aufseher, ohneKontoId, anfrageId }) {
  const ohneKonto = { id: ohneKontoId, name: `${marke} Tauschpartner` }
  const zusammenkunft = (p) => ({ date: '', end: '', sections: [], helpers: p ? { [svc]: [{ name: p.name, pid: p.id }] } : {} })
  const woche = (start, { mid, we }, dev) => ({
    congregation_id: c,
    start,
    data: { range: marke, book: '', start, mid: zusammenkunft(mid), we: zusammenkunft(we), ...(dev ? { dev } : {}) },
  })
  const montag = (wochen) => tagPlus(tag0, 7 * wochen)
  const wochen = {
    abgeben: woche(montag(30), { we: mitglied }),
    nehmen: woche(montag(31), { we: aufseher }),
    direkt: woche(montag(32), { mid: mitglied, we: ohneKonto }),
    ungesendet: woche(montag(33), { we: aufseher }),
    vorbei: vorbei ? woche(montagVon(vorbei), { we: mitglied }, { we: { wd: wochentag(vorbei) } }) : null,
  }
  const platz = (w, tab) => helferSchluessel(w.start, tab, svc, 0)
  const plaetze = {
    a: platz(wochen.abgeben, 'we'),
    b: platz(wochen.nehmen, 'we'),
    eigenMitte: platz(wochen.direkt, 'mid'),
    ohneKonto: platz(wochen.direkt, 'we'),
    ungesendet: platz(wochen.ungesendet, 'we'),
    vorbei: wochen.vorbei ? platz(wochen.vorbei, 'we') : null,
  }
  return {
    svc,
    wochen,
    plaetze,
    // Wer vorher wo steht — daran sieht die Probe, ob ein abgewiesener Tausch doch geschah.
    inhaber: { [plaetze.a]: mitglied.id, [plaetze.b]: aufseher.id, [plaetze.eigenMitte]: mitglied.id, [plaetze.ohneKonto]: ohneKonto.id },
    senden: [wochen.abgeben, wochen.nehmen, wochen.direkt, wochen.vorbei].filter((w) => w !== null),
    heuteVorbei: vorbei ? { senden: vorbei, tauschen: tagPlus(vorbei, 1) } : null,
    person: { id: ohneKonto.id, congregation_id: c, fn: marke, ln: 'Tauschpartner', priv: { [`svc:${svc}`]: true } },
    anfrageVersuch: {
      id: anfrageId, congregation_id: c, von_user: mitglied.uid, von_person: mitglied.id, an_person: aufseher.id,
      // Den Tag prüft die Tabelle nicht; der Sonntag der früheren Woche.
      gibt_ab: plaetze.a, nimmt: plaetze.b, bis: tagPlus(montag(30), 6),
    },
  }
}

/** Werte für einen `in.(…)`-Filter, jeder für sich kodiert — Aufgaben-Schlüssel tragen `|`. */
const liste = (werte) => `(${werte.map(encodeURIComponent).join(',')})`

/** Was ein Versuch am Tauschen bewirkt hat — oder nicht. */
const ANGEFRAGT = ['ANGEFRAGT', 'nicht angefragt']
const GETAUSCHT = ['GETAUSCHT', 'nicht getauscht']
const ZURUECKGEZOGEN = ['wieder zurückgezogen', 'vorsorglich zurückgezogen']

/**
 * Stehen auf den Plätzen die genannten Personen? `soll`: Schlüssel → Person.
 * Nachgesehen beim Admin, an den Wochen selbst; `anders` nennt die Plätze, auf
 * denen jemand anderes steht.
 */
async function plaetzeBeimAdmin(planer, soll) {
  const wochen = [...new Set(Object.keys(soll).map((key) => key.split('|')[0]))]
  const r = await planer.rest(`weeks?select=start,data&start=in.(${wochen.join(',')})`)
  const daten = new Map(zeilenVon(r).map((w) => [w.start, w.data]))
  const anders = Object.entries(soll)
    .filter(([key, pid]) => {
      const [woche, tab, , svc, pos] = key.split('|')
      return daten.get(woche)?.[tab]?.helpers?.[svc]?.[Number(pos)]?.pid !== pid
    })
    .map(([key]) => key)
  return { status: r.status, anders }
}

/**
 * Mehrere Dinge nachsehen, die zusammen ein Ergebnis sind — `[was, lesen,
 * gilt]`, etwa „die Anfrage fort, ihre Glocke fort, der Bescheid da". Ein
 * Lesen, das scheitert, zählt nicht als „fort": Sein Status macht das Ganze
 * unlesbar. Das Ergebnis passt zu `funktionsVersuch` (`geschehen`) wie zu
 * `leseVersuch` (`sichtbar`).
 */
async function zusammen(teile) {
  const gelesen = await Promise.all(
    teile.map(async ([was, lesen, gilt]) => {
      const r = await lesen()
      return { was, status: r.status, ok: r.status < 400 && gilt(zeilenVon(r)) }
    }),
  )
  const ok = gelesen.every((g) => g.ok)
  return {
    status: Math.max(...gelesen.map((g) => g.status)),
    geschehen: ok,
    sichtbar: ok,
    detail: gelesen.map((g) => `${g.was}: ${g.ok ? 'ja' : 'NEIN'}`).join(', '),
  }
}

/** Anfragen zurückziehen, wie die App — über die Function; direkt löschen darf sie niemand. */
async function anfragenZurueckziehen(mitglied, ids) {
  let status = 204
  for (const id of ids) status = Math.max(status, (await mitglied.funktion('tauschen', { aktion: 'zurueckziehen', id })).status)
  return { status }
}

/**
 * Die Anlage herstellen, als Admin: Mitglied und Gruppenaufseher für den Dienst
 * freischalten, die Person ohne Konto und die Wochen anlegen, „Plan senden"
 * für alle bis auf die eine. Was davon steht, sagt je eine Voraussetzung —
 * `alles` für die Fälle, die die ganze Anlage brauchen, `ungesendet` für (96),
 * `vorbei` für (97). `merker` sagt dem Aufräumen, was der Probe gehört.
 */
async function tauschVorbereiten(k, a, personen, merker, heute) {
  const { planer } = k
  const nein = (grund) => ({ ok: false, grund })
  const gescheitert = (grund) => ({ alles: nein(grund), ungesendet: nein(grund), vorbei: nein(grund) })

  for (const p of personen) {
    merker.priv.push(p)
    const s = await planer.rest(`persons?id=eq.${p.id}`, 'PATCH', { priv: { ...p.priv, [`svc:${a.svc}`]: true } }, 'return=minimal')
    if (s.status >= 400) return gescheitert(`Freischalten ${p.wer} für „${a.svc}" scheiterte (HTTP ${s.status})`)
  }
  merker.person = a.person.id
  const person = await anlegen(planer, 'persons', [a.person])
  if (!person.ok) return gescheitert(person.grund)

  // Als Upsert: Eine Woche, die ein abgebrochener Lauf hinterließ, wird überschrieben.
  const wochen = Object.values(a.wochen).filter(Boolean)
  merker.wochen = wochen.map((w) => w.start)
  const s = await planer.rest('weeks?on_conflict=congregation_id,start', 'POST', wochen, UPSERT)
  const l = await planer.rest(`weeks?select=start&start=in.(${merker.wochen.join(',')})`)
  if (s.status >= 400 || zeilenVon(l).length !== wochen.length) return gescheitert(`Anlage der Wochen scheiterte (HTTP ${s.status}/${l.status})`)

  // „Plan senden", wie der Admin in der App — die vergangene Woche am Tag ihrer Zusammenkunft.
  for (const w of a.senden) {
    const tag = w === a.wochen.vorbei ? a.heuteVorbei.senden : heute
    const r = await planer.funktion('send-plan', { action: 'plan', weekStart: w.start, heute: tag })
    if (r.status >= 400) console.log(`      „Plan senden" für ${w.start} scheiterte: ${JSON.stringify(r.daten)}`)
  }
  // Hinausgegangen ist, was im Versand-Tagebuch steht — daran misst die Function „gesendet".
  const log = await planer.rest(`assignment_log?select=task_key&task_key=in.${liste(Object.values(a.plaetze).filter(Boolean))}`)
  if (log.status >= 400) return gescheitert(`das Versand-Tagebuch ist nicht lesbar (HTTP ${log.status})`)
  const gesendet = new Set(zeilenVon(log).map((z) => z.task_key.split('|')[0]))
  const fehlt = [a.wochen.abgeben, a.wochen.nehmen, a.wochen.direkt].find((w) => !gesendet.has(w.start))
  const alles = fehlt ? nein(`der Plan der Woche ${fehlt.start} ging nicht hinaus`) : { ok: true }
  const { ungesendet: u, vorbei: v } = a.wochen
  return {
    alles,
    // Steht sie schon im Tagebuch, hinterließ es ein früherer Lauf — dann misst (96) nichts.
    ungesendet: !alles.ok ? alles : gesendet.has(u.start) ? nein(`die Woche ${u.start} steht schon im Versand-Tagebuch`) : { ok: true },
    vorbei: !alles.ok || !v ? alles : gesendet.has(v.start) ? { ok: true } : nein(`der Plan der Woche ${v.start} ging nicht hinaus`),
  }
}

/**
 * Die Versuche (94)–(110) an der Anlage — siehe Kopf. Erst die Abweisungen, an
 * den Wochen, wie sie angelegt sind; kam eine doch durch, stellt der Admin
 * zurück. Dann der Weg einer Anfrage: anfragen, sehen, ablehnen, zurückziehen,
 * annehmen — und zuletzt der Tausch ohne Anfrage.
 */
async function tauschVersuche(k, a, voraus, merker, heute) {
  const { planer, mitglied, zuteiler, aufseher, versammlung } = k
  const p = a.plaetze
  const tauschen = (versuch) => funktionsVersuch(k, { funktion: 'tauschen', urteile: [], ...versuch })

  /** Die Anfragen des Mitglieds zu einem Platz, den es abgibt — es sieht die eigenen. */
  const anfragenZu = async (gibtAb) => {
    const r = await mitglied.rest(`tausch_anfragen?select=id&gibt_ab=eq.${encodeURIComponent(gibtAb)}`)
    const ids = zeilenVon(r).map((z) => z.id)
    for (const id of ids) merker.anfragen.add(id)
    return { status: r.status, ids }
  }
  const angefragt = (gibtAb) => async () => {
    const r = await anfragenZu(gibtAb)
    return { status: r.status, geschehen: r.ids.length > 0 }
  }
  const zurueckziehen = (gibtAb) => async () => anfragenZurueckziehen(mitglied, (await anfragenZu(gibtAb)).ids)
  /** Hat ein abgewiesener Versuch doch getauscht? Jeder Platz zählt, auf dem nicht mehr steht, wer vorher dort stand. */
  const unveraendert = (...plaetze) => async () => {
    const n = await plaetzeBeimAdmin(planer, Object.fromEntries(plaetze.map((key) => [key, a.inhaber[key]])))
    return { status: n.status, geschehen: n.anders.length > 0, detail: `anders als vorher: ${n.anders.join(', ') || '—'}` }
  }
  /** Steht der Tausch — auf jedem Platz der neue Inhaber? */
  const getauscht = (soll) => async () => {
    const n = await plaetzeBeimAdmin(planer, soll)
    return { status: n.status, geschehen: n.anders.length === 0, detail: `noch nicht getauscht: ${n.anders.join(', ') || '—'}` }
  }
  /** Die Wochen wieder, wie die Probe sie anlegte. */
  const wochenZurueck = (...wochen) => async () => {
    let status = 204
    for (const w of wochen) {
      status = Math.max(status, (await planer.rest(`weeks?congregation_id=eq.${versammlung}&start=eq.${w.start}`, 'PATCH', { data: w.data }, 'return=minimal')).status)
    }
    return { status }
  }
  const glocke = (wer, taskKey, titel) => () =>
    wer.rest(`notifications?select=id&task_key=eq.${encodeURIComponent(taskKey)}&title=eq.${encodeURIComponent(titel)}`)
  const zusage = (wer, taskKey) => () => planer.rest(`confirmations?select=status&task_key=eq.${encodeURIComponent(taskKey)}&user_id=eq.${wer.uid}`)
  const tagebuch = (taskKey, pid, uid) => () =>
    planer.rest(`assignment_log?select=persoenlich_at&task_key=eq.${encodeURIComponent(taskKey)}&person_id=eq.${pid}&user_id=${uid ? `eq.${uid}` : 'is.null'}`)
  const da = (zeilen) => zeilen.length > 0
  const fort = (zeilen) => zeilen.length === 0
  const bestaetigt = (zeilen) => zeilen[0]?.status === 'bestätigt'
  /** Ist eine Anfrage erledigt — fort beim Fragenden, ihre Glocke fort beim Gefragten —, und steht da, was dazukommt? */
  const erledigt = (id, dazu = []) => () =>
    zusammen([
      ['die Anfrage fort', () => mitglied.rest(`tausch_anfragen?select=id&id=eq.${id}`), fort],
      ['ihre Glocke beim Gruppenaufseher fort', glocke(aufseher, `tausch|${id}`, TAUSCH_TITEL.angefragt), fort],
      ...dazu,
    ])

  // (94) An der Function vorbei. Der Admin sieht die Zeile nicht, löschen darf
  // sie niemand — angekommen, zieht das Mitglied sie zurück.
  await schreibVersuch(k, 94, 'Mitglied: eine Tausch-Anfrage an der Function vorbei schreiben', 'tausch_anfragen', a.anfrageVersuch, false, [
    'AUCH DAS!',
    'abgewiesen — Anfragen schreibt nur die Function',
  ], { leser: mitglied, loeschen: () => anfragenZurueckziehen(mitglied, [a.anfrageVersuch.id]) })

  await tauschen({
    nr: 95, was: 'Mitglied: den Platz des Gruppenaufsehers gleich weggeben, ohne ihn zu fragen', voraus: voraus.alles, urteile: ['not-yours'],
    wer: mitglied, rumpf: { aktion: 'direkt', gibtAb: p.b, nimmt: p.ohneKonto, heute }, nachsehen: unveraendert(p.b, p.ohneKonto), woerter: GETAUSCHT,
    erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — tauschen kann nur, wer den Platz hat'],
    zurueck: wochenZurueck(a.wochen.nehmen, a.wochen.direkt), zurueckWoerter: ZURUECK,
  })
  await tauschen({
    nr: 96, was: 'Mitglied: um einen Platz bitten, dessen Plan nicht hinausging', voraus: voraus.ungesendet, urteile: ['not-published'],
    wer: mitglied, rumpf: { aktion: 'anfragen', gibtAb: p.a, nimmt: p.ungesendet, heute }, nachsehen: angefragt(p.a), woerter: ANGEFRAGT,
    erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — getauscht wird erst nach „Plan senden"'],
    zurueck: zurueckziehen(p.a), zurueckWoerter: ZURUECKGEZOGEN,
  })
  const was97 = 'Mitglied: eine Zusammenkunft tauschen, die schon war'
  if (!a.wochen.vorbei) {
    k.ungemessen(97, was97, 'die Wochen um heute sind belegt — die vergangene Zusammenkunft braucht eine eigene')
  } else {
    await tauschen({
      nr: 97, was: `${was97} (${a.heuteVorbei.senden}, getauscht am Tag danach)`, voraus: voraus.vorbei, urteile: ['past'],
      wer: mitglied, rumpf: { aktion: 'anfragen', gibtAb: p.vorbei, nimmt: p.b, heute: a.heuteVorbei.tauschen }, nachsehen: angefragt(p.vorbei), woerter: ANGEFRAGT,
      erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — was vorbei ist, tauscht niemand mehr'],
      zurueck: zurueckziehen(p.vorbei), zurueckWoerter: ZURUECKGEZOGEN,
    })
  }
  await tauschen({
    nr: 98, was: 'Mitglied: gleich tauschen mit jemandem, der ein Konto hat', voraus: voraus.alles, urteile: ['has-account'],
    wer: mitglied, rumpf: { aktion: 'direkt', gibtAb: p.a, nimmt: p.b, heute }, nachsehen: unveraendert(p.a, p.b), woerter: GETAUSCHT,
    erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — wer ein Konto hat, sagt selbst zu'],
    zurueck: wochenZurueck(a.wochen.abgeben, a.wochen.nehmen), zurueckWoerter: ZURUECK,
  })

  // (99) Was die App als Erstes holt: mit wem es ginge, und wer davon ein Konto hat.
  await leseVersuch(k, 99, 'Mitglied: die Angebote für den eigenen Platz holen', voraus.alles, async () => {
    const r = await mitglied.funktion('tauschen', { aktion: 'angebote', gibtAb: p.a, heute })
    const angebote = Array.isArray(r.daten?.angebote) ? r.daten.angebote : []
    const konto = (nimmt) => angebote.find((x) => x.nimmt === nimmt)?.konto
    const wie = (nimmt) => (konto(nimmt) === undefined ? 'fehlt' : konto(nimmt) ? 'mit Konto' : 'ohne Konto')
    return {
      status: r.status,
      sichtbar: konto(p.b) === true && konto(p.ohneKonto) === false,
      detail: `Gruppenaufseher ${wie(p.b)}, Tauschpartner ${wie(p.ohneKonto)}`,
    }
  }, true, ['den einen fragt die App an, mit dem anderen tauscht man nach Absprache', 'ZU STRENG — die App böte nicht an, was ginge'])

  // (100)–(103) Eine Anfrage an den Gruppenaufseher: wer sie sieht, wer sie annehmen kann.
  let erste = null
  await tauschen({
    nr: 100, was: 'Mitglied: den Gruppenaufseher um einen Tausch bitten', voraus: voraus.alles,
    wer: mitglied, rumpf: { aktion: 'anfragen', gibtAb: p.a, nimmt: p.b, heute },
    nachsehen: async () => {
      const r = await anfragenZu(p.a)
      erste = r.ids[0] ?? null
      return { status: r.status, geschehen: Boolean(erste) }
    },
    woerter: ANGEFRAGT, erwartet: true, folge: ['der Weg steht offen', 'ZU STRENG — niemand kann mehr um einen Tausch bitten'],
  })
  const anfrage = erste ? { ok: true } : { ok: false, grund: 'keine Anfrage aus (100)' }
  await leseVersuch(k, 101, 'Gruppenaufseher: die Anfrage an ihn sehen, samt Glocke „Tausch angefragt"', anfrage, () => zusammen([
    ['die Anfrage', () => aufseher.rest(`tausch_anfragen?select=id&id=eq.${erste}`), da],
    ['die Glocke', glocke(aufseher, `tausch|${erste}`, TAUSCH_TITEL.angefragt), da],
  ]), true, ['er erfährt es und sieht sie in der App', 'ZU STRENG — der Gefragte erfährt nichts'])
  await leseVersuch(k, 102, 'Planer: die Anfrage sehen', anfrage, zeileSicht(zuteiler, 'tausch_anfragen', erste), false, [
    'AUCH DAS!',
    'unsichtbar — sie sehen nur die beiden, um die es geht',
  ])
  await tauschen({
    nr: 103, was: 'Planer: die Anfrage an den Gruppenaufseher annehmen', voraus: anfrage, urteile: ['gone'],
    wer: zuteiler, rumpf: { aktion: 'annehmen', id: erste, heute },
    // Durch wäre auch, wenn die Anfrage dabei verschwände: Dann hätte er sie für den Gefragten erledigt.
    nachsehen: async () => {
      const [w, r] = await Promise.all([unveraendert(p.a, p.b)(), anfragenZu(p.a)])
      const weg = !r.ids.includes(erste)
      return { status: Math.max(w.status, r.status), geschehen: w.geschehen || weg, detail: `${w.detail}; die Anfrage ${weg ? 'fort' : 'noch da'}` }
    },
    woerter: ['ANGENOMMEN', 'nicht angenommen'], erwartet: false, folge: ['AUCH DAS!', 'abgewiesen — annehmen kann nur der Gefragte'],
    zurueck: wochenZurueck(a.wochen.abgeben, a.wochen.nehmen), zurueckWoerter: ZURUECK,
  })

  // (104) Ablehnen braucht die Anfrage aus (100) — (103) durfte sie nicht erledigen.
  const offen = !anfrage.ok ? anfrage : (await anfragenZu(p.a)).ids.includes(erste) ? { ok: true } : { ok: false, grund: 'die Anfrage aus (100) ist fort' }
  await tauschen({
    nr: 104, was: 'Gruppenaufseher: die Anfrage ablehnen', voraus: offen,
    wer: aufseher, rumpf: { aktion: 'ablehnen', id: erste },
    nachsehen: erledigt(erste, [['„Tausch abgelehnt" beim Mitglied', glocke(mitglied, p.a, TAUSCH_TITEL.abgelehnt), da]]),
    woerter: ['ABGELEHNT', 'nicht abgelehnt'], erwartet: true,
    folge: ['die Anfrage ist erledigt, das Mitglied erfährt es', 'ZU STRENG — der Gefragte kann nicht ablehnen'],
  })

  /** Eine neue Anfrage des Mitglieds an den Gruppenaufseher — für (105) und (106). */
  const neueAnfrage = async () => {
    if (!voraus.alles.ok) return voraus.alles
    const r = await mitglied.funktion('tauschen', { aktion: 'anfragen', gibtAb: p.a, nimmt: p.b, heute })
    const id = r.daten?.anfrage?.id
    if (!id) return { ok: false, grund: `die Anfrage dafür kam nicht zustande (HTTP ${r.status}: ${r.daten?.error ?? '—'})` }
    merker.anfragen.add(id)
    return { ok: true, id }
  }
  const zweite = await neueAnfrage()
  await tauschen({
    nr: 105, was: 'Mitglied: eine neue Anfrage zurückziehen', voraus: zweite,
    wer: mitglied, rumpf: { aktion: 'zurueckziehen', id: zweite.id }, nachsehen: erledigt(zweite.id),
    woerter: ['ZURÜCKGEZOGEN', 'nicht zurückgezogen'], erwartet: true,
    folge: ['die Anfrage ist erledigt, die Glocke des Gefragten mit ihr', 'ZU STRENG — eine Anfrage lässt sich nicht zurückziehen'],
  })

  // (106)–(108) Angenommen: zwei Wochen auf einmal, und alles, was dazugehört.
  const dritte = await neueAnfrage()
  const e106 = await tauschen({
    nr: 106, was: 'Gruppenaufseher: die Anfrage annehmen — beide Wochen auf einmal (wochen_tauschen)', voraus: dritte,
    wer: aufseher, rumpf: { aktion: 'annehmen', id: dritte.id, heute },
    nachsehen: getauscht({ [p.a]: aufseher.pid, [p.b]: mitglied.pid }), woerter: GETAUSCHT, erwartet: true,
    folge: ['der Tausch steht in beiden Wochen', 'ZU STRENG — angenommen, aber nicht getauscht'],
  })
  const tausch = e106?.durch ? { ok: true } : { ok: false, grund: 'kein Tausch aus (106)' }
  await leseVersuch(k, 107, '… Zusagen und Versand-Tagebuch der beiden stehen um', tausch, () => zusammen([
    ['Zusage des Mitglieds', zusage(mitglied, p.b), bestaetigt],
    ['Zusage des Gruppenaufsehers', zusage(aufseher, p.a), bestaetigt],
    ['Tagebuch des Mitglieds', tagebuch(p.b, mitglied.pid, mitglied.uid), da],
    ['Tagebuch des Gruppenaufsehers', tagebuch(p.a, aufseher.pid, aufseher.uid), da],
  ]), true, ['beide haben zugesagt und gelten als benachrichtigt', 'FEHLT — die Function schrieb nicht alles (ihre Logs ansehen)'])
  await leseVersuch(k, 108, '… „Getauscht" an Mitglied, Admin und Planer, die Anfrage ist erledigt', tausch, erledigt(dritte.id, [
    ['„Getauscht" beim Mitglied', glocke(mitglied, p.b, TAUSCH_TITEL.getauscht), da],
    ['beim Admin', glocke(planer, p.a, TAUSCH_TITEL.getauscht), da],
    ['beim Planer', glocke(zuteiler, p.a, TAUSCH_TITEL.getauscht), da],
  ]), true, ['alle wissen es, zustimmen muss der Planer nicht', 'FEHLT — nicht jeder erfährt vom Tausch'])

  // (109)–(110) Ohne Anfrage, mit jemandem ohne Konto: in einer Woche (`wocheSchreiben`).
  const e109 = await tauschen({
    nr: 109, was: 'Mitglied: mit einer Person ohne Konto gleich tauschen, nach Absprache (eine Woche)', voraus: voraus.alles,
    wer: mitglied, rumpf: { aktion: 'direkt', gibtAb: p.eigenMitte, nimmt: p.ohneKonto, heute },
    nachsehen: getauscht({ [p.eigenMitte]: a.person.id, [p.ohneKonto]: mitglied.pid }), woerter: GETAUSCHT, erwartet: true,
    folge: ['der Tausch steht in der Woche', 'ZU STRENG — mit jemandem ohne Konto lässt sich nicht tauschen'],
  })
  const direkt = e109?.durch ? { ok: true } : { ok: false, grund: 'kein Tausch aus (109)' }
  await leseVersuch(k, 110, '… die Person ohne Konto „weiß Bescheid", „Getauscht" an Admin und Planer', direkt, () => zusammen([
    ['„weiß Bescheid" im Tagebuch', tagebuch(p.eigenMitte, a.person.id, null), (zeilen) => Boolean(zeilen[0]?.persoenlich_at)],
    ['Tagebuch des Mitglieds', tagebuch(p.ohneKonto, mitglied.pid, mitglied.uid), da],
    ['Zusage des Mitglieds', zusage(mitglied, p.ohneKonto), bestaetigt],
    ['„Getauscht" beim Admin', glocke(planer, p.eigenMitte, TAUSCH_TITEL.getauscht), da],
    ['beim Planer', glocke(zuteiler, p.eigenMitte, TAUSCH_TITEL.getauscht), da],
  ]), true, ['ihr Platz steht nicht als ungeklärt da, und die Planer wissen es', 'FEHLT — die Function schrieb nicht alles (ihre Logs ansehen)'])
}

/**
 * Alles wieder weg, was die Probe fürs Tauschen anlegte — und was die
 * Functions dazu schrieben. Was niemand direkt löschen darf, geht den Weg der
 * App: offene Anfragen zieht das Mitglied zurück (`tauschen`), das
 * Versand-Tagebuch nimmt der Admin per „Entzug" heraus (`send-plan`). Beide
 * schreiben dabei Mitteilungen, die zuletzt mit allen übrigen gehen; danach
 * stehen die Freischaltungen von Mitglied und Gruppenaufseher wieder wie
 * vorher.
 */
async function tauschAufraeumen(k, a, merker) {
  const { planer, mitglied, zuteiler, aufseher, versammlung, marke } = k
  const plaetze = Object.values(a.plaetze).filter(Boolean)
  /** Tun und nachsehen: `grund`, wenn danach noch etwas dasteht. */
  const bisLeer = async (tun, nachsehen) => {
    const r = await tun()
    if (r.status >= 400) return r
    const danach = await nachsehen()
    const n = zeilenVon(danach).length
    return danach.status >= 400 || !n ? danach : { status: danach.status, grund: `${n} blieben stehen` }
  }
  const offeneAnfragen = () => mitglied.rest(`tausch_anfragen?select=id&gibt_ab=in.${liste(plaetze)}`)
  const tagebuch = () => planer.rest(`assignment_log?select=task_key,name,person_id&task_key=in.${liste(plaetze)}`)
  /** Die Glocke eines Kontos: alles auf den Plätzen und Anfragen der Probe, dazu die Entzüge mit dem Kennzeichen. */
  const mitteilungen = (wer) => async () => {
    const schluessel = [...plaetze, ...[...merker.anfragen].map((id) => `tausch|${id}`)]
    const r = await wer.rest(`notifications?task_key=in.${liste(schluessel)}`, 'DELETE', undefined, 'return=minimal')
    const s = await wer.rest(`notifications?body=like.*${marke}*`, 'DELETE', undefined, 'return=minimal')
    return { status: Math.max(r.status, s.status) }
  }
  await nacheinanderAufraeumen(
    marke,
    [
      ['die offenen Anfragen', () => bisLeer(async () => {
        const offen = await offeneAnfragen()
        if (offen.status >= 400) return offen
        const ids = zeilenVon(offen).map((z) => z.id)
        for (const id of ids) merker.anfragen.add(id)
        return anfragenZurueckziehen(mitglied, ids)
      }, offeneAnfragen)],
      ['das Versand-Tagebuch der Probewochen', () => bisLeer(async () => {
        const log = await tagebuch()
        if (log.status >= 400 || !zeilenVon(log).length) return log
        // Wie die App, wenn sie eine Zuteilung zurücknimmt; der Text trägt das Kennzeichen.
        return planer.funktion('send-plan', {
          action: 'entzug',
          entzuege: zeilenVon(log).map((z) => ({ taskKey: z.task_key, name: z.name, ...(z.person_id ? { pid: z.person_id } : {}), datum: 'Probe', label: marke })),
        })
      }, tagebuch)],
      ['die Zusagen', () => planer.rest(`confirmations?task_key=in.${liste(plaetze)}`, 'DELETE', undefined, 'return=minimal')],
      ...(merker.wochen.length
        ? [['die Wochen', () => planer.rest(`weeks?congregation_id=eq.${versammlung}&start=in.(${merker.wochen.join(',')})`, 'DELETE', undefined, 'return=minimal')]]
        : []),
      ...(merker.person ? [['die Person ohne Konto', () => planer.rest(`persons?id=eq.${merker.person}`, 'DELETE', undefined, 'return=minimal')]] : []),
      ...merker.priv.map((p) => [`die Freischaltung ${p.wer}`, () => planer.rest(`persons?id=eq.${p.id}`, 'PATCH', { priv: p.priv }, 'return=minimal')]),
      ...[planer, mitglied, zuteiler, aufseher].map((wer) => [`die Mitteilungen an ${wer.mail}`, mitteilungen(wer)]),
    ],
    ', das Versand-Tagebuch der Probewochen geleert, die Freischaltungen wie vorher',
  )
}

/**
 * Die Fälle (93)–(110) — siehe Kopf. (93) braucht nichts; für die übrigen legt
 * der Admin die Anlage an. Aufgeräumt wird in jedem Fall, auch wenn ein Fall
 * mittendrin wirft.
 */
async function tauschProben(k) {
  const { planer, mitglied, zuteiler, aufseher, anonym, versammlung, marke } = k
  console.log('\nDas Tauschen (seit 29.10.2026; angelegt als Admin, im Jahr 2099):')
  // Der Kalendertag, wie die App ihn mitschickt — der Server glaubt ihn,
  // solange er höchstens einen neben dem eigenen liegt.
  const heute = new Date().toISOString().slice(0, 10)
  const tag0 = ersterMontagAb('2099-01-01')
  // Welcher Platz, ist gleich: Ohne Anmeldung kommt niemand bis zu einem.
  const irgendeiner = helferSchluessel(tagPlus(tag0, 7 * 30), 'we', 'probe', 0)
  await tuerVersuch(k, 93, 'Ohne Anmeldung: die Function tauschen rufen', anonym, 'tauschen', { aktion: 'angebote', gibtAb: irgendeiner, heute }, ['forbidden'], 'tauschen kann nur, wer angemeldet ist', 'unauthorized')

  // Gefragt wird der Gruppenaufseher, zusehen muss der Planer: drei eigene Personen.
  const personen = [mitglied.pid, zuteiler.pid, aufseher.pid]
  if (personen.some((pid) => !pid) || new Set(personen).size < personen.length) {
    k.ungemessen('94–110', 'das Tauschen', 'Mitglied, Planer und Gruppenaufseher brauchen je eine eigene Person')
    return
  }
  const [dienste, gelesen] = await Promise.all([
    planer.rest('services?select=key,count,groups&order=position'),
    planer.rest(`persons?select=id,fn,ln,priv&id=in.(${mitglied.pid},${aufseher.pid})`),
  ])
  // Getauscht wird ein Dienst, den eine Person übernimmt — nicht die Reinigung einer Gruppe.
  const svc = zeilenVon(dienste).find((s) => !s.groups && s.count >= 1)?.key
  const person = (pid) => zeilenVon(gelesen).find((x) => x.id === pid)
  if (!svc || !person(mitglied.pid) || !person(aufseher.pid)) {
    const grund = !svc
      ? `kein Dienst, den eine Person übernimmt (HTTP ${dienste.status})`
      : `die Personen von Mitglied und Gruppenaufseher sind nicht lesbar (HTTP ${gelesen.status})`
    k.ungemessen('94–110', 'das Tauschen', grund)
    return
  }
  const name = (pid) => `${person(pid).fn} ${person(pid).ln}`.trim()
  const ohneKontoId = crypto.randomUUID()
  const anfrageId = crypto.randomUUID()
  const anlage = (vorbei) =>
    tauschAnlage({
      marke, versammlung, tag0, svc, vorbei, ohneKontoId, anfrageId,
      mitglied: { id: mitglied.pid, uid: mitglied.uid, name: name(mitglied.pid) },
      aufseher: { id: aufseher.pid, name: name(aufseher.pid) },
    })

  // Wo schon eine Woche steht, die nicht von der Probe ist, wird nichts überschrieben.
  const kandidaten = vorbeiKandidaten(heute)
  const starts = [...Object.values(anlage(null).wochen).filter(Boolean).map((w) => w.start), ...kandidaten.map(montagVon)]
  const vorhanden = await planer.rest(`weeks?select=start,data&start=in.(${[...new Set(starts)].join(',')})`)
  if (vorhanden.status >= 400) {
    k.ungemessen('94–110', 'das Tauschen', `die Wochen sind nicht lesbar (HTTP ${vorhanden.status})`)
    return
  }
  const belegt = new Set(zeilenVon(vorhanden).filter((w) => !String(w.data?.range ?? '').startsWith('PROBE-')).map((w) => w.start))
  const a = anlage(kandidaten.find((tag) => !belegt.has(montagVon(tag))) ?? null)
  const fremd = [a.wochen.abgeben, a.wochen.nehmen, a.wochen.direkt, a.wochen.ungesendet].find((w) => belegt.has(w.start))
  if (fremd) {
    k.ungemessen('94–110', 'das Tauschen', `in der Woche ${fremd.start} steht eine, die nicht von der Probe ist — nicht überschrieben`)
    return
  }

  const merker = { wochen: [], person: null, priv: [], anfragen: new Set([a.anfrageVersuch.id]) }
  try {
    const freizuschalten = [
      { ...person(mitglied.pid), priv: person(mitglied.pid).priv ?? {}, wer: 'des Mitglieds' },
      { ...person(aufseher.pid), priv: person(aufseher.pid).priv ?? {}, wer: 'des Gruppenaufsehers' },
    ]
    const voraus = await tauschVorbereiten(k, a, freizuschalten, merker, heute)
    await tauschVersuche(k, a, voraus, merker, heute)
  } finally {
    await tauschAufraeumen(k, a, merker)
  }
}

/* ===================== Ausführung ========================================= */

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(arg = process.argv.slice(2)) {
  // Die Versammlung aus der Aufrufzeile, sonst aus der Kontendatei, die das
  // Anlege-Skript mit ihren Konten geschrieben hat. Geprüft wird sie so oder so
  // gegen alle vier Anmeldungen (unten), bevor etwas geschrieben wird.
  const ohneFragen = zugangOhneFragen()
  // `--versammlung` ohne Wert ist ein vergessener Wert, kein Wunsch nach der Datei.
  const stelle = arg.indexOf('--versammlung')
  const genannt = stelle >= 0 ? (arg[stelle + 1] ?? '') : undefined
  const versammlung = genannt ?? ohneFragen.versammlung
  if (!versammlung || versammlung.startsWith('--')) {
    console.error(`Welche Versammlung? Weder --versammlung <congregation-id> noch eine Kontendatei (${probeDatei()}) — zuerst die Testversammlung anlegen, siehe Kopf dieser Datei.`)
    process.exit(2)
  }
  if (!genannt) console.log(`Versammlung und Konten aus ${probeDatei()}.`)
  const z = await zugang(ohneFragen)

  // `planer` ist das Admin-Konto (der Name stammt aus der Zeit vor den
  // Rechte-Stufen), `zuteiler` das der Stufe „Planer" — siehe Kopf.
  const planer = await anmelden(z.url, z.anon, z.planerMail, z.planerPass)
  const mitglied = await anmelden(z.url, z.anon, z.mitgliedMail, z.mitgliedPass)
  const zuteiler = await anmelden(z.url, z.anon, z.zuteilerMail, z.zuteilerPass)
  const aufseher = await anmelden(z.url, z.anon, z.aufseherMail, z.aufseherPass)
  const alle = [planer, mitglied, zuteiler, aufseher]

  for (const k of alle) {
    if (k.cong !== versammlung) {
      console.error(`${k.mail} gehört zu ${k.cong}, nicht zu ${versammlung}. Abbruch, es wird nichts geschrieben.`)
      process.exit(2)
    }
  }
  // Jede Bedingung vor dem ersten Schreiben: Ein Konto in der falschen Stufe
  // mäße eine andere Grenze als die genannte — und meldete sie als gemessen.
  const abbruch = (text) => {
    console.error(`${text} Abbruch, es wird nichts geschrieben.`)
    process.exit(2)
  }
  if (new Set(alle.map((k) => k.uid)).size < alle.length) abbruch('Zwei der vier Anmeldungen sind dasselbe Konto.')
  if (!planer.planer) abbruch(`${planer.mail} ist kein Admin — dann misst (4) nicht die Grenze, sondern nichts.`)
  if (mitglied.planer || mitglied.zuteiler) abbruch(`${mitglied.mail} ist Admin oder Planer. Gefragt ist, was ein **einfaches** Mitglied darf.`)
  if (!zuteiler.zuteiler || zuteiler.planer) abbruch(`${zuteiler.mail} ist nicht Planer, oder zugleich Admin — dann misst die Probe die Stufe „Planer" nicht.`)
  if (aufseher.planer || aufseher.zuteiler) abbruch(`${aufseher.mail} ist Admin oder Planer. Gefragt ist, was ein Gruppenaufseher **ohne** diese Rechte darf.`)

  const { daten: cong } = await planer.rest(`congregations?select=name&id=eq.${versammlung}`)
  console.log(`Versammlung:     „${cong?.[0]?.name ?? '?'}" ${versammlung}`)
  console.log(`Admin:           ${planer.mail}`)
  console.log(`Planer:          ${zuteiler.mail}`)
  console.log(`Gruppenaufseher: ${aufseher.mail}`)
  console.log(`Mitglied:        ${mitglied.mail} (Person ${mitglied.pid ?? '—'})\n`)

  // Eine fremde Aufgabe suchen — aus der Sicht des Planers, der alle Wochen sieht.
  const { status: wochenStatus, daten: wochen } = await planer.rest('weeks?select=start,data&order=start&limit=12')
  if (wochenStatus >= 400) {
    console.error(`Die Wochen sind nicht lesbar (${wochenStatus}): ${JSON.stringify(wochen)}`)
    process.exit(1)
  }
  const week = wochen?.[0]?.data
  if (!week) {
    console.error('Keine Woche in dieser Versammlung — ohne Zuteilungen ist S2 nicht zu messen.')
    process.exit(1)
  }
  // Die Kennung der Woche steht in der **Spalte**, nicht im JSONB. Ohne sie
  // hiesse der Schlüssel "undefined|mid|…" und träfe nichts.
  const mitKennung = (z) => ({ ...z.data, start: z.start })
  const fremde = fremdeSlots(mitKennung(wochen[0]), mitglied.pid)
  const programm = fremde.find((s) => s.art === 'Programm')
  const dienst = fremde.find((s) => s.art.startsWith('Hilfsdienst'))
  // EIGENE Aufgaben — über alle geladenen Wochen gesucht: In einer einzelnen
  // ist nicht jeder eingeteilt, und ohne sie fehlt der Probe der Beweis, dass
  // die Richtlinie nicht zu streng ist (Fall 5), und die Gegenprobe (2).
  const eigene = (wochen ?? []).flatMap((z) => eigeneSlots(mitKennung(z), mitglied.pid))
  const eigen = eigene[0]
  if (!programm) {
    console.error('Kein fremder Programmplatz gefunden.')
    process.exit(1)
  }

  const befunde = []
  const nichtGemessen = []
  const ergebnis = (nr, was, e, folge) => {
    befunde.push({ nr, durch: e.durch, wieErwartet: e.wieErwartet, kaputt: Boolean(e.kaputt), erwartet: Boolean(e.erwartet) })
    console.log(`  ${e.wieErwartet ? '·' : '!'} (${nr}) ${was}`)
    // Bei einer kaputten Probe kein Nachsatz: „abgewiesen — … greift" wäre
    // genau die Behauptung, die sie nicht belegt hat.
    console.log(`      ${e.text}${folge && !e.kaputt ? ` — ${folge}` : ''}`)
  }
  /** Ein Fall, dem die Voraussetzung fehlte — gesagt statt stillschweigend übersprungen. */
  const ungemessen = (nr, was, grund, nachsatz) => {
    nichtGemessen.push(nr)
    console.log(`  ? (${nr}) ${was} — ${grund}, nicht gemessen`)
    if (nachsatz) console.log(`      ${nachsatz}`)
  }
  /** Eine Probe, die ihre eigene Voraussetzung nicht herstellen konnte: kein Urteil über die Regel. */
  const kaputt = (nr, was, grund, erwartet) =>
    ergebnis(nr, was, { durch: false, wieErwartet: false, kaputt: true, erwartet, text: `PROBE KAPUTT — ${grund}, kein Urteil über die Regel` })

  // Ein Kennzeichen je Lauf: Damit findet der Empfänger genau die Zeilen dieser
  // Probe wieder — auch die, die gar nicht ankommen sollten.
  const marke = `PROBE-${Date.now()}`
  console.log(`Was das Mitglied schreiben kann (Kennzeichen ${marke}):`)

  // Aufgeräumt wird auch, wenn nur das Nachsehen scheiterte: Dann kann die
  // Zeile trotzdem angekommen sein. Scheiterte schon das Schreiben, bleibt alles
  // stehen — Bestätigungen löscht die Probe über `task_key` und `user_id`, und
  // das träfe eine Zusage, die jemand in der App gegeben hat (bei (5) ein 409).
  // `woerter`: Eine geänderte Zeile wird zurückgestellt, nicht gelöscht.
  const aufraeumen = async (e, loeschen, woerter = ['Zeile wieder gelöscht', 'vorsorglich aufgeräumt']) => {
    if (!e.durch && !e.vielleichtDurch) return
    const weg = await loeschen()
    console.log(
      weg.status < 400
        ? `      (${e.durch ? woerter[0] : woerter[1]})`
        : `      !! Zeile blieb stehen (${weg.status}) !!`,
    )
  }
  // Mitteilungen findet das Aufräumen nur über das Nachsehen — scheiterte das,
  // bleibt allein der Hinweis auf das Kennzeichen.
  const unaufgeraeumt = (antwort) => {
    if (antwort.status >= 400) console.log(`      !! nicht nachprüfbar — Mitteilungen „${marke} …" ggf. von Hand löschen`)
  }

  // ---- 1) S2: fremder task_key, eigene user_id ----------------------------
  const ziel = dienst ?? programm
  const schluessel = encodeURIComponent(ziel.key)
  const s2 = await mitglied.rest(
    'confirmations',
    'POST',
    { congregation_id: versammlung, user_id: mitglied.uid, task_key: ziel.key, status: dienst ? 'verhindert' : 'bestätigt' },
    'return=minimal',
  )
  // Nachgesehen wird beim **Planer**: Er ist der, dem die falsche Bestätigung
  // etwas vorspiegeln würde — und nur nach Zeilen **des Mitglieds**. Die echte
  // Zusage des Zuständigen stünde sonst als Loch da.
  const { status: l1, daten: sicht } = await planer.rest(`confirmations?select=status&task_key=eq.${schluessel}&user_id=eq.${mitglied.uid}`)
  const e1 = bewerteVersuch(s2.status, Boolean(sicht?.length), false, { leseStatus: l1 })
  ergebnis(1, `Bestätigung auf eine fremde Aufgabe (${ziel.art}: ${ziel.wer})`, e1, e1.durch ? 'S2 STEHT NOCH OFFEN' : 'abgewiesen — task_gehoert_mir greift')
  if (e1.durch) {
    console.log(`      Der Planer sieht auf ${ziel.wer}s Platz, geschrieben vom Mitglied: ${sicht.map((z) => z.status).join(', ')}`)
  }
  await aufraeumen(e1, () =>
    mitglied.rest(`confirmations?task_key=eq.${schluessel}&user_id=eq.${mitglied.uid}`, 'DELETE', undefined, 'return=minimal'),
  )

  // ---- 2) Gegenprobe: fremde user_id --------------------------------------
  // Auf eine EIGENE Aufgabe des Mitglieds: Die besteht `task_gehoert_mir`,
  // abweisen kann also nur noch `user_id = auth.uid()`. Auf der fremden Aufgabe
  // aus (1) wiese schon deren Regel ab, und (2) bewiese nichts.
  //
  // Und nur auf eine, auf der noch keine Zeile des Planers steht: Nachsehen fände
  // sie und meldete „AUCH DAS!", das Aufräumen löschte sie. Bis zum 27.9.2026
  // schrieb (2) auf den fremden Programmplatz — hatte der Planer ihn selbst
  // zugesagt, geschah genau das.
  const was2 = 'eine eigene Aufgabe im Namen des Admins'
  const vorher2 = await planer.rest(`confirmations?select=task_key&user_id=eq.${planer.uid}`)
  const belegt = new Set(zeilenVon(vorher2).map((z) => z.task_key))
  const ziel2 = eigene.find((s) => !belegt.has(s.key))
  if (vorher2.status >= 400) {
    kaputt(2, was2, `Nachsehen vorab scheiterte (HTTP ${vorher2.status})`, false)
  } else if (!ziel2) {
    ungemessen(2, was2, eigene.length ? 'auf jeder steht schon eine Zeile des Admins' : 'KEINE gefunden')
  } else {
    const schluessel2 = encodeURIComponent(ziel2.key)
    const s2b = await mitglied.rest(
      'confirmations',
      'POST',
      { congregation_id: versammlung, user_id: planer.uid, task_key: ziel2.key, status: 'bestätigt' },
      'return=minimal',
    )
    const { status: l2, daten: sicht2 } = await planer.rest(`confirmations?select=user_id&task_key=eq.${schluessel2}&user_id=eq.${planer.uid}`)
    const e2 = bewerteVersuch(s2b.status, Boolean(sicht2?.length), false, { leseStatus: l2 })
    ergebnis(2, `${was2} (${ziel2.art}: ${ziel2.wer})`, e2, e2.durch ? 'AUCH DAS!' : 'die Grenze greift hier')
    await aufraeumen(e2, () =>
      planer.rest(`confirmations?task_key=eq.${schluessel2}&user_id=eq.${planer.uid}`, 'DELETE', undefined, 'return=minimal'),
    )
  }

  // ---- 3) S3: freier Text an einen Empfaenger, der KEIN Planer ist ---------
  // Empfänger ist hier das Mitglied selbst — nicht aus Bequemlichkeit, sondern
  // weil es die Frage stellt, auf die es ankommt: Der legitime Weg adressiert
  // die **Planer**, alles andere ist der Missbrauch aus S3. Und nachsehen kann
  // in dieser Glocke nur der Empfänger (`notifications_select`).
  const s3 = await mitglied.rest(
    'notifications',
    'POST',
    {
      congregation_id: versammlung,
      user_id: mitglied.uid,
      type: 'verhindert',
      title: `${marke} — frei erfundener Titel`,
      body: 'Diese Mitteilung hat ein einfaches Mitglied geschrieben, nicht die App.',
    },
    'return=minimal',
  )
  const angekommen3 = await mitglied.rest(`notifications?select=id,type,title&title=like.${marke}*`)
  const e3 = bewerteVersuch(s3.status, zeilenVon(angekommen3).length > 0, false, { leseStatus: angekommen3.status })
  ergebnis(3, 'Mitteilung mit freiem Text an einen Nicht-Planer', e3, e3.durch ? 'S3 STEHT NOCH OFFEN' : 'abgewiesen — notifications_insert greift')
  for (const z of zeilenVon(angekommen3)) {
    console.log(`      In der Glocke gelandet: „${z.title}" (${z.type})`)
    const weg = await mitglied.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
    console.log(weg.status < 400 ? '      (wieder gelöscht)' : `      !! Mitteilung ${z.id} blieb stehen (${weg.status}) !!`)
  }
  unaufgeraeumt(angekommen3)

  // ---- 4) Gegenprobe: Mitteilungstyp, den nur Planer setzen dürfen ---------
  const s3b = await mitglied.rest(
    'notifications',
    'POST',
    { congregation_id: versammlung, user_id: planer.uid, type: 'zuteilung', title: `${marke} — als Zuteilung ausgegeben`, body: '' },
    'return=minimal',
  )
  const angekommen4 = await planer.rest(`notifications?select=id&title=like.${marke}*`)
  const e4 = bewerteVersuch(s3b.status, zeilenVon(angekommen4).length > 0, false, { leseStatus: angekommen4.status })
  ergebnis(4, 'dieselbe Mitteilung als Typ „zuteilung" (nur der Admin)', e4, e4.durch ? 'AUCH DAS!' : 'die Grenze greift hier')
  for (const z of zeilenVon(angekommen4)) {
    await planer.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
  }
  unaufgeraeumt(angekommen4)

  // ---- 5) Der Beweis, dass die Richtlinie nicht zu streng ist --------------
  // Ohne diesen Fall bewiese die Probe nichts: Eine Richtlinie, die ALLES
  // abweist, bestünde (1) bis (4) glänzend und bräche die App. Fehlt dem
  // Mitglied in den geladenen Wochen jede eigene Aufgabe, wird das gesagt statt
  // stillschweigend übersprungen.
  if (!eigen) {
    ungemessen(5, 'eigene Aufgabe bestätigen', 'KEINE gefunden', 'Ohne eigene Zuteilung bleibt offen, ob die Richtlinie zu streng ist.')
  } else {
    const eigenKey = encodeURIComponent(eigen.key)
    const s5 = await mitglied.rest(
      'confirmations',
      'POST',
      { congregation_id: versammlung, user_id: mitglied.uid, task_key: eigen.key, status: 'bestätigt' },
      'return=minimal',
    )
    const { status: l5, daten: sicht5 } = await mitglied.rest(`confirmations?select=status&task_key=eq.${eigenKey}&user_id=eq.${mitglied.uid}`)
    const e5 = bewerteVersuch(s5.status, Boolean(sicht5?.length), true, { leseStatus: l5 })
    ergebnis(5, `eigene Aufgabe bestätigen (${eigen.art}: ${eigen.wer})`, e5, e5.durch ? 'der Weg steht offen' : 'ZU STRENG — die App kann nicht mehr bestätigen')
    await aufraeumen(e5, () =>
      mitglied.rest(`confirmations?task_key=eq.${eigenKey}&user_id=eq.${mitglied.uid}`, 'DELETE', undefined, 'return=minimal'),
    )
  }

  // ---- 6) und dass der legitime Meldeweg offen bleibt ----------------------
  // Seit dem 24.9.2026 schreibt ein Mitglied keine Mitteilung mehr selbst: Es
  // sieht die Planer nicht (members_select) und könnte sie nicht adressieren.
  // Seine Absage geht über `notify_planners` (security definer) an jeden
  // Planer — so wie die App es tut (`notifyPlanners` in data.ts). Bis zum
  // 3.10.2026 maß (6) noch die direkte Zeile, die seither jede Richtlinie
  // abweist, und meldete „ZU STRENG".
  const s6 = await mitglied.rest(
    'rpc/notify_planners',
    'POST',
    { kind: 'verhindert', subject: `${marke} — Absage an die Planer`, message: '' },
    'return=minimal',
  )
  const angekommen6 = await planer.rest(`notifications?select=id&title=like.${marke}*`)
  const e6 = bewerteVersuch(s6.status, zeilenVon(angekommen6).length > 0, true, { leseStatus: angekommen6.status })
  ergebnis(6, 'Absage an die Planer über notify_planners (der legitime Weg)', e6, e6.durch ? 'kommt an' : 'ZU STRENG — Absagen erreichen die Planer nicht mehr')
  for (const z of zeilenVon(angekommen6)) {
    await planer.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
  }
  unaufgeraeumt(angekommen6)

  // ---- 6b) über denselben Weg nur eine Verhinderung -------------------------
  // `notify_planners` schreibt mit den Rechten der Datenbank; was es
  // weiterreicht, entscheidet allein seine eigene Prüfung. Import- und
  // Planmeldungen bleiben Planern vorbehalten (S3/T89).
  const s6b = await mitglied.rest(
    'rpc/notify_planners',
    'POST',
    { kind: 'zuteilung', subject: `${marke} — als Zuteilung über notify_planners`, message: '' },
    'return=minimal',
  )
  const angekommen6b = await planer.rest(`notifications?select=id&title=like.${marke}*`)
  const e6b = bewerteVersuch(s6b.status, zeilenVon(angekommen6b).length > 0, false, {
    leseStatus: angekommen6b.status,
    // Das Urteil ist die Ausnahme der Funktion selbst (P0001). Ein 404, weil
    // es sie nicht gibt, sagt über die Regel nichts.
    urteil: s6b.status < 400 || s6b.daten?.code === 'P0001',
  })
  ergebnis('6b', 'dieselbe Meldung als Art „zuteilung" (nur Admin und Planer)', e6b, e6b.durch ? 'AUCH DAS!' : 'abgewiesen — notify_planners reicht nur Verhinderungen weiter')
  if (e6b.kaputt) console.log(`      Die Datenbank antwortete: ${JSON.stringify(s6b.daten)}`)
  for (const z of zeilenVon(angekommen6b)) {
    await planer.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
  }
  unaufgeraeumt(angekommen6b)

  // ---- 7) S11: Abwesenheit auf eine FREMDE Person -------------------------
  // Der Zweig „die Zeile gehört mir" (`user_id = auth.uid()`) sagte nichts über
  // `person_id` — und die entscheidet, um wen es geht. Kommt das durch, fällt
  // der Betroffene aus jeder Zuteilung, unter seinem Namen, ohne sein Zutun.
  const fremdePid = planer.pid
  if (!fremdePid || fremdePid === mitglied.pid) {
    ungemessen(7, 'Abwesenheit auf eine fremde Person', 'keine zweite Person verknüpft')
  } else {
    const absId = crypto.randomUUID()
    const s7 = await mitglied.rest(
      'absences',
      'POST',
      { id: absId, congregation_id: versammlung, user_id: mitglied.uid, person_id: fremdePid, from_date: '2099-01-01', to_date: '2099-01-02', reason: marke },
      'return=minimal',
    )
    // Nachgesehen wird beim Planer: Er ist der, dem die erfundene Abwesenheit
    // den Betroffenen aus der Zuteilung nimmt.
    const { status: l7, daten: sicht7 } = await planer.rest(`absences?select=id,person_id&id=eq.${absId}`)
    const e7 = bewerteVersuch(s7.status, Boolean(sicht7?.length), false, { leseStatus: l7 })
    ergebnis(7, 'Abwesenheit auf eine fremde Person eintragen', e7, e7.durch ? 'S11 STEHT NOCH OFFEN' : 'abgewiesen — absences_write greift')
    await aufraeumen(e7, () => planer.rest(`absences?id=eq.${absId}`, 'DELETE', undefined, 'return=minimal'))
  }

  // ---- 8) Gegenprobe: die eigene Abwesenheit -----------------------------
  // Ohne sie bewiese (7) nichts. Ein Konto ohne verknüpfte Person schreibt mit
  // `person_id: null` — genau der Fall, für den der erste Zweig noch offen ist.
  const eigeneAbsId = crypto.randomUUID()
  const s8 = await mitglied.rest(
    'absences',
    'POST',
    { id: eigeneAbsId, congregation_id: versammlung, user_id: mitglied.uid, person_id: mitglied.pid, from_date: '2099-01-01', to_date: '2099-01-02', reason: marke },
    'return=minimal',
  )
  const { status: l8, daten: sicht8 } = await mitglied.rest(`absences?select=id&id=eq.${eigeneAbsId}`)
  const e8 = bewerteVersuch(s8.status, Boolean(sicht8?.length), true, { leseStatus: l8 })
  ergebnis(8, `eigene Abwesenheit eintragen (Person ${mitglied.pid ?? 'keine'})`, e8, e8.durch ? 'der Weg steht offen' : 'ZU STRENG — niemand kann sich mehr abmelden')
  await aufraeumen(e8, () => mitglied.rest(`absences?id=eq.${eigeneAbsId}`, 'DELETE', undefined, 'return=minimal'))

  // ---- 9) S13: einen fremden Platz übernehmen, ohne dass Ersatz gesucht ist
  // `take` verlangte Mitgliedschaft und Qualifikation — nicht, dass jemand
  // abgesagt hat. Wer den Dienst kann, konnte damit jeden Platz an sich ziehen.
  const svc = dienst ? dienstAusSchluessel(dienst.key) : null
  const { daten: meinePerson } = mitglied.pid
    ? await mitglied.rest(`persons?select=priv&id=eq.${mitglied.pid}`)
    : { daten: null }
  if (!dienst) {
    ungemessen(9, 'fremden Platz übernehmen', 'kein fremder Hilfsdienst-Platz in der Woche')
  } else if (!mitglied.pid) {
    ungemessen(9, 'fremden Platz übernehmen', 'keine Person mit dem Konto verknüpft')
  } else {
    // Ist das Mitglied für den Dienst nicht freigeschaltet, wiese `take` schon
    // mit „not-qualified" ab, und über S13 wäre nichts gesagt. Dann schaltet die
    // Probe es für die Dauer von (9) frei — wie das Trolley-Recht für (71)–(79)
    // — und stellt danach den vorigen Stand her. In der Testversammlung ist das
    // Mitglied eine Schwester ohne Hilfsdienst; dort blieb (9) am 3.10.2026
    // ungemessen.
    const privVorher = meinePerson?.[0]?.priv ?? {}
    const freischalten = !qualifiziertFuer(meinePerson?.[0], svc)
    const person = `persons?id=eq.${mitglied.pid}`
    const frei = freischalten ? await planer.rest(person, 'PATCH', { priv: { ...privVorher, [`svc:${svc}`]: true } }, 'return=minimal') : { status: 204 }
    try {
      if (frei.status >= 400) {
        ungemessen(9, 'fremden Platz übernehmen', `Freischalten für „${svc}" scheiterte (HTTP ${frei.status})`)
      } else {
        const vorher = dienst.wer
        const a9 = await mitglied.funktion('substitute', { action: 'take', taskKey: dienst.key })
        // Nachgesehen wird an der Woche selbst: Der Statuscode allein genügt nicht,
        // denn geschrieben wird mit Service-Role — ein Fehlschlag danach sähe wie
        // eine Ablehnung aus, während der Platz längst umgeschrieben wäre.
        const { status: l9, daten: w9 } = await planer.rest(`weeks?select=data&start=eq.${wochen[0].start}`)
        const jetzt = fremdeSlots({ ...w9?.[0]?.data, start: wochen[0].start }, mitglied.pid).find((s) => s.key === dienst.key)
        // Ein Urteil über S13 ist allein „not-sought" — abgewiesen, weil niemand
        // abgesagt hat. `forbidden`, `not-qualified`, `slot-taken` oder
        // `bad-request` sagen darüber nichts, auch wenn sie ebenfalls abweisen.
        const e9 = bewerteVersuch(a9.status, jetzt?.wer !== vorher, false, {
          leseStatus: l9,
          urteil: a9.status < 400 || a9.daten?.error === 'not-sought',
        })
        const zusatz = freischalten ? `; für „${svc}" vorübergehend freigeschaltet` : ''
        ergebnis(9, `fremden Platz übernehmen, ohne dass Ersatz gesucht ist (${dienst.wer}${zusatz})`, e9, e9.durch ? 'S13 STEHT NOCH OFFEN' : `abgewiesen (${a9.daten?.error ?? '—'})`)
        if (e9.kaputt) console.log(`      Die Function antwortete: ${JSON.stringify(a9.daten)}`)
        if (e9.durch) console.log(`      Auf dem Platz steht jetzt: ${jetzt?.wer ?? '(leer)'} statt ${vorher}`)
      }
    } finally {
      if (freischalten) {
        const zurueck = await planer.rest(person, 'PATCH', { priv: privVorher }, 'return=minimal')
        if (zurueck.status >= 400) console.log(`      !! Freischaltung für „${svc}" blieb stehen (${zurueck.status}) !!`)
      }
    }
  }

  // ---- 10) S10: Ersatzsuche mit gefälschter Versammlungskennung ------------
  // Doppelt verboten: Das Mitglied steht in diesem Platz nicht und hat für ihn
  // nicht abgesagt. Das angehängte `#` war der Weg, die Prüfung dahin
  // laufen zu lassen — es schnitt die nachfolgenden Filter aus dem REST-Pfad.
  const a10 = await mitglied.funktion('substitute', {
    action: 'seek',
    congregationId: `${versammlung}#`,
    taskKey: ziel.key,
  })
  const nachher10 = await mitglied.rest(`notifications?select=id&title=eq.${encodeURIComponent('Ersatz gesucht')}&user_id=eq.${mitglied.uid}`)
  // Ein Urteil über S10 ist „forbidden": Für diesen Platz darf das Mitglied kein
  // Gesuch führen. `bad-request` hieße dagegen, dass der Schlüssel gar nicht
  // verstanden wurde — so geschah es, wenn die Woche keinen fremden Hilfsdienst
  // hatte und hier ein Programmpunkt ankam; das galt bis zum 26.9.2026 als
  // abgewiesen.
  const e10 = bewerteVersuch(a10.status, a10.status < 400, false, {
    urteil: a10.status < 400 || a10.daten?.error === 'forbidden',
  })
  ergebnis(10, 'Ersatzsuche für einen fremden Platz, Versammlung mit „#" gefälscht', e10, e10.durch ? 'S10 STEHT NOCH OFFEN' : `abgewiesen (${a10.daten?.error ?? '—'})`)
  if (e10.kaputt) console.log(`      Die Function antwortete: ${JSON.stringify(a10.daten)}`)
  if (e10.durch) {
    console.log(`      Die Function hat gearbeitet: ${JSON.stringify(a10.daten)}`)
    for (const z of zeilenVon(nachher10)) {
      await mitglied.rest(`notifications?id=eq.${z.id}`, 'DELETE', undefined, 'return=minimal')
    }
  }

  // ---- 11) bis 34) Die Rechte aus T120 -----------------------------------
  // `anonym` ruft eine Function wie die App ohne Sitzung — für (93).
  const anonym = { mail: 'ohne Anmeldung', funktion: funktionsKlient(z.url, z.anon, z.anon) }
  const k = { planer, mitglied, zuteiler, aufseher, anonym, versammlung, marke, ergebnis, aufraeumen, ungemessen, kaputt }
  await t120Proben(k)

  // ---- 35) bis 70) Die Rechte-Stufen (4.10.2026), Vormerkungen (12.10.) ---
  await stufenProben(k, wochen[0].start)

  // ---- 71) bis 79) Die Trolleys (14.10.2026) ------------------------------
  await trolleyProben(k)

  // ---- 93) bis 110) Das Tauschen (31.10.2026) -----------------------------
  await tauschProben(k)

  // Verboten ist, was nicht durchkommen soll; die übrigen sind die Gegenproben.
  // Bis zum 3.10.2026 standen deren Nummern hier fest (5, 6, 8).
  const verboten = befunde.filter((b) => !b.erwartet)
  const gegenproben = befunde.filter((b) => b.erwartet)
  const durch = verboten.filter((b) => b.durch).length
  const kaputte = befunde.filter((b) => b.kaputt)
  const ueberraschungen = befunde.filter((b) => !b.wieErwartet && !b.kaputt)
  console.log(`\n${durch} von ${verboten.length} verbotenen Versuchen kamen durch.`)
  if (ueberraschungen.length === 0 && kaputte.length === 0) {
    console.log('Genau die erwarteten: S2, S3, S10, S11, S13, die Rechte aus T120, die Rechte-Stufen, die Vormerkungen der')
    console.log(`Vorträge, die Trolleys und das Tauschen sind damit nicht mehr gelesen, sondern gemessen — und die ${gegenproben.length} Gegenproben`)
    console.log('zeigen, dass die Regeln nicht zu streng geraten sind: Bestätigen, Abmelden, Absagen, Ein- und Austragen, Zuteilen,')
    console.log('Tauschen und Sehen gehen weiter.')
    if (nichtGemessen.length) {
      console.log(`Ohne Messung blieben ${nichtGemessen.map((n) => `(${n})`).join(', ')} — die Voraussetzung fehlte.`)
    }
    return
  }
  if (kaputte.length) {
    console.log(`Nicht gemessen — die Probe selbst scheiterte: ${kaputte.map((b) => `(${b.nr})`).join(', ')}. Erst reparieren, dann urteilen.`)
  }
  if (ueberraschungen.length) {
    console.log(`Abweichend von der Erwartung: ${ueberraschungen.map((b) => `(${b.nr})`).join(', ')} — das ist der Blick wert.`)
  }
  process.exitCode = 1
}

alsSkript(import.meta.url, main)
