import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  argumente,
  BEHALTEN,
  displayName,
  gleichnamige,
  KASKADIERT,
  LEEREN,
  NEU_ANGELEGT,
  parseInsert,
  parseKuratiert,
  regelnAufIds,
  regelnAufNamen,
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
      "('0279161b-80c9-4d0f-8500-f54c8dd62a9a', (select id from public.congregations limit 1), 'Jörg', 'Grünwald', '', " +
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
  it('ist Vor- und Nachname, getrimmt', () => {
    expect(displayName('Jörg', 'Grünwald')).toBe('Jörg Grünwald')
    // Namensgleiche trennt seit T110 ein Zusatz am Vornamen, kein zweites Feld.
    expect(displayName('Josef sen.', 'Mayer')).toBe('Josef sen. Mayer')
    expect(displayName('', 'Mayer')).toBe('Mayer')
  })
})

/**
 * **Gleichnamige im SQL halten das Zurücksetzen an** (T110), bevor der erste
 * Löschbefehl hinausgeht: Der Index `persons_name_eindeutig` würde den
 * Sammel-`insert` ohnehin abweisen — nur wären die alten Personen dann schon
 * weg, und in der Meldung von PostgreSQL stünde kein Name.
 */
describe('gleichnamige', () => {
  const p = (id: string, fn: string, ln: string) => ({ id, fn, ln })

  it('meldet je Namen die betroffenen Personen', () => {
    const doppelt = gleichnamige([
      p('a', 'Josef', 'Mayer'),
      p('b', 'Josef', 'Mayer'),
      p('c', 'Anna', 'Berg'),
    ])
    expect(doppelt.map((liste) => liste.map((x) => x.id))).toEqual([['a', 'b']])
  })

  it('vergleicht wie die App: Schreibweise und Leerzeichen zählen nicht', () => {
    expect(gleichnamige([p('a', 'Josef', 'Mayer'), p('b', 'josef  ', ' MAYER')])).toHaveLength(1)
  })

  it('Akzente unterscheiden — Müller und Muller dürfen zwei Menschen sein', () => {
    expect(gleichnamige([p('a', 'Anna', 'Müller'), p('b', 'Anna', 'Muller')])).toEqual([])
  })

  it('Namenlose zählen nicht mit', () => {
    expect(gleichnamige([p('a', '', ''), p('b', '', ' ')])).toEqual([])
  })

  it('ein eindeutiger Bestand meldet nichts', () => {
    expect(gleichnamige([p('a', 'Josef', 'Mayer'), p('b', 'Josef sen.', 'Mayer')])).toEqual([])
  })
})

describe('argumente', () => {
  it('liest --schlüssel Wert und --flagge', () => {
    expect(argumente(['--sql', 'x.sql', '--trocken'])).toEqual({ sql: 'x.sql', trocken: true })
  })
})

/**
 * **Die Liste, in die sich jede neue Tabelle selbst eintragen musste.**
 *
 * `LEEREN` zählt auf, was ein Zurücksetzen leert. Sie wuchs von Hand mit dem
 * Schema mit — und blieb einmal zurück: `assignment_log` kam mit T99 dazu und
 * fehlte hier. Das Versand-Tagebuch überlebte damit jedes Zurücksetzen, mit
 * Schlüsseln auf Wochen, die es nicht mehr gab; „Plan senden" hätte Plätze für
 * gemeldet gehalten, die es nicht mehr gibt.
 *
 * Diese Probe schließt die Lücke von der anderen Seite: Sie liest `schema.sql`
 * und verlangt, dass **jede** Tabelle mit `congregation_id` in genau einer der
 * drei Listen steht — geleert, gelöscht-und-neu-angelegt, oder behalten mit
 * Begründung. Wer eine Tabelle anlegt, wird hierher geführt und muss sich
 * entscheiden.
 *
 * **Und sie prüft das Skript, nicht nur seine Listen.** Eine Liste, die nur
 * mit sich selbst verglichen wird, beweist nichts: `persons` stand erst bei den
 * behaltenen, obwohl es gelöscht wird — fiele sein Löschschritt heraus, wäre
 * die Probe grün geblieben. Deshalb wird unten am Quelltext nachgesehen, dass
 * jede Tabelle aus `NEU_ANGELEGT` dort auch wirklich gelöscht wird.
 */
