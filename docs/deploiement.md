# Déploiement et recette

## Circuit

1. Créer les branches de travail depuis `dev` et ouvrir leurs PR vers `dev` (Dependabot fait de même).
2. Attendre les vérifications, les E2E complets et la preview Cloudflare. Fusionner vers `dev`.
3. Faire la recette sur https://dev.betterdraw.yohan.one avec des données de test.
4. Ouvrir une PR `dev` → `main`. Après les checks, le job **Recette** attend l'approbation
   de `rocktane` dans Actions → exécution CI → **Review deployments** → `recette`.
5. Approuver seulement après la recette de la révision proposée, puis mettre la PR dans la
   merge queue. La suite complète y tourne avant la fusion. `main` déploie automatiquement
   https://betterdraw.yohan.one via Workers Builds.

Pour synchroniser `main` vers `dev`, passer par une PR de synchronisation et la fusionner
avec **Create a merge commit**, sans squash ni rebase : cette ascendance évite de rejouer les
mêmes modifications de dépendances à la promotion suivante. Après une promotion squashed par
la merge queue, synchroniser de nouveau `main` vers `dev` avant les prochains développements.

Une modification de `dev` lance une nouvelle exécution et nécessite une nouvelle approbation.
La validation manuelle est celle de la recette, pas une obligation d'avoir un second auteur.
Le job **Branche de promotion** refuse une promotion vers `main` depuis une autre branche.
Les protections de `main` doivent exiger **Vérifications**, **E2E**, **Branche de promotion** et
**Recette** après installation de ce workflow ; `dev` exige les deux premiers et une PR.

## Cloudflare

Workers Builds utilise `npm run build`, puis `npx wrangler deploy` en production et
`npx wrangler preview` sur les autres branches. Wrangler est verrouillé dans le projet.
`npm run preview` lance seulement le serveur local Vite : il ne publie rien.

Le domaine `betterdraw.yohan.one` accepte production et previews : Cloudflare ajoute le nom
de branche devant, donc la branche `dev` donne `dev.betterdraw.yohan.one`. Un domaine de base
`dev.betterdraw.yohan.one` produirait des adresses sous `*.dev.betterdraw.yohan.one` ; il ne faut
pas le superposer au domaine de recette, car ses enregistrements DNS peuvent masquer le wildcard parent.

Les autres branches gardent leurs previews individuelles, liées dans le commentaire de PR.
Le check Workers Builds n'est pas requis par GitHub : vérifier aussi son succès avant recette.
Les certificats et le DNS sont gérés par Cloudflare ; vérifier l'accès HTTPS après activation.

`npm run check:cloudflare`, après le build, vérifie le bloc `previews` requis puis effectue
un déploiement à blanc avec Wrangler. Il ne publie rien et ne nécessite pas de token. Il ne
remplace pas un déploiement réel : DNS, certificats et permissions restent à vérifier.
Lorsqu'une ancienne branche échoue avec « missing a previews block », la mettre à jour depuis
`main` ou `dev` ; relancer le build du même ancien commit conserve le problème.

## Recette d'une migration (notamment PR #23)

Les projets sont locaux au navigateur et séparés par origine : ceux de production n'apparaissent
pas sur une preview. Vider les données du site les efface. Garder les exports hors du navigateur.

- Avant toute migration en production, exporter les projets importants en JSON depuis l'accueil.
- Sur la preview, importer des copies : mur seul, pièce 3D, variantes, historique et images.
- Vérifier dessin, peinture, annuler/rétablir, copie de fresque, passage 2D/3D et rechargement.
- Exporter les projets depuis la preview puis les réimporter et vérifier leur contenu.
- Vérifier la migration d'une base v1 existante avec les tests automatisés dédiés : importer un
  JSON ne reproduit pas à lui seul la mise à niveau d'une base IndexedDB déjà présente.

La PR #23 passe IndexedDB de v1 à v2. Un retour arrière du code après migration peut empêcher
l'ancienne version d'ouvrir la base plus récente (`VersionError`). Revenir à l'ancien code ne
constitue donc pas un plan de restauration des données : garder les exports **avant migration**,
et privilégier une correction compatible avec la v2 si une anomalie apparaît.

Le budget du bundle est un garde-fou de performance : 386 octets au-delà de 285 ko ne rendent
pas le site inutilisable. Avant de relever le budget, différer le chargement des fonctions
secondaires et revérifier le bundle combiné à la dernière version de `main`.

Sources : [configuration des builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[configuration des previews](https://developers.cloudflare.com/workers/previews/configuration/),
[domaines des previews](https://developers.cloudflare.com/workers/previews/custom-domains/).
