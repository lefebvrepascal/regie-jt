#!/bin/bash
# Double-cliquez sur ce fichier (Mac) pour lancer le relais du direct,
# puis la régie s'ouvre dans Google Chrome.
cd "$(dirname "$0")" || exit 1
if [ -f ./ffmpeg ]; then chmod +x ./ffmpeg 2>/dev/null; xattr -d com.apple.quarantine ./ffmpeg 2>/dev/null; fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Téléchargez-le sur https://nodejs.org (version LTS), puis relancez ce fichier."
  read -r -p "Appuyez sur Entrée pour fermer."
  exit 1
fi
( sleep 1.5; open -a "Google Chrome" "http://localhost:8686" 2>/dev/null || open "http://localhost:8686" ) &
node relais-direct.js
read -r -p "Le relais s'est arrêté. Appuyez sur Entrée pour fermer."
