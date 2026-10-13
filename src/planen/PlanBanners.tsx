/**
 * Kopf der Warn-Banner im Planen der Besuche und Schichten.
 *
 * Die Banner der Zusammenkünfte (Konflikte, nicht besetzbar, offene
 * Zuteilungen) stehen seit T121 in der Besetzung der Woche (`BesetzungKarte`)
 * unter „Zu klären"; die Konflikte der Treffpunkte stehen am Platz ihres
 * Leiters (`leiterAnzeige`).
 */

/**
 * Kopfzeile eines Banners: Zeichen (`!` Konflikt, `?` offen), Titel und Zahl.
 * Fünf Banner trugen dieselben drei Zeilen — hier stehen sie einmal.
 */
export function BannerKopf({ zeichen, titel, anzahl }: { zeichen: '!' | '?'; titel: string; anzahl: number }) {
  return (
    <div className="plan-banner-head">
      <span className="plan-banner-badge">{zeichen}</span>
      <span className="plan-banner-title">{titel}</span>
      <span className="plan-banner-count">{anzahl}</span>
    </div>
  )
}
