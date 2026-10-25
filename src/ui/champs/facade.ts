// Section « Facades et toit » de l'inspecteur, pour un batiment (spec-releve-facade §4).
//
// Une ligne par mur : son orientation, sa longueur, ce que le releve en a retenu, et le bouton qui
// ouvre le releve sur ce mur. Puis le toit, en champs ordinaires : la forme que la photo a proposee
// se corrige ici, comme n'importe quelle propriete.

import { enPoints } from '../../model/formes.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import { designerFacade } from '../../interaction/choixFacade.js';
import { saillieArmee, viserSaillie } from '../../interaction/choixSaillie.js';
import { angleDuPlusLongCote, penteDeg, formesAuChoix, LIBELLES_FORME_TOIT, COULEUR_TOIT_DEFAUT } from '../../facade/toits/toit.js';
import { volumesActifs, decrireVolumes } from '../../model/volumesToit.js';
import { modeToitActif } from '../../model/toitMesure.js';
import { repere, penteDominante } from '../../facade/toits/toitCorps.js';
import { materiauCouverture, type MateriauCouverture } from '../../model/couleurToit.js';
import { penteDuToit } from '../../model/volumesToit.js';
import { carteDuToit } from './carteToit.js';
import { formeDuCorps } from '../../facade/regles/toits/faits.js';
import type { CorpsToit, CouvertureChoisie, FormeSaillie, FormeToit, SaillieFacade, TerrasseToit, Toit } from '../../model/types.js';
import { HAUTEUR_BOW_MAX_M, NOM_SAILLIE, RETRAIT_GALERIE_M, murDuCorps, replacerSaillie, retirerSaillie } from '../../facade/modeToit/saillies.js';
import type { Champ, ContexteChamps, Section } from './types.js';
import { estBatiment, parcelleDuProjet } from '../../model/fonctions.js';

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

/** Les rangs des corps du batiment qui sont des appentis (le reglage « ouvert / ferme » ne vaut que pour eux). */
const indicesAppentis = (o: { corpsToit?: CorpsToit[] | null }): number[] => (o.corpsToit ?? []).flatMap((c, i) => (!c.saillie && formeDuCorps(c) === 'appentis' ? [i] : []));

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
  tuile: 'Tuile romane', 'tuile-plate': 'Tuile plate', 'tuile-canal': 'Tuile canal', ardoise: 'Ardoise', 'ardoise-losange': 'Grande ardoise en losange', zinc: 'Zinc', terrasse: 'Toit-terrasse',
};
const COUVERTURES_CHOISIES: CouvertureChoisie[] = ['tuile', 'tuile-plate', 'tuile-canal', 'ardoise', 'ardoise-losange', 'zinc'];

/**
 * Le materiau que Plan deduit, sans le choix de l'inspecteur : les memes indices que la 3D
 * (three/scene.ts, toitCorps3d.ts) - fichiers fonciers, couleur, pente du toit dessine, latitude.
 */
export function couvertureDeduite(c: ContexteChamps): MateriauCouverture {
  const o = c.obj;
  const toit = o.toit;
  const corps = modeToitActif(o) === 'corps' && o.corpsToit?.length ? o.corpsToit : null;
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

/** D'ou vient la hauteur d'un toit deduit de la BD TOPO ou du LiDAR : on dit que c'est une estimation. */
function origineHauteur(toit: Toit): string {
  if (toit.source === 'lidar') return ' · ajustée sur le LiDAR HD de l’IGN';
  if (toit.source !== 'bdtopo') return '';
  return toit.estime ? ' · estimée : pas de hauteur dans la BD TOPO' : ' · déduite de la BD TOPO (± 1 m)';
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
    visible: (cc) => !!cc.obj.toit && !(unSeul(cc) && cc.obj.toit.forme === 'plat'),
    historique: true,
    effets: ['scene3d', 'inspecteur'],
    aide: 'Automatique : le matériau déduit des fichiers fonciers, de la couleur et de la pente. Un autre choix l’emporte en 3D.',
    options: (cc) => [
      { valeur: '', libelle: 'Automatique (' + LIBELLES_COUVERTURE[couvertureDeduite(cc)].toLowerCase() + ')' },
      ...COUVERTURES_CHOISIES.map((m) => ({ valeur: m, libelle: LIBELLES_COUVERTURE[m] })),
    ],
    lire: (cc) => cc.obj.toit?.couverture ?? '',
    ecrire: (cc, v) => {
      const toit = toitDe(cc);
      if ((COUVERTURES_CHOISIES as string[]).includes(v)) toit.couverture = v as CouvertureChoisie;
      else delete toit.couverture;
    },
  };
}

