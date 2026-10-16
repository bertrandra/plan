// Sujet « elements » : ce que Claude voit sur le toit et que seule une photo ou l'orthophoto montre
// (fenetres de toit, chassis, verriere...). Observation seule.

import type { EntreeObservation, LigneObservation, Sujet } from './contrat.js';

const ELEMENTS: Record<string, string> = {
  'fenetre-de-toit': 'fenêtre de toit', 'chassis-eclairage': 'châssis d’éclairage', verriere: 'verrière', coyau: 'coyau',
  acrotere: 'acrotère', 'garde-corps': 'garde-corps', lanterneau: 'lanterneau', 'pignon-a-redents': 'pignon à redents',
};

function observationsElements({ v }: EntreeObservation): LigneObservation[] {
  const vus = v.elements.filter((e) => ELEMENTS[e.valeur]);
  if (!vus.length) return [];
  return [{ sujet: 'elements', texte: 'Vu aussi : ' + vus.map((e) => ELEMENTS[e.valeur]).join(', '), indices: vus.flatMap((e) => e.indices), accord: Math.min(...vus.map((e) => e.accord)) }];
}

export const elements: Sujet = { id: 'elements', observer: observationsElements };
