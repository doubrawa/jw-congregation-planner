import { useApp } from '../app/context'
import { Spur, type SpurSchritt } from '../bausteine/Spur'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import type { Person } from '../data/types'
import { congAppCode } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { copyText } from '../lib/clipboard'
import { sendInviteMails } from '../lib/invite'
import { appUrl, inviteMailHref, linkedMember, makeInvite, openInvite } from './invite-helpers'

/**
 * **Das Konto einer Person** (T121, Entwurf `GPerson`): oben die Spur
 * Angelegt · Eingeladen · Angemeldet, darunter, was als Nächstes geht —
 * einladen, den offenen Code weitergeben oder das verknüpfte Konto lösen.
 *
 * Mit E-Mail-Adresse schickt „Einladen" die Mail über die Edge Function
 * `send-invite`; antwortet die mit `not-configured` (kein `INVITE_FROM`),
 * öffnet sich stattdessen das eigene Mail-Programm (mailto:). Ohne Adresse
 * werden Code und Teilen/Kopieren angeboten. Den Link statt des Codes bringt
 * Phase 8 („Anmelden per Link").
 */
export function KontoCard({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const member = linkedMember(state, person.id)
  const invite = openInvite(state, person.id)
  const self = member?.userId === state.userId

  const schritte: SpurSchritt[] = [
    { name: t.spurAngelegt, lage: 'voll' },
    { name: t.standEingeladen, lage: member || invite ? 'voll' : 'jetzt' },
    { name: t.standAngemeldet, lage: member ? 'voll' : invite ? 'jetzt' : 'leer' },
  ]

  const shareText = (code: string) => fill(t.inviteShareText, { code, url: appUrl() })

  const copyCode = async (code: string) => {
    const ok = await copyText(shareText(code))
    // Klappt das Kopieren nicht, den Code wenigstens sichtbar zeigen.
    dispatch({ type: 'showToast', text: ok ? t.toastCodeKopiert : code })
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

  /**
   * Die Einladungs-Mail hinausschicken: zuerst über den Server (eigene Domain
   * via `send-invite`), und wenn der nicht kann, über das Mail-Programm.
   */
  const einladungSenden = async (code: string) => {
    const res = await sendInviteMails([{ personId: person.id, code }], congAppCode(state.congLang))
    if (res.ok && res.sent > 0) {
      dispatch({ type: 'showToast', text: t.toastInviteMail })
      return
    }
    window.location.href = inviteMailHref(person, code, t.inviteMailSubject, t.inviteMailBody)
  }

  // Einladen: Code anlegen und, wenn eine Adresse dasteht, gleich verschicken.
  const invitePerson = async () => {
    /*
     * **Offline-Stand: gar nicht erst anfangen.**
     *
     * Der Reducer weist Schreib-Aktionen im Offline-Stand ab (`readonly.ts`) —
     * aber nur den Reducer. Was danach in derselben Funktion steht, lief
     * weiter: Der Einladungscode entsteht hier im Baustein, die Zeile landet
     * nie im Zustand und nie in der Datenbank, und die Mail ging trotzdem
     * hinaus. Der Eingeladene bekam einen Code, den `redeem_invite` nicht
     * kennt.
     *
     * „Plan senden" (`sendeUmfang`) zieht dieselbe Grenze und aus demselben
     * Grund: Wer eine Edge Function unmittelbar ruft, kommt am Reducer vorbei.
     */
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
    const created = makeInvite(person)
    dispatch({ type: 'addInvite', invite: created })
    if (person.mail) await einladungSenden(created.code)
  }

  return (
    <section className="karte person-karte konto-karte">
      <Spur label={t.kontoCard} schritte={schritte} />
      {member ? (
        <div className="konto-zeile">
          <span className="konto-mail" dir="auto">
            {member.email || t.kontoVerknuepft}
            {self && <span className="mem-du">{t.duMarker}</span>}
          </span>
          {!self && (
            <EntfernenKnopf
              className="rund-knopf rund-knopf--feld konto-entfernen"
              frage={t.entfernenSicher}
              onEntfernen={() => dispatch({ type: 'removeMember', userId: member.userId })}
            />
          )}
        </div>
      ) : invite ? (
        <>
          <p className="klein-text konto-hinweis">{t.codeOffenHint}</p>
          <div className="konto-zeile">
            <span className="konto-code">{invite.code}</span>
            <EntfernenKnopf
              className="rund-knopf rund-knopf--feld konto-entfernen"
              onEntfernen={() => dispatch({ type: 'removeInvite', id: invite.id })}
            />
          </div>
          <div className="konto-knoepfe">
            {/* Ohne Offline-Wache, und das mit Absicht: Der Code steht schon in
                der Datenbank (die Karte zeigt diese Knöpfe nur bei einem
                offenen). Nichts wird erzeugt, nichts geht verloren — und wenn
                das Netz inzwischen wieder da ist, ist das Verschicken genau das
                Richtige. Anders als beim Einladen, wo der Code erst entsteht. */}
            {person.mail && (
              <button type="button" className="knopf-pille" onClick={() => void einladungSenden(invite.code)}>
                {t.mailBtn}
              </button>
            )}
            <button type="button" className="knopf-pille" onClick={() => void share(invite.code)}>
              {t.teilenBtn}
            </button>
            <button type="button" className="knopf-pille" onClick={() => void copyCode(invite.code)}>
              {t.kopierenBtn}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="klein-text konto-hinweis">{person.mail ? t.einladenHintMail : t.einladenHintOhneMail}</p>
          <div className="konto-knoepfe">
            <button type="button" className="knopf-pille knopf-pille--akzent" onClick={() => void invitePerson()}>
              {t.einladenBtn}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
