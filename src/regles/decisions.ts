// Les propositions d'un audit de la parcelle (MD/spec-audit.md §13, §14) : ce que les mesures du
// telephone, et plus tard Claude analyste, proposent de changer dans le projet. Rien n'est ecrit sans
// validation : chaque proposition dit son avant, son apres, d'ou elle vient, et l'effet qu'elle aura.
//
// La structure est commune aux deux sources (§13.2) : `source` dit qui propose, `indices` ce qui l'a
// fait proposer (sur quelle photo), `confiance` combien elle est sure. Les propositions des mesures
// (lot L11) n'ont d'indice que la photo ; celles de Claude (lot L17) en auront davantage.
//
// L'effet est une donnee, pas une fonction : il s'ecrit dans le fichier de l'audit (§15, lot L21) et
// se rejoue a l'identique. `appliquerPropositions` l'ecrit sur les objets qu'on lui donne : ceux du
// projet a la validation (apres un seul instantane d'historique), ou des copies pour l'apercu 3D.

import { elevationParDefaut } from '../model/defaults.js';
import { poserAccesVuDeLaRue, reglerCoteVuDeLaRue } from '../model/cloture.js';
import type { MateriauTexture } from '../model/couleurMur.js';
import type { PositionPortail, TypeCloture as TypeClotureVue } from '../model/clotureVue.js';
import type { ElementDeMurFait, SaillieDeMurFait } from './toits/faits.js';
import type { ChampsBatiment, Cheminee, CorpsToit, CouvertureChoisie, DetailsOuverture, Lucarne, ObjetPlan, ReleveFacade, TerrasseToit } from '../model/types.js';
import { completerDetails } from '../model/ouverturesVues.js';
import { ouverturesHorsDesLucarnes, releveReecrit, type LucarneSurLeMur } from '../model/facadeObjet.js';

/**
 * Qui propose : une mesure faite dans le telephone, Claude analyste (lot L17), ou plusieurs sources arbitrees par le moteur de
 * reconciliation (MD/spec-reconciliation.md) : alors `arbitrages` dit chaque source et la raison de la decision.
 */
export type SourceProposition = 'mesure' | 'claude' | 'arbitrage';

/** Un constat d'une source dans une proposition arbitree : ce qu'elle dit, sa confiance, ce qu'elle pese, et la regle qui l'a lu. */
export interface LigneArbitrage {
  /** `ign`, `lidar`, `photo`, `claude`, `terrain` (regles/reconciliation.ts). */
  source: string;
  libelle: string;
  /** Sa valeur, en clair : « 6,2 m », « pignon + croupe ». */
  valeur: string;
  confiance: number | null;
  score: number;
  regle?: string;
}

/** Les sources qui s'accordent sur une valeur : le groupe retenu d'abord. */
export interface GroupeArbitrage { valeur: string; score: number; retenu: boolean; lignes: LigneArbitrage[] }

/** L'arbitrage d'un attribut qui a fait une proposition : la decision du moteur, sa raison, et tous les constats. */
export interface ArbitrageProposition {
  /** L'objet : `batiment:<cle>`, `facade:<cle>#<cote>` (regles/reconciliation.ts). */
  cible: string;
  /** `hauteurEgout`, `formeToit`, `boutsToit`, `sensFaitage`... */
  attribut: string;
  libelle: string;
  /** La facade visee, quand l'arbitrage est celui d'un mur : « sud (côté 3) » (point cardinal et numero du cote). */
  cibleNom?: string;
  /** `auto` : le moteur a decide seul ; `manuelle` : a la personne ; `choisie` : elle a retenu une source ; `forcee` : elle a donne sa valeur. */
  decision: 'auto' | 'manuelle' | 'rien' | 'choisie' | 'forcee';
  /** Comment se force l'attribut : une cote (`nombre`), un angle, un mot (`egal`) ou des mots (`ensemble`) ; l'unite d'une cote. */
  accord: 'nombre' | 'angle' | 'egal' | 'ensemble';
  unite?: string;
  /** Les valeurs que l'on peut forcer quand l'attribut est en mots : la valeur (JSON) et son libelle. */
  options?: { valeur: string; libelle: string }[];
  /** Ce que la personne a force, en clair. */
  forcee?: string;
  raison: string;
  /** Ce que le projet a aujourd'hui, en clair. */
  avant: string;
  groupes: GroupeArbitrage[];
  /** Les seuils et les regles qui ont decide. */
  regles: string[];
}

