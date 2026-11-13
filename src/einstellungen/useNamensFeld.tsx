import { type ReactNode, useId, useState } from 'react'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { useUebernehmen } from '../components/useUebernehmen'
import { fill, useT } from '../i18n/useT'
import { doppelterName } from './einstellungen-anzeige'

/** Was ein Blatt von seinem Namensfeld braucht. */
interface NamensFeld {
  /** Das Feld „Name" — darunter der Hinweis, wenn der getippte Name nicht geht. */
  feld: ReactNode
  /** Mit dem Schließen des Blatts: den Namen übernehmen (`useUebernehmen`). */
  uebernehmen: () => void
  /** Vor dem Entfernen aus dem Blatt: Der getippte Name geht mit (`useUebernehmen`). */
  verwerfen: () => () => void
}

/**
 * **Das Feld „Name" eines Blatts, dessen Name beim Schließen gilt** — bei der
 * Gruppe und beim Hilfsdienst dasselbe. Bis zum 13.11.2026 stand es nur im
 * Blatt der Gruppe; mit dem Umbenennen der Hilfsdienste wäre es eine Abschrift
 * geworden.
 *
 * - **Beim Schließen**, nicht beim Tippen — auch, wenn das Blatt einfach
 *   verschwindet (`useUebernehmen`): Ein halb getippter Name stünde sonst schon
 *   in den Plänen.
 * - **Leer oder schon vergeben** bleibt der alte, und ein Hinweis sagt warum —
 *   am Feld schon beim Tippen, beim Schließen als Meldung.
 * - **Im Feld steht der Name, wie man ihn liest** (`tu`); wer ihn nicht
 *   anfasst, lässt den kanonischen stehen — „Gruppe 1" und „Mikrofone" bleiben
 *   übersetzbar.
 * - **Nur wer ihn angefasst hat, benennt um** (`beimOeffnen`): Lädt die App
 *   nach, während das Blatt offen ist, und ein anderer Admin hat inzwischen
 *   umbenannt, schriebe ein Vergleich mit dem heutigen Namen den alten beim
 *   Schließen zurück.
 *
 * `alle` sind die Einträge, unter denen der Name eindeutig sein muss — der
 * eigene eingeschlossen (`doppelterName` nimmt ihn aus).
 */
export function useNamensFeld<T extends { id: string; name: string }>(
  eintrag: T,
  alle: readonly T[],
  onName: (name: string) => void,
): NamensFeld {
  const { dispatch } = useApp()
  const { t, tu } = useT()
  const gelesen = tu(eintrag.name)
  const [beimOeffnen] = useState(gelesen)
  const [name, setName] = useState(gelesen)
  const fehlerId = useId()

  const dublette = doppelterName(alle, eintrag.id, name, tu)
  // Was beim Schließen statt des neuen Namens gilt — und schon am Feld steht.
  const fehler = name.trim() === '' ? t.toastNameLeer : dublette ? fill(t.toastNameNichtGeaendert, { name: tu(dublette.name) }) : null

  const blatt = useUebernehmen(() => {
    const neu = name.trim()
    if (neu === beimOeffnen || neu === gelesen) return
    if (fehler) dispatch({ type: 'showToast', text: fehler })
    else onName(neu)
  })

  const feld = (
    <>
      <BlattFeld marke={t.nameLbl}>
        <input
          className="feld"
          type="text"
          dir="auto"
          autoComplete="off"
          value={name}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={fehler ? fehlerId : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </BlattFeld>
      {fehler && (
        /* `dir="auto"`: Der Hinweis nennt den Namen des anderen Eintrags — frei getippt. */
        <p id={fehlerId} className="feld-fehler" role="alert" dir="auto">
          {fehler}
        </p>
      )}
    </>
  )
  return { feld, ...blatt }
}
