#!/usr/bin/env node
/**
 * Mutationsprobe (T67) — misst, ob die Tests die Regeln wirklich verteidigen.
 *
 * **Die Frage, die grüne Tests nicht beantworten.** 1782 Tests laufen durch.
 * Das belegt, dass der Code tut, was die Tests erwarten — nicht, dass die Tests
 * erwarten, was die Regeln fordern. Coverage sagt nur, welche Zeile *ausgeführt*
 * wurde; ausgeführt wird auch eine Zeile, deren Ergebnis niemand prüft.
 *
 * Die Probe dreht die Frage um: Sie **bricht eine Regel absichtlich** und sieht
 * nach, ob überhaupt etwas rot wird.
 *
 *   - Wird der Testlauf **rot** → die Regel ist bewacht. ✔
 *   - Bleibt er **grün** → die Regel steht ungeschützt da: Man könnte sie
 *     morgen versehentlich entfernen, und der ganze Testbestand schwiege. ✘
 *
 * **Warum jede Mutation den ganzen Testlauf bekommt** und nicht nur die
 * „zuständige" Datei: Welcher Test eine Regel deckt, ist genau die Frage. Wer
 * die Auswahl vorher trifft, bekommt die Antwort heraus, die er hineingesteckt
 * hat. `--bail=1` bricht beim ersten roten Test ab — bewachte Mutationen sind
 * deshalb schnell, ungewachte kosten den vollen Lauf.
 *
 * **Der Katalog ist die eigentliche Arbeit.** Jeder Eintrag benennt eine
 * fachliche Regel, keine Syntaxvariante: „niemand ist zur selben Zeit in zwei
 * Räumen", „eine ausgefallene Zusammenkunft zählt nicht zur Auslastung". Eine
 * Mutation, die keine Regel bricht (Umbenennen, Umsortieren), darf grün bleiben
 * und gehört nicht hierher.
 *
 * **Die Probe rostet laut.** Findet ein `suchen` seine Stelle nicht mehr —
 * gar nicht oder mehrfach —, bricht der Lauf ab, statt den Eintrag
 * stillschweigend zu überspringen. Sonst stünde eines Tages ein Katalog voller
 * Einträge da, die nichts mehr messen, und meldete lauter grüne Häkchen.
 *
 *     node scripts/mutationsprobe.mjs            # alle
 *     node scripts/mutationsprobe.mjs zuteilung  # nur passende Kennungen
 *     node scripts/mutationsprobe.mjs --liste     # nur auflisten, nichts laufen lassen
 *
 * Läuft **nicht** in der CI: ein Durchgang kostet je Eintrag bis zu einen
 * vollen Testlauf. Sie ist ein Messgerät, das man ansetzt — wie `npm run
 * contrast` —, keine Sperrklinke wie `check-index-access`.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hier = dirname(fileURLToPath(import.meta.url))
const wurzel = join(hier, '..')

/**
 * Der Katalog.
 *
 * `regel` sagt, was gelten soll — in denselben Worten, in denen es im Quelltext
 * oder in `docs/analyse/todo.md` begründet ist. `suchen` muss **genau einmal**
 * in der Datei stehen; wo eine Zeile mehrfach vorkommt, steht die Nachbarzeile
 * mit dabei.
 */
