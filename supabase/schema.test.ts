import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tabellenRuempfe } from '../scripts/schema-attrappe'

/**
 * `schema.sql` ist **die** Quelle des Datenbankschemas (README „Hosting").
 *
 * Bis zum 17. September 2026 lag daneben eine Kette von 25 Migrationen, und
 * jede versicherte in ihrem Kopf „Neuinstallationen brauchen diese Datei nicht
 * — schema.sql enthält alles". Niemand hielt das nach: fs_rules, fs_weeks,
 * is_group_overseer(), reminder_log und persons.fam waren über Monate nur in
 * den Migrationen zu finden. Wer der Anleitung folgte, bekam eine Versammlung,
 * in der die Treffpunkte tot waren und jedes Speichern einer Person
 * fehlschlug. Diese Suite verglich damals beide Seiten.
 *
 * **Die Kette ist gestrichen** — die App war noch nicht ausgerollt, also war
 * eine zweite Quelle nur Last. Damit entfällt der Vergleich; was bleibt, sind
 * die Proben an der Datei selbst, und die sind der eigentliche Grund, warum es
 * diese Suite gibt:
 *
 * Am 23. August 2026 hat ein Suchen-und-Ersetzen `schema.sql` zerrissen — `$$`
 * fiel auf `$` zusammen (die Datei ließ sich nicht mehr ausführen) und der
 * Dateirest wurde sechsmal eingespleißt. Von den sechs Fassungen jeder
 * Richtlinie gewinnt beim Ausführen die LETZTE, und das waren die alten,
 * schwächeren. Die Suite blieb dabei grün: `create function
 * public.task_gehoert_mir` stand ja weiterhin da — nur eben in einer Datei,
 * die keine Datenbank je angenommen hätte, und mit einem Rumpf, der die
 * Rechteprüfung nicht enthielt.
 */

const dir = import.meta.dirname
const schema = readFileSync(join(dir, 'schema.sql'), 'utf8')

/** Alle Vorkommen der ersten Gruppe eines globalen Musters. */
function treffer(sql: string, muster: RegExp): string[] {
  return [...sql.matchAll(muster)].map((m) => m[1].toLowerCase())
}

const TABELLEN = /create table if not exists public\.(\w+)/g
const FUNKTIONEN = /create (?:or replace )?function public\.(\w+)/g

/**
 * Eine Richtlinie vom Namen bis zum abschließenden `;`. Trägt keine der
 * Richtlinien dieses Projekts ein Semikolon im Rumpf, ist das eindeutig — die
 * Probe „kein `;` im Rumpf" steht als eigener Fall weiter unten.
 */
const RICHTLINIE = /create policy (\w+) on public\.(\w+)([\s\S]*?);/g

/** Eine Funktion samt Kopf (Sprache, Rechte, search_path) und Dollar-Rumpf. */
const FUNKTIONS_RUMPF = /create (?:or replace )?function public\.(\w+)([\s\S]*?)as \$\$([\s\S]*?)\$\$/g

/** Kommentare weg, Leerraum vereinheitlicht — verglichen wird die Regel. */
function normiert(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Der Rumpf einer `create table`-Anweisung (ohne Kopf und schließende Klammer). */
function tabelle(name: string): string {
  return tabellenRuempfe(schema).get(name) ?? ''
}

function richtlinien(sql: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const [, name, tabelle, rumpf] of sql.matchAll(RICHTLINIE)) {
    m.set(name, normiert(`${tabelle} ${rumpf}`))
  }
  return m
}

function funktionsRuempfe(sql: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const [, name, kopf, rumpf] of sql.matchAll(FUNKTIONS_RUMPF)) {
    m.set(name, normiert(`${kopf} § ${rumpf}`))
  }
  return m
}

