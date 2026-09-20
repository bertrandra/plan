// Panneau de l'outil de cotation (spec §3.2, ui/).
//
// Il montre le brouillon en cours - le cote de reference choisi, les points deja designes - puis la
// liste des cotes posees. Le brouillon lui-meme vit dans `interaction/outilMesure.ts` : ce module
// ne fait que l'afficher et le piloter.
//
// Une cote n'entre dans le plan qu'au moment ou on la valide. Tant qu'elle est en brouillon, elle
// n'existe que dans l'outil, et « Annuler » la fait disparaitre sans laisser de trace.

import { mesure, type Pointage } from '../interaction/outilMesure.js';
import { idMesure } from '../model/cles.js';
import type { Mesure } from '../model/types.js';

/** Ce que le panneau de mesure lit et modifie dans l'etat du plan. */
export interface EtatMesures { measures: Mesure[] }

/** Ce que le panneau de mesure demande au reste du programme. */
export interface ContexteMesurePanel {
  refLabel: (ref: { objKey: string; segIndex: number } | null) => string;
  targetLabel: (t: { objKey: string; ptIndex: number }) => string;
  computeMeasureGeom: (m: Mesure) => { perp: number; along: number } | null;
  render: () => void;
}

export function startPick(mode: Pointage['mode'], multi: boolean, purpose: Pointage['purpose'] | undefined, etat: EtatMesures, ctx: ContexteMesurePanel): void {
  mesure.pointage = {mode, multi, purpose: purpose||'measure'};
  rebuildMeasurePanel(etat, ctx);
  ctx.render();
}
export function cancelPick(etat: EtatMesures, ctx: ContexteMesurePanel): void {
  mesure.pointage = null;
  rebuildMeasurePanel(etat, ctx);
  ctx.render();
}

export function rebuildMeasurePanel(etat: EtatMesures, ctx: ContexteMesurePanel): void {
  const ctrl = document.getElementById('measureControls')!;
  ctrl.innerHTML = '';

  const explain = document.createElement('div');
  explain.className = 'hint';
  explain.style.marginBottom = '8px';
  explain.textContent = "Choisis un segment de référence et l'extrémité d'origine, puis sélectionne un ou plusieurs coins sur le plan : pour chacun, la mesure est la distance entre son point projeté (perpendiculaire au segment) et l'origine choisie.";
  ctrl.appendChild(explain);

  const refBtn = document.createElement('button');
  refBtn.className = 'secondary small';
  refBtn.textContent = (mesure.pointage && mesure.pointage.mode==='ref') ? 'Clique sur un côté du plan…' : 'Choisir le segment de référence';
  if(mesure.pointage && mesure.pointage.mode==='ref') refBtn.disabled = true;
  refBtn.addEventListener('click', ()=>startPick('ref', false, undefined, etat, ctx));
  ctrl.appendChild(refBtn);

  const refInfo = document.createElement('div');
  refInfo.style.cssText = 'font-size:0.8rem; margin:6px 0;';
  refInfo.textContent = 'Référence : ' + ctx.refLabel(mesure.ref);
  ctrl.appendChild(refInfo);

  const startSelect = document.createElement('select');
  ['A','B'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent='Extrémité '+v; startSelect.appendChild(o); });
  startSelect.value = mesure.startEnd;
  startSelect.addEventListener('change', ()=>{ mesure.startEnd = startSelect.value; });
  const startLabel = document.createElement('label');
  startLabel.style.cssText='display:block; font-size:0.8rem; margin:8px 0;';
  startLabel.textContent = "Origine (extrémité du segment) : ";
  startLabel.appendChild(startSelect);
  ctrl.appendChild(startLabel);

  const tgtBtn = document.createElement('button');
  tgtBtn.className = 'secondary small';
  const picking = mesure.pointage && mesure.pointage.mode==='target';
  tgtBtn.textContent = picking ? 'Clique des coins sur le plan… (reclique pour finir)' : 'Sélectionner des coins';
  tgtBtn.disabled = !mesure.ref;
  tgtBtn.title = !mesure.ref ? 'Choisis d\'abord le segment de reference' : '';
  tgtBtn.addEventListener('click', ()=>{
    if(picking){ cancelPick(etat, ctx); return; } // acts as "terminer" while picking
    mesure.cibles = [];
    startPick('target', true, undefined, etat, ctx);
  });
  ctrl.appendChild(tgtBtn);

  const tgtInfo = document.createElement('div');
  tgtInfo.style.cssText = 'font-size:0.8rem; margin:6px 0;';
  tgtInfo.textContent = 'Points sélectionnés : ' + (mesure.cibles.length ? mesure.cibles.map(ctx.targetLabel).join(', ') : '(aucun)');
  ctrl.appendChild(tgtInfo);

  const addBtn = document.createElement('button');
  addBtn.textContent = 'Ajouter les mesures';
  addBtn.disabled = !mesure.ref || mesure.cibles.length===0;
  addBtn.addEventListener('click', ()=>{
    mesure.cibles.forEach(t=>{
      etat.measures.push({
        id: idMesure(),
        refObjKey:mesure.ref!.objKey, refSegIndex:mesure.ref!.segIndex,
        startEnd: mesure.startEnd,
        targetObjKey:t.objKey, targetPtIndex:t.ptIndex,
        show:true, displayMode:'along'
      });
    });
    mesure.cibles = [];
    mesure.pointage = null;
    rebuildMeasurePanel(etat, ctx);
    renderMeasureResults(etat, ctx);
    ctx.render();
  });
  ctrl.appendChild(document.createElement('br'));
  ctrl.appendChild(addBtn);
}

