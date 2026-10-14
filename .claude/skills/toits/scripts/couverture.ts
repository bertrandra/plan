// Le LiDAR HD couvre-t-il un village ? A verifier avant de le retenir pour le banc (decision D16 de
// MD/plan-vague-3-generaliser.md) : sans dalle, l'application ne lit aucun toit (Saint-Aybert et
// Gommegnies, dans le Nord, n'en ont pas) et le village n'apprendrait rien au banc.
//
//   npx tsx .claude/skills/toits/scripts/couverture.ts                      # les villages de villages.json
//   npx tsx .claude/skills/toits/scripts/couverture.ts "<adresse>" [rayon]  # une adresse
//
// Pour chaque village : l'adresse geocodee (BAN de la Geoplateforme ; a defaut, le repli approximatif
// de villages.json), puis la reponse de `dallesLidarSur` (la fonction de l'application) sur le carre
// de cote 2 x rayon autour du point, et la commande village.mjs qui le capture. Il faut le reseau
// (data.geopf.fr) : une requete qui echoue est dite « indeterminee », jamais « pas de LiDAR ».
import { readFileSync } from 'node:fs';
import { geocoderBAN } from '../../../../src/geo/apiIgn.ts';
import { dallesLidarSur } from '../../../../src/geo/mnh.ts';
import { projecteurLocal } from '../../../../src/geo/projection.ts';

interface Village { nom: string; lieu: string; adresse: string; rayon: number; reserve?: boolean; repli?: { lat: number; lon: number } }

const args = process.argv.slice(2);
const villages: Village[] = args[0]
  ? [{ nom: 'village', lieu: args[0], adresse: args[0], rayon: Number(args[1] || 100) }]
  : JSON.parse(readFileSync(new URL('./villages.json', import.meta.url), 'utf8')).villages;

/** Le point du village : le geocodage, sinon le repli ; null si ni l'un ni l'autre. */
async function situer(v: Village): Promise<{ lat: number; lon: number; source: string } | null> {
  try {
    const r = (await geocoderBAN(v.adresse, false))[0];
    if (r) return { lat: r.lat, lon: r.lon, source: 'BAN : ' + r.label };
  } catch (e) {
    console.log(`  geocodage impossible (${(e as Error).message})`);
  }
  return v.repli ? { ...v.repli, source: 'repli approximatif de villages.json' } : null;
}

for (const v of villages) {
  console.log(`${v.nom}${v.reserve ? ' (reserve)' : ''} : ${v.lieu}`);
  const p = await situer(v);
  if (!p) { console.log('  non situe : ni geocodage ni repli'); continue; }
  console.log(`  ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} (${p.source})`);
  const proj = projecteurLocal(p.lat, p.lon);
  const r = v.rayon;
  const carre = [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
  // dallesLidarSur rend `false` aussi quand le service ne repond pas : on note l'echec a part.
  let echec: string | null = null;
  const rechercher: typeof fetch = async (entree, init) => {
    try {
      const rep = await fetch(entree, init);
      if (!rep.ok) echec = 'HTTP ' + rep.status;
      return rep;
    } catch (e) {
      echec = (e as Error).message;
      throw e;
    }
  };
  const couvert = await dallesLidarSur(carre, proj, rechercher);
  if (echec) console.log(`  LiDAR HD : indetermine (${echec})`);
  else console.log(`  LiDAR HD : ${couvert ? 'couvert' : 'PAS DE DALLE, village a ecarter'}`);
  if (couvert && !echec) console.log(`  capture : NODE_PATH=$(npm root -g) node .claude/skills/toits/scripts/village.mjs "${v.adresse}" ${v.rayon} ${v.nom}`);
}
