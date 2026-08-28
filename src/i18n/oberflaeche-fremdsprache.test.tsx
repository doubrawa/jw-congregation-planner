/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import { APP_LANGS, isRTL } from './langs'
import { DE, dict, loadOverlay } from './ui'
import type {
  FsInstance,
  FsRule,
  Group,
  Lang,
  MyTask,
  Notification,
  Person,
  S89Payload,
  Screen,
  Service,
  Week,
} from '../data/types'

/**
 * **Die Oberfläche in einer anderen Sprache — der Durchgang, den es nie gab.**
 *
 * Die Wörterbücher sind streng geprüft (`ui.test.ts`: jeder Schlüssel, jede
 * Sprache, kein stiller EN-Rückfall). Was daraus **auf dem Bildschirm landet**,
 * wurde bisher ausschließlich auf Deutsch gemessen: Von den rund 60 Test-
 * Dateien der Bedienoberfläche setzt keine eine andere Sprache — sie vergleichen
 * gegen `dict('de')`.
 *
 * Damit bleibt genau die Sorte Fehler unentdeckt, die hier immer wieder auftrat:
 * Ein Baustein schreibt einen deutschen Text direkt ins JSX, statt `t.…` zu
 * nehmen, oder gibt einen Datenwert roh aus, statt ihn durch `tu` zu schicken.
 * Das Wörterbuch ist dann vollständig, der Schlüssel ungenutzt — und der Satz
 * steht in 33 Sprachen deutsch da. So fand sich der roh ausgegebene
 * Treffpunkt-Ort, und so standen 92 Schlüssel monatelang englisch da.
 *
 * Geprüft wird deshalb am **gerenderten DOM**, in mehreren Sprachen:
 *
 *  1. Kein deutsches Wörterbuchwort steht in einer fremdsprachigen Oberfläche.
 *  2. Kanonisch deutsche **Datenwerte** (Rollen, Dienste) erscheinen übersetzt.
 *  3. Jeder Bildschirm rendert in **jeder** der 34 Sprachen ohne Absturz und
 *     ohne leer zu bleiben.
 *  4. Rechts-nach-links-Sprachen kommen als solche an.
 */

vi.mock('../app/hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  performLogout: () => {},
}))

const { AppShell } = await import('../app/AppShell')

// jsdom kennt `matchMedia` nicht; die Wisch-Gesten fragen danach. „Kein
// Schreibtisch" — wie in den übrigen Oberflächen-Tests.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

/* ---- Ein Bestand ohne deutsche Wörter ----------------------------------- */

/*
 * Namen, Versammlung und Saal sind bewusst **erfundene Buchstabenfolgen**.
 * Sie werden nie übersetzt (Personennamen sind Eigennamen), stünden also in
 * jeder Sprache so da — und ein echter Name wie „Klein" oder „Sommer" wäre
 * zugleich ein deutsches Wort und ließe die Prüfung unten Fehlalarm schlagen.
 * Der Demo-Bestand ist aus genau diesem Grund hier nicht brauchbar.
 */
const person = (id: string, fn: string, ln: string, planner = false): Person => ({
  id, fn, ln, role: 'aeltester', female: false, tel: '', mail: '',
  priv: emptyQualifications(), ...(planner ? { planner: true } : {}),
})

const ICH = person('p-1', 'Xavo', 'Quintus', true)
const ANDER = person('p-2', 'Yvor', 'Zeddix')
const GRUPPEN: Group[] = [{ id: 'g1', name: 'Grupo Uno', ov: ICH.id, as: null }]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/** Kanonisch deutsche Woche — so liegt sie für eine deutsche Versammlung vor. */
function woche(): Week {
  return {
    range: '7.–13. September',
    book: 'JEREMIA 32–33',
    start: '2026-09-07',
    current: true,
    mid: {
      date: 'Dienstag, 8. September · 19:00',
      end: 'Ende ca. 20:45',
      sections: [
        {
          label: 'ERÖFFNUNG', kind: 'eroeffnung', farbe: 'neutral',
          items: [{
            title: 'Lied 1 · Gebet · Einleitende Worte', meta: '1 Min.', mins: 1,
            names: [
              { name: 'Xavo Quintus', pid: ICH.id, rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
              { name: '', rolle: 'Gebet', bereichsKey: 'gebet' },
            ],
          }],
        },
        {
          label: 'SCHÄTZE AUS GOTTES WORT', kind: 'schaetze', farbe: 'petrol',
          items: [{
            num: 3, title: 'Bibellesung', meta: '4 Min. · th Lektion 2', mins: 4,
            names: [{ name: 'Yvor Zeddix', pid: ANDER.id, bereichsKey: 'bibellesung' }],
          }],
        },
        {
          label: 'UNSER LEBEN ALS CHRIST', kind: 'lac', farbe: 'wein',
          items: [{
            num: 7, title: 'Versammlungsbibelstudium', meta: '30 Min.', mins: 30,
            names: [
              { name: '', rolle: 'Leiter', bereichsKey: 'studium' },
              { name: '', rolle: 'Leser', bereichsKey: 'leser' },
            ],
          }],
        },
      ],
      helpers: { mik: [{ name: '' }, { name: '' }], rein: [{ name: '' }] },
    },
    we: {
      date: 'Sonntag, 13. September · 10:00',
      end: 'Ende ca. 11:45',
      sections: [
        {
          label: 'ÖFFENTLICHER VORTRAG', kind: 'vortrag', farbe: 'petrol',
          items: [{
            title: '(Vortragsthema eintragen)', meta: '30 Min.', mins: 30,
            names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }],
          }],
        },
      ],
      helpers: {},
    },
  }
}

