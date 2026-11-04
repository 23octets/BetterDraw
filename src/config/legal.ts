/** Brouillon bloquant : à compléter et faire confirmer par le propriétaire avant fusion/publication.
 * Ne renseigner que les informations dont la publication a été explicitement autorisée.
 */
export const legal = {
  productName: 'BetterDraw',
  publisher: null as string | null,
  status: null as string | null,
  registration: null as string | null,
  publicationDirector: null as string | null,
  contactEmail: null as string | null,
  host: null as string | null,
  privacy: [
    ['Données sur cet appareil', 'Les projets, dessins, dimensions, couleurs, variantes, historiques et images importées sont enregistrés dans le navigateur, dans IndexedDB via Dexie. Certains réglages et indicateurs techniques sont conservés dans localStorage. Aucun compte ni synchronisation avec un serveur ne sont proposés.'],
    ['Images et projets', 'L’application traite les images et les projets sur cet appareil et ne les envoie pas à un serveur. Les fichiers importés sont lus localement.'],
    ['Exports et sauvegardes', 'Les exports PDF, PNG et SVG sont générés localement et ne contiennent pas les images de référence. La sauvegarde JSON contient le projet, ses variantes, son historique et ses images. Vous décidez où enregistrer ces fichiers et avec qui les partager ; un dossier synchronisé peut les transmettre à votre service de stockage.'],
    ['Conservation et suppression', 'Les données restent dans ce navigateur sans durée de suppression automatique prévue par l’application. Vous pouvez supprimer vos projets ou effacer les données du site dans les réglages du navigateur. Le navigateur peut aussi effacer ces données : conservez une sauvegarde JSON pour éviter leur perte. Les fichiers exportés se suppriment séparément.'],
    ['Réseau et confidentialité', 'Le chargement du site nécessite des échanges avec son hébergeur. Le code de l’application n’intègre ni outil de mesure d’audience, ni traceur publicitaire, ni police distante, ni cookie. Les polices utilisées sont celles du système. Aucun bandeau de consentement aux traceurs n’est donc affiché.'],
    ['Journaux techniques de l’hébergeur', 'L’hébergeur peut traiter des journaux techniques lors des accès au site, notamment l’adresse IP, la date, les pages demandées et les informations du navigateur. Les modalités et durées de conservation doivent être précisées avec l’hébergeur avant publication.'],
  ],
}
