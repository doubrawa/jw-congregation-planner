#!/usr/bin/env bash
#
# Erzeugt alle Screenshots der Benutzerdokumentation neu.
#
# Voraussetzung: der Dev-Server läuft (`npm run dev`, Port 5173). Die App wird
# über den DEV-Debug-Hash direkt in den jeweiligen Zustand versetzt
# (Demo-Modus, kein Login/Netz):
#   #s=<screen>&tab=<mid|we|fs>&pl=<0|1>&p=<personId>&me=<personId>&t=<theme>&l=<lang>&c=<congLang>
# (`p=` waehlt eine Person im Personen-Screen aus, `me=` meldet sie an — davon
#  haengt ab, was jemand von seiner eigenen Gruppe sieht.)
# Details siehe src/app/init.ts (parseDebugHash).
#
# Aufruf:  bash docs/user-guide/capture-screenshots.sh
#
set -euo pipefail

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
BASE="http://localhost:5173"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/screenshots"
PROFILE="${TEMP:-/tmp}/jw-doc-chrome"
# Standardbreite = Desktop-Breakpoint (920): Sidebar 232 + Inhalt max. 660 = 892,
# füllt das Bild fast randlos. Einzelne Shots (Login ohne Sidebar) überschreiben
# die Größe über ein drittes Feld `BxH`.
W=920
H=940

mkdir -p "$OUT_DIR"

if ! curl -s -o /dev/null "$BASE/"; then
  echo "FEHLER: Dev-Server läuft nicht auf $BASE — bitte 'npm run dev' starten." >&2
  exit 1
fi

# name|hash[|BxH]  (hash ohne führendes #; optionale Größe überschreibt W×H)
SHOTS=(
  "login|s=login|920x780"
  "programm-woche|s=programm&tab=mid"
  "programm-wochenende|s=programm&tab=we"
  "programm-treffpunkte|s=programm&tab=fs"
  "verkuendiger-start|s=start&pl=0&p=p9"
  "verkuendiger-aufgaben|s=aufgaben&pl=0&p=p9"
  "verkuendiger-profil|s=profil&pl=0&p=p9"
  # Angemeldet als p9 (Gruppe 1): zeigt die Treffpunkte der EIGENEN Gruppe —
  # fremde Gruppen stehen hier bewusst nicht (siehe fsVisible in src/data/fs.ts).
  "verkuendiger-treffpunkte|s=programm&tab=fs&pl=0&me=p9"
  "planer-start|s=start"
  "planer-aufgaben|s=aufgaben"
  "planer-planen-woche|s=planen&tab=mid"
  "planer-planen-treffpunkte|s=planen&tab=fs"
  "planer-personen|s=personen"
  # höher als der Rest: unter den Stammdaten folgen die Zeitleiste der
  # Zuteilungen, die Abwesenheiten und die beiden Bereichs-Karten (Aufgaben,
  # Hilfsdienste). Reicht die Höhe nicht, schneidet Chrome unten ab — die Seite
  # war mit der Abwesenheiten-Karte auf 2946px gewachsen.
  "planer-person-detail|s=personen&p=p1|920x3100"
  "planer-einstellungen|s=einstellungen"
  "offline-stand|s=programm&tab=mid&stale=5"
)

for entry in "${SHOTS[@]}"; do
  IFS='|' read -r name hash size <<< "$entry"
  w="$W"; h="$H"
  if [ -n "${size:-}" ]; then w="${size%x*}"; h="${size#*x}"; fi
  hash="$hash&t=weiss&shot=1" # helles Theme + Screenshot-Modus (Spaltenschatten aus)
  out="$OUT_DIR/$name.png"
  # Windows-Pfad für Chrome (Vorwärts-Slashes funktionieren)
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --window-size="$w,$h" --force-device-scale-factor=1 \
    --hide-scrollbars --virtual-time-budget=8000 \
    --screenshot="$out" "$BASE/#$hash" >/dev/null 2>&1 || true
  if [ -f "$out" ]; then echo "  ✓ $name.png"; else echo "  ✗ $name.png (nicht erzeugt)" >&2; fi
done

# Auf den Inhalt zuschneiden (entfernt die einfarbige Zentrier-Lücke rundherum).
echo "Zuschneiden ..."
node "$(dirname "$0")/trim.mjs" "$OUT_DIR"/*.png

echo "Fertig — $(ls -1 "$OUT_DIR"/*.png 2>/dev/null | wc -l) Screenshots in $OUT_DIR"
