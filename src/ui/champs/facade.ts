// Section « Facades et toit » de l'inspecteur, pour un batiment (spec-releve-facade §4).
//
// Une ligne par mur : son orientation, sa longueur, ce que le releve en a retenu, et ses gestes : « Photographier » ouvre l'audit de
// la parcelle sur ce mur (les photos d'une facade se prennent dans l'audit, lot F6), « Modifier » l'editeur de son releve,
// « Retirer » le retire. Le toit, dans sa propre section, se lit ici et se regle dans l'atelier du toit (Z10) : sa forme, sa hauteur a
// l'egout, sa couverture, ce que la 3D en montre (decision du proprietaire, 28 novembre 2026 : un geste sur le toit n'existe qu'a un
// endroit).

import { enPoints } from '../../model/formes.js';
import { facadesDuContour } from '../../geometry/cotesVusDeDehors.js';
import { designerFacade } from '../../interaction/choixFacade.js';
import { LIBELLES_FORME_TOIT } from '../../facade/toits/toit.js';
import { volumesActifs, decrireVolumes } from '../../model/volumesToit.js';
import { modeToitActif } from '../../model/toitMesure.js';
import { repere } from '../../facade/toits/toitCorps.js';
import { carteDuToit } from './carteToit.js';
import type { CorpsToit, OuvertureFacade, ReleveFacade, TerrasseToit, Toit } from '../../model/types.js';
import { libelleSilhouette } from '../../model/silhouetteFacade.js';
import { ALERTE_ECART } from '../../facade/releve/bilanFacade.js';
import { resumeDuToit } from '../../facade/modeToit/gestes.js';
import { couvertureDuBatiment, egoutDuBatiment, lieuDuProjet } from '../../facade/modeToit/reglagesBatiment.js';
import type { Champ, ContexteChamps, Section } from './types.js';
import { estBatiment } from '../../model/fonctions.js';
import { nomDuCote } from '../nomCote.js';

/** Un batiment : le seul objet qui porte des facades et un toit. */
export { estBatiment };

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

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

/** Une ligne par corps reconstruit : ses dimensions, son toit, ses egouts, ses pignons. */
export function decrireCorps(corps: readonly CorpsToit[]): string[] {
  const m = (v: number) => fr(v, 1) + ' m';
  return corps.map((c, i) => {
    const r = repere(c.pts);
    const dims = `${fr(r.L, 1)} × ${fr(r.W, 1)} m`;
    const [e0, e1] = c.egouts;
    const plat = c.faitage - Math.min(e0, e1) < 0.05;
    const appentis = !plat && (c.posFaitage <= 0.01 || c.posFaitage >= r.W - 0.01);
    // Des croupes aux deux bouts : quatre pans ; a un seul : deux pans et une croupe.
    const croupes = !plat && !appentis ? (c.croupes ?? [0, 0]).filter((h) => h > 0).length : 0;
    const pans = croupes === 2 ? 'quatre pans' : croupes === 1 ? 'deux pans et une croupe' : 'deux pans';
    const toit = plat ? `toit plat à ${m(c.faitage)}` : appentis ? `appentis de ${m(Math.min(e0, e1))} à ${m(c.faitage)}`
      : `${pans}, faîtage ${m(c.faitage)}, égouts ${Math.abs(e0 - e1) < 0.05 ? m(e0) : fr(e0, 1) + ' / ' + m(e1)}`;
    const pignons = c.pignons.length ? `, ${pluriel(c.pignons.length, 'pignon')} depuis le faîtage` : '';
    // Ce qu'une observation a ajoute (MD/spec-regles-toits.md §2.6, §2.7) : dit seulement s'il existe,
    // pour qu'un corps lu sur le LiDAR garde sa description d'avant.
    const cheminees = c.cheminees?.length ? `, ${c.cheminees.length > 1 ? c.cheminees.length + ' cheminées' : 'une cheminée'}` : '';
    const terrasse = c.terrasse && plat ? `, ${decrireTerrasse(c.terrasse)}` : '';
    return `${i === 0 ? 'Corps' : 'Corps ' + (i + 1)} ${dims} : ${toit}${pignons}${cheminees}${terrasse}`;
  });
}

