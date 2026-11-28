// Le controleur d'edition du toit : la seule porte par laquelle un toit se modifie a la main, en 2D comme en 3D (decision du proprietaire,
// 28 novembre 2026 : « un seul controleur, pas de legacy »). L'atelier du toit (zones/AtelierToit.tsx, la zone Z10) et la Vue 3D (ses
// poignees, le toucher d'un mur) n'en sont que des adaptateurs : ils lui envoient des intentions et lisent son etat.
//
// Une instance par session. Elle tient la pile d'instantanes (sessionToit.ts), ce que la personne a choisi (l'intention, l'element, le
// batiment entier, la facade regardee) et ecrit le batiment EN PLACE, pour que le plan et la scene le montrent tout de suite ; le projet,
// lui, ne recoit rien avant « Valider » (l'adaptateur pose alors une etape d'historique avec `depart()` et l'etat final).
//
// Chaque geste est une transaction : il se calcule sur l'etat de la session (jamais sur ce que l'ecran montre pendant « Voir le toit du
// projet »), dans un brouillon (gestes.ts::brouillonDe), puis le controleur compare, ecrit, fige (`toitFige`) et empile, une fois. « Règles »
// est la seule ecriture qui ne fige pas : elle rend le toit a la lecture automatique. Un geste qui cree (poser une piece, dupliquer, un
// retour d'angle, un decroche) n'est admis que dans l'intention « Ajouter » ; un geste qui change ce qui existe, que dans « Modifier » :
// les promesses « Rien n'est créé » et « Rien d'existant n'est touché » sont tenues ici, pas par les boutons montres. Pur : ni DOM, ni scene,
// ni React.

import { champsBatiment } from '../../model/champsFonction.js';
import { aChange, annuler, creerHistorique, egaux, empiler, peutAnnuler, peutRetablir, photographier, restaurer, retablir, revenirAuDepart, type ChampsToit, type HistoriqueToit } from './sessionToit.js';
import { appliquerAuBatiment, appliquerChoix, cibleAjoutee, dupliquerElement, facadeDeLElement, groupesDe, groupesDuBatiment, lireElement, redimensionnerElement, valeurDuBatiment, valeurDuGroupe, supprimerElement, type CibleElement, type GroupeChoix } from './elements.js';
import { piece } from './pieces.js';
import { brouillonDe, ceQuiDisparait, decoupe, faitageDUnPas, faitageDeLaPortee, formeEnPlace, poserForme, poserPiece, porteeDuGeste, raisonDePiece, reprendreLectureAuto, sensDeLaPortee, tournerLeSens,
  type Choix, type FacadeChoisie, type FaitageSimple, type Portee, type SensSimple } from './gestes.js';
import { PAS_ROTATION_DEG, tournerCorps } from './corpsNeufs.js';
import { corpsAFusionner, fusionnerCorps, gaucheEnDebut, retourDAngle, scinderCorps } from './decroche.js';
import { traveeDecrochee } from './travees.js';
import { replacerSaillie } from './saillies.js';
import type { CorpsToit, ObjetPlan } from '../../model/types.js';

/** Ce que la personne fait : elle MODIFIE ce qui existe, ou elle AJOUTE une piece (retour du proprietaire, 24 novembre 2026). */
export type IntentionToit = 'modifier' | 'ajouter';
export const estIntentionToit = (v: unknown): v is IntentionToit => v === 'modifier' || v === 'ajouter';

/** Les mots de chaque intention, dits partout de la meme facon. */
export const MOTS_INTENTION: Record<IntentionToit, { verbe: string; promesse: string }> = {
  modifier: { verbe: 'Modifier', promesse: 'rien n’est créé' },
  ajouter: { verbe: 'Ajouter', promesse: 'rien d’existant n’est touché' }
};

/** Ce qu'un geste fait au toit : il change ce qui existe, ou il cree une piece. */
type Nature = 'modifie' | 'cree';
const NATURE_DE: Record<IntentionToit, Nature> = { modifier: 'modifie', ajouter: 'cree' };
const RAISON_DE_NATURE: Record<Nature, string> = {
  modifie: 'Vous ajoutez une pièce : passez à « Modifier » pour changer ce qui existe.',
  cree: 'Vous modifiez ce qui existe : passez à « Ajouter » pour créer une pièce.'
};

