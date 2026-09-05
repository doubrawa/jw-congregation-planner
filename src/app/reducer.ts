/**
 * Reiner App-Reducer — portiert die State-Übergänge der Prototyp-Logikklasse
 * (docs/design-handoff). Keine Nebeneffekte: Persistenz übernimmt persist.ts,
 * den Startzustand liefert init.ts, den Provider stellt store.tsx.
 */

import { syncAuxSlots } from '../data/aux-class'
import { buildImportWeek } from '../data/testdaten'
import { buildAbsences } from '../data/absence'
import { currentWeekIndex, istVorbei, meetingTimesOf, naechsteZusammenkunft } from '../data/meeting-dates'
import { deriveMyFsTasks, fsAddInst, fsAutoAssign, fsClear, fsDropPersonPid, fsKennung, fsPendingIds, fsRemoveInst, fsRenameLeader, fsSetLeader, fsUpdateInst, fsWochenKennungen, regenFsWeeks } from '../data/fs'
import { displayName, linkFamily, mtab, aufseherGruppe, unlinkFamily } from '../data/helpers'
import { dropPersonPid, renameInWeeks } from '../lib/data'
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
  derivePendingIds,
  deriveSubstituteReqs,
  helperKeyParts,
  isGuestRole,
  shiftPartConfirmations,
  slotRolle,
  swapPartConfirmations,
  wochenIndex,
} from '../data/planning'
import {
  editTalkTheme,
  itemNameCount,
  lacAdd,
  lacAddIndex,
  lacAdjust,
  lacMove,
  lacMoveTarget,
  lacRemove,
  endeAusStartzeit,
  endenNachziehen,
  togglePartner,
  setAbweichung,
  setDienstwoche,
  setPartThema,
  setClosingSong,
  setOpeningSong,
} from '../data/meeting-edit'
import { setAnlass, setAnlassTermin } from '../data/anlass'
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
 * Planen-Screen — Konflikte, offene Plätze, Engpässe und das „…" an jedem
 * unbestätigten Platz. Dafür braucht es keine Nachricht.
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
  return !`${p.fn}${p.ln}${p.dn ?? ''}`.trim()
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

/** Anzeigename des eingeloggten Nutzers. */
function currentUserName(state: AppState): string {
  const id = state.personId
  const me = state.persons.find((p) => p.id === id)
  return me ? displayName(me) : ''
}

/**
 * Produktionsmodus: myTasks/pendingIds aus Wochen + Bestätigungen ableiten
 * (im Demo-Modus bleiben die Demo-Daten unangetastet). `openConfirm` öffnet
 * nach der Hydration das Bestätigungs-Modal, falls offene Aufgaben existieren.
 */
