// La mesure x1 contre x3 du run d'une facade (MD/spec-facade-calage-audit.md §8, §11.2, lot F2) : sur les scenes du banc, ce que vaut
// une passe de Claude, et ce que le vote de trois passes lui ajoute, contre son cout. Trois temps, pour que le reseau reste a part :
//
//   npx tsx .claude/skills/facades/scripts/ia-x1-x3.ts --preparer <dossier> [mots]   les images (l'assemblage, au plus 1 024 px), le texte
//                                                                                    et la verite de chaque scene a prise par camera
//   node scripts/verifier-api-claude.mjs --facades <dossier>                         avec la cle : x1 et x3 par le serveur PHP, reponses
//                                                                                    et cout ecrits dans <dossier>/<scene>.reponses.json
//   npx tsx .claude/skills/facades/scripts/ia-x1-x3.ts --evaluer <dossier>           le tableau x1 contre x3, en Markdown
//
// Sans cle : `--simuler <dossier>` ecrit des reponses SYNTHETIQUES (tests/banc/facades/runIa.ts, pas Claude) et un cout ESTIME
// (tokens : l'image en w x h / 750, le texte en caracteres / 3,5 ; prix : la table du serveur, deploy/claude-tarifs.json, au tarif
// normal de l'appel immediat), pour faire tourner la mesure de bout en bout. Le tableau dit d'ou viennent ses chiffres.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { casIaDeScene, mesurerReponse, sortieSynthetique, type CasIa, type MesureIa } from '../../../../tests/banc/facades/runIa.ts';
import { png } from '../../../../tests/banc/facades/png.ts';
import { lireLectureEnrichie, lireLectureToit, lireObservationsFacade, texteRunFacade, type ObservationsFacade } from '../../../../src/regles/facades/observations.ts';
import { voterObservations } from '../../../../src/facade/regles/facades/ia.ts';
import { genererRunFacade } from '../../../../src/regles/sujets/generation.ts';
import type { Image } from '../../../../src/facade/vision/homographie.ts';

const racine = resolve(import.meta.dirname, '../../../..');
const args = process.argv.slice(2);
const mode = args[0];
const dossier = args[1];
const mots = args.slice(2);
if (!mode || !['--preparer', '--simuler', '--evaluer'].includes(mode) || !dossier) {
  console.error('usage : ia-x1-x3.ts --preparer|--simuler|--evaluer <dossier> [mots]');
  process.exit(2);
}

/** L'image reduite sous `max` px de cote, par moyenne des pixels : ce que la page enverrait (render/imageFacade.ts, 1 024 px). */
function reduire(img: Image, max = 1024): Image {
  const k = Math.max(1, Math.max(img.largeur, img.hauteur) / max);
  if (k === 1) return img;
  const L = Math.round(img.largeur / k), H = Math.round(img.hauteur / k), d = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const s = [0, 0, 0, 0];
    let n = 0;
    for (let yy = Math.floor(y * k); yy < Math.min(img.hauteur, Math.floor((y + 1) * k)); yy++) for (let xx = Math.floor(x * k); xx < Math.min(img.largeur, Math.floor((x + 1) * k)); xx++) {
      const i = (yy * img.largeur + xx) * 4;
      for (let c = 0; c < 4; c++) s[c] = (s[c] as number) + (img.donnees[i + c] ?? 0);
      n++;
    }
    for (let c = 0; c < 4; c++) d[(y * L + x) * 4 + c] = n ? (s[c] as number) / n : 0;
  }
  return { largeur: L, hauteur: H, donnees: d };
}

interface Verite { nom: string; image: { largeur: number; hauteur: number }; graine: number; verite: CasIa['verite'] }
/** Ce que le verificateur ecrit (scripts/verifier-api-claude.mjs --facades) : par mode, les sorties, les tokens et le cout. */
interface Appel {
  modele: string; prompt: number; schema: number; sorties: unknown[]; tokens: { entree: number; sortie: number }; cout: number | null; secondes?: number;
  /** Les passes envoyees et celles dont la reponse ne s'est pas lue (absents des reponses simulees : toutes lues). */
  passes?: number; illisibles?: number;
}
/** `enrichie` : la lecture enrichie (lot L1, usage `facade-enrichie`), trois passes sur la meme image ; absente des reponses d'avant. */
/** `toit` : le toit lu (lot L2, usage `facade-toit`), trois passes sur la meme image ; absent des reponses d'avant. */
interface FichierReponses { source: 'claude' | 'synthetique'; x1: Appel; x3: Appel; enrichie?: Appel & { structurees?: number }; toit?: Appel & { structurees?: number } }

