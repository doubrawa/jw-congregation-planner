/**
 * Reiner App-Reducer — portiert die State-Übergänge der Prototyp-Logikklasse
 * (docs/design-handoff). Keine Nebeneffekte: Persistenz übernimmt persist.ts,
 * den Startzustand liefert init.ts, den Provider stellt store.tsx.
 */

import { abwesenheitenVon } from '../data/absence'
import { offenePlaetze } from '../data/offene-plaetze'
import { istVorbei } from '../data/meeting-dates'
import { eigenePerson } from './eigene-person'
import { gesuchKennung } from '../lib/abgelehnte-gesuche'
import { deriveMyFsTasks, fsVerwaisteZusagenAller } from '../data/fs'
import { displayName } from '../data/helpers'
import { FS_LEITER } from '../../supabase/functions/_shared/zuteilungen.ts'
import { localizedWeeks } from '../data/localize'
import { deriveMyTasks, deriveSubstituteReqs } from '../data/planung/aufgaben'
import { sentKey } from '../data/planung/schluessel'
import { entzogeneAller } from '../data/plan-versand'
import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { APP_TO_JW, congAppCode } from '../i18n/langs'
import { type AppAction, type AppState, OHNE_ENTZUG } from './context'
import { sitzung } from './aktionen/sitzung'
import { ansicht } from './aktionen/ansicht'
import { personen } from './aktionen/personen'
import { versammlung } from './aktionen/versammlung'
import { programm } from './aktionen/programm'
import { zuteilen } from './aktionen/zuteilen'
import { predigtdienst } from './aktionen/predigtdienst'
import { plaene } from './aktionen/plaene'
import { zusagen } from './aktionen/zusagen'
import { dropConfirmations } from './aktionen/gemeinsam'
import { vorzulegen } from './vorlegen'

/**
 * myTasks/Ersatzgesuche aus Wochen + Bestätigungen ableiten. `openConfirm`
 * öffnet nach der Hydration das Bestätigungs-Modal, falls offene Aufgaben
 * existieren.
 *
 * Bis zum 2.10.2026 stieg die Ableitung im Demo-Modus aus, und dort standen
 * feste Aufgaben, die mit den Wochen nichts zu tun hatten. Die Entwicklerseite
 * rechnet jetzt wie der Betrieb (`aufgabenAbgeleitet`).
 */
