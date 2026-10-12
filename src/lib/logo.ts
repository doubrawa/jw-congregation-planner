/**
 * Das Logo aus `public/` — über `BASE_URL`, damit es auch unter dem
 * GitHub-Pages-Unterpfad lädt.
 *
 * Einmal hier statt je Bildschirm eine Kopie: Drei Stellen trugen dieselbe
 * Zeile, und die vierte (die Passwort-Ansicht) hatte statt des Logos noch eine
 * „JW"-Zeile ohne Gestaltung stehen — übrig aus dem Prototyp.
 */
export const LOGO = `${import.meta.env.BASE_URL}logo.svg`

/*
 * Die kleine Fassung (3-5-7, `public/logo-klein.svg`) braucht hier keinen
 * Pfad mehr: Das Favicon steht in `index.html`, und Menü und Leiste zeichnen
 * sie seit T121 selbst, in den Farben der Darstellung (`bausteine/Logo.tsx`).
 */
