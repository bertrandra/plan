// Tables du dossier et du chiffrage (spec §3.2, ui/).
//
// Trois listes qui decrivent la meme terrasse a trois publics : les terrasses a mettre au dossier,
// le metre (quantites et prix), et le debit de bois (les pieces a commander). Aucune ne calcule :
// elles mettent en page ce que `engine/` a produit.
//
// La selection du dossier vit ici parce que cocher une terrasse pour le PDF n'est pas une donnee
// du plan : elle ne s'enregistre pas.

import { computeBOM, coutDebit, prixBarre, prixM2De, prixPersonnalise, setPrixBarre, setPrixM2, type ProduitBarre } from '../engine/bom.js';
import { computeTerrasseLayers, type CouchesTerrasse } from '../engine/layers.js';
import { computeDebitLames, type Debit } from '../engine/debit.js';
import { ESSENCE_PRICES } from '../engine/constantes.js';
import { ensureConstruction } from '../engine/construction.js';
import { valeurEnregistree } from '../model/dictionnaire.js';
import type { ObjetPlan, Construction, LigneBom } from '../model/types.js';

/** Ce que ces trois tables doivent pouvoir declencher ailleurs. */
export interface ContexteTables {
  refreshTerrasseView: () => void;
  renderDebitLames: (obj: ObjetPlan, layers: CouchesTerrasse) => void;
  renderDebitBois: (obj: ObjetPlan, layers: CouchesTerrasse) => void;
}

// Terrasses cochees pour le dossier PDF — dans l'explorateur (zones/Explorateur.tsx) depuis
// l'etape 3 de la reconstruction de l'interface. Par defaut, toutes.
export const dossierSelection = new Set<string>();

/**
 * Les cles des terrasses retenues, apres reparation : une terrasse disparue sort de la selection,
 * et rien de coche veut dire toutes — un dossier vide n'est pas un dossier.
 */
export function clesDossier(objects: ObjetPlan[]): string[] {
  const terrasses = objects.filter((o: ObjetPlan)=>o.fonction === 'terrasse' && o.type === 'polygon');
  const cles = new Set(terrasses.map((t: ObjetPlan)=>t.key));
  [...dossierSelection].forEach(k=>{ if(!cles.has(k)) dossierSelection.delete(k); });
  if(!dossierSelection.size) terrasses.forEach((t: ObjetPlan)=>dossierSelection.add(t.key));
  return [...dossierSelection];
}

export function debitTable(host: HTMLElement, c: Construction, d: Debit, lengths: number[], cle: ProduitBarre, ctx: ContexteTables): void {
  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Longueur</th><th>Qte</th><th>Metre</th><th>Prix / barre</th>' +
                   '<th>Prix / m²</th><th>Total</th><th>Usage</th>';
  tbl.appendChild(head);
  lengths.forEach((L: number)=>{
    const n = d.achats[L]!, r = d.roles[L] || {entiere:0, ajustee:0, recoupee:0, troncon:0, rebutMl:0, potMl:0};
    const parts: string[] = [];
    if(r.entiere) parts.push(r.entiere + ' posee entiere (tombe juste)');
    if(r.ajustee) parts.push(r.ajustee + ' arasee, chute ' +
      Math.round(100*r.rebutMl/r.ajustee) + ' cm au rebut');
    if(r.recoupee) parts.push(r.recoupee + ' recoupee, ' +
      Math.round(100*r.potMl/r.recoupee) + ' cm au pot');
    if(r.troncon) parts.push(r.troncon + ' en troncon courant, about sur appui');
    const tr = document.createElement('tr');
    const cell = (t: string) => { const td=document.createElement('td'); td.textContent=t; return td; };
    tr.appendChild(cell(L.toFixed(2).replace(/\.?0+$/,'') + ' m'));
    tr.appendChild(cell(String(n)));
    tr.appendChild(cell((n*L).toFixed(2) + ' ml'));

    // The two quotes of the same board, each recomputed from the other. Whichever the merchant
    // gives you is the one you type; the other follows.
    const champ = (valeur: number, titre: string, appliquer: (v: number | null) => void) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type='number'; inp.step='0.01'; inp.min='0'; inp.style.width='85px';
      inp.value = valeur.toFixed(2);
      inp.title = titre;
      if(!prixPersonnalise(c, cle, L)) inp.style.opacity = '0.7';
      inp.addEventListener('change', ()=>{
        const v = parseFloat(inp.value);
        appliquer(isNaN(v) ? null : v);
        ctx.refreshTerrasseView();
      });
      td.appendChild(inp);
      return td;
    };
    tr.appendChild(champ(prixBarre(c,cle,L), 'Prix d\'une barre de ' + L + ' m',
      (v: number | null) => setPrixBarre(c, cle, L, v)));
    tr.appendChild(champ(prixM2De(c,cle,L), 'Prix au m² pour cette longueur — recalcule le prix de la barre',
      (v: number | null) => { if(v !== null) setPrixM2(c, cle, L, v); }));

    const tdTot = cell((n*prixBarre(c,cle,L)).toFixed(2) + ' €');
    tdTot.style.cssText = 'font-variant-numeric:tabular-nums;';
    tr.appendChild(tdTot);

    const td = cell(parts.join(' · ') || '—');
    td.style.cssText = 'font-size:0.82rem; color:var(--ink-soft);';
    tr.appendChild(td);
    tbl.appendChild(tr);
  });
  const tot = document.createElement('tr');
  tot.style.fontWeight = '600';
  tot.innerHTML = '<td>Total</td><td>' + lengths.reduce((s: number,L: number)=>s+d.achats[L]!,0) +
    ' barres</td><td>' + d.achatMl.toFixed(2) + ' ml</td><td></td><td></td><td>' +
    coutDebit(c, d, cle).toFixed(2) + ' €</td><td></td>';
  tbl.appendChild(tot);
  host.appendChild(tbl);
}

