/** Les cinq étapes illustrées de l’accueil. Les traits suivent --d-ink, --d-wall et --d-cote (voir home.css). */
export function HomeSteps() {
  return (
    <ol className="h-steps">
        <li><svg className="h-step-pic" viewBox="0 0 120 90" aria-hidden><rect x="16" y="28" width="78" height="52" fill="var(--d-wall)" stroke="var(--d-ink)" strokeWidth="1.5"/><path d="M16 17h78M16 13v8M94 13v8M105 28v52M101 28h8M101 80h8" stroke="var(--d-cote)" strokeWidth="1.5" fill="none"/><text x="55" y="12" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--d-cote)">300 cm</text><text x="113" y="57" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--d-cote)" transform="rotate(90 113 54)">250 cm</text></svg>
        <h3>Mesurer le mur</h3>
        <p>Largeur et hauteur en centimètres, à la création du projet.</p></li>
     
        <li><svg className="h-step-pic" viewBox="0 0 120 90" aria-hidden><rect x="16" y="28" width="78" height="52" fill="var(--d-wall)" stroke="var(--d-ink)" strokeWidth="1.5"/><path d="M16 66h78M16 66 39 40l25 26M50 66l22-20 22 20" fill="none" stroke="var(--d-ink)" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="78" cy="41" r="7" fill="none" stroke="var(--d-ink)" strokeWidth="1.5"/><g fill="var(--d-wall)" stroke="var(--d-ink)" strokeWidth="1.3"><circle cx="39" cy="40" r="2.6"/><circle cx="72" cy="46" r="2.6"/><circle cx="16" cy="66" r="2.6"/><circle cx="94" cy="66" r="2.6"/></g></svg>
        <h3>Dessiner</h3>
        <p>Lignes, arcs et courbes s’aimantent entre eux pour fermer les formes.</p></li>
     
        <li><svg className="h-step-pic" viewBox="0 0 120 90" aria-hidden><rect x="16" y="28" width="78" height="52" fill="#e8b4a6"/><circle cx="78" cy="41" r="7" fill="#e0a43a"/><path d="M16 66 39 40l25 26z" fill="#9caf88"/><path d="M50 66l22-20 22 20z" fill="#1f6f78"/><path d="M16 66h78v14H16z" fill="#c8643b"/><rect x="16" y="28" width="78" height="52" fill="none" stroke="var(--d-ink)" strokeWidth="1.5"/></svg>
        <h3>Peindre</h3>
        <p>Un clic remplit une zone fermée. Surfaces et litres se calculent seuls.</p></li>
     
        <li><svg className="h-step-pic" viewBox="0 0 120 90" aria-hidden><rect x="16" y="28" width="78" height="52" fill="#f6e3dd"/><circle cx="78" cy="41" r="7" fill="#f2d9a8"/><path d="M16 66 39 40l25 26z" fill="#d5dece"/><path d="M50 66l22-20 22 20z" fill="#a3c4c8"/><path d="M16 66h78v14H16z" fill="#e8bfae"/><rect x="16" y="28" width="78" height="52" fill="none" stroke="var(--d-ink)" strokeWidth="1.5"/><path d="M42 28v52M68 28v52M16 54h78" stroke="var(--d-cote)" strokeWidth="1.3" strokeDasharray="4 3" fill="none"/><g fontSize="8.5" fontWeight="700" fill="var(--d-cote)" textAnchor="middle"><text x="29" y="22">A</text><text x="55" y="22">B</text><text x="81" y="22">C</text><text x="8" y="44">2</text><text x="8" y="70">1</text></g></svg>
        <h3>Tracer la grille</h3>
        <p>Reporte au crayon, sur le vrai mur, le carroyage affiché à l’écran.</p></li>
     
        <li><svg className="h-step-pic" viewBox="0 0 120 90" aria-hidden><rect x="30" y="14" width="62" height="62" fill="#e8b4a6"/><path d="M30 76V52L68 14h24v18L48 76z" fill="#9caf88"/><path d="M48 76 92 32v44z" fill="#c8643b"/><rect x="30" y="14" width="62" height="62" fill="none" stroke="var(--d-cote)" strokeWidth="1.5" strokeDasharray="4 3"/><g fill="var(--d-wall)" stroke="var(--d-ink)" strokeWidth="1.4"><circle cx="30" cy="52" r="3"/><circle cx="68" cy="14" r="3"/><circle cx="48" cy="76" r="3"/><circle cx="92" cy="32" r="3"/></g><g fontSize="8.5" fontWeight="700" fill="var(--d-cote)"><text x="22" y="55" textAnchor="end">24</text><text x="68" y="9" textAnchor="middle">38</text><text x="48" y="87" textAnchor="middle">18</text><text x="98" y="35">18</text></g></svg>
        <h3>Reporter au mur</h3>
        <p>Chaque case donne ses cotes en centimètres. Le PDF chantier les imprime en grand.</p></li>
     
      </ol>
  )
}
