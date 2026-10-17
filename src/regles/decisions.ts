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
import { accesDuCote, changerType, clotureDe, longueurDuCote, nouveauPortail, reglerCote, synchroniserAnciensChamps } from '../model/cloture.js';
import type { MateriauTexture } from '../model/couleurMur.js';
import type { PositionPortail, TypeCloture as TypeClotureVue } from '../model/auditParcelle.js';
import type { Cheminee, CorpsToit, CouvertureChoisie, Lucarne, ObjetPlan, ReleveFacade, TerrasseToit } from '../model/types.js';

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
  | { type: 'hauteur'; hauteurM: number }
  /** La hauteur totale (au faitage) d'un batiment sans corps : la hauteur de son toit au-dessus de l'egout en est deduite. */
  | { type: 'hauteurToit'; faitageM: number }
  | { type: 'couleurMurs'; couleur: string }
  | { type: 'materiauMurs'; materiau: MateriauTexture }
  | { type: 'couverture'; couverture: CouvertureChoisie }
  /** Les corps du toit relus sur la mesure sous la forme et les bouts que Claude a vus : ils remplacent ceux du batiment. */
  | { type: 'corpsToit'; corps: CorpsToit[] }
  /** Les souches vues, posees sur le corps `corps` ; celles d'une observation precedente sont retirees. */
  | { type: 'cheminees'; corps: number; cheminees: Cheminee[] }
  /** Les appentis des corps `corps`, ouverts (poteaux, sans mur exterieur) ou fermes (murs jusqu'au sol). */
  | { type: 'appentis'; corps: number[]; ouvert: boolean }
  /** Les lucarnes vues, posees sur le corps `corps` ; celles d'une observation precedente sont retirees (celles du LiDAR restent). */
  | { type: 'lucarnes'; corps: number; lucarnes: Lucarne[] }
  | { type: 'terrasse'; corps: number; terrasse: TerrasseToit }
  | { type: 'cloture'; cote: number; typeCloture: TypeClotureVue; hauteurM?: number; soubassement?: boolean }
  | { type: 'portail'; cote: number; nature: 'portail' | 'portillon' | 'aucun'; position?: PositionPortail; largeurM?: number };

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

const cm = (v: number) => Math.round(v * 100) / 100;

/** La hauteur d'un batiment, comme engine/hauteurs.ts::elevationOf (le modele ne lit pas le moteur). */
export function hauteurDe(o: ObjetPlan): number {
  return typeof o.elevation === 'number' ? o.elevation : elevationParDefaut(o.fonction ?? '');
}

/**
 * Un releve ramene a une autre hauteur d'egout : la largeur est celle du plan, c'est la hauteur
 * seule qui change, donc tout ce qui est vertical s'etire du meme facteur (zones/releve/analyse.ts,
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

/** La position d'un portail le long de son cote, vu de la rue (la convention de `Portail.x`). */
export function abscisseDuPortail(position: PositionPortail | undefined, longueur: number, largeur: number, x: number): number {
  const marge = Math.min(0.5, Math.max(0, (longueur - largeur) / 2));
  if (position === 'gauche') return cm(marge);
  if (position === 'droite') return cm(Math.max(0, longueur - largeur - marge));
  if (position === 'centre') return cm(Math.max(0, (longueur - largeur) / 2));
  return x;
}

/** Le muret pose sous une cloture quand on en a vu un : 50 cm d'enduit, comme on en voit le plus. */
const SOUBASSEMENT_VU = { hauteur: 0.5, parement: 'enduit' as const };

