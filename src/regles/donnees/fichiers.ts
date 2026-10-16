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
import { empreinteReglagesToits, lireReglagesToits } from '../toits/reglages.js';
import { formeEmpreinteProfils, lireProfilsToits } from '../toits/profils.js';
import { empreinteFaitsToits, lireFaitsToits } from '../toits/faits.js';
import { empreinteReglagesFacades, lireReglagesFacades } from '../facades/reglages.js';
import { empreinteSilhouettesToits, lireSilhouettesToits } from '../toits/silhouettes.js';

export type IdDonnees = 'reglagesToits' | 'reglagesFacades' | 'faitsToits' | 'silhouettesToits';

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
    consequence: { ou: 'LECTURES_TOITS (src/app/toitsLidar.ts), clé « reglages »', effet: 'les toits déjà lus sur le LiDAR sont relus à la prochaine ouverture' },
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
    consequence: { ou: 'LECTURES_TOITS (src/app/toitsLidar.ts), clé « faits »', effet: 'les toits déjà lus sur le LiDAR sont relus à la prochaine ouverture' },
  },
  {
    id: 'silhouettesToits', libelle: 'Silhouettes des façades', chemin: 'regles/toits/silhouettes.json', livre: silhouettesToitsBrut, seuils: true,
    refus: (j) => essayer(() => lireSilhouettesToits(j)),
    empreinte: (j) => { try { return empreinteSilhouettesToits(lireSilhouettesToits(j)); } catch { return null; } },
    consequence: { ou: 'aucune ligne de version : ce fichier ne change aucune toiture déjà lue', effet: 'les prochaines propositions de forme du toit, à l’audit d’une parcelle, lisent les silhouettes des façades avec ces règles' },
  },
];