describe('schema.sql ist vollständig, ausführbar und eindeutig', () => {
  it('die Proben greifen überhaupt', () => {
    // Gegenprobe zur Gegenprobe: Fänden die Muster nichts, gingen alle Fälle
    // unten leer und damit grün durch — die Zusage wäre wertlos.
    expect(treffer(schema, TABELLEN).length).toBeGreaterThan(10)
    expect(richtlinien(schema).size).toBeGreaterThan(5)
    expect(funktionsRuempfe(schema).size).toBeGreaterThan(3)
  })

  it('jede Tabelle hat Row-Level-Security', () => {
    // Eine Tabelle ohne RLS wäre für jedes angemeldete Konto frei lesbar —
    // die Mandantentrennung hängt vollständig daran.
    const ohne = treffer(schema, TABELLEN).filter(
      (t) => !new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i').test(schema),
    )
    expect(ohne).toEqual([])
  })

  it('jede Funktion hat einen vollständigen Dollar-Rumpf', () => {
    // `as $` statt `as $$` ist für PostgreSQL ein Syntaxfehler: Die ganze
    // Datei bricht ab, und zwar VOR jedem `enable row level security`. Eine
    // Neuinstallation nach dieser Anleitung bekäme also gar nichts — der Fehler
    // fällt zwar auf, aber erst dem, der ihn ausbadet.
    const namen = treffer(schema, FUNKTIONEN)
    const mitRumpf = [...funktionsRuempfe(schema).keys()]
    const ohneRumpf = namen.filter((n) => !mitRumpf.includes(n))
    expect(ohneRumpf, 'Funktion ohne geschlossenen $$-Rumpf').toEqual([])
  })

  it('jede Richtlinie steht genau einmal', () => {
    // Beim Ausführen gewinnt die letzte Fassung: `drop policy if exists` +
    // `create policy` heißt, dass eine zweite Kopie die erste still ersetzt.
    // Zwei Fassungen derselben Richtlinie sind deshalb nie „doppelt gemoppelt",
    // sondern immer eine Frage danach, welche gilt.
    const mehrfach = [...schema.matchAll(/create policy (\w+) on/g)]
      .map((m) => m[1])
      .filter((name, i, alle) => alle.indexOf(name) !== i)
    expect([...new Set(mehrfach)], 'Richtlinie mehrfach angelegt').toEqual([])
  })

  it('jede Funktion steht genau einmal', () => {
    // Dasselbe eine Ebene tiefer: `create or replace` ersetzt still.
    const mehrfach = treffer(schema, FUNKTIONEN).filter(
      (name, i, alle) => alle.indexOf(name) !== i,
    )
    expect([...new Set(mehrfach)], 'Funktion mehrfach angelegt').toEqual([])
  })
})

