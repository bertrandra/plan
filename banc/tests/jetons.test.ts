// Les jetons d'entrainement (banc/public/api.php ; demande du proprietaire, 20 novembre 2026 : moins de gestes entre l'export et le
// depot du modele ; 21 novembre : l'entrainement se fait sur son Mac). L'etape 6 cree un jeton et telecharge un script qui le porte ;
// le script lit le jeu et depose le modele lui-meme. Chaque garde-fou est essaye ici, un a un, par `php -S` : qui cree un jeton, ce
// qu'il ouvre et ce qu'il n'ouvre pas, comment il se refuse, ce qu'un depot doit etre. Le script lui-meme est joue par bash contre ce
// serveur, avec un faux fichier ONNX fabrique sur place a la place de l'entrainement (BANC_ESSAI_MODELE) : ni Mac, ni mps, ni
// entrainement ne sont joues. Aucun vrai secret : les jetons sont crees a la volee. Saute si PHP manque.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { scriptValable } from '../src/entrainement.js';

const php = spawnSync('php', ['-r', 'exit(class_exists("ZipArchive") && function_exists("imagejpeg") ? 0 : 1);']).status === 0;
// Ce que le script demande a la machine : bash, et un Python 3.10 ou plus recent qui sait creer un environnement isole.
const python = spawnSync('python3', ['-c', 'import sys, venv, ensurepip; sys.exit(0 if sys.version_info[:2] >= (3, 10) else 1)']).status === 0;
const bash = spawnSync('bash', ['-c', 'exit 0']).status === 0;
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
/** Un appel du script d'entrainement : le jeton dans son en-tete, ni session ni X-Banc. */
function mac(jeton: string, methode: string, r: string, params: Record<string, string> = {}, corps?: Uint8Array | Record<string, unknown>, entetes: Record<string, string> = {}): Promise<Response> {
  const h = new Headers({ 'X-Banc-Jeton': jeton, 'User-Agent': 'banc-entrainement', ...entetes });
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

interface Cree { jeton: string; id: string; script: string; fichier: string; public: Record<string, unknown> }
/** Le Python que le script embarque, tel qu'il l'ecrira a cote de lui. */
const pythonDu = (script: string): string => /<<'PYTHON_DU_BANC'\n([\s\S]*?)\nPYTHON_DU_BANC\n/.exec(script)?.[1] ?? '';
const DEMANDE = { format: 'rfdetr', base: 'rf-detr-nano', depart: 'coco', verifiees: true, adresse: 'https://banc.example/banc/api.php', correspondance: { fenetre: 'fenetre', pignon: 'pignon' } };
async function creer(demande: Record<string, unknown> = {}): Promise<Cree> {
  const rep = await appel('POST', 'jetons', {}, { ...DEMANDE, ...demande });
  expect(rep.status).toBe(201);
  const r = await json(rep) as unknown as { jeton: Record<string, unknown>; fichier: string; script: string };
  const jeton = /bj_[0-9a-f]{16}_[0-9a-f]{64}/.exec(r.script)?.[0] ?? '';
  expect(jeton).not.toBe('');
  return { jeton, id: String(r.jeton.id), script: r.script, fichier: r.fichier, public: r.jeton };
}
/** Le depot entier d'un modele, comme le script le fait : des morceaux dans l'ordre, puis la fin avec ce qu'il en dit. */
async function deposer(jeton: string, octets: Uint8Array, description: Record<string, unknown> = {}, pas = 4000): Promise<Response> {
  for (let n = 0, d = 0; d < octets.length; n++, d += pas) expect((await mac(jeton, 'POST', 'entrainement-modele', { partie: String(n) }, octets.subarray(d, d + pas))).status).toBe(200);
  return mac(jeton, 'POST', 'entrainement-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre', 'pignon'], taille: octets.length, sha256: sha256(octets), ...description });
}
const fichierJeton = (id: string, ext = 'json') => path.join(donnees, 'jetons', `${id}.${ext}`);

