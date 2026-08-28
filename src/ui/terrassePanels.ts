// Panneaux du mode Terrasse (spec §6.4, ui/).
//
// Huit panneaux qui decrivent la meme terrasse sous huit angles : le configurateur (ce qu'on
// construit), les parametres de calcul, la coupe, le debit de bois, l'implantation, le chantier, la
// methode, et l'optimisation. Ils partagent une regle : **ils lisent la construction, ils ne la
// deduisent pas**. Tout le calcul vit dans `engine/`, ces fonctions ne font que le mettre en page.
//
// L'etat d'ouverture du bloc d'optimisation vit ici et nulle part ailleurs : c'est un pli de
// l'interface, pas une donnee du chantier - il ne doit pas partir dans le projet enregistre.

import { escapeHtml } from '../util/escape.js';
import { svgNS } from '../render/svg.js';
import { showToast } from './dialogs.js';
import { dist, shoelace } from '../geometry/basic.js';
import { achatPlots, achatVis, chargePlot, coutDebit, longueursBois, longueursDispo, longueursLambourde, prixPersonnalise, prixPlotUnite, prixVisUnite } from '../engine/bom.js';
import { CADENCES, CHANTIER_PHASES, computeChantier } from '../engine/chantier.js';
import { CONCASSE_PRICE, DALLE_STAB_PRICE, ESSENCE_PRICES, estPlots, GEOTEXTILE_PRICE, LAME_RIVE_PRICE, PLOT_ASSISE_MIN_CM2, PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM, PLOT_HAUTEUR_MAX_CM, PLOT_MODELES, plotModele, SOLIVE_PRICE, SOLIVE_SECTIONS, SUPPORT_TYPES, VIS_DEPASSEMENT_MAX_CM, VIS_DEPASSEMENT_USUEL_CM, VIS_PRICE, VISSERIE_PRICE } from '../engine/constantes.js';
import { ensureConstruction } from '../engine/construction.js';
import { computeDebitsBois } from '../engine/debit.js';
import { computeImplantation } from '../engine/implantation.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { buildVisGrid, CHARGE_REF, coefRaideurLame, computeStructure, dimsSection, ENTRAXE_LAME_K, evaluerStructure, findSpaZones, LAMBOURDE_SECTIONS, LAME_RAIDEUR, lamesAngleOf, maxEntraxeLameCm, maxPorteeVisM, optimiserParametres, PORTEE_VIS_K, porteeAppuiM, porteeVisM, porteeVisSpaM, prixUnitaire, sectionLambourde, SOLIVE_SECTION_DIMS, zoneToucheTerrasse } from '../engine/structure.js';


// Le bloc d'optimisation reste ouvert une fois demande, et se reclasse a chaque changement : on
// peut ainsi voir monter ou descendre la configuration qu'on est en train d'editer.
let optimVisible = false;

/** Ouvre ou ferme le bloc d'optimisation, et rend son nouvel etat. */
export function basculerOptimisation(): boolean {
  optimVisible = !optimVisible;
  return optimVisible;
}
const ECHELLES = [200, 100, 50, 20];
export function renderDebitBois(obj, layers, ctx){
  const host = document.getElementById('terrasseDebitBoisBox');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  const groupes = computeDebitsBois(obj, layers);
  const regleAbout = c.jointsBoisSurAppui !== false
    ? ' Une abouture de poutre doit reposer sur une vis, donc un troncon courant est coupe a un multiple de la portee (' +
      Math.round(porteeVisM(c)*100) + ' cm).'
    : ' Les aboutures ne sont pas contraintes de tomber sur une vis.';

  groupes.forEach((g, i)=>{
    const d = g.debit;
    const lengths = Object.keys(d.achats).map(parseFloat).sort((a,b)=>b-a);
    if(groupes.length > 1){
      host.appendChild(Object.assign(document.createElement('div'),
        { className:'sectionTitle', textContent:g.titre, style: i ? 'margin-top:16px;' : '' }));
    }
    const detail = Object.keys(g.parts).map(k=>k + ' ' + g.parts[k].toFixed(2) + ' ml').join(', ');
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: (groupes.length > 1 ? '' : 'Debites ensemble : meme section, meme commande. ') +
        'Metre par role — ' + detail + '.' + (i ? '' : regleAbout) }));
    host.appendChild(ctx.champLongueurs(c, g.champLongueurs, 'Longueurs achetables (m)'));

    if(!lengths.length){
      host.appendChild(Object.assign(document.createElement('div'),
        { className:'hint', textContent:'Aucune piece a debiter pour ce poste.' }));
      return;
    }
    ctx.debitTable(host, c, d, lengths, g.cle);
    const cout = coutDebit(c, d, g.cle);
    const perso = lengths.filter(L=>prixPersonnalise(c, g.cle, L)).length;
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: 'Prix par barre : ' +
        (perso ? perso + ' sur ' + lengths.length + ' saisis, les autres estimes' : 'tous estimes') +
        ' au tarif indicatif du bois porteur (' + SOLIVE_PRICE.bas + ' a ' + SOLIVE_PRICE.haut +
        ' €/ml) — soit ' + (cout/(d.achatMl||1)).toFixed(2) + ' €/ml en moyenne, ou ' +
        (cout/(d.reelMl||1)).toFixed(2) + ' €/ml rapporte au lineaire reellement pose.' }));
    host.appendChild(ctx.bilanDebit(c, d));
  });

  // ---- appuis : deux postes distincts, jamais melanges ----
  // La vis et le plot ne se stockent ni ne se vendent pareil : la vis a un prix unique et un
  // conditionnement en boite, le plot a un prix par modele de gamme. Chaque mode n'affiche donc
  // que ses propres champs, et n'ecrit que dans son propre stockage.
  const nAppuis = layers.vis.length;
  const tblV = document.createElement('table');
  tblV.className = 'attrTable';
  tblV.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Poste</th><th>Qte</th><th>Valeur</th><th>Total</th>' }));
  const rowV = (label, qte, el, total) => {
    const tr=document.createElement('tr');
    const t0=document.createElement('td'); t0.textContent=label;
    const t1=document.createElement('td'); t1.textContent=qte;
    const t2=document.createElement('td'); if(typeof el==='string') t2.textContent=el; else t2.appendChild(el);
    const t3=document.createElement('td'); t3.textContent=total||''; t3.style.cssText='font-variant-numeric:tabular-nums;';
    tr.appendChild(t0); tr.appendChild(t1); tr.appendChild(t2); tr.appendChild(t3);
    tblV.appendChild(tr);
  };
  const champPrix = (valeur, titre, appliquer) => {
    const i = document.createElement('input');
    i.type='number'; i.step='0.5'; i.min='0'; i.style.width='90px';
    i.value = valeur.toFixed(2); i.title = titre;
    i.addEventListener('change', ()=>{
      const v = parseFloat(i.value);
      appliquer((isNaN(v)||v<0) ? undefined : v);
      ctx.refreshTerrasseView();
    });
    return i;
  };

  if(estPlots(c)){
    const m = plotModele(c);
    const ap = achatPlots(c, nAppuis);
    host.appendChild(Object.assign(document.createElement('div'),
      { className:'sectionTitle', textContent:'Plots', style:'margin-top:16px;' }));
    rowV('Modele retenu', m.label, m.min + ' a ' + m.max + ' cm', '');
    rowV('Prix unitaire', nAppuis + ' plots poses',
      champPrix(prixPlotUnite(c), 'Prix d\'un plot ' + m.label + ' chez ton fournisseur',
        v => { if(v===undefined) delete c.prixPlots[m.cle]; else c.prixPlots[m.cle] = v; }), '');
    rowV('A acheter', ap.unites + ' plots',
      ctx.prixPersonnaliseplot(c, m) ? 'prix saisi' : 'prix estime',
      ap.cout.toFixed(2) + ' €');
    host.appendChild(tblV);
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: 'Le prix d\'un plot depend surtout de sa hauteur de reglage : compter ' +
        PLOT_MODELES[0].prix.toFixed(2) + ' a ' + PLOT_MODELES[PLOT_MODELES.length-1].prix.toFixed(2) +
        ' € piece selon la gamme. Le prix est memorise par modele : changer de hauteur change de ' +
        'modele, et donc de prix. L\'assise est chiffree separement au BOM ci-dessus.' }));
  } else {
    const a = achatVis(c, nAppuis);
    host.appendChild(Object.assign(document.createElement('div'),
      { className:'sectionTitle', textContent:'Vis de fondation', style:'margin-top:16px;' }));
    rowV('Prix unitaire', nAppuis + ' vis posees',
      champPrix(prixVisUnite(c), 'Prix d\'une vis de fondation, hors pose',
        v => { c.prixVisUnite = v; }), '');
    const boiteInp = document.createElement('input');
    boiteInp.type='number'; boiteInp.step='1'; boiteInp.min='1'; boiteInp.style.width='90px';
    boiteInp.value = String(Math.max(1, Math.round(c.visParBoite||1)));
    boiteInp.title = 'Conditionnement. 1 = vendues a l\'unite.';
    boiteInp.addEventListener('change', ()=>{
      const v = parseInt(boiteInp.value,10);
      c.visParBoite = (isNaN(v)||v<1) ? 1 : v;
      ctx.refreshTerrasseView();
    });
    rowV('Conditionnement', a.parBoite>1 ? a.boites + ' boite(s)' : 'a l\'unite', boiteInp, '');
    rowV('A acheter', a.unites + ' vis', a.parBoite>1
        ? a.boites + ' × ' + a.parBoite + (a.unites>nAppuis ? ' (soit ' + (a.unites-nAppuis) + ' d\'avance)' : '')
        : 'a l\'unite',
      a.cout.toFixed(2) + ' €');
    host.appendChild(tblV);
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: 'Le prix d\'une vis de fondation depend surtout de sa longueur, donc du sol : ' +
        'compter ' + VIS_PRICE.bas + ' a ' + VIS_PRICE.haut + ' € piece hors pose pour du courant. ' +
        'La pose a la visseuse hydraulique, si tu la sous-traites, se facture a part et n\'est pas ' +
        'comptee ici.' }));
  }
}

