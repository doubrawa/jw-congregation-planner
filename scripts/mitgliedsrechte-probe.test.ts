import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROBE_DATEI, probeDateiText, wertAusEnvText } from './gemeinsam.mjs'
import {
  abwesenheitAnlage,
  bewerteSicht,
  bewerteVersuch,
  dienstAusSchluessel,
  eigeneSlots,
  ersterMontagAb,
  fremdeSlots,
  gruppenWahl,
  helferSchluessel,
  montagVon,
  planAenderung,
  PROBE_KONTEN,
  qualifiziertFuer,
  slotSchluessel,
  stufenAnlage,
  t120Anlage,
  tagPlus,
  TAUSCH_TITEL,
  tauschAnlage,
  trolleyAnlage,
  verwaltungAnlage,
  vorbeiKandidaten,
  vortragAnlage,
  wochentag,
  zugangAus,
  zuteilungAenderung,
} from './mitgliedsrechte-probe.mjs'
import { TEST_KONTEN } from './testversammlung-anlegen.mjs'
import { helferKey, punktKey } from '../src/data/planning'
import { isQualified, serviceQualKey } from '../src/data/helpers'
import type { PartItem, Person } from '../src/data/types'
import { pidsNachtragen } from '../src/data/namensbindung'
import { heuteUtc, STANDARD_ZEITEN } from '../supabase/functions/_shared/planung.ts'
import { ueberschneiden, zeitraumGueltig } from '../supabase/functions/_shared/trolley.ts'
import { offeneDerWoche, type Week } from '../supabase/functions/_shared/zuteilungen.ts'
import { type Lage, tagDerZusammenkunft, tauschAngebote, tauschPruefen } from '../supabase/functions/tauschen/regeln.ts'
import { TITEL_ABGELEHNT, TITEL_ANGEFRAGT, TITEL_GETAUSCHT } from '../supabase/functions/tauschen/texte.ts'
import { buildDemoWeeks, DEMO_PERSONS } from '../tests/testdaten/testdaten'

/**
 * Die Probe selbst läuft nur gegen eine echte Datenbank. Geprüft wird hier das,
 * woran sie **still falsch** werden könnte: der Schlüssel.
 *
 * Ein falsch gebauter `task_key` wäre die tückischste Art zu scheitern — die
 * Datenbank nähme ihn anstandslos an, die Probe meldete „durchgelassen", und
 * der Befund wäre trotzdem nicht belegt: Der Schlüssel bezöge sich auf gar
 * keinen Slot. Deshalb wird er gegen `planning.ts` gehalten, nicht gegen eine
 * hier abgeschriebene Erwartung.
 */

const punkt = (iid = 'k3f9x'): PartItem => ({ iid, title: 'Probe', names: [] })

describe('Der Schlüssel ist derselbe wie in der App', () => {
  it('Programmpunkt: Woche, Zusammenkunft, Raum, Kennung, Platz', () => {
    const item = punkt()
    expect(slotSchluessel(item, '2026-08-17', 'mid', 0)).toBe(punktKey('2026-08-17', 'mid', item.iid, 0))
  })

  it('und die Zusätzliche Klasse trägt „aux" statt „part"', () => {
    const item = punkt()
    expect(slotSchluessel(item, '2026-08-17', 'we', 1, true)).toBe(punktKey('2026-08-17', 'we', item.iid, 1, true))
    expect(slotSchluessel(item, '2026-08-17', 'we', 1, true)).toContain('|aux|')
  })

  it('Hilfsdienste ebenso', () => {
    expect(helferSchluessel('2026-08-17', 'mid', 'mik', 1)).toBe(helferKey('2026-08-17', 'mid', 'mik', 1))
  })
})

describe('Fremde Aufgaben finden', () => {
  const week = {
    start: '2026-08-17',
    mid: {
      sections: [
        {
          items: [
            { song: 'Lied 1' },
            { iid: 'a1', title: 'Einleitung', names: [{ name: 'Ich', pid: 'ich' }, { name: 'Anderer', pid: 'fremd' }] },
          ],
        },
      ],
      helpers: { mik: [{ name: 'Ich', pid: 'ich' }, { name: 'Dritter', pid: 'fremd2' }] },
    },
    we: {
      sections: [
        { items: [{ iid: 'b1', title: 'Vortrag', names: [{ name: 'H. Brügger', rolle: 'Gastredner · Vers. Oberau' }] }] },
      ],
      helpers: {},
    },
  }

  it('findet fremde Programmplätze und Hilfsdienste, nicht die eigenen', () => {
    const treffer = fremdeSlots(week, 'ich')
    expect(treffer.map((t) => t.wer).sort()).toEqual(['Anderer', 'Dritter'])
  })

  it('externe Redner bleiben außen vor — sie haben keinen Bestätigungs-Flow', () => {
    // Der Gastredner am Wochenende steht ohne `pid` im Platz.
    expect(fremdeSlots(week, 'ich').some((t) => t.wer === 'H. Brügger')).toBe(false)
  })

  it('die Schlüssel tragen Woche, Zusammenkunft und Art', () => {
    const treffer = fremdeSlots(week, 'ich')
    expect(treffer.find((t) => t.art === 'Programm')?.key).toBe('2026-08-17|mid|part|a1|1')
    expect(treffer.find((t) => t.art.startsWith('Hilfsdienst'))?.key).toBe('2026-08-17|mid|helper|mik|1')
  })

  it('findet umgekehrt die eigenen — der Gegenbeweis zur Strenge', () => {
    /*
     * Ohne diesen Fund misst die Probe nur die halbe Wahrheit: Eine Richtlinie,
     * die ALLES abweist, bestünde jede Fremd-Probe glänzend und bräche die App.
     * Fall (5) braucht deshalb eine Aufgabe, die dem Mitglied wirklich gehört.
     */
    const treffer = eigeneSlots(week, 'ich')
    expect(treffer.map((t) => t.art)).toEqual(['Programm', 'Hilfsdienst mik'])
    expect(treffer.every((t) => t.wer === 'Ich')).toBe(true)
  })

  it('ohne eigene Person gibt es keine eigenen Plätze', () => {
    // Ein Konto ohne verknüpfte Person hat keine Aufgaben — dann bleibt (5)
    // ungemessen, statt zufällig einen fremden Platz zu treffen.
    expect(eigeneSlots(week, null)).toEqual([])
  })

  it('ohne eigene Person gilt alles Besetzte als fremd — bis auf den Gastredner', () => {
    // Vier Plätze mit `pid` (zwei im Programm, zwei im Hilfsdienst); der
    // Gastredner hat keine und bleibt auch hier draußen.
    expect(fremdeSlots(week, null).map((t) => t.wer)).toEqual(['Ich', 'Anderer', 'Ich', 'Dritter'])
  })
})

