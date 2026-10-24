import { useState } from 'react'
import { createPortal } from 'react-dom'
import { gueltigBis } from '../../supabase/functions/_shared/anmeldung.ts'
import { useApp } from '../app/context'
import { Spur } from '../bausteine/Spur'
import { Sheet } from '../components/Sheet'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import { NamenKnoepfe } from './NamenKnoepfe'
import { sprachDerVersammlung, useLinksAusstellen } from './useLinksAusstellen'
import { useZettelDruck } from './useZettelDruck'

/** Wie viele Personen wie weit sind — die Spur oben im Blatt. */
export interface AnmeldeZahlen {
  angelegt: number
  link: number
  angemeldet: number
}

/** Adressen, die sich mehrere teilen, mit ihren Namen — in der Folge der Liste. */
function geteilteAdressen(personen: readonly Person[]): string[][] {
  const je = new Map<string, Person[]>()
  for (const p of personen) {
    const adresse = p.mail.trim().toLowerCase()
    je.set(adresse, [...(je.get(adresse) ?? []), p])
  }
  return [...je.values()].filter((liste) => liste.length > 1).map((liste) => liste.map(displayName))
}

/**
 * **Links senden** (T121, Phase 8; Entwurf `GAlleEinladen`): allen, die die
 * Liste in der Auswahl „Ohne Link" gerade zeigt, auf einmal ihren Zugang
 * geben — Suche und Filter grenzen weiter ein, etwa auf eine Gruppe. Wer eine
 * Adresse hat, bekommt die E-Mail, die übrigen einen Zettel.
 *
 * **Nur Links.** Den Plan sendet der Planer wie gewohnt („Plan senden"), und
 * wer noch nicht angemeldet ist, steht dort eigens da.
 *
 * Kann die App gerade keine E-Mails senden, stellt der Server nichts aus und
 * das Blatt sagt es — kein Link geht dabei verloren. Der Weg über das eigene
 * Mail-Programm steht dann bei jeder Person einzeln („Link senden").
 */
export function LinksSendenBlatt({ personen, zahlen, onClose }: { personen: readonly Person[]; zahlen: AnmeldeZahlen; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const ausstellen = useLinksAusstellen()
  const druck = useZettelDruck()
  const [laeuft, setLaeuft] = useState(false)
  const [vorschau, setVorschau] = useState<{ betreff: string; text: string } | null>(null)
  const perMail = personen.filter((p) => p.mail.trim())
  const ohneMail = personen.filter((p) => !p.mail.trim())
  const liste = new Intl.ListFormat(LOCALES[state.lang], { type: 'conjunction' })

  // Die E-Mail, wie die erste Person sie bekäme — erst beim Aufklappen geladen.
  const vorschauLaden = async () => {
    if (vorschau || !perMail[0]) return
    const { linkMail } = await import('../../supabase/functions/_shared/anmelde-mail.ts')
    const url = `${new URL(import.meta.env.BASE_URL, window.location.origin).href}#anmelden=…`
    const lang = sprachDerVersammlung(state.congLang)
    // Link und Code gibt es erst beim Senden — je Person ein eigener.
    const code = '····-····'
    setVorschau(linkMail(lang, { person: perMail[0], versammlung: state.congregation.name, url, code, gueltigBis: gueltigBis(new Date()) }))
  }

  const senden = async () => {
    if (laeuft || perMail.length === 0) return
    setLaeuft(true)
    try {
      const r = await ausstellen(
        perMail.map((p) => p.id),
        true,
      )
      if (!r) return
      if (!r.fehler && !r.mailBereit) {
        dispatch({ type: 'showToast', text: t.mailNichtBereit })
        return
      }
      const gesendet = r.links.filter((l) => l.gesendet).length
      const nicht = perMail.length - gesendet
      dispatch({
        type: 'showToast',
        text: nicht > 0 ? fill(t.toastLinksTeils, { n: gesendet, m: nicht }) : fill(t.toastLinksGesendet, { n: gesendet }),
      })
      if (nicht === 0) onClose()
    } finally {
      setLaeuft(false)
    }
  }

  return createPortal(
    <Sheet label={t.linksSenden} title={t.linksSenden} variante="lang" onClose={onClose}>
      <div className="sheet-inhalt link-blatt">
        <Spur
          label={t.standDerAnmeldung}
          schritte={[
            { name: t.spurAngelegt, wert: String(zahlen.angelegt), lage: 'voll' },
            { name: t.standLink, wert: String(zahlen.link), lage: 'jetzt' },
            { name: t.standAngemeldet, wert: String(zahlen.angemeldet), lage: zahlen.angemeldet > 0 ? 'teil' : 'leer' },
          ]}
        />
        <p className="klein-text">{t.linksSendenIntro}</p>

        {perMail.length > 0 && (
          <section className="link-weg" aria-labelledby="links-per-mail">
            <h3 id="links-per-mail" className="link-weg-titel">
              {t.perEmail} · {perMail.length}
            </h3>
            <details className="link-vorschau" onToggle={(e) => e.currentTarget.open && void vorschauLaden()}>
              <summary>{t.mailVorschau}</summary>
              {vorschau && (
                <div className="link-vorschau-mail">
                  <p className="klein-text" dir="auto">
                    {fill(t.betreffLbl, { betreff: vorschau.betreff })}
                  </p>
                  <p className="link-vorschau-text" dir="auto">
                    {vorschau.text}
                  </p>
                </div>
              )}
            </details>
            {geteilteAdressen(perMail).map((namen) => (
              <div key={namen.join('|')} className="link-geteilt">
                <span className="link-weg-titel">{t.eineAdresseMehrere}</span>
                <span className="klein-text">{fill(t.eineAdresseMehrereHint, { namen: liste.format(namen) })}</span>
              </div>
            ))}
          </section>
        )}

        {ohneMail.length > 0 && (
          <section className="link-weg" aria-labelledby="links-ohne-mail">
            <h3 id="links-ohne-mail" className="link-weg-titel">
              {t.ohneEmail} · {ohneMail.length}
            </h3>
            <p className="klein-text">{t.ohneEmailListeHint}</p>
            <p className="klein-text">{t.ohneAppHint}</p>
            <div className="konto-knoepfe">
              <button type="button" className="knopf-umriss" aria-disabled={druck.laeuft || undefined} onClick={() => void druck.drucken(ohneMail)}>
                {t.zettelDrucken}
              </button>
            </div>
            <details className="link-vorschau">
              <summary>{t.werIstDas}</summary>
              <NamenKnoepfe personen={ohneMail} onGewaehlt={onClose} />
            </details>
          </section>
        )}

        {perMail.length > 0 && (
          <button type="button" className="knopf-haupt" aria-disabled={laeuft || undefined} onClick={() => void senden()}>
            {laeuft ? t.wirdGesendet : t.linksSenden}
          </button>
        )}
      </div>
      {druck.bogen}
    </Sheet>,
    document.body,
  )
}
