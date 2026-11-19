// Fragments partagés par les quatre maquettes : fresques, pictos, données des projets,
// formulaire, bloc d'enregistrement, styles de base et comportements communs.
// Les quatre pages diffèrent par leur héros, leur gabarit de carte et leur feuille de style.

export const icon = `<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#efebe3" d="M0 341V112A112 112 0 0 1 112 0H400A112 112 0 0 1 512 112V401Z"/><path fill="#c8643b" d="M0 340L512 400A112 112 0 0 1 400 512H112A112 112 0 0 1 0 400Z"/><path fill="#c8643b" d="M112 64H416V160H240V240H368V336H240V368.125L112 353.125Z"/><path fill="#efebe3" d="M112 353.125L240 368.125V448H112Z"/></svg>`

const gridPath = (w, h) => { let d = ''; for (let x = 50; x < w; x += 50) d += `M${x} 0v${h}`; for (let y = h - 50; y > 0; y -= 50) d += `M0 ${y}h${w}`; return `<path class="gridlines" d="${d}" fill="none" stroke="#26282c" stroke-width="1.4" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"/>` }
// ---------- Fresques : contenu en centimètres (y vers le bas), palette par défaut de l'app.
export const m1in = `<rect width="300" height="250" fill="#e8b4a6"/><circle cx="232" cy="70" r="34" fill="#e0a43a"/><path d="M0 182 86 66l88 116z" fill="#9caf88"/><path d="M118 182l84-88 98 88z" fill="#1f6f78"/><path d="M0 182h300v68H0z" fill="#c8643b"/>`
export const m2in = `<rect width="420" height="250" fill="#f4f1ea"/><path d="M262 250a79 79 0 0 1 158 0z" fill="#9caf88"/><path d="M296 250a45 45 0 0 1 90 0z" fill="#33363b"/><path d="M10 250a150 150 0 0 1 300 0z" fill="#c8643b"/><path d="M42 250a118 118 0 0 1 236 0z" fill="#e0a43a"/><path d="M74 250a86 86 0 0 1 172 0z" fill="#e8b4a6"/><path d="M106 250a54 54 0 0 1 108 0z" fill="#1f6f78"/><circle cx="356" cy="72" r="26" fill="#e0a43a"/>`
const m3in = `<rect width="180" height="320" fill="#f4f1ea"/><path d="M0 320V214L180 54v106z" fill="#e0a43a"/><path d="M0 320 180 160v160z" fill="#1f6f78"/><circle cx="56" cy="72" r="36" fill="#e8b4a6"/>`
const m4in = `<rect width="360" height="250" fill="#e8b4a6"/><path d="M0 92c60-42 120 42 180 0s120-42 180 0v158H0z" fill="#e0a43a"/><path d="M0 144c60-42 120 42 180 0s120-42 180 0v106H0z" fill="#c8643b"/><path d="M0 196c60-42 120 42 180 0s120-42 180 0v54H0z" fill="#1f6f78"/>`
const m5in = `<rect width="240" height="250" fill="#f4f1ea"/><path d="M0 0h120v250H0z" fill="#9caf88"/><circle cx="120" cy="118" r="72" fill="#e0a43a"/><path d="M120 46a72 72 0 0 1 0 144z" fill="#c8643b"/><path d="M0 214h240v36H0z" fill="#33363b"/>`
const roomIn = `<path d="M30 190 150 130l120 60-120 60z" fill="#d9d3c7"/><path d="M30 90 150 30v100L30 190z" fill="#e8b4a6"/><path d="M30 150 150 90v40L30 190z" fill="#c8643b"/><path d="M150 30l120 60v100l-120-60z" fill="#f4f1ea"/><path d="M150 82l120 60v48l-120-60z" fill="#1f6f78"/><path d="M196 79a17 21 0 0 0 34 17 17 21 0 0 0-34-17z" fill="#e0a43a"/><path d="M30 90 150 30l120 60v100l-120 60L30 190zM150 30v100M30 190l120-60 120 60" fill="none" stroke="#1d1f22" stroke-width="1.6" stroke-linejoin="round"/>`
const unrolledIn = `<rect width="1720" height="250" fill="#f4f1ea"/><rect width="420" height="250" fill="#e8b4a6"/><path d="M0 150h420v100H0z" fill="#c8643b"/><path d="M420 130h440v120H420z" fill="#1f6f78"/><circle cx="640" cy="66" r="34" fill="#e0a43a"/><path d="M860 190h420v60H860z" fill="#9caf88"/><path d="M1280 190h440v60h-440z" fill="#9caf88"/><path d="M420 0v250M860 0v250M1280 0v250" stroke="#1d1f22" stroke-width="3" vector-effect="non-scaling-stroke" fill="none"/>`
const roomWallIn = `<rect width="440" height="250" fill="#f4f1ea"/><path d="M0 130h440v120H0z" fill="#1f6f78"/><circle cx="220" cy="66" r="34" fill="#e0a43a"/>`
const svg = (vb, inner, label) => `<svg class="mural" viewBox="0 0 ${vb}" role="img" aria-label="${label}">${inner}</svg>`
export const m1 = svg('300 250', m1in, 'Fresque : deux montagnes et un soleil')
export const m1grid = m1.replace('</svg>', gridPath(300, 250) + '</svg>')

