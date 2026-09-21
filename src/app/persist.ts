/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase (Fire-and-forget über lib/data). Läuft nur im konfigurierten,
 * hydrierten Zustand. Der Reducer bleibt rein; hier werden `prev`/`next`
 * (Zustand vor/nach der Aktion) ausgewertet.
 */

import { changedSlotKeys } from '../data/planning'
import { fsTaskKeyWoche } from '../data/fs'
import { type EntzogeneZusage, entzogeneZusagen } from '../data/plan-versand'
import {
  deleteAbsenceRow,
  deleteConfirmationRows,
  deleteGroupRow,
  deleteHouseholdRow,
  deletePersonRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteNotifications,
  deleteServiceRow,
  insertNotifications,
  markNotificationsRead,
  saveAbsence,
  saveConfirmation,
  saveCongregationInfo,
  saveFamily,
  saveFsRules,
  saveFsWeek,
  saveGroupRow,
  saveInvite,
  saveInvitePlanner,
  saveMemberRow,
  savePerson,
  savePersonGroup,
  saveService,
  saveSettings,
  saveWeek,
  substituteSeek,
  substituteTake,
  sendPlanEntzug,
} from '../lib/data'
import { helperKeyParts } from '../data/planning'
import { mtab, namensDublette } from '../data/helpers'
import { dienstZusagenKeys } from '../data/dienste'
import { supabase } from '../lib/supabase'
import type { FsInstance, Person, Week } from '../data/types'
import type { AppAction, AppState } from './context'

/**
 * Auto-Speichern mit Debounce: Tipp-Änderungen (Personen-Felder, Umbenennung
 * betroffener Wochen, Versammlungs-Stammdaten) dispatchen je Tastenanschlag.
 * Statt pro Anschlag zu schreiben, sammelt ein Writer die neueste Fassung je
 * Schlüssel und schreibt sie gebündelt nach kurzer Ruhe — bzw. sofort beim
 * Verlassen der Ansicht (`flush`) oder gar nicht (`cancel`, vor dem Löschen).
 */
const SAVE_DELAY = 600

interface DebouncedWriter<K, V> {
  schedule: (key: K, value: V) => void
  cancel: (key: K) => void
  flush: () => void
}

function createDebouncedWriter<K, V>(
  delayMs: number,
  write: (key: K, value: V) => void,
): DebouncedWriter<K, V> {
  const pending = new Map<K, V>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    for (const [key, value] of pending) write(key, value)
    pending.clear()
  }
  return {
    schedule(key, value) {
      pending.set(key, value)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    cancel(key) {
      pending.delete(key)
    },
    flush,
  }
}

// congId ist über die Sitzung stabil, wird aber je Save mitgeführt, damit der
// Writer keine implizite Abhängigkeit auf App-State hat.
const personSaves = createDebouncedWriter<string, { congId: string; person: Person }>(
  SAVE_DELAY,
  (_id, { congId, person }) => savePerson(congId, person),
)
// Gebündelt wird je **Woche**, nicht je Index (T66): der Schlüssel ist ihre
// Kennung, und der schiebt sich nicht, wenn sich die geladene Menge ändert.
const weekSaves = createDebouncedWriter<string, { congId: string; week: Week }>(
  SAVE_DELAY,
  (_woche, { congId, week }) => saveWeek(congId, week),
)
const congSaves = createDebouncedWriter<'info', { congId: string; info: AppState['congregation'] }>(
  SAVE_DELAY,
  (_key, { congId, info }) => saveCongregationInfo(congId, info),
)
/*
 * Treffpunkt-Zusagen, deren Löschen auf das gebündelte Schreiben ihrer Woche
 * wartet — je Woche (Kennung).
 *
 * **Nie vor der Woche.** Eine Grundplan-Änderung entfernt oder besetzt
 * Treffpunkte in vielen Wochen, geschrieben werden die Wochen aber erst nach
 * kurzer Ruhe (`fsWeekSaves`). Bis zum 15. September 2026 ging das Löschen der
 * alten Zusagen sofort hinaus. Wurde die App in diesen 600 ms geschlossen,
 * stand in der Datenbank der alte Leiter — ohne seine Zusage: Er galt als
 * unbestätigt und bekam erneut Erinnerungen. Jetzt geht beides gemeinsam oder
 * gar nicht.
 */
const ausstehendeFsLoeschungen = new Map<string, Set<string>>()