/** L'issue d'une intention : fait ou non, et pourquoi pas. `facade` : le mur ou se regle ce qui vient d'etre pose (la 3D s'y place). */
export interface Issue { fait: boolean; raison: string | null; facade?: { rang: number; mur: number } | null }
const RIEN: Issue = { fait: false, raison: null };
const refus = (raison: string): Issue => ({ fait: false, raison });

/** Ce que l'atelier lit du controleur pour se dessiner. */
export interface EtatEdition {
  intention: IntentionToit;
  /** L'element choisi, s'il existe encore (une annulation a pu le retirer). */
  selection: CibleElement | null;
  /** « Bâtiment entier » est choisi : une forme remplace tout le toit, le sens tourne tout le toit. */
  batimentEntier: boolean;
  facade: FacadeChoisie | null;
  /** Sur quoi agissent la forme, le faitage, le sens et les pieces, dit en mots (« Corps principal », « Tout le toit »). */
  portee: Portee;
  peutDefaire: boolean;
  peutRefaire: boolean;
  /** La session a change quelque chose depuis son depart. */
  change: boolean;
  /** Le batiment montre le toit du projet (le depart), pas la session ; le moindre geste ramene la session. */
  voitLeProjet: boolean;
  /** Les « Règles » sont allumees : le toit se lit tout seul (pas fige). */
  regles: boolean;
  /** La forme en place sur la portee (une vignette marquee), ce qu'une forme ferait disparaitre, et le geste qui decoupe un toit simple. */
  forme: { enPlace: string | null; disparait: string[]; decoupe: { piece: string; libelle: string } | null };
  faitage: FaitageSimple | null;
  sens: SensSimple | null;
  /** Les choix en image de la cible (l'element choisi, le corps de la portee, ou tout le toit), chacun avec sa valeur en place. */
  groupes: (GroupeChoix & { enPlace: string | null })[];
}

export interface ControleurToit {
  readonly cle: string;
  etat(): EtatEdition;
  /** Pourquoi la piece `id` ne se pose pas ici (null : elle se pose), intention comprise. */
  raisonDePiece(id: string): string | null;
  /** Pourquoi un geste d'une commande ne s'applique pas (null : il s'applique), intention comprise. */
  raisonDuGeste(geste: GesteNomme): string | null;

  choisirIntention(i: IntentionToit): void;
  selectionner(cible: CibleElement | null): void;
  choisirBatimentEntier(): void;
  regarder(f: FacadeChoisie | null): void;

  choisirForme(id: string): Issue;
  decouper(): Issue;
  reglerFaitage(sens: 1 | -1): Issue;
  tournerSens(): Issue;
  regler(groupe: string, valeur: string): Issue;
  poserPiece(id: string): Issue;
  poserDecroche(rang: number, mur: number, x: number, cote: 'gauche' | 'droite', reculM: number): Issue;
  redimensionner(sens: 1 | -1): Issue;
  dupliquer(): Issue;
  retirer(): Issue;
  tournerCorps(sens: 1 | -1): Issue;
  scinder(): Issue;
  retourDAngle(cote: 'gauche' | 'droite'): Issue;
  fusionner(): Issue;
  /** Replace l'element de facade `rang` sur un mur de son corps (le mur touche dans la Vue 3D), a la place dite. */
  placerSurLeMur(rang: number, place: { mur: number; centreM: number }): Issue;
  basculerRegles(): Issue;

  /** Un glisser de poignee : l'apercu ecrit le batiment sans empiler ; la fin empile une etape ; Echap rend l'etat de la pile. */
  apercu(corps: CorpsToit[], elevation?: number): void;
  finGlisser(): boolean;
  annulerGlisser(): void;

  defaire(): Issue;
  refaire(): Issue;
  revenirAuDepart(): Issue;
  /** Montre le toit du projet (le depart) ou rend la session ; faux : rien n'a change, il n'y a rien a comparer. */
  voirLeProjet(): boolean;
  /** Le rang de l'instantane courant dans la pile (la Vue 3D y range la camera de chaque pas). */
  position(): number;