const KATALOG = [
  // ── Auto-Zuteilung ────────────────────────────────────────────────────────
  {
    id: 'zuteilung-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Eine ausgefallene Zusammenkunft wird nicht besetzt (T30).',
    suchen: 'if (!meeting || istAusgefallen(next[weekIndex], tab)) {',
    ersetzen: 'if (!meeting) {',
  },
  {
    id: 'zuteilung-beide-raeume',
    datei: 'src/data/planning.ts',
    regel: 'Niemand ist zur selben Zeit im Hauptsaal und in der Zusätzlichen Klasse.',
    /*
      Die Stelle ist seit 244e1a0 („Ein Durchlauf statt elf") ein Aufruf von
      `programmPlaetze` — der Generator liefert beide Räume. Die Mutation nimmt
      ihm den zweiten wieder weg, indem sie nur `item.names` (Hauptsaal) liest;
      das ist genau die Fassung, mit der der Fehler entstanden ist.
    */
    suchen: 'for (const { slot } of programmPlaetze(meeting)) merken(slot)',
    ersetzen:
      'for (const s of meeting.sections) for (const it of s.items) if (!isSong(it)) for (const slot of it.names) merken(slot)',
  },
  {
    id: 'zuteilung-reinigungs-malus',
    datei: 'src/data/planning.ts',
    regel: 'Aufseher und Gehilfe der reinigenden Gruppe bekommen möglichst keinen Hilfsdienst.',
    suchen: "if (kind === 'helper' && cleaningLeaders.has(p.id)) e += HELPER_MALUS",
    ersetzen: "if (kind === 'helper' && cleaningLeaders.has(p.id)) e += 0",
  },
  {
    id: 'zuteilung-wt-leiter',
    datei: 'src/data/planning.ts',
    regel: 'Der feste WT-Studium-Leiter kommt vor dem Vertreter und beide vor der freien Auswahl.',
    suchen: "return designated('wtLeiter') ?? designated('wtVertreter') ?? pick('part', 'studium')",
    ersetzen: "return pick('part', 'studium')",
  },
  {
    id: 'zuteilung-wartezeit',
    datei: 'src/data/planning.ts',
    regel: 'Bei gleicher Last kommt zuerst, wer am längsten nicht dran war.',
    suchen: '        dist(b) - dist(a) ||\n',
    ersetzen: '',
  },
  {
    id: 'zuteilung-gruppen-rotation',
    datei: 'src/data/planning.ts',
    regel: 'Die Reinigung rotiert über die Gruppen, sie bleibt nicht bei der ersten.',
    suchen: 'const cleaningGroup = groups.length ? groups[weekIndex % groups.length] : null',
    ersetzen: 'const cleaningGroup = groups.length ? groups[0] : null',
  },
  {
    id: 'zuteilung-platzzahl',
    datei: 'src/data/planning.ts',
    regel: 'Ein Hilfsdienst wird über alle eingestellten Plätze besetzt, nicht nur den ersten.',
    suchen: '    for (let pos = 0; pos < svc.count; pos++) {\n      if (arr[pos]?.name) continue',
    ersetzen: '    for (let pos = 0; pos < 1; pos++) {\n      if (arr[pos]?.name) continue',
  },
  {
    id: 'zuteilung-partner-raum',
    datei: 'src/data/planning.ts',
    regel: 'Der Gesprächspartner richtet sich nach dem Führer DESSELBEN Raums (T18).',
    suchen: "const leadName = slotsOf(item, aux).find((n) => n.bereichsKey === 'schulung')?.name ?? ''",
    ersetzen: "const leadName = item.names.find((n) => n.bereichsKey === 'schulung')?.name ?? ''",
  },
  {
    id: 'zuteilung-partner-geschlecht',
    datei: 'src/data/planning.ts',
    regel: 'Der Gesprächspartner hat dasselbe Geschlecht wie der Führer (oder ist Familie).',
    suchen: 'extra: (p: Person) => partnerGenderOk(lead, p),',
    ersetzen: 'extra: (_p: Person) => true,',
  },
  {
    id: 'zuteilung-vorsitz-betet',
    datei: 'src/data/planning.ts',
    regel: 'Der Vorsitz spricht das Anfangsgebet (einzige erlaubte Doppel-Aufgabe).',
    suchen: 'if (vorsitz && gebet && !gebet.name) {',
    ersetzen: 'if (false && vorsitz && gebet && !gebet.name) {',
  },
  {
    id: 'zuteilung-abwesend',
    datei: 'src/data/planning.ts',
    regel: 'Wer abwesend gemeldet ist, wird nicht eingeteilt.',
    suchen:
      '        !istAbwesend(abwesend, p.id, weekIndex, tab) &&\n        (!opts.extra || opts.extra(p)) &&',
    ersetzen: '        (!opts.extra || opts.extra(p)) &&',
  },
  {
    id: 'zuteilung-gastredner',
    datei: 'src/data/planning.ts',
    regel: 'Gastredner und Kreisaufseher werden nicht automatisch besetzt (SKIP_ROLE).',
    // Gefragt wird inzwischen über `isGuestRole` statt direkt über den
    // Ausdruck — eine Abschrift weniger (siehe planning.ts, Kopfkommentar).
    suchen: 'if (slot.name || isGuestRole(slot.rolle)) continue',
    ersetzen: 'if (slot.name) continue',
  },

  // ── Auslastung ────────────────────────────────────────────────────────────
  {
    id: 'last-klasse-nur-wenn-vorhanden',
    datei: 'src/data/helpers.ts',
    regel: 'Die Zusätzliche Klasse zählt nur, solange sie besteht (T20).',
    /*
      Die Grenze steht seit dem gemeinsamen Durchlauf (244e1a0) in `raeume()`
      statt in jeder Zählschleife einzeln — beim Abschalten der Klasse bleiben
      die Namen bewusst stehen, damit ein Wiedereinschalten sie hat. Die
      Mutation gibt beide Räume bedingungslos zurück; die Auslastung schleppte
      dann eine Last mit, die es gar nicht mehr gibt.
    */
    suchen: 'return hatAuxKlasse(meeting) ? [false, true] : [false]',
    ersetzen: 'return [false, true]',
  },
  {
    id: 'last-hilfsdienst-platzzahl',
    datei: 'src/data/helpers.ts',
    regel: 'Hilfsdienst-Last zählt nur bis zur eingestellten Platzzahl (T21).',
    suchen: 'const bis = grenze ? (grenze.get(key) ?? 0) : assigned.length',
    ersetzen: 'const bis = assigned.length',
  },
  {
    id: 'last-ausfall',
    datei: 'src/data/helpers.ts',
    regel: 'Eine ausgefallene Zusammenkunft erzeugt keine Auslastung (T30).',
    // Die Zeile steht in `partWorkload` **und** in `helperWorkload`; die
    // Nachbarzeile darunter macht sie eindeutig (Ratgeber statt Hilfsdienst).
    suchen:
      '      if (istAusgefallen(week, tab)) continue\n      const meeting = week[tab]\n      if (hatAuxKlasse(meeting)',
    ersetzen: '      const meeting = week[tab]\n      if (hatAuxKlasse(meeting)',
  },
  {
    id: 'last-fenster-nach-datum',
    datei: 'src/data/helpers.ts',
    regel: 'Das Auslastungs-Fenster misst in Wochen (Datum), nicht in Listenplätzen (T36).',
    suchen: 'return weeks.find((w) => w?.start === ziel)',
    ersetzen: 'return weeks[wi + versatz]',
  },
  {
    id: 'gast-ohne-namens-rueckfall',
    datei: 'src/data/helpers.ts',
    regel: 'Ein externer Redner zählt nie auf eine gleichnamige eigene Person (T29).',
    suchen: 'return !isGuestRole(zuteilung.rolle) && zuteilung.name === displayName(person)',
    ersetzen: 'return zuteilung.name === displayName(person)',
  },
  {
    id: 'partner-familie',
    datei: 'src/data/helpers.ts',
    regel: 'Familienangehörige dürfen geschlechtsübergreifend Gesprächspartner sein.',
    suchen: 'return Boolean(lead.fam) && lead.fam === cand.fam',
    ersetzen: 'return false',
  },

  // ── Datum ─────────────────────────────────────────────────────────────────
  {
    id: 'termin-rangfolge',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Abweichung schlägt eigenen Termin schlägt Einstellungen (T30).',
    suchen: 'return verlegt ?? meetingDateParts(week[tab].date).offset ?? meetingDayOffsets(meetings)[tab]',
    ersetzen: 'return meetingDateParts(week[tab].date).offset ?? verlegt ?? meetingDayOffsets(meetings)[tab]',
  },
  {
    id: 'uhrzeit-rangfolge',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Dieselbe Rangfolge gilt für die Uhrzeit wie für den Tag.',
    suchen: '    abweichung(week, tab)?.time ??\n    meetingDateParts(week[tab].date).zeit ??',
    ersetzen: '    meetingDateParts(week[tab].date).zeit ??\n    abweichung(week, tab)?.time ??',
  },

  // ── Bestätigungen und Ersatz ──────────────────────────────────────────────
  {
    id: 'bestaetigt-gewinnt',
    datei: 'src/lib/data.ts',
    regel: 'Hat jemand bestätigt, ist der Platz besetzt — gleich wer vorher absagte (T84).',
    suchen: "    if (out[row.task_key] === 'bestätigt') continue\n",
    ersetzen: '',
  },
  {
    id: 'vorlage-beim-oeffnen',
    datei: 'src/app/reducer.ts',
    regel: 'Beim Öffnen wird vorgelegt, was offen ist — Bestätigung ODER Ersatzgesuch (T69).',
    suchen: "return myTasks.some((t) => t.status === 'offen') || substituteReqs.length > 0",
    ersetzen: "return myTasks.some((t) => t.status === 'offen')",
  },

  // ── Programm bearbeiten ───────────────────────────────────────────────────
  {
    id: 'lac-einfuegestelle',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein eigener Punkt reiht sich vor dem Bibelstudium ein — strukturell, nicht per Titel (T61).',
    suchen: "(x) => !isSong(x) && x.names.some((n) => n.bereichsKey === 'leser'),",
    ersetzen: "(x) => !isSong(x) && x.title.startsWith('Versammlungsbibelstudium'),",
  },
  {
    id: 'minuten-aus-feld',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Die Dauer kommt aus dem Feld, nicht aus dem Anzeigetext (T32).',
    suchen: "  if (typeof item.mins === 'number') return item.mins\n  return ersteZahl(item.meta ?? '')",
    ersetzen: "  return ersteZahl(item.meta ?? '')",
  },
  {
    id: 'ziffern-jeder-satz',
    datei: 'src/data/ziffern.ts',
    regel: 'Der Wert einer Ziffer stimmt in JEDEM Satz — auch in einem, der direkt an den nächsten grenzt.',
    suchen: '  return ziffernTabelle().get(c) ?? ziffernWertGezaehlt(c)',
    ersetzen: '  return ziffernWertGezaehlt(c)',
  },
  {
    id: 'ziffern-parser-jeder-satz',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Auch der Import liest jeden Ziffernsatz richtig — die Zweitschrift darf nicht zurückfallen.',
    suchen: '  const bekannt = ziffernTabelle().get(c)\n  if (bekannt !== undefined) return bekannt',
    ersetzen: '',
  },

  // ── Nicht besetzbar (Engpass) ─────────────────────────────────────────────
  {
    id: 'engpass-nur-wenn-sicher',
    datei: 'src/data/bedarf.ts',
    regel: 'Gewarnt wird erst, wenn WENIGER Leute da sind als Plätze — nicht schon bei gleich vielen.',
    suchen: 'if (verfuegbar >= benoetigt) continue',
    ersetzen: 'if (verfuegbar > benoetigt) continue',
  },
  {
    id: 'engpass-zaehlt-abwesende-mit',
    datei: 'src/data/bedarf.ts',
    regel: 'Verfügbar ist, wer qualifiziert UND an diesem Tag da ist.',
    suchen: 'const verfuegbar = qualifizierte.filter((p) => !istAbwesend(abwesend, p.id, wi, tab)).length',
    ersetzen: 'const verfuegbar = qualifizierte.length',
  },

  // ── Abwesenheiten ─────────────────────────────────────────────────────────
  {
    id: 'abwesenheit-gehoert-der-person',
    datei: 'src/aufgaben/AufgabenScreen.tsx',
    regel: '„Deine Einträge" hängen an der Person, nicht am Ersteller.',
    suchen: 'a.personId != null ? a.personId === state.personId : a.userId === state.userId,',
    ersetzen: 'a.userId === state.userId || a.personId === state.personId,',
  },
  {
    id: 'admin-schalter-zeigt-wirksames-recht',
    datei: 'src/personen/PrivToggle.tsx',
    regel: 'Der Admin-Schalter zeigt das Recht des Kontos, nicht die Vormerkung an der Person.',
    suchen: 'const on = konten.length > 0 ? konten.some((m) => m.planner) : Boolean(person.planner)',
    ersetzen: 'const on = Boolean(person.planner)',
  },
  {
    id: 'abwesenheit-person-aus-datensatz',
    datei: 'src/app/persist.ts',
    regel: 'Gespeichert wird die Person der Abwesenheit — nicht die des Angemeldeten.',
    suchen: 'saveAbsence(congId, action.absence)',
    ersetzen: 'saveAbsence(congId, { ...action.absence, personId: next.personId })',
  },

  // ── Treffpunkte ───────────────────────────────────────────────────────────
  {
    id: 'fs-gruppe-zuerst',
    datei: 'src/data/fs.ts',
    regel: 'Den Gruppentreffpunkt leitet jemand aus der Gruppe — vor dem Lastvergleich (F8).',
    suchen: '        gruppenRang(a.p) - gruppenRang(b.p) ||\n',
    ersetzen: '',
  },
  {
    id: 'fs-wochendeckel',
    datei: 'src/data/fs.ts',
    regel: 'Höchstens eine Leitung je Person und Woche, solange genug Kandidaten da sind.',
    suchen: 'const frei = alle.filter((k) => !inDerWoche.has(k.p.id))',
    ersetzen: 'const frei = alle',
  },
  {
    id: 'fs-kennung-ohne-wochennummer',
    datei: 'src/data/fs.ts',
    regel: 'Die Kennung eines Treffpunkts trägt keine Wochennummer (T87).',
    suchen: 'function instanzId(rule: FsRule): string {\n  return rule.id\n}',
    ersetzen: 'function instanzId(rule: FsRule): string {\n  return `1|${rule.id}`\n}',
  },
  {
    id: 'fs-kennung-altbestand',
    datei: 'src/data/fs.ts',
    regel: 'Gespeicherte Treffpunkte werden beim Laden auf die stabile Kennung gehoben.',
    // Seit 61c7629 („Abschriften zusammengeführt") ein Ausdruck statt zweier
    // Zeilen; die Mutation lässt die Kennung, wie sie war.
    suchen: "    return treffer?.[1] ? { ...inst, id: treffer[1] } : inst",
    ersetzen: '    return inst',
  },
  {
    id: 'fs-schluessel-altbestand',
    datei: 'src/lib/data.ts',
    regel: 'Die Bestätigung eines Treffpunkts wandert auf den stabilen Schlüssel mit.',
    suchen: '    if (treffer) renames.push([key, `fs|${treffer[1]}|${treffer[2]}`])',
    ersetzen: '    if (false && treffer) renames.push([key, key])',
  },
  {
    id: 'fs-tagessperre',
    datei: 'src/data/fs.ts',
    regel: 'Wer an einem Wochentag schon leitet, leitet dort nicht ein zweites Mal.',
    suchen: '      .filter((k) => !used.has(k.p.id))',
    ersetzen: '      .filter(() => true)',
  },

  {
    id: 'fs-fremde-gruppe',
    datei: 'src/data/fs.ts',
    regel: 'Einen Gruppentreffpunkt sieht nur, wer zu der Gruppe gehört oder sie leitet.',
    suchen: "  return insts.filter((inst) => inst.grp === '' || meine.has(inst.grp))",
    ersetzen: '  return [...insts]',
  },
  {
    id: 'fs-anzeige-fragt-sichtbarkeit',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Die Treffpunkt-Anzeige liest gefiltert aus der Woche, nicht roh (der Aufrufer).',
    suchen: '  const insts = fsVisible(',
    ersetzen: '  const insts = ((roh: FsInstance[]) => roh)(',
  },

  {
    id: 'fs-kandidaten-wochentag',
    datei: 'src/planen/kandidaten.ts',
    regel: '„Schon heute" meint den Wochentag DIESES Treffpunkts, nicht die ganze Woche.',
    suchen: 'if (o.id === sel.instId || o.wd !== inst.wd || o.lext || o.leader !== name) continue',
    ersetzen: 'if (o.id === sel.instId || o.lext || o.leader !== name) continue',
  },
  {
    id: 'fs-markierung-zweite-quelle',
    datei: 'src/app/reducer.ts',
    regel: 'Das „…" kennt beide Datenquellen — auch eine unbestätigte Treffpunkt-Leitung.',
    suchen:
      '        ...fsPendingIds(state.fsWeeks, kennungen, state.confirmations),\n',
    ersetzen: '',
  },
  {
    id: 'fs-markierung-bestaetigt',
    datei: 'src/data/fs.ts',
    regel: 'Eine bestätigte Treffpunkt-Leitung trägt kein „…" mehr — „verhindert" schon.',
    suchen: "if (confirmations[key] !== 'bestätigt') pending.add(kennungVon(inst.leader, inst.lpid))",
    ersetzen: 'pending.add(kennungVon(inst.leader, inst.lpid))',
  },

  // ── Zwischenablage ────────────────────────────────────────────────────────
  {
    id: 'kopieren-geste-zuerst',
    datei: 'src/lib/clipboard.ts',
    regel: 'Der gestensichere Weg kommt zuerst, die moderne API nur als Rückfall.',
    suchen:
      '  if (legacyCopy(text)) return true\n' +
      '  try {\n' +
      '    if (navigator.clipboard?.writeText) {\n' +
      '      await navigator.clipboard.writeText(text)\n' +
      '      return true\n' +
      '    }\n' +
      '  } catch {\n' +
      '    // beide Wege gescheitert\n' +
      '  }\n' +
      '  return false',
    ersetzen:
      '  try {\n' +
      '    if (navigator.clipboard?.writeText) {\n' +
      '      await navigator.clipboard.writeText(text)\n' +
      '      return true\n' +
      '    }\n' +
      '  } catch {\n' +
      '    // beide Wege gescheitert\n' +
      '  }\n' +
      '  return legacyCopy(text)',
  },

  // ── Übersetzung ───────────────────────────────────────────────────────────
  {
    id: 'monat-beide-tabellen',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Monatsnamen werden in Lang- UND Kurztabelle nachgeschlagen (T1).',
    suchen: 'const monatIndex = (name: string): number | undefined => MON[name] ?? MONA[name]',
    ersetzen: 'const monatIndex = (name: string): number | undefined => MON[name]',
  },
  {
    id: 'mitteilungstitel-schluessel',
    datei: 'src/i18n/ui.ts',
    regel: 'Jeder erzeugte Mitteilungs-Titel hat seinen Wörterbuch-Schlüssel — sonst steht er in 33 Sprachen deutsch in der Glocke.',
    suchen: "  'Programm importiert': 'notifProgImportiert',\n",
    ersetzen: '',
  },
  {
    id: 'datum-gregorianisch',
    datei: 'supabase/functions/_shared/i18n/locales.ts',
    regel: 'Datumsangaben stehen in jeder Sprache im gregorianischen Kalender — auch auf Persisch.',
    suchen: "fa: 'fa-IR-u-ca-gregory'",
    ersetzen: "fa: 'fa-IR'",
  },
  {
    id: 'sprache-am-html',
    datei: 'src/app/store.tsx',
    regel: 'Die Schreibrichtung folgt der Sprache — RTL für Arabisch, Hebräisch, Farsi, Urdu.',
    suchen: "document.documentElement.dir = isRTL(state.lang) ? 'rtl' : 'ltr'",
    ersetzen: "document.documentElement.dir = 'ltr'",
  },
  {
    id: 'toast-in-der-lesersprache',
    datei: 'src/app/reducer.ts',
    regel: 'Die Meldungen des Reducers stehen in der Sprache des Nutzers, nicht auf Deutsch.',
    suchen: 'return nextToast(state, fill(dict(state.lang)[key], params ?? {}))',
    ersetzen: "return nextToast(state, fill(dict('de')[key], params ?? {}))",
  },
  {
    id: 's89-bibellesung-am-bereich',
    datei: 'src/data/planning.ts',
    regel: 'Die Bibellesung wird am Bereich erkannt, nicht am deutschen Titel — sonst fehlt der S-89-Zettel in jeder anderen Sprache.',
    suchen: "    sel.priv === 'bibellesung' ||\n",
    ersetzen: '',
  },
  {
    id: 's89-rahmen-an-der-form',
    datei: 'src/data/planning.ts',
    regel: 'Der Rahmen eines Schülerteils ist das Meta-Stück ohne Ziffer — keine deutsche Wortliste.',
    suchen: "const setting = metaFrags.find((f) => f !== '' && ersteZahl(f) === null) ?? ''",
    ersetzen: "const setting = metaFrags.find((f) => f === 'Von Haus zu Haus') ?? ''",
  },
  {
    id: 's89-quelle-hinter-der-dauer',
    datei: 'src/data/planning.ts',
    regel: 'Der Schulungspunkt ist das Meta-Stück hinter der Dauer — nicht das mit „th"/„lmd" davor (die Kürzel werden mitübersetzt).',
    suchen: "const point = (zeitIdx >= 0 ? metaFrags[zeitIdx + 1] : undefined) ?? ''",
    ersetzen: "const point = metaFrags.find((f) => /^(th|lmd) /.test(f)) ?? ''",
  },
  {
    id: 'programm-block-an-der-art',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'Eröffnung und Abschluss werden an der Abschnitts-Art erkannt, nicht am Namen.',
    suchen: 'const splitHere = rawSection ? istBlockSektion(rawSection) : false',
    ersetzen: 'const splitHere = false',
  },
  {
    id: 'wischen-leserichtung',
    datei: 'src/components/useSwipeWeek.ts',
    regel: 'Der Wochenwisch folgt der Leserichtung — in RTL liegt die vorige Woche rechts.',
    suchen: "      document.documentElement.dir === 'rtl' ? -1 : 1",
    ersetzen: '      1',
  },
  {
    id: 'pfeil-leserichtung',
    datei: 'src/app/rtl.css',
    regel: 'Die Wochen-Pfeile kippen in RTL — sonst zeigt „vorige Woche" nach vorn.',
    suchen: "[dir='rtl'] .week-arrow {\n  transform: scaleX(-1);\n}",
    ersetzen: "[dir='rtl'] .week-arrow {\n  transform: none;\n}",
  },
  {
    id: 'streifen-leserichtung',
    datei: 'src/components/week-strip.css',
    regel: 'Die Nachbarwochen liegen in Leserichtung — logisch angegeben, nicht physisch.',
    suchen: '  inset-inline-end: 100%;',
    ersetzen: '  right: 100%;',
  },
  {
    id: 'bidi-eigene-texte',
    datei: 'src/personen/PersonDetail.tsx',
    regel: 'Personenfelder tragen ihre eigene Schreibrichtung — eine Telefonnummer dreht sich sonst in einer RTL-Oberfläche um.',
    suchen: '              dir="auto"\n',
    ersetzen: '',
  },
  {
    id: 'datumswaehler-montag',
    datei: 'src/components/DatePicker.tsx',
    regel: 'Der Kalender beginnt in jeder Sprache am Montag — wie die Programmwoche selbst.',
    suchen: 'const lead = (first.getUTCDay() + 6) % 7 // Montag = 0',
    ersetzen: 'const lead = first.getUTCDay()',
  },

  // ── Edge Functions ────────────────────────────────────────────────────────
  {
    id: 'erinnerung-ausfall',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Für eine ausgefallene Zusammenkunft wird nicht erinnert (T30).',
    suchen: 'if (istAusgefallenFuer(week.dev, tab)) continue',
    ersetzen: 'if (false) continue',
  },
  {
    id: 'erinnerung-fs-kennung',
    // Seit T99 in `_shared/zuteilungen.ts`: `send-plan` zählt dieselben Plätze
    // auf wie `send-reminders`, und zwei Fassungen einer solchen Aufzählung
    // waren hier schon die Ursache eines Fehlers (B8/T40).
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Der Versand greift nach der stabilen Treffpunkt-Kennung, auch im Altbestand (T87).',
    suchen: '    const key = `fs|${woche}|${stabileKennung(inst.id)}`',
    ersetzen: '    const key = `fs|${woche}|${inst.id}`',
  },
  {
    id: 'erinnerung-letzte-ist-letzte',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Die Wiederholung deckt die Tage zwischen erster und letzter Erinnerung ab — nicht die danach.',
    suchen: '  return days > frueh && days < spaet ? \'repeat\' : null',
    ersetzen: '  return days < spaet ? \'repeat\' : null',
  },
  {
    id: 'ersatz-nur-qualifizierte',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Übernehmen darf nur, wer für den Dienst freigegeben ist.',
    suchen: "if (!callerPerson || !callerPerson.priv?.[qualKey]) return json({ error: 'not-qualified' }, 403)",
    ersetzen: 'if (!callerPerson) return json({ error: \'not-qualified\' }, 403)',
  },
  {
    id: 'einladung-nur-planer',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Einladungen verschicken darf nur ein Planer.',
    suchen: "if (!member?.planner) return json({ error: 'forbidden' }, 403)",
    ersetzen: "if (!member) return json({ error: 'forbidden' }, 403)",
  },
  {
    id: 'einladung-eigene-versammlung',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Empfänger kommen aus der eigenen Versammlung — kein offenes Mail-Relay.',
    suchen: '`persons?select=id,fn,mail&congregation_id=eq.${wert(member.congregation_id)}`',
    ersetzen: "'persons?select=id,fn,mail'",
  },
  {
    id: 'einladung-ohne-absender',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Ohne verifizierten Absender wird nicht gesendet, sondern abgewunken.',
    suchen: "    if (!INVITE_FROM) return json({ error: 'not-configured' })\n",
    ersetzen: '',
  },
  {
    id: 'erinnerung-rumpf-uebersetzt',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Der Rumpf einer Push-Erinnerung steht in der Sprache des Geräts — nicht nur ihr Titel.',
    suchen: 'body: entries.map((e) => uebersetzt(e, tr)).join(\' · \'),',
    ersetzen: "body: entries.map(kanonisch).join(' · '),",
  },
  {
    id: 'erinnerung-schriftstelle',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Auch der Buchname einer Schriftstelle wird übersetzt — die Tabellen werden vor dem Bauen geholt.',
    suchen: '    await bibelbuecherLaden()',
    ersetzen: '',
  },
  {
    id: 'einladung-sprache',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Die Einladungs-Mail spricht die Sprache der Versammlung, nicht immer Deutsch.',
    suchen: '  const texte = inviteTexte(lang)',
    ersetzen: "  const texte = inviteTexte('de')",
  },
  {
    id: 'einladung-texte-vollstaendig',
    datei: 'supabase/functions/send-invite/texte.ts',
    regel: 'Jede App-Sprache hat ihren eigenen Einladungstext — kein stiller Rückfall auf Deutsch.',
    suchen: '  it: {\n',
    ersetzen: '  itX: {\n',
  },
  {
    id: 'ersatz-texte-vollstaendig',
    datei: 'supabase/functions/substitute/texte.ts',
    regel: 'Jede App-Sprache hat ihren eigenen Ersatz-Text — kein stiller Rückfall auf Deutsch.',
    suchen: "  it: { gesucht: 'Cercasi sostituto', gefunden: 'Sostituto trovato' },\n",
    ersetzen: '',
  },
  {
    id: 'import-bibellesung',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Der letzte Schätze-Punkt ist die Bibellesung — über die Position, nicht den Text.',
    suchen: "if (color === 'teal' && rec === lastOf.teal) {",
    ersetzen: "if (color === 'teal' && rec === recs[0]) {",
  },

  // ── Rechte und Bedienung ──────────────────────────────────────────────────
  // Die Rechteprüfung steht an zwei Stellen: der Wächter im Reducer weist eine
  // gesperrte Ansicht ab, die Navigationsliste entscheidet, welcher Eintrag
  // überhaupt dasteht. Der Wächter war bewacht, die Liste bis dahin nicht.
  {
    id: 'nav-gruppenaufseher-ohne-personen',
    datei: 'src/app/AppShell.tsx',
    regel: 'Der Gruppenaufseher sieht Planen und Einstellungen, aber nicht Personen.',
    // Die Liste wird inzwischen aus der des Planers abgeleitet; die Mutation
    // nimmt den Abzug weg und gibt dem Gruppenaufseher die Personen mit dazu.
    suchen: "const GROUP_OV_SCREENS: readonly Screen[] = PLANNER_SCREENS.filter((s) => s !== 'personen')",
    ersetzen: 'const GROUP_OV_SCREENS: readonly Screen[] = PLANNER_SCREENS',
  },
  {
    id: 'nav-deeplink-rechte',
    datei: 'src/app/AppShell.tsx',
    regel: 'Ein Push-Deep-Link führt nur in einen Bereich, den man betreten darf.',
    suchen: "const target = navScreens.includes(pendingNav) ? pendingNav : 'aufgaben'",
    ersetzen: 'const target = pendingNav',
  },
  {
    id: 'start-termin-gerechnet',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Der Termin auf dem Start wird gerechnet — importierte Wochen tragen im date-Feld nur die Wochenspanne.',
    suchen: 'shortDate(meetingDateText(week, weekIdx, tab, state.congregation.meetings))',
    ersetzen: 'shortDate(week[tab].date)',
  },
  {
    id: 'leeren-zwei-tipp',
    datei: 'src/planen/AutoAssignPanel.tsx',
    regel: '„Leeren" verlangt zwei Tipps — es macht eine Woche Arbeit zunichte.',
    suchen: "            if (armed) {\n              setArmed(false)\n              dispatch({ type: 'clearAssignments', scope })\n            } else {\n              setArmed(true)\n            }",
    ersetzen: "            dispatch({ type: 'clearAssignments', scope })",
  },
  {
    id: 'person-loeschen-zwei-tipp',
    datei: 'src/personen/PersonDetail.tsx',
    regel: '„Person löschen" verlangt zwei Tipps — es löst Gruppen-, Konto- und Code-Bezüge.',
    suchen: '          if (!loeschArmed) {\n            setLoeschArmed(true)\n            return\n          }\n',
    ersetzen: '',
  },
  {
    id: 'sheet-abwesende-gesperrt',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Ein Abwesender steht in der Liste, lässt sich aber nicht zuteilen.',
    suchen: "    if (cand.absent) {\n      dispatch({ type: 'showToast', text: fill(t.toastAbsentP, { name: cand.name }) })\n      return\n    }",
    ersetzen: '',
  },
  {
    id: 'sheet-redner-rueckweg',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Über einem eigenen Redner führt der Freitext zurück zum Gastredner (T29).',
    suchen: 'const guestBase = !rolleAtoms[0] || eigenerRedner ? ROLE_GUEST_SPEAKER : rolleAtoms[0]',
    ersetzen: 'const guestBase = rolleAtoms[0] || ROLE_GUEST_SPEAKER',
  },
  {
    id: 'sheet-gruppe-ohne-pid',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Eine Gruppen-Rotation ist keine Person und bekommt keine Person-Id.',
    suchen: 'pid: sel.groups ? undefined : cand.key',
    ersetzen: 'pid: cand.key',
  },
  {
    id: 'chip-status-nur-mit-flow',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Das Bestätigungs-Zeichen steht nur, wo jemand bestätigen kann — nicht am Gastredner.',
    suchen: 'showStatus={Boolean(slot.name) && !isGuestRole(slot.rolle)}',
    ersetzen: 'showStatus={Boolean(slot.name)}',
  },
  {
    id: 'dialog-fokusfalle',
    datei: 'src/components/useDialogFocus.ts',
    regel: 'Der Fokus bleibt im modalen Dialog — Tab am Ende springt an den Anfang zurück.',
    suchen: '      if (e.shiftKey && document.activeElement === firstEl) {\n        e.preventDefault()\n        lastEl.focus()\n      } else if (!e.shiftKey && document.activeElement === lastEl) {\n        e.preventDefault()\n        firstEl.focus()\n      }',
    ersetzen: '      void firstEl\n      void lastEl',
  },
  {
    id: 'wischen-eine-frist',
    datei: 'src/components/useSwipeWeek.ts',
    regel: 'Es gibt immer nur einen Zeitgeber — eine abgebrochene Bewegung räumt nicht in die nächste hinein.',
    suchen: '    const spaeter = (fn: () => void, ms: number): void => {\n      stoppen()',
    ersetzen: '    const spaeter = (fn: () => void, ms: number): void => {',
  },
  {
    id: 'push-nie-von-allein',
    datei: 'src/components/PushPrompt.tsx',
    regel: 'Der Push-Hinweis bleibt weg, wenn Push auf diesem Gerät gar nicht erreichbar ist.',
    suchen: 'if (!supported && !needsInstall && !installAvail) return null',
    ersetzen: '',
  },
  {
    id: 'install-ereignis-verbraucht',
    datei: 'src/lib/install.ts',
    regel: 'Das Installations-Ereignis lässt sich nur einmal benutzen — danach kein Angebot mehr.',
    suchen: 'deferred = null // Event ist verbraucht und lässt sich nicht erneut nutzen',
    ersetzen: '',
  },
  {
    id: 'ref-vorlage-reicht-durch',
    datei: 'supabase/functions/_shared/i18n/translate-data.ts',
    regel: 'Eine Verweis-Vorlage gibt ihre Zahl weiter — „th Lektion 11" verliert die 11 nicht.',
    suchen: "    thLek: n => 'th study ' + n,",
    ersetzen: "    thLek: () => 'th study',",
  },

  // ── Import in fremden Sprachen ────────────────────────────────────────────
  {
    id: 'import-sprache-kein-rueckfall',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Fehlt die Woche in der Versammlungssprache, ist das ein Fehler — kein stiller Rückfall auf Deutsch.',
    suchen:
      'if (!loc) return json({ error: `Diese Woche ist in der gewählten Sprache (${lang}) noch nicht verfügbar.` }, 404)',
    ersetzen: 'if (!loc) { /* deutsche Fassung behalten */ }',
  },
  {
    id: 'import-varianten-deckel',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Höchstens vier Sprachvarianten je Woche — die Abrufe gegenüber jw.org bleiben überschaubar.',
    suchen: "const wanted = [...new Set(altLangs)].filter((c) => c && c !== lang).slice(0, 4)",
    ersetzen: "const wanted = [...new Set(altLangs)].filter((c) => c && c !== lang)",
  },
  {
    id: 'import-entity-numerisch',
    datei: 'supabase/functions/import-week/text.ts',
    regel: 'Numerische HTML-Entities werden dekodiert — sonst steht „Gespr&#228;che" im Programm.',
    suchen: "    .replace(/&#(\\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))\n",
    ersetzen: '',
  },

  // ── Provider-Effekte ──────────────────────────────────────────────────────
  {
    id: 'schreibfehler-sperrfrist',
    datei: 'src/app/store.tsx',
    regel: 'Ein Bündel fehlgeschlagener Schreibvorgänge erzeugt EINEN Hinweis, nicht lauter sich überschreibende.',
    suchen: '      if (jetzt - zuletzt < 5000) return\n',
    ersetzen: '',
  },
  {
    id: 'konflikt-laedt-nach',
    datei: 'src/app/store.tsx',
    regel: 'Nach einem Schreibkonflikt wird der Stand der Datenbank nachgeladen (T39).',
    suchen: "      void loadAndHydrate(dispatch, uid, { silent: true }).finally(() => {\n        laeuft = false\n      })",
    ersetzen: '      laeuft = false',
  },

  // ── Bedienung, Fortsetzung ────────────────────────────────────────────────
  {
    id: 'planen-aufseher-ohne-bearbeiten',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Der Gruppenaufseher kommt nicht in die Bearbeiten-Ansicht der Woche (T64).',
    suchen: "const isEdit = state.tab === 'edit' && !fsOverseer",
    ersetzen: "const isEdit = state.tab === 'edit'",
  },
  {
    id: 'datumswaehler-untergrenze',
    datei: 'src/components/DatePicker.tsx',
    regel: '„Bis" lässt keinen Tag vor „Von" zu — sonst entsteht ein Zeitraum, den keine Prüfung trifft.',
    suchen: 'const disabled = (min != null && di < min) || (max != null && di > max)',
    ersetzen: 'const disabled = max != null && di > max',
  },

  // ── Sicherheitsgrenzen (T97) ──────────────────────────────────────────────
  // Die vier Regeln aus der Sicherheitsdurchsicht vom 24.8.2026. Sie haben
  // gemeinsam, dass ihr Bruch nicht auffällt: Die App verhält sich unverändert,
  // weil sie den Missbrauch gar nicht erst anbietet. Bemerkbar wird er nur,
  // wenn jemand die Function oder PostgREST direkt anspricht — deshalb stehen
  // sie hier und nicht im Vertrauen auf die Bedienoberfläche.
  {
    id: 'ersatz-versammlung-aus-dem-rumpf',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Die Versammlung kommt aus der eigenen Mitgliedszeile, nie aus dem Anfrage-Rumpf.',
    suchen: 'const caller = eigene[0]\n    if (!caller) return json({ error: \'forbidden\' }, 403)\n    const cong = caller.congregation_id',
    ersetzen: 'const caller = eigene[0]\n    if (!caller) return json({ error: \'forbidden\' }, 403)\n    const cong = payload?.congregationId ?? caller.congregation_id',
  },
  {
    id: 'rest-filterwert-kodiert',
    datei: 'supabase/functions/_shared/rest.ts',
    /*
      Stand bis T100 in `substitute/index.ts`. Seit die Hülle geteilt ist, deckt
      diese eine Regel **alle** Functions ab — vorher konnte eine von ihnen die
      Kodierung verlieren, ohne dass hier etwas anschlug. Genau so waren die
      vier Abschriften auch auseinandergelaufen.
    */
    regel: 'Jeder Wert in einem REST-Pfad wird kodiert — ein rohes # schneidet die folgenden Filter ab.',
    suchen: 'export const wert = (v: string | number): string => encodeURIComponent(String(v))',
    ersetzen: 'export const wert = (v: string | number): string => String(v)',
  },
  {
    id: 'ersatz-nur-mit-gesuch',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Einspringen setzt eine Absage zu genau dieser Aufgabe voraus — sonst verdrängt jeder Qualifizierte jeden.',
    suchen: "if (absagen.length === 0) return json({ error: 'not-sought' }, 409)",
    ersetzen: '',
  },
  {
    id: 'ersatz-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Für eine ausgefallene Zusammenkunft wird kein Ersatz gesucht (T30) — die App lädt sonst zu etwas ein, das sie selbst ablehnt.',
    suchen: 'if (istAusgefallen(week, parts.tab)) continue',
    ersetzen: '',
  },
  {
    id: 'programm-hilfsdienst-platzweise',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'Das Programmblatt zeigt Hilfsdienste platzweise bis zur eingestellten Zahl — kein Name rückt nach vorn oder über die Grenze.',
    suchen: '              const name = arr[pos]?.name\n              return name ? tu(name) : t.offenWort',
    ersetzen:
      '              const name = arr.map((s) => s.name).filter(Boolean)[pos]\n              return name ? tu(name) : t.offenWort',
  },
  {
    id: 'import-nur-jw-org',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Geholt wird nur von jw.org und nur über https — sonst ist die Function ein Bote ins interne Netz.',
    suchen: "if (!istJwOrg(url)) throw new Error(`Adresse ausserhalb von jw.org: ${url}`)",
    ersetzen: '',
  },
  {
    id: 'mitteilungs-klick-bleibt-drinnen',
    datei: 'public/sw.js',
    regel: 'Ein Mitteilungs-Klick führt nur in den Geltungsbereich der App, nie zu einer fremden Adresse.',
    suchen: 'return ziel.href.startsWith(start.href) ? ziel.href : start.href',
    ersetzen: 'return ziel.href',
  },
  {
    id: 'einladungsmail-adresse-kodiert',
    datei: 'src/personen/invite-helpers.ts',
    regel: 'Die Empfängeradresse wird kodiert — ein ? darin hängt sonst eigene Kopfzeilen an den Entwurf.',
    suchen: "const an = encodeURIComponent(person.mail).replace(/%40/g, '@')",
    ersetzen: 'const an = person.mail',
  },

  // ── Das Schema selbst (T97) ───────────────────────────────────────────────
  // `schema.sql` ist der Einstieg für Neuinstallationen. Am 23.8.2026 stand
  // dort monatelang eine Datei, die weder ausführbar war noch die
  // verschärften Richtlinien enthielt — und die Suite blieb grün, weil sie nur
  // Namen suchte. Die fünf Einträge brechen genau die Zusagen, die seitdem
  // dazugekommen sind.
  {
    id: 'schema-dollar-rumpf',
    datei: 'supabase/schema.sql',
    regel: 'Jede Funktion im Schema hat einen geschlossenen $$-Rumpf — sonst bricht die ganze Datei ab.',
    suchen: 'set search_path = public\nas $$\n  select coalesce(nullif(btrim(p.dn)',
    ersetzen: 'set search_path = public\nas $\n  select coalesce(nullif(btrim(p.dn)',
  },
  {
    id: 'schema-richtlinie-eindeutig',
    datei: 'supabase/schema.sql',
    regel: 'Jede Richtlinie steht genau einmal — beim Ausführen gewinnt sonst die letzte, ältere Fassung.',
    suchen: 'drop policy if exists confirmations_delete_planner on public.confirmations;',
    ersetzen:
      'drop policy if exists confirmations_write on public.confirmations;\n' +
      'create policy confirmations_write on public.confirmations\n' +
      '  for all\n' +
      '  using (congregation_id = public.my_congregation_id() and user_id = auth.uid())\n' +
      '  with check (congregation_id = public.my_congregation_id() and user_id = auth.uid());\n\n' +
      'drop policy if exists confirmations_delete_planner on public.confirmations;',
  },
  {
    id: 'schema-bestaetigen-eigene-aufgabe',
    datei: 'supabase/schema.sql',
    regel: 'Bestätigen darf nur, wem die Aufgabe gehört (S2/T89) — nicht nur, wem die Zeile gehört.',
    suchen: '\n    and public.task_gehoert_mir(task_key)',
    ersetzen: '',
  },
  {
    id: 'schema-abwesenheit-eigene-person',
    datei: 'supabase/schema.sql',
    regel: 'Eine Abwesenheit gilt nur der eigenen Person (S11) — die eigene Zeile allein genügt nicht.',
    suchen: '      (user_id = auth.uid() and (person_id is null or person_id = public.my_person_id()))',
    ersetzen: '      user_id = auth.uid()',
  },
  {
    id: 'schema-verhindert-nur-an-planer',
    datei: 'supabase/schema.sql',
    regel: 'Eine Verhinderungs-Meldung geht nur an Planer (S3) — nicht an jeden Empfänger der Versammlung.',
    suchen: '             and m.planner',
    ersetzen: '             and true',
  },

  // ── „Plan senden" (T99) ───────────────────────────────────────────────────
  {
    id: 'plan-bestaetigte-nicht-erneut',
    datei: 'src/data/plan-versand.ts',
    regel: 'Wer bestätigt oder abgesagt hat, weiß Bescheid — er steht nicht mehr auf der Sendeliste.',
    suchen: '    if (confirmations[key]) return',
    ersetzen: '    if (false) return',
  },
  {
    id: 'plan-tagebuch-traegt-den-namen',
    datei: 'src/data/planning.ts',
    /*
      Ohne den Namen im Schlüssel zählte ein umgeteilter Platz als gemeldet:
      Die alte Person hatte ihre Nachricht, die neue bekäme nie eine. Genau
      dieser Fall ist der Grund, warum das Tagebuch nicht nur den Platz führt.
    */
    regel: 'Das Versand-Tagebuch merkt sich Platz UND Name, nicht nur den Platz.',
    suchen: '  return `${taskKey} ${name}`',
    ersetzen: '  return taskKey',
  },
  {
    id: 'plan-entzug-nur-bestaetigte',
    datei: 'src/data/plan-versand.ts',
    regel: 'Zurückgezogen wird nur gemeldet, wem etwas genommen wurde — nicht, wer seinen Platz behält.',
    suchen: '    if (jetzt && dieselbePerson(war, jetzt)) continue // unverändert',
    ersetzen: '    if (false) continue',
  },
  {
    id: 'plan-entzug-person-per-id',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Wer dieselbe Person ist, entscheidet die Person-Id — am Namen allein meldete eine berichtigte Schreibweise einen Entzug, und zwischen zwei Gleichnamigen umzuteilen meldete gar keinen.',
    suchen: '  return a.pid && b.pid ? a.pid === b.pid : a.name === b.name',
    ersetzen: '  return a.name === b.name',
  },
  {
    id: 'plan-entzug-nur-vorhandene-plaetze',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Ein Platz, den es im neuen Stand gar nicht mehr gibt (ausgefallene Zusammenkunft, abgeschaltete Zusätzliche Klasse), ist kein Entzug — sonst meldete eine Kongress-Woche der halben Versammlung einen Verlust.',
    suchen: '    if (!platzNochDa(nachher, key, fsLeer)) continue',
    ersetzen: '    if (false) continue',
  },
  {
    id: 'plan-entzug-ausfall-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel: 'Fällt die Zusammenkunft aus, ruhen ihre Zuteilungen — sie sind nicht verwaist (T30).',
    suchen: '  if (istAusgefallen(nachher, wo.tab)) return false',
    ersetzen: '  if (false) return false',
  },
  {
    id: 'plan-entzug-klasse-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Wird die Zusätzliche Klasse abgeschaltet, bleiben ihre Namen absichtlich stehen — der Raum ist abwesend, nicht geleert.',
    suchen: "  if (abschnitt === 'aux' || abschnitt === 'ratgeber') return hatAuxKlasse(nachher[wo.tab])",
    ersetzen: '  if (false) return false',
  },
  {
    id: 'plan-entzug-braucht-zusage',
    datei: 'src/data/plan-versand.ts',
    /*
      Seit T101 wird nur Bestätigtes überhaupt aufgenommen, statt alles
      aufzunehmen und später zu verwerfen. Damit steht die Regel an zwei
      Stellen — je eine für die beiden Datenquellen —, und beide brauchen
      ihren eigenen Eintrag: Fiele nur eine weg, meldete die andere weiter,
      und ein Eintrag über beide zusammen bliebe grün.
    */
    regel:
      'Solange niemand zugesagt hat, ist der Plan ein Entwurf — Umsortieren meldet nichts (Zusammenkünfte).',
    suchen: "    if (conf[key] !== 'bestätigt') return",
    ersetzen: '    if (false) return',
  },
  {
    id: 'plan-entzug-braucht-zusage-treffpunkt',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Dieselbe Regel für die zweite Datenquelle: ein unbestätigter Treffpunkt-Leiter meldet beim Wechseln nichts.',
    suchen: "    if (conf[key] !== 'bestätigt') continue",
    ersetzen: '    if (false) continue',
  },
  {
    id: 'plan-nur-planer',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Nachrichten an die ganze Versammlung darf nur ein Planer auslösen.',
    suchen: "    if (!mich?.planner) return json({ error: 'forbidden' }, 403)",
    ersetzen: "    if (false) return json({ error: 'forbidden' }, 403)",
  },
  {
    id: 'plan-nicht-zweimal',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Gesendet wird nur, was das Tagebuch noch nicht kennt — sonst kommt nach jeder Nachbesserung alles erneut.',
    suchen:
      '    const neu = offen.filter((p) => !schonGemeldet.has(tagebuchSchluessel(p.key, p.name)))',
    ersetzen: '    const neu = offen',
  },
  {
    id: 'plan-je-person-eine',
    datei: 'supabase/functions/send-plan/index.ts',
    /*
      Ohne die Bündelung bekäme jemand mit drei Plätzen drei Nachrichten. Die
      Mutation wirft die bisherigen Aufgaben weg, statt die neue anzuhängen —
      dann trägt die Nachricht nur noch eine, und der Fall „wer zwei Aufgaben
      hat, bekommt EINE Nachricht mit beiden" fällt auf.
    */
    regel: 'Je eingeteilter Person geht EINE Nachricht hinaus, nicht je Aufgabe.',
    suchen: '      jePerson.set(uid, [...(jePerson.get(uid) ?? []), p])',
    ersetzen: '      jePerson.set(uid, [p])',
  },

  // ── Treffpunkt-Wochenkennung (T100) ───────────────────────────────────────
  {
    id: 'fs-woche-aus-der-woche',
    datei: 'src/data/fs.ts',
    /*
      Die Mutation stellt die alte Rechnung wieder her. Ohne Lücke im Bestand
      ist sie identisch — jeder Test mit lückenlosen Wochen bleibt grün. Nur
      wer eine Lücke prüft, merkt etwas.
    */
    regel:
      'Der Montag einer Treffpunkt-Woche kommt aus der Woche selbst, nicht aus der Ordnungszahl — sonst verschiebt eine fehlende Woche Schlüssel, Datum und Monatsregel um sieben Tage.',
    suchen: '  return week?.start || fsWochenStart(fsBase, wi)',
    ersetzen: '  return fsWochenStart(fsBase, wi)',
  },
  {
    id: 'fs-woche-im-kandidatenblatt',
    datei: 'src/planen/kandidaten.ts',
    regel:
      'Das Kandidatenblatt prüft die Abwesenheit am Tag DIESER Woche — sonst widerspricht es dem Konfliktbanner daneben um sieben Tage.',
    /*
      Die Mutation nimmt dem Blatt die Woche aus der Hand, sodass nur noch der
      Rückfall `fsBase + wi·7` greift — dieselbe alte Rechnung, ohne dafür
      einen Import einzuschleppen, den der Quelltext sonst nicht braucht.
    */
    suchen: 'fsTag(fsKennung(state.weeks[sel.wi], state.fsBase, sel.wi), inst.wd)',
    ersetzen: 'fsTag(fsKennung(undefined, state.fsBase, sel.wi), inst.wd)',
  },
  {
    id: 'fs-woche-in-der-zeitleiste',
    datei: 'src/personen/person-timeline.ts',
    regel:
      'Auch die Zeitleiste nimmt den Montag aus der Woche — sonst nennt sie bei einer Lücke im Bestand zwei Termine derselben Woche eine Woche auseinander.',
    suchen: "        fsTag(fsKennung(state.weeks[wi], state.fsBase, wi), inst.wd) ??\n",
    ersetzen: '',
  },
  {
    id: 'fs-woche-im-versand',
    datei: 'src/data/plan-versand.ts',
    /*
      Seit T101 rechnet der Versand nicht mehr selbst — er ruft `fsKennung`.
      Die Mutation nimmt ihm die Woche aus der Hand, sodass nur noch der
      Rückfall `fsBase + wi·7` greift: dieselbe alte Rechnung wie vorher, nur
      eine Ebene höher erzwungen.
    */
    regel:
      'Auch „Plan senden" nimmt den Montag aus der Woche — die Edge Function nimmt ihn aus der Datenbankzeile, und beide müssen dieselbe Woche meinen.',
    suchen: '    nimm(fsTaskKey(fsKennung(week, fsBase, wi), inst.id), inst.leader)',
    ersetzen: '    nimm(fsTaskKey(fsKennung(undefined, fsBase, wi), inst.id), inst.leader)',
  },
  {
    id: 'fs-kennung-migration-kette',
    datei: 'src/lib/data.ts',
    /*
      Bei einer Lücke rutscht die ganze Kette: Der alte Schlüssel der einen
      Woche ist der neue der nächsten. Ohne die Ausnahme blockierte jedes Glied
      seinen Vorgänger, und die älteste Bestätigung bliebe liegen.
    */
    regel:
      'Beim Umschreiben der Treffpunkt-Schlüssel blockiert ein besetztes Ziel nur dann, wenn es nicht selbst weiterzieht.',
    suchen: '    ([, ziel]) => confirmations[ziel] === undefined || zieht.has(ziel),',
    ersetzen: '    ([, ziel]) => confirmations[ziel] === undefined,',
  },
]

