# Offene Prüfungen — was die Analyse (noch) nicht abdeckt

Ergänzung zu [befunde.md](befunde.md) und [code-review.md](code-review.md).
Ursprünglich als Liste der Grenzen einer reinen Lese-Analyse angelegt; inzwischen
sind die Abschnitte A, B und C abgearbeitet (siehe Kasten unten). Die Prüfungen
selbst bleiben hier stehen, damit nachvollziehbar ist, was jeweils gesucht wurde.

Sortiert nach Nutzen pro Aufwand.

> **Stand 7. August 2026 — Abschnitte A, B und C sind abgearbeitet:**
> - **A** (ausführen) und **C** (Browser) → [pruefergebnisse.md](pruefergebnisse.md);
>   dabei kam der schwerste Befund der Analyse heraus (B18: Totalausfall in 30 Sprachen).
> - **B** (Lesen) → [lesepruefungen.md](lesepruefungen.md); dabei B20
>   (unvollständiges `schema.sql`) und fünf weitere Befunde.
>
> - **D** (Umgebung) → [umgebungspruefungen.md](umgebungspruefungen.md):
>   **D2 (jw.org-Parser) und D6 (Last) sind ausgeführt**, D1 als vollständige
>   Policy-Matrix ersetzt.
>
> **Endgültig offen** — braucht eine separate Testinstanz oder echte Hardware:
> D1/D3/D7 im Betrieb (bewusst **nicht** gegen die Produktivdatenbank aus
> `.env.local` getestet), D4 (echte Geräte), D5 (fachliche Abnahme). Aus **B**
> ungeklärt: der Wortlaut-Abgleich der Übersetzungen mit jw.org (B4) und ein
> gerenderter Soll-Ist-Vergleich mit den Design-Prototypen (B6).

---

## A. Sofort möglich, hoher Nutzen (nur ausführen) — ✅ erledigt

| # | Prüfung | Befehl / Vorgehen | Was sie findet |
| --- | --- | --- | --- |
| A1 | **Testlauf** | `npm test` | → **727 Tests, alle grün.** Läuft heute **nicht in CI** (`deploy.yml` baut nur), also weiß es niemand automatisch. |
| A2 | **Typprüfung** | `npx tsc -b` | Aktuelle Typfehler. Achtung: `strict` ist aus (Review 3.5) — der Lauf sagt weniger, als er sollte. |
| A3 | **Lint** | `npm run lint` | Regelsatz umfasst nur zwei Regeln (Review 3.7) — der Lauf ist schnell, die Aussage schmal. |
| A4 | **Echte Coverage** | `npm run test:coverage` | Meine Testlücken-Liste (befunde.md E) beruht auf Datei- und Testnamen, nicht auf Messwerten. `coverage/` ist gitignored. |
| A5 | **Produktionsbuild** | `npm run build` | Bundle-Größe, ob die Lazy-Chunks (34 Overlays, Bibelbücher) wirklich getrennt werden, Build-Warnungen. |
| A6 | **Kontrastprüfung** | `npm run contrast` | Das Skript existiert (`scripts/check-contrast.mjs`, 210 Zeilen) — ob es für alle **11** Paletten grün ist, weiß ich nicht. |
| A7 | **Abhängigkeiten** | `npm audit`, `npm outdated` | Bekannte Lücken; `vite@8`, `typescript@6`, `oxlint@1.71` sind sehr neue Stände. |
| A8 | **`strict` probeweise** | `strictNullChecks` in `tsconfig.app.json` setzen, `tsc -b` | Zeigt in einem Lauf, wie viele ungeprüfte Null-/Undefined-Pfade existieren. **Nur messen, nicht committen.** |

---

## B. Durch weiteres Lesen möglich — ✅ erledigt (siehe lesepruefungen.md)

