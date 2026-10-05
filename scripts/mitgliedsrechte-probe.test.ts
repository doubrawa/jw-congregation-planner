import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROBE_DATEI, probeDateiText, wertAusEnvText } from './gemeinsam.mjs'
import {
  bewerteSicht,
  bewerteVersuch,
  dienstAusSchluessel,
  eigeneSlots,
  ersterMontagAb,
  fremdeSlots,
  gruppenWahl,
  helferSchluessel,
  montagDerWoche,
  ozSchluessel,
  planAenderung,
  PROBE_KONTEN,
  qualifiziertFuer,
  schichtInsLeere,
  slotSchluessel,
  stufenAnlage,
  t120Anlage,
  tagPlus,
  wochentag,
  zugangAus,
  zuteilungAenderung,
} from './mitgliedsrechte-probe.mjs'
import { TEST_KONTEN } from './testversammlung-anlegen.mjs'
import { helferKey, punktKey } from '../src/data/planning'
import { isQualified, serviceQualKey } from '../src/data/helpers'
import { montagVon } from '../src/data/meeting-dates'
import { ozTaskKey } from '../src/data/zeugnis'
import type { PartItem, Person } from '../src/data/types'
import { pidsNachtragen } from '../src/data/namensbindung'
import { nurZuteilungen } from '../supabase/functions/_shared/zuteilen-grenze.ts'
import { schluesselTeile } from '../supabase/functions/_shared/aufgaben-schluessel.ts'
import { kontoAufloeser } from '../supabase/functions/_shared/konten.ts'
import { personDisplayName } from '../supabase/functions/_shared/planung.ts'
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

