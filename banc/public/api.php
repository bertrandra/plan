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
//   jetons/<id>.json, .zip       les jetons d'entrainement (etape 6, « Entrainer sur mon Mac ») : haches, et le jeu de leur export
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
function essais(string $ip, ?bool $echec = null, string $fichier = 'connexions.json'): int {
  $f = dossier() . '/' . $fichier;
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

/**
 * Le mur qu'une vue montre (banc/src/types.ts::MurDeVue) : une liste fermee de champs, chacun borne. Null sans identifiant de batiment
 * ou sans cote valables : un mur a moitie dit ne se range pas.
 */
function mur_valide($m): ?array {
  if (!is_array($m) || !is_string($m['batiment'] ?? null) || !preg_match('/^[A-Za-z0-9_.:-]{1,64}$/', $m['batiment'])) return null;
  if (!is_numeric($m['cote'] ?? null) || (int)$m['cote'] < 0 || (int)$m['cote'] > 3) return null;
  $out = ['batiment' => $m['batiment'], 'cote' => (int)$m['cote']];
  $bornes = ['segment' => [0, 99999, 0], 'azimut' => [0, 360, 1], 'distance' => [0, 1000, 1], 'incidence' => [0, 90, 0], 'note' => [0, 100, 0], 'hauteur' => [0, 1000, 1], 'etages' => [0, 500, 0], 'logements' => [0, 100000, 0]];
  foreach ($bornes as $k => [$min, $max, $decimales]) {
    if (!is_numeric($m[$k] ?? null) || (float)$m[$k] < $min || (float)$m[$k] > $max) continue;
    $out[$k] = $decimales ? round((float)$m[$k], $decimales) : (int)round((float)$m[$k]);
  }
  foreach (['nature', 'usage', 'usage2'] as $k) if (is_string($m[$k] ?? null) && $m[$k] !== '') $out[$k] = mb_substr($m[$k], 0, 80);
  if (is_string($m['rattrapeLe'] ?? null)) $out['rattrapeLe'] = mb_substr($m['rattrapeLe'], 0, 40);
  return $out;
}

/**
 * Le cadre d'une vue tiree d'un 360 (banc/src/cadrage.ts) : champ, tangage, d'ou ils viennent, et le plan d'une vue rendue face au mur.
 * Une liste fermee de champs bornes ; null si le champ ou le tangage manquent.
 */
function cadrage_valide($c): ?array {
  if (!is_array($c) || !is_numeric($c['champ'] ?? null) || !is_numeric($c['tangage'] ?? null)) return null;
  $champ = (float)$c['champ']; $tangage = (float)$c['tangage'];
  if ($champ < 10 || $champ > 170 || $tangage < -60 || $tangage > 60) return null;
  $out = ['champ' => round($champ, 1), 'tangage' => round($tangage, 1), 'source' => in_array($c['source'] ?? '', ['facade', 'main'], true) ? $c['source'] : 'defaut'];
  if (is_bool($c['entier'] ?? null)) $out['entier'] = $c['entier'];
  $p = $c['plan'] ?? null;
  if (is_array($p) && is_numeric($p['axe'] ?? null) && (float)$p['axe'] >= 0 && (float)$p['axe'] <= 360) {
    $plan = ['axe' => round((float)$p['axe'], 1)];
    foreach (['x0', 'x1', 'y0', 'y1'] as $k) { if (!is_numeric($p[$k] ?? null) || abs((float)$p[$k]) > 20) { $plan = null; break; } $plan[$k] = round((float)$p[$k], 3); }
    if ($plan && $plan['x1'] > $plan['x0'] && $plan['y1'] > $plan['y0']) $out['plan'] = $plan;
  }
  return $out;
}

/** Ce que la page peut dire d'une photo a l'import : sa provenance, sa position, sa date, son appareil. */
function meta_importee(array $m): array {
  $garde = ['source', 'nom', 'date', 'lat', 'lon', 'azimut', 'appareil', 'focale35', 'adresse', 'parcelle', 'panoramax', 'licence', 'auteur', 'largeur', 'hauteur', 'lot'];
  $out = [];
  foreach ($garde as $k) if (array_key_exists($k, $m)) $out[$k] = $m[$k];
  $out['source'] = in_array($out['source'] ?? '', ['iphone', 'panoramax', 'fichier'], true) ? $out['source'] : 'fichier';
  // Le mur vise (demande du proprietaire, 15 novembre 2026) : garde s'il est valable, laisse sinon (l'image s'importe quand meme).
  $mur = mur_valide($m['mur'] ?? null);
  if ($mur) $out['mur'] = $mur;
  // Le cadre de la vue (15 novembre 2026) : ce que l'import a fait, pour que le redressement le sache.
  $cadrage = cadrage_valide($m['cadrage'] ?? null);
  if ($cadrage) $out['cadrage'] = $cadrage;
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
    // Une meme photo donne plusieurs vues (les deux cotes de la rue, ou des caps choisis dans le 360) : c'est la paire photo et cap
    // qui ne revient pas (a moins de 5 degres) ; une vue sans cap se compare par son nom.
    if (($m['panoramax']['id'] ?? null) === $meta['panoramax']['id'] && meme_vue($m['panoramax'], $meta['panoramax'])) erreur(409, 'Vue Panoramax déjà importée (' . $autre . ').');
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

/** Ce que l'on change d'une photo apres coup : son etat, son bloc, son drapeau, une note, l'adresse, le mur qu'elle montre. */
function image_modifier(string $id): void {
  $d = dossier_image($id);
  $m = meta($id);
  $b = corps_json();
  if (array_key_exists('statut', $b)) { if (!in_array($b['statut'], BANC_STATUTS, true)) erreur(400, 'Statut inconnu.'); $m['statut'] = $b['statut']; }
  if (array_key_exists('bloc', $b)) { if (!in_array($b['bloc'], BANC_BLOCS, true)) erreur(400, 'Bloc inconnu.'); $m['bloc'] = $b['bloc']; }
  if (array_key_exists('verifiee', $b)) { $m['verifiee'] = (bool)$b['verifiee']; $m['verifieeLe'] = $m['verifiee'] ? gmdate('c') : null; }
  if (array_key_exists('echantillon', $b)) $m['echantillon'] = (bool)$b['echantillon'];
  foreach (['note', 'adresse'] as $k) if (array_key_exists($k, $b)) $m[$k] = mb_substr((string)$b[$k], 0, 500);
  // Le mur retrouve apres coup (le rattrapage des images importees avant) ; null l'efface. « murCherche » : cherche, rien trouve.
  if (array_key_exists('mur', $b)) {
    if ($b['mur'] === null) unset($m['mur']);
    else { $mur = mur_valide($b['mur']); if (!$mur) erreur(400, 'Mur invalide.'); $m['mur'] = $mur; unset($m['murCherche']); }
  }
  if (array_key_exists('murCherche', $b)) { if (is_string($b['murCherche']) && $b['murCherche'] !== '') $m['murCherche'] = mb_substr($b['murCherche'], 0, 40); else unset($m['murCherche']); }
  $m['modifieeLe'] = gmdate('c');
  ecrire_json("$d/meta.json", $m);
  repondre(200, $m);
}

/** Supprime la photo et tout son dossier : source, redressee, vignette, meta, marquage et ses versions anciennes. */
function image_supprimer(string $id): void {
  $d = dossier_image($id);
  vider_dossier($d);
  if (is_dir($d)) erreur(500, 'Le dossier de la photo n’a pas pu être supprimé.');
  repondre(200, ['supprimee' => $id]);
}

function vider_dossier(string $d): void {
  foreach (scandir($d) ?: [] as $f) {
    if ($f === '.' || $f === '..') continue;
    if (is_dir("$d/$f") && !is_link("$d/$f")) vider_dossier("$d/$f"); else @unlink("$d/$f");
  }
  @rmdir($d);
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

/** Deux vues d'une meme photo Panoramax sont-elles la meme : meme cap a 5 degres pres, sinon meme nom de vue. */
function meme_vue(array $a, array $b): bool {
  if (is_numeric($a['cap'] ?? null) && is_numeric($b['cap'] ?? null)) {
    $d = fmod(abs((float)$a['cap'] - (float)$b['cap']), 360.0);
    return min($d, 360.0 - $d) < 5.0;
  }
  return ($a['vue'] ?? '') === ($b['vue'] ?? '');
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
  $forme = in_array($o['forme'] ?? '', ['polygone', 'ligne', 'point'], true) ? $o['forme'] : 'rectangle';
  $pts = [];
  foreach ((array)($o['points'] ?? []) as $p) if (is_array($p) && is_numeric($p['x'] ?? null) && is_numeric($p['y'] ?? null)) $pts[] = ['x' => round((float)$p['x'], 2), 'y' => round((float)$p['y'], 2)];
  if (count($pts) < ['polygone' => 3, 'rectangle' => 2, 'ligne' => 2, 'point' => 1][$forme]) return null;  // une ligne : deux points ; un point : un
  if ($forme === 'point') $pts = array_slice($pts, 0, 1);
  $out = ['id' => mb_substr($o['id'], 0, 40), 'classe' => mb_substr($o['classe'], 0, 40), 'forme' => $forme, 'points' => $pts,
    'parent' => is_string($o['parent'] ?? null) ? mb_substr($o['parent'], 0, 40) : null,
    'attributs' => is_array($o['attributs'] ?? null) ? $o['attributs'] : [],
    'origine' => in_array($o['origine'] ?? '', ['auto', 'main', 'corrige'], true) ? $o['origine'] : 'main'];
  if (is_numeric($o['score'] ?? null)) $out['score'] = round((float)$o['score'], 3);
  if (is_string($o['modele'] ?? null)) $out['modele'] = mb_substr($o['modele'], 0, 60);
  if (is_string($o['type'] ?? null) && $o['type'] !== '') $out['type'] = mb_substr($o['type'], 0, 40);
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
  // Les noms YOLO presents (le type d'un objet qualifie, sinon sa classe) : ce que la repartition des blocs equilibre (etape 7).
  [, $nomDe] = noms_yolo();
  $noms = array_values(array_filter(array_map($nomDe, $objets), fn($n) => is_string($n) && $n !== '' && $n[0] !== '?'));
  $m['etiquettes'] = array_count_values($noms);
  $m['aQualifier'] = count(array_filter(array_map($nomDe, $objets), fn($n) => is_string($n) && $n[0] === '?'));
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
    if (!is_array($c) || !preg_match('/^[a-z][a-z0-9_-]{0,39}$/', (string)($c['id'] ?? ''))) erreur(400, 'Classe sans identifiant valide.');
    foreach ((array)($c['types'] ?? []) as $t) {
      if (!is_array($t) || !preg_match('/^[a-z][a-z0-9_-]{0,39}$/', (string)($t['id'] ?? ''))) erreur(400, 'Type sans identifiant valide dans ' . $c['id'] . '.');
      if (isset($ids[$t['id']])) erreur(400, 'Nom en double : ' . $t['id']);
      $ids[$t['id']] = true;
    }
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
    // Un bilan vide reste un objet pour la page (relu du disque, il serait une liste).
    if (is_array($j['depot'] ?? null) && empty($j['depot']['bilan'])) $j['depot']['bilan'] = (object)[];
    $l[$m[1]] = array_merge($l[$m[1]] ?? [], $j, ['id' => $m[1], 'installe' => is_file("$d/{$m[1]}.onnx")]);
  }
  repondre(200, array_values($l));
}

function modele_description(array $j): array {
  $c = array_values(array_filter((array)($j['classes'] ?? []), 'is_string'));
  if (!$c) erreur(400, 'Le modèle doit dire ses classes, dans l’ordre de ses indices.');
  return ['nom' => mb_substr((string)($j['nom'] ?? 'Modèle'), 0, 120), 'format' => in_array($j['format'] ?? '', ['rf-detr', 'yolo26', 'yolo26-seg', 'yolov10', 'yolov8', 'yolov8-seg'], true) ? $j['format'] : 'yolov10',
    // RF-DETR : le cote du carre d'entree (384 Nano, 512 Small, 576 Medium), un multiple de 32.
    ...(($j['format'] ?? '') === 'rf-detr' ? ['resolution' => in_array((int)($j['resolution'] ?? 384), [384, 512, 576], true) ? (int)$j['resolution'] : 384] : []),
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

/**
 * Les noms YOLO : d'abord les objets principaux dans l'ordre de l'arbre (parent avant enfants), puis les details appris (une classe
 * rangee dans un objet appris : le cadre d'une fenetre) ; apprendre un detail ajoute des indices a la fin sans decaler les autres. Une
 * classe apprise sans types donne son identifiant ; une classe a types (fenetre_1v, fenetre_2v…) donne ses types ; un regroupement
 * (ouverture, fermeture…) ne donne rien. Et le nom d'un objet : son type pour une classe a types (« ?classe » s'il n'est pas qualifie),
 * sa classe sinon ; null hors du jeu. Rend aussi le chemin de chaque nom dans l'arbre (« facade/ouverture/fenetre/fenetre_2v »).
 * Le meme ordre que la page (banc/src/classes.ts::nomsYolo).
 */
function noms_yolo(): array {
  $l = lire_json(dossier() . '/classes.json', ['classes' => []])['classes'] ?? [];
  $parId = [];
  foreach ($l as $c) $parId[$c['id']] = $c;
  $enfants = [];
  foreach ($l as $c) $enfants[isset($parId[$c['parent'] ?? '']) ? $c['parent'] : ''][] = $c;
  // Une ligne (egout, sol) ou un point (pointe de pignon) ne s'apprend pas : YOLO apprend des boites et des contours ; ils restent dans
  // le format du banc.
  $appris = fn(array $c) => ($c['apprendre'] ?? true) !== false && empty($c['regroupement']) && in_array($c['forme'] ?? 'rectangle', ['rectangle', 'polygone'], true);
  $typesDe = fn(array $c) => array_values(array_filter(array_map(fn($t) => $t['id'] ?? null, (array)($c['types'] ?? [])), 'is_string'));
  $estDetail = function (array $c) use ($parId, $appris): bool {
    for ($p = $parId[$c['parent'] ?? ''] ?? null, $n = 0; $p && $n < 20; $p = $parId[$p['parent'] ?? ''] ?? null, $n++) if ($appris($p)) return true;
    return false;
  };
  $arbre = [];
  $vus = [];
  $visiter = function (string $p) use (&$visiter, &$arbre, &$vus, $enfants) {
    foreach ($enfants[$p] ?? [] as $c) {
      if (isset($vus[$c['id']])) continue;
      $vus[$c['id']] = true;
      $arbre[] = $c;
      $visiter($c['id']);
    }
  };
  $visiter('');
  $chemin = function (array $c) use ($parId): string {
    $l = [];
    for ($k = $c, $n = 0; $k && $n < 20; $k = $parId[$k['parent'] ?? ''] ?? null, $n++) array_unshift($l, $k['id']);
    return implode('/', $l);
  };
  $ordre = [];
  $chemins = [];
  $fige = [];
  foreach ([false, true] as $details) foreach ($arbre as $c) {
    if (!$appris($c) || $estDetail($c) !== $details) continue;
    $aussi = array_values(array_filter((array)($c['aussi'] ?? []), 'is_string'));
    foreach ((array)($c['types'] ?? []) ?: [$c] as $t) {
      $n = $t['id'];
      if (!is_string($n) || isset($chemins[$n])) continue;
      $ordre[] = $n;
      $chemins[$n] = $chemin($c) . (($c['types'] ?? []) ? '/' . $n : '') . ($aussi ? ' (aussi : ' . implode(', ', $aussi) . ')' : '');
      if (is_numeric($t['indice'] ?? null)) $fige[$n] = (float)$t['indice'];
    }
  }
  // Les indices figes d'abord (ils ne bougent plus quand l'arbre change), dans leur ordre ; les autres a la suite, dans l'ordre de l'arbre.
  $ordre = array_merge(array_values(array_filter($ordre, fn($n) => isset($fige[$n]))), array_values(array_filter($ordre, fn($n) => !isset($fige[$n]))));
  usort($ordre, function ($a, $b) use ($fige, $ordre) {
    $ia = $fige[$a] ?? INF; $ib = $fige[$b] ?? INF;
    return $ia === $ib ? array_search($a, $ordre, true) <=> array_search($b, $ordre, true) : $ia <=> $ib;
  });
  $nomDe = function (array $o) use ($parId, $appris, $typesDe): ?string {
    $c = $parId[$o['classe'] ?? ''] ?? null;
    if (!$c || !$appris($c)) return null;
    $types = $typesDe($c);
    if (!$types) return $c['id'];
    return in_array($o['type'] ?? null, $types, true) ? $o['type'] : '?' . $c['id'];
  };
  return [array_values(array_unique($ordre)), $nomDe, $chemins];
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

/**
 * Les architectures de depart proposees a l'export (demande du proprietaire, 12 novembre 2026) : YOLO26 par defaut, de bout en bout
 * (sans NMS), parti de COCO ; YOLOv10n pour repartir des poids du depot facade (depart.pt) ; YOLO11n-seg, le contour d'avant.
 * `export` : les arguments de l'export ONNX qui donnent la sortie que le banc lit (yolo.ts::modeDeSortie). Verifie avec Ultralytics
 * 8.4.211 le 12 novembre 2026 : un YOLO26 ne sort de bout en bout ([1, 300, 6], [1, 300, 38] en contours) qu'avec nms=False ; sans,
 * il sort brut ([1, 84, 8400]).
 */
const BANC_ARCHITECTURES = [
  'detect' => [
    'yolo26n' => ['poids' => 'yolo26n.pt', 'nom' => 'YOLO26n', 'export' => "format='onnx', imgsz=640, nms=False"],
    'yolov10n' => ['poids' => 'yolov10n.pt', 'nom' => 'YOLOv10n', 'export' => "format='onnx', imgsz=640, nms=False"],
  ],
  // RF-DETR (Roboflow, Apache 2.0, code et poids COCO : demande du proprietaire, 12 novembre 2026, pour sortir de l'AGPL d'Ultralytics).
  // Le jeu au format COCO (train/, valid/, test/ et leurs _annotations.coco.json), entraine par le paquet rfdetr ; `resolution` : le carre
  // d'entree du modele (verifie sur de vrais exports rfdetr 1.12.1, 12 novembre 2026 : input [1, 3, R, R], dets [1, 300, 4], labels [1, 300, C]).
  'rfdetr' => [
    'rf-detr-nano' => ['classe' => 'RFDETRNano', 'nom' => 'RF-DETR Nano', 'resolution' => 384],
    'rf-detr-small' => ['classe' => 'RFDETRSmall', 'nom' => 'RF-DETR Small', 'resolution' => 512],
    'rf-detr-medium' => ['classe' => 'RFDETRMedium', 'nom' => 'RF-DETR Medium', 'resolution' => 576],
  ],
  'seg' => [
    'yolo26n-seg' => ['poids' => 'yolo26n-seg.pt', 'nom' => 'YOLO26n-seg', 'export' => "format='onnx', imgsz=640, nms=False"],
    'yolo11n-seg' => ['poids' => 'yolo11n-seg.pt', 'nom' => 'YOLO11n-seg', 'export' => "format='onnx', imgsz=640"],
  ],
];

/**
 * Le depart d'un entrainement (demande du proprietaire, 12 novembre 2026) : « coco », les poids appris sur COCO (ou depart.pt pose a cote) ;
 * « zero », l'architecture seule (son .yaml), sans rien d'appris : plus d'epoques, et il faut plus de photos pour qu'il rattrape.
 */
const BANC_DEPARTS = ['coco', 'zero'];

/**
 * Fabrique l'archive du jeu dans un fichier temporaire et rend ou elle est, son nom et ce qu'elle contient. Deux appelants : le
 * telechargement de l'etape 6 (exporter) et le jeton d'entrainement, qui range l'archive sous lui pour que le script d'entrainement la lise.
 */
function export_fabriquer(string $format, bool $verifiees, string $base = '', string $depart = 'coco'): array {
  if (!in_array($format, ['detect', 'seg', 'rfdetr', 'natif'], true)) erreur(400, 'Format inconnu (detect, seg, rfdetr, natif).');
  $archi = null;
  if ($format !== 'natif') {
    $choix = BANC_ARCHITECTURES[$format];
    if ($base === '') $base = array_key_first($choix);
    if (!isset($choix[$base])) erreur(400, 'Architecture inconnue pour ' . $format . ' : ' . implode(', ', array_keys($choix)) . '.');
    if (!in_array($depart, BANC_DEPARTS, true)) erreur(400, 'Départ inconnu : coco ou zero.');
    $archi = $choix[$base] + ['id' => $base, 'depart' => $depart, 'yaml' => preg_replace('/\.pt$/', '.yaml', $choix[$base]['poids'] ?? '')];
  }
  if (!class_exists('ZipArchive')) erreur(501, 'L’extension zip de PHP manque sur cet hébergement.');
  [$classes, $nomDe, $chemins] = noms_yolo();
  $indice = array_flip($classes);
  $aQualifier = 0;
  $reglages = lire_json(dossier() . '/reglages.json', []);
  $tmp = tempnam(sys_get_temp_dir(), 'banc');
  $zip = new ZipArchive();
  if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) erreur(500, 'Archive impossible à créer.');
  $racine = 'banc-' . ($archi ? $archi['id'] . ($archi['depart'] === 'zero' ? '-zero' : '') : $format) . '-' . gmdate('Ymd-His');
  $compte = ['train' => 0, 'val' => 0, 'test' => 0];
  $parClasse = [];
  $natif = [];
  // Le jeu COCO de RF-DETR : un fichier d'annotations par bloc (val s'y appelle « valid »).
  $coco = ['train' => ['images' => [], 'annotations' => []], 'val' => ['images' => [], 'annotations' => []], 'test' => ['images' => [], 'annotations' => []]];
  $dossierCoco = ['train' => 'train', 'val' => 'valid', 'test' => 'test'];
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
    $numImage = count($coco[$bloc]['images']) + 1;
    foreach ($a['objets'] ?? [] as $o) {
      $nom = $nomDe($o);
      // Un objet d'une classe a types pas encore qualifie n'apprend rien : il est compte, a qualifier.
      if (is_string($nom) && $nom[0] === '?') { $aQualifier++; continue; }
      if ($nom === null || !isset($indice[$nom])) continue;
      if ($format === 'rfdetr') {
        $xs = array_map(fn($p) => max(0.0, min((float)$W, (float)$p['x'])), $o['points']);
        $ys = array_map(fn($p) => max(0.0, min((float)$H, (float)$p['y'])), $o['points']);
        $w = max($xs) - min($xs); $h = max($ys) - min($ys);
        if ($w <= 0 || $h <= 0) continue;
        $coco[$bloc]['annotations'][] = ['id' => count($coco[$bloc]['annotations']) + 1, 'image_id' => $numImage, 'category_id' => $indice[$nom],
          'bbox' => [round(min($xs), 2), round(min($ys), 2), round($w, 2), round($h, 2)], 'area' => round($w * $h, 2), 'iscrowd' => 0, 'segmentation' => []];
        $parClasse[$nom][$bloc] = ($parClasse[$nom][$bloc] ?? 0) + 1;
        continue;
      }
      $l = ligne_yolo($indice[$nom], $o, (int)$W, (int)$H, $format);
      if ($l !== null) { $lignes[] = $l; $parClasse[$nom][$bloc] = ($parClasse[$nom][$bloc] ?? 0) + 1; }
    }
    if ($format === 'rfdetr') {
      $zip->addFile("$d/$id/redressee.jpg", "$racine/{$dossierCoco[$bloc]}/$id.jpg");
      $coco[$bloc]['images'][] = ['id' => $numImage, 'file_name' => "$id.jpg", 'width' => (int)$W, 'height' => (int)$H];
      $compte[$bloc]++;
      continue;
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
    // L'arbre voyage avec le jeu : YOLO apprend des noms a plat, hierarchie.json dit ou chacun se range (regroupement, objet, type, detail).
    $zip->addFromString("$racine/hierarchie.json", json_encode(['noms' => array_map(fn($n, $k) => ['indice' => $k, 'nom' => $n, 'chemin' => $chemins[$n] ?? $n], $classes, array_keys($classes)), 'classes' => lire_json(dossier() . '/classes.json', ['classes' => []])['classes']], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    if ($format === 'rfdetr') {
      // Les categories dans l'ordre des indices du banc (0, 1, 2…) : RF-DETR les numerote dans l'ordre de leurs id.
      $categories = array_map(fn($n, $k) => ['id' => $k, 'name' => $n, 'supercategory' => 'none'], $classes, array_keys($classes));
      foreach ($coco as $b => $c) $zip->addFromString("$racine/{$dossierCoco[$b]}/_annotations.coco.json", json_encode(['info' => ['description' => "Banc d'apprentissage des facades", 'date_created' => gmdate('c')], 'images' => $c['images'], 'annotations' => $c['annotations'], 'categories' => $categories], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
      $zip->addFromString("$racine/noms.txt", implode("\n", array_map(fn($n, $k) => "$k: $n", $classes, array_keys($classes))) . "\n");
      $zip->addFromString("$racine/entrainer.py", script_rfdetr($archi));
    } else {
    $zip->addFromString("$racine/data.yaml", "# Jeu du banc d'apprentissage des facades, " . gmdate('c') . "\npath: .\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n$noms");
    $zip->addFromString("$racine/entrainer.py", script_entrainement($format, $archi));
    }
  }
  $zip->addFromString("$racine/bilan.json", json_encode(['format' => $format, 'architecture' => $archi['id'] ?? null, 'depart' => $archi['depart'] ?? null, 'verifieesSeulement' => $verifiees, 'images' => $compte, 'objetsParClasse' => $parClasse, 'aQualifier' => $aQualifier, 'classes' => $classes, 'le' => gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
  $zip->close();
  return ['fichier' => $tmp, 'racine' => $racine, 'format' => $format, 'archi' => $archi, 'images' => $compte, 'classes' => $classes, 'verifiees' => $verifiees];
}

function exporter(string $format, bool $verifiees, string $base = '', string $depart = 'coco'): void {
  $x = export_fabriquer($format, $verifiees, $base, $depart);
  header('Content-Type: application/zip');
  header('Content-Disposition: attachment; filename="' . $x['racine'] . '.zip"');
  header('Content-Length: ' . filesize($x['fichier']));
  readfile($x['fichier']);
  @unlink($x['fichier']);
  exit;
}

/** Le script d'entrainement livre avec le jeu : le meme protocole que le depot facade (graine fixe), puis l'export ONNX. */
function script_entrainement(string $format, array $a): string {
  $poids = $a['poids'];
  if ($a['depart'] === 'zero') return "# Entrainement du banc d'apprentissage des facades ({$a['nom']}, $format, sans COCO : de zero), Ultralytics 8.4.\n"
    . "#   pip install ultralytics==8.4.*\n#   python3 entrainer.py [cpu|mps|0]\n"
    . "# L'architecture seule ({$a['yaml']}), sans aucun poids appris : rien de COCO, rien du depot facade. Il faut plus d'epoques et plus\n"
    . "# de photos qu'avec COCO ; a comparer au meme jeu parti de COCO (mAP du bloc test, affiche a la fin).\n"
    . "# Le modele .onnx produit se depose dans le banc (etape 3, Modeles), avec la liste de ses classes (data.yaml).\n"
    . "import sys\nfrom ultralytics import YOLO\n\ndevice = sys.argv[1] if len(sys.argv) > 1 else 'cpu'\n"
    . "m = YOLO('{$a['yaml']}')\n"
    . "m.train(data='data.yaml', pretrained=False, epochs=300, patience=60, imgsz=640, batch=8, device=device, workers=2, project='runs', name='banc', exist_ok=True, plots=False, amp=False, seed=20261110, deterministic=True)\n"
    . "m.val(data='data.yaml', split='test')\n"
    . "m.export({$a['export']})\n";
  return "# Entrainement du banc d'apprentissage des facades ({$a['nom']}, $format, parti de COCO), Ultralytics 8.4.\n"
    . "#   pip install ultralytics==8.4.*\n#   python3 entrainer.py [cpu|mps|0]\n"
    . "# Poids de depart : depart.pt pose a cote de ce script s'il y en a un, sinon $poids (COCO). depart.pt doit etre de la meme\n"
    . "# architecture : un modele du depot facade (YOLOv10n) pour un export YOLOv10n, ou un modele du banc deja entraine. Ultralytics garde\n"
    . "# ce qui sert (le tronc) et refait la tete aux noms du jeu.\n"
    . "# Le modele .onnx produit se depose dans le banc (etape 3, Modeles), avec la liste de ses classes (data.yaml).\n"
    . "import os, sys\nfrom ultralytics import YOLO\n\ndevice = sys.argv[1] if len(sys.argv) > 1 else 'cpu'\n"
    . "m = YOLO('depart.pt' if os.path.exists('depart.pt') else '$poids')\n"
    . "m.train(data='data.yaml', epochs=100, patience=25, imgsz=640, batch=8, device=device, workers=2, project='runs', name='banc', exist_ok=True, plots=False, amp=False, seed=20261110, deterministic=True)\n"
    . "m.val(data='data.yaml', split='test')\n"
    . "m.export({$a['export']})\n";
}

/**
 * L'entrainement RF-DETR (Apache 2.0) livre avec le jeu COCO : avec COCO (les poids publies par Roboflow, Apache 2.0) ou sans (de zero),
 * arret quand la validation ne progresse plus, mesure sur le test, puis l'export ONNX (input [1, 3, R, R], dets, labels) a deposer dans
 * le banc (etape 3) avec noms.txt.
 */
function script_rfdetr(array $a): string {
  $creer = $a['depart'] === 'zero' ? "{$a['classe']}(pretrain_weights=None)" : "{$a['classe']}()";
  return "# Entrainement du banc d'apprentissage des facades : {$a['nom']} (Roboflow, licence Apache 2.0, code et poids), "
    . ($a['depart'] === 'zero' ? 'sans COCO (de zero)' : 'parti de COCO') . ".\n"
    . "#   pip install 'rfdetr[train,loggers]==1.12.*'\n#   python3 entrainer.py [cpu|mps|cuda]\n"
    . "# Le jeu est au format COCO (train/, valid/, test/ et leurs _annotations.coco.json) ; les noms, dans l'ordre des indices, sont dans noms.txt.\n"
    . "# Le modele .onnx produit (sortie/inference_model.onnx) se depose dans le banc (etape 3), avec noms.txt et la resolution {$a['resolution']}.\n"
    . "import glob, os, shutil, sys\nfrom rfdetr import {$a['classe']}\n\n"
    . "options = {'device': sys.argv[1]} if len(sys.argv) > 1 else {}\n"
    . "m = $creer\n"
    . "m.train(dataset_dir='.', output_dir='sortie', epochs=" . ($a['depart'] === 'zero' ? 300 : 100) . ", batch_size=4, grad_accum_steps=4, early_stopping=True, early_stopping_patience=" . ($a['depart'] === 'zero' ? 40 : 15) . ", run_test=True, log_per_class_metrics=True, tensorboard=False, **options)\n"
    . "best = {$a['classe']}(pretrain_weights='sortie/checkpoint_best_total.pth')\n"
    . "# Deux fichiers : modele-banc.onnx, quantifie int8 (environ 37 Mo pour Nano, etalonne sur les photos de train/ ; a deposer d'abord),\n"
    . "# et modele-banc-fp32.onnx, en pleine precision (environ 118 Mo).\n"
    . "best.export(output_dir='sortie', quantization='int8', calibration_data='train')\n"
    . "shutil.copy(next(f for f in glob.glob('sortie/*.onnx') if f.endswith('_int8.onnx')), 'modele-banc.onnx')\n"
    . "shutil.copy(next(f for f in glob.glob('sortie/*.onnx') if not f.endswith('_int8.onnx')), 'modele-banc-fp32.onnx')\n"
    . "print('Modele :', os.path.abspath('modele-banc.onnx'))\nprint(open('noms.txt').read())\n";
}

// ---------------------------------------------------------------------------------------------------------------------
// Le relais des images Panoramax (demande du proprietaire, 15 novembre 2026 : toute instance federee marche d'office, sans ajouter
// son hote a la politique de contenu par une version). La page lit en direct les hotes qu'elle connait ; pour les autres, elle
// demande ici « la photo <identifiant>, en <taille> ». Jamais une adresse : le serveur demande lui-meme la photo au meta-catalogue
// et suit l'adresse de l'image qu'il rend. Ce que le relais ouvre : la lecture, par une session connectee, d'une image publique du
// catalogue Panoramax. Ce qu'il n'ouvre pas : une adresse au choix de l'appelant, un hote prive ou local, autre chose qu'une image.

const BANC_RELAIS_CATALOGUE = 'https://api.panoramax.xyz/api/search';
const BANC_UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';
/**
 * Par taille demandee : l'image du catalogue, sa taille maximale et le delai de lecture. Mesure sur 603 photos du vrai reseau (Le
 * Vesinet, rue de Rivoli, Loiret, 15 novembre 2026) : un 360 en « hd » pese de 0,8 a 6,9 Mo ; la borne est a 25 Mo.
 */
const BANC_RELAIS_TAILLES = [
  'hd' => ['asset' => 'hd', 'max' => 25 * 1024 * 1024, 'delai' => 30],
  'sd' => ['asset' => 'sd', 'max' => 4 * 1024 * 1024, 'delai' => 12],
  'vignette' => ['asset' => 'thumb', 'max' => 1024 * 1024, 'delai' => 8],
];
const BANC_RELAIS_REDIRECTIONS = 3;
/** Les images relayees par session et par minute : de quoi faire defiler une liste, pas de quoi aspirer une instance. */
const BANC_RELAIS_PAR_MINUTE = 180;

/** Un refus du relais : le code HTTP rendu a la page et la raison, dite en clair. */
class RelaisRefus extends RuntimeException {}

/** Une adresse IPv4 publique : ni privee, ni locale, ni lien-local, ni reservee (dont 100.64/10 et 0/8, que PHP ne classe pas). */
function relais_ip_publique(string $ip): bool {
  if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) return false;
  $n = ip2long($ip);
  foreach ([['0.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 3]] as [$base, $bits]) {
    if ((($n ^ ip2long($base)) >> (32 - $bits)) === 0) return false;
  }
  return true;
}

/** Les adresses IPv4 d'un hote (le relais ne sort qu'en IPv4 : une seule famille d'adresses a verifier). */
function relais_resoudre(string $hote): array {
  $l = @gethostbynamel($hote);
  return is_array($l) ? $l : [];
}

/**
 * Ou une adresse mene : son hote et l'adresse IP ou l'on se connectera. Refuse tout ce qui n'est pas « https://nom-d-hote/… » sur le
 * port 443, sans identifiants, et tout hote dont une seule des adresses est privee, locale ou lien-local. L'adresse rendue est celle
 * qui sera utilisee (CURLOPT_RESOLVE) : l'hote ne peut pas en changer entre la verification et la connexion.
 */
function relais_destination(string $url, callable $resoudre): array {
  $u = parse_url($url);
  if (!is_array($u) || strtolower((string)($u['scheme'] ?? '')) !== 'https') throw new RelaisRefus('adresse refusée (https seulement)', 502);
  if (isset($u['user']) || isset($u['pass'])) throw new RelaisRefus('adresse refusée (identifiants)', 502);
  if (isset($u['port']) && (int)$u['port'] !== 443) throw new RelaisRefus('adresse refusée (port)', 502);
  $hote = strtolower((string)($u['host'] ?? ''));
  // Un nom d'hote, pas une adresse ecrite en chiffres (ni IPv6 entre crochets, ni entier, ni hexadecimal).
  if (!preg_match('/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $hote)) throw new RelaisRefus('adresse refusée (hôte)', 502);
  $ips = $resoudre($hote);
  if (!$ips) throw new RelaisRefus('hôte introuvable : ' . $hote, 502);
  foreach ($ips as $ip) if (!relais_ip_publique((string)$ip)) throw new RelaisRefus('hôte refusé (adresse privée ou locale) : ' . $hote, 502);
  return ['hote' => $hote, 'ip' => (string)$ips[0]];
}

/**
 * Une requete, sans suivre aucune redirection, vers l'adresse IP verifiee. Rend le code, les en-tetes (en minuscules) et le corps ;
 * `trop` quand le corps depasse `$max` (la lecture s'arrete la). `$httpsSeul` ne se desactive que dans les tests de cette fonction.
 */
function relais_demander(string $url, string $hote, string $ip, int $max, int $delai, bool $httpsSeul = true): array {
  if (!function_exists('curl_init')) throw new RelaisRefus('le serveur n’a pas cURL', 501);
  $corps = ''; $trop = false; $entetes = [];
  $port = parse_url($url, PHP_URL_PORT) ?: ($httpsSeul || parse_url($url, PHP_URL_SCHEME) === 'https' ? 443 : 80);
  $c = curl_init($url);
  curl_setopt_array($c, [
    CURLOPT_PROTOCOLS => $httpsSeul ? CURLPROTO_HTTPS : CURLPROTO_HTTPS | CURLPROTO_HTTP,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_RESOLVE => ["$hote:$port:$ip"],
    CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => $delai,
    CURLOPT_USERAGENT => 'banc-apprentissage (relais)',
    CURLOPT_HTTPHEADER => ['Accept: image/jpeg, image/png, image/webp, application/json;q=0.9, application/geo+json;q=0.9'],
    CURLOPT_HEADERFUNCTION => function ($c, string $ligne) use (&$entetes, &$trop, $max): int {
      $p = strpos($ligne, ':');
      if ($p !== false) $entetes[strtolower(trim(substr($ligne, 0, $p)))] = trim(substr($ligne, $p + 1));
      // Une taille annoncee au-dessus de la borne : on n'en lit pas un octet.
      if ((int)($entetes['content-length'] ?? 0) > $max) { $trop = true; return -1; }
      return strlen($ligne);
    },
    CURLOPT_WRITEFUNCTION => function ($c, string $morceau) use (&$corps, &$trop, $max): int {
      if (strlen($corps) + strlen($morceau) > $max) { $trop = true; return -1; }
      $corps .= $morceau;
      return strlen($morceau);
    },
  ]);
  curl_exec($c);
  $code = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
  $erreur = curl_errno($c);
  curl_close($c);
  if ($erreur !== 0 && !$trop) throw new RelaisRefus($erreur === CURLE_OPERATION_TIMEDOUT ? 'l’hôte ' . $hote . ' ne répond pas à temps' : 'l’hôte ' . $hote . ' est injoignable', 504);
  return ['code' => $code, 'entetes' => $entetes, 'corps' => $corps, 'trop' => $trop];
}

/** Resout une redirection relative par rapport a l'adresse qui l'a rendue. */
function relais_absolue(string $base, string $vers): string {
  if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $vers)) return $vers;
  $u = parse_url($base);
  $racine = ($u['scheme'] ?? 'https') . '://' . ($u['host'] ?? '') . (isset($u['port']) ? ':' . $u['port'] : '');
  if (str_starts_with($vers, '//')) return ($u['scheme'] ?? 'https') . ':' . $vers;
  if (str_starts_with($vers, '/')) return $racine . $vers;
  return $racine . preg_replace('#[^/]*$#', '', (string)($u['path'] ?? '/')) . $vers;
}

/**
 * Lit une adresse en suivant ses redirections a la main : BANC_RELAIS_REDIRECTIONS au plus, chacune reverifiee comme la premiere
 * adresse (https, hote public). Une redirection vers 127.0.0.1 ou un hote prive s'arrete ici, avant toute connexion.
 */
function relais_lire(string $url, int $max, int $delai, callable $resoudre, callable $demander): array {
  for ($saut = 0; $saut <= BANC_RELAIS_REDIRECTIONS; $saut++) {
    $d = relais_destination($url, $resoudre);
    $r = $demander($url, $d['hote'], $d['ip'], $max, $delai);
    if ($r['trop']) throw new RelaisRefus('réponse trop grosse (plus de ' . round($max / 1048576, 1) . ' Mo)', 502);
    if (in_array($r['code'], [301, 302, 303, 307, 308], true)) {
      $vers = (string)($r['entetes']['location'] ?? '');
      if ($vers === '') throw new RelaisRefus('redirection sans adresse', 502);
      $url = relais_absolue($url, $vers);
      continue;
    }
    if ($r['code'] === 404) throw new RelaisRefus('photo introuvable', 404);
    if ($r['code'] !== 200) throw new RelaisRefus('l’hôte ' . $d['hote'] . ' a répondu ' . $r['code'], 502);
    return $r;
  }
  throw new RelaisRefus('trop de redirections', 502);
}

/** Le type d'une image d'apres ses premiers octets (JPEG, PNG, WebP) ; null pour tout le reste. */
function relais_type(string $octets): ?string {
  if (strncmp($octets, "\xFF\xD8\xFF", 3) === 0) return 'image/jpeg';
  if (strncmp($octets, "\x89PNG\r\n\x1a\n", 8) === 0) return 'image/png';
  if (strlen($octets) >= 12 && substr($octets, 0, 4) === 'RIFF' && substr($octets, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * L'image d'une photo du catalogue : la photo est demandee au meta-catalogue par son identifiant, puis l'adresse de l'image qu'il
 * rend est suivie. Il faut une image deux fois : l'en-tete Content-Type le dit, et ses premiers octets le confirment (le type rendu a
 * la page est celui des octets, pas celui de l'en-tete).
 */
function relais_image(string $id, string $taille, callable $resoudre, callable $demander): array {
  if (!preg_match(BANC_UUID, $id)) throw new RelaisRefus('identifiant de photo invalide', 400);
  $t = BANC_RELAIS_TAILLES[$taille] ?? null;
  if (!$t) throw new RelaisRefus('taille inconnue (hd, sd ou vignette)', 400);
  $catalogue = relais_lire(BANC_RELAIS_CATALOGUE . '?ids=' . $id, 2 * 1024 * 1024, 8, $resoudre, $demander);
  $json = json_decode($catalogue['corps'], true);
  $photo = null;
  foreach ((is_array($json) ? ($json['features'] ?? []) : []) as $f) if (is_array($f) && ($f['id'] ?? null) === $id) $photo = $f;
  if (!$photo) throw new RelaisRefus('photo inconnue du catalogue Panoramax', 404);
  $href = $photo['assets'][$t['asset']]['href'] ?? null;
  if (!is_string($href) || $href === '') throw new RelaisRefus('le catalogue ne donne pas cette taille pour cette photo', 404);
  $r = relais_lire($href, $t['max'], $t['delai'], $resoudre, $demander);
  $annonce = strtolower(trim(explode(';', (string)($r['entetes']['content-type'] ?? ''))[0]));
  $type = relais_type($r['corps']);
  if (!in_array($annonce, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'], true) || $type === null) throw new RelaisRefus('ce que l’hôte a rendu n’est pas une image', 502);
  return ['type' => $type, 'octets' => $r['corps']];
}

/** Compte les images relayees par cette session dans la minute ; au-dela de BANC_RELAIS_PAR_MINUTE, 429. La session doit etre ouverte. */
function relais_compter(): void {
  $now = time();
  $l = array_values(array_filter((array)($_SESSION['relais'] ?? []), fn($s) => is_int($s) && $now - $s < 60));
  if (count($l) >= BANC_RELAIS_PAR_MINUTE) erreur(429, 'Trop d’images demandées au relais en une minute : attendez un instant.');
  $l[] = $now;
  $_SESSION['relais'] = $l;
}

/** La route : l'image, avec des en-tetes qui n'en font rien d'autre qu'une image pour la page du banc. */
function relais_servir(string $id, string $taille): void {
  try {
    $img = relais_image($id, $taille, 'relais_resoudre', 'relais_demander');
  } catch (RelaisRefus $e) {
    erreur($e->getCode() ?: 502, 'Relais Panoramax : ' . $e->getMessage() . '.');
  }
  header('Content-Type: ' . $img['type']);
  header('Content-Length: ' . strlen($img['octets']));
  header('X-Content-Type-Options: nosniff');
  header("Content-Security-Policy: default-src 'none'; sandbox");
  header('Content-Disposition: inline; filename="panoramax-' . $id . '-' . $taille . '.' . substr($img['type'], 6) . '"');
  header('Cross-Origin-Resource-Policy: same-origin');
  // Garde par le navigateur seul (une heure) : le serveur n'ecrit aucune image relayee sur son disque. La session de PHP pose
  // « Pragma: no-cache » et une date d'expiration passee, qui l'empecheraient.
  header_remove('Pragma');
  header_remove('Expires');
  header('Cache-Control: private, max-age=3600');
  echo $img['octets'];
  exit;
}

// ---------------------------------------------------------------------------------------------------------------------
// Les jetons d'entrainement (demande du proprietaire, 20 novembre 2026 : moins de gestes entre l'export et le depot du modele ; 21
// novembre : l'entrainement se fait sur son Mac). L'etape 6 cree un jeton et telecharge un script qui le porte, a lancer dans le
// Terminal ; le script lit lui-meme le jeu ici, entraine sur le Mac, puis depose lui-meme le modele ici.
// Ce que le jeton ouvre, sans session : lire le jeu de SON export (une archive figee a sa creation, rangee sous lui) et deposer UN
// modele. Ce qu'il n'ouvre pas : tout le reste de l'API (aucune autre route ne le lit), une photo hors de cette archive, une seconde
// ecriture. Il est tire au hasard (32 octets), garde hache (jamais en clair, jamais journalise), vit 24 h, se revoque depuis l'ecran.

/** « bj_<identifiant public, 16 chiffres hexa>_<secret, 64 chiffres hexa> » : l'identifiant trouve le fichier, le secret se compare hache. */
const BANC_JETON = '/^bj_([0-9a-f]{16})_([0-9a-f]{64})$/';
const BANC_JETON_ID = '/^[0-9a-f]{16}$/';
/** Les cles vivantes a la fois : chacune garde une copie du jeu sur le disque. */
const BANC_JETON_VIVANTS = 5;
/** Les essais manques par adresse en quinze minutes, et les lectures du jeu par jeton (un script relance, pas une aspiration). */
const BANC_JETON_ESSAIS = 20;
const BANC_JETON_LECTURES = 20;
/**
 * Le modele depose : 128 Mo au plus (un RF-DETR Nano quantifie pese 37 Mo, sa pleine precision 118 Mo ; un YOLO26n une dizaine),
 * 4 Ko au moins, en 2 000 morceaux envoyes au plus (reprises comprises).
 */
const BANC_JETON_MODELE_MAX = 128 * 1024 * 1024;
const BANC_JETON_MODELE_MIN = 4096;
const BANC_JETON_ENVOIS = 2000;
/** Un nom appris : le meme jeu de caracteres que les identifiants de l'arbre (classes_ecrire). */
const BANC_NOM_APPRIS = '/^[a-z][a-z0-9_-]{0,39}$/';
const BANC_NOMS_MAX = 200;
/** Ce que chaque architecture de l'export donne a l'etape 3 : le format du modele et le cote de son entree. */
const BANC_JETON_MODELES = [
  'rf-detr-nano' => ['rf-detr', 384], 'rf-detr-small' => ['rf-detr', 512], 'rf-detr-medium' => ['rf-detr', 576],
  'yolo26n' => ['yolo26', 640], 'yolov10n' => ['yolov10', 640], 'yolo26n-seg' => ['yolo26-seg', 640], 'yolo11n-seg' => ['yolov8-seg', 640],
];
/** Les champs d'un fichier ONNX (onnx.proto : ModelProto, GraphProto) et leur type de fil (0 : entier, 2 : longueur puis octets). */
const BANC_ONNX_MODELE = [1 => 0, 2 => 2, 3 => 2, 4 => 2, 5 => 0, 6 => 2, 7 => 2, 8 => 2, 14 => 2, 20 => 2, 25 => 2, 26 => 2];
const BANC_ONNX_GRAPHE = [1 => 2, 2 => 2, 5 => 2, 10 => 2, 11 => 2, 12 => 2, 13 => 2, 14 => 2, 15 => 2, 16 => 2];

/** La duree d'un jeton, en secondes : 24 h, ou « jetonHeures » de banc-config.php (de 1 a 72). */
function jeton_duree(): int { return 3600 * max(1, min(72, (int)(banc_config()['jetonHeures'] ?? 24))); }

function jeton_fichiers(string $id): array {
  $d = dossier('jetons');
  return ['json' => "$d/$id.json", 'zip' => "$d/$id.zip", 'partie' => "$d/$id.partie", 'verrou' => "$d/$id.verrou"];
}

function jeton_effacer(string $id): void { foreach (jeton_fichiers($id) as $f) @unlink($f); }

/** Les jetons vivants ; un jeton echu est efface au passage, avec le jeu et le depot en cours ranges sous lui. */
function jetons_vivants(): array {
  $l = [];
  foreach (scandir(dossier('jetons')) ?: [] as $f) {
    if (!preg_match('/^([0-9a-f]{16})\.json$/', $f, $m)) continue;
    $j = lire_json(dossier('jetons') . "/$f", null);
    if (!is_array($j) || (int)($j['expire'] ?? 0) <= time()) { jeton_effacer($m[1]); continue; }
    $l[] = $j;
  }
  usort($l, fn($a, $b) => strcmp((string)$b['creeLe'], (string)$a['creeLe']));
  return $l;
}

/** Ce que l'ecran voit d'un jeton : jamais son hache, ni rien qui aide a le refaire. */
function jeton_public(array $j): array {
  return ['id' => $j['id'], 'creeLe' => $j['creeLe'], 'expireLe' => gmdate('c', (int)$j['expire']), 'architecture' => $j['architecture'], 'jeu' => $j['jeu'],
    'lectures' => (int)($j['lectures'] ?? 0), 'luLe' => $j['luLe'] ?? null, 'depose' => $j['depose'] ?? null];
}

/** Les cles vivantes, et la duree d'une cle neuve (l'ecran la dit avant d'en creer une). */
function jetons_lister(): void { repondre(200, ['heures' => intdiv(jeton_duree(), 3600), 'jetons' => array_map('jeton_public', jetons_vivants())]); }

/** Une limite de PHP (« 8M », « 512K », « 0 ») en octets ; 0 : sans limite. */
function octets_ini(string $v): int {
  $v = trim($v);
  return (int)((float)$v * (['K' => 1024, 'M' => 1048576, 'G' => 1073741824][strtoupper(substr($v, -1))] ?? 1));
}

/** La taille des morceaux que le script enverra : 4 Mo, moins si post_max_size de cet hebergement est plus bas (64 Ko de marge). */
function jeton_morceau(): int {
  $max = octets_ini((string)ini_get('post_max_size'));
  return $max > 0 ? max(65536, min(4 * 1048576, $max - 65536)) : 4 * 1048576;
}

/**
 * Cree un jeton pour un export : fige le jeu dans une archive rangee sous lui, et rend le script qui le porte. Le jeton en clair ne
 * sort qu'ici, dans le script ; le serveur n'en garde que le hache.
 */
function jeton_creer(): void {
  $b = corps_json();
  $format = (string)($b['format'] ?? '');
  if (!in_array($format, ['rfdetr', 'detect', 'seg'], true)) erreur(400, 'Un entraînement demande un format RF-DETR ou YOLO (pas le format du banc).');
  // L'adresse du banc, ecrite dans le script : celle par laquelle la page appelle deja cette API. En https, sauf sur le poste local.
  $adresse = (string)($b['adresse'] ?? '');
  if (strlen($adresse) > 300 || !preg_match('#^(https?)://([A-Za-z0-9.-]{1,253})(:[0-9]{1,5})?(/[A-Za-z0-9._~-]+)*/api\.php$#', $adresse, $m)) erreur(400, 'Adresse du banc invalide.');
  if ($m[1] !== 'https' && !in_array($m[2], ['localhost', '127.0.0.1'], true)) erreur(400, 'Le banc doit être servi en https pour qu’un script d’entraînement lui parle.');
  // Ou vont les noms du jeu dans l'arbre, calcule par la page comme pour un modele depose a la main (correspondanceParDefaut).
  $correspondance = [];
  foreach ((array)($b['correspondance'] ?? []) as $nom => $cible) {
    if (count($correspondance) >= BANC_NOMS_MAX) break;
    if (is_string($nom) && preg_match(BANC_NOM_APPRIS, $nom) && is_string($cible) && preg_match('/^([a-z][a-z0-9_-]{0,39}(:[a-z][a-z0-9_-]{0,39})?)?$/', $cible)) $correspondance[$nom] = $cible;
  }
  $vivants = jetons_vivants();
  if (count(array_filter($vivants, fn($j) => empty($j['depose']))) >= BANC_JETON_VIVANTS) erreur(429, 'Déjà ' . BANC_JETON_VIVANTS . ' clés d’entraînement en cours : révoquez-en une.');
  $x = export_fabriquer($format, ($b['verifiees'] ?? false) === true, (string)($b['base'] ?? ''), (string)($b['depart'] ?? 'coco'));
  if (array_sum($x['images']) === 0 || !$x['images']['train']) { @unlink($x['fichier']); erreur(400, 'Le jeu est vide : il faut au moins une photo corrigée dans le bloc train.'); }
  $id = bin2hex(random_bytes(8));
  $secret = bin2hex(random_bytes(32));
  $f = jeton_fichiers($id);
  if (!@rename($x['fichier'], $f['zip']) && !(@copy($x['fichier'], $f['zip']) && @unlink($x['fichier']))) { @unlink($x['fichier']); erreur(500, 'Le jeu n’a pas pu être rangé.'); }
  [$formatModele, $resolution] = BANC_JETON_MODELES[$x['archi']['id']];
  $j = ['id' => $id, 'hache' => hash('sha256', $secret), 'creeLe' => gmdate('c'), 'expire' => time() + jeton_duree(),
    'architecture' => ['id' => $x['archi']['id'], 'nom' => $x['archi']['nom'], 'depart' => $x['archi']['depart'], 'format' => $formatModele, 'resolution' => $resolution],
    'jeu' => ['racine' => $x['racine'], 'le' => gmdate('c'), 'images' => $x['images'], 'verifieesSeulement' => $x['verifiees'], 'octets' => filesize($f['zip']), 'classes' => count($x['classes'])],
    'correspondance' => $correspondance, 'lectures' => 0, 'envois' => 0, 'parties' => 0, 'depose' => null];
  ecrire_json($f['json'], $j);
  $fichier = 'entrainer-banc-' . $j['architecture']['id'] . ($j['architecture']['depart'] === 'zero' ? '-zero' : '') . '-' . gmdate('Ymd-His') . '.sh';
  repondre(201, ['jeton' => jeton_public($j), 'fichier' => $fichier, 'script' => script_jeton($format, $j, $adresse, "bj_{$id}_{$secret}", jeton_morceau(), $fichier)]);
}

function jeton_revoquer(?string $id): void {
  if ($id === null || !preg_match(BANC_JETON_ID, $id)) erreur(400, 'Identifiant invalide.');
  jeton_effacer($id);
  repondre(200, ['revoque' => $id]);
}

/**
 * Le jeton que l'appelant presente (en-tete X-Banc-Jeton : ni dans l'adresse, que les journaux gardent, ni en Authorization, que
 * certains hebergements mutualises ne transmettent pas). Un seul refus pour tout : inconnu, faux, echu ou revoque se disent pareil, et
 * le hache se compare a temps constant, contre un hache factice quand le fichier n'existe pas.
 */
function jeton_presente(): array {
  $ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnue';
  if (essais($ip, null, 'essais-jetons.json') >= BANC_JETON_ESSAIS) erreur(429, 'Trop d’essais : réessayez dans quinze minutes.');
  $j = null; $hache = str_repeat('0', 64); $secret = '';
  if (preg_match(BANC_JETON, (string)($_SERVER['HTTP_X_BANC_JETON'] ?? ''), $m)) {
    $secret = $m[2];
    $lu = lire_json(jeton_fichiers($m[1])['json'], null);
    if (is_array($lu) && is_string($lu['hache'] ?? null) && strlen($lu['hache']) === 64) { $j = $lu; $hache = $lu['hache']; }
  }
  $juste = hash_equals($hache, hash('sha256', $secret));
  // Un jeton echu presente par son script s'efface ici, avec son jeu : il n'attend pas que quelqu'un rouvre l'etape 6.
  if ($juste && $j && (int)($j['expire'] ?? 0) <= time()) { jeton_effacer($j['id']); $j = null; }
  if (!$juste || !$j) { essais($ip, true, 'essais-jetons.json'); erreur(401, 'Jeton refusé.'); }
  return $j;
}

/**
 * Change un jeton sous verrou : deux requetes du meme script ne se marchent pas dessus. `$f` recoit le jeton relu et le rend change ;
 * un jeton revoque entre-temps se refuse comme un jeton inconnu.
 */
function jeton_changer(string $id, callable $f) {
  $fichiers = jeton_fichiers($id);
  $v = fopen($fichiers['verrou'], 'c');
  if (!$v || !flock($v, LOCK_EX)) erreur(503, 'Le banc est occupé : réessayez.');
  $j = lire_json($fichiers['json'], null);
  if (!is_array($j)) { @unlink($fichiers['verrou']); erreur(401, 'Jeton refusé.'); }
  $rendu = $f($j, $fichiers);
  ecrire_json($fichiers['json'], $j);
  flock($v, LOCK_UN);
  fclose($v);
  return $rendu;
}

/**
 * Ou en est ce jeton, pour le script qui le porte : ce qu'il lui reste a vivre, son jeu, s'il a deja depose. Rien qu'il ne sache
 * deja, et aucune lecture comptee : de quoi refuser une cle echue avant des heures d'entrainement, pas apres.
 */
function entrainement_etat(array $j): void {
  repondre(200, ['reste' => max(0, (int)$j['expire'] - time()), 'expireLe' => gmdate('c', (int)$j['expire']), 'architecture' => $j['architecture']['id'],
    'jeu' => ['racine' => $j['jeu']['racine'], 'images' => $j['jeu']['images']], 'depose' => !empty($j['depose'])]);
}

/** Le jeu de l'export de ce jeton : l'archive figee a sa creation, et rien d'autre. */
function entrainement_jeu(array $j): void {
  if (!empty($j['depose'])) erreur(409, 'Ce jeton a déjà déposé son modèle : il ne sert plus.');
  $zip = jeton_changer($j['id'], function (array &$j, array $f) {
    if ((int)($j['lectures'] ?? 0) >= BANC_JETON_LECTURES) erreur(429, 'Ce jeu a été lu trop de fois avec ce jeton : créez-en un autre.');
    if (!is_file($f['zip'])) erreur(410, 'Le jeu de ce jeton n’est plus là : créez-en un autre.');
    $j['lectures'] = (int)($j['lectures'] ?? 0) + 1;
    $j['luLe'] = gmdate('c');
    return $f['zip'];
  });
  header('Content-Type: application/zip');
  header('Content-Disposition: attachment; filename="' . $j['jeu']['racine'] . '.zip"');
  header('Content-Length: ' . filesize($zip));
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: no-store');
  readfile($zip);
  exit;
}

/**
 * Un morceau du modele, dans l'ordre : le n° 0 recommence le depot, le suivant doit etre celui qu'on attend. Les octets vont dans un
 * fichier range sous le jeton (hors de public_html), jamais a un nom donne par l'appelant, et jamais plus que la borne.
 */
function entrainement_morceau(array $j, string $n): void {
  if (!preg_match('/^[0-9]{1,4}$/', $n)) erreur(400, 'Numéro de morceau invalide.');
  $n = (int)$n;
  $recu = jeton_changer($j['id'], function (array &$j, array $f) use ($n) {
    if (!empty($j['depose'])) erreur(409, 'Ce jeton a déjà déposé son modèle : il ne dépose plus.');
    if ((int)($j['envois'] ?? 0) >= BANC_JETON_ENVOIS) erreur(429, 'Trop d’envois avec ce jeton : créez-en un autre.');
    $j['envois'] = (int)($j['envois'] ?? 0) + 1;
    ecrire_json($f['json'], $j);
    if ($n !== 0 && $n !== (int)($j['parties'] ?? 0)) erreur(409, 'Morceau inattendu : le suivant est le n° ' . (int)($j['parties'] ?? 0) . ' (ou le n° 0 pour recommencer).');
    $deja = $n === 0 ? 0 : (int)filesize($f['partie']);
    $entree = fopen('php://input', 'rb');
    $sortie = fopen($f['partie'], $n === 0 ? 'wb' : 'ab');
    if (!$entree || !$sortie) erreur(500, 'Enregistrement impossible.');
    // Un octet de plus que ce qui reste : de quoi voir le depassement sans l'ecrire en entier.
    $ecrit = (int)stream_copy_to_stream($entree, $sortie, BANC_JETON_MODELE_MAX - $deja + 1);
    fclose($sortie);
    if ($deja + $ecrit > BANC_JETON_MODELE_MAX) { @unlink($f['partie']); $j['parties'] = 0; ecrire_json($f['json'], $j); erreur(413, 'Modèle trop lourd : ' . round(BANC_JETON_MODELE_MAX / 1048576) . ' Mo au plus.'); }
    if ($ecrit === 0) erreur(400, 'Morceau vide (ou plus gros que la limite post_max_size de PHP, ' . ini_get('post_max_size') . ').');
    // Un fichier ONNX commence par le champ 1 de ModelProto (ir_version) : tout autre debut s'arrete ici, sans attendre la fin.
    if ($n === 0 && file_get_contents($f['partie'], false, null, 0, 1) !== "\x08") { @unlink($f['partie']); $j['parties'] = 0; ecrire_json($f['json'], $j); erreur(415, 'Ce fichier n’est pas un modèle ONNX.'); }
    $j['parties'] = $n + 1;
    return $deja + $ecrit;
  });
  repondre(200, ['partie' => $n, 'octets' => $recu]);
}

/** Lit un entier protobuf (varint) dans `$o` a partir de `$p` (avance `$p`) ; null s'il deborde ou depasse dix octets. */
function proto_entier(string $o, int &$p): ?int {
  $v = 0;
  for ($k = 0; $k < 10; $k++) {
    if ($p >= strlen($o)) return null;
    $c = ord($o[$p++]);
    if ($k < 9) $v |= ($c & 0x7F) << (7 * $k);
    if (!($c & 0x80)) return $k === 9 && $c > 1 ? null : $v;
  }
  return null;
}

/**
 * Les champs d'un message protobuf range dans un fichier, de `$debut` a `$fin` : [numero, type de fil, valeur ou debut du contenu,
 * longueur]. Le contenu d'un champ a longueur n'est pas lu (on saute par-dessus). Null si ce n'est pas un message bien forme qui
 * finit exactement a `$fin`, ou s'il a plus de `$max` champs.
 */
function proto_champs($h, int $debut, int $fin, int $max): ?array {
  $l = [];
  for ($p = $debut; $p < $fin;) {
    if (count($l) >= $max) return null;
    fseek($h, $p);
    $o = (string)fread($h, min(20, $fin - $p));
    $q = 0;
    $cle = proto_entier($o, $q);
    if ($cle === null || $cle < 8 || $cle > 0x7FFFFFFF) return null;
    $type = $cle & 7;
    if ($type === 0) { $v = proto_entier($o, $q); if ($v === null) return null; $l[] = [$cle >> 3, 0, $v, 0]; }
    elseif ($type === 2) {
      $n = proto_entier($o, $q);
      if ($n === null || $n < 0 || $p + $q + $n > $fin) return null;
      $l[] = [$cle >> 3, 2, $p + $q, $n];
      $q += $n;
    }
    elseif ($type === 1 || $type === 5) { $l[] = [$cle >> 3, $type, 0, 0]; $q += $type === 1 ? 8 : 4; }
    else return null;
    $p += $q;
  }
  return $p === $fin ? $l : null;
}

/**
 * Ce qui se verifie simplement d'un fichier ONNX, sans le charger ni l'executer (le serveur n'execute jamais un modele ; la page le
 * lira dans le bac a sable WebAssembly du navigateur, une fois active par une personne) : c'est un ModelProto bien forme de bout en
 * bout, fait des seuls champs que le format connait, avec une version, un jeu d'operateurs et un seul graphe, lui-meme bien forme,
 * qui a des noeuds, une entree et une sortie. Rend la raison du refus, ou null.
 */
function onnx_refus(string $fichier): ?string {
  $taille = (int)@filesize($fichier);
  if ($taille < BANC_JETON_MODELE_MIN) return 'fichier trop petit pour un modèle';
  if ($taille > BANC_JETON_MODELE_MAX) return 'fichier trop lourd';
  $h = fopen($fichier, 'rb');
  if (!$h) return 'fichier illisible';
  try {
    $modele = proto_champs($h, 0, $taille, 4096);
    if ($modele === null) return 'ce n’est pas un fichier ONNX (protobuf mal formé)';
    $par = [];
    foreach ($modele as [$num, $type, $v, $n]) {
      if ((BANC_ONNX_MODELE[$num] ?? -1) !== $type) return 'ce n’est pas un fichier ONNX (champ ' . $num . ' inattendu)';
      $par[$num][] = [$v, $n];
    }
    if (count($par[1] ?? []) !== 1 || $par[1][0][0] < 1 || $par[1][0][0] > 64) return 'ce n’est pas un fichier ONNX (version absente)';
    if (empty($par[8])) return 'ce n’est pas un fichier ONNX (jeu d’opérateurs absent)';
    if (count($par[7] ?? []) !== 1) return 'ce n’est pas un fichier ONNX (il faut un graphe, et un seul)';
    [$debut, $long] = $par[7][0];
    $graphe = proto_champs($h, $debut, $debut + $long, 2000000);
    if ($graphe === null) return 'ce n’est pas un fichier ONNX (graphe mal formé)';
    $compte = [];
    foreach ($graphe as [$num, $type]) {
      if ((BANC_ONNX_GRAPHE[$num] ?? -1) !== $type) return 'ce n’est pas un fichier ONNX (champ ' . $num . ' inattendu dans le graphe)';
      $compte[$num] = ($compte[$num] ?? 0) + 1;
    }
    if (empty($compte[1]) || empty($compte[11]) || empty($compte[12])) return 'ce n’est pas un modèle ONNX complet (nœuds, entrée ou sortie absents)';
    return null;
  } finally {
    fclose($h);
  }
}

/**
 * Ce que le script dit de son modele, champ par champ. L'architecture et la resolution doivent etre celles de l'export du jeton ; les
 * noms sont bornes en nombre, en longueur et en caracteres ; le bilan est une liste fermee de nombres entre 0 et 1 (ce qui n'en est
 * pas un est laisse, comme pour le mur d'une vue). Rien d'autre du corps n'est garde.
 */
function depot_valide(array $b, array $j): array {
  if (($b['architecture'] ?? null) !== $j['architecture']['id']) erreur(400, 'Architecture inattendue : ce jeton attend ' . $j['architecture']['id'] . '.');
  if (!is_int($b['resolution'] ?? null) || !in_array($b['resolution'], [384, 512, 576, 640], true) || $b['resolution'] !== $j['architecture']['resolution']) erreur(400, 'Résolution inattendue : ce jeton attend ' . $j['architecture']['resolution'] . '.');
  $classes = $b['classes'] ?? null;
  if (!is_array($classes) || !array_is_list($classes) || !$classes || count($classes) > BANC_NOMS_MAX) erreur(400, 'Liste des noms attendue (de 1 à ' . BANC_NOMS_MAX . ').');
  foreach ($classes as $c) if (!is_string($c) || !preg_match(BANC_NOM_APPRIS, $c)) erreur(400, 'Nom de classe invalide (minuscules, chiffres, « _ » et « - », 40 caractères au plus).');
  if (count(array_unique($classes)) !== count($classes)) erreur(400, 'Nom de classe en double.');
  $part = fn($v) => (is_int($v) || is_float($v)) && $v >= 0 && $v <= 1 ? round((float)$v, 4) : null;
  $bilan = [];
  $lu = is_array($b['bilan'] ?? null) ? $b['bilan'] : [];
  foreach (['map', 'map50'] as $k) if (($v = $part($lu[$k] ?? null)) !== null) $bilan[$k] = $v;
  foreach ((is_array($lu['parType'] ?? null) ? $lu['parType'] : []) as $nom => $v) if (is_string($nom) && in_array($nom, $classes, true) && ($v = $part($v)) !== null) $bilan['parType'][$nom] = $v;
  return ['classes' => $classes, 'bilan' => $bilan];
}

/**
 * La fin du depot : la taille et l'empreinte annoncees doivent etre celles des octets recus, le fichier doit etre un ONNX, ce que le
 * script en dit doit etre valable. Alors seulement il devient un modele de l'etape 3, sous un nom choisi ici, INACTIF : une personne
 * l'active. Le jeton a servi : il ne depose plus, ne lit plus, et son jeu est efface.
 */
function entrainement_fin(array $j): void {
  // Dit avant de lire le corps : un jeton qui a servi recoit la meme reponse quoi qu'il envoie.
  if (!empty($j['depose'])) erreur(409, 'Ce jeton a déjà déposé son modèle : il ne dépose plus.');
  $b = corps_json();
  $modele = jeton_changer($j['id'], function (array &$j, array $f) use ($b) {
    if (!empty($j['depose'])) erreur(409, 'Ce jeton a déjà déposé son modèle : il ne dépose plus.');
    if (!is_file($f['partie'])) erreur(400, 'Aucun morceau reçu.');
    if (!is_int($b['taille'] ?? null) || $b['taille'] !== filesize($f['partie']) || !is_string($b['sha256'] ?? null) || !preg_match('/^[0-9a-f]{64}$/', $b['sha256']) || !hash_equals((string)hash_file('sha256', $f['partie']), $b['sha256']))
      erreur(400, 'Le fichier reçu n’est pas celui annoncé (taille ou empreinte) : recommencez au morceau n° 0.');
    $d = depot_valide($b, $j);
    $refus = onnx_refus($f['partie']);
    if ($refus !== null) { @unlink($f['partie']); $j['parties'] = 0; ecrire_json($f['json'], $j); erreur(415, 'Modèle refusé : ' . $refus . '.'); }
    $id = 'entrainement-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3));
    $dm = dossier('modeles');
    if (!rename($f['partie'], "$dm/$id.onnx")) erreur(500, 'Enregistrement impossible.');
    $a = $j['architecture'];
    $correspondance = [];
    foreach ($d['classes'] as $c) $correspondance[$c] = (string)($j['correspondance'][$c] ?? '');
    $description = ['nom' => $a['nom'] . ' · entraîné le ' . gmdate('d/m/Y'), 'format' => $a['format'], ...($a['format'] === 'rf-detr' ? ['resolution' => $a['resolution']] : []),
      'classes' => $d['classes'], 'correspondance' => $correspondance, 'seuil' => 0.3, 'actif' => false, 'ajouteLe' => gmdate('c'),
      'depot' => ['par' => 'entrainement', 'le' => gmdate('c'), 'architecture' => $a['id'], 'depart' => $a['depart'], 'jeu' => array_diff_key($j['jeu'], ['octets' => 1]), 'bilan' => (object)$d['bilan'],
        'octets' => filesize("$dm/$id.onnx"), 'sha256' => $b['sha256']]];
    ecrire_json("$dm/$id.json", $description);
    @unlink($f['zip']);
    $j['depose'] = ['le' => gmdate('c'), 'modele' => $id];
    return ['id' => $id] + $description;
  });
  repondre(201, ['depose' => true, 'modele' => $modele['id'], 'nom' => $modele['nom']]);
}

/** Une chaine ecrite dans le code Python du script : un litteral JSON, que Python lit tel quel (ASCII, tout le reste echappe). */
function python(string $s): string { return (string)json_encode($s, JSON_UNESCAPED_SLASHES); }

/** Une chaine ecrite dans le shell du script : entre apostrophes, rien n'y est interprete. */
function shell(string $s): string { return "'" . str_replace("'", "'\\''", $s) . "'"; }

/**
 * Ce que le script entraine, en Python : les memes reglages qu'en 5.37.0 (epoques, patience, taille d'image, lot, graine,
 * poids de depart), a un mot pres : l'appareil de calcul, choisi sur la machine (mps sur Apple Silicon, cpu sinon) au lieu du GPU
 * d'un service. `epoques` ne vaut autre chose que None que pour un essai (BANC_EPOQUES).
 */
function python_entrainement(string $format, array $a): string {
  $zero = $a['depart'] === 'zero';
  if ($format === 'rfdetr') {
    $creer = $zero ? "{$a['classe']}(pretrain_weights=None)" : "{$a['classe']}()";
    return "def entrainer(appareil, epoques):\n"
      . "    from rfdetr import {$a['classe']}\n"
      . "    noms = [l.split(': ', 1)[1].strip() for l in open('noms.txt', encoding='utf-8') if ': ' in l]\n"
      . "    m = $creer\n"
      . "    m.train(dataset_dir='.', output_dir='sortie', epochs=epoques or " . ($zero ? 300 : 100) . ", batch_size=8, grad_accum_steps=2, early_stopping=True, early_stopping_patience=" . ($zero ? 40 : 15) . ", run_test=True, log_per_class_metrics=True, tensorboard=False, device=appareil)\n"
      . "    best = {$a['classe']}(pretrain_weights='sortie/checkpoint_best_total.pth')\n"
      . "    # Le modele quantifie int8 (environ 4 fois plus petit) : c'est lui qui est depose.\n"
      . "    best.export(output_dir='sortie', quantization='int8', calibration_data='train')\n"
      . "    modele = shutil.copy(next(f for f in glob.glob('sortie/*.onnx') if f.endswith('_int8.onnx')), 'modele-banc.onnx')\n"
      . "    # Le bilan sur le bloc test (mAP par type) ; s'il ne se mesure pas, le modele est depose sans lui.\n"
      . "    bilan, par_type = {}, {}\n"
      . "    try:\n"
      . "        mesure = best.evaluate(split='test', dataset_dir='.', output_dir='sortie', log_per_class_metrics=True, device=appareil)\n"
      . "        bilan = {'map': mesure.get('test/mAP_50_95'), 'map50': mesure.get('test/mAP_50')}\n"
      . "        par_type = {n: mesure.get('test/AP/' + n) for n in noms}\n"
      . "    except Exception as e:\n"
      . "        print('Bilan du test non mesuré :', e, flush=True)\n"
      . "    return modele, noms, bilan, par_type\n";
  }
  $depart = $zero
    ? "    # Sans COCO : l'architecture seule ({$a['yaml']}), rien d'appris ; plus d'epoques.\n"
      . "    m = YOLO('{$a['yaml']}')\n"
      . "    m.train(data='data.yaml', pretrained=False, epochs=epoques or 300, patience=60, imgsz=640, batch=16, device=appareil, project='runs', name='banc', exist_ok=True, seed=20261110, deterministic=True)\n"
    : "    # Des poids de depart de la meme architecture, s'il y en a (depart.pt, pose dans le dossier d'entrainement avant de lancer) ; sinon COCO.\n"
      . "    depart = os.path.join(DOSSIER, 'depart.pt')\n"
      . "    m = YOLO(depart if os.path.exists(depart) else '{$a['poids']}')\n"
      . "    m.train(data='data.yaml', epochs=epoques or 150, patience=30, imgsz=640, batch=16, device=appareil, project='runs', name='banc', exist_ok=True, seed=20261110, deterministic=True)\n";
  return "def entrainer(appareil, epoques):\n"
    . "    from ultralytics import YOLO\n"
    . $depart
    . "    best = YOLO(str(m.trainer.best))\n"
    . "    noms = [best.names[i] for i in sorted(best.names)]\n"
    . "    # Le bilan sur le bloc test (mAP par type) ; s'il ne se mesure pas, le modele est depose sans lui.\n"
    . "    bilan, par_type = {}, {}\n"
    . "    try:\n"
    . "        mesure = best.val(data='data.yaml', split='test', device=appareil)\n"
    . "        bilan = {'map': mesure.box.map, 'map50': mesure.box.map50}\n"
    . "        par_type = {noms[int(c)]: mesure.box.class_result(k)[3] for k, c in enumerate(mesure.box.ap_class_index)}\n"
    . "    except Exception as e:\n"
    . "        print('Bilan du test non mesuré :', e, flush=True)\n"
    . "    modele = best.export({$a['export']})\n"
    . "    return str(modele), noms, bilan, par_type\n";
}

/**
 * Le script d'un jeton, a lancer dans le Terminal d'un Mac (demande du proprietaire, 21 novembre 2026 : entrainer sur son Mac). Un
 * seul fichier : du shell (bash 3.2, celui de macOS) qui trouve Python, cree un environnement isole dans un dossier a lui, installe
 * le paquet d'entrainement, puis lance le Python qu'il embarque : lire le jeu ici avec sa cle, entrainer (mps sur Apple Silicon, cpu
 * sinon), mesurer le test, exporter l'ONNX et le deposer ici avec ses noms, sa resolution et son bilan. Relance, il reprend ou il
 * s'etait arrete. Si le depot echoue, il dit ou est le modele et avec quels noms le deposer a la main (etape 3).
 */
function script_jeton(string $format, array $j, string $adresse, string $jeton, int $morceau, string $fichier): string {
  $a = $j['architecture'] + (BANC_ARCHITECTURES[$format][$j['architecture']['id']] ?? []);
  $a['yaml'] = preg_replace('/\.pt$/', '.yaml', $a['poids'] ?? '');
  $rfdetr = $format === 'rfdetr';
  $modele = <<<'SCRIPT'
#!/bin/bash
# Banc d'apprentissage des facades : entrainement @@NOM@@ (@@DEPART@@) sur ce Mac.
# @@LICENCE@@
#
# CE FICHIER CONTIENT UNE CLE valable @@HEURES@@ h : ne le partagez pas. Elle ne permet que de lire ce jeu et de deposer un modele ;
# elle se revoque a l'etape 6 du banc.
#
# Le lancer, dans le Terminal :
#     bash ~/Downloads/@@FICHIER@@
#
# Ce qu'il fait : il trouve Python 3, cree un environnement Python isole, y installe @@PAQUETS@@,
# lit le jeu sur le banc, entraine (mps sur un Mac Apple Silicon, cpu sinon), mesure le bloc test, exporte le modele ONNX et le
# depose a l'etape 3 du banc, inactif.
# Tout se range dans ~/banc-entrainement (rien ailleurs) ; pour tout effacer :  rm -rf ~/banc-entrainement
# Relance, il reprend ou il s'etait arrete : ni l'installation ni le jeu ne se retelechargent ; un modele deja entraine est
# seulement depose. Un entrainement interrompu, lui, repart de son debut.
#
# Reglages, tous facultatifs (variables d'environnement, devant la commande) :
#   BANC_DOSSIER=/un/dossier     ranger ailleurs que dans ~/banc-entrainement
#   BANC_PYTHON=/chemin/python3  le Python a utiliser (3.10 ou plus recent)
#   BANC_APPAREIL=cpu            l'appareil de calcul (par defaut : mps sur Apple Silicon, cpu sinon)
#   BANC_EPOQUES=1               pour un essai seulement : un entrainement raccourci (le modele depose ne vaut rien)
#   BANC_ESSAI_MODELE=/x.onnx    pour un essai seulement : n'installe et n'entraine rien, depose ce fichier a la place

set -u
umask 077
BANC_ADRESSE=@@ADRESSE@@
BANC_CLE=@@CLE@@
BANC_JEU=@@RACINE@@
BANC_ARCHITECTURE=@@ARCHITECTURE@@
BANC_RESOLUTION=@@RESOLUTION@@
BANC_MORCEAU=@@MORCEAU@@
FAMILLE=@@FAMILLE@@
DOSSIER="${BANC_DOSSIER:-$HOME/banc-entrainement}"

dire() { printf '\n==> %s\n' "$*"; }
arreter() { printf '\nARRÊT : %s\n' "$*" >&2; exit 1; }
trap 'printf "\nInterrompu. Relancez la même commande pour reprendre.\n" >&2; exit 130' INT

printf 'Banc d’apprentissage des façades : entraînement @@NOM@@ (@@DEPART_ECRAN@@) sur cette machine.\n'
# La cle ne s'affiche jamais en entier : son debut suffit a la reconnaitre dans la liste de l'etape 6.
printf 'Clé d’entraînement %s… (ce fichier la contient : ne le partagez pas).\n' "${BANC_CLE:0:11}"
printf 'Dossier de travail : %s\n' "$DOSSIER"

# 1. La machine.
SYSTEME="$(uname -s 2>/dev/null || echo inconnu)"
PUCE="$(uname -m 2>/dev/null || echo inconnue)"
if [ "$SYSTEME" != "Darwin" ]; then printf 'Remarque : ce script est écrit pour macOS ; ici « %s », sans garantie.\n' "$SYSTEME"; fi
mkdir -p "$DOSSIER" || arreter "Le dossier $DOSSIER ne peut pas être créé."
LIBRE="$(df -Pk "$DOSSIER" 2>/dev/null | awk 'NR==2 { print int($4 / 1048576) }')"
if [ -n "$LIBRE" ] && [ "$LIBRE" -lt 5 ]; then printf 'Attention : %s Go libres seulement ; l’installation et le jeu en demandent environ 5 (ordre de grandeur).\n' "$LIBRE"; fi

# 2. Python 3.10 ou plus recent, avec de quoi creer un environnement isole.
python_convient() { "$1" -c 'import sys, venv, ensurepip; sys.exit(0 if sys.version_info[:2] >= (3, 10) else 1)' >/dev/null 2>&1; }
PY=""
if [ -n "${BANC_PYTHON:-}" ]; then
  python_convient "$BANC_PYTHON" || arreter "BANC_PYTHON ($BANC_PYTHON) n’est pas un Python 3.10 ou plus récent."
  PY="$BANC_PYTHON"
else
  for p in python3.12 python3.13 python3.11 python3.10 python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do
    if command -v "$p" >/dev/null 2>&1 && python_convient "$p"; then PY="$(command -v "$p")"; break; fi
  done
fi
[ -n "$PY" ] || arreter "Python 3.10 ou plus récent est introuvable sur ce Mac (celui fourni avec macOS est trop ancien).
Installez-le depuis https://www.python.org/downloads/macos/ (le programme d’installation « macOS 64-bit universal2 »),
ou par Homebrew : brew install python@3.12 — puis relancez la même commande."
dire "1/6 Python : $PY ($("$PY" -c 'import platform; print(platform.python_version())'), $SYSTEME $PUCE)"

# Tout ce que les outils gardent en cache reste dans le dossier de travail : l'effacer efface tout.
export PIP_CACHE_DIR="$DOSSIER/cache/pip" HF_HOME="$DOSSIER/cache/huggingface" TORCH_HOME="$DOSSIER/cache/torch"
export YOLO_CONFIG_DIR="$DOSSIER/cache/ultralytics" MPLCONFIGDIR="$DOSSIER/cache/matplotlib" RF_HOME="$DOSSIER/cache/roboflow"
export PIP_DISABLE_PIP_VERSION_CHECK=1
# Sur Apple Silicon, une operation que mps ne sait pas faire retombe sur le processeur au lieu d'arreter l'entrainement.
export PYTORCH_ENABLE_MPS_FALLBACK=1
mkdir -p "$DOSSIER/cache/ultralytics" "$DOSSIER/cache/matplotlib"

# 3. L'environnement isole et ce qu'il faut pour entrainer (une seule fois : relance, cette etape est passee).
ENV="$DOSSIER/env-$FAMILLE"
if [ ! -x "$ENV/bin/python" ]; then
  dire "2/6 Création de l’environnement Python isolé ($ENV)…"
  "$PY" -m venv "$ENV" || arreter "L’environnement Python n’a pas pu être créé dans $ENV."
else
  dire "2/6 Environnement Python déjà là ($ENV)."
fi
PAQUETS=(@@PAQUETS_SHELL@@)
if [ -n "${BANC_ESSAI_MODELE:-}" ]; then
  dire "3/6 ESSAI (BANC_ESSAI_MODELE) : rien n’est installé ni entraîné, le fichier donné sera déposé."
elif [ "$(cat "$ENV/banc-installe.txt" 2>/dev/null)" = "${PAQUETS[*]}" ]; then
  dire "3/6 Déjà installé : ${PAQUETS[*]}"
else
  dire "3/6 Installation de ${PAQUETS[*]} (un à plusieurs Go à télécharger la première fois : patience)…"
  "$ENV/bin/python" -m pip install --upgrade pip || arreter "pip ne se met pas à jour : vérifiez la connexion à Internet, puis relancez la même commande."
  "$ENV/bin/python" -m pip install "${PAQUETS[@]}" || arreter "L’installation a échoué (connexion coupée, ou place manquante ?). Relancez la même commande : ce qui est déjà téléchargé est gardé."
  printf '%s' "${PAQUETS[*]}" > "$ENV/banc-installe.txt"
  # Les paquets telecharges ne servent plus une fois installes : leur copie (plusieurs Go) ne reste pas sur le disque.
  rm -rf "$DOSSIER/cache/pip"
fi

# 4. Le reste est du Python, ecrit a cote (un fichier, pour que les lecteurs de donnees de macOS puissent le relire) ; il ne porte
# pas la cle, qui lui arrive par l'environnement.
cat > "$DOSSIER/entrainer_banc.py" <<'PYTHON_DU_BANC'
@@PYTHON@@
PYTHON_DU_BANC
# Sur un Mac, caffeinate empeche la mise en veille automatique tant que l'entrainement tourne (pas celle d'un portable qu'on referme).
VEILLE=""
if command -v caffeinate >/dev/null 2>&1; then VEILLE="caffeinate -i"; fi
BANC_ADRESSE="$BANC_ADRESSE" BANC_CLE="$BANC_CLE" BANC_JEU="$BANC_JEU" BANC_ARCHITECTURE="$BANC_ARCHITECTURE" BANC_RESOLUTION="$BANC_RESOLUTION" \
  BANC_MORCEAU="$BANC_MORCEAU" BANC_DOSSIER="$DOSSIER" $VEILLE "$ENV/bin/python" "$DOSSIER/entrainer_banc.py"
CODE=$?
case "$CODE" in
  0) printf '\nTerminé. Le modèle est à l’étape 3 du banc, inactif : il ne reste qu’à l’activer.\n' ;;
  2|3|130) exit "$CODE" ;;
  *) printf '\nARRÊT : le script s’est arrêté sur une erreur inattendue (code %s) ; ce qui précède dit laquelle. Relancez la même commande pour reprendre.\n' "$CODE" >&2 ; exit "$CODE" ;;
esac
# fin du script du banc
SCRIPT;
  $python = <<<'PYTHON'
# Ecrit par le script d'entrainement du banc d'apprentissage des facades. Il ne porte pas la cle : elle arrive par l'environnement.
import glob, hashlib, json, math, os, shutil, ssl, sys, time, traceback, urllib.error, urllib.parse, urllib.request, zipfile

DOSSIER = os.environ.get('BANC_DOSSIER', '')


class Arret(Exception):
    """Une fin prevue : le message dit quoi faire."""


def dire(n, texte):
    print('\n==> %s %s' % (n, texte), flush=True)


def certificats():
    """Les autorites de certification du systeme, plus celles du paquet certifi s'il est installe : le Python de python.org pour
    macOS n'a pas celles du systeme tant qu'on n'a pas lance son « Install Certificates », et https echouerait sans raison visible."""
    contexte = ssl.create_default_context()
    try:
        import certifi
        contexte.load_verify_locations(certifi.where())
    except Exception:
        pass
    return contexte


def appeler(cle, params, methode='GET', corps=None, entetes=None):
    """Un appel au banc avec la cle. Rend la reponse ; un refus ou une panne deviennent un Arret qui dit quoi faire."""
    r = urllib.request.Request(os.environ['BANC_ADRESSE'] + '?' + urllib.parse.urlencode(params), data=corps, method=methode,
                               headers={'X-Banc-Jeton': cle, 'User-Agent': 'banc-entrainement', **(entetes or {})})
    try:
        return urllib.request.urlopen(r, timeout=900, context=certificats())
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read().decode('utf-8', 'replace')).get('erreur', '')
        except Exception:
            message = ''
        if e.code == 401:
            raise Arret('la clé de ce script est refusée : elle a expiré ou a été révoquée. Créez-en une autre à l’étape 6 du banc '
                        '(« Entraîner sur mon Mac ») et lancez le nouveau script : l’installation est gardée.')
        raise Arret('le banc refuse (%d) : %s' % (e.code, message or 'sans explication'))
    except (urllib.error.URLError, OSError) as e:
        raise Arret('le banc ne répond pas (%s). Vérifiez la connexion à Internet, puis relancez la même commande.' % getattr(e, 'reason', e))


def duree(secondes):
    return '%d h %02d min' % (secondes // 3600, secondes % 3600 // 60) if secondes >= 3600 else '%d min' % max(1, secondes // 60)


def lire_le_jeu(cle, racine):
    """Le jeu de la cle, range dans le dossier de travail ; deja la, il n'est pas relu."""
    temoin = os.path.join(DOSSIER, racine, '.jeu-complet')
    if os.path.exists(temoin):
        dire('4/6', 'Jeu déjà là (%s) : pas de nouveau téléchargement.' % os.path.join(DOSSIER, racine))
        return
    dire('4/6', 'Téléchargement du jeu…')
    partiel = os.path.join(DOSSIER, racine + '.zip.partiel')
    with appeler(cle, {'r': 'entrainement-jeu'}) as r, open(partiel, 'wb') as f:
        shutil.copyfileobj(r, f, 1 << 20)
    try:
        with zipfile.ZipFile(partiel) as z:
            # Le jeu ne s'ouvre que dans son dossier : un nom qui en sortirait arrete tout.
            for n in z.namelist():
                if not n.startswith(racine + '/') or '..' in n.split('/') or '\\' in n:
                    raise Arret('le jeu reçu contient un nom inattendu (%s) : rien n’a été ouvert.' % n)
            shutil.rmtree(os.path.join(DOSSIER, racine), ignore_errors=True)
            z.extractall(DOSSIER)
    except zipfile.BadZipFile:
        raise Arret('le jeu reçu est incomplet (connexion coupée ?). Relancez la même commande.')
    finally:
        os.remove(partiel)
    open(temoin, 'w').close()
    print('Jeu rangé dans %s' % os.path.join(DOSSIER, racine), flush=True)


def appareil_de_calcul():
    """mps sur un Mac Apple Silicon, cpu sinon (Mac Intel) ; BANC_APPAREIL l'impose."""
    voulu = os.environ.get('BANC_APPAREIL', '').strip()
    if voulu:
        return voulu, 'imposé par BANC_APPAREIL'
    import torch
    if getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available():
        return 'mps', 'la puce graphique d’Apple Silicon'
    return 'cpu', 'le processeur : pas de puce Apple Silicon utilisable ici, l’entraînement sera lent'


@@ENTRAINER@@

def part(v):
    try:
        v = float(v)
    except Exception:
        return None
    return round(v, 4) if math.isfinite(v) and 0 <= v <= 1 else None


def deposer(cle, chemin, description):
    """Le depot du modele : des morceaux dans l'ordre, puis la fin avec sa taille et son empreinte."""
    octets = open(chemin, 'rb').read()
    morceau = int(os.environ['BANC_MORCEAU'])
    for n, debut in enumerate(range(0, len(octets), morceau)):
        appeler(cle, {'r': 'entrainement-modele', 'partie': n}, 'POST', octets[debut:debut + morceau], {'Content-Type': 'application/octet-stream'}).close()
    corps = json.dumps({**description, 'taille': len(octets), 'sha256': hashlib.sha256(octets).hexdigest()}).encode()
    with appeler(cle, {'r': 'entrainement-modele', 'fin': '1'}, 'POST', corps, {'Content-Type': 'application/json'}) as r:
        return json.loads(r.read().decode('utf-8'))


def principal():
    # La cle quitte l'environnement des qu'elle est lue : les processus lances ensuite (lecteurs de donnees) ne l'heritent pas.
    cle = os.environ.pop('BANC_CLE')
    racine = os.environ['BANC_JEU']
    resolution = int(os.environ['BANC_RESOLUTION'])
    with appeler(cle, {'r': 'entrainement-etat'}) as r:
        etat = json.loads(r.read().decode('utf-8'))
    if etat.get('depose'):
        raise Arret('cette clé a déjà déposé son modèle : il est à l’étape 3 du banc. Pour réentraîner, créez une autre clé à l’étape 6.')
    images = etat.get('jeu', {}).get('images', {})
    print('Clé acceptée, valable encore %s. Jeu : %d photo(s) pour apprendre, %d pour valider, %d pour le test.'
          % (duree(int(etat.get('reste', 0))), images.get('train', 0), images.get('val', 0), images.get('test', 0)), flush=True)
    print('Si l’entraînement dure plus longtemps que la clé, le modèle reste dans le dossier de travail et se dépose à la main (étape 3).', flush=True)
    # Lu avant de changer de dossier : un chemin relatif se comprend depuis la ou la commande est lancee.
    essai = os.environ.get('BANC_ESSAI_MODELE', '').strip()
    essai = os.path.abspath(essai) if essai else ''
    lire_le_jeu(cle, racine)
    os.chdir(os.path.join(DOSSIER, racine))

    resultat = 'resultat-banc.json'
    if essai:
        dire('5/6', 'ESSAI : pas d’entraînement, dépôt de %s' % essai)
        noms = ([l.split(': ', 1)[1].strip() for l in open('noms.txt', encoding='utf-8') if ': ' in l] if os.path.exists('noms.txt')
                else [l.split(': ', 1)[1].strip() for l in open('data.yaml', encoding='utf-8') if l.startswith('  ') and ': ' in l])
        fait = {'modele': essai, 'noms': noms, 'bilan': {}}
    elif os.path.exists(resultat) and os.path.exists(json.load(open(resultat, encoding='utf-8'))['modele']):
        fait = json.load(open(resultat, encoding='utf-8'))
        dire('5/6', 'Modèle déjà entraîné (%s) : il est seulement déposé.' % fait['modele'])
    else:
        appareil, pourquoi = appareil_de_calcul()
        epoques = int(os.environ.get('BANC_EPOQUES', '0') or 0) or None
        dire('5/6', 'Entraînement sur « %s » (%s)%s. Cela peut durer des heures : laissez le Mac branché et éveillé.'
             % (appareil, pourquoi, ', ESSAI raccourci à %d époque(s)' % epoques if epoques else ''))
        debut = time.time()
        try:
            modele, noms, bilan, par_type = entrainer(appareil, epoques)
        except KeyboardInterrupt:
            raise
        except BaseException:
            traceback.print_exc()
            raise Arret('l’entraînement s’est arrêté sur l’erreur ci-dessus (appareil « %s »).%s' % (appareil,
                        ' Pour l’essayer sur le processeur, plus lent : BANC_APPAREIL=cpu devant la même commande.' if appareil != 'cpu' else ''))
        bilan = {k: v for k, v in {'map': part(bilan.get('map')), 'map50': part(bilan.get('map50'))}.items() if v is not None}
        bilan['parType'] = {n: part(v) for n, v in par_type.items() if part(v) is not None}
        fait = {'modele': os.path.abspath(modele), 'noms': noms, 'bilan': bilan}
        json.dump(fait, open(resultat, 'w', encoding='utf-8'))
        print('Entraînement fini en %s. mAP50-95 du bloc test : %s' % (duree(int(time.time() - debut)), bilan.get('map', 'non mesuré')), flush=True)

    dire('6/6', 'Dépôt du modèle dans le banc…')
    try:
        recu = deposer(cle, fait['modele'], {'architecture': os.environ['BANC_ARCHITECTURE'], 'resolution': resolution, 'classes': fait['noms'], 'bilan': fait['bilan']})
    except Arret as e:
        print('\nARRÊT : dépôt impossible — %s' % e, file=sys.stderr)
        print('Le modèle est gardé ici : %s\nIl se dépose à la main à l’étape 3 du banc (« Déposer un modèle entraîné »), avec la résolution %d et ces noms :'
              % (fait['modele'], resolution), file=sys.stderr)
        for i, n in enumerate(fait['noms']):
            print('%d: %s' % (i, n), file=sys.stderr)
        return 3
    print('Déposé dans le banc : %s' % recu['nom'], flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(principal())
    except Arret as e:
        print('\nARRÊT : %s' % e, file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        # Le shell qui a lance ce fichier dit lui-meme « Interrompu ».
        sys.exit(130)
PYTHON;
  $paquets = $rfdetr ? ['rfdetr[train,loggers,onnx]==1.12.*'] : ['ultralytics==8.4.*', 'onnx', 'onnxslim', 'onnxruntime'];
  $heures = (int)round(((int)$j['expire'] - time()) / 3600);
  $zero = $a['depart'] === 'zero';
  // Le Python d'abord : ce qu'il contient ne doit pas etre repris par le remplacement des reperes du shell.
  return strtr($modele, ['@@PYTHON@@' => strtr($python, ['@@ENTRAINER@@' => python_entrainement($format, $a)])]
    + ['@@NOM@@' => $a['nom'], '@@DEPART@@' => $zero ? 'sans COCO, de zero' : 'parti de COCO', '@@DEPART_ECRAN@@' => $zero ? 'sans COCO, de zéro' : 'parti de COCO',
      '@@LICENCE@@' => $rfdetr ? 'RF-DETR (Roboflow), licence Apache 2.0 pour le code et les poids.'
        : "YOLO d'Ultralytics, licence AGPL-3.0 : un modele entraine avec eux, servi dans une application, impose d'en publier le code ou d'acheter leur licence. Pour comparer.",
      '@@HEURES@@' => (string)$heures, '@@FICHIER@@' => $fichier, '@@PAQUETS@@' => implode(' ', $paquets), '@@PAQUETS_SHELL@@' => implode(' ', array_map('shell', $paquets)),
      '@@ADRESSE@@' => shell($adresse), '@@CLE@@' => shell($jeton), '@@RACINE@@' => shell($j['jeu']['racine']), '@@ARCHITECTURE@@' => shell($a['id']),
      '@@RESOLUTION@@' => (string)(int)$a['resolution'], '@@MORCEAU@@' => (string)$morceau, '@@FAMILLE@@' => $rfdetr ? 'rfdetr' : 'yolo']);
}

// ---------------------------------------------------------------------------------------------------------------------
// Routage

if (PHP_SAPI !== 'cli' || getenv('BANC_TEST_ROUTER')) {
  banc_config();
  $r = (string)($_GET['r'] ?? '');
  $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  $id = isset($_GET['id']) ? (string)$_GET['id'] : null;
  // Les trois routes du script d'entrainement : un jeton, pas de session (aucun temoin pose, aucune session ouverte). Elles sont ici,
  // avant tout le reste, et nulle part ailleurs : aucune autre route ne lit l'en-tete du jeton.
  if ("$methode $r" === 'GET entrainement-etat') entrainement_etat(jeton_presente());
  if ("$methode $r" === 'GET entrainement-jeu') entrainement_jeu(jeton_presente());
  if ("$methode $r" === 'POST entrainement-modele') { $j = jeton_presente(); isset($_GET['fin']) ? entrainement_fin($j) : entrainement_morceau($j, (string)($_GET['partie'] ?? '')); }
  demarrer_session();
  if ($r === 'etat') repondre(200, ['connecte' => connecte()]);
  // Une ecriture vient de la page du banc, jamais d'un formulaire d'un autre site : l'en-tete X-Banc le dit.
  if ($methode !== 'GET' && ($_SERVER['HTTP_X_BANC'] ?? '') !== '1') erreur(403, 'En-tête X-Banc manquant.');
  if ($r === 'connexion' && $methode === 'POST') connexion();
  if (!connecte()) erreur(401, 'Connexion requise.');
  // Le debit du relais se compte dans la session, avant de la rendre aux autres requetes.
  if ("$methode $r" === 'GET relais') relais_compter();
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
    case 'GET relais': relais_servir((string)$id, (string)($_GET['taille'] ?? ''));
    case 'GET jetons': jetons_lister();
    case 'POST jetons': jeton_creer();
    case 'DELETE jeton': jeton_revoquer($id);
    case 'GET export': exporter((string)($_GET['format'] ?? 'detect'), ($_GET['verifiees'] ?? '0') === '1', (string)($_GET['base'] ?? ''), (string)($_GET['depart'] ?? 'coco'));
  }
  erreur(404, 'Route inconnue : ' . $methode . ' ' . $r);
}
