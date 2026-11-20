// Les jetons d'entrainement (banc/public/api.php ; demande du proprietaire, 20 novembre 2026 : un aller-retour Colab avec moins de
// gestes). L'etape 6 cree un jeton et telecharge un carnet qui le porte ; le carnet lit le jeu et depose le modele lui-meme. Chaque
// garde-fou est essaye ici, un a un, par `php -S` : qui cree un jeton, ce qu'il ouvre et ce qu'il n'ouvre pas, comment il se refuse,
// ce qu'un depot doit etre. Le role du carnet est tenu par ce test, avec un faux fichier ONNX fabrique sur place : ni Colab ni
// entrainement ne sont joues. Aucun vrai secret : les jetons sont crees a la volee. Saute si PHP manque.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const php = spawnSync('php', ['-r', 'exit(class_exists("ZipArchive") && function_exists("imagejpeg") ? 0 : 1);']).status === 0;
const python = spawnSync('python3', ['-c', 'import ast, json']).status === 0;
// Le paquet `requests`, dont le carnet se sert (Colab l'a d'office) : sans lui, l'essai qui joue les cellules du carnet est saute.
const requetes = spawnSync('python3', ['-c', 'import requests']).status === 0;
const racine = path.resolve(__dirname, '..');

let base = '';
let tmp = '';
let donnees = '';
let serveur: ChildProcess;
let cookie = '';

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

/** Un appel de la page : la session (le temoin) et l'en-tete X-Banc. */
async function appel(methode: string, r: string, params: Record<string, string> = {}, corps?: unknown, entetes: Record<string, string> = { 'X-Banc': '1' }, avecSession = true): Promise<Response> {
  const h = new Headers(entetes);
  if (cookie && avecSession) h.set('Cookie', cookie);
  let body: BodyInit | undefined;
  if (corps instanceof FormData) body = corps;
  else if (corps !== undefined) { body = JSON.stringify(corps); h.set('Content-Type', 'application/json'); }
  const rep = await fetch(base + '/api.php?' + new URLSearchParams({ r, ...params }).toString(), { method: methode, headers: h, ...(body ? { body } : {}) });
  const pose = rep.headers.get('set-cookie');
  if (pose && avecSession) cookie = pose.split(';')[0] ?? '';
  return rep;
}
/** Un appel du carnet : le jeton dans son en-tete, ni session ni X-Banc. */
function carnet(jeton: string, methode: string, r: string, params: Record<string, string> = {}, corps?: Uint8Array | Record<string, unknown>, entetes: Record<string, string> = {}): Promise<Response> {
  const h = new Headers({ 'X-Banc-Jeton': jeton, 'User-Agent': 'banc-colab', ...entetes });
  let body: BodyInit | undefined;
  if (corps instanceof Uint8Array) { body = new Blob([Buffer.from(corps)]); h.set('Content-Type', 'application/octet-stream'); }
  else if (corps !== undefined) { body = JSON.stringify(corps); h.set('Content-Type', 'application/json'); }
  return fetch(base + '/api.php?' + new URLSearchParams({ r, ...params }).toString(), { method: methode, headers: h, ...(body ? { body } : {}) });
}
const json = async (r: Response) => (await r.json()) as Record<string, unknown> & { erreur?: string };

function jpeg(L: number, H: number): Blob {
  const f = path.join(tmp, `img-${L}x${H}.jpg`);
  spawnSync('php', ['-r', `$i=imagecreatetruecolor(${L},${H});imagefill($i,0,0,imagecolorallocate($i,200,190,180));imagejpeg($i,'${f}');`]);
  return new Blob([fs.readFileSync(f)], { type: 'image/jpeg' });
}

function nomsDuZip(octets: ArrayBuffer): string[] {
  const f = path.join(tmp, 'jeu.zip');
  fs.writeFileSync(f, Buffer.from(octets));
  const r = spawnSync('php', ['-r', `$z=new ZipArchive;$z->open('${f}');$o=[];for($i=0;$i<$z->numFiles;$i++)$o[]=$z->getNameIndex($i);echo json_encode($o);`]);
  return JSON.parse(r.stdout.toString()) as string[];
}

/** Une photo corrigee et verifiee, rangee dans un bloc : de quoi faire un jeu. */
async function photoCorrigee(nom: string, bloc = 'train'): Promise<string> {
  const f = new FormData();
  f.append('fichier', jpeg(400, 300), 'a.jpg');
  f.append('meta', JSON.stringify({ source: 'fichier', nom }));
  const id = String((await json(await appel('POST', 'images', {}, f))).id);
  const g = new FormData();
  g.append('fichier', jpeg(200, 100), 'r.jpg');
  g.append('redressement', JSON.stringify({ methode: 'face' }));
  expect((await appel('POST', 'redressee', { id }, g)).status).toBe(200);
  const objets = [{ id: 'a1', classe: 'fenetre', forme: 'rectangle', points: [{ x: 20, y: 10 }, { x: 60, y: 50 }], parent: null, attributs: {}, origine: 'main' }];
  expect((await appel('PUT', 'annotation', { id }, { objets, par: 'main' })).status).toBe(200);
  expect((await appel('PATCH', 'image', { id }, { bloc, verifiee: true })).status).toBe(200);
  return id;
}

