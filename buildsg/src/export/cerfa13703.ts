// Le remplissage du cerfa 13703*12 : declaration prealable, maison individuelle et ses annexes
// (export/).
//
// Ce module ne touche pas au PDF : il dit, champ par champ, ce que le projet permet d'ecrire dans
// le formulaire officiel. Les noms de champs sont ceux du formulaire AcroForm du cerfa 13703*12,
// releves sur le fichier lui-meme ; une nouvelle version du cerfa demandera de les verifier.
//
// Ce que le plan sait : le terrain (adresse et references cadastrales lues a l'import, superficie),
// les protections patrimoniales (servitudes du PLU), et les ouvrages (pergolas, carports, terrasses)
// avec leurs dimensions. Ce qu'il ne sait pas — le declarant, la date de naissance, la signature —
// vient de la section « Déclaration préalable » de la parcelle, ou reste a completer a la main.

import { shoelace } from '../geometry/basic.js';
import { calculerPergola, LIBELLE_MATERIAU, LIBELLE_TOIT_PERGOLA, libelleAbri, natureAbri } from '../engine/pergola.js';
import { estAbri, estTerrasse, parcelleDuProjet } from '../model/fonctions.js';
import type { DeclarationPrealable, ObjetPlan } from '../model/types.js';

export const CERFA_13703 = { fichier: 'cerfa/cerfa_13703-12.pdf', version: '13703*12' } as const;

/** Les cases du bordereau des pieces jointes, par piece. */
export const CASES_PIECES = { DP1: 'P5PA1', DP2: 'P5PB1', DP3: 'P3GE1', DP4: 'P3GD1', DP5: 'P5PC1', DP6: 'P3GF1', DP7: 'P3GG1', DP8: 'P3GH1' } as const;
export type Piece = keyof typeof CASES_PIECES;

export interface OuvrageDeclare {
  nom: string;
  nature: 'pergola' | 'carport' | 'terrasse';
  emprise: number;
  /** Hauteur au point le plus haut, en metres (0 pour une terrasse). */
  hauteur: number;
  description: string;
}

export interface RemplissageCerfa {
  textes: Record<string, string>;
  cases: string[];
  ouvrages: OuvrageDeclare[];
  /** Emprise au sol creee par les abris, en m² (une terrasse de plain-pied n'en cree pas). */
  emprise: number;
  /** Ce qui reste a completer dans le formulaire ou a joindre. */
  manques: string[];
  /** Le regime qui s'applique : au-dela de la declaration prealable, il faut un permis. */
  regime: 'aucune' | 'declaration' | 'permis';
}

const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
const chiffres = (t: string | undefined): string => (t || '').replace(/\D/g, '');

/** `'12 bis Rue de la Paix 78110 Le Vésinet'` -> numero, voie, code postal, localite (adresse de la BAN). */
export function decouperAdresse(label: string): { numero: string; voie: string; codePostal: string; localite: string } {
  // Le suffixe d'un numero est « bis », « ter », « quater » apres un espace, ou une lettre collee
  // (« 12B ») : sans cette regle, le « A » de « 2 Allée » passait pour un suffixe.
  const m = /^\s*(?:(\d+(?:\s+(?:bis|ter|quater)\b|[a-z](?=\s))?)\s+)?(.*?)\s+(\d{5})\s+(.+?)\s*$/i.exec(label || '');
  if (!m) return { numero: '', voie: (label || '').trim(), codePostal: '', localite: '' };
  return { numero: (m[1] || '').trim(), voie: (m[2] || '').trim(), codePostal: m[3] || '', localite: (m[4] || '').trim() };
}

/** Une reference cadastrale : prefixe (3 chiffres), section (2 caracteres), numero (4 chiffres). */
export function referenceCadastrale(idu: string | undefined, section: unknown, numero: unknown): { prefixe: string; section: string; numero: string } {
  const i = (idu || '').replace(/\s/g, '');
  const sec = String(section ?? (i.length >= 10 ? i.slice(8, 10) : '')).replace(/^0+(?=.)/, '');
  const num = String(numero ?? (i.length >= 14 ? i.slice(10, 14) : '')).replace(/^0+(?=.)/, '');
  return { prefixe: i.length >= 8 ? i.slice(5, 8) : '000', section: sec, numero: num };
}

/** `AAAA-MM-JJ` ou une date -> `JJMMAAAA`, le format des champs de date du cerfa. */
export function dateCerfa(d: string | Date | undefined): string {
  if (!d) return '';
  if (d instanceof Date) return String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? (m[3] ?? '') + (m[2] ?? '') + (m[1] ?? '') : '';
}

