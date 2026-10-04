/**
 * Reiner App-Reducer — portiert die State-Übergänge der Prototyp-Logikklasse
 * (docs/design-handoff). Keine Nebeneffekte: Persistenz übernimmt persist.ts,
 * den Startzustand liefert init.ts, den Provider stellt store.tsx.
 */

import { syncAuxSlots } from '../data/aux-class'
import { buildAbsences } from '../data/absence'
import { eintraegeImZeitraum, eintragSetzen, gruppenVerteilen, planNachDatum } from '../data/weitere-plaene'
import { dienstAusWochenEntfernen, dienstBereichEntfernen, dienstZusagenKeys, ohneDienstZusagen } from '../data/dienste'
import { currentWeekIndex, istVorbei, naechsteZusammenkunft } from '../data/meeting-dates'
import { eigenePerson } from './eigene-person'
import { deriveMyFsTasks, fsAddInst, fsAutoAssign, fsClear, fsDropPersonPid, fsGruppeEntfernen, fsRegelAussetzen, fsRemoveInst, fsRenameLeader, fsSetLeader, fsUpdateInst, fsVerwaisteZusagenAller, genFsWeek, regenFsWeeks } from '../data/fs'
import { displayName, isSong, linkFamily, mtab, aufseherGruppe, unlinkFamily } from '../data/helpers'
import { darfPlanen, erlaubteScreens, themaVon } from '../data/rechte'
import {
  besuchAustragen,
  besuchEintragen,
  besucheInNeueWoche,
  besucheVerteilen,
  besuchsLage,
  besuchStand,
  nachWoche,
} from '../data/gruppenbesuche'
import {
  deriveMyOzTasks,
  ozAb,
  ozAutoAssign,
  ozKannEintragen,
  ozNachDatum,
  ozSchicht,
  ozSchichten,
  ozTaskKey,
  ozTerminText,
  ozVorbei,
  ozWegBeiTagwechsel,
} from '../data/zeugnis'
import { FS_LEITER, OZ_DIENST } from '../../supabase/functions/_shared/zuteilungen.ts'
import { dropPersonPid, renameInWeeks } from '../data/namensbindung'
import { localizedWeeks } from '../data/localize'
import { alsFreitext } from '../i18n/translate'
import {
  aufgabenBezeichnung,
  assignmentsInMeeting,
  assignSlot,
  autoAssignMeeting,
  clearAssignments,
  changedSlotKeys,
  deriveMyTasks,
  deriveSubstituteReqs,
  helperKeyParts,
  itemZusagenKeys,
  wochenIndex,
} from '../data/planning'
import {
  editTalkTheme,
  lacAdd,
  lacMinuten,
  lacMove,
  lacRemove,
  endeAusStartzeit,
  endenNachziehen,
  togglePartner,
  setAbweichung,
  setPartThema,
  setClosingSong,
  setOpeningSong,
} from '../data/meeting-edit'
import { setAnlass, setAnlassTermin } from '../data/anlass'
import { entzogeneZusagen } from '../data/plan-versand'
import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { terminAdd, terminRemove, terminUpdate } from '../data/termine'
import { dict, type Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { APP_TO_JW, congAppCode } from '../i18n/langs'
import type {
  ConfirmationMap,
  FsRule,
  MeetingKey,
  MeetingTab,
  MyTask,
  Notification,
  NotificationType,
  OzEintrag,
  OzTermin,
  Person,
  Screen,
  SubstituteReq,
  Week,
} from '../data/types'
import type { AppAction, AppState } from './context'

/** Nächster Toast (id erzwingt Timer-/Animations-Neustart bei gleichem Text). */
function nextToast(state: AppState, text: string): AppState['toast'] {
  return { id: (state.toast?.id ?? 0) + 1, text }
}

/**
 * Schlüssel der Slots, die sich zwischen zwei Wochenständen geändert haben —
 * und eine leere Liste, wenn es die Zusammenkunft an dieser Stelle nicht gibt.
 * Nichts zu vergleichen heißt nichts abzuräumen (T42).
 */
function geaenderteSlots(
  vorher: Week[],
  nachher: Week[],
  wi: number,
  tab: MeetingKey,
  services: AppState['services'],
): string[] {
  const a = vorher[wi]?.[tab]
  const b = nachher[wi]?.[tab]
  // Die Kennung kommt aus der Woche selbst (T66) — der Index taugt dafuer nicht.
  const woche = nachher[wi]?.start ?? ''
  return a && b ? changedSlotKeys(a, b, services, woche, tab) : []
}

/** Toast aus einem übersetzten UI-Schlüssel (Reducer kennt state.lang). */
function toastKey(
  state: AppState,
  key: keyof Dict,
  params?: Record<string, string | number>,
): AppState['toast'] {
  return nextToast(state, fill(dict(state.lang)[key], params ?? {}))
}

function makeNotif(
  type: NotificationType,
  title: string,
  text: string,
  taskId?: string,
): Notification {
  // `local`: hier entstanden, also noch zu verteilen (siehe persist.ts).
  return { id: crypto.randomUUID(), type, title, text, at: new Date().toISOString(), read: false, taskId, local: true }
}

/** Neue Mitteilung vorne anfügen. */
function pushNotif(
  notifs: Notification[],
  type: NotificationType,
  title: string,
  text: string,
): Notification[] {
  return [makeNotif(type, title, text), ...notifs]
}

/*
 * Hier stand `zuteilungsNotif` — eine Mitteilung „Zuteilung gesendet" bei jedem
 * einzelnen Zuteilungsklick, adressiert an die **Planer** (T99).
 *
 * Sie ist ersatzlos entfallen, und zwar aus zwei Gründen. Erstens ging sie an
 * den Falschen: Die eingeteilte Person erfuhr nichts, der Planer bekam die
 * Meldung über seine eigene Handlung, die er als Toast gerade quittiert hatte.
 * Zweitens war es zu viel — eine Woche hat gut 35 Plätze, von Hand geteilt also
 * 35 Zeilen in der Glocke jedes Planers; das Ladefenster von 50 war nach
 * anderthalb Wochen voll und verdrängte alles andere, die eigenen Erinnerungen
 * eingeschlossen.
 *
 * An ihre Stelle tritt „Plan senden" (`PlanSendenPanel` → Edge Function
 * `send-plan`): eine Nachricht je **eingeteilter Person**, wenn der Plan steht.
 * Was der Planer über den Stand seiner Woche wissen muss, steht ohnehin im
 * Planen-Screen — Konflikte, offene Plätze, Engpässe und der Ampel-Punkt an
 * jedem besetzten Platz. Dafür braucht es keine Nachricht.
 *
 * Mit ihr entfiel der Schalter `reminders.onAssign`, der nichts anderes
 * steuerte.
 */

/**
 * Beim Anlegen abgebrochene Personen (komplett ohne Namen) werden beim
 * Verlassen des Details automatisch wieder entfernt — sonst blieben durch das
 * Auto-Speichern leere Einträge in der Liste stehen.
 */
export function isNameless(p: Person): boolean {
  return !`${p.fn}${p.ln}`.trim()
}

function dropNamelessSelected(state: AppState): AppState {
  const sel = state.selectedPersonId
  if (!sel) return state
  const person = state.persons.find((p) => p.id === sel)
  if (!person || !isNameless(person)) return state
  return { ...state, persons: state.persons.filter((p) => p.id !== sel) }
}

/** Bestätigungs-Status der angegebenen Slots aus der Map entfernen. */
function dropConfirmations(map: ConfirmationMap, keys: string[]): ConfirmationMap {
  if (keys.length === 0 || keys.every((k) => !(k in map))) return map
  const next = { ...map }
  for (const k of keys) delete next[k]
  return next
}

/**
 * Die Kennungen der geladenen Wochen (ihre Montage, T66) — die Treffpunkt-
 * Wochen liegen parallel dazu und werden darüber materialisiert.
 */
function wochenKennungen(state: Pick<AppState, 'weeks'>): string[] {
  return state.weeks.map((w) => w.start)
}

/** Anzeigename des eingeloggten Nutzers. */
function currentUserName(state: AppState): string {
  const me = eigenePerson(state)
  return me ? displayName(me) : ''
}

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
    // Nur Plätze einer Zusammenkunft haben Programmtext. Treffpunkt und
    // Zeugnisgeben rechnen ihren Termin selbst.
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
        // Öffentliches Zeugnisgeben (T120): aus demselben Grund kanonisch
        // (`OZ_WORD`).
        ...deriveMyOzTasks(state.ozTermine, state.ozEintraege, me.id, state.confirmations),
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
  const substituteReqs = me
    ? deriveSubstituteReqs(
        weeks,
        state.services,
        state.confirmations,
        me,
        state.congregation.times,
        buildAbsences(state.absences, weeks, state.congregation.times),
      )
        .filter((req) => !istVorbei(req.at)) // niemand springt für gestern ein
        .map((req) => markieren(req, req.key))
    : []
  return {
    ...state,
    myTasks,
    substituteReqs,
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
 * Die Reiter, von denen ein stilles Nachladen auf die nächste Zusammenkunft
 * springen darf: die beiden Zusammenkünfte und ihr Bearbeiten. Alle übrigen —
 * Treffpunkte, Weitere Pläne — bleiben stehen.
 *
 * **Positiv aufgezählt.** Bis zum 3.10.2026 stand hier die Gegenliste, und jede
 * Phase von T120 musste sich selbst darin eintragen (fs, va, wp). Ein neuer
 * Reiter ist jetzt von selbst geschützt; wer ihn springen lassen will, muss es
 * hier sagen.
 */
const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit'])

/**
 * Woche und Reiter auf die nächste Zusammenkunft setzen (T82) — es sei denn,
 * der Nutzer hat in dieser Sitzung schon selbst gewählt.
 *
 * Gibt es keine nächste (keine Wochen geladen, alle Termine vorbei), bleibt
 * alles stehen: eine Ansicht auf gut Glück zu verschieben wäre schlechter als
 * die, auf der man ist.
 *
 * Die Treffpunkte bleiben unangetastet: Wer im Predigtdienst ist, meint ihn und
 * keine Zusammenkunft. Bis T120 stand das nur beim Navigieren — dorthin kam man
 * damals ohnehin nur über den Reiter, also mit eigener Wahl. Seit das Menü ohne
 * sie hinführt, warf das Nachladen (etwa nach „Plan senden") mitten in der
 * Arbeit in die Zusammenkünfte. Ebenso die Weiteren Pläne (Phase 5), zu denen
 * das Menü ohne Wahl führt.
 */
function zurNaechstenZusammenkunft(state: AppState): AppState {
  if (state.terminGewaehlt || !NACHLADEN_DARF_SPRINGEN.has(state.tab)) return state
  const naechste = naechsteZusammenkunft(state.weeks, state.congregation.times)
  return naechste ? { ...state, week: naechste.wi, tab: naechste.tab } : state
}

/**
 * Der Reiter, wenn man vom Predigtdienst zu den Zusammenkünften wechselt
 * (T120): die nächste Zusammenkunft, sofern sie in der gezeigten Woche liegt —
 * sonst die unter der Woche. Die Woche selbst bleibt; wer eine gewählt hat, will
 * in ihr bleiben.
 */
function zusammenkunftDerWoche(state: AppState): MeetingKey {
  const naechste = naechsteZusammenkunft(state.weeks, state.congregation.times)
  return naechste && naechste.wi === state.week ? naechste.tab : 'mid'
}

/**
 * Gibt es beim Öffnen etwas vorzulegen? (Bestätigung Pflicht, Einspringen
 * freiwillig.)
 *
 * Eine Stelle für beide Seiten: Der Reducer entscheidet damit, ob `confirmOpen`
 * gesetzt bleibt, und die Hülle, ob sie das Blatt zeigt. Zwei Bedingungen, die
 * dasselbe meinen, laufen früher oder später auseinander — dann steht ein
 * leeres Blatt da oder ein volles bleibt weg.
 */
export function vorzulegen(myTasks: MyTask[], substituteReqs: SubstituteReq[]): boolean {
  return myTasks.some((t) => t.status === 'offen') || substituteReqs.length > 0
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
    s.ozTermine,
    s.ozEintraege,
    s.services,
    s.confirmations,
    s.congregation.times,
    s.absences,
  ]
}

/** Hat die Aktion an einer der Rechengrundlagen gedreht? */
function quellenGeaendert(vorher: AppState, nachher: AppState): boolean {
  const a = ableitungsQuellen(vorher)
  const b = ableitungsQuellen(nachher)
  return a.some((wert, i) => !Object.is(wert, b[i]))
}

export function reducer(state: AppState, action: AppAction): AppState {
  // `hydrate` ist der einzige Sonderfall: Es ersetzt den ganzen Bestand — die
  // Zusagen kommen passend mit — und legt zusätzlich das Bestätigungs-Blatt
  // vor, wenn etwas offen ist.
  if (action.type === 'hydrate') return withDerivedTasks(baseReducer(state, action), true)
  const next = ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action))
  const bereinigt = ohneVerwaisteZeugnisZusagen(state, next)
  return quellenGeaendert(state, bereinigt) ? withDerivedTasks(bereinigt, false) : bereinigt
}

