/** @vitest-environment happy-dom */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { reducer } from '../app/reducer'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { deutschFinder, sichtbareTexte } from '../../tests/deutsch-erkennen'
import { emptyQualifications } from '../data/helpers'
import type { Lang, Notification, Person, Week } from '../data/types'
import { STANDARD_ZEITEN } from '../data/vorgaben'
import { loadLangNames } from '../i18n/langnames'
import { APP_LANGS } from '../i18n/langs'
import { alsFreitext, bibelbuecherLaden } from '../i18n/translate'
import { loadOverlay } from '../i18n/ui'
import { terminText } from '../../supabase/functions/_shared/planung.ts'
import { trolleyRumpf } from '../../supabase/functions/_shared/trolley.ts'
import { kanonisch, offeneDerWoche, type Week as FunctionWoche } from '../../supabase/functions/_shared/zuteilungen.ts'
import { TITEL_ENTZUG, TITEL_ZUTEILUNG } from '../../supabase/functions/send-plan/texte.ts'
import { TITEL_ERINNERUNG, TITEL_UNERREICHBAR } from '../../supabase/functions/send-reminders/texte.ts'
import { TITEL_GEFUNDEN, TITEL_GESUCHT } from '../../supabase/functions/substitute/texte.ts'
import { TITEL_DAZU } from '../../supabase/functions/trolley/texte.ts'
import { MitteilungenScreen } from './MitteilungenScreen'

/**
 * **Jede Mitteilung, so wie ihr Erzeuger sie schreibt — in jeder Sprache**
 * (T123).
 *
 * Eine Mitteilung steht kanonisch deutsch in der Datenbank und wird erst beim
 * Anzeigen übersetzt: der Titel über `NOTIF_TITLE_KEY`, der Rumpf Atom für
 * Atom über den Fragment-Übersetzer. Ob der Rumpf übersetzt ankommt, hängt
 * also an seiner **Form** — und die bestimmt der Erzeuger, nicht die Glocke.
 *
 * Gemessen wurde das bis hierher nur am Demo-Bestand, und dessen Rümpfe sind
 * von Hand geschrieben („Mikrofone · Sonntag, 20. September"). „Plan senden"
 * und die Erinnerung schreiben aber Termin und Bezeichnung mit „: " verbunden
 * (`kanonisch`) — „Dienstag, 8. September · 19:00: Bibellesung" —, und genau
 * dieses Stück kannte der Übersetzer nicht: Die Bezeichnung stand in jeder
 * fremden Glocke deutsch da (16.10.2026).
 *
 * Deshalb baut diese Prüfung jeden Rumpf mit den Bausteinen seines Erzeugers:
 * `offeneDerWoche` + `kanonisch` (send-plan, send-reminders), `trolleyRumpf`
 * (trolley, Trolley morgen), die Atome von `substitute` und den Reducer selbst
 * (Import, Absage).
 */

const NAME = 'Xabebo Xidavo'
const ANDERER = 'Xumabo Xolevo'
const ERFUNDEN = new Set(['Xabebo', 'Xidavo', 'Xumabo', 'Xolevo', 'Xagobo', 'Xezavo', 'Xilubo', 'XX'])

const person = (id: string, fn: string, ln: string): Person => ({
  id, fn, ln, role: 'aeltester', female: false, mail: '', priv: emptyQualifications(),
})

