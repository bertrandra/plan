// Section « Facades et toit » de l'inspecteur, pour un batiment (spec-releve-facade §4).
//
// Une ligne par mur : son orientation, sa longueur, ce que le releve en a retenu, et le bouton qui
// ouvre le releve sur ce mur. Puis le toit, en champs ordinaires : la forme que la photo a proposee
// se corrige ici, comme n'importe quelle propriete.

import { enPoints } from '../../model/formes.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import { designerFacade } from '../../facade/choix.js';
import { angleDuPlusLongCote, penteDeg, LIBELLES_FORME_TOIT, COULEUR_TOIT_DEFAUT } from '../../facade/toit.js';
import { volumesActifs, decrireVolumes } from '../../model/volumesToit.js';
import { modeToitActif } from '../../model/toitMesure.js';
import type { FormeToit, Toit } from '../../model/types.js';
import type { Champ, ContexteChamps, Section } from './types.js';
import { estBatiment } from '../../model/fonctions.js';

/** Un batiment : le seul objet qui porte des facades et un toit. */
export { estBatiment };

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function toitDe(c: ContexteChamps): Toit {
  const o = enPoints(c.obj);
  if (!c.obj.toit) c.obj.toit = { forme: 'deux-pans', hauteur: 2.5, angleFaitage: angleDuPlusLongCote(o.pts), source: 'saisie' };
  return c.obj.toit;
}

const effetsToit: ('scene3d' | 'rendu')[] = ['scene3d', 'rendu'];

/** D'ou vient la couleur d'une couverture que Plan a posee (MD/spec-toit-ign.md §6.1). */
function origineCouleur(toit: Toit | null | undefined): string {
  switch (toit?.origineCouleur) {
    case 'orthophoto': return 'lue sur l’orthophoto';
    case 'rouge': return 'tuile rouge : orthophoto peu lisible';
    case 'brun': return 'tuile brune : orthophoto peu lisible';
    case 'gris': return 'couverture grise : orthophoto peu lisible';
    default: return '';
  }
}

/** D'ou vient la forme d'un toit : mesuree, estimee, par defaut, lue, saisie - pour qu'on sache ce qu'elle vaut. */
export function origineForme(toit: Toit | null | undefined): string {
  switch (toit?.source) {
    case 'lidar': return 'mesurée sur le LiDAR HD de l’IGN';
    case 'bdtopo': return toit.estime ? 'par défaut : la BD TOPO ne donne pas la hauteur' : 'estimée d’après la BD TOPO (hauteur à ± 1 m, forme déduite du contour)';
    case 'photo': return 'lue sur la photo de la façade';
    case 'saisie': return 'saisie';
    default: return '';
  }
}

/** D'ou vient la hauteur d'un toit deduit de la BD TOPO ou du LiDAR : on dit que c'est une estimation. */
function origineHauteur(toit: Toit): string {
  if (toit.source === 'lidar') return ' · ajustée sur le LiDAR HD de l’IGN';
  if (toit.source !== 'bdtopo') return '';
  return toit.estime ? ' · estimée : pas de hauteur dans la BD TOPO' : ' · déduite de la BD TOPO (± 1 m)';
}