| # | Bereich | Umfang | Warum es lohnt |
| --- | --- | --- | --- |
| B1 | **CSS komplett** | **5308 Zeilen** in 17 Dateien — von mir nur überflogen | Größter ungeprüfter Block des Projekts. Konkrete Fragen unten (§ B1a). |
| B2 | **Testinhalte statt Testnamen** | 51 Dateien | Ich habe `describe`/`it`-Namen gelesen, **keine Assertions**. Ein Test kann grün sein und nichts prüfen — oder eine falsche Erwartung zementieren (z. B. die Wochenspanne als Aufgaben-Datum, B4). |
| B3 | **`demo.ts` inhaltlich** | 528 Zeilen | Ist zugleich die Vorlage für `seedCongregation` — jeder Strukturfehler landet in **jeder** neu befüllten Versammlung. Enthält als einzige Quelle `current`, `co`, `mem`. |
| B4 | **Übersetzungs*qualität*** | 34 Overlays + `FRAG` | Geprüft ist nur **Vollständigkeit** (alle Schlüssel da). Ob „UNS IM DIENST VERBESSERN" in jeder Sprache dem aktuellen S-38-Wortlaut entspricht, ist offen — jw.org hat Rubriken schon umbenannt. Braucht Abgleich mit jw.org je Sprache. |
| B5 | **Benutzerhandbücher** | `docs/user-guide/planer.md` (319 Z.), `verkuendiger.md` (266 Z.) | Beschreiben sie den Ist-Stand? Die Screenshots werden per Skript erzeugt (`capture-screenshots.sh`) — sind sie aktuell? |
| B6 | **Design-Handoff-Abgleich** | `docs/design-handoff/` inkl. HTML-Prototyp | Der README sagt „pixelgenau nachbauen". Wo weicht die Umsetzung ab, und ist die Abweichung Absicht? |
| B7 | **Migrationskette** | 15 Dateien, `schema.sql` | Bringt eine v1-Datenbank, die alle 15 Migrationen in Reihenfolge einspielt, wirklich denselben Stand wie eine frische `schema.sql`? Sind alle wirklich idempotent? |
| B8 | **`i18n/de.ts` gegen Verwendung** | 264 Zeilen | Tote Schlüssel (nie benutzt) und fehlende (im Code fest verdrahtet). `ui.test.ts` prüft nur Vollständigkeit **innerhalb** der Wörterbücher, nicht gegen die Nutzung. |
| B9 | **Git-Historie als Fehlerspur** | ~60 Commits | Wiederkehrende Fixes an denselben Stellen zeigen, wo das Modell drückt. Mehrere Commit-Titel deuten schon darauf hin („Blaettern" 6×, „Gesten" 3×). |

### B1a — Konkrete CSS-Fragen

Was ich beim Überfliegen nicht beantworten konnte:

1. **Schriftgröße 1.45**: Jede `font-size` ist `calc(px * var(--fs))`. Halten die
   Layouts bei der größten Stufe, oder brechen Chips, Tabs und die Wochennavigation?
   Testbar über den Debug-Hash `#fs=1.45`.
2. **Alle 11 Paletten**: `tokens.css` (637 Zeilen) definiert sie. Ist jedes Token in
   jeder Palette gesetzt, oder erbt eine Palette still von der Basis?
3. **RTL**: `rtl.css` hat nur 54 Zeilen für vier Sprachen. Reicht das für Chips,
   Slider, Zeitleiste, Wochennavigation (Pfeilrichtung!) und die Wischgeste?
4. **Touch-Ziele**: Erreichen Slot-Chips, Stepper (`±`) und die
   LAC-Verschiebepfeile (`▲▼`) die 44 px?
5. **Fokus-Sichtbarkeit**: Gibt es überall einen sichtbaren Fokusring, auch auf den
   getönten Panels und in „Hoher Kontrast"?
6. **`prefers-reduced-motion`**: Wird es irgendwo berücksichtigt (Toast, Sheets,
   Wischanimation)?
7. **Safe-Area**: `viewport-fit=cover` ist gesetzt — nutzt das CSS
   `env(safe-area-inset-*)` für die Bottom-Nav auf dem iPhone?
8. **Druck**: `print.css` (216 Zeilen) — bricht das Programm sauber über Seiten,
   und ist die Zusätzliche Klasse mit drin?

---

## C. Nur mit laufender App (Browser) — ✅ erledigt (siehe pruefergebnisse.md)