export function renderMeasureResults(etat: EtatMesures, ctx: ContexteMesurePanel): void {
  const tbl = document.getElementById('measureResultsTable')!;
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Référence</th><th>Point</th><th>Origine</th><th>Perpendiculaire</th><th>Le long (depuis origine)</th><th>Affichage</th><th>Afficher</th><th></th>';
  tbl.appendChild(head);
  etat.measures.forEach(m=>{
    if(!m.displayMode) m.displayMode = 'along';
    const g = ctx.computeMeasureGeom(m);
    const tr = document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent = ctx.refLabel({objKey:m.refObjKey, segIndex:m.refSegIndex});
    const td1=document.createElement('td'); td1.textContent = ctx.targetLabel({objKey:m.targetObjKey, ptIndex:m.targetPtIndex});
    const td1b=document.createElement('td');
    const swapBtn=document.createElement('button'); swapBtn.className='secondary small';
    swapBtn.textContent = 'Extrémité ' + m.startEnd + ' ⇄';
    swapBtn.title = 'Changer l\'extremite d\'origine de cette mesure (A <-> B)';
    swapBtn.addEventListener('click', ()=>{ m.startEnd = m.startEnd==='A' ? 'B' : 'A'; renderMeasureResults(etat, ctx); ctx.render(); });
    td1b.appendChild(swapBtn);
    const td2=document.createElement('td');
    td2.textContent = g ? g.perp.toFixed(2)+' m' : '—';
    td2.style.fontWeight = m.displayMode==='perp' ? '700' : '400';
    const td3=document.createElement('td');
    td3.textContent = g ? g.along.toFixed(2)+' m' : '—';
    td3.style.fontWeight = m.displayMode==='along' ? '700' : '400';
    const td3b=document.createElement('td');
    const modeBtn=document.createElement('button'); modeBtn.className='secondary small';
    modeBtn.textContent = (m.displayMode==='along' ? 'Le long' : 'Perpendiculaire') + ' ⇄';
    modeBtn.title = 'Choisir quelle valeur est affichee sur le plan pour cette mesure';
    modeBtn.addEventListener('click', ()=>{ m.displayMode = m.displayMode==='along' ? 'perp' : 'along'; renderMeasureResults(etat, ctx); ctx.render(); });
    td3b.appendChild(modeBtn);
    const td4=document.createElement('td');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=m.show!;
    cb.addEventListener('change', ()=>{ m.show=cb.checked; ctx.render(); });
    td4.appendChild(cb);
    const td5=document.createElement('td');
    const delBtn=document.createElement('button'); delBtn.className='secondary small'; delBtn.textContent='Supprimer';
    delBtn.addEventListener('click', ()=>{ etat.measures = etat.measures.filter((x: Mesure)=>x.id!==m.id); renderMeasureResults(etat, ctx); ctx.render(); });
    td5.appendChild(delBtn);
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td1b); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td3b); tr.appendChild(td4); tr.appendChild(td5);
    tbl.appendChild(tr);
  });
}
