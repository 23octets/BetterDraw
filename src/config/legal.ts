/** Informations autorisées par le propriétaire ; sources Cloudflare consultées le 12 novembre 2026. */
export const legal = {
  productName: 'frsque',
  publisher: '23OCTETS',
  address: '24 rue Armand Gouiran, 13730 Saint Victoret, France',
  status: 'SASU — société par actions simplifiée unipersonnelle',
  registration: 'SIRET : 98434012500017',
  publicationDirector: 'Yohan Gouiran',
  contactEmail: 'contact@23o.dev',
  host: 'Cloudflare, Inc. — 101 Townsend St., San Francisco, CA 94107, États-Unis — Téléphone : +1 888 993 5273',
  sources: [
    { label: 'Coordonnées de Cloudflare', url: 'https://www.cloudflare.com/about-overview/' },
    { label: 'Politique de confidentialité de Cloudflare', url: 'https://www.cloudflare.com/privacypolicy/' },
    { label: 'Documentation Workers Logs', url: 'https://developers.cloudflare.com/workers/observability/logs/workers-logs/' },
  ],
  privacy: [
    ['Données sur cet appareil', 'Les projets, dessins, dimensions, couleurs, variantes, historiques et images importées sont enregistrés dans le navigateur, dans IndexedDB via Dexie. Certains réglages et indicateurs techniques sont conservés dans localStorage. Aucun compte ni synchronisation avec un serveur ne sont proposés.'],
    ['Images et projets', 'L’application traite les images et les projets sur cet appareil et ne les envoie pas à un serveur. Les fichiers importés sont lus localement.'],
    ['Exports et sauvegardes', 'Les exports PDF, PNG et SVG sont générés localement et ne contiennent pas les images de référence. La sauvegarde JSON contient le projet, ses variantes, son historique et ses images. Vous décidez où enregistrer ces fichiers et avec qui les partager ; un dossier synchronisé peut les transmettre à votre service de stockage.'],
    ['Conservation et suppression', 'Les projets restent dans ce navigateur jusqu’à leur suppression. Les images devenues inutilisées peuvent être nettoyées automatiquement ; les images nécessaires aux projets et à leur historique sont conservées. Vous pouvez supprimer vos projets ou effacer les données du site dans les réglages du navigateur. Le navigateur peut aussi effacer ces données : conservez une sauvegarde JSON pour éviter leur perte. Les fichiers exportés se suppriment séparément.'],
    ['Réseau et confidentialité', 'Le chargement du site nécessite des échanges avec son hébergeur. Le code de l’application n’intègre ni outil de mesure d’audience, ni traceur publicitaire, ni police distante, ni cookie. Les polices utilisées sont celles du système. Aucun bandeau de consentement aux traceurs n’est donc affiché.'],
    ['Journaux techniques de l’hébergeur', 'L’hébergeur peut traiter des journaux techniques lors des accès au site, notamment l’adresse IP, la date, les pages demandées et les informations du navigateur. Ces traitements servent à fournir, sécuriser et maintenir le service. Cloudflare décrit une conservation proportionnée aux finalités et aux obligations légales, sans durée unique pour tous ses traitements. Les durées des journaux accessibles au client dépendent du service et de l’offre Cloudflare ; la documentation Workers Logs indique jusqu’à 7 jours. Ce délai ne couvre pas tous les traitements de Cloudflare. Les données peuvent être traitées hors de l’Union européenne selon les garanties décrites dans sa politique. Pour une question ou exercer vos droits, contactez l’éditeur à l’adresse indiquée ci-dessus ; vous pouvez aussi saisir la CNIL.'],
  ],
}