/** Ce qui justifie une proposition : une phrase, et la photo ou on le voit. */
export interface IndiceProposition {
  texte: string;
  /** La photo de la capture : le batiment, la facade s'il y a lieu, et son rang. */
  photo?: { cle: string; cote?: number; rang: number };
}

/** Sur quoi porte une proposition : une facade, un batiment, ou la parcelle (cloture, portail). */
export type CibleProposition =
  | { type: 'facade'; cle: string; cote: number }
  | { type: 'batiment'; cle: string }
  | { type: 'parcelle' };

/** Ce que la proposition ecrit, une fois cochee et validee. */
export type EffetProposition =
  /** Le releve d'une facade, a la hauteur mesuree : il est ramene a celle du batiment a l'ecriture. */
  | { type: 'releve'; releve: ReleveFacade }
  /**
   * Les details que Claude voit sur la majorite des ouvertures d'une facade (volets et leur couleur, vitrage, ouvrant,
   * porte, garage) : ils completent, sur le releve de la facade `cote` tel qu'il est a l'ecriture, les ouvertures du type
   * qu'ils concernent et qui ne les ont pas (model/ouverturesVues.ts). Ecrits apres les releves : ils valent pour celui qui est coche.
   */
  | { type: 'detailsOuvertures'; cote: number; details: DetailsOuverture }
  | { type: 'hauteur'; hauteurM: number }
  /** La hauteur totale (au faitage) d'un batiment sans corps : la hauteur de son toit au-dessus de l'egout en est deduite. */
  | { type: 'hauteurToit'; faitageM: number }
  | { type: 'couleurMurs'; couleur: string }
  | { type: 'materiauMurs'; materiau: MateriauTexture }
  | { type: 'couverture'; couverture: CouvertureChoisie }
  /** Les corps du toit relus sur la mesure sous la forme et les bouts que Claude a vus : ils remplacent ceux du batiment. */
  | { type: 'corpsToit'; corps: CorpsToit[] }
  /** Un seul corps du toit, au rang `corps`, relu sous les silhouettes de ses murs (corps par corps) : les autres ne bougent pas. */
  | { type: 'corpsDuToit'; corps: number; toit: CorpsToit }
  /**
   * Les souches vues, posees sur le corps `corps` ; celles d'une observation precedente sont retirees. `apresForme` : leur place
   * sur les corps de la forme du toit proposee dans le meme audit, quand celle-ci est validee avec elles (null : elles n'y tiennent
   * pas) ; de meme pour les lucarnes, la terrasse et les appentis.
   */
  | { type: 'cheminees'; corps: number; cheminees: Cheminee[]; apresForme?: { corps: number; cheminees: Cheminee[] } | null }
  /** Les appentis des corps `corps`, ouverts (poteaux, sans mur exterieur) ou fermes (murs jusqu'au sol). */
  | { type: 'appentis'; corps: number[]; ouvert: boolean; apresForme?: { corps: number[] } | null }
  /** Les lucarnes vues, posees sur le corps `corps` ; celles d'une observation precedente sont retirees (celles du LiDAR restent). */
  | { type: 'lucarnes'; corps: number; lucarnes: Lucarne[]; apresForme?: { corps: number; lucarnes: Lucarne[] } | null }
  /**
   * Les cheminees et lucarnes que le moteur pose sur le corps `corps` d'apres la ligne du haut d'une facade (lot F7) : elles s'ajoutent
   * a ce que le corps porte, qui ne bouge pas. `vu` : l'element tel que la facade le montre, de quoi le reposer par le moteur sur les
   * corps d'une forme validee avec lui (`apresForme`). `facade` : le mur ou la lucarne se voit ; l'ouverture qui est sa fenetre quitte
   * la facade objet (un element n'a qu'un endroit, MD/spec-facade-calage-audit.md §5 quater).
   */
  | { type: 'elementsDuToit'; corps: number; cheminees: Cheminee[]; lucarnes: Lucarne[]; vu: ElementDeMurFait; facade: { cote: number; lucarnes: LucarneSurLeMur[] } | null; apresForme?: { corps: number; cheminees: Cheminee[]; lucarnes: Lucarne[] } | null }
  | { type: 'terrasse'; corps: number; terrasse: TerrasseToit; apresForme?: { corps: number; terrasse: TerrasseToit } | null }
  /**
   * Une saillie (bow-window, galerie, auvent, appentis) que le moteur pose sur le corps d'un mur d'apres le run d'une facade (lot L1) :
   * le corps neuf (`corps`, sa `saillie` designe son hote) s'ajoute apres les autres, qui ne bougent pas. `vu` : la saillie telle que la
   * facade la montre, de quoi la reposer par le moteur sur les corps d'une forme validee avec elle (`apresForme`).
   */
  | { type: 'saillieDuToit'; corps: CorpsToit; vu: SaillieDeMurFait; apresForme?: { corps: CorpsToit } | null }
  | { type: 'cloture'; cote: number; typeCloture: TypeClotureVue; hauteurM?: number; soubassement?: boolean }
  | { type: 'portail'; cote: number; nature: 'portail' | 'portillon' | 'aucun'; position?: PositionPortail; largeurM?: number }
  /**
   * Un objet NEUF du jardin, lu sur la photo aerienne (lot L3, facade/regles/jardin.ts) : un arbre, une plate-bande, un regard, une
   * piscine deja la... La proposition vise la parcelle ; l'objet est ajoute au plan, une fois coche et valide, sous sa cle (une
   * seconde validation ne le double pas). Il ne modifie aucun objet existant.
   */
  | { type: 'ajoutObjet'; objet: ObjetPlan };

