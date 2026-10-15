import { useAppDispatch } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { S89Druck } from '../druck/S89Druck'
import { useDruckBogen } from '../druck/useDruckBogen'
import { useT } from '../i18n/useT'
import type { S89Payload } from '../data/types'
import { S89Karte } from './S89Karte'
import { Sheet } from './Sheet'
import { TABLET_BREITE, useMedia } from './useMedia'

/**
 * Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“).
 * Blatt von unten am Handy, Fenster am Schreibtisch; liegt über dem
 * Zuteilungs-Blatt und der eigenen Aufgabe, aus denen es geöffnet wird.
 *
 * Ab dem Tablet steht darunter „Diesen Zettel drucken" (T121, Phase 9;
 * Entwurf `GDesktopAufgaben`): derselbe Bogen wie im Planen (`S89Druck`), mit
 * nur diesem einen Zettel. Am Handy druckt kaum jemand.
 */
export function S89Sheet({ payload }: { payload: S89Payload }) {
  const dispatch = useAppDispatch()
  const { t, tp } = useT()
  const breit = useMedia(TABLET_BREITE)
  const { drucken, bogen } = useDruckBogen()
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
        {breit && (
          <button
            type="button"
            className="verweis-leise s89-drucken"
            onClick={() => drucken(<S89Druck zettel={[payload]} datum={tp(payload.date)} />)}
          >
            <Zeichen name="drucken" />
            {t.s89DieserZettel}
          </button>
        )}
      </div>
      {bogen}
    </Sheet>
  )
}
