/**
 * Die Sitzung: anmelden und abmelden, der Bestand beim Laden und Nachladen
 * (`hydrate`) samt Ladezustand, ein neuer Kalendertag — und die Glocke mit
 * ihren Mitteilungen.
 */

import { syncAuxSlots } from '../../data/aux-class'
import { currentWeekIndex, wirktAb } from '../../data/meeting-dates'
import { leererZustand } from '../init'
import type { Notification } from '../../data/types'
import type { AppAction, AppState } from '../context'
import { toastKey, zurNaechstenZusammenkunft } from './gemeinsam'
import { vorzulegen } from '../vorlegen'

/**
 * **Gelesen bleibt gelesen.** Eine geladene Liste kann abgefragt worden sein,
 * bevor das eigene „gelesen" in der Datenbank stand: Die Abfrage läuft, man
 * tippt die Mitteilung oder „Alle gelesen" an, die Antwort kommt — und die
 * Mitteilung stünde sonst wieder unter „Neu", der Punkt an der Glocke käme
 * zurück. Das gilt beim Öffnen der Mitteilungen (`setNotifs`) wie bei jedem
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

type SitzungAktion = Extract<
  AppAction,
  {
    type:
      | 'login'
      | 'sitzungGeprueft'
      | 'welcomeShown'
      | 'logout'
      | 'setNotifs'
      | 'markAllRead'
      | 'clearNotifs'
      | 'mitteilungGelesen'
      | 'hydrate'
      | 'setDataStatus'
      | 'nachladenGescheitert'
      | 'neuerTag'
  }
>

export function sitzung(state: AppState, action: SitzungAktion): AppState {
  switch (action.type) {
    case 'login':
      return {
        ...state,
        screen: 'start',
        confirmOpen: vorzulegen(state.myTasks, state.substituteReqs),
        welcomePending: action.welcome === true,
        keineVersammlung: false,
      }
    case 'sitzungGeprueft':
      // Zweimal gemeldet, wenn der Offline-Start vorgegriffen hat (`store.tsx`).
      return state.sitzungPruefen ? { ...state, sitzungPruefen: false } : state
    case 'welcomeShown':
      return { ...state, welcomePending: false }
    case 'logout':
      /*
       * **Abmelden leert den Bestand, nicht nur die Ansicht.**
       *
       * Blieben Personen, Wochen, „Meine Aufgaben", Konto und Versammlung
       * stehen und meldete sich am selben Gerät jemand anderes an, legte ihm
       * `login` das Bestätigungsblatt des Vorgängers vor — mit dessen
       * Aufgaben, Namen und Versammlung im Menü, bis die eigenen Daten geladen
       * sind. Eine Absage daraus ginge als Verhinderung des Vorgängers an die
       * eigenen Planer.
       *
       * Was bleibt, gehört dem Gerät (`Vorlieben`). Alles Übrige der Ansicht —
       * Reiter, Blätter, Sprungziel, Offline-Stand, Begrüßung — beginnt wie
       * beim Start der App.
       *
       * Den Grund „keine Versammlung" nimmt erst eine Anmeldung weg: Jedes
       * Abmelden kommt zweimal, selbst und danach als `SIGNED_OUT`
       * (`store.tsx`), das zweite ohne Grund.
       */
      return {
        ...leererZustand({ theme: state.theme, fontScale: state.fontScale, lang: state.lang }),
        keineVersammlung: action.keineVersammlung === true || state.keineVersammlung,
      }
    case 'setNotifs':
      return { ...state, notifs: gelesenBehalten(action.notifs, state.notifs) }
    case 'markAllRead':
      return { ...state, notifs: state.notifs.map((n) => ({ ...n, read: true })) }
    case 'clearNotifs':
      return state.notifs.length > 0 ? { ...state, notifs: [] } : state
    case 'mitteilungGelesen':
      return state.notifs.some((n) => n.id === action.id && !n.read)
        ? { ...state, notifs: state.notifs.map((n) => (n.id === action.id ? { ...n, read: true } : n)) }
        : state
    case 'hydrate': {
      const p = action.payload
      const weeks = syncAuxSlots(p.weeks, p.auxClass, wirktAb())
      // Auf die laufende Woche springen — mit der ÄLTESTEN geladenen Woche
      // zeigte die App nach dem Login sonst ein bis zu ein Jahr altes Programm.
      // Fällt heute in keine geladene Woche (frische Versammlung, Lücke im
      // Import), bleibt es beim Anfang.
      const aktuell = currentWeekIndex(weeks)
      /*
       * **Eine selbst gewählte Woche übersteht das Nachladen.**
       *
       * Die App lädt auch mitten in der Arbeit still nach („Plan senden",
       * Glocke). Spränge sie dabei auf die laufende Woche, verlöre der Planer
       * seinen Platz: Er gäbe Woche +3 frei und stünde danach auf der
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
       * Schlägt ein Schreibvorgang wegen eines Konflikts fehl, lädt
       * `store.tsx` **still** nach — ohne Navigation, mitten in der Arbeit,
       * also genau dann, wenn ein Zuteilungs-Blatt offen steht. Rutscht das
       * Fenster dabei (52 Wochen, vorn fällt die älteste heraus), zeigte
       * `slotSel.wi` danach auf eine andere Woche, und der nächste Klick
       * schriebe den Namen dorthin. Lautlos, in eine Woche, die niemand offen
       * hat.
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
        staleLangsam: action.staleAt !== undefined && action.langsam === true,
        persons: p.persons,
        services: p.services,
        groups: p.groups,
        weeks,
        fsRules: p.fsRules,
        fsWeeks: p.fsWeeks,
        // Einer älteren Momentaufnahme fehlt das Feld vielleicht — wie beim
        // Versand-Tagebuch darunter.
        gruppenbesuche: p.gruppenbesuche ?? [],
        // Ältere Momentaufnahmen kennen die Vormerkungen nicht.
        vortraege: p.vortraege ?? [],
        // Ältere Momentaufnahmen kennen die Trolleys nicht.
        trolleys: p.trolleys ?? [],
        trolleyTermine: p.trolleyTermine ?? [],
        plaene: p.plaene ?? [],
        planEintraege: p.planEintraege ?? [],
        absences: p.absences,
        // Ältere Momentaufnahmen kennen die Absagen nicht.
        absagen: p.absagen ?? [],
        // Ebenso die Anwesenden und die Tausch-Anfragen.
        anwesenheit: p.anwesenheit ?? [],
        tauschAnfragen: p.tauschAnfragen ?? [],
        // Und das „Nein, danke" auf Ersatzgesuche.
        abgelehnteGesuche: p.abgelehnteGesuche ?? [],
        notifs: gelesenBehalten(p.notifications, state.notifs),
        confirmations: p.confirmations,
        // Aus einer alten Momentaufnahme (lib/snapshot.ts) fehlt das Feld — sie
        // wurde geschrieben, bevor es das Tagebuch gab.
        sentLog: p.sentLog ?? {},
        // Ebenso aus einer älteren Momentaufnahme.
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
      // Nach dem Laden gleich auf die nächste Zusammenkunft: Woche UND
      // Reiter. `aktuell` allein trifft nur die Woche — am Sonntagabend steht
      // die nächste schon in der Folgewoche. Erst hier, nicht vorher: Die
      // Wochentage kommen aus `p.congregation`, das im Zustand darüber noch
      // der alte ist.
      return zurNaechstenZusammenkunft(geladen)
    }
    case 'setDataStatus':
      return {
        ...state,
        dataStatus: action.status,
        userId: action.userId ?? state.userId,
      }
    case 'nachladenGescheitert':
      // Der Bestand bleibt, wie er ist — er ist frischer als jede Momentaufnahme.
      // Stand der letzte Stand als „langsam" da, kommt nun nichts mehr: „Offline".
      return { ...state, staleLangsam: false, toast: toastKey(state, 'stFehler') }
    case 'neuerTag':
      // Wird im `reducer` (`reducer.ts`) abgeleitet; hier gibt es nichts zu ändern.
      return state
  }
}