const casDuDossier = (): Verite[] => readdirSync(dossier).filter((f) => f.endsWith('.verite.json')).sort().map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')) as Verite);

if (mode === '--preparer') {
  mkdirSync(dossier, { recursive: true });
  let n = 0;
  for (const s of chargerCorpus()) {
    if (mots.length && !mots.some((m) => s.nom.includes(m))) continue;
    const c = casIaDeScene(s);
    if (!c) continue;
    // La verite se ramene a l'image reduite : le mur en pixels change d'echelle, le reste est en parts du mur.
    // Ce que l'assemblage ne montre pas part en gris, comme la page l'envoie (render/imageFacade.ts::dessinerImageFacade).
    const gris = new Uint8ClampedArray(c.image.donnees);
    if (c.vu) c.vu.forEach((v, i) => { if (!v) gris.set([128, 128, 128, 255], i * 4); });
    const img = reduire({ ...c.image, donnees: gris }), k = img.largeur / c.image.largeur;
    const verite = { ...c.verite, mur: { x0: c.verite.mur.x0 * k, x1: c.verite.mur.x1 * k, y0: c.verite.mur.y0 * k, y1: c.verite.mur.y1 * k } };
    writeFileSync(join(dossier, s.nom + '.png'), png(img));
    writeFileSync(join(dossier, s.nom + '.texte.txt'), texteRunFacade({ etiquette: s.nom + ' (scène de synthèse)', image: 'assemblage', pointes: c.verite.pointes }));
    writeFileSync(join(dossier, s.nom + '.verite.json'), JSON.stringify({ nom: s.nom, image: { largeur: img.largeur, hauteur: img.hauteur }, graine: s.synthese.graine, verite } satisfies Verite));
    n++;
  }
  console.log(n + ' scènes préparées dans ' + dossier + ' (image, texte, vérité).');
}

if (mode === '--simuler') {
  // Le cout estime d'une passe : l'image et le texte en entree (le prompt et le schema en cache, ecrits une fois), la sortie au JSON.
  const tarif = (JSON.parse(readFileSync(join(racine, 'deploy/claude-tarifs.json'), 'utf8')) as { lignes: { modele: string; entree: number; ecritureCache5m: number; lectureCache: number; sortie: number }[] }).lignes.find((l) => l.modele === 'claude-haiku-5-5');
  const systeme = Math.round((genererRunFacade().prompt.length + genererRunFacade().schema.length) / 3.5);
  for (const v of casDuDossier()) {
    const c: CasIa = { nom: v.nom, photos: [], image: { largeur: v.image.largeur, hauteur: v.image.hauteur, donnees: new Uint8ClampedArray(0) }, verite: v.verite };
    const sorties = [0, 1, 2].map((p) => sortieSynthetique(c, p, v.graine));
    const texte = readFileSync(join(dossier, v.nom + '.texte.txt'), 'utf8');
    const entree = Math.round((v.image.largeur * v.image.hauteur) / 750 + texte.length / 3.5);
    const appel = (s: object[]): Appel => {
      const sortie = s.reduce((t: number, x) => t + Math.round(JSON.stringify(x).length / 3.5), 0);
      // La premiere passe ecrit le cache du system, les suivantes le lisent.
      const cout = tarif ? ((entree * s.length) * tarif.entree + systeme * tarif.ecritureCache5m + systeme * (s.length - 1) * tarif.lectureCache + sortie * tarif.sortie) / 1e6 : null;
      return { modele: 'synthetique', prompt: 1, schema: 1, sorties: s, tokens: { entree: entree * s.length + systeme * s.length, sortie }, cout };
    };
    writeFileSync(join(dossier, v.nom + '.reponses.json'), JSON.stringify({ source: 'synthetique', x1: appel(sorties.slice(1, 2)), x3: appel(sorties) } satisfies FichierReponses));
  }
  console.log('Réponses SYNTHÉTIQUES écrites (pas Claude) : de quoi faire tourner --evaluer sans clé ; le coût est estimé.');
}

