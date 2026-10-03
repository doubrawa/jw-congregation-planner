import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { vaNachMonat, vaVersammlungText, vaWannText, vaWoText } from '../components/auswaerts-anzeige'
import { DatePicker } from '../components/DatePicker'
import { monatsName } from '../programm/druck'
import { ozKurzTag } from '../components/zeugnis-anzeige'
import { istAbwesendAm } from '../data/absence'
import { VA_BEREICH, vaTaskKey, vaVorbei, type VaKonflikt } from '../data/auswaerts'
import { FS_TIME_OPTIONS } from '../data/fs'
import { displayName, isQualified, personCompare } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { zusageStatus } from '../data/planning'
import { ersteZahl, nurZiffern } from '../data/ziffern'
import { LOCALES } from '../i18n/langs'
import { fill, useT, zuteilungenText, type I18n } from '../i18n/useT'
import type { Person, VortragAuswaerts } from '../data/types'
import { VA_ROLLE } from '../../supabase/functions/_shared/zuteilungen.ts'
import { BannerKopf } from './PlanBanners'
import { AuswaertsSendenPanel } from './PlanSendenPanel'
import { ZUSAGE_LABEL } from './useZusage'
import { ZusageLegende, ZusagePunkt } from './ZusageStatus'
import '../components/auswaerts.css'

/** Die übliche Anfangszeit eines öffentlichen Vortrags — vorgewählt im Formular. */
const ZEIT_VORGABE = '10:00'

/**
 * Was an einem Vortrag nicht aufgeht, als Satz — derselbe im Banner und an der
 * Zeile. Bei der eigenen Zusammenkunft mit dem, was er dort hat.
 */
function konfliktSatz(k: VaKonflikt, i18n: I18n): string {
  if (k.art === 'abwesend') return fill(i18n.t.ozAbwesend, { name: k.name })
  return `${fill(i18n.t.vaKonfliktZusammenkunft, { name: k.name })} · ${zuteilungenText(k.aufgaben, i18n)}`
}

/**
 * **Redner auswärts** beim Planen (T120, Phase 4) — nur für Planer.
 *
 * Oben, was der Plan bewirkt, darunter die Konflikte und die Vorträge Monat
 * für Monat: Tag und Uhrzeit, Versammlung und Nummer, der Redner und seine
 * Zusage. Unten ein neuer Vortrag und „Plan senden".
 *
 * Geprüft wird in beide Richtungen: Hier steht, wer an dem Tag abwesend oder
 * in der eigenen Zusammenkunft eingeteilt ist; dort meldet das Konflikt-Banner
 * der Zusammenkunft, wer an dem Tag auswärts spricht, und die Auto-Zuteilung
 * lässt ihn aus (`nichtVerfuegbar`).
 */
