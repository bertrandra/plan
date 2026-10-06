// Dossier de mairie d'une piscine (export/) : la declaration prealable ou le permis de construire.
//
// Ce document est celui qu'on depose au service de l'urbanisme, pas celui qu'on donne a
// l'artisan (dossierPdf.ts). Il suit la liste des pieces du cerfa, dans leur ordre :
//
//   1. la notice : le projet decrit, le regime d'autorisation, la liste des pieces, et l'aide au
//      remplissage du cerfa (chaque rubrique du formulaire avec la valeur lue dans le plan) ;
//   2. DP1, le plan de situation : la parcelle et son voisinage, le lieu, la reference cadastrale ;
//   3. DP2, le plan de masse cote : la parcelle, le bati, le bassin et ses abords, et les distances
//      du bassin a chaque limite — ce que l'instructeur verifie en premier ;
//   4. DP3, le plan en coupe : le terrain naturel, le bassin, les parois, les margelles, la plage,
//      avec les profondeurs et la hauteur hors du sol ; et, hors-sol, l'elevation ;
//   5. les pieces a fournir par le demandeur : l'insertion (DP6) et les photos (DP7, DP8), en
//      cadres a remplir — Plan ne les a pas ;
//   6. en annexe, la note de calcul (engine/piscine.ts).
//
// Le cerfa lui-meme n'est pas rempli ici : c'est un formulaire officiel qui change de version, et
// un PDF ecrit a la main ne sait pas en remplir les champs. La page d'aide donne a la place chaque
// valeur a reporter, dans l'ordre des rubriques. Les pages d'un plan choisissent leur echelle pour
// tenir dans la feuille, comme le dossier des terrasses.

import { au } from '../util/tableaux.js';
import { centroid, dist, pointInPolygon, shoelace, signedArea } from '../geometry/basic.js';
import {
  A4_L, A4_H, MARGE_PDF, PT_PAR_METRE, assemblerPDF, pdfTexte as pdfTexteBrut, pdfPolygone, pdfCercle, pdfFlecheNord, pdfEchelleGraphique, echelleQuiTient, hexToRgb01,
  type PagePdf, type Rgb01
} from './pdf/writer.js';
import {
  calculerPiscine, EPAISSEUR_MARGELLE_M, fr, LIBELLE_FOND, LIBELLE_IMPLANTATION, LIBELLE_LOCAL, LIBELLE_PLAGE, LIBELLE_REGIME, LIBELLE_REVETEMENT,
  LIBELLE_SECURITE, LIBELLE_STRUCTURE, noteDeCalcul, piscinesDu, PROFILS_STRUCTURE, REVANCHE_M, SEUIL_PERMIS_M2, TAXE_AMENAGEMENT_M2,
  type PiscineCalculee, type SectionNote
} from '../engine/piscine.js';
import { lieuDeParcelle } from '../model/lieu.js';
import { estTerrain, parcelleDuProjet } from '../model/fonctions.js';
import { sommetsDe } from '../model/formes.js';
import { altitudeNGF, reliefDe, resumeRelief } from '../model/relief.js';
import type { ObjetPlan, PtBrut, Relief } from '../model/types.js';

export interface MetaDossierPiscine {
  appVersion: string;
  nomProjet?: string | null | undefined;
  /** La date du jour, en toutes lettres. Injectable pour qu'un test ne depende pas du calendrier. */
  dateDuJour?: () => string;
}

export interface DossierPiscine {
  pdf: string;
  pages: number;
  piscine: ObjetPlan;
  regime: PiscineCalculee['regime'];
}

type Projeteur = (p: PtBrut) => { x: number; y: number };

const ENCRE: Rgb01 = [0.15, 0.12, 0.08];
const ENCRE_DOUCE: Rgb01 = [0.35, 0.3, 0.24];
const ENCRE_COTE: Rgb01 = [0.23, 0.18, 0.12];
const GRIS: Rgb01 = [0.72, 0.7, 0.66];
const BLEU: Rgb01 = [0.36, 0.72, 0.9];
const PIERRE: Rgb01 = [0.85, 0.82, 0.76];
const TERRE: Rgb01 = [0.78, 0.7, 0.58];
const BOIS: Rgb01 = [0.72, 0.56, 0.36];

const nb = (v: number) => v.toFixed(2);

/**
 * La police standard du PDF (Helvetica, encodage de base) ne porte ni exposants, ni signes
 * typographiques, ni l'euro : on les ecrit en toutes lettres. Les accents sont traites par
 * `pdfEscape` ; ceci s'applique a tout texte de ce dossier avant lui.
 */
const TRANSLIT: Record<string, string> = {
  '²': '2', '³': '3', '×': 'x', '·': '.', 'ρ': 'rho', '≈': '~', '≤': '<=', '≥': '>=', 'Ø': 'diam. ', '—': '-', '–': '-',
  '«': '"', '»': '"', '’': "'", '€': 'EUR', '½': '1/2', '…': '...', '→': '->'
};
const translit = (txt: unknown): string => String(txt).split('').map(ch => TRANSLIT[ch] ?? ch).join('');
const pdfTexte = (x: number, y: number, taille: number, txt: unknown, couleur?: Rgb01, angleDeg?: number): string =>
  pdfTexteBrut(x, y, taille, translit(txt), couleur, angleDeg);
const largeurTexte = (txt: string, taille: number): number => translit(txt).length * taille * 0.5;

/** Un trait, en points de page. */
function ligne(a: { x: number; y: number }, b: { x: number; y: number }, epaisseur = 0.6, couleur: Rgb01 = ENCRE_COTE, pointille = false): string {
  return couleur.map(nb).join(' ') + ' RG ' + epaisseur.toFixed(2) + ' w [' + (pointille ? '3 2' : '') + '] 0 d\n' +
    nb(a.x) + ' ' + nb(a.y) + ' m ' + nb(b.x) + ' ' + nb(b.y) + ' l S\n[] 0 d\n';
}

