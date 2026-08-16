import { useEffect, useRef, useState } from 'react'
import { useBackDismiss } from '../components/useBackDismiss'
import { useDialogFocus } from '../components/useDialogFocus'
import { initials, overseerGroup } from '../data/helpers'
import { vorzulegen } from './reducer'
import { fill, useT } from '../i18n/useT'
import { redeemInvite } from '../lib/data'
import { performLogout } from '../lib/supabase'
import type { Screen } from '../data/types'
import { AufgabenScreen } from '../aufgaben/AufgabenScreen'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { MyTaskSheet } from '../components/MyTaskSheet'
import { LanguageSheet } from '../components/LanguageSheet'
import { ServicePersonsSheet } from '../einstellungen/ServicePersonsSheet'
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
import { parseGoTarget } from './deeplink'
import { loadAndHydrate } from './hydrate'
import { NotificationsPanel } from './NotificationsPanel'
import { SidebarBrand, SidebarFooter, SidebarNav, type NavItem } from './Sidebar'
import { welcomeDecision } from './welcome'
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
const LOGO = `${import.meta.env.BASE_URL}logo.svg`

export function AppShell() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Recovery (Passwort-Reset-Link) nutzt das Login-Layout ohne App-Chrome
  const isLogin = state.screen === 'login' || state.recovery
  const me = state.persons.find((p) => p.id === state.personId)
  // Mobiles Seitenmenü (Drawer) — Desktop hat die feste Sidebar
  const [menuOpen, setMenuOpen] = useState(false)
  // Deep-Link aus einem Push-Klick (#go=<screen>): beim Start aus dem Hash, bei
  // schon offenem Fenster per Service-Worker-Nachricht. Angewandt erst nach Login.
  const [pendingNav, setPendingNav] = useState<Screen | null>(() => parseGoTarget(location.hash))
  const drawerRef = useRef<HTMLElement>(null)
  useDialogFocus(drawerRef, menuOpen)
  useBackDismiss(menuOpen, () => setMenuOpen(false))
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
    !state.planner && overseerGroup(state.groups, state.personId) !== null
  const navScreens = state.planner
    ? PLANNER_SCREENS
    : fsOverseer
      ? GROUP_OV_SCREENS
      : PUBLISHER_SCREENS

  // Deep-Link-Hash beim Start entfernen (nur wenn es einer ist), damit ein
  // Reload nicht erneut springt — Debug-Hashes (#s=…) bleiben unberührt.
  useEffect(() => {
    if (parseGoTarget(location.hash)) history.replaceState(null, '', location.pathname + location.search)
  }, [])

  // Push-Klick auf ein bereits offenes Fenster → sw.js stellt das Ziel auf zwei
  // Wegen zu (siehe notificationclick): (a) per postMessage, (b) per
  // client.navigate, das nur den #go=-Hash setzt und hier als hashchange ankommt.
  useEffect(() => {
    const applyFrom = (input: string) => {
      const target = parseGoTarget(input)
      if (target) {
        setPendingNav(target)
        // #go= wieder aus der URL nehmen, damit ein Reload nicht erneut springt.
        history.replaceState(null, '', location.pathname + location.search)
      }
    }
    const onHash = () => applyFrom(location.hash)
    window.addEventListener('hashchange', onHash)

    const sw = navigator.serviceWorker
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === 'navigate') {
        applyFrom(String((e.data as { url?: string }).url ?? ''))
      }
    }
    sw?.addEventListener('message', onMsg)
    // Der Nachrichtenfluss von navigator.serviceWorker ist deaktiviert, solange
    // weder onmessage gesetzt noch startMessages() aufgerufen wurde. Ohne das
    // erreicht uns die postMessage aus sw.js (Push-Klick) nie.
    sw?.startMessages?.()
    return () => {
      window.removeEventListener('hashchange', onHash)
      sw?.removeEventListener('message', onMsg)
    }
  }, [])

  // Ziel anwenden, sobald eingeloggt (vorher zeigt die App den Login-Screen).
  // Nicht erreichbare Ziele (z. B. „planen" für Nicht-Planer) → „aufgaben".
  // Ein Deep-Link kommt aus einem Push-Klick → serverseitig hat sich etwas
  // geändert (Absage/Ersatz), also die Daten still nachladen, damit z. B. der
  // „Einspringen"-Bereich die neue Anfrage sofort zeigt.
  useEffect(() => {
    if (isLogin || !pendingNav) return
    const target = navScreens.includes(pendingNav) ? pendingNav : 'aufgaben'
    dispatch({ type: 'navigate', screen: target })
    setPendingNav(null)
    if (state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })
  }, [isLogin, pendingNav, navScreens, dispatch, state.userId])

  // Begrüßung nach dem Anmelden — erst, wenn feststeht, wen man vor sich hat
  // (Regel und Begründung: welcome.ts).
  useEffect(() => {
    const d = welcomeDecision(state.welcomePending, state.dataStatus, me?.fn)
    if (d === 'warten') return
    dispatch({ type: 'welcomeShown' })
    if (d !== 'verwerfen') dispatch({ type: 'showToast', text: fill(t.toastWillkommen, d) })
  }, [state.welcomePending, state.dataStatus, me, t, dispatch])
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
  // Texte für die Error Boundaries: die Klasse kann useT() nicht aufrufen.
  const fehlerTexte = { titel: t.errTitel, text: t.errText, aktion: t.offlineRetry }
  const offenesOverlay =
    (state.notifOpen && 'notif') ||
    (state.slotSel && 'slot') ||
    (state.langSheetOpen && 'lang') ||
    (state.svcSheet && 'svc') ||
    (state.s89 && 's89') ||
    (state.myTaskId && 'myTask') ||
    (state.confirmOpen && 'confirm') ||
    'keins'

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
                  {/* Auf schmalen Geräten die Kurzform: der volle Name passt neben
                      „Mitteilungen“ + Avatar erst ab ca. 430 px und würde sonst
                      mitten im Wort abgeschnitten. */}
                  <span className="mobile-header-name">
                    <span className="brand-long">CONGREGATION PLANNER</span>
                    <span className="brand-short">C. PLANNER</span>
                  </span>
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

            <OfflineBanner />

            {/* `key` am Screen: nach einem Fehler hängt der nächste
                Screenwechsel eine frische Boundary ein — sonst bliebe der
                Auffangbereich bis zum Neuladen stehen. */}
            <div className="app-content">
              <ErrorBoundary key={state.screen} {...fehlerTexte}>
                <Content />
              </ErrorBoundary>
            </div>

            {menuOpen && (
              <>
                <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
                <aside className="drawer" role="dialog" aria-modal="true" aria-label={t.menueLbl} ref={drawerRef}>
                  <div className="drawer-head">
                    <SidebarBrand congSub={congSub} />
                    <button
                      type="button"
                      className="drawer-close"
                      aria-label={t.a11yClose}
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

        {/* Zweite Boundary um die Overlays: ein Fehler im Sheet darf die App
            darunter stehen lassen. `key` = das gerade offene Overlay, damit
            das nächste wieder frisch startet. */}
        <ErrorBoundary key={offenesOverlay} {...fehlerTexte}>
          {state.notifOpen && <NotificationsPanel />}
          {state.slotSel && <AssignSheet sel={state.slotSel} />}
          {state.langSheetOpen && <LanguageSheet />}
          {state.svcSheet && <ServicePersonsSheet svcKey={state.svcSheet} />}
          {state.s89 && <S89Sheet payload={state.s89} />}
          {state.myTaskId && <MyTaskSheet />}
          {state.confirmOpen && vorzulegen(state.myTasks, state.substituteReqs) && <ConfirmDialog />}
        </ErrorBoundary>
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
 * Hinweis auf den Offline-Stand: die Daten stammen aus der Momentaufnahme
 * (lib/snapshot.ts), sind also möglicherweise veraltet und nicht änderbar.
 * „Neu laden" holt sie, sobald wieder Netz da ist.
 */
function OfflineBanner() {
  const { state } = useApp()
  const { t } = useT()
  if (state.staleAt === null) return null

  const when = new Date(state.staleAt)
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }
  let stamp: string
  try {
    stamp = when.toLocaleString(state.lang, opts)
  } catch {
    stamp = when.toLocaleString(undefined, opts) // unbekanntes Sprach-Tag
  }

  return (
    <div className="offline-banner" role="status">
      <div>
        <strong>{fill(t.offlineBanner, { m: stamp })}</strong>
        <div className="offline-banner-hint">{t.offlineBannerHint}</div>
      </div>
      <button type="button" className="offline-banner-btn" onClick={() => location.reload()}>
        {t.offlineRetry}
      </button>
    </div>
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

      {/*
        Eine Versammlung wird vom Administrator angelegt (scripts/
        versammlung-anlegen.mjs) — mit einem Planer und den Standard-Diensten,
        aber **ohne Woche**. Ist hier gar nichts da, ist das Skript nicht
        gelaufen; ein Knopf „Demo-Daten laden" stand hier bis zum 13.8.2026 und
        füllte vier erfundene Wochen ein, die der Planer erst wegräumen musste.
      */}
      {kind === 'empty' && (
        <>
          <h1 className="status-title">{t.stLeer}</h1>
          <p className="status-text">{t.stLeerText}</p>
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