/** Une toiture-terrasse en quelques mots : accessible ou non, son acrotere, ses edicules. */
export function decrireTerrasse(t: TerrasseToit): string {
  const morceaux = [t.accessible === true ? 'terrasse accessible' : t.accessible === false ? 'terrasse non accessible' : 'toit-terrasse'];
  if (typeof t.acrotereM === 'number' && t.acrotereM > 0) morceaux.push(`acrotère de ${fr(t.acrotereM, 2)} m`);
  const n = t.edicules?.length ?? 0;
  if (n) morceaux.push(n > 1 ? `${n} édicules` : 'un édicule');
  return morceaux.join(', ');
}

/**
 * Le toit se modifie dans l'atelier du toit (Z10, zones/AtelierToit.tsx), et la seulement : sur le plan comme dans la Vue 3D (decision du
 * proprietaire, 28 novembre 2026 : un geste n'existe qu'a un endroit). L'inspecteur le resume et ouvre l'atelier sur ce batiment.
 */
const champToit: Champ = {
  type: 'lecture',
  cle: 'toitResume',
  libelle: 'Toit',
  valeur: (cc) => resumeDuToit(cc.obj) ?? 'Pas encore de toit',
  note: (cc) => [origineForme(cc.obj.batiment?.toit), cc.obj.batiment?.toitFige ? 'réglé à la main' : ''].filter(Boolean).join(' · '),
};

/** La hauteur a l'egout, en lecture : elle se regle dans l'atelier du toit, qui dit aussi d'ou elle vient. */
const champEgout: Champ = {
  type: 'lecture',
  cle: 'toitEgout',
  libelle: 'Égout',
  valeur: (cc) => fr(egoutDuBatiment(cc.obj).hauteur) + ' m',
  note: (cc) => egoutDuBatiment(cc.obj).origine,
};

/** La couverture, en lecture : son materiau (choisi, ou celui que Plan deduit) et son motif de pose ; elle se choisit dans l'atelier. */
const champCouverture: Champ = {
  type: 'lecture',
  cle: 'toitCouverture',
  libelle: 'Couverture',
  visible: (cc) => !!couvertureDuBatiment(cc.obj)?.materiau,
  valeur: (cc) => {
    const lieu = lieuDuProjet(cc.objets), c = couvertureDuBatiment(cc.obj, lieu), m = c?.materiau;
    const mot = m?.options.find((x) => x.valeur === m.enPlace)?.libelle ?? '';
    const pose = c?.pose && c.pose.enPlace !== 'droite' ? c.pose.options.find((x) => x.valeur === c.pose?.enPlace)?.libelle.toLowerCase() : '';
    return [mot, pose].filter(Boolean).join(', ');
  },
};

const champModifierToit: Champ = {
  type: 'bouton',
  cle: 'toitModifier',
  libelle: '',
  nom: 'Modifier le toit',
  texte: () => 'Modifier le toit…',
  explication: 'Ouvre l’atelier du toit sur ce bâtiment : sa forme, sa hauteur, son sens, ce qui se pose dessus, et sous « Plus de réglages » la hauteur à l’égout, la couverture et ce que la 3D montre du toit ; rien ne change avant « Valider ».',
  agit: { commande: 'toit.modifier' },
  executer: (cx) => cx.executerCommande('toit.modifier'),
};

/**
 * Les champs du toit, tous en lecture hors du bouton qui ouvre l'atelier : le resume, la hauteur a l'egout, la couverture, puis ce que
 * la 3D dessine (la carte des hauteurs, les corps lus, la surface mesuree ou les toits par corps).
 */