/** Une cote entre deux points de page : trait, deux attaches, la valeur au milieu, decalee du cote `n`. */
function cote(pa: { x: number; y: number }, pb: { x: number; y: number }, texte: string, decalage: number, taille = 7): string {
  const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L * decalage, ny = dx / L * decalage;
  const la = { x: pa.x + nx, y: pa.y + ny }, lb = { x: pb.x + nx, y: pb.y + ny };
  let c = ligne(pa, { x: pa.x + nx * 1.15, y: pa.y + ny * 1.15 }, 0.4) + ligne(pb, { x: pb.x + nx * 1.15, y: pb.y + ny * 1.15 }, 0.4) + ligne(la, lb, 0.7);
  let ang = Math.atan2(dy, dx) * 180 / Math.PI;
  let ux = dx / L, uy = dy / L;
  if (ang > 90 || ang < -90) { ang += 180; ux = -ux; uy = -uy; }
  const larg = largeurTexte(texte, taille), mid = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
  const sens = decalage >= 0 ? 1 : -1;
  c += pdfTexte(mid.x - ux * larg / 2 + (nx / Math.abs(decalage || 1)) * 4 * sens, mid.y - uy * larg / 2 + (ny / Math.abs(decalage || 1)) * 4 * sens, taille, texte, ENCRE_COTE, Math.abs(ang) < 0.5 ? undefined : ang);
  return c;
}

/** Un paragraphe coupe aux mots dans une largeur, de haut en bas ; rend la hauteur consommee. */
function paragraphe(x: number, y: number, largeur: number, taille: number, texte: string, couleur: Rgb01 = ENCRE): { c: string; h: number } {
  const mots = texte.split(/\s+/);
  const lignes: string[] = [];
  let courante = '';
  mots.forEach(m => {
    const essai = courante ? courante + ' ' + m : m;
    if (largeurTexte(essai, taille) > largeur && courante) { lignes.push(courante); courante = m; } else courante = essai;
  });
  if (courante) lignes.push(courante);
  const interligne = taille * 1.3;
  let c = '';
  lignes.forEach((l, i) => { c += pdfTexte(x, y - i * interligne, taille, l, couleur); });
  return { c, h: lignes.length * interligne };
}

/** Un curseur de page : ecrit de haut en bas, ouvre une page nouvelle quand le bas est atteint. */
class Ecrivain {
  pages: PagePdf[] = [];
  private c = '';
  private y = 0;
  constructor(private readonly meta: MetaDossierPiscine, private readonly titreCourant: string) { this.nouvellePage(); }
  private nouvellePage(): void {
    if (this.c) this.pages.push({ l: A4_L, h: A4_H, contenu: this.c + pied(this.meta) });
    this.c = pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 4, 7, this.titreCourant + (this.pages.length ? ' (suite)' : ''), GRIS);
    this.y = A4_H - MARGE_PDF - 24;
  }
  place(h: number): void { if (this.y - h < MARGE_PDF + 10) this.nouvellePage(); }
  titre(t: string, taille = 15): void { this.place(taille + 10); this.c += pdfTexte(MARGE_PDF, this.y, taille, t); this.y -= taille + 8; }
  sousTitre(t: string): void {
    this.place(26);
    this.y -= 6;
    this.c += pdfTexte(MARGE_PDF, this.y, 10.5, t);
    this.c += ligne({ x: MARGE_PDF, y: this.y - 4 }, { x: A4_L - MARGE_PDF, y: this.y - 4 }, 0.7);
    this.y -= 18;
  }
  texte(t: string, taille = 8.5, couleur: Rgb01 = ENCRE, retrait = 0): void {
    const p = paragraphe(MARGE_PDF + retrait, this.y, A4_L - 2 * MARGE_PDF - retrait, taille, t, couleur);
    this.place(p.h + 4);
    // La page a pu changer : on re-ecrit a la position courante.
    const q = paragraphe(MARGE_PDF + retrait, this.y, A4_L - 2 * MARGE_PDF - retrait, taille, t, couleur);
    this.c += q.c; this.y -= q.h + 3;
  }
  /** Une ligne de tableau a deux ou trois colonnes : libelle, valeur, note eventuelle en dessous. */
  rangee(libelle: string, valeur: string, note?: string): void {
    const colB = MARGE_PDF + 150, largeurB = A4_L - MARGE_PDF - colB;
    const pv = paragraphe(colB, this.y, largeurB, 8.5, valeur);
    const pn = note ? paragraphe(colB, this.y - pv.h, largeurB, 7, note, ENCRE_DOUCE) : null;
    const h = pv.h + (pn ? pn.h : 0) + 4;
    this.place(h);
    this.c += pdfTexte(MARGE_PDF, this.y, 8.5, libelle, ENCRE_DOUCE);
    this.c += paragraphe(colB, this.y, largeurB, 8.5, valeur).c;
    if (note) this.c += paragraphe(colB, this.y - pv.h, largeurB, 7, note, ENCRE_DOUCE).c;
    this.y -= h;
    this.c += ligne({ x: MARGE_PDF, y: this.y + 3 }, { x: A4_L - MARGE_PDF, y: this.y + 3 }, 0.3, GRIS);
    this.y -= 4;
  }
  case(texte: string, cochee: boolean): void {
    this.place(14);
    this.c += '0.23 0.18 0.12 RG 0.6 w ' + nb(MARGE_PDF) + ' ' + nb(this.y - 1) + ' 7 7 re S\n';
    if (cochee) this.c += pdfTexte(MARGE_PDF + 1.2, this.y, 7.5, 'x');
    this.c += pdfTexte(MARGE_PDF + 12, this.y, 8.5, texte);
    this.y -= 13;
  }
  espace(h: number): void { this.y -= h; }
  terminer(): PagePdf[] { this.nouvellePage(); return this.pages; }
}

function pied(meta: MetaDossierPiscine): string {
  const date = (meta.dateDuJour || (() => new Date().toLocaleDateString('fr-FR')))();
  return pdfTexte(MARGE_PDF, MARGE_PDF - 8, 7, 'Genere le ' + date + ' - dimensions en metres - Plan interactif v' + meta.appVersion + ' - document d\'aide, a verifier par le demandeur', [0.5, 0.45, 0.4]);
}

/** Les surfaces d'urbanisme : le bassin fait emprise au sol, la plage et les margelles au sol non. */
function surfaces(calc: PiscineCalculee) {
  const r = calc.reglages;
  const localMaconne = r.local === 'maconne';
  return {
    bassin: calc.surface,
    empriseCreee: calc.surface + (localMaconne ? 4 : 0),
    plancherCreee: localMaconne ? 4 : 0,
    noteLocal: localMaconne ? 'Local technique maçonné compté pour 4 m² : à remplacer par ses dimensions réelles.' : ''
  };
}

// ---- 1. Notice et aide au cerfa --------------------------------------------------------------