const AUFGABE: MyTask = {
  id: '2026-09-07|mid|part|0|0|0',
  title: '', rolle: 'Vorsitz',
  date: 'Dienstag, 8. September · 19:00', chip: '', s89: null,
  status: 'offen', at: Date.parse('2026-09-08T17:00:00Z'),
}

/*
 * Ein Treffpunkt für den Predigtdienst. Er gehört hierher, weil an ihm schon
 * einmal ein roh ausgegebener Wert hing: Der **Ort** ging ohne Übersetzer in
 * die Anzeige — was ihm nicht schadet (er ist Freitext des Planers und wird
 * bewusst nicht übersetzt), was aber niemand geprüft hatte. Der Wochentag
 * daneben kommt aus `Intl` und muss die Sprache wechseln.
 */
const FS_REGEL: FsRule = {
  id: 'r1', grp: '', wd: 6, time: '09:30', place: 'Zubo 3', monthly: 0, skipCong: false,
}
const TREFFPUNKTE: FsInstance[] = [
  { id: '0|r1', ruleId: 'r1', grp: '', wd: 6, time: '09:30', place: 'Zubo 3', leader: 'Xavo Quintus', lpid: ICH.id },
  { id: '0|r2', ruleId: null, grp: 'g1', wd: 3, time: '18:00', place: 'Zubo 5', leader: '', manual: true },
]

const S89: S89Payload = {
  name: 'Yvor Zeddix', partner: '',
  date: 'Dienstag, 8. September · 19:00',
  type: 'Bibellesung', point: 'th Lektion 2', aux: false,
}

const MITTEILUNG: Notification = {
  id: 'n1', type: 'zuteilung', title: 'Neue Zuteilung', text: 'Bibellesung · Leser',
  at: new Date(Date.now() - 3 * 3600_000).toISOString(), read: false,
}

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    dataStatus: 'ready',
    dataEmpty: false,
    congregationId: 'c1',
    userId: 'u1',
    personId: ICH.id,
    planner: true,
    congregation: { name: 'Vestavo', hall: 'Kalvo 12', meetings: 'Di 19:00 · So 10:00' },
    persons: [ICH, ANDER],
    groups: GRUPPEN,
    services: DIENSTE,
    weeks: [woche()],
    fsWeeks: [TREFFPUNKTE],
    fsRules: [FS_REGEL],
    absences: [],
    notifs: [MITTEILUNG],
    myTasks: [AUFGABE],
    pendingIds: [],
    substituteReqs: [],
    members: [],
    invites: [],
    week: 0,
    tab: 'mid',
    terminGewaehlt: true,
    fsBase: new Date(2026, 8, 7, 12),
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const state = zustand(over)
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AppShell />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

const SCREENS: Screen[] = [
  'start', 'programm', 'aufgaben', 'planen', 'personen', 'einstellungen', 'profil',
]

/**
 * Zusätzlich zu den Bildschirmen: die Überlagerungen, die eigene Texte tragen.
 *
 * Sie sind der Ort, an dem eine fehlende Übersetzung am längsten unentdeckt
 * bleibt — man sieht sie nur, wenn man sie öffnet. Genau so standen der
 * Familien-Block, die Anmeldung, Push, Schriftgröße, Offline, Einspringen und
 * die Dubletten monatelang englisch da.
 */
const OVERLAYS: Array<[string, Partial<AppState>]> = [
  ['Mitteilungen', { screen: 'start', notifOpen: true }],
  ['Aufgaben-Blatt', { screen: 'aufgaben', myTaskId: AUFGABE.id }],
  ['Sprachauswahl', { screen: 'einstellungen', langSheetOpen: true }],
  ['Bestätigungs-Dialog', { screen: 'start', confirmOpen: true }],
  ['S-89-Formular', { screen: 'aufgaben', s89: S89 }],
  ['Zuteilungs-Sheet', {
    screen: 'planen',
    slotSel: {
      kind: 'part', wi: 0, tab: 'mid', si: 2, ii: 0, ni: 0,
      label: 'Versammlungsbibelstudium', labelRolle: 'Leiter',
      priv: 'studium', groups: false,
    },
  }],
  ['Dienst-Freigabe', { screen: 'einstellungen', svcSheet: 'mik' }],
]

