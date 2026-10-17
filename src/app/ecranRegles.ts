// Monte l'ecran Admin › Regles (`?admin&ecran=regles`, zones/EcranRegles.tsx ; MD/architecture.md §5.2.4).
//
// Un ecran de l'admin, comme la conformite : main.ts ne l'ouvre qu'une fois la porte de l'admin franchie, et
// Plan ne demarre pas dessous. Les sujets sont ceux du depot (compiles dans le fichier livre), et ce qu'on y
// edite reste un brouillon de ce navigateur, que l'on telecharge pour le poser dans le depot
// (`npm run regles:generer`) ; on peut aussi l'enregistrer sur le serveur (admin/claude/regles) pour qu'une
// analyse ou un rejeu d'essai parte avec son prompt, sans jamais remplacer le prompt livre.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranRegles, type BrouillonRegles } from '../zones/EcranRegles.js';
import { DESCRIPTIONS_SUJETS } from '../regles/sujets/liste.js';
import { ACCORDS_MESURES } from '../model/analyseClaude.js';
import { SUJETS } from './regles/sujets/index.js';
import { telechargerTexte } from '../shell/download.js';
import { LECTURES_TOITS } from './toitsLidar.js';
import { LECTURES_FACADES } from '../regles/facades/reglages.js';
import { creerClientRegles } from '../io/reglesServeur.js';
import { RECONCILIATION } from '../regles/reconciliation.js';
import { FICHIERS_DONNEES } from '../regles/donnees/fichiers.js';
import { seuilsDuTexte } from '../regles/donnees/edition.js';

/** L'adresse demande-t-elle l'ecran des regles ? */
export function demandeEcranRegles(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'regles';
}

const CLE_BROUILLON = 'plan.regles.brouillon';
const CLE_BROUILLON_DONNEES = 'plan.regles.donnees';

/** Le brouillon dans le navigateur ; sans stockage (fenetre privee, acces refuse), l'edition reste a l'ecran. */
function brouillonLocal(cle: string = CLE_BROUILLON): BrouillonRegles {
  const sur = <T,>(f: () => T, repli: T): T => { try { return f(); } catch { return repli; } };
  return {
    lire: () => sur(() => localStorage.getItem(cle), null),
    ecrire: (t) => sur(() => localStorage.setItem(cle, t), undefined),
    effacer: () => sur(() => localStorage.removeItem(cle), undefined),
  };
}

export function ouvrirEcranRegles(): void {
  let hote = document.getElementById('zoneEcranRegles');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranRegles';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — règles';
  createRoot(hote).render(createElement(EcranRegles, {
    sujets: DESCRIPTIONS_SUJETS,
    proposeurs: SUJETS.filter((s) => s.proposer).map((s) => ({ id: s.id, ...(s.attribut ? { attribut: s.attribut } : {}), ...(s.effet ? { effet: s.effet } : {}) })),
    accords: ACCORDS_MESURES,
    brouillon: brouillonLocal(),
    serveur: creerClientRegles((entree, init) => fetch(entree, init)),
    donnees: {
      versions: { toits: Math.max(...LECTURES_TOITS.map((l) => l.version)), facades: Math.max(...LECTURES_FACADES.map((l) => l.version)) },
      brouillon: brouillonLocal(CLE_BROUILLON_DONNEES),
    },
    sources: { regles: RECONCILIATION, seuilsLidar: seuilsDuTexte(FICHIERS_DONNEES.find((f) => f.id === 'reglagesToits')?.livre ?? ''), seuilsFormes: seuilsDuTexte(FICHIERS_DONNEES.find((f) => f.id === 'formesToits')?.livre ?? '') },
    telecharger: (nom, contenu, type) => telechargerTexte(nom, contenu, type),
    copier: (texte) => navigator.clipboard.writeText(texte),
  }));
}