function champsDuToit(): Champ[] {
  const mode = (cc: ContexteChamps) => modeToitActif(cc.obj.batiment);
  return [
    champToit,
    champEgout,
    champCouverture,
    champModifierToit,
    {
      type: 'carte',
      cle: 'toitCarte',
      libelle: '',
      nom: 'Carte des hauteurs mesurées et découpage du toit',
      visible: (cc) => !!cc.obj.batiment?.toitMesure,
      carte: (cc) => carteDuToit(cc.obj),
    },
    {
      type: 'lecture',
      cle: 'toitCorpsLus',
      libelle: 'Corps',
      visible: (cc) => mode(cc) === 'corps',
      valeur: (cc) => decrireCorps(cc.obj.batiment?.corpsToit ?? []).join(' · '),
    },
    {
      type: 'lecture',
      cle: 'toitMesure',
      libelle: 'Mesure',
      visible: (cc) => mode(cc) === 'mesure',
      valeur: (cc) => {
        const t = cc.obj.batiment?.toitMesure;
        return t ? `égout ${fr(t.egout, 1)} m · faîte ${fr(t.faite, 1)} m · ${t.nx} × ${t.ny} cellules à ${fr(t.pas, 2)} m · LiDAR HD de l’IGN` : '';
      },
    },
    {
      type: 'lecture',
      cle: 'toitCorps',
      libelle: 'Toits',
      visible: (cc) => mode(cc) === 'volumes',
      valeur: (cc) => decrireVolumes(volumesActifs(cc.obj) ?? [], LIBELLES_FORME_TOIT).join(' · ') + (cc.obj.batiment?.toit ? ' · ' + origineForme(cc.obj.batiment?.toit) : ''),
    },
  ];
}

const NOMS_OUVERTURE: Readonly<Record<OuvertureFacade['type'], [string, string]>> = {
  fenetre: ['fenêtre', 'fenêtres'], 'porte-fenetre': ['porte-fenêtre', 'portes-fenêtres'], porte: ['porte', 'portes'], garage: ['porte de garage', 'portes de garage'],
};

/**
 * Les ouvertures d'une facade, par niveau (le rez-de-chaussee d'abord) et par type : « Rez-de-chaussée : 2 fenêtres, 1 porte ·
 * Étage 1 : 3 fenêtres », et celles que la personne a verifiees.
 */
function ouverturesParNiveau(ouvertures: readonly OuvertureFacade[]): string {
  const niveaux = new Map<number, OuvertureFacade[]>();
  for (const o of ouvertures) { const n = o.niveau ?? 0; niveaux.set(n, [...(niveaux.get(n) ?? []), o]); }
  const lignes = [...niveaux.entries()].sort((a, b) => a[0] - b[0]).map(([n, l]) => {
    const types = (Object.keys(NOMS_OUVERTURE) as OuvertureFacade['type'][]).map((t) => [t, l.filter((o) => o.type === t).length] as const).filter(([, k]) => k > 0);
    return (n === 0 ? 'Rez-de-chaussée' : 'Étage ' + n) + ' : ' + types.map(([t, k]) => k + ' ' + NOMS_OUVERTURE[t][k > 1 ? 1 : 0]).join(', ');
  });
  const v = ouvertures.filter((o) => o.verifieeLe).length;
  return lignes.join(' · ') + (v ? ` (${v === ouvertures.length ? 'toutes vérifiées' : pluriel(v, 'vérifiée')})` : '');
}

const SOURCES_DIMENSIONS: Readonly<Record<NonNullable<ReleveFacade['dimensions']>['source'], string>> = { lidar: 'LiDAR', ign: 'IGN', cadastre: 'cadastre', saisie: 'saisie' };

/** La Facade validee en une ligne : ses dimensions et leur source, sa forme lue, la precision de sa texture, son parement. */
function texteFacadeValidee(r: ReleveFacade): string {
  const d = r.dimensions;
  if (!d) return '';
  const pointes = r.forme?.pointes?.length ?? 0;
  const forme = r.forme?.silhouetteLue ? 'haut : ' + libelleSilhouette(r.forme.silhouetteLue) + (pointes ? ', ' + pluriel(pointes, 'pointe') : '') : pointes ? pluriel(pointes, 'pointe') + ' lue' + (pointes > 1 ? 's' : '') : '';
  return [`${fr(d.largeurM)} × ${fr(d.egoutM)} m (${SOURCES_DIMENSIONS[d.source]})`, d.faitageM ? `faîtage ${fr(d.faitageM)} m` : '', forme,
    r.textureCalee ? `texture à ${Math.round(r.textureCalee.pxParM)} px/m` : '', r.surface ? 'parement : ' + r.surface.principale : ''].filter(Boolean).join(' · ');
}