// ---------- Projets fictifs. « copie » : état de la copie de secours (ok, old = modifié depuis, none = aucune).
const C = { canard: '#1f6f78', terra: '#c8643b', ocre: '#e0a43a', sauge: '#9caf88', rose: '#e8b4a6', anth: '#33363b', mur: '#f4f1ea' }
const strip = (parts) => parts.map(([c, f]) => `<i style="--c:${C[c]};--f:${f}"></i>`).join('')
const COPY = { ok: 'Copie de secours à jour', old: 'Modifié depuis la dernière&nbsp;copie', none: 'Aucune copie de secours' }
const raw = [
  { name: 'Chambre de Léa', w: 300, h: 250, mural: m1, nv: 3, date: '8&nbsp;nov.', copie: 'old', paint: '5 couleurs, 1,5 L', strip: [['rose', 33], ['terra', 20], ['sauge', 10], ['canard', 8], ['ocre', 4]] },
  { name: 'Salon, mur du canapé', w: 420, h: 250, mural: svg('420 250', m2in, 'Fresque : arches concentriques'), nv: 2, date: '2&nbsp;nov.', copie: 'ok', paint: '7 couleurs, 2,1 L', strip: [['mur', 60], ['terra', 13], ['ocre', 12], ['rose', 7], ['canard', 5], ['sauge', 5], ['anth', 3]] },
  { name: 'Cage d’escalier', w: 180, h: 320, mural: svg('180 320', m3in, 'Fresque : bandes diagonales'), nv: 1, date: '27&nbsp;oct.', copie: 'ok', paint: '4 couleurs, 1,2 L', strip: [['mur', 40], ['ocre', 33], ['canard', 25], ['rose', 7]] },
  { name: 'Entrée', w: 360, h: 250, mural: svg('360 250', m4in, 'Fresque : trois vagues'), nv: 2, date: '24&nbsp;oct.', copie: 'none', paint: '4 couleurs, 1,8 L', strip: [['rose', 37], ['ocre', 21], ['terra', 21], ['canard', 21]] },
  { name: 'Tête de lit', w: 240, h: 250, mural: svg('240 250', m5in, 'Fresque : disque en deux tons'), nv: 1, date: '21&nbsp;oct.', copie: 'ok', paint: '5 couleurs, 1,2 L', strip: [['sauge', 36], ['mur', 36], ['anth', 14], ['ocre', 7], ['terra', 7]] },
  { name: 'Studio', room: true, w: 336, h: 280, mural: svg('300 250', roomIn, 'Pièce vue en 3D'), nv: 4, date: '19&nbsp;oct.', copie: 'ok', paint: '5 couleurs, 6,4 L', strip: [['mur', 40], ['rose', 25], ['canard', 18], ['terra', 12], ['ocre', 5]] },
]
const iMoreSvg = `<svg class="ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="4.5" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="15.5" cy="10" r="1.4"/></svg>`
export const projects = raw.map((p, i) => ({
  ...p,
  kind: p.room ? 'room' : 'wall',
  dims: p.room ? 'Pièce de 4&nbsp;murs, 18,5&nbsp;m² au sol' : `${p.w}&nbsp;×&nbsp;${p.h}&nbsp;cm`,
  paint: p.paint.replace(/ L$/, '&nbsp;L de&nbsp;peinture'),
  paintShort: p.paint.replace(/ L$/, '&nbsp;L'),
  vars: `${p.nv}&nbsp;variante${p.nv > 1 ? 's' : ''}`,
  copyText: COPY[p.copie],
  open: i === 0 ? 'Reprendre' : 'Ouvrir',
  openClass: i === 0 ? 'btn sm' : 'btn sm quiet',
  strip: strip(p.strip),
  unrolled: p.room ? svg('440 250', roomWallIn, 'Le mur 2 de la pièce') : p.mural,
  ew: p.room ? 440 : p.w, eh: p.room ? 250 : p.h,
  elabel: p.room ? 'mur 2 sur 4, 440 cm' : p.w + ' cm',
  muralGrid: p.room ? p.mural : p.mural.replace('</svg>', gridPath(p.w, p.h) + '</svg>'),
  // Actions rares : menu « … » (élément details, donc utilisable au clavier sans script).
  menu: `<details class="more"><summary class="btn sm quiet icon" aria-label="Autres actions pour ${p.name}">${iMoreSvg}</summary><div class="menu"><button type="button">Voir les ${p.nv > 1 ? p.nv + ' variantes' : 'variantes'}</button>${p.room ? '' : '<button type="button">Transformer en pièce 3D</button>'}<hr><button type="button" class="danger">Supprimer le projet…</button></div></details>`,
}))
export const others = projects.slice(1)
export const elevProjects = projects.filter((p) => p.name !== 'Tête de lit')
export const others4 = elevProjects.slice(1)