function pagesNotice(objets: ObjetPlan[], piscine: ObjetPlan, calc: PiscineCalculee, meta: MetaDossierPiscine): PagePdf[] {
  const r = calc.reglages;
  const parcelle = parcelleDuProjet(objets);
  const lieu = lieuDeParcelle(parcelle);
  const cad = parcelle?.cadastre as { commune?: string; section?: string; numero?: string; contenance?: number } | null | undefined;
  const plu = parcelle?.plu;
  const permis = calc.regime === 'permis';
  const cerfa = permis ? 'cerfa n° 13406 (permis de construire pour une maison individuelle et/ou ses annexes)' : 'cerfa n° 13703 (déclaration préalable - construction et travaux non soumis à permis de construire portant sur une maison individuelle et/ou ses annexes)';
  const prefixe = permis ? 'PCMI' : 'DP';
  const e = new Ecrivain(meta, 'Dossier piscine - notice');
  e.titre(permis ? 'Permis de construire - Piscine' : 'Déclaration préalable - Piscine');
  e.texte((meta.nomProjet || parcelle?.name || 'Projet') + ' - ' + piscine.name + ' - ' + lieu.nom + (cad ? ' - parcelle ' + [cad.section, String(cad.numero || '').replace(/^0+/, '')].filter(Boolean).join(' ') : ''), 9.5, ENCRE_DOUCE);
  e.espace(4);

  e.sousTitre('Régime d\'autorisation');
  e.rangee('Formalité', LIBELLE_REGIME[calc.regime], calc.regime === 'aucune'
    ? 'Sous 10 m² de plan d\'eau, hors secteur protégé, aucune autorisation n\'est demandée ; ce dossier reste utile au PLU et aux voisins.'
    : 'Bassin de ' + fr(calc.surface, 1) + ' m² : ' + (permis ? 'plus de ' + SEUIL_PERMIS_M2 + ' m², permis de construire.' : 'de 10 à 100 m², déclaration préalable.') + (r.securite === 'abri' ? ' Un abri de plus de 1,80 m de haut fait passer le projet en permis.' : ''));
  e.rangee('Formulaire', cerfa, 'À télécharger sur service-public.fr dans sa dernière version, ou à déposer en ligne sur le guichet numérique de la commune.');
  e.rangee('Délai d\'instruction', permis ? '2 mois (3 mois en secteur protégé)' : '1 mois (2 mois en secteur protégé)', 'À compter du dépôt complet ; le silence vaut accord, sauf en secteur protégé où une décision expresse est nécessaire pour la DP.');
  if (plu?.zones.length) e.rangee('Zone du PLU', plu.zones.map(z => z.libelle).join(', ') + (plu.document ? ' - ' + plu.document.nom : ''), 'Lire le règlement de zone : implantation par rapport aux limites, aspect, clôtures, emprise au sol maximale.');
  if (calc.secteurProtege) e.rangee('Secteur protégé', 'Oui : avis de l\'architecte des Bâtiments de France', 'Site patrimonial remarquable ou abords d\'un monument historique (servitudes AC1, AC2, AC4).');
  e.rangee('Taxe d\'aménagement', fr(calc.taxeAmenagementBase, 0) + ' € de base (' + TAXE_AMENAGEMENT_M2 + ' €/m² × ' + fr(calc.surface, 1) + ' m²)', 'Montant = base × (taux communal + taux départemental). Avis dans les 6 mois suivant l\'autorisation.');
  e.rangee('Après les travaux', 'DAACT, puis déclaration foncière H1 (cerfa n° 6650) dans les 90 jours', 'Le bassin entre dans la valeur locative ; déclaré à temps, il est exonéré de taxe foncière deux ans.');

  e.sousTitre('Description du projet (notice ' + prefixe + (permis ? '4' : '') + ')');
  const horsSol = calc.hauteurHorsSol > 0.01;
  const description = 'Création d\'une piscine ' + LIBELLE_IMPLANTATION[r.implantation].toLowerCase() + ' de ' + fr(calc.surface, 1) + ' m² de plan d\'eau'
    + (piscine.type === 'circle' ? ' (bassin rond de ' + fr(piscine.r * 2) + ' m de diamètre)' : ' (' + dimensions(calc) + ')')
    + ', ' + LIBELLE_FOND[r.fond].toLowerCase() + ', profondeur ' + (r.fond === 'plat' ? fr(r.profondeurPetitBain) + ' m' : 'de ' + fr(r.profondeurPetitBain) + ' à ' + fr(r.profondeurGrandBain) + ' m')
    + ', volume ' + fr(calc.volume, 0) + ' m³. Structure : ' + LIBELLE_STRUCTURE[r.structure].toLowerCase() + ', ' + LIBELLE_REVETEMENT[r.revetement].toLowerCase() + '.'
    + (horsSol ? ' Les parois dépassent le terrain naturel de ' + fr(calc.hauteurHorsSol) + ' m.' : ' Le haut des parois est au niveau du terrain naturel.')
    + (r.margelle ? ' Margelles de ' + Math.round(r.largeurMargelle * 100) + ' cm en pierre reconstituée ou naturelle.' : '')
    + (r.plage !== 'aucune' ? ' Plage de ' + fr(r.largeurPlage, 1) + ' m : ' + LIBELLE_PLAGE[r.plage].toLowerCase() + ' (' + fr(calc.surfacePlage, 1) + ' m²).' : '')
    + ' ' + LIBELLE_LOCAL[r.local] + ' à ' + fr(r.distanceLocal, 0) + ' m du bassin.'
    + ' Dispositif de sécurité : ' + LIBELLE_SECURITE[r.securite].toLowerCase() + '.'
    + ' Eau du bassin raccordée à l\'assainissement pour les vidanges, pas de rejet au milieu naturel.';
  e.texte(description);
  e.texte('Matériaux et couleurs : eau ' + r.couleurEau + ', margelles ' + r.couleurMargelle + (r.plage !== 'aucune' ? ', plage ' + r.couleurPlage : '') + '. Terrain : les déblais sont évacués (' + fr(calc.fouille.evacuation, 0) + ' m³) ; aucun mouvement de terre ne modifie le niveau du terrain hors de l\'emprise du bassin et de sa plage.', 8.5, ENCRE_DOUCE);

  e.sousTitre('Aide au remplissage du ' + (permis ? 'cerfa 13406' : 'cerfa 13703'));
  e.texte('Chaque rubrique du formulaire, avec la valeur lue dans le plan. Les cadres sur le demandeur (identité, adresse, courriel) sont à remplir à la main.', 7.5, ENCRE_DOUCE);
  const s = surfaces(calc);
  const contenance = cad?.contenance !== undefined && cad.contenance !== null ? fr(Number(cad.contenance), 0) + ' m²' : parcelle ? fr(shoelace(sommetsDe(parcelle)), 0) + ' m² (mesurés sur le plan)' : '—';
  e.rangee('Cadre 3 - Terrain : adresse', lieu.nom, 'Compléter le numéro, la voie et le code postal.');
  e.rangee('Cadre 3 - Références cadastrales', cad ? [cad.section, String(cad.numero || '').replace(/^0+/, '')].filter(Boolean).join(' ') + (cad.commune ? ' - ' + cad.commune : '') : 'À reporter depuis le cadastre', 'Préfixe, section et numéro de chaque parcelle du terrain.');
  e.rangee('Cadre 3 - Superficie du terrain', contenance);
  e.rangee('Cadre 4 - Nature des travaux', permis ? 'Nouvelle construction : piscine' : 'Construction nouvelle : piscine ' + (horsSol ? 'hors-sol ou semi-enterrée' : 'enterrée'), 'Cocher « piscine » ; préciser le bassin et son local technique.');
  e.rangee('Cadre 4 - Courte description', 'Piscine ' + LIBELLE_IMPLANTATION[r.implantation].toLowerCase() + ' de ' + fr(calc.surface, 1) + ' m², ' + LIBELLE_STRUCTURE[r.structure].toLowerCase() + (r.plage !== 'aucune' ? ', plage ' + LIBELLE_PLAGE[r.plage].toLowerCase() : ''));
  e.rangee('Cadre 4 - Destination', 'Habitation (annexe)');
  e.rangee('Cadre 5 - Surface de plancher créée', fr(s.plancherCreee, 0) + ' m²', s.noteLocal || 'Un bassin ne crée pas de surface de plancher.');
  e.rangee('Cadre 5 - Emprise au sol créée', fr(s.empriseCreee, 1) + ' m²', 'Le plan d\'eau compte dans l\'emprise au sol' + (s.noteLocal ? ' ; ' + s.noteLocal.toLowerCase() : ' ; les margelles et une plage au niveau du sol n\'en font pas partie.'));
  e.rangee('Cadre 5 - Nombre de logements', 'Sans objet');
  e.rangee('Cadre 6 - Piscine : superficie du bassin', fr(calc.surface, 1) + ' m²', 'C\'est l\'assiette de la taxe d\'aménagement (déclaration des éléments nécessaires au calcul des impositions).');
  e.rangee('Cadre 6 - Hauteur hors sol', horsSol ? fr(calc.hauteurHorsSol) + ' m' : '0 m (bassin enterré)');
  e.rangee('Cadre 6 - Abri de piscine', r.securite === 'abri' ? 'Oui - hauteur à préciser (≤ 1,80 m en DP)' : 'Non');
  e.rangee('Cadre 7 - Engagement du demandeur', 'Date et signature', 'Le dispositif de sécurité normalisé est obligatoire à la mise en eau pour un bassin enterré ou semi-enterré.');

  e.sousTitre('Pièces du dossier');
  const pieces: [string, string, boolean][] = permis ? [
    ['PCMI1', 'Plan de situation du terrain', true], ['PCMI2', 'Plan de masse des constructions à édifier ou à modifier, coté dans les trois dimensions', true],
    ['PCMI3', 'Plan en coupe du terrain et de la construction', true], ['PCMI4', 'Notice décrivant le terrain et présentant le projet', true],
    ['PCMI5', 'Plan des façades et des toitures (local technique, abri)', horsSol], ['PCMI6', 'Document graphique d\'insertion dans l\'environnement', false],
    ['PCMI7', 'Photographie situant le terrain dans l\'environnement proche', false], ['PCMI8', 'Photographie situant le terrain dans le paysage lointain', false]
  ] : [
    ['DP1', 'Plan de situation du terrain', true], ['DP2', 'Plan de masse coté dans les trois dimensions', true],
    ['DP3', 'Plan en coupe précisant l\'implantation par rapport au profil du terrain', true],
    ['DP4', 'Plan des façades et des toitures (bassin hors-sol, local technique, abri)', horsSol],
    ['DP5', 'Représentation de l\'aspect extérieur (si modification visible)', false],
    ['DP6', 'Document graphique d\'insertion dans l\'environnement', false],
    ['DP7', 'Photographie du terrain dans l\'environnement proche', false], ['DP8', 'Photographie du terrain dans le paysage lointain', false],
    ['DP11', 'Notice en secteur protégé (matériaux, couleurs)', calc.secteurProtege]
  ];
  pieces.forEach(([code, libelle, fourni]) => e.case(code + ' - ' + libelle + (fourni ? ' - page de ce dossier' : ' - à fournir par le demandeur'), fourni));
  e.texte('Deux exemplaires papier, ou un dépôt dématérialisé. Ajouter un exemplaire par pièce en secteur protégé.', 7.5, ENCRE_DOUCE);
  return e.terminer();
}

