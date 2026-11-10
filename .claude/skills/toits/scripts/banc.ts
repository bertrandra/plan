// Banc d'essai d'un village : relance la reconstruction des corps sur les grilles de village-<nom>.json
// avec le code courant, compte les formes produites, liste les batiments suspects et ecrit
// q/<cle>.json pour rendu.py.
//
//   npx tsx .claude/skills/toits/scripts/banc.ts <nom> [--tous] [--profils <profils.json>]
//   npx tsx .claude/skills/toits/scripts/banc.ts <nom> --enregistrer formes-<nom>.json   # avant de modifier
//   npx tsx .claude/skills/toits/scripts/banc.ts <nom> --reference formes-<nom>.json     # apres
//
// Chaque batiment est relu sous les seuils de ses profils de toits (regles/toits/reglages.json,
// facade/regles/toits/profils.ts), comme dans l'application ; `--profils` en essaie d'autres (une liste au format
// de `profils`, verifiee comme le fichier livre) a la place, pour mesurer un profil avant de l'ecrire.
// Le lieu : le departement de l'IDU de la parcelle, la latitude si le JSON du village la donne.
//
// Sortie, dans l'ordre :
// 1. les compteurs (batiments, corps, suspects, sans corps, reprises) : ceux du tableau du skill (§5) ;
// 2. les formes produites (catalogue de MD/spec-regles-toits.md §3.1), par batiment (la forme de son
//    corps principal) puis par corps, et la deduction utilisee (`modele` : model/formeToit.ts du lot
//    G1 ; `locale` : sa copie dans tests/banc/toits/formes.ts tant que G1 n'est pas dans la branche) ;
// 3. avec `--reference` : les compteurs qui ont bouge, les batiments dont la forme change (avant ->
//    apres), ceux dont seul un corps change, et la planche de leurs cartes (rendu.py --montage,
//    $TOITS_DOSSIER/formes-<nom>.png, ou le fichier de `--planche`) ;
// 4. les suspects (40 premiers, ou tous avec --tous).
//
// `--enregistrer` ecrit la reference (formes de chaque batiment et compteurs). Les chemins relatifs
// de `--enregistrer` et `--reference` sont pris dans $TOITS_DOSSIER, comme les JSON des villages.
//
// La ligne d'un batiment : distance au centre de la parcelle, cle, hauteur BD TOPO, sommets du
// contour, `reprise` (contour qui ne se decoupe pas en rectangles), `complet` (calcul entier : projet
// ou mitoyen) ou `leger` (sans coupe par le modele), les formes des corps, puis les soupcons. Elle
// est restee celle d'avant le banc des formes, pour que les listes d'hier se comparent par diff.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.ts';
import { corpsVraisemblables, mesureVraisemblable } from '../../../../src/app/toits/toitsLidar.ts';
import { hauteurBdTopo } from '../../../../src/facade/regles/toits/vraisemblance.ts';
import { rectanglesDuContour } from '../../../../src/model/volumesToit.ts';
import { PROFILS_TOITS, REGLAGES_TOITS, avecSeuilsToit } from '../../../../src/regles/toits/reglages.ts';
import { lireProfilsToits } from '../../../../src/regles/toits/profils.ts';
import { departementDuCode, profilsDuBatiment } from '../../../../src/facade/regles/toits/profils.ts';
import {
  chargerDeduction, formesDuBatiment, lignesFormes, lireReference, changementsDeForme, changementsDeCorps,
  bilanChangements, ecartsCompteurs, ABSENT, type FormesBatiment, type ReferenceFormes, type CompteursBanc,
} from '../../../../tests/banc/toits/formes.ts';
import { corpsSelonFait } from '../../../../src/facade/regles/toits/faits.ts';
import { saillies } from '../../../../src/facade/regles/toits/baies.ts';
import { corpsCalcules } from '../../../../src/facade/regles/toits/catalogue.ts';
import { faitDuBatiment } from '../../../../src/regles/toits/faits.ts';

