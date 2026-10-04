import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Wer löscht, fragt vorher** (4.10.2026): „Generell soll beim Löschen in der
 * App vorher gefragt werden."
 *
 * Bis dahin fragten Abwesenheit, Person, Gruppe, Plan, Mitteilungen und jedes
 * „Leeren" nach — zwölf ✕ daneben nicht: Gruppenbesuch, Zeugnis-Termin und
 * -Eintrag, Treffpunkt, Grundplan-Regel, Programmpunkt, weiterer Termin,
 * Dienst, Programmsprache, Konto, Einladung, Familie. Jedes war für sich
 * gebaut, und das nächste wäre es wieder gewesen.
 *
 * Geprüft wird deshalb am Quelltext, nicht an einer Liste der Knöpfe — die
 * müsste jeder neue Knopf selbst um sich ergänzen:
 *
 *  1. **Kein ✕ mit fester Beschriftung „Entfernen".** Ein Knopf mit Rückfrage
 *     nennt sich nur ungeschärft so (`armed ? undefined : t.a11yRemove`) —
 *     geschärft spricht sein Text („Wirklich löschen?"). Steht die
 *     Beschriftung fest da, entfernt der Knopf beim ersten Tipp. Schließen-✕
 *     heißen `a11yClose` und bleiben unberührt.
 *  2. **Keine Lösch-Aktion unmittelbar im Klick.** `onClick={() =>
 *     dispatch({ type: 'removeX' })}` ist genau die Form, die es nicht mehr
 *     geben soll. Lösch-Aktionen erkennt die Probe am Namen — die Aktionen
 *     dieser App heißen so (`remove…`, `…Remove`, `…Entfernen`, `…Loeschen`,
 *     `…Austragen`, `clear…`, `…Leeren`).
 */

const WURZEL = fileURLToPath(new URL('../', import.meta.url))

/** Jede Bausteindatei unter `src/`, ohne Tests. */
function bausteine(): string[] {
  const out: string[] = []
  const gehe = (rel: string): void => {
    for (const eintrag of readdirSync(join(WURZEL, rel))) {
      const pfad = `${rel}/${eintrag}`
      if (statSync(join(WURZEL, pfad)).isDirectory()) gehe(pfad)
      else if (eintrag.endsWith('.tsx') && !eintrag.includes('.test.')) out.push(pfad)
    }
  }
  gehe('src')
  return out
}

/** Kommentare weg — dort darf von „aria-label={t.a11yRemove}" erzählt werden. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '')
}

const FESTE_BESCHRIFTUNG = /aria-label=\{t\.a11yRemove\}/g
const LOESCHEN_IM_KLICK = /onClick=\{\(\) =>\s*dispatch\(\{\s*type: '(\w+)'/g
const LOESCH_AKTION = /^(remove|clear)|Remove$|Entfernen$|Loeschen$|Austragen$|Leeren$/

/** Die Treffer eines Musters je Datei: `datei: Treffer`. */
function treffer(muster: RegExp, auswahl: (m: RegExpMatchArray) => boolean = () => true): string[] {
  const out: string[] = []
  for (const datei of bausteine()) {
    const text = ohneKommentare(readFileSync(join(WURZEL, datei), 'utf8'))
    for (const m of text.matchAll(muster)) if (auswahl(m)) out.push(`${datei}: ${m[0].replace(/\s+/g, ' ')}`)
  }
  return out
}

describe('Wer löscht, fragt vorher', () => {
  it('die Proben greifen überhaupt', () => {
    // Gegenprobe: Ein Knopf von vor dem 4.10.2026 fiele unter beide Muster.
    const alt = `<button aria-label={t.a11yRemove} onClick={() => dispatch({ type: 'besuchEntfernen', id })}>✕</button>`
    expect(alt.match(FESTE_BESCHRIFTUNG)).toHaveLength(1)
    const klick = [...alt.matchAll(LOESCHEN_IM_KLICK)].map((m) => m[1])
    expect(klick).toEqual(['besuchEntfernen'])
    expect(klick.every((a) => LOESCH_AKTION.test(a!))).toBe(true)
    // Und die Namen der Aktionen ohne Löschen fallen nicht darunter.
    for (const a of ['assign', 'ozZuteilen', 'besuchHinzufuegen', 'setFamily', 'fsInstUpdate']) {
      expect(LOESCH_AKTION.test(a), a).toBe(false)
    }
    // Der Baustein mit Rückfrage steht, wo er stehen soll.
    expect(bausteine()).toContain('src/components/EntfernenKnopf.tsx')
  })

  it('kein ✕ trägt die Beschriftung „Entfernen" fest — er entfernte beim ersten Tipp', () => {
    expect(treffer(FESTE_BESCHRIFTUNG)).toEqual([])
  })

  it('keine Lösch-Aktion geht unmittelbar aus einem Klick hinaus', () => {
    expect(treffer(LOESCHEN_IM_KLICK, (m) => LOESCH_AKTION.test(m[1] ?? ''))).toEqual([])
  })
})
