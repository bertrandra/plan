// Le banc du rendu du plan (MD/roadmap-architecture.md, etape 0.2 ; MD/architecture.md, W3) : combien coute un rendu complet du
// plan (`render()` : la scene SVG, le tiroir, les zones) quand le plan grossit. La demonstration (147 objets, voisinage compris) est
// dupliquee a cote d'elle-meme jusqu'a la taille voulue, puis rendue plusieurs fois ; on garde la mediane et le pire.
//
//   BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort   # en arriere-plan
//   NODE_PATH=$(npm root -g) node scripts/banc-rendu.mjs http://localhost:5199 [150 300 600]
//
// BANC_PROFIL=1 : au bureau, a la premiere taille, le profil de dix rendus (fonctions de src/, temps inclusif) : ce qui coute.
//
// Deux cibles. Le serveur de developpement donne le profil (BANC_PROFIL=1, noms de src/), mais React y tourne en mode developpement,
// plus lent que le paquet livre. Le paquet du banc donne les temps que les gens auront : un paquet de production qui garde les
// poignees `window.__plan` (mode `banc`, app/boot.ts), servi par la previsualisation :
//
//   BACKPROD_API_URL=http://plateforme.test npx vite build --mode banc
//   BACKPROD_API_URL=http://plateforme.test npx vite preview --port 5303 --strictPort   # en arriere-plan
//   NODE_PATH=$(npm root -g) node scripts/banc-rendu.mjs http://localhost:5303
//
// Refaire ensuite un build ordinaire avant de livrer : le paquet du banc porte les poignees.
//
// Deux appareils : le bureau (1440 x 900, processeur tel quel) et le telephone (390 x 844, processeur ralenti x4 par Chromium, ce
// qu'un telephone de milieu de gamme donne a peu pres). Le budget d'une image est de 16 ms au bureau, 33 ms au telephone (30 i/s).
import { createRequire } from 'node:module';
import { simulerPlateforme } from './captures.mjs';
import { servirThreeLocal } from './fumee-reseau.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const base = process.argv[2] || 'http://localhost:5199';
const tailles = process.argv.slice(3).map(Number).filter(Boolean);
const TAILLES = tailles.length ? tailles : [150, 300, 600];
const ESSAIS = process.env.BANC_PROFIL ? 10 : 9;
const APPAREILS = [
  { nom: 'bureau', viewport: { width: 1440, height: 900 }, ralenti: 1, budget: 16 },
  { nom: 'téléphone', viewport: { width: 390, height: 844 }, ralenti: 4, budget: 33, mobile: true }
];