function dimensions(calc: PiscineCalculee): string {
  const pts = calc.contour;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const L = Math.max(calc.axe.L, Math.max(...xs) - Math.min(...xs)), l = calc.surface / Math.max(0.1, calc.axe.L);
  return 'environ ' + fr(Math.max(L, l), 2) + ' × ' + fr(Math.min(calc.axe.L, l), 2) + ' m' + (pts.length !== 4 ? ', ' + pts.length + ' côtés' : '')
    + (Math.max(...ys) - Math.min(...ys) > 0 ? '' : '');
}

// ---- 2. Plan de situation et 3. plan de masse ------------------------------------------------

/** La mise en page d'un plan : l'echelle qui tient, et le projeteur. */
function miseEnPage(pts: PtBrut[], hautTitre: number, basCartouche: number, margeCotation: number) {
  if (!pts.length) throw new Error('rien a dessiner');
  const minx = Math.min(...pts.map(p => p.x)), maxx = Math.max(...pts.map(p => p.x));
  const miny = Math.min(...pts.map(p => p.y)), maxy = Math.max(...pts.map(p => p.y));
  const dispoL = A4_L - MARGE_PDF * 2, dispoH = A4_H - MARGE_PDF * 2 - hautTitre - basCartouche;
  const denom = echelleQuiTient(maxx - minx, maxy - miny, Math.max(40, dispoL - margeCotation * 2), Math.max(40, dispoH - margeCotation * 2));
  const k = PT_PAR_METRE / denom;
  const decX = MARGE_PDF + (dispoL - (maxx - minx) * k) / 2;
  const decY = MARGE_PDF + basCartouche + (dispoH - (maxy - miny) * k) / 2;
  const P: Projeteur = p => ({ x: decX + (p.x - minx) * k, y: decY + (p.y - miny) * k });
  return { denom, k, P };
}

const pointsDe = (o: ObjetPlan): PtBrut[] => o.type === 'circle'
  ? [{ x: o.center.x - o.r, y: o.center.y - o.r }, { x: o.center.x + o.r, y: o.center.y + o.r }]
  : o.pts;

