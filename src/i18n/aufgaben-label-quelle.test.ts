import { describe, expect, it } from 'vitest'

/**
 * Eine Aufgabe wird **nirgends** von Hand beschriftet.
 *
 * `MyTask` trägt zwei Hälften in zwei Sprachen: `title` in der der
 * Versammlung, `rolle` in der des Lesers. Wer nur eine davon rendert, bekommt
 * je nach Aufgabe die falsche Sprache — oder gar nichts: bei Vorsitz, Gebet,
 * Ratgeber, Hilfsdiensten und Treffpunkten ist `title` **leer**, die
 * Bezeichnung steckt allein in `rolle`.
 *
 * Genau das ist beim Umbau passiert. Vier Anzeigestellen wurden umgestellt,
 * die fünfte — der Bestätigungs-Dialog beim App-Start — blieb bei
 * `tp(task.title)` und zeigte für jede Rollen-Aufgabe eine **leere Zeile**.
 * Aufgefallen ist es erst beim zeilenweisen Durchgehen, nicht durch einen Test:
 * die Aufgaben-Tests prüfen die Ableitung, nicht das Rendern, und der
 * Demo-Modus liefert feste Aufgaben ohne Rollen-Hälfte.
 *
 * Deshalb hier eine Prüfung am Quelltext, nach dem Vorbild von
 * `testdaten-grenze.test.ts`: Die beiden Felder dürfen nur an den Stellen
 * einzeln auftauchen, die sie zusammensetzen. Überall sonst gilt
 * `aufgabenLabel` (Anzeige) bzw. `aufgabenBezeichnung` (kanonisch deutsch).
 */

/** Quelltext aller Dateien unter `src/` — über Vite, ohne Node-Abhängigkeit. */
const ROH = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Auf `verzeichnis/datei.ts` normiert, damit die Erwartungen lesbar bleiben.
 *
 * Zwei Formen kommen an: Nachbarverzeichnisse als `../data/planning.ts`,
 * Dateien **dieses** Verzeichnisses als `./useT.ts` — Vite kürzt den Pfad auf
 * die kürzeste Schreibweise. Wer nur `../` abschneidet, verliert die halbe
 * Liste, ohne dass es auffällt.
 */
const HIER = 'i18n/'
const QUELLEN = new Map(
  Object.entries(ROH).map(([pfad, text]) => [
    pfad.startsWith('./') ? HIER + pfad.slice(2) : pfad.replace(/^(\.\.\/)+/, ''),
    text,
  ]),
)

/** Die beiden Stellen, an denen die Hälften zusammenkommen. */
const ZUSAMMENSETZER = ['data/planning.ts', 'i18n/useT.ts']

/**
 * Wer die Hälften **durchreicht**, ohne sie zu beschriften.
 *
 * Die Zeitleiste im Personen-Detail baut aus einer Aufgabe ihren eigenen
 * Eintrag und gibt beide Hälften unverändert weiter — beschriftet wird erst in
 * `PersonTimeline.tsx`, und zwar über `aufgabenLabel`. Wer hier etwas
 * hinzufügt, muss dasselbe zusichern können.
 */
const DURCHREICHER = ['personen/person-timeline.ts']

const ERLAUBT = [...ZUSAMMENSETZER, ...DURCHREICHER].sort()

describe('Aufgaben-Beschriftung entsteht an einer Stelle', () => {
  const einzelzugriffe = [...QUELLEN]
    .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
    // `task.title` / `nextTask.rolle` — der Zugriff auf eine einzelne Hälfte.
    // Der Empfänger muss klein anfangen: `MyTask.rolle` in einem Kommentar
    // verweist auf den Typ und ist kein Zugriff. Programmpunkte (`item.title`)
    // sind ohnehin nicht gemeint.
    .filter(([, text]) => /(?<![\w.])(?:[a-z][A-Za-z0-9_]*)?[Tt]ask\.(?:title|rolle)\b/.test(text))
    .map(([pfad]) => pfad)
    .sort()

  it('nur die Zusammensetzer und die Zeitleiste greifen auf eine einzelne Hälfte zu', () => {
    expect(einzelzugriffe).toEqual(ERLAUBT)
  })

  it('die Zeitleiste beschriftet über aufgabenLabel, nicht selbst', () => {
    expect(QUELLEN.get('personen/PersonTimeline.tsx')).toContain('aufgabenLabel')
  })

  it('und beide setzen sie auch wirklich zusammen', () => {
    expect(QUELLEN.get('i18n/useT.ts')).toContain('export function aufgabenLabel')
    expect(QUELLEN.get('data/planning.ts')).toContain('export function aufgabenBezeichnung')
  })

  it('jede Anzeige einer Aufgabe nimmt eine der beiden Formen', () => {
    // Wer `myTasks` liest und dabei etwas beschriftet, muss über die Helfer
    // gehen. Dateien, die die Liste nur zählen oder filtern, sind nicht
    // gemeint — sie fassen keine Bezeichnung an.
    const beschriftet = [...QUELLEN]
      .filter(([pfad]) => pfad.endsWith('.tsx') && !/\.test\.tsx$/.test(pfad))
      .filter(([, text]) => /\bmyTasks\b/.test(text))
      .filter(([, text]) => /confirm-task-title|auf-title|dash-hero-title/.test(text))
      .map(([pfad]) => pfad)
      .sort()

    // Vier Anzeigestellen — genau die, die beim Umbau einzeln umgestellt
    // wurden. Kommt eine fünfte hinzu, fällt sie hier auf.
    expect(beschriftet).toEqual([
      'aufgaben/AufgabenScreen.tsx',
      'components/ConfirmDialog.tsx',
      'components/MyTaskSheet.tsx',
      'dashboard/DashboardScreen.tsx',
    ])
    for (const datei of beschriftet) {
      expect(QUELLEN.get(datei), datei).toContain('aufgabenLabel')
    }
  })
})