  /** L'instantane de depart : ce que le projet tient tant que la session n'est pas validee. */
  depart(): ChampsToit;
  /** Ferme la session en gardant ses gestes : le batiment est a son etat final ; l'adaptateur pose l'etape d'historique. */
  valider(): { change: boolean; final: ChampsToit; depart: ChampsToit; relire: boolean };
  /** Ferme la session sans rien garder : le depart revient, au bit pres. */
  quitterSansGarder(): void;
  readonly ferme: boolean;
}

/** Les gestes nommes d'une commande, pour dire d'avance s'ils s'appliquent (un bouton grise lit cela). */
export type GesteNomme = 'faitage' | 'sens' | 'regler' | 'redimensionner' | 'dupliquer' | 'retirer' | 'tournerCorps' | 'scinder' | 'retourGauche' | 'retourDroite' | 'fusionner' | 'regles' | 'decouper';

const NATURE_DU_GESTE: Record<GesteNomme, Nature> = {
  faitage: 'modifie', sens: 'modifie', regler: 'modifie', redimensionner: 'modifie', retirer: 'modifie', tournerCorps: 'modifie', scinder: 'modifie',
  fusionner: 'modifie', regles: 'modifie', decouper: 'modifie', dupliquer: 'cree', retourGauche: 'cree', retourDroite: 'cree'
};

/** Les champs du toit compares sans la marque `toitFige` : un geste qui ne ferait que figer n'a rien change. */
const sansMarque = (c: ChampsToit): ChampsToit => { const x = { ...c }; delete x.toitFige; return x; };

/** L'etat d'une session, partage par les groupes de methodes du controleur. */
interface EtatSession { intention: IntentionToit; choix: Choix; voitLeProjet: boolean; ferme: boolean; glisse: boolean }

/** Le noyau d'une session : le batiment, la pile, l'etat, et la porte unique d'ecriture (`transaction`) avec ce qui la sert. */
interface Noyau {
  o: ObjetPlan;
  hist: HistoriqueToit;
  e: EtatSession;
  corps(): CorpsToit[];
  selectionValide(): CibleElement | null;
  choisi(): CibleElement | null;
  choixCourant(): Choix;
  portee(): Portee;
  reprendre(): void;
  raisonDeNature(n: Nature): string | null;
  transaction(nature: Nature, f: (b: ObjetPlan) => boolean | string, figer?: boolean): Issue;
  surLesCorps(nature: Nature, f: (l: CorpsToit[]) => CorpsToit[] | null | string): Issue;
  choisirLeNouveau(avant: CorpsToit[], issue: Issue): Issue;
  raisonDePiece(id: string): string | null;
  raisonDuGeste(g: GesteNomme): string | null;
}