if (mode === '--evaluer') {
  // Une passe illisible (sortie non JSON, hors du schema) n'est pas une facade mal lue : elle est comptee a part, et une facade dont
  // aucune passe ne s'est lue sort des totaux de qualite. Les totaux se donnent par mode, puis sur les facades lues dans les deux
  // modes, la seule comparaison honnete de x1 contre x3.
  const pc = (x: number) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + ' %';
  const lignes = ['| Scène | Mode | Passes lues | Pose (pire bord) | Pointes justes | Boîtes VP / vraies / trouvées | Cotes méd. | Carreaux justes / lus | Tokens (entrée / sortie) | Coût |', '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|'];
  type Lu = { nom: string; mesure: MesureIa | null; passes: number; illisibles: number; cout: number };
  const enrichies: { passes: number; lues: number; structurees: number; cout: number }[] = [], toits: typeof enrichies = [];
  const couvertures = new Map<string, number>();
  const parMode: Record<'x1' | 'x3', Lu[]> = { x1: [], x3: [] };
  let source = '';
  for (const v of casDuDossier()) {
    const f = join(dossier, v.nom + '.reponses.json');
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, 'utf8')) as FichierReponses;
    source = r.source;
    const c: CasIa = { nom: v.nom, photos: [], image: { largeur: v.image.largeur, hauteur: v.image.hauteur, donnees: new Uint8ClampedArray(0) }, verite: v.verite };
    if (r.toit) {
      const lus = r.toit.sorties.map(lireLectureToit).filter((x) => x !== null);
      toits.push({ passes: r.toit.passes ?? r.toit.sorties.length, lues: lus.length, structurees: r.toit.structurees ?? 0, cout: r.toit.cout ?? 0 });
      for (const x of lus) { const k = (x.toit.couverture ?? 'indetermine') + '/' + (x.toit.pose ?? 'indetermine'); couvertures.set(k, (couvertures.get(k) ?? 0) + 1); }
    }
    if (r.enrichie) enrichies.push({ passes: r.enrichie.passes ?? r.enrichie.sorties.length, lues: r.enrichie.sorties.filter((x) => lireLectureEnrichie(x)).length, structurees: r.enrichie.structurees ?? 0, cout: r.enrichie.cout ?? 0 });
    for (const m of ['x1', 'x3'] as const) {
      const a = r[m], lues = a.sorties.map(lireObservationsFacade).filter((x): x is ObservationsFacade => x !== null);
      const passes = a.passes ?? a.sorties.length, illisibles = passes - lues.length;
      const mesure = lues.length ? mesurerReponse(c, voterObservations(lues)) : null;
      parMode[m].push({ nom: v.nom, mesure, passes, illisibles, cout: a.cout ?? 0 });
      const lu = lues.length + ' / ' + passes;
      if (!mesure) { lignes.push(`| ${v.nom} | ${m} | ${lu} | illisible | | | | | ${a.tokens.entree} / ${a.tokens.sortie} | ${a.cout === null ? '—' : a.cout.toFixed(5) + ' $'} |`); continue; }
      lignes.push(`| ${v.nom} | ${m} | ${lu} | ${mesure.pose === null ? '—' : pc(mesure.pose)} | ${mesure.pointes.justes} / ${mesure.pointes.attendues} | ${mesure.boites.vp} / ${mesure.boites.vraies} / ${mesure.boites.trouvees} | ${mesure.boites.cotesCm === null ? '—' : Math.round(mesure.boites.cotesCm) + ' cm'} | ${mesure.carreaux.justes} / ${mesure.carreaux.lus} | ${a.tokens.entree} / ${a.tokens.sortie} | ${a.cout === null ? '—' : a.cout.toFixed(5) + ' $'} |`);
    }
  }
  const total = (l: Lu[], etiquette: string, m: string) => {
    const t = { vp: 0, vraies: 0, trouvees: 0, pointes: 0, attendues: 0, carreaux: 0, lus: 0, poses: [] as number[] };
    for (const x of l) {
      if (!x.mesure) continue;
      const k = x.mesure;
      t.vp += k.boites.vp; t.vraies += k.boites.vraies; t.trouvees += k.boites.trouvees; t.pointes += k.pointes.justes; t.attendues += k.pointes.attendues;
      t.carreaux += k.carreaux.justes; t.lus += k.carreaux.lus; if (k.pose !== null) t.poses.push(k.pose);
    }
    const med = [...t.poses].sort((a, b) => a - b)[Math.floor(t.poses.length / 2)];
    const lues = l.filter((x) => x.mesure).length, passes = l.reduce((s, x) => s + x.passes, 0), illisibles = l.reduce((s, x) => s + x.illisibles, 0), cout = l.reduce((s, x) => s + x.cout, 0);
    return `| **${etiquette}** | ${m} | façades ${lues} / ${l.length}, passes illisibles ${illisibles} / ${passes} | méd. ${med === undefined ? '—' : pc(med)} | ${t.pointes} / ${t.attendues} | rappel ${t.vraies ? pc(t.vp / t.vraies) : '—'}, précision ${t.trouvees ? pc(t.vp / t.trouvees) : '—'} | | ${t.carreaux} / ${t.lus} | | ${cout.toFixed(4)} $ (${l.length ? (cout / l.length).toFixed(5) : '—'} $ par façade) |`;
  };
  for (const m of ['x1', 'x3'] as const) lignes.push(total(parMode[m], 'Façades lues', m));
  // La lecture enrichie (lot L1) : une seconde requete, trois passes ; sa qualite ne se mesure pas ici (le banc n'a pas de verite
  // pour elle), son cout et ses passes lisibles si. Le cout d'une facade lue en production est celui du run x3 et de cette lecture.
  if (enrichies.length) {
    const e = enrichies.reduce((t, x) => ({ passes: t.passes + x.passes, lues: t.lues + x.lues, structurees: t.structurees + x.structurees, cout: t.cout + x.cout }), { passes: 0, lues: 0, structurees: 0, cout: 0 });
    const run = parMode.x3.reduce((t, x) => t + x.cout, 0);
    lignes.push(`| **Lecture enrichie** | x3 | façades ${enrichies.length}, passes lisibles ${e.lues} / ${e.passes}, sortie structurée ${e.structurees} / ${e.passes} | | | | | | | ${e.cout.toFixed(4)} $ (${(e.cout / enrichies.length).toFixed(5)} $ par façade) |`);
    lignes.push(`| **Run x3 + lecture enrichie** | | | | | | | | | ${((run + e.cout) / Math.max(1, parMode.x3.length)).toFixed(5)} $ par façade |`);
    // Le toit lu (lot L2) : une troisieme requete, trois passes ; le banc n'a pas de verite pour le toit, ses passes lisibles, ce
    // qu'il lit (couverture / pose, sur toutes les passes) et son cout se disent.
    if (toits.length) {
      const t = toits.reduce((a, x) => ({ passes: a.passes + x.passes, lues: a.lues + x.lues, structurees: a.structurees + x.structurees, cout: a.cout + x.cout }), { passes: 0, lues: 0, structurees: 0, cout: 0 });
      const lus = [...couvertures].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ×' + n).join(', ');
      lignes.push(`| **Toit lu** | x3 | façades ${toits.length}, passes lisibles ${t.lues} / ${t.passes}, sortie structurée ${t.structurees} / ${t.passes} | ${lus} | | | | | | ${t.cout.toFixed(4)} $ (${(t.cout / toits.length).toFixed(5)} $ par façade) |`);
      lignes.push(`| **Run x3 + lecture enrichie + toit lu** | | | | | | | | | ${((run + e.cout + t.cout) / Math.max(1, parMode.x3.length)).toFixed(5)} $ par façade |`);
    }
  }
  const communes = new Set(parMode.x1.filter((x) => x.mesure).map((x) => x.nom).filter((n) => parMode.x3.some((y) => y.nom === n && y.mesure)));
  for (const m of ['x1', 'x3'] as const) lignes.push(total(parMode[m].filter((x) => communes.has(x.nom)), 'Lues dans les deux modes (' + communes.size + ')', m));
  console.log((source === 'synthetique' ? '**Réponses SYNTHÉTIQUES (pas Claude), coût ESTIMÉ** : la mesure tourne de bout en bout ; les vrais chiffres viennent du workflow « Vérifier l’API Claude ».\n\n' : '**Réponses de Claude**, coût journalisé par le serveur. Une passe illisible est comptée à part, hors de la qualité.\n\n') + lignes.join('\n'));
}
