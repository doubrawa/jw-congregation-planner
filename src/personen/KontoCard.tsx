import { useApp } from '../app/context'
import { sendInviteMails } from '../lib/invite'
import { fill, useT } from '../i18n/useT'
import { appUrl, inviteMailHref, linkedMember, makeInvite, openInvite } from './invite-helpers'
import type { Person } from '../data/types'

/**
 * Konto-Karte (nur Produktionsmodus): Status des App-Zugangs der Person —
 * verknüpftes Konto, offener Einladungscode oder Einladen-Aktion. Mit
 * E-Mail-Adresse öffnet Einladen das eigene Mail-Programm (mailto:), ohne
 * werden Code + Teilen/Kopieren angeboten. Die App verschickt selbst nichts.
 */
export function KontoCard({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const member = linkedMember(state, person.id)
  const invite = openInvite(state, person.id)
  const self = member?.userId === state.userId

  const shareText = (code: string) => fill(t.inviteShareText, { code, url: appUrl() })

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shareText(code))
      dispatch({ type: 'showToast', text: t.toastCodeKopiert })
    } catch {
      dispatch({ type: 'showToast', text: code })
    }
  }

  const share = async (code: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText(code) })
      } catch {
        /* Teilen abgebrochen */
      }
      return
    }
    await copyCode(code)
  }

  // Einladen: Code anlegen; mit E-Mail zuerst Server-Versand (eigene Domain
  // via send-invite) versuchen, sonst/als Fallback das Mail-Programm öffnen.
  const invitePerson = async () => {
    const created = makeInvite(person)
    dispatch({ type: 'addInvite', invite: created })
    if (!person.mail) return
    const res = await sendInviteMails([{ personId: person.id, code: created.code }])
    if (res.ok && res.sent > 0) {
      dispatch({ type: 'showToast', text: t.toastInviteMail })
      return
    }
    window.location.href = inviteMailHref(person, created.code, t.inviteMailSubject, t.inviteMailBody)
  }

  const mailInvite = async (code: string) => {
    const res = await sendInviteMails([{ personId: person.id, code }])
    if (res.ok && res.sent > 0) {
      dispatch({ type: 'showToast', text: t.toastInviteMail })
      return
    }
    window.location.href = inviteMailHref(person, code, t.inviteMailSubject, t.inviteMailBody)
  }

  return (
    <div className="panel panel--pb14" data-farbe="neutral2">
      <div className="panel-label">{t.kontoCard}</div>
      {member ? (
        <div className="konto-row">
          <span className="konto-mail" dir="auto">
            ✓ {member.email || t.kontoVerknuepft}
            {self && <span className="mem-du">{t.duMarker}</span>}
          </span>
          {!self && (
            <button
              type="button"
              className="svc-remove"
              aria-label="✕"
              onClick={() => dispatch({ type: 'removeMember', userId: member.userId })}
            >
              ✕
            </button>
          )}
        </div>
      ) : invite ? (
        <>
          <p className="panel-hint">{t.codeOffenHint}</p>
          <div className="konto-row">
            <span className="mem-code">{invite.code}</span>
            <div className="konto-actions">
              {person.mail && (
                <button
                  type="button"
                  className="konto-link"
                  onClick={() => void mailInvite(invite.code)}
                >
                  {t.mailBtn}
                </button>
              )}
              <button type="button" className="konto-link" onClick={() => void share(invite.code)}>
                {t.teilenBtn}
              </button>
              <button type="button" className="konto-link" onClick={() => void copyCode(invite.code)}>
                {t.kopierenBtn}
              </button>
              <button
                type="button"
                className="svc-remove"
                aria-label="✕"
                onClick={() => dispatch({ type: 'removeInvite', id: invite.id })}
              >
                ✕
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="panel-hint">{person.mail ? t.einladenHintMail : t.einladenHintOhneMail}</p>
          <button type="button" className="btn-outline konto-invite" onClick={() => void invitePerson()}>
            {t.einladenBtn}
          </button>
        </>
      )}
    </div>
  )
}
