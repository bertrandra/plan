// Z6, onglet Resume : le plan decrit en texte, a copier dans un message. La meme zone recoit aussi le
// SVG d'un export, comme filet si le telechargement echoue. Le texte vit dans le service
// (app/resultats.ts) ; chaque nouvel affichage le selectionne pour un copier-coller immediat.

import { useEffect, useRef } from 'react';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';

export function Resume({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  const { texte, affichage } = resultats.resume();
  const zone = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (affichage && zone.current) { zone.current.focus(); zone.current.select(); }
  }, [affichage]);
  return (
    <>
      <div className="sectionTitle">Résumé</div>
      <div className="controls">
        <BoutonCommande commandes={commandes} id="export.resume" domId="exportBtn">Générer le résumé à copier</BoutonCommande>
        <BoutonCommande commandes={commandes} id="export.copierResume" domId="copierResumeBtn" className="secondary">Copier</BoutonCommande>
      </div>
      <div className="hint">Le résumé décrit le plan en texte : parcelle, objets, surfaces, terrasses et cotes. Il se copie tel quel.</div>
      <textarea id="exportBox" ref={zone} readOnly value={texte} style={texte ? { display: 'block' } : undefined} aria-label="Résumé du plan" />
    </>
  );
}