describe('Einen Schreibversuch bewerten', () => {
  it('angekommen heißt: der Befund ist bestätigt, nicht „bestanden"', () => {
    const e = bewerteVersuch(201, true, true)
    expect(e).toMatchObject({ durch: true, wieErwartet: true })
    expect(e.text).toMatch(/ANGEKOMMEN/)
  })

  it('abgewiesen, wo es abgewiesen gehört', () => {
    expect(bewerteVersuch(403, false, false)).toMatchObject({ durch: false, wieErwartet: true })
  })

  it('und jede Überraschung fällt auf — in beide Richtungen', () => {
    expect(bewerteVersuch(403, false, true).wieErwartet).toBe(false)
    expect(bewerteVersuch(201, true, false).wieErwartet).toBe(false)
  })

  /*
    Der teuer gelernte Fall: Die Mitteilung wurde geschrieben, aber der
    Absender darf sie nicht zurücklesen — PostgreSQL wendet SELECT-Richtlinien
    auf `RETURNING` an, und PostgREST hängt es bei `return=representation` an.
    Die erste Fassung urteilte nach dem Status und hätte S3 fälschlich als
    behoben abgehakt. Seither entscheidet allein, ob die Zeile am Ziel liegt.
  */
  it('ein 403 aus dem RETURNING kippt das Urteil nicht — gezählt wird, was ankam', () => {
    const e = bewerteVersuch(403, true, true)
    expect(e).toMatchObject({ durch: true, wieErwartet: true })
    expect(e.text).toBe('ANGEKOMMEN (HTTP 403)')
  })

  /*
    „Nicht angekommen" ist nur ein Urteil, wenn gemessen wurde. Bis zum
    26.9.2026 hieß ein Schreibversuch mit vertippter Spalte (400) bei jedem
    verbotenen Fall „abgewiesen" — nichts war angekommen, weil nichts
    gefragt wurde. Ebenso ein Nachsehen, das selbst scheiterte.
  */
  it('ein 400 beim Schreiben ist kein Urteil — auch wenn nichts ankam', () => {
    const e = bewerteVersuch(400, false, false)
    expect(e).toMatchObject({ durch: false, wieErwartet: false, kaputt: true })
    expect(e.text).toMatch(/PROBE KAPUTT — Schreiben scheiterte \(HTTP 400\)/)
  })

  it('scheitert das Nachsehen, ist ebenso nichts gemessen', () => {
    const e = bewerteVersuch(201, false, false, { leseStatus: 400 })
    expect(e).toMatchObject({ wieErwartet: false, kaputt: true })
    expect(e.text).toMatch(/Nachsehen scheiterte \(HTTP 400\)/)
  })

  it('aufräumen darf nur, wo die Zeile angekommen sein kann', () => {
    // Durchgekommen, nur nicht nachprüfbar: vorsorglich aufräumen.
    expect(bewerteVersuch(201, false, false, { leseStatus: 400 }).vielleichtDurch).toBe(true)
    // Schon das Schreiben scheiterte — etwa 409, weil die Zusage längst in der
    // App steht. Gelöscht würde dann genau die, nicht eine Zeile der Probe.
    expect(bewerteVersuch(409, true, true).vielleichtDurch).toBe(false)
    // Von der Regel abgewiesen, und das Nachsehen scheiterte: ebenso nichts da.
    expect(bewerteVersuch(403, false, false, { leseStatus: 500 }).vielleichtDurch).toBe(false)
  })

  it('bei einer Edge Function sagt der Aufrufer, welcher Fehler ein Urteil ist', () => {
    // `substitute` meldet mit 409 sowohl „not-sought" (das Urteil über S13)
    // als auch „slot-taken" (keins); am Status allein ist das nicht zu sehen.
    expect(bewerteVersuch(409, false, false, { urteil: true })).toMatchObject({ wieErwartet: true })
    expect(bewerteVersuch(409, false, false, { urteil: false })).toMatchObject({ kaputt: true })
    expect(bewerteVersuch(403, false, false, { urteil: false })).toMatchObject({ kaputt: true })
  })
})

describe('Ist das Mitglied für den Platz überhaupt qualifiziert? (Fall 9)', () => {
  /*
    Ohne diese Vorprüfung misst Fall 9 nichts: `take` weist zuerst ab, wer für
    den Dienst nicht freigeschaltet ist („not-qualified"), und das sähe genauso
    aus wie die Prüfung, um die es geht („not-sought"). Die Probe muss den
    Unterschied kennen, sonst meldet sie S13 als geschlossen, ohne dort gewesen
    zu sein.
  */
  it('liest den Dienst aus einem Hilfsdienst-Schlüssel', () => {
    expect(dienstAusSchluessel(helferKey('2026-08-17', 'mid', 'mik', 1))).toBe('mik')
  })

  it.each([
    ['Programmpunkt', '2026-08-17|mid|part|k3f9x|0'],
    ['Treffpunkt', 'fs|2026-08-17|abc'],
    ['zu kurz', '2026-08-17|mid'],
    ['leer', ''],
    ['nichts', undefined],
  ])('%s ist kein Hilfsdienst — null', (_name, key) => {
    expect(dienstAusSchluessel(key)).toBeNull()
  })

  it('die Freischaltung wird genauso gelesen wie in der App', () => {
    const person = { priv: { 'svc:mik': true } } as unknown as Person
    expect(qualifiziertFuer(person, 'mik')).toBe(isQualified(person, serviceQualKey('mik')))
    expect(qualifiziertFuer(person, 'ton')).toBe(isQualified(person, serviceQualKey('ton')))
  })

  it('und eine Person ohne priv fällt nicht auf die Nase', () => {
    // Im Altbestand kann `priv` fehlen; ein Absturz hier bräche die ganze Probe
    // ab, statt Fall 9 als „nicht gemessen" zu melden.
    for (const p of [undefined, null, {}, { priv: null }]) {
      expect(qualifiziertFuer(p, 'mik')).toBe(false)
    }
  })
})

