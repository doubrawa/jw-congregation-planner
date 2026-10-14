import { useState } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { BlattFeld } from '../bausteine/BlattFeld'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Wahl } from '../bausteine/Wahl'
import { DatePicker } from '../components/DatePicker'
import { personLabel } from '../data/helpers'
import { fromIso, tagNach } from '../data/meeting-dates'
import { eintragenHindernis, moeglichePartner, TROLLEY_ZEITEN, trolleysSortiert } from '../data/trolleys'
import type { TrolleyTermin } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { type Eingabe, TROLLEY_WOCHEN, vornameVon } from './trolley-anzeige'
import { trolleyFehlerText, useTrolleyAktion } from './useTrolleyAktion'

/** Die Wahl „Mit wem". */
type MitWem = 'mit' | 'gesucht'

/** Bis zu so vielen Trolleys stehen sie nebeneinander zur Wahl, darüber in einer Liste. */
const WAHL_GRENZE = 3

/**
 * **Für den Trolley eintragen** (Entwurf `GTrolleyEintragen`; am Desktop
 * dauerhaft rechts neben der Woche, `GDesktopTrolleys`): Tag, Von und Bis frei
 * von 6 bis 22 Uhr in halben Stunden, der Trolley — und mit wem: „Mit
 * Partner" trägt beide ein, „Partner gesucht" einen allein.
 *
 * Was einem Eintrag im Weg steht, steht schon vor dem Absenden da
 * (`eintragenHindernis`, dieselben Gründe wie die Function); was erst der
 * Server weiß — zwei wollten zugleich dieselbe Zeit —, danach an derselben
 * Stelle.
 *
 * Die Eingabe hält der Aufrufer (`eingabe`): Am Desktop setzt ein Klick ins
 * Raster Tag und Trolley, während das Formular schon offen steht.
 */
export function EintragenFormular({
  eingabe,
  onEingabe,
  onFertig,
  onAbbrechen,
}: {
  eingabe: Eingabe
  onEingabe: (eingabe: Eingabe) => void
  onFertig: () => void
  /** Nur im Blatt — am Desktop bleibt das Formular stehen. */
  onAbbrechen?: () => void
}) {
  const { state } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const aktion = useTrolleyAktion()
  const [fehler, setFehler] = useState<string | null>(null)
  const ich = eigenePerson(state)
  const trolleys = trolleysSortiert(state.trolleys)
  const partner = eingabe.mitPartner ? state.persons.find((p) => p.id === eingabe.partner) ?? null : null
  const partnerName = vornameVon(state.persons, eingabe.partner)
  const hindernis = eintragenHindernis(state.trolleyTermine, ich, { ...eingabe, partner }, fromIso(heute))
  const ohnePartner = eingabe.mitPartner && !partner
  const aendern = (patch: Partial<Eingabe>) => {
    setFehler(null)
    onEingabe({ ...eingabe, ...patch })
  }

  const absenden = async () => {
    if (!ich || hindernis || ohnePartner) return
    const termin: TrolleyTermin = {
      id: `r${crypto.randomUUID()}`,
      trolleyId: eingabe.trolleyId,
      datum: eingabe.datum,
      von: eingabe.von,
      bis: eingabe.bis,
      pid: ich.id,
      partner: partner?.id ?? null,
      gemeinsam: partner !== null,
    }
    const grund = await aktion.eintragen(termin)
    if (grund) setFehler(trolleyFehlerText(grund, t, partnerName))
    else onFertig()
  }

  const zeitWahl = (wert: string, onWahl: (zeit: string) => void) => (
    <select className="feld-wahl" value={wert} onChange={(e) => onWahl(e.target.value)}>
      {TROLLEY_ZEITEN.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </select>
  )
  const meldung = fehler ?? (hindernis ? trolleyFehlerText(hindernis, t, partnerName) : null)
  // Wer es erfährt: der Partner sofort, am Vortag beide — oder, allein, wer dazukommen kann.
  const hinweis = partner ? fill(t.trolleyPartnerHinweis, { name: partnerName }) : eingabe.mitPartner ? null : t.trolleyGesuchtHinweis

  return (
    <>
      <div className="blatt-felder">
        <BlattFeld marke={t.trolleyTag}>
          <DatePicker
            value={eingabe.datum}
            onChange={(datum) => aendern({ datum })}
            locale={LOCALES[state.lang]}
            min={heute}
            max={tagNach(heute, TROLLEY_WOCHEN * 7)}
            placeholder={t.datumPh}
            ariaLabel={t.trolleyTag}
            prevLabel={t.a11yPrevMonth}
            nextLabel={t.a11yNextMonth}
          />
        </BlattFeld>
        <div className="trolley-zeiten">
          <BlattFeld marke={t.von}>{zeitWahl(eingabe.von, (von) => aendern({ von }))}</BlattFeld>
          <BlattFeld marke={t.bis}>{zeitWahl(eingabe.bis, (bis) => aendern({ bis }))}</BlattFeld>
        </div>
        <p className="klein-text">{t.trolleyZeitHinweis}</p>
        <div className="blatt-feld">
          <span className="feld-marke">{t.privZeugnis}</span>
          {trolleys.length <= WAHL_GRENZE ? (
            <Wahl
              label={t.privZeugnis}
              optionen={trolleys.map((tr) => ({ wert: tr.id, text: tr.name }))}
              wert={eingabe.trolleyId}
              onWahl={(trolleyId) => aendern({ trolleyId })}
            />
          ) : (
            <select
              className="feld-wahl"
              aria-label={t.privZeugnis}
              value={eingabe.trolleyId}
              onChange={(e) => aendern({ trolleyId: e.target.value })}
            >
              {trolleys.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="blatt-feld">
          <span className="feld-marke">{t.trolleyMitWem}</span>
          <Wahl<MitWem>
            label={t.trolleyMitWem}
            optionen={[
              { wert: 'mit', text: t.trolleyMitPartner },
              { wert: 'gesucht', text: t.trolleyPartnerGesucht },
            ]}
            wert={eingabe.mitPartner ? 'mit' : 'gesucht'}
            onWahl={(wahl) => aendern({ mitPartner: wahl === 'mit' })}
          />
        </div>
        {eingabe.mitPartner && (
          <BlattFeld marke={t.trolleyPartner}>
            <select
              className="feld-wahl"
              value={eingabe.partner ?? ''}
              onChange={(e) => aendern({ partner: e.target.value || null })}
            >
              <option value="">{t.trolleyPartnerWaehlen}</option>
              {moeglichePartner(state.persons, ich?.id, state.lang).map((p) => (
                <option key={p.id} value={p.id}>
                  {personLabel(p)}
                </option>
              ))}
            </select>
          </BlattFeld>
        )}
        {meldung ? (
          <p className="feld-fehler" role="alert" dir="auto">
            {meldung}
          </p>
        ) : (
          hinweis && (
            <p className="klein-text" dir="auto">
              {hinweis}
            </p>
          )
        )}
      </div>
      <div className="sheet-fuss-ende">
        {onAbbrechen && (
          <button type="button" className="knopf-leise" onClick={onAbbrechen}>
            {t.abbrechen}
          </button>
        )}
        {/* Gesperrt, ohne den Fokus abzugeben: Er wird es auch unter dem Tipp,
            solange die Antwort aussteht. */}
        <GesperrterKnopf
          className="knopf-haupt"
          gesperrt={Boolean(hindernis) || ohnePartner || aktion.laeuft}
          onTipp={() => void absenden()}
        >
          {t.trolleyEintragen}
        </GesperrterKnopf>
      </div>
    </>
  )
}