export type TypeEffet = EffetProposition['type'];

export interface Proposition {
  /** Stable d'une analyse a l'autre : les cases cochees survivent a un nouveau calcul. */
  id: string;
  cible: CibleProposition;
  /** « Façade sud de Maison », « Toit de Maison », « Clôture côté rue ». */
  objet: string;
  /** Ce que le projet a aujourd'hui, et ce qu'il aura : « 4 ouvertures », « 6 ouvertures relevées ». */
  avant: string;
  apres: string;
  source: SourceProposition;
  indices: IndiceProposition[];
  /** De 0 a 1 ; null quand la mesure ne la donne pas (une observation, une couleur lue). */
  confiance: number | null;
  /** La valeur choisie a la main que la proposition remplacerait : « brique rouge » (§14.3). */
  remplaceChoix: string | null;
  /** Pourquoi elle arrive decochee, hors choix remplace : « coins non trouvés sur la photo ». */
  reserve: string | null;
  effet: EffetProposition;
  /** Les arbitrages dont la proposition est la decision (source `arbitrage`) : un par attribut, tous les constats. */
  arbitrages?: ArbitrageProposition[];
}

/** En deca, une proposition arrive decochee (spec-audit §14.3). */
export const CONFIANCE_MIN = 0.5;
/** Claude seul sur un attribut : decochee sous ce taux d'accord (spec-regles-toits §14.2). */
export const ACCORD_CLAUDE_MIN = 0.95;

/** La case d'une proposition a son arrivee : jamais cochee si elle remplace un choix fait a la main. */
export function cocheeParDefaut(p: Proposition): boolean {
  if (p.remplaceChoix || p.reserve) return false;
  // Une decision arbitree : cochee quand le moteur l'a prise seul (aucun constat ne se contredit, aucun veto) ou que la personne l'a prise.
  if (p.arbitrages?.length) return p.arbitrages.every((a) => a.decision !== 'manuelle');
  if (p.confiance === null) return true;
  return p.confiance >= (p.source === 'claude' ? ACCORD_CLAUDE_MIN : CONFIANCE_MIN);
}