function creerNoyau(o: ObjetPlan, intention: IntentionToit): Noyau {
  const n = { o, hist: creerHistorique(o), e: { intention, choix: { selection: null, batimentEntier: false, facade: null }, voitLeProjet: false, ferme: false, glisse: false } } as unknown as Noyau;
  n.corps = () => o.batiment?.corpsToit ?? [];
  /** La selection si l'element existe encore. */
  n.selectionValide = () => (n.e.choix.selection && lireElement(n.corps(), n.e.choix.selection) ? n.e.choix.selection : null);
  n.choisi = n.selectionValide;
  n.choixCourant = () => ({ ...n.e.choix, selection: n.selectionValide() });
  n.portee = () => porteeDuGeste(n.corps(), n.choixCourant());
  /** Le toit du projet est montre : la session reprend sa place (son dernier etat) avant tout geste, qui se calcule sur elle. */
  n.reprendre = () => {
    if (!n.e.voitLeProjet) return;
    restaurer(o, n.hist.pas[n.hist.i] as ChampsToit);
    n.e.voitLeProjet = false;
  };
  n.raisonDeNature = (x) => (n.e.ferme ? 'La session du toit est fermée.' : x === NATURE_DE[n.e.intention] ? null : RAISON_DE_NATURE[x]);
  /**
   * La porte unique : le geste `f` ecrit dans un brouillon (vrai : il a change quelque chose ; une chaine : la raison du refus). Le
   * controleur compare sans la marque, reporte le brouillon dans le batiment, fige (sauf `figer: false`, les Regles seules) et empile.
   */
  n.transaction = (nature, f, figer = true) => {
    const r = n.raisonDeNature(nature);
    if (r) return refus(r);
    // Chaque geste se calcule sur l'etat de la session, jamais sur le toit du projet montre (revue du 28 novembre 2026, constat 3).
    n.reprendre();
    const b = brouillonDe(o);
    const res = f(b);
    if (typeof res === 'string') return refus(res);
    if (!res) return RIEN;
    const avant = photographier(o), apres = photographier(b);
    if (egaux(sansMarque(avant), sansMarque(apres)) && (figer || egaux(avant, apres))) return RIEN;
    restaurer(o, apres);
    if (figer) champsBatiment(o).toitFige = true;
    empiler(n.hist, o);
    return { fait: true, raison: null };
  };
  /** Un geste qui remplace la liste des corps par `f(corps)` ; null ou une liste egale : rien. */
  n.surLesCorps = (nature, f) => n.transaction(nature, (b) => {
    const avant = b.batiment?.corpsToit ?? [], l = f(avant);
    if (typeof l === 'string') return l;
    if (!l || JSON.stringify(l) === JSON.stringify(avant)) return false;
    champsBatiment(b).corpsToit = l;
    return true;
  });
  /** Apres une piece posee ou copiee : elle est choisie, et son mur dit (la 3D s'y place). */
  n.choisirLeNouveau = (avant, issue) => {
    if (!issue.fait) return issue;
    const cible = cibleAjoutee(avant, n.corps());
    n.e.choix = { ...n.e.choix, selection: cible, batimentEntier: false };
    return { ...issue, facade: cible ? facadeDeLElement(n.corps(), cible) : null };
  };
  n.raisonDePiece = (id) => {
    const p = piece(id);
    return n.raisonDeNature(p?.famille === 'toit' ? 'modifie' : 'cree') ?? raisonDePiece(o, id, n.choixCourant());
  };
  n.raisonDuGeste = (g: GesteNomme): string | null => {
    const r = n.raisonDeNature(NATURE_DU_GESTE[g]);
    if (r) return r;
    const t = n.choisi(), l = n.corps();
    const surCorps = t?.type === 'corps' ? t.rang : null;
    switch (g) {
      case 'faitage': { const f = faitageDeLaPortee(n.o, n.portee()); return !f ? 'Pas de faîtage à régler.' : f.raison; }
      case 'sens': { const s = sensDeLaPortee(n.o, n.portee()); return !s ? 'Pas de faîtage à tourner.' : s.raison; }
      case 'redimensionner': case 'retirer': return t ? null : 'Choisissez d’abord un élément.';
      case 'dupliquer': return t && t.type !== 'corps' ? null : 'Choisissez d’abord un élément posé.';
      case 'tournerCorps': return surCorps !== null ? null : 'Choisissez d’abord un corps.';
      case 'scinder': return surCorps !== null && scinderCorps(l, surCorps) ? null : 'Ce corps ne se coupe pas en deux.';
      case 'fusionner': return surCorps !== null && corpsAFusionner(l, surCorps) !== null ? null : 'Aucun corps voisin aligné à réunir.';
      case 'retourGauche': case 'retourDroite': return surCorps !== null && retourDAngle(l, surCorps, g === 'retourGauche' ? 'gauche' : 'droite') ? null : 'Pas de retour possible de ce côté : un corps y est déjà lié, ou ce corps n’est pas un appentis.';
      case 'decouper': return decoupe(n.o) ? null : 'Ce toit est déjà découpé en corps.';
      case 'regler': return t || l.length ? null : 'Rien à régler.';
      default: return null;
    }
  };
  return n;
}