export function renderBOMTable(obj: ObjetPlan, etat: { objects: ObjetPlan[] }, ctx: ContexteTables): void {
  const c = ensureConstruction(obj);
  const layers = computeTerrasseLayers(obj, etat.objects);
  const lines = computeBOM(obj, layers);
  c.bom = lines;
  ctx.renderDebitLames(obj, layers);
  ctx.renderDebitBois(obj, layers);

  const tbl = document.getElementById('terrasseBomTable')!;
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Poste</th><th>Qte</th><th>Prix bas</th><th>Prix haut</th><th>Prix reel (total ligne)</th>';
  tbl.appendChild(head);

  let totalBas=0, totalHaut=0;
  const updateTotals = () => {
    let reelSum=0, anyReel=false;
    lines.forEach((l: LigneBom)=>{ if(l.prixReel!==null && l.prixReel!==undefined){ reelSum+=l.prixReel; anyReel=true; } });
    document.getElementById('terrasseBomTotals')!.textContent =
      'Estime : ' + totalBas.toFixed(0) + ' € – ' + totalHaut.toFixed(0) + ' €' +
      (anyReel ? '   |   Reel saisi : ' + reelSum.toFixed(2) + ' €' : '');
  };

  lines.forEach((l: LigneBom)=>{
    const tr = document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=l.label;
    const td1=document.createElement('td'); td1.textContent = l.qte.toFixed(l.unite==='u'?0:2)+' '+l.unite;
    const td2=document.createElement('td'); td2.textContent = l.prixBas ? (l.prixBas.toFixed(2)+' €/'+l.unite) : '—';
    const td3=document.createElement('td'); td3.textContent = l.prixHaut ? (l.prixHaut.toFixed(2)+' €/'+l.unite) : '—';
    const td4=document.createElement('td');
    if(l.calcule){
      // Priced from the cut-list, length by length: editing it here as well would give two
      // sources of truth that can disagree.
      td4.textContent = l.prixReel!.toFixed(2) + ' €';
      td4.style.cssText = 'font-variant-numeric:tabular-nums;';
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.78rem; color:var(--ink-soft);';
      note.textContent = (typeof l.calcule === 'string') ? l.calcule : 'calcule';
      td4.appendChild(note);
    } else {
      const reelInp = document.createElement('input'); reelInp.type='number'; reelInp.step='0.01'; reelInp.min='0';
      reelInp.placeholder = 'non saisi';
      if(l.prixReel!==null && l.prixReel!==undefined) reelInp.value = String(l.prixReel);
      reelInp.addEventListener('change', ()=>{
        const v = parseFloat(reelInp.value);
        l.prixReel = isNaN(v) ? null : v;
        const idx = (c.bom||[]).findIndex((x: LigneBom)=>x.poste===l.poste);
        if(idx>=0 && c.bom) c.bom[idx]!.prixReel = l.prixReel;
        updateTotals();
      });
      td4.appendChild(reelInp);
    }
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
    tbl.appendChild(tr);

    totalBas += (l.prixBas||0)*l.qte;
    totalHaut += (l.prixHaut||0)*l.qte;
  });
  updateTotals();
}

