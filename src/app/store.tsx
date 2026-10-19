/**
 * App-Provider: verdrahtet Reducer (reducer.ts, rein), Startzustand (init.ts)
 * und Persistenz (persist.ts) und spiegelt Session, Theme und Sprache in
 * Supabase-Auth bzw. <html>-Attribute.
 */

import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { darstellungSpiegeln } from './darstellung'
import { isRTL } from '../i18n/langs'
import { bibelbuecherLaden } from '../i18n/translate'
import { dict, loadOverlay } from '../i18n/ui'
import { mitLinkAnmelden } from '../lib/anmelden'
import { setKonfliktMelder, setSchreibfehlerMelder } from '../lib/data'
import { gespeicherteSitzung } from '../lib/gespeicherte-sitzung'
import { clearSnapshot } from '../lib/snapshot'
import { supabase } from '../lib/supabase'
import { anmeldeAdresse } from '../login/anmelde-adresse'
import { anmeldeFehlerText } from '../login/anmelde-fehler'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  type AppStore,
} from './context'
import { pushAboAbgleichen } from '../lib/push-abo'
import { letztenStandZeigen, loadAndHydrate, momentaufnahmeZeigen } from './hydrate'
import { sitzungBeendet } from './sitzung'
import { useKalendertag } from './useKalendertag'
import { initialState } from './init'
import { ausstehendesSchreiben, persist } from './persist'
import { isViewAction } from './readonly'
import { reducer } from './reducer'

/**
 * Reacts Reducer ist die **Identität** — der Folgezustand kommt fertig herein.
 *
 * Er stand hier lange als `useReducer(reducer, …)`, und damit lief der Reducer
 * **zweimal** je Aktion: einmal unten in `dispatch` (für `persist`, das den
 * Vorher/Nachher-Vergleich braucht) und ein zweites Mal in React, das die
 * Aktion selbst noch einmal anwendet. Für einen reinen Reducer wäre das nur
 * doppelte Arbeit. Er ist aber nicht ganz rein: An fünf Stellen erzeugt er
 * eine **Kennung** — `crypto.randomUUID()` für Mitteilungen, Termine (T63),
 * Haushalte und die Treffpunkt-Regeln (`fsRuleAdd`), dazu den Zeitstempel
 * einer Mitteilung.
 *
 * Beim zweiten Lauf fielen diese Kennungen **anders** aus. Was in die
 * Datenbank ging, war deshalb ein anderer Stand als der, den der Bildschirm
 * zeigte — und bei den Treffpunkten kostete das die Planung:
 *
 *  1. Neue Regel anlegen → `fs_rules` bekommt Kennung A, der Client hält B.
 *  2. Leiter zuteilen → `fs_weeks` bekommt B (der Client schreibt seinen Stand).
 *  3. Neu laden → `regenFsWeeks` erzeugt aus der Regel wieder A, findet unter
 *     A keine gespeicherte Leitung und wirft die unter B liegende weg.
 *
 * Der Leiter war weg, ohne Fehler und ohne Hinweis — dieselbe Wirkung wie bei
 * T87, nur über eine andere Ursache.
 *
 * Die Kennungen in die Aktionen zu ziehen wäre die zweite Buchführung: Sie
 * müsste bei jeder künftigen Aktion mitgedacht werden, und wer sie vergisst,
 * merkt es nie. Deshalb wird der Zustand **einmal** gerechnet und als Wert
 * weitergereicht. Damit ist die Frage strukturell erledigt statt Fall für Fall.
 */
const uebernehmen = (_bisher: AppState, neu: AppState): AppState => neu

/**
 * Wie lange das Startbild höchstens steht, wenn ein Konto samt letztem Stand
 * auf dem Gerät liegt — gleich, ob der Start noch auf die Sitzung wartet oder
 * schon auf die Daten. Danach steht dieser Stand da (Offline-Start, unten).
 * Fehlt er, kommt ohne Sitzung die Fehlerseite; laden schon die Daten, bleibt
 * das Startbild, bis sie da sind oder scheitern. Die Erneuerung des Tokens
 * braucht sonst unter einer Sekunde, im schwachen Netz zwei, drei.
 */
const VORGRIFF_NACH_MS = 4000