/** Ce que l'on lit, et ce que l'on choisit (rien n'est ecrit) : l'etat, les raisons, l'intention, la cible, la facade regardee. */
function lecture(n: Noyau): Pick<ControleurToit, 'cle' | 'ferme' | 'etat' | 'raisonDePiece' | 'raisonDuGeste' | 'choisirIntention' | 'selectionner' | 'choisirBatimentEntier' | 'regarder' | 'position' | 'depart'> {
  return {
    cle: n.o.key,
    get ferme() { return n.e.ferme; },

    etat(): EtatEdition {
      const p = n.portee(), sel = n.selectionValide(), l = n.corps();
      const cible: CibleElement | null = sel ?? (p.rang !== null && !p.entier ? { type: 'corps', rang: p.rang, i: 0 } : null);
      const groupes = cible ? groupesDe(l, cible).map((g) => ({ ...g, enPlace: valeurDuGroupe(l, cible, g.groupe) }))
        : p.entier ? groupesDuBatiment(l).map((g) => ({ ...g, enPlace: valeurDuBatiment(l, g.groupe) })) : [];
      return {
        intention: n.e.intention, selection: sel, batimentEntier: n.e.choix.batimentEntier, facade: n.e.choix.facade, portee: p,
        peutDefaire: peutAnnuler(n.hist), peutRefaire: peutRetablir(n.hist), change: aChange(n.hist), voitLeProjet: n.e.voitLeProjet,
        regles: !n.o.batiment?.toitFige,
        forme: { enPlace: formeEnPlace(n.o, p), disparait: p.entier ? ceQuiDisparait(l) : [], decoupe: decoupe(n.o) },
        faitage: faitageDeLaPortee(n.o, p), sens: sensDeLaPortee(n.o, p), groupes
      };
    },

    raisonDePiece: n.raisonDePiece,
    raisonDuGeste: n.raisonDuGeste,

    choisirIntention(i) { n.e.intention = i; },

    selectionner(cible) {
      n.e.choix = { ...n.e.choix, selection: cible, batimentEntier: false };
    },

    choisirBatimentEntier() { n.e.choix = { ...n.e.choix, selection: null, batimentEntier: !n.e.choix.batimentEntier }; },

    regarder(f) { n.e.choix = { ...n.e.choix, facade: f }; },

    position: () => n.hist.i,

    depart: () => structuredClone(n.hist.pas[0] as ChampsToit)
  };
}

/** Les gestes sur la forme, la hauteur et le sens du toit, et les pieces posees. */
function gestesDuToit(n: Noyau): Pick<ControleurToit, 'choisirForme' | 'decouper' | 'reglerFaitage' | 'tournerSens' | 'regler' | 'poserPiece' | 'poserDecroche' | 'basculerRegles'> {
  return {
    choisirForme(id) {
      n.reprendre();
      if (piece(id)?.famille !== 'toit') return refus('Ce n’est pas une forme de toit.');
      const p = n.portee();
      return n.transaction('modifie', (b) => poserForme(b, id, p));
    },

    decouper() {
      n.reprendre();
      const d = decoupe(n.o);
      if (!d) return refus('Ce toit est déjà découpé en corps.');
      return n.transaction('modifie', (b) => poserForme(b, d.piece, n.portee()));
    },

    reglerFaitage(sens) { n.reprendre(); const p = n.portee(); return n.transaction('modifie', (b) => faitageDUnPas(b, p, sens)); },

    tournerSens() { n.reprendre(); const p = n.portee(); return n.transaction('modifie', (b) => tournerLeSens(b, p)); },

    regler(groupe, valeur) {
      n.reprendre();
      const t = n.choisi(), p = n.portee();
      return n.surLesCorps('modifie', (l) => (t ? appliquerChoix(l, t, groupe, valeur) : p.entier ? appliquerAuBatiment(l, groupe, valeur)
        : p.rang !== null ? appliquerChoix(l, { type: 'corps', rang: p.rang, i: 0 }, groupe, valeur) : null));
    },

    poserPiece(id) {
      n.reprendre();
      const r = n.raisonDePiece(id);
      if (r) return refus(r);
      if (piece(id)?.famille === 'toit') return n.transaction('modifie', (b) => poserForme(b, id, n.portee()));
      const avant = structuredClone(n.corps()), c = n.choixCourant();
      const issue = n.choisirLeNouveau(avant, n.transaction('cree', (b) => poserPiece(b, id, c)));
      // Une piece posee : on regle ce qu'on vient d'ajouter.
      if (issue.fait) n.e.intention = 'modifier';
      return issue;
    },

    poserDecroche(rang, mur, x, cote, reculM) {
      n.reprendre();
      const avant = structuredClone(n.corps());
      const issue = n.transaction('cree', (b) => {
        const c = b.batiment?.corpsToit?.[rang];
        const k = c ? traveeDecrochee(c, mur, x, cote, reculM, gaucheEnDebut(c, mur)) : null;
        if (!c || !k) return 'Pas de décroché ici : le point est dans une travée, ou le mur est trop court de ce côté.';
        c.travees = [...(c.travees ?? []), k];
        champsBatiment(b).modeToit = 'corps';
        return true;
      });
      if (issue.fait) n.e.intention = 'modifier';
      return n.choisirLeNouveau(avant, issue);
    },

    basculerRegles() {
      // La seule ecriture qui ne fige pas : rallumees, les Regles rendent le toit a la lecture automatique (relu a la validation).
      return n.transaction('modifie', (b) => {
        if (b.batiment?.toitFige) reprendreLectureAuto(b);
        else champsBatiment(b).toitFige = true;
        return true;
      }, false);
    }
  };
}

