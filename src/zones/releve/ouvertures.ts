// L'editeur d'une facade relevee (zones/Releve.tsx, lot F6) : les ouvertures en cours de correction (lot L15,
// MD/spec-facades-calage-detection.md §10 a §12). Deux listes :
// - les ouvertures retenues, que le doigt corrige ;
// - les baies devinees que la personne rend au pointille : decochees, elles ne s'ecrivent pas ; une touche les garde de nouveau.
// Les corrections se tracent a la validation, contre les ouvertures du releve (app/releve/releve.ts::releveEdite).

import { useState } from 'react';
import type { DetailsOuverture, OuvertureFacade } from '../../model/types.js';

/** D'ou vient l'ouverture, en clair : ce que le doigt doit en penser. */
export function texteOrigine(o: Pick<OuvertureFacade, 'source' | 'confiance'>): string {
  const c = o.confiance !== undefined ? ` (confiance ${Math.round(o.confiance * 100)} %)` : '';
  switch (o.source) {
    case 'devinee':
      return `Devinée par la grille de la façade${c} : vérifiez-la sur la photo.`;
    case 'corrigee':
      return 'Corrigée par vous.';
    case 'ajoutee':
      return 'Ajoutée par vous.';
    case 'claude':
      return `Proposée par Claude${c}.`;
    case 'detectee':
      return `Détectée sur la photo${c}.`;
    default:
      return 'Posée à la main.';
  }
}

/** Les details reconnus (volets, coffre, balcon, forme), en clair ; `null` s'il n'y en a pas. */
export function texteDetails(d: DetailsOuverture | undefined): string | null {
  if (!d) return null;
  const morceaux: string[] = [];
  if (d.volets === 'battants') morceaux.push('volets battants');
  if (d.volets === 'roulant') morceaux.push(d.ferme ? 'volet roulant baissé' : 'volet roulant (coffre retiré de la hauteur)');
  if (d.volets === 'persiennes') morceaux.push(d.ferme ? 'persiennes fermées' : 'persiennes');
  if (d.allege === 'balcon') morceaux.push('balcon');
  if (d.allege === 'garde-corps') morceaux.push('garde-corps');
  if (d.forme === 'cintre') morceaux.push('haut cintré');
  if (d.forme === 'rond') morceaux.push('œil-de-bœuf');
  if (!morceaux.length) return null;
  const t = morceaux.join(', ');
  return t.charAt(0).toUpperCase() + t.slice(1) + '.';
}

/** Les ouvertures de l'editeur, parties de celles du releve. */
export function useOuvertures(initiales: readonly OuvertureFacade[]) {
  const [ouvertures, setOuvertures] = useState<OuvertureFacade[]>(() => [...initiales]);
  const [devinees, setDevinees] = useState<OuvertureFacade[]>([]);
  const [choisie, setChoisie] = useState<number | null>(null);
  return {
    ouvertures,
    setOuvertures,
    devinees,
    choisie,
    setChoisie,
    /** Garde la devinee `i` (elle passe en ouverture retenue, choisie). */
    garder(i: number) {
      const d = devinees[i];
      if (!d) return;
      setDevinees(devinees.filter((_, k) => k !== i));
      setOuvertures([...ouvertures, d]);
      setChoisie(ouvertures.length);
    },
    /** Rend la retenue `i`, une devinee, au pointille. */
    ecarter(i: number) {
      const o = ouvertures[i];
      if (!o) return;
      setOuvertures(ouvertures.filter((_, k) => k !== i));
      setDevinees([...devinees, o]);
      setChoisie(null);
    },
  };
}
