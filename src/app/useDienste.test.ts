import { describe, expect, it } from 'vitest'
import type { Service } from '../data/types'
import { bibelbuecherGeladen, bibelbuecherLaden, makeTr } from '../i18n/translate'
import { diensteDerSprache } from './useDienste'

/**
 * **Die Dienste alphabetisch in der Sprache des Lesers, einmal gerechnet** —
 * Reducer und Bausteine teilen die Liste; ein `useMemo`, das sie als
 * Abhängigkeit führt, rechnet nur neu, wenn sie wirklich eine andere ist.
 */

const dienst = (key: string, name: string): Service => ({ key, name, count: 1, groups: false })
const keys = (liste: readonly Service[]): string[] => liste.map((s) => s.key)

describe('diensteDerSprache', () => {
  it('dieselben Dienste und dieselbe Sprache: dieselbe Liste — sonst eine neue', () => {
    const dienste = [dienst('ton', 'Ton / Video'), dienst('mik', 'Mikrofone')]
    const de = diensteDerSprache(dienste, 'de')
    expect(diensteDerSprache(dienste, 'de')).toBe(de)
    expect(keys(de)).toEqual(['mik', 'ton'])
    // Englisch ordnet anders: „Audio / video" vor „Microphones".
    expect(keys(diensteDerSprache(dienste, 'en'))).toEqual(['ton', 'mik'])
    // Ein neuer Bestand mit demselben Inhalt ist eine neue Liste.
    expect(diensteDerSprache([...dienste], 'de')).not.toBe(de)
  })

  it('nach dem Laden der Bibelbücher sortiert ein Name mit Buch und Zahl nach seiner übersetzten Form', async () => {
    // „Johannes 1" steht vor „Johannisbeere" — „John 1" dahinter.
    const dienste = [dienst('x', 'Johannes 1'), dienst('y', 'Johannisbeere')]
    expect(bibelbuecherGeladen()).toBe(false)
    expect(keys(diensteDerSprache(dienste, 'en'))).toEqual(['x', 'y'])
    await bibelbuecherLaden()
    // Gegenprobe: Ohne die Buch-Regel bliebe die Folge, und der Fall prüfte nichts.
    expect(makeTr('en')('Johannes 1')).toBe('John 1')
    expect(keys(diensteDerSprache(dienste, 'en'))).toEqual(['y', 'x'])
  })
})
