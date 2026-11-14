/**
 * Zusagen und Ersatz: bestätigen und absagen, einspringen, ein Gesuch
 * ablehnen, einen freien Platz übernehmen, tauschen — und der Haken
 * „persönlich Bescheid gegeben".
 */

import { absageNachricht } from '../../../supabase/functions/_shared/absage-nachricht.ts'
import { platzAuswahl } from '../../data/offene-plaetze'
import { eigenePerson } from '../eigene-person'
import { gesuchKennung } from '../../lib/abgelehnte-gesuche'
import { displayName, nameVon } from '../../data/helpers'
import { tauschLokal } from '../../data/tausch'
import { alsFreitext } from '../../i18n/translate'
import { aufgabenBezeichnung } from '../../data/planung/aufgaben'
import { helperKeyParts, sentKey, wochenIndex } from '../../data/planung/schluessel'
import { assignmentsInMeeting, assignSlot } from '../../data/planung/zuteilen'
import type { AppAction, AppState } from '../context'
import { dropConfirmations, makeNotif, toastKey } from './gemeinsam'

/** Anzeigename des eingeloggten Nutzers. */
function currentUserName(state: AppState): string {
  const me = eigenePerson(state)
  return me ? displayName(me) : ''
}

/**
 * Die Nachricht beim Absagen als letztes Atom der Mitteilung — oder
 * nichts, wenn keine geschrieben wurde.
 *
 * **Ein eigenes Atom, als Freitext gekennzeichnet**: Der Planer liest sie so,
 * wie sie geschrieben wurde, in jeder Sprache — der Übersetzer der Glocke
 * reicht ein gekennzeichnetes Atom unverändert weiter. Wie sie dafür
 * zugeschnitten wird, fragt die Function an derselben Stelle
 * (`absageNachricht`).
 */
function nachrichtAtom(nachricht: string | undefined): string {
  const text = absageNachricht(nachricht ?? '')
  return text ? ` · ${alsFreitext(text)}` : ''
}

type ZusagenAktion = Extract<
  AppAction,
  {
    type:
      | 'persoenlichBescheid'
      | 'tauschAngefragt'
      | 'tauschWeg'
      | 'getauscht'
      | 'confirmAll'
      | 'confirmTask'
      | 'declineTask'
      | 'takeSubstitute'
      | 'gesuchAblehnen'
      | 'platzUebernehmen'
  }
>