describe('Woher die Probe ihren Zugang nimmt', () => {
  /*
    Bis zum 3.10.2026 verlangte sie sechs Umgebungsvariablen im selben
    Fenster — und ihr erster Lauf scheiterte an einem Platzhalter im Aufruf.
    Jetzt wie die übrigen Skripte: URL und Schlüssel aus `.env.local`, die
    Konten wie in testversammlung-anlegen.mjs, Kennwörter verdeckt erfragt.
  */
  const datei: Record<string, string> = { VITE_SUPABASE_URL: 'https://datei.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_aus_der_datei' }
  const ausDatei = (name: string) => datei[name] ?? ''

  it('ohne Umgebung: URL und Schlüssel aus der Datei, die Konten der Testversammlung, kein Kennwort', () => {
    expect(zugangAus({}, ausDatei)).toEqual({
      url: 'https://datei.invalid',
      anon: 'sb_publishable_aus_der_datei',
      versammlung: '',
      planerMail: PROBE_KONTEN.planer,
      mitgliedMail: PROBE_KONTEN.mitglied,
      zuteilerMail: PROBE_KONTEN.zuteiler,
      aufseherMail: PROBE_KONTEN.aufseher,
      planerPass: '',
      mitgliedPass: '',
      zuteilerPass: '',
      aufseherPass: '',
      dienstSchluessel: false,
    })
  })

  it('die Umgebung schlägt die Datei — für andere Konten oder ohne Terminal', () => {
    const z = zugangAus(
      {
        SUPABASE_URL: 'https://env.invalid', SUPABASE_ANON_KEY: 'sb_publishable_env', PROBE_PLANER_MAIL: 'a@x.invalid', PROBE_MITGLIED_PASS: 'geheim',
        PROBE_ZUTEILER_MAIL: 'z@x.invalid', PROBE_AUFSEHER_PASS: 'auch-geheim',
      },
      ausDatei,
    )
    expect(z).toMatchObject({
      url: 'https://env.invalid', anon: 'sb_publishable_env', planerMail: 'a@x.invalid', mitgliedPass: 'geheim',
      zuteilerMail: 'z@x.invalid', aufseherPass: 'auch-geheim',
    })
  })

  /*
    Seit dem 5.10.2026 schreibt das Anlege-Skript Versammlung und Kennwörter in
    eine Kontendatei (`.env.probe`), und die Probe liest sie von dort. Am 4.10.
    nahm die verdeckte Abfrage im Terminal der Desktop-App keine Eingabe an,
    und am nächsten Tag waren die Kennwörter aus dem Rückblick verschwunden.
  */
  it('die Kontendatei liefert Versammlung, Adressen und Kennwörter — die Umgebung geht vor', () => {
    const datei: Record<string, string> = { PROBE_VERSAMMLUNG: 'v-datei', PROBE_PLANER_PASS: 'aus-der-datei', PROBE_ZUTEILER_MAIL: 'z@datei.invalid' }
    const z = zugangAus({ PROBE_PLANER_PASS: 'aus-der-umgebung' }, ausDatei, (name) => datei[name] ?? '')
    expect(z).toMatchObject({
      versammlung: 'v-datei', planerPass: 'aus-der-umgebung', zuteilerMail: 'z@datei.invalid', mitgliedPass: '', planerMail: PROBE_KONTEN.planer,
    })
  })

  it('was das Anlege-Skript schreibt, liest die Probe — unter denselben Namen', () => {
    // Zwei Skripte, ein Format: Hieße ein Name hier anders als dort, fände die
    // Probe die Kennwörter nicht und fragte wieder — genau das, was die Datei
    // abschaffen soll.
    const text = probeDateiText('v1', TEST_KONTEN.map((k) => ({ env: k.env, mail: k.mail, pass: `kennwort-${k.env}`, stufe: k.stufe })))
    const z = zugangAus({}, ausDatei, (name) => wertAusEnvText(text, name))
    expect(z).toMatchObject({
      versammlung: 'v1',
      planerMail: 'planer@probe.invalid', planerPass: 'kennwort-PLANER',
      mitgliedMail: 'mitglied@probe.invalid', mitgliedPass: 'kennwort-MITGLIED',
      zuteilerMail: 'zuteiler@probe.invalid', zuteilerPass: 'kennwort-ZUTEILER',
      aufseherMail: 'aufseher@probe.invalid', aufseherPass: 'kennwort-AUFSEHER',
    })
  })

  it('die Kontendatei kommt nie ins Repository — Git ignoriert sie', () => {
    const git = spawnSync('git', ['check-ignore', '-q', PROBE_DATEI], { cwd: path.join(import.meta.dirname, '..') })
    expect(git.status, 'git check-ignore: 0 heißt ignoriert').toBe(0)
  })

  it('die Konten heißen wie in testversammlung-anlegen.mjs — dort entstehen sie', () => {
    // Zwei Skripte, eine Liste: Wiche eine Adresse ab, fragte die Probe nach
    // einem Konto, das es nicht gibt, und die Anmeldung scheiterte.
    expect(PROBE_KONTEN).toEqual({
      planer: TEST_KONTEN.find((k) => k.planner)!.mail,
      mitglied: TEST_KONTEN.find((k) => k.stufe === 'Mitglied')!.mail,
      zuteiler: TEST_KONTEN.find((k) => k.zuteiler)!.mail,
      aufseher: TEST_KONTEN.find((k) => k.stufe === 'Gruppenaufseher')!.mail,
    })
  })

  it.each([
    ['ein sb_secret-Schlüssel', { SUPABASE_ANON_KEY: 'sb_secret_xyz' }],
    ['derselbe wie der Service-Role-Schlüssel', { SUPABASE_ANON_KEY: 'eyJdienst', SUPABASE_SERVICE_ROLE_KEY: 'eyJdienst' }],
    ['derselbe wie der Secret-Schlüssel', { SUPABASE_ANON_KEY: 'sb_neu_1', SUPABASE_SECRET_KEY: 'sb_neu_1' }],
  ])('%s als anon-Schlüssel umginge RLS — erkannt', (_name, env) => {
    expect(zugangAus(env, ausDatei).dienstSchluessel).toBe(true)
  })

  it('kein Schlüssel ist kein Dienst-Schlüssel, nur ein fehlender', () => {
    // Sonst meldete die Probe „Dienst-Schlüssel", wo schlicht nichts steht.
    const z = zugangAus({}, () => '')
    expect(z).toMatchObject({ anon: '', url: '', dienstSchluessel: false })
  })
})

describe('Tage wie in der Datenbank', () => {
  /*
    Gruppenbesuche, Vormerkungen und Treffpunkt-Wochen verlangen einen Montag
    (`extract(isodow …) = 1`). Ein Tag, der um eins verrutscht, scheiterte an
    der Datenbank — und die Probe hielte das für eine Abweisung über die Rechte.
  */
  const tage = (von: string, anzahl: number) => Array.from({ length: anzahl }, (_, i) => tagPlus(von, i))

  it('der Wochentag zählt wie `extract(dow …)` in Postgres: 0 ist Sonntag', () => {
    expect(wochentag('2026-10-04')).toBe(0) // Sonntag
    expect(wochentag('2026-10-05')).toBe(1) // Montag
  })

  it('der erste Montag ab einem Tag ist ein Montag, frühestens der Tag selbst, spätestens sechs Tage danach', () => {
    for (const tag of tage('2098-12-28', 14)) {
      const montag = ersterMontagAb(tag)
      expect(wochentag(montag)).toBe(1)
      expect(montag >= tag && montag <= tagPlus(tag, 6), `${tag} → ${montag}`).toBe(true)
    }
  })
})

