// Le decroche au point (demande du proprietaire, novembre 2026 : « je selectionne un point sur l'egout et je recule a droite ou a gauche
// de x cm, et une poignee pour ajuster »).
//
// La piece « Decroche » du catalogue (onglet Facade) execute `toit.decrocher` : le prochain toucher sur la scene donne le point (sur
// l'egout ou sur le mur de la facade regardee). Un petit choix demande alors le cote et la profondeur (en centimetres, 50 propose) ;
// la reponse pose UNE travee de mur reculee (facade/modeToit/travees.ts::traveeDecrochee : schema 14, le toit reste continu), qui se
// choisit : ses poignees (les deux bords, et la profondeur) la reglent ensuite. Un pas de la session (Ctrl+Z), comme tout geste du mode.

import { PERMISSION_ECRITURE } from '../acces.js';
import { sessionToit, type ModeToit } from '../toits/modeToit.js';
import { murDuCorps } from '../../facade/modeToit/saillies.js';
import { gaucheEnDebut } from '../../facade/modeToit/decroche.js';
import { RECUL_DECROCHE_CM, traveeDecrochee } from '../../facade/modeToit/travees.js';
import { RECUL_TRAVEE_MAX_M } from '../../model/corpsToitEtendu.js';
import { champsBatiment } from '../../model/champsFonction.js';
import { moteur3d } from '../../three/demande3d.js';
import { dialogues } from '../../shell/dialogues.js';
import { showToast } from '../../shell/dialogs.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

/** Ce que la scene et le clavier demandent au decroche : est-il arme, ou poser le point touche, le desarmer. */
export interface GesteDecroche { arme: () => boolean; placer: (ndc: { x: number; y: number }) => boolean; desarmer: () => void }

/**
 * `raison` : pourquoi le decroche n'a pas de sens sur la facade regardee (celle du catalogue, `raisonIndisponible` de 'facade:decroche'),
 * null quand il en a.
 */
export function brancherDecroche(cmd: RegistreCommandes, mode: Pick<ModeToit, 'ecrire' | 'selectionner'>, batiment: () => ObjetPlan | undefined,
  raison: () => string | null, rafraichir: () => void): GesteDecroche {
  // Arme pour une session : une autre session (le meme batiment rouvert) ne l'herite pas.
  let armePour: object | null = null;
  const estArme = () => armePour !== null && armePour === sessionToit();
  const facade = () => { const s = sessionToit(); return s ? s.facade ?? s.derniere : null; };
  cmd.declarer({
    id: 'toit.decrocher', libelle: 'Décrocher ici', groupe: 'toit', permission: PERMISSION_ECRITURE,
    actif: () => !!sessionToit() && raison() === null, raisonInactive: () => (sessionToit() ? raison() : null),
    executer: () => {
      armePour = sessionToit();
      rafraichir();
      showToast('Touchez l’égout ou le mur à l’endroit du décroché (Échap pour annuler).');
    }
  });

  /** Pose le decroche au point `x` (metres depuis le debut du mur), du cote choisi, a la profondeur dite en centimetres. */
  const poser = (rang: number, mur: number, x: number, cote: 'gauche' | 'droite', reculCm: number): void => {
    const c = batiment()?.batiment?.corpsToit?.[rang];
    const k = c ? traveeDecrochee(c, mur, x, cote, reculCm / 100, gaucheEnDebut(c, mur)) : null;
    if (!c || !k) { showToast('Pas de décroché ici : le point est dans une travée, ou le mur est trop court de ce côté.'); return; }
    const i = c.travees?.length ?? 0;
    const fait = mode.ecrire((o) => {
      const cc = o.batiment?.corpsToit?.[rang];
      if (!cc) return false;
      cc.travees = [...(cc.travees ?? []), k];
      champsBatiment(o).toitFige = true;
      champsBatiment(o).modeToit = 'corps';
    });
    if (fait) mode.selectionner({ type: 'travee', rang, i });
  };

  return {
    arme: estArme,
    desarmer: () => { if (armePour) { armePour = null; rafraichir(); } },
    placer(ndc) {
      const o = batiment(), f = facade();
      if (!estArme() || !o || !f || f.rang === null) { armePour = null; return false; }
      const touche = moteur3d()?.objetSousLePointeur(ndc, (cle) => cle === o.key);
      // Le ciel, un autre objet : rien, le geste reste arme (Echap le lache).
      if (!touche || touche.cle !== o.key || !touche.point) return false;
      const c = o.batiment?.corpsToit?.[f.rang];
      if (!c) { armePour = null; return false; }
      const m = murDuCorps(c, f.mur), rang = f.rang, mur = f.mur;
      const x = Math.min(Math.max((touche.point.x - m.a.x) * m.u.x + (touche.point.y - m.a.y) * m.u.y, 0), m.L);
      armePour = null;
      let recul = RECUL_DECROCHE_CM;
      const depuisGauche = gaucheEnDebut(c, mur) ? x : m.L - x;
      dialogues.ouvrir({
        type: 'choix', titre: 'Décrocher le mur ici',
        texte: 'À ' + depuisGauche.toFixed(2).replace('.', ',') + ' m du bout gauche du mur, vu de face : de quel côté le mur recule-t-il sous le toit ?',
        nombre: { libelle: 'Profondeur', valeur: RECUL_DECROCHE_CM, min: 1, max: Math.round(RECUL_TRAVEE_MAX_M * 100), unite: 'cm', changer: (v) => { recul = v; } },
        principal: { libelle: 'Reculer à droite', executer: () => { poser(rang, mur, x, 'droite', recul); } },
        secondaire: { libelle: 'Reculer à gauche', executer: () => { poser(rang, mur, x, 'gauche', recul); } },
        tertiaire: { libelle: 'Annuler', executer: () => {} }
      });
      rafraichir();
      return true;
    }
  };
}