/**
 * Ansichten, die keine Überlagerung sind, aber erst durch eine Auswahl
 * entstehen — sie ersetzen den Bildschirm, statt sich darüberzulegen.
 */
const UNTERANSICHTEN: Array<[string, Partial<AppState>, string]> = [
  ['Personen-Detail', { screen: 'personen', selectedPersonId: ICH.id }, '.pers-detail-head'],
]

const CODES = APP_LANGS.map((l) => l.code)

beforeAll(async () => {
  // Die Overlays sind lazy (Code-Splitting). Ohne Nachladen liefert `dict()`
  // den EN-Rückfall — und die Prüfung sähe eine englische statt einer
  // koreanischen Oberfläche.
  await Promise.all(CODES.map((code) => loadOverlay(code)))
})

afterEach(cleanup)

/* ---- 1. Kein deutsches Wörterbuchwort ----------------------------------- */

/**
 * Deutsche Wörterbuchwerte, die in dieser Sprache anders lauten.
 *
 * **Ab drei Zeichen**, nicht erst ab sechs: Die kurzen sind die
 * verräterischsten — „Leser", „offen", „frei", „Keine", „Datum", „VON"/„BIS".
 * Genau solche Wörter tippt man beim Bauen schnell direkt ins JSX, weil sie zu
 * klein wirken, um ein Wörterbuch zu bemühen. Dass sie sich hier nicht zufällig
 * treffen, sichert die Wortgrenze in `stehtDrin` samt der knotenweisen Ablesung
 * darüber; nachgemessen kommen so 17 weitere Werte hinzu (343 statt 326).
 *
 * Platzhalter-Texte („{n} offen") fallen heraus: Sie stehen nie wörtlich im
 * DOM, sondern immer mit eingesetztem Wert.
 */
function deutscheWerte(ziel: Lang): Array<[string, string]> {
  const de = DE as unknown as Record<string, string>
  const z = dict(ziel) as unknown as Record<string, string>
  return Object.keys(de)
    .filter((k) => de[k] !== z[k] && de[k]!.length >= 3 && !de[k]!.includes('{'))
    .map((k) => [k, de[k]!] as [string, string])
}

/**
 * Der sichtbare Text — **Textknoten für Textknoten**, mit Zeilenumbruch
 * verbunden.
 *
 * Nicht `container.textContent`: Das klebt benachbarte Elemente ohne Trenner
 * aneinander („…Deine nächste AufgabeVorsitz…"). Eine Suche mit Wortgrenzen
 * findet dort ausgerechnet die Wörter nicht mehr, die am Rand eines Elements
 * stehen — und das sind fast alle Beschriftungen. Beim ersten Versuch fiel
 * dadurch ein absichtlich eingebautes deutsches Label in zwei von drei Sprachen
 * durch die Prüfung.
 *
 * `aria-label` und `title` kommen mit: Sie sind für Screenreader das, was der
 * Text für die Augen ist, und sind hier schon einmal deutsch stehen geblieben.
 */
function sichtbarerText(container: HTMLElement): string {
  const stuecke: string[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue?.trim()
    if (text) stuecke.push(text)
  }
  for (const el of container.querySelectorAll('[aria-label], [title], [placeholder]')) {
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const wert = el.getAttribute(attr)?.trim()
      if (wert) stuecke.push(wert)
    }
  }
  return stuecke.join('\n')
}

/** Kommt `wort` als eigenes Wort im Text vor (nicht als Teil eines längeren)? */
function stehtDrin(text: string, wort: string): boolean {
  const escaped = wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'u').test(text)
}

