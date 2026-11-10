// La section Parasol de l'inspecteur : la terrasse rattachee, le mat, l'ombre et le soleil du projet (MD/spec-ouvrages.md, etape
// 6.6 : chaque ouvrage apporte sa section). Elle vivait dans la section commune (ui/champs/objet.ts), qui lisait pour elle le
// moteur du parasol.

import { terrasseDuParasol, hauteurParasolDe, matAngleDe, chercherMeilleurePositionParasol } from '../../engine/parasol.js';
import { formatHeureMin } from '../../util/format.js';
import { soleilDuProjet } from '../../core/soleil.js';
import { FENETRE_CARTE_OMBRE } from '../../model/soleilProjet.js';
import { coordonneesDuLieu } from '../../model/lieu.js';
import { fuseauDuLieu, libelleHeureLegale } from '../../geo/fuseau.js';
import { enCercle } from '../../model/formes.js';
import { estTerrasse, parcelleDuProjet } from '../../model/fonctions.js';
import { champsParasol } from '../../model/champsFonction.js';
import type { Section } from './types.js';

/** Le pli de l'ombre d'un parasol : sa date, son heure, la carte des heures d'ombre. */
const OMBRE = 'Date, heure et carte des ombres';

export const sectionParasol: Section = {
  id: 'parasol', titre: 'Parasol',
  champs: [
    // Terrasse de rattachement : c'est elle dont l'ombrage est mesure et sur laquelle porte la
    // recherche de position. Indispensable des qu'il y a plusieurs terrasses.
    {
      type: 'choix', cle: 'terrasseLieeKey', libelle: 'Terrasse rattachée', effets: ['rendu'],
      actif: (c) => c.objets.some(estTerrasse),
      options: (c) => { const t = c.objets.filter(estTerrasse); return t.length ? t.map(o => ({ valeur: o.key, libelle: o.name })) : [{ valeur: '', libelle: 'Aucune terrasse dans le plan' }]; },
      lire: (c) => terrasseDuParasol(c.obj, c.objets, c.etat.terrasseSelectedKey)?.key || '',
      ecrire: (c, v) => { champsParasol(c.obj).terrasseLieeKey = v; }
    },
    // Le diametre de la toile est le rayon du cercle : seule la hauteur du mat manque, et c'est
    // elle qui fixe la longueur de l'ombre.
    {
      type: 'nombre', cle: 'hauteurParasol', libelle: 'Hauteur du mât', unite: 'm', pas: 0.1, min: 0.5, decimales: 1, effets: ['rendu', 'scene3d'],
      aide: 'Hauteur de la toile au-dessus du sol : plus le mât est haut, plus l\'ombre se décale loin du pied',
      lire: (c) => hauteurParasolDe(c.obj), ecrire: (c, v) => { champsParasol(c.obj).hauteur = Math.max(0.5, v) || 2.2; }
    },
    {
      type: 'case', cle: 'matSurPerimetre', libelle: 'Mât sur le périmètre de la terrasse', effets: ['rendu'],
      aide: 'Le pied reste collé au pourtour de la terrasse rattachée, y compris quand on glisse le parasol ; la recherche de position ne teste plus que le bord',
      lire: (c) => !!c.obj.parasol?.matSurPerimetre, ecrire: (c, v) => { champsParasol(c.obj).matSurPerimetre = v; }
    },
    {
      type: 'case', cle: 'matDeporte', libelle: 'Mât déporté (en bord de toile)', effets: ['rendu', 'scene3d'],
      aide: 'Le mât n\'est plus au centre de la toile mais sur son bord, ce qui dégage la surface sous la toile',
      lire: (c) => !!c.obj.parasol?.matDeporte, ecrire: (c, v) => { champsParasol(c.obj).matDeporte = v; }
    },
    {
      type: 'nombre', cle: 'matAngleDeg', libelle: 'Orientation du mât', unite: '°', pas: 5, decimales: 0, effets: ['rendu', 'scene3d'],
      aide: 'Direction du pied vu depuis le centre de la toile : 0 = Est, 90 = Nord',
      visible: (c) => !!c.obj.parasol?.matDeporte,
      lire: (c) => Math.round(matAngleDe(c.obj)), ecrire: (c, v) => { champsParasol(c.obj).matAngleDeg = ((v || 0) % 360 + 360) % 360; }
    },
    { type: 'case', cle: 'ombreAffichee', libelle: 'Afficher l\'ombre', sale: false, effets: ['rendu'], lire: (c) => c.etat.parasol.ombreAffichee, ecrire: (c, v) => { c.etat.parasol.ombreAffichee = v; } },
    {
      type: 'bouton', cle: 'placerAuMieux', libelle: 'Meilleure position', texte: () => 'Placer au mieux',
      explication: 'Cherche sur la terrasse la position qui ombrage le plus, de ' + FENETRE_CARTE_OMBRE.libelle + '.',
      agit: 'projet',
      executer: (c) => {
        const obj = c.obj;
        const terr = terrasseDuParasol(obj, c.objets, c.etat.terrasseSelectedKey);
        if (!terr) { c.toast('Aucune terrasse : cree d\'abord un objet avec Fonction = terrasse.'); return; }
        // Le calcul bloque le fil d'execution : on laisse le navigateur peindre avant de le lancer.
        setTimeout(() => {
          const res = chercherMeilleurePositionParasol(obj, c.contexteSoleil(), c.objets);
          if (!res) { c.toast('Pas de position calculable (soleil trop bas ou terrasse trop petite).'); return; }
          c.pushHistory(obj);
          const toile = enCercle(obj); toile.center.x = res.x; toile.center.y = res.y;
          if (obj.parasol?.matDeporte && res.angleDeg !== undefined) champsParasol(obj).matAngleDeg = res.angleDeg;
          c.render();
          c.toast('Parasol placé sur « ' + terr.name + ' » : ' + (res.couverture * 100).toFixed(0) + ' % à l’ombre en moyenne (' + FENETRE_CARTE_OMBRE.libelle + ').');
        }, 30);
      }
    },
    // La date, l'heure et la carte des heures d'ombre servent rarement : repliees, apres le geste.
    // La date et l'heure sont le soleil du projet (core/soleil.ts), le meme que la Vue 3D et la visionneuse : un reglage
    // d'affichage (ni annulation, ni « projet modifie », permis en lecture seule) que le projet garde (`enregistre`). Son
    // ecouteur (app/soleil.ts) redessine le plan, eclaire la 3D et le range sur la parcelle : aucun effet a declarer ici.
    {
      type: 'date', cle: 'ombreDate', libelle: 'Soleil — date', sale: false, enregistre: true, repli: OMBRE,
      aide: 'Le même soleil que la Vue 3D et la visionneuse ; il s’enregistre avec le projet',
      lire: () => soleilDuProjet.lire().dateStr, ecrire: (_c, v) => { if (v) soleilDuProjet.regler({ dateStr: v }); }
    },
    {
      type: 'curseur', cle: 'ombreHeure', libelle: 'Soleil — heure', min: 0, max: 1439, pas: 5, format: formatHeureMin, sale: false, enregistre: true, repli: OMBRE,
      // L'heure legale du lieu de la parcelle (geo/fuseau.ts) : dite sous le curseur, l'infobulle n'existant pas au doigt.
      aide: 'L’heure légale du lieu de la parcelle (son fuseau, heure d’été comprise), la même que la Vue 3D et la visionneuse',
      note: (c) => { const l = coordonneesDuLieu(parcelleDuProjet(c.objets)); return libelleHeureLegale(fuseauDuLieu(l.latitude, l.longitude)); },
      lire: () => soleilDuProjet.lire().minutes, ecrire: (_c, v) => { soleilDuProjet.regler({ minutes: v }); }
    },
    {
      // La carte couvre toute la saison et non la date choisie juste au-dessus : elle le dit sous la case, pas seulement en infobulle
      // (au doigt, l'infobulle n'existe pas).
      type: 'case', cle: 'carteAffichee', libelle: 'Carte des heures d\'ombre', sale: false, repli: OMBRE, effets: ['rendu'],
      note: () => 'Toute la saison, ' + FENETRE_CARTE_OMBRE.libelle + ', pas la date choisie',
      aide: 'Colore la terrasse selon la part des après-midis d\'été (' + FENETRE_CARTE_OMBRE.libelle + ') passée à l\'ombre de ses parasols',
      lire: (c) => c.etat.parasol.carteAffichee, ecrire: (c, v) => { c.etat.parasol.carteAffichee = v; }
    }
  ]
};
