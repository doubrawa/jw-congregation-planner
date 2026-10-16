/**
 * Reiner App-Reducer — portiert die State-Übergänge der Prototyp-Logikklasse
 * (docs/design-handoff). Keine Nebeneffekte: Persistenz übernimmt persist.ts,
 * den Startzustand liefert init.ts, den Provider stellt store.tsx.
 */

import { syncAuxSlots } from '../data/aux-class'
import { buildAbsences } from '../data/absence'
import { eintraegeImZeitraum, eintragSetzen, gruppenVerteilen, planNachDatum, taktVon, taktWechseln } from '../data/weitere-plaene'
import { offenePlaetze, platzAuswahl } from '../data/offene-plaetze'
import {
  dienstAusWochenEntfernen,
  dienstBereichEntfernen,
  dienstVerschieben,
  dienstZusagenKeys,
  gruppeInWochenUmbenennen,
  ohneDienstZusagen,
} from '../data/dienste'
import { currentWeekIndex, istVorbei, naechsteZusammenkunft } from '../data/meeting-dates'
import { eigenePerson } from './eigene-person'
import { leererZustand } from './init'
import { deriveMyFsTasks, fsAddInst, fsAutoAssign, fsClear, fsDropPersonPid, fsGruppeEntfernen, fsRegelAussetzen, fsRemoveInst, fsRenameLeader, fsSetLeader, fsUpdateInst, fsVerwaisteZusagenAller, regenFsWeeks } from '../data/fs'
import { neueWocheEinordnen } from '../data/neue-woche'
import { aemterBeenden, displayName, isSong, linkFamily, mtab, unlinkFamily } from '../data/helpers'
import { darfPlanen, erlaubteScreens, rechteVon, themaVon } from '../data/rechte'
import { besuchAustragen, besuchEintragen, besuchsLage, besuchStand, nachWoche } from '../data/gruppenbesuche'
import { vortragsplanAnwenden, vortragsplanVorschau } from '../data/vortragsplan'
import { termineSortiert } from '../data/trolleys'
import { FS_LEITER } from '../../supabase/functions/_shared/zuteilungen.ts'
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
  sentKey,
  tabsImUmfang,
  wochenIndex,
  type Umfang,
} from '../data/planning'
import {
  editTalkTheme,
  lacAdd,
  lacMinuten,
  lacMove,
  lacRemove,
  lacTitel,
  endenNachziehen,
  togglePartner,
  setAbweichung,
  setPartThema,
  setClosingSong,
  setOpeningSong,
} from '../data/meeting-edit'
import { setAnlass, setAnlassTermin } from '../data/anlass'
import { entzogeneAller } from '../data/plan-versand'
import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { terminAdd, terminRemove, terminUpdate } from '../data/termine'
import { dict, type Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { APP_TO_JW, congAppCode } from '../i18n/langs'
import type {
  ConfirmationMap,
  FsInstance,
  FsRule,
  MeetingKey,
  MeetingTab,
  MyTask,
  Notification,
  NotificationType,
  Screen,
  SubstituteReq,
  Week,
} from '../data/types'
import { type AppAction, type AppState, ERINNERUNG_GRENZEN } from './context'

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

/** Die Zusammenkünfte, auf die „Automatisch" und „Leeren" wirken (`tabsImUmfang`). */
function umfangTabs(state: AppState, umfang: Umfang = 'tag'): MeetingKey[] {
  return tabsImUmfang(state.weeks[state.week], mtab(state.tab), umfang)
}

/** Die geänderten Plätze aller Zusammenkünfte des Umfangs — deren Zusagen verfallen. */
function geaenderteSlotsIm(state: AppState, nachher: Week[], umfang: Umfang | undefined): string[] {
  return umfangTabs(state, umfang).flatMap((tab) => geaenderteSlots(state.weeks, nachher, state.week, tab, state.services))
}

/** Toast aus einem übersetzten UI-Schlüssel (Reducer kennt state.lang). */
function toastKey(
  state: AppState,
  key: keyof Dict,
  params?: Record<string, string | number>,
): AppState['toast'] {
  return nextToast(state, fill(dict(state.lang)[key], params ?? {}))
}

/** Der Toast nach einer Trolley-Aktion — was die Function `trolley` getan hat. */
const TROLLEY_TOAST: Record<NonNullable<Extract<AppAction, { type: 'trolleyTermin' }>['toast']>, keyof Dict> = {
  eingetragen: 'toastTrolleyEingetragen',
  dazu: 'toastTrolleyDazu',
  ausgetragen: 'toastTrolleyAusgetragen',
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

/**
 * **Gelesen bleibt gelesen.** Eine geladene Liste kann abgefragt worden sein,
 * bevor das eigene „gelesen" in der Datenbank stand: Die Abfrage läuft, man
 * tippt die Mitteilung oder „Alle gelesen" an, die Antwort kommt — und die
 * Mitteilung stand wieder unter „Neu", der Punkt an der Glocke kam zurück. Bis
 * zum 15.10.2026 beim Öffnen der Mitteilungen (`setNotifs`) wie bei jedem
 * stillen Nachladen (`hydrate`).
 *
 * Die Marke kennt nur eine Richtung — „ungelesen" gibt es nicht —, also gewinnt
 * immer das Gelesen, gleich, wer es zuerst weiß.
 */
function gelesenBehalten(neu: Notification[], bisher: readonly Notification[]): Notification[] {
  const gelesen = new Set(bisher.filter((n) => n.read).map((n) => n.id))
  if (gelesen.size === 0) return neu
  return neu.map((n) => (!n.read && gelesen.has(n.id) ? { ...n, read: true } : n))
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
 * An ihre Stelle tritt „Plan senden" (`PlanSendenBlatt` → Edge Function
 * `send-plan`): eine Nachricht je **eingeteilter Person**, wenn der Plan steht.
 * Was der Planer über den Stand seiner Woche wissen muss, steht ohnehin im
 * Planen-Screen — Konflikte, offene Plätze, Engpässe und die Lage jedes
 * besetzten Platzes. Dafür braucht es keine Nachricht.
 *
 * Mit ihr entfiel der Schalter `reminders.onAssign`, der nichts anderes
 * steuerte.
 */

/**
 * Die Person `id` aus dem Zustand nehmen — samt allem, was auf sie zeigt:
 * Referenzen lösen (Gruppenleitung, Konto, offene Codes); Namen in bereits
 * geplanten Wochen bleiben als Text stehen.
 *
 * **Die `pid` muss dabei weg** (T38): sie ist ein Fremdschlüssel, und ohne
 * Ziel zeigt sie ins Leere. `gehoertZu` entscheidet über die Id, fände
 * niemanden mehr, und der Slot zählte nirgends — weder in der Auslastung noch
 * in den Konflikten noch in den Aufgaben. Ohne Id greift wieder der Namensweg;
 * legt der Planer dieselbe Person neu an, findet `pidsNachtragen` sie beim
 * nächsten Laden wieder.
 *
 * Hierher führt das Löschen (`removePerson`). Bis zur Phase 6b (T121) auch das
 * Verwerfen einer Person, die beim Verlassen des Details keinen Namen hatte —
 * seither nehmen „Person anlegen" und „Person bearbeiten" keinen leeren Namen
 * an.
 */
function ohnePerson(state: AppState, id: string): AppState {
  return {
    ...state,
    weeks: dropPersonPid(state.weeks, id),
    fsWeeks: fsDropPersonPid(state.fsWeeks, id),
    persons: state.persons.filter((p) => p.id !== id),
    // Ihre Abwesenheiten gehen mit: Eine Abwesenheit ohne Person gehört
    // niemandem (`absence.ts`), und mit toter Id stünde sie hier bis zum
    // nächsten Laden herum (T118). Die Datenbank räumt `persist.ts`.
    absences: state.absences.filter((a) => a.personId !== id),
    groups: aemterBeenden(state.groups, id),
    // Ein Gruppenbesuch verliert seinen Besucher, nicht sich selbst — wie
    // die Datenbank (`on delete set null`). Der Plan zeigt ihn dann ohne
    // Besucher, und der Planer setzt einen neuen ein.
    gruppenbesuche: state.gruppenbesuche.some((b) => b.pid === id)
      ? state.gruppenbesuche.map((b) => (b.pid === id ? { ...b, pid: null } : b))
      : state.gruppenbesuche,
    // Ebenso ein vorgemerkter Vortrag (T122): Es bleibt der Name, den die
    // Woche beim Anlegen erneut einer Person zuzuordnen versucht.
    vortraege: state.vortraege.some((v) => v.pid === id)
      ? state.vortraege.map((v) => (v.pid === id ? { ...v, pid: null } : v))
      : state.vortraege,
    // Trolley-Termine wie in der Datenbank: Wer eingetragen hat, nimmt seinen
    // Termin mit (`on delete cascade`); als Partner fehlt er nur — der andere
    // sucht wieder einen (`on delete set null`).
    trolleyTermine: state.trolleyTermine.some((t) => t.pid === id || t.partner === id)
      ? state.trolleyTermine
          .filter((t) => t.pid !== id)
          .map((t) => (t.partner === id ? { ...t, partner: null, gemeinsam: false } : t))
      : state.trolleyTermine,
    members: state.members.map((m) => (m.personId === id ? { ...m, personId: null } : m)),
    // Ihr Anmelde-Link geht mit ihr (`on delete cascade`).
    anmeldeLinks: state.anmeldeLinks.filter((l) => l.personId !== id),
  }
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
  const abwesend = me ? buildAbsences(state.absences, weeks, state.congregation.times) : undefined
  const substituteReqs = me
    ? deriveSubstituteReqs(weeks, state.services, state.confirmations, me, state.congregation.times, abwesend)
        .filter((req) => !istVorbei(req.at)) // niemand springt für gestern ein
        .map((req) => markieren(req, req.key))
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
    s.services,
    s.confirmations,
    s.congregation.times,
    s.absences,
    // „Plan gesendet" gibt die freien Plätze einer Woche frei (`offenePlaetze`).
    // Heute ändert es sich nur beim Laden — der Wächter verlangt es trotzdem:
    // Was die Ableitung liest, steht hier.
    s.sentLog,
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
  const next = ohneEntzogene(state, ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action)))
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

/** Eine neue Kennung für einen Eintrag eines Weiteren Plans — eindeutig und lesbar, wie bei den Besuchen. */
function neueEintragId(): string {
  return `e${crypto.randomUUID()}`
}

/**
 * Die Nachricht beim Absagen (T121) als letztes Atom der Mitteilung — oder
 * nichts, wenn keine geschrieben wurde.
 *
 * **Ein eigenes Atom, als Freitext gekennzeichnet**: Der Planer liest sie so,
 * wie sie geschrieben wurde, in jeder Sprache — der Übersetzer der Glocke
 * reicht ein gekennzeichnetes Atom unverändert weiter. Ein „ · " darin würde
 * sie an der Atomgrenze zerteilen und die Kennzeichnung brechen; es wird zum
 * Komma.
 */
function nachrichtAtom(nachricht: string | undefined): string {
  const text = nachricht?.trim().split(' · ').join(', ')
  return text ? ` · ${alsFreitext(text)}` : ''
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
      /*
       * **Abmelden leert den Bestand, nicht nur die Ansicht** (16.10.2026).
       *
       * Bis dahin stand hier der alte Zustand mit zurückgesetzter Ansicht:
       * Personen, Wochen, „Meine Aufgaben", Konto und Versammlung blieben
       * stehen. Meldete sich am selben Gerät jemand anderes an, legte ihm
       * `login` das Bestätigungsblatt des Vorgängers vor — mit dessen
       * Aufgaben, Namen und Versammlung im Menü, bis die eigenen Daten geladen
       * waren. Eine Absage daraus ging als Verhinderung des Vorgängers an die
       * eigenen Planer.
       *
       * Was bleibt, gehört dem Gerät (`Vorlieben`). Alles Übrige der Ansicht —
       * Reiter, Blätter, Sprungziel, Offline-Stand, Begrüßung — beginnt wie
       * beim Start der App.
       */
      return leererZustand({ theme: state.theme, fontScale: state.fontScale, lang: state.lang })
    case 'navigate': {
      // Rechteprüfung: Wer den Bildschirm nicht sehen darf, landet im Programm.
      // Dieselbe Liste bestückt die Navigation (AppShell) — eine Antwort, zwei
      // Fragesteller.
      const rechte = rechteVon(state)
      const erlaubteZiele = erlaubteScreens(rechte)
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
      if (screen === 'planen' && !darfPlanen(rechte, themaVon(wunsch))) {
        if (action.thema === undefined) wunsch = 'fs'
        else screen = 'programm'
      }
      // Vier Tabs sind keine Zusammenkunft und nicht überall erlaubt:
      // „Treffpunkte" und „Weitere Pläne" (T120) gibt es in Programm und
      // Planen, „Bearbeiten" (T64) **nur** im Planen — das Programm ist für alle
      // nur lesend — und nur für Admin und Planer: Bearbeiten heißt den Plan
      // ändern (bis zum 15.10.2026 nur der Admin). Die Zusagen (T121) ebenfalls nur im Planen. Beim Wechsel woandershin auf die Zusammenkunft unter der
      // Woche zurücksetzen, sonst stünde die Ansicht auf einem Reiter, den es
      // dort nicht gibt. Die beiden Zusammenkünfte stehen nicht in der Liste —
      // sie gibt es überall.
      const erlaubt: Partial<Record<MeetingTab, boolean>> = {
        fs: screen === 'programm' || screen === 'planen',
        edit: screen === 'planen' && rechte.zuteilen,
        wp: screen === 'programm' || screen === 'planen',
        // Die Zusagen der Woche (T121, Phase 5g) sieht, wer zuteilt — beim Planen.
        zusagen: screen === 'planen' && rechte.zuteilen,
      }
      const tab: MeetingTab = erlaubt[wunsch] === false ? 'mid' : wunsch
      const nachher = {
        ...state,
        screen,
        tab,
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
            screen === 'planen' && !darfPlanen(rechte, themaVon(wocheTab))
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
    case 'setNotifs':
      return { ...state, notifs: gelesenBehalten(action.notifs, state.notifs) }
    case 'markAllRead':
      return { ...state, notifs: state.notifs.map((n) => ({ ...n, read: true })) }
    case 'mitteilungGelesen':
      return state.notifs.some((n) => n.id === action.id && !n.read)
        ? { ...state, notifs: state.notifs.map((n) => (n.id === action.id ? { ...n, read: true } : n)) }
        : state
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
      return { ...state, selectedPersonId: action.id }
    case 'removePerson':
      return { ...ohnePerson(state, action.id), selectedPersonId: null, toast: toastKey(state, 'toastPersonDel') }
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
      // Wer die Gruppe wechselt, ist in der alten weder Aufseher noch Gehilfe:
      // Er gehört ihr nicht mehr an (`aemterBeenden`, 14.10.2026). Seine
      // Ämter in der Gruppe, der er jetzt angehört, bleiben — bei derselben
      // Gruppe noch einmal also alle.
      if ('grp' in action.patch) next.groups = aemterBeenden(state.groups, action.id, action.patch.grp ?? null)
      // Namensänderung in bereits geplanten Wochen nachziehen — der
      // Anzeigename ist der in den Wochen gespeicherte Text. Die Zusagen
      // bleiben stehen: Sie hängen am Platz, und die Person darauf ist dieselbe.
      if (oldPerson && ('fn' in action.patch || 'ln' in action.patch)) {
        const oldName = displayName(oldPerson)
        const newPerson = { ...oldPerson, ...action.patch }
        const newName = displayName(newPerson)
        if (oldName !== newName) {
          // Einen doppelten Namen nimmt „Person bearbeiten" gar nicht erst an
          // (T110), und den Rest sichert der Index `persons_name_eindeutig`:
          // Der alte Name gehört also genau dieser Person.
          next.weeks = renameInWeeks(state.weeks, action.id, oldName, newName)
          // Treffpunkte sind die zweite Datenquelle und tragen den Leiter
          // ebenfalls als Text — ohne dies stand dort weiter der alte Name,
          // während die Zusammenkünfte längst den neuen zeigten.
          next.fsWeeks = fsRenameLeader(state.fsWeeks, action.id, oldName, newName)
        }
      }
      // Admin-Recht in verknüpfte Konten spiegeln (members.planner = Quelle der
      // Rechteprüfung); das eigene Konto ist per UI-Sperre ausgenommen. Wer
      // noch keines hat, bekommt es bei der ersten Anmeldung aus der
      // Vormerkung (Function `anmelden`).
      if ('plannerVorgemerkt' in action.patch) {
        const on = Boolean(action.patch.plannerVorgemerkt)
        next.members = state.members.map((m) =>
          m.personId === action.id && m.userId !== state.userId ? { ...m, planner: on } : m,
        )
      }
      // Ebenso das Planer-Recht (4.10.2026). Vom eigenen Konto aus nimmt es
      // sich niemand: Wer es hat, sieht die Personen gar nicht — und dem Admin
      // nimmt es nichts.
      if ('zuteilerVorgemerkt' in action.patch) {
        const on = Boolean(action.patch.zuteilerVorgemerkt)
        next.members = next.members.map((m) =>
          m.personId === action.id && m.userId !== state.userId ? { ...m, zuteiler: on } : m,
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
    case 'moveService': {
      const services = dienstVerschieben(state.services, action.key, action.dir)
      return services === state.services ? state : { ...state, services }
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
    case 'updateGroup': {
      const vorher = state.groups.find((g) => g.id === action.id)
      const neuerName = action.patch.name
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
        // Ein neuer Name zieht durch die geplante Reinigung — sie kennt die
        // Gruppe nur beim Namen (`gruppeInWochenUmbenennen`).
        weeks:
          vorher && neuerName !== undefined
            ? gruppeInWochenUmbenennen(state.weeks, state.services, vorher.name, neuerName)
            : state.weeks,
      }
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
    case 'removeMember': {
      // Mit dem Konto geht der Link der Person — sonst käme sie mit ihm gleich
      // wieder herein, und die Function legte ihr ein neues Konto an.
      const personId = state.members.find((m) => m.userId === action.userId)?.personId
      return {
        ...state,
        members: state.members.filter((m) => m.userId !== action.userId),
        anmeldeLinks: personId ? state.anmeldeLinks.filter((l) => l.personId !== personId) : state.anmeldeLinks,
        toast: toastKey(state, 'toastMitgliedEntfernt'),
      }
    }
    case 'linksAusgestellt': {
      // Ein neuer Link ersetzt den alten derselben Person.
      const neu = new Set(action.links.map((l) => l.personId))
      return { ...state, anmeldeLinks: [...state.anmeldeLinks.filter((l) => !neu.has(l.personId)), ...action.links] }
    }
    case 'startImport':
      return state.importing ? state : { ...state, importing: true }
    case 'addImportedWeek': {
      // Dieselbe Woche ein zweites Mal: nichts anhängen. Gespeichert überschrieb
      // sie die schon geplante Woche gleichen Montags mit einer leeren — so kam
      // sie, solange `import-week` mangels neuerer Woche die letzte erneut schickte.
      if (state.weeks.some((w) => w.start === action.week.start)) {
        return { ...state, importing: false, toast: toastKey(state, 'toastAlleWochen') }
      }
      // Endzeiten, Zusätzliche Klasse, Gedächtnismahl, Treffpunkte: dieselbe
      // Einordnung wie im Skript `wochen-importieren.mjs` (`neue-woche.ts`).
      const { week, fsWeek } = neueWocheEinordnen(action.week, {
        zeiten: state.congregation.times,
        auxClass: state.auxClass,
        fsRules: state.fsRules,
        gruppenbesuche: state.gruppenbesuche,
        vortraege: state.vortraege,
        persons: state.persons,
      })
      return {
        ...state,
        weeks: [...state.weeks, week],
        // Die Treffpunkte laufen parallel (`fsWeeks[wi]` gehört zu `weeks[wi]`).
        // Ohne diese Zeile hatte die neue Woche bis zum Neuladen keine, und was
        // man dort hinzufügte, fand seine Woche nicht und ging verloren.
        fsWeeks: [...state.fsWeeks, fsWeek],
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
    case 'mergeWeekAlt': {
      // Nachgeladene Sprachvarianten in die bestehende Woche mischen — in die
      // mit diesem Montag. Bis zum 15.10.2026 stand hier der Index vom Beginn
      // des Abrufs; lud die App inzwischen neu und hatte sich das Fenster
      // verschoben, bekam die Nachbarwoche die Texte. Gibt es die Woche nicht
      // mehr, ändert sich nichts.
      if (!action.start || !state.weeks.some((w) => w.start === action.start)) return state
      return {
        ...state,
        weeks: state.weeks.map((w) => (w.start === action.start ? { ...w, alt: { ...w.alt, ...action.alt } } : w)),
      }
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
        // Wer hier einen Platz verliert, von dem er wusste (zugesagt oder
        // gemeldet), erfährt es sofort — persist.ts liest das aus dem
        // Vorher/Nachher-Vergleich und ruft `send-plan` mit 'entzug' (T99).
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
      const abwesend = buildAbsences(state.absences, state.weeks, state.congregation.times)
      // Nacheinander, nicht nebeneinander: Die zweite Zusammenkunft sieht, wen
      // die erste schon eingeteilt hat — die Auslastung zählt sie mit.
      let weeks = state.weeks
      let count = 0
      let unfilled = 0
      for (const tab of umfangTabs(state, action.umfang)) {
        const r = autoAssignMeeting(weeks, state.week, tab, state.persons, state.services, state.groups, action.scope, abwesend)
        weeks = r.weeks
        count += r.count
        unfilled += r.unfilled
      }
      if (count === 0) {
        // Offen gebliebene, aber nicht besetzbare Slots (keine passende/freie
        // Person) klar von „nichts offen“ unterscheiden.
        const key = unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen'
        return { ...state, toast: toastKey(state, key) }
      }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(state.confirmations, geaenderteSlotsIm(state, weeks, action.umfang)),
        toast: toastKey(state, 'toastAutoN', { n: count }),
      }
    }
    case 'clearAssignments': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      let weeks = state.weeks
      let count = 0
      for (const tab of umfangTabs(state, action.umfang)) {
        const r = clearAssignments(weeks, state.week, tab, action.scope)
        weeks = r.weeks
        count += r.count
      }
      if (count === 0) return { ...state, toast: toastKey(state, 'toastGeleertN', { n: 0 }) }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(state.confirmations, geaenderteSlotsIm(state, weeks, action.umfang)),
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
        ...action.rule,
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
      // Zeit und Ort gehen nur bei den Treffpunkten dieser Regel auf die Regel
      // zurück; die übrigen behalten, was ihre Woche hat (`regenFsWeeks`).
      const dieseRegel = (inst: FsInstance) => inst.ruleId === action.id
      return { ...state, fsRules, fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules, dieseRegel) }
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
    case 'besuchHinzufuegen': {
      // Dieselbe Gruppe in derselben Woche gibt es nur einmal (so auch die Datenbank).
      if (state.gruppenbesuche.some((b) => b.woche === action.woche && b.grp === action.grp)) return state
      // Wie die Regeln des Grundplans: eindeutig und lesbar (`fsRuleAdd`).
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
    case 'besuchAendern': {
      // Woche oder Gruppe eines Besuchs ändern (4.10.2026): Der Besucher geht
      // aus den Treffpunkten, die er bisher leitete, und tritt in die der neuen
      // Woche und Gruppe — wie beim Wechsel des Besuchers.
      const alt = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!alt) return state
      const neu = { ...alt, ...action.patch }
      if (neu.woche === alt.woche && neu.grp === alt.grp) return state
      // Dieselbe Gruppe in derselben Woche gibt es nur einmal (so auch die Datenbank).
      if (state.gruppenbesuche.some((b) => b !== alt && b.woche === neu.woche && b.grp === neu.grp)) return state
      // Vergangenes bleibt als Rückblick, und dorthin verlegt wird auch nicht.
      const lage = besuchsLage(state)
      if (besuchStand(alt, lage).art === 'vorbei' || besuchStand(neu, lage).art === 'vorbei') return state
      const fsWeeks = besuchEintragen(besuchAustragen(state.fsWeeks, lage.kennungen, alt), lage.kennungen, neu, state.persons)
      return { ...state, gruppenbesuche: nachWoche(state.gruppenbesuche.map((b) => (b === alt ? neu : b))), fsWeeks }
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
    case 'vortragsplanUebernehmen': {
      // Neu gerechnet mit dem Stand von jetzt — die Vorschau kann ein anderer
      // Planer inzwischen überholt haben (`data/vortragsplan.ts`).
      const heute = new Date()
      const vorschau = vortragsplanVorschau(action.plan, {
        weeks: state.weeks,
        vormerkungen: state.vortraege,
        persons: state.persons,
        zeiten: state.congregation.times,
        heute,
      })
      const { weeks, vormerkungen, geaendert } = vortragsplanAnwenden({
        vorschau,
        weeks: state.weeks,
        vormerkungen: state.vortraege,
        neueId: () => `v${crypto.randomUUID()}`,
        heute,
      })
      return {
        ...state,
        weeks,
        vortraege: vormerkungen,
        // Wie beim Zuteilen von Hand: Wer seinen Vortrag verliert, verliert die
        // Zusage — und erfährt es (`persist.ts`, Entzug).
        confirmations: dropConfirmations(
          state.confirmations,
          geaendert.flatMap((wi) => geaenderteSlots(state.weeks, weeks, wi, 'we', state.services)),
        ),
        toast: toastKey(state, 'toastVortraegeUebernommen'),
      }
    }
    /*
     * Trolleys (T121, Phase 7). Die Trolleys pflegt der Admin; Termine ändert
     * nur die Edge Function `trolley` — hier landet, was sie zurückgibt
     * (`trolleyTermin`). Entfernt wird ein Trolley erst nach ihr
     * (`trolleyEntfernt`): Sie hat ihn samt Terminen gelöscht und den
     * Eingetragenen Bescheid gesagt.
     */
    case 'trolleyAnlegen':
      if (state.trolleys.some((t) => t.id === action.trolley.id)) return state
      return { ...state, trolleys: [...state.trolleys, action.trolley] }
    case 'trolleyAendern': {
      const alt = state.trolleys.find((t) => t.id === action.id)
      // Ohne Namen ist es kein Trolley — die Datenbank weist ihn ab.
      if (!alt || action.patch.name?.trim() === '') return state
      return { ...state, trolleys: state.trolleys.map((t) => (t === alt ? { ...alt, ...action.patch } : t)) }
    }
    case 'trolleyEntfernt':
      if (!state.trolleys.some((t) => t.id === action.id)) return state
      return {
        ...state,
        trolleys: state.trolleys.filter((t) => t.id !== action.id),
        // Seine Termine gingen in der Datenbank per Kaskade mit.
        trolleyTermine: state.trolleyTermine.filter((t) => t.trolleyId !== action.id),
        toast: toastKey(state, 'toastTrolleyEntfernt'),
      }
    case 'trolleyTermin': {
      // Einen Termin räumen, den es hier nicht (mehr) gibt, ändert nichts.
      if (!action.termin && !state.trolleyTermine.some((t) => t.id === action.id)) return state
      const ohne = state.trolleyTermine.filter((t) => t.id !== action.id)
      return {
        ...state,
        trolleyTermine: action.termin ? termineSortiert([...ohne, action.termin]) : ohne,
        ...(action.toast ? { toast: toastKey(state, TROLLEY_TOAST[action.toast]) } : {}),
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
      // Ein anderer Takt verteilt ab jetzt neu, in derselben Reihenfolge
      // (`taktWechseln`); ohne das gingen die Einträge unten alle, weil kein
      // Montag ein Monat ist.
      const wechsel =
        taktVon(plan) === taktVon(alt)
          ? null
          : taktWechseln({ plan, eintraege: state.planEintraege, groups: state.groups, heute: new Date(), neueId: neueEintragId })
      const meldung = veroeffentlicht
        ? toastKey(state, 'toastWpVeroeffentlicht')
        : zurueck
          ? toastKey(state, 'toastWpEntwurf')
          : wechsel?.verteilt
            ? toastKey(state, taktVon(plan) === 'monat' ? 'toastWpVerteiltMonate' : 'toastWpVerteilt', { n: wechsel.verteilt })
            : null
      return {
        ...state,
        plaene: planNachDatum(state.plaene.map((p) => (p === alt ? plan : p))),
        planEintraege: eintraegeImZeitraum(wechsel?.eintraege ?? state.planEintraege, plan),
        ...(meldung ? { toast: meldung } : {}),
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
      if (!plan) return state
      const { eintraege, verteilt } = gruppenVerteilen({
        plan,
        eintraege: state.planEintraege,
        groups: state.groups,
        abGruppe: action.abGruppe,
        heute: new Date(),
        neueId: neueEintragId,
      })
      const meldung = taktVon(plan) === 'monat' ? 'toastWpVerteiltMonate' : 'toastWpVerteilt'
      return { ...state, planEintraege: eintraege, toast: toastKey(state, meldung, { n: verteilt }) }
    }
    case 'wpEintragSetzen': {
      if (!state.plaene.some((p) => p.id === action.planId)) return state
      const eintraege = eintragSetzen({ ...action, eintraege: state.planEintraege, neueId: neueEintragId })
      return eintraege === state.planEintraege ? state : { ...state, planEintraege: eintraege }
    }
    case 'persoenlichBescheid': {
      // Nur an einer Zeile ohne Konto — dieselbe Grenze zieht die Datenbank
      // (`persoenlich_bescheid`). Was dort nicht steht, ist niemandem zu sagen.
      const schluessel = sentKey(action.key, action.name)
      if (!(schluessel in state.persoenlich)) return state
      const wann = action.ja ? new Date().toISOString() : null
      return { ...state, persoenlich: { ...state.persoenlich, [schluessel]: wann } }
    }
    case 'openMyTask':
      return { ...state, myTaskId: action.id }
    case 'closeMyTask':
      return { ...state, myTaskId: null }
    // Das Absage-Blatt ersetzt das Aufgaben-Blatt, statt darüber zu liegen:
    // Zurück führt dann nicht durch zwei Blätter derselben Aufgabe.
    case 'openAbsage':
      return { ...state, absageId: action.id, myTaskId: null }
    case 'closeAbsage':
      return { ...state, absageId: null }
    case 'confirmAll': {
      // Alle offenen auf einmal (T121) — dieselbe Zusage wie einzeln, je Aufgabe.
      const offen = state.myTasks.filter((t) => t.status === 'offen')
      if (offen.length === 0) return state
      const confirmations = { ...state.confirmations }
      for (const t of offen) confirmations[t.id] = 'bestätigt'
      return { ...state, confirmations, toast: toastKey(state, 'toastBestaetigt') }
    }
    case 'confirmTask':
      // Status in die ConfirmationMap — myTasks und confirmOpen folgen aus der
      // Ableitung (withDerivedTasks). Ein offenes Ersatzgesuch hält das Blatt
      // dort ebenfalls (T69).
      return {
        ...state,
        confirmations: { ...state.confirmations, [action.id]: 'bestätigt' },
        myTaskId: null,
        absageId: null,
        toast: toastKey(state, 'toastBestaetigt'),
      }
    case 'declineTask': {
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
        `${bezeichnung} — ${alsFreitext(currentUserName(state))}${nachrichtAtom(action.nachricht)}`,
        // Der Schlüssel der Aufgabe: Ein Tipp in der Glocke des Planers führt
        // in ihre Woche (`mitteilungsZiel`). Bis zum 4.10.2026 ohne — dann
        // landete er nirgends.
        action.id,
      )
      // Bei Hilfsdiensten wird automatisch ein Ersatz gesucht (Ersatzgesuch) →
      // eigener Toast; sonst nur die Verhinderungs-Meldung an den Planer.
      const declineToast = helperKeyParts(action.id) ? 'toastErsatzGesucht' : 'toastVerhindert'
      return {
        ...state,
        confirmations: { ...state.confirmations, [action.id]: 'verhindert' },
        notifs: [notif, ...state.notifs],
        myTaskId: null,
        absageId: null,
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
    case 'platzUebernehmen': {
      // Nur, was angeboten ist — dieselbe Liste, aus der der Knopf stammt. Ein
      // veralteter Tipp (inzwischen vergeben, Plan zurückgezogen) ändert nichts.
      // Geschrieben wird serverseitig (`persist` → `platzFuellen`); hier steht
      // nur, was der Bildschirm bis zum nächsten Laden zeigt.
      const platz = state.offenePlaetze.find((p) => p.key === action.key)
      const me = eigenePerson(state)
      const sel = platzAuswahl(state.weeks, state.services, action.key)
      if (!platz || !me || !sel) return state
      const weeks = assignSlot(state.weeks, sel, displayName(me), undefined, me.id)
      if (weeks === state.weeks) return state
      return {
        ...state,
        weeks,
        // Wer sich selbst einträgt, hat zugesagt — wie beim Einspringen.
        confirmations: { ...state.confirmations, [action.key]: 'bestätigt' },
        toast: toastKey(state, platz.schonHeute.length > 0 ? 'toastUebernommenKonflikt' : 'toastPlatzUebernommen'),
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
    case 'lacTitel': {
      // Der Titel wechselt, die Kennung bleibt — Zuteilungen und Zusagen hängen
      // an ihr und gehen mit.
      const weeks = lacTitel(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.title)
      return weeks === state.weeks ? state : { ...state, weeks }
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
      if (!state.weeks[state.week]) return state
      // Was der Anlass jemandem nimmt, der davon wusste — der Dienstvortrag an
      // der Stelle des Bibelstudiums —, räumt `ohneEntzogene` ab, und `persist`
      // meldet es ihm.
      return { ...state, weeks: setAnlass(state.weeks, state.week, action.art) }
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
    case 'changeReminder':
    case 'setReminder': {
      // Schrittweise (− und +) oder unmittelbar (die Wahl der letzten
      // Erinnerung) — beide Wege enden an denselben Grenzen, die auch die
      // Datenbank prüft. Ein Wert darüber hinaus wird geklemmt, nicht
      // abgewiesen: So schreibt `persist` nie etwas, das die Spalte ablehnt.
      const { min, max } = ERINNERUNG_GRENZEN[action.key]
      const gewuenscht = action.type === 'setReminder' ? action.value : state.reminders[action.key] + action.delta
      const value = Math.max(min, Math.min(max, gewuenscht))
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
      // „Später" (T121): Das Blatt lässt sich weglegen, auch wenn noch etwas zu
      // bestätigen ist. Beim nächsten Öffnen der App liegt es wieder da (`login`).
      return { ...state, confirmOpen: false }
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
    case 'setCongLang': {
      // Wird eine weitere Programmsprache zur Sprache der Versammlung, ist sie
      // keine weitere mehr — sonst stand sie zweimal da („Englisch, Englisch").
      const progLangs = state.progLangs.filter((c) => c !== action.code)
      return {
        ...state,
        congLang: action.code,
        progLangs: progLangs.length === state.progLangs.length ? state.progLangs : progLangs,
        langSheetOpen: false,
        langSearch: '',
      }
    }
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
        zuteiler: p.zuteiler ?? false,
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
        // Momentaufnahmen von vor T122 kennen die Vormerkungen nicht.
        vortraege: p.vortraege ?? [],
        // Momentaufnahmen von vor T121 kennen die Trolleys nicht.
        trolleys: p.trolleys ?? [],
        trolleyTermine: p.trolleyTermine ?? [],
        plaene: p.plaene ?? [],
        planEintraege: p.planEintraege ?? [],
        absences: p.absences,
        notifs: gelesenBehalten(p.notifications, state.notifs),
        confirmations: p.confirmations,
        // Aus einer alten Momentaufnahme (lib/snapshot.ts) fehlt das Feld — sie
        // wurde geschrieben, bevor es das Tagebuch gab.
        sentLog: p.sentLog ?? {},
        // Ebenso aus einer Momentaufnahme vor Phase 5g.
        persoenlich: p.persoenlich ?? {},
        reminders: p.reminders,
        auxClass: p.auxClass,
        congLang: p.congLang,
        progLangs: p.progLangs,
        members: p.members,
        anmeldeLinks: p.anmeldeLinks ?? [],
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
