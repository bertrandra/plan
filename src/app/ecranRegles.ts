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
import { creerClientRegles } from '../io/reglesServeur.js';

/** L'adresse demande-t-elle l'ecran des regles ? */
export function demandeEcranRegles(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'regles';
}

const CLE_BROUILLON = 'plan.regles.brouillon';

/** Le brouillon dans le navigateur ; sans stockage (fenetre privee, acces refuse), l'edition reste a l'ecran. */
function brouillonLocal(): BrouillonRegles {
  const sur = <T,>(f: () => T, repli: T): T => { try { return f(); } catch { return repli; } };
  return {
    lire: () => sur(() => localStorage.getItem(CLE_BROUILLON), null),
    ecrire: (t) => sur(() => localStorage.setItem(CLE_BROUILLON, t), undefined),
    effacer: () => sur(() => localStorage.removeItem(CLE_BROUILLON), undefined),
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
    telecharger: (nom, contenu, type) => telechargerTexte(nom, contenu, type),
    copier: (texte) => navigator.clipboard.writeText(texte),
  }));
}
