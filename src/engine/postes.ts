// Les postes du chiffrage d'une terrasse, ranges pour un document a remettre (engine/).
//
// La Nomenclature (zones/resultats/Nomenclature.tsx) montre les lignes du BOM (engine/bom.ts) telles
// que le moteur les ecrit. Le devis et la liste d'achat en ont besoin autrement : par rayon (on
// n'achete pas le concasse au meme endroit que les lames), et avec ce qu'une ligne vaut vraiment —
// un prix saisi par la personne, ou une fourchette du marche. Ce module ne calcule aucune quantite :
// il relit les lignes du BOM, dit d'ou vient leur prix, et fait les totaux que le document imprime.
//
// D'ou vient le prix d'une ligne. Une ligne saisie a la main (`prixReel`) l'est. Une ligne chiffree
// par son debit (`calcule` : lames, bois porteur, vis ou plots) porte toujours un `prixReel`, meme sans
// rien saisir : celui des prix par defaut, au milieu de la fourchette. Il n'est donc retenu que si
// chacun de ses prix l'est (chaque longueur de barre achetee, le prix du modele de plot, celui de la
// vis) ; sinon la ligne reste une estimation, et le document le dit.

import { computeBOM } from './bom.js';
import { computeTerrasseLayers, type CouchesTerrasse } from './layers.js';
import { computeDebitLames, computeDebitsBois } from './debit.js';
import { ensureConstruction } from './construction.js';
import { estPlots, plotModele } from './constantes.js';
import { prixBarre, prixPersonnalise, type ProduitBarre } from './prix.js';
import { appuisEnHauteur } from './hauteurs.js';
import { solDuProjet } from './sol.js';
import { surfaceNetteTerrasse } from './ouvrages/terrasse.js';
import { valeurEnregistree } from '../model/dictionnaire.js';
import { estTerrasse } from '../model/fonctions.js';
import type { Debit } from './bois/debit.js';
import type { Construction, LigneBom, ObjetPlan, ObjetPolygone } from '../model/types.js';

/** Un rayon : la ou une ligne s'achete, et l'ordre dans lequel le chantier s'en sert. */
export interface Rayon { id: string; libelle: string }

export const RAYONS: readonly Rayon[] = [
  { id: 'terrassement', libelle: 'Terrassement et assise' },
  { id: 'appuis', libelle: 'Plots et appuis' },
  { id: 'structure', libelle: 'Structure' },
  { id: 'lames', libelle: 'Bois et lames' },
  { id: 'visserie', libelle: 'Visserie et fixations' },
  { id: 'finitions', libelle: 'Finitions' },
  { id: 'divers', libelle: 'Divers' }
];

/** Le rayon de chaque poste du BOM ; un poste que le moteur ajouterait demain va en « Divers » tant qu'il n'est pas range. */
const RAYON_DU_POSTE: Record<string, string> = {
  decaissementPose: 'terrassement', geotextile: 'terrassement', concasse: 'terrassement', dallesStab: 'terrassement',
  massifs: 'terrassement', betonDalle: 'terrassement', treillis: 'terrassement', coffrage: 'terrassement',
  vis: 'appuis',
  bois: 'structure', lambourde: 'structure',
  lames: 'lames',
  visserie: 'visserie',
  lameRive: 'finitions'
};

export const rayonDuPoste = (poste: string): string => RAYON_DU_POSTE[poste] ?? 'divers';
export const libelleRayon = (id: string): string => RAYONS.find((r) => r.id === id)?.libelle ?? id;

/** Une fourchette, en euros : `bas === haut` quand tout ce qu'elle somme est un prix saisi. */
export interface Fourchette { bas: number; haut: number }

/** Le prix d'une ligne : saisi (un total, et le prix unitaire qui en suit), ou estime (une fourchette par unite et au total). */
export type PrixPoste =
  | { saisi: true; total: number; unitaire: number }
  | { saisi: false; unitaire: Fourchette; total: Fourchette };

/** Une ligne du BOM, rangee dans son rayon, avec ce que vaut son prix. */
/** Les barres d'une longueur du commerce, achetees pour une ligne debitee (le debit de la Nomenclature). */
export interface BarresAchetees { longueur: number; nombre: number; prixBarre: number; saisi: boolean }