export function renderTerrasseConfigurator(obj, ctx){
  const c = ensureConstruction(obj);
  const tbl = document.getElementById('terrasseConfigTable');
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Champ</th><th>Nom</th><th>Valeur</th>';
  tbl.appendChild(head);
  // 22 reglages a plat, c'est un mur : on ne trouve pas ce qu'on cherche. Les sections donnent
  // au tableau la structure de l'ouvrage lui-meme, du sol vers la finition.
  const addSection = (titre) => {
    const tr=document.createElement('tr');
    tr.className = 'sectionRow';
    const td=document.createElement('td'); td.colSpan=3; td.textContent=titre;
    td.style.cssText = 'font-family:"Helvetica Neue",Arial,sans-serif; font-weight:600; ' +
      'font-size:0.78rem; letter-spacing:.06em; text-transform:uppercase; ' +
      'color:var(--ink-soft); padding-top:14px;';
    tr.appendChild(td); tbl.appendChild(tr);
  };
  const addRow = (label, el, note?) => {
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=label;
    const td1=document.createElement('td');
    if(note){
      td1.textContent = note;
      td1.style.cssText = 'font-size:0.8rem; color:var(--ink-soft);';
    }
    const td2=document.createElement('td'); td2.appendChild(el);
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
    tbl.appendChild(tr);
  };

  const plots = estPlots(c);
  addSection('Fondation et appuis');
  const typeSelect = document.createElement('select');
  [['vis-fondation','Sur vis de fondation'],['plots','Sur plots reglables']].forEach(([v,l])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=l;
    if((c.typePose||'vis-fondation')===v) o.selected=true; typeSelect.appendChild(o);
  });
  typeSelect.addEventListener('change', ()=>{ ctx.pushHistory(); c.typePose=typeSelect.value; ctx.refreshTerrasseView(); });
  addRow('Type de pose', typeSelect, plots ? 'appui pose : il faut une assise' : 'appui fonde : hors gel par la profondeur');

  if(!plots){
    const hauteurVisInp = document.createElement('input'); hauteurVisInp.type='number'; hauteurVisInp.step='5'; hauteurVisInp.min='10'; hauteurVisInp.value=c.hauteurVis;
    hauteurVisInp.title = 'Longueur du fut visse dans le sol, pour aller chercher le hors-gel. Enterree, elle ne sureleve pas la terrasse : c\'est le depassement de tete ci-dessous qui le fait.';
    hauteurVisInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.hauteurVis=parseFloat(hauteurVisInp.value)||40; ctx.refreshTerrasseView(); });
    addRow('Longueur vis dans le sol (cm)', hauteurVisInp,
      'enterree : ne compte pas dans la hauteur finie');

    // La seule partie de la vis qui souleve quoi que ce soit. C'est par elle qu'on rattrape un
    // devers ou qu'on vient affleurer un seuil de porte.
    const depInp = document.createElement('input'); depInp.type='number'; depInp.step='1'; depInp.min='0'; depInp.value=c.depassementVis||0;
    depInp.title = 'Hauteur de tete reglable au-dessus du sol. C\'est la seule partie de la vis qui compte dans la hauteur finie.';
    depInp.addEventListener('change', ()=>{
      ctx.pushHistory();
      c.depassementVis = Math.max(0, parseFloat(depInp.value)||0); ctx.refreshTerrasseView();
    });
    const dep = c.depassementVis||0;
    addRow('Depassement de tete (cm)', depInp,
      (dep > VIS_DEPASSEMENT_MAX_CM ? '⚠ ' + dep + ' cm : c\'est un poteau, pas une tete de vis'
       : dep > VIS_DEPASSEMENT_USUEL_CM ? '⚠ au-dela de ' + VIS_DEPASSEMENT_USUEL_CM + ' cm : hors course usuelle'
       : dep > 0 ? 'hors sol : compte dans la hauteur finie'
       : 'tete arasee au niveau du sol'));
  } else {
    const hPlotInp = document.createElement('input'); hPlotInp.type='number'; hPlotInp.step='1'; hPlotInp.min='1'; hPlotInp.value=c.hauteurPlot;
    hPlotInp.title = 'Hauteur de reglage du plot, dessus d\'assise a dessous de lambourde';
    hPlotInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.hauteurPlot=parseFloat(hPlotInp.value)||10; ctx.refreshTerrasseView(); });
    const m = plotModele(c), h = c.hauteurPlot||10;
    const horsGamme = h < m.min-1e-9 || h > m.max+1e-9;
    addRow('Hauteur plot (cm)', hPlotInp,
      (h > PLOT_HAUTEUR_MAX_CM ? '⚠ au-dela d\'1 m : hors domaine NF DTU 51.4'
       : h > PLOT_HAUTEUR_DTU_CM ? '⚠ au-dela de 30 cm : plot reglable hors domaine DTU'
       : horsGamme ? '⚠ hors de la plage du modele choisi'
       : 'dans la plage du modele retenu'));

    const modSelect = document.createElement('select');
    const optAuto=document.createElement('option'); optAuto.value='auto'; optAuto.textContent='Automatique (selon hauteur)';
    if((c.plotModele||'auto')==='auto') optAuto.selected=true; modSelect.appendChild(optAuto);
    PLOT_MODELES.forEach(mm=>{ const o=document.createElement('option'); o.value=mm.cle;
      o.textContent=mm.label+' ('+mm.min+' a '+mm.max+' cm)';
      if(c.plotModele===mm.cle) o.selected=true; modSelect.appendChild(o); });
    modSelect.addEventListener('change', ()=>{ ctx.pushHistory(); c.plotModele=modSelect.value; ctx.refreshTerrasseView(); });
    addRow('Modele de plot', modSelect, 'retenu : ' + m.label + ' — ' + prixPlotUnite(c).toFixed(2) + ' € piece');

    const doubleCb = document.createElement('input'); doubleCb.type='checkbox'; doubleCb.checked=!!c.plotAvecSolives;
    doubleCb.title = 'Structure double : plots sous solives, lambourdes au-dessus. Sinon les lambourdes reposent directement sur les plots.';
    doubleCb.addEventListener('change', ()=>{ ctx.pushHistory(); c.plotAvecSolives=doubleCb.checked; ctx.refreshTerrasseView(); });
    addRow('Structure double (plots sous solives)', doubleCb,
      c.plotAvecSolives ? 'solives sur plots, lambourdes dessus' : 'lambourdes directement sur plots');

    const supSelect = document.createElement('select');
    Object.keys(SUPPORT_TYPES).forEach(k=>{ const o=document.createElement('option'); o.value=k;
      o.textContent=SUPPORT_TYPES[k].label; if((c.supportType||'concasse')===k) o.selected=true; supSelect.appendChild(o); });
    supSelect.addEventListener('change', ()=>{ ctx.pushHistory(); c.supportType=supSelect.value; ctx.refreshTerrasseView(); });
    addRow('Assise sous les plots', supSelect, 'chiffree au BOM');

    const decInp = document.createElement('input'); decInp.type='number'; decInp.step='5'; decInp.min='0'; decInp.value=c.supportDecaissement;
    decInp.disabled = !(SUPPORT_TYPES[c.supportType]||SUPPORT_TYPES.concasse).concasse;
    decInp.title = 'Epaisseur de concasse compacte sous les plots';
    decInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.supportDecaissement=parseFloat(decInp.value)||15; ctx.refreshTerrasseView(); });
    addRow('Decaissement / concasse (cm)', decInp, 'usage : 15 cm minimum sur sol meuble');

    const assiseInp = document.createElement('input'); assiseInp.type='number'; assiseInp.step='10'; assiseInp.min='50'; assiseInp.value=c.plotSurfaceAssise;
    assiseInp.title = 'Surface d\'assise du plot au contact du support';
    assiseInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.plotSurfaceAssise=parseFloat(assiseInp.value)||PLOT_ASSISE_MIN_CM2; ctx.refreshTerrasseView(); });
    addRow('Surface d\'assise du plot (cm²)', assiseInp,
      (c.plotSurfaceAssise < PLOT_ASSISE_MIN_CM2 ? '⚠ sous les ' : 'mini NF DTU 51.4 : ') + PLOT_ASSISE_MIN_CM2 + ' cm²');
  }

  const autoSpan = maxPorteeVisM(c);
  // Density readout: the trade lands around 1.0 to 1.5 screws per m2, so a config coming out
  // far above that is telling the user their solives are closer together than they need to be.
  // The spa densification is deliberate and local, so it is counted separately - otherwise a
  // heavy spa would make the layout look over-screwed and point the blame at the entraxe.
  const visPts = (obj.pts && obj.pts.length>=3) ? buildVisGrid(obj, null, ctx.objets()) : [];
  const visCount = visPts.length;
  const visSpa = visPts.filter(p=>p.role==='spa').length;
  // Nommer ce qui a ete detecte. Toute forme passee en fonction "equipement" resserre desormais
  // la grille : si elle n'est pas nommee ici, personne ne peut voir laquelle, ni s'apercevoir
  // qu'un objet a ete classe equipement par megarde.
  const zonesEquip = (obj.pts && obj.pts.length>=3)
    ? findSpaZones(c.visMargeZoneSpa, ctx.objets()).filter(z=>zoneToucheTerrasse(z, obj.pts)) : [];
  const nomsEquip = zonesEquip.map(z=>z.nom).join(', ');
  const surfM2 = shoelace(obj.pts) || 1;
  const densite = visCount / surfM2;
  const densiteHorsSpa = (visCount - visSpa) / surfM2;
  const chargeInp = document.createElement('input'); chargeInp.type='number'; chargeInp.step='25'; chargeInp.min='100';
  chargeInp.value = c.chargeNormale;
  chargeInp.title = 'Charge d\'exploitation visee hors zone renforcee. 250 kg/m² = usage courant d\'une terrasse privative.';
  chargeInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.chargeNormale=parseFloat(chargeInp.value)||250; ctx.refreshTerrasseView(); });
  addRow('Charge cible — zone courante (kg/m²)', chargeInp, 'usage : 250 kg/m²');

  const chargeSpaInp = document.createElement('input'); chargeSpaInp.type='number'; chargeSpaInp.step='25'; chargeSpaInp.min='100';
  chargeSpaInp.value = c.chargeSpa;
  chargeSpaInp.title = 'Charge visee sous les equipements. Un spa rempli et occupe pese 1,5 a 2 t sur 3 a 4 m² ; un bac plante ou une cuve sont du meme ordre.';
  chargeSpaInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.chargeSpa=parseFloat(chargeSpaInp.value)||500; ctx.refreshTerrasseView(); });
  addRow('Charge cible — zone equipement (kg/m²)', chargeSpaInp,
         nomsEquip
           ? 'appuis a ' + Math.round(porteeVisSpaM(c)*100) + ' cm sous : ' + nomsEquip
           : 'aucun equipement sur cette terrasse');

  // La densite attendue n'est pas du tout la meme d'un mode a l'autre : 1,0 a 1,5 vis/m², mais
  // 3 a 5 plots/m². Un seuil unique s'allumerait en permanence et a tort sur plots.
  const spanAppui = porteeAppuiM(c);
  const seuilDense = plots ? 6 : 2;
  const alerteDensite = densiteHorsSpa > seuilDense
    ? ' · dense : elargir l\'entraxe ou monter en section'
    : (plots && densiteHorsSpa < 2.2 ? ' · faible pour des plots : verifier l\'entraxe' : '');

  const visAutoCb = document.createElement('input'); visAutoCb.type='checkbox';
  visAutoCb.checked = plots ? (c.plotEntraxeAuto!==false) : (c.visModeAuto!==false);
  visAutoCb.title = plots
    ? 'Deduit l\'entraxe des plots de la section portee, de son entraxe et de la charge, plafonne a 70 cm (NF DTU 51.4)'
    : 'Deduit la portee admissible de la section des solives, de leur entraxe et de la charge cible';
  visAutoCb.addEventListener('change', ()=>{
    ctx.pushHistory();
    if(plots) c.plotEntraxeAuto = visAutoCb.checked; else c.visModeAuto = visAutoCb.checked;
    ctx.refreshTerrasseView();
  });
  addRow(plots ? 'Entraxe plots automatique' : 'Portee vis automatique', visAutoCb,
    'calcule : ' + Math.round(spanAppui*100) + ' cm' +
    (plots && spanAppui >= PLOT_ENTRAXE_MAX_M-1e-9 ? ' (plafond DTU atteint)' : ''));

  const auto = plots ? (c.plotEntraxeAuto!==false) : (c.visModeAuto!==false);
  const visEntraxeInp = document.createElement('input'); visEntraxeInp.type='number'; visEntraxeInp.step='5';
  visEntraxeInp.min = plots ? '20' : '30'; visEntraxeInp.max = plots ? '70' : '';
  visEntraxeInp.disabled = auto;
  visEntraxeInp.value = auto ? Math.round(spanAppui*100) : (plots ? c.plotEntraxe : c.visEntraxe);
  visEntraxeInp.title = plots
    ? 'Distance entre deux plots le long d\'une meme piece. Plafonnee a 70 cm.'
    : 'Distance maximale entre deux vis le long d\'une meme solive';
  visEntraxeInp.addEventListener('change', ()=>{
    ctx.pushHistory();
    const v = parseFloat(visEntraxeInp.value);
    if(plots) c.plotEntraxe = v || 65; else c.visEntraxe = v || 100;
    ctx.refreshTerrasseView();
  });
  addRow(plots ? 'Entraxe max entre plots (cm)' : 'Portee max entre vis (cm)', visEntraxeInp,
         visCount + ' ' + (plots?'plots':'vis') + (visSpa ? ' (dont ' + visSpa + ' en zone equipement)' : '') +
         ' — ' + densite.toFixed(1) + '/m²' + alerteDensite);

  if(plots){
    const ch = chargePlot(c, visCount, surfM2);
    const el = document.createElement('span');
    el.style.cssText = 'font-variant-numeric:tabular-nums;';
    el.textContent = ch.charge.toFixed(0) + ' kg';
    addRow('Charge par plot', el,
      ch.tributaire.toFixed(2) + ' m² repris · ' + ch.pression.toFixed(2) + ' kg/cm² sur ' +
      ch.assise + ' cm²' +
      ((SUPPORT_TYPES[c.supportType]||{}).dalles ? '' :
        (c.supportType==='dalle' ? ' — sur dalle, sans objet' : ' — sur concasse, verifier le poinconnement')));
  }


  const visZoneSpaInp = document.createElement('input'); visZoneSpaInp.type='number'; visZoneSpaInp.step='5'; visZoneSpaInp.min='20';
  visZoneSpaInp.disabled = c.visModeAuto!==false;
  visZoneSpaInp.value = c.visModeAuto!==false ? Math.round(porteeVisSpaM(c)*100) : c.visEntraxeZoneSpa;
  visZoneSpaInp.title = 'En mode automatique, deduit de la charge cible sous les equipements';
  visZoneSpaInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.visEntraxeZoneSpa=parseFloat(visZoneSpaInp.value)||60; ctx.refreshTerrasseView(); });
  addRow('Entraxe ' + (plots?'plots':'vis') + ' — zone equipement (cm)', visZoneSpaInp);

  const margeSpaInp = document.createElement('input'); margeSpaInp.type='number'; margeSpaInp.step='5'; margeSpaInp.min='0'; margeSpaInp.value=c.visMargeZoneSpa;
  margeSpaInp.title = 'Debord de la zone renforcee autour de l\'emprise de l\'equipement : la charge ne s\'arrete pas au bord de la cuve.';
  margeSpaInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.visMargeZoneSpa=parseFloat(margeSpaInp.value)||30; ctx.refreshTerrasseView(); });
  addRow('Marge autour de l\'equipement (cm)', margeSpaInp,
    (plots && visSpa) ? '⚠ voir avertissement sous le tableau' : '');

  addSection('Structure porteuse');
  // En pose simple sur plots il n'y a pas de solive : ces trois reglages n'ont plus d'objet.
  const sansSolives = plots && !c.plotAvecSolives;
  const soliveEntraxeInp = document.createElement('input'); soliveEntraxeInp.type='number'; soliveEntraxeInp.step='5'; soliveEntraxeInp.min='20'; soliveEntraxeInp.value=c.soliveEntraxe;
  soliveEntraxeInp.disabled = sansSolives;
  soliveEntraxeInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.soliveEntraxe=parseFloat(soliveEntraxeInp.value)||40; ctx.refreshTerrasseView(); });
  addRow('Entraxe solives (cm)', soliveEntraxeInp, sansSolives ? 'sans objet : pas de solives' : '');

  const soliveSectionSelect = document.createElement('select');
  SOLIVE_SECTIONS.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s+' mm'; if(c.soliveSection===s) o.selected=true; soliveSectionSelect.appendChild(o); });
  soliveSectionSelect.disabled = sansSolives;
  // The section now drives how far apart the supports can sit, so it needs a full refresh and
  // not just a price update.
  soliveSectionSelect.addEventListener('change', ()=>{ ctx.pushHistory(); c.soliveSection=soliveSectionSelect.value; ctx.refreshTerrasseView(); });
  addRow('Section solives', soliveSectionSelect,
    sansSolives ? 'sans objet : pas de solives' : 'porte ' + Math.round(autoSpan*100) + ' cm entre appuis');

  const lambourdeCb = document.createElement('input'); lambourdeCb.type='checkbox';
  lambourdeCb.checked = sansSolives ? true : !!c.avecLambourde;
  lambourdeCb.disabled = sansSolives;
  lambourdeCb.addEventListener('change', ()=>{ ctx.pushHistory(); c.avecLambourde=lambourdeCb.checked; ctx.refreshTerrasseView(); });
  addRow('Avec lambourdes', lambourdeCb, sansSolives ? 'impose : ce sont elles qui portent les lames' : '');

  const lambActif = sansSolives || c.avecLambourde;
  const lambSectionSelect = document.createElement('select');
  LAMBOURDE_SECTIONS.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s+' mm';
    if(sectionLambourde(c)===s) o.selected=true; lambSectionSelect.appendChild(o); });
  lambSectionSelect.disabled = !lambActif;
  lambSectionSelect.addEventListener('change', ()=>{ ctx.pushHistory(); c.lambourdeSection=lambSectionSelect.value; ctx.refreshTerrasseView(); });
  addRow('Section lambourdes', lambSectionSelect,
    !lambActif ? 'sans objet sans lambourdes'
      : sansSolives ? 'porte ' + Math.round(spanAppui*100) + ' cm entre plots'
      : (sectionLambourde(c)===c.soliveSection
          ? 'identique aux solives : un seul debit'
          : 'differente des solives : debit et prix separes'));

  const lambourdeEntraxeInp = document.createElement('input'); lambourdeEntraxeInp.type='number'; lambourdeEntraxeInp.step='5'; lambourdeEntraxeInp.min='20';
  lambourdeEntraxeInp.value = sansSolives ? maxEntraxeLameCm(c) : c.lambourdeEntraxe;
  lambourdeEntraxeInp.disabled = !lambActif || sansSolives;
  lambourdeEntraxeInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.lambourdeEntraxe=parseFloat(lambourdeEntraxeInp.value)||40; ctx.refreshTerrasseView(); });
  addRow('Entraxe lambourdes (cm)', lambourdeEntraxeInp,
    sansSolives ? 'impose par l\'epaisseur de lame' : '');

  addSection('Lames et sens de pose');
  const segRefSelect = document.createElement('select');
  obj.segmentNames.forEach((sn,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=sn||('Cote '+(i+1)); if((c.segmentReference||0)===i) o.selected=true; segRefSelect.appendChild(o); });
  segRefSelect.addEventListener('change', ()=>{ ctx.pushHistory(); c.segmentReference=parseInt(segRefSelect.value,10)||0; ctx.refreshTerrasseView(); });
  addRow('Cote de reference', segRefSelect);

  const sensPoseInp = document.createElement('input'); sensPoseInp.type='number'; sensPoseInp.step='1'; sensPoseInp.value=c.sensPose;
  sensPoseInp.title = '0 = parallele au cote de reference';
  sensPoseInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.sensPose=parseFloat(sensPoseInp.value)||0; ctx.refreshTerrasseView(); });
  addRow('Sens de pose (°, / cote de reference)', sensPoseInp);

  const essenceSelect = document.createElement('select');
  Object.keys(ESSENCE_PRICES).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=ESSENCE_PRICES[k].label; if(c.essenceBois===k) o.selected=true; essenceSelect.appendChild(o); });
  // Essence and thickness both feed the admissible spacing of the supports under the lames, so
  // they drive the whole view now, not just the prices. Changing the essence resets the
  // stiffness coefficient to that essence's own value - an override belongs to the lame type it
  // was entered for, not to the project.
  essenceSelect.addEventListener('change', ()=>{
    ctx.pushHistory();
    c.essenceBois = essenceSelect.value;
    c.coefRaideurLame = LAME_RAIDEUR[c.essenceBois] !== undefined ? LAME_RAIDEUR[c.essenceBois] : 1;
    ctx.refreshTerrasseView();
  });
  addRow('Essence de bois', essenceSelect);

  const coefInp = document.createElement('input'); coefInp.type='number'; coefInp.step='0.05'; coefInp.min='0.3'; coefInp.max='2';
  coefInp.value = coefRaideurLame(c);
  coefInp.title = 'Raideur de la lame par rapport au resineux (1,00). Multiplie l\'ecartement admissible des appuis.';
  coefInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.coefRaideurLame=parseFloat(coefInp.value)||1; ctx.refreshTerrasseView(); });
  const coefDefaut = LAME_RAIDEUR[c.essenceBois] !== undefined ? LAME_RAIDEUR[c.essenceBois] : 1;
  addRow('Coefficient raideur lame', coefInp,
         'defaut ' + coefDefaut.toFixed(2) + ' · appuis a ' + maxEntraxeLameCm(c) + ' cm' +
         (Math.abs(coefRaideurLame(c)-coefDefaut) > 1e-9 ? ' (modifie)' : ''));

  const largeurInp = document.createElement('input'); largeurInp.type='number'; largeurInp.step='5'; largeurInp.min='60'; largeurInp.value=c.largeurLame;
  largeurInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.largeurLame=parseFloat(largeurInp.value)||140; ctx.refreshTerrasseView(); });
  addRow('Largeur lame (mm)', largeurInp);

  const epaisseurInp = document.createElement('input'); epaisseurInp.type='number'; epaisseurInp.step='1'; epaisseurInp.min='15'; epaisseurInp.value=c.epaisseurLame;
  epaisseurInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.epaisseurLame=parseFloat(epaisseurInp.value)||25; ctx.refreshTerrasseView(); });
  addRow('Epaisseur lame (mm)', epaisseurInp);

  // Les deux finitions font le tour de la terrasse, et c'est bien la le probleme : il faut que
  // le libelle dise tout de suite laquelle est verticale et laquelle est a plat.
  addSection('Finitions du tour');
  const lameRiveCb = document.createElement('input'); lameRiveCb.type='checkbox'; lameRiveCb.checked=!!c.avecLameRive;
  lameRiveCb.title = 'Habillage de finition qui fait le tour de la terrasse, accroche sous le niveau des lames pour cacher la structure';
  lameRiveCb.addEventListener('change', ()=>{ ctx.pushHistory(); c.avecLameRive=lameRiveCb.checked; ctx.refreshTerrasseView(); });
  addRow('Lame de rive — habillage VERTICAL', lameRiveCb,
    'planche sur chant qui fait le tour, suspendue sous les lames, cache la structure');

  const hauteurRiveInp = document.createElement('input'); hauteurRiveInp.type='number'; hauteurRiveInp.step='10'; hauteurRiveInp.min='50'; hauteurRiveInp.value=c.hauteurLameRive;
  hauteurRiveInp.disabled = !c.avecLameRive;
  hauteurRiveInp.title = 'Hauteur de l\'habillage, mesuree depuis le dessus des lames vers le bas';
  hauteurRiveInp.addEventListener('change', ()=>{ ctx.pushHistory(); c.hauteurLameRive=parseFloat(hauteurRiveInp.value)||200; ctx.refreshTerrasseView(); });
  addRow('Hauteur lame de rive (mm)', hauteurRiveInp);

  const lamePlatCb = document.createElement('input'); lamePlatCb.type='checkbox'; lamePlatCb.checked=!!c.avecLamePlat;
  lamePlatCb.title = 'Planche plate qui fait le tour de la terrasse, posee a plat au meme niveau que les lames, comme un cadre de finition';
  lamePlatCb.addEventListener('change', ()=>{ ctx.pushHistory(); c.avecLamePlat=lamePlatCb.checked; ctx.refreshTerrasseView(); });
  addRow('Planche plate — bordure HORIZONTALE', lamePlatCb,
    'cadre pose a plat au niveau des lames, sur tout le tour' +
    (c.avecLamePlat ? ' — le champ de lames se retrecit d\'autant' : ''));

  // Un equipement lourd sur plots : on laisse passer, mais on dit clairement pourquoi c'est
  // douteux. Un plot n'est pas ancre et reporte sur une assise qui peut tasser
  // differentiellement ; le metier met la charge sur sa propre dalle et construit autour.
  const avert = document.getElementById('terrasseAvertBox');
  if(avert){
    avert.innerHTML = '';
    if(plots && visSpa){
      const d = document.createElement('div');
      d.className = 'hint';
      d.style.cssText = 'border-left:3px solid #A8442F; padding-left:12px;';
      d.innerHTML = '<b>⚠ Equipement lourd sur plots' +
        (nomsEquip ? ' — ' + nomsEquip : '') + '.</b> Les ' + visSpa + ' appuis de la zone sont ' +
        'resserres comme en mode vis, mais un plot n\'est pas ancre et reporte sa charge sur une ' +
        'assise qui peut tasser de facon differentielle. Un spa rempli et occupe, c\'est 1,5 a 2 t ' +
        'sur 3 a 4 m², et une cuve ou un bac maconne sont du meme ordre. <b>La solution du metier ' +
        'est une dalle beton dediee</b>, fondee pour elle-meme, le platelage etant construit ' +
        'autour. Le chiffrage ci-dessous decrit un ouvrage que je ne recommande pas en l\'etat.';
      avert.appendChild(d);
    }
    if(plots && (c.hauteurPlot||10) > PLOT_HAUTEUR_DTU_CM){
      const d = document.createElement('div');
      d.className = 'hint';
      d.style.cssText = 'border-left:3px solid #A8442F; padding-left:12px;';
      d.textContent = 'Hauteur de plot ' + (c.hauteurPlot||10) + ' cm : au-dela de ' +
        PLOT_HAUTEUR_DTU_CM + ' cm le plot reglable sort du domaine du NF DTU 51.4' +
        ((c.hauteurPlot||10) > PLOT_HAUTEUR_MAX_CM
          ? ', et au-dela d\'1 m c\'est le platelage entier qui en sort.' : '.');
      avert.appendChild(d);
    }
    // Une tete qui depasse trop transforme la vis en poteau : la charge n'arrive plus dans l'axe
    // du sol mais au bout d'un bras de levier, et c'est le sol autour du fut qui encaisse.
    if(!plots && (c.depassementVis||0) > VIS_DEPASSEMENT_USUEL_CM){
      const dep = c.depassementVis||0;
      const d = document.createElement('div');
      d.className = 'hint';
      d.style.cssText = 'border-left:3px solid #A8442F; padding-left:12px;';
      d.textContent = 'Depassement de tete ' + dep + ' cm : au-dela de ' + VIS_DEPASSEMENT_USUEL_CM +
        ' cm on sort de la course des tetes reglables du commerce' +
        (dep > VIS_DEPASSEMENT_MAX_CM
          ? ', et a ' + dep + ' cm ce n\'est plus une tete mais un poteau : il faut alors un ' +
            'contreventement et une verification du moment en pied, que ce calcul ne couvre pas.'
          : ', et la longueur enterree doit rester nettement superieure a la partie hors sol.');
      avert.appendChild(d);
    }
  }

  renderParametresCalcul(obj, ctx);
}