describe('Kein deutscher Oberflächentext in einer fremden Sprache', () => {
  /*
   * Drei Sprachen mit verschiedenen Schriften statt aller 34: Der Befund wäre
   * in jeder derselbe (die Wörterbücher sind vollständig), die Laufzeit aber
   * das 34-Fache. Englisch ist dabei die schärfste Probe — es steht als
   * Rückfallschicht unter allen anderen, ein Loch dort fällt sonst nirgends auf.
   */
  it.each([['en', 'Englisch'], ['ko', 'Koreanisch'], ['ar', 'Arabisch']] as const)('%s', (code, versammlung) => {
    const gefunden: string[] = []
    for (const screen of SCREENS) {
      // Die Versammlung läuft in derselben Sprache: Dann steht auch der
      // Programmtext übersetzt da, und **jedes** verbliebene deutsche Wort ist
      // ein Befund. Bliebe hier „Deutsch", wäre der Titel „Bibellesung" zu
      // Recht deutsch — und die Prüfung müsste ihn ausnehmen, obwohl sie
      // genau solche Wörter sucht.
      const { container } = zeige({ screen, lang: code, congLang: versammlung })
      const text = sichtbarerText(container)
      for (const [key, wert] of deutscheWerte(code)) {
        if (stehtDrin(text, wert)) gefunden.push(`${screen}: ${key} = „${wert}"`)
      }
      cleanup()
    }
    expect(gefunden).toEqual([])
  })

  it.each(OVERLAYS)('%s steht ebenfalls nicht deutsch da', (_name, over) => {
    const gefunden: string[] = []
    // Versammlungssprache wie oben mitgezogen: Sonst stünde der Programmtext
    // („Bibellesung") zu Recht deutsch da und wäre nicht von einem Befund zu
    // unterscheiden.
    const { container } = zeige({ ...over, lang: 'en', congLang: 'Englisch' })
    const text = sichtbarerText(container)
    for (const [key, wert] of deutscheWerte('en')) {
      if (stehtDrin(text, wert)) gefunden.push(`${key} = „${wert}"`)
    }
    expect(gefunden).toEqual([])
  })

  it.each(OVERLAYS)('%s ist überhaupt offen', (name, over) => {
    /*
      Die Gegenprobe zur Prüfung darüber: Eine Überlagerung, die gar nicht
      aufgeht (falsches Zustandsfeld, fehlende Voraussetzung), hat keinen Text
      — und „kein deutsches Wort gefunden" wäre dann eine leere Behauptung.
      Genau so prüfen sich Oberflächen-Tests gern selbst ins Nichts.
    */
    const { container } = zeige({ ...over, lang: 'en', congLang: 'Englisch' })
    const dialoge = container.querySelectorAll('[role="dialog"], .sheet, .notif-panel')
    expect(dialoge.length, `${name}: nichts aufgegangen`).toBeGreaterThan(0)
    expect(sichtbarerText(container).length, name).toBeGreaterThan(40)
  })

  it.each(UNTERANSICHTEN)('%s steht ebenfalls nicht deutsch da', (name, over, marke) => {
    const { container } = zeige({ ...over, lang: 'en', congLang: 'Englisch' })
    expect(container.querySelector(marke), `${name}: nicht geöffnet`).not.toBeNull()
    const text = sichtbarerText(container)
    const gefunden = deutscheWerte('en')
      .filter(([, wert]) => stehtDrin(text, wert))
      .map(([key, wert]) => `${key} = „${wert}"`)
    expect(gefunden, name).toEqual([])
  })

  /**
   * **Die Zustände, die der Normalfall nie zeigt.**
   *
   * Bis hierher misst die Prüfung eine gewöhnliche Woche in einer gewöhnlichen
   * Versammlung. Genau darin liegt ihre Schwäche: Banner, Warnungen, Leer- und
   * Fehlerzustände erscheinen nur unter Bedingungen, die ein Standardbestand
   * nicht herstellt — und sind deshalb die Stellen, an denen eine fehlende
   * Übersetzung am längsten überlebt. Die 92 englisch gebliebenen Schlüssel
   * saßen fast alle in solchen Ecken (Offline, Push, Einspringen, Dubletten).
   */
  const ZUSTAENDE: Array<[string, Partial<AppState>, string?]> = [
    ['Konflikt: zweimal am selben Abend', {
      screen: 'planen',
      weeks: [(() => {
        const w = woche()
        w.mid.helpers.mik = [{ name: 'Xavo Quintus', pid: ICH.id }, { name: '' }]
        return w
      })()],
    }],
    ['abwesend und eingeteilt', {
      screen: 'planen',
      absences: [{ id: 'a1', personId: ICH.id, userId: 'u1', from: '2026-09-07', to: '2026-09-13', reason: 'Kalvo' }],
    }],
    ['Gedächtnismahl-Woche', {
      screen: 'programm',
      weeks: [{ ...woche(), mem: true, memCancel: 'mid' }],
    }],
    ['Kreisaufseher-Woche', { screen: 'programm', weeks: [{ ...woche(), co: true }] }],
    ['ausgefallene Zusammenkunft', {
      screen: 'programm',
      weeks: [{ ...woche(), dev: { mid: { cancelled: true, reason: 'Kalvo Zubo' } } }],
    }],
    ['verlegte Zusammenkunft', {
      screen: 'programm',
      weeks: [{ ...woche(), dev: { mid: { day: 'Donnerstag', time: '18:30' } } }],
    }],
    ['weitere Termine der Woche', {
      screen: 'programm',
      weeks: [{ ...woche(), termine: [{ id: 't1', title: 'Zubo', day: 'Freitag', time: '19:00', place: 'Kalvo' }] }],
    }],
    ['Ersatzgesuch offen', {
      screen: 'aufgaben',
      substituteReqs: [{
        key: '2026-09-07|mid|helper|mik|0', svc: 'mik', title: 'Mikrofone',
        date: 'Dienstag, 8. September · 19:00', at: Date.parse('2026-09-08T17:00:00Z'),
        declinedBy: 'Yvor Zeddix', schonHeute: [{ text: 'Vorsitz', lang: 'u' }],
      }],
    }],
    ['Zusätzliche Klasse', {
      screen: 'planen',
      auxClass: true,
      weeks: [(() => {
        const w = woche()
        w.mid.auxRatgeber = { name: '', rolle: 'Ratgeber', bereichsKey: 'ratgeber', male: true }
        return w
      })()],
    }],
    ['nur lesend (Momentaufnahme)', { screen: 'start', staleAt: Date.now() - 3600_000 }],
    ['Versammlung noch leer', { screen: 'start', dataEmpty: true }],
    ['keine Wochen geladen', { screen: 'programm', weeks: [], fsWeeks: [] }],
    ['Daten laden', { screen: 'start', dataStatus: 'loading' }],
    ['kein Mitglied', { screen: 'start', dataStatus: 'no-membership' }],
    ['Ladefehler', { screen: 'start', dataStatus: 'error' }],
    ['Import läuft', { screen: 'einstellungen', importing: true }],
    ['alles importiert', { screen: 'einstellungen', imported: true }],
    ['Verkündiger ohne Planungsrecht', { screen: 'start', planner: false }],
    ['Anmeldung', { screen: 'login', congregationId: null, userId: null }, '.login'],
    ['neues Passwort setzen', { screen: 'login', recovery: true, congregationId: null, userId: null }, '.login-eyebrow'],
  ]

  it.each(ZUSTAENDE)('%s steht nicht deutsch da', (name, over) => {
    const { container } = zeige({ ...over, lang: 'en', congLang: 'Englisch' })
    const text = sichtbarerText(container)
    // Erst der Beleg, dass der Zustand überhaupt etwas zeigt — sonst prüfte
    // die Zeile darunter ein leeres Fenster.
    expect(text.length, `${name}: nichts gerendert`).toBeGreaterThan(20)
    const gefunden = deutscheWerte('en')
      .filter(([, wert]) => stehtDrin(text, wert))
      .map(([key, wert]) => `${key} = „${wert}"`)
    expect(gefunden, name).toEqual([])
  })

  it.each(ZUSTAENDE)('%s zeigt sich auch wirklich', (name, over, marke) => {
    /*
      Die Gegenprobe zur Liste darüber: Ein Zustand, der am Bildschirm gar
      nichts ändert — weil ein Feld anders heißt, eine Voraussetzung fehlt oder
      der Bildschirm ihn nicht kennt —, hätte dort auch kein deutsches Wort
      zeigen können. Die Prüfung wäre grün und wertlos.

      Verglichen wird deshalb mit dem Normalfall **auf demselben Bildschirm**:
      Der Zustand muss den Text verändern. Wo der Bildschirm selbst schon der
      Zustand ist (die Anmeldung), gibt es keinen Normalfall zum Vergleichen —
      dort nennt der Eintrag stattdessen eine Marke im DOM.
    */
    const { container: geaendert } = zeige({ ...over, lang: 'en', congLang: 'Englisch' })
    const mit = sichtbarerText(geaendert)
    if (marke) {
      expect(geaendert.querySelector(marke), `${name}: ${marke} fehlt`).not.toBeNull()
      return
    }
    cleanup()
    const { container: normal } = zeige({
      screen: over.screen, lang: 'en', congLang: 'Englisch',
    })
    expect(mit, `${name}: ändert nichts am Bildschirm`).not.toBe(sichtbarerText(normal))
  })

  it('die Prüfung findet ein eingeschmuggeltes deutsches Wort auch wirklich', () => {
    // Gegenprobe: Ohne sie könnte `deutscheWerte` leer sein oder `stehtDrin`
    // nie treffen, und die Prüfungen darüber wären ein grünes Nichts.
    const werte = deutscheWerte('en')
    expect(werte.length).toBeGreaterThan(100)
    const [, irgendeinDeutschesWort] = werte[0]!
    expect(stehtDrin(`Vorher ${irgendeinDeutschesWort} nachher`, irgendeinDeutschesWort)).toBe(true)
  })
})

