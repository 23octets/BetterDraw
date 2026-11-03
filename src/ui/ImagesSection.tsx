import { useRef, useState } from 'react'
import { ImageEditModal } from './ImageEditModal'
import { useEditor } from '../store/editor'
import { imageSize, placeImage, readFileAsDataUrl, storeImage } from '../store/images'
import { Section } from './SidePanel'
import { Icon } from './icons'

export async function importImageFiles(files: FileList | File[]) {
  const st = useEditor.getState()
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    const dataUrl = await readFileAsDataUrl(file)
    const size = await imageSize(dataUrl)
    const stored = await storeImage(dataUrl, size)
    const ref = placeImage(stored, useEditor.getState().doc.wall, file.name)
    st.commit(`Importer l'image ${file.name}`, (d) => {
      d.images.push(ref)
    })
    st.setSelectedImage(ref.id)
  }
  st.setTool('image')
}

export function ImagesSection() {
  const images = useEditor((s) => s.doc.images)
  const selected = useEditor((s) => s.selectedImageId)
  const setSelected = useEditor((s) => s.setSelectedImage)
  const setTool = useEditor((s) => s.setTool)
  const tool = useEditor((s) => s.tool)
  const commit = useEditor((s) => s.commit)
  const preview = useEditor((s) => s.imagePreview)
  const setPreview = useEditor((s) => s.setImagePreview)
  const input = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const update = (id: string, label: string, patch: Partial<(typeof images)[number]>) =>
    commit(label, (d) => {
      const im = d.images.find((i) => i.id === id)
      if (im) Object.assign(im, patch)
    })
  const move = (id: string, dir: -1 | 1) =>
    commit(dir > 0 ? 'Image vers l’avant' : 'Image vers l’arrière', (d) => {
      const i = d.images.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= d.images.length) return
      const [x] = d.images.splice(i, 1)
      d.images.splice(j, 0, x)
    })
  return (
    <Section title="Images de référence" testId="images-section">
      <input ref={input} type="file" accept="image/*" multiple hidden data-testid="image-input"
        onChange={(e) => {
          if (e.target.files?.length) importImageFiles(e.target.files)
          e.target.value = ''
        }} />
      <button className="wide" onClick={() => input.current?.click()} data-testid="import-image"><Icon name="plus" size={14} /> Importer une image</button>
      {images.length > 0 && (
        <ul className="image-list">
          {[...images].reverse().map((im) => {
            const op = preview?.id === im.id ? preview.opacity : im.opacity
            return (
              <li key={im.id} data-hidden={!im.visible || undefined} className={`image-row${selected === im.id && tool === 'image' ? ' on' : ''}`} data-testid="image-row">
                <div className="image-row-head">
                  <button className="ghost small name" onClick={() => { setSelected(im.id); setTool('image') }} title={im.name}>{im.name}</button>
                  <button className="icon-btn ghost small" title="Ajuster : perspective et recadrage" aria-label="Ajuster l’image" data-testid="image-adjust"
                    onClick={() => setEditing(im.id)}><Icon name="perspective" size={15} /></button>
                  <button className={`icon-btn ghost small${im.visible ? '' : ' off'}`} title={im.visible ? 'Masquer' : 'Afficher'} aria-pressed={!im.visible} data-testid="image-visible"
                    onClick={() => update(im.id, im.visible ? 'Masquer une image' : 'Afficher une image', { visible: !im.visible })}><Icon name={im.visible ? 'eye' : 'eyeOff'} size={15} /></button>
                  <button className={`icon-btn ghost small${im.locked ? ' off' : ''}`} title={im.locked ? 'Déverrouiller' : 'Verrouiller'} aria-pressed={im.locked} data-testid="image-lock"
                    onClick={() => update(im.id, im.locked ? 'Déverrouiller une image' : 'Verrouiller une image', { locked: !im.locked })}><Icon name={im.locked ? 'lock' : 'unlock'} size={15} /></button>
                  <button className="icon-btn ghost small" title="Vers l’avant" aria-label="Vers l’avant" onClick={() => move(im.id, 1)}><Icon name="up" size={15} /></button>
                  <button className="icon-btn ghost small" title="Vers l’arrière" aria-label="Vers l’arrière" onClick={() => move(im.id, -1)}><Icon name="down" size={15} /></button>
                  <button className="icon-btn ghost small danger" title="Retirer" aria-label="Retirer l’image" data-testid="image-delete"
                    onClick={() => { commit('Retirer une image', (d) => { d.images = d.images.filter((x) => x.id !== im.id) }); if (selected === im.id) setSelected(null) }}><Icon name="close" size={15} /></button>
                </div>
                <label className="opacity">
                  <span>Opacité {Math.round(op * 100)} %</span>
                  <input type="range" min={5} max={100} value={Math.round(op * 100)} data-testid="image-opacity"
                    onChange={(e) => setPreview({ id: im.id, opacity: +e.target.value / 100 })}
                    onPointerUp={() => { const p = useEditor.getState().imagePreview; if (p) { update(im.id, `Opacité ${Math.round(p.opacity * 100)} %`, { opacity: p.opacity }); setPreview(null) } }}
                    onKeyUp={() => { const p = useEditor.getState().imagePreview; if (p) { update(im.id, `Opacité ${Math.round(p.opacity * 100)} %`, { opacity: p.opacity }); setPreview(null) } }}
                  />
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {editing && images.some((i) => i.id === editing) && <ImageEditModal imageId={editing} onClose={() => setEditing(null)} />}
      <p className="hint" style={{ margin: 0 }}>Les images s’affichent en filigrane (au-dessus des aplats, sous les traits), seulement en mode Édition, et ne sont jamais exportées. Glisser-déposer une image sur le mur fonctionne aussi.</p>
    </Section>
  )
}
