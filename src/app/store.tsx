/**
 * App-Provider: verdrahtet Reducer (reducer.ts, rein), Startzustand (init.ts)
 * und Persistenz (persist.ts) und spiegelt Session, Theme und Sprache in
 * Supabase-Auth bzw. <html>-Attribute.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { isDarkTheme } from '../data/constants'
import { isRTL } from '../i18n/langs'
import { bibelbuecherLaden } from '../i18n/translate'
import { dict, loadOverlay } from '../i18n/ui'
import { setSchreibfehlerMelder } from '../lib/data'
import { clearSnapshot } from '../lib/snapshot'
import { supabase } from '../lib/supabase'
import { AppContext, type AppAction } from './context'
import { loadAndHydrate } from './hydrate'
import { initialState } from './init'
import { persist } from './persist'
import { isViewAction } from './readonly'
import { reducer } from './reducer'

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState)

  // Persistenz-Wrapper: berechnet den Folgezustand (Reducer ist rein),
  // schreibt die Änderung nach Supabase und aktualisiert dann React.
  const stateRef = useRef(state)
  stateRef.current = state
  const dispatch = useCallback((action: AppAction) => {
    const prev = stateRef.current
    // Offline-Stand (staleAt): nur lesen. Schreib-Aktionen abweisen und
    // erklären, statt sie sichtbar anzuwenden und beim nächsten Laden zu
    // verlieren — speichern kann persist() ohne Netz nicht.
    const effective: AppAction =
      prev.staleAt && !isViewAction(action.type)
        ? { type: 'showToast', text: dict(prev.lang).offlineReadOnly }
        : action
    if (effective.type === 'logout') clearSnapshot()
    const next = reducer(prev, effective)
    stateRef.current = next
    persist(prev, next, effective)
    rawDispatch(effective)
  }, [])

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

  // Supabase-Session spiegeln (nur wenn konfiguriert): bestehende Session
  // überspringt den Login-Screen und lädt die Daten; SIGNED_IN (nach Login)
  // lädt ebenfalls; SIGNED_OUT wirft zurück zum Login.
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        dispatch({ type: 'login' })
        void loadAndHydrate(dispatch, data.session.user.id)
      }
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') dispatch({ type: 'logout' })
      else if (event === 'PASSWORD_RECOVERY') dispatch({ type: 'setRecovery', on: true })
      else if (event === 'SIGNED_IN' && session) void loadAndHydrate(dispatch, session.user.id)
    })
    return () => data.subscription.unsubscribe()
  }, [dispatch])

  // Theme auf <html> spiegeln + Wahl merken (Muster aus index.html);
  // data-dark markiert die dunklen Paletten für dark-spezifische CSS-Regeln.
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
    if (isDarkTheme(state.theme)) {
      document.documentElement.dataset.dark = '1'
    } else {
      delete document.documentElement.dataset.dark
    }
    localStorage.setItem('theme', state.theme)
    // Statusleiste der installierten App an das Theme anpassen. --bg wird aus
    // dem CSS gelesen, damit es keine zweite Farbliste zu pflegen gibt.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (meta && bg) meta.content = bg
  }, [state.theme])

  // Schriftgröße auf <html> spiegeln + Wahl merken. Rein gerätebezogen (wie
  // Theme), landet also nicht in der Datenbank — jeder stellt sein eigenes
  // Gerät ein. index.html setzt denselben Wert vor dem ersten Paint.
  useEffect(() => {
    document.documentElement.style.setProperty('--fs', String(state.fontScale))
    localStorage.setItem('fontScale', String(state.fontScale))
  }, [state.fontScale])

  // App-Sprache merken + Schreibrichtung (RTL für Arabisch/Hebräisch/…)
  useEffect(() => {
    localStorage.setItem('lang', state.lang)
    document.documentElement.lang = state.lang
    document.documentElement.dir = isRTL(state.lang) ? 'rtl' : 'ltr'
  }, [state.lang])

  // Sprach-Overlay lazy nachladen (Code-Splitting): bis es da ist, liefert
  // dict() den EN-Fallback; das erneute setLang (No-op-Übergang, kein
  // DB-Write) rendert die App danach mit den nachgeladenen Texten.
  useEffect(() => {
    void loadOverlay(state.lang).then((loaded) => {
      if (loaded && stateRef.current.lang === state.lang) {
        dispatch({ type: 'setLang', lang: state.lang })
      }
    })
  }, [state.lang, dispatch])

  // Bibelbuch-Tabellen ebenso nachladen — aber nur, wenn überhaupt etwas zu
  // übersetzen ist. Deutsche App mit deutscher Versammlungssprache holt die
  // rund 16 kB nie.
  useEffect(() => {
    if (state.lang === 'de' && state.congLang === 'Deutsch') return
    void bibelbuecherLaden().then((geladen) => {
      if (geladen) dispatch({ type: 'setLang', lang: stateRef.current.lang })
    })
  }, [state.lang, state.congLang, dispatch])

  // Toast automatisch ausblenden (2.4 s wie im Prototyp)
  useEffect(() => {
    if (!state.toast) return
    const timer = setTimeout(() => dispatch({ type: 'hideToast' }), 2400)
    return () => clearTimeout(timer)
  }, [state.toast, dispatch])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
