// Z6, les onglets d'un ouvrage : le metrage, le chiffrage et les prix d'une piscine, d'une pergola
// ou d'un carport, et l'optimisation de la structure d'une terrasse.
//
// L'inspecteur regle, il n'affiche pas de resultat (regle de la zone Z5) : ce que le moteur tire de
// l'ouvrage se lit ici. Les lignes sont les memes descripteurs qu'avant (ui/champs/piscine.ts,
// ui/champs/pergola.ts), rendus par le meme composant (composants/Champs.tsx) et ecrits par le meme
// service : un prix saisi dans le tiroir s'annule et marque le projet modifie, comme dans
// l'inspecteur, et se refuse en lecture seule. Rien n'est calcule ici.

import { useStore } from 'zustand';
import { sectionMetragePergola, sectionPrixPergola } from '../../ui/champs/pergola.js';
import { sectionsResultatsPiscine } from '../../ui/champs/piscine.js';
import { estAbri, estExistant, estPiscine } from '../../model/fonctions.js';
import { ListeChamps, Tactile, useServiceLocal } from '../composants/Champs.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { Optimisation } from './Optimisation.js';
import type { ContexteChamps, Section } from '../../ui/champs/types.js';
import type { Inspecteur as ServiceInspecteur } from '../../app/inspecteur.js';
import type { Magasin } from '../../app/magasin.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { ObjetPlan } from '../../model/types.js';

interface PropsOuvrage { magasin: Magasin; inspecteur: ServiceInspecteur }

/**
 * Des sections de champs, l'une sous l'autre : un titre, son explication, ses lignes. Une section
 * repliee d'office (les prix) se deplie d'un clic, comme dans l'inspecteur.
 */
function Sections({ sections, c, inspecteur, magasin }: { sections: Section[]; c: ContexteChamps } & PropsOuvrage) {
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  const service = useServiceLocal(inspecteur);
  return (
    <Tactile.Provider value={tactile}>
      <div className="hoteChamps champsOuvrage">
        {sections.map((s) => {
          const corps = <>
            {s.explication && <div className="hint">{s.explication}</div>}
            <div className="champs"><ListeChamps champs={s.champs} c={c} inspecteur={service} /></div>
          </>;
          return s.repliee
            ? <details key={s.id} className="sectionOuvrage" data-section={s.id}><summary className="sectionTitle">{s.titre}</summary>{corps}</details>
            : <section key={s.id} className="sectionOuvrage" data-section={s.id}><div className="sectionTitle">{s.titre}</div>{corps}</section>;
        })}
      </div>
    </Tactile.Provider>
  );
}

/** L'objet selectionne, s'il est de la sorte demandee. */
function selection(magasin: Magasin, garder: (o: ObjetPlan) => boolean): ObjetPlan | undefined {
  const etat = magasin.store.getState().etat;
  const o = etat.objects.find((x) => x.key === etat.selectedKey);
  return o && garder(o) ? o : undefined;
}

/** L'onglet Piscine : le bassin et l'urbanisme (volume, distances aux limites, taxe), le chiffrage, les prix. */
export function OngletPiscine({ magasin, inspecteur }: PropsOuvrage) {
  const piscine = selection(magasin, estPiscine);
  if (!piscine) return <div className="hint">Sélectionnez une piscine pour lire son métrage et son chiffrage.</div>;
  // Une piscine deja la (lue sur la photo aerienne, lot L3) situe le projet : elle n'a ni chiffrage ni dossier.
  if (estExistant(piscine)) return <div className="hint">Piscine existante : elle situe le projet, elle n’est ni chiffrée ni déclarée.</div>;
  const c = inspecteur.contexte(piscine);
  return <div id="piscineResultatsWrap"><Sections sections={sectionsResultatsPiscine(c)} c={c} inspecteur={inspecteur} magasin={magasin} /></div>;
}

/** L'onglet d'une pergola ou d'un carport : son metrage et son chiffrage, ses prix. */
export function OngletAbri({ magasin, inspecteur }: PropsOuvrage) {
  const abri = selection(magasin, estAbri);
  if (!abri) return <div className="hint">Sélectionnez une pergola ou un carport pour lire son métrage.</div>;
  const c = inspecteur.contexte(abri);
  return <div id="abriResultatsWrap"><Sections sections={[sectionMetragePergola(c), sectionPrixPergola(c)]} c={c} inspecteur={inspecteur} magasin={magasin} /></div>;
}

/**
 * L'onglet Optimisation d'une terrasse : le bouton qui demande la comparaison, puis le tableau, une
 * ligne par strategie de structure. Son « Appliquer » est une saisie du tiroir (`resultats.saisir`).
 */
export function OngletOptimisation({ terrasse, resultats, commandes }: { terrasse: ObjetPlan; resultats: Resultats; commandes: RegistreCommandes }) {
  return (
    <div id="terrasseOptimWrap">
      <div className="controls">
        <BoutonCommande commandes={commandes} id="terrasse.optimisation" domId="terrasseOptimBtn">
          {resultats.optimisationVisible() ? 'Masquer l\'optimisation' : 'Optimisation des paramètres'}
        </BoutonCommande>
      </div>
      <Optimisation obj={terrasse} resultats={resultats} />
    </div>
  );
}