export function AuswaertsPlan({ konflikte }: { konflikte: readonly VaKonflikt[] }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const heute = fromIso(useKalendertag())

  // Zur Wahl steht, wer Vorträge hält — dieselbe Menge wie am Vortragsplatz.
  const kandidaten = useMemo(
    () =>
      state.persons
        .filter((p) => isQualified(p, VA_BEREICH))
        .sort((a, b) => personCompare(a, b, state.lang)),
    [state.persons, state.lang],
  )
  const konfliktVon = new Map(konflikte.map((k) => [k.vortrag.id, k]))

  return (
    <>
      <div className="panel panel--pb16" data-farbe="neutral">
        <h2 className="panel-label">{t.vaTitel}</h2>
        <p className="panel-hint">{t.vaHinweis}</p>
      </div>
      <ZusageLegende />

      {konflikte.length > 0 && (
        <div className="plan-banner-box plan-conflicts">
          <BannerKopf zeichen="!" titel={t.konflikteTitle} anzahl={konflikte.length} />
          {konflikte.map((k) => (
            <div key={k.vortrag.id} className="plan-conflict-row">
              <span className="plan-conflict-dot" data-kind={k.art === 'abwesend' ? 'absent' : 'auswaerts'} />
              <span className="plan-conflict-text" dir="auto">
                {[ozKurzTag(k.vortrag.datum, state.lang), vaVersammlungText(k.vortrag, tu), konfliktSatz(k, i18n)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {state.auswaerts.length === 0 && (
        <div className="panel panel--lead panel--pb16" data-farbe="petrol">
          <p className="prog-meta">{t.vaLeer}</p>
        </div>
      )}

      {vaNachMonat(state.auswaerts).map(({ monat, vortraege }) => (
        <div key={monat} className="panel" data-farbe="petrol">
          <h2 className="panel-label">{monatsName(monat, state.lang)}</h2>
          {vortraege.map((v) => (
            <VortragZeile key={v.id} vortrag={v} kandidaten={kandidaten} konflikt={konfliktVon.get(v.id)} heute={heute} />
          ))}
        </div>
      ))}

      <NeuerVortrag kandidaten={kandidaten} />
      <AuswaertsSendenPanel />
    </>
  )
}

/**
 * Ein Vortrag: wann und wo, der Redner mit seiner Zusage, und was nicht aufgeht.
 * Den Tag reicht die Liste herein, wie bei den Schichten des Zeugnisgebens.
 */
function VortragZeile({
  vortrag,
  kandidaten,
  konflikt,
  heute,
}: {
  vortrag: VortragAuswaerts
  kandidaten: readonly Person[]
  konflikt: VaKonflikt | undefined
  heute: Date
}) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const vorbei = vaVorbei(vortrag, heute)
  const redner = vortrag.pid ? state.persons.find((p) => p.id === vortrag.pid) : undefined
  // Zur Wahl: wer an dem Tag nicht abwesend ist. Der eingesetzte Redner bleibt
  // stehen, auch wenn er inzwischen fehlt oder keine Vorträge mehr hält — sonst
  // zeigte das Feld „zuteilen", als wäre keiner da.
  const amTag = fromIso(vortrag.datum)
  const frei = kandidaten.filter((p) => !istAbwesendAm(state.absences, p.id, amTag))
  const wahl = redner && !frei.includes(redner) ? [...frei, redner] : frei
  const zusage = redner && !vorbei ? zusageStatus(state.confirmations, vaTaskKey(vortrag)) : null

  return (
    <div className={vorbei ? 'va-zeile is-vorbei' : 'va-zeile'}>
      <div className="va-kopf">
        <span className="va-wann">{vaWannText(vortrag, state.lang)}</span>
        {vorbei ? (
          <span className="va-marke">{t.gbVorbei}</span>
        ) : (
          <button
            type="button"
            className="fs-remove"
            aria-label={t.a11yRemove}
            onClick={() => dispatch({ type: 'vaRemove', id: vortrag.id })}
          >
            ✕
          </button>
        )}
      </div>
      <div className="va-wo" dir="auto">
        {vaWoText(vortrag, t, tu)}
      </div>
      <div className="va-redner-zeile">
        {vorbei ? (
          <span className="va-name">{redner ? displayName(redner) : t.offenWort}</span>
        ) : (
          <select
            className={konflikt ? 'fs-select is-konflikt' : 'fs-select'}
            value={vortrag.pid ?? ''}
            aria-label={tu(VA_ROLLE)}
            onChange={(e) => dispatch({ type: 'vaRedner', id: vortrag.id, pid: e.target.value || null })}
          >
            <option value="">{t.zuteilenChip}</option>
            {wahl.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </select>
        )}
        {zusage && (
          <span className="va-zusage">
            <ZusagePunkt stufe={zusage} />
            {t[ZUSAGE_LABEL[zusage]]}
          </span>
        )}
      </div>
      {/* Ohne dir="auto": Der Satz gehört der Sprache der Oberfläche. Begänne
          die Erkennung beim Namen, stünde ein arabischer Satz von links nach
          rechts, nur weil der Name lateinisch geschrieben ist. */}
      {konflikt && !vorbei && <p className="va-problem">{konfliktSatz(konflikt, i18n)}</p>}
    </div>
  )
}

/**
 * Ein neuer Vortrag: Tag, Uhrzeit, Versammlung, Nummer und Redner. Der Redner
 * darf fehlen — oft steht der Termin fest, bevor jemand zugesagt hat.
 */
function NeuerVortrag({ kandidaten }: { kandidaten: readonly Person[] }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const [datum, setDatum] = useState('')
  const [zeit, setZeit] = useState(ZEIT_VORGABE)
  const [versammlung, setVersammlung] = useState('')
  const [nummer, setNummer] = useState('')
  const [pid, setPid] = useState('')

  // Die Nummer einer Gliederung: 1 bis 999, wie die Datenbank sie zulässt.
  const nr = ersteZahl(nummer)
  const gueltigeNummer = nr !== null && nr >= 1 && nr <= 999 ? nr : null
  const bereit = datum !== '' && versammlung.trim() !== ''

  const hinzufuegen = (): void => {
    if (!bereit) return
    dispatch({
      type: 'vaAdd',
      vortrag: { datum, zeit, versammlung: versammlung.trim(), nummer: gueltigeNummer, pid: pid || null },
    })
    setDatum('')
    setVersammlung('')
    setNummer('')
    setPid('')
  }

  return (
    <div className="panel panel--pb16 fs-add" data-farbe="neutral2">
      <h2 className="panel-label">{t.vaHinzufuegen}</h2>
      <div className="va-form">
        <div className="va-datum">
          <DatePicker
            value={datum}
            onChange={setDatum}
            locale={LOCALES[state.lang]}
            min={tag}
            placeholder={t.datumPh}
            ariaLabel={t.datumPh}
            prevLabel={t.a11yPrevMonth}
            nextLabel={t.a11yNextMonth}
          />
        </div>
        <select
          className="fs-select fs-select--time"
          value={zeit}
          aria-label={t.a11yTime}
          onChange={(e) => setZeit(e.target.value)}
        >
          {FS_TIME_OPTIONS.map((tm) => (
            <option key={tm} value={tm}>
              {tm}
            </option>
          ))}
        </select>
        <input
          className="fsr-input va-versammlung"
          type="text"
          dir="auto"
          value={versammlung}
          placeholder={t.versammlungLbl}
          aria-label={t.versammlungLbl}
          onChange={(e) => setVersammlung(e.target.value)}
        />
        <input
          className="fsr-input va-nummer"
          type="text"
          inputMode="numeric"
          value={nummer}
          placeholder={t.vaNummerLbl}
          aria-label={t.vaNummerLbl}
          onChange={(e) => setNummer(nurZiffern(e.target.value).slice(0, 3))}
        />
        <select
          className="fs-select va-redner-wahl"
          value={pid}
          aria-label={tu(VA_ROLLE)}
          onChange={(e) => setPid(e.target.value)}
        >
          <option value="">{t.zuteilenChip}</option>
          {kandidaten.map((p) => (
            <option key={p.id} value={p.id}>
              {displayName(p)}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="fs-add-btn" disabled={!bereit} onClick={hinzufuegen}>
        {t.hinzufuegen}
      </button>
    </div>
  )
}