describe('die Rechteprüfungen stehen im Schema', () => {
  /**
   * Drei Regeln, die je einen gemessenen Missbrauch abstellen. Sie stehen hier
   * einzeln und wörtlich, weil eine Datei, die nur mit sich selbst verglichen
   * wird, jede Abschwächung mitmacht.
   */
  it('bestätigen darf nur, wem die Aufgabe gehört (T89)', () => {
    const rumpf = richtlinien(schema).get('confirmations_write') ?? ''
    expect(rumpf).toContain('task_gehoert_mir(task_key)')
  })

  it('eine bekannte Art in fremder Schreibweise fällt nicht in den Durchlass', () => {
    // „…|helper|mik|0.0" war Platz 0 in Verkleidung: Die Datenbank hielt es
    // für eine unbekannte Form und ließ die Absage für einen fremden Platz zu.
    const fn = funktionsRuempfe(schema).get('task_gehoert_mir') ?? ''
    expect(fn).toContain("elsif art in ('ratgeber', 'helper', 'part', 'aux') then return false;")
    expect(fn).not.toContain("'^\\d+$'")
  })

  it('einen Eintrag im öffentlichen Zeugnisgeben bestätigt nur, wem er gehört (T120)', () => {
    // Ohne eigenen Zweig liefe `oz|…` als „keine der bekannten Formen" durch,
    // und jedes Mitglied hätte fremde Einträge bestätigen oder absagen können.
    // Der Zweig muss **vor** diesem Durchlass stehen.
    const fn = funktionsRuempfe(schema).get('task_gehoert_mir') ?? ''
    const zweig = fn.indexOf("if n = 3 and teile[1] = 'oz' then")
    const durchlass = fn.indexOf("if n < 3 or teile[2] not in ('mid', 'we') then return true;")
    expect(zweig).toBeGreaterThan(-1)
    expect(durchlass).toBeGreaterThan(zweig)
    const rumpf = fn.slice(zweig, durchlass)
    expect(rumpf).toContain('e.person_id = meine')
    expect(rumpf).toContain('e.congregation_id = cong')
  })

  it('Weitere Pläne: Entwürfe sehen nur Admin und Planer, Veröffentlichtes die eigene Versammlung (T120, Phase 5)', () => {
    const fn = funktionsRuempfe(schema).get('plan_sichtbar') ?? ''
    // Die Funktion liest dieselbe Tabelle, deren Richtlinie sie ist — ohne
    // `security definer` liefe sie in die Rekursion.
    expect(fn).toContain('security definer')
    // Der Planer verteilt die Gruppen, bevor der Admin veröffentlicht (4.10.2026).
    expect(fn).toContain('public.darf_zuteilen()')
    expect(fn).toContain('not p.entwurf')
    expect(fn).toContain('p.congregation_id = public.my_congregation_id()')
    const r = richtlinien(schema)
    expect(r.get('plaene_select') ?? '').toContain('public.plan_sichtbar(id)')
    expect(r.get('plan_eintraege_select') ?? '').toContain('public.plan_sichtbar(plan_id)')
    // Den Plan pflegt nur der Admin; die Gruppen darin verteilt auch der Planer.
    expect(r.get('plaene_write') ?? '').toContain('public.is_planner()')
    expect(r.get('plaene_write') ?? '').not.toContain('darf_zuteilen')
    expect(r.get('plan_eintraege_write') ?? '').toContain('public.darf_zuteilen()')
  })

  it('selbst eintragen nur mit Aufgabenbereich, nur für sich, nur als „selbst" (T120)', () => {
    const rein = richtlinien(schema).get('oz_eintraege_selbst_rein') ?? ''
    expect(rein).toContain('person_id = public.my_person_id()')
    expect(rein).toContain('public.darf_zeugnis()')
    expect(rein).toContain('selbst')
    // Austragen darf jeder nur sich selbst.
    expect(richtlinien(schema).get('oz_eintraege_selbst_raus') ?? '').toContain('person_id = public.my_person_id()')
  })

  it('eine gestrichene Schicht: kein Eintrag mehr hinein, und was drin war, räumt die Datenbank (4.10.2026)', () => {
    expect(tabelle('oz_termine')).toMatch(/^\s*aus\s+date\[\] not null default '\{\}'/m)
    // Eine bestehende Datenbank bekommt die Spalte beim nächsten Einspielen.
    expect(normiert(schema)).toContain("alter table public.oz_termine add column if not exists aus date[] not null default '{}';")
    // Wer sich nach dem Streichen eintragen will, prallt ab — unter derselben
    // Sperre auf dem Termin wie beim letzten freien Platz.
    const pruefen = funktionsRuempfe(schema).get('oz_platz_pruefen') ?? ''
    expect(pruefen).toContain('for update')
    expect(pruefen).toContain("if new.datum = any (termin.aus) then raise exception 'oz_faellt_aus'")
    // Wer sich vorher eingetragen hatte, ohne dass die App des Planers es
    // wusste, geht mit dem Streichen.
    const raeumen = funktionsRuempfe(schema).get('oz_ausfall_raeumen') ?? ''
    expect(raeumen).toContain('delete from public.oz_eintraege where termin_id = new.id and datum = any (new.aus);')
    expect(normiert(schema)).toContain(
      'create trigger oz_termine_ausfall after update of aus on public.oz_termine for each row when (new.aus is distinct from old.aus) execute function public.oz_ausfall_raeumen();',
    )
  })

  it('ein anderer Wochentag: die Datenbank räumt kommende Einträge am alten Tag ab — erst ab übermorgen (4.10.2026)', () => {
    const raeumen = funktionsRuempfe(schema).get('oz_tagwechsel_raeumen') ?? ''
    expect(raeumen).toContain(
      'delete from public.oz_eintraege where termin_id = new.id and datum > current_date + 1 and extract(dow from datum)::int <> new.wd;',
    )
    // Ohne `security definer`: Den Termin ändert ohnehin nur ein Planer.
    expect(raeumen).not.toContain('security definer')
    expect(normiert(schema)).toContain(
      'create trigger oz_termine_tagwechsel after update of wd on public.oz_termine for each row when (new.wd is distinct from old.wd) execute function public.oz_tagwechsel_raeumen();',
    )
  })

  it('eine Verhinderungs-Meldung geht an Admins und Planer (T89, 4.10.2026)', () => {
    // Seit dem 24.9.2026 legt `notify_planners` die Zeilen an: Ein Verkündiger
    // sieht in `members` nur sich selbst und kann die Planer nicht adressieren.
    const fn = funktionsRuempfe(schema).get('notify_planners') ?? ''
    expect(fn).toContain('security definer')
    // Wer zuteilt, sucht auch den Ersatz.
    expect(fn).toContain('and (m.planner or m.zuteiler)')
    // Alles außer der Verhinderung bleibt Admins und Planern vorbehalten.
    expect(fn).toContain("kind <> 'verhindert' and not public.darf_zuteilen()")
  })

  it('die Verhinderung trägt ihren Aufgaben-Schlüssel — gekürzt, mit Vorgabe, ohne alte Fassung daneben (4.10.2026)', () => {
    const fn = funktionsRuempfe(schema).get('notify_planners') ?? ''
    // Ein Wegweiser für den Tipp in der Glocke, kein Recht: gekürzt genügt.
    expect(fn).toContain("nullif(left(task, 300), '')")
    const text = normiert(schema)
    // Ohne Vorgabe brächen Aufrufe ohne Schlüssel (Import, ältere App-Stände);
    // stünde die Fassung mit drei Parametern daneben, wären sie mehrdeutig.
    expect(text).toContain('function public.notify_planners(kind text, subject text, message text, task text default null)')
    expect(text).toContain('drop function if exists public.notify_planners(text, text, text);')
    expect(text).toContain('grant execute on function public.notify_planners(text, text, text, text) to authenticated;')
    expect(text).not.toContain('grant execute on function public.notify_planners(text, text, text) to')
  })

  it('unmittelbar in notifications schreiben nur Planer — der Verkündiger-Zweig ist weg', () => {
    // Er war nie erreichbar (die App fand keinen Empfänger) und hielte eine
    // zweite Lesart derselben Regel offen.
    const rumpf = richtlinien(schema).get('notifications_insert') ?? ''
    expect(rumpf).toContain('public.is_planner()')
    expect(rumpf).not.toContain('verhindert')
  })

  describe('Rechte-Stufen Admin, Planer, Gruppenaufseher (4.10.2026)', () => {
    const r = () => richtlinien(schema)
    const fn = (name: string) => funktionsRuempfe(schema).get(name) ?? ''

    it('das Planer-Recht steht am Konto, an der Einladung und als Vormerkung an der Person — auch nachträglich', () => {
      expect(tabelle('members')).toMatch(/^\s*zuteiler\s+boolean not null default false/m)
      expect(tabelle('invites')).toMatch(/^\s*zuteiler\s+boolean not null default false/m)
      expect(tabelle('persons')).toMatch(/^\s*zuteiler_vorgemerkt\s+boolean not null default false/m)
      const text = normiert(schema)
      expect(text).toContain('alter table public.members add column if not exists zuteiler boolean not null default false;')
      expect(text).toContain('alter table public.invites add column if not exists zuteiler boolean not null default false;')
      expect(text).toContain('alter table public.persons add column if not exists zuteiler_vorgemerkt boolean not null default false;')
      // Wer mit einem Code beitritt, bekommt das vorgemerkte Recht.
      expect(fn('redeem_invite')).toContain('inv.planner, inv.zuteiler')
    })

    it('darf_zuteilen fragt Admin oder Planer, eigene_gruppen Aufseher oder Gehilfe — beide als security definer', () => {
      expect(fn('darf_zuteilen')).toContain('security definer')
      expect(fn('darf_zuteilen')).toContain('select planner or zuteiler from public.members where user_id = auth.uid()')
      expect(fn('eigene_gruppen')).toContain('security definer')
      expect(fn('eigene_gruppen')).toContain('g.overseer_id = m.person_id or g.assistant_id = m.person_id')
    })

    it('Wochen schreibt unmittelbar nur der Admin — der Planer kommt über die Function `zuteilen`', () => {
      // Erlaubte die Richtlinie dem Planer das Schreiben, wäre die Grenze
      // `nurZuteilungen` umgangen: Er schriebe die Woche direkt.
      const rumpf = r().get('weeks_write') ?? ''
      expect(rumpf).toContain('public.is_planner()')
      expect(rumpf).not.toContain('darf_zuteilen')
      expect(rumpf).not.toContain('zuteiler')
    })

    it('Treffpunkte: der Grundplan nur für die eigene Gruppe, Versammlungstreffpunkte nur der Admin', () => {
      const rumpf = r().get('fs_rules_write') ?? ''
      expect(rumpf).toContain('public.is_planner() or grp = any (public.eigene_gruppen())')
      expect(rumpf).not.toContain('is_group_overseer')
      expect(rumpf).not.toContain('darf_zuteilen')
    })

    it('Treffpunkt-Wochen: schreiben dürfen Admin, Planer und Gruppenaufseher, löschen nur der Admin — und der Trigger prüft', () => {
      const alle = r()
      expect(alle.get('fs_weeks_write') ?? '').toMatch(/for all .*public\.is_planner\(\)/)
      expect(alle.get('fs_weeks_write') ?? '').not.toContain('is_group_overseer')
      expect(alle.get('fs_weeks_einfuegen') ?? '').toMatch(/for insert .*public\.darf_zuteilen\(\) or public\.is_group_overseer\(\)/)
      expect(alle.get('fs_weeks_aendern') ?? '').toMatch(/for update .*public\.darf_zuteilen\(\) or public\.is_group_overseer\(\)/)
      expect(normiert(schema)).toContain(
        'create trigger fs_weeks_pruefen before insert or update on public.fs_weeks for each row execute function public.fs_weeks_pruefen();',
      )
      const pruefen = fn('fs_weeks_pruefen')
      expect(pruefen).toContain('if auth.uid() is null or public.is_planner() then return new;')
      // Ein Upsert kommt als INSERT an — verglichen wird mit der bestehenden Woche.
      expect(pruefen).toContain('where f.congregation_id = new.congregation_id and f.start = new.start;')
      expect(pruefen).toContain("raise exception 'nur-eigene-gruppe' using errcode = '42501';")
      const fremde = fn('fs_fremde')
      // Der Planer darf bei fremden Gruppen nur den Leiter setzen — der ganze
      // Ausdruck, nicht ein Teil davon: Ein Abzug mehr (`- 'time'`) enthielte
      // den Teil weiterhin, und die Probe ginge durch.
      expect(fremde).toContain("case when ohne_leiter then e.i - 'leader' - 'lpid' - 'lext' else e.i - 'lpid' end")
      // Fremd ist alles außerhalb der eigenen Gruppen, Versammlungstreffpunkte eingeschlossen.
      expect(fremde).toContain("where e.i ->> 'grp' is null or not ((e.i ->> 'grp') = any (eigene::text[]))")
      // Die Reihenfolge der Liste zählt nicht.
      expect(fremde).toContain("order by e.i ->> 'id'")
    })

    it('Gruppenbesuche: der Planer wechselt nur den Besucher', () => {
      const alle = r()
      expect(alle.get('gruppenbesuche_write') ?? '').toContain('public.is_planner()')
      expect(alle.get('gruppenbesuche_besucher') ?? '').toMatch(/for update .*public\.darf_zuteilen\(\)/)
      expect(alle.get('gruppenbesuche_besucher_upsert') ?? '').toMatch(/for insert .*public\.darf_zuteilen\(\)/)
      const pruefen = fn('gruppenbesuche_pruefen')
      expect(pruefen).toContain('new.woche is distinct from bisher.woche')
      expect(pruefen).toContain('new.grp is distinct from bisher.grp')
      // Anlegen kann der Planer keinen Besuch.
      expect(pruefen).toContain("if not found then raise exception 'nur-besucher'")
      expect(normiert(schema)).toContain(
        'create trigger gruppenbesuche_pruefen before insert or update on public.gruppenbesuche for each row execute function public.gruppenbesuche_pruefen();',
      )
    })

    it('Zeugnis-Schichten besetzen Admin und Planer, die Termine nur der Admin', () => {
      expect(r().get('oz_eintraege_planer') ?? '').toContain('public.darf_zuteilen()')
      expect(r().get('oz_termine_write') ?? '').toContain('public.is_planner()')
      expect(r().get('oz_termine_write') ?? '').not.toContain('darf_zuteilen')
    })

    it('Zusagen eines neu besetzten Platzes räumen Admin und Planer überall, der Gruppenaufseher bei den Treffpunkten', () => {
      expect(r().get('confirmations_delete_planner') ?? '').toContain(
        "public.darf_zuteilen() or (public.is_group_overseer() and task_key like 'fs|%')",
      )
    })

    it('Personen, Gruppen, Dienste, Versammlung, Mitglieder und Einladungen bleiben beim Admin', () => {
      for (const name of ['persons_write', 'groups_write', 'services_write', 'congregations_update', 'members_update', 'invites_all', 'households_write']) {
        const rumpf = r().get(name) ?? ''
        expect(rumpf, name).toContain('public.is_planner()')
        expect(rumpf, name).not.toContain('darf_zuteilen')
      }
    })
  })

  it('eine Abwesenheit gilt nur der eigenen Person (T97)', () => {
    // Der Zweig „die Zeile gehört mir" sagt nichts über `person_id` — genau
    // darüber ließ sich eine Abwesenheit auf einen Fremden eintragen. Im
    // `with check` muss er deshalb an die eigene Person gebunden sein.
    const rumpf = richtlinien(schema).get('absences_write') ?? ''
    const check = rumpf.slice(rumpf.indexOf('with check'))
    expect(check).toContain('person_id is null or person_id = public.my_person_id()')
  })
})

