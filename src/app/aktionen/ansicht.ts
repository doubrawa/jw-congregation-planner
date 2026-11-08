/**
 * Was der Bildschirm zeigt: Navigation samt Rechteprüfung, Woche und Reiter,
 * Darstellung und Sprache der App, die Ansicht einer anderen Stufe, die
 * Blätter und der Toast.
 */

import { naechsteZusammenkunft } from '../../data/meeting-dates'
import { darfPlanen, erlaubteScreens, rechteVon, themaVon } from '../../data/rechte'
import type { MeetingKey, MeetingTab, Screen, SlotSelection } from '../../data/types'
import type { AppAction, AppState } from '../context'
import { nextToast, zurNaechstenZusammenkunft } from './gemeinsam'

/**
 * **Bleibt die Auswahl beim Reiterwechsel?** Nur in ihrem eigenen Reiter — dort
 * ist ihr Platz zu sehen. Bliebe sie überall stehen, spränge sie am Desktop
 * nach „Woche einrichten" oder „Zusagen" als Blatt auf, für einen Platz, den
 * dort niemand sieht.
 */
function auswahlSichtbar(sel: SlotSelection, tab: MeetingTab): boolean {
  return (sel.kind === 'fs' ? 'fs' : sel.tab) === tab
}

/**
 * Der Reiter, wenn man vom Predigtdienst zu den Zusammenkünften wechselt:
 * die nächste Zusammenkunft, sofern sie in der gezeigten Woche liegt —
 * sonst die unter der Woche. Die Woche selbst bleibt; wer eine gewählt hat, will
 * in ihr bleiben.
 */
function zusammenkunftDerWoche(state: AppState): MeetingKey {
  const naechste = naechsteZusammenkunft(state.weeks, state.congregation.times)
  return naechste && naechste.wi === state.week ? naechste.tab : 'mid'
}

type AnsichtAktion = Extract<
  AppAction,
  {
    type:
      | 'navigate'
      | 'sprungZielErreicht'
      | 'prevWeek'
      | 'nextWeek'
      | 'setTab'
      | 'setFsBereich'
      | 'setTheme'
      | 'setAnsicht'
      | 'setFontScale'
      | 'openSlot'
      | 'closeSlot'
      | 'selectPerson'
      | 'openMyTask'
      | 'closeMyTask'
      | 'openAbsage'
      | 'closeAbsage'
      | 'openTausch'
      | 'closeTausch'
      | 'openS89'
      | 'closeS89'
      | 'setLang'
      | 'openLangSheet'
      | 'closeLangSheet'
      | 'setLangSearch'
      | 'openServiceSheet'
      | 'closeServiceSheet'
      | 'closeConfirm'
      | 'showToast'
      | 'hideToast'
  }
>

