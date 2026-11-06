// Les commandes du mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md) : entrer, valider, abandonner, annuler dans la session, et ce que
// le mode permet d'y faire — allumer ou couper les « Regles », poser un geste du catalogue, choisir le mur d'un element.
//
// Toute retouche passe par la session (app/toits/modeToit.ts) : elle ecrit dans le batiment, la scene 3D la montre, et le projet ne recoit
// qu'une etape d'historique, a la validation.
//
// `toit.regles` : une bascule. Allumee, le toit se lit tout seul (LiDAR, faits, profils) ; coupee, le batiment est fige (`toitFige`) et
// rien ne le reecrit. Rallumer reprend la lecture et perd ce que la personne avait regle : la session l'annule.
// `toit.poser` : le geste du catalogue (three/gestesToits.ts), nomme par `data-piece` sur le bouton qui l'a declenche.

import { PERMISSION_ECRITURE } from '../acces.js';
import { estRetouchable, raisonDOuvrir, creerModeToit, etatToit, poserEntreeHistorique, quitterLaSessionPuis, retourDuNavigateur, sessionToit } from '../toits/modeToit.js';
import { murLePlusProche, replacerSaillie } from '../../facade/modeToit/saillies.js';
import { tournerCorps, PAS_ROTATION_DEG } from '../../facade/modeToit/corpsNeufs.js';
import { corpsAFusionner, fusionnerCorps, retourDAngle, scinderCorps } from '../../facade/modeToit/decroche.js';
import { appliquerChoix, cibleAjoutee, dupliquerElement, facadeDeLElement, memeCible, redimensionnerElement, supprimerElement, type TypeElement } from '../../facade/modeToit/elements.js';
import { armerSaillie, desarmerSaillie, saillieArmee } from '../../interaction/choixSaillie.js';
import { ecouterLesTouchers } from './selection3d.js';
import { affichage3d, hotes3d, vue3d } from '../../three/etat3d.js';
import { dialogues } from '../../shell/dialogues.js';
import { moteur3d } from '../../three/demande3d.js';
import { showToast } from '../../shell/dialogs.js';
import type { Atelier } from '../atelier.js';
import type { Magasin } from '../magasin.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ChampsBatiment, ObjetPlan } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';

export interface ContexteToitCatalogue {
  /** Redessine le batiment `cle` dans la Vue 3D ouverte (la scene entiere s'il le faut, autour de la terrasse courante). */
  rebatirBatiment: (cle: string) => void;
  /** Redessine les zones : le panneau du mode lit l'etat de la session. */
  rafraichir: () => void;
  magasin: Magasin;
}

/** Les « Regles » sont allumees quand le batiment n'est pas fige. */
// Le catalogue des toits (three/gestesToits.ts) se charge a l'ouverture d'une session (AD-10) : les gestes qui le lisent ne
// s'offrent que pendant une session, il est donc la quand ils s'executent.
type Gestes = typeof import('../../three/gestesToits.js');
let gestes: Gestes | null = null;
let chargementGestes: Promise<Gestes> | null = null;
/** Charge le catalogue des toits une fois ; un echec laisse la porte ouverte a un nouvel essai. */
export function chargerGestesToits(): Promise<Gestes> {
  chargementGestes ??= import('../../three/gestesToits.js').then((m) => (gestes = m), (e: unknown) => { chargementGestes = null; throw e; });
  return chargementGestes;
}

export const reglesAllumees = (o: ObjetPlan | undefined): boolean => !!o && !o.batiment?.toitFige;

interface DepsClavier {
  enSession: () => boolean;
  aUnChoix: () => boolean;
  mode: ReturnType<typeof creerModeToit>;
  cmd: RegistreCommandes;
  rafraichir: () => void;
}

/**
 * Les touches du mode : Echap (arme, selection, vue, abandon), Suppr / Retour arriere (supprime l'element choisi), Ctrl+Z / Ctrl+Y (ceux de
 * la session). Une touche, un effet : celle que le mode prend ne va pas plus loin (ni au dialogue qu'elle vient d'ouvrir, ni au plein
 * ecran) ; un dialogue ouvert garde la sienne.
 */
