import { useAppDispatch } from '../app/context'
import { S89Karte } from './S89Karte'
import { Sheet } from './Sheet'
import { useT } from '../i18n/useT'
import type { S89Payload } from '../data/types'

/**
 * Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“).
 * Blatt von unten am Handy, Fenster am Schreibtisch; liegt über dem
 * Zuteilungs-Blatt und der eigenen Aufgabe, aus denen es geöffnet wird.
 */
export function S89Sheet({ payload }: { payload: S89Payload }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  return (
    <Sheet
      variante="oben"
      label={t.s89Title}
      title={t.s89Title}
      eyebrow={<div className="s89-eyebrow">S-89</div>}
      onClose={() => dispatch({ type: 'closeS89' })}
    >
      <div className="sheet-inhalt">
        <S89Karte payload={payload} />
      </div>
    </Sheet>
  )
}
