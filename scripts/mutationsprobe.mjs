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
 * **Gewertet wird nur ein Lauf, der getestet hat.** Findet Node vitest nicht,
 * stirbt der Lauf oder endet er ohne ein einziges Testergebnis, bricht die
 * Probe mit Rückgabewert 2 ab, statt der Regel ein Häkchen zu geben
 * (`testlaufBefund`). Bis zum 26.9.2026 zählte jeder Rückgabewert ≠ 0 als
 * „bewacht" — in einem Worktree bekam so jede Regel eines.
 *
 * **Und nur ein Rot, das ohne die Mutation nicht da ist.** Gemeldet wird die
 * Datei, die zuerst rot wird; ist eine schon ohne Mutation rot, ist sie es bei
 * jeder. Deshalb läuft jeder gemeldete Wächter einmal je Durchgang ohne
 * Mutation (`waechterBefund`); ist er dann rot, bricht die Probe mit 2 ab.
 * Bis zum 3.10.2026 hieß ein roter Ausgangsstand „alle Regeln bewacht".
 *
 *     node scripts/mutationsprobe.mjs            # alle
 *     node scripts/mutationsprobe.mjs zuteilung  # nur passende Kennungen
 *     node scripts/mutationsprobe.mjs --liste     # nur auflisten, nichts laufen lassen
 *
 * Läuft **nicht** in der CI: ein Durchgang kostet je Eintrag bis zu einen
 * vollen Testlauf. Sie ist ein Messgerät, das man ansetzt — wie `npm run
 * contrast` —, keine Prüfung, die jeden Push anhält wie `npm test`.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { auszug, werkzeugPfad } from './gemeinsam.mjs'

const hier = dirname(fileURLToPath(import.meta.url))
const wurzel = join(hier, '..')

/**
 * Quelltext mit **einheitlichen Zeilenenden** lesen.
 *
 * `.gitattributes` legt LF fest, aber `core.autocrlf` checkt unter Windows CRLF
 * aus — und dort wird dieses Projekt entwickelt. Die Muster im Katalog stehen
 * in JavaScript-Zeichenketten und tragen deshalb `\n`. Von den 126 Einträgen
 * sind 115 mehrzeilig: Sie konnten auf einem Windows-Arbeitsbaum **nie**
 * treffen, und die Probe brach beim ersten von ihnen mit „Stelle hat sich
 * verschoben" ab. Das Messgerät meldete Rost, wo keiner war.
 *
 * Gesucht und mutiert wird deshalb auf der LF-Fassung. Zurückgeschrieben wird
 * am Ende der **rohe** Inhalt (siehe `zuruecksetzen`) — die Datei kommt Byte für
 * Byte so zurück, wie sie war.
 */
function lies(pfad) {
  return readFileSync(pfad, 'utf8').replace(/\r\n/g, '\n')
}

/**
 * Der Katalog.
 *
 * `regel` sagt, was gelten soll — in denselben Worten, in denen es im Quelltext
 * oder in `docs/analyse/todo.md` begründet ist. `suchen` muss **genau einmal**
 * in der Datei stehen; wo eine Zeile mehrfach vorkommt, steht die Nachbarzeile
 * mit dabei.
 */
export const KATALOG = [
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
      Die Stelle ist seit 5b9e724 („Vierzehn Funktionen zählten die vier
      Platzsorten je für sich auf", 19.9.2026) ein Aufruf von `allePlaetze` —
      davor `programmPlaetze` (244e1a0), und bis 21.9. suchte dieser Eintrag
      noch die alte Zeile: Die ganze Probe brach deshalb ab, ohne eine Regel zu
      prüfen. Die Mutation nimmt dem Durchlauf die Plätze der Zusätzlichen
      Klasse wieder weg und lässt nur den Hauptsaal übrig — genau die Fassung,
      mit der der Fehler entstanden ist.
    */
    suchen: 'for (const platz of allePlaetze(meeting)) merken(platz.slot)',
    ersetzen: "for (const platz of allePlaetze(meeting)) if (platz.art !== 'programm' || !platz.aux) merken(platz.slot)",
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
    // Seit dem 18.10.2026 steht die Regel in `festerWtLeiter` — die Automatik
    // und das Holen einer Woche fragen beide dort.
    suchen: "  return mit('wtLeiter') ?? mit('wtVertreter')\n",
    ersetzen: '  return undefined\n',
  },
  {
    id: 'zuteilung-wt-leiter-vor-vertreter',
    datei: 'src/data/planning.ts',
    regel: 'Ist der feste Leiter da, leitet er — der Vertreter springt nur ein, wenn er fehlt.',
    suchen: "  return mit('wtLeiter') ?? mit('wtVertreter')\n",
    ersetzen: "  return mit('wtVertreter') ?? mit('wtLeiter')\n",
  },
  {
    id: 'zuteilen-vorschlag-schuelerteil',
    datei: 'src/data/planning.ts',
    regel: 'Der Vorschlag im Zuteilen-Blatt folgt denselben Schülerteil-Regeln wie die Automatik (Partner passt zum Führer).',
    suchen: "return w.rangfolge('part', slot.bereichsKey, schuelerteilOpts(item, slot, sel.aux === true, persons))",
    ersetzen: "return w.rangfolge('part', slot.bereichsKey)",
  },
  {
    id: 'zuteilen-vorschlag-leiter',
    datei: 'src/data/planning.ts',
    regel: 'Am Leiter-Platz des Wachtturm-Studiums schlägt das Blatt den festen Leiter vor — wie die Automatik.',
    suchen: '  if (istWtLeiter(section, slot)) return w.rangfolgeLeiter()\n',
    ersetzen: '',
  },
  {
    id: 'zuteilen-zuletzt-nur-davor',
    datei: 'src/data/planning.ts',
    regel: '„zuletzt vor … Wochen" zählt nur, was vor der geplanten Woche liegt.',
    suchen: '    if (!(Date.parse(week.start) < zielMs)) continue\n',
    ersetzen: '',
  },
  {
    id: 'zuteilen-reihenfolge',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Oben steht der Vorschlag, darunter folgt die Liste der Rangfolge der Automatik.',
    suchen: '.sort((a, b) => stufe(a) - stufe(b) || (rang.get(a.key) ?? 0) - (rang.get(b.key) ?? 0))',
    ersetzen: '.sort((a, b) => Number(a.absent) - Number(b.absent))',
  },
  {
    id: 'zuteilen-abwesend-zeitraum',
    datei: 'src/planen/useAktuellerPlatz.ts',
    regel: 'Ist die eingeteilte Person abwesend, nennt das Blatt den Zeitraum, nicht nur „abwesend".',
    suchen: "      konflikt?.kind === 'absent'\n",
    ersetzen: '      false\n',
  },
  {
    id: 'zuteilen-spalte-ohne-blatt',
    datei: 'src/app/AppShell.tsx',
    regel: 'Am Desktop teilt die Spalte neben dem Plan zu — kein Blatt legt sich darüber.',
    suchen: 'const zuteilenBlatt = state.slotSel && !zuteilenInSpalte(state, desktop) ? state.slotSel : null',
    ersetzen: 'const zuteilenBlatt = state.slotSel',
  },
  {
    id: 'zuteilen-spalte-nur-sichtbare-woche',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Spalte zeigt nur einen Platz der Woche, die der Plan gerade zeigt.',
    suchen: '  if (!sel || sel.wi !== state.week) return false\n',
    ersetzen: '  if (!sel) return false\n',
  },
  {
    id: 'zuteilen-spalte-fokus-suche',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'In der Spalte geht der Fokus nach dem Klick auf einen Platz gleich in die Suche.',
    suchen: '      <ZuteilenInhalt sel={sel} onClose={onClose} fokusAufSuche />',
    ersetzen: '      <ZuteilenInhalt sel={sel} onClose={onClose} />',
  },
  {
    id: 'zuteilen-blatt-ohne-fokus',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Im Blatt springt der Fokus nicht von selbst in die Suche — am Handy käme die Tastatur.',
    suchen: '  fokusAufSuche = false,',
    ersetzen: '  fokusAufSuche = true,',
  },
  {
    id: 'zuteilen-platz-markiert',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Am Desktop hebt der Plan den Platz hervor, den die Spalte gerade zuteilt.',
    suchen: "                        gewaehlt={istGewaehlt(state.slotSel, { kind: 'part', wi: state.week, tab, si, ii, ni, aux })}\n",
    ersetzen: '',
  },
  {
    id: 'suche-ohne-zeichen',
    datei: 'src/components/suche.ts',
    regel: 'Die Suche nach Namen findet „kruger" auch ohne Umlaut und „krueger" in Umschrift.',
    suchen: 'return text.includes(gesucht) || ohneZeichen(text).includes(ohne) || umschrift(text).includes(ohne)',
    ersetzen: 'return text.includes(gesucht)',
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
    suchen: 'const cleaningGroup = reihe.length ? (reihe[woche % reihe.length] ?? null) : null',
    ersetzen: 'const cleaningGroup = reihe.length ? (reihe[0] ?? null) : null',
  },
  // ── Gruppen aus der Reinigung nehmen (18.10.2026) ─────────────────────────
  {
    id: 'reinigung-ohne-herausgenommene',
    datei: 'src/data/helpers.ts',
    regel: 'Eine aus der Reinigung genommene Gruppe reinigt nicht und steht beim Zuteilen nicht zur Wahl.',
    suchen: '  return groups.filter((g) => !g.ohneReinigung)\n',
    ersetzen: '  return [...groups]\n',
  },
  {
    id: 'reinigung-rotation-ohne-herausgenommene',
    datei: 'src/data/planning.ts',
    regel: '„Automatisch" geht nur unter den Gruppen reihum, die reinigen.',
    suchen: '  const reihe = reinigungsGruppen(groups)\n',
    ersetzen: '  const reihe = groups\n',
  },
  {
    id: 'reinigung-wahl-ohne-herausgenommene',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Beim Zuteilen der Reinigung steht keine herausgenommene Gruppe zur Wahl.',
    suchen: '  return reinigungsGruppen(state.groups).map((group) => ({\n',
    ersetzen: '  return state.groups.map((group) => ({\n',
  },
  {
    id: 'reinigung-keine-erfundene-gruppe',
    datei: 'src/data/planning.ts',
    regel: 'Sind alle Gruppen aus der Reinigung genommen, bleibt sie offen — „Gruppe 1–3" gibt es nur ohne angelegte Gruppen.',
    suchen: '(groups.length === 0 ? `Gruppe ${1 + (woche % 3)}` : null)',
    ersetzen: '`Gruppe ${1 + (woche % 3)}`',
  },
  {
    id: 'reinigung-offen-gemeldet',
    datei: 'src/data/planning.ts',
    regel: 'Reinigt keine Gruppe, meldet „Automatisch" ihren Platz als offen.',
    suchen: '        if (!w.reinigung) {\n          unfilled++\n',
    ersetzen: '        if (!w.reinigung) {\n',
  },
  {
    id: 'reinigung-blatt-zeigt-gruppen',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Das Blatt der Reinigung listet alle Gruppen, je mit Schalter.',
    suchen: '{service.groups ? <GruppenSchalter /> : <PersonenSchalter svcKey={svcKey} />}',
    ersetzen: '{service.groups ? null : <PersonenSchalter svcKey={svcKey} />}',
  },
  {
    id: 'reinigung-schalter-hin-und-zurueck',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Ein Schalter im Blatt der Reinigung nimmt seine Gruppe heraus — und wieder hinein.',
    suchen: "patch: { ohneReinigung: an } })",
    ersetzen: "patch: { ohneReinigung: true } })",
  },
  {
    id: 'reinigung-zahl-der-gruppen',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Unter der Reinigung und im Kopf ihres Blatts steht, wie viele Gruppen reinigen.',
    suchen: '    ? reinigungsGruppen(daten.groups).length\n',
    ersetzen: '    ? daten.groups.length\n',
  },
  {
    id: 'reinigung-gespeichert',
    datei: 'src/lib/data.ts',
    regel: 'Ob eine Gruppe reinigt, wird mit der Gruppe gespeichert.',
    suchen: '    ohne_reinigung: Boolean(g.ohneReinigung),\n',
    ersetzen: '',
  },
  {
    id: 'reinigung-geladen',
    datei: 'src/lib/data.ts',
    regel: 'Eine aus der Reinigung genommene Gruppe kommt beim Laden so an.',
    suchen: '    ohneReinigung: r.ohne_reinigung || undefined,\n',
    ersetzen: '',
  },
  {
    id: 'schema-gruppe-ohne-reinigung',
    datei: 'supabase/schema.sql',
    regel: 'Die Spalte, in der eine Gruppe aus der Reinigung genommen ist, steht im Schema — auch für eine schon angelegte Tabelle.',
    suchen: 'alter table public.groups\n  add column if not exists ohne_reinigung boolean not null default false;\n',
    ersetzen: '',
  },
  {
    id: 'reinigung-wp-verteilen-ohne-herausgenommene',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'In den Weiteren Plänen geht die Reihe nur unter den Gruppen um, die reinigen.',
    suchen: '  const reihe = reinigungsGruppen([...groups.slice(ab), ...groups.slice(0, ab)])\n',
    ersetzen: '  const reihe = [...groups.slice(ab), ...groups.slice(0, ab)]\n',
  },
  {
    id: 'reinigung-wp-verteilen-ab-naechster',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Beginnt die Reihe bei einer herausgenommenen Gruppe, übernimmt die nächste nach ihr — nicht wieder die erste.',
    suchen: '  const reihe = reinigungsGruppen([...groups.slice(ab), ...groups.slice(0, ab)])\n',
    ersetzen:
      '  const reihe = reinigungsGruppen(groups.some((g) => g.id === abGruppe && g.ohneReinigung) ? groups : [...groups.slice(ab), ...groups.slice(0, ab)])\n',
  },
  {
    id: 'reinigung-wp-beginnen-mit-ohne-herausgenommene',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: '„Beginnen mit" bietet nur Gruppen an, die reinigen.',
    suchen: '  const optionen = reihe.map((g) => ({ wert: g.id, text: tu(g.name) }))\n',
    ersetzen: '  const optionen = state.groups.map((g) => ({ wert: g.id, text: tu(g.name) }))\n',
  },
  {
    id: 'reinigung-wp-wahl-ohne-herausgenommene',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Die Wahl einer Woche der Vorschau bietet keine herausgenommene Gruppe an.',
    suchen: '  const zurWahl = state.groups.filter((g) => g.id === grp || reihe.includes(g))\n',
    ersetzen: '  const zurWahl = state.groups\n',
  },
  // Review 18.10.2026: der Malus gilt der eingetragenen Gruppe, der Hinweis führt ins Blatt.
  {
    id: 'reinigung-malus-eingetragene-gruppe',
    datei: 'src/data/planning.ts',
    regel: 'Steht eine Gruppe im Platz der Reinigung, gilt der Malus ihrem Aufseher — auch einer herausgenommenen.',
    suchen: '      const name = meeting.helpers[svc.key]?.[pos]?.name || rotation?.name\n',
    ersetzen: '      const name = rotation?.name\n',
  },
  {
    id: 'reinigung-malus-leerer-platz-rotation',
    datei: 'src/data/planning.ts',
    regel: 'Ist der Platz der Reinigung noch leer, gilt der Malus der Gruppe, die ihn gleich bekommt.',
    suchen: '      const name = meeting.helpers[svc.key]?.[pos]?.name || rotation?.name\n',
    ersetzen: '      const name = meeting.helpers[svc.key]?.[pos]?.name\n',
  },
  {
    id: 'reinigung-hinweis-gruppen-null',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Reinigt keine Gruppe mehr, nennt das Zuteilen-Blatt „Gruppen: 0" — nicht „Predigtdienstgruppen", als fehlten welche.',
    suchen: '      <div className="sheet-empty-label">{dienst ? fill(t.gruppenN, { n: 0 }) : t.gruppenCard}</div>\n',
    ersetzen: '      <div className="sheet-empty-label">{t.gruppenCard}</div>\n',
  },
  {
    id: 'reinigung-hinweis-oeffnet-blatt',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Reinigt keine Gruppe mehr, öffnet der Knopf im Zuteilen-Blatt gleich das Blatt der Reinigung.',
    suchen: "    dispatch(dienst ? { type: 'openServiceSheet', key: dienst.key } : { type: 'navigate', screen: 'einstellungen' })\n",
    ersetzen: "    dispatch({ type: 'navigate', screen: 'einstellungen' })\n",
  },
  {
    id: 'reinigung-hinweis-knopf-nur-admin',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Den Knopf zu Einstellungen und Gruppen bekommt nur der Admin — einen Planer führte er ins Programm.',
    suchen: '      {rechteVon(state).admin && (\n',
    ersetzen: '      {true && (\n',
  },
  {
    id: 'reinigung-wp-wahl-behaelt-eingetragene',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ist eine herausgenommene Gruppe schon eingetragen, steht sie in der Wahl — sonst zeigte sie „offen".',
    suchen: '  const zurWahl = state.groups.filter((g) => g.id === grp || reihe.includes(g))\n',
    ersetzen: '  const zurWahl = reihe\n',
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
    suchen: "const leadPlatz = slotsOf(item, aux).find((n) => n.bereichsKey === 'schulung')",
    ersetzen: "const leadPlatz = item.names.find((n) => n.bereichsKey === 'schulung')",
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
    // Die Kopplung steht inzwischen in `anVorsitzKoppeln` (bis zum 16.10.2026
    // `gebetAnVorsitz`); die Mutation lässt die Funktion sofort zurückkehren —
    // das Gebet bleibt offen wie vorher.
    suchen: '  if (!vorsitzSlot?.name) return\n',
    ersetzen: '  return\n',
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
    // Die Auslastungs-Rechnung ist aus `helpers.ts` in eine eigene Datei
    // gezogen; die Regeln selbst stehen unverändert da.
    datei: 'src/data/auslastung.ts',
    regel: 'Hilfsdienst-Last zählt nur bis zur eingestellten Platzzahl (T21).',
    suchen: 'const bis = grenze ? (grenze.get(key) ?? 0) : assigned.length',
    ersetzen: 'const bis = assigned.length',
  },
  {
    id: 'last-ausfall',
    datei: 'src/data/auslastung.ts',
    regel: 'Eine ausgefallene Zusammenkunft erzeugt keine Auslastung (T30).',
    // Die Zeile steht in `partWorkload` **und** in `helperWorkload`. Eindeutig
    // wird sie durch das, was NICHT dahinter steht: in `helperWorkload` trägt
    // sie einen Zeilenkommentar, hier folgt gleich die nächste Zeile.
    suchen: '      if (istAusgefallen(week, tab)) continue\n      const meeting = week[tab]',
    ersetzen: '      const meeting = week[tab]',
  },
  {
    id: 'last-fenster-nach-datum',
    datei: 'src/data/auslastung.ts',
    regel: 'Das Auslastungs-Fenster misst in Wochen (Datum), nicht in Listenplätzen (T36).',
    suchen: 'return weeks.find((w) => w?.start === ziel)',
    ersetzen: 'return weeks[wi + versatz]',
  },
  {
    id: 'gast-ohne-namens-rueckfall',
    datei: 'src/data/helpers.ts',
    regel: 'Ein externer Redner zählt nie auf eine gleichnamige eigene Person (T29).',
    // Seit dem 25.9.2026 steht die Regel in `gehoertZuKennung`; `gehoertZu`
    // reicht nur noch Id und Anzeigenamen der Person durch.
    suchen: 'return !isGuestRole(zuteilung.rolle) && zuteilung.name === personName',
    ersetzen: 'return zuteilung.name === personName',
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
    regel: 'Eine Abweichung schlägt den Rhythmus der Versammlung (T30).',
    suchen: 'return versatzAbMontag(abweichung(week, tab)?.wd ?? zeiten[tab].wd)',
    ersetzen: 'return versatzAbMontag(zeiten[tab].wd)',
  },
  {
    id: 'termin-sonntag-ist-null',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Der Sonntag ist die 0 — eine auf ihn verlegte Zusammenkunft gilt trotzdem.',
    suchen: 'return versatzAbMontag(abweichung(week, tab)?.wd ?? zeiten[tab].wd)',
    ersetzen: 'return versatzAbMontag(abweichung(week, tab)?.wd || zeiten[tab].wd)',
  },
  {
    id: 'uhrzeit-rangfolge',
    datei: 'src/data/meeting-dates.ts',
    regel: 'Dieselbe Rangfolge gilt für die Uhrzeit wie für den Tag.',
    suchen: 'return abweichung(week, tab)?.time ?? zeiten[tab].time',
    ersetzen: 'return zeiten[tab].time',
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
    suchen: "x.names.some((n) => n.bereichsKey === 'leser') || istCoPunkt(x)",
    ersetzen: "x.title.startsWith('Versammlungsbibelstudium') || istCoPunkt(x)",
  },
  {
    id: 'lac-einfuegestelle-dienstvortrag',
    datei: 'src/data/meeting-edit.ts',
    regel: 'In der Kreisaufseher-Woche reiht sich ein eigener Punkt vor dem Dienstvortrag ein — an der Stelle des Bibelstudiums.',
    suchen: "    (x) => !isSong(x) && (x.names.some((n) => n.bereichsKey === 'leser') || istCoPunkt(x)),\n",
    ersetzen: "    (x) => !isSong(x) && x.names.some((n) => n.bereichsKey === 'leser'),\n",
  },
  {
    id: 'co-zurueck-leiter-bleibt',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Wer in der Kreisaufseher-Woche den Leiter des Wachtturm-Studiums einteilt, behält ihn beim Zurücknehmen.',
    suchen: '    (n) => jetzt.names.find((j) => j.rolle === n.rolle && j.bereichsKey === n.bereichsKey) ?? n,\n',
    ersetzen: '    (n) => n,\n',
  },
  {
    id: 'vortragsplan-mahl-am-anlass',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Ein Gedächtnismahl am Wochenende überspringt der Vortragsplan als „Gedächtnismahl", nicht als „Ausfall" — am Anlass erkannt.',
    suchen: "  if (week.anlass?.art === 'mem' && istAusgefallen(week, 'we')) return 'gedaechtnismahl'\n",
    ersetzen: '',
  },
  {
    id: 'aux-gleich-feldweise',
    datei: 'src/data/aux-class.ts',
    regel: 'Gleiche Plätze in anderer Feldreihenfolge (jsonb) gelten als gleich — die geladene Woche bleibt dieselbe.',
    suchen: '  return a.every((s, i) => gleicherPlatz(s, b[i]))\n',
    ersetzen: '  return a.every((s, i) => JSON.stringify(s) === JSON.stringify(b[i]))\n',
  },
  {
    id: 'id-aufloeser-eindeutig',
    datei: 'src/data/helpers.ts',
    regel: 'Ein doppelter Name löst niemanden auf, statt den Letzten zu raten.',
    suchen: '  const nachName = eindeutigeNamen(persons)\n  return (z) => {\n',
    ersetzen: '  const nachName = new Map(persons.map((p) => [displayName(p), p.id]))\n  return (z) => {\n',
  },
  {
    id: 'css-token-gesetzt',
    datei: 'src/planen/planen.css',
    regel: 'Das CSS liest nur Tokens, die es gibt — ein unbekanntes fällt still auf den Ausgangswert zurück.',
    suchen: '  letter-spacing: 0.08em;\n  color: var(--text3);\n}\n',
    ersetzen: '  letter-spacing: 0.08em;\n  color: var(--text-weak);\n}\n',
  },
  {
    id: 'zetteldruck-nur-eingehaengt',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: 'Ist die Stelle beim Warten verschwunden, wird nicht gedruckt — sonst bliebe das Druck-Kennzeichen stehen.',
    suchen: '      if (!eingehaengt.current) return\n',
    ersetzen: '',
  },
  {
    id: 'naechste-zahl-je-zahl',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Der Name eines neuen Eintrags zählt nach der höchsten Zahl — die Ziffern eines Namens werden nicht aneinandergehängt.',
    suchen: '  return liste.reduce((m, x) => Math.max(m, ...(x.name.match(/\\d+/g) ?? []).map(Number)), 0) + 1\n',
    ersetzen: "  return liste.reduce((m, x) => Math.max(m, Number.parseInt(x.name.replace(/\\D/g, ''), 10) || 0), 0) + 1\n",
  },
  {
    id: 'zeitleiste-kalendertag',
    datei: 'src/personen/PersonTimeline.tsx',
    regel: 'Die Zeitleiste einer Person rückt um Mitternacht weiter — vergangen misst der Kalendertag.',
    suchen: '  const entries = useMemo(() => personTimeline(person, state, fromIso(tag)), [person, state, tag])\n',
    ersetzen: '  const entries = useMemo(() => personTimeline(person, state), [person, state])\n',
  },
  {
    id: 'bogen-zwei-abstaende',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Ein Blatt zieht je einen Abstand unter dem Kopf und über dem Fuß ab — sonst ist ein volles Blatt zu hoch.',
    suchen: 'BLATT_HOEHE - rand - kopf - fuss - 2 * abstand',
    ersetzen: 'BLATT_HOEHE - rand - kopf - fuss - abstand',
  },
  {
    id: 'datumswahl-rtl-reihe',
    datei: 'src/components/datepicker.css',
    regel: 'In RTL spiegelt sich die Kopfzeile der Datumsauswahl von selbst — nur die Pfeile werden gedreht, sonst zeigen sie nach innen.',
    suchen: "[dir='rtl'] .dp-nav {\n  transform: scaleX(-1);\n}\n",
    ersetzen: "[dir='rtl'] .dp-head {\n  flex-direction: row-reverse;\n}\n\n[dir='rtl'] .dp-nav {\n  transform: scaleX(-1);\n}\n",
  },
  {
    id: 'familie-rest-aufloesen',
    datei: 'src/data/helpers.ts',
    regel: 'Wer den Haushalt wechselt, lässt keinen Ein-Personen-Haushalt zurück — wie beim Lösen.',
    suchen: '  return b.fam && b.fam !== hid ? einzelnenAufloesen(next, b.fam) : next\n',
    ersetzen: '  return next\n',
  },
  {
    id: 'offene-plaetze-tagebuch-einmal',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Die freien Plätze lesen das Versand-Tagebuch einmal je Ableitung, nicht je Woche.',
    suchen: '    if (!gesendet.has(week.start)) return\n',
    ersetzen: '    if (!planGesendet(sentLog, week.start)) return\n',
  },
  {
    id: 'localize-varianten-nicht-klonen',
    datei: 'src/data/localize.ts',
    regel: 'Die Fassung in der Sprache des Lesers klont die Sprachvarianten nicht mit.',
    suchen: '  const merged: Week = { ...structuredClone(ohneVarianten), alt: varianten }\n',
    ersetzen: '  const merged: Week = structuredClone(week)\n',
  },
  {
    id: 'fs-last-kalenderwochen',
    datei: 'src/data/fs.ts',
    regel: 'Das Lastfenster der Treffpunkte zählt Kalenderwochen — eine Lücke im Bestand verlängert es nicht.',
    suchen: '    const versatz = wochenVersatz(kennungen, i, wi)\n    if (versatz > 0 || versatz <= -FS_LOAD_WEEKS) return\n',
    ersetzen: '    const versatz = i - wi\n    if (versatz > 0 || versatz <= -FS_LOAD_WEEKS) return\n',
  },
  {
    id: 'fs-auto-meldung-niemand-frei',
    datei: 'src/app/reducer.ts',
    regel: '„Automatisch" bei den Treffpunkten sagt „niemand Passendes frei", wenn offen blieb, was niemand übernehmen konnte.',
    suchen: "toastKey(state, unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen')",
    ersetzen: "toastKey(state, 'toastKeineOffen')",
  },
  {
    id: 'zusage-abgewiesen-nachladen',
    datei: 'src/lib/data.ts',
    regel: 'Weist die Datenbank eine Zusage ab, weil die Aufgabe nicht mehr meine ist, wird nachgeladen — nicht nur gemeldet.',
    suchen: "  void zeilenRun(\n    supabase.from('confirmations').upsert(",
    ersetzen: "  void run(\n    supabase.from('confirmations').upsert(",
  },
  {
    id: 'code-pruefung-noch-einmal',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Scheitert die Prüfung des Codes am Netz, prüft „Anmelden" noch einmal — sonst ginge kein neuer Versuch.',
    suchen: '  }, [code, versuch])\n',
    ersetzen: '  }, [code])\n',
  },
  {
    id: 'absage-mitteilung-gelesen',
    datei: 'src/aufgaben/AbsageBlatt.tsx',
    regel: 'Wer im Absage-Blatt absagt, hat die Mitteilung zur Aufgabe gelesen — sie bleibt nicht „Neu".',
    suchen: "    mitteilungenGelesen()\n    dispatch({ type: 'declineTask', id: task.id, nachricht })\n",
    ersetzen: "    dispatch({ type: 'declineTask', id: task.id, nachricht })\n",
  },
  {
    id: 'monatsbogen-ratgeber',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Der Monatsbogen nennt den Ratgeber der Zusätzlichen Klasse — wie der Wochenbogen.',
    suchen: '      {!ausgefallen && mitAux && rawMeeting.auxRatgeber && (\n',
    ersetzen: '      {false && rawMeeting.auxRatgeber && (\n',
  },
  {
    id: 'weitere-plaene-luecken',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Beim Ansehen eines Weiteren Plans steht jede Woche da, auch die ohne Gruppe — nicht nur die eingetragenen.',
    suchen: '        {planSpannen(plan)\n          .filter((spanne) => spanne >= jetzt)\n',
    ersetzen: '        {eintraege.map((e) => e.datum)\n          .filter((spanne) => spanne >= jetzt)\n',
  },
  {
    id: 'blatt-zusage-woche-des-platzes',
    datei: 'src/planen/useAktuellerPlatz.ts',
    regel: 'Das Zuteilen-Blatt zeigt die Zusage aus der Woche seines Platzes — nicht aus der gezeigten.',
    suchen: '  const zusage = useZusage(sel.wi)\n',
    ersetzen: '  const zusage = useZusage()\n',
  },
  {
    id: 'auswahl-im-eigenen-reiter',
    datei: 'src/app/reducer.ts',
    regel: 'Beim Reiterwechsel bleibt die Auswahl nur in ihrem eigenen Reiter — sonst spränge sie als Blatt auf.',
    suchen: '        slotSel: state.slotSel && auswahlSichtbar(state.slotSel, action.tab) ? state.slotSel : null,\n',
    ersetzen: '        slotSel: state.slotSel,\n',
  },
  {
    id: 'auswahl-fs-bereich',
    datei: 'src/app/reducer.ts',
    regel: 'Ein anderer Bereich des Predigtdienstes räumt die Auswahl ab.',
    suchen: '{ ...state, fsBereich: action.bereich, slotSel: null }',
    ersetzen: '{ ...state, fsBereich: action.bereich }',
  },
  {
    id: 'sprung-zu-den-treffpunkten',
    datei: 'src/app/reducer.ts',
    regel: 'Ein Sprung zu einer Woche bei den Treffpunkten zeigt ihre Treffpunkte, nicht Grundplan oder Gruppenbesuche.',
    suchen: "          ...(zielTab === 'fs' ? { fsBereich: 'treffpunkte' as const } : {}),\n",
    ersetzen: '',
  },
  {
    id: 'woche-einrichten-schluessel',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: '„Woche einrichten" beginnt je Woche neu — das Blättern nimmt Aufgeklapptes und Entwürfe nicht mit.',
    suchen: '        <WochePanel key={rawWeek?.start ?? state.week} />\n',
    ersetzen: '        <WochePanel />\n',
  },
  {
    id: 'senden-spur-nur-zusammenkunft',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: '„Plan senden" zeigt die Spur einer Zusammenkunft nur aus ihrem Plan — aus den Treffpunkten keine.',
    suchen: "{art === 'zusammenkuenfte' && istZusammenkunft(state.tab) && <PlanSpur tab={state.tab} />}",
    ersetzen: "{<PlanSpur tab={state.tab === 'we' ? 'we' : 'mid'} />}",
  },
  {
    id: 'senden-gruppe-ohne-spur',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Beim Gruppenaufseher steht im Blatt keine Spur der Zusammenkunft — sein Plan ist der der Treffpunkte, auf welchem Reiter er auch steht.',
    suchen: "{art === 'zusammenkuenfte' && istZusammenkunft(state.tab) && <PlanSpur",
    ersetzen: '{istZusammenkunft(state.tab) && <PlanSpur',
  },
  {
    id: 'holen-blatt-portal',
    datei: 'src/planen/ProgrammHolen.tsx',
    regel: 'Das „Holen"-Blatt hängt an `body` — in der Wochenspalte läge es am Desktop unter dem Plan.',
    suchen: '        createPortal(\n          <ProgrammHolenBlatt\n',
    ersetzen: '        ((blatt, _ziel) => blatt)(\n          <ProgrammHolenBlatt\n',
  },
  {
    id: 'kandidaten-kreisaufseher-freitext',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Am Platz des Kreisaufsehers bietet das Zuteilen-Blatt keine Person an — sonst würde er zum „Redner" und verschwände.',
    suchen: '  if (kreisaufseherPlatz(state, sel)) return []\n',
    ersetzen: '',
  },
  {
    id: 'minuten-aus-feld',
    datei: 'src/data/meeting-edit.ts',
    // Der Rückfall auf die erste Zahl der Meta-Zeile ist weg — die Regel kann
    // hier nicht mehr verletzt werden. Gemessen wird deshalb, dass die Dauer
    // überhaupt ankommt: Ohne sie zeigt der Planen-Screen keine Minuten-Knöpfe.
    regel: 'Die Dauer kommt aus dem Feld `mins` (T32).',
    suchen: "  return typeof item.mins === 'number' ? item.mins : null",
    ersetzen: '  return null',
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
    datei: 'src/components/abwesenheiten.ts',
    regel: 'Die eigenen Abwesenheiten (Profil) hängen an der Person, nicht am Ersteller.',
    suchen: '    ? absences.filter((a) => (a.personId != null ? a.personId === wer.personId : a.userId === wer.userId))',
    ersetzen: '    ? absences.filter((a) => a.userId === wer.userId || a.personId === wer.personId)',
  },
  {
    id: 'admin-schalter-zeigt-wirksames-recht',
    datei: 'src/data/rechte.ts',
    regel: 'Der Admin-Schalter (und die Marke in der Liste) zeigt das Recht des Kontos, nicht die Vormerkung an der Person.',
    suchen: '  return { admin: konten.some((m) => m.planner), planer: konten.some((m) => m.zuteiler) }',
    ersetzen: '  return { admin: Boolean(person.plannerVorgemerkt), planer: konten.some((m) => m.zuteiler) }',
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
    /*
     * Hier stand `fs-kennung-altbestand`: „Gespeicherte Treffpunkte werden beim
     * Laden auf die stabile Kennung gehoben." Die Hebung ist mit der
     * Altlasten-Räumung (T104) weggefallen — es gibt keinen Altbestand mehr, den
     * sie heben müsste. Der Eintrag zeigte danach ins Leere und fiel erst am
     * 18. September 2026 auf: Diese Probe läuft nicht in der CI (siehe Kopf).
     */
    id: 'fs-gruppe-null-ist-versammlung',
    datei: 'src/data/fs.ts',
    regel: 'Ein Treffpunkt ohne Gruppe gehört der Versammlung — und den sieht jeder.',
    suchen: '  return insts.filter((inst) => inst.grp == null || meine.has(inst.grp))',
    ersetzen: '  return insts.filter((inst) => meine.has(inst.grp ?? ""))',
  },
  {
    /*
     * Hier stand `fs-schluessel-altbestand`: „Die Bestätigung eines Treffpunkts
     * wandert auf den stabilen Schlüssel mit." Auch diese Umbenennung ist mit
     * T104 weggefallen — es gibt nur noch eine Form des Schlüssels. Aufgefallen
     * am 18. September 2026, aus demselben Grund wie der Eintrag darüber.
     */
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
    suchen: '  return insts.filter((inst) => inst.grp == null || meine.has(inst.grp))',
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
    id: 'fs-zusage-verfaellt-mit-leiter',
    datei: 'src/app/reducer.ts',
    regel: 'Leitet jemand anderes den Treffpunkt, erbt er die Zusage des Vorgängers nicht.',
    suchen: 'const next = ohneEntzogene(state, ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action)))',
    ersetzen: 'const next = ohneEntzogene(state, baseReducer(state, action))',
  },
  {
    id: 'fs-zusage-person-nicht-name',
    datei: 'src/data/fs.ts',
    regel: 'Wer als Treffpunkt-Leiter umbenannt wird, behält seine Zusage — die Person-Id entscheidet.',
    suchen: 'return dieselbePerson({ name: a.leader, pid: a.lpid }, { name: b.leader, pid: b.lpid })',
    ersetzen: 'return a.leader === b.leader',
  },
  {
    id: 'fs-zusage-freitext',
    datei: 'src/data/fs.ts',
    regel: 'Ein Freitext-Leiter übernimmt keine Zusage, auch nicht unter demselben Namen.',
    suchen: 'if (!b.leader || Boolean(a.lext) !== Boolean(b.lext)) return false',
    ersetzen: 'if (!b.leader) return false',
  },
  {
    id: 'fs-zusage-datenbank',
    datei: 'src/app/persist.ts',
    regel: 'Die verfallene Treffpunkt-Zusage verschwindet auch aus der Datenbank, nicht nur aus dem Zustand.',
    suchen: '    if (geschrieben) deleteConfirmationRows(congId, keys)\n',
    ersetzen: '    void geschrieben\n',
  },
  {
    id: "fs-zusage-erst-mit-schreiben",
    datei: 'src/app/persist.ts',
    regel: 'Bei gebündeltem Schreiben wartet das Löschen der Zusage auf die Woche — sonst fehlt sie nach einem Abbruch.',
    suchen: "    fsZusagenVormerken(congId, week.start, verwaist)\n    if (gebuendelt) fsWeekSaves.schedule(",
    ersetzen: "    const sofortWeg = verwaist.get(week.start)\n    if (sofortWeg) deleteConfirmationRows(congId, sofortWeg)\n    if (gebuendelt) fsWeekSaves.schedule(",
  },
  {
    id: 'fs-zusage-laden-zustand',
    datei: 'src/app/reducer.ts',
    regel: 'Das Laden räumt keine Zusagen ab — die eines anderswo eingeteilten Leiters kommt mit und bleibt.',
    suchen: "if (action.type === 'hydrate') return withDerivedTasks(baseReducer(state, action), !action.nachgeladen)",
    ersetzen:
      "if (action.type === 'hydrate') return withDerivedTasks(ohneVerwaisteTreffpunktZusagen(state, baseReducer(state, action)), !action.nachgeladen)",
  },
  {
    id: 'fs-regen-freitext',
    datei: 'src/data/fs.ts',
    regel: 'Der Freitext-Leiter bleibt Freitext, wenn der Grundplan die Woche neu erzeugt — beim Laden wie beim Ändern.',
    suchen: '    ...(inst.lext ? { lext: true } : {}),\n',
    ersetzen: '',
  },
  {
    id: 'fs-regen-person',
    datei: 'src/data/fs.ts',
    regel: 'Der Treffpunkt-Leiter behält beim Neuerzeugen aus dem Grundplan seine Person-Id.',
    suchen: '    ...(inst.lpid ? { lpid: inst.lpid } : {}),\n',
    ersetzen: '',
  },
  {
    id: 'zuteilung-namensvetter',
    datei: 'src/data/planning.ts',
    regel: 'Wird ein Platz an einen Namensvetter umgeteilt, verfällt die Zusage — die Person-Id entscheidet, nicht der Name.',
    suchen: '  return dieselbePerson(vorher, nachher)\n',
    ersetzen: '  return vorher.name === nachher.name\n',
  },

  // ── Ampel-Punkt im Planen ─────────────────────────────────────────────────
  {
    id: 'ampel-je-platz-woche',
    datei: 'src/planen/useZusage.ts',
    regel: 'Der Ampel-Punkt sucht die Zusage unter der Wochen-Kennung, nicht unter der Position.',
    suchen: "const woche = week?.start ?? ''",
    ersetzen: 'const woche = String(state.week)',
  },
  {
    id: 'ampel-treffpunkt-woche',
    datei: 'src/planen/useZusage.ts',
    regel: 'Auch am Treffpunkt: Zusage unter dem Montag der Woche, nicht unter der Position.',
    suchen: 'stand(fsTaskKey(woche, inst.id)),',
    ersetzen: 'stand(fsTaskKey(String(state.week), inst.id)),',
  },
  {
    id: 'ampel-ausgefallen',
    datei: 'src/planen/useZusage.ts',
    regel: 'Eine ausgefallene Zusammenkunft trägt keine Ampel-Punkte — es gibt dort nichts zu bestätigen.',
    suchen: 'moeglich: (tab: MeetingKey): boolean => !istAusgefallen(week, tab),',
    ersetzen: 'moeglich: (_tab: MeetingKey): boolean => true,',
  },
  {
    id: 'ampel-absage-rot',
    datei: 'src/data/planning.ts',
    regel: 'Eine Absage ist rot — nicht gelb wie eine ausstehende Antwort.',
    suchen: "return confirmations[key] ?? 'offen'",
    ersetzen: "return confirmations[key] === 'bestätigt' ? 'bestätigt' : 'offen'",
  },
  // Hier standen drei Einträge zu `SlotChip` (Stufe, Vorlesen, geschütztes
  // Leerzeichen). Seit T121 Phase 5e ist jeder Platz eine `PlatzZeile` — die
  // Stufe bewachen dort `plan-platz-*`.

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
    regel: 'Jeder erzeugte Mitteilungs-Titel hat seinen Wörterbuch-Schlüssel — sonst steht er in jeder anderen Sprache deutsch in der Glocke.',
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
    datei: 'src/data/aux-class.ts',
    regel: 'Die Bibellesung wird am Bereich erkannt, nicht am deutschen Titel — sonst fehlt der S-89-Zettel in jeder anderen Sprache.',
    // Der Titel-Rückfall (`item.title.startsWith('Bibellesung')`) ist am
    // 25.9.2026 entfallen — er stand nur für Bestandswochen ohne Bereich, die
    // es seit dem Neuaufbau (T105) nicht mehr gibt. Seit dem 4.10.2026 fragen
    // S-89 und Zusätzliche Klasse dieselbe Menge (`istSchuelerBereich`); bis
    // zum 25.10.2026 stand sie im geteilten Edge-Ordner, weil auch „Freie
    // Plätze" (Client und Server) sie fragte.
    suchen: "  'bibellesung',\n  'schulung',\n",
    ersetzen: "  'schulung',\n",
  },
  {
    id: 's89-schuelervortrag',
    datei: 'src/data/aux-class.ts',
    regel: 'Der Vortrag eines Schülers bleibt Schülerteil, obwohl er einen eigenen Bereich hat — Zusätzliche Klasse und S-89-Zettel.',
    suchen: "  'schulungVortrag',\n])",
    ersetzen: '])',
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
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Eröffnung und Abschluss werden an der Abschnitts-Art erkannt, nicht am Namen.',
    suchen: 'const sammeltitel = rawSection ? istBlockSektion(rawSection) : false',
    ersetzen: 'const sammeltitel = false',
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
    datei: 'src/bausteine/bausteine.css',
    regel: 'Die Pfeile (Wochen, Monate, Zurück) kippen in RTL — sonst zeigt „vorige Woche" nach vorn.',
    suchen: "[dir='rtl'] .zeichen.is-richtung {\n  transform: scaleX(-1);\n}",
    ersetzen: "[dir='rtl'] .zeichen.is-richtung {\n  transform: none;\n}",
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
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Personenfelder tragen ihre eigene Schreibrichtung — eine Telefonnummer dreht sich sonst in einer RTL-Oberfläche um.',
    suchen: '            type="tel"\n            dir="auto"\n',
    ersetzen: '            type="tel"\n',
  },
  {
    id: 'datumswaehler-montag',
    datei: 'src/components/kalender.ts',
    regel: 'Der Kalender beginnt in jeder Sprache am Montag — wie die Programmwoche selbst.',
    suchen: '  const start = Date.UTC(y, m, 1 - versatzAbMontag(erster.getUTCDay()))',
    ersetzen: '  const start = Date.UTC(y, m, 1 - erster.getUTCDay())',
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
    /*
     * Hier stand `erinnerung-fs-kennung`: „Der Versand greift nach der stabilen
     * Treffpunkt-Kennung, **auch im Altbestand**." Das Heben aus dem Altbestand
     * (`stabileKennung`) ist mit T104 weggefallen; der Schlüssel hat nur noch
     * eine Form. Gemessen wird stattdessen, dass ein Freitext-Leiter keine
     * Erinnerung bekommt — die Regel, die an derselben Aufzählung hängt (T63).
     */
    id: 'erinnerung-fs-freitext-leiter',
    // Seit T99 in `_shared/zuteilungen.ts`: `send-plan` zählt dieselben Plätze
    // auf wie `send-reminders`, und zwei Fassungen einer solchen Aufzählung
    // waren hier schon die Ursache eines Fehlers (B8/T40).
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Ein auswärtiger Leiter (Freitext) bekommt keine Erinnerung (T63).',
    suchen: '    if (!inst?.leader || inst.lext) continue',
    ersetzen: '    if (!inst?.leader) continue',
  },
  {
    id: 'erinnerung-letzte-ist-letzte',
    datei: 'supabase/functions/_shared/erinnerung.ts',
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
    id: 'ersatz-suchen-id-vor-name',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Trägt der Platz eine Id, entscheidet sie — der Namensvetter löst keine fremde Ersatzsuche aus.',
    suchen: '(slot.pid ? slot.pid === callerPerson.id : slot.name === displayName(callerPerson))',
    ersetzen: '(slot.pid === callerPerson.id || slot.name === displayName(callerPerson))',
  },
  {
    id: 'ersatz-doch-bestaetigen-zieht-zurueck',
    datei: 'src/app/persist.ts',
    regel: '„Doch bestätigen" nach der Absage eines Hilfsdienstes nimmt das Ersatzgesuch zurück — sonst steht es bei allen Angepingten weiter (T118).',
    suchen: "      if (helperKeyParts(action.id) && prev.confirmations[action.id] === 'verhindert') {\n        substituteWithdraw(action.id)\n      }\n",
    ersetzen: '',
  },
  {
    id: 'ersatz-zurueckziehen-raeumt-glocken',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Das Zurückziehen entfernt die Zeilen „Ersatz gesucht" aus allen Glocken — nicht nur die Antwort ok (T118).',
    suchen: '      await gesuchZeilenLoeschen()\n      return json({ ok: true, withdrawn: true })',
    ersetzen: '      return json({ ok: true, withdrawn: true })',
  },
  {
    id: 'person-loeschen-nimmt-abwesenheiten-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Mit der Person gehen ihre Abwesenheiten — sonst stehen sie mit toter Id im Zustand (T118).',
    suchen: '    absences: state.absences.filter((a) => a.personId !== id),\n',
    ersetzen: '',
  },
  {
    id: 'person-loeschen-abwesenheiten-datenbank',
    datei: 'src/app/persist.ts',
    regel: 'Die Abwesenheiten einer gelöschten Person verschwinden auch aus der Datenbank — die nullt nur die Person (T118).',
    suchen: '  for (const a of prev.absences) if (a.personId === id) deleteAbsenceRow(a.id)\n',
    ersetzen: '',
  },
  {
    id: 'einladung-nur-planer',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Anmelde-Links stellt nur der Admin aus.',
    suchen: "if (!member?.planner) return json({ error: 'forbidden' }, 403)",
    ersetzen: "if (!member) return json({ error: 'forbidden' }, 403)",
  },
  {
    id: 'einladung-eigene-versammlung',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Links und Mails nur für Personen der eigenen Versammlung — kein offenes Mail-Relay.',
    suchen: '        `persons?select=id,fn,ln,mail&congregation_id=eq.${wert(cong)}&id=in.(${ids.map(wert).join(\',\')})`,',
    ersetzen: '        `persons?select=id,fn,ln,mail&id=in.(${ids.map(wert).join(\',\')})`,',
  },
  {
    id: 'einladung-ohne-absender',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Ohne verifizierten Absender geht keine Mail hinaus — Links gibt es trotzdem.',
    suchen: '    const bereit = mailBereit(MAIL)\n',
    ersetzen: '    const bereit = true\n',
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
    regel: 'Die Mail mit dem Link spricht die Sprache der Versammlung, nicht immer Deutsch.',
    suchen: '        const mail = linkMail(lang, {',
    ersetzen: "        const mail = linkMail('de', {",
  },
  {
    id: 'einladung-texte-vollstaendig',
    datei: 'supabase/functions/_shared/anmelde-texte.ts',
    regel: 'Jede App-Sprache hat ihren eigenen Text der Link-Mail — kein stiller Rückfall auf Deutsch.',
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
  {
    id: 'import-besprechung-kein-schuelerteil',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Eine Besprechung unter „Uns im Dienst verbessern" ist keine Schulungsaufgabe — sie bekommt den Platz eines Bruders.',
    suchen: '  if (BESPRECHUNG_RE.test(form)) return besprechungsPlatz()\n',
    ersetzen: '',
  },
  {
    id: 'import-szene-mit-partner',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Eine gespielte Szene bekommt Schüler und Partner — sie ist kein Vortrag nur für Brüder.',
    suchen: '  if (SZENE_RE.test(form)) return convo\n',
    ersetzen: '',
  },
  {
    id: 'import-vortrag-nur-brueder',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Einen Vortrag hält ein Bruder — die Form gilt vor dem Titel.',
    suchen: '  if (VORTRAG_RE.test(form)) return [talk]\n',
    ersetzen: '',
  },
  // Die Trennung vom 4.10.2026: Vortrag, Besprechung und Vortrag eines Schülers
  // sind drei Bereiche. Fiele einer zurück, stünde wieder jeder, der einen davon
  // kann, für alle drei zur Wahl.
  {
    id: 'import-schaetze-erster-ist-vortrag',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Der erste Schätze-Punkt ist der Vortrag, die übrigen sind Besprechungen — über die Position, nicht den Text.',
    suchen: "else if (color === 'teal' && rec === firstOf.teal) part.names = vortragsPlatz()",
    ersetzen: "else if (color === 'teal' && rec === lastOf.teal) part.names = vortragsPlatz()",
  },
  {
    id: 'import-besprechung-eigener-bereich',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Graben, Besprechungen und „Unser Leben als Christ" tragen „Besprechungen leiten", nicht den Bereich des Vortrags.',
    suchen: "  return [{ name: '', bereichsKey: 'besprechung' }]\n",
    ersetzen: "  return [{ name: '', bereichsKey: 'vortrag' }]\n",
  },
  {
    id: 'import-schuelervortrag-eigener-bereich',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Der Vortrag eines Schülers hat seinen eigenen Bereich — wer Gespräche führt, hält nicht zwingend Vorträge.',
    suchen: "const talk = { name: '', bereichsKey: 'schulungVortrag', male: true }",
    ersetzen: "const talk = { name: '', bereichsKey: 'schulung', male: true }",
  },
  {
    id: 'lac-eigener-punkt-besprechung',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein eigener Punkt unter „Unser Leben als Christ" bekommt denselben Bereich wie die importierten dort.',
    suchen: "names: [{ name: '', bereichsKey: 'besprechung' }] }",
    ersetzen: "names: [{ name: '', bereichsKey: 'studium' }] }",
  },
  {
    id: 'redner-nach-stellung',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Am Redner-Platz stehen alle Ältesten und Dienstamtgehilfen zur Wahl — nach Stellung, nicht nach Bereich.',
    suchen: "    sel.kind === 'part' && sel.guest\n",
    ersetzen: '    false\n',
  },
  {
    id: 'engpass-ohne-eigenen-redner',
    datei: 'src/data/bedarf.ts',
    regel: 'Auch der eigene Redner ist kein Engpass — er braucht keinen Bereich mehr.',
    suchen: '    if (isSpeakerRole(platz.slot.rolle)) continue\n',
    ersetzen: "    if (isSpeakerRole(platz.slot.rolle) && platz.slot.rolle !== 'Redner') continue\n",
  },

  // ── Rechte und Bedienung ──────────────────────────────────────────────────
  // Die Rechteprüfung steht an zwei Stellen: der Wächter im Reducer weist eine
  // gesperrte Ansicht ab, die Navigationsliste entscheidet, welcher Eintrag
  // überhaupt dasteht. Der Wächter war bewacht, die Liste bis dahin nicht.
  {
    id: 'nav-gruppenaufseher-ohne-personen',
    // Wer welchen Bildschirm betreten darf, entscheidet inzwischen
    // `erlaubteScreens` in `data/rechte.ts` — der Shell blieb nur das Zeichnen.
    datei: 'src/data/rechte.ts',
    // Seit dem 4.10.2026 dieselbe Zeile für Planer und Gruppenaufseher.
    regel: 'Planer und Gruppenaufseher sehen Planen, aber nicht Personen.',
    // Die Mutation öffnet die Personen für den, der Planen sieht.
    // Seit dem 16.10.2026 steht der Zugang je Bildschirm (`ZUGANG`).
    suchen: "  personen: 'admin',\n",
    ersetzen: "  personen: 'gruppe',\n",
  },
  {
    id: 'nav-gruppenaufseher-ohne-einstellungen',
    datei: 'src/data/rechte.ts',
    // Bis T120 bekam er sie für den Grundplan seiner Gruppe; der steht seitdem
    // im Predigtdienst. Ein Rest-Eintrag führte in eine leere Seite.
    regel: 'Planer und Gruppenaufseher sehen keine Einstellungen — die gehören dem Admin.',
    suchen: "  einstellungen: 'admin',\n",
    ersetzen: "  einstellungen: 'gruppe',\n",
  },
  {
    id: 'nav-wochen-nur-wer-zuteilt',
    datei: 'src/data/rechte.ts',
    // T121, Phase 10: Die Seite aller Wochen gilt den Zusammenkünften.
    regel: 'Die Seite aller Wochen sieht nur, wer zuteilt — der Gruppenaufseher plant allein Treffpunkte.',
    suchen: "  planung: 'planer',\n",
    ersetzen: "  planung: 'gruppe',\n",
  },
  {
    id: 'nav-verkuendiger-ohne-planen',
    datei: 'src/data/rechte.ts',
    // 16.10.2026: Der Verkündiger sah bis dahin „alle außer einer Liste".
    regel: 'Ein Verkündiger sieht Planen nicht — jeder Bildschirm nennt seinen Zugang selbst.',
    suchen: "  planen: 'gruppe',\n",
    ersetzen: "  planen: 'alle',\n",
  },
  // ── Rechte-Stufe „Planer" (4.10.2026) ──────────────────────────────────────
  // Zuteilen und Plan ändern sind dieselbe Zeile. Die Grenze zieht der Server:
  // die Edge Function `zuteilen` für die Wochen, die Datenbank für Treffpunkte,
  // Weitere Pläne und Gruppenbesuche.
  {
    id: 'rechte-admin-hat-planer-schalter-an',
    datei: 'src/personen/PrivToggle.tsx',
    regel: 'Beim Admin steht der Planer-Schalter an — er hat das Recht ohnehin.',
    suchen: '        an={admin || planer}\n',
    ersetzen: '        an={planer}\n',
  },
  {
    id: 'ersatz-gefunden-auch-an-planer',
    datei: 'supabase/functions/substitute/index.ts',
    regel: '„Ersatz gefunden" erreicht Admins und Planer — wer zuteilt, sucht den Ersatz.',
    suchen: '      ...members.filter((m) => m.planner || m.zuteiler).map((m) => m.user_id),',
    ersetzen: '      ...members.filter((m) => m.planner).map((m) => m.user_id),',
  },
  {
    id: 'unerreichbar-auch-an-planer',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Wer nicht erreichbar ist, nennt die Erinnerung auch dem Planer.',
    suchen: '          if (!m.planner && !m.zuteiler) continue',
    ersetzen: '          if (!m.planner) continue',
  },
  {
    id: 'schema-wochen-admin-und-planer',
    datei: 'supabase/schema.sql',
    regel: 'Wochen schreiben Admin und Planer — wer die Woche plant, holt und richtet sie ein.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\n-- Abwesenheiten',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\n-- Abwesenheiten',
  },
  {
    id: 'schema-aufseher-fremde-leiter',
    datei: 'supabase/schema.sql',
    regel: 'Der Gruppenaufseher setzt keinen Leiter einer fremden Gruppe — nur die Person-Id einer Bindung zählt nicht.',
    suchen: '  select coalesce(jsonb_agg(e.i - \'lpid\' order by e.i ->> \'id\'), \'[]\'::jsonb)',
    ersetzen: '  select coalesce(jsonb_agg(e.i - \'lpid\' - \'leader\' order by e.i ->> \'id\'), \'[]\'::jsonb)',
  },
  {
    id: 'schema-grundplan-eigene-gruppe',
    datei: 'supabase/schema.sql',
    regel: 'Den Grundplan pflegt der Gruppenaufseher nur für seine Gruppe.',
    suchen: '  using (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or grp = any (public.eigene_gruppen())))',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or public.is_group_overseer()))',
  },
  {
    // Bis zum 16.10.2026 stand die Prüfung zweimal in `GruppenbesuchePlan`
    // (anlegen; verlegen und streichen). Seit „Alles Planen" war sie dort immer
    // wahr — es entscheidet der Eingang.
    id: 'gb-planen-wer-plant',
    datei: 'src/planen/fs-bereiche.ts',
    regel: 'Gruppenbesuche planen (anlegen, verlegen, streichen, Besucher wechseln) Admin und Planer.',
    suchen: '  const besuche = planen ? rechte.zuteilen : kuenftigeBesuche(state)\n',
    ersetzen: '  const besuche = planen ? rechte.admin : kuenftigeBesuche(state)\n',
  },
  {
    // Ebenso: Bis zum 16.10.2026 prüften „Plan bearbeiten" und die Liste
    // selbst — seit „Alles Planen" immer wahr.
    id: 'wp-planen-wer-plant',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Weitere Pläne anlegen und ändern (Name, Zeitraum, Takt, Veröffentlichen, Löschen) Admin und Planer.',
    suchen: "  if (state.tab === 'wp' && rechte.zuteilen) return <WeiterePlaenePlan />\n",
    ersetzen: "  if (state.tab === 'wp' && rechte.admin) return <WeiterePlaenePlan />\n",
  },
  {
    id: 'plan-senden-auch-beim-planer',
    datei: 'src/planen/wochen-versand.ts',
    regel: '„Plan senden" steht bei jedem, der zuteilt — auch beim Planer.',
    suchen: '  return rechteVon(state).zuteilen && !state.staleAt',
    ersetzen: '  return state.planner && !state.staleAt',
  },
  {
    id: 'rechte-planer-ist-kein-admin',
    datei: 'src/data/rechte.ts',
    // Die Stufe „Planer" (4.10.2026): zuteilen ja, den Plan ändern nein.
    regel: 'Das Planer-Recht macht niemanden zum Admin.',
    suchen: '    admin: s.planner,\n',
    ersetzen: '    admin: s.planner || s.zuteiler,\n',
  },
  {
    id: 'rechte-admin-teilt-zu',
    datei: 'src/data/rechte.ts',
    regel: 'Der Admin teilt zu, auch ohne das Planer-Recht eigens zu tragen.',
    suchen: '    zuteilen: s.planner || s.zuteiler,\n',
    ersetzen: '    zuteilen: s.zuteiler,\n',
  },
  // Die Mitgliedsrechte-Probe misst die Rechte-Stufen an der echten Datenbank
  // (4.10.2026). Misst sie daneben, meldet sie eine Grenze als gemessen, die
  // sie nie berührt hat — deshalb sind auch ihre eigenen Regeln bewacht.
  {
    id: 'probe-eigene-mitgliedszeile',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Probe liest die eigene Mitgliedszeile — einem Admin zeigt members alle Zeilen seiner Versammlung.',
    suchen: 'members?select=congregation_id,person_id,planner,zuteiler&user_id=eq.${user.id}`)',
    ersetzen: 'members?select=congregation_id,person_id,planner,zuteiler`)',
  },
  {
    id: 'probe-zuteilung-nur-besetzung',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Zuteilung der Probe ändert nur die Besetzung — sonst hieße (40) „zu streng", wo nichts zu streng ist.',
    suchen: "    platz.name = ''\n",
    ersetzen: "    platz.name = ''\n    platz.rolle = 'Probe'\n",
  },
  {
    id: 'probe-ohne-person-leitet-nichts',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Ein Konto ohne Person leitet keine Gruppe — auch keine ohne Aufseher.',
    suchen: '  const leitet = (g, pid) => Boolean(pid) && (g.overseer_id === pid || g.assistant_id === pid)\n',
    ersetzen: '  const leitet = (g, pid) => g.overseer_id === pid || g.assistant_id === pid\n',
  },
  {
    id: 'probe-tuer-dahinter-durchgelassen',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Antwortet eine Function erst hinter ihrer Rechteprüfung („keine Woche"), hat sie durchgelassen.',
    suchen: '  const durch = a.status < 400 || nachDerTuer.includes(fehler)\n',
    ersetzen: '  const durch = a.status < 400\n',
  },
  // „Schicht geändert" an der Tür von send-plan (5.10.2026): (62)–(64).
  {
    id: 'probe-stellt-zurueck',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Kam ein Änderungsversuch durch, stellt der Admin den vorigen Stand wieder her.',
    suchen: '  await k.aufraeumen(e, zurueck, ZURUECK)\n',
    ersetzen: '\n',
  },
  {
    id: 'probe-fremde-treffpunkt-woche-unberuehrt',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Eine Treffpunkt-Woche, die nicht von der Probe ist, wird nicht überschrieben.',
    suchen: "  } else if (Array.isArray(bestand) && bestand.some((i) => !String(i?.id ?? '').startsWith('PROBE-'))) {\n",
    ersetzen: '  } else if (false) {\n',
  },
  {
    id: 'probe-loescht-nur-eigene-treffpunkt-woche',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Gelöscht wird die Treffpunkt-Woche nur, wenn die Probe sie angelegt hat.',
    suchen: '    ...(merker.treffpunktWoche\n',
    ersetzen: '    ...(true\n',
  },
  {
    id: 'testversammlung-planer-stufe',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Das Planer-Konto der Testversammlung trägt seine Stufe in members — sonst misst die Probe sie nicht.',
    suchen: 'planner: k.planner, zuteiler: k.zuteiler, email: k.mail }',
    ersetzen: 'planner: k.planner, email: k.mail }',
  },
  {
    id: 'testversammlung-aufseher-leitet',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Der Gruppenaufseher der Testversammlung leitet eine Gruppe.',
    suchen: "person: ['Thomas', 'Ebersbach'] }",
    ersetzen: "person: ['Peter', 'Ostermann'] }",
  },
  // Die Kontendatei (5.10.2026): Kennwörter von Skript zu Skript, nicht über den Bildschirm.
  {
    id: 'testversammlung-schreibt-kontendatei',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Das Anlege-Skript schreibt Versammlung und Kennwörter in die Kontendatei.',
    suchen: '    fs.writeFileSync(probeDatei(), probeDateiText(cong.id, konten), { mode: 0o600 })\n',
    ersetzen: '    void probeDateiText\n',
  },
  {
    id: 'testversammlung-kennwoerter-nicht-auf-bildschirm',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Steht die Kontendatei, stehen die Kennwörter nicht auf dem Bildschirm.',
    suchen: '    for (const k of konten) console.log(`  ${k.mail}   ${k.stufe} · ${k.person}`)\n',
    ersetzen: '    for (const k of konten) console.log(`  ${k.mail}  ${k.pass}   ${k.stufe} · ${k.person}`)\n',
  },
  {
    id: 'testversammlung-kontendatei-nur-eigene',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: '--entfernen löscht die Kontendatei nur mit ihrer eigenen Versammlung.',
    suchen: '  if (versammlungDerKontendatei() === id) {\n',
    ersetzen: '  if (true) {\n',
  },
  {
    id: 'probe-liest-kontendatei',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Probe nimmt Versammlung und Konten aus der Kontendatei des Anlege-Skripts.',
    suchen: '  return zugangAus(process.env, (name) => wertAusEnvDatei(name), (name) => wertAusEnvDatei(name, [probeDatei()]))\n',
    ersetzen: '  return zugangAus(process.env, (name) => wertAusEnvDatei(name))\n',
  },
  {
    id: 'nachladen-laesst-predigtdienst-stehen',
    datei: 'src/app/reducer.ts',
    // Seit T120 führt das Menü ohne Reiterwahl in den Predigtdienst; vorher
    // schützte die Wahl (`terminGewaehlt`) davor.
    regel: 'Ein stilles Nachladen wirft nicht aus dem Predigtdienst in die Zusammenkünfte.',
    // Seit dem 3.10.2026 positiv aufgezählt: Die Mutation lässt den Reiter springen.
    suchen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit'])",
    ersetzen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit', 'fs'])",
  },
  {
    id: 'nachladen-laesst-weitere-plaene-stehen',
    datei: 'src/app/reducer.ts',
    // Das Menü führt ohne Reiterwahl zu den Weiteren Plänen (T120, Phase 5).
    regel: 'Ein stilles Nachladen wirft nicht aus den Weiteren Plänen in eine Zusammenkunft.',
    suchen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit'])",
    ersetzen: "const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit', 'wp'])",
  },
  // ── Gruppenbesuche des Dienstaufsehers (T120, Phase 2) ─────────────────────
  {
    id: 'besuch-ersetzt-nicht-ungefragt',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Ein Besuch verdrängt keinen anderen Leiter ohne „Übernehmen" — dessen Zusage hinge sonst still daran.',
    suchen: '    if (inst.leader && !ersetzen) continue\n',
    ersetzen: '',
  },
  {
    id: 'import-traegt-besuch-ein',
    // Seit dem 5.10.2026 in der Einordnung, die App und Import-Skript teilen.
    datei: 'src/data/neue-woche.ts',
    regel: 'Ein vorgemerkter Besuch wird mit dem Import seiner Woche eingetragen.',
    suchen: '  const fsWeek = besucheInNeueWoche(genFsWeek(roh.start, k.fsRules), roh.start, k.gruppenbesuche, k.persons)\n',
    ersetzen: '  const fsWeek = genFsWeek(roh.start, k.fsRules)\n',
  },
  {
    id: 'ansicht-verspricht-nur-feststehendes',
    datei: 'src/programm/GruppenbesucheAnsicht.tsx',
    regel: 'Die Gruppe liest „… leitet dann euren Treffpunkt" nur, wenn es so eingetragen oder vorgemerkt ist.',
    suchen: "            const zugesagt = stand.art === 'eingetragen' || stand.art === 'vorgemerkt'",
    ersetzen: '            const zugesagt = true',
  },
  {
    id: 'planen-gruppenaufseher-nur-predigtdienst',
    datei: 'src/data/rechte.ts',
    regel: 'Der Gruppenaufseher plant nur den Predigtdienst — eine Zusammenkunft sieht er bloß an.',
    suchen: "  return r.zuteilen || (r.gruppe !== null && thema === 'predigtdienst')",
    ersetzen: '  return r.zuteilen || r.gruppe !== null',
  },
  {
    id: 'nav-deeplink-rechte',
    datei: 'src/app/AppShell.tsx',
    regel: 'Ein Push-Deep-Link führt nur in einen Bereich, den man betreten darf.',
    // Seit T109 trägt der vorgemerkte Sprung Screen und Bereich (`Sprung`).
    suchen: "const target = navScreens.includes(pendingNav.screen) ? pendingNav.screen : 'aufgaben'",
    ersetzen: 'const target = pendingNav.screen',
  },
  {
    id: 'start-termin-gerechnet',
    /*
      Der Start-Bildschirm hat seine Wochen-Karten am 19.9.2026 gegen die
      Zeitleiste getauscht und rechnet den Termin nicht mehr selbst — er zeigt
      `MyTask.date`. Die Regel ist damit nicht weg, sie ist einen Schritt nach
      hinten gewandert: in die Ableitung, die den Text erzeugt. Dort steht sie
      jetzt unter Beobachtung, und zwar für alle, die ihn lesen (Start,
      „Meine Aufgaben", Erinnerungen).
    */
    datei: 'src/data/planning.ts',
    regel: 'Der Termin einer Aufgabe wird gerechnet — importierte Wochen tragen im date-Feld nur die Wochenspanne.',
    suchen:
      "const gemeinsam = { id: key, date: meetingDateText(week, tab, zeiten), at, status: 'offen' as const }",
    ersetzen: "const gemeinsam = { id: key, date: week[tab].date, at, status: 'offen' as const }",
  },
  {
    id: 'zwei-tipp-bewaffnet-erst',
    datei: 'src/components/useZweiTipp.ts',
    regel: 'Ein zerstörender Knopf führt beim ersten Tipp nichts aus — er bewaffnet sich nur.',
    // Seit dem 25.9.2026 steht das Muster einmal im Hook; die drei Aufrufer
    // darunter prüfen, dass jeder Knopf ihn auch wirklich benutzt.
    suchen: '      if (!armed) {\n        geschaerftUm.current = performance.now()\n        setArmed(true)\n        return\n      }\n',
    ersetzen: '',
  },
  {
    id: 'zwei-tipp-doppelklick-bestaetigt-nicht',
    datei: 'src/components/useZweiTipp.ts',
    regel: 'Ein Doppelklick schärft nur — der bestätigende Tipp zählt erst 400 ms nach dem Schärfen.',
    suchen: '      if (performance.now() - geschaerftUm.current < ZWEI_TIPP_SPERRE_MS) return\n',
    ersetzen: '',
  },
  {
    // Bis Phase 10 an der alten Zeile `AutoAssignRow`, die seit Phase 5c
    // niemand mehr zeigte; dass erst der zweite Tipp leert, hält
    // `zwei-tipp-bewaffnet-erst` am Hook.
    id: 'leeren-fokus-weg',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Geht der Fokus von „Leeren" weg, nimmt es die Frage zurück — ein Tipp daneben leert nichts.',
    suchen: '          onClick={leeren.onClick}\n          onBlur={leeren.onBlur}\n',
    ersetzen: '          onClick={leeren.onClick}\n',
  },
  {
    id: 'person-loeschen-zwei-tipp',
    datei: 'src/personen/PersonDetail.tsx',
    regel: '„Person löschen" verlangt zwei Tipps — es löst Gruppen-, Konto- und Code-Bezüge.',
    suchen: '      <EntfernenKnopf\n        className="knopf-leise knopf-entfernen person-entfernen"\n',
    ersetzen:
      '      <button\n' +
      "        onClick={() => dispatch({ type: 'removePerson', id: person.id })}\n" +
      '        className="knopf-leise knopf-entfernen person-entfernen"\n',
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
    suchen: 'const guestBase = !rolleJetzt || eigenerRedner ? ROLE_GUEST_SPEAKER : rolleJetzt',
    ersetzen: 'const guestBase = rolleJetzt || ROLE_GUEST_SPEAKER',
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
    regel: 'Eine Zusage hat nur, wer bestätigen kann — der Gastredner wartet nicht.',
    suchen: 'slot.name && !isGuestRole(slot.rolle) && zusage.moeglich(tab)',
    ersetzen: 'slot.name && zusage.moeglich(tab)',
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
    // Umgezogen: Die Frist lag in `useSwipeWeek`, der Zwilling `useSwipeDown`
    // hatte danebengestanden und seine eigene, ungesicherte. Jetzt teilen sich
    // beide diese eine Stelle.
    datei: 'src/components/einZeitgeber.ts',
    regel: 'Es gibt immer nur einen Zeitgeber — eine abgebrochene Bewegung räumt nicht in die nächste hinein.',
    suchen: '    spaeter: (fn, ms) => {\n      stoppen()',
    ersetzen: '    spaeter: (fn, ms) => {',
  },
  {
    id: 'push-nie-von-allein',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Die Karte für Benachrichtigungen bleibt weg, wenn Push auf diesem Gerät gar nicht erreichbar ist.',
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
    // Seit Phase 10 (T121) mit `code` in einem Block.
    suchen:
      "        return json({ error: `Diese Woche ist in der gewählten Sprache (${lang}) noch nicht verfügbar.`, code: 'sprache-fehlt' }, 404)\n",
    ersetzen: '        // deutsche Fassung behalten\n',
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
    suchen: "    if (kern[0] !== '#') return BENANNT[kern] ?? ganz\n",
    ersetzen: '    return BENANNT[kern] ?? ganz\n',
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
    regel: 'In die Bearbeiten-Ansicht der Woche (T64) kommt, wer plant — der Gruppenaufseher nicht.',
    suchen: 'const isEdit = state.tab === \'edit\' && rechte.zuteilen',
    ersetzen: 'const isEdit = state.tab === \'edit\'',
  },
  {
    id: 'planen-planer-mit-bearbeiten-reiter',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Den Reiter „Woche einrichten" sehen Admin und Planer.',
    suchen: '          showEdit={rechte.zuteilen}',
    ersetzen: '          showEdit={rechte.admin}',
  },
  {
    id: 'navigate-bearbeiten-wer-plant',
    datei: 'src/app/reducer.ts',
    regel: 'Ein Sprung in „Woche einrichten" führt den Planer dorthin.',
    suchen: '        edit: screen === \'planen\' && rechte.zuteilen,',
    ersetzen: '        edit: screen === \'planen\' && rechte.admin,',
  },
  // Hier stand `planen-planer-ohne-umbau` (MeetingSection, `darfUmbauen`). Seit
  // T121 Phase 5b gibt es Minuten, Reihenfolge und eigene Punkte nur noch
  // unter „Woche einrichten" — und die zieht dieselbe Grenze, bewacht von
  // `planen-aufseher-ohne-bearbeiten` und `planen-planer-ohne-bearbeiten-reiter`.
  {
    id: 'fs-planer-aendert-alles',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Zeit, Ort und Entfernen eines Treffpunkts für Admin und Planer — und den Aufseher seiner Gruppe.',
    suchen: '    rechte.zuteilen || (rechte.gruppe !== null && inst.grp === rechte.gruppe)\n',
    ersetzen: '    rechte.admin || (rechte.gruppe !== null && inst.grp === rechte.gruppe)\n',
  },
  {
    id: 'fs-grundplan-beim-planer',
    datei: 'src/planen/fs-bereiche.ts',
    regel: 'Den Grundplan sehen beim Planen Admin, Planer und Gruppenaufseher.',
    suchen: '  const grundplan = planen && (rechte.zuteilen || rechte.gruppe !== null)\n',
    ersetzen: '  const grundplan = planen && (rechte.admin || rechte.gruppe !== null)\n',
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
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Das Programmblatt zeigt Hilfsdienste platzweise bis zur eingestellten Zahl — kein Name rückt nach vorn oder über die Grenze.',
    suchen: '  return Array.from({ length: service.count }, (_unused, pos) => helpers[service.key]?.[pos])',
    ersetzen: '  return (helpers[service.key] ?? []).filter((slot) => slot.name).slice(0, service.count)',
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
    id: 'linkmail-adresse-kodiert',
    datei: 'src/personen/link-mail.ts',
    regel: 'Die Empfängeradresse wird kodiert — ein ? darin hängt sonst eigene Kopfzeilen an den Entwurf.',
    suchen: "  const an = encodeURIComponent(person.mail.trim()).replace(/%40/g, '@')",
    ersetzen: '  const an = person.mail.trim()',
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
    suchen: 'set search_path = public\nas $$\n  select btrim(p.fn',
    ersetzen: 'set search_path = public\nas $\n  select btrim(p.fn',
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
    regel: 'Eine Verhinderungs-Meldung geht nur an Admins und Planer (S3) — nicht an jeden Empfänger der Versammlung.',
    // Seit dem 24.9.2026 in `notify_planners`, nicht mehr in der Richtlinie.
    suchen: '     and (m.planner or m.zuteiler);',
    ersetzen: '     and true;',
  },
  {
    id: 'schema-nur-verhinderung-fuer-jeden',
    datei: 'supabase/schema.sql',
    regel: 'Über notify_planners meldet ein Verkündiger nur eine Verhinderung — Import und „Plan gesendet" bleiben Admins und Planern.',
    suchen: "  if kind <> 'verhindert' and not public.darf_zuteilen() then",
    ersetzen: '  if false then',
  },

  // ── „Plan senden" (T99) ───────────────────────────────────────────────────
  {
    id: 'plan-bestaetigte-nicht-erneut',
    datei: 'src/data/plan-versand.ts',
    regel: 'Wer bestätigt oder abgesagt hat, weiß Bescheid — er steht nicht mehr auf der Sendeliste.',
    suchen: '  return Boolean(confirmations[key]) || Boolean(sentLog[sentKey(key, name)])',
    ersetzen: '  return Boolean(sentLog[sentKey(key, name)])',
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
    datei: 'src/data/helpers.ts',
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
    suchen: '  if (istAusgefallen(nachher, teile.tab)) return false',
    ersetzen: '  if (false) return false',
  },
  {
    id: 'plan-entzug-klasse-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Wird die Zusätzliche Klasse abgeschaltet, bleiben ihre Namen absichtlich stehen — der Raum ist abwesend, nicht geleert.',
    suchen: "  if (teile.art === 'aux' || teile.art === 'ratgeber') return hatAuxKlasse(nachher[teile.tab])",
    ersetzen: '  if (false) return false',
  },
  {
    id: 'plan-entzug-braucht-zusage',
    datei: 'src/data/plan-versand.ts',
    /*
      Seit T101 wird nur Bekanntes überhaupt aufgenommen, statt alles
      aufzunehmen und später zu verwerfen. Damit steht die Regel an zwei
      Stellen — je eine für die beiden Datenquellen —, und beide brauchen
      ihren eigenen Eintrag: Fiele nur eine weg, meldete die andere weiter,
      und ein Eintrag über beide zusammen bliebe grün. Seit dem 15.10.2026
      zählt als bekannt auch, was gemeldet wurde.
    */
    regel:
      'Was weder zugesagt noch gemeldet ist, ist Entwurf — Umsortieren meldet nichts (Zusammenkünfte).',
    suchen: '    if (!betroffen(key, slot.name)) return',
    ersetzen: '    if (false) return',
  },
  {
    id: 'plan-entzug-braucht-zusage-treffpunkt',
    datei: 'src/data/plan-versand.ts',
    regel:
      'Dieselbe Regel für die zweite Datenquelle: ein Treffpunkt-Leiter, der nichts davon wusste, bekommt beim Wechseln nichts.',
    suchen: '    if (!betroffen(key, inst.leader)) continue',
    ersetzen: '    if (false) continue',
  },
  {
    id: 'sonderwoche-grund-gebuendelt',
    datei: 'src/app/persist.ts',
    regel: 'Der Grund einer Sonderwoche geht gebündelt hinaus — einmal, nicht je Tastenanschlag.',
    suchen: "  'setAbweichung',\n",
    ersetzen: '',
  },
  {
    id: 'termin-titel-gebuendelt',
    datei: 'src/app/persist.ts',
    regel: 'Titel und Ort eines weiteren Termins gehen gebündelt hinaus — einmal, nicht je Tastenanschlag.',
    suchen: "  'terminUpdate',\n]",
    ersetzen: ']',
  },
  {
    id: 's89-bogen-nicht-bei-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Fällt die Zusammenkunft aus, bietet der S-89-Bogen keine Zettel an — gehalten wird keine Aufgabe.',
    suchen: "  if (!week || istAusgefallen(week, 'mid')) return []\n  const out: S89Payload[] = []",
    ersetzen: '  if (!week) return []\n  const out: S89Payload[] = []',
  },
  {
    id: 'entzug-auch-gemeldete',
    datei: 'src/data/plan-versand.ts',
    regel: 'Auch wem der Platz nur gemeldet wurde, erfährt einen Entzug (15.10.2026) — nicht erst nach seiner Zusage.',
    suchen: "    conf[key] !== 'verhindert' && weissBescheid(conf, gemeldet, key, name)",
    ersetzen: "    conf[key] === 'bestätigt'",
  },
  {
    id: 'entzug-nicht-an-absager',
    datei: 'src/data/plan-versand.ts',
    regel: 'Wer abgesagt hat, hat den Platz selbst abgegeben — er bekommt keinen Entzug.',
    suchen: "    conf[key] !== 'verhindert' && weissBescheid(conf, gemeldet, key, name)",
    ersetzen: '    weissBescheid(conf, gemeldet, key, name)',
  },
  {
    id: 'entzug-raeumt-tagebuch',
    datei: 'src/app/reducer.ts',
    regel: 'Was ein Entzug nimmt, verschwindet auch aus dem Versand-Tagebuch des Zustands — wie in der Datenbank.',
    suchen: '  for (const k of tagebuch) delete sentLog[k]\n',
    ersetzen: '',
  },
  {
    id: 'entzug-raeumt-zusage',
    datei: 'src/app/reducer.ts',
    regel: 'Was ein Entzug nimmt, verliert auch seine Zusage — an einer Stelle für alle Wege (auch den Anlass).',
    suchen: '    confirmations: dropConfirmations(nachher.confirmations, weg.map((z) => z.key)),\n',
    ersetzen: '',
  },
  {
    id: 'platzname-person-ohne-uebersetzer',
    datei: 'src/i18n/useT.ts',
    regel: 'Ein Personenname am Platz geht nie durch den Übersetzer — sonst wird aus „Markus 2 Weber" auf Englisch „Mark 2 Weber".',
    suchen: '  return gruppe ? i18n.tu(name) : name\n',
    ersetzen: '  return i18n.tu(name)\n',
  },
  {
    id: 'platzname-gruppe-uebersetzt',
    datei: 'src/i18n/useT.ts',
    regel: 'Der Name einer Gruppe (Reinigung) steht am Platz in der Sprache des Lesers.',
    suchen: '  return gruppe ? i18n.tu(name) : name\n',
    ersetzen: '  return name\n',
  },
  {
    id: 'platzname-programm-am-dienst',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Im Programm entscheidet der Dienst, ob am Platz eine Gruppe steht — nicht jeder Name wird übersetzt.',
    suchen: '    .map((slot) => platzName(slot.name, Boolean(service.groups), i18n))',
    ersetzen: '    .map((slot) => platzName(slot.name, true, i18n))',
  },
  {
    id: 'platzname-planen-am-dienst',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Beim Planen entscheidet der Dienst, ob am Platz eine Gruppe steht — nicht jeder Name wird übersetzt.',
    suchen: '                name={platzName(name, gruppe, { tu })}',
    ersetzen: '                name={platzName(name, true, { tu })}',
  },
  {
    id: 'platzname-zuteilen-am-platz',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Im Zuteilen-Blatt steht der aktuelle Name nur bei einer Gruppe übersetzt da.',
    suchen: '          gruppe={sel.groups}\n',
    ersetzen: '          gruppe\n',
  },
  // ── Anmelden per Link (T121, Phase 8) ─────────────────────────────────────
  {
    id: 'anmelden-link-abgelaufen',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Ein abgelaufener Link meldet niemanden an.',
    suchen: "  if (!link) return json({ error: 'ungueltig' }, 404)\n  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)\n",
    ersetzen: "  if (!link) return json({ error: 'ungueltig' }, 404)\n",
  },
  {
    id: 'anmelden-code-abgelaufen',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Ein abgelaufener Code meldet niemanden an.',
    suchen: "  }\n  if (abgelaufen(link, jetzt)) return json({ error: 'abgelaufen' }, 410)\n  if (!pruefen)",
    ersetzen: '  }\n  if (!pruefen)',
  },
  {
    id: 'anmelden-raten-gebremst',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Nach zu vielen Fehlversuchen nimmt die Function keinen Code mehr an — auch keinen richtigen.',
    suchen: "  if (await gebremst(absender, jetzt)) return json({ error: 'zu-viele' }, 429)\n",
    ersetzen: '',
  },
  {
    id: 'anmelden-fehlversuch-gezaehlt',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Ein falscher Code zählt als Fehlversuch — sonst bremst die Bremse nie.',
    suchen: '    await fehlversuch(absender, jetzt)\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-mail-genau-die-adresse',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" schickt nur an Personen genau dieser Adresse — ein Unterstrich ist kein Platzhalter.',
    suchen: "  const muster = adresse.replace(/_/g, '\\\\_')\n",
    ersetzen: '  const muster = adresse\n',
  },
  {
    id: 'anmelden-mail-nur-hereingelassene',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" schickt nur an Personen mit Konto oder Link — den ersten Zugang gibt der Admin.',
    suchen: '    if (!link && !mitKonto.has(person.id)) continue\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-mail-pause',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Höchstens eine Mail in zehn Minuten je Person.',
    suchen: '    if (link?.gesendet_at && jetzt - new Date(link.gesendet_at).getTime() < MAIL_PAUSE) continue\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-mail-erst-nach-versand',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" ersetzt den alten Link erst, wenn die Mail hinausging — scheitert sie, gilt der Zettel weiter.',
    suchen: '    if (!(await mailSenden(MAIL, adresse, mail))) continue\n',
    ersetzen: '    await mailSenden(MAIL, adresse, mail)\n',
  },
  {
    id: 'anmelden-mail-pause-mit-link',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Der gesendete Link trägt gleich, wann er hinausging — daran hängt die Pause von zehn Minuten.',
    suchen: '{ jetzt: new Date(jetzt), gesendet: true }',
    ersetzen: '{ jetzt: new Date(jetzt), gesendet: false }',
  },
  // `anmelden-mail-zettel-bleibt` gestrichen (T121, Phase 10b): „Link senden"
  // stellt jetzt einen neuen Code aus, die Mail trägt ihn (Betreiber, 15.10.2026).
  {
    id: 'anmelden-mail-traegt-code',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" schickt den neuen Code mit — für die App vom Home-Bildschirm des iPhones.',
    suchen: '      code: codeAnzeige(neu.code),\n',
    ersetzen: "      code: '',\n",
  },
  {
    id: 'anmelden-rechte-aus-vormerkung',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Beim ersten Anmelden kommt das Admin-Recht aus der Vormerkung an der Person.',
    suchen: '    planner: Boolean(person.planner_vorgemerkt),\n',
    ersetzen: '    planner: false,\n',
  },
  {
    id: 'anmelden-einloesen-rueckweg',
    datei: 'supabase/functions/_shared/konto-admin.ts',
    regel: 'Lösen neuere Fassungen von Auth den Link nur als „email" ein, greift der Rückweg.',
    suchen: "      return (await einloesen(hash, 'magiclink')) ?? (await einloesen(hash, 'email'))",
    ersetzen: "      return await einloesen(hash, 'magiclink')",
  },
  {
    id: 'send-invite-erst-wer-fragt',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Ohne Anmeldung kein Link — und kein Wort über den Versand.',
    suchen: "    if (!userId) return json({ error: 'unauthorized' }, 401)\n",
    ersetzen: '',
  },
  {
    id: 'anmelde-code-alphabet',
    datei: 'supabase/functions/_shared/anmeldung.ts',
    regel: 'Ein getippter Code wird gelesen wie gespeichert: groß, ohne Strich.',
    suchen: '    .filter((z) => ALPHABET.includes(z))\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-link-beim-oeffnen',
    datei: 'src/app/store.tsx',
    regel: 'Der Link aus der E-Mail meldet beim Öffnen der App an.',
    // Seit dem Offline-Start (19.10.2026) einmal oben im Effekt gelesen: Auch der Vorgriff fragt danach.
    suchen: '    const token = anmeldeAdresse().token\n',
    ersetzen: '    const token = null\n',
  },
  {
    id: 'anmelden-link-grund-gesagt',
    datei: 'src/app/store.tsx',
    regel: 'Gilt der Link nicht mehr, steht der Grund da.',
    suchen: "        dispatch({ type: 'showToast', text: anmeldeFehlerText(fehler, dict(stateRef.current.lang), 'link') })\n",
    ersetzen: '',
  },
  {
    id: 'anmelden-link-laedt-einmal',
    datei: 'src/app/store.tsx',
    regel: 'Nach dem Link lädt die App über das Ereignis von Supabase — nicht noch einmal über die alte Sitzung.',
    suchen: "          dispatch({ type: 'login', welcome: true })\n          return\n",
    ersetzen: "          dispatch({ type: 'login', welcome: true })\n",
  },
  {
    id: 'anmelden-sitzung-uebernommen',
    datei: 'src/lib/anmelden.ts',
    regel: 'Angemeldet ist erst, wessen Sitzung Supabase übernommen hat.',
    suchen: '  const { error } = await supabase.auth.setSession({ access_token: sitzung.access_token, refresh_token: sitzung.refresh_token })\n',
    ersetzen: '  const error = null\n',
  },
  {
    id: 'anmelden-code-erst-pruefen',
    datei: 'src/lib/anmelden.ts',
    regel: 'Das Prüfen eines Codes sagt nur, wem er gehört — ohne Sitzung.',
    suchen: "  const r = await rufen({ aktion: 'code', code, pruefen: true })\n",
    ersetzen: "  const r = await rufen({ aktion: 'code', code })\n",
  },
  {
    id: 'anmelden-link-in-seitensprache',
    datei: 'src/login/LoginScreen.tsx',
    regel: '„Link senden" schickt die Mail in der Sprache der Anmeldeseite.',
    suchen: '    const ergebnis = await linkAnfordern(adresse, state.lang)\n',
    ersetzen: "    const ergebnis = await linkAnfordern(adresse, 'de')\n",
  },
  {
    id: 'anmelden-ohne-db-nachgestellt',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Ohne Datenbank meldet „Link senden" gleich an, ohne Netzaufruf.',
    suchen: '    if (!isSupabaseConfigured) {\n      onNachgestellt()\n      return\n    }\n',
    ersetzen: '',
  },
  {
    id: 'anmelden-code-verbraucht',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Angemeldet ist der Code aus der Adresse verbraucht — nach dem Abmelden steht er nicht wieder im Feld.',
    suchen: '    anmeldeCodeVerbraucht()\n    onAngemeldet()\n',
    ersetzen: '    onAngemeldet()\n',
  },
  {
    id: 'anmelden-code-verworfen',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Nach „Zurück" ist der Code aus der Adresse verworfen.',
    suchen: "              anmeldeCodeVerbraucht()\n              setAnsicht({ art: 'start' })\n",
    ersetzen: "              setAnsicht({ art: 'start' })\n",
  },
  {
    id: 'scannen-nur-mit-kamera',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Ohne Kamera-Schnittstelle kein „Zettel scannen".',
    suchen: '  const scannen = !useMedia(DESKTOP_BREITE) && kameraMoeglich()\n',
    ersetzen: '  const scannen = !useMedia(DESKTOP_BREITE)\n',
  },
  {
    id: 'scannen-nicht-am-desktop',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Am Desktop kein „Zettel scannen" — dort tippt man den Code.',
    suchen: '  const scannen = !useMedia(DESKTOP_BREITE) && kameraMoeglich()\n',
    ersetzen: '  useMedia(DESKTOP_BREITE)\n  const scannen = kameraMoeglich()\n',
  },
  {
    id: 'scannen-hinweis-passt',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Ohne Scanner nennt der Hinweis nur das Eintippen.',
    suchen: '{scannen ? t.ohneMailHinweis : t.ohneMailHinweisTippen}',
    ersetzen: '{t.ohneMailHinweis}',
  },
  {
    id: 'scanner-meldet-einmal',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Der Scanner meldet den ersten Fund genau einmal und liest dann nicht weiter.',
    suchen: '          gefunden.current(text)\n          return\n',
    ersetzen: '          gefunden.current(text)\n',
  },
  {
    id: 'scanner-kamera-aus',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Verschwindet der Scanner, geht die Kamera aus.',
    suchen: '      clearTimeout(wecker)\n      strom?.getTracks().forEach((spur) => spur.stop())\n',
    ersetzen: '      clearTimeout(wecker)\n',
  },
  {
    id: 'scanner-kamera-aus-zu-spaet',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Geht die Kamera erst auf, als der Scanner schon weg ist, wird sie gleich wieder ausgeschaltet.',
    suchen: '      if (aus || !video) {\n        strom.getTracks().forEach((spur) => spur.stop())\n        return\n      }\n',
    ersetzen: '      if (aus || !video) return\n',
  },
  {
    id: 'scanner-kamera-fehlt',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Geht die Kamera nicht auf, sagt der Scanner es.',
    suchen: '      } catch {\n        if (!aus) setKameraFehlt(true)\n',
    ersetzen: '      } catch {\n',
  },
  {
    id: 'send-invite-ohne-versand-nichts',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Kann der Server nicht senden, stellt er auf „senden" hin nichts aus — sonst verfielen die alten Links still.',
    suchen: '    if (senden && !bereit) return json({ links: [], mailBereit: false })\n',
    ersetzen: '',
  },
  {
    id: 'links-in-teilen',
    datei: 'src/lib/links-ausstellen.ts',
    regel: 'Viele Personen gehen in Teilen hinaus — die Function liefe sonst an ihre Zeitgrenze.',
    suchen: 'const JE_AUFRUF = 40\n',
    ersetzen: 'const JE_AUFRUF = 1000\n',
  },
  {
    id: 'links-ohne-versand-aufhoeren',
    datei: 'src/lib/links-ausstellen.ts',
    regel: 'Kann der Server nicht senden, fragt die App nicht Teil für Teil weiter.',
    suchen: '    if (senden && !ergebnis.mailBereit) break\n',
    ersetzen: '',
  },
  {
    id: 'links-fehler-behaelt-ausgestellte',
    datei: 'src/lib/links-ausstellen.ts',
    regel: 'Scheitert ein Teil, bleiben die schon ausgestellten Links — sonst wüsste der Zustand nichts von ihnen.',
    suchen: '      return { ...ergebnis, fehler: true }\n',
    ersetzen: '      return { links: [], mailBereit: ergebnis.mailBereit, fehler: true }\n',
  },
  {
    id: 'link-ersetzt-alten-im-zustand',
    datei: 'src/app/reducer.ts',
    regel: 'Ein neuer Link ersetzt im Zustand den alten derselben Person.',
    suchen: '      return { ...state, anmeldeLinks: [...state.anmeldeLinks.filter((l) => !neu.has(l.personId)), ...action.links] }\n',
    ersetzen: '      return { ...state, anmeldeLinks: [...state.anmeldeLinks, ...action.links] }\n',
  },
  {
    id: 'konto-weg-link-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Mit dem Konto geht der Link der Person aus dem Zustand.',
    suchen: '        anmeldeLinks: personId ? state.anmeldeLinks.filter((l) => l.personId !== personId) : state.anmeldeLinks,\n',
    ersetzen: '',
  },
  {
    id: 'konto-weg-link-weg-db',
    datei: 'src/app/persist.ts',
    regel: 'Mit dem Konto löscht die App den Link der Person — sonst käme sie mit ihm gleich wieder herein.',
    suchen: '      if (personId) deleteAnmeldeLink(personId)\n',
    ersetzen: '',
  },
  {
    id: 'person-weg-link-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Mit der Person geht ihr Link aus dem Zustand (wie in der Datenbank: on delete cascade).',
    suchen: '    anmeldeLinks: state.anmeldeLinks.filter((l) => l.personId !== id),\n',
    ersetzen: '',
  },
  {
    id: 'links-laden-ausdruecklich',
    datei: 'src/lib/data.ts',
    regel: 'Die Links kommen mit ausdrücklichen Spalten — die Prüfsummen darf die App nicht lesen.',
    suchen: "const ANMELDE_LINK_SPALTEN = 'person_id, gueltig_bis, erstellt_at, gesendet_at, benutzt_at'",
    ersetzen: "const ANMELDE_LINK_SPALTEN = '*'",
  },
  {
    id: 'links-laden-nicht-fatal',
    datei: 'src/lib/data.ts',
    regel: 'Scheitern die Links, lädt die App trotzdem.',
    suchen: '  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, fsRulesRows, fsWeeksRows]\n',
    ersetzen: '  const firstErr = [cong, persons, services, groups, weeks, absences, notifs, confs, members, linkRows, fsRulesRows, fsWeeksRows]\n',
  },
  {
    id: 'link-abgelaufen-wie-keiner',
    datei: 'src/personen/person-lage.ts',
    regel: 'Ein abgelaufener Link zählt wie keiner.',
    suchen: '  return link.gueltigBis > heute\n',
    ersetzen: '  return true\n',
  },
  {
    id: 'link-senden-mailprogramm',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Kann der Server nicht senden, öffnet sich dieselbe E-Mail im eigenen Mail-Programm.',
    suchen: '        r = await ausstellen([person.id], false)\n',
    ersetzen: '',
  },
  // Per Nachricht (24.10.2026): Link und Code über das Teilen des Geräts oder kopiert.
  {
    id: 'nachricht-derselbe-text',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Ein zweiter Tipp auf „Teilen" teilt denselben Text — ein neuer Link ersetzte den eben geteilten.',
    suchen: '    if (nachricht) return nachricht\n',
    ersetzen: '',
  },
  {
    id: 'nachricht-nach-neuem-link-ungueltig',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Ein neuer Link per E-Mail macht den Text der Nachricht ungültig — „Teilen" stellt danach neu aus.',
    suchen: '      setNachricht(null)\n',
    ersetzen: '',
  },
  {
    id: 'nachricht-hinweis-persoenlicher-chat',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Neben „Teilen" steht, dass der Text nur in den persönlichen Chat gehört — er meldet an.',
    suchen: '          <p className="klein-text">{fill(t.perNachrichtHint, { name })}</p>\n',
    ersetzen: '',
  },
  {
    id: 'nachricht-abbruch-still',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Bricht man das Teilen ab, kommt keine Meldung.',
    suchen: "        if (!(fehler instanceof DOMException && fehler.name === 'AbortError')) dispatch({ type: 'showToast', text: t.nochmalTippen })\n",
    ersetzen: "        dispatch({ type: 'showToast', text: t.nochmalTippen })\n",
  },
  {
    id: 'nachricht-eigener-text',
    datei: 'src/personen/link-mail.ts',
    regel: 'Die Nachricht ist nicht die E-Mail: ohne „Du bekommst diese E-Mail" und ohne „Link senden", den Ältesten statt dessen.',
    suchen: '.split(ABSATZ).slice(0, -NUR_IN_DER_MAIL), d.linkNachrichtSchluss]',
    ersetzen: '.split(ABSATZ)]',
  },
  {
    id: 'nachricht-sprache-nachgeladen',
    datei: 'src/personen/link-mail.ts',
    regel: 'Die Nachricht steht in der Sprache der Versammlung — ihr Wörterbuch lädt die App dafür nach.',
    suchen: "import('../../supabase/functions/_shared/anmelde-mail.ts'), loadOverlay(lang)])",
    ersetzen: "import('../../supabase/functions/_shared/anmelde-mail.ts')])",
  },
  // Review 24.10.2026: erst die Texte, dann der Link — und der Zettel nicht dazwischen.
  {
    id: 'nachricht-texte-vor-dem-link',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Fehlt nach einem Deploy der Teil mit den Texten, stellt „Teilen" keinen Link aus — er ersetzte den alten, ohne dass jemand ihn bekommt.',
    suchen: '    if (!(await texteGeladen())) return null\n',
    ersetzen: '',
  },
  {
    id: 'mail-entwurf-texte-vor-dem-link',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Fehlt nach einem Deploy der Teil mit dem Entwurf, stellt der Rückfall der E-Mail keinen Link aus.',
    suchen: '        if (!(await texteGeladen())) return\n',
    ersetzen: '',
  },
  {
    id: 'nachricht-kopieren-gescheitert',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Scheitert das Kopieren, heißt es nicht „Kopiert" — in der Zwischenablage steht noch, was vorher darin war.',
    suchen: 'if (!(await copyText(n.text))) {',
    ersetzen: 'if (!(await copyText(n.text)) && false) {',
  },
  {
    id: 'zettel-nicht-waehrend-link',
    datei: 'src/personen/LinkSendenBlatt.tsx',
    regel: 'Während ein Link entsteht, druckt „Zettel drucken" nicht — sein Link ersetzte den eben geteilten.',
    suchen: 'onClick={laeuft ? undefined : onZettel}',
    ersetzen: 'onClick={onZettel}',
  },
  {
    id: 'links-ausstellen-offline',
    datei: 'src/personen/useLinksAusstellen.ts',
    regel: 'Offline stellt die App keine Links aus — weder per E-Mail noch für Zettel.',
    suchen: "    if (state.staleAt) {\n      dispatch({ type: 'showToast', text: t.offlineReadOnly })\n      return null\n    }\n",
    ersetzen: '',
  },
  {
    id: 'links-ausstellen-in-den-zustand',
    datei: 'src/personen/useLinksAusstellen.ts',
    regel: 'Was ausgestellt wurde, steht gleich im Zustand — sonst zeigte die Liste weiter „Ohne Link".',
    suchen: "    if (r.links.length > 0) dispatch({ type: 'linksAusgestellt', links: r.links.map((l) => alsAnmeldeLink(l, new Date())) })\n",
    ersetzen: '',
  },
  {
    id: 'zettel-ohne-versand',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: '„Zettel drucken" stellt Links ohne Versand aus.',
    suchen: '        personen.map((p) => p.id),\n        false,\n',
    ersetzen: '        personen.map((p) => p.id),\n        true,\n',
  },
  {
    id: 'zettel-bogen-weg-nach-druck',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: 'Nach dem Druckdialog verschwindet der Bogen — die Codes darauf melden an.',
    suchen: '      delete document.documentElement.dataset.print\n      setSatz(null)\n',
    ersetzen: '      delete document.documentElement.dataset.print\n',
  },
  {
    id: 'zettel-druck-eigener',
    datei: 'src/personen/useZettelDruck.tsx',
    regel: 'Nach dem Druck räumt jede Stelle ihren eigenen Bogen ab — auch wenn eine zweite zuerst auf „afterprint" hört.',
    suchen: '      if (!meiner.current) return\n      meiner.current = false\n',
    ersetzen: '      if (document.documentElement.dataset.print !== DRUCK) return\n',
  },
  {
    id: 'links-senden-nur-mit-adresse',
    datei: 'src/personen/LinksSendenBlatt.tsx',
    regel: '„Links senden" schickt nur an die mit Adresse — die übrigen bekommen den Zettel.',
    suchen: '  const perMail = personen.filter((p) => p.mail.trim())\n',
    ersetzen: '  const perMail = personen\n',
  },
  {
    id: 'links-senden-nicht-bereit',
    datei: 'src/personen/LinksSendenBlatt.tsx',
    regel: 'Kann die App nicht senden, sagt „Links senden" es.',
    suchen: "      if (!r.fehler && !r.mailBereit) {\n        dispatch({ type: 'showToast', text: t.mailNichtBereit })\n        return\n      }\n",
    ersetzen: '',
  },
  // `token-erneuern-neuer-code` gestrichen (T121, Phase 10b): `tokenErneuern`
  // ist fort, „Link senden" stellt immer einen neuen Code aus. Dass ein alter
  // Zettel danach nicht mehr anmeldet, prüft `_test/anmelden.test.ts` weiter.
  {
    id: 'anmelden-wettlauf-erste-anmeldung',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Zwei erste Anmeldungen zugleich: Auch die zweite ist angemeldet.',
    suchen: '  return (await kontoIdDer(person.id, congregationId)) === konto.id ? { email: konto.email } : null\n',
    ersetzen: '  return null\n',
  },
  {
    id: 'anmelden-mail-antwort-sofort',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" antwortet, bevor gesucht und gesendet wird — die Dauer verrät nicht, ob es die Adresse gibt.',
    suchen: "  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(arbeit)\n  else await arbeit\n",
    ersetzen: '  await arbeit\n',
  },
  {
    id: 'anmelden-mail-fehler-still',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: 'Scheitert „Link senden" im Hintergrund, bleibt die Antwort dieselbe — der Fehler geht nur in die Logs.',
    suchen: "  const arbeit = linksPerMail(adresse, typeof lang === 'string' ? lang : null, jetzt).catch((err: unknown) => {\n    console.error('anmelden (mail):', err instanceof Error ? err.message : String(err))\n  })\n",
    ersetzen: "  const arbeit = linksPerMail(adresse, typeof lang === 'string' ? lang : null, jetzt)\n",
  },
  {
    id: 'scanner-leser-fehlt',
    datei: 'src/login/ZettelScanner.tsx',
    regel: 'Lädt der Leser nicht, geht die Kamera aus, und der Scanner sagt es.',
    suchen: '      const lesen = await leserFuer().catch(() => null)\n      if (!lesen) {\n        strom.getTracks().forEach((spur) => spur.stop())\n        if (!aus) setKameraFehlt(true)\n        return\n      }\n',
    ersetzen: '      const lesen = await leserFuer()\n',
  },
  {
    id: 'scannen-ueberschrift',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Auch beim Scannen hat die Seite ihre Überschrift.',
    suchen: '            <h1 className="seitentitel seitentitel--gross login-titel">{t.zettelScannen}</h1>\n',
    ersetzen: '',
  },
  {
    id: 'bogen-verteilen-abstand',
    datei: 'src/druck/verteilen.ts',
    regel: 'Beim Verteilen auf Blätter zählt der Abstand zwischen zwei Blöcken mit.',
    suchen: '    const mitAbstand = aktuell ? belegt + (anschluss[i] ? 0 : abstand) + hoehe : hoehe\n',
    ersetzen: '    const mitAbstand = aktuell ? belegt + hoehe : hoehe\n',
  },
  {
    id: 'bogen-verteilen-anschluss',
    datei: 'src/druck/verteilen.ts',
    regel: 'Die nächste Zeile einer Tabelle schließt ohne Abstand an — so passen mehr aufs Blatt.',
    suchen: '    const mitAbstand = aktuell ? belegt + (anschluss[i] ? 0 : abstand) + hoehe : hoehe\n',
    ersetzen: '    const mitAbstand = aktuell ? belegt + abstand + hoehe : hoehe\n',
  },
  {
    id: 'bogen-reicht-anschluss-weiter',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Der Bogen sagt beim Verteilen, welche Blöcke als Tabellenzeilen anschließen.',
    suchen: '    const anschluss = bloecke.map((block) => block.anschluss === true)\n',
    ersetzen: '    const anschluss = bloecke.map(() => false)\n',
  },
  {
    id: 'bogen-anschluss-klasse',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Eine anschließende Tabellenzeile trägt ihre Klasse — sonst stünde der Abstand der Blöcke zwischen den Zeilen.',
    suchen: "  return <div className={block.anschluss ? 'druck-block druck-block--anschluss' : 'druck-block'}>{block.inhalt}</div>\n",
    ersetzen: "  return <div className=\"druck-block\">{block.inhalt}</div>\n",
  },
  {
    id: 'tabellen-bloecke-zeilenweise',
    datei: 'src/druck/tabellen-bloecke.tsx',
    regel: 'Eine lange Tabelle geht Zeile für Zeile auf die Blätter — nicht als ein Block, der über den Rand läuft.',
    suchen: '          <DruckTabelle {...form} zeilen={[erste]} />\n',
    ersetzen: '          <DruckTabelle {...form} zeilen={zeilen} />\n',
  },
  {
    id: 'tabellen-bloecke-anschluss',
    datei: 'src/druck/tabellen-bloecke.tsx',
    regel: 'Die Zeilen nach der ersten schließen an — ohne Abstand dazwischen.',
    suchen: '      anschluss: true,\n',
    ersetzen: '',
  },
  {
    id: 'tabellen-bloecke-ohne-zeilen',
    datei: 'src/druck/tabellen-bloecke.tsx',
    regel: 'Eine Tabelle ohne Zeilen steht gar nicht da — auch nicht ihr Kopf.',
    suchen: '  if (!erste) return []\n',
    ersetzen: '',
  },
  {
    id: 'plan-bogen-alle-spannen',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Der Bogen eines Plans nennt jede Woche seines Zeitraums — auch eine ohne Eintrag.',
    suchen: '  const zeilen = planSpannen(plan).map((spanne) => {\n',
    ersetzen: '  const zeilen = [...gruppeVon.keys()].map((spanne) => {\n',
  },
  {
    id: 'plan-bogen-offen',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Eine Woche ohne Gruppe steht auf dem Plan-Bogen gepunktet da.',
    suchen: '  const gruppe = (grp: string | null) => gruppenName(grp, state.groups, tu) || <Offen breite={110} />\n',
    ersetzen: '  const gruppe = (grp: string | null) => gruppenName(grp, state.groups, tu)\n',
  },
  {
    id: 'plan-bogen-aufseher',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Neben der Gruppe steht ihr Gruppenaufseher.',
    suchen: '  const aufseher = (grp: string | null) => nameVon(state.persons, state.groups.find((g) => g.id === grp)?.overseerId ?? null)\n',
    ersetzen: "  const aufseher = (_grp: string | null) => ''\n",
  },
  {
    id: 'plan-bogen-monatstakt',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Im Monatstakt spricht der Plan-Bogen von Monaten — Satz und Spaltenkopf.',
    suchen: "  const monatlich = taktVon(plan) === 'monat'\n",
    ersetzen: '  const monatlich = false\n',
  },
  {
    id: 'plan-bogen-gruppe-fett',
    datei: 'src/druck/PlanBogen.tsx',
    regel: 'Fett steht auf dem Plan-Bogen die Gruppe, die dran ist — nicht ihr Aufseher.',
    suchen: '    betont: 1,\n',
    ersetzen: '',
  },
  {
    id: 'plan-bearbeiten-drucken-handy',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Am Handy steht Drucken vorn in der Leiste von „Plan bearbeiten".',
    suchen: '          <button type="button" className="aktion-neben" onClick={planDrucken}>\n',
    ersetzen: '          <button type="button" className="aktion-neben">\n',
  },
  {
    id: 'plan-bearbeiten-drucken-tablet',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ab dem Tablet steht Drucken neben dem Titel von „Plan bearbeiten".',
    suchen: '          {breit && laeuft && <DruckKnopf mitText onClick={planDrucken} />}\n',
    ersetzen: '',
  },
  {
    id: 'bogen-verteilen-ueberlang',
    datei: 'src/druck/verteilen.ts',
    regel: 'Ein Block, höher als ein Blatt, läuft weiter, statt abgeschnitten zu werden.',
    suchen: '    aktuell = { indizes: [i], ueberlang: hoehe > platz }\n',
    ersetzen: '    aktuell = { indizes: [i], ueberlang: false }\n',
  },
  {
    id: 'bogen-misst-kopf-und-fuss',
    datei: 'src/druck/Bogen.tsx',
    regel: 'Der Platz je Blatt ist, was zwischen Kopf und Fuß bleibt — gemessen, nicht das ganze Blatt.',
    suchen: '    setBlaetter(blaetterVerteilen(hoehen, BLATT_HOEHE - rand - kopf - fuss - 2 * abstand, abstand, anschluss))\n',
    ersetzen: '    setBlaetter(blaetterVerteilen(hoehen, BLATT_HOEHE - rand - 2 * abstand, abstand, anschluss))\n',
  },
  {
    id: 'druck-bogen-erst-zeichnen',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Der Bogen steht im DOM, bevor der Druckdialog das Blatt aufnimmt.',
    suchen: '    flushSync(() => setDruck((vorher) => ({ nr: (vorher?.nr ?? 0) + 1, inhalt })))\n',
    ersetzen: '    setDruck((vorher) => ({ nr: (vorher?.nr ?? 0) + 1, inhalt }))\n',
  },
  {
    id: 'druck-bogen-nur-eigener',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Nach dem Druckdialog räumt nur ab, wer gedruckt hat — ein fremdes Kennzeichen bleibt.',
    suchen: '      if (!meiner.current) return\n',
    ersetzen: '',
  },
  {
    id: 'druck-bogen-neu-je-druck',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Jeder Druck zeichnet den Bogen neu — auch wenn der vorige mangels „afterprint" noch dasteht.',
    suchen: '          <div key={druck.nr} className="druck-bogen"',
    ersetzen: '          <div className="druck-bogen"',
  },
  {
    id: 'druck-bogen-kennzeichen',
    datei: 'src/druck/useDruckBogen.tsx',
    regel: 'Gedruckt wird unter dem Kennzeichen „bogen" — auch wenn ein abgebrochener Druck ein anderes stehen ließ.',
    suchen: '    document.documentElement.dataset.print = BOGEN\n',
    ersetzen: '',
  },
  {
    id: 'druck-personen-offen',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Ein freier Platz steht auf dem Bogen gepunktet da, zum Eintragen von Hand.',
    suchen: '            ) : (\n              <Offen />\n            )}\n',
    ersetzen: '            ) : null}\n',
  },
  {
    id: 'druck-namen-knapp-ganz-frei',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Auf dem Monatsbogen ist ein Punkt frei, sobald einer seiner Plätze fehlt — eine halbe Besetzung ist keine.',
    suchen: '  if (slots.some((slot) => !slot.name)) return <Offen breite={84} />\n',
    ersetzen: '',
  },
  {
    id: 'druck-namen-knapp-partner',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Schüler und Partner stehen auf dem Monatsbogen als „A mit B".',
    suchen: "  if (rest.length === 1 && rest[0]?.bereichsKey === 'schulungPartner')\n    return <>{fill(t.druckMit, { a: erster?.name ?? '', b: rest[0].name })}</>\n",
    ersetzen: '',
  },
  {
    id: 'druck-namen-knapp-partner-am-platz',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Der Partner auf dem Monatsbogen ist der Platz „schulungPartner" — nicht das Rollenwort.',
    suchen: "  if (rest.length === 1 && rest[0]?.bereichsKey === 'schulungPartner')\n",
    ersetzen: "  if (rest.length === 1 && rest[0]?.rolle === 'Partner')\n",
  },
  {
    id: 'treffpunkt-anders-tag',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Steht ein Treffpunkt an einem anderen Tag als im Grundplan, nennt „statt" den Tag des Grundplans.',
    suchen: "    [regel.wd !== inst.wd ? tagText(kennung, regel.wd) : '', regel.time, tu(regel.place).trim()].filter(Boolean).join(' · ')\n",
    ersetzen: "    [regel.time, tu(regel.place).trim()].filter(Boolean).join(' · ')\n",
  },
  {
    id: 'druck-hilfsdienste-platzzahl',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Die Hilfsdienste auf dem Bogen füllen bis zur Platzzahl auf — ein freier Platz steht gepunktet da.',
    suchen: '            const plaetze = plaetzeVon(week[key].helpers, service)\n',
    ersetzen: '            const plaetze = week[key].helpers[service.key] ?? []\n',
  },
  {
    id: 'druck-ausfall-grund',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Fällt ein Tag aus, steht auf dem Wochenbogen der Grund statt des Programms.',
    suchen: '  const ausgefallen = istAusgefallen(rawWeek, tab)\n  return (\n    <section className="druck-spalte">\n',
    ersetzen: '  const ausgefallen = false\n  return (\n    <section className="druck-spalte">\n',
  },
  {
    id: 'druck-woche-beide-tage',
    datei: 'src/druck/ZusammenkunftBogen.tsx',
    regel: 'Der Wochenbogen trägt beide Zusammenkünfte auf einem Blatt.',
    suchen: '        <TagVoll tab="we" {...tag} />\n',
    ersetzen: '',
  },
  {
    id: 'druck-kongress-satz',
    datei: 'src/druck/ZusammenkunftBogen.tsx',
    regel: 'Die Kongresswoche steht auf dem Monatsbogen mit einem Satz da, nicht mit leerem Programm.',
    suchen: "      {art === 'kongress' ? (\n",
    ersetzen: '      {false ? (\n',
  },
  {
    id: 'druck-zeitraum-mit-jahr',
    datei: 'src/programm/druck.ts',
    regel: 'Der Wochenbogen nennt die Woche samt Jahr in der Sprache des Lesers.',
    suchen: "  return tageSpanne(week.start, tagNach(week.start, 6), lang, 'tagMonatJahr')\n",
    ersetzen: '  return ersatz\n',
  },
  {
    id: 'druck-kopf-versammlung',
    datei: 'src/druck/DruckBlatt.tsx',
    regel: 'Der Kopf jedes Blatts nennt „Versammlung <Name>".',
    suchen: '          <span className="druck-versammlung">{fill(t.congLabel, { name: state.congregation.name })}</span>\n',
    ersetzen: '          <span className="druck-versammlung">{state.congregation.name}</span>\n',
  },
  {
    id: 'druckwahl-wochenbogen',
    datei: 'src/programm/DruckWahl.tsx',
    regel: '„Diese Woche" druckt bei den Zusammenkünften den Wochenbogen, nicht den Bildschirm.',
    suchen: '        <WochenBogen wi={wi} />\n',
    ersetzen: "        <MonatsBogen monat={monat ?? ''} />\n",
  },
  {
    id: 'versammlung-holen-mehrere',
    datei: 'scripts/gemeinsam.mjs',
    regel: 'Ohne --cong gilt die einzige Versammlung — gibt es mehrere, bricht das Skript ab, statt eine zu raten.',
    suchen: '  if (zeilen.length > 1) {\n',
    ersetzen: '  if (false) {\n',
  },
  {
    id: 'zuruecksetzen-konto-ueber-id',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Das Zurücksetzen verknüpft Konten über die Konto-Id — Konten ohne Adresse zeigten sonst alle auf dieselbe Person.',
    suchen: '    const konto = v.userId ? `user_id=eq.${encodeURIComponent(v.userId)}` : `email=eq.${encodeURIComponent(v.email)}`\n',
    ersetzen: '    const konto = `email=eq.${encodeURIComponent(v.email)}`\n',
  },
  {
    id: 'zuruecksetzen-links-zurueck',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Ausgegebene Anmelde-Links überstehen das Zurücksetzen — an der neuen Person, mit denselben Prüfsummen.',
    suchen: "    await rest('anmelde_links', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(linkZeilen) })\n",
    ersetzen: '',
  },
  {
    id: 'anlegen-erster-admin-link',
    datei: 'scripts/versammlung-anlegen.mjs',
    regel: 'Eine neue Versammlung gibt ihrem ersten Admin einen Anmelde-Link.',
    suchen: '  const link = await anmeldeLinkAusstellen(roh, planer.id, cong.id)\n',
    ersetzen: "  const link = { url: '', code: '', zettelUrl: '', gueltigBis: new Date().toISOString() }\n",
  },
  {
    id: 'zugang-genau-eine-person',
    datei: 'scripts/zugang-ausstellen.mjs',
    regel: 'Der Notzugang stellt nur aus, wenn der Name genau eine Person trifft — er rät nicht.',
    suchen: '  if (treffer.length === 1) return treffer[0]\n',
    ersetzen: '  if (treffer.length >= 1) return treffer[0]\n',
  },
  {
    id: 'qr-pfad-laeufe',
    datei: 'src/personen/zettel-satz.ts',
    regel: 'Der QR-Code des Zettels trägt genau die Module von uqr — ein Lauf ist so breit, wie er ist.',
    suchen: '      pfad += `M${von} ${y}h${x - von + 1}v1h-${x - von + 1}z`\n',
    ersetzen: '      pfad += `M${von} ${y}h1v1h-1z`\n',
  },
  {
    id: 'laden-wartet-auf-schreiben',
    datei: 'src/app/hydrate.ts',
    regel: 'Das Nachladen liest erst, wenn angekommen ist, was schon hinausging — sonst überholt die Abfrage es.',
    suchen: '  await schreibenAbwarten()\n  const vorher = schreibStand()\n',
    ersetzen: '  const vorher = schreibStand()\n',
  },
  {
    id: 'laden-holt-nach',
    datei: 'src/app/hydrate.ts',
    regel: 'Ging während des Ladens etwas hinaus, wird still noch einmal geladen — sonst stand eine eben gegebene Zusage wieder offen da.',
    suchen: '    return schreibStand() !== vorher\n',
    ersetzen: '    return false\n',
  },
  {
    id: 'schreiben-nur-aenderndes',
    datei: 'src/lib/schreiben-unterwegs.ts',
    regel: 'Lesen (GET) zählt nicht als Schreiben — sonst lüde jedes Nachladen ein zweites Mal.',
    suchen: "  if (methode === 'GET' || methode === 'HEAD') return false\n",
    ersetzen: "  if (methode === 'HEAD') return false\n",
  },
  {
    id: 'schreiben-ohne-anmeldung',
    datei: 'src/lib/schreiben-unterwegs.ts',
    regel: 'Die Anmeldung und das Erneuern ihres Tokens zählen nicht als Schreiben.',
    suchen: "  return !adresseVon(input).includes('/auth/v1/')\n",
    ersetzen: '  return true\n',
  },
  {
    id: 'client-zaehlt-mit',
    datei: 'src/lib/supabase.ts',
    regel: 'Der Supabase-Client schickt seinen fetch über den Zähler — sonst weiß das Nachladen nichts vom Schreiben.',
    // Seit dem 19.10.2026 steht davor der Speicherschlüssel der Sitzung (eigener Eintrag).
    suchen: ', global: { fetch: verfolgterFetch() } })',
    ersetzen: ' })',
  },
  {
    id: 'sitzung-schluessel-ausdruecklich',
    datei: 'src/lib/supabase.ts',
    regel: 'Der Client legt die Sitzung unter dem Schlüssel ab, den der Provider beim Start liest — sonst greift der Offline-Start ins Leere.',
    suchen: '{ auth: { storageKey: SITZUNG_SCHLUESSEL }, global:',
    ersetzen: '{ global:',
  },
  {
    id: 'gelesen-bleibt-beim-oeffnen',
    datei: 'src/app/reducer.ts',
    regel: 'Eine Antwort, abgefragt vor dem eigenen gelesen, macht beim Öffnen der Mitteilungen nichts wieder ungelesen.',
    suchen: '      return { ...state, notifs: gelesenBehalten(action.notifs, state.notifs) }\n',
    ersetzen: '      return { ...state, notifs: action.notifs }\n',
  },
  {
    id: 'gelesen-bleibt-beim-nachladen',
    datei: 'src/app/reducer.ts',
    regel: 'Ein stilles Nachladen macht eine eben gelesene Mitteilung nicht wieder neu.',
    suchen: '        notifs: gelesenBehalten(p.notifications, state.notifs),\n',
    ersetzen: '        notifs: p.notifications,\n',
  },
  {
    id: 'start-ort-uebersetzt',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Auf dem Start steht der Ort eines Treffpunkts in der Sprache des Lesers — wie im Programm.',
    suchen: '    return termin.inst.place ? `${titel} · ${i18n.tu(termin.inst.place)}` : titel\n',
    ersetzen: '    return termin.inst.place ? `${titel} · ${termin.inst.place}` : titel\n',
  },
  {
    id: 'buch-regel-versalien',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Den Kopf der Bibellese schreibt jw.org in Versalien (JEREMIA 42-44) — auch so wird das Buch übersetzt.',
    suchen: '  const namen = [...voll.keys(), ...kurz.keys(), ...versal.keys()].sort((a, b) => b.length - a.length)\n',
    ersetzen: '  const namen = [...voll.keys(), ...kurz.keys()].sort((a, b) => b.length - a.length)\n',
  },
  {
    id: 'buch-stelle-endet-vor-strich',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Eine Bibelstelle endet vor dem Gedankenstrich — der Rest des Atoms wird für sich übersetzt.',
    suchen: "(?:(?! — ).)*)$`, 'u'),",
    ersetzen: ".*)$`, 'u'),",
  },
  {
    id: 'uset-buecher-im-memo',
    datei: 'src/i18n/useT.ts',
    regel: 'Nach dem Nachladen der Bibelbücher baut useT seinen Übersetzer neu — sonst bleiben Buchnamen deutsch, bis der Baustein neu entsteht.',
    suchen: '  }, [lang, congLang, overlayGen, buecher])\n',
    ersetzen: '  }, [lang, congLang, overlayGen])\n',
  },
  {
    id: 'bibelbuecher-danach-neu-zeichnen',
    datei: 'src/app/store.tsx',
    regel: 'Sind die Bibelbücher nachgeladen, zeichnet die App neu — wie nach einem Sprach-Overlay.',
    suchen: "        if (geladen) dispatch({ type: 'setLang', lang: stateRef.current.lang })\n",
    ersetzen: '        void geladen\n',
  },
  {
    id: 'gesuch-name-ohne-uebersetzer',
    datei: 'src/aufgaben/Angebot.tsx',
    regel: 'Wer einen Hilfsdienst abgesagt hat, steht im Ersatzgesuch da, wie er heißt — ohne Übersetzer.',
    suchen: '      wann={`${aufgabenTermin(req, i18n)} · ${req.declinedBy}`}',
    ersetzen: '      wann={`${aufgabenTermin(req, i18n)} · ${i18n.tu(req.declinedBy)}`}',
  },
  {
    id: 'plan-nur-planer',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Nachrichten an die ganze Versammlung darf nur auslösen, wer zuteilt — Admin oder Planer.',
    suchen: "    if (aufseherVon && (payload.action === 'erinnern' || aufseherVon.size === 0)) {",
    ersetzen: '    if (false) {',
  },
  {
    id: 'plan-planer-darf-senden',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Der Planer sendet wie der Admin (4.10.2026).',
    suchen: '    const darfZuteilen = Boolean(mich?.planner || mich?.zuteiler)',
    ersetzen: '    const darfZuteilen = Boolean(mich?.planner)',
  },
  {
    id: 'plan-aufseher-nur-eigene-gruppe',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Der Gruppenaufseher sendet nur die Treffpunkte seiner Gruppe — nicht die Zusammenkünfte, nicht eine fremde Gruppe.',
    suchen: '    const zuSenden = eigeneTreffpunkte\n',
    ersetzen: '    const zuSenden = false\n',
  },
  {
    id: 'plan-nicht-zweimal',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Gesendet wird nur, was das Tagebuch noch nicht kennt — sonst kommt nach jeder Nachbesserung alles erneut.',
    suchen:
      '    const neu = zuSenden.filter((p) => !schonGemeldet.has(tagebuchSchluessel(p.key, p.name)))',
    ersetzen: '    const neu = zuSenden',
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
    suchen: '    jePerson.set(uid, [...(jePerson.get(uid) ?? []), p])',
    ersetzen: '    jePerson.set(uid, [p])',
  },

  // ── Treffpunkt-Wochenkennung (T100) ───────────────────────────────────────
  /*
   * Hier stand `fs-woche-aus-der-woche`: „Der Montag einer Treffpunkt-Woche
   * kommt aus der Woche selbst, nicht aus der Ordnungszahl." Die Mutation
   * stellte in `fsKennung` den Rückfall `fsBase + wi·7` wieder her. Seit dem
   * 25.9.2026 gibt es weder `fsKennung` noch eine Datumsbasis: Jede Stelle
   * liest `Week.start` unmittelbar, und `Week.start` ist Pflicht. Die Regel
   * ist damit Struktur — es gibt keine zweite Rechnung mehr, auf die eine
   * Mutation zurückfallen könnte. Was bleibt, prüfen die drei Anker darunter
   * je Leser: Sie nehmen ihm die Woche aus der Hand.
   */
  {
    id: 'fs-woche-im-kandidatenblatt',
    datei: 'src/planen/kandidaten.ts',
    regel:
      'Das Kandidatenblatt prüft die Abwesenheit am Tag DIESER Woche — sonst widerspricht es dem Konfliktbanner daneben um sieben Tage.',
    /*
      Die Mutation nimmt dem Blatt die Woche aus der Hand: Ohne Kennung bleibt
      die Abwesenheitsprüfung aus, und der Abwesende steht wieder vorn.
    */
    suchen: "fsTag(state.weeks[sel.wi]?.start ?? '', inst.wd)",
    ersetzen: "fsTag('', inst.wd)",
  },
  {
    id: 'fs-woche-in-der-zeitleiste',
    datei: 'src/personen/person-timeline.ts',
    regel:
      'Auch die Zeitleiste nimmt den Montag aus der Woche — sonst nennt sie bei einer Lücke im Bestand zwei Termine derselben Woche eine Woche auseinander.',
    /*
      Die Mutation rechnet wieder aus der Ordnungszahl: Montag der Woche 0 plus
      `wi` Wochen. Ohne Lücke im Bestand ist das dasselbe — nur die Probe mit
      der herausgenommenen Woche merkt etwas.
    */
    suchen: "      const datum = fsTag(state.weeks[wi]?.start ?? '', inst.wd)\n",
    ersetzen:
      "      const datum = fsTag(state.weeks[0]?.start ?? '', inst.wd)\n" +
      '      if (datum) datum.setDate(datum.getDate() + wi * 7)\n',
  },
  {
    id: 'fs-woche-im-versand',
    datei: 'src/data/plan-versand.ts',
    /*
      Die Mutation nimmt dem Versand die Woche aus der Hand: Der Schlüssel
      trägt dann keinen Montag mehr — und die Edge Function, die ihn aus der
      Datenbankzeile nimmt, meint eine andere Menge.
    */
    regel:
      'Auch „Plan senden" nimmt den Montag aus der Woche — die Edge Function nimmt ihn aus der Datenbankzeile, und beide müssen dieselbe Woche meinen.',
    suchen: '    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({',
    ersetzen: "    nimm(fsTaskKey('', inst.id), inst.leader, () => ({",
  },
  /*
   * Hier stand `fs-kennung-migration-kette`: „Beim Umschreiben der
   * Treffpunkt-Schlüssel blockiert ein besetztes Ziel nur dann, wenn es nicht
   * selbst weiterzieht." Das Umschreiben ist mit der Altlasten-Räumung (T104)
   * weggefallen — es gibt nur noch eine Form des Schlüssels, und damit nichts
   * mehr umzuschreiben.
   */

  // ── Mitteilungen: Umfang und Bezeichnung (T102) ───────────────────────────
  {
    id: 'plan-liest-nur-die-woche',
    // Die beiden Präfixe kommen inzwischen aus `wochenPraefixe` — eine Stelle
    // für `send-plan` und den Präfix-Vergleich im Client statt zweier.
    datei: 'supabase/functions/_shared/aufgaben-schluessel.ts',
    /*
      Der Filter darf nach beiden Seiten nicht danebenliegen. Die Mutation
      lässt die zweite Schlüsselform weg — die der Treffpunkte, als einzige
      ohne führenden Montag. Ohne sie gilt jede Treffpunkt-Leitung als noch
      nicht gemeldet, und der Leiter bekommt bei jedem Druck dieselbe
      Nachricht erneut.
    */
    regel:
      'Der Wochenfilter deckt BEIDE Schlüsselformen ab — `<Montag>|…` und `fs|<Montag>|…`.',
    suchen: '  return [`${woche}|`, `fs|${woche}|`]',
    ersetzen: '  return [`${woche}|`, `${woche}|`]',
  },
  {
    id: 'entzug-loescht-jeden-eintrag',
    datei: 'supabase/functions/send-plan/index.ts',
    /*
      Seit der Entzug als Liste kommt, ist „den Eintrag löschen" ein „jeden
      Eintrag löschen". Die Mutation nimmt nur den ersten. Bliebe einer stehen,
      bekäme die Person bei einer erneuten Zuteilung auf denselben Platz keine
      Nachricht mehr — er zählte als gemeldet.
    */
    regel:
      'Ein Entzug räumt JEDEN Platz der Liste aus dem Versand-Tagebuch, nicht nur den ersten.',
    suchen: '        entzuege.map((e) =>\n          rest.send(',
    ersetzen: '        entzuege.slice(0, 1).map((e) =>\n          rest.send(',
  },
  {
    id: 'entzug-als-liste',
    datei: 'src/app/persist.ts',
    /*
      Je Entzug ein eigener Aufruf hieß: Die Function las für jeden davon aufs
      Neue alle Mitglieder, Personen und Push-Abos. Die Mutation stellt genau
      das wieder her — inhaltlich geht dasselbe hinaus, nur eben in N Aufrufen
      und als N Nachrichten an dieselbe Person.
    */
    regel:
      'Alle Entzüge einer Änderung gehen in EINEM Aufruf hinaus — und je Person als eine Nachricht.',
    suchen: '    if (offen === 0 && gelungen.length > 0) sendPlanEntzug(gelungen)\n',
    ersetzen: '    if (offen === 0) for (const z of gelungen) sendPlanEntzug([z])\n',
  },
  {
    id: 'treffpunkt-ort-im-termin',
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    /*
      Die Mutation stellt die alte Fassung wieder her: Ort in der Bezeichnung,
      Termin ohne Ort. Der Client macht es umgekehrt — wer erst erinnert und
      dann entzogen wird, las dieselbe Auskunft in zwei Reihenfolgen.
    */
    regel:
      'Der Ort eines Treffpunkts steht im Termin, nicht in der Bezeichnung — auf beiden Seiten gleich.',
    suchen: '      label: FS_LEITER,',
    ersetzen: '      label: inst.place ? `${FS_LEITER} · ${inst.place}` : FS_LEITER,',
  },
  {
    id: 'glocke-laedt-nach-wenn-neu',
    datei: 'src/mitteilungen/useMitteilungenNachladen.ts',
    /*
      Zwei Fehler sind hier möglich, und die Probe misst beide Richtungen über
      denselben Ausdruck: Wer nie voll nachlädt, zeigt die frische Zuteilung
      ohne den Bestätigen-Knopf, für den sie den Schlüssel mitbringt; wer immer
      voll nachlädt, holt für fünfzig Zeilen Text die ganze Versammlung.
    */
    regel:
      'Die Mitteilungen laden den ganzen Bestand nur nach, wenn wirklich eine neue Zeile dabei ist.',
    suchen: 'if (frisch.some((n) => !bekannt.has(n.id))) {',
    ersetzen: 'if (false) {',
  },

  // ── Start-Bildschirm: die Planungs-Karte (T95) ────────────────────────────
  {
    id: 'planung-nur-beim-planer',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Die Planungs-Karte steht nur bei Admin und Planer — sie führt in einen Screen, den sonst niemand betreten darf.',
    suchen: '        {zuteilen && (\n          <div className="start-spalte">\n            <PlanungsKarte />',
    ersetzen: '        {(\n          <div className="start-spalte">\n            <PlanungsKarte />',
  },
  {
    id: 'planung-ab-laufender-woche',
    datei: 'src/data/planungsstand.ts',
    /*
      Die Mutation lässt die Karte bei der ersten geladenen Woche beginnen. Mit
      einer oder zwei Wochen davor bliebe das unbemerkt — vergangene Wochen
      zählen nichts und fallen heraus. Mit einem ganzen Jahr Bestand, wie die
      App ihn lädt, belegen sie die vier Zeilen, und die kommende fehlt.
    */
    regel:
      'Die Karte beginnt bei der laufenden Kalenderwoche — nicht bei der ältesten geladenen (und nicht erst bei der nächsten Zusammenkunft, die Kongresswochen überspringt).',
    suchen: '    return sonntag !== null && sonntag >= heuteMs',
    ersetzen: '    return sonntag !== null',
  },
  {
    id: 'planung-hoechstens-vier-zeilen',
    datei: 'src/data/planungsstand.ts',
    regel: 'Die Karte zeigt höchstens vier Wochen — acht frisch importierte wären acht Zeilen „offen".',
    suchen: 'for (let wi = ab; wi < weeks.length && out.length < WOCHEN_VORAUS; wi++) {',
    ersetzen: 'for (let wi = ab; wi < weeks.length; wi++) {',
  },
  {
    id: 'planung-luecke-streckt-nicht',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine Lücke im Bestand streckt die Karte nicht über vier Kalenderwochen hinaus (T66).',
    suchen: '    if (start && Date.parse(start) >= grenzeMs) break\n',
    ersetzen: '',
  },
  {
    id: 'planung-nur-mit-handlungsbedarf',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine fertig geplante und gesendete Woche steht nicht auf der Karte.',
    suchen: 'if (stand.konflikte + stand.nichtBesetzbar + stand.offen + stand.nichtGesendet > 0) {',
    ersetzen: 'if (true) {',
  },
  {
    id: 'planung-vorbei-zaehlt-nicht',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine Zusammenkunft, die vorbei ist, zählt auf der Karte nicht mehr (T77).',
    suchen: '(tab) => !istAusgefallen(week, tab) && !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),',
    ersetzen: '(tab) => !istAusgefallen(week, tab),',
  },
  {
    id: 'planung-entfallen-zaehlt-nicht',
    datei: 'src/data/planungsstand.ts',
    regel: 'Eine entfallene Zusammenkunft zählt auf der Karte nicht — ihre Plätze braucht niemand (T30).',
    suchen: '(tab) => !istAusgefallen(week, tab) && !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),',
    ersetzen: '(tab) => !istVorbei(meetingDateMs(week, tab, q.zeiten), heute),',
  },
  {
    id: 'planung-treffpunkt-vorbei',
    datei: 'src/data/planungsstand.ts',
    regel: 'Ein Treffpunkt, dessen Tag vorbei ist, zählt nicht mehr als offen.',
    suchen: '  const fsOffen = (q.fsWeeks[wi] ?? []).filter((inst) => !inst.leader && fsAnstehend(inst.wd)).length',
    ersetzen: '  const fsOffen = (q.fsWeeks[wi] ?? []).filter((inst) => !inst.leader).length',
  },
  {
    id: 'plan-vorbei-nicht-mehr-zaehlen',
    datei: 'src/data/plan-versand.ts',
    /*
      Seit der Durchsicht von T95 steht die Regel in der Vorschau selbst, nicht
      mehr nur auf der Karte: Knopf, Karte und Function zählen dieselbe Menge.
    */
    regel: '„Plan senden" zählt keine Zuteilung, deren Zusammenkunft vorbei ist — am Knopf und auf der Karte.',
    suchen: '      if (wo && vorbei.has(wo.tab)) return\n      nimm(key, slot.name, task)',
    ersetzen: '      nimm(key, slot.name, task)',
  },
  {
    id: 'plan-vorbei-treffpunkt-nicht-mehr-zaehlen',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ebenso ein Treffpunkt, dessen eigener Tag vorbei ist.',
    suchen: '    if (fsTagVorbei(kennung, inst.wd, heute)) continue\n    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({',
    ersetzen: '    nimm(fsTaskKey(kennung, inst.id), inst.leader, () => ({',
  },
  {
    id: 'plan-vorbei-function-zusammenkunft',
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Die Function schickt keine Nachricht über eine Zusammenkunft, die gewesen ist.',
    suchen: '    if (terminVorbei(weekStart, offset, heuteUTC)) continue\n',
    ersetzen: '',
  },
  {
    id: 'plan-vorbei-function-treffpunkt',
    datei: 'supabase/functions/_shared/zuteilungen.ts',
    regel: 'Und keine über einen Treffpunkt, dessen Tag vorbei ist.',
    suchen: '    if (terminVorbei(weekStart, pend.offset, heuteUTC)) continue\n',
    ersetzen: '',
  },
  {
    id: 'plan-heute-des-planers',
    datei: 'supabase/functions/send-plan/index.ts',
    /*
      Ohne den mitgeschickten Tag rechnet der Server in UTC — zwischen
      Mitternacht und 02:00 in Mitteleuropa ein anderer Tag als am Knopf, und
      die Zahl ginge nach dem Drücken nicht auf null.
    */
    regel: 'Die Function meint denselben Kalendertag wie der Knopf, der gezählt hat.',
    suchen: '      heuteUtc(payload.heute),',
    ersetzen: '      heuteUtc(undefined),',
  },
  {
    id: 'plan-heute-plausibel',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Ein mitgeschickter Tag, der mehr als einen Tag neben der Serveruhr liegt, wird nicht geglaubt.',
    suchen: '  if (Number.isNaN(client) || Math.abs(client - server) > 864e5) return server',
    ersetzen: '  if (Number.isNaN(client)) return server',
  },
  {
    id: 'plan-knopf-schickt-seinen-tag',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Der Knopf schickt den Tag mit, mit dem er gezählt hat.',
    suchen: '  return useSenden(week?.start ?? null, (start) => sendPlan(start, tag))',
    ersetzen: "  return useSenden(week?.start ?? null, (start) => sendPlan(start, ''))",
  },
  {
    id: 'entzug-vorbei-schweigt',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ein Entzug für einen vergangenen Platz meldet nichts — wer nachträgt, nimmt niemandem etwas.',
    suchen: '    if (!betroffen(key, slot.name)) return\n    const wo = taskKeyWeek(key)\n    if (wo && vorbei.has(wo.tab)) return\n',
    ersetzen: '    if (!betroffen(key, slot.name)) return\n',
  },
  {
    id: 'entzug-vorbei-schweigt-treffpunkt',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ebenso für einen Treffpunkt, dessen Tag vorbei ist.',
    suchen: '    if (!betroffen(key, inst.leader)) continue\n    if (fsTagVorbei(kennung, inst.wd, heute)) continue\n',
    ersetzen: '    if (!betroffen(key, inst.leader)) continue\n',
  },
  {
    id: 'planung-engpass-ist-problem',
    datei: 'src/data/planungsstand.ts',
    // Seit Phase 10 (T121) mit den Wörtern der Wochen beim Planen: „Probleme"
    // umfasst Konflikte und was nicht besetzbar ist — seit T144 an einer Stelle
    // für die Karte, die Wochen und die Wahl auf „Planung" (`problemeDerWoche`).
    regel: 'Was nicht besetzbar ist, nennt die Karte als Problem — auch ohne Konflikt in der Woche.',
    suchen: '  s.konflikte + s.nichtBesetzbar\n',
    ersetzen: '  s.konflikte\n',
  },
  {
    id: 'planung-offline-kein-senden',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    /*
      Die Regel steht in der reinen Funktion (`sendenMoeglich`) und ist dort
      geprüft — gemessen wird hier der Aufrufer, der den Offline-Stand
      hineingeben muss. Genau diese Hälfte ist die, die vergessen wird.
    */
    regel: 'Offline zeigt die Karte kein „Plan senden" — Planen blendet den Knopf dann auch aus.',
    suchen: '  const sendenMoeglich = state.staleAt === null\n',
    ersetzen: '  const sendenMoeglich = true\n',
  },
  {
    id: 'planung-vorrat-ohne-wochen',
    datei: 'src/data/planungsstand.ts',
    regel: 'Ohne jede geladene Woche erinnert die Karte an den ersten Import.',
    suchen: 'if (weeks.length === 0) return true',
    ersetzen: 'if (weeks.length === 0) return false',
  },
  {
    id: 'planung-vorrat-drei-wochen',
    datei: 'src/data/planungsstand.ts',
    regel: 'Reichen die Programme weniger als drei Wochen voraus, erinnert die Karte an den Import — nicht erst, wenn nichts mehr da ist.',
    suchen: 'return geladenBisMs - kalendertagMs(heute) < VORRAT_TAGE * 864e5',
    ersetzen: 'return geladenBisMs - kalendertagMs(heute) < 0',
  },
  {
    id: 'planung-karte-folgt-dem-tag',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die gemerkte Karte rechnet neu, sobald der Kalendertag wechselt — nicht erst, wenn sich die Wochen ändern.',
    suchen: '      sendenMoeglich,\n      tag,\n    ],',
    ersetzen: '      sendenMoeglich,\n    ],',
  },
  {
    id: 'kalendertag-beim-zurueckkehren',
    datei: 'src/app/useKalendertag.ts',
    regel: 'Kehrt die App aus dem Hintergrund zurück, wird der Tag neu gelesen — dort hält das Betriebssystem Zeitgeber an.',
    suchen: "    document.addEventListener('visibilitychange', beimZurueckkehren)\n",
    ersetzen: '',
  },
  {
    id: 'planung-aufrufer-treffpunkte',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Karte gibt die Treffpunkte der Wochen an die Rechnung weiter.',
    suchen: '          fsWeeks: state.fsWeeks,',
    ersetzen: '          fsWeeks: [],',
  },
  {
    id: 'planung-aufrufer-abwesenheiten',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Karte gibt die Abwesenheiten weiter — sonst fehlt der abwesende Treffpunkt-Leiter unter den Konflikten.',
    suchen: '          absences: state.absences,',
    ersetzen: '          absences: [],',
  },
  {
    id: 'planung-aufrufer-tagebuch',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Karte gibt das Versand-Tagebuch weiter — sonst stünde jede gesendete Woche wieder mit „Plan senden" da.',
    suchen: '          sentLog: state.sentLog,',
    ersetzen: '          sentLog: {},',
  },
  {
    id: 'planung-reiter-treffpunkt-senden',
    datei: 'src/data/planungsstand.ts',
    regel: 'Ist nur ein Treffpunkt-Leiter noch nicht benachrichtigt, öffnet Planen bei den Treffpunkten.',
    suchen: "  return ungesendet.some((m) => !m.key.startsWith('fs|')) ? (jeTab[0]?.tab ?? 'mid') : 'fs'",
    ersetzen: "  return jeTab[0]?.tab ?? 'mid'",
  },
  {
    id: 'planung-zeitraum-sichtbar',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: '„Alles zugeteilt" nennt den Zeitraum, für den es gilt.',
    suchen: '          {zeitraum && <span className="dash-plan-zeitraum">{zeitraum}</span>}\n',
    ersetzen: '',
  },
  {
    id: 'planung-wochenspanne-variante',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Die Wochenspanne steht in derselben Sprachvariante wie der Kopf in Planen.',
    suchen: "        const p = week ? progWeek(week) : null\n        return { ...w, spanne: p ? programmSpanne(p) : '' }",
    ersetzen: "        return { ...w, spanne: week ? programmSpanne({ week, tpw: (s) => s }) : '' }",
  },
  {
    id: 'planung-konflikte-je-zusammenkunft',
    datei: 'src/data/planungsstand.ts',
    regel: 'Die Konflikte einer vergangenen Zusammenkunft zählen nicht mit, auch wenn die Woche als Ganzes gerechnet wird.',
    suchen: '    konflikte: alleKonflikte.filter((c) => c.tab === tab).length,',
    ersetzen: '    konflikte: alleKonflikte.length,',
  },
  {
    id: 'navigation-woche-nur-mit-recht',
    datei: 'src/app/reducer.ts',
    regel: 'Ein abgewiesener Sprung auf eine bestimmte Woche stellt die Woche nicht um.',
    // Ob das Ziel erreicht wurde, steht inzwischen am Screen selbst: `screen`
    // ist nach einer Abweisung ein anderer als der gewünschte.
    suchen: '      if (action.woche && screen === action.screen) {',
    ersetzen: '      if (action.woche) {',
  },
  {
    id: 'start-nur-eigene-treffpunkte',
    /*
      Die Karte „Aktuelle Woche", die das selbst filterte, gibt es seit dem
      19.9.2026 nicht mehr — der Start liest `state.myTasks`. Damit ist die
      Regel dorthin gewandert, wo diese Liste entsteht: `deriveMyFsTasks`
      ordnet über die Person-Id zu, mit Rückfall auf den Namen. Ohne sie sähen
      Namensgleiche gegenseitig ihre Treffpunkte — und zwar überall, nicht nur
      auf dem Start.
    */
    datei: 'src/data/fs.ts',
    regel: 'Eine Treffpunkt-Leitung gehört in die Aufgaben ihres Leiters, nicht in fremde.',
    // Seit dem 25.9.2026 fragt die Ableitung `gehoertZuKennung` — die Mutation
    // lässt jede besetzte Leitung durch, gleich wem sie gehört.
    suchen: '      if (!gehoertZuKennung(fsLeiterZuteilung(inst), personId, personName)) continue',
    ersetzen: '      if (!fsLeiterZuteilung(inst)) continue',
  },
  {
    id: 'start-wochenfolge',
    // Aus der Karte wurde die Zeitleiste (19.9.2026), aus der Zeitleiste die
    // Termine der Woche (T121) — die Regel blieb: Zusammenkünfte und
    // Treffpunkte stehen gemischt in der Folge ihrer Tage.
    datei: 'src/dashboard/diese-woche.ts',
    regel: 'Die Termine der Woche stehen in Tagesfolge — der Treffpunkt am Samstag vor der Zusammenkunft am Sonntag.',
    suchen: '  return termine.sort((a, b) => a.tag.getTime() - b.tag.getTime() || a.zeit.localeCompare(b.zeit))',
    ersetzen: '  return termine',
  },
  {
    id: 'treffpunkt-freitext-gehoert-niemandem',
    datei: 'src/data/fs.ts',
    regel: 'Ein auswärtiger Treffpunkt-Leiter (Freitext) gehört niemandem hier, auch keinem Gleichnamigen.',
    suchen: '  if (!inst.leader || inst.lext) return undefined',
    ersetzen: '  if (!inst.leader) return undefined',
  },

  // ── Predigtdienstgruppe löschen · ohne Gruppe (13.9.2026) ────────────────
  {
    id: 'gruppe-loeschen-rueckfrage',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Eine Predigtdienstgruppe wird erst mit dem zweiten Tipp entfernt — der erste fragt nach.',
    suchen:
      "        <EntfernenKnopf\n          className=\"knopf-umriss knopf-entfernen\"\n          text={t.gruppeEntfernen}\n          onEntfernen={() => {\n            dispatch({ type: 'removeGroup', id: gruppe.id })\n            onClose()\n          }}\n        />",
    ersetzen:
      "        <button\n          type=\"button\"\n          className=\"knopf-umriss knopf-entfernen\"\n          onClick={() => {\n            dispatch({ type: 'removeGroup', id: gruppe.id })\n            onClose()\n          }}\n        >\n          {t.gruppeEntfernen}\n        </button>",
  },
  {
    id: 'gruppe-loeschen-folgen-mitglieder',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen steht da, dass die Mitglieder der Gruppe danach ohne Gruppe dastehen.',
    suchen: "  if (daten.persons.some((p) => p.grp === gruppeId)) folgen.push('mitglieder')\n",
    ersetzen: '',
  },
  {
    id: 'gruppe-loeschen-folgen-treffpunkte',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen stehen die Treffpunkte da, die mit der Gruppe gehen — auch die einmaligen.',
    suchen:
      "  const rest = fsGruppeEntfernen(daten.fsRules, daten.fsWeeks, gruppeId)\n  if (rest.fsRules !== daten.fsRules || rest.fsWeeks !== daten.fsWeeks) folgen.push('treffpunkte')",
    ersetzen: "  if (daten.fsRules.some((r) => r.grp === gruppeId)) folgen.push('treffpunkte')",
  },
  {
    id: 'gruppe-loeschen-treffpunkte',
    datei: 'src/app/reducer.ts',
    regel: 'Mit einer Predigtdienstgruppe gehen ihre Treffpunkte — aus dem Grundplan und aus jeder Woche.',
    suchen: '      const { fsRules, fsWeeks } = fsGruppeEntfernen(state.fsRules, state.fsWeeks, action.id)',
    ersetzen: '      const { fsRules, fsWeeks } = { fsRules: state.fsRules, fsWeeks: state.fsWeeks }',
  },
  {
    id: 'gruppe-loeschen-auch-einmalige',
    datei: 'src/data/fs.ts',
    regel: 'Auch die nur für eine Woche angelegten Treffpunkte einer gelöschten Gruppe gehen mit.',
    suchen: '    return week.filter((inst) => inst.grp !== grp)\n  })\n  return { fsRules, fsWeeks: geaendert ? weeks : fsWeeks }',
    ersetzen:
      '    return week.filter((inst) => inst.grp !== grp || inst.manual)\n  })\n  return { fsRules, fsWeeks: geaendert ? weeks : fsWeeks }',
  },
  {
    id: 'gruppe-loeschen-versammlung-bleibt',
    datei: 'src/data/fs.ts',
    regel: 'Die Kennung `null` ist die Versammlung — für sie wird kein Treffpunkt gestrichen.',
    suchen: '  if (!grp) return { fsRules: rules, fsWeeks }\n',
    ersetzen: '',
  },
  {
    id: "gruppe-loeschen-speichern",
    datei: 'src/app/persist.ts',
    regel: "Das Löschen einer Gruppe schreibt den Grundplan ohne ihre Treffpunkte in die Datenbank.",
    suchen: "      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.\n      grundplanSpeichern(congId, prev, next)",
    ersetzen: "      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.",
  },
  {
    // Am Bündler vorbei **und** ohne die Streichungen — genau der Stand, den
    // `saveFsRules` vor dem 21.9.2026 hatte.
    id: "gruppe-loeschen-gebuendelt",
    datei: 'src/app/persist.ts',
    regel: 'Ein gebündelt ausstehender Grundplan bringt die Regeln einer gelöschten Gruppe nicht zurück.',
    suchen: "      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.\n      grundplanSpeichern(congId, prev, next)",
    ersetzen: "      // gegenüber der Kaskade nur eine Wiederholung, keine zweite Wahrheit.\n      saveFsRules(congId, next.fsRules)",
  },
  {
    id: 'ohne-gruppe-rolle-keine',
    datei: 'src/data/helpers.ts',
    regel: 'Die Rolle „Keine" (Schüler ohne Verkündiger-Status) braucht keine Predigtdienstgruppe.',
    suchen: "  return persons.filter((p) => p.role !== 'keine' && !(p.grp && vorhanden.has(p.grp)))",
    ersetzen: '  return persons.filter((p) => !(p.grp && vorhanden.has(p.grp)))',
  },
  {
    id: 'ohne-gruppe-verwaist',
    datei: 'src/data/helpers.ts',
    regel: 'Ein Verweis auf eine Gruppe, die es nicht mehr gibt, zählt als keine Gruppe.',
    suchen: "  return persons.filter((p) => p.role !== 'keine' && !(p.grp && vorhanden.has(p.grp)))",
    ersetzen: "  return persons.filter((p) => p.role !== 'keine' && !p.grp)",
  },
  {
    id: 'ohne-gruppe-ohne-gruppen',
    datei: 'src/data/helpers.ts',
    regel: 'Ohne angelegte Gruppen meldet die Warnung „ohne Gruppe" niemanden.',
    suchen: '  if (groups.length === 0) return []\n  const vorhanden',
    ersetzen: '  const vorhanden',
  },
  // ── Eindeutige Personennamen (T110) ───────────────────────────────────────
  {
    id: 'name-vergleich-ohne-schreibweise',
    datei: 'src/data/helpers.ts',
    regel: 'Gleich heißt gleich ungeachtet der Groß-/Kleinschreibung und mehrfacher Leerzeichen.',
    suchen: "  return displayName(p).replace(/\\s+/g, ' ').toLowerCase()",
    ersetzen: '  return displayName(p)',
  },
  {
    id: 'name-eigene-person-keine-dublette',
    datei: 'src/data/helpers.ts',
    regel: 'Eine Person ist nie ihre eigene Dublette — sonst ließe sie sich nicht mehr bearbeiten.',
    suchen: '  return persons.find((p) => p.id !== person.id && namensSchluessel(p) === schluessel)',
    ersetzen: '  return persons.find((p) => namensSchluessel(p) === schluessel)',
  },
  {
    id: 'name-namenlose-sind-keine-dublette',
    datei: 'src/data/helpers.ts',
    regel: 'Zwei Personen ohne Namen sind keine Dublette (frisch angelegt, noch nichts getippt).',
    suchen: '  if (!schluessel) return undefined',
    ersetzen: '',
  },
  {
    id: 'name-feld-meldet-die-dublette',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: '„Person bearbeiten" nennt am Feld, wer den Namen schon trägt.',
    suchen: '  const dublette = namensDublette(state.persons, name)',
    ersetzen: '  const dublette = undefined',
  },
  {
    id: 'ohne-gruppe-warnung-personen',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Personenliste warnt vor Personen ohne Predigtdienstgruppe.',
    suchen: '      ohne: ohneGruppe(sortiert, groups),',
    ersetzen: '      ohne: [],',
  },
  {
    id: 'ohne-gruppe-hinweis-einstellungen',
    datei: 'src/einstellungen/GruppenInhalt.tsx',
    regel: 'Über den Gruppen der Einstellungen steht, wie viele keiner Gruppe zugeordnet sind.',
    suchen: '  const ohne = ohneGruppe(state.persons, state.groups)',
    ersetzen: '  const ohne: Person[] = []',
  },

  // ── Ein gelöschter Dienst nimmt seine Spuren mit (T105) ───────────────────
  {
    id: 'dienst-bereich-bleibt',
    datei: 'src/data/dienste.ts',
    regel: 'Mit dem Dienst verschwindet sein Aufgabenbereich aus jeder Person.',
    suchen: '    if (!(bereich in p.priv)) return p',
    ersetzen: '    return p',
  },
  {
    id: 'dienst-plaetze-bleiben',
    datei: 'src/data/dienste.ts',
    regel: 'Mit dem Dienst verschwindet seine Platzreihe aus den geladenen Wochen.',
    suchen: '      if (!(key in week[tab].helpers)) continue',
    ersetzen: '      continue',
  },
  {
    id: 'dienst-zusagen-bleiben',
    datei: 'src/data/dienste.ts',
    regel: 'Mit dem Dienst verschwinden die Bestätigungen seiner Plätze.',
    suchen: '      arr.forEach((_slot, pos) => out.push(helferKey(week.start, tab, key, pos)))',
    ersetzen: '      void arr',
  },
  {
    id: 'haushalt-vor-person',
    datei: 'src/app/persist.ts',
    regel: 'Der Haushalt geht vor den Personen hinaus — sonst weist der Fremdschlüssel sie ab.',
    suchen: '        saveFamily(congId, haushalt, geaendert)\n',
    ersetzen: '        for (const p of geaendert) personSofort(congId, p)\n',
  },
  {
    id: 'push-gesucht-einspringen',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Ein Klick auf „Ersatz gesucht" führt zum Bereich Einspringen, nicht an den Anfang der Aufgaben (T109).',
    suchen: '`${APP_URL}#go=aufgaben&abschnitt=einspringen`',
    ersetzen: '`${APP_URL}#go=aufgaben`',
  },
  {
    id: 'sprung-wartet-auf-bereich',
    datei: 'src/aufgaben/FreiePlaetzeScreen.tsx',
    regel: 'Der Sprung zum Einspringen wartet, bis das Gesuch nach dem Nachladen dasteht (T109).',
    suchen: '  }, [state.sprungZiel, gesucheOffen, dispatch])',
    ersetzen: '  }, [state.sprungZiel, dispatch])',
  },
  {
    id: 'kontakt-betreff-kodiert',
    datei: 'src/login/kontakt.ts',
    regel: 'Der Betreff der Anfrage an den Betreiber steht kodiert im mailto-Verweis — sonst zerbricht er an Leerzeichen, fremder Schrift und einem & (T113).',
    suchen: '?subject=${encodeURIComponent(betreff)}',
    ersetzen: '?subject=${betreff}',
  },
  {
    id: 'kontakt-adresse-ltr',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Die Kontaktadresse bleibt auf Arabisch, Hebräisch, Persisch und Urdu links-nach-rechts lesbar (T113).',
    suchen: 'href={kontaktVerweis(t.anfrageBetreff)} dir="ltr"',
    ersetzen: 'href={kontaktVerweis(t.anfrageBetreff)}',
  },
  {
    id: 'kontakt-auch-in-der-demo',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Der Kontakt für eine neue Versammlung öffnet auch in der Demo eine Mail — wer sie ansieht, ist genau der, der fragen würde (T113).',
    suchen: 'href={kontaktVerweis(t.anfrageBetreff)}',
    ersetzen: 'href={isSupabaseConfigured ? kontaktVerweis(t.anfrageBetreff) : undefined}',
  },

  /* ---- Weitere Pläne (T120, Phase 5) ---- */
  {
    id: 'wp-schema-entwurf-nur-fuer-planer',
    datei: 'supabase/schema.sql',
    regel: 'Einen Entwurf liefert die Datenbank nur einem Planer aus.',
    suchen: '       and not p.entwurf\n',
    ersetzen: '',
  },
  {
    id: 'wp-ansehen-nur-veroeffentlicht',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Beim Ansehen stehen nur veröffentlichte Pläne — auch für den Planer; Entwürfe gibt es nur beim Planen.',
    suchen: '!plan.entwurf && !planVorbei(plan, heute))',
    ersetzen: '!planVorbei(plan, heute))',
  },
  {
    id: 'wp-ansehen-ohne-vergangene',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ein vergangener Plan verschwindet aus dem Ansehen.',
    suchen: '!plan.entwurf && !planVorbei(plan, heute))',
    ersetzen: '!plan.entwurf)',
  },
  {
    id: 'wp-menue-nur-mit-plan',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ohne etwas zum Ansehen steht „Weitere Pläne" für Mitglieder nicht im Menü.',
    suchen: '  return args.zuteilen || plaeneZumAnsehen(args.plaene, args.heute).length > 0',
    ersetzen: '  return true',
  },
  {
    id: 'wp-verteilen-laesst-vergangenes',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Reihum verteilen fasst vergangene Wochen nicht an.',
    suchen: '    .filter((s) => s >= jetzt)\n',
    ersetzen: '',
  },
  {
    id: 'wp-verteilen-behaelt-kennung',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Bekommt eine Woche eine andere Gruppe, behält ihr Eintrag die Kennung — die Datenbank kennt je Woche nur einen.',
    suchen: '      if (da) return da.grp === grp ? da : { ...da, grp }\n',
    ersetzen: '',
  },
  {
    id: 'wp-zeitraum-saal-ganze-woche',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Die Woche, in der der Zeitraum beginnt, gehört ganz dazu.',
    suchen: 'e.datum >= spanneVon(takt, plan.von) && e.datum <= plan.bis',
    ersetzen: 'e.datum >= plan.von && e.datum <= plan.bis',
  },
  // Der Takt (4.10.2026): je Woche oder je Monat eine Gruppe.
  {
    id: 'wp-takt-im-raster',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ein Eintrag neben dem Takt des Plans geht mit — ein Montag ist kein Monat.',
    suchen: ' && spanneVon(takt, e.datum) === e.datum',
    ersetzen: '',
  },
  {
    id: 'wp-takt-wechsel-nimmt-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Ein anderer Takt verteilt ab jetzt neu, statt die Einteilung fallen zu lassen.',
    suchen: '          : taktWechseln({ plan, eintraege: state.planEintraege, groups: state.groups, heute: new Date(), neueId: neueEintragId })',
    ersetzen: '          : null',
  },
  {
    id: 'wp-takt-wechsel-gleiche-reihe',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Nach einem Wechsel des Takts geht es mit der Gruppe weiter, die gerade dran ist — nicht wieder von vorn.',
    suchen: '    abGruppe: dran.grp,\n',
    ersetzen: "    abGruppe: groups[0]?.id ?? '',\n",
  },
  {
    id: 'wp-takt-wechsel-vergangenes',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Was vorbei ist, geht beim Wechsel des Takts ins neue Raster über, statt zu verschwinden.',
    suchen: '    if (quelle) vergangen.push(',
    ersetzen: '    if (false) vergangen.push(',
  },
  {
    id: 'wp-monat-verteilen-ab-laufendem',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Im Monatstakt verteilt „Reihum" ab dem laufenden Monat, nicht erst ab der laufenden Woche.',
    suchen: '  const jetzt = spanneVon(taktVon(plan), isoDay(heute))',
    ersetzen: "  const jetzt = spanneVon('woche', isoDay(heute))",
  },
  {
    id: 'wp-monat-ansehen-ab-laufendem',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Beim Ansehen steht im Monatstakt der laufende Monat noch da.',
    suchen: '  const jetzt = spanneVon(taktVon(plan), tag)',
    ersetzen: "  const jetzt = spanneVon('woche', tag)",
  },
  {
    id: 'wp-takt-laden',
    datei: 'src/lib/data.ts',
    regel: 'Der Takt kommt beim Laden mit — sonst wechselte ein Monatsplan danach wieder wöchentlich.',
    suchen: ', takt: taktVon({ takt: r.takt as PlanTakt }) }',
    ersetzen: ' }',
  },
  {
    id: 'wp-takt-speichern',
    datei: 'src/lib/data.ts',
    regel: 'Der Takt geht beim Speichern mit in die Zeile.',
    suchen: '    takt: taktVon(p),\n',
    ersetzen: '',
  },
  {
    id: 'wp-zeitraum-nimmt-eintraege-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Ein kürzerer Zeitraum nimmt die Einträge außerhalb mit.',
    suchen: '        planEintraege: eintraegeImZeitraum(wechsel?.eintraege ?? state.planEintraege, plan),\n',
    ersetzen: '        planEintraege: wechsel?.eintraege ?? state.planEintraege,\n',
  },
  {
    id: 'wp-loeschen-nimmt-eintraege-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Ein gelöschter Plan nimmt seine Einträge mit.',
    suchen: '        planEintraege: state.planEintraege.filter((e) => e.planId !== action.id),\n',
    ersetzen: '',
  },
  {
    id: 'wp-geloeschte-gruppe-raeumt-die-woche',
    datei: 'src/app/reducer.ts',
    regel: 'Eine gelöschte Gruppe verlässt ihre Wochen — die Wochen bleiben.',
    suchen: '          state.planEintraege.map((e) => (e.grp === action.id ? { ...e, grp: null } : e)),',
    ersetzen: '          state.planEintraege,',
  },
  {
    id: 'wp-zurueck-zur-zusammenkunft',
    datei: 'src/app/reducer.ts',
    regel: 'Wer aus den Weiteren Plänen zu den Zusammenkünften wechselt, landet bei der Zusammenkunft der Woche.',
    suchen: "            : action.thema === 'zusammenkuenfte' && themaVon(state.tab) !== 'zusammenkuenfte'",
    ersetzen: "            : action.thema === 'zusammenkuenfte' && state.tab === 'fs'",
  },
  {
    id: 'wp-eintrag-nach-dem-plan',
    datei: 'src/app/persist.ts',
    regel: 'Ein Eintrag geht nie vor dem Plan hinaus, auf den er zeigt — sonst weist ihn der Fremdschlüssel ab.',
    suchen: '  planSaves.flush()\n  savePlanEintraege(congId, geaendert, entfernt)',
    ersetzen: '  savePlanEintraege(congId, geaendert, entfernt)',
  },
  /* ---- Code-Review T120 (3.10.2026) ---- */
  {
    id: 'zeilen-nur-geaenderte',
    datei: 'src/app/persist.ts',
    regel:
      'Ein getippter Ort oder Name schreibt nur, was dieser Planer geändert hat — die ganze Liste holte zurück, was ein anderer gelöscht hat.',
    suchen: "  if (geaendert.length || entfernt.length) schreiber.schedule('zeilen', { congId, zeilen: geaendert, entfernt })",
    ersetzen: "  if (geaendert.length || entfernt.length) schreiber.schedule('zeilen', { congId, zeilen: [...nachher], entfernt })",
  },
  {
    id: 'zeilen-geloeschtes-nicht-zurueck',
    datei: 'src/app/persist.ts',
    regel: 'Erst getippt, dann gelöscht: Die Zeile geht nur als Löschung hinaus, nicht danach noch einmal als Upsert.',
    suchen: '  const nachId = new Map(alt.zeilen.filter((z) => !weg.has(z.id)).map((z) => [z.id, z]))',
    ersetzen: '  const nachId = new Map(alt.zeilen.map((z) => [z.id, z]))',
  },
  {
    id: 'zeilen-veraltet-laedt-nach',
    datei: 'src/lib/data.ts',
    regel:
      'Was nur ein veralteter Stand erklärt (Termin gelöscht, Platz besetzt, Recht entzogen), lädt nach — sonst bleibt lokal stehen, was es nicht gibt.',
    suchen: "const STAND_VERALTET: ReadonlySet<string> = new Set(['23505', '23503', '23514', '42501'])",
    ersetzen: "const STAND_VERALTET: ReadonlySet<string> = new Set(['23505'])",
  },
  {
    id: 'person-weg-eintraege-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Geht eine Person, geht ihr Trolley-Termin mit — wie in der Datenbank (on delete cascade).',
    suchen: '        .filter((t) => t.pid !== id)\n',
    ersetzen: '',
  },
  /* ---- Testlücken T120 geschlossen (3.10.2026) ---- */
  {
    id: 'laden-waisen-raus',
    datei: 'src/lib/data.ts',
    regel: 'Einträge eines Plans, der nicht geladen ist, kommen nicht mit — sie gehören zu nichts, was die App zeigt.',
    suchen: '      .filter((e) => geladenePlaene.has(e.planId)),',
    ersetzen: '      .filter(() => true),',
  },
  {
    id: 'wp-neu-gleich-offen',
    datei: 'src/planen/WeiterePlaenePlan.tsx',
    regel: 'Ein neuer Plan steht gleich offen da, nicht wieder die Liste.',
    suchen: '    setOffen(id)\n',
    ersetzen: '',
  },
  /* ---- Testlücken 6–11 T120 geschlossen (3.10.2026) ---- */
  {
    id: 'erinnerung-fs-tabelle-fehlt',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel:
      'Fehlt die Tabelle der Treffpunkte, erinnert der Lauf trotzdem an die Zusammenkünfte. Der Test dazu maß bis zum 3.10.2026 nichts: Sein eigenes `fetch` überschrieb `loadFn` wieder.',
    suchen:
      "        ).catch((err) => {\n          // Fehlt die Tabelle (Migration nicht eingespielt), lieber die\n          // Zusammenkünfte erinnern als den ganzen Lauf verlieren.\n          console.error(`fs_weeks nicht lesbar: ${(err as Error).message}`)\n          return [] as { start: string; data: FsInstance[] }[]\n        }),",
    ersetzen: '        ),',
  },
  {
    id: 'wp-gleicher-platz-gleicher-zustand',
    datei: 'src/app/reducer.ts',
    regel: 'Dieselbe Gruppe noch einmal setzen ändert nichts — derselbe Zustand, nichts geschrieben.',
    suchen: '      return eintraege === state.planEintraege ? state : { ...state, planEintraege: eintraege }',
    ersetzen: '      return { ...state, planEintraege: eintraege }',
  },
  {
    id: 'besuch-uebernehmen-ohne-aenderung',
    datei: 'src/app/reducer.ts',
    regel: '„Übernehmen", wo der Besucher schon leitet, ändert nichts und meldet nichts.',
    suchen: "      return fsWeeks === state.fsWeeks ? state : { ...state, fsWeeks, toast: toastKey(state, 'toastZugeteilt') }",
    ersetzen: "      return { ...state, fsWeeks, toast: toastKey(state, 'toastZugeteilt') }",
  },
  {
    id: 'besuch-gleicher-besucher',
    datei: 'src/app/reducer.ts',
    regel: 'Denselben Besucher noch einmal wählen trägt ihn nicht aus und wieder ein.',
    suchen: '      const alt = state.gruppenbesuche.find((b) => b.id === action.id)\n      if (!alt || alt.pid === action.pid) return state',
    ersetzen: '      const alt = state.gruppenbesuche.find((b) => b.id === action.id)\n      if (!alt) return state',
  },
  {
    id: 'thema-reiter-der-woche',
    datei: 'src/app/reducer.ts',
    regel:
      'Zurück zu den Zusammenkünften öffnet die nächste nur, wenn sie in der gezeigten Woche liegt — sonst die unter der Woche.',
    suchen: "  return naechste && naechste.wi === state.week ? naechste.tab : 'mid'",
    ersetzen: "  return naechste ? naechste.tab : 'mid'",
  },
  /* ---- Zurück am Handy, Menüfuß (4.10.2026) ---- */
  {
    id: 'zurueck-bildschirm-zu-start',
    datei: 'src/app/AppShell.tsx',
    regel: 'Zurück auf einem Bildschirm außer Start führt zu Start, statt die App zu verlassen.',
    suchen: "  useBackDismiss(\n    !isLogin && state.screen !== 'start',",
    ersetzen: '  useBackDismiss(\n    false,',
  },
  {
    id: 'zurueck-detail-zuerst',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Zurück schließt zuerst das Personen-Detail, erst dann geht es zu Start.',
    suchen: 'useBackDismiss(selected !== undefined,',
    ersetzen: 'useBackDismiss(false,',
  },
  {
    id: 'zurueck-plan-zuerst',
    datei: 'src/planen/WeiterePlaenePlan.tsx',
    regel: 'Zurück schließt zuerst den geöffneten Plan, erst dann geht es zu Start.',
    suchen: "  useBackDismiss(plan !== undefined, () => setOffen(null), 'unteransicht')",
    ersetzen: "  useBackDismiss(false, () => setOffen(null), 'unteransicht')",
  },
  {
    id: 'zurueck-verbraucht',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Hat ein Zurück-Druck den Eintrag einer Ebene genommen, räumt ihr Schließen nichts mehr ab — sonst nähme es den Eintrag der Ebene darunter mit.',
    suchen: '      } else if (!lage.verbraucht) austragen()',
    ersetzen: '      } else austragen()',
  },
  {
    id: 'zurueck-unterwegs-wartet',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Geht eine Ebene auf, während ein eigener Rückschritt unterwegs ist, legt sie ihren Eintrag erst danach an — ein pushState bräche den Rückschritt ab, und der nächste Druck ginge verloren.',
    suchen: '  if (unterwegs > 0) {\n    nachzutragen++ // erst, wenn der eigene Rückschritt angekommen ist\n    return\n  }\n',
    ersetzen: '',
  },
  {
    id: 'zurueck-rang',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Zurück trifft die Ebene mit dem höchsten Rang, nicht die zuletzt eingehängte — React hängt Kinder vor Eltern ein.',
    suchen: '    if (!beste || lage.rang > beste.rang || (lage.rang === beste.rang && lage.nr > beste.nr)) beste = lage',
    ersetzen: '    if (!beste || lage.nr > beste.nr) beste = lage',
  },
  /* ---- Zurück nach einem Push-Tipp: ohne Geste ein Wächter (4.10.2026) ---- */
  {
    id: 'zurueck-ohne-geste-waechter',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Geht eine Ebene ohne Geste auf (der Bildschirm nach einem Push-Tipp), legt sie keinen Eintrag an, sondern einen Wächter — Chromium überspränge den Eintrag, und die Zurück-Taste schlösse die App.',
    suchen: '    if (Klasse && ohneGeste() && stapel.every((andere) => andere.waechter)) {',
    ersetzen: '    if (false) {',
  },
  {
    id: 'zurueck-waechter-schliesst',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Die Zurück-Taste schließt eine Ebene mit Wächter — nach einem Push-Tipp führt sie zu Start.',
    suchen: '    lage.verbraucht = true\n    lage.schliessen()\n  }\n  lage.waechter = waechter',
    ersetzen: '    lage.verbraucht = true\n  }\n  lage.waechter = waechter',
  },
  {
    id: 'zurueck-waechter-abloesen',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Geht danach eine Ebene mit Geste auf, bekommt die Ebene mit Wächter ihren Eintrag nachgetragen, und der Wächter geht — sonst träfe die Zurück-Taste zuerst ihn, also die untere Ebene.',
    suchen: '    } else {\n      waechterAbloesen()\n',
    ersetzen: '    } else {\n',
  },
  {
    id: 'zurueck-waechter-nur-ueber-waechtern',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Liegt schon eine Ebene mit Eintrag offen, bekommt auch eine Ebene ohne Geste einen Eintrag — ein Wächter darüber schlösse vor der höher rangierenden Ebene darunter.',
    suchen: '    if (Klasse && ohneGeste() && stapel.every((andere) => andere.waechter)) {',
    ersetzen: '    if (Klasse && ohneGeste()) {',
  },
  {
    id: 'zurueck-waechter-abbauen',
    datei: 'src/components/useBackDismiss.ts',
    regel:
      'Schließt eine Ebene mit Wächter anders als über die Taste, geht ihr Wächter mit — sonst träfe der nächste Druck eine Ebene, die es nicht mehr gibt.',
    suchen: '        lage.waechter.destroy() // ohne Eintrag ist nichts abzuräumen\n',
    ersetzen: '',
  },
  {
    id: 'zurueck-mit-geste-eintrag',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Mit Geste bleibt es beim Verlaufseintrag — der Wächter springt nur ein, wo kein Eintrag zählen würde.',
    suchen: '  return (navigator as { userActivation?: UserActivation }).userActivation?.isActive === false',
    ersetzen: '  return true',
  },
  {
    id: 'zurueck-ohne-closewatcher-eintrag',
    datei: 'src/components/useBackDismiss.ts',
    regel: 'Ohne CloseWatcher (Firefox, Safari) bleibt es auch ohne Geste beim Verlaufseintrag.',
    suchen: '    if (Klasse && ohneGeste() && stapel.every((andere) => andere.waechter)) {',
    ersetzen: '    if (ohneGeste() && stapel.every((andere) => andere.waechter)) {',
  },
  {
    id: 'abmelden-statusseite',
    datei: 'src/app/AppShell.tsx',
    regel: 'Wo statt des Profils eine Statusseite steht (kein Mitglied, Ladefehler, leere Versammlung), meldet sie selbst ab.',
    // Seit dem Startbild (19.10.2026) gibt es keine Statusseite „Lädt" mehr, die ohne Knopf bliebe.
    suchen: '      <AbmeldenKnopf className="btn-outline status-btn" />',
    ersetzen: '      {false && <AbmeldenKnopf className="btn-outline status-btn" />}',
  },
  {
    id: 'abmelden-profil-knopf',
    datei: 'src/profil/ProfilScreen.tsx',
    regel: '„Abmelden" ist ein Knopf wie „App installieren", keine Textzeile.',
    suchen: '            <AbmeldenKnopf className="knopf-umriss" />',
    ersetzen: '            <AbmeldenKnopf className="" />',
  },
  {
    id: 'abmelden-fragt-nach',
    datei: 'src/components/AbmeldenKnopf.tsx',
    regel: 'Abmelden fragt erst nach („Wirklich abmelden?") — ein einzelner Tipp meldet nicht ab.',
    suchen: '      onClick={abmelden.onClick}',
    ersetzen: '      onClick={() => performLogout(dispatch)}',
  },
  {
    id: 'abwesenheit-fragt-nach',
    datei: 'src/components/AbwesenheitEntfernen.tsx',
    regel: 'Eine Abwesenheit zu löschen fragt erst nach („Wirklich löschen?") — ein einzelner Tipp löscht nicht.',
    suchen: "  return <EntfernenKnopf className={className} onEntfernen={() => dispatch({ type: 'removeAbsence', id })} />",
    ersetzen:
      "  return <button type=\"button\" className={className} onClick={() => dispatch({ type: 'removeAbsence', id })}>✕</button>",
  },
  /* ---- Das Menü im neuen Design (T121, 12.10.2026) ---- */
  {
    id: 'menue-bereich-zum-ansehen',
    datei: 'src/app/AppShell.tsx',
    regel: 'Ein Bereich im Menü öffnet zum Ansehen — auch wer gerade plant; geplant wird über „Planen" oder „Planung".',
    suchen: '    dispatch(zumAnsehen(thema))\n  }',
    ersetzen: "    dispatch(state.screen === 'planen' ? zumPlanen(thema) : zumAnsehen(thema))\n  }",
  },
  {
    id: 'menue-planenkopf-bereich',
    datei: 'src/app/AppShell.tsx',
    regel: 'Der Kopf des Planens nennt den Bereich, der darunter geplant wird — beim Gruppenaufseher den Predigtdienst.',
    suchen: '  const geplant = geplantesThema(rechte, state.tab)',
    ersetzen: '  const geplant = themaVon(state.tab)',
  },
  {
    id: 'menue-planung-gruppenaufseher',
    datei: 'src/app/AppShell.tsx',
    regel: '„Planung" führt den Gruppenaufseher zu den Treffpunkten, die er planen darf — nicht in die Zusammenkünfte.',
    suchen: "dispatch(hatPlanungsWahl(rechte) ? { type: 'navigate', screen: 'planung' } : zumPlanen('predigtdienst'))",
    ersetzen: "dispatch(hatPlanungsWahl(rechte) ? { type: 'navigate', screen: 'planung' } : zumPlanen('zusammenkuenfte'))",
  },

  // ── Für mich: Start, Meine Aufgaben, Absagen (T121, Phase 3) ──────────────
  {
    id: 'saal-verschweigt-keine-lage',
    datei: 'src/data/saal.ts',
    regel: 'Im Saal bekommt jede vorhandene Lage einen Platz — eine einzige Absage unter dreißig Plätzen verschwindet nicht.',
    suchen: '    if (zahlen[lage] === 0 || out[lage] > 0) continue',
    ersetzen: '    continue',
  },
  {
    id: 'saal-offen-hinten',
    datei: 'src/data/saal.ts',
    regel: 'Offene Plätze sitzen hinten im Saal, die besetzten vorn.',
    suchen: "  const reihe: SaalLage[] = [...wunsch.map((w) => w.lage), ...Array<SaalLage>(frei - vorn).fill('offen')]",
    ersetzen: "  const reihe: SaalLage[] = [...Array<SaalLage>(frei - vorn).fill('offen'), ...wunsch.map((w) => w.lage)]",
  },
  {
    id: 'woche-nur-was-noch-kommt',
    datei: 'src/dashboard/diese-woche.ts',
    regel: 'Unter „Diese Woche" steht nur, was noch kommt — am Donnerstag nicht mehr der Dienstag.',
    suchen: '    if (ms === null || ms < ab) continue',
    ersetzen: '    if (ms === null) continue',
  },
  {
    id: 'woche-nur-eigene-gruppe',
    datei: 'src/dashboard/diese-woche.ts',
    regel: 'Unter „Diese Woche" stehen die Treffpunkte der eigenen Gruppen und der Versammlung, nicht die fremder Gruppen.',
    suchen: '    if (inst.grp !== null && !gruppen.has(inst.grp)) continue',
    ersetzen: '',
  },
  {
    id: 'woche-auch-geleitete-gruppe',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Unter „Diese Woche" stehen auch die Treffpunkte der Gruppe, die man leitet — wie im Predigtdienst.',
    suchen: 'eigeneGruppen(persons, groups, personId)',
    ersetzen: 'new Set(persons.find((p) => p.id === personId)?.grp ? [persons.find((p) => p.id === personId)!.grp!] : [])',
  },
  {
    id: 'alle-bestaetigen-nur-offene',
    datei: 'src/app/persist.ts',
    regel: '„Alle bestätigen" sagt nur zu, was offen war — eine Absage wird dabei nicht still zur Zusage.',
    suchen: "        if (task.status === 'offen') saveConfirmation(congId, userId, task.id, 'bestätigt')",
    ersetzen: "        saveConfirmation(congId, userId, task.id, 'bestätigt')",
  },
  {
    id: 'absage-nachricht-als-freitext',
    datei: 'src/app/reducer.ts',
    regel: 'Die Nachricht beim Absagen steht als Freitext in der Mitteilung — kein Übersetzer macht aus „Markus 2" ein Bibelbuch.',
    suchen: '  return text ? ` · ${alsFreitext(text)}` : \'\'',
    ersetzen: '  return text ? ` · ${text}` : \'\'',
  },
  {
    id: 'absage-abwesend-nur-mit-schalter',
    datei: 'src/aufgaben/AbsageBlatt.tsx',
    regel: 'Beim Absagen wird der Tag nur als abwesend eingetragen, wenn der Schalter an ist — er steht aus.',
    suchen: '    if (abwesend && tag) {',
    ersetzen: '    if (tag) {',
  },
  {
    id: 'blatt-eigene-fehlergrenze',
    datei: 'src/app/AppShell.tsx',
    regel: 'Geht ein Blatt über einem anderen auf, bleibt das untere eingehängt — es behält seinen Verlaufseintrag.',
    suchen: '  const blatt = (inhalt: ReactNode) => <ErrorBoundary {...fehlerTexte}>{inhalt}</ErrorBoundary>',
    ersetzen: '  const blatt = (inhalt: ReactNode) => <ErrorBoundary key={String(state.s89 != null)} {...fehlerTexte}>{inhalt}</ErrorBoundary>',
  },
  {
    id: 'escape-verbraucht',
    datei: 'src/components/useEscape.ts',
    regel: 'Ein Escape, das ein Blatt schließt, ist verbraucht — Chromium macht daraus keine zweite „close request".',
    suchen: '      event.preventDefault()\n      handler.current()',
    ersetzen: '      handler.current()',
  },
  {
    id: 'zeitraum-von-nie-nach-bis',
    datei: 'src/components/kalender.ts',
    regel: 'Ein Tipp vor „Von" beginnt den Zeitraum neu — Von liegt nie nach Bis, sonst träfe ihn keine Prüfung.',
    suchen: "  if (stand.ende === 'von' || !stand.von || tag < stand.von) {",
    ersetzen: "  if (stand.ende === 'von' || !stand.von) {",
  },
  {
    id: 'abwesenheiten-nur-was-ansteht',
    datei: 'src/components/abwesenheiten.ts',
    regel: 'Im Profil und bei der Person stehen nur Abwesenheiten, die anstehen oder laufen — was vorbei ist, fällt heraus.',
    suchen: '  return liste.filter((a) => a.to >= heute)',
    ersetzen: '  return liste.filter(() => true)',
  },
  {
    id: 'abwesenheit-nur-mit-recht',
    datei: 'src/data/rechte.ts',
    regel: 'Eintragen darf, wen es betrifft, oder ein Admin — wie absences_write; sonst schriebe der Knopf ins Leere.',
    suchen: '  return rechteVon(s).admin || personId === s.personId',
    ersetzen: '  return true',
  },
  {
    id: 'menue-fuss-gruppe-uebersetzt',
    datei: 'src/app/eigene-person.ts',
    regel: 'Die Gruppe unter dem Namen steht in der Sprache der App — im Fuß des Menüs wie im Profil.',
    suchen: '  return gruppe ? [rolle, tu(gruppe.name)] : [rolle]',
    ersetzen: '  return gruppe ? [rolle, gruppe.name] : [rolle]',
  },
  {
    id: 'spaeter-legt-weg',
    datei: 'src/app/reducer.ts',
    regel: '„Später" legt das Blatt beim Öffnen weg, auch wenn noch etwas zu bestätigen ist.',
    suchen: "    case 'closeConfirm':\n      // „Später\" (T121): Das Blatt lässt sich weglegen, auch wenn noch etwas zu\n      // bestätigen ist. Beim nächsten Öffnen der App liegt es wieder da (`login`).\n      return { ...state, confirmOpen: false }",
    ersetzen: "    case 'closeConfirm':\n      return state.myTasks.some((t) => t.status === 'offen') ? state : { ...state, confirmOpen: false }",
  },
  {
    id: 'entfernen-fragt-nach',
    datei: 'src/components/EntfernenKnopf.tsx',
    regel: 'Ein ✕ fragt erst nach („Wirklich löschen?") — ein einzelner Tipp entfernt nichts.',
    suchen: '      onClick={entfernen.onClick}',
    ersetzen: '      onClick={onEntfernen}',
  },
  {
    id: 'entfernen-frage-je-art',
    datei: 'src/components/EntfernenKnopf.tsx',
    regel: 'Was nur herausgenommen wird (Person, Sprache, Konto), fragt „Wirklich entfernen?" — nicht „Wirklich löschen?".',
    suchen: "      {entfernen.armed ? (frage ?? t.loeschenSicher) : (text ?? '✕')}",
    ersetzen: "      {entfernen.armed ? t.loeschenSicher : (text ?? '✕')}",
  },
  {
    id: 'gruppenbesuch-fragt-nach',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Einen Gruppenbesuch zu löschen fragt erst nach — ein einzelner Tipp löscht nicht.',
    suchen:
      "        <EntfernenKnopf\n          className=\"knopf-umriss knopf-entfernen\"\n          text={t.a11yRemove}\n          onEntfernen={() => {\n            dispatch({ type: 'besuchEntfernen', id })",
    ersetzen:
      "        <button\n          type=\"button\"\n          className=\"knopf-umriss knopf-entfernen\"\n          onClick={() => {\n            dispatch({ type: 'besuchEntfernen', id })",
  },
  {
    id: 'dienst-loeschen-fragt-nach',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Einen Dienst zu entfernen fragt erst nach — und die Wache über alle Lösch-Knöpfe merkt einen ohne Rückfrage.',
    suchen:
      "          <EntfernenKnopf\n            className=\"knopf-umriss knopf-entfernen\"\n            text={t.hdEntfernen}\n            onEntfernen={() => dispatch({ type: 'removeService', key: svcKey })}\n          />",
    ersetzen:
      "          <button type=\"button\" className=\"knopf-umriss knopf-entfernen\" onClick={() => dispatch({ type: 'removeService', key: svcKey })}>\n            {t.hdEntfernen}\n          </button>",
  },
  {
    id: 'zuteilung-entfernen-fragt-nach',
    datei: 'src/planen/AssignSheet.tsx',
    regel: '„Entfernen" im Zuteilungsblatt fragt erst nach — wer zugesagt hatte, bekäme sofort eine Nachricht.',
    suchen:
      '      <EntfernenKnopf\n        className="knopf-pille zuteilen-entfernen"\n        text={t.entfernen}\n        frage={t.entfernenSicher}\n        onEntfernen={onEntfernen}\n      />',
    ersetzen:
      '      <button type="button" className="knopf-pille zuteilen-entfernen" onClick={onEntfernen}>\n        {t.entfernen}\n      </button>',
  },
  {
    id: 'partner-entfernen-fragt-nach',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Den Partner eines Schülerteils abzuschalten fragt erst nach — mit dem Platz geht, wer dort steht.',
    suchen:
      '  return <EntfernenKnopf className="partner-toggle" text={t.partnerEntfernen} frage={t.entfernenSicher} onEntfernen={umschalten} />',
    ersetzen:
      '  return <button type="button" className="partner-toggle" onClick={umschalten}>{t.partnerEntfernen}</button>',
  },
  /* ---- Gruppenbesuche weniger starr (4.10.2026) ---- */
  {
    id: 'gb-aendern-austragen',
    datei: 'src/app/reducer.ts',
    regel: 'Wird ein Besuch verlegt, geht der Besucher aus den bisherigen Treffpunkten — dort leitet er nicht mehr.',
    suchen:
      '      const fsWeeks = besuchEintragen(besuchAustragen(state.fsWeeks, lage.kennungen, alt), lage.kennungen, neu, state.persons)',
    ersetzen: '      const fsWeeks = besuchEintragen(state.fsWeeks, lage.kennungen, neu, state.persons)',
  },
  {
    id: 'gb-aendern-doppelt',
    datei: 'src/app/reducer.ts',
    regel: 'Ein Besuch lässt sich nicht dorthin verlegen, wo dieselbe Gruppe in der Woche schon besucht wird.',
    suchen: '      if (state.gruppenbesuche.some((b) => b !== alt && b.woche === neu.woche && b.grp === neu.grp)) return state',
    ersetzen: '',
  },
  {
    id: 'gb-aendern-vorbei',
    datei: 'src/app/reducer.ts',
    regel: 'Ein vergangener Besuch bleibt, wie er war, und in Vergangenes wird nicht verlegt.',
    suchen: "      if (besuchStand(alt, lage).art === 'vorbei' || besuchStand(neu, lage).art === 'vorbei') return state",
    ersetzen: '',
  },
  {
    id: 'gb-aendern-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Ein verlegter Besuch geht in die Datenbank — samt den Wochen, aus denen und in die er wechselt.',
    suchen: "    case 'besuchAendern':\n",
    ersetzen: '',
  },
  {
    id: 'gb-woche-gesperrt',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Beim Verlegen steht gesperrt, wo die Gruppe schon besucht wird.',
    suchen: 'gesperrt={(w) => andere.some((b) => b.woche === w && b.grp === besuch.grp)}',
    ersetzen: 'gesperrt={() => false}',
  },
  // ── Mitteilungen: ein Tipp führt dorthin, wo sie herkommen (4.10.2026) ────
  {
    id: 'mitteilung-ersatz-einspringen',
    datei: 'src/app/mitteilungen.ts',
    regel: '„Ersatz gesucht" führt zum Einspringen auf „Freie Plätze" — wie der Push.',
    suchen: "  if (n.title === ERSATZ_GESUCHT) return [{ type: 'navigate', screen: 'freie', abschnitt: 'einspringen' }]\n",
    ersetzen: '',
  },
  {
    id: 'einstellung-name-nie-schmaler-als-sein-wort',
    datei: 'src/einstellungen/einstellungen.css',
    regel: 'Der Name einer Einstellung wird nie schmaler als sein längstes Wort — neben einem langen Wert gibt der Wert nach (T137).',
    suchen: '  grid-template-columns: minmax(min-content, 1fr) minmax(0, auto) 20px;\n',
    ersetzen: '  grid-template-columns: minmax(0, 1fr) auto 20px;\n',
  },
  {
    id: 'einstellung-name-neben-wert-trennt-nicht',
    datei: 'src/einstellungen/einstellungen.css',
    regel: 'Neben einem Wert trennt der Name einer Einstellung nicht — sonst schrumpft seine Spalte bis auf eine Silbe (T137).',
    suchen: '.einst-zeile .einst-zeile-name {\n  -webkit-hyphens: manual;\n  hyphens: manual;\n}\n',
    ersetzen: '',
  },
  {
    id: 'zeitleiste-zahl-steht-da',
    datei: 'src/personen/PersonTimeline.tsx',
    regel: 'Unter dem Titel der Zeitleiste steht, wie viel die Person in den letzten acht Wochen hatte (T136, statt der Karte „Auslastung").',
    suchen: '  return <Zeitleiste label={t.zeitleiste} zusatz={zusatz} zeilen={zeilen} />\n',
    ersetzen: '  return <Zeitleiste label={t.zeitleiste} zeilen={zeilen} />\n',
  },
  {
    id: 'zeitleiste-zahl-nur-vergangenes',
    datei: 'src/personen/PersonTimeline.tsx',
    regel: 'Die Zahl in der Zeitleiste zählt nur, was vorbei ist — so viele, wie blass dastehen (T136).',
    suchen: "  const zuletzt = entries.filter((e) => e.vergangen && e.kind !== 'abw').length\n",
    ersetzen: "  const zuletzt = entries.filter((e) => e.kind !== 'abw').length\n",
  },
  {
    id: 'zeitleiste-zahl-ohne-abwesenheit',
    datei: 'src/personen/PersonTimeline.tsx',
    regel: 'Eine Abwesenheit zählt in der Zahl der Zeitleiste nicht als Aufgabe (T136).',
    suchen: "  const zuletzt = entries.filter((e) => e.vergangen && e.kind !== 'abw').length\n",
    ersetzen: '  const zuletzt = entries.filter((e) => e.vergangen).length\n',
  },
  // `planung-bereiche-oben`, `planung-bereiche-spalte` gestrichen (T144,
  // 25.10.2026): „Planung" zeigt nur noch die Wahl, die Spalte nur die Wochen.
  // Die Wahl selbst bewachen die Regeln `planung-wahl-…` weiter unten.
  {
    id: 'planung-bereiche-nur-erlaubte',
    datei: 'src/app/bereich.ts',
    regel: 'Die Wahl nennt nur, was man planen darf — der Gruppenaufseher bekommt keine (T135, T144).',
    suchen: 'export const planbareBereiche = (r: Rechte): Thema[] => BEREICHE.filter((thema) => darfPlanen(r, thema))\n',
    ersetzen: 'export const planbareBereiche = (r: Rechte): Thema[] => [...BEREICHE]\n',
  },
  // ── „Planung": erst die Wahl, Zurück dorthin, woher man kam (T144) ─────────
  {
    id: 'planung-wahl-ohne-wochen',
    datei: 'src/app/AppShell.tsx',
    regel: '„Planung" im Menü zeigt zuerst die Wahl — nicht gleich die Wochen der Zusammenkünfte (T144).',
    suchen: "dispatch(hatPlanungsWahl(rechte) ? { type: 'navigate', screen: 'planung' } : zumPlanen('predigtdienst'))",
    ersetzen: "dispatch(hatPlanungsWahl(rechte) ? { type: 'navigate', screen: 'wochen' } : zumPlanen('predigtdienst'))",
  },
  {
    id: 'planung-wahl-zu-den-wochen',
    datei: 'src/app/bereich.ts',
    regel: '„Zusammenkünfte" auf der Wahl führt zu den Wochen — wo die Spalte passt, gleich in den Plan daneben.',
    suchen: "  mitSpalte ? zumPlanen('zusammenkuenfte', 'planung') : { type: 'navigate', screen: 'wochen' }\n",
    ersetzen: "  zumPlanen('zusammenkuenfte', 'planung')\n",
  },
  {
    id: 'planung-woche-zurueck-zu-den-wochen',
    datei: 'src/app/bereich.ts',
    regel: 'Ein Plan von der Seite der Wochen führt mit Zurück dorthin — auch bei den Treffpunkten geöffnet, nicht zur Wahl (T144).',
    suchen: "  return von === 'wochen' && !mitSpalte ? 'wochen' : 'planung'\n",
    ersetzen: "  return 'planung'\n",
  },
  {
    id: 'planung-nur-aus-planung',
    datei: 'src/app/bereich.ts',
    regel: 'Nur aus „Planung" geht Zurück eine Ebene hinauf — aus der Ansicht beenden ✕ und „Fertig" das Planen wie bisher.',
    suchen: "  if (screen !== 'planen' || (von !== 'planung' && von !== 'wochen') || !hatPlanungsWahl(r)) return null\n",
    ersetzen: "  if (screen !== 'planen' || !hatPlanungsWahl(r)) return null\n",
  },
  {
    id: 'planung-wochen-zurueck-zur-wahl',
    datei: 'src/app/bereich.ts',
    regel: 'Von der Seite der Wochen führt Zurück zur Wahl — im Kopf, vor dem Titel und mit der Zurück-Taste (T144).',
    suchen: "  if (screen === 'wochen') return 'planung'\n",
    ersetzen: '',
  },
  {
    id: 'planung-wochenliste-merkt-herkunft',
    datei: 'src/planen/WochenUebersicht.tsx',
    // Ersetzt durch den Stand vor dem Review von T144: Mit „von der Wahl" führte
    // Zurück aus einer Woche, die bei den Treffpunkten aufging, zur Wahl.
    regel: 'Eine Woche von der Seite der Wochen merkt sich, dass sie von dort kam — Zurück führt zu den Wochen.',
    suchen: "  const von = spalte ? state.planenVon : 'wochen'\n",
    ersetzen: "  const von = spalte ? state.planenVon : 'planung'\n",
  },
  {
    id: 'planung-zuruecktaste-zu-den-wochen',
    datei: 'src/app/AppShell.tsx',
    regel: 'Die Zurück-Taste führt aus dem Plan einer Woche zu den Wochen — dorthin, wohin auch der Kopf führt (T144).',
    suchen: "  useBackDismiss(zurueck === 'wochen', () => navigate('wochen'), 'unteransicht')\n",
    ersetzen: '',
  },
  {
    id: 'planung-zuruecktaste-zur-ansicht',
    datei: 'src/app/AppShell.tsx',
    regel: 'Aus der Ansicht geplant, führt die Zurück-Taste wieder in die Ansicht — nicht zu Start (T144).',
    suchen: "  useBackDismiss(state.screen === 'planen' && state.planenVon === 'ansicht', () => dispatch(zumAnsehen(geplant)), 'unteransicht')\n",
    ersetzen: '',
  },
  {
    id: 'freie-plaetze-alter-push',
    datei: 'src/app/deeplink.ts',
    regel: 'Ein Push „Ersatz gesucht" mit dem alten Ziel „Meine Aufgaben" führt zum Einspringen auf „Freie Plätze" (T134).',
    suchen: '  return abschnitt && FRUEHER_AUF[abschnitt] === go ? ABSCHNITT_AUF[abschnitt] : (go as Screen)\n',
    ersetzen: '  return go as Screen\n',
  },
  {
    id: 'freie-plaetze-im-menue',
    datei: 'src/app/AppShell.tsx',
    regel: '„Freie Plätze" ist ein eigener Menüpunkt gleich unter „Meine Aufgaben" (T134).',
    suchen: "eintraege: [eintrag('start', t.navStart, 'start'), aufgaben, freie, ...mitteilungen] }",
    ersetzen: "eintraege: [eintrag('start', t.navStart, 'start'), aufgaben, ...mitteilungen] }",
  },
  {
    id: 'freie-plaetze-zahl',
    datei: 'src/app/AppShell.tsx',
    regel: 'Am Menüpunkt „Freie Plätze" steht, wie viel man übernehmen kann — Ersatzgesuche und freie Plätze zusammen (T134).',
    suchen: '    zahl: state.substituteReqs.length + state.offenePlaetze.length,\n',
    ersetzen: '    zahl: state.offenePlaetze.length,\n',
  },
  {
    id: 'freie-plaetze-leer',
    datei: 'src/aufgaben/FreiePlaetzeScreen.tsx',
    regel: 'Ohne Gesuch und ohne freien Platz sagt „Freie Plätze" das, statt leer dazustehen (T134).',
    suchen: '      {!gesucheOffen && state.offenePlaetze.length === 0 && <p className="karte aufgaben-leer">{t.freiePlaetzeLeer}</p>}\n',
    ersetzen: '',
  },
  {
    id: 'mitteilung-planer-vor-eigener-aufgabe',
    datei: 'src/app/mitteilungen.ts',
    regel: 'Eine Absage führt den Planer ins Planen, auch wenn es seine eigene Aufgabe war — als Planer sucht er Ersatz.',
    suchen: "  if (lage.zuteilen && AN_DIE_PLANER.has(n.title)) return wocheZeigen('planen', teile, lage.weeks)",
    ersetzen:
      "  if (lage.zuteilen && AN_DIE_PLANER.has(n.title) && !lage.myTasks.some((t) => t.id === n.taskId)) return wocheZeigen('planen', teile, lage.weeks)",
  },
  {
    id: 'mitteilung-woche-der-aufgabe',
    datei: 'src/app/mitteilungen.ts',
    regel: 'Ein Schlüssel einer geladenen Woche führt in genau diese Woche, nicht bloß zum Thema.',
    suchen: "    wi < 0 ? { type: 'navigate', screen, thema: themaVon(tab) }",
    ersetzen: "    wi < 999 ? { type: 'navigate', screen, thema: themaVon(tab) }",
  },
  {
    id: 'mitteilung-treffpunkt-reiter',
    datei: 'src/app/mitteilungen.ts',
    regel: 'Ein Treffpunkt öffnet im Predigtdienst den Reiter Treffpunkte, nicht den zuletzt gewählten.',
    suchen: "  return teile.art === 'fs' ? [hin, { type: 'setFsBereich', bereich: 'treffpunkte' }] : [hin]",
    ersetzen: '  return [hin]',
  },
  {
    id: 'mitteilung-absage-ohne-bestaetigen',
    datei: 'src/app/mitteilungen.ts',
    regel: 'An einer Absage steht nie „Bestätigen" — auch wenn ihr Schlüssel inzwischen die eigene offene Aufgabe ist.',
    suchen: "    n.type !== 'verhindert' &&\n",
    ersetzen: '',
  },
  {
    id: 'mitteilung-offline-nicht-gelesen',
    datei: 'src/mitteilungen/Mitteilung.tsx',
    regel: 'Offline springt der Tipp, ohne „gelesen" zu schicken — die Sperre meldete sonst nur „nur lesen".',
    suchen: 'if (!notif.read && !state.staleAt) dispatch(',
    ersetzen: 'if (!notif.read) dispatch(',
  },
  /* ---- Die Mitteilungen als Seite (T121, Phase 3c) ---- */
  {
    id: 'mitteilung-bestaetigen-nur-offen',
    datei: 'src/app/mitteilungen.ts',
    regel: '„Bestätigen" steht an einer Mitteilung nur, solange die eigene Aufgabe auf Zusage wartet.',
    suchen: "    lage.myTasks.some((t) => t.id === id && t.status === 'offen')",
    ersetzen: '    lage.myTasks.some((t) => t.id === id)',
  },
  {
    id: 'mitteilung-uebernehmen-nur-offenes-gesuch',
    datei: 'src/app/mitteilungen.ts',
    regel: '„Übernehmen" steht an „Ersatz gesucht" nur, solange das Gesuch offen ist.',
    suchen: "  if (n.title === ERSATZ_GESUCHT) return lage.substituteReqs.some((r) => r.key === id) ? { art: 'uebernehmen', id } : null",
    ersetzen: "  if (n.title === ERSATZ_GESUCHT) return { art: 'uebernehmen', id }",
  },
  {
    id: 'mitteilung-kann-nicht-noch-ungelesen',
    datei: 'src/mitteilungen/Mitteilung.tsx',
    regel: '„Ich kann nicht" öffnet nur das Blatt — wer es abbricht, hat nichts beantwortet, die Mitteilung bleibt neu.',
    suchen: "onClick={() => dispatch({ type: 'openAbsage', id: handlung.id })}",
    ersetzen: "onClick={() => { gelesen(); dispatch({ type: 'openAbsage', id: handlung.id }) }}",
  },
  {
    id: 'mitteilungen-alle-gelesen-nur-bei-neuem',
    datei: 'src/mitteilungen/MitteilungenScreen.tsx',
    regel: '„Alle gelesen" steht nur da, solange es Neues gibt.',
    suchen: '{neu.length > 0 && <AlleGelesen className="knopf-umriss mitteilungen-alle" />}',
    ersetzen: '<AlleGelesen className="knopf-umriss mitteilungen-alle" />',
  },
  {
    id: 'push-karte-nicht-bei-verweigert',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Hat der Browser die Berechtigung verweigert, steht keine Karte da, deren Knopf nichts mehr ausrichtet.',
    suchen: '  if (!angemeldet || subscribed || verweigert || weg) return null',
    ersetzen: '  if (!angemeldet || subscribed || weg) return null',
  },
  {
    id: 'glocke-fuehrt-zur-seite',
    datei: 'src/app/AppShell.tsx',
    regel: 'Die Glocke führt auf die Seite der Mitteilungen.',
    suchen: "              onGlocke={() => navigate('mitteilungen')}",
    ersetzen: '              onGlocke={() => undefined}',
  },
  {
    // Bis zum Review von T144 `unterseite-zurueck-zu-start`: Der Kopf der
    // Mitteilungen führte selbst zu Start. Seitdem schließt er, was die Taste
    // schlösse; dass das von den Mitteilungen Start ist, bewacht
    // `zurueck-bildschirm-zu-start`.
    id: 'kopf-zurueck-wie-taste',
    datei: 'src/app/AppShell.tsx',
    regel: 'Der Pfeil im Kopf am Handy schließt, was die Zurück-Taste schlösse — aus den Zusagen erst die Zusagen, nicht gleich hinauf (T144).',
    suchen: '                <UnterseiteKopf titel={unterseiteTitel} onZurueck={zurueckWieDieTaste}>',
    ersetzen: "                <UnterseiteKopf titel={unterseiteTitel} onZurueck={() => navigate(zurueck ?? 'start')}>",
  },
  {
    id: 'kopf-titel-neben-zurueck',
    datei: 'src/app/AppShell.tsx',
    regel: 'Unter „Planung" steht am Handy der Titel des Bereichs im Kopf neben Zurück — nicht eine Zeile darunter (T144, Betreiber 25.10.2026).',
    suchen: '                <UnterseiteKopf titel={unterseiteTitel} onZurueck={zurueckWieDieTaste}>',
    ersetzen: '                <UnterseiteKopf onZurueck={zurueckWieDieTaste}>',
  },
  {
    id: 'bereichstitel-am-handy-im-kopf',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Unter „Planung" ist am Handy die Zeile des Bereichstitels aus — sonst stünde der Titel zweimal da (T144).',
    suchen: '  .bereichstitel--planen .bereichstitel-zeile,\n  .bereichstitel--zurueck .bereichstitel-zeile {\n',
    ersetzen: '  .bereichstitel--planen .bereichstitel-zeile {\n',
  },
  /* ---- Die Versammlung ansehen (T121, Phase 4a) ---- */
  {
    id: 'kongress-statt-programm',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'In der Kongresswoche steht statt der Tage und des Programms die Karte mit den Wegen weiter.',
    suchen: "  const kongress = !isFs && anlassArt(rawWeek) === 'kongress'",
    ersetzen: '  const kongress = false',
  },
  {
    id: 'naechste-ueberspringt-ausfall',
    datei: 'src/data/helpers.ts',
    regel: '„Nächste Zusammenkunft" nach dem Kongress überspringt, was ausfällt.',
    suchen: '    const tab = MEETING_TABS.find((key) => !istAusgefallen(week, key))',
    ersetzen: '    const tab = MEETING_TABS[0]',
  },
  {
    id: 'woche-anlass-vor-aktuell',
    datei: 'src/components/WochenWahl.tsx',
    regel: 'Unter der Woche steht ihr Anlass — „Aktuelle Woche" nur, wenn sie keinen hat.',
    suchen: '        {anlass ? (',
    ersetzen: '        {anlass && !istAktuell ? (',
  },
  {
    id: 'du-gedruckt-mit-namen',
    datei: 'src/programm/PersonZeile.tsx',
    regel: 'Am eigenen Platz steht „Du" — gedruckt wird der Name, der Aushang gilt allen.',
    suchen: "      <span className={du ? 'prog-name nur-druck' : 'prog-name'}>{name || leer || t.offenDash}</span>",
    ersetzen: '      {!du && <span className="prog-name">{name || leer || t.offenDash}</span>}',
  },
  {
    id: 'lied-im-abschnittskopf',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Das Lied aus dem Sammeltitel von Eröffnung und Abschluss steht im Kopf des Abschnitts — es geht nicht verloren.',
    suchen: '    if (song) lieder.push(song)\n',
    ersetzen: '',
  },
  {
    id: 'treffpunkt-bogen-ohne-ort',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Im Bogen der Treffpunkte endet eine Zeile ohne Ort nicht auf einem Trenner (Review 18.10.2026).',
    suchen: "            ]\n              .filter(Boolean)\n              .join(' · '),\n",
    ersetzen: "            ].join(' · '),\n",
  },
  {
    id: 'treffpunkt-bogen-ort-leerzeichen',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Ein Ort aus Leerzeichen gilt im Bogen der Treffpunkte als keiner.',
    suchen: '[inst.time, tu(inst.place).trim()]),\n',
    ersetzen: '[inst.time, tu(inst.place)]),\n',
  },
  {
    id: 'treffpunkt-bogen-statt-ort-leerzeichen',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Auch in „statt …" gilt ein Ort aus Leerzeichen als keiner.',
    suchen: 'regel.time, tu(regel.place).trim()]',
    ersetzen: 'regel.time, tu(regel.place)]',
  },
  {
    id: 'gruppenbesuch-ort-leerzeichen',
    datei: 'src/components/gruppenbesuch-anzeige.ts',
    regel: 'Beim Treffpunkt der Besuchswoche gilt ein Ort aus Leerzeichen als keiner — kein Trenner am Ende.',
    suchen: 'inst.time, tu(inst.place).trim()]',
    ersetzen: 'inst.time, tu(inst.place)]',
  },
  {
    id: 'wochenplanung-montag-aus-der-spalte',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Der feste Studienleiter rechnet mit dem Montag aus der Spalte — der gespeicherte Blob muss ihn nicht tragen.',
    suchen: 'festenWtLeiterEintragen({ ...zeile.data, start: montag },',
    ersetzen: 'festenWtLeiterEintragen(zeile.data,',
  },
  {
    id: 'neuaufbau-geschichte-ganzes-jahr',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Mit --ab holt der Neuaufbau ohne --wochen das ganze Jahr bis sieben voraus, nicht acht Wochen vor einem Jahr.',
    suchen: 'String(arg.wochen ?? (seit.length ? 60 : 8))',
    ersetzen: 'String(arg.wochen ?? 8)',
  },
  {
    id: 'lied-im-kopf-ohne-thema',
    datei: 'src/data/helpers.ts',
    regel: 'Im Kopf eines Abschnitts steht das Lied nur mit Nummer — das Liedthema aus dem Studienartikel nie (Betreiber 18.10.2026).',
    suchen: '  return nr === null ? song : `Lied ${nr}`\n',
    ersetzen: '  return song\n',
  },
  {
    id: 'lied-im-kopf-beim-ansehen',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Beim Ansehen und im Druck steht das Lied des Wachtturm-Studiums nur mit Nummer im Kopf.',
    suchen: '      lieder.push(tpw(liedImKopf(item.song)))\n',
    ersetzen: '      lieder.push(tpw(item.song))\n',
  },
  {
    id: 'lied-im-kopf-beim-planen',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Beim Planen steht das Lied des Wachtturm-Studiums nur mit Nummer im Kopf.',
    suchen: 'isSong(item) ? tpw(liedImKopf(item.song))',
    ersetzen: 'isSong(item) ? tpw(item.song)',
  },
  {
    id: 'lied-im-kopf-im-programmblatt',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Im Programmblatt steht ein Lied nur mit Nummer im Kopf seines Abschnitts.',
    suchen: '[tpw(liedImKopf(item.song))]',
    ersetzen: '[tpw(item.song)]',
  },
  {
    id: 'ausfall-beim-ansehen',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Fällt eine Zusammenkunft aus, steht es beim Ansehen mit dem Grund — nicht nur durchgestrichen.',
    suchen: '      <AusfallBanner week={rawWeek} tab={mtab(tab)} />\n',
    ersetzen: '',
  },
  {
    id: 'druck-woche-vorgewaehlt',
    datei: 'src/programm/DruckWahl.tsx',
    regel: 'Im Blatt „Drucken" ist die Woche vorgewählt — der Monat ist die Ausnahme.',
    suchen: '  const [ganzerMonat, setGanzerMonat] = useState(false)',
    ersetzen: '  const [ganzerMonat, setGanzerMonat] = useState(true)',
  },
  {
    id: 'druck-blatt-weg-vor-druck',
    datei: 'src/programm/DruckWahl.tsx',
    regel: 'Das Blatt „Drucken" ist weg, bevor gedruckt wird — sonst stünde es im Ausdruck.',
    suchen: '            flushSync(() => setOffen(false))\n',
    ersetzen: '            setOffen(false)\n',
  },
  {
    id: 'tageskarte-echter-tag',
    datei: 'src/components/MeetingTabs.tsx',
    regel: 'Die Karte einer verlegten Zusammenkunft nennt ihren echten Tag, nicht den Rhythmus.',
    suchen: '        const datum = week\n          ? meetingDate(week, key, zeiten)',
    ersetzen: '        const datum = false\n          ? meetingDate(week, key, zeiten)',
  },
  /* ---- Die Versammlung ansehen: Tablet und Desktop (T121, Phase 4a-2) ---- */
  {
    id: 'dauer-an-der-zahl',
    datei: 'src/data/helpers.ts',
    regel: 'Die Dauer ist der Teil der Meta-Zeile mit der Zahl aus den Daten — nicht der erste Teil mit irgendeiner Zahl.',
    suchen: '    if (ersteZahl(teil) === mins && (!beste || teil.length < beste.teil.length)) beste = { index, teil }',
    ersetzen: '    if (ersteZahl(teil) !== null && !beste) beste = { index, teil }',
  },
  {
    id: 'dauer-kuerzerer-gewinnt',
    datei: 'src/data/helpers.ts',
    regel: 'Tragen zwei Teile die Zahl der Dauer, ist der kürzere die Dauer — nicht der vordere („Studienartikel 30 · 30 Min.").',
    suchen: '(!beste || teil.length < beste.teil.length)',
    ersetzen: '!beste',
  },
  {
    id: 'dauer-sonst-zeile-ganz',
    datei: 'src/data/helpers.ts',
    regel: 'Passt kein Teil zur Dauer, bleibt die Meta-Zeile ganz — nichts geht verloren.',
    suchen: "  if (!beste) return { dauer: null, rest: meta }",
    ersetzen: "  if (!beste) return { dauer: null, rest: '' }",
  },
  {
    id: 'dauer-in-der-zeile',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Die Dauer steht neben dem Titel, der Rahmen darunter.',
    suchen: "  const { dauer, rest } = dauerAbtrennen(item.meta ?? '', item.mins)",
    ersetzen: "  const { dauer, rest } = { dauer: null, rest: item.meta ?? '' }",
  },
  {
    id: 'tablet-druck-neben-woche',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'Ab dem Tablet steht „Drucken" neben der Wochenwahl, nicht ein zweites Mal neben dem Termin.',
    suchen: '  const druckNebenTermin = breit ? null : druck',
    ersetzen: '  const druckNebenTermin = druck',
  },
  {
    id: 'kongress-ohne-druck',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'In der Kongresswoche gibt es keinen Druckknopf — es gibt nichts zu drucken.',
    suchen: '  const druck = kongress ? null : (',
    ersetzen: '  const druck = false ? null : (',
  },
  {
    id: 'kongress-gewohnte-spalte',
    datei: 'src/programm/ProgrammScreen.tsx',
    regel: 'Die volle Breite neben dem Menü bekommen nur die zwei Spalten, nicht die Karte des Kongresses.',
    suchen: '  const zweiSpalten = beideTage && !kongress',
    ersetzen: '  const zweiSpalten = beideTage',
  },
  {
    id: 'beide-tage-nicht-im-predigtdienst',
    datei: 'src/programm/useBeideTage.ts',
    regel: 'Im Predigtdienst gibt es keine zwei Tage nebeneinander — dort bleibt der Plan der Treffpunkte.',
    suchen: "  return desktop && state.tab !== 'fs'",
    ersetzen: '  return desktop',
  },
  {
    // Bis zum 21.10.2026 eine Tabelle beider Tage unter dem Wochenende, mit
    // dem ausgefallenen Tag durchgestrichen im Kopf (`desktop-ausfall-im-tabellenkopf`).
    id: 'desktop-hilfsdienste-je-tag',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Am Desktop stehen unter jedem Tag nur seine eigenen Hilfsdienste — der Sonntag zeigt nicht die unter der Woche.',
    suchen: '      <Hilfsdienste helpers={meeting.helpers} me={me} ebene="h3" />',
    ersetzen: '      <Hilfsdienste helpers={week.mid.helpers} me={me} ebene="h3" />',
  },
  {
    id: 'desktop-hilfsdienste-unter-dem-tag',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Die Hilfsdienste eines Tages stehen unter seiner Überschrift (h3), nicht gleichrangig neben ihr.',
    suchen: '      <Hilfsdienste helpers={meeting.helpers} me={me} ebene="h3" />',
    ersetzen: '      <Hilfsdienste helpers={meeting.helpers} me={me} ebene="h2" />',
  },
  {
    id: 'druck-thema-beide-tage',
    datei: 'src/programm/druck.ts',
    regel: 'Stehen beide Tage im Blatt, nennt der Kopf „Zusammenkünfte" — nicht den zuletzt gewählten Tag.',
    suchen: '  if (beideTage) return t.navZusammenkuenfte\n',
    ersetzen: '',
  },
  {
    id: 'fusszeile-im-druck',
    datei: 'src/programm/print.css',
    regel: 'Die Fußzeile („Stand") ist am Bildschirm aus — im Druck blendet print.css sie wieder ein.',
    suchen: '    display: flex;\n    justify-content: space-between;\n    gap: 6mm;\n',
    ersetzen: '',
  },
  /* ---- Predigtdienst ansehen (T121, Phase 4b) ---- */
  {
    id: 'treffpunkt-deine-gruppe-am-tag',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Wer alle Gruppen sieht, liest „Deine Gruppe" nicht am Tag — dort meinte es eine von vielen.',
    suchen: '{!amTreffpunkt && tag.items.some(eigene) && ',
    ersetzen: '{tag.items.some(eigene) && ',
  },
  {
    id: 'treffpunkt-deine-gruppe-am-punkt',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Wer alle Gruppen sieht, liest „Deine Gruppe" am Treffpunkt der eigenen Gruppe.',
    suchen: 'deine={amTreffpunkt && eigene(inst)}',
    ersetzen: 'deine={false}',
  },
  {
    id: 'treffpunkt-leiter-du-ueber-id',
    datei: 'src/programm/FsProgram.tsx',
    regel: 'Am Treffpunkt heißt der eigene Leiterplatz „Du" über die Id — ein Leiter als Freitext gehört niemandem.',
    suchen: 'du={me != null && gehoertZu(fsLeiterZuteilung(inst), me)}',
    ersetzen: 'du={me != null && gehoertZu({ name: inst.leader }, me)}',
  },
  {
    id: 'eigene-gruppe-auch-geleitet',
    datei: 'src/data/fs.ts',
    regel: 'Die eigene Gruppe ist auch die, die man leitet, ohne in ihr geführt zu sein.',
    suchen: '  if (geleitet) meine.add(geleitet)\n',
    ersetzen: '',
  },
  {
    id: 'besuch-eigene-gruppe-hervorgehoben',
    datei: 'src/programm/GruppenbesucheAnsicht.tsx',
    regel: 'Unter allen Besuchen ist der der eigenen Gruppe hervorgehoben.',
    suchen: "className={besuch.grp === meineGruppe ? 'gb-liste-zeile is-eigen' : 'gb-liste-zeile'}",
    ersetzen: 'className="gb-liste-zeile"',
  },
  /* ---- Weitere Pläne ansehen (T121, Phase 4c) ---- */
  {
    id: 'plaene-wahl-zeigt-gewaehlten',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Gibt es mehrere Pläne, zeigt die Ansicht den gewählten — nicht immer den ersten.',
    suchen: '  const plan = plaene.find((p) => p.id === gewaehlt) ?? plaene[0]',
    ersetzen: '  const plan = plaene[0]',
  },
  {
    id: 'plaene-eigene-zeile-hervorgehoben',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Im Plan ist die Zeile der eigenen Gruppe hervorgehoben.',
    suchen: "className={meineGruppe && grp === meineGruppe ? 'wp-liste-zeile is-eigen' : 'wp-liste-zeile'}",
    ersetzen: 'className="wp-liste-zeile"',
  },
  {
    id: 'plaene-ohne-gruppe-nichts-hervorgehoben',
    datei: 'src/programm/WeiterePlaeneAnsicht.tsx',
    regel: 'Wer keine Gruppe hat, sieht keine Zeile als die eigene — auch die noch offene nicht (beide `null`).',
    suchen: '{meineGruppe && grp === meineGruppe ?',
    ersetzen: '{grp === meineGruppe ?',
  },
  {
    id: 'ansicht-drucken-wort-ab-tablet',
    datei: 'src/programm/AnsichtDrucken.tsx',
    regel: 'Ab dem Tablet trägt auch der Druckknopf der Pläne ohne Woche sein Wort.',
    suchen: '        <DruckKnopf mitText={breit} onClick={() => drucken(zeichne())} />',
    ersetzen: '        <DruckKnopf mitText={false} onClick={() => drucken(zeichne())} />',
  },
  /* ---- Gesamt-Review des neuen Designs (T121, 13.10.2026) ---- */
  {
    id: 'schublade-escape',
    datei: 'src/app/Menue.tsx',
    regel: 'Escape schließt die Schublade — über `useEscape`, wie jedes Blatt.',
    suchen: '  useEscape(onSchliessen)\n',
    ersetzen: '',
  },
  {
    id: 'schublade-zurueck',
    datei: 'src/app/Menue.tsx',
    regel: 'Die Zurück-Taste schließt die Schublade, statt den Bildschirm zu verlassen.',
    suchen: '  useBackDismiss(true, onSchliessen)\n',
    ersetzen: '',
  },
  /* ---- Woche einrichten und Programm (T121, Phase 5b) ---- */
  {
    id: 'einrichten-anlass-gewaehlt',
    datei: 'src/planen/WochePanel.tsx',
    regel: 'Gewählt steht der Anlass, den die Woche hat — ohne Anlass „Normale Woche".',
    suchen: 'an={(art ?? null) === wert}',
    ersetzen: 'an={false}',
  },
  {
    id: 'einrichten-abweichung-offen',
    datei: 'src/planen/WochePanel.tsx',
    regel: 'Weicht eine Zusammenkunft schon ab, steht ihre Abweichung offen da.',
    suchen: 'const [offen, setOffen] = useState(() => weichtAb(week, tab))',
    ersetzen: 'const [offen, setOffen] = useState(false)',
  },
  {
    id: 'einrichten-ebene-ohne-tage',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: '„Woche einrichten" ist eine Ebene unter dem Plan — ohne die Karten der Tage.',
    suchen: '{!isFs && !isEdit && (',
    ersetzen: '{!isFs && (',
  },
  {
    id: 'programm-nur-mit-minuten',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Bearbeiten lassen sich nur Punkte von „Unser Leben als Christ", die Minuten tragen.',
    suchen: 'return lac && itemMinutes(rawItem) != null ? (',
    ersetzen: 'return lac ? (',
  },
  {
    id: 'programmpunkt-an-kennung',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Das Blatt eines Punkts findet ihn an seiner Kennung — verschoben bleibt es bei ihm.',
    suchen: 'const ii = section.items.findIndex((item) => !isSong(item) && item.iid === iid)',
    ersetzen: 'const ii = section.items.findIndex((item) => !isSong(item))',
  },
  {
    id: 'programmpunkt-entfernt-schliesst',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Mit dem entfernten Punkt geht sein Blatt zu.',
    suchen: "            dispatch({ type: 'lacRemove', si, ii })\n            onClose()",
    ersetzen: "            dispatch({ type: 'lacRemove', si, ii })",
  },
  {
    id: 'programmpunkt-neu-braucht-titel',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein eigener Punkt braucht einen Titel — leer bittet die App darum.',
    suchen: '    if (!titel.trim()) {',
    ersetzen: '    if (false) {',
  },
  /* ---- Automatisch und Plan senden (T121, Phase 5c) ---- */
  {
    id: 'auto-umfang-woche',
    datei: 'src/data/planning.ts',
    regel: '„Ganze Woche" wirkt auf beide Zusammenkünfte, der Tag auf die gezeigte.',
    suchen: "  const tabs = umfang === 'tag' ? [gezeigt] : MEETING_TABS\n",
    ersetzen: '  const tabs = [gezeigt]\n',
  },
  {
    id: 'auto-umfang-ohne-ausfall',
    datei: 'src/data/planning.ts',
    regel: 'Eine ausgefallene Zusammenkunft gehört nie zum Umfang von „Automatisch" — ihre Zuteilungen ruhen nur.',
    suchen: '  return tabs.filter((tab) => !istAusgefallen(week, tab))\n',
    ersetzen: '  return tabs\n',
  },
  {
    id: 'auto-zaehlt-ohne-gastredner',
    datei: 'src/data/planning.ts',
    regel: 'Das Blatt zählt den Gastredner nicht mit — „Automatisch" füllt und leert ihn nie.',
    suchen: "    if (platz.art !== 'helper' && isGuestRole(platz.slot.rolle)) continue\n",
    ersetzen: '',
  },
  {
    id: 'leeren-alles-beide-bereiche',
    datei: 'src/data/planning.ts',
    regel: '„Leeren" mit beiden Bereichen leert auch die Hilfsdienste.',
    suchen: "  if (scope !== 'parts') {\n    // Über alles Gespeicherte",
    ersetzen: "  if (scope === 'helpers') {\n    // Über alles Gespeicherte",
  },
  {
    id: 'auto-woche-zusagen-beider',
    datei: 'src/app/reducer.ts',
    regel: 'Wer beim Leeren der ganzen Woche seinen Platz verliert, verliert seine Zusage — auch am Wochenende.',
    suchen: '  return umfangTabs(state, umfang).flatMap(',
    ersetzen: '  return [mtab(state.tab)].flatMap(',
  },
  {
    id: 'blatt-auto-vorwahl',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Vorgewählt sind nur die Bereiche, in denen am Tag etwas offen ist.',
    suchen: '    return new Set(BEREICHE.filter((b) => amTag[b].besetzt < amTag[b].gesamt))',
    ersetzen: '    return new Set(BEREICHE)',
  },
  {
    id: 'blatt-auto-beide-heisst-alles',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Beide Bereiche gewählt heißt „alles" für Auto-Zuteilung und Leeren.',
    suchen: "  if (gewaehlt.size === BEREICHE.length) return 'all'\n",
    ersetzen: '',
  },
  {
    id: 'blatt-auto-schickt-umfang',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: '„Zuteilen" schickt den gewählten Umfang mit.',
    suchen: "            dispatch({ type: 'autoAssign', scope, umfang })",
    ersetzen: "            dispatch({ type: 'autoAssign', scope, umfang: 'tag' })",
  },
  {
    id: 'blatt-auto-wahl-entschaerft',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Jede andere Wahl nimmt ein „Wirklich leeren?" zurück — es galt der alten.',
    suchen: '  const umschalten = (b: Bereich): void => {\n    leeren.entschaerfen()\n',
    ersetzen: '  const umschalten = (b: Bereich): void => {\n',
  },
  {
    id: 'blatt-senden-liste-grenze',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Bei vielen offenen Zuteilungen steht keine Namensliste, nur der Satz.',
    suchen: '  const liste = n !== 0 && n <= LISTEN_GRENZE\n',
    ersetzen: '  const liste = n !== 0\n',
  },
  {
    id: 'blatt-senden-gesperrt-ohne-offene',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Ist nichts mehr offen, lässt sich „Plan senden" nicht drücken.',
    suchen: '        <GesperrterKnopf className="knopf-haupt" gesperrt={laeuft || n === 0}',
    ersetzen: '        <GesperrterKnopf className="knopf-haupt" gesperrt={laeuft}',
  },
  {
    // Ersetzt seit Phase 9 `s89-druck-ohne-aktionsleiste` (print-s89.css):
    // Die Bögen hängen unter `body`, eine Regel blendet alles andere aus.
    id: 'bogen-blendet-alles-andere-aus',
    datei: 'src/druck/druck-bogen.css',
    regel: 'Im Druck eines Bogens kommt nur der Bogen aufs Papier — nicht die App darum herum.',
    suchen: "  :root[data-print='bogen'] body > :not(.druck-bogen) {\n",
    ersetzen: "  :root[data-print='bogen'] body > .gibt-es-nicht {\n",
  },
  // Papier und Seiten (25.10.2026): Wochenbogen als Letter auf zwei Seiten, RTL mit leerer Seite.
  {
    id: 'druck-papier-nur-benannt',
    datei: 'src/programm/print.css',
    regel: 'Der Bildschirmdruck gibt kein Papier vor — seine Seite ohne Namen gälte für jeden Druck und nähme den Bögen ihr A4.',
    suchen: '    margin: 12mm 14mm;\n',
    ersetzen: '    size: portrait;\n    margin: 12mm 14mm;\n',
  },
  {
    id: 'zettel-eigene-seite',
    datei: 'src/personen/print-anmeldezettel.css',
    regel: 'Die Anmeldezettel liegen auf ihrer eigenen A4-Seite mit 9 mm Rand.',
    suchen: '    page: zettel;\n',
    ersetzen: '',
  },
  {
    id: 'druck-behaelter-ltr',
    datei: 'src/druck/druck-bogen.css',
    regel: 'Der Behälter der Blätter läuft links-nach-rechts — rechts-nach-links hängte Chrome eine leere Seite an.',
    suchen: '  direction: ltr;\n',
    ersetzen: '',
  },
  {
    id: 'fs-abweichung-entfaellt',
    datei: 'src/data/fs.ts',
    regel: 'Ein für die Woche entfernter Treffpunkt des Grundplans steht unter „Anders als sonst" als entfallen.',
    suchen: "    if (!istNachRegel.has(s.ruleId)) out.push({ art: 'entfaellt', inst: s, regel: s.ruleId ? regelVon.get(s.ruleId) : undefined })\n",
    ersetzen: '',
  },
  {
    id: 'fs-abweichung-ohne-aus',
    datei: 'src/data/fs.ts',
    regel: 'Verglichen wird mit dem Grundplan ohne die ausgesetzten Wochen — sonst entfiele nie etwas.',
    suchen: '  const soll = genFsWeek(wochenStart, rules.map((r) => ({ ...r, aus: [] })))\n',
    ersetzen: '  const soll = genFsWeek(wochenStart, rules)\n',
  },
  {
    id: 'treffpunkt-bogen-sichtbar',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Auf dem Bogen der Treffpunkte steht, was der Leser auch am Bildschirm sieht — ohne Zuteilen die eigene Gruppe.',
    suchen: '  const sichtbar = (insts: readonly FsInstance[]) => fsVisible(insts, state.persons, state.groups, state.personId, alle)\n',
    ersetzen: '  const sichtbar = (insts: readonly FsInstance[]) => [...insts]\n',
  },
  {
    id: 'treffpunkt-bogen-leiter-offen',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Ein Treffpunkt ohne Leiter steht auf dem Bogen gepunktet da.',
    suchen: '  const leiter = (inst: FsInstance) => (inst.leader ? inst.leader : <Offen breite={140} />)\n',
    ersetzen: '  const leiter = (inst: FsInstance) => inst.leader\n',
  },
  {
    id: 'besuch-fremd-ohne-treffpunkt',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Von fremden Gruppenbesuchen druckt nur, wer zuteilt, Ort und Zeit — sonst Woche und Gruppe.',
    suchen: '      const treffpunkt = alle || meine.has(besuch.grp) ? stand.treffpunkte[0] : undefined\n',
    ersetzen: '      const treffpunkt = stand.treffpunkte[0]\n',
  },
  {
    id: 'gruppenbesuch-bogen-nur-kommende',
    datei: 'src/druck/TreffpunktBogen.tsx',
    regel: 'Der Bogen der Gruppenbesuche nennt nur die kommenden, wie die Ansicht.',
    suchen: "    .filter(({ stand }) => !nurKommende || stand.art !== 'vorbei')\n",
    ersetzen: '',
  },
  {
    id: 'druckwahl-treffpunkte-bogen',
    datei: 'src/programm/DruckWahl.tsx',
    regel: 'Im Predigtdienst druckt „Diese Woche" den Bogen der Treffpunkte.',
    suchen: "        <TreffpunktBogen wochen={[wi]} zeitraum={week ? wochenZeitraum(week, state.lang, zeitraum ?? '') : (zeitraum ?? '')} />\n",
    ersetzen: '        <WochenBogen wi={wi} />\n',
  },
  {
    id: 'trolley-bogen-zwei-wochen',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Der Bogen der Trolleys reicht zwei Wochen weit.',
    suchen: 'const TAGE = 14\n',
    ersetzen: 'const TAGE = 7\n',
  },
  {
    id: 'trolley-bogen-gesucht-gestrichelt',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Auf dem Bogen der Trolleys ist gestrichelt, wo jemand einen Partner sucht.',
    suchen: "                  <span key={termin.id} className={termin.partner ? 'druck-termin' : 'druck-termin is-gesucht'}>\n",
    ersetzen: '                  <span key={termin.id} className="druck-termin">\n',
  },
  {
    id: 'trolley-bogen-neue-woche',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Zwischen den beiden Wochen steht ein kräftigerer Strich.',
    suchen: "        <div key={tag} className={i === 7 ? 'druck-trolley-zeile is-neue-woche' : 'druck-trolley-zeile'} style={spalten}>\n",
    ersetzen: '        <div key={tag} className="druck-trolley-zeile" style={spalten}>\n',
  },
  {
    id: 'trolley-ansicht-druckt-bogen',
    datei: 'src/trolleys/TrolleyAnsicht.tsx',
    regel: 'Der Druckknopf der Trolleys druckt den Bogen über zwei Wochen, nicht den Bildschirm.',
    suchen: '        <AnsichtDrucken titel={t.fsTrolleysTab} bogen={() => <TrolleyBogen montag={montag} />} />\n',
    ersetzen: '        <AnsichtDrucken titel={t.fsTrolleysTab} />\n',
  },
  {
    id: 's89-ort-angekreuzt',
    datei: 'src/components/S89Karte.tsx',
    regel: 'Auf dem S-89 ist der Raum angekreuzt, in dem der Teil stattfindet — die Zusätzliche Klasse, wenn er dort ist.',
    suchen: '            <Ort an={payload.aux === true}>{t.auxKlasse}</Ort>\n',
    ersetzen: '            <Ort an={false}>{t.auxKlasse}</Ort>\n',
  },
  {
    id: 's89-nur-angekreuzter-vorgelesen',
    datei: 'src/components/S89Karte.tsx',
    regel: 'Vorgelesen wird nur der angekreuzte Raum — sonst wüsste man nicht, welcher gilt.',
    suchen: "    <span className={an ? 's89-ort is-an' : 's89-ort'} aria-hidden={an ? undefined : true}>\n",
    ersetzen: "    <span className={an ? 's89-ort is-an' : 's89-ort'}>\n",
  },
  {
    id: 's89-blatt-sechs-felder',
    datei: 'src/druck/S89Druck.tsx',
    regel: 'Auch ein halb leeres letztes S-89-Blatt hat sechs Felder — die Schnittkanten stehen, wo sie immer stehen.',
    suchen: '            {Array.from({ length: S89_JE_BLATT }, (_unused, i) => blatt[i]).map((z, i) => (\n',
    ersetzen: '            {blatt.map((z, i) => (\n',
  },
  {
    id: 's89-druck-ueber-den-bogen',
    datei: 'src/planen/S89Bogen.tsx',
    regel: 'Der S-89-Knopf im Planen druckt den Bogen mit allen Zetteln der Woche.',
    suchen: '          <button type="button" className="s89-druck-btn" onClick={() => drucken(<S89Druck zettel={zettel} datum={datum} />)}>\n',
    ersetzen: '          <button type="button" className="s89-druck-btn" onClick={() => window.print()}>\n',
  },
  {
    id: 's89-dieser-zettel-ab-tablet',
    datei: 'src/components/S89Sheet.tsx',
    regel: '„Diesen Zettel drucken" steht erst ab dem Tablet — am Handy druckt kaum jemand.',
    suchen: '        {breit && (\n',
    ersetzen: '        {(\n',
  },
  {
    id: 'blatt-senden-ohne-konto',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Wen „Plan senden" nicht erreicht hat (kein Konto), steht im Blatt — den spricht der Planer selbst an.',
    suchen: '        {ohneKonto.length > 0 && (',
    ersetzen: '        {false && (',
  },
  {
    id: 'plan-senden-nicht-auf-altem-stand',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Auf der Momentaufnahme gibt es kein „Plan senden" — es ginge an ihr vorbei hinaus.',
    suchen: '  return rechteVon(state).zuteilen && !state.staleAt',
    ersetzen: '  return rechteVon(state).zuteilen',
  },
  {
    id: 'leiste-nicht-beim-einrichten',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Aktionsleiste gehört zum Plan, nicht zu „Woche einrichten" und nicht zu den Zusagen.',
    suchen: "  if (thema === 'zusammenkuenfte') return state.tab === 'mid' || state.tab === 'we' ? 'zusammenkuenfte' : null\n",
    ersetzen: "  if (thema === 'zusammenkuenfte') return 'zusammenkuenfte'\n",
  },
  {
    id: 'senden-liste-treffpunkt-rolle',
    datei: 'src/data/plan-versand.ts',
    regel: 'In der Liste von „Plan senden" steht ein Treffpunkt als Treffpunkt-Leiter.',
    suchen: '      rolle: FS_LEITER,\n',
    ersetzen: "      rolle: '',\n",
  },
  /* ---- Nachentschieden am 13.10.2026 (T121) ---- */
  {
    id: 'programmpunkt-titel-nur-geaendert',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Übernommen wird ein Titel nur, wenn er anders ist als der, der dasteht.',
    suchen: "    if (neu && neu !== titelText) dispatch({ type: 'lacTitel', si, ii, title: neu })",
    ersetzen: "    if (neu) dispatch({ type: 'lacTitel', si, ii, title: neu })",
  },
  {
    id: 'blatt-verlaesst-feld-beim-schliessen',
    datei: 'src/components/Sheet.tsx',
    regel: 'Ein Blatt verlässt beim Schließen erst das Feld, in dem getippt wird — sonst ginge die Eingabe verloren.',
    suchen: '    if (aktiv instanceof HTMLElement && dlg.current?.contains(aktiv)) aktiv.blur()\n',
    ersetzen: '',
  },
  {
    id: 'programmpunkt-titel-escape',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Escape im Titelfeld nimmt die Eingabe zurück, ohne das Blatt darum zu schließen.',
    suchen: '                  e.stopPropagation()\n',
    ersetzen: '',
  },
  {
    id: 'programmpunkt-co-ohne-titel',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein Punkt des Kreisaufsehers bekommt kein Titelfeld — sein Thema steht im Plan.',
    suchen: '        {!istCoPunkt(stelle.item) && (',
    ersetzen: '        {(',
  },
  {
    id: 'lac-titel-co-unberuehrt',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Den Titel eines Punkts des Kreisaufsehers ändert das Umbenennen nicht.',
    suchen: '  if (!item || isSong(item) || istCoPunkt(item) || item.title === trimmed) return weeks',
    ersetzen: '  if (!item || isSong(item) || item.title === trimmed) return weeks',
  },
  {
    id: 'lac-titel-alle-varianten',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein neuer Titel gilt in allen Sprachvarianten gleich.',
    suchen: '  ziel.title = trimmed\n  forEachAltMeeting(an.week, tab, (m) => {\n    const vi = m.sections[si]?.items[ii]\n    if (vi && !isSong(vi)) vi.title = trimmed\n',
    ersetzen: '  ziel.title = trimmed\n  forEachAltMeeting(an.week, tab, (m) => {\n    const vi = m.sections[si]?.items[ii]\n',
  },
  {
    id: 'lac-titel-umbau',
    datei: 'src/data/meeting-edit.ts',
    regel: 'Ein umbenannter Punkt ist ein Umbau — eine später nachgeholte Sprache legt ihren Titel nicht darüber.',
    suchen: '  umbauMerken(an.week, tab)\n',
    ersetzen: '',
  },
  {
    id: 'plus-minus-grenze',
    datei: 'src/bausteine/PlusMinus.tsx',
    regel: 'An der unteren Grenze ist − gesperrt.',
    suchen: '        gesperrt={wert <= min}',
    ersetzen: '        gesperrt={false}',
  },
  {
    id: 'gesperrter-knopf-tut-nichts',
    datei: 'src/bausteine/GesperrterKnopf.tsx',
    regel: 'Ein gesperrter Knopf bewirkt nichts, auch wenn man ihn antippt.',
    suchen: '        if (!gesperrt) onTipp()',
    ersetzen: '        onTipp()',
  },
  {
    id: 'gesperrter-knopf-behaelt-fokus',
    datei: 'src/bausteine/GesperrterKnopf.tsx',
    regel: 'Gesperrt behält der Knopf den Fokus — `disabled` gäbe ihn an die Seite hinter dem Blatt ab.',
    suchen: '      aria-disabled={gesperrt}',
    ersetzen: '      disabled={gesperrt}',
  },
  {
    id: 'plus-minus-einerschritt',
    datei: 'src/bausteine/PlusMinus.tsx',
    regel: '+ zählt in Einerschritten — jede Minute ist erreichbar.',
    suchen: '        onTipp={() => onWert(wert + 1)}',
    ersetzen: '        onTipp={() => onWert(wert + 5)}',
  },
  {
    id: 'push-karte-weg-bleibt',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Weggeklickt bleibt die Push-Karte auf diesem Gerät weg, auch nach dem Neuladen.',
    suchen: "      localStorage.setItem(WEG_KEY, '1')\n",
    ersetzen: '',
  },
  {
    id: 'push-karte-weg-wirkt',
    datei: 'src/mitteilungen/PushKarte.tsx',
    regel: 'Das ✕ blendet die Push-Karte sofort aus.',
    suchen: '  if (!angemeldet || subscribed || verweigert || weg) return null',
    ersetzen: '  if (!angemeldet || subscribed || verweigert) return null',
  },
  /* ---- Die Woche planen (T121, Phase 5a) ---- */
  {
    id: 'plan-lage-konflikt-vor-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Steht die Person in einem Konflikt, ist ihr Platz ein Problem — auch wenn sie zugesagt hat.',
    suchen: "  if (imKonflikt) return 'problem'",
    ersetzen: '  void imKonflikt',
  },
  {
    id: 'plan-lage-ohne-zusage-voll',
    datei: 'src/data/saal.ts',
    regel: 'Wer nichts zu bestätigen hat (Gastredner, Gruppe), ist besetzt — er wartet nicht ewig.',
    suchen: "  return zusage === null ? 'voll' : LAGE_DER_ZUSAGE[zusage]",
    ersetzen: "  return zusage === null ? 'wartet' : LAGE_DER_ZUSAGE[zusage]",
  },
  {
    id: 'plan-platz-mit-zusage-gast',
    datei: 'src/data/plaetze.ts',
    regel: 'Gastredner und Kreisaufseher haben nichts zu bestätigen — keine Aufgabe, keine Zusage.',
    suchen: '  if (!slot?.name || isGuestRole(slot.rolle)) return false',
    ersetzen: '  if (!slot?.name) return false',
  },
  {
    id: 'plan-platz-mit-zusage-gruppe',
    datei: 'src/data/plaetze.ts',
    regel: 'Die Reinigungs-Rotation ist eine Gruppe, keine Person — sie bestätigt nichts.',
    suchen: "  return !(platz.art === 'helper' && platz.svc.groups)",
    ersetzen: '  return true',
  },
  {
    id: 'plan-aufgaben-nur-mit-zusage',
    datei: 'src/data/planning.ts',
    regel: 'Aufgaben entstehen nur, wo jemand bestätigen kann (`platzMitZusage`).',
    suchen: '        if (!slot || !platzMitZusage(platz)) continue',
    ersetzen: '        if (!slot?.name) continue',
  },
  {
    id: 'plan-besetzung-konflikt',
    datei: 'src/data/saal.ts',
    regel: 'Im Saal beim Planen ist der Platz im Konflikt rot — wie seine Zeile darunter.',
    suchen: '    b[lageVon(slot, zusage, Boolean(slot && imKonflikt(slot)))]++',
    ersetzen: '    b[lageVon(slot, zusage, false)]++',
  },
  {
    id: 'plan-besetzung-nur-mit-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Der Saal fragt die Zusage nur, wo es eine gibt — der Gastredner sitzt voll, nicht blass.',
    suchen: '    const zusage = key !== null && platzMitZusage(platz) ? zusageStatus(confirmations, key) : null',
    ersetzen: '    const zusage = key !== null ? zusageStatus(confirmations, key) : null',
  },
  {
    id: 'plan-zusagen-stand-nur-mit-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Die Zusagen der Spur zählen nur, wer etwas zu bestätigen hat — „3/4" wäre mit dem Gastredner nie fertig.',
    suchen: '    if (!platzMitZusage(platz)) continue',
    ersetzen: '    if (!platz.slot?.name) continue',
  },
  {
    id: 'plan-konflikte-feste-reihenfolge',
    datei: 'src/planen/WochenStand.tsx',
    regel: '„Zu klären" nennt die Konflikte in fester Reihenfolge: abwesend, doppelt, Hilfsdienst und Aufgabe.',
    suchen: 'const KONFLIKT_RANG: Partial<Record<ConflictKind, number>> = { absent: 0, double: 1, helperTask: 2 }',
    ersetzen: 'const KONFLIKT_RANG: Partial<Record<ConflictKind, number>> = { absent: 2, double: 1, helperTask: 0 }',
  },
  {
    id: 'plan-konflikt-abwesenheit-gilt',
    datei: 'src/planen/useKonflikte.ts',
    regel: 'Steht eine Person in mehreren Konflikten, nennt ihr Platz die Abwesenheit.',
    suchen: "    if (!vorher || (c.kind === 'absent' && vorher.kind !== 'absent')) je.set(c.kennung, c)",
    ersetzen: '    if (!vorher) je.set(c.kennung, c)',
  },
  {
    id: 'plan-konflikte-einmal-je-zustand',
    datei: 'src/planen/useKonflikte.ts',
    regel: 'Die Konflikte einer Zusammenkunft werden einmal je Zustand gerechnet — für alle Bausteine, die danach fragen.',
    suchen: '  if (fertig) return fertig\n',
    ersetzen: '',
  },
  {
    id: 'konflikt-aufgabe-und-zwei-dienste',
    datei: 'src/data/planning.ts',
    regel: 'Aufgabe und zwei Hilfsdienste ergeben beide Meldungen — die Doppelung fällt nicht hinter der Hilfsdienst-Warnung weg.',
    suchen: "      if (!raum && hc >= 2) conflicts.push({ kind: 'double', name, kennung, tab: tb, count: hc })\n",
    ersetzen: "      else if (!raum && hc >= 2) conflicts.push({ kind: 'double', name, kennung, tab: tb, count: hc })\n",
  },
  {
    id: 'nws-referenz-nie-geraten',
    datei: 'scripts/nws-personen.mjs',
    regel: 'Zeigt eine NWS-Referenz auf zwei Personen, bricht die Zuordnung ab, statt still die spätere zu nehmen.',
    suchen: '    if (da && da.person !== p) throw new Error(`NWS-Referenz ${ref} zeigt auf zwei Personen — die Zuordnung wäre geraten.`)\n',
    ersetzen: '',
  },
  {
    id: 'dienst-schluessel-sb-secret',
    datei: 'scripts/gemeinsam.mjs',
    regel: 'Ein sb_secret_… gilt den RLS-Proben als Dienst-Schlüssel — mit ihm bestünde jede Probe, ohne zu messen.',
    suchen: "(k.startsWith('sb_secret_') || ",
    ersetzen: '(',
  },
  {
    id: 'nachweis-b-aus-kontendatei',
    datei: 'scripts/mandanten-nachweis.mjs',
    regel: 'Ohne NACHWEIS_B_* meldet sich B mit dem Planer aus der Kontendatei der Testversammlung an.',
    suchen: "    bMail: env.NACHWEIS_B_MAIL || ausKonten('PROBE_PLANER_MAIL'),\n",
    ersetzen: '    bMail: env.NACHWEIS_B_MAIL,\n',
  },
  {
    id: 'alle-zeilen-seitenweise',
    datei: 'scripts/gemeinsam.mjs',
    regel: 'Wer alle Zeilen meint, liest Seite für Seite — mehr als 1000 gibt PostgREST nicht heraus.',
    suchen: '    if (teil.length < seite) return out\n',
    ersetzen: '    return out\n',
  },
  {
    id: 'grundplan-ersetzen-alte-treffpunkte-entfallen',
    datei: 'scripts/treffpunkt-regeln-setzen.mjs',
    regel: 'Ein Treffpunkt des alten Grundplans entfällt beim Ersetzen — wie in der App bleibt nur, was von Hand dasteht.',
    suchen: '  return [...ausRegeln, ...uebrig.filter((o) => o.manual)].sort(fsSort)\n',
    ersetzen: '  return [...ausRegeln, ...uebrig].sort(fsSort)\n',
  },
  {
    id: 'grundplan-zusage-zieht-mit-um',
    datei: 'scripts/treffpunkt-regeln-setzen.mjs',
    regel: 'Geht ein importierter Termin in einer Regel auf, zieht die Zusage seines Leiters mit auf die neue Kennung.',
    suchen: '      if (alt && alt.id !== r.id) uebernommen(alt.id, r.id)\n',
    ersetzen: '',
  },
  {
    id: 'wochenplanung-zusage-geht-mit-dem-platz',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Überschreibt der Import einen Platz, ist die Zusage des Vorgängers weg — der Neue erbt sie nicht.',
    suchen: '    await zusagenLoeschen(rest, cong, g.verfallen)\n',
    ersetzen: '',
  },
  {
    id: 'treffpunkt-import-zusage-geht-mit-dem-leiter',
    datei: 'scripts/treffpunkte-importieren.mjs',
    regel: 'Wechselt der Import einen Leiter, ist die Zusage des Vorgängers weg — der Neue erbt sie nicht.',
    suchen: '    await zusagenLoeschen(rest, cong, g.verfallen)\n',
    ersetzen: '',
  },
  {
    id: 'testversammlung-entfernen-nur-eigene-konten',
    datei: 'scripts/testversammlung-anlegen.mjs',
    regel: 'Entfernt wird nur eine Versammlung, deren Konten alle von diesem Skript stammen — nie die echte.',
    suchen: '  if (fremde.length) {\n',
    ersetzen: '  if (fremde.length < 0) {\n',
  },
  {
    id: 'abwesenheiten-abgleich-ab-dem-tag',
    datei: 'scripts/abwesenheiten-importieren.mjs',
    regel: 'Der Abgleich liest nur Abwesenheiten, die einem neuen Eintrag gleichen können — sonst schneidet PostgREST bei 1000 ab.',
    suchen: '    `absences?select=person_id,from_date,to_date&congregation_id=eq.${cong}&to_date=gte.${ab}`,\n',
    ersetzen: '    `absences?select=person_id,from_date,to_date&congregation_id=eq.${cong}`,\n',
  },
  {
    id: "wochen-import-fragt-wie-die-app",
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Das Skript fragt wie der Knopf in der App: nie ohne after und nie vor der laufenden Woche.',
    // Seit dem 18.10.2026 steht die Wahl über zwei Zeilen (`--ab` nennt die erste Woche).
    suchen: "      : holenNach(vorhandene.map((start) => ({ start })), new Date())\n",
    ersetzen: "      : vorhandene[vorhandene.length - 1]\n",
  },
  // ── Ein Jahr Geschichte für den Neuaufbau (18.10.2026) ────────────────────
  {
    id: 'wochen-import-ab-ist-die-erste-woche',
    datei: 'scripts/wochen-importieren.mjs',
    regel: '--ab nennt die erste Woche, die kommt — gefragt wird nach der davor; sonst ließe sich die Woche der Frist nie holen.',
    suchen: "      ? montagNach(nichtVorDerFrist(montagVon(arg.ab), aufbewahrtAb(VERTEILUNG_WOCHEN)), -1)\n",
    ersetzen: "      ? nichtVorDerFrist(montagVon(arg.ab), aufbewahrtAb(VERTEILUNG_WOCHEN))\n",
  },
  {
    id: 'wochen-import-unvollstaendig-code-1',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Bricht die Kette ab oder springt sie, endet der Lauf mit Code 1 — sonst liefe der Neuaufbau mit halber Geschichte weiter.',
    suchen: '    process.exitCode = 1\n',
    ersetzen: '',
  },
  {
    id: 'wochen-import-sieht-luecken',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Springt die Kette über Wochen (eine alte Ausgabe fehlte bei jw.org), steht die Lücke da.',
    suchen: '    if (cursor && start && Date.parse(start) - Date.parse(cursor) > WOCHE_MS) luecken.push({ nach: cursor, kam: start })\n',
    ersetzen: '',
  },
  {
    id: 'wochen-import-ende-ist-kalender',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Das Ende des Hefts ist der Kalender, kein Abbruch — der Lauf endet dann ohne Code 1.',
    suchen: "      const ende = nutzlast?.ende === true || nutzlast?.code === 'sprache-fehlt'\n",
    ersetzen: '      const ende = false\n',
  },
  {
    id: 'wochen-import-fehlende-sprache-ist-kalender',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Fehlt die nächste Woche in der Sprache der Versammlung, ist auch das der Kalender — die Übersetzung erscheint später.',
    suchen: "      const ende = nutzlast?.ende === true || nutzlast?.code === 'sprache-fehlt'\n",
    ersetzen: '      const ende = nutzlast?.ende === true\n',
  },
  {
    id: 'wochen-import-anderthalb-jahre',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Ein Jahr zurück und ein halbes voraus darf ein Lauf holen — mehr hat das Arbeitsheft nie.',
    suchen: '  const hoechstens = VERTEILUNG_WOCHEN + 26\n',
    ersetzen: '  const hoechstens = 52\n',
  },
  {
    id: 'neuaufbau-ab-an-wochen',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Der Neuaufbau reicht --ab an den Wochen-Import weiter — sonst begänne die Auswertung ohne Geschichte.',
    suchen: "      argv: ['--anzahl', wochen, ...seit, ...cong, ...trocken],\n",
    ersetzen: "      argv: ['--anzahl', wochen, ...cong, ...trocken],\n",
  },
  {
    id: 'neuaufbau-ab-an-abwesenheiten',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Der Neuaufbau reicht --ab auch an die Abwesenheiten weiter — die Auswertung rechnet damit, wer fehlte.',
    suchen: '      argv: [...seit, ...daten, ...cong, ...trocken],\n',
    ersetzen: '      argv: [...daten, ...cong, ...trocken],\n',
  },
  {
    id: 'wochensuche-ab-der-gefragten-woche',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Gesucht wird ab der Ausgabe der gefragten Woche, nicht ab dem heutigen Monat — sonst fehlt am 1. März die laufende Woche, und kein Neuaufbau kommt an das vergangene Jahr.',
    suchen: '    const weeks = await discoverWeeks(fetchText, startParam ? new Date(startParam) : cutoff)\n',
    ersetzen: '    const weeks = await discoverWeeks(fetchText)\n',
  },
  {
    id: 'wochensuche-baut-alte-ausgaben',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Eine vergangene Ausgabe, die der Index nicht mehr nennt, findet die Suche über ihren Slug.',
    suchen: '    if (!gelistet && nr >= laufende) continue // noch nicht erschienen\n',
    ersetzen: '    if (!gelistet) continue\n',
  },
  {
    id: 'wochensuche-raet-keine-kuenftige',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Eine künftige Ausgabe, die der Index nicht nennt, ist noch nicht erschienen — die Suche fragt nicht danach.',
    suchen: '    if (!gelistet && nr >= laufende) continue // noch nicht erschienen\n',
    ersetzen: '',
  },
  {
    id: 'wochensuche-nicht-vor-der-frist',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Die Suche fragt keine Ausgabe an, die vor dem Montag vor einem Jahr endet (T125).',
    suchen: '  const erste = Math.max(ausgabeVon(ab), ausgabeVon(frist))\n',
    ersetzen: '  const erste = ausgabeVon(ab)\n',
  },
  {
    id: 'wochensuche-wochen-ab-der-frist',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Wochen vor dem Montag vor einem Jahr liefert die Suche nicht — auch nicht aus der Ausgabe, in der die Frist liegt.',
    suchen: '  return weeks.filter((w) => w.start >= frist)\n',
    ersetzen: '  return weeks\n',
  },
  {
    id: 'wochensuche-gebaute-darf-fehlen',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Fehlt eine gebaute Ausgabe bei jw.org, fehlen nur ihre Wochen — die übrigen kommen.',
    suchen: '    const page = gelistet ? await holen(adresse) : await holen(adresse).catch(() => null)\n',
    ersetzen: '    const page = await holen(adresse)\n',
  },
  {
    id: 'wochensuche-gelistete-muss-da-sein',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Fehlt eine Ausgabe, die der Index nennt, ist das ein Fehler — sie wird nicht still übergangen.',
    suchen: '    const page = gelistet ? await holen(adresse) : await holen(adresse).catch(() => null)\n',
    ersetzen: '    const page = await holen(adresse).catch(() => null)\n',
  },
  {
    id: 'wochensuche-jahr-wie-die-app',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Die Suche reicht so weit zurück, wie die App Wochen behält (VERTEILUNG_WOCHEN).',
    suchen: 'export const RUECKBLICK_WOCHEN = 52\n',
    ersetzen: 'export const RUECKBLICK_WOCHEN = 26\n',
  },
  {
    id: "import-ab-nicht-vor-der-frist",
    datei: "scripts/gemeinsam.mjs",
    regel: "Ein --ab vor der Aufbewahrungsfrist wird auf sie angehoben — kein Import holt, was die Datenbank in der nächsten Nacht räumt (T125).",
    suchen: "  if (gewuenscht >= grenze) return gewuenscht\n",
    ersetzen: "  return gewuenscht\n",
  },
  {
    id: "nws-import-nicht-vor-der-frist",
    datei: "scripts/wochenplanung-importieren.mjs",
    regel: "Der NWS-Import übernimmt keine Zuteilungen, die älter sind als ein Jahr, und sagt, wie viele Wochen draußen blieben (T125).",
    suchen: "    if (montag < ab) { zuAlt++; continue }\n",
    ersetzen: "",
  },
  {
    id: "nws-import-liest-nur-das-fenster",
    datei: "scripts/wochenplanung-importieren.mjs",
    regel: "Der NWS-Import liest nur die Wochen im Fenster der App (T125).",
    suchen: "  const wochen = await rest(`weeks?select=start,data&congregation_id=eq.${cong}&start=gte.${ab}`)\n",
    ersetzen: "  const wochen = await rest(`weeks?select=start,data&congregation_id=eq.${cong}`)\n",
  },
  {
    id: "treffpunkte-import-nicht-vor-der-frist",
    datei: "scripts/treffpunkte-importieren.mjs",
    regel: "Der Treffpunkt-Import übernimmt keine NWS-Termine, die älter sind als ein Jahr (T125).",
    suchen: "    if (montag < ab) { zuAlt++; continue }\n",
    ersetzen: "",
  },
  {
    id: "angleichen-im-fenster",
    datei: "scripts/wochen-angleichen.mjs",
    regel: "Das Angleichen rechnet im Ladefenster der App — was davor liegt, lädt sie nicht, also gleicht es nichts daran an (T125).",
    suchen: "  const imFenster = (rows) => rows.filter((r) => r.start >= app.ab).slice().reverse()\n",
    ersetzen: "  const imFenster = (rows) => rows.slice().reverse()\n",
  },
  {
    id: 'neuaufbau-schluessel-an-die-schritte',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Der einmal erfragte Schlüssel geht an jeden Schritt — sonst fragte jeder noch einmal.',
    suchen: "{ stdio: 'inherit', env: umgebung }",
    ersetzen: "{ stdio: 'inherit' }",
  },
  {
    id: 'neuaufbau-fortsetzen-ohne-namen',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Beim Fortsetzen werden nur die Angaben verlangt, die die übrigen Schritte brauchen.',
    suchen: "  const noetig = ab <= 1 ? PFLICHT : ab === 2 ? ['sql'] : []\n",
    ersetzen: '  const noetig = PFLICHT\n',
  },
  {
    id: 'anlegen-erst-die-angaben',
    datei: 'scripts/versammlung-anlegen.mjs',
    regel: 'Erst fehlende Angaben melden, dann nach dem Schlüssel fragen — und für --trocken gar nicht.',
    suchen: '  const arg = argumente(argv)\n  // Erst die Angaben, dann der Schlüssel',
    // Zusammengesetzt: Stünde der Aufruf hier am Stück, hielte die Schema-Probe
    // diesen Katalog für ein Skript, das mit der Datenbank redet (`REDET_MIT_DB`).
    ersetzen: '  const arg = argumente(argv)\n  await zugangsdaten' + '()\n  // Erst die Angaben, dann der Schlüssel',
  },
  {
    id: 'neuaufbau-reicht-cong-weiter',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Beim Fortsetzen geht --cong an jeden Schritt — neben der Testversammlung wiese jeder sonst ab.',
    suchen: "  const cong = typeof arg.cong === 'string' ? ['--cong', arg.cong] : []\n",
    ersetzen: '  const cong = []\n',
  },
  {
    id: 'zuruecksetzen-sicherung-nur-nach-abbruch',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Die Sicherung der Konto-Verknüpfungen zieht nur, wenn die Personen schon gelöscht sind — sonst gilt die Datenbank.',
    suchen: '  } else if (dbPersonen.length === 0 && fs.existsSync(sidecar)) {\n',
    ersetzen: '  } else if (fs.existsSync(sidecar)) {\n',
  },
  {
    id: 'zuruecksetzen-sicherung-danach-weg',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Nach einem gelungenen Zurücksetzen sind die Sicherungen weg — liegen geblieben, zögen sie beim nächsten Lauf.',
    suchen: '  for (const datei of [regelSidecar, sidecar]) if (fs.existsSync(datei)) fs.unlinkSync(datei)\n',
    ersetzen: '  if (gruppenRegeln.length && fs.existsSync(regelSidecar)) fs.unlinkSync(regelSidecar)\n',
  },
  {
    id: 'zuruecksetzen-zaehlt-was-trifft',
    datei: 'scripts/versammlung-zuruecksetzen.mjs',
    regel: 'Als erhalten zählt eine Konto-Verknüpfung nur, wenn sie ein Konto getroffen hat.',
    suchen: '    if (Array.isArray(getroffen) && getroffen.length > 0) verknuepft++\n    else ohneKonto.push(v.personName)\n',
    ersetzen: '    verknuepft++\n',
  },
  {
    id: 'screens-je-rechten-gemerkt',
    datei: 'src/data/rechte.ts',
    regel: 'Dieselben Rechte ergeben dieselbe Liste der Bildschirme — sonst liefe der Deep-Link-Effekt bei jedem Render.',
    suchen: '  if (gemerkt) return gemerkt\n',
    ersetzen: '',
  },
  {
    id: 'liste-bleibt-ohne-aenderung',
    datei: 'src/data/helpers.ts',
    regel: 'Ändert sich kein Eintrag, bleibt die Liste dieselbe — sonst schriebe persist.ts ohne Änderung.',
    suchen: '  return neu.length === alt.length && neu.every((x, i) => x === alt[i]) ? alt : neu\n',
    ersetzen: '  return neu\n',
  },
  {
    id: 'entzug-einmal-je-aktion',
    datei: 'src/data/plan-versand.ts',
    regel: 'Wem eine Aktion einen Platz nimmt, wird einmal gerechnet — Reducer und persist.ts teilen die Antwort.',
    suchen: '    return z.ergebnis\n',
    ersetzen: '',
  },
  {
    id: 'schrift-stufe-traegt-ihren-namen',
    datei: 'src/profil/ProfilScreen.tsx',
    regel: 'Jede Stufe der Schriftgröße trägt im Profil ihren eigenen Namen.',
    suchen: "  1.3: 'schriftGroesser',\n",
    ersetzen: "  1.3: 'schriftGross',\n",
  },
  {
    id: 'kandidaten-gemerkt-an-ihren-feldern',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Die Kandidatenliste rechnet nur neu, wenn sich ein Feld ändert, das sie liest — nicht bei Toast oder Farbschema.',
    suchen: '    [weeks, persons, groups, services, fsWeeks, absences, lang, congregation, sel, abwesend, t, tu],\n',
    ersetzen: '    [state, sel, abwesend, t, tu],\n',
  },
  {
    id: 's89-zettel-gemerkt',
    datei: 'src/planen/S89Bogen.tsx',
    regel: 'Die S-89-Zettel der Woche werden nur neu gerechnet, wenn sich Wochen, Zeiten oder der Partner-Schalter ändern.',
    suchen: '    [weeks, wi, congregation.times, mitPartner],\n',
    ersetzen: '    [weeks, wi, congregation.times, mitPartner, {}],\n',
  },
  {
    id: 'abwesenheiten-einmal-je-zustand',
    datei: 'src/data/absence.ts',
    regel: 'Die Abwesenheiten werden einmal je Zustand gebaut, und alle Bausteine bekommen dasselbe Objekt.',
    suchen: '    return zuletzt.ergebnis\n',
    ersetzen: '',
  },
  {
    id: 'plan-hinweis-abwesend',
    datei: 'src/planen/platz-anzeige.ts',
    regel: 'Wer abwesend ist und eingeteilt, trägt am Platz „Abwesend" — nicht den Satz der Doppelbelegung.',
    suchen: "  if (konflikt?.kind === 'absent' || konflikt?.kind === 'fsAbsent') return t.abwesendChip\n",
    ersetzen: "  if (konflikt?.kind === 'absent' || konflikt?.kind === 'fsAbsent') return t.sheetSchonHeute\n",
  },
  {
    id: 'plan-hinweis-abgesagt',
    datei: 'src/planen/platz-anzeige.ts',
    regel: 'Ein abgesagter Platz nennt rechts die Absage.',
    suchen: '  absage: string = t.zusageAbgesagt,',
    ersetzen: '  absage?: string,',
  },
  {
    id: 'plan-programm-konflikt-markiert',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Wer unter „Zu klären" steht, ist an seinem Programmplatz rot.',
    suchen: '{...platzAnzeige(slot, stand, konflikte.von(slot), t)}',
    ersetzen: '{...platzAnzeige(slot, stand, undefined, t)}',
  },
  {
    id: 'plan-hilfsdienst-konflikt-markiert',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Wer unter „Zu klären" steht, ist an seinem Hilfsdienst rot — Hilfsdienste sind die häufigste Hälfte der Konflikte.',
    suchen: '{...platzAnzeige(slot, stand, gruppe ? undefined : konflikte.von(slot), t, t.spurErsatzGesucht)}',
    ersetzen: '{...platzAnzeige(slot, stand, undefined, t, t.spurErsatzGesucht)}',
  },
  {
    id: 'plan-hilfsdienst-ersatz-gesucht',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Sagt jemand einen Hilfsdienst ab, steht am Platz „Ersatz gesucht" — die App sucht selbst.',
    suchen: 'konflikte.von(slot), t, t.spurErsatzGesucht)}',
    ersetzen: 'konflikte.von(slot), t)}',
  },
  {
    id: 'plan-hilfsdienst-gruppe-ohne-zusage',
    datei: 'src/planen/HelpersPanel.tsx',
    regel: 'Eine Gruppe sagt nicht zu — ihr Platz wartet nicht.',
    suchen: 'const stand = name && !gruppe && zusage.moeglich(tab)',
    ersetzen: 'const stand = name && zusage.moeglich(tab)',
  },
  {
    id: 'plan-platz-offen-zuteilen',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: 'Ein offener Platz heißt „Zuteilen" — er sagt, was hier zu tun ist.',
    suchen: "{lage === 'offen' ? (leer ?? t.spurZuteilen) : name}",
    ersetzen: '{name}',
  },
  {
    id: 'plan-platz-wartet-sichtbar',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: '„Wartet" steht sichtbar hinter der Rolle.',
    suchen: "lage === 'wartet' ? status : undefined",
    ersetzen: 'undefined',
  },
  {
    id: 'plan-platz-stufe-vorgelesen',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: 'Die übrigen Stufen der Zusage hört ein Vorleseprogramm — die Farbe allein sieht es nicht.',
    suchen: '{status && !stufeSichtbar && <span className="sr-only">{status}</span>}',
    ersetzen: '{null}',
  },
  {
    id: 'plan-platz-absage-einmal',
    datei: 'src/planen/PlatzZeile.tsx',
    regel: 'Steht die Absage sichtbar als Hinweis da, hört der Screenreader sie nicht ein zweites Mal.',
    suchen: "  const stufeSichtbar = lage === 'wartet' || status === hinweis",
    ersetzen: "  const stufeSichtbar = lage === 'wartet'",
  },
  {
    id: 'plan-spur-senden-ganze-woche',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Was noch hinaus muss, steht in der Spur auch dann an, wenn die gezeigte Zusammenkunft leer ist.',
    suchen: "z.neu > 0 ? (alleBesetzt ? 'jetzt' : 'teil') : z.besetzt > 0 ? 'voll' : 'leer'",
    ersetzen: "z.besetzt === 0 ? 'leer' : z.neu === 0 ? 'voll' : alleBesetzt ? 'jetzt' : 'teil'",
  },
  {
    id: 'plan-spur-zusagen-nach-senden',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Die Zusagen sind erst dran, wenn alles besetzt und gesendet ist.',
    suchen: "    : zuteilen === 'voll' && senden === 'voll'",
    ersetzen: "    : zuteilen === 'voll'",
  },
  {
    id: 'plan-spur-neu-mit-treffpunkten',
    datei: 'src/planen/plan-spur.ts',
    regel: '„Neu" zählt die ganze Woche wie „Plan senden" — Treffpunkte eingeschlossen.',
    suchen: 'offeneMeldungen(week, fsWeek, q.services',
    ersetzen: 'offeneMeldungen(week, undefined, q.services',
  },
  {
    id: 'plan-spur-nicht-bei-ausfall',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Fällt die Zusammenkunft aus, steht keine Spur da — es gibt nichts zu besetzen.',
    suchen: '      week && !istAusgefallen(week, tab)',
    ersetzen: '      week',
  },
  {
    id: 'plan-besetzung-nicht-bei-ausfall',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Fällt die Zusammenkunft aus, steht keine Besetzung da — eine Zahl führte an einen Plan, den es nicht gibt.',
    suchen: '  const da = week && !istAusgefallen(week, tab) ? week : null',
    ersetzen: '  const da = week ?? null',
  },
  {
    id: 'plan-klaeren-offene',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Unter „Zu klären" steht, wie viele Zuteilungen noch offen sind.',
    suchen: '          {offenGesamt > 0 && (',
    ersetzen: '          {offenGesamt < 0 && (',
  },
  {
    id: 'mitteilung-gelesen-nicht-lokal',
    datei: 'src/app/persist.ts',
    regel: 'Eine hier entstandene Zeile wird nicht als gelesen geschrieben — unter ihrer Kennung steht nichts in der Datenbank.',
    suchen: 'if (vorher && !vorher.read && !vorher.local) markNotificationRead(',
    ersetzen: 'if (vorher && !vorher.read) markNotificationRead(',
  },
  {
    id: 'absage-schluessel-an-die-planer',
    datei: 'src/app/persist.ts',
    regel: 'Die Absage geht mit dem Schlüssel ihrer Aufgabe an die Planer — daran findet ihr Tipp die Woche.',
    suchen: 'notifyPlanners(neu.type, neu.title, neu.text, neu.taskId)',
    ersetzen: 'notifyPlanners(neu.type, neu.title, neu.text)',
  },
  {
    id: 'absage-schluessel-im-reducer',
    datei: 'src/app/reducer.ts',
    regel: 'Die Meldung „Verhinderung gemeldet" trägt den Schlüssel der abgesagten Aufgabe.',
    suchen: '        // landete er nirgends.\n        action.id,\n',
    ersetzen: '        // landete er nirgends.\n',
  },
  {
    id: 'notify-planners-schluessel-gekuerzt',
    datei: 'supabase/schema.sql',
    regel: 'Der Schlüssel, den ein Mitglied über notify_planners mitschickt, wird gekürzt — er ist nur ein Wegweiser.',
    suchen: "nullif(left(task, 300), '')",
    ersetzen: 'task',
  },
  {
    id: 'mitteilung-text-zwei-zeilen',
    datei: 'src/mitteilungen/mitteilungen.css',
    regel: 'Der Text einer Mitteilung steht höchstens zwei Zeilen hoch.',
    suchen: '  -webkit-line-clamp: 2;\n',
    ersetzen: '  -webkit-line-clamp: 3;\n',
  },
  // ── Freie Plätze selbst übernehmen (4.10.2026) ────────────────────────────
  {
    id: 'frei-erst-nach-plan-senden',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Freie Plätze einer Woche werden erst angeboten, wenn ihr Plan gesendet ist — vorher plant der Planer noch.',
    suchen: '    if (!gesendet.has(week.start)) return\n',
    ersetzen: '',
  },
  {
    id: 'frei-treffpunkt-gibt-nicht-frei',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Ein gesendeter Treffpunkt gibt die Zusammenkünfte der Woche nicht frei — nur deren eigene Schlüssel zählen.',
    suchen: "    const ende = schluessel.indexOf('|')\n    const woche = ende > 0 ? schluessel.slice(0, ende) : ''\n",
    ersetzen:
      "    const ohneFs = schluessel.startsWith('fs|') ? schluessel.slice(3) : schluessel\n    const ende = ohneFs.indexOf('|')\n    const woche = ende > 0 ? ohneFs.slice(0, ende) : ''\n",
  },
  {
    id: 'frei-nicht-ausgefallen',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Eine ausgefallene Zusammenkunft bietet keine freien Plätze an.',
    suchen: '      if (istAusgefallen(week, tab)) continue\n',
    ersetzen: '',
  },
  {
    id: 'frei-nicht-vorbei',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Eine vergangene Zusammenkunft bietet keine freien Plätze an.',
    suchen: '      if (istVorbei(at, heute)) continue\n',
    ersetzen: '',
  },
  {
    id: 'frei-nicht-abwesend',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Wer an dem Tag abwesend ist, bekommt dort keine freien Plätze angeboten.',
    suchen: '      if (istAbwesend(abwesend, me.id, wi, tab)) continue\n',
    ersetzen: '',
  },
  // `frei-brueder-platz`, `frei-nicht-neben-eigenem`, `frei-kein-rednerplatz`
  // und `frei-eigener-redner-nicht` gestrichen (25.10.2026): „Freie Plätze"
  // bietet nur noch Hilfsdienste an (Betreiber: „aufgaben weist der planer zu");
  // Brüder-, Programm- und Rednerplätze kommen gar nicht erst in Frage.
  {
    id: 'frei-nur-hilfsdienste',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Angeboten werden nur Hilfsdienste — Programmpunkte und den Ratgeber teilt der Planer zu.',
    suchen: "        if (platz.art !== 'helper') continue\n",
    ersetzen: '',
  },
  {
    id: 'frei-nicht-zweimal-im-dienst',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Wer im Dienst schon einen Platz hat, bekommt den zweiten nicht angeboten — er brächte niemanden dazu.',
    suchen: '        if (meeting.helpers[platz.svc.key]?.some((s) => gehoertZu(s, me))) continue\n',
    ersetzen: '',
  },
  {
    id: 'frei-reinigung-nicht',
    datei: 'supabase/functions/_shared/freie-plaetze.ts',
    regel: 'Die Reinigung (eine Gruppe, keine Person) wird nicht angeboten.',
    suchen: '  return svc.groups ? null : `svc:${svc.key}`\n',
    ersetzen: '  return `svc:${svc.key}`\n',
  },
  {
    id: 'frei-reinigung-app',
    datei: 'src/data/offene-plaetze.ts',
    regel: 'Die App fragt die geteilte Regel — sonst böte sie die Reinigung an, die der Server abweist.',
    suchen: '        const bereich = angebotsBereich(platz.svc)\n',
    ersetzen: '        const bereich = `svc:${platz.svc.key}`\n',
  },
  {
    id: 'frei-nur-angebotenes',
    datei: 'src/app/reducer.ts',
    regel: '„Übernehmen" trägt nur ein, was angeboten ist — ein veralteter Tipp ändert nichts.',
    suchen: '      if (!platz || !me || !sel) return state\n',
    ersetzen: '      if (!me || !sel) return state\n',
  },
  {
    id: 'frei-server-schreibt',
    datei: 'src/app/persist.ts',
    regel: 'Den freien Platz schreibt die Edge Function, nicht der Client — die Woche gehört ihm nicht.',
    suchen: "const OHNE_WOCHENSCHREIBEN: readonly AppAction['type'][] = ['hydrate', 'takeSubstitute', 'platzUebernehmen']",
    ersetzen: "const OHNE_WOCHENSCHREIBEN: readonly AppAction['type'][] = ['hydrate', 'takeSubstitute']",
  },
  {
    id: 'fill-weiche',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Der Aufruf „fill" geht seinen eigenen Weg — ein freier Platz braucht kein Ersatzgesuch.',
    suchen: "    if (payload?.action === 'fill') {\n",
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'fill-nur-hilfsdienste',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server trägt nur in Hilfsdienste ein — Programmpunkte und den Ratgeber teilt der Planer zu (25.10.2026).',
    suchen: "  if (teile.art !== 'helper') return json({ error: 'not-offered' }, 403)\n",
    ersetzen: '',
  },
  {
    id: 'fill-nicht-zweimal-im-dienst',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Wer im Dienst schon einen Platz hat, bekommt den zweiten nicht — auch nicht an der App vorbei.',
    suchen: "  if (reihe.some((s) => (s?.pid ? s.pid === person.id : s?.name === name))) return json({ error: 'not-offered' }, 403)\n",
    ersetzen: '',
  },
  {
    id: 'fill-nach-plan-senden',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server trägt erst ein, wenn der Plan der Woche gesendet ist.',
    suchen: "  if (versand.length === 0) return json({ error: 'not-published' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-platz-leer',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server überschreibt keinen besetzten Platz.',
    suchen: "  if (reihe[teile.pos]?.name) return json({ error: 'slot-taken' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-angebot',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Was nicht angeboten wird (die Reinigung), trägt der Server nicht ein.',
    suchen: "  if (!bereich) return json({ error: 'not-offered' }, 403)\n",
    ersetzen: '',
  },
  {
    id: 'fill-bereich',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Der Server verlangt den Aufgabenbereich des Platzes.',
    suchen: ' || !person.priv?.[bereich]) return',
    ersetzen: ') return',
  },
  // `fill-brueder` gestrichen (25.10.2026): Brüder-Plätze gibt es nur im
  // Programm, und das übernimmt niemand mehr selbst.
  {
    id: 'fill-ausfall',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'In eine ausgefallene Zusammenkunft trägt der Server nicht ein.',
    suchen: "  if (istAusgefallenFuer(row.data.dev, teile.tab)) return json({ error: 'meeting-cancelled' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-vorbei',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'In eine vergangene Zusammenkunft trägt der Server nicht ein — am Tag selbst schon.',
    suchen: "  if (tag && tag < heute) return json({ error: 'past' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-abwesend',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Wer an dem Tag abwesend ist, wird nicht eingetragen.',
    suchen: "  if (tag && absences.some((a) => a.from_date <= tag && tag <= a.to_date)) return json({ error: 'absent' }, 409)\n",
    ersetzen: '',
  },
  {
    id: 'fill-vergleiche-und-tausche',
    // Seit dem 5.10.2026 im gemeinsamen Schreibweg von `zuteilen` und `substitute`.
    datei: 'supabase/functions/_shared/woche-schreiben.ts',
    regel: 'Hat jemand die Woche zwischen Lesen und Schreiben geändert, schreibt der Server nicht darüber.',
    suchen: '    `&updated_at=eq.${wert(stand)}&select=updated_at`\n',
    ersetzen: "    '&select=updated_at'\n",
  },
  // `fill-klasse-nur-wenn-besteht` gestrichen (25.10.2026): Plätze der
  // Zusätzlichen Klasse sind Programmpunkte — die weist der Server ab.
  {
    id: 'fill-platzzahl',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Ein Hilfsdienst-Platz jenseits der eingestellten Platzzahl wird nicht besetzt.',
    suchen: "  if (!svc || teile.pos >= svc.count) return json({ error: 'slot-not-found' }, 404)\n",
    ersetzen: "  if (!svc) return json({ error: 'slot-not-found' }, 404)\n",
  },
  {
    id: 'fill-reinigung',
    datei: 'supabase/functions/substitute/fuellen.ts',
    regel: 'Die Reinigung trägt der Server niemandem ein — er fragt dieselbe Regel wie die App.',
    suchen: '  const bereich = angebotsBereich(svc)\n',
    ersetzen: '  const bereich = `svc:${svc.key}`\n',
  },
  {
    id: 'vortrag-schaetze-beschriftung',
    datei: 'src/personen/priv-label.ts',
    regel: 'Der Vortrag aus „Schätze aus Gottes Wort" trägt seinen Programmteil im Namen — „Vorträge" allein hieß jeder Vortrag.',
    // Seit dem 17.10.2026 liefert `privLabelTeile` die Bausteine, `privLabel` fügt sie zusammen.
    suchen: "  if (key === 'vortrag') return [t.privSchaetze, t.privVortrag]\n",
    ersetzen: '',
  },

  // ── Feste Rollen mehrfach vergeben: die Namen im Banner (F7, 4.10.2026) ───
  {
    id: 'feste-rollen-warnung',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Personenliste warnt, wenn eine feste Rolle (Wachtturm-Studium-Leiter, Vertreter) mehrfach vergeben ist (F7).',
    suchen: '      mehrfachRollen: doppelteFesteRollen(sortiert),',
    ersetzen: '      mehrfachRollen: [],',
  },
  {
    id: 'feste-rollen-erst-ab-zwei',
    datei: 'src/data/helpers.ts',
    regel: 'Eine feste Rolle, die genau eine Person trägt, ist kein Befund.',
    suchen: '  })).filter(({ personen }) => personen.length >= 2)',
    ersetzen: '  })).filter(({ personen }) => personen.length >= 1)',
  },
  {
    id: 'feste-rollen-namen',
    datei: 'src/personen/PersonenScreen.tsx',
    regel:
      'Die Warnung nennt je Rolle, wer sie trägt — mit der Zahl allein suchte der Planer die Betroffenen Detail für Detail.',
    suchen: '              <NamenKnoepfe personen={r.personen} />\n',
    ersetzen: '',
  },
  {
    id: 'feste-rollen-namen-sortiert',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Namen in der Warnung stehen in der Folge der Liste — alphabetisch in der Sprache des Lesers.',
    suchen: '      mehrfachRollen: doppelteFesteRollen(sortiert),',
    ersetzen: '      mehrfachRollen: doppelteFesteRollen(persons),',
  },
  {
    id: 'warnung-name-oeffnet-sein-detail',
    datei: 'src/personen/NamenKnoepfe.tsx',
    regel: 'Ein Tipp auf einen Namen in einem Hinweis öffnet genau diese Person, nicht die erste.',
    suchen: "            dispatch({ type: 'selectPerson', id: person.id })\n",
    ersetzen: "            dispatch({ type: 'selectPerson', id: personen[0]!.id })\n",
  },
  {
    id: 'feste-rollen-im-filter',
    datei: 'src/personen/PersonenFilterBlatt.tsx',
    regel: 'Der Filter „Aufgabenbereiche" führt auch die festen Rollen — so findet man den festen Leiter.',
    suchen: '            ...[...QUALIFICATION_ORDER, ...WT_ROLE_ORDER].map(',
    ersetzen: '            ...[...QUALIFICATION_ORDER].map(',
  },

  /* ---- Code-Review 5.10.2026 ---- */
  {
    id: 'grundplan-nur-eigene-regel',
    datei: 'src/app/reducer.ts',
    regel:
      'Eine geänderte Regel setzt Zeit und Ort nur ihrer eigenen Treffpunkte zurück — die der übrigen Gruppen bleiben, wie ihre Woche sie hat (sonst wiese die Datenbank die Wochen des Gruppenaufsehers ab).',
    suchen: '      const dieseRegel = (inst: FsInstance) => inst.ruleId === action.id\n',
    ersetzen: '      const dieseRegel = (_inst: FsInstance) => true\n',
  },
  {
    id: 'grundplan-anlegen-behaelt-wochen',
    datei: 'src/data/fs.ts',
    regel: 'Ohne Angabe behält die Neu-Ausrichtung Zeit und Ort jeder Woche — beim Laden, beim Anlegen und Entfernen einer Regel.',
    suchen: '  zuruecksetzen: (inst: FsInstance) => boolean = () => false,\n',
    ersetzen: '  zuruecksetzen: (inst: FsInstance) => boolean = () => true,\n',
  },

  /* ---- Edge-Runde 5.10.2026: Schreiben auf Stand, „heute" vom Gerät ---- */
  {
    id: 'woche-schreiben-aussetzer',
    datei: 'supabase/functions/_shared/woche-schreiben.ts',
    regel: 'Ein Aussetzer beim ersten Schreibversuch verwirft weder die Zuteilung des Planers noch den Tipp auf einen freien Platz.',
    suchen: '  return (await versuchen()) ?? versuchen()\n',
    ersetzen: '  return versuchen()\n',
  },
  {
    id: 'woche-schreiben-zweiter-versuch-bedingt',
    datei: 'supabase/functions/_shared/woche-schreiben.ts',
    /*
      Der Fehler bis zum 5.10.2026: Der zweite Versuch ging ohne Bedingung
      hinaus. Die Mutation stellt genau das wieder her.
    */
    regel: 'Auch der zweite Schreibversuch trägt die Bedingung — schreibt dazwischen ein anderer, gewinnt er.',
    suchen: '  return (await versuchen()) ?? versuchen()\n',
    ersetzen:
      "  return (await versuchen()) ?? ((await rest.patchZeilen<{ updated_at: string }>(pfad.replace(/&updated_at=[^&]*/, ''), { data }))?.[0]?.updated_at ?? null)\n",
  },
  {
    id: "woche-konflikt-ohne-ungeschuetzten-anlauf",
    datei: 'src/lib/data.ts',
    regel: 'Trifft das Update auf den Stand nichts, ist es ein Konflikt — kein zweiter Anlauf ohne Bedingung (5.10.2026).',
    suchen: "    if (zeile) {\n      standMerken(staende, woche, zeile.updated_at as string, geladen)\n      return true\n    }\n    konfliktMelder?.()\n    return false\n  }\n",
    ersetzen: "    if (zeile) {\n      standMerken(staende, woche, zeile.updated_at as string, geladen)\n      return true\n    }\n    const { data: erneut } = await supabase.from(tabelle).update({ data }).eq('congregation_id', congregationId).eq('start', woche).select('updated_at').maybeSingle()\n    if (erneut) return true\n    konfliktMelder?.()\n    return false\n  }\n",
  },
  {
    id: 'fill-heute-vom-geraet',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Ob eine Zusammenkunft vorbei ist, entscheidet beim Übernehmen eines freien Platzes der Kalendertag des Geräts, nicht der UTC-Tag.',
    suchen: '      const heute = new Date(heuteUtc(payload.heute)).toISOString().slice(0, 10)\n',
    ersetzen: '      const heute = new Date(heuteUtc(undefined)).toISOString().slice(0, 10)\n',
  },
  {
    id: 'fill-heute-geht-mit',
    datei: 'src/lib/data.ts',
    regel: 'Die App schickt beim Übernehmen eines freien Platzes ihren Kalendertag mit.',
    suchen: "{ body: { action: 'fill', taskKey, heute } }",
    ersetzen: "{ body: { action: 'fill', taskKey } }",
  },

  /* ---- Befund 9, 5.10.2026: Bestand, wie die App ihn lädt ---- */
  {
    id: 'neue-woche-klasse',
    datei: 'src/data/neue-woche.ts',
    regel: 'Eine importierte Woche bekommt die Zusätzliche Klasse, wenn sie eingerichtet ist.',
    suchen: '  let wochen = syncAuxSlots([mitEnden], k.auxClass)\n',
    ersetzen: '  let wochen = [mitEnden]\n',
  },
  {
    id: 'neue-woche-endzeit',
    datei: 'src/data/neue-woche.ts',
    regel: 'Eine importierte Woche bekommt die Endzeit aus den eigenen Zusammenkunftszeiten, nicht die des Imports.',
    suchen: '    mid: { ...roh.mid, end: endeAusStartzeit(k.zeiten.mid.time, roh.mid.end) },\n',
    ersetzen: '    mid: { ...roh.mid },\n',
  },
  {
    id: 'neue-woche-gedaechtnismahl',
    datei: 'src/data/neue-woche.ts',
    regel: 'Bringt eine importierte Woche das Gedächtnismahl mit, entfällt die Zusammenkunft, die es trifft.',
    suchen: '  if (mem) wochen = setAnlassTermin(wochen, 0, { von: mem })\n',
    ersetzen: '',
  },
  {
    id: 'import-skript-ordnet-ein',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Das Import-Skript schreibt die Woche, wie der Knopf in der App sie einordnet — samt Treffpunkten.',
    suchen: '    const { week, fsWeek } = einordnen(roh)\n',
    ersetzen: '    const [week, fsWeek] = [roh, []]\n',
  },
  {
    id: 'import-skript-treffpunkte-bleiben',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Hat eine Woche schon Treffpunkte, lässt das Import-Skript sie stehen.',
    suchen: '    if (mitTreffpunkten.has(week.start)) {\n',
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'angleichen-klasse',
    datei: 'scripts/wochen-angleichen.mjs',
    regel: 'Das Prüfskript findet Wochen ohne die eingeschaltete Zusätzliche Klasse — an denen `zuteilen` den Planer abweist.',
    suchen: '  const angeglichen = app.syncAuxSlots(geladen, auxClass)\n',
    ersetzen: '  const angeglichen = geladen\n',
  },
  {
    id: 'angleichen-grundplan',
    datei: 'scripts/wochen-angleichen.mjs',
    regel: 'Das Prüfskript richtet die Treffpunkte nach dem Grundplan aus, wie das Laden — sonst weist der Trigger den Gruppenaufseher ab.',
    suchen: '  const ausgerichtet = fsRules.length ? app.regenFsWeeks(zeilen.map((r) => r.start), fsRoh, fsRules) : fsRoh\n',
    ersetzen: '  const ausgerichtet = fsRoh\n',
  },
  {
    id: 'angleichen-auf-stand',
    datei: 'scripts/wochen-angleichen.mjs',
    regel: 'Das Prüfskript schreibt eine Woche nur auf ihren gelesenen Stand — was inzwischen jemand gespeichert hat, bleibt.',
    suchen: '        `weeks?${meine}&start=eq.${e.start}&updated_at=eq.${encodeURIComponent(e.stand)}&select=start`,\n',
    ersetzen: '        `weeks?${meine}&start=eq.${e.start}&select=start`,\n',
  },
  // ---- 5.10.2026 abends: Durchsicht der bewusst offenen Punkte ----
  {
    id: 'personen-filter-ueber-detail',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Suche und Filter der Personenliste überstehen das Detail einer Person.',
    suchen: '  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)\n',
    ersetzen: '  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)\n  if (selected && filter !== KEIN_FILTER) setFilter(KEIN_FILTER)\n',
  },
  {
    id: 'zeitleiste-besuch',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Vorgemerkte Gruppenbesuche stehen in der Zeitleiste des Besuchers.',
    suchen: '  for (const besuch of state.gruppenbesuche) {\n',
    ersetzen: '  for (const besuch of [] as typeof state.gruppenbesuche) {\n',
  },
  {
    id: 'zeitleiste-besuch-nicht-doppelt',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Ein Besuch in einer geladenen Woche steht als Treffpunkt in der Zeitleiste, nicht noch einmal als Besuch.',
    suchen: "    if (stand.art !== 'vorgemerkt') continue\n",
    ersetzen: "    if (stand.art === 'vorbei') continue\n",
  },
  {
    id: 'zeitleiste-acht-wochen-zurueck',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Die Zeitleiste einer Person reicht höchstens acht Wochen zurück (Betreiber 23.10.2026).',
    suchen: '  return markiereAbwesenheiten(entries, randVon).filter((e) => tageZwischen(e.datum, grenze) <= WOCHEN_ZURUECK * 7)\n',
    ersetzen: '  return markiereAbwesenheiten(entries, randVon)\n',
  },
  {
    id: 'zeitleiste-acht-wochen-rand',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Der Tag genau acht Wochen vor heute steht in der Zeitleiste noch da.',
    suchen: 'tageZwischen(e.datum, grenze) <= WOCHEN_ZURUECK * 7)',
    ersetzen: 'tageZwischen(e.datum, grenze) < WOCHEN_ZURUECK * 7)',
  },
  {
    id: 'zeitleiste-neueste-zuerst',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Die Zeitleiste einer Person zeigt die neuesten Einträge zuerst, dann absteigend (Betreiber 23.10.2026).',
    suchen: '      kalendertagMs(b.datum) - kalendertagMs(a.datum) ||\n',
    ersetzen: '      kalendertagMs(a.datum) - kalendertagMs(b.datum) ||\n',
  },
  {
    id: 'zeitleiste-tag-spaeteres-oben',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Am selben Tag steht in der Zeitleiste das Spätere oben — auch zwischen verschiedenen Arten (Review 24.10.2026).',
    suchen: '      minuten(b.zeit) - minuten(a.zeit),\n',
    ersetzen: '      minuten(a.zeit) - minuten(b.zeit),\n',
  },
  {
    id: 'zeitleiste-tag-im-programm',
    datei: 'src/personen/person-timeline.ts',
    regel: 'Zwei Aufgaben desselben Tages stehen in der Zeitleiste in der Reihenfolge des Programms, nicht rückwärts.',
    // Stabil sortiert über die umgedrehte Liste: Die Tage bleiben absteigend, nur gleiche Tage kippen.
    suchen: '  entries.sort(\n',
    ersetzen: '  entries.reverse().sort(\n',
  },
  {
    id: 'zeitleiste-rand-fasst-tag-ein',
    datei: 'src/components/zeitleiste-gemeinsam.ts',
    regel: 'Von oben gelesen steht das Ende einer Abwesenheit vor den Zuteilungen seines Tages, der Beginn dahinter — sonst läuft die Strecke an ihnen vorbei.',
    suchen: "  return rand === 'start' ? 1 : -1\n",
    ersetzen: "  return rand === 'start' ? -1 : 1\n",
  },
  {
    id: 'zeitleiste-einzel-oben',
    datei: 'src/components/zeitleiste-gemeinsam.ts',
    regel: 'Eine eintägige Abwesenheit steht in der Zeitleiste über den Aufgaben ihres Tages, wie vor der Umstellung auf „neueste zuerst".',
    suchen: "  return rand === 'start' ? 1 : -1\n",
    ersetzen: "  return rand === 'ende' ? -1 : 1\n",
  },
  {
    id: 'zeitleiste-strecke-von-oben',
    datei: 'src/components/zeitleiste-gemeinsam.ts',
    regel: 'In der Zeitleiste (die neuesten zuerst) öffnet das Ende einer Abwesenheit die farbige Strecke, der Beginn schließt sie.',
    suchen: "    if (rand === 'ende') offen++\n    else if (rand === 'start') offen--\n",
    ersetzen: "    if (rand === 'start') offen++\n    else if (rand === 'ende') offen--\n",
  },
  {
    id: 'schlussgebet-we-erkannt',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Das Schlussgebet am Wochenende erkennt die Regel am Abschluss einer Zusammenkunft mit Wachtturm-Studium (T133).',
    suchen: "    artVon(abschnitt) === 'abschluss' &&\n    abschnitte.some((a) => artVon(a) === 'wtStudium')\n",
    ersetzen: "    artVon(abschnitt) === 'abschluss'\n",
  },
  {
    id: 'schlussgebet-altbestand',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Auch ein Abschluss ohne gespeicherte Art (Altbestand) wird erkannt — sonst stünde das Schlussgebet am Wochenende dort weiter offen (T133).',
    suchen: "  'ABSCHLUSS': 'abschluss',\n",
    ersetzen: '',
  },
  {
    id: 'schlussgebet-nicht-offen',
    datei: 'src/data/planning.ts',
    regel: 'Ein leeres Schlussgebet am Wochenende zählt nicht als offener Platz (T133).',
    suchen: '  for (const platz of allePlaetze(meeting, services)) if (!platz.slot?.name && !leerVorOrt(meeting, platz)) count++\n',
    ersetzen: '  for (const platz of allePlaetze(meeting, services)) if (!platz.slot?.name) count++\n',
  },
  {
    id: 'schlussgebet-saal',
    datei: 'src/data/saal.ts',
    regel: 'Im Saal und in der Spur steht ein leeres Schlussgebet am Wochenende nicht als offen (T133).',
    suchen: '    if (leerVorOrt(meeting, platz)) continue\n    const slot = platz.slot\n',
    ersetzen: '    const slot = platz.slot\n',
  },
  {
    id: 'schlussgebet-automatik',
    datei: 'src/data/planning.ts',
    regel: 'Die Automatik teilt das Schlussgebet am Wochenende niemandem zu (T133).',
    suchen: '    if (schlussgebetVorOrt(meeting.sections, section, slot)) continue\n',
    ersetzen: '',
  },
  {
    id: 'schlussgebet-vorschlag',
    datei: 'src/data/planning.ts',
    regel: 'Für das Schlussgebet am Wochenende schlägt das Zuteilen-Blatt niemanden vor — die Automatik nähme niemanden (T133).',
    suchen: '  if (schlussgebetVorOrt(meeting.sections, section, slot)) return []\n',
    ersetzen: '',
  },
  {
    id: 'schlussgebet-automatisch-zaehlt',
    datei: 'src/data/planning.ts',
    regel: '„Automatisch" findet ein leeres Schlussgebet am Wochenende nicht als zu besetzenden Platz vor (T133).',
    suchen: '    if (leerVorOrt(meeting, platz)) continue\n    gesamt++\n',
    ersetzen: '    gesamt++\n',
  },
  {
    id: 'schlussgebet-bedarf',
    datei: 'src/data/bedarf.ts',
    regel: 'Das Schlussgebet am Wochenende zählt nicht als Bedarf an Betern (T133).',
    suchen: "    if (platz.art === 'programm' && schlussgebetVorOrt(meeting.sections, platz.section, platz.slot)) continue\n",
    ersetzen: '',
  },
  // `schlussgebet-kein-angebot` und `schlussgebet-angebot-app` gestrichen
  // (25.10.2026): „Freie Plätze" bietet kein Gebet mehr an — nur Hilfsdienste.
  {
    id: 'schlussgebet-anzeige-programm',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Im Programm steht beim leeren Schlussgebet am Wochenende, wer es übernimmt — nicht „offen" (T133).',
    suchen: '                leer={vorOrt?.(slot) ? t.schlussgebetVorOrt : undefined}\n',
    ersetzen: '',
  },
  {
    id: 'schlussgebet-anzeige-planen',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Beim Planen fordert das leere Schlussgebet am Wochenende nicht zum Zuteilen auf (T133).',
    suchen: '                        leer={schlussgebetVorOrt(abschnitte, rawSection, slot) ? t.schlussgebetVorOrt : undefined}\n',
    ersetzen: '',
  },
  {
    id: 'schlussgebet-anzeige-druck',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Auf dem Wochenbogen steht beim leeren Schlussgebet am Wochenende, wer es übernimmt — keine Linie (T133).',
    suchen: '                          <Personen slots={item.names} vorOrt={vorOrt} />\n',
    ersetzen: '                          <Personen slots={item.names} />\n',
  },
  {
    id: 'schlussgebet-anzeige-monat',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Auf dem Monatsbogen steht beim leeren Schlussgebet am Wochenende, wer es übernimmt — keine Linie (T133).',
    suchen: '                        (schlussgebetVorOrt(rawMeeting.sections, rawSection, slot) ? t.schlussgebetVorOrt : <Offen breite={84} />)}\n',
    ersetzen: '                        <Offen breite={84} />}\n',
  },
  {
    id: 'druck-ansicht-druckt',
    datei: 'src/programm/AnsichtDrucken.tsx',
    regel: 'Der Druckknopf der Pläne ohne Woche druckt ihren Bogen.',
    suchen: 'onClick={() => drucken(zeichne())}',
    ersetzen: 'onClick={() => {}}',
  },
  // `druck-ansicht-kennzeichen` gestrichen (Phase 9e): Das Kennzeichen setzt
  // jetzt `useDruckBogen` für jeden Bogen — siehe `druck-bogen-kennzeichen`.
  {
    id: 'rechte-stufe-gruppe',
    datei: 'src/data/rechte.ts',
    regel: 'Wer eine Gruppe betreut, nennt sich in der Seitenleiste nicht „Verkündiger".',
    suchen: "  if (r.gruppe === null) return 'verkuendiger'\n",
    ersetzen: "  return 'verkuendiger'\n",
  },
  {
    id: 'rechte-stufe-gehilfe',
    datei: 'src/data/rechte.ts',
    regel: 'Der Gehilfe einer Gruppe heißt Gehilfe, nicht Gruppenaufseher.',
    suchen: "  return gruppe?.overseerId === s.personId ? 'gruppenaufseher' : 'gehilfe'\n",
    ersetzen: "  return 'gruppenaufseher'\n",
  },
  // Vortragsplan aus dem Planungsprogramm (T122).
  {
    id: 'vp-unbekannte-felder-nennen',
    datei: 'src/lib/vortragsplan-xml.ts',
    regel: 'Was die Datei sonst noch enthält, nennt die Vorschau — der Planer sieht, dass es das Gerät nicht verlässt.',
    suchen: '      if (!BEKANNT.kinder.has(kind.localName)) ignoriert.add(kind.localName)\n',
    ersetzen: '      if (!BEKANNT.kinder.has(kind.localName)) continue\n',
  },
  {
    id: 'vp-vergangene-wochen',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Einen Vortrag, dessen Tag vorbei ist, fasst der Import nicht an.',
    suchen: '    if (tag < heute) {\n',
    ersetzen: "    if (tag < '0000') {\n",
  },
  {
    id: 'vp-zeitraum-am-tag',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Ob ein Vortrag im Zeitraum der Datei liegt, entscheidet der Tag der Zusammenkunft, nicht der Montag seiner Woche.',
    suchen: '      if (tag >= plan.von && tag <= plan.bis && !fehlerhaft.has(woche)) wochen.add(woche)\n',
    ersetzen: '      if (woche >= montagVon(plan.von) && woche <= montagVon(plan.bis) && !fehlerhaft.has(woche)) wochen.add(woche)\n',
  },
  {
    id: 'vp-fehlerwoche-bleibt',
    datei: 'src/data/vortragsplan.ts',
    regel: 'Ein fehlerhafter Eintrag ist keine Absage: Seine Woche bleibt, wie sie ist.',
    suchen: '  const fehlerhaft = new Set(plan.fehlerWochen ?? [])\n',
    ersetzen: '  const fehlerhaft = new Set<string>()\n',
  },
  {
    id: 'vp-kreisaufseher-woche',
    datei: 'src/data/vortragsplan.ts',
    regel: 'In der Woche des Kreisaufsehers hält er den Vortrag — der Import lässt sie stehen.',
    suchen: "  if (week.anlass?.art === 'co') return 'kreisaufseher'\n",
    ersetzen: "  if (week.anlass?.art === 'nie') return 'kreisaufseher'\n",
  },
  {
    id: 'vp-vormerkung-in-neue-woche',
    datei: 'src/data/neue-woche.ts',
    regel: 'Eine später geholte Woche bekommt ihren vorgemerkten Vortrag.',
    suchen: '  const mitVortrag = vortragInNeueWoche(wochen[0] ?? mitEnden, k.vortraege, k.persons)\n',
    ersetzen: '  const mitVortrag = wochen[0] ?? mitEnden\n',
  },
  {
    id: 'vp-zusage-verfaellt',
    datei: 'src/app/reducer.ts',
    regel: 'Wer durch den Vortragsplan seinen Vortrag verliert, verliert die Zusage — wie beim Zuteilen von Hand.',
    suchen: "          geaendert.flatMap((wi) => geaenderteSlots(state.weeks, weeks, wi, 'we', state.services)),\n",
    ersetzen: '          [],\n',
  },
  {
    id: 'vp-vormerkungen-speichern',
    datei: 'src/app/persist.ts',
    regel: 'Die Vormerkungen des Vortragsplans gehen hinaus.',
    suchen: "    case 'vortragsplanUebernehmen':\n      vortraegeSpeichern(congId, prev, next)\n",
    ersetzen: "    case 'vortragsplanUebernehmen':\n",
  },
  {
    id: 'vp-thema-feld-schluessel',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Setzt jemand das Vortragsthema von außen, zeigt das Feld den neuen Titel — und schreibt den alten nicht zurück.',
    suchen: '                  key={`talk-${state.week}-${ii}-${rawTitle}`}\n',
    ersetzen: '                  key={`talk-${state.week}-${ii}`}\n',
  },
  {
    id: 'co-thema-feld-schluessel',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Ändert sich das Thema der Kreisaufseher-Woche von außen, zeigt das Feld den neuen Text.',
    suchen: '                    key={`thema-${state.week}-${si}-${ii}-${rawTitle}`}\n',
    ersetzen: '                    key={`thema-${state.week}-${si}-${ii}`}\n',
  },
  {
    id: 'vp-lied-feld-schluessel',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Setzt jemand das Anfangslied von außen, zeigt das Feld die neue Nummer.',
    suchen: "            key={`song-${isOpening ? 'open' : 'close'}-${state.week}-${liedNr}`}\n",
    ersetzen: "            key={`song-${isOpening ? 'open' : 'close'}-${state.week}`}\n",
  },
  // Wo der Planer den Vortragsplan findet (Betreiber, 18.10.2026): bei den
  // Wochen, nicht mehr ganz unten im Reiter Wochenende.
  {
    id: 'vp-karte-bei-den-wochen',
    datei: 'src/planen/WochenUebersicht.tsx',
    regel: 'Den Vortragsplan findet der Planer bei den Wochen unter „Holen" — auf der Seite „Planung" und in der Spalte neben dem Plan.',
    suchen: '      <VortragsplanKarte />\n',
    ersetzen: '',
  },
  {
    id: 'vp-karte-nur-online',
    datei: 'src/planen/VortragsplanKarte.tsx',
    regel: 'Im Offline-Stand steht die Karte des Vortragsplans nicht da — übernehmen ginge nicht.',
    suchen: '  if (state.staleAt) return null\n',
    ersetzen: '',
  },
  {
    id: 'vp-rls-nur-zuteiler',
    datei: 'supabase/schema.sql',
    regel: 'Vorgemerkte Vorträge — Namen auswärtiger Redner — lesen nur Admin und Planer.',
    suchen:
      'create policy vortraege_zuteilen on public.vortraege\n  for all\n  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n',
    ersetzen: 'create policy vortraege_zuteilen on public.vortraege\n  for all\n  using (congregation_id = public.my_congregation_id())\n',
  },
  {
    id: 'mrp-vormerkungen-gemessen',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Mitgliedsrechte-Probe misst die Vormerkungen des Vortragsplans, (65)–(70).',
    suchen: '    await vortragProben(k, vortragAnlage({ marke, versammlung, tag0 }))\n',
    ersetzen: '',
  },
  {
    id: 'mrp-vormerkungen-aufraeumen',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Was die Probe in `vortraege` angelegt hat, räumt sie wieder weg.',
    suchen: "    ['die Vormerkungen der Vorträge', weg('vortraege')],\n",
    ersetzen: '',
  },

  // ── Treffpunkte planen (T121, Phase 5e) ───────────────────────────────────
  {
    id: 'fs-konflikt-je-tag',
    datei: 'src/data/fs.ts',
    regel: 'Ein Konflikt am Treffpunkt gilt an seinem Wochentag — wer am Samstag fehlt, leitet am Mittwoch trotzdem.',
    suchen: '    const eigene = conflicts.filter((c) => c.wd === inst.wd && c.kennung === kennung)\n',
    ersetzen: '    const eigene = conflicts.filter((c) => c.kennung === kennung)\n',
  },
  {
    id: 'fs-konflikt-abwesenheit-zuerst',
    datei: 'src/data/fs.ts',
    regel: 'Steht ein Leiter abwesend und doppelt da, nennt sein Platz die Abwesenheit.',
    suchen: "    return eigene.find((c) => c.kind === 'fsAbsent') ?? eigene[0]\n",
    ersetzen: '    return eigene[0]\n',
  },
  {
    id: 'fs-in-gruppe',
    datei: 'src/data/fs.ts',
    regel: 'Der Gruppenaufseher plant, leert und besetzt nur die Treffpunkte seiner Gruppe.',
    suchen: '  return onlyGroup === null || inst.grp === onlyGroup\n',
    ersetzen: '  return true\n',
  },
  {
    id: 'treffpunkt-gruppe-nur-ohne-zuteilen',
    datei: 'src/data/rechte.ts',
    regel: 'Wer zuteilt, plant die Treffpunkte aller Gruppen — auch wenn er zugleich eine Gruppe betreut.',
    suchen: '  return r.zuteilen ? null : r.gruppe\n',
    ersetzen: '  return r.gruppe\n',
  },
  {
    id: 'treffpunkt-freitext-ohne-stand',
    datei: 'src/planen/platz-anzeige.ts',
    regel: 'Ein Freitext-Leiter hat nichts zu bestätigen — sein Platz wartet nicht.',
    suchen: '    fsLeiterZuteilung(inst) ? stand(inst) : null,\n',
    ersetzen: '    stand(inst),\n',
  },
  {
    id: 'treffpunkt-konflikt-am-platz',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Wer abwesend oder doppelt eingeteilt ist, steht am Platz seines Treffpunkts rot da.',
    suchen: '{...leiterAnzeige(inst, zusage.treffpunkt, konfliktVon(inst), t)}',
    ersetzen: '{...leiterAnzeige(inst, zusage.treffpunkt, undefined, t)}',
  },
  {
    id: 'treffpunkt-anlegen-wer-plant',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Einen Treffpunkt für diese Woche legen Admin, Planer und Gruppenaufseher an.',
    suchen: '      {(rechte.zuteilen || rechte.gruppe !== null) && (\n',
    ersetzen: '      {(rechte.admin || rechte.gruppe !== null) && (\n',
  },
  {
    id: 'treffpunkt-gewaehlt-nach-kennung',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Am Desktop ist genau der Treffpunkt hervorgehoben, der in der Spalte zugeteilt wird.',
    suchen: "sel.kind === 'fs' && ort.kind === 'fs' && sel.instId === ort.instId",
    ersetzen: "sel.kind === 'fs' && ort.kind === 'fs'",
  },
  {
    id: 'leiste-nur-bei-treffpunkten-der-woche',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Besuche und Grundplan haben keine Woche — und keine Aktionsleiste.',
    suchen: "thema === 'predigtdienst' && aktiverFsBereich(state) === 'treffpunkte' ? 'treffpunkte' : null",
    ersetzen: "thema === 'predigtdienst' ? 'treffpunkte' : null",
  },
  {
    id: 'leiste-nur-mit-recht',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Aktionsleiste hat nur, wer den Plan planen darf.',
    suchen: '  if (!darfPlanen(rechte, thema)) return null\n',
    ersetzen: '',
  },
  {
    id: 'spalte-treffpunkt-nur-beim-plan',
    datei: 'src/planen/planen-raster.ts',
    regel: 'Die Spalte zeigt einen Treffpunkt nur beim Plan der Treffpunkte.',
    suchen: "  return sel.kind === 'fs' ? art === 'treffpunkte' : art === 'zusammenkuenfte' && sel.tab === state.tab\n",
    ersetzen: "  return sel.kind === 'fs' ? true : art === 'zusammenkuenfte' && sel.tab === state.tab\n",
  },
  {
    id: 'treffpunkt-automatik-nur-eigene-gruppe',
    datei: 'src/planen/TreffpunkteAutomatikBlatt.tsx',
    regel: '„Automatisch" und „Leeren" wirken beim Gruppenaufseher nur auf seine Gruppe.',
    suchen: '  const onlyGroup = treffpunktGruppe(rechteVon(state))\n',
    ersetzen: '  const onlyGroup = null\n',
  },
  {
    id: 'senden-gruppe-zaehlt-nur-ihre',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Der Gruppenaufseher sieht beim Senden nur, was seine Gruppe betrifft — dieselbe Auswahl wie der Server.',
    suchen: '    return eigene ? alle.filter((o) => eigene.has(o.key)) : alle\n',
    ersetzen: '    return alle\n',
  },
  {
    id: 'senden-gruppe-zuletzt-eigene',
    datei: 'src/planen/wochen-versand.ts',
    regel: '„Zuletzt gesendet" meint beim Gruppenaufseher den Versand an seine Gruppe, nicht an die Woche.',
    suchen: '    return eigene ? zuletztGesendetFuer(state.sentLog, eigene) : zuletztGesendet(state.sentLog, week.start)\n',
    ersetzen: '    return zuletztGesendet(state.sentLog, week.start)\n',
  },
  {
    id: 'senden-zuletzt-genauer-schluessel',
    datei: 'src/data/plan-versand.ts',
    regel: 'Ein Aufgaben-Schlüssel ist kein Anfang eines anderen — der Versand an …|r10 ist keiner an …|r1.',
    suchen: "  const praefixe = [...taskKeys].map((k) => sentKey(k, ''))\n",
    ersetzen: '  const praefixe = [...taskKeys]\n',
  },
  {
    id: 'senden-gruppe-alle-satz',
    datei: 'src/planen/PlanSendenBlatt.tsx',
    regel: 'Hat der Gruppenaufseher alles gesendet, sagt der Satz es für seine Gruppe.',
    suchen: 'gruppe ? [t.fsSendenOffen, t.fsSendenAlle]',
    ersetzen: 'gruppe ? [t.fsSendenOffen, t.planSendenAlle]',
  },
  {
    id: 'senden-gruppe-nicht-auf-altem-stand',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Auch der Gruppenaufseher sendet nicht von der Momentaufnahme aus.',
    suchen: '  return gruppe !== null && !state.staleAt ? { gruppe } : null\n',
    ersetzen: '  return gruppe !== null ? { gruppe } : null\n',
  },
  {
    id: 'aktueller-treffpunkt-gruppe',
    datei: 'src/planen/useAktuellerPlatz.ts',
    regel: 'Das Zuteilen zeigt beim Gruppenaufseher dieselbe Lage wie sein Plan — mit den Konflikten seiner Gruppe.',
    suchen: 'week.start, treffpunktGruppe(rechteVon(state)))',
    ersetzen: 'week.start)',
  },

  // ── Grundplan (T121, Phase 5e-2) ──────────────────────────────────────────
  {
    id: 'grundplan-nur-eigene-gruppe',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Der Gruppenaufseher sieht im Grundplan nur die Regeln seiner Gruppe.',
    suchen: 'state.fsRules.filter((r) => onlyGroup === null || r.grp === onlyGroup)',
    ersetzen: 'state.fsRules.filter(() => true)',
  },
  {
    id: 'grundplan-haeufigkeit-nur-wenn-selten',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Wie oft eine Regel gilt, steht nur da, wo es nicht jede Woche ist.',
    suchen: '{regel.monthly > 0 && <span',
    ersetzen: '{<span',
  },
  {
    id: 'grundplan-ausser-nur-bei-gruppen',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: '„Außer bei Versammlungstreffpunkt" gibt es nur an einer Gruppenregel.',
    suchen: '      {regel.grp !== null && (\n        <AusserVersammlungFeld',
    ersetzen: '      {(\n        <AusserVersammlungFeld',
  },
  {
    id: 'grundplan-neu-ohne-ort-saal',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Eine neue Regel ohne Ort nimmt den Saal dieser Versammlung.',
    suchen: "place: regel.place.trim() || state.congregation.hall",
    ersetzen: 'place: regel.place',
  },
  {
    id: 'grundplan-gruppe-wechselt-vorgabe',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Mit der Gruppe einer neuen Regel wechselt die Vorgabe für „Außer bei Versammlungstreffpunkt".',
    suchen: 'setRegel((r) => ({ ...r, grp, skipCong: neueRegel(grp).skipCong }))',
    ersetzen: 'setRegel((r) => ({ ...r, grp }))',
  },
  {
    id: 'grundplan-aufseher-ohne-gruppenwahl',
    datei: 'src/planen/FsRulesPanel.tsx',
    regel: 'Der Gruppenaufseher legt im Grundplan in seiner Gruppe an — ohne Wahl.',
    suchen: '{anlegenIn === null && <GruppeFeld',
    ersetzen: '{<GruppeFeld',
  },
  {
    id: 'neue-regel-gruppe-ohne-versammlungstag',
    datei: 'src/data/fs.ts',
    regel: 'Eine neue Gruppenregel entfällt zunächst, wenn sich am selben Tag die Versammlung trifft.',
    suchen: "  return { grp, ...NEUER_TREFFPUNKT, place: '', monthly: 0, skipCong: grp !== null }\n",
    ersetzen: "  return { grp, ...NEUER_TREFFPUNKT, place: '', monthly: 0, skipCong: false }\n",
  },
  {
    id: 'programmpunkt-einfuegen-heisst-hinzufuegen',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein eigener Programmpunkt wird hinzugefügt, nicht „übernommen" (englisch hieße es „Take over").',
    suchen: '          {t.hinzufuegenKnopf}\n',
    ersetzen: '          {t.uebernehmen}\n',
  },
  // ── Gruppenbesuche von Hand (T121, Phase 5e-3) ────────────────────────────
  // Hier standen acht Einträge zu „Reihum verteilen" (Reihe, erster Samstag,
  // Abwesenheit, Wochenende, nächstgelegenes, Monate auslassen, Vorgabe des
  // Wochenendes, abgewählte Monate). Seit dem 13.10.2026 gibt es keine
  // Automatik mehr — nur den Vorschlag beim Anlegen.
  {
    id: 'gb-vorschlag-laengste-gruppe',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird die Gruppe, die am längsten nicht dran war — noch nie besuchte zuerst.',
    suchen: "  const grp = groups.map((g) => g.id).sort((a, b) => (zuletzt.get(a) ?? '').localeCompare(zuletzt.get(b) ?? ''))[0]\n",
    ersetzen: '  const grp = groups.map((g) => g.id)[0]\n',
  },
  {
    id: 'gb-vorschlag-monat-danach',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird die Woche einen Monat nach dem letzten Besuch.',
    suchen: '  const naechste = letzter ? gleichesWochenendeImNaechstenMonat(letzter.woche) : undefined\n',
    ersetzen: '  const naechste = letzter?.woche\n',
  },
  {
    id: 'gb-vorschlag-gleiches-wochenende',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Einen Monat später heißt: dasselbe Wochenende im nächsten Monat, vom fünften das letzte.',
    suchen: '  return nr >= 0 && nr < 4 ? naechste[nr] : naechste.at(-1)\n',
    ersetzen: '  return naechste[0]\n',
  },
  {
    id: 'gb-vorschlag-nicht-vor-dieser-woche',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird nie eine Woche vor dieser.',
    suchen: '    woche: naechste && naechste >= dieseWoche ? naechste : dieseWoche,\n',
    ersetzen: '    woche: naechste ?? dieseWoche,\n',
  },
  {
    id: 'gb-vorschlag-letzter-besucher',
    datei: 'src/data/gruppenbesuche.ts',
    regel: 'Vorgeschlagen wird der Besucher des letzten Besuchs, der einen hat.',
    suchen: '    pid: reihe.findLast((b) => b.pid !== null)?.pid ?? null,\n',
    ersetzen: '    pid: reihe.at(-1)?.pid ?? null,\n',
  },
  {
    id: 'gb-neu-besucher-nur-mit-recht',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Wer keine Treffpunkte mehr leiten darf, steht beim Anlegen nicht als Besucher da.',
    suchen: "  const [pid, setPid] = useState(kandidaten.some((p) => p.id === vorschlag.pid) ? (vorschlag.pid ?? '') : '')\n",
    ersetzen: "  const [pid, setPid] = useState(vorschlag.pid ?? '')\n",
  },
  {
    id: 'gb-neu-vorschau-ohne-offen',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Beim Anlegen steht nur, was auch danach nicht aufginge — ein freier Treffpunkt füllt sich, ein fehlender Besucher sperrt nur den Knopf.',
    suchen: "        (p) => p.art !== 'offen' && p.art !== 'besucher',\n",
    ersetzen: '        () => true,\n',
  },
  {
    id: 'gb-neu-vorschau',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Was auch nach dem Anlegen nicht aufginge, steht schon im Blatt — nicht erst an der Zeile.',
    suchen: '        <ProblemListe liste={hinweise} />\n',
    ersetzen: '',
  },
  {
    id: 'gb-neu-erst-mit-besucher',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Ohne Besucher und für eine Gruppe, die in der Woche schon besucht wird, legt „Hinzufügen" nichts an.',
    suchen: 'disabled={!pid || !grp || besucht(woche, grp)}',
    ersetzen: 'disabled={false}',
  },
  /* ---- Weitere Pläne planen (T121, Phase 5f, 13.10.2026) ---- */
  {
    id: 'wp-beginnen-gedrueckt-nichts',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ein Tipp auf die gedrückte Gruppe bei „Beginnen mit" verteilt nicht neu — von Hand gesetzte Wochen bleiben.',
    suchen: "    if (grp && grp !== beginnt) dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: grp })\n",
    ersetzen: "    if (grp) dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: grp })\n",
  },
  {
    id: 'wp-beginnt-laufende',
    datei: 'src/data/weitere-plaene.ts',
    regel: '„Beginnen mit" zeigt die Gruppe der laufenden Woche oder des laufenden Monats, nicht die der ersten des Plans.',
    suchen: '  const erste = planSpannen(plan).find((s) => s >= spanneVon(taktVon(plan), tag))\n',
    ersetzen: '  const erste = planSpannen(plan)[0]\n',
  },
  {
    id: 'wp-takt-gedrueckt-nichts',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ein Tipp auf den gedrückten Takt ändert den Plan nicht.',
    suchen: '            if (neu !== takt) aendern({ takt: neu })\n',
    ersetzen: '            aendern({ takt: neu })\n',
  },
  {
    id: 'wp-zeitraum-erst-uebernehmen',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Der Zeitraum gilt erst mit „Übernehmen" — unterwegs stünde er halb gesetzt da, und was aus ihm fiele, ginge mit.',
    suchen: '          onWahl={(von, bis) => setZeitraum({ von, bis })}\n',
    ersetzen: "          onWahl={(von, bis) => dispatch({ type: 'wpPlanAendern', id: plan.id, patch: { von, bis } })}\n",
  },
  {
    id: 'wp-zeitraum-unveraendert-nichts',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: '„Übernehmen" ohne Änderung schickt nichts.',
    suchen: '    if (zeitraum.von !== plan.von || zeitraum.bis !== plan.bis) {\n',
    ersetzen: '    if (true) {\n',
  },
  {
    id: 'wp-zeitraum-ende-getippt',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Der Kalender beginnt mit dem Ende, auf das man getippt hat — „Von" setzt den Anfang.',
    suchen: '          start={start}\n',
    ersetzen: '',
  },
  {
    id: 'wp-zeitraum-monat-des-endes',
    datei: 'src/bausteine/ZeitraumKalender.tsx',
    regel: 'Wer auf „Bis" tippt, sieht den Monat des Endes, nicht den des Anfangs.',
    suchen: "  const [monat, setMonat] = useState<Monat>(() => monatVon(start === 'bis' && bis ? bis : von))\n",
    ersetzen: '  const [monat, setMonat] = useState<Monat>(() => monatVon(von))\n',
  },
  {
    id: 'wp-vorschau-naechste-fuenf',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Die zugeklappte Vorschau zeigt die nächsten fünf ab der laufenden — Vergangenes erst mit „Alle anzeigen".',
    suchen: '  return kommende.length > 0 ? kommende.slice(0, VORSCHAU_SPANNEN) : [...spannen]\n',
    ersetzen: '  return [...spannen]\n',
  },
  {
    id: 'wp-vorschau-vorbei-alle',
    datei: 'src/data/weitere-plaene.ts',
    regel: 'Ist ein Plan vorbei, zeigt die Vorschau alle Wochen — sonst bliebe sie leer.',
    suchen: '  return kommende.length > 0 ? kommende.slice(0, VORSCHAU_SPANNEN) : [...spannen]\n',
    ersetzen: '  return kommende.slice(0, VORSCHAU_SPANNEN)\n',
  },
  {
    id: 'wp-abgeschlossen-nichts-mehr',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Ein abgeschlossener Plan ist gewesen: kein „Beginnen mit", kein Veröffentlichen, kein Hinweis, wer ihn sieht.',
    suchen: "  const laeuft = stand !== 'abgeschlossen'\n",
    ersetzen: '  const laeuft = true\n',
  },
  {
    id: 'wp-veroeffentlichen-handy-leiste',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Am Handy steht „Veröffentlichen" unten in der Leiste — nicht auch noch neben dem Titel.',
    suchen: '          {breit && veroeffentlichen}\n',
    ersetzen: '          {veroeffentlichen}\n',
  },
  {
    id: 'wp-unterzeile-ab-bis',
    datei: 'src/components/weitere-plaene-anzeige.ts',
    regel: 'In der Liste heißt ein Plan, der erst kommt, „ab …", ein laufender „bis …".',
    suchen: '  return plan.von > tag\n',
    ersetzen: '  return false\n',
  },
  {
    id: 'wp-spur-nie-veroeffentlicht',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Ein Plan, der als Entwurf ablief, war nie veröffentlicht — der mittlere Schritt seiner Spur bleibt leer.',
    suchen: "        : ['voll', plan.entwurf ? 'leer' : 'voll', 'voll']\n",
    ersetzen: "        : ['voll', 'voll', 'voll']\n",
  },
  /* ---- Zusagen der Woche (T121, Phase 5g, 13.10.2026) ---- */
  {
    id: 'zusagen-lage-wie-im-plan',
    datei: 'src/data/zusagen.ts',
    regel: 'Ein Platz steht in den Zusagen in derselben Lage wie im Plan — wer abwesend ist, ist ein Problem, auch mit Zusage.',
    suchen: '    const lage = lageVon(slot, zusageStatus(confirmations, key), konflikt !== undefined)\n',
    ersetzen: '    const lage = lageVon(slot, zusageStatus(confirmations, key), false)\n',
  },
  {
    id: 'zusagen-ohne-vergangenes',
    datei: 'src/data/zusagen.ts',
    regel: 'Was vorbei ist, fehlt in den Zusagen — danach zählt keine Zusage mehr.',
    suchen: '    if (vorbei.has(tab)) return\n',
    ersetzen: '',
  },
  {
    id: 'zusagen-gesendet-aus-tagebuch',
    datei: 'src/data/zusagen.ts',
    regel: 'Wann die Nachricht hinausging, kommt aus dem Versand-Tagebuch.',
    suchen: '      gesendet: sentLog[tagebuch] ?? null,\n',
    ersetzen: '      gesendet: null,\n',
  },
  {
    id: 'zusagen-hilfsdienst-ersatz',
    datei: 'src/data/zusagen.ts',
    regel: 'Ein abgesagter Hilfsdienst heißt in den Zusagen „Ersatz gesucht" — dort sucht die App selbst.',
    suchen: "      hilfsdienst: platz.art === 'helper',\n",
    ersetzen: '      hilfsdienst: false,\n',
  },
  {
    id: 'zusagen-zahlen-ohne-vergangenes',
    datei: 'src/planen/plan-spur.ts',
    regel: 'Die Spur der Zusagen zählt, was die Liste zeigt: ohne die Zusammenkunft, die vorbei ist.',
    suchen: '    if (istAusgefallen(week, tab) || vorbei.has(tab)) continue\n',
    ersetzen: '    if (istAusgefallen(week, tab)) continue\n',
  },
  {
    id: 'zusagen-nur-wer-zuteilt',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Die Zusagen der Woche sieht nur, wer zuteilt — der Gruppenaufseher plant die Treffpunkte.',
    suchen: "  if (state.tab === 'zusagen' && rechte.zuteilen) return <ZusagenAnsicht",
    ersetzen: "  if (state.tab === 'zusagen') return <ZusagenAnsicht",
  },
  {
    id: 'zusagen-zurueck-in-den-plan',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Zurück schließt zuerst die Zusagen der Woche — in den Plan, nicht gleich zu Start.',
    suchen: '  return (tab === \'edit\' || tab === \'zusagen\') && rechte.zuteilen\n',
    ersetzen: '  return tab === \'edit\' && rechte.zuteilen\n',
  },
  {
    id: 'spur-zusagen-weg',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Der Schritt „Zusagen" der Spur führt zu den Zusagen der Woche.',
    suchen: 'spurDerWoche(zahlen, t, { zusagen: zuDenZusagen })',
    ersetzen: 'spurDerWoche(zahlen, t)',
  },
  {
    id: 'zusagen-namen-einmal',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Wer zwei Aufgaben zugesagt hat, steht unter „Zugesagt" einmal.',
    suchen: 'namenSatz([...new Set(plaetze.map((p) => p.slot.name))], lang)',
    ersetzen: 'namenSatz(plaetze.map((p) => p.slot.name), lang)',
  },
  /* ---- Noch nicht angemeldet (T121, Phase 5g-2, 13.10.2026) ---- */
  // Der Haken „weiß Bescheid" zählt wie eine Zusage (entschieden am 14.10.2026).
  {
    id: 'bescheid-zaehlt-wie-zusage',
    datei: 'src/data/saal.ts',
    regel: 'Der Haken „weiß Bescheid" zählt im Schritt „Zusagen" der Spur wie eine Zusage — sonst würde er nie fertig.',
    suchen: "    const bescheid = zusage === 'offen' && persoenlich[sentKey(key, platz.slot?.name ?? '')] != null\n",
    ersetzen: '    const bescheid = false\n',
  },
  {
    id: 'bescheid-absage-schlaegt-haken',
    datei: 'src/data/saal.ts',
    regel: 'Eine Absage schlägt den Haken — sie ist ein Problem, keine Zusage.',
    suchen: "    const bescheid = zusage === 'offen' && persoenlich[sentKey(key, platz.slot?.name ?? '')] != null\n",
    ersetzen: "    const bescheid = persoenlich[sentKey(key, platz.slot?.name ?? '')] != null\n",
  },
  {
    id: 'bescheid-in-den-zusagen-der-woche',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Die Spur der Zusagen der Woche zählt den Haken mit.',
    suchen: 'zahlenDerWoche(rawWeek, fsWeek, { services, confirmations, persoenlich, sentLog, zeiten }, fromIso(tag))',
    ersetzen: 'zahlenDerWoche(rawWeek, fsWeek, { services, confirmations, persoenlich: {}, sentLog, zeiten }, fromIso(tag))',
  },
  {
    id: 'bescheid-in-der-spur-des-plans',
    datei: 'src/planen/WochenStand.tsx',
    regel: 'Auch die Spur über dem Plan zählt den Haken mit.',
    suchen: 'wochenZahlen(week, fsWeek, tab, { services, confirmations, persoenlich, sentLog, zeiten }, fromIso(tag))',
    ersetzen: 'wochenZahlen(week, fsWeek, tab, { services, confirmations, persoenlich: {}, sentLog, zeiten }, fromIso(tag))',
  },
  {
    id: 'bescheid-nicht-unerreichbar',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Wem der Planer persönlich Bescheid gegeben hat, der steht nicht in der Meldung „nicht erreichbar".',
    suchen: ' && !bescheid.has(tagebuchSchluessel(entry.key, pend.name))',
    ersetzen: '',
  },
  {
    id: 'bescheid-nur-abgehakte-zeilen',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Nur abgehakte Zeilen des Versand-Tagebuchs zählen — gemeldet heißt nicht abgehakt.',
    suchen: '.then((zeilen) => new Set(zeilen.filter((z) => z.persoenlich_at).map(',
    ersetzen: '.then((zeilen) => new Set(zeilen.map(',
  },
  {
    id: 'zusagen-ohne-konto-aus-tagebuch',
    datei: 'src/data/zusagen.ts',
    regel: 'Wer ohne Konto im Versand-Tagebuch steht, ist in den Zusagen als solcher erkannt — samt Haken.',
    suchen: '      ...(tagebuch in persoenlich ? { ohneKonto: { bescheid: persoenlich[tagebuch] ?? null } } : {}),\n',
    ersetzen: '',
  },
  {
    id: 'zusagen-ohne-konto-wartet-nicht',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Wer kein Konto hat, steht nicht unter „Warten auf Zusage" — ihn erreicht keine Nachricht.',
    suchen: "  const warten = plaetze.filter((p) => p.lage === 'wartet' && !p.ohneKonto)\n",
    ersetzen: "  const warten = plaetze.filter((p) => p.lage === 'wartet')\n",
  },
  {
    id: 'persoenlich-nur-ohne-konto',
    datei: 'src/app/reducer.ts',
    regel: 'Abhaken geht nur an einer Zeile ohne Konto — wie in der Datenbank.',
    suchen: '      if (!(schluessel in state.persoenlich)) return state\n',
    ersetzen: '',
  },
  {
    id: 'persoenlich-wird-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Ein Haken an „Noch nicht angemeldet" geht an die Datenbank (`persoenlich_bescheid`).',
    suchen: '      if (next.persoenlich !== prev.persoenlich) persoenlichBescheid(action.key, action.name, action.ja)\n',
    ersetzen: '',
  },
  {
    id: 'persoenlich-haken-geht-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Einen Haken nimmt man auch wieder weg — dann steht die Zeile wieder offen.',
    suchen: '      const wann = action.ja ? new Date().toISOString() : null\n',
    ersetzen: '      const wann = new Date().toISOString()\n',
  },
  {
    id: 'zusagen-haken-zeigt-bescheid',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: 'Wem es schon jemand gesagt hat, der steht unter „Noch nicht angemeldet" abgehakt da.',
    suchen: '        checked={platz.ohneKonto?.bescheid != null}\n',
    ersetzen: '        checked={false}\n',
  },
  /* ---- Jetzt erinnern (T121, Phase 5g-3, 13.10.2026) ---- */
  {
    id: 'erinnern-nur-gemeldet',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Erinnert wird nur, wer von seinem Platz schon weiß — zuerst kommt „Plan senden".',
    suchen: '    if (!woche.schonGemeldet.has(tagebuchSchluessel(p.key, p.name))) return false\n',
    ersetzen: '',
  },
  {
    id: 'erinnern-einmal-am-tag',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Je Person und Tag höchstens eine Erinnerung — wer heute schon eine hatte, bleibt aus.',
    suchen: '    if (uid && schonErinnert.has(uid)) {\n',
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'erinnern-sperre-schreiben',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Wer von Hand erinnert wurde, steht in der Sperre — der tägliche Lauf schickt heute keine zweite.',
    suchen:
      "    nachrichten.map((n) => ({ congregation_id: cong, user_id: n.empfaenger.userId, kind: 'self', sent_on: heute })),\n",
    ersetzen: '    [],\n',
  },
  {
    id: 'erinnern-kein-aufseher',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Aus den Zusagen der Woche erinnert, wer zuteilt — kein Gruppenaufseher.',
    suchen: "(payload.action === 'erinnern' || aufseherVon.size === 0)",
    ersetzen: '(aufseherVon.size === 0)',
  },
  {
    id: 'erinnern-ohne-treffpunkte',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Jetzt erinnern meint die Zusammenkünfte, die die Zusagen der Woche zeigen — keine Treffpunkte.',
    suchen: '  const offen = offeneDerWoche(weekStart, woche.week, [], woche.services',
    ersetzen: '  const offen = offeneDerWoche(weekStart, woche.week, woche.fsInsts, woche.services',
  },
  {
    id: 'erinnern-als-erinnerung',
    datei: 'supabase/functions/send-plan/index.ts',
    regel: 'Eine Erinnerung von Hand steht in der Glocke wie die des täglichen Laufs.',
    suchen: "    type: n.art === 'erinnerung' ? 'erinnerung' : 'zuteilung',\n",
    ersetzen: "    type: 'zuteilung',\n",
  },
  {
    id: 'naechste-erinnerung-nach-dem-lauf',
    datei: 'src/data/zusagen.ts',
    regel: 'Ist der tägliche Lauf heute schon vorbei, kommt die nächste Erinnerung frühestens morgen.',
    suchen: '  const ab = jetzt.getTime() < heute + ERINNERUNG_STUNDE_UTC * 36e5 ? heute : heute + 864e5\n',
    ersetzen: '  const ab = heute\n',
  },
  {
    id: 'erinnerung-stunde-wie-cron',
    datei: 'supabase/functions/_shared/erinnerung.ts',
    regel: 'Die App rechnet mit der Stunde, zu der der tägliche Lauf startet (`cron-reminders.sql`).',
    suchen: 'export const ERINNERUNG_STUNDE_UTC = 8\n',
    ersetzen: 'export const ERINNERUNG_STUNDE_UTC = 9\n',
  },
  {
    id: 'erinnern-knopf-nur-gesendet',
    datei: 'src/planen/ZusagenAnsicht.tsx',
    regel: '„Jetzt erinnern" steht erst da, wenn einer der Wartenden die Nachricht schon hat.',
    suchen: '  const kannErinnern = warten.some((p) => p.gesendet !== null)\n',
    ersetzen: '  const kannErinnern = true\n',
  },
  {
    id: 'erinnern-schon-heute-hinweis',
    datei: 'src/planen/wochen-versand.ts',
    regel: 'Hatten alle heute schon eine Erinnerung, sagt der Hinweis genau das.',
    suchen: '  return res.schonHeute > 0 ? t.toastSchonErinnert : t.toastNiemandZuErinnern\n',
    ersetzen: '  return t.toastNiemandZuErinnern\n',
  },

  /* ---- T121 Phase 6a: Personenliste und „Person anlegen" ---- */
  {
    id: 'personen-konto-schlaegt-link',
    datei: 'src/personen/person-lage.ts',
    regel: 'Angemeldet ist, wer ein verknüpftes Konto hat — auch wenn sein Link noch gilt.',
    suchen: "        stand: konten.length > 0 ? 'angemeldet' : mitLink.has(person.id) ? 'link' : 'ohne',",
    ersetzen: "        stand: mitLink.has(person.id) ? 'link' : konten.length > 0 ? 'angemeldet' : 'ohne',",
  },
  {
    id: 'personen-heute-abwesend',
    datei: 'src/personen/person-lage.ts',
    regel: 'Die Liste weiß, wer heute abwesend ist — die Auswahl „Abwesend" und der Zeitraum in der Zeile hängen daran.',
    suchen: '        abwesenheit: abwesenheitAm(quelle.absences, person.id, tag),',
    ersetzen: '        abwesenheit: undefined,',
  },
  {
    id: 'personen-nicht-angemeldet-mit-eingeladenen',
    datei: 'src/personen/person-filter.ts',
    regel: '„Noch nicht angemeldet" zeigt die Eingeladenen mit — nicht nur, wer noch keinen Code hat.',
    suchen: "      return lage.stand !== 'angemeldet'",
    ersetzen: "      return lage.stand === 'ohne'",
  },
  {
    id: 'personen-auswahl-zaehlt-unter-suche',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Die Zahlen der Auswahl zählen unter Suche und Filter — was diese ausschließen, zählt nicht mit.',
    suchen: '  const zahl = (auswahl: Auswahl) => basis.filter((e) => passtZurAuswahl(auswahl, e.lage)).length',
    ersetzen: '  const zahl = (auswahl: Auswahl) => eintraege.filter((e) => passtZurAuswahl(auswahl, e.lage)).length',
  },
  {
    id: 'personen-einladen-nur-ohne-einladung',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: '„Alle einladen" steht nur in der Auswahl „Nicht eingeladen" — „alle" sind dort genau die.',
    suchen: "      {angemeldet && filter.auswahl === 'ohne' && sichtbar.length > 0 && (",
    ersetzen: '      {angemeldet && sichtbar.length > 0 && (',
  },
  {
    id: 'personen-links-was-die-liste-zeigt',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: '„Links senden" geht genau an die, die die Liste zeigt — die Suche grenzt mit ein.',
    suchen: '          personen={sichtbar.map((e) => e.person)}',
    ersetzen: "          personen={eintraege.filter((e) => e.lage.stand === 'ohne').map((e) => e.person)}",
  },
  {
    id: 'personen-angemeldet-mit-rolle',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Wer angemeldet ist, steht mit seiner Rolle da; den Stand nennt die Zeile nur bei allen anderen.',
    suchen: "            [gruppenName, standWort && lage.stand !== 'angemeldet' ? standWort : t[ROLE_KEY[person.role]]]",
    ersetzen: '            [gruppenName, standWort ? standWort : t[ROLE_KEY[person.role]]]',
  },
  {
    id: 'personen-abwesend-als-problem',
    datei: 'src/personen/PersonenScreen.tsx',
    regel: 'Wer heute fehlt, steht in der Farbe der Probleme da.',
    suchen: "        <span className={abwesend ? 'klein-text is-problem' : 'klein-text'}>",
    ersetzen: "        <span className={'klein-text'}>",
  },
  {
    id: 'person-anlegen-keine-dublette',
    datei: 'src/personen/PersonAnlegenBlatt.tsx',
    regel: 'Ein Name, den es schon gibt, lässt sich nicht anlegen (T110).',
    suchen: "  const bereit = (name.fn !== '' || name.ln !== '') && dublette === undefined",
    ersetzen: "  const bereit = name.fn !== '' || name.ln !== ''",
  },
  {
    id: 'person-anlegen-namen-getrimmt',
    datei: 'src/personen/PersonAnlegenBlatt.tsx',
    regel: 'Leerzeichen um den Namen zählen nicht — weder als Name noch beim Speichern.',
    suchen: "  const name = { id: '', fn: fn.trim(), ln: ln.trim() }",
    ersetzen: "  const name = { id: '', fn, ln }",
  },

  /* ---- T121 Phase 6b: die Person ---- */
  {
    id: 'person-name-erst-beim-schliessen',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Tippen im Namen schreibt nichts — der Name gilt erst beim Schließen des Blatts.',
    suchen: '        onChange={(e) => setzen(e.target.value)}',
    ersetzen: '        onChange={(e) => { setzen(e.target.value); update({ fn: e.target.value }) }}',
  },
  {
    id: 'person-name-doppelt-bleibt-draussen',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Ein doppelter Name wird beim Schließen nicht übernommen — der alte bleibt, ein Hinweis sagt warum (T110).',
    suchen: "      if (dublette) dispatch({ type: 'showToast', text: fill(t.toastNameNichtGeaendert, { name: personLabel(dublette) }) })",
    ersetzen: "      if (false) dispatch({ type: 'showToast', text: fill(t.toastNameNichtGeaendert, { name: personLabel(dublette) }) })",
  },
  {
    id: 'person-name-leer-bleibt-draussen',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Ein leerer Name wird nicht übernommen — die Person bleibt, wie sie war.',
    suchen: "      else if (leer) dispatch({ type: 'showToast', text: t.toastNameLeer })",
    ersetzen: "      else if (false) dispatch({ type: 'showToast', text: t.toastNameLeer })",
  },
  {
    id: 'person-chips-nur-gesetzte',
    datei: 'src/personen/bereiche.ts',
    regel: 'Als Chips stehen nur die Bereiche, die die Person hat.',
    suchen: '    .map((g) => ({ ...g, bereiche: g.bereiche.filter((b) => privWert(person.priv, b.key)) }))',
    ersetzen: '    .map((g) => g)',
  },
  {
    id: 'person-predigtdienst-eigene-gruppe',
    datei: 'src/personen/bereiche.ts',
    regel: 'Treffpunkte und Trolley stehen beim Predigtdienst, nicht bei den Zusammenkünften — jeder Bereich genau einmal.',
    suchen: '      bereiche: fest(QUALIFICATION_ORDER.filter((k) => !PREDIGTDIENST.has(k))).sort(nachLabel),',
    ersetzen: '      bereiche: fest(QUALIFICATION_ORDER).sort(nachLabel),',
  },
  {
    id: 'konto-spur-link',
    datei: 'src/personen/KontoCard.tsx',
    regel: 'Ein gültiger Link macht den Schritt „Link gesendet" voll — als Nächstes steht das Anmelden.',
    suchen: "lage: member || offen ? 'voll' : 'jetzt' },",
    ersetzen: "lage: member ? 'voll' : 'jetzt' },",
  },
  // „auslastung-bis-zur-laufenden-woche" gestrichen (24.10.2026, T136): Die Karte
  // „Auslastung" und `aufgabenJeWoche` sind fort; die Zahl steht in der
  // Zeitleiste (`zeitleiste-zahl-*`).
  {
    id: 'abwesenheiten-nur-der-person',
    datei: 'src/components/abwesenheiten.ts',
    regel: 'Bei einer Person stehen ihre Abwesenheiten — nicht die anderer.',
    suchen: '    absences.filter((a) => a.personId === personId),',
    ersetzen: '    absences,',
  },
  {
    id: 'abwesenheit-auf-die-gezeigte-person',
    datei: 'src/components/AbwesenheitenKarte.tsx',
    regel: 'Bei einer Person trägt „Abwesenheit eintragen" auf sie ein, nicht auf den Angemeldeten.',
    suchen: '  const personId = person ? person.id : state.personId',
    ersetzen: '  const personId = state.personId',
  },
  /* ---- Einstellungen: Übersicht (T121, Phase 6c-1, 14.10.2026) ---- */
  {
    id: 'zusammenkunft-schreibt-beide-zeiten',
    datei: 'src/einstellungen/ZusammenkunftBlatt.tsx',
    regel: 'Ein neuer Wochentag der Wochenmitte schreibt das Wochenende unverändert mit — beide stehen in einem Feld.',
    suchen: 'patch: { times: { ...zeiten, [welche]: { ...zeit, ...patch } } }',
    ersetzen: 'patch: { times: { [welche]: { ...zeit, ...patch } } }',
  },
  {
    id: 'saal-blatt-schreibt-die-anschrift',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Das Blatt des Königreichssaals schreibt dessen Anschrift, nicht den Namen der Versammlung.',
    suchen: "const feld = blatt === 'saal' ? 'hall' : 'name'",
    ersetzen: "const feld = 'name'",
  },
  {
    id: 'versammlungs-text-eigene-richtung',
    datei: 'src/einstellungen/TextBlatt.tsx',
    regel: 'Name und Anschrift der Versammlung stehen im Feld in ihrer eigenen Schreibrichtung.',
    suchen: '          dir="auto"\n',
    ersetzen: '',
  },
  {
    id: 'einstell-wert-eigene-richtung',
    datei: 'src/einstellungen/EinstellZeile.tsx',
    regel: 'Ein Wert der Versammlung steht auch in seiner Zeile in der eigenen Schreibrichtung.',
    suchen: "dir={eigen ? 'auto' : undefined}",
    ersetzen: 'dir={undefined}',
  },
  {
    id: 'programmsprachen-versammlung-zuerst',
    // Seit Phase 10 eine Stelle für die Einstellungen und das Blatt „Programm holen".
    datei: 'src/i18n/langnames.ts',
    regel: 'Bei den Programmsprachen steht die Sprache der Versammlung vor den weiteren.',
    suchen: 'return [congLang, ...progLangs].map(',
    ersetzen: 'return [...progLangs, congLang].map(',
  },
  {
    id: 'sprache-hinzu-im-anderen-modus',
    datei: 'src/einstellungen/SprachenInhalt.tsx',
    regel: '„Sprache hinzufügen" öffnet das Sprachen-Blatt für eine weitere Sprache — sonst überschriebe es die der Versammlung.',
    suchen: "dispatch({ type: 'openLangSheet', mode: 'alt' })",
    ersetzen: "dispatch({ type: 'openLangSheet' })",
  },
  {
    id: 'wer-plant-auch-die-planer',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: '„Wer plant" nennt nicht nur die Admins, sondern auch alle, die planen dürfen.',
    suchen: '      return rechte.admin || rechte.planer\n',
    ersetzen: '      return rechte.admin\n',
  },
  {
    id: 'erinnerung-tage-aus-intl',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Die Tage der Erinnerung stehen in Worten mit der Mehrzahl ihrer Sprache — „1 Tag", „7 Tage".',
    suchen: "fill(t.remVorher, { dauer: zeitspanne(tage, 'day', lang) })",
    ersetzen: 'fill(t.remVorher, { dauer: String(tage) })',
  },
  {
    id: 'erinnerung-null-heisst-am-tag',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Null Tage vorher heißt „am Tag", nicht „0 Tage vorher".',
    suchen: 'return tage === 0 ? t.remAmTagKurz : ',
    ersetzen: 'return tage < 0 ? t.remAmTagKurz : ',
  },
  {
    id: 'einstellungen-desktop-zeigt-den-gewaehlten',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop ist der gewählte Abschnitt links als aktuell markiert.',
    suchen: "aria-current={abschnitt === gewaehlt ? 'true' : undefined}",
    ersetzen: 'aria-current={undefined}',
  },
  {
    id: 'einstellungen-zurueck-schliesst-unteransicht',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Zurück am Handy schließt zuerst die Unteransicht der Einstellungen, erst dann den Bildschirm.',
    suchen: "  useBackDismiss(offen !== null, () => setOffen(null), 'unteransicht')\n",
    ersetzen: '',
  },
  /* ---- Einstellungen: Hilfsdienste (T121, Phase 6c-2, 14.10.2026) ---- */
  {
    id: 'dienst-verschieben-am-rand-bleibt',
    datei: 'src/data/dienste.ts',
    regel: 'Ein Dienst am Rand lässt sich nicht weiter schieben — die Liste bleibt, wie sie ist.',
    suchen: 'if (von < 0 || nach < 0 || nach >= services.length) return services',
    ersetzen: 'if (von < 0) return services',
  },
  {
    id: 'dienst-verschieben-speichert-positionen',
    datei: 'src/app/persist.ts',
    regel: 'Nach dem Verschieben bekommen beide Dienste ihre neue Position in der Datenbank — sonst stünde nach dem Laden die alte Folge da.',
    suchen:
      '// Zwei Dienste tauschen die Plätze — beide bekommen ihre neue Position.\n      geaenderteSchreiben(prev.services, next.services, (svc, pos) => saveService(congId, svc, pos))',
    ersetzen: '// Zwei Dienste tauschen die Plätze — beide bekommen ihre neue Position.',
  },
  {
    id: 'hilfsdienst-niemand-hervorgehoben',
    datei: 'src/einstellungen/HilfsdiensteInhalt.tsx',
    regel: 'Darf niemand einen Dienst übernehmen, hebt sich die Zahl ab — sein Platz bliebe sonst still offen (T79).',
    suchen: "className={anzahl === 0 ? 'klein-text hd-niemand' : 'klein-text'}",
    ersetzen: "className={'klein-text'}",
  },
  {
    // Bis zum 18.10.2026 zählte er gar nichts und nannte nur die Rotation —
    // seitdem lassen sich Gruppen aus der Reinigung nehmen.
    id: 'hilfsdienst-gruppen-dienst-zaehlt-gruppen',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Ein Gruppen-Dienst (Reinigung) zählt die Gruppen, die reinigen — keine Personen.',
    suchen: '  return service.groups\n    ? reinigungsGruppen(daten.groups).length\n',
    ersetzen: '  return false\n    ? reinigungsGruppen(daten.groups).length\n',
  },
  {
    id: 'hilfsdienst-neu-oeffnet-sein-blatt',
    datei: 'src/einstellungen/HilfsdienstNeuBlatt.tsx',
    regel: 'Nach „Hilfsdienst hinzufügen" öffnet sich sein Blatt — dort steht, wer ihn übernehmen darf (T79).',
    suchen: "    dispatch({ type: 'openServiceSheet', key })\n",
    ersetzen: '',
  },
  {
    id: 'hilfsdienst-neu-braucht-namen',
    datei: 'src/einstellungen/HilfsdienstNeuBlatt.tsx',
    regel: 'Ohne Namen entsteht kein Hilfsdienst — der Knopf geht erst mit einem.',
    suchen: "const bereit = name.trim() !== ''",
    ersetzen: 'const bereit = true',
  },
  {
    id: 'hilfsdienst-oben-gesperrt',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Der erste Dienst lässt sich nicht weiter nach oben schieben — der Knopf ist gesperrt.',
    suchen: 'gesperrt={position <= 0}',
    ersetzen: 'gesperrt={false}',
  },
  /* ---- Einstellungen: Gruppen (T121, Phase 6c-3, 14.10.2026) ---- */
  {
    id: 'gruppen-name-erst-beim-schliessen',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Tippen im Namen einer Gruppe schreibt nichts — der Name gilt erst beim Schließen.',
    suchen: 'onChange={(e) => setName(e.target.value)}',
    ersetzen: 'onChange={(e) => { setName(e.target.value); update({ name: e.target.value }) }}',
  },
  {
    id: 'gruppen-name-leer-bleibt-alt',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Ein leerer Gruppenname wird nicht übernommen — der alte bleibt, ein Hinweis sagt warum.',
    suchen: "  const fehler = leer ? t.toastNameLeer : dublette",
    ersetzen: "  const fehler = dublette",
  },
  {
    id: 'gruppen-name-doppelt-bleibt-alt',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Ein doppelter Gruppenname wird nicht übernommen — die geplante Reinigung kennt die Gruppe nur beim Namen.',
    suchen: "      if (fehler) dispatch({ type: 'showToast', text: fehler })\n      else update({ name: neu })",
    ersetzen: '      update({ name: neu })',
  },
  {
    id: 'gruppen-dublette-auch-uebersetzt',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Doppelt ist ein Gruppenname auch in der Schreibweise des Lesers („Group 2" neben „Gruppe 2").',
    suchen: '(schluessel(x.name) === gesucht || schluessel(lesen(x.name)) === gesucht)',
    ersetzen: '(schluessel(x.name) === gesucht)',
  },
  {
    id: 'gruppen-name-zieht-durch-reinigung',
    datei: 'src/app/reducer.ts',
    regel: 'Ein neuer Gruppenname zieht durch die geplante Reinigung — sie kennt die Gruppe nur beim Namen.',
    suchen: '            ? gruppeInWochenUmbenennen(state.weeks, state.services, vorher.name, neuerName)\n',
    ersetzen: '            ? state.weeks\n',
  },
  {
    id: 'gruppen-umbenennen-nur-gruppen-dienste',
    datei: 'src/data/dienste.ts',
    regel: 'Umbenannt wird nur an den Plätzen der Gruppen-Dienste, nicht in einem Dienst für Personen.',
    suchen: '  const keys = services.filter((s) => s.groups).map((s) => s.key)',
    ersetzen: '  const keys = services.map((s) => s.key)',
  },
  {
    id: 'hilfsdienst-suche-wie-personenliste',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Die Suche im Blatt eines Dienstes findet wie die Personenliste auch „Vorname Nachname".',
    suchen: 'personen.filter((p) => passtOhneAuswahl(p, { ...KEIN_FILTER, q: suche }))',
    ersetzen: "personen.filter((p) => listName(p).toLowerCase().includes(suche.trim().toLowerCase()))",
  },
  {
    id: 'gruppen-name-unberuehrt-bleibt-kanonisch',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Wer den Namen nicht anfasst, lässt den gespeicherten stehen — „Gruppe 1" bleibt übersetzbar.',
    suchen: '    if (neu !== gelesen) {',
    ersetzen: '    if (neu === neu) {',
  },
  // Seit dem 14.10.2026 steht die Wahl an einer Stelle (`amtKandidaten`).
  {
    id: 'gruppen-aufseher-aelteste-und-dag',
    datei: 'src/data/helpers.ts',
    regel: 'Als Aufseher einer Gruppe stehen nur Älteste und Dienstamtgehilfen zur Wahl.',
    suchen: "  overseerId: (p) => p.role === 'aeltester' || p.role === 'dienstamtgehilfe',\n",
    ersetzen: '  overseerId: () => true,\n',
  },
  {
    id: 'gruppen-gehilfe-keine-schwester',
    datei: 'src/data/helpers.ts',
    regel: 'Als Gehilfe einer Gruppe steht jeder Bruder zur Wahl, keine Schwester.',
    suchen: "  assistantId: (p) => !p.female && p.role !== 'keine',\n",
    ersetzen: "  assistantId: (p) => p.role !== 'keine',\n",
  },
  {
    id: 'gruppen-gehilfe-nicht-keine',
    datei: 'src/data/helpers.ts',
    regel: 'Gehilfe wird kein Bruder mit der Rolle „Keine" — inaktive Schüler sind keine Verkündiger.',
    suchen: "  assistantId: (p) => !p.female && p.role !== 'keine',\n",
    ersetzen: '  assistantId: (p) => !p.female,\n',
  },
  // ── Eine Gruppe je Person (Betreiber, 14.10.2026) ────────────────────────
  // „Man leitet auch keine Gruppe, in der man nicht ist." Die Rechte fragen
  // nach *der* geleiteten Gruppe (`overseerGroup`); stimmt die Regel nicht,
  // plant ein Aufseher zweier Gruppen nur die erste.
  {
    id: 'gruppen-amt-nur-mitglieder',
    datei: 'src/data/helpers.ts',
    regel: 'Aufseher und Gehilfe stehen nur aus den Mitgliedern der Gruppe zur Wahl — niemand leitet zwei Gruppen.',
    suchen: '(p.grp === gruppe.id && AMT_MOEGLICH[amt](p))',
    ersetzen: 'AMT_MOEGLICH[amt](p)',
  },
  {
    id: 'gruppen-amt-inhaber-sichtbar',
    datei: 'src/data/helpers.ts',
    regel: 'Wer das Amt hat, bleibt im Feld stehen, auch wenn er nicht mehr passt — sonst zeigte es „—", während er die Gruppe plant.',
    suchen: 'persons.filter((p) => p.id === gruppe[amt] || (',
    ersetzen: 'persons.filter((p) => (',
  },
  {
    id: 'gruppen-amt-niemand-beides',
    datei: 'src/data/helpers.ts',
    regel: 'Niemand ist Aufseher und Gehilfe derselben Gruppe — wird der Gehilfe Aufseher, rückt er auf.',
    suchen: '  const ohne = (id: string | null): string | null => (personId !== null && id === personId ? null : id)\n',
    ersetzen: '  const ohne = (id: string | null): string | null => id\n',
  },
  {
    id: 'gruppen-wahl-hinweis',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Das Blatt der Gruppe sagt, dass nur ihre Mitglieder zur Wahl stehen — auch einer neuen, die noch niemanden hat.',
    suchen: '        <p id={wahlHinweisId} className="klein-text">\n          {t.gruppeWahlMitglieder}\n        </p>\n',
    ersetzen: '',
  },
  {
    id: 'gruppen-wahl-hinweis-am-feld',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Aufseher- und Gehilfenfeld verweisen auf den Hinweis — ein Vorleseprogramm liest ihn beim Feld vor.',
    suchen: '      aria-describedby={wahlHinweisId}\n',
    ersetzen: '',
  },
  {
    id: 'gruppenwechsel-beendet-amt',
    datei: 'src/app/reducer.ts',
    regel: 'Wer die Gruppe wechselt, ist in der alten weder Aufseher noch Gehilfe — und plant sie nicht mehr.',
    suchen: "      if ('grp' in action.patch) next.groups = aemterBeenden(state.groups, action.id, action.patch.grp ?? null)\n",
    ersetzen: '',
  },
  // Hier stand `gruppenwechsel-nur-bei-wechsel` („dieselbe Gruppe noch einmal
  // beendet nichts"): Die Probe meldete es unbewacht, weil die Bedingung seit
  // `bleibt` nichts mehr bewirkt — in der eigenen Gruppe bleibt das Amt ohnehin.
  // Sie ist gestrichen; der Fall steht weiter in `reducer.test.ts`.
  {
    id: 'gruppenwechsel-amt-in-neuer-gruppe-bleibt',
    datei: 'src/data/helpers.ts',
    regel: 'Wer in die Gruppe wechselt, die er schon leitet, behält dort das Amt — die Reparatur nimmt es ihm nicht.',
    suchen: 'g.id !== bleibt && (g.overseerId === personId || g.assistantId === personId)',
    ersetzen: '(g.overseerId === personId || g.assistantId === personId)',
  },
  {
    id: 'gruppenwechsel-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Das beendete Amt geht in die Datenbank — sonst stünde der Aufseher nach dem Laden wieder da.',
    // Die Zeile darunter steht genauso beim Entfernen einer Gruppe — der
    // Kommentar davor macht die Stelle eindeutig.
    suchen:
      '      // nächsten Laden wieder als ihr Aufseher da und plante sie weiter.\n      geaenderteSchreiben(prev.groups, next.groups, (grp, pos) => saveGroupRow(congId, grp, pos))\n',
    ersetzen: '      // nächsten Laden wieder als ihr Aufseher da und plante sie weiter.\n',
  },
  {
    id: 'gruppenwechsel-hinweis-vorher',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Beim Aufseher und beim Gehilfen steht unter der Gruppe, dass ein Wechsel das Amt beendet.',
    suchen:
      '        {amtHinweis && (\n          <p id={amtHinweisId} className="klein-text">\n            {amtHinweis}\n          </p>\n        )}\n',
    ersetzen: '',
  },
  {
    id: 'gruppenwechsel-hinweis-am-feld',
    datei: 'src/personen/PersonBearbeitenBlatt.tsx',
    regel: 'Das Gruppenfeld verweist auf den Hinweis zum Amt — ein Vorleseprogramm liest ihn vor dem Wechsel.',
    suchen: '              aria-describedby={amtHinweis ? amtHinweisId : undefined}\n',
    ersetzen: '',
  },
  {
    id: 'person-weg-amt-weg',
    datei: 'src/app/reducer.ts',
    regel: 'Wer gelöscht wird, ist danach nirgends mehr Aufseher oder Gehilfe.',
    suchen: '    groups: aemterBeenden(state.groups, id),\n',
    ersetzen: '',
  },
  {
    id: 'gruppen-folgen-nennen-besuche',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen einer Gruppe steht da, dass ihre Gruppenbesuche entfallen.',
    suchen: "  if (daten.gruppenbesuche.some((b) => b.grp === gruppeId)) folgen.push('besuche')\n",
    ersetzen: '',
  },
  {
    id: 'gruppen-folgen-plaene',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Vor dem Entfernen einer Gruppe steht da, dass ihre Zeiträume in den weiteren Plänen ohne Gruppe bleiben.',
    suchen: "  if (daten.planEintraege.some((e) => e.grp === gruppeId)) folgen.push('plaene')\n",
    ersetzen: '',
  },
  {
    id: 'hilfsdienst-hinweis-gruppen',
    datei: 'src/einstellungen/HilfsdienstBlatt.tsx',
    regel: 'Vor dem Entfernen der Reinigung nennt der Hinweis keine Freigaben bei Personen — sie hat keine — und sagt, dass sie nicht wiederkommt.',
    suchen: '{service.groups ? t.hdEntfernenHinweisGruppen : t.hdEntfernenHinweis}',
    ersetzen: '{t.hdEntfernenHinweis}',
  },
  {
    id: 'einstellungen-desktop-titel-einmal',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop steht der Titel eines Abschnitts einmal — nicht noch einmal über seiner Karte.',
    suchen: '    zusammenkuenfte: () => <ZusammenkuenfteKarte mitTitel={false} />,',
    ersetzen: '    zusammenkuenfte: () => <ZusammenkuenfteKarte />,',
  },
  {
    id: 'gruppen-neue-zaehlt-weiter',
    datei: 'src/einstellungen/einstellungen-anzeige.ts',
    regel: 'Eine neue Gruppe (und ein neuer Trolley) bekommt die nächste Nummer — nicht wieder eine vergebene.',
    suchen: '  return liste.reduce((m, x) => Math.max(m, ...(x.name.match(/\\d+/g) ?? []).map(Number)), 0) + 1',
    ersetzen: '  return liste.length + 1',
  },
  {
    id: 'gruppen-name-eigene-richtung',
    datei: 'src/einstellungen/GruppenInhalt.tsx',
    regel: 'Der Name einer Gruppe ist frei und steht in seiner eigenen Schreibrichtung.',
    suchen: '              eigenerName\n',
    ersetzen: '',
  },
  {
    id: 'gruppen-tabelle-am-desktop',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop stehen die Gruppen als Tabelle: Gruppe, Aufseher, Gehilfe, Personen.',
    suchen: 'gruppen: () => <GruppenInhalt tabelle />,',
    ersetzen: 'gruppen: () => <GruppenInhalt />,',
  },
  /* ---- Einstellungen: Erinnerungen als Zeitleiste (T121, Phase 6c-4, 14.10.2026) ---- */
  {
    id: 'erinnerungen-zitiert-echten-titel',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '„Plan gesendet" zitiert den Titel, unter dem die Mitteilung ankommt — in der Sprache des Lesers, keine Abschrift.',
    suchen: 'fill(t.erinPlanSofort, { titel: t.notifZuteilung })',
    ersetzen: "fill(t.erinPlanSofort, { titel: 'Neue Zuteilung' })",
  },
  {
    id: 'erinnerungen-bestandswert-als-dritte',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Eine letzte Erinnerung über einem Tag steht als eigene Möglichkeit da und ist gedrückt — sonst sähe niemand, was gilt.',
    suchen: '  const tage = last > 1 ? [0, 1, last] : [0, 1]',
    ersetzen: '  const tage = [0, 1]',
  },
  {
    id: 'erinnerungen-gleiche-wahl-schreibt-nicht',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Ein Tipp auf die schon gewählte letzte Erinnerung schreibt nichts.',
    suchen: "if (tage !== last) dispatch({ type: 'setReminder', key: 'last', value: tage })",
    ersetzen: "dispatch({ type: 'setReminder', key: 'last', value: tage })",
  },
  {
    id: 'erinnerungen-wahl-gross',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Die Möglichkeiten der letzten Erinnerung beginnen in jeder Sprache groß (ru „За 1 день", sw „Mapema kwa siku 1").',
    suchen: '  const texte = { remAmTagKurz: t.remAmTagOption, remVorher: t.remVorherOption }',
    ersetzen: '  const texte = { remAmTagKurz: t.remAmTagOption, remVorher: (t as Dict).remVorher }',
  },
  {
    id: 'erinnerungen-grenze-wie-reducer',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '+ sperrt bei der ersten Erinnerung an derselben Grenze, an der der Reducer klemmt (21 Tage).',
    suchen: 'max={ERINNERUNG_GRENZEN.first.max}',
    ersetzen: 'max={30}',
  },
  {
    id: 'erinnerungen-erste-schrittweise',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '− und + verstellen die erste Erinnerung um einen Tag in die gedrückte Richtung.',
    suchen: 'delta: neu > first ? 1 : -1',
    ersetzen: 'delta: 1',
  },
  {
    id: 'erinnerungen-meldung-echter-titel',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: '„Sofort gemeldet" nennt den Entzug so, wie die Mitteilung heißt — in der Sprache des Lesers.',
    suchen: '<Meldung titel={t.notifEntzug} an={t.erinEntzugAn} />',
    ersetzen: '<Meldung titel="Zuteilung zurückgezogen" an={t.erinEntzugAn} />',
  },
  {
    id: 'erinnerung-setzen-geklemmt',
    datei: 'src/app/reducer.ts',
    regel: 'Ein gesetzter Erinnerungswert bleibt in den Grenzen der Datenbank (erste 1–21, letzte 0–7).',
    suchen: '      const value = Math.max(min, Math.min(max, gewuenscht))',
    ersetzen: '      const value = gewuenscht',
  },
  {
    id: 'erinnerung-setzen-gespeichert',
    datei: 'src/app/persist.ts',
    regel: 'Die Wahl der letzten Erinnerung wird gespeichert wie − und +.',
    suchen: "    case 'setReminder':\n",
    ersetzen: '',
  },
  {
    id: 'erinnerung-grenzen-wie-datenbank',
    datei: 'src/app/context.ts',
    regel: 'Die Grenzen der Erinnerungen sind die der Datenbank (`reminder_last between 0 and 7`).',
    suchen: '  last: { min: 0, max: 7 },',
    ersetzen: '  last: { min: 0, max: 9 },',
  },
  {
    id: 'einstellungen-erinnerungen-eingehaengt',
    datei: 'src/einstellungen/EinstellungenScreen.tsx',
    regel: 'Am Desktop zeigt der Abschnitt „Mitteilungen und Erinnerungen" die Zeitleiste der Erinnerungen.',
    suchen: 'erinnerungen: () => <ErinnerungenInhalt />,',
    ersetzen: 'erinnerungen: () => null,',
  },
  // ── Trolleys (T121, Phase 7) ──────────────────────────────────────────────
  {
    id: "trolley-fn-eintragen-recht",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Eintragen kann sich nur, wer das Trolley-Recht hat — die Function prüft es selbst, nicht die App.",
    suchen: "  if (!darfTrolley(a.ich)) return nein('kein-recht')\n  if (datum < heute) return nein('vorbei')",
    ersetzen: "  if (datum < heute) return nein('vorbei')",
  },
  {
    id: "trolley-fn-dazukommen-recht",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Dazukommen kann nur, wer das Trolley-Recht hat.",
    suchen: "  if (!darfTrolley(a.ich)) return nein('kein-recht')\n  const termin = await terminLesen(a.cong, id)",
    ersetzen: "  const termin = await terminLesen(a.cong, id)",
  },
  {
    id: "trolley-fn-partner-recht",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Als Partner einträgt man nur, wer selbst das Trolley-Recht hat.",
    suchen: "  if (partner && !darfTrolley(partnerRows[0])) return nein('partner-ohne-recht')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-vorbei",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Ein Tag, der vorbei ist, nimmt niemanden mehr auf.",
    suchen: "  if (datum < heute) return nein('vorbei')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-belegt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Ein Trolley ist zur selben Zeit nur einmal unterwegs.",
    suchen: "  if (amTag.some((t) => t.trolley_id === trolleyId && ueberschneiden(t, neu))) return nein('belegt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-doppelt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Niemand ist zur selben Zeit an zwei Trolleys eingetragen.",
    suchen: "  if (schonUnterwegs(amTag, a.ich.id, neu)) return nein('doppelt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-partner-doppelt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Auch der Partner ist zur selben Zeit nicht schon woanders eingetragen.",
    suchen: "  if (partner && schonUnterwegs(amTag, partner, neu)) return nein('partner-doppelt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-dazukommen-doppelt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer zur selben Zeit schon eingetragen ist, kommt nirgends dazu.",
    suchen: "  if (schonUnterwegs(await termineAm(a.cong, termin.datum), a.ich.id, termin, termin.id)) return nein('doppelt')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-dazukommen-bedingt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Dazukommen schreibt nur, solange noch niemand dazugekommen ist — von zweien zugleich gewinnt einer.",
    suchen: "&partner_id=is.null&select=",
    ersetzen: "&select=",
  },
  {
    id: "trolley-fn-dazukommen-eigener",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Zum eigenen Termin kommt man nicht dazu.",
    suchen: "  if (termin.person_id === a.ich.id) return nein('bad-request')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-austragen-nur-dabei",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer nicht im Termin steht, trägt niemanden aus.",
    suchen: "  if (bleibt === undefined) return nein('forbidden')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-austragen-bedingt",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Austragen trifft nur den gelesenen Stand — hat sich der Partner inzwischen geändert, trifft es nichts.",
    suchen: "    (termin.partner_id ? `&partner_id=eq.${wert(termin.partner_id)}` : '&partner_id=is.null') +",
    ersetzen: "",
  },
  {
    id: "trolley-fn-meldet-partner",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer als Partner eingetragen wird, bekommt „Für den Trolley eingetragen\".",
    suchen: "  if (partner) {",
    ersetzen: "  if (false) {",
  },
  {
    id: "trolley-fn-entfernen-nur-admin",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Einen Trolley entfernt nur der Admin.",
    suchen: "  if (!a.admin) return nein('forbidden')",
    ersetzen: "",
  },
  {
    id: "trolley-fn-entfernen-ohne-person",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Ein Admin entfernt einen Trolley auch, wenn sein Konto keiner Person zugeordnet ist.",
    suchen: "    if (payload.aktion === 'entfernen') {",
    ersetzen: "    if (payload.aktion === 'entfernen' && mich.person_id) {",
  },
  {
    id: "trolley-fn-entfernen-nicht-selbst",
    datei: "supabase/functions/trolley/index.ts",
    regel: "Wer einen Trolley entfernt, bekommt selbst keine Meldung darüber.",
    suchen: ".filter((pid): pid is string => pid !== null && pid !== a.ichId)",
    ersetzen: ".filter((pid): pid is string => pid !== null)",
  },
  {
    id: "trolley-uebergabe-zur-vollen-stunde",
    datei: "supabase/functions/_shared/trolley.ts",
    regel: "Wer um 11 übernimmt, wo einer um 11 aufhört, stört niemanden — die Grenze gehört keinem.",
    suchen: "  return a.datum === b.datum && a.von < b.bis && b.von < a.bis",
    ersetzen: "  return a.datum === b.datum && a.von <= b.bis && b.von <= a.bis",
  },
  {
    id: "trolley-halbe-stunden",
    datei: "supabase/functions/_shared/trolley.ts",
    regel: "Termine liegen im Raster: von 6 bis 22 Uhr, in halben Stunden.",
    suchen: "  return TROLLEY_ZEITEN.includes(von) && TROLLEY_ZEITEN.includes(bis) && von < bis",
    ersetzen: "  return von < bis",
  },
  {
    id: "trolley-partner-bleibt",
    datei: "supabase/functions/_shared/trolley.ts",
    regel: "Geht der, der eingetragen hat, bleibt der Partner — und sucht wieder einen.",
    suchen: "  return partner ? { person: partner } : null",
    ersetzen: "  return null",
  },
  {
    id: "trolley-hindernis-belegt",
    datei: "src/data/trolleys.ts",
    regel: "Dass der Trolley zu der Zeit schon unterwegs ist, steht schon vor dem Absenden da.",
    suchen: "  if (termine.some((t) => t.trolleyId === wunsch.trolleyId && ueberschneiden(t, wunsch))) return 'belegt'",
    ersetzen: "",
  },
  {
    id: "trolley-hindernis-partner-recht",
    datei: "src/data/trolleys.ts",
    regel: "Ein Partner ohne Trolley-Recht wird vor dem Absenden genannt.",
    suchen: "  if (wunsch.partner && !darfTrolley(wunsch.partner)) return 'partner-ohne-recht'",
    ersetzen: "",
  },
  {
    id: "trolley-eigene-ab-heute",
    datei: "src/data/trolleys.ts",
    regel: "Unter den eigenen Terminen steht nichts, was vorbei ist.",
    suchen: "  return termineSortiert(termine.filter((t) => t.datum >= tag && istDabei(t, pid)))",
    ersetzen: "  return termineSortiert(termine.filter((t) => istDabei(t, pid)))",
  },
  {
    id: "trolley-gesucht-ohne-eigene",
    datei: "src/data/trolleys.ts",
    regel: "Unter „Partner gesucht\" steht der eigene Termin nicht — zu sich selbst kommt man nicht dazu.",
    suchen: "  return termineSortiert(termine.filter((t) => t.datum >= tag && t.partner === null && t.pid !== pid))",
    ersetzen: "  return termineSortiert(termine.filter((t) => t.datum >= tag && t.partner === null))",
  },
  {
    id: "trolley-vorschlag-dieser-trolley",
    datei: "src/data/trolleys.ts",
    regel: "Der Vorschlag nach einem Tipp reicht bis zum nächsten Termin dieses Trolleys — ein anderer zählt nicht.",
    suchen: "    .filter((t) => t.trolleyId === trolleyId && t.datum === datum && minuten(t.von) > anfang)",
    ersetzen: "    .filter((t) => t.datum === datum && minuten(t.von) > anfang)",
  },
  {
    id: "trolley-kommende-ab-heute",
    datei: "src/data/trolleys.ts",
    regel: "Kommende Termine eines Trolleys zählen ab heute — was vorbei ist, geht beim Entfernen nicht verloren.",
    suchen: "  return termine.filter((t) => t.trolleyId === trolleyId && t.datum >= tag)",
    ersetzen: "  return termine.filter((t) => t.trolleyId === trolleyId)",
  },
  {
    id: "trolley-entfernt-nimmt-termine",
    datei: "src/app/reducer.ts",
    regel: "Ein entfernter Trolley nimmt seine Termine mit — wie in der Datenbank (on delete cascade).",
    suchen: "        trolleyTermine: state.trolleyTermine.filter((t) => t.trolleyId !== action.id),",
    ersetzen: "        trolleyTermine: state.trolleyTermine,",
  },
  {
    id: "trolley-person-weg-partner-sucht",
    datei: "src/app/reducer.ts",
    regel: "Geht der Partner, bleibt der Termin — der andere sucht wieder einen (on delete set null).",
    suchen: "        .map((t) => (t.partner === id ? { ...t, partner: null, gemeinsam: false } : t)),",
    ersetzen: "        .map((t) => t),",
  },
  {
    id: "trolley-termine-sortiert",
    datei: "src/app/reducer.ts",
    regel: "Was die Function zurückgibt, steht nach Tag und Zeit — wie die Ansicht es liest.",
    suchen: "        trolleyTermine: action.termin ? termineSortiert([...ohne, action.termin]) : ohne,",
    ersetzen: "        trolleyTermine: action.termin ? [...ohne, action.termin] : ohne,",
  },
  {
    id: "trolley-name-nie-leer",
    datei: "src/app/reducer.ts",
    regel: "Ohne Namen ist es kein Trolley — der Zustand nimmt ihn nicht an.",
    suchen: "      if (!alt || action.patch.name?.trim() === '') return state",
    ersetzen: "      if (!alt) return state",
  },
  {
    id: "trolley-anlegen-gespeichert",
    datei: "src/app/persist.ts",
    regel: "Ein neuer Trolley wird gespeichert.",
    suchen: "    case 'trolleyAnlegen':\n",
    ersetzen: "",
  },
  {
    id: "trolley-aendern-gespeichert",
    datei: "src/app/persist.ts",
    regel: "Name, Ort und Hinweis eines Trolleys werden gespeichert.",
    suchen: "    case 'trolleyAendern':\n",
    ersetzen: "",
  },
  {
    id: "trolley-veraltet-laedt-nach",
    datei: "src/trolleys/useTrolleyAktion.ts",
    regel: "War jemand schneller, lädt die App still nach — die Ansicht zeigt, was jetzt gilt.",
    suchen: "    if (!erg.ok && VERALTET.has(erg.fehler) && state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })",
    ersetzen: "",
  },
  {
    id: "trolley-entfernen-weg-gilt",
    datei: "src/trolleys/useTrolleyAktion.ts",
    regel: "Ist der Trolley schon fort, ist das so gut wie entfernt.",
    suchen: "      if (!erg.ok && erg.fehler !== 'weg') return erg.fehler",
    ersetzen: "      if (!erg.ok) return erg.fehler",
  },
  {
    id: "trolley-reiter-nur-ansehen",
    datei: "src/planen/fs-bereiche.ts",
    regel: "Den Reiter „Trolleys\" gibt es nur beim Ansehen — die Trolleys plant niemand.",
    suchen: "  const trolleys = !planen && trolleyReiter(state, rechte.zuteilen)",
    ersetzen: "  const trolleys = trolleyReiter(state, rechte.zuteilen)",
  },
  {
    id: "trolley-reiter-nur-mit-recht",
    datei: "src/planen/fs-bereiche.ts",
    regel: "Den Reiter „Trolleys\" sieht, wer mit dem Trolley gehen darf, wer zuteilt oder wer noch einen Termin hat — nicht jeder (T130).",
    suchen: "  return zuteilen || darfTrolley(ich) || eigeneTermine(state.trolleyTermine, ich?.id, heute).length > 0\n",
    ersetzen: "  return true\n",
  },
  {
    id: "trolley-reiter-zuteiler-immer",
    datei: "src/planen/fs-bereiche.ts",
    regel: "Admin und Planer sehen den Reiter „Trolleys\" immer, auch ohne das Trolley-Recht (T130).",
    suchen: "  return zuteilen || darfTrolley(ich) || eigeneTermine(state.trolleyTermine, ich?.id, heute).length > 0\n",
    ersetzen: "  return darfTrolley(ich) || eigeneTermine(state.trolleyTermine, ich?.id, heute).length > 0\n",
  },
  {
    id: "trolley-reiter-eigener-termin",
    datei: "src/planen/fs-bereiche.ts",
    regel: "Wer noch einen eigenen Trolley-Termin hat, sieht den Reiter auch ohne das Recht — nach dem Entzug käme er sonst nicht mehr zum Austragen (T130).",
    suchen: "  return zuteilen || darfTrolley(ich) || eigeneTermine(state.trolleyTermine, ich?.id, heute).length > 0\n",
    ersetzen: "  return zuteilen || darfTrolley(ich)\n",
  },
  {
    id: "trolley-reiter-ohne-trolley",
    datei: "src/planen/fs-bereiche.ts",
    regel: "Ohne Trolley in der Versammlung gibt es den Reiter nicht — auch nicht für den, der zuteilt.",
    suchen: "  if (state.trolleys.length === 0) return false\n",
    ersetzen: "",
  },
  {
    id: "trolley-blatt-name-doppelt",
    datei: "src/einstellungen/TrolleyBlatt.tsx",
    regel: "Ein doppelter Trolley-Name bleibt der alte — und ein Hinweis sagt warum.",
    suchen: "  const dublette = doppelterName(state.trolleys, trolley.id, name)",
    ersetzen: "  const dublette = undefined",
  },
  {
    id: "trolley-blatt-nur-geaendertes",
    datei: "src/einstellungen/TrolleyBlatt.tsx",
    regel: "Wer im Blatt nichts anfasst, schreibt nichts.",
    suchen: "    if (eingabe.ort.trim() !== trolley.ort) patch.ort = eingabe.ort.trim()",
    ersetzen: "    patch.ort = eingabe.ort.trim()",
  },
  {
    id: "trolley-blatt-folgen-nur-mit-terminen",
    datei: "src/einstellungen/TrolleyBlatt.tsx",
    regel: "Ohne kommende Termine nennt das Blatt keine Folgen des Entfernens — erfunden wird keine.",
    suchen: "        {kommende > 0 && (",
    ersetzen: "        {kommende >= 0 && (",
  },
  {
    id: "trolley-neu-naechste-zahl",
    datei: "src/einstellungen/TrolleysKarte.tsx",
    regel: "Ein neuer Trolley zählt weiter — nicht wieder bei 1.",
    suchen: "name: neuerTrolleyName(state.trolleys, t.privZeugnis)",
    ersetzen: "name: t.privZeugnis",
  },
  {
    id: "start-trolley-nach-dem-tag",
    datei: "src/dashboard/DashboardScreen.tsx",
    regel: "Auf Start stehen die eigenen Trolley-Termine nach dem Tag zwischen den Aufgaben.",
    suchen: "  zeilen.sort((a, b) => (a.tag ?? ohneTag).localeCompare(b.tag ?? ohneTag))",
    ersetzen: "",
  },
  {
    id: "aufgaben-trolley-nur-eigene",
    datei: "src/aufgaben/AufgabenScreen.tsx",
    regel: "In „Meine Aufgaben\" stehen nur die eigenen kommenden Trolley-Termine.",
    suchen: "  const termine = eigeneTermine(state.trolleyTermine, ich, fromIso(heute))",
    ersetzen: "  const termine = state.trolleyTermine",
  },
  {
    id: "erinnerung-trolley-beide",
    datei: "supabase/functions/send-reminders/index.ts",
    regel: "Am Vortag erinnert die App beide, die eingetragen sind — nicht nur den, der eingetragen hat.",
    suchen: "          [t.partner_id, t.person_id],",
    ersetzen: "",
  },
  {
    id: "probe-trolley-laeuft",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Die Probe misst die Trolley-Fälle (71)–(79).",
    suchen: "  await trolleyProben(k)\n",
    ersetzen: "",
  },
  {
    id: "probe-trolley-urteil-nur-recht",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Ein Urteil an der Function `trolley` ist nur der Erfolg oder die Abweisung über das Recht — `belegt`, `weg`, `no-person` heißen „Probe kaputt\".",
    suchen: "urteil: a.status < 400 || TROLLEY_RECHT.includes(fehler)",
    ersetzen: "urteil: true",
  },
  {
    id: "probe-trolley-71-mit-recht",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "(71) schreibt mit dem Trolley-Recht — sonst wiese schon der Trigger ab, und die Richtlinie bliebe ungemessen.",
    suchen: "    await trolleyTabellenProben(k, a, anlage.ok ? await recht(true) : anlage)",
    ersetzen: "    await trolleyTabellenProben(k, a, anlage)",
  },
  {
    id: "probe-trolley-71-wieder-weg",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Kam (71) doch an, trägt die Function den Termin wieder aus — direkt löschen darf ihn niemand.",
    suchen: "      loeschen: () => mitglied.funktion('trolley', { aktion: 'austragen', id: a.direkt.id }),\n",
    ersetzen: "",
  },
  {
    id: "probe-trolley-74-wieder-weg",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Kam (74) durch, wird der Termin wieder ausgetragen.",
    suchen: "    zurueck: () => mitglied.funktion('trolley', austragen(a.ohneRecht.id)),\n",
    ersetzen: "",
  },
  {
    id: "probe-trolley-raeumt-trolleys",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Nach dem Lauf sind die Trolleys der Probe fort, ihre Termine per Kaskade mit.",
    suchen: "      ['die Trolleys samt ihren Terminen', () => planer.rest(`trolleys?id=like.${marke}*`, 'DELETE', undefined, 'return=minimal')],",
    ersetzen: "",
  },
  {
    id: "probe-trolley-recht-wie-vorher",
    datei: "scripts/mitgliedsrechte-probe.mjs",
    regel: "Nach dem Lauf hat das Mitglied das Trolley-Recht wie vorher.",
    suchen: "      ['das Trolley-Recht des Mitglieds', () => planer.rest(`persons?id=eq.${mitglied.pid}`, 'PATCH', { priv: privVorher }, 'return=minimal')],",
    ersetzen: "",
  },
  // ── Repo-Review, Runde 1 (14.10.2026) ─────────────────────────────────────
  {
    id: "woche-schreiben-wurf-zweiter-versuch",
    datei: "supabase/functions/_shared/woche-schreiben.ts",
    regel: "Auch ein Netzfehler, der wirft, bekommt beim Schreiben einer Woche den zweiten Versuch.",
    suchen: "    } catch (err) {\n      console.error('wocheSchreiben:', err instanceof Error ? err.message : String(err))\n      return null\n    }",
    ersetzen: "    } catch (err) {\n      throw err\n    }",
  },
  {
    id: "einspringen-stand-der-woche",
    datei: "supabase/functions/substitute/index.ts",
    regel: "Einspringen schreibt die Woche nur auf dem gelesenen Stand — was der Admin dazwischen ändert, bleibt stehen.",
    suchen: "    const stand = weekRows[0]?.updated_at\n",
    ersetzen: "    const stand = (await rest.get<{ updated_at: string }[]>(`weeks?select=updated_at&congregation_id=eq.${wert(cong)}&start=eq.${wert(parts.woche)}`))[0]?.updated_at\n",
  },
  {
    id: "erinnerung-zusagen-je-woche",
    datei: "supabase/functions/send-reminders/index.ts",
    regel: "Der Erinnerungslauf liest die Zusagen nur der Wochen im Fenster, je Woche ihr Präfix — nicht die ganze Tabelle.",
    suchen: "        'task_key,status',\n        praefixe,\n",
    ersetzen: "        'task_key,status',\n        [''],\n",
  },
  {
    id: "import-jahreswechsel",
    datei: "supabase/functions/import-week/wochen-slug.ts",
    regel: "Die Woche über den Jahreswechsel („28-Dezember-2026-3-Januar-2027“) wird erkannt, nicht übersprungen.",
    suchen: "  for (const form of FORMEN) {",
    ersetzen: "  for (const form of FORMEN.slice(1)) {",
  },
  {
    id: "spanne-jahreswechsel-wirft-nicht",
    datei: "supabase/functions/_shared/i18n/translate.ts",
    regel: "Wirft formatRange bei einer Spanne über den Jahreswechsel, bleibt sie deutsch stehen, statt die Seite zu reißen.",
    suchen: "  try {\n    return spanneOhneNull(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }), a, b)\n  } catch {\n    return null\n  }",
    ersetzen: "  return spanneOhneNull(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }), a, b)",
  },
  {
    id: "fs-woche-mit-stand",
    datei: "src/lib/data.ts",
    regel: "Eine Woche — Zusammenkünfte wie Treffpunkte — wird nur auf dem Stand geschrieben, auf dem sie beruht; nichts eines anderen wird still zurückgenommen.",
    suchen: "            .eq('start', woche)\n            .eq('updated_at', stand)\n",
    ersetzen: "            .eq('start', woche)\n",
  },
  {
    id: "fs-woche-stand-geladen",
    datei: "src/lib/data.ts",
    regel: "Den Stand jeder geladenen Treffpunkt-Woche merkt sich der Ladevorgang — sonst legte der erste Schreibvorgang neu an.",
    suchen: "  fsWochen.setzen(fsZeilen.flatMap(",
    ersetzen: "  fsWochen.setzen([] || fsZeilen.flatMap(",
  },
  {
    id: "jahresspanne-intl",
    datei: "supabase/functions/_shared/i18n/translate.ts",
    regel: "Der Wochenkopf über den Jahreswechsel (mit Jahreszahlen) wird in den Intl-Sprachen übersetzt.",
    suchen: "    jahresSpannenRegel(locale),\n",
    ersetzen: "",
  },
  {
    id: "jahresspanne-woerterbuch",
    datei: "supabase/functions/_shared/i18n/translate.ts",
    regel: "Der Wochenkopf über den Jahreswechsel wird auch in den Wörterbuch-Sprachen (en/es/fr) übersetzt.",
    suchen: "    jahresSpannenRegel(LOCALES[code] ?? code),\n",
    ersetzen: "",
  },
  {
    id: "zurueck-verlaesst-feld",
    datei: "src/components/useBackDismiss.ts",
    regel: "Die Zurück-Taste verlässt erst das aktive Feld, dann schließt sie die Ebene — seine Eingabe geht nicht verloren.",
    suchen: "        feldVerlassen()\n",
    ersetzen: "",
  },
  {
    id: "wischen-verlaesst-feld",
    datei: "src/components/useSwipeWeek.ts",
    regel: "Vor dem Blättern per Wischen wird ein Feld im Streifen verlassen — seine Eingabe übernimmt noch die alte Woche.",
    suchen: "      if (aktiv instanceof HTMLElement && el.contains(aktiv)) aktiv.blur()\n",
    ersetzen: "",
  },
  {
    id: "einstellungen-nur-geaendertes",
    datei: "src/app/persist.ts",
    regel: "Die Einstellungen der Versammlung schreiben nur, was die Aktion geändert hat — kein älterer Stand überschreibt fremde Änderungen.",
    suchen: "  if (Object.keys(aenderung).length > 0) saveSettings(congId, aenderung)",
    ersetzen: "  saveSettings(congId, { reminders: next.reminders, congLang: next.congLang, progLangs: next.progLangs, auxClass: next.auxClass })",
  },
  {
    id: "stammdaten-nur-geaendertes",
    datei: "src/app/persist.ts",
    regel: "Die Stammdaten der Versammlung schreiben nur die geänderten Felder, gesammelt über die Tastenanschläge.",
    suchen: "      const info = geaenderteFelder(prev.congregation, next.congregation)\n",
    ersetzen: "      const info = next.congregation\n",
  },
  {
    id: "varianten-ueber-montag",
    datei: "src/app/reducer.ts",
    regel: "Nachgeladene Sprachvarianten finden ihre Woche über den Montag; gibt es sie nicht mehr, ändert sich nichts.",
    suchen: "      if (!action.start || !state.weeks.some((w) => w.start === action.start)) return state\n",
    ersetzen: "",
  },
  {
    id: "alle-seiten-holt-weiter",
    datei: "src/lib/data.ts",
    regel: "Wachsende Tabellen kommen über die Zeilengrenze von PostgREST hinweg vollständig an — Seite für Seite.",
    suchen: "  if (groesse === 0 || groesse >= gesamt) return { data: zeilen, error: null }\n",
    ersetzen: "  return { data: zeilen, error: null }\n",
  },
  {
    id: "seiten-gleichzeitig",
    datei: "src/lib/data.ts",
    regel: "Die weiteren Seiten einer wachsenden Tabelle gehen gleichzeitig hinaus, nicht eine nach der anderen (Review App #5).",
    suchen: "  const weitere = await Promise.all(anfaenge.map((von) => seite(von, Math.min(von + SEITE, hoechstens) - 1)))\n",
    ersetzen: "  const weitere = []\n  for (const von of anfaenge) weitere.push(await seite(von, Math.min(von + SEITE, hoechstens) - 1))\n",
  },
  {
    id: "seiten-nach-der-ersten",
    datei: "src/lib/data.ts",
    regel: "Wie groß eine Seite ist, sagt die erste — liefert der Server weniger als erbeten, beginnt die nächste trotzdem lückenlos dahinter.",
    suchen: "  for (let von = groesse; von < gesamt; von += groesse) anfaenge.push(von)\n",
    ersetzen: "  for (let von = SEITE; von < gesamt; von += SEITE) anfaenge.push(von)\n",
  },
  {
    id: "ladefenster-ein-jahr",
    datei: "src/lib/data.ts",
    regel: "Die App lädt die Wochen ab dem Montag vor einem Jahr — so weit, wie die Datenbank sie aufbewahrt (T125).",
    suchen: "    .from('weeks')\n    .select('start, data, updated_at')\n    .eq('congregation_id', congregationId)\n    .gte('start', verteilungAb)\n",
    ersetzen: "    .from('weeks')\n    .select('start, data, updated_at')\n    .eq('congregation_id', congregationId)\n",
  },
  {
    id: "abwesenheiten-ein-jahr",
    datei: "src/lib/data.ts",
    regel: "Abwesenheiten lädt die App bis ein Jahr nach ihrem Ende, nicht weiter zurück — so weit rechnet die Auswertung mit ihnen (T125, T126).",
    suchen: "        .gte('to_date', verteilungAb)\n",
    ersetzen: "",
  },
  {
    id: "aufraeumen-jede-tabelle",
    datei: "supabase/schema.sql",
    regel: "Jede Tabelle mit Zeitbezug hat eine Regel im Aufräumen — keine sammelt still weiter (T125).",
    suchen: "        ('absences', 'to_date < $1', ein_jahr),\n",
    ersetzen: "",
  },
  {
    id: "aufraeumen-absagen-ein-jahr",
    datei: "supabase/schema.sql",
    regel: "Absagen bleiben ein Jahr wie ihre Wochen — die Auswertung zählt sie über das Jahr (T126).",
    suchen: "        ('absagen', 'woche < $1', ein_jahr),\n",
    ersetzen: "        ('absagen', 'woche < $1', acht_wochen),\n",
  },
  {
    id: "aufraeumen-abwesenheit-grund",
    datei: "supabase/schema.sql",
    regel: "Der Grund einer Abwesenheit geht nach acht Wochen, auch wenn ihr Zeitraum ein Jahr bleibt (17.10.2026).",
    suchen: "    update public.absences set reason = '' where to_date < acht_wochen and reason <> '';\n",
    ersetzen: "    update public.absences set reason = '' where to_date < ein_jahr and reason <> '';\n",
  },
  {
    id: "absage-zurueckgenommen",
    datei: "supabase/schema.sql",
    regel: "Nimmt jemand seine Absage zurück („doch bestätigen“), zählt sie nicht mehr (T126).",
    suchen: "  elsif tg_op = 'UPDATE' and old.status = 'verhindert' then\n",
    ersetzen: "  elsif false then\n",
  },
  {
    id: "absagen-nur-lesen",
    datei: "supabase/schema.sql",
    regel: "Absagen liest nur, wer zuteilt — schreiben darf kein Konto, nur der Trigger an den Zusagen (T126).",
    suchen: "create policy absagen_select on public.absagen\n  for select using",
    ersetzen: "create policy absagen_select on public.absagen\n  for all using",
  },
  {
    id: "absagen-ladefenster",
    datei: "src/lib/data.ts",
    regel: "Absagen lädt die App ein Jahr zurück wie ihre Wochen, nicht weiter (T126).",
    suchen: "        .from('absagen')\n        .select('person_id, task_key', { count: 'exact' })\n        .eq('congregation_id', congregationId)\n        .gte('woche', verteilungAb)\n",
    ersetzen: "        .from('absagen')\n        .select('person_id, task_key', { count: 'exact' })\n        .eq('congregation_id', congregationId)\n",
  },
  {
    id: "aufraeumen-ein-jahr",
    datei: "supabase/schema.sql",
    regel: "Die Datenbank behält die Wochen ein Jahr — so lange, wie die App sie lädt und die Verteilung sie braucht (T125).",
    suchen: "  ein_jahr constant timestamptz := (montag - 7 * 52)::timestamptz;\n",
    ersetzen: "  ein_jahr constant timestamptz := (montag - 7 * 26)::timestamptz;\n",
  },
  {
    id: "aufraeumen-nur-der-zeitplan",
    datei: "supabase/schema.sql",
    regel: "Aufräumen darf nur der Zeitplan — kein angemeldetes Konto über die REST-Schnittstelle (T125).",
    suchen: "revoke all on function public.alte_daten_loeschen(boolean) from anon, authenticated;\n",
    ersetzen: "grant execute on function public.alte_daten_loeschen(boolean) to authenticated;\n",
  },
  {
    id: "aufraeumen-anmelde-protokoll",
    datei: "supabase/schema.sql",
    regel: "Auch das Anmelde-Protokoll von Supabase (E-Mail und IP-Adresse je Anmeldung) geht nach acht Wochen (T125).",
    suchen: "        ('auth.audit_log_entries', 'created_at < $1', acht_wochen),\n",
    ersetzen: "",
  },
  {
    id: "aufraeumen-sitzungen",
    datei: "supabase/schema.sql",
    regel: "Die Anmeldung eines Geräts geht nach einem Jahr ohne Nutzung — gezählt ab der letzten Erneuerung; ab der Anmeldung gezählt, flögen auch täglich genutzte Geräte hinaus (19.10.2026).",
    suchen: "        ('auth.sessions', 'updated_at < $1', ein_jahr)\n",
    ersetzen: "        ('auth.sessions', 'created_at < $1', ein_jahr)\n",
  },
  {
    id: "aufraeumen-name-mit-schema",
    datei: "supabase/schema.sql",
    regel: "Der Aufräumlauf nimmt den Tabellennamen samt Schema — ein vorgesetztes public. bräche an auth.audit_log_entries ab (T125).",
    suchen: "        execute format('delete from %s where %s', regel.name::regclass, regel.bedingung) using regel.grenze;\n",
    ersetzen: "        execute format('delete from public.%I where %s', regel.name, regel.bedingung) using regel.grenze;\n",
  },
  {
    id: "auswertung-laufende-woche",
    datei: "src/data/auswertung.ts",
    regel: "Die laufende Woche gehört nicht in die Auswertung: Was noch kommt, ist geplant, nicht gehalten (T126).",
    suchen: "    if (w.start < von || w.start >= bis) return\n",
    ersetzen: "    if (w.start < von || w.start > bis) return\n",
  },
  {
    id: "auswertung-ausgefallen",
    datei: "src/data/auswertung.ts",
    regel: "Eine ausgefallene Zusammenkunft zählt in der Auswertung weder als Zusammenkunft noch mit ihren Plätzen (T126).",
    suchen: "      if (istAusgefallen(week, tab)) continue\n      stattgefunden = true\n",
    ersetzen: "      stattgefunden = true\n",
  },
  {
    id: "auswertung-vorsitz-folgt",
    datei: "src/data/auswertung.ts",
    regel: "Was dem Vorsitz folgt (das Anfangsgebet des Vorsitzenden), kam mit dem Vorsitz und zählt nicht ein zweites Mal (T126).",
    suchen: "      if (!pid || !bekannt.has(pid) || (folgt && pid === vorsitz.pid)) continue\n",
    ersetzen: "      if (!pid || !bekannt.has(pid)) continue\n",
  },
  {
    id: "auswertung-fester-leiter",
    datei: "src/data/auswertung.ts",
    regel: "Der feste Leiter des Wachtturm-Studiums zählt nicht — seine Rolle ist keine Zuteilung (T126).",
    suchen: "  return !(festerLeiter && platz.art === 'programm' && istArt(platz.section, 'wtStudium') && platz.slot.rolle === 'Leiter')\n",
    ersetzen: "  return true\n",
  },
  {
    id: "auswertung-oeffentlicher-vortrag",
    datei: "src/data/auswertung.ts",
    regel: "Der öffentliche Vortrag zählt nicht, auch nicht beim eigenen Redner — er trägt `vortrag` wie der Vortrag unter „Schätze“ (Betreiber 17.10.2026).",
    suchen: "  if (isSpeakerRole(platz.slot.rolle)) return false\n",
    ersetzen: "",
  },
  {
    id: "auswertung-abwesend-nicht-erwartet",
    datei: "src/data/auswertung.ts",
    regel: "Wer abwesend war, von dem wird für diese Zeit nichts erwartet — die Erwartung zählt nur die Zusammenkünfte, in denen er da war (T126).",
    suchen: "        if (istAbwesend(abwesend, p.id, wi, tab)) continue\n",
    ersetzen: "",
  },
  // Jahresprobe vom 18.10.2026: Erwartet wird Platz für Platz — von wem in der
  // Zusammenkunft da, schon dabei und nicht auf einem festen Platz war.
  {
    id: "auswertung-fester-platz-sperrt",
    datei: "src/data/auswertung.ts",
    regel: "Wer das Wachtturm-Studium fest leitet, von dem werden am Wochenende kein Vorsitz und kein Lesen erwartet — er wartete sonst „lange“ auf den Vorsitz (Jahresprobe 18.10.2026).",
    suchen: "        if (fest.has(p.id)) continue\n",
    ersetzen: "",
  },
  {
    id: "auswertung-dabei-seit",
    datei: "src/data/auswertung.ts",
    regel: "Von einem Zugezogenen wird erst ab seiner ersten Einteilung etwas erwartet — sonst steht er unter „zu selten“ (Jahresprobe 18.10.2026).",
    suchen: "        if (ab !== undefined && week.start < ab) continue\n",
    ersetzen: "",
  },
  {
    id: "auswertung-dabei-seit-nur-vergangenes",
    datei: "src/data/auswertung.ts",
    regel: "„Dabei seit“ zählt nur vergangene Wochen — wer erst geplant ist, steht unter „geplant“, statt rückwirkend aus der Rechnung zu fallen (18.10.2026).",
    suchen: "    if (!pid || !bekannt.has(pid) || montag >= bis) return\n",
    ersetzen: "    if (!pid || !bekannt.has(pid)) return\n",
  },
  {
    id: "auswertung-ohne-bereich-nicht-zu-oft",
    datei: "src/data/auswertung.ts",
    regel: "Einteilungen in einem Bereich, den die Person nicht hat, zählen nicht als „zu oft“ — sie stehen unter „Ohne Bereich eingeteilt“ (Jahresprobe 18.10.2026).",
    suchen: "      if (!e.bereich || !isQualified(p, e.bereich) || !gehoertZumVergleich(e.bereich, vergleich)) continue\n",
    ersetzen: "      if (!e.bereich || !gehoertZumVergleich(e.bereich, vergleich)) continue\n",
  },
  {
    id: "pflege-ohne-bereich-ab-zweimal",
    datei: "src/data/auswertung.ts",
    regel: "„Ohne Bereich eingeteilt“ meldet einen Bereich erst ab zwei Einteilungen im Jahr — einmal ist Aushilfe (18.10.2026).",
    suchen: "      .filter(([bereich, n]) => n >= OHNE_BEREICH_AB && !isQualified(p, bereich))\n",
    ersetzen: "      .filter(([bereich]) => !isQualified(p, bereich))\n",
  },
  {
    id: "pflege-nie-genutzt-mit-erwartung",
    datei: "src/data/auswertung.ts",
    regel: "„Bereich im Jahr ungenutzt“ nur, wo auf die Person mindestens drei Plätze gekommen wären — wer erst kurz dabei ist, fällt nicht auf (18.10.2026).",
    suchen: "      .filter((b) => !zahl.get(p.id)?.get(b) && erwartetVon(g, b, p.id) >= NIE_GENUTZT_AB)\n",
    ersetzen: "      .filter((b) => !zahl.get(p.id)?.get(b))\n",
  },
  {
    id: "einseitig-gegen-erwartung",
    datei: "src/data/auswertung.ts",
    regel: "„Vor allem X“ nur, wenn der Anteil deutlich über dem erwarteten liegt — Mikrofone überwiegen sonst zwangsläufig (Jahresprobe 18.10.2026).",
    suchen: "    const ueberwiegt = erster && gesamt >= EINSEITIG_AB && anteil >= UEBERWIEGT_AB && anteil >= OBERE_GRENZE * sollAnteil ? erster.bereich : null\n",
    ersetzen: "    const ueberwiegt = erster && gesamt >= EINSEITIG_AB && anteil >= UEBERWIEGT_AB ? erster.bereich : null\n",
  },
  {
    id: "einseitig-nie-nicht-doppelt",
    datei: "src/data/auswertung.ts",
    regel: "Ein Bereich, der schon „Bereich im Jahr ungenutzt“ meldet, steht nicht zusätzlich unter „einseitig: nie“ (18.10.2026).",
    suchen: "      .filter((b) => b.n === 0 && b.schnittAndere >= NIE_AB_SCHNITT && b.erwartet >= 1 && !gemeldet.includes(b.bereich))\n",
    ersetzen: "      .filter((b) => b.n === 0 && b.schnittAndere >= NIE_AB_SCHNITT && b.erwartet >= 1)\n",
  },
  {
    id: "einseitig-nie-erst-mit-erwartung",
    datei: "src/data/auswertung.ts",
    regel: "„Nie dran“ heißt es erst, wo auf die Person wenigstens ein Platz gekommen wäre — sonst stand der Zugezogene als einseitig da (18.10.2026).",
    suchen: "      .filter((b) => b.n === 0 && b.schnittAndere >= NIE_AB_SCHNITT && b.erwartet >= 1 && !gemeldet.includes(b.bereich))\n",
    ersetzen: "      .filter((b) => b.n === 0 && b.schnittAndere >= NIE_AB_SCHNITT && !gemeldet.includes(b.bereich))\n",
  },
  {
    id: "engpass-personen-durch-plaetze",
    datei: "src/data/auswertung.ts",
    regel: "Der übliche Abstand ist der des Bereichs: die Personen mit ihm geteilt durch seine Plätze je Woche (Jahresprobe 18.10.2026).",
    suchen: "    abstand: personen > 0 ? personen / jeWoche : null,\n",
    ersetzen: "    abstand: personen > 0 ? 1 / jeWoche : null,\n",
  },
  {
    id: 'mitteilungen-nachladen-nach-loeschen',
    datei: 'src/mitteilungen/useMitteilungenNachladen.ts',
    regel: 'Kommt die Abfrage beim Öffnen erst nach „Alle löschen" an, bringt sie die alte Liste nicht zurück (T140, Review 24.10.2026).',
    suchen: '      if (bekannt.size > 0 && store?.holen().notifs.length === 0) return\n',
    ersetzen: '',
  },
  {
    id: 'schlussgebet-zu-klaeren',
    datei: 'src/data/planning.ts',
    regel: '„Zu klären" beim Planen listet das leere Schlussgebet am Wochenende nicht als offen — wie der Kopf (T133, Review 24.10.2026).',
    suchen: '    if (platz.slot?.name || leerVorOrt(meeting, platz)) continue\n',
    ersetzen: '    if (platz.slot?.name) continue\n',
  },
  {
    id: 'mitteilungen-alle-loeschen-schreibt',
    datei: 'src/app/persist.ts',
    regel: '„Alle löschen" löscht die Mitteilungen auch in der Datenbank — sonst kämen sie beim nächsten Laden wieder (T140).',
    suchen: '      deleteNotifications(congId, userId)\n',
    ersetzen: '',
  },
  {
    id: 'mitteilungen-loeschen-nur-eigene',
    datei: 'src/lib/data.ts',
    regel: '„Alle löschen" nennt im Aufruf die eigenen Mitteilungen, nicht nur die der Versammlung (T140).',
    suchen: "      .delete()\n      .eq('congregation_id', congregationId)\n      .eq('user_id', userId),\n",
    ersetzen: "      .delete()\n      .eq('congregation_id', congregationId),\n",
  },
  {
    id: 'mitteilungen-loeschen-zwei-tipps',
    datei: 'src/mitteilungen/MitteilungenScreen.tsx',
    regel: '„Alle löschen" fragt nach — gelöscht wird erst beim zweiten Tipp (T140, wie jedes Löschen seit 4.10.2026).',
    suchen: "<EntfernenKnopf className=\"knopf-umriss knopf-entfernen\" text={t.alleLoeschen} onEntfernen={() => dispatch({ type: 'clearNotifs' })} />",
    ersetzen: "<button type=\"button\" className=\"knopf-umriss knopf-entfernen\" onClick={() => dispatch({ type: 'clearNotifs' })}>{t.alleLoeschen}</button>",
  },
  {
    id: 'mitteilungen-loeschen-offline-gesperrt',
    datei: 'src/app/readonly.ts',
    regel: 'Offline lässt sich nicht „Alle löschen" — die Mitteilungen verschwänden und kämen beim nächsten Laden wieder (T140).',
    suchen: "  'setNotifs',\n",
    ersetzen: "  'setNotifs',\n  'clearNotifs',\n",
  },
  {
    id: 'engpass-knapp-gerundet',
    datei: 'src/data/auswertung.ts',
    regel: 'Knapp ist ein Bereich gerundet wie der Abstand daneben — „Abstand: 4 Wochen" steht nicht unter den knappen (T139).',
    suchen: '  return e.abstand === null || Math.round(e.abstand) < KNAPP_UNTER\n',
    ersetzen: '  return e.abstand === null || e.abstand < KNAPP_UNTER\n',
  },
  {
    id: 'engpass-niemand-ist-knapp',
    datei: 'src/data/auswertung.ts',
    regel: 'Ein Bereich, den niemand hat, ist knapp (T139).',
    suchen: '  return e.abstand === null || Math.round(e.abstand) < KNAPP_UNTER\n',
    ersetzen: '  return e.abstand !== null && Math.round(e.abstand) < KNAPP_UNTER\n',
  },
  {
    id: 'engpass-oben-nur-knappe',
    datei: 'src/auswertung/EngpaesseAnsicht.tsx',
    regel: 'Oben stehen nur die knappen Bereiche — nicht einer, in dem jeder alle vierzehn Wochen dran ist (T139).',
    suchen: '  const knappe = liste.filter(istKnapp)\n',
    ersetzen: '  const knappe = liste\n',
  },
  {
    id: 'engpass-kachel-zaehlt-knappe',
    datei: 'src/auswertung/AuswertungScreen.tsx',
    regel: 'Die Kachel „Engpässe" zählt die knappen Bereiche, nicht alle (T139).',
    suchen: 'zahl: fill(t.awKnappeZahl, { n: k.zahl(a.engpaesse.filter(istKnapp).length) })',
    ersetzen: 'zahl: fill(t.awKnappeZahl, { n: k.zahl(a.engpaesse.length) })',
  },
  {
    id: "engpass-wochen-ab-erstem-platz",
    datei: "src/data/auswertung.ts",
    regel: "Plätze je Woche zählen ab der ersten Woche des Bereichs — Hilfsdienste kennt die App oft erst später als das Programm (18.10.2026).",
    suchen: "  const ab = erste ?? g.fenster.von\n",
    ersetzen: "  const ab = g.fenster.von\n",
  },
  {
    id: "wartezeiten-ueber-das-jahr",
    datei: "src/data/auswertung.ts",
    regel: "Wartezeiten, Engpässe und die Pflege der Bereiche rechnen über das ganze Jahr, gleich welcher Zeitraum gewählt ist (Jahresprobe 18.10.2026).",
    suchen: "  const jahr = eingabe.zeitraum === JAHR ? g : grundlage({ ...eingabe, fenster: zeitfenster(eingabe.weeks, ZEITRAUM_WOCHEN[JAHR], eingabe.heute) })\n",
    ersetzen: "  const jahr = g\n",
  },
  {
    id: "wartet-nur-wo-der-bereich-plaetze-hat",
    datei: "src/data/auswertung.ts",
    regel: "Zur Wartezeit zählt eine Woche nur, wenn die Person in einer Zusammenkunft mit Plätzen des Bereichs eingeteilt werden konnte (18.10.2026).",
    suchen: "    return menge !== undefined && tabListe.some((tab) => menge.has(`${montag}|${tab}`))\n",
    ersetzen: "    return menge !== undefined && (menge.has(`${montag}|mid`) || menge.has(`${montag}|we`))\n",
  },
  {
    id: "wartet-nicht-wer-ueber-erwartung",
    datei: "src/data/auswertung.ts",
    regel: "Wer übers Jahr insgesamt über seiner Erwartung liegt, wartet nicht — die vielbeschäftigten Ältesten „warteten“ auf ein Gebet (Jahresprobe 18.10.2026).",
    suchen: "      const lange = ueblich !== null && geplant === null && !ueber && wartend > LANGE_AB * ueblich\n",
    ersetzen: "      const lange = ueblich !== null && geplant === null && wartend > LANGE_AB * ueblich\n",
  },
  {
    id: "wartet-je-bereich-meiste-zuerst",
    datei: "src/data/auswertung.ts",
    regel: "„Lange Wartezeit“ steht je Bereich, der mit den meisten Wartenden zuerst (Jahresprobe 18.10.2026).",
    suchen: "  wartet.sort((a, b) => b.pids.length - a.pids.length || faktor(b) - faktor(a) || a.bereich.localeCompare(b.bereich))\n",
    ersetzen: "  wartet.sort((a, b) => faktor(b) - faktor(a) || a.bereich.localeCompare(b.bereich))\n",
  },
  {
    id: "treffpunkte-nur-gruppen-mit-treffpunkt",
    datei: "src/data/auswertung.ts",
    regel: "Eine Gruppe ohne eigene Treffpunkte im Zeitraum steht nicht da — sonst listete jede ihre Leiter mit „nie“ (Jahresprobe 18.10.2026).",
    suchen: "    if (id !== null && mitTreffpunkt.has(id)) {\n",
    ersetzen: "    if (id !== null) {\n",
  },
  {
    id: "ballungen-nur-mit-hilfsdienst",
    datei: "src/data/auswertung.ts",
    regel: "Zweimal in einer Zusammenkunft zählt nur mit einem Hilfsdienst — zwei Programmpunkte sind meist ein gewolltes Paar (Jahresprobe 18.10.2026).",
    suchen: "    .filter((liste) => liste.length >= 2 && liste.some((e) => e.hilfsdienst))\n",
    ersetzen: "    .filter((liste) => liste.length >= 2)\n",
  },
  {
    id: "hinweis-wartezeit-stellt-bereich-ein",
    datei: "src/auswertung/AuswertungScreen.tsx",
    regel: "Ein Hinweis „Lange Wartezeit“ stellt die Wartezeiten auf seinen Bereich (18.10.2026).",
    suchen: "        if (bereich !== undefined) setWarteBereich(bereich)\n",
    ersetzen: "",
  },
  {
    id: "matrix-ohne-bereich-umrandet",
    datei: "src/auswertung/EinseitigAnsicht.tsx",
    regel: "Wer ohne den Bereich eingeteilt war, steht in der Tabelle umrandet mit seiner Zahl — nicht als Strich (18.10.2026).",
    suchen: "      <span className=\"aw-zelle is-ohne-bereich\" aria-hidden=\"true\">\n",
    ersetzen: "      <span className=\"aw-zelle is-ohne\" aria-hidden=\"true\">\n",
  },
  {
    id: "person-ohne-bereich-ohne-erwartung",
    datei: "src/auswertung/PersonAnsicht.tsx",
    regel: "Ein Bereich, in dem die Person ohne ihn eingeteilt war, steht ohne Erwartung und ohne Vergleichsbalken da (18.10.2026).",
    suchen: "            if (!b.hat) {\n",
    ersetzen: "            if (b.hat && !b.hat) {\n",
  },
  {
    id: "auswertung-ganz-abwesend-nicht-nie",
    datei: "src/data/auswertung.ts",
    regel: "Wer den ganzen Zeitraum fehlte, steht nicht unter „nie dran“ und nicht in der Last — von ihm wird nichts erwartet (Review 17.10.2026).",
    suchen: "  const mitBereich = persons.filter((p) => je.has(p.id) || (warDa(g, p) && bereicheVon(g, p).length > 0))\n",
    ersetzen: "  const mitBereich = persons.filter((p) => je.has(p.id) || bereicheVon(g, p).length > 0)\n",
  },
  {
    id: "auswertung-ganz-abwesend-nicht-einseitig",
    datei: "src/data/auswertung.ts",
    regel: "Wer den ganzen Zeitraum fehlte, war in keinem Bereich „nie dran“ — einseitig ist er nicht (Review 17.10.2026).",
    suchen: "    if (eigene.length < 2 || !warDa(g, p)) continue\n",
    ersetzen: "    if (eigene.length < 2) continue\n",
  },
  {
    id: "wartet-ohne-abwesende-wochen",
    datei: "src/data/auswertung.ts",
    regel: "Zur Wartezeit zählen nur Wochen, in denen die Person eingeteilt werden konnte (Betreiber 17.10.2026, Jahresprobe 18.10.2026).",
    suchen: "      const wartend = wochen - nichtEinteilbar\n",
    ersetzen: "      const wartend = wochen\n",
  },
  {
    id: "wartet-nicht-wer-geplant-ist",
    datei: "src/data/auswertung.ts",
    regel: "Wer im Bereich schon für diese oder eine kommende Woche eingeteilt ist, wartet nicht (Betreiber 17.10.2026).",
    suchen: "      const lange = ueblich !== null && geplant === null && !ueber && wartend > LANGE_AB * ueblich\n",
    ersetzen: "      const lange = ueblich !== null && !ueber && wartend > LANGE_AB * ueblich\n",
  },
  {
    id: "wartet-geplant-steht-hinten",
    datei: "src/data/auswertung.ts",
    regel: "Wer schon geplant ist, steht in „Wartet am längsten“ hinten — er wartet nicht (17.10.2026).",
    suchen: "        Number(a.geplant !== null) - Number(b.geplant !== null) ||\n",
    ersetzen: "",
  },
  {
    id: "wartet-geplant-nur-was-stattfindet",
    datei: "src/data/auswertung.ts",
    regel: "Geplant ist nur, was nach derselben Regel zählt — eine ausgefallene Zusammenkunft plant niemanden ein (17.10.2026).",
    suchen: "    for (const tab of MEETING_TABS) if (!istAusgefallen(week, tab)) zaehlen(week, wi, tab, geplant)\n",
    ersetzen: "    for (const tab of MEETING_TABS) zaehlen(week, wi, tab, geplant)\n",
  },
  {
    id: "wartet-hinweis-nach-wartezeit",
    datei: "src/data/auswertung.ts",
    regel: "„Lange Wartezeit“ nennt zuerst, wer am längsten wartet — nach der Wartezeit, wie sie zählt (17.10.2026, Jahresprobe 18.10.2026).",
    suchen: "    const lange = w.warten.filter((z) => z.lange).sort((a, b) => b.wartend - a.wartend || a.pid.localeCompare(b.pid))\n",
    ersetzen: "    const lange = w.warten.filter((z) => z.lange).sort((a, b) => a.pid.localeCompare(b.pid))\n",
  },
  // „warte-balken-rot-nur-wer-lange-wartet" ist am 24.10.2026 gegangen (T138): Den
  // Balken gibt es nicht mehr. Dieselbe Regel bewacht jetzt die Marke „wartet lange".
  {
    id: 'wartezeit-marke-nur-wer-lange-wartet',
    datei: 'src/auswertung/WartezeitenAnsicht.tsx',
    regel: '„wartet lange" steht nur, wer wirklich lange wartet — wer schon geplant ist, nicht (17.10.2026; seit T138 als Marke statt Rot im Balken).',
    suchen: '                    {z.lange && <Marke art="problem" text={t.awWartetLange} />}\n',
    ersetzen: '                    {z.wartend > 2 * (w.ueblich ?? 0) && <Marke art="problem" text={t.awWartetLange} />}\n',
  },
  {
    id: 'wartezeit-zeile-nennt-ueblich',
    datei: 'src/auswertung/WartezeitenAnsicht.tsx',
    regel: 'Jede Zeile der Wartezeiten nennt den üblichen Abstand: „seit 14 Wochen · üblich: 6 Wochen" (T138).',
    suchen: '                ueblich,\n',
    ersetzen: '',
  },
  {
    id: 'marke-gegen-gerundete-erwartung',
    datei: 'src/auswertung/Diagramme.tsx',
    regel: '„6 mehr" zählt gegen die gerundete Erwartung, die daneben steht — nicht „5,6 mehr" (T138).',
    suchen: '  const abstand = k.zahl(Math.abs(n - gerundet(erwartet)))\n',
    ersetzen: '  const abstand = k.zahl(Math.abs(n - erwartet))\n',
  },
  {
    id: 'verteilung-zeile-zaehlt-mit-hilfsdiensten',
    datei: 'src/auswertung/VerteilungAnsicht.tsx',
    regel: 'Im Vergleich mit den Hilfsdiensten heißt die Zahl der Zeile „Mit Hilfsdiensten", nicht „Aufgaben" (T138).',
    suchen: '                      fill(t[TEXT_DES_VERGLEICHS[vergleich]], { n: k.zahl(z.n), e: k.zahl(gerundet(z.erwartet)) }),\n',
    ersetzen: '                      fill(t.awTextAufgaben, { n: k.zahl(z.n), e: k.zahl(gerundet(z.erwartet)) }),\n',
  },
  {
    id: 'person-bereich-marke-nach-lage',
    datei: 'src/auswertung/PersonAnsicht.tsx',
    regel: 'Bei der Person sagt jeder eigene Bereich, wie er steht — „mehr" und „weniger", nicht überall „passt" (T138).',
    suchen: 'lage={lageVon(b.n, b.erwartet)}',
    ersetzen: 'lage="rahmen"',
  },
  // „last-zehn-oben-erst-ab-elf" ist am 18.10.2026 gegangen: Die Karte „Wie sich
  // die Last verteilt" ist mit der Jahresprobe fort (sie zeigte Struktur, keinen
  // Befund), an ihrer Stelle stehen die Engpässe.
  // „legende-farbe-hilfsdienst-woche" ist am 24.10.2026 gegangen: Die Felder einer
  // Person und ihre Muster teilen sich seit dem Kalender je eine Regel, auseinander
  // laufen können sie nicht mehr. „legende-farbe-hilfsdienst-balken", die an ihre
  // Stelle trat, ging am selben Tag mit dem Balken „Mit Hilfsdiensten" (T138).
  {
    id: "wochen-person-beides",
    datei: "src/data/auswertung.ts",
    regel: "Aufgabe und Hilfsdienst in derselben Zusammenkunft sind „beides“ — die Aufgabe verdeckt den Hilfsdienst nicht (Kalender, 24.10.2026).",
    suchen: "  if (aufgabe && hilfsdienst) return 'beides'\n",
    ersetzen: "",
  },
  {
    id: "wochen-person-je-zusammenkunft",
    datei: "src/data/auswertung.ts",
    regel: "Je Zusammenkunft ein Feld: Der Hilfsdienst am Wochenende steht in seinem Feld, nicht in dem unter der Woche (Kalender, 24.10.2026).",
    suchen: "      const hier = einteilungen.filter((e) => e.wi === wi && e.tab === tab)\n",
    ersetzen: "      const hier = einteilungen.filter((e) => e.wi === wi)\n",
  },
  {
    id: "wochen-person-ausgefallen",
    datei: "src/data/auswertung.ts",
    regel: "Eine Zusammenkunft, die ausfiel, sagt es — leer sähe ein Kongress aus wie eine Woche ohne Aufgabe (Kalender, 24.10.2026).",
    suchen: "        felder[tab] = 'ausgefallen'\n",
    ersetzen: "",
  },
  {
    id: "wochen-person-absage-am-platz",
    datei: "src/data/auswertung.ts",
    regel: "Eine Absage steht im Feld ihrer Zusammenkunft — ein abgesagter Treffpunkt nur neben dem Monat (Kalender, 24.10.2026).",
    suchen: "      const abgesagt = absagen.filter((a) => a.wi === wi && a.tab === tab)\n",
    ersetzen: "      const abgesagt = absagen.filter((a) => a.wi === wi)\n",
  },
  {
    id: "wochen-person-geplant-bis",
    datei: "src/data/auswertung.ts",
    regel: "Was ansteht, reicht bis zur letzten Woche, in der die Person eingeteilt oder abwesend ist — dahinter nichts (Kalender, 24.10.2026).",
    suchen: "    if (geplant.some((e) => e.wi === wi) || geleitet(wi).length > 0 || MEETING_TABS.some((tab) => weg(week, wi, tab))) kommendBis = kommend.length\n",
    ersetzen: "    kommendBis = kommend.length\n",
  },
  {
    id: "wochen-person-nach-dem-tag",
    datei: "src/data/auswertung.ts",
    regel: "In der laufenden Woche steht eine Zusammenkunft nach ihrem Tag aus, nicht nach der Woche — am Donnerstag ist der Dienstag gehalten (Betreiber 24.10.2026).",
    suchen: "  const steht = (kommendeWoche: boolean, week: Week, versatz: number): boolean => kommendeWoche && tagNach(week.start, versatz) >= g.fenster.heute\n",
    ersetzen: "  const steht = (kommendeWoche: boolean, week: Week, versatz: number): boolean => kommendeWoche && tagNach(week.start, versatz) >= g.fenster.bis\n",
  },
  {
    id: "wochen-person-verlegter-tag",
    datei: "src/data/auswertung.ts",
    regel: "Eine verlegte Zusammenkunft steht nach ihrem verlegten Tag aus, nicht nach dem Rhythmus der Versammlung (Betreiber 24.10.2026).",
    suchen: "      offen[tab] = steht(kommendeWoche, week, meetingOffset(week, tab, zeiten))\n",
    ersetzen: "      offen[tab] = steht(kommendeWoche, week, versatzAbMontag(zeiten[tab].wd))\n",
  },
  {
    id: "wochen-person-treffpunkte-geleitet",
    datei: "src/data/auswertung.ts",
    regel: "Geleitete Treffpunkte stehen beim Monat — sonst stand eine Absage allein da (Betreiber 24.10.2026: „Geleitete dazu“).",
    suchen: "    for (const inst of geleitet(wi)) eintraege.push({ art: 'aufgabe', bereich: TREFFPUNKT_BEREICH, geplant: steht(kommendeWoche, week, versatzAbMontag(inst.wd)) })\n",
    ersetzen: "",
  },
  {
    id: "wochen-person-treffpunkt-freitext",
    datei: "src/data/auswertung.ts",
    regel: "Einen Treffpunkt mit Freitext-Leiter leitet niemand der Versammlung — auch wenn er zufällig eine Id trägt (wie `treffpunkte`, 24.10.2026).",
    suchen: "  const geleitet = (wi: number): FsInstance[] => (fsWeeks[wi] ?? []).filter((inst) => inst.lpid === pid && !inst.lext)\n",
    ersetzen: "  const geleitet = (wi: number): FsInstance[] => (fsWeeks[wi] ?? []).filter((inst) => inst.lpid === pid)\n",
  },
  {
    id: "wochen-person-treffpunkte-weitergereicht",
    datei: "src/auswertung/AuswertungScreen.tsx",
    regel: "Die Auswertung reicht der Person die Treffpunkte weiter — ohne sie stünde kein geleiteter beim Monat (24.10.2026).",
    suchen: "fsWeeks={fsWeeks} zeiten={state.congregation.times}",
    ersetzen: "fsWeeks={[]} zeiten={state.congregation.times}",
  },
  {
    id: "wochen-person-ueberschrift-ansteht",
    datei: "src/auswertung/PersonAnsicht.tsx",
    regel: "Steht etwas an, sagt es die Überschrift: „… und was ansteht“ (Betreiber 24.10.2026: „Ergänzen“).",
    suchen: "          {fill(stehtAn(bild.wochen) ? t.awLetzteUndKommend : t.awLetzte, { dauer: k.dauer(k.a.grundlage.fenster.wochen.length) })}\n",
    ersetzen: "          {fill(t.awLetzte, { dauer: k.dauer(k.a.grundlage.fenster.wochen.length) })}\n",
  },
  {
    id: "wochen-person-nach-datum",
    datei: "src/auswertung/PersonAnsicht.tsx",
    regel: "Die Monate stehen nach dem Datum, nicht nach der Folge in `weeks` — sonst stünde ein Jahr zweimal da (Review 24.10.2026).",
    suchen: "  for (const w of [...wochen].sort((a, b) => a.start.localeCompare(b.start))) {\n",
    ersetzen: "  for (const w of wochen) {\n",
  },
  {
    id: "wochen-person-neueste-oben",
    datei: "src/auswertung/PersonAnsicht.tsx",
    regel: "Der neueste Monat steht oben (Kalender, 24.10.2026).",
    suchen: "  for (const [erster, hier] of [...monate].reverse()) {\n",
    ersetzen: "  for (const [erster, hier] of [...monate]) {\n",
  },
  {
    id: "wochen-person-absage-rot",
    datei: "src/auswertung/Diagramme.tsx",
    regel: "Eine Absage steht neben dem Monat in der Problemfarbe (Kalender, 24.10.2026).",
    suchen: "                        <span className={e.absage ? 'is-absage' : undefined}>{e.text}</span>\n",
    ersetzen: "                        <span>{e.text}</span>\n",
  },
  // „legende-farbe-nie-im-wartebalken" ist am 24.10.2026 mit dem Wartebalken
  // gegangen (T138): „nie im Jahr" steht jetzt als Wort in der Zeile.
  {
    id: "matrix-legende-ziffern-der-sprache",
    datei: "src/auswertung/EinseitigAnsicht.tsx",
    regel: "Die Grenzen in der Legende der Tabelle stehen in den Ziffern der Sprache — auf Persisch nicht „1–3“ neben „۱۲“ (Review 17.10.2026).",
    suchen: "          ['stufe1', `${k.zahl(1)}–${k.zahl(STUFE2_AB - 1)}`],\n",
    ersetzen: "          ['stufe1', '1–3'],\n",
  },
  {
    id: "auswertung-mindestabstand",
    datei: "src/data/auswertung.ts",
    regel: "Zu oft heißt mehr als die Hälfte darüber und mindestens drei daneben — sonst fiele jede kleine Zahl auf (T126).",
    suchen: "  if (n > OBERE_GRENZE * erwartet && n - erwartet >= MINDESTABSTAND) return 'oft'\n",
    ersetzen: "  if (n > OBERE_GRENZE * erwartet) return 'oft'\n",
  },
  {
    id: "auswertung-nur-planer",
    datei: "src/data/rechte.ts",
    regel: "Die Auswertung sehen nur Admin und Planer, nicht der Gruppenaufseher (Betreiber 16.10.2026, T126).",
    suchen: "  auswertung: 'planer',\n",
    ersetzen: "  auswertung: 'gruppe',\n",
  },
  {
    id: "auswertung-gruppe-uebersetzt",
    datei: "src/auswertung/AuswertungScreen.tsx",
    regel: "Gruppennamen gehen in der Auswertung durch die Übersetzung — roh stünde „Gruppe 1“ in jeder Sprache deutsch (T126).",
    suchen: "      gruppe: (id) => (id === null ? t.versammlungLbl : gruppenName(id, groups, tu)),\n",
    ersetzen: "      gruppe: (id) => (id === null ? t.versammlungLbl : (groups.find((g) => g.id === id)?.name ?? '')),\n",
  },
  {
    id: "absagen-leerer-platz",
    datei: "src/data/auswertung.ts",
    regel: "Eine Absage zählt in ihrem Bereich, auch wenn ihr Platz seitdem leer steht — der Planer hat den Absagenden nur ausgetragen (T126).",
    suchen: "      platzJeSchluessel.set(key, { bereich, vorsitz: folgt ? vorsitz : null })\n      if (!platzMitZusage(platz)) continue\n",
    ersetzen: "      if (!platzMitZusage(platz)) continue\n      platzJeSchluessel.set(key, { bereich, vorsitz: folgt ? vorsitz : null })\n",
  },
  {
    id: "absagen-nur-wo-der-platz-zaehlt",
    datei: "src/data/auswertung.ts",
    regel: "Eine Absage zählt nur auf einem Platz, der als Zuteilung zählt — nicht auf dem öffentlichen Vortrag, nicht beim festen Leiter (Review 17.10.2026).",
    suchen: "    if (platz === null) continue\n",
    ersetzen: "",
  },
  {
    id: "absagen-vorsitz-hat-ihn-noch",
    datei: "src/data/auswertung.ts",
    regel: "Was dem Vorsitz folgt, sagt der Vorsitzende mit dem Vorsitz ab — hat er ihn noch, zählt die Absage des Gebets nicht eigens (Review 17.10.2026).",
    suchen: "    if (vorsitz && (vorsitz.pid === a.personId || (vorsitz.key !== null && abgesagt.has(`${a.personId}|${vorsitz.key}`)))) continue\n",
    ersetzen: "    if (vorsitz && vorsitz.key !== null && abgesagt.has(`${a.personId}|${vorsitz.key}`)) continue\n",
  },
  {
    id: "absagen-vorsitz-mit-abgesagt",
    datei: "src/data/auswertung.ts",
    regel: "Hat der Vorsitzende Vorsitz und Gebet abgesagt und sitzt dort ein anderer, zählt nur die Absage des Vorsitzes (Review 17.10.2026).",
    suchen: "    if (vorsitz && (vorsitz.pid === a.personId || (vorsitz.key !== null && abgesagt.has(`${a.personId}|${vorsitz.key}`)))) continue\n",
    ersetzen: "    if (vorsitz && vorsitz.pid === a.personId) continue\n",
  },
  {
    id: "absagen-person-der-versammlung",
    datei: "src/data/auswertung.ts",
    regel: "Gezählt werden die Absagen der Personen, die es noch gibt — wie die Zuteilungen (T126).",
    suchen: "    if (!bekannt.has(a.personId)) continue\n",
    ersetzen: "",
  },
  {
    id: "absagen-ausgefallen",
    datei: "src/data/auswertung.ts",
    regel: "Eine Absage in einer ausgefallenen Zusammenkunft zählt nicht — die Zusammenkunft zählt ja auch nicht (T126).",
    suchen: "    if (!week || istAusgefallen(week, teile.tab)) continue\n",
    ersetzen: "    if (!week) continue\n",
  },
  {
    id: "absagen-treffpunkt-geleitet",
    datei: "src/data/auswertung.ts",
    regel: "Abgesagte Treffpunkte zählen gegen die geleiteten Treffpunkte, nicht gegen die Plätze der Zusammenkünfte (T126).",
    suchen: "      const von = bereich === TREFFPUNKT_BEREICH ? treffpunktPlaetze : (g.plaetze.get(bereich) ?? 0)\n",
    ersetzen: "      const von = g.plaetze.get(bereich) ?? 0\n",
  },
  {
    id: "viele-absagen-doppelt",
    datei: "src/data/auswertung.ts",
    regel: "Viele Absagen heißt doppelt so viel Anteil wie jeder andere Bereich — etwas mehr fällt nicht auf (T126).",
    suchen: "    return zeile.anteil >= VIELE_ABSAGEN_FAKTOR * sonst ? [{ zeile, sonst }] : []\n",
    ersetzen: "    return zeile.anteil >= sonst ? [{ zeile, sonst }] : []\n",
  },
  {
    id: "viele-absagen-mindestens-drei",
    datei: "src/data/auswertung.ts",
    regel: "Viele Absagen heißt auch: mindestens drei — eine oder zwei fallen nicht auf (T126).",
    suchen: "    if (zeile.n < MINDESTABSTAND) return []\n",
    ersetzen: "",
  },
  {
    id: "absagen-hinweis-zum-bereich",
    datei: "src/auswertung/Hinweise.tsx",
    regel: "Der Hinweis „Viele Absagen“ führt zu den Absagen, nicht zu einer Person (T126).",
    suchen: "  if (h.art === 'absagen') k.ansichtOeffnen('weiteres')\n",
    ersetzen: "  if (h.art === 'absagen') k.personOeffnen('')\n",
  },
  {
    id: "absagen-breit-rollen",
    datei: "src/auswertung/AuswertungScreen.tsx",
    regel: "Ab dem Tablet steht die Unteransicht schon auf der Seite — der Hinweis rollt dorthin, statt die Seite zu wechseln (T126).",
    suchen: "        if (breit) document.getElementById(ANKER[ziel])?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })\n        else setAnsicht(ziel)\n",
    ersetzen: "        setAnsicht(ziel)\n",
  },
  {
    id: "absagen-auffaellig-markiert",
    datei: "src/auswertung/WeiteresAnsicht.tsx",
    regel: "Ein Bereich mit auffällig vielen Absagen steht in der Problemfarbe, wie sein Hinweis (T126).",
    suchen: "              <MiniBalken n={z.n} max={max} auffaellig={auffaellig.has(z.bereich)} />\n",
    ersetzen: "              <MiniBalken n={z.n} max={max} />\n",
  },
  {
    id: "absagen-der-person",
    datei: "src/data/auswertung.ts",
    regel: "Die Person zählt nur ihre eigenen Absagen (T126) — und zeigt nur sie in ihren Wochen (Kalender, 24.10.2026).",
    suchen: "  const absagen = g.absagen.filter((a) => a.pid === pid)\n",
    ersetzen: "  const absagen = g.absagen\n",
  },
  {
    id: "absagen-kachel-wie-liste",
    datei: "src/auswertung/AuswertungScreen.tsx",
    regel: "Die Kachel zählt die Absagen wie die Liste, nur die mit Bereich — eine ohne steht nur bei der Person (Betreiber 18.10.2026).",
    suchen: "        fill(t.awAbsagenZahl, { n: k.zahl(a.absagen.reduce((s, z) => s + z.n, 0)) }),\n",
    ersetzen: "        fill(t.awAbsagenZahl, { n: k.zahl(a.grundlage.absagen.length) }),\n",
  },
  {
    id: "ansicht-nur-admin",
    datei: "src/data/ansicht.ts",
    regel: "Die Ansicht einer anderen Stufe gilt nur für ein echtes Admin-Konto — ein Planer kann sich damit keine Rechte geben und keine nehmen (T124).",
    // Seit dem 17.10.2026 an einer Stelle (`aktiveAnsicht`) für Rechte, Stufe und Leiste.
    suchen: "  return s.planner && s.ansicht ? s.ansicht : null\n",
    ersetzen: "  return s.ansicht ?? null\n",
  },
  {
    id: "ansicht-stufe-selbst",
    datei: "src/data/rechte.ts",
    regel: "In der Ansicht heißt die Stufe, wie die Ansicht sie nennt — der Admin ist nicht Aufseher der gespielten Gruppe und hieße sonst „Gehilfe“ (T124).",
    suchen: "  if (ansicht) return ansicht.stufe\n",
    ersetzen: "",
  },
  {
    id: "ansicht-abwesenheit-ueber-rechte",
    datei: "src/data/rechte.ts",
    regel: "Wer Abwesenheiten anderer bearbeitet, fragt rechteVon — sonst böte die Ansicht als Verkündiger sie weiter an (T124).",
    suchen: "  return rechteVon(s).admin || personId === s.personId\n",
    ersetzen: "  return s.planner || personId === s.personId\n",
  },
  {
    id: "ansicht-wache-echtes-recht",
    datei: "src/app/reducer.ts",
    regel: "Umschalten darf nur ein echtes Admin-Konto — die Wache fragt das echte Recht (T124).",
    suchen: "      if (!state.planner) return state\n      const nachher = { ...state, ansicht: action.ansicht }\n",
    ersetzen: "      const nachher = { ...state, ansicht: action.ansicht }\n",
  },
  {
    id: "ansicht-bildschirm-faellt-weg",
    datei: "src/app/reducer.ts",
    regel: "Fällt der Bildschirm unter der Ansicht weg, geht es zum Start (T124).",
    suchen: "      return bleibt ? nachher : reducer(nachher, { type: 'navigate', screen: 'start' })\n",
    ersetzen: "      return nachher\n",
  },
  {
    id: "ansicht-karte-bleibt",
    datei: "src/profil/AnsichtKarte.tsx",
    regel: "Die Karte zum Umschalten steht auch in der Ansicht als Verkündiger — sonst gäbe es kein Zurück (T124).",
    suchen: "  if (!state.planner) return null\n",
    ersetzen: "  if (!state.planner || state.ansicht) return null\n",
  },
  {
    id: "auswertung-montage-reihenfolge",
    datei: "src/data/auswertung.ts",
    regel: "Die Montage des Zeitfensters stehen in der Reihenfolge seiner Wochen, die älteste zuerst — nach ihnen werden die Wochenfelder beschriftet (Review 17.10.2026).",
    suchen: "    montage.push(w.start)\n",
    ersetzen: "    montage.unshift(w.start)\n",
  },
  {
    id: "bereichsname-unbekannt-heisst-nach-schluessel",
    datei: "src/personen/priv-label.ts",
    regel: "Ein Bereich, den die App nicht kennt (Altbestand), heißt nach seinem Schlüssel — nicht leer (17.10.2026).",
    suchen: "  return teile.every(Boolean) ? teile : [key]\n",
    ersetzen: "  return teile\n",
  },
  {
    id: "bereichsname-dienst-ein-baustein",
    datei: "src/personen/priv-label.ts",
    regel: "Ein Hilfsdienst ist ein Baustein, auch wenn sein Name „ · “ enthält — die Tabelle setzt ihn nicht auf zwei Zeilen (17.10.2026).",
    suchen: "  if (svc) return [tu(svc.name)]\n",
    ersetzen: "  if (svc) return tu(svc.name).split(' · ')\n",
  },
  {
    id: "matrix-kopf-zusammenkunft-kurz",
    datei: "src/personen/priv-label.ts",
    regel: "Im Kopf der Tabelle Person × Bereich steht die Zusammenkunft kurz — die längste Zeile bestimmt, wie hoch der Kopf steht (17.10.2026).",
    suchen: "  if (key === 'vorsitzMid') return [t.privVorsitz, kurz ? t.unterDerWoche : t.tabMid]\n",
    ersetzen: "  if (key === 'vorsitzMid') return [t.privVorsitz, t.tabMid]\n",
  },
  // „push-ziel-auswertung" ist am 17.10.2026 gegangen: `deeplink.ts` zählt die
  // Bildschirme nicht mehr selbst auf, sondern nimmt `ANSTEUERBARE_SCREENS` aus
  // `rechte.ts` — vollständig durch `satisfies` an `ZUGANG`, also vom Übersetzer
  // bewacht.
  {
    id: "ansicht-nur-eigene-gruppe",
    datei: "src/data/ansicht.ts",
    regel: "Als Gruppenaufseher spielt der Admin nur seine eigene Gruppe — eine fremde wirkte nur beim Planen (Betreiber 17.10.2026).",
    suchen: "  return eigene && groups.some((g) => g.id === eigene) ? eigene : null\n",
    ersetzen: "  return eigene && groups.some((g) => g.id === eigene) ? eigene : (groups[0]?.id ?? null)\n",
  },
  {
    id: "ansicht-ohne-gruppe-kein-aufseher",
    datei: "src/profil/AnsichtKarte.tsx",
    regel: "Ohne eigene Gruppe bietet die Karte den Gruppenaufseher nicht an (17.10.2026).",
    suchen: "  const stufen = ANSICHT_STUFEN.filter((s) => s !== 'gruppenaufseher' || eigeneGruppe !== null)\n",
    ersetzen: "  const stufen = ANSICHT_STUFEN\n",
  },
  {
    id: "abwesenheiten-alt-nur-wer-zuteilt",
    datei: "supabase/schema.sql",
    regel: "Abwesenheiten, die länger als acht Wochen vorbei sind, lesen nur Admin und Planer — und jeder seine eigenen (Betreiber 17.10.2026).",
    suchen: "      to_date >= date_trunc('week', current_date)::date - 7 * 8\n",
    ersetzen: "      true\n",
  },
  {
    id: "datumswaehler-in-marke",
    datei: "src/components/DatePicker.tsx",
    regel: "Ein Klick in den offenen Kalender (Monatstitel, Wochentage, Fugen) klappt ihn nicht zu, auch wenn er in einer Marke steht.",
    suchen: ' onClick={(e) => e.preventDefault()}>',
    ersetzen: '>',
  },
  {
    id: "wochenpfeil-fokus-bleibt",
    datei: "src/components/WeekNav.tsx",
    regel: "Am Rand gesperrte Wochenpfeile behalten den Fokus — aria-disabled statt disabled.",
    suchen: '      <GesperrterKnopf className="rund-knopf week-arrow" label={t.a11yPrevWeek} gesperrt={!canPrev} onTipp={onPrev}>\n        <Zeichen name="zurueck" />\n      </GesperrterKnopf>',
    ersetzen: '      <button type="button" className="rund-knopf week-arrow" aria-label={t.a11yPrevWeek} disabled={!canPrev} onClick={onPrev}>\n        <Zeichen name="zurueck" />\n      </button>',
  },
  {
    id: "neuladen-verwirft-wartendes",
    datei: "src/app/persist.ts",
    regel: "Ein Neuladen verwirft, was gebündelt wartete — es beruht auf dem ersetzten Stand und schriebe still über das Geladene.",
    suchen: "  if (action.type === 'hydrate') wartendesVerwerfen()\n",
    ersetzen: "",
  },
  {
    id: 'woche-sofort-ueberholt-buendel',
    datei: 'src/app/persist.ts',
    regel: 'Eine sofort geschriebene Woche nimmt ihre wartende Fassung mit — die ältere geht nicht hinterher und nimmt die neue zurück.',
    suchen: '  weekSaves.sofort(week.start, { congId, week })\n',
    ersetzen: '  saveWeek(congId, week)\n',
  },
  {
    id: "treffpunkte-sofort-ueberholt-buendel",
    datei: "src/app/persist.ts",
    regel: "Eine sofort geschriebene Treffpunkt-Woche nimmt ihre wartende Fassung mit — ein eben getippter Ort nimmt den Leiter nicht zurück.",
    suchen: "    else fsWeekSaves.sofort(week.start, { congId, insts: fsWeek })\n",
    ersetzen: "    else saveFsWeek(congId, week.start, fsWeek)\n",
  },
  {
    id: "treffpunkt-ort-gebuendelt",
    datei: "src/app/persist.ts",
    regel: "Zeit und Ort eines Treffpunkts gehen gebündelt hinaus — einmal mit dem letzten Stand, nicht je Buchstabe.",
    suchen: "const FS_GEBUENDELT: readonly AppAction['type'][] = [\n  'fsInstUpdate',\n",
    ersetzen: "const FS_GEBUENDELT: readonly AppAction['type'][] = [\n",
  },
  {
    id: "app-verlassen-schreibt",
    datei: "src/app/store.tsx",
    regel: "Geht die App in den Hintergrund, geht hinaus, was gebündelt wartet — am Handy hält das System den Zeitgeber an.",
    suchen: "      if (document.visibilityState === 'hidden') ausstehendesSchreiben()\n",
    ersetzen: "",
  },
  {
    id: "ladung-wartendes-geht-nicht-los",
    datei: "src/lib/data.ts",
    regel: "Eine Woche — Zusammenkünfte wie Treffpunkte —, die vor einem Neuladen in ihrer Kette wartete, geht danach nicht mit dem frischen Stand los.",
    suchen: "    if (geladen !== ladung) {\n      konfliktMelder?.()\n      return false\n    }\n    const stand = staende.get(woche)\n",
    ersetzen: "    const stand = staende.get(woche)\n",
  },
  {
    id: "ladung-spaete-antwort",
    datei: "src/lib/data.ts",
    regel: "Eine Antwort, die erst nach einem Neuladen kommt, ersetzt den geladenen Stand nicht.",
    suchen: "  if (geladen === ladung) staende.set(woche, stand)\n",
    ersetzen: "  staende.set(woche, stand)\n",
  },
  {
    id: "zeitwahl-krumme-zeit",
    datei: "src/planen/ZeitWahl.tsx",
    regel: "Eine krumme Treffpunkt-Zeit steht so da, wie sie gilt — nicht als erste Zeit der Liste.",
    suchen: "      {zeitenZurWahl(FS_TIME_OPTIONS, value).map((tm) => (",
    ersetzen: "      {FS_TIME_OPTIONS.map((tm) => (",
  },
  {
    id: "senden-wartet-auf-woche",
    datei: "src/planen/wochen-versand.ts",
    regel: '„Plan senden" geht erst los, wenn die eben geänderte Woche geschrieben ist — die Function liest sie aus der Datenbank.',
    suchen: "    await wocheDraussen(kennung)\n",
    ersetzen: "",
  },
  {
    id: "woche-geschrieben-wartet",
    datei: "src/lib/data.ts",
    regel: "`wocheGeschrieben` wartet auf die Ketten der Woche — Zusammenkünfte und Treffpunkte.",
    suchen: "  await Promise.all([wochen.kette.get(woche), fsWochen.kette.get(woche)])\n",
    ersetzen: "  await Promise.all([])\n",
  },
  {
    id: "einspringen-stand-uebernehmen",
    datei: "src/lib/data.ts",
    regel: "Nach dem Einspringen kennt die App den Stand, den die Function geschrieben hat — die nächste Änderung meldet keinen falschen Konflikt.",
    suchen: "      standDerFunctionUebernehmen(data, geladen)\n      return\n    }\n    console.error('[substitute/take]'",
    ersetzen: "      return\n    }\n    console.error('[substitute/take]'",
  },
  {
    id: "freier-platz-stand-uebernehmen",
    datei: "src/lib/data.ts",
    regel: "Nach dem Übernehmen eines freien Platzes kennt die App den Stand, den die Function geschrieben hat.",
    suchen: "      standDerFunctionUebernehmen(data, geladen)\n      return\n    }\n    console.error('[substitute/fill]'",
    ersetzen: "      return\n    }\n    console.error('[substitute/fill]'",
  },
  {
    id: "fremder-stand-bleibt",
    datei: "src/lib/data.ts",
    regel: "Den Stand der Function übernimmt die App nur, wenn er auf ihrem eigenen aufbaut — sonst überschriebe sie, was ein anderer dazwischen schrieb.",
    suchen: "  if (wochen.staende.get(woche) !== vorher) return\n",
    ersetzen: "",
  },
  {
    id: "einspringen-meldet-stand",
    datei: "supabase/functions/substitute/index.ts",
    regel: "Die Übernahme meldet den Stand vorher und nachher zurück.",
    suchen: "    return json({ ok: true, taken: true, woche: parts.woche, vorher: stand, stand: neuerStand })",
    ersetzen: "    return json({ ok: true, taken: true })",
  },
  {
    id: "person-sofort-ueberholt-buendel",
    datei: "src/app/persist.ts",
    regel: "Eine sofort geschriebene Person nimmt ihre wartende Fassung mit — die ältere geht nicht hinterher.",
    suchen: "  personSaves.sofort(person.id, { congId, person })\n",
    ersetzen: "  savePerson(congId, person)\n",
  },
  {
    id: "haushalt-raeumt-wartendes-ab",
    datei: "src/app/persist.ts",
    regel: "Wer einem Haushalt beitritt, verliert ihn nicht an eine wartende ältere Fassung seiner Person.",
    suchen: "        for (const p of geaendert) personSaves.cancel(p.id)\n",
    ersetzen: "",
  },
  {
    id: "trolley-entfernt-raeumt-buendel",
    datei: "src/app/persist.ts",
    regel: "Ein entfernter Trolley fällt aus dem wartenden Bündel — das Schreiben legte ihn sonst wieder an.",
    suchen: "    case 'trolleyEntfernt':\n",
    ersetzen: "",
  },
  {
    id: "variante-ohne-ende",
    datei: "src/data/localize.ts",
    regel: "Die Endzeit kommt aus der Versammlung, nicht aus der Sprachvariante — dort steht der feste Wert des Imports.",
    suchen: "  if (alt.date) target.date = alt.date\n",
    ersetzen: "  if (alt.date) target.date = alt.date\n  if (alt.end) target.end = alt.end\n",
  },
  {
    id: "treffpunkt-mitteilung-vorbei",
    datei: "src/data/planning.ts",
    regel: "Mitteilungen zu einem Treffpunkt verschwinden aus der Glocke, wenn seine Woche um ist.",
    suchen: "  const teile = schluesselTeile(key)\n  if (!teile) return false\n  if ('tab' in teile) {\n",
    ersetzen: "  const teile = schluesselTeile(key)\n  if (!teile || teile.art === 'fs') return false\n  if ('tab' in teile) {\n",
  },
  {
    id: "nachladen-schreibt-erst",
    datei: "src/app/hydrate.ts",
    regel: "Vor dem Nachladen geht hinaus, was gebündelt wartet — sonst verwürfe es das Laden.",
    suchen: "  ausstehendesSchreiben()\n  const still = ",
    ersetzen: "  const still = ",
  },
  {
    id: "trolley-termine-seitenweise",
    datei: "src/lib/data.ts",
    regel: "Die Trolley-Termine kommen über die Zeilengrenze von PostgREST hinweg vollständig an.",
    suchen: "    alleSeiten<TrolleyTerminRow>((von, bis) =>\n",
    ersetzen: "    ((seite) => seite(0, 999))((von, bis) =>\n",
  },
  /* ---- Logo in den Farben des Designs (T121, Phase 10a, 15.10.2026) ---- */
  {
    id: 'manifest-leiste-dunkel',
    datei: 'public/manifest.webmanifest',
    regel: 'Das Manifest färbt die Bedienleiste der installierten App in der Kachelfarbe — sonst weiße Knöpfe auf Weiß.',
    suchen: '  "theme_color": "#1c1e20",\n',
    ersetzen: '  "theme_color": "#ffffff",\n',
  },
  {
    id: 'manifest-startbild-kachel',
    datei: 'public/manifest.webmanifest',
    regel: 'Der Startbildschirm der installierten App trägt die Kachelfarbe — das randfüllende Icon geht darin auf.',
    suchen: '  "background_color": "#1c1e20",\n',
    ersetzen: '  "background_color": "#ffffff",\n',
  },
  {
    id: 'logo-datei-pult-minze',
    datei: 'public/logo.svg',
    regel: 'Das App-Icon trägt das Pult in Minze, wie die Darstellung.',
    suchen: '<circle cx="256" cy="157.5" r="30" fill="#86E0B8">',
    ersetzen: '<circle cx="256" cy="157.5" r="30" fill="#E7B04B">',
  },
  {
    id: 'logo-klein-datei-kachel',
    datei: 'public/logo-klein.svg',
    regel: 'Das Favicon trägt die Kachel in Graphit, wie die Karte der dunklen Darstellung.',
    suchen: '<rect width="512" height="512" rx="116" fill="#1C1E20">',
    ersetzen: '<rect width="512" height="512" rx="116" fill="#17302D">',
  },
  {
    id: 'logo-form-gross-wie-datei',
    datei: 'src/bausteine/logo-form.ts',
    regel: 'Die große Fassung in der App hat dieselben Plätze wie logo.svg.',
    suchen: '    [[171.33, 195.82], [224.43, 229.96], [287.57, 229.96], [340.67, 195.82]],\n',
    ersetzen: '    [[171.33, 195.82], [224.43, 229.96], [287.57, 229.96]],\n',
  },
  {
    id: 'logo-pult-nah-an-den-reihen',
    datei: 'src/bausteine/logo-form.ts',
    regel: 'Das Pult steht so nah an der ersten Reihe wie zwei Reihen beieinander (Variante D, 16.10.2026).',
    suchen: '  pult: { mitte: [256, 157.5], r: 34 },\n',
    ersetzen: '  pult: { mitte: [256, 140], r: 34 },\n',
  },
  {
    id: 'anmeldung-logo-gross',
    datei: 'src/login/LoginKopf.tsx',
    regel: 'Die Anmeldung zeigt das Logo groß, mit 4, 6 und 8 Plätzen.',
    suchen: '      <Logo gross breite={150} className="login-logo" />\n',
    ersetzen: '      <Logo breite={150} className="login-logo" />\n',
  },
  /* ---- Code in der Anmelde-Mail, Sprachen (T121, Phase 10b, 15.10.2026) ---- */
  {
    id: 'anmeldemail-code-eingesetzt',
    datei: 'supabase/functions/_shared/anmelde-mail.ts',
    regel: 'Die Anmelde-Mail setzt den Code ein — kein „{code}" bleibt stehen.',
    suchen: '    code: werte.code,\n',
    ersetzen: '',
  },
  {
    id: 'send-invite-mail-code',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'Die Mail des Admins trägt denselben Code wie der Zettel.',
    suchen: '        const mail = linkMail(lang, { person, versammlung: versammlungName, url, code, gueltigBis: neu.gueltigBis })\n',
    ersetzen: "        const mail = linkMail(lang, { person, versammlung: versammlungName, url, code: '', gueltigBis: neu.gueltigBis })\n",
  },
  // Gruß ohne Vornamen (24.10.2026): mit dem Nachnamen — und der muss mitgeholt werden.
  {
    id: 'anrede-ohne-vorname',
    datei: 'supabase/functions/_shared/anmelde-mail.ts',
    regel: 'Ohne Vornamen grüßt die Anmelde-Mail mit dem Nachnamen — nicht „Hallo ,".',
    suchen: '  return fn.trim() || ln.trim()\n',
    ersetzen: '  return fn.trim()\n',
  },
  {
    id: 'send-invite-nachname-geholt',
    datei: 'supabase/functions/send-invite/index.ts',
    regel: 'send-invite holt den Nachnamen mit — ohne ihn grüßte die Mail einer Person ohne Vornamen mit „Hallo ,".',
    suchen: 'persons?select=id,fn,ln,mail&congregation_id',
    ersetzen: 'persons?select=id,fn,mail&congregation_id',
  },
  {
    id: 'anmelden-nachname-geholt',
    datei: 'supabase/functions/anmelden/index.ts',
    regel: '„Link senden" auf der Anmeldeseite holt den Nachnamen mit — ohne ihn grüßte die Mail einer Person ohne Vornamen mit „Hallo ,".',
    suchen: 'persons?select=id,fn,ln,mail,congregation_id&mail=ilike',
    ersetzen: 'persons?select=id,fn,mail,congregation_id&mail=ilike',
  },
  {
    id: 'mailentwurf-code',
    datei: 'src/personen/link-mail.ts',
    regel: 'Die Mail aus dem eigenen Mail-Programm trägt den Code wie die des Servers.',
    suchen: 'code: link.code, gueltigBis',
    ersetzen: "code: '', gueltigBis",
  },
  {
    id: 'versammlungssprache-nicht-doppelt',
    datei: 'src/app/reducer.ts',
    regel: 'Wird eine weitere Programmsprache zur Sprache der Versammlung, ist sie keine weitere mehr.',
    suchen: '      const progLangs = state.progLangs.filter((c) => c !== action.code)\n',
    ersetzen: '      const progLangs = state.progLangs\n',
  },
  /* ---- „Alles Planen" (T121, Phase 10c, 15.10.2026) ---- */
  {
    id: 'grundplan-ganz-beim-planer',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Der Planer pflegt den Grundplan aller Gruppen — auch wenn er zugleich Gruppenaufseher ist.',
    suchen: '          <FsRulesPanel onlyGroup={treffpunktGruppe(rechte)} />',
    ersetzen: '          <FsRulesPanel onlyGroup={rechte.admin ? null : rechte.gruppe} />',
  },
  {
    id: 'treffpunkt-anlegen-wahl-beim-planer',
    datei: 'src/planen/FsPlan.tsx',
    regel: 'Der Planer wählt beim Anlegen, für wen ein Treffpunkt gilt — auch als Gruppenaufseher.',
    suchen: '  const anlegenIn = treffpunktGruppe(rechte)\n',
    ersetzen: '  const anlegenIn = rechte.admin ? null : rechte.gruppe\n',
  },
  {
    id: 'vorrat-import-beim-planer',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Reichen die Programme nicht, holt auch der Planer sie von der Karte aus.',
    // Die Karte sieht nur, wer zuteilt (`DashboardScreen`); eine zweite Frage
    // nach dem Admin nähme dem Planer „Holen".
    suchen: '        {stand.vorratKnapp && (\n',
    ersetzen: '        {stand.vorratKnapp && state.planner && (\n',
  },
  // ── Planung: alle Wochen und „Holen" (T121, Phase 10) ─────────────────────
  {
    id: 'holen-sprache-fehlt-als-schluessel',
    datei: 'src/lib/import.ts',
    regel: 'Fehlt die Woche in der Sprache der Versammlung, sagt die App es mit eigenem Satz in der Sprache des Lesers.',
    suchen: "  if (body?.code === 'sprache-fehlt') return 'sprache-fehlt'\n",
    ersetzen: '',
  },
  {
    id: 'holen-kein-serversatz',
    datei: 'src/lib/import.ts',
    regel: 'Kein Satz des Servers erscheint in der App — Unbekanntes wird zum allgemeinen Satz, die Meldung geht in die Konsole.',
    suchen: '  return unbekannt(body?.error ?? error.message)\n',
    ersetzen: '  return (body?.error ?? error.message) as ImportFehler\n',
  },
  {
    id: 'import-week-sprache-code',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Die Absage für eine fehlende Sprache trägt ihren Code — daran erkennt die App sie.',
    suchen: ", code: 'sprache-fehlt' }, 404)",
    ersetzen: ' }, 404)',
  },
  {
    id: 'holen-erst-im-blatt',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Holen" hängt die Woche nicht an — das Blatt zeigt sie erst, übernommen wird dort.',
    suchen: '    if (res.ok) return res.week\n',
    ersetzen: "    if (res.ok) {\n      dispatch({ type: 'addImportedWeek', week: res.week })\n      return res.week\n    }\n",
  },
  {
    id: 'uebernehmen-zuteilen-neue-woche',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Übernehmen und zuteilen" öffnet die neue Woche — sie kommt ans Ende —, nicht die gezeigte.',
    suchen: '    const wi = state.weeks.length\n',
    ersetzen: '    const wi = state.week\n',
  },
  {
    id: 'uebernehmen-doppelt-kein-sprung',
    datei: 'src/planen/useWochenImport.ts',
    regel: 'Kam dieselbe Woche noch einmal, wird weder gesprungen noch zugeteilt — es gibt keine neue.',
    suchen: '    if (!zuteilen || !neu) return\n',
    ersetzen: '    if (!zuteilen) return\n',
  },
  {
    id: 'holen-abgebrochen-verfaellt',
    datei: 'src/planen/ProgrammHolen.tsx',
    regel: 'Wird das Blatt geschlossen, während geholt wird, kommt es mit dem Ergebnis nicht von selbst zurück.',
    suchen: '      if (lauf.current === nr) setStand(',
    ersetzen: '      if (nr > 0) setStand(',
  },
  {
    id: 'holen-offline-kein-blatt',
    datei: 'src/planen/ProgrammHolen.tsx',
    regel: 'Offline öffnet „Holen" kein Blatt — es sagt nur, dass gerade nichts geht.',
    suchen: '    if (!holenMoeglich()) return\n',
    ersetzen: '    holenMoeglich()\n',
  },
  {
    id: 'wochen-ab-heute',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: 'Vergangene Wochen stehen nicht unter den Wochen — am Montag rückt die Liste weiter.',
    suchen: '    if (sonntag === null || sonntag < heuteMs) return\n',
    ersetzen: '    if (sonntag === null) return\n',
  },
  {
    id: 'wochen-lage-probleme-vorn',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: 'Probleme stehen vor offenen Plätzen — dieselbe Rangfolge wie die Chips der Planungs-Karte.',
    suchen: "  if (probleme > 0) return { art: 'probleme', n: probleme }\n",
    ersetzen: '',
  },
  {
    id: 'wochen-holen-nach-der-letzten',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: '„Holen" nennt die Woche nach der spätesten geladenen — wie `import-week` sie wählt.',
    suchen: '  return montagNach(holenNach(weeks, heute), 1)\n',
    ersetzen: '  return montagNach(holenNach(weeks, heute), 0)\n',
  },
  {
    id: 'wochen-spalte-behaelt-reiter',
    datei: 'src/planen/WochenUebersicht.tsx',
    regel: 'In der Spalte neben dem Plan wechselt ein Tipp nur die Woche — Zusammenkunft oder Treffpunkte bleiben.',
    suchen: '      woche: { wi: k.wi, tab: spalte ? state.tab : k.stand.tab },\n',
    ersetzen: '      woche: { wi: k.wi, tab: k.stand.tab },\n',
  },
  // ── Die schmale Wochenspalte (Betreiber, 16.10.2026) ──────────────────────
  {
    id: 'wochenspalte-spur-in-punkten',
    datei: 'src/planen/WochenUebersicht.tsx',
    regel: 'In der Wochenspalte steht die Spur in Punkten — ihre Namen brachen dort mitten im Wort.',
    suchen: "<Spur form={spalte ? 'punkte' : 'knapp'}",
    ersetzen: '<Spur form="knapp"',
  },
  {
    id: 'spur-punkte-namen-nur-vorgelesen',
    datei: 'src/bausteine/Spur.tsx',
    regel: 'In der Form „punkte" liest die Namen der Schritte nur der Screenreader — sichtbar ist allein die Unterschrift.',
    suchen: "<span className={punkte ? 'spur-name sr-only' : 'spur-name'}>",
    ersetzen: '<span className="spur-name">',
  },
  {
    id: 'spur-punkte-zahlen-nur-vorgelesen',
    datei: 'src/bausteine/Spur.tsx',
    regel: 'In der Form „punkte" liest auch die Zahlen der Schritte nur der Screenreader — die laufende steht in der Unterschrift.',
    suchen: "<span className={punkte ? 'spur-wert sr-only' : 'spur-wert'}>",
    ersetzen: '<span className="spur-wert">',
  },
  {
    id: 'spur-punkte-laufender-schritt',
    datei: 'src/bausteine/Spur.tsx',
    regel: 'Die Unterschrift der Spur in Punkten nennt den laufenden Schritt.',
    suchen: "  return schritte.find((s) => s.lage === 'jetzt') ?? schritte.findLast((s) => s.lage === 'voll') ?? schritte[0]\n",
    ersetzen: "  return schritte.findLast((s) => s.lage === 'voll') ?? schritte[0]\n",
  },
  {
    id: 'spur-punkte-kein-strich',
    datei: 'src/bausteine/Spur.tsx',
    regel: 'Den Strich für „noch keine Zahl" gibt es nur, wo man ihn sieht — vorgelesen hieße er „Minus".',
    suchen: "const wert = s.wert ?? (form === 'knapp' ? '–' : undefined)",
    ersetzen: "const wert = s.wert ?? (form !== 'gross' ? '–' : undefined)",
  },
  {
    id: 'spur-punkte-eigene-zeile',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Die Unterschrift der Spur in Punkten steht in eigener Zeile — ohne Mindestbreite fielen die Schritte auf null.',
    suchen: '.spur--punkte .spur-schritt {\n  min-width: 24px;\n}',
    ersetzen: '.spur--punkte .spur-schritt {\n  min-width: 0;\n}',
  },
  {
    id: 'wochenspalte-karte-bricht-um',
    datei: 'src/planen/planen.css',
    regel: 'In der Wochenspalte rückt die Lage unter die Unterzeile, wenn beide nicht nebeneinander passen.',
    suchen: '  flex-flow: row wrap;\n  align-items: baseline;\n  column-gap: 8px;\n',
    ersetzen: '  flex-flow: row nowrap;\n  align-items: baseline;\n  column-gap: 8px;\n',
  },
  {
    id: 'wochenwahl-bricht-um',
    datei: 'src/components/components.css',
    regel: 'Der Kopf von Plan und Programm bricht ab dem Tablet um, statt das Angebot neben der Woche abzuschneiden.',
    suchen: '  .wochenwahl {\n    display: flex;\n    flex-wrap: wrap;\n',
    ersetzen: '  .wochenwahl {\n    display: flex;\n',
  },
  {
    id: 'planen-leiste-rutscht-unter',
    datei: 'src/planen/planen.css',
    regel: 'Passen die Knöpfe der Leiste beim Planen nicht nebeneinander, rutscht der zweite darunter — feste Spalten schoben ein langes Wort aus dem Knopf.',
    suchen: '  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin: 10px 16px 14px;\n',
    ersetzen: '  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);\n  gap: 6px;\n  margin: 10px 16px 14px;\n',
  },
  {
    id: 'planen-leiste-wort-ganz',
    datei: 'src/planen/planen.css',
    regel: 'Ein Knopf der Leiste wird nie schmaler als sein längstes Wort — sonst merkt die Reihe nicht, dass sie umbrechen muss.',
    suchen: '  flex: 1 1 0;\n  min-height: 54px;\n',
    ersetzen: '  flex: 1 1 0;\n  min-width: 0;\n  min-height: 54px;\n',
  },
  {
    id: 'meldung-an-der-leiste',
    datei: 'src/planen/planen.css',
    regel: 'Die Meldung hängt an der Oberkante der Leiste — untereinander ist die Leiste doppelt so hoch und läge sonst unter ihr.',
    suchen: '    position-anchor: --planen-leiste;\n',
    ersetzen: '',
  },
  {
    id: 'wochen-spalte-nur-wer-zuteilt',
    datei: 'src/planen/PlanenScreen.tsx',
    regel: 'Die Wochen neben dem Plan bekommt nur, wer zuteilt — nicht der Gruppenaufseher.',
    suchen: '  const wochenSpalte = useMedia(WOCHEN_SPALTE_BREITE) && rechte.zuteilen\n',
    ersetzen: '  const wochenSpalte = useMedia(WOCHEN_SPALTE_BREITE)\n',
  },
  // `planung-menue-nach-breite` gestrichen (T144, 25.10.2026): „Planung" führt
  // immer zur Wahl; nach der Breite entscheidet erst „Zusammenkünfte" dort
  // (`planung-wahl-zu-den-wochen`).
  {
    id: 'leere-versammlung-beim-planer',
    datei: 'src/app/AppShell.tsx',
    regel: 'Die leere Versammlung steht auch dem Planer offen — er holt das erste Programm.',
    suchen: '  if (state.dataEmpty && !rechteVon(state).zuteilen) return <StatusView kind="empty" />\n',
    ersetzen: '  if (state.dataEmpty && !state.planner) return <StatusView kind="empty" />\n',
  },
  {
    id: 'schema-fs-weeks-trigger-planer',
    datei: 'supabase/schema.sql',
    regel: 'Der Trigger der Treffpunkt-Wochen lässt Admin und Planer alles ändern.',
    suchen: '  if auth.uid() is null or public.darf_zuteilen() then\n    return new;\n  end if;\n  if tg_op = \'UPDATE\' then\n    vorher := old.data;',
    ersetzen: '  if auth.uid() is null or public.is_planner() then\n    return new;\n  end if;\n  if tg_op = \'UPDATE\' then\n    vorher := old.data;',
  },
  {
    id: 'schema-fs-weeks-planer-loescht',
    datei: 'supabase/schema.sql',
    regel: 'Eine Treffpunkt-Woche ganz schreiben und löschen Admin und Planer.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\ndrop policy if exists fs_weeks_einfuegen',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\ndrop policy if exists fs_weeks_einfuegen',
  },
  {
    id: 'schema-gruppenbesuche-wer-plant',
    datei: 'supabase/schema.sql',
    regel: 'Gruppenbesuche planen Admin und Planer ganz.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\ndrop policy if exists gruppenbesuche_besucher on',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\ndrop policy if exists gruppenbesuche_besucher on',
  },
  {
    id: 'schema-plaene-wer-plant',
    datei: 'supabase/schema.sql',
    regel: 'Weitere Pläne legen Admin und Planer an und ändern sie.',
    suchen: '  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())\n  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());\n\ndrop policy if exists plan_eintraege_select',
    ersetzen: '  using (congregation_id = public.my_congregation_id() and public.is_planner())\n  with check (congregation_id = public.my_congregation_id() and public.is_planner());\n\ndrop policy if exists plan_eintraege_select',
  },
  {
    id: 'mrp-planer-holt-woche',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Mitgliedsrechte-Probe misst, dass der Planer eine Woche anlegt (40).',
    suchen: '  await neueWocheVersuch(k, neu)\n',
    ersetzen: '',
  },
  {
    id: 'mrp-verwaltung-beim-admin',
    datei: 'scripts/mitgliedsrechte-probe.mjs',
    regel: 'Die Mitgliedsrechte-Probe misst, dass Personen und Einstellungen beim Admin bleiben (80, 81).',
    suchen: '    await verwaltungProben(k, verwaltung)\n',
    ersetzen: '',
  },
  {
    id: 'ersatz-abwesenheiten-nur-am-tag',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Die Ersatzsuche liest nur die Abwesenheiten, die den Tag einschließen — alle der Versammlung kamen nicht über die Zeilengrenze von PostgREST.',
    suchen: "    `absences?select=person_id&congregation_id=eq.${wert(cong)}` +\n      `&from_date=lte.${wert(tagISO)}&to_date=gte.${wert(tagISO)}`,\n",
    ersetzen: "    `absences?select=person_id&congregation_id=eq.${wert(cong)}`,\n",
  },
  {
    id: 'ersatz-abwesenheit-umschliesst-tag',
    datei: 'supabase/functions/substitute/index.ts',
    regel: 'Eine Abwesenheit, die vor dem Tag beginnt und nach ihm endet, zählt.',
    suchen: '&from_date=lte.${wert(tagISO)}&to_date=gte.${wert(tagISO)}',
    ersetzen: '&from_date=eq.${wert(tagISO)}&to_date=gte.${wert(tagISO)}',
  },
  {
    id: 'holen-nie-vor-der-vorwoche',
    datei: 'src/data/holen.ts',
    regel: '„Holen" sucht nach einer Pause nicht Wochen zurück, sondern ab der laufenden Woche.',
    suchen: '  return letzte !== undefined && letzte > vorwoche ? letzte : vorwoche\n',
    ersetzen: '  return letzte ?? vorwoche\n',
  },
  {
    id: 'holen-ab-heute',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Holen" rechnet vom heutigen Tag aus — wie die Karte bei den Wochen.',
    suchen: 'importNextWeek(holenNach(state.weeks, fromIso(heute)), langCode, altCodes)',
    ersetzen: 'importNextWeek(holenNach(state.weeks, new Date(0)), langCode, altCodes)',
  },
  {
    id: 'holen-karte-wie-holen',
    datei: 'src/planen/wochen-uebersicht.ts',
    regel: 'Die Karte „Holen" nennt die Woche, die „Holen" auch holt — nach einer Pause die laufende.',
    suchen: '  return montagNach(holenNach(weeks, heute), 1)\n',
    ersetzen: '  return montagNach(holenNach(weeks, new Date(0)), 1)\n',
  },
  {
    id: 'holen-immer-mit-angabe',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Holen" sagt auch ohne geladene Woche, wonach gesucht wird — der Server rechnete sonst mit seinem UTC-Tag.',
    suchen: 'importNextWeek(holenNach(state.weeks, fromIso(heute)), langCode, altCodes)',
    ersetzen: 'importNextWeek(state.weeks.length ? holenNach(state.weeks, fromIso(heute)) : undefined, langCode, altCodes)',
  },
  {
    id: 'erinnerung-haken-je-woche',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Die Haken „weiß Bescheid" werden nur für die Wochen im Fenster gelesen — alle der Versammlung kamen nicht über die Zeilengrenze.',
    suchen: "      const bescheid = await zeilenJePraefix<{ task_key: string; name: string; persoenlich_at: string | null }>(\n        klient,\n        cong.id,\n        'assignment_log',\n        'task_key,name,persoenlich_at',\n        praefixe,\n      )\n",
    ersetzen: "      const bescheid = await klient\n        .get<{ task_key: string; name: string; persoenlich_at: string | null }[]>(\n          `assignment_log?select=task_key,name,persoenlich_at&congregation_id=eq.${wert(cong.id)}&persoenlich_at=not.is.null`,\n        )\n",
  },
  {
    id: 'erinnerung-sperre-je-versammlung',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Die Doppel-Versand-Sperre liest den Tag je Versammlung — alle zusammen kamen nicht über die Zeilengrenze.',
    suchen: '`reminder_log?select=user_id,kind&congregation_id=eq.${wert(cong)}&sent_on=eq.${wert(todayISO)}`',
    ersetzen: '`reminder_log?select=user_id,kind&sent_on=eq.${wert(todayISO)}`',
  },
  // ── Review des ganzen Codes (16.10.2026) ───────────────────────────────────
  {
    id: 'erinnerung-versammlung-fuer-sich',
    datei: 'supabase/functions/send-reminders/index.ts',
    regel: 'Scheitert eine Versammlung, erinnert der tägliche Lauf die übrigen trotzdem — und meldet den Ausfall.',
    suchen:
      "      try {\n        await versammlungBearbeiten(cong)\n      } catch (err) {\n        fehlerVersammlungen++\n        console.error(`send-reminders (Versammlung ${cong.id}):`, err instanceof Error ? err.message : String(err))\n      }\n",
    ersetzen: '      await versammlungBearbeiten(cong)\n',
  },
  {
    id: 'texte-nur-eigene-eintraege',
    datei: 'supabase/functions/_shared/texte.ts',
    regel: 'Eine Sprachtabelle liefert nur ihre eigenen Einträge — ein Code wie „constructor" ergibt Deutsch, keinen Absturz.',
    suchen: '    const eigener = lang && Object.hasOwn(tabelle, lang) ? tabelle[lang] : undefined\n',
    ersetzen: "    const eigener = tabelle[lang ?? '']\n",
  },
  // `fuellen-nicht-im-selben-punkt` gestrichen (25.10.2026): Programmpunkte
  // übernimmt niemand mehr selbst.
  /* ---- Abmelden und Kontowechsel am geteilten Gerät (Review, 16.10.2026) ---- */
  {
    id: 'abmelden-leert-den-bestand',
    datei: 'src/app/reducer.ts',
    regel: 'Abmelden leert den Bestand — der Nächste am Gerät sieht nichts vom Vorgänger, nicht einmal kurz.',
    suchen: '        ...leererZustand({ theme: state.theme, fontScale: state.fontScale, lang: state.lang }),\n',
    ersetzen: "        ...state,\n        screen: 'login',\n        confirmOpen: false,\n",
  },
  {
    id: 'laden-nach-abmelden-verworfen',
    datei: 'src/app/hydrate.ts',
    regel: 'Ein Laden, das beim Abmelden noch unterwegs war, spielt nichts mehr ein.',
    suchen: '  if (meine !== aktuelleSitzung()) return false\n',
    ersetzen: '  if (meine !== aktuelleSitzung() && meine < 0) return false\n',
  },
  {
    id: 'abmelden-beendet-die-sitzung',
    datei: 'src/app/store.tsx',
    regel: 'Das Abmelden beendet die Sitzung, in der noch geladen wird.',
    suchen: '      sitzungBeendet()\n',
    ersetzen: '      void sitzungBeendet\n',
  },
  {
    id: 'abmelden-schreibt-wartendes',
    datei: 'src/app/persist.ts',
    regel: 'Beim Abmelden geht hinaus, was gebündelt wartet — obwohl der Bestand schon geleert ist.',
    suchen: "  if (action.type === 'logout') {\n",
    ersetzen: "  if (action.type === 'logout' && next.congregationId) {\n",
  },
  {
    id: 'abmelden-wartet-aufs-schreiben',
    datei: 'src/lib/abmelden.ts',
    regel: 'Die Sitzung endet erst, wenn angekommen ist, was das Abmelden noch hinausschickte.',
    suchen: '  await schreibenAbwarten()\n',
    ersetzen: '  void schreibenAbwarten\n',
  },
  {
    id: 'abmelden-nur-dieses-geraet',
    datei: 'src/lib/abmelden.ts',
    regel: 'Abmelden beendet nur die Sitzung dieses Geräts, nicht die auf dem Handy daneben.',
    suchen: "  await supabase.auth.signOut({ scope: 'local' })\n",
    ersetzen: '  await supabase.auth.signOut()\n',
  },
  {
    id: 'abmelden-loest-das-push-abo',
    datei: 'src/lib/abmelden.ts',
    regel: 'Abmelden löst das Push-Abo des Geräts, solange die Sitzung noch gilt.',
    suchen: '    await pushAboLoesen()\n',
    ersetzen: '    void pushAboLoesen\n',
  },
  {
    id: 'push-abo-zeile-geloescht',
    datei: 'src/lib/push-abo.ts',
    regel: 'Beim Lösen des Abos geht auch die eigene Zeile in der Datenbank.',
    suchen: '  await deletePushSubscription(abo.endpoint)\n',
    ersetzen: '  void deletePushSubscription\n',
  },
  {
    id: 'push-abo-fehlt-wird-eingetragen',
    datei: 'src/lib/push-abo.ts',
    regel: 'Fehlt das Abo des Geräts in der Datenbank, wird es nach dem Anmelden wieder eingetragen.',
    suchen: '    if ((await pushAboEigen(felder.endpoint)) !== false) return\n',
    ersetzen: '    if ((await pushAboEigen(felder.endpoint)) !== true) return\n',
  },
  {
    id: 'push-abo-fremd-endet',
    datei: 'src/lib/push-abo.ts',
    regel: 'Führt ein anderes Konto das Abo dieses Geräts, endet es im Browser — der Neue bekommt nicht die Mitteilungen des Vorgängers.',
    suchen: "    if ((await pushAboEintragen(congregationId, userId, felder, lang)) === 'fremd') await abo.unsubscribe()\n",
    ersetzen: '    await pushAboEintragen(congregationId, userId, felder, lang)\n',
  },
  {
    id: 'push-abo-nach-dem-laden',
    datei: 'src/app/store.tsx',
    regel: 'Nach dem Anmelden fragt die App, ob das Push-Abo des Geräts dem Angemeldeten gehört.',
    suchen: '    if (userId && congregationId) void pushAboAbgleichen(congregationId, userId, stateRef.current.lang)\n',
    ersetzen: '    if (userId && congregationId && userId === congregationId) void pushAboAbgleichen(congregationId, userId, stateRef.current.lang)\n',
  },
  {
    id: 'vorhandenes-abo-ohne-warten',
    datei: 'src/lib/push.ts',
    regel: 'Nach dem Abo gefragt wird, ohne auf einen Service Worker zu warten, der nie bereit wird.',
    suchen: '  const reg = await navigator.serviceWorker.getRegistration()\n',
    ersetzen: '  const reg = await navigator.serviceWorker.ready\n',
  },
  /* ---- Schreiben mit Stand: erst geschrieben, dann gelöscht (Review, 16.10.2026) ---- */
  {
    id: 'zusage-erst-nach-dem-schreiben',
    datei: 'src/app/persist.ts',
    regel: 'Eine verfallene Zusage wird erst gelöscht, wenn ihre Woche geschrieben ist — scheitert das Schreiben, bleibt sie.',
    suchen: "    else nachDemSchreiben('woche', woche, (geschrieben) => geschrieben && deleteConfirmationRows(congId, liste))\n",
    ersetzen: '    else deleteConfirmationRows(congId, liste)\n',
  },
  {
    id: 'entzug-erst-nach-dem-schreiben',
    datei: 'src/app/persist.ts',
    regel: '„Zurückgezogen" geht erst hinaus, wenn die Woche geschrieben ist — scheitert sie, ist der Platz ja noch seiner.',
    suchen: '      if (geschrieben) gelungen.push(...liste)\n',
    ersetzen: '      gelungen.push(...liste)\n',
  },
  {
    id: "unveraenderte-treffpunkt-woche-bleibt",
    datei: 'src/app/persist.ts',
    regel: 'Eine unveränderte Treffpunkt-Woche geht nicht hinaus — sonst wird die nächste Änderung eines anderen zum Konflikt.',
    suchen: "    if (!week || !fsWeek || prev.fsWeeks[wi] === fsWeek) continue\n",
    ersetzen: "    if (!week || !fsWeek) continue\n",
  },
  {
    id: "treffpunkt-wochen-abgelesen",
    datei: "src/app/persist.ts",
    regel: "Jede geänderte Treffpunkt-Woche geht hinaus, gleich welche Aktion sie geändert hat — abgelesen, nicht aufgezählt (16.10.2026).",
    suchen: "    geaenderteTreffpunktWochenSpeichern(congId, prev, next, FS_GEBUENDELT.includes(action.type), fsVerwaist)\n",
    ersetzen: "    if (action.type.startsWith('fs')) geaenderteTreffpunktWochenSpeichern(congId, prev, next, FS_GEBUENDELT.includes(action.type), fsVerwaist)\n",
  },
  {
    id: "treffpunkt-wochen-nicht-ohne-functions",
    datei: "src/app/persist.ts",
    regel: "Was eine Function schreibt (Einspringen, freier Platz) und was nur geladen wurde, geht auch bei den Treffpunkten nicht noch einmal hinaus.",
    suchen: "  if (wochenSchreiben) {\n    geaenderteWochenSpeichern(",
    ersetzen: "  geaenderteTreffpunktWochenSpeichern(congId, prev, next, false, fsVerwaist)\n  if (wochenSchreiben) {\n    geaenderteWochenSpeichern(",
  },
  {
    id: "setzt-feld-durchreichen",
    datei: "src/app/quelltext-proben.ts",
    regel: "Die Quelltext-Probe zählt bloßes Durchreichen (`fsRules: state.fsRules`) nicht als Setzen — sonst verlangte sie Schreibfälle für Aktionen, die nur lesen.",
    suchen: "      if (wert.startsWith(alt) && /^\\s*([,})]|$)/.test(wert.slice(alt.length))) continue\n",
    ersetzen: "",
  },
  {
    id: 'gleiche-besetzung-gleiche-wochen',
    datei: 'src/data/planning.ts',
    regel: 'Dieselbe Person auf demselben Platz noch einmal ändert nichts — auch nicht die Referenz der Wochen.',
    suchen: '    if (gleich(slot) && (rolle === undefined || slot.rolle === rolle) && (herkunft === undefined || (slot.herkunft ?? \'\') === herkunft)) {\n',
    ersetzen: '    if (gleich(slot) && rolle === \'nie\') {\n',
  },
  {
    id: 'gleicher-leiter-gleiche-wochen',
    datei: 'src/data/fs.ts',
    regel: 'Derselbe Treffpunkt-Leiter noch einmal gibt dieselben Wochen zurück.',
    suchen: '  if (jetzt && jetzt.leader === name && jetzt.lpid === lpid && jetzt.lext === lext) return fsWeeks\n',
    ersetzen: "  if (jetzt && jetzt.leader === name && name === 'nie') return fsWeeks\n",
  },
  {
    id: "woche-meldet-erfolg",
    datei: 'src/lib/data.ts',
    regel: "Das Schreiben einer Woche — Zusammenkünfte wie Treffpunkte — meldet, ob es gelang; daran hängen Löschen und Entzug.",
    suchen: "      standMerken(staende, woche, zeile.updated_at as string, geladen)\n      return true\n",
    ersetzen: "      standMerken(staende, woche, zeile.updated_at as string, geladen)\n      return false\n",
  },
  {
    id: "woche-ausnahme-gemeldet",
    datei: 'src/lib/data.ts',
    regel: 'Eine Ausnahme beim Schreiben einer Woche wird gemeldet, nicht verschluckt.',
    suchen: "        schreiben(congregationId, woche, data, geladen).catch((err: unknown) => {\n          schreibfehler({ message: err instanceof Error ? err.message : String(err) })\n",
    ersetzen: "        schreiben(congregationId, woche, data, geladen).catch((err: unknown) => {\n          void err\n",
  },
  {
    id: "woche-veralteter-stand-laedt-nach",
    datei: "src/lib/data.ts",
    regel: "Eine Abweisung, die nur ein veralteter Stand erklärt (etwa 42501, das Recht ist weg), lädt nach — bei den Wochen wie bei den Treffpunkten. Ein anderer Fehler bleibt ein Schreibfehler.",
    suchen: "      if (standVeraltet(error)) {\n        console.error('[persistenz]', error.message)\n        konfliktMelder?.()\n      } else schreibfehler(error)\n",
    ersetzen: "      schreibfehler(error)\n",
  },
  {
    id: 'besuche-nacheinander',
    datei: 'src/lib/data.ts',
    regel: 'Zwei schnelle Handlungen an derselben Besuchszeile gehen nacheinander hinaus.',
    suchen: "  besucheNacheinander(() => loeschenDannSchreiben(client, 'gruppenbesuche', congregationId, besuche, entfernt, gruppenbesuchToRow))\n",
    ersetzen: "  void zeilenRun(loeschenDannSchreiben(client, 'gruppenbesuche', congregationId, besuche, entfernt, gruppenbesuchToRow))\n",
  },
  /* ---- Laden mitten in der Sitzung (Review, 16.10.2026) ---- */
  {
    id: 'nachladen-still-behaelt-bestand',
    datei: 'src/app/hydrate.ts',
    regel: 'Scheitert ein stilles Nachladen, bleibt der Bestand stehen — keine Momentaufnahme, keine Fehlerseite.',
    suchen: '  if (still()) {\n',
    ersetzen: "  if (still() && userId === '') {\n",
  },
  {
    id: 'nachladen-traegt-marke',
    datei: 'src/app/hydrate.ts',
    regel: 'Ein stilles Nachladen sagt dem Reducer, dass es eines ist.',
    suchen: '    dispatch({ type: \'hydrate\', payload, ...(still() ? { nachgeladen: true as const } : {}) })\n',
    ersetzen: "    dispatch({ type: 'hydrate', payload })\n",
  },
  {
    id: 'nachladen-legt-nicht-wieder-vor',
    datei: 'src/app/reducer.ts',
    regel: '„Später" hält bis zum nächsten Öffnen der App — ein Nachladen legt das Blatt nicht erneut vor.',
    suchen: '  if (action.type === \'hydrate\') return withDerivedTasks(baseReducer(state, action), !action.nachgeladen)\n',
    ersetzen: "  if (action.type === 'hydrate') return withDerivedTasks(baseReducer(state, action), true)\n",
  },
  {
    id: 'neuer-tag-leitet-ab',
    datei: 'src/app/reducer.ts',
    regel: 'Ein neuer Tag nimmt Vergangenes aus „Meine Aufgaben", auch ohne sonstige Änderung.',
    suchen: "  if (action.type === 'neuerTag') return withDerivedTasks(state, false)\n",
    ersetzen: "  if (action.type === 'neuerTag') return state\n",
  },
  {
    id: 'neuer-tag-vom-provider',
    datei: 'src/app/store.tsx',
    regel: 'Der Provider stößt beim Tageswechsel die neue Ableitung an.',
    suchen: "    dispatch({ type: 'neuerTag' })\n",
    ersetzen: '    void dispatch\n',
  },
  {
    id: 'sprung-wartet-auf-daten',
    datei: 'src/app/AppShell.tsx',
    regel: 'Ein Push-Ziel beim Kaltstart wartet auf die Daten der Sitzung — erst dann kennt die App die Rechte.',
    suchen: "    if (isLogin || !pendingNav || !state.userId || state.dataStatus !== 'ready') return\n",
    ersetzen: '    if (isLogin || !pendingNav) return\n',
  },
  {
    id: 'holen-varianten-nur-was-kommt',
    datei: 'src/planen/useWochenImport.ts',
    regel: 'Sprachvarianten holt „Holen" nur für Wochen, die noch kommen — vergangene braucht niemand in einer weiteren Sprache, und seit import-week ein Jahr zurück findet, holte jeder Abruf sie alle neu.',
    suchen: '    const luecken = missingVariants(state.weeks, altCodes, langCode).filter(\n      (luecke) => !istVorbei(weekEndMs(luecke.start), fromIso(heute)),\n    )\n',
    ersetzen: '    const luecken = missingVariants(state.weeks, altCodes, langCode)\n',
  },
  {
    id: 'holen-gesperrt-behaelt-fokus',
    datei: 'src/planen/ProgrammHolen.tsx',
    regel: '„Holen" sperrt sich per aria-disabled, nicht per disabled — sonst landet der Fokus nach dem Blatt auf der Seite.',
    suchen: '      <GesperrterKnopf className={className} gesperrt={state.importing} onTipp={starten}>\n        {t.holen}\n      </GesperrterKnopf>\n',
    ersetzen: '      <button type="button" className={className} disabled={state.importing} onClick={starten}>\n        {t.holen}\n      </button>\n',
  },
  {
    id: 'import-lied-als-absatz',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Ab 2027 stehen die Lieder als Absatz mit dem Liederbuch-Link vorn — Eröffnung und Zwischenlied kommen auch so an.',
    suchen: "    if ((tok.tag === 'h3' && tok.music) || (tok.tag === 'p' && tok.liedVorn)) {\n",
    ersetzen: "    if (tok.tag === 'h3' && tok.music) {\n",
  },
  {
    id: 'import-lied-nur-vorn',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Ein Absatz ist nur dann eine Lied-Zeile, wenn er mit dem Link beginnt — eine Zeitzeile, die ein Lied nennt, bleibt Zeitzeile.',
    suchen: '      liedVorn: LIED_VORN.test(inner),\n',
    ersetzen: '      liedVorn: MUSIK.test(inner),\n',
  },
  {
    id: 'import-schluss-kopf',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Die Schlussworte als eigene Überschrift (ab 2027) und das Lied darunter ergeben zusammen die Schlusszeile.',
    suchen: "    if (tok.tag === 'h3' && tok.color === 'none' && curColor !== null && TIME_ANY.test(tok.text)) {\n      schlussKopf = tok.text\n",
    ersetzen: "    if (tok.tag === 'h3' && tok.color === 'none' && curColor !== null && TIME_ANY.test(tok.text)) {\n",
  },
  {
    id: 'import-schluss-ohne-lied',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Schlussworte ohne Lied darunter sind trotzdem die Schlusszeile — in der Sprache der Seite, nicht die deutsche Rückfall-Zeile.',
    suchen: '  if (!closing && schlussKopf !== null) closing = abschlussAus(schlussKopf)\n',
    ersetzen: '',
  },
  {
    id: 'import-schluss-neuer-abschnitt',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Kommt nach einer farblosen Überschrift mit Zeit noch ein Abschnitt, war sie nicht die Schlusszeile — das Zwischenlied bleibt Zwischenlied.',
    suchen: '      // war nicht die Schlusszeile, und das Zwischenlied gehört nicht zu ihr.\n      schlussKopf = null\n',
    ersetzen: '      // war nicht die Schlusszeile, und das Zwischenlied gehört nicht zu ihr.\n',
  },
  {
    id: 'import-farbe-beide-anfuehrungszeichen',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Die Farbe eines Abschnitts wird auch aus einer einfach angeführten Klasse gelesen.',
    suchen: '  const cls = (attrs.match(/class=(["\'])(.*?)\\1/) || [])[2] || \'\'\n',
    ersetzen: '  const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || \'\'\n',
  },
  {
    id: 'studie-lieder-beide-anfuehrungszeichen',
    datei: 'supabase/functions/import-week/study.ts',
    regel: 'Die Lieder eines Studienartikels werden auch aus einfach angeführten Liederbuch-Links gelesen.',
    suchen: '  const re = /<a\\b[^>]*class=(["\'])[^"\']*\\bpub-sjj\\b[^"\']*\\1[^>]*>([\\s\\S]*?)<\\/a>\\s*([^<]*)/g\n',
    ersetzen: '  const re = /<a\\b[^>]*class="()[^"]*\\bpub-sjj\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/a>\\s*([^<]*)/g\n',
  },
  {
    id: 'import-umschalter-beide-anfuehrungszeichen',
    datei: 'supabase/functions/import-week/hefte.ts',
    regel: 'Der „Lesen in"-Umschalter wird auch einfach angeführt gelesen — sonst fände keine fremdsprachige Versammlung ihre Woche.',
    suchen: "value=([\"'])${code}",
    ersetzen: 'value=(")${code}',
  },
  {
    id: 'studie-uebersicht-beide-anfuehrungszeichen',
    datei: 'supabase/functions/import-week/study.ts',
    regel: 'Die Karten der Studienausgabe werden auch mit einfach angeführten Attributen gelesen.',
    suchen: 'html.split(/class=["\']synopsis/)',
    ersetzen: 'html.split(/class="synopsis/)',
  },
  {
    id: 'import-vortrag-des-vorsitzenden',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Ein „Vortrag des Vorsitzenden" (ab 2027) bekommt den Platz des Vorsitzenden — keinen Schüler mit Partner.',
    suchen: '  if (VORSITZ_RE.test(form)) return vorsitzPlatz()\n',
    ersetzen: '',
  },
  // ── Die Heft-Probe: jede neue Ausgabe gegen den Parser (Betreiber, 16.10.2026)
  {
    id: 'dienstteil-bekannt-form-zaehlt',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Eine Form, die der Parser nicht kennt, macht den Punkt unbekannt — auch wenn der Titel die Plätze nennt.',
    suchen: '  return formBekannt && dienstteilPlaetze(title, meta) !== null\n',
    ersetzen: '  return dienstteilPlaetze(title, meta) !== null\n',
  },
  {
    id: 'dienstteil-bekannt-titel-zaehlt',
    datei: 'supabase/functions/import-week/parse.ts',
    regel: 'Ein Punkt, dessen Plätze weder Form noch Titel bestimmen, ist unbekannt — dann rät ministryNames.',
    suchen: '  return formBekannt && dienstteilPlaetze(title, meta) !== null\n',
    ersetzen: '  return formBekannt\n',
  },
  {
    id: 'heft-probe-lied-mit-nummer',
    datei: 'scripts/heft-pruefen.mjs',
    regel: 'Die Heft-Probe meldet Eröffnung und Abschluss ohne Liednummer — so kam 2027 die Rückfall-Zeile.',
    suchen: '    if (!ZIFFER.test(titel)) befunde.push(`${name} ohne Liednummer: „${titel}"`)\n',
    ersetzen: '',
  },
  {
    id: 'heft-probe-zwischenlied',
    datei: 'scripts/heft-pruefen.mjs',
    regel: 'Die Heft-Probe meldet, wenn unter „Unser Leben als Christ" kein Lied steht.',
    suchen: "!leben.items.some((i) => 'song' in i)",
    ersetzen: "!leben.items.some((i) => 'iid' in i)",
  },
  {
    id: 'heft-probe-form-unbekannt',
    datei: 'scripts/heft-pruefen.mjs',
    regel: 'Die Heft-Probe meldet auf Deutsch jede Form unter „Uns im Dienst verbessern", die der Parser nicht kennt.',
    suchen: "    if (deutsch && s.farbe === 'gold' && !dienstteilBekannt(p.title, p.meta ?? '')) {\n",
    ersetzen: '    if (false) {\n',
  },
  {
    id: 'heft-probe-gliederung-wie-deutsch',
    datei: 'scripts/heft-pruefen.mjs',
    regel: 'Die Heft-Probe meldet eine Fassung, die anders gegliedert ist als die deutsche — die Plätze kommen nach der Stelle.',
    suchen: '  return ist === soll ? [] : [',
    ersetzen: '  return true ? [] : [',
  },
  // ── T123: Übersetzungen ────────────────────────────────────────────────────
  {
    id: 't123-glocke-termin-doppelpunkt',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'In der Glocke steht die Bezeichnung hinter „Termin: " übersetzt — „19:00: Bibellesung" geht in seinen Hälften durch den Übersetzer.',
    suchen: "    if (f.includes(': ')) return f.split(': ').map(one).join(': ')\n",
    ersetzen: '',
  },
  {
    id: 't123-spanne-ohne-fuehrende-null',
    datei: 'supabase/functions/_shared/i18n/translate.ts',
    regel: 'Eine Wochenspanne trägt keinen Tag mit führender Null — ICU schreibt italienisch „07–13 settembre", jw.org „7-13 settembre".',
    suchen: "  return fmt.formatRange(a, b).replace(/(^|\\P{Nd})0(\\p{Nd})(?!\\p{Nd})/gu, '$1$2')\n",
    ersetzen: '  return fmt.formatRange(a, b)\n',
  },
  {
    id: 't123-programmpunkt-fragt-nach-titel',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Ein neuer Programmpunkt ohne Titel bittet um einen Titel, nicht um einen Namen — polnisch hieß das „Wpisz imię", den Vornamen eintragen.',
    suchen: "      dispatch({ type: 'showToast', text: t.toastTitelEingeben })",
    ersetzen: "      dispatch({ type: 'showToast', text: t.toastNameEingeben })",
  },
  {
    id: 't123-freitext-leiter-personenname',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Das Freitext-Feld für den Treffpunkt-Leiter fragt nach dem Namen einer Person (personNameLbl), nicht nach einer Bezeichnung — polnisch „Imię i nazwisko" statt „Nazwa".',
    suchen: '            placeholder={t.personNameLbl}\n            aria-label={t.personNameLbl}\n',
    ersetzen: '            placeholder={t.nameLbl}\n            aria-label={t.nameLbl}\n',
  },
  {
    id: 't123-absage-knoepfe-verschieden',
    datei: 'src/i18n/overlays/fa.ts',
    regel: 'Im Absage-Blatt heißen „Absagen" und „Abbrechen" in jeder Sprache verschieden — persisch standen zweimal „لغو" untereinander.',
    suchen: '  "absagen": "اعلام انصراف",\n',
    ersetzen: '  "absagen": "لغو",\n',
  },
  {
    id: 'zuteilung-vortrag-folgt-vorsitz',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Den „Vortrag des Vorsitzenden" bekommt der Vorsitzende der Zusammenkunft — kein zweiter, und er bleibt nicht offen.',
    suchen: "    default:\n      return slot?.rolle === 'Vorsitz'\n",
    ersetzen: '    default:\n      return false\n',
  },
  {
    id: 'zuteilung-leser-folgt-vorsitz',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Am Wochenende liest der Vorsitzende den Wachtturm (T131) — die Automatik setzt ihn ein, der Bedarf zählt den Leser nicht eigens.',
    suchen: "    case 'wtStudium':\n      return slot?.rolle === 'Leser'\n",
    ersetzen: "    case 'wtStudium':\n      return false\n",
  },
  {
    id: 'zuteilung-leser-im-altbestand',
    datei: 'supabase/functions/_shared/planung.ts',
    regel: 'Auch ein Wachtturm-Studium ohne gespeicherte Art (Altbestand) erkennen die geteilten Regeln — sonst läse dort nicht der Vorsitzende (T131).',
    suchen: "  'WACHTTURM-STUDIUM': 'wtStudium',\n",
    ersetzen: '',
  },
  {
    id: 'zuteilung-leser-wenn-vorsitz-leitet',
    datei: 'src/data/planning.ts',
    regel: 'Leitet der Vorsitzende das Wachtturm-Studium selbst, liest ein anderer — Automatik, Bedarf und Blatt behandeln den Leser dann wie jeden Platz (T131).',
    suchen: '  return !vorsitz?.name || ![...wtLeiterPlaetze(meeting)].some((leiter) => dieselbePerson(leiter, vorsitz))\n',
    ersetzen: '  return true\n',
  },
  {
    id: 'rangfolge-vortrag-folgt-vorsitz',
    datei: 'src/data/planning.ts',
    regel: 'Das Zuteilen-Blatt schlägt für den Vortrag des Vorsitzenden den Vorsitzenden vor — keinen anderen, und nicht niemanden.',
    suchen: '    return er ? [er] : []\n',
    ersetzen: '    return []\n',
  },
  {
    id: 'bedarf-folgt-vorsitz',
    datei: 'src/data/bedarf.ts',
    regel: 'Anfangsgebet und Vortrag des Vorsitzenden zählen nicht als eigener Bedarf — wo nur einer den Vorsitz kann, ist das kein Engpass.',
    suchen: "    if (platz.art === 'programm' && folgtDemVorsitzIn(meeting, platz.section, platz.slot)) continue\n",
    ersetzen: '',
  },
  {
    id: 'heute-schon-dran-vorsitz-als-grund',
    datei: 'src/data/planning.ts',
    regel: 'Am Platz, der dem Vorsitz folgt, ist der Vorsitz desselben Mannes kein „heute schon dran" — er ist der Grund.',
    suchen: '    if (platz.slot === vorsitz) continue\n',
    ersetzen: '',
  },
  {
    id: 'heute-schon-dran-eigener-ratgeber',
    datei: 'src/data/planning.ts',
    regel: 'Der eigene Platz im Blatt „Ratgeber" ist keine Doppelbelegung — wie bei jedem anderen Platz.',
    suchen: "      if (exclude?.kind === 'ratgeber') continue\n",
    ersetzen: '',
  },
  // `angebot-vortrag-des-vorsitzenden` (-app, -server) gestrichen (25.10.2026):
  // „Freie Plätze" bietet keinen Programmpunkt mehr an, auch diesen nicht.
  {
    id: 'zuteilung-wt-leiter-einmal-offen',
    datei: 'src/data/planning.ts',
    regel: 'Findet sich kein Leiter des Wachtturm-Studiums, zählt er einmal als offen — Schritt 2 versucht ihn nicht noch einmal.',
    suchen: '    if (folgtDemVorsitzIn(meeting, section, slot) || istWtLeiter(section, slot)) continue\n',
    ersetzen: '    if (folgtDemVorsitzIn(meeting, section, slot)) continue\n',
  },
  {
    id: 'zuteilung-ratgeber-nur-brueder',
    datei: 'src/data/planning.ts',
    regel: 'Die Automatik macht keine Schwester zum Ratgeber — der Platz trägt `male`.',
    suchen: "  const person = w.pick('part', 'ratgeber', ratgeberOpts(ratgeber))\n",
    ersetzen: "  const person = w.pick('part', 'ratgeber')\n",
  },
  {
    id: 'rangfolge-ratgeber-nur-brueder',
    datei: 'src/data/planning.ts',
    regel: 'Das Zuteilen-Blatt schlägt für den Ratgeber keine Schwester vor.',
    suchen: "  if (sel.kind === 'ratgeber') return w.rangfolge('part', 'ratgeber', ratgeberOpts(ratgeberSlot(meeting)))\n",
    ersetzen: "  if (sel.kind === 'ratgeber') return w.rangfolge('part', 'ratgeber')\n",
  },
  {
    id: 'koppeln-id-vor-name',
    datei: 'src/data/planning.ts',
    regel: 'Was dem Vorsitz folgt, bekommt die Id des Vorsitzenden — auch wenn sein Platz nur einen Namen trägt.',
    suchen: '  const pid = vorsitzSlot.pid ?? vorsitz?.id\n',
    ersetzen: '  const pid = vorsitzSlot.pid\n',
  },
  {
    id: 'kandidaten-ratgeber-nur-brueder',
    datei: 'src/planen/kandidaten.ts',
    regel: 'Das Zuteilen-Blatt bietet für den Ratgeber keine Schwester an, auch mit gesetztem Bereich.',
    suchen: '    return (p: Person) => !(nurBrueder && p.female)\n',
    ersetzen: '    return () => true\n',
  },
  {
    id: 'import-week-sonntag-laufende',
    datei: 'supabase/functions/import-week/index.ts',
    regel: 'Ohne `after` kommt die laufende Woche — auch am Sonntag, nicht schon die nächste.',
    suchen: 'new Date(todayUtc - 7 * 864e5)',
    ersetzen: 'new Date(todayUtc - 6 * 864e5)',
  },
  // ── Ein Ort, der fehlt (Betreiber, 18.10.2026) ────────────────────────────
  {
    id: 'ort-fehlt-gruppe',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Ein Treffpunkt ohne Ort steht im Blatt der Gruppe als „Samstag 09:30“ — nicht als „, Samstag 09:30“ (Betreiber, 18.10.2026).',
    suchen: '                  {ort && (\n',
    ersetzen: '                  {true && (\n',
  },
  {
    id: 'ort-fehlt-gruppe-leerzeichen',
    datei: 'src/einstellungen/GruppeBlatt.tsx',
    regel: 'Ein Ort aus Leerzeichen gilt im Blatt der Gruppe als keiner — der Ort eines Treffpunkts wird beim Bearbeiten ungekürzt gespeichert.',
    suchen: '              const ort = tu(regel.place).trim()\n',
    ersetzen: '              const ort = tu(regel.place)\n',
  },
  {
    id: 'ort-fehlt-zuteilen-kopf',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Ohne Ort nennt der Kopf beim Zuteilen eines Treffpunkts nur die Zeit — ohne „ · “ am Ende.',
    suchen: "    return { label, titel: label, sub: inst ? [inst.time, tu(inst.place).trim()].filter(Boolean).join(' · ') : '' }\n",
    ersetzen: "    return { label, titel: label, sub: inst ? `${inst.time} · ${tu(inst.place)}` : '' }\n",
  },
  {
    id: 'ort-fehlt-zuteilen-kopf-leerzeichen',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Ein Ort aus Leerzeichen gilt im Kopf beim Zuteilen als keiner.',
    suchen: '[inst.time, tu(inst.place).trim()]',
    ersetzen: '[inst.time, tu(inst.place)]',
  },
  {
    id: 'ort-fehlt-zeitleiste',
    datei: 'src/personen/PersonTimeline.tsx',
    regel: 'Ein geleiteter Treffpunkt ohne Ort heißt in der Zeitleiste der Person nur „Treffpunkte leiten“ — ohne „ · “ am Ende.',
    suchen: "    if (e.kind === 'fs') return [t.privTreffpunkt, tu(e.ort).trim()].filter(Boolean).join(' · ')\n",
    ersetzen: "    if (e.kind === 'fs') return `${t.privTreffpunkt} · ${tu(e.ort)}`\n",
  },
  {
    id: 'ort-fehlt-zeitleiste-leerzeichen',
    datei: 'src/personen/PersonTimeline.tsx',
    regel: 'Ein Ort aus Leerzeichen gilt in der Zeitleiste der Person als keiner.',
    suchen: '[t.privTreffpunkt, tu(e.ort).trim()]',
    ersetzen: '[t.privTreffpunkt, tu(e.ort)]',
  },
  {
    id: 'ort-fehlt-trolley-bogen',
    datei: 'src/druck/TrolleyBogen.tsx',
    regel: 'Ein Trolley ohne Ort steht auf dem Bogen nur mit Namen — ohne „abholen:“ ins Leere.',
    suchen: '            {trolley.ort && <span className="druck-leise">{fill(t.trolleyAbholen, { ort: trolley.ort })}</span>}\n',
    ersetzen: '            <span className="druck-leise">{fill(t.trolleyAbholen, { ort: trolley.ort })}</span>\n',
  },
  // ── Der feste Leiter des Wachtturm-Studiums steht von selbst in der Woche (Betreiber, 18.10.2026) ──
  {
    id: 'wt-leiter-holen-abwesend',
    datei: 'src/data/planning.ts',
    regel: 'Fehlt der feste Leiter am Tag der Zusammenkunft, kommt beim Holen sein Vertreter in die Woche.',
    suchen: '      const leiter = festerWtLeiter(persons, (p) => !istAbwesend(abwesend, p.id, 0, tab) && !eingeteilt.has(p.id))\n',
    ersetzen: '      const leiter = festerWtLeiter(persons, (p) => !eingeteilt.has(p.id))\n',
  },
  {
    id: 'wt-leiter-holen-schon-eingeteilt',
    datei: 'src/data/planning.ts',
    regel: 'Hält der feste Leiter in der Zusammenkunft schon eine Aufgabe (etwa den Vortrag), leitet beim Holen sein Vertreter.',
    suchen: '      const leiter = festerWtLeiter(persons, (p) => !istAbwesend(abwesend, p.id, 0, tab) && !eingeteilt.has(p.id))\n',
    ersetzen: '      const leiter = festerWtLeiter(persons, (p) => !istAbwesend(abwesend, p.id, 0, tab))\n',
  },
  {
    id: 'wt-leiter-holen-ausgefallen',
    datei: 'src/data/planning.ts',
    regel: 'In eine gestrichene Zusammenkunft kommt beim Holen kein Studienleiter.',
    suchen: '    if (istAusgefallen(kopie, tab)) continue\n',
    ersetzen: '',
  },
  {
    id: 'wt-leiter-holen-besetzt',
    datei: 'src/data/planning.ts',
    regel: 'Ein schon besetzter Leiter-Platz bleibt beim Holen und beim Import, wie er ist.',
    suchen: '      if (slot.name) continue\n      const leiter = festerWtLeiter(',
    ersetzen: '      const leiter = festerWtLeiter(',
  },
  {
    id: 'wt-leiter-holen-nach-vortrag',
    datei: 'src/data/neue-woche.ts',
    regel: 'Beim Holen steht der vorgemerkte Vortrag vor dem Studienleiter — hält der Leiter ihn, leitet sein Vertreter.',
    suchen:
      '  const mitVortrag = vortragInNeueWoche(wochen[0] ?? mitEnden, k.vortraege, k.persons)\n' +
      '  const { week } = festenWtLeiterEintragen(mitVortrag, k.persons, k.absences, k.zeiten)\n',
    ersetzen:
      '  const ohneVortrag = festenWtLeiterEintragen(wochen[0] ?? mitEnden, k.persons, k.absences, k.zeiten).week\n' +
      '  const week = vortragInNeueWoche(ohneVortrag, k.vortraege, k.persons)\n',
  },
  {
    id: 'wt-leiter-holen-abwesenheiten',
    datei: 'src/data/neue-woche.ts',
    regel: 'Die Einordnung einer geholten Woche fragt die Abwesenheiten — sonst käme der verreiste Leiter hinein.',
    suchen: '  const { week } = festenWtLeiterEintragen(mitVortrag, k.persons, k.absences, k.zeiten)\n',
    ersetzen: '  const { week } = festenWtLeiterEintragen(mitVortrag, k.persons, [], k.zeiten)\n',
  },
  {
    id: 'wt-leiter-app-abwesenheiten',
    datei: 'src/app/reducer.ts',
    regel: '„Holen" in der App reicht die Abwesenheiten an die Einordnung weiter.',
    suchen: '        persons: state.persons,\n        absences: state.absences,\n      })\n',
    ersetzen: '        persons: state.persons,\n        absences: [],\n      })\n',
  },
  {
    id: 'wt-leiter-skript-abwesenheiten',
    datei: 'scripts/wochen-importieren.mjs',
    regel: 'Das Skript zum Holen liest die Abwesenheiten — der feste Leiter kommt nur in Wochen, in denen er da ist.',
    suchen: '    absences: abwesenheiten.map(zeilen.absenceFromRow),\n',
    ersetzen: '    absences: [],\n',
  },
  {
    id: 'wt-leiter-nws-import',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Der Wochenplan-Import aus NWS setzt den festen Studienleiter — NWS führt ihn nicht je Woche.',
    suchen: '    const wt = festenWtLeiterEintragen({ ...zeile.data, start: montag }, appPersonen, appAbwesenheiten, zeiten)\n',
    ersetzen: '    const wt = { week: zeile.data, eingetragen: [] }\n',
  },
  {
    id: 'wt-leiter-nws-import-abwesend',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Der Wochenplan-Import fragt die Abwesenheiten: Fehlt der Leiter, kommt sein Vertreter.',
    suchen: '    const wt = festenWtLeiterEintragen({ ...zeile.data, start: montag }, appPersonen, appAbwesenheiten, zeiten)\n',
    ersetzen: '    const wt = festenWtLeiterEintragen({ ...zeile.data, start: montag }, appPersonen, [], zeiten)\n',
  },
  {
    id: 'wt-leiter-nws-import-zeiten',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Ob der Leiter fehlt, misst der Import am Tag, an dem diese Versammlung zusammenkommt — nicht am Standard-Sonntag.',
    suchen: '  const zeiten = zeitenAus(versammlung)\n',
    ersetzen: '  const zeiten = zeitenAus(undefined)\n',
  },
  {
    id: 'wt-leiter-nws-import-schreiben',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Kommt nur der Studienleiter in eine Woche, schreibt der Import sie trotzdem.',
    suchen: '    if (z.gesetzt + z.helfer + wt.eingetragen.length > 0) {\n',
    ersetzen: '    if (z.gesetzt + z.helfer > 0) {\n',
  },
  {
    id: 'neuaufbau-abwesenheiten-vor-wochen',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Im Neuaufbau kommen die Abwesenheiten vor die Wochen — sonst leitete der Verreiste das Wachtturm-Studium.',
    suchen:
      "      titel: 'Abwesenheiten',\n" +
      "      skript: 'abwesenheiten-importieren.mjs',\n" +
      '      argv: [...seit, ...daten, ...cong, ...trocken],\n' +
      '    },\n' +
      '    {\n' +
      "      titel: `Wochenprogramme von jw.org (${wochen}${seit.length ? ` ab ${arg.ab}` : ''})`,\n" +
      "      skript: 'wochen-importieren.mjs',\n" +
      "      argv: ['--anzahl', wochen, ...seit, ...cong, ...trocken],\n",
    ersetzen:
      "      titel: `Wochenprogramme von jw.org (${wochen}${seit.length ? ` ab ${arg.ab}` : ''})`,\n" +
      "      skript: 'wochen-importieren.mjs',\n" +
      "      argv: ['--anzahl', wochen, ...seit, ...cong, ...trocken],\n" +
      '    },\n' +
      '    {\n' +
      "      titel: 'Abwesenheiten',\n" +
      "      skript: 'abwesenheiten-importieren.mjs',\n" +
      '      argv: [...seit, ...daten, ...cong, ...trocken],\n',
  },
  {
    id: 'neuaufbau-daten-an-nws-schritte',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Der Neuaufbau reicht --daten an die Schritte, die NWS lesen — sonst läsen sie still den frischen Stand ohne die Geschichte aus den Sicherungen.',
    suchen: "  const daten = typeof arg.daten === 'string' ? ['--daten', arg.daten] : []\n",
    ersetzen: '  const daten = []\n',
  },
  {
    id: 'nws-staende-loeschvermerk-gewinnt',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Beim Vereinen gewinnt der jüngste Stand, auch mit Löschvermerk — eine in NWS entfernte Zuteilung kommt nicht aus einer Sicherung zurück.',
    suchen: '  for (const liste of [...listen].reverse()) {\n',
    ersetzen: '  for (const liste of listen) {\n',
  },
  {
    id: 'nws-staende-personen-ueber-mid',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Personen werden über die mid vereint — die ID wechselte im April 2026 ihr Format, und jede Person stünde doppelt da.',
    suchen: '  return p.mid != null ? `mid:${p.mid}` : `id:${zeilenSchluessel(p, PERSONEN)}`\n',
    ersetzen: '  return `id:${zeilenSchluessel(p, PERSONEN)}`\n',
  },
  {
    id: 'nws-staende-letzte-lebende-fassung',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Von einer in NWS gelöschten Person bleibt die letzte Fassung ohne Löschvermerk — ihre alten Zuteilungen trügen sonst keinen Namen.',
    suchen: '      if (!da || (da.Deleted && !p.Deleted)) out.set(k, p)\n',
    ersetzen: '      if (!da) out.set(k, p)\n',
  },
  {
    id: 'nws-staende-verweise-neue-id',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Abwesenheiten mit der alten ID werden auf die neue umgeschrieben — sonst zeigten sie auf keine App-Person und fielen still weg.',
    suchen: '      return { ...z, [feld]: neu }\n',
    ersetzen: '      return z\n',
  },
  {
    id: 'nws-staende-juengste-zuerst',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Die Sicherungen eines Ordners zählen jüngste zuerst — sonst gewänne beim Vereinen die älteste.',
    suchen: '    .sort()\n    .reverse()\n',
    ersetzen: '    .sort()\n',
  },
  {
    id: 'nws-staende-nur-zeitstempel',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Aus einem Ordner voller Sicherungen zählen nur Unterordner mit Zeitstempel — ein anders benannter sortierte irgendwo hinein und gewänne womöglich über Jüngere.',
    suchen: '    .filter((e) => e.isDirectory() && SICHERUNG_NAME.test(e.name))\n',
    ersetzen: '    .filter((e) => e.isDirectory())\n',
  },
  {
    id: 'nws-staende-frisch-nicht-veraltet',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Ist eine Sicherung jünger als der frische Stand, vereint das Skript nicht — die Fassungen des veralteten Standes gewönnen sonst über neuere.',
    suchen: '  return aeltere.map((d) => path.basename(d)).find((name) => (sicherungsZeit(name) ?? 0) > entschluesselt) ?? null\n',
    ersetzen: '  return null\n',
  },
  {
    id: 'nws-staende-ziel-nicht-im-stand',
    datei: 'scripts/nws-staende-vereinen.mjs',
    regel: 'Das Ziel darf auch nicht in einem Stand liegen — sonst schriebe das Vereinen in den Ordner der Sicherungen.',
    suchen: "  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))\n",
    ersetzen: "  return rel === ''\n",
  },
  {
    id: 'neuaufbau-wert-pflicht',
    datei: 'scripts/neuaufbau-fahren.mjs',
    regel: 'Eine Angabe ohne Wert (`--daten --cong …`) bricht den Neuaufbau ab — sonst liefe er still ohne die vereinten NWS-Stände.',
    suchen: '  return MIT_WERT.filter((k) => arg[k] === true)\n',
    ersetzen: '  return []\n',
  },
  {
    id: 'nws-datum-mit-uhrzeit',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Der Wochenplan-Import liest NWS-Daten auch mit Uhrzeit — die Sicherungen bis April 2026 schreiben sie so, und der Neuaufbau stieg mit „Invalid time value" aus.',
    suchen: '  const d = new Date(`${nurDatum(iso)}T12:00:00Z`)\n',
    ersetzen: '  const d = new Date(`${iso}T12:00:00Z`)\n',
  },
  {
    id: 'nws-dienst-tag-mit-uhrzeit',
    datei: 'scripts/wochenplanung-importieren.mjs',
    regel: 'Auch den Tag eines Hilfsdienstes liest der Import aus einem Datum mit Uhrzeit — sonst fiele jeder Dienst aus den Sicherungen bis April 2026 still weg.',
    suchen: '  const wd = new Date(`${nurDatum(iso)}T12:00:00Z`).getUTCDay()\n',
    ersetzen: '  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay()\n',
  },
  // Erst prüfen, dann zeigen (19.10.2026): Beim Öffnen blitzt die Anmeldung nicht auf.
  {
    id: 'oeffnen-startbild-statt-anmeldung',
    datei: 'src/app/AppShell.tsx',
    regel: 'Solange offen ist, ob jemand angemeldet ist, zeigt die App weder die Anmeldung noch sich selbst — nur das Startbild.',
    suchen: "  if (state.sitzungPruefen || state.dataStatus === 'loading') {\n",
    ersetzen: "  if (state.dataStatus === 'loading') {\n",
  },
  {
    id: 'oeffnen-startbild-bis-daten-da',
    datei: 'src/app/AppShell.tsx',
    regel: 'Das Startbild bleibt, bis die Daten da sind — keine App ohne Inhalt mit „Lädt …" in der Kopfzeile.',
    suchen: "  if (state.sitzungPruefen || state.dataStatus === 'loading') {\n",
    ersetzen: '  if (state.sitzungPruefen) {\n',
  },
  {
    id: 'oeffnen-startbild-meldung',
    datei: 'src/app/AppShell.tsx',
    regel: 'Über dem Startbild bleibt eine Meldung sichtbar — etwa, dass ein Link nicht mehr gilt.',
    suchen: '        <Startbild />\n        {meldung}\n',
    ersetzen: '        <Startbild />\n',
  },
  {
    id: 'oeffnen-meldung-bleibt-stehen',
    datei: 'src/app/AppShell.tsx',
    regel: 'Kommen die Daten, steht eine Meldung über dem Startbild weiter — an derselben Stelle im Baum, sonst liefe sie noch einmal ein.',
    suchen: '      {meldung}\n    </>\n',
    ersetzen: '      <div>{meldung}</div>\n    </>\n',
  },
  {
    id: 'oeffnen-startbild-vermerkt',
    datei: 'src/app/Startbild.tsx',
    regel: 'Solange das Startbild steht, ist es am Dokument vermerkt — daran hängt die Statusleiste der installierten App.',
    suchen: '    startbildMelden(true)\n',
    ersetzen: '    void startbildMelden\n',
  },
  {
    id: 'oeffnen-startbild-logo-mitte',
    datei: 'src/app/shell.css',
    regel: 'Das Logo im Startbild steht genau zwischen den sicheren Rändern.',
    suchen: '  grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);\n',
    ersetzen: '  grid-template-rows: auto;\n',
  },
  {
    id: 'oeffnen-startbild-vorab',
    datei: 'index.html',
    regel: 'index.html zeichnet das Startbild, bevor das Skript läuft — sonst stünde nach dem Bild von Android eine leere Fläche.',
    suchen: '<div id="root"><div class="startbild">',
    ersetzen: '<div id="root"><div class="startbild-entfernt">',
  },
  {
    id: 'oeffnen-startbild-vorab-gleich',
    datei: 'index.html',
    regel: 'Das Startbild in index.html ist dasselbe wie das der App — sonst springt das Logo, wenn React übernimmt.',
    suchen: '<g class="logo-voll">\n            <circle cx="171.33" cy="195.82" r="15"></circle>',
    ersetzen: '<g class="logo-voll">\n            <circle cx="170" cy="195.82" r="15"></circle>',
  },
  {
    id: 'oeffnen-startbild-statusleiste',
    datei: 'src/app/darstellung.ts',
    regel: 'Solange das Startbild steht, trägt die Statusleiste der installierten App sein Graphit — kein heller Streifen darüber.',
    suchen: "  if (steht) doc.documentElement.dataset.startbild = ''\n",
    ersetzen: '  if (steht) void doc\n',
  },
  {
    id: 'oeffnen-startbild-statusleiste-vorab',
    datei: 'index.html',
    regel: 'Schon vor dem Skript hat die Statusleiste der installierten App das Graphit des Startbilds.',
    suchen: "if (meta) meta.content = installiert ? '#1c1e20' : dunkel ?",
    ersetzen: "if (meta) meta.content = installiert ? '#121314' : dunkel ?",
  },
  {
    id: 'oeffnen-startbild-farben-android',
    datei: 'src/styles/tokens.css',
    regel: 'Das Startbild der installierten App hat den Grund des Bilds von Android (background_color) — sonst wechselt die Farbe, wenn die App übernimmt.',
    suchen: '    --start-grund: #1c1e20;\n',
    ersetzen: '    --start-grund: #121314;\n',
  },
  {
    id: 'oeffnen-mit-datenbank-offen',
    datei: 'src/app/store.tsx',
    regel: 'Mit Datenbank startet die App mit der offenen Frage, ob jemand angemeldet ist — sonst stünde die Anmeldung da, bis Supabase antwortet.',
    suchen: '    supabase ? { ...start(), sitzungPruefen: true } : start(),\n',
    ersetzen: '    start(),\n',
  },
  {
    id: 'oeffnen-pruefung-endet-immer',
    datei: 'src/app/store.tsx',
    regel: 'Die Prüfung beim Start endet auf jedem Weg — ohne Sitzung und nach einem Fehlschlag ebenso; sonst bliebe das Ladebild stehen und man käme nicht einmal zur Anmeldung.',
    suchen: "        if (!vorbei) dispatch({ type: 'sitzungGeprueft' })\n",
    ersetzen: '        void vorbei\n',
  },
  // Offline-Start (19.10.2026): der letzte Stand statt Warten und Anmeldung — nach über einer Stunde
  // (25 s Erneuerung) wie in der ersten (7 s Wiederholungen von PostgREST).
  {
    id: 'offline-start-sofort',
    datei: 'src/app/store.tsx',
    regel: 'Meldet das Gerät beim Start kein Netz und liegt ein Konto darauf, steht dessen letzter Stand sofort da — nicht erst nach dem Wecker.',
    suchen: '      if (navigator.onLine === false) vorgreifen(false)\n',
    ersetzen: '      if (navigator.onLine === null) vorgreifen(false)\n',
  },
  {
    id: 'offline-start-wecker',
    datei: 'src/app/store.tsx',
    regel: 'Antwortet Supabase nicht, obwohl das Gerät „online" meldet (WLAN ohne Internet, hängende Anfrage), steht der letzte Stand nach dem Wecker da.',
    suchen: '      else wecker = setTimeout(() => vorgreifen(true), VORGRIFF_NACH_MS)\n',
    ersetzen: '      else wecker = undefined\n',
  },
  {
    id: 'offline-start-nicht-mit-link',
    datei: 'src/app/store.tsx',
    regel: 'Solange ein Link aus der E-Mail anmeldet, greift nichts vor — angemeldet wird, wen der Link nennt, nicht wessen Sitzung noch auf dem Gerät liegt.',
    suchen: '    if (!token && vorab) {\n',
    ersetzen: '    if (vorab) {\n',
  },
  {
    id: 'offline-link-gescheitert-letzter-stand',
    datei: 'src/app/store.tsx',
    regel: 'Scheitert der Link am Netz, bleibt es bei der Sitzung, die da war — mit ihrem letzten Stand, nicht der Anmeldung.',
    suchen: '    const vorab = gespeicherteSitzung()\n',
    ersetzen: '    const vorab = token ? null : gespeicherteSitzung()\n',
  },
  {
    id: 'offline-start-nur-einmal',
    datei: 'src/app/store.tsx',
    regel: 'Vorgegriffen wird einmal — meldet die Prüfung danach noch einen Netzfehler, bleibt die Ansicht, statt auf den Start zurückzuspringen.',
    suchen: '      if (stateRef.current.sitzungPruefen) {\n',
    ersetzen: '      if (true) {\n',
  },
  {
    id: 'offline-start-wiederholbarer-fehler',
    datei: 'src/app/store.tsx',
    regel: 'Erreicht Supabase den Server nicht und liegt die Sitzung noch da, steht der letzte Stand — nicht die Anmeldung.',
    suchen: '      } else if (isAuthRetryableFetchError(error)) {\n',
    ersetzen: '      } else if (isAuthRetryableFetchError(null)) {\n',
  },
  {
    id: 'offline-start-ansicht-bleibt',
    datei: 'src/app/store.tsx',
    regel: 'Antwortet Supabase nach dem Vorgriff doch noch, bleibt die Ansicht, wo sie ist — kein Sprung zurück auf den Start.',
    suchen: "        if (stateRef.current.sitzungPruefen) dispatch({ type: 'login' })\n",
    ersetzen: "        dispatch({ type: 'login' })\n",
  },
  {
    id: 'offline-rueckkehr-laedt',
    datei: 'src/app/store.tsx',
    regel: 'Gelingt die Erneuerung des Tokens, während der letzte Stand oder die Fehlerseite steht, kommen die Daten.',
    suchen: "      else if (event === 'TOKEN_REFRESHED' && session) nachladen(session.user.id)\n",
    ersetzen: "      else if (event === 'TOKEN_REFRESHED' && session) void nachladen\n",
  },
  {
    id: 'offline-nachladen-nur-mit-ersatz',
    datei: 'src/app/store.tsx',
    regel: 'Nachgeladen wird nur, wenn statt der Daten der letzte Stand oder die Fehlerseite steht — im Alltag lädt weder die Erneuerung noch das Netz etwas nach.',
    suchen: '      if (ersatzSteht(userId) && laedtFuer !== userId) ladenBeginnen(userId)\n',
    ersetzen: '      if (laedtFuer !== userId) ladenBeginnen(userId)\n',
  },
  {
    id: 'offline-nachladen-nicht-daneben',
    datei: 'src/app/store.tsx',
    regel: 'Lädt es schon, stößt ein zweiter Anstoß (Netz zurück, Erneuerung) kein zweites Laden daneben an.',
    suchen: '      if (ersatzSteht(userId) && laedtFuer !== userId) ladenBeginnen(userId)\n',
    ersetzen: '      if (ersatzSteht(userId)) ladenBeginnen(userId)\n',
  },
  {
    id: 'offline-rueckkehr-auch-nach-laden',
    datei: 'src/app/store.tsx',
    regel: 'Auch wenn der letzte Stand nach einem gescheiterten Laden steht, holt die nächste Erneuerung die Daten — das Konto gilt dann nicht als geladen.',
    suchen: '      if (ersatzSteht(userId) && laedtFuer !== userId) ladenBeginnen(userId)\n',
    ersetzen: '      if (ersatzSteht(userId) && laedtFuer !== userId && userId !== geladenFuer) ladenBeginnen(userId)\n',
  },
  {
    id: 'offline-erneuerung-trotz-offline-meldung',
    datei: 'src/app/store.tsx',
    regel: 'Gelingt die Erneuerung, lädt es, auch wenn das Gerät noch „offline" meldet — sie ging übers Netz; sonst bliebe der letzte Stand stehen, auch nach „Neu laden".',
    suchen: '      if (ersatzSteht(userId) && laedtFuer !== userId) ladenBeginnen(userId)\n',
    ersetzen: '      if (ersatzSteht(userId) && laedtFuer !== userId && navigator.onLine !== false) ladenBeginnen(userId)\n',
  },
  {
    id: 'offline-netz-zurueck-laedt',
    datei: 'src/app/store.tsx',
    regel: 'Meldet das Gerät wieder Netz, kommen die Daten — mit gültigem Token käme sonst bis zu einer Stunde lang kein Anstoß.',
    suchen: "    window.addEventListener('online', wiederOnline)\n",
    ersetzen: '    void wiederOnline\n',
  },
  {
    id: 'offline-netz-zurueck-abgemeldet',
    datei: 'src/app/store.tsx',
    regel: 'Nach dem Abbauen hört niemand mehr auf das Netz — kein Laden in einen toten Baum.',
    suchen: "      window.removeEventListener('online', wiederOnline)\n",
    ersetzen: '',
  },
  {
    id: 'offline-laden-wartet-aufs-netz',
    datei: 'src/app/store.tsx',
    regel: 'Offline wird nicht geladen — die Abfragen wiederholten sich sieben Sekunden lang und scheiterten dann; geladen wird, sobald das Netz zurück ist.',
    suchen: '      if (navigator.onLine === false) {\n',
    ersetzen: '      if (navigator.onLine === null) {\n',
  },
  {
    id: 'offline-laden-zeigt-letzten-stand',
    datei: 'src/app/store.tsx',
    regel: 'Lädt es offline nicht, steht der letzte Stand dieses Kontos — auch nach einem Link, der am Netz scheiterte; sonst stünde eine leere App da.',
    suchen: '        if (!ersatzSteht(userId)) letztenStandZeigen(dispatch, userId)\n',
    ersetzen: '        void ersatzSteht\n',
  },
  {
    id: 'offline-laden-zeigt-ihn-einmal',
    datei: 'src/app/store.tsx',
    regel: 'Steht der letzte Stand schon (Vorgriff), wird er offline nicht noch einmal eingespielt — die Ansicht bleibt, wo sie ist.',
    suchen: '        if (!ersatzSteht(userId)) letztenStandZeigen(dispatch, userId)\n',
    ersetzen: '        letztenStandZeigen(dispatch, userId)\n',
  },
  {
    id: 'offline-vorgriff-daten',
    datei: 'src/app/store.tsx',
    regel: 'Lassen die Daten beim Start auf sich warten (WLAN ohne Internet), steht nach dem Wecker der letzte Stand statt der Welle.',
    suchen: '        momentaufnahmeZeigen(dispatch, vorab.userId, { langsam })\n',
    ersetzen: '        void momentaufnahmeZeigen\n',
  },
  {
    id: 'offline-vorgriff-daten-ohne-fehlerseite',
    datei: 'src/app/store.tsx',
    regel: 'Laden die Daten noch, zeigt der Wecker ohne Momentaufnahme keine Fehlerseite — das Startbild bleibt.',
    suchen: '        momentaufnahmeZeigen(dispatch, vorab.userId, { langsam })\n',
    ersetzen: '        letztenStandZeigen(dispatch, vorab.userId, { langsam })\n',
  },
  {
    id: 'offline-vorgriff-daten-nur-dieses-konto',
    datei: 'src/app/store.tsx',
    regel: 'Der Wecker zeigt den Stand des abgelegten Kontos nur, wenn dessen Daten laden — nicht über dem Laden eines anderen.',
    suchen: "      } else if (stateRef.current.dataStatus === 'loading' && laedtFuer === vorab.userId) {\n",
    ersetzen: "      } else if (stateRef.current.dataStatus === 'loading') {\n",
  },
  {
    id: 'offline-vorgriff-daten-nur-mit-startbild',
    datei: 'src/app/store.tsx',
    regel: 'Stehen die Daten schon, greift der Wecker nicht vor — auch wenn noch still nachgeladen wird.',
    suchen: "      } else if (stateRef.current.dataStatus === 'loading' && laedtFuer === vorab.userId) {\n",
    ersetzen: '      } else if (laedtFuer === vorab.userId) {\n',
  },
  {
    id: 'offline-rueckkehr-fehlerseite',
    datei: 'src/app/store.tsx',
    regel: 'Steht ohne Momentaufnahme die Fehlerseite, lädt die Erneuerung ebenso — nicht nur über dem letzten Stand.',
    suchen: " || stateRef.current.dataStatus === 'error'",
    ersetzen: '',
  },
  {
    id: 'offline-rueckkehr-still',
    datei: 'src/app/store.tsx',
    regel: 'Über dem letzten Stand kommen die Daten still — kein Startbild, und scheitert es, bleibt er stehen.',
    suchen: '      void loadAndHydrate(dispatch, userId, { silent: () => ueberDemLetztenStand(userId) }).finally(() => {\n',
    ersetzen: '      void loadAndHydrate(dispatch, userId, { silent: false }).finally(() => {\n',
  },
  {
    id: 'offline-rueckkehr-nur-eigenes-konto',
    datei: 'src/app/store.tsx',
    regel: 'Still lädt nur, wer über seinem eigenen letzten Stand steht — die Anmeldung eines anderen Kontos lädt sichtbar.',
    suchen: '      stateRef.current.userId === userId && stateRef.current.staleAt !== null\n',
    ersetzen: '      stateRef.current.staleAt !== null\n',
  },
  {
    id: 'gespeicherte-sitzung-gueltig',
    datei: 'src/lib/gespeicherte-sitzung.ts',
    regel: 'Ohne Erneuerungs-Token ist der Eintrag keine Sitzung — auth-js ließe ihn auch nicht gelten.',
    suchen: "    typeof s.refresh_token === 'string' &&\n",
    ersetzen: '',
  },
  {
    id: 'laden-still-erst-mit-der-antwort',
    datei: 'src/app/hydrate.ts',
    regel: 'Ob das Laden still ist, fragt es auch mit der Antwort — hat der Vorgriff inzwischen den letzten Stand gezeigt, kommen die Daten still darüber.',
    suchen: '  if (await ladenUndEinspielen(dispatch, userId, meine, still)) {\n',
    ersetzen: '  if (await ladenUndEinspielen(dispatch, userId, meine, ((anfangs) => () => anfangs)(still()))) {\n',
  },
  {
    id: 'momentaufnahme-sonst-nichts',
    datei: 'src/app/hydrate.ts',
    regel: 'Ohne Momentaufnahme zeigt der Vorgriff während des Ladens nichts — keine verfrühte Fehlerseite.',
    suchen: "  if (snap) dispatch({ type: 'hydrate', payload: snap.payload, staleAt: snap.at, ...(langsam ? { langsam: true as const } : {}) })\n",
    ersetzen: "  if (snap) dispatch({ type: 'hydrate', payload: snap.payload, staleAt: snap.at, ...(langsam ? { langsam: true as const } : {}) })\n  else dispatch({ type: 'setDataStatus', status: 'error', userId })\n",
  },
  {
    id: 'letzter-stand-sonst-fehlerseite',
    datei: 'src/app/hydrate.ts',
    regel: 'Ohne Momentaufnahme zeigt der letzte Stand die Fehlerseite — mit dem Konto, damit „Erneut versuchen" weiß, für wen.',
    suchen: "  if (!momentaufnahmeZeigen(dispatch, userId, wie)) dispatch({ type: 'setDataStatus', status: 'error', userId })\n",
    ersetzen: '  momentaufnahmeZeigen(dispatch, userId, wie)\n',
  },
  // Die Plätze füllen sich im Startbild (22.10.2026, statt der Welle vom 19.10.).
  {
    id: 'startbild-fuellen-erst-nach-pause',
    datei: 'src/app/Startbild.tsx',
    regel: 'Die Plätze im Startbild füllen sich erst nach einer Pause — ist die App schneller da, bleibt das ruhige Bild wie bei Android.',
    suchen: 'const FUELLEN_AB_MS = 500\n',
    ersetzen: 'const FUELLEN_AB_MS = 0\n',
  },
  {
    id: 'startbild-fuellen-nur-in-der-app',
    datei: 'index.html',
    regel: 'Die Plätze füllen sich nur im Startbild der App — im Bild aus index.html begänne es beim Wechsel zu React mit einem Ruck von vorn.',
    suchen: '<div id="root"><div class="startbild">',
    ersetzen: '<div id="root"><div class="startbild startbild-fuellen">',
  },
  {
    id: 'startbild-fuellen-zugleich-blass',
    datei: 'src/app/shell.css',
    regel: 'Im Startbild wird der ganze Saal zugleich blass, erst dann füllt er sich — nicht Reihe für Reihe leer und voll durcheinander.',
    suchen: '@keyframes startbild-voll-2 {\n  0% {\n    opacity: 1;\n    transform: scale(1);\n    animation-timing-function: ease-in-out;\n  }\n\n  12% {\n',
    ersetzen: '@keyframes startbild-voll-2 {\n  0% {\n    opacity: 1;\n    transform: scale(1);\n    animation-timing-function: ease-in-out;\n  }\n\n  20% {\n',
  },
  {
    id: 'startbild-fuellen-reihe-fuer-reihe',
    datei: 'src/app/shell.css',
    regel: 'Die Plätze füllen sich Reihe für Reihe nach hinten — sonst blinkt das Logo als Ganzes.',
    suchen: '  12.8%,\n  32% {\n',
    ersetzen: '  12.8%,\n  16% {\n',
  },
  {
    id: 'startbild-fuellen-jede-reihe',
    datei: 'src/app/shell.css',
    regel: 'Auch die hinterste Reihe des Startbilds hat ihren Ablauf — ohne ihn bliebe sie voll stehen, während der Saal blass wird.',
    suchen: '  .startbild-fuellen .logo-platz:nth-of-type(3) .logo-voll circle {\n    animation-name: startbild-voll-3;\n',
    ersetzen: '  .startbild-fuellen .logo-platz:nth-of-type(3) .logo-voll circle {\n    animation-name: none;\n',
  },
  {
    id: 'startbild-fuellen-mitte-nach-aussen',
    datei: 'src/app/shell.css',
    regel: 'In jeder Reihe füllen sich die Plätze von der Mitte nach außen, vom Pult weg.',
    suchen: '.startbild-fuellen .logo-platz:nth-of-type(3) circle:is(:first-child, :last-child) {\n    animation-delay: 105ms;\n',
    ersetzen: '.startbild-fuellen .logo-platz:nth-of-type(3) circle:is(:first-child, :last-child) {\n    animation-delay: 0ms;\n',
  },
  {
    id: 'startbild-fuellen-ohne-bewegung-still',
    datei: 'src/app/shell.css',
    regel: 'Ohne Bewegung hängt keine Animation am Logo des Startbilds — schon das Anhängen änderte die Kanten der Plätze, das ruhige Bild zuckte einmal.',
    suchen: '@media (prefers-reduced-motion: no-preference) {\n  .startbild-fuellen',
    ersetzen: '@media all {\n  .startbild-fuellen',
  },
  {
    id: 'startbild-fuellen-leer-bis-gedeckt',
    datei: 'src/app/shell.css',
    regel: 'Der leere Platz im Startbild bleibt, bis der volle ihn deckt — sonst blitzt die Reihe leer auf, bevor sie sich füllt.',
    suchen: '  12%,\n  31% {\n',
    ersetzen: '  12%,\n  20% {\n',
  },
  {
    id: 'startbild-fuellen-leer-ruhig-fort',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Ruhig zeigt das Logo im Startbild nur die vollen Plätze — ein leerer darunter machte die durchscheinenden hinteren Reihen kräftiger als im Logo.',
    suchen: '.logo-leer circle {\n  opacity: 0;\n',
    ersetzen: '.logo-leer circle {\n  opacity: 0.26;\n',
  },
  {
    id: 'startbild-wort-nie-sichtbar',
    datei: 'src/app/Startbild.tsx',
    regel: '„Lädt …" hören im Startbild nur Vorleseprogramme — zu sehen ist es nie; der Betreiber wollte das Wort nicht mehr sehen.',
    suchen: '      <p className="sr-only">{t.laedt}</p>\n',
    ersetzen: '      <p>{t.laedt}</p>\n',
  },
  {
    id: 'startbild-wort-auch-ohne-bewegung-fort',
    datei: 'src/app/shell.css',
    regel: 'Auch ohne Bewegung steht im Startbild kein „Lädt …" — keine Regel holt das Wort unter dem Logo hervor.',
    suchen: '.startbild-logo {\n  grid-row: 2;\n}\n',
    ersetzen: '.startbild-logo {\n  grid-row: 2;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .startbild .sr-only {\n    position: static;\n  }\n}\n',
  },
  // ── Erste Schritte: die Karte auf Start und der Film (22.10.2026) ──
  {
    id: 'erste-schritte-karte-auf-start',
    datei: 'src/dashboard/DashboardScreen.tsx',
    regel: 'Wer neu ist, findet oben auf Start die Karte „Erste Schritte" mit dem Film.',
    suchen: '          <ErsteSchritteKarte />\n',
    ersetzen: '',
  },
  {
    id: 'erste-schritte-im-profil',
    datei: 'src/profil/ProfilScreen.tsx',
    regel: 'Der Film „Erste Schritte" bleibt im Profil abrufbar, auch wenn die Karte auf Start fort ist.',
    suchen: '            <ErsteSchritteKnopf />\n',
    ersetzen: '',
  },
  {
    id: 'erste-schritte-weg-bleibt-weg',
    datei: 'src/erste-schritte/ErsteSchritteKarte.tsx',
    regel: 'Das ✕ nimmt die Karte „Erste Schritte" auf diesem Gerät für immer weg — auch nach dem nächsten Öffnen der App.',
    suchen: '  const wegklicken = () => {\n    merkeWeg()\n',
    ersetzen: '  const wegklicken = () => {\n',
  },
  {
    id: 'erste-schritte-gesehen-weg',
    datei: 'src/erste-schritte/ErsteSchritteKarte.tsx',
    regel: 'Wer den Film ganz gesehen hat, findet die Karte auf Start nicht mehr — auch nach dem nächsten Öffnen der App.',
    suchen: '            merkeWeg()\n            gesehen.current = true\n',
    ersetzen: '            gesehen.current = true\n',
  },
  {
    id: 'erste-schritte-angefangen-bleibt',
    datei: 'src/erste-schritte/ErsteSchritteKarte.tsx',
    regel: 'Wer den Film nur anfängt und schließt, findet die Karte wieder — gesehen hat er ihn nicht.',
    suchen: '            if (gesehen.current) setWeg(true)\n',
    ersetzen: '            setWeg(true)\n',
  },
  {
    id: 'erste-schritte-ohne-bewegung-still',
    datei: 'src/erste-schritte/ErsteSchritteFilm.tsx',
    regel: 'Ohne Bewegung (Einstellung des Geräts) läuft der Film nicht von selbst — man blättert Schritt für Schritt.',
    suchen: '    if (!stufenweise) steuerung.current.spielen()\n',
    ersetzen: '    steuerung.current.spielen()\n',
  },
  {
    id: 'erste-schritte-pause',
    datei: 'src/erste-schritte/ErsteSchritteFilm.tsx',
    regel: 'Der Film lässt sich anhalten — eine Bewegung über fünf Sekunden braucht eine Pause.',
    suchen: "    if (lage === 'laeuft') steuerung.current?.anhalten()\n",
    ersetzen: "    if (lage === 'pause') steuerung.current?.anhalten()\n",
  },
  {
    id: 'erste-schritte-ende-einmal',
    datei: 'src/erste-schritte/ErsteSchritteFilm.tsx',
    regel: 'Das Ende des Films zählt einmal — wer ihn nochmal ansieht, meldet es nicht zweimal.',
    suchen: '        if (!gemeldet) {\n',
    ersetzen: '        if (true) {\n',
  },
  {
    id: 'erste-schritte-zurueck',
    datei: 'src/erste-schritte/ErsteSchritteFilm.tsx',
    regel: 'Zurück schließt den Film, nicht die App.',
    suchen: '  useBackDismiss(true, beenden)\n',
    ersetzen: '  useBackDismiss(false, beenden)\n',
  },
  {
    id: 'erste-schritte-knopf-woertlich',
    datei: 'src/erste-schritte/ErsteSchritteFilm.tsx',
    regel: 'Die Worte des Films zitieren den Knopf der App wörtlich — wer „Bestätigen" sucht, liest „Bestätigen".',
    suchen: '              {fill(t.ersteSchritteAufgabeText, { knopf: t.bestaetigen })}\n',
    ersetzen: '              {fill(t.ersteSchritteAufgabeText, { knopf: t.bestaetigt })}\n',
  },
  {
    id: 'erste-schritte-ansage-zeilen',
    datei: 'src/erste-schritte/ErsteSchritteFilm.tsx',
    regel: 'Vorleseprogramme hören die Worte einer Szene Zeile für Zeile — „Schritt 1 von 4" stößt nicht an den Satz danach.',
    suchen: ".map((zeile) => zeile.textContent ?? '').join(' ')\n",
    ersetzen: ".map((zeile) => zeile.textContent ?? '').join('')\n",
  },
  {
    id: 'erste-schritte-bild-ohne-knopf',
    datei: 'src/erste-schritte/FilmBilder.tsx',
    regel: 'Im Bild des Films ist kein Knopf echt — nichts, das man antippen oder mit der Tastatur anspringen könnte.',
    suchen: '              <span className="fm-knopf-haupt" data-f="bestaetigen">\n                {t.bestaetigen}\n              </span>\n',
    ersetzen: '              <button className="fm-knopf-haupt" data-f="bestaetigen">\n                {t.bestaetigen}\n              </button>\n',
  },
  {
    id: 'erste-schritte-handy-unter-dem-kreuz',
    datei: 'src/erste-schritte/film-szenen.ts',
    regel: 'Steht das ✕ hochkant über der Bühne, beginnt das Handy darunter — sonst verdeckt es die Glocke beim Tipp.',
    suchen: '  const oben = ueberDerBuehne ? Math.max(RAND_OBEN, kreuz.bottom - b.top + 8) : RAND_OBEN\n',
    ersetzen: '  const oben = RAND_OBEN\n',
  },
  {
    id: 'erste-schritte-fenster-nur-hoch-genug',
    datei: 'src/erste-schritte/erste-schritte.css',
    regel: 'Der Film steht nur als Fenster in der Mitte, wo der Schirm hoch genug ist — ein großes Handy quer bekommt den ganzen Schirm.',
    suchen: '@media (min-width: 920px) and (min-height: 700px) {\n',
    ersetzen: '@media (min-width: 920px) {\n',
  },
  {
    id: 'erste-schritte-zeit-zum-lesen',
    datei: 'src/erste-schritte/film-zeit.ts',
    regel: 'Jede Szene des Films steht so lange, wie man ihre Worte liest — der Betreiber fand ihn ohne die Halte „etwas zu schnell".',
    suchen: "  { id: 'installieren', dauer: 5.5, standbild: 4.5, halte: [[1.44, 3], [4.45, 3.9]] },\n",
    ersetzen: "  { id: 'installieren', dauer: 5.5, standbild: 4.5, halte: [[1.44, 1], [4.45, 1]] },\n",
  },
  {
    id: 'erste-schritte-halt-ohne-sprung',
    datei: 'src/erste-schritte/film-zeit.ts',
    regel: 'Nach einem Halt läuft die Szene dort weiter, wo sie stand — sie springt nicht um die Dauer des Halts nach vorn.',
    suchen: '    t = Math.max(bei, t - dauer)\n',
    ersetzen: '    t = Math.max(bei, t)\n',
  },
  {
    id: 'erste-schritte-handy-steigt-im-halt',
    datei: 'src/erste-schritte/film-szenen.ts',
    regel: 'In einem Halt zum Lesen ruht das Bild nicht ganz: Das Handy steigt mit der Zeit des Films weiter.',
    suchen: '      handySetzen(handy, m, zeit)\n',
    ersetzen: '      handySetzen(handy, m, t)\n',
  },
  {
    id: 'erste-schritte-termin-wie-karte',
    datei: 'src/erste-schritte/film-inhalt.ts',
    regel: 'Der Film zeigt den Termin der Aufgabe so, wie die echte Karte ihn zeigt — in jeder Sprache dieselbe Uhrzeit.',
    suchen: "const UHRZEIT = '19:00'\n",
    ersetzen: "const UHRZEIT = '19.00'\n",
  },
  {
    id: 'erste-schritte-symbol-wie-app',
    datei: 'src/styles/tokens.css',
    regel: 'Das Symbol im Film hat die Farben der App-Datei — sonst suchte man danach ein Symbol, das es nicht gibt.',
    suchen: '  --symbol-grund: #1c1e20;\n',
    ersetzen: '  --symbol-grund: #121314;\n',
  },
  // ── Kein Bruch mitten im Wort, die Zahl bleibt bei ihrer Bezeichnung (T128) ──
  {
    id: 'umbruch-zahl-nach-doppelpunkt',
    datei: 'src/i18n/zahl-binden.ts',
    regel: 'Hinter „Bezeichnung:" bleibt die Zahl auf derselben Zeile — „Personen: 26" bricht nicht vor der 26 um.',
    suchen: "text.replace(/: (?=\\p{Nd})/gu, `:${NBSP}`)",
    ersetzen: 'text',
  },
  {
    id: 'umbruch-zahl-vor-wort',
    datei: 'src/i18n/zahl-binden.ts',
    regel: 'Eine Zahl bleibt beim Wort danach — „3 kişi", „1 Tag vorher", „7. September".',
    suchen: ".replace(/(\\p{Nd}\\.?) (?=\\p{L})/gu, `$1${NBSP}`)",
    ersetzen: '',
  },
  {
    id: 'umbruch-fill-bindet',
    datei: 'src/i18n/useT.ts',
    regel: 'Jede Vorlage bindet ihre Zahlen — `fill` schützt sie in allen zwölf Sprachen, ohne dass ein Text daran denken muss.',
    suchen: '  return zahlBinden(template.replace(',
    ersetzen: '  return (template.replace(',
  },
  {
    id: 'umbruch-kopfzeile-tag-und-monat',
    datei: 'src/components/datum-anzeige.ts',
    regel: 'Im Datum der Kopfzeile bleiben Tag und Monat zusammen — „7.|September" bricht nicht um.',
    suchen: "        : teil.value.replaceAll(' ', NBSP),\n",
    ersetzen: '        : teil.value,\n',
  },
  {
    id: 'umbruch-kopfzeile-am-wochentag',
    datei: 'src/components/datum-anzeige.ts',
    regel: 'Neben dem Wochentag bleibt das Datum umbrechbar — sonst stünde „lundi 7 septembre" in einem Stück.',
    suchen: "teil.type !== 'literal' || teile[i - 1]?.type === 'weekday' || teile[i + 1]?.type === 'weekday'",
    ersetzen: "teil.type !== 'literal'",
  },
  {
    id: 'umbruch-kopfzeile-zeigt-gebundenen-tag',
    datei: 'src/app/AppShell.tsx',
    regel: 'Die Kopfzeile jedes Bildschirms zeigt den Tag mit gebundenem Tag und Monat.',
    suchen: 'datum={kopfzeilenTag(fromIso(tag), state.lang)}',
    ersetzen: "datum={kopfzeilenTag(fromIso(tag), state.lang).replaceAll(String.fromCharCode(0xa0), ' ')}",
  },
  {
    id: 'umbruch-einstellungen-stellen-um',
    datei: 'src/einstellungen/einstellungen.css',
    regel: 'Eine Karte der Einstellungen misst sich selbst — bei großer Schrift steht der Wert unter dem Namen.',
    suchen: '  container-type: inline-size;\n  padding-block-start: 6px;\n',
    ersetzen: '  padding-block-start: 6px;\n',
  },
  {
    id: 'umbruch-leiste-waechst',
    datei: 'src/app/menue.css',
    regel: 'Die Leiste am Desktop wächst mit der Schrift — bei 248 px brach „Powiadomienia" neben dem Zähler.',
    suchen: '  width: max(248px, calc(124px * (1 + var(--fs))));\n',
    ersetzen: '  width: 248px;\n',
  },
  {
    id: 'umbruch-personen-spalte-gibt-nach',
    datei: 'src/personen/personen.css',
    regel: 'Was die Leiste bei großer Schrift dazugewinnt, gibt die Person neben der Personenliste ab — sonst brach dort „Ackermann|, Stefan".',
    suchen: '  grid-template-columns: minmax(0, 1fr) calc(420px - 124px * max(0, var(--fs) - 1));\n',
    ersetzen: '  grid-template-columns: minmax(0, 1fr) 420px;\n',
  },
  {
    id: 'umbruch-schmale-leiste-waechst',
    datei: 'src/app/menue.css',
    regel: 'Die schmale Leiste am Tablet wächst mit der Schrift — bei 88 px brachen die Namen mitten im Wort.',
    suchen: '  width: calc(88px * max(1, var(--fs)));\n',
    ersetzen: '  width: 88px;\n',
  },
  {
    id: 'umbruch-seitentitel-trennt',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Der Titel einer Seite trennt ein langes Wort, statt die Seite zu verbreitern.',
    suchen: '  letter-spacing: -0.02em;\n  -webkit-hyphens: auto;\n  hyphens: auto;\n  overflow-wrap: break-word;\n',
    ersetzen: '  letter-spacing: -0.02em;\n',
  },
  {
    id: 'umbruch-seitentitel-knopf-rueckt',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Steht ein Knopf neben dem Titel, rückt der Knopf in die nächste Zeile, bevor der Titel trennt — sonst „Perso-nen".',
    suchen: '.mitteilungen-kopf > .seitentitel {\n  flex-shrink: 0;\n',
    ersetzen: '.mitteilungen-kopf > .seitentitel {\n',
  },
  {
    id: 'umbruch-personen-kopf-bricht-um',
    datei: 'src/personen/personen.css',
    regel: 'Im Kopf der Personen rückt „Person anlegen" unter den Titel, wenn beide nicht nebeneinander passen.',
    suchen: '  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px 12px;\n',
    ersetzen: '  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px 12px;\n',
  },
  {
    id: 'umbruch-blattfuss-umbrechen',
    datei: 'src/components/overlays.css',
    regel: 'Passen zwei Knöpfe im Fuß eines Blatts nicht nebeneinander, rückt der letzte nach unten, statt dass der erste hinausragt.',
    suchen: '  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n',
    ersetzen: '  display: flex;\n  justify-content: flex-end;\n',
  },
  {
    id: 'umbruch-spur-name-trennt',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Ein Schritt der Spur trennt seinen Namen nach den Regeln der Sprache — seit das Menü mit der Schrift wächst, brach „Подтверждени|я".',
    suchen: '  font-weight: 500;\n  -webkit-hyphens: auto;\n  hyphens: auto;\n  overflow-wrap: anywhere;\n',
    ersetzen: '  font-weight: 500;\n  overflow-wrap: anywhere;\n',
  },
  {
    id: 'umbruch-platz-rolle-darunter',
    datei: 'src/planen/planen.css',
    regel: 'Beim Planen rückt die Rolle unter den Namen, wenn beide nicht nebeneinander passen — sonst brach der Name mitten im Wort.',
    suchen: '.platz {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.platz {\n  display: flex;\n',
  },
  {
    id: 'umbruch-platz-name-laengstes-wort',
    datei: 'src/planen/planen.css',
    regel: 'Ein Name wird nicht schmaler als sein längstes Wort — er bricht zwischen Vor- und Nachname, nicht mitten im Namen.',
    suchen: '  flex: 1 1 0;\n  max-width: calc(100% - 24px);\n',
    ersetzen: '  min-width: 0;\n',
  },
  {
    id: 'umbruch-erinnerung-einstellung-darunter',
    datei: 'src/einstellungen/erinnerungen.css',
    regel: 'In den Erinnerungen rückt die Einstellung unter den Text, wenn beide nicht nebeneinander passen.',
    suchen: '.erin-inhalt {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.erin-inhalt {\n  display: flex;\n',
  },
  {
    id: 'umbruch-erinnerung-gemeinsamer-behaelter',
    datei: 'src/einstellungen/ErinnerungenInhalt.tsx',
    regel: 'Text und Einstellung eines Schritts stehen im selben Behälter — nur dann rückt die Einstellung darunter.',
    suchen: '        </div>\n        {steuer}\n      </div>\n',
    ersetzen: '        </div>\n      </div>\n      {steuer}\n',
  },
  {
    id: 'umbruch-polnisch-trennstelle',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch hat in Chrome keine Trennregeln — „Przypomnienia" trennt als Titel an seinem weichen Trennzeichen.',
    suchen: '"erinnerungenCard": "Przypo' + String.fromCharCode(92) + 'u00admnienia",',
    ersetzen: '"erinnerungenCard": "Przypomnienia",',
  },
  {
    id: 'umbruch-tuerkisch-trennstelle',
    datei: 'src/i18n/overlays/tr.ts',
    regel: 'Türkisch hat in Chrome keine Trennregeln — „Değerlendirme" trennt an seinem weichen Trennzeichen.',
    // Die Escape-Folge aus Zeichencodes: so steht sie wörtlich im Muster.
    suchen: '"navAuswertung": "Değerlen' + String.fromCharCode(92) + 'u00addirme",',
    ersetzen: '"navAuswertung": "Değerlendirme",',
  },
  // ── Rest aus T128 (20.10.2026): Wahl, Spannen, Sprache der Programmtexte, Zeilen mit Schwelle ──
  {
    id: 'umbruch-wahl-rueckt-um',
    datei: 'src/bausteine/bausteine.css',
    regel: 'In der Wahl rückt eine Möglichkeit in die nächste Zeile, wenn ihr längstes Wort nicht mehr in ihren Anteil passt — sonst brach „Ciem|ny".',
    suchen: '.wahl {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.wahl {\n  display: flex;\n',
  },
  {
    id: 'umbruch-wahl-laengstes-wort',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Ein Knopf der Wahl wird nicht schmaler als sein längstes Wort — „wcześni|ej" brach, solange er es durfte.',
    suchen: '.wahl-knopf {\n  flex: 1 1 0;\n  max-width: 100%;\n',
    ersetzen: '.wahl-knopf {\n  flex: 1 1 0;\n  min-width: 0;\n  max-width: 100%;\n',
  },
  {
    id: 'umbruch-wahl-klein-ganz',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Vier kleine Möglichkeiten rücken als Ganzes um — sonst stand „Grupa 1" neben „Grupa / 2".',
    suchen: '.wahl--klein .wahl-knopf {\n  flex-basis: auto;\n',
    ersetzen: '.wahl--klein .wahl-knopf {\n',
  },
  {
    id: 'umbruch-tagespanne-gebunden',
    datei: 'src/components/datum-anzeige.ts',
    regel: 'In einer Spanne von Tagen bleiben Tag und Monat zusammen — „So., 4.|Oktober" brach bei den Abwesenheiten im Profil.',
    suchen: '  return zahlBinden(von === bis ? fmt.format(fromIso(von)) : fmt.formatRange(fromIso(von), fromIso(bis)))\n',
    ersetzen: '  return von === bis ? fmt.format(fromIso(von)) : fmt.formatRange(fromIso(von), fromIso(bis))\n',
  },
  {
    id: 'umbruch-wochenspanne-gebunden',
    datei: 'src/components/datum-anzeige.ts',
    regel: 'In der Spanne einer Woche bleiben Tag und Monat zusammen — „5–11|octobre" brach in den Wochenkarten.',
    suchen: "  return zahlBinden(datumsFormat(lang, 'tagMonat').formatRange(fromIso(montag), fromIso(tagNach(montag, 6))))\n",
    ersetzen: "  return datumsFormat(lang, 'tagMonat').formatRange(fromIso(montag), fromIso(tagNach(montag, 6)))\n",
  },
  {
    id: 'umbruch-zeitspanne-gebunden',
    datei: 'src/components/datum-anzeige.ts',
    regel: 'Eine Anzahl Tage, Wochen oder Monate bleibt bei ihrem Wort — „12|miesięcy" brach in der Wahl der Auswertung.',
    suchen: "  return zahlBinden(new Intl.NumberFormat(LOCALES[lang as Lang] ?? lang, { style: 'unit', unit: einheit, unitDisplay: 'long' }).format(n))\n",
    ersetzen: "  return new Intl.NumberFormat(LOCALES[lang as Lang] ?? lang, { style: 'unit', unit: einheit, unitDisplay: 'long' }).format(n)\n",
  },
  {
    id: 'umbruch-programmspanne-gebunden',
    datei: 'src/i18n/useT.ts',
    regel: 'Die Spanne einer Woche aus dem Arbeitsheft bindet Tag und Monat — „7.–13.|September" brach in den Wochenkarten am Desktop.',
    suchen: '  return zahlBinden(p.tpw(p.week.range))\n',
    ersetzen: '  return p.tpw(p.week.range)\n',
  },
  {
    id: 'umbruch-programmsprache-variante',
    datei: 'src/i18n/useT.ts',
    regel: 'Zeigt die Woche ihre Sprachvariante, stehen die Programmtexte in der Sprache der App — und so trennt sie der Browser.',
    suchen: '{ week: merged, tpw: tu, sprache: lang }',
    ersetzen: '{ week: merged, tpw: tu, sprache }',
  },
  {
    id: 'umbruch-programmsprache-versammlung',
    datei: 'src/i18n/langs.ts',
    regel: 'Ohne Sprachvariante stehen die Programmtexte in der Sprache der Versammlung — und so trennt sie der Browser.',
    suchen: "  return congLang || 'de'\n",
    ersetzen: "  return 'de'\n",
  },
  {
    id: 'umbruch-programmtext-lang',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Ein Programmpunkt trägt die Sprache des Programms als `lang` — eine russische App trennte sonst „Versammlungsbibelstudium" russisch.',
    suchen: '      <div className="prog-row-text" lang={sprache}>\n',
    ersetzen: '      <div className="prog-row-text">\n',
  },
  {
    id: 'umbruch-planen-titel-lang',
    datei: 'src/planen/MeetingSection.tsx',
    regel: 'Beim Planen trägt der Titel eines Punkts die Sprache des Programms als `lang`.',
    suchen: '                <div className="prog-title" lang={sprache}>\n',
    ersetzen: '                <div className="prog-title">\n',
  },
  {
    id: 'umbruch-holen-knopf-darunter',
    datei: 'src/planen/planen.css',
    regel: 'In der Karte „Holen" rückt der Knopf unter den Hinweis, wenn beide nicht nebeneinander passen — sonst ragte der Text in der Spalte der Wochen hinaus.',
    suchen: '.holen-karte {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.holen-karte {\n  display: flex;\n',
  },
  {
    id: 'umbruch-personen-zelle-darunter',
    datei: 'src/personen/personen.css',
    regel: 'In der Personenliste am Desktop rückt eine Zelle darunter, statt mitten im Wort zu brechen — „Dienstamtgehi|lfe" bei 1180 px.',
    suchen: '.personen-zellen {\n  display: flex;\n  flex: 1;\n  flex-wrap: wrap;\n',
    ersetzen: '.personen-zellen {\n  display: flex;\n  flex: 1;\n',
  },
  {
    id: 'umbruch-personen-liste-stapelt',
    datei: 'src/personen/personen.css',
    regel: 'Ist die Personenliste für die Schrift zu schmal, steht in jeder Zeile der Name über Gruppe und Stand.',
    suchen: '@container personen-liste (max-width: 24em) {\n  .personen-zelle.personen-name {\n    flex-basis: 100%;\n',
    ersetzen: '@container personen-liste (max-width: 24em) {\n  .personen-zelle.personen-name {\n',
  },
  {
    id: 'umbruch-dienst-spalte-waechst',
    datei: 'src/programm/programm.css',
    regel: 'Die Spalte eines Hilfsdienstes wächst mit der Schrift — mit 132 px brach bei 768 px und Stufe 1,3 „Eingangsordne|r".',
    suchen: '  grid-template-columns: minmax(0, calc(132px * var(--fs))) minmax(0, 1fr);\n',
    ersetzen: '  grid-template-columns: minmax(0, 132px) minmax(0, 1fr);\n',
  },
  {
    id: 'umbruch-dienst-stapelt',
    datei: 'src/programm/programm.css',
    regel: 'Eine Zeile der Hilfsdienste misst sich selbst — wird sie für die Schrift zu schmal, steht der Dienst über den Namen.',
    suchen: '.prog-dienst {\n  container-type: inline-size;\n',
    ersetzen: '.prog-dienst {\n',
  },
  {
    id: 'umbruch-kacheln-stapeln',
    datei: 'src/auswertung/auswertung.css',
    regel: 'Die Kacheln der Auswertung messen ihre Zeile — passt das längste Wort nicht in die halbe, steht jede allein.',
    suchen: '.aw-kacheln {\n  container-type: inline-size;\n',
    ersetzen: '.aw-kacheln {\n',
  },
  {
    id: 'umbruch-trolley-kopf-trennt',
    datei: 'src/trolleys/trolleys.css',
    regel: 'Name und Ort über einer Spalte des Trolley-Tags trennen — die Spalte ist so breit wie die des Plans, „Königreichssaal" ragte hinaus.',
    suchen: '.trolley-spaltenkopf > * {\n  -webkit-hyphens: auto;\n  hyphens: auto;\n',
    ersetzen: '.trolley-spaltenkopf > * {\n',
  },
  {
    id: 'umbruch-trolley-kopf-sprache',
    datei: 'src/trolleys/TrolleyTag.tsx',
    regel: 'Name und Ort eines Trolleys trennen nach der Sprache der Versammlung — eine englische App brach sonst „Königreic|hssaal".',
    suchen: '<span key={tr.id} className="trolley-spaltenkopf" lang={sprache}>',
    ersetzen: '<span key={tr.id} className="trolley-spaltenkopf">',
  },
  {
    id: 'umbruch-trolley-woche-sprache',
    datei: 'src/trolleys/TrolleyWoche.tsx',
    regel: 'Am Desktop trennt der Name eines Trolleys ebenso nach der Sprache der Versammlung.',
    suchen: '<span className="trolley-spaltenkopf-name" dir="auto" lang={sprache}>',
    ersetzen: '<span className="trolley-spaltenkopf-name" dir="auto">',
  },
  {
    id: 'umbruch-trolley-woche-ort-sprache',
    datei: 'src/trolleys/TrolleyWoche.tsx',
    regel: 'Am Desktop trennt der Ort im Satz „abholen: …" nach der Sprache der Versammlung — eine englische App brach „Königreichss|aal".',
    suchen: '                <span lang={sprache}>{tr.ort}</span>\n',
    ersetzen: '                <span>{tr.ort}</span>\n',
  },
  {
    id: 'umbruch-termin-gebunden',
    datei: 'src/i18n/useT.ts',
    regel: 'Im Termin einer Zusammenkunft bleiben Tag und Monat zusammen — bei 320 px brach „Dienstag, 8.|September".',
    suchen: "  return zahlBinden([tpw(meetingDateText(rawWeek, tab, zeiten)), tpw(ende)].filter(Boolean).join(' · '))\n",
    ersetzen: "  return [tpw(meetingDateText(rawWeek, tab, zeiten)), tpw(ende)].filter(Boolean).join(' · ')\n",
  },
  {
    id: 'umbruch-termin-eine-stelle',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Das Programm nimmt den gebundenen Termin aus `programmTermin` — nicht einen eigenen, ungebundenen.',
    suchen: '  const termin = programmTermin(tpw, rawWeek, mtab(tab), state.congregation.times, meeting.end)\n',
    ersetzen: "  const termin = programmTermin(tpw, rawWeek, mtab(tab), state.congregation.times, meeting.end).replaceAll(String.fromCharCode(0xa0), ' ')\n",
  },
  {
    id: 'umbruch-termin-lang',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Der Termin einer Zusammenkunft steht in der Sprache des Programms und trägt sie als `lang`.',
    suchen: '        <p className="prog-meta" lang={sprache}>\n',
    ersetzen: '        <p className="prog-meta">\n',
  },
  {
    id: 'umbruch-tag-kopf-lang',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Am Desktop trägt das Datum über dem Programm eines Tages die Sprache des Programms als `lang`.',
    suchen: '<h2 id={titelId} className="prog-tag-datum" lang={sprache}>',
    ersetzen: '<h2 id={titelId} className="prog-tag-datum">',
  },
  {
    id: 'umbruch-zuteilen-titel-lang',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Im Zuteilen-Blatt trägt der Punkt die Sprache des Programms — sein Titel trennt, die Rolle dahinter steht in der des Lesers.',
    suchen: '        <span lang={item ? sprache : undefined}>{punkt}</span>\n',
    ersetzen: '        <span>{punkt}</span>\n',
  },
  {
    id: 'umbruch-auswertung-zeitraum-gebunden',
    datei: 'src/auswertung/AuswertungScreen.tsx',
    regel: 'Die Spanne über der Auswertung bindet ihre Zahlen — bei 320 px brach „2026|г.".',
    suchen: "  const spanne = tageSpanne(von, tagNach(bis, -1), k.lang, 'tagKurzJahr')\n",
    ersetzen: "  const spanne = datumsFormat(k.lang, 'tagKurzJahr').formatRange(fromIso(von), fromIso(tagNach(bis, -1)))\n",
  },
  {
    id: 'umbruch-gb-zeile-umbruch',
    datei: 'src/components/gruppenbesuche.css',
    regel: 'Beim Planen der Gruppenbesuche rückt die Gruppe unter die gebundene Woche, statt dass die Woche hinausragt.',
    suchen: '.gb-zeile-inhalt {\n  display: flex;\n  flex: 1;\n  flex-wrap: wrap;\n',
    ersetzen: '.gb-zeile-inhalt {\n  display: flex;\n  flex: 1;\n',
  },
  {
    id: 'umbruch-gb-liste-umbruch',
    datei: 'src/programm/programm.css',
    regel: 'In „Alle Besuche" rückt die Gruppe unter die gebundene Woche, statt dass die Woche hinausragt.',
    suchen: '.gb-liste-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.gb-liste-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-abw-zeile-umbruch',
    datei: 'src/components/components.css',
    regel: 'Bei einer Abwesenheit rückt das ✕ unter den gebundenen Zeitraum, statt dass „13. September" hinausragt.',
    suchen: '.abw-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.abw-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-wp-vorschau-umbruch',
    datei: 'src/components/weitere-plaene.css',
    regel: 'In der Vorschau eines Weiteren Plans rückt die Gruppenwahl unter die gebundene Woche — sonst ragte „19–25 ottobre" 100 px hinaus.',
    suchen: '.wp-vorschau-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.wp-vorschau-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-wp-liste-umbruch',
    datei: 'src/components/weitere-plaene.css',
    regel: 'Beim Ansehen eines Weiteren Plans rückt die Gruppe unter die gebundene Woche.',
    suchen: '.wp-liste-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.wp-liste-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-holen-kopf-umbruch',
    datei: 'src/planen/planen.css',
    regel: 'Im Blatt „Holen" rückt neben der gebundenen Spanne die Zahl der Punkte darunter.',
    suchen: '.holen-sprachen {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.holen-sprachen {\n  display: flex;\n',
  },
  {
    id: 'umbruch-kennzahl-rueckt-um',
    datei: 'src/auswertung/auswertung.css',
    regel: 'Eine Kennzahl der Auswertung rückt in die nächste Zeile, wenn ihre Beschriftung nicht mehr passt — sonst brach „Zuteilung|en".',
    suchen: '.aw-kennzahlen {\n  display: flex;\n  flex-flow: row wrap;\n',
    ersetzen: '.aw-kennzahlen {\n  display: flex;\n  flex-flow: row;\n',
  },
  {
    id: 'kennzahlen-als-zeile',
    datei: 'src/auswertung/auswertung.css',
    regel: 'Die Kennzahlen stehen als Zeile, nicht in der Richtung der Karte — als Spalte stand am Desktop jede Zahl 180 px hoch.',
    suchen: '  flex-flow: row wrap;\n  gap: 8px;\n  padding: 16px 18px;\n',
    ersetzen: '  flex-wrap: wrap;\n  gap: 8px;\n  padding: 16px 18px;\n',
  },
  {
    id: 'umbruch-hinweis-trennt',
    datei: 'src/auswertung/auswertung.css',
    regel: 'Ein Hinweis der Auswertung trennt lange Wörter nach der Sprache, statt hinauszuragen.',
    suchen: '  font-size: calc(13.5px * var(--fs));\n  line-height: 1.4;\n  -webkit-hyphens: auto;\n  hyphens: auto;\n',
    ersetzen: '  font-size: calc(13.5px * var(--fs));\n  line-height: 1.4;\n',
  },
  {
    id: 'umbruch-reiter-trennt',
    datei: 'src/components/components.css',
    regel: 'Der Wochentag eines Reiters trennt nach den Regeln der Sprache — „воскресен|ье" brach bei 320 px.',
    suchen: '.meeting-tab-name {\n  font-weight: 500;\n  -webkit-hyphens: auto;\n  hyphens: auto;\n',
    ersetzen: '.meeting-tab-name {\n  font-weight: 500;\n',
  },
  {
    id: 'umbruch-gebundenes-datum',
    datei: 'src/components/datum-anzeige.ts',
    regel: 'Ein Tag in Worten bindet seine Zahl an ihr Wort — „Mi., 9.|Sept." bricht nicht.',
    suchen: '  return zahlBinden(datumsFormat(lang, format).format(datum))\n',
    ersetzen: '  return datumsFormat(lang, format).format(datum)\n',
  },
  {
    id: 'umbruch-trolley-tag-kurz-gebunden',
    datei: 'src/trolleys/trolley-anzeige.ts',
    regel: 'In den Zeilen der Trolleys bleiben Tag und Monat zusammen — bei 320 px brach „Mi., 9.|Sept.".',
    suchen: "  return gebundenesDatum(fromIso(datum), lang, 'kurzerTag')\n",
    ersetzen: "  return gebundenesDatum(fromIso(datum), lang, 'kurzerTag').replaceAll(String.fromCharCode(0xa0), ' ')\n",
  },
  {
    id: 'umbruch-trolley-tag-lang-gebunden',
    datei: 'src/trolleys/trolley-anzeige.ts',
    regel: 'Über dem Tag der Trolleys bleibt die Zahl bei ihrem Wort — bei 320 px brach „Montag, 7.|September".',
    suchen: "  return gebundenesDatum(fromIso(datum), lang, 'tag')\n",
    ersetzen: "  return gebundenesDatum(fromIso(datum), lang, 'tag').replaceAll(String.fromCharCode(0xa0), ' ')\n",
  },
  {
    id: 'umbruch-trolley-zeile-umbruch',
    datei: 'src/trolleys/trolleys.css',
    regel: 'In den Zeilen der Trolleys rückt „Dazukommen" unter Tag und Zeit, wenn beides nicht nebeneinander passt.',
    suchen: '.trolley-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.trolley-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-gb-termin-gebunden',
    datei: 'src/planen/GruppenbesuchePlan.tsx',
    regel: 'Beim Planen der Gruppenbesuche bleiben Tag und Monat des Termins zusammen.',
    suchen: "gebundenesDatum(datum, state.lang, 'kurzerTag')",
    ersetzen: "gebundenesDatum(datum, state.lang, 'kurzerTag').replaceAll(String.fromCharCode(0xa0), ' ')",
  },
  {
    id: 'umbruch-polnisch-partner-trennstelle',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch hat in Chrome keine Trennregeln — „współpracownik" trennt als Titel der Karte an seinem weichen Trennzeichen.',
    suchen: '"trolleyPartnerGesucht": "Potrzebny współ' + String.fromCharCode(92) + 'u00adpracownik",',
    ersetzen: '"trolleyPartnerGesucht": "Potrzebny współpracownik",',
  },
  // ── Aus dem Review des Rests (20.10.2026): Aufgaben, Blatt-Titel, vergangene Besuche ──
  {
    id: 'umbruch-aufgaben-termin-gebunden',
    datei: 'src/i18n/useT.ts',
    regel: 'Der Termin einer Aufgabe bindet Tag und Monat — auf dem Start und unter „Meine Aufgaben" brach bei 320 px „22.|September".',
    suchen: '  return zahlBinden(aufgabenTp(task, i18n)(task.date))\n',
    ersetzen: '  return aufgabenTp(task, i18n)(task.date)\n',
  },
  {
    id: 'umbruch-aufgaben-wann-eine-stelle',
    datei: 'src/aufgaben/aufgabe-anzeige.ts',
    regel: '„Wann" einer Aufgabe nimmt den gebundenen Termin aus `aufgabenTermin` — nicht einen eigenen, ungebundenen.',
    suchen: '  return mitAbstand(aufgabenTermin(task, i18n), task.at, lang)\n',
    ersetzen: "  return mitAbstand(aufgabenTermin(task, i18n).replaceAll(String.fromCharCode(0xa0), ' '), task.at, lang)\n",
  },
  {
    id: 'umbruch-aufgaben-zeile-umbruch',
    datei: 'src/aufgaben/aufgaben.css',
    regel: 'Unter „Meine Aufgaben" rückt Haken, Pfeil oder „Übernehmen" unter den Text, wenn beides nicht nebeneinander passt.',
    suchen: '.aufgaben-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.aufgaben-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-aufgaben-angebot-mindestbreite',
    datei: 'src/aufgaben/aufgaben.css',
    regel: 'Der Text eines Angebots wird in der Zeile nicht schmaler als sein längstes Wort — `.angebot-text` setzte sonst `min-width: 0`.',
    suchen: '  flex: 1 1 0;\n  min-width: auto;\n',
    ersetzen: '  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-aufgabe-blatt-titel-lang',
    datei: 'src/aufgaben/AufgabeBlatt.tsx',
    regel: 'Im Blatt einer Aufgabe trägt der Programmpunkt die Sprache des Programms — der Titel trennt nach ihren Regeln.',
    suchen: '<span lang={aufgabenSprache(task, state.lang, state.congLang)}>{titel}</span>',
    ersetzen: '<span>{titel}</span>',
  },
  {
    id: 'umbruch-aufgabe-titel-ist-punkt',
    datei: 'src/i18n/useT.ts',
    regel: 'Steht oben die Rolle (kein Programmpunkt), trägt der Titel keine Sprache des Programms — er steht in der des Lesers.',
    suchen: "  if (!punkt) return { titel: rolle, unter: partner, titelIstPunkt: false }\n",
    ersetzen: "  if (!punkt) return { titel: rolle, unter: partner, titelIstPunkt: true }\n",
  },
  {
    id: 'umbruch-aufgaben-sprache-variante',
    datei: 'src/i18n/useT.ts',
    regel: 'Liegt die Woche einer Aufgabe in der Sprache des Lesers vor, trägt ihr Titel diese Sprache.',
    suchen: '  return task.lesersprache ? lang : versammlungsSprache(congLang)\n',
    ersetzen: '  return versammlungsSprache(congLang)\n',
  },
  {
    id: 'umbruch-programmpunkt-titel-lang',
    datei: 'src/planen/ProgrammBlatt.tsx',
    regel: 'Im Blatt eines Programmpunkts trägt der Titel die Sprache des Programms — „Versammlungsbibelstudium" trennte sonst russisch.',
    suchen: '      title={<span lang={sprache}>{titelText}</span>}\n',
    ersetzen: '      title={<span>{titelText}</span>}\n',
  },
  {
    id: 'umbruch-abstand-gebunden',
    datei: 'src/i18n/relative-time.ts',
    regel: 'Der Abstand in Worten bindet Zahl und Wort — unter „Meine Aufgaben" brach bei 320 px „Dentro de 15|días".',
    suchen: "    return zahlBinden(new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day'))\n",
    ersetzen: "    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')\n",
  },
  {
    id: 'umbruch-wochen-her-gebunden',
    datei: 'src/i18n/relative-time.ts',
    regel: '„vor 12 Wochen" im Zuteilen-Blatt bindet Zahl und Wort.',
    suchen: "    return zahlBinden(new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-wochen, 'week'))\n",
    ersetzen: "    return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-wochen, 'week')\n",
  },
  {
    id: 'umbruch-zu-bestaetigen-gebunden',
    datei: 'src/aufgaben/AufgabenScreen.tsx',
    regel: '„Zu bestätigen: 5" bindet die Zahl an ihre Bezeichnung — bei 320 px brach „Чекають на підтвердження: |5".',
    suchen: '{zahlBinden(`${t.dashZuBest}: ${zuBestaetigen}`)}',
    ersetzen: '{`${t.dashZuBest}: ${zuBestaetigen}`}',
  },
  {
    id: 'umbruch-besetzung-gebunden',
    datei: 'src/planen/WochenStand.tsx',
    regel: '„Besetzung: 12/20" auf der Karte der Woche bindet die Zahl an ihre Bezeichnung.',
    suchen: '  const zahl = zahlBinden(`${t.saalBesetzung}: ${besetzt}/${gesamt}`)\n',
    ersetzen: '  const zahl = `${t.saalBesetzung}: ${besetzt}/${gesamt}`\n',
  },
  {
    id: 'umbruch-automatisch-besetzung-gebunden',
    datei: 'src/planen/AutomatischBlatt.tsx',
    regel: 'Im Blatt „Automatisch" bindet „Besetzung: 15/15" die Zahl — bei 320 px brach „cubiertos: |15/15".',
    suchen: '{zahlBinden(`${t.saalBesetzung}: ${stand[b].besetzt}/${stand[b].gesamt}`)}',
    ersetzen: '{`${t.saalBesetzung}: ${stand[b].besetzt}/${stand[b].gesamt}`}',
  },
  {
    id: 'umbruch-gb-vorbei-flucht',
    datei: 'src/components/gruppenbesuche.css',
    regel: 'Ein vergangener Gruppenbesuch hält den Platz des fehlenden Pfeils frei — seine Gruppe steht in der Flucht der übrigen.',
    suchen: '  padding-inline-end: 34px;\n  opacity: 0.6;\n',
    ersetzen: '  opacity: 0.6;\n',
  },

  // ── „Was bleibt" aus T128 (20.10.2026): Füße, Trolley-Listen, „nie", Wochenspalte, Hinweise ──
  {
    id: 'umbruch-fuss-umbruch',
    datei: 'src/components/overlays.css',
    regel: 'Passen zwei Knöpfe im Fuß eines Blatts nicht nebeneinander, rückt der letzte in die nächste Zeile — „Hinzufügen" ragte bei 320 px 19 px hinaus.',
    suchen: '.sheet-fuss,\n.knopf-reihe {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.sheet-fuss,\n.knopf-reihe {\n  display: flex;\n',
  },
  {
    id: 'umbruch-fuss-mindestbreite',
    datei: 'src/components/overlays.css',
    regel: 'Ein Knopf im Fuß wird nicht schmaler als sein längstes Wort — sonst ragt das Wort hinaus, statt dass der Knopf umrückt.',
    suchen: '.knopf-reihe > * {\n  flex: 1 1 0;\n',
    ersetzen: '.knopf-reihe > * {\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-fuss-haupt',
    datei: 'src/components/overlays.css',
    regel: 'Neben dem Hauptknopf bleibt der leise so breit wie sein Wort („Drucken", „Abbrechen").',
    suchen: '.sheet-fuss--haupt > :first-child {\n  flex-grow: 999;\n',
    ersetzen: '.sheet-fuss--haupt > :first-child {\n  flex-grow: 1;\n',
  },
  {
    id: 'umbruch-fuss-raster',
    datei: 'src/components/overlays.css',
    regel: 'Kein Fuß eines Blatts steht als festes Raster aus zwei Spalten.',
    suchen: '.sheet-fuss {\n  flex: none;\n  padding-top: 16px;\n}\n',
    ersetzen: '.sheet-fuss {\n  flex: none;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  padding-top: 16px;\n}\n',
  },
  {
    id: 'umbruch-trolley-listen-umbruch',
    datei: 'src/trolleys/trolleys.css',
    regel: 'Am Desktop stehen die Trolley-Listen nebeneinander, solange jede ihr längstes Wort fasst — sonst untereinander.',
    suchen: '  .trolley-ansicht.is-desktop .trolley-listen {\n    flex-flow: row wrap;\n',
    ersetzen: '  .trolley-ansicht.is-desktop .trolley-listen {\n    flex-flow: row;\n',
  },
  {
    id: 'umbruch-nie-spalte',
    datei: 'src/auswertung/auswertung.css',
    regel: 'In den Bereichen der Auswertung ist die Spalte der Zahl so breit wie ihr breitestes „nie" — „niciodată" ragte 16 px hinaus.',
    suchen: 'minmax(0, 9em) minmax(0, 1fr) minmax(3.2em, max-content);',
    ersetzen: 'minmax(0, 9em) minmax(0, 1fr) 3.2em;',
  },
  {
    id: 'umbruch-nie-subgrid',
    datei: 'src/auswertung/auswertung.css',
    regel: 'Die Zeilen einer Liste teilen sich die Spalten — die Balken enden in einer Flucht, auch neben „nie".',
    suchen: '  grid-column: 1 / -1;\n  grid-template-columns: subgrid;\n',
    ersetzen: '  grid-column: 1 / -1;\n  grid-template-columns: minmax(0, 9em) minmax(0, 1fr) minmax(3.2em, max-content);\n',
  },
  {
    id: 'umbruch-ballung-umbruch',
    datei: 'src/auswertung/auswertung.css',
    regel: 'In den Ballungen der Auswertung rückt das Was unter das Kästchen, wenn sein längstes Wort nicht daneben passt.',
    suchen: '.aw-ballung {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.aw-ballung {\n  display: flex;\n',
  },
  {
    id: 'umbruch-ballung-mindestbreite',
    datei: 'src/auswertung/auswertung.css',
    regel: 'Das Was einer Ballung wird nicht schmaler als sein längstes Wort — „Mikrof|one" brach bei 320 px.',
    suchen: '.aw-ballung-was {\n  display: flex;\n  flex: 1 1 0;\n',
    ersetzen: '.aw-ballung-was {\n  display: flex;\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-plan-datum-gebunden',
    datei: 'src/planen/PlanBearbeiten.tsx',
    regel: 'Von und Bis eines Weiteren Plans binden Zahl und Wort — „5 окт. 2026 |г." brach bei 320 px.',
    suchen: "gebundenesDatum(fromIso(tag), state.lang, 'tagKurzJahr')",
    ersetzen: "gebundenesDatum(fromIso(tag), state.lang, 'tagKurzJahr').replaceAll(String.fromCharCode(0xa0), ' ')",
  },
  {
    id: 'umbruch-zeitleiste-datum-gebunden',
    datei: 'src/components/zeitleiste-gemeinsam.ts',
    regel: 'In der Zeitleiste einer Person bleiben Tag und Monat zusammen — „воскресенье, 20 |сентября" brach bei 320 px.',
    suchen: "  const tag = gebundenesDatum(datum, lang, 'tag')\n",
    ersetzen: "  const tag = gebundenesDatum(datum, lang, 'tag').replaceAll(String.fromCharCode(0xa0), ' ')\n",
  },
  {
    id: 'umbruch-zusagen-zeile-umbruch',
    datei: 'src/planen/planen.css',
    regel: 'Bei den Zusagen rückt „Jetzt erinnern" (und „Zuteilen") unter den Text, wenn beides nicht nebeneinander passt.',
    suchen: '.zusage-zeile,\n.zusagen-erinnern {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.zusage-zeile,\n.zusagen-erinnern {\n  display: flex;\n',
  },
  {
    id: 'umbruch-zusagen-text-mindestbreite',
    datei: 'src/planen/planen.css',
    regel: 'Der Text einer Zeile bei den Zusagen wird nicht schmaler als sein längstes Wort — er ragte bis 87 px hinaus.',
    suchen: '.zusagen-erinnern > .klein-text {\n  flex: 1 1 0;\n',
    ersetzen: '.zusagen-erinnern > .klein-text {\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-s89-zeile-umbruch',
    datei: 'src/planen/planen.css',
    regel: 'In der S-89-Leiste rücken Schalter und Knopf unter die Beschriftung, wenn alles nicht nebeneinander passt.',
    suchen: '.s89-druck-row {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.s89-druck-row {\n  display: flex;\n',
  },
  {
    id: 'umbruch-reiter-umbruch',
    datei: 'src/components/components.css',
    regel: 'Passt ein Wochentag nicht in seinen Reiter, rückt die Bearbeiten-Karte in die nächste Zeile — „niedziel|a" brach bei 320 px.',
    suchen: '.meeting-tabs {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.meeting-tabs {\n  display: flex;\n',
  },
  {
    id: 'umbruch-reiter-mindestbreite',
    datei: 'src/components/components.css',
    regel: 'Ein Reiter der Zusammenkünfte wird nicht schmaler als sein Wochentag, wo der sich nicht trennen lässt.',
    suchen: '.meeting-tab {\n  display: flex;\n  flex: 1 1 0;\n',
    ersetzen: '.meeting-tab {\n  display: flex;\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-reiter-ohne-anywhere',
    datei: 'src/components/components.css',
    regel: 'Der Wochentag eines Reiters bricht nicht irgendwo — sonst schrumpfte der Reiter, statt dass die Bearbeiten-Karte umrückt.',
    suchen: '  hyphens: auto;\n  overflow-wrap: break-word;\n}\n\n.meeting-tab.is-active .meeting-tab-name {',
    ersetzen: '  hyphens: auto;\n  overflow-wrap: anywhere;\n}\n\n.meeting-tab.is-active .meeting-tab-name {',
  },
  {
    id: 'tag-wahl-hinterlegt',
    datei: 'src/components/components.css',
    regel: 'Der gewählte Tag ist in der Textfarbe hinterlegt — ein schmaler Rand allein war dem Betreiber zu undeutlich.',
    suchen: '.meeting-tab.is-active {\n  background: var(--text);\n  color: var(--grund);\n}',
    ersetzen: '.meeting-tab.is-active {\n  border-color: var(--text);\n  color: var(--text);\n}',
  },
  {
    id: 'tag-wahl-zeit-lesbar',
    datei: 'src/components/components.css',
    regel: 'Datum und Uhrzeit auf dem gewählten Tag stehen in der Farbe des Grunds — blass wären sie auf der dunklen Fläche kaum zu lesen.',
    suchen: '.meeting-tab.is-active .meeting-tab-wann {\n  color: var(--grund);\n}',
    ersetzen: '.meeting-tab.is-active .meeting-tab-wann {\n}',
  },
  {
    id: 'umbruch-wochenkarte-umbruch',
    datei: 'src/planen/planen.css',
    regel: 'In der Planung rückt die Lage einer Woche unter die Spanne, wenn beide nicht nebeneinander passen.',
    suchen: '.wochen-karte-kopf {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.wochen-karte-kopf {\n  display: flex;\n',
  },
  {
    id: 'umbruch-wochenkarte-mindestbreite',
    datei: 'src/planen/planen.css',
    regel: 'Die Spanne einer Woche wird nicht schmaler als ihr längstes Stück — gebunden ragte sie bei 320 px bis 38 px hinaus.',
    suchen: '.wochen-karte-knopf {\n  flex: 1 1 0;\n',
    ersetzen: '.wochen-karte-knopf {\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-wochenspalte-lage-bleibt',
    datei: 'src/planen/planen.css',
    regel: 'In der Wochenspalte am Desktop steht die Lage neben der Unterzeile, wie bisher — nicht an den Rand gerückt.',
    suchen: '  order: 2;\n  margin-inline-start: 0;\n',
    ersetzen: '  order: 2;\n',
  },
  {
    id: 'umbruch-planung-trennstelle-ru',
    datei: 'src/i18n/overlays/ru.ts',
    regel: 'Russisch: „Планирование" trennt an der Silbe („Плани-рование"), nicht so spät wie möglich („Планирован-ие").',
    suchen: '"dashPlanung": "Плани' + String.fromCharCode(92) + 'u00adрование",',
    ersetzen: '"dashPlanung": "Планирование",',
  },
  {
    id: 'umbruch-wochenspalte-titel-trennt',
    datei: 'src/planen/planen.css',
    regel: 'Der Titel der Wochenspalte beim Planen trennt nach den Regeln der Sprache — „Планирование" ragte bei Stufe 1,45 hinaus.',
    suchen: '  font-weight: 600;\n  -webkit-hyphens: auto;\n  hyphens: auto;\n  overflow-wrap: break-word;\n}\n\n/* In der schmalen Spalte',
    ersetzen: '  font-weight: 600;\n}\n\n/* In der schmalen Spalte',
  },
  {
    id: 'umbruch-spur-trennstelle-pl',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch hat in Chrome keine Trennregeln — „Opublikowany" trennt in der Spur an seinem weichen Trennzeichen.',
    suchen: '"spurVeroeffentlicht": "Opubli' + String.fromCharCode(92) + 'u00adkowany",',
    ersetzen: '"spurVeroeffentlicht": "Opublikowany",',
  },
  {
    id: 'umbruch-spur-trennstelle-pl-ende',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch: „Zakończony" trennt in der Spur an seinem weichen Trennzeichen.',
    suchen: '"spurAbgeschlossen": "Zakoń' + String.fromCharCode(92) + 'u00adczony",',
    ersetzen: '"spurAbgeschlossen": "Zakończony",',
  },
  {
    id: 'umbruch-spur-trennstelle-tr',
    datei: 'src/i18n/overlays/tr.ts',
    regel: 'Türkisch hat in Chrome keine Trennregeln — „Tamamlandı" trennt in der Spur an seinem weichen Trennzeichen.',
    suchen: '"spurAbgeschlossen": "Tamam' + String.fromCharCode(92) + 'u00adlandı",',
    ersetzen: '"spurAbgeschlossen": "Tamamlandı",',
  },
  {
    id: 'umbruch-spur-trennstelle-en',
    datei: 'src/i18n/overlays/en.ts',
    regel: 'Ein großgeschriebenes englisches Wort trennt Chrome nie — „Completed" trennt in der Spur an seinem weichen Trennzeichen.',
    suchen: '"spurAbgeschlossen": "Com' + String.fromCharCode(92) + 'u00adpleted",',
    ersetzen: '"spurAbgeschlossen": "Completed",',
  },
  {
    id: 'umbruch-spur-trennstelle-pl-absage',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch: „Odwołujesz" trennt in der Spur des Absage-Blatts an seinem weichen Trennzeichen.',
    suchen: '"spurDuSagstAb": "Odwo' + String.fromCharCode(92) + 'u00adłujesz",',
    ersetzen: '"spurDuSagstAb": "Odwołujesz",',
  },
  {
    id: 'umbruch-spur-trennstelle-pl-planer',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch: „informację" trennt in der Spur des Absage-Blatts an seinem weichen Trennzeichen.',
    suchen: '"spurPlanerErfaehrt": "Planista dostaje infor' + String.fromCharCode(92) + 'u00admację",',
    ersetzen: '"spurPlanerErfaehrt": "Planista dostaje informację",',
  },
  {
    id: 'umbruch-spur-trennstelle-pl-neu',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch: „Przydzielone" trennt in der Spur des Absage-Blatts an seinem weichen Trennzeichen.',
    suchen: '"spurNeuZugeteilt": "Przy' + String.fromCharCode(92) + 'u00addzielone na nowo",',
    ersetzen: '"spurNeuZugeteilt": "Przydzielone na nowo",',
  },
  {
    id: 'umbruch-spur-trennstelle-pl-zusagen',
    datei: 'src/i18n/overlays/pl.ts',
    regel: 'Polnisch: „Potwierdzenia" trennt in der Spur der Woche und als Titel der Zusagen an seinem weichen Trennzeichen.',
    suchen: '"spurZusagen": "Potwier' + String.fromCharCode(92) + 'u00addzenia",',
    ersetzen: '"spurZusagen": "Potwierdzenia",',
  },
  {
    id: 'umbruch-spur-trennstelle-ro-planer',
    datei: 'src/i18n/overlays/ro.ts',
    regel: 'Rumänisch hat in Chrome keine Trennregeln — „Planificatorul" trennt in der Spur an seinen weichen Trennzeichen.',
    suchen: '"spurPlanerErfaehrt": "Plani' + String.fromCharCode(92) + 'u00adfica' + String.fromCharCode(92) + 'u00adtorul află",',
    ersetzen: '"spurPlanerErfaehrt": "Planificatorul află",',
  },
  {
    id: 'umbruch-spur-trennstelle-ro-neu',
    datei: 'src/i18n/overlays/ro.ts',
    regel: 'Rumänisch: „Repartizat" trennt in der Spur des Absage-Blatts an seinem weichen Trennzeichen.',
    suchen: '"spurNeuZugeteilt": "Repar' + String.fromCharCode(92) + 'u00adtizat din nou",',
    ersetzen: '"spurNeuZugeteilt": "Repartizat din nou",',
  },
  {
    id: 'umbruch-spur-trennstelle-ro-zusagen',
    datei: 'src/i18n/overlays/ro.ts',
    regel: 'Rumänisch: „Confirmări" trennt in der Spur der Woche an seinem weichen Trennzeichen.',
    suchen: '"spurZusagen": "Confir' + String.fromCharCode(92) + 'u00admări",',
    ersetzen: '"spurZusagen": "Confirmări",',
  },
  {
    id: 'umbruch-spur-trennstelle-tr-absage',
    datei: 'src/i18n/overlays/tr.ts',
    regel: 'Türkisch: „çekiliyorsun" trennt in der Spur des Absage-Blatts an seinem weichen Trennzeichen.',
    suchen: '"spurDuSagstAb": "Görevden çekili' + String.fromCharCode(92) + 'u00adyorsun",',
    ersetzen: '"spurDuSagstAb": "Görevden çekiliyorsun",',
  },
  {
    id: 'umbruch-spur-trennstelle-en-neu',
    datei: 'src/i18n/overlays/en.ts',
    regel: 'Englisch: „Reassigned" trennt in der Spur des Absage-Blatts an seinem weichen Trennzeichen.',
    suchen: '"spurNeuZugeteilt": "Reas' + String.fromCharCode(92) + 'u00adsigned",',
    ersetzen: '"spurNeuZugeteilt": "Reassigned",',
  },
  {
    id: 'umbruch-spur-trennstelle-en-zusagen',
    datei: 'src/i18n/overlays/en.ts',
    regel: 'Englisch: „Confirmations" trennt in der Spur der Woche und als Titel der Zusagen an seinem weichen Trennzeichen.',
    suchen: '"spurZusagen": "Confir' + String.fromCharCode(92) + 'u00admations",',
    ersetzen: '"spurZusagen": "Confirmations",',
  },
  {
    id: 'umbruch-hinweis-pfeil',
    datei: 'src/auswertung/auswertung.css',
    regel: 'In einer schmalen Liste der Hinweise gibt der Pfeil seinen Platz an den Text ab — „обязанностями: 4" stand sonst getrennt.',
    suchen: '  .aw-hinweis > .zeichen {\n    display: none;\n',
    ersetzen: '  .aw-hinweis > .zeichen {\n    opacity: 0.5;\n',
  },

  // ── Daten direkt aus Intl (T128-Nachlauf, 20.10.2026): ein Datum mit Monatsnamen kommt aus datum-anzeige.ts ──
  {
    id: 'umbruch-intl-absage-tag',
    datei: 'src/aufgaben/AbsageBlatt.tsx',
    regel: 'Der Tag im Absage-Blatt kommt gebunden aus datum-anzeige.ts, nicht von einem eigenen Aufruf des Formats.',
    suchen: "{gebundenesDatum(fromIso(tag), state.lang, 'tag')}",
    ersetzen: "{datumsFormat(state.lang, 'tag').format(fromIso(tag))}",
  },
  {
    id: 'umbruch-intl-auswertung-datum',
    datei: 'src/auswertung/AuswertungScreen.tsx',
    regel: 'Die Daten der Auswertung (Wartezeiten, Ballungen, Person) kommen gebunden aus datum-anzeige.ts.',
    suchen: "      datum: (iso) => gebundenesDatum(fromIso(iso), lang, 'tagMonatKurz'),\n",
    ersetzen: "      datum: (iso) => datumsFormat(lang, 'tagMonatKurz').format(fromIso(iso)),\n",
  },
  {
    id: 'umbruch-intl-kalender-monat',
    datei: 'src/bausteine/ZeitraumKalender.tsx',
    regel: 'Der Monat über dem Kalender eines Zeitraums kommt gebunden aus datum-anzeige.ts („2026 г.").',
    suchen: "{gebundenesDatum(new Date(monat.y, monat.m, 15), lang, 'monatJahr')}",
    ersetzen: "{datumsFormat(lang, 'monatJahr').format(new Date(monat.y, monat.m, 15))}",
  },
  {
    id: 'umbruch-intl-plan-zeitraum',
    datei: 'src/components/weitere-plaene-anzeige.ts',
    regel: 'Der Zeitraum eines Weiteren Plans ist eine gebundene Spanne (tageSpanne), kein eigenes formatRange.',
    suchen: "  return tageSpanne(plan.von, plan.bis, lang, 'tagMonatJahr')\n",
    ersetzen: "  return datumsFormat(lang, 'tagMonatJahr').formatRange(fromIso(plan.von), fromIso(plan.bis))\n",
  },
  {
    id: 'umbruch-intl-datumswaehler',
    datei: 'src/components/DatePicker.tsx',
    regel: 'Der Datumswähler baut kein eigenes Intl-Format — sein Datum kommt gebunden aus datum-anzeige.ts.',
    suchen: "  const label = value ? gebundenesDatum(fromIso(value), locale, 'tagKurzJahr') : ''\n",
    ersetzen:
      "  const label = value ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(fromIso(value)) : ''\n",
  },
  {
    id: 'umbruch-intl-planungskarte',
    datei: 'src/dashboard/PlanungsKarte.tsx',
    regel: 'Der Zeitraum auf der Planungs-Karte ist eine gebundene Spanne, kein eigenes Intl-Format.',
    suchen:
      "        ? tageSpanne(isoVonKalendertag(stand.zeitraum.vonMs), isoVonKalendertag(stand.zeitraum.bisMs), state.lang, 'tagKurzJahr')\n",
    ersetzen:
      "        ? new Intl.DateTimeFormat(state.lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(stand.zeitraum.vonMs, stand.zeitraum.bisMs)\n",
  },
  {
    id: 'umbruch-intl-relative-zeit',
    datei: 'src/i18n/zeit.ts',
    regel: 'Die Zeit in der Glocke bindet Zahl und Wort („vor 3 Tagen") — sie geht nicht durch fill.',
    suchen: '  return zahlBinden(relativ(fuer(lang), min))\n',
    ersetzen: '  return relativ(fuer(lang), min)\n',
  },
  {
    id: 'umbruch-intl-zuteilen-dauer',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Im Kopf des Zuteilen-Blatts bleibt die Dauer bei ihrer Zahl („3 Min.").',
    suchen: "    sub: zahlBinden([datum, dauer ? tpw(dauer) : ''].filter(Boolean).join(' · ')),\n",
    ersetzen: "    sub: [datum, dauer ? tpw(dauer) : ''].filter(Boolean).join(' · '),\n",
  },
  {
    id: 'umbruch-intl-treffpunkt-tag',
    datei: 'src/components/treffpunkt-beschriftung.ts',
    regel: 'Der Tag eines Treffpunkts kommt gebunden aus datum-anzeige.ts („Samstag, 12. September").',
    suchen: "  return tag ? gebundenesDatum(tag, lang, 'tag') : wochentagNameAusWd(wd, lang)\n",
    ersetzen: "  return tag ? gebundenesDatum(tag, lang, 'tag').replaceAll(String.fromCharCode(0xa0), ' ') : wochentagNameAusWd(wd, lang)\n",
  },
  {
    id: 'umbruch-intl-konto-tag',
    datei: 'src/personen/KontoCard.tsx',
    regel: 'Der Tag unter „Link gesendet" in der Spur des Kontos bindet Zahl und Monat.',
    suchen: "  const tag = (iso: string) => gebundenesDatum(new Date(iso), state.lang, 'tagMonatKurz')\n",
    ersetzen: "  const tag = (iso: string) => gebundenesDatum(new Date(iso), state.lang, 'tagMonatKurz').replaceAll(String.fromCharCode(0xa0), ' ')\n",
  },
  {
    id: 'umbruch-intl-geladen-bis',
    datei: 'src/planen/useWochenImport.ts',
    regel: '„Geladen bis" nennt den Tag gebunden („13. Sept. 2026").',
    suchen: "        ? gebundenesDatum(fromIso(isoVonKalendertag(bisMs)), state.lang, 'tagKurzJahr')\n",
    ersetzen: "        ? gebundenesDatum(fromIso(isoVonKalendertag(bisMs)), state.lang, 'tagKurzJahr').replaceAll(String.fromCharCode(0xa0), ' ')\n",
  },

  {
    id: 'umbruch-mitteilung-text-gebunden',
    datei: 'src/mitteilungen/Mitteilung.tsx',
    regel: 'Im Text einer Mitteilung bleiben Tag und Monat zusammen — der übersetzte Text geht nicht durch fill.',
    suchen: '  const text = zahlBinden(tu(notif.text))\n',
    ersetzen: '  const text = tu(notif.text)\n',
  },
  {
    id: 'umbruch-mitteilung-kopf-umbruch',
    datei: 'src/mitteilungen/mitteilungen.css',
    regel: 'Passt der Titel einer Mitteilung nicht neben die Zeit, rückt die Zeit darunter.',
    suchen: '.mitteilung-kopf {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.mitteilung-kopf {\n  display: flex;\n',
  },
  {
    id: 'umbruch-mitteilung-titel-mindestbreite',
    datei: 'src/mitteilungen/mitteilungen.css',
    regel: 'Der Titel einer Mitteilung wird nicht schmaler als sein längstes Wort — „Zuteilu|ng" brach bei 320 px.',
    suchen: '.mitteilung-titel {\n  flex: 1 1 0;\n',
    ersetzen: '.mitteilung-titel {\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-treff-tag-misst',
    datei: 'src/programm/programm.css',
    regel: 'Ein Tag mit Treffpunkten misst sich selbst — sonst greift keine der Grenzen, unter denen die Uhrzeit über den Text rückt.',
    suchen: '.treff-tag {\n  padding-block-end: 4px;\n  container-type: inline-size;\n',
    ersetzen: '.treff-tag {\n  padding-block-end: 4px;\n',
  },
  {
    id: 'umbruch-treff-ansehen-stapelt',
    datei: 'src/programm/programm.css',
    regel: 'Unter 12 em steht die Uhrzeit eines Treffpunkts über dem Text — „Congregatio|n" brach bei 320 px und 1,45.',
    suchen: "      'zeit zeit'\n      'text text'\n      'leiter leiter';\n",
    ersetzen: "      'zeit text'\n      '. leiter';\n",
  },
  {
    id: 'umbruch-treff-planen-stapelt',
    datei: 'src/planen/planen.css',
    regel: 'Beim Planen steht unter 16 em der Text eines Treffpunkts unter Uhrzeit und ✕ — daneben blieben rund 90 px.',
    suchen: "      'zeit . x'\n      'text text text';\n",
    ersetzen: "      'zeit text x';\n",
  },
  {
    id: 'umbruch-grundplan-stapelt',
    datei: 'src/planen/planen.css',
    regel: 'Im Grundplan steht unter 16 em der Text eines Treffpunkts unter Uhrzeit und Pfeil — „Congreg|ation", „Königreich|ssaal" brachen bei 320 px und 1,45.',
    suchen: "      'zeit . pfeil'\n      'text text text';\n",
    ersetzen: "      'zeit text pfeil';\n",
  },
  {
    id: 'kaskade-abfrage-nicht-ueberschrieben',
    datei: 'src/planen/planen.css',
    regel: 'Keine spätere Regel gleichen Selektors setzt zurück, was eine Container-Abfrage setzt — der Leiter behielt im schmalen Tag seinen Einzug.',
    suchen: '/* ---- Zuteilen (T121, Entwurf `GZuteilen`) ---------------------------------- */\n',
    ersetzen:
      '.treff-leiter-zeile {\n  padding-inline-start: calc(66px * var(--fs) + 10px);\n}\n\n/* ---- Zuteilen (T121, Entwurf `GZuteilen`) ---------------------------------- */\n',
  },
  {
    id: 'umbruch-kal-enden-umbruch',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Fasst „Von" oder „Bis" sein Datum nicht, steht „Bis" darunter — in zwei festen Hälften ragte „niedz., 25 października" 65 px hinaus.',
    suchen: '.kal-enden {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.kal-enden {\n  display: flex;\n',
  },
  {
    id: 'umbruch-kal-ende-mindestbreite',
    datei: 'src/bausteine/bausteine.css',
    regel: '„Von" und „Bis" werden nicht schmaler als ihr Datum — sonst bräche es, statt dass „Bis" umrückt.',
    suchen: '.kal-ende {\n  display: flex;\n  flex: 1 1 0;\n',
    ersetzen: '.kal-ende {\n  display: flex;\n  flex: 1 1 0;\n  min-width: 0;\n',
  },
  {
    id: 'umbruch-wochentag-kuerzel',
    datei: 'src/components/kalender.ts',
    regel: 'Über einem Kalender steht kein Wochentag mit mehr als drei Zeichen — „niedz." ragte bei 320 px 13 px aus seinem Siebtel.',
    suchen: "  const ergebnis = kurz.some((k) => [...k].length > 3) ? tage('narrow') : kurz\n",
    ersetzen: "  const ergebnis = kurz.some((k) => [...k].length > 9) ? tage('narrow') : kurz\n",
  },
  {
    id: 'umbruch-option-text-trennt',
    datei: 'src/bausteine/bausteine.css',
    regel: 'Ein langes Wort in einer Option trennt nach der Sprache — „Dienstvortrag statt Versammlungsbibelstudium" ragte bei 320 px 39 px hinaus.',
    suchen: '  min-width: 0;\n  -webkit-hyphens: auto;\n  hyphens: auto;\n  overflow-wrap: break-word;\n}\n\n.option-titel {',
    ersetzen: '  min-width: 0;\n}\n\n.option-titel {',
  },
  {
    id: 'umbruch-person-unter-trennt',
    datei: 'src/personen/personen.css',
    regel: 'Die Zeile unter dem Namen einer Person trennt nach der Sprache — „Возвещатель" ragte am Desktop bei 1,45 2 px hinaus.',
    suchen: '.person-unter {\n  color: var(--text2);\n  -webkit-hyphens: auto;\n  hyphens: auto;\n',
    ersetzen: '.person-unter {\n  color: var(--text2);\n',
  },
  {
    id: 'umbruch-einrichten-zeile-umbruch',
    datei: 'src/planen/planen.css',
    regel: 'In „Woche einrichten" rückt „Verlegen" unter den Termin, wenn er nicht daneben passt.',
    suchen: '.einrichten-zeile {\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.einrichten-zeile {\n  display: flex;\n',
  },
  {
    id: 'umbruch-einrichten-text-mindestbreite',
    datei: 'src/planen/planen.css',
    regel: 'Der Termin in „Woche einrichten" wird nicht schmaler als sein längstes Wort — das gebundene Datum ragte sonst neben „Verlegen" hinaus.',
    suchen: '.einrichten-zeile-text {\n  display: flex;\n  flex: 1 1 0;\n',
    ersetzen: '.einrichten-zeile-text {\n  display: flex;\n  flex: 1 1 0;\n  min-width: 0;\n',
  },

  // ── „Verbindung langsam" statt „Offline", solange die Daten noch kommen (19.10.2026) ──
  {
    id: 'offline-langsam-hinweis',
    datei: 'src/app/AppShell.tsx',
    regel: 'Steht der letzte Stand, weil die Daten bei bestehendem Netz auf sich warten lassen, sagt der Streifen „Verbindung langsam" — nicht „Offline".',
    suchen: '          <strong>{fill(langsam ? t.offlineLangsam : t.offlineBanner, { m: stamp })}</strong>\n',
    ersetzen: '          <strong>{fill(t.offlineBanner, { m: stamp })}</strong>\n',
  },
  {
    id: 'offline-langsam-nur-mit-netz',
    datei: 'src/app/AppShell.tsx',
    regel: 'Meldet das Gerät kein Netz, heißt der Streifen „Offline" — auch wenn der Wecker den Stand als langsam zeigte.',
    suchen: '  const langsam = state.staleLangsam && navigator.onLine !== false\n',
    ersetzen: '  const langsam = state.staleLangsam\n',
  },
  {
    id: 'vorgriff-wecker-langsam',
    datei: 'src/app/store.tsx',
    regel: 'Greift der Wecker bei bestehendem Netz vor, steht der letzte Stand als „langsam" da — die Antwort kann ja noch kommen.',
    suchen: '      else wecker = setTimeout(() => vorgreifen(true), VORGRIFF_NACH_MS)\n',
    ersetzen: '      else wecker = setTimeout(() => vorgreifen(false), VORGRIFF_NACH_MS)\n',
  },
  {
    id: 'vorgriff-langsam-dann-gescheitert',
    datei: 'src/app/store.tsx',
    regel: 'Scheitert die Prüfung der Sitzung am Netz, nachdem der Wecker den Stand als „langsam" zeigte, heißt er wieder „Offline" — es kommt nichts mehr.',
    suchen: '      } else if (!langsam && stateRef.current.staleLangsam) {\n',
    ersetzen: '      } else if (false) {\n',
  },
  {
    id: 'nachladen-gescheitert-nicht-mehr-langsam',
    datei: 'src/app/reducer.ts',
    regel: 'Ein gescheitertes Laden macht aus „Verbindung langsam" wieder „Offline".',
    suchen: "      return { ...state, staleLangsam: false, toast: toastKey(state, 'stFehler') }\n",
    ersetzen: "      return { ...state, toast: toastKey(state, 'stFehler') }\n",
  },
  {
    id: 'hydrate-langsam-nur-mit-stand',
    datei: 'src/app/reducer.ts',
    regel: '„Langsam" gibt es nur zum letzten Stand — frische Daten tragen es nie.',
    suchen: '        staleLangsam: action.staleAt !== undefined && action.langsam === true,\n',
    ersetzen: '        staleLangsam: action.langsam === true,\n',
  },
  {
    id: 'umbruch-streifen-knopf-darunter',
    datei: 'src/app/shell.css',
    regel: 'Im Streifen des letzten Stands rückt „Neu laden" bei großer Schrift unter den Text, statt ihn in eine Spalte von drei Wörtern zu drücken.',
    suchen: '.offline-banner-inhalt {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n',
    ersetzen: '.offline-banner-inhalt {\n  flex: 1;\n  display: flex;\n',
  },

  // ── Ohne Versammlung abgemeldet (Betreiber, 21.10.2026) ────────────────────
  // Löst `ohne-mitgliedschaft-kein-offline-stand` ab: Die Seite „Keine
  // Versammlung" gibt es nicht mehr, und das Abmelden leert den letzten Stand
  // ohnehin (`abmelden-leert-den-bestand`).
  {
    id: 'ohne-versammlung-abgemeldet',
    datei: 'src/app/hydrate.ts',
    regel: 'Findet das Laden keine Mitgliedschaft, meldet das Gerät ab und sagt der Anmeldung, warum.',
    suchen: '    performLogout(dispatch, { keineVersammlung: true })\n',
    ersetzen: '    performLogout(dispatch)\n',
  },
  {
    id: 'ohne-versammlung-grund-bleibt',
    datei: 'src/app/reducer.ts',
    regel: 'Das zweite Abmelden (`SIGNED_OUT`, ohne Grund) nimmt den Satz „keine Versammlung" nicht weg.',
    suchen: '        keineVersammlung: action.keineVersammlung === true || state.keineVersammlung,\n',
    ersetzen: '        keineVersammlung: action.keineVersammlung === true,\n',
  },
  {
    id: 'ohne-versammlung-anmeldung-raeumt',
    datei: 'src/app/reducer.ts',
    regel: 'Erst eine Anmeldung nimmt den Satz „keine Versammlung" weg.',
    suchen: '        welcomePending: action.welcome === true,\n        keineVersammlung: false,\n',
    ersetzen: '        welcomePending: action.welcome === true,\n',
  },
  {
    id: 'ohne-versammlung-satz',
    datei: 'src/login/LoginScreen.tsx',
    regel: 'Nach dem Abmelden ohne Versammlung sagt die Anmeldung, warum, und wie es weitergeht.',
    suchen: '        {state.keineVersammlung && (\n',
    ersetzen: '        {false && (\n',
  },
  // „Person löschen" nimmt ihr Konto mit (Betreiber: „entscheide selber", 21.10.2026).
  {
    id: 'person-loeschen-konto-mit',
    datei: 'src/app/reducer.ts',
    regel: 'Wird eine Person gelöscht, geht ihr Konto mit — nicht nur die Verknüpfung.',
    suchen: '      .filter((m) => !kontoGehtMit(m, id, state.userId))\n',
    ersetzen: '',
  },
  {
    // Eine Stelle für Reducer, Speichern und Frage — die Mutation trifft alle drei.
    id: 'person-loeschen-eigenes-konto-bleibt',
    datei: 'src/app/eigene-person.ts',
    regel: 'Löscht der Admin die eigene Person, bleibt sein Konto — ohne Person; die Frage davor nennt es nicht.',
    suchen: '  return konto.personId === personId && konto.userId !== eigeneUserId\n',
    ersetzen: '  return konto.personId === personId\n',
  },
  {
    id: 'person-loeschen-mitgliedschaft-in-der-db',
    datei: 'src/app/persist.ts',
    regel: 'Wird eine Person gelöscht, löscht die App auch ihre Mitgliedschaft in der Datenbank — das Konto geht mit ihr.',
    suchen: '  for (const m of prev.members) if (kontoGehtMit(m, id, prev.userId)) deleteMemberRow(m.userId)\n',
    ersetzen: '',
  },
  {
    id: 'schema-konto-mit-mitgliedschaft',
    datei: 'supabase/schema.sql',
    regel: 'Geht die Mitgliedschaft, geht das Konto — sonst käme ein entferntes Konto mit einem neuen Link samt alten Sitzungen zurück.',
    suchen: '  delete from auth.users where id = old.user_id;\n',
    ersetzen: '',
  },
  {
    id: 'person-loeschen-frage-nennt-konto',
    datei: 'src/personen/PersonDetail.tsx',
    regel: 'Hat die Person ein Konto, sagt die Frage vor dem Löschen, dass es mitgeht.',
    suchen: "          (state.members.some((m) => kontoGehtMit(m, person.id, state.userId)) ? ` ${t.confirmPersonDelKonto}` : '')\n",
    ersetzen: "          ''\n",
  },
  // Beim Gastredner steht seine Versammlung (Betreiber am 21.10.2026: „einfach
  // den versammlungsnamen, wenn es einen gibt").
  {
    id: 'gastredner-versammlung-statt-rolle',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Neben einem eingetragenen Gastredner steht seine Versammlung statt des Worts „Gastredner".',
    suchen: '  if (slot.name && versammlung && rolleBasis(slot.rolle) === ROLE_GUEST_SPEAKER) return versammlung\n',
    ersetzen: '',
  },
  {
    id: 'gastredner-versammlung-nur-mit-namen',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Ein freier Gastredner-Platz nennt keine Versammlung, auch wenn noch eine am Platz hängt.',
    suchen: '  if (slot.name && versammlung && ',
    ersetzen: '  if (versammlung && ',
  },
  {
    id: 'gastredner-versammlung-nur-beim-gast',
    datei: 'src/programm/programm-zeilen.ts',
    regel: 'Beim eigenen Redner und beim Kreisaufseher steht die Aufgabe, keine Versammlung.',
    suchen: ' && rolleBasis(slot.rolle) === ROLE_GUEST_SPEAKER) return versammlung\n',
    ersetzen: ') return versammlung\n',
  },
  {
    id: 'programm-versammlung-am-redner',
    datei: 'src/programm/ZusammenkunftAnsicht.tsx',
    regel: 'Das Programm zeigt neben dem Gastredner seine Versammlung.',
    suchen: '                rolle={rolleNebenDemNamen(slot, tu)}\n',
    ersetzen: '                rolle={slot.rolle && tu(slot.rolle)}\n',
  },
  {
    id: 'wochenbogen-versammlung-am-redner',
    datei: 'src/druck/ProgrammDruck.tsx',
    regel: 'Der Wochenbogen zeigt neben dem Gastredner seine Versammlung, wie der Bildschirm.',
    suchen: '        const rolle = rolleNebenDemNamen(slot, tu)\n',
    ersetzen: '        const rolle = slot.rolle && tu(slot.rolle)\n',
  },
  {
    id: 'eigener-redner-ohne-fremde-versammlung',
    datei: 'src/planen/AssignSheet.tsx',
    regel: 'Wer am Redner-Platz eine Person wählt, nimmt die Versammlung des Gastredners davor weg.',
    suchen: "rolle: ROLE_OWN_SPEAKER, pid: cand.key, herkunft: '' }",
    ersetzen: 'rolle: ROLE_OWN_SPEAKER, pid: cand.key }',
  },
  {
    id: 'gastredner-entfernen-ohne-versammlung',
    datei: 'src/planen/AssignSheet.tsx',
    regel: '„Entfernen" am Redner-Platz nimmt mit dem Gastredner seine Versammlung weg.',
    suchen: "{ type: 'assign', name: '', rolle: guestBase, herkunft: '' }",
    ersetzen: "{ type: 'assign', name: '', rolle: guestBase }",
  },
  {
    id: 'leeren-eigener-redner-ohne-versammlung',
    datei: 'src/data/planning.ts',
    regel: '„Leeren" lässt am eigenen Redner keine fremde Versammlung zurück.',
    suchen: '        slot.rolle = ROLE_GUEST_SPEAKER\n        delete slot.herkunft\n',
    ersetzen: '        slot.rolle = ROLE_GUEST_SPEAKER\n',
  },
]

/**
 * **Sitzt noch jeder Anker?** — die billige Vorprüfung, ohne einen einzigen
 * Test: je Eintrag die Datei lesen und zählen, wie oft `suchen` darin steht.
 *
 * Rückgabe: die Einträge, bei denen es **nicht** genau einmal ist, je mit der
 * gezählten Zahl. Leer heißt: Der Katalog zeigt überall noch dorthin, wo er
 * hinzeigen soll. Dieselbe Prüfung fährt `scripts/mutationsprobe.test.ts` im
 * normalen Testlauf — dort kostet sie Millisekunden und hält einen Umbau am
 * selben Tag an, statt erst beim nächsten Durchgang Wochen später.
 */
export function ankerFehler() {
  const fehler = []
  for (const m of KATALOG) {
    const treffer = lies(join(wurzel, m.datei)).split(m.suchen).length - 1
    if (treffer !== 1) fehler.push({ id: m.id, datei: m.datei, treffer })
  }
  return fehler
}

// ── Lauf ────────────────────────────────────────────────────────────────────

/**
 * Den vitest des Projekts finden (siehe `werkzeugPfad`) — oder abbrechen,
 * bevor die erste Datei angefasst ist. Bis zum 26.9.2026 stand hier ein fester
 * Pfad in `<wurzel>/node_modules`; im Worktree zeigte er ins Leere.
 */
function vitestPfad() {
  try {
    return werkzeugPfad(wurzel, 'vitest')
  } catch (err) {
    console.error(`\n${err.message}\n`)
    process.exit(2)
  }
}

/**
 * Einen vollen Testlauf machen — oder mit `datei` nur diese eine Testdatei:
 * den Ausgangsstand eines Wächters (siehe `waechterBefund`). Rückgabe: was
 * `spawnSync` liefert — gewertet wird es in `testlaufBefund`.
 *
 * vitest wählt `datei` per Teilzeichenkette aus. Kein Testpfad ist heute Teil
 * eines anderen (gemessen am 3.10.2026, 212 Dateien); träfe der Filter einmal
 * mehr als eine, würde die Prüfung nur strenger, nicht nachgiebiger.
 *
 * **Kein `process.exit()` hier drin:** Während des Laufs steht die Mutation im
 * Quelltext. Abbrechen darf erst `main()`, wenn sie zurückgenommen ist — bis
 * zum 26.9.2026 brach ein Startfehler hier ab und ließ sie stehen.
 *
 * **Eine Minute Frist je Test statt der fünf Sekunden von vitest.** Unter Last
 * — auf diesem Rechner fahren oft mehrere Sitzungen gleichzeitig volle Suiten —
 * brauchen die Proben, die den Quelltext von der Platte lesen, ein Vielfaches
 * (gemessen bis 50 s). Sie reißen die Frist, und `--bail=1` schreibt ihnen die
 * gerade gebrochene Regel gut. Gemessen am 26.9.2026 bei 87–100 % CPU:
 * `kontakt-betreff-kodiert` ergab „bewacht (tests/kein-alter-app-name.test.ts,
 * 50s)", mit einer Minute Frist `src/login/kontakt.test.ts`. Kosten hat die
 * Frist nur, wo ein Test wirklich hängt.
 */
function testlauf(vitest, datei = null) {
  const auswahl = datei ? [datei] : []
  return spawnSync(process.execPath, [vitest, 'run', ...auswahl, '--reporter=dot', '--bail=1', '--testTimeout=60000'], {
    cwd: wurzel,
    encoding: 'utf8',
    /*
     * `MUTATIONSPROBE` sagt dem Testlauf, dass er gerade **innerhalb** der
     * Probe läuft. Nur die Ankerprüfung (`mutationsprobe.test.ts`) tritt dann
     * zurück: Sie verlangt, dass jedes `suchen` genau einmal dasteht — und
     * genau das macht die Mutation ja zunichte. Ohne diese Weiche wäre sie bei
     * **jeder** Mutation der erste rote Test, `--bail=1` bräche dort ab, und
     * die Probe schriebe allen 192 Regeln „bewacht" gut, ohne eine einzige
     * gemessen zu haben (am 21.9.2026 genau so passiert, 14 von 14).
     */
    env: { ...process.env, CI: 'true', MUTATIONSPROBE: '1' },
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Die Summenzeilen, die vitest ans Ende jedes Laufs schreibt, der Tests
 * gesammelt hat — auch nach einem Abbruch durch `--bail=1`:
 *
 *      Test Files  1 failed | 31 passed | 5 skipped (194)
 *           Tests  1 failed | 2272 passed | 25 skipped (2401)
 *
 * In Klammern steht die Gesamtzahl. Wo vitest keinen einzigen Test gesehen
 * hat, steht dort „no tests" — ohne Zahl.
 */
const TESTERGEBNIS = /^\s*(?:Test Files|Tests)\s+.*\(\d+\)\s*$/m

/**
 * **Hat vitest überhaupt getestet?** Nur dann sagt sein Rot etwas über die
 * Regel.
 *
 * Bis zum 26.9.2026 galt jeder Rückgabewert ≠ 0 als rot, also als „bewacht".
 * Im Worktree zeigte der Pfad zu vitest ins Leere, Node endete an „Cannot find
 * module" mit 1 — und die Probe schrieb jeder Regel „bewacht (unbekannt, 0s)"
 * gut, ohne dass ein einziger Test gelaufen war.
 *
 * Seither zählt ein Lauf nur, wenn vitest bis zu seinen Summenzeilen kam
 * (`TESTERGEBNIS`), gleich mit welchem Rückgabewert: Fehlen sie, hat nicht
 * vitest gesprochen, sondern etwas davor. Ebenso wenig zählt ein Lauf, der
 * nicht zu starten war (`error`, auch ein zu voller Puffer) oder abgeschossen
 * wurde (Signal).
 *
 * **„Cannot find module" auf stderr beweist hier allein nichts.** Anders als
 * tsc schreibt vitest seinen Fehlerbericht selbst nach stderr — `FAIL`-Zeilen,
 * Meldungen, Quelltextauszüge —, dazu die Konsolenausgaben der Tests. Ein
 * Test, der an einem fehlenden Modul scheitert, trägt die Wendung also auch
 * (gemessen am 26.9.2026) und ist ein gewöhnliches Rot. Sie nennt den Grund
 * nur, wo keine Summenzeile dasteht.
 *
 * **Entfärbt.** vitest färbt seine Ausgabe unter Windows auch in eine Pipe —
 * nur nicht, wenn `NO_COLOR` gesetzt ist oder ein Agent sie liest
 * (`CLAUDECODE`, `AI_AGENT`). Farbig fand `ersterWaechter` keinen Wächter, und
 * die Summenzeilen begännen mit Farbcodes statt mit „Test Files": Gemessen am
 * 26.9.2026 ohne diese drei Variablen, also wie im eigenen Terminal,
 * `import-bibellesung` → „bewacht (unbekannt, 31s)"; unter dem Agenten stand
 * an derselben Stelle `parse.test.ts`.
 *
 * `lauf` ist, was `spawnSync` zurückgibt. Rein, damit `mutationsprobe.test.ts`
 * jeden dieser Fälle nachstellen kann, ohne vitest zu starten. Ergebnis:
 * `{ rot, waechter }` — oder `{ fehler }` mit dem Grund, warum der Lauf nichts
 * aussagt. `waechter` ist die erste rote Testdatei; `null` bei Grün und dort,
 * wo vitest keine nennt (ein unbehandelter Fehler macht den Lauf rot, ohne dass
 * ein Test scheitert).
 */
export function testlaufBefund(lauf) {
  if (lauf.error) return { fehler: `Der Testlauf scheiterte: ${lauf.error.message}` }
  if (lauf.status === null) return { fehler: `Der Testlauf wurde abgebrochen (${lauf.signal}).` }

  const stderr = stripVTControlCharacters(lauf.stderr ?? '')
  const ausgabe = `${stripVTControlCharacters(lauf.stdout ?? '')}${stderr}`
  if (!TESTERGEBNIS.test(ausgabe)) {
    const fehlt = stderr.split(/\r?\n/).find((z) => z.includes('Cannot find module'))
    if (fehlt) return { fehler: `vitest ist nicht gelaufen — Node fand ein Modul nicht:\n  ${fehlt.trim()}` }
    return {
      fehler: `vitest endete mit ${lauf.status}, aber ohne ein einziges Testergebnis — getestet hat es nicht:\n${auszug(ausgabe)}`,
    }
  }

  const rot = lauf.status !== 0
  return { rot, waechter: rot ? ersterWaechter(ausgabe) : null }
}

/**
 * **Belegt das Rot die Regel?** Nur, wenn sein Wächter ohne Mutation grün ist.
 *
 * Gemeldet wird die Datei, deren Test zuerst rot wird — nicht die, die es
 * wegen der Mutation wird. Ist eine Datei schon ohne Mutation rot, wird sie es
 * bei jeder, und vitest startet sie ab dem zweiten Lauf sogar zuerst: Zuletzt
 * Rotes kommt nach vorn (`BaseSequencer.sort`), `--bail=1` bricht dort ab.
 * Gemessen am 3.10.2026: drei Tests ohne Mutation rot, und die Probe meldete
 * „10/10 Regeln bewacht" — acht durch `src/app/reducer.test.ts`, für Regeln in
 * `PlanungsKarte.tsx`, `persist.ts` und `useAbwesend.ts`. Nach dem Grünmachen
 * nannte jede Regel ihren eigenen Wächter.
 *
 * `mutiert` ist der Befund des Laufs mit Mutation, `ausgang` der desselben
 * Wächters allein **ohne** Mutation, beide aus `testlaufBefund`. `ausgang`
 * zählt nur, wenn `mutiert` rot ist; nennt `mutiert` keinen Wächter, ist es
 * der Lauf über alle Testdateien. Ergebnis: `mutiert`, wenn sein Befund gilt —
 * sonst `{ fehler }`.
 */
export function waechterBefund(mutiert, ausgang) {
  if (!mutiert.rot) return mutiert
  const wer = mutiert.waechter ?? 'der Lauf über alle Testdateien'
  if (ausgang.fehler) {
    return { fehler: `Ob ${wer} auch ohne Mutation rot ist, ließ sich nicht prüfen:\n${ausgang.fehler}` }
  }
  if (ausgang.rot) {
    return {
      fehler:
        `Ausgangsstand rot — erst grün machen: ${wer} ist auch ohne Mutation rot,\n` +
        'sein Rot belegt die Regel nicht. Alle roten Dateien zeigt `npx vitest run --testTimeout=60000`.',
    }
  }
  return mutiert
}

/**
 * **Ein Lauf, der nichts gemessen hat, beendet die Probe** — mit 2 wie jeder
 * andere Fall, in dem sie nicht messen kann. Weiterzumachen hieße, die
 * nächsten Regeln genauso zu „messen".
 */
function nichtGemessen(zweifel, sekunden) {
  console.log(`NICHT GEMESSEN (${sekunden}s)`)
  console.error(`\n${zweifel}\n`)
  console.error('Die Mutation ist zurückgenommen. Abbruch, statt der Regel ein Ergebnis gutzuschreiben.')
  process.exit(2)
}

/** Aus der Ausgabe (ohne Farbcodes) die erste rote Testdatei ziehen — als Beleg, WER bewacht. */
function ersterWaechter(ausgabe) {
  const treffer = /(?:FAIL|❯|×)\s+([\w./-]+\.test\.tsx?)/.exec(ausgabe)
  return treffer?.[1] ?? null
}

/**
 * Der Text mit der Mutation. `ersetzen` gilt **wörtlich**: Als Zeichenkette an
 * `replace` übergeben, würden `$&`, `$1`, `` $` `` und `$'` darin als
 * Sonderfolgen gelesen, und die Probe schriebe eine andere Mutation als die
 * beschriebene (16.10.2026, Review — kein Eintrag trug bis dahin eine).
 */
export function mutiert(text, m) {
  return text.replace(m.suchen, () => m.ersetzen)
}

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

function main() {
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

  /*
   * Vorprüfung über den GANZEN Katalog, nicht nur die Auswahl: Ein Eintrag, der
   * seine Stelle verloren hat, soll auch dann auffallen, wenn gerade ein anderer
   * gemessen wird.
   *
   * Gemeldet werden **alle** verrutschten Einträge auf einmal, nicht nur der
   * erste. Nach einem Umbau sind es selten einzelne — am 21.9.2026 waren es 16
   * (T112) —, und wer sie einen nach dem anderen erfährt, sucht sie einen nach
   * dem anderen.
   */
  const verrutscht = ankerFehler()
  if (verrutscht.length > 0) {
    console.error(
      `\n${verrutscht.length} von ${KATALOG.length} Einträgen finden ihre Stelle nicht mehr:\n`,
    )
    for (const f of verrutscht) {
      console.error(`  ${f.id.padEnd(34)} ${f.treffer}× in ${f.datei}`)
    }
    console.error(
      `\nErwartet ist genau 1×. Die Stellen haben sich verschoben. Einträge nachziehen\n` +
        `(oder streichen, wenn die Regel weggefallen ist) — nicht stillschweigend\n` +
        `überspringen: Solange einer bricht, misst die Probe gar nichts.\n`,
    )
    process.exit(2)
  }

  if (nurListe) {
    for (const m of auswahl) console.log(`${m.id.padEnd(32)} ${m.regel}`)
    console.log(`\n${auswahl.length} Einträge.`)
    process.exit(0)
  }

  // Nach `--liste`, das ohne vitest auskommt — und vor der ersten Mutation.
  const vitest = vitestPfad()

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

  /*
   * Der Ausgangsstand je Wächter (siehe `waechterBefund`), einmal je Durchgang.
   *
   * Je Wächter statt einmal die ganze Suite vorab: Ein Wächter allein kostet
   * 1–3 s, die Suite 41 s (gemessen am 3.10.2026, 212 Dateien, ohne
   * Fremdlast) — vorab fiele das bei jedem Aufruf an, auch für eine einzige
   * Regel. Und geprüft wird genau, was die Probe behauptet: dass DIESE Datei
   * der Mutation wegen rot wird.
   */
  const ausgaenge = new Map()
  const ausgangVon = (waechter) => {
    if (!ausgaenge.has(waechter)) ausgaenge.set(waechter, testlaufBefund(testlauf(vitest, waechter)))
    return ausgaenge.get(waechter)
  }

  const ergebnisse = []
  for (const [i, m] of auswahl.entries()) {
    const pfad = join(wurzel, m.datei)
    // Roh zum Zuruecklegen, mit LF zum Suchen — siehe `lies`.
    laufendeDatei = pfad
    laufenderInhalt = readFileSync(pfad, 'utf8')

    process.stdout.write(`[${i + 1}/${auswahl.length}] ${m.id} … `)
    writeFileSync(pfad, mutiert(lies(pfad), m))
    const start = Date.now()
    const lauf = testlauf(vitest)
    zuruecksetzen()

    // Den Wächter erst jetzt fragen: ohne Mutation — darum geht es.
    const befund = testlaufBefund(lauf)
    const urteil = waechterBefund(befund, befund.rot ? ausgangVon(befund.waechter) : undefined)
    const sekunden = Math.round((Date.now() - start) / 1000)
    if (urteil.fehler) nichtGemessen(urteil.fehler, sekunden)
    const { rot, waechter } = urteil
    ergebnisse.push({ ...m, rot, waechter })
    console.log(rot ? `bewacht (${waechter ?? 'unbekannt'}, ${sekunden}s)` : `UNBEWACHT (${sekunden}s)`)
  }

  const offen = ergebnisse.filter((e) => !e.rot)
  console.log(`\n${ergebnisse.length - offen.length}/${ergebnisse.length} Regeln bewacht.`)
  if (ausgaenge.size > 0) console.log(`Ausgangsstand: ${ausgaenge.size} Wächter ohne Mutation geprüft, alle grün.`)

  if (offen.length > 0) {
    console.log('\nUnbewacht — diese Regeln kann man entfernen, ohne dass ein Test es merkt:\n')
    for (const e of offen) console.log(`  ${e.id.padEnd(32)} ${e.datei}\n${' '.repeat(36)}${e.regel}`)
    process.exit(1)
  }
}

/**
 * **Nur losmessen, wenn jemand das Skript wirklich gestartet hat.**
 *
 * `scripts/mutationsprobe.test.ts` importiert diese Datei wegen `ankerFehler`.
 * Ohne diese Weiche liefe beim Import die ganze Probe an — mitten im Testlauf,
 * Quelldateien umschreibend, mit einem zweiten vitest darin.
 *
 * Der Pfadvergleich statt `import.meta.main`: Das gibt es erst ab Node 24.2,
 * und wo es fehlt, wäre es `undefined` — die Probe täte dann beim Aufruf
 * stillschweigend nichts. Unter Windows wird die Groß-/Kleinschreibung
 * ignoriert, sonst entschiede die Schreibweise des Aufrufs darüber, ob
 * gemessen wird.
 */
function selbstGestartet() {
  const eintrag = process.argv[1]
  if (!eintrag) return false
  const a = resolve(eintrag)
  const b = fileURLToPath(import.meta.url)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

if (selbstGestartet()) main()
