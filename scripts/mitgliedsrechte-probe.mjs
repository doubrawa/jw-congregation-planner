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
 *  13. eine **andere** Person ins Zeugnisgeben eintragen → abgewiesen
 *  14. sich selbst als „zugeteilt" eintragen            → abgewiesen
 *  15. sich selbst eintragen, mit Aufgabenbereich       → durch
 *  16. dasselbe **ohne** Aufgabenbereich                → abgewiesen
 *  17. einen fremden Zeugnis-Eintrag bestätigen         → abgewiesen
 *  18. den eigenen, zugeteilten bestätigen              → durch
 *  19. denselben mit falschem Montag im Schlüssel       → abgewiesen
 *  20. einen fremden Eintrag löschen                    → abgewiesen
 *  21. den eigenen löschen (Absagen gibt den Platz frei) → durch
 *  28. einen Plan im Entwurf sehen                      → unsichtbar
 *  29. den veröffentlichten Königreichssaal sehen       → sichtbar
 *  33. einen Plan anlegen                               → abgewiesen
 *  34. eine Woche eines Plans selbst besetzen           → abgewiesen
 *
 * (22)–(27) maßen die Redner auswärts, (30)–(32) die Vorlage „Familien
 * reihum" — beides gab es vom 3. bis 4.10.2026. Die Nummern bleiben frei,
 * damit Protokolle und Notizen von damals weiter auf dieselben Fälle zeigen.
 *
 * Anders als (1)–(10) findet die Probe dafür **keinen Bestand** vor: Termine
 * und Pläne gibt es in der Probeversammlung nicht von selbst. Der
 * Planer legt sie an — im Jahr 2099, jede Kennung mit dem Kennzeichen des
 * Laufs —, und am Ende räumt die Probe genau diese Zeilen wieder weg, auch
 * nach einem Fehler mittendrin. **Zwei Dinge ändert sie dafür vorübergehend
 * an der Person des Mitglieds** und stellt sie danach wieder her: den
 * Aufgabenbereich „Öffentliches Zeugnisgeben" (für 15 und 16 in beiden
 * Stellungen) und die Freischaltung für den Hilfsdienst aus (9), wenn sie fehlt.
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
 * Ausgabe „Admin". Der Planer teilt zu, ändert den Plan aber nicht — Wochen
 * schreibt er über die Edge Function `zuteilen`. Der Gruppenaufseher ändert die
 * Treffpunkte seiner Gruppe, keine fremden.
 *
 *  35. Mitglied: eine Woche über `zuteilen` schreiben          → abgewiesen
 *  36. Mitglied: „Plan senden"                                  → abgewiesen
 *  37. Gruppenaufseher: „Plan senden" fürs Zeugnisgeben        → abgewiesen
 *  38. Planer: die Woche am Server vorbei schreiben             → abgewiesen
 *  39. Planer: über `zuteilen` einen Programmpunkt umbenennen   → abgewiesen
 *  40. Planer: über `zuteilen` einen Platz freigeben            → durch
 *  41. Planer: sich selbst zum Admin machen                     → abgewiesen
 *  42. Planer: den Ort eines Treffpunkts ändern                 → abgewiesen
 *  43. Planer: den Leiter eines Treffpunkts setzen              → durch
 *  44. Gruppenaufseher: Ort, Treffpunkt einer fremden Gruppe    → abgewiesen
 *  45. Gruppenaufseher: Leiter, Treffpunkt einer fremden Gruppe → abgewiesen
 *  46. Gruppenaufseher: Ort eines Versammlungstreffpunkts       → abgewiesen
 *  47. Gruppenaufseher: Ort, Treffpunkt der eigenen Gruppe      → durch
 *  48. dasselbe, dazu die nachgetragene Person eines fremden
 *      Leiters (`fsLeiterBinden` beim Laden)                    → durch
 *  49. Mitglied: einen Treffpunkt ändern                        → abgewiesen
 *  50. Planer: eine Regel im Grundplan anlegen                  → abgewiesen
 *  51. Gruppenaufseher: eine Regel für eine fremde Gruppe       → abgewiesen
 *  52. Gruppenaufseher: eine Regel für die eigene Gruppe        → durch
 *  53. Planer: einen Gruppenbesuch verschieben                  → abgewiesen
 *  54. Planer: den Besucher eines Gruppenbesuchs wechseln       → durch
 *  55. Planer: einen Gruppenbesuch anlegen                      → abgewiesen
 *  56. Planer: eine andere Person ins Zeugnisgeben eintragen    → durch
 *  57. Planer: einen Termin des Zeugnisgebens anlegen           → abgewiesen
 *  58. Planer: einen Plan im Entwurf sehen                      → sichtbar
 *  59. Planer: eine Woche eines Plans besetzen                  → durch
 *  60. Planer: einen Plan anlegen                               → abgewiesen
 *  61. Planer: die Absage eines Mitglieds bekommen              → angekommen
 *
 * (35)–(37) zielen ins Leere — eine Woche im Jahr 2100, die es nicht gibt —,
 * damit eine offene Tür nichts verschickt und nichts schreibt; dass die
 * Function dann „keine Woche" meldet, heißt bereits: durchgelassen. Wo ein
 * Versuch an einer **bestehenden** Zeile durchkommt (die Programmwoche, ein
 * Treffpunkt, das eigene Konto des Planers, ein Gruppenbesuch), stellt der
 * Admin sofort den vorigen Stand her. Alles Übrige legt der Admin wieder im
 * Jahr 2099 an, und am Ende geht es weg.
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

