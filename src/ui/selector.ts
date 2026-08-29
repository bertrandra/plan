// Selecteur d'objets et table d'affichage (spec §3.2, ui/).
//
// Deux listes qui regardent le meme plan : le selecteur choisit CE QU'ON edite, la table
// d'affichage choisit CE QU'ON voit. La premiere est filtree par famille (terrain, terrasse,
// batiment...), la seconde montre tous les objets d'un coup.
//
// La table se reconstruit a chaque rendu, ce qui detacherait du DOM la case qu'on vient de cocher
// et renverrait le focus au debut de la page. Tant que la liste d'objets ne bouge pas, on se
// contente donc de remettre les cases a jour - c'est la raison de la signature comparee en tete.

import { el } from './dom.js';
import { LIBELLE_FONCTION } from '../model/defaults.js';

// Famille affichee dans le selecteur. Elle ne concerne que lui : ce n'est ni une donnee du plan ni
// une preference enregistree, seulement l'endroit ou l'utilisateur regarde en ce moment.
let selectorFiltre = 'terrain';

const selectorDiv = () => el('selector');
export function rebuildSelector(etat, ctx){
  selectorDiv().innerHTML='';
  // Voisinage masque = voisinage absent du selecteur, categories comprises : proposer de
  // selectionner un objet qu'on ne voit pas n'a pas de sens, et les compteurs annonceraient un
  // plan qui n'est pas celui affiche. Un objet masque INDIVIDUELLEMENT (case du tableau
  // d'affichage) reste, lui, listee : c'est de la que l'on peut le demasquer.
  const objetsListables = etat.objects.filter(o=>!(o.voisinage && !etat.voisinageVisible));
  const familles = [];
  objetsListables.forEach(obj=>{
    const f = obj.fonction || 'autre';
    let fam = familles.find(x=>x.cle===f);
    if(!fam){ fam = {cle:f, objets:[]}; familles.push(fam); }
    fam.objets.push(obj);
  });
  // Le filtre courant peut avoir disparu (dernier objet de sa famille supprime, ou voisinage
  // masque) : on retombe sur "tout" plutot que d'afficher une rangee vide sans explication.
  if(selectorFiltre !== 'tout' && !familles.some(f=>f.cle===selectorFiltre)) selectorFiltre = 'tout';
  const objetSelectionne = objetsListables.find(o=>o.key===etat.selectedKey);

  // --- Niveau 1 : la categorie ---
  if(familles.length > 1){
    const rangeeFiltres = document.createElement('div');
    rangeeFiltres.className = 'selectorFamilles';
    const legende = document.createElement('span');
    legende.className = 'selectorLegende';
    legende.textContent = 'Catégorie';
    rangeeFiltres.appendChild(legende);
    const ajouterFiltre = (cle, libelle, n)=>{
      const b = document.createElement('button');
      b.className = 'objbtn fambtn' + (selectorFiltre===cle ? ' active' : '');
      b.appendChild(document.createTextNode(libelle));
      const compteur = document.createElement('span');
      compteur.className = 'fambtnN';
      compteur.textContent = n;
      b.appendChild(compteur);
      b.title = 'N\'afficher que : ' + libelle + ' (' + n + ')';
      b.addEventListener('click', ()=>{ selectorFiltre = cle; rebuildSelector(etat, ctx); });
      rangeeFiltres.appendChild(b);
    };
    ajouterFiltre('tout', 'Tout', objetsListables.length);
    familles.forEach(f=>ajouterFiltre(f.cle, LIBELLE_FONCTION[f.cle] || f.cle, f.objets.length));
    selectorDiv().appendChild(rangeeFiltres);
  }

  // --- Niveau 2 : selection courante a gauche, puis les objets de la categorie ---
  const rangee = document.createElement('div');
  rangee.className = 'selectorRangee';

  const chip = document.createElement('div');
  chip.className = 'selectorSelection' + (objetSelectionne ? '' : ' vide');
  const chipLeg = document.createElement('span');
  chipLeg.className = 'selectorSelectionFam';
  chipLeg.textContent = objetSelectionne
    ? (LIBELLE_FONCTION[objetSelectionne.fonction] || objetSelectionne.fonction || 'Objet')
    : 'Sélection';
  const chipNom = document.createElement('span');
  chipNom.className = 'selectorSelectionNom';
  chipNom.textContent = objetSelectionne ? objetSelectionne.name : 'aucune';
  chip.appendChild(chipLeg); chip.appendChild(chipNom);
  if(objetSelectionne){
    // La selection peut appartenir a une categorie qui n'est pas affichee : cliquer la pastille
    // bascule le filtre sur SA categorie, plutot que de laisser chercher ou elle est rangee.
    chip.title = 'Objet en cours d\'edition — clic : afficher sa catégorie';
    chip.addEventListener('click', ()=>{
      selectorFiltre = objetSelectionne.fonction || 'autre';
      rebuildSelector(etat, ctx);
    });
  } else {
    chip.title = 'Aucun objet selectionne';
  }
  rangee.appendChild(chip);

  const liste = document.createElement('div');
  liste.className = 'selectorListe';
  // Strictement la categorie choisie : un objet hors filtre n'apparait pas dans la liste. Sa
  // selection reste lisible dans la pastille de gauche, qui ne bouge jamais.
  const visibles = selectorFiltre==='tout'
    ? objetsListables.slice()
    : objetsListables.filter(o=>(o.fonction||'autre')===selectorFiltre);
  visibles.forEach(obj=>{
    const b=document.createElement('button');
    b.className='objbtn'+(obj.key===etat.selectedKey?' active':'');
    b.textContent=obj.name;
    b.title = obj.name + (obj.fonction ? ' — ' + (LIBELLE_FONCTION[obj.fonction] || obj.fonction) : '');
    b.addEventListener('click', ()=>{ etat.selectedKey=obj.key; etat.highlight={type:null,index:null}; rebuildSelector(etat, ctx); ctx.render(); });
    liste.appendChild(b);
  });
  rangee.appendChild(liste);
  selectorDiv().appendChild(rangee);
}

