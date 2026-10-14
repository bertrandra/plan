// Mesures des facades relevees (MD/spec-facades-calage-detection.md §15.1, lot G11) : largeur et
// hauteur des fenetres, appui, entraxe, part vitree, baies par niveau, porte, garage, type de facade.
//
//   npx tsx .claude/skills/facades/scripts/mesures.ts                  le corpus du banc : verite -> releve
//   npx tsx .claude/skills/facades/scripts/mesures.ts brique garage    les scenes dont le nom contient l'un des mots
//   npx tsx .claude/skills/facades/scripts/mesures.ts --verite         la verite seule (instantane, sans rejouer la chaine)
//   npx tsx .claude/skills/facades/scripts/mesures.ts tests/fixtures/audit-parcelle/   les audits de parcelle
//   npx tsx .claude/skills/facades/scripts/mesures.ts audit-parcelle-2026-10-13-78650000AE0101.json
//
// Sur le corpus, chaque scene est mesuree sur sa verite puis sur ce que la chaine du releve en retient
// (`rejouerScene`, comme banc.ts) : le tableau sort en Markdown, a coller dans une PR. Un argument qui
// est un fichier ou un dossier existant est lu comme un audit de parcelle (`plan-audit-parcelle`, lot
// L21) : chaque facade relevee y est mesuree, avec son contexte (rue, arriere, pignon, cote voisin).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { chargerCorpus, rejouerScene } from '../../../../tests/banc/facades/banc.ts';
import { lignesAuditParcelle, mesuresReleve, mesuresVerite, tableauMesures, type MesuresScene } from '../../../../tests/banc/facades/mesuresFacades.ts';
import { FORMAT_AUDIT_PARCELLE, lireFichierAuditParcelle } from '../../../../src/model/fichierAuditParcelle.ts';

const args = process.argv.slice(2);
const veriteSeule = args.includes('--verite');
const mots = args.filter((a) => a !== '--verite');
const chemins = mots.filter((a) => existsSync(a));
const filtres = mots.filter((a) => !existsSync(a));

if (chemins.length) {
  const fichiers = chemins.flatMap((c) => (statSync(c).isDirectory() ? readdirSync(c).filter((f) => f.endsWith('.json')).sort().map((f) => join(c, f)) : [c]));
  for (const chemin of fichiers) {
    const brut = JSON.parse(readFileSync(chemin, 'utf8')) as { format?: string };
    if (brut.format !== FORMAT_AUDIT_PARCELLE) { console.log(`# ${basename(chemin)} : pas un audit de parcelle, ignore`); continue; }
    console.log(lignesAuditParcelle(lireFichierAuditParcelle(brut), basename(chemin)).join('\n'));
  }
} else {
  const scenes = chargerCorpus().filter((s) => !filtres.length || filtres.some((m) => s.nom.includes(m)));
  const lignes: MesuresScene[] = scenes.map((s) => ({ nom: s.nom, verite: mesuresVerite(s), releve: veriteSeule ? null : mesuresReleve(s, rejouerScene(s)) }));
  console.log(tableauMesures(lignes));
}
