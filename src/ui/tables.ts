// Tables du dossier et du chiffrage (spec §3.2, ui/).
//
// Trois listes qui decrivent la meme terrasse a trois publics : les terrasses a mettre au dossier,
// le metre (quantites et prix), et le debit de bois (les pieces a commander). Aucune ne calcule :
// elles mettent en page ce que `engine/` a produit.
//
// La selection du dossier vit ici parce qu'elle ne concerne que ce panneau - cocher une terrasse
// pour le PDF n'est pas une donnee du plan.

import { shoelace } from '../geometry/basic.js';
import { computeBOM, coutDebit, prixBarre, prixM2De, prixPersonnalise, setPrixBarre, setPrixM2 } from '../engine/bom.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { ensureConstruction } from '../engine/construction.js';
import { equipementsSurTerrasse } from '../export/dossierPdf.js';

// Terrasses cochees pour le dossier PDF. Par defaut, toutes.
export const dossierSelection = new Set<string>();
export function renderDossierTerrasses(etat){
  const hote = document.getElementById('dossierTerrasses');
  if(!hote) return;
  hote.innerHTML = '';
  const terrasses = etat.objects.filter(o=>o.fonction === 'terrasse' && o.type === 'polygon');
  if(!terrasses.length){
    const p = document.createElement('span');
    p.className = 'hint';
    p.style.margin = '0';
    p.textContent = 'Aucune terrasse dans ce plan : regle « Fonction » sur « terrasse » pour l\'objet concerne.';
    hote.appendChild(p);
    return;
  }
  const cles = new Set(terrasses.map(t=>t.key));
  [...dossierSelection].forEach(k=>{ if(!cles.has(k)) dossierSelection.delete(k); });
  if(!dossierSelection.size) terrasses.forEach(t=>dossierSelection.add(t.key));
  terrasses.forEach(t=>{
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex; align-items:center; gap:6px; cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = dossierSelection.has(t.key);
    cb.addEventListener('change', ()=>{
      if(cb.checked) dossierSelection.add(t.key); else dossierSelection.delete(t.key);
    });
    const equip = equipementsSurTerrasse(etat.objects, t);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(
      t.name + ' — ' + shoelace(t.pts).toFixed(2).replace('.',',') + ' m²' +
      (equip.length ? ' — ' + equip.length + ' équipement(s) : ' + equip.map(e=>e.name).join(', ') : ' — aucun équipement')
    ));
    hote.appendChild(lab);
  });
}

export function debitTable(host, c, d, lengths, cle, ctx){
  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Longueur</th><th>Qte</th><th>Metre</th><th>Prix / barre</th>' +
                   '<th>Prix / m²</th><th>Total</th><th>Usage</th>';
  tbl.appendChild(head);
  lengths.forEach(L=>{
    const n = d.achats[L], r = d.roles[L] || {entiere:0, ajustee:0, recoupee:0, troncon:0, rebutMl:0, potMl:0};
    const parts = [];
    if(r.entiere) parts.push(r.entiere + ' posee entiere (tombe juste)');
    if(r.ajustee) parts.push(r.ajustee + ' arasee, chute ' +
      Math.round(100*r.rebutMl/r.ajustee) + ' cm au rebut');
    if(r.recoupee) parts.push(r.recoupee + ' recoupee, ' +
      Math.round(100*r.potMl/r.recoupee) + ' cm au pot');
    if(r.troncon) parts.push(r.troncon + ' en troncon courant, about sur appui');
    const tr = document.createElement('tr');
    const cell = t => { const td=document.createElement('td'); td.textContent=t; return td; };
    tr.appendChild(cell(L.toFixed(2).replace(/\.?0+$/,'') + ' m'));
    tr.appendChild(cell(String(n)));
    tr.appendChild(cell((n*L).toFixed(2) + ' ml'));

    // The two quotes of the same board, each recomputed from the other. Whichever the merchant
    // gives you is the one you type; the other follows.
    const champ = (valeur, titre, appliquer) => {
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
      v => setPrixBarre(c, cle, L, v)));
    tr.appendChild(champ(prixM2De(c,cle,L), 'Prix au m² pour cette longueur — recalcule le prix de la barre',
      v => setPrixM2(c, cle, L, v)));

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
  tot.innerHTML = '<td>Total</td><td>' + lengths.reduce((s,L)=>s+d.achats[L],0) +
    ' barres</td><td>' + d.achatMl.toFixed(2) + ' ml</td><td></td><td></td><td>' +
    coutDebit(c, d, cle).toFixed(2) + ' €</td><td></td>';
  tbl.appendChild(tot);
  host.appendChild(tbl);
}

export function renderBOMTable(obj, etat, ctx){
  const c = ensureConstruction(obj);
  const layers = computeTerrasseLayers(obj, etat.objects);
  const lines = computeBOM(obj, layers);
  c.bom = lines;
  ctx.renderDebitLames(obj, layers);
  ctx.renderDebitBois(obj, layers);

  const tbl = document.getElementById('terrasseBomTable');
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Poste</th><th>Qte</th><th>Prix bas</th><th>Prix haut</th><th>Prix reel (total ligne)</th>';
  tbl.appendChild(head);

  let totalBas=0, totalHaut=0;
  const updateTotals = () => {
    let reelSum=0, anyReel=false;
    lines.forEach(l=>{ if(l.prixReel!==null && l.prixReel!==undefined){ reelSum+=l.prixReel; anyReel=true; } });
    document.getElementById('terrasseBomTotals').textContent =
      'Estime : ' + totalBas.toFixed(0) + ' € – ' + totalHaut.toFixed(0) + ' €' +
      (anyReel ? '   |   Reel saisi : ' + reelSum.toFixed(2) + ' €' : '');
  };

  lines.forEach(l=>{
    const tr = document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=l.label;
    const td1=document.createElement('td'); td1.textContent = l.qte.toFixed(l.unite==='u'?0:2)+' '+l.unite;
    const td2=document.createElement('td'); td2.textContent = l.prixBas ? (l.prixBas.toFixed(2)+' €/'+l.unite) : '—';
    const td3=document.createElement('td'); td3.textContent = l.prixHaut ? (l.prixHaut.toFixed(2)+' €/'+l.unite) : '—';
    const td4=document.createElement('td');
    if(l.calcule){
      // Priced from the cut-list, length by length: editing it here as well would give two
      // sources of truth that can disagree.
      td4.textContent = l.prixReel.toFixed(2) + ' €';
      td4.style.cssText = 'font-variant-numeric:tabular-nums;';
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.78rem; color:var(--ink-soft);';
      note.textContent = (typeof l.calcule === 'string') ? l.calcule : 'calcule';
      td4.appendChild(note);
    } else {
      const reelInp = document.createElement('input'); reelInp.type='number'; reelInp.step='0.01'; reelInp.min='0';
      reelInp.placeholder = 'non saisi';
      if(l.prixReel!==null && l.prixReel!==undefined) reelInp.value = l.prixReel;
      reelInp.addEventListener('change', ()=>{
        const v = parseFloat(reelInp.value);
        l.prixReel = isNaN(v) ? null : v;
        const idx = c.bom.findIndex(x=>x.poste===l.poste);
        if(idx>=0) c.bom[idx].prixReel = l.prixReel;
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
