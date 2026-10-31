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
import { useNachrichtWeitergeben, type Weitergabe } from './useNachrichtWeitergeben'

/**
 * **Link senden** (T121, Phase 8; Entwurf `GEinladen`): einer Person ihren
 * Zugang geben — per Nachricht oder auf einem Zettel. Ein Konto anlegen oder
 * ein Kennwort wählen muss sie nicht; das Konto entsteht bei der ersten
 * Anmeldung.
 *
 * Per Nachricht (24.10.2026, Betreiber: „kann man den code auch ohne email
 * senden"): Link und Code als Text über das Teilen des Geräts — WhatsApp,
 * Signal, SMS — oder kopiert. Der Text meldet an; deshalb steht daneben, dass
 * er nur in den persönlichen Chat gehört. Bis zum 31.10.2026 ging der Link auch
 * per E-Mail; seitdem speichert die App keine Adressen mehr.
 */
export function LinkSendenBlatt({ person, onZettel, onClose }: { person: Person; onZettel: () => void; onClose: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  const weitergeben = useNachrichtWeitergeben()
  const [laeuft, setLaeuft] = useState(false)
  const teilbar = typeof navigator.share === 'function'
  const name = person.fn || displayName(person)
  const hatLink = state.anmeldeLinks.some((l) => l.personId === person.id)
  const angemeldet = state.members.some((m) => m.personId === person.id)
  // Bis wann ein Link gälte, der jetzt entsteht — in der Sprache dessen, der ihn
  // ausstellt. Mit Jahr: Er gilt ein Jahr, ohne stünde der Tag von heute da.
  const bis = gebundenesDatum(new Date(gueltigBis(new Date())), state.lang, 'tagMonatJahr')

  const geben = async (art: Weitergabe) => {
    if (laeuft) return
    setLaeuft(true)
    try {
      if (await weitergeben(person, art)) onClose()
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
        <section className="link-weg" aria-labelledby="link-per-nachricht">
          <h3 id="link-per-nachricht" className="link-weg-titel">
            {t.perNachricht}
          </h3>
          <p className="klein-text">{fill(t.perNachrichtHint, { name })}</p>
          <div className="link-weg-knoepfe">
            {teilbar && (
              <button type="button" className="knopf-umriss" aria-disabled={laeuft || undefined} onClick={() => void geben('teilen')}>
                {t.teilenBtn}
              </button>
            )}
            <button type="button" className="knopf-umriss" aria-disabled={laeuft || undefined} onClick={() => void geben('kopieren')}>
              {t.kopierenBtn}
            </button>
          </div>
        </section>
        <section className="link-weg" aria-labelledby="link-auf-zettel">
          <h3 id="link-auf-zettel" className="link-weg-titel">
            {t.aufZettel}
          </h3>
          <p className="klein-text">{fill(t.aufZettelHint, { datum: bis })}</p>
          {/* Nicht, während ein Link entsteht: Der Zettel stellte einen zweiten aus, der den ersten ersetzt. */}
          <button type="button" className="knopf-umriss" aria-disabled={laeuft || undefined} onClick={laeuft ? undefined : onZettel}>
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