export function renderParametresCalcul(obj, ctx){
  const c = ensureConstruction(obj);
  const host = document.getElementById('terrasseParamsBox');
  if(!host) return;
  host.innerHTML = '';

  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Parametre</th><th>Role</th><th>Valeur</th>';
  tbl.appendChild(head);
  const row = (label, note, el) => {
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=label;
    const td1=document.createElement('td'); td1.textContent=note;
    td1.style.cssText='font-size:0.8rem; color:var(--ink-soft);';
    const td2=document.createElement('td');
    if(typeof el === 'string'){ td2.textContent = el; td2.style.cssText='font-variant-numeric:tabular-nums;'; }
    else td2.appendChild(el);
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
    tbl.appendChild(tr);
  };
  const num = (val, step, min, apply) => {
    const i=document.createElement('input'); i.type='number'; i.step=step; i.min=min; i.value=val;
    i.addEventListener('change', ()=>{ ctx.pushHistory(); apply(parseFloat(i.value)); ctx.refreshTerrasseView(); });
    return i;
  };

  row('K portee', 'portee = K · h · (b/entraxe)^⅓ · (250/charge)^⅓ — cale sur NF DTU 51.4',
      num(c.kPortee, '0.1', '5', v=>c.kPortee = v || PORTEE_VIS_K));
  row('K entraxe lame', 'ecartement des appuis = K × epaisseur de lame',
      num(c.kEntraxeLame, '0.5', '5', v=>c.kEntraxeLame = v || ENTRAXE_LAME_K));
  row('Charge de reference', 'charge sur laquelle K portee est cale, sert de base au rapport de charges',
      CHARGE_REF + ' kg/m²');
  row('Jeu entre lames', 'ajoute a la largeur de lame pour l\'espacement du platelage',
      num(c.jeuLames, '1', '0', v=>c.jeuLames = (v===undefined||isNaN(v)) ? 6 : v));
  row('Longueurs achetables', 'se reglent au-dessus de chaque tableau de debit, onglet BOM',
      'lames ' + longueursDispo(c).join(' / ') + '  ·  bois ' + longueursBois(c).join(' / ') +
      (sectionLambourde(c)!==c.soliveSection ? '  ·  lambourdes ' + longueursLambourde(c).join(' / ') : ''));

  const jointBoisCb = document.createElement('input'); jointBoisCb.type='checkbox';
  jointBoisCb.checked = c.jointsBoisSurAppui !== false;
  jointBoisCb.title = 'Impose qu\'une abouture de poutre repose sur un appui, vis ou plot';
  jointBoisCb.addEventListener('change', ()=>{ ctx.pushHistory(); c.jointsBoisSurAppui = jointBoisCb.checked; ctx.refreshTerrasseView(); });
  row('Aboutures bois sur appui', 'une abouture de poutre doit reposer sur un appui', jointBoisCb);
  row('Chute minimale reutilisable', 'en dessous, une chute part au rebut au lieu de resservir (cm)',
      num(c.chuteMinReutilisable, '5', '0', v=>c.chuteMinReutilisable = (v===undefined||isNaN(v)) ? 50 : v));
  const jointCb = document.createElement('input'); jointCb.type='checkbox'; jointCb.checked = c.jointsSurAppui !== false;
  jointCb.title = 'Impose que chaque about entre deux lames tombe sur une lambourde ou une solive';
  jointCb.addEventListener('change', ()=>{ ctx.pushHistory(); c.jointsSurAppui = jointCb.checked; ctx.refreshTerrasseView(); });
  row('Joints sur appui', 'un about de lame doit reposer sur une piece, pas dans le vide', jointCb);
  row('Epaisseur lame de rive', 'epaisseur de l\'habillage peripherique (mm)',
      num(c.epaisseurLameRive, '1', '5', v=>c.epaisseurLameRive = v || 22));
  row('Coefficients raideur par essence', 'valeur par defaut du coefficient ci-dessus',
      Object.keys(LAME_RAIDEUR).map(k=>k.replace('-classe4','')+' ' + LAME_RAIDEUR[k].toFixed(2)).join(' · '));
  row('Sections de solive', 'largeur × hauteur en mm, posee sur chant',
      SOLIVE_SECTIONS.map(s=>s+' ('+SOLIVE_SECTION_DIMS[s].b+'×'+SOLIVE_SECTION_DIMS[s].h+')').join(' · '));
  row('Bornes de portee', 'la portee calculee est bridee a cet intervalle', '50 a 250 cm');
  row('Bornes entraxe lame', 'l\'ecartement des appuis est bride a cet intervalle', '30 a 55 cm');
  const surPlots = estPlots(c);
  row('Fusion des appuis', 'deux appuis plus proches que ca n\'en font qu\'un (10 cm en rive)',
      Math.round(Math.min(0.35, porteeVisSpaM(c)*0.45)*100) + ' cm');
  row('Axe du cadre', 'rentre d\'une demi-section pour affleurer le bord',
      (dimsSection(surPlots && !c.plotAvecSolives ? sectionLambourde(c) : c.soliveSection).b/2) + ' mm');
  // Chaque mode ne montre que ses propres tarifs : afficher la fourchette des vis a quelqu'un
  // qui pose sur plots n'a aucun sens, et l'inverse non plus.
  if(surPlots){
    row('Plafond d\'entraxe des plots', 'NF DTU 51.4, appuis sous lambourdes',
        Math.round(PLOT_ENTRAXE_MAX_M*100) + ' cm');
    row('Domaine d\'emploi', 'plot reglable / hauteur du platelage au-dessus du support',
        PLOT_HAUTEUR_DTU_CM + ' cm / ' + PLOT_HAUTEUR_MAX_CM + ' cm');
    row('Prix indicatifs', 'utilises tant qu\'aucun prix reel n\'est saisi',
        'plots ' + PLOT_MODELES[0].prix.toFixed(2) + '-' + PLOT_MODELES[PLOT_MODELES.length-1].prix.toFixed(2) +
        ' €/u · bois ' + SOLIVE_PRICE.bas + '-' + SOLIVE_PRICE.haut + ' €/ml · geotextile ' +
        GEOTEXTILE_PRICE.bas + '-' + GEOTEXTILE_PRICE.haut + ' €/m² · concasse ' +
        CONCASSE_PRICE.bas + '-' + CONCASSE_PRICE.haut + ' €/m³ · dalle stab ' +
        DALLE_STAB_PRICE.bas + '-' + DALLE_STAB_PRICE.haut + ' €/u');
  } else {
    row('Course de tete reglable', 'depassement hors sol usuel / limite au-dela de laquelle la vis devient un poteau',
        VIS_DEPASSEMENT_USUEL_CM + ' cm / ' + VIS_DEPASSEMENT_MAX_CM + ' cm');
    row('Prix indicatifs', 'utilises tant qu\'aucun prix reel n\'est saisi',
        'vis ' + VIS_PRICE.bas + '-' + VIS_PRICE.haut + ' €/u · bois ' + SOLIVE_PRICE.bas + '-' +
        SOLIVE_PRICE.haut + ' €/ml · visserie ' + VISSERIE_PRICE.bas + '-' + VISSERIE_PRICE.haut +
        ' €/m² · rive ' + LAME_RIVE_PRICE.bas + '-' + LAME_RIVE_PRICE.haut + ' €/ml');
  }
  host.appendChild(tbl);
}

