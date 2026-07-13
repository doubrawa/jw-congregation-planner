import { useState } from 'react'
import { CURRENT_PERSON_ID } from '../data/demo'
import { initials } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { redeemInvite, seedCongregation } from '../lib/data'
import { performLogout } from '../lib/supabase'
import type { Screen } from '../data/types'
import { AufgabenScreen } from '../aufgaben/AufgabenScreen'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LanguageSheet } from '../components/LanguageSheet'
import { S89Sheet } from '../components/S89Sheet'
import { EinstellungenScreen } from '../einstellungen/EinstellungenScreen'
import { LoginScreen } from '../login/LoginScreen'
import { RecoveryScreen } from '../login/RecoveryScreen'
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
  // Recovery (Passwort-Reset-Link) nutzt das Login-Layout ohne App-Chrome
  const isLogin = state.screen === 'login' || state.recovery
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
          state.recovery ? (
            <RecoveryScreen />
          ) : (
            <LoginScreen />
          )
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
  const { t } = useT()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

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

  const redeem = async () => {
    const uid = state.userId
    if (!code.trim() || !uid || busy) return
    setBusy(true)
    const err = await redeemInvite(code)
    if (err) {
      setBusy(false)
      const text =
        err === 'invalid-code' ? t.invCodeInvalid : err === 'already-member' ? t.invAlreadyMember : err
      dispatch({ type: 'showToast', text })
      return
    }
    await loadAndHydrate(dispatch, uid) // ersetzt diese Ansicht durch die App
  }

  return (
    <section className="screen status-view">
      {kind === 'loading' && <p className="status-loading">{t.laedt}</p>}

      {kind === 'no-membership' && (
        <>
          <h1 className="status-title">{t.stKeineVers}</h1>
          <p className="status-text">{t.stKeineVersText}</p>
          <input
            type="text"
            className="field-input status-input"
            placeholder={t.codePh}
            aria-label={t.codePh}
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="button" className="btn-primary status-btn" onClick={redeem} disabled={busy}>
            {busy ? `${t.codeEinloesen} …` : t.codeEinloesen}
          </button>
        </>
      )}

      {kind === 'error' && (
        <>
          <h1 className="status-title">{t.stFehler}</h1>
          <p className="status-text">{t.stFehlerText}</p>
          <button type="button" className="btn-primary status-btn" onClick={retry}>
            {t.stErneut}
          </button>
        </>
      )}

      {kind === 'empty' && (
        <>
          <h1 className="status-title">{t.stLeer}</h1>
          {state.planner ? (
            <>
              <p className="status-text">{t.stLeerTextPlaner}</p>
              <button type="button" className="btn-primary status-btn" onClick={seed}>
                {t.stDemoLaden}
              </button>
            </>
          ) : (
            <p className="status-text">{t.stLeerText}</p>
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
