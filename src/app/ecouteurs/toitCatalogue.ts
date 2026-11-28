// Les commandes de l'atelier du toit (zone Z10, MD/spec-mode-toit-3d.md) : des liaisons minces vers le controleur du toit
// (facade/modeToit/controleurToit.ts), la seule porte d'ecriture d'un toit. Une commande lit `data-*` sur le bouton qui l'a declenchee,
// demande au controleur par la session (app/toits/modeToit.ts::geste) et dit son etat d'apres lui : aucune regle de toit ici.
//
// L'atelier s'ouvre sur le plan (bouton « Modifier le toit » de l'inspecteur) comme dans la Vue 3D (« Modifier le toit », « Ajouter au
// toit » au bas de la scene) ; ce qui ne se fait qu'en 3D (choisir une facade, les vues, toucher un mur) n'y est offert qu'en 3D.

import { PERMISSION_ECRITURE } from '../acces.js';
import { batimentVise, batimentsRetouchables, estRetouchable, raisonDOuvrir, creerModeToit, etatToit, poserEntreeHistorique, quitterLaSessionPuis, retourDuNavigateur, sessionToit } from '../toits/modeToit.js';
import { murLePlusProche } from '../../facade/modeToit/saillies.js';
import { memeCible, libellesDesElements, type TypeElement } from '../../facade/modeToit/elements.js';
import { estIntentionToit, type GesteNomme, type IntentionToit } from '../../facade/modeToit/controleurToit.js';
import { piece } from '../../facade/modeToit/pieces.js';
import { armerSaillie, desarmerSaillie, saillieArmee } from '../../interaction/choixSaillie.js';
import { ecouterLesTouchers } from './selection3d.js';
import { affichage3d, hotes3d, vue3d } from '../../three/etat3d.js';
import { dialogues } from '../../shell/dialogues.js';
import { moteur3d } from '../../three/demande3d.js';
import { showToast } from '../../shell/dialogs.js';
import type { Atelier } from '../atelier.js';
import type { Magasin } from '../magasin.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';
import { brancherDecroche, decrocheArme, type GesteDecroche } from './decroche.js';

export interface ContexteToitCatalogue {
  /** Redessine le batiment `cle` dans la Vue 3D ouverte (la scene entiere s'il le faut, autour de la terrasse courante). */
  rebatirBatiment: (cle: string) => void;
  /** Redessine les zones : l'atelier lit l'etat de la session. */
  rafraichir: () => void;
  magasin: Magasin;
}

/**
 * L'insertion en cours : une piece armee qui attend un toucher sur la scene pour se poser (le decroche au point, ou l'element de facade
 * a replacer sur un mur). Null : rien n'attend. L'indicateur d'etat, la vignette enfoncee, les poignees estompees et le curseur de pose la
 * lisent (retour du proprietaire, 8 novembre 2026).
 */
export interface InsertionToit {
  /** Le mot de l'etat : « Insertion » pour une piece nouvelle, « Placement » pour un element deja pose qui change de mur. */
  nature: 'Insertion' | 'Placement';
  /** Ce qui attend son toucher (« Décroché », le nom de l'element). */
  piece: string;
  /** Ou toucher, en mots. */
  consigne: string;
  /** La commande qui l'a armee (sa vignette ou son bouton est enfonce). */
  commande: 'toit.decrocher' | 'toit.murSur3d';
}

/** Le batiment de la session, pose au branchement : l'indicateur nomme l'element arme. */
let batimentDeLaSession: (() => ObjetPlan | undefined) | null = null;

export function insertionToit(): InsertionToit | null {
  const s = sessionToit();
  if (!s) return null;
  if (decrocheArme()) return { nature: 'Insertion', piece: 'Décroché', consigne: 'touchez l’égout ou le mur à l’endroit du décroché', commande: 'toit.decrocher' };
  const a = saillieArmee();
  if (!a || a.cle !== s.cle) return null;
  const corps = batimentDeLaSession?.()?.batiment?.corpsToit ?? [];
  const nom = libellesDesElements(corps).find((e) => e.cible.type === 'saillie' && e.cible.rang === a.rang)?.libelle ?? 'l’élément choisi';
  return { nature: 'Placement', piece: nom, consigne: 'touchez un mur du bâtiment pour y poser l’élément', commande: 'toit.murSur3d' };
}