export interface Poste {
  poste: string;
  rayon: string;
  libelle: string;
  qte: number;
  unite: string;
  prix: PrixPoste;
  /** La ligne du BOM telle que la Nomenclature l'affiche : prix bas et haut par unite, prix reel du total (saisi ou calcule). */
  bom: { prixBas: number; prixHaut: number; prixReel: number | null };
  /** La section achetee, quand la ligne en a une (bois : `63x175` ; lames : epaisseur x largeur, en mm). */
  section?: string;
  /** Les barres par longueur du commerce, de la plus longue a la plus courte, pour une ligne debitee (lames, bois porteur). */
  barres?: BarresAchetees[];
}

export interface ChiffrageTerrasse {
  cle: string;
  nom: string;
  /** La surface nette (ouvertures retirees), en m², comme le dossier PDF. */
  surface: number;
  /** Les lignes du BOM, dans l'ordre des rayons puis dans celui du BOM. */
  postes: Poste[];
  total: Fourchette;
}

export interface ChiffrageProjet {
  terrasses: ChiffrageTerrasse[];
  total: Fourchette;
  /** Toutes les lignes ont un prix saisi : le total est un nombre, pas une fourchette. */
  toutSaisi: boolean;
}

/** Chaque longueur reellement achetee de ce debit a-t-elle son prix saisi ? */
function barresSaisies(c: Construction, d: Debit, cle: ProduitBarre): boolean {
  const longueurs = Object.entries(d.achats).filter(([, n]) => n > 0).map(([L]) => parseFloat(L));
  return longueurs.length > 0 && longueurs.every((L) => prixPersonnalise(c, cle, L));
}

const prixSaisiEn = (v: number | null | undefined) => v !== undefined && v !== null && isFinite(v) && v >= 0;

/**
 * Le prix d'une ligne chiffree par le moteur (`calcule`) a-t-il ete saisi, entierement ? Les memes
 * carnets que la Nomenclature lit pour dire « tous estimes » ou « n sur m saisis ».
 */
function calculSaisi(obj: ObjetPlan, objets: ObjetPlan[], couches: CouchesTerrasse, ligne: LigneBom): boolean {
  const c = ensureConstruction(obj);
  if (ligne.poste === 'lames') return barresSaisies(c, computeDebitLames(obj, couches), 'lames');
  const groupe = computeDebitsBois(obj, couches).find((g) => g.cle === ligne.poste);
  if (groupe) return barresSaisies(c, groupe.debit, groupe.cle);
  if (ligne.poste === 'vis') {
    if (!estPlots(c)) return prixSaisiEn(c.prixVisUnite);
    // Sur un sol en pente, les plots s'achetent par gamme (engine/bom.ts) : chaque modele employe doit avoir son prix.
    const enPente = appuisEnHauteur(obj, couches.vis, solDuProjet(objets));
    const impose = c.plotModele && c.plotModele !== 'auto';
    const modeles = enPente && !impose ? [...new Set(enPente.appuis.map((a) => plotModele({ hauteurPlot: a.hauteurMm / 10 }).cle))] : [plotModele(c).cle];
    return modeles.every((m) => prixSaisiEn(valeurEnregistree(c.prixPlots, m)));
  }
  return false;
}

/** Ce qu'une ligne du BOM vaut, rangee pour un document ; `null` quand elle n'a rien a acheter (quantite nulle, aucun prix). */
export function posteDeLigne(ligne: LigneBom, saisi: boolean): Poste | null {
  if (!(ligne.qte > 0)) return null;
  const bas = ligne.prixBas || 0, haut = ligne.prixHaut || 0;
  const reel = ligne.prixReel;
  const prix: PrixPoste = saisi && reel !== null && reel !== undefined
    ? { saisi: true, total: reel, unitaire: reel / ligne.qte }
    : { saisi: false, unitaire: { bas, haut }, total: { bas: bas * ligne.qte, haut: haut * ligne.qte } };
  // Une lame de rive decochee garde sa longueur et un prix nul : rien ne s'achete.
  if (!prix.saisi && bas === 0 && haut === 0) return null;
  const bom = { prixBas: ligne.prixBas, prixHaut: ligne.prixHaut, prixReel: reel ?? null };
  return { poste: ligne.poste, rayon: rayonDuPoste(ligne.poste), libelle: ligne.label, qte: ligne.qte, unite: ligne.unite, prix, bom };
}