describe.skipIf(!php)('les jetons d’entraînement : l’aller-retour du script, et ce qu’il refuse', () => {
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
    expect((await mac(jeton, 'POST', 'jetons', {}, DEMANDE, { 'X-Banc': '1' })).status).toBe(401);
    expect((await mac(jeton, 'GET', 'jetons')).status).toBe(401);
  });

  it('le jeton est tiré au hasard, gardé haché, et ne sort que dans le script', async () => {
    const a = await creer();
    const b = await creer();
    expect(a.jeton).toMatch(/^bj_[0-9a-f]{16}_[0-9a-f]{64}$/);
    expect(a.jeton).not.toBe(b.jeton);
    const secret = a.jeton.split('_')[2] ?? '';
    const garde = fs.readFileSync(fichierJeton(a.id), 'utf8');
    expect(garde).not.toContain(secret);
    expect((JSON.parse(garde) as { hache: string }).hache).toBe(createHash('sha256').update(secret).digest('hex'));
    // Ni la reponse hors du script, ni la liste, ni aucun autre fichier des donnees ne portent le secret ou son hache.
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

  it('le script est un fichier bash entier : l’adresse du banc, sa clé (jamais affichée en entier), les trois routes du jeton, les réglages d’entraînement', async () => {
    const c = await creer();
    expect(c.fichier).toMatch(/^entrainer-banc-rf-detr-nano-\d{8}-\d{6}\.sh$/);
    expect(scriptValable(c.script)).toBe(true);
    expect(c.script.startsWith('#!/bin/bash\n')).toBe(true);
    expect(c.script.trimEnd().endsWith('# fin du script du banc')).toBe(true);
    expect(c.script).toContain("BANC_ADRESSE='https://banc.example/banc/api.php'");
    expect(c.script).toContain(`BANC_CLE='${c.jeton}'`);
    expect(c.script).toContain("BANC_ARCHITECTURE='rf-detr-nano'\nBANC_RESOLUTION=384\nBANC_MORCEAU=4194304\nFAMILLE=rfdetr\n");
    expect(c.script).toContain(`bash ~/Downloads/${c.fichier}`);
    expect(c.script).toMatch(/CE FICHIER CONTIENT UNE CLE valable 24 h : ne le partagez pas\./);
    expect(c.script).toContain('Apache 2.0');
    // Le jeton n'est ecrit qu'une fois, jamais dans une adresse, et le shell ne s'en sert que deux fois : pour en afficher le debut
    // (onze caracteres : « bj_ » et la moitie de l'identifiant public), et pour le passer au Python par l'environnement.
    expect(c.script.split(c.jeton)).toHaveLength(2);
    expect(c.script).not.toMatch(/[?&][a-z]*=bj_/);
    const usages = c.script.split('\n').filter((l) => /\$\{?BANC_CLE/.test(l));
    expect(usages).toHaveLength(2);
    expect(usages[0]).toContain('"${BANC_CLE:0:11}"');
    expect(usages[1]).toMatch(/^BANC_ADRESSE="\$BANC_ADRESSE" BANC_CLE="\$BANC_CLE" /);
    // La cle passe par l'environnement du Python, jamais sur sa ligne de commande (que « ps » montre a tous).
    expect(c.script).toContain('BANC_DOSSIER="$DOSSIER" $VEILLE "$ENV/bin/python" "$DOSSIER/entrainer_banc.py"\n');
    expect(c.script).not.toMatch(/set -[a-z]*x/);
    // Un environnement isole, dans le dossier de travail ; rien n'est installe dans le Python de la machine.
    expect(c.script).toContain('DOSSIER="${BANC_DOSSIER:-$HOME/banc-entrainement}"');
    expect(c.script).toContain('"$PY" -m venv "$ENV"');
    expect(c.script).toContain("PAQUETS=('rfdetr[train,loggers,onnx]==1.12.*')");
    expect(c.script).toContain('"$ENV/bin/python" -m pip install "${PAQUETS[@]}"');
    expect(c.script).not.toMatch(/sudo|pip3? install --user|--break-system-packages/);

    // Le Python embarque : il ne porte pas la cle, l'ote de l'environnement des qu'il l'a lue, et ne tourne que lance (les lecteurs
    // de donnees de macOS relisent le fichier : sans cette garde, chacun relancerait l'entrainement).
    const py = pythonDu(c.script);
    expect(py).not.toContain('bj_');
    expect(py).toContain("cle = os.environ.pop('BANC_CLE')");
    expect(py).toContain("if __name__ == '__main__':");
    expect(py).toContain("appeler(cle, {'r': 'entrainement-etat'})");
    expect(py).toContain("appeler(cle, {'r': 'entrainement-jeu'})");
    expect(py).toContain("{'r': 'entrainement-modele', 'partie': n}");
    expect(py).toContain("{'r': 'entrainement-modele', 'fin': '1'}");
    // mps sur Apple Silicon, cpu sinon, ou ce que BANC_APPAREIL impose.
    expect(py).toMatch(/torch\.backends\.mps\.is_available\(\):\n\s+return 'mps'/);
    expect(py).toMatch(/\n {4}return 'cpu', /);
    expect(py).toContain("os.environ.get('BANC_APPAREIL', '')");
    // Les reglages d'entrainement de la 5.37.0, a l'appareil pres.
    expect(py).toContain('from rfdetr import RFDETRNano');
    expect(py).toContain('m = RFDETRNano()\n');
    expect(py).toContain("m.train(dataset_dir='.', output_dir='sortie', epochs=epoques or 100, batch_size=8, grad_accum_steps=2, early_stopping=True, early_stopping_patience=15, run_test=True, log_per_class_metrics=True, tensorboard=False, device=appareil)");
    expect(py).toContain("best.export(output_dir='sortie', quantization='int8', calibration_data='train')");

    // YOLO d'Ultralytics en option : son avertissement AGPL-3.0, ses poids, son export sans NMS.
    const y = await creer({ format: 'detect', base: 'yolov10n' });
    const pyY = pythonDu(y.script);
    expect(y.script).toMatch(/AGPL-3\.0.*publier le code ou d'acheter leur licence/);
    expect(y.script).toContain("BANC_ARCHITECTURE='yolov10n'\nBANC_RESOLUTION=640\n");
    expect(y.script).toContain("PAQUETS=('ultralytics==8.4.*' 'onnx' 'onnxslim' 'onnxruntime')");
    expect(pyY).toContain("m = YOLO(depart if os.path.exists(depart) else 'yolov10n.pt')");
    expect(pyY).toContain("m.train(data='data.yaml', epochs=epoques or 150, patience=30, imgsz=640, batch=16, device=appareil, project='runs', name='banc', exist_ok=True, seed=20261110, deterministic=True)");
    expect(pyY).toContain("modele = best.export(format='onnx', imgsz=640, nms=False)");
    const z = await creer({ format: 'seg', base: 'yolo11n-seg', depart: 'zero' });
    expect(z.fichier).toMatch(/^entrainer-banc-yolo11n-seg-zero-\d{8}-\d{6}\.sh$/);
    expect(pythonDu(z.script)).toContain("m = YOLO('yolo11n-seg.yaml')\n    m.train(data='data.yaml', pretrained=False, epochs=epoques or 300, patience=60, imgsz=640, batch=16, device=appareil,");
    expect(z.public).toMatchObject({ architecture: { format: 'yolov8-seg', resolution: 640, depart: 'zero' } });
    const r0 = await creer({ base: 'rf-detr-small', depart: 'zero' });
    expect(pythonDu(r0.script)).toContain('m = RFDETRSmall(pretrain_weights=None)\n    m.train(dataset_dir=\'.\', output_dir=\'sortie\', epochs=epoques or 300, batch_size=8, grad_accum_steps=2, early_stopping=True, early_stopping_patience=40,');

    // Le shell et le Python se lisent (sans rien executer) : une faute de syntaxe ne se decouvrirait qu'apres des heures d'entrainement.
    expect(bash, 'bash manque : le script ne peut pas etre verifie').toBe(true);
    expect(python, 'python3 (3.10 ou plus) manque : le script ne peut pas etre verifie').toBe(true);
    for (const k of [c, y, z, r0]) {
      const f = path.join(tmp, k.fichier);
      fs.writeFileSync(f, k.script);
      const b = spawnSync('bash', ['-n', f]);
      expect(b.stderr.toString()).toBe('');
      expect(b.status).toBe(0);
      fs.writeFileSync(f + '.py', pythonDu(k.script));
      const p = spawnSync('python3', ['-I', '-m', 'py_compile', f + '.py'], { env: { ...process.env, PYTHONPYCACHEPREFIX: path.join(tmp, 'pyc') } });
      expect(p.stderr.toString()).toBe('');
      expect(p.status).toBe(0);
      fs.rmSync(f); fs.rmSync(f + '.py');
    }
  });

  it('le script, joué par bash contre le serveur (sans entraîner) : il lit le jeu, dépose le modèle par morceaux, reprend sans tout relire, et s’arrête en disant pourquoi', async () => {
    expect(bash && python, 'bash ou python3 (3.10 ou plus, avec venv) manque : le script ne peut pas etre joue').toBe(true);
    const dossier = fs.mkdtempSync(path.join(tmp, 'mac-'));
    const travail = path.join(dossier, 'banc-entrainement');
    const bon = path.join(dossier, 'faux.onnx');
    fs.writeFileSync(bon, fauxOnnx(20000));
    const pasUnModele = path.join(dossier, 'pas-un-modele.onnx');
    fs.writeFileSync(pasUnModele, 'x'.repeat(9000));
    // Le script tel que la page le telecharge, a un mot pres : des morceaux de 6 000 octets (le serveur d'essai en ecrit de 4 Mo, le
    // faux modele pese 20 Ko), pour que le depot en compte plusieurs. L'entrainement, que seul un vrai lancement joue, est remplace
    // par le fichier de BANC_ESSAI_MODELE ; tout le reste (Python trouve, environnement cree, cle verifiee, jeu lu, depot) est joue.
    const jouer = (c: Cree, env: Record<string, string> = {}) => {
      const f = path.join(dossier, c.fichier);
      fs.writeFileSync(f, c.script.replace('BANC_MORCEAU=4194304', 'BANC_MORCEAU=6000'));
      // Sur une machine qui a rustup (celle de la CI), pip demande sa version a rustc pour se presenter, et rustup cree alors son
      // dossier dans le dossier personnel qu'on lui montre : il garde le vrai, pour que le faux ne recoive que ce que le script ecrit.
      const outils = { RUSTUP_HOME: process.env.RUSTUP_HOME ?? path.join(os.homedir(), '.rustup'), CARGO_HOME: process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo') };
      const r = spawnSync('bash', [f], { env: { ...process.env, ...outils, HOME: dossier, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1', BANC_ESSAI_MODELE: bon, ...env }, encoding: 'utf8' });
      const tout = r.stdout + r.stderr;
      // La cle ne s'affiche jamais en entier, quoi qu'il arrive : ni elle, ni son secret.
      expect(tout).not.toContain(c.jeton);
      expect(tout).not.toContain(c.jeton.split('_')[2]);
      expect(tout).toContain(`Clé d’entraînement bj_${c.id.slice(0, 8)}…`);
      return { sortie: r.stdout, erreur: r.stderr, code: r.status };
    };
    const garde = (c: Cree) => JSON.parse(fs.readFileSync(fichierJeton(c.id), 'utf8')) as { envois: number; lectures: number; depose: { modele: string } | null };

    // Premier lancement : le depot est refuse (le fichier n'est pas un modele). Le script le dit, garde le fichier et donne les noms.
    const c = await creer({ adresse: base + '/api.php' });
    const refuse = jouer(c, { BANC_ESSAI_MODELE: pasUnModele });
    expect(refuse.code, refuse.sortie + refuse.erreur).toBe(3);
    expect(refuse.sortie).toMatch(/1\/6 Python : .+ \(3\.\d+/);
    expect(refuse.sortie).toContain('2/6 Création de l’environnement Python isolé');
    expect(refuse.sortie).toContain('3/6 ESSAI (BANC_ESSAI_MODELE)');
    expect(refuse.sortie).toMatch(/Clé acceptée, valable encore 2[34] h \d\d min\. Jeu : 1 photo\(s\) pour apprendre, 0 pour valider, 0 pour le test\./);
    expect(refuse.sortie).toContain('4/6 Téléchargement du jeu…');
    expect(refuse.erreur).toContain('ARRÊT : dépôt impossible — le banc refuse (415) : Ce fichier n’est pas un modèle ONNX.');
    expect(refuse.erreur).toContain(`Le modèle est gardé ici : ${pasUnModele}`);
    expect(refuse.erreur).toContain('avec la résolution 384 et ces noms :\n0: fenetre\n1: pignon');
    expect(garde(c)).toMatchObject({ lectures: 1, envois: 1, depose: null });
    // Tout est range dans le dossier de travail (ici ~/banc-entrainement d'un faux dossier personnel), et rien a cote.
    const racine = String((c.public.jeu as { racine: string }).racine);
    expect(fs.readdirSync(dossier).sort()).toEqual(['banc-entrainement', c.fichier, 'faux.onnx', 'pas-un-modele.onnx'].sort());
    expect(fs.readdirSync(travail).sort()).toEqual([racine, 'cache', 'entrainer_banc.py', 'env-rfdetr'].sort());
    expect(fs.existsSync(path.join(travail, racine, 'train', '_annotations.coco.json'))).toBe(true);
    // Le Python ecrit a cote ne porte pas la cle.
    expect(fs.readFileSync(path.join(travail, 'entrainer_banc.py'), 'utf8')).not.toContain('bj_');

    // Relance : ni l'environnement ni le jeu ne sont refaits (le jeu n'est pas relu : une seule lecture comptee), le modele est depose.
    const depose = jouer(c);
    expect(depose.erreur).toBe('');
    expect(depose.code).toBe(0);
    expect(depose.sortie).toContain('2/6 Environnement Python déjà là');
    expect(depose.sortie).toContain('4/6 Jeu déjà là');
    expect(depose.sortie).not.toContain('Téléchargement du jeu');
    expect(depose.sortie).toMatch(/Déposé dans le banc : RF-DETR Nano · entraîné le \d\d\/\d\d\/\d{4}\n\nTerminé\. Le modèle est à l’étape 3 du banc, inactif/);
    const j = garde(c);
    expect(j).toMatchObject({ lectures: 1, envois: 5 });
    const m = ((await json(await appel('GET', 'modeles'))) as unknown as Record<string, unknown>[]).find((x) => x.id === j.depose?.modele);
    expect(m).toMatchObject({ actif: false, classes: ['fenetre', 'pignon'], resolution: 384, depot: { par: 'entrainement', bilan: {} } });
    await appel('DELETE', 'modele', { id: String(j.depose?.modele) });

    // Encore une fois : la cle a servi, le script le dit avant de rien faire.
    const servi = jouer(c);
    expect(servi.code).toBe(2);
    expect(servi.erreur).toContain('ARRÊT : cette clé a déjà déposé son modèle : il est à l’étape 3 du banc.');

    // Une cle revoquee (ou echue : le serveur les dit pareil) : arret avant le telechargement, avec ce qu'il faut faire.
    const d = await creer({ adresse: base + '/api.php' });
    expect((await appel('DELETE', 'jeton', { id: d.id })).status).toBe(200);
    const revoquee = jouer(d);
    expect(revoquee.code).toBe(2);
    expect(revoquee.erreur).toContain('ARRÊT : la clé de ce script est refusée : elle a expiré ou a été révoquée. Créez-en une autre à l’étape 6 du banc');
    expect(revoquee.sortie).not.toContain('Téléchargement du jeu');

    // Le banc injoignable (ici : personne n'ecoute a cette adresse).
    const e = await creer({ adresse: 'http://127.0.0.1:1/api.php' });
    const coupe = jouer(e);
    expect(coupe.code).toBe(2);
    expect(coupe.erreur).toMatch(/ARRÊT : le banc ne répond pas \(.+\)\. Vérifiez la connexion à Internet, puis relancez la même commande\./);

    // Un Python qui ne convient pas : arret avant de rien creer.
    const sansPython = jouer(e, { BANC_PYTHON: '/bin/false', BANC_DOSSIER: path.join(dossier, 'jamais') });
    expect(sansPython.code).toBe(1);
    expect(sansPython.erreur).toContain('ARRÊT : BANC_PYTHON (/bin/false) n’est pas un Python 3.10 ou plus récent.');
    expect(fs.existsSync(path.join(dossier, 'jamais', 'env-rfdetr'))).toBe(false);
  }, 120000);

  it('la taille des morceaux suit post_max_size de l’hébergement (4 Mo au plus, 64 Ko de marge)', () => {
    const morceau = (limite: string) => spawnSync('php', ['-d', 'post_max_size=' + limite, '-r', `require ${JSON.stringify(path.join(racine, 'public/api.php'))}; echo jeton_morceau();`]).stdout.toString();
    expect(morceau('8M')).toBe(String(4 * 1048576));
    expect(morceau('2M')).toBe(String(2 * 1048576 - 65536));
    expect(morceau('100K')).toBe('65536');
    expect(morceau('0')).toBe(String(4 * 1048576));
  });

  it('le jeton lit le jeu de son export, figé à sa création, et rien d’autre', async () => {
    const c = await creer();
    // Ou en est la cle, pour son script : ce qu'il lui reste a vivre et son jeu, sans compter une lecture ni rien dire de plus.
    const etat = await mac(c.jeton, 'GET', 'entrainement-etat');
    expect(etat.status).toBe(200);
    expect(etat.headers.get('set-cookie')).toBeNull();
    const e = await json(etat) as unknown as { reste: number; jeu: { racine: string } };
    expect(e).toMatchObject({ architecture: 'rf-detr-nano', jeu: { images: (c.public.jeu as { images: object }).images }, depose: false });
    expect(Object.keys(e).sort()).toEqual(['architecture', 'depose', 'expireLe', 'jeu', 'reste']);
    expect(e.reste).toBeGreaterThan(24 * 3600 - 60);
    expect(e.reste).toBeLessThanOrEqual(24 * 3600);
    expect(e.jeu.racine).toMatch(/^banc-rf-detr-nano-\d{8}-\d{6}$/);
    expect((await json(await appel('GET', 'jetons'))).jetons).toContainEqual(expect.objectContaining({ id: c.id, lectures: 0 }));
    await photoCorrigee('apres-le-jeton.jpg');
    const rep = await mac(c.jeton, 'GET', 'entrainement-jeu');
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
    for (const [methode, r, params] of ailleurs) expect((await mac(c.jeton, methode, r, params, methode === 'GET' ? undefined : {}, { 'X-Banc': '1' })).status, `${methode} ${r}`).toBe(401);
    // Et les routes du jeton ne lisent rien d'autre que son jeu : un identifiant de photo ou un chemin en plus ne changent rien.
    const encore = await mac(c.jeton, 'GET', 'entrainement-jeu', { id, v: 'source', fichier: '../../banc-config.php' });
    expect(encore.headers.get('content-type')).toBe('application/zip');
    expect(nomsDuZip(await encore.arrayBuffer())).toEqual(noms);
    // Le jeton ne se lit que dans son en-tete : ni dans l'adresse (que les journaux gardent), ni en Authorization, ni en temoin.
    for (const [params, entetes] of [[{ jeton: c.jeton }, {}], [{ 'X-Banc-Jeton': c.jeton }, {}], [{}, { Authorization: 'Bearer ' + c.jeton }], [{}, { Cookie: 'X-Banc-Jeton=' + c.jeton }]] as [Record<string, string>, Record<string, string>][]) {
      expect((await fetch(base + '/api.php?' + new URLSearchParams({ r: 'entrainement-jeu', ...params }).toString(), { headers: entetes })).status).toBe(401);
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
    for (const jeton of faux) for (const [methode, r, params] of [['GET', 'entrainement-etat', {}], ['GET', 'entrainement-jeu', {}], ['POST', 'entrainement-modele', { partie: '0' }], ['POST', 'entrainement-modele', { fin: '1' }]] as [string, string, Record<string, string>][]) {
      fs.rmSync(path.join(donnees, 'essais-jetons.json'), { force: true });
      const rep = await mac(jeton, methode, r, params, methode === 'POST' ? fauxOnnx() : undefined);
      reponses.add(rep.status + ' ' + await rep.text());
    }
    expect([...reponses]).toEqual(['401 {"erreur":"Jeton refusé."}']);
    // Sans en-tete du tout, pareil.
    expect(await (await fetch(base + '/api.php?r=entrainement-jeu')).text()).toBe('{"erreur":"Jeton refusé."}');
    // Le jeton echu s'est efface avec son jeu des que son script l'a presente ; le revoque l'etait deja.
    for (const x of [echu, revoque]) for (const ext of ['json', 'zip', 'partie']) expect(fs.existsSync(fichierJeton(x.id, ext)), ext).toBe(false);
    // Le bon marche toujours.
    expect((await mac(c.jeton, 'GET', 'entrainement-jeu')).status).toBe(200);
  });

  it('les essais manqués sont comptés par adresse : au vingtième, tout est refusé un quart d’heure, même un bon jeton', async () => {
    const c = await creer();
    for (let k = 0; k < 20; k++) expect((await mac('bj_' + 'c'.repeat(16) + '_' + 'd'.repeat(64), 'GET', 'entrainement-jeu')).status).toBe(401);
    expect((await mac('bj_' + 'c'.repeat(16) + '_' + 'd'.repeat(64), 'GET', 'entrainement-jeu')).status).toBe(429);
    expect((await mac(c.jeton, 'GET', 'entrainement-jeu')).status).toBe(429);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, fauxOnnx())).status).toBe(429);
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
    expect((await mac(c.jeton, 'GET', 'entrainement-jeu')).status).toBe(429);
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
    expect((await mac(c.jeton, 'GET', 'entrainement-jeu')).status).toBe(200);
    const octets = fauxOnnx(20000);
    const rep = await deposer(c.jeton, octets, {
      classes: ['fenetre', 'pignon', 'inconnu_du_banc'],
      bilan: { map: 0.61234567, map50: 0.9, parType: { fenetre: 0.7, pignon: 1.5, inconnu_du_banc: 'NaN', pas_un_nom: 0.2 }, autre: 'laissé' },
      // Ce que l'appelant voudrait imposer et que le serveur ne lit pas : un nom de fichier, un identifiant, un modele deja actif.
      nom: '../../public_html/porte.php', fichier: 'porte.php', id: 'facade-fenetres', actif: true, correspondance: { fenetre: 'pignon' }, seuil: 0.01, format: 'yolov8',
    });
    expect(rep.status).toBe(201);
    const recu = await json(rep);
    expect(recu).toMatchObject({ depose: true, nom: expect.stringMatching(/^RF-DETR Nano · entraîné le \d\d\/\d\d\/\d{4}$/) });
    const id = String(recu.modele);
    expect(id).toMatch(/^entrainement-\d{8}-\d{6}-[0-9a-f]{6}$/);

    const modeles = (await json(await appel('GET', 'modeles'))) as unknown as Record<string, unknown>[];
    const m = modeles.find((x) => x.id === id);
    expect(m).toMatchObject({
      installe: true, actif: false, format: 'rf-detr', resolution: 384, seuil: 0.3,
      classes: ['fenetre', 'pignon', 'inconnu_du_banc'],
      // Les noms vont vers les types du banc que la page a calcules a la creation du jeton ; un nom inconnu est ignore.
      correspondance: { fenetre: 'fenetre', pignon: 'pignon', inconnu_du_banc: '' },
      depot: { par: 'entrainement', architecture: 'rf-detr-nano', depart: 'coco', jeu: { images: { train: 2, val: 0, test: 0 }, verifieesSeulement: true }, bilan: { map: 0.6123, map50: 0.9, parType: { fenetre: 0.7 } }, octets: octets.length, sha256: sha256(octets) },
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
    expect(await json(await appel('PATCH', 'modele', { id }, { actif: true }))).toMatchObject({ actif: true, depot: { par: 'entrainement' } });

    // Le jeton a servi : il ne depose plus, ne lit plus, son jeu est efface ; l'ecran le montre « depose ».
    for (const [methode, r, params] of [['POST', 'entrainement-modele', { partie: '0' }], ['POST', 'entrainement-modele', { fin: '1' }], ['GET', 'entrainement-jeu', {}]] as [string, string, Record<string, string>][]) {
      const encore = await mac(c.jeton, methode, r, params, methode === 'POST' ? octets : undefined);
      expect(encore.status, r).toBe(409);
      expect((await json(encore)).erreur).toContain('a déjà déposé son modèle');
    }
    expect(fs.existsSync(fichierJeton(c.id, 'zip'))).toBe(false);
    expect(fs.existsSync(fichierJeton(c.id, 'partie'))).toBe(false);
    expect(modeles.filter((x) => String(x.id).startsWith('entrainement-'))).toHaveLength(1);
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
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre'], taille: 0, sha256: sha256(new Uint8Array()) })).status).toBe(400);
    // Les morceaux dans l'ordre : le n° 1 avant le n° 0, ou deux fois le meme, sont refuses ; le n° 0 recommence.
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '1' }, octets)).status).toBe(409);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, octets.subarray(0, 5000))).status).toBe(200);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '2' }, octets.subarray(5000))).status).toBe(409);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '1' }, octets.subarray(5000))).status).toBe(200);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '1' }, octets.subarray(5000))).status).toBe(409);
    for (const partie of ['-1', '1.5', 'x', '', '99999']) expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie }, octets)).status, partie).toBe(400);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '2' }, new Uint8Array())).status).toBe(400);
    // La taille et l'empreinte annoncees doivent etre celles des octets recus.
    const fin = (d: Record<string, unknown>) => mac(c.jeton, 'POST', 'entrainement-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre', 'pignon'], taille: octets.length, sha256: sha256(octets), ...d });
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
      const premier = await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, o);
      if (morceauxAcceptes === 0) { expect(premier.status, quoi).toBe(415); expect(fs.existsSync(fichierJeton(c.id, 'partie')), quoi).toBe(false); continue; }
      expect(premier.status, quoi).toBe(200);
      const rep = await mac(c.jeton, 'POST', 'entrainement-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre'], taille: o.length, sha256: sha256(o) });
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

  it('ce que le script dit du modèle est validé champ par champ', async () => {
    const c = await creer();
    const octets = fauxOnnx();
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, octets)).status).toBe(200);
    const fin = (d: Record<string, unknown>) => mac(c.jeton, 'POST', 'entrainement-modele', { fin: '1' }, { architecture: 'rf-detr-nano', resolution: 384, classes: ['fenetre', 'pignon'], taille: octets.length, sha256: sha256(octets), ...d });
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
    expect(fs.readdirSync(path.join(donnees, 'modeles')).filter((f) => f.startsWith('entrainement-'))).toEqual([]);
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
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, morceau)).status).toBe(200);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '1' }, morceau)).status).toBe(200);
    const rep = await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '2' }, morceau);
    expect(rep.status).toBe(413);
    expect((await json(rep)).erreur).toContain('128 Mo au plus');
    expect(fs.existsSync(fichierJeton(c.id, 'partie'))).toBe(false);
    // Le depot repart du debut : la suite du fichier refuse n'est plus attendue.
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '3' }, morceau.subarray(0, 100))).status).toBe(409);
    // Et le nombre d'envois d'un jeton est borne (reprises comprises).
    const j = JSON.parse(fs.readFileSync(fichierJeton(c.id), 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(fichierJeton(c.id), JSON.stringify({ ...j, envois: 2000 }));
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, fauxOnnx())).status).toBe(429);
  }, 60000);

  it('révoquer une clé pendant un dépôt l’arrête, et efface ce qui était reçu', async () => {
    const c = await creer();
    const octets = fauxOnnx();
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '0' }, octets.subarray(0, 4000))).status).toBe(200);
    expect(fs.existsSync(fichierJeton(c.id, 'partie'))).toBe(true);
    expect((await appel('DELETE', 'jeton', { id: c.id })).status).toBe(200);
    for (const ext of ['json', 'zip', 'partie', 'verrou']) expect(fs.existsSync(fichierJeton(c.id, ext)), ext).toBe(false);
    expect((await mac(c.jeton, 'POST', 'entrainement-modele', { partie: '1' }, octets.subarray(4000))).status).toBe(401);
    expect((await mac(c.jeton, 'GET', 'entrainement-jeu')).status).toBe(401);
    expect(((await json(await appel('GET', 'jetons'))).jetons as unknown[]).length).toBe(0);
  });
});
