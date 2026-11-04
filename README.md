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
  absentes des exports PDF, PNG et SVG, incluses dans la sauvegarde JSON.
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

## Mentions légales et confidentialité

Les informations publiées et le nom affiché du produit sont centralisés dans
`src/config/legal.ts`. **Cette branche est un brouillon : ne pas fusionner ni publier
avant la réponse du propriétaire et la confirmation du texte selon son statut.**
Les champs `null` ne sont pas des valeurs publiables. Le propriétaire doit également
confirmer les modalités des journaux techniques de l’hébergeur ; la notice actuelle
signale cette information encore manquante.

Vérification du code pour cette notice : `src/store/db.ts` et `images.ts` (IndexedDB,
lecture locale des images), `src/ui/Editor.tsx` et `src/room/RoomPage.tsx`
(localStorage), `src/export/project.ts` (JSON avec images), `src/export/pdf.ts` et
`svg.ts` (exports locaux sans images de référence), `src/index.css` (polices système).
Aucun appel réseau applicatif, traceur, cookie ou chargement de police distante n’a
été trouvé dans les sources, `public` et `index.html`. Le chargement des ressources
du site reste nécessaire ; les journaux du futur hébergement ne sont pas vérifiables ici.

`e2e/legal.spec.ts` vérifie l’accès aux informations depuis l’accueil et l’éditeur,
et échoue si une requête HTTP(S) ou une connexion WebSocket vers une autre origine
est tentée pendant création, import d’image, dessin, peinture, consultation et exports.
Ce contrôle porte sur ce parcours, pas sur les futures configurations d’hébergement
ni sur des fonctionnalités non parcourues.
