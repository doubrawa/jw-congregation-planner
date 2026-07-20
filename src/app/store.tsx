/**
 * App-Provider: verdrahtet Reducer (reducer.ts, rein), Startzustand (init.ts)
 * und Persistenz (persist.ts) und spiegelt Session, Theme und Sprache in
 * Supabase-Auth bzw. <html>-Attribute.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { isDarkTheme } from '../data/constants'
import { isRTL } from '../i18n/langs'
import { loadOverlay } from '../i18n/ui'
import { supabase } from '../lib/supabase'
import { AppContext, type AppAction } from './context'
import { loadAndHydrate } from './hydrate'
import { initialState } from './init'
import { persist } from './persist'
import { reducer } from './reducer'

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState)

  // Persistenz-Wrapper: berechnet den Folgezustand (Reducer ist rein),
  // schreibt die Änderung nach Supabase und aktualisiert dann React.
  const stateRef = useRef(state)
  stateRef.current = state
  const dispatch = useCallback((action: AppAction) => {
    const prev = stateRef.current
    const next = reducer(prev, action)
    stateRef.current = next
    persist(prev, next, action)
    rawDispatch(action)
  }, [])

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
  }, [state.theme])

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

  // Toast automatisch ausblenden (2.4 s wie im Prototyp)
  useEffect(() => {
    if (!state.toast) return
    const timer = setTimeout(() => dispatch({ type: 'hideToast' }), 2400)
    return () => clearTimeout(timer)
  }, [state.toast, dispatch])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
