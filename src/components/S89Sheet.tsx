import { useAppDispatch } from '../app/context'
import { S89Karte } from './S89Karte'
import { Sheet } from './Sheet'
import { useT } from '../i18n/useT'
import type { S89Payload } from '../data/types'

/**
 * Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“).
 * Bottom-Sheet mobil / zentriertes Modal desktop; liegt über dem
 * Zuteilungs-Sheet. Geöffnet aus Meine Aufgaben und dem Zuteilungs-Sheet.
 */
export function S89Sheet({ payload }: { payload: S89Payload }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  return (
    <Sheet
      variante="s89"
      label={t.s89Title}
      title={t.s89Title}
      eyebrow={<div className="s89-eyebrow">S-89</div>}
      onClose={() => dispatch({ type: 'closeS89' })}
    >
      <S89Karte payload={payload} />
    </Sheet>
  )
}
