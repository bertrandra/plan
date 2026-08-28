// Panneau d'attributs de l'objet selectionne (spec §6.4).
//
// C'est le panneau qui pilote le plan : le nom, les cotes, les angles, l'apparence, la fonction, le
// parasol, la cloture, le point de vue. Il se reconstruit entierement a chaque rendu, ce qui a une
// consequence qu'on retrouve partout ici : **une saisie en cours ne doit jamais passer par
// `render()`**. Reconstruire la table detruirait le champ qu'on est en train de remplir et le focus
// avec lui. D'ou les mises a jour ciblees, commentees a chaque endroit ou elles apparaissent.
//
// Le module ne connait ni l'etat global ni les fonctions de l'application : il recoit `etat` et un
// `ctx` qui porte tout ce qu'il doit pouvoir declencher.

import { vue } from '../render/vues.js';
import { dist, shoelace, signedArea, pointInPolygon } from '../geometry/basic.js';
import { nearestSegmentIndex } from '../geometry/segments.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_ECRAN, DEGRE_ECRAN } from '../model/etiquettes.js';
import { cibleAlignement } from '../interaction/outilAlignement.js';
import { el } from './dom.js';
import { formatHeureMin } from '../util/format.js';
import { showToast } from './dialogs.js';
import { ouvrirSelecteurTexture } from './texturePicker.js';
import { terrasseDuParasol, hauteurParasolDe, matAngleDe, chercherMeilleurePositionParasol } from '../engine/parasol.js';