function withDerivedTasks(state: AppState, openConfirm: boolean): AppState {
  const me = eigenePerson(state)
  // Aufgaben-Titel in der Programmsprache des Nutzers ableiten (Sprachvariante
  // der Wochen, falls vorhanden) — Slot-Pfade/Namen sind variantenunabhängig.
  const jwCode = state.lang !== congAppCode(state.congLang) ? APP_TO_JW[state.lang] : undefined
  const weeks = localizedWeeks(state.weeks, jwCode)
  const kennungen = weeks.map((w) => w.start)
  // Wochen, die als Variante in der Sprache des Lesers vorliegen: Deren Titel
  // und Datum gehören in seine Sprache (`aufgabenTp`), wie im Programm.
  const inLesersprache = new Set(weeks.filter((w, i) => w !== state.weeks[i]).map((w) => w.start))
  const markieren = <T extends object>(eintrag: T, key: string): T => {
    const teile = schluesselTeile(key)
    // Nur Plätze einer Zusammenkunft haben Programmtext. Der Treffpunkt
    // rechnet seinen Termin selbst.
    return teile && 'tab' in teile && inLesersprache.has(teile.woche)
      ? { ...eintrag, lesersprache: true as const }
      : eintrag
  }
  // Zusammenkunfts-Aufgaben und Treffpunkt-Leitungen kommen aus zwei getrennten
  // Quellen (`weeks` und `fsWeeks`) und bleiben es auch — sie zählen nicht in
  // dieselbe Auslastung. Für den Nutzer sind es aber beides Aufgaben: ein
  // zugeteilter Treffpunkt-Leiter sah seine Einteilung bisher weder unter
  // „Meine Aufgaben" noch konnte er sie bestätigen.
  const myTasks = me
    ? [
        ...deriveMyTasks(weeks, state.services, displayName(me), state.confirmations, state.congregation.times, me.id),
        ...deriveMyFsTasks(
          state.fsWeeks,
          kennungen,
          displayName(me),
          state.confirmations,
          me.id,
          // Kanonisch deutsch, wie jede Rolle: Sie geht auch in die
          // Verhinderungs-Meldung an die Planer, und die Glocke übersetzt nur
          // Deutsches (`FS_LEADER_WORD`). Hier stand bis zum 3.10.2026 die
          // Rolle in der Sprache des Absagenden — ein deutscher Planer las
          // dann „Field service meeting conductor". Angezeigt wird sie über
          // `aufgabenLabel` ohnehin übersetzt.
          FS_LEITER,
        ),
      ]
        /*
         * Vergangenes fällt heraus (T77). Eine Aufgabe von letzter Woche legte
         * sich beim Öffnen zum Bestätigen vor, stand auf dem Start-Bildschirm
         * als „nächste Aufgabe" (die Liste ist nach Termin sortiert, das
         * Vergangene steht also vorn) und zählte in „noch zu bestätigen" mit.
         * Bestätigen kann man nichts mehr, was vorbei ist.
         *
         * Der Ampel-Punkt im Planen bleibt davon unberührt: Er liest die
         * Zusagen selbst, nicht diese Liste, und gibt dem Planer auch hinterher
         * noch Auskunft darüber, wer nie zugesagt hat.
         */
        .filter((task) => !istVorbei(task.at))
        .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
        .map((task) => markieren(task, task.id))
    : []
  // Einmal für Gesuche und freie Plätze: Die Abwesenheiten über alle Wochen zu
  // legen ist das Teuerste hier, und die Ableitung läuft bei jeder Änderung.
  // Mit `state.weeks`, nicht der Fassung in der Lesersprache: Die Tage sind
  // dieselben, und so teilen Reducer und Bausteine das Ergebnis
  // (`abwesenheitenVon`).
  const abwesend = me ? abwesenheitenVon(state.absences, state.weeks, state.congregation.times) : undefined
  const substituteReqs = me
    ? deriveSubstituteReqs(weeks, state.services, state.confirmations, me, state.congregation.times, abwesend)
        .map((req) => markieren(req, req.key))
        .map((req) => (state.abgelehnteGesuche.includes(gesuchKennung(req)) ? { ...req, abgelehnt: true as const } : req))
    : []
  // Unbesetzte Plätze gesendeter Wochen, die ich übernehmen kann (4.10.2026).
  // Nicht im Blatt beim Öffnen: Ein Angebot ist keine Pflicht wie eine
  // Zuteilung, und ein Gesuch drängt mehr als ein leerer Platz.
  const offen = me
    ? offenePlaetze(weeks, state.services, state.sentLog, me, state.congregation.times, abwesend).map((platz) =>
        markieren(platz, platz.key),
      )
    : []
  return {
    ...state,
    myTasks,
    substituteReqs,
    offenePlaetze: offen,
    // Das Blatt beim Öffnen zeigt beides: unbestätigte Zuteilungen und offene
    // Ersatzgesuche (T69). Ein Gesuch erreichte bis dahin nur, wer von selbst
    // unter „Aufgaben" nachsah oder über einen Push hereinkam — die übrigen
    // erfuhren nie davon. Es ist dieselbe Vorlage, nicht eine zweite Mechanik.
    confirmOpen: (openConfirm || state.confirmOpen) && vorzulegen(myTasks, substituteReqs),
  }
}

/**
 * Aufgaben und Ersatzgesuche aus dem Bestand ableiten, ohne das Blatt
 * vorzulegen.
 *
 * Der Reducer tut das bei jeder Änderung der Rechengrundlage selbst. Von außen
 * gebraucht wird es für einen Startzustand, der nicht über `hydrate`
 * hereinkommt — die Entwicklerseite baut ihren aus den Testdaten.
 */
