// La commande qui suspend ou reprend la lecture des toits, puis des murs, en tache de fond (app/toits/toitsFond.ts).
//
// Une seule commande, une bascule : le menu Fichier dit « Suspendre » pendant la lecture, et
// « Reprendre » quand elle est en pause ou arretee faute de service. Elle se grise quand il n'y a
// rien a lire. Elle ecrit le projet (les toits et les murs lus s'y rangent) : refusee en lecture seule.

import { PERMISSION_ECRITURE } from '../acces.js';
import { lectureToits } from '../../core/lectureToits.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ToitsFond } from '../toits/toitsFond.js';
import { LECTURE_MURS_EN_FOND } from '../toits/mursFond.js';

export function brancherToitsFond(fond: ToitsFond, cmd: RegistreCommandes): void {
  cmd.declarer({
    id: 'projet.toitsFond', libelle: LECTURE_MURS_EN_FOND ? 'Lecture des toits et des murs en tâche de fond' : 'Lecture des toits en tâche de fond', groupe: 'projet',
    permission: PERMISSION_ECRITURE,
    actif: () => { const p = lectureToits.progression(); return !!p && p.etat !== 'finie'; },
    executer: () => { if (fond.enCours()) fond.arreter(); else fond.relancer(); }
  });
}