/** Eine kanonisch deutsche Woche — Vorlagen-Texte, die der Übersetzer in jeder Sprache kennt. */
function woche(): Week {
  return {
    range: '7.–13. September',
    book: 'JEREMIA 32–33',
    start: '2026-09-07',
    mid: {
      date: 'Dienstag, 8. September · 19:00',
      end: 'Ende ca. 20:45',
      sections: [
        { label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral', items: [{ iid: 'i1', title: 'Lied 1 · Gebet · Einleitende Worte', meta: '1 Min.', mins: 1, names: [{ name: NAME, pid: 'p-1', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }] }] },
        { label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schaetze', farbe: 'petrol', items: [{ iid: 'i2', num: 3, title: 'Bibellesung', meta: '4 Min. · th Lektion 2', mins: 4, names: [{ name: NAME, pid: 'p-1', bereichsKey: 'bibellesung' }] }] },
        { label: 'UNSER LEBEN ALS CHRIST', kind: 'lac', farbe: 'wein', items: [{ iid: 'i3', num: 7, title: 'Versammlungsbibelstudium', meta: '30 Min.', mins: 30, names: [{ name: NAME, pid: 'p-1', rolle: 'Leiter', bereichsKey: 'studium' }, { name: ANDERER, pid: 'p-2', rolle: 'Leser', bereichsKey: 'leser' }] }] },
      ],
      helpers: { mik: [{ name: NAME, pid: 'p-1' }] },
    },
    we: { date: 'Sonntag, 13. September · 10:00', end: 'Ende ca. 11:45', sections: [], helpers: {} },
  }
}

/** Die Zeilen von „Plan senden" und der Erinnerung: je Platz Termin und Bezeichnung, kanonisch verbunden. */
function eintraege(): string[] {
  const fs = [{ id: 'r1', wd: 6, time: '09:30', place: 'Königreichssaal', leader: NAME, lpid: 'p-1' }]
  const services = [{ key: 'mik', name: 'Mikrofone', count: 1, groups: false }]
  const offen = offeneDerWoche('2026-09-07', woche() as unknown as FunctionWoche, fs, services, new Map(), STANDARD_ZEITEN, Date.UTC(2026, 8, 7))
  return offen.filter((p) => p.name === NAME).map((p) => kanonisch(p.eintrag))
}

const at = new Date(Date.UTC(2026, 8, 7, 7)).toISOString()
const zeile = (id: string, title: string, text: string): Notification => ({ id, type: 'zuteilung', title, text, at, read: false })

function mitteilungen(): Notification[] {
  const zeilen = eintraege()
  const termin = terminText('2026-09-07', 1, undefined, '19:00')
  const trolley = trolleyRumpf({ trolley: 'Xagobo', datum: '2026-09-09', von: '10:00', bis: '12:00', person: ANDERER })
  // Import und Absage schreibt der Reducer selbst — so, wie er sie verschickt.
  const basis: AppState = { ...demoZustand(), persons: [person('p-1', 'Xabebo', 'Xidavo')], personId: 'p-1', weeks: [], fsWeeks: [], notifs: [] }
  const importiert = reducer({ ...basis, importing: true }, { type: 'addImportedWeek', week: woche() }).notifs[0]!
  const mitAufgabe: AppState = {
    ...basis,
    myTasks: [{ id: '2026-09-07|mid|part|1|0|0', title: 'Bibellesung', date: 'Dienstag, 8. September · 19:00', s89: null, status: 'offen' }],
  }
  const abgesagt = reducer(mitAufgabe, { type: 'declineTask', id: '2026-09-07|mid|part|1|0|0', nachricht: 'Xezavo Xilubo' }).notifs[0]!
  return [
    zeile('plan', TITEL_ZUTEILUNG, zeilen.join(' · ')),
    zeile('entzug', TITEL_ENTZUG, zeilen[0]!),
    zeile('erinnerung', TITEL_ERINNERUNG, zeilen.join(' · ')),
    zeile('unerreichbar', TITEL_UNERREICHBAR, zeilen.map((z) => `${alsFreitext(NAME)} — ${z}`).join(' · ')),
    zeile('gesucht', TITEL_GESUCHT, ['Mikrofone', termin, alsFreitext(NAME)].join(' · ')),
    zeile('gefunden', TITEL_GEFUNDEN, ['Mikrofone', termin, alsFreitext(ANDERER)].join(' · ')),
    zeile('trolley', TITEL_DAZU, trolley),
    { ...importiert, id: 'import', at },
    { ...abgesagt, id: 'absage', at },
  ]
}

type Fremd = Exclude<Lang, 'de'>
const FREMD = APP_LANGS.map((l) => l.code).filter((c): c is Fremd => c !== 'de')

beforeAll(async () => {
  await Promise.all(FREMD.map((code) => loadOverlay(code)))
  await Promise.all(FREMD.map((code) => loadLangNames(code)))
  await bibelbuecherLaden()
})
afterEach(cleanup)

function zeige(lang: Lang, notifs: Notification[]) {
  const state: AppState = {
    ...demoZustand(),
    screen: 'mitteilungen', lang, congLang: 'de',
    dataStatus: 'ready', planner: true, personId: 'p-1', persons: [person('p-1', 'Xabebo', 'Xidavo')],
    notifs, myTasks: [], substituteReqs: [], weeks: [], fsWeeks: [],
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <MitteilungenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

describe('Mitteilungen aus jedem Erzeuger, in jeder Sprache', () => {
  it('jeder Erzeuger ist dabei — und der Rumpf von „Plan senden" trägt Termin und Bezeichnung mit „: "', () => {
    // Die Gegenprobe zur Form: Ohne den Doppelpunkt prüfte die Zeile unten
    // nicht mehr, wofür sie geschrieben ist.
    const alle = mitteilungen()
    expect(alle).toHaveLength(9)
    expect(alle[0]!.text).toMatch(/19:00: Bibellesung/)
    expect(alle[0]!.text).toMatch(/09:30 · Königreichssaal: Treffpunkt-Leiter/)
  })

  it.each(FREMD)('%s: kein deutsches Wort in Titel oder Rumpf', (lang) => {
    zeige(lang, mitteilungen())
    const finde = deutschFinder(lang, ERFUNDEN)
    const reste = sichtbareTexte().flatMap(finde).map((r) => `„${r.wort}" in „${r.zeile}"`)
    expect(reste).toEqual([])
  })

  it('auf Deutsch steht die Bezeichnung da — die Prüfung sähe sie', () => {
    zeige('de', mitteilungen())
    const reste = sichtbareTexte().flatMap(deutschFinder('en', ERFUNDEN))
    expect(reste.map((r) => r.wort)).toContain('Bibellesung')
  })
})
