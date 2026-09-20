// Dialogue d'import cadastral, en trois etapes (spec §6.4).
//
// Etape 1 : une adresse, geocodee par la BAN. Etape 2 : la parcelle, choisie parmi les candidates
// classees par distance. Etape 3 : les voisines a importer, ce qu'on prend de la BD TOPO, et la
// creation du projet.
//
// Tout l'etat du dialogue vit dans un unique objet local `etatImport` - et surtout PAS dans une
// variable nommee `etat`, qui est le nom de l'etat de l'application : la confusion entre les deux
// est exactement le genre de bug qu'aucun test ne rattrape.
//
// Ce module ne parle pas au reseau lui-meme : il appelle geo/apiIgn.ts. Il ne connait pas non plus
// l'etat de l'application : les trois choses dont il a besoin (enregistrer, appliquer le projet
// importe, fabriquer l'URL du projet) lui arrivent par `ctx`.

import { escapeHtml } from '../util/escape.js';
import { showToast } from '../shell/dialogs.js';
import { svgNS } from '../render/svg.js';
import { centroid, shoelace, pointInPolygon } from '../geometry/basic.js';
import { fusionnerAnneaux, chainerSegments } from '../geometry/rings.js';
import { distancePointContour } from '../geometry/proximite.js';
import { projecteurLocal } from '../geo/projection.js';
import { hauteurBatiment, arbresEstimes, libelleParcelle, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from '../geo/bdtopo.js';
import { objetsDepuisCadastre } from '../geo/cadastreObjets.js';
import { FUSION_TOL_M, MAX_VOISINES } from '../geo/constantesCadastre.js';
import {
  geocoderBAN, interrogerCadastre, construireCandidats, classerCandidats, trierVoisines,
  anneauVersPts, empriseGeoJSON, empriseAutourAnneau, bboxDegDesAnneaux,
  interrogerWfs, construireElementsIgn, rattacherElementsAuxParcelles, interrogerPlu,
  RAYONS_RECHERCHE_M, ECART_AUTO_M,
  COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE
} from '../geo/apiIgn.js';
import type { Candidate, ElementIgn, FeatureGeoJSON } from '../geo/apiIgn.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { AdresseRecherchee, ImportCadastral } from '../geo/cadastreObjets.js';
import type { ZonagePlu } from '../model/types.js';
import type { ContexteImportCadastre } from './projectBar.js';

/**
 * L'etat du dialogue en trois etapes — **jamais** `etat`, le nom de l'etat de l'application, comme
 * l'en-tete du fichier le dit deja.
 *
 * `principale` et `proj` restent nuls jusqu'a ce que l'etape 1 aboutisse ; `creerProjet` (etape 3
 * seulement) sait qu'ils sont poses a ce moment-la — voir le cast local a cet appel.
 */
interface EtatImportCadastre {
  etape: 1 | 2 | 3;
  suggestions: AdresseRecherchee[];
  geo: AdresseRecherchee | null;
  occupe: boolean;
  message: string;
  erreur: string;
  candidats: Candidate[];
  principale: Candidate | null;
  adjacentes: Candidate[];
  autres: Candidate[];
  selection: Set<string>;
  simplifier: boolean;
  rayon: number | null;
  proj: ProjecteurLocal | null;
  tropDense: boolean;
  survol: string | null;
  voisinageCharge: Set<string>;
  batiments: ElementIgn[];
  haies: ElementIgn[];
  vegetation: ElementIgn[];
  plu: ZonagePlu | null;
  ignCharge: Set<string>;
  ignErreur: string;
  importerBatiments: boolean;
  importerHaies: boolean;
  importerVegetation: boolean;
  importerArbres: boolean;
  /** Parcelles cochees "propriete" : elles seront FUSIONNEES avec la principale en un seul terrain. */
  propriete: Set<string>;
  parcellesPropriete(): Candidate[];
  estPropriete(idu: string): boolean;
  voisinesRetenues(): Candidate[];
}

export function ouvrirImportCadastre(ctx: ContexteImportCadastre): void {
  const etatImport: EtatImportCadastre = {
    etape: 1,
    suggestions: [], geo: null, occupe: false, message: '', erreur: '',
    candidats: [], principale: null, adjacentes: [], autres: [],
    selection: new Set(), simplifier: true, rayon: null, proj: null,
    tropDense: false, survol: null, voisinageCharge: new Set(),
    batiments: [], haies: [], vegetation: [], plu: null, ignCharge: new Set(), ignErreur: '',
    importerBatiments: true, importerHaies: true, importerVegetation: true, importerArbres: false,
    // Parcelles cochees "propriete" : elles seront FUSIONNEES avec la principale en un seul
    // terrain. La principale en fait toujours partie, en premier (c'est elle qui porte l'adresse).
    propriete: new Set(),
    parcellesPropriete(this: EtatImportCadastre){
      const autres = this.adjacentes.concat(this.autres).filter(c=>this.propriete.has(c.idu));
      return ([this.principale] as Candidate[]).concat(autres);
    },
    estPropriete(this: EtatImportCadastre, idu){ return !!this.principale && (idu === this.principale.idu || this.propriete.has(idu)); },
    voisinesRetenues(this: EtatImportCadastre){
      return this.adjacentes.concat(this.autres).filter(c=>this.selection.has(c.idu) || this.propriete.has(c.idu));
    }
  };

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center; padding:14px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:18px 20px; border-radius:8px; width:min(700px,96vw); max-height:92vh; overflow:auto; font-family:"Helvetica Neue",Arial,sans-serif; box-shadow:0 4px 24px rgba(0,0,0,0.3); font-size:0.88rem;';
  const titre = document.createElement('div');
  titre.style.cssText = 'font-weight:600; font-size:1.05rem; margin-bottom:10px;';
  const corps = document.createElement('div');
  const etatLigne = document.createElement('div');
  etatLigne.style.cssText = 'margin-top:10px; font-size:0.82rem; min-height:1.2em; line-height:1.35;';
  const pied = document.createElement('div');
  pied.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap;';
  const mention = document.createElement('div');
  mention.style.cssText = 'margin-top:12px; font-size:0.74rem; line-height:1.35; opacity:0.75; border-top:1px solid var(--border,#ddd); padding-top:8px;';
  mention.textContent = 'Le plan cadastral (PCI, IGN) est un document fiscal de reference : il ne vaut pas bornage. Seul un geometre-expert peut etablir les limites reelles de propriete.';
  box.appendChild(titre); box.appendChild(corps); box.appendChild(etatLigne); box.appendChild(pied); box.appendChild(mention);
  overlay.appendChild(box);
  overlay.addEventListener('click', e=>{ if(e.target === overlay) fermer(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', surTouche);
  function surTouche(e: KeyboardEvent): void { if(e.key === 'Escape') fermer(); }
  function fermer(){ document.removeEventListener('keydown', surTouche); overlay.remove(); }

  function bouton(texte: string, principal: boolean, onClic: (e: MouseEvent) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = texte;
    if(!principal) b.className = 'secondary';
    b.style.fontSize = '0.85rem';
    b.addEventListener('click', onClic);
    return b;
  }
  function majEtat(){
    etatLigne.textContent = etatImport.erreur || etatImport.message || '';
    etatLigne.style.color = etatImport.erreur ? '#a02020' : 'inherit';
  }
  function occuper(actif: boolean, texte = ''): void {
    etatImport.occupe = actif;
    etatImport.message = actif ? texte : '';
    if(actif) etatImport.erreur = '';
    majEtat();
    [...pied.querySelectorAll('button')].forEach(b=>{ b.disabled = actif; });
  }

  // ---- apercu SVG partage par les etapes 2 et 3 ----
  function dessinerApercu(hote: HTMLElement): void {
    hote.innerHTML = '';
    if(!etatImport.principale) return;
    // L'apercu montre la propriete telle qu'elle sera importee : fusionnee d'un seul tenant, avec
    // ses limites internes en pointille. Sinon on verrait des parcelles separees et le resultat
    // serait une surprise apres coup.
    const parcellesProp = etatImport.parcellesPropriete();
    const fusionApercu = parcellesProp.length > 1
      ? fusionnerAnneaux(parcellesProp.map(p=>p.pts), FUSION_TOL_M)
      : null;
    const lots: { c: { idu: string; pts: { x: number; y: number }[]; section?: string; numero?: string | number }; role: string; libelle?: string }[] = [];
    if(fusionApercu){
      lots.push({
        c: { idu:'__propriete__', pts: fusionApercu.contour, section:'', numero:'' },
        role:'principale',
        libelle: parcellesProp.map(libelleParcelle).join(' + ')
      });
    } else {
      parcellesProp.forEach(p=>lots.push({ c:p, role:'principale' }));
    }
    etatImport.adjacentes.concat(etatImport.autres).forEach(c=>{
      if(etatImport.estPropriete(c.idu)) return;
      lots.push({ c, role: etatImport.selection.has(c.idu) ? 'retenue' : 'libre' });
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    lots.forEach(l=>l.c.pts.forEach(p=>{
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }));
    const marge = Math.max(2, (maxX-minX + maxY-minY)*0.03);
    minX -= marge; maxX += marge; minY -= marge; maxY += marge;
    const w = maxX-minX, h = maxY-minY;
    const svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute('viewBox', '0 0 ' + w.toFixed(2) + ' ' + h.toFixed(2));
    svgEl.style.cssText = 'width:100%; height:min(46vh,340px); background:var(--input-bg,#fff); border:1px solid var(--border,#ddd); border-radius:4px; display:block;';
    const trait = Math.max(0.08, w/500);
    lots.slice().reverse().forEach(l=>{
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', l.c.pts.map(p=>(p.x-minX).toFixed(3) + ',' + (maxY-p.y).toFixed(3)).join(' '));
      const survole = etatImport.survol === l.c.idu;
      if(l.role === 'principale'){ poly.setAttribute('fill', '#FBF3D9'); poly.setAttribute('stroke', '#3B2E1F'); }
      else if(l.role === 'retenue'){ poly.setAttribute('fill', '#EDE3CB'); poly.setAttribute('stroke', '#8A7B63'); }
      else { poly.setAttribute('fill', 'transparent'); poly.setAttribute('stroke', '#9a9a9a'); poly.setAttribute('stroke-dasharray', (trait*4).toFixed(2) + ' ' + (trait*3).toFixed(2)); }
      poly.setAttribute('stroke-width', (survole ? trait*2.2 : trait).toFixed(3));
      // Le lot fusionne n'est pas une parcelle : rien a selectionner dessus, ses composantes se
      // decochent dans la liste.
      if(l.c.idu !== '__propriete__'){
        poly.style.cursor = 'pointer';
        poly.addEventListener('mouseenter', ()=>{ etatImport.survol = l.c.idu; rafraichirVue(); });
        poly.addEventListener('mouseleave', ()=>{ if(etatImport.survol === l.c.idu){ etatImport.survol = null; rafraichirVue(); } });
        poly.addEventListener('click', ()=>{
          // Le garde ci-dessus (idu !== '__propriete__') exclut deja le seul lot synthetique :
          // ce qui reste est toujours une vraie Candidate.
          if(etatImport.etape === 2) void choisirPrincipale(l.c as Candidate);
          else if(l.c.idu !== etatImport.principale!.idu) basculerVoisine(l.c as Candidate);
        });
      }
      svgEl.appendChild(poly);
      const c = centroid(l.c.pts);
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', (c.x-minX).toFixed(2));
      txt.setAttribute('y', (maxY-c.y).toFixed(2));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', Math.max(0.9, w/40).toFixed(2));
      txt.setAttribute('fill', '#3B2E1F');
      txt.setAttribute('pointer-events', 'none');
      txt.textContent = l.libelle || libelleParcelle(l.c);
      svgEl.appendChild(txt);
    });
    // Limites internes de la propriete, en pointille : elles disparaissent comme limite de
    // terrain mais restent tracees, exactement comme dans le plan produit.
    if(fusionApercu){
      chainerSegments(fusionApercu.limites, FUSION_TOL_M).forEach(chaine=>{
        const l = document.createElementNS(svgNS, 'polyline');
        l.setAttribute('points', chaine.map(p=>(p.x-minX).toFixed(3) + ',' + (maxY-p.y).toFixed(3)).join(' '));
        l.setAttribute('fill', 'none');
        l.setAttribute('stroke', '#8A7B63');
        l.setAttribute('stroke-width', (trait*1.1).toFixed(3));
        l.setAttribute('stroke-dasharray', (trait*5).toFixed(2) + ' ' + (trait*4).toFixed(2));
        l.setAttribute('pointer-events', 'none');
        svgEl.appendChild(l);
      });
    }
    // Couches BD TOPO par-dessus le parcellaire : elles ne sont pas cliquables (leur import se
    // regle par les cases de l'etape 3), mais sans elles l'apercu ne montrerait pas ce qui va
    // reellement arriver dans le plan.
    const parcellesRetenues = new Set([etatImport.principale!.idu].concat(etatImport.voisinesRetenues().map(v=>v.idu)));
    const dessinerCouche = (elements: ElementIgn[], actif: boolean, remplissage: string, contour: string, opacite?: number) => {
      elements.forEach(e=>{
        const retenu = actif && [...e.parcelles].some(idu=>parcellesRetenues.has(idu));
        const poly = document.createElementNS(svgNS, 'polygon');
        poly.setAttribute('points', e.pts.map(p=>(p.x-minX).toFixed(3) + ',' + (maxY-p.y).toFixed(3)).join(' '));
        poly.setAttribute('fill', retenu ? remplissage : 'none');
        poly.setAttribute('fill-opacity', String(retenu ? (opacite || 0.85) : 0));
        poly.setAttribute('stroke', retenu ? contour : '#b0b0b0');
        poly.setAttribute('stroke-width', (retenu ? trait : trait*0.7).toFixed(3));
        if(!retenu) poly.setAttribute('stroke-dasharray', (trait*2).toFixed(2) + ' ' + (trait*2).toFixed(2));
        poly.setAttribute('pointer-events', 'none');
        svgEl.appendChild(poly);
      });
    };
    dessinerCouche(etatImport.vegetation, etatImport.importerVegetation, '#A9BE8E', '#4A6B32', 0.55);
    dessinerCouche(etatImport.haies, etatImport.importerHaies, '#7FA86B', '#3F5C33', 0.8);
    dessinerCouche(etatImport.batiments, etatImport.importerBatiments, '#D9B694', '#7A4A2A', 0.9);

    // Le point d'adresse, souvent hors de toute parcelle : le montrer evite de croire a un bug.
    const pa = document.createElementNS(svgNS, 'circle');
    pa.setAttribute('cx', (0-minX).toFixed(3));
    pa.setAttribute('cy', (maxY-0).toFixed(3));
    pa.setAttribute('r', Math.max(0.4, w/120).toFixed(3));
    pa.setAttribute('fill', '#a02020');
    pa.setAttribute('pointer-events', 'none');
    svgEl.appendChild(pa);
    hote.appendChild(svgEl);
  }
  function ligneSurface(c: Candidate): string {
    const calc = Math.round(c.aire);
    if(c.contenance === null) return calc + ' m² (calcul)';
    const ecart = Math.abs(calc - c.contenance!)/c.contenance!;
    // Au-dela de 3 %, on montre les deux : la contenance cadastrale est arrondie et calculee
    // autrement, l'ecart est normal - mais le cacher ferait douter de la geometrie importee.
    return ecart > 0.03 ? (c.contenance + ' m² (cadastre) / ' + calc + ' m² (calcul)') : (c.contenance + ' m²');
  }

  // ---- etapes ----
  let etapeConstruite = 0;
  let champAdresse: HTMLInputElement | null = null, listeSuggestions: HTMLElement | null = null,
    hoteApercu: HTMLElement | null = null, listeVoisines: HTMLElement | null = null,
    champNom: HTMLInputElement | null = null, blocIgn: HTMLElement | null = null,
    resumePropriete: HTMLElement | null = null;

  // Compte les elements BD TOPO qui tomberaient effectivement dans le plan : ceux qui recouvrent
  // la parcelle principale ou une voisine COCHEE. Recalcule a chaque coche, donc les compteurs
  // suivent la selection au lieu d'annoncer un total theorique.
  function elementsRetenus(liste: ElementIgn[]): ElementIgn[] {
    const retenues = new Set([etatImport.principale!.idu].concat(etatImport.voisinesRetenues().map(v=>v.idu)));
    return liste.filter(e=>[...e.parcelles].some(idu=>retenues.has(idu)));
  }
  function remplirBlocIgn(){
    if(!blocIgn) return;
    blocIgn.innerHTML = '';
    const ligne = (cle: 'importerBatiments' | 'importerHaies' | 'importerVegetation' | 'importerArbres', libelle: string, n: number, titre?: string) => {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:0.82rem; cursor:pointer;';
      if(titre) lab.title = titre;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!etatImport[cle];
      cb.disabled = n === 0;
      cb.addEventListener('change', ()=>{ etatImport[cle] = cb.checked; remplirBlocIgn(); if(hoteApercu) dessinerApercu(hoteApercu!); });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(libelle + ' — ' + n));
      if(n === 0) lab.style.opacity = '0.55';
      blocIgn!.appendChild(lab);
    };
    const bats = elementsRetenus(etatImport.batiments);
    const iduPropriete = new Set(etatImport.parcellesPropriete().map(p=>p.idu));
    const surPrincipale = bats.filter(b=>[...b.parcelles].some(idu=>iduPropriete.has(idu)));
    const hauteurs = surPrincipale.map(b=>hauteurBatiment(b.props!)).sort((a,b)=>b-a);
    ligne('importerBatiments', 'Bâtiments (BD TOPO, avec hauteur)', bats.length,
      'Emprise et hauteur reelles des batiments. Ceux de la parcelle sont modifiables, ceux des voisins arrivent verrouilles.');
    if(hauteurs.length){
      const d = document.createElement('div');
      d.style.cssText = 'font-size:0.78rem; opacity:0.75; margin:-2px 0 2px 22px;';
      d.textContent = 'Sur la propriété : ' + surPrincipale.length + ' bâtiment(s), hauteurs ' +
        hauteurs.map(h=>h.toFixed(1).replace('.',',') + ' m').join(', ');
      blocIgn.appendChild(d);
    }
    ligne('importerHaies', 'Haies (géométrie + hauteur)', elementsRetenus(etatImport.haies).length,
      'Couche haie de la BD TOPO : renseignee surtout en zone de bocage, souvent vide en ville.');
    const vegs = elementsRetenus(etatImport.vegetation);
    ligne('importerVegetation', 'Zones de végétation', vegs.length,
      'Bois, forets, vergers... hauteur deduite de la nature de la zone.');
    ligne('importerArbres', 'Arbres estimés dans ces zones (~' + Math.min(MAX_ARBRES_ESTIMES,
      vegs.reduce((s,v)=>s + arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).length, 0)) + ')',
      vegs.length, 'ESTIMATION : la BD TOPO ne cartographie pas les arbres isoles. Une grille reguliere d\'un arbre pour 64 m2 est repartie dans les zones de vegetation - un ordre de grandeur du couvert, pas un releve.');

    const plu = document.createElement('div');
    plu.style.cssText = 'font-size:0.8rem; margin-top:8px; line-height:1.45;';
    if(etatImport.plu && etatImport.plu.zones && etatImport.plu.zones.length){
      const z = etatImport.plu.zones[0]!;
      plu.innerHTML = '<b>PLU</b> — zone ' + escapeHtml(z.libelle) + (z.typezone ? ' (type ' + escapeHtml(z.typezone) + ')' : '') +
        (z.libelong ? '<br>' + escapeHtml(z.libelong) : '') +
        (z.urlfic ? '<br><a href="' + escapeHtml(z.urlfic) + '" target="_blank" rel="noopener">Règlement (PDF)</a>' : '') +
        '<br><span style="opacity:0.75;">Le zonage est rattaché à la parcelle et consultable dans l\'onglet PLU.</span>';
    } else if(etatImport.plu && etatImport.plu.commune && etatImport.plu.commune.rnu){
      plu.textContent = 'PLU : commune au RNU (pas de document d\'urbanisme local).';
    } else {
      plu.textContent = 'PLU : aucun zonage renvoye par le Geoportail de l\'urbanisme pour ce point.';
    }
    blocIgn.appendChild(plu);
    if(etatImport.ignErreur){
      const e = document.createElement('div');
      e.style.cssText = 'font-size:0.8rem; color:#a02020; margin-top:6px;';
      e.textContent = etatImport.ignErreur;
      blocIgn.appendChild(e);
    }
  }

  // Cases a cocher de l'etape 3, indexees par idu : cocher une voisine met a jour l'apercu ET
  // la case correspondante SANS reconstruire la liste. Reconstruire remplacerait les <input>
  // en cours d'utilisation - le clavier perdrait sa position a chaque coche, et une reference
  // gardee sur une case (clic sur l'apercu, par exemple) pointerait un noeud detache.
  const casesVoisines = new Map<string, { cb: HTMLInputElement; cbProp: HTMLInputElement; lab: HTMLElement }>();
  function rafraichirVue(){
    if(hoteApercu) dessinerApercu(hoteApercu);
    // Les compteurs BD TOPO dependent des parcelles cochees : cocher une voisine peut faire
    // entrer son batiment dans le lot.
    remplirBlocIgn();
    casesVoisines.forEach((ligne, idu)=>{
      ligne.cb.checked = etatImport.selection.has(idu) || etatImport.propriete.has(idu);
      ligne.cb.disabled = etatImport.propriete.has(idu);
      if(ligne.cbProp) ligne.cbProp.checked = etatImport.propriete.has(idu);
      ligne.lab.style.background = (etatImport.survol === idu) ? 'rgba(139,107,61,0.18)' : 'transparent';
    });
    majResumePropriete();
  }
  function rendre(){
    if(etapeConstruite !== etatImport.etape){
      corps.innerHTML = ''; pied.innerHTML = '';
      hoteApercu = listeVoisines = blocIgn = resumePropriete = null;
      if(etatImport.etape === 1) construireEtape1();
      else if(etatImport.etape === 2) construireEtape2();
      else construireEtape3();
      etapeConstruite = etatImport.etape;
    }
    majEtat();
  }

  function construireEtape1(){
    titre.textContent = 'Nouveau projet depuis une adresse (1/3)';
    const lab = document.createElement('div');
    lab.style.cssText = 'margin-bottom:6px;';
    lab.textContent = 'Adresse du terrain (ou coordonnees « latitude, longitude ») :';
    champAdresse = document.createElement('input');
    champAdresse.type = 'text';
    champAdresse.className = 'promptInput';
    champAdresse.placeholder = '2 allee des Limites 78110 Le Vesinet';
    listeSuggestions = document.createElement('div');
    listeSuggestions.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:4px;';
    corps.appendChild(lab); corps.appendChild(champAdresse); corps.appendChild(listeSuggestions);

    let minuteur: ReturnType<typeof setTimeout> | null = null, requeteEnCours = 0;
    // On ne reconstruit QUE la liste des suggestions a chaque frappe : reconstruire le corps
    // entier remplacerait le champ de saisie et lui ferait perdre le focus a chaque lettre.
    champAdresse.addEventListener('input', ()=>{
      // Sans effet sur null : seule la signature de clearTimeout le refuse.
      clearTimeout(minuteur!);
      const texte = champAdresse!.value.trim();
      if(texte.length < 3){ etatImport.suggestions = []; remplirSuggestions(); return; }
      minuteur = setTimeout(async ()=>{
        const monTour = ++requeteEnCours;
        try {
          const res = await geocoderBAN(texte, true);
          if(monTour !== requeteEnCours) return; // une frappe plus recente a pris la main
          etatImport.suggestions = res; etatImport.erreur = '';
        } catch(e){
          if(monTour !== requeteEnCours) return;
          etatImport.suggestions = []; etatImport.erreur = 'Geocodage impossible : ' + ((e as Error).message || e);
        }
        remplirSuggestions(); majEtat();
      }, 250);
    });
    champAdresse.addEventListener('keydown', e=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        if(etatImport.suggestions.length) void choisirAdresse(etatImport.suggestions[0]!);
        else void lancerRechercheTexte(champAdresse!.value.trim());
      }
    });
    pied.appendChild(bouton('Annuler', false, fermer));
    pied.appendChild(bouton('Rechercher', true, ()=>lancerRechercheTexte(champAdresse!.value.trim())));
    setTimeout(()=>champAdresse!.focus(), 0);
  }
  function remplirSuggestions(){
    listeSuggestions!.innerHTML = '';
    etatImport.suggestions.forEach(s=>{
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'secondary';
      b.style.cssText = 'text-align:left; font-size:0.84rem; padding:6px 8px;';
      b.textContent = s.label + (s.genre && s.genre !== 'housenumber' ? '  (niveau ' + s.genre + ')' : '');
      b.addEventListener('click', ()=>choisirAdresse(s));
      listeSuggestions!.appendChild(b);
    });
  }
  const RE_COORDS = /^\s*(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)\s*$/;
  async function lancerRechercheTexte(texte: string): Promise<void> {
    if(!texte || texte.length < 3){ etatImport.erreur = 'Saisis une adresse (au moins 3 caracteres).'; majEtat(); return; }
    const m = texte.match(RE_COORDS);
    if(m){
      const lat = parseFloat(m[1]!.replace(',', '.')), lon = parseFloat(m[2]!.replace(',', '.'));
      void choisirAdresse({ label:'Point ' + lat.toFixed(6) + ', ' + lon.toFixed(6), score:1, genre:'coordonnees', citycode:'', ville:'', lon, lat });
      return;
    }
    occuper(true, 'Geocodage en cours…');
    try {
      const res = await geocoderBAN(texte, false);
      occuper(false);
      if(!res.length){ etatImport.erreur = 'Aucune adresse trouvee. Essaie sans le numero, ou avec le code postal.'; majEtat(); return; }
      etatImport.suggestions = res; remplirSuggestions();
      void choisirAdresse(res[0]!);
    } catch(e){
      occuper(false);
      etatImport.erreur = 'Geocodage impossible : ' + ((e as Error).message || e);
      majEtat();
    }
  }
  async function choisirAdresse(sug: AdresseRecherchee): Promise<void> {
    etatImport.geo = sug;
    occuper(true, 'Recherche de la parcelle…');
    try {
      const proj = projecteurLocal(sug.lat, sug.lon);
      const ptRef = {x:0, y:0};   // le point d'adresse est l'origine de cette projection
      let features: FeatureGeoJSON[] = [], rayon: number | null = null;
      for(const r of RAYONS_RECHERCHE_M){
        features = await interrogerCadastre(empriseGeoJSON(sug.lon, sug.lat, proj, r), sug.citycode);
        if(features.length){ rayon = r; break; }
      }
      occuper(false);
      if(!features.length){
        etatImport.erreur = 'Aucune parcelle cadastrale trouvee dans un rayon de ' + RAYONS_RECHERCHE_M[RAYONS_RECHERCHE_M.length-1] + ' m.';
        majEtat(); return;
      }
      const cands = classerCandidats(construireCandidats(features, proj, ptRef, etatImport.simplifier));
      if(!cands.length){
        etatImport.erreur = 'Geometrie inexploitable renvoyee par le service cadastre.';
        majEtat(); return;
      }
      // Le filtre geom pourrait etre ignore sans que rien ne le signale : une "plus proche"
      // parcelle a 200 m de l'adresse trahirait ce cas mieux que n'importe quel code HTTP.
      if(cands[0]!.distance > 120){
        etatImport.erreur = 'Reponse incoherente du service cadastre (parcelle la plus proche a ' + Math.round(cands[0]!.distance) + ' m de l\'adresse).';
        majEtat(); return;
      }
      etatImport.proj = proj;
      etatImport.rayon = rayon;
      etatImport.candidats = cands;
      etatImport.selection = new Set();
      etatImport.voisinageCharge = new Set();
      occuper(true, 'Recherche des parcelles voisines…');
      try {
        await chargerVoisinage(cands[0]!);
      } catch(e){
        // Le voisinage est un complement : son echec ne doit pas emporter la parcelle trouvee.
        etatImport.erreur = 'Parcelles voisines non chargees : ' + ((e as Error).message || e);
      }
      occuper(false);
      appliquerPrincipale(cands[0]!);
      await chargerIgnAvecMessage(cands[0]!);
      etatImport.etape = 2;
      rendre();
    } catch(e){
      occuper(false);
      etatImport.erreur = ((e as Error).message || String(e));
      majEtat();
    }
  }
  // Deuxieme requete, centree sur la parcelle retenue : c'est elle qui donne la liste COMPLETE
  // des mitoyennes. Faite une seule fois par parcelle (un changement de parcelle principale
  // rouvre un voisinage different, mais y revenir ne redemande rien).
  async function chargerVoisinage(c: Candidate): Promise<void> {
    if(etatImport.voisinageCharge.has(c.idu)) return;
    const emprise = empriseAutourAnneau(c.anneauDeg, etatImport.proj!, 20);
    const features = await interrogerCadastre(emprise, etatImport.geo ? etatImport.geo.citycode : '');
    const connus = new Set(etatImport.candidats.map(x=>x.idu));
    const nouveaux = construireCandidats(features, etatImport.proj!, {x:0, y:0}, etatImport.simplifier)
      .filter(x=>!connus.has(x.idu));
    if(nouveaux.length) etatImport.candidats = classerCandidats(etatImport.candidats.concat(nouveaux));
    etatImport.voisinageCharge.add(c.idu);
  }
  function appliquerPrincipale(c: Candidate): void {
    etatImport.principale = c;
    const tri = trierVoisines(c, etatImport.candidats);
    etatImport.adjacentes = tri.adjacentes;
    etatImport.autres = tri.autres;
    etatImport.tropDense = tri.tropDense;
    etatImport.selection = new Set([...etatImport.selection].filter(idu => idu !== c.idu));
    // La nouvelle principale ne peut plus figurer dans la liste des parcelles a lui fusionner.
    etatImport.propriete.delete(c.idu);
    rattacherElementsAuxParcelles(etatImport.batiments, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.haies, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.vegetation, etatImport.candidats);
  }
  // BD TOPO + PLU sur l'emprise de la parcelle et de ses mitoyennes. Chargement separe du
  // cadastre : ces couches sont un complement, leur indisponibilite ne doit pas empecher
  // d'importer la parcelle (message a cote, et cases correspondantes vides).
  async function chargerDonneesIgn(c: Candidate): Promise<void> {
    if(etatImport.ignCharge.has(c.idu)) return;
    const anneaux = [c.anneauDeg].concat(etatImport.adjacentes.map(v=>v.anneauDeg));
    const bbox = bboxDegDesAnneaux(anneaux, etatImport.proj!, 10);
    const centre = centroid(c.pts);
    const centreDeg = etatImport.proj!.versDegres(centre.x, centre.y);
    const [bat, veg, haie, plu] = await Promise.all([
      interrogerWfs(COUCHE_BATIMENT, bbox, 80).catch(e=>{ throw e; }),
      interrogerWfs(COUCHE_VEGETATION, bbox, 40).catch((): FeatureGeoJSON[]=>[]),
      interrogerWfs(COUCHE_HAIE, bbox, 40).catch((): FeatureGeoJSON[]=>[]),
      interrogerPlu(centreDeg.lon, centreDeg.lat).catch((): null=>null)
    ]);
    etatImport.batiments = construireElementsIgn(bat, etatImport.proj!, etatImport.simplifier, 'batiment');
    etatImport.vegetation = construireElementsIgn(veg, etatImport.proj!, etatImport.simplifier, 'vegetation');
    etatImport.haies = construireElementsIgn(haie, etatImport.proj!, etatImport.simplifier, 'haie');
    etatImport.plu = plu;
    rattacherElementsAuxParcelles(etatImport.batiments, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.haies, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.vegetation, etatImport.candidats);
    etatImport.ignCharge.add(c.idu);
  }
  async function chargerIgnAvecMessage(c: Candidate): Promise<void> {
    occuper(true, 'Bâtiments, végétation et PLU…');
    try {
      await chargerDonneesIgn(c);
      etatImport.ignErreur = '';
    } catch(e){
      etatImport.batiments = []; etatImport.haies = []; etatImport.vegetation = [];
      etatImport.ignErreur = 'Donnees BD TOPO indisponibles : ' + ((e as Error).message || e);
    }
    occuper(false);
    if(etatImport.ignErreur) etatImport.erreur = etatImport.ignErreur;
  }
  async function choisirPrincipale(c: Candidate | null | undefined): Promise<void> {
    if(!c || c.idu === etatImport.principale!.idu) return;
    occuper(true, 'Recherche des parcelles voisines…');
    try {
      await chargerVoisinage(c);
    } catch(e){
      etatImport.erreur = 'Parcelles voisines non chargees : ' + ((e as Error).message || e);
    }
    occuper(false);
    appliquerPrincipale(c);
    await chargerIgnAvecMessage(c);
    etapeConstruite = 0; // la liste des candidates et l'apercu changent entierement
    rendre();
  }
  function basculerVoisine(c: Candidate): void {
    if(etatImport.propriete.has(c.idu)) return;   // une parcelle de la propriete est importee d'office
    if(etatImport.selection.has(c.idu)) etatImport.selection.delete(c.idu);
    else etatImport.selection.add(c.idu);
    rafraichirVue();
  }
  function basculerPropriete(c: Candidate): void {
    if(etatImport.propriete.has(c.idu)) etatImport.propriete.delete(c.idu);
    else {
      etatImport.propriete.add(c.idu);
      etatImport.selection.delete(c.idu);   // elle n'est plus une voisine : elle EST la parcelle
    }
    rafraichirVue();
  }
  // Resume de la propriete : surface fusionnee reelle (pas la somme des contenances) et etatImport de
  // la fusion. Une fusion impossible doit se voir AVANT la creation du projet, pas apres.
  function majResumePropriete(){
    if(!resumePropriete) return;
    const parcelles = etatImport.parcellesPropriete();
    if(parcelles.length <= 1){
      resumePropriete.textContent = 'Propriété : ' + libelleParcelle(etatImport.principale!) + ' seule. Coche « propriété » sur une mitoyenne pour fusionner plusieurs parcelles en un seul terrain.';
      resumePropriete.style.color = '';
      return;
    }
    const fusion = fusionnerAnneaux(parcelles.map(p=>p.pts), FUSION_TOL_M);
    if(!fusion){
      resumePropriete.textContent = 'Fusion impossible : ' + parcelles.map(libelleParcelle).join(' + ') +
        ' ne forment pas un ensemble d\'un seul tenant. Elles seront importées séparément.';
      resumePropriete.style.color = '#a02020';
      return;
    }
    resumePropriete.style.color = '';
    resumePropriete.textContent = 'Propriété fusionnée : ' + parcelles.map(libelleParcelle).join(' + ') +
      ' — ' + Math.round(shoelace(fusion.contour)) + ' m² au total, ' +
      chainerSegments(fusion.limites, FUSION_TOL_M).length + ' limite(s) interne(s) conservée(s) en pointillé.';
  }

  function construireEtape2(){
    titre.textContent = 'Parcelle trouvee (2/3)';
    hoteApercu = document.createElement('div');
    corps.appendChild(hoteApercu);
    const info = document.createElement('div');
    info.style.cssText = 'margin-top:10px; line-height:1.5;';
    const p = etatImport.principale!;
    const ecartAuto = etatImport.candidats.length > 1 ? (etatImport.candidats[1]!.distance! - etatImport.candidats[0]!.distance!) : Infinity;
    info.innerHTML = '<b>' + escapeHtml('Parcelle ' + libelleParcelle(p)) + '</b> — ' + escapeHtml(p.commune||'') +
      ' (INSEE ' + escapeHtml(p.codeInsee||'') + ')<br>Surface : ' + escapeHtml(ligneSurface(p)) +
      '<br>Adresse : ' + escapeHtml(etatImport.geo!.label) +
      '<br>Point d\'adresse : ' + (p.dedans ? 'dans la parcelle' : 'a ' + p.distance!.toFixed(2) + ' m du bord (il est pose devant la porte, sur la voirie)') +
      (etatImport.geo!.genre && etatImport.geo!.genre !== 'housenumber' && etatImport.geo!.genre !== 'coordonnees'
        ? '<br><i>Adresse resolue au niveau ' + escapeHtml(etatImport.geo!.genre) + ' : la parcelle proposee est approximative.</i>' : '') +
      (ecartAuto < ECART_AUTO_M ? '<br><i>Plusieurs parcelles sont a distance comparable : verifie le choix ci-dessous.</i>' : '');
    corps.appendChild(info);

    const titreListe = document.createElement('div');
    titreListe.style.cssText = 'margin-top:12px; font-weight:600;';
    titreListe.textContent = 'Autre parcelle ? (clic sur l\'apercu ou dans la liste)';
    corps.appendChild(titreListe);
    const liste = document.createElement('div');
    liste.style.cssText = 'margin-top:6px; display:flex; flex-direction:column; gap:3px; max-height:22vh; overflow:auto;';
    etatImport.candidats.forEach(c=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = c.idu === p.idu ? '' : 'secondary';
      b.style.cssText = 'text-align:left; font-size:0.82rem; padding:5px 8px;';
      b.textContent = libelleParcelle(c) + ' — ' + ligneSurface(c) + ' — ' + c.distance.toFixed(2) + ' m de l\'adresse';
      b.addEventListener('mouseenter', ()=>{ etatImport.survol = c.idu; dessinerApercu(hoteApercu!); });
      b.addEventListener('mouseleave', ()=>{ etatImport.survol = null; dessinerApercu(hoteApercu!); });
      b.addEventListener('click', ()=>choisirPrincipale(c));
      liste.appendChild(b);
    });
    corps.appendChild(liste);

    const optSimplif = document.createElement('label');
    optSimplif.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:10px; font-size:0.82rem;';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = etatImport.simplifier;
    cb.addEventListener('change', ()=>{
      etatImport.simplifier = cb.checked;
      // Retour a la geometrie source : re-projeter depuis les anneaux WGS84 conserves, plutot
      // que de re-simplifier un contour deja simplifie (ce qui ne reviendrait jamais en arriere).
      etatImport.candidats.forEach(c=>{
        c.pts = anneauVersPts(c.anneauDeg, etatImport.proj!, etatImport.simplifier);
        c.aire = shoelace(c.pts);
        c.dedans = pointInPolygon({x:0,y:0}, c.pts);
        c.distance = distancePointContour({x:0,y:0}, c.pts);
      });
      appliquerPrincipale(etatImport.candidats.find(c=>c.idu === etatImport.principale!.idu) || etatImport.principale!);
      etapeConstruite = 0; rendre();
    });
    optSimplif.appendChild(cb);
    optSimplif.appendChild(document.createTextNode('Simplifier les contours (sommets alignes a moins de 2 cm)'));
    corps.appendChild(optSimplif);

    pied.appendChild(bouton('Annuler', false, fermer));
    pied.appendChild(bouton('← Changer d\'adresse', false, ()=>{ etatImport.etape = 1; etatImport.suggestions = []; rendre(); }));
    pied.appendChild(bouton('Parcelles voisines →', true, ()=>{ etatImport.etape = 3; rendre(); }));
    dessinerApercu(hoteApercu);
  }

  function construireEtape3(){
    titre.textContent = 'Parcelles voisines et creation (3/3)';
    hoteApercu = document.createElement('div');
    corps.appendChild(hoteApercu);
    resumePropriete = document.createElement('div');
    resumePropriete.style.cssText = 'margin-top:8px; font-size:0.82rem; font-weight:600; line-height:1.4;';
    corps.appendChild(resumePropriete);
    const aide = document.createElement('div');
    aide.style.cssText = 'margin-top:8px; font-size:0.82rem; opacity:0.8;';
    aide.textContent = 'Coche « propriété » pour les parcelles qui forment ton terrain (elles seront fusionnées en une seule), « importer » pour celles qui restent un simple décor de référence. Un clic sur l\'aperçu bascule « importer ». '
      + 'Un objet coche « contraint a la parcelle » reste enferme dans la parcelle principale : pour construire a cheval sur une voisine, decoche cette contrainte dans le panneau Objet.';
    corps.appendChild(aide);
    const barreSelection = document.createElement('div');
    barreSelection.style.cssText = 'display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;';
    barreSelection.appendChild(bouton('Cocher toutes les mitoyennes', false, ()=>{
      etatImport.adjacentes.forEach(c=>etatImport.selection.add(c.idu));
      rafraichirVue();
    }));
    barreSelection.appendChild(bouton('Tout decocher', false, ()=>{
      etatImport.selection.clear();
      rafraichirVue();
    }));
    corps.appendChild(barreSelection);
    listeVoisines = document.createElement('div');
    listeVoisines.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:3px; max-height:26vh; overflow:auto;';
    corps.appendChild(listeVoisines);

    // ---- Donnees IGN (BD TOPO + PLU) ----
    const titreIgn = document.createElement('div');
    titreIgn.style.cssText = 'margin-top:14px; font-weight:600;';
    titreIgn.textContent = 'Données IGN à importer sur les parcelles retenues';
    corps.appendChild(titreIgn);
    blocIgn = document.createElement('div');
    blocIgn.style.cssText = 'margin-top:4px; display:flex; flex-direction:column; gap:3px;';
    corps.appendChild(blocIgn);
    remplirBlocIgn();

    const labNom = document.createElement('div');
    labNom.style.cssText = 'margin-top:12px; margin-bottom:4px;';
    labNom.textContent = 'Nom du projet :';
    champNom = document.createElement('input');
    champNom.type = 'text';
    champNom.className = 'promptInput';
    champNom.value = (libelleParcelle(etatImport.principale!) + ' — ' + (etatImport.geo ? etatImport.geo.label : '')).slice(0, 60);
    corps.appendChild(labNom); corps.appendChild(champNom);

    pied.appendChild(bouton('Annuler', false, fermer));
    pied.appendChild(bouton('← Retour', false, ()=>{ etatImport.etape = 2; rendre(); }));
    pied.appendChild(bouton('Creer le projet', true, creerProjet));
    remplirListeVoisines();
    // Le resume de propriete se remplit a l'arrivee sur l'etape, pas seulement au premier clic :
    // c'est lui qui annonce quelle parcelle est la principale et la surface qui sera creee.
    majResumePropriete();
    dessinerApercu(hoteApercu);
  }
  function remplirListeVoisines(): void {
    listeVoisines!.innerHTML = '';
    casesVoisines.clear();
    const groupe = (titreTxte: string, liste: Candidate[]) => {
      if(!liste.length) return;
      const t = document.createElement('div');
      t.style.cssText = 'font-weight:600; margin-top:6px; font-size:0.82rem;';
      t.textContent = titreTxte;
      listeVoisines!.appendChild(t);
      liste.forEach(c=>{
        const rang = document.createElement('div');
        rang.style.cssText = 'display:flex; align-items:center; gap:10px; font-size:0.82rem; padding:2px 0; background:transparent;';
        if(etatImport.survol === c.idu) rang.style.background = 'rgba(139,107,61,0.18)';
        // Deux cases distinctes : "propriete" fusionne la parcelle avec la principale (un seul
        // terrain), "importer" la pose a cote en simple reference. La premiere implique la
        // seconde, d'ou la case importer cochee et desactivee dans ce cas.
        const labProp = document.createElement('label');
        labProp.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;';
        labProp.title = 'Cette parcelle fait partie de la propriete : elle sera fusionnee avec la parcelle principale, sa limite interne restant en pointille.';
        const cbProp = document.createElement('input');
        cbProp.type = 'checkbox';
        cbProp.checked = etatImport.propriete.has(c.idu);
        cbProp.addEventListener('change', ()=>basculerPropriete(c));
        labProp.appendChild(cbProp);
        labProp.appendChild(document.createTextNode('propriété'));

        const labImport = document.createElement('label');
        labImport.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;';
        labImport.title = 'Importer cette parcelle comme voisine, en decor de reference.';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = etatImport.selection.has(c.idu) || etatImport.propriete.has(c.idu);
        cb.disabled = etatImport.propriete.has(c.idu);
        cb.addEventListener('change', ()=>basculerVoisine(c));
        labImport.appendChild(cb);
        labImport.appendChild(document.createTextNode('importer'));

        const texte = document.createElement('span');
        texte.style.cssText = 'cursor:pointer; flex:1;';
        texte.textContent = libelleParcelle(c) + ' — ' + ligneSurface(c) +
          (c.frontiere ? ' — ' + c.frontiere.toFixed(1) + ' m de limite commune' : ' — a ' + (c.distancePrincipale||0).toFixed(1) + ' m');
        texte.addEventListener('click', ()=>basculerVoisine(c));

        // Permuter la principale sans repasser par l'etape 2 : c'est ici qu'on voit le voisinage
        // en entier, donc ici qu'on se rend compte qu'on a designe la mauvaise parcelle. Le
        // changement relance tout (adjacences, elements BD TOPO, origine du plan a la creation) -
        // jamais un remplacement partiel de la geometrie.
        const btnPrincipale = document.createElement('button');
        btnPrincipale.type = 'button';
        btnPrincipale.className = 'secondary';
        btnPrincipale.style.cssText = 'font-size:0.72rem; padding:2px 7px; white-space:nowrap;';
        btnPrincipale.textContent = '↑ principale';
        btnPrincipale.title = 'En faire la parcelle principale : celle qui porte l\'adresse, l\'origine du plan et le zonage PLU. L\'actuelle redevient une voisine.';
        btnPrincipale.addEventListener('click', e=>{ e.stopPropagation(); void choisirPrincipale(c); });

        rang.addEventListener('mouseenter', ()=>{ etatImport.survol = c.idu; rafraichirVue(); });
        rang.addEventListener('mouseleave', ()=>{ if(etatImport.survol === c.idu){ etatImport.survol = null; rafraichirVue(); } });
        casesVoisines.set(c.idu, {cb, cbProp, lab:rang});
        rang.appendChild(labProp);
        rang.appendChild(labImport);
        rang.appendChild(texte);
        rang.appendChild(btnPrincipale);
        listeVoisines!.appendChild(rang);
      });
    };
    groupe('Parcelles mitoyennes', etatImport.adjacentes);
    groupe('Autres parcelles du secteur', etatImport.autres);
    if(etatImport.tropDense){
      const t = document.createElement('div');
      t.style.cssText = 'font-size:0.8rem; color:#a02020; margin-top:6px;';
      t.textContent = 'Perimetre tres dense : seules les ' + MAX_VOISINES + ' plus grandes limites communes sont proposees.';
      listeVoisines!.appendChild(t);
    }
  }

  async function creerProjet(): Promise<void> {
    const nom = (champNom!.value || '').trim() || ('Parcelle ' + libelleParcelle(etatImport.principale!));
    let objets;
    try {
      // A l'etape 3 (seul endroit d'ou creerProjet est joignable), le fil de l'assistant a deja
      // pose `principale` et `proj` (etape 1 reussie) : c'est cette garantie de flux, pas le
      // type, qui rend le cast sur. `EtatImportCadastre` et `ImportCadastral` different seulement
      // par la nullabilite de ces deux champs pendant les etapes 1 et 2.
      objets = objetsDepuisCadastre(etatImport as unknown as ImportCadastral);
    } catch(e){
      etatImport.erreur = 'Construction du plan impossible : ' + ((e as Error).message || e);
      majEtat(); return;
    }
    if(!ctx.apiDisponible){
      // Mode local : pas de serveur ou ecrire. On charge quand meme le plan (meme chemin que
      // l'import JSON), en le disant clairement plutot que de faire semblant d'enregistrer.
      fermer();
      ctx.appliquerProjetImporte({ meta:{}, objets, mesures:[], ignores:0 }, true);
      showToast('Mode local : le plan cadastral est charge mais ne sera pas enregistre. Utilise Export JSON pour le conserver.');
      return;
    }
    occuper(true, 'Creation du projet…');
    try {
      const cree = await ctx.apiSave({ name: nom, objects: objets, measures: [] }) as { id: string };
      localStorage.setItem(ctx.cleDernierProjet, cree.id);
      location.href = ctx.withProjectParam(cree.id);
    } catch(e){
      occuper(false);
      etatImport.erreur = 'Impossible de creer le projet : ' + ((e as Error).message || e);
      majEtat();
    }
  }

  rendre();
}