/** L'ecart que la photo constate, au-dela du seuil : une alerte, jamais une correction (le plan et le LiDAR restent). */
function alerteDeLaPhoto(r: ReleveFacade): string {
  const e = r.dimensions?.ecartPhoto;
  const dits = [e?.largeur !== undefined && e.largeur > ALERTE_ECART ? `largeur à ${Math.round(e.largeur * 100)} %` : '', e?.egout !== undefined && e.egout > ALERTE_ECART ? `égout à ${Math.round(e.egout * 100)} %` : ''].filter(Boolean);
  return dits.length ? 'La photo s’écarte du plan (' + dits.join(', ') + ') : le plan et le LiDAR sont gardés.' : '';
}

export function sectionReleve(c: ContexteChamps): Section {
  const o = enPoints(c.obj);
  const facades = facadesDuContour(o.pts, c.elevationOf(c.obj));
  const champs: Champ[] = [
    {
      type: 'bouton',
      cle: 'photographier',
      libelle: '',
      nom: 'Photographier les façades',
      texte: () => 'Photographier les façades…',
      explication: 'Les photos se prennent dans l’audit de la parcelle : Plan redresse chaque mur, en retrouve les ouvertures et la forme du toit.',
      agit: { commande: 'facade.photographier' },
      executer: (cx) => {
        designerFacade(null);
        cx.executerCommande('facade.photographier');
      },
    },
  ];
  facades.forEach((f) => {
    const i = f.cote;
    const releve = () => (c.obj.batiment?.facades || []).find((r) => r.cote === i);
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
            const nom = o.segmentNames?.[i] ? `${nomDuCote(o.segmentNames[i], i)} · ` : '';
            // Une photo restee sur l'appareil du releve (io/photosLocales.ts) : les mesures sont la, pas l'image.
            const photo = r && r.photoLocale && !r.texture ? ' · photo restée sur l’appareil du relevé' : '';
            return r ? `${nom}${fr(f.largeur)} m · ${pluriel(r.ouvertures.length, 'ouverture')}${photo}` : `${nom}${fr(f.largeur)} m · non relevée`;
          },
        },
        // La Facade validee (V4, lot F5) : ses dimensions, sa forme, sa texture calee, et l'ecart que la photo constate, en alerte.
        {
          type: 'lecture',
          cle: 'facade',
          libelle: 'Façade',
          visible: () => !!releve()?.dimensions,
          valeur: () => { const r = releve(); return r ? texteFacadeValidee(r) : ''; },
          note: () => { const r = releve(); return r ? alerteDeLaPhoto(r) : ''; },
        },
        // La facade objet : les ouvertures relevees, par niveau, et celles que la personne a verifiees.
        {
          type: 'lecture',
          cle: 'ouvertures',
          libelle: 'Ouvertures',
          visible: () => !!releve()?.ouvertures.length,
          valeur: () => { const r = releve(); return r ? ouverturesParNiveau(r.ouvertures) : ''; },
        },
        {
          type: 'bouton',
          cle: 'photographier',
          libelle: 'Photographier',
          aide: `Photographier la façade ${f.orientation.toLowerCase()} dans l’audit de la parcelle`,
          agit: { commande: 'facade.photographier' },
          executer: (cx) => {
            designerFacade(i);
            cx.executerCommande('facade.photographier');
          },
        },
        {
          type: 'bouton',
          cle: 'modifier',
          libelle: 'Modifier',
          visible: () => !!releve(),
          aide: `Corriger les ouvertures de la façade ${f.orientation.toLowerCase()}`,
          agit: { commande: 'facade.modifier' },
          executer: (cx) => {
            designerFacade(i);
            cx.executerCommande('facade.modifier');
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

  return { id: 'releve', titre: 'Façades', champs };
}

/**
 * Le toit d'un batiment, a part de ses facades (audit de l'inspecteur, decision B2 : « Façades et toit » tenait en un bloc de plus
 * de deux ecrans au telephone, les reglages du toit apres une ligne par mur). C'est ce qu'on vient regler sur un batiment : la
 * section d'arrivee.
 */
export function sectionToit(): Section {
  return { id: 'toit', titre: 'Toit', principale: true, champs: champsDuToit() };
}