export function ansicht(state: AppState, action: AnsichtAktion): AppState {
  switch (action.type) {
    case 'navigate': {
      // Rechteprüfung: Wer den Bildschirm nicht sehen darf, landet im Programm.
      // Dieselbe Liste bestückt die Navigation (AppShell) — eine Antwort, zwei
      // Fragesteller.
      const rechte = rechteVon(state)
      const erlaubteZiele = erlaubteScreens(rechte)
      let screen: Screen = erlaubteZiele.includes(action.screen) ? action.screen : 'programm'
      // Ein Thema des Menüs bringt seinen Reiter mit; ohne Thema bleibt
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
      // Planen nur, wo man planen darf. Der Gruppenaufseher plant allein
      // Treffpunkte: Ein Sprung nach Planen ohne Thema (Push, Start-Bildschirm)
      // zeigt ihm deshalb den Predigtdienst. Wählt er ausdrücklich die
      // Zusammenkünfte, sieht er sie an.
      if (screen === 'planen' && !darfPlanen(rechte, themaVon(wunsch))) {
        if (action.thema === undefined) wunsch = 'fs'
        else screen = 'programm'
      }
      // Vier Tabs sind keine Zusammenkunft und nicht überall erlaubt:
      // „Treffpunkte" und „Weitere Pläne" gibt es in Programm und Planen,
      // „Bearbeiten" **nur** im Planen — das Programm ist für alle nur lesend —
      // und nur für Admin und Planer: Bearbeiten heißt den Plan ändern. Die
      // Zusagen ebenfalls nur im Planen. Beim Wechsel woandershin auf die
      // Zusammenkunft unter der Woche zurücksetzen, sonst stünde die Ansicht auf
      // einem Reiter, den es dort nicht gibt. Die beiden Zusammenkünfte stehen
      // nicht in der Liste — sie gibt es überall.
      const erlaubt: Partial<Record<MeetingTab, boolean>> = {
        fs: screen === 'programm' || screen === 'planen',
        edit: screen === 'planen' && rechte.zuteilen,
        wp: screen === 'programm' || screen === 'planen',
        // Die Zusagen der Woche sieht, wer zuteilt — beim Planen.
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
        // Ein Bereich zum Hinspringen gilt nur, wenn der Screen auch
        // erreicht wird; jede Navigation ohne einen räumt den alten ab.
        sprungZiel: action.abschnitt && screen === action.screen ? action.abschnitt : null,
        // Woher das Planen kam; ohne Angabe von außen (Start, Mitteilung, Push).
        planenVon: action.von ?? null,
      }
      /*
       * **Eine bestimmte Woche** (Planungs-Karte des Start-Bildschirms).
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
        // Auch hier nur planen, wo man planen darf — der Gruppenaufseher die Treffpunkte.
        const zielTab: MeetingTab = screen === 'planen' && !darfPlanen(rechte, themaVon(wocheTab)) ? 'fs' : wocheTab
        return {
          ...nachher,
          week: Math.min(Math.max(0, action.woche.wi), Math.max(0, state.weeks.length - 1)),
          tab: zielTab,
          // Eine bestimmte Woche heißt beim Predigtdienst: ihre Treffpunkte.
          // Stünde der Bereich noch auf Grundplan oder Gruppenbesuchen, zeigte
          // der Sprung keine Woche.
          ...(zielTab === 'fs' ? { fsBereich: 'treffpunkte' as const } : {}),
          terminGewaehlt: true,
        }
      }
      // Programm und Planen öffnen mit der nächsten Zusammenkunft —
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
      // Eine eigene Wahl — ab jetzt springt die Ansicht nicht mehr.
      return {
        ...state,
        tab: action.tab,
        terminGewaehlt: true,
        slotSel: state.slotSel && auswahlSichtbar(state.slotSel, action.tab) ? state.slotSel : null,
      }
    case 'setFsBereich':
      // Grundplan, Gruppenbesuche und Trolleys zeigen keinen Platz der Woche:
      // Eine Auswahl dort bliebe sonst stehen und spränge als Blatt auf.
      return state.fsBereich === action.bereich ? state : { ...state, fsBereich: action.bereich, slotSel: null }
    case 'setTheme':
      return { ...state, theme: action.theme }
    case 'setAnsicht': {
      // Nur ein echtes Admin-Konto — geprüft am echten Recht:
      // Fragte die Wache die Ansicht, gäbe es aus „Verkündiger" kein Zurück.
      if (!state.admin) return state
      const nachher = { ...state, ansicht: action.ansicht }
      // Fällt der Bildschirm unter der Ansicht weg, geht es zum Start — dieselbe
      // Wache wie `navigate`, mit demselben Aufräumen.
      const rechte = rechteVon(nachher)
      const bleibt =
        erlaubteScreens(rechte).includes(state.screen) && (state.screen !== 'planen' || darfPlanen(rechte, themaVon(state.tab)))
      return bleibt ? nachher : ansicht(nachher, { type: 'navigate', screen: 'start' })
    }
    case 'setFontScale':
      return { ...state, fontScale: action.scale }
    case 'openSlot':
      return { ...state, slotSel: action.sel }
    case 'closeSlot':
      return { ...state, slotSel: null }
    case 'selectPerson':
      return { ...state, selectedPersonId: action.id }
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
    // Wie das Absage-Blatt ersetzt das Tausch-Blatt das der Aufgabe.
    case 'openTausch':
      return { ...state, tauschId: action.id, myTaskId: null }
    case 'closeTausch':
      return { ...state, tauschId: null }
    case 'openS89':
      return { ...state, s89: action.payload }
    case 'closeS89':
      return { ...state, s89: null }
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
      // „Später": Das Blatt lässt sich weglegen, auch wenn noch etwas zu
      // bestätigen ist. Beim nächsten Öffnen der App liegt es wieder da (`login`).
      return { ...state, confirmOpen: false }
    case 'showToast':
      return { ...state, toast: nextToast(state, action.text) }
    case 'hideToast':
      return { ...state, toast: null }
  }
}
