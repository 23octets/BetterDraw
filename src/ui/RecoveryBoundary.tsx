import { Component, type ReactNode } from 'react'
import { downloadRecovery } from '../export/recovery'
import { useEditor } from '../store/editor'

export class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean; error: string }> {
  state = { failed: false, error: '' }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="missing" role="alert">
      <h1>Le dessin a rencontré un problème</h1>
      <p>Exportez une sauvegarde de secours avant de quitter : certaines modifications peuvent ne pas être enregistrées.</p>
      <p>Si le stockage est inaccessible, le secours contient le dessin sans ses images.</p>
      {useEditor.getState().variant && <button onClick={() => { void downloadRecovery().catch(() => this.setState({ error: 'Export impossible. Gardez cette page ouverte et réessayez.' })) }}>Exporter le secours</button>}
      <button onClick={() => window.location.reload()}>Recharger</button>
      <button onClick={() => { window.location.hash = '/'; window.location.reload() }}>Retour à l’accueil</button>
      {this.state.error && <p>{this.state.error}</p>}
    </main>
  }
}