/**
 * Les effets qu'une valeur notee sur place (« Ce que je vois », source `mesure`) et une valeur vue par Claude peuvent
 * ecrire tous les deux. Sur ceux-la, la personne qui etait devant le batiment l'emporte (decision D21 de
 * MD/plan-vague-3-generaliser.md) : cocher l'une decoche l'autre.
 */
export const EFFETS_NOTES_SUR_PLACE: readonly TypeEffet[] = ['materiauMurs', 'couverture', 'cheminees', 'lucarnes', 'appentis', 'terrasse'];

/** Les propositions qui ecrivent le meme attribut du meme batiment, d'une autre source : la valeur notee sur place et celle de Claude. */
export function rivalesSurPlace(p: Proposition, toutes: readonly Proposition[]): Proposition[] {
  if (!EFFETS_NOTES_SUR_PLACE.includes(p.effet.type)) return [];
  const cible = JSON.stringify(p.cible);
  return toutes.filter((x) => x.id !== p.id && x.source !== p.source && x.effet.type === p.effet.type && JSON.stringify(x.cible) === cible);
}

/** La phrase d'une ligne de Claude qui a une rivale notee sur place : elle arrive decochee et dit pourquoi. */
export const RESERVE_NOTE_SUR_PLACE = 'Vous avez noté cet attribut sur place, et cela l’emporte : cocher cette ligne décoche votre note.';

/** Les propositions, avec la reserve D21 ajoutee a celle de chaque ligne de Claude qui a une rivale notee sur place ; les autres sont rendues telles quelles. */
export function avecReserveSurPlace(propositions: readonly Proposition[]): Proposition[] {
  return propositions.map((p) => (p.source === 'claude' && rivalesSurPlace(p, propositions).length ? { ...p, reserve: p.reserve ? p.reserve + ' ' + RESERVE_NOTE_SUR_PLACE : RESERVE_NOTE_SUR_PLACE } : p));
}

/** La cle du batiment que la proposition touche ; null pour la parcelle. */
export const cleDeLaCible = (c: CibleProposition): string | null => (c.type === 'parcelle' ? null : c.cle);

/**
 * Les cles des objets que la proposition change ou ajoute : celle de sa cible (un batiment, une facade), et celle de l'objet neuf
 * qu'elle pose (lot L3). La vue « Après » les repose.
 */
export const clesVisees = (p: Pick<Proposition, 'cible' | 'effet'>): string[] => {
  const cle = cleDeLaCible(p.cible);
  return [...(cle !== null ? [cle] : []), ...(p.effet.type === 'ajoutObjet' ? [p.effet.objet.key] : [])];
};

const cm = (v: number) => Math.round(v * 100) / 100;

/** La hauteur d'un batiment, comme engine/hauteurs.ts::elevationOf (le modele ne lit pas le moteur). */
export function hauteurDe(o: ObjetPlan): number {
  return typeof o.elevation === 'number' ? o.elevation : elevationParDefaut(o.fonction ?? '');
}

/**
 * Un releve ramene a une autre hauteur d'egout : la largeur est celle du plan, c'est la hauteur
 * seule qui change, donc tout ce qui est vertical s'etire du meme facteur (facade/releve/analyseSerie.ts,
 * `etirerEnHauteur`, fait de meme dans le releve).
 */
export function releveALaHauteur(r: ReleveFacade, hauteur: number): ReleveFacade {
  if (!(r.hauteur > 0) || !(hauteur > 0) || Math.abs(hauteur - r.hauteur) < 1e-9) return { ...r, hauteur: r.hauteur };
  const k = hauteur / r.hauteur;
  return {
    ...r,
    hauteur: cm(hauteur),
    ouvertures: r.ouvertures.map((o) => ({ ...o, y: cm(o.y * k), h: cm(o.h * k) })),
    ...(r.hauteurTexture !== undefined ? { hauteurTexture: cm(r.hauteurTexture * k) } : {}),
    ...(r.partieBasse ? { partieBasse: { ...r.partieBasse, hauteur: cm(r.partieBasse.hauteur * k) } } : {}),
  };
}