function dessinerObjet(o: ObjetPlan, P: Projeteur, k: number, opacite = 0.9, contour = false): string {
  const fond = contour ? null : hexToRgb01(o.fill), trait = hexToRgb01(o.stroke);
  if (o.type === 'circle') { const q = P(o.center); return pdfCercle(q.x, q.y, o.r * k, fond, trait, opacite); }
  if (o.type === 'path') return pdfPolygone(o.pts.map(P), null, trait, Math.max(0.6, (o.width || 0.5) * k), 1);
  return pdfPolygone(o.pts.map(P), fond, trait, contour ? 1.4 : 0.8, contour ? 1 : opacite);
}

function enTete(titre: string, sousTitre: string, lignes: string[]): string {
  let c = pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 14, 16, titre);
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 32, 10, sousTitre, ENCRE_DOUCE);
  lignes.forEach((l, i) => { c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 46 - i * 13, 9, l, ENCRE_DOUCE); });
  return c;
}

function pagePlanDeSituation(objets: ObjetPlan[], piscine: ObjetPlan, meta: MetaDossierPiscine, prefixe: string): PagePdf {
  const parcelle = parcelleDuProjet(objets);
  const lieu = lieuDeParcelle(parcelle);
  // La parcelle, ses voisines, et le bati de tout le voisinage : ce qui situe le terrain.
  const voisinage = objets.filter(o => !o.hidden && (estTerrain(o) || o.fonction === 'batiment' || o.fonction === 'annexe' || o.fonction === 'chemin'));
  const aDessiner = voisinage.length ? voisinage : [piscine];
  const { denom, k, P } = miseEnPage(aDessiner.flatMap(pointsDe), 96, 54, 10);
  let c = enTete(prefixe + '1 - Plan de situation', meta.nomProjet || parcelle?.name || 'Plan',
    [lieu.nom + ' - ' + lieu.latitude.toFixed(5).replace('.', ',') + ' N, ' + lieu.longitude.toFixed(5).replace('.', ',') + ' E',
     'La parcelle du projet est tracee en trait fort ; le bassin en bleu.',
     'A completer par un extrait de carte (IGN, cadastre.gouv.fr) a plus petite echelle.']);
  aDessiner.forEach(o => { c += dessinerObjet(o, P, k, estTerrain(o) ? 0.35 : 0.75, o === parcelle); });
  c += dessinerObjet(piscine, P, k, 0.95);
  if (parcelle) {
    c += pdfPolygone(sommetsDe(parcelle).map(P), null, ENCRE_COTE, 1.6, 1);
    const q = P(centroid(sommetsDe(parcelle)));
    c += pdfTexte(q.x - 20, q.y + 6, 8, parcelle.name, ENCRE_COTE);
  }
  c += pdfFlecheNord(A4_L - MARGE_PDF - 20, A4_H - MARGE_PDF - 96 + 24);
  c += pdfEchelleGraphique(MARGE_PDF, MARGE_PDF + 26, k, denom);
  c += pied(meta);
  return { l: A4_L, h: A4_H, contenu: c };
}

