/**
 * Das Programm der Wochen: von jw.org holen, „Unser Leben als Christ"
 * bearbeiten, Abweichung, Anlass und weitere Termine, Lieder und Themen der
 * Vorträge — dazu die Anwesenden einer Zusammenkunft.
 */

import { neueWocheEinordnen } from '../../data/neue-woche'
import { isSong, mtab } from '../../data/helpers'
import { ANWESENDE_HOECHSTENS, anwesenheitDer, type Anwesenheit } from '../../data/anwesenheit'
import { itemZusagenKeys } from '../../data/planung/schluessel'
import {
  editTalkTheme,
  lacAdd,
  lacMinuten,
  lacMove,
  lacRemove,
  lacTitel,
  togglePartner,
  setAbweichung,
  setPartThema,
  setClosingSong,
  setOpeningSong,
} from '../../data/meeting-edit'
import { setAnlass, setAnlassTermin } from '../../data/anlass'
import { terminAdd, terminRemove, terminUpdate } from '../../data/termine'
import type { AppAction, AppState } from '../context'
import { dropConfirmations, pushNotif, toastKey } from './gemeinsam'

type ProgrammAktion = Extract<
  AppAction,
  {
    type:
      | 'startImport'
      | 'addImportedWeek'
      | 'mergeWeekAlt'
      | 'stopImport'
      | 'heftBefundeGeprueft'
      | 'anwesenheitSetzen'
      | 'lacMinuten'
      | 'lacRemove'
      | 'togglePartner'
      | 'lacMove'
      | 'lacTitel'
      | 'lacAdd'
      | 'setAbweichung'
      | 'setAnlass'
      | 'setAnlassTermin'
      | 'terminAdd'
      | 'terminUpdate'
      | 'terminRemove'
      | 'setPartThema'
      | 'talkEdit'
      | 'openingSong'
      | 'closingSong'
  }
>

export function programm(state: AppState, action: ProgrammAktion): AppState {
  switch (action.type) {
    case 'startImport':
      return state.importing ? state : { ...state, importing: true }
    case 'addImportedWeek': {
      // Dieselbe Woche ein zweites Mal: nichts anhängen. Gespeichert überschrieb
      // sie die schon geplante Woche gleichen Montags mit einer leeren — so kam
      // sie, solange `import-week` mangels neuerer Woche die letzte erneut schickte.
      if (state.weeks.some((w) => w.start === action.week.start)) {
        return { ...state, importing: false, toast: toastKey(state, 'toastAlleWochen') }
      }
      // Endzeiten, Zusätzliche Klasse, Gedächtnismahl, Treffpunkte, Vortrag und
      // fester Studienleiter: dieselbe Einordnung wie im Skript
      // `wochen-importieren.mjs` (`neue-woche.ts`).
      const { week, fsWeek } = neueWocheEinordnen(action.week, {
        zeiten: state.congregation.times,
        auxClass: state.auxClass,
        fsRules: state.fsRules,
        gruppenbesuche: state.gruppenbesuche,
        vortraege: state.vortraege,
        persons: state.persons,
        absences: state.absences,
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
      const befunde = action.befunde ?? []
      return {
        ...state,
        weeks: state.weeks.map((w) =>
          w.start !== action.start
            ? w
            : {
                ...w,
                alt: { ...w.alt, ...action.alt },
                ...(befunde.length > 0 ? { befunde: [...(w.befunde ?? []), ...befunde] } : {}),
              },
        ),
      }
    }
    case 'stopImport':
      return { ...state, importing: false }
    case 'heftBefundeGeprueft': {
      // Geprüft ist geprüft: Die Woche verliert die Befunde ganz, mit ihnen
      // Kasten und Marken im Plan. Ohne Befunde bleibt die Woche dieselbe —
      // sonst schriebe ein zweiter Tipp sie noch einmal.
      if (!state.weeks.some((w) => w.start === action.start && w.befunde)) return state
      return {
        ...state,
        weeks: state.weeks.map((w) => {
          if (w.start !== action.start) return w
          const { befunde: _geprueft, ...ohne } = w
          return ohne
        }),
      }
    }
    case 'anwesenheitSetzen': {
      // Eine Zeile je Zusammenkunft; leer heißt „nicht eingetragen" (`null`).
      // Ungültiges kommt nicht an — das Formular prüft (`anwesendeAusEingabe`),
      // die Datenbank ebenso (0 bis 9999).
      const { woche, tab, saal, video } = action
      const gueltig = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= ANWESENDE_HOECHSTENS)
      if (!gueltig(saal) || !gueltig(video)) return state
      const alt = anwesenheitDer(state.anwesenheit, woche, tab)
      if (alt && alt.saal === saal && alt.video === video) return state
      const neu: Anwesenheit = { woche, tab, saal, video, pid: state.personId }
      const anwesenheit = alt
        ? state.anwesenheit.map((a) => (a === alt ? neu : a))
        : [...state.anwesenheit, neu].sort((a, b) => a.woche.localeCompare(b.woche) || a.tab.localeCompare(b.tab))
      return { ...state, anwesenheit, toast: toastKey(state, 'anwesendGespeichert') }
    }
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
  }
}