export function renderDispTable(etat, ctx){
  const tbl = el<HTMLTableElement>('dispTable');
  const cols = [
    {field:'showName', label:'Nom'},
    {field:'showSegNames', label:'Nom segment'},
    {field:'showVertNames', label:'Nom coin'},
    {field:'showDims', label:'Dimension'},
    {field:'showAngles', label:'Angle'}
  ];
  // Chaque case appelle ctx.render(), qui rappelle cette fonction : tout reconstruire detachait du
  // DOM la case qu'on venait de cocher, et le focus clavier repartait au debut de la page. Tant
  // que la liste d'objets ne bouge pas, on se contente donc de remettre les cases a jour.
  const signature = JSON.stringify(etat.objects.map(o=>[o.key, o.name]));
  if(tbl.dataset.signature === signature && tbl.rows.length === etat.objects.length + 1){
    etat.objects.forEach((obj,i)=>{
      const cells = tbl.rows[i+1].cells;
      const cbHide = cells[1].firstChild as HTMLInputElement | null;
      if(cbHide) cbHide.checked = !!obj.hidden;
      cols.forEach((col,c)=>{
        const cb = cells[c+2].firstChild as HTMLInputElement | null;
        if(cb) cb.checked = !!obj[col.field];
      });
    });
    return;
  }
  tbl.dataset.signature = signature;
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  const th0 = document.createElement('th'); th0.textContent='Objet'; head.appendChild(th0);
  // A part des autres : coche = masque (les colonnes showX sont l'inverse, coche = affiche), donc
  // une colonne a elle seule pour que le sens ne se melange jamais avec le reste de la ligne.
  const thHide = document.createElement('th');
  thHide.textContent = 'Masqué';
  thHide.style.cursor = 'pointer';
  thHide.title = "Cliquer pour masquer/afficher tous les objets";
  thHide.addEventListener('click', ()=>{
    const allHidden = etat.objects.every(o=>o.hidden);
    etat.objects.forEach(o=>{ o.hidden = !allHidden; });
    ctx.markDirty();
    ctx.render();
  });
  head.appendChild(thHide);
  cols.forEach(col=>{
    const th = document.createElement('th');
    th.textContent = col.label;
    th.style.cursor = 'pointer';
    th.title = "Cliquer pour appliquer a tous les objets";
    th.addEventListener('click', ()=>{
      const allChecked = etat.objects.every(o=>o[col.field]);
      const newVal = !allChecked;
      etat.objects.forEach(o=>{ o[col.field] = newVal; });
      ctx.markDirty();
      ctx.render();
    });
    head.appendChild(th);
  });
  tbl.appendChild(head);

  etat.objects.forEach(obj=>{
    // On retient la cle, pas l'objet : les lignes survivent maintenant a un ctx.render(), et un
    // ctx.restoreState() remplace les objets par des copies. Capturer `obj` ferait ecrire les cases
    // dans des objets detaches du plan.
    const cle = obj.key;
    const cible = ()=>etat.objects.find(o=>o.key === cle);
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=obj.name;
    tr.appendChild(td0);
    const tdHide = document.createElement('td');
    const cbHide = document.createElement('input'); cbHide.type='checkbox'; cbHide.checked=!!obj.hidden;
    cbHide.title = 'Masquer cet objet sur le plan et en Vue 3D (reste modifiable via la barre laterale)';
    cbHide.addEventListener('change', ()=>{ const o=cible(); if(!o) return; o.hidden = cbHide.checked; ctx.markDirty(); ctx.render(); });
    tdHide.appendChild(cbHide);
    tr.appendChild(tdHide);
    cols.forEach(col=>{
      const td=document.createElement('td');
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=obj[col.field];
      cb.addEventListener('change', ()=>{ const o=cible(); if(!o) return; o[col.field]=cb.checked; ctx.markDirty(); ctx.render(); });
      td.appendChild(cb);
      tr.appendChild(td);
    });
    tbl.appendChild(tr);
  });
}
