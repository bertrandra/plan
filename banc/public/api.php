<?php
// Banc d'apprentissage des facades : l'API de la page (banc/src/api.ts). Une seule porte, protegee par un mot de passe
// (banc-config.php, hors de public_html/). Les donnees vivent dans data/apprentissage/, hors de public_html/ aussi :
//
//   classes.json                 l'arbre des objets a marquer (etape 0)
//   reglages.json                les blocs d'apprentissage : graine, parts, echantillon de verification (etape 7)
//   images/<id>/meta.json        d'ou vient la photo, son etat, son bloc, son drapeau « verifiee »
//   images/<id>/source.jpg       la photo telle qu'importee (etape 1)
//   images/<id>/redressee.jpg    la photo redressee (etape 2), sur laquelle on marque
//   images/<id>/vignette.jpg     la vignette du catalogue
//   images/<id>/annotation.json  le marquage : rectangles et polygones, en pixels de redressee.jpg (etapes 3 a 5)
//   modeles/<id>.onnx, .json     les modeles YOLO du brouillon (ceux du depot facade, et ceux que vous entrainez)
//
// Le banc n'utilise rien de Plan : ni son code, ni ses donnees, ni sa session.

declare(strict_types=1);

const BANC_ID = '/^[a-z0-9][a-z0-9-]{2,63}$/';
const BANC_VARIANTES = ['source', 'redressee', 'vignette'];
const BANC_STATUTS = ['importee', 'redressee', 'validee', 'rejetee', 'brouillon', 'corrigee'];
const BANC_BLOCS = ['', 'train', 'val', 'test', 'reserve'];
const BANC_TAILLE_MAX = 40 * 1024 * 1024;
/** Les modeles connus, a installer d'un geste : ceux du depot facade (YOLOv10n, AGPL-3.0), a un commit fixe. */
const BANC_CATALOGUE = [
  'facade-fenetres' => ['nom' => 'Fenêtres et portes (dépôt facade, YOLOv10n)', 'url' => 'https://raw.githubusercontent.com/bertrandra/facade/5c5a99181597165c36d2144115cd32d5c94297c5/modeles/fenetres-yolov10n.onnx', 'format' => 'yolov10', 'classes' => ['fenetre', 'porte'], 'correspondance' => ['fenetre' => 'fenetre', 'porte' => 'porte'], 'seuil' => 0.3],
  'facade-volets' => ['nom' => 'Volets (dépôt facade, YOLOv10n)', 'url' => 'https://raw.githubusercontent.com/bertrandra/facade/6d04280512e9fc7b481450eb996172e7bd83b16b/modeles/volets-yolov10n.onnx', 'format' => 'yolov10', 'classes' => ['volet'], 'correspondance' => ['volet' => 'volet'], 'seuil' => 0.3],
];

// ---------------------------------------------------------------------------------------------------------------------
// Reponses

function repondre(int $code, $corps): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function erreur(int $code, string $message): void { repondre($code, ['erreur' => $message]); }

// ---------------------------------------------------------------------------------------------------------------------
// Configuration et dossiers

/** La configuration : banc-config.php a cote de public_html/ (BANC_CONFIG la remplace, pour les tests). */
function banc_config(): array {
  static $c = null;
  if ($c !== null) return $c;
  $fichier = getenv('BANC_CONFIG') ?: dirname(__DIR__, 2) . '/banc-config.php';
  if (!is_file($fichier)) erreur(503, 'Le banc n’est pas configuré : copiez banc-config.exemple.php à côté de public_html/ sous le nom banc-config.php.');
  $lu = require $fichier;
  if (!is_array($lu)) erreur(503, 'banc-config.php doit rendre un tableau.');
  $mdp = (string)($lu['motDePasse'] ?? '');
  $hash = (string)($lu['motDePasseHash'] ?? '');
  if (($mdp === '' || $mdp === 'A-CHANGER') && $hash === '') erreur(503, 'Le mot de passe du banc n’est pas posé (banc-config.php).');
  $lu['dossierDonnees'] = rtrim((string)($lu['dossierDonnees'] ?? dirname($fichier) . '/data/apprentissage'), '/');
  return $c = $lu;
}

