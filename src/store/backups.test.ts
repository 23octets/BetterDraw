import { beforeEach, expect, it, vi } from 'vitest'
import { backupState, backupTimes, forgetBackup, markBackedUp } from './backups'

// l'environnement de test n'a pas de localStorage : un équivalent en mémoire suffit
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } })
})

it('suit l’état de la copie de secours d’un projet', () => {
  const project = { id: 'p', updatedAt: 100 }
  expect(backupState(project, [], backupTimes())).toBe('none')
  markBackedUp(['p'], 150)
  expect(backupState(project, [{ updatedAt: 120 }], backupTimes())).toBe('ok')
  expect(backupState(project, [{ updatedAt: 200 }], backupTimes())).toBe('old')
  expect(backupState({ id: 'p', updatedAt: 300 }, [], backupTimes())).toBe('old')
  forgetBackup('p')
  expect(backupState(project, [], backupTimes())).toBe('none')
})

it('ignore un contenu illisible', () => {
  localStorage.setItem('frsque:copies', '{"p":"hier","q":5}')
  expect(backupTimes()).toEqual({ q: 5 })
  localStorage.setItem('frsque:copies', 'pas du json')
  expect(backupTimes()).toEqual({})
})