// ── Lauf ────────────────────────────────────────────────────────────────────

const argumente = process.argv.slice(2)
const nurListe = argumente.includes('--liste')
const filter = argumente.filter((a) => !a.startsWith('--'))
const auswahl = filter.length
  ? KATALOG.filter((m) => filter.some((f) => m.id.includes(f) || m.datei.includes(f)))
  : KATALOG

if (auswahl.length === 0) {
  console.error(`Keine Mutation passt auf ${filter.join(' ')}.`)
  process.exit(2)
}

/** Doppelte Kennungen fielen sonst als „schon gemessen" durch. */
const kennungen = new Set()
for (const m of KATALOG) {
  if (kennungen.has(m.id)) {
    console.error(`Doppelte Kennung im Katalog: ${m.id}`)
    process.exit(2)
  }
  kennungen.add(m.id)
}

/**
 * Vorprüfung über den GANZEN Katalog, nicht nur die Auswahl: Ein Eintrag, der
 * seine Stelle verloren hat, soll auch dann auffallen, wenn gerade ein anderer
 * gemessen wird.
 */
for (const m of KATALOG) {
  const quelle = readFileSync(join(wurzel, m.datei), 'utf8')
  const treffer = quelle.split(m.suchen).length - 1
  if (treffer !== 1) {
    console.error(
      `\n${m.id}: „suchen" steht ${treffer}× in ${m.datei} — erwartet genau 1×.\n` +
        `Die Stelle hat sich verschoben. Eintrag nachziehen (oder streichen, wenn die\n` +
        `Regel weggefallen ist) — nicht stillschweigend überspringen.\n`,
    )
    process.exit(2)
  }
}