// Un faux fichier ONNX : un ModelProto protobuf bien forme (version, jeu d'operateurs, un graphe avec un noeud, une entree, une
// sortie et un poids de remplissage), sans rien d'un vrai modele. Assez pour ce que le serveur verifie ; aucun moteur ne le lirait.
const entier = (v: number): number[] => { const o: number[] = []; for (; v > 127; v = Math.floor(v / 128)) o.push((v % 128) | 128); o.push(v); return o; };
const champ = (numero: number, contenu: Uint8Array | number[]): Uint8Array => Uint8Array.from([...entier(numero * 8 + 2), ...entier(contenu.length), ...contenu]);
const coller = (...l: (Uint8Array | number[])[]): Uint8Array => Uint8Array.from(l.flatMap((x) => [...x]));
const texte = (s: string) => [...Buffer.from(s)];
function fauxOnnx(remplissage = 9000, graphe?: Uint8Array): Uint8Array {
  const g = graphe ?? coller(champ(1, coller(champ(4, texte('Identity')))), champ(2, texte('banc')), champ(5, new Uint8Array(remplissage).fill(7)), champ(11, champ(1, texte('input'))), champ(12, champ(1, texte('dets'))));
  return coller([8, 8], champ(2, texte('essai')), champ(7, g), champ(8, [0x10, 17]));
}
const sha256 = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

interface Cree { jeton: string; id: string; carnet: { nbformat: number; cells: { cell_type: string; source: string }[] }; brut: string; fichier: string; public: Record<string, unknown> }
const DEMANDE = { format: 'rfdetr', base: 'rf-detr-nano', depart: 'coco', verifiees: true, adresse: 'https://banc.example/banc/api.php', correspondance: { fenetre: 'fenetre', pignon: 'pignon' } };
async function creer(demande: Record<string, unknown> = {}): Promise<Cree> {
  const rep = await appel('POST', 'jetons', {}, { ...DEMANDE, ...demande });
  expect(rep.status).toBe(201);
  const r = await json(rep) as unknown as { jeton: Record<string, unknown>; fichier: string; carnet: string };
  const jeton = /bj_[0-9a-f]{16}_[0-9a-f]{64}/.exec(r.carnet)?.[0] ?? '';
  expect(jeton).not.toBe('');
  return { jeton, id: String(r.jeton.id), carnet: JSON.parse(r.carnet) as Cree['carnet'], brut: r.carnet, fichier: r.fichier, public: r.jeton };
}
/** Le depot entier d'un modele, comme le carnet le fait : des morceaux dans l'ordre, puis la fin avec ce qu'il en dit. */
async function deposer(jeton: string, octets: Uint8Array, description: Record<string, unknown> = {}, pas = 4000): Promise<Response> {
  for (let n = 0, d = 0; d < octets.length; n++, d += pas) expect((await carnet(jeton, 'POST', 'colab-modele', { partie: String(n) }, octets.subarray(d, d + pas))).status).toBe(200);
  return carnet(jeton, 'POST', 'colab-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre', 'pignon'], taille: octets.length, sha256: sha256(octets), ...description });
}
const fichierJeton = (id: string, ext = 'json') => path.join(donnees, 'jetons', `${id}.${ext}`);

