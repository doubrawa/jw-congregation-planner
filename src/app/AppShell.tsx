import { CURRENT_PERSON_ID } from '../data/demo'
import { initials } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { seedCongregation } from '../lib/data'
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
import { loadAndHydrate } from './hydrate'
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
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
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
  const roleLabel =
    (state.planner ? t.rolleKoordinator : t.rolleVerkuendiger) +
    (state.dataStatus === 'demo' ? t.demoSuffix : '')

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
            <div className="sidebar-sub">{fill(t.congLabel, { name: state.congregation.name })}</div>
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
              <Content />
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

/**
 * Inhalt der App-Spalte: bei aktivem Supabase erst der Ladezustand / Sonder-
 * fälle (kein Mitglied, leere Versammlung, Fehler), sonst der aktive Screen.
 */
function Content() {
  const { state } = useApp()

  if (state.dataStatus === 'loading') return <StatusView kind="loading" />
  if (state.dataStatus === 'no-membership') return <StatusView kind="no-membership" />
  if (state.dataStatus === 'error') return <StatusView kind="error" />
  if (state.dataEmpty) return <StatusView kind="empty" />

  return <ActiveScreen screen={state.screen} />
}

/** Ladezustand und Sonderfälle der Datenanbindung. */
function StatusView({ kind }: { kind: 'loading' | 'no-membership' | 'error' | 'empty' }) {
  const { state, dispatch } = useApp()

  const seed = async () => {
    if (!state.congregationId || !state.userId) return
    dispatch({ type: 'setDataStatus', status: 'loading' })
    const err = await seedCongregation(state.congregationId)
    if (err) {
      dispatch({ type: 'showToast', text: err })
      dispatch({ type: 'setDataStatus', status: 'ready' })
      return
    }
    await loadAndHydrate(dispatch, state.userId)
  }

  const retry = () => {
    if (state.userId) void loadAndHydrate(dispatch, state.userId)
  }

  return (
    <section className="screen status-view">
      {kind === 'loading' && <p className="status-loading">Lädt …</p>}

      {kind === 'no-membership' && (
        <>
          <h1 className="status-title">Noch keiner Versammlung zugeordnet</h1>
          <p className="status-text">
            Dein Konto ist angemeldet, aber noch keiner Versammlung zugewiesen. Ein Koordinator muss
            dich in Supabase mit einer Versammlung verknüpfen (Tabelle <code>members</code>).
          </p>
        </>
      )}

      {kind === 'error' && (
        <>
          <h1 className="status-title">Daten konnten nicht geladen werden</h1>
          <p className="status-text">Es gab ein Problem beim Laden aus der Datenbank.</p>
          <button type="button" className="btn-primary status-btn" onClick={retry}>
            ERNEUT VERSUCHEN
          </button>
        </>
      )}

      {kind === 'empty' && (
        <>
          <h1 className="status-title">Versammlung ist noch leer</h1>
          {state.planner ? (
            <>
              <p className="status-text">
                Es sind noch keine Personen und Wochen hinterlegt. Du kannst den Demo-Datensatz als
                Startpunkt laden und danach anpassen.
              </p>
              <button type="button" className="btn-primary status-btn" onClick={seed}>
                DEMO-DATEN LADEN
              </button>
            </>
          ) : (
            <p className="status-text">
              Es sind noch keine Daten hinterlegt. Bitte wende dich an einen Koordinator.
            </p>
          )}
        </>
      )}
    </section>
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