/** Le temps inclusif des fonctions de src/ dans un profil de Chromium : chaque echantillon compte pour toute sa pile. */
function imprimerProfil(profil) {
  const noeuds = new Map(profil.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profil.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const inclusif = new Map();
  profil.samples.forEach((id, i) => {
    const vus = new Set();
    for (let x = id; x !== undefined; x = parent.get(x)) {
      const n = noeuds.get(x), m = /\/src\/(.*?)(\?|$)/.exec(n.callFrame.url);
      const cle = m ? m[1] + ' ' + (n.callFrame.functionName || '(anonyme)') : null;
      if (cle && !vus.has(cle)) { vus.add(cle); inclusif.set(cle, (inclusif.get(cle) ?? 0) + (profil.timeDeltas[i] ?? 0)); }
    }
  });
  console.log('profil (dix rendus, temps inclusif) :');
  for (const [k, v] of [...inclusif].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
  // Le temps propre, toutes origines : ce que React, le DOM et le ramasse-miettes prennent hors de src/.
  const propre = new Map();
  profil.samples.forEach((id, i) => {
    const n = noeuds.get(id), f = n.callFrame, cle = (f.url.split('/').pop()?.split('?')[0] || '(natif)') + ' ' + (f.functionName || '(anonyme)');
    propre.set(cle, (propre.get(cle) ?? 0) + (profil.timeDeltas[i] ?? 0));
  });
  console.log('temps propre, toutes origines :');
  for (const [k, v] of [...propre].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
}

const navigateur = await chromium.launch();
const lignes = [];
for (const a of APPAREILS) {
  const contexte = await navigateur.newContext({ viewport: a.viewport, isMobile: !!a.mobile, hasTouch: !!a.mobile });
  const page = await contexte.newPage();
  await servirThreeLocal(page);
  await simulerPlateforme(page);
  await page.addInitScript(() => { window.__sansToitsFond = true; });
  await page.goto(base + '/');
  await page.getByRole('button', { name: /d[ée]monstration/i }).click();
  await page.waitForFunction(() => window.__plan?.etat?.().objects.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: a.ralenti });
  const origine = await page.evaluate(() => window.__plan.etat().objects.length);
  for (const n of TAILLES) {
    const profiler = process.env.BANC_PROFIL && a.nom === (process.env.BANC_PROFIL_APPAREIL || 'bureau') && n === TAILLES[0];
    if (profiler) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    const r = await page.evaluate(async ({ n, essais }) => {
      const etat = window.__plan.etat();
      // Repartir des objets d'origine, puis copier la demonstration sur elle-meme, un peu decalee, jusqu'a n.
      const origine = etat.objects.filter((o) => !String(o.key).includes('~banc'));
      const copies = [];
      for (let k = 1; origine.length + copies.length < n; k++) {
        for (const o of origine) {
          if (origine.length + copies.length >= n) break;
          const c = structuredClone(o);
          c.key = o.key + '~banc' + k;
          // Un leger decalage : la copie reste dans la vue (une copie hors de l'ecran ne coute rien a dessiner, et ne dit rien).
          const dx = 0.7 * k;
          if (c.pts) c.pts = c.pts.map((p) => ({ ...p, x: p.x + dx }));
          if (c.center) c.center = { ...c.center, x: c.center.x + dx };
          copies.push(c);
        }
      }
      etat.objects = [...origine, ...copies];
      // Un objet neuf a besoin de son noeud SVG, comme apres un geste ; une copie deja dessinee (taille precedente) le garde.
      window.__bancDessines ??= new Set();
      for (const c of copies) if (!window.__bancDessines.has(c.key)) { window.__plan.dessinerObjet(c); window.__bancDessines.add(c.key); }
      // React rend les zones apres coup, dans une tache a lui (scheduler, MessageChannel) : un message poste apres le rendu passe
      // derriere elle. Le temps compte donc le plan et les zones, sans l'attente de l'image suivante.
      const apresReact = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
      window.__plan.rendre(); await apresReact(); // le premier rendu pose les noeuds ; on mesure les suivants
      const t = [], plan = [];
      for (let i = 0; i < essais; i++) {
        const debut = performance.now();
        plan.push(window.__plan.rendre());
        await apresReact();
        t.push(performance.now() - debut);
      }
      t.sort((x, y) => x - y); plan.sort((x, y) => x - y);
      const noeuds = document.querySelectorAll('#stage svg *').length;
      return { objets: etat.objects.length, mediane: t[Math.floor(t.length / 2)], pire: t[t.length - 1], plan: plan[Math.floor(plan.length / 2)], noeuds };
    }, { n, essais: ESSAIS });
    if (profiler) imprimerProfil((await cdp.send('Profiler.stop')).profile);
    const ligne = { appareil: a.nom, ...r, budget: a.budget };
    lignes.push(ligne);
    console.log(`${a.nom.padEnd(10)} ${String(r.objets).padStart(4)} objets, ${String(r.noeuds).padStart(6)} nœuds SVG : médiane ${r.mediane.toFixed(1).padStart(6)} ms (dont plan ${r.plan.toFixed(1)}), pire ${r.pire.toFixed(1).padStart(6)} ms  (budget ${a.budget} ms) ${r.mediane > a.budget ? 'AU-DELÀ' : 'ok'}`);
  }
  console.log(`(${a.nom} : démonstration de ${origine} objets au départ, ${ESSAIS} rendus par taille)`);
  await contexte.close();
}
await navigateur.close();
