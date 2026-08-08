/**
 * App-Context: State-Form, Actions und der useApp()-Hook.
 * Der Provider (Reducer + Effekte) liegt in store.tsx.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type Dispatch,
} from 'react'
import type { FontScale } from '../data/constants'
import type {
  Abweichung,
  Absence,
  ConfirmationMap,
  FsInstance,
  FsRule,
  Group,
  Invite,
  Lang,
  MeetingKey,
  MeetingTab,
  Member,
  MyTask,
  Notification,
  Person,
  Reminders,
  S89Payload,
  Screen,
  Service,
  SlotSelection,
  SubstituteReq,
  Theme,
  Week,
} from '../data/types'

export interface Toast {
  id: number // erzwingt Neustart des Auto-Hide-Timers bei gleichem Text
  text: string
}

export interface Congregation {
  name: string // "Musterstadt"
  hall: string // "Hauptstraße 12"
  meetings: string // "Di 19:00 · So 10:00"
}

/**
 * Datenquelle: `demo` = In-Memory (kein Supabase); `loading` = lädt aus der
 * DB; `ready` = geladen; `no-membership` = Konto keiner Versammlung zugeordnet;
 * `error` = Ladefehler.
 */
export type DataStatus = 'demo' | 'loading' | 'ready' | 'no-membership' | 'error'

/** Nutzdaten der Hydration (aus Supabase geladen). */
export interface HydratePayload {
  congregationId: string
  userId: string
  empty: boolean // Versammlung hat noch keine Personen/Wochen
  congregation: Congregation
  planner: boolean
  personId: string | null
  persons: Person[]
  services: Service[]
  groups: Group[]
  weeks: Week[]
  weekFrom: number // erste geladene Woche; davor Platzhalter (Week.stub)
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  fsBase: string | null // ISO-Datum (Montag der Woche 0)
  absences: Absence[]
  notifications: Notification[]
  confirmations: ConfirmationMap
  reminders: Reminders
  congLang: string
  progLangs: string[]
  auxClass: boolean
  members: Member[]
  invites: Invite[]
}

/**
 * Der gesamte Anwendungszustand.
 *
 * **Drei Sorten liegen hier nebeneinander** (T41) — sie sind unten in dieser
 * Reihenfolge gruppiert, weil sie sich in Herkunft, Lebensdauer und Speicherort
 * grundlegend unterscheiden:
 *
 * | Sorte | Herkunft | Wo sie überdauert |
 * | --- | --- | --- |
 * | **Serverdaten** | Supabase, beim Anmelden geladen | Datenbank |
 * | **Ansichtszustand** | Bedienung, kurzlebig | nirgends |
 * | **Gerätevorlieben** | Bedienung, langlebig | `localStorage`, je Gerät |
 *
 * Die Gruppierung ist **nicht** bloß Kosmetik: sie sagt bei jedem Feld, ob eine
 * Änderung gespeichert werden muss (`persist.ts`), ob sie im Offline-Modus
 * erlaubt ist (`readonly.ts`) und ob sie in die Momentaufnahme gehört
 * (`lib/snapshot.ts`). Bisher stand das nirgends und musste je Feld erraten
 * werden.
 */
export interface AppState {
  /* ---- Ansichtszustand: wo man gerade ist ------------------------------- */
  screen: Screen
  week: number // Index in weeks
  tab: MeetingTab

  /* ---- Gerätevorlieben: je Gerät, in localStorage ----------------------- */
  theme: Theme
  fontScale: FontScale // Schriftgrößen-Faktor (--fs), gerätebezogen wie theme
  lang: Lang // App-Sprache (UI)

  /* ---- Sitzung und Rechte ----------------------------------------------- */
  planner: boolean // Rechte: Planen/Personen/Einstellungen sichtbar
  // Persistenz (Supabase); im Demo-Modus null bzw. 'demo'
  congregationId: string | null
  userId: string | null
  personId: string | null // eigene Person (aus members.person_id); Demo: null
  dataStatus: DataStatus
  dataEmpty: boolean // geladen, aber Versammlung noch leer → Erstbefüllung anbieten
  // Daten kommen aus der Offline-Momentaufnahme (lib/snapshot.ts): Zeitpunkt der
  // Aufnahme in ms, sonst null. Solange gesetzt, ist die App nur lesend.
  staleAt: number | null
  recovery: boolean // Passwort-Reset-Ansicht aktiv (PASSWORD_RECOVERY)

