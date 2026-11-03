# BetterDraw

Dessiner à l'échelle un décor mural, le peindre zone par zone, puis le reporter sur le vrai mur
grâce à une grille de carroyage cotée.

100 % local : tout est enregistré dans le navigateur (IndexedDB), à chaque modification.

## Lancer

```bash
npm install
npm run dev          # http://localhost:5199
```

## Fonctionnalités

- **Projets et mur** : mur rectangulaire en cm (300 × 250 cm par défaut), redimensionnable.
- **Grille de carroyage** : pas réglable, repères A1, B2… et cotes depuis le coin choisi (bas-gauche par défaut),
  dernière case partielle si besoin.
- **Tracé vectoriel** : polyligne (touche `A` pour les arcs tangents), arc 3 points, courbes de Bézier (plume).
  Aimantage sur les extrémités, intersections, milieux, traits, bords et grille fine ; `Shift` = 45°, `Alt` = sans aimant ;
  saisie numérique pendant le tracé (`120` ou `120<45`).
- **Mesure** : deux clics → distance, Δx, Δy, angle.
- **Édition** : sélection (clic, Shift, rectangle, ⌘A), poignées de points, courbure des segments en arc,
  déplacement, copier/coller/dupliquer, symétries, rotation, échelle.
- **Peinture** : pot de peinture sur les zones fermées (croisements, îlots, arcs), détection des zones mal fermées
  (`Alt`+clic pour forcer), gomme, pipette. La couleur suit sa zone quand on modifie les traits.
- **Couleurs** : palette nommée, fond du mur, surfaces en m² et estimation en litres (rendement, couches).
- **Historique illimité et persistant** : annuler/rétablir, frise navigable ; rien n'est perdu après un retour en arrière.
- **Variantes** : snapshot → variante indépendante, galerie, comparaison côte à côte (2 à 4, zoom synchronisé).
- **Images en filigrane** : plusieurs images, déplacement, agrandissement proportionnel, opacité, verrouillage ;
  jamais exportées.
- **Consultation** : zoom case par case avec les cotes de la case, choix des cases à imprimer.
- **Exports** : PDF chantier (vue d'ensemble cotée + cases choisies en grand), PNG, SVG,
  sauvegarde du projet en JSON (réimportable depuis l'accueil).

## Tests

```bash
npm run typecheck
npm test             # tests unitaires (Vitest)
npm run test:e2e     # tests de bout en bout (Playwright), captures dans docs/screenshots
npm run test:all
```

Un exemple de PDF chantier généré par les tests : [`docs/exemple-chantier.pdf`](docs/exemple-chantier.pdf).
