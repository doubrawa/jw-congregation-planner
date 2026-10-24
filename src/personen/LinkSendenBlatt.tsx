import { useState } from 'react'
import { createPortal } from 'react-dom'
import { gueltigBis } from '../../supabase/functions/_shared/anmeldung.ts'
import { useApp } from '../app/context'
import { Spur } from '../bausteine/Spur'
import { gebundenesDatum } from '../components/datum-anzeige'
import { Sheet } from '../components/Sheet'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { copyText } from '../lib/clipboard'
import { linkMailEntwurf, linkNachricht } from './link-mail'
import { sprachDerVersammlung, useLinksAusstellen } from './useLinksAusstellen'

/**
 * **Link senden** (T121, Phase 8; Entwurf `GEinladen`): einer Person ihren
 * Zugang geben — per E-Mail, per Nachricht oder auf einem Zettel. Ein Konto
 * anlegen oder ein Kennwort wählen muss sie nicht; das Konto entsteht bei der
 * ersten Anmeldung.
 *
 * Per E-Mail schickt der Server (`send-invite`). Kann er nicht senden, öffnet
 * sich dieselbe E-Mail im eigenen Mail-Programm — aus demselben einen Tipp:
 * Der Admin muss nicht wissen, ob der Versand gerade eingerichtet ist.
 *
 * Per Nachricht (24.10.2026, Betreiber: „kann man den code auch ohne email
 * senden"): Link und Code als Text über das Teilen des Geräts — WhatsApp,
 * Signal, SMS — oder kopiert. Der Text meldet an; deshalb steht daneben, dass
 * er nur in den persönlichen Chat gehört. Bis zum 15.10.2026 gab es Teilen und
 * Kopieren schon einmal, beim Einladungscode.
 *
 * Die Adresse steht hier nur zum Lesen, geändert wird sie bei der Person. Ein
 * Feld hier müsste erst die Person speichern — und die Function läse die
 * Adresse womöglich, bevor das Schreiben angekommen ist.
 */