  /* ---- Serverdaten: geladen, geändert, zurückgeschrieben ---------------- */
  congregation: Congregation
  members: Member[] // Mitglieder-Verwaltung (Planer; Nicht-Planer: nur eigene Zeile)
  invites: Invite[] // offene Einladungscodes (nur Planer)
  weeks: Week[]
  /**
   * Index der ersten geladenen Woche. Davor stehen Platzhalter (Week.stub),
   * damit der Index weiterhin der DB-Position entspricht — die Navigation darf
   * dort nicht hin, und gespeichert werden sie nie.
   */
  weekFrom: number
  persons: Person[]
  services: Service[]
  groups: Group[] // Predigtdienstgruppen (Planer; Reinigungs-Rotation)
  // Treffpunkte (Zusammenkünfte für den Predigtdienst): Grundplan-Regeln und die
  // pro Woche daraus materialisierten Instanzen (parallel zu weeks indiziert).
  fsRules: FsRule[]
  fsWeeks: FsInstance[][]
  fsBase: Date // Montag der Woche 0 (Bezug für Treffpunkt-Datumsberechnung)
  absences: Absence[]
  notifs: Notification[]
  confirmations: ConfirmationMap // Slot-Pfad → Status (nur Produktionsmodus)
  reminders: Reminders
  /**
   * Versammlung hat eine Zusätzliche Klasse eingerichtet (jw.org S-38,
   * Absatz 26). Steuert die zweite Platzreihe der Schülerteile und den
   * Ratgeber — versammlungsweit, deshalb in congregations.settings.
   */
  auxClass: boolean
  congLang: string // Versammlungssprache (deutscher Name, z. B. "Deutsch")
  progLangs: string[] // weitere Programmsprachen (deutsche Namen) — Import holt Varianten

  /* ---- Abgeleitet: aus den Serverdaten gerechnet, nie gespeichert -------- */
  // Persönliche Aufgaben & Bestätigungs-Flow. Im Produktionsmodus werden
  // myTasks/pendingIds aus weeks + confirmations abgeleitet (store.tsx).
  myTasks: MyTask[]
  /** Kennungen (Person-Id, sonst `name:…`) mit noch offener Bestätigung — Planen: „…“ */
  pendingIds: string[]
  substituteReqs: SubstituteReq[] // offene Ersatzgesuche für mich (Einspringen)

  /* ---- Ansichtszustand: was gerade offen ist ---------------------------- */
  notifOpen: boolean
  slotSel: SlotSelection | null // offenes Zuteilungs-Sheet (Planen)
  selectedPersonId: string | null // offenes Personen-Detail
  importing: boolean // Programm-Import läuft (~0.9 s)
  imported: boolean // alle verfügbaren Wochen importiert
  confirmOpen: boolean // Bestätigungs-Modal beim Öffnen der App
  myTaskId: string | null // eigene Aufgabe im Aktions-Sheet (bestätigen/absagen)
  s89: S89Payload | null // offenes S-89-Formular
  langSheetOpen: boolean // Sprach-Sheet offen
  langSheetFor: 'cong' | 'alt' // Auswahl-Ziel: Versammlungssprache | weitere Programmsprache
  langSearch: string
  toast: Toast | null
  /**
   * Es wurde sich gerade angemeldet und die Begrüßung steht noch aus.
   *
   * Der Name steht beim Anmelden noch nicht fest — er kommt erst mit den
   * Personendaten. Deshalb wird hier nur vorgemerkt und erst begrüßt, wenn
   * feststeht, wen man vor sich hat (siehe AppShell).
   */
  welcomePending: boolean
}

export type LacDir = -1 | 1
export type ReminderKey = 'first' | 'last'