function pagePlanDeMasse(objets: ObjetPlan[], piscine: ObjetPlan, calc: PiscineCalculee, meta: MetaDossierPiscine, prefixe: string): PagePdf {
  const parcelle = parcelleDuProjet(objets);
  const surPropriete = (o: ObjetPlan) => !o.voisinage && (!parcelle || pointInPolygon(o.type === 'circle' ? o.center : centroid(o.pts), sommetsDe(parcelle)));
  const batiments = objets.filter(o => (o.fonction === 'batiment' || o.fonction === 'annexe' || o.fonction === 'terrasse' || o.fonction === 'pergola' || o.fonction === 'carport' || o.fonction === 'dalle') && !o.hidden && surPropriete(o));
  const emprise: PtBrut[] = [...calc.plageExt];
  if (parcelle) emprise.push(...sommetsDe(parcelle));
  batiments.forEach(b => emprise.push(...pointsDe(b)));
  // Le cartouche grandit avec le nombre de limites cotees : la zone de dessin s'adapte.
  const rangeesCartouche = 5 + calc.distances.length;
  const hautTitre = 96, basCartouche = 50 + 11.5 * rangeesCartouche;
  const { denom, k, P } = miseEnPage(emprise, hautTitre, basCartouche, 30);
  const r = calc.reglages;
  let c = enTete(prefixe + '2 - Plan de masse', meta.nomProjet || parcelle?.name || 'Plan',
    ['Bassin ' + piscine.name + ' : ' + fr(calc.surface, 1) + ' m2 de plan d\'eau, ' + LIBELLE_IMPLANTATION[r.implantation].toLowerCase() + (calc.hauteurHorsSol > 0.01 ? ', parois a +' + fr(calc.hauteurHorsSol) + ' m' : ''),
     'Distances du bassin aux limites separatives cotees ; cotes de la parcelle en gris.']);
  if (parcelle) c += pdfPolygone(sommetsDe(parcelle).map(P), null, ENCRE_COTE, 1.4, 1);
  batiments.forEach(b => { c += dessinerObjet(b, P, k, 0.85); });
  // Les abords puis le bassin : l'eau par-dessus les anneaux.
  if (r.plage !== 'aucune') c += pdfPolygone(calc.plageExt.map(P), r.plage === 'dallage' ? PIERRE : BOIS, ENCRE_DOUCE, 0.6, 0.9);
  if (r.margelle) c += pdfPolygone(calc.margelleExt.map(P), PIERRE, ENCRE_DOUCE, 0.6, 1);
  c += pdfPolygone(calc.contour.map(P), BLEU, hexToRgb01(piscine.stroke), 1, 1);
  const centre = P(centroid(calc.contour));
  c += pdfTexte(centre.x - largeurTexte(piscine.name, 8) / 2, centre.y + 2, 8, piscine.name, ENCRE_COTE);
  c += pdfTexte(centre.x - largeurTexte(fr(calc.surface, 1) + ' m2', 7) / 2, centre.y - 8, 7, fr(calc.surface, 1) + ' m2', ENCRE_COTE);
  // Cotes de la parcelle (gris), dimensions du bassin, puis les distances aux limites.
  if (parcelle) {
    const pts = sommetsDe(parcelle), sens = signedArea(pts) > 0 ? 1 : -1;
    pts.forEach((a, i) => {
      const b = au(pts, (i + 1) % pts.length), L = dist(a, b);
      if (L < 0.5) return;
      c += cote(P(a), P(b), fr(L) + ' m', sens * 14, 6.5).replace(/0\.23 0\.18 0\.12 RG/g, '0.55 0.52 0.48 RG');
    });
  }
  if (piscine.type === 'polygon') {
    const pts = piscine.pts, sens = signedArea(pts) > 0 ? 1 : -1;
    pts.forEach((a, i) => {
      const b = au(pts, (i + 1) % pts.length), L = dist(a, b);
      if (L >= 0.5) c += cote(P(a), P(b), fr(L) + ' m', -sens * 12, 7);
    });
  } else if (piscine.type === 'circle') {
    const q = P({ x: piscine.center.x - piscine.r, y: piscine.center.y }), q2 = P({ x: piscine.center.x + piscine.r, y: piscine.center.y });
    c += cote(q, q2, 'diam. ' + fr(piscine.r * 2) + ' m', -14, 7);
  }
  calc.distances.forEach(d => {
    const a = P(d.depuis), b = P(d.vers);
    c += ligne(a, b, 0.8, [0.75, 0.22, 0.17], true);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    c += pdfCercle(mid.x, mid.y, 9, [1, 1, 1], [0.75, 0.22, 0.17], 1);
    const t = fr(d.distance) + ' m';
    c += pdfTexte(mid.x - largeurTexte(t, 6.5) / 2, mid.y - 2.3, 6.5, t, [0.75, 0.22, 0.17]);
  });
  c += pdfFlecheNord(A4_L - MARGE_PDF - 20, A4_H - MARGE_PDF - hautTitre + 24);
  c += pdfEchelleGraphique(A4_L - MARGE_PDF - 150, MARGE_PDF + basCartouche + 14, k, denom);

  // Le cartouche des surfaces et des distances.
  let y = MARGE_PDF + basCartouche - 14;
  const colA = MARGE_PDF, colB = MARGE_PDF + 230, colC = MARGE_PDF + 380;
  c += pdfTexte(colA, y, 10, 'Surfaces et implantation'); y -= 14;
  c += ligne({ x: colA, y: y + 9 }, { x: A4_L - MARGE_PDF, y: y + 9 }, 0.7);
  const s = surfaces(calc);
  const lignesCartouche: [string, string, string][] = [
    ['Parcelle', parcelle ? fr(shoelace(sommetsDe(parcelle)), 0) + ' m2' : '-', ''],
    ['Plan d\'eau (emprise au sol creee)', fr(calc.surface, 1) + ' m2', fr(s.empriseCreee, 1) + ' m2 avec le local'],
    ['Margelles', r.margelle ? fr(shoelace(calc.margelleExt) - shoelace(calc.parois), 1) + ' m2' : '-', r.margelle ? Math.round(r.largeurMargelle * 100) + ' cm' : ''],
    ['Plage', r.plage !== 'aucune' ? fr(calc.surfacePlage, 1) + ' m2' : '-', r.plage !== 'aucune' ? LIBELLE_PLAGE[r.plage] : ''],
    ['Emprise totale (bassin, margelles, plage)', fr(shoelace(calc.plageExt), 1) + ' m2', parcelle ? fr(shoelace(calc.plageExt) / shoelace(sommetsDe(parcelle)) * 100, 1) + ' % de la parcelle' : '']
  ];
  calc.distances.forEach(d => lignesCartouche.push(['Distance a la limite ' + d.nom, fr(d.distance) + ' m', d.distance < 3 ? 'a verifier au reglement de zone' : '']));
  lignesCartouche.forEach(([a, b, n]) => { c += pdfTexte(colA, y, 8, a) + pdfTexte(colB, y, 8, b) + pdfTexte(colC, y, 7.5, n, ENCRE_DOUCE); y -= 11.5; });
  c += pied(meta);
  return { l: A4_L, h: A4_H, contenu: c };
}

// ---- 4. Coupe et elevation -------------------------------------------------------------------

/**
 * Le terrain naturel le long de l'axe AA de la coupe, en hauteur locale (`z - zRef`, metres), de
 * `gauche` a `droite` tous les demi-pas de la grille : l'axe passe par le centre du bassin, dans
 * le sens du petit bain au grand bain, `s` compte depuis le cote du petit bain. La ou la grille ne
 * dit rien, le sol reste au zero du plan.
 */
export function profilTerrainCoupe(relief: Relief, contour: PtBrut[], axe: PiscineCalculee['axe'], gauche: number, droite: number): { s: number; z: number }[] {
  const c = centroid(contour);
  const sC = (c.x - axe.origine.x) * axe.v.x + (c.y - axe.origine.y) * axe.v.y;
  const pasEch = Math.max(0.05, relief.pas / 2);
  const n = Math.max(1, Math.ceil((droite - gauche) / pasEch));
  const out: { s: number; z: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const s = gauche + (droite - gauche) * i / n;
    const p = { x: c.x + axe.v.x * (s - sC), y: c.y + axe.v.y * (s - sC) };
    const z = altitudeNGF(relief, p.x, p.y);
    out.push({ s, z: z === null ? 0 : z - relief.zRef });
  }
  return out;
}

