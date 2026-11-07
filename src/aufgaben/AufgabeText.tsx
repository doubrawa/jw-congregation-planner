import { Fragment } from 'react'
import { useAppSelector } from '../app/context'
import type { MeetingAssignment } from '../data/types'
import { versammlungsSprache } from '../i18n/langs'
import { aufgabenHaelften, aufgabenSprache, aufgabenTermin, aufgabenTitelSprache, useT } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { abstandVorn } from './aufgabe-anzeige'

/**
 * **Zeilen aus zwei Sprachen** (T173): Was aus dem Programm kommt — Punkt,
 * Termin, Zuteilung —, steht in der Sprache der Versammlung, was die App sagt,
 * in der des Lesers. Jeder Teil trägt sein `lang`: Nach ihm trennt der Browser
 * (T128), und nach ihm spricht ein Vorleseprogramm (WCAG 3.1.2). In einer
 * Zeichenkette stünden beide Teile unter einem `lang` — eine arabische App läse
 * das russische Programm mit arabischer Stimme.
 */

/**
 * Programmpunkt und Rolle einer Aufgabe in einer Zeile: der Punkt mit dem
 * `lang` des Programms (`aufgabenTitelSprache`), die Rolle in der Sprache des
 * Lesers. Ein `lang` für beide trennte bei englischer App und deutscher
 * Versammlung „Student" nach deutschen Regeln.
 */
export function AufgabeText({ task }: { task: { title: string; rolle?: string; lesersprache?: boolean } }) {
  const lang = useAppSelector((s) => s.lang)
  const congLang = useAppSelector((s) => s.congLang)
  const i18n = useT()
  const { punkt, rolle } = aufgabenHaelften(task, i18n)
  return (
    <>
      {punkt && <span lang={aufgabenTitelSprache(task, lang, congLang)}>{punkt}</span>}
      {punkt && rolle && ' · '}
      {rolle}
    </>
  )
}

/** Der Termin einer Aufgabe („Dienstag, 8. September · 19:00") mit dem `lang` des Programms. */
export function AufgabeTermin({ task }: { task: { date: string; lesersprache?: boolean } }) {
  const lang = useAppSelector((s) => s.lang)
  const congLang = useAppSelector((s) => s.congLang)
  const i18n = useT()
  return <span lang={aufgabenSprache(task, lang, congLang)}>{aufgabenTermin(task, i18n)}</span>
}

/**
 * Wann eine Aufgabe ist: der Abstand in Worten, dann der Termin — „Morgen ·
 * Dienstag, 8. September · 19:00"; ohne Kalendertag nur der Termin. Auf dem
 * Start, unter „Meine Aufgaben", im Blatt beim Öffnen und beim Tauschen.
 */
export function AufgabeWann({ task }: { task: { date: string; at?: number | null; lesersprache?: boolean } }) {
  const lang = useAppSelector((s) => s.lang)
  const abstand = abstandVorn(task.at, lang)
  return (
    <>
      {abstand && `${abstand} · `}
      <AufgabeTermin task={task} />
    </>
  )
}

/**
 * Was jemand an einem Tag schon hat („Bibellesung, Mikrofone") — jede
 * Zuteilung in der Sprache, die ihr Text verlangt (`MeetingAssignment.lang`):
 * Programmpunkte in der der Versammlung, Rollen und Dienste in der des Lesers.
 */
export function ZuteilungenText({ liste }: { liste: readonly MeetingAssignment[] }) {
  const congLang = useAppSelector((s) => s.congLang)
  const { tp, tu } = useT()
  return (
    <>
      {liste.map((a, i) => (
        <Fragment key={i}>
          {i > 0 && ', '}
          {a.lang === 'u' ? zahlBinden(tu(a.text)) : <span lang={versammlungsSprache(congLang)}>{zahlBinden(tp(a.text))}</span>}
        </Fragment>
      ))}
    </>
  )
}
