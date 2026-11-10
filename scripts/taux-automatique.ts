// Le taux de decisions automatiques des audits recus (app/audit/parcelle/tauxAuto.ts).
//
//   npx tsx scripts/taux-automatique.ts <fichier d'audit | dossier> [...]
//
// Lit des fichiers `plan-audit-parcelle` (ceux de Admin › Audits, ou d'un dossier), et dit combien d'arbitrages le moteur a
// tranches seul, combien la personne a gardes, combien attendaient et pourquoi. Une cause qui revient dit quel poids ou quel
// seuil de regles/reconciliation.json regler.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FORMAT_AUDIT_PARCELLE, lireFichierAuditParcelle, type FichierAuditParcelle } from '../src/model/fichierAuditParcelle.ts';
import { tauxDesAudits, direTaux } from '../src/app/audit/parcelle/tauxAuto.ts';

const cibles = process.argv.slice(2);
if (!cibles.length) throw new Error('usage : taux-automatique.ts <fichier d’audit | dossier> [...]');
const chemins = cibles.flatMap((c) => (statSync(c).isDirectory() ? readdirSync(c).filter((f) => f.endsWith('.json')).sort().map((f) => join(c, f)) : [c]));
const fichiers: FichierAuditParcelle[] = [];
for (const c of chemins) {
  const j = JSON.parse(readFileSync(c, 'utf8')) as { format?: string };
  if (j.format !== FORMAT_AUDIT_PARCELLE) continue;
  fichiers.push(lireFichierAuditParcelle(j));
}
console.log(direTaux(tauxDesAudits(fichiers)));