/**
 * Un appentis (galerie, porche) ouvert ou ferme : meme reglage que la ligne « Appentis de … » de l'avant / apres, sans passer par l'audit.
 * Il s'ecrit sur tous les appentis du batiment ; « sans indication » retire la cle (le dessin du toit seul).
 */
function champAppentis(mode: (cc: ContexteChamps) => string): Champ {
  const vus = (cc: ContexteChamps) => new Set(indicesAppentis(cc.obj).map((i) => (cc.obj.corpsToit?.[i] as CorpsToit).ouvert));
  return {
    type: 'choix',
    cle: 'appentisOuvert',
    libelle: 'Appentis',
    visible: (cc) => mode(cc) === 'corps' && indicesAppentis(cc.obj).length > 0,
    historique: true,
    effets: ['scene3d', 'inspecteur'],
    aide: 'Ouvert : une galerie ou un porche, des poteaux et pas de mur extérieur. Fermé : des murs du sol à l’égout et aux bouts. Sans indication : le dessin du toit seul.',
    options: () => [{ valeur: '', libelle: 'Sans indication' }, { valeur: 'ouvert', libelle: 'Ouvert (galerie, porche)' }, { valeur: 'ferme', libelle: 'Fermé' }],
    lire: (cc) => { const v = vus(cc); return v.size === 1 ? (v.has(true) ? 'ouvert' : v.has(false) ? 'ferme' : '') : ''; },
    note: (cc) => (vus(cc).size > 1 ? 'les appentis du bâtiment ne sont pas tous réglés pareil' : ''),
    ecrire: (cc, v) => {
      const cibles = new Set(indicesAppentis(cc.obj));
      cc.obj.corpsToit = (cc.obj.corpsToit ?? []).map((k, i) => {
        if (!cibles.has(i)) return k;
        const neuf = { ...k };
        delete neuf.ouvert;
        return v === 'ouvert' ? { ...neuf, ouvert: true } : v === 'ferme' ? { ...neuf, ouvert: false } : neuf;
      });
    },
  };
}

/** Les rangs des corps qui sont des elements de facade (bow-window, galerie, appentis poses sur un mur). */
const rangsSaillies = (o: { corpsToit?: CorpsToit[] | null }): number[] => (o.corpsToit ?? []).flatMap((c, i) => (c.saillie ? [i] : []));

/**
 * Une ligne par element de facade du batiment : ses reglages (forme, niveau, toit propre, mur, position, taille) et son retrait.
 * Chaque ecriture replace l'element sur son mur (facade/modeToit/saillies.ts), fige le toit et s'annule par Ctrl+Z.
 */
