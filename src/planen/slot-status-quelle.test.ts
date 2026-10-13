import { describe, expect, it } from 'vitest'

/**
 * Kein Ampel-Punkt, wo es nichts zu bestätigen gibt.
 *
 * `PlatzZeile` (T121) zeigt die Lage eines Platzes — blass „wartet", rot
 * abgesagt; bis T121 hing `SlotChip` dafür einen Ampel-Punkt an. Das setzt
 * voraus, dass überhaupt jemand bestätigen **kann** — eine Person der Versammlung mit Konto,
 * für einen Termin, der stattfindet. Genau das trifft auf vier Fälle nicht zu:
 *
 * | Fall | Warum kein Flow |
 * | --- | --- |
 * | Gruppen-Rotation („Gruppe 2") | keine Person |
 * | Gastredner, Kreisaufseher (`SKIP_ROLE`) | nicht in dieser Versammlung |
 * | Freitext-Treffpunktleiter (T63, `lext`) | dito |
 * | ausgefallene Zusammenkunft (T30, `zusage.moeglich`) | keine Aufgabe, nichts zu bestätigen |
 *
 * Der vierte kam am 15. September 2026 dazu: Der Planen-Screen zeigt auch eine
 * ausgefallene Zusammenkunft mit allen Namen, und dort stand jeder Punkt für
 * immer auf Gelb.
 *
 * **Diese Regel ist zweimal vergessen worden**, und zwar nicht aus Nachlässig-
 * keit: `HelpersPanel` führt sie seit jeher richtig, aber sie steht dort als
 * gewöhnlicher Ausdruck mitten in einer Eigenschaft — sichtbar nur, wer genau
 * diese Datei liest. T29 baute daneben den Gastredner und übernahm sie nicht;
 * T63 hätte beim Freitext-Leiter denselben Weg genommen, wäre es beim
 * Nachstellen im Browser nicht aufgefallen.
 *
 * Ein Verhaltenstest hilft hier wenig: Die Bedienoberflächen sind kaum
 * abgedeckt (MeetingSection 0 %, FsPlan 1,5 %), und ein neuer Aufrufer wäre
 * genau der, an den niemand denkt. Deshalb eine Probe am **Quelltext**, nach
 * dem Vorbild von `aufgaben-label-quelle.test.ts`: Jede Angabe steht hier
 * namentlich, mitsamt Begründung. Wer eine ändert oder eine `PlatzZeile`
 * hinzufügt, wird rot und muss sich entscheiden — das ist
 * der ganze Zweck.
 *
 * Die Angabe ist die Bedingung, unter der es einen Stand der Zusage gibt
 * (`const stand = … ? … : null`). Ohne Stand ist ein besetzter Platz voll —
 * mit einem stünde der Gastredner für immer auf „wartet". Bei den Treffpunkten
 * steht sie in `leiterAnzeige` (`platz-anzeige.ts`, geprüft in
 * `platz-anzeige.test.ts`): Einen Stand hat nur ein Leiter, der eine Person
 * ist — kein Freitext (`fsLeiterZuteilung`). Der Plan muss sie nur aufrufen.
 */

/** Quelltext aller Dateien unter `src/` — über Vite, ohne Node-Abhängigkeit. */
const ROH = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Auf `verzeichnis/datei.tsx` normiert (Vite kürzt Nachbardateien auf `./`). */
const HIER = 'planen/'
const QUELLEN = new Map(
  Object.entries(ROH).map(([pfad, text]) => [
    pfad.startsWith('./') ? HIER + pfad.slice(2) : pfad.replace(/^(\.\.\/)+/, ''),
    text,
  ]),
)

/**
 * Erwartete Angabe je Aufrufer — Leerraum normiert.
 *
 * Der Ratgeber der Zusätzlichen Klasse ist immer ein Bruder der eigenen
 * Versammlung: Freitext und Gruppe gibt es dort nicht, nur den Ausfall.
 * Treffpunkte hängen an keiner Zusammenkunft — deren Ausfall
 * (`istAusgefallen`) betrifft sie im Datenmodell nicht, und `deriveMyFsTasks`
 * fragt ihn ebenso wenig.
 */
const ERWARTET: Record<string, string> = {
  'planen/AuxCounselorPanel.tsx': "slot.name && zusage.moeglich('mid')",
  'planen/FsPlan.tsx': 'leiterAnzeige',
  'planen/HelpersPanel.tsx': 'name && !gruppe && zusage.moeglich(tab)',
  'planen/MeetingSection.tsx': 'slot.name && !isGuestRole(slot.rolle) && zusage.moeglich(tab)',
}

/** Der Plan der Treffpunkte überlässt die Bedingung `leiterAnzeige` — hier nur, ob er sie ruft. */
function leiterVon(text: string): string[] {
  return text.includes('{...leiterAnzeige(') ? ['leiterAnzeige'] : []
}

/**
 * Die Bedingung jedes `const stand = … ? … : null` — bis zum ersten
 * freistehenden `?`. Ein `?.` gehört nicht dazu: Es steht ohne Leerraum davor.
 */
function standVon(text: string): string[] {
  const out: string[] = []
  const marke = 'const stand ='
  for (let i = text.indexOf(marke); i >= 0; i = text.indexOf(marke, i + 1)) {
    const rest = text.slice(i + marke.length).replace(/\s+/g, ' ')
    const ende = rest.indexOf(' ? ')
    out.push(ende < 0 ? rest.trim() : rest.slice(0, ende).trim())
  }
  return out
}

describe('Bestätigungs-Zeichen nur, wo jemand bestätigen kann', () => {
  const aufrufer = [...QUELLEN]
    .filter(([pfad]) => !/\.test\.tsx$/.test(pfad))
    .filter(([, text]) => /<PlatzZeile\b/.test(text))
    .map(([pfad]) => pfad)
    .sort()

  it('die Aufrufer von PlatzZeile sind genau die bekannten vier', () => {
    // Kommt ein fünfter hinzu, fällt er hier auf — und muss unten begründet
    // werden, statt die Marke stillschweigend mitzunehmen.
    expect(aufrufer).toEqual(Object.keys(ERWARTET).sort())
  })

  it('jeder nimmt aus, was keinen Flow hat', () => {
    for (const pfad of aufrufer) {
      const text = QUELLEN.get(pfad) ?? ''
      const angaben = [...standVon(text), ...leiterVon(text)]
      expect(angaben, `${pfad}: genau eine Angabe erwartet`).toHaveLength(1)
      expect(angaben[0], pfad).toBe(ERWARTET[pfad])
    }
  })

  it('`isGuestRole` ist die Quelle für „nicht aus dieser Versammlung"', () => {
    // Der Gastredner-Fall darf nicht am Wort hängen: `SKIP_ROLE` führt neben
    // „Gastredner" auch „Kreisaufseher" (T62), und beide sollen dieselbe
    // Behandlung bekommen. Ein `rolle === 'Gastredner'` hier wäre stiller
    // Rückschritt.
    expect(QUELLEN.get('planen/MeetingSection.tsx')).toContain('isGuestRole')
  })
})
