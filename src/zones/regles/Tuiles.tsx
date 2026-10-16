// Les chiffres cles de l'ecran Admin › Regles : les sujets, le prompt, le schema, les controles, l'ecart au livre.

import { estimerTokens } from '../../regles/sujets/edition.js';

export interface PropsTuiles {
  sujetsActifs: number;
  sujets: number;
  brouillons: number;
  prompt: string;
  versionPrompt: number;
  versionSchema: number;
  champs: number;
  erreurs: number;
  alertes: number;
  /** Les lignes du corps du prompt qui changent par rapport au livre. */
  changees: number;
  identique: boolean;
  livre: { versionPrompt: number; versionSchema: number };
}

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

export function Tuiles(p: PropsTuiles) {
  return (
    <div className="consTuiles" aria-label="Chiffres clés">
      <div className="consTuile"><span className="consTuileTitre">Sujets</span><span className="consTuileValeur">{p.sujetsActifs} / {p.sujets}</span>
        <span className="consTuileNote">{p.brouillons ? pluriel(p.brouillons, 'brouillon') : 'dans le dépôt'}</span></div>
      <div className="consTuile"><span className="consTuileTitre">Prompt</span><span className="consTuileValeur">≈ {estimerTokens(p.prompt).toLocaleString('fr-FR')} tokens</span>
        <span className="consTuileNote">{p.prompt.length.toLocaleString('fr-FR')} caractères · version {p.versionPrompt}</span></div>
      <div className="consTuile"><span className="consTuileTitre">Schéma</span><span className="consTuileValeur">{pluriel(p.champs, 'champ')}</span>
        <span className="consTuileNote">version {p.versionSchema}</span></div>
      <div className="consTuile"><span className="consTuileTitre">Contrôles</span><span className="consTuileValeur">{pluriel(p.erreurs, 'erreur')}</span>
        <span className="consTuileNote">{pluriel(p.alertes, 'alerte')}</span></div>
      <div className="consTuile"><span className="consTuileTitre">Par rapport au livré</span>
        <span className="consTuileValeur">{p.identique ? 'Identique' : pluriel(Math.max(p.changees, 1), 'ligne') + ' change' + (p.changees > 1 ? 'nt' : '')}</span>
        <span className="consTuileNote">{p.identique ? 'prompt v' + p.livre.versionPrompt + ', schéma v' + p.livre.versionSchema : 'version ' + p.versionPrompt + ' à poser dans versions.ts'}</span></div>
    </div>
  );
}

export type VueRegles = 'sujets' | 'donnees';

/** Les deux vues de l'ecran : ce que Claude lit (sujets, prompt, schema), et ce que le moteur lit (reglages, faits). */
export function BarreVue({ vue, surVue }: { vue: VueRegles; surVue: (v: VueRegles) => void }) {
  return (
    <div className="palOnglets consOnglets" role="tablist" aria-label="Ce que le moteur lit">
      {([['sujets', 'Sujets, prompt et schéma'], ['donnees', 'Réglages et faits']] as const).map(([id, titre]) => (
        <button key={id} type="button" role="tab" id={'reglVue-' + id} aria-selected={vue === id} className={'palOnglet' + (vue === id ? ' actif' : '')} data-controle={'regles.vue.' + id} onClick={() => surVue(id)}>{titre}</button>
      ))}
    </div>
  );
}
