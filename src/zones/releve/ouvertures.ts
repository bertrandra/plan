// Le releve de facade (zones/Releve.tsx), etape 5 : les ouvertures en cours de verification (lot L15,
// MD/spec-facades-calage-detection.md §10 a §12). Trois listes :
// - les ouvertures retenues, que le doigt corrige ;
// - les baies devinees de faible confiance, laissees en pointille et decochees : une touche les garde ;
// - la proposition de l'analyse, figee, a laquelle les retenues sont comparees a la validation pour
//   tracer les corrections.

import { useState } from 'react';
import { tracerCorrections, versOuvertureFacade } from '../../facade/detection/verification.js';
import type { OuvertureDetectee } from '../../facade/detection/detection.js';
import type { ResultatRenfort } from '../../facade/detection/renfortRecalage.js';
import { propositionRenforcee, type Proposition } from './aide.js';
export type { Proposition } from './aide.js';
import type { CorrectionOuverture, DetailsOuverture, OuvertureFacade } from '../../model/types.js';


const cm = (v: number) => Math.round(v * 100) / 100;

/** Les ouvertures etirees en hauteur d'un facteur `k` (hauteur du mur corrigee). */
export function etirerOuvertures(os: readonly OuvertureFacade[], k: number): OuvertureFacade[] {
  return os.map((o) => ({ ...o, y: cm(o.y * k), h: cm(o.h * k) }));
}

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

/** Les ouvertures de l'etape Verifier, et ce qu'on en fait. */
export function useOuvertures() {
  const [ouvertures, setOuvertures] = useState<OuvertureFacade[]>([]);
  const [devinees, setDevinees] = useState<OuvertureFacade[]>([]);
  const [proposition, setProposition] = useState<Proposition>({ cochees: [], decochees: [] });
  const [choisie, setChoisie] = useState<number | null>(null);
  return {
    ouvertures,
    setOuvertures,
    devinees,
    choisie,
    setChoisie,
    /** Pose la proposition d'une analyse. */
    poser(r: { ouvertures: readonly OuvertureDetectee[]; devinees: readonly OuvertureDetectee[] }) {
      const p = { cochees: r.ouvertures.map(versOuvertureFacade), decochees: r.devinees.map(versOuvertureFacade) };
      setProposition(p);
      setOuvertures(p.cochees);
      setDevinees(p.decochees);
      setChoisie(null);
    },
    /**
     * Pose ce que l'aide de Claude a fait des ouvertures (lot L18) : les retenues, les pointillees, et
     * la proposition mise a jour, pour que ses ajouts acceptes ne passent pas pour des corrections.
     */
    renforcer(r: ResultatRenfort) {
      setProposition(propositionRenforcee(proposition, r));
      setOuvertures(r.ouvertures);
      setDevinees(r.decochees);
      setChoisie(null);
    },
    /** Etire tout en hauteur (hauteur du mur corrigee) : la proposition aussi, pour comparer juste. */
    etirer(k: number) {
      setOuvertures(etirerOuvertures(ouvertures, k));
      setDevinees(etirerOuvertures(devinees, k));
      setProposition({ cochees: etirerOuvertures(proposition.cochees, k), decochees: etirerOuvertures(proposition.decochees, k) });
    },
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
    /** Les ouvertures retenues, etirees de `k`, leur source a jour, et les corrections tracees. */
    conclure(k: number): { ouvertures: OuvertureFacade[]; corrections: CorrectionOuverture[] } {
      const e = (os: readonly OuvertureFacade[]) => (Math.abs(k - 1) > 1e-9 ? etirerOuvertures(os, k) : [...os]);
      return tracerCorrections(e(proposition.cochees), e(proposition.decochees), e(ouvertures));
    },
  };
}

export type OuverturesEnCours = ReturnType<typeof useOuvertures>;
