#!/bin/bash
# Planches de contrôle : assemble les captures par vue pour les relire d'un coup d'œil.
cd "$(dirname "$0")/shots" || exit 1
N=(1-deux-tons 2-a-l-echelle 3-nuancier 4-chantier)
mkdir -p ../planches
for t in retour-mobile premier-mobile; do
  args=()
  for n in "${N[@]}"; do args+=( \( "$n-$t.png" -resize 390x -crop 390x2500+0+0 +repage -background '#777' -gravity north -extent 400x2500 \) ); done
  magick "${args[@]}" +append "../planches/$t.png"
done
for t in piece-pli premier-piece-pli menu-pli retour-pli premier-pli long-pli; do
  args=(); for n in "${N[@]}"; do args+=( "$n-$t.png" ); done
  magick montage "${args[@]}" -tile 2x2 -geometry 720x450+4+4 "../planches/$t.png"
done
for t in beaucoup tablette premier-tablette retour premier; do
  args=()
  for n in "${N[@]}"; do args+=( \( "$n-$t.png" -resize 480x -crop 480x2400+0+0 +repage -background '#777' -gravity north -extent 490x2400 \) ); done
  magick "${args[@]}" +append "../planches/$t.png"
done