function touchesDuMode(e: KeyboardEvent, d: DepsClavier): void {
  if (!d.enSession() || dialogues.courant()) return;
  const cible = e.target as HTMLElement | null;
  // Une saisie dans un champ garde ses propres touches (Echap du champ) ; son Ctrl+Z passe par `objet.annuler`, qui annule la session.
  if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')) return;
  if (e.key === 'Escape') {
    let prise = true;
    if (saillieArmee()) { desarmerSaillie(); d.rafraichir(); } else prise = d.mode.echap(affichage3d.pleinePage3d);
    if (prise) { e.preventDefault(); e.stopPropagation(); }
    return;
  }
  // Le corps principal reste : la commande le refuse sans rien ecrire.
  if ((e.key === 'Delete' || e.key === 'Backspace') && d.aUnChoix()) {
    e.preventDefault();
    e.stopPropagation();
    d.cmd.executer('toit.supprimer');
    return;
  }
  const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z', y = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y';
  if (!z && !y) return;
  // Pendant la session, Ctrl+Z est celui de la session : le projet n'a rien a defaire.
  e.preventDefault();
  e.stopPropagation();
  if (y || e.shiftKey) d.mode.retablir(); else d.mode.annuler();
}

type Declarer = (id: string, libelle: string, actif: () => boolean, executer: (source?: HTMLElement) => void) => void;
type Choisi = () => { t: { type: TypeElement; rang: number; i: number }; corps: NonNullable<ChampsBatiment['corpsToit']> } | null;

/** Le temps que la Vue 3D a pour s'ouvrir avant que « Modifier la toiture en 3D » renonce a ouvrir le mode. */
const ATTENTE_VUE_3D_MS = 60000;

/**
 * « Modifier la toiture en 3D », depuis l'inspecteur d'un batiment (audit de la navigation, 6 novembre 2026) : la Vue 3D s'ouvre, puis le mode
 * Toit sur le batiment choisi, des que la scene est la. Le mode ne vit que dans la Vue 3D (decision de la personne) : l'entree du plan y mene.
 */
function declarerEntreeEn3d(commande: (id: string, libelle: string, actif: () => boolean, executer: (source?: HTMLElement) => void, ecrit?: boolean, raisonInactive?: () => string | null) => void,
  cmd: RegistreCommandes, ctx: ContexteToitCatalogue, actif: () => boolean, raison: () => string | null): void {
  commande('toit.modifierEn3d', 'Modifier la toiture en 3D', actif, () => {
    const prete = () => ctx.magasin.store.getState().vue === 'vue3d' && affichage3d.vue3d === 'pret' && !!vue3d.scene && !!hotes3d.vue3d;
    if (prete()) { cmd.executer('toit.modifier'); return; }
    if (ctx.magasin.store.getState().vue !== 'vue3d') cmd.executer('vue.3d');
    const fin = Date.now() + ATTENTE_VUE_3D_MS;
    const attendre = () => {
      if (prete()) { cmd.executer('toit.modifier'); return; }
      if (Date.now() < fin && ctx.magasin.store.getState().vue === 'vue3d') setTimeout(attendre, 200);
    };
    setTimeout(attendre, 200);
  }, true, raison);
}

