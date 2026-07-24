#!/usr/bin/env bash
#
# Erzeugt alle Screenshots der Benutzerdokumentation neu.
#
# Voraussetzung: der Dev-Server läuft (`npm run dev`, Port 5173). Die App wird
# über den DEV-Debug-Hash direkt in den jeweiligen Zustand versetzt
# (Demo-Modus, kein Login/Netz):
#   #s=<screen>&tab=<mid|we|fs>&pl=<0|1>&p=<personId>&t=<theme>&l=<lang>&c=<congLang>
# Details siehe src/app/init.ts (parseDebugHash).
#
# Aufruf:  bash docs/user-guide/capture-screenshots.sh
#
set -euo pipefail

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
BASE="http://localhost:5173"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/screenshots"
PROFILE="${TEMP:-/tmp}/jw-doc-chrome"
W=1280
H=940

mkdir -p "$OUT_DIR"

if ! curl -s -o /dev/null "$BASE/"; then
  echo "FEHLER: Dev-Server läuft nicht auf $BASE — bitte 'npm run dev' starten." >&2
  exit 1
fi

# name|hash  (hash ohne führendes #)
SHOTS=(
  "login|s=login"
  "programm-woche|s=programm&tab=mid"
  "programm-wochenende|s=programm&tab=we"
  "programm-treffpunkte|s=programm&tab=fs"
  "verkuendiger-start|s=start&pl=0&p=p9"
  "verkuendiger-aufgaben|s=aufgaben&pl=0&p=p9"
  "verkuendiger-profil|s=profil&pl=0&p=p9"
  "planer-start|s=start"
  "planer-aufgaben|s=aufgaben"
  "planer-planen-woche|s=planen&tab=mid"
  "planer-planen-treffpunkte|s=planen&tab=fs"
  "planer-personen|s=personen"
  "planer-person-detail|s=personen&p=p1"
  "planer-einstellungen|s=einstellungen"
)

for entry in "${SHOTS[@]}"; do
  name="${entry%%|*}"
  hash="${entry#*|}&t=weiss" # helles Theme für einheitliche, druckfreundliche Doku
  out="$OUT_DIR/$name.png"
  # Windows-Pfad für Chrome (Vorwärts-Slashes funktionieren)
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --window-size="$W,$H" --force-device-scale-factor=1 \
    --hide-scrollbars --virtual-time-budget=8000 \
    --screenshot="$out" "$BASE/#$hash" >/dev/null 2>&1 || true
  if [ -f "$out" ]; then echo "  ✓ $name.png"; else echo "  ✗ $name.png (nicht erzeugt)" >&2; fi
done

echo "Fertig — $(ls -1 "$OUT_DIR"/*.png 2>/dev/null | wc -l) Screenshots in $OUT_DIR"
