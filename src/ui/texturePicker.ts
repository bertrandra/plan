// Selecteur de textures Poly Haven (spec §3.2, ui/texturePicker.ts).
//
// Textures CC0, API publique. Le catalogue (852 textures, ~800 ko de JSON) est charge UNE fois et
// garde en memoire : le rouvrir ne doit pas relancer le telechargement.
//
// Ce module ne connait pas le plan : il ouvre une fenetre, laisse choisir, et rappelle
// `onChoisi`. Ce sont les appelants qui appliquent le choix a un objet et redessinent - c'est
// pour cela qu'il peut sortir maintenant, alors que les panneaux qui pilotent le plan attendent
// que render/** soit sorti (spec §4, phase 5).

import { showErrBanner } from '../shell/dialogs.js';
import type { TextureAppliquee } from '../model/types.js';

export const POLYHAVEN_ASSETS_URL = 'https://api.polyhaven.com/assets?type=textures';
export const POLYHAVEN_FILES_URL = (id: string) =>
  'https://api.polyhaven.com/files/' + encodeURIComponent(id);

/** Une texture du catalogue, reduite aux champs dont le selecteur se sert. */
export interface TexturePolyhaven {
  name: string;
  categories?: string[];
  tags?: string[];
  download_count?: number;
  thumbnail_url?: string;
  /** Rendu dans l'apercu ; l'API ne garantit ni l'un ni l'autre selon la texture. */
  category?: string;
  description?: string;
}

/** Le resultat d'un choix, tel qu'il s'enregistre sur un objet du plan. Vit dans `model/types.ts` :
 * c'est une donnee du projet, pas une donnee propre au selecteur. */
export type { TextureAppliquee };

/** Options d'ouverture : une case a cocher facultative sous la grille. */
export interface OptionsSelecteur {
  checkboxLabel?: string;
}

let polyhavenCatalogue: Record<string, TexturePolyhaven> | null = null;
let polyhavenChargement: Promise<Record<string, TexturePolyhaven>> | null = null;
export function chargerCataloguePolyhaven(){
  if(polyhavenCatalogue) return Promise.resolve(polyhavenCatalogue);
  if(polyhavenChargement) return polyhavenChargement;
  polyhavenChargement = fetch(POLYHAVEN_ASSETS_URL)
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(j=>{ polyhavenCatalogue = j; polyhavenChargement = null; return j; })
    .catch(e=>{ polyhavenChargement = null; throw e; });
  return polyhavenChargement;
}
// Ouvre le selecteur ; `onChoisi({id,nom,vignette,url}, appliquerTous)` est appele une fois que
// l'utilisateur a cliqué Enregistrer sur une texture (jamais pendant la simple navigation/apercu).
// `options.checkboxLabel` : si fourni, affiche une case a cocher dans le pied de page (decochee
// par defaut) - `appliquerTous` reflete son etat au moment d'Enregistrer, sinon toujours false.

