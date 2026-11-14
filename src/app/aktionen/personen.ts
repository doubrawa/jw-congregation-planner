/**
 * Personen und ihre Familien, Abwesenheiten, die Konten der Versammlung und
 * ihre Anmelde-Links — und alles, was mit einer gelöschten Person geht.
 */

import { kontoGehtMit } from '../eigene-person'
import { fsDropPersonPid, fsRenameLeader } from '../../data/fs'
import { aemterBeenden, displayName, linkFamily, neuWennGeaendert, unlinkFamily } from '../../data/helpers'
import { dropPersonPid, renameInWeeks } from '../../data/namensbindung'
import { tagebuchUmbenannt } from '../../data/planung/schluessel'
import type { AppAction, AppState } from '../context'
import { mitFreienPlaetzen, toastKey } from './gemeinsam'

/**
 * Die Person `id` aus dem Zustand nehmen — samt allem, was auf sie zeigt:
 * Referenzen lösen (Gruppenleitung, Konto, offene Codes); Namen in bereits
 * geplanten Wochen bleiben als Text stehen.
 *
 * **Die `pid` muss dabei weg**: sie ist ein Fremdschlüssel, und ohne
 * Ziel zeigt sie ins Leere. `gehoertZu` entscheidet über die Id, fände
 * niemanden mehr, und der Slot zählte nirgends — weder in der Auslastung noch
 * in den Konflikten noch in den Aufgaben. Ohne Id greift wieder der Namensweg;
 * legt der Planer dieselbe Person neu an, findet `pidsNachtragen` sie beim
 * nächsten Laden wieder.
 */
function ohnePerson(state: AppState, id: string): AppState {
  return {
    ...state,
    weeks: dropPersonPid(state.weeks, id),
    fsWeeks: fsDropPersonPid(state.fsWeeks, id),
    persons: state.persons.filter((p) => p.id !== id),
    // Ihre Abwesenheiten gehen mit: Eine Abwesenheit ohne Person gehört
    // niemandem (`absence.ts`), und mit toter Id stünde sie hier bis zum
    // nächsten Laden herum. Die Datenbank räumt `persist.ts`.
    absences: state.absences.filter((a) => a.personId !== id),
    // Ebenso ihre Absagen — die Datenbank nimmt sie per Kaskade mit.
    absagen: state.absagen.filter((a) => a.personId !== id),
    groups: aemterBeenden(state.groups, id),
    // Ein Gruppenbesuch verliert seinen Besucher, nicht sich selbst — wie
    // die Datenbank (`on delete set null`). Der Plan zeigt ihn dann ohne
    // Besucher, und der Planer setzt einen neuen ein.
    gruppenbesuche: neuWennGeaendert(
      state.gruppenbesuche,
      state.gruppenbesuche.map((b) => (b.pid === id ? { ...b, pid: null } : b)),
    ),
    // Ebenso eine Woche eines weiteren Plans: Sie bleibt, nur offen.
    planEintraege: neuWennGeaendert(
      state.planEintraege,
      state.planEintraege.map((e) => (e.pid === id ? { ...e, pid: null } : e)),
    ),
    // Ebenso ein vorgemerkter Vortrag: Es bleibt der Name, den die
    // Woche beim Anlegen erneut einer Person zuzuordnen versucht.
    vortraege: neuWennGeaendert(
      state.vortraege,
      state.vortraege.map((v) => (v.pid === id ? { ...v, pid: null } : v)),
    ),
    // Die Anwesenden bleiben, nur wer eingetragen hat, fehlt danach —
    // wie die Datenbank (`on delete set null`).
    anwesenheit: neuWennGeaendert(
      state.anwesenheit,
      state.anwesenheit.map((a) => (a.pid === id ? { ...a, pid: null } : a)),
    ),
    // Eine Tausch-Anfrage geht mit jeder der beiden Personen — wie in
    // der Datenbank (`on delete cascade`): Sie hat dann niemanden mehr.
    tauschAnfragen: neuWennGeaendert(
      state.tauschAnfragen,
      state.tauschAnfragen.filter((a) => a.von !== id && a.an !== id),
    ),
    // Trolley-Termine wie in der Datenbank: Wer eingetragen hat, nimmt seinen
    // Termin mit (`on delete cascade`); als Partner fehlt er nur — der andere
    // sucht wieder einen (`on delete set null`).
    trolleyTermine: neuWennGeaendert(
      state.trolleyTermine,
      state.trolleyTermine
        .filter((t) => t.pid !== id)
        .map((t) => (t.partner === id ? { ...t, partner: null, gemeinsam: false } : t)),
    ),
    // Ihr Konto geht mit (`kontoGehtMit`): Ohne Person sähe es
    // weiter alles, und wer nicht mehr zur Versammlung gehört, nutzt die App
    // nicht mehr (`persist.ts` löscht die Mitgliedschaft, die Datenbank das
    // Konto). Gründlicher als der Fremdschlüssel (`on delete set null`) — nur
    // das eigene bleibt, ohne Person, und steht dann unter „Konten ohne Person".
    members: state.members
      .filter((m) => !kontoGehtMit(m, id, state.userId))
      .map((m) => (m.personId === id ? { ...m, personId: null } : m)),
    // Ihr Anmelde-Link geht mit ihr (`on delete cascade`).
    anmeldeLinks: state.anmeldeLinks.filter((l) => l.personId !== id),
  }
}

