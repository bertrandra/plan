// La note de calcul d'un abri en PDF (export/).
//
// Le contenu est celui d'engine/noteCalcul.ts, mis en page sur A4 : l'ouvrage, les normes, les
// hypotheses, les charges, les combinaisons, la verification piece par piece, les ancrages,
// l'urbanisme et les limites. Texte seul : l'ecrivain PDF du projet n'a qu'une police Helvetica sans
// encodage declare, donc le texte passe en ASCII (accents et symboles transcrits).

import { calculerPergola, LIBELLE_MATERIAU, LIBELLE_ROLE, LIBELLE_TOIT_PERGOLA, libelleAbri, libelleSection } from '../engine/pergola.js';
import { ALU, BOIS, noteDeCalcul, TERRAINS, VB0, type NoteCalcul } from '../engine/noteCalcul.js';
import { A4_H, A4_L, MARGE_PDF, assemblerPDF, pdfPolygone, pdfTexte, type PagePdf } from './pdf/writer.js';
import type { ObjetPlan } from '../model/types.js';

export interface MetaNote { appVersion: string; nomProjet?: string | null | undefined; date?: Date }

/** Ce que la police du PDF sait ecrire : les symboles deviennent leur equivalent ASCII. */
export function enAscii(t: string): string {
  const table: Record<string, string> = {
    '×': 'x', '²': '2', '³': '3', '—': '-', '–': '-', '·': '.', '≤': '<=', '≥': '>=', 'φ': 'phi', '’': '\'', '…': '...',
    '−': '-', 'μ': 'mu', 'γ': 'gamma', 'ψ': 'psi', '«': '"', '»': '"', '\u00a0': ' ', '\u202f': ' ', 'Œ': 'OE', 'œ': 'oe', '°': ' deg', '§': 'par. '
  };
  return t.split('').map(c => table[c] ?? c).join('').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
}

const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
const pct = (t: number): string => Math.round(t * 100) + ' %';

/** Une mise en page en flux : des lignes qui passent a la page suivante quand la feuille est pleine. */
class Flux {
  readonly pages: PagePdf[] = [];
  private contenu = '';
  private y = A4_H - MARGE_PDF;
  private readonly largeur = A4_L - 2 * MARGE_PDF;

  constructor(private readonly pied: string) { }

  private place(h: number): void {
    if (this.y - h < MARGE_PDF + 20) this.finirPage();
  }

  finirPage(): void {
    if (!this.contenu) return;
    const n = this.pages.length + 1;
    this.contenu += pdfTexte(MARGE_PDF, MARGE_PDF - 14, 7, enAscii(this.pied + ' - page ' + n), [0.45, 0.42, 0.38]);
    this.pages.push({ l: A4_L, h: A4_H, contenu: this.contenu });
    this.contenu = '';
    this.y = A4_H - MARGE_PDF;
  }

  /** Un paragraphe, coupe a la largeur de la page (Helvetica : environ une demi-taille par caractere). */
  texte(t: string, taille = 9, retrait = 0, couleur?: [number, number, number]): void {
    const parLigne = Math.floor((this.largeur - retrait) / (taille * 0.5));
    const mots = enAscii(t).split(' ');
    const lignes: string[] = [];
    let l = '';
    mots.forEach(m => { if ((l + ' ' + m).trim().length > parLigne) { lignes.push(l); l = m; } else l = (l + ' ' + m).trim(); });
    if (l) lignes.push(l);
    lignes.forEach(li => {
      this.place(taille * 1.35);
      this.y -= taille * 1.35;
      this.contenu += pdfTexte(MARGE_PDF + retrait, this.y, taille, li, couleur);
    });
  }

  titre(t: string): void {
    this.place(40);
    this.y -= 10;
    this.texte(t, 11.5);
    this.contenu += pdfPolygone([{ x: MARGE_PDF, y: this.y - 3 }, { x: A4_L - MARGE_PDF, y: this.y - 3 }], null, [0.55, 0.45, 0.3], 0.6);
    this.y -= 5;
  }

  puce(t: string): void { this.texte('- ' + t, 9, 8); }
}

