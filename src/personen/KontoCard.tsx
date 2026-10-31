import { useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Spur, type SpurSchritt } from '../bausteine/Spur'
import { gebundenesDatum } from '../components/datum-anzeige'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { LinkSendenBlatt } from './LinkSendenBlatt'
import { linkGilt } from './person-lage'
import { useZettelDruck } from './useZettelDruck'

/**
 * **Das Konto einer Person** (T121, Phase 8; Entwurf `GPerson`): oben die
 * Spur Angelegt · Link gesendet · Angemeldet, darunter, was als Nächstes geht —
 * einen Link senden (per Nachricht oder auf einem Zettel), einen neuen, oder das
 * verknüpfte Konto lösen.
 *
 * Angemeldet heißt: Ein Konto ist mit ihr verknüpft. Das entsteht bei der
 * ersten Anmeldung mit dem Link — vorher gibt es nichts zu verknüpfen.
 */
export function KontoCard({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const [blatt, setBlatt] = useState(false)
  const druck = useZettelDruck()
  const member = state.members.find((m) => m.personId === person.id)
  const link = state.anmeldeLinks.find((l) => l.personId === person.id)
  const offen = link !== undefined && linkGilt(link, heute)
  const self = member?.userId === state.userId
  const name = person.fn || displayName(person)
  const tag = (iso: string) => gebundenesDatum(new Date(iso), state.lang, 'tagMonatKurz')

  const schritte: SpurSchritt[] = [
    { name: t.spurAngelegt, lage: 'voll' },
    { name: t.standLink, wert: link ? tag(link.gesendetAt ?? link.erstelltAt) : undefined, lage: member || offen ? 'voll' : 'jetzt' },
    { name: t.standAngemeldet, lage: member ? 'voll' : offen ? 'jetzt' : 'leer' },
  ]

  const zettel = () => {
    setBlatt(false)
    void druck.drucken([person])
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
      ) : (
        <p className="klein-text konto-hinweis">
          {fill(offen ? t.linkOffenHint : link ? t.linkAbgelaufenHint : t.ohneLinkHint, { name })}
        </p>
      )}
      <div className="konto-knoepfe">
        {/* Angemeldet braucht es den Link nur noch für ein weiteres Gerät — deshalb leise. */}
        <button
          type="button"
          className={member || link ? 'knopf-pille' : 'knopf-pille knopf-pille--akzent'}
          onClick={() => setBlatt(true)}
        >
          {link || member ? t.neuerLinkBtn : t.linkSenden}
        </button>
        {!member && link && (
          <button type="button" className="knopf-pille" aria-disabled={druck.laeuft || undefined} onClick={zettel}>
            {t.zettelDrucken}
          </button>
        )}
      </div>
      {blatt && <LinkSendenBlatt person={person} onZettel={zettel} onClose={() => setBlatt(false)} />}
      {druck.bogen}
    </section>
  )
}