/** Les gestes sur un corps choisi : le tourner, le couper en deux, le reunir a son voisin (decision du 4 novembre 2026). */
function declarerGestesDesCorps(commande: Declarer, choisi: Choisi, mode: ReturnType<typeof creerModeToit>): void {
  // Les gestes sur un corps choisi : le tourner, le couper, le reunir, lui faire retourner l'angle.
  commande('toit.tourner', 'Tourner le corps', () => choisi()?.t.type === 'corps', (source) => {
    const c = choisi(), sens = source?.dataset.sens === '-1' ? -1 : 1;
    if (c && c.t.type === 'corps') mode.ecrire((x) => { champsBatiment(x).corpsToit = tournerCorps(c.corps, c.t.rang, sens * PAS_ROTATION_DEG); champsBatiment(x).toitFige = true; });
  });
  // Couper un corps en deux, ou reunir deux corps alignes : la personne decoupe la maison comme elle est (decision du 4 novembre 2026).
  commande('toit.scinder', 'Couper le corps en deux', () => { const c = choisi(); return c?.t.type === 'corps' && !!scinderCorps(c.corps, c.t.rang); }, () => {
    const c = choisi(), l = c && c.t.type === 'corps' ? scinderCorps(c.corps, c.t.rang) : null;
    if (!c || !l) return;
    mode.ecrire((x) => { champsBatiment(x).corpsToit = l; champsBatiment(x).toitFige = true; });
    mode.selectionner({ type: 'corps', rang: l.length - 1, i: 0 });
  });
  // Le retour d'un appentis a l'angle de la maison : un second corps lie, en equerre (data-cote : gauche ou droite, vu de face).
  commande('toit.retour', 'Retour d’angle', () => { const c = choisi(); return c?.t.type === 'corps' && (!!retourDAngle(c.corps, c.t.rang, 'gauche') || !!retourDAngle(c.corps, c.t.rang, 'droite')); }, (source) => {
    const c = choisi(), cote = source?.dataset.cote === 'gauche' ? 'gauche' : 'droite';
    const l = c && c.t.type === 'corps' ? retourDAngle(c.corps, c.t.rang, cote) : null;
    if (!l) { showToast('Pas de retour possible de ce côté : un corps y est déjà lié, ou ce corps n’est pas un appentis.'); return; }
    mode.ecrire((x) => { champsBatiment(x).corpsToit = l; champsBatiment(x).toitFige = true; });
    mode.selectionner({ type: 'corps', rang: l.length - 1, i: 0 });
  });
  commande('toit.fusionner', 'Réunir avec le corps voisin', () => { const c = choisi(); return c?.t.type === 'corps' && corpsAFusionner(c.corps, c.t.rang) !== null; }, () => {
    const c = choisi(), l = c && c.t.type === 'corps' ? fusionnerCorps(c.corps, c.t.rang) : null;
    if (!c || !l) return;
    const voisin = corpsAFusionner(c.corps, c.t.rang) as number;
    mode.ecrire((x) => { champsBatiment(x).corpsToit = l; champsBatiment(x).toitFige = true; });
    // Le voisin parti, le corps reuni descend d'un rang s'il etait apres lui.
    mode.selectionner({ type: 'corps', rang: voisin < c.t.rang ? c.t.rang - 1 : c.t.rang, i: 0 });
  });
}

