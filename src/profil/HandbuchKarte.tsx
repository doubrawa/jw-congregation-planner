import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import { HANDBUCH } from './handbuch'

/**
 * **Das Handbuch aus der App öffnen** (1.11.2026): im Profil neben „Erste
 * Schritte". Jeder sieht das Handbuch für Verkündiger, wer planen darf auch
 * das für Planer. Bis dahin führte kein Weg aus der App dorthin.
 *
 * Die Handbücher gibt es nur auf Deutsch. Außerhalb des Deutschen sagt es der
 * Titel selbst — „User guide (in German)" —, damit niemand eine Seite in
 * seiner Sprache erwartet. Der Hinweis steht als ganzer Titel im Wörterbuch,
 * nicht zusammengesetzt: Die Sprachnamen der App sind Listenformen, und mitten
 * im Satz hieß es „(Allemand)", „(Tedesco)" (Review 1.11.2026).
 *
 * Die Verweise öffnen sich außerhalb der App (`_blank`): Wer das Handbuch
 * liest, findet die App danach dort, wo er sie verlassen hat.
 */
export function HandbuchKarte({ fuerPlaner }: { fuerPlaner: boolean }) {
  const { t } = useT()
  const verweise = [
    { key: 'verkuendiger', text: t.handbuchVerkuendiger, href: HANDBUCH.verkuendiger },
    ...(fuerPlaner ? [{ key: 'planer', text: t.handbuchPlaner, href: HANDBUCH.planer }] : []),
  ]
  return (
    <section className="karte profil-karte">
      <h2 className="abschnitt-titel karte-titel">{t.handbuch}</h2>
      {verweise.map((v) => (
        <a
          key={v.key}
          className="profil-zeile profil-verweis"
          href={v.href}
          hrefLang="de"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{v.text}</span>
          <Zeichen name="weiter" />
        </a>
      ))}
    </section>
  )
}
