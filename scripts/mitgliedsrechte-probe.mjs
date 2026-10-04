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
 * der Versammlung. Dort geht es öfter ums **Sehen** als ums Schreiben: Wer bei
 * „Familien reihum" Gastgeber ist, geht nicht die ganze Versammlung an.
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
 *  30. „Familien reihum" ohne eigenen Haushalt          → unsichtbar
 *  31. „Familien reihum" als Gastgeber — ganzer Plan    → sichtbar
 *  32. „Familien reihum", Gastgeber aus dem Haushalt    → sichtbar
 *  33. einen Plan anlegen                               → abgewiesen
 *  34. sich als Gastgeber in einen fremden Plan setzen  → abgewiesen
 *
 * (22)–(27) maßen die Redner auswärts, die es vom 3. bis 4.10.2026 gab. Die
 * Nummern bleiben frei, damit Protokolle und Notizen von damals weiter auf
 * dieselben Fälle zeigen.
 *
 * Anders als (1)–(10) findet die Probe dafür **keinen Bestand** vor: Termine
 * und Pläne gibt es in der Probeversammlung nicht von selbst. Der
 * Planer legt sie an — im Jahr 2099, jede Kennung mit dem Kennzeichen des
 * Laufs —, und am Ende räumt die Probe genau diese Zeilen wieder weg, auch
 * nach einem Fehler mittendrin. **Drei Dinge ändert sie dafür vorübergehend
 * an der Person des Mitglieds** und stellt sie danach wieder her: den
 * Aufgabenbereich „Öffentliches Zeugnisgeben" (für 15 und 16 in beiden
 * Stellungen), die Freischaltung für den Hilfsdienst aus (9), wenn sie fehlt,
 * und — nur, wenn niemand ihren Haushalt teilt — den Haushalt (für 32 zieht
 * sie mit einer Probe-Person in einen Probe-Haushalt).
 *
 * **Jede durchgekommene Zeile wird sofort wieder gelöscht.** Wer aufräumen darf,
 * hängt am Empfänger: `notifications_delete` verlangt `user_id = auth.uid()`,
 * also räumt bei (6) der Planer seine eigene Zeile weg. Deshalb braucht die
 * Probe beide Anmeldungen.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 * Gemessen wird mit dem **anon**-Key plus Anmeldung — wie in
 * `mandanten-nachweis.mjs` und aus demselben Grund: Der Service-Role-Key
 * umgeht RLS, ein Nachweis damit wäre wertlos.
 *
 *   node scripts/testversammlung-anlegen.mjs --wochen 2      (zuerst --trocken)
 *   node scripts/mitgliedsrechte-probe.mjs --versammlung <congregation-id>
 *
 * **Nichts vorher setzen.** URL und anon-Schlüssel stehen in `.env.local`
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), die Konten heißen wie in
 * `testversammlung-anlegen.mjs` (`planer@probe.invalid`,
 * `mitglied@probe.invalid`), und nach den beiden Kennwörtern fragt die Probe
 * — verdeckt. Umgebungsvariablen gehen vor (`SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`, `PROBE_PLANER_MAIL`/`_PASS`,
 * `PROBE_MITGLIED_MAIL`/`_PASS`), etwa für andere Konten oder ohne Terminal.
 *
 * `--versammlung` ist Pflicht und wird gegen beide Konten geprüft. Die Probe
 * **schreibt**, wenn auch nur kurz — sie soll das nicht in der echten
 * Versammlung tun, weil jemand versehentlich sein eigenes Konto einträgt.
 */

import { alsSkript, anfrageKaputt, pruefKlient, verdecktLesen, wertAusEnvDatei } from './gemeinsam.mjs'

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
 * `fremderGastgeber` lebt nicht im Haushalt des Mitglieds — gewöhnlich der
 * Planer, in der Testversammlung aber nicht: Dort sind Planer und Mitglied ein
 * Ehepaar.
 *
 * @param {{
 *   marke: string, versammlung: string, tag0: string,
 *   planerPid: string, mitgliedPid: string, gruppe?: string | null, fremderGastgeber?: string
 * }} auftrag
 */