type Mode = ReturnType<typeof creerModeToit>;

interface DepsClavier {
  enSession: () => boolean;
  aUnChoix: () => boolean;
  mode: Mode;
  cmd: RegistreCommandes;
  rafraichir: () => void;
  decroche: GesteDecroche;
}

/**
 * Les touches de l'atelier : Echap (arme, selection, vue, abandon), Suppr / Retour arriere (retire l'element choisi), Ctrl+Z / Ctrl+Y
 * (ceux de la session). Une touche, un effet : celle que l'atelier prend ne va pas plus loin ; un dialogue ouvert garde la sienne.
 */
function touchesDuMode(e: KeyboardEvent, d: DepsClavier): void {
  if (!d.enSession() || dialogues.courant()) return;
  const cible = e.target as HTMLElement | null;
  // Une saisie dans un champ garde ses propres touches (Echap du champ) ; son Ctrl+Z passe par `objet.annuler`, qui annule la session.
  if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')) return;
  if (e.key === 'Escape') {
    let prise = true;
    if (d.decroche.arme()) d.decroche.desarmer();
    else if (saillieArmee()) { desarmerSaillie(); d.rafraichir(); } else prise = d.mode.echap(affichage3d.pleinePage3d);
    if (prise) { e.preventDefault(); e.stopPropagation(); }
    return;
  }
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

type CommandeToit = (id: string, libelle: string, actif: () => boolean, executer: (source?: HTMLElement) => void, ecrit?: boolean, raisonInactive?: () => string | null) => void;

/**
 * Les gestes du controleur, chacun une commande : son etat est la raison du controleur (grise, avec elle), son effet une intention.
 * `data-sens` (−1 / 1), `data-cote` (gauche / droite), `data-groupe` et `data-valeur` viennent du bouton.
 */
function declarerGestes(commande: CommandeToit, mode: Mode): void {
  const raison = (g: GesteNomme) => () => (sessionToit()?.ctl.raisonDuGeste(g) ?? null);
  const permis = (g: GesteNomme) => () => !!sessionToit() && raison(g)() === null;
  const sens = (source?: HTMLElement): 1 | -1 => (source?.dataset.sens === '-1' ? -1 : 1);

  commande('toit.faitage', 'Monter ou baisser le faîtage', permis('faitage'), (src) => { mode.geste((c) => c.reglerFaitage(sens(src))); }, true, raison('faitage'));
  commande('toit.sens', 'Tourner le faîtage', permis('sens'), () => { mode.geste((c) => c.tournerSens()); }, true, raison('sens'));
  commande('toit.decouper', 'Découper ce toit en corps', permis('decouper'), () => { mode.geste((c) => c.decouper()); }, true, raison('decouper'));
  commande('toit.regler', 'Régler l’élément', permis('regler'), (src) => {
    const d = src?.dataset;
    if (d?.groupe && d.valeur !== undefined) { const groupe = d.groupe, valeur = d.valeur; mode.geste((c) => c.regler(groupe, valeur)); }
  }, true, raison('regler'));
  commande('toit.plus', 'Agrandir l’élément', permis('redimensionner'), () => { mode.geste((c) => c.redimensionner(1)); }, true, raison('redimensionner'));
  commande('toit.moins', 'Réduire l’élément', permis('redimensionner'), () => { mode.geste((c) => c.redimensionner(-1)); }, true, raison('redimensionner'));
  commande('toit.dupliquer', 'Dupliquer l’élément', permis('dupliquer'), () => { mode.geste((c) => c.dupliquer()); }, true, raison('dupliquer'));
  commande('toit.supprimer', 'Retirer l’élément', permis('retirer'), () => { mode.geste((c) => c.retirer()); }, true, raison('retirer'));
  commande('toit.tourner', 'Tourner le corps', permis('tournerCorps'), (src) => { mode.geste((c) => c.tournerCorps(sens(src))); }, true, raison('tournerCorps'));
  commande('toit.scinder', 'Couper le corps en deux', permis('scinder'), () => { mode.geste((c) => c.scinder()); }, true, raison('scinder'));
  // Le retour d'un appentis a l'angle de la maison (data-cote : gauche ou droite, vu de face) : un corps de plus, donc un ajout.
  commande('toit.retour', 'Retour d’angle', () => permis('retourGauche')() || permis('retourDroite')(), (src) => {
    const cote = src?.dataset.cote === 'gauche' ? 'gauche' : 'droite';
    mode.geste((c) => c.retourDAngle(cote));
  }, true, () => raison('retourDroite')() && raison('retourGauche')());
  commande('toit.fusionner', 'Réunir avec le corps voisin', permis('fusionner'), () => { mode.geste((c) => c.fusionner()); }, true, raison('fusionner'));
  commande('toit.regles', 'Règles', permis('regles'), () => {
    const issue = mode.geste((c) => c.basculerRegles());
    if (issue.fait) showToast(sessionToit()?.ctl.etat().regles ? 'Règles allumées : le toit sera relu quand vous validerez.' : 'Règles coupées : le toit reste tel que vous le réglez.');
  }, true, raison('regles'));
  // Une piece du catalogue (`data-piece`) : une forme modifie le toit, une autre piece s'ajoute ; le controleur dit ce qui l'empeche.
  commande('toit.poser', 'Poser sur le toit', () => !!sessionToit(), (src) => {
    const id = src?.dataset.piece;
    if (!id || !piece(id)) return;
    mode.geste((c) => (piece(id)?.famille === 'toit' ? c.choisirForme(id) : c.poserPiece(id)));
  });
}

/** Les entrees de l'atelier (« Modifier le toit », « Ajouter au toit », un batiment nomme) et le commutateur des deux intentions. */
function declarerEntrees(a: Atelier, cmd: RegistreCommandes, commande: CommandeToit, mode: Mode): void {
  // Le batiment vise : le choisi, sinon la seule maison du projet (app/toits/modeToit.ts::batimentVise).
  const selection = (): ObjetPlan | undefined => batimentVise(a.etat.objects, a.etat.selectedKey), enSession = () => !!sessionToit();
  // Ouvre la session sur le batiment vise, dans l'intention dite. Le batiment vise sans etre choisi le devient : la session lit la selection.
  const ouvrirEn = (intention: IntentionToit, cle?: string) => {
    const o = cle ? a.etat.objects.find((x) => x.key === cle) : selection();
    if (enSession() || !estRetouchable(o)) return;
    if (a.etat.selectedKey !== o.key) { a.etat.selectedKey = o.key; a.etat.highlight = { type: null, index: null }; }
    mode.ouvrir(intention);
  };
  // Sur le plan (l'inspecteur d'un batiment) comme dans la Vue 3D : l'atelier s'ouvre sur la vue montree.
  commande('toit.modifier', 'Modifier le toit',
    () => !enSession() && estRetouchable(selection()), () => { ouvrirEn('modifier'); }, true, () => (enSession() ? null : raisonDOuvrir(selection())));
  // Plusieurs batiments sur la parcelle, aucun choisi : l'entree les nomme, et un toucher sur un nom ouvre l'atelier sur lui (`data-cle`).
  commande('toit.modifierCe', 'Modifier ce bâtiment',
    () => !enSession() && batimentsRetouchables(a.etat.objects).length > 0, (source) => { if (source?.dataset.cle) ouvrirEn('modifier', source.dataset.cle); });
  commande('toit.ajouter', 'Ajouter au toit',
    () => !enSession() && estRetouchable(selection()), () => { ouvrirEn('ajouter'); }, true, () => (enSession() ? null : raisonDOuvrir(selection())));
  // Le commutateur de l'atelier : `data-intention` sur le bouton. Quitter « Ajouter » lache la piece armee (rien n'attend plus de toucher).
  commande('toit.intention', 'Modifier ou ajouter', enSession, (source) => {
    const i = source?.dataset.intention;
    if (!estIntentionToit(i)) return;
    if (i === 'modifier' && insertionToit()?.commande === 'toit.decrocher') cmd.executer('toit.quitterInsertion');
    mode.choisirIntention(i);
  }, false);
}

/** La session et ses vues : valider, quitter sans garder, defaire, et ce qui ne se fait qu'en 3D (facades, vues, isoler). */
function declarerSession(commande: CommandeToit, mode: Mode, en3d: () => boolean): void {
  const enSession = () => !!sessionToit();
  commande('toit.valider', 'Valider le toit', enSession, () => { mode.valider(); });
  commande('toit.abandonner', 'Quitter sans garder', enSession, () => { mode.abandonner(); });
  commande('toit.annuler', 'Défaire le dernier geste', () => etatToit().peutAnnuler, () => { mode.annuler(); });
  commande('toit.retablir', 'Refaire', () => etatToit().peutRetablir, () => { mode.retablir(); });
  commande('toit.depart', 'Revenir au départ', () => etatToit().change, () => { mode.revenirAuDepart(); });
  commande('toit.voirValide', 'Voir le toit du projet', () => enSession() && (etatToit().change || etatToit().validee), () => { mode.voirValide(); }, false);
  commande('toit.selection', 'Choisir un élément', enSession, (source) => {
    const d = source?.dataset;
    // « Bâtiment entier » (`data-portee="batiment"`) : le choix explicite de tout le toit ; le retoucher le lache.
    if (d?.portee === 'batiment') { mode.choisirBatimentEntier(); return; }
    const cible = d?.type ? { type: d.type as TypeElement, rang: Number(d.rang), i: Number(d.i) } : null;
    // Retoucher l'element deja choisi le lache : on revient a la portee par defaut, au doigt comme a la souris.
    mode.selectionner(cible && memeCible(etatToit().selection, cible) ? null : cible);
  }, false);
  // La Vue 3D seule : l'atelier ouvert sur le plan ne les montre pas.
  const s3d = () => enSession() && en3d();
  commande('toit.isoler', 'Isoler le bâtiment', s3d, () => { mode.basculerIsolement(); }, false);
  commande('toit.facade', 'Choisir une façade', s3d, (source) => {
    // Le bouton du navigateur nomme le corps (`data-rang`, vide : le contour) et son mur (`data-mur`), ou seulement le corps (`data-corps`).
    const d = source?.dataset;
    if (d?.corps !== undefined) mode.choisirFacadeDuCorps(Number(d.corps));
    else if (d?.mur !== undefined) mode.choisirFacade(d.rang === '' || d.rang === undefined ? null : Number(d.rang), Number(d.mur));
  }, false);
  commande('toit.vueLibre', 'Vue 3D', s3d, () => { mode.voir('libre'); }, false);
  commande('toit.vueFacade', 'Vue de la façade', () => s3d() && etatToit().aUneFacade, () => { mode.voir('facade'); }, false);
  commande('toit.vueDessus', 'Vue de dessus', s3d, () => { mode.voir('dessus'); }, false);
  // Si l'on s'est perdu (trop loin, trop pres, ailleurs) : la camera revient sur le batiment entier. En vue de facade, le cadre est deja le sien.
  commande('toit.recadrer', 'Recadrer le bâtiment', () => s3d() && etatToit().vue !== 'facade', () => { mode.recadrer(); }, false);
  commande('toit.isolerCorps', 'Isoler ce corps', () => s3d() && etatToit().peutIsolerCorps, () => { mode.basculerCorpsIsole(); }, false);
}

export function brancherToitCatalogue(a: Atelier, ctx: ContexteToitCatalogue, cmd: RegistreCommandes): void {
  const en3dMontree = () => ctx.magasin.store.getState().vue === 'vue3d' && affichage3d.vue3d === 'pret' && !!vue3d.scene && !!hotes3d.vue3d;
  const mode = creerModeToit(a, { rebatir: ctx.rebatirBatiment, rafraichir: ctx.rafraichir, enVue3d: en3dMontree });
  const batiment = (): ObjetPlan | undefined => { const s = sessionToit(); return s ? a.etat.objects.find((o) => o.key === s.cle) : undefined; };
  const enSession = () => !!sessionToit(), en3d = () => etatToit().en3d;
  batimentDeLaSession = batiment;

  // Les descriptions sont au glossaire (app/descriptions.ts).
  const commande: CommandeToit = (id, libelle, actif, executer, ecrit = true, raisonInactive) =>
    cmd.declarer({ id, libelle, groupe: 'toit', ...(ecrit ? { permission: PERMISSION_ECRITURE } : {}), ...(raisonInactive ? { raisonInactive } : {}), actif, executer });

  declarerEntrees(a, cmd, commande, mode);
  declarerSession(commande, mode, en3d);
  declarerGestes(commande, mode);

  // Le decroche au point (piece « Decroche ») : le prochain toucher sur l'egout ou le mur de la Vue 3D donne son point.
  const decroche = brancherDecroche(cmd, mode, batiment, () => (sessionToit()?.ctl.raisonDePiece('facade:decroche') ?? null), ctx.rafraichir, en3d);

  // L'element de facade choisi (bow-window, galerie, appentis) : le prochain toucher sur un mur de la scene l'y pose.
  commande('toit.murSur3d', 'Choisir le mur dans la 3D',
    () => enSession() && en3d() && etatToit().selection?.type === 'saillie' && !sessionToit()?.ctl.raisonDuGeste('regler'), () => {
      // Un second appui lache l'element arme (retour a la modification) ; la consigne est dite par l'indicateur d'etat.
      if (saillieArmee()) { desarmerSaillie(); ctx.rafraichir(); return; }
      const t = etatToit().selection, o = batiment();
      if (t?.type !== 'saillie' || !o?.batiment?.corpsToit?.[t.rang]?.saillie) return;
      decroche.desarmer();
      armerSaillie(o.key, t.rang);
      ctx.rafraichir();
    });

  // Quitter l'insertion sans rien poser : le bouton « Annuler » de l'indicateur d'etat (Echap et un second appui font de meme).
  commande('toit.quitterInsertion', 'Annuler l’insertion', () => insertionToit() !== null, () => {
    decroche.desarmer();
    if (saillieArmee()) { desarmerSaillie(); ctx.rafraichir(); }
  }, false);

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
    mode.geste((c) => c.placerSurLeMur(cible.rang, mur));
    desarmerSaillie();
    return true;
  };

  brancherToucherDeLaScene(enSession, mode, decroche, placerSurLeMurTouche);
  const doc = typeof document === 'undefined' ? null : document;
  doc?.addEventListener('keydown', (e) => { touchesDuMode(e, { enSession, aUnChoix: () => !!etatToit().selection, mode, cmd, rafraichir: ctx.rafraichir, decroche }); }, true);

  brancherSortiesDeSession(a, ctx, cmd, mode, decroche);
}

