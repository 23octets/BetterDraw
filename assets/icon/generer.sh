#!/bin/zsh
# Régénère les icônes servies dans public/ à partir des SVG de ce dossier.
# Nécessite Google Chrome (macOS) pour le rendu et ImageMagick pour l'assemblage.
set -e
cd "$(dirname "$0")"
ICI=$PWD
PUB=$ICI/../../public
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
nettoyer() {
  rm -f "$TMP/t.html" "$TMP/t.png" "$TMP/16.png" "$TMP/32.png" "$TMP/48.png" "$TMP/apple.png"
  rmdir "$TMP"
}
trap nettoyer EXIT

rendre() { # source.svg taille sortie.png
  print "<!doctype html><body style='margin:0;background:transparent'><img src='file://$ICI/$1' width=$2 height=$2 style='display:block'>" > "$TMP/t.html"
  "$CH" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --default-background-color=00000000 \
    --window-size=800,800 --screenshot="$TMP/t.png" "file://$TMP/t.html" >/dev/null 2>&1
  magick "$TMP/t.png" -crop "$2x$2+0+0" +repage "PNG32:$3"
}

# Onglets : le SVG et la taille 16 utilisent le dessin calé sur 16 px, plus net en petit.
cp icon-16.svg "$PUB/favicon.svg"
rendre icon-16.svg 16 "$TMP/16.png"
rendre icon.svg 32 "$TMP/32.png"
rendre icon.svg 48 "$TMP/48.png"
magick "$TMP/16.png" "$TMP/32.png" "$TMP/48.png" "$PUB/favicon.ico"

# Écran d'accueil iOS : fond opaque, sans coins arrondis.
rendre icon-plein.svg 180 "$TMP/apple.png"
magick "$TMP/apple.png" -background '#efebe3' -alpha remove -alpha off "PNG24:$PUB/apple-touch-icon.png"

# Manifest (Android, Chrome, Edge).
rendre icon.svg 192 "$PUB/icon-192.png"
rendre icon.svg 512 "$PUB/icon-512.png"
rendre icon-maskable.svg 192 "$PUB/icon-maskable-192.png"
rendre icon-maskable.svg 512 "$PUB/icon-maskable-512.png"