/** La note de calcul de l'abri, en PDF ; `null` si ses hypotheses ne sont pas completes. */
export function construireNoteCalculPDF(o: ObjetPlan, meta: MetaNote): { pdf: string; pages: number } | null {
  const n = noteDeCalcul(o);
  const calc = calculerPergola(o);
  if (!n || !calc || !n.charges) return null;
  const r = calc.reglages, h = n.hypotheses, ch = n.charges;
  const date = (meta.date ?? new Date()).toLocaleDateString('fr-FR');
  const f = new Flux('Note de calcul - ' + libelleAbri(o) + ' ' + o.name + ' - Plan interactif ' + meta.appVersion + ' - ' + date);

  f.texte('Note de calcul de pré-dimensionnement', 16);
  f.texte(libelleAbri(o) + ' « ' + o.name + ' »' + (meta.nomProjet ? ' - projet ' + meta.nomProjet : ''), 11);
  f.texte('Établie le ' + date + ' par Plan interactif ' + meta.appVersion + '.', 9);

  f.titre('1. Ouvrage');
  f.puce('Emprise du toit ' + fr(n.emprise, 1) + ' m², contour de ' + (o.type === 'polygon' ? o.pts.length : 0) + ' côtés, débord ' + Math.round(r.debord * 100) + ' cm.');
  f.puce('Matériau : ' + LIBELLE_MATERIAU[r.materiau] + ' ; toit : ' + LIBELLE_TOIT_PERGOLA[r.toit] + (r.toit === 'toile' ? '' : ', pente ' + r.pente + '°') + ' ; hauteur sous poutres ' + fr(r.hauteur) + ' m' + (r.adossee ? ' ; adossé à un mur' : '') + '.');
  f.puce('Sections : poteaux ' + libelleSection(r.sectionPoteau) + ' (entraxe maximal ' + fr(r.entraxePoteaux, 1) + ' m), poutres ' + libelleSection(r.sectionPoutre) + ', chevrons ' + libelleSection(r.sectionChevron) + ' à ' + Math.round(r.entraxeChevrons * 100) + ' cm' + (r.avecContrefiches ? ', contrefiches ' + libelleSection(r.sectionContrefiche) + ' de ' + fr(r.longueurContrefiche) + ' m' : '') + '.');

  f.titre('2. Normes de référence');
  [
    'NF EN 1990 et annexe nationale : bases de calcul, combinaisons d\'actions.',
    'NF EN 1991-1-1 : poids propres, charge d\'entretien des toitures (catégorie H, 1,5 kN).',
    'NF EN 1991-1-3 et annexe nationale : charges de neige.',
    'NF EN 1991-1-4 et annexe nationale : actions du vent, toitures isolées (§7.3).',
    r.materiau === 'bois' ? 'NF EN 1995-1-1 et annexe nationale : structures en bois ; NF EN 338 (C24), NF EN 14080 (GL24h).' : 'NF EN 1999-1-1 et annexe nationale : structures en aluminium (6060 T66).',
    'NF DTU 31.1 (charpente bois) et NF DTU 40.35 (couverture en bac acier) pour la mise en oeuvre.'
  ].forEach(t => f.puce(t));

  f.titre('3. Hypothèses et charges');
  f.puce('Neige : région ' + h.zoneNeige + ', altitude ' + Math.round(h.altitude) + ' m ; s_k = ' + fr(ch.sk) + ' kN/m² au sol ; ' + (ch.s > 0 ? 's = mu1 . s_k = ' + fr(ch.s) + ' kN/m² sur le toit' : 'aucune sur la toile, repliée l\'hiver') + (ch.sAd !== null ? ' ; neige exceptionnelle ' + fr(ch.sAd) + ' kN/m²' : '') + '.');
  f.puce('Vent : région ' + h.zoneVent + ' (v_b,0 = ' + (VB0[h.zoneVent ?? 2] ?? 24) + ' m/s), terrain ' + TERRAINS[h.terrain].libelle + ' ; pression de pointe q_p = ' + fr(ch.qp) + ' kN/m² ; toiture isolée, obstruction phi = ' + fr(h.obstruction, 1) + ' : c_f = +' + fr(ch.cfBas) + ' (vers le bas) et -' + fr(ch.cfHaut) + ' (soulèvement) ; effort horizontal total ' + fr(ch.H, 1) + ' kN.');
  f.puce('Poids propres : couverture ' + fr(h.poidsCouverture, 1) + ' kg/m² (' + fr(ch.gCouverture) + ' kN/m²), toiture complète ' + fr(ch.g) + ' kN/m² en projection horizontale.');
  if (r.materiau === 'bois') {
    const b = BOIS[h.classeBois];
    f.puce('Bois ' + h.classeBois + ' : f_m,k = ' + b.fmk + ' MPa, f_c,0,k = ' + b.fc0k + ' MPa, f_v,k = ' + fr(b.fvk, 1) + ' MPa, E_0,mean = ' + b.E0mean + ' MPa, gamma_M = ' + b.gammaM + ' ; classe de service ' + h.classeService + '.');
  } else {
    f.puce('Aluminium 6060 T66 : f_o = ' + ALU.fo + ' MPa, E = ' + ALU.E + ' MPa, gamma_M1 = ' + ALU.gammaM1 + ' ; tubes de ' + fr(h.epaisseurAlu, 1) + ' mm d\'épaisseur, classe de section vérifiée.');
  }

  f.titre('4. Combinaisons d\'actions');
  f.texte('ELU fondamentales (NF EN 1990) : 1,35 G ; 1,35 G + 1,5 S ; 1,35 G + 1,5 S + 0,9 W ; 1,35 G + 1,5 W + 0,75 S ; 1,35 G + 1,5 Q ; G + 1,5 W en soulèvement' + (ch.sAd !== null ? ' ; accidentelle G + S_Ad' : '') + '. ELS caractéristiques pour les flèches : L/300 sous action variable, L/200 en flèche finale' + (r.materiau === 'bois' ? ' (fluage k_def)' : '') + '. Pour le bois, k_mod est celui de l\'action la plus courte de la combinaison.');

  f.titre('5. Vérification des pièces');
  n.verifs.forEach(v => {
    const nom = LIBELLE_ROLE[v.role][1].replace(/^./, l => l.toUpperCase()) + ' ' + libelleSection(v.section);
    f.texte(nom + ' - ' + pct(v.taux) + (v.taux <= 1 ? ' : vérifié' : ' : insuffisant'), 10, 0, v.taux <= 1 ? [0.15, 0.4, 0.2] : [0.65, 0.15, 0.1]);
    f.texte('Modèle : ' + v.modele + '.', 9, 8);
    v.criteres.forEach(k => f.texte(k.nom + ' : ' + pct(k.taux) + ' (' + k.detail + ').', 9, 8));
    if (v.taux > 1 && v.proposition) f.texte('Section suffisante : ' + v.proposition + '.', 9, 8);
  });
  f.texte('Faîtage et arêtiers d\'un toit à quatre pans : non vérifiés.', 9);

  f.titre('6. Appuis');
  const a = n.ancrage;
  if (a) {
    f.puce('Pied de poteau le plus chargé (ELU) : compression ' + fr(a.compression, 1) + ' kN, soulèvement ' + fr(a.soulevement, 1) + ' kN, effort horizontal ' + fr(a.horizontal, 1) + ' kN' + (a.moment > 0 ? ', moment d\'encastrement ' + fr(a.moment, 1) + ' kN.m' : ' (pied articulé)') + '.');
    f.puce('Plot en béton qui tient le soulèvement et le renversement (poids seul, coefficient 0,9) : cube de ' + Math.round(a.plot * 100) + ' cm de côté. La portance du sol reste à vérifier.');
  }
  if (n.chargeMur !== null) f.puce('Lisse murale : ' + fr(n.chargeMur) + ' kN/m (ELU) à reprendre par les fixations dans le mur, qui stabilise aussi l\'ouvrage contre le vent.');

  f.titre('7. Urbanisme');
  f.texte(n.urbanisme + ' Vérifier aussi le règlement du PLU (hauteur, implantation, aspect) et les servitudes.');

  f.titre('8. Limites de cette note');
  n.limites.forEach(t => f.puce(t));
  f.finirPage();
  return { pdf: assemblerPDF(f.pages), pages: f.pages.length };
}

/** La note est-elle exportable ? Ses regions de neige et de vent sont choisies. */
export const noteExportable = (o: ObjetPlan | undefined): boolean => !!o && (noteDeCalcul(o)?.charges ?? null) !== null;
export type { NoteCalcul };