/**
 * Le toucher sur la Vue 3D : le decroche arme prend son point, l'element arme se pose, sinon la facade se choisit. Un toucher est bref,
 * immobile, d'un seul doigt ou du bouton principal, sur le canevas (`ecouterLesTouchers`, le meme que la selection au toucher).
 */
function brancherToucherDeLaScene(enSession: () => boolean, mode: Mode, decroche: GesteDecroche,
  placerSurLeMurTouche: (ndc: { x: number; y: number }) => boolean): void {
  const doc = typeof document === 'undefined' ? null : document;
  const en3d = () => enSession() && etatToit().en3d;
  doc?.addEventListener('pointerdown', (e) => { if (en3d() && hotes3d.vue3d?.contains(e.target as Node)) mode.leverIndice(); }, true);
  ecouterLesTouchers(doc, (e) => {
    const hote = hotes3d.vue3d;
    if (!hote || !en3d()) return;
    const r = hote.getBoundingClientRect();
    const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    if (decroche.arme()) decroche.placer(ndc);
    else if (saillieArmee()) placerSurLeMurTouche(ndc);
    else mode.toucher(ndc);
  });
}

/**
 * Ce qui ferait sortir d'une session : la visionneuse, choisir un autre objet, le retour du navigateur. Une session modifiee ne se perd
 * pas en silence : la personne choisit d'abord. Passer du plan a la Vue 3D (ou l'inverse) garde la session : la 3D s'y attache ou s'en
 * detache.
 */
