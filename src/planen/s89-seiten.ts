import type { S89Payload } from '../data/types'

/**
 * Zettel in Blätter und Blätter in Reihen zu zweit — die Aufteilung steht im
 * Bauplan, nicht im Ermessen des Browsers (T71).
 *
 * **Gemessen, nicht gemutmaßt:** Chrome brach den Bogen über die Seitengrenze
 * an Stellen um, die sich nicht vorhersagen ließen — aus „6 je Seite" wurden
 * stillschweigend 4. Wer 6 einstellt und 4 bekommt, hält die Einstellung für
 * kaputt. Also je Blatt eine eigene Tabelle mit erzwungenem Umbruch dahinter:
 * Was auf dem Blatt landet, entscheidet diese Funktion — nachrechenbar und
 * geprüft.
 *
 * Eigene Datei, nicht neben der Komponente: Sonst verliert das schnelle
 * Nachladen im Entwicklungsbetrieb seinen Halt (eine Datei, ein Baustein).
 */
export function seiten(
  zettel: S89Payload[],
  proSeite: number,
): Array<Array<Array<S89Payload | undefined>>> {
  const alle: Array<Array<Array<S89Payload | undefined>>> = []
  for (let s = 0; s < zettel.length; s += proSeite) {
    const seite = zettel.slice(s, s + proSeite)
    const reihen: Array<Array<S89Payload | undefined>> = []
    for (let i = 0; i < seite.length; i += 2) reihen.push([seite[i], seite[i + 1]])
    alle.push(reihen)
  }
  return alle
}