/** Les gestes sur l'element ou le corps choisi. */
function gestesDeLaCible(n: Noyau): Pick<ControleurToit, 'redimensionner' | 'dupliquer' | 'retirer' | 'tournerCorps' | 'scinder' | 'retourDAngle' | 'fusionner' | 'placerSurLeMur'> {
  return {
    redimensionner(sens) {
      n.reprendre();
      const t = n.choisi();
      if (!t) return refus('Choisissez d’abord un élément.');
      return n.surLesCorps('modifie', (l) => redimensionnerElement(l, t, sens));
    },

    dupliquer() {
      n.reprendre();
      const t = n.choisi();
      if (!t || t.type === 'corps') return refus('Choisissez d’abord un élément posé.');
      let nouvelle: CibleElement | null = null;
      const issue = n.surLesCorps('cree', (l) => { const r = dupliquerElement(l, t); if (!r) return 'Pas de place à côté : déplacez ou réduisez d’abord.'; nouvelle = r.cible; return r.corps; });
      if (issue.fait) n.e.choix = { ...n.e.choix, selection: nouvelle };
      return issue;
    },

    retirer() {
      n.reprendre();
      const t = n.choisi();
      if (!t) return refus('Choisissez d’abord un élément.');
      // Le corps principal ne se supprime pas : rien a ecrire.
      const issue = n.surLesCorps('modifie', (l) => { const r = supprimerElement(l, t); return r.length === l.length && t.type === 'corps' ? 'Le corps principal reste.' : r; });
      if (issue.fait) n.e.choix = { ...n.e.choix, selection: null };
      return issue;
    },

    tournerCorps(sens) {
      n.reprendre();
      const t = n.choisi();
      if (t?.type !== 'corps') return refus('Choisissez d’abord un corps.');
      return n.surLesCorps('modifie', (l) => tournerCorps(l, t.rang, sens * PAS_ROTATION_DEG));
    },

    scinder() {
      n.reprendre();
      const t = n.choisi();
      if (t?.type !== 'corps') return refus('Choisissez d’abord un corps.');
      let k = 0;
      const issue = n.surLesCorps('modifie', (l) => { const r = scinderCorps(l, t.rang); k = r?.length ?? 0; return r; });
      if (issue.fait) n.e.choix = { ...n.e.choix, selection: { type: 'corps', rang: k - 1, i: 0 } };
      return issue;
    },

    retourDAngle(cote) {
      n.reprendre();
      const t = n.choisi();
      if (t?.type !== 'corps') return refus('Choisissez d’abord un corps.');
      let k = 0;
      const issue = n.surLesCorps('cree', (l) => { const r = retourDAngle(l, t.rang, cote); k = r?.length ?? 0; return r ?? 'Pas de retour possible de ce côté : un corps y est déjà lié, ou ce corps n’est pas un appentis.'; });
      if (issue.fait) n.e.choix = { ...n.e.choix, selection: { type: 'corps', rang: k - 1, i: 0 } };
      return issue;
    },

    fusionner() {
      n.reprendre();
      const t = n.choisi();
      if (t?.type !== 'corps') return refus('Choisissez d’abord un corps.');
      const voisin = corpsAFusionner(n.corps(), t.rang);
      const issue = n.surLesCorps('modifie', (l) => fusionnerCorps(l, t.rang));
      // Le voisin parti, le corps reuni descend d'un rang s'il etait apres lui.
      if (issue.fait && voisin !== null) n.e.choix = { ...n.e.choix, selection: { type: 'corps', rang: voisin < t.rang ? t.rang - 1 : t.rang, i: 0 } };
      return issue;
    },

    placerSurLeMur(rang, place) {
      n.reprendre();
      return n.surLesCorps('modifie', (l) => (l[rang]?.saillie ? replacerSaillie(l, rang, place) : null));
    }
  };
}

