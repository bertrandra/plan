// L'API du banc (banc/public/api.php) servie par `php -S` : le mot de passe, l'en-tete X-Banc, l'import, le redressement, le marquage,
// les blocs et l'export Ultralytics (detection et contours). Saute si PHP manque.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const php = spawnSync('php', ['-r', 'exit(class_exists("ZipArchive") && function_exists("imagejpeg") ? 0 : 1);']).status === 0;
const racine = path.resolve(__dirname, '..');

let base = '';
let tmp = '';
let serveur: ChildProcess;
let cookie = '';

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

async function appel(methode: string, r: string, params: Record<string, string> = {}, corps?: unknown, entetes: Record<string, string> = { 'X-Banc': '1' }): Promise<Response> {
  const h = new Headers(entetes);
  if (cookie) h.set('Cookie', cookie);
  let body: BodyInit | undefined;
  if (corps instanceof FormData) body = corps;
  else if (corps !== undefined) { body = JSON.stringify(corps); h.set('Content-Type', 'application/json'); }
  const rep = await fetch(base + '/api.php?' + new URLSearchParams({ r, ...params }).toString(), { method: methode, headers: h, ...(body ? { body } : {}) });
  const pose = rep.headers.get('set-cookie');
  if (pose) cookie = pose.split(';')[0] ?? '';
  return rep;
}
const json = async (r: Response) => (await r.json()) as Record<string, unknown> & { erreur?: string };

/** Un JPEG de L x H, gris uni, fabrique par GD. */
function jpeg(L: number, H: number): Blob {
  const f = path.join(tmp, `img-${L}x${H}.jpg`);
  spawnSync('php', ['-r', `$i=imagecreatetruecolor(${L},${H});imagefill($i,0,0,imagecolorallocate($i,200,190,180));imagejpeg($i,'${f}');`]);
  return new Blob([fs.readFileSync(f)], { type: 'image/jpeg' });
}

/** La liste des fichiers d'une archive zip et le contenu des petits, lus par PHP. */
function lireZip(octets: ArrayBuffer): Record<string, string> {
  const f = path.join(tmp, 'export.zip');
  fs.writeFileSync(f, Buffer.from(octets));
  const r = spawnSync('php', ['-r', `$z=new ZipArchive;$z->open('${f}');$o=[];for($i=0;$i<$z->numFiles;$i++){$n=$z->getNameIndex($i);$o[$n]=preg_match('/\\.(txt|yaml|json|py|ipynb)$/',$n)?$z->getFromIndex($i):'';}echo json_encode($o);`]);
  return JSON.parse(r.stdout.toString()) as Record<string, string>;
}