function pageCoupe(piscine: ObjetPlan, calc: PiscineCalculee, meta: MetaDossierPiscine, prefixe: string, relief: Relief | null): PagePdf {
  const r = calc.reglages, ps = PROFILS_STRUCTURE[r.structure];
  const H = calc.hauteurHorsSol, L = calc.axe.L;
  const paroi = Math.max(ps.paroi, 0.05);
  const marg = r.margelle ? r.largeurMargelle : 0, plage = r.plage !== 'aucune' ? r.largeurPlage : 0;
  const gauche = -(paroi + marg + plage + 1.2), droite = L + paroi + marg + plage + 1.2;
  // Le terrain naturel : horizontal au zero du plan, ou le profil du relief le long de l'axe.
  const terrain = relief ? profilTerrainCoupe(relief, sommetsDe(piscine), calc.axe, gauche, droite) : [{ s: gauche, z: 0 }, { s: droite, z: 0 }];
  const zTerrain = terrain.map(t => t.z);
  const bas = Math.min(0, ...zTerrain) - (calc.profondeurMax + ps.fond + 0.35);
  const haut = Math.max(H + EPAISSEUR_MARGELLE_M, calc.plageBois?.dessus ?? 0, ...zTerrain) + 0.6;
  const hautTitre = 90, basTexte = 60;
  const dispoL = A4_L - 2 * MARGE_PDF, dispoH = (A4_H - 2 * MARGE_PDF - hautTitre - basTexte) * (H > 0.01 ? 0.5 : 0.85);
  const denom = echelleQuiTient(droite - gauche, haut - bas, dispoL - 60, dispoH - 50);
  const k = PT_PAR_METRE / denom;
  const yBase = A4_H - MARGE_PDF - hautTitre - 30 - (haut) * k;
  const Q = (x: number, z: number) => ({ x: MARGE_PDF + 30 + (x - gauche) * k, y: yBase + z * k });
  let c = enTete(prefixe + '3 - Plan en coupe', piscine.name + ' - coupe AA selon l\'axe du petit bain au grand bain',
    ['Terrain naturel en trait fort ; cotes en metres ; echelle 1/' + denom + '.',
      ...(relief ? ['Terrain naturel : IGN, ' + resumeRelief(relief) + ' ; hauteurs depuis le zero du plan (NGF ' + fr(relief.zRef) + ' m).'] : [])]);
  const dessinerCoupe = (origineY: number, elevation: boolean): void => {
    const Y = (x: number, z: number) => { const q = Q(x, z); return { x: q.x, y: q.y - origineY }; };
    // Le terrain naturel, de part et d'autre : le profil du relief, ou la ligne du zero.
    for (let i = 1; i < terrain.length; i++) c += ligne(Y(au(terrain, i - 1).s, au(terrain, i - 1).z), Y(au(terrain, i).s, au(terrain, i).z), 1.4);
    if (!elevation) {
      // La fouille et le fond : parois et radier en gris.
      const profil = calc.profil;
      const fond = profil.map(p => Y(p.s, -p.z));
      const sousFond = [...profil].reverse().map(p => Y(p.s, -p.z - ps.fond));
      c += pdfPolygone([Y(-paroi, H), Y(0, H), ...fond, Y(L, H), Y(L + paroi, H), Y(L + paroi, -calc.profondeurMax - ps.fond), ...sousFond.slice(0, 0), Y(-paroi, -calc.profondeurMax - ps.fond)].map(p => p), GRIS, ENCRE_DOUCE, 0.6, 1);
      // L'eau : du plan d'eau au fond.
      c += pdfPolygone([Y(0, H - REVANCHE_M), ...fond, Y(L, H - REVANCHE_M)], BLEU, null, 0.5, 0.9);
      // Le trait du fond et des parois, par-dessus.
      c += pdfPolygone([Y(0, H), ...fond, Y(L, H)], null, ENCRE_COTE, 1, 1).replace('h S', 'S');
    } else {
      c += pdfPolygone([Y(-paroi, 0), Y(L + paroi, 0), Y(L + paroi, H), Y(-paroi, H)], r.structure === 'kit' ? BOIS : PIERRE, ENCRE_COTE, 1, 1);
    }
    // Margelles, de chaque cote.
    const margelles: [number, number][] = [[-paroi - marg, -paroi], [L + paroi, L + paroi + marg]];
    if (r.margelle) margelles.forEach(([a, b]) => {
      c += pdfPolygone([Y(a, H), Y(b, H), Y(b, H + EPAISSEUR_MARGELLE_M), Y(a, H + EPAISSEUR_MARGELLE_M)], PIERRE, ENCRE_COTE, 0.6, 1);
    });
    // La plage, de chaque cote : dallage au sol, ou platelage a sa hauteur avec ses poteaux.
    if (r.plage !== 'aucune') {
      const pb = calc.plageBois;
      const dessus = pb ? pb.dessus : H + EPAISSEUR_MARGELLE_M;
      const ep = pb ? 0.027 : EPAISSEUR_MARGELLE_M;
      const plages: [number, number][] = [[-paroi - marg - plage, -paroi - marg], [L + paroi + marg, L + paroi + marg + plage]];
      plages.forEach(([a, b]) => {
        c += pdfPolygone([Y(a, dessus - ep), Y(b, dessus - ep), Y(b, dessus), Y(a, dessus)], r.plage === 'dallage' ? PIERRE : BOIS, ENCRE_COTE, 0.6, 1);
        if (pb && pb.mode === 'poteaux') {
          const basPoutre = dessus - 0.027 - 0.175 - 0.2;
          c += pdfPolygone([Y(a, basPoutre), Y(b, basPoutre), Y(b, basPoutre + 0.2), Y(a, basPoutre + 0.2)], BOIS, ENCRE_COTE, 0.5, 1);
          const anneaux = pb.anneaux;
          for (let i = 0; i < anneaux; i++) {
            const x = a + 0.12 + (b - a - 0.24) * i / Math.max(1, anneaux - 1);
            c += pdfPolygone([Y(x - 0.06, 0), Y(x + 0.06, 0), Y(x + 0.06, basPoutre), Y(x - 0.06, basPoutre)], BOIS, ENCRE_COTE, 0.5, 1);
            c += pdfPolygone([Y(x - 0.2, -0.5), Y(x + 0.2, -0.5), Y(x + 0.2, 0), Y(x - 0.2, 0)], GRIS, ENCRE_DOUCE, 0.5, 1);
          }
        } else if (pb) {
          c += pdfPolygone([Y(a, Math.max(0, dessus - ep - 0.1)), Y(b, Math.max(0, dessus - ep - 0.1)), Y(b, dessus - ep), Y(a, dessus - ep)], TERRE, ENCRE_DOUCE, 0.4, 1);
        } else {
          c += pdfPolygone([Y(a, H - 0.27), Y(b, H - 0.27), Y(b, dessus - ep), Y(a, dessus - ep)], TERRE, ENCRE_DOUCE, 0.4, 1);
        }
      });
    }
    if (!elevation) {
      // Cotes : longueur, profondeurs, hauteur hors du sol, plage.
      c += cote(Y(0, H + EPAISSEUR_MARGELLE_M + 0.15), Y(L, H + EPAISSEUR_MARGELLE_M + 0.15), fr(L) + ' m', 10);
      c += cote(Y(L + paroi + marg + plage + 0.35, 0), Y(L + paroi + marg + plage + 0.35, -r.profondeurPetitBain), 'PB ' + fr(r.profondeurPetitBain) + ' m', 12);
      if (r.fond !== 'plat') c += cote(Y(L + paroi + marg + plage + 0.9, 0), Y(L + paroi + marg + plage + 0.9, -r.profondeurGrandBain), 'GB ' + fr(r.profondeurGrandBain) + ' m', 12);
      if (H > 0.01) c += cote(Y(gauche + 0.3, 0), Y(gauche + 0.3, H), '+' + fr(H) + ' m', -12);
      if (plage > 0) c += cote(Y(-paroi - marg - plage, H + EPAISSEUR_MARGELLE_M + 0.15), Y(-paroi - marg, H + EPAISSEUR_MARGELLE_M + 0.15), 'plage ' + fr(plage, 2) + ' m', 10);
      c += pdfTexte(Y(gauche, 0).x, Y(gauche, 0).y + 4, 7, 'TN 0,00', ENCRE_COTE);
      c += pdfTexte(Y(L / 2, H - REVANCHE_M).x - 10, Y(L / 2, H - REVANCHE_M).y + 3, 6.5, 'plan d\'eau', [0.1, 0.35, 0.55]);
    } else {
      c += pdfTexte(Y(gauche, 0).x, Y(gauche, 0).y + 4, 7, 'TN 0,00', ENCRE_COTE);
      c += cote(Y(gauche + 0.3, 0), Y(gauche + 0.3, H), '+' + fr(H) + ' m', -12);
    }
  };
  dessinerCoupe(0, false);
  if (H > 0.01) {
    const yElev = (haut - bas) * k + 40;
    c += pdfTexte(MARGE_PDF, yBase + haut * k - yElev + 14, 10, prefixe + (prefixe === 'DP' ? '4' : '5') + ' - Elevation (vue de cote, bassin hors du sol)');
    dessinerCoupe(yElev, true);
  }
  c += pdfEchelleGraphique(A4_L - MARGE_PDF - 150, MARGE_PDF + basTexte - 20, k, denom);
  let y = MARGE_PDF + basTexte - 48;
  const notes = [
    'Hauteur des parois ' + fr(calc.hauteurParoi) + ' m (profondeur maximale + revanche ' + Math.round(REVANCHE_M * 100) + ' cm) ; fouille ' + fr(calc.fouille.profondeur) + ' m sous le terrain naturel.',
    'Structure : ' + LIBELLE_STRUCTURE[r.structure] + ', ' + LIBELLE_REVETEMENT[r.revetement].toLowerCase() + ' ; fond ' + LIBELLE_FOND[r.fond].toLowerCase() + '.'
  ];
  notes.forEach(n => { c += pdfTexte(MARGE_PDF, y, 8, n, ENCRE_DOUCE); y -= 11; });
  c += pied(meta);
  return { l: A4_L, h: A4_H, contenu: c };
}

