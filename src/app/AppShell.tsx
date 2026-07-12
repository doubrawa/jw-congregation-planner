import { CURRENT_PERSON_ID } from '../data/demo'
import { initials } from '../data/helpers'
import { useT } from '../i18n/useT'
import { performLogout } from '../lib/supabase'
import type { Screen } from '../data/types'
import { AufgabenScreen } from '../aufgaben/AufgabenScreen'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LanguageSheet } from '../components/LanguageSheet'
import { S89Sheet } from '../components/S89Sheet'
import { EinstellungenScreen } from '../einstellungen/EinstellungenScreen'
import { LoginScreen } from '../login/LoginScreen'
import { PersonenScreen } from '../personen/PersonenScreen'
import { AssignSheet } from '../planen/AssignSheet'
import { PlanenScreen } from '../planen/PlanenScreen'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import { useApp } from './context'
import { NotificationsPanel } from './NotificationsPanel'
import '../components/components.css'
import './shell.css'

/**
 * App-Gerüst: Schreibtisch-Hintergrund, App-Spalte (mobil ≤ 430 px zentriert,
 * Desktop ≥ 920 px mit Sidebar 232 px + Inhalt ≤ 660 px), Navigation,
 * Mitteilungen-Overlay und Toast. Login rendert ohne App-Chrome.
 */

const PLANNER_SCREENS: readonly Screen[] = [
  'programm',
  'aufgaben',
  'planen',
  'personen',
  'einstellungen',
]
const PUBLISHER_SCREENS: readonly Screen[] = ['programm', 'aufgaben']

export function AppShell() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const isLogin = state.screen === 'login'
  const me = state.persons.find((p) => p.id === CURRENT_PERSON_ID)
  const navigate = (screen: Screen) => dispatch({ type: 'navigate', screen })

  const navScreens = state.planner ? PLANNER_SCREENS : PUBLISHER_SCREENS
  const navLabel = (screen: Screen): string => {
    switch (screen) {
      case 'programm':
        return t.navProgramm
      case 'aufgaben':
        return state.planner ? t.navAufgaben : t.navAufgabenLong
      case 'planen':
        return t.navPlanen
      case 'personen':
        return t.navPersonen
      case 'einstellungen':
        return t.navEinstellungen
      default:
        return ''
    }
  }
  const navItems = navScreens.map((screen) => [screen, navLabel(screen)] as const)
  const roleLabel = state.planner ? t.rolleKoordinator : t.rolleVerkuendiger

  return (
    <div className="desk">
      {!isLogin && (
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-eyebrow">JW</div>
            <div className="sidebar-wordmark">
              Congregation
              <br />
              Planner
            </div>
            <div className="sidebar-sub">{t.congName}</div>
          </div>
          <nav className="sidebar-nav" aria-label="Hauptnavigation">
            {navItems.map(([screen, label]) => (
              <button
                key={screen}
                type="button"
                className={
                  state.screen === screen ? 'sidebar-nav-item is-active' : 'sidebar-nav-item'
                }
                aria-current={state.screen === screen ? 'page' : undefined}
                onClick={() => navigate(screen)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <div className="sidebar-profile">
            <div className="avatar avatar--ink avatar--32">{me ? initials(me) : '–'}</div>
            <div>
              <div className="sidebar-profile-name">{me ? `${me.fn} ${me.ln}` : ''}</div>
              <div className="sidebar-profile-role">{roleLabel}</div>
            </div>
          </div>
          <button type="button" className="sidebar-logout" onClick={() => performLogout(dispatch)}>
            {t.abmelden}
          </button>
        </aside>
      )}

      <main className={isLogin ? 'app-main is-login' : 'app-main'}>
        {isLogin ? (
          <LoginScreen />
        ) : (
          <>
            <header className="mobile-header">
              <div className="mobile-header-brand">JW CONGREGATION PLANNER</div>
              <div className="mobile-header-right">
                <NotifChip />
                <button
                  type="button"
                  className="avatar avatar--ink avatar--28"
                  aria-label="Meine Aufgaben"
                  onClick={() => navigate('aufgaben')}
                >
                  {me ? initials(me) : '–'}
                </button>
              </div>
            </header>

            <div className="desktop-topbar">
              <NotifChip />
            </div>

            <div className="app-content">
              <ActiveScreen screen={state.screen} />
            </div>

            <nav className="bottom-nav" aria-label="Hauptnavigation">
              {navItems.map(([screen, label]) => (
                <button
                  key={screen}
                  type="button"
                  className={
                    state.screen === screen ? 'bottom-nav-item is-active' : 'bottom-nav-item'
                  }
                  aria-current={state.screen === screen ? 'page' : undefined}
                  onClick={() => navigate(screen)}
                >
                  <span className="bottom-nav-dot" />
                  <span className="bottom-nav-label">{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}

        {state.notifOpen && <NotificationsPanel />}
        {state.slotSel && <AssignSheet sel={state.slotSel} />}
        {state.langSheetOpen && <LanguageSheet />}
        {state.s89 && <S89Sheet payload={state.s89} />}
        {state.confirmOpen && state.myTasks.some((t) => t.status === 'offen') && <ConfirmDialog />}
        {state.toast && (
          <div key={state.toast.id} className="toast" role="status">
            {state.toast.text}
          </div>
        )}
      </main>
    </div>
  )
}

/** Kopf-Chip Mitteilungen: „N neu“ (getönt) bzw. „Mitteilungen“ (Outline). */
function NotifChip() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const unread = state.notifs.filter((n) => !n.read).length
  return (
    <button
      type="button"
      className={unread > 0 ? 'notif-chip has-unread' : 'notif-chip'}
      onClick={() => dispatch({ type: 'openNotifs' })}
    >
      {unread > 0 ? `${unread} ${t.neuSuffix}` : t.mitteilungen}
    </button>
  )
}

function ActiveScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'programm':
      return <ProgrammScreen />
    case 'aufgaben':
      return <AufgabenScreen />
    case 'planen':
      return <PlanenScreen />
    case 'personen':
      return <PersonenScreen />
    case 'einstellungen':
      return <EinstellungenScreen />
    case 'login':
      return null // Login rendert außerhalb von ActiveScreen
  }
}
