import { useEffect, useState, type ReactNode } from 'react'
import { Zeichen, type ZeichenName } from '../bausteine/Zeichen'
import { datumsFormat } from '../components/datum-anzeige'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, useMedia } from '../components/useMedia'
import { displayName, initials } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { darfPlanen, erlaubteScreens, geplantesThema, rechteVon, themaVon } from '../data/rechte'
import { weiterePlaeneImMenue } from '../data/weitere-plaene'
import { vorzulegen } from './reducer'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import type { Screen, Thema } from '../data/types'
import { AbsageBlatt } from '../aufgaben/AbsageBlatt'
import { AufgabeBlatt } from '../aufgaben/AufgabeBlatt'
import { AufgabenScreen } from '../aufgaben/AufgabenScreen'
import { OeffnenBlatt } from '../aufgaben/OeffnenBlatt'
import { AbmeldenKnopf } from '../components/AbmeldenKnopf'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LanguageSheet } from '../components/LanguageSheet'
import { HilfsdienstBlatt } from '../einstellungen/HilfsdienstBlatt'
import { S89Sheet } from '../components/S89Sheet'
import { EinstellungenScreen } from '../einstellungen/EinstellungenScreen'
import { LoginScreen } from '../login/LoginScreen'
import { DashboardScreen } from '../dashboard/DashboardScreen'
import { AlleGelesen } from '../mitteilungen/AlleGelesen'
import { MitteilungenScreen } from '../mitteilungen/MitteilungenScreen'
import { PersonenScreen } from '../personen/PersonenScreen'
import { AssignSheet } from '../planen/AssignSheet'
import { PlanenScreen } from '../planen/PlanenScreen'
import { zuteilenInSpalte } from '../planen/planen-raster'
import { ProfilScreen } from '../profil/ProfilScreen'
import { ProgrammScreen } from '../programm/ProgrammScreen'
import { useApp } from './context'
import { eigenePerson, rolleUndGruppe } from './eigene-person'
import { parseGoAbschnitt, parseGoTarget, type Abschnitt } from './deeplink'
import { loadAndHydrate } from './hydrate'
import { sichtbareMitteilungen } from './mitteilungen'
import { useKalendertag } from './useKalendertag'
import { bereichsTitel, zumAnsehen, zumPlanen } from './bereich'
import { Kopfzeile, PlanenKopf, UnterseiteKopf } from './Kopfzeile'
import { SchmaleLeiste, Schublade, Seitenmenue, type MenueAbschnitt, type MenueEintrag, type ProfilFuss } from './Menue'
import { welcomeDecision } from './welcome'
import '../components/components.css'
import './shell.css'
import './rtl.css'

/**
 * App-Gerüst im neuen Design (T121): das Menü an der Seite — am Handy als
 * Schublade, am Tablet hochkant als schmale Leiste, ab 1180 px fest links —,
 * die Kopfzeile (am Handy beim Planen der Kopf des Planens, auf den
 * Mitteilungen der Kopf mit Zurück), der Inhalt, die Blätter und der Toast.
 * Login rendert ohne App-Chrome.
 */

/** Ziel eines Push-Klicks: der Screen und, wenn der Link einen nennt, ein Bereich darin. */
type Sprung = { screen: Screen; abschnitt: Abschnitt | null }

function sprungAus(input: string): Sprung | null {
  const screen = parseGoTarget(input)
  return screen ? { screen, abschnitt: parseGoAbschnitt(input) } : null
}