/** Les champs du toit : les corps de batiment, puis le toit unique (forme, hauteur, faitage, couverture). */
function champsDuToit(): Champ[] {
  // Le toit unique ne se montre que si c'est lui que la 3D dessine : en surface mesuree ou en
  // plusieurs corps, ses reglages se cachent, la description du toit montre les remplace.
  const mode = (cc: ContexteChamps) => modeToitActif(cc.obj);
  const unSeul = (cc: ContexteChamps) => mode(cc) === 'simple';
  const aToit = (cc: ContexteChamps) => !!cc.obj.toit && unSeul(cc);
  const aPente = (cc: ContexteChamps) => !!cc.obj.toit && cc.obj.toit.forme !== 'plat' && unSeul(cc);
  const corps = (cc: ContexteChamps) => (cc.obj.volumesToit?.length ?? 0) >= 2;
  return [
    {
      type: 'choix',
      cle: 'toitMode',
      libelle: 'Toit en 3D',
      visible: (cc) => !!cc.obj.toitMesure || corps(cc),
      historique: true,
      effets: ['scene3d', 'inspecteur'],
      aide: 'Tel que mesuré : la surface que le LiDAR HD de l’IGN a relevée, à 50 cm, nettoyée des arbres — fidèle, même à un toit compliqué. Un toit par corps : le contour découpé en rectangles, chacun son toit simple. Un seul toit : une forme simple sur tout le contour, que l’on règle ci-dessous',
      options: (cc) => [
        ...(cc.obj.toitMesure ? [{ valeur: 'mesure', libelle: 'Tel que mesuré (LiDAR)' }] : []),
        ...(corps(cc) ? [{ valeur: 'volumes', libelle: 'Un toit par corps' }] : []),
        { valeur: 'simple', libelle: 'Un seul toit' },
      ],
      lire: (cc) => mode(cc),
      ecrire: (cc, v) => { cc.obj.modeToit = v === 'mesure' ? 'mesure' : v === 'volumes' ? 'volumes' : 'simple'; },
    },
    {
      type: 'lecture',
      cle: 'toitMesure',
      libelle: 'Mesure',
      visible: (cc) => mode(cc) === 'mesure',
      valeur: (cc) => {
        const t = cc.obj.toitMesure;
        return t ? `égout ${fr(t.egout, 1)} m · faîte ${fr(t.faite, 1)} m · ${t.nx} × ${t.ny} cellules à ${fr(t.pas, 2)} m · LiDAR HD de l’IGN` : '';
      },
    },
    {
      type: 'lecture',
      cle: 'toitCorps',
      libelle: 'Toits',
      visible: (cc) => mode(cc) === 'volumes',
      valeur: (cc) => decrireVolumes(volumesActifs(cc.obj) ?? [], LIBELLES_FORME_TOIT).join(' · ') + (cc.obj.toit ? ' · ' + origineForme(cc.obj.toit) : ''),
    },
    {
      type: 'choix',
      cle: 'toitForme',
      libelle: 'Toit',
      visible: unSeul,
      historique: true,
      effets: effetsToit,
      note: (cc) => origineForme(cc.obj.toit),
      // « Non modelise » ne se choisit plus : un toit plat saisi dit « pas de toit » d'une facon que
      // l'actualisation IGN respecte, la ou un toit absent serait remplace (MD/spec-toit-ign.md §5.4).
      options: (cc) => [
        ...(cc.obj.toit ? [] : [{ valeur: '', libelle: 'Non modélisé' }]),
        ...(Object.keys(LIBELLES_FORME_TOIT) as FormeToit[]).map((k) => ({ valeur: k, libelle: LIBELLES_FORME_TOIT[k] })),
      ],
      lire: (cc) => cc.obj.toit?.forme || '',
      ecrire: (cc, v) => {
        if (!v) return;
        const toit = toitDe(cc);
        toit.forme = v as FormeToit;
        toit.source = 'saisie';
        if (toit.forme !== 'croupes') delete toit.pente;
      },
    },
    {
      type: 'nombre',
      cle: 'toitHauteur',
      libelle: 'Hauteur du faîtage',
      unite: 'm',
      pas: 0.1,
      min: 0,
      max: 20,
      decimales: 2,
      visible: aPente,
      historique: true,
      effets: effetsToit,
      note: (cc) => (cc.obj.toit ? `pente ${fr(penteDeg(enPoints(cc.obj).pts, cc.obj.toit), 0)}°${origineHauteur(cc.obj.toit)}` : ''),
      aide: "Au-dessus de l'égout",
      lire: (cc) => cc.obj.toit?.hauteur ?? 0,
      ecrire: (cc, v) => {
        if (!(v >= 0)) return false;
        const toit = toitDe(cc);
        toit.hauteur = v;
        toit.source = 'saisie';
        delete toit.estime;
      },
    },
    {
      type: 'nombre',
      cle: 'toitFaitage',
      libelle: 'Direction du faîtage',
      unite: '°',
      pas: 1,
      min: 0,
      max: 179,
      decimales: 0,
      // Un toit a croupes n'a pas un faitage mais un par aile : il suit le contour.
      visible: (cc) => aPente(cc) && cc.obj.toit?.forme !== 'croupes',
      historique: true,
      effets: effetsToit,
      aide: "Angle du faîtage depuis l'est, dans le sens inverse des aiguilles d'une montre",
      lire: (cc) => Math.round(cc.obj.toit?.angleFaitage ?? 0),
      ecrire: (cc, v) => {
        toitDe(cc).angleFaitage = ((v % 180) + 180) % 180;
      },
    },
    {
      type: 'couleur',
      cle: 'toitCouleur',
      libelle: 'Couverture',
      visible: aToit,
      historique: true,
      effets: effetsToit,
      lire: (cc) => cc.obj.toit?.couleur || COULEUR_TOIT_DEFAUT,
      note: (cc) => origineCouleur(cc.obj.toit),
      ecrire: (cc, v) => {
        const toit = toitDe(cc);
        toit.couleur = v;
        // Choisie : plus rien ne la recalcule, ni l'orthophoto ni l'actualisation.
        delete toit.origineCouleur;
      },
    },
  ];
}

