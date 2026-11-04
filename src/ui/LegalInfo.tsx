import { createPortal } from 'react-dom'
import { useRef } from 'react'
import { legal } from '../config/legal'

export function LegalInfo() {
  const dialog = useRef<HTMLDialogElement>(null)
  const fields = [
    ['Éditeur', legal.publisher], ['Statut', legal.status],
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
        <p role="note">Document en préparation : les informations légales doivent être complétées et confirmées avant toute publication.</p>
        <h3>Mentions légales</h3>
        <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Non renseigné — publication bloquée'}</dd></div>)}</dl>
        <h3>Contact</h3>
        {legal.contactEmail ? <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a> : <p>Non renseigné — publication bloquée</p>}
        <h3>Notice de confidentialité</h3>
        {legal.privacy.map(([title, text]) => <section key={title}><h4>{title}</h4><p>{text}</p></section>)}
      </div>
    </dialog>, document.body)}
  </>
}