describe('kein Altbestand mehr im Schema', () => {
  it('der Aufgaben-Schlüssel kennt nur noch die stabile Kennung', () => {
    // Die positionsbasierte Form (`…|part|<si>|<ii>|<ni>`, sechs Felder) fiel
    // mit der Altlasten-Räumung weg: Jeder Programmpunkt trägt seit dem Import
    // seine `iid`. Bliebe der Zweig stehen, akzeptierte die Datenbank weiter
    // Schlüssel, die der Client nie schreibt — eine offene Fläche ohne Nutzen.
    const fn = funktionsRuempfe(schema).get('task_gehoert_mir') ?? ''
    expect(fn).not.toContain('n = 6')
  })

  it('services trägt keine priv-Spalte mehr', () => {
    // Jeder Dienst leitet seinen Bereich aus dem Key ab (`svc:<key>`); die
    // Spalte hielt nur die frühere feste Zuordnung fest.
    expect(tabelle('services')).not.toMatch(/^\s*priv\s/m)
  })

  it('ein Hilfsdienst-Platz ist ein Objekt, keine Zeichenkette', () => {
    // Der Zweig `jsonb_typeof(slot) = 'string'` bediente Plätze aus dem
    // Altbestand. Seit der Räumung (T104) schreibt der Client ausschließlich
    // `{ name, pid? }` — ein Zweig für eine Form, die es nicht mehr gibt, ist
    // eine zweite Lesart derselben Daten und damit eine Fehlerquelle.
    const fn = funktionsRuempfe(schema).get('task_gehoert_mir') ?? ''
    expect(fn).not.toContain('jsonb_typeof')
  })

  it('kein Anzeigetext als Datenquelle: meeting_times ist weg', () => {
    // Tag und Uhrzeit standen als „Di 19:00 · So 10:00" in einer Textspalte und
    // wurden per regulärem Ausdruck zurückgelesen. Jetzt vier Spalten.
    // Gemeint ist die **Spalte**; im Kommentar darüber steht der Name weiter,
    // denn ohne ihn wüsste beim nächsten Mal niemand mehr, warum es vier sind.
    expect(tabelle('congregations')).not.toMatch(/^\s*meeting_times\s/m)
    expect(tabelle('congregations')).toMatch(/mid_wd\s+smallint/)
    expect(tabelle('congregations')).toMatch(/we_time\s+time/)
  })

  it('kein Einstellungs-Beutel mehr in congregations', () => {
    // `settings jsonb` trug Erinnerungsgrenzen, Sprachen und die Zusätzliche
    // Klasse — ohne einen einzigen Typ und ohne eine einzige Zusicherung.
    expect(tabelle('congregations')).not.toMatch(/^\s*settings\s/m)
  })

  it('kein zweiter Name an der Person: die Spalte dn ist weg', () => {
    // Sie war nur nötig, solange zwei Personen gleich heißen konnten (T110).
    expect(tabelle('persons')).not.toMatch(/^\s*dn\s/m)
  })

  it('mein_anzeigename nimmt schlicht Vor- und Nachname', () => {
    // Vorher schob ein `coalesce` einen Kurznamen davor. Der Rückfall über den
    // Namen war die Lücke in der Bestätigungs-Richtlinie, solange Namen
    // doppelt sein konnten; jetzt ist er eindeutig.
    const fn = funktionsRuempfe(schema).get('mein_anzeigename') ?? ''
    expect(fn).toContain("btrim(p.fn || ' ' || p.ln)")
    expect(fn).not.toContain('coalesce')
  })

  it('die Redner auswärts sind weg — Tabelle, Richtlinien und Schlüsselzweig (4.10.2026)', () => {
    expect(treffer(schema, TABELLEN)).not.toContain('vortraege_auswaerts')
    expect([...richtlinien(schema).keys()].filter((r) => r.startsWith('vortraege_auswaerts'))).toEqual([])
    expect(funktionsRuempfe(schema).get('task_gehoert_mir') ?? '').not.toContain("teile[1] = 'va'")
    // Eine bestehende Datenbank verliert die Tabelle beim nächsten Einspielen.
    expect(normiert(schema)).toContain('drop table if exists public.vortraege_auswaerts cascade;')
  })

  it('„Familien reihum" ist weg — Vorlage, Gastgeber und Mahlzeit (4.10.2026)', () => {
    expect(tabelle('plaene')).not.toMatch(/^\s*vorlage\s/m)
    expect(tabelle('plan_eintraege')).not.toMatch(/^\s*(person_id|mahlzeit)\s/m)
    // Eine bestehende Datenbank verliert die Spalten beim nächsten Einspielen.
    const sql = normiert(schema)
    expect(sql).toContain('alter table public.plaene drop column if exists vorlage;')
    expect(sql).toContain('alter table public.plan_eintraege drop column if exists person_id;')
    expect(sql).toContain('alter table public.plan_eintraege drop column if exists mahlzeit;')
    expect(funktionsRuempfe(schema).get('plan_sichtbar') ?? '').not.toMatch(/vorlage|person_id|fam/)
  })

  it('je Plan und Woche ein Eintrag — der Index entsteht erst, wenn die Familienpläne weg sind', () => {
    // Mittag und Abend am selben Tag waren zwei Einträge je Plan und Tag; davor
    // angelegt, bräche der eindeutige Index das Einspielen ab.
    const index = schema.indexOf('create unique index if not exists plan_eintraege_woche')
    const aufraeumen = schema.indexOf("delete from public.plaene where vorlage = 'familien'")
    expect(index).toBeGreaterThan(-1)
    expect(aufraeumen).toBeGreaterThan(-1)
    expect(index).toBeGreaterThan(aufraeumen)
    expect(normiert(schema)).toContain('on public.plan_eintraege (plan_id, datum);')
  })

  it('das Aufräumen steht hinter den Tabellen, aus denen es löscht', () => {
    // Auf einer frischen Datenbank liefe ein `delete from` vor seinem
    // `create table` ins Leere — und das Einspielen bräche dort ab.
    const loeschen = [...schema.matchAll(/^\s*delete from public\.(\w+)/gm)]
    for (const m of loeschen) {
      const angelegt = schema.indexOf(`create table if not exists public.${m[1]} (`)
      expect(angelegt, m[1]).toBeGreaterThan(-1)
      expect(angelegt, m[1]).toBeLessThan(m.index)
    }
    // Gegenprobe: Es gibt solche Zeilen überhaupt — die drei der Redner, die der
    // Familienpläne und die zwei Trigger, die Einträge eines Termins räumen
    // (`oz_ausfall_raeumen`, `oz_tagwechsel_raeumen`). Die laufen zwar erst
    // beim Ändern eines Termins, stehen aber ebenso hinter ihrer Tabelle.
    expect(loeschen.map((m) => m[1]).sort()).toEqual([
      'assignment_log',
      'confirmations',
      'notifications',
      'oz_eintraege',
      'oz_eintraege',
      'plaene',
    ])
  })
})

