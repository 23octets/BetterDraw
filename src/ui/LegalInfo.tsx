import { createPortal } from 'react-dom'
import { useRef } from 'react'
import { legal } from '../config/legal'

export function LegalInfo() {
  const dialog = useRef<HTMLDialogElement>(null)
  const fields = [
    ['Éditeur', legal.publisher], ['Adresse', legal.address], ['Statut', legal.status],
    ['Immatriculation', legal.registration], ['Directeur de la publication', legal.publicationDirector],
    ['Hébergeur', legal.host],
  ]
  return <>
    <button type="button" className="icon-btn ghost" onClick={() => dialog.current?.showModal()}>Mentions légales</button>
    {createPortal(<dialog ref={dialog} className="legal-dialog" aria-labelledby="legal-title" onKeyDown={(e) => e.stopPropagation()}>
      <header className="modal-head">
        <h2 id="legal-title">{legal.productName} — Mentions légales et confidentialité</h2>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Fermer les mentions légales">Fermer</button>
      </header>
      <div className="modal-pad">
        <h3>Mentions légales</h3>
        <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <h3>Contact</h3>
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
        <h3>Notice de confidentialité</h3>
        {legal.privacy.map(([title, text]) => <section key={title}><h4>{title}</h4><p>{text}</p></section>)}
        <h3>Sources de l’hébergeur</h3>
        <ul>{legal.sources.map(({ label, url }) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{label}</a></li>)}</ul>
      </div>
    </dialog>, document.body)}
  </>
}
