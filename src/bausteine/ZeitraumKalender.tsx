import { useState } from 'react'
import { datumsFormat } from '../components/datum-anzeige'
import {
  imMonat,
  imZeitraum,
  monatPlus,
  monatsRaster,
  monatVon,
  wochentagKuerzel,
  zeitraumTippen,
  type Monat,
  type ZeitraumEnde,
} from '../components/kalender'
import { fromIso, isoDay } from '../data/meeting-dates'
import type { Lang } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import { Zeichen } from './Zeichen'
import './bausteine.css'

/** Ganze Klassennamen, damit eine Textsuche sie findet (`tests/css-klassen.test.ts`). */
function tagKlasse(tag: string, von: string, bis: string, monat: Monat, heute: string): string {
  const k = ['kal-tag']
  if (!imMonat(tag, monat)) k.push('is-fremd')
  if (tag === heute) k.push('is-heute')
  if (imZeitraum(tag, von, bis)) {
    k.push('is-drin')
    if (tag === von) k.push('is-anfang')
    if (tag === bis) k.push('is-ende')
  }
  return k.join(' ')
}

/**
 * **Ein Zeitraum im Kalender** (T121): oben „Von" und „Bis", darunter der
 * Monat. Ein Tipp setzt das Ende, das gerade hervorgehoben ist; der gewählte
 * Zeitraum steht als Band in Minze. Für Abwesenheiten und den Zeitraum eines
 * Weiteren Plans.
 *
 * `start` sagt, welches Ende zuerst hervorgehoben ist; bei „Bis" steht der
 * Kalender auf dessen Monat — wer beim Plan auf „Bis" tippt, setzt das Ende.
 * Ohne Angabe ist es „Bis", sobald es einen Anfang gibt, und der Monat des
 * Anfangs.
 */
export function ZeitraumKalender({
  von,
  bis,
  lang,
  onWahl,
  start,
}: {
  von: string
  bis: string
  lang: Lang
  onWahl: (von: string, bis: string) => void
  start?: ZeitraumEnde
}) {
  const { t } = useT()
  const [ende, setEnde] = useState<ZeitraumEnde>(start ?? (von ? 'bis' : 'von'))
  const [monat, setMonat] = useState<Monat>(() => monatVon(start === 'bis' && bis ? bis : von))
  const locale = LOCALES[lang] ?? lang
  const tagLang = datumsFormat(lang, 'tag')
  const tagKurz = datumsFormat(lang, 'kurzerWochentag')
  const heute = isoDay(new Date())

  const tippen = (tag: string) => {
    const neu = zeitraumTippen({ von, bis, ende }, tag)
    setEnde(neu.ende)
    onWahl(neu.von, neu.bis)
  }

  const endeKnopf = (welches: ZeitraumEnde, beschriftung: string, wert: string) => (
    <button
      type="button"
      className="kal-ende"
      aria-pressed={ende === welches}
      onClick={() => {
        setEnde(welches)
        if (wert) setMonat(monatVon(wert))
      }}
    >
      <span className="klein-text">{beschriftung}</span>
      <span className="kal-ende-wert">{wert ? tagKurz.format(fromIso(wert)) : '–'}</span>
    </button>
  )

  return (
    <div className="kal">
      <div className="kal-enden">
        {endeKnopf('von', t.von, von)}
        {endeKnopf('bis', t.bis, bis)}
      </div>
      <div className="kal-kopf">
        <button type="button" className="kal-blaettern" aria-label={t.a11yPrevMonth} onClick={() => setMonat(monatPlus(monat, -1))}>
          <Zeichen name="zurueck" />
        </button>
        <span className="kal-monat">{datumsFormat(lang, 'monatJahr').format(new Date(monat.y, monat.m, 15))}</span>
        <button type="button" className="kal-blaettern" aria-label={t.a11yNextMonth} onClick={() => setMonat(monatPlus(monat, 1))}>
          <Zeichen name="weiter" />
        </button>
      </div>
      <div className="kal-wochentage" aria-hidden="true">
        {wochentagKuerzel(locale).map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="kal-raster">
        {monatsRaster(monat).map((tag) => (
          <button
            key={tag}
            type="button"
            className={tagKlasse(tag, von, bis, monat, heute)}
            aria-label={tagLang.format(fromIso(tag))}
            aria-pressed={imZeitraum(tag, von, bis)}
            onClick={() => tippen(tag)}
          >
            {Number(tag.slice(8))}
          </button>
        ))}
      </div>
    </div>
  )
}
