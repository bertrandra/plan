// Le controleur de l'audit : le fichier de la promenade, partage ou telecharge, avec ce qui permet de la rejouer (versions du code
// et des lectures, emprise couverte).

import { partagerFichier } from '../../../shell/partage.js';
import { aDesSommets } from '../../../model/formes.js';
import { nomFichierPromenade } from '../../../model/audit.js';
import { APP_VERSION, BUILD_SHA } from '../../../model/version.js';
import { VERSION_LECTURE_TOITS } from '../../toits/toitsLidar.js';
import { EMPREINTE_REGLAGES_TOITS } from '../../../regles/toits/reglages.js';
import { VERSION_LECTURE_MURS } from '../../toits/mursFond.js';
import type { Promenade } from '../promenade.js';
import type { ObjetPlan } from '../../../model/types.js';
import type { ContexteAudit } from './contexte.js';

/**
 * Le fichier de la promenade, partage par le telephone (ou telecharge), une fois les lectures finies.
 * `parti` est appele quand le fichier est parti, pas quand la personne a ferme la feuille de partage.
 */
export async function partagerPromenade(ctx: ContexteAudit, promenade: Promenade, parti: (nom: string) => void): Promise<void> {
  await promenade.enCours();
  const { etat } = ctx;
  const parcelle = etat.objects.find((o) => o.key === 'parcelle');
  const cad = parcelle?.cadastre as { origineLat?: number; origineLon?: number; commune?: string } | undefined;
  const fichier = promenade.fichier({
    commune: cad?.commune ?? null,
    origine: { lat: cad?.origineLat ?? 0, lon: cad?.origineLon ?? 0 },
    emprise: empriseDesObjets(etat.objects),
    code: { version: APP_VERSION, commit: BUILD_SHA },
    regles: { lectureToits: VERSION_LECTURE_TOITS, lectureMurs: VERSION_LECTURE_MURS, reglagesToits: EMPREINTE_REGLAGES_TOITS },
  });
  const nom = nomFichierPromenade(promenade.debut, cad?.commune ?? null);
  const issue = await (ctx.partager ?? partagerFichier)(nom, JSON.stringify(fichier), 'Audit des toits — ' + (cad?.commune ?? 'promenade'));
  if (issue === 'partage') ctx.signaler('Fichier de la promenade partagé : ' + nom + '.');
  else if (issue === 'telecharge') ctx.signaler('Fichier de la promenade téléchargé : ' + nom + '.');
  if (issue !== 'annule') parti(nom);
}

/** L'emprise des objets charges : ce que la promenade a couvert. */
function empriseDesObjets(objets: readonly ObjetPlan[]): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const o of objets) if (aDesSommets(o)) for (const p of o.pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
  return Number.isFinite(xMin) ? { xMin: Math.round(xMin), xMax: Math.round(xMax), yMin: Math.round(yMin), yMax: Math.round(yMax) } : null;
}
