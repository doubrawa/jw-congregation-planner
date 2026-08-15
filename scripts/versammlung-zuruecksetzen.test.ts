import { describe, expect, it } from 'vitest'
import {
  argumente,
  displayName,
  parseInsert,
  parseKuratiert,
  werteTokens,
} from './versammlung-zuruecksetzen.mjs'

/**
 * Das Reset-Skript ist destruktiv und läuft mit dem Service-Role-Key — geprüft
 * ist deshalb alles, was **entscheidet**, was angelegt wird: das Zerlegen der
 * kuratierten SQL-Zeilen. Ein Fehler darin legte falsche Stammdaten an, und das
 * fiele erst beim Planen auf. Der Netzteil (`main`, das Löschen/Schreiben) bleibt
 * außen vor.
 */

const PERSON_ZEILE =
  "insert into public.persons (id, congregation_id, fn, ln, dn, role, female, tel, mail, absent, priv, grp, fam) values " +
  "('70add09f-c724-459f-9b7e-0148f51359a2', (select id from public.congregations limit 1), 'Martin', 'Keller', '', " +
  "'aeltester', false, '', 'kellerkrumbach@freenet.de', '{}', '{\"vortrag\":true,\"svc:mik\":true}'::jsonb, " +
  "'dfab64ae-4dad-42c3-96b3-5ff664447db9', 'f9834992-aa33-4a43-a7bc-f3b7dcbff419');"

const GRUPPE_ZEILE =
  "insert into public.groups (id, congregation_id, name, position) values " +
  "('74af963f-fb80-4604-b776-0da94c213311', (select id from public.congregations limit 1), 'Gruppe 1', 0);"

describe('werteTokens', () => {
  it('zerlegt Strings, (select …), bool und den ::jsonb-Cast', () => {
    const t = werteTokens("'a', (select id from x limit 1), 'b', false, '{}', '{\"k\":true}'::jsonb, null")
    expect(t[0]).toBe('a')
    expect(t[1]).toEqual({ expr: '(select id from x limit 1)' })
    expect(t[2]).toBe('b')
    expect(t[3]).toBe(false)
    expect(t[4]).toBe('{}')
    expect(t[5]).toBe('{"k":true}') // Cast ::jsonb abgeschnitten, String bleibt
    expect(t[6]).toBeNull()
  })

  it('behandelt verdoppelte Anführungszeichen als Apostroph', () => {
    expect(werteTokens("'O''Brien'")[0]).toBe("O'Brien")
  })
})

describe('parseInsert', () => {
  it('liest eine Personenzeile spaltengenau', () => {
    const ins = parseInsert(PERSON_ZEILE)
    expect(ins!.tabelle).toBe('persons')
    expect(ins!.obj.fn).toBe('Martin')
    expect(ins!.obj.ln).toBe('Keller')
    expect(ins!.obj.role).toBe('aeltester')
    expect(ins!.obj.female).toBe(false)
    expect(ins!.obj.grp).toBe('dfab64ae-4dad-42c3-96b3-5ff664447db9')
    expect(ins!.obj.fam).toBe('f9834992-aa33-4a43-a7bc-f3b7dcbff419')
  })

  it('gibt für Nicht-Insert-Zeilen null', () => {
    expect(parseInsert('commit;')).toBeNull()
    expect(parseInsert("update public.groups set overseer_id = 'x' where id = 'y';")).toBeNull()
  })
})

describe('parseKuratiert', () => {
  const SQL = [
    GRUPPE_ZEILE,
    PERSON_ZEILE,
    "insert into public.persons (id, congregation_id, fn, ln, dn, role, female, tel, mail, absent, priv, grp, fam) values " +
      "('0279161b-80c9-4d0f-8500-f54c8dd62a9a', (select id from public.congregations limit 1), 'Philemon', 'Grünwald', '', " +
      "'dienstamtgehilfe', false, '', 'pweissbrodt@web.de', '{}', '{\"gebet\":true}'::jsonb, '7e11d338-7108-4114-94ab-b5dd413c0217', null);",
    "update public.groups set overseer_id = 'fffabbc7-a7c4-41d4-a116-e1ef8a5c338f', assistant_id = '01b5d280-c831-4b67-8bae-00e88d775441' where id = '74af963f-fb80-4604-b776-0da94c213311';",
    'commit;',
  ].join('\n')

  it('trennt Gruppen, Personen und Aufseher/Gehilfe', () => {
    const k = parseKuratiert(SQL)
    expect(k.groups).toEqual([{ id: '74af963f-fb80-4604-b776-0da94c213311', name: 'Gruppe 1', position: 0 }])
    expect(k.persons).toHaveLength(2)
    expect(k.persons[0].priv).toEqual({ vortrag: true, 'svc:mik': true }) // JSON geparst
    expect(k.persons[1].fam).toBeNull() // null-Feld bleibt null, nicht "null"
    expect(k.persons[1].ln).toBe('Grünwald') // Umlaut unversehrt
    expect(k.ovas).toEqual([{
      groupId: '74af963f-fb80-4604-b776-0da94c213311',
      overseer_id: 'fffabbc7-a7c4-41d4-a116-e1ef8a5c338f',
      assistant_id: '01b5d280-c831-4b67-8bae-00e88d775441',
    }])
  })
})

describe('displayName', () => {
  it('nimmt den Kurznamen, sonst Vor- und Nachname', () => {
    expect(displayName('Jörg', 'Grünwald', '')).toBe('Jörg Grünwald')
    expect(displayName('Josef', 'Mayer', 'Josef Mayer 1')).toBe('Josef Mayer 1')
  })
})

describe('argumente', () => {
  it('liest --schlüssel Wert und --flagge', () => {
    expect(argumente(['--sql', 'x.sql', '--trocken'])).toEqual({ sql: 'x.sql', trocken: true })
  })
})
