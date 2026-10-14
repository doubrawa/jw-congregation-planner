import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { darfTrolley, istDabei } from '../data/trolleys'
import type { TrolleyTermin } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { andererIm, nameVon, tagLang, vornameVon, zeitSpanne } from './trolley-anzeige'
import { trolleyFehlerText, useTrolleyAktion } from './useTrolleyAktion'

/**
 * **Ein Trolley-Termin** — wann, welcher Trolley und wo man ihn abholt, sein
 * Hinweis, wer dabei ist. Der Entwurf zeichnet nur den Verweis (`#termin`);
 * das Blatt bietet, was man dort tun kann:
 *
 * - **Austragen**, wer dabei ist — mit Rückfrage wie jedes Entfernen. Bleibt
 *   der andere, erfährt er es und sucht wieder einen Partner (`wasBleibt`).
 * - **Dazukommen**, wer das Trolley-Recht hat, wo jemand einen Partner sucht.
 *
 * Vorbei ist vorbei: Dann steht der Termin nur noch da.
 */
export function TerminBlatt({ termin, onClose }: { termin: TrolleyTermin; onClose: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const aktion = useTrolleyAktion()
  const [fehler, setFehler] = useState<string | null>(null)
  const ich = eigenePerson(state)
  const trolley = state.trolleys.find((x) => x.id === termin.trolleyId)
  const name = trolley?.name ?? t.privZeugnis
  const vorbei = termin.datum < heute
  const dabei = istDabei(termin, ich?.id)
  const anderer = dabei ? andererIm(termin, ich?.id) : null
  const kannDazu = !vorbei && !dabei && termin.partner === null && darfTrolley(ich)

  const fertig = (grund: Awaited<ReturnType<typeof aktion.austragen>>) => {
    if (grund) setFehler(trolleyFehlerText(grund, t, vornameVon(state.persons, anderer)))
    else onClose()
  }

  return createPortal(
    <Sheet
      label={name}
      eyebrow={<div className="sheet-marke">{t.privZeugnis}</div>}
      title={<span dir="auto">{name}</span>}
      sub={`${tagLang(termin.datum, state.lang)} · ${zeitSpanne(termin)}`}
      onClose={onClose}
    >
      <div className="sheet-inhalt trolley-termin-blatt">
        {trolley?.ort && (
          <p dir="auto">
            {fill(t.trolleyAbholen, { ort: trolley.ort })}
          </p>
        )}
        {trolley?.hinweis && (
          <p className="klein-text" dir="auto">
            {trolley.hinweis}
          </p>
        )}
        <ul className="trolley-personen" aria-label={t.trolleyWer}>
          <li dir="auto">{nameVon(state.persons, termin.pid)}</li>
          <li dir="auto" className={termin.partner ? undefined : 'trolley-termin-gesucht'}>
            {termin.partner ? nameVon(state.persons, termin.partner) : t.trolleyPartnerGesucht}
          </li>
        </ul>
        {dabei && anderer && !vorbei && (
          <p className="klein-text" dir="auto">
            {fill(t.trolleyAustragenHinweis, { name: vornameVon(state.persons, anderer) })}
          </p>
        )}
        {fehler && (
          <p className="feld-fehler" role="alert" dir="auto">
            {fehler}
          </p>
        )}
      </div>
      {(kannDazu || (dabei && !vorbei)) && ich && (
        <div className="sheet-fuss-ende">
          {dabei ? (
            <EntfernenKnopf
              className="knopf-umriss knopf-entfernen"
              text={t.trolleyAustragen}
              frage={t.entfernenSicher}
              onEntfernen={() => void aktion.austragen(termin, ich.id).then(fertig)}
            />
          ) : (
            <GesperrterKnopf
              className="knopf-haupt"
              gesperrt={aktion.laeuft}
              onTipp={() => void aktion.dazukommen(termin, ich.id).then(fertig)}
            >
              {t.trolleyDazukommen}
            </GesperrterKnopf>
          )}
        </div>
      )}
    </Sheet>,
    document.body,
  )
}