export function ouvrirSelecteurTexture(
  titre: string,
  onChoisi: (choix: TextureAppliquee, appliquerATous?: boolean) => void,
  options?: OptionsSelecteur
){
  options = options || {};
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:18px 20px; border-radius:8px; ' +
    'width:min(760px,94vw); height:min(600px,88vh); display:flex; flex-direction:column; ' +
    'font-family:"Helvetica Neue",Arial,sans-serif; box-shadow:0 4px 24px rgba(0,0,0,0.3);';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;';
  const h = document.createElement('div'); h.style.cssText='font-weight:700; font-size:1rem;';
  h.textContent = titre + ' — textures Poly Haven (CC0)';
  const fermerX = document.createElement('button'); fermerX.type='button'; fermerX.className='secondary small';
  fermerX.textContent = '✕'; fermerX.addEventListener('click', ()=>overlay.remove());
  head.appendChild(h); head.appendChild(fermerX);

  const recherche = document.createElement('input');
  recherche.type = 'text'; recherche.placeholder = 'Rechercher (bois, brique, tuile, beton, gazon...)';
  recherche.style.cssText = 'padding:8px 10px; font-size:0.9rem; margin-bottom:8px;';

  const statut = document.createElement('div');
  statut.style.cssText = 'font-size:0.78rem; color:var(--ink-soft); margin-bottom:6px;';
  statut.textContent = 'Chargement du catalogue Poly Haven…';

  const corps = document.createElement('div');
  corps.style.cssText = 'flex:1; display:flex; gap:12px; min-height:0;';
  const grille = document.createElement('div');
  grille.style.cssText = 'flex:1.3; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(84px,1fr)); ' +
    'gap:6px; align-content:start; border:1px solid var(--rule); border-radius:4px; padding:6px;';
  const apercu = document.createElement('div');
  apercu.style.cssText = 'flex:1; border:1px solid var(--rule); border-radius:4px; padding:10px; ' +
    'display:flex; flex-direction:column; align-items:center; text-align:center; overflow-y:auto;';
  apercu.innerHTML = '<div class="hint">Clique une vignette pour la voir en grand.</div>';
  corps.appendChild(grille); corps.appendChild(apercu);

  const piedPage = document.createElement('div');
  piedPage.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:12px;';
  let appliquerTousCb = null;
  if(options.checkboxLabel){
    const labelAppliquer = document.createElement('label');
    labelAppliquer.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:0.82rem; margin-right:auto; cursor:pointer;';
    appliquerTousCb = document.createElement('input'); appliquerTousCb.type = 'checkbox';
    labelAppliquer.appendChild(appliquerTousCb);
    labelAppliquer.appendChild(document.createTextNode(options.checkboxLabel as string));
    piedPage.appendChild(labelAppliquer);
  }
  const annulerBtn = document.createElement('button'); annulerBtn.className='secondary'; annulerBtn.textContent='Annuler';
  const enregistrerBtn = document.createElement('button'); enregistrerBtn.textContent='Enregistrer'; enregistrerBtn.disabled = true;
  annulerBtn.addEventListener('click', ()=>overlay.remove());
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  piedPage.appendChild(annulerBtn); piedPage.appendChild(enregistrerBtn);

  box.appendChild(head); box.appendChild(recherche); box.appendChild(statut); box.appendChild(corps); box.appendChild(piedPage);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let selectionId: string | null = null;

  function afficherApercu(id: string, data: TexturePolyhaven){
    selectionId = id;
    ([...grille.children] as HTMLElement[]).forEach(c=>{ c.style.outline = c.dataset.id===id ? '3px solid var(--accent)' : 'none'; });
    apercu.innerHTML = '';
    const img = document.createElement('img');
    img.src = data.thumbnail_url; img.style.cssText = 'max-width:100%; border-radius:4px; margin-bottom:8px;';
    const nom = document.createElement('div'); nom.style.cssText='font-weight:600; margin-bottom:4px;'; nom.textContent = data.name;
    const cat = document.createElement('div'); cat.style.cssText='font-size:0.78rem; color:var(--ink-soft); margin-bottom:6px;'; cat.textContent = data.category || (data.categories||[]).join(', ');
    const desc = document.createElement('div'); desc.style.cssText='font-size:0.78rem; color:var(--ink-soft);'; desc.textContent = data.description || '';
    apercu.appendChild(img); apercu.appendChild(nom); apercu.appendChild(cat); apercu.appendChild(desc);
    enregistrerBtn.disabled = false;
  }

  function dessinerResultats(entries: [string, TexturePolyhaven][]){
    grille.innerHTML = '';
    entries.slice(0,60).forEach(([id,data])=>{
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = id;
      b.style.cssText = 'padding:0; border:1px solid var(--rule); border-radius:3px; overflow:hidden; cursor:pointer; background:#fff;';
      b.title = data.name;
      const img = document.createElement('img');
      img.src = data.thumbnail_url; img.loading = 'lazy';
      img.style.cssText = 'width:100%; height:64px; object-fit:cover; display:block;';
      const lbl = document.createElement('div');
      lbl.textContent = data.name; lbl.style.cssText = 'font-size:0.66rem; padding:2px 3px; line-height:1.15; ' +
        'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
      b.appendChild(img); b.appendChild(lbl);
      b.addEventListener('click', ()=>afficherApercu(id, data));
      grille.appendChild(b);
    });
  }

  function filtrerEtDessiner(){
    if(!polyhavenCatalogue) return;
    const q = recherche.value.trim().toLowerCase();
    const tous = Object.entries(polyhavenCatalogue);
    // La cle n'entre pas dans la recherche : seuls le nom, les categories et les mots-cles.
    const filtres = !q ? tous : tous.filter(([, d])=>
      d.name.toLowerCase().includes(q) ||
      (d.categories||[]).some(c=>c.toLowerCase().includes(q)) ||
      (d.tags||[]).some(t=>t.toLowerCase().includes(q)));
    filtres.sort((a,b)=>(b[1].download_count||0)-(a[1].download_count||0));
    statut.textContent = filtres.length + ' resultat' + (filtres.length>1?'s':'') +
      (filtres.length>60 ? ' (60 premiers affiches, affine ta recherche pour voir les autres)' : '');
    dessinerResultats(filtres);
  }

  recherche.addEventListener('input', filtrerEtDessiner);

  chargerCataloguePolyhaven().then(()=>{
    statut.textContent = Object.keys(polyhavenCatalogue).length + ' textures disponibles.';
    filtrerEtDessiner();
    recherche.focus();
  }).catch(err=>{
    statut.textContent = '';
    grille.innerHTML = '';
    const erreur = document.createElement('div');
    erreur.className = 'hint';
    erreur.style.cssText = 'color:#a02020;';
    erreur.textContent = 'Impossible de charger le catalogue Poly Haven (connexion internet requise) : ' + err.message;
    grille.appendChild(erreur);
  });

  enregistrerBtn.addEventListener('click', ()=>{
    if(!selectionId || !polyhavenCatalogue) return;
    const data = polyhavenCatalogue[selectionId];
    enregistrerBtn.disabled = true; enregistrerBtn.textContent = 'Enregistrement…';
    fetch(POLYHAVEN_FILES_URL(selectionId))
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(files=>{
        // "Diffuse" est la carte couleur - c'est la seule qu'on utilise pour un rendu simple.
        // 1k suffit largement pour un objet de contexte et reste leger a charger. Le fallback
        // doit rester la resolution DISPONIBLE LA PLUS PETITE (triee numeriquement), pas juste
        // la premiere cle de l'objet : l'ordre des cles n'est pas garanti par l'API, et pour
        // certaines textures qui n'offrent ni 1k ni 2k pour Diffuse, prendre "la premiere venue"
        // pouvait charger une image 4k/8k (dizaines de Mo une fois decodee en memoire GPU) et
        // faire planter Safari/Chrome iOS pour depassement memoire - silencieusement, sans
        // message, puisque c'est l'OS qui tue l'onglet, pas une erreur JS interceptable.
        // Reponse de l'API "files" : la forme varie d'une texture a l'autre (resolutions
        // disponibles, cartes proposees), donc on ne la nomme pas — seul le chemin lu ici compte.
        const f = files as { Diffuse?: Record<string, { jpg?: { url?: string } }>; diffuse?: Record<string, { jpg?: { url?: string } }> };
        const diff = f.Diffuse || f.diffuse;
        const resKeys = diff ? Object.keys(diff).filter(k=>/^\d+k$/i.test(k)).sort((a,b)=>parseInt(a,10)-parseInt(b,10)) : [];
        const reso = diff && (diff[resKeys[0]] || Object.values(diff)[0]);
        const url = reso && reso.jpg && reso.jpg.url;
        if(!url) throw new Error('Pas de carte de couleur (Diffuse) disponible pour cette texture');
        overlay.remove();
        onChoisi({ id:selectionId, nom:data.name, vignette:data.thumbnail_url, url }, !!(appliquerTousCb && appliquerTousCb.checked));
      })
      .catch(err=>{
        enregistrerBtn.disabled = false; enregistrerBtn.textContent = 'Enregistrer';
        showErrBanner('Texture Poly Haven : ' + err.message);
      });
  });
}