export function renderTerrasseCoupe(obj, ctx){
  const c = ensureConstruction(obj);
  const wrap = document.getElementById('terrasseCoupeWrap');
  wrap.innerHTML = '';

  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const soliveDims = (c.soliveSection||'45x70').split('x').map(n=>parseInt(n,10)||0);
  const soliveH = plotSimple ? 0 : (soliveDims[1]||70);
  // Hauteur de l'appui AU-DESSUS du sol : pour une vis, son seul depassement de tete.
  const hauteurVisMm = ctx.hauteurAppuiMm(c);
  // Ce qui descend SOUS le sol : la vis dans le sol, ou l'assise sous les plots.
  const enterreMm = estPlots(c) ? 0 : (c.hauteurVis||40)*10;
  const lambourdeH = (c.avecLambourde || estPlots(c)) ? dimsSection(sectionLambourde(c)).h : 0;
  const lameH = c.epaisseurLame||25;
  // L'assise n'existe que sur plots, et se dessine sous le niveau du sol fini.
  const assiseH = estPlots(c) && (SUPPORT_TYPES[c.supportType]||{}).concasse
    ? (c.supportDecaissement||15)*10 : 0;
  const totalH = ctx.hauteurFinieMm(obj);   // meme definition que celle affichee au selecteur

  // Il faut de la place SOUS la ligne de sol : la vis y descend, l'assise aussi.
  const scalePx = 2; // px per mm
  const sousSolMm = Math.max(enterreMm, assiseH);
  const svgW = 260, svgH = Math.max(160, (totalH + sousSolMm)*scalePx + 50);
  const groundY = svgH - 26 - sousSolMm*scalePx;

  const nsv = document.createElementNS(svgNS,'svg');
  nsv.setAttribute('width', String(svgW)); nsv.setAttribute('height', String(svgH));
  nsv.setAttribute('viewBox', '0 0 '+svgW+' '+svgH);

  function band(y0mm, hmm, color, label){
    const y = groundY - (y0mm+hmm)*scalePx;
    const h = Math.max(hmm*scalePx, 2);
    const r = document.createElementNS(svgNS,'rect');
    r.setAttribute('x', '40'); r.setAttribute('y', String(y)); r.setAttribute('width', '60'); r.setAttribute('height', String(h));
    r.setAttribute('fill', color); r.setAttribute('stroke','#3B2E1F'); r.setAttribute('stroke-width','1');
    nsv.appendChild(r);
    const t = document.createElementNS(svgNS,'text');
    t.setAttribute('x', '108'); t.setAttribute('y', String(y+h/2+4)); t.setAttribute('font-size','11'); t.setAttribute('fill','#3B2E1F');
    t.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
    t.textContent = label;
    nsv.appendChild(t);
  }

  const ground = document.createElementNS(svgNS,'line');
  ground.setAttribute('x1','10'); ground.setAttribute('x2', String(svgW-10)); ground.setAttribute('y1', String(groundY)); ground.setAttribute('y2', String(groundY));
  ground.setAttribute('stroke', '#4A6B32'); ground.setAttribute('stroke-width','3');
  nsv.appendChild(ground);
  const groundLabel = document.createElementNS(svgNS,'text');
  groundLabel.setAttribute('x','10'); groundLabel.setAttribute('y', String(groundY+15)); groundLabel.setAttribute('font-size','10'); groundLabel.setAttribute('fill','#4A6B32');
  groundLabel.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
  groundLabel.textContent = 'Sol';
  nsv.appendChild(groundLabel);

  // L'assise : la couche que le mode vis n'a pas, parce que la vis fait sa propre fondation.
  if(assiseH > 0){
    const a = document.createElementNS(svgNS,'rect');
    a.setAttribute('x', '40'); a.setAttribute('y', String(groundY));
    a.setAttribute('width', '60'); a.setAttribute('height', String(Math.max(assiseH*scalePx, 3)));
    a.setAttribute('fill','#9aa6b0'); a.setAttribute('stroke','#3B2E1F'); a.setAttribute('stroke-width','1');
    nsv.appendChild(a);
    const al = document.createElementNS(svgNS,'text');
    al.setAttribute('x', '108'); al.setAttribute('y', String(groundY + Math.max(assiseH*scalePx,3)/2 + 4));
    al.setAttribute('font-size','11'); al.setAttribute('fill','#3B2E1F');
    al.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
    al.textContent = 'Concasse compacte — '+(c.supportDecaissement||15)+' cm';
    nsv.appendChild(al);
  }

  // Le plot se dresse au-dessus du sol ; la vis descend dessous et ne montre que sa tete reglable.
  // Deux sens opposes, donc des rectangles de part et d'autre de la ligne de sol.
  function appuiRect(x, yTopPx, hPx, w, fill){
    const r = document.createElementNS(svgNS,'rect');
    r.setAttribute('x', x); r.setAttribute('y', yTopPx);
    r.setAttribute('width', w); r.setAttribute('height', hPx);
    r.setAttribute('fill', fill); r.setAttribute('stroke','#3B2E1F');
    nsv.appendChild(r);
  }
  function appuiLabel(yPx, txt){
    const t = document.createElementNS(svgNS,'text');
    t.setAttribute('x', '108'); t.setAttribute('y', String(yPx+4));
    t.setAttribute('font-size','11'); t.setAttribute('fill','#3B2E1F');
    t.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
    t.textContent = txt;
    nsv.appendChild(t);
  }
  if(estPlots(c)){
    const hPx = Math.max(hauteurVisMm*scalePx, 2);
    appuiRect(60, groundY - hPx, hPx, 20, '#6E7A84');
    appuiLabel(groundY - hPx/2, 'Plot — '+(c.hauteurPlot||10)+' cm ('+plotModele(c).label+')');
  } else {
    const basPx = Math.max(enterreMm*scalePx, 2);
    appuiRect(64, groundY, basPx, 12, '#8A96A8');
    appuiLabel(groundY + basPx/2, 'Vis de fondation — '+c.hauteurVis+' cm dans le sol');
    // La tete reglable est la seule partie hors sol, et donc la seule qui souleve la structure.
    // Dessinee plus large que le fut : c'est la platine qui recoit la solive.
    if(hauteurVisMm > 0){
      const tetePx = Math.max(hauteurVisMm*scalePx, 2);
      appuiRect(62, groundY - tetePx, tetePx, 16, '#B8C2CE');
      appuiLabel(groundY - tetePx/2, 'Tete reglable — '+(c.depassementVis||0)+' cm hors sol');
    }
  }

  let y0 = hauteurVisMm;
  if(soliveH > 0){
    band(y0, soliveH, '#6b4a2a', 'Solive ('+c.soliveSection+' mm)');
    y0 += soliveH;
  }
  if(lambourdeH > 0){
    band(y0, lambourdeH, '#b45a2a', 'Lambourde ('+sectionLambourde(c)+' mm)');
    y0 += lambourdeH;
  }
  band(y0, lameH, '#c9a15a', 'Lame — '+lameH+' mm');

  wrap.appendChild(nsv);
}