export function zusagen(state: AppState, action: ZusagenAktion): AppState {
  switch (action.type) {
    case 'persoenlichBescheid': {
      // Nur an einer Zeile ohne Konto — dieselbe Grenze zieht die Datenbank
      // (`persoenlich_bescheid`). Was dort nicht steht, ist niemandem zu sagen.
      const schluessel = sentKey(action.key, action.name)
      if (!(schluessel in state.persoenlich)) return state
      const wann = action.ja ? new Date().toISOString() : null
      return { ...state, persoenlich: { ...state.persoenlich, [schluessel]: wann } }
    }
    case 'tauschAngefragt':
      // Je Platz eine Anfrage — eine frühere zu diesem Platz ersetzt sie.
      return {
        ...state,
        tauschAnfragen: [...state.tauschAnfragen.filter((a) => a.gibtAb !== action.anfrage.gibtAb), action.anfrage],
        toast: toastKey(state, 'tauschToastAngefragt'),
      }
    case 'tauschWeg': {
      const tauschAnfragen = state.tauschAnfragen.filter((a) => a.id !== action.id)
      return tauschAnfragen.length === state.tauschAnfragen.length ? state : { ...state, tauschAnfragen }
    }
    case 'getauscht': {
      // Was die Function geschrieben hat, hier nachgezogen: beide Plätze
      // getauscht, zugesagt, beide im Versand-Tagebuch — sonst zählte
      // „Plan senden" sie bis zum nächsten Laden als ungemeldet. Jede andere
      // Anfrage zu einem der beiden Plätze ist damit erledigt — die Function
      // hat sie gelöscht. Ein Entzug ist es nicht (`OHNE_ENTZUG`).
      //
      // Ohne Konto (`direkt`) hat der andere nicht zugesagt: Für seinen neuen
      // Platz steht keine Zusage da, auch nicht die alte des Fragenden. Er
      // weiß aber Bescheid — abgesprochen ist es mündlich (`persoenlich`, wie
      // die Function).
      const { gibtAb, nimmt, von, an } = action.tausch
      const beide = new Set([gibtAb, nimmt])
      const name = (pid: string) => nameVon(state.persons, pid)
      const jetzt = new Date().toISOString()
      return {
        ...state,
        weeks: tauschLokal(state.weeks, state.services, state.persons, action.tausch),
        confirmations: action.ohneKonto
          ? { ...dropConfirmations(state.confirmations, [gibtAb]), [nimmt]: 'bestätigt' }
          : { ...state.confirmations, [gibtAb]: 'bestätigt', [nimmt]: 'bestätigt' },
        sentLog: { ...state.sentLog, [sentKey(gibtAb, name(an))]: jetzt, [sentKey(nimmt, name(von))]: jetzt },
        persoenlich: action.ohneKonto ? { ...state.persoenlich, [sentKey(gibtAb, name(an))]: jetzt } : state.persoenlich,
        tauschAnfragen: state.tauschAnfragen.filter((a) => !beide.has(a.gibtAb) && !beide.has(a.nimmt)),
        // Das Blatt, aus dem getauscht wurde, ist fertig: Sein Platz gehört jetzt dem anderen.
        tauschId: null,
        toast: action.ohneKonto
          ? toastKey(state, 'tauschToastDirekt', { name: name(an) })
          : toastKey(state, 'tauschToastGetauscht'),
      }
    }
    case 'confirmAll': {
      // Alle offenen auf einmal — dieselbe Zusage wie einzeln, je Aufgabe.
      const offen = state.myTasks.filter((t) => t.status === 'offen')
      if (offen.length === 0) return state
      const confirmations = { ...state.confirmations }
      for (const t of offen) confirmations[t.id] = 'bestätigt'
      return { ...state, confirmations, toast: toastKey(state, 'toastBestaetigt') }
    }
    case 'confirmTask':
      // Status in die ConfirmationMap — myTasks und confirmOpen folgen aus der
      // Ableitung (withDerivedTasks). Ein offenes Ersatzgesuch hält das Blatt
      // dort ebenfalls.
      return {
        ...state,
        confirmations: { ...state.confirmations, [action.id]: 'bestätigt' },
        myTaskId: null,
        absageId: null,
        toast: toastKey(state, 'toastBestaetigt'),
      }
    case 'declineTask': {
      if (action.ids.length === 0) return state
      // Der Name als gekennzeichneter Freitext: Die Glocke übersetzt beim
      // Anzeigen Atom für Atom, und ein Bruder namens „Markus 2" (die
      // Schreibweise für Namensgleiche) stünde dort sonst als „Mark 2".
      // Siehe `_shared/i18n/freitext.ts`.
      const wer = alsFreitext(currentUserName(state))
      const zusatz = nachrichtAtom(action.nachricht)
      // Das Echo in der eigenen Glocke, je Aufgabe eine Zeile — zu sehen nur
      // bei dem, der plant (`sichtbareMitteilungen`). Allen, die planen,
      // schreibt die Function dieselben Zeilen (`substitute/absage.ts`,
      // ausgelöst in `persist`). Kanonisch deutsch, beide Hälften: Die Glocke
      // übersetzt beim Anzeigen.
      const echos = action.ids.map((id) => {
        const task = state.myTasks.find((t) => t.id === id)
        const bezeichnung = task ? aufgabenBezeichnung(task) : ''
        // Der Schlüssel der Aufgabe: Ein Tipp in der Glocke des Planers führt
        // in ihre Woche (`mitteilungsZiel`); ohne ihn landete er nirgends.
        return makeNotif('verhindert', 'Verhinderung gemeldet', `${bezeichnung} — ${wer}${zusatz}`, id)
      })
      const confirmations = { ...state.confirmations }
      for (const id of action.ids) confirmations[id] = 'verhindert'
      // Bei einem Hilfsdienst wird automatisch ein Ersatz gesucht → eigener
      // Toast; sonst nur die Meldung an den Planer. Mehrere sagt die
      // Abwesenheit ab, und die nennt danach selbst, wie viele es waren.
      const [einzige] = action.ids
      const declineToast = action.ids.length === 1 && einzige && helperKeyParts(einzige) ? 'toastErsatzGesucht' : 'toastVerhindert'
      return {
        ...state,
        confirmations,
        notifs: [...echos, ...state.notifs],
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
    case 'gesuchAblehnen': {
      // Das Konto merkt es sich (`abgelehnte_gesuche`, `persist.ts`); sonst
      // erfährt niemand davon. Ob das Blatt danach noch etwas vorzulegen hat,
      // rechnet die Ableitung — die Liste ist eine ihrer Quellen.
      const req = state.substituteReqs.find((r) => r.key === action.key)
      if (!req || req.abgelehnt) return state
      return { ...state, abgelehnteGesuche: [...state.abgelehnteGesuche, gesuchKennung(req)] }
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
  }
}
