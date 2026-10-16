// Rejeu d'un fichier de promenade (ou d'un dossier de fichiers) avec le code courant
// (MD/spec-audit.md §22, MD/spec-regles-toits.md §8) : chaque cas est relu sans reseau sur ses
// entrees figees, puis compare a ses `sorties` (ce que le code avait produit sur le terrain) et a son
// `attendu` (ce que vous avez valide). Ecrit q/<cle>.json (le rejeu) et q/<cle>-terrain.json (les
// sorties notees) pour rendu.py, comme banc.ts.
//
//   npx tsx .claude/skills/toits/scripts/audit.ts tests/fixtures/audit/              # tout le corpus
//   npx tsx .claude/skills/toits/scripts/audit.ts audit-2026-10-13-0912-le-vesinet.json
//   python3 .claude/skills/toits/scripts/rendu.py --montage audit.png bati-vesinet-ae101 bati-vesinet-ae101-terrain
//   npx tsx .claude/skills/toits/scripts/audit.ts --faits /tmp/faits-essai.json audit-….json   # avec d'autres faits
//
// `--faits` rejoue avec un autre regles/toits/faits.json (celui qu'une PR propose) : les fichiers de
// rendu sont alors ceux d'apres, a mettre a cote de ceux d'avant (TOITS_DOSSIER different). Un cas
// dont le batiment a un fait le dit (`fait :`), avec ce que les corps n'en tiennent pas encore.
//
// La ligne d'un cas : fichier et cas, statut, problemes notes, puis ce qui a change depuis le terrain
// (`terrain :`), ce qui s'ecarte de l'attendu (`attendu :`, seulement pour un cas qui en a un) et ce
// que le rejeu propose sans le cocher (`propose :`, facade.couleur quand une facade lue sur photo
// s'ecarte de la couleur retenue, spec §18.4). Le code de sortie est 1 si un cas `valide` a bouge :
// c'est ce que tests/unit/facade/audit.test.ts refuse en CI.
//
// Un fichier d'audit de parcelle (`plan-audit-parcelle`, lot L21), seul ou dans le dossier, n'a pas de
// cas de toit a rejouer : ses facades relevees sont mesurees (lot G11, model/mesureFacade.ts), une
// ligne par facade, comme le fait .claude/skills/facades/scripts/mesures.ts.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { lireFichierPromenade, type CasAudit, type SortiesCas } from '../../../../src/model/audit.ts';
import { rejouerCas, ecartsSorties, facadesEcartees, propositionsAuRejeu, type EcartSorties } from '../../../../src/facade/regles/rejeu.ts';
import { EMPREINTE_REGLAGES_TOITS } from '../../../../src/regles/toits/reglages.ts';
import { lireFaitsToits, faitDuBatiment, faitsEnVigueur, empreinteFaitsToits, signatureFait } from '../../../../src/regles/toits/faits.ts';
import { ecartsAuFait } from '../../../../src/facade/regles/toits/faits.ts';
import { VERSION_LECTURE_TOITS } from '../../../../src/app/toitsLidar.ts';
import { FORMAT_AUDIT_PARCELLE, lireFichierAuditParcelle } from '../../../../src/model/fichierAuditParcelle.ts';
import { lignesAuditParcelle } from '../../../../tests/banc/facades/mesuresFacades.ts';

const S = (process.env.TOITS_DOSSIER || '/tmp/toits').replace(/\/?$/, '/');
const args = process.argv.slice(2);
const iFaits = args.indexOf('--faits');
const faits = iFaits >= 0 ? lireFaitsToits(JSON.parse(readFileSync(args[iFaits + 1] ?? '', 'utf8'))) : faitsEnVigueur();
const cible = args.filter((_, i) => iFaits < 0 || (i !== iFaits && i !== iFaits + 1))[0];
if (!cible) throw new Error('usage : audit.ts [--faits faits.json] <fichier de promenade | dossier>');
const fichiers = statSync(cible).isDirectory() ? readdirSync(cible).filter((f) => f.endsWith('.json')).sort().map((f) => join(cible, f)) : [cible];
mkdirSync(S + 'q', { recursive: true });

/** Ce que la CI compare sur un cas valide (spec §23) ; le tableau compare tout aux sorties du terrain. */
const CHAMPS_VALIDES: EcartSorties['champ'][] = ['corps', 'couleurMurs', 'sourceMurs'];
const dire = (e: readonly EcartSorties[]) => e.map((x) => `${x.champ} ${x.avant} -> ${x.apres}`).join(', ');
const formes = (corps: SortiesCas['corps']) => (corps ?? []).map((c) => {
  const [a, , , d] = c.pts; const W = a && d ? Math.hypot(d.x - a.x, d.y - a.y) : 0;
  const plat = c.faitage - Math.min(...c.egouts) < 0.05;
  return plat ? 'plat' : c.croupes ? '4p' : (c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01) ? '1p' : '2p';
}).join(' ');
/** La cle des fichiers de rendu.py, qui prefixe `bati-batiment-` a ce qui ne commence pas par `bati-`. */
const cleRendu = (c: CasAudit) => (c.cle.startsWith('bati-') ? c.cle : 'bati-' + c.cle);

