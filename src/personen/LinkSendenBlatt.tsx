import { useState } from 'react'
import { createPortal } from 'react-dom'
import { gueltigBis } from '../../supabase/functions/_shared/anmeldung.ts'
import { useApp } from '../app/context'
import { Spur } from '../bausteine/Spur'
import { Sheet } from '../components/Sheet'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { congAppCode, LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { alsAnmeldeLink, linksAusstellen } from '../lib/links-ausstellen'
import { linkMailEntwurf } from './link-mail'

/**
 * **Link senden** (T121, Phase 8; Entwurf `GEinladen`): einer Person ihren
 * Zugang geben — per E-Mail oder auf einem Zettel. Ein Konto anlegen oder ein
 * Kennwort wählen muss sie nicht; das Konto entsteht bei der ersten Anmeldung.
 *
 * Per E-Mail schickt der Server (`send-invite`). Kann er nicht senden, öffnet
 * sich dieselbe E-Mail im eigenen Mail-Programm — aus demselben einen Tipp:
 * Der Admin muss nicht wissen, ob der Versand gerade eingerichtet ist.
 *
 * Die Adresse steht hier nur zum Lesen, geändert wird sie bei der Person. Ein
 * Feld hier müsste erst die Person speichern — und die Function läse die
 * Adresse womöglich, bevor das Schreiben angekommen ist.
 */
export function LinkSendenBlatt({ person, onZettel, onClose }: { person: Person; onZettel: () => void; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [laeuft, setLaeuft] = useState(false)
  const name = person.fn || displayName(person)
  const adresse = person.mail.trim()
  const hatLink = state.anmeldeLinks.some((l) => l.personId === person.id)
  const angemeldet = state.members.some((m) => m.personId === person.id)
  // Bis wann ein Link gälte, der jetzt entsteht — in der Sprache dessen, der ihn ausstellt.
  const bis = new Intl.DateTimeFormat(LOCALES[state.lang], { day: 'numeric', month: 'long' }).format(new Date(gueltigBis(new Date())))

  const senden = async () => {
    if (laeuft) return
    // Die Function ruft man am Reducer vorbei — offline also gar nicht erst.
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
    setLaeuft(true)
    try {
      const lang = congAppCode(state.congLang) ?? 'de'
      let r = await linksAusstellen([person.id], { senden: true, lang })
      // Ohne Versand stellt der Server auf `senden` hin nichts aus — dann den
      // Link ohne Versand und die E-Mail aus dem eigenen Mail-Programm.
      const ohneVersand = !r.fehler && !r.mailBereit
      if (ohneVersand) r = await linksAusstellen([person.id], { senden: false, lang })
      if (r.links.length > 0) dispatch({ type: 'linksAusgestellt', links: r.links.map((l) => alsAnmeldeLink(l, new Date())) })
      const neu = r.links[0]
      if (!neu) {
        dispatch({ type: 'showToast', text: t.linkFehler })
        return
      }
      if (ohneVersand) {
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
