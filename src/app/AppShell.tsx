import { useEffect, useState } from 'react'
import { CURRENT_PERSON_ID } from '../data/demo'
import { initials, overseerGroup } from '../data/helpers'
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
import { DashboardScreen } from '../dashboard/DashboardScreen'
import { PersonenScreen } from '../personen/PersonenScreen'
import { AssignSheet } from '../planen/AssignSheet'
import { PlanenScreen } from '../planen/PlanenScreen'
import { ProfilScreen } from '../profil/ProfilScreen'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import { useApp } from './context'
import { loadAndHydrate } from './hydrate'
import { NotificationsPanel } from './NotificationsPanel'
import { SidebarBrand, SidebarFooter, SidebarNav, type NavItem } from './Sidebar'
import '../components/components.css'
import './shell.css'
import './rtl.css'

/**
 * App-Gerüst: Schreibtisch-Hintergrund, App-Spalte (mobil ≤ 430 px zentriert,
 * Desktop ≥ 920 px mit Sidebar 232 px + Inhalt ≤ 660 px), Navigation,
 * Mitteilungen-Overlay und Toast. Login rendert ohne App-Chrome.
 */

const PLANNER_SCREENS: readonly Screen[] = [
  'start',
  'programm',
  'aufgaben',
  'planen',
  'personen',
  'einstellungen',
  'profil',
]
const PUBLISHER_SCREENS: readonly Screen[] = ['start', 'programm', 'aufgaben', 'profil']
// Gruppenaufseher (Aufseher/Gehilfe einer Gruppe, ohne volle Planer-Rechte):
// planen + einstellungen, dort aber nur die Treffpunkte der eigenen Gruppe.
const GROUP_OV_SCREENS: readonly Screen[] = [
  'start',
  'programm',
  'aufgaben',
  'planen',
  'einstellungen',
  'profil',
]

// Logo aus public/ — via BASE_URL, damit es auch unter dem GitHub-Pages-Pfad lädt.
const LOGO = `${import.meta.env.BASE_URL}logo.png`

export function AppShell() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Recovery (Passwort-Reset-Link) nutzt das Login-Layout ohne App-Chrome
  const isLogin = state.screen === 'login' || state.recovery
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
  // Mobiles Seitenmenü (Drawer) — Desktop hat die feste Sidebar
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = (screen: Screen) => {
    setMenuOpen(false)
    dispatch({ type: 'navigate', screen })
  }

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const fsOverseer =
    !state.planner && overseerGroup(state.groups, state.personId ?? CURRENT_PERSON_ID) !== null
  const navScreens = state.planner
    ? PLANNER_SCREENS
    : fsOverseer
      ? GROUP_OV_SCREENS
      : PUBLISHER_SCREENS
  const navLabels: Record<Screen, string> = {
    login: '',
    start: t.navStart,
    programm: t.navProgramm,
    aufgaben: state.planner ? t.navAufgaben : t.navAufgabenLong,
    planen: t.navPlanen,
    personen: t.navPersonen,
    einstellungen: t.navEinstellungen,
    profil: t.navProfil,
  }
  const navItems: NavItem[] = navScreens.map((screen) => [screen, navLabels[screen]])
  const congSub = fill(t.congLabel, { name: state.congregation.name })
  const roleLabel =
    (state.planner ? t.rolleKoordinator : t.rolleVerkuendiger) +
    (state.dataStatus === 'demo' ? t.demoSuffix : '')
  const logout = () => performLogout(dispatch)

  return (
    <div className="desk">
      {!isLogin && (
        <aside className="sidebar">
          <SidebarBrand congSub={congSub} />
          <SidebarNav items={navItems} active={state.screen} onNavigate={navigate} />
          <SidebarFooter me={me} roleLabel={roleLabel} logoutLabel={t.abmelden} onLogout={logout} />
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
              <div className="mobile-header-left">
                <button
                  type="button"
                  className="menu-btn"
                  aria-label={t.menueLbl}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(true)}
                >
                  <span className="menu-btn-bar" />
                  <span className="menu-btn-bar" />
                  <span className="menu-btn-bar" />
                </button>
                <div className="mobile-header-brand">
                  <img className="mobile-header-logo" src={LOGO} alt="" width={22} height={22} />
                  CONGREGATION PLANNER
                </div>
              </div>
              <div className="mobile-header-right">
                <NotifChip />
                <button
                  type="button"
                  className="avatar avatar--ink avatar--28"
                  aria-label={t.navProfil}
                  onClick={() => navigate('profil')}
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

            {menuOpen && (
              <>
                <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
                <aside className="drawer" role="dialog" aria-modal="true" aria-label={t.menueLbl}>
                  <div className="drawer-head">
                    <SidebarBrand congSub={congSub} />
                    <button
                      type="button"
                      className="drawer-close"
                      aria-label="✕"
                      onClick={() => setMenuOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <SidebarNav items={navItems} active={state.screen} onNavigate={navigate} />
                  <SidebarFooter me={me} roleLabel={roleLabel} logoutLabel={t.abmelden} onLogout={logout} />
                </aside>
              </>
            )}
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
    case 'start':
      return <DashboardScreen />
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
    case 'profil':
      return <ProfilScreen />
    case 'login':
      return null // Login rendert außerhalb von ActiveScreen
  }
}
