import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from '../i18n/langs'
import { dict, loadOverlay, PRIV_KEY } from '../i18n/ui'
import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { privLabel } from './priv-label'
import type { QualificationKey } from '../data/types'

/**
 * **Die Beschriftung eines Aufgabenbereichs — zusammengesetzt statt übersetzt.**
 *
 * Vier der dreizehn Bereiche haben keinen eigenen Wörterbuch-Schlüssel, sondern
 * werden aus zwei vorhandenen gebaut: „Vorsitz · unter der Woche",
 * „Ratgeber · Zusätzliche Klasse", „Schulungsaufgaben · Gesprächspartner". Das
 * ist Absicht — vier zusätzliche Schlüssel hießen 136 Übersetzungen für etwas,
 * das schon dasteht.
 *
 * Der Preis ist eine Annahme, die niemand geprüft hat: dass die Bausteine in
 * **jeder** Sprache zusammenpassen. Fehlt einer, steht dort „· " mit einer
 * leeren Hälfte; sind zwei Bereiche in einer Sprache gleich beschriftet, kann
 * der Planer sie im Personen-Detail nicht auseinanderhalten — und schaltet den
 * falschen ein.
 *
 * Geprüft war das Modul bislang gar nicht; die einzige Berührung war ein
 * deutscher Vergleich in `PersonDetail.test.tsx`.
 */

const CODES = APP_LANGS.map((l) => l.code)
const ALLE: QualificationKey[] = [...QUALIFICATION_ORDER, ...WT_ROLE_ORDER]

beforeAll(async () => {
  await Promise.all(CODES.map((code) => loadOverlay(code)))
})

describe('privLabel in jeder App-Sprache', () => {
  it.each(CODES)('%s: jede Beschriftung ist vollständig', (code) => {
    const t = dict(code)
    for (const key of ALLE) {
      const label = privLabel(t, key)
      expect(label, `${code}/${key} ist leer`).toBeTruthy()
      expect(label, `${code}/${key} beginnt oder endet mit dem Trenner`).toBe(label.trim())
      // Eine leere Hälfte macht aus „Vorsitz · unter der Woche" ein „Vorsitz ·".
      expect(label.startsWith('·') || label.endsWith('·'), `${code}/${key}: ${label}`).toBe(false)
      expect(label.includes('·  ') || label.includes('  ·'), `${code}/${key}: ${label}`).toBe(false)
    }
  })

  it.each(CODES)('%s: keine zwei Bereiche heißen gleich', (code) => {
    /*
      Der eigentliche Zweck der Zusammensetzung: `vorsitzMid` und `vorsitzWe`
      teilen sich den Schlüssel `privVorsitz` und wären ohne den Zusatz nicht
      unterscheidbar. Dasselbe gilt für `schulung`/`schulungPartner`. Steht in
      einer Sprache zweimal dasselbe, hat der Planer im Personen-Detail zwei
      identisch beschriftete Schalter mit verschiedener Wirkung.
    */
    const t = dict(code)
    const labels = ALLE.map((key) => privLabel(t, key))
    const doppelt = labels.filter((l, i) => labels.indexOf(l) !== i)
    expect(doppelt, `${code}: ${doppelt.join(', ')}`).toEqual([])
  })

  it.each(CODES.filter((c) => c !== 'de'))('%s: nicht die deutsche Beschriftung', (code) => {
    // Ohne diese Prüfung bliebe unbemerkt, wenn `dict()` still auf Deutsch
    // zurückfiele — die Zusammensetzung sähe trotzdem heil aus.
    const deutsch = dict('de')
    const eigen = dict(code)
    const gleich = ALLE.filter((key) => privLabel(eigen, key) === privLabel(deutsch, key))
    expect(gleich, `${code}: ${gleich.join(', ')}`).toEqual([])
  })
})

describe('Die Zusammensetzung selbst', () => {
  it('setzt die vier Sonderfälle aus vorhandenen Bausteinen zusammen', () => {
    const t = dict('de')
    expect(privLabel(t, 'vorsitzMid')).toBe(`${t.privVorsitz} · ${t.tabMid}`)
    expect(privLabel(t, 'vorsitzWe')).toBe(`${t.privVorsitz} · ${t.tabWe}`)
    expect(privLabel(t, 'ratgeber')).toBe(`${t.auxRatgeber} · ${t.auxKlasse}`)
    expect(privLabel(t, 'schulungPartner')).toBe(`${t.privSchulung} · ${t.s89Partner}`)
  })

  it('alle übrigen kommen unverändert aus dem Wörterbuch', () => {
    const t = dict('en')
    const zusammengesetzt = new Set(['vorsitzMid', 'vorsitzWe', 'ratgeber', 'schulungPartner'])
    for (const key of ALLE) {
      if (zusammengesetzt.has(key)) continue
      expect(privLabel(t, key), key).toBe(t[PRIV_KEY[key]])
    }
  })

  it('PRIV_KEY deckt jeden Bereich ab, den die Oberfläche anbietet', () => {
    // Sonst käme für einen neuen Bereich `undefined` aus dem Wörterbuch — und
    // im Personen-Detail stünde ein Schalter ohne Beschriftung.
    const ohne = ALLE.filter((key) => !(key in PRIV_KEY))
    expect(ohne).toEqual([])
  })
})