// Treffpunkte: derselbe Weg wie bei den Wochen — gebündelt je Kennung.
const fsWeekSaves = createDebouncedWriter<string, { congId: string; insts: FsInstance[] }>(
  SAVE_DELAY,
  (woche, { congId, insts }) => {
    saveFsWeek(congId, woche, insts)
    const keys = ausstehendeFsLoeschungen.get(woche)
    ausstehendeFsLoeschungen.delete(woche)
    if (keys?.size) deleteConfirmationRows(congId, [...keys])
  },
)
// Der Grundplan hängt an einem Freitextfeld (Ort) und änderte sich deshalb je
// Tastenanschlag — mitsamt jeder daraus erzeugten Woche.
const fsRuleSaves = createDebouncedWriter<'rules', { congId: string; rules: AppState['fsRules'] }>(
  SAVE_DELAY,
  (_key, { congId, rules }) => saveFsRules(congId, rules),
)

/*
 * ---- Speichern mit Blick auf den Index (T42) -------------------------------
 *
 * Fast jeder Zweig unten schreibt „die Woche zu diesem Index". Der Index kommt
 * aus der Aktion oder aus dem vorigen Zustand — und muss dort nicht mehr
 * stehen: eine Lücke im geladenen Fenster (T35), eine Woche, die zwischen
 * Auswahl und Speichern aus dem Fenster gerutscht ist. `weeks[wi]` ist dann
 * `undefined`, und ohne Prüfung ginge genau das an die Schreibschicht — die
 * eine volle Zeile mit einer leeren überschriebe. Kein Index, kein Schreiben.
 */

/**
 * Woche an `wi` speichern — falls es sie gibt und falls sie sich geändert hat.
 *
 * **Die zweite Bedingung ist die wichtigere.** Dieser Zweig entscheidet über
 * die *Aktion*, nicht über einen Vergleich: `case 'talkEdit': wocheSpeichern(…)`
 * schreibt, ob am Thema etwas anders ist oder nicht. Und mehrere Aktionen
 * kommen im Betrieb regelmäßig ohne Änderung an — die Freitextfelder schicken
 * bei **jedem** Verlassen (`onBlur`), auch wenn niemand getippt hat; die
 * Minuten-Knöpfe schicken auch am Anschlag (5 bzw. 45); ein schon gesetzter
 * Anlass lässt sich noch einmal auswählen.
 *
 * Ohne den Vergleich ging jedes Hineinklicken in ein Feld als Schreibvorgang
 * hinaus. Das ist nicht bloß Verschwendung: Die Wochen werden mit
 * Vergleiche-und-Tausche gespeichert (T39), ein Schreibvorgang hebt also den
 * Zeitstempel — und der nächste Planer bekommt einen Konflikt für eine Woche
 * gemeldet, die niemand angefasst hat, samt neu geladener Ansicht.
 *
 * Der Reducer gibt unberührte Wochen **identisch** zurück; darauf baut die
 * ganze Persistenzschicht auf (siehe `geaenderteWochenSpeichern` darunter, das
 * dieselbe Prüfung schon länger macht). Hier fehlte sie nur.
 */
function wocheSpeichern(congId: string, vorher: Week[], weeks: Week[], wi: number): void {
  const week = weeks[wi]
  if (!week || vorher[wi] === week) return
  saveWeek(congId, week)
}

/**
 * **Jede geänderte Woche wird geschrieben — abgelesen, nicht aufgezählt.**
 *
 * Nach demselben Grundsatz wie die Mitteilungen und die entzogenen Zusagen am
 * Ende dieser Datei. Vorher stand hier eine Aufzählung der auslösenden
 * Aktionen: siebzehn `case`-Marken, die nichts taten als „schreib die Woche".
 * Wer eine neue wochenändernde Aktion baute und sich nicht eintrug, verlor die
 * Änderung beim nächsten Laden — und **nichts schlug fehl**. Genau davor warnt
 * `kein-leerlauf-schreiben.test.ts`.
 *
 * Der Vergleich trägt auch das, was keine Aktion je aufgezählt hätte: Eine
 * geänderte Zusammenkunftszeit zieht die Endzeiten **aller** geladenen Wochen
 * nach (`endenNachziehen`), und die Zusätzliche Klasse setzt bzw. entfernt in
 * jeder Woche die Marke `auxRatgeber` samt zweiter Platzreihe (`syncAuxSlots`).
 * Beides steht in den Wochenzeilen, nicht in den Einstellungen.
 *
 * Geschrieben wird nur, was sich wirklich geändert hat — der Reducer gibt
 * unberührte Wochen identisch zurück; darauf baut die ganze Persistenzschicht.
 *
 * `gebuendelt` verzögert das Schreiben (siehe `wochePlanen`). Diese Liste darf
 * unvollständig sein: Wer dort fehlt, wird sofort geschrieben — mehr Anfragen,
 * aber nichts geht verloren. Die Frage **ob** geschrieben wird, hängt dagegen
 * an keiner Liste mehr.
 */