// ---------- Pictos des 5 étapes. Traits pilotés par --d-ink, --d-wall, --d-cote.
const step = (inner) => `<svg class="step-pic" viewBox="0 0 120 90" aria-hidden="true">${inner}</svg>`
const wall = `<rect x="16" y="28" width="78" height="52" fill="var(--d-wall)" stroke="var(--d-ink)" stroke-width="1.5"/>`
const fills = `<rect x="16" y="28" width="78" height="52" fill="#e8b4a6"/><circle cx="78" cy="41" r="7" fill="#e0a43a"/><path d="M16 66 39 40l25 26z" fill="#9caf88"/><path d="M50 66l22-20 22 20z" fill="#1f6f78"/><path d="M16 66h78v14H16z" fill="#c8643b"/>`
const pale = `<rect x="16" y="28" width="78" height="52" fill="#f6e3dd"/><circle cx="78" cy="41" r="7" fill="#f2d9a8"/><path d="M16 66 39 40l25 26z" fill="#d5dece"/><path d="M50 66l22-20 22 20z" fill="#a3c4c8"/><path d="M16 66h78v14H16z" fill="#e8bfae"/>`
const outline = `<rect x="16" y="28" width="78" height="52" fill="none" stroke="var(--d-ink)" stroke-width="1.5"/>`
const s1 = step(`${wall}<path d="M16 17h78M16 13v8M94 13v8M105 28v52M101 28h8M101 80h8" stroke="var(--d-cote)" stroke-width="1.5" fill="none"/><text x="55" y="12" text-anchor="middle" font-size="9" font-weight="600" fill="var(--d-cote)">300 cm</text><text x="113" y="57" text-anchor="middle" font-size="9" font-weight="600" fill="var(--d-cote)" transform="rotate(90 113 54)">250 cm</text>`)
const s2 = step(`${wall}<path d="M16 66h78M16 66 39 40l25 26M50 66l22-20 22 20" fill="none" stroke="var(--d-ink)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="78" cy="41" r="7" fill="none" stroke="var(--d-ink)" stroke-width="1.5"/><g fill="var(--d-wall)" stroke="var(--d-ink)" stroke-width="1.3"><circle cx="39" cy="40" r="2.6"/><circle cx="72" cy="46" r="2.6"/><circle cx="16" cy="66" r="2.6"/><circle cx="94" cy="66" r="2.6"/></g>`)
const s3 = step(`${fills}${outline}`)
const s4 = step(`${pale}${outline}<path d="M42 28v52M68 28v52M16 54h78" stroke="var(--d-cote)" stroke-width="1.3" stroke-dasharray="4 3" fill="none"/><g font-size="8.5" font-weight="700" fill="var(--d-cote)" text-anchor="middle"><text x="29" y="22">A</text><text x="55" y="22">B</text><text x="81" y="22">C</text><text x="8" y="44">2</text><text x="8" y="70">1</text></g>`)
const s5 = step(`<rect x="30" y="14" width="62" height="62" fill="#e8b4a6"/><path d="M30 76V52L68 14h24v18L48 76z" fill="#9caf88"/><path d="M48 76 92 32v44z" fill="#c8643b"/><rect x="30" y="14" width="62" height="62" fill="none" stroke="var(--d-cote)" stroke-width="1.5" stroke-dasharray="4 3"/><g fill="var(--d-wall)" stroke="var(--d-ink)" stroke-width="1.4"><circle cx="30" cy="52" r="3"/><circle cx="68" cy="14" r="3"/><circle cx="48" cy="76" r="3"/><circle cx="92" cy="32" r="3"/></g><g font-size="8.5" font-weight="700" fill="var(--d-cote)"><text x="22" y="55" text-anchor="end">24</text><text x="68" y="9" text-anchor="middle">38</text><text x="48" y="87" text-anchor="middle">18</text><text x="98" y="35">18</text></g>`)
export const steps = `<ol class="steps">
        <li>${s1}<h3>Mesurer le mur</h3><p>Largeur et hauteur en centimètres, à la création du projet.</p></li>
        <li>${s2}<h3>Dessiner</h3><p>Lignes, arcs et courbes s’aimantent entre eux pour fermer les formes.</p></li>
        <li>${s3}<h3>Peindre</h3><p>Un clic remplit une zone fermée. Surfaces et litres se calculent seuls.</p></li>
        <li>${s4}<h3>Tracer la grille</h3><p>Reporte au crayon, sur le vrai mur, le carroyage affiché à l’écran.</p></li>
        <li>${s5}<h3>Reporter au mur</h3><p>Chaque case donne ses cotes en centimètres. Le PDF chantier les imprime en grand.</p></li>
      </ol>`