describe.skipIf(!php)('l’API du banc d’apprentissage', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-api-'));
    fs.mkdirSync(path.join(tmp, 'sessions'));
    const config = path.join(tmp, 'banc-config.php');
    fs.writeFileSync(config, `<?php return ['motDePasse' => 'secret-banc', 'dossierDonnees' => ${JSON.stringify(path.join(tmp, 'apprentissage'))}];\n`);
    const port = await portLibre();
    base = 'http://127.0.0.1:' + port;
    serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + port, '-t', path.join(racine, 'public')], { env: { ...process.env, BANC_CONFIG: config }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + '/api.php?r=etat'); return; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
    }
  });
  afterAll(() => {
    serveur.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('refuse tout sans mot de passe, refuse une ecriture sans X-Banc, et compte les essais manques', async () => {
    expect(await json(await appel('GET', 'etat'))).toEqual({ connecte: false });
    expect((await appel('GET', 'images')).status).toBe(401);
    expect((await appel('POST', 'connexion', {}, { motDePasse: 'secret-banc' }, {})).status).toBe(403);
    expect((await appel('POST', 'connexion', {}, { motDePasse: 'faux' })).status).toBe(401);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'apprentissage/connexions.json'), 'utf8'))['127.0.0.1']).toHaveLength(1);
    expect((await appel('POST', 'connexion', {}, { motDePasse: 'secret-banc' })).status).toBe(200);
    expect(await json(await appel('GET', 'etat'))).toEqual({ connecte: true });
  });

  it('du marquage a l export : une photo importee, redressee, validee, marquee a la main, rangee en val, exportee en detection et en contours', async () => {
    const classes = [
      { id: 'facade', nom: 'Façade', parent: null, forme: 'polygone', couleur: '#888888', attributs: [], apprendre: false },
      { id: 'fenetre', nom: 'Fenêtre', parent: 'facade', forme: 'rectangle', couleur: '#1e88e5', attributs: [], apprendre: true },
      { id: 'cadre-haut', nom: 'Cadre haut', parent: 'fenetre', forme: 'rectangle', couleur: '#64b5f6', attributs: [], apprendre: true },
      { id: 'pignon', nom: 'Pignon', parent: 'facade', forme: 'polygone', couleur: '#6d4c41', attributs: [], apprendre: true },
      { id: 'egout', nom: 'Égout', parent: 'facade', forme: 'ligne', couleur: '#ff5722', attributs: [], apprendre: true },
      { id: 'pointe', nom: 'Pointe de pignon', parent: 'facade', forme: 'point', couleur: '#e040fb', attributs: [], apprendre: true },
    ];
    expect((await appel('PUT', 'classes', {}, { classes })).status).toBe(200);
    expect((await appel('PUT', 'classes', {}, { classes: [...classes, classes[1]] })).status).toBe(400);

    const f = new FormData();
    f.append('fichier', jpeg(400, 300), 'a.jpg');
    f.append('meta', JSON.stringify({ source: 'iphone', nom: 'IMG_0001.jpg', lat: 48.89, lon: 2.14, inconnu: 'non gardé' }));
    const meta = await json(await appel('POST', 'images', {}, f));
    expect(meta).toMatchObject({ statut: 'importee', source: 'iphone', largeur: 400, hauteur: 300, bloc: '', verifiee: false });
    expect(meta).not.toHaveProperty('inconnu');
    const id = String(meta.id);

    const g = new FormData();
    g.append('fichier', jpeg(200, 100), 'r.jpg');
    g.append('vignette', jpeg(50, 25), 'v.jpg');
    g.append('redressement', JSON.stringify({ methode: 'fuites', horizontale: true }));
    expect(await json(await appel('POST', 'redressee', { id }, g))).toMatchObject({ statut: 'redressee', redressee: { largeur: 200, hauteur: 100 }, redressement: { methode: 'fuites' } });
    expect((await appel('GET', 'fichier', { id, v: 'redressee' })).headers.get('content-type')).toBe('image/jpeg');
    expect((await appel('PATCH', 'image', { id }, { statut: 'pas-un-statut' })).status).toBe(400);
    expect(await json(await appel('PATCH', 'image', { id }, { statut: 'validee' }))).toMatchObject({ statut: 'validee' });

    // Le brouillon seul n'entre pas dans le jeu ; marque a la main, il y entre.
    const objets = [
      { id: 'a1', classe: 'fenetre', forme: 'rectangle', points: [{ x: 20, y: 10 }, { x: 60, y: 50 }], parent: null, attributs: { type: 'battante' }, origine: 'corrige', score: 0.81 },
      { id: 'm1', classe: 'cadre-haut', forme: 'rectangle', points: [{ x: 20, y: 10 }, { x: 60, y: 20 }], parent: 'a1', attributs: {}, origine: 'main' },
      { id: 'm2', classe: 'pignon', forme: 'polygone', points: [{ x: 100, y: 50 }, { x: 150, y: 0 }, { x: 200, y: 50 }], parent: null, attributs: {}, origine: 'main' },
      { id: 'm3', classe: 'facade', forme: 'polygone', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }], parent: null, attributs: {}, origine: 'main' },
      { id: 'casse', classe: 'fenetre', forme: 'polygone', points: [{ x: 1, y: 1 }], parent: null, attributs: {}, origine: 'main' },
      { id: 'm4', classe: 'egout', forme: 'ligne', points: [{ x: 0, y: 30 }, { x: 200, y: 32 }], parent: null, attributs: {}, origine: 'main' },
      { id: 'm5', classe: 'pointe', forme: 'point', points: [{ x: 150, y: 2 }, { x: 9, y: 9 }], parent: null, attributs: {}, origine: 'main' },
    ];
    expect(await json(await appel('PUT', 'annotation', { id }, { objets, par: 'auto' }))).toMatchObject({ statut: 'brouillon', objets: 6 });
    expect(Object.keys(lireZip(await (await appel('GET', 'export', { format: 'detect' })).arrayBuffer())).filter((n) => n.endsWith('.jpg'))).toHaveLength(0);
    expect(await json(await appel('PUT', 'annotation', { id }, { objets, par: 'main' }))).toMatchObject({ statut: 'corrigee', objets: 6, classes: ['fenetre', 'cadre-haut', 'pignon', 'facade', 'egout', 'pointe'] });
    expect(await json(await appel('PATCH', 'image', { id }, { bloc: 'val', verifiee: true }))).toMatchObject({ bloc: 'val', verifiee: true });

    const detect = lireZip(await (await appel('GET', 'export', { format: 'detect', verifiees: '1' })).arrayBuffer());
    const cle = (fin: string) => Object.keys(detect).find((n) => n.endsWith(fin)) ?? '';
    expect(cle(`images/val/${id}.jpg`)).not.toBe('');
    // Les indices suivent l'arbre (facade n'est pas apprise), les details apres : fenetre 0, pignon 1, cadre-haut 2 (dans la fenetre).
    expect(detect[cle('data.yaml')]).toContain('names:\n  0: fenetre\n  1: pignon\n  2: cadre-haut\n');
    expect(detect[cle(`labels/val/${id}.txt`)]).toBe('0 0.200000 0.300000 0.200000 0.400000\n2 0.200000 0.150000 0.200000 0.100000\n1 0.750000 0.250000 0.500000 0.500000\n');
    expect(detect[cle('entrainer.py')]).toContain("YOLO('depart.pt' if os.path.exists('depart.pt') else 'yolov10n.pt')");
    expect(JSON.parse(detect[cle('bilan.json')] ?? '{}')).toMatchObject({ images: { train: 0, val: 1, test: 0 }, objetsParClasse: { fenetre: { val: 1 }, pignon: { val: 1 } } });

    const seg = lireZip(await (await appel('GET', 'export', { format: 'seg' })).arrayBuffer());
    const cleSeg = Object.keys(seg).find((n) => n.endsWith(`labels/val/${id}.txt`)) ?? '';
    expect(seg[cleSeg]).toBe('0 0.100000 0.100000 0.300000 0.100000 0.300000 0.500000 0.100000 0.500000\n2 0.100000 0.100000 0.300000 0.100000 0.300000 0.200000 0.100000 0.200000\n1 0.500000 0.500000 0.750000 0.000000 1.000000 0.500000\n');
    expect(seg[Object.keys(seg).find((n) => n.endsWith('entrainer.py')) ?? '']).toContain("else 'yolo11n-seg.pt')");

    const natif = lireZip(await (await appel('GET', 'export', { format: 'natif' })).arrayBuffer());
    const a = JSON.parse(natif[Object.keys(natif).find((n) => n.endsWith('annotations.json')) ?? ''] ?? '{}') as { images: { annotation: { objets: { id: string; parent: string | null; attributs: unknown }[] } }[] };
    // La ligne d'egout n'entre pas dans le jeu YOLO (plus haut), mais reste dans le format du banc.
    expect(a.images[0]?.annotation.objets.map((o) => [o.id, o.parent])).toEqual([['a1', null], ['m1', 'a1'], ['m2', null], ['m3', null], ['m4', null], ['m5', null]]);
    // Une pointe garde un seul point.
    expect((a.images[0]?.annotation.objets as unknown as { id: string; points: unknown[] }[]).find((o) => o.id === 'm5')?.points).toEqual([{ x: 150, y: 2 }]);

    // Range en reserve : plus rien a l'export ; supprimee : partie.
    await appel('PATCH', 'image', { id }, { bloc: 'reserve' });
    expect(Object.keys(lireZip(await (await appel('GET', 'export', { format: 'detect' })).arrayBuffer())).filter((n) => n.endsWith('.jpg'))).toHaveLength(0);
    expect((await appel('DELETE', 'image', { id })).status).toBe(200);
    expect(await json(await appel('GET', 'images'))).toEqual([]);
  });

  it('refuse un fichier qui n est pas une image, et une photo Panoramax deja importee', async () => {
    const f = new FormData();
    f.append('fichier', new Blob(['<?php echo 1;'], { type: 'image/jpeg' }), 'x.jpg');
    expect((await appel('POST', 'images', {}, f)).status).toBe(415);
    const p = () => { const g = new FormData(); g.append('fichier', jpeg(64, 48), 'p.jpg'); g.append('meta', JSON.stringify({ source: 'panoramax', panoramax: { id: 'abc-123', panoramique: true } })); return g; };
    expect((await appel('POST', 'images', {}, p())).status).toBe(201);
    expect((await appel('POST', 'images', {}, p())).status).toBe(409);
    // Des vues choisies dans un meme 360 : deux caps differents passent, le meme cap (a 5 degres pres, au passage du nord) revient en 409.
    const v = (cap: number) => { const g = new FormData(); g.append('fichier', jpeg(64, 48), 'v.jpg'); g.append('meta', JSON.stringify({ source: 'panoramax', panoramax: { id: 'pano-360', panoramique: true, vue: 'choisie', cap } })); return g; };
    expect((await appel('POST', 'images', {}, v(2))).status).toBe(201);
    expect((await appel('POST', 'images', {}, v(100))).status).toBe(201);
    expect((await appel('POST', 'images', {}, v(358))).status).toBe(409);
  });

  it('liste les modeles du depot facade a installer, et garde la correspondance changee', async () => {
    const l = (await (await appel('GET', 'modeles')).json()) as { id: string; installe: boolean; classes: string[] }[];
    expect(l.map((m) => [m.id, m.installe, m.classes])).toEqual([['facade-fenetres', false, ['fenetre', 'porte']], ['facade-volets', false, ['volet']]]);
    expect(await json(await appel('PATCH', 'modele', { id: 'facade-volets' }, { correspondance: { volet: 'fenetre' }, seuil: 0.4 }))).toMatchObject({ correspondance: { volet: 'fenetre' }, seuil: 0.4 });
    expect((await appel('GET', 'modele', { id: 'facade-volets' })).status).toBe(404);
  });

  it('exporte le type d un objet qualifie, et compte a part ceux qui ne le sont pas', async () => {
    const classes = [
      { id: 'fenetre', nom: 'Fenêtre', parent: null, forme: 'rectangle', couleur: '#1e88e5', attributs: [], apprendre: true, types: [{ id: 'fenetre_1v', nom: '1 vantail' }, { id: 'fenetre_2v', nom: '2 vantaux' }] },
      { id: 'balcon', nom: 'Balcon', parent: null, forme: 'polygone', couleur: '#fb8c00', attributs: [], apprendre: true },
    ];
    expect((await appel('PUT', 'classes', {}, { classes })).status).toBe(200);
    expect((await appel('PUT', 'classes', {}, { classes: [{ ...classes[0], types: [{ id: 'balcon', nom: 'x' }] }, classes[1]] })).status).toBe(400);
    const f = new FormData();
    f.append('fichier', jpeg(100, 100), 'a.jpg');
    const id = String((await json(await appel('POST', 'images', {}, f))).id);
    const g = new FormData();
    g.append('fichier', jpeg(100, 100), 'r.jpg');
    await appel('POST', 'redressee', { id }, g);
    const objets = [
      { id: 'm1', classe: 'fenetre', type: 'fenetre_2v', forme: 'rectangle', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], parent: null, attributs: {}, origine: 'main' },
      { id: 'm2', classe: 'fenetre', forme: 'rectangle', points: [{ x: 60, y: 0 }, { x: 80, y: 20 }], parent: null, attributs: {}, origine: 'main' },
      { id: 'm3', classe: 'balcon', forme: 'polygone', points: [{ x: 0, y: 60 }, { x: 100, y: 60 }, { x: 100, y: 100 }], parent: null, attributs: {}, origine: 'main' },
    ];
    expect(await json(await appel('PUT', 'annotation', { id }, { objets, par: 'main' }))).toMatchObject({ etiquettes: { fenetre_2v: 1, balcon: 1 }, aQualifier: 1 });
    await appel('PATCH', 'image', { id }, { bloc: 'train' });
    const z = lireZip(await (await appel('GET', 'export', { format: 'detect' })).arrayBuffer());
    const cle = (fin: string) => Object.keys(z).find((n) => n.endsWith(fin)) ?? '';
    expect(z[cle('data.yaml')]).toContain('names:\n  0: fenetre_1v\n  1: fenetre_2v\n  2: balcon\n');
    expect(z[cle(`labels/train/${id}.txt`)]).toBe('1 0.250000 0.250000 0.500000 0.500000\n2 0.500000 0.800000 1.000000 0.400000\n');
    expect(JSON.parse(z[cle('bilan.json')] ?? '{}')).toMatchObject({ aQualifier: 1 });
    const h = JSON.parse(z[cle('hierarchie.json')] ?? '{}') as { noms: { indice: number; nom: string; chemin: string }[] };
    expect(h.noms).toEqual([{ indice: 0, nom: 'fenetre_1v', chemin: 'fenetre/fenetre_1v' }, { indice: 1, nom: 'fenetre_2v', chemin: 'fenetre/fenetre_2v' }, { indice: 2, nom: 'balcon', chemin: 'balcon' }]);
    const carnet = JSON.parse(z[cle('entrainer.ipynb')] ?? '{}') as { cells: { source: string }[] };
    expect(carnet.cells.map((c) => c.source).join('\n')).toContain("YOLO('depart.pt' if os.path.exists('depart.pt') else 'yolov10n.pt')");
  });

  it('un regroupement ne s apprend pas, un detail appris vient apres les objets principaux', async () => {
    const classes = [
      { id: 'ouverture', nom: 'Ouverture', parent: null, regroupement: true, forme: 'rectangle', couleur: '#90caf9', attributs: [], apprendre: true },
      { id: 'fenetre', nom: 'Fenêtre', parent: 'ouverture', forme: 'rectangle', couleur: '#1e88e5', attributs: [], apprendre: true, types: [{ id: 'fenetre_2v', nom: '2 vantaux' }] },
      { id: 'quadrillage', nom: 'Quadrillage', parent: 'fenetre', forme: 'rectangle', couleur: '#00acc1', attributs: [], apprendre: true },
      { id: 'porte', nom: 'Porte', parent: 'ouverture', forme: 'rectangle', couleur: '#e53935', attributs: [], apprendre: true },
    ];
    expect((await appel('PUT', 'classes', {}, { classes })).status).toBe(200);
    const z = lireZip(await (await appel('GET', 'export', { format: 'detect' })).arrayBuffer());
    const cle = (fin: string) => Object.keys(z).find((n) => n.endsWith(fin)) ?? '';
    expect(z[cle('data.yaml')]).toContain('names:\n  0: fenetre_2v\n  1: porte\n  2: quadrillage\n');
    expect((JSON.parse(z[cle('hierarchie.json')] ?? '{}') as { noms: { chemin: string }[] }).noms.map((n) => n.chemin)).toEqual(['ouverture/fenetre/fenetre_2v', 'ouverture/porte', 'ouverture/fenetre/quadrillage']);
  });

  it('les indices figes l emportent sur l ordre de l arbre, et le chemin dit les autres regroupements', async () => {
    const classes = [
      { id: 'ouverture', nom: 'Ouverture', parent: null, regroupement: true, forme: 'rectangle', couleur: '#90caf9', attributs: [], apprendre: false },
      { id: 'toit', nom: 'Toit', parent: null, regroupement: true, forme: 'polygone', couleur: '#90a4ae', attributs: [], apprendre: false },
      { id: 'fenetre_toit', nom: 'Fenêtre de toit', parent: 'toit', aussi: ['ouverture'], forme: 'rectangle', couleur: '#0277bd', attributs: [], apprendre: true, indice: 2 },
      { id: 'porte', nom: 'Porte', parent: 'ouverture', forme: 'rectangle', couleur: '#e53935', attributs: [], apprendre: true, types: [{ id: 'porte_pleine', nom: 'P', indice: 0 }, { id: 'porte_vitree', nom: 'V', indice: 1 }] },
      { id: 'balcon', nom: 'Balcon', parent: null, forme: 'polygone', couleur: '#fb8c00', attributs: [], apprendre: true },
    ];
    expect((await appel('PUT', 'classes', {}, { classes })).status).toBe(200);
    const z = lireZip(await (await appel('GET', 'export', { format: 'detect' })).arrayBuffer());
    const cle = (fin: string) => Object.keys(z).find((n) => n.endsWith(fin)) ?? '';
    expect(z[cle('data.yaml')]).toContain('names:\n  0: porte_pleine\n  1: porte_vitree\n  2: fenetre_toit\n  3: balcon\n');
    expect((JSON.parse(z[cle('hierarchie.json')] ?? '{}') as { noms: { nom: string; chemin: string }[] }).noms.find((n) => n.nom === 'fenetre_toit')?.chemin).toBe('toit/fenetre_toit (aussi : ouverture)');
  });

  it('se deconnecte', async () => {
    expect((await appel('POST', 'deconnexion')).status).toBe(200);
    expect((await appel('GET', 'images')).status).toBe(401);
  });
});