/** Les cotes d'un contour a quatre angles droits : `4,00 x 3,00 m` ; sinon rien. */
function dimensions(o: ObjetPlan): string {
  if (o.type !== 'polygon' || o.pts.length !== 4) return '';
  const l = o.pts.map((p, i) => { const q = o.pts[(i + 1) % 4] ?? p; return Math.hypot(q.x - p.x, q.y - p.y); });
  const [a = 0, b = 0, c = 0, d = 0] = l;
  if (Math.abs(a - c) > 0.02 || Math.abs(b - d) > 0.02) return '';
  return fr(Math.max(a, b)) + ' x ' + fr(Math.min(a, b)) + ' m';
}

/** Les ouvrages que la declaration porte : les abris, puis les terrasses. */
export function ouvragesDeclares(objets: ObjetPlan[]): OuvrageDeclare[] {
  const abris: OuvrageDeclare[] = objets.filter(estAbri).flatMap(o => {
    const calc = calculerPergola(o);
    if (!calc) return [];
    const r = calc.reglages, nature = natureAbri(o);
    const emprise = shoelace(calc.emprise);
    const hauteur = Math.max(...calc.pieces.map(p => Math.max(p.a.z, p.b.z))) + 0.02;
    const dims = dimensions(o);
    const toit = r.toit === 'toile' ? 'chevrons et toile tendue' : LIBELLE_TOIT_PERGOLA[r.toit].toLowerCase() + ' couvert, pente ' + r.pente + '°';
    const description = (nature === 'carport' ? 'un carport (abri de voiture ouvert)' : 'une pergola') + ' en ' + LIBELLE_MATERIAU[r.materiau].toLowerCase()
      + (dims ? ' de ' + dims : '') + ', emprise au sol ' + fr(emprise, 1) + ' m², hauteur ' + fr(hauteur) + ' m, toit ' + toit
      + (r.adossee ? ', adossé(e) à la maison' : '');
    return [{ nom: o.name, nature, emprise, hauteur, description }];
  });
  const terrasses: OuvrageDeclare[] = objets.filter(estTerrasse).map(o => {
    const surface = o.type === 'polygon' ? shoelace(o.pts) : 0;
    const dims = dimensions(o);
    return { nom: o.name, nature: 'terrasse', emprise: 0, hauteur: 0, description: 'une terrasse en bois de plain-pied' + (dims ? ' de ' + dims : '') + ' (' + fr(surface, 1) + ' m²)' };
  });
  return [...abris, ...terrasses];
}

/** Le regime selon l'emprise au sol creee (code de l'urbanisme, R*421-9 et R*421-14). */
function regime(emprise: number, adossee: boolean): RemplissageCerfa['regime'] {
  if (emprise < 5) return 'aucune';
  if (emprise <= 20 || (adossee && emprise <= 40)) return 'declaration';
  return 'permis';
}

const LIGNES_FICHE = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'.split('');