export type AppAction =
  // `welcome`: nur beim tatsächlichen Anmelden. Eine wiederhergestellte
  // Sitzung beim App-Start meldet ebenfalls „login", soll aber nicht begrüßen.
  | { type: 'login'; welcome?: boolean }
  | { type: 'welcomeShown' }
  | { type: 'logout' }
  | { type: 'navigate'; screen: Screen }
  | { type: 'prevWeek' }
  | { type: 'nextWeek' }
  | { type: 'setTab'; tab: MeetingTab }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setFontScale'; scale: FontScale }
  | { type: 'togglePartner'; si: number; ii: number } // Gesprächspartner-Slot an/aus
  | { type: 'setFamily'; id: string; memberId: string; add: boolean } // Familienangehörige
  | { type: 'openNotifs' }
  | { type: 'closeNotifs' }
  | { type: 'markAllRead' }
  | { type: 'clearNotifs' } // löscht die eigenen Mitteilungen (Feed ist personalisiert)
  | { type: 'openSlot'; sel: SlotSelection }
  | { type: 'closeSlot' }
  | { type: 'addAbsence'; absence: Absence }
  | { type: 'removeAbsence'; id: string }
  | { type: 'selectPerson'; id: string | null }
  | { type: 'addPerson'; person: Person } // öffnet direkt das Detail
  | { type: 'updatePerson'; id: string; patch: Partial<Person> } // speichert automatisch (debounced)
  | { type: 'removePerson'; id: string } // löst Gruppen-/Konto-/Code-Referenzen
  | { type: 'changeServiceCount'; key: string; delta: 1 | -1 }
  | { type: 'removeService'; key: string }
  | { type: 'addService'; service: Service }
  // Predigtdienstgruppen (nur Planer)
  | { type: 'addGroup'; group: Group }
  | { type: 'removeGroup'; id: string }
  | { type: 'updateGroup'; id: string; patch: Partial<Pick<Group, 'ov' | 'as'>> }
  | { type: 'updateCongregation'; patch: Partial<Congregation> } // speichert automatisch (debounced)
  // Mitglieder & Einladungen (nur Planer)
  | { type: 'updateMember'; userId: string; patch: Partial<Pick<Member, 'personId' | 'planner'>> }
  | { type: 'removeMember'; userId: string }
  | { type: 'addInvite'; invite: Invite }
  | { type: 'removeInvite'; id: string }
  // Passwort-Reset (PASSWORD_RECOVERY)
  | { type: 'setRecovery'; on: boolean }
  | { type: 'startImport' }
  | { type: 'finishImport' } // Demo: simulierter Import (buildImportWeek)
  | { type: 'addImportedWeek'; week: Week } // Produktion: echte jw.org-Woche
  | { type: 'mergeWeekAlt'; wi: number; alt: Record<string, Week> } // nachgeladene Sprachvarianten
  | { type: 'stopImport' } // Import abgebrochen/fehlgeschlagen
  | { type: 'assign'; name: string; pid?: string; rolle?: string } // auf state.slotSel; "" = entfernen; pid = Person-Id (fehlt bei Gastredner); rolle nur Gastredner-Slots
  | { type: 'autoAssign'; scope?: 'parts' | 'helpers' | 'all' } // aktuelle Woche + Tab; Bereich (Default: alles)
  | { type: 'clearAssignments'; scope: 'parts' | 'helpers' } // aktuelle Woche + Tab: Zuteilungen des Bereichs leeren
  // Treffpunkte (Wochen-Bearbeitung im Planen-Tab)
  | { type: 'fsAutoAssign'; onlyGroup: string | null } // Treffpunkt-Leiter der aktuellen Woche automatisch besetzen
  | { type: 'fsClear'; onlyGroup: string | null } // Treffpunkt-Leiter der aktuellen Woche leeren
  | { type: 'fsInstUpdate'; wi: number; id: string; patch: Partial<Pick<FsInstance, 'time' | 'place'>> }
  | { type: 'fsInstRemove'; wi: number; id: string }
  | { type: 'fsInstAdd'; inst: FsInstance }
  // Treffpunkte-Grundplan (Einstellungen)
  | { type: 'fsRuleAdd'; grp: string }
  | { type: 'fsRuleUpdate'; id: string; patch: Partial<Pick<FsRule, 'wd' | 'monthly' | 'time' | 'place' | 'skipCong'>> }
  | { type: 'fsRuleRemove'; id: string }
  // Bestätigungs-Flow
  | { type: 'confirmTask'; id: string }
  | { type: 'declineTask'; id: string }
  | { type: 'openMyTask'; id: string } // eigenes Aufgaben-Aktions-Sheet öffnen
  | { type: 'closeMyTask' }
  | { type: 'takeSubstitute'; key: string } // Hilfsdienst-Ersatz übernehmen
  | { type: 'openS89'; payload: S89Payload }
  | { type: 'closeS89' }
  // LAC-Bearbeitung (Planen, aktuelle Woche + Tab)
  | { type: 'lacAdjust'; si: number; ii: number; delta: number }
  | { type: 'lacRemove'; si: number; ii: number }
  | { type: 'lacMove'; si: number; ii: number; dir: LacDir }
  | { type: 'lacAdd'; si: number; title: string }
  // Sonderwoche (T30): Verlegung, Ausfall, Grund — je Zusammenkunft der
  // aktuellen Woche. `patch` überschreibt nur die genannten Felder; ein Feld
  // auf `undefined` nimmt die Abweichung dort zurück.
  | { type: 'setAbweichung'; tab: MeetingKey; patch: Partial<Abweichung> }
  // Kreisaufseher-Woche (T62): baut den Ablauf um und wieder zurueck.
  | { type: 'setDienstwoche'; on: boolean }
  // Thema eines Vortragspunkts (Dienstvortrag, Schlussvortrag)
  | { type: 'setPartThema'; tab: MeetingKey; si: number; ii: number; begriff: string; thema: string }
  // Öffentlicher Vortrag / Wochenende (Planen, aktuelle Woche)
  | { type: 'talkEdit'; si: number; ii: number; title: string } // Vortragsthema (Freitext)
  | { type: 'openingSong'; song: string } // Anfangslied-Nummer ("" = entfernen)
  | { type: 'closingSong'; song: string } // Schlusslied-Nummer ("" = entfernen)
  // Erinnerungen
  | { type: 'changeReminder'; key: ReminderKey; delta: 1 | -1 }
  | { type: 'toggleReminderRepeat' }
  // Sprache
  | { type: 'setLang'; lang: Lang }
  | { type: 'openLangSheet'; mode?: 'cong' | 'alt' }
  | { type: 'closeLangSheet' }
  | { type: 'setLangSearch'; text: string }
  | { type: 'setAuxClass'; on: boolean }
  | { type: 'setCongLang'; name: string }
  | { type: 'addProgLang'; name: string }
  | { type: 'removeProgLang'; name: string }
  // Persistenz / Hydration
  // staleAt: gesetzt, wenn die Payload aus der Offline-Momentaufnahme kommt
  | { type: 'hydrate'; payload: HydratePayload; staleAt?: number }
  | { type: 'setDataStatus'; status: DataStatus; userId?: string } // userId: für Retry/Code-Einlösen ohne Hydration
  | { type: 'showToast'; text: string }
  | { type: 'hideToast' }

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
}

