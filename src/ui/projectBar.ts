// Actualisation cadastrale et panneau PLU (spec §3.2, ui/).
//
// Deux choses qui parlent du projet plutot que du plan : d'ou viennent ses donnees cadastrales, et
// ce que le PLU dit de sa parcelle. La barre de projet elle-meme — ouvrir, creer, enregistrer,
// supprimer — est devenue des commandes (app/projet.ts) affichees par zones/BarreApplication.tsx
// a l'etape 1 de la reconstruction de l'interface (MD/spec-ihm-zones.md).
//
// L'actualisation est le geste delicat du lot : elle rejoue l'import IGN sur un plan qui a deja ete
// modifie. Ce qui vient du cadastre est remplace, ce que l'utilisateur a dessine est conserve - et
// c'est pour cela qu'elle passe par l'historique avant de toucher quoi que ce soit.

import { escapeHtml } from '../util/escape.js';
import { nombreFr } from '../util/format.js';
import { el } from '../shell/dom.js';
import { hauteurBatiment, hauteurVegetation, arbresEstimes, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from '../geo/bdtopo.js';
import { distancePointContour } from '../geometry/proximite.js';
import { showToast } from '../shell/dialogs.js';
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
import type { CollectionGeoJSON, EmpriseGeoJSON, FeatureGeoJSON, Anneau, Candidate } from '../geo/apiIgn.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { EtatApp } from '../core/state.js';
import { sommetsDe } from '../model/formes.js';
import type { ObjetPlan, ObjetBrut, ObjetPolygone } from '../model/types.js';
import type { Lieu } from '../model/lieu.js';
import type { ProjetValide } from '../io/validation.js';

/** Ce que le choix depuis une adresse ouvre : voir `cadastreDialog.ts`. */
export interface ContexteImportCadastre {
  apiSave: (payload: unknown) => Promise<{ id: string }>;
  appliquerProjetImporte: (valide: ProjetValide, remplacer: boolean) => void;
  withProjectParam: (id: string) => string;
  apiDisponible: boolean;
  cleDernierProjet: string;
}

/** Ce que la barre de projet, le PLU et l'actualisation IGN demandent au reste du programme. */
export interface ContexteProjectBar {
  etat: EtatApp;
  apiDelete: (id: string) => Promise<unknown>;
  /** Le serveur ne promet que `{id}`, mais rend en pratique `updatedAt` — voir `io/api.ts`. */
  apiSave: (payload: unknown) => Promise<{ id: string; updatedAt?: string }>;
  lieuActuel: () => Lieu;
  markDirty: () => void;
  pushHistory: () => void;
  rebuildSelector: () => void;
  refreshProjectStatus: () => void;
  render: () => void;
  restoreState: (instantane: { objects: ObjetBrut[]; measures: unknown[] }) => void;
  serializeMeasures: (ms: EtatApp['measures']) => unknown[];
  serializeObjects: (objs: ObjetPlan[]) => ObjetBrut[];
  syncBasculeVoisinage: () => void;
  syncLieuTitre: () => void;
  trouverParcelleCloture: () => ObjetPlan | null | undefined;
  withProjectParam: (id: string) => string;
  initialState: () => unknown[];
  initialMeasures: () => unknown[];
  cleDernierProjet: string;
  definirRafraichisseurStatut: (f: () => void) => void;
  contexteImport: () => ContexteImportCadastre;
}

/** Une option de portee et de voisinage, choisie dans la boite de dialogue d'actualisation. */
export interface OptionsActualisation {
  portee: 'tout' | 'parcelle';
  voisinage: { actif: false } | { actif: true; batiments: boolean; vegetation: boolean; arbres: boolean };
}

/**
 * Interroge le Geoportail de l'urbanisme au centre de la parcelle, et range le zonage **sur la
 * parcelle** (champ `plu`) — comme la cloture et le lieu. Il se sauvegarde ainsi avec le projet
 * sans nouvelle cle a faire transiter par `api.php`, et il suit la parcelle si le plan est exporte.
 *
 * Le bouton est desarme pendant l'appel : le service est lent, et deux interrogations lancees coup
 * sur coup empileraient deux instantanes d'annulation pour un seul geste.
 *
 * Un point sans zonage n'est pas une erreur — toutes les communes n'ont pas de PLU numerise. Le
 * message le dit, plutot que de laisser croire a une panne.
 */
export async function interrogerPluDepuisBouton(bouton: HTMLButtonElement, ctx: ContexteProjectBar): Promise<void> {
  const parcelle = ctx.trouverParcelleCloture();
  if (!parcelle) return;
  const lieu = ctx.lieuActuel();
  bouton.disabled = true;
  const libelleInitial = bouton.textContent;
  bouton.textContent = 'Interrogation…';
  try {
    const plu = await interrogerPlu(lieu.longitude, lieu.latitude);
    ctx.pushHistory();
    parcelle.plu = plu;
    ctx.markDirty();
    renderPanneauPlu(ctx);
    const n = plu.zones.length;
    showToast(n ? ('PLU : zone ' + plu.zones[0]!.libelle + (n > 1 ? ' (+' + (n - 1) + ' autre(s))' : '') + '.')
                : 'PLU : aucun zonage renvoye pour ce point.');
  } catch (e) {
    showToast('Interrogation du PLU impossible : ' + ((e as Error).message || e));
  } finally {
    bouton.disabled = false;
    bouton.textContent = libelleInitial;
  }
}

export function renderPanneauPlu(ctx: ContexteProjectBar): void {
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
  const ligne = (cle: string, valeurHtml: string) => {
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
  plu.zones.forEach((z, i: number)=>{
    const prefixe = plu.zones.length > 1 ? 'Zone ' + (i+1) : 'Zone';
    ligne(prefixe, '<b>' + escapeHtml(z.libelle) + '</b>' + (z.typezone ? ' — type ' + escapeHtml(z.typezone) : ''));
    if(z.libelong) ligne('Libellé', escapeHtml(z.libelong));
    if(z.datappro) ligne('Approbation', escapeHtml(z.datappro));
    if(z.urlfic) ligne('Règlement', '<a href="' + escapeHtml(z.urlfic) + '" target="_blank" rel="noopener">' + escapeHtml(z.nomfic || 'document PDF') + ' ↗</a>');
    if(z.partition) ligne('Document', escapeHtml(z.partition));
  });
  (plu.prescriptions || []).forEach((p, i: number)=>{
    ligne('Prescription ' + (i+1), escapeHtml((p.libelle || '') + (p.typepsc ? ' (' + p.typepsc + ')' : '')) +
      (p.urlfic ? ' <a href="' + escapeHtml(p.urlfic) + '" target="_blank" rel="noopener">↗</a>' : ''));
  });
  (plu.informations || []).forEach((info, i: number)=>{
    ligne('Information ' + (i+1), escapeHtml(info.libelle || '') +
      (info.urlfic ? ' <a href="' + escapeHtml(info.urlfic) + '" target="_blank" rel="noopener">' + escapeHtml(info.nomfic || 'notice') + ' ↗</a>' : ''));
  });
  // Servitudes d'utilite publique : le SPR (AC4) est mis en avant separement - c'est celle qui
  // change le plus concretement ce qu'on a le droit de construire et l'aspect impose.
  (plu.spr || []).forEach((s)=>{
    ligne('SPR', '<b>' + escapeHtml(s.nom) + '</b>' +
      (s.assiette ? ' — ' + escapeHtml(s.assiette) : '') +
      (s.source ? '<br><span style="opacity:0.75;">Précision de la limite : ' + escapeHtml(s.source) + '</span>' : '') +
      (s.fichier ? '<br><span style="opacity:0.75;">Acte : ' + escapeHtml(s.fichier) + '</span>' : '') +
      '<br><span style="opacity:0.75;">Site patrimonial remarquable : tous les travaux visibles depuis l\'espace public sont soumis à l\'avis de l\'Architecte des Bâtiments de France.</span>');
  });
  // Comparaison par contenu et non par identite d'objet : apres un aller-retour JSON (projet
  // enregistre puis rouvert), `spr` et `servitudes` sont deux copies distinctes, et un includes()
  // sur les references reafficherait le SPR une seconde fois en bas de liste.
  const cleSup = (s: { type?: string; nom?: string; fichier?: string }) => (s.type || '') + '|' + (s.nom || '') + '|' + (s.fichier || '');
  const clesSpr = new Set((plu.spr || []).map(cleSup));
  const autresSup = (plu.servitudes || []).filter(s=>!clesSpr.has(cleSup(s)));
  autresSup.forEach((s, i: number)=>{
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

export async function actualiserDepuisIgn(options: OptionsActualisation | null | undefined, bouton: HTMLButtonElement | null, ctx: ContexteProjectBar): Promise<void> {
  options = options || { portee:'tout', voisinage:{actif:false} };
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « + Depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  // Le point de calage, c'est les DEUX coordonnees : une longitude absente projetterait tout en NaN.
  if(cad.origineLat === undefined || cad.origineLat === null || cad.origineLon === undefined || cad.origineLon === null){
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
    // `cadastre` ne declare que les deux champs que `render/ortho.ts` lit (model/types.ts) ; les
    // autres, dont ceux-ci, arrivent par l'index signature en `unknown`.
    const urlParcelle = CADASTRE_URL + '?code_insee=' + encodeURIComponent(cad.codeInsee as string) +
      '&section=' + encodeURIComponent(cad.section as string) + '&numero=' + encodeURIComponent(cad.numero as string) + '&_limit=5';
    // `fetchJSONReseau` rend du JSON arbitraire (`unknown`) : ce module (ui/, pas encore type)
    // continue de le lire sans verification, comme avant le typage de geo/apiIgn.ts.
    const repParcelle = await fetchJSONReseau(urlParcelle) as CollectionGeoJSON;
    const featParcelle = ((repParcelle && repParcelle.features) || [])[0];
    let ptsParcelle = null;
    if(featParcelle){
      const anneau = anneauExterieur(featParcelle.geometry);
      if(anneau) ptsParcelle = anneauVersPts(anneau, proj, simplifier);
    }
    // Une parcelle fusionnee a un contour construit, pas un contour cadastral : le remplacer par
    // celui d'une seule de ses composantes amputerait le terrain.
    const fusionDe = cad.fusionDe as unknown[] | undefined;
    if(fusionDe && fusionDe.length > 1){
      bilan.push('propriete fusionnee : contour conserve');
      ptsParcelle = null;
    }

    // ---- 2. Les objets issus de la BD TOPO, couche par couche (portee "tout" seulement)
    // `bdtopo` reste `unknown` sur ObjetPlan (sa forme varie selon la couche, voir model/types.ts) :
    // ce module le lit sans verification, comme avant le typage de geo/.
    const objsIgn: { bdtopo: { couche: string } }[] = options.portee === 'tout'
      ? ctx.etat.objects.filter((o: ObjetPlan) => o.bdtopo && (o.bdtopo as { couche?: string }).couche && (o.bdtopo as { couche?: string }).couche !== 'estimation') as unknown as { bdtopo: { couche: string } }[]
      : [];
    const couches: string[] = [...new Set(objsIgn.map(o => o.bdtopo.couche))];
    const fraiches: Record<string, FeatureGeoJSON> = {};
    if(couches.length){
      const anneaux: Anneau[] = [];
      ctx.etat.objects.forEach((o: ObjetPlan)=>{ if(o.cadastre && o.cadastre.geometrieSource) anneaux.push((o.cadastre.geometrieSource as { coordinates: Anneau[] }).coordinates[0]!); });
      if(anneaux.length){
        const bbox = bboxDegDesAnneaux(anneaux, proj, 15);
        for(const couche of couches){
          try {
            const feats = await interrogerWfs(couche, bbox, 80);
            feats.forEach(f=>{
              const p = f.properties || {};
              const id = (f.id as string) || (p.cleabs as string);
              if(id) fraiches[id] = f;
            });
          } catch { bilan.push('couche ' + couche + ' indisponible'); }
        }
      }
    }

    // ---- 3. Application
    ctx.pushHistory();
    let nMaj = 0, nAbsents = 0, ecartMax = 0;
    const serialises: ObjetBrut[] = ctx.serializeObjects(ctx.etat.objects).map((o: ObjetBrut)=>{
      if(o.key === parcelle.key && ptsParcelle){
        // ecart max entre l'ancien et le nouveau contour : c'est la mesure du changement
        ((o as Partial<ObjetPolygone>).pts||[]).forEach(p=>{ ecartMax = Math.max(ecartMax, distancePointContour(p, ptsParcelle!)); });
        const copie: ObjetBrut = Object.assign({}, o, {
          pts: ptsParcelle,
          vertexNames: ptsParcelle.map((_,i)=>(o.vertexNames && o.vertexNames[i]) || ('Point ' + (i+1))),
          segmentNames: ptsParcelle.map((_,i)=>(o.segmentNames && o.segmentNames[i]) || ('Cote ' + (i+1))),
          frozenVertices: ptsParcelle.map(()=>false)
        });
        const pp: Record<string, unknown> = featParcelle!.properties || {};
        copie.cadastre = Object.assign({}, o.cadastre, {
          contenanceM2: pp.contenance, commune: pp.nom_com || (o.cadastre && o.cadastre.commune),
          recupereLe: new Date().toISOString(),
          geometrieSource: { type:'Polygon', coordinates:[anneauExterieur(featParcelle!.geometry)] }
        });
        return copie;
      }
      const bdtopo = o.bdtopo as { couche?: string; id?: string; hauteurRetenueM?: number; nature?: string; usage1?: string } | undefined;
      if(bdtopo && bdtopo.couche && bdtopo.couche !== 'estimation'){
        const f = fraiches[bdtopo.id as string];
        if(!f){ nAbsents++; return o; }
        const anneau = anneauExterieur(f.geometry);
        if(!anneau){ nAbsents++; return o; }
        const pts = anneauVersPts(anneau, proj, simplifier);
        if(pts.length < 3){ nAbsents++; return o; }
        const p: Record<string, unknown> = f.properties || {};
        nMaj++;
        // Nom, couleurs, verrouillage et textures sont des choix de l'utilisateur : l'actualisation
        // ne touche qu'a la geometrie et aux attributs IGN.
        const haut = bdtopo.couche === COUCHE_BATIMENT
          ? hauteurBatiment(p)
          : (nombreFr(p.hauteur) || bdtopo.hauteurRetenueM || hauteurVegetation(p.nature as string | undefined));
        return Object.assign({}, o, {
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          elevation: haut,
          bdtopo: Object.assign({}, bdtopo, {
            nature: p.nature || bdtopo.nature, usage1: p.usage_1 || bdtopo.usage1,
            hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
            nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
            altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
            etat: p.etat_de_l_objet || (bdtopo as { etat?: string }).etat,
            identifiantRnb: p.identifiants_rnb || (bdtopo as { identifiantRnb?: string }).identifiantRnb,
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
  let ajouts: { objets: ObjetBrut[]; parcelles?: number; batiments?: number; vegetation?: number; arbres?: number } = { objets: [] };
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
        bilan.push('voisinage non ajoute : ' + ((e as Error).message || e));
      }
    }
    ctx.restoreState({ objects: serialises, measures: ctx.serializeMeasures(ctx.etat.measures) });

    // ---- 4. Le zonage PLU, au centre de la parcelle
    const cible = ctx.trouverParcelleCloture();
    if(cible){
      const centre = centroid(sommetsDe(cible));
      const deg = proj.versDegres(centre.x, centre.y);
      try {
        cible.plu = await interrogerPlu(deg.lon, deg.lat);
        if(cible.plu.zones.length) bilan.push('PLU : zone ' + cible.plu.zones[0]!.libelle);
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
    showToast('Actualisation impossible : ' + ((e as Error).message || e));
  } finally {
    if(bouton){ bouton.disabled = false; bouton.textContent = libelleInitial; }
  }
}

export function ouvrirDialogueActualisation(bouton: HTMLButtonElement, ctx: ContexteProjectBar): void {
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « + Depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  // Le point de calage, c'est les DEUX coordonnees : une longitude absente projetterait tout en NaN.
  if(cad.origineLat === undefined || cad.origineLat === null || cad.origineLon === undefined || cad.origineLon === null){
    showToast('Ce plan n\'a pas de point de calage enregistre : actualiser deplacerait tout le contenu.');
    return;
  }
  const nbIgn = ctx.etat.objects.filter((o: ObjetPlan)=>o.bdtopo && (o.bdtopo as { couche?: string }).couche && (o.bdtopo as { couche?: string }).couche !== 'estimation').length;
  const nbVoisines = ctx.etat.objects.filter((o: ObjetPlan)=>o.cadastre && o.cadastre.idu && o.cadastre.idu !== cad.idu).length;

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

  const radio = (valeur: string, libelle: string, aide: string, coche: boolean) => {
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
  const sousCase = (libelle: string, coche: boolean, titreAide: string) => {
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
    const options: OptionsActualisation = {
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

export async function construireVoisinage(
  parcelle: ObjetPlan,
  cad: { idu?: string; codeInsee?: string; origineLat?: number; origineLon?: number; geometrieSource?: { coordinates?: Anneau[] } },
  proj: ProjecteurLocal,
  simplifier: boolean,
  choix: { batiments?: boolean; vegetation?: boolean; arbres?: boolean },
  dejaSerialises: ObjetBrut[]
): Promise<{ objets: ObjetBrut[]; parcelles: number; batiments: number; vegetation: number; arbres: number }> {
  const resultat: { objets: ObjetBrut[]; parcelles: number; batiments: number; vegetation: number; arbres: number } = { objets:[], parcelles:0, batiments:0, vegetation:0, arbres:0 };
  const anneauSource = cad.geometrieSource && cad.geometrieSource.coordinates && cad.geometrieSource.coordinates[0];
  if(!anneauSource) throw new Error('geometrie source de la parcelle absente');

  const bboxParcelle = bboxDegDesAnneaux([anneauSource], proj, 20);
  const emprise: EmpriseGeoJSON = { type:'Polygon', coordinates:[[
    [bboxParcelle.lonMin, bboxParcelle.latMin], [bboxParcelle.lonMax, bboxParcelle.latMin],
    [bboxParcelle.lonMax, bboxParcelle.latMax], [bboxParcelle.lonMin, bboxParcelle.latMax],
    [bboxParcelle.lonMin, bboxParcelle.latMin]
  ]]};
  const feats = await interrogerCadastre(emprise, cad.codeInsee);
  const centreParc = centroid(sommetsDe(parcelle));
  const candidats = construireCandidats(feats, proj, centreParc, simplifier);
  const principale = { idu: cad.idu as string, pts: sommetsDe(parcelle) };
  const tri = trierVoisines(principale, candidats);

  const iduPresents = new Set(dejaSerialises.filter(o=>o.cadastre && o.cadastre.idu).map(o=>o.cadastre!.idu as string));
  iduPresents.add(cad.idu as string);
  const clesPrises = new Set(dejaSerialises.map(o=>o.key));
  const cleUnique = (base: string | undefined) => {
    let cle = (base || 'objet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'objet';
    if(clesPrises.has(cle)){ let n = 2; while(clesPrises.has(cle + '-' + n)) n++; cle = cle + '-' + n; }
    clesPrises.add(cle);
    return cle;
  };
  const recupereLe = new Date().toISOString();
  const nouvellesParcelles: Candidate[] = [];
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
        origineLat:cad.origineLat!, origineLon:cad.origineLon!,
        simplifieM: simplifier ? SIMPLIF_M : 0,
        geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
      }
    });
    resultat.parcelles++;
  });
  if(!nouvellesParcelles.length) return resultat;

  // BD TOPO sur les seules parcelles qui viennent d'entrer dans le plan.
  const bbox = bboxDegDesAnneaux(nouvellesParcelles.map(c=>c.anneauDeg), proj, 5);
  const idsPresents = new Set(dejaSerialises.filter(o=>o.bdtopo && (o.bdtopo as { id?: string }).id).map(o=>(o.bdtopo as { id?: string }).id));
  const surNouvelles = (e: { pts: import('../model/types.js').PtBrut[] }) => nouvellesParcelles.some(c=>polygonesSeTouchent(e.pts, c.pts));

  if(choix.batiments){
    const feats2 = await interrogerWfs(COUCHE_BATIMENT, bbox, 80).catch((): FeatureGeoJSON[]=>[]);
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
      const feats3 = await interrogerWfs(couche, bbox, 40).catch((): FeatureGeoJSON[]=>[]);
      const elems = construireElementsIgn(feats3, proj, simplifier, couche === COUCHE_HAIE ? 'haie' : 'vegetation');
      elems.forEach(v=>{
        if(idsPresents.has(v.id) || !surNouvelles(v)) return;
        idsPresents.add(v.id);
        const p = v.props || {};
        const estHaie = couche === COUCHE_HAIE;
        const haut = estHaie ? (nombreFr(p.hauteur) || 2) : hauteurVegetation(p.nature as string | undefined);
        const pts = v.pts;
        resultat.objets.push({
          key: cleUnique((estHaie ? 'haie-' : 'vegetation-') + (v.id || '')), type:'polygon',
          name: estHaie ? 'Haie' : ((p.nature as string) || 'Vegetation'),
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