describe.skipIf(!php)('les jetons d’entraînement : l’aller-retour du carnet, et ce qu’il refuse', () => {
  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-jetons-'));
    donnees = path.join(tmp, 'apprentissage');
    fs.mkdirSync(path.join(tmp, 'sessions'));
    const config = path.join(tmp, 'banc-config.php');
    fs.writeFileSync(config, `<?php return ['motDePasse' => 'secret-banc', 'dossierDonnees' => ${JSON.stringify(donnees)}];\n`);
    const port = await portLibre();
    base = 'http://127.0.0.1:' + port;
    // post_max_size large : l'essai du modele trop lourd envoie plus de 128 Mo en trois morceaux.
    serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-d', 'post_max_size=64M', '-d', 'memory_limit=256M', '-S', '127.0.0.1:' + port, '-t', path.join(racine, 'public')], { env: { ...process.env, BANC_CONFIG: config }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + '/api.php?r=etat'); break; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
    }
    expect((await appel('POST', 'connexion', {}, { motDePasse: 'secret-banc' })).status).toBe(200);
    const classes = [
      { id: 'fenetre', nom: 'Fenêtre', parent: null, forme: 'rectangle', couleur: '#1e88e5', attributs: [], apprendre: true },
      { id: 'pignon', nom: 'Pignon', parent: null, forme: 'polygone', couleur: '#6d4c41', attributs: [], apprendre: true },
    ];
    expect((await appel('PUT', 'classes', {}, { classes })).status).toBe(200);
  });
  afterAll(() => {
    serveur.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  // Chaque essai repart sans cle vivante ni essai manque compte.
  beforeEach(async () => {
    fs.rmSync(path.join(donnees, 'essais-jetons.json'), { force: true });
    const vivants = (await json(await appel('GET', 'jetons'))).jetons as { id: string }[] | undefined;
    for (const j of vivants ?? []) await appel('DELETE', 'jeton', { id: j.id });
  });

  it('un jeu vide ne donne pas de jeton ; le format du banc non plus ; l’adresse du banc est en https', async () => {
    expect(await json(await appel('POST', 'jetons', {}, DEMANDE))).toMatchObject({ erreur: expect.stringContaining('Le jeu est vide') });
    await photoCorrigee('premiere.jpg');
    expect((await appel('POST', 'jetons', {}, { ...DEMANDE, format: 'natif' })).status).toBe(400);
    expect((await appel('POST', 'jetons', {}, { ...DEMANDE, base: 'yolo26n' })).status).toBe(400);
    for (const adresse of ['http://banc.example/banc/api.php', 'https://banc.example/banc/autre.php', 'https://moi:secret@banc.example/api.php', 'https://banc.example/api.php?x=1', 'https://banc.example/a"b/api.php', 'javascript:alert(1)', '']) {
      expect((await appel('POST', 'jetons', {}, { ...DEMANDE, adresse })).status, adresse).toBe(400);
    }
    // Un refus ne laisse rien derriere lui : ni jeton, ni jeu.
    expect(fs.readdirSync(path.join(donnees, 'jetons')).filter((f) => /\.(json|zip)$/.test(f))).toEqual([]);
    expect((await appel('POST', 'jetons', {}, { ...DEMANDE, adresse: 'http://127.0.0.1:5197/api.php' })).status).toBe(201);
  });

  it('seule une session connectée crée, liste ou révoque un jeton', async () => {
    expect((await appel('POST', 'jetons', {}, DEMANDE, { 'X-Banc': '1' }, false)).status).toBe(401);
    expect((await appel('GET', 'jetons', {}, undefined, {}, false)).status).toBe(401);
    expect((await appel('DELETE', 'jeton', { id: '0123456789abcdef' }, undefined, { 'X-Banc': '1' }, false)).status).toBe(401);
    // Une ecriture sans X-Banc (un formulaire d'un autre site) est refusee, meme avec la session.
    expect((await appel('POST', 'jetons', {}, DEMANDE, {})).status).toBe(403);
    // Un jeton ne cree pas de jeton.
    const { jeton } = await creer();
    expect((await carnet(jeton, 'POST', 'jetons', {}, DEMANDE, { 'X-Banc': '1' })).status).toBe(401);
    expect((await carnet(jeton, 'GET', 'jetons')).status).toBe(401);
  });

  it('le jeton est tiré au hasard, gardé haché, et ne sort que dans le carnet', async () => {
    const a = await creer();
    const b = await creer();
    expect(a.jeton).toMatch(/^bj_[0-9a-f]{16}_[0-9a-f]{64}$/);
    expect(a.jeton).not.toBe(b.jeton);
    const secret = a.jeton.split('_')[2] ?? '';
    const garde = fs.readFileSync(fichierJeton(a.id), 'utf8');
    expect(garde).not.toContain(secret);
    expect((JSON.parse(garde) as { hache: string }).hache).toBe(createHash('sha256').update(secret).digest('hex'));
    // Ni la reponse hors du carnet, ni la liste, ni aucun autre fichier des donnees ne portent le secret ou son hache.
    expect(JSON.stringify(a.public)).not.toMatch(/hache|bj_/);
    const liste = await (await appel('GET', 'jetons')).text();
    expect(liste).toContain(a.id);
    expect(liste).not.toMatch(/hache|bj_/);
    expect(liste).not.toContain(secret);
    for (const f of fs.readdirSync(donnees, { recursive: true }) as string[]) {
      const p = path.join(donnees, f);
      if (fs.statSync(p).isFile() && !p.endsWith('.jpg') && !p.endsWith('.zip')) expect(fs.readFileSync(p, 'utf8'), f).not.toContain(secret);
    }
    expect(a.public).toMatchObject({ architecture: { id: 'rf-detr-nano', format: 'rf-detr', resolution: 384, depart: 'coco' }, jeu: { images: { train: 1, val: 0, test: 0 }, verifieesSeulement: true }, lectures: 0, depose: null });
    // 24 h par defaut.
    const duree = (new Date(String(a.public.expireLe)).getTime() - new Date(String(a.public.creeLe)).getTime()) / 3600000;
    expect(duree).toBeGreaterThan(23.9);
    expect(duree).toBeLessThan(24.1);
    expect((await json(await appel('GET', 'jetons'))).heures).toBe(24);
  });

  it('le carnet est un .ipynb valable, court, qui appelle les deux routes du jeton et prévient qu’il porte une clé', async () => {
    const c = await creer();
    expect(c.fichier).toMatch(/^banc-colab-rf-detr-nano-\d{8}-\d{6}\.ipynb$/);
    expect(c.carnet.nbformat).toBe(4);
    expect(c.carnet.cells.length).toBeLessThanOrEqual(6);
    for (const k of c.carnet.cells) { expect(['code', 'markdown']).toContain(k.cell_type); expect(typeof k.source).toBe('string'); }
    const code = c.carnet.cells.filter((k) => k.cell_type === 'code').map((k) => k.source).join('\n');
    const prose = c.carnet.cells.filter((k) => k.cell_type === 'markdown').map((k) => k.source).join('\n');
    expect(code).toContain('BANC = "https://banc.example/banc/api.php"');
    expect(code).toContain(`"X-Banc-Jeton": "${c.jeton}"`);
    expect(code).toContain("requests.get(BANC, params={'r': 'colab-jeu'}, headers=CLE");
    expect(code).toContain("params={'r': 'colab-modele', 'partie': n}");
    expect(code).toContain("params={'r': 'colab-modele', 'fin': '1'}");
    expect(code).toContain("'architecture': \"rf-detr-nano\", 'resolution': 384, 'classes': noms, 'bilan': bilan");
    expect(code).toContain("from rfdetr import RFDETRNano");
    // Plus rien a envoyer a la main ; le telechargement du modele ne reste que comme repli, si le depot echoue.
    expect(code).not.toContain('files.upload');
    expect(code.indexOf('files.download')).toBeGreaterThan(code.indexOf('except Exception as e:\n    print(\'Dépôt impossible'));
    expect(prose).toContain('Apache 2.0');
    expect(prose).toMatch(/Ce carnet contient une clé valable 24 h : ne le partagez pas\./);
    expect(prose).toContain('Tout exécuter');
    // Le jeton n'est ecrit qu'une fois, et jamais dans une adresse.
    expect(c.brut.split(c.jeton)).toHaveLength(2);
    expect(c.brut).not.toMatch(/[?&][a-z]*=bj_/);

    // YOLO d'Ultralytics en option : son avertissement AGPL-3.0, ses poids, son export sans NMS.
    const y = await creer({ format: 'detect', base: 'yolov10n' });
    const codeY = y.carnet.cells.filter((k) => k.cell_type === 'code').map((k) => k.source).join('\n');
    expect(y.carnet.cells[0]?.source).toMatch(/AGPL-3\.0.*publier le code ou d'acheter leur licence/);
    expect(codeY).toContain("else 'yolov10n.pt')");
    expect(codeY).toContain("MODELE = best.export(format='onnx', imgsz=640, nms=False)");
    expect(codeY).toContain("'architecture': \"yolov10n\", 'resolution': 640");
    const z = await creer({ format: 'seg', base: 'yolo11n-seg', depart: 'zero' });
    expect(z.carnet.cells.map((k) => k.source).join('\n')).toContain("YOLO('yolo11n-seg.yaml')");
    expect(z.public).toMatchObject({ architecture: { format: 'yolov8-seg', resolution: 640, depart: 'zero' } });

    // Le Python de chaque cellule se lit (sans l'executer) : une faute de syntaxe ne se decouvrirait qu'apres une heure d'entrainement.
    if (python) for (const k of [c, y, z]) {
      const r = spawnSync('python3', ['-I', '-c', 'import ast, json, sys\nfor c in json.load(sys.stdin)["cells"]:\n    if c["cell_type"] == "code": ast.parse("\\n".join(l for l in c["source"].split("\\n") if not l.startswith("!")))'], { input: k.brut });
      expect(r.stderr.toString()).toBe('');
      expect(r.status).toBe(0);
    }
  });

  it.skipIf(!requetes)('les cellules du carnet, jouées par Python contre le serveur : elles lisent le jeu, déposent le modèle par morceaux, et se replient si le dépôt échoue', async () => {
    const jouer = (c: Cree, suite: string) => {
      const dossier = fs.mkdtempSync(path.join(tmp, 'carnet-'));
      fs.writeFileSync(path.join(dossier, 'faux.onnx'), fauxOnnx(20000));
      // Les cellules « lire le jeu » et « deposer » telles que le serveur les a ecrites ; l'entrainement et l'export, que seul Colab
      // peut jouer, sont remplaces par leurs resultats : un fichier, des noms, un bilan (avec ce qu'un vrai bilan peut avoir de travers).
      const script = `import json, os, sys, types
cellules = [c['source'] for c in json.load(open(sys.argv[1])) ['cells'] if c['cell_type'] == 'code']
lire = next(c for c in cellules if "'colab-jeu'" in c)
deposer_ = next(c for c in cellules if 'def deposer' in c)
telecharges = []
colab = types.ModuleType('google.colab'); colab.files = types.SimpleNamespace(download=telecharges.append)
sys.modules['google'] = types.ModuleType('google'); sys.modules['google.colab'] = colab
os.chdir(sys.argv[2])
g = {}
exec(lire.replace('print(open', '#'), g)
assert os.path.exists('train/_annotations.coco.json'), os.getcwd()
g['noms'] = [l.split(': ', 1)[1].strip() for l in open('noms.txt') if ': ' in l]
g['MODELE'] = os.path.join(sys.argv[2], 'faux.onnx')
g['bilan'] = {'map': 0.5, 'map50': float('nan')}
g['par_type'] = {'fenetre': 0.75, 'pignon': -1.0}
${suite}
exec(deposer_, g)
print(json.dumps({'noms': g['noms'], 'telecharges': telecharges}))
`;
      fs.writeFileSync(path.join(dossier, 'carnet.ipynb'), c.brut);
      const r = spawnSync('python3', ['-c', script, path.join(dossier, 'carnet.ipynb'), dossier], { env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } });
      return { sortie: r.stdout.toString(), erreur: r.stderr.toString(), code: r.status };
    };
    // Des morceaux petits (post_max_size ne se regle pas par requete) : le serveur d'essai ecrit 4 Mo dans le carnet, le faux modele
    // en fait 20 Ko ; la taille du morceau est remplacee pour que le depot en compte plusieurs.
    const c = await creer({ adresse: base + '/api.php' });
    const petit = { ...c, brut: c.brut.replaceAll('4194304', '6000') };
    const r = jouer(petit, '');
    expect(r.erreur).toBe('');
    expect(r.code).toBe(0);
    expect(r.sortie).toContain('Déposé dans le banc : RF-DETR Nano · Colab du');
    expect(JSON.parse(r.sortie.trim().split('\n').pop() ?? '{}')).toEqual({ noms: ['fenetre', 'pignon'], telecharges: [] });
    const j = JSON.parse(fs.readFileSync(fichierJeton(c.id), 'utf8')) as { envois: number; lectures: number; depose: { modele: string } };
    expect(j).toMatchObject({ lectures: 1, envois: 4 });
    const m = ((await json(await appel('GET', 'modeles'))) as unknown as Record<string, unknown>[]).find((x) => x.id === j.depose.modele);
    // Le bilan arrive nettoye par le carnet : ni NaN (qui casserait le JSON), ni valeur hors de 0 a 1.
    expect(m).toMatchObject({ actif: false, classes: ['fenetre', 'pignon'], resolution: 384, depot: { bilan: { map: 0.5, parType: { fenetre: 0.75 } } } });
    expect((m?.depot as { bilan: Record<string, unknown> }).bilan).not.toHaveProperty('map50');
    await appel('DELETE', 'modele', { id: j.depose.modele });

    // Le repli : la cle revoquee apres la lecture du jeu, le depot echoue, le carnet le dit et propose le fichier avec ses noms.
    const d = await creer({ adresse: base + '/api.php' });
    const repli = jouer(d, `import urllib.request\nurllib.request.urlopen(urllib.request.Request(${JSON.stringify(base)} + '/api.php?r=jeton&id=${d.id}', method='DELETE', headers={'X-Banc': '1', 'Cookie': ${JSON.stringify(cookie)}}))`);
    expect(repli.erreur).toBe('');
    expect(repli.sortie).toContain('Dépôt impossible (morceau 0 : {"erreur":"Jeton refusé."})');
    expect(repli.sortie).toContain('0: fenetre\n1: pignon');
    expect((JSON.parse(repli.sortie.trim().split('\n').pop() ?? '{}') as { telecharges: string[] }).telecharges).toHaveLength(1);
  }, 60000);

  it('la taille des morceaux suit post_max_size de l’hébergement (4 Mo au plus, 64 Ko de marge)', () => {
    const morceau = (limite: string) => spawnSync('php', ['-d', 'post_max_size=' + limite, '-r', `require ${JSON.stringify(path.join(racine, 'public/api.php'))}; echo jeton_morceau();`]).stdout.toString();
    expect(morceau('8M')).toBe(String(4 * 1048576));
    expect(morceau('2M')).toBe(String(2 * 1048576 - 65536));
    expect(morceau('100K')).toBe('65536');
    expect(morceau('0')).toBe(String(4 * 1048576));
  });

  it('le jeton lit le jeu de son export, figé à sa création, et rien d’autre', async () => {
    const c = await creer();
    await photoCorrigee('apres-le-jeton.jpg');
    const rep = await carnet(c.jeton, 'GET', 'colab-jeu');
    expect(rep.status).toBe(200);
    expect(rep.headers.get('content-type')).toBe('application/zip');
    // Aucune session n'est ouverte pour un jeton : pas de temoin pose.
    expect(rep.headers.get('set-cookie')).toBeNull();
    const noms = nomsDuZip(await rep.arrayBuffer());
    expect(noms[0]).toMatch(/^banc-rf-detr-nano-/);
    expect(noms.some((n) => n.endsWith('train/_annotations.coco.json'))).toBe(true);
    // La photo corrigee apres la creation du jeton n'y est pas : le jeu est celui de l'export, pas celui du jour.
    const photos = noms.filter((n) => n.endsWith('.jpg'));
    expect(photos.length).toBe((c.public.jeu as { images: { train: number } }).images.train);
    const maintenant = await creer();
    expect((maintenant.public.jeu as { images: { train: number } }).images.train).toBe(photos.length + 1);
    expect((await json(await appel('GET', 'jetons'))).jetons).toContainEqual(expect.objectContaining({ id: c.id, lectures: 1 }));

    // Rien d'autre de l'API ne l'accepte : ni les photos, ni le marquage, ni l'export, ni les modeles, ni les classes.
    const id = String(((await json(await appel('GET', 'images'))) as unknown as { id: string }[])[0]?.id);
    const ailleurs: [string, string, Record<string, string>][] = [['GET', 'images', {}], ['GET', 'fichier', { id, v: 'source' }], ['GET', 'annotation', { id }], ['GET', 'export', { format: 'rfdetr' }], ['GET', 'modeles', {}], ['GET', 'classes', {}], ['GET', 'reglages', {}],
      ['PUT', 'classes', {}], ['POST', 'images', {}], ['DELETE', 'image', { id }], ['POST', 'modeles', {}], ['PATCH', 'modele', { id: 'facade-fenetres' }], ['DELETE', 'jeton', { id: c.id }], ['POST', 'installer', { id: 'facade-fenetres' }]];
    for (const [methode, r, params] of ailleurs) expect((await carnet(c.jeton, methode, r, params, methode === 'GET' ? undefined : {}, { 'X-Banc': '1' })).status, `${methode} ${r}`).toBe(401);
    // Et les deux routes du jeton ne lisent rien d'autre que son jeu : un identifiant de photo ou un chemin en plus ne changent rien.
    const encore = await carnet(c.jeton, 'GET', 'colab-jeu', { id, v: 'source', fichier: '../../banc-config.php' });
    expect(encore.headers.get('content-type')).toBe('application/zip');
    expect(nomsDuZip(await encore.arrayBuffer())).toEqual(noms);
    // Le jeton ne se lit que dans son en-tete : ni dans l'adresse (que les journaux gardent), ni en Authorization, ni en temoin.
    for (const [params, entetes] of [[{ jeton: c.jeton }, {}], [{ 'X-Banc-Jeton': c.jeton }, {}], [{}, { Authorization: 'Bearer ' + c.jeton }], [{}, { Cookie: 'X-Banc-Jeton=' + c.jeton }]] as [Record<string, string>, Record<string, string>][]) {
      expect((await fetch(base + '/api.php?' + new URLSearchParams({ r: 'colab-jeu', ...params }).toString(), { headers: entetes })).status).toBe(401);
    }
  });

  it('un seul refus pour tout : inconnu, faux, mal écrit, échu ou révoqué se disent pareil', async () => {
    const c = await creer();
    const echu = await creer();
    const revoque = await creer();
    const j = JSON.parse(fs.readFileSync(fichierJeton(echu.id), 'utf8')) as { expire: number };
    fs.writeFileSync(fichierJeton(echu.id), JSON.stringify({ ...j, expire: Math.floor(Date.now() / 1000) - 1 }));
    expect(await json(await appel('DELETE', 'jeton', { id: revoque.id }))).toEqual({ revoque: revoque.id });
    const [, id, secret] = c.jeton.split('_') as [string, string, string];
    const faux = [
      'bj_' + 'a'.repeat(16) + '_' + secret,                     // identifiant inconnu, vrai secret
      'bj_' + id + '_' + 'b'.repeat(64),                         // vrai identifiant, faux secret
      'bj_' + id + '_' + secret.slice(0, 63),                    // tronque
      c.jeton.toUpperCase(), c.jeton + 'a', 'x' + c.jeton, 'bj_../' + id + '_' + secret, id, secret, '', 'Bearer ' + c.jeton,
      echu.jeton, revoque.jeton,
    ];
    const reponses = new Set<string>();
    for (const jeton of faux) for (const [methode, r, params] of [['GET', 'colab-jeu', {}], ['POST', 'colab-modele', { partie: '0' }], ['POST', 'colab-modele', { fin: '1' }]] as [string, string, Record<string, string>][]) {
      fs.rmSync(path.join(donnees, 'essais-jetons.json'), { force: true });
      const rep = await carnet(jeton, methode, r, params, methode === 'POST' ? fauxOnnx() : undefined);
      reponses.add(rep.status + ' ' + await rep.text());
    }
    expect([...reponses]).toEqual(['401 {"erreur":"Jeton refusé."}']);
    // Sans en-tete du tout, pareil.
    expect(await (await fetch(base + '/api.php?r=colab-jeu')).text()).toBe('{"erreur":"Jeton refusé."}');
    // Le jeton echu s'est efface avec son jeu des que son carnet l'a presente ; le revoque l'etait deja.
    for (const x of [echu, revoque]) for (const ext of ['json', 'zip', 'partie']) expect(fs.existsSync(fichierJeton(x.id, ext)), ext).toBe(false);
    // Le bon marche toujours.
    expect((await carnet(c.jeton, 'GET', 'colab-jeu')).status).toBe(200);
  });

  it('les essais manqués sont comptés par adresse : au vingtième, tout est refusé un quart d’heure, même un bon jeton', async () => {
    const c = await creer();
    for (let k = 0; k < 20; k++) expect((await carnet('bj_' + 'c'.repeat(16) + '_' + 'd'.repeat(64), 'GET', 'colab-jeu')).status).toBe(401);
    expect((await carnet('bj_' + 'c'.repeat(16) + '_' + 'd'.repeat(64), 'GET', 'colab-jeu')).status).toBe(429);
    expect((await carnet(c.jeton, 'GET', 'colab-jeu')).status).toBe(429);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, fauxOnnx())).status).toBe(429);
    // Le compte ne garde que des dates par adresse : jamais le jeton essaye.
    const compte = fs.readFileSync(path.join(donnees, 'essais-jetons.json'), 'utf8');
    expect(Object.keys(JSON.parse(compte) as object)).toEqual(['127.0.0.1']);
    expect(compte).not.toMatch(/bj_|cccc|dddd/);
    // La connexion par mot de passe a son propre compte : elle n'est pas fermee par ces essais.
    expect((await appel('GET', 'jetons')).status).toBe(200);
    // Le jeu se lit au plus vingt fois par jeton.
    fs.rmSync(path.join(donnees, 'essais-jetons.json'), { force: true });
    const j = JSON.parse(fs.readFileSync(fichierJeton(c.id), 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(fichierJeton(c.id), JSON.stringify({ ...j, lectures: 20 }));
    expect((await carnet(c.jeton, 'GET', 'colab-jeu')).status).toBe(429);
  });

  it('cinq clés vivantes au plus à la fois ; les révoquer rend la place', async () => {
    const l = [];
    for (let k = 0; k < 5; k++) l.push(await creer());
    const rep = await appel('POST', 'jetons', {}, DEMANDE);
    expect(rep.status).toBe(429);
    expect((await json(rep)).erreur).toContain('révoquez-en une');
    expect(((await json(await appel('GET', 'jetons'))).jetons as unknown[]).length).toBe(5);
    expect((await appel('DELETE', 'jeton', { id: '../' + l[0]?.id })).status).toBe(400);
    expect((await appel('DELETE', 'jeton', { id: String(l[0]?.id) })).status).toBe(200);
    for (const ext of ['json', 'zip']) expect(fs.existsSync(fichierJeton(String(l[0]?.id), ext))).toBe(false);
    await creer();
  });

  it('le dépôt d’un modèle, de bout en bout : il arrive à l’étape 3 inactif, ses noms reliés, sa résolution et son bilan posés', async () => {
    const c = await creer();
    expect((await carnet(c.jeton, 'GET', 'colab-jeu')).status).toBe(200);
    const octets = fauxOnnx(20000);
    const rep = await deposer(c.jeton, octets, {
      classes: ['fenetre', 'pignon', 'inconnu_du_banc'],
      bilan: { map: 0.61234567, map50: 0.9, parType: { fenetre: 0.7, pignon: 1.5, inconnu_du_banc: 'NaN', pas_un_nom: 0.2 }, autre: 'laissé' },
      // Ce que l'appelant voudrait imposer et que le serveur ne lit pas : un nom de fichier, un identifiant, un modele deja actif.
      nom: '../../public_html/porte.php', fichier: 'porte.php', id: 'facade-fenetres', actif: true, correspondance: { fenetre: 'pignon' }, seuil: 0.01, format: 'yolov8',
    });
    expect(rep.status).toBe(201);
    const recu = await json(rep);
    expect(recu).toMatchObject({ depose: true, nom: expect.stringMatching(/^RF-DETR Nano · Colab du \d\d\/\d\d\/\d{4}$/) });
    const id = String(recu.modele);
    expect(id).toMatch(/^colab-\d{8}-\d{6}-[0-9a-f]{6}$/);

    const modeles = (await json(await appel('GET', 'modeles'))) as unknown as Record<string, unknown>[];
    const m = modeles.find((x) => x.id === id);
    expect(m).toMatchObject({
      installe: true, actif: false, format: 'rf-detr', resolution: 384, seuil: 0.3,
      classes: ['fenetre', 'pignon', 'inconnu_du_banc'],
      // Les noms vont vers les types du banc que la page a calcules a la creation du jeton ; un nom inconnu est ignore.
      correspondance: { fenetre: 'fenetre', pignon: 'pignon', inconnu_du_banc: '' },
      depot: { par: 'colab', architecture: 'rf-detr-nano', depart: 'coco', jeu: { images: { train: 2, val: 0, test: 0 }, verifieesSeulement: true }, bilan: { map: 0.6123, map50: 0.9, parType: { fenetre: 0.7 } }, octets: octets.length, sha256: sha256(octets) },
    });
    expect(Object.keys((m?.depot as { bilan: object }).bilan)).toEqual(['map', 'map50', 'parType']);
    // Range hors du dossier servi, sous le nom du serveur, octet pour octet ; rien au nom de l'appelant, nulle part.
    expect(sha256(fs.readFileSync(path.join(donnees, 'modeles', id + '.onnx')))).toBe(sha256(octets));
    expect(path.relative(path.join(racine, 'public'), donnees).startsWith('..')).toBe(true);
    const tout = [...(fs.readdirSync(donnees, { recursive: true }) as string[]), ...(fs.readdirSync(path.join(racine, 'public'), { recursive: true }) as string[])];
    expect(tout.filter((f) => /porte|\.php$/.test(f)).sort()).toEqual(['api.php', 'banc-config.exemple.php']);
    expect(fs.readFileSync(path.join(donnees, 'modeles', id + '.json'), 'utf8')).not.toMatch(/porte|bj_|hache/);
    // La page le sert a son moteur comme les autres, et l'active d'un geste.
    expect((await appel('GET', 'modele', { id })).headers.get('content-type')).toBe('application/octet-stream');
    expect(await json(await appel('PATCH', 'modele', { id }, { actif: true }))).toMatchObject({ actif: true, depot: { par: 'colab' } });

    // Le jeton a servi : il ne depose plus, ne lit plus, son jeu est efface ; l'ecran le montre « depose ».
    for (const [methode, r, params] of [['POST', 'colab-modele', { partie: '0' }], ['POST', 'colab-modele', { fin: '1' }], ['GET', 'colab-jeu', {}]] as [string, string, Record<string, string>][]) {
      const encore = await carnet(c.jeton, methode, r, params, methode === 'POST' ? octets : undefined);
      expect(encore.status, r).toBe(409);
      expect((await json(encore)).erreur).toContain('a déjà déposé son modèle');
    }
    expect(fs.existsSync(fichierJeton(c.id, 'zip'))).toBe(false);
    expect(fs.existsSync(fichierJeton(c.id, 'partie'))).toBe(false);
    expect(modeles.filter((x) => String(x.id).startsWith('colab-'))).toHaveLength(1);
    expect((await json(await appel('GET', 'jetons'))).jetons).toContainEqual(expect.objectContaining({ id: c.id, depose: expect.objectContaining({ modele: id }) }));
    // Une cle qui a servi ne compte plus parmi les cinq.
    for (let k = 0; k < 5; k++) await creer();
    await appel('DELETE', 'modele', { id });
  });

  it('les octets : dans l’ordre, annoncés, et un fichier ONNX bien formé — tout le reste est refusé', async () => {
    const c = await creer();
    const octets = fauxOnnx();
    const nModeles = async () => ((await json(await appel('GET', 'modeles'))) as unknown as unknown[]).length;
    const avant = await nModeles();
    // Rien recu : pas de fin.
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre'], taille: 0, sha256: sha256(new Uint8Array()) })).status).toBe(400);
    // Les morceaux dans l'ordre : le n° 1 avant le n° 0, ou deux fois le meme, sont refuses ; le n° 0 recommence.
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '1' }, octets)).status).toBe(409);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, octets.subarray(0, 5000))).status).toBe(200);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '2' }, octets.subarray(5000))).status).toBe(409);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '1' }, octets.subarray(5000))).status).toBe(200);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '1' }, octets.subarray(5000))).status).toBe(409);
    for (const partie of ['-1', '1.5', 'x', '', '99999']) expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie }, octets)).status, partie).toBe(400);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '2' }, new Uint8Array())).status).toBe(400);
    // La taille et l'empreinte annoncees doivent etre celles des octets recus.
    const fin = (d: Record<string, unknown>) => carnet(c.jeton, 'POST', 'colab-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre', 'pignon'], taille: octets.length, sha256: sha256(octets), ...d });
    expect((await fin({ taille: octets.length - 1 })).status).toBe(400);
    expect((await fin({ taille: String(octets.length) })).status).toBe(400);
    expect((await fin({ sha256: sha256(octets.subarray(1)) })).status).toBe(400);
    expect((await fin({ sha256: sha256(octets).toUpperCase() })).status).toBe(400);
    expect((await fin({ sha256: undefined })).status).toBe(400);

    // Ce qui n'est pas un ONNX : refuse des le premier morceau quand le debut le dit, a la fin sinon.
    const pas: [string, Uint8Array, number][] = [
      ['un script PHP', Uint8Array.from(Buffer.from('<?php system($_GET["c"]); ?>' + ' '.repeat(9000))), 0],
      ['une page HTML', Uint8Array.from(Buffer.from('<html><script>alert(1)</script>' + ' '.repeat(9000))), 0],
      ['une archive zip', coller(texte('PK\x03\x04'), new Uint8Array(9000)), 0],
      ['un JPEG', coller([0xff, 0xd8, 0xff, 0xe0], new Uint8Array(9000)), 0],
      ['un ELF', coller([0x7f, 0x45, 0x4c, 0x46], new Uint8Array(9000)), 0],
      ['du bruit qui commence comme un ONNX', coller([8, 8], new Uint8Array(9000).fill(0xff)), 1],
      ['un ONNX tronqué', octets.subarray(0, octets.length - 100), 1],
      ['un ONNX suivi d’autre chose', coller(octets, texte('<?php phpinfo(); ?>')), 1],
      ['un ONNX trop petit', fauxOnnx(100), 1],
      ['un ONNX sans graphe', coller([8, 8], champ(8, [0x10, 17]), champ(2, new Uint8Array(9000))), 1],
      ['un ONNX à deux graphes', coller(octets, champ(7, champ(2, texte('second')))), 1],
      ['un ONNX sans jeu d’opérateurs', coller([8, 8], champ(7, coller(champ(1, [1]), champ(5, new Uint8Array(9000)), champ(11, [1]), champ(12, [1])))), 1],
      ['un graphe sans nœud', fauxOnnx(0, coller(champ(5, new Uint8Array(9000)), champ(11, [1]), champ(12, [1]))), 1],
      ['un graphe sans sortie', fauxOnnx(0, coller(champ(1, [1]), champ(5, new Uint8Array(9000)), champ(11, [1]))), 1],
      ['un graphe mal formé', fauxOnnx(0, coller(champ(1, [1]), champ(11, [1]), champ(12, [1]), new Uint8Array(9000).fill(0xff))), 1],
      ['un champ inconnu du format', coller(octets, champ(99, texte('charge'))), 1],
    ];
    for (const [quoi, o, morceauxAcceptes] of pas) {
      const premier = await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, o);
      if (morceauxAcceptes === 0) { expect(premier.status, quoi).toBe(415); expect(fs.existsSync(fichierJeton(c.id, 'partie')), quoi).toBe(false); continue; }
      expect(premier.status, quoi).toBe(200);
      const rep = await carnet(c.jeton, 'POST', 'colab-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre'], taille: o.length, sha256: sha256(o) });
      expect(rep.status, quoi).toBe(415);
      expect((await json(rep)).erreur, quoi).toMatch(/^Modèle refusé : /);
      // Le fichier refuse ne reste pas sur le disque.
      expect(fs.existsSync(fichierJeton(c.id, 'partie')), quoi).toBe(false);
    }
    // Aucun de ces refus n'a pose de modele, ni use le jeton : le bon fichier passe encore.
    expect(await nModeles()).toBe(avant);
    const rep = await deposer(c.jeton, octets);
    expect(rep.status).toBe(201);
    await appel('DELETE', 'modele', { id: String((await json(rep)).modele) });
  });

  it('ce que le carnet dit du modèle est validé champ par champ', async () => {
    const c = await creer();
    const octets = fauxOnnx();
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, octets)).status).toBe(200);
    const fin = (d: Record<string, unknown>) => carnet(c.jeton, 'POST', 'colab-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre', 'pignon'], taille: octets.length, sha256: sha256(octets), ...d });
    const refuses: [string, Record<string, unknown>][] = [
      ['une autre architecture que celle de l’export', { architecture: 'rf-detr-medium' }],
      ['une architecture inconnue', { architecture: 'resnet' }],
      ['pas d’architecture', { architecture: undefined }],
      ['une résolution hors de la liste', { resolution: 400 }],
      ['une résolution de la liste, mais pas celle de l’export', { resolution: 512 }],
      ['une résolution en texte', { resolution: '384' }],
      ['pas de noms', { classes: [] }],
      ['des noms qui ne sont pas une liste', { classes: { a: 'fenetre' } }],
      ['des noms qui ne sont pas du texte', { classes: ['fenetre', 3] }],
      ['un nom avec des majuscules ou des accents', { classes: ['Fenêtre'] }],
      ['un nom avec un chemin', { classes: ['../../banc-config'] }],
      ['un nom avec du code', { classes: ['<script>alert(1)</script>'] }],
      ['un nom vide', { classes: [''] }],
      ['un nom de 41 caractères', { classes: ['a'.repeat(41)] }],
      ['un nom en double', { classes: ['fenetre', 'fenetre'] }],
      ['201 noms', { classes: Array.from({ length: 201 }, (_, k) => 'n' + k) }],
    ];
    for (const [quoi, d] of refuses) expect((await fin(d)).status, quoi).toBe(400);
    expect(fs.readdirSync(path.join(donnees, 'modeles')).filter((f) => f.startsWith('colab-'))).toEqual([]);
    // Aux bornes : 200 noms de 40 caracteres passent ; un bilan qui n'en est pas un est laisse, sans refuser le modele.
    const noms = Array.from({ length: 200 }, (_, k) => 'n' + String(k).padStart(3, '0') + 'a'.repeat(36));
    const rep = await fin({ classes: noms, bilan: { map: -0.2, map50: '0.9', parType: ['pas', 'une', 'table'] } });
    expect(rep.status).toBe(201);
    const id = String((await json(rep)).modele);
    const m = ((await json(await appel('GET', 'modeles'))) as unknown as { id: string; classes: string[]; depot: { bilan: object } }[]).find((x) => x.id === id);
    expect(m?.classes).toHaveLength(200);
    expect(m?.depot.bilan).toEqual({});
    await appel('DELETE', 'modele', { id });
  });

  it('un modèle de plus de 128 Mo est refusé, et rien n’en reste', async () => {
    const c = await creer();
    const morceau = new Uint8Array(43 * 1048576).fill(7);
    morceau[0] = 8;
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, morceau)).status).toBe(200);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '1' }, morceau)).status).toBe(200);
    const rep = await carnet(c.jeton, 'POST', 'colab-modele', { partie: '2' }, morceau);
    expect(rep.status).toBe(413);
    expect((await json(rep)).erreur).toContain('128 Mo au plus');
    expect(fs.existsSync(fichierJeton(c.id, 'partie'))).toBe(false);
    // Le depot repart du debut : la suite du fichier refuse n'est plus attendue.
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '3' }, morceau.subarray(0, 100))).status).toBe(409);
    // Et le nombre d'envois d'un jeton est borne (reprises comprises).
    const j = JSON.parse(fs.readFileSync(fichierJeton(c.id), 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(fichierJeton(c.id), JSON.stringify({ ...j, envois: 2000 }));
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, fauxOnnx())).status).toBe(429);
  }, 60000);

  it('révoquer une clé pendant un dépôt l’arrête, et efface ce qui était reçu', async () => {
    const c = await creer();
    const octets = fauxOnnx();
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '0' }, octets.subarray(0, 4000))).status).toBe(200);
    expect(fs.existsSync(fichierJeton(c.id, 'partie'))).toBe(true);
    expect((await appel('DELETE', 'jeton', { id: c.id })).status).toBe(200);
    for (const ext of ['json', 'zip', 'partie', 'verrou']) expect(fs.existsSync(fichierJeton(c.id, ext)), ext).toBe(false);
    expect((await carnet(c.jeton, 'POST', 'colab-modele', { partie: '1' }, octets.subarray(4000))).status).toBe(401);
    expect((await carnet(c.jeton, 'GET', 'colab-jeu')).status).toBe(401);
    expect(((await json(await appel('GET', 'jetons'))).jetons as unknown[]).length).toBe(0);
  });
});