function geaenderteWochenSpeichern(
  congId: string,
  vorher: Week[],
  nachher: Week[],
  gebuendelt: boolean,
): void {
  if (vorher === nachher) return
  for (let wi = 0; wi < nachher.length; wi++) {
    if (nachher[wi] === vorher[wi]) continue
    if (gebuendelt) wochePlanen(congId, nachher, wi)
    else wocheSpeichern(congId, vorher, nachher, wi)
  }
}

/**
 * Aktionen, deren Wochen-Änderungen **gebündelt** hinausgehen: Das
 * Personen-Formular löst je Tastenanschlag aus, und eine Umbenennung zieht
 * durch jede geplante Woche (`renameInWeeks`) — einzeln geschrieben wären das
 * Dutzende Anfragen je Buchstabe. `flush()` beim Verlassen der Ansicht holt sie
 * ein (`selectPerson`/`navigate`/`logout`).
 */
const GEBUENDELT: readonly AppAction['type'][] = ['updatePerson', 'removePerson', 'removeService']

/**
 * Aktionen, deren geänderte Wochen **nicht** von hier geschrieben werden — je
 * mit einem Grund, nicht als Buchhaltung:
 *
 * - `hydrate` ersetzt den ganzen Bestand. Geschrieben würde alles, was gerade
 *   gelesen wurde — und weil Wochen mit Vergleiche-und-Tausche gespeichert
 *   werden (T39), bekäme der nächste Planer Konflikte für Wochen, die niemand
 *   angefasst hat.
 * - `takeSubstitute` schreibt die Edge Function: Wochen und Bestätigungen sind
 *   planer-only, der Einspringende dürfte es selbst gar nicht.
 */
const OHNE_WOCHENSCHREIBEN: readonly AppAction['type'][] = ['hydrate', 'takeSubstitute']

/**
 * Nach einem Löschen die **Nachrücker** neu nummerieren.
 *
 * `position` ist der Index in der Liste (Dienste wie Gruppen). Wird aus der
 * Mitte gelöscht, rutscht alles dahinter eine Stelle vor — bleiben die alten
 * Nummern stehen, entsteht eine Lücke, und die nächste **neu angelegte** Zeile
 * bekommt `Länge − 1`, also eine Nummer, die es schon gibt. `.order('position')`
 * ist dann für zwei Zeilen unentschieden: Die Liste kann beim nächsten Laden
 * kippen, und mit ihr die Reinigungs-Rotation, die über die Gruppenreihenfolge
 * läuft (`groups[weekIndex % groups.length]` in `autoAssignMeeting`).
 *
 * Geschrieben wird nur, was wirklich verrutscht ist: Der Reducer filtert die
 * Liste, unberührte Einträge behalten also ihre Referenz — steht an Index `i`
 * ein anderes Objekt als vorher, ist es verschoben.
 */
function positionenNachziehen<T>(
  vorher: readonly T[],
  nachher: readonly T[],
  schreiben: (eintrag: T, position: number) => void,
): void {
  for (let i = 0; i < nachher.length; i++) {
    const eintrag = nachher[i]
    if (eintrag !== undefined && vorher[i] !== eintrag) schreiben(eintrag, i)
  }
}

/** Wie `wocheSpeichern`, nur gebündelt — für Änderungen je Tastenanschlag. */
function wochePlanen(congId: string, weeks: Week[], wi: number): void {
  const week = weeks[wi]
  if (week) weekSaves.schedule(week.start, { congId, week })
}

/**
 * Treffpunkt-Zusagen, die der Reducer bei dieser Aktion abgeräumt hat — je
 * Woche (Kennung).
 *
 * **Abgelesen, nicht nachgerechnet.** Welche Zusage mit ihrem Leiter verfällt,
 * entscheidet der Reducer (`ohneVerwaisteTreffpunktZusagen`). Hier stand
 * vorher dieselbe Rechnung ein zweites Mal; jetzt gilt, was im Zustand fehlt.
 * Eine künftige Ausnahme im Reducer kommt so von selbst in der Datenbank an.
 *
 * Nur Treffpunkt-Schlüssel: Die Zusammenkünfte räumen ihre Zeilen in ihren
 * eigenen Zweigen ab (`changedSlotKeys`), und dort werden Schlüssel auch
 * umbenannt statt gelöscht (`shiftPartConfirmations`).
 *
 * **Gelöscht wird nur, was mit einer geschriebenen Woche verfällt.** Deshalb
 * braucht `hydrate` keine Ausnahme: Es ersetzt die Zusagen im Ganzen, schreibt
 * aber keine Woche — was dort fehlt, bleibt unberührt.
 *
 * Löschen dürfen Planer und Gruppenaufseher, die ihre
 * Treffpunkte selbst besetzen.
 */