/**
 * Zustand und Versand liegen in **getrennten** Kontexten (T41).
 *
 * Vorher trugen sie ein gemeinsames Objekt. Das hatte eine unangenehme Folge:
 * `dispatch` ist über die ganze Sitzung dieselbe Funktion, das umgebende Objekt
 * aber nicht — jede Zustandsänderung erzeugte ein neues und rief damit auch die
 * Bausteine auf den Plan, die gar nichts lesen, sondern nur auslösen.
 *
 * Getrennt bleibt der Versand-Kontext unverändert, solange die App läuft. Wer
 * `useAppDispatch()` nimmt, rendert von einer Zustandsänderung nicht mehr neu.
 *
 * `useApp()` gibt es weiter und liefert beides — es baut das Paar nur wieder
 * zusammen. Wer den ganzen Zustand liest, rendert dabei bei jeder Änderung neu;
 * daran ändert eine Kontext-Trennung nichts (React verteilt Kontexte ganz oder
 * gar nicht). Dafür gibt es `useAppSelector`, siehe unten.
 */
export const AppStateContext = createContext<AppState | null>(null)
export const AppDispatchContext = createContext<Dispatch<AppAction> | null>(null)

/**
 * Der Zustand als **abonnierbarer Speicher** — die Grundlage der Selektoren.
 *
 * React verteilt einen Kontext ganz oder gar nicht: wer ihn liest, rendert bei
 * jeder Änderung neu, auch wenn ihn nur ein einziges Feld angeht. Das trifft
 * hier besonders `useT()`, an dem 44 Bausteine hängen, obwohl es nur `lang` und
 * `congLang` liest.
 *
 * Ein Speicher außerhalb von React löst das: `holen()` liefert den aktuellen
 * Zustand aus einer Referenz, `abonnieren()` meldet jede Änderung. Darauf setzt
 * `useSyncExternalStore` auf und weckt einen Baustein nur, wenn sich **sein**
 * Ausschnitt geändert hat.
 *
 * Der Zustands-Kontext bleibt daneben bestehen: er ist der einfache Weg für
 * alles, was ohnehin breit liest, und `useAppState()` funktioniert unverändert
 * weiter. Beide werden im selben Commit aktualisiert, sie können also nicht
 * auseinanderlaufen.
 */
export interface AppStore {
  holen: () => AppState
  abonnieren: (melden: () => void) => () => void
}

export const AppStoreContext = createContext<AppStore | null>(null)

/** Nur der Zustand. */
export function useAppState(): AppState {
  const state = useContext(AppStateContext)
  if (!state) throw new Error('useApp() außerhalb von <AppProvider> aufgerufen')
  return state
}

/**
 * Nur der Versand — für Bausteine, die auslösen ohne zu lesen. Sie rendern
 * dadurch bei Zustandsänderungen nicht mit.
 */
export function useAppDispatch(): Dispatch<AppAction> {
  const dispatch = useContext(AppDispatchContext)
  if (!dispatch) throw new Error('useApp() außerhalb von <AppProvider> aufgerufen')
  return dispatch
}