export function brancherToitCatalogue(a: Atelier, ctx: ContexteToitCatalogue, cmd: RegistreCommandes): void {
  const mode = creerModeToit(a, { rebatir: ctx.rebatirBatiment, rafraichir: ctx.rafraichir });
  const batiment = (): ObjetPlan | undefined => { const s = sessionToit(); return s ? a.etat.objects.find((o) => o.key === s.cle) : undefined; };
  const enSession = () => !!sessionToit();

  // Les descriptions sont au glossaire (app/descriptions.ts).
  const commande = (id: string, libelle: string, actif: () => boolean, executer: (source?: HTMLElement) => void, ecrit = true,
    raisonInactive?: () => string | null) =>
    cmd.declarer({ id, libelle, groupe: 'toit', ...(ecrit ? { permission: PERMISSION_ECRITURE } : {}), ...(raisonInactive ? { raisonInactive } : {}), actif, executer });

  const selection = (): ObjetPlan | undefined => a.etat.objects.find((o) => o.key === a.etat.selectedKey);
  // Le batiment d'un voisin : le bouton reste, grise, et dit pourquoi (une autre selection : il s'efface, rien a expliquer).
  commande('toit.modifier', 'Modifier la toiture',
    () => !enSession() && estRetouchable(selection()), () => {
      // Le catalogue d'abord : la session s'ouvre avec lui (deja charge, tout de suite).
      if (gestes) { mode.ouvrir(); return; }
      chargerGestesToits().then(() => { if (!enSession()) mode.ouvrir(); }, (e: unknown) => {
        showToast('Le mode Toit n’a pas pu se charger (' + (e instanceof Error ? e.message : String(e)) + ').');
      });
    }, true, () => (enSession() ? null : raisonDOuvrir(selection())));
  declarerEntreeEn3d(commande, cmd, ctx, () => !enSession() && estRetouchable(selection()), () => (enSession() ? null : raisonDOuvrir(selection())));
  commande('toit.valider', 'Valider le toit',
    enSession, () => { mode.valider(); });
  commande('toit.abandonner', 'Abandonner les changements',
    enSession, () => { mode.abandonner(); });
  commande('toit.annuler', 'Annuler (toit)', () => etatToit().peutAnnuler, () => { mode.annuler(); });
  commande('toit.retablir', 'Rétablir (toit)', () => etatToit().peutRetablir, () => { mode.retablir(); });
  commande('toit.depart', 'Revenir au départ', () => etatToit().change, () => { mode.revenirAuDepart(); });
  commande('toit.isoler', 'Isoler le bâtiment', enSession, () => { mode.basculerIsolement(); }, false);

  commande('toit.facade', 'Choisir une façade', enSession, (source) => {
    // Le bouton du navigateur nomme le corps (`data-rang`, vide : le contour) et son mur (`data-mur`), ou seulement le corps (`data-corps`).
    const d = source?.dataset;
    if (d?.corps !== undefined) mode.choisirFacadeDuCorps(Number(d.corps));
    else if (d?.mur !== undefined) mode.choisirFacade(d.rang === '' || d.rang === undefined ? null : Number(d.rang), Number(d.mur));
  }, false);
  commande('toit.vueLibre', 'Vue 3D', enSession, () => { mode.voir('libre'); }, false);
  commande('toit.vueFacade', 'Vue de la façade', () => etatToit().aUneFacade, () => { mode.voir('facade'); }, false);
  commande('toit.vueDessus', 'Vue de dessus', enSession, () => { mode.voir('dessus'); }, false);
  // Si l'on s'est perdu (trop loin, trop pres, ailleurs) : la camera revient sur le batiment entier. En vue de facade, le cadre est deja le sien.
  commande('toit.recadrer', 'Recadrer le bâtiment', () => enSession() && etatToit().vue !== 'facade', () => { mode.recadrer(); }, false);
  commande('toit.voirValide', 'Voir le toit du projet', () => enSession() && (etatToit().change || etatToit().validee), () => { mode.voirValide(); }, false);
  commande('toit.isolerCorps', 'Isoler ce corps', () => etatToit().peutIsolerCorps, () => { mode.basculerCorpsIsole(); }, false);

  /** L'element choisi dans la session, avec son batiment : ce que les commandes d'edition lisent. */
  const choisi = () => { const t = etatToit().selection, o = batiment(); return t && o?.batiment?.corpsToit ? { t, o, corps: o.batiment?.corpsToit } : null; };

  commande('toit.selection', 'Choisir un élément', enSession, (source) => {
    const d = source?.dataset, cible = d?.type ? { type: d.type as TypeElement, rang: Number(d.rang), i: Number(d.i) } : null;
    // Retoucher l'element deja choisi le lache : on revient au batiment entier, au doigt comme a la souris (sans cible : de meme).
    mode.selectionner(cible && memeCible(etatToit().selection, cible) ? null : cible);
  }, false);
  commande('toit.regler', 'Régler l’élément', () => !!choisi(), (source) => {
    const c = choisi(), d = source?.dataset;
    if (c && d?.groupe && d.valeur !== undefined) mode.ecrire((x) => { champsBatiment(x).corpsToit = appliquerChoix(c.corps, c.t, d.groupe as string, d.valeur as string); champsBatiment(x).toitFige = true; });
  });
  commande('toit.dupliquer', 'Dupliquer l’élément', () => !!choisi(), () => {
    const c = choisi();
    if (!c) return;
    const r = dupliquerElement(c.corps, c.t);
    if (!r) { showToast('Pas de place à côté : déplacez ou réduisez d’abord.'); return; }
    mode.ecrire((x) => { champsBatiment(x).corpsToit = r.corps; champsBatiment(x).toitFige = true; });
    mode.selectionner(r.cible);
  });
  commande('toit.supprimer', 'Supprimer l’élément', () => !!choisi(), () => {
    const c = choisi();
    if (!c) return;
    // Le corps principal ne se supprime pas : rien a ecrire, rien a empiler.
    if (c.t.type === 'corps' && supprimerElement(c.corps, c.t).length === c.corps.length) return;
    mode.ecrire((x) => { champsBatiment(x).corpsToit = supprimerElement(c.corps, c.t); champsBatiment(x).toitFige = true; });
    mode.selectionner(null);
  });
  declarerGestesDesCorps(commande, choisi, mode);
  commande('toit.plus', 'Agrandir l’élément', () => !!choisi(), () => { const c = choisi(); if (c) mode.ecrire((x) => { champsBatiment(x).corpsToit = redimensionnerElement(c.corps, c.t, 1); champsBatiment(x).toitFige = true; }); });
  commande('toit.moins', 'Réduire l’élément', () => !!choisi(), () => { const c = choisi(); if (c) mode.ecrire((x) => { champsBatiment(x).corpsToit = redimensionnerElement(c.corps, c.t, -1); champsBatiment(x).toitFige = true; }); });

  commande('toit.regles', 'Règles',
    enSession, () => {
      const g = gestes;
      if (!g) return;
      mode.ecrire((o) => { if (o.batiment?.toitFige) g.reprendreLectureAuto(o); else champsBatiment(o).toitFige = true; });
      showToast(batiment()?.batiment?.toitFige ? 'Règles coupées : le toit reste tel que vous le réglez.' : 'Règles allumées : le toit sera relu quand vous validerez.');
    });

  commande('toit.poser', 'Poser sur le toit',
    enSession, (source) => {
      const id = source?.dataset.piece, o = batiment(), s = sessionToit(), g = gestes;
      if (!id || !o || !g) return;
      // Le geste n'agit que sur le corps choisi (celui de l'element choisi) ; sans choix, sur la facade regardee (ou la derniere choisie).
      const facade = s?.facade ?? s?.derniere ?? null, rangChoisi = etatToit().selection?.rang ?? null;
      const raison = g.raisonIndisponible(o, id, facade, rangChoisi);
      if (raison) { showToast(raison); return; }
      const avant = JSON.parse(JSON.stringify(o.batiment?.corpsToit ?? [])) as NonNullable<ChampsBatiment['corpsToit']>;
      if (!mode.ecrire((x) => g.appliquerPiece(x, id, facade, rangChoisi))) return;
      // L'element pose se choisit (l'inspecteur le regle) ; un pignon, un element de mur se reglent de face (maquette v8) : la vue passe devant leur facade.
      const cible = cibleAjoutee(avant, batiment()?.batiment?.corpsToit ?? []), mur = cible ? facadeDeLElement(batiment()?.batiment?.corpsToit ?? [], cible) : null;
      mode.selectionner(cible);
      if (mur) mode.choisirFacade(mur.rang, mur.mur);
    });

  // L'element de facade choisi dans le panneau du mode (bow-window, galerie, appentis) : le prochain toucher sur un mur de la scene l'y pose.
  // Le bouton etait dans l'inspecteur du plan, qui n'est pas montre en Vue 3D : il ne servait jamais (audit de la navigation).
  commande('toit.murSur3d', 'Choisir le mur dans la 3D',
    () => enSession() && etatToit().selection?.type === 'saillie', () => {
      const t = etatToit().selection, o = batiment();
      if (t?.type !== 'saillie' || !o?.batiment?.corpsToit?.[t.rang]?.saillie) return;
      armerSaillie(o.key, t.rang);
      ctx.rafraichir();
      showToast('Touchez un mur du bâtiment pour y poser l’élément (Échap pour annuler).');
    });

  /** Replace l'element arme sur le mur que la personne touche ; faux si le toucher ne dit rien (le ciel, un autre objet). */
  const placerSurLeMurTouche = (ndc: { x: number; y: number }): boolean => {
    const cible = saillieArmee(), o = batiment();
    if (!cible || !o?.batiment?.corpsToit) return false;
    const k = o.batiment?.corpsToit[cible.rang], hote = k?.saillie ? o.batiment?.corpsToit[k.saillie.hote] : undefined;
    if (!k?.saillie || !hote) { desarmerSaillie(); return false; }
    // Un toucher sur la scene ouverte : le moteur est la (three/demande3d.ts).
    const touche = moteur3d()?.objetSousLePointeur(ndc, (cle) => cle === cible.cle);
    if (!touche || touche.cle !== cible.cle || !touche.point) return false;
    const mur = murLePlusProche(hote, touche.point);
    mode.ecrire((x) => { champsBatiment(x).corpsToit = replacerSaillie(x.batiment?.corpsToit ?? [], cible.rang, mur); champsBatiment(x).toitFige = true; });
    desarmerSaillie();
    return true;
  };

  // Le toucher sur la Vue 3D : l'element arme se pose, sinon la facade se choisit. Un toucher est bref, immobile, d'un seul doigt ou du
  // bouton principal, sur le canevas (`ecouterLesTouchers`, le meme que la selection au toucher) : un clic droit (le deplacement), un appui
  // long, un pincement n'en sont pas (audit de la camera, 6 novembre 2026). Le panneau, le plan des facades, les poignees et les boutons de
  // la Vue 3D sont poses par-dessus, dans le meme hote : un toucher sur eux ne choisit rien.
  const doc = typeof document === 'undefined' ? null : document;
  doc?.addEventListener('pointerdown', (e) => { if (enSession() && hotes3d.vue3d?.contains(e.target as Node)) mode.leverIndice(); }, true);
  ecouterLesTouchers(doc, (e) => {
    const hote = hotes3d.vue3d;
    if (!hote || !enSession()) return;
    const r = hote.getBoundingClientRect();
    const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    if (saillieArmee()) placerSurLeMurTouche(ndc);
    else mode.toucher(ndc);
  });
  doc?.addEventListener('keydown', (e) => { touchesDuMode(e, { enSession, aUnChoix: () => !!choisi(), mode, cmd, rafraichir: ctx.rafraichir }); }, true);

  brancherSortiesDeSession(a, ctx, cmd, mode);
}