function verwaisteFsZusagen(prev: AppState, next: AppState): Map<string, string[]> {
  const jeWoche = new Map<string, string[]>()
  if (prev.confirmations === next.confirmations) return jeWoche
  for (const key of Object.keys(prev.confirmations)) {
    if (key in next.confirmations) continue
    const woche = fsTaskKeyWoche(key)
    if (woche !== null) jeWoche.set(woche, [...(jeWoche.get(woche) ?? []), key])
  }
  return jeWoche
}

/**
 * Treffpunkt-Woche an `wi` speichern, falls es sie gibt — und mit ihr die
 * Zusagen löschen, die in dieser Woche verfallen sind (`verwaist`).
 *
 * Die Kennung steht bei der **Woche**, nicht bei den Treffpunkten — deshalb
 * liegen hier beide Listen. Fehlt die Woche, gibt es nichts zu bezeichnen, und
 * dann bleiben auch die Zusagen stehen: Die Datenbank behält den alten Leiter,
 * also gehört ihm auch weiter seine Zusage.
 */
function fsWocheSpeichern(
  congId: string,
  weeks: Week[],
  fsWeeks: FsInstance[][],
  wi: number,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  const week = weeks[wi]
  const fsWeek = fsWeeks[wi]
  if (!week || !fsWeek) return
  saveFsWeek(congId, week.start, fsWeek)
  const keys = verwaist.get(week.start)
  if (keys) deleteConfirmationRows(congId, keys)
}

/**
 * Wie `fsWocheSpeichern`, nur gebündelt — für Änderungen je Tastenanschlag.
 * Die verfallenen Zusagen warten mit der Woche (`ausstehendeFsLoeschungen`).
 */
function fsWochePlanen(
  congId: string,
  weeks: Week[],
  fsWeeks: FsInstance[][],
  wi: number,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  const week = weeks[wi]
  const fsWeek = fsWeeks[wi]
  if (!week || !fsWeek) return
  const keys = verwaist.get(week.start)
  if (keys) {
    const warten = ausstehendeFsLoeschungen.get(week.start) ?? new Set<string>()
    for (const key of keys) warten.add(key)
    ausstehendeFsLoeschungen.set(week.start, warten)
  }
  fsWeekSaves.schedule(week.start, { congId, insts: fsWeek })
}

/**
 * Grundplan-Blob und die Treffpunkt-Wochen, die sich dadurch geändert haben.
 *
 * Beides gebündelt: Der Ort einer Regel ist ein Freitextfeld, und ohne
 * Bündelung ging je Tastenanschlag der Grundplan **und** jede Woche einzeln an
 * die Datenbank. Geschrieben wird nur, was sich wirklich geändert hat —
 * `regenFsWeeks` und `fsGruppeEntfernen` lassen Unberührtem seine Referenz.
 *
 * Auch das Löschen einer Gruppe geht hier durch, obwohl es kein Tastenanschlag
 * ist: Steht vom Tippen davor noch ein gebündelter Grundplan aus, schriebe ein
 * Schreiben am Bündel vorbei zuerst den neuen und 600 ms später den **alten**
 * Stand — samt der Regeln der gerade gelöschten Gruppe. Über denselben Writer
 * ersetzt der neue Stand den ausstehenden.
 */
function treffpunkteSpeichern(
  congId: string,
  prev: AppState,
  next: AppState,
  verwaist: ReadonlyMap<string, string[]>,
): void {
  if (next.fsRules !== prev.fsRules) {
    fsRuleSaves.schedule('rules', { congId, rules: next.fsRules })
  }
  for (let i = 0; i < next.fsWeeks.length; i++) {
    if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWochePlanen(congId, next.weeks, next.fsWeeks, i, verwaist)
  }
}