let valides = 0, valideBouge = 0, aTraiter = 0, prets = 0, proposes = 0, parcelles = 0;
const lignes: string[] = [];
for (const chemin of fichiers) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8')) as { format?: string };
  if (brut.format === FORMAT_AUDIT_PARCELLE) {
    parcelles++;
    lignes.push(...lignesAuditParcelle(lireFichierAuditParcelle(brut), basename(chemin)));
    continue;
  }
  const f = lireFichierPromenade(brut);
  const regles = f.promenade.regles;
  const versions = `lecture ${regles.lectureToits ?? '?'} -> ${VERSION_LECTURE_TOITS}` + (regles.reglagesToits ? `, reglages ${regles.reglagesToits} -> ${EMPREINTE_REGLAGES_TOITS}` : '');
  lignes.push(`# ${basename(chemin)} : ${f.promenade.commune ?? '?'}, ${f.cas.length} cas, code ${f.promenade.code.version} (${f.promenade.code.commit ?? '?'}), ${versions}`);
  for (const c of f.cas) {
    const r = rejouerCas(c, faits, { latitude: f.promenade.origine?.lat ?? null });
    const fait = faitDuBatiment({ bdtopo: c.entrees.bdtopo }, faits);
    const terrain = c.sorties ? ecartsSorties(r.sorties, c.sorties) : [];
    const attendu = c.attendu ? ecartsSorties(r.sorties, c.attendu, CHAMPS_VALIDES) : null;
    const propose = propositionsAuRejeu(c, r.sorties);
    const pb: string[] = [];
    if (!r.rejoue) pb.push('sans grille : toit non rejoue');
    if (terrain.length) pb.push('terrain : ' + dire(terrain));
    if (attendu?.length) pb.push('attendu : ' + dire(attendu));
    if (fait) { const e = ecartsAuFait(fait, r.sorties.corps, c.entrees.pts); pb.push('fait : ' + signatureFait(fait) + (e.length ? ' (non tenu : ' + e.join(', ') + ')' : ' (tenu)')); }
    if (propose.length) pb.push('propose : ' + propose.join(', ') + ' (' + facadesEcartees(c, r.sorties).map((e) => `mur ${e.cote} lu ${e.lue}, retenu ${e.retenue}, ecart ${e.ecart}`).join(' ; ') + ')');
    if (c.statut === 'valide') { valides++; if (attendu?.length) valideBouge++; }
    if (c.statut === 'a_corriger' || c.statut === 'corrige') { aTraiter++; if (attendu && !attendu.length) { prets++; pb.push('satisfait son attendu : pret a valider'); } }
    if (propose.length) proposes++;
    const marque = c.statut === 'valide' && attendu?.length ? 'X' : pb.length ? '!' : ' ';
    lignes.push(`${marque} ${c.id.padEnd(4)} ${c.statut.padEnd(10)} ${cleRendu(c)} [${formes(r.sorties.corps)}] {${c.constat.problemes.join(' ')}} ${pb.join(' | ')}`);
    const key = cleRendu(c);
    if (c.entrees.grille) {
      writeFileSync(S + 'q/' + key + '.json', JSON.stringify({ key, pts: c.entrees.pts, grille: c.entrees.grille, corps: r.sorties.corps ?? [], pb: ['rejeu', ...pb] }));
      writeFileSync(S + 'q/' + key + '-terrain.json', JSON.stringify({ key: key + '-terrain', pts: c.entrees.pts, grille: c.entrees.grille, corps: c.sorties?.corps ?? [], pb: ['terrain', c.statut] }));
    }
  }
}
console.log(`audit : ${fichiers.length} fichier(s)${parcelles ? ' dont ' + parcelles + ' audit(s) de parcelle' : ''}, ${valides} cas valide(s) dont ${valideBouge} qui bouge(nt), ${aTraiter} a traiter dont ${prets} pret(s) a valider, ${proposes} proposition(s) ; reglages ${EMPREINTE_REGLAGES_TOITS}, faits ${empreinteFaitsToits(faits)} (${Object.keys(faits).length}${iFaits >= 0 ? ', ' + args[iFaits + 1] : ''}), lecture ${VERSION_LECTURE_TOITS}`);
console.log(lignes.join('\n'));
process.exitCode = valideBouge ? 1 : 0;
