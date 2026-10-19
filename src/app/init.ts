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
  return leererZustand({ theme: getInitialTheme(), fontScale: getInitialFontScale(), lang: getInitialLang() })
}

/** Was das Gerät sich merkt: Darstellung, Schriftgröße, Sprache. Es überdauert ein Abmelden. */
export type Vorlieben = Pick<AppState, 'theme' | 'fontScale' | 'lang'>

/**
 * **Der Zustand ohne Daten** — der Start der App und seit dem 16.10.2026 auch
 * das Abmelden (`logout`): Von der Sitzung davor bleibt nur, was dem Gerät
 * gehört (`Vorlieben`).
 */
export function leererZustand({ theme, fontScale, lang }: Vorlieben): AppState {
  return {
    screen: 'login',
    week: 0,
    tab: 'mid',
    fsBereich: 'treffpunkte',
    theme,
    fontScale,
    // Nach dem Abmelden steht fest: niemand. Beim Start mit Datenbank setzt der
    // Provider den Merker, denn erst er fragt nach (`store.tsx`).
    sitzungPruefen: false,
    planner: false,
    zuteiler: false,
    ansicht: null,
    congregation: { name: '', hall: '', times: STANDARD_ZEITEN },
    congregationId: null,
    userId: null,
    personId: null,
    dataStatus: 'ready',
    dataEmpty: false,
    staleAt: null,
    staleLangsam: false,
    members: [],
    anmeldeLinks: [],
    weeks: [],
    persons: [],
    services: [],
    groups: [],
    fsRules: [],
    fsWeeks: [],
    gruppenbesuche: [],
    vortraege: [],
    trolleys: [],
    trolleyTermine: [],
    plaene: [],
    planEintraege: [],
    absences: [],
    absagen: [],
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
    lang,
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
