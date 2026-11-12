# Déploiement et recette

## Circuit actuel

- `main` déploie automatiquement la production sur https://betterdraw.yohan.one via Workers Builds.
- Les autres branches déploient une preview Cloudflare, liée dans le commentaire de leur PR.
- Les PR passent lint, types, tests unitaires, build, budget de taille, validation Cloudflare et le socle E2E `@essentiel`.
- La merge queue et `main` passent la suite E2E complète, captures Linux comprises.
- Le check Workers Builds n'est pas requis par GitHub : vérifier aussi la preview avant de demander le merge.

Cloudflare est configuré avec `npm run build`, puis `npx wrangler deploy` en production et
`npx wrangler preview` sur les autres branches. La version de Wrangler est verrouillée dans
le projet. `npm run preview` lance seulement le serveur local Vite : ce n'est pas la commande
pour publier une preview Cloudflare.

`npm run check:cloudflare`, après le build, vérifie le bloc `previews` requis puis effectue
un déploiement à blanc avec Wrangler. Il ne publie rien et ne nécessite pas de token. Il ne
remplace pas un déploiement réel : DNS, certificats, permissions et service Cloudflare restent
à vérifier sur Workers Builds.

Lorsqu'une ancienne branche échoue avec « missing a previews block », la mettre à jour depuis
`main` ; relancer le build du même ancien commit conserve le problème.

## État constaté le 12 novembre 2026

`dev.betterdraw.yohan.one` renvoie NXDOMAIN. Cloudflare n'a que le domaine de production
`betterdraw.yohan.one`, sans hébergement des previews sur ce domaine. Les previews des PR
fonctionnent sur `workers.dev` après mise à jour des branches depuis `main`.

## Proposition de recette stable (à activer après décision)

Les previews par PR permettent déjà de tester avant merge, sans branche supplémentaire.
Pour une adresse de recette stable, créer une branche `dev` et activer les previews sur le
domaine `betterdraw.yohan.one` (`previews_enabled: true` sur sa route Wrangler). Le nom de
preview `dev` donne alors `dev.betterdraw.yohan.one`.

Avant activation, vérifier la couverture TLS du sous-domaine de preview et les éventuels
coûts de certificat avec Cloudflare ; ne pas créer un simple CNAME vers une URL workers.dev,
car cela ne suffit pas à configurer le routage et le certificat.

Circuit recommandé : PR de fonctionnalité vers `dev`, recette sur sa preview stable, puis PR
`dev` vers `main` soumise à la merge queue. Si ce circuit est choisi : protéger `dev` avec les
mêmes checks, lancer la suite E2E complète sur les PR vers `dev` et sur ses pushes, et garder
la promotion vers `main` explicite. Sans ces règles, une branche `dev` ajoute une adresse,
mais ne garantit aucune recette avant production.

Les données sont locales au navigateur et séparées par origine : les projets de production
n'apparaissent pas sur une preview. Utiliser des exports JSON de test pour vérifier les
migrations et les imports, en conservant les sauvegardes originales.

Sources : [configuration des builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[configuration des previews](https://developers.cloudflare.com/workers/previews/configuration/),
[domaines des previews](https://developers.cloudflare.com/workers/previews/custom-domains/).