const S = (process.env.TOITS_DOSSIER || '/tmp/toits').replace(/\/?$/, '/');
const args = process.argv.slice(2);
const option = (nom: string): string | null => {
  const i = args.indexOf(nom);
  if (i < 0) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) throw new Error(nom + ' attend un fichier');
  return v;
};
const dansDossier = (f: string) => (isAbsolute(f) ? f : S + f);
const nom = args[0];
if (!nom || nom.startsWith('--')) throw new Error('usage : banc.ts <nom> [--tous] [--enregistrer f.json] [--reference f.json] [--planche f.png]');
const tous = args.includes('--tous');
const enregistrer = option('--enregistrer');
const referenceLue = option('--reference');
const planche = option('--planche') ?? 'formes-' + nom + '.png';
const reference: ReferenceFormes | null = referenceLue ? lireReference(JSON.parse(readFileSync(dansDossier(referenceLue), 'utf8'))) : null;
const deduction = await chargerDeduction();

const profilsEssayes = option('--profils');
const profils = profilsEssayes ? lireProfilsToits(JSON.parse(readFileSync(profilsEssayes, 'utf8')), Object.keys(REGLAGES_TOITS)) : PROFILS_TOITS;
const D = JSON.parse(readFileSync(S + 'village-' + nom + '.json', 'utf8'));
const lieu = { departement: departementDuCode(D.parcelle), latitude: typeof D.latitude === 'number' ? D.latitude : null, voisins: D.batiments.map((b: any) => ({ cle: b.key, pts: b.pts })) };
mkdirSync(S + 'q', { recursive: true });
const dims = (c: any) => { const [a, b, , d] = c.pts; return [Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - a.x, d.y - a.y)]; };
let nCorps = 0, nSus = 0, nSans = 0, nReprise = 0;
// Les bay windows possibles du contour (facade/regles/toits/baies.ts) : un repere, jamais un toit (spec §3.4 n°9).
const baiesPossibles: string[] = [];
const lignes: string[] = [];
const formes: Record<string, FormesBatiment> = {};
const t0 = performance.now();
for (const b of D.batiments) {
  if (!b.grille) continue;
  const choix = profilsDuBatiment(b, lieu, profils);
  // Comme l'application : calcul entier pour le projet et les mitoyens (ceux qui gardent leur mesure).
  const fort = b.principal || b.mesure;
  // Ses profils (regles/toits/reglages.json) et ses faits (regles/toits/faits.json), comme
  // app/toits/toitsLidar.ts::corpsLus.
  const { m, corps } = avecSeuilsToit(choix.surcharges, () => {
    const m = mesureVraisemblable(b, toitMesureDepuisGrille(b.grille, b.pts));
    return { m, corps: m ? corpsVraisemblables(b, corpsSelonFait(faitDuBatiment(b), corpsCalcules(m, b.pts, { coupes: fort, grille: b.grille, hauteurBdTopo: hauteurBdTopo(b) }), m, b.pts, b.grille)) ?? [] : [] };
  });
  for (const sa of saillies(b.pts)) baiesPossibles.push(`${b.key} ${sa.largeurM} x ${sa.saillieM} m, face a ${sa.azimutDeg} deg`);
  const reprise = !rectanglesDuContour(b.pts);
  if (reprise) nReprise++;
  const h = b.bdtopo?.hauteurRetenueM ?? b.bdtopo?.hauteurM ?? null;
  const pb: string[] = [];
  if (!corps.length) { pb.push(m ? 'sans corps' : 'sans mesure'); nSans++; }
  for (const c of corps) {
    const [L, W] = dims(c); const [e0, e1] = c.egouts; const F = c.faitage, p = c.posFaitage;
    const plat = F - Math.min(e0, e1) < 0.05, app = !plat && (p <= 0.01 || p >= W - 0.01);
    if (Math.min(L, W) < 3 && !c.baie) pb.push(`etroit ${Math.min(L, W).toFixed(1)}`);
    if (app && c.pignons.length) pb.push('appentis+pignon');
    if (!plat && !app && Math.abs(e0 - e1) > 1.5) pb.push(`egouts ${e0}/${e1}`);
    if (Math.min(e0, e1) < 1.5) pb.push(`egout bas ${Math.min(e0, e1)}`);
    if (h && Math.min(e0, e1) > h + 2) pb.push(`egout ${Math.min(e0, e1)}>h${h}`);
    if (c.ecart > 0.5) pb.push(`ecart ${c.ecart}`);
  }
  if (corps.length >= 4) pb.push(`${corps.length} corps`);
  nCorps += corps.length;
  if (pb.length) nSus++;
  // Les jetons d'origine du banc (plat sous 5 cm de montee) : la forme du catalogue est a part, plus bas.
  const jetons = corps.map((c: any) => { const [, W] = dims(c); const plat = c.faitage - Math.min(...c.egouts) < 0.05; return plat ? 'plat' : c.croupes ? '4p' : (c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01) ? '1p' : '2p'; });
  lignes.push(`${pb.length ? '!' : ' '} ${String(b.d).padStart(3)} ${b.key} h${h} ${b.pts.length}pts${reprise ? ' reprise' : ''} ${fort ? 'complet' : 'leger'}${choix.applicables.length ? ' profils ' + choix.applicables.join('+') : ''} [${jetons.join(' ')}] ${pb.join(', ')}`);
  formes[b.key] = formesDuBatiment(deduction, corps, !!m);
  writeFileSync(S + 'q/' + b.key + '.json', JSON.stringify({ key: b.key, pts: b.pts, grille: b.grille, corps, pb, forme: formes[b.key].forme }));
}
const compteurs: CompteursBanc = { batiments: D.batiments.length, corps: nCorps, suspects: nSus, sansCorps: nSans, reprise: nReprise };
console.log(nom, 'temps', (performance.now() - t0).toFixed(0), 'ms batiments', D.batiments.length, 'corps', nCorps, 'suspects', nSus, 'sans corps', nSans, 'contours en reprise', nReprise);
console.log('bay windows possibles (saillies du contour) :', baiesPossibles.length, ...baiesPossibles.map((l) => '\n  ' + l));
for (const l of lignesFormes(formes)) console.log(l);
console.log('deduction des formes :', deduction.source === 'modele' ? 'model/formeToit.ts' : 'locale (tests/banc/toits/formes.ts, G1 absent)');