export function aufgabenAbgeleitet(state: AppState): AppState {
  return withDerivedTasks(state, false)
}

/**
 * Die Zustandsteile, aus denen `withDerivedTasks` rechnet — in der Reihenfolge,
 * in der sie dort vorkommen.
 *
 * Hier stand eine Liste von 33 **Aktionsnamen**, in die sich jede neue Aktion
 * eintragen musste, die eine dieser Quellen anfasst. Das ging schief, sobald
 * jemand es vergaß, und es fiel nicht auf: Der Zustand bleibt gültig, nur eben
 * veraltet. `updateCongregation` fehlte — wer den Tag der Zusammenkunft
 * umstellte, sah in „Meine Aufgaben" weiter den alten, während das Programm
 * daneben schon den neuen zeigte. Ebenso fehlten die Treffpunkt-Aktionen
 * (`fsClear`, `fsInstRemove`, `fsRule*`) und `addAbsence`/`removeAbsence`.
 *
 * Die Frage ist nicht, *welche Aktion* gelaufen ist, sondern *ob sich die
 * Rechengrundlage geändert hat* — und das steht im Zustand selbst. Verglichen
 * wird über die Referenz: Der Reducer kopiert nur, was er ändert, also ist
 * gleiche Referenz gleicher Inhalt.
 */
function ableitungsQuellen(s: AppState): readonly unknown[] {
  return [
    s.personId,
    /*
     * Nicht die ganze Personenliste, sondern **die eigene Person**:
     * `withDerivedTasks` liest aus `persons` nichts als `me`. Mit der Liste
     * hing die Ableitung an jedem fremden Tastenanschlag im
     * Personen-Formular — und die ist teuer: alle geladenen Wochen ablaufen,
     * die Ersatzgesuche neu bilden, und bei abweichender Programmsprache je
     * Woche ein `structuredClone`. Für eine Person, die mit der Aufgabe nichts
     * zu tun hat.
     *
     * Wird jemand **umbenannt**, zieht der Reducer den neuen Namen durch die
     * Wochen (`renameInWeeks`) — `s.weeks` steht darunter und löst dann aus.
     */
    eigenePerson(s),
    s.lang,
    s.congLang,
    s.weeks,
    s.fsWeeks,
    s.services,
    s.confirmations,
    s.congregation.times,
    s.absences,
    // „Plan gesendet" gibt die freien Plätze einer Woche frei (`offenePlaetze`).
    // Heute ändert es sich nur beim Laden — der Wächter verlangt es trotzdem:
    // Was die Ableitung liest, steht hier.
    s.sentLog,
    // „Nein, danke" auf ein Ersatzgesuch: Danach legt das Blatt es nicht mehr
    // vor, und war es das letzte, geht das Blatt zu (`vorzulegen`).
    s.abgelehnteGesuche,
  ]
}

/** Hat die Aktion an einer der Rechengrundlagen gedreht? */
function quellenGeaendert(vorher: AppState, nachher: AppState): boolean {
  const a = ableitungsQuellen(vorher)
  const b = ableitungsQuellen(nachher)
  return a.some((wert, i) => !Object.is(wert, b[i]))
}

export function reducer(state: AppState, action: AppAction): AppState {
  // `hydrate` ist der erste Sonderfall: Es ersetzt den ganzen Bestand — die
  // Zusagen kommen passend mit — und legt beim Öffnen der App zusätzlich das
  // Bestätigungs-Blatt vor, wenn etwas offen ist. Ein Nachladen mitten in der
  // Arbeit nicht: Wer „Später" gesagt hatte, bekam es bis zum 16.10.2026 nach
  // jedem „Plan senden" und jedem Konflikt wieder vorgelegt.
  if (action.type === 'hydrate') return withDerivedTasks(baseReducer(state, action), !action.nachgeladen)
  /*
   * **Ein neuer Tag** ist der zweite (16.10.2026): Vergangenes fällt aus „Meine
   * Aufgaben" (`istVorbei`), aber nur beim Ableiten — und abgeleitet wird,
   * wenn sich eine Quelle ändert. Der Tag ist keine. Eine App, die über Nacht
   * offen blieb, zeigte morgens die gestrige Aufgabe als nächste und zählte sie
   * unter „noch zu bestätigen" mit. Den Anstoß gibt der Provider
   * (`useKalendertag`).
   */
  if (action.type === 'neuerTag') return withDerivedTasks(state, false)
  const gebaut = ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action))
  const next = OHNE_ENTZUG.has(action.type) ? gebaut : ohneEntzogene(state, gebaut)
  return quellenGeaendert(state, next) ? withDerivedTasks(next, false) : next
}