function appliquerCloture(p: ObjetPlan, e: Extract<EffetProposition, { type: 'cloture' }>): void {
  if (!('pts' in p) || !p.pts) return;
  reglerCoteVuDeLaRue(p, e.cote, e.typeCloture, e.hauteurM, e.soubassement);
}

function appliquerPortail(p: ObjetPlan, e: Extract<EffetProposition, { type: 'portail' }>): void {
  if (!('pts' in p) || !p.pts) return;
  poserAccesVuDeLaRue(p, e.cote, e.nature, e.position, e.largeurM);
}

/**
 * Le sous-objet `batiment` de l'objet, recopie avant d'y ecrire : un effet n'ecrit jamais dans le sous-objet d'un autre objet. Une
 * copie de surface de l'objet suffit ainsi a l'apercu (`projetApres`), comme quand ces champs etaient a plat.
 */
function batimentACopier(o: ObjetPlan): ChampsBatiment {
  return (o.batiment = { ...o.batiment });
}

/**
 * L'effet d'une proposition sur le batiment qu'elle vise (ou la parcelle). Sur un batiment, chaque
 * effet remplace le champ qu'il ecrit (une liste, un objet neufs) sans rien modifier en place : une
 * copie de surface du batiment suffit a l'apercu, le plan n'est pas touche. La cloture, elle, est
 * modifiee en place (model/cloture.ts) : elle ne s'ecrit que sur le projet.
 */