// ---------- Icônes (trait 1.6, comme l'app).
const ic = (d) => `<svg class="ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
export const iPlus = ic('<path d="M10 4v12M4 10h12"/>')
export const iDown = ic('<path d="M10 3v9M6 9l4 4 4-4M4 16h12"/>')
export const iUp = ic('<path d="M10 13V4M6 7l4-4 4 4M4 16h12"/>')
const iShield = ic('<path d="M10 3 4 5.5v4.2c0 3.5 2.4 6 6 7.3 3.6-1.3 6-3.8 6-7.3V5.5z"/>')
const iCheck = ic('<path d="m4.5 10.5 3.5 3.5 7.5-8"/>')
const iTrash = ic('<path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4.5M11.5 9v4.5"/>')
const iSearch = ic('<circle cx="9" cy="9" r="5"/><path d="m13 13 3.5 3.5"/>')

// ---------- En-tête : raccourcis.
export const nav = `<nav class="nav" aria-label="Raccourcis">
      <a class="link-btn" href="#methode"><span>Guide<span class="hide-s"> en 5&nbsp;étapes</span></span></a>
      <button class="link-btn" type="button">${iUp}<span>Importer<span class="hide-s"> une copie de secours</span></span></button>
    </nav>`

// ---------- Formulaire « Nouveau projet » : mur, ou pièce (forme, largeur, profondeur, hauteur sous plafond).
export const kindSeg = `<div class="seg" role="group" aria-label="Type de projet" data-kind>
          <button type="button" aria-pressed="true" data-v="wall">Un mur</button>
          <button type="button" aria-pressed="false" data-v="room">Une pièce en 3D</button>
        </div>`
export const formFields = `<label class="field f-name">Nom du projet<input placeholder="Ex. : Salon, mur du fond" data-name></label>
          <div class="field f-shape" data-room hidden><span>Forme de la pièce</span>
            <div class="seg" role="group" aria-label="Forme de la pièce" data-shape>
              <button type="button" aria-pressed="true" data-v="rect"><svg viewBox="0 0 20 16" aria-hidden="true"><rect x="2" y="2" width="16" height="12"/></svg>Rectangle</button>
              <button type="button" aria-pressed="false" data-v="L"><svg viewBox="0 0 20 16" aria-hidden="true"><path d="M2 2H18V8H10V14H2Z"/></svg>En L</button>
            </div>
          </div>
          <label class="field f-w"><span data-lw>Largeur du mur</span><span class="unit"><input inputmode="numeric" value="300" data-w></span></label>
          <label class="field f-h" data-wall>Hauteur du mur<span class="unit"><input inputmode="numeric" value="250" data-h></span></label>
          <label class="field f-d" data-room hidden>Profondeur<span class="unit"><input inputmode="numeric" value="350" data-d></span></label>
          <label class="field f-c" data-room hidden>Hauteur sous plafond<span class="unit"><input inputmode="numeric" value="250" data-c></span></label>`

// ---------- Projets : ligne d'état (où sont les données, copies à refaire) et outils (au-delà de 8 projets).
export const statusLine = `<p class="status"><span><strong>Enregistrés dans ce navigateur, sur cet appareil.</strong> 2&nbsp;projets n’ont pas de copie de secours à jour.</span><button class="btn sm quiet" type="button">${iDown} Tout télécharger</button><a href="#stockage">Où sont mes projets&nbsp;?</a></p>`
export const tools = `<div class="tools" data-tools hidden><!-- affiché à partir de 9 projets -->
        <label class="search">${iSearch}<input type="search" placeholder="Chercher un projet" aria-label="Chercher un projet"></label>
        <label class="sort">Trier par <select><option>Dernière modification</option><option>Nom</option><option>Largeur du mur</option></select></label>
      </div>`

// ---------- Bloc « Où sont enregistrés tes projets ? » : une explication, puis une action par besoin.
export const storage = `<div class="st-main">
        <div class="st-head"><h2 id="t-store">Où sont enregistrés tes projets&nbsp;?</h2><p class="usage only-retour">12&nbsp;Mo utilisés sur&nbsp;environ&nbsp;10&nbsp;Go.</p></div>
        <p><strong>Dans ce navigateur, sur cet appareil.</strong> frsque fonctionne sans compte et sans connexion&nbsp;: chaque modification s’enregistre toute seule, rien n’est envoyé en ligne, rien n’est partagé avec tes autres appareils.</p>
        <p>Le revers&nbsp;: si tu effaces les données de navigation ou si tu changes d’ordinateur, tes projets ne suivent pas. Certains navigateurs, comme Safari, effacent aussi les données d’un site resté sept jours sans visite. La parade est la copie de secours, un fichier que tu ranges où tu veux et que tu réimportes ici.</p>
      </div>
      <div class="st-item">
        <h3><span class="only-retour">Garder une copie de secours</span><span class="only-premier">Tu as déjà une copie de secours&nbsp;?</span></h3>
        <p class="only-retour">Un fichier par projet, ou un seul pour tous, avec variantes, historique et images. À refaire après chaque séance de dessin&nbsp;: la liste des projets signale ceux qui ont changé depuis.</p>
        <p class="only-premier">Importe-la ici&nbsp;: tu retrouves le projet avec ses variantes, son historique et ses images.</p>
        <div class="st-acts"><button class="btn sm quiet only-retour" type="button">${iDown} Tout télécharger</button><button class="btn sm quiet only-premier" type="button">${iUp} Importer une copie</button></div>
      </div>
      <div class="st-item only-retour" data-persist>
        <!-- Proposé dès qu'il existe un projet. Trois états, lus au chargement avec navigator.storage.persisted() : pas encore demandé (bouton), accordé, refusé (?refus dans l'URL de la maquette). -->
        <h3>Demander au navigateur de les garder</h3>
        <p>Quand le disque est presque plein, le navigateur peut vider de lui-même les sites peu visités. Tu peux lui demander d’épargner frsque&nbsp;; il peut refuser. Ça ne remplace pas la copie de secours.</p>
        <div class="st-acts"><button class="btn sm quiet" type="button" data-ask>${iShield} Demander au navigateur</button></div>
        <p class="st-state ok" data-granted hidden>${iCheck} Accordé&nbsp;: le navigateur ne videra pas frsque de lui-même.</p>
        <p class="st-state" data-denied hidden>Refusé par le navigateur. Garde tes copies à&nbsp;jour.</p>
      </div>
      <div class="st-item only-retour">
        <!-- N'apparaît que s'il y a au moins 1 Mo à libérer (images inutilisées depuis plus de 24 h). -->
        <h3>3&nbsp;images ne servent plus</h3>
        <p>Ces images, importées comme modèle, ne sont plus utilisées par aucun projet. Les supprimer libère 4,2&nbsp;Mo et ne change rien à tes dessins.</p>
        <div class="st-acts"><button class="btn sm quiet" type="button">${iTrash} Supprimer ces 3&nbsp;images</button></div>
      </div>`

// ---------- Styles de base : structure des contrôles, thème par variables (--act, --ink, --r…).
export const baseCss = `<style>
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;-webkit-font-smoothing:antialiased;color:var(--ink);background:var(--bg)}
button,input,select{font:inherit;color:inherit}
h1,h2,h3,p{margin:0}
h1,h2,h3{text-wrap:balance}
a{color:inherit;text-underline-offset:3px}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.wrap{max-width:calc(var(--maxw,1320px) + 2*var(--pad));margin-inline:auto;padding-inline:var(--pad)}
/* Deux états : premier passage (aucun projet) et retour (des projets). */
body.retour .only-premier,body.premier .only-retour{display:none!important}
.ic{flex:none}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:var(--h,48px);padding:0 20px;border-radius:var(--r);border:1.5px solid var(--act);background:var(--act);color:var(--act-ink);font-weight:600;font-size:16.5px;line-height:1;cursor:pointer;white-space:nowrap;text-decoration:none;list-style:none}
.btn:hover{background:var(--act-h);border-color:var(--act-h)}
.btn.quiet{background:var(--ctl);color:var(--ink);border-color:var(--line-s);font-weight:500}
.btn.quiet:hover{border-color:var(--ink);background:var(--ctl)}
.btn.sm{--h:38px;padding:0 13px;font-size:15px}
.btn.icon{width:var(--h,48px);padding:0}
.nav{display:flex;gap:4px;align-items:center}
.link-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 13px;border:0;background:none;border-radius:var(--r);font-weight:500;font-size:15.5px;cursor:pointer;text-decoration:none;white-space:nowrap}
.link-btn:hover{background:var(--hover)}