export function sectionReleve(c: ContexteChamps): Section {
  const o = enPoints(c.obj);
  const facades = facadesDuContour(o.pts, c.elevationOf(c.obj));
  const champs: Champ[] = [
    {
      type: 'bouton',
      cle: 'relever',
      libelle: '',
      nom: 'Relever une façade',
      texte: () => 'Relever une façade…',
      explication: 'Photographiez un mur : Plan le redresse, en retrouve les ouvertures et la forme du toit.',
      agit: { commande: 'facade.relever' },
      executer: (cx) => {
        designerFacade(null);
        cx.executerCommande('facade.relever');
      },
    },
  ];
  facades.forEach((f) => {
    const i = f.cote;
    const releve = () => (c.obj.facades || []).find((r) => r.cote === i);
    champs.push({
      type: 'ligne',
      cle: 'facade' + i,
      libelle: `${f.orientation}`,
      surbrillance: (cc) => cc.etat.highlight.type === 'segment' && cc.etat.highlight.index === i,
      champs: [
        {
          type: 'lecture',
          cle: 'etat',
          libelle: 'Relevé',
          valeur: () => {
            const r = releve();
            const nom = o.segmentNames?.[i] ? `${o.segmentNames[i]} · ` : '';
            return r ? `${nom}${fr(f.largeur)} m · ${pluriel(r.ouvertures.length, 'ouverture')}` : `${nom}${fr(f.largeur)} m · non relevée`;
          },
        },
        {
          type: 'bouton',
          cle: 'relever',
          libelle: 'Relever',
          texte: () => (releve() ? 'Refaire' : 'Relever'),
          aide: `Relever la façade ${f.orientation.toLowerCase()}`,
          agit: { commande: 'facade.relever' },
          executer: (cx) => {
            designerFacade(i);
            cx.executerCommande('facade.relever');
          },
        },
        {
          type: 'bouton',
          cle: 'retirer',
          libelle: 'Retirer',
          visible: () => !!releve(),
          aide: 'Retirer la photo et les ouvertures de ce mur (Ctrl+Z pour revenir)',
          agit: { commande: 'facade.retirer' },
          executer: (cx) => {
            designerFacade(i);
            cx.executerCommande('facade.retirer');
          },
        },
      ],
    });
  });

  champs.push(...champsDuToit());
  return { id: 'releve', titre: 'Façades et toit', champs };
}