if (nurListe) {
  for (const m of auswahl) console.log(`${m.id.padEnd(32)} ${m.regel}`)
  console.log(`\n${auswahl.length} Einträge.`)
  process.exit(0)
}

const vitest = join(wurzel, 'node_modules', 'vitest', 'vitest.mjs')

/** Einen vollen Testlauf machen. Rückgabe: `{ rot, ausgabe }`. */
function testlauf() {
  const lauf = spawnSync(process.execPath, [vitest, 'run', '--reporter=dot', '--bail=1'], {
    cwd: wurzel,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (lauf.error) {
    console.error(`vitest konnte nicht gestartet werden: ${lauf.error.message}`)
    process.exit(2)
  }
  return { rot: lauf.status !== 0, ausgabe: `${lauf.stdout ?? ''}${lauf.stderr ?? ''}` }
}

/** Aus der Ausgabe die erste rote Testdatei ziehen — als Beleg, WER bewacht. */
function ersterWaechter(ausgabe) {
  const treffer = /(?:FAIL|❯|×)\s+([\w./-]+\.test\.tsx?)/.exec(ausgabe)
  return treffer?.[1] ?? 'unbekannt'
}

const ergebnisse = []
let laufendeDatei = null
let laufenderInhalt = null

/** Die Datei zurückschreiben — auch bei Abbruch (Ctrl+C) oder Absturz. */
function zuruecksetzen() {
  if (laufendeDatei && laufenderInhalt !== null) {
    writeFileSync(laufendeDatei, laufenderInhalt)
    laufendeDatei = null
    laufenderInhalt = null
  }
}
process.on('SIGINT', () => {
  zuruecksetzen()
  console.error('\nAbgebrochen — Quelltext wiederhergestellt.')
  process.exit(130)
})
process.on('uncaughtException', (fehler) => {
  zuruecksetzen()
  throw fehler
})

console.log(`Mutationsprobe: ${auswahl.length} Regeln, je ein voller Testlauf.\n`)

for (const [i, m] of auswahl.entries()) {
  const pfad = join(wurzel, m.datei)
  const original = readFileSync(pfad, 'utf8')
  laufendeDatei = pfad
  laufenderInhalt = original

  process.stdout.write(`[${i + 1}/${auswahl.length}] ${m.id} … `)
  writeFileSync(pfad, original.replace(m.suchen, m.ersetzen))
  const start = Date.now()
  const { rot, ausgabe } = testlauf()
  zuruecksetzen()

  const sekunden = Math.round((Date.now() - start) / 1000)
  const waechter = rot ? ersterWaechter(ausgabe) : null
  ergebnisse.push({ ...m, rot, waechter })
  console.log(rot ? `bewacht (${waechter}, ${sekunden}s)` : `UNBEWACHT (${sekunden}s)`)
}

const offen = ergebnisse.filter((e) => !e.rot)
console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} Regeln bewacht.`)

if (offen.length > 0) {
  console.log('\nUnbewacht — diese Regeln kann man entfernen, ohne dass ein Test es merkt:\n')
  for (const e of offen) console.log(`  ${e.id.padEnd(32)} ${e.datei}\n${' '.repeat(36)}${e.regel}`)
  process.exit(1)
}
