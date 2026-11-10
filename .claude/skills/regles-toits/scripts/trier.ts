// Premier tri des cas d'un fichier de promenade (MD/spec-regles-toits.md §10, point 2) : pour chaque
// cas, le niveau que ses problemes suggerent (hors toit, fait, reglage, regle, question), les seuils
// de regles/toits/reglages.json qui touchent ces problemes, le fait qui vise deja le batiment, et un
// squelette de fait a completer. Le tri definitif est le votre : ce script ne lit pas la photo, et
// « a voir » veut dire que seuls la carte, la 3D et la photo tranchent.
//
//   npx tsx .claude/skills/regles-toits/scripts/trier.ts audit-2026-10-13-0905-le-vesinet.json
//   npx tsx .claude/skills/regles-toits/scripts/trier.ts --faits /tmp/faits-essai.json audit-….json
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { lireFichierPromenade, PROBLEMES_AUDIT, type CasAudit } from '../../../../src/model/audit.ts';
import { rejouerCas } from '../../../../src/facade/regles/rejeu.ts';
import { formeDuCorps, ecartsAuFait } from '../../../../src/facade/regles/toits/faits.ts';
import { lireFaitsToits, faitDuBatiment, faitsEnVigueur, signatureFait } from '../../../../src/regles/toits/faits.ts';
import { REGLAGES_TOITS } from '../../../../src/regles/toits/reglages.ts';
import { faitCandidat } from '../../../../src/facade/regles/toits/candidatFait.ts';

const args = process.argv.slice(2);
const iFaits = args.indexOf('--faits');
const faits = iFaits >= 0 ? lireFaitsToits(JSON.parse(readFileSync(args[iFaits + 1] ?? '', 'utf8'))) : faitsEnVigueur();
const chemin = args.filter((_, i) => iFaits < 0 || (i !== iFaits && i !== iFaits + 1))[0];
if (!chemin) throw new Error('usage : trier.ts [--faits faits.json] <fichier de promenade>');

/** Ce qu'un probleme coche suggere d'abord, et les seuils qui le gouvernent (skill toits, §3 et §8). */
const PISTES: Record<string, { niveau: string; seuils: string[] }> = {
  'toit.sens-faitage': { niveau: 'a voir (fait si isole, reglage si ses semblables le confirment)', seuils: ['GAIN_SENS'] },
  'toit.forme': { niveau: 'a voir (fait si la mesure ne tranche pas)', seuils: ['GAIN_CROUPES', 'TOLERANCE_APPENTIS', 'GAIN_PAN_SUR_PLAT', 'HAUTEUR_PLAT_M', 'PENTE_PLAT_DEG'] },
  'toit.position-faitage': { niveau: 'reglage', seuils: ['PAN_MIN_M', 'TOLERANCE_APPENTIS', 'TOLERANCE_APPENTIS_M'] },
  'toit.hauteur': { niveau: 'a voir', seuils: ['DEPASSEMENT_GARDE_M', 'ECART_ABERRANT_M'] },
  'toit.pignon-manquant': { niveau: 'reglage', seuils: ['SURPLUS_PIGNON_M', 'LARGEUR_PIGNON_MIN_M', 'PROFONDEUR_PIGNON_MIN_M'] },
  'toit.pignon-en-trop': { niveau: 'reglage', seuils: ['SURPLUS_PIGNON_M', 'LARGEUR_PIGNON_MAX_M', 'PROFONDEUR_PIGNON_MIN_M'] },
  'toit.morceaux': { niveau: 'reglage ou regle', seuils: ['SEUIL_MARCHE_M', 'TOLERANCE_REFONTE', 'TOLERANCE_BANDE', 'LARGEUR_BANDE_M', 'CONTINUITE_M', 'PART_SOUS_PLUS_GRAND'] },
  'toit.fusion': { niveau: 'reglage', seuils: ['SEUIL_MARCHE_M', 'GAIN_COUPE', 'ECART_COUPE_MIN_M', 'DIFFERENCE_COUPE_M'] },
  'toit.trou': { niveau: 'reglage', seuils: ['PART_COMPLETION_MIN', 'EGOUT_ETENDU_MIN_M', 'SOUS_EGOUT_ETENDU_M', 'COMPLETION_MAX_M'] },
  'toit.vegetation': { niveau: 'reglage', seuils: ['DEPASSEMENT_VEGETATION_M'] },
  'toit.cheval': { niveau: 'question (app/toits/toitsACheval.ts)', seuils: ['AIRE_A_CHEVAL_MIN_M2', 'PART_A_CHEVAL_MIN', 'AIRE_CORPS_DE_CHAQUE_COTE_M2'] },
  'toit.absent': { niveau: 'a voir (fait en remplacement si la mesure manque)', seuils: ['ECART_MAX_M', 'GAIN_APPENTIS_SECOURS'] },
  'toit.couverture': { niveau: 'hors toit (couverture : couleur ou materiau)', seuils: [] },
  'toit.autre': { niveau: 'a voir (lire la note)', seuils: [] },
  'facade.couleur': { niveau: 'hors toit (murs)', seuils: [] },
  'facade.materiau': { niveau: 'hors toit (murs)', seuils: [] },
  'facade.fenetres': { niveau: 'hors toit (ouvertures)', seuils: [] },
  'contour.decale': { niveau: 'hors toit (contour : recalage, ou signalement IGN)', seuils: ['PART_VIDE_RECALAGE', 'DECALAGE_MAX_M'] },
  'contour.forme': { niveau: 'hors toit (contour : signalement IGN)', seuils: [] },
  'contour.existence': { niveau: 'hors toit (batiment absent ou demoli : signalement IGN)', seuils: [] },
  'hauteur.murs': { niveau: 'reglage', seuils: ['ECART_EGOUT_MIN_M'] },
  autre: { niveau: 'a voir (lire la note)', seuils: [] },
};
const libelle = new Map(PROBLEMES_AUDIT.map((p) => [p.code, p.libelle]));
const seuilConnu = (n: string): boolean => n in REGLAGES_TOITS;

