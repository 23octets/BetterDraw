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
- **Pièces en 3D** : un projet peut être une pièce (« Une pièce (3D) » à la création, ou bouton cube pour transformer un mur seul).
  - Plan 2D : angles déplaçables, aimantés sur une grille de 5 cm et sur l'alignement des autres angles (`⌥` = libre). Double-clic sur un mur pour ajouter un angle. Longueurs, hauteur sous plafond et épaisseur se règlent au clavier. Annuler / rétablir.
  - Portes et fenêtres : position depuis la gauche, largeur, hauteur, allège. On les glisse le long du mur sur le plan.
  - Chaque mur se peint dans l'éditeur habituel (vu de l'intérieur, ouvertures hachurées, taille fixée par le plan), avec passage au mur voisin ‹ ›. Les variantes sont propres à chaque mur ; la dernière ouverte est celle montrée en 3D.
  - Vue 3D (Three.js) : orbite « maison de poupée » (murs côté caméra coupés), double-clic sur un mur pour le peindre, visite à la première personne (ZQSD, souris).
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
- **Consultation** : le rendu sans les traits ni les images, avec réglage des teintes ; zoom case par case avec les cotes de la case, choix des cases à imprimer.
- **Exports** : PDF chantier (vue d'ensemble cotée + cases choisies en grand), PNG, SVG,
  sauvegarde du projet en JSON (réimportable depuis l'accueil).

## Tests

```bash
npm run typecheck
npm test             # tests unitaires (Vitest)
npm run test:e2e     # tests de bout en bout (Playwright), captures dans docs/screenshots
npm run test:all
npm run size         # budget de taille du bundle, après npm run build (.size-limit.json)
```

La régression visuelle (`e2e/visual.spec.ts`) ne tourne qu'en CI, car ses images de référence dépendent du rendu Linux. Après un changement visuel voulu, ou une mise à jour de Playwright qui change le rendu :

```bash
gh workflow run visual-update.yml --ref ma-branche
gh run download <id-du-run> -n captures -D /tmp/captures
```

Relire les images, les copier dans `e2e/__screenshots__`, puis les committer (`gh run download` refuse d'écraser des fichiers existants). En cas d'échec, l'artefact `playwright-report` de la CI contient les différences.

Les tests e2e génèrent des captures dans `docs/screenshots/` et un exemple de PDF chantier dans `docs/exemple-chantier.pdf` (non versionnés).

## Données locales et sauvegardes

L’accueil permet de télécharger chaque projet en JSON avec ses variantes, son
historique et ses images, puis de le réimporter. Garder ces fichiers en dehors du
navigateur : vider ses données efface les projets. La protection de stockage
persistant, si le navigateur l’accorde, ne protège pas d’un effacement manuel.

L’espace affiché est l’estimation du navigateur pour ce site. Les nouvelles images
de référence sont réduites à 2 048 pixels sur leur plus grand côté. Les images
sans référence sont nettoyées à l’ouverture, à la suppression d’un projet ou
d’une variante, et par le bouton de nettoyage. Les ajouts de moins de 24 heures
restent conservés pour protéger les enregistrements en cours dans un autre onglet.
Les états courants et les deux sens de l’historique de toutes les variantes
protègent leurs images, y compris les sources des retouches et les images partagées.

Si un enregistrement échoue, l’éditeur le signale durablement et permet de
sauvegarder l’état affiché en JSON de secours ; cette sauvegarde exclut l’historique
de la variante courante, dont les dernières écritures ne sont pas garanties.