if (enregistrer) {
  const commit = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } })();
  const ref: ReferenceFormes = { version: 1, village: nom, date: new Date().toISOString(), commit, deduction: deduction.source, compteurs, batiments: formes };
  writeFileSync(dansDossier(enregistrer), JSON.stringify(ref, null, 1));
  console.log('reference enregistree :', dansDossier(enregistrer));
}

if (reference) comparer(reference);

const choisies = tous ? lignes : lignes.filter((l) => l.startsWith('!')).sort((a, b) => b.length - a.length).slice(0, 40);
console.log(choisies.join('\n'));

/** La comparaison a la reference : compteurs, formes qui changent, planche de leurs cartes. */
function comparer(ref: ReferenceFormes): void {
  console.log(`reference : ${ref.village}, ${ref.date.slice(0, 16)}${ref.commit ? ', ' + ref.commit : ''}`);
  if (ref.village !== nom) console.log('  attention : la reference est celle d\'un autre village');
  if (ref.deduction !== deduction.source) console.log(`  attention : formes deduites autrement (${ref.deduction} -> ${deduction.source})`);
  const ecarts = ecartsCompteurs(ref.compteurs, compteurs);
  console.log('compteurs :', ecarts.length ? ecarts.join(', ') : 'identiques');
  const ch = changementsDeForme(ref.batiments, formes);
  const corpsSeuls = changementsDeCorps(ref.batiments, formes);
  console.log(`formes qui changent : ${ch.length} batiment(s)${ch.length ? ' (' + bilanChangements(ch).join(', ') + ')' : ''}`);
  for (const c of ch) console.log(`  ${c.cle} ${c.avant} -> ${c.apres}`);
  console.log(`corps qui changent, meme forme d'ensemble : ${corpsSeuls.length}`);
  for (const cle of corpsSeuls) console.log(`  ${cle} [${ref.batiments[cle]?.corps.join(' ')}] -> [${formes[cle]?.corps.join(' ')}]`);
  const cartes = [...ch.filter((c) => c.apres !== ABSENT).map((c) => c.cle), ...corpsSeuls];
  if (cartes.length) dessinerPlanche(cartes);
}

/** La planche des cartes des batiments qui changent (40 au plus, quatre par ligne), par rendu.py. */
function dessinerPlanche(cles: string[]): void {
  const MAX_PLANCHE = 40;
  const rendu = fileURLToPath(new URL('./rendu.py', import.meta.url));
  const r = spawnSync('python3', [rendu, '--montage', planche, ...cles.slice(0, MAX_PLANCHE)], { env: { ...process.env, TOITS_DOSSIER: S }, encoding: 'utf8' });
  if (r.status === 0) console.log(`planche : ${dansDossier(planche)}${cles.length > MAX_PLANCHE ? ` (${MAX_PLANCHE} premiers sur ${cles.length})` : ''}`);
  else console.log('planche non dessinee :', (r.stderr || String(r.error ?? '')).trim().split('\n').pop());
}