describe('T120: einen Leseversuch bewerten', () => {
  it('unsichtbar, wo es unsichtbar gehört — sichtbar, wo es sichtbar gehört', () => {
    expect(bewerteSicht(200, false, false)).toMatchObject({ durch: false, wieErwartet: true, erwartet: false })
    expect(bewerteSicht(200, true, true)).toMatchObject({ durch: true, wieErwartet: true, erwartet: true })
  })

  it('und jede Überraschung fällt auf — in beide Richtungen', () => {
    expect(bewerteSicht(200, true, false).wieErwartet).toBe(false)
    expect(bewerteSicht(200, false, true).wieErwartet).toBe(false)
    expect(bewerteSicht(200, true, false, 'Plan 1/1, Einträge 0/1').text).toBe('SICHTBAR (HTTP 200; Plan 1/1, Einträge 0/1)')
  })

  it.each([401, 403, 400, 500])('ein Lesen mit %i ist kein „unsichtbar" — es zeigte bloß nichts', (status) => {
    // RLS antwortet beim Lesen mit weniger Zeilen, nicht mit 403. Ein
    // gescheitertes Lesen sähe sonst aus wie die Grenze, die greift.
    expect(bewerteSicht(status, false, false)).toMatchObject({ wieErwartet: false, kaputt: true })
  })

  it('beim Löschen und Ändern heißt das Ergebnis, was geschah', () => {
    expect(bewerteVersuch(204, true, true, { woerter: ['GELÖSCHT', 'nicht gelöscht'] }).text).toBe('GELÖSCHT (HTTP 204)')
    expect(bewerteVersuch(204, false, false, { woerter: ['GEÄNDERT', 'nicht geändert'] })).toMatchObject({
      wieErwartet: true,
      erwartet: false,
      text: 'nicht geändert (HTTP 204)',
    })
  })
})

