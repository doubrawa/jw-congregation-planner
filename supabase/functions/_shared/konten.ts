// =============================================================================
// Geteilt: das Konto einer eingeteilten Person — und die Push-Abos je Konto
// =============================================================================
// Drei Functions schicken Nachrichten an eingeteilte Personen (`send-plan`,
// `send-reminders`, `substitute`), und jede baute sich dafür dieselben zwei
// Karten: Person → Konto und Konto → Abos. Die Regel dahinter stand dreimal
// wörtlich da, samt der Begründung, warum der Namensweg nur ohne Id gilt —
// und `substitute` kannte den Namensweg gar nicht. Hier steht sie einmal.
// =============================================================================

import { personDisplayName } from './planung.ts'

export interface MitgliedRow {
  user_id: string
  person_id: string | null
}

export interface PersonRow {
  id: string
  fn: string
  ln: string
}

/**
 * Konto einer eingeteilten Person: **Id zuerst, Name nur ohne Id.**
 *
 * Am Namen allein bekämen zwei Gleichnamige gegenseitig die Nachricht des
 * anderen — der eine übt weiter für einen Platz, den er nicht mehr hat, und
 * der andere erschrickt über einen Entzug, den es nie gab.
 *
 * **Der Namensweg gilt nur, wo es keine Id gibt.** Hier stand einmal ein `??`,
 * das ihn auch dann noch nachschob, wenn der Platz eine `pid` trug und die
 * gemeinte Person kein Konto hat. Getroffen wurde damit zwangsläufig ein
 * **anderer**: Wer kein Konto hat, steht in keiner der beiden Karten — ein
 * Treffer über den Namen kann also nur von einem Namensvetter kommen.
 *
 * Der Preis war doppelt. Der Namensvetter bekam eine Nachricht, die ihn
 * nichts angeht (in seiner Aufgabenliste steht sie nicht, der Client
 * entscheidet über die Id). Und der Gemeinte galt als erreicht — er fiel damit
 * aus der Liste, mit der die Planer erfahren, wen sie persönlich ansprechen
 * müssen.
 *
 * `idAufloeser` im Client zieht dieselbe Grenze ausdrücklich: Eine unbekannte
 * Id ergibt `undefined`, nie einen Namenstreffer.
 */
export function kontoAufloeser(
  members: readonly MitgliedRow[],
  persons: readonly PersonRow[],
): (pid: string | undefined, name: string) => string | undefined {
  const personById = new Map(persons.map((p) => [p.id, p]))
  const userByPerson = new Map<string, string>()
  const userByName = new Map<string, string>()
  for (const m of members) {
    const p = m.person_id ? personById.get(m.person_id) : undefined
    if (!p) continue
    userByPerson.set(p.id, m.user_id)
    userByName.set(personDisplayName(p.fn, p.ln), m.user_id)
  }
  return (pid, name) => (pid ? userByPerson.get(pid) : userByName.get(name))
}

/** Push-Abos je Konto — ein Konto kann mehrere Geräte haben. */
export function abosJeKonto<S extends { user_id: string }>(subs: readonly S[]): Map<string, S[]> {
  const out = new Map<string, S[]>()
  for (const s of subs) out.set(s.user_id, [...(out.get(s.user_id) ?? []), s])
  return out
}