export function renderImplantation(obj, ctx){
  const host = document.getElementById('terrasseImplantWrap');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  if(!obj.pts || obj.pts.length<3){ host.innerHTML = '<div class="hint">Terrasse invalide.</div>'; return; }
  const layers = computeTerrasseLayers(obj, ctx.objets());
  const I = computeImplantation(obj, layers);
  const ech = ECHELLES.includes(c.echelleImplant) ? c.echelleImplant : 200;
  const mm = m => m*1000/ech;                       // metres reels -> mm sur le papier
  const marge = 18;                                  // mm, place pour les cotes
  const W = mm(I.bbox.x1-I.bbox.x0) + marge*2;
  const H = mm(I.bbox.y1-I.bbox.y0) + marge*2;
  const P = p => ({ x: marge + mm(p.x-I.bbox.x0), y: marge + mm(p.y-I.bbox.y0) });
  const nom = estPlots(c) ? 'plots' : 'vis';

  // ---- barre de reglage ----
  const barre = document.createElement('div');
  barre.className = 'controls';
  const lab = document.createElement('label');
  lab.textContent = 'Echelle : '; lab.style.marginRight='5px'; lab.style.fontSize='0.88rem';
  const sel = document.createElement('select');
  ECHELLES.forEach(e=>{ const o=document.createElement('option'); o.value=String(e); o.textContent='1/'+e;
    if(e===ech) o.selected=true; sel.appendChild(o); });
  sel.addEventListener('change', ()=>{ ctx.pushHistory(); c.echelleImplant = parseInt(sel.value,10)||200; ctx.refreshTerrasseView(); });
  barre.appendChild(lab); barre.appendChild(sel);
  const btn = document.createElement('button');
  btn.className='objbtn'; btn.textContent='Imprimer le plan'; btn.style.marginLeft='14px';
  barre.appendChild(btn);
  const taille = document.createElement('span');
  taille.style.cssText = 'margin-left:14px; font-size:0.84rem; color:var(--ink-soft);';
  taille.textContent = 'sur papier : ' + W.toFixed(0) + ' × ' + H.toFixed(0) + ' mm' +
    (W>287||H>200 ? (W>410||H>287 ? ' — depasse l\'A3' : ' — tient en A3 paysage') : ' — tient en A4 paysage');
  barre.appendChild(taille);
  host.appendChild(barre);

  // ---- le plan ----
  const s = document.createElementNS(svgNS,'svg');
  s.setAttribute('width', W+'mm'); s.setAttribute('height', H+'mm');
  s.setAttribute('viewBox', '0 0 '+W+' '+H);
  s.style.cssText = 'background:#fff; border:1px solid var(--rule,#ccc); max-width:100%;';
  const el = (t,at)=>{ const e=document.createElementNS(svgNS,t);
    Object.keys(at).forEach(k=>e.setAttribute(k,at[k])); return e; };
  const txt = (x,y,t,size?,fill?,anchor?)=>{ const e=el('text',{x,y,'font-size':size||2.2,
    fill:fill||'#111','font-family':"'Helvetica Neue',Arial,sans-serif",
    'text-anchor':anchor||'start'}); e.textContent=t; return e; };

  // contour
  s.appendChild(el('polygon',{ points:I.sommets.map(v=>{const q=P(v);return q.x+','+q.y;}).join(' '),
    fill:'#fafafa', stroke:'#111', 'stroke-width':0.5 }));

  // lignes porteuses : c'est sur elles qu'on tend les cordeaux
  const porteuses = (layers.solives.length ? layers.solives : layers.lambourdes);
  porteuses.forEach(seg=>{
    const a=P(I.R.vers(seg.a)), b=P(I.R.vers(seg.b));
    s.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#9aa6b0','stroke-width':0.25,'stroke-dasharray':'2 1.5'}));
  });

  // diagonales de controle
  I.diagonales.forEach(d=>{
    const a=P(I.sommets[d.de]), b=P(I.sommets[d.a]);
    s.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#c0392b','stroke-width':0.25,'stroke-dasharray':'3 2'}));
    s.appendChild(txt((a.x+b.x)/2, (a.y+b.y)/2-0.8, d.d.toFixed(3)+' m', 2, '#c0392b','middle'));
  });

  // cotes du contour, cote par cote
  I.sommets.forEach((v,i)=>{
    const w = I.sommets[(i+1)%I.sommets.length];
    const a=P(v), b=P(w);
    const L = dist(obj.pts[i], obj.pts[(i+1)%obj.pts.length]);
    const ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI;
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const t = txt(0,-1.2, L.toFixed(3)+' m', 2.4, '#111','middle');
    t.setAttribute('transform','translate('+mx+','+my+') rotate('+(ang>90||ang<-90?ang+180:ang)+')');
    s.appendChild(t);
  });

  // appuis numerotes
  const COUL = { rive:'#0f3d49', spa:'#a8452a', courant:'#235e6e' };
  I.appuis.forEach(a=>{
    const q = P(a);
    s.appendChild(el('circle',{cx:q.x,cy:q.y,r:ech<=50?1.6:1.0,
      fill:COUL[a.role]||'#235e6e',stroke:'#fff','stroke-width':0.2}));
    if(ech<=100) s.appendChild(txt(q.x, q.y-2.0, String(a.n), ech<=50?2.0:1.5, '#111','middle'));
  });

  // repere et axes de tracage
  const O = P({x:0,y:0});
  s.appendChild(el('circle',{cx:O.x,cy:O.y,r:1.8,fill:'none',stroke:'#c0392b','stroke-width':0.5}));
  s.appendChild(el('line',{x1:O.x,y1:O.y,x2:O.x+mm(I.R.longueurCote),y2:O.y,stroke:'#c0392b','stroke-width':0.4}));
  s.appendChild(txt(O.x-2.5, O.y+3.5, 'R', 3, '#c0392b'));
  s.appendChild(txt(O.x+mm(I.R.longueurCote)/2, O.y-2.5, 'cordeau X — cote '+(I.R.cote+1), 2.2, '#c0392b','middle'));

  // echelle graphique : le controle qui dit si l'impression a ete mise a l'echelle
  const yE = H-6, xE = marge;
  s.appendChild(el('line',{x1:xE,y1:yE,x2:xE+mm(1),y2:yE,stroke:'#111','stroke-width':0.6}));
  s.appendChild(el('line',{x1:xE,y1:yE-1,x2:xE,y2:yE+1,stroke:'#111','stroke-width':0.4}));
  s.appendChild(el('line',{x1:xE+mm(1),y1:yE-1,x2:xE+mm(1),y2:yE+1,stroke:'#111','stroke-width':0.4}));
  s.appendChild(txt(xE+mm(1)+1.5, yE+0.8, '1 m — echelle 1/'+ech, 2.4, '#111'));
  host.appendChild(s);

  const scaleHint = Object.assign(document.createElement('div'), { className:'hint',
    textContent: 'Le dessin est en millimetres reels : imprime a 100 % (sans « ajuster a la page »), ' +
      'le segment temoin en bas mesure exactement 1 m a l\'echelle 1/' + ech + '. Verifie-le au ' +
      'double-decimetre avant de tracer. Le repere R est le depart du cote de reference ; les ' +
      'deux cordeaux a tendre en premier sont X le long de ce cote et Y perpendiculaire.' });
  host.appendChild(scaleHint);

  // ---- controle d'equerrage ----
  const tD = document.createElement('table');
  tD.className='attrTable';
  tD.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Controle</th><th>Mesure</th><th>Role</th>' }));
  I.diagonales.forEach(d=>{
    const tr=document.createElement('tr');
    tr.innerHTML = '<td>Diagonale sommet '+(d.de+1)+' → '+(d.a+1)+'</td><td>'+d.d.toFixed(3)+
      ' m</td><td>a mesurer au ruban avant de fixer quoi que ce soit</td>';
    tD.appendChild(tr);
  });
  if(I.diagonales.length===2){
    const ecart = Math.abs(I.diagonales[0].d - I.diagonales[1].d);
    const tr=document.createElement('tr');
    tr.style.fontWeight='600';
    tr.innerHTML = '<td>Ecart entre diagonales</td><td>'+(ecart*1000).toFixed(0)+' mm</td>'+
      '<td>'+(ecart<0.005 ? 'contour d\'equerre' : 'contour non rectangle — normal si la forme ne l\'est pas')+'</td>';
    tD.appendChild(tr);
  }
  const titreEquerrage = Object.assign(document.createElement('div'),
    { className:'sectionTitle', textContent:'Controle d\'equerrage', style:'margin-top:18px;' });
  host.appendChild(titreEquerrage);
  host.appendChild(tD);

  // ---- coordonnees, par rangee ----
  const titrePieces = Object.assign(document.createElement('div'),
    { className:'sectionTitle', textContent:'Implantation des '+nom+' — pièce par pièce', style:'margin-top:18px;' });
  host.appendChild(titrePieces);
  const pieceHint = Object.assign(document.createElement('div'), { className:'hint',
    textContent: 'Une pièce = un cordeau. On materialise la piece entre ses deux extremites ' +
      '(coordonnees X/Y depuis le repere R), puis on marque ses appuis au ruban le long d\'elle. ' +
      I.appuis.length + ' ' + nom + ' repartis sur ' + I.lignes.length + ' pieces.' });
  host.appendChild(pieceHint);
  const tR = document.createElement('table');
  tR.className='attrTable';
  tR.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Piece</th><th>Depart X / Y</th><th>Fin X / Y</th><th>Nb</th>' +
                '<th>Appuis, distance depuis le depart (m)</th>' }));
  I.lignes.forEach(l=>{
    const tr=document.createElement('tr');
    const cell=t=>{const td=document.createElement('td'); td.textContent=t; return td;};
    const nb=t=>{const td=cell(t); td.style.cssText='font-variant-numeric:tabular-nums;'; return td;};
    tr.appendChild(cell(l.ref + ' — ' + l.type));
    tr.appendChild(nb(l.depart.x.toFixed(3) + ' / ' + l.depart.y.toFixed(3)));
    tr.appendChild(nb(l.fin.x.toFixed(3) + ' / ' + l.fin.y.toFixed(3)));
    tr.appendChild(cell(String(l.appuis.length)));
    const tdD=cell(l.appuis.map(a=>a.d.toFixed(3)).join('  ·  '));
    tdD.style.cssText='font-variant-numeric:tabular-nums; font-size:0.84rem;';
    tr.appendChild(tdD);
    tR.appendChild(tr);
  });
  host.appendChild(tR);

  // ---- sommets ----
  const titreSommets = Object.assign(document.createElement('div'),
    { className:'sectionTitle', textContent:'Sommets du contour', style:'margin-top:18px;' });
  host.appendChild(titreSommets);
  const tS = document.createElement('table');
  tS.className='attrTable';
  tS.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Sommet</th><th>X (m)</th><th>Y (m)</th><th>Cote suivant (m)</th>' }));
  I.sommets.forEach((v,i)=>{
    const tr=document.createElement('tr');
    const L = dist(obj.pts[i], obj.pts[(i+1)%obj.pts.length]);
    tr.innerHTML = '<td>'+(i+1)+(i===I.R.cote?' (repere R)':'')+'</td><td>'+v.x.toFixed(3)+
      '</td><td>'+v.y.toFixed(3)+'</td><td>'+L.toFixed(3)+'</td>';
    tS.appendChild(tr);
  });
  host.appendChild(tS);

  // Impression : une fenetre autonome, pour ne pas dependre de la mise en page de l'appli. Le
  // plan seul ne suffit pas sur le chantier : les tableaux (equerrage, coordonnees piece par
  // piece, sommets) portent les chiffres a reporter au ruban, donc ils s'impriment SOUS le plan,
  // pas seulement affiches a l'ecran.
  btn.addEventListener('click', ()=>{
    const w = window.open('', '_blank');
    if(!w){ showToast('Autorise les fenetres pop-up pour imprimer le plan.'); return; }
    w.document.write('<!doctype html><meta charset="utf-8"><title>Implantation — '+
      escapeHtml(obj.name||'terrasse')+' — 1/'+ech+'</title>' +
      '<style>@page{margin:10mm} body{margin:0;font-family:Arial,sans-serif;font-size:10pt}' +
      'h1{font-size:12pt;margin:0 0 4mm}' +
      '.hint{color:#555;font-size:9pt;margin:3mm 0}' +
      '.sectionTitle{font-weight:600;font-size:10.5pt;margin:6mm 0 2mm;page-break-after:avoid}' +
      'table{border-collapse:collapse;width:100%;margin-bottom:2mm}' +
      'th,td{border:1px solid #999;padding:1.2mm 2mm;text-align:left;font-size:8.5pt}' +
      'th{background:#eee}' +
      'table{page-break-inside:auto} tr{page-break-inside:avoid}</style>' +
      '<h1>Implantation '+escapeHtml(nom)+' — '+escapeHtml(obj.name||'terrasse')+' — echelle 1/'+ech+
      ' — imprimer a 100 %</h1>' + s.outerHTML +
      scaleHint.outerHTML + titreEquerrage.outerHTML + tD.outerHTML +
      titrePieces.outerHTML + pieceHint.outerHTML + tR.outerHTML +
      titreSommets.outerHTML + tS.outerHTML);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(), 300);
  });
}