/**
 * **Wem diese Aktion einen Platz genommen hat, von dem er wusste**
 * (`entzogeneAller`), der hat ihn nicht mehr — auch nicht in den Zusagen und im
 * Versand-Tagebuch. `persist.ts` meldet es ihm, und die Function `send-plan`
 * löscht dabei seinen Tagebuch-Eintrag in der Datenbank.
 *
 * Bliebe der Eintrag hier stehen, zählte „Plan senden" ihn bis zum nächsten
 * Laden als schon gemeldet; teilte der Planer ihn zurück und wieder weg, bekäme
 * er ein zweites „zurückgezogen" für einen Platz, von dem er gar nichts mehr
 * wusste. Und eine Zusage, die bliebe, erbte, wer den Platz zurückbekommt.
 *
 * An einer Stelle für alle Wege, wie `ohneVerwaisteTreffpunktZusagen` — bis zum
 * 15.10.2026 räumte allein `setAnlass` die Zusage eines Entzugs selbst ab.
 */
function ohneEntzogene(vorher: AppState, nachher: AppState): AppState {
  const weg = entzogeneAller(vorher, nachher)
  if (weg.length === 0) return nachher
  const tagebuch = weg.map((z) => sentKey(z.key, z.name)).filter((k) => k in nachher.sentLog)
  const sentLog = tagebuch.length > 0 ? { ...nachher.sentLog } : nachher.sentLog
  for (const k of tagebuch) delete sentLog[k]
  return {
    ...nachher,
    confirmations: dropConfirmations(nachher.confirmations, weg.map((z) => z.key)),
    sentLog,
  }
}

/**
 * Zusagen abräumen, deren Treffpunkt jetzt jemand anderes leitet oder an einem
 * anderen Termin liegt (`fsVerwaisteZusagen`).
 *
 * **An einer Stelle für alle Wege**, nicht in jeder Aktion: zuteilen,
 * automatisch zuteilen, leeren, einen Treffpunkt löschen, eine Regel ändern,
 * eine Gruppe entfernen — und was künftig dazukommt. Bei den Zusammenkünften
 * räumt jede Aktion einzeln ab (`dropConfirmations`); bei den Treffpunkten
 * hatte es jede vergessen. Die Frage ist nicht, welche Aktion lief, sondern ob
 * ein Platz jetzt jemand anderem gehört — und das steht im Zustand selbst,
 * wie bei `ableitungsQuellen`. `persist.ts` liest am Unterschied der Zusagen
 * ab, was es in der Datenbank löschen muss — mit dem Schreiben der Woche.
 */
function ohneVerwaisteTreffpunktZusagen(vorher: AppState, nachher: AppState): AppState {
  const keys = fsVerwaisteZusagenAller(vorher.weeks, vorher.fsWeeks, nachher.fsWeeks)
  const confirmations = dropConfirmations(nachher.confirmations, keys)
  return confirmations === nachher.confirmations ? nachher : { ...nachher, confirmations }
}

/**
 * **Die Verteilstelle**: Jede Aktion geht an den Teil, der sie behandelt
 * (`aktionen/*`, je Fachbereich einer). Die Marken stehen je Teil beisammen;
 * TypeScript verengt `action` dabei auf die Aktionen des Teils. Eine Aktion
 * ohne Marke und eine Marke ohne Fall im Teil meldet tsc, eine Aktion mit
 * Fällen in zwei Teilen die Probe `reducer-teile.test.ts`.
 */
function baseReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login':
    case 'sitzungGeprueft':
    case 'welcomeShown':
    case 'logout':
    case 'setNotifs':
    case 'markAllRead':
    case 'clearNotifs':
    case 'mitteilungGelesen':
    case 'hydrate':
    case 'setDataStatus':
    case 'nachladenGescheitert':
    case 'neuerTag':
      return sitzung(state, action)
    case 'navigate':
    case 'sprungZielErreicht':
    case 'prevWeek':
    case 'nextWeek':
    case 'setTab':
    case 'setFsBereich':
    case 'setTheme':
    case 'setAnsicht':
    case 'setFontScale':
    case 'openSlot':
    case 'closeSlot':
    case 'selectPerson':
    case 'openMyTask':
    case 'closeMyTask':
    case 'openAbsage':
    case 'closeAbsage':
    case 'openTausch':
    case 'closeTausch':
    case 'openS89':
    case 'closeS89':
    case 'setLang':
    case 'openLangSheet':
    case 'closeLangSheet':
    case 'setLangSearch':
    case 'openServiceSheet':
    case 'closeServiceSheet':
    case 'closeConfirm':
    case 'showToast':
    case 'hideToast':
      return ansicht(state, action)
    case 'addAbsence':
    case 'removeAbsence':
    case 'removePerson':
    case 'addPerson':
    case 'updatePerson':
    case 'updateMember':
    case 'removeMember':
    case 'linksAusgestellt':
    case 'setFamily':
      return personen(state, action)
    case 'changeServiceCount':
    case 'moveService':
    case 'removeService':
    case 'addService':
    case 'addGroup':
    case 'removeGroup':
    case 'updateGroup':
    case 'updateCongregation':
    case 'changeReminder':
    case 'setReminder':
    case 'toggleReminderRepeat':
    case 'setAuxClass':
    case 'setCongLang':
    case 'addProgLang':
    case 'removeProgLang':
      return versammlung(state, action)
    case 'startImport':
    case 'addImportedWeek':
    case 'mergeWeekAlt':
    case 'stopImport':
    case 'heftBefundeGeprueft':
    case 'anwesenheitSetzen':
    case 'lacMinuten':
    case 'lacRemove':
    case 'togglePartner':
    case 'lacMove':
    case 'lacTitel':
    case 'lacAdd':
    case 'setAbweichung':
    case 'setAnlass':
    case 'setAnlassTermin':
    case 'terminAdd':
    case 'terminUpdate':
    case 'terminRemove':
    case 'setPartThema':
    case 'talkEdit':
    case 'openingSong':
    case 'closingSong':
      return programm(state, action)
    case 'assign':
    case 'autoAssign':
    case 'clearAssignments':
    case 'vortragsplanUebernehmen':
      return zuteilen(state, action)
    case 'fsAutoAssign':
    case 'fsClear':
    case 'fsInstUpdate':
    case 'fsInstRemove':
    case 'fsInstAdd':
    case 'fsRuleAdd':
    case 'fsRuleUpdate':
    case 'fsRuleRemove':
    case 'besuchHinzufuegen':
    case 'besuchEntfernen':
    case 'besuchAendern':
    case 'besuchBesucher':
    case 'besuchUebernehmen':
    case 'trolleyAnlegen':
    case 'trolleyAendern':
    case 'trolleyEntfernt':
    case 'trolleyTermin':
      return predigtdienst(state, action)
    case 'wpPlanAnlegen':
    case 'wpPlanAendern':
    case 'wpPlanLoeschen':
    case 'wpGruppenVerteilen':
    case 'wpEintragSetzen':
      return plaene(state, action)
    case 'persoenlichBescheid':
    case 'tauschAngefragt':
    case 'tauschWeg':
    case 'getauscht':
    case 'confirmAll':
    case 'confirmTask':
    case 'declineTask':
    case 'takeSubstitute':
    case 'gesuchAblehnen':
    case 'platzUebernehmen':
      return zusagen(state, action)
  }
}