/* ---- 2. Datenwerte gehen durch den Übersetzer ---------------------------- */

describe('Kanonisch deutsche Datenwerte erscheinen übersetzt', () => {
  /*
   * Die zweite Hälfte des Problems: Rollen, Dienste und Abschnittsnamen stehen
   * kanonisch deutsch **in den Daten** und dürfen nicht roh in die Anzeige. Sie
   * gehen deshalb durch `tu` (App-Sprache) bzw. `tp` (Versammlungssprache) —
   * und wer das vergisst, hat einen vollständigen Wörterbuch-Bestand und
   * trotzdem „Vorsitz" auf dem Bildschirm.
   */
  const KANONISCH = ['Vorsitz', 'Gebet', 'Leiter', 'Leser', 'Mikrofone', 'Reinigung']

  /*
   * Die Versammlungssprache läuft mit: Eine Vorlagenwoche steht kanonisch
   * deutsch in den Daten (Wochenend-Vorlage, Eröffnung, Abschluss), und ihre
   * Titel gehen durch `tp` — also durch die Sprache der **Versammlung**, nicht
   * die des Lesers. Bliebe hier „Deutsch" stehen, wäre „Lied 1 · Gebet ·
   * Einleitende Worte" zu Recht deutsch, und die Prüfung schlüge fälschlich an.
   */
  const VERSAMMLUNG: Record<string, string> = {
    en: 'Englisch', es: 'Spanisch', ja: 'Japanisch',
  }

  it.each(['en', 'es', 'ja'] as const)('%s: Rollen und Dienste stehen nicht deutsch da', (code) => {
    const gefunden: string[] = []
    for (const screen of ['start', 'programm', 'aufgaben', 'planen', 'personen'] as Screen[]) {
      const { container } = zeige({ screen, lang: code, congLang: VERSAMMLUNG[code]! })
      const text = sichtbarerText(container)
      for (const wort of KANONISCH) {
        if (stehtDrin(text, wort)) gefunden.push(`${screen}: ${wort}`)
      }
      cleanup()
    }
    expect(gefunden).toEqual([])
  })

  it('auf Deutsch stehen dieselben Wörter sehr wohl da', () => {
    // Der Beleg, dass die Prüfung oben etwas gesehen hat: Auf Deutsch **muss**
    // „Vorsitz" im Planen-Screen vorkommen. Fände die Suche generell nichts,
    // wäre sie oben wertlos.
    const { container } = zeige({ screen: 'planen', lang: 'de', congLang: 'Deutsch' })
    const text = sichtbarerText(container)
    expect(KANONISCH.filter((w) => stehtDrin(text, w)).length).toBeGreaterThan(0)
  })
})