/**
 * Ce qui ferait sortir d'une session : quitter la Vue 3D, choisir un autre objet, le retour du navigateur. Une session modifiee ne se
 * perd plus en silence (audit du 6 novembre 2026) : la personne choisit d'abord.
 */
function brancherSortiesDeSession(a: Atelier, ctx: ContexteToitCatalogue, cmd: RegistreCommandes, mode: ReturnType<typeof creerModeToit>): void {
  const enSession = () => !!sessionToit();
  // Quitter la Vue 3D pendant une session : la commande attend la reponse (Valider, Abandonner, Rester), puis repart.
  cmd.retenir((id, source) => {
    if (!enSession() || !COMMANDES_QUI_QUITTENT.has(id)) return false;
    quitterLaSessionPuis(mode, () => { cmd.executer(id, source); });
    return true;
  });

  // Choisir un autre objet pendant une session modifiee : la selection revient au batiment, et la question est posee ; la reponse
  // donnee, l'objet choisi le redevient. Sans changement, ou si le batiment n'est plus la (un autre projet ouvert), ou si la vue a
  // change par un autre chemin qu'une commande, la session se ferme comme avant.
  let vueAvant = ctx.magasin.store.getState().vue, cleAvant = a.etat.selectedKey;
  const choisir = (cle: string | null) => { a.etat.selectedKey = cle; a.etat.highlight = { type: null, index: null }; a.render(); };
  ctx.magasin.store.subscribe((s) => {
    const vue = s.vue, cle = a.etat.selectedKey;
    const change = vue !== vueAvant || cle !== cleAvant;
    vueAvant = vue; cleAvant = cle;
    const session = sessionToit();
    if (!change || !session || (vue === 'vue3d' && cle === session.cle)) return;
    const present = a.etat.objects.some((o) => o.key === session.cle);
    if (vue === 'vue3d' && present && etatToit().change) {
      // Hors de l'ecouteur du magasin : rendre la selection redessine, et donc le notifie.
      queueMicrotask(() => {
        if (sessionToit() !== session) return;
        choisir(session.cle);
        quitterLaSessionPuis(mode, () => { choisir(cle); });
      });
      return;
    }
    mode.arreterSansDemander('Mode Toit quitté : les changements ont été abandonnés.');
  });

  // Le retour du navigateur (ou du telephone) vaut Echap pendant une session : l'entree posee a l'ouverture vient d'etre retiree,
  // elle est remise tant que la session dure.
  if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
    if (!retourDuNavigateur() || !enSession()) return;
    if (dialogues.courant()) dialogues.fermer();
    else if (saillieArmee()) { desarmerSaillie(); ctx.rafraichir(); }
    else mode.echap();
    if (enSession()) poserEntreeHistorique();
  });
}

/** Les commandes qui quittent la Vue 3D : une session modifiee les retient le temps de sa question. */
const COMMANDES_QUI_QUITTENT = new Set(['vue.plan', 'vue.visionneuse']);