describe('T120: die Anlage erfüllt die Regeln der Datenbank, die mit den Rechten nichts zu tun haben', () => {
  /*
    Scheiterte eine Zeile an einer anderen Regel — ein Gruppenbesuch nicht am
    Montag, zwei Einträge auf einem Platz —, sähe das aus wie eine Abweisung
    über die Rechte, und die Probe meldete „greift", ohne dort gewesen zu sein.
  */
  const marke = 'PROBE-1'
  const a = t120Anlage({ marke, versammlung: 'c', tag0: ersterMontagAb('2099-01-01'), planerPid: 'p-planer', mitgliedPid: 'p-mitglied', gruppe: 'g1' })
  const eintraege = [...Object.values(a.eintraege).flat(), a.eintragVersuch]

  it('Gruppenbesuche an einem Montag, dieselbe Gruppe nicht zweimal in einer Woche', () => {
    for (const b of [a.besuch!, a.besuchVersuch!]) expect(wochentag(b.woche)).toBe(1)
    expect(a.besuch!.woche).not.toBe(a.besuchVersuch!.woche)
  })

  it('ein Platz je Plan und Woche (plan_eintraege_woche), jeder an einem Montag im Zeitraum seines Plans', () => {
    expect(new Set(eintraege.map((e) => `${e.plan_id}|${e.datum}`)).size).toBe(eintraege.length)
    const plaene = [...Object.values(a.plaene), a.planVersuch]
    for (const p of plaene) expect(p.bis >= p.von, p.id).toBe(true)
    for (const e of eintraege) {
      const plan = plaene.find((p) => p.id === e.plan_id)!
      expect(wochentag(e.datum), e.id).toBe(1)
      expect(e.datum >= plan.von && e.datum <= plan.bis, e.id).toBe(true)
    }
  })

  it('jede Kennung trägt das Kennzeichen — daran findet das Aufräumen genau diese Zeilen', () => {
    const ids = [...Object.values(a.plaene), a.planVersuch, ...eintraege, a.besuch!, a.besuchVersuch!].map((z) => z.id)
    expect(ids.every((id) => id.startsWith(`${marke}-`))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('(34) zielt auf genau eine Regel: eine freie Woche des veröffentlichten Plans', () => {
    // Sehen darf das Mitglied den Plan, die Woche ist frei — abweisen kann nur
    // noch die Schreib-Richtlinie.
    expect(a.eintragVersuch).toMatchObject({ plan_id: a.plaene.saal.id })
    expect(a.plaene.saal.entwurf).toBe(false)
    expect(a.eintraege.saal.map((e) => e.datum)).not.toContain(a.eintragVersuch.datum)
  })

  it('ohne Gruppe gibt es keinen Gruppenbesuch — (11) und (12) bleiben dann ungemessen', () => {
    const ohne = t120Anlage({ marke, versammlung: 'c', tag0: '2099-01-05', planerPid: 'p1', mitgliedPid: 'p2' })
    expect(ohne.besuch).toBeNull()
    expect(ohne.besuchVersuch).toBeNull()
  })
})

describe('T122: die Vormerkungen erfüllen die Regeln der Datenbank, die mit den Rechten nichts zu tun haben', () => {
  /*
    `vortraege` verlangt einen Montag, einen Redner und als Lied höchstens drei
    Ziffern, und je Woche gibt es eine Vormerkung. Scheiterte ein Versuch
    daran, sähe das aus wie eine Abweisung über die Rechte — (67) und (68)
    meldeten „greift", ohne dort gewesen zu sein.
  */
  const marke = 'PROBE-1'
  const a = vortragAnlage({ marke, versammlung: 'c', tag0: ersterMontagAb('2099-01-01') })
  const alle = [a.vortrag, ...Object.values(a.versuche)]

  it('jede an einem Montag, jede in einer eigenen Woche (unique congregation_id, woche)', () => {
    for (const v of alle) expect(wochentag(v.woche), v.id).toBe(1)
    expect(new Set(alle.map((v) => v.woche)).size).toBe(alle.length)
  })

  it('ein auswärtiger Redner, wie der Import ihn vormerkt: Name und Versammlung, keine Person', () => {
    for (const v of alle) {
      expect(v.redner, v.id).not.toBe('')
      expect(v, v.id).toMatchObject({ eigener: false, person_id: null, versammlung: marke })
      expect(v.lied, v.id).toMatch(/^[0-9]{0,3}$/)
    }
  })

  it('jede Kennung trägt das Kennzeichen — daran findet das Aufräumen genau diese Zeilen', () => {
    const ids = alle.map((v) => v.id)
    expect(ids.every((id) => id.startsWith(`${marke}-`))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/** Ein Feld eines Objekts, wie die Probe es liest — ohne Typ, denn sie liest rohes JSON. */
const feld = (o: unknown, name: string): unknown => (o as Record<string, unknown> | undefined)?.[name]

describe('Rechte-Stufen: die Änderungen an der Woche sind je genau eine', () => {
  /*
    (35) und (38) benennen einen Programmpunkt um, (39) gibt einen Platz frei.
    Ändert ein Versuch mehr als das Genannte oder etwas anderes, misst er
    nicht, was die Ausgabe behauptet. Seit dem 15.10.2026 schreibt der Planer
    Wochen unmittelbar; bis dahin hielt dieser Test die Versuche an der Grenze
    `nurZuteilungen` der Function `zuteilen`.
  */
  // Die Wochen der Entwicklerseite, mit Personen-Ids wie nach dem Laden —
  // ohne `pid` gäbe es keinen besetzten Platz zum Freigeben.
  const wochen = pidsNachtragen(buildDemoWeeks(), DEMO_PERSONS).map((w) => [w.start, w] as const)
  type Platz = { pid?: string }
  type Punkt = { title?: string; names?: Platz[] }
  const punkte = (d: unknown): Punkt[] =>
    (d as { mid: { sections: { items: Punkt[] }[] } }).mid.sections.flatMap((s) => s.items)
  const platz = (d: unknown, s: { si: number; ii: number; ni: number }): Platz | undefined =>
    (d as { mid: { sections: { items: { names: Platz[] }[] }[] } }).mid.sections[s.si]?.items[s.ii]?.names[s.ni]

  it.each(wochen)('%s: die Änderung am Plan benennt genau einen Punkt um — sonst nichts', (_start, w) => {
    const plan = planAenderung(w, 'PROBE-1')
    expect(plan).not.toBeNull()
    const vorher = punkte(w)
    const nachher = punkte(plan!.data)
    const anders = nachher.map((p, i) => (JSON.stringify(p) === JSON.stringify(vorher[i]) ? -1 : i)).filter((i) => i >= 0)
    expect(anders).toHaveLength(1)
    expect(nachher[anders[0]!]!.title).toBe(`${vorher[anders[0]!]!.title} PROBE-1`)
    expect(JSON.stringify({ ...plan!.data, mid: undefined })).toBe(JSON.stringify({ ...w, mid: undefined }))
  })

  it.each(wochen)('%s: die Zuteilung gibt genau einen besetzten Platz frei', (_start, w) => {
    const z = zuteilungAenderung(w)
    expect(z).not.toBeNull()
    expect(platz(w, z!)?.pid).toBeTruthy()
    expect(platz(z!.data, z!)?.pid).toBeUndefined()
    const besetzt = (d: unknown) => punkte(d).flatMap((p) => p.names ?? []).filter((n) => n.pid).length
    expect(besetzt(z!.data)).toBe(besetzt(w) - 1)
  })

  it('ohne passenden Punkt keine Änderung — dann bleibt der Fall ungemessen, statt etwas anderes zu messen', () => {
    expect(planAenderung({ mid: { sections: [] } }, 'PROBE-1')).toBeNull()
    expect(planAenderung({}, 'PROBE-1')).toBeNull()
    const ohneBesetzung = { mid: { sections: [{ items: [{ song: 'Lied 1' }, { iid: 'a', title: 'Probe', names: [{ name: '' }] }] }] } }
    expect(zuteilungAenderung(ohneBesetzung)).toBeNull()
  })
})

describe('Rechte-Stufen: welche Gruppe die eigene ist und welche die fremde', () => {
  const konten = { aufseherPid: 'p-aufseher', zuteilerPid: 'p-zuteiler', mitgliedPid: 'p-mitglied' }
  const g = (id: string, overseer_id: string | null = null, assistant_id: string | null = null) => ({ id, overseer_id, assistant_id })

  it('die eigene leitet der Gruppenaufseher — als Aufseher oder als Gehilfe', () => {
    expect(gruppenWahl([g('g1', 'p-admin'), g('g2', 'p-aufseher')], konten).eigene).toBe('g2')
    expect(gruppenWahl([g('g1', 'p-admin', 'p-aufseher')], konten).eigene).toBe('g1')
  })

  it('die fremde leitet keines der Probekonten — sonst mäße ein Versuch ein anderes Recht', () => {
    const wahl = gruppenWahl([g('g1', 'p-aufseher'), g('g2', 'p-zuteiler'), g('g3', null, 'p-mitglied'), g('g4', 'p-admin')], konten)
    expect(wahl).toEqual({ eigene: 'g1', fremde: 'g4', mitgliedLeitet: true })
  })

  it('fehlt eine, ist sie null — dann bleiben die Fälle ungemessen', () => {
    expect(gruppenWahl([g('g1', 'p-aufseher')], konten)).toEqual({ eigene: 'g1', fremde: null, mitgliedLeitet: false })
    expect(gruppenWahl([], konten)).toEqual({ eigene: null, fremde: null, mitgliedLeitet: false })
  })

  it('ein Konto ohne Person leitet nichts — auch keine Gruppe ohne Aufseher', () => {
    // `null === null`: Ohne die Prüfung „hat eine Person" leitete ein Konto
    // ohne Person jede Gruppe, deren Aufseher fehlt.
    const ohnePerson = { aufseherPid: null, zuteilerPid: null, mitgliedPid: null }
    expect(gruppenWahl([g('g1'), g('g2')], ohnePerson)).toEqual({ eigene: null, fremde: 'g1', mitgliedLeitet: false })
  })
})

describe('Rechte-Stufen: die Anlage — jeder Versuch trifft genau eine Regel', () => {
  const tag0 = ersterMontagAb('2099-01-01')
  const a = stufenAnlage({
    marke: 'PROBE-1', versammlung: 'c', tag0, adminPid: 'p-admin', zuteilerPid: 'p-zuteiler', eigeneGruppe: 'g-eigen', fremdeGruppe: 'g-fremd',
  })

  /** Was ein Versuch an den Treffpunkten der Anlage ändert: `<Kennung>.<Feld>`. */
  const unterschiede = (data: unknown[]): string[] =>
    a.treffpunkte.flatMap((t, i) => {
      const neu = data[i]
      const felder = new Set([...Object.keys(t), ...Object.keys(neu as object)])
      return [...felder].filter((f) => feld(t, f) !== feld(neu, f)).map((f) => `${t.id}.${f}`)
    })

  it('wer was versucht, und was herauskommen soll', () => {
    expect(a.fsVersuche.map((v) => `${v.nr} ${v.wer} ${v.erwartet ? 'durch' : 'abgewiesen'}`)).toEqual([
      '42 zuteiler durch', '43 zuteiler durch', '44 aufseher abgewiesen', '45 aufseher abgewiesen',
      '46 aufseher abgewiesen', '47 aufseher durch', '48 aufseher durch', '49 mitglied abgewiesen',
    ])
  })

  it('jeder Versuch ändert einen Treffpunkt in einem Feld — der Leiter kommt mit seiner Person, (48) mit der eines fremden', () => {
    expect(Object.fromEntries(a.fsVersuche.map((v) => [v.nr, unterschiede(v.data)]))).toEqual({
      42: ['PROBE-1-fs-versammlung.place'],
      43: ['PROBE-1-fs-versammlung.leader', 'PROBE-1-fs-versammlung.lpid'],
      44: ['PROBE-1-fs-fremd.place'],
      45: ['PROBE-1-fs-fremd.leader'],
      46: ['PROBE-1-fs-versammlung.place'],
      47: ['PROBE-1-fs-eigen.place'],
      48: ['PROBE-1-fs-eigen.place', 'PROBE-1-fs-fremd.lpid'],
      49: ['PROBE-1-fs-versammlung.place'],
    })
  })

  it('nachgesehen wird genau das geänderte Feld — vorher steht dort etwas anderes', () => {
    for (const v of a.fsVersuche) {
      expect(feld(v.data.find((t) => feld(t, 'id') === v.ziel), v.feld), `(${v.nr})`).toBe(v.wert)
      expect(feld(a.treffpunkte.find((t) => t.id === v.ziel), v.feld), `(${v.nr})`).not.toBe(v.wert)
    }
  })

  it('die drei Treffpunkte gehören der eigenen Gruppe, einer fremden und keiner', () => {
    expect(a.treffpunkte.map((t) => t.grp)).toEqual(['g-eigen', 'g-fremd', null])
  })

  it('Grundplan: der Planer und der Gruppenaufseher an der fremden Gruppe, der Gruppenaufseher an der eigenen', () => {
    expect([a.regeln.planer.grp, a.regeln.aufseherFremd.grp, a.regeln.aufseherEigen.grp]).toEqual(['g-fremd', 'g-fremd', 'g-eigen'])
  })

  it('Gruppenbesuch: Verschieben und Besucher ändern je ein Feld, Anlegen nimmt eine neue Kennung', () => {
    const { verschoben, besucher, neu } = a.besuchVersuche
    const diff = (x: object) => Object.keys(a.besuch).filter((f) => feld(a.besuch, f) !== feld(x, f))
    expect(diff(verschoben)).toEqual(['woche'])
    expect(diff(besucher)).toEqual(['person_id'])
    expect(besucher.person_id).toBe('p-zuteiler')
    expect(neu.id).not.toBe(a.besuch.id)
    // Jeder an einem Montag, keine Gruppe zweimal in einer Woche
    // (`unique (congregation_id, woche, grp)`) — sonst schiene das eine Abweisung.
    for (const b of [a.besuch, verschoben, neu]) expect(wochentag(b.woche)).toBe(1)
    expect(new Set([a.besuch, verschoben, neu].map((b) => `${b.woche}|${b.grp}`)).size).toBe(3)
  })

  it('die Pläne erfüllen die Regeln der Datenbank, die mit den Rechten nichts zu tun haben', () => {
    for (const e of [a.planEintrag, a.eintragVersuch]) {
      expect(wochentag(e.datum)).toBe(1)
      expect(e.datum >= a.plan.von && e.datum <= a.plan.bis, e.id).toBe(true)
    }
    expect(a.planEintrag.datum).not.toBe(a.eintragVersuch.datum)
    expect(a.plan.entwurf).toBe(true)
    expect(a.planVersuch.id).not.toBe(a.plan.id)
  })

  it('alles liegt hinter den Wochen von T120 — die Treffpunkt-Woche ist ein Montag', () => {
    const t120 = t120Anlage({ marke: 'PROBE-1', versammlung: 'c', tag0, planerPid: 'p-admin', mitgliedPid: 'p-mitglied', gruppe: 'g-fremd' })
    const spaetestens = [t120.plaene.saal.bis, t120.besuch!.woche].sort().at(-1)!
    expect(wochentag(a.fsStart)).toBe(1)
    expect(a.fsStart > spaetestens).toBe(true)
    expect(a.besuch.woche >= a.fsStart).toBe(true)
  })

  it('jede Kennung trägt das Kennzeichen — daran findet das Aufräumen genau diese Zeilen', () => {
    const zeilen = [
      ...a.treffpunkte, ...Object.values(a.regeln), a.besuch, a.besuchVersuche.neu, a.plan, a.planEintrag, a.eintragVersuch, a.planVersuch,
    ]
    const ids = zeilen.map((z) => z.id)
    expect(ids.every((id) => id.startsWith('PROBE-1-'))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(a.absage.startsWith('PROBE-1 ')).toBe(true)
  })
})

describe('Was der Planer anlegt (40, 80): die Regeln, die mit den Rechten nichts zu tun haben', () => {
  /*
    Scheiterte (40) an `weeks_start_montag` oder am Schlüssel, sähe es aus wie
    „ZU STRENG"; scheiterte (80) am eindeutigen Namen, wie eine Abweisung.
  */
  const tag0 = ersterMontagAb('2099-01-01')
  const a = verwaltungAnlage({ marke: 'PROBE-1', versammlung: 'c', tag0, personId: '00000000-0000-4000-8000-0000000000aa' })
  const stufen = stufenAnlage({
    marke: 'PROBE-1', versammlung: 'c', tag0, adminPid: 'p-admin', zuteilerPid: 'p-zuteiler', eigeneGruppe: 'g-eigen', fremdeGruppe: 'g-fremd',
  })

  it('die Woche an einem Montag, hinter allem anderen der Probe — mit dem Kennzeichen im Zeitraum', () => {
    expect(wochentag(a.woche.start)).toBe(1)
    const spaeteste = [stufen.fsStart, stufen.besuchVersuche.neu.woche, stufen.plan.bis, vortragAnlage({ marke: 'PROBE-1', versammlung: 'c', tag0 }).versuche.planer.woche]
    for (const tag of spaeteste) expect(a.woche.start > tag, tag).toBe(true)
    expect(a.woche.data.range).toBe('PROBE-1')
    expect(a.woche.data.start).toBe(a.woche.start)
  })

  it('die Person mit dem Kennzeichen im Vornamen und einer echten Kennung', () => {
    expect(a.person).toEqual({ id: '00000000-0000-4000-8000-0000000000aa', congregation_id: 'c', fn: 'PROBE-1', ln: 'Probe' })
  })
})

describe('Alte Abwesenheiten (82)–(85): die Anlage liegt sicher hinter der Grenze der Leseregel', () => {
  /*
    `absences_select` lässt sehen, was nach dem Montag dieser Woche minus acht
    Wochen endet. Läge die Anlage auf der Grenze, sähe das Mitglied sie — und
    (82) meldete „AUCH DAS!", ohne dass die Regel offen wäre. Darum neun Wochen,
    gerechnet vom Montag der laufenden Woche, an jedem Wochentag.
  */
  const admin = { uid: 'u-admin', pid: 'p-admin' }
  const mitglied = { uid: 'u-mitglied', pid: 'p-mitglied' }
  const ids = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2']

  it.each(['2026-10-19', '2026-10-21', '2026-10-25'])('am %s: neun Wochen vor dem Montag dieser Woche, also vor der Grenze', (heute) => {
    const a = abwesenheitAnlage({ marke: 'PROBE-1', versammlung: 'c', heute, admin, mitglied, ids })
    const montag = ersterMontagAb(tagPlus(heute, -6))
    const grenze = tagPlus(montag, -7 * 8)
    expect(wochentag(montag)).toBe(1)
    for (const z of [a.fremde, a.eigene]) {
      expect(z.to_date < grenze, z.to_date).toBe(true)
      expect(z.from_date <= z.to_date).toBe(true)
    }
  })

  it('die fremde gehört dem Admin, die eigene dem Mitglied — beide mit dem Kennzeichen im Grund', () => {
    const a = abwesenheitAnlage({ marke: 'PROBE-1', versammlung: 'c', heute: '2026-10-19', admin, mitglied, ids })
    expect(a.fremde).toMatchObject({ id: ids[0], user_id: 'u-admin', person_id: 'p-admin', congregation_id: 'c', reason: 'PROBE-1' })
    expect(a.eigene).toMatchObject({ id: ids[1], user_id: 'u-mitglied', person_id: 'p-mitglied', reason: 'PROBE-1' })
  })
})

describe('Trolleys: die Anlage erfüllt die Regeln, die mit den Rechten nichts zu tun haben', () => {
  /*
    Scheiterte ein Versuch an einer anderen Regel — eine Zeit außerhalb des
    Rasters, der Trolley schon unterwegs, das Mitglied zur selben Zeit schon
    eingetragen —, wiese ihn die Function mit `bad-request`, `belegt` oder
    `doppelt` ab, der Trigger mit einem 400. Die Probe meldete „kaputt" statt
    eines Urteils, und bei (71) fragte die Datenbank die Richtlinie gar nicht
    erst. Gehalten an den Regeln der Function (`_shared/trolley.ts`), nicht
    an einer Abschrift.
  */
  const marke = 'PROBE-1'
  const a = trolleyAnlage({ marke, versammlung: 'c', tag0: ersterMontagAb('2099-01-01'), mitgliedPid: 'p-mitglied' })
  /** Jeder Termin der Probe: (71) direkt in der Tabelle, (74) und (75) über die Function. */
  const termine = [
    { fall: '(71)', datum: a.direkt.datum, von: a.direkt.von, bis: a.direkt.bis },
    { fall: '(74)', datum: a.ohneRecht.datum, von: a.ohneRecht.von, bis: a.ohneRecht.bis },
    { fall: '(75)', datum: a.eigener.datum, von: a.eigener.von, bis: a.eigener.bis },
  ]

  it('jede Zeit liegt im Raster der Function: 6 bis 22 Uhr, halbe Stunden, das Ende nach dem Anfang', () => {
    for (const t of termine) expect(zeitraumGueltig(t.von, t.bis), t.fall).toBe(true)
  })

  it('jeder Termin an einem eigenen Tag im Jahr 2099 — kommt einer unerwartet durch, belegt er nichts für den nächsten', () => {
    for (const t of termine) expect(t.datum.startsWith('2099-'), t.fall).toBe(true)
    for (const x of termine) {
      for (const y of termine) if (x !== y) expect(ueberschneiden(x, y), `${x.fall} und ${y.fall}`).toBe(false)
    }
  })

  it('jeder am Trolley der Anlage, allein, mit „Partner gesucht" — so geht keine Mitteilung hinaus', () => {
    for (const t of [a.ohneRecht, a.eigener]) expect(t, t.id).toMatchObject({ trolleyId: a.trolley.id, partner: null })
    expect(a.direkt).toMatchObject({ trolley_id: a.trolley.id, partner_id: null, gemeinsam: false })
  })

  it('(71) trägt das Mitglied selbst ein, wie die Function es täte — abweisen kann allein die fehlende Schreib-Richtlinie', () => {
    expect(a.direkt).toMatchObject({ congregation_id: 'c', person_id: 'p-mitglied' })
  })

  it('jeder Trolley hat einen Namen und eine eigene Kennung — sonst scheiterte (72) oder (73) an `btrim(name)` oder am Schlüssel', () => {
    const trolleys = [a.trolley, ...Object.values(a.versuche)]
    for (const t of trolleys) expect(t.name.trim(), t.id).not.toBe('')
    expect(new Set(trolleys.map((t) => t.id)).size).toBe(trolleys.length)
  })

  it('jede Kennung trägt das Kennzeichen — daran findet das Aufräumen genau diese Zeilen', () => {
    const ids = [a.trolley, ...Object.values(a.versuche), a.direkt, a.ohneRecht, a.eigener].map((z) => z.id)
    expect(ids.every((id) => id.startsWith(`${marke}-`))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Tauschen (93)–(110): jeder Versuch trifft genau die Regel, die er messen soll', () => {
  /*
    Die Probe misst die Function `tauschen` an einer Anlage, die sie selbst
    anlegt. Träfe ein Versuch eine Regel davor — ein Platz, den es nicht gibt,
    eine Woche ohne „Plan senden", jemand, der den Dienst nicht kann —, wiese
    die Function aus dem falschen Grund ab, und die Probe hielte es für die
    Grenze, die greift. Gehalten an den Regeln der Function selbst
    (`tauschen/regeln.ts`), nicht an einer Abschrift.
  */
  const heute = '2026-11-03' // ein Dienstag: gestern und heute liegen in derselben Woche
  const [vorbei] = vorbeiKandidaten(heute)
  const svc = 'mik'
  const tag0 = ersterMontagAb('2099-01-01')
  const mitglied = { id: 'p-mitglied', uid: 'u-mitglied', name: 'Probe Mitglied' }
  const aufseher = { id: 'p-aufseher', name: 'Probe Aufseher' }
  const a = tauschAnlage({ marke: 'PROBE-1', versammlung: 'c', tag0, svc, vorbei: vorbei!, mitglied, aufseher, ohneKontoId: 'p-ohne', anfrageId: 'a-1' })
  const p = a.plaetze
  const wochen = Object.values(a.wochen).filter((w) => w !== null)
  const frei = { [`svc:${svc}`]: true }
  const personen = [
    { id: mitglied.id, fn: 'Probe', ln: 'Mitglied', priv: frei },
    { id: aufseher.id, fn: 'Probe', ln: 'Aufseher', priv: frei },
    a.person,
  ]
  /** Die Lage, wie die Function sie läse — gesendet ist, wofür die Probe „Plan senden" drückt; freigeschaltet sind alle. */
  const lage = (patch: Partial<Lage> = {}): Lage => ({
    wochen: new Map(wochen.map((w) => [w.start, { start: w.start, data: w.data as Week, updated_at: '' }])),
    services: [{ key: svc, name: 'Mikrofone', count: 2, groups: false }],
    personen: new Map(personen.map((x) => [x.id, x])),
    abwesend: () => false,
    gesendet: new Set(a.senden.map((w) => w.start)),
    zeiten: STANDARD_ZEITEN,
    heute,
    ...patch,
  })

  it('die Wochen: Montage, jede für sich, die Probewochen hinter allem anderen der Probe — mit dem Kennzeichen als Zeitraum', () => {
    for (const w of wochen) expect(wochentag(w.start), w.start).toBe(1)
    expect(new Set(wochen.map((w) => w.start)).size).toBe(wochen.length)
    for (const w of wochen) expect(w.data.range, w.start).toBe('PROBE-1')
    // Die andere Woche, die die Probe anlegt, ist die aus (40).
    const verwaltung = verwaltungAnlage({ marke: 'PROBE-1', versammlung: 'c', tag0, personId: 'x' }).woche.start
    for (const w of [a.wochen.abgeben, a.wochen.nehmen, a.wochen.direkt, a.wochen.ungesendet]) expect(w.start > verwaltung, w.start).toBe(true)
  })

  it('jeder Schlüssel nennt einen Platz, auf dem die genannte Person steht', () => {
    const steht = (key: string) => {
      const [start, tab, , dienst, pos] = key.split('|')
      return (wochen.find((w) => w.start === start)!.data as Week)[tab as 'mid' | 'we']?.helpers?.[dienst!]?.[Number(pos)]?.pid
    }
    expect([p.a, p.b, p.eigenMitte, p.ohneKonto, p.ungesendet, p.vorbei].map((key) => steht(key!))).toEqual([
      mitglied.id, aufseher.id, mitglied.id, a.person.id, aufseher.id, mitglied.id,
    ])
    for (const [key, pid] of Object.entries(a.inhaber)) expect(steht(key), key).toBe(pid)
  })

  it('(95) einen fremden Platz weggeben: not-yours — vor jeder anderen Regel', () => {
    expect(tauschPruefen(lage(), p.b, p.ohneKonto, mitglied.id)).toEqual({ ok: false, fehler: 'not-yours' })
  })

  it('(96) um einen Platz ohne „Plan senden" bitten: not-published', () => {
    expect(tauschPruefen(lage(), p.a, p.ungesendet, mitglied.id)).toEqual({ ok: false, fehler: 'not-published' })
  })

  it('(97) eine Zusammenkunft, die schon war: past — am Tag selbst ginge es noch', () => {
    expect(tagDerZusammenkunft({ start: a.wochen.vorbei!.start, data: a.wochen.vorbei!.data as Week, updated_at: '' }, 'we', STANDARD_ZEITEN)).toBe(vorbei)
    expect(tauschPruefen(lage({ heute: a.heuteVorbei!.tauschen }), p.vorbei!, p.b, mitglied.id)).toEqual({ ok: false, fehler: 'past' })
    expect(tauschPruefen(lage({ heute: a.heuteVorbei!.senden }), p.vorbei!, p.b, mitglied.id).ok).toBe(true)
  })

  it('(97) beide Tage glaubt der Server, und „Plan senden" nimmt die Zusammenkunft noch mit — für gestern wie für heute', () => {
    const server = Date.parse(heute)
    for (const tag of vorbeiKandidaten(heute)) {
      const b = tauschAnlage({ marke: 'PROBE-1', versammlung: 'c', tag0, svc, vorbei: tag, mitglied, aufseher, ohneKontoId: 'p-ohne', anfrageId: 'a-1' })
      expect(heuteUtc(b.heuteVorbei!.senden, server), tag).toBe(Date.parse(b.heuteVorbei!.senden))
      expect(heuteUtc(b.heuteVorbei!.tauschen, server), tag).toBe(Date.parse(b.heuteVorbei!.tauschen))
      const w = b.wochen.vorbei!
      const offen = offeneDerWoche(w.start, w.data as Week, [], [...lage().services], new Map(), STANDARD_ZEITEN, heuteUtc(b.heuteVorbei!.senden, server))
      expect(offen.map((o) => o.key), tag).toEqual([b.plaetze.vorbei])
      expect(montagVon(tag)).toBe(w.start)
    }
  })

  it('(98), (100), (106): der Tausch selbst geht — ob der andere ein Konto hat, fragt erst die Function', () => {
    expect(tauschPruefen(lage(), p.a, p.b, mitglied.id)).toMatchObject({ ok: true, a: { person: { id: mitglied.id } }, b: { person: { id: aufseher.id } } })
  })

  it('(109) mit der Person ohne Konto: in einer einzigen Woche, unter der Woche gegen das Wochenende', () => {
    expect(tauschPruefen(lage(), p.eigenMitte, p.ohneKonto, mitglied.id)).toMatchObject({ ok: true, b: { person: { id: a.person.id } } })
    expect(p.eigenMitte!.split('|')[0]).toBe(p.ohneKonto!.split('|')[0])
  })

  it('(99) angeboten werden der Gruppenaufseher und die Person ohne Konto — nicht die Woche ohne „Plan senden"', () => {
    expect(tauschAngebote(lage(), p.a, mitglied.id).map((b) => b.key)).toEqual([p.b, p.ohneKonto])
  })

  it('ohne Freischaltung wiese die Function aus einem anderen Grund ab — deshalb schaltet die Probe frei', () => {
    const ohne = new Map(personen.map((x) => [x.id, { ...x, priv: {} }]))
    expect(tauschPruefen(lage({ personen: ohne }), p.a, p.b, mitglied.id)).toEqual({ ok: false, fehler: 'not-qualified' })
  })

  it('(94) die Anfrage an der Function vorbei erfüllt die Regeln der Tabelle — abweisen kann allein das fehlende Schreibrecht', () => {
    const z = a.anfrageVersuch
    expect(z).toMatchObject({ id: 'a-1', congregation_id: 'c', von_user: mitglied.uid, von_person: mitglied.id, an_person: aufseher.id, gibt_ab: p.a, nimmt: p.b })
    expect(z.gibt_ab).not.toBe(z.nimmt)
    expect(wochentag(z.bis)).toBe(0)
  })

  it('die Person ohne Konto trägt das Kennzeichen im Vornamen und kann den Dienst', () => {
    expect(a.person).toEqual({ id: 'p-ohne', congregation_id: 'c', fn: 'PROBE-1', ln: 'Tauschpartner', priv: frei })
  })

  it('ohne freie Woche um heute gibt es keine vergangene Zusammenkunft — und keinen Platz dafür', () => {
    const ohne = tauschAnlage({ marke: 'PROBE-1', versammlung: 'c', tag0, svc, vorbei: null, mitglied, aufseher, ohneKontoId: 'p-ohne', anfrageId: 'a-1' })
    expect([ohne.wochen.vorbei, ohne.plaetze.vorbei, ohne.heuteVorbei]).toEqual([null, null, null])
    expect(ohne.senden).toHaveLength(3)
  })

  it('die Titel der Glocke sind die der Function', () => {
    expect(TAUSCH_TITEL).toEqual({ angefragt: TITEL_ANGEFRAGT, getauscht: TITEL_GETAUSCHT, abgelehnt: TITEL_ABGELEHNT })
  })
})
