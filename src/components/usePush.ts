import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { istAngemeldet } from '../app/eigene-person'
import { deletePushSubscription, savePushLanguage, savePushSubscription } from '../lib/data'
import { appInstalled, installAvailable, onInstallChange } from '../lib/install'
import {
  currentSubscription,
  pushNeedsInstall,
  pushSupported,
  subscribePush,
  subscriptionFields,
} from '../lib/push'
import { useT } from '../i18n/useT'

interface PushState {
  angemeldet: boolean // angemeldetes Konto — ohne gibt es kein Abo, an das Push gehen könnte
  supported: boolean // Push direkt möglich (Schalter/„Aktivieren")
  needsInstall: boolean // erst als Home-Bildschirm-App möglich (iOS)
  subscribed: boolean // dieses Gerät hat ein Abo
  enable: () => Promise<boolean>
  disable: () => Promise<void>
}

/**
 * Push-Zustand + An-/Abmelden, gebündelt für Profil-Schalter und Opt-in-Banner.
 * `enable` fragt die Berechtigung an, speichert das Abo und toastet; `disable`
 * meldet das Gerät ab. Berechtigung wird nur ausgelöst, wenn der Nutzer selbst
 * eine Aktion anstößt (nie automatisch — ein abgelehnter Dialog blockiert dauerhaft).
 */
export function usePush(): PushState {
  const { state, dispatch } = useApp()
  const { t } = useT()
  // Ein Abo gehört einem Nutzer (`push_subscriptions.user_id`).
  const angemeldet = istAngemeldet(state)
  const supported = pushSupported()
  const needsInstall = pushNeedsInstall()
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!angemeldet || !supported) return
    void currentSubscription().then((sub) => setSubscribed(Boolean(sub)))
  }, [angemeldet, supported])

  // Sprachwechsel ans bestehende Abo weiterreichen: Push-Text entsteht beim
  // Versand, wer die Sprache später umstellt, bekäme sonst dauerhaft die alte.
  useEffect(() => {
    if (!angemeldet || !supported || !subscribed) return
    void currentSubscription().then((sub) => {
      if (sub) savePushLanguage(sub.endpoint, state.lang)
    })
  }, [angemeldet, supported, subscribed, state.lang])

  const enable = async (): Promise<boolean> => {
    const sub = await subscribePush().catch(() => null)
    const fields = sub && subscriptionFields(sub)
    if (!fields || !state.congregationId || !state.userId) {
      dispatch({ type: 'showToast', text: t.toastPushVerweigert })
      return false
    }
    savePushSubscription(state.congregationId, state.userId, fields, state.lang)
    setSubscribed(true)
    dispatch({ type: 'showToast', text: t.toastPushAn })
    return true
  }

  const disable = async (): Promise<void> => {
    const sub = await currentSubscription()
    if (sub) {
      deletePushSubscription(sub.endpoint)
      await sub.unsubscribe()
    }
    setSubscribed(false)
    dispatch({ type: 'showToast', text: t.toastPushAus })
  }

  return { angemeldet, supported, needsInstall, subscribed, enable, disable }
}

/**
 * Reaktiv: soll „App installieren“ angeboten werden? Nur wenn der Browser die
 * Installation anbietet (beforeinstallprompt) UND die App hier nicht schon
 * installiert ist — sonst stünde das Angebot in der installierten App selbst.
 */
export function useInstallAvailable(): boolean {
  const [avail, setAvail] = useState(installAvailable())
  const [installed, setInstalled] = useState(false)
  useEffect(() => onInstallChange(() => setAvail(installAvailable())), [])
  useEffect(() => {
    let alive = true
    void appInstalled().then((yes) => {
      if (alive) setInstalled(yes)
    })
    return () => {
      alive = false
    }
  }, [])
  return avail && !installed
}