/**
 * Zusagen abräumen, deren Eintrag im öffentlichen Zeugnisgeben es nicht mehr
 * gibt — aus demselben Grund wie bei den Treffpunkten **an einer Stelle für
 * alle Wege**: austragen, absagen, leeren, einen Termin streichen oder
 * verlegen, eine Person löschen.
 *
 * Einfacher als dort: Der Schlüssel trägt die Kennung des **Eintrags**, und
 * ein Eintrag gehört genau einer Person. Wer neu auf den Platz kommt, bekommt
 * einen neuen Eintrag und damit einen neuen Schlüssel — erben kann er nichts,
 * es bleibt nur der alte abzuräumen. `persist.ts` löscht ihn in der Datenbank
 * (`verfalleneZusagen`).
 */
function ohneVerwaisteZeugnisZusagen(vorher: AppState, nachher: AppState): AppState {
  if (vorher.ozEintraege === nachher.ozEintraege) return nachher
  const bleibt = new Set(nachher.ozEintraege.map((e) => e.id))
  const keys = vorher.ozEintraege.filter((e) => !bleibt.has(e.id)).map(ozTaskKey)
  const confirmations = dropConfirmations(nachher.confirmations, keys)
  return confirmations === nachher.confirmations ? nachher : { ...nachher, confirmations }
}

/** Die Einträge, die zu einer Liste neuer hinzukommen — sortiert wie im Zustand. */
function ozMit(state: AppState, neu: readonly OzEintrag[]): OzEintrag[] {
  return ozNachDatum([...state.ozEintraege, ...neu])
}

/** Eine neue Kennung für einen Eintrag — eindeutig und lesbar, wie bei den Besuchen. */
function neueEintragId(): string {
  return `e${crypto.randomUUID()}`
}

/**
 * Ein **eigener** Eintrag im öffentlichen Zeugnisgeben wird abgesagt — aus
 * „Meine Aufgaben" (`declineTask`) wie aus der Ansicht (`ozAustragen`).
 *
 * **Der Platz wird frei**, statt als „verhindert" stehen zu bleiben: Andere
 * können sich sofort eintragen, und genau das ist hier der Ersatz. Die Planer
 * erfahren es wie bei jeder Verhinderung (`notify_planners`) — kanonisch
 * deutsch und **mit dem Termin**: Bei einem Dutzend Schichten im Monat
 * wüssten sie mit „Öffentliches Zeugnisgeben — Name" allein nicht, welche.
 */
function ozAbsage(state: AppState, eintrag: OzEintrag): AppState {
  const termin = state.ozTermine.find((t) => t.id === eintrag.terminId)
  const was = termin ? `${OZ_DIENST} · ${ozTerminText(eintrag.datum, termin)}` : OZ_DIENST
  const notif = makeNotif('verhindert', 'Verhinderung gemeldet', `${was} — ${alsFreitext(currentUserName(state))}`)
  return {
    ...state,
    ozEintraege: state.ozEintraege.filter((e) => e !== eintrag),
    notifs: [notif, ...state.notifs],
    myTaskId: null,
    toast: toastKey(state, 'toastOzAbgesagt'),
  }
}