function champsSaillies(c: ContexteChamps): Champ[] {
  return rangsSaillies(c.obj).map((rang): Champ => {
    const lire = (cc: ContexteChamps) => cc.obj.corpsToit?.[rang]?.saillie;
    const regler = (cc: ContexteChamps, changement: Partial<SaillieFacade>) => {
      cc.obj.corpsToit = replacerSaillie(cc.obj.corpsToit ?? [], rang, changement);
      cc.obj.toitFige = true;
    };
    const genre = lire(c)?.genre ?? 'bow-window';
    const bow = genre === 'bow-window';
    const nombre = (cle: string, libelle: string, cle2: 'largeurM' | 'profondeurM' | 'centreM', min: number, max: (cc: ContexteChamps) => number): Champ => ({
      type: 'nombre', cle, libelle, unite: 'm', pas: 0.1, min, decimales: 2, historique: true, effets: ['scene3d', 'inspecteur'],
      lire: (cc) => lire(cc)?.[cle2] ?? 0, ecrire: (cc, v) => { regler(cc, { [cle2]: Math.min(v, max(cc)) }); }
    });
    const murLong = (cc: ContexteChamps) => { const s = lire(cc); const h = s ? cc.obj.corpsToit?.[s.hote] : undefined; return h && s ? murDuCorps(h, s.mur).L : 10; };
    return {
      type: 'ligne', cle: 'saillie' + rang, libelle: NOM_SAILLIE[genre],
      champs: [
        { type: 'choix', cle: 'mur', libelle: 'Mur', historique: true, effets: ['scene3d', 'inspecteur'], aide: 'Le mur du corps qui porte l’élément, dans l’ordre du contour',
          options: (cc) => { const h = cc.obj.corpsToit?.[lire(cc)?.hote ?? 0]; return (h?.pts ?? []).map((_, i) => ({ valeur: String(i), libelle: 'Mur ' + (i + 1) })); },
          lire: (cc) => String(lire(cc)?.mur ?? 0), ecrire: (cc, v) => { regler(cc, { mur: Number(v), centreM: murDuCorps(cc.obj.corpsToit?.[lire(cc)?.hote ?? 0] as CorpsToit, Number(v)).L / 2 }); } },
        ...(bow ? [
          { type: 'choix', cle: 'forme', libelle: 'Forme', historique: true, effets: ['scene3d', 'inspecteur'], aide: 'Pans coupés, rectangle, demi-cercle (arc) ou rectangle aux angles arrondis (congé)',
            options: () => [{ valeur: 'pans', libelle: 'Pans coupés' }, { valeur: 'rectangle', libelle: 'Rectangle' }, { valeur: 'arc', libelle: 'Arc de cercle' }, { valeur: 'conge', libelle: 'Congé' }],
            lire: (cc) => lire(cc)?.forme ?? 'rectangle', ecrire: (cc, v) => { regler(cc, { forme: v as FormeSaillie }); } } satisfies Champ,
          { type: 'choix', cle: 'niveau', libelle: 'Niveau', historique: true, effets: ['scene3d', 'inspecteur'], aide: 'Un étage de haut, ou jusqu’à l’égout de la maison ; choisir un niveau reprend sa hauteur (efface la hauteur réglée)',
            options: () => [{ valeur: 'rdc', libelle: 'Un étage' }, { valeur: 'toit', libelle: 'Jusqu’à l’égout de la maison' }],
            lire: (cc) => lire(cc)?.niveau ?? 'rdc', ecrire: (cc, v) => { regler(cc, { niveau: v === 'toit' ? 'toit' : 'rdc', hauteurM: undefined }); } } satisfies Champ,
          { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur à l’égout', unite: 'm', pas: 0.1, min: 1, max: HAUTEUR_BOW_MAX_M, decimales: 2, historique: true, effets: ['scene3d', 'inspecteur'],
            aide: 'La hauteur des murs du bow-window, du sol à son égout ; un niveau choisi la remplace',
            note: (cc) => (lire(cc)?.hauteurM === undefined ? 'celle du niveau' : 'réglée'),
            lire: (cc) => cc.obj.corpsToit?.[rang]?.egouts[0] ?? 0, ecrire: (cc, v) => { regler(cc, { hauteurM: Math.min(Math.max(v, 1), HAUTEUR_BOW_MAX_M) }); } } satisfies Champ
        ] : []),
        { type: 'choix', cle: 'toit', libelle: 'Toit', historique: true, effets: ['scene3d', 'inspecteur'], aide: 'Le toit propre de l’élément : un pan contre le mur, quatre pans ou plat',
          options: () => [{ valeur: 'pan', libelle: 'Un pan' }, { valeur: 'pavillon', libelle: 'Quatre pans' }, { valeur: 'plat', libelle: 'Plat' }],
          lire: (cc) => lire(cc)?.toit ?? 'pan', ecrire: (cc, v) => { regler(cc, { toit: v === 'plat' ? 'plat' : v === 'pavillon' ? 'pavillon' : 'pan' }); } },
        nombre('largeur', 'Largeur', 'largeurM', 0.6, murLong),
        nombre('saillie', 'Saillie', 'profondeurM', 0.3, () => 6),
        nombre('position', 'Position sur le mur', 'centreM', 0, murLong),
        ...(genre === 'galerie' ? [{
          type: 'nombre', cle: 'retrait', libelle: 'Retrait des poteaux', unite: 'm', pas: 0.05, min: 0, max: 1, decimales: 2, historique: true, effets: ['scene3d', 'inspecteur'],
          aide: 'Le recul des poteaux depuis le bord de l’égout',
          lire: (cc) => cc.obj.corpsToit?.[rang]?.retraitM ?? RETRAIT_GALERIE_M,
          ecrire: (cc, v) => { const k = cc.obj.corpsToit?.[rang]; if (k) { k.retraitM = Math.min(Math.max(v, 0), 1); cc.obj.toitFige = true; } }
        } satisfies Champ] : []),
        { type: 'bouton', cle: 'mur3d', libelle: 'Mur dans la 3D', texte: () => (saillieArmee() ? 'Touchez un mur…' : 'Choisir le mur dans la 3D'), aide: 'Touchez ensuite un mur du bâtiment dans la vue 3D pour y poser l’élément (Échap pour annuler)',
          agit: { commande: 'toit.murSur3d' }, executer: (cc) => { viserSaillie(rang); cc.executerCommande('toit.murSur3d'); } },
        { type: 'bouton', cle: 'retirer', libelle: 'Retirer', aide: 'Retirer cet élément (Ctrl+Z pour revenir)', agit: 'projet',
          executer: (cc) => { cc.pushHistory(); cc.obj.corpsToit = retirerSaillie(cc.obj.corpsToit ?? [], rang); cc.obj.toitFige = true; cc.render(); } }
      ]
    };
  });
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
      aide: 'Corps et pignons : les corps du bâtiment lus sur le LiDAR HD de l’IGN, chacun son faîtage et ses égouts aux hauteurs de ses murs, avec les pignons qui partent du faîtage. Tel que mesuré : la surface relevée à 50 cm, nettoyée des arbres — fidèle, même à un toit compliqué. Un toit par corps : le contour découpé en rectangles, chacun son toit simple. Un seul toit : une forme simple sur tout le contour, que l’on règle ci-dessous',
      options: (cc) => [
        ...(cc.obj.corpsToit?.length ? [{ valeur: 'corps', libelle: 'Corps et pignons (LiDAR)' }] : []),
        ...(cc.obj.toitMesure ? [{ valeur: 'mesure', libelle: 'Tel que mesuré (LiDAR)' }] : []),
        ...(corps(cc) ? [{ valeur: 'volumes', libelle: 'Un toit par corps' }] : []),
        { valeur: 'simple', libelle: 'Un seul toit' },
      ],
      lire: (cc) => mode(cc),
      ecrire: (cc, v) => { cc.obj.modeToit = v === 'corps' || v === 'mesure' || v === 'volumes' ? v : 'simple'; },
    },
    {
      type: 'carte',
      cle: 'toitCarte',
      libelle: '',
      nom: 'Carte des hauteurs mesurées et découpage du toit',
      visible: (cc) => !!cc.obj.toitMesure,
      carte: (cc) => carteDuToit(cc.obj),
    },
    {
      type: 'lecture',
      cle: 'toitCorpsLus',
      libelle: 'Corps',
      visible: (cc) => mode(cc) === 'corps',
      valeur: (cc) => decrireCorps(cc.obj.corpsToit ?? []).join(' · '),
    },
    champAppentis(mode),
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
        // Les formes simples seules, celles que la 3D dessine ; une forme du catalogue en place reste proposee.
        ...formesAuChoix(cc.obj.toit?.forme).map((k) => ({ valeur: k, libelle: LIBELLES_FORME_TOIT[k] })),
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
    champMateriau(unSeul),
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
            // Une photo restee sur l'appareil du releve (io/photosLocales.ts) : les mesures sont la, pas l'image.
            const photo = r && r.photoLocale && !r.texture ? ' · photo restée sur l’appareil du relevé' : '';
            return r ? `${nom}${fr(f.largeur)} m · ${pluriel(r.ouvertures.length, 'ouverture')}${photo}` : `${nom}${fr(f.largeur)} m · non relevée`;
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

  champs.push(...champsSaillies(c), ...champsDuToit());
  return { id: 'releve', titre: 'Façades et toit', champs };
}