export function AppShell() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const desktop = useMedia(DESKTOP_BREITE)
  const isLogin = state.screen === 'login'
  const me = eigenePerson(state)
  // Der Kalendertag: Ob „Weitere Pläne" im Menü steht, hängt daran, ob ein Plan
  // noch läuft.
  const tag = useKalendertag()
  // Das Menü als Schublade (Handy, Tablet hochkant) — am Desktop steht es fest.
  const [menuOpen, setMenuOpen] = useState(false)
  // Deep-Link aus einem Push-Klick (#go=<screen>): beim Start aus dem Hash, bei
  // schon offenem Fenster per Service-Worker-Nachricht. Angewandt erst nach Login.
  const [pendingNav, setPendingNav] = useState<Sprung | null>(() => sprungAus(location.hash))
  /*
   * **Zurück am Handy** (4.10.2026): Jeder Bildschirm außer Start ist eine
   * Ebene über Start. Zurück führt von dort zu Start, von Start aus verlässt es
   * die App — so halten es Android-Apps mit Seitenmenü. Reiter, Wochen und der
   * Schalter Ansehen/Planen sind keine Schritte: Die Ebene hängt nur daran, ob
   * man auf Start steht. Darüber liegen Unteransichten und Blätter.
   */
  useBackDismiss(
    !isLogin && state.screen !== 'start',
    () => dispatch({ type: 'navigate', screen: 'start' }),
    'bildschirm',
  )
  const navigate = (screen: Screen) => {
    setMenuOpen(false)
    dispatch({ type: 'navigate', screen })
  }

  const rechte = rechteVon(state)
  const navScreens = erlaubteScreens(rechte)

  // Deep-Link-Hash beim Start entfernen (nur wenn es einer ist), damit ein
  // Reload nicht erneut springt — Debug-Hashes (#s=…) bleiben unberührt.
  useEffect(() => {
    // Den Zustand des Eintrags behalten: Er kann die Marke einer offenen Ebene
    // tragen (`useBackDismiss`), und ohne sie räumte deren Schließen nichts ab.
    if (parseGoTarget(location.hash)) history.replaceState(history.state, '', location.pathname + location.search)
  }, [])

  // Push-Klick auf ein bereits offenes Fenster → sw.js stellt das Ziel auf zwei
  // Wegen zu (siehe notificationclick): (a) per postMessage, (b) per
  // client.navigate, das nur den #go=-Hash setzt und hier als hashchange ankommt.
  useEffect(() => {
    const applyFrom = (input: string) => {
      const target = sprungAus(input)
      if (target) {
        setPendingNav(target)
        // #go= wieder aus der URL nehmen, damit ein Reload nicht erneut springt
        // — den Zustand des Eintrags dabei behalten (siehe oben).
        history.replaceState(history.state, '', location.pathname + location.search)
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
  // „Einspringen"-Bereich die neue Anfrage sofort zeigt. Nennt der Link einen
  // Bereich, springt der Screen dorthin, sobald er steht (T109).
  useEffect(() => {
    if (isLogin || !pendingNav) return
    const target = navScreens.includes(pendingNav.screen) ? pendingNav.screen : 'aufgaben'
    const abschnitt = target === pendingNav.screen ? pendingNav.abschnitt : null
    dispatch({ type: 'navigate', screen: target, ...(abschnitt ? { abschnitt } : {}) })
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
  /*
   * **Das Menü** (T121, entschieden am 11.10.2026): Eigenes oben, dann die
   * Versammlung mit ihren Bereichen — die öffnen immer zum Ansehen —, zuletzt
   * „Planen und verwalten" mit der Planung und, nur für Admins, Personen und
   * Einstellungen. Planen ist ein eigener Modus: über „Planen" am Titel eines
   * Bereichs oder über „Planung" hier.
   */
  const ansehenThema = state.screen === 'programm' ? themaVon(state.tab) : null
  const zuThema = (thema: Thema) => {
    setMenuOpen(false)
    dispatch(zumAnsehen(thema))
  }
  const eintrag = (screen: Screen, label: string, zeichen: ZeichenName): MenueEintrag => ({
    key: screen,
    label,
    zeichen,
    aktiv: state.screen === screen,
    onClick: () => navigate(screen),
  })
  const themaEintrag = (thema: Thema, zeichen: ZeichenName): MenueEintrag => ({
    key: thema,
    label: bereichsTitel(t, thema),
    zeichen,
    aktiv: ansehenThema === thema,
    onClick: () => zuThema(thema),
  })
  // Geplant wird zuerst, was man planen darf: der Gruppenaufseher allein die
  // Treffpunkte seiner Gruppe.
  const planungsThema: Thema = darfPlanen(rechte, 'zusammenkuenfte') ? 'zusammenkuenfte' : 'predigtdienst'
  const planung: MenueEintrag[] = darfPlanen(rechte, planungsThema)
    ? [
        {
          key: 'planung',
          label: t.dashPlanung,
          zeichen: 'planung',
          aktiv: state.screen === 'planen',
          onClick: () => {
            setMenuOpen(false)
            dispatch(zumPlanen(planungsThema))
          },
        },
      ]
    : []
  const verwaltung = (['personen', 'einstellungen'] as const)
    .filter((s) => navScreens.includes(s))
    .map((s) => (s === 'personen' ? eintrag(s, t.navPersonen, 'personen') : eintrag(s, t.navEinstellungen, 'einstellungen')))
  const weiterePlaeneSichtbar = weiterePlaeneImMenue({
    plaene: state.plaene,
    zuteilen: rechte.zuteilen,
    heute: fromIso(tag),
  })
  const aufgaben: MenueEintrag = {
    ...eintrag('aufgaben', t.navAufgabenLong, 'aufgaben'),
    kurz: t.navAufgaben,
    zahl: state.myTasks.filter((a) => a.status === 'offen').length,
  }
  const ungelesen = sichtbareMitteilungen(state.notifs, rechte.zuteilen).filter((n) => !n.read).length
  const abschnitte = (mitteilungen: MenueEintrag[]): MenueAbschnitt[] => [
    { key: 'eigenes', titel: null, eintraege: [eintrag('start', t.navStart, 'start'), aufgaben, ...mitteilungen] },
    {
      key: 'versammlung',
      titel: t.versammlungLbl,
      eintraege: [
        themaEintrag('zusammenkuenfte', 'zusammenkuenfte'),
        themaEintrag('predigtdienst', 'predigtdienst'),
        // Weitere Pläne (T120, Phase 5): für Admin und Planer immer, sonst
        // erst, wenn es etwas anzusehen gibt — ein leerer Bereich wäre nur eine
        // Sackgasse.
        ...(weiterePlaeneSichtbar ? [themaEintrag('weitere', 'plaene')] : []),
      ],
    },
    ...(planung.length + verwaltung.length > 0
      ? [{ key: 'planen-verwalten', titel: t.navPlanenVerwalten, eintraege: [...planung, ...verwaltung] }]
      : []),
  ]
  // Am Desktop gibt es keine Kopfzeile mit Glocke: Die Mitteilungen stehen in
  // der Leiste (entschieden am 12.10.2026). Am Handy und am Tablet führt die
  // Glocke dorthin.
  const glockeEintrag: MenueEintrag = { ...eintrag('mitteilungen', t.mitteilungen, 'glocke'), zahl: ungelesen }
  const versammlung = state.congregation.name.trim()
  const profil: ProfilFuss = {
    kuerzel: me ? initials(me) : '–',
    name: me ? displayName(me) : '',
    unterzeile: [t.navProfil, ...rolleUndGruppe(state, i18n)].join(' · '),
    aktiv: state.screen === 'profil',
    onClick: () => navigate('profil'),
  }
  const planen = state.screen === 'planen'
  const unterseite = state.screen === 'mitteilungen'
  const geplant = geplantesThema(rechte, state.tab)
  const menue = abschnitte([])
  // Texte für die Error Boundaries: die Klasse kann useT() nicht aufrufen.
  const fehlerTexte = { titel: t.errTitel, text: t.errText, aktion: t.offlineRetry }
  const meineAufgabe = state.myTasks.find((task) => task.id === state.myTaskId)
  const abzusagen = state.myTasks.find((task) => task.id === state.absageId)
  // Am Desktop teilt die Spalte neben dem Plan zu — dafür kein Blatt darüber.
  const zuteilenBlatt = state.slotSel && !zuteilenInSpalte(state, desktop) ? state.slotSel : null
  /** Ein Blatt in seiner eigenen Fehlergrenze (siehe unten). */
  const blatt = (inhalt: ReactNode) => <ErrorBoundary {...fehlerTexte}>{inhalt}</ErrorBoundary>

  return (
    <div className="rahmen">
      {!isLogin && (
        <>
          <aside className="leiste">
            <Seitenmenue abschnitte={abschnitte([glockeEintrag])} versammlung={versammlung} profil={profil} />
          </aside>
          <SchmaleLeiste
            abschnitte={menue}
            profil={profil}
            menueOffen={menuOpen}
            onMenue={() => setMenuOpen(true)}
          />
        </>
      )}

      <main className="app-main">
        {isLogin ? (
          <LoginScreen />
        ) : (
          <>
            {planen && (
              <PlanenKopf titel={bereichsTitel(t, geplant)} onBeenden={() => dispatch(zumAnsehen(geplant))} />
            )}
            {unterseite && (
              <UnterseiteKopf onZurueck={() => navigate('start')}>
                {ungelesen > 0 && <AlleGelesen className="unterseitenkopf-aktion" />}
              </UnterseiteKopf>
            )}
            {/* Die Versammlung im Kopf, nicht die Wortmarke (T107); solange
                keine geladen ist (Laden, Konto ohne Versammlung), steht der
                Produktname da, damit der Kopf nicht leer bleibt. */}
            <Kopfzeile
              datum={datumsFormat(state.lang, 'tag').format(fromIso(tag))}
              versammlung={versammlung ? fill(t.congLabel, { name: versammlung }) : 'Versammlung.app'}
              ungelesen={ungelesen}
              menueOffen={menuOpen}
              amHandyErsetzt={planen || unterseite}
              onMenue={() => setMenuOpen(true)}
              onGlocke={() => navigate('mitteilungen')}
            />

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
              <Schublade abschnitte={menue} versammlung={versammlung} profil={profil} onSchliessen={() => setMenuOpen(false)} />
            )}
          </>
        )}

        {/*
          Jedes Blatt in seiner **eigenen** Fehlergrenze: Ein Fehler darin lässt
          die App darunter stehen, und das nächste Öffnen beginnt frisch — die
          Grenze geht mit dem Blatt.

          Bis zum 12.10.2026 stand eine gemeinsame Grenze um alle Blätter, mit
          dem obersten als `key`. Lagen zwei übereinander (S-89 über dem
          Zuteilen, Absagen über dem Blatt beim Öffnen), hängte jeder Wechsel
          des obersten auch das untere neu ein: Es verlor seinen
          Verlaufseintrag, und schloss das obere per Escape, bekam das untere
          mitten in derselben Taste einen frischen `CloseWatcher` — der die
          Taste ein zweites Mal verarbeitete und es gleich mit schloss.
        */}
        {zuteilenBlatt && blatt(<AssignSheet sel={zuteilenBlatt} />)}
        {state.langSheetOpen && blatt(<LanguageSheet />)}
        {state.svcSheet && blatt(<HilfsdienstBlatt svcKey={state.svcSheet} />)}
        {state.s89 && blatt(<S89Sheet payload={state.s89} />)}
        {meineAufgabe && blatt(<AufgabeBlatt task={meineAufgabe} />)}
        {state.confirmOpen && vorzulegen(state.myTasks, state.substituteReqs) && blatt(<OeffnenBlatt />)}
        {/* Nach dem Blatt beim Öffnen: „Ich kann nicht" darin legt sich darüber. */}
        {abzusagen && blatt(<AbsageBlatt key={abzusagen.id} task={abzusagen} />)}
        {state.toast && (
          <div key={state.toast.id} className="toast" role="status">
            {state.toast.text}
          </div>
        )}
      </main>
    </div>
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
    // Über LOCALES — dieselbe Tabelle wie Countdown, Wochentagsnamen und das
    // Datum im Kopf des Start-Bildschirms. Hier stand als einzige Stelle der
    // App der nackte Sprachcode.
    //
    // **Kein gemessener Unterschied**, und das ist der ehrliche Stand: Intl
    // löst die Abweichler von selbst auf (`tl` → `fil`, `no` → `nb`), und für
    // dieses rein numerische Format kam derselbe Text heraus — nachgemessen am
    // 25.8.2026 über alle 34 Sprachen. Die Zeile bleibt trotzdem, weil sie eine
    // zweite Quelle für dieselbe Zuordnung beseitigt: `LOCALES` trägt die
    // bewussten Entscheidungen (`sr-Latn-RS` statt kyrillisch, `zh-CN`,
    // `fil-PH`), und die gelten dann auch hier, sobald jemand das Format
    // ausschreibt oder eine Sprache dazukommt, die Intl nicht selbst auflöst.
    stamp = when.toLocaleString(LOCALES[state.lang] ?? state.lang, opts)
  } catch {
    stamp = when.toLocaleString(undefined, opts) // unbekanntes Sprach-Tag
  }

  return (
    <div className="offline-banner" role="status">
      <Zeichen name="wolke" />
      <div className="offline-banner-text">
        <strong>{fill(t.offlineBanner, { m: stamp })}</strong>
        <div className="offline-banner-hint">{t.offlineBannerHint}</div>
      </div>
      <button type="button" className="knopf-pille" onClick={() => location.reload()}>
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
  // Die leere Versammlung ist für den Verkündiger eine Sackgasse, für den
  // Planer der Anfang: Er füllt sie über Personen und „Nächste Woche
  // importieren" — und der Hinweis „wende dich an einen Koordinator" meinte ihn.
  if (state.dataEmpty && !state.planner) return <StatusView kind="empty" />

  return <ActiveScreen screen={state.screen} />
}

/** Ladezustand und Sonderfälle der Datenanbindung. */
function StatusView({ kind }: { kind: 'loading' | 'no-membership' | 'error' | 'empty' }) {
  const { state, dispatch } = useApp()
  const { t } = useT()

  const retry = () => {
    if (state.userId) void loadAndHydrate(dispatch, state.userId)
  }

  return (
    <section className="screen status-view">
      {kind === 'loading' && <p className="status-loading">{t.laedt}</p>}

      {/* Ein Konto ohne Versammlung: Der Admin hat es entfernt. Hinein kommt
          es nur über einen neuen Link — einen Code einlösen gibt es seit dem
          Anmelden per Link (T121, Phase 8) nicht mehr. */}
      {kind === 'no-membership' && (
        <>
          <h1 className="status-title">{t.stKeineVers}</h1>
          <p className="status-text">{t.stKeineVersText}</p>
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

      {/*
        Abmelden, wo das Profil nicht erreichbar ist: Statt jedes Bildschirms
        steht hier diese Seite. Bis zum 4.10.2026 war „Abmelden" im Menü der
        Weg hinaus — wer mit dem falschen Konto angemeldet war oder vor einer
        leeren Versammlung stand, säße ohne ihn fest.
      */}
      {kind !== 'loading' && <AbmeldenKnopf className="btn-outline status-btn" />}
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
    case 'mitteilungen':
      return <MitteilungenScreen />
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