/**
 * Zusagen abräumen, deren Treffpunkt jetzt jemand anderes leitet
 * (`fsVerwaisteZusagen`).
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

function baseReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login':
      return {
        ...state,
        screen: 'start',
        confirmOpen: vorzulegen(state.myTasks, state.substituteReqs),
        welcomePending: action.welcome === true,
      }
    case 'welcomeShown':
      return { ...state, welcomePending: false }
    case 'logout':
      return {
        ...state,
        screen: 'login',
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
        svcSheet: null,
        // Neue Sitzung: Programm und Planen öffnen wieder mit der nächsten
        // Zusammenkunft, nicht mit dem Reiter des Vorgängers am selben Gerät.
        // Auch der Reiter selbst: Den Predigtdienst lässt das Nachladen stehen
        // (`zurNaechstenZusammenkunft`), der Nächste erbte ihn sonst.
        tab: 'mid',
        terminGewaehlt: false,
        planModus: false,
        fsBereich: 'treffpunkte',
        sprungZiel: null, // ein Sprung aus einem Push gehört zur Sitzung, die ihn bekam
        s89: null,
        confirmOpen: false,
        recovery: false,
        staleAt: null, // Offline-Stand gilt nur für die abgemeldete Sitzung
        welcomePending: false, // eine offene Begrüßung gilt nicht für die nächste Anmeldung
      }
    case 'navigate': {
      // Rechteprüfung: Wer den Bildschirm nicht sehen darf, landet im Programm.
      // Dieselbe Liste bestückt die Navigation (AppShell) — eine Antwort, zwei
      // Fragesteller.
      const fsOverseer =
        aufseherGruppe(state.planner, state.groups, state.personId) !== null
      const erlaubteZiele = erlaubteScreens(state.planner, fsOverseer)
      let screen: Screen = erlaubteZiele.includes(action.screen) ? action.screen : 'programm'
      // Ein Thema des Menüs bringt seinen Reiter mit (T120); ohne Thema bleibt
      // der bisherige. Zurück zu den Zusammenkünften geht es aus jedem Reiter
      // eines anderen Themas — gefragt über `themaVon`, nicht über eine Liste,
      // in die sich jedes neue Thema eintragen müsste.
      let wunsch: MeetingTab =
        action.thema === 'predigtdienst'
          ? 'fs'
          : action.thema === 'weitere'
            ? 'wp'
            : action.thema === 'zusammenkuenfte' && themaVon(state.tab) !== 'zusammenkuenfte'
              ? zusammenkunftDerWoche(state)
              : state.tab
      // Planen nur, wo man planen darf (T120). Der Gruppenaufseher plant allein
      // Treffpunkte: Ein Sprung nach Planen ohne Thema (Push, Start-Bildschirm)
      // zeigt ihm deshalb den Predigtdienst — so war es schon vorher, als
      // `PlanenScreen` ihm nur die Treffpunkte zeigte. Wählt er ausdrücklich die
      // Zusammenkünfte, sieht er sie an.
      if (screen === 'planen' && !darfPlanen(state.planner, fsOverseer, themaVon(wunsch))) {
        if (action.thema === undefined) wunsch = 'fs'
        else screen = 'programm'
      }
      // Drei Tabs sind keine Zusammenkunft und nicht überall erlaubt:
      // „Treffpunkte" und „Weitere Pläne" (T120) gibt es in Programm und
      // Planen, „Bearbeiten" (T64) **nur** im Planen — das Programm ist für alle
      // nur lesend. Beim Wechsel woandershin auf die Zusammenkunft unter der
      // Woche zurücksetzen, sonst stünde die Ansicht auf einem Reiter, den es
      // dort nicht gibt. Die beiden Zusammenkünfte stehen nicht in der Liste —
      // sie gibt es überall.
      const erlaubt: Partial<Record<MeetingTab, boolean>> = {
        fs: screen === 'programm' || screen === 'planen',
        edit: screen === 'planen',
        wp: screen === 'programm' || screen === 'planen',
      }
      const tab: MeetingTab = erlaubt[wunsch] === false ? 'mid' : wunsch
      const nachher = {
        ...dropNamelessSelected(state),
        screen,
        tab,
        // Merkt sich, ob zuletzt geplant wurde — die Themen im Menü öffnen
        // dann wieder dort (T120). Andere Bildschirme ändern daran nichts, und
        // ebenso wenig das Ansehen eines Themas, das man gar nicht planen darf:
        // Der Gruppenaufseher, der zwischendurch die Zusammenkünfte ansieht,
        // hat das Planen damit nicht verlassen.
        planModus:
          screen === 'planen'
            ? true
            : screen === 'programm' && darfPlanen(state.planner, fsOverseer, themaVon(tab))
              ? false
              : state.planModus,
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
        // Ein Bereich zum Hinspringen (T109) gilt nur, wenn der Screen auch
        // erreicht wird; jede Navigation ohne einen räumt den alten ab.
        sprungZiel: action.abschnitt && screen === action.screen ? action.abschnitt : null,
      }
      /*
       * **Eine bestimmte Woche** (Planungs-Karte des Start-Bildschirms, T95).
       *
       * Nur, wenn das Ziel auch erreicht wird: Ein abgewiesener Sprung landet im
       * Programm, und dort gilt die gewünschte Woche nicht — sie war für Planen
       * gemeint. Die Ansicht wird wie oben geprüft; „Bearbeiten" gibt es im
       * Programm nicht.
       *
       * Das ist eine Wahl wie das Blättern (`terminGewaehlt`): Wer auf eine Woche
       * tippt, will sie sehen und nicht auf die nächste Zusammenkunft springen.
       */
      if (action.woche && screen === action.screen) {
        const gewaehlt = action.woche.tab
        const wocheTab: MeetingTab = erlaubt[gewaehlt] === false ? 'mid' : gewaehlt
        return {
          ...nachher,
          week: Math.min(Math.max(0, action.woche.wi), Math.max(0, state.weeks.length - 1)),
          // Auch hier nur planen, wo man planen darf — der Gruppenaufseher die Treffpunkte.
          tab:
            screen === 'planen' && !darfPlanen(state.planner, fsOverseer, themaVon(wocheTab))
              ? 'fs'
              : wocheTab,
          terminGewaehlt: true,
        }
      }
      // Programm und Planen öffnen mit der nächsten Zusammenkunft (T82) —
      // solange der Nutzer nicht selbst gewählt hat und nicht im Predigtdienst
      // ist (siehe `zurNaechstenZusammenkunft`).
      const zeigtZusammenkunft = screen === 'programm' || screen === 'planen'
      return zeigtZusammenkunft ? zurNaechstenZusammenkunft(nachher) : nachher
    }
    case 'sprungZielErreicht':
      return state.sprungZiel === null ? state : { ...state, sprungZiel: null }
    case 'prevWeek':
      return { ...state, week: Math.max(0, state.week - 1), terminGewaehlt: true }
    case 'nextWeek':
      return {
        ...state,
        week: Math.min(state.weeks.length - 1, state.week + 1),
        terminGewaehlt: true,
      }
    case 'setTab':
      // Eine eigene Wahl — ab jetzt springt die Ansicht nicht mehr (T82).
      return { ...state, tab: action.tab, terminGewaehlt: true }
    case 'setFsBereich':
      return state.fsBereich === action.bereich ? state : { ...state, fsBereich: action.bereich }
    case 'setTheme':
      return { ...state, theme: action.theme }
    case 'setFontScale':
      return { ...state, fontScale: action.scale }
    case 'openNotifs':
      return { ...state, notifOpen: true }
    case 'closeNotifs':
      return { ...state, notifOpen: false }
    case 'setNotifs':
      return { ...state, notifs: action.notifs }
    case 'markAllRead':
      return { ...state, notifs: state.notifs.map((n) => ({ ...n, read: true })) }
    case 'clearNotifs':
      return { ...state, notifs: [] }
    case 'openSlot':
      return { ...state, slotSel: action.sel }
    case 'closeSlot':
      return { ...state, slotSel: null }
    case 'addAbsence':
      return {
        ...state,
        absences: [...state.absences, action.absence],
        toast: toastKey(state, 'toastAbwAdd'),
      }
    case 'removeAbsence':
      return {
        ...state,
        absences: state.absences.filter((a) => a.id !== action.id),
        toast: toastKey(state, 'toastAbwDel'),
      }
    case 'selectPerson':
      return { ...dropNamelessSelected(state), selectedPersonId: action.id }
    case 'removePerson': {
      // Person löschen: Referenzen lösen (Gruppenleitung, Konto, offene
      // Codes); Namen in bereits geplanten Wochen bleiben als Text stehen.
      //
      // **Die `pid` muss dabei weg** (T38): sie ist ein Fremdschlüssel, und
      // ohne Ziel zeigt sie ins Leere. `gehoertZu` entscheidet über die Id,
      // fände niemanden mehr, und der Slot zählte nirgends — weder in der
      // Auslastung noch in den Konflikten noch in den Aufgaben. Ohne Id greift
      // wieder der Namensweg; legt der Planer dieselbe Person neu an, findet
      // `pidsNachtragen` sie beim nächsten Laden wieder.
      return {
        ...state,
        weeks: dropPersonPid(state.weeks, action.id),
        fsWeeks: fsDropPersonPid(state.fsWeeks, action.id),
        persons: state.persons.filter((p) => p.id !== action.id),
        // Ihre Abwesenheiten gehen mit: Eine Abwesenheit ohne Person gehört
        // niemandem (`absence.ts`), und mit toter Id stünde sie hier bis zum
        // nächsten Laden herum (T118). Die Datenbank räumt `persist.ts`.
        absences: state.absences.filter((a) => a.personId !== action.id),
        groups: state.groups.map((g) => ({
          ...g,
          overseerId: g.overseerId === action.id ? null : g.overseerId,
          assistantId: g.assistantId === action.id ? null : g.assistantId,
        })),
        // Ein Gruppenbesuch verliert seinen Besucher, nicht sich selbst — wie
        // die Datenbank (`on delete set null`). Der Plan zeigt ihn dann ohne
        // Besucher, und der Planer setzt einen neuen ein.
        gruppenbesuche: state.gruppenbesuche.some((b) => b.pid === action.id)
          ? state.gruppenbesuche.map((b) => (b.pid === action.id ? { ...b, pid: null } : b))
          : state.gruppenbesuche,
        // Ihre Einträge im öffentlichen Zeugnisgeben gehen mit — wie in der
        // Datenbank (`on delete cascade`): Ein Platz ohne Person ist frei.
        ozEintraege: state.ozEintraege.some((e) => e.pid === action.id)
          ? state.ozEintraege.filter((e) => e.pid !== action.id)
          : state.ozEintraege,
        // Ein Platz in einem weiteren Plan (T120, Phase 5) bleibt wie ein
        // Gruppenbesuch, nur ohne Gastgeber.
        planEintraege: state.planEintraege.some((e) => e.pid === action.id)
          ? state.planEintraege.map((e) => (e.pid === action.id ? { ...e, pid: null } : e))
          : state.planEintraege,
        members: state.members.map((m) =>
          m.personId === action.id ? { ...m, personId: null } : m,
        ),
        invites: state.invites.map((i) =>
          i.personId === action.id ? { ...i, personId: null } : i,
        ),
        selectedPersonId: null,
        toast: toastKey(state, 'toastPersonDel'),
      }
    }
    case 'addPerson':
      return {
        ...state,
        persons: [...state.persons, action.person],
        selectedPersonId: action.person.id,
        toast: toastKey(state, 'toastPersonNeu'),
      }
    case 'updatePerson': {
      const oldPerson = state.persons.find((p) => p.id === action.id)
      const next = {
        ...state,
        persons: state.persons.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }
      // Namensänderung in bereits geplanten Wochen nachziehen — der
      // Anzeigename ist der in den Wochen gespeicherte Text. Die Zusagen
      // bleiben stehen: Sie hängen am Platz, und die Person darauf ist dieselbe.
      if (oldPerson && ('fn' in action.patch || 'ln' in action.patch)) {
        const oldName = displayName(oldPerson)
        const newName = displayName({ ...oldPerson, ...action.patch })
        if (oldName !== newName) {
          next.weeks = renameInWeeks(state.weeks, action.id, oldName, newName)
          // Treffpunkte sind die zweite Datenquelle und tragen den Leiter
          // ebenfalls als Text — ohne dies stand dort weiter der alte Name,
          // während die Zusammenkünfte längst den neuen zeigten.
          next.fsWeeks = fsRenameLeader(state.fsWeeks, action.id, oldName, newName)
        }
      }
      // Planer-Recht in verknüpfte Konten und offene Einladungscodes spiegeln
      // (members.planner = Quelle der Rechteprüfung); das eigene Konto ist per
      // UI-Sperre ausgenommen.
      if ('plannerVorgemerkt' in action.patch) {
        const on = Boolean(action.patch.plannerVorgemerkt)
        next.members = state.members.map((m) =>
          m.personId === action.id && m.userId !== state.userId ? { ...m, planner: on } : m,
        )
        next.invites = state.invites.map((i) =>
          i.personId === action.id ? { ...i, planner: on } : i,
        )
      }
      return next
    }
    case 'changeServiceCount':
      return {
        ...state,
        services: state.services.map((s) =>
          s.key === action.key
            ? { ...s, count: Math.min(6, Math.max(1, s.count + action.delta)) }
            : s,
        ),
      }
    case 'removeService': {
      // Ein Dienst hinterlässt drei Spuren, und keine räumt sich selbst auf:
      // den Aufgabenbereich bei jeder Person, die Platzreihe in jeder Woche und
      // die Bestätigungen dieser Plätze (siehe data/dienste.ts).
      const keys = dienstZusagenKeys(state.weeks, action.key)
      return {
        ...state,
        services: state.services.filter((s) => s.key !== action.key),
        persons: dienstBereichEntfernen(state.persons, action.key),
        weeks: dienstAusWochenEntfernen(state.weeks, action.key),
        confirmations: ohneDienstZusagen(state.confirmations, keys),
        // Die Freigabe-Liste des gelöschten Dienstes darf nicht offen bleiben —
        // sie zeigte sonst Schalter für einen Bereich, den es nicht mehr gibt.
        svcSheet: state.svcSheet === action.key ? null : state.svcSheet,
        toast: toastKey(state, 'toastDienstDel'),
      }
    }
    case 'addService':
      return {
        ...state,
        services: [...state.services, action.service],
        toast: toastKey(state, 'toastDienstAdd'),
      }
    case 'addGroup':
      return {
        ...state,
        groups: [...state.groups, action.group],
        toast: toastKey(state, 'toastGruppeNeu'),
      }
    case 'removeGroup': {
      // Ihre Treffpunkte gehen mit — sonst erzeugte der Grundplan sie weiter,
      // ohne dass sie irgendwo noch zu löschen wären (`fsGruppeEntfernen`).
      const { fsRules, fsWeeks } = fsGruppeEntfernen(state.fsRules, state.fsWeeks, action.id)
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        // Mitglieder der gelöschten Gruppe verlieren ihre Zuordnung. Das nennt
        // die Rückfrage vor dem Löschen, und danach die Warnung „Ohne
        // Predigtdienstgruppe" (`ohneGruppe`).
        persons: state.persons.map((p) => (p.grp === action.id ? { ...p, grp: null } : p)),
        fsRules,
        fsWeeks,
        // Ihre Besuche ebenso (T120) — in der Datenbank per Kaskade.
        gruppenbesuche: state.gruppenbesuche.some((b) => b.grp === action.id)
          ? state.gruppenbesuche.filter((b) => b.grp !== action.id)
          : state.gruppenbesuche,
        // Eine Woche eines weiteren Plans bleibt, nur ohne Gruppe — wie in der
        // Datenbank (`on delete set null`).
        planEintraege: state.planEintraege.some((e) => e.grp === action.id)
          ? state.planEintraege.map((e) => (e.grp === action.id ? { ...e, grp: null } : e))
          : state.planEintraege,
        toast: toastKey(state, 'toastGruppeDel'),
      }
    }
    case 'updateGroup':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }
    case 'updateCongregation': {
      const congregation = { ...state.congregation, ...action.patch }
      // Ändert sich die Zusammenkunftszeit, wandern die Endzeiten der schon
      // geladenen Wochen mit. Sie stehen in den Wochendaten; die Startzeit
      // dagegen kommt bei jeder Anzeige frisch aus den Einstellungen. Ohne das
      // hier stünde nach einer Umstellung auf jedem Programmblatt eine
      // Zusammenkunft, die 45 Minuten länger dauert als geplant.
      const weeks =
        action.patch.times !== undefined && action.patch.times !== state.congregation.times
          ? endenNachziehen(state.weeks, state.congregation.times, action.patch.times)
          : state.weeks
      return { ...state, congregation, weeks }
    }
    case 'updateMember':
      return {
        ...state,
        members: state.members.map((m) =>
          m.userId === action.userId ? { ...m, ...action.patch } : m,
        ),
      }
    case 'removeMember':
      return {
        ...state,
        members: state.members.filter((m) => m.userId !== action.userId),
        toast: toastKey(state, 'toastMitgliedEntfernt'),
      }
    case 'addInvite':
      return {
        ...state,
        invites: [...state.invites, action.invite],
        toast: toastKey(state, 'toastEinladungErstellt'),
      }
    case 'removeInvite':
      return {
        ...state,
        invites: state.invites.filter((i) => i.id !== action.id),
        toast: toastKey(state, 'toastEinladungGeloescht'),
      }
    case 'setRecovery':
      return { ...state, recovery: action.on }
    case 'startImport':
      return state.importing ? state : { ...state, importing: true }
    case 'addImportedWeek': {
      // Dieselbe Woche ein zweites Mal: nichts anhängen. Gespeichert überschrieb
      // sie die schon geplante Woche gleichen Montags mit einer leeren — so kam
      // sie, solange `import-week` mangels neuerer Woche die letzte erneut schickte.
      if (state.weeks.some((w) => w.start === action.week.start)) {
        return { ...state, importing: false, toast: toastKey(state, 'toastAlleWochen') }
      }
      // Endzeiten aus den Zusammenkunftszeiten rechnen. Der Import kennt sie
      // nicht und trug feste Werte ein (20:45 / 11:45) — bei einem Beginn um
      // 18:30 stand damit auf jedem Programmblatt eine falsche Endzeit.
      const zeiten = state.congregation.times
      const week: Week = {
        ...action.week,
        mid: { ...action.week.mid, end: endeAusStartzeit(zeiten.mid.time, action.week.mid.end) },
        we: { ...action.week.we, end: endeAusStartzeit(zeiten.we.time, action.week.we.end) },
      }
      // Eine frisch importierte Woche kennt die Zusätzliche Klasse noch
      // nicht: ohne dieses Angleichen bliebe sie ohne zweite Platzreihe und
      // ohne Ratgeber — die Klasse würde ab dem nächsten Import verschwinden.
      let weeks = syncAuxSlots([...state.weeks, week], state.auxClass)
      // Bringt die Woche einen Gedächtnismahl-Termin mit (T65), wird der
      // Ausfall **hier** abgeleitet und nicht im Import. Die Regel — Werktag
      // trifft die Zusammenkunft unter der Woche, Wochenende die andere —
      // steht damit an einer Stelle; ein zweites Mal in eine Edge Function
      // geschrieben war sie schon einmal die Ursache eines Fehlers (B8/T40).
      const mem = week.anlass?.art === 'mem' ? week.anlass.von : undefined
      if (mem) weeks = setAnlassTermin(weeks, weeks.length - 1, { von: mem })
      return {
        ...state,
        weeks,
        // Die Treffpunkte laufen parallel (`fsWeeks[wi]` gehört zu `weeks[wi]`).
        // Ohne diese Zeile hatte die neue Woche bis zum Neuladen keine, und was
        // man dort hinzufügte, fand seine Woche nicht und ging verloren.
        // Ein vorgemerkter Gruppenbesuch (T120) wird dabei eingetragen.
        fsWeeks: [
          ...state.fsWeeks,
          besucheInNeueWoche(genFsWeek(week.start, state.fsRules), week.start, state.gruppenbesuche, state.persons),
        ],
        importing: false,
        notifs: pushNotif(
          state.notifs,
          'import',
          'Programm importiert',
          // Die Gedächtnismahl-Woche hat kein Bibellese-Kapitel — sie hat gar
          // keine Arbeitsheft-Seite. Ohne diese Bedingung stünde in der Glocke
          // ein leeres Atom zwischen zwei Trennern.
          [week.range, week.book].filter(Boolean).join(' · ') + ' — ohne Zuteilungen',
        ),
        toast: toastKey(state, 'toastImportiert'),
      }
    }
    case 'mergeWeekAlt':
      // Nachgeladene Sprachvarianten in die bestehende Woche mischen
      return {
        ...state,
        weeks: state.weeks.map((w, i) =>
          i === action.wi ? { ...w, alt: { ...w.alt, ...action.alt } } : w,
        ),
      }
    case 'stopImport':
      return { ...state, importing: false }
    case 'assign': {
      // Zuteilen bzw. Entfernen ("") + Mitteilung (Prototyp: assignTo)
      const sel = state.slotSel
      if (!sel) return state
      // Treffpunkt-Leiter: eigene Datenquelle (fsWeeks). Die Zusage des
      // Vorgängers räumt `ohneVerwaisteTreffpunktZusagen` ab.
      if (sel.kind === 'fs') {
        const fsWeeks = fsSetLeader(
          state.fsWeeks,
          sel.wi,
          sel.instId,
          action.name,
          action.pid,
          action.extern,
        )
        return {
          ...state,
          fsWeeks,
          slotSel: null,
          toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
        }
      }
      const weeks = assignSlot(state.weeks, sel, action.name, action.rolle, action.pid, action.herkunft)
      return {
        ...state,
        weeks,
        // Geänderte Slots: alten Bestätigungs-Status abräumen (sonst erbt die
        // neue Person ein fremdes „bestätigt“/„verhindert“).
        //
        // Wer hier eine **bestätigte** Zusage verliert, erfährt es sofort —
        // persist.ts liest das aus dem Vorher/Nachher-Vergleich und ruft
        // `send-plan` mit 'entzug' (T99). Der Reducer bleibt rein.
        confirmations: dropConfirmations(
          state.confirmations,
          geaenderteSlots(state.weeks, weeks, sel.wi, sel.tab, state.services),
        ),
        slotSel: null,
        toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
      }
    }
    case 'autoAssign': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      const { weeks, count, unfilled } = autoAssignMeeting(
        state.weeks,
        state.week,
        mtab(state.tab),
        state.persons,
        state.services,
        state.groups,
        action.scope,
        buildAbsences(state.absences, state.weeks, state.congregation.times),
      )
      if (count === 0) {
        // Offen gebliebene, aber nicht besetzbare Slots (keine passende/freie
        // Person) klar von „nichts offen“ unterscheiden.
        const key = unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen'
        return { ...state, toast: toastKey(state, key) }
      }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(
          state.confirmations,
          geaenderteSlots(state.weeks, weeks, state.week, mtab(state.tab), state.services),
        ),
        toast: toastKey(state, 'toastAutoN', { n: count }),
      }
    }
    case 'clearAssignments': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      const { weeks, count } = clearAssignments(state.weeks, state.week, mtab(state.tab), action.scope)
      if (count === 0) return { ...state, toast: toastKey(state, 'toastGeleertN', { n: 0 }) }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(
          state.confirmations,
          geaenderteSlots(state.weeks, weeks, state.week, mtab(state.tab), state.services),
        ),
        toast: toastKey(state, 'toastGeleertN', { n: count }),
      }
    }
    case 'fsAutoAssign': {
      const { fsWeeks, count } = fsAutoAssign(
        state.fsWeeks,
        state.week,
        state.persons,
        action.onlyGroup,
        state.absences,
        state.weeks[state.week]?.start ?? '',
        state.groups,
      )
      if (count === 0) return { ...state, toast: toastKey(state, 'toastKeineOffen') }
      return { ...state, fsWeeks, toast: toastKey(state, 'toastAutoN', { n: count }) }
    }
    case 'fsClear': {
      const { fsWeeks, count } = fsClear(state.fsWeeks, state.week, action.onlyGroup)
      return { ...state, fsWeeks, toast: toastKey(state, 'toastGeleertN', { n: count }) }
    }
    case 'fsInstUpdate':
      return { ...state, fsWeeks: fsUpdateInst(state.fsWeeks, action.wi, action.id, action.patch) }
    case 'fsInstRemove': {
      // Ein Treffpunkt aus dem Grundplan wird in seiner Regel für diese Woche
      // ausgesetzt — sonst baute `regenFsWeeks` ihn beim nächsten Laden neu.
      const ruleId = state.fsWeeks[action.wi]?.find((i) => i.id === action.id)?.ruleId
      const woche = state.weeks[action.wi]?.start
      return {
        ...state,
        fsRules: ruleId && woche ? fsRegelAussetzen(state.fsRules, ruleId, woche) : state.fsRules,
        fsWeeks: fsRemoveInst(state.fsWeeks, action.wi, action.id),
        toast: toastKey(state, 'toastFsDel'),
      }
    }
    case 'fsInstAdd':
      return {
        ...state,
        fsWeeks: fsAddInst(state.fsWeeks, state.week, action.inst),
        toast: toastKey(state, 'toastFsAdd'),
      }
    case 'fsRuleAdd': {
      const rule: FsRule = {
        // Eindeutig statt zeitgestempelt: `r${Date.now()}` vergab zwei Regeln
        // derselben Millisekunde dieselbe Id — und die Id steckt in jeder
        // Treffpunkt-Kennung (`<wi>|<ruleId>`) und darüber im Aufgaben-
        // Schlüssel. Zwei Regeln mit einer Id hießen zwei Treffpunkte mit einer
        // Bestätigung. `crypto.randomUUID` nutzt der Reducer für Mitteilungen
        // ohnehin; das Präfix hält die Kennung lesbar.
        id: `r${crypto.randomUUID()}`,
        grp: action.grp,
        wd: 6,
        time: '09:30',
        place: '',
        monthly: 0,
        skipCong: action.grp != null,
      }
      const fsRules = [...state.fsRules, rule]
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules),
        toast: toastKey(state, 'toastFsRuleAdd'),
      }
    }
    case 'fsRuleUpdate': {
      const fsRules = state.fsRules.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r))
      return { ...state, fsRules, fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules) }
    }
    case 'fsRuleRemove': {
      const fsRules = state.fsRules.filter((r) => r.id !== action.id)
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules),
        toast: toastKey(state, 'toastFsRuleDel'),
      }
    }
    /*
     * Gruppenbesuche des Dienstaufsehers (T120, Phase 2). Jede Änderung trägt
     * den Besucher in die geladenen Treffpunkte ein oder aus; Zusagen, die
     * dabei verfallen, räumt `ohneVerwaisteTreffpunktZusagen` ab, und wer eine
     * bestätigte verliert, erfährt es über `persist.ts` — wie bei jedem
     * anderen Leiterwechsel.
     */
    case 'besucheVerteilen': {
      const lage = besuchsLage(state)
      const neu = besucheVerteilen({
        besuche: state.gruppenbesuche,
        groups: state.groups,
        lage,
        pid: action.pid,
        // Wie die Regeln des Grundplans: eindeutig und lesbar (`fsRuleAdd`).
        neueId: () => `b${crypto.randomUUID()}`,
      })
      if (!neu.length) return { ...state, toast: toastKey(state, 'toastKeineBesuche') }
      let fsWeeks = state.fsWeeks
      for (const besuch of neu) fsWeeks = besuchEintragen(fsWeeks, lage.kennungen, besuch, state.persons)
      return {
        ...state,
        gruppenbesuche: nachWoche([...state.gruppenbesuche, ...neu]),
        fsWeeks,
        toast: toastKey(state, 'toastBesucheN', { n: neu.length }),
      }
    }
    case 'besuchHinzufuegen': {
      // Dieselbe Gruppe in derselben Woche gibt es nur einmal (so auch die Datenbank).
      if (state.gruppenbesuche.some((b) => b.woche === action.woche && b.grp === action.grp)) return state
      const besuch = { id: `b${crypto.randomUUID()}`, woche: action.woche, grp: action.grp, pid: action.pid }
      return {
        ...state,
        gruppenbesuche: nachWoche([...state.gruppenbesuche, besuch]),
        fsWeeks: besuchEintragen(state.fsWeeks, wochenKennungen(state), besuch, state.persons),
        toast: toastKey(state, 'toastBesuchAdd'),
      }
    }
    case 'besuchEntfernen': {
      const besuch = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!besuch) return state
      return {
        ...state,
        gruppenbesuche: state.gruppenbesuche.filter((b) => b !== besuch),
        fsWeeks: besuchAustragen(state.fsWeeks, wochenKennungen(state), besuch),
        toast: toastKey(state, 'toastBesuchDel'),
      }
    }
    case 'besuchBesucher': {
      const alt = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!alt || alt.pid === action.pid) return state
      const neu = { ...alt, pid: action.pid }
      const kennungen = wochenKennungen(state)
      // Wo der bisherige Besucher eingetragen war, wird frei — und dort tritt
      // der neue an. Einen fremden Leiter ersetzt auch er nicht ungefragt.
      const fsWeeks = besuchEintragen(besuchAustragen(state.fsWeeks, kennungen, alt), kennungen, neu, state.persons)
      return { ...state, gruppenbesuche: state.gruppenbesuche.map((b) => (b === alt ? neu : b)), fsWeeks }
    }
    case 'besuchUebernehmen': {
      const besuch = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!besuch) return state
      const fsWeeks = besuchEintragen(state.fsWeeks, wochenKennungen(state), besuch, state.persons, true)
      return fsWeeks === state.fsWeeks ? state : { ...state, fsWeeks, toast: toastKey(state, 'toastZugeteilt') }
    }
    case 'besucheLeeren': {
      const lage = besuchsLage(state)
      const weg = new Set(state.gruppenbesuche.filter((b) => besuchStand(b, lage).art !== 'vorbei'))
      if (!weg.size) return { ...state, toast: toastKey(state, 'toastBesucheGeleert', { n: 0 }) }
      let fsWeeks = state.fsWeeks
      for (const besuch of weg) fsWeeks = besuchAustragen(fsWeeks, lage.kennungen, besuch)
      return {
        ...state,
        gruppenbesuche: state.gruppenbesuche.filter((b) => !weg.has(b)),
        fsWeeks,
        // Nicht „Geleerte Zuteilungen": gezählt sind Besuche, keine Plätze.
        toast: toastKey(state, 'toastBesucheGeleert', { n: weg.size }),
      }
    }
    /*
     * Öffentliches Zeugnisgeben (T120, Phase 3). Ein Termin ist die Regel, ein
     * Eintrag eine Person in einer Schicht; die Schichten selbst werden nur
     * gerechnet (`ozSchichten`). Zusagen verschwundener Einträge räumt
     * `ohneVerwaisteZeugnisZusagen` ab, und wer eine bestätigte verliert,
     * erfährt es über `persist.ts` — wie bei jedem anderen Platz.
     */
    case 'ozTerminAdd': {
      // Samstagvormittag als Vorschlag, wie beim Treffpunkt (`fsRuleAdd`).
      const termin: OzTermin = { id: `t${crypto.randomUUID()}`, wd: 6, von: '10:00', bis: '12:00', ort: '', plaetze: 2 }
      return { ...state, ozTermine: [...state.ozTermine, termin], toast: toastKey(state, 'toastOzTerminAdd') }
    }
    case 'ozTerminUpdate': {
      const alt = state.ozTermine.find((t) => t.id === action.id)
      if (!alt) return state
      const neu = { ...alt, ...action.patch }
      const ozTermine = state.ozTermine.map((t) => (t === alt ? neu : t))
      if (neu.wd === alt.wd) return { ...state, ozTermine }
      // Ein anderer Wochentag: Die kommenden Einträge gehen (`ozWegBeiTagwechsel`).
      // Gefragt hat vorher die Oberfläche, mit derselben Rechnung (`TerminZeile`).
      const weg = new Set(ozWegBeiTagwechsel(state.ozEintraege, alt.id))
      const ozEintraege = weg.size ? state.ozEintraege.filter((e) => !weg.has(e)) : state.ozEintraege
      return { ...state, ozTermine, ozEintraege }
    }
    case 'ozTerminRemove': {
      if (!state.ozTermine.some((t) => t.id === action.id)) return state
      return {
        ...state,
        ozTermine: state.ozTermine.filter((t) => t.id !== action.id),
        // Seine Einträge gehen mit — in der Datenbank per Kaskade.
        ozEintraege: state.ozEintraege.filter((e) => e.terminId !== action.id),
        toast: toastKey(state, 'toastOzTerminDel'),
      }
    }
    case 'ozEintragen': {
      // Selbst eintragen: nur mit dem Aufgabenbereich und nur in einen freien
      // Platz — dieselben Regeln prüft die Datenbank (`oz_eintraege_selbst_rein`,
      // `oz_platz_pruefen`).
      const me = eigenePerson(state)
      const schicht = ozSchicht(state.ozTermine, state.ozEintraege, action.terminId, action.datum)
      if (!me || !schicht || !ozKannEintragen(me, schicht)) return state
      const eintrag: OzEintrag = { id: neueEintragId(), terminId: action.terminId, datum: action.datum, pid: me.id, selbst: true }
      return { ...state, ozEintraege: ozMit(state, [eintrag]), toast: toastKey(state, 'toastOzEingetragen') }
    }
    case 'ozZuteilen': {
      const person = state.persons.find((p) => p.id === action.pid)
      const schicht = ozSchicht(state.ozTermine, state.ozEintraege, action.terminId, action.datum)
      if (!person || !schicht || schicht.frei <= 0 || ozVorbei(schicht)) return state
      if (schicht.eintraege.some((e) => e.pid === person.id)) return state
      const eintrag: OzEintrag = { id: neueEintragId(), terminId: action.terminId, datum: action.datum, pid: person.id, selbst: false }
      return { ...state, ozEintraege: ozMit(state, [eintrag]), toast: toastKey(state, 'toastZugeteilt') }
    }
    case 'ozAustragen': {
      const eintrag = state.ozEintraege.find((e) => e.id === action.id)
      if (!eintrag) return state
      // Wer sich selbst austrägt, sagt ab — die Planer erfahren es. Ein Planer,
      // der seinen Plan aufräumt, meldet sich nichts selbst.
      if (!state.planner && eintrag.pid === eigenePerson(state)?.id) return ozAbsage(state, eintrag)
      return {
        ...state,
        ozEintraege: state.ozEintraege.filter((e) => e !== eintrag),
        toast: toastKey(state, 'toastOzAusgetragen'),
      }
    }
    case 'ozAutoAssign': {
      const ab = ozAb()
      const neu = ozAutoAssign({
        schichten: ozSchichten(state.ozTermine, state.ozEintraege, ab),
        // Der geladene Rückblick zählt mit: reihum über die Vierteljahre.
        bisher: state.ozEintraege.filter((e) => e.datum < ab),
        persons: state.persons,
        absences: state.absences,
        neueId: neueEintragId,
      })
      if (!neu.length) return { ...state, toast: toastKey(state, 'toastKeinePassende') }
      return { ...state, ozEintraege: ozMit(state, neu), toast: toastKey(state, 'toastAutoN', { n: neu.length }) }
    }
    case 'ozLeeren': {
      // Nur Zugeteiltes und nur Kommendes. Wer sich selbst eingetragen hat, hat
      // zugesagt — das räumt kein Knopf des Planers ab; Vergangenes bleibt als
      // Rückblick stehen.
      const weg = new Set(state.ozEintraege.filter((e) => !e.selbst && !ozVorbei(e)))
      if (!weg.size) return { ...state, toast: toastKey(state, 'toastGeleertN', { n: 0 }) }
      return {
        ...state,
        ozEintraege: state.ozEintraege.filter((e) => !weg.has(e)),
        toast: toastKey(state, 'toastGeleertN', { n: weg.size }),
      }
    }
    /*
     * Weitere Pläne (T120, Phase 5) — Ankündigungen: Hier verfällt keine
     * Zusage und geht keine Nachricht hinaus.
     */
    case 'wpPlanAnlegen':
      if (state.plaene.some((p) => p.id === action.plan.id)) return state
      return { ...state, plaene: planNachDatum([...state.plaene, action.plan]) }
    case 'wpPlanAendern': {
      const alt = state.plaene.find((p) => p.id === action.id)
      if (!alt) return state
      const plan = { ...alt, ...action.patch }
      // Ein Zeitraum, der vor seinem Anfang endet, ist keiner.
      if (plan.bis < plan.von) return state
      const veroeffentlicht = alt.entwurf && !plan.entwurf
      const zurueck = !alt.entwurf && plan.entwurf
      return {
        ...state,
        plaene: planNachDatum(state.plaene.map((p) => (p === alt ? plan : p))),
        planEintraege: eintraegeImZeitraum(state.planEintraege, plan),
        ...(veroeffentlicht || zurueck
          ? { toast: toastKey(state, veroeffentlicht ? 'toastWpVeroeffentlicht' : 'toastWpEntwurf') }
          : {}),
      }
    }
    case 'wpPlanLoeschen':
      if (!state.plaene.some((p) => p.id === action.id)) return state
      return {
        ...state,
        plaene: state.plaene.filter((p) => p.id !== action.id),
        planEintraege: state.planEintraege.filter((e) => e.planId !== action.id),
        toast: toastKey(state, 'toastWpGeloescht'),
      }
    case 'wpGruppenVerteilen': {
      const plan = state.plaene.find((p) => p.id === action.planId)
      if (!plan || plan.vorlage !== 'saal') return state
      const { eintraege, verteilt } = gruppenVerteilen({
        plan,
        eintraege: state.planEintraege,
        groups: state.groups,
        abGruppe: action.abGruppe,
        heute: new Date(),
        neueId: neueEintragId,
      })
      return { ...state, planEintraege: eintraege, toast: toastKey(state, 'toastWpVerteilt', { n: verteilt }) }
    }
    case 'wpEintragSetzen': {
      if (!state.plaene.some((p) => p.id === action.planId)) return state
      const eintraege = eintragSetzen({ ...action, eintraege: state.planEintraege, neueId: neueEintragId })
      return eintraege === state.planEintraege ? state : { ...state, planEintraege: eintraege }
    }
    case 'openMyTask':
      return { ...state, myTaskId: action.id }
    case 'closeMyTask':
      return { ...state, myTaskId: null }
    case 'confirmTask':
      // Status in die ConfirmationMap — myTasks und confirmOpen folgen aus der
      // Ableitung (withDerivedTasks). Ein offenes Ersatzgesuch hält das Blatt
      // dort ebenfalls (T69).
      return {
        ...state,
        confirmations: { ...state.confirmations, [action.id]: 'bestätigt' },
        myTaskId: null,
        toast: toastKey(state, 'toastBestaetigt'),
      }
    case 'declineTask': {
      // Öffentliches Zeugnisgeben: Absagen gibt den Platz frei (`ozAbsage`).
      const teile = schluesselTeile(action.id)
      if (teile?.art === 'oz') {
        const eintrag = state.ozEintraege.find((e) => e.id === teile.eintragId)
        return eintrag ? ozAbsage(state, eintrag) : state
      }
      const task = state.myTasks.find((t) => t.id === action.id)
      // Kanonisch deutsch in die Mitteilung — beide Hälften, denn dort steht
      // kein Übersetzer dazwischen (die Glocke übersetzt beim Anzeigen).
      const bezeichnung = task ? aufgabenBezeichnung(task) : ''
      const notif = makeNotif(
        'verhindert',
        'Verhinderung gemeldet',
        // Der Name als gekennzeichneter Freitext: Die Glocke übersetzt beim
        // Anzeigen Atom für Atom, und ein Bruder namens „Markus 2" (die
        // Schreibweise für Namensgleiche) stand dort sonst als „Mark 2".
        // Siehe `i18n/freitext.ts`.
        `${bezeichnung} — ${alsFreitext(currentUserName(state))}`,
      )
      // Bei Hilfsdiensten wird automatisch ein Ersatz gesucht (Ersatzgesuch) →
      // eigener Toast; sonst nur die Verhinderungs-Meldung an den Planer.
      const declineToast = helperKeyParts(action.id) ? 'toastErsatzGesucht' : 'toastVerhindert'
      return {
        ...state,
        confirmations: { ...state.confirmations, [action.id]: 'verhindert' },
        notifs: [notif, ...state.notifs],
        myTaskId: null,
        toast: toastKey(state, declineToast),
      }
    }
    case 'takeSubstitute': {
      const parts = helperKeyParts(action.key)
      const me = eigenePerson(state)
      if (!parts || !me) return state
      const name = displayName(me)
      const wi = wochenIndex(state.weeks, parts.woche)
      if (wi < 0) return state // Woche nicht geladen
      const sel = {
        kind: 'helper' as const, wi, tab: parts.tab, svc: parts.svc, pos: parts.pos,
        label: '', priv: null, groups: false,
      }
      const weeks = assignSlot(state.weeks, sel, name, undefined, me.id)
      // „Warnen statt blocken": schon am selben Tag eingeteilt? → Hinweis-Toast.
      const meeting = weeks[wi]?.[parts.tab]
      const clash = meeting != null && assignmentsInMeeting(meeting, me, state.services, sel).length > 0
      return {
        ...state,
        weeks,
        confirmations: { ...state.confirmations, [action.key]: 'bestätigt' },
        myTaskId: null,
        toast: toastKey(state, clash ? 'toastUebernommenKonflikt' : 'toastUebernommen'),
      }
    }
    case 'openS89':
      return { ...state, s89: action.payload }
    case 'closeS89':
      return { ...state, s89: null }
    case 'lacMinuten':
      return {
        ...state,
        weeks: lacMinuten(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.mins),
      }
    case 'lacRemove': {
      // Die Bestätigungen des gelöschten Punkts verfallen mit ihm. Die übrigen
      // bleiben unberührt — ihr Schlüssel trägt die Kennung ihres Punkts, nicht
      // dessen Position, also verschiebt ein Löschen daran nichts.
      const geloescht = state.weeks[state.week]?.[mtab(state.tab)].sections[action.si]?.items[action.ii]
      const verfallen =
        geloescht && !isSong(geloescht)
          ? itemZusagenKeys(
              state.confirmations,
              state.weeks[state.week]?.start ?? '',
              mtab(state.tab),
              geloescht.iid,
            )
          : []
      const confirmations = dropConfirmations(state.confirmations, verfallen)
      return {
        ...state,
        weeks: lacRemove(state.weeks, state.week, mtab(state.tab), action.si, action.ii),
        confirmations,
        toast: toastKey(state, 'toastLacDel'),
      }
    }
    case 'togglePartner':
      return {
        ...state,
        weeks: togglePartner(state.weeks, state.week, mtab(state.tab), action.si, action.ii),
      }
    case 'setFamily':
      return {
        ...state,
        persons: action.add
          ? linkFamily(state.persons, action.id, action.memberId)
          : unlinkFamily(state.persons, action.memberId),
      }
    case 'lacMove': {
      // Die Bestätigungen bleiben, wo sie sind: Sie hängen an der Kennung des
      // Punkts, und die nimmt er beim Verschieben mit.
      const weeks = lacMove(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.dir)
      if (weeks === state.weeks) return state // Rand: kein Tausch
      return { ...state, weeks }
    }
    case 'lacAdd': {
      const weeks = lacAdd(state.weeks, state.week, mtab(state.tab), action.si, action.title)
      if (weeks === state.weeks) return state // leerer Titel
      // Der neue Punkt bringt seine eigene Kennung mit und kann deshalb keine
      // fremde Bestätigung erben; die bestehenden rühren sich nicht.
      return { ...state, weeks, toast: toastKey(state, 'toastLacAdd') }
    }
    case 'setAbweichung': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: setAbweichung(state.weeks, state.week, action.tab, action.patch) }
    }
    case 'setAnlass': {
      const vorher = state.weeks[state.week]
      if (!vorher) return state
      const weeks = setAnlass(state.weeks, state.week, action.art)
      // Was der Anlass einer schon zugesagten Person nimmt — der Dienstvortrag an
      // der Stelle des Bibelstudiums —, meldet `persist` ihr als Entzug. Die
      // Zusage verfällt mit: Holt das Zurücknehmen den Punkt samt Besetzung
      // zurück, stünde sie sonst still wieder bestätigt da, und weder „Plan
      // senden" noch die Erinnerungen erreichten sie je wieder.
      const verfallen = entzogeneZusagen(
        vorher,
        weeks[state.week],
        undefined,
        undefined,
        state.services,
        state.congregation.times,
        state.confirmations,
      ).map((z) => z.key)
      return { ...state, weeks, confirmations: dropConfirmations(state.confirmations, verfallen) }
    }
    case 'setAnlassTermin': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: setAnlassTermin(state.weeks, state.week, action.patch) }
    }
    // Weitere Termine der Woche (T63). Reine Ankündigung — kein `task_key`,
    // keine Bestätigung, keine Mitteilung, kein Ampel-Punkt.
    case 'terminAdd': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: terminAdd(state.weeks, state.week, `t${crypto.randomUUID()}`) }
    }
    case 'terminUpdate':
      return { ...state, weeks: terminUpdate(state.weeks, state.week, action.id, action.patch) }
    case 'terminRemove':
      return { ...state, weeks: terminRemove(state.weeks, state.week, action.id) }
    case 'setPartThema':
      return {
        ...state,
        weeks: setPartThema(
          state.weeks,
          state.week,
          action.tab,
          action.si,
          action.ii,
          action.begriff,
          action.thema,
        ),
      }
    case 'talkEdit':
      return {
        ...state,
        weeks: editTalkTheme(state.weeks, state.week, action.si, action.ii, action.title),
      }
    case 'openingSong':
      return {
        ...state,
        weeks: setOpeningSong(state.weeks, state.week, action.song),
      }
    case 'closingSong':
      return {
        ...state,
        weeks: setClosingSong(state.weeks, state.week, action.song),
      }
    case 'changeReminder': {
      const bounds = action.key === 'first' ? { min: 1, max: 21 } : { min: 0, max: 7 }
      const value = Math.max(bounds.min, Math.min(bounds.max, state.reminders[action.key] + action.delta))
      return { ...state, reminders: { ...state.reminders, [action.key]: value } }
    }
    case 'toggleReminderRepeat':
      return { ...state, reminders: { ...state.reminders, repeat: !state.reminders.repeat } }
    case 'setLang':
      return { ...state, lang: action.lang }
    case 'openLangSheet':
      return { ...state, langSheetOpen: true, langSheetFor: action.mode ?? 'cong', slotSel: null }
    case 'closeLangSheet':
      return { ...state, langSheetOpen: false, langSearch: '' }
    case 'setLangSearch':
      return { ...state, langSearch: action.text }
    case 'openServiceSheet':
      return { ...state, svcSheet: action.key }
    case 'closeServiceSheet':
      return { ...state, svcSheet: null }
    case 'closeConfirm':
      // Nur wegzulegen, solange nichts zu bestätigen ist — die Pflicht bleibt.
      return state.myTasks.some((t) => t.status === 'offen') ? state : { ...state, confirmOpen: false }
    case 'setAuxClass':
      // Beim Einschalten bekommen alle Schuelerteile ihre zweite Platzreihe.
      // Beim Ausschalten bleibt sie stehen (nur unsichtbar) — sonst waere die
      // Planung mehrerer Wochen mit einem Fehlgriff weg.
      return {
        ...state,
        auxClass: action.on,
        weeks: syncAuxSlots(state.weeks, action.on),
        toast: toastKey(state, action.on ? 'toastAuxAn' : 'toastAuxAus'),
      }
    case 'setCongLang':
      return { ...state, congLang: action.code, langSheetOpen: false, langSearch: '' }
    case 'addProgLang': {
      // Versammlungssprache selbst und Duplikate ergeben keine Variante
      const skip = action.code === state.congLang || state.progLangs.includes(action.code)
      return {
        ...state,
        progLangs: skip ? state.progLangs : [...state.progLangs, action.code],
        langSheetOpen: false,
        langSearch: '',
        toast: skip ? state.toast : toastKey(state, 'toastProgLangAdd'),
      }
    }
    case 'removeProgLang':
      return {
        ...state,
        progLangs: state.progLangs.filter((c) => c !== action.code),
        toast: toastKey(state, 'toastProgLangDel'),
      }
    case 'hydrate': {
      const p = action.payload
      const weeks = syncAuxSlots(p.weeks, p.auxClass)
      // Auf die laufende Woche springen. Bisher stand hier die ÄLTESTE geladene
      // Woche — nach dem Login zeigte die App damit ein bis zu ein Jahr altes
      // Programm. Fällt heute in keine geladene Woche (frische Versammlung,
      // Lücke im Import), bleibt es beim Anfang.
      const aktuell = currentWeekIndex(weeks)
      /*
       * **Eine selbst gewählte Woche übersteht das Nachladen** (T99).
       *
       * Seit „Plan senden" und der Glocke lädt die App auch mitten in der
       * Arbeit still nach. Sprang sie dabei auf die laufende Woche, verlor der
       * Planer seinen Platz: Er gab Woche +3 frei und stand danach auf der
       * aktuellen, mit Zahlen einer anderen Woche vor sich.
       *
       * Wiedergefunden wird über die **Kennung**, nicht über die Ordnungszahl —
       * ein Nachladen kann Wochen davor gebracht haben, und dann zeigte der
       * alte Index auf eine andere Woche. Ist sie nicht mehr dabei, gilt wieder
       * die laufende.
       */
      const gewaehlteKennung = state.terminGewaehlt ? state.weeks[state.week]?.start : undefined
      const gewaehlt = gewaehlteKennung
        ? weeks.findIndex((w) => w.start === gewaehlteKennung)
        : -1
      /*
       * **Der offene Platz meint dieselbe Woche wie vorher** — derselbe Weg wie
       * eine Zeile darüber, und aus demselben Grund.
       *
       * `slotSel` trägt die Woche als Ordnungszahl. Normalerweise ist das egal,
       * weil `navigate` das Blatt schließt; ein Weg führt aber daran vorbei:
       * Schlägt ein Schreibvorgang wegen eines Konflikts fehl (T39), lädt
       * `store.tsx` **still** nach — ohne Navigation, mitten in der Arbeit,
       * also genau dann, wenn ein Zuteilungs-Blatt offen steht. Rutscht das
       * Fenster dabei (52 Wochen, vorn fällt die älteste heraus), zeigte
       * `slotSel.wi` danach auf eine andere Woche, und der nächste Klick schrieb
       * den Namen dorthin. Lautlos, in eine Woche, die niemand offen hatte.
       *
       * Ist die Woche gar nicht mehr dabei, wird das Blatt geschlossen: Ein
       * Platz ohne Woche ist keiner.
       */
      const slotKennung = state.slotSel ? state.weeks[state.slotSel.wi]?.start : undefined
      const slotWi = slotKennung ? weeks.findIndex((w) => w.start === slotKennung) : -1
      const slotSel = !state.slotSel ? null : slotWi >= 0 ? { ...state.slotSel, wi: slotWi } : null
      const geladen: AppState = {
        ...state,
        congregation: p.congregation,
        congregationId: p.congregationId,
        userId: p.userId,
        personId: p.personId,
        planner: p.planner,
        dataStatus: 'ready',
        dataEmpty: p.empty,
        staleAt: action.staleAt ?? null,
        persons: p.persons,
        services: p.services,
        groups: p.groups,
        weeks,
        fsRules: p.fsRules,
        fsWeeks: p.fsWeeks,
        // Aus einer Momentaufnahme von vor T120 fehlt das Feld — wie beim
        // Versand-Tagebuch darunter.
        gruppenbesuche: p.gruppenbesuche ?? [],
        ozTermine: p.ozTermine ?? [],
        ozEintraege: p.ozEintraege ?? [],
        plaene: p.plaene ?? [],
        planEintraege: p.planEintraege ?? [],
        absences: p.absences,
        notifs: p.notifications,
        confirmations: p.confirmations,
        // Aus einer alten Momentaufnahme (lib/snapshot.ts) fehlt das Feld — sie
        // wurde geschrieben, bevor es das Tagebuch gab.
        sentLog: p.sentLog ?? {},
        reminders: p.reminders,
        auxClass: p.auxClass,
        congLang: p.congLang,
        progLangs: p.progLangs,
        members: p.members,
        invites: p.invites,
        week: gewaehlt >= 0 ? gewaehlt : aktuell >= 0 ? aktuell : 0,
        slotSel,
      }
      // Nach dem Laden gleich auf die nächste Zusammenkunft (T82): Woche UND
      // Reiter. `aktuell` allein trifft nur die Woche — am Sonntagabend steht
      // die nächste schon in der Folgewoche. Erst hier, nicht vorher: Die
      // Wochentage kommen aus `p.congregation`, das im Zustand darüber noch
      // der alte ist.
      return zurNaechstenZusammenkunft(geladen)
    }
    case 'setDataStatus':
      return { ...state, dataStatus: action.status, userId: action.userId ?? state.userId }
    case 'showToast':
      return { ...state, toast: nextToast(state, action.text) }
    case 'hideToast':
      return { ...state, toast: null }
  }
}