/* ---- 3. Jeder Bildschirm in jeder Sprache -------------------------------- */

describe('Jeder Bildschirm rendert in jeder Sprache', () => {
  /*
   * Der breite, billige Durchgang. Er sucht keinen bestimmten Fehler, sondern
   * die Sorte, die ganze Sprachen unbrauchbar macht: eine `Intl`-Locale, die
   * die Laufzeit nicht kennt (RangeError mitten im Rendern), ein Overlay, das
   * sich nicht laden lässt, eine Textfunktion, die für eine Schrift `undefined`
   * liefert. Ohne Error Boundary wäre das der Totalausfall (T1/T2).
   */
  it.each(CODES)('%s', (code) => {
    for (const screen of SCREENS) {
      const { container } = zeige({ screen, lang: code, congLang: 'Deutsch' })
      const text = sichtbarerText(container)
      expect(text.length, `${code}/${screen} ist leer`).toBeGreaterThan(20)
      expect(text, `${code}/${screen}`).not.toMatch(/undefined|NaN|Invalid Date|\[object /)
      cleanup()
    }
  })

  it.each(CODES)('%s: auf jedem Reiter — auch dem der Treffpunkte', (code) => {
    /*
      Wochenmitte, Wochenende und Treffpunkte sind drei verschiedene Ansichten
      hinter demselben Bildschirm. Die dritte zeigt gar kein Programm, sondern
      Wochentage aus `Intl` und Ortsangaben im Freitext des Planers — also
      genau die Mischung, an der ein roher Datenwert am ehesten durchrutscht.
    */
    for (const screen of ['programm', 'planen'] as Screen[]) {
      for (const tab of ['mid', 'we', 'fs'] as const) {
        const { container } = zeige({ screen, tab, lang: code, congLang: 'Deutsch' })
        const text = sichtbarerText(container)
        expect(text.length, `${code}/${screen}/${tab} ist leer`).toBeGreaterThan(20)
        expect(text, `${code}/${screen}/${tab}`).not.toMatch(/undefined|NaN|Invalid Date/)
        cleanup()
      }
    }
  })

  /**
   * **Die Stellen, an denen `Intl` die Sprache tragen muss — einzeln benannt.**
   *
   * Der Durchgang oben prüft nur, dass etwas dasteht. Das übersieht die
   * häufigste Art, wie eine dieser Stellen kaputtgeht: Jemand schreibt
   * `new Intl.DateTimeFormat('de-DE', …)` oder greift zur deutschen Tabelle,
   * und es rendert weiter tadellos — nur eben deutsch.
   *
   * Geprüft wird deshalb der **Unterschied**: Dieselbe Ansicht auf Deutsch und
   * auf Koreanisch, und an der genannten Stelle muss etwas anderes stehen.
   * Koreanisch, weil dort keine zufällige Namensgleichheit möglich ist.
   */
  const INTL_STELLEN: Array<[string, Partial<AppState>, string]> = [
    ['Reiter der Zusammenkünfte', { screen: 'programm' }, '.meeting-tab'],
    ['Datumszeile auf dem Start', { screen: 'start' }, '.dash-eyebrow'],
    ['Zeitleiste im Personen-Detail', { screen: 'personen', selectedPersonId: ICH.id }, '.pers-zeit-datum'],
  ]

  it.each(INTL_STELLEN)('%s steht in der Sprache des Lesers', (name, over, marke) => {
    const deutsch = (() => {
      const { container } = zeige({ ...over, lang: 'de', congLang: 'Deutsch' })
      const el = container.querySelector(marke)
      expect(el, `${name}: ${marke} fehlt schon auf Deutsch`).not.toBeNull()
      return el?.textContent ?? ''
    })()
    cleanup()
    const { container } = zeige({ ...over, lang: 'ko', congLang: 'Deutsch' })
    const koreanisch = container.querySelector(marke)?.textContent ?? ''
    expect(koreanisch, `${name}: leer`).toBeTruthy()
    expect(koreanisch, `${name}: blieb „${deutsch}"`).not.toBe(deutsch)
  })

  it('der Treffpunkt-Reiter zeigt seinen Wochentag in der Sprache des Lesers', () => {
    // Die Gegenprobe zum Durchgang darüber: Er prüft nur, dass etwas dasteht.
    // Hier steht, **was** dasteht — der Wochentag muss die Sprache wechseln,
    // der Ort (Freitext des Planers) nicht.
    const { container: de } = zeige({ screen: 'programm', tab: 'fs', lang: 'de', congLang: 'Deutsch' })
    const deutsch = sichtbarerText(de)
    cleanup()
    const { container: ko } = zeige({ screen: 'programm', tab: 'fs', lang: 'ko', congLang: 'Deutsch' })
    const koreanisch = sichtbarerText(ko)
    expect(deutsch).toMatch(/Samstag/)
    expect(koreanisch).not.toMatch(/Samstag/)
    expect(koreanisch).toMatch(/토요일/)
    // Der Ort bleibt in beiden derselbe — er ist keine Übersetzung wert.
    expect(deutsch).toContain('Zubo 3')
    expect(koreanisch).toContain('Zubo 3')
  })

  it.each(CODES)('%s: auch mit fremder Versammlungssprache', (code) => {
    // Zwei Sprachen zugleich: Der Leser liest in `code`, das Programm läuft auf
    // Griechisch. Genau dieser Fall unterscheidet `tu` von `tp` — und genau
    // hier stünde ein einzelner Übersetzer für beide Hälften falsch.
    for (const screen of ['programm', 'planen', 'aufgaben'] as Screen[]) {
      const { container } = zeige({ screen, lang: code, congLang: 'Griechisch' })
      const text = sichtbarerText(container)
      expect(text.length, `${code}/${screen} ist leer`).toBeGreaterThan(20)
      expect(text, `${code}/${screen}`).not.toMatch(/undefined|NaN|Invalid Date/)
      cleanup()
    }
  })

  it.each(CODES)('%s: und mit einer Versammlungssprache ohne Übersetzung', (code) => {
    // „Cebuano" ist eine gültige Versammlungssprache ohne App-Übersetzung
    // (`congAppCode` liefert undefined, `progFallback` wird wahr). Das Programm
    // bleibt dann kanonisch deutsch stehen — das ist der vorgesehene Rückfall
    // und darf nichts sprengen.
    const { container } = zeige({ screen: 'programm', lang: code, congLang: 'Cebuano' })
    expect(sichtbarerText(container), code).not.toMatch(/undefined|NaN|Invalid Date/)
  })
})

/* ---- 4. Rechts nach links ------------------------------------------------ */

describe('Rechts-nach-links', () => {
  it('genau vier App-Sprachen laufen von rechts nach links', () => {
    const rtl = CODES.filter((c) => isRTL(c))
    expect(rtl.sort()).toEqual(['ar', 'fa', 'he', 'ur'])
  })

  it.each(['ar', 'he', 'fa', 'ur'] as const)('%s: der Bildschirm bleibt lesbar', (code) => {
    // Kein Layout-Test — jsdom rechnet nichts. Geprüft wird, dass die Inhalte
    // ankommen: In diesen vier Sprachen laufen zusätzlich eigene Ziffern und
    // Zweirichtungs-Marken durch die Textfunktionen.
    const { container } = zeige({ screen: 'planen', lang: code, congLang: 'Arabisch' })
    const text = sichtbarerText(container)
    expect(text.length, code).toBeGreaterThan(20)
    expect(text, code).not.toMatch(/undefined|NaN/)
  })

  /**
   * **Fremder Text trägt seine eigene Schreibrichtung.**
   *
   * Was in einem Eingabefeld steht, gehört nicht der App: ein Personenname, der
   * Name der Versammlung, die Anschrift des Saals, eine Telefonnummer. Die
   * Richtung der Oberfläche gilt dafür nicht — sonst zerlegt der
   * Bidi-Algorithmus, was zusammengehört.
   *
   * **Gemessen an der Telefonnummer**, dem Fall, der wirklich falsch aussah: In
   * der arabischen Fassung stand „+49 159 774 21 08" als „08 21 774 159 49+" —
   * die Ziffernblöcke sind für den Algorithmus einzelne Läufe, und die neutralen
   * Leerzeichen dazwischen ordnen sie in Richtung des Absatzes. Keine falsche
   * Zeichenkette, aber eine falsche Nummer.
   *
   * `dir="auto"` löst beides zugleich: ein arabischer Name läuft rechts nach
   * links, ein lateinischer und eine Nummer links nach rechts.
   */
  it.each([
    ['Personen-Detail', { screen: 'personen', selectedPersonId: ICH.id } as Partial<AppState>],
    ['Versammlungs-Angaben', { screen: 'einstellungen' } as Partial<AppState>],
  ])('%s: jedes Textfeld trägt dir="auto"', (name, over) => {
    const { container } = zeige({ ...over, lang: 'ar', congLang: 'Arabisch' })
    const felder = [...container.querySelectorAll<HTMLInputElement>('input.field-input')]
    expect(felder.length, `${name}: keine Felder gefunden`).toBeGreaterThan(1)
    const ohne = felder.filter((e) => e.getAttribute('dir') !== 'auto')
    expect(ohne.map((e) => e.id), name).toEqual([])
  })

  it('und auf Deutsch steht dieselbe Angabe — sie hängt nicht an der Sprache', () => {
    // Eine Richtung, die nur in RTL gesetzt wird, wäre ein zweiter Zweig mit
    // eigenem Verhalten. `dir="auto"` gilt immer: Ein arabischer Name in einer
    // deutschen Oberfläche soll ebenso richtig herum stehen.
    const { container } = zeige({ screen: 'personen', selectedPersonId: ICH.id, lang: 'de' })
    const felder = [...container.querySelectorAll<HTMLInputElement>('input.field-input')]
    expect(felder.every((e) => e.getAttribute('dir') === 'auto')).toBe(true)
  })

  /**
   * Dasselbe für die **Anzeige** — nicht nur fürs Eingeben.
   *
   * Ein Name steht öfter da, als er getippt wird: in der Seitenleiste, in der
   * Personenliste, über dem Detail, im Profil. Wo er allein in seinem Element
   * steht, gehört ihm die Richtung; wo er in einem übersetzten Satz steckt
   * („Versammlung {name}"), gehört sie dem Satz — deshalb steht `dir` genau an
   * den Elementen unten und nicht an ihren Eltern.
   */
  const EIGENER_TEXT: Array<[string, Partial<AppState>, string]> = [
    ['Name in der Seitenleiste', { screen: 'start' }, '.sidebar-profile-name'],
    ['Name in der Personenliste', { screen: 'personen' }, '.pers-name'],
    ['Name über dem Detail', { screen: 'personen', selectedPersonId: ICH.id }, '.pers-detail-name'],
    ['Name im Profil', { screen: 'profil' }, '.kv-val'],
    [
      'Grund einer Abwesenheit',
      {
        screen: 'aufgaben',
        absences: [{ id: 'a1', personId: ICH.id, userId: 'u1', from: '2026-09-07', to: '2026-09-13', reason: 'Kalvo' }],
      },
      '.abs-reason-text',
    ],
  ]

  it.each(EIGENER_TEXT)('%s trägt seine eigene Richtung', (name, over, marke) => {
    const { container } = zeige({ ...over, lang: 'ar', congLang: 'Arabisch' })
    const el = container.querySelector(marke)
    expect(el, `${name}: ${marke} nicht gefunden`).not.toBeNull()
    expect(el?.getAttribute('dir'), name).toBe('auto')
  })
})