export function AppProvider({
  children,
  start = initialState,
}: {
  children: ReactNode
  /** Woher der erste Zustand kommt — die App startet leer, die Entwicklerseite mit Testdaten. */
  start?: () => AppState
}) {
  // Mit Datenbank ist beim Start offen, ob jemand angemeldet ist — bis die
  // Prüfung unten durch ist (`sitzungPruefen`). Ohne fragt niemand nach.
  const [state, rawDispatch] = useReducer(uebernehmen, undefined, () =>
    supabase ? { ...start(), sitzungPruefen: true } : start(),
  )

  // Persistenz-Wrapper: berechnet den Folgezustand (Reducer ist rein),
  // schreibt die Änderung nach Supabase und aktualisiert dann React.
  const stateRef = useRef(state)
  stateRef.current = state

  // Abonnenten der Selektoren (T41). Der Zustand liegt ohnehin schon in
  // `stateRef` — der Speicher gibt ihn nur nach außen und sagt Bescheid, wenn
  // er sich geändert hat. Erzeugt wird das Set nur einmal; `useRef(new Set())`
  // legte bei jedem Render eines an, von denen React alle bis auf das erste
  // verwirft.
  const abonnentenRef = useRef<Set<() => void> | null>(null)
  abonnentenRef.current ??= new Set()
  const abonnenten = abonnentenRef.current

  const dispatch = useCallback((action: AppAction) => {
    const prev = stateRef.current
    // Offline-Stand (staleAt): nur lesen. Schreib-Aktionen abweisen und
    // erklären, statt sie sichtbar anzuwenden und beim nächsten Laden zu
    // verlieren — speichern kann persist() ohne Netz nicht.
    const effective: AppAction =
      prev.staleAt && !isViewAction(action.type)
        ? { type: 'showToast', text: dict(prev.lang).offlineReadOnly }
        : action
    if (effective.type === 'logout') {
      clearSnapshot()
      // Ein noch laufendes Laden spielt danach nichts mehr ein (`sitzung.ts`).
      sitzungBeendet()
    }
    const next = reducer(prev, effective)
    stateRef.current = next
    persist(prev, next, effective)
    // **Denselben** Stand an React, nicht noch einmal die Aktion (siehe
    // `uebernehmen`): Was gespeichert wurde, ist damit Zeichen für Zeichen das,
    // was der Bildschirm zeigt.
    rawDispatch(next)
    // Die Selektoren wecken. Das passiert im selben Ereignis wie `rawDispatch`,
    // React fasst beide Aktualisierungen also zu einem Commit zusammen —
    // Kontext-Leser und Selektor-Leser sehen nie verschiedene Stände.
    for (const melden of abonnenten) melden()
  }, [abonnenten])

  const store = useMemo<AppStore>(
    () => ({
      holen: () => stateRef.current,
      abonnieren: (melden) => {
        abonnenten.add(melden)
        return () => abonnenten.delete(melden)
      },
    }),
    [abonnenten],
  )

  // Fehlgeschlagene Schreibvorgänge sichtbar machen. Die Schreiber in data.ts
  // sind fire-and-forget — der Erfolgs-Toast entsteht im Reducer, bevor die
  // Datenbank überhaupt geantwortet hat. Ohne diese Meldung sieht der Nutzer
  // „Zugeteilt", während nichts gespeichert wurde.
  useEffect(() => {
    let zuletzt = 0
    setSchreibfehlerMelder(() => {
      // Ein Fehlschlag reißt meist mehrere Writes mit (Token abgelaufen, Netz
      // weg). Ein Hinweis genügt — sonst überschreiben sich die Toasts
      // gegenseitig und der letzte verdeckt, wie viel schiefging.
      const jetzt = Date.now()
      if (jetzt - zuletzt < 5000) return
      zuletzt = jetzt
      dispatch({ type: 'showToast', text: dict(stateRef.current.lang).toastSpeicherFehler })
    })
    return () => setSchreibfehlerMelder(null)
  }, [dispatch])

  // Schreibkonflikt: ein anderer Planer hat dieselbe Woche zuerst gespeichert
  // (T39). Bis hierher wurde nichts überschrieben — der geschützte Schreibvorgang
  // hat schlicht keine Zeile getroffen. Jetzt gilt es, den Bildschirm wieder mit
  // der Datenbank in Übereinstimmung zu bringen, sonst plant der Nutzer auf einer
  // Fassung weiter, die es nicht mehr gibt, und jeder weitere Schreibversuch
  // kollidierte erneut.
  //
  // Neu geladen wird **alles**, nicht nur die eine Woche: derselbe Weg wie beim
  // Anmelden, also ohne eigene Zusammenbau-Logik, die auseinanderlaufen könnte.
  // Konflikte sind selten — eine Handvoll Planer teilt sich eine Versammlung.
  //
  // Der Text ist `toastSpeicherFehler` („Änderung konnte nicht gespeichert
  // werden — bitte neu laden"). Er trifft genau zu und liegt in allen
  // App-Sprachen gemessen vor. Ein eigener Wortlaut („ein anderer Planer war
  // schneller") wäre schärfer, hieße aber je Sprache eine erfundene
  // Übersetzung — und eine erfundene ist schlimmer als eine zutreffende, die es
  // schon gibt.
  useEffect(() => {
    let laeuft = false
    setKonfliktMelder(() => {
      if (laeuft) return // ein Hinweis genügt; mehrere Wochen reißen oft mit
      const uid = stateRef.current.userId
      if (!uid) return
      laeuft = true
      dispatch({ type: 'showToast', text: dict(stateRef.current.lang).toastSpeicherFehler })
      void loadAndHydrate(dispatch, uid, { silent: true }).finally(() => {
        laeuft = false
      })
    })
    return () => setKonfliktMelder(null)
  }, [dispatch])

  /*
   * **Ein neuer Tag leitet „Meine Aufgaben" neu ab** (16.10.2026) — siehe
   * `neuerTag` im Reducer. `useKalendertag` merkt den Wechsel auch dann, wenn
   * die App über Nacht im Hintergrund lag (beim Zurückkehren).
   */
  const heute = useKalendertag()
  const ersterTag = useRef(heute)
  useEffect(() => {
    if (heute === ersterTag.current) return
    ersterTag.current = heute
    dispatch({ type: 'neuerTag' })
  }, [heute, dispatch])

  /*
   * **Gehört das Push-Abo dieses Geräts dem, der angemeldet ist?** Einmal je
   * Anmeldung, sobald Konto und Versammlung feststehen (`pushAboAbgleichen`).
   * Das Abmelden löst es zwar (`lib/abmelden.ts`), aber nicht jeder Wechsel geht
   * über das Abmelden: Ein Link meldet an, auch wenn schon jemand angemeldet
   * ist, und eine abgelaufene Sitzung kann das Abo nicht mehr löschen.
   */
  const { userId, congregationId } = state
  useEffect(() => {
    if (userId && congregationId) void pushAboAbgleichen(congregationId, userId, stateRef.current.lang)
  }, [userId, congregationId])

  // Geht die App in den Hintergrund, geht hinaus, was gebündelt wartet
  // (`ausstehendesSchreiben`): Am Handy hält das System den Zeitgeber dort an
  // und beendet die App womöglich, bevor er abläuft.
  useEffect(() => {
    const beimVerlassen = (): void => {
      if (document.visibilityState === 'hidden') ausstehendesSchreiben()
    }
    document.addEventListener('visibilitychange', beimVerlassen)
    return () => document.removeEventListener('visibilitychange', beimVerlassen)
  }, [])

  // Supabase-Session spiegeln (nur wenn konfiguriert): bestehende Session
  // überspringt den Login-Screen und lädt die Daten; SIGNED_IN (nach Login)
  // lädt ebenfalls; SIGNED_OUT wirft zurück zum Login.
  //
  // **Geladen wird je Konto einmal.** auth-js meldet `SIGNED_IN` nicht nur beim
  // Anmelden, sondern bei jedem Zurückwechseln in den Tab (gemessen an 2.110.2:
  // `_onVisibilityChanged` → `_recoverAndRefresh`). Darauf voll neu zu laden
  // hieß bei jedem Fokus „Lädt …", eine neu aufgebaute Ansicht und ein erneut
  // vorgelegtes Bestätigungsblatt.
  //
  // **Kommt die App mit einem Link aus der E-Mail** (`#anmelden=…`, T121
  // Phase 8), meldet sie zuerst damit an — auch, wenn auf dem Gerät schon
  // jemand angemeldet ist: Der Link gehört dem, der ihn öffnet. Gilt er nicht
  // mehr, sagt sie es, und es bleibt bei der Sitzung, die da war.
  //
  // **Danach steht fest, ob jemand angemeldet ist** (`sitzungGeprueft`), auf
  // jedem Weg — auch wenn eine Anfrage scheitert: Bliebe das Ladebild dann
  // stehen, käme man nicht einmal mehr zur Anmeldung.
  //
  // **Offline-Start** (19.10.2026): Ohne Netz wartete der Start lange und
  // zeigte danach womöglich die Anmeldung. Muss auth-js das Token erneuern,
  // weil die letzte Nutzung über eine Stunde zurückliegt, wartet jede Frage
  // nach der Sitzung auf das Netz; offline gibt es nach 25 s auf und meldet
  // keine Sitzung, obwohl sie noch auf dem Gerät liegt. Gilt das Token noch,
  // antwortet es sofort — dann aber scheitern die Abfragen der Daten, und
  // PostgREST wiederholt jede dreimal: sieben Sekunden Startbild.
  //
  // Jetzt greift der Provider vor, sobald ein Konto auf dem Gerät liegt: Er
  // zeigt dessen letzten Stand nur lesend, sofort, wenn das Gerät offline ist,
  // sonst, wenn das Startbild nach `VORGRIFF_NACH_MS` noch steht. Fehlt noch
  // die Sitzung, kommt ohne Momentaufnahme die Fehlerseite
  // (`letztenStandZeigen`); laden schon die Daten, bleibt dann das Startbild
  // (`momentaufnahmeZeigen`). Ein Laden, das noch läuft, kommt still darüber.
  // Offline wird gar nicht erst geladen, sondern sobald das Netz zurück ist
  // (`online`) oder die Erneuerung gelingt (`TOKEN_REFRESHED`).
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const token = anmeldeAdresse().token
    let geladenFuer: string | null = null
    /** Für wen gerade geladen wird — ein zweiter Anstoß lädt nicht daneben. */
    let laedtFuer: string | null = null
    let vorbei = false
    /** Steht der letzte Stand dieses Kontos? Der eines anderen gilt nicht. */
    const ueberDemLetztenStand = (userId: string): boolean =>
      stateRef.current.userId === userId && stateRef.current.staleAt !== null
    /** Steht für dieses Konto statt der Daten der letzte Stand oder die Fehlerseite? */
    const ersatzSteht = (userId: string): boolean =>
      stateRef.current.userId === userId &&
      (stateRef.current.staleAt !== null || stateRef.current.dataStatus === 'error')
    /** Die Daten dieses Kontos laden — still, wenn sein letzter Stand dasteht. */
    const ladenBeginnen = (userId: string): void => {
      geladenFuer = userId
      laedtFuer = userId
      // Steht der letzte Stand dieses Kontos, kommen die frischen Daten still
      // darüber: kein Startbild, die gewählte Woche bleibt, und scheitert es,
      // bleibt er stehen. Gefragt wird, wenn das Laden beginnt, und noch einmal
      // mit der Antwort: Dazwischen kann der Vorgriff ihn gezeigt haben.
      void loadAndHydrate(dispatch, userId, { silent: () => ueberDemLetztenStand(userId) }).finally(() => {
        if (laedtFuer === userId) laedtFuer = null
      })
    }
    /** Ein Konto meldet sich (Prüfung beim Start, `SIGNED_IN`): einmal laden, offline nicht. */
    const laden = (userId: string): void => {
      if (userId === geladenFuer) return
      // Offline wäre jeder Versuch vergeblich (oben). Bis das Netz zurück ist,
      // steht der letzte Stand, ohne ihn die Fehlerseite.
      if (navigator.onLine === false) {
        if (!ersatzSteht(userId)) letztenStandZeigen(dispatch, userId)
        return
      }
      ladenBeginnen(userId)
    }
    /**
     * Das Netz ist nachweislich zurück (`online`, `TOKEN_REFRESHED`): noch einmal
     * laden, wenn statt der Daten Ersatz steht, außer es lädt schon. Auch wenn
     * das Konto schon als geladen gilt, und ohne nach `navigator.onLine` zu
     * fragen: Eine gelungene Erneuerung ging übers Netz, auch wenn das Gerät
     * fälschlich „offline" meldet. Sonst bliebe der letzte Stand stehen, und
     * „Neu laden" begänne wieder bei ihm.
     */
    const nachladen = (userId: string): void => {
      if (ersatzSteht(userId) && laedtFuer !== userId) ladenBeginnen(userId)
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        geladenFuer = null
        dispatch({ type: 'logout' })
      } else if (event === 'SIGNED_IN' && session) laden(session.user.id)
      // Die Erneuerung ging übers Netz, es ist also wieder da.
      else if (event === 'TOKEN_REFRESHED' && session) nachladen(session.user.id)
    })
    // Das Gerät hat wieder Netz. Mit gültigem Token käme sonst kein Anstoß:
    // auth-js erneuert es erst kurz vor dem Ablauf, bis zu einer Stunde später.
    const wiederOnline = (): void => {
      const { userId } = stateRef.current
      if (userId) nachladen(userId)
    }
    window.addEventListener('online', wiederOnline)
    // Der Vorgriff (oben), solange das Startbild steht. Bei offener Sitzung nur
    // einmal: Meldet die Prüfung danach noch einen Netzfehler, bleibt die Ansicht.
    //
    // `langsam`: Der Wecker hat geklingelt, das Gerät hat Netz, und die Antwort
    // kann noch kommen — der Streifen sagt dann „Verbindung langsam" statt
    // „Offline" (19.10.2026; bis dahin hieß jeder Vorgriff „Offline").
    const vorab = gespeicherteSitzung()
    const vorgreifen = (langsam: boolean): void => {
      if (vorbei || !vorab) return
      if (stateRef.current.sitzungPruefen) {
        dispatch({ type: 'login' })
        letztenStandZeigen(dispatch, vorab.userId, { langsam })
        dispatch({ type: 'sitzungGeprueft' })
      } else if (stateRef.current.dataStatus === 'loading' && laedtFuer === vorab.userId) {
        // Die Sitzung steht, aber die Daten lassen auf sich warten: WLAN ohne
        // Internet, schwacher Empfang. Das Laden läuft weiter.
        momentaufnahmeZeigen(dispatch, vorab.userId, { langsam })
      } else if (!langsam && stateRef.current.staleLangsam) {
        // Der Wecker zeigte den letzten Stand als „langsam", jetzt scheitert
        // die Prüfung am Netz: Es kommt nichts mehr, also „Offline".
        dispatch({ type: 'nachladenGescheitert' })
      }
    }
    let wecker: ReturnType<typeof setTimeout> | undefined
    // Solange ein Link anmeldet, greift nichts vor: Angemeldet wird, wen er
    // nennt. Scheitert er am Netz, bleibt es bei der Sitzung, die da war, mit
    // ihrem letzten Stand (unten).
    if (!token && vorab) {
      if (navigator.onLine === false) vorgreifen(false)
      else wecker = setTimeout(() => vorgreifen(true), VORGRIFF_NACH_MS)
    }
    const pruefen = async (): Promise<void> => {
      if (token) {
        const fehler = await mitLinkAnmelden(token)
        if (vorbei) return
        if (!fehler) {
          dispatch({ type: 'login', welcome: true })
          return
        }
        dispatch({ type: 'showToast', text: anmeldeFehlerText(fehler, dict(stateRef.current.lang), 'link') })
      }
      const { data: sitzung, error } = await client.auth.getSession()
      if (vorbei) return
      if (sitzung.session) {
        // Steht schon der letzte Stand (Vorgriff), bleibt die Ansicht, wo sie ist.
        if (stateRef.current.sitzungPruefen) dispatch({ type: 'login' })
        laden(sitzung.session.user.id)
      } else if (isAuthRetryableFetchError(error)) {
        // Der Server war nicht zu erreichen; die Sitzung liegt noch auf dem Gerät.
        vorgreifen(false)
      }
    }
    void pruefen()
      .catch((fehler: unknown) => console.error('[sitzung]', fehler))
      .finally(() => {
        // Der Wecker bleibt: Nach der Sitzung können noch die Daten fehlen.
        if (!vorbei) dispatch({ type: 'sitzungGeprueft' })
      })
    return () => {
      vorbei = true
      clearTimeout(wecker)
      window.removeEventListener('online', wiederOnline)
      data.subscription.unsubscribe()
    }
  }, [dispatch])

  // Darstellung auf <html> spiegeln und merken (Muster aus index.html);
  // „Automatisch" folgt dem Gerät, solange die App offen ist.
  useEffect(() => {
    localStorage.setItem('theme', state.theme)
    return darstellungSpiegeln(state.theme)
  }, [state.theme])

  // Schriftgröße auf <html> spiegeln + Wahl merken. Rein gerätebezogen (wie
  // Theme), landet also nicht in der Datenbank — jeder stellt sein eigenes
  // Gerät ein. index.html setzt denselben Wert vor dem ersten Paint.
  useEffect(() => {
    document.documentElement.style.setProperty('--fs', String(state.fontScale))
    localStorage.setItem('fontScale', String(state.fontScale))
  }, [state.fontScale])

  // App-Sprache merken + Schreibrichtung (RTL für Arabisch und Persisch)
  useEffect(() => {
    localStorage.setItem('lang', state.lang)
    document.documentElement.lang = state.lang
    document.documentElement.dir = isRTL(state.lang) ? 'rtl' : 'ltr'
  }, [state.lang])

  // Sprach-Overlay lazy nachladen (Code-Splitting): bis es da ist, liefert
  // dict() den EN-Fallback; das erneute setLang (No-op-Übergang, kein
  // DB-Write) rendert die App danach mit den nachgeladenen Texten.
  useEffect(() => {
    void loadOverlay(state.lang)
      .then((loaded) => {
        if (loaded && stateRef.current.lang === state.lang) {
          dispatch({ type: 'setLang', lang: state.lang })
        }
      })
      // Nach einem Deployment sind die alten Lazy-Chunks weg; der Service
      // Worker cacht `/assets/`, aber nur bereits Geholtes. Der dynamische
      // Import scheitert dann. Ohne dieses catch war das eine unbehandelte
      // Rejection — die Sprache blieb still auf Englisch, ohne jede Meldung.
      // Eine Error Boundary greift hier nicht: die Ablehnung entsteht
      // außerhalb des Renderns.
      .catch((fehler: unknown) => console.error('[overlay]', state.lang, fehler))
  }, [state.lang, dispatch])

  // Bibelbuch-Tabellen ebenso nachladen — aber nur, wenn überhaupt etwas zu
  // übersetzen ist. Deutsche App mit deutscher Versammlungssprache holt die
  // rund 16 kB nie.
  useEffect(() => {
    if (state.lang === 'de' && state.congLang === 'de') return
    void bibelbuecherLaden()
      .then((geladen) => {
        if (geladen) dispatch({ type: 'setLang', lang: stateRef.current.lang })
      })
      // Wie beim Overlay: fehlgeschlagener Nachlade-Import darf keine
      // unbehandelte Rejection werden. Die Bibelbücher bleiben dann deutsch.
      .catch((fehler: unknown) => console.error('[bibelbuecher]', fehler))
  }, [state.lang, state.congLang, dispatch])

  // Toast automatisch ausblenden (2.4 s wie im Prototyp)
  useEffect(() => {
    if (!state.toast) return
    const timer = setTimeout(() => dispatch({ type: 'hideToast' }), 2400)
    return () => clearTimeout(timer)
  }, [state.toast, dispatch])

  // Drei Kontexte statt einem (T41), und jeder trägt genau eine Sorte:
  //  - Versand: über die ganze Sitzung dieselbe Funktion, ändert sich also nie.
  //    Wer nur auslöst (`useAppDispatch`), rendert bei Zustandsänderungen nicht.
  //  - Speicher: ebenfalls unveränderlich; darüber laufen die Selektoren
  //    (`useAppSelector`), die nur bei ihrem eigenen Ausschnitt wecken.
  //  - Zustand: ändert sich mit jedem Commit, für alles, was breit liest
  //    (`useAppState`, `useApp`).
  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}