function appliquerCloture(p: ObjetPlan, e: Extract<EffetProposition, { type: 'cloture' }>): void {
  if (!('pts' in p) || !p.pts) return;
  const cl = clotureDe(p, true);
  const r = reglerCote(cl, e.cote);
  if (r.type !== e.typeCloture) changerType(r, e.typeCloture);
  if (e.hauteurM !== undefined && e.hauteurM > 0) r.hauteur = e.hauteurM;
  if (e.soubassement === false) r.soubassement = null;
  else if (e.soubassement === true && r.type !== 'mur') r.soubassement = r.soubassement ?? { ...SOUBASSEMENT_VU };
  r.limite = 'rue';
  cl.active = true;
  synchroniserAnciensChamps(p);
}

function appliquerPortail(p: ObjetPlan, e: Extract<EffetProposition, { type: 'portail' }>): void {
  if (!('pts' in p) || !p.pts) return;
  const cl = clotureDe(p, true);
  if (e.nature === 'aucun') {
    cl.portails = cl.portails.filter((a) => a.cote !== e.cote);
  } else {
    const longueur = longueurDuCote(p.pts, e.cote);
    const surLeCote = accesDuCote(cl, e.cote);
    let a = surLeCote.find((x) => x.nature === e.nature) ?? surLeCote[0];
    if (!a) { a = nouveauPortail(e.nature, e.cote, longueur); cl.portails.push(a); }
    if (a.nature !== e.nature) {
      // Un portail devenu portillon (ou l'inverse) prend l'ouverture de sa nature ; le reste est garde.
      const neuf = nouveauPortail(e.nature, e.cote, longueur);
      a.nature = e.nature; a.ouverture = neuf.ouverture; a.largeur = neuf.largeur; a.motorise = neuf.motorise;
    }
    if (e.largeurM !== undefined && e.largeurM > 0) a.largeur = e.largeurM;
    a.x = abscisseDuPortail(e.position, longueur, a.largeur, a.x);
  }
  cl.active = true;
  synchroniserAnciensChamps(p);
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
      const r = releveALaHauteur(e.releve, hauteurDe(o));
      o.facades = [...(o.facades ?? []).filter((x) => x.cote !== r.cote), r].sort((a, b) => a.cote - b.cote);
      return;
    }
    case 'hauteur': o.elevation = cm(e.hauteurM); return;
    case 'hauteurToit': if (o.toit) o.toit = { ...o.toit, hauteur: Math.max(0.1, cm(e.faitageM - hauteurDe(o))) }; return;
    case 'couleurMurs': {
      // Valider la couleur vue sur place, c'est la choisir : un choix de source anterieur tombe.
      const suite = { ...(o.couleurMurs ?? {}), terrain: { couleur: e.couleur, date: '' } };
      delete suite.source;
      o.couleurMurs = suite;
      return;
    }
    case 'materiauMurs': {
      const suite = { ...(o.couleurMurs ?? {}), materiau: e.materiau };
      if (suite.source === 'plan') delete suite.source;
      o.couleurMurs = suite;
      return;
    }
    case 'corpsToit': o.corpsToit = JSON.parse(JSON.stringify(e.corps)) as CorpsToit[]; return;
    case 'couverture': if (o.toit) o.toit = { ...o.toit, couverture: e.couverture }; return;
    case 'cheminees': {
      const corps = o.corpsToit;
      if (!corps || !corps[e.corps]) return;
      o.corpsToit = corps.map((c, i) => {
        const gardees = (c.cheminees ?? []).filter((ch) => ch.source !== 'observation');
        const suite = i === e.corps ? [...gardees, ...e.cheminees.map((ch) => ({ ...ch }))] : gardees;
        const copie = { ...c };
        if (suite.length) copie.cheminees = suite; else delete copie.cheminees;
        return copie;
      });
      return;
    }
    case 'appentis': {
      const corps = o.corpsToit;
      if (!corps) return;
      o.corpsToit = corps.map((c, i) => (e.corps.includes(i) ? { ...c, ouvert: e.ouvert } : c));
      return;
    }
    case 'lucarnes': {
      const corps = o.corpsToit;
      if (!corps || !corps[e.corps]) return;
      o.corpsToit = corps.map((c, i) => {
        const gardees = (c.lucarnes ?? []).filter((l) => l.source !== 'observation');
        const suite = i === e.corps ? [...gardees, ...e.lucarnes.map((l) => ({ ...l }))] : gardees;
        const copie = { ...c };
        if (suite.length) copie.lucarnes = suite; else delete copie.lucarnes;
        return copie;
      });
      return;
    }
    case 'terrasse': {
      const corps = o.corpsToit;
      if (!corps || !corps[e.corps]) return;
      o.corpsToit = corps.map((c, i) => (i === e.corps ? { ...c, terrasse: JSON.parse(JSON.stringify(e.terrasse)) as TerrasseToit } : c));
      return;
    }
    case 'cloture': appliquerCloture(o, e); return;
    case 'portail': appliquerPortail(o, e); return;
  }
}