function dossier(string $sous = ''): string {
  $d = banc_config()['dossierDonnees'] . ($sous === '' ? '' : '/' . $sous);
  if (!is_dir($d) && !mkdir($d, 0775, true) && !is_dir($d)) erreur(500, 'Dossier impossible à créer : ' . $sous);
  return $d;
}

function lire_json(string $fichier, $defaut) {
  if (!is_file($fichier)) return $defaut;
  $v = json_decode((string)file_get_contents($fichier), true);
  return $v === null ? $defaut : $v;
}

/** Ecrit un JSON d'un coup (fichier temporaire puis renommage) : un fichier lu n'est jamais a moitie ecrit. */
function ecrire_json(string $fichier, $valeur): void {
  $tmp = $fichier . '.tmp' . bin2hex(random_bytes(3));
  if (file_put_contents($tmp, json_encode($valeur, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)) === false || !rename($tmp, $fichier)) {
    @unlink($tmp);
    erreur(500, 'Écriture impossible : ' . basename($fichier));
  }
}

function corps_json(): array {
  $v = json_decode((string)file_get_contents('php://input'), true);
  if (!is_array($v)) erreur(400, 'Corps JSON attendu.');
  return $v;
}

function id_valide(?string $id): string {
  if ($id === null || !preg_match(BANC_ID, $id)) erreur(400, 'Identifiant invalide.');
  return $id;
}

function dossier_image(string $id, bool $existe = true): string {
  $d = banc_config()['dossierDonnees'] . '/images/' . id_valide($id);
  if ($existe && !is_dir($d)) erreur(404, 'Image inconnue : ' . $id);
  return $d;
}

// ---------------------------------------------------------------------------------------------------------------------
// Session et mot de passe

