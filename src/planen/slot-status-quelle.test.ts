import { describe, expect, it } from 'vitest'

/**
 * Kein Bestätigungs-Zeichen, wo es nichts zu bestätigen gibt.
 *
 * `SlotChip` hängt an einen belegten Platz ein `✓` (bestätigt) oder ein `…`
 * (ausstehend). Beides setzt voraus, dass überhaupt jemand bestätigen **kann** —
 * eine Person der Versammlung mit Konto. Genau das trifft auf drei Sorten
 * Platzhalter nicht zu:
 *
 * | Sorte | Warum kein Flow |
 * | --- | --- |
 * | Gruppen-Rotation („Gruppe 2") | keine Person |
 * | Gastredner, Kreisaufseher (`SKIP_ROLE`) | nicht in dieser Versammlung |
 * | Freitext-Treffpunktleiter (T63, `lext`) | dito |
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
 * dem Vorbild von `aufgaben-label-quelle.test.ts`: Jede `showStatus`-Angabe
 * steht hier namentlich, mitsamt Begründung. Wer eine ändert oder einen
 * `SlotChip` hinzufügt, wird rot und muss sich entscheiden — das ist der
 * ganze Zweck.
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
 * Erwartete `showStatus`-Angabe je Aufrufer — Leerraum normiert.
 *
 * Nur **ein** Eintrag darf unbedingt sein, und er ist begründet: Der Ratgeber
 * der Zusätzlichen Klasse ist immer ein Bruder der eigenen Versammlung. Es gibt
 * dort keinen Freitext und keine Gruppe, also auch nichts auszunehmen.
 */
const ERWARTET: Record<string, string> = {
  'planen/AuxCounselorPanel.tsx': 'Boolean(slot.name)',
  'planen/FsPlan.tsx': 'Boolean(inst.leader) && !inst.lext',
  'planen/HelpersPanel.tsx': 'Boolean(name) && !isGroup',
  'planen/MeetingSection.tsx': 'Boolean(slot.name) && !isGuestRole(slot.rolle)',
}

/**
 * `showStatus={…}` aus einer Datei ziehen (eine Angabe je Aufrufer).
 *
 * Klammern werden **gezählt**, nicht per Ausdruck gesucht: Ein `[^}]*` hört
 * beim ersten `}` auf und verschluckt bei geschachtelten Klammern den halben
 * Rest der Datei — genau das tat die erste Fassung hier.
 */
function showStatusVon(text: string): string[] {
  const out: string[] = []
  const marke = 'showStatus={'
  for (let i = text.indexOf(marke); i >= 0; i = text.indexOf(marke, i + 1)) {
    let tiefe = 1
    let j = i + marke.length
    for (; j < text.length && tiefe > 0; j++) {
      if (text[j] === '{') tiefe++
      else if (text[j] === '}') tiefe--
    }
    out.push(
      text
        .slice(i + marke.length, j - 1)
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }
  return out
}

describe('Bestätigungs-Zeichen nur, wo jemand bestätigen kann', () => {
  const aufrufer = [...QUELLEN]
    .filter(([pfad]) => !/\.test\.tsx$/.test(pfad))
    .filter(([, text]) => /<SlotChip\b/.test(text))
    .map(([pfad]) => pfad)
    .sort()

  it('die Aufrufer von SlotChip sind genau die bekannten vier', () => {
    // Kommt ein fünfter hinzu, fällt er hier auf — und muss unten begründet
    // werden, statt die Marke stillschweigend mitzunehmen.
    expect(aufrufer).toEqual(Object.keys(ERWARTET).sort())
  })

  it('jeder nimmt aus, was keinen Flow hat', () => {
    for (const pfad of aufrufer) {
      const angaben = showStatusVon(QUELLEN.get(pfad) ?? '')
      expect(angaben, `${pfad}: genau eine showStatus-Angabe erwartet`).toHaveLength(1)
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