export function useApp(): AppContextValue {
  return { state: useAppState(), dispatch: useAppDispatch() }
}

/**
 * Ein Ausschnitt des Zustands — der Baustein rendert nur neu, wenn **dieser**
 * sich ändert.
 *
 * ```ts
 * const week = useAppSelector((s) => s.week)              // Zahl: einfach so
 * const { lang, congLang } = useAppSelector(
 *   (s) => ({ lang: s.lang, congLang: s.congLang }),
 *   flachGleich,                                          // Objekt: mit Vergleich!
 * )
 * ```
 *
 * **Die eine Falle:** ein Selektor, der bei jedem Aufruf ein *neues* Objekt
 * baut, sieht für React immer geändert aus — ohne passenden Vergleich läuft das
 * in eine Endlosschleife („The result of getSnapshot should be cached"). Für
 * gebündelte Felder deshalb `flachGleich` mitgeben; für einzelne Felder ist die
 * Vorgabe `Object.is` genau richtig. Der Test dazu steht in `context.test.tsx`.
 */
export function useAppSelector<T>(
  waehle: (zustand: AppState) => T,
  gleich: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useContext(AppStoreContext)
  // Beide Funktionen werden am Aufrufort fast immer inline geschrieben und sind
  // damit bei jedem Render neue Objekte. Als Abhängigkeit geführt, würde der
  // Baustein bei jedem Render neu abonnieren — deshalb liegen sie in
  // Referenzen, die still nachgezogen werden.
  const waehleRef = useRef(waehle)
  const gleichRef = useRef(gleich)
  waehleRef.current = waehle
  gleichRef.current = gleich
  // Der zuletzt gelieferte Ausschnitt. `useSyncExternalStore` vergleicht das
  // Ergebnis von `holen` mit `Object.is`; ohne diesen Zwischenspeicher gäbe ein
  // Objekt-Selektor bei jedem Aufruf etwas Neues zurück. Solange `gleich` den
  // Ausschnitt für unverändert hält, kommt derselbe Wert zurück.
  const zwischen = useRef<{ wert: T } | null>(null)
  const holen = useCallback((): T => {
    if (!store) throw new Error('useAppSelector() außerhalb von <AppProvider> aufgerufen')
    const neu = waehleRef.current(store.holen())
    const alt = zwischen.current
    if (alt && gleichRef.current(alt.wert, neu)) return alt.wert
    zwischen.current = { wert: neu }
    return neu
  }, [store])
  const abonnieren = useCallback(
    (melden: () => void) => (store ? store.abonnieren(melden) : () => {}),
    [store],
  )
  return useSyncExternalStore(abonnieren, holen, holen)
}

/**
 * Flacher Vergleich für Selektoren, die mehrere Felder bündeln: gleich, wenn
 * jedes Feld gleich ist. Ohne ihn hielte React jedes frisch gebaute Objekt für
 * eine Änderung — siehe `useAppSelector`.
 */
export function flachGleich<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const schluessel = Object.keys(a)
  if (schluessel.length !== Object.keys(b).length) return false
  return schluessel.every((k) => Object.is(a[k], b[k]))
}

/**
 * Ein Speicher über einen von außen gegebenen Zustand.
 *
 * Wer einen Teilbaum mit einem **abgewandelten** Zustand rendert — die
 * Wochen-Vorschau in `WeekStrip` zeigt die Nachbarwoche, Tests bauen eine
 * Bühne —, muss auch den Speicher überschreiben. Sonst läse derselbe Baustein
 * teils den abgewandelten Zustand (aus dem Kontext) und teils den echten (aus
 * dem Speicher): zwei Wochen gleichzeitig in einer Ansicht.
 *
 * Der Zustand darf sich ändern; nach jedem Render werden die Abonnenten
 * geweckt. Ein Speicher, der davon schweigt, ließe die Selektoren auf dem
 * ersten Stand stehen.
 */
export function useStaticStore(zustand: AppState): AppStore {
  const zustandRef = useRef(zustand)
  zustandRef.current = zustand
  const abonnentenRef = useRef<Set<() => void> | null>(null)
  abonnentenRef.current ??= new Set()
  const abonnenten = abonnentenRef.current
  useEffect(() => {
    for (const melden of abonnenten) melden()
  })
  return useMemo(
    () => ({
      holen: () => zustandRef.current,
      abonnieren: (melden) => {
        abonnenten.add(melden)
        return () => void abonnenten.delete(melden)
      },
    }),
    [abonnenten],
  )
}