export function t120Anlage({ marke, versammlung: c, tag0, planerPid, mitgliedPid, gruppe = null, fremderGastgeber = planerPid }) {
  const id = (name) => `${marke}-${name}`
  const montag = (wochen) => tagPlus(tag0, 7 * wochen)
  const sonntag = (wochen) => tagPlus(tag0, 7 * wochen + 6)
  const termin = { id: id('termin'), congregation_id: c, wd: wochentag(tag0), von: '10:00', bis: '12:00', ort: marke, plaetze: 6 }
  const oz = (name, wochen, person, selbst) => ({
    id: id(name), congregation_id: c, termin_id: termin.id, datum: montag(wochen), person_id: person, selbst,
  })
  const plan =(name, vorlage, entwurf) => ({
    id: id(name), congregation_id: c, vorlage, name: marke, von: tag0, bis: sonntag(0), entwurf,
  })
  const eintrag = (name, planId, { grp = null, person = null, mahlzeit = null } = {}) => ({
    id: id(name), congregation_id: c, plan_id: planId, datum: tag0, grp, person_id: person, mahlzeit,
  })

  const ozZugeteilt = oz('oz-zugeteilt', 2, mitgliedPid, false)
  const plaene = {
    entwurf: plan('plan-entwurf', 'saal', true),
    saal: plan('plan-saal', 'saal', false),
    fremd: plan('plan-fremd', 'familien', false),
    eigen: plan('plan-eigen', 'familien', false),
  }
  const haushalt = plan('plan-haushalt', 'familien', false)
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
      entwurf: [eintrag('e-entwurf', plaene.entwurf.id, { grp: gruppe })],
      saal: [eintrag('e-saal', plaene.saal.id, { grp: gruppe })],
      fremd: [eintrag('e-fremd', plaene.fremd.id, { person: fremderGastgeber, mahlzeit: 'mittag' })],
      eigen: [
        eintrag('e-eigen', plaene.eigen.id, { person: mitgliedPid, mahlzeit: 'abend' }),
        // Ein fremder Gastgeber im selben Plan: Wer darin steht, sieht den
        // ganzen Plan — sonst wüsste er nicht, wer an den anderen Tagen dran ist.
        eintrag('e-eigen-andere', plaene.eigen.id, { person: planerPid, mahlzeit: 'mittag' }),
      ],
    },
    haushalt,
    haushaltEintrag: (mitbewohner) => eintrag('e-haushalt', haushalt.id, { person: mitbewohner, mahlzeit: 'abend' }),
    planVersuch: plan('plan-versuch', 'saal', false),
    // Sich selbst zum Gastgeber machen — der Weg, einen fremden Familienplan
    // sichtbar zu machen, wenn das Schreiben offen stünde.
    eintragVersuch: eintrag('e-versuch', plaene.fremd.id, { person: mitgliedPid, mahlzeit: 'abend' }),
  }
}

/* ===================== Zugang ============================================= */

/** Die Konten, wie `testversammlung-anlegen.mjs` sie anlegt — deren Versammlung misst die Probe gewöhnlich. */
export const PROBE_KONTEN = { planer: 'planer@probe.invalid', mitglied: 'mitglied@probe.invalid' }

/**
 * **Woher die Probe ihren Zugang nimmt** — rein, damit der Test es ohne Datei
 * und Terminal prüfen kann. Die Umgebung schlägt die Datei, wie in
 * `gemeinsam.mjs`: URL und anon-Schlüssel stehen im Projekt (`.env.local`,
 * die Namen der App), die Konten heißen wie in `testversammlung-anlegen.mjs`.
 * Kennwörter stehen nirgends — die fragt `zugang()` verdeckt ab.
 *
 * Bis zum 3.10.2026 verlangte die Probe sechs Umgebungsvariablen im selben
 * Fenster: das Muster, an dem am 17.9. fünf Läufe starben und das
 * `zugangsdaten()` seither für alle anderen Skripte abgelöst hat. Am 3.10.
 * scheiterte so auch ihr eigener erster Lauf — an einem Platzhalter im Aufruf.
 *
 * `dienstSchluessel`: Ein Schlüssel, der RLS umgeht, machte jede Messung
 * wertlos — der alte Service-Role-Schlüssel wie der neue `sb_secret_…`.
 */
export function zugangAus(env, ausDatei) {
  const anon = env.SUPABASE_ANON_KEY || ausDatei('VITE_SUPABASE_ANON_KEY')
  return {
    url: env.SUPABASE_URL || ausDatei('VITE_SUPABASE_URL'),
    anon,
    planerMail: env.PROBE_PLANER_MAIL || PROBE_KONTEN.planer,
    mitgliedMail: env.PROBE_MITGLIED_MAIL || PROBE_KONTEN.mitglied,
    planerPass: env.PROBE_PLANER_PASS || '',
    mitgliedPass: env.PROBE_MITGLIED_PASS || '',
    dienstSchluessel:
      Boolean(anon) &&
      (anon.startsWith('sb_secret_') || anon === env.SUPABASE_SERVICE_ROLE_KEY || anon === env.SUPABASE_SECRET_KEY),
  }
}