/** Ce que le projet permet d'ecrire dans le cerfa 13703*12. */
export function remplirCerfa13703(objets: ObjetPlan[], aujourdHui: Date, pieces: Piece[]): RemplissageCerfa {
  const parcelle = parcelleDuProjet(objets);
  const d: DeclarationPrealable = parcelle?.declaration || {};
  const t: Record<string, string> = {};
  const cases: string[] = ['C2ZA1_nouvelle'];
  const manques: string[] = [];
  const poser = (champ: string, v: string | undefined) => { if (v) t[champ] = v; };

  // 1. Le declarant.
  poser('D1N_nom', d.nom?.toUpperCase()); poser('D1P_prenom', d.prenom);
  poser('D1A_naissance', dateCerfa(d.naissance)); poser('D1C_commune', d.communeNaissance);
  poser('D1D_dept', d.departementNaissance); poser('D1E_pays', d.paysNaissance);
  if (!d.nom || !d.prenom) manques.push('le nom et le prénom du déclarant');
  if (!d.naissance) manques.push('la date et le lieu de naissance');

  // 2. Ses coordonnees.
  poser('D3N_numero', d.numero); poser('D3V_voie', d.voie); poser('D3W_lieudit', d.lieuDit);
  poser('D3L_localite', d.localite); poser('D3C_code', chiffres(d.codePostal)); poser('D3T_telephone', chiffres(d.telephone));
  const [local, domaine] = (d.email || '').split('@');
  if (local && domaine) { t.D5GE1_email = local; t.D5GE2_email = domaine; if (d.accepteEmail) cases.push('D5A_acceptation'); }
  if (!d.voie || !d.localite) manques.push('l\'adresse du déclarant');

  // 3. Le terrain : l'adresse lue a l'import, sauf si la declaration en donne une autre.
  const cad = (parcelle?.cadastre || {}) as Record<string, unknown>;
  const lue = decouperAdresse(String(cad.adresse || ''));
  poser('T2Q_numero', d.terrainNumero || lue.numero);
  poser('T2V_voie', d.terrainVoie || lue.voie);
  poser('T2L_localite', d.terrainLocalite || lue.localite || String(cad.commune || parcelle?.nomLieu || ''));
  poser('T2C_code', chiffres(d.terrainCodePostal || lue.codePostal));
  const fusion = Array.isArray(cad.fusionDe) ? cad.fusionDe as Record<string, unknown>[] : [cad];
  const refs = fusion.filter(p => p.idu || p.section).map(p => ({ ...referenceCadastrale(String(p.idu || ''), p.section, p.numero), surface: Number(p.contenanceM2) || 0 }));
  const premiere = refs[0];
  if (premiere) {
    t.T2F_prefixe = premiere.prefixe; t.T2S_section = premiere.section; t.T2N_numero = premiere.numero;
    if (premiere.surface) t.T2T_superficie = String(Math.round(premiere.surface));
  } else {
    manques.push('les références cadastrales du terrain (importez la parcelle depuis son adresse)');
  }
  // Plusieurs parcelles : la fiche complementaire, une ligne par parcelle, et la superficie totale.
  if (refs.length > 1) {
    refs.slice(0, LIGNES_FICHE.length).forEach((r, i) => {
      const l = LIGNES_FICHE[i] ?? 'A';
      t['T5Z' + l + '1'] = r.prefixe; t['T5Z' + l + '2'] = r.section; t['T5Z' + l + '3'] = r.numero;
      if (r.surface) t['T5Z' + l + '4'] = String(Math.round(r.surface));
    });
    t.D5T_total = String(Math.round(refs.reduce((s, r) => s + r.surface, 0)));
  }

  // 4. Le projet.
  const ouvrages = ouvragesDeclares(objets);
  const natures = [...new Set(ouvrages.map(o => o.nature === 'carport' ? 'carport (abri voiture ouvert)' : o.nature))];
  if (natures.length) t.C2ZA7_autres = natures.join(', ');
  const emprise = ouvrages.reduce((s, o) => s + o.emprise, 0);
  t.C2ZD1_description = 'Construction de ' + ouvrages.map(o => o.description).join(' ; ') + '. '
    + 'Emprise au sol créée : ' + fr(emprise, 1) + ' m². Ouvrages ouverts, sans création de surface de plancher.';
  if (!ouvrages.length) manques.push('un ouvrage à déclarer (pergola, carport ou terrasse)');
  cases.push(d.residence === 'secondaire' ? 'C2ZF2_secondaire' : 'C2ZF1_principale');

  // 5. Les protections patrimoniales, lues dans les servitudes du PLU quand le plan les a.
  const plu = parcelle?.plu;
  if (plu) {
    if (plu.spr.length) cases.push('X2R_remarquable');
    if (plu.servitudes.some(s => s.type === 'AC1')) cases.push('X2H_historique');
    if (plu.servitudes.some(s => s.type === 'AC2' && /class/i.test(s.nom + ' ' + s.nature))) cases.push('X2C_classe');
  } else {
    manques.push('les protections patrimoniales (consultez le PLU de la parcelle pour les cocher)');
  }

  // 8. L'engagement : le lieu et la date ; la signature reste manuscrite.
  poser('E1L_lieu', d.localite || t.T2L_localite);
  t.E1D_date = dateCerfa(aujourdHui);
  manques.push('la signature du déclarant');

  // Le bordereau des pieces.
  pieces.forEach(p => cases.push(CASES_PIECES[p]));
  if (!pieces.includes('DP6')) manques.push('la pièce DP6 (insertion) : ouvrez la Vue 3D, cadrez le projet comme vu de la rue, puis générez le dossier depuis le menu Exporter sans quitter la 3D');
  manques.push('les photographies DP7 (environnement proche) et DP8 (paysage lointain), si le projet est visible depuis l\'espace public');

  const adossee = objets.some(o => estAbri(o) && !!o.pergola?.adossee);
  return { textes: t, cases, ouvrages, emprise, manques, regime: regime(emprise, adossee) };
}

/** Le libelle d'un ouvrage pour une liste : `Pergola « Pergola 1 »`. */
export const libelleOuvrage = (o: ObjetPlan): string => (estAbri(o) ? libelleAbri(o) : 'Terrasse') + ' « ' + o.name + ' »';