function withDerivedTasks(state: AppState, openConfirm: boolean): AppState {
  if (state.dataStatus === 'demo') return state
  const me = state.persons.find((p) => p.id === state.personId)
  // Aufgaben-Titel in der Programmsprache des Nutzers ableiten (Sprachvariante
  // der Wochen, falls vorhanden) — Slot-Pfade/Namen sind variantenunabhängig.
  const jwCode = state.lang !== congAppCode(state.congLang) ? APP_TO_JW[state.lang] : undefined
  const weeks = localizedWeeks(state.weeks, jwCode)
  // Einmal für beide Ableitungen unten — dieselben Wochen, dieselbe Basis.
  const kennungen = fsWochenKennungen(weeks, state.fsBase)
  // Zusammenkunfts-Aufgaben und Treffpunkt-Leitungen kommen aus zwei getrennten
  // Quellen (`weeks` und `fsWeeks`) und bleiben es auch — sie zählen nicht in
  // dieselbe Auslastung. Für den Nutzer sind es aber beides Aufgaben: ein
  // zugeteilter Treffpunkt-Leiter sah seine Einteilung bisher weder unter
  // „Meine Aufgaben" noch konnte er sie bestätigen.
  const myTasks = me
    ? [
        ...deriveMyTasks(weeks, state.services, displayName(me), state.confirmations, state.congregation.meetings, me.id),
        ...deriveMyFsTasks(
          state.fsWeeks,
          kennungen,
          displayName(me),
          state.confirmations,
          me.id,
          dict(state.lang).fsLeiterLbl,
        ),
      ]
        /*
         * Vergangenes fällt heraus (T77). Eine Aufgabe von letzter Woche legte
         * sich beim Öffnen zum Bestätigen vor, stand auf dem Start-Bildschirm
         * als „nächste Aufgabe" (die Liste ist nach Termin sortiert, das
         * Vergangene steht also vorn) und zählte in „noch zu bestätigen" mit.
         * Bestätigen kann man nichts mehr, was vorbei ist.
         *
         * Die „…"-Markierung im Planen bleibt davon unberührt: Sie ist die
         * Auskunft des Planers darüber, wer nie zugesagt hat, und die gilt auch
         * hinterher noch.
         */
        .filter((task) => !istVorbei(task.at))
        .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
    : []
  const substituteReqs = me
    ? deriveSubstituteReqs(
        weeks,
        state.services,
        state.confirmations,
        me,
        state.congregation.meetings,
        buildAbsences(state.absences, weeks, state.fsBase, state.congregation.meetings),
      ).filter((req) => !istVorbei(req.at)) // niemand springt für gestern ein
    : []
  return {
    ...state,
    myTasks,
    // Beide Datenquellen, wie bei `myTasks` eine Zeile darüber: die
    // „…"-Markierung im Plan gilt für Zusammenkünfte **und** Treffpunkte.
    // Stand hier nur `derivePendingIds`, überschrieb diese Zeile die Kennung,
    // die der Reducer beim Zuteilen eines Treffpunkt-Leiters gerade erst
    // aufgebaut hatte (siehe `fsPendingIds`).
    pendingIds: [
      ...new Set([
        ...derivePendingIds(weeks, state.services, state.confirmations),
        ...fsPendingIds(state.fsWeeks, kennungen, state.confirmations),
      ]),
    ],
    substituteReqs,
    // Das Blatt beim Öffnen zeigt beides: unbestätigte Zuteilungen und offene
    // Ersatzgesuche (T69). Ein Gesuch erreichte bis dahin nur, wer von selbst
    // unter „Aufgaben" nachsah oder über einen Push hereinkam — die übrigen
    // erfuhren nie davon. Es ist dieselbe Vorlage, nicht eine zweite Mechanik.
    confirmOpen: (openConfirm || state.confirmOpen) && vorzulegen(myTasks, substituteReqs),
  }
}

/**
 * Woche und Reiter auf die nächste Zusammenkunft setzen (T82) — es sei denn,
 * der Nutzer hat in dieser Sitzung schon selbst gewählt.
 *
 * Gibt es keine nächste (keine Wochen geladen, alle Termine vorbei), bleibt
 * alles stehen: eine Ansicht auf gut Glück zu verschieben wäre schlechter als
 * die, auf der man ist.
 */