/** Den Zugang vervollständigen: abbrechen, wo etwas fehlt; Kennwörter verdeckt erfragen. */
async function zugang() {
  const z = zugangAus(process.env, (name) => wertAusEnvDatei(name))
  if (!z.url || !z.anon) {
    console.error('Keine Projekt-URL oder kein anon-Schlüssel — weder SUPABASE_URL/SUPABASE_ANON_KEY gesetzt noch VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in .env.local.')
    process.exit(2)
  }
  if (z.dienstSchluessel) {
    console.error('Der anon-Schlüssel ist ein Dienst-Schlüssel. Der umgeht RLS — die Probe wäre wertlos.')
    process.exit(2)
  }
  for (const [feld, mail] of [['planerPass', z.planerMail], ['mitgliedPass', z.mitgliedMail]]) {
    if (z[feld]) continue
    if (!process.stdin.isTTY) {
      console.error(`Kein Kennwort für ${mail} und kein Terminal zum Fragen — PROBE_PLANER_PASS / PROBE_MITGLIED_PASS setzen.`)
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

  const { status, daten: mitglied } = await rest('members?select=congregation_id,person_id,planner')
  // Ein Fehler hier hieße sonst „in keiner Versammlung" — die falsche Spur.
  if (status >= 400) throw new Error(`${mail}: members nicht lesbar (${status}): ${JSON.stringify(mitglied)}`)
  if (!mitglied?.[0]) throw new Error(`${mail} ist in keiner Versammlung.`)
  return { mail, rest, funktion, uid: user.id, cong: mitglied[0].congregation_id, pid: mitglied[0].person_id, planer: Boolean(mitglied[0].planner) }
}

/* ===================== T120: die Fälle 11–34 ============================== */

/**
 * Als Planer anlegen und nachsehen, ob es dasteht. Ohne das misst ein
 * Lesefall nichts: Eine leere Antwort hieße sonst „unsichtbar", obwohl es die
 * Zeile gar nicht gab.
 */
async function anlegen(planer, tabelle, zeilen) {
  const s = await planer.rest(tabelle, 'POST', zeilen, 'return=minimal')
  if (s.status >= 400) return { ok: false, grund: `Anlage als Planer scheiterte (${tabelle}, HTTP ${s.status})` }
  const l = await planer.rest(`${tabelle}?select=id&id=in.(${zeilen.map((z) => z.id).join(',')})`)
  if (l.status >= 400) return { ok: false, grund: `Anlage nicht nachprüfbar (${tabelle}, HTTP ${l.status})` }
  const da = zeilenVon(l).length
  return da === zeilen.length ? { ok: true } : { ok: false, grund: `Anlage unvollständig (${tabelle}: ${da} von ${zeilen.length})` }
}

/** Ein Schreibversuch des Mitglieds: ohne RETURNING schreiben, beim Planer nachsehen, Angekommenes wegräumen. */
async function schreibVersuch(k, nr, was, tabelle, zeile, erwartet, folge) {
  const s = await k.mitglied.rest(tabelle, 'POST', zeile, 'return=minimal')
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
 * ist schon ein Teil davon; erlaubt heißt: alles — wer in „Familien reihum"
 * steht, soll auch sehen, wer an den anderen Tagen dran ist.
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
 * Jemand aus dem Haushalt des Mitglieds — für (32). Teilt niemand ihn, zieht
 * das Mitglied für die Dauer der Probe mit einer Probe-Person in einen
 * Probe-Haushalt; `spaeter` stellt den Haushalt wieder her und räumt beide weg.
 */
async function mitbewohnerFinden(k, ich, spaeter) {
  const { planer, mitglied, versammlung, marke } = k
  if (ich.fam) {
    const r = await planer.rest(`persons?select=id&fam=eq.${ich.fam}&id=neq.${mitglied.pid}&limit=1`)
    const da = zeilenVon(r)[0]?.id
    if (da) return { pid: da, wie: 'vorhandener Haushalt' }
  }
  const haushalt = crypto.randomUUID()
  const person = crypto.randomUUID()
  const h = await planer.rest('households', 'POST', { id: haushalt, congregation_id: versammlung }, 'return=minimal')
  if (h.status >= 400) return { pid: null, grund: `Probe-Haushalt nicht angelegt (HTTP ${h.status})` }
  spaeter.push(['der Probe-Haushalt', () => planer.rest(`households?id=eq.${haushalt}`, 'DELETE', undefined, 'return=minimal')])
  const p = await planer.rest('persons', 'POST', { id: person, congregation_id: versammlung, fn: 'PROBE', ln: marke, fam: haushalt }, 'return=minimal')
  if (p.status >= 400) return { pid: null, grund: `Probe-Person nicht angelegt (HTTP ${p.status})` }
  spaeter.push(['die Probe-Person', () => planer.rest(`persons?id=eq.${person}`, 'DELETE', undefined, 'return=minimal')])
  // Vor dem Umzug vorgemerkt: Scheitert er halb, stellt das Zurücksetzen trotzdem den alten Stand her.
  spaeter.push(['der Haushalt des Mitglieds', () => planer.rest(`persons?id=eq.${mitglied.pid}`, 'PATCH', { fam: ich.fam ?? null }, 'return=minimal')])
  const u = await planer.rest(`persons?id=eq.${mitglied.pid}`, 'PATCH', { fam: haushalt }, 'return=minimal')
  if (u.status >= 400) return { pid: null, grund: `Mitglied nicht in den Probe-Haushalt gezogen (HTTP ${u.status})` }
  return { pid: person, wie: 'Probe-Haushalt' }
}

/**
 * Ein Gastgeber, der **nicht** im Haushalt des Mitglieds lebt — für (30).
 * Zuerst der Planer; in der Testversammlung sind Planer und Mitglied aber ein
 * Ehepaar (so gemessen am 3.10.2026, (30) blieb ungemessen), dann jemand
 * anderes aus der Versammlung. `wie` sagt, welcher Fall gemessen wird: Haben
 * beide keinen Haushalt, ist es genau der, an dem `null = null` scheitern muss.
 */
async function gastgeberAusserHaus(k, ich, planerPerson) {
  const ausserHaus = (p) => p.id !== k.mitglied.pid && !(ich.fam && p.fam === ich.fam)
  const wie = (p) => (!ich.fam && !p.fam ? 'beide ohne Haushalt' : 'anderer Haushalt')
  if (ausserHaus(planerPerson)) return { pid: planerPerson.id, wie: wie(planerPerson) }
  const r = await k.planer.rest(`persons?select=id,fam&id=neq.${k.mitglied.pid}&order=id&limit=100`)
  const p = zeilenVon(r).find(ausserHaus)
  if (p) return { pid: p.id, wie: wie(p) }
  return { pid: null, grund: r.status >= 400 ? `Personen nicht lesbar (HTTP ${r.status})` : 'alle teilen den Haushalt des Mitglieds' }
}

/**
 * (28)–(34) Weitere Pläne (Phase 5): sehen über `plan_sichtbar` — einen
 * Entwurf nie, den Königreichssaal alle, „Familien reihum" nur die Gastgeber
 * und ihr Haushalt; schreiben nur Planer.
 */
async function plaeneProben(k, a, ich, gast, spaeter) {
  const { planer, mitglied } = k
  const p = a.plaene
  const plaene = await anlegen(planer, 'plaene', [p.entwurf, p.saal, p.fremd, p.eigen])
  const anlage = plaene.ok ? await anlegen(planer, 'plan_eintraege', Object.values(a.eintraege).flat()) : plaene

  await leseVersuch(k, 28, 'einen Plan im Entwurf sehen', anlage, () => planSicht(mitglied, p.entwurf, a.eintraege.entwurf, false), false, [
    'AUCH DAS!',
    'unsichtbar — einen Entwurf sehen nur Planer',
  ])
  await leseVersuch(k, 29, 'den veröffentlichten Königreichssaal sehen', anlage, () => planSicht(mitglied, p.saal, a.eintraege.saal, true), true, [
    'die ganze Versammlung sieht ihn',
    'ZU STRENG — die Versammlung sieht den Saalplan nicht',
  ])
  if (!gast.pid) {
    k.ungemessen(30, '„Familien reihum" ohne eigenen Haushalt', gast.grund)
  } else {
    await leseVersuch(k, 30, `„Familien reihum" ohne eigenen Haushalt (${gast.wie})`, anlage, () => planSicht(mitglied, p.fremd, a.eintraege.fremd, false), false, [
      'AUCH DAS!',
      'unsichtbar — nur Gastgeber und ihr Haushalt',
    ])
  }
  await leseVersuch(k, 31, '„Familien reihum" als Gastgeber — der ganze Plan', anlage, () => planSicht(mitglied, p.eigen, a.eintraege.eigen, true), true, [
    'der Gastgeber sieht, wer an den anderen Tagen dran ist',
    'ZU STRENG — der Gastgeber sieht seinen Plan nicht ganz',
  ])

  const mitbewohner = await mitbewohnerFinden(k, ich, spaeter)
  if (!mitbewohner.pid) {
    k.ungemessen(32, '„Familien reihum", Gastgeber aus dem eigenen Haushalt', mitbewohner.grund)
  } else {
    const eintrag = a.haushaltEintrag(mitbewohner.pid)
    const plan = await anlegen(planer, 'plaene', [a.haushalt])
    const anlage32 = plan.ok ? await anlegen(planer, 'plan_eintraege', [eintrag]) : plan
    await leseVersuch(k, 32, `„Familien reihum", Gastgeber aus dem eigenen Haushalt (${mitbewohner.wie})`, anlage32, () => planSicht(mitglied, a.haushalt, [eintrag], true), true, [
      'der Haushalt sieht mit',
      'ZU STRENG — der Haushalt des Gastgebers sieht den Plan nicht',
    ])
  }

  await schreibVersuch(k, 33, 'einen Plan anlegen', 'plaene', a.planVersuch, false, ['AUCH DAS!', 'abgewiesen — nur Planer'])
  const was34 = 'sich als Gastgeber in einen fremden Plan setzen'
  if (anlage.ok) await schreibVersuch(k, 34, was34, 'plan_eintraege', a.eintragVersuch, false, ['AUCH DAS!', 'abgewiesen — nur Planer'])
  else k.kaputt(34, was34, anlage.grund, false)
}

/**
 * Alles wieder weg, was die Probe für T120 angelegt hat — über das
 * Kennzeichen, damit es auch die Zeilen trifft, die gar nicht hätten ankommen
 * sollen. Die Einträge gehen ausdrücklich vor ihrem Termin bzw. Plan, statt
 * sich auf `on delete cascade` zu verlassen: So prüft die Attrappe, die keine
 * Kaskade kennt, das Aufräumen mit. Danach, was `spaeter` gesammelt hat,
 * rückwärts: erst den Haushalt des Mitglieds zurück, dann Probe-Person und
 * -Haushalt, zuletzt der Aufgabenbereich.
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
  console.log('\nDie Rechte aus T120 (angelegt als Planer, im Jahr 2099):')
  if (!mitglied.pid || !planer.pid || mitglied.pid === planer.pid) {
    k.ungemessen('11–34', 'die Pläne der Versammlung', 'Planer und Mitglied brauchen je eine eigene Person')
    return
  }
  const [personen, gruppen] = await Promise.all([
    planer.rest(`persons?select=id,priv,fam&id=in.(${mitglied.pid},${planer.pid})`),
    planer.rest('groups?select=id&limit=1'),
  ])
  const ich = zeilenVon(personen).find((p) => p.id === mitglied.pid)
  const planerPerson = zeilenVon(personen).find((p) => p.id === planer.pid)
  if (!ich || !planerPerson) {
    k.ungemessen('11–34', 'die Pläne der Versammlung', `die beiden Personen sind nicht lesbar (HTTP ${personen.status})`)
    return
  }
  const gruppe = zeilenVon(gruppen)[0]?.id ?? null
  const gast = await gastgeberAusserHaus(k, ich, planerPerson)
  const a = t120Anlage({
    marke,
    versammlung,
    tag0: ersterMontagAb('2099-01-01'),
    planerPid: planer.pid,
    mitgliedPid: mitglied.pid,
    gruppe,
    // Ohne passenden Gastgeber bleibt (30) ungemessen; der Plan entsteht trotzdem.
    fremderGastgeber: gast.pid ?? planer.pid,
  })
  const spaeter = []
  try {
    await gruppenbesucheProben(k, a)
    await zeugnisProben(k, a, ich, spaeter)
    await plaeneProben(k, a, ich, gast, spaeter)
  } finally {
    await t120Aufraeumen(k, spaeter)
  }
}

/* ===================== Ausführung ========================================= */

/** Exportiert und mit der Aufrufzeile als Parameter — für `schema-probe.test.ts`. */
export async function main(arg = process.argv.slice(2)) {
  const versammlung = arg[arg.indexOf('--versammlung') + 1]
  if (!arg.includes('--versammlung') || !versammlung || versammlung.startsWith('--')) {
    console.error('--versammlung <congregation-id> ist Pflicht. Aufruf siehe Kopf dieser Datei.')
    process.exit(2)
  }
  const z = await zugang()

  const planer = await anmelden(z.url, z.anon, z.planerMail, z.planerPass)
  const mitglied = await anmelden(z.url, z.anon, z.mitgliedMail, z.mitgliedPass)

  for (const k of [planer, mitglied]) {
    if (k.cong !== versammlung) {
      console.error(`${k.mail} gehört zu ${k.cong}, nicht zu ${versammlung}. Abbruch, es wird nichts geschrieben.`)
      process.exit(2)
    }
  }
  if (!planer.planer) {
    console.error(`${planer.mail} ist kein Planer — dann misst (4) nicht die Grenze, sondern nichts.`)
    process.exit(2)
  }
  if (mitglied.planer) {
    console.error(`${mitglied.mail} ist Planer. Gefragt ist, was ein **einfaches** Mitglied darf.`)
    process.exit(2)
  }

  const { daten: cong } = await planer.rest(`congregations?select=name&id=eq.${versammlung}`)
  console.log(`Versammlung: „${cong?.[0]?.name ?? '?'}" ${versammlung}`)
  console.log(`Planer:      ${planer.mail}`)
  console.log(`Mitglied:    ${mitglied.mail} (Person ${mitglied.pid ?? '—'})\n`)

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
  const aufraeumen = async (e, loeschen) => {
    if (!e.durch && !e.vielleichtDurch) return
    const weg = await loeschen()
    console.log(
      weg.status < 400
        ? `      (${e.durch ? 'Zeile wieder gelöscht' : 'vorsorglich aufgeräumt'})`
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
  const was2 = 'eine eigene Aufgabe im Namen des Planers'
  const vorher2 = await planer.rest(`confirmations?select=task_key&user_id=eq.${planer.uid}`)
  const belegt = new Set(zeilenVon(vorher2).map((z) => z.task_key))
  const ziel2 = eigene.find((s) => !belegt.has(s.key))
  if (vorher2.status >= 400) {
    kaputt(2, was2, `Nachsehen vorab scheiterte (HTTP ${vorher2.status})`, false)
  } else if (!ziel2) {
    ungemessen(2, was2, eigene.length ? 'auf jeder steht schon eine Zeile des Planers' : 'KEINE gefunden')
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
  ergebnis(4, 'dieselbe Mitteilung als Typ „zuteilung" (nur Planer)', e4, e4.durch ? 'AUCH DAS!' : 'die Grenze greift hier')
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
  ergebnis('6b', 'dieselbe Meldung als Art „zuteilung" (nur Planer)', e6b, e6b.durch ? 'AUCH DAS!' : 'abgewiesen — notify_planners reicht nur Verhinderungen weiter')
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
  await t120Proben({ planer, mitglied, versammlung, marke, ergebnis, aufraeumen, ungemessen, kaputt })

  // Verboten ist, was nicht durchkommen soll; die übrigen sind die Gegenproben.
  // Bis zum 3.10.2026 standen deren Nummern hier fest (5, 6, 8).
  const verboten = befunde.filter((b) => !b.erwartet)
  const gegenproben = befunde.filter((b) => b.erwartet)
  const durch = verboten.filter((b) => b.durch).length
  const kaputte = befunde.filter((b) => b.kaputt)
  const ueberraschungen = befunde.filter((b) => !b.wieErwartet && !b.kaputt)
  console.log(`\n${durch} von ${verboten.length} verbotenen Versuchen kamen durch.`)
  if (ueberraschungen.length === 0 && kaputte.length === 0) {
    console.log('Genau die erwarteten: S2, S3, S10, S11, S13 und die Rechte aus T120 sind damit nicht')
    console.log(`mehr gelesen, sondern gemessen — und die ${gegenproben.length} Gegenproben zeigen, dass die Regeln`)
    console.log('nicht zu streng geraten sind: Bestätigen, Abmelden, Absagen, Eintragen und Sehen gehen weiter.')
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