export function renderChantier(obj, ctx){
  const host = document.getElementById('terrasseChantierWrap');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  if(!obj.pts || obj.pts.length<3){ host.innerHTML = '<div class="hint">Terrasse invalide.</div>'; return; }
  const layers = computeTerrasseLayers(obj, ctx.objets());
  const ch = computeChantier(obj, layers);
  const equipe = Math.max(1, Math.round(c.equipe||2));
  const hJour = Math.max(1, c.heuresJour||7);
  const jours = ch.total/(equipe*hJour);

  const intro = document.createElement('div');
  intro.className = 'hint';
  intro.textContent = 'Toutes les activites necessaires a cette terrasse, dans l\'ordre du chantier. ' +
    'Les quantites viennent du projet — nombre d\'appuis, metres de bois, barres a debiter, m³ ' +
    'de concasse — et les cadences sont reglables ligne par ligne. Main-d\'oeuvre seule : ni ' +
    'livraison, ni prise de rendez-vous, ni sechage.';
  host.appendChild(intro);

  const barre = document.createElement('div');
  barre.className = 'controls';
  const mk = (lbl, val, step, min, apply) => {
    const w=document.createElement('span'); w.style.cssText='margin-right:18px; font-size:0.88rem;';
    const l=document.createElement('label'); l.textContent=lbl+' : '; l.style.marginRight='5px';
    const i=document.createElement('input'); i.type='number'; i.step=step; i.min=min; i.value=val; i.style.width='70px';
    i.addEventListener('change', ()=>{ apply(parseFloat(i.value)); ctx.refreshTerrasseView(); });
    w.appendChild(l); w.appendChild(i); return w;
  };
  barre.appendChild(mk('Equipe (personnes)', equipe, '1', '1', v=>c.equipe = (isNaN(v)||v<1)?2:Math.round(v)));
  barre.appendChild(mk('Heures par jour', hJour, '0.5', '1', v=>c.heuresJour = (isNaN(v)||v<1)?7:v));
  host.appendChild(barre);

  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  tbl.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Activite</th><th>Quantite</th><th>Cadence</th><th>Duree</th><th>Part</th>' }));
  CHANTIER_PHASES.forEach(phase=>{
    const lignes = ch.lignes.filter(l=>l.phase===phase);
    if(!lignes.length) return;
    const hPhase = lignes.reduce((s,l)=>s+l.heures,0);
    const trP = document.createElement('tr');
    trP.style.cssText = 'font-weight:600; background:var(--accent-light);';
    trP.innerHTML = '<td>' + phase + '</td><td></td><td></td><td>' + hPhase.toFixed(1) +
      ' h</td><td>' + (100*hPhase/(ch.total||1)).toFixed(0) + ' %</td>';
    tbl.appendChild(trP);
    lignes.forEach(l=>{
      const tr = document.createElement('tr');
      const cell = t => { const td=document.createElement('td'); td.textContent=t; return td; };
      const td0 = cell('　' + l.label);
      if(ch.dominant && l.cle===ch.dominant.cle) td0.style.fontWeight='600';
      tr.appendChild(td0);
      tr.appendChild(cell(l.qte.toFixed(l.unite==='u'?0:2) + ' ' + l.unite));
      const tdC = document.createElement('td');
      const inp = document.createElement('input');
      inp.type='number'; inp.step='0.01'; inp.min='0'; inp.style.width='80px';
      inp.value = l.cadence.toFixed(2);
      inp.title = 'Heures par ' + l.unite;
      inp.addEventListener('change', ()=>{
        const v = parseFloat(inp.value);
        if(isNaN(v)||v<0) delete c.cadences[l.cle]; else c.cadences[l.cle] = v;
        ctx.refreshTerrasseView();
      });
      tdC.appendChild(inp);
      const u=document.createElement('span'); u.textContent=' h/'+l.unite;
      u.style.cssText='font-size:0.78rem; color:var(--ink-soft);'; tdC.appendChild(u);
      tr.appendChild(tdC);
      const tdH = cell(l.heures.toFixed(1) + ' h');
      tdH.style.cssText = 'font-variant-numeric:tabular-nums;';
      tr.appendChild(tdH);
      tr.appendChild(cell((100*l.heures/(ch.total||1)).toFixed(0) + ' %'));
      tbl.appendChild(tr);
    });
  });
  const tot = document.createElement('tr');
  tot.style.fontWeight = '700';
  tot.innerHTML = '<td>Total main-d\'oeuvre</td><td>' + ch.surf.toFixed(2) + ' m²</td><td></td><td>' +
    ch.total.toFixed(1) + ' h</td><td>100 %</td>';
  tbl.appendChild(tot);
  host.appendChild(tbl);

  const bilan = document.createElement('div');
  bilan.className = 'hint';
  bilan.innerHTML = '<b>' + ch.total.toFixed(0) + ' heures</b> au total, soit <b>' +
    jours.toFixed(1) + ' jours</b> a ' + equipe + ' personne' + (equipe>1?'s':'') + ' sur ' +
    hJour + ' h — et ' + (ch.total/ch.surf).toFixed(1) + ' h/m².' +
    (ch.dominant ? ' Le poste le plus lourd est <b>' + ch.dominant.label.toLowerCase() + '</b> (' +
      ch.dominant.heures.toFixed(1) + ' h, ' + (100*ch.dominant.heures/ch.total).toFixed(0) +
      ' % du chantier) : c\'est lui qu\'il faut attaquer pour raccourcir.' : '');
  host.appendChild(bilan);

  if(!estPlots(c) && ch.nbAppuis > 0){
    const cmp = document.createElement('div');
    cmp.className = 'hint';
    cmp.textContent = 'A titre de comparaison, poser un plot prend environ ' +
      CADENCES.posePlots.h.toFixed(2) + ' h contre ' + CADENCES.vissage.h.toFixed(2) +
      ' h pour visser une vis de fondation — mais il en faut trois a quatre fois plus, et il ' +
      'faut prealablement realiser l\'assise. Le mode de pose se decide sur le sol et le budget, ' +
      'pas sur la duree seule.';
    host.appendChild(cmp);
  }
}