function brancherSortiesDeSession(a: Atelier, ctx: ContexteToitCatalogue, cmd: RegistreCommandes, mode: Mode, decroche: GesteDecroche): void {
  const enSession = () => !!sessionToit();
  // Ouvrir la visionneuse pendant une session : la commande attend la reponse (Valider, Abandonner, Rester), puis repart.
  cmd.retenir((id, source) => {
    if (!enSession() || !COMMANDES_QUI_QUITTENT.has(id)) return false;
    quitterLaSessionPuis(mode, () => { cmd.executer(id, source); });
    return true;
  });

  // Choisir un autre objet pendant une session modifiee : la selection revient au batiment, et la question est posee ; la reponse
  // donnee, l'objet choisi le redevient. Sans changement, ou si le batiment n'est plus la (un autre projet ouvert), ou si la vue a
  // quitte le plan et la 3D par un autre chemin qu'une commande, la session se ferme comme avant.
  let vueAvant = ctx.magasin.store.getState().vue, cleAvant = a.etat.selectedKey;
  const choisir = (cle: string | null) => { a.etat.selectedKey = cle; a.etat.highlight = { type: null, index: null }; a.render(); };
  ctx.magasin.store.subscribe((s) => {
    const vue = s.vue, cle = a.etat.selectedKey;
    const changeVue = vue !== vueAvant, change = changeVue || cle !== cleAvant;
    vueAvant = vue; cleAvant = cle;
    const session = sessionToit();
    if (!change || !session) return;
    const atelier = vue === 'plan' || vue === 'vue3d';
    if (atelier && cle === session.cle) {
      // Du plan a la 3D ou l'inverse : les gestes restent, la 3D s'attache (quand sa scene est prete) ou se detache.
      if (changeVue && vue === 'plan') queueMicrotask(() => { if (sessionToit() === session) { mode.detacher3d(); ctx.rafraichir(); } });
      if (changeVue && vue === 'vue3d') queueMicrotask(() => { if (sessionToit() === session) mode.attacher3d(); });
      return;
    }
    const present = a.etat.objects.some((o) => o.key === session.cle);
    if (atelier && present && session.ctl.etat().change) {
      // Hors de l'ecouteur du magasin : rendre la selection redessine, et donc le notifie.
      queueMicrotask(() => {
        if (sessionToit() !== session) return;
        choisir(session.cle);
        quitterLaSessionPuis(mode, () => { choisir(cle); });
      });
      return;
    }
    mode.arreterSansDemander('Atelier du toit quitté : les changements ont été abandonnés.');
  });

  // Le retour du navigateur (ou du telephone) vaut Echap pendant une session : l'entree posee a l'ouverture vient d'etre retiree,
  // elle est remise tant que la session dure.
  if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
    if (!retourDuNavigateur() || !enSession()) return;
    if (dialogues.courant()) dialogues.fermer();
    else if (decroche.arme()) decroche.desarmer();
    else if (saillieArmee()) { desarmerSaillie(); ctx.rafraichir(); }
    else mode.echap();
    if (enSession()) poserEntreeHistorique();
  });
}

/** Les commandes qui quittent le plan et la 3D : une session modifiee les retient le temps de sa question. */
const COMMANDES_QUI_QUITTENT = new Set(['vue.visionneuse']);
