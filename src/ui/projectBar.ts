// Barre de projet, actualisation cadastrale et panneau PLU (spec §3.2, ui/).
//
// Trois choses qui parlent du projet plutot que du plan : ou il est enregistre, d'ou viennent ses
// donnees cadastrales, et ce que le PLU dit de sa parcelle.
//
// L'actualisation est le geste delicat du lot : elle rejoue l'import IGN sur un plan qui a deja ete
// modifie. Ce qui vient du cadastre est remplace, ce que l'utilisateur a dessine est conserve - et
// c'est pour cela qu'elle passe par l'historique avant de toucher quoi que ce soit.

import { escapeHtml } from '../util/escape.js';
import { APP_VERSION, SCHEMA_VERSION, API_VERSION, versionLongue } from '../model/version.js';
import { nombreFr } from '../util/format.js';
import { showPrompt } from './dialogs.js';
import { el } from './dom.js';
import { ouvrirImportCadastre } from './cadastreDialog.js';
import { hauteurBatiment, hauteurVegetation, arbresEstimes, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from '../geo/bdtopo.js';
import { distancePointContour } from '../geometry/proximite.js';
import { showToast, showErrBanner, showConfirm } from './dialogs.js';
import { centroid } from '../geometry/basic.js';
import { projecteurLocal } from '../geo/projection.js';
import { libelleParcelle } from '../geo/bdtopo.js';
import { SIMPLIF_M } from '../geo/constantesCadastre.js';
import {
  interrogerCadastre, construireCandidats, trierVoisines,
  anneauVersPts, anneauExterieur, bboxDegDesAnneaux, interrogerWfs, construireElementsIgn,
  fetchJSONReseau, polygonesSeTouchent, CADASTRE_URL,
  interrogerPlu, lienGeoportailUrbanisme, lienTerritoireUrbanisme,
  COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE
} from '../geo/apiIgn.js';
export function setupProjectBar(seed, ctx){
  const bar = document.getElementById('projectBar');
  bar.innerHTML = '';

  // Pastille de version, calee a droite de la barre : c'est la premiere chose a demander dans un
  // rapport de bug, et elle doit apparaitre dans les deux modes (RELEASE.md 5.2).
  function pastilleVersion(){
    const s = document.createElement('span');
    s.id = 'appVersion';
    s.textContent = 'v' + APP_VERSION;
    s.title = versionLongue() + ' — schema de projet ' + SCHEMA_VERSION + ', API ' + API_VERSION;
    return s;
  }

  // Bouton disponible dans les deux modes : sans serveur, l'import cadastre charge quand meme
  // le plan en memoire (et le dit) - c'est plus utile qu'un bouton absent sans explication.
  function boutonCadastre(){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary small'; b.textContent = '+ Depuis une adresse';
    b.title = 'Cree un projet a partir du plan cadastral : adresse, parcelle, parcelles voisines';
    b.addEventListener('click', ()=>{
      if(ctx.etat.dirty && seed.apiAvailable){
        showConfirm('Des modifications ne sont pas enregistrees. Ouvrir l\'import cadastre quand meme ?',
          ()=>ouvrirImportCadastre(ctx.contexteImport()));
        return;
      }
      ouvrirImportCadastre(ctx.contexteImport());
    });
    return b;
  }
  // Actualisation : disponible des qu'un plan a une origine cadastrale, y compris en mode local.
  function boutonActualiser(){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary small'; b.textContent = '↻ Actualiser IGN';
    b.title = 'Rejoue les appels IGN et remplace ce qui en vient : contour cadastral, batiments et vegetation importes, zonage PLU. Les objets dessines a la main ne sont pas touches.';
    b.addEventListener('click', ()=>ouvrirDialogueActualisation(b, ctx));
    return b;
  }

  if(!seed.apiAvailable){
    bar.classList.add('localMode');
    bar.appendChild(boutonCadastre());
    bar.appendChild(boutonActualiser());
    const status = document.createElement('span');
    status.id = 'projectStatus';
    status.textContent = 'Mode local — jeu de donnees de demonstration (api.php introuvable : aucune sauvegarde serveur).';
    bar.appendChild(status);
    bar.appendChild(pastilleVersion());
    return;
  }
  bar.classList.remove('localMode');

  let currentMeta = seed.meta;
  let list = seed.list;
  let lastSavedLabel = currentMeta && currentMeta.updatedAt
    ? 'Enregistre a ' + new Date(currentMeta.updatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
    : '';

  const sel = document.createElement('select');
  sel.id = 'projectSelect';
  sel.title = 'Choisir un projet';
  list.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if(currentMeta && p.id===currentMeta.id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', ()=>{
    const target = sel.value;
    if(ctx.etat.dirty){
      sel.value = currentMeta.id; // revert until confirmed, so a cancel leaves the dropdown consistent
      showConfirm('Des modifications ne sont pas enregistrees. Changer de projet quand meme (elles seront perdues) ?', ()=>{
        localStorage.setItem(ctx.cleDernierProjet, target);
        location.href = ctx.withProjectParam(target);
      });
      return;
    }
    localStorage.setItem(ctx.cleDernierProjet, target);
    location.href = ctx.withProjectParam(target);
  });

  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'secondary small'; newBtn.textContent = '+ Nouveau projet';
  newBtn.addEventListener('click', ()=>{
    showPrompt('Nom du nouveau projet (copie du plan actuel) :', currentMeta ? (currentMeta.name + ' (copie)') : 'Nouveau projet', async (name)=>{
      try{
        const created = await ctx.apiSave({ name, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, objects: ctx.serializeObjects(ctx.etat.objects), measures: ctx.serializeMeasures(ctx.etat.measures) });
        localStorage.setItem(ctx.cleDernierProjet, created.id);
        location.href = ctx.withProjectParam(created.id);
      } catch(e){
        showErrBanner('Impossible de creer le projet : ' + (e.message||e));
      }
    });
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; saveBtn.id = 'saveProjectBtn'; saveBtn.className = 'small'; saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', async ()=>{
    if(!currentMeta) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…';
    try{
      const res = await ctx.apiSave({ id: currentMeta.id, name: currentMeta.name, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, objects: ctx.serializeObjects(ctx.etat.objects), measures: ctx.serializeMeasures(ctx.etat.measures) });
      ctx.etat.dirty = false;
      lastSavedLabel = 'Enregistre a ' + new Date(res.updatedAt || Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      ctx.initialState().length = 0;
      ctx.initialState().push(...ctx.serializeObjects(ctx.etat.objects));
      ctx.initialMeasures().length = 0;
      ctx.initialMeasures().push(...ctx.serializeMeasures(ctx.etat.measures));
      showToast('Projet enregistre.');
    } catch(e){
      showErrBanner('Echec de l\'enregistrement : ' + (e.message||e));
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer';
      ctx.refreshProjectStatus();
    }
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button'; delBtn.className = 'secondary small'; delBtn.textContent = 'Supprimer';
  delBtn.title = 'Supprimer ce projet du serveur';
  delBtn.disabled = list.length <= 1;
  delBtn.addEventListener('click', ()=>{
    showConfirm('Supprimer definitivement le projet "' + currentMeta.name + '" ? Cette action est irreversible.', async ()=>{
      try{
        await ctx.apiDelete(currentMeta.id);
        localStorage.removeItem(ctx.cleDernierProjet);
        const url = new URL(location.href); url.searchParams.delete('projet');
        location.href = url.toString();
      } catch(e){
        showErrBanner('Echec de la suppression : ' + (e.message||e));
      }
    });
  });

  const status = document.createElement('span');
  status.id = 'projectStatus';
  function updateStatus(){
    status.textContent = ctx.etat.dirty ? 'Modifications non enregistrees' : (lastSavedLabel || 'A jour');
  }
  ctx.definirRafraichisseurStatut(updateStatus);
  updateStatus();

  bar.appendChild(sel); bar.appendChild(newBtn); bar.appendChild(boutonCadastre()); bar.appendChild(boutonActualiser());
  bar.appendChild(saveBtn); bar.appendChild(delBtn); bar.appendChild(status);
  bar.appendChild(pastilleVersion());
}

export function renderPanneauPlu(ctx){
  const hote = document.getElementById('pluContenu');
  const lien = el<HTMLAnchorElement>('pluGeoportailLien');
  const btn = el<HTMLButtonElement>('pluInterrogerBtn');
  if(!hote) return;
  hote.innerHTML = '';
  const parcelle = ctx.trouverParcelleCloture();
  if(!parcelle){
    btn.disabled = true;
    lien.style.display = 'none';
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = 'Aucune parcelle dans ce plan : le PLU s\'interroge au centre de la parcelle. Importe une parcelle depuis une adresse, ou regle "Fonction" sur "terrain" pour l\'objet concerne.';
    hote.appendChild(p);
    return;
  }
  btn.disabled = false;
  const lieu = ctx.lieuActuel();
  lien.href = lienGeoportailUrbanisme(lieu.longitude, lieu.latitude);
  lien.style.display = '';

  const coord = document.createElement('div');
  coord.className = 'hint';
  coord.textContent = 'Point interroge : ' + lieu.latitude.toFixed(6).replace('.',',') + '° N, ' +
    lieu.longitude.toFixed(6).replace('.',',') + '° E (centre de « ' + parcelle.name + ' »).';
  hote.appendChild(coord);

  const plu = parcelle.plu;
  if(!plu){
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = 'Aucun zonage enregistre pour cette parcelle. Clique sur « Interroger le Geoportail de l\'urbanisme ».';
    hote.appendChild(p);
    return;
  }
  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const ligne = (cle, valeurHtml) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = cle;
    td1.style.cssText = 'white-space:nowrap; color:var(--ink-soft);';
    const td2 = document.createElement('td');
    td2.innerHTML = valeurHtml;
    tr.appendChild(td1); tr.appendChild(td2);
    tbl.appendChild(tr);
  };
  if(plu.commune) ligne('Commune', escapeHtml(plu.commune.nom) + ' (INSEE ' + escapeHtml(plu.commune.insee) + ')' + (plu.commune.rnu ? ' — au RNU' : ''));
  if(!plu.zones.length){
    ligne('Zonage', plu.commune && plu.commune.rnu
      ? 'Commune au RNU : pas de document d\'urbanisme local, ce sont les regles nationales qui s\'appliquent.'
      : 'Aucune zone renvoyee pour ce point (document non verse au Geoportail, ou parcelle hors zonage).');
  }
  plu.zones.forEach((z, i)=>{
    const prefixe = plu.zones.length > 1 ? 'Zone ' + (i+1) : 'Zone';
    ligne(prefixe, '<b>' + escapeHtml(z.libelle) + '</b>' + (z.typezone ? ' — type ' + escapeHtml(z.typezone) : ''));
    if(z.libelong) ligne('Libellé', escapeHtml(z.libelong));
    if(z.datappro) ligne('Approbation', escapeHtml(z.datappro));
    if(z.urlfic) ligne('Règlement', '<a href="' + escapeHtml(z.urlfic) + '" target="_blank" rel="noopener">' + escapeHtml(z.nomfic || 'document PDF') + ' ↗</a>');
    if(z.partition) ligne('Document', escapeHtml(z.partition));
  });
  (plu.prescriptions || []).forEach((p, i)=>{
    ligne('Prescription ' + (i+1), escapeHtml((p.libelle || '') + (p.typepsc ? ' (' + p.typepsc + ')' : '')) +
      (p.urlfic ? ' <a href="' + escapeHtml(p.urlfic) + '" target="_blank" rel="noopener">↗</a>' : ''));
  });
  (plu.informations || []).forEach((info, i)=>{
    ligne('Information ' + (i+1), escapeHtml(info.libelle || '') +
      (info.urlfic ? ' <a href="' + escapeHtml(info.urlfic) + '" target="_blank" rel="noopener">' + escapeHtml(info.nomfic || 'notice') + ' ↗</a>' : ''));
  });
  // Servitudes d'utilite publique : le SPR (AC4) est mis en avant separement - c'est celle qui
  // change le plus concretement ce qu'on a le droit de construire et l'aspect impose.
  (plu.spr || []).forEach(s=>{
    ligne('SPR', '<b>' + escapeHtml(s.nom) + '</b>' +
      (s.assiette ? ' — ' + escapeHtml(s.assiette) : '') +
      (s.source ? '<br><span style="opacity:0.75;">Précision de la limite : ' + escapeHtml(s.source) + '</span>' : '') +
      (s.fichier ? '<br><span style="opacity:0.75;">Acte : ' + escapeHtml(s.fichier) + '</span>' : '') +
      '<br><span style="opacity:0.75;">Site patrimonial remarquable : tous les travaux visibles depuis l\'espace public sont soumis à l\'avis de l\'Architecte des Bâtiments de France.</span>');
  });
  // Comparaison par contenu et non par identite d'objet : apres un aller-retour JSON (projet
  // enregistre puis rouvert), `spr` et `servitudes` sont deux copies distinctes, et un includes()
  // sur les references reafficherait le SPR une seconde fois en bas de liste.
  const cleSup = s => (s.type || '') + '|' + (s.nom || '') + '|' + (s.fichier || '');
  const clesSpr = new Set((plu.spr || []).map(cleSup));
  const autresSup = (plu.servitudes || []).filter(s=>!clesSpr.has(cleSup(s)));
  autresSup.forEach((s, i)=>{
    ligne('Servitude ' + (i+1) + (s.type ? ' (' + s.type + ')' : ''),
      '<b>' + escapeHtml(s.nom) + '</b>' +
      (s.generateur ? ' — ' + escapeHtml(s.generateur) : '') +
      (s.nature ? ' ' + escapeHtml(s.nature) : '') +
      (s.assiette ? '<br><span style="opacity:0.75;">Assiette : ' + escapeHtml(s.assiette) + ' (' + escapeHtml(s.forme) + ')</span>' : '') +
      (s.fichier ? '<br><span style="opacity:0.75;">Acte : ' + escapeHtml(s.fichier) + '</span>' : ''));
  });
  if(!(plu.servitudes || []).length) ligne('Servitudes', 'Aucune servitude d\'utilité publique renvoyée pour ce point.');
  if(plu.document) ligne('Document d\'urbanisme', escapeHtml(plu.document.nom) + (plu.document.type ? ' (' + escapeHtml(plu.document.type) + ')' : ''));
  // Les actes des servitudes et les annexes n'ont pas d'URL directe dans l'API : la page
  // territoire de la commune est le seul endroit qui les rassemble tous.
  if(plu.commune && plu.commune.insee){
    ligne('Tous les documents', '<a href="' + escapeHtml(lienTerritoireUrbanisme(plu.commune.insee)) + '" target="_blank" rel="noopener">Page territoire ' +
      escapeHtml(plu.commune.insee) + ' — règlement, annexes, actes des servitudes ↗</a>');
  }
  if(plu.interrogeLe) ligne('Interrogé le', escapeHtml(new Date(plu.interrogeLe).toLocaleString('fr-FR')));
  hote.appendChild(tbl);
}

export async function actualiserDepuisIgn(options, bouton, ctx){
  options = options || { portee:'tout', voisinage:{actif:false} };
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « + Depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  if(cad.origineLat === undefined || cad.origineLat === null){
    showToast('Ce plan n\'a pas de point de calage enregistre : actualiser deplacerait tout le contenu.');
    return;
  }
  const libelleInitial = bouton ? bouton.textContent : '';
  if(bouton){ bouton.disabled = true; bouton.textContent = 'Actualisation…'; }
  const bilan = [];
  try {
    const proj = projecteurLocal(cad.origineLat, cad.origineLon);
    const simplifier = !!cad.simplifieM;

    // ---- 1. La parcelle, par identifiant cadastral exact (on sait qui on cherche : pas d'emprise)
    const urlParcelle = CADASTRE_URL + '?code_insee=' + encodeURIComponent(cad.codeInsee) +
      '&section=' + encodeURIComponent(cad.section) + '&numero=' + encodeURIComponent(cad.numero) + '&_limit=5';
    const repParcelle = await fetchJSONReseau(urlParcelle);
    const featParcelle = ((repParcelle && repParcelle.features) || [])[0];
    let ptsParcelle = null;
    if(featParcelle){
      const anneau = anneauExterieur(featParcelle.geometry);
      if(anneau) ptsParcelle = anneauVersPts(anneau, proj, simplifier);
    }
    // Une parcelle fusionnee a un contour construit, pas un contour cadastral : le remplacer par
    // celui d'une seule de ses composantes amputerait le terrain.
    if(cad.fusionDe && cad.fusionDe.length > 1){
      bilan.push('propriete fusionnee : contour conserve');
      ptsParcelle = null;
    }

    // ---- 2. Les objets issus de la BD TOPO, couche par couche (portee "tout" seulement)
    const objsIgn = options.portee === 'tout'
      ? ctx.etat.objects.filter(o=>o.bdtopo && o.bdtopo.couche && o.bdtopo.couche !== 'estimation')
      : [];
    const couches = [...new Set(objsIgn.map(o=>o.bdtopo.couche))];
    const fraiches = {};
    if(couches.length){
      const anneaux = [];
      ctx.etat.objects.forEach(o=>{ if(o.cadastre && o.cadastre.geometrieSource) anneaux.push(o.cadastre.geometrieSource.coordinates[0]); });
      if(anneaux.length){
        const bbox = bboxDegDesAnneaux(anneaux, proj, 15);
        for(const couche of couches){
          try {
            const feats = await interrogerWfs(couche, bbox, 80);
            feats.forEach(f=>{
              const p = f.properties || {};
              const id = f.id || p.cleabs;
              if(id) fraiches[id] = f;
            });
          } catch { bilan.push('couche ' + couche + ' indisponible'); }
        }
      }
    }

    // ---- 3. Application
    ctx.pushHistory();
    let nMaj = 0, nAbsents = 0, ecartMax = 0;
    const serialises = ctx.serializeObjects(ctx.etat.objects).map(o=>{
      if(o.key === parcelle.key && ptsParcelle){
        // ecart max entre l'ancien et le nouveau contour : c'est la mesure du changement
        o.pts.forEach(p=>{ ecartMax = Math.max(ecartMax, distancePointContour(p, ptsParcelle)); });
        const copie = Object.assign({}, o, {
          pts: ptsParcelle,
          vertexNames: ptsParcelle.map((_,i)=>(o.vertexNames && o.vertexNames[i]) || ('Point ' + (i+1))),
          segmentNames: ptsParcelle.map((_,i)=>(o.segmentNames && o.segmentNames[i]) || ('Cote ' + (i+1))),
          frozenVertices: ptsParcelle.map(()=>false)
        });
        const pp = featParcelle.properties || {};
        copie.cadastre = Object.assign({}, o.cadastre, {
          contenanceM2: pp.contenance, commune: pp.nom_com || o.cadastre.commune,
          recupereLe: new Date().toISOString(),
          geometrieSource: { type:'Polygon', coordinates:[anneauExterieur(featParcelle.geometry)] }
        });
        return copie;
      }
      if(o.bdtopo && o.bdtopo.couche && o.bdtopo.couche !== 'estimation'){
        const f = fraiches[o.bdtopo.id];
        if(!f){ nAbsents++; return o; }
        const anneau = anneauExterieur(f.geometry);
        if(!anneau){ nAbsents++; return o; }
        const pts = anneauVersPts(anneau, proj, simplifier);
        if(pts.length < 3){ nAbsents++; return o; }
        const p = f.properties || {};
        nMaj++;
        // Nom, couleurs, verrouillage et textures sont des choix de l'utilisateur : l'actualisation
        // ne touche qu'a la geometrie et aux attributs IGN.
        const haut = o.bdtopo.couche === COUCHE_BATIMENT
          ? hauteurBatiment(p)
          : (nombreFr(p.hauteur) || o.bdtopo.hauteurRetenueM || hauteurVegetation(p.nature));
        return Object.assign({}, o, {
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          elevation: haut,
          bdtopo: Object.assign({}, o.bdtopo, {
            nature: p.nature || o.bdtopo.nature, usage1: p.usage_1 || o.bdtopo.usage1,
            hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
            nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
            altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
            etat: p.etat_de_l_objet || o.bdtopo.etat,
            identifiantRnb: p.identifiants_rnb || o.bdtopo.identifiantRnb,
            recupereLe: new Date().toISOString()
          })
        });
      }
      return o;
    });
    // ---- 3 bis. Import du voisinage, si demande : c'est le seul cas ou l'actualisation AJOUTE
    // des objets. Tout ce qui arrive ici est marque voisinage:true, pour pouvoir etre masque
    // d'un coup sans etre supprime.
    // Ce que l'import du voisinage rend : les objets, plus le compte de chaque famille pour le bilan.
  let ajouts: { objets: unknown[]; parcelles?: number; batiments?: number; vegetation?: number; arbres?: number } = { objets: [] };
    if(options.voisinage && options.voisinage.actif){
      try {
        ajouts = await construireVoisinage(parcelle, cad, proj, simplifier, options.voisinage, serialises);
        if(ajouts.parcelles) bilan.push(ajouts.parcelles + ' parcelle(s) adjacente(s) ajoutee(s)');
        if(ajouts.batiments) bilan.push(ajouts.batiments + ' batiment(s) ajoute(s)');
        if(ajouts.vegetation) bilan.push(ajouts.vegetation + ' zone(s) de vegetation ajoutee(s)');
        if(ajouts.arbres) bilan.push(ajouts.arbres + ' arbre(s) estime(s)');
        if(!ajouts.objets.length) bilan.push('voisinage : rien de nouveau a ajouter');
        serialises.push(...ajouts.objets);
      } catch(e){
        bilan.push('voisinage non ajoute : ' + (e.message || e));
      }
    }
    ctx.restoreState({ objects: serialises, measures: ctx.serializeMeasures(ctx.etat.measures) });

    // ---- 4. Le zonage PLU, au centre de la parcelle
    const cible = ctx.trouverParcelleCloture();
    if(cible){
      const centre = centroid(cible.pts);
      const deg = proj.versDegres(centre.x, centre.y);
      try {
        cible.plu = await interrogerPlu(deg.lon, deg.lat);
        if(cible.plu.zones.length) bilan.push('PLU : zone ' + cible.plu.zones[0].libelle);
        else bilan.push('PLU : aucun zonage');
      } catch { bilan.push('PLU indisponible'); }
      renderPanneauPlu(ctx);
    }
    ctx.markDirty();
    // La case « Voisinage » n'apparait que s'il y a du voisinage : elle vient peut-etre d'en
    // gagner (ou d'en perdre, si l'utilisateur annule).
    ctx.syncBasculeVoisinage();
    ctx.rebuildSelector();
    ctx.syncLieuTitre();
    ctx.render();

    if(ptsParcelle) bilan.unshift('parcelle actualisee (ecart max ' + Math.round(ecartMax*100) + ' cm)');
    if(nMaj) bilan.unshift(nMaj + ' objet(s) IGN remplace(s)');
    if(nAbsents) bilan.push(nAbsents + ' objet(s) absent(s) de la base actuelle, conserve(s) tels quels');
    showToast('Actualisation IGN — ' + (bilan.length ? bilan.join(' ; ') + '.' : 'aucun changement.'));
  } catch(e){
    showToast('Actualisation impossible : ' + (e.message || e));
  } finally {
    if(bouton){ bouton.disabled = false; bouton.textContent = libelleInitial; }
  }
}

export function ouvrirDialogueActualisation(bouton, ctx){
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « + Depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  if(cad.origineLat === undefined || cad.origineLat === null){
    showToast('Ce plan n\'a pas de point de calage enregistre : actualiser deplacerait tout le contenu.');
    return;
  }
  const nbIgn = ctx.etat.objects.filter(o=>o.bdtopo && o.bdtopo.couche && o.bdtopo.couche !== 'estimation').length;
  const nbVoisines = ctx.etat.objects.filter(o=>o.cadastre && o.cadastre.idu && o.cadastre.idu !== cad.idu).length;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center; padding:14px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:18px 20px; border-radius:8px; width:min(520px,96vw); font-family:"Helvetica Neue",Arial,sans-serif; font-size:0.88rem; box-shadow:0 4px 24px rgba(0,0,0,0.3);';
  const titre = document.createElement('div');
  titre.style.cssText = 'font-weight:600; font-size:1.02rem; margin-bottom:4px;';
  titre.textContent = 'Actualiser depuis l\'IGN';
  const sous = document.createElement('div');
  sous.style.cssText = 'font-size:0.8rem; opacity:0.8; margin-bottom:12px; line-height:1.4;';
  sous.textContent = 'Parcelle ' + (cad.section || '') + ' ' + String(cad.numero || '').replace(/^0+/,'') +
    ' — ' + (cad.commune || '') + '. Les objets dessines a la main ne sont jamais touches.';
  box.appendChild(titre); box.appendChild(sous);

  const radio = (valeur, libelle, aide, coche) => {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex; gap:8px; align-items:flex-start; padding:6px 0; cursor:pointer;';
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'porteeActualisation'; r.value = valeur; r.checked = coche;
    r.style.marginTop = '3px';
    const txt = document.createElement('span');
    txt.innerHTML = '<b>' + escapeHtml(libelle) + '</b><br><span style="font-size:0.78rem; opacity:0.78;">' + escapeHtml(aide) + '</span>';
    lab.appendChild(r); lab.appendChild(txt);
    box.appendChild(lab);
    return r;
  };
  // Le premier bouton radio est coche par defaut ; sa reference ne sert pas ensuite.
  radio('parcelle', 'La parcelle seule',
    'Contour cadastral de la parcelle et zonage PLU. Rien d\'autre n\'est interroge.', true);
  const rTout = radio('tout', 'Tout ce qui vient de l\'IGN',
    'La parcelle, le PLU, et les ' + nbIgn + ' objet(s) importes de la BD TOPO (batiments, vegetation) deja presents dans ce plan.', false);

  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid var(--border,#ddd); margin:10px 0 8px;';
  box.appendChild(sep);

  const labVois = document.createElement('label');
  labVois.style.cssText = 'display:flex; gap:8px; align-items:flex-start; cursor:pointer;';
  const cbVois = document.createElement('input');
  cbVois.type = 'checkbox'; cbVois.style.marginTop = '3px';
  const txtVois = document.createElement('span');
  txtVois.innerHTML = '<b>Ajouter les parcelles adjacentes</b><br><span style="font-size:0.78rem; opacity:0.78;">' +
    'Import de voisinage : les parcelles mitoyennes absentes du plan' +
    (nbVoisines ? ' (' + nbVoisines + ' deja presente(s), elles ne seront pas dupliquees)' : '') + '.</span>';
  labVois.appendChild(cbVois); labVois.appendChild(txtVois);
  box.appendChild(labVois);

  const sousOptions = document.createElement('div');
  sousOptions.style.cssText = 'margin:6px 0 0 26px; display:flex; flex-direction:column; gap:3px; font-size:0.82rem;';
  const sousCase = (libelle, coche, titreAide) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex; gap:6px; align-items:center; cursor:pointer;';
    if(titreAide) l.title = titreAide;
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = coche; c.disabled = true;
    l.appendChild(c); l.appendChild(document.createTextNode(libelle));
    sousOptions.appendChild(l);
    return c;
  };
  const cbBati = sousCase('Bâti principal et annexes (BD TOPO, avec hauteur)', true,
    'Emprise et hauteur reelles ; les batiments des voisins arrivent verrouilles.');
  const cbVeg = sousCase('Haies et zones de végétation', true, 'Couches haie et zone_de_vegetation de la BD TOPO.');
  const cbArbres = sousCase('Arbres estimés dans ces zones', false,
    'ESTIMATION : la BD TOPO ne cartographie pas les arbres isoles. Une grille d\'un arbre pour 64 m2 est repartie dans les zones de vegetation.');
  box.appendChild(sousOptions);
  const noteMasquer = document.createElement('div');
  noteMasquer.style.cssText = 'margin:8px 0 0 26px; font-size:0.78rem; opacity:0.78; line-height:1.35;';
  noteMasquer.textContent = 'Tout ce qui arrive par cet import est marque « voisinage » : la case en haut a droite le masque d\'un coup, sans le supprimer.';
  box.appendChild(noteMasquer);

  const majSousOptions = ()=>{
    [cbBati, cbVeg, cbArbres].forEach(c=>{ c.disabled = !cbVois.checked; });
    sousOptions.style.opacity = cbVois.checked ? '1' : '0.5';
    noteMasquer.style.opacity = cbVois.checked ? '0.78' : '0.4';
  };
  cbVois.addEventListener('change', majSousOptions);
  majSousOptions();

  const pied = document.createElement('div');
  pied.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:16px;';
  const annuler = document.createElement('button');
  annuler.type = 'button'; annuler.className = 'secondary'; annuler.textContent = 'Annuler';
  annuler.addEventListener('click', ()=>overlay.remove());
  const valider = document.createElement('button');
  valider.type = 'button'; valider.textContent = 'Actualiser';
  valider.addEventListener('click', ()=>{
    const options = {
      portee: rTout.checked ? 'tout' : 'parcelle',
      voisinage: cbVois.checked
        ? { actif:true, batiments:cbBati.checked, vegetation:cbVeg.checked, arbres:cbArbres.checked }
        : { actif:false }
    };
    overlay.remove();
    void actualiserDepuisIgn(options, bouton, ctx);
  });
  pied.appendChild(annuler); pied.appendChild(valider);
  box.appendChild(pied);
  overlay.appendChild(box);
  overlay.addEventListener('click', e=>{ if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

export async function construireVoisinage(parcelle, cad, proj, simplifier, choix, dejaSerialises){
  const resultat = { objets:[], parcelles:0, batiments:0, vegetation:0, arbres:0 };
  const anneauSource = cad.geometrieSource && cad.geometrieSource.coordinates && cad.geometrieSource.coordinates[0];
  if(!anneauSource) throw new Error('geometrie source de la parcelle absente');

  const bboxParcelle = bboxDegDesAnneaux([anneauSource], proj, 20);
  const emprise = { type:'Polygon', coordinates:[[
    [bboxParcelle.lonMin, bboxParcelle.latMin], [bboxParcelle.lonMax, bboxParcelle.latMin],
    [bboxParcelle.lonMax, bboxParcelle.latMax], [bboxParcelle.lonMin, bboxParcelle.latMax],
    [bboxParcelle.lonMin, bboxParcelle.latMin]
  ]]};
  const feats = await interrogerCadastre(emprise, cad.codeInsee);
  const centreParc = centroid(parcelle.pts);
  const candidats = construireCandidats(feats, proj, centreParc, simplifier);
  const principale = { idu: cad.idu, pts: parcelle.pts };
  const tri = trierVoisines(principale, candidats);

  const iduPresents = new Set(dejaSerialises.filter(o=>o.cadastre && o.cadastre.idu).map(o=>o.cadastre.idu));
  iduPresents.add(cad.idu);
  const clesPrises = new Set(dejaSerialises.map(o=>o.key));
  const cleUnique = base => {
    let cle = (base || 'objet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'objet';
    if(clesPrises.has(cle)){ let n = 2; while(clesPrises.has(cle + '-' + n)) n++; cle = cle + '-' + n; }
    clesPrises.add(cle);
    return cle;
  };
  const recupereLe = new Date().toISOString();
  const nouvellesParcelles = [];
  tri.adjacentes.forEach(c=>{
    if(iduPresents.has(c.idu)) return;
    iduPresents.add(c.idu);
    nouvellesParcelles.push(c);
    const pts = c.pts;
    resultat.objets.push({
      key: cleUnique('parcelle-' + libelleParcelle(c)), type:'polygon', name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      pts,
      vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
      segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
      frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
      constrained:false, fonction:'terrain', matiere:'', priority:0, locked:true, voisinage:true,
      cadastre: {
        idu:c.idu, codeInsee:c.codeInsee, commune:c.commune, section:c.section, numero:c.numero,
        contenanceM2:c.contenance, source:'IGN/API Carto/PCI', recupereLe,
        origineLat:cad.origineLat, origineLon:cad.origineLon,
        simplifieM: simplifier ? SIMPLIF_M : 0,
        geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
      }
    });
    resultat.parcelles++;
  });
  if(!nouvellesParcelles.length) return resultat;

  // BD TOPO sur les seules parcelles qui viennent d'entrer dans le plan.
  const bbox = bboxDegDesAnneaux(nouvellesParcelles.map(c=>c.anneauDeg), proj, 5);
  const idsPresents = new Set(dejaSerialises.filter(o=>o.bdtopo && o.bdtopo.id).map(o=>o.bdtopo.id));
  const surNouvelles = e => nouvellesParcelles.some(c=>polygonesSeTouchent(e.pts, c.pts));

  if(choix.batiments){
    const feats2 = await interrogerWfs(COUCHE_BATIMENT, bbox, 80).catch(()=>[]);
    construireElementsIgn(feats2, proj, simplifier, 'batiment').forEach(b=>{
      if(idsPresents.has(b.id) || !surNouvelles(b)) return;
      idsPresents.add(b.id);
      const p = b.props || {};
      const haut = hauteurBatiment(p);
      const pts = b.pts;
      resultat.objets.push({
        key: cleUnique('bati-' + (b.id || '')), type:'polygon',
        name: (p.usage_1 || p.nature || 'Batiment') + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
        fill:'#CFC3B4', fillOpacity:0.6, stroke:'#8A7B63',
        pts,
        vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
        segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
        frozenVertices: pts.map(()=>false),
        showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
        constrained:false, fonction:'batiment', matiere:'', priority:2, locked:true, voisinage:true,
        elevation: haut,
        bdtopo: { couche:COUCHE_BATIMENT, id:b.id, cleabs:p.cleabs || null, nature:p.nature || null,
          usage1:p.usage_1 || null, usage2:p.usage_2 || null, hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut,
          nombreEtages:nombreFr(p.nombre_d_etages), nombreLogements:nombreFr(p.nombre_de_logements),
          altitudeSolM:nombreFr(p.altitude_minimale_sol), altitudeToitM:nombreFr(p.altitude_minimale_toit),
          etat:p.etat_de_l_objet || null, identifiantRnb:p.identifiants_rnb || null,
          surParcellePrincipale:false, recupereLe }
      });
      resultat.batiments++;
    });
  }
  if(choix.vegetation){
    for(const couche of [COUCHE_HAIE, COUCHE_VEGETATION]){
      const feats3 = await interrogerWfs(couche, bbox, 40).catch(()=>[]);
      const elems = construireElementsIgn(feats3, proj, simplifier, couche === COUCHE_HAIE ? 'haie' : 'vegetation');
      elems.forEach(v=>{
        if(idsPresents.has(v.id) || !surNouvelles(v)) return;
        idsPresents.add(v.id);
        const p = v.props || {};
        const estHaie = couche === COUCHE_HAIE;
        const haut = estHaie ? (nombreFr(p.hauteur) || 2) : hauteurVegetation(p.nature);
        const pts = v.pts;
        resultat.objets.push({
          key: cleUnique((estHaie ? 'haie-' : 'vegetation-') + (v.id || '')), type:'polygon',
          name: estHaie ? 'Haie' : (p.nature || 'Vegetation'),
          fill: estHaie ? '#7FA86B' : '#A9BE8E', fillOpacity: estHaie ? 0.8 : 0.55,
          stroke: estHaie ? '#3F5C33' : '#4A6B32',
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
          constrained:false, fonction:'massif', matiere:'', priority:2, locked:false, voisinage:true,
          elevation: haut,
          bdtopo: { couche, id:v.id, cleabs:p.cleabs || null, nature:p.nature || (estHaie ? 'Haie' : null),
            hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut, recupereLe }
        });
        resultat.vegetation++;
        if(choix.arbres && !estHaie){
          arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).forEach((a, i)=>{
            resultat.objets.push({
              key: cleUnique('arbre-' + (v.id || 'veg') + '-' + (i+1)), type:'circle', name:'Arbre (estime)',
              fill:'#6E8B4E', fillOpacity:0.7, stroke:'#3F5C33',
              center:{x:a.x, y:a.y}, r:2.5,
              showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
              constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false, voisinage:true,
              elevation: haut, diametreArbre:5,
              bdtopo: { couche:'estimation', origine:v.id, estime:true, hauteurRetenueM:haut, recupereLe }
            });
            resultat.arbres++;
          });
        }
      });
    }
  }
  return resultat;
}