export function renderMethode(obj, ctx){
  const host = document.getElementById('terrasseMethodeWrap');
  if(!host) return;
  const c = ensureConstruction(obj);

  // The tables are generated with the project's own calibration, so they show what this plan
  // actually uses rather than the factory defaults.
  const cal = e => ({ soliveSection:'', soliveEntraxe:e, kPortee:c.kPortee, chargeNormale:c.chargeNormale });
  const sectionRows = SOLIVE_SECTIONS.map(s=>{
    const d = SOLIVE_SECTION_DIMS[s];
    const p40 = Math.round(maxPorteeVisM({...cal(40), soliveSection:s})*100);
    const p50 = Math.round(maxPorteeVisM({...cal(50), soliveSection:s})*100);
    const p70 = Math.round(maxPorteeVisM({...cal(70), soliveSection:s})*100);
    return '<tr><td>' + s + ' mm</td><td>' + d.b + ' × ' + d.h + '</td><td>' + p40 +
           ' cm</td><td>' + p50 + ' cm</td><td>' + p70 + ' cm</td></tr>';
  }).join('');

  const lameRows = [19,21,22,24,25,27,28].map(ep=>{
    const K = c.kEntraxeLame;
    const bois = maxEntraxeLameCm({epaisseurLame:ep, essenceBois:'pin-classe4', kEntraxeLame:K});
    const compo = maxEntraxeLameCm({epaisseurLame:ep, essenceBois:'composite', kEntraxeLame:K});
    const exo = maxEntraxeLameCm({epaisseurLame:ep, essenceBois:'exotique', kEntraxeLame:K});
    return '<tr><td>' + ep + ' mm</td><td>' + bois + ' cm</td><td>' + exo + ' cm</td><td>' +
           compo + ' cm</td></tr>';
  }).join('');

  const span = porteeVisM(c);
  const ok = obj.pts && obj.pts.length>=3;
  const S = ok ? computeStructure(obj, ctx.objets()) : {cadre:[],solives:[],lambourdes:[],solivesSpa:[]};
  const vis = ok ? buildVisGrid(obj, S, ctx.objets()) : [];
  const roles = {rive:0, courant:0, spa:0};
  vis.forEach(p=>roles[p.role]=(roles[p.role]||0)+1);
  const surf = shoelace(obj.pts) || 1;
  const ml = a => a.reduce((s,l)=>s+dist(l.a,l.b),0);

  host.innerHTML =
  '<div style="max-width:none; line-height:1.55;">' +

  '<div class="hint" style="margin-bottom:14px;"><b>Ce que fait ce calcul, et ce qu\'il ne fait pas.</b> ' +
  'Il s\'agit d\'un pré-dimensionnement destiné à chiffrer et à implanter, calé sur les usages du ' +
  'métier et sur le NF DTU 51.4. Ce n\'est pas une note de calcul : pas de vérification Eurocode 5, ' +
  'pas de prise en compte du fluage réel en classe de service 3, ni du sol sous les vis (qui ' +
  'conditionne leur longueur et leur tenue). Pour une terrasse portée en hauteur, recevant du ' +
  'public, ou fondée sur un sol douteux, il faut une étude.</div>' +

  '<div class="sectionTitle">1. Hypothèses de charge</div>' +
  '<p>La charge d\'exploitation visée est réglable dans l\'onglet Construction. Elle vaut ' +
  'actuellement <b>' + (c.chargeNormale||250) + ' kg/m²</b> en zone courante et <b>' +
  (c.chargeSpa||500) + ' kg/m²</b> en zone d\'équipement. La référence du métier pour une ' +
  'terrasse privative est 250 kg/m² répartis (ou 200 kg ponctuels), et c\'est sur cette valeur ' +
  'que le coefficient du §2 est calé : demander davantage raccourcit la portée admissible dans ' +
  'le rapport (250/charge)<sup>1/3</sup>, même exposant que le reste de la formule.</p>' +
  '<p>Une <b>zone d\'équipement</b> est l\'emprise de tout objet du plan dont la fonction est ' +
  '« équipement », quelle que soit sa forme : spa rond, bain nordique, cuve, bac maçonné, ' +
  'barbecue. Ce n\'est ni son nom ni sa géométrie qui la désigne, mais ce qu\'elle porte. ' +
  'L\'emprise réelle est élargie de la marge réglée dans Construction, puis chaque portion de ' +
  'pièce qui la traverse est redécoupée plus serré. Un spa rempli et occupé pèse 1,5 à 2 t sur ' +
  '3 à 4 m², d\'où l\'ordre de grandeur de 500 kg/m² retenu par défaut. C\'est ce rapport de ' +
  'charges qui resserre les appuis : ' + Math.round(span*100) + ' cm en zone courante contre <b>' +
  Math.round(porteeVisSpaM(c)*100) + ' cm</b> sous l\'équipement.</p>' +

  '<div class="sectionTitle">2. Portée admissible d\'une pièce entre deux appuis</div>' +
  '<p>La flèche d\'une poutre uniformément chargée varie comme <i>5wL⁴/384EI</i>. En plafonnant ' +
  'la flèche à une fraction de la portée, la portée admissible varie comme <i>(EI / charge)</i> ' +
  'puissance 1/3. Avec <i>I = b·h³/12</i> et une charge proportionnelle à l\'entraxe (la largeur ' +
  'de terrasse que la pièce reprend), tout se simplifie en :</p>' +
  '<p style="text-align:center; font-size:1.05rem; margin:10px 0;"><b>portée = K · h · (b / entraxe)<sup>1/3</sup> · (250 / charge)<sup>1/3</sup></b></p>' +
  '<p>La forme est donc dérivée, mais le coefficient <b>K = ' + (c.kPortee||PORTEE_VIS_K) + '</b> (longueurs en mm) ' +
  'est <i>calé</i> sur la pratique plutôt que calculé — ce qui évite d\'avoir à modéliser le fluage, ' +
  'la classe de résistance réelle et les coefficients de sécurité un par un. Deux points de calage, ' +
  'indépendants l\'un de l\'autre, tombent tous deux sur K = ' + PORTEE_VIS_K +
  ' (la valeur par défaut, modifiable dans Construction) :</p>' +
  '<ul><li>un <b>45×70</b> à 70 cm d\'entraxe doit donner les <b>70 cm</b> entre appuis que le ' +
  'NF DTU 51.4 fixe comme plafond pour les lambourdes → le calcul rend ' +
  Math.round(maxPorteeVisM({soliveSection:'45x70', soliveEntraxe:70})*100) + ' cm ;</li>' +
  '<li>un <b>45×145</b> à 70 cm doit donner les <b>1,50 m</b> retenus dans le métier pour une ' +
  'solive sur vis de fondation → le calcul rend 1,50 m.</li></ul>' +
  '<p>Portées obtenues pour les sections proposées :</p>' +
  '<table class="attrTable"><tr><th>Section</th><th>b × h (mm)</th><th>entraxe 40</th>' +
  '<th>entraxe 50</th><th>entraxe 70</th></tr>' + sectionRows + '</table>' +
  '<p class="hint">Le résultat est borné à 2,50 m : au-delà, la pièce n\'est plus une solive de ' +
  'terrasse courante et relève d\'un calcul propre.</p>' +

  '<div class="sectionTitle">3. Écartement maximal des appuis sous les lames</div>' +
  '<p>Le NF DTU 51.4 donne cet écartement en fonction de l\'épaisseur, de la largeur et de la ' +
  'classe de la lame. Sur la plage courante l\'abaque se résume à un rapport quasi constant — ' +
  '22 mm avec 40 cm, 24 mm avec 45 cm, 27 mm avec 50 cm — soit environ ' +
  '<b>' + (c.kEntraxeLame||ENTRAXE_LAME_K) + ' × l\'épaisseur</b>, arrondi à 5 cm, multiplié par un ' +
  'coefficient de raideur propre à la lame. Le composite flue nettement plus (' +
  LAME_RAIDEUR.composite.toFixed(2) + ' par défaut), les bois exotiques denses un peu moins (' +
  LAME_RAIDEUR.exotique.toFixed(2) + '). Ce coefficient est modifiable pour l\'essence ' +
  'sélectionnée dans l\'onglet Construction — il vaut actuellement <b>' +
  coefRaideurLame(c).toFixed(2) + '</b>, soit des appuis à ' + maxEntraxeLameCm(c) + ' cm.</p>' +
  '<table class="attrTable"><tr><th>Épaisseur lame</th><th>Bois résineux</th><th>Exotique</th>' +
  '<th>Composite</th></tr>' + lameRows + '</table>' +
  '<p>C\'est cette limite qui pilote l\'optimisation : elle fixe l\'entraxe de la couche qui porte ' +
  'les lames — les lambourdes s\'il y en a, sinon les solives elles-mêmes.</p>' +

  '<div class="sectionTitle">4. Les deux modes de fondation</div>' +
  '<p><b>Une vis est une fondation. Un plot n\'en est pas une</b> : c\'est un appui posé sur ' +
  'quelque chose qui, lui, doit faire fondation. Toute la différence entre les deux modes découle ' +
  'de cette phrase.</p>' +
  '<table class="attrTable">' +
  '<tr><th></th><th>Vis de fondation</th><th>Plots réglables</th></tr>' +
  '<tr><td>Nature</td><td>Fondation ponctuelle profonde</td><td>Appui posé, reporté sur une assise</td></tr>' +
  '<tr><td>Ancrage</td><td>Compression <b>et</b> arrachement</td><td>Compression seule</td></tr>' +
  '<tr><td>Hors gel</td><td>Par la profondeur</td><td>À assurer par l\'assise</td></tr>' +
  '<tr><td>Portée entre appuis</td><td>Déduite de la section, jusqu\'à 2,50 m</td>' +
  '<td>Plafonnée à <b>' + Math.round(PLOT_ENTRAXE_MAX_M*100) + ' cm</b> quoi qu\'en dise la section</td></tr>' +
  '<tr><td>Densité</td><td>1,0 à 1,5 /m²</td><td>3 à 5 /m²</td></tr>' +
  '<tr><td>Domaine</td><td>Large</td><td>≤ ' + PLOT_HAUTEUR_DTU_CM + ' cm de plot, ≤ 1 m de platelage</td></tr>' +
  '<tr><td>Assise</td><td>Aucune — la vis se fonde seule</td><td>Dalle, ou décaissement + géotextile + concassé</td></tr>' +
  '</table>' +
  '<p><b>Deux topologies sur plots.</b> En <i>pose simple</i>, les lambourdes reposent directement ' +
  'sur les plots et il n\'y a pas de solive ; le cadre devient une lambourde de rive. En ' +
  '<i>structure double</i>, les plots portent des solives et les lambourdes viennent au-dessus : ' +
  'plus de bois, moins de plots. L\'optimiseur compare les deux.</p>' +
  '<p><b>Poinçonnement.</b> Le NF DTU 51.4 demande une surface d\'assise d\'au moins ' +
  PLOT_ASSISE_MIN_CM2 + ' cm² (⌀ 19,5 cm). La charge par plot — charge cible × surface reprise — ' +
  'et la pression correspondante sont affichées dans Construction. Anodin sur une dalle, à ' +
  'regarder de près sur du concassé.</p>' +
  '<p class="hint"><b>Le spa sur plots.</b> Les appuis sont resserrés comme en mode vis, mais un ' +
  'plot n\'est pas ancré et reporte sa charge sur une assise qui peut tasser de façon ' +
  'différentielle. La solution du métier est une dalle béton dédiée, fondée pour elle-même, le ' +
  'platelage étant construit autour. L\'avertissement s\'affiche dans Construction.</p>' +

  '<div class="sectionTitle">5. Les deux structures, et pourquoi elles ne se vissent pas pareil</div>' +
  '<p>Ce ne sont pas deux réglages d\'un même ouvrage, mais <b>deux structures différentes</b>. ' +
  'Le programme calcule donc le réseau de pièces d\'abord, et n\'en déduit les vis qu\'ensuite : ' +
  'une vis n\'est jamais posée ailleurs que sous une pièce réellement dessinée.</p>' +
  '<table class="attrTable">' +
  '<tr><th></th><th>Sans lambourdes</th><th>Avec lambourdes</th></tr>' +
  '<tr><td>Rôle des solives</td><td>Elles portent les lames elles-mêmes</td>' +
  '<td>Poutres primaires, elles portent les lambourdes</td></tr>' +
  '<tr><td>Direction</td><td>Perpendiculaires aux lames</td><td>Parallèles aux lames</td></tr>' +
  '<tr><td>Entraxe</td><td>Imposé par l\'épaisseur de lame (§3)</td>' +
  '<td>Libre, jusqu\'à la portée d\'une lambourde</td></tr>' +
  '<tr><td>Second lit</td><td>—</td><td>Lambourdes ⟂ aux lames, entraxe du §3</td></tr>' +
  '<tr><td>Renfort spa</td><td>Vis resserrées sur les solives en place</td>' +
  '<td>Solives supplémentaires ajoutées dans l\'emprise</td></tr>' +
  '<tr><td>Densité de vis</td><td>Élevée : beaucoup de solives à reprendre</td>' +
  '<td>Faible : peu de poutres, donc peu d\'appuis</td></tr>' +
  '</table>' +
  '<p>Le renfort du spa est le point où les deux divergent vraiment. Quand les solives sont déjà ' +
  'espacées de 40 cm, la surcharge se reprend en <b>resserrant les vis le long de ces solives</b> : ' +
  'le bois est déjà là. Quand ce sont des poutres primaires à deux mètres l\'une de l\'autre, ' +
  'aucune vis semée entre elles ne sert à quoi que ce soit — la zone reçoit ses <b>propres ' +
  'solives</b>, menées de cadre à cadre comme toutes les autres.</p>' +

  '<div class="sectionTitle">6. Le cadre périmétrique</div>' +
  '<p>Les deux ouvrages sont fermés par un <b>cadre</b> — une solive de rive qui suit le contour, ' +
  'axe rentré d\'une demi-section pour que sa face extérieure affleure le bord. Sans lui, la pièce ' +
  'porteuse la plus extérieure tombe où l\'entraxe la laisse tomber, et la rive de la terrasse ' +
  'repose sur rien : c\'est elle qui reçoit la lame de rive et les extrémités de toutes les lames.</p>' +
  '<p>Les solives intérieures sont alors réparties en <b>travées égales d\'un bord à l\'autre</b> ' +
  '(largeur divisée en travées entières ≤ entraxe maximal), et non calées sur le centre de la ' +
  'terrasse. Chaque solive va donc de cadre à cadre.</p>' +
  '<p><b>Conséquence sur les vis :</b> une solive appuyée à ses deux extrémités sur le cadre ' +
  'n\'a besoin de vis intermédiaires que si elle est plus longue que sa portée. C\'est ce qui fait ' +
  'chuter le nombre d\'appuis par rapport à une trame posée a priori.</p>' +
  '<ol>' +
  '<li><b>Cadre.</b> Une vis sous chaque angle, où deux pièces de rive se rejoignent et où la ' +
  'charge se concentre, puis les tronçons subdivisés pour rester dans la portée du §2.</li>' +
  '<li><b>Solives.</b> Extrémités portées par le cadre ; l\'intérieur divisé en travées égales ' +
  'ne dépassant pas la portée.</li>' +
  '<li><b>Zone d\'équipement.</b> Chaque portion de solive traversant l\'emprise est redécoupée ' +
  'à l\'entraxe resserré saisi, en plus des solives ajoutées le cas échéant. Une emprise concave ' +
  '— un bac en L, un muret en U — peut être traversée plusieurs fois par la même pièce : chaque ' +
  'traversée est traitée séparément.</li>' +
  '<li><b>Fusion.</b> Deux vis trop proches n\'en font qu\'une sur le chantier : la plus ' +
  'sollicitée est conservée (équipement, puis rive, puis courante).</li>' +
  '</ol>' +
  '<p><b>Cette terrasse :</b> ' + surf.toFixed(2) + ' m², portée ' + Math.round(span*100) + ' cm → ' +
  '<b>' + vis.length + ' vis</b> (' + roles.rive + ' sous cadre, ' + roles.courant +
  ' sous solives, ' + roles.spa + ' en zone d\'équipement), soit ' + (vis.length/surf).toFixed(2) +
  ' vis/m² au total et ' + ((vis.length-roles.spa)/surf).toFixed(2) + ' vis/m² hors équipement. ' +
  'C\'est ce second chiffre qui se compare à l\'usage du métier, entre 1,0 et 1,5 vis/m². ' +
  'Bois porteur : ' + ml(S.cadre).toFixed(1) + ' ml de cadre, ' + ml(S.solives).toFixed(1) +
  ' ml de solives' + (S.solivesSpa.length ? ' (+ ' + ml(S.solivesSpa).toFixed(1) + ' ml de renfort sous équipement)' : '') +
  (S.lambourdes.length ? ', ' + ml(S.lambourdes).toFixed(1) + ' ml de lambourdes' : '') + '.</p>' +

  '<div class="sectionTitle">7. Débit et prix d\'achat</div>' +
  '<p>Rien n\'est chiffré en surface majorée d\'un pourcentage de chute : tout part du linéaire ' +
  'réellement tracé, découpé dans les longueurs du fournisseur. Deux débits séparés, parce que ' +
  'ce sont deux produits achetés séparément :</p>' +
  '<ul>' +
  '<li><b>Lames</b> — les lames du platelage et la bordure à plat, même produit acheté en même ' +
  'temps, donc un seul débit et une seule ligne au BOM.</li>' +
  '<li><b>Bois porteur</b> — cadre et solives. Les lambourdes les rejoignent tant qu\'elles ' +
  'partagent leur section : même pièce, même commande. Dès que la section diffère, elles ' +
  'deviennent un produit à part et prennent leur propre débit, leurs propres longueurs ' +
  'achetables et leurs propres prix — les mélanger reviendrait à les couper et les chiffrer ' +
  'sur la mauvaise pièce.</li>' +
  '</ul>' +
  '<p>Chaque débit a son jeu de longueurs achetables, réglable juste au-dessus de son tableau : ' +
  'un marchand ne tient pas les mêmes longueurs en lame et en bois de structure.</p>' +
  '<p><b>Vis de fondation.</b> Achetées à la pièce, avec un conditionnement réglable : une boîte ' +
  'entamée se paie entière, donc la quantité est arrondie au conditionnement supérieur. Leur prix ' +
  'dépend surtout de leur longueur, donc du sol — de ' + VIS_PRICE.bas + ' à ' + VIS_PRICE.haut +
  ' € pièce hors pose pour du courant. La pose à la visseuse hydraulique, si elle est ' +
  'sous-traitée, se facture à part et n\'est pas comptée.</p>' +
  '<p>C\'est ce qui rend l\'arbitrage du §7 réellement économique : baisser le prix de la vis ' +
  'déplace l\'optimum vers plus d\'appuis et moins de bois, et inversement.</p>' +
  '<p><b>Deux contraintes de pose.</b> Un about entre deux lames doit reposer sur une pièce : ' +
  'un tronçon qui ne finit pas sa travée est donc coupé à un multiple de l\'entraxe des appuis, ' +
  'et une barre trop courte pour atteindre un appui ne peut pas servir en milieu de travée. ' +
  'Les chutes d\'au moins ' + (c.chuteMinReutilisable||50) + ' cm repartent au pot et resservent ' +
  'sur une autre travée — c\'est de là que vient l\'essentiel de l\'économie.</p>' +
  '<p><b>Calcul.</b> Chaque travée est résolue <i>exactement</i> par programmation dynamique : ' +
  'le jeu de barres le moins cher qui la couvre. Un choix glouton échoue ici, parce que couvrir ' +
  'le maximum tout de suite force régulièrement une barre entière pour le reliquat — dix travées ' +
  'de 2,50 m se paient dix barres de 2,50 m, pas neuf barres de 3 m. La mutualisation des chutes ' +
  'se fait ensuite, en second passage.</p>' +
  '<p><b>Prix.</b> Les barres se chiffrent à la pièce, et le tarif au mètre n\'est pas le même ' +
  'd\'une longueur à l\'autre — les courtes sont souvent plus chères au mètre, et une longueur ' +
  'de la gamme est fréquemment en promotion. Chaque longueur a donc son prix, saisissable dans ' +
  'son tableau de débit, <b>au choix à la barre ou au m²</b> : les deux colonnes se déduisent ' +
  'l\'une de l\'autre par la surface de la barre, on saisit celle que le marchand donne et ' +
  'l\'autre suit. Afficher les deux rend d\'ailleurs visible quelle longueur est la mieux ' +
  'placée au m². Tant qu\'aucun prix n\'est saisi, il est estimé (tarif au m² de l\'essence × ' +
  'largeur × longueur pour les lames, tarif au ml × longueur pour le bois porteur). Les totaux ' +
  'remontent dans les lignes « Lames », « Bois porteur » et « Vis » du BOM, qui ne sont pas ' +
  'saisissables à la main : deux sources de vérité pour un même coût finissent par diverger.</p>' +
  '<p class="hint">Le problème de découpe pris globalement est NP-difficile ; par travée il est ' +
  'petit et exactement soluble, et le passage de mutualisation récupère l\'essentiel du reste. ' +
  'Il subsiste 1 à 2 % : une gamme de longueurs plus courte produit des chutes identiques donc ' +
  'plus réutilisables, et bat parfois une gamme large. Le tableau affiche le pourcentage de ' +
  'chute pour permettre la comparaison.</p>' +

  '<div class="sectionTitle">8. Optimisation des paramètres</div>' +
  '<p>Le bouton de l\'onglet Construction balaie les configurations qui respectent ' +
  '<i>simultanément</i> les deux règles ci-dessus, et les classe par coût de structure.</p>' +
  '<p><b>Espace exploré.</b> Sans lambourdes, les solives portent les lames directement : leur ' +
  'entraxe est imposé par le §3 et seule la section reste libre. Avec lambourdes, les lames ' +
  'reposent sur les lambourdes (entraxe imposé par le §3) et les solives peuvent s\'écarter ' +
  'jusqu\'à la portée d\'une lambourde de cette section — même formule qu\'au §2, appliquée un ' +
  'étage plus bas, l\'entraxe repris étant cette fois celui des lambourdes.</p>' +
  '<p><b>Coût comparé.</b> Nombre de vis × prix unitaire + mètres linéaires de bois porteur × ' +
  'tarif au ml — cadre, solives, renfort spa et lambourdes compris, puisque tout cela se paie. ' +
  'Le tarif au ml du bois est celui du débit courant, chute comprise, et non le prix catalogue : ' +
  'refaire un débit complet pour chacune des 63 configurations serait exact mais bien plus lent, ' +
  'et le classement ne s\'y joue pas. Les lames sont exclues : leur métré ne dépend pas de la ' +
  'structure porteuse, elles ne feraient que décaler tous les totaux.</p>' +
  '<p><b>Quantités.</b> Chaque configuration est mesurée avec les fonctions qui tracent le plan — ' +
  'même génération de lignes, même implantation de vis. Un chiffre annoncé par l\'optimiseur est ' +
  'donc celui qu\'on relèvera sur le dessin après application, et non une estimation parallèle ' +
  'susceptible de diverger.</p>' +
  '<p class="hint">L\'arbitrage récurrent : passer aux lambourdes ajoute du bois mais laisse les ' +
  'solives s\'écarter, ce qui fait chuter le nombre de vis — souvent le poste le plus cher. Monter ' +
  'en section joue dans le même sens.</p>' +

  '<div class="sectionTitle">9. Chantier — activités et durées</div>' +
  '<p>L\'onglet Chantier liste les activités réellement nécessaires à cette terrasse, dans ' +
  'l\'ordre d\'exécution, groupées en cinq phases : préparation, appuis, structure, platelage, ' +
  'finitions. Une activité n\'apparaît que si sa quantité est non nulle — pas de décaissement sur ' +
  'dalle existante, pas de lame de rive si elle n\'est pas activée.</p>' +
  '<p><b>Les quantités viennent du projet</b>, jamais d\'un forfait au m² : nombre d\'appuis, ' +
  'mètres de cadre, de solives et de lambourdes, barres à débiter, m³ de concassé, m² de ' +
  'platelage. Chaque ligne porte sa cadence en heures par unité, réglable : une terrasse en fond ' +
  'de jardin sans accès engin n\'a pas les cadences de la même terrasse devant un garage.</p>' +
  '<p>Le total est converti en jours selon la taille d\'équipe et les heures travaillées, tous ' +
  'deux réglables. Le poste le plus lourd est signalé — c\'est celui qu\'il faut attaquer pour ' +
  'raccourcir le chantier, et sur une terrasse sur vis c\'est presque toujours le vissage.</p>' +
  '<p class="hint">Main-d\'œuvre de pose seule. Ni livraison, ni délai d\'approvisionnement, ni ' +
  'séchage, ni intempéries, ni dépose d\'un existant. Sur plots, la préparation de l\'assise est ' +
  'comptée, mais l\'évacuation des terres suppose une benne sur place.</p>' +

  '<div class="sectionTitle">10. Sources</div>' +
  '<ul>' +
  '<li>NF DTU 51.4 « Platelages extérieurs en bois » — entraxes d\'appuis (≤ 70 cm sur 3 appuis, ' +
  '≤ 60 cm sur 2 appuis), débord des lames, retrait des plots en rive.</li>' +
  '<li>Guide de conception et de réalisation des terrasses en bois — FCBA / France Bois Forêt / ' +
  'FNB / LCB / ATB.</li>' +
  '<li>Abaques de portée et pratique courante des poseurs sur vis de fondation (≈ 1,2 à 1,5 vis/m², ' +
  'solives 45×145 tous les 1,50 m à 70 cm d\'entraxe).</li>' +
  '</ul>' +
  '</div>';
}