// La distance saisie dans l'outil d'alignement survit aux reconstructions du panneau : la table est
// rebatie a chaque rendu, et sans cette memoire le champ se viderait des qu'on touche au plan.
let alignDistanceValue = '';
export function renderAttrTable(etat, ctx){
  const obj = etat.objects.find(o=>o.key===etat.selectedKey);
  const nameTbl = document.getElementById('attrNameTable');
  const tabsDiv = document.getElementById('attrTabs');
  const tbl = document.getElementById('attrTable');

  const delObjBtn = el<HTMLButtonElement>('delObjBtn');
  delObjBtn.disabled = !obj || obj.key==='parcelle' || obj.locked;
  delObjBtn.title = !obj ? 'Selectionne d\'abord un objet' : (obj.key==='parcelle' ? 'La parcelle ne peut pas etre supprimee' : (obj.locked ? 'Objet verrouille' : ''));

  const dupObjBtn = el<HTMLButtonElement>('dupObjBtn');
  dupObjBtn.disabled = !obj || obj.key==='parcelle';
  dupObjBtn.title = !obj ? 'Selectionne d\'abord un objet' : (obj.key==='parcelle' ? 'La parcelle ne peut pas etre dupliquee' : 'Cree une copie, decalee de 5 m vers la gauche');

  if(!obj){
    document.getElementById('attrTitle').textContent = 'Aucune sélection';
    nameTbl.innerHTML = '';
    tabsDiv.innerHTML = '';
    tbl.innerHTML = '<tr><td style="padding:10px; color:#8a8a80;">Clique sur un objet (ou son bouton ci-dessus) pour l\'éditer.</td></tr>';
    return;
  }
  const titleSurf = obj.type==='polygon' ? shoelace(obj.pts) : (obj.type==='circle' ? Math.PI*obj.r*obj.r : null);
  document.getElementById('attrTitle').textContent = ctx.libelleTypeObjet(obj) + ' — ' + obj.name + (titleSurf!==null ? '  (' + titleSurf.toFixed(2) + ' m²)' : '');

  // --- name table (always visible, not tabbed) ---
  nameTbl.innerHTML = '';
  const rowName = document.createElement('tr');
  const tdLabel = document.createElement('td'); tdLabel.textContent = "Objet";
  const tdBlank = document.createElement('td');
  const tdInput = document.createElement('td');
  const inp = document.createElement('input'); inp.type='text'; inp.value=obj.name;
  inp.addEventListener('input', ()=>{
    // Update just the name everywhere it's shown, without a full ctx.render(): ctx.render() rebuilds
    // this very input from scratch (renderAttrTable -> nameTbl.innerHTML=''), which would kill
    // focus and cursor position on every keystroke.
    obj.name = inp.value;
    ctx.markDirty();
    ctx.rebuildSelector();
    if(vue(obj).nameEl) vue(obj).nameEl.textContent = obj.showName ? obj.name : '';
    document.getElementById('attrTitle').textContent = ctx.libelleTypeObjet(obj) + ' — ' + obj.name + (titleSurf!==null ? '  (' + titleSurf.toFixed(2) + ' m²)' : '');
  });
  tdInput.appendChild(inp);
  rowName.appendChild(tdLabel); rowName.appendChild(tdBlank); rowName.appendChild(tdInput);
  nameTbl.appendChild(rowName);

  // --- tabs ---
  tabsDiv.innerHTML = '';
  if(obj.type==='polygon'){
    [['objet','Objet'],['segments','Cotes'],['angles','Coins']].forEach(([key,label])=>{
      const b = document.createElement('button');
      b.className = 'attrTabBtn' + (etat.attrTab===key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', ()=>{ etat.attrTab=key; ctx.render(); });
      tabsDiv.appendChild(b);
    });
  } else if(obj.type==='path'){
    if(etat.attrTab==='angles') etat.attrTab='segments'; // path has no angle tab
    [['objet','Objet'],['segments','Points / Segments']].forEach(([key,label])=>{
      const b = document.createElement('button');
      b.className = 'attrTabBtn' + (etat.attrTab===key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', ()=>{ etat.attrTab=key; ctx.render(); });
      tabsDiv.appendChild(b);
    });
  } else {
    etat.attrTab = 'objet'; // circles only have the Objet tab
    const b = document.createElement('button');
    b.className = 'attrTabBtn active';
    b.textContent = 'Objet';
    tabsDiv.appendChild(b);
  }

  // --- content table (tabbed for polygons, single view for circle) ---
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = (obj.type==='polygon' && etat.attrTab==='angles')
    ? '<th>Champ</th><th>Nom</th><th>Valeur</th><th>Figé</th>'
    : '<th>Champ</th><th>Nom</th><th>Valeur</th>';
  tbl.appendChild(head);

  if(etat.attrTab==='objet'){
    const parcelleForSurf = etat.objects.find(o=>o.key==='parcelle');
    const sParcelle = parcelleForSurf ? shoelace(parcelleForSurf.pts) : 0;
    const surf = obj.type==='polygon' ? shoelace(obj.pts) : (obj.type==='circle' ? Math.PI*obj.r*obj.r : null);
    const addRow = (label, valueEl) => {
      const tr=document.createElement('tr');
      const td0=document.createElement('td'); td0.textContent=label;
      const td1=document.createElement('td');
      const td2=document.createElement('td'); td2.appendChild(valueEl);
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      tbl.appendChild(tr);
    };
    const typeSpan = document.createElement('span');
    typeSpan.textContent = ctx.libelleTypeObjet(obj);
    addRow('Type', typeSpan);

    const colorInp = document.createElement('input'); colorInp.type='color'; colorInp.value = obj.fill;
    colorInp.addEventListener('input', ()=>{
      obj.fill = colorInp.value;
      if(obj.type==='path'){ vue(obj).el.setAttribute('stroke', obj.fill); obj.stroke = obj.fill; }
      else vue(obj).el.setAttribute('fill', obj.fill);
      ctx.markDirty();
      ctx.rebuildSelector();
    });
    addRow('Couleur', colorInp);

    const fnSelect = document.createElement('select');
    ['terrain','batiment','annexe','arbre','terrasse','massif','mobilier','dalle','equipement','chemin','parasol','limite','autre'].forEach(opt=>{
      const o2 = document.createElement('option'); o2.value=opt; o2.textContent=opt;
      if(obj.fonction===opt) o2.selected=true;
      fnSelect.appendChild(o2);
    });
    fnSelect.addEventListener('change', ()=>{
      // Plusieurs champs (Élévation, Texture, les champs "arbre" ci-dessous...) n'apparaissent
      // ou ne disparaissent que selon la Fonction - sans le re-rendu, ils restent invisibles
      // jusqu'a ce que l'utilisateur reselectionne l'objet, ce qui les fait passer pour absents.
      obj.fonction = fnSelect.value;
      ctx.markDirty();
      ctx.renderAttrTable();
    });
    addRow('Fonction', fnSelect);

    const prioInp = document.createElement('input'); prioInp.type='number'; prioInp.step='1'; prioInp.value=obj.priority;
    prioInp.title = 'Priorite d\'affichage : plus eleve = dessine au-dessus des autres (hors objet selectionne, toujours au premier plan)';
    prioInp.addEventListener('change', ()=>{ obj.priority = parseInt(prioInp.value,10)||0; ctx.markDirty(); ctx.reapplyStackingOrder(); ctx.render(); });
    addRow('Priorité affichage', prioInp);

    const matInp = document.createElement('input'); matInp.type='text'; matInp.value=obj.matiere||'';
    matInp.placeholder='ex: beton, bois, gazon...';
    matInp.addEventListener('input', ()=>{ obj.matiere = matInp.value; ctx.markDirty(); });
    addRow('Matière', matInp);

    // La hauteur sert la Vue 3D (option "Afficher tous les objets") : chaque objet du plan y
    // devient un bloc simple extrude a cette hauteur. Une terrasse fait exception - elle a deja
    // sa propre modelisation dans Mode Terrasse, seule source fiable pour elle, donc le champ ici
    // est desactive et affiche cette valeur calculee plutot que d'en proposer une seconde,
    // saisissable, qui pourrait diverger de la premiere.
    if(obj.fonction !== 'camera'){
      // La parcelle/un terrain n'a pas de hauteur (toujours plat par definition) : le champ
      // Élévation n'a pas de sens pour elle, mais elle recoit quand meme les deux champs Texture
      // juste apres, comme tout objet autre qu'un point de vue.
      if(obj.key !== 'parcelle' && obj.fonction !== 'terrain'){
        if(obj.fonction === 'terrasse' && obj.type==='polygon'){
          const elevSpan = document.createElement('span');
          elevSpan.style.cssText = 'font-variant-numeric:tabular-nums; color:var(--ink-soft);';
          // 3 decimales : a 2, 0.095 m arrondit en "0.10 m" et fait croire a un centimetre de plus
          // que ce que la Construction affiche ("9.5 cm").
          elevSpan.textContent = ctx.elevationOf(obj).toFixed(3) + ' m';
          addRow('Élévation (m)', elevSpan);
          const noteTr = document.createElement('tr');
          const noteTd = document.createElement('td'); noteTd.colSpan = 3;
          noteTd.style.cssText = 'font-size:0.8rem; color:var(--ink-soft); padding-top:0;';
          noteTd.textContent = 'calculee depuis Mode Terrasse (appui + structure + lame) — non modifiable ici';
          noteTr.appendChild(noteTd); tbl.appendChild(noteTr);
        } else {
          const elevInp = document.createElement('input'); elevInp.type='number'; elevInp.step='0.1'; elevInp.min='0';
          elevInp.value = ctx.elevationOf(obj).toFixed(2);
          elevInp.title = 'Hauteur au-dessus du sol, utilisee par la Vue 3D (option "Afficher tous les objets")';
          elevInp.addEventListener('change', ()=>{ obj.elevation = Math.max(0, parseFloat(elevInp.value)) || 0; ctx.markDirty(); });
          addRow('Élévation (m)', elevInp);
        }
      }

      // Texture verticale = les faces laterales du bloc extrude en Vue 3D (murs) ; horizontale =
      // le dessus (toit). Deux champs separes parce qu'un mur et un toit ne partagent quasiment
      // jamais le meme materiau. Chacun ouvre le meme selecteur Poly Haven, juste range dans un
      // champ different a l'enregistrement.
      const champTexture = (label, cle) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const tex = obj[cle];
        const vignette = document.createElement('img');
        vignette.style.cssText = 'width:28px; height:28px; object-fit:cover; border-radius:2px; border:1px solid var(--rule); background:var(--accent-light,#eee);';
        vignette.src = tex ? tex.vignette : '';
        vignette.style.visibility = tex ? 'visible' : 'hidden';
        const nomSpan = document.createElement('span');
        nomSpan.style.cssText = 'font-size:0.82rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        nomSpan.textContent = tex ? tex.nom : 'Aucune (couleur unie)';
        const choisirBtn = document.createElement('button'); choisirBtn.type='button'; choisirBtn.className='secondary small';
        choisirBtn.textContent = tex ? 'Changer…' : 'Choisir…';
        choisirBtn.addEventListener('click', ()=>{
          // Les chemins d'un meme jardin partagent presque toujours le meme revetement : la case
          // "appliquer a tous les chemins" evite de repeter la recherche/choix chemin par chemin,
          // et pose la MEME texture sur les deux champs (vertical + horizontale) de chacun - pas
          // seulement celui qu'on est en train d'editer - pour qu'aucun chemin ne se retrouve
          // avec un dessus et des bords depareilles.
          const estChemin = obj.fonction === 'chemin';
          ouvrirSelecteurTexture(label, (choix, appliquerTous)=>{
            if(appliquerTous){
              etat.objects.filter(o=>o.fonction==='chemin').forEach(o=>{
                o.textureVerticale = choix; o.textureHorizontale = choix;
              });
            } else {
              obj[cle] = choix;
            }
            ctx.markDirty();
            ctx.renderAttrTable();
            const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
            if(t) ctx.buildThreeScene(t);
          }, estChemin ? { checkboxLabel: 'Appliquer à tous les chemins (vertical + horizontale)' } : undefined);
        });
        wrap.appendChild(vignette); wrap.appendChild(nomSpan); wrap.appendChild(choisirBtn);
        if(tex){
          const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.className='secondary small';
          clearBtn.textContent = '×'; clearBtn.title = 'Retirer cette texture';
          clearBtn.addEventListener('click', ()=>{
            obj[cle] = null; ctx.markDirty(); ctx.renderAttrTable();
            const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
            if(t) ctx.buildThreeScene(t);
          });
          wrap.appendChild(clearBtn);
        }
        addRow(label, wrap);
      };
      champTexture('Texture verticale', 'textureVerticale');
      champTexture('Texture horizontale', 'textureHorizontale');

      if(obj.fonction === 'arbre'){
        // Le feuillage est une sphere posee sur le tronc (le prisme existant, base sur l'emprise
        // et l'Élévation ci-dessus, qui reste la hauteur du TRONC) - un jeu de champs a part,
        // independant de la silhouette/hauteur du tronc, parce qu'un feuillage n'a ni la meme
        // forme ni la meme matiere que l'ecorce.
        const diamInp = document.createElement('input'); diamInp.type='number'; diamInp.step='0.1'; diamInp.min='0.1';
        diamInp.value = (obj.diametreArbre !== undefined && obj.diametreArbre !== null) ? obj.diametreArbre : 3;
        diamInp.title = 'Diametre du feuillage (sphere posee sur le tronc), utilise par la Vue 3D';
        diamInp.addEventListener('change', ()=>{
          obj.diametreArbre = Math.max(0.1, parseFloat(diamInp.value)) || 3;
          ctx.markDirty();
          const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) ctx.buildThreeScene(t);
        });
        addRow('Diamètre du feuillage (m)', diamInp);

        const couleurArbreInp = document.createElement('input'); couleurArbreInp.type='color';
        couleurArbreInp.value = obj.couleurArbre || '#4a7c3a';
        couleurArbreInp.title = 'Couleur du feuillage';
        couleurArbreInp.addEventListener('input', ()=>{
          obj.couleurArbre = couleurArbreInp.value;
          ctx.markDirty();
          const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) ctx.buildThreeScene(t);
        });
        addRow('Couleur du feuillage', couleurArbreInp);

        champTexture('Texture du feuillage', 'textureArbre');
      }

      if(obj.fonction === 'parasol'){
        // Terrasse de rattachement : c'est elle dont l'ombrage est mesure et sur laquelle porte la
        // recherche de position. Indispensable des qu'il y a plusieurs terrasses.
        const terrasses = etat.objects.filter(o=>o.fonction==='terrasse');
        const tSelect = document.createElement('select');
        if(!terrasses.length){
          const o0 = document.createElement('option');
          o0.textContent = 'Aucune terrasse dans le plan'; o0.value = '';
          tSelect.appendChild(o0); tSelect.disabled = true;
        } else {
          const courante = terrasseDuParasol(obj, etat.objects, etat.terrasseSelectedKey);
          terrasses.forEach(t=>{
            const o2 = document.createElement('option');
            o2.value = t.key; o2.textContent = t.name;
            if(courante && t.key === courante.key) o2.selected = true;
            tSelect.appendChild(o2);
          });
          // Le lien retenu par defaut (celle qui contient le parasol) est ecrit en dur des le
          // premier affichage : sans ca, il resterait implicite et changerait tout seul si on
          // deplacait le parasol hors de cette terrasse.
          if(courante) obj.terrasseLieeKey = courante.key;
        }
        tSelect.addEventListener('change', ()=>{
          obj.terrasseLieeKey = tSelect.value;
          ctx.markDirty();
          ctx.render();
        });
        addRow('Terrasse rattachée', tSelect);

        // Le diametre de la toile est deja le "Rayon" du cercle (champ existant plus bas) : seule
        // la hauteur du mat manque, c'est elle qui fixe la longueur de l'ombre projetee.
        const hInp = document.createElement('input'); hInp.type='number'; hInp.step='0.1'; hInp.min='0.5';
        hInp.value = hauteurParasolDe(obj);
        hInp.title = 'Hauteur de la toile au-dessus du sol - plus le mat est haut, plus l\'ombre se decale loin du pied';
        hInp.addEventListener('change', ()=>{
          obj.hauteurParasol = Math.max(0.5, parseFloat(hInp.value)) || 2.2;
          hInp.value = obj.hauteurParasol;
          ctx.markDirty();
          ctx.render();
          const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) ctx.buildThreeScene(t);
        });
        addRow('Hauteur du mât (m)', hInp);

        const cbBord = document.createElement('input'); cbBord.type='checkbox'; cbBord.checked = !!obj.matSurPerimetre;
        cbBord.title = 'Le pied reste colle au pourtour de la terrasse rattachee - y compris quand on glisse le parasol, et la recherche de position ne teste plus que le bord';
        cbBord.addEventListener('change', ()=>{
          obj.matSurPerimetre = cbBord.checked;
          ctx.markDirty();
          ctx.render(); ctx.renderAttrTable();
        });
        addRow('Mât sur le périmètre de la terrasse', cbBord);

        const cbDep = document.createElement('input'); cbDep.type='checkbox'; cbDep.checked = !!obj.matDeporte;
        cbDep.title = 'Parasol deporte : le mat n\'est plus au centre de la toile mais sur son bord, ce qui degage la surface sous la toile';
        cbDep.addEventListener('change', ()=>{
          obj.matDeporte = cbDep.checked;
          ctx.markDirty();
          ctx.render(); ctx.renderAttrTable();
          const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) ctx.buildThreeScene(t);
        });
        addRow('Mât déporté (en bord de toile)', cbDep);

        if(obj.matDeporte){
          const angInp = document.createElement('input'); angInp.type='number'; angInp.step='5';
          angInp.value = String(Math.round(matAngleDe(obj)));
          angInp.title = 'Direction du pied vu depuis le centre de la toile : 0 = Est, 90 = Nord';
          angInp.addEventListener('change', ()=>{
            obj.matAngleDeg = ((parseFloat(angInp.value)||0) % 360 + 360) % 360;
            angInp.value = String(Math.round(obj.matAngleDeg));
            ctx.markDirty();
            ctx.render();
            const t = ctx.vue3dOuverte() && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
            if(t) ctx.buildThreeScene(t);
          });
          addRow('Orientation du mât (°)', angInp);
        }

        const dateInp = document.createElement('input'); dateInp.type='date'; dateInp.value = etat.parasol.dateStr;
        dateInp.addEventListener('change', ()=>{ if(dateInp.value){ etat.parasol.dateStr = dateInp.value; ctx.render(); } });
        addRow('Ombre — date', dateInp);

        const wrapH = document.createElement('div');
        wrapH.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const heureInp = document.createElement('input'); heureInp.type='range';
        heureInp.min='0'; heureInp.max='1439'; heureInp.step='5'; heureInp.value = etat.parasol.minutes;
        heureInp.style.cssText = 'flex:1;';
        const heureTxt = document.createElement('span');
        heureTxt.style.cssText = 'min-width:44px; text-align:right; font-variant-numeric:tabular-nums;';
        heureTxt.textContent = formatHeureMin(etat.parasol.minutes);
        heureInp.addEventListener('input', ()=>{
          etat.parasol.minutes = parseInt(heureInp.value,10);
          heureTxt.textContent = formatHeureMin(etat.parasol.minutes);
          ctx.render();
        });
        wrapH.appendChild(heureInp); wrapH.appendChild(heureTxt);
        addRow('Ombre — heure', wrapH);

        const cbOmbre = document.createElement('input'); cbOmbre.type='checkbox'; cbOmbre.checked = etat.parasol.ombreAffichee;
        cbOmbre.addEventListener('change', ()=>{ etat.parasol.ombreAffichee = cbOmbre.checked; ctx.render(); });
        addRow('Afficher l\'ombre', cbOmbre);

        const cbCarte = document.createElement('input'); cbCarte.type='checkbox'; cbCarte.checked = etat.parasol.carteAffichee;
        cbCarte.title = 'Colore la terrasse selon la part des apres-midis d\'ete (mai a septembre, 12h-18h) passee a l\'ombre';
        cbCarte.addEventListener('change', ()=>{ etat.parasol.carteAffichee = cbCarte.checked; ctx.render(); });
        addRow('Carte de chaleur (heures d\'ombre)', cbCarte);

        const wrapOpt = document.createElement('div');
        wrapOpt.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
        const optBtn = document.createElement('button'); optBtn.type='button'; optBtn.className='objbtn small';
        optBtn.textContent = 'Placer au mieux';
        const optTxt = document.createElement('span');
        optTxt.style.cssText = 'font-size:0.8rem; color:var(--ink-soft);';
        optBtn.addEventListener('click', ()=>{
          const terr = terrasseDuParasol(obj, etat.objects, etat.terrasseSelectedKey);
          if(!terr){ showToast('Aucune terrasse : cree d\'abord un objet avec Fonction = terrasse.'); return; }
          optBtn.disabled = true; optBtn.textContent = 'Recherche…';
          // Laisse le navigateur peindre l'etat "Recherche…" avant de bloquer le thread : sans ce
          // report, le calcul demarre dans le meme tour de boucle et le bouton ne change jamais
          // visuellement d'aspect.
          setTimeout(()=>{
            const res = chercherMeilleurePositionParasol(obj, ctx.contexteSoleilParasol(), etat.objects);
            optBtn.disabled = false; optBtn.textContent = 'Placer au mieux';
            if(!res){ showToast('Pas de position calculable (soleil trop bas ou terrasse trop petite).'); return; }
            ctx.pushHistory();
            obj.center.x = res.x; obj.center.y = res.y;
            if(obj.matDeporte && res.angleDeg !== undefined) obj.matAngleDeg = res.angleDeg;
            ctx.render();
            ctx.renderAttrTable();
            showToast('Parasol place sur "' + terr.name + '" : ' + (res.couverture*100).toFixed(0) + ' % a l\'ombre en moyenne (mai-sept., 12h-18h).');
          }, 30);
        });
        optTxt.textContent = 'Cherche sur la terrasse la position qui ombrage le plus, mai→sept. 12h–18h.';
        wrapOpt.appendChild(optBtn); wrapOpt.appendChild(optTxt);
        addRow('Meilleure position', wrapOpt);
      }
    }

    if(surf !== null && obj.fonction !== 'camera'){
      const surfSpan = document.createElement('span');
      surfSpan.textContent = surf.toFixed(2) + ' m²' + (obj.key!=='parcelle' && sParcelle>0 ? '  (' + (surf/sParcelle*100).toFixed(1) + ' % de la parcelle)' : '');
      addRow('Surface', surfSpan);
    }

    const lockCb = document.createElement('input'); lockCb.type='checkbox'; lockCb.checked = !!obj.locked;
    lockCb.title = 'Verrouille l\'objet entier : bloque le glisser, la suppression, l\'ajout/suppression de points';
    lockCb.addEventListener('change', ()=>{ ctx.pushHistory(); obj.locked = lockCb.checked; ctx.render(); });
    addRow('Verrouiller objet', lockCb);

    if(obj.type==='polygon' && obj.pts.length===4){
      const rectCb = document.createElement('input'); rectCb.type='checkbox';
      // Derived from the freeze state rather than a separate stored flag: freezing all 4
      // corners is what actually blocks angle/length edits elsewhere in the app (Coins/
      // Cotes tabs, point/edge drag), so this stays true to reality even if a corner gets
      // individually un-frozen later (double-click on a point handle).
      rectCb.checked = obj.frozenVertices.every(Boolean);
      rectCb.title = 'Verrouille les 4 angles a 90 degres (fige les 4 coins)';
      rectCb.addEventListener('change', ()=>{
        if(rectCb.checked){
          // Deja d'equerre : on verrouille tel quel, sans redresser. Une terrasse rectangulaire
          // mais orientee a 30 degres n'a aucune raison de basculer sur les axes de l'ecran.
          if(ctx.dejaRectangle(obj.pts)){
            ctx.pushHistory();
            obj.frozenVertices = obj.frozenVertices.map(()=>true);
            ctx.render();
            return;
          }
          const xs = obj.pts.map(p=>p.x), ys = obj.pts.map(p=>p.y);
          const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
          // Envoyer chaque point vers le coin le plus proche selon les medianes parait naturel,
          // mais sur une forme oblique (losange, parallelogramme) deux points atterrissent sur le
          // MEME coin et le polygone devient degenere. On attribue donc les quatre coins dans
          // l'ordre de parcours, en partant de celui le plus proche du premier point : quatre
          // coins distincts, et le sens de rotation conserve.
          const coins = [{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];
          if(signedArea(obj.pts) < 0) coins.reverse();
          let depart = 0, meilleure = Infinity;
          coins.forEach((cc,k)=>{ const d = dist(cc, obj.pts[0]); if(d < meilleure){ meilleure = d; depart = k; } });
          const newPts = obj.pts.map((_,i)=>({ ...coins[(depart+i)%4] }));
          const bound = (obj.constrained && etat.objects.find(o=>o.key==='parcelle')) ? etat.objects.find(o=>o.key==='parcelle').pts : null;
          if(bound && !newPts.every(p=>pointInPolygon(p,bound))){
            showToast('Le rectangle sortirait de la parcelle - mode rectangle non active.');
            rectCb.checked = false;
            return;
          }
          ctx.pushHistory();
          obj.pts = newPts;
          obj.frozenVertices = obj.frozenVertices.map(()=>true);
          ctx.rebuildHandles(obj);
        } else {
          ctx.pushHistory();
          obj.frozenVertices = obj.frozenVertices.map(()=>false);
        }
        ctx.render();
      });
      addRow('Mode rectangle (angles à 90°)', rectCb);
    }

    if(obj.type==='circle'){
      const rr=document.createElement('input'); rr.type='number'; rr.step='0.01'; rr.min='0.1';
      rr.value = obj.r.toFixed(2);
      rr.addEventListener('change', ()=>{
        const v = parseFloat(rr.value);
        if(!isNaN(v) && v>0.05){
          ctx.pushHistory();
          const bound = (obj.constrained && etat.objects.find(o=>o.key==='parcelle')) ? etat.objects.find(o=>o.key==='parcelle').pts : null;
          let ok = !bound;
          if(bound){
            ok = true;
            for(let a=0;a<16;a++){
              const ang=a/16*2*Math.PI;
              const bp={x:obj.center.x+v*Math.cos(ang), y:obj.center.y+v*Math.sin(ang)};
              if(!pointInPolygon(bp,bound)){ ok=false; break; }
            }
          }
          if(ok) obj.r=v; else rr.value=obj.r.toFixed(2);
          ctx.render();
        }
      });
      addRow('Rayon (m)', rr);
    }

    if(obj.type==='path' && obj.fonction!=='camera'){
      let totalLen = 0;
      for(let i=0;i<obj.pts.length-1;i++) totalLen += dist(obj.pts[i], obj.pts[i+1]);
      const lenSpan = document.createElement('span'); lenSpan.textContent = totalLen.toFixed(2) + ' m';
      addRow('Longueur totale', lenSpan);

      const wInp = document.createElement('input'); wInp.type='number'; wInp.step='0.05'; wInp.min='0.05';
      wInp.value = (obj.width||1).toFixed(2);
      wInp.addEventListener('change', ()=>{
        const v = parseFloat(wInp.value);
        if(!isNaN(v) && v>0){ ctx.pushHistory(); obj.width = v; ctx.render(); }
      });
      addRow('Largeur (m)', wInp);

      const curveCb = document.createElement('input'); curveCb.type='checkbox'; curveCb.checked = !!obj.curve;
      curveCb.addEventListener('change', ()=>{ obj.curve = curveCb.checked; ctx.markDirty(); ctx.render(); });
      addRow('Courbe (passe par les points)', curveCb);
    }

    // Point de vue : le point 1 (pts[0]) porte la position, le point 2 (pts[1]) la direction -
    // glisser l'un ou l'autre sur le plan les regle directement. La direction affichee ici est
    // DERIVEE des deux points a chaque fois, jamais stockee a part : deplacer un point sur le
    // plan ne pourrait sinon plus jamais desynchroniser le nombre affiche de la fleche dessinee.
    if(obj.type==='path' && obj.fonction==='camera'){
      if(obj.altitude===undefined) obj.altitude = 1.6;
      const altInp = document.createElement('input'); altInp.type='number'; altInp.step='0.1'; altInp.min='0.1';
      altInp.value = obj.altitude.toFixed(2);
      altInp.title = 'Hauteur de la camera au-dessus du sol (m)';
      altInp.addEventListener('change', ()=>{ obj.altitude = Math.max(0.1, parseFloat(altInp.value)||1.6); ctx.markDirty(); });
      addRow('Altitude (m)', altInp);

      const ddx = obj.pts[1].x-obj.pts[0].x, ddy = obj.pts[1].y-obj.pts[0].y;
      const distDir = Math.hypot(ddx,ddy) || 2;
      const dirActuel = Math.atan2(ddy,ddx)*180/Math.PI;
      const dirInp = document.createElement('input'); dirInp.type='number'; dirInp.step='5';
      dirInp.value = String(Math.round(dirActuel));
      dirInp.title = 'Direction visee, en degres : 0° = Est, 90° = Nord. Deplace le point "Direction" sur le plan - ce champ le suit, ou le repositionne.';
      dirInp.addEventListener('change', ()=>{
        const rad = (parseFloat(dirInp.value)||0)*Math.PI/180;
        obj.pts[1] = { x: obj.pts[0].x+Math.cos(rad)*distDir, y: obj.pts[0].y+Math.sin(rad)*distDir };
        ctx.markDirty();
        ctx.render();
      });
      addRow('Direction (°)', dirInp);

      const gotoBtn = document.createElement('button'); gotoBtn.type='button'; gotoBtn.className='secondary small';
      gotoBtn.textContent = 'Aller à cette vue en Vue 3D';
      gotoBtn.addEventListener('click', ()=>ctx.allerAuPointDeVue(obj));
      addRow('', gotoBtn);
    }

    if(obj.type==='polygon' || obj.type==='path'){
      const alignTitle = document.createElement('div');
      alignTitle.className = 'sectionTitle';
      alignTitle.style.marginTop = '10px';
      alignTitle.textContent = 'Alignement par rotation';
      const tr0 = document.createElement('tr');
      const td0a = document.createElement('td'); td0a.colSpan = 3; td0a.appendChild(alignTitle);
      tr0.appendChild(td0a); tbl.appendChild(tr0);

      const explainRow = document.createElement('tr');
      const explainTd = document.createElement('td'); explainTd.colSpan = 3;
      explainTd.className = 'hint';
      explainTd.textContent = "Choisis un segment cible sur le plan (n'importe quel objet) : l'objet sélectionné pivote autour du milieu de son côté le plus proche de ce segment cible, pour devenir parallèle à celui-ci.";
      explainRow.appendChild(explainTd); tbl.appendChild(explainRow);

      const btnRow = document.createElement('tr');
      const btnTd = document.createElement('td'); btnTd.colSpan = 3;
      const pickBtn = document.createElement('button');
      pickBtn.className = 'secondary small';
      const isPickingAlign = ctx.pickState() && ctx.pickState().purpose==='align';
      pickBtn.textContent = isPickingAlign ? 'Clique un segment sur le plan…' : 'Choisir un segment cible';
      if(isPickingAlign) pickBtn.disabled = true;
      pickBtn.addEventListener('click', ()=>ctx.startPick('ref', false, 'align'));
      btnTd.appendChild(pickBtn);
      btnRow.appendChild(btnTd); tbl.appendChild(btnRow);

      const infoRow = document.createElement('tr');
      const infoTd = document.createElement('td'); infoTd.colSpan = 3;
      infoTd.style.fontSize = '0.8rem'; infoTd.style.padding = '4px 6px';
      let nearestLbl = '(choisis d\'abord un segment cible)';
      if(cibleAlignement()){
        const tgt = ctx.measureSegCoords(cibleAlignement());
        if(tgt){
          const idx = nearestSegmentIndex(obj, tgt);
          if(idx>=0) nearestLbl = obj.segmentNames[idx] || ('Cote '+(idx+1));
        }
      }
      infoTd.textContent = 'Segment cible : ' + ctx.refLabel(cibleAlignement()) + '  |  Côté le plus proche de "' + obj.name + '" : ' + nearestLbl;
      infoRow.appendChild(infoTd); tbl.appendChild(infoRow);

      const distRow = document.createElement('tr');
      const distTd0 = document.createElement('td'); distTd0.textContent = 'Distance au segment (m)';
      const distTd1 = document.createElement('td');
      const distTd2 = document.createElement('td');
      const distInp = document.createElement('input'); distInp.id='alignDistanceInput';
      distInp.type='number'; distInp.step='0.01'; distInp.min='0';
      distInp.placeholder='vide = pas de changement';
      distInp.value = alignDistanceValue;
      distInp.addEventListener('input', ()=>{ alignDistanceValue = distInp.value; });
      distTd2.appendChild(distInp);
      distRow.appendChild(distTd0); distRow.appendChild(distTd1); distRow.appendChild(distTd2);
      tbl.appendChild(distRow);

      const alignBtnRow = document.createElement('tr');
      const alignBtnTd = document.createElement('td'); alignBtnTd.colSpan = 3;
      const alignBtn = document.createElement('button');
      alignBtn.textContent = 'Aligner par rotation';
      alignBtn.disabled = !cibleAlignement() || obj.locked;
      alignBtn.title = obj.locked ? 'Objet verrouille' : '';
      alignBtn.addEventListener('click', ()=>{ ctx.alignObjectByRotation(obj); });
      alignBtnTd.appendChild(alignBtn);
      alignBtnRow.appendChild(alignBtnTd); tbl.appendChild(alignBtnRow);
    }
  } else if(obj.type==='polygon' && etat.attrTab==='angles'){
    obj.vertexNames.forEach((vn,i)=>{
      const tr=document.createElement('tr');
      if(etat.highlight.type==='vertex' && etat.highlight.index===i) tr.className='highlightRow';
      const frozen = !!obj.frozenVertices[i];
      const td0=document.createElement('td'); td0.textContent='Coin '+(i+1)+' (angle)';
      const td1=document.createElement('td');
      const ii=document.createElement('input'); ii.type='text'; ii.value=vn;
      ii.addEventListener('input', ()=>{
        // Targeted update instead of ctx.render(): ctx.render() rebuilds this whole table from
        // scratch, which recreates this very input and kills focus/cursor on every keystroke.
        obj.vertexNames[i] = ii.value;
        if(vue(obj).ptLabelEls && vue(obj).ptLabelEls[i]){
          const vName = obj.vertexNames[i] || ('P'+(i+1));
          const showAngleHere = obj.showAngles && obj.type==='polygon';
          const angleTxt = showAngleHere ? angleEnDegres(ctx.interiorAngleDeg(obj,i), DEGRE_ECRAN) : '';
          vue(obj).ptLabelEls[i].textContent = etiquetteComposee(vName, angleTxt, obj.showVertNames, showAngleHere, SEP_ECRAN);
        }
      });
      td1.appendChild(ii);
      const td2=document.createElement('td');
      const ang=document.createElement('input'); ang.type='number'; ang.step='0.1';
      ang.value = ctx.interiorAngleDeg(obj,i).toFixed(1);
      ang.disabled = frozen;
      ang.title = frozen ? 'Angle fige - decoche "Fige" pour le modifier' : '';
      ang.addEventListener('change', ()=>{
        const v = parseFloat(ang.value);
        if(!isNaN(v)){
          ctx.pushHistory();
          const ok = ctx.applyAngleEdit(obj,i,v);
          if(!ok) ang.value = ctx.interiorAngleDeg(obj,i).toFixed(1); // reverted: would exit parcelle
          ctx.rebuildHandles(obj); ctx.render();
        }
      });
      const spanDeg = document.createElement('span'); spanDeg.textContent=' °'; spanDeg.style.fontSize='0.75rem';
      td2.appendChild(ang); td2.appendChild(spanDeg);
      const delBtnV = document.createElement('button');
      delBtnV.textContent = 'Supprimer'; delBtnV.className='secondary small';
      delBtnV.style.marginLeft = '6px';
      delBtnV.disabled = obj.pts.length <= 3 || frozen;
      delBtnV.title = obj.pts.length<=3 ? 'Impossible: il faut garder au moins 3 sommets' : (frozen ? 'Coin fige' : 'Supprime ce coin (fusionne les deux cotes voisins)');
      delBtnV.addEventListener('click', ()=>{ ctx.deleteVertex(obj, i); });
      td2.appendChild(delBtnV);
      const td3 = document.createElement('td');
      const fz = document.createElement('input'); fz.type='checkbox'; fz.checked=frozen;
      fz.title = 'Figer cet angle : empeche de le deplacer (glisser, longueur adjacente, angle) pour faciliter les autres modifications';
      fz.addEventListener('change', ()=>{ obj.frozenVertices[i]=fz.checked; ctx.render(); });
      td3.appendChild(fz);
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbl.appendChild(tr);
    });
  } else if((obj.type==='polygon' || obj.type==='path') && etat.attrTab==='segments'){
    if(obj.type==='path'){
      obj.vertexNames.forEach((vn,i)=>{
        const tr=document.createElement('tr');
        if(etat.highlight.type==='vertex' && etat.highlight.index===i) tr.className='highlightRow';
        const td0=document.createElement('td'); td0.textContent='Point '+(i+1);
        const td1=document.createElement('td');
        const ii=document.createElement('input'); ii.type='text'; ii.value=vn;
        ii.addEventListener('input', ()=>{
          obj.vertexNames[i] = ii.value;
          if(vue(obj).ptLabelEls && vue(obj).ptLabelEls[i]){
            const vName = obj.vertexNames[i] || ('P'+(i+1));
            vue(obj).ptLabelEls[i].textContent = obj.showVertNames ? vName : '';
          }
        });
        td1.appendChild(ii);
        const td2=document.createElement('td');
        const delBtnP = document.createElement('button');
        delBtnP.textContent = 'Supprimer'; delBtnP.className='secondary small';
        delBtnP.disabled = obj.pts.length <= 2;
        delBtnP.title = obj.pts.length<=2 ? 'Impossible: il faut garder au moins 2 points' : 'Supprime ce point';
        delBtnP.addEventListener('click', ()=>{ ctx.deleteVertex(obj, i); });
        td2.appendChild(delBtnP);
        tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
        tbl.appendChild(tr);
      });
    }
    const minPts = obj.type==='path' ? 2 : 3;
    obj.segmentNames.forEach((sn,i)=>{
      const n = obj.pts.length;
      if(obj.type==='path' && i >= n-1) return; // no closing segment for open paths
      const tr=document.createElement('tr');
      if(etat.highlight.type==='segment' && etat.highlight.index===i) tr.className='highlightRow';
      const td0=document.createElement('td'); td0.textContent='Cote '+(i+1)+' (longueur)';
      const td1=document.createElement('td');
      const ii=document.createElement('input'); ii.type='text'; ii.value=sn;
      ii.addEventListener('input', ()=>{
        obj.segmentNames[i] = ii.value;
        if(vue(obj).segLabelEls && vue(obj).segLabelEls[i]){
          const a=obj.pts[i], b=obj.pts[(i+1)%obj.pts.length];
          vue(obj).segLabelEls[i].textContent = etiquetteComposee(
            obj.segmentNames[i], longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_ECRAN
          );
        }
      });
      td1.appendChild(ii);
      const td2=document.createElement('td');
      const len=document.createElement('input'); len.type='number'; len.step='0.01'; len.min='0.05';
      len.value = dist(obj.pts[i], obj.pts[(i+1)%n]).toFixed(2);
      const aFrozenUi = !!obj.frozenVertices[i];
      const bFrozenUi = !!obj.frozenVertices[(i+1)%n];
      const bothFrozenUi = aFrozenUi && bFrozenUi;
      len.disabled = bothFrozenUi;
      len.title = bothFrozenUi ? 'Les deux coins de ce cote sont figes' : (aFrozenUi || bFrozenUi ? 'Un coin est fige : l\'autre extremite du cote sera deplacee pour atteindre cette longueur' : '');
      len.addEventListener('change', ()=>{
        const v = parseFloat(len.value);
        if(!isNaN(v) && v>0){
          ctx.pushHistory();
          const ok = ctx.applyLengthEdit(obj,i,v);
          if(!ok) len.value = dist(obj.pts[i], obj.pts[(i+1)%n]).toFixed(2); // reverted
          ctx.rebuildHandles(obj); ctx.render();
        }
      });
      const spanM = document.createElement('span'); spanM.textContent=' m'; spanM.style.fontSize='0.75rem';
      td2.appendChild(len); td2.appendChild(spanM);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer'; delBtn.className='secondary small';
      delBtn.style.marginLeft = '6px';
      delBtn.disabled = obj.pts.length <= minPts;
      delBtn.title = obj.pts.length<=minPts ? 'Impossible: nombre minimum de sommets atteint' : 'Supprime ce cote (fusionne les deux sommets voisins)';
      delBtn.addEventListener('click', ()=>{ ctx.deleteVertex(obj, (i+1)%n); });
      td2.appendChild(delBtn);
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      tbl.appendChild(tr);
    });
  } else {
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent='(rien a afficher)';
    tr.appendChild(td0);
    tbl.appendChild(tr);
  }
}

