# Comptes et synchronisation

Le site reste servi par Cloudflare Workers. Dexie Cloud assure la connexion par code
email et le transport des projets privés. La production garde les comptes désactivés
jusqu’à sa configuration et sa recette explicites : `/api/cloud` renvoie une URL nulle
quand `DEXIE_DATABASE_URL` n’est pas défini.

## Stockage et conflits

- La base invitée `betterdraw` reste en v2, sans migration destructive.
- Chaque compte et chaque base distante utilisent une base de travail distincte,
  `betterdraw-account-<SHA-256(URL distante + identifiant utilisateur)>`.
- L’addon utilise une base de transport distincte `betterdraw-sync`, suffixée par
  Dexie Cloud. Les enregistrements sont privés par défaut (propriétaire Dexie).
- Les projets sont publiés automatiquement après trois secondes d’inactivité, en versions
  complètes incluant variantes, historique et images, dans des `Blob` JSON.
- Les versions ont des identifiants aléatoires et la liste de leurs parents. Deux appareils
  partis d’une même version produisent deux branches : aucun historique n’est fusionné
  ou écrasé automatiquement. L’interface permet de télécharger chaque branche et de choisir.
- La réception attend le retour à l’accueil. Un dessin ouvert n’est jamais remplacé
  en arrière-plan. Une comparaison transactionnelle protège aussi les modifications
  apparues pendant la validation d’une version reçue.
- Les identifiants des versions et leur filiation sont conservés. Après synchronisation et une période de repos,
  les charges utiles des anciennes versions sont libérées, sauf les branches actives et
  les deux anciennes versions les plus récentes de chaque projet. L’historique complet
  du dessin reste dans la version active. La suppression d’un projet est une version
  sans charge utile, distincte d’une ancienne version archivée.
- Cette V1 synchronise à l’échelle du projet ; elle ne permet pas l’édition simultanée
  d’un même dessin avec fusion des opérations. Les instantanés complets privilégient
  l’intégrité et la réutilisation du format existant ; ils consomment plus de bande
  passante et d’écritures de blobs qu’un protocole par opérations.

Le bouton de copie des projets invités est explicite et idempotent par compte. Les
originaux restent dans la base invitée. La déconnexion attend l’enregistrement local
et la synchronisation ; elle ne force jamais l’abandon de changements en attente.
Les bases de travail du compte restent sur l’appareil pour le hors-ligne, mais ne sont
pas affichées en mode invité ni à un autre compte. Comme tout stockage navigateur,
cela ne protège pas contre une personne ayant accès aux outils de développement du profil.

## Plafond de 25 comptes

Le Worker expose `/api/accounts/admit`. Le gestionnaire Dexie doit avoir :

- `userPolicy.unknownUserAction` : `web-hook` ;
- `webHooks.unknownUser` : URL HTTPS de ce webhook, avec le paramètre `key` secret ;
- aucune création automatique de comptes d’évaluation ;
- un seul pack de 25 places et aucune augmentation automatique de l’abonnement.

Le webhook réserve une identité dans D1. Un trigger SQLite interdit atomiquement la
26e identité, même en présence de requêtes simultanées. Les répétitions d’une même
identité n’occupent pas de place supplémentaire. Réponse : `prod` ou `reject` ; jamais
`eval`. Une erreur de stockage ferme les inscriptions. Les comptes existants se
reconnectent sans repasser par ce webhook.

Les places réservées ne sont pas libérées automatiquement après un échec Dexie ou une
suppression de compte. C’est volontairement conservateur. Avant de libérer une ligne
D1, désactiver/supprimer le compte correspondant dans Dexie et vérifier le nombre de
places. Les comptes créés manuellement dans le gestionnaire contournent le webhook :
les inscrire aussi dans D1 et ne pas modifier le plafond sans décision explicite.

Le compteur D1 doit être sauvegardé et conservé avec la base Dexie correspondante.
Ne jamais le recréer vide devant une base contenant déjà des utilisateurs.

## Développement et déploiement

La configuration `previews` de `wrangler.jsonc` doit lier uniquement la base D1 de
recette. Les paramètres de production restent séparés. Les secrets ne sont ni dans
Vite ni dans Git.

1. Créer une base Dexie de recette et conserver `dexie-cloud.key` hors du dépôt.
2. Autoriser seulement les origines utilisées, notamment `http://localhost:5199` et
   `https://dev.betterdraw.yohan.one` (`npx dexie-cloud whitelist <origine>`).
3. Appliquer les migrations D1 :
   `npx wrangler d1 migrations apply betterdraw-accounts-dev --remote --config wrangler.dev.jsonc`.
4. Publier le Worker avec `DEXIE_ADMISSION_SECRET` depuis un fichier JSON privé :
   `npx wrangler preview --name dev --secrets-file /chemin/prive/preview-secrets.json`.
5. Configurer la politique du gestionnaire Dexie, puis définir
   `previews.vars.DEXIE_DATABASE_URL` et republier la preview.
6. Pour les futurs builds automatiques, conserver le secret sur la preview `dev`
   (ou dans Previews Base si les autres previews doivent recevoir le webhook).
7. Une preview de branche doit être explicitement autorisée côté Dexie pour tester
   l’authentification. Ne pas autoriser arbitrairement toutes les origines.

`VITE_DEXIE_DATABASE_URL` permet de tester sous Vite sans Worker. C’est une URL
publique, jamais une clé d’administration.

### Recette réelle facultative

`BETTERDRAW_DEXIE_TEST_CONFIG=/chemin/prive/config.json npx playwright test e2e/account.spec.ts`

Le fichier privé contient `databaseUrl`, `clientId` et `clientSecret`. Les deux
identités `integration-a@betterdraw.invalid` et `integration-b@betterdraw.invalid` doivent exister en
évaluation dans une base de recette, puis être supprimées après usage. Seule la saisie
du code email est simulée : le test demande de vrais jetons liés aux clés publiques
des navigateurs, puis utilise la synchronisation et les permissions réelles de Dexie.
Il ne doit jamais tourner sur une base de production. Sans ce fichier, cette recette
est ignorée ; les tests de panne et de fonctionnement local tournent normalement.