/**
 * **Vor- und Nachname sind je Versammlung eindeutig** (T110).
 *
 * Die Zusicherung, auf der der Namens-Rückfall überall sonst beruht: an jedem
 * Platz ohne `pid` ordnet allein der Name zu — in den Wochen, in den
 * Functions und in `mein_anzeigename()` der Bestätigungs-Richtlinie. Die
 * Prüfung in der App hält weder einen zweiten Planer auf noch ein Skript;
 * dieser Index hält beide.
 *
 * Geprüft wird der Ausdruck **wörtlich**, denn er muss mit
 * `namensSchluessel()` in `src/data/helpers.ts` übereinstimmen. Liefe eine der
 * beiden Seiten weg, wiese die Datenbank Namen ab, die die App durchgelassen
 * hat — ein Schreibfehler ohne erkennbaren Anlass.
 */
describe('Personennamen sind eindeutig', () => {
  const idx = /create unique index if not exists persons_name_eindeutig\s+on public\.persons \(([^;]*?)\)\s*\n\s*where ([^;]+);/.exec(schema)

  it('der eindeutige Index steht da', () => {
    expect(idx, 'persons_name_eindeutig fehlt in schema.sql').not.toBeNull()
  })

  it('er gilt je Versammlung', () => {
    expect(idx?.[1]).toContain('congregation_id')
  })

  it('er vergleicht klein geschrieben, ohne Rand und ohne mehrfache Leerzeichen', () => {
    const ausdruck = idx?.[1] ?? ''
    expect(ausdruck).toContain('lower(')
    expect(ausdruck).toContain('btrim(')
    expect(ausdruck).toContain("regexp_replace(fn || ' ' || ln")
    // Akzente bleiben unterschieden — kein `unaccent` und kein „base"-Vergleich.
    expect(ausdruck).not.toContain('unaccent')
  })

  it('Namenlose bleiben draußen — zwei frisch angelegte sind keine Dublette', () => {
    expect(idx?.[2] ?? '').toContain("btrim(fn || ' ' || ln) <> ''")
  })
})