/** Un squelette de fait pour ce cas : l'observation reste a ecrire, depuis la fiche et la photo. */
function squelette(c: CasAudit, promenade: string): string | null {
  const cle = c.identite.cleBdtopo;
  if (!cle) return null;
  return JSON.stringify({ [cle]: {
    observation: { forme: '?', faitage: { par: 'azimut', azimutDeg: c.constat.photos[0]?.prise?.azimutDeg ?? '?' }, corps: { min: 1, max: 1 } },
    application: 'contrainte',
    preuve: { promenade, cas: c.id, photo: c.constat.photos.length > 0 },
    ...(c.identite.adresse ? { adresse: c.identite.adresse } : {}),
    historique: [{ t: new Date().toISOString().slice(0, 10), texte: 'observe sur le terrain ; a valider' }],
  } });
}

const f = lireFichierPromenade(JSON.parse(readFileSync(chemin, 'utf8')));
const nom = basename(chemin);
console.log(`# ${nom} : ${f.promenade.commune ?? '?'}, ${f.cas.length} cas`);
for (const c of f.cas) {
  const r = rejouerCas(c, faits, { latitude: f.promenade.origine?.lat ?? null });
  const formes = (r.sorties.corps ?? []).map(formeDuCorps).join(' ') || 'aucun corps';
  const pistes = c.constat.problemes.map((p) => ({ p, ...(PISTES[p] ?? { niveau: 'a voir', seuils: [] }) }));
  const fait = faitDuBatiment({ bdtopo: c.entrees.bdtopo }, faits);
  console.log(`\n## ${c.id} ${c.statut} ${c.identite.adresse ?? c.cle} (${c.identite.cleBdtopo ?? 'sans cle BD TOPO'}) : ${formes}`);
  if (c.constat.note) console.log(`   note : ${c.constat.note}`);
  console.log(`   photos : ${c.constat.photos.length}${c.constat.photos[0]?.prise ? `, azimut ${c.constat.photos[0].prise.azimutDeg ?? '?'}` : ''}`);
  for (const x of pistes) console.log(`   - ${x.p} (${libelle.get(x.p) ?? '?'}) -> ${x.niveau}${x.seuils.length ? ' ; seuils : ' + x.seuils.filter(seuilConnu).map((s) => s + '=' + REGLAGES_TOITS[s as keyof typeof REGLAGES_TOITS]).join(', ') : ''}`);
  if (!pistes.length) console.log('   - aucun probleme coche : un cas de reference (valider son attendu) ou une note a lire');
  if (fait) { const e = ecartsAuFait(fait, r.sorties.corps, c.entrees.pts); console.log(`   fait en vigueur : ${signatureFait(fait)} ; ${e.length ? 'non tenu : ' + e.join(', ') : 'tenu'}`); }
  else {
    // Le fait que « Ce que je vois » et la photo du cas permettent d'ecrire, et ce qu'ils laissent a verifier (src/facade/regles/toits/candidatFait.ts).
    const cand = faitCandidat(c, nom) ;
    if (cand && Object.keys(cand.fait.observation).length) console.log('   fait candidat (regles/toits/faits.json) :\n     ' + JSON.stringify({ [cand.cle]: cand.fait }));
    else if (pistes.some((x) => x.niveau.includes('fait'))) { const s = squelette(c, nom); if (s) console.log('   squelette de fait (rien de ce que vous avez vu ne s\'ecrit encore) :\n     ' + s); }
    for (const v of cand?.aVerifier ?? []) console.log('   a verifier : ' + v);
    for (const v of cand?.pistes ?? []) console.log('   piste : ' + v);
  }
}
