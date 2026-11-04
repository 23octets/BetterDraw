// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecoveryBoundary } from './RecoveryBoundary'
import { useEditor } from '../store/editor'
import { downloadRecovery } from '../export/recovery'
import { defaultDoc } from '../model/defaults'

vi.mock('../export/recovery', () => ({ downloadRecovery: vi.fn().mockResolvedValue(undefined) }))

it('remplace un rendu qui plante par les actions de récupération', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useEditor.setState({ variant: { id: 'v', projectId: 'p', wallId: 'w', name: 'A', state: defaultDoc(), headSeq: 0, maxSeq: 0, createdAt: 0, updatedAt: 0 } })
  function Broken(): never { throw new Error('rendu') }
  render(<RecoveryBoundary><Broken /></RecoveryBoundary>)
  expect(screen.getByRole('alert').textContent).toContain('Le dessin a rencontré un problème')
  expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Retour à l’accueil' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Exporter le secours' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Exporter le secours' }))
  expect(downloadRecovery).toHaveBeenCalledOnce()
  vi.restoreAllMocks()
})