/**
 * Die Mandantentrennung hängt nicht nur an RLS, sondern auch daran, dass kein
 * Verweis über die Versammlungsgrenze zeigen **kann**. Beides ist hier
 * maschinell nachzuhalten, weil beim Anlegen einer neuen Tabelle genau das
 * vergessen wird.
 */
describe('Fremdschlüssel tragen die Versammlung mit', () => {
  /** Jedes `references public.<tabelle> (<spalten>)` im Schema. */
  const verweise = [...schema.matchAll(/references\s+public\.(\w+)\s*\(([^)]*)\)/g)].map(
    ([, ziel, spalten]) => ({
      ziel: ziel ?? '',
      spalten: (spalten ?? '').split(',').map((s) => s.trim()),
    }),
  )

  it('die Proben greifen überhaupt', () => {
    expect(verweise.length).toBeGreaterThan(10)
  })

  it('wer auf eine Person, Gruppe oder einen Haushalt zeigt, nennt beide Spalten', () => {
    // Ein einspaltiger Verweis auf `persons (id)` erlaubt es einer Zeile der
    // Versammlung A, auf eine Person der Versammlung B zu zeigen. RLS
    // verhindert das Lesen, nicht das Schreiben.
    const einspaltig = verweise.filter(
      (v) => ['persons', 'groups', 'households'].includes(v.ziel) && v.spalten.length !== 2,
    )
    expect(einspaltig, 'Verweis ohne congregation_id').toEqual([])
  })

  it('jeder zusammengesetzte Fremdschlüssel nennt beim Nullen seine Spalte', () => {
    // `on delete set null` ohne Spaltenliste nullt ALLE Spalten des
    // Fremdschlüssels — also auch `congregation_id`, die `not null` ist. Das
    // Löschen einer Person schlüge damit fehl, und zwar erst im Betrieb.
    const ohneListe = [...schema.matchAll(/foreign key\s*\([^)]*,[^)]*\)([\s\S]*?)(?=,\n|\n\);)/g)]
      .map((m) => normiert(m[1] ?? ''))
      .filter((rest) => rest.includes('on delete set null') && !/on delete set null \(/.test(rest))
    expect(ohneListe, 'set null ohne Spaltenliste').toEqual([])
  })
})

