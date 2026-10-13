import { useT } from '../i18n/useT'
import { GesperrterKnopf } from './GesperrterKnopf'
import { Zeichen } from './Zeichen'
import './bausteine.css'

/**
 * **Eine Zahl mit − und +** (T121, Entwurf `GProgrammpunkt`): runde Knöpfe zu
 * beiden Seiten des Werts, in Einerschritten, an den Grenzen gesperrt (ohne den
 * Fokus abzugeben, `GesperrterKnopf`). Jeder Tipp gilt sofort — das Speichern
 * bündelt schnelle Tipps ohnehin (`SAVE_DELAY`). Den Wert liest ein
 * Screenreader nach jedem Tipp neu vor.
 */
export function PlusMinus({
  wert,
  min,
  max,
  label,
  anzeige = String(wert),
  onWert,
}: {
  wert: number
  min: number
  max: number
  /** Was gezählt wird — der Name der Gruppe aus Knöpfen und Wert. */
  label: string
  /** Der Wert, wie er dasteht (mit Einheit, in der Schrift der Sprache). */
  anzeige?: string
  onWert: (wert: number) => void
}) {
  const { t } = useT()
  return (
    <span className="plus-minus" role="group" aria-label={label}>
      <GesperrterKnopf
        className="rund-knopf rund-knopf--feld"
        label={t.a11yDecrease}
        gesperrt={wert <= min}
        onTipp={() => onWert(wert - 1)}
      >
        <Zeichen name="minus" />
      </GesperrterKnopf>
      <span className="plus-minus-wert" aria-live="polite">
        {anzeige}
      </span>
      <GesperrterKnopf
        className="rund-knopf rund-knopf--feld"
        label={t.a11yIncrease}
        gesperrt={wert >= max}
        onTipp={() => onWert(wert + 1)}
      >
        <Zeichen name="plus" />
      </GesperrterKnopf>
    </span>
  )
}
