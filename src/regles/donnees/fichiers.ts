// Les fichiers de donnees du moteur de regles, tels que Admin › Regles les edite : les reglages des
// toits, les reglages des facades, les faits des toits (MD/architecture.md §5.2.4). Chacun garde son texte
// livre (pour que l'edition et le diff ne reformatent rien), son lecteur (le meme qui le refuse au
// chargement du code), l'empreinte qui entre dans une version de lecture, et ce qu'un changement declenche.
//
// Le texte brut vient de l'import `?raw` : meme octets que ceux du depot, donc un seuil change ne laisse
// dans le diff que sa ligne.

import reglagesToitsBrut from '../../../regles/toits/reglages.json?raw';
import reglagesFacadesBrut from '../../../regles/facades/reglages.json?raw';
import faitsToitsBrut from '../../../regles/toits/faits.json?raw';
import silhouettesToitsBrut from '../../../regles/toits/silhouettes.json?raw';
import formesToitsBrut from '../../../regles/toits/formes.json?raw';
import reconciliationBrut from '../../../regles/reconciliation.json?raw';
import iaFacadesBrut from '../../../regles/facades/ia.json?raw';
import jardinBrut from '../../../regles/jardin/reglages.json?raw';
import { empreinteReglagesToits, lireReglagesToits } from '../toits/reglages.js';
import { formeEmpreinteProfils, lireProfilsToits } from '../toits/profils.js';
import { empreinteFaitsToits, lireFaitsToits } from '../toits/faits.js';
import { empreinteReglagesFacades, lireReglagesFacades } from '../facades/reglages.js';
import { empreinteSilhouettesToits, lireSilhouettesToits } from '../toits/silhouettes.js';
import { empreinteFormesToits, lireFormesToits } from '../toits/formes.js';
import { empreinteReconciliation, lireReconciliation } from '../reconciliation.js';
import { empreinteReglagesIa, lireReglagesIa } from '../facades/ia.js';
import { empreinteReglagesJardin, lireReglagesJardin } from '../jardin/reglages.js';

export type IdDonnees = 'reglagesToits' | 'reglagesFacades' | 'faitsToits' | 'silhouettesToits' | 'formesToits' | 'reconciliation' | 'iaFacades' | 'jardin';

export interface FichierDonnees {
  id: IdDonnees;
  libelle: string;
  /** Son chemin dans le depot. */
  chemin: string;
  /** Le texte livre, tel que le depot le porte. */
  livre: string;
  /** Les seuils (nom, valeur, unite, raison) s'editent champ par champ ; les faits s'editent en texte. */
  seuils: boolean;
  /** Ce que le fichier refuse du JSON donne : le message du lecteur du code, ou null s'il l'accepte. */
  refus(json: unknown): string | null;
  /** L'empreinte de ce qui change un calcul ; null si le fichier est refuse. */
  empreinte(json: unknown): string | null;
  /** Ce qu'un changement de l'empreinte demande dans le code, et ce qu'il declenche pour les utilisateurs. */
  consequence: { ou: string; effet: string };
}

/** Le lecteur d'un fichier, ramene a « le message du refus, ou null ». */
function essayer(lire: () => unknown): string | null {
  try { lire(); return null; } catch (e) { return (e as Error).message; }
}

