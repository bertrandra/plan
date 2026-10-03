// Section « Facades et toit » de l'inspecteur, pour un batiment (spec-releve-facade §4).
//
// Une ligne par mur : son orientation, sa longueur, ce que le releve en a retenu, et le bouton qui
// ouvre le releve sur ce mur. Puis le toit, en champs ordinaires : la forme que la photo a proposee
// se corrige ici, comme n'importe quelle propriete.

import { enPoints } from '../../model/formes.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import { designerFacade } from '../../facade/choix.js';
import { angleDuPlusLongCote, penteDeg, LIBELLES_FORME_TOIT, COULEUR_TOIT_DEFAUT } from '../../facade/toit.js';
import type { ObjetPlan, FormeToit, Toit } from '../../model/types.js';
import type { Champ, ContexteChamps, Section } from './types.js';
import { aParticularite } from '../../model/fonctions.js';

/** Un batiment : le seul objet qui porte des facades et un toit. */
export const estBatiment = (o: ObjetPlan) => aParticularite(o, 'releve');

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

/** D'ou vient la hauteur d'un toit deduit de la BD TOPO : on dit que c'est une estimation. */
function origineHauteur(toit: Toit): string {
  if (toit.source !== 'bdtopo') return '';
  return toit.estime ? ' · estimée : pas de hauteur dans la BD TOPO' : ' · déduite de la BD TOPO (± 1 m)';
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

  const aToit = (cc: ContexteChamps) => !!cc.obj.toit;
  const aPente = (cc: ContexteChamps) => !!cc.obj.toit && cc.obj.toit.forme !== 'plat';
  champs.push(
    {
      type: 'choix',
      cle: 'toitForme',
      libelle: 'Toit',
      historique: true,
      effets: effetsToit,
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
  );
  return { id: 'releve', titre: 'Façades et toit', champs };
}
