// Les commandes qui créent, dupliquent, reculent et suppriment un objet (spec §6.4, app/).
//
// Presque toutes se contentent d'appeler l'atelier. Les trois qui font autre chose le font pour une
// raison, et elle est écrite en face. Depuis l'étape 2 de la reconstruction de l'interface, c'est la
// palette (zones/Palette.tsx) et l'inspecteur (zones/Inspecteur.tsx) qui les déclenchent ; elles sont
// déclarées ici sans bouton. Une commande inactive — rien de sélectionné, rien à
// annuler — grise son bouton, là où l'ancienne rangée répondait par un message.

import { PERMISSION_ECRITURE } from '../acces.js';
import { showToast, showConfirm } from '../../shell/dialogs.js';
import { centroid } from '../../geometry/basic.js';
import { enPoints, enCercle } from '../../model/formes.js';
import { estPiscine, estTerrasse } from '../../model/fonctions.js';
import { decalageDeCentrage, terrasseDeLaPiscine } from '../../engine/ouvrages/liens.js';
import { terrasseCourante } from '../../core/contexteTerrasse.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import { suivreLeContour } from '../../model/ouvrages/index.js';
import { egoutRendable } from '../../model/protections.js';
import { lectureToits } from '../../core/lectureToits.js';

export function brancherObjets(a: Atelier, cmd: RegistreCommandes): void {
  const selection = () => !!a.etat.selectedKey;
  /**
   * Toute commande de ce groupe change le dessin, donc toute commande de ce groupe demande le
   * droit d'ecrire. C'est pose ici, une fois, plutot que ligne par ligne : une commande ajoutee
   * demain l'aura sans qu'on y pense, ce qui est exactement la garantie qu'on veut.
   *
   * `sansDroit` sert a l'annulation, et a elle seule : elle ne peut defaire que ce qu'on a eu le
   * droit de faire, donc en lecture seule sa pile est vide et la grisier serait un bruit de plus.
   */
  const commande = (id: string, libelle: string, executer: () => void, extra: { raccourci?: string; actif?: () => boolean; sansDroit?: boolean; assistant?: { bascule?: () => boolean } } = {}) => {
    const { sansDroit, ...reste } = extra;
    cmd.declarer({ id, libelle, groupe: 'objet', executer, ...reste, ...(sansDroit ? {} : { permission: PERMISSION_ECRITURE }) });
  };

  commande('objet.annuler', 'Annuler', a.undo, { raccourci: 'Ctrl+Z', sansDroit: true });

  // Des flèches explicites, et non `addEventListener('click', a.addNewObject)` : celui-ci passerait
  // l'événement en premier argument — un objet toujours vrai — et le polygone libre naîtrait en
  // mode rectangle.
  const ASSISTANT = { assistant: {} }; // L'assistant (lot L6) peut proposer ces gestes : sans question, ni pointage, ni dialogue.
  commande('objet.ajouter.polygone', 'Polygone', () => a.addNewObject(false));
  commande('objet.ajouter.rectangle', 'Rectangle', () => a.addNewObject(true));
  commande('objet.ajouter.chemin', 'Chemin', () => a.addNewPath());
  commande('objet.ajouter.cercle', 'Cercle', () => a.addNewCircle());
  commande('objet.ajouter.terrasse', 'Terrasse', () => a.addNewTerrasse(), ASSISTANT);
  commande('objet.ajouter.parasol', 'Parasol', () => a.addNewParasol(), ASSISTANT);
  commande('objet.ajouter.pergola', 'Pergola', () => a.addNewPergola(), ASSISTANT);
  commande('objet.ajouter.carport', 'Carport', () => a.addNewCarport(), ASSISTANT);
  commande('objet.ajouter.piscine', 'Piscine', () => a.addNewPiscine('rectangle'), ASSISTANT);
  commande('objet.ajouter.piscineRonde', 'Piscine ronde', () => a.addNewPiscine('ronde'), ASSISTANT);
  commande('objet.ajouter.pointDeVue', 'Point de vue', () => a.addNewViewpoint());
  // La plage en bois d'une piscine est une vraie terrasse du plan : la commande la pose autour du
  // bassin (sur plots), ou la selectionne si elle existe deja.
  const piscineChoisie = () => { const o = a.objByKey(a.etat.selectedKey); return o && estPiscine(o) ? o : undefined; };
  commande('objet.terrassePiscine', 'Terrasse autour de la piscine', () => {
    const p = piscineChoisie();
    if (!p) return;
    const t = terrasseDeLaPiscine(p, a.etat.objects);
    if (t) { a.selectObject(t.key); return; }
    a.addTerrassePiscine(p);
    showToast('Terrasse posée autour de la piscine, sur plots. Tirez ses coins pour lui donner sa forme.');
  }, { actif: () => !!piscineChoisie(), ...ASSISTANT });
  // Un trou dans la terrasse selectionnee (ou courante) : un arbre conserve, une trappe de visite.
  const terrasseDuTrou = () => { const o = a.objByKey(a.etat.selectedKey); return o && estTerrasse(o) ? o : terrasseCourante(a.etat); };
  commande('terrasse.ajouterTrou', 'Ajouter un trou dans la terrasse', () => {
    const t = terrasseDuTrou();
    if (t) a.addTrouTerrasse(t);
  }, { actif: () => !!terrasseDuTrou(), ...ASSISTANT });
  // La hauteur a l'egout saisie (ou validee par l'audit) rendue a la lecture : la marque tombe, et le toit se relit pour la reprendre
  // (model/protections.ts). Un geste annulable ; seulement quand une lecture pourra l'ecrire, sinon il ne changerait rien.
  const egoutARendre = () => { const o = a.objByKey(a.etat.selectedKey); return o && egoutRendable(o) ? o : undefined; };
  commande('objet.rendreEgout', 'Rendre au calcul', () => {
    const o = egoutARendre();
    if (!o?.batiment) return;
    a.pushHistory(o);
    delete o.batiment.egoutChoisi;
    o.batiment.toitLidarLu = null;
    a.render();
    lectureToits.demanderRelecture();
    showToast('La hauteur à l’égout de « ' + (o.name || 'ce bâtiment') + ' » redevient automatique : la lecture du toit la reprend.');
  }, { actif: () => !!egoutARendre() });
  // Les conditions que le panneau Objet posait sur ses anciens boutons : la parcelle ne se duplique
  // ni ne se supprime, un objet verrouille ne se supprime pas.
  const selectionne = () => a.objByKey(a.etat.selectedKey);
  commande('objet.dupliquer', 'Dupliquer', () => a.duplicateSelectedObject(), { actif: () => { const o = selectionne(); return !!o && o.key !== 'parcelle'; }, ...ASSISTANT });
  // Pas d'assistant pour supprimer : la commande pose une question, qu'une transaction n'attend pas.
  commande('objet.supprimer', 'Supprimer l’objet', () => a.deleteSelectedObject(), { actif: () => { const o = selectionne(); return !!o && o.key !== 'parcelle' && !o.locked; } });
  // Une piscine ou un trou recentre sur sa terrasse (la plage d'un bassin, ou celle qu'il perce) :
  // un seul geste, annulable. Deja centre a 1 mm pres, il n'y a rien a faire.
  const aCentrer = () => {
    const o = selectionne();
    if (!o || o.locked) return undefined;
    const d = decalageDeCentrage(o, a.etat.objects);
    return d && Math.hypot(d.x, d.y) > 0.001 ? { o, d } : undefined;
  };
  commande('objet.centrerSurTerrasse', 'Centrer sur la terrasse', () => {
    const x = aCentrer();
    if (!x) return;
    const { o, d } = x;
    a.pushHistory(o);
    if (o.type === 'circle') o.center = { x: o.center.x + d.x, y: o.center.y + d.y };
    else o.pts = o.pts.map(p => ({ x: p.x + d.x, y: p.y + d.y }));
    a.rebuildHandles(o);
    a.markDirty(o);
    a.render();
  }, { actif: () => !!aCentrer(), ...ASSISTANT });

  /**
   * Reculer d'un cran. Le double-clic sur la forme fait la même chose, mais c'est un geste fragile
   * au doigt sur une petite forme : le bouton le rend fiable, et surtout découvrable.
   *
   * Il dit aussi quand il ne se passe rien — « déjà au fond de sa priorité » — parce qu'un bouton
   * qui ne réagit pas se lit comme un bouton cassé.
   */
  commande('objet.reculer', 'Reculer d\'un plan', () => {
    const obj = a.objByKey(a.etat.selectedKey);
    if (!obj) { showToast('Selectionne d\'abord un objet.'); return; }
    if (obj.key === 'parcelle') { showToast('La parcelle reste toujours au fond.'); return; }
    a.pushHistory();
    const avant = a.etat.objects.indexOf(obj);
    a.sendObjectBackward(obj);
    if (a.etat.objects.indexOf(obj) === avant) showToast('Deja au fond de sa priorite d\'affichage.');
  }, { actif: selection });

  /**
   * Remettre un objet à sa place du chargement — sa place, pas sa forme.
   *
   * On translate donc l'objet par l'écart entre les deux centroïdes, au lieu de recopier les points
   * d'origine : un objet déplacé *et* redimensionné garde ce qu'on lui a fait, et retrouve seulement
   * sa position. Un objet créé après le chargement n'a pas de référence, et le bouton le dit.
   */
  commande('objet.positionInitiale', 'Réinitialiser la position', () => {
    const obj = a.objByKey(a.etat.selectedKey);
    if (!obj) { showToast('Selectionne d\'abord un objet.'); return; }
    const init = a.initialState().find(o => o.key === a.etat.selectedKey);
    if (!init) { showToast('Aucune position initiale enregistree pour cet objet (il a ete cree apres le chargement).'); return; }
    a.pushHistory(obj);
    if (obj.type === 'circle') {
      obj.center = { ...enCercle(init).center };
    } else {
      const initC = centroid(enPoints(init).pts);
      const curC = centroid(obj.pts);
      const d = { x: initC.x - curC.x, y: initC.y - curC.y };
      const avant = obj.pts.map(p => ({ ...p }));
      obj.pts.forEach(p => { p.x += d.x; p.y += d.y; });
      suivreLeContour(obj, avant, obj.pts);
    }
    a.render();
  }, { actif: selection });

  /**
   * Tout réinitialiser, par le même mécanisme que l'annulation : on repose l'instantané pris au
   * chargement.
   *
   * L'approche précédente — recopier quelques champs choisis sur les objets encore présents —
   * laissait silencieusement en place l'élévation, l'altitude, les textures, la construction, la
   * clôture, le parasol et les coordonnées GPS ; elle ne retirait jamais un objet ajouté depuis, et
   * n'en ramenait jamais un supprimé. Les cotes reviennent aussi : « réinitialiser » veut dire
   * réinitialiser.
   *
   * D'où la confirmation : ce bouton efface d'un clic tout le travail fait depuis le chargement.
   */
  cmd.declarer({ id: 'projet.reinitialiser', libelle: 'Réinitialiser tout', groupe: 'projet', permission: PERMISSION_ECRITURE, executer: () => {
    showConfirm('Reinitialiser tout le plan ? Les objets et les mesures reviennent a leur etat du chargement (annulable par Ctrl+Z).', () => {
      a.pushHistory();
      a.restoreState({ objects: a.initialState(), measures: a.initialMeasures() });
    });
  } });
}
