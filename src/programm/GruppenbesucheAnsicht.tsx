import { useMemo } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { wochenSpanne } from '../components/datum-anzeige'
import { besuchsGruppe, besuchsTreffpunktText, besucherName } from '../components/gruppenbesuch-anzeige'
import { besuchStand } from '../data/gruppenbesuche'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { GruppenbesuchBogen } from '../druck/TreffpunktBogen'
import { overseerGroup } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { fill, useT } from '../i18n/useT'
import { AnsichtDrucken } from './AnsichtDrucken'

/**
 * **Gruppenbesuche des Dienstaufsehers** beim Ansehen (T120, Phase 2; T121,
 * Entwurf `GGruppenbesuche`) — für alle.
 *
 * Oben die Besuche bei der **eigenen** Gruppe mit Treffpunkt und Besucher: Die
 * Gruppe soll sich darauf einstellen können (od Kap. 5 Abs. 41 — der
 * Gruppenaufseher kündigt den Besuch an). Darunter alle kommenden Besuche, nur
 * Woche und Gruppe, die eigene hervorgehoben: Wo und wann sich eine fremde
 * Gruppe trifft, zeigt die App auch sonst nicht (`fsVisible`).
 */
export function GruppenbesucheAnsicht() {
  const { state } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const me = eigenePerson(state)
  // Die eigene Gruppe: die, in der man geführt ist — sonst die, die man leitet.
  // Nach der Regel ist das dieselbe (`overseerGroup`); der Rückfall trägt Daten,
  // die von außen anders kommen.
  const meineGruppe = me?.grp ?? overseerGroup(state.groups, state.personId)

  const lage = useBesuchsLage()
  const kommend = useMemo(
    () =>
      state.gruppenbesuche
        .map((besuch) => ({ besuch, stand: besuchStand(besuch, lage, fromIso(tag)) }))
        .filter(({ stand }) => stand.art !== 'vorbei'),
    [lage, state.gruppenbesuche, tag],
  )

  const beiMir = kommend.filter(({ besuch }) => besuch.grp === meineGruppe)
  const gruppe = meineGruppe ? state.groups.find((g) => g.id === meineGruppe) : undefined

  return (
    <>
      <AnsichtDrucken titel={t.gbTitel} bogen={() => <GruppenbesuchBogen />} />
      {gruppe && (
        <section className="karte gb-karte">
          <h2 className="gb-karte-titel is-eigen">{`${t.gbDeineGruppe} · ${tu(gruppe.name)}`}</h2>
          {beiMir.length === 0 && <p className="gb-leer">{t.gbLeer}</p>}
          {beiMir.map(({ besuch, stand }) => {
            // Wer leitet, sagt der Satz nur, wenn es stimmt: eingetragen oder
            // vorgemerkt. Steht dort noch ein anderer Leiter, hat der Planer
            // das letzte Wort — die Gruppe soll nichts Falsches lesen.
            const zugesagt = stand.art === 'eingetragen' || stand.art === 'vorgemerkt'
            const name = zugesagt ? besucherName(besuch, state.persons) : ''
            return (
              <div key={besuch.id} className="gb-besuch">
                <span className="gb-besuch-woche">{wochenSpanne(besuch.woche, state.lang)}</span>
                {stand.treffpunkte.map((inst) => (
                  <span key={inst.id} className="gb-besuch-treffpunkt" dir="auto">
                    {besuchsTreffpunktText(besuch.woche, inst, state.lang, tu)}
                  </span>
                ))}
                {name && <span className="gb-besuch-leiter">{fill(t.gbLeitetDann, { name })}</span>}
              </div>
            )
          })}
        </section>
      )}

      <section className="karte gb-karte">
        <h2 className="gb-karte-titel">{t.gbAlle}</h2>
        {kommend.length === 0 && <p className="gb-leer">{t.gbLeer}</p>}
        {kommend.map(({ besuch }) => (
          <div key={besuch.id} className={besuch.grp === meineGruppe ? 'gb-liste-zeile is-eigen' : 'gb-liste-zeile'}>
            <span className="gb-liste-punkt" aria-hidden="true" />
            <span className="gb-liste-woche">{wochenSpanne(besuch.woche, state.lang)}</span>
            <span className="gb-liste-gruppe">{besuchsGruppe(besuch, state.groups, tu)}</span>
          </div>
        ))}
      </section>
    </>
  )
}