describe('Zurücksetzen lässt keine Tabelle aus', () => {
  const dir = import.meta.dirname
  const schema = readFileSync(join(dir, '..', 'supabase', 'schema.sql'), 'utf8')
  const skript = readFileSync(join(dir, 'versammlung-zuruecksetzen.mjs'), 'utf8')

  /** Jede Tabelle, deren create-table-Block eine `congregation_id` enthält. */
  const TABELLE = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g
  const mitVersammlung = [...schema.matchAll(TABELLE)]
    .filter(([, , block]) => /^\s*congregation_id\s/m.test(block ?? ''))
    .map(([, name]) => name!)

  it('die Probe greift überhaupt', () => {
    expect(mitVersammlung.length).toBeGreaterThan(10)
    expect(NEU_ANGELEGT.length).toBeGreaterThan(0)
  })

  it('jede Tabelle steht in genau einer der drei Listen', () => {
    const behandelt = [...LEEREN, ...NEU_ANGELEGT, ...Object.keys(BEHALTEN)]
    expect(mitVersammlung.filter((t) => !behandelt.includes(t))).toEqual([])
    const mehrfach = behandelt.filter((t, i) => behandelt.indexOf(t) !== i)
    expect(mehrfach, 'Tabelle steht auf mehreren Listen').toEqual([])
  })

  it('die Listen nennen nur Tabellen, die es gibt', () => {
    const da = new Set(mitVersammlung)
    const alle = [...LEEREN, ...NEU_ANGELEGT, ...Object.keys(BEHALTEN)]
    expect(alle.filter((t) => !da.has(t))).toEqual([])
  })

  it('was neu angelegt wird, löscht das Skript auch wirklich', () => {
    // Der eigene Löschschritt steht außerhalb der `LEEREN`-Schleife (die
    // Reihenfolge zählt: erst persons, dann groups, wegen der Fremdschlüssel).
    const fehlt = NEU_ANGELEGT.filter(
      (t) => !new RegExp(`rest\\(\`${t}\\?congregation_id`).test(skript),
    )
    expect(fehlt, 'steht in NEU_ANGELEGT, wird aber nicht gelöscht').toEqual([])
  })

  /**
   * **Was eine Kaskade mitnimmt, steht auf keiner der drei Listen.**
   *
   * Die Proben darüber lesen die Listen und das Skript — beide sagen nichts
   * darüber, was die **Datenbank** beim Löschen von sich aus mitlöscht.
   * `fs_rules` stand unter `BEHALTEN` („der Grundplan beschreibt die
   * Versammlung"), und das stimmte auch, solange es ein JSONB-Blob ohne
   * Fremdschlüssel war. Seit die Regel eine Zeile mit `grp → groups (on delete
   * cascade)` ist, nahm das Löschen der Gruppen jeden Gruppen-Treffpunkt mit:
   * „behalten" galt nur noch für `grp is null`, und gemerkt hätte es niemand.
   *
   * Diese Probe schließt die Lücke von der Datenbank her: Zeigt eine Tabelle
   * per `on delete cascade` auf eine, die dieses Skript **löscht**, dann muss
   * sie entweder selbst geleert werden (`LEEREN`/`NEU_ANGELEGT`) oder in
   * `KASKADIERT` stehen — also jemanden haben, der sie hinüberrettet.
   */
  it('jede Kaskade auf eine gelöschte Tabelle ist bedacht', () => {
    // `constraint … foreign key (spalte, congregation_id) references
    // public.<ziel> (…) on delete cascade` — je Treffer die Quelltabelle aus
    // dem umgebenden create-table-Block und das Ziel.
    const betroffen = new Set<string>()
    for (const [, quelle, block] of schema.matchAll(TABELLE)) {
      for (const [, ziel] of (block ?? '').matchAll(
        /references\s+public\.(\w+)\s*\([^)]*\)\s*on delete cascade/g,
      )) {
        if (quelle && ziel && NEU_ANGELEGT.includes(ziel) && quelle !== ziel) betroffen.add(quelle)
      }
    }

    // Ohne Treffer prüfte die Probe nichts — fs_rules → groups muss sie finden.
    expect([...betroffen], 'keine Kaskade erkannt').toContain('fs_rules')

    const ungedeckt = [...betroffen].filter(
      (t) => !LEEREN.includes(t) && !NEU_ANGELEGT.includes(t) && !(t in KASKADIERT),
    )
    expect(
      ungedeckt,
      'wird von einer Kaskade geleert, steht aber unter BEHALTEN ohne Rettung',
    ).toEqual([])
  })

  it('was gerettet wird, spielt das Skript auch wirklich zurück', () => {
    // Dieselbe Strenge wie bei NEU_ANGELEGT: Eine Liste, die nur mit sich
    // selbst verglichen wird, beweist nichts. Fiele der POST heraus, bliebe
    // die Probe oben grün und die Regeln wären trotzdem weg.
    const fehlt = Object.keys(KASKADIERT).filter((t) => !skript.includes(`rest('${t}'`))
    expect(fehlt, 'steht in KASKADIERT, wird aber nie zurückgeschrieben').toEqual([])
  })
})

