// Le releve de facade : « Demander de l'aide » (MD/spec-facades-calage-detection.md §12 bis, lot L18).
// Propose seulement quand l'algorithme leve un signal (coins non trouves, detection peu sure…), et
// seulement si le serveur de l'analyse est joignable. Un appel immediat : le run unique d'une facade
// (MD/spec-facade-calage-audit.md §8, lot F2), une passe, recalee sur la photo par Plan. Les photos ne partent qu'avec l'accord de la personne
// pour ce projet (decision D2), demande au premier appel.

import { useState } from 'react';
import { texteSignaux, type SituationFacade } from '../../facade/detection/signaux.js';
import type { AideClaudeReleve } from '../../app/releve/runFacade.js';

type Etat = { phase: 'repos' } | { phase: 'accord' } | { phase: 'envoi' } | { phase: 'fait'; message: string; erreur: boolean };

/**
 * `demander` envoie et applique ; il rend la phrase a afficher (ce que Claude a change) ou une erreur.
 * `etape` dit ce que Claude regardera : les coins de la photo, ou les ouvertures de l'elevation.
 * `motif` remplace les signaux en clair quand l'appelant sait mieux les dire (la part du mur cachee
 * sur toutes les photos d'une fusion, lot G20).
 */
export function AideClaude({ aide, signaux, etape, demander, motif }: { aide: AideClaudeReleve | null; signaux: readonly SituationFacade[]; etape: 'coins' | 'ouvertures'; demander: () => Promise<{ message: string; erreur: boolean }>; motif?: string }) {
  const [etat, setEtat] = useState<Etat>({ phase: 'repos' });
  if (!aide || !aide.disponible() || (!signaux.length && etat.phase !== 'fait')) return null;
  const lancer = async () => {
    setEtat({ phase: 'envoi' });
    const r = await demander();
    setEtat({ phase: 'fait', ...r });
  };
  const cliquer = () => {
    if (aide.accordDonne()) void lancer();
    else setEtat({ phase: 'accord' });
  };
  const quoi = etape === 'coins' ? 'les coins du mur' : 'les fenêtres et les portes';
  return (
    <div className="releveAide" role="group" aria-label="Aide de Claude">
      {etat.phase === 'repos' && (
        <>
          <p className="releveNote">Plan n’est pas sûr de lui ({motif ?? texteSignaux(signaux)}). Claude peut regarder la photo et proposer {quoi} ; Plan les recale sur la photo, et vous vérifiez.</p>
          <button data-controle="releve.demanderAide" type="button" className="secondary" onClick={cliquer}>
            Demander de l’aide
          </button>
        </>
      )}
      {etat.phase === 'accord' && (
        <>
          <p className="releveNote">Cette photo part à l’analyse par Claude, et ne sert qu’à elle. Votre accord vaut pour ce projet, et se retire depuis l’audit de la parcelle.</p>
          <div className="releveGestes">
            <button data-controle="releve.accorderAide" type="button" onClick={() => { aide.accorder(); void lancer(); }}>
              Envoyer la photo à Claude
            </button>
            <button data-controle="releve.annulerAide" type="button" className="secondary" onClick={() => setEtat({ phase: 'repos' })}>
              Annuler
            </button>
          </div>
        </>
      )}
      {etat.phase === 'envoi' && <p className="releveNote" aria-live="polite">Claude regarde votre photo (quelques secondes)…</p>}
      {etat.phase === 'fait' && (
        <p className={etat.erreur ? 'releveAvis' : 'releveNote'} role="status">
          {etat.message}
        </p>
      )}
    </div>
  );
}