/** Les barres d'un debit, longueur par longueur, a leur prix (saisi ou par defaut, comme la table de debit de la Nomenclature). */
function barresDuDebit(c: Construction, d: Debit, cle: ProduitBarre): BarresAchetees[] {
  return Object.entries(d.achats).filter(([, n]) => n > 0).map(([L, n]) => ({ longueur: parseFloat(L), nombre: n }))
    .sort((a, b) => b.longueur - a.longueur)
    .map(({ longueur, nombre }) => ({ longueur, nombre, prixBarre: prixBarre(c, cle, longueur), saisi: prixPersonnalise(c, cle, longueur) }));
}

/** Ce qu'une ligne debitee achete : sa section et ses barres ; rien pour une autre ligne. */
function achatsDebites(obj: ObjetPlan, couches: CouchesTerrasse, poste: string): Pick<Poste, 'section' | 'barres'> {
  const c = ensureConstruction(obj);
  if (poste === 'lames') return { section: (c.epaisseurLame || 25) + 'x' + (c.largeurLame || 140), barres: barresDuDebit(c, computeDebitLames(obj, couches), 'lames') };
  const groupe = computeDebitsBois(obj, couches).find((g) => g.cle === poste);
  return groupe ? { section: groupe.section, barres: barresDuDebit(c, groupe.debit, groupe.cle) } : {};
}

/** La somme de postes : un prix saisi compte aux deux bornes. */
export function totalDesPostes(postes: readonly Poste[]): Fourchette {
  let bas = 0, haut = 0;
  for (const p of postes) {
    if (p.prix.saisi) { bas += p.prix.total; haut += p.prix.total; }
    else { bas += p.prix.total.bas; haut += p.prix.total.haut; }
  }
  return { bas, haut };
}

const ordreRayon = (id: string) => { const i = RAYONS.findIndex((r) => r.id === id); return i < 0 ? RAYONS.length : i; };

/** Le chiffrage d'une terrasse : les lignes du BOM que la Nomenclature montre (meme appel, memes prix saisis), rangees par rayon. */
export function chiffrerTerrasse(obj: ObjetPolygone, objets: ObjetPlan[]): ChiffrageTerrasse {
  const couches = computeTerrasseLayers(obj, objets);
  const lignes = computeBOM(obj, couches, solDuProjet(objets));
  const postes = lignes
    .map((l, i) => ({ i, p: posteDeLigne(l, l.calcule ? calculSaisi(obj, objets, couches, l) : l.prixReel !== null && l.prixReel !== undefined) }))
    .filter((x): x is { i: number; p: Poste } => x.p !== null)
    .sort((a, b) => ordreRayon(a.p.rayon) - ordreRayon(b.p.rayon) || a.i - b.i)
    .map((x) => ({ ...x.p, ...achatsDebites(obj, couches, x.p.poste) }));
  return { cle: obj.key, nom: obj.name, surface: surfaceNetteTerrasse(obj.pts, objets), postes, total: totalDesPostes(postes) };
}

/** Le chiffrage des terrasses retenues (`cles`, dans l'ordre du plan), et leur total. */
export function chiffrerProjet(objets: ObjetPlan[], cles: readonly string[]): ChiffrageProjet {
  const terrasses = objets.filter((o): o is ObjetPolygone => o.type === 'polygon' && estTerrasse(o) && cles.includes(o.key)).map((t) => chiffrerTerrasse(t, objets));
  const total = terrasses.reduce((s, t) => ({ bas: s.bas + t.total.bas, haut: s.haut + t.total.haut }), { bas: 0, haut: 0 });
  return { terrasses, total, toutSaisi: terrasses.every((t) => t.postes.every((p) => p.prix.saisi)) };
}

/** La TVA d'un total et le total TTC, a ce taux (en %). Le taux vient de la personne : le moteur n'en suppose aucun. */
export function avecTva(total: Fourchette, tauxPct: number): { tva: Fourchette; ttc: Fourchette } {
  const tva = { bas: total.bas * tauxPct / 100, haut: total.haut * tauxPct / 100 };
  return { tva, ttc: { bas: total.bas + tva.bas, haut: total.haut + tva.haut } };
}