describe('T120: Tage und Schlüssel wie in der App', () => {
  /*
    Dieselbe Gefahr wie beim Programmschlüssel oben: Ein Schlüssel, der um
    einen Tag verrutscht, beträfe keinen Eintrag. Die Bestätigung des eigenen
    Eintrags (18) schiene dann „ZU STRENG" abgewiesen, die fremde (17)
    „abgewiesen — greift", und beides wäre nicht gemessen.
  */
  const tage = (von: string, anzahl: number) => Array.from({ length: anzahl }, (_, i) => tagPlus(von, i))

  it('der Montag der Woche ist derselbe wie in der App — ein Jahr lang, samt Zeitumstellung, und 2099', () => {
    for (const tag of [...tage('2026-01-01', 366), ...tage('2098-12-25', 21)]) {
      expect(montagDerWoche(tag), tag).toBe(montagVon(tag))
    }
  })

  it('der Wochentag zählt wie oz_termine.wd: 0 ist Sonntag', () => {
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

  it('Zeugnisschlüssel wie ozTaskKey', () => {
    for (const datum of ['2099-01-05', '2099-01-11', '2026-10-04', '2026-10-25']) {
      expect(ozSchluessel(datum, 'z1')).toBe(ozTaskKey({ id: 'z1', datum }))
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
    Scheiterte eine Zeile an einer anderen Regel — falscher Wochentag, doppelt
    in derselben Schicht, zwei Einträge auf einem Platz —, sähe das aus wie
    eine Abweisung über die Rechte, und die Probe meldete „greift", ohne dort
    gewesen zu sein.
  */
  const marke = 'PROBE-1'
  const a = t120Anlage({ marke, versammlung: 'c', tag0: ersterMontagAb('2099-01-01'), planerPid: 'p-planer', mitgliedPid: 'p-mitglied', gruppe: 'g1' })
  const oz = [a.ozFremd, a.ozZugeteilt, a.ozFuerAndere, a.ozAlsZugeteilt, a.ozSelbst, a.ozOhneBereich]
  const eintraege = [...Object.values(a.eintraege).flat(), a.eintragVersuch]

  it('jeder Zeugnis-Eintrag liegt am Wochentag seines Termins (sonst: oz_falscher_tag)', () => {
    for (const e of oz) expect(wochentag(e.datum), e.id).toBe(a.termin.wd)
  })

  it('keine Person zweimal in derselben Schicht, keine Schicht über ihre Plätze', () => {
    expect(new Set(oz.map((e) => `${e.datum}|${e.person_id}`)).size).toBe(oz.length)
    for (const tag of new Set(oz.map((e) => e.datum))) {
      expect(oz.filter((e) => e.datum === tag).length, tag).toBeLessThanOrEqual(a.termin.plaetze)
    }
  })

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
    const ids = [a.termin, ...oz, ...Object.values(a.plaene), a.planVersuch, ...eintraege, a.besuch!, a.besuchVersuch!].map((z) => z.id)
    expect(ids.every((id) => id.startsWith(`${marke}-`))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('jeder Versuch des Mitglieds zielt auf genau eine Regel', () => {
    // (13) fremde Person — „selbst" und Aufgabenbereich stimmen.
    expect(a.ozFuerAndere).toMatchObject({ person_id: 'p-planer', selbst: true })
    // (14) die eigene Person, nur ohne „selbst".
    expect(a.ozAlsZugeteilt).toMatchObject({ person_id: 'p-mitglied', selbst: false })
    // (16) beides richtig — es fehlt allein der Aufgabenbereich.
    expect(a.ozOhneBereich).toMatchObject({ person_id: 'p-mitglied', selbst: true })
    // (34) eine freie Woche des veröffentlichten Plans — abweisen kann nur
    // noch die Schreib-Richtlinie.
    expect(a.eintragVersuch).toMatchObject({ plan_id: a.plaene.saal.id })
    expect(a.plaene.saal.entwurf).toBe(false)
    expect(a.eintraege.saal.map((e) => e.datum)).not.toContain(a.eintragVersuch.datum)
  })

  it('(19) ist der eigene Eintrag unter einem anderen Montag — nicht irgendein Schlüssel', () => {
    const richtig = ozSchluessel(a.ozZugeteilt.datum, a.ozZugeteilt.id)
    expect(a.ozFalscherMontag).not.toBe(richtig)
    expect(a.ozFalscherMontag.split('|')[0]).toBe('oz')
    expect(a.ozFalscherMontag.split('|')[2]).toBe(a.ozZugeteilt.id)
    expect(wochentag(a.ozFalscherMontag.split('|')[1]!)).toBe(1)
  })

  it('ohne Gruppe gibt es keinen Gruppenbesuch — (11) und (12) bleiben dann ungemessen', () => {
    const ohne = t120Anlage({ marke, versammlung: 'c', tag0: '2099-01-05', planerPid: 'p1', mitgliedPid: 'p2' })
    expect(ohne.besuch).toBeNull()
    expect(ohne.besuchVersuch).toBeNull()
  })
})

/** Ein Feld eines Objekts, wie die Probe es liest — ohne Typ, denn sie liest rohes JSON. */
const feld = (o: unknown, name: string): unknown => (o as Record<string, unknown> | undefined)?.[name]

describe('Rechte-Stufen: die Änderungen an der Woche treffen die Grenze von „zuteilen"', () => {
  /*
    (38) und (39) brauchen eine Änderung, die nur der Admin machen darf, (40)
    eine, die der Planer machen darf. Griffe die Probe daneben — etwa zum
    Thema eines Vortrags, das der Planer setzen darf —, meldete sie „AUCH DAS!"
    an einer Stelle, die gar nicht offen ist, oder „ZU STRENG", wo nichts zu
    streng ist. Deshalb an der echten Grenze gehalten, nicht an einer Abschrift.
  */
  // Die Wochen der Entwicklerseite, mit Personen-Ids wie nach dem Laden —
  // ohne `pid` gäbe es keinen besetzten Platz zum Freigeben.
  const wochen = pidsNachtragen(buildDemoWeeks(), DEMO_PERSONS).map((w) => [w.start, w] as const)
  type Platz = { pid?: string }
  const platz = (d: unknown, s: { si: number; ii: number; ni: number }): Platz | undefined =>
    (d as { mid: { sections: { items: { names: Platz[] }[] }[] } }).mid.sections[s.si]?.items[s.ii]?.names[s.ni]

  it.each(wochen)('%s: die Änderung am Plan lässt „zuteilen" nicht durch', (_start, w) => {
    const plan = planAenderung(w, 'PROBE-1')
    expect(plan).not.toBeNull()
    expect(nurZuteilungen(w, plan!.data)).toBe(false)
  })

  it.each(wochen)('%s: die Zuteilung lässt „zuteilen" durch — und gibt wirklich einen besetzten Platz frei', (_start, w) => {
    const z = zuteilungAenderung(w)
    expect(z).not.toBeNull()
    expect(nurZuteilungen(w, z!.data)).toBe(true)
    expect(platz(w, z!)?.pid).toBeTruthy()
    expect(platz(z!.data, z!)?.pid).toBeUndefined()
  })

  it('ein Punkt mit Redner-Platz ist kein Ändern am Plan — sein Thema setzt der Planer', () => {
    const w = {
      mid: {
        sections: [
          {
            items: [
              { iid: 'a', title: 'Probe-Dienstvortrag', names: [{ name: 'Probe Redner', rolle: 'Kreisaufseher' }] },
              { iid: 'b', title: 'Probe-Vortrag', names: [{ name: 'Probe Gast', rolle: 'Gastredner · Vers. Probe' }] },
              { iid: 'c', title: 'Probe-Punkt', names: [{ name: 'Probe Eins', pid: 'p1', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }] },
            ],
          },
        ],
      },
      we: { sections: [] },
    }
    const plan = planAenderung(w, 'PROBE-1')!
    expect(plan.ii).toBe(2)
    expect(nurZuteilungen(w, plan.data)).toBe(false)
    // Am ersten Punkt hätte die Grenze die Änderung durchgelassen — zu Recht.
    const daneben = structuredClone(w)
    daneben.mid.sections[0]!.items[0]!.title += ' PROBE-1'
    expect(nurZuteilungen(w, daneben)).toBe(true)
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
    marke: 'PROBE-1', versammlung: 'c', tag0, adminPid: 'p-admin', zuteilerPid: 'p-zuteiler', mitgliedPid: 'p-mitglied',
    eigeneGruppe: 'g-eigen', fremdeGruppe: 'g-fremd',
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
      '42 zuteiler abgewiesen', '43 zuteiler durch', '44 aufseher abgewiesen', '45 aufseher abgewiesen',
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

  it('Zeugnis und Pläne erfüllen die Regeln der Datenbank, die mit den Rechten nichts zu tun haben', () => {
    expect(wochentag(a.ozPlaner.datum)).toBe(a.termin.wd)
    expect(a.ozPlaner).toMatchObject({ person_id: 'p-mitglied', selbst: false, termin_id: a.termin.id })
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
    const spaetestens = [t120.ozOhneBereich.datum, t120.plaene.saal.bis, t120.besuch!.woche].sort().at(-1)!
    expect(wochentag(a.fsStart)).toBe(1)
    expect(a.fsStart > spaetestens).toBe(true)
    expect(a.besuch.woche >= a.fsStart).toBe(true)
  })

  it('jede Kennung trägt das Kennzeichen — daran findet das Aufräumen genau diese Zeilen', () => {
    const zeilen = [
      ...a.treffpunkte, ...Object.values(a.regeln), a.besuch, a.besuchVersuche.neu, a.termin, a.ozPlaner, a.terminVersuch,
      a.plan, a.planEintrag, a.eintragVersuch, a.planVersuch,
    ]
    const ids = zeilen.map((z) => z.id)
    expect(ids.every((id) => id.startsWith('PROBE-1-'))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(a.absage.startsWith('PROBE-1 ')).toBe(true)
  })
})

describe('„Schicht geändert" ins Leere — (62) bis (64)', () => {
  const montag = ersterMontagAb('2100-01-01')
  const rumpf = schichtInsLeere('PROBE-1', montag)
  const aenderung = rumpf.aenderungen[0]!

  it('der Schlüssel besteht die Prüfung von `send-plan` — sonst mäße die Gegenprobe (64) nur ein 400', () => {
    expect(rumpf.action).toBe('zeugnis-geaendert')
    expect(rumpf.aenderungen).toHaveLength(1)
    expect(schluesselTeile(aenderung.taskKey)).toEqual({ art: 'oz', woche: montag, eintragId: 'PROBE-1-oz-leer' })
  })

  it('der Name findet kein Konto, auch wenn jede Person eines hat — eine offene Tür stellte nichts zu', () => {
    const persons = DEMO_PERSONS.map((p) => ({ id: p.id, fn: p.fn, ln: p.ln }))
    const konto = kontoAufloeser(persons.map((p, i) => ({ user_id: `u${i}`, person_id: p.id })), persons)
    expect(konto(undefined, aenderung.name)).toBeUndefined()
    // Gegenprobe am selben Auflöser: Ein echter Name findet sein Konto.
    expect(konto(undefined, personDisplayName(persons[0]!.fn, persons[0]!.ln))).toBe('u0')
    expect(aenderung.name).toContain('PROBE-1')
    expect('pid' in aenderung).toBe(false)
  })
})