type PersonenAktion = Extract<
  AppAction,
  {
    type:
      | 'addAbsence'
      | 'removeAbsence'
      | 'removePerson'
      | 'addPerson'
      | 'updatePerson'
      | 'updateMember'
      | 'removeMember'
      | 'linksAusgestellt'
      | 'setFamily'
  }
>

export function personen(state: AppState, action: PersonenAktion): AppState {
  switch (action.type) {
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
    case 'removePerson': {
      // Vorher ihre künftigen Plätze freigeben, wenn der Admin es gewählt hat
      // (T182) — gemeldet wird es niemandem, sie geht (`OHNE_ENTZUG`).
      const { weeks, fsWeeks, confirmations } = mitFreienPlaetzen(state, action.id, action.freigeben ?? [])
      return {
        ...ohnePerson({ ...state, weeks, fsWeeks, confirmations }, action.id),
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
      // Wer die Gruppe wechselt, ist in der alten weder Aufseher noch Gehilfe:
      // Er gehört ihr nicht mehr an (`aemterBeenden`). Seine
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
          // Einen doppelten Namen nimmt „Person bearbeiten" gar nicht erst an,
          // und den Rest sichert der Index `persons_name_eindeutig`:
          // Der alte Name gehört also genau dieser Person.
          next.weeks = renameInWeeks(state.weeks, action.id, oldName, newName)
          // Treffpunkte sind die zweite Datenquelle und tragen den Leiter
          // ebenfalls als Text — ohne dies stünde dort weiter der alte Name,
          // während die Zusammenkünfte längst den neuen zeigen.
          next.fsWeeks = fsRenameLeader(state.fsWeeks, action.id, oldName, newName)
          // Das Versand-Tagebuch führt Platz und Name: Unter dem alten Namen
          // gälte, was der Person gemeldet ist, wieder als ungemeldet, und
          // „Plan senden" zeigte auf sie (`tagebuchUmbenannt`).
          next.sentLog = tagebuchUmbenannt(state.sentLog, oldName, newName)
          next.persoenlich = tagebuchUmbenannt(state.persoenlich, oldName, newName)
        }
      }
      // Admin-Recht in verknüpfte Konten spiegeln (members.admin = Quelle der
      // Rechteprüfung); das eigene Konto ist per UI-Sperre ausgenommen. Wer
      // noch keines hat, bekommt es bei der ersten Anmeldung aus der
      // Vormerkung (Function `anmelden`).
      if ('adminVorgemerkt' in action.patch) {
        const on = Boolean(action.patch.adminVorgemerkt)
        next.members = state.members.map((m) =>
          m.personId === action.id && m.userId !== state.userId ? { ...m, admin: on } : m,
        )
      }
      // Ebenso das Planer-Recht. Vom eigenen Konto aus nimmt es
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
    case 'setFamily':
      return {
        ...state,
        persons: action.add
          ? linkFamily(state.persons, action.id, action.memberId)
          : unlinkFamily(state.persons, action.memberId),
      }
  }
}