| # | Prüfung | Wie |
| --- | --- | --- |
| C1 | **Durchklicken im Demo-Modus** | `npm run dev`, alle Screens, Konsole offen. Findet Laufzeitfehler, die kein Test abdeckt (alle Screens sind ungetestet). |
| C2 | **Die Befunde nachstellen** | B1 (Startwoche), B2 (Dashboard „0 Konflikte"), B3 (Bestätigung nach LAC-Löschen), B7 (Minuten bei engl. Import) — Demo-Modus reicht für B1/B2. |
| C3 | **Debug-Hashes systematisch** | `#s=<screen>&l=<lang>&fs=<scale>&pl=0|1&stale=<h>` — deckt Screens × 34 Sprachen × 5 Schriftgrößen × 2 Rollen schnell ab. |
| C4 | **RTL sichtbar prüfen** | `#l=ar`, `#l=he` — inkl. des in D6 beschriebenen LTR→RTL-Sprungs beim Start. |
| C5 | **Offline-Verhalten** | `npm run preview` (nur damit cacht der SW wie in Produktion), dann Netz trennen. |
| C6 | **Zoom 200 % / Tastaturbedienung** | Barrierefreiheits-Basis: Kommt man ohne Maus zu jedem Slot-Chip? |
| C7 | **Lighthouse / axe** | PWA-, a11y- und Performance-Basiswerte. |

---

## D. Nur außerhalb dieser Umgebung möglich

| # | Prüfung | Warum extern |
| --- | --- | --- |
| D1 | **RLS praktisch durchspielen** | Braucht eine echte Supabase-Instanz mit drei Konten (Planer, Verkündiger, Fremder). Prüft S2 (fremde Bestätigungen), S3, S7 (`seek` durch Unbeteiligte) real statt aus der Policy gelesen. |
| D2 | **Edge Functions gegen echtes jw.org** | Die Fixtures können veraltet sein. Ein Testimport in 3–4 Sprachen (inkl. RTL und CJK) zeigt, ob der Parser noch trifft. |
| D3 | **Push end-to-end** | VAPID-Schlüssel, Abo, Zustellung, iOS erst nach „Zum Home-Bildschirm". Auch: der Dry-Run von `send-reminders` per `curl` (zeigt zugleich S1). |
| D4 | **Echte Geräte** | iOS-Safari-PWA, Android-Chrome, älteres Tablet im Saal. Die Wischgeste hat laut Commit-Historie mehrfach genau dort versagt. `crypto.randomUUID` fehlt bei LAN-Tests über `http://` (Review 3.4). |
| D5 | **Fachliche Abnahme** | Ob die Abläufe stimmen, kann nur ein Koordinator/LuD-Aufseher sagen: Sind die Rubriken korrekt benannt? Ist die Auto-Zuteilung fair *im Sinne der Versammlung*? Fehlt eine Aufgabe? |
| D6 | **Last** | 300 Personen × 200 Wochen. Die Stellen aus Review § 6 (`structuredClone` je Zuteilung, dreifaches `buildAbsences`) sind heute unauffällig und skalieren linear bis quadratisch. |
| D7 | **Mehrbenutzer real** | Zwei Browser, dieselbe Woche, gleichzeitig planen → zeigt S5 (last write wins) in Sekunden. |

---

## E. Was bewusst nicht Teil der Analyse war

- **Rechtliches**: Nutzungsbedingungen von jw.org für den automatisierten Abruf.
  Der README adressiert es, bewerten kann es nur der Betreiber.
- **DSGVO-Dokumentation**: Verarbeitungsverzeichnis, Auftragsverarbeitung mit
  Supabase, Löschkonzept. Technisch angesprochen (S6, S8), rechtlich nicht bewertet.
- **Lizenzkonformität** der Abhängigkeiten.
- **Barrierefreiheit nach WCAG-Kriterien** — geprüft wurde nur, ob `aria`-Attribute
  vorhanden sind, nicht ob sie stimmen.

---

## Vorschlag für die Reihenfolge

1. **A1–A5** (fünf Befehle) — schafft die Faktenbasis: laufen die Tests, wie hoch ist
   die Coverage wirklich, wie groß ist das Bundle.
2. **C1 + C2** — die drei auffälligsten Befunde im Browser nachstellen, damit klar
   ist, ob sie sich so zeigen wie beschrieben.
3. **B2** (Testinhalte) — bevor neue Tests geschrieben werden, muss klar sein, was
   die bestehenden wirklich zusichern.
4. **B1/B1a** (CSS) — der größte verbleibende blinde Fleck.
5. **D1/D2** — vor dem nächsten produktiven Einsatz.