export function LinkSendenBlatt({ person, onZettel, onClose }: { person: Person; onZettel: () => void; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const ausstellen = useLinksAusstellen()
  const [laeuft, setLaeuft] = useState(false)
  /*
   * Der Text der Nachricht, einmal je Blatt ausgestellt. Der Code steht nur
   * als Prüfsumme in der Datenbank — ein zweiter Tipp nimmt deshalb denselben
   * Text, statt den eben geteilten Link durch einen neuen zu ersetzen. Und
   * Safari lässt das Teilen nur kurz nach dem Tipp zu: Dauerte das Ausstellen
   * zu lange, teilt erst der nächste Tipp — mit diesem Text.
   */
  const [nachricht, setNachricht] = useState<{ titel: string; text: string } | null>(null)
  const teilbar = typeof navigator.share === 'function'
  const name = person.fn || displayName(person)
  const adresse = person.mail.trim()
  const hatLink = state.anmeldeLinks.some((l) => l.personId === person.id)
  const angemeldet = state.members.some((m) => m.personId === person.id)
  // Bis wann ein Link gälte, der jetzt entsteht — in der Sprache dessen, der ihn ausstellt.
  const bis = gebundenesDatum(new Date(gueltigBis(new Date())), state.lang, 'tagMonat')

  const senden = async () => {
    if (laeuft) return
    setLaeuft(true)
    try {
      let r = await ausstellen([person.id], true)
      if (!r) return
      // Ohne Versand stellt der Server auf `senden` hin nichts aus — dann den
      // Link ohne Versand und die E-Mail aus dem eigenen Mail-Programm.
      const ohneVersand = !r.fehler && !r.mailBereit
      if (ohneVersand) r = await ausstellen([person.id], false)
      const neu = r?.links[0]
      if (!neu) {
        dispatch({ type: 'showToast', text: t.linkFehler })
        return
      }
      // Der neue Link ersetzt den der Nachricht — sie gälte nicht mehr.
      setNachricht(null)
      if (ohneVersand) {
        const lang = sprachDerVersammlung(state.congLang)
        window.location.href = await linkMailEntwurf(person, neu, { lang, versammlung: state.congregation.name })
        onClose()
        return
      }
      dispatch({ type: 'showToast', text: fill(neu.gesendet ? t.toastLinkGesendet : t.toastMailFehler, { name }) })
      if (neu.gesendet) onClose()
    } finally {
      setLaeuft(false)
    }
  }

  /** Der Text mit Link und Code — beim ersten Tipp ausgestellt, danach derselbe (siehe `nachricht`). */
  const nachrichtHolen = async (): Promise<{ titel: string; text: string } | null> => {
    if (nachricht) return nachricht
    const r = await ausstellen([person.id], false)
    if (!r) return null
    const neu = r.links[0]
    if (!neu) {
      dispatch({ type: 'showToast', text: t.linkFehler })
      return null
    }
    const n = await linkNachricht(person, neu, { lang: sprachDerVersammlung(state.congLang), versammlung: state.congregation.name })
    setNachricht(n)
    return n
  }

  const weitergeben = async (art: 'teilen' | 'kopieren') => {
    if (laeuft) return
    setLaeuft(true)
    try {
      const n = await nachrichtHolen()
      if (!n) return
      if (art === 'kopieren') {
        if (!(await copyText(n.text))) {
          dispatch({ type: 'showToast', text: t.nochmalTippen })
          return
        }
        dispatch({ type: 'showToast', text: fill(t.toastNachrichtKopiert, { name }) })
        onClose()
        return
      }
      try {
        await navigator.share({ title: n.titel, text: n.text })
        onClose()
      } catch (fehler) {
        // Abgebrochen, oder Safari ließ das Teilen nach dem Warten auf den
        // Server nicht mehr zu: Der Text bleibt bereit, der nächste Tipp teilt ihn.
        if (!(fehler instanceof DOMException && fehler.name === 'AbortError')) dispatch({ type: 'showToast', text: t.nochmalTippen })
      }
    } finally {
      setLaeuft(false)
    }
  }

  return createPortal(
    <Sheet
      label={`${displayName(person)}: ${t.linkSenden}`}
      eyebrow={
        <div className="sheet-marke" dir="auto">
          {displayName(person)}
        </div>
      }
      title={t.linkSenden}
      onClose={onClose}
    >
      <div className="sheet-inhalt link-blatt">
        <Spur
          label={t.kontoCard}
          schritte={[
            { name: t.spurAngelegt, lage: 'voll' },
            { name: t.standLink, lage: 'jetzt' },
            { name: t.standAngemeldet, lage: angemeldet ? 'voll' : 'leer' },
          ]}
        />
        <section className="link-weg" aria-labelledby="link-per-mail">
          <h3 id="link-per-mail" className="link-weg-titel">
            {t.perEmail}
          </h3>
          {adresse ? (
            <>
              <p className="klein-text">{fill(t.perEmailHint, { name })}</p>
              <p className="link-adresse" dir="ltr">
                {adresse}
              </p>
              <button type="button" className="knopf-dunkel" aria-disabled={laeuft || undefined} onClick={() => void senden()}>
                {laeuft ? t.wirdGesendet : t.linkSenden}
              </button>
            </>
          ) : (
            <p className="klein-text">{fill(t.keineAdresseHint, { name })}</p>
          )}
        </section>
        <section className="link-weg" aria-labelledby="link-per-nachricht">
          <h3 id="link-per-nachricht" className="link-weg-titel">
            {t.perNachricht}
          </h3>
          <p className="klein-text">{fill(t.perNachrichtHint, { name })}</p>
          <div className="link-weg-knoepfe">
            {teilbar && (
              <button type="button" className="knopf-umriss" aria-disabled={laeuft || undefined} onClick={() => void weitergeben('teilen')}>
                {t.teilenBtn}
              </button>
            )}
            <button type="button" className="knopf-umriss" aria-disabled={laeuft || undefined} onClick={() => void weitergeben('kopieren')}>
              {t.kopierenBtn}
            </button>
          </div>
        </section>
        <section className="link-weg" aria-labelledby="link-auf-zettel">
          <h3 id="link-auf-zettel" className="link-weg-titel">
            {t.aufZettel}
          </h3>
          <p className="klein-text">{fill(t.aufZettelHint, { datum: bis })}</p>
          <button type="button" className="knopf-umriss" onClick={onZettel}>
            {t.zettelDrucken}
          </button>
        </section>
        {hatLink && <p className="klein-text">{t.neuerLinkErsetzt}</p>}
        <p className="klein-text">{fill(t.ohneKontoHint, { name })}</p>
        <button type="button" className="knopf-leise link-spaeter" onClick={onClose}>
          {t.spaeter}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