/** La pile : les glisser des poignees, defaire, refaire, revenir au depart, voir le toit du projet, valider, quitter sans garder. */
function pile(n: Noyau): Pick<ControleurToit, 'apercu' | 'finGlisser' | 'annulerGlisser' | 'defaire' | 'refaire' | 'revenirAuDepart' | 'voirLeProjet' | 'valider' | 'quitterSansGarder'> {
  return {
    apercu(l, elevation) {
      if (n.e.ferme || n.raisonDeNature('modifie')) return;
      n.reprendre();
      n.e.glisse = true;
      const b = champsBatiment(n.o);
      b.corpsToit = l;
      b.toitFige = true;
      // La hauteur a l'egout du corps principal s'ecrit comme le champ « Élévation » de l'inspecteur : elle est saisie, et la garde.
      if (elevation !== undefined) { n.o.elevation = elevation; b.egoutChoisi = 'saisie'; }
    },

    finGlisser() {
      if (!n.e.glisse) return false;
      n.e.glisse = false;
      return empiler(n.hist, n.o);
    },

    annulerGlisser() {
      n.e.glisse = false;
      restaurer(n.o, n.hist.pas[n.hist.i] as ChampsToit);
    },

    defaire() { n.reprendre(); return { fait: annuler(n.hist, n.o), raison: null }; },

    refaire() { n.reprendre(); return { fait: retablir(n.hist, n.o), raison: null }; },

    revenirAuDepart() { n.reprendre(); return { fait: revenirAuDepart(n.hist, n.o), raison: null }; },

    voirLeProjet() {
      if (n.e.voitLeProjet) { n.reprendre(); return true; }
      if (!aChange(n.hist)) return false;
      restaurer(n.o, n.hist.pas[0] as ChampsToit);
      n.e.voitLeProjet = true;
      return true;
    },

    valider() {
      n.reprendre();
      const final = photographier(n.o), change = aChange(n.hist);
      n.e.ferme = true;
      // « Règles » rallumees (le toit n'est plus fige a la fin) : la lecture automatique le relit tout de suite.
      return { change, final, depart: structuredClone(n.hist.pas[0] as ChampsToit), relire: change && !final.toitFige };
    },

    quitterSansGarder() {
      restaurer(n.o, n.hist.pas[0] as ChampsToit);
      n.e.voitLeProjet = false;
      n.e.ferme = true;
    }
  };
}

/** Ouvre une session d'edition sur le batiment `o` (ecrit en place). `intention` : celle d'ouverture (« Modifier » par defaut). */
export function creerControleurToit(o: ObjetPlan, intention: IntentionToit = 'modifier'): ControleurToit {
  const n = creerNoyau(o, intention);
  // Les accesseurs (`ferme`) ne survivent pas a un etalement : l'objet de lecture est la base, les gestes s'y ajoutent.
  return Object.assign(lecture(n), gestesDuToit(n), gestesDeLaCible(n), pile(n));
}