function demarrer_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $chemin = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/';
  session_name('BANCSESSID');
  session_set_cookie_params(['lifetime' => 0, 'path' => $chemin, 'httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
  session_start();
}

function connecte(): bool { return !empty($_SESSION['banc']); }

/** Au plus 10 essais manques par adresse en 15 minutes : le mot de passe ne se devine pas a la volee. */
function essais(string $ip, ?bool $echec = null): int {
  $f = dossier() . '/connexions.json';
  $t = lire_json($f, []);
  $now = time();
  foreach ($t as $k => $l) { $t[$k] = array_values(array_filter($l, fn($s) => $now - $s < 900)); if (!$t[$k]) unset($t[$k]); }
  if ($echec === true) $t[$ip][] = $now;
  if ($echec === false) unset($t[$ip]);
  if ($echec !== null) ecrire_json($f, $t);
  return count($t[$ip] ?? []);
}

function connexion(): void {
  $c = banc_config();
  $ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnue';
  if (essais($ip) >= 10) erreur(429, 'Trop d’essais : réessayez dans quinze minutes.');
  $mdp = (string)(corps_json()['motDePasse'] ?? '');
  $hash = (string)($c['motDePasseHash'] ?? '');
  $ok = $hash !== '' ? password_verify($mdp, $hash) : hash_equals((string)$c['motDePasse'], $mdp);
  if (!$ok) { essais($ip, true); usleep(400000); erreur(401, 'Mot de passe incorrect.'); }
  essais($ip, false);
  session_regenerate_id(true);
  $_SESSION['banc'] = time();
  repondre(200, ['connecte' => true]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Images

function meta(string $id): array { return lire_json(dossier_image($id) . '/meta.json', []); }

function nouvel_id(): string { return gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3)); }

/** Une photo envoyee : un JPEG ou un PNG, sous la taille maximale, deplace a sa place. */
function recevoir(string $champ, string $vers, bool $requis = true): bool {
  $f = $_FILES[$champ] ?? null;
  if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) { if ($requis) erreur(400, 'Fichier manquant : ' . $champ); return false; }
  if ($f['error'] !== UPLOAD_ERR_OK) erreur(400, 'Envoi interrompu (' . $champ . ', code ' . $f['error'] . ').');
  if ($f['size'] > BANC_TAILLE_MAX) erreur(413, 'Fichier trop lourd : ' . $champ);
  $type = @getimagesize($f['tmp_name']);
  if (!$type || !in_array($type[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) erreur(415, 'Image JPEG ou PNG attendue : ' . $champ);
  if (!move_uploaded_file($f['tmp_name'], $vers) && !rename($f['tmp_name'], $vers)) erreur(500, 'Enregistrement impossible : ' . $champ);
  return true;
}

/** Ce que la page peut dire d'une photo a l'import : sa provenance, sa position, sa date, son appareil. */
function meta_importee(array $m): array {
  $garde = ['source', 'nom', 'date', 'lat', 'lon', 'azimut', 'appareil', 'focale35', 'adresse', 'panoramax', 'licence', 'auteur', 'largeur', 'hauteur', 'lot'];
  $out = [];
  foreach ($garde as $k) if (array_key_exists($k, $m)) $out[$k] = $m[$k];
  $out['source'] = in_array($out['source'] ?? '', ['iphone', 'panoramax', 'fichier'], true) ? $out['source'] : 'fichier';
  return $out;
}

function images_lister(): void {
  $d = dossier('images');
  $l = [];
  foreach (scandir($d) ?: [] as $id) {
    if (!preg_match(BANC_ID, $id)) continue;
    $m = lire_json("$d/$id/meta.json", null);
    if (is_array($m)) $l[] = $m;
  }
  usort($l, fn($a, $b) => strcmp((string)($b['importeeLe'] ?? ''), (string)($a['importeeLe'] ?? '')));
  repondre(200, $l);
}

function image_creer(): void {
  $meta = meta_importee(json_decode((string)($_POST['meta'] ?? '{}'), true) ?: []);
  // Une photo Panoramax deja importee ne revient pas une seconde fois.
  if (!empty($meta['panoramax']['id'])) foreach (scandir(dossier('images')) ?: [] as $autre) {
    $m = preg_match(BANC_ID, $autre) ? lire_json(dossier('images') . "/$autre/meta.json", []) : [];
    if (($m['panoramax']['id'] ?? null) === $meta['panoramax']['id']) erreur(409, 'Photo Panoramax déjà importée (' . $autre . ').');
  }
  $id = nouvel_id();
  $d = dossier_image($id, false);
  if (!mkdir($d, 0775, true)) erreur(500, 'Dossier impossible à créer.');
  recevoir('fichier', "$d/source.jpg");
  recevoir('vignette', "$d/vignette.jpg", false);
  $taille = @getimagesize("$d/source.jpg");
  $meta = ['id' => $id, 'importeeLe' => gmdate('c'), 'statut' => 'importee', 'verifiee' => false, 'bloc' => ''] + $meta;
  if ($taille) { $meta['largeur'] = $taille[0]; $meta['hauteur'] = $taille[1]; }
  ecrire_json("$d/meta.json", $meta);
  repondre(201, $meta);
}

/** Ce que l'on change d'une photo apres coup : son etat, son bloc, son drapeau, une note, l'adresse. */
function image_modifier(string $id): void {
  $d = dossier_image($id);
  $m = meta($id);
  $b = corps_json();
  if (array_key_exists('statut', $b)) { if (!in_array($b['statut'], BANC_STATUTS, true)) erreur(400, 'Statut inconnu.'); $m['statut'] = $b['statut']; }
  if (array_key_exists('bloc', $b)) { if (!in_array($b['bloc'], BANC_BLOCS, true)) erreur(400, 'Bloc inconnu.'); $m['bloc'] = $b['bloc']; }
  if (array_key_exists('verifiee', $b)) { $m['verifiee'] = (bool)$b['verifiee']; $m['verifieeLe'] = $m['verifiee'] ? gmdate('c') : null; }
  if (array_key_exists('echantillon', $b)) $m['echantillon'] = (bool)$b['echantillon'];
  foreach (['note', 'adresse'] as $k) if (array_key_exists($k, $b)) $m[$k] = mb_substr((string)$b[$k], 0, 500);
  $m['modifieeLe'] = gmdate('c');
  ecrire_json("$d/meta.json", $m);
  repondre(200, $m);
}

function image_supprimer(string $id): void {
  $d = dossier_image($id);
  foreach (scandir($d) ?: [] as $f) if ($f !== '.' && $f !== '..') @unlink("$d/$f");
  @rmdir($d);
  repondre(200, ['supprimee' => $id]);
}

function fichier_servir(string $id, string $v): void {
  if (!in_array($v, BANC_VARIANTES, true)) erreur(400, 'Variante inconnue.');
  $f = dossier_image($id) . "/$v.jpg";
  if (!is_file($f) && $v === 'vignette') $f = dossier_image($id) . '/source.jpg';
  if (!is_file($f)) erreur(404, 'Pas de ' . $v . ' pour cette image.');
  header('Content-Type: image/jpeg');
  header('Cache-Control: private, max-age=60');
  header('Content-Length: ' . filesize($f));
  readfile($f);
  exit;
}

/** L'etape 2 : la photo redressee, sa vignette, et comment elle l'a ete. */
function redressee_enregistrer(string $id): void {
  $d = dossier_image($id);
  recevoir('fichier', "$d/redressee.jpg");
  recevoir('vignette', "$d/vignette.jpg", false);
  $m = meta($id);
  $r = json_decode((string)($_POST['redressement'] ?? '{}'), true) ?: [];
  $taille = @getimagesize("$d/redressee.jpg");
  $m['redressement'] = ['methode' => (string)($r['methode'] ?? 'inconnue'), 'le' => gmdate('c')] + array_intersect_key($r, array_flip(['coins', 'horizontale', 'focale', 'note']));
  if ($taille) $m['redressee'] = ['largeur' => $taille[0], 'hauteur' => $taille[1]];
  // Une photo redressee de nouveau repasse par la validation ; son marquage, pose sur l'ancienne, ne vaut plus.
  $m['statut'] = 'redressee';
  if (is_file("$d/annotation.json")) rename("$d/annotation.json", "$d/annotation-" . gmdate('YmdHis') . '.json');
  ecrire_json("$d/meta.json", $m);
  repondre(200, $m);
}

// ---------------------------------------------------------------------------------------------------------------------
// Marquage

function annotation_lire(string $id): void {
  repondre(200, lire_json(dossier_image($id) . '/annotation.json', ['objets' => []]));
}

/** Un objet marque : sa classe, sa forme et ses points (pixels de redressee.jpg), son parent, ses attributs, d'ou il vient. */
function objet_valide($o): ?array {
  if (!is_array($o) || !is_string($o['id'] ?? null) || !is_string($o['classe'] ?? null)) return null;
  $forme = ($o['forme'] ?? '') === 'polygone' ? 'polygone' : 'rectangle';
  $pts = [];
  foreach ((array)($o['points'] ?? []) as $p) if (is_array($p) && is_numeric($p['x'] ?? null) && is_numeric($p['y'] ?? null)) $pts[] = ['x' => round((float)$p['x'], 2), 'y' => round((float)$p['y'], 2)];
  if (count($pts) < ($forme === 'polygone' ? 3 : 2)) return null;
  $out = ['id' => mb_substr($o['id'], 0, 40), 'classe' => mb_substr($o['classe'], 0, 40), 'forme' => $forme, 'points' => $pts,
    'parent' => is_string($o['parent'] ?? null) ? mb_substr($o['parent'], 0, 40) : null,
    'attributs' => is_array($o['attributs'] ?? null) ? $o['attributs'] : [],
    'origine' => in_array($o['origine'] ?? '', ['auto', 'main', 'corrige'], true) ? $o['origine'] : 'main'];
  if (is_numeric($o['score'] ?? null)) $out['score'] = round((float)$o['score'], 3);
  if (is_string($o['modele'] ?? null)) $out['modele'] = mb_substr($o['modele'], 0, 60);
  return $out;
}

function annotation_ecrire(string $id): void {
  $d = dossier_image($id);
  $b = corps_json();
  $objets = [];
  foreach ((array)($b['objets'] ?? []) as $o) { $v = objet_valide($o); if ($v) $objets[] = $v; }
  ecrire_json("$d/annotation.json", ['objets' => $objets, 'majLe' => gmdate('c'), 'par' => ($b['par'] ?? 'main') === 'auto' ? 'auto' : 'main']);
  $m = meta($id);
  $m['statut'] = ($b['par'] ?? 'main') === 'auto' ? 'brouillon' : 'corrigee';
  $m['objets'] = count($objets);
  $m['classes'] = array_values(array_unique(array_map(fn($o) => $o['classe'], $objets)));
  ecrire_json("$d/meta.json", $m);
  repondre(200, $m);
}

// ---------------------------------------------------------------------------------------------------------------------
// Classes et reglages

function classes_ecrire(): void {
  $b = corps_json();
  $l = $b['classes'] ?? null;
  if (!is_array($l) || !$l) erreur(400, 'Liste de classes attendue.');
  $ids = [];
  foreach ($l as $c) {
    if (!is_array($c) || !preg_match('/^[a-z][a-z0-9-]{0,39}$/', (string)($c['id'] ?? ''))) erreur(400, 'Classe sans identifiant valide.');
    if (isset($ids[$c['id']])) erreur(400, 'Classe en double : ' . $c['id']);
    $ids[$c['id']] = true;
  }
  ecrire_json(dossier() . '/classes.json', ['classes' => array_values($l), 'majLe' => gmdate('c')]);
  repondre(200, ['classes' => array_values($l)]);
}

function reglages_ecrire(): void {
  $b = corps_json();
  ecrire_json(dossier() . '/reglages.json', $b);
  repondre(200, $b);
}

// ---------------------------------------------------------------------------------------------------------------------
// Modeles du brouillon

function modeles_lister(): void {
  $d = dossier('modeles');
  $l = [];
  foreach (BANC_CATALOGUE as $id => $c) $l[$id] = ['id' => $id, 'installe' => is_file("$d/$id.onnx"), 'catalogue' => true] + $c;
  foreach (scandir($d) ?: [] as $f) {
    if (!preg_match('/^([a-z0-9][a-z0-9-]{2,63})\.json$/', $f, $m)) continue;
    $j = lire_json("$d/$f", []);
    $l[$m[1]] = array_merge($l[$m[1]] ?? [], $j, ['id' => $m[1], 'installe' => is_file("$d/{$m[1]}.onnx")]);
  }
  repondre(200, array_values($l));
}

function modele_description(array $j): array {
  $c = array_values(array_filter((array)($j['classes'] ?? []), 'is_string'));
  if (!$c) erreur(400, 'Le modèle doit dire ses classes, dans l’ordre de ses indices.');
  return ['nom' => mb_substr((string)($j['nom'] ?? 'Modèle'), 0, 120), 'format' => in_array($j['format'] ?? '', ['yolov10', 'yolov8', 'yolov8-seg'], true) ? $j['format'] : 'yolov10',
    'classes' => $c, 'correspondance' => is_array($j['correspondance'] ?? null) ? $j['correspondance'] : array_combine($c, $c), 'seuil' => is_numeric($j['seuil'] ?? null) ? (float)$j['seuil'] : 0.3,
    'actif' => ($j['actif'] ?? true) !== false, 'ajouteLe' => gmdate('c')];
}

function modele_ajouter(): void {
  $j = modele_description(json_decode((string)($_POST['description'] ?? '{}'), true) ?: []);
  $f = $_FILES['fichier'] ?? null;
  if (!$f || $f['error'] !== UPLOAD_ERR_OK) erreur(400, 'Fichier .onnx manquant.');
  if ($f['size'] > 200 * 1024 * 1024) erreur(413, 'Modèle trop lourd.');
  $id = 'mon-' . gmdate('Ymd-His');
  $d = dossier('modeles');
  if (!move_uploaded_file($f['tmp_name'], "$d/$id.onnx") && !rename($f['tmp_name'], "$d/$id.onnx")) erreur(500, 'Enregistrement impossible.');
  ecrire_json("$d/$id.json", $j);
  repondre(201, ['id' => $id] + $j);
}

/** Change la correspondance, le seuil ou l'activation d'un modele. */
function modele_modifier(string $id): void {
  $d = dossier('modeles');
  $base = lire_json("$d/$id.json", BANC_CATALOGUE[$id] ?? null);
  if (!is_array($base)) erreur(404, 'Modèle inconnu.');
  $b = corps_json();
  foreach (['correspondance', 'seuil', 'actif', 'nom'] as $k) if (array_key_exists($k, $b)) $base[$k] = $b[$k];
  ecrire_json("$d/$id.json", $base);
  repondre(200, ['id' => $id] + $base);
}

/** Installe un modele du catalogue : le serveur le telecharge une fois (le navigateur le lit ensuite d'ici). */
function modele_installer(string $id): void {
  $c = BANC_CATALOGUE[$id] ?? null;
  if (!$c) erreur(404, 'Modèle inconnu du catalogue.');
  $d = dossier('modeles');
  $contexte = stream_context_create(['http' => ['timeout' => 120, 'follow_location' => 1, 'user_agent' => 'banc-apprentissage']]);
  $octets = @file_get_contents($c['url'], false, $contexte);
  if ($octets === false || strlen($octets) < 100000) erreur(502, 'Téléchargement du modèle impossible depuis GitHub.');
  file_put_contents("$d/$id.onnx", $octets);
  if (!is_file("$d/$id.json")) ecrire_json("$d/$id.json", array_diff_key($c, ['url' => 1]) + ['actif' => true]);
  repondre(200, ['id' => $id, 'installe' => true, 'octets' => strlen($octets)]);
}

function modele_servir(string $id): void {
  $f = dossier('modeles') . "/$id.onnx";
  if (!is_file($f)) erreur(404, 'Modèle non installé.');
  header('Content-Type: application/octet-stream');
  header('Content-Length: ' . filesize($f));
  header('Cache-Control: private, max-age=86400');
  readfile($f);
  exit;
}

function modele_supprimer(string $id): void {
  $d = dossier('modeles');
  @unlink("$d/$id.onnx");
  if (!isset(BANC_CATALOGUE[$id])) @unlink("$d/$id.json");
  repondre(200, ['supprime' => $id]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Export (etape 6) : le jeu au format Ultralytics

/** Les classes apprises, dans l'ordre de l'arbre (parent avant enfants) : l'indice YOLO de chacune. */
function classes_apprises(): array {
  $l = lire_json(dossier() . '/classes.json', ['classes' => []])['classes'] ?? [];
  $enfants = [];
  foreach ($l as $c) $enfants[$c['parent'] ?? ''][] = $c;
  $ordre = [];
  $visiter = function (string $p) use (&$visiter, &$ordre, $enfants) {
    foreach ($enfants[$p] ?? [] as $c) { if (($c['apprendre'] ?? true) !== false) $ordre[] = $c['id']; $visiter($c['id']); }
  };
  $visiter('');
  // Une classe dont le parent n'existe pas est rangee a la fin, plutot que perdue.
  foreach ($l as $c) if (!in_array($c['id'], $ordre, true) && ($c['apprendre'] ?? true) !== false) $ordre[] = $c['id'];
  return $ordre;
}

/** Une ligne YOLO : la boite (detect) ou le contour (seg), en parts de l'image, a six decimales. */
function ligne_yolo(int $k, array $o, int $W, int $H, string $format): ?string {
  $xs = array_map(fn($p) => max(0.0, min(1.0, $p['x'] / $W)), $o['points']);
  $ys = array_map(fn($p) => max(0.0, min(1.0, $p['y'] / $H)), $o['points']);
  $f = fn($v) => number_format($v, 6, '.', '');
  if ($format === 'detect' || $o['forme'] === 'rectangle') {
    $x0 = min($xs); $x1 = max($xs); $y0 = min($ys); $y1 = max($ys);
    if ($x1 - $x0 <= 0 || $y1 - $y0 <= 0) return null;
    if ($format === 'detect') return "$k " . $f(($x0 + $x1) / 2) . ' ' . $f(($y0 + $y1) / 2) . ' ' . $f($x1 - $x0) . ' ' . $f($y1 - $y0);
    return "$k " . implode(' ', array_map($f, [$x0, $y0, $x1, $y0, $x1, $y1, $x0, $y1]));
  }
  $c = [];
  foreach ($xs as $i => $x) { $c[] = $f($x); $c[] = $f($ys[$i]); }
  return "$k " . implode(' ', $c);
}

/** Le bloc d'une image : le sien, sinon celui que la graine lui donne (le meme a chaque export). */
function bloc_de(array $m, array $reglages): string {
  if (in_array($m['bloc'] ?? '', ['train', 'val', 'test', 'reserve'], true)) return $m['bloc'];
  $parts = $reglages['parts'] ?? ['train' => 0.7, 'val' => 0.2, 'test' => 0.1];
  $u = hexdec(substr(hash('sha256', ($reglages['graine'] ?? 'banc') . ':' . $m['id']), 0, 8)) / 0xFFFFFFFF;
  $cumul = 0.0;
  foreach (['train', 'val', 'test'] as $b) { $cumul += (float)($parts[$b] ?? 0); if ($u < $cumul) return $b; }
  return 'train';
}

function exporter(string $format, bool $verifiees): void {
  if (!in_array($format, ['detect', 'seg', 'natif'], true)) erreur(400, 'Format inconnu (detect, seg, natif).');
  if (!class_exists('ZipArchive')) erreur(501, 'L’extension zip de PHP manque sur cet hébergement.');
  $classes = classes_apprises();
  $indice = array_flip($classes);
  $reglages = lire_json(dossier() . '/reglages.json', []);
  $tmp = tempnam(sys_get_temp_dir(), 'banc');
  $zip = new ZipArchive();
  if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) erreur(500, 'Archive impossible à créer.');
  $racine = 'banc-' . $format . '-' . gmdate('Ymd-His');
  $compte = ['train' => 0, 'val' => 0, 'test' => 0];
  $parClasse = [];
  $natif = [];
  $d = dossier('images');
  foreach (scandir($d) ?: [] as $id) {
    if (!preg_match(BANC_ID, $id)) continue;
    $m = lire_json("$d/$id/meta.json", []);
    $a = lire_json("$d/$id/annotation.json", null);
    // Seules les photos marquees a la main (corrigees) entrent dans le jeu ; le brouillon jamais relu n'apprend rien.
    if (!$a || ($m['statut'] ?? '') !== 'corrigee' || !is_file("$d/$id/redressee.jpg")) continue;
    if ($verifiees && empty($m['verifiee'])) continue;
    $bloc = bloc_de($m, $reglages);
    if ($bloc === 'reserve') continue;
    if ($format === 'natif') { $zip->addFile("$d/$id/redressee.jpg", "$racine/images/$id.jpg"); $natif[] = ['meta' => $m + ['blocExport' => $bloc], 'annotation' => $a]; $compte[$bloc]++; continue; }
    [$W, $H] = getimagesize("$d/$id/redressee.jpg") ?: [0, 0];
    if (!$W || !$H) continue;
    $lignes = [];
    foreach ($a['objets'] ?? [] as $o) {
      if (!isset($indice[$o['classe']])) continue;
      $l = ligne_yolo($indice[$o['classe']], $o, (int)$W, (int)$H, $format);
      if ($l !== null) { $lignes[] = $l; $parClasse[$o['classe']][$bloc] = ($parClasse[$o['classe']][$bloc] ?? 0) + 1; }
    }
    $zip->addFile("$d/$id/redressee.jpg", "$racine/images/$bloc/$id.jpg");
    $zip->addFromString("$racine/labels/$bloc/$id.txt", implode("\n", $lignes) . ($lignes ? "\n" : ''));
    $compte[$bloc]++;
  }
  if ($format === 'natif') {
    $zip->addFromString("$racine/annotations.json", json_encode(['classes' => lire_json(dossier() . '/classes.json', ['classes' => []])['classes'], 'images' => $natif], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
  } else {
    $noms = '';
    foreach ($classes as $k => $c) $noms .= "  $k: $c\n";
    $zip->addFromString("$racine/data.yaml", "# Jeu du banc d'apprentissage des facades, " . gmdate('c') . "\npath: .\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n$noms");
    $zip->addFromString("$racine/entrainer.py", script_entrainement($format));
  }
  $zip->addFromString("$racine/bilan.json", json_encode(['format' => $format, 'verifieesSeulement' => $verifiees, 'images' => $compte, 'objetsParClasse' => $parClasse, 'classes' => $classes, 'le' => gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
  $zip->close();
  header('Content-Type: application/zip');
  header('Content-Disposition: attachment; filename="' . $racine . '.zip"');
  header('Content-Length: ' . filesize($tmp));
  readfile($tmp);
  @unlink($tmp);
  exit;
}

/** Le script d'entrainement livre avec le jeu : le meme protocole que le depot facade (CPU, graine fixe), puis l'export ONNX. */
function script_entrainement(string $format): string {
  $poids = $format === 'seg' ? 'yolo11n-seg.pt' : 'yolov10n.pt';
  return "# Entrainement du banc d'apprentissage des facades ($format), Ultralytics 8.4.\n"
    . "#   pip install ultralytics==8.4.*\n#   python3 entrainer.py [cpu|0]\n"
    . "# Poids de depart : $poids (YOLOv10n comme le depot facade pour la detection ; YOLO11n-seg pour les contours).\n"
    . "# Le modele .onnx produit se depose dans le banc (etape 3, Modeles), avec la liste de ses classes (data.yaml).\n"
    . "import sys\nfrom ultralytics import YOLO\n\ndevice = sys.argv[1] if len(sys.argv) > 1 else 'cpu'\n"
    . "m = YOLO('$poids')\n"
    . "m.train(data='data.yaml', epochs=100, patience=25, imgsz=640, batch=8, device=device, workers=2, project='runs', name='banc', exist_ok=True, plots=False, amp=False, seed=20261110, deterministic=True)\n"
    . "m.val(data='data.yaml', split='test')\n"
    . "m.export(format='onnx', imgsz=640" . ($format === 'seg' ? '' : ', nms=False') . ")\n";
}

// ---------------------------------------------------------------------------------------------------------------------
// Routage

if (PHP_SAPI !== 'cli' || getenv('BANC_TEST_ROUTER')) {
  banc_config();
  demarrer_session();
  $r = (string)($_GET['r'] ?? '');
  $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  $id = isset($_GET['id']) ? (string)$_GET['id'] : null;
  if ($r === 'etat') repondre(200, ['connecte' => connecte()]);
  // Une ecriture vient de la page du banc, jamais d'un formulaire d'un autre site : l'en-tete X-Banc le dit.
  if ($methode !== 'GET' && ($_SERVER['HTTP_X_BANC'] ?? '') !== '1') erreur(403, 'En-tête X-Banc manquant.');
  if ($r === 'connexion' && $methode === 'POST') connexion();
  if (!connecte()) erreur(401, 'Connexion requise.');
  session_write_close();
  switch ("$methode $r") {
    case 'POST deconnexion': demarrer_session(); $_SESSION = []; session_destroy(); repondre(200, ['connecte' => false]);
    case 'GET classes': repondre(200, lire_json(dossier() . '/classes.json', ['classes' => []]));
    case 'PUT classes': classes_ecrire();
    case 'GET reglages': repondre(200, lire_json(dossier() . '/reglages.json', (object)[]));
    case 'PUT reglages': reglages_ecrire();
    case 'GET images': images_lister();
    case 'POST images': image_creer();
    case 'PATCH image': image_modifier((string)$id);
    case 'DELETE image': image_supprimer((string)$id);
    case 'GET fichier': fichier_servir((string)$id, (string)($_GET['v'] ?? 'source'));
    case 'POST redressee': redressee_enregistrer((string)$id);
    case 'GET annotation': annotation_lire((string)$id);
    case 'PUT annotation': annotation_ecrire((string)$id);
    case 'GET modeles': modeles_lister();
    case 'POST modeles': modele_ajouter();
    case 'PATCH modele': modele_modifier(id_valide($id));
    case 'POST installer': modele_installer(id_valide($id));
    case 'GET modele': modele_servir(id_valide($id));
    case 'DELETE modele': modele_supprimer(id_valide($id));
    case 'GET export': exporter((string)($_GET['format'] ?? 'detect'), ($_GET['verifiees'] ?? '0') === '1');
  }
  erreur(404, 'Route inconnue : ' . $methode . ' ' . $r);
}