.seg{display:inline-flex;padding:3px;gap:2px;background:var(--seg-bg);border-radius:calc(var(--r) + 3px);border:1.5px solid var(--line-s);justify-self:start}
.seg button{height:34px;padding:0 13px;border:0;background:none;border-radius:var(--r);font-size:15px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.seg button[aria-pressed=true]{background:var(--act);color:var(--act-ink)}
.seg svg{width:18px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7}

.field{display:grid;gap:6px;font-size:14.5px;font-weight:600;color:var(--label,var(--ink-2));min-width:0;align-content:start;white-space:nowrap}
.field input{height:48px;width:100%;min-width:0;border:1.5px solid var(--line-s);border-radius:var(--r);background:var(--input,#fff);padding:0 14px;font-size:17px;font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums}
.field input::placeholder{color:var(--ink-2);opacity:.75}
.field input:hover{border-color:var(--ink-2)}
.field input:focus{outline:3px solid var(--focus);outline-offset:0;border-color:var(--focus)}
.field .seg{height:48px}.field .seg button{height:100%}
.unit{position:relative;display:block}
.unit::after{content:'cm';position:absolute;right:14px;top:50%;translate:0 -50%;color:var(--ink-2);font-weight:500;pointer-events:none}
.unit input{padding-right:46px}

.more{position:relative}
.more summary::-webkit-details-marker{display:none}
.menu{position:absolute;right:0;top:calc(100% + 6px);z-index:20;min-width:232px;padding:6px;background:var(--ctl);border:1.5px solid var(--line-s);border-radius:calc(var(--r) + 3px);box-shadow:0 16px 32px -14px rgba(0,0,0,.4);display:grid}
.menu button{display:flex;align-items:center;height:40px;padding:0 12px;border:0;background:none;border-radius:var(--r);text-align:left;font-size:15px;cursor:pointer}
.menu button:hover{background:var(--hover)}
.menu .danger{color:var(--danger)}
.menu hr{border:0;border-top:1px solid var(--line);margin:5px 0;width:100%}

.copy{display:flex;align-items:baseline;gap:7px}
.copy::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none;translate:0 -1px}
.copy.old,.copy.none{color:var(--warn);font-weight:600}
.copy.old::before,.copy.none::before{background:var(--warn)}

.status{display:flex;align-items:center;gap:10px 18px;flex-wrap:wrap;font-size:15.5px;line-height:1.4;color:var(--ink-2)}
.status strong{color:var(--ink);font-weight:600}
.status a{font-weight:500;color:var(--ink);white-space:nowrap}
.tools{display:flex;gap:12px 18px;flex-wrap:wrap;align-items:center}
.tools .search{position:relative;flex:1 1 240px;max-width:360px}
.tools .search .ic{position:absolute;left:12px;top:11px;color:var(--ink-2)}
.tools input,.tools select{height:38px;border:1.5px solid var(--line-s);border-radius:var(--r);background:var(--input,#fff);padding:0 12px;font-size:15px}
.tools input{width:100%;padding-left:36px}
.tools .sort{display:flex;align-items:center;gap:8px;font-size:15px;color:var(--ink-2)}
.st-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.st-head .usage{margin-top:10px;padding:0;font-size:15px;font-variant-numeric:tabular-nums}
/* téléphone, au retour : le formulaire se replie derrière un bouton, les projets passent en premier */
.form-toggle{display:none}
@media (max-width:600px){body.retour .form-toggle{display:inline-flex;width:100%}body.retour [data-collapse]:not(.open)>*:not(.form-toggle){display:none}body.retour [data-collapse].open .form-toggle{display:none}}
.lbl-long{display:none}
.st-state{display:flex;gap:8px;align-items:baseline;font-weight:600}
.st-state:not(.ok)::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--warn);flex:none;translate:0 -1px}
.st-state.ok .ic{translate:0 3px}
.st-state .ic{color:var(--ok)}
.steps p,.st-main p,.st-item p{text-wrap:pretty}
.only-s{display:none}
@media (max-width:560px){.hide-s{display:none!important}.only-s{display:inline}.btn.sm{padding-inline:11px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}html{scroll-behavior:auto}}
</style>`

// ---------- Comportements communs.
export const commonJs = `<script>
// État de la page : ?vide = premier passage (aucun projet), ?beaucoup = 18 projets, ?piece = formulaire en mode pièce.
const Q = new URLSearchParams(location.search)
document.body.classList.add(Q.has('vide') ? 'premier' : 'retour')
// Mur ou pièce : les champs changent, le nom d'exemple aussi.
for (const form of document.querySelectorAll('[data-form]')) {
  const setKind = (kind) => {
    form.dataset.mode = kind
    for (const b of form.querySelectorAll('[data-kind] button')) b.setAttribute('aria-pressed', String(b.dataset.v === kind))
    for (const el of form.querySelectorAll('[data-room]')) el.hidden = kind !== 'room'
    for (const el of form.querySelectorAll('[data-wall]')) el.hidden = kind !== 'wall'
    form.querySelector('[data-lw]').textContent = kind === 'room' ? 'Largeur' : 'Largeur du mur'
    form.querySelector('[data-name]').placeholder = kind === 'room' ? 'Ex. : Chambre d’amis' : 'Ex. : Salon, mur du fond'
    form.querySelector('[data-w]').value = kind === 'room' ? 420 : 300
    form.dispatchEvent(new CustomEvent('kind', { detail: kind }))
  }
  form.dataset.mode = 'wall'
  for (const b of form.querySelectorAll('[data-kind] button')) b.addEventListener('click', () => setKind(b.dataset.v))
  for (const b of form.querySelectorAll('[data-shape] button')) b.addEventListener('click', () => {
    for (const o of form.querySelectorAll('[data-shape] button')) o.setAttribute('aria-pressed', String(o === b))
    form.dataset.shape = b.dataset.v
    form.dispatchEvent(new CustomEvent('kind', { detail: 'room' }))
  })
  form.addEventListener('submit', (e) => e.preventDefault())
  if (Q.has('piece')) setKind('room')
}
// Mode pièce : la ligne sous les champs annonce le nombre de murs et la surface à peindre.
for (const f of document.querySelectorAll('[data-form]')) {
  const out = f.querySelector('.room-sum')
  if (!out) continue
  const v = (k) => +f.querySelector('[data-' + k + ']').value || 0, fr = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR')
  const sum = () => { const L = f.dataset.shape === 'L', per = 2 * (v('w') + v('d')); out.innerHTML = '<strong>' + (L ? 6 : 4) + '&nbsp;murs, ' + fr(per * v('c') / 1e4) + '&nbsp;m² à peindre</strong> et ' + fr(v('w') * v('d') * (L ? .75 : 1) / 1e4) + '&nbsp;m² au sol. Les angles se déplacent ensuite sur le plan.' }
  f.addEventListener('input', sum); f.addEventListener('kind', sum); sum()
}
// Beaucoup de projets : la recherche et le tri apparaissent à partir de 9.
if (Q.has('beaucoup')) {
  const list = document.querySelector('[data-list]'), items = [...list.querySelectorAll('[data-project]')]
  const names = ['Chambre d’amis', 'Couloir', 'Cuisine, crédence', 'Bureau', 'Garage', 'Chambre de Noé', 'Palier', 'Salle de jeux', 'Véranda', 'Atelier', 'Buanderie', 'Mur du jardin']
  names.forEach((n, i) => {
    const li = items[1 + (i % (items.length - 1))].cloneNode(true)
    li.querySelector('h3').textContent = n
    list.append(li)
  })
  const all = [...list.querySelectorAll('[data-project]')], extra = +(list.dataset.extra || 0)
  for (const el of document.querySelectorAll('[data-n]')) el.textContent = all.length + extra
  for (const el of document.querySelectorAll('[data-nv]')) el.textContent = all.reduce((t, li) => t + +li.dataset.v, extra ? 3 : 0)
  document.querySelector('[data-tools]').hidden = false
}
if (Q.has('refus')) for (const box of document.querySelectorAll('[data-persist]')) { box.querySelector('.st-acts').hidden = true; box.querySelector('[data-denied]').hidden = false }
if (Q.has('long')) for (const el of document.querySelectorAll('.resume h1, [data-project] h3')) el.textContent = el.title = 'Mur du fond de la chambre des enfants, côté fenêtre'
// Un nom limité à deux lignes est coupé entre deux mots, jamais au milieu d'un mot ; le nom complet reste en infobulle.
function clampNames() {
  for (const el of document.querySelectorAll('.resume h1, [data-project] h3')) {
    const full = el.title || (el.title = el.textContent)
    el.textContent = full
    el.classList.toggle('long', full.length > 30)
    // une ligne de trop se voit à la hauteur du contenu ; la marge d'une demi-ligne ignore le débord normal des lettres
    const words = full.split(' '), slack = parseFloat(getComputedStyle(el).lineHeight) / 2
    while (words.length > 1 && el.scrollHeight > el.clientHeight + slack) { words.pop(); el.textContent = words.join(' ').replace(/[,;:]$/, '') + '…' }
  }
}
document.fonts.ready.then(clampNames)
addEventListener('resize', clampNames)
for (const b of document.querySelectorAll('[data-form-toggle]')) b.addEventListener('click', () => { const f = b.closest('[data-form]'); f.classList.add('open'); f.querySelector('[data-name]').focus() })
if (Q.has('menu')) { const m = document.querySelector('[data-list] .more') || document.querySelector('.more'); if (m) { m.open = true; m.scrollIntoView({ block: 'center' }) } }
// Un seul menu ouvert à la fois ; un clic ailleurs ou Échap le ferme.
addEventListener('click', (e) => { for (const d of document.querySelectorAll('.more[open]')) if (!d.contains(e.target)) d.open = false })
addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const d of document.querySelectorAll('.more[open]')) { d.open = false; d.querySelector('summary').focus() } })
// Démonstration de l'état « accordé » après la demande au navigateur.
for (const b of document.querySelectorAll('[data-ask]')) b.addEventListener('click', () => {
  const box = b.closest('[data-persist]')
  b.parentElement.hidden = true
  box.querySelector('[data-granted]').hidden = false
})
</script>`

// ---------- Maquette 1 : le carroyage posé sur le nom (16 colonnes, 4 rangées, calé sur la boîte des lettres).
export const carro = `<div class="carro" aria-hidden="true"><svg viewBox="0 0 16 4" preserveAspectRatio="none"><path class="cv" vector-effect="non-scaling-stroke" d="M1 0v4M2 0v4M3 0v4M4 0v4M5 0v4M6 0v4M7 0v4M8 0v4M9 0v4M10 0v4M11 0v4M12 0v4M13 0v4M14 0v4M15 0v4"/><path class="ch" vector-effect="non-scaling-stroke" d="M0 1h16M0 2h16M0 3h16"/><path class="cf" vector-effect="non-scaling-stroke" d="M0 0h16v4H0z"/><path class="cb" vector-effect="non-scaling-stroke" d="M0 4h16"/></svg><ol class="cols"><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li><li>F</li><li>G</li><li>H</li><li>I</li><li>J</li><li>K</li><li>L</li><li>M</li><li>N</li><li>O</li><li>P</li></ol><ol class="rows"><li>4</li><li>3</li><li>2</li><li>1</li></ol></div>`

// ---------- Icône de l'onglet : l'icône existante de l'application.
export const favicon = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(icon.replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"'))}">`

// ---------- Bouton qui déplie le formulaire replié (téléphone, au retour).
export const formToggle = `<button type="button" class="btn quiet form-toggle" data-form-toggle>${iPlus} Nouveau projet</button>`
