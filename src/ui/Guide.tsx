import { useRef } from 'react'

/** Aide à la demande, sans voile ni verrouillage de l'espace de travail. */
export function Guide() {
  const ref = useRef<HTMLDetailsElement>(null)
  return (
    <details className="guide" ref={ref}>
      <summary>Guide en 5 étapes</summary>
      <aside className="guide-content" aria-label="Guide en 5 étapes" data-testid="guide">
        <div className="modal-head"><strong>Du dessin au mur</strong><div className="spacer" /><button onClick={() => { if (ref.current) ref.current.open = false }} aria-label="Fermer le guide">Fermer</button></div>
        <ol>
          <li><strong>Mesurer le mur.</strong> Saisis sa largeur et sa hauteur en centimètres à la création du projet. Tu peux les ajuster dans Réglages.</li>
          <li><strong>Dessiner.</strong> Avec l’outil Ligne, clique pour placer les points puis clique sur le premier point pour fermer la forme. Entrée termine un tracé ouvert.</li>
          <li><strong>Peindre.</strong> Choisis une couleur dans la palette puis clique dans une zone fermée avec le pot de peinture. Si des cercles signalent des trous, zoome et raccorde les extrémités avant de réessayer.</li>
          <li><strong>Tracer la grille sur le vrai mur.</strong> Choisis le pas et l’origine dans Réglages. À partir du même coin sur le mur, mesure et trace légèrement les lignes aux espacements indiqués.</li>
          <li><strong>Reporter case par case.</strong> En Consultation, clique sur une case pour voir ses repères cotés. Sélectionne les cases à imprimer puis ouvre Exporter pour télécharger le PDF chantier. Reproduis les intersections du dessin avec la grille, puis peins.</li>
        </ol>
        <p className="hint">Les pages détaillées du PDF sont des références agrandies, pas des patrons à l’échelle 1:1. Utilise les cotes et la grille pour reporter le dessin au mur.</p>
      </aside>
    </details>
  )
}