export function persist(prev: AppState, next: AppState, action: AppAction): void {
  const congId = next.congregationId
  const userId = next.userId
  if (!supabase || !congId || !userId) return
  // Offline-Momentaufnahme: nichts schreiben. Der Provider weist Schreib-
  // Aktionen bereits ab (readonly.ts) — hier als zweite Absicherung, damit ein
  // übersehener Pfad nicht in einen Schreibversuch auf veraltetem Stand läuft.
  if (next.staleAt) return

  // Welche Treffpunkt-Zusagen mit dieser Aktion verfallen — gelöscht werden sie
  // erst mit dem Schreiben ihrer Woche (`fsWocheSpeichern`, `fsWochePlanen`).
  const fsVerwaist = verwaisteFsZusagen(prev, next)

  /*
   * Steht der Name der gerade bearbeiteten Person vorübergehend doppelt da
   * (T110)? Dann geht **nichts** hinaus, was an ihm hängt — die Personenzeile,
   * die Treffpunkte und die Wochen, in denen er als Text steht. Gesetzt wird
   * das im Fall `updatePerson`, gelesen auch noch unter dem Switch: Der
   * Reducer hat den neuen Namen längst in die Wochen gezogen
   * (`renameInWeeks`), und schriebe man sie, trüge die Datenbank den Namen
   * zweimal — einmal bei A und einmal bei B, während `persons` noch den alten
   * Stand hält.
   */
  let nameUneindeutig = false

  switch (action.type) {
    case 'assign': {
      const sel = prev.slotSel
      // Treffpunkt-Leiter (fs): eigene Wochen-Tabelle.
      if (sel && sel.kind === 'fs') {
        fsWocheSpeichern(congId, next.weeks, next.fsWeeks, sel.wi, fsVerwaist)
        break
      }
      if (sel) {
        // Bestätigungs-Einträge geänderter Slots abräumen
        const vorher = prev.weeks[sel.wi]?.[sel.tab]
        const nachher = next.weeks[sel.wi]?.[sel.tab]
        if (vorher && nachher) {
          deleteConfirmationRows(
            congId,
            changedSlotKeys(vorher, nachher, prev.services, next.weeks[sel.wi]?.start ?? '', sel.tab),
          )
        }
      }
      break
    }
    case 'autoAssign': {
      const before = prev.weeks[prev.week]?.[mtab(prev.tab)]
      const after = next.weeks[prev.week]?.[mtab(prev.tab)]
      if (before && after) {
        // Bestätigungs-Einträge geänderter Slots abräumen
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, next.weeks[prev.week]?.start ?? '', mtab(prev.tab)),
        )
      }
      break
    }
    case 'clearAssignments': {
      const before = prev.weeks[prev.week]?.[mtab(prev.tab)]
      const after = next.weeks[prev.week]?.[mtab(prev.tab)]
      if (before && after && next.weeks !== prev.weeks) {
        deleteConfirmationRows(
          congId,
          changedSlotKeys(before, after, prev.services, next.weeks[prev.week]?.start ?? '', mtab(prev.tab)),
        )
      }
      break
    }
    case 'fsInstUpdate':
    case 'fsInstRemove':
      fsWocheSpeichern(congId, next.weeks, next.fsWeeks, action.wi, fsVerwaist)
      break
    case 'fsInstAdd':
    case 'fsAutoAssign':
    case 'fsClear':
      fsWocheSpeichern(congId, next.weeks, next.fsWeeks, prev.week, fsVerwaist)
      break
    case 'fsRuleAdd':
    case 'fsRuleUpdate':
    case 'fsRuleRemove':
      // Grundplan-Blob + die neu materialisierten Wochen (gebündelt).
      treffpunkteSpeichern(congId, prev, next, fsVerwaist)
      break
    case 'lacRemove': {
      // **Abgelesen, nicht nachgerechnet** — wie bei den Treffpunkten: Welche
      // Zusage mit dem gelöschten Punkt verfällt, entscheidet der Reducer; hier
      // gilt, was im Zustand fehlt. Verschoben und umbenannt wird nichts mehr:
      // Der Schlüssel trägt die Kennung des Punkts, nicht seine Position.
      const weg = Object.keys(prev.confirmations).filter((k) => !(k in next.confirmations))
      deleteConfirmationRows(congId, weg)
      break
    }
    case 'addPerson':
      savePerson(congId, action.person)
      break
    case 'updatePerson': {
      // Auto-Speichern mit Debounce: Tipp-Änderungen werden gebündelt
      const p = next.persons.find((x) => x.id === action.id)
      /*
       * **Einen doppelten Namen schreibt die App gar nicht erst** (T110).
       *
       * Vor- und Nachname sind je Versammlung eindeutig, und der Index
       * `persons_name_eindeutig` setzt das durch. Beim Tippen entstehen aber
       * zwangsläufig Zwischenstände: Wer „Josef Mayer" zu „Josef Mayer sen."
       * ergänzt, ist nach dem letzten Buchstaben von „Mayer" für einen
       * Wimpernschlag die Dublette des anderen Josef Mayer. Ginge der Stand
       * hinaus, käme er als Schreibfehler zurück — eine rote Meldung für eine
       * Eingabe, die gerade erst halb fertig ist.
       *
       * Angehalten wird deshalb hier, nicht in der Eingabe: Der Zustand nimmt
       * jeden Tastendruck an, das Feld meldet die Dublette (`PersonDetail`),
       * und geschrieben wird erst wieder, sobald der Name eindeutig ist.
       *
       * Angehalten wird alles, was **am Namen hängt** — die Personenzeile und
       * die Treffpunkte, in denen er als Text steht (die Wochen weiter unten
       * ebenso). Nicht angehalten wird das **Planer-Recht**: Es liegt in
       * `members`, hat mit dem Namen nichts zu tun, und ein halb getippter
       * Name soll einen Rechte-Schalter nicht verschlucken.
       */
      nameUneindeutig = Boolean(p && namensDublette(next.persons, p))
      if (p && !nameUneindeutig) personSaves.schedule(p.id, { congId, person: p })
      // Die Namensänderung in den Wochen (renameInWeeks) schreibt der Block
      // unter dem Switch — hier bleiben die Treffpunkte (fsRenameLeader):
      // eigene Tabelle, eigener Schreibweg. Ohne dies hielte der neue Name nur
      // bis zum nächsten Laden.
      //
      // **Gebündelt wie die Wochen daneben.** Ein Nachname mit zwölf Buchstaben
      // schrieb sonst zwölfmal jede Woche, in der die Person einen Treffpunkt
      // leitet — bei zwanzig geleiteten Wochen 240 Anfragen für eine
      // berichtigte Schreibweise. `flush()` beim Verlassen der Ansicht holt sie
      // ein (`selectPerson`/`navigate`/`logout`).
      for (let i = 0; i < next.fsWeeks.length && !nameUneindeutig; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWochePlanen(congId, next.weeks, next.fsWeeks, i, fsVerwaist)
      }
      // Planer-Recht sofort in gespiegelte Konten und offene Codes schreiben
      if ('plannerVorgemerkt' in action.patch) {
        for (const m of next.members) {
          if (m.personId === action.id && m.userId !== next.userId) saveMemberRow(m)
        }
        for (const i of next.invites) {
          if (i.personId === action.id) saveInvitePlanner(i.id, i.planner)
        }
      }
      break
    }
    case 'selectPerson':
    case 'navigate':
    case 'logout': {
      // Namenlose (abgebrochene) Person wurde im Reducer entfernt → auch in
      // der DB löschen, ohne dass ein ausstehender Save sie wiederbelebt.
      const sel = prev.selectedPersonId
      if (sel && prev.persons.some((p) => p.id === sel) && !next.persons.some((p) => p.id === sel)) {
        personSaves.cancel(sel)
        deletePersonRow(sel)
      }
      // Ansicht verlassen → ausstehende Debounce-Saves sofort schreiben
      personSaves.flush()
      weekSaves.flush()
      congSaves.flush()
      fsWeekSaves.flush()
      fsRuleSaves.flush()
      break
    }
    case 'removePerson': {
      personSaves.cancel(action.id)
      // Alle Verweise auf die Person räumt die Datenbank selbst
      // (`on delete set null`): Gruppen, Einladungen, Abwesenheiten, das
      // Versand-Tagebuch — und seit T105 auch `members.person_id`. Genau die
      // stand hier bis dahin von Hand, weil sie als einzige ohne
      // Fremdschlüssel auskommen musste; wer eine Person per Skript löschte,
      // hinterließ eine Mitgliedschaft, deren `my_person_id()` ins Leere zeigt.
      deletePersonRow(action.id)
      // War sie die Letzte ihres Haushalts, geht der mit: Die Datenbank nullt
      // zwar `persons.fam`, die leere Zeile bliebe aber stehen und käme beim
      // nächsten Neuaufbau wieder mit.
      const haus = prev.persons.find((p) => p.id === action.id)?.fam
      if (haus && !next.persons.some((p) => p.fam === haus)) deleteHouseholdRow(haus)
      // Die gelösten Verweise (T38) müssen auch in der Datenbank landen —
      // sonst zeigt der Fremdschlüssel dort weiter ins Leere. Die
      // Zusammenkunfts-Wochen übernimmt der Block unter dem Switch.
      for (let i = 0; i < next.fsWeeks.length; i++) {
        if (next.fsWeeks[i] !== prev.fsWeeks[i]) fsWocheSpeichern(congId, next.weeks, next.fsWeeks, i, fsVerwaist)
      }
      break
    }
    case 'setFamily': {
      // Die Haushalts-Id wurde bei beiden (bzw. mehreren) Beteiligten geändert.
      const geaendert = next.persons.filter(
        (p) => prev.persons.find((q) => q.id === p.id)?.fam !== p.fam,
      )
      if (geaendert.length === 0) break
      // Der Haushalt ist eine eigene Zeile, auf die `persons.fam` zeigt — er
      // muss also **vor** den Personen dastehen. `saveFamily` hält diese
      // Reihenfolge ein; sie ist der einzige Grund, warum es die Funktion gibt.
      const haushalt = geaendert.find((p) => p.fam)?.fam
      if (haushalt) saveFamily(congId, haushalt, geaendert)
      else for (const p of geaendert) savePerson(congId, p)
      // Der letzte Haushalt, den niemand mehr trägt, verschwindet. Ohne das
      // bliebe eine leere Zeile stehen, an der nie wieder jemand hängt.
      const verwaist = new Set(
        geaendert
          .map((p) => prev.persons.find((q) => q.id === p.id)?.fam)
          .filter((f): f is string => Boolean(f)),
      )
      for (const alt of verwaist) {
        if (!next.persons.some((p) => p.fam === alt)) deleteHouseholdRow(alt)
      }
      break
    }
    case 'addAbsence':
      // Person und Ersteller stehen im Datensatz — der Planer trägt hier auch
      // für andere ein, und `next.personId` wäre dann seine eigene Person.
      saveAbsence(congId, action.absence)
      break
    case 'removeAbsence':
      deleteAbsenceRow(action.id)
      break
    case 'addService': {
      const pos = next.services.length - 1
      if (pos >= 0) saveService(congId, action.service, pos)
      break
    }
    case 'changeServiceCount': {
      const idx = next.services.findIndex((s) => s.key === action.key)
      const svc = next.services[idx]
      if (svc) saveService(congId, svc, idx)
      break
    }
    case 'removeService': {
      deleteServiceRow(congId, action.key)
      positionenNachziehen(prev.services, next.services, (svc, pos) => saveService(congId, svc, pos))
      // Die drei Spuren des Dienstes (data/dienste.ts) hat der Reducer aus dem
      // Zustand genommen — hier gehen sie an die Datenbank. Nur die wirklich
      // geänderten Zeilen: unveränderte behalten ihre Referenz, und die Listen
      // sind indexgleich (`dienstBereichEntfernen` bildet der Reihe nach ab).
      for (let i = 0; i < next.persons.length; i++) {
        const p = next.persons[i]
        if (p && p !== prev.persons[i]) savePerson(congId, p)
      }
      const weg = dienstZusagenKeys(prev.weeks, action.key)
      if (weg.length) deleteConfirmationRows(congId, weg)
      break
    }
    case 'addGroup':
      // Die Position ist der Index in der Liste — sie hängt sich hinten an.
      // Ohne sie stünden alle Gruppen auf 0, und die Ladereihenfolge wäre die
      // Ablage der Datenbank (siehe `saveGroupRow`).
      saveGroupRow(congId, action.group, next.groups.length - 1)
      break
    case 'updateGroup': {
      const idx = next.groups.findIndex((g) => g.id === action.id)
      const group = next.groups[idx]
      if (group) saveGroupRow(congId, group, idx)
      break
    }
    case 'removeGroup':
      deleteGroupRow(action.id)
      positionenNachziehen(prev.groups, next.groups, (grp, pos) => saveGroupRow(congId, grp, pos))
      // Mitglieder der Gruppe haben grp=null bekommen → mitschreiben
      for (const p of next.persons) {
        if (prev.persons.find((q) => q.id === p.id)?.grp === action.id) savePersonGroup(p)
      }
      // Ihre Treffpunkte sind mit ihr gegangen. Die Regeln liegen als ein Blob
      // ohne Fremdschlüssel in `fs_rules` — die Datenbank räumt hier nichts
      // von selbst, anders als bei `persons.grp` (on delete set null).
      treffpunkteSpeichern(congId, prev, next, fsVerwaist)
      break
    case 'markAllRead':
      markNotificationsRead(congId, userId)
      break
    case 'clearNotifs':
      deleteNotifications(congId, userId)
      break
    case 'confirmTask':
      saveConfirmation(congId, userId, action.id, 'bestätigt')
      break
    case 'declineTask':
      saveConfirmation(congId, userId, action.id, 'verhindert')
      // Hilfsdienst: automatisch Ersatz suchen (qualifizierte Personen anpingen).
      if (helperKeyParts(action.id)) substituteSeek(action.id)
      break
    case 'takeSubstitute':
      // Nicht clientseitig speichern (Wochen/Bestätigungen sind planer-only) —
      // die Edge Function trägt ein und benachrichtigt Ursprungsperson + Planer.
      substituteTake(action.key)
      break
    case 'changeReminder':
    case 'toggleReminderRepeat':
    case 'setAuxClass':
    case 'setCongLang':
    case 'addProgLang':
    case 'removeProgLang':
      saveSettings(congId, {
        reminders: next.reminders,
        congLang: next.congLang,
        progLangs: next.progLangs,
        auxClass: next.auxClass,
      })
      break
    case 'updateCongregation':
      congSaves.schedule('info', { congId, info: next.congregation })
      break
    case 'updateMember': {
      const member = next.members.find((m) => m.userId === action.userId)
      if (member) saveMemberRow(member)
      break
    }
    case 'removeMember':
      deleteMemberRow(action.userId)
      break
    case 'addInvite':
      saveInvite(congId, action.invite)
      break
    case 'removeInvite':
      deleteInviteRow(action.id)
      break
  }

  // Jede Woche, die sich geändert hat — siehe `geaenderteWochenSpeichern`.
  if (!OHNE_WOCHENSCHREIBEN.includes(action.type) && !nameUneindeutig) {
    geaenderteWochenSpeichern(congId, prev.weeks, next.weeks, GEBUENDELT.includes(action.type))
  }

  /*
   * Eine hier entstandene Mitteilung (Zuteilung, Import, Verhinderung) an die
   * Planer der Versammlung schicken — je Empfänger eine eigene Zeile mit
   * eigenem Gelesen-/Lösch-Status. Erinnerungen erzeugt die Edge Function
   * selbst (adressiert an die betroffene Person).
   *
   * Erkannt am `local`-Kennzeichen, das der Reducer beim Erzeugen setzt — nicht
   * daran, dass die Liste länger geworden ist. Auf `hydrate` träfe das nämlich
   * ebenfalls zu: es lädt die gespeicherten Mitteilungen, und aus jedem Laden
   * wurde so eine neue, die beim nächsten Laden wieder mitkam. Eine Aufzählung
   * der auslösenden Aktionen wäre die zweite Buchführung gewesen — wer eine
   * vergisst, merkt es nie, weil nichts fehlschlägt.
   */
  const neu = next.notifs[0]
  if (neu?.local && neu !== prev.notifs[0]) {
    const planners = next.members.filter((m) => m.planner).map((m) => m.userId)
    insertNotifications(congId, planners, neu.type, neu.title, neu.text)
  }

  /*
   * **Wem eine bestätigte Zusage genommen wurde, erfährt es sofort** (T99).
   *
   * Nach demselben Grundsatz wie oben an **einer** Stelle für alle Wege:
   * einzeln zuteilen, umteilen, leeren, Auto-Zuteilung, Treffpunkt-Leiter,
   * Treffpunkt-Auto — und alles, was künftig dazukommt. Eine Aufzählung der
   * auslösenden Aktionen wäre die zweite Buchführung: wer eine vergisst, merkt
   * es nie, weil nichts fehlschlägt — es geht nur eine Nachricht weniger
   * hinaus, und der Betroffene übt weiter für einen Platz, den er nicht mehr
   * hat.
   *
   * Verglichen wird gegen `prev.confirmations`: Der Reducer hat den Eintrag zu
   * diesem Zeitpunkt schon verworfen (`dropConfirmations`), im vorigen Stand
   * steht er noch.
   *
   * `hydrate` ist ausgenommen, und nur das: Dort wird der ganze Bestand
   * ersetzt, und ein Neuladen nach einem Schreibkonflikt brächte sonst Wochen
   * voller vermeintlicher Entzüge hervor.
   */
  if (action.type !== 'hydrate' && (prev.weeks !== next.weeks || prev.fsWeeks !== next.fsWeeks)) {
    /*
     * **Erst sammeln, dann einmal schicken.** Je Entzug ein eigener Aufruf
     * hieß: Die Function las für jeden davon aufs Neue alle Mitglieder, alle
     * Personen und alle Push-Abos der Versammlung. Eine Auto-Zuteilung fasst
     * aber eine ganze Zusammenkunft an, und `setAuxClass` oder `fsRuleAdd`
     * fassen alle 52 Wochen auf einmal an — aus einer Handlung wurden Dutzende
     * Aufrufe. Gesammelt ist es einer, und wer zwei Plätze verliert, bekommt
     * eine Nachricht statt zweier.
     */
    const entzogen: EntzogeneZusage[] = []
    for (let wi = 0; wi < prev.weeks.length; wi++) {
      // Unberührte Wochen behalten ihre Referenz — der Vergleich kostet nichts.
      if (prev.weeks[wi] === next.weeks[wi] && prev.fsWeeks[wi] === next.fsWeeks[wi]) continue
      entzogen.push(
        ...entzogeneZusagen(
          prev.weeks[wi],
          next.weeks[wi],
          prev.fsWeeks[wi],
          next.fsWeeks[wi],
          wi,
          prev.fsBase,
          prev.services,
          prev.congregation.times,
          prev.confirmations,
        ),
      )
    }
    // Der Regelfall: nichts verloren, nichts zu schicken.
    if (entzogen.length > 0) sendPlanEntzug(entzogen)
  }
}