function zurNaechstenZusammenkunft(state: AppState): AppState {
  if (state.terminGewaehlt) return state
  const naechste = naechsteZusammenkunft(state.weeks, state.congregation.meetings)
  return naechste ? { ...state, week: naechste.wi, tab: naechste.tab } : state
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
    s.dataStatus,
    s.personId,
    s.persons,
    s.lang,
    s.congLang,
    s.weeks,
    s.fsWeeks,
    s.fsBase,
    s.services,
    s.confirmations,
    s.congregation.meetings,
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
  const next = baseReducer(state, action)
  // `hydrate` ist der einzige Sonderfall: Es legt zusätzlich das
  // Bestätigungs-Blatt vor, wenn etwas offen ist.
  if (action.type === 'hydrate') return withDerivedTasks(next, true)
  return quellenGeaendert(state, next) ? withDerivedTasks(next, false) : next
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
        terminGewaehlt: false,
        s89: null,
        confirmOpen: false,
        recovery: false,
        staleAt: null, // Offline-Stand gilt nur für die abgemeldete Sitzung
        welcomePending: false, // eine offene Begrüßung gilt nicht für die nächste Anmeldung
      }
    case 'navigate': {
      // Rechteprüfung: Nicht-Planer landen im Programm. Gruppenaufseher dürfen
      // zusätzlich Planen + Einstellungen (dort nur ihre Treffpunkte), aber nicht
      // Personen.
      const plannerOnly: Screen[] = ['planen', 'personen', 'einstellungen']
      const fsOverseer =
        aufseherGruppe(state.planner, state.groups, state.personId) !== null
      const blocked =
        !state.planner &&
        plannerOnly.includes(action.screen) &&
        !(fsOverseer && action.screen !== 'personen')
      const screen = blocked ? 'programm' : action.screen
      // Zwei Tabs sind keine Zusammenkunft und nicht überall erlaubt: „Treffpunkte"
      // gibt es in Programm und Planen, „Bearbeiten" (T64) **nur** im Planen —
      // das Programm ist für alle nur lesend. Beim Wechsel woandershin auf die
      // Zusammenkunft unter der Woche zurücksetzen, sonst stünde die Ansicht auf
      // einem Reiter, den es dort nicht gibt.
      const erlaubt: Record<'fs' | 'edit', boolean> = {
        fs: screen === 'programm' || screen === 'planen',
        edit: screen === 'planen',
      }
      const tab: MeetingTab =
        (state.tab === 'fs' || state.tab === 'edit') && !erlaubt[state.tab] ? 'mid' : state.tab
      const nachher = {
        ...dropNamelessSelected(state),
        screen,
        tab,
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
      }
      // Programm und Planen öffnen mit der nächsten Zusammenkunft (T82) —
      // solange der Nutzer nicht selbst gewählt hat. Die Treffpunkte bleiben
      // unangetastet: Wer sie ansieht, meint sie und keine Zusammenkunft.
      const zeigtZusammenkunft = screen === 'programm' || screen === 'planen'
      return zeigtZusammenkunft && tab !== 'fs' ? zurNaechstenZusammenkunft(nachher) : nachher
    }
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
      // `migrateAssignmentPids` sie beim nächsten Laden wieder.
      return {
        ...state,
        weeks: dropPersonPid(state.weeks, action.id),
        fsWeeks: fsDropPersonPid(state.fsWeeks, action.id),
        persons: state.persons.filter((p) => p.id !== action.id),
        groups: state.groups.map((g) => ({
          ...g,
          ov: g.ov === action.id ? null : g.ov,
          as: g.as === action.id ? null : g.as,
        })),
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
      // Anzeigename ist der in den Wochen gespeicherte Text. Die
      // „…"-Markierung braucht das nicht mehr: sie hängt an der Person-Id.
      if (oldPerson && ('fn' in action.patch || 'ln' in action.patch || 'dn' in action.patch)) {
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
      if ('planner' in action.patch) {
        const on = Boolean(action.patch.planner)
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
    case 'removeService':
      return {
        ...state,
        services: state.services.filter((s) => s.key !== action.key),
        // Die Freigabe-Liste des gelöschten Dienstes darf nicht offen bleiben —
        // sie zeigte sonst Schalter für einen Bereich, den es nicht mehr gibt.
        svcSheet: state.svcSheet === action.key ? null : state.svcSheet,
        toast: toastKey(state, 'toastDienstDel'),
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
    case 'removeGroup':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        // Mitglieder der gelöschten Gruppe verlieren ihre Zuordnung
        persons: state.persons.map((p) => (p.grp === action.id ? { ...p, grp: null } : p)),
        toast: toastKey(state, 'toastGruppeDel'),
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
        action.patch.meetings !== undefined && action.patch.meetings !== state.congregation.meetings
          ? endenNachziehen(state.weeks, state.congregation.meetings, action.patch.meetings)
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
      return state.importing || state.imported ? state : { ...state, importing: true }
    case 'finishImport': {
      // Der simulierte Import gehört zur Entwickler-Ansicht: Er baut eine
      // **erfundene** Woche und wird nur aus dem Demo-Zweig des ImportPanels
      // ausgelöst. Ohne diese Grenze zieht `buildImportWeek` die Testdaten ins
      // ausgelieferte Bündel — nachgemessen am 13.8.2026, siehe bundle.test.ts.
      if (!import.meta.env.DEV) return state
      if (state.imported) return state
      const week = buildImportWeek()
      return {
        ...state,
        // Eine frisch importierte Woche kennt die Zusätzliche Klasse noch
        // nicht: ohne dieses Angleichen bliebe sie ohne zweite Platzreihe und
        // ohne Ratgeber — die Klasse würde ab dem nächsten Import verschwinden.
        weeks: syncAuxSlots([...state.weeks, week], state.auxClass),
        importing: false,
        imported: true,
        notifs: pushNotif(
          state.notifs,
          'import',
          'Programm importiert',
          `${week.range} · ${week.book} — ohne Zuteilungen`,
        ),
        toast: toastKey(state, 'toastImportiert'),
      }
    }
    case 'addImportedWeek': {
      // Endzeiten aus den Zusammenkunftszeiten rechnen. Der Import kennt sie
      // nicht und trug feste Werte ein (20:45 / 11:45) — bei einem Beginn um
      // 18:30 stand damit auf jedem Programmblatt eine falsche Endzeit.
      const zeiten = meetingTimesOf(state.congregation.meetings)
      const week: Week = {
        ...action.week,
        mid: { ...action.week.mid, end: endeAusStartzeit(zeiten.mid, action.week.mid.end) },
        we: { ...action.week.we, end: endeAusStartzeit(zeiten.we, action.week.we.end) },
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
      // Treffpunkt-Leiter: eigene Datenquelle (fsWeeks), kein Bestätigungs-Slot.
      if (sel.kind === 'fs') {
        const fsWeeks = fsSetLeader(
          state.fsWeeks,
          sel.wi,
          sel.instId,
          action.name,
          action.pid,
          action.extern,
        )
        // Neu zugeteilt heißt: noch nicht bestätigt. Über die Id geführt —
        // ohne Id (Gast) gibt es nichts zu markieren.
        const pendingIds =
          action.pid && !state.pendingIds.includes(action.pid)
            ? [...state.pendingIds, action.pid]
            : state.pendingIds
        return {
          ...state,
          fsWeeks,
          pendingIds,
          slotSel: null,
          toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
        }
      }
      const weeks = assignSlot(state.weeks, sel, action.name, action.rolle, action.pid, action.herkunft)
      // Externe Redner (Gastredner/Kreisaufseher) haben keinen Bestätigungs-Flow.
      //
      // Entscheidend ist die Rolle, die gerade **geschrieben** wurde — nicht das
      // Auswahl-Flag `sel.guest`. Das Flag sagt nur, dass es der Redner-Platz
      // ist; ob dort ein eigener Bruder oder ein Auswärtiger steht, sagt erst
      // die Rolle. Auf das Flag zu sehen war die zweite Hälfte von F1: der
      // eigene Redner bekam `pid` und Rolle „Redner", blieb aber trotzdem vom
      // Bestätigungs-Flow ausgenommen.
      const isGuest = isGuestRole(slotRolle(weeks, sel))
      const pendingIds =
        action.pid && !isGuest && !state.pendingIds.includes(action.pid)
          ? [...state.pendingIds, action.pid]
          : state.pendingIds
      return {
        ...state,
        weeks,
        pendingIds,
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
      const { weeks, count, newlyIds, unfilled } = autoAssignMeeting(
        state.weeks,
        state.week,
        mtab(state.tab),
        state.persons,
        state.services,
        state.groups,
        action.scope,
        buildAbsences(state.absences, state.weeks, state.fsBase, state.congregation.meetings),
      )
      if (count === 0) {
        // Offen gebliebene, aber nicht besetzbare Slots (keine passende/freie
        // Person) klar von „nichts offen“ unterscheiden.
        const key = unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen'
        return { ...state, toast: toastKey(state, key) }
      }
      const pending = new Set(state.pendingIds)
      for (const id of newlyIds) pending.add(id)
      return {
        ...state,
        weeks,
        pendingIds: [...pending],
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
      const { fsWeeks, count, newlyIds } = fsAutoAssign(
        state.fsWeeks,
        state.week,
        state.persons,
        action.onlyGroup,
        state.absences,
        fsKennung(state.weeks[state.week], state.fsBase, state.week),
        state.groups,
      )
      if (count === 0) return { ...state, toast: toastKey(state, 'toastKeineOffen') }
      const pending = new Set(state.pendingIds)
      for (const id of newlyIds) pending.add(id)
      return { ...state, fsWeeks, pendingIds: [...pending], toast: toastKey(state, 'toastAutoN', { n: count }) }
    }
    case 'fsClear': {
      const { fsWeeks, count } = fsClear(state.fsWeeks, state.week, action.onlyGroup)
      return { ...state, fsWeeks, toast: toastKey(state, 'toastGeleertN', { n: count }) }
    }
    case 'fsInstUpdate':
      return { ...state, fsWeeks: fsUpdateInst(state.fsWeeks, action.wi, action.id, action.patch) }
    case 'fsInstRemove':
      return {
        ...state,
        fsWeeks: fsRemoveInst(state.fsWeeks, action.wi, action.id),
        toast: toastKey(state, 'toastFsDel'),
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
        skipCong: action.grp !== '',
      }
      const fsRules = [...state.fsRules, rule]
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(fsWochenKennungen(state.weeks, state.fsBase), state.fsWeeks, fsRules),
        toast: toastKey(state, 'toastFsRuleAdd'),
      }
    }
    case 'fsRuleUpdate': {
      const fsRules = state.fsRules.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r))
      return { ...state, fsRules, fsWeeks: regenFsWeeks(fsWochenKennungen(state.weeks, state.fsBase), state.fsWeeks, fsRules) }
    }
    case 'fsRuleRemove': {
      const fsRules = state.fsRules.filter((r) => r.id !== action.id)
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(fsWochenKennungen(state.weeks, state.fsBase), state.fsWeeks, fsRules),
        toast: toastKey(state, 'toastFsRuleDel'),
      }
    }
    case 'openMyTask':
      return { ...state, myTaskId: action.id }
    case 'closeMyTask':
      return { ...state, myTaskId: null }
    case 'confirmTask': {
      // Produktionsmodus: Status in die ConfirmationMap — myTasks/pending-
      // Names/confirmOpen folgen aus der Ableitung (withDerivedTasks).
      if (state.dataStatus !== 'demo') {
        return {
          ...state,
          confirmations: { ...state.confirmations, [action.id]: 'bestätigt' },
          myTaskId: null,
          toast: toastKey(state, 'toastBestaetigt'),
        }
      }
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'bestätigt' as const } : t,
      )
      const stillOpen = myTasks.some((t) => t.status === 'offen')
      // Ist nichts mehr offen, verschwindet das „…" der eigenen Person — über
      // die Id, nicht über den Namen: bei Namensgleichheit verlor sonst auch
      // die andere Person ihre Markierung.
      const meineId = state.personId
      const pendingIds = stillOpen
        ? state.pendingIds
        : state.pendingIds.filter((id) => id !== meineId)
      return {
        ...state,
        myTasks,
        pendingIds,
        myTaskId: null,
        // Nicht `stillOpen`: ein offenes Ersatzgesuch hält das Blatt ebenfalls
        // (T69) — sonst verschwände es unter der Hand, sobald die letzte
        // Bestätigung gegeben ist.
        confirmOpen: state.confirmOpen && vorzulegen(myTasks, state.substituteReqs),
        toast: toastKey(state, 'toastBestaetigt'),
      }
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
        `${bezeichnung} — ${alsFreitext(currentUserName(state))}`,
      )
      // Bei Hilfsdiensten wird automatisch ein Ersatz gesucht (Ersatzgesuch) →
      // eigener Toast; sonst nur die Verhinderungs-Meldung an den Planer.
      const declineToast = helperKeyParts(action.id) ? 'toastErsatzGesucht' : 'toastVerhindert'
      if (state.dataStatus !== 'demo') {
        return {
          ...state,
          confirmations: { ...state.confirmations, [action.id]: 'verhindert' },
          notifs: [notif, ...state.notifs],
          myTaskId: null,
          toast: toastKey(state, declineToast),
        }
      }
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'verhindert' as const } : t,
      )
      return {
        ...state,
        myTasks,
        // Nicht nur „noch etwas offen?": ein Ersatzgesuch hält das Blatt ebenfalls
        // (T69) — sonst verschwände es unter der Hand, sobald die letzte
        // Bestätigung gegeben ist.
        confirmOpen: state.confirmOpen && vorzulegen(myTasks, state.substituteReqs),
        notifs: [notif, ...state.notifs],
        myTaskId: null,
        toast: toastKey(state, declineToast),
      }
    }
    case 'takeSubstitute': {
      const parts = helperKeyParts(action.key)
      const me = state.persons.find((p) => p.id === state.personId)
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
    case 'lacAdjust':
      return {
        ...state,
        weeks: lacAdjust(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.delta),
      }
    case 'lacRemove': {
      // Die folgenden Punkte rutschen eine Position nach vorn; task_keys sind
      // positionsbasiert, also müssen die Bestätigungen mit. Sonst erbt der
      // nachfolgende Punkt die fremde Bestätigung.
      const verschoben = shiftPartConfirmations(
        state.confirmations,
        state.weeks[state.week]?.start ?? '',
        mtab(state.tab),
        action.si,
        action.ii,
        -1,
      )
      return {
        ...state,
        weeks: lacRemove(state.weeks, state.week, mtab(state.tab), action.si, action.ii),
        confirmations: verschoben.map,
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
      const weeks = lacMove(state.weeks, state.week, mtab(state.tab), action.si, action.ii, action.dir)
      if (weeks === state.weeks) return state // Rand: kein Tausch
      // Bestätigungen der beiden getauschten Positionen mitnehmen (task_keys
      // sind positionsbasiert) — sonst erbt der Nachbar den fremden Status.
      const items = state.weeks[state.week]?.[mtab(state.tab)].sections[action.si]?.items ?? []
      const b = lacMoveTarget(items, action.ii, action.dir)
      const a = items[action.ii]
      const bItem = b == null ? undefined : items[b]
      const confirmations =
        b == null || !a || !bItem
          ? state.confirmations
          : swapPartConfirmations(
              state.confirmations,
              state.weeks[state.week]?.start ?? '',
              mtab(state.tab),
              action.si,
              action.ii,
              b,
              Math.max(itemNameCount(a), itemNameCount(bItem)),
            )
      return { ...state, weeks, confirmations }
    }
    case 'lacAdd': {
      const weeks = lacAdd(state.weeks, state.week, mtab(state.tab), action.si, action.title)
      if (weeks === state.weeks) return state // leerer Titel
      // Ab der Einfügestelle rutschen alle Punkte eine Position weiter — die
      // Bestätigungen müssen mit, sonst hängen sie am falschen Punkt.
      const at = lacAddIndex(state.weeks[state.week]?.[mtab(state.tab)].sections[action.si]?.items ?? [])
      const verschoben = shiftPartConfirmations(
        state.confirmations,
        state.weeks[state.week]?.start ?? '',
        mtab(state.tab),
        action.si,
        at,
        1,
      )
      return {
        ...state,
        weeks,
        confirmations: verschoben.map,
        toast: toastKey(state, 'toastLacAdd'),
      }
    }
    case 'setAbweichung': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: setAbweichung(state.weeks, state.week, action.tab, action.patch) }
    }
    case 'setDienstwoche': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: setDienstwoche(state.weeks, state.week, action.on) }
    }
    case 'setAnlass': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: setAnlass(state.weeks, state.week, action.art) }
    }
    case 'setAnlassTermin': {
      if (!state.weeks[state.week]) return state
      return { ...state, weeks: setAnlassTermin(state.weeks, state.week, action.patch) }
    }
    // Weitere Termine der Woche (T63). Reine Ankündigung — kein `task_key`,
    // keine Bestätigung, keine Mitteilung, kein `pendingIds`.
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
      return { ...state, congLang: action.name, langSheetOpen: false, langSearch: '' }
    case 'addProgLang': {
      // Versammlungssprache selbst und Duplikate ergeben keine Variante
      const skip = action.name === state.congLang || state.progLangs.includes(action.name)
      return {
        ...state,
        progLangs: skip ? state.progLangs : [...state.progLangs, action.name],
        langSheetOpen: false,
        langSearch: '',
        toast: skip ? state.toast : toastKey(state, 'toastProgLangAdd'),
      }
    }
    case 'removeProgLang':
      return {
        ...state,
        progLangs: state.progLangs.filter((n) => n !== action.name),
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
        // ISO-Datum als 12:00 Ortszeit lesen (nicht UTC-Mitternacht) — sonst
        // rutscht die Basis in westlichen Zeitzonen auf den Vortag.
        fsBase: p.fsBase ? new Date(`${p.fsBase}T12:00:00`) : state.fsBase,
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