export const FICHIERS_DONNEES: readonly FichierDonnees[] = [
  {
    id: 'reglagesToits', libelle: 'Réglages des toits', chemin: 'regles/toits/reglages.json', livre: reglagesToitsBrut, seuils: true,
    refus: (j) => essayer(() => lireProfilsToits((j as { profils?: unknown })?.profils ?? [], Object.keys(lireReglagesToits(j)))),
    empreinte: (j) => {
      try { const v = lireReglagesToits(j); return empreinteReglagesToits(v, formeEmpreinteProfils(lireProfilsToits((j as { profils?: unknown }).profils ?? [], Object.keys(v)))); } catch { return null; }
    },
    consequence: { ou: 'LECTURES_TOITS (src/app/toits/toitsLidar.ts), clé « reglages »', effet: 'les toits déjà lus sur le LiDAR sont relus à la prochaine ouverture' },
  },
  {
    id: 'reglagesFacades', libelle: 'Réglages des façades', chemin: 'regles/facades/reglages.json', livre: reglagesFacadesBrut, seuils: true,
    refus: (j) => essayer(() => lireReglagesFacades(j)),
    empreinte: (j) => { try { const r = lireReglagesFacades(j); return empreinteReglagesFacades(r.seuils, r.profils); } catch { return null; } },
    consequence: { ou: 'LECTURES_FACADES (src/regles/facades/reglages.ts)', effet: 'le profil de façades des bâtiments est rechoisi en tâche de fond' },
  },
  {
    id: 'faitsToits', libelle: 'Faits des toits', chemin: 'regles/toits/faits.json', livre: faitsToitsBrut, seuils: false,
    refus: (j) => essayer(() => lireFaitsToits(j)),
    empreinte: (j) => { try { return empreinteFaitsToits(lireFaitsToits(j)); } catch { return null; } },
    consequence: { ou: 'LECTURES_TOITS (src/app/toits/toitsLidar.ts), clé « faits »', effet: 'les toits déjà lus sur le LiDAR sont relus à la prochaine ouverture' },
  },
  {
    id: 'silhouettesToits', libelle: 'Silhouettes des façades', chemin: 'regles/toits/silhouettes.json', livre: silhouettesToitsBrut, seuils: true,
    refus: (j) => essayer(() => lireSilhouettesToits(j)),
    empreinte: (j) => { try { return empreinteSilhouettesToits(lireSilhouettesToits(j)); } catch { return null; } },
    consequence: { ou: 'aucune ligne de version : ce fichier ne change aucune toiture déjà lue', effet: 'les prochaines propositions de forme du toit, à l’audit d’une parcelle, lisent les silhouettes des façades avec ces règles' },
  },
  {
    id: 'formesToits', libelle: 'Formes du catalogue (lecture LiDAR)', chemin: 'regles/toits/formes.json', livre: formesToitsBrut, seuils: true,
    refus: (j) => essayer(() => lireFormesToits(j)),
    empreinte: (j) => { try { return empreinteFormesToits(lireFormesToits(j).seuils); } catch { return null; } },
    consequence: { ou: 'LECTURES_TOITS (src/app/toits/toitsLidar.ts), clé « formes »', effet: 'les toits déjà lus sur le LiDAR sont relus à la prochaine ouverture : la lecture y reconnaît le papillon, le coyau, le berceau, le gambrel, le Mansart, la demi-croupe et les toits de révolution avec ces seuils' },
  },
  {
    id: 'reconciliation', libelle: 'Réconciliation des sources', chemin: 'regles/reconciliation.json', livre: reconciliationBrut, seuils: true,
    refus: (j) => essayer(() => lireReconciliation(j)),
    empreinte: (j) => { try { return empreinteReconciliation(lireReconciliation(j)); } catch { return null; } },
    consequence: { ou: 'aucune ligne de version : ce fichier ne change aucune toiture déjà lue', effet: 'les prochaines propositions de l’audit arbitrent les sources avec ces poids et ces seuils' },
  },
  {
    id: 'iaFacades', libelle: 'Règles du run d’une façade (Claude)', chemin: 'regles/facades/ia.json', livre: iaFacadesBrut, seuils: true,
    refus: (j) => essayer(() => lireReglagesIa(j)),
    empreinte: (j) => { try { return empreinteReglagesIa(lireReglagesIa(j)); } catch { return null; } },
    consequence: { ou: 'aucune ligne de version : l’empreinte est inscrite dans chaque rejeu en mode « IA » de la calibration', effet: 'les observations de Claude sur une façade (angles, colombage, pointes, boîtes) se décident avec ces seuils : la pose candidate, les poses écartées par le colombage, les boîtes cochées ou décochées, les alertes de hauteur' },
  },
  {
    id: 'jardin', libelle: 'Règles de la lecture du jardin (Claude)', chemin: 'regles/jardin/reglages.json', livre: jardinBrut, seuils: true,
    refus: (j) => essayer(() => lireReglagesJardin(j)),
    empreinte: (j) => { try { return empreinteReglagesJardin(lireReglagesJardin(j)); } catch { return null; } },
    consequence: { ou: 'aucune ligne de version : l’empreinte est gardée avec chaque lecture du jardin enregistrée', effet: 'les objets lus sur la photo aérienne se décident avec ces seuils : ce qui est assez sûr, ce qui est déjà dans le plan, ce qui va sur la clôture' },
  },
];