function appliquerEffet(o: ObjetPlan, e: EffetProposition): void {
  switch (e.type) {
    case 'releve': {
      // Sur un mur deja releve, le travail de la personne reste : ses ouvertures verifiees, corrigees ou ajoutees, la forme et les
      // dimensions de la Facade qu'elle a validee (model/facadeObjet.ts::releveReecrit, lot F5).
      const existant = o.batiment?.facades?.find((x) => x.cote === e.releve.cote);
      const r = releveReecrit(o, existant, releveALaHauteur(e.releve, hauteurDe(o)));
      batimentACopier(o).facades = [...(o.batiment?.facades ?? []).filter((x) => x.cote !== r.cote), r].sort((a, b) => a.cote - b.cote);
      return;
    }
    case 'detailsOuvertures': {
      // Un releve neuf a la place de l'ancien, jamais modifie en place : l'apercu (`projetApres`) partage la liste des releves
      // avec le plan, et un releve touche ici changeait le projet sans Ctrl+Z ni « projet modifie ».
      const facades = o.batiment?.facades ?? [];
      if (!facades.some((x) => x.cote === e.cote)) return;
      batimentACopier(o).facades = facades.map((r) => (r.cote !== e.cote ? r : { ...r, ouvertures: r.ouvertures.map((x) => { const d = completerDetails(x.type, x.details, e.details); return d ? { ...x, details: d } : x; }) }));
      return;
    }
    // Validee, la hauteur a l'egout est choisie : ni le LiDAR ni l'actualisation ne la reecrivent (model/protections.ts).
    case 'hauteur': o.elevation = cm(e.hauteurM); batimentACopier(o).egoutChoisi = 'audit'; return;
    case 'hauteurToit': if (o.batiment?.toit) batimentACopier(o).toit = { ...o.batiment?.toit, hauteur: Math.max(0.1, cm(e.faitageM - hauteurDe(o))) }; return;
    case 'couleurMurs': {
      // Valider la couleur vue sur place, c'est la choisir : un choix de source anterieur tombe.
      const suite = { ...(o.batiment?.couleurMurs ?? {}), terrain: { couleur: e.couleur, date: '' } };
      delete suite.source;
      batimentACopier(o).couleurMurs = suite;
      return;
    }
    case 'materiauMurs': {
      const suite = { ...(o.batiment?.couleurMurs ?? {}), materiau: e.materiau };
      if (suite.source === 'plan') delete suite.source;
      batimentACopier(o).couleurMurs = suite;
      return;
    }
    case 'corpsToit': batimentACopier(o).corpsToit = JSON.parse(JSON.stringify(e.corps)) as CorpsToit[]; return;
    case 'corpsDuToit': if (o.batiment?.corpsToit?.[e.corps]) batimentACopier(o).corpsToit = o.batiment?.corpsToit.map((c, i) => (i === e.corps ? (JSON.parse(JSON.stringify(e.toit)) as CorpsToit) : c)); return;
    case 'couverture': if (o.batiment?.toit) batimentACopier(o).toit = { ...o.batiment?.toit, couverture: e.couverture }; return;
    case 'cheminees': {
      const corps = o.batiment?.corpsToit;
      if (!corps || !corps[e.corps]) return;
      batimentACopier(o).corpsToit = corps.map((c, i) => {
        const gardees = (c.cheminees ?? []).filter((ch) => ch.source !== 'observation');
        const suite = i === e.corps ? [...gardees, ...e.cheminees.map((ch) => ({ ...ch }))] : gardees;
        const copie = { ...c };
        if (suite.length) copie.cheminees = suite; else delete copie.cheminees;
        return copie;
      });
      return;
    }
    case 'appentis': {
      const corps = o.batiment?.corpsToit;
      if (!corps) return;
      batimentACopier(o).corpsToit = corps.map((c, i) => (e.corps.includes(i) ? { ...c, ouvert: e.ouvert } : c));
      return;
    }
    case 'lucarnes': {
      const corps = o.batiment?.corpsToit;
      if (!corps || !corps[e.corps]) return;
      batimentACopier(o).corpsToit = corps.map((c, i) => {
        const gardees = (c.lucarnes ?? []).filter((l) => l.source !== 'observation');
        const suite = i === e.corps ? [...gardees, ...e.lucarnes.map((l) => ({ ...l }))] : gardees;
        const copie = { ...c };
        if (suite.length) copie.lucarnes = suite; else delete copie.lucarnes;
        return copie;
      });
      return;
    }
    case 'elementsDuToit': appliquerElementsDuToit(o, e); return;
    case 'saillieDuToit': {
      // Ajoutee apres les autres corps, une seule fois : une saillie deja posee sur ce mur de cet hote, au meme endroit, reste seule.
      const corps = o.batiment?.corpsToit, s = e.corps.saillie;
      if (!corps || !s || !corps[s.hote] || corps.some((c) => c.saillie && c.saillie.hote === s.hote && c.saillie.mur === s.mur && Math.abs(c.saillie.centreM - s.centreM) < (c.saillie.largeurM + s.largeurM) / 2)) return;
      batimentACopier(o).corpsToit = [...corps, JSON.parse(JSON.stringify(e.corps)) as CorpsToit];
      return;
    }
    case 'terrasse': {
      const corps = o.batiment?.corpsToit;
      if (!corps || !corps[e.corps]) return;
      batimentACopier(o).corpsToit = corps.map((c, i) => (i === e.corps ? { ...c, terrasse: JSON.parse(JSON.stringify(e.terrasse)) as TerrasseToit } : c));
      return;
    }
    case 'cloture': appliquerCloture(o, e); return;
    case 'portail': appliquerPortail(o, e); return;
    // Pose par `appliquerPropositions` (un objet neuf n'a pas de cible a modifier).
    case 'ajoutObjet': return;
  }
}

/**
 * Les cheminees et lucarnes posees par le moteur d'apres une facade (lot F7) : ajoutees a celles du corps, sans en deplacer aucune (un
 * element pose a la main ne bouge jamais) ; la fenetre d'une lucarne quitte la facade objet du mur ou elle se voit.
 */