// ---- Debit de bois : longueurs achetables, bilan de chute, prix personnalises ----
// Une meme table de debit sert les lames et la structure ; seul change le jeu de prix par longueur
// qu'elle lit et ecrit. Le bilan qui l'accompagne dit ce qui est reellement pose, ce qui est achete,
// et ce qui reste en chutes reutilisables - la difference entre les deux est ce qu'on paie sans
// poser.
export function champLongueurs(c: Construction, champ: string, libelle: string, ctx: ContexteTables): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'controls';
  const lab = document.createElement('label');
  lab.textContent = libelle + ' : ';
  lab.style.cssText = 'font-size:0.85rem; margin-right:6px;';
  const inp = document.createElement('input');
  inp.type='text'; inp.value = (c as unknown as Record<string, unknown>)[champ] as string || ''; inp.style.minWidth = '190px';
  inp.title = 'Longueurs disponibles chez ton fournisseur, en metres, separees par des virgules';
  inp.addEventListener('change', ()=>{ (c as unknown as Record<string, unknown>)[champ] = inp.value; ctx.refreshTerrasseView(); });
  wrap.appendChild(lab); wrap.appendChild(inp);
  return wrap;
}
export function bilanDebit(c: Construction, d: Debit): HTMLElement {
  const perte = d.achatMl>0 ? 100*d.chuteMl/d.achatMl : 0;
  const el = document.createElement('div');
  el.className = 'hint';
  el.innerHTML = '<b>Bilan.</b> Lineaire reellement pose : ' + d.reelMl.toFixed(2) +
    ' ml. Achete : ' + d.achatMl.toFixed(2) + ' ml, soit ' + perte.toFixed(1) + ' % de chute — ' +
    'dont ' + d.restantMl.toFixed(2) + ' ml en chutes reutilisables restantes (≥ ' +
    (c.chuteMinReutilisable||50) + ' cm, a garder) et ' + d.perdueMl.toFixed(2) + ' ml de rebut.' +
    (d.pool.length ? ' Chutes en fin de chantier : ' +
      d.pool.slice(0,10).map((x: number)=>x.toFixed(2)+' m').join(', ') +
      (d.pool.length>10 ? ' …' : '') + '.' : '');
  return el;
}

// The structural timber cut-list, plus the screw price - the two other things that get bought.
export function prixPersonnaliseplot(c: Construction, m: { cle: string }): boolean {
  const p = valeurEnregistree(c.prixPlots, m.cle);
  return p !== undefined && p !== null && isFinite(p) && p >= 0;
}

// The cut-list, with what each purchased length is actually for. A bare count of boards is not
// much use on site; knowing that the 3 m are the through-runs and the 1,5 m are the tail ends is.
export function renderDebitLames(obj: ObjetPlan, layers: CouchesTerrasse, ctx: ContexteTables): void {
  const host = document.getElementById('terrasseDebitBox');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  const d = computeDebitLames(obj, layers);
  const lengths = Object.keys(d.achats).map(parseFloat).sort((a: number,b: number)=>b-a);
  if(!lengths.length){ host.innerHTML = '<div class="hint">Aucune lame a debiter.</div>'; return; }

  const entraxeAppui = (c.avecLambourde ? (c.lambourdeEntraxe||40) : (c.soliveEntraxe||40));
  const intro = document.createElement('div');
  intro.className = 'hint';
  intro.textContent = 'Metre au lineaire reel des lames tracees (bordure a plat comprise), ' +
    'debitees dans les longueurs du fournisseur. Les chutes d\'au moins ' +
    (c.chuteMinReutilisable||50) + ' cm sont remises au pot et reservent sur une autre travee' +
    (c.jointsSurAppui !== false
      ? ' ; chaque about tombe sur un appui, donc un troncon de milieu de travee est coupe a un multiple de ' + entraxeAppui + ' cm.'
      : ' ; les abouts ne sont pas contraints de tomber sur un appui.');
  host.appendChild(intro);

  host.appendChild(champLongueurs(c, 'longueursLames', 'Longueurs achetables (m)', ctx));
  debitTable(host, c, d, lengths, 'lames', ctx);
  const cout = coutDebit(c, d, 'lames');
  const perso = lengths.filter((L: number)=>prixPersonnalise(c,'lames',L)).length;
  host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
    textContent: 'Prix par barre : ' +
      (perso ? perso + ' sur ' + lengths.length + ' saisis, les autres estimes' : 'tous estimes') +
      ' a partir du tarif au m² de l\'essence (' + (ESSENCE_PRICES[c.essenceBois!]||ESSENCE_PRICES.autre!).label +
      ') pour une lame de ' + (c.largeurLame||140) + ' mm — soit ' +
      (cout / (d.achatMl||1)).toFixed(2) + ' €/ml en moyenne, ou ' +
      (cout / (d.reelMl||1)).toFixed(2) + ' €/ml rapporte au lineaire reellement pose. ' +
      'Saisis le tarif du fournisseur pour chaque longueur : le total alimente la ligne ' +
      '« Lames » du BOM au-dessus, qui n\'est donc pas saisissable a la main.' }));
  host.appendChild(bilanDebit(c, d));
  host.appendChild(Object.assign(document.createElement('div'), {
    className:'hint',
    textContent:'Methode : chaque travee est resolue exactement (le jeu de barres le moins cher ' +
      'qui la couvre), puis les chutes sont mutualisees entre travees. La mutualisation venant ' +
      'apres, il reste 1 a 2 % a gagner sur la table — d\'ou un effet a connaitre : une gamme ' +
      'plus courte fait parfois mieux qu\'une gamme large, parce que des barres toutes pareilles ' +
      'produisent des chutes toutes pareilles, donc reutilisables. Essaie de retirer des ' +
      'longueurs de la liste et compare le pourcentage de chute.'
  }));
}

