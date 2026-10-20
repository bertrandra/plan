// Les commandes du mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md) : entrer, valider, abandonner, annuler dans la session, et ce que
// le mode permet d'y faire — allumer ou couper les « Regles », poser un geste du catalogue, choisir le mur d'un element.
//
// Toute retouche passe par la session (app/modeToit.ts) : elle ecrit dans le batiment, la scene 3D la montre, et le projet ne recoit
// qu'une etape d'historique, a la validation.
//
// `toit.regles` : une bascule. Allumee, le toit se lit tout seul (LiDAR, faits, profils) ; coupee, le batiment est fige (`toitFige`) et
// rien ne le reecrit. Rallumer reprend la lecture et perd ce que la personne avait regle : la session l'annule.
// `toit.poser` : le geste du catalogue (three/gestesToits.ts), nomme par `data-piece` sur le bouton qui l'a declenche.

import { PERMISSION_ECRITURE } from '../acces.js';
import { estRetouchable, creerModeToit, etatToit, sessionToit } from '../modeToit.js';
import { appliquerPiece, raisonIndisponible, reprendreLectureAuto } from '../../three/gestesToits.js';
import { murLePlusProche, replacerSaillie } from '../../facade/regles/toits/saillies.js';
import { armerSaillie, desarmerSaillie, reprendreSaillieVisee, saillieArmee } from '../../facade/choixSaillie.js';
import { hotes3d } from '../../three/etat3d.js';
import { objetSousLePointeur } from '../../three/scene.js';
import { showToast } from '../../shell/dialogs.js';
import type { Atelier } from '../atelier.js';
import type { Magasin } from '../magasin.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

export interface ContexteToitCatalogue {
  buildThreeScene: (obj: ObjetPlan | null) => void;
  /** Redessine les zones : le panneau du mode lit l'etat de la session. */
  rafraichir: () => void;
  magasin: Magasin;
}

/** Les « Regles » sont allumees quand le batiment n'est pas fige. */
export const reglesAllumees = (o: ObjetPlan | undefined): boolean => !!o && !o.toitFige;

/** Le toucher et l'appui se distinguent d'un glisser (qui fait tourner la vue) au-dela de cette distance, en pixels. */
const GLISSER_PX = 5;