// ---- 5. Pieces du demandeur ------------------------------------------------------------------

function pagePieces(meta: MetaDossierPiscine, prefixe: string, secteurProtege: boolean): PagePdf {
  const permis = prefixe === 'PCMI';
  let c = enTete('Pièces à joindre par le demandeur', 'Insertion et photographies : coller ou imprimer dans les cadres',
    ['Ces pieces ne peuvent pas etre produites depuis le plan.']);
  const cadres: [string, string][] = [
    [prefixe + '6 - Document graphique d\'insertion', 'Photomontage ou croquis du bassin et de sa plage vus depuis l\'espace public ou le jardin, dans leur environnement.'],
    [prefixe + '7 - Photographie proche', 'Le terrain et l\'emplacement du bassin, pris depuis la maison ou la limite voisine la plus proche.'],
    [prefixe + '8 - Photographie lointaine', 'Le terrain dans la rue ou le paysage, pris depuis l\'espace public.']
  ];
  const hautCadre = (A4_H - MARGE_PDF * 2 - 110 - 20 * cadres.length) / cadres.length;
  let y = A4_H - MARGE_PDF - 100;
  cadres.forEach(([titre, consigne]) => {
    c += pdfTexte(MARGE_PDF, y, 9.5, titre);
    const p = paragraphe(MARGE_PDF, y - 12, A4_L - 2 * MARGE_PDF, 7.5, consigne, ENCRE_DOUCE);
    c += p.c;
    const hautZone = hautCadre - 14 - p.h;
    c += '0.55 0.52 0.48 RG 0.6 w [4 3] 0 d ' + nb(MARGE_PDF) + ' ' + nb(y - 14 - p.h - hautZone) + ' ' + nb(A4_L - 2 * MARGE_PDF) + ' ' + nb(hautZone) + ' re S [] 0 d\n';
    y -= hautCadre + 20;
  });
  if (secteurProtege || permis) c += pdfTexte(MARGE_PDF, MARGE_PDF + 16, 7.5, (permis ? 'PCMI4 : la notice de la premiere page tient lieu de description du projet.' : 'DP11 : en secteur protege, joindre la notice des materiaux et couleurs (premiere page).'), ENCRE_DOUCE);
  c += pied(meta);
  return { l: A4_L, h: A4_H, contenu: c };
}

// ---- 6. Annexe : la note de calcul -----------------------------------------------------------

function pagesNote(piscine: ObjetPlan, sections: SectionNote[], meta: MetaDossierPiscine): PagePdf[] {
  const e = new Ecrivain(meta, 'Annexe - note de calcul');
  e.titre('Annexe - Note de calcul : ' + piscine.name);
  e.texte('Pré-dimensionnement d\'avant-projet, calé sur les usages du métier (temps de recyclage, vitesse de filtration, NF DTU 51.4 pour la plage en bois). Ce n\'est ni une étude de sol ni une note de calcul béton : la structure du bassin relève de l\'étude d\'exécution ou de la notice du fabricant.', 8, ENCRE_DOUCE);
  sections.forEach(s => {
    e.sousTitre(s.titre);
    s.lignes.forEach(l => e.rangee(l.libelle, l.valeur, l.note));
    if (s.remarque) e.texte(s.remarque, 7.5, ENCRE_DOUCE);
  });
  return e.terminer();
}

// ---- Assemblage ------------------------------------------------------------------------------

/**
 * Le dossier de mairie de la piscine `cle` (la premiere du plan si `null`). `Error('aucune
 * piscine')` quand le plan n'en a pas, `Error('bassin inutilisable')` quand elle n'a pas de surface.
 */
export function construireDossierPiscine(objets: ObjetPlan[], cle: string | null, meta: MetaDossierPiscine): DossierPiscine {
  const piscines = piscinesDu(objets);
  const piscine = piscines.find(p => p.key === cle) || piscines[0];
  if (!piscine) throw new Error('aucune piscine');
  const calc = calculerPiscine(piscine, objets);
  if (!calc) throw new Error('bassin inutilisable');
  const prefixe = calc.regime === 'permis' ? 'PCMI' : 'DP';
  const pages: PagePdf[] = [
    ...pagesNotice(objets, piscine, calc, meta),
    pagePlanDeSituation(objets, piscine, meta, prefixe),
    pagePlanDeMasse(objets, piscine, calc, meta, prefixe),
    pageCoupe(piscine, calc, meta, prefixe, reliefDe(objets)),
    pagePieces(meta, prefixe, calc.secteurProtege),
    ...pagesNote(piscine, noteDeCalcul(calc), meta)
  ];
  return { pdf: assemblerPDF(pages), pages: pages.length, piscine, regime: calc.regime };
}
