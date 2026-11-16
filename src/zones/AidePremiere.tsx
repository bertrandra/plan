// Z9, l'aide de premiere utilisation (lot 2 de la simplification, app/aidePremiere.ts) : trois bulles, l'une apres l'autre, en bas de
// l'ecran. Une carte et deux boutons, sans voile ni piege a focus : elle informe, le plan reste utilisable derriere. Le texte suit la
// main de la personne (« Cliquez » a la souris, « Touchez » au doigt), pas un ecran a part.

import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { aidePremiere, BULLES } from '../app/aidePremiere.js';
import type { Magasin } from '../app/magasin.js';

export function AidePremiere({ magasin }: { magasin: Magasin }) {
  const etape = useSyncExternalStore(aidePremiere.abonner, aidePremiere.etape, aidePremiere.etape);
  const doigt = useStore(magasin.store, (s) => s.classe) !== 'large';
  const b = etape === null ? undefined : BULLES[etape];
  if (etape === null || !b) return null;
  const derniere = etape === BULLES.length - 1;
  return (
    <section className="aidePremiere" role="region" aria-label="Aide de première utilisation" aria-live="polite" data-etape={etape + 1}>
      <div className="aidePremiereTete">
        <span className="aidePremiereRang">{etape + 1}/{BULLES.length}</span>
        <h2 className="aidePremiereTitre">{b.titre}</h2>
      </div>
      <p className="aidePremiereTexte">{doigt ? b.doigt : b.souris}</p>
      <div className="aidePremierePied">
        {!derniere && <button type="button" className="secondary small" data-controle="aide.passer" onClick={() => aidePremiere.passer()}>Passer</button>}
        <button type="button" className="small" data-controle="aide.suivante" onClick={() => aidePremiere.suivante()}>{derniere ? 'C’est parti' : 'Suivant'}</button>
      </div>
    </section>
  );
}
