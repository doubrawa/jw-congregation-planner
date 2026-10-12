import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'

/**
 * **Der Druckknopf** (T121): am Handy das Drucker-Zeichen allein, ab dem
 * Tablet mit Wort (`mitText`). Derselbe für die Wahl Woche oder Monat
 * (`DruckWahl`) und für die Pläne ohne Woche (`AnsichtDrucken`) — und weil
 * beide `druck-knopf` tragen, blendet der Ausdruck beide aus.
 */
export function DruckKnopf({ mitText, onClick }: { mitText: boolean; onClick: () => void }) {
  const { t } = useT()
  return mitText ? (
    <button type="button" className="knopf-umriss druck-knopf druck-knopf--text" onClick={onClick}>
      <Zeichen name="drucken" />
      {t.drucken}
    </button>
  ) : (
    <button type="button" className="rund-knopf druck-knopf" aria-label={t.drucken} onClick={onClick}>
      <Zeichen name="drucken" />
    </button>
  )
}