import { alsSkript, anfrageKaputt, probeDatei, pruefKlient, verdecktLesen, wertAusEnvDatei } from './gemeinsam.mjs'

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
 * „angekommen" nicht passt — beim Löschen und Ändern (T120).
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

/* ===================== T120: Tage, Schlüssel, Anlage ====================== */

/** Ein Tag `n` Tage nach `iso` — über UTC gerechnet, ohne Sommerzeitsprung. */
export function tagPlus(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Der Wochentag wie `oz_termine.wd` und `extract(dow …)` in Postgres: 0 = Sonntag. */
export function wochentag(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

/**
 * Der Montag der Woche, in der `iso` liegt — der Sonntag gehört zur Woche
 * davor. Spiegel von `montagVon` (meeting-dates.ts) und von
 * `datum - (isodow - 1)` in `task_gehoert_mir`; der Test hält die App-Fassung
 * daneben.
 */
export function montagDerWoche(iso) {
  return tagPlus(iso, -((wochentag(iso) + 6) % 7))
}

/** Der erste Montag ab `iso` — er selbst, wenn er einer ist. */
export function ersterMontagAb(iso) {
  return tagPlus(iso, (8 - wochentag(iso)) % 7)
}

/** Aufgaben-Schlüssel eines Eintrags im Zeugnisgeben — Spiegel von `ozTaskKey`. */
export function ozSchluessel(datum, id) {
  return `oz|${montagDerWoche(datum)}|${id}`
}

/**
 * **Was die Probe für T120 anlegt** — und was das Mitglied zu schreiben
 * versucht. Rein, damit der Test prüfen kann, dass jede Zeile die Regeln der
 * Datenbank erfüllt, die mit den Rechten nichts zu tun haben: Ein Eintrag am
 * falschen Wochentag scheiterte am Trigger (`oz_falscher_tag`), ein zweiter
 * derselben Person in derselben Schicht an der Eindeutigkeit — beides sähe
 * aus wie eine Abweisung und wäre doch keine über die Rechte.
 *
 * Alles liegt in der Woche von `tag0` (ein Montag, 2099) und den drei danach;
 * jede Kennung trägt `marke`, daran findet das Aufräumen genau diese Zeilen.
 * Die Versuche des Mitglieds zielen je auf **eine** Regel: (13) trägt sich
 * mit „selbst" und Aufgabenbereich ein — abweisen kann nur noch die fremde
 * Person; (14) ist die eigene Person, nur ohne „selbst"; (16) beides richtig,
 * nur ohne Aufgabenbereich.
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
  const termin = { id: id('termin'), congregation_id: c, wd: wochentag(tag0), von: '10:00', bis: '12:00', ort: marke, plaetze: 6 }
  const oz = (name, wochen, person, selbst) => ({
    id: id(name), congregation_id: c, termin_id: termin.id, datum: montag(wochen), person_id: person, selbst,
  })
  // Zwei Wochen: Der Versuch des Mitglieds (34) liegt in der zweiten, sonst
  // träfe er den Platz der ersten — und scheiterte an `plan_eintraege_woche`.
  const plan = (name, entwurf) => ({
    id: id(name), congregation_id: c, name: marke, von: tag0, bis: sonntag(1), entwurf,
  })
  const eintrag = (name, planId, datum = montag(0)) => ({
    id: id(name), congregation_id: c, plan_id: planId, datum, grp: gruppe,
  })

  const ozZugeteilt = oz('oz-zugeteilt', 2, mitgliedPid, false)
  const plaene = {
    entwurf: plan('plan-entwurf', true),
    saal: plan('plan-saal', false),
  }
  return {
    besuch: gruppe ? { id: id('besuch'), congregation_id: c, woche: montag(1), grp: gruppe, person_id: planerPid } : null,
    besuchVersuch: gruppe ? { id: id('besuch-mitglied'), congregation_id: c, woche: montag(0), grp: gruppe, person_id: mitgliedPid } : null,
    termin,
    ozFremd: oz('oz-fremd', 0, planerPid, false),
    ozZugeteilt,
    ozFuerAndere: oz('oz-fuer-andere', 1, planerPid, true),
    ozAlsZugeteilt: oz('oz-als-zugeteilt', 1, mitgliedPid, false),
    ozSelbst: oz('oz-selbst', 0, mitgliedPid, true),
    ozOhneBereich: oz('oz-ohne-bereich', 3, mitgliedPid, true),
    // Der eigene Eintrag unter dem Montag einer anderen Woche: dieselbe Art in
    // fremder Schreibweise (`task_gehoert_mir` vergleicht den Montag).
    ozFalscherMontag: ozSchluessel(montag(0), ozZugeteilt.id),
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
    dienstSchluessel:
      Boolean(anon) &&
      (anon.startsWith('sb_secret_') || anon === env.SUPABASE_SERVICE_ROLE_KEY || anon === env.SUPABASE_SECRET_KEY),
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

async function anmelden(url, anon, mail, pass) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: pass }),
  })
  if (!res.ok) throw new Error(`Anmeldung ${mail} fehlgeschlagen (${res.status}): ${await res.text()}`)
  const { access_token: token, user } = await res.json()

  const rest = pruefKlient(url, anon, token)

  /**
   * Eine Edge Function aufrufen — mit dem **Nutzer-Token**, wie die App es tut.
   * Die Function arbeitet intern mit Service-Role; ihre Rechteprüfung hängt
   * also allein daran, wen dieses Token ausweist. Genau das ist die Grenze,
   * die (9) und (10) messen.
   */
  const funktion = async (name, rumpf) => {
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
 * sagt; `prefer` ist für den Upsert (`UPSERT`).
 */
async function schreibVersuch(k, nr, was, tabelle, zeile, erwartet, folge, { wer = k.mitglied, prefer = 'return=minimal' } = {}) {
  const s = await wer.rest(tabelle, 'POST', zeile, prefer)
  const l = await k.planer.rest(`${tabelle}?select=id&id=eq.${zeile.id}`)
  const e = bewerteVersuch(s.status, zeilenVon(l).length > 0, erwartet, { leseStatus: l.status })
  k.ergebnis(nr, was, e, e.durch ? folge[0] : folge[1])
  await k.aufraeumen(e, () => k.planer.rest(`${tabelle}?id=eq.${zeile.id}`, 'DELETE', undefined, 'return=minimal'))
}

/**
 * Ein Löschversuch des Mitglieds — „durch" heißt hier: die Zeile ist weg.
 * PostgREST antwortet auch dann mit 204, wenn RLS die Zeile gar nicht erst
 * zum Löschen freigab; gezählt wird deshalb, was danach noch dasteht.
 */
async function loeschVersuch(k, nr, was, tabelle, id, erwartet, folge) {
  const s = await k.mitglied.rest(`${tabelle}?id=eq.${id}`, 'DELETE', undefined, 'return=minimal')
  const l = await k.planer.rest(`${tabelle}?select=id&id=eq.${id}`)
  const e = bewerteVersuch(s.status, zeilenVon(l).length === 0, erwartet, { leseStatus: l.status, woerter: ['GELÖSCHT', 'nicht gelöscht'] })
  k.ergebnis(nr, was, e, e.durch ? folge[0] : folge[1])
}

/** Eine Bestätigung des Mitglieds — wie (1) und (5), nur auf die Schlüssel aus T120. */
async function bestaetigung(k, nr, was, key, erwartet, folge) {
  const { mitglied, planer, versammlung } = k
  const s = await mitglied.rest(
    'confirmations',
    'POST',
    { congregation_id: versammlung, user_id: mitglied.uid, task_key: key, status: 'bestätigt' },
    'return=minimal',
  )
  const filter = `task_key=eq.${encodeURIComponent(key)}&user_id=eq.${mitglied.uid}`
  const l = await planer.rest(`confirmations?select=status&${filter}`)
  const e = bewerteVersuch(s.status, zeilenVon(l).length > 0, erwartet, { leseStatus: l.status })
  k.ergebnis(nr, was, e, e.durch ? folge[0] : folge[1])
  await k.aufraeumen(e, () => mitglied.rest(`confirmations?${filter}`, 'DELETE', undefined, 'return=minimal'))
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
  const lesen = async () => {
    const r = await k.mitglied.rest(`gruppenbesuche?select=id&id=eq.${a.besuch.id}`)
    return { status: r.status, sichtbar: zeilenVon(r).length > 0 }
  }
  await leseVersuch(k, 12, 'einen Gruppenbesuch sehen, den der Planer angelegt hat', anlage, lesen, true, [
    'die Gruppe erfährt, wann der Dienstaufseher kommt',
    'ZU STRENG — die Gruppe erfährt nicht, wann der Dienstaufseher kommt',
  ])
}

/**
 * (13)–(21) Öffentliches Zeugnisgeben (Phase 3). Eintragen darf sich ein
 * Mitglied nur selbst, nur als „selbst" und nur mit dem Aufgabenbereich;
 * austragen nur sich selbst; bestätigen nur den eigenen Eintrag.
 *
 * Den Aufgabenbereich setzt die Probe für (13)–(15) und nimmt ihn für (16)
 * weg — sonst hinge das Ergebnis daran, wie die Probeversammlung zufällig
 * eingerichtet ist, und eine der beiden Richtungen bliebe ungemessen. Den
 * vorigen Stand stellt `spaeter` wieder her.
 */
async function zeugnisProben(k, a, ich, spaeter) {
  const { planer, mitglied } = k
  const termin = await anlegen(planer, 'oz_termine', [a.termin])
  const eintraege = termin.ok ? await anlegen(planer, 'oz_eintraege', [a.ozFremd, a.ozZugeteilt]) : termin
  const privVorher = ich.priv ?? {}
  const person = `persons?id=eq.${mitglied.pid}`
  spaeter.push(['der Aufgabenbereich des Mitglieds', () => planer.rest(person, 'PATCH', { priv: privVorher }, 'return=minimal')])
  const bereich = async (wert) => {
    const s = await planer.rest(person, 'PATCH', { priv: { ...privVorher, zeugnis: wert } }, 'return=minimal')
    const l = await planer.rest(`persons?select=priv&id=eq.${mitglied.pid}`)
    return s.status < 400 && Boolean(zeilenVon(l)[0]?.priv?.zeugnis) === wert
      ? { ok: true }
      : { ok: false, grund: `Aufgabenbereich nicht ${wert ? 'gesetzt' : 'entfernt'} (HTTP ${s.status}/${l.status})` }
  }

  const mit = termin.ok ? await bereich(true) : termin
  const eintragen = [
    [13, 'eine andere Person ins Zeugnisgeben eintragen', a.ozFuerAndere, false, ['AUCH DAS!', 'abgewiesen — nur die eigene Person']],
    [14, 'sich selbst als „zugeteilt" eintragen', a.ozAlsZugeteilt, false, ['AUCH DAS!', 'abgewiesen — nur als „selbst"']],
    [15, 'sich selbst eintragen, mit Aufgabenbereich', a.ozSelbst, true, ['der Weg steht offen', 'ZU STRENG — niemand kann sich mehr eintragen']],
  ]
  for (const [nr, was, zeile, erwartet, folge] of eintragen) {
    if (mit.ok) await schreibVersuch(k, nr, was, 'oz_eintraege', zeile, erwartet, folge)
    else k.kaputt(nr, was, mit.grund, erwartet)
  }
  const ohne = termin.ok ? await bereich(false) : termin
  const was16 = 'sich selbst eintragen, ohne Aufgabenbereich'
  if (ohne.ok) await schreibVersuch(k, 16, was16, 'oz_eintraege', a.ozOhneBereich, false, ['AUCH DAS!', 'abgewiesen — darf_zeugnis greift'])
  else k.kaputt(16, was16, ohne.grund, false)

  const bestaetigen = [
    [17, 'einen fremden Zeugnis-Eintrag bestätigen', ozSchluessel(a.ozFremd.datum, a.ozFremd.id), false, ['AUCH DAS!', 'abgewiesen — der oz-Zweig in task_gehoert_mir greift']],
    [18, 'den eigenen, zugeteilten Eintrag bestätigen', ozSchluessel(a.ozZugeteilt.datum, a.ozZugeteilt.id), true, ['der Weg steht offen', 'ZU STRENG — Zugeteilte können nicht mehr zusagen']],
    [19, 'denselben, mit falschem Montag im Schlüssel', a.ozFalscherMontag, false, ['AUCH DAS!', 'abgewiesen — der Montag muss zum Tag passen']],
  ]
  for (const [nr, was, key, erwartet, folge] of bestaetigen) {
    if (eintraege.ok) await bestaetigung(k, nr, was, key, erwartet, folge)
    else k.kaputt(nr, was, eintraege.grund, erwartet)
  }

  const loeschen = [
    [20, 'einen fremden Zeugnis-Eintrag löschen', a.ozFremd.id, false, ['AUCH DAS!', 'abgewiesen — austragen nur sich selbst']],
    [21, 'den eigenen löschen (Absagen gibt den Platz frei)', a.ozZugeteilt.id, true, ['der Weg steht offen', 'ZU STRENG — Absagen gibt den Platz nicht mehr frei']],
  ]
  for (const [nr, was, id, erwartet, folge] of loeschen) {
    if (eintraege.ok) await loeschVersuch(k, nr, was, 'oz_eintraege', id, erwartet, folge)
    else k.kaputt(nr, was, eintraege.grund, erwartet)
  }
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
 * Alles wieder weg, was die Probe für T120 angelegt hat — über das
 * Kennzeichen, damit es auch die Zeilen trifft, die gar nicht hätten ankommen
 * sollen. Die Einträge gehen ausdrücklich vor ihrem Termin bzw. Plan, statt
 * sich auf `on delete cascade` zu verlassen: So prüft die Attrappe, die keine
 * Kaskade kennt, das Aufräumen mit. Danach, was `spaeter` gesammelt hat,
 * rückwärts — den Aufgabenbereich des Mitglieds.
 */
async function t120Aufraeumen(k, spaeter) {
  const { planer, mitglied, marke } = k
  const weg = (tabelle) => () => planer.rest(`${tabelle}?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')
  const schritte = [
    ['die Bestätigungen', () => mitglied.rest(`confirmations?user_id=eq.${mitglied.uid}&task_key=like.*${marke}*`, 'DELETE', undefined, 'return=minimal')],
    ['die Plan-Einträge', weg('plan_eintraege')],
    ['die Pläne', weg('plaene')],
    ['die Zeugnis-Einträge', weg('oz_eintraege')],
    ['der Termin', weg('oz_termine')],
    ['die Gruppenbesuche', weg('gruppenbesuche')],
    ...[...spaeter].reverse(),
  ]
  const offen = []
  for (const [was, tun] of schritte) {
    const r = await tun()
    if (r.status >= 400) offen.push(`${was} (HTTP ${r.status})`)
  }
  console.log(
    offen.length
      ? `  !! Nicht aufgeräumt: ${offen.join(', ')} — Kennzeichen ${marke} !!`
      : `  (alles mit Kennzeichen ${marke} wieder entfernt, die Person des Mitglieds wie vorher)`,
  )
}

/**
 * Die Fälle (11)–(34) — siehe Kopf. `k` bringt die beiden Anmeldungen und die
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
    planer.rest(`persons?select=id,priv&id=in.(${mitglied.pid},${planer.pid})`),
    planer.rest('groups?select=id&limit=1'),
  ])
  const ich = zeilenVon(personen).find((p) => p.id === mitglied.pid)
  const planerPerson = zeilenVon(personen).find((p) => p.id === planer.pid)
  if (!ich || !planerPerson) {
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
  const spaeter = []
  try {
    await gruppenbesucheProben(k, a)
    await zeugnisProben(k, a, ich, spaeter)
    await plaeneProben(k, a)
  } finally {
    await t120Aufraeumen(k, spaeter)
  }
}

/* ===================== Rechte-Stufen: die Fälle 35–61 ===================== */

/**
 * Rollen am Vortragsplatz — Spiegel von `REDNER_ROLLEN` samt `rolleBasis` in
 * `supabase/functions/_shared/zuteilen-grenze.ts` („Gastredner · Vers. X"
 * zählt mit). Node lädt die TypeScript-Datei nicht; der Test hält
 * `planAenderung` an `nurZuteilungen` selbst.
 */
const REDNER_ROLLE = /^(Redner|Gastredner|Kreisaufseher)( · |$)/

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
 * **Eine Änderung am Plan** für (38) und (39): Der erste Programmpunkt unter
 * der Woche, dessen Titel nur der Admin setzt, bekommt das Kennzeichen
 * angehängt. Punkte mit einem Redner-Platz fallen aus — deren Thema darf der
 * Planer setzen (`freieTitel`), und die Probe hielte eine offene Tür für eine
 * Lücke. `null`, wenn die Woche keinen solchen Punkt hat.
 */
export function planAenderung(daten, marke) {
  const treffer = punkteUnterDerWoche(daten).find(
    ({ item }) => typeof item?.title === 'string' && !plaetzeVon(item).some((s) => REDNER_ROLLE.test(s?.rolle ?? '')),
  )
  if (!treffer) return null
  const data = structuredClone(daten)
  data.mid.sections[treffer.si].items[treffer.ii].title = `${treffer.item.title} ${marke}`
  return { data, si: treffer.si, ii: treffer.ii }
}

/**
 * **Eine Zuteilung** für (40): Der erste besetzte Platz unter der Woche wird
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
 *   zuteilerPid: string, mitgliedPid: string, eigeneGruppe: string, fremdeGruppe: string
 * }} auftrag
 */
export function stufenAnlage({ marke, versammlung: c, tag0, adminPid, zuteilerPid, mitgliedPid, eigeneGruppe, fremdeGruppe }) {
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
      erwartet: false, folge: ['AUCH DAS!', 'der Planer setzt nur den Leiter'],
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
  const termin = { id: id('termin-stufe'), congregation_id: c, wd: wochentag(tag0), von: '10:00', bis: '12:00', ort: marke, plaetze: 6 }
  const plan = { id: id('plan-stufe'), congregation_id: c, name: marke, von: montag(6), bis: tagPlus(montag(7), 6), entwurf: true }
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
    termin,
    // Eine **andere** Person eintragen, zugeteilt statt selbst — das darf nur,
    // wer zuteilt; am Wochentag des Termins, sonst wiese `oz_falscher_tag` ab.
    ozPlaner: { id: id('oz-planer'), congregation_id: c, termin_id: termin.id, datum: montag(6), person_id: mitgliedPid, selbst: false },
    terminVersuch: { ...termin, id: id('termin-planer') },
    plan,
    planEintrag: { id: id('e-stufe'), congregation_id: c, plan_id: plan.id, datum: montag(6), grp: fremdeGruppe },
    eintragVersuch: { id: id('e-planer'), congregation_id: c, plan_id: plan.id, datum: montag(7), grp: fremdeGruppe },
    planVersuch: { ...plan, id: id('plan-planer'), entwurf: false },
    absage: `${marke} — Absage auch an den Planer`,
  }
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
 * Ein Versuch an der Tür einer Edge Function — (35)–(37). Gezielt wird ins
 * Leere, damit eine offene Tür nichts verschickt und nichts schreibt. Deshalb
 * heißt nicht nur ein 2xx „durchgelassen", sondern auch eine Antwort, die erst
 * **hinter** der Rechteprüfung kommt (`nachDerTuer`, etwa „keine Woche"). Ein
 * Urteil über die Tür ist sonst allein `forbidden`.
 */
async function tuerVersuch(k, nr, was, wer, name, rumpf, nachDerTuer, folge) {
  const a = await wer.funktion(name, rumpf)
  const fehler = a.daten?.error
  const durch = a.status < 400 || nachDerTuer.includes(fehler)
  const e = bewerteVersuch(a.status, durch, false, { urteil: durch || fehler === 'forbidden', woerter: ['DURCHGELASSEN', 'abgewiesen'] })
  k.ergebnis(nr, was, e, e.durch ? 'AUCH DAS!' : `${folge} (${fehler ?? '—'})`)
  if (e.durch || e.kaputt) console.log(`      Die Function antwortete: ${JSON.stringify(a.daten)}`)
}

/**
 * (38)–(41) Die Programmwoche: Der Planer schreibt sie nur über `zuteilen` und
 * ändert dort nur Zuteilungen; sich selbst zum Admin machen kann er nicht.
 * Nach jedem Versuch, der durchkam, stellt der Admin den vorigen Stand her.
 */
async function wochenProben(k, woche) {
  const { planer, zuteiler, versammlung, marke } = k
  const zeile = `weeks?congregation_id=eq.${versammlung}&start=eq.${woche}`
  // Den Stand liest der Planer selbst — so, wie die App ihn beim Laden bekommt.
  const lesen = () => zuteiler.rest(`weeks?select=data,updated_at&start=eq.${woche}`)
  const vorher = await lesen()
  const original = zeilenVon(vorher)[0]?.data
  if (!original) {
    for (const nr of [38, 39, 40]) k.kaputt(nr, `Planer: die Woche ${woche} ändern`, `für den Planer nicht lesbar (HTTP ${vorher.status})`, nr === 40)
  } else {
    const zurueck = () => planer.rest(zeile, 'PATCH', { data: original }, 'return=minimal')
    const beimAdmin = (pruefe) => async () => {
      const r = await planer.rest(`weeks?select=data&start=eq.${woche}`)
      const d = zeilenVon(r)[0]?.data
      return { status: r.status, angekommen: Boolean(d) && pruefe(d), fehlt: r.status < 400 && !d ? 'die Woche ist weg' : null }
    }
    // Der Stand **vor jedem** Aufruf: Kam ein Versuch durch und wurde
    // zurückgestellt, hat die Woche einen neuen — mit dem alten gäbe es 409.
    const stand = async () => zeilenVon(await lesen())[0]?.updated_at
    const nurZuteilen = (s) => s.status < 400 || s.daten?.error === 'nur-zuteilen'

    const plan = planAenderung(original, marke)
    if (!plan) {
      for (const [nr, was] of [[38, 'Planer: die Woche am Server vorbei schreiben'], [39, 'Planer: über „zuteilen" einen Programmpunkt umbenennen']]) {
        k.ungemessen(nr, was, 'kein Programmpunkt mit festem Titel in der Woche')
      }
    } else {
      const umbenannt = (d) => String(d?.mid?.sections?.[plan.si]?.items?.[plan.ii]?.title ?? '').includes(marke)
      await aenderVersuch(k, {
        nr: 38,
        was: 'Planer: die Woche am Server vorbei schreiben (einen Programmpunkt umbenennen)',
        schreiben: () => zuteiler.rest(zeile, 'PATCH', { data: plan.data }, 'return=minimal'),
        nachsehen: beimAdmin(umbenannt),
        zurueck,
        erwartet: false,
        folge: ['AUCH DAS!', 'Wochen schreibt nur der Admin'],
      })
      const s39 = await stand()
      await aenderVersuch(k, {
        nr: 39,
        was: 'Planer: über „zuteilen" einen Programmpunkt umbenennen',
        schreiben: () => zuteiler.funktion('zuteilen', { action: 'woche', woche, stand: s39, data: plan.data }),
        nachsehen: beimAdmin(umbenannt),
        zurueck,
        erwartet: false,
        urteil: nurZuteilen,
        folge: ['AUCH DAS!', 'zuteilen lässt nur Zuteilungen durch'],
      })
    }

    const zuteilung = zuteilungAenderung(original)
    if (!zuteilung) {
      k.ungemessen(40, 'Planer: über „zuteilen" einen Platz freigeben', 'kein besetzter Platz unter der Woche')
    } else {
      const frei = (d) => !d?.mid?.sections?.[zuteilung.si]?.items?.[zuteilung.ii]?.names?.[zuteilung.ni]?.pid
      const s40 = await stand()
      await aenderVersuch(k, {
        nr: 40,
        was: 'Planer: über „zuteilen" einen Platz freigeben',
        schreiben: () => zuteiler.funktion('zuteilen', { action: 'woche', woche, stand: s40, data: zuteilung.data }),
        nachsehen: beimAdmin(frei),
        zurueck,
        erwartet: true,
        urteil: nurZuteilen,
        folge: ['der Weg steht offen', 'ZU STRENG — der Planer kann nicht mehr zuteilen'],
      })
    }
  }

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
 * geschrieben wie in der App per Upsert der ganzen Woche (`saveFsWeek`). Ob
 * ein Versuch ankam, steht danach am Treffpunkt selbst.
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

/** (50)–(52) Der Grundplan: Regeln legt der Admin an — der Gruppenaufseher nur für seine Gruppe. */
async function grundplanProben(k, a) {
  const { zuteiler, aufseher } = k
  const r = a.regeln
  await schreibVersuch(k, 50, 'Planer: eine Regel im Grundplan anlegen', 'fs_rules', r.planer, false, ['AUCH DAS!', 'abgewiesen — den Grundplan pflegt der Admin'], { wer: zuteiler, prefer: UPSERT })
  await schreibVersuch(k, 51, 'Gruppenaufseher: eine Regel für eine fremde Gruppe anlegen', 'fs_rules', r.aufseherFremd, false, ['AUCH DAS!', 'abgewiesen — nur für die eigene Gruppe'], { wer: aufseher, prefer: UPSERT })
  await schreibVersuch(k, 52, 'Gruppenaufseher: eine Regel für die eigene Gruppe anlegen', 'fs_rules', r.aufseherEigen, true, ['der Weg steht offen', 'ZU STRENG — der Gruppenaufseher kann seinen Grundplan nicht pflegen'], { wer: aufseher, prefer: UPSERT })
}

/**
 * (53)–(55) Gruppenbesuche: Den Besucher wechselt der Planer; Woche und Gruppe
 * legt der Admin fest, und anlegen kann der Planer keinen — obwohl er für den
 * Upsert der App einfügen darf (`gruppenbesuche_pruefen`).
 */
async function besuchProben(k, a) {
  const { planer, zuteiler } = k
  const anlage = await anlegen(planer, 'gruppenbesuche', [a.besuch])
  const v = a.besuchVersuche
  const versuche = [
    [53, 'Planer: einen Gruppenbesuch in eine andere Woche verschieben', v.verschoben, 'woche', false, ['AUCH DAS!', 'Woche und Gruppe legt der Admin fest']],
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
  await schreibVersuch(k, 55, 'Planer: einen Gruppenbesuch anlegen', 'gruppenbesuche', v.neu, false, ['AUCH DAS!', 'abgewiesen — anlegen darf nur der Admin'], { wer: zuteiler, prefer: UPSERT })
}

/** (56)–(60) Zeugnisgeben und Weitere Pläne: besetzen darf der Planer, anlegen nur der Admin. */
async function besetzenProben(k, a) {
  const { planer, zuteiler } = k
  const termin = await anlegen(planer, 'oz_termine', [a.termin])
  const was56 = 'Planer: eine andere Person ins Zeugnisgeben eintragen'
  if (termin.ok) {
    await schreibVersuch(k, 56, was56, 'oz_eintraege', a.ozPlaner, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann im Zeugnisgeben nicht zuteilen'], { wer: zuteiler })
  } else k.kaputt(56, was56, termin.grund, true)
  await schreibVersuch(k, 57, 'Planer: einen Termin des Zeugnisgebens anlegen', 'oz_termine', a.terminVersuch, false, ['AUCH DAS!', 'abgewiesen — Termine legt der Admin an'], { wer: zuteiler })

  const plan = await anlegen(planer, 'plaene', [a.plan])
  const anlage = plan.ok ? await anlegen(planer, 'plan_eintraege', [a.planEintrag]) : plan
  await leseVersuch(k, 58, 'Planer: einen Plan im Entwurf sehen', anlage, () => planSicht(zuteiler, a.plan, [a.planEintrag], true), true, [
    'er verteilt die Gruppen, bevor der Admin veröffentlicht',
    'ZU STRENG — der Planer sieht den Entwurf nicht',
  ])
  const was59 = 'Planer: eine Woche eines Plans besetzen'
  if (anlage.ok) {
    await schreibVersuch(k, 59, was59, 'plan_eintraege', a.eintragVersuch, true, ['der Weg steht offen', 'ZU STRENG — der Planer kann keine Gruppen verteilen'], { wer: zuteiler, prefer: UPSERT })
  } else k.kaputt(59, was59, anlage.grund, true)
  await schreibVersuch(k, 60, 'Planer: einen Plan anlegen', 'plaene', a.planVersuch, false, ['AUCH DAS!', 'abgewiesen — Pläne legt der Admin an'], { wer: zuteiler, prefer: UPSERT })
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
 * Alles wieder weg, was die Probe für die Rechte-Stufen angelegt hat — über das
 * Kennzeichen, wie bei T120; die Treffpunkt-Woche nur, wenn sie der Probe
 * gehört. Dazu die Mitteilungen mit dem Kennzeichen beim Planer und beim
 * Admin: auch die aus (6), denn die Absage an die Planer erreicht seit dem
 * 4.10.2026 beide.
 */
async function stufenAufraeumen(k, fsStart, merker) {
  const { planer, zuteiler, marke, versammlung } = k
  const weg = (tabelle) => () => planer.rest(`${tabelle}?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')
  const mitteilungen = (wer) => () => wer.rest(`notifications?title=like.${marke}*`, 'DELETE', undefined, 'return=minimal')
  const schritte = [
    ['die Plan-Einträge', weg('plan_eintraege')],
    ['die Pläne', weg('plaene')],
    ['die Zeugnis-Einträge', weg('oz_eintraege')],
    ['die Termine', weg('oz_termine')],
    ['die Gruppenbesuche', weg('gruppenbesuche')],
    ['die Regeln des Grundplans', weg('fs_rules')],
    ...(merker.treffpunktWoche
      ? [['die Treffpunkt-Woche', () => planer.rest(`fs_weeks?congregation_id=eq.${versammlung}&start=eq.${fsStart}`, 'DELETE', undefined, 'return=minimal')]]
      : []),
    ['die Mitteilungen an den Planer', mitteilungen(zuteiler)],
    ['die Mitteilungen an den Admin', mitteilungen(planer)],
  ]
  const offen = []
  for (const [was, tun] of schritte) {
    const r = await tun()
    if (r.status >= 400) offen.push(`${was} (HTTP ${r.status})`)
  }
  console.log(offen.length ? `  !! Nicht aufgeräumt: ${offen.join(', ')} — Kennzeichen ${marke} !!` : `  (alles mit Kennzeichen ${marke} wieder entfernt)`)
}

/**
 * Die Fälle (35)–(61) — siehe Kopf. Aufgeräumt wird in jedem Fall, auch wenn
 * ein Fall mittendrin wirft.
 */
async function stufenProben(k, woche) {
  const { planer, mitglied, zuteiler, aufseher, versammlung, marke } = k
  console.log('\nDie Rechte-Stufen (seit 4.10.2026; angelegt als Admin, im Jahr 2099):')
  const merker = { treffpunktWoche: false }
  let fsStart = null
  try {
    // Ins Leere: Eine Woche im Jahr 2100 gibt es nicht — eine offene Tür
    // antwortete mit „keine Woche", statt etwas zu schreiben oder zu senden.
    const leer = ersterMontagAb('2100-01-01')
    await tuerVersuch(k, 35, 'Mitglied: eine Woche über „zuteilen" schreiben', mitglied, 'zuteilen', { action: 'woche', woche: leer, stand: marke, data: {} }, ['week-not-found'], 'nur Admin und Planer')
    await tuerVersuch(k, 36, 'Mitglied: „Plan senden"', mitglied, 'send-plan', { action: 'plan', weekStart: leer }, ['no-week'], 'senden nur Admin, Planer und Gruppenaufseher')
    await tuerVersuch(k, 37, 'Gruppenaufseher: „Plan senden" fürs Zeugnisgeben', aufseher, 'send-plan', { action: 'zeugnis' }, [], 'das Zeugnisgeben senden nur Admin und Planer')

    await wochenProben(k, woche)

    const g = await planer.rest('groups?select=id,overseer_id,assistant_id&order=position')
    const wahl = gruppenWahl(zeilenVon(g), { aufseherPid: aufseher.pid, zuteilerPid: zuteiler.pid, mitgliedPid: mitglied.pid })
    const fehlt = !planer.pid || !zuteiler.pid || !mitglied.pid
      ? 'Admin, Planer und Mitglied brauchen je eine Person'
      : g.status >= 400
        ? `die Gruppen sind nicht lesbar (HTTP ${g.status})`
        : !wahl.eigene
          ? 'der Gruppenaufseher leitet keine Gruppe'
          : !wahl.fremde
            ? 'keine Gruppe, die keines der Probekonten leitet'
            : null
    if (fehlt) {
      k.ungemessen('42–61', 'Treffpunkte, Grundplan, Gruppenbesuche, Zeugnisgeben und Pläne der Stufen', fehlt)
      return
    }
    const a = stufenAnlage({
      marke,
      versammlung,
      tag0: ersterMontagAb('2099-01-01'),
      adminPid: planer.pid,
      zuteilerPid: zuteiler.pid,
      mitgliedPid: mitglied.pid,
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
    await stufenAufraeumen(k, fsStart, merker)
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
    // Probe es für die Dauer von (9) frei — wie den Aufgabenbereich in (15)/(16)
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
  const k = { planer, mitglied, zuteiler, aufseher, versammlung, marke, ergebnis, aufraeumen, ungemessen, kaputt }
  await t120Proben(k)

  // ---- 35) bis 61) Die Rechte-Stufen (4.10.2026) --------------------------
  await stufenProben(k, wochen[0].start)

  // Verboten ist, was nicht durchkommen soll; die übrigen sind die Gegenproben.
  // Bis zum 3.10.2026 standen deren Nummern hier fest (5, 6, 8).
  const verboten = befunde.filter((b) => !b.erwartet)
  const gegenproben = befunde.filter((b) => b.erwartet)
  const durch = verboten.filter((b) => b.durch).length
  const kaputte = befunde.filter((b) => b.kaputt)
  const ueberraschungen = befunde.filter((b) => !b.wieErwartet && !b.kaputt)
  console.log(`\n${durch} von ${verboten.length} verbotenen Versuchen kamen durch.`)
  if (ueberraschungen.length === 0 && kaputte.length === 0) {
    console.log('Genau die erwarteten: S2, S3, S10, S11, S13, die Rechte aus T120 und die Rechte-Stufen sind damit')
    console.log(`nicht mehr gelesen, sondern gemessen — und die ${gegenproben.length} Gegenproben zeigen, dass die Regeln`)
    console.log('nicht zu streng geraten sind: Bestätigen, Abmelden, Absagen, Eintragen, Zuteilen und Sehen gehen weiter.')
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
