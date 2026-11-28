// Section « Facades et toit » de l'inspecteur, pour un batiment (spec-releve-facade §4).
//
// Une ligne par mur : son orientation, sa longueur, ce que le releve en a retenu, et ses gestes : « Photographier » ouvre l'audit de
// la parcelle sur ce mur (les photos d'une facade se prennent dans l'audit, lot F6), « Modifier » l'editeur de son releve,
// « Retirer » le retire. Puis le toit, en champs ordinaires : la forme que la photo a proposee se corrige ici, comme n'importe quelle
// propriete.

import { enPoints } from '../../model/formes.js';
import { facadesDuContour } from '../../geometry/cotesVusDeDehors.js';
import { designerFacade } from '../../interaction/choixFacade.js';
import { LIBELLES_FORME_TOIT, COULEUR_TOIT_DEFAUT } from '../../facade/toits/toit.js';
import { volumesActifs, decrireVolumes } from '../../model/volumesToit.js';
import { modeToitActif } from '../../model/toitMesure.js';
import { repere, penteDominante } from '../../facade/toits/toitCorps.js';
import { materiauCouverture, type MateriauCouverture } from '../../model/couleurToit.js';
import { COUVERTURES_CHOISIES, POSES_COUVERTURE, poseAdmise } from '../../model/couvertureLue.js';
import { penteDuToit } from '../../model/volumesToit.js';
import { carteDuToit } from './carteToit.js';
import type { CorpsToit, CouvertureChoisie, OuvertureFacade, PoseCouverture, ReleveFacade, TerrasseToit, Toit } from '../../model/types.js';
import { libelleSilhouette } from '../../model/silhouetteFacade.js';
import { ALERTE_ECART } from '../../facade/releve/bilanFacade.js';
import { resumeDuToit, toitOuDefaut } from '../../facade/modeToit/gestes.js';
import type { Champ, ContexteChamps, Section } from './types.js';
import { estBatiment, parcelleDuProjet } from '../../model/fonctions.js';
import { champsBatiment } from '../../model/champsFonction.js';
import { nomDuCote } from '../nomCote.js';

/** Un batiment : le seul objet qui porte des facades et un toit. */
export { estBatiment };

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

const toitDe = (c: ContexteChamps): Toit => toitOuDefaut(c.obj);

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

export const LIBELLES_COUVERTURE: Record<MateriauCouverture, string> = {
  tuile: 'Tuile romane', 'tuile-plate': 'Tuile plate', 'tuile-canal': 'Tuile canal', ardoise: 'Ardoise', zinc: 'Zinc', 'bac-acier': 'Bac acier', membrane: 'Membrane d’étanchéité', vegetale: 'Toiture végétalisée', terrasse: 'Toit-terrasse',
};
/** Les motifs de pose (lot L2) : la grande ardoise en losange d'avant le schema 11 est une ardoise posee en losange. */
const LIBELLES_POSE: Record<PoseCouverture, string> = { droite: 'En rangs droits', losange: 'En losange', ecaille: 'En écaille' };

/**
 * Le materiau que Plan deduit, sans le choix de l'inspecteur : les memes indices que la 3D
 * (three/scene.ts, toitCorps3d.ts) - fichiers fonciers, couleur, pente du toit dessine, latitude.
 */
