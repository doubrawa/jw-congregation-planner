import { describe, expect, it } from 'vitest'
import {
  bewerteSicht,
  bewerteVersuch,
  dienstAusSchluessel,
  eigeneSlots,
  ersterMontagAb,
  fremdeSlots,
  helferSchluessel,
  montagDerWoche,
  ozSchluessel,
  PROBE_KONTEN,
  qualifiziertFuer,
  slotSchluessel,
  t120Anlage,
  tagPlus,
  vaSchluessel,
  wochentag,
  zugangAus,
} from './mitgliedsrechte-probe.mjs'
import { helferKey, punktKey } from '../src/data/planning'
import { isQualified, serviceQualKey } from '../src/data/helpers'
import { montagVon } from '../src/data/meeting-dates'
import { vaTaskKey } from '../src/data/auswaerts'
import { ozTaskKey } from '../src/data/zeugnis'
import type { PartItem, Person } from '../src/data/types'

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
      planerMail: PROBE_KONTEN.planer,
      mitgliedMail: PROBE_KONTEN.mitglied,
      planerPass: '',
      mitgliedPass: '',
      dienstSchluessel: false,
    })
  })

  it('die Umgebung schlägt die Datei — für andere Konten oder ohne Terminal', () => {
    const z = zugangAus(
      { SUPABASE_URL: 'https://env.invalid', SUPABASE_ANON_KEY: 'sb_publishable_env', PROBE_PLANER_MAIL: 'a@x.invalid', PROBE_MITGLIED_PASS: 'geheim' },
      ausDatei,
    )
    expect(z).toMatchObject({ url: 'https://env.invalid', anon: 'sb_publishable_env', planerMail: 'a@x.invalid', mitgliedPass: 'geheim' })
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
    Eintrags (18, 27) schiene dann „ZU STRENG" abgewiesen, die fremde (17, 26)
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

  it('Zeugnis- und Vortragsschlüssel wie ozTaskKey und vaTaskKey', () => {
    for (const datum of ['2099-01-05', '2099-01-11', '2026-10-04', '2026-10-25']) {
      expect(ozSchluessel(datum, 'z1')).toBe(ozTaskKey({ id: 'z1', datum }))
      expect(vaSchluessel(datum, 'v1')).toBe(vaTaskKey({ id: 'v1', datum }))
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
  const eintraege = [...Object.values(a.eintraege).flat(), a.haushaltEintrag('p-mitbewohner'), a.eintragVersuch]

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

  it('ein Platz je Plan, Tag und Mahlzeit (plan_eintraege_platz), und kein Plan endet vor seinem Anfang', () => {
    expect(new Set(eintraege.map((e) => `${e.plan_id}|${e.datum}|${e.mahlzeit ?? ''}`)).size).toBe(eintraege.length)
    for (const p of [...Object.values(a.plaene), a.haushalt, a.planVersuch]) expect(p.bis >= p.von, p.id).toBe(true)
  })

  it('jede Kennung trägt das Kennzeichen — daran findet das Aufräumen genau diese Zeilen', () => {
    const ids = [a.termin, ...oz, a.vaFremd, a.vaEigen, a.vaVersuch, ...Object.values(a.plaene), a.haushalt, a.planVersuch, ...eintraege, a.besuch!, a.besuchVersuch!].map((z) => z.id)
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
    // (34) sich selbst zum Gastgeber im fremden Familienplan machen.
    expect(a.eintragVersuch).toMatchObject({ plan_id: a.plaene.fremd.id, person_id: 'p-mitglied' })
    expect(a.plaene.fremd.vorlage).toBe('familien')
  })

  it('(19) ist der eigene Eintrag unter einem anderen Montag — nicht irgendein Schlüssel', () => {
    const richtig = ozSchluessel(a.ozZugeteilt.datum, a.ozZugeteilt.id)
    expect(a.ozFalscherMontag).not.toBe(richtig)
    expect(a.ozFalscherMontag.split('|')[0]).toBe('oz')
    expect(a.ozFalscherMontag.split('|')[2]).toBe(a.ozZugeteilt.id)
    expect(wochentag(a.ozFalscherMontag.split('|')[1]!)).toBe(1)
  })

  it('Vorträge an einem Sonntag; verlegt wird auf einen anderen Tag', () => {
    for (const v of [a.vaFremd, a.vaEigen, a.vaVersuch]) expect(wochentag(v.datum)).toBe(0)
    expect(a.vaVerlegtAuf).not.toBe(a.vaEigen.datum)
  })

  it('der fremde Gastgeber in (30) ist, wen die Probe gefunden hat — ohne Angabe der Planer', () => {
    // In der Testversammlung sind Planer und Mitglied ein Ehepaar: Mit dem
    // Planer als „fremdem" Gastgeber sähe das Mitglied den Plan zu Recht.
    expect(a.eintraege.fremd[0]!.person_id).toBe('p-planer')
    const anders = t120Anlage({ marke, versammlung: 'c', tag0: '2099-01-05', planerPid: 'p-planer', mitgliedPid: 'p-mitglied', fremderGastgeber: 'p-dritte' })
    expect(anders.eintraege.fremd[0]!.person_id).toBe('p-dritte')
  })

  it('ohne Gruppe gibt es keinen Gruppenbesuch — (11) und (12) bleiben dann ungemessen', () => {
    const ohne = t120Anlage({ marke, versammlung: 'c', tag0: '2099-01-05', planerPid: 'p1', mitgliedPid: 'p2' })
    expect(ohne.besuch).toBeNull()
    expect(ohne.besuchVersuch).toBeNull()
  })
})