function appliquerElementsDuToit(o: ObjetPlan, e: Extract<EffetProposition, { type: 'elementsDuToit' }>): void {
  const corps = o.batiment?.corpsToit, c = corps?.[e.corps];
  if (!corps || !c) return;
  const suite: CorpsToit = { ...c };
  if (e.cheminees.length) suite.cheminees = [...(c.cheminees ?? []), ...e.cheminees.map((ch) => ({ ...ch }))];
  if (e.lucarnes.length) suite.lucarnes = [...(c.lucarnes ?? []), ...e.lucarnes.map((l) => ({ ...l }))];
  batimentACopier(o).corpsToit = corps.map((x, i) => (i === e.corps ? suite : x));
  const f = e.facade, facades = o.batiment?.facades;
  if (!f || !facades?.some((r) => r.cote === f.cote)) return;
  batimentACopier(o).facades = facades.map((r) => {
    if (r.cote !== f.cote) return r;
    const ouvertures = ouverturesHorsDesLucarnes(r.ouvertures, f.lucarnes);
    return ouvertures.length === r.ouvertures.length ? r : { ...r, ouvertures };
  });
}

/**
 * L'effet d'un element du toit une fois la forme ecrite dans la meme validation : sa place sur les corps neufs, ou rien quand il
 * n'y tient pas (`apresForme: null`). Un effet sans `apresForme` (une ancienne proposition, un autre effet) reste tel quel.
 */
function effetApresForme(e: EffetProposition): EffetProposition | null {
  if (e.type !== 'cheminees' && e.type !== 'lucarnes' && e.type !== 'terrasse' && e.type !== 'appentis' && e.type !== 'elementsDuToit' && e.type !== 'saillieDuToit') return e;
  if (e.apresForme === undefined) return e;
  if (e.apresForme === null) return null;
  const { apresForme, ...reste } = e;
  return { ...reste, ...apresForme } as EffetProposition;
}

/** L'ordre d'ecriture : la hauteur d'abord, pour que les releves y soient ramenes. */
const RANG_EFFET: Record<TypeEffet, number> = { hauteur: 0, hauteurToit: 1, releve: 1, detailsOuvertures: 2, couleurMurs: 2, materiauMurs: 2, couverture: 2, corpsToit: 2, corpsDuToit: 2.5, elementsDuToit: 2.75, saillieDuToit: 2.8, cheminees: 3, lucarnes: 3, appentis: 3, terrasse: 3, cloture: 4, portail: 4, ajoutObjet: 5 };

/**
 * Les effets qui ecrivent le toit d'un batiment (sa forme, ses corps et ce qu'ils portent) : valides, ils sont une decision de la
 * personne, que la relecture du LiDAR ne doit plus remplacer. La couverture n'en est pas : la relecture la garde
 * (app/toits/toitsLidar.ts::avecCouleurDe).
 */
export const EFFETS_DU_TOIT: readonly TypeEffet[] = ['corpsToit', 'corpsDuToit', 'hauteurToit', 'elementsDuToit', 'saillieDuToit', 'cheminees', 'lucarnes', 'appentis', 'terrasse'];

/**
 * Ecrit les propositions sur ces objets (les memes, modifies en place), et marque « vérifié sur
 * place » les batiments de `verifies`, a la date `jour` (AAAA-MM-JJ). Rend les cles des objets
 * touches : l'apercu 3D ne repose qu'eux.
 *
 * Un batiment dont le toit est ecrit est fige (`toitFige`, les « Règles » coupees du mode Toit) : la relecture du LiDAR
 * (app/toits/toitsLidar.ts::toitAAjuster, toitsFond.ts) et l'actualisation IGN ne le remplacent plus en silence ; la personne
 * rallume les « Règles » pour le rendre a la lecture automatique.
 *
 * Quand la forme du toit est ecrite (`corpsToit`), un element pose dans la meme validation (cheminees, lucarnes, terrasse,
 * appentis) prend sa place calculee sur les corps neufs (`apresForme`) : celle des corps d'avant ne vaut plus.
 */