/** L'ordre d'ecriture : la hauteur d'abord, pour que les releves y soient ramenes. */
const RANG_EFFET: Record<TypeEffet, number> = { hauteur: 0, hauteurToit: 1, releve: 1, couleurMurs: 2, materiauMurs: 2, couverture: 2, corpsToit: 2, cheminees: 3, lucarnes: 3, appentis: 3, terrasse: 3, cloture: 4, portail: 4 };

/**
 * Ecrit les propositions sur ces objets (les memes, modifies en place), et marque « vérifié sur
 * place » les batiments de `verifies`, a la date `jour` (AAAA-MM-JJ). Rend les cles des objets
 * touches : l'apercu 3D ne repose qu'eux.
 */
export function appliquerPropositions(objets: ObjetPlan[], propositions: readonly Proposition[], verifies: readonly string[], jour: string): string[] {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  const touches = new Set<string>();
  const ordre = [...propositions].sort((a, b) => RANG_EFFET[a.effet.type] - RANG_EFFET[b.effet.type]);
  for (const p of ordre) {
    const cle = cleDeLaCible(p.cible) ?? 'parcelle';
    const o = parCle.get(cle);
    if (!o) continue;
    appliquerEffet(o, p.effet);
    if (p.effet.type === 'couleurMurs' && o.couleurMurs?.terrain) o.couleurMurs.terrain.date = jour;
    touches.add(cle);
  }
  for (const cle of verifies) {
    const o = parCle.get(cle);
    if (!o) continue;
    o.verifieSurPlace = { date: jour };
    touches.add(cle);
  }
  return [...touches];
}

/**
 * Le projet tel qu'il serait avec ces propositions, sans le toucher : ce que montrent « Après » et la
 * vue « Après » des deux vues de la Vue 3D. Les objets vises sont copies, les autres sont ceux du
 * projet ; rend aussi les cles des copies touchees.
 *
 * Une copie de surface suffit sur un batiment (chaque effet remplace le champ qu'il ecrit) ; la
 * cloture, modifiee en place par model/cloture.ts, est copiee en profondeur, elle seule : la parcelle
 * porte aussi son relief et son cadastre, qu'aucune proposition ne touche.
 */
export function projetApres(objets: readonly ObjetPlan[], propositions: readonly Proposition[], jour: string): { objets: ObjetPlan[]; touches: string[] } {
  const visees = new Set(propositions.map((p) => cleDeLaCible(p.cible) ?? 'parcelle'));
  const copies = new Map(objets.filter((o) => visees.has(o.key)).map((o) => {
    const copie = { ...o } as ObjetPlan;
    if (o.cloture) copie.cloture = JSON.parse(JSON.stringify(o.cloture)) as NonNullable<ObjetPlan['cloture']>;
    return [o.key, copie] as const;
  }));
  const touches = appliquerPropositions([...copies.values()], propositions, [], jour);
  return { objets: objets.map((o) => copies.get(o.key) ?? o), touches };
}

/** Le jour d'une date, AAAA-MM-JJ, dans le fuseau de l'appareil : c'est le jour de la visite. */
export function jourIso(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
