/**
 * Startzustand der App: leer bis zur Hydration nach dem Login, dazu die
 * localStorage-Wiederherstellung (Theme, Schriftgröße, Sprache).
 *
 * **Keine Testdaten, in keinem Build.** Bis zum 2.10.2026 startete hier im
 * Dev-Build der Demo-Modus mit den erfundenen Daten aus `testdaten.ts`, samt
 * Debug-Hash für die Handbuch-Aufnahmen. Hinter `import.meta.env.DEV` sollten
 * die Daten beim Bauen wegfallen — die Personenliste rechnete aber schon beim
 * Laden ihres Moduls und stand deshalb im ausgelieferten Bündel. Beides lebt
 * jetzt auf der Entwicklerseite (`tests/testdaten/demo-start.ts`, im
 * Dev-Server unter `/demo.html`), die die App mit eigenem Startzustand
 * aufruft (`<App start={…} />`).
 */
import { STANDARD_ERINNERUNGEN, STANDARD_ZEITEN } from '../data/vorgaben'
import { asFontScale, asTheme, DEFAULT_FONT_SCALE, DEFAULT_THEME, type FontScale } from '../data/constants'
import { APP_LANGS } from '../i18n/langs'
import type { Lang, Theme } from '../data/types'
import type { AppState } from './context'

function getInitialTheme(): Theme {
  // Standard ist „Automatisch" (folgt dem Gerät, T121). Hell oder Dunkel wählt
  // man im Profil; die Wahl wird auf dem Gerät gespeichert.
  return asTheme(localStorage.getItem('theme')) ?? DEFAULT_THEME
}
function getInitialFontScale(): FontScale {
  return asFontScale(localStorage.getItem('fontScale')) ?? DEFAULT_FONT_SCALE
}
function getInitialLang(): Lang {
  const stored = localStorage.getItem('lang')
  return APP_LANGS.some((l) => l.code === stored) ? (stored as Lang) : 'de'
}

export function initialState(): AppState {
  return {
    screen: 'login',
    week: 0,
    tab: 'mid',
    fsBereich: 'treffpunkte',
    theme: getInitialTheme(),
    fontScale: getInitialFontScale(),
    planner: false,
    zuteiler: false,
    congregation: { name: '', hall: '', times: STANDARD_ZEITEN },
    congregationId: null,
    userId: null,
    personId: null,
    dataStatus: 'ready',
    dataEmpty: false,
    staleAt: null,
    members: [],
    invites: [],
    recovery: false,
    weeks: [],
    persons: [],
    services: [],
    groups: [],
    fsRules: [],
    fsWeeks: [],
    gruppenbesuche: [],
    vortraege: [],
    ozTermine: [],
    ozEintraege: [],
    plaene: [],
    planEintraege: [],
    absences: [],
    notifs: [],
    slotSel: null,
    selectedPersonId: null,
    importing: false,
    myTasks: [],
    confirmations: {},
    sentLog: {},
    persoenlich: {},
    confirmOpen: false,
    myTaskId: null,
    absageId: null,
    substituteReqs: [],
    offenePlaetze: [],
    s89: null,
    reminders: STANDARD_ERINNERUNGEN,
    lang: getInitialLang(),
    langSheetOpen: false,
    langSheetFor: 'cong',
    svcSheet: null,
    terminGewaehlt: false,
    sprungZiel: null,
    auxClass: false,
    congLang: 'de',
    progLangs: [],
    langSearch: '',
    toast: null,
    welcomePending: false,
  }
}