export function appliquerPropositions(objets: ObjetPlan[], propositions: readonly Proposition[], verifies: readonly string[], jour: string): string[] {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  const touches = new Set<string>();
  const formeEcrite = new Set<string>();
  const ordre = [...propositions].sort((a, b) => RANG_EFFET[a.effet.type] - RANG_EFFET[b.effet.type]);
  for (const p of ordre) {
    // Un objet neuf du jardin (lot L3) : ajoute sous sa cle, une copie, et jamais deux fois.
    if (p.effet.type === 'ajoutObjet') {
      const neuf = p.effet.objet;
      if (!parCle.has(neuf.key)) {
        const copie = JSON.parse(JSON.stringify(neuf)) as ObjetPlan;
        objets.push(copie);
        parCle.set(copie.key, copie);
        touches.add(copie.key);
      }
      continue;
    }
    const cle = cleDeLaCible(p.cible) ?? 'parcelle';
    const o = parCle.get(cle);
    if (!o) continue;
    const effet = formeEcrite.has(cle) ? effetApresForme(p.effet) : p.effet;
    if (!effet) continue;
    const corpsAvant = o.batiment?.corpsToit, toitAvant = o.batiment?.toit;
    appliquerEffet(o, effet);
    if (effet.type === 'corpsToit') formeEcrite.add(cle);
    if (effet.type === 'couleurMurs' && o.batiment?.couleurMurs?.terrain) o.batiment.couleurMurs.terrain.date = jour;
    // Seul un toit vraiment ecrit se fige : un effet qui n'a rien trouve ou poser (un corps disparu) ne coupe pas les « Règles ».
    const toitEcrit = o.batiment?.corpsToit !== corpsAvant || o.batiment?.toit !== toitAvant;
    if (EFFETS_DU_TOIT.includes(effet.type) && toitEcrit && !o.batiment?.toitFige) batimentACopier(o).toitFige = true;
    touches.add(cle);
  }
  for (const cle of verifies) {
    const o = parCle.get(cle);
    if (!o) continue;
    batimentACopier(o).verifieSurPlace = { date: jour };
    touches.add(cle);
  }
  return [...touches];
}

/**
 * Le projet tel qu'il serait avec ces propositions, sans le toucher : ce que montrent « Après » et la
 * vue « Après » des deux vues de la Vue 3D. Les objets vises sont copies, les autres sont ceux du
 * projet ; rend aussi les cles des copies touchees.
 *
 * Une copie de surface suffit sur un batiment, son sous-objet `batiment` compris (chaque effet remplace le champ qu'il ecrit) ; la
 * cloture, modifiee en place par model/cloture.ts, est copiee en profondeur, elle seule : la parcelle
 * porte aussi son relief et son cadastre, qu'aucune proposition ne touche.
 */
export function projetApres(objets: readonly ObjetPlan[], propositions: readonly Proposition[], jour: string): { objets: ObjetPlan[]; touches: string[] } {
  const visees = new Set(propositions.map((p) => cleDeLaCible(p.cible) ?? 'parcelle'));
  const copies = new Map(objets.filter((o) => visees.has(o.key)).map((o) => {
    const copie = { ...o } as ObjetPlan;
    if (o.cloture) copie.cloture = JSON.parse(JSON.stringify(o.cloture)) as NonNullable<ObjetPlan['cloture']>;
    // Le sous-objet du batiment est copie lui aussi : un effet y remplace un champ, jamais dans l'objet d'origine.
    if (o.batiment) copie.batiment = { ...o.batiment };
    return [o.key, copie] as const;
  }));
  const liste = [...copies.values()];
  const touches = appliquerPropositions(liste, propositions, [], jour);
  // Les objets neufs (lot L3) s'ajoutent a la suite : ceux qu'`appliquerPropositions` a poses apres les copies.
  const neufs = liste.slice(copies.size).filter((o) => !objets.some((x) => x.key === o.key));
  return { objets: [...objets.map((o) => copies.get(o.key) ?? o), ...neufs], touches };
}

/** Le jour d'une date, AAAA-MM-JJ, dans le fuseau de l'appareil : c'est le jour de la visite. */
export function jourIso(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