describe('keine Indizes, die schon dastehen', () => {
  /**
   * Eine `unique`-Bedingung legt ihren Index selbst an, und PostgreSQL nutzt
   * dessen führende Spalten auch für kürzere Abfragen. Ein eigener Index auf
   * denselben oder auf führenden Spalten kostet Schreiblast und bringt nichts —
   * die Begründung steht wörtlich bei `assignment_log`, galt aber jahrelang
   * nicht für `weeks` und `fs_weeks`, die je einen (fs_weeks: zwei) hatten.
   */
  const spaltenliste = (s: string): string[] => s.split(',').map((x) => x.trim().toLowerCase())

  const uniques = new Map<string, string[][]>()
  for (const [, name] of schema.matchAll(TABELLEN)) {
    const block = tabelle(name ?? '')
    uniques.set(
      (name ?? '').toLowerCase(),
      [...block.matchAll(/unique\s*\(([^)]*)\)/g)].map((m) => spaltenliste(m[1] ?? '')),
    )
  }

  it('kein Index doppelt eine unique-Bedingung', () => {
    const doppelt: string[] = []
    for (const [, idx, tab, spalten] of schema.matchAll(
      /create index if not exists (\w+)\s+on public\.(\w+)\s*\(([^)]*)\)/g,
    )) {
      const cols = spaltenliste(spalten ?? '')
      const gedeckt = (uniques.get((tab ?? '').toLowerCase()) ?? []).some((u) =>
        cols.every((c, i) => u[i] === c),
      )
      if (gedeckt) doppelt.push(`${idx} auf ${tab}`)
    }
    expect(doppelt, 'Index deckt sich mit einer unique-Bedingung').toEqual([])
  })
})