export function couvertureDeduite(c: ContexteChamps): MateriauCouverture {
  const o = c.obj;
  const toit = o.batiment?.toit;
  const corps = modeToitActif(o.batiment) === 'corps' && o.batiment?.corpsToit?.length ? o.batiment?.corpsToit : null;
  const pente = corps ? penteDominante(corps) : toit ? penteDuToit(enPoints(o).pts, toit) : null;
  const lat = (parcelleDuProjet(c.objets)?.cadastre as { origineLat?: unknown } | null | undefined)?.origineLat;
  const ff = (o.bdtopo as { materiauxToiture?: unknown } | null | undefined)?.materiauxToiture;
  return materiauCouverture(toit, { materiauxToiture: ff, pente, latitude: typeof lat === 'number' ? lat : null });
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

/** Le materiau de la couverture : deduit par defaut, impose s'il est choisi. */
function champMateriau(unSeul: (cc: ContexteChamps) => boolean): Champ {
  return {
    // Le materiau releve (fichiers fonciers, couleur, pente) se trompe parfois : une ardoise
    // grisee prise pour une tuile, un zinc inconnu des fichiers. Choisi, il l'emporte en 3D.
    type: 'choix',
    cle: 'toitMateriau',
    libelle: 'Matériau',
    // Un toit plat simple est un toit-terrasse : rien a choisir.
    visible: (cc) => !!cc.obj.batiment?.toit && !(unSeul(cc) && cc.obj.batiment?.toit.forme === 'plat'),
    historique: true,
    effets: ['scene3d', 'inspecteur'],
    aide: 'Automatique : le matériau déduit des fichiers fonciers, de la couleur et de la pente. Un autre choix l’emporte en 3D.',
    options: (cc) => {
      // Un mot hors du catalogue (fichier d'une version plus recente) reste dans le fichier et se dessine en tuile
      // (three/couverture.ts) : la liste le montre tel quel, sinon elle afficherait « Automatique » pour un choix qui n'en est pas un.
      const lu = cc.obj.batiment?.toit?.couverture as string | undefined;
      const inconnu = lu && !(COUVERTURES_CHOISIES as readonly string[]).includes(lu) ? [{ valeur: lu, libelle: 'Couverture inconnue (« ' + lu + ' »), dessinée en tuile' }] : [];
      return [
        { valeur: '', libelle: 'Automatique (' + LIBELLES_COUVERTURE[couvertureDeduite(cc)].toLowerCase() + ')' },
        ...COUVERTURES_CHOISIES.map((m) => ({ valeur: m, libelle: LIBELLES_COUVERTURE[m] })),
        ...inconnu,
      ];
    },
    lire: (cc) => cc.obj.batiment?.toit?.couverture ?? '',
    ecrire: (cc, v) => {
      const toit = toitDe(cc);
      if ((COUVERTURES_CHOISIES as readonly string[]).includes(v)) toit.couverture = v as CouvertureChoisie;
      else if (v !== toit.couverture) delete toit.couverture; // le mot inconnu repris tel quel reste dans le fichier
      // Une pose qui ne se dessine pas sur le nouveau materiau tombe : elle ne ressortirait pas a un autre choix.
      if (toit.pose && !poseAdmise(materiauDuChamp(cc, toit.couverture), toit.pose)) delete toit.pose;
    },
  };
}

/** Le materiau que dessine la 3D : celui choisi, sinon celui que Plan deduit. */
const materiauDuChamp = (cc: ContexteChamps, choix: CouvertureChoisie | undefined): MateriauCouverture => choix ?? couvertureDeduite(cc);

/**
 * Le motif de pose de la couverture (lot L2) : en rangs droits par defaut ; en losange sur l'ardoise, en ecaille sur l'ardoise et la
 * tuile plate (`poseAdmise`). Visible seulement quand le materiau en admet une autre.
 */
function champPose(unSeul: (cc: ContexteChamps) => boolean): Champ {
  const admises = (cc: ContexteChamps) => POSES_COUVERTURE.filter((p) => p === 'droite' || poseAdmise(materiauDuChamp(cc, cc.obj.batiment?.toit?.couverture), p));
  return {
    type: 'choix',
    cle: 'toitPose',
    libelle: 'Pose',
    visible: (cc) => !!cc.obj.batiment?.toit && !(unSeul(cc) && cc.obj.batiment?.toit.forme === 'plat') && admises(cc).length > 1,
    historique: true,
    effets: ['scene3d', 'inspecteur'],
    aide: 'Le motif des ardoises ou des tuiles plates : en rangs droits, en losange (ardoise), en écaille.',
    options: (cc) => admises(cc).map((p) => ({ valeur: p, libelle: LIBELLES_POSE[p] })),
    lire: (cc) => cc.obj.batiment?.toit?.pose ?? 'droite',
    ecrire: (cc, v) => {
      const toit = toitDe(cc);
      const p = POSES_COUVERTURE.find((x) => x === v);
      if (p && p !== 'droite' && poseAdmise(materiauDuChamp(cc, toit.couverture), p)) toit.pose = p;
      else delete toit.pose;
    },
  };
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

const champModifierToit: Champ = {
  type: 'bouton',
  cle: 'toitModifier',
  libelle: '',
  nom: 'Modifier le toit',
  texte: () => 'Modifier le toit…',
  explication: 'Ouvre l’atelier du toit sur ce bâtiment : sa forme, sa hauteur, son sens, ce qui se pose dessus ; rien ne change avant « Valider ».',
  agit: { commande: 'toit.modifier' },
  executer: (cx) => cx.executerCommande('toit.modifier'),
};

/** « Toit en 3D » : ce que la 3D montre du toit, quand le batiment en a plusieurs lectures (corps du LiDAR, surface mesuree, volumes). */
function champModeToit(mode: (cc: ContexteChamps) => string, corps: (cc: ContexteChamps) => boolean): Champ {
  return {
    type: 'choix',
    cle: 'toitMode',
    libelle: 'Toit en 3D',
    visible: (cc) => !!cc.obj.batiment?.toitMesure || corps(cc),
    // Du mode expert (audit de l'inspecteur, decision B1) : la 3D choisit elle-meme ce qu'elle montre du toit. Un mode choisi a la
    // main, autre que celui qu'elle prendrait seule, reste montre.
    expert: true,
    resteMontre: (cc) => {
      const b = cc.obj.batiment;
      if (!b?.modeToit) return false;
      const seule = { ...b };
      delete seule.modeToit;
      return modeToitActif(seule) !== modeToitActif(b);
    },
    historique: true,
    effets: ['scene3d', 'inspecteur'],
    aide: 'Corps et pignons : les corps du bâtiment lus sur le LiDAR HD de l’IGN, chacun son faîtage et ses égouts aux hauteurs de ses murs, avec les pignons qui partent du faîtage. Tel que mesuré : la surface relevée à 50 cm, nettoyée des arbres — fidèle, même à un toit compliqué. Un toit par corps : le contour découpé en rectangles, chacun son toit simple. Un seul toit : une forme simple sur tout le contour, que l’on règle ci-dessous',
    options: (cc) => [
      ...(cc.obj.batiment?.corpsToit?.length ? [{ valeur: 'corps', libelle: 'Corps et pignons (LiDAR)' }] : []),
      ...(cc.obj.batiment?.toitMesure ? [{ valeur: 'mesure', libelle: 'Tel que mesuré (LiDAR)' }] : []),
      ...(corps(cc) ? [{ valeur: 'volumes', libelle: 'Un toit par corps' }] : []),
      { valeur: 'simple', libelle: 'Un seul toit' },
    ],
    lire: (cc) => mode(cc),
    ecrire: (cc, v) => { champsBatiment(cc.obj).modeToit = v === 'corps' || v === 'mesure' || v === 'volumes' ? v : 'simple'; },
  };
}

/** Les champs du toit : les corps de batiment, puis le toit unique (forme, hauteur, faitage, couverture). */
function champsDuToit(): Champ[] {
  // Le toit unique ne se montre que si c'est lui que la 3D dessine : en surface mesuree ou en
  // plusieurs corps, ses reglages se cachent, la description du toit montre les remplace.
  const mode = (cc: ContexteChamps) => modeToitActif(cc.obj.batiment);
  const unSeul = (cc: ContexteChamps) => mode(cc) === 'simple';
  const aToit = (cc: ContexteChamps) => !!cc.obj.batiment?.toit && unSeul(cc);
  const corps = (cc: ContexteChamps) => (cc.obj.batiment?.volumesToit?.length ?? 0) >= 2;
  return [
    champToit,
    champModifierToit,
    champModeToit(mode, corps),
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
    {
      type: 'couleur',
      cle: 'toitCouleur',
      libelle: 'Couverture',
      visible: aToit,
      historique: true,
      effets: effetsToit,
      lire: (cc) => cc.obj.batiment?.toit?.couleur || COULEUR_TOIT_DEFAUT,
      note: (cc) => origineCouleur(cc.obj.batiment?.toit),
      ecrire: (cc, v) => {
        const toit = toitDe(cc);
        toit.couleur = v;
        // Choisie : plus rien ne la recalcule, ni l'orthophoto ni l'actualisation.
        delete toit.origineCouleur;
      },
    },
    champMateriau(unSeul),
    champPose(unSeul),
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
