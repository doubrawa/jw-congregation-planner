import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  argumente,
  bereiche,
  EXTERNE_ROLLE,
  fuelleZuteilungen,
  istUuid,
  kontoAnlegenOderUebernehmen,
  passwort,
  TEST_GASTREDNER,
  TEST_GRUPPEN,
  TEST_PERSONEN,
  waehle,
} from './testversammlung-anlegen.mjs'
import { isGuestRole } from '../src/data/helpers'
import { weekConflicts } from '../src/data/planning'
import type { Person, Service, Week } from '../src/data/types'
import { STANDARD_DIENSTE } from '../src/data/vorgaben'

/**
 * Das Skript legt den **zweiten Mandanten** an — die Voraussetzung dafür, T78
 * überhaupt messen zu können. Ein Fehler darin fällt sonst erst auf, wenn der
 * Nachweis daran scheitert, dass der Testbestand selbst schief ist; dann sucht
 * man den Fehler in den Richtlinien statt im Fixture.
 *
 * Der Netzteil (`main`) bleibt ungeprüft. Geprüft ist alles, was **entscheidet**:
 * der Bestand selbst, die Bereichs-Ableitung, die Auswahlregel und das Füllen
 * einer Woche.
 */

/** Minimale Testperson, wie sie nach dem Anlegen aus der Datenbank käme. */
function person(id: string, priv: Record<string, boolean>, female = false, fam?: string) {
  return { id, fn: id, ln: 'Test', dn: '', female, fam, priv }
}