/**
 * Das Sichern und Zurückholen selbst — über den **Gruppennamen**, weil die Ids
 * frisch aus dem SQL kommen (dieselbe Entscheidung wie bei den Konten).
 */
describe('Gruppen-Treffpunkte über das Zurücksetzen retten', () => {
  const GRUPPEN = new Map([
    ['g1', 'Gruppe 1'],
    ['g2', 'Gruppe 2'],
  ])
  const REGELN = [
    { id: 'r1', grp: null, wd: 6, time: '09:00', place: 'Saal', monthly: 0, skip_cong: false },
    { id: 'r2', grp: 'g1', wd: 6, time: '09:30', place: 'Markt', monthly: 0, skip_cong: true },
    { id: 'r3', grp: 'g2', wd: 3, time: '18:00', place: 'Park', monthly: 1, skip_cong: false },
  ]

  it('der Versammlungstreffpunkt wird nicht gesichert — ihn trifft die Kaskade nicht', () => {
    // `grp is null`: Der zusammengesetzte Fremdschlüssel greift dort gar nicht,
    // die Zeile überlebt das Löschen der Gruppen von selbst. Sie mitzusichern
    // hieße, sie hinterher ein zweites Mal zu schreiben.
    expect(regelnAufNamen(REGELN, GRUPPEN).map((r) => r.id)).toEqual(['r2', 'r3'])
  })

  it('die Regel trägt statt der Id den Namen ihrer Gruppe', () => {
    const gesichert = regelnAufNamen(REGELN, GRUPPEN)
    expect(gesichert[0]).toEqual({
      id: 'r2', wd: 6, time: '09:30', place: 'Markt', monthly: 0, skip_cong: true,
      gruppenName: 'Gruppe 1',
    })
    expect(gesichert[0]).not.toHaveProperty('grp')
  })

  it('zurück auf die neuen Ids — auch wenn das SQL andere vergibt', () => {
    const gesichert = regelnAufNamen(REGELN, GRUPPEN)
    const neu = new Map([['Gruppe 1', 'neu-1'], ['Gruppe 2', 'neu-2']])
    const { wieder, verloren } = regelnAufIds(gesichert, neu)
    expect(wieder.map((r) => [r.id, r.grp])).toEqual([['r2', 'neu-1'], ['r3', 'neu-2']])
    expect(wieder[0]).not.toHaveProperty('gruppenName')
    expect(verloren).toEqual([])
  })

  it('eine Gruppe, die es nicht mehr gibt, nimmt ihren Treffpunkt mit — und wird genannt', () => {
    // Nicht stillschweigend: Die Regel hätte niemanden mehr, für den sie gilt,
    // aber der Betreiber soll erfahren, dass da etwas war.
    const gesichert = regelnAufNamen(REGELN, GRUPPEN)
    const { wieder, verloren } = regelnAufIds(gesichert, new Map([['Gruppe 1', 'neu-1']]))
    expect(wieder.map((r) => r.id)).toEqual(['r2'])
    expect(verloren).toEqual(['Gruppe 2'])
  })

  it('eine Regel ohne auffindbare Gruppe fällt schon beim Sichern heraus', () => {
    // Verwaiste Zeile (theoretisch unmöglich, der Fremdschlüssel verhindert
    // sie) — sie darf keinen `gruppenName: null` in die Sidecar-Datei tragen.
    const verwaist = [{ id: 'r9', grp: 'weg', wd: 1, time: '19:00', place: '', monthly: 0, skip_cong: false }]
    expect(regelnAufNamen(verwaist, GRUPPEN)).toEqual([])
  })
})