export function brancherToitCatalogue(a: Atelier, ctx: ContexteToitCatalogue, cmd: RegistreCommandes): void {
  const mode = creerModeToit(a, { rebatir: (o) => ctx.buildThreeScene(o), rafraichir: ctx.rafraichir });
  const batiment = (): ObjetPlan | undefined => { const s = sessionToit(); return s ? a.etat.objects.find((o) => o.key === s.cle) : undefined; };
  const enSession = () => !!sessionToit();

  // Les descriptions sont au glossaire (app/descriptions.ts).
  const commande = (id: string, libelle: string, actif: () => boolean, executer: (source?: HTMLElement) => void, ecrit = true) =>
    cmd.declarer({ id, libelle, groupe: 'toit', ...(ecrit ? { permission: PERMISSION_ECRITURE } : {}), actif, executer });

  commande('toit.modifier', 'Modifier la toiture',
    () => !enSession() && estRetouchable(a.etat.objects.find((o) => o.key === a.etat.selectedKey)), () => { mode.ouvrir(); });
  commande('toit.valider', 'Valider le toit',
    enSession, () => { mode.valider(); });
  commande('toit.abandonner', 'Abandonner les changements',
    enSession, () => { mode.abandonner(); });
  commande('toit.annuler', 'Annuler (toit)', () => etatToit().peutAnnuler, () => { mode.annuler(); });
  commande('toit.retablir', 'Rétablir (toit)', () => etatToit().peutRetablir, () => { mode.retablir(); });
  commande('toit.depart', 'Revenir au départ', () => etatToit().change, () => { mode.revenirAuDepart(); });
  commande('toit.isoler', 'Isoler le bâtiment', enSession, () => { mode.basculerIsolement(); }, false);

  commande('toit.regles', 'Règles',
    enSession, () => {
      mode.ecrire((o) => { if (o.toitFige) reprendreLectureAuto(o); else o.toitFige = true; });
      showToast(batiment()?.toitFige ? 'Règles coupées : le toit reste tel que vous le réglez.' : 'Règles allumées : le toit sera relu.');
    });

  commande('toit.poser', 'Poser sur le toit',
    enSession, (source) => {
      const id = source?.dataset.piece, o = batiment();
      if (!id || !o) return;
      const raison = raisonIndisponible(o, id);
      if (raison) { showToast(raison); return; }
      if (!mode.ecrire((x) => appliquerPiece(x, id))) return;
      // Un element de facade pose arme son choix de mur : le toucher suivant dans la 3D le deplace.
      const dernier = (batiment()?.corpsToit?.length ?? 1) - 1;
      if (id.startsWith('facade:') && batiment()) { armerSaillie(o.key, dernier); ctx.rafraichir(); showToast('Touchez un mur du bâtiment pour y poser l’élément (Échap pour annuler).'); }
    });

  commande('toit.murSur3d', 'Choisir le mur dans la 3D',
    enSession, () => {
      const rang = reprendreSaillieVisee(), o = batiment();
      if (rang === null || !o?.corpsToit?.[rang]?.saillie) return;
      armerSaillie(o.key, rang);
      ctx.rafraichir();
      showToast('Touchez un mur du bâtiment pour y poser l’élément (Échap pour annuler).');
    });

  /** Replace l'element arme sur le mur que la personne touche ; faux si le toucher ne dit rien (le ciel, un autre objet). */
  const placerSurLeMurTouche = (ndc: { x: number; y: number }): boolean => {
    const cible = saillieArmee(), o = batiment();
    if (!cible || !o?.corpsToit) return false;
    const k = o.corpsToit[cible.rang], hote = k?.saillie ? o.corpsToit[k.saillie.hote] : undefined;
    if (!k?.saillie || !hote) { desarmerSaillie(); return false; }
    const touche = objetSousLePointeur(ndc, (cle) => cle === cible.cle);
    if (touche.cle !== cible.cle || !touche.point) return false;
    const mur = murLePlusProche(hote, touche.point);
    mode.ecrire((x) => { x.corpsToit = replacerSaillie(x.corpsToit ?? [], cible.rang, mur); x.toitFige = true; });
    desarmerSaillie();
    return true;
  };

  // Le toucher (un clic, pas un glisser qui fait tourner la vue) sur la Vue 3D : l'element arme se pose, sinon la facade se choisit.
  const doc = typeof document === 'undefined' ? null : document;
  let appui: { x: number; y: number } | null = null;
  doc?.addEventListener('pointerdown', (e) => { appui = enSession() && hotes3d.vue3d?.contains(e.target as Node) ? { x: e.clientX, y: e.clientY } : null; }, true);
  doc?.addEventListener('pointerup', (e) => {
    const debut = appui; appui = null;
    const hote = hotes3d.vue3d;
    if (!debut || !hote || !enSession() || Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > GLISSER_PX) return;
    const r = hote.getBoundingClientRect();
    const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    if (saillieArmee()) placerSurLeMurTouche(ndc);
    else mode.toucher(ndc);
  }, true);
  doc?.addEventListener('keydown', (e) => {
    if (!enSession()) return;
    const cible = e.target as HTMLElement | null;
    // Une saisie dans un champ garde ses propres touches (Ctrl+Z du champ, Echap du dialogue).
    if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')) return;
    if (e.key === 'Escape') {
      if (saillieArmee()) { desarmerSaillie(); ctx.rafraichir(); } else mode.echap();
      return;
    }
    const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z', y = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y';
    if (!z && !y) return;
    // Pendant la session, Ctrl+Z est celui de la session : le projet n'a rien a defaire.
    e.preventDefault();
    e.stopPropagation();
    if (y || e.shiftKey) mode.retablir(); else mode.annuler();
  }, true);

  // Quitter la Vue 3D ou choisir un autre objet met fin a la session : le toit revient, sans question.
  let vueAvant = ctx.magasin.store.getState().vue, cleAvant = a.etat.selectedKey;
  ctx.magasin.store.subscribe((s) => {
    const vue = s.vue, cle = a.etat.selectedKey;
    const change = vue !== vueAvant || cle !== cleAvant;
    vueAvant = vue; cleAvant = cle;
    if (change && enSession() && (vue !== 'vue3d' || cle !== sessionToit()?.cle)) mode.arreterSansDemander('Mode Toit quitté : les changements ont été abandonnés.');
  });
}