function slotWoche() {
  return {
    start: '2026-08-24',
    range: '24.–30. August',
    mid: {
      date: '', end: '',
      sections: [
        {
          label: 'ERÖFFNUNG', farbe: 'neutral',
          items: [
            { song: 'Lied 1' },
            { title: 'Einleitung', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] },
          ],
        },
        {
          label: 'UNS IM DIENST VERBESSERN', farbe: 'ocker',
          items: [
            { title: 'Gespräche beginnen', names: [{ name: '', bereichsKey: 'schulung' }, { name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' }] },
            { title: 'Schülervortrag', names: [{ name: '', bereichsKey: 'schulung', male: true }] },
          ],
        },
      ],
      helpers: {} as Record<string, { name: string; pid?: string }[]>,
    },
    we: {
      date: '', end: '',
      sections: [
        {
          label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol',
          items: [{ title: 'Vortrag', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }],
        },
      ],
      helpers: {} as Record<string, { name: string; pid?: string }[]>,
    },
  }
}

describe('Der erfundene Bestand hält zusammen', () => {
  it('jede Gruppe hat genau einen Aufseher und einen Gehilfen', () => {
    TEST_GRUPPEN.forEach((_name, i) => {
      const gruppe = TEST_PERSONEN.filter((p) => p.g === i)
      expect(gruppe.filter((p) => p.av)).toHaveLength(1)
      expect(gruppe.filter((p) => p.ag)).toHaveLength(1)
    })
  })

  it('Aufseher und Gehilfen sind Älteste bzw. Dienstamtgehilfen', () => {
    for (const p of TEST_PERSONEN.filter((x) => x.av)) expect(p.rolle).toBe('aeltester')
    for (const p of TEST_PERSONEN.filter((x) => x.ag)) expect(p.rolle).toBe('dienstamtgehilfe')
  })

  it('jeder Haushalt hat genau zwei Personen — sonst greift die Partner-Regel ins Leere', () => {
    const haus = new Map<string, number>()
    for (const p of TEST_PERSONEN) if (p.haus) haus.set(p.haus, (haus.get(p.haus) ?? 0) + 1)
    expect(haus.size).toBeGreaterThan(0)
    for (const [name, anzahl] of haus) expect(`${name}: ${anzahl}`).toBe(`${name}: 2`)
  })

  it('jeder Hilfsdienst ohne Gruppen-Rotation hat freigegebene Personen', () => {
    for (const d of STANDARD_DIENSTE) {
      if (d.groups) continue
      const frei = TEST_PERSONEN.filter((p) => (p.d ?? []).includes(d.key))
      expect(`${d.key}: ${frei.length > 0}`).toBe(`${d.key}: true`)
    }
  })
})

describe('Vollständigkeitsprobe: der Bestand kann jeden Platz besetzen', () => {
  /*
    Von den **Daten** her gedacht, nicht von den Funktionen: Der Importer legt
    die Plätze an, und jeder trägt seinen Bereichs-Key. Kommt ein neuer Slot
    dazu, für den niemand qualifiziert ist, bliebe er im Testbestand still
    leer — und niemand wüsste, ob das an den Daten oder an der App liegt.
    Deshalb wird der Quelltext des Importers gefragt, nicht eine Liste hier.
  */
  it('jeder bereichsKey aus dem Import hat mindestens eine qualifizierte Person', () => {
    const quelle = fs.readFileSync(new URL('../supabase/functions/import-week/parse.ts', import.meta.url), 'utf8')
    const keys = [...quelle.matchAll(/bereichsKey: '([^']+)'/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(5)
    for (const key of new Set(keys)) {
      const passend = TEST_PERSONEN.filter((p) => bereiche(p)[key])
      expect(`${key}: ${passend.length > 0}`).toBe(`${key}: true`)
    }
  })
})

describe('Bereiche je Stellung', () => {
  it('ein Ältester darf das Feste, eine Schwester nur die Schulungsaufgaben', () => {
    const aeltester = bereiche(TEST_PERSONEN.find((p) => p.rolle === 'aeltester' && !p.w)!)
    const schwester = bereiche(TEST_PERSONEN.find((p) => p.w)!)
    expect(aeltester.vorsitzMid).toBe(true)
    expect(aeltester.studium).toBe(true)
    expect(schwester.schulung).toBe(true)
    expect(schwester.vorsitzMid).toBeUndefined()
    expect(schwester.gebet).toBeUndefined()
  })

  it('Hilfsdienste kommen mit dem Präfix svc:', () => {
    const p = TEST_PERSONEN.find((x) => (x.d ?? []).includes('mik'))!
    expect(bereiche(p)['svc:mik']).toBe(true)
    expect(bereiche(p).mik).toBeUndefined()
  })
})

describe('Auswahlregel', () => {
  const q = { schulung: true, schulungPartner: true }

  it('ein Nur-Partner deckt keinen Führungsplatz, ein Führer aber den Partnerplatz', () => {
    const nurPartner = person('partner', { schulungPartner: true })
    const belegt = new Set<string>()
    expect(waehle([nurPartner], { bereichsKey: 'schulung' }, belegt, new Map())).toBeNull()
    expect(waehle([person('fuehrer', { schulung: true })], { bereichsKey: 'schulungPartner' }, belegt, new Map())).not.toBeNull()
  })

  it('ein Platz nur für Brüder nimmt keine Schwester', () => {
    const nur = [person('schwester', q, true)]
    expect(waehle(nur, { bereichsKey: 'schulung', male: true }, new Set(), new Map())).toBeNull()
    expect(waehle(nur, { bereichsKey: 'schulung' }, new Set(), new Map())).not.toBeNull()
  })

  it('wer in dieser Zusammenkunft schon dran war, kommt nicht zweimal', () => {
    const p = person('a', q)
    expect(waehle([p], { bereichsKey: 'schulung' }, new Set(['a']), new Map())).toBeNull()
  })

  it('Partner: gleiches Geschlecht — oder derselbe Haushalt', () => {
    const bruder = person('bruder', q, false, 'haus-1')
    const fremde = person('fremde', q, true, 'haus-2')
    const ehefrau = person('ehefrau', q, true, 'haus-1')
    const fuehrend = { pid: 'bruder' }
    const slot = { bereichsKey: 'schulungPartner', rolle: 'Gesprächspartner' }
    expect(waehle([bruder, fremde], slot, new Set(['bruder']), new Map(), fuehrend)).toBeNull()
    expect(waehle([bruder, ehefrau], slot, new Set(['bruder']), new Map(), fuehrend)?.id).toBe('ehefrau')
  })

  it('reihum: der bisher am wenigsten Belastete gewinnt', () => {
    const a = person('a', q)
    const b = person('b', q)
    const zaehler = new Map([['a', 3], ['b', 1]])
    expect(waehle([a, b], { bereichsKey: 'schulung' }, new Set(), zaehler)?.id).toBe('b')
  })

  it('bei Gleichstand gewinnt, wer am wenigsten kann — die Vielseitigen bleiben frei', () => {
    // Der Ältere steht **vorn** in der Liste: Ohne die Regel bekäme er den
    // Platz allein durch die Reihenfolge, obwohl ihn auch die Schwester kann.
    const aeltester = person('aeltester', { schulung: true, studium: true, gebet: true })
    const schwester = person('schwester', { schulung: true }, true)
    expect(waehle([aeltester, schwester], { bereichsKey: 'schulung' }, new Set(), new Map())?.id).toBe('schwester')
    // Und für den Platz, den nur er kann, ist er weiterhin da.
    expect(waehle([aeltester, schwester], { bereichsKey: 'studium' }, new Set(), new Map())?.id).toBe('aeltester')
  })
})

describe('Eine Woche besetzen', () => {
  const personen = [
    person('aeltester1', { vorsitzMid: true, gebet: true, schulung: true, vortrag: true, 'svc:ton': true }),
    person('aeltester2', { vorsitzMid: true, gebet: true, schulung: true, 'svc:mik': true }),
    person('bruder', { schulung: true, schulungPartner: true, 'svc:mik': true }),
    person('schwester', { schulung: true, schulungPartner: true }, true),
  ]
  const dienste = [
    { key: 'ton', name: 'Ton', count: 1, groups: false },
    { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true },
  ]
  const gruppen = TEST_GRUPPEN.map((name) => ({ name }))

  it('besetzt Programmplätze und Hilfsdienste', () => {
    const week = slotWoche()
    const gesetzt = fuelleZuteilungen(week, personen, dienste, gruppen)
    expect(gesetzt).toBeGreaterThan(0)
    const eroeffnung = week.mid.sections[0]!.items[1] as { names: { name: string; pid?: string }[] }
    expect(eroeffnung.names[0]!.name).not.toBe('')
    expect(eroeffnung.names[0]!.pid).toBeTruthy()
    expect(week.mid.helpers.mik).toHaveLength(2)
  })

  /*
    Die Grenze verläuft dort, wo die App sie zieht (`weekConflicts`), nicht wo
    man sie vermutet: Zwei **Programmpunkte** in einer Zusammenkunft sind
    erlaubt (Vorsitz + Anfangsgebet), gemeldet werden nur Hilfsdienst neben
    Programmpunkt und mehrere Hilfsdienste.
  */
  function belegungen(meeting: { sections: unknown[]; helpers: Record<string, { pid?: string }[]> }) {
    const programm: string[] = []
    for (const sec of meeting.sections as { items: { names?: { pid?: string }[] }[] }[]) {
      for (const item of sec.items) for (const s of item.names ?? []) if (s.pid) programm.push(s.pid)
    }
    const dienst: string[] = []
    for (const slots of Object.values(meeting.helpers)) for (const s of slots) if (s.pid) dienst.push(s.pid)
    return { programm, dienst }
  }

  it('niemand hat Hilfsdienst und Programmpunkt in derselben Zusammenkunft', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    for (const mk of ['mid', 'we'] as const) {
      const { programm, dienst } = belegungen(week[mk])
      expect(dienst.filter((p) => programm.includes(p))).toEqual([])
    }
  })

  it('und niemand zwei Hilfsdienste am selben Tag', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    for (const mk of ['mid', 'we'] as const) {
      const { dienst } = belegungen(week[mk])
      expect(dienst).toHaveLength(new Set(dienst).size)
    }
  })

  it('der Gastredner bleibt Freitext — ohne pid, mit Herkunft an der Rolle', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    const slot = (week.we.sections[0]!.items[0] as { names: { name: string; pid?: string; rolle?: string }[] }).names[0]!
    expect(slot.name).toBeTruthy()
    expect(slot.pid).toBeUndefined()
    expect(slot.rolle).toMatch(/^Gastredner · /)
    expect(TEST_GASTREDNER.some((g) => g.name === slot.name)).toBe(true)
  })

  it('zwei Programmpunkte für dieselbe Person sind erlaubt — sonst bliebe der Platz leer', () => {
    /*
      Vorsitz + Anfangsgebet ist der Normalfall und ausdrücklich kein Konflikt
      (`weekConflicts`). Die erste Fassung verbot hier jede zweite Aufgabe —
      an einer echten Woche blieben dadurch Leiter, Leser und Schlussgebet leer.
    */
    const einzelner = person('einzelner', { vorsitzMid: true, gebet: true })
    const week = slotWoche()
    week.mid.sections = [week.mid.sections[0]!] // nur die Eröffnung
    week.we.sections = []
    fuelleZuteilungen(week, [einzelner], [], gruppen)
    const namen = (week.mid.sections[0]!.items[1] as { names: { name: string }[] }).names
    expect(namen.map((s) => s.name)).toEqual(['einzelner Test', 'einzelner Test'])
  })

  it('der knappste Dienst wird zuerst besetzt — sonst bleibt er leer', () => {
    /*
      Genau dieser Fall ist an einer echten Woche aufgetreten: Der
      Rundgangsordner steht hinten in der Liste und hat die wenigsten
      Freigegebenen. Wer der Reihe nach füllt, verbraucht dessen einzigen
      Kandidaten vorher an einem Dienst, den auch ein anderer könnte.
    */
    const beide = person('beide', { 'svc:ton': true, 'svc:rund': true })
    const nurTon = person('nurTon', { 'svc:ton': true, 'svc:mik': true, 'svc:zoom': true })
    const zwei = [
      { key: 'ton', name: 'Ton', count: 1, groups: false },
      { key: 'rund', name: 'Rundgang', count: 1, groups: false },
    ]
    const week = slotWoche()
    // Ohne Programm, damit allein die Reihenfolge der Dienste zählt.
    week.mid.sections = []
    week.we.sections = []
    fuelleZuteilungen(week, [beide, nurTon], zwei, gruppen)
    expect(week.mid.helpers.rund![0]!.name).toBe('beide Test')
    expect(week.mid.helpers.ton![0]!.name).toBe('nurTon Test')
  })

  it('die Reinigung rotiert Gruppen, ohne Person', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    const rein = week.mid.helpers.rein!
    expect(rein[0]!.pid).toBeUndefined()
    expect(TEST_GRUPPEN).toContain(rein[0]!.name)
  })

  it('ein Lauf ist wiederholbar — zweimal dieselbe Besetzung', () => {
    const a = slotWoche()
    const b = slotWoche()
    fuelleZuteilungen(a, personen, dienste, gruppen)
    fuelleZuteilungen(b, personen, dienste, gruppen)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('Die App selbst findet nichts zu beanstanden', () => {
  /*
    Die stärkste Probe, die hier möglich ist: Der Testbestand wird nicht an
    einer nachgebauten Regel gemessen, sondern an `weekConflicts` — derselben
    Funktion, die im Planen-Screen das Warnbanner füllt. Ein Fixture, das die
    App beim Öffnen rot anzeigt, wäre für den Mandanten-Nachweis wertlos: Man
    wüsste bei jedem Fund nicht, ob er von den Daten oder von der Trennung
    kommt.

    Genau hier lag der erste Fehler: Das Skript verbot jede zweite Aufgabe in
    einer Zusammenkunft — die App verbietet nur *Hilfsdienst + Programmpunkt*
    und *mehrere Hilfsdienste*. Zwei Programmpunkte (Vorsitz + Anfangsgebet)
    sind ausdrücklich erlaubt. Durch das zu strenge Verbot blieben Plätze leer.
  */
  const personen: Person[] = TEST_PERSONEN.map((p, i) => ({
    id: `p${i}`,
    fn: p.fn,
    ln: p.ln,
    role: p.rolle as Person['role'],
    female: Boolean(p.w),
    tel: '',
    mail: '',
    fam: p.haus ?? null,
    priv: bereiche(p) as Person['priv'],
  }))
  const dienste: Service[] = STANDARD_DIENSTE.map((d) => ({ ...d }))
  const gruppen = TEST_GRUPPEN.map((name) => ({ name }))

  it('keine Konflikte in der besetzten Woche', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    expect(weekConflicts([week as unknown as Week], 0, personen, dienste)).toEqual([])
  })

  it('und auch nicht über vier Wochen hinweg', () => {
    const stand = { zaehler: new Map<string, number>(), rotation: 0 }
    const wochen = Array.from({ length: 4 }, () => slotWoche())
    for (const w of wochen) fuelleZuteilungen(w, personen, dienste, gruppen, stand)
    const alle = wochen as unknown as Week[]
    for (let wi = 0; wi < alle.length; wi++) {
      expect(`Woche ${wi}: ${JSON.stringify(weekConflicts(alle, wi, personen, dienste))}`).toBe(`Woche ${wi}: []`)
    }
  })

  it('und die Last verteilt sich — niemand trägt mehr als das Doppelte des Durchschnitts', () => {
    const stand = { zaehler: new Map<string, number>(), rotation: 0 }
    for (let i = 0; i < 4; i++) fuelleZuteilungen(slotWoche(), personen, dienste, gruppen, stand)
    const lasten = [...stand.zaehler.values()]
    const schnitt = lasten.reduce((a, b) => a + b, 0) / lasten.length
    expect(Math.max(...lasten)).toBeLessThanOrEqual(schnitt * 2)
  })
})

describe('Externe Rollen — dieselbe Aussage wie in der App', () => {
  /*
    Node lädt `src/data/helpers.ts` nicht, deshalb steht die Regel im Skript ein
    zweites Mal. Zwei Quellen für dieselbe Aussage laufen auseinander, sobald
    eine gepflegt wird — hier hinge daran, dass ein Platz ohne
    Bestätigungs-Flow trotzdem eine `pid` bekäme.
  */
  it('was die App als extern ansieht, füllt das Skript als Freitext', () => {
    for (const rolle of ['Gastredner', 'Gastredner · Vers. Ringheim', 'Kreisaufseher']) {
      expect(`${rolle}: ${EXTERNE_ROLLE.test(rolle)}`).toBe(`${rolle}: ${isGuestRole(rolle)}`)
    }
  })

  it('und normale Rollen sind für beide keine externen', () => {
    for (const rolle of ['Vorsitz', 'Gebet', 'Leser', 'Redner', 'Gesprächspartner']) {
      expect(`${rolle}: ${EXTERNE_ROLLE.test(rolle)}`).toBe(`${rolle}: ${isGuestRole(rolle)}`)
    }
  })
})

describe('Ein abgebrochener Lauf blockiert den nächsten nicht', () => {
  /*
    Der erste scharfe Lauf brach zwischen „Konto angelegt" und
    „members-Zeile geschrieben" ab. Zurück blieb ein Konto, das weder
    anmeldbar noch über `members` auffindbar war — und das jeden weiteren
    Versuch an derselben Adresse scheitern ließ. Deshalb diese beiden Wege.
  */
  const konto = { id: 'u1', email: 'planer@probe.invalid' }

  it('normalerweise wird ein neues Konto angelegt', async () => {
    const rufe: string[] = []
    const auth = async (pfad: string, method: string) => {
      rufe.push(`${method} ${pfad}`)
      return konto
    }
    const user = await kontoAnlegenOderUebernehmen(auth, konto.email, 'geheim')
    expect(user.uebernommen).toBeUndefined()
    expect(rufe).toEqual(['POST users'])
  })

  it('ist die Adresse belegt, wird das vorhandene Konto übernommen und neu bekennwortet', async () => {
    const rufe: string[] = []
    const auth = async (pfad: string, method: string, body?: unknown) => {
      rufe.push(`${method} ${pfad}`)
      if (method === 'POST') throw new Error('POST auth/users 422: {"code":"email_exists"}')
      if (method === 'GET') return { users: [konto] }
      expect(body).toMatchObject({ password: 'geheim' })
      return {}
    }
    const user = await kontoAnlegenOderUebernehmen(auth, konto.email, 'geheim')
    expect(user.id).toBe('u1')
    expect(user.uebernommen).toBe(true)
    expect(rufe).toEqual(['POST users', 'GET users?page=1&per_page=1000', 'PUT users/u1'])
  })

  it('ein anderer Fehler wird nicht verschluckt', async () => {
    const auth = async () => {
      throw new Error('POST auth/users 500: kaputt')
    }
    await expect(kontoAnlegenOderUebernehmen(auth, konto.email, 'geheim')).rejects.toThrow('500')
  })
})

describe('--entfernen nimmt Id oder Name', () => {
  it('erkennt eine UUID', () => {
    expect(istUuid('3f2a9c1e-0b7d-4e55-9a31-8c6d5e4f7a20')).toBe(true)
  })

  it('und alles andere ist ein Name', () => {
    for (const wert of ['Probeversammlung Talheim', 'Talheim', '', '1234']) {
      expect(`${wert}: ${istUuid(wert)}`).toBe(`${wert}: false`)
    }
  })
})

describe('Kennwort und Argumente', () => {
  it('das Kennwort ist lang und URL-sicher', () => {
    const pw = passwort()
    expect(pw.length).toBeGreaterThanOrEqual(20)
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('--flagge wird true, --name nimmt den Wert', () => {
    expect(argumente(['--name', 'Talheim', '--trocken'])).toEqual({ name: 'Talheim', trocken: true })
  })
})
