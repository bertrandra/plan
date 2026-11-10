// Sujet « lucarnes » : les lucarnes que Claude voit sur le versant. Le projet ne sait pas les ecrire :
// le sujet ne fait que se dire en observation (nombre, types de la premiere passe qui donne le nombre, pan).

import { accorde, pluriel, type EntreeObservation, type LigneObservation, type Sujet } from './contrat.js';

const LUCARNES: Record<string, string> = { jacobine: 'jacobine', capucine: 'capucine', 'chien-assis': 'chien-assis', rampante: 'rampante', meuniere: 'meunière', 'oeil-de-boeuf': 'œil-de-bœuf', outeau: 'outeau' };
const PANS: Record<string, string> = { rue: 'côté rue', arriere: 'côté jardin', cote: 'sur le côté', plusieurs: 'sur plusieurs pans' };

function observationsLucarnes({ v, reponses }: EntreeObservation): LigneObservation[] {
  const n = v.lucarnes.valeur;
  if (typeof n !== 'number' || n <= 0) return [];
  // Les types ne se votent pas : ceux de la premiere passe qui donne le nombre retenu.
  const types = [...new Set(reponses.find((r) => r.lucarnes.nombre === n)?.lucarnes.types ?? [])].map((t) => LUCARNES[t]).filter(Boolean);
  const pan = PANS[v.panLucarnes.valeur];
  return [{ sujet: 'lucarnes', texte: pluriel(n, 'lucarne') + ' ' + accorde(n, 'vue') + (types.length ? ' (' + types.join(', ') + ')' : '') + (pan ? ', ' + pan : ''), indices: v.lucarnes.indices, accord: v.lucarnes.accord }];
}

export const lucarnes: Sujet = { id: 'lucarnes', observer: observationsLucarnes };