export function renderOptimResult(obj, ctx){
  const host = document.getElementById('terrasseOptimResult');
  if(!optimVisible || !obj || !obj.pts || obj.pts.length<3){ host.style.display='none'; return; }
  const c = ensureConstruction(obj);
  const res = optimiserParametres(obj, ctx.objets());
  host.style.display = '';
  host.innerHTML = '';
  if(!res.length){ host.innerHTML = '<div class="hint">Aucune configuration exploitable.</div>'; return; }

  const entraxeLame = maxEntraxeLameCm(c);
  const intro = document.createElement('div');
  intro.className = 'hint';
  intro.textContent = 'Lames de ' + (c.epaisseurLame||25) + ' mm en ' +
    ((ESSENCE_PRICES[c.essenceBois]||{}).label || c.essenceBois) + ' : appuis a ' + entraxeLame +
    ' cm maximum. Une ligne par strategie de construction (section × avec ou sans lambourdes), ' +
    'a chaque fois son meilleur entraxe ; toutes respectent cette limite et la portee de chaque ' +
    'piece. Classement par cout de structure (vis + bois porteur) : les lames sont identiques ' +
    'dans tous les cas, donc exclues. Detail du calcul dans l\'onglet Methode.';
  host.appendChild(intro);

  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Section</th><th>Lambourdes</th><th>Entraxe solives</th>' +
    '<th>Portee vis</th><th>Vis</th><th>Bois</th><th>Densite</th><th>Cout structure</th><th></th>';
  tbl.appendChild(head);

  const surPlots = estPlots(c);
  const isCurrent = r => surPlots
    ? (r.topologie === (c.plotAvecSolives ? 'double' : 'simple') &&
       r.section === (c.plotAvecSolives ? c.soliveSection : sectionLambourde(c)) &&
       (r.topologie==='simple' || r.soliveEntraxe===c.soliveEntraxe))
    : (r.section===c.soliveSection && r.avecLambourde===!!c.avecLambourde &&
       r.soliveEntraxe===c.soliveEntraxe);
  // Neighbouring entraxes of one strategy differ by a couple of euros and would fill the table
  // with the same answer eight times; keep the best of each section/lambourdes pairing so every
  // row is a genuinely different way to build the thing.
  const seen = new Set();
  const distinct = res.filter(r=>{
    const key = r.section + '|' + (surPlots ? r.topologie : r.avecLambourde);
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  // Always show where the current config stands, even when it is not the best of its family.
  if(!distinct.some(isCurrent)){
    const mine = res.find(isCurrent);
    if(mine) distinct.push(mine);
  }
  distinct.forEach((r,i)=>{
    const tr = document.createElement('tr');
    const cur = isCurrent(r);
    if(cur) tr.style.cssText = 'font-weight:600; background:var(--accent-light);';
    const cell = txt => { const td=document.createElement('td'); td.textContent=txt; return td; };
    tr.appendChild(cell(r.section + (i===0 ? '  ← optimum' : '')));
    tr.appendChild(cell(surPlots
      ? (r.topologie==='double' ? 'double (plots sous solives)' : 'simple (plots sous lambourdes)')
      : (r.avecLambourde ? 'oui (' + r.lambourdeEntraxe + ' cm)' : 'non')));
    tr.appendChild(cell(surPlots && r.topologie==='simple' ? '—' : r.soliveEntraxe + ' cm'));
    tr.appendChild(cell(r.portee + ' cm'));
    tr.appendChild(cell(String(r.vis)));
    tr.appendChild(cell(r.ml + ' ml'));
    tr.appendChild(cell(r.densite + '/m²'));
    tr.appendChild(cell(r.cout + ' €'));
    const tdBtn = document.createElement('td');
    if(cur){ tdBtn.textContent = 'config actuelle'; tdBtn.style.cssText='font-size:0.8rem; color:var(--ink-soft);'; }
    else {
      const b = document.createElement('button'); b.className='objbtn'; b.textContent='Appliquer';
      b.addEventListener('click', ()=>{
        if(surPlots){
          c.plotAvecSolives = (r.topologie === 'double');
          if(r.topologie === 'double'){ c.soliveSection = r.section; c.soliveEntraxe = r.soliveEntraxe; }
          else { c.lambourdeSection = r.section; }
          c.avecLambourde = true;
          c.plotEntraxeAuto = true;
        } else {
          c.soliveSection = r.section;
          c.avecLambourde = r.avecLambourde;
          c.soliveEntraxe = r.soliveEntraxe;
          c.lambourdeEntraxe = r.lambourdeEntraxe;
          c.visModeAuto = true;
        }
        ctx.refreshTerrasseView();
      });
      tdBtn.appendChild(b);
    }
    tr.appendChild(tdBtn);
    tbl.appendChild(tr);
  });
  host.appendChild(tbl);

  const best = res[0];
  const actuel = evaluerStructure(obj, c,
    surPlots ? prixPlotUnite(c) : prixUnitaire(c,'vis',VIS_PRICE),
    prixUnitaire(c,'bois',SOLIVE_PRICE),
    lamesAngleOf(obj), shoelace(obj.pts)||1, ctx.objets());
  const note = document.createElement('div');
  note.className = 'hint';
  const gain = actuel.cout - best.cout;
  note.textContent = res.length + ' configurations testees. Config actuelle : ' + actuel.vis +
    ' vis, ' + actuel.densite + '/m², ' + actuel.cout + ' € — optimum : ' + best.vis + ' vis, ' +
    best.densite + '/m², ' + best.cout + ' €' +
    (gain > 0 ? ', soit ' + gain + ' € et ' + (actuel.vis-best.vis) + ' vis en moins.'
              : '. La config actuelle est deja au niveau de l\'optimum.') +
    ' Pre-dimensionnement indicatif sur base 250 kg/m², sans valeur de note de calcul.';
  host.appendChild(note);
}

