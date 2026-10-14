<?php
// L'analyse par Claude pour un hebergement Apache + PHP, sans Node (MD/spec-audit.md 13.2 et 13.3,
// plan D1) : le proxy de l'API Message Batches d'Anthropic, ses plafonds et son journal.
//
// Meme contrat que buildsg/analyseAdmin.mjs, route pour route : la page ne sait pas lequel lui
// repond. `.htaccess` renvoie `admin/claude/<chemin>` ici, avec `?chemin=<chemin>` : sous `admin/`,
// le cookie de la session admin (admin.php) arrive aussi ici, et un seul mot de passe suffit.
//
//   GET  admin/claude/etat                    cle configuree ou non, versions du prompt et du schema
//   POST admin/claude/batches                 cree un batch (une requete par passe) apres les plafonds
//   GET  admin/claude/batches/<id>            son etat, lu chez Anthropic
//   GET  admin/claude/batches/<id>/resultats  ses resultats ; le journal recoit une ligne par requete
//   POST admin/claude/messages                l'appel immediat (renfort du releve, trois passes au plus)
//   GET|PUT admin/claude/tarifs              la table des tarifs datee
//   GET|PUT admin/claude/plafonds             les plafonds par organisation, par jour et par mois
//   GET  admin/consommation                   le journal filtre, pour le tableau de bord (13.3, L16 bis)
//   POST admin/audits                         depose un fichier `plan-audit-parcelle` (15, lot L21)
//   GET  admin/audits                         la liste des audits recus (administrateur)
//   GET  admin/audits/<id>                    un audit recu (administrateur)
//   DELETE admin/audits/<id>                  le retire : son secret de retrait, ou l'administrateur
//
// Les audits partages pour le corpus (spec-audit 15, decision D7) : l'utilisateur coche « Partager
// cet audit pour améliorer Plan » ; le fichier arrive ici, par la session admin ou le jeton de la
// plateforme (`Authorization: Bearer`, verifie aupres d'elle, `plateformeUrl` de la configuration).
// Ils se rangent dans `<dossierDemos>/audits/`, avec les autres donnees de l'admin, hors du dossier
// publie. L'envoi rend un secret de retrait, garde sur l'appareil, seul a pouvoir retirer le fichier
// quand la personne decoche la case ; le serveur n'en garde que l'empreinte.
//
// **La cle ne quitte jamais le serveur** (`anthropicCle`, dans la configuration hors du dossier
// publie), et la page ne choisit ni le prompt, ni le schema, ni le reglage : elle n'envoie que la
// partie propre a la maison (images et texte). Sans quoi la cle servirait a n'importe quoi.
//
// Qui peut appeler (plan D1, lot L17) : la session admin d'admin.php, ou un utilisateur de la
// plateforme par son jeton (`Authorization: Bearer`), verifie aupres de la plateforme elle-meme
// (`GET /api/v1/me/context`, `plateformeUrl` de la configuration) : son organisation (`tenant.id`)
// est celle du journal et des plafonds. Un utilisateur ne voit que `etat` et ses propres batches ;
// tarifs, plafonds et consommation restent a l'administrateur.
//
// Defenses : celles d'admin.php (en-tete `X-Plan-Admin: 1` sur toute ecriture, 404 partout sans
// configuration) ; seuls les batches crees ici se lisent, et par l'organisation qui les a crees ;
// ecriture atomique et `.bak` pour les JSON ; le journal ne fait que s'allonger, verrouille. Il ne
// garde ni photo ni contenu de reponse : les compteurs de `usage`, l'identite de la parcelle, et
// le cout calcule avec la table des tarifs en vigueur le jour de l'appel.
//
// L'appel se fait en HTTP direct (cURL, sinon les flux de PHP) : l'hebergement n'a pas Composer,
// et le SDK PHP d'Anthropic ne s'y installe pas.

declare(strict_types=1);

const VERSION_API = '2023-06-01';
const MODELES = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
const USAGES = ['analyse', 'escalade', 'renfort', 'immediat'];
const MODELE_PAR_USAGE = ['analyse' => 'claude-haiku-5-5', 'escalade' => 'claude-sonnet-5-5', 'renfort' => 'claude-haiku-5-5', 'immediat' => 'claude-haiku-5-5'];
// Le prompt et le schema de chaque usage : le renfort du calage et de la detection (lot L18) a les
// siens ; les autres usages lisent ceux de l'analyse d'une maison.
const FICHIERS_PAR_USAGE = ['renfort' => ['prompt-renfort.md', 'schema-renfort.json']];
const FICHIERS_DEFAUT = ['prompt-analyse.md', 'schema-analyse.json'];
// Un appel immediat (bouton « Demander de l'aide » du releve) : les trois passes d'une facade, pas plus.
const REQUETES_IMMEDIATES = 3;
// Assez pour la reflexion a l'effort `low` et le JSON avec indices (~1 500 attendus, spec-regles-toits 14.4).
const MAX_TOKENS = 8000;
const EFFORT = 'low';
const TAILLE_MAX = 48 * 1024 * 1024;
const ID_VALIDE = '/^[A-Za-z0-9_-]{1,64}$/';
const ID_BATCH = '/^[A-Za-z0-9_-]{1,128}$/';
const IMAGES_PAR_REQUETE = 40;
// Les facades qu'une requete couvre (journal, cout par facade du tableau de bord) : un compte, borne.
const FACADES_MAX = 200;
const PRODUIT_PLATEFORME = 'plan';
const PERMISSION_ANALYSE = 'projects.write';
const BLOCS_PAR_REQUETE = 120;
const TEXTE_MAX = 200000;
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PRIX = ['entree', 'ecritureCache5m', 'ecritureCache1h', 'lectureCache', 'sortie'];
// Ce qui vaut tant que l'administrateur n'a rien regle (buildsg/analyseAdmin.mjs, PLAFONDS_DEFAUT).
const PLAFONDS_DEFAUT = ['format' => 'plan-claude-plafonds', 'defaut' => ['jour' => 1, 'mois' => 10], 'organisations' => [], 'requetesParBatch' => 60, 'estimationRequete' => 0.005];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function repondre(int $statut, $corps = null): void {
    http_response_code($statut);
    if ($corps !== null && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }
    exit;
}

function erreur(int $statut, string $code, string $message, array $plus = []): void {
    repondre($statut, ['error' => ['code' => $code, 'message' => $message]] + $plus);
}

// --- La configuration (celle d'admin.php, cherchee aux memes endroits) -------------------------
$config = null;
$racineWeb = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
foreach ([getenv('PLAN_ADMIN_CONFIG') ?: null, $racineWeb !== '' ? dirname($racineWeb) . '/plan-admin-config.php' : null,
          dirname(__DIR__) . '/plan-admin-config.php', __DIR__ . '/admin-config.php'] as $f) {
    if ($f && is_file($f)) { $config = require $f; break; }
}
$motDePasse = is_array($config) ? (string)($config['motDePasse'] ?? '') : '';
if ($motDePasse === '' || $motDePasse === 'A-CHANGER') erreur(404, 'NOT_FOUND', 'Introuvable');
$cle = (string)($config['anthropicCle'] ?? '');
$avecCle = $cle !== '' && $cle !== 'A-CHANGER';
$anthropicUrl = rtrim((string)($config['anthropicUrl'] ?? 'https://api.anthropic.com'), '/');
$plateformeUrl = rtrim((string)($config['plateformeUrl'] ?? 'https://www.raillard.org'), '/');
$dossier = rtrim((string)($config['dossierDemos'] ?? (__DIR__ . '/demos')), '/');
$dossierAudits = $dossier . '/audits';
$dossierClaude = $dossier . '/claude';
$dossierBatches = $dossierClaude . '/batches';
if (!is_dir($dossierBatches) && !@mkdir($dossierBatches, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier claude/ impossible a creer (droits du dossier des demos).');

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$lecture = $methode === 'GET' || $methode === 'HEAD';
$chemin = trim((string)($_GET['chemin'] ?? ''), '/');
if (!$lecture && ($_SERVER['HTTP_X_PLAN_ADMIN'] ?? '') !== '1') erreur(403, 'FORBIDDEN', 'En-tete X-Plan-Admin manquant.');

// --- La session d'admin.php, lue sans etre ecrite -----------------------------------------------
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]) === 'https';
$cheminCookie = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/analyse.php'))), '/') . '/admin/';
session_name('plan_admin');
session_set_cookie_params(['lifetime' => 8 * 3600, 'path' => $cheminCookie, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', '1');
session_start(['read_and_close' => true]);
$sessionAdmin = isset($_SESSION['admin']) && is_int($_SESSION['admin']) && $_SESSION['admin'] > time();
// Les audits partages (`@audits`, lot L21) : leur retrait se fait aussi par le seul secret rendu a
// l'envoi ; leur route verifie elle-meme qui appelle.
$routeAudits = preg_match('#^@audits(/|$)#', $chemin) === 1;

/** Le jeton porteur de la plateforme, s'il y en a un ; Apache le passe parfois via REDIRECT_. */
function jetonPorteur(): ?string {
    $v = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    return preg_match('/^Bearer\s+([A-Za-z0-9._~+\/=-]{16,4096})$/', trim($v), $m) ? $m[1] : null;
}

// --- Le calcul, pur (buildsg/analyseAdmin.mjs, memes noms) ---------------------------------------

function nombre($v): bool { return (is_int($v) || is_float($v)) && is_finite((float)$v); }

/** Le prompt versionne : l'en-tete `---` porte `version:`, le reste part tel quel en system. */
function lirePrompt(string $texte): array {
    if (!preg_match('/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/', $texte, $m)) throw new RuntimeException('prompt-analyse.md : en-tete --- manquant');
    if (!preg_match('/^version:\s*(\d+)\s*$/m', $m[1], $v)) throw new RuntimeException('prompt-analyse.md : version manquante');
    return ['version' => (int)$v[1], 'texte' => trim(substr($texte, strlen($m[0])))];
}

/** Les compteurs de `usage`, tels que l'API les renvoie, sous les noms du journal. */
function tokensDeUsage($u): array {
    $u = is_array($u) ? $u : [];
    $n = fn($x) => nombre($x) && $x > 0 ? (int)round((float)$x) : 0;
    $ecriture = $n($u['cache_creation_input_tokens'] ?? null);
    $detail = is_array($u['cache_creation'] ?? null) ? $u['cache_creation'] : null;
    return [
        'entree' => $n($u['input_tokens'] ?? null),
        'ecritureCache' => $ecriture,
        // Sans detail, toute l'ecriture est au tarif 5 minutes : c'est la duree par defaut du cache.
        'ecritureCache1h' => min($ecriture, $detail ? $n($detail['ephemeral_1h_input_tokens'] ?? null) : 0),
        'lectureCache' => $n($u['cache_read_input_tokens'] ?? null),
        'sortie' => $n($u['output_tokens'] ?? null),
    ];
}

/** La ligne de tarif d'un modele en vigueur ce jour-la : la plus recente qui le precede. */
function tarifEnVigueur(array $tarifs, string $modele, string $jour): ?array {
    $retenu = null;
    foreach (($tarifs['lignes'] ?? []) as $l) {
        if (!is_array($l) || ($l['modele'] ?? null) !== $modele || !is_string($l['depuis'] ?? null) || $l['depuis'] > $jour) continue;
        if ($retenu === null || $l['depuis'] > $retenu['depuis']) $retenu = $l;
    }
    return $retenu;
}

/** Le cout en dollars : palier au-dela du seuil sur toute la requete, remise Batch sur chaque prix. */
function coutAppel(array $t, ?array $ligne, bool $batch): ?float {
    if ($ligne === null) return null;
    $prompt = $t['entree'] + $t['ecritureCache'] + $t['lectureCache'];
    $p = is_array($ligne['auDela'] ?? null) && nombre($ligne['auDela']['seuil'] ?? null) && $prompt > $ligne['auDela']['seuil'] ? $ligne['auDela'] : $ligne;
    $remise = $batch && nombre($ligne['remiseBatch'] ?? null) ? (float)$ligne['remiseBatch'] : 1.0;
    $somme = $t['entree'] * $p['entree']
        + ($t['ecritureCache'] - $t['ecritureCache1h']) * $p['ecritureCache5m']
        + $t['ecritureCache1h'] * $p['ecritureCache1h']
        + $t['lectureCache'] * $p['lectureCache']
        + $t['sortie'] * $p['sortie'];
    return round(($somme / 1e6) * $remise, 8);
}

/** Les depenses d'une organisation ce jour-la et ce mois-la. */
function depenses(array $lignes, string $organisation, string $jour): array {
    $j = 0.0; $m = 0.0;
    foreach ($lignes as $l) {
        if (!is_array($l) || ($l['organisation'] ?? null) !== $organisation || !nombre($l['cout'] ?? null) || !is_string($l['t'] ?? null)) continue;
        if (substr($l['t'], 0, 7) !== substr($jour, 0, 7)) continue;
        $m += $l['cout'];
        if (substr($l['t'], 0, 10) === $jour) $j += $l['cout'];
    }
    return ['jour' => round($j, 8), 'mois' => round($m, 8)];
}

function plafondDe(array $p, string $organisation): array {
    $o = $p['organisations'][$organisation] ?? null;
    return ['jour' => is_array($o) && nombre($o['jour'] ?? null) ? $o['jour'] : $p['defaut']['jour'],
            'mois' => is_array($o) && nombre($o['mois'] ?? null) ? $o['mois'] : $p['defaut']['mois']];
}

final class Refus extends Exception {}

function texteCourt($v, int $max) {
    if ($v === null) return null;
    if (is_string($v) && mb_strlen($v) <= $max) return $v;
    return false;
}

/** La demande de la page : identite de la parcelle et requetes. Seuls des blocs texte et image. */
function verifierDemande($d, array $plafonds): array {
    if (!is_array($d) || array_is_list($d)) throw new Refus('Demande illisible.');
    $meta = [];
    foreach (['projet' => 128, 'idu' => 64, 'adresse' => 300, 'audit' => 64] as $cle => $max) {
        $v = texteCourt($d[$cle] ?? null, $max);
        if ($v === false) throw new Refus('Champ « ' . $cle . ' » invalide.');
        $meta[$cle] = $v;
    }
    $usage = $d['usage'] ?? 'analyse';
    if (!in_array($usage, USAGES, true)) throw new Refus('Usage inconnu : ' . (is_string($usage) ? $usage : '?') . '.');
    $modele = $d['modele'] ?? MODELE_PAR_USAGE[$usage];
    if (!in_array($modele, MODELES, true)) throw new Refus('Modèle non admis : ' . (is_string($modele) ? $modele : '?') . '.');
    $rs = $d['requetes'] ?? null;
    if (!is_array($rs) || !array_is_list($rs) || count($rs) === 0) throw new Refus('Aucune requête.');
    if (count($rs) > $plafonds['requetesParBatch']) throw new Refus('Trop de requêtes dans un batch (' . $plafonds['requetesParBatch'] . ' au plus).');
    $vus = [];
    $requetes = [];
    foreach ($rs as $r) {
        if (!is_array($r) || !is_string($r['id'] ?? null) || !preg_match(ID_VALIDE, $r['id'])) throw new Refus('Identifiant de requête invalide.');
        if (isset($vus[$r['id']])) throw new Refus('Identifiant de requête en double : ' . $r['id'] . '.');
        $vus[$r['id']] = true;
        $passe = $r['passe'] ?? null;
        if ($passe !== null && !(is_int($passe) && $passe >= 1 && $passe <= 3)) throw new Refus('Passe invalide (1, 2 ou 3).');
        $blocs = $r['contenu'] ?? null;
        if (!is_array($blocs) || !array_is_list($blocs) || count($blocs) === 0 || count($blocs) > BLOCS_PAR_REQUETE) throw new Refus('Contenu de requête invalide.');
        $images = 0;
        $contenu = [];
        foreach ($blocs as $b) {
            if (is_array($b) && ($b['type'] ?? null) === 'text' && is_string($b['text'] ?? null) && $b['text'] !== '' && mb_strlen($b['text']) <= TEXTE_MAX) {
                $contenu[] = ['type' => 'text', 'text' => $b['text']];
                continue;
            }
            $s = is_array($b) && ($b['type'] ?? null) === 'image' && is_array($b['source'] ?? null) ? $b['source'] : null;
            if ($s && ($s['type'] ?? null) === 'base64' && in_array($s['media_type'] ?? null, TYPES_IMAGE, true) && is_string($s['data'] ?? null) && preg_match('#^[A-Za-z0-9+/]+={0,2}$#', $s['data'])) {
                $images++;
                $contenu[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $s['media_type'], 'data' => $s['data']]];
                continue;
            }
            throw new Refus('Bloc de contenu non admis (texte ou image base64 seulement).');
        }
        if ($images > IMAGES_PAR_REQUETE) throw new Refus('Trop d’images dans une requête (' . IMAGES_PAR_REQUETE . ' au plus).');
        $facades = $r['facades'] ?? 0;
        if (!is_int($facades) || $facades < 0 || $facades > FACADES_MAX) throw new Refus('Nombre de façades invalide.');
        // Une requete peut porter son usage (le renfort d'une facade dans le batch de l'analyse) :
        // son prompt, son schema et son modele sont alors les siens.
        $usageR = $r['usage'] ?? $usage;
        if (!in_array($usageR, USAGES, true)) throw new Refus('Usage inconnu : ' . (is_string($usageR) ? $usageR : '?') . '.');
        $modeleR = isset($d['modele']) ? $modele : MODELE_PAR_USAGE[$usageR];
        $requetes[] = ['id' => $r['id'], 'passe' => $passe, 'images' => $images, 'facades' => $facades, 'usage' => $usageR, 'modele' => $modeleR, 'contenu' => $contenu];
    }
    return $meta + ['usage' => $usage, 'modele' => $modele, 'requetes' => $requetes];
}

/** Les parametres d'une requete du batch : le prompt en cache, la sortie structuree, l'effort. */
function parametresRequete(string $modele, string $prompt, $schema, array $contenu): array {
    return [
        'model' => $modele,
        'max_tokens' => MAX_TOKENS,
        'system' => [['type' => 'text', 'text' => $prompt, 'cache_control' => ['type' => 'ephemeral']]],
        'messages' => [['role' => 'user', 'content' => $contenu]],
        'output_config' => ['effort' => EFFORT, 'format' => ['type' => 'json_schema', 'schema' => $schema]],
    ];
}

function prixValides($o): bool {
    if (!is_array($o)) return false;
    foreach (PRIX as $k) if (!nombre($o[$k] ?? null) || $o[$k] < 0) return false;
    return true;
}

function verifierTarifs($d): array {
    $msg = 'Ce n’est pas une table des tarifs (format, lignes datées, prix positifs).';
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-claude-tarifs' || !is_array($d['lignes'] ?? null) || !array_is_list($d['lignes'])) throw new Refus($msg);
    foreach ($d['lignes'] as $l) {
        if (!is_array($l) || !is_string($l['modele'] ?? null) || !preg_match('/^claude-[a-z0-9-]{1,60}$/', $l['modele'])
            || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($l['depuis'] ?? '')) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($l['verifieLe'] ?? ''))) throw new Refus($msg);
        if (!prixValides($l) || !(nombre($l['remiseBatch'] ?? null) && $l['remiseBatch'] > 0 && $l['remiseBatch'] <= 1)) throw new Refus($msg);
        if (array_key_exists('auDela', $l) && !(is_array($l['auDela']) && is_int($l['auDela']['seuil'] ?? null) && $l['auDela']['seuil'] > 0 && prixValides($l['auDela']))) throw new Refus($msg);
    }
    return $d;
}

/** Les lignes passees ne se reecrivent pas : chacune doit revenir a l'identique. */
function passeGarde(array $ancien, array $nouveau, string $jour): bool {
    $signe = function (array $l): string {
        $v = [];
        foreach (PRIX as $k) $v[] = (float)$l[$k];
        $v[] = (float)$l['remiseBatch'];
        if (is_array($l['auDela'] ?? null)) { $v[] = (float)$l['auDela']['seuil']; foreach (PRIX as $k) $v[] = (float)$l['auDela'][$k]; }
        return json_encode($v);
    };
    $nouvelles = [];
    foreach ($nouveau['lignes'] as $l) $nouvelles[$l['modele'] . '@' . $l['depuis']] = $signe($l);
    foreach (($ancien['lignes'] ?? []) as $l) {
        if (!is_array($l) || ($l['depuis'] ?? '') > $jour) continue;
        if (($nouvelles[$l['modele'] . '@' . $l['depuis']] ?? null) !== $signe($l)) return false;
    }
    return true;
}

function verifierPlafonds($d): array {
    $msg = 'Ce ne sont pas des plafonds (format, montants par jour et par mois).';
    $paire = fn($o) => is_array($o) && nombre($o['jour'] ?? null) && $o['jour'] >= 0 && nombre($o['mois'] ?? null) && $o['mois'] >= 0;
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-claude-plafonds' || !$paire($d['defaut'] ?? null) || !is_array($d['organisations'] ?? null)) throw new Refus($msg);
    foreach ($d['organisations'] as $id => $o) if (!preg_match(ID_VALIDE, (string)$id) || !$paire($o)) throw new Refus($msg);
    if (!(is_int($d['requetesParBatch'] ?? null) && $d['requetesParBatch'] >= 1 && $d['requetesParBatch'] <= 1000)) throw new Refus($msg);
    if (!(nombre($d['estimationRequete'] ?? null) && $d['estimationRequete'] >= 0)) throw new Refus($msg);
    return $d;
}

// --- Le tableau de bord de la consommation (13.3, lot L16 bis ; buildsg/analyseAdmin.mjs, memes noms)

// Le journal est garde 24 mois : une periode n'en demande pas plus (25 fichiers mensuels au plus).
const MOIS_CONSULTABLES = 25;
const CHAMPS_CONSOMMATION = ['t', 'organisation', 'projet', 'idu', 'adresse', 'audit', 'usage', 'modele', 'batch', 'passe', 'tokens', 'images', 'facades', 'cout', 'statut'];

function jourValide($j): bool {
    if (!is_string($j) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $j, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/** Un jour (`AAAA-MM-JJ`) decale de `n` jours, en UTC. */
function decalerJour(string $jour, int $n): string {
    return gmdate('Y-m-d', (int)strtotime($jour . 'T00:00:00Z') + $n * 86400);
}

/** Les mois (`AAAA-MM`) d'une periode, dans l'ordre : un fichier de journal par mois. */
function moisEntre(string $du, string $au): array {
    $mois = [];
    $fin = (int)substr($au, 0, 4) * 12 + (int)substr($au, 5, 2) - 1;
    for ($k = (int)substr($du, 0, 4) * 12 + (int)substr($du, 5, 2) - 1; $k <= $fin; $k++) {
        $mois[] = sprintf('%04d-%02d', intdiv($k, 12), $k % 12 + 1);
    }
    return $mois;
}

/** Les filtres de `GET admin/consommation` ; un filtre mal forme est refuse net, jamais ignore. */
function lireFiltres(array $params, string $aujourdhui): array {
    $au = (string)($params['au'] ?? '') !== '' ? (string)$params['au'] : $aujourdhui;
    $du = (string)($params['du'] ?? '') !== '' ? (string)$params['du'] : (jourValide($au) ? decalerJour($au, -29) : '');
    if (!jourValide($du) || !jourValide($au) || $du > $au) throw new Refus('Période invalide (du et au en AAAA-MM-JJ, du avant au).');
    if (count(moisEntre($du, $au)) > MOIS_CONSULTABLES) throw new Refus('Période trop longue (le journal est gardé 24 mois).');
    $f = ['du' => $du, 'au' => $au, 'organisation' => null, 'modele' => null, 'usage' => null, 'parcelle' => null];
    foreach (['organisation' => ID_VALIDE, 'modele' => '/^claude-[a-z0-9-]{1,60}$/', 'usage' => '/^[a-z]{1,20}$/', 'parcelle' => ID_VALIDE] as $cle => $motif) {
        $v = $params[$cle] ?? null;
        if ($v === null || $v === '') continue;
        if (!is_string($v) || !preg_match($motif, $v)) throw new Refus('Filtre « ' . $cle . ' » invalide.');
        $f[$cle] = $v;
    }
    return $f;
}

/** Les lignes de la periode qui passent les filtres, reduites aux champs du tableau de bord. */
function filtrerConsommation(array $lignes, array $f): array {
    $sortie = [];
    foreach ($lignes as $l) {
        if (!is_array($l) || !is_string($l['t'] ?? null)) continue;
        $j = substr($l['t'], 0, 10);
        if ($j < $f['du'] || $j > $f['au']) continue;
        foreach (['organisation' => 'organisation', 'modele' => 'modele', 'usage' => 'usage', 'parcelle' => 'idu'] as $filtre => $champ) {
            if (($f[$filtre] ?? null) !== null && ($l[$champ] ?? null) !== $f[$filtre]) continue 2;
        }
        $r = [];
        foreach (CHAMPS_CONSOMMATION as $k) $r[$k] = $l[$k] ?? null;
        $sortie[] = $r;
    }
    return $sortie;
}

function chainesDe(array $lignes, string $k): array {
    $v = [];
    foreach ($lignes as $l) if (is_array($l) && is_string($l[$k] ?? null) && $l[$k] !== '') $v[] = $l[$k];
    return $v;
}

function organisationsConnues(array $lignes, array $p): array {
    $ids = array_values(array_unique(array_merge(['admin'], array_map('strval', array_keys($p['organisations'] ?? [])), chainesDe($lignes, 'organisation'))));
    sort($ids, SORT_STRING);
    return $ids;
}

/** Chaque organisation connue (plafonds ou journal du mois) : ses depenses du jour et du mois, ses plafonds. */
function etatOrganisations(array $lignesDuMois, array $p, string $jour): array {
    $etats = [];
    foreach (organisationsConnues($lignesDuMois, $p) as $id) $etats[] = ['id' => $id] + depenses($lignesDuMois, $id, $jour) + ['plafond' => plafondDe($p, $id)];
    return $etats;
}

/** De quoi remplir les listes des filtres : ce que la periode contient, avant filtre. */
function choixConsommation(array $lignes, array $p): array {
    $parcelles = [];
    foreach ($lignes as $l) {
        if (is_array($l) && is_string($l['idu'] ?? null) && $l['idu'] !== '' && !array_key_exists($l['idu'], $parcelles)) {
            $parcelles[$l['idu']] = is_string($l['adresse'] ?? null) ? $l['adresse'] : null;
        }
    }
    ksort($parcelles, SORT_STRING);
    $liste = [];
    foreach ($parcelles as $idu => $adresse) $liste[] = ['idu' => (string)$idu, 'adresse' => $adresse];
    return [
        'organisations' => organisationsConnues($lignes, $p),
        'modeles' => array_values(array_unique(array_merge(MODELES, chainesDe($lignes, 'modele')))),
        'usages' => array_values(array_unique(array_merge(USAGES, chainesDe($lignes, 'usage')))),
        'parcelles' => $liste,
    ];
}

/** Ce qu'une ligne de resultats d'Anthropic devient : pour la page, et pour le journal. */
function lireResultat($ligne): array {
    $r = is_object($ligne) && isset($ligne->result) && is_object($ligne->result) ? $ligne->result : new stdClass();
    $type = $r->type ?? '';
    $statut = ['succeeded' => 'reussi', 'errored' => 'echoue', 'expired' => 'expire', 'canceled' => 'annule'][$type] ?? 'echoue';
    $message = $type === 'succeeded' && isset($r->message) && is_object($r->message) ? $r->message : null;
    // `usage` se relit en tableau : les compteurs, rien d'autre.
    $tokens = tokensDeUsage($message && isset($message->usage) ? json_decode(json_encode($message->usage), true) : null);
    $sortie = null;
    $erreur = null;
    if ($message) {
        $texte = null;
        foreach ((is_array($message->content ?? null) ? $message->content : []) as $b) {
            if (is_object($b) && ($b->type ?? null) === 'text') { $texte = (string)($b->text ?? ''); break; }
        }
        $arret = $message->stop_reason ?? null;
        if ($arret === 'refusal') $erreur = ['type' => 'refusal', 'message' => 'Analyse refusée par le modèle.'];
        elseif ($arret === 'max_tokens') $erreur = ['type' => 'max_tokens', 'message' => 'Réponse coupée (max_tokens).'];
        else {
            // En objets, pas en tableaux : la sortie revient a la page telle que Claude l'a ecrite.
            $sortie = $texte === null ? null : json_decode($texte);
            if ($sortie === null) $erreur = ['type' => 'sortie_illisible', 'message' => 'Sortie non JSON.'];
        }
    } elseif ($type === 'errored') {
        $e = isset($r->error->error) && is_object($r->error->error) ? $r->error->error : ($r->error ?? new stdClass());
        $erreur = ['type' => (string)($e->type ?? 'erreur'), 'message' => mb_substr((string)($e->message ?? ''), 0, 300)];
    }
    return ['id' => (string)($ligne->custom_id ?? ''), 'statut' => $statut, 'arret' => $message ? ($message->stop_reason ?? null) : null,
            'tokens' => $tokens, 'sortie' => $sortie, 'erreur' => $erreur];
}

// --- Les fichiers -------------------------------------------------------------------------------

function maintenant(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

function lireJson(string $f): ?array {
    $d = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($d) ? $d : null;
}

/** Ecriture atomique, version precedente gardee en `.bak` : jamais de demi-fichier. */
function ecrireJson(string $f, $d): void {
    if (!is_dir(dirname($f))) @mkdir(dirname($f), 0750, true);
    if (is_file($f)) copy($f, $f . '.bak');
    $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $texte = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if ($texte === false || file_put_contents($tmp, $texte . "\n") === false || !rename($tmp, $f)) {
        @unlink($tmp);
        erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    }
}

/** La table des tarifs : la premiere lecture pose celle livree avec Plan. */
function tarifs(string $dossierClaude): array {
    $f = $dossierClaude . '/tarifs.json';
    $t = lireJson($f);
    if ($t !== null) return $t;
    $livree = lireJson(__DIR__ . '/claude-tarifs.json');
    if ($livree === null) erreur(500, 'SERVER_ERROR', 'claude-tarifs.json absent a cote d’analyse.php.');
    ecrireJson($f, $livree);
    return $livree;
}

/** Les plafonds ; `organisations` reste un objet en JSON, meme vide. */
function plafonds(string $dossierClaude): array {
    return lireJson($dossierClaude . '/plafonds.json') ?? PLAFONDS_DEFAUT;
}
function plafondsJson(array $p): array { $p['organisations'] = (object)$p['organisations']; return $p; }

function fJournal(string $dossierClaude, string $t): string { return $dossierClaude . '/journal-' . substr($t, 0, 7) . '.jsonl'; }

/** Une ligne par appel, ajoutee d'un seul trait et verrouillee : le journal ne se reecrit jamais. */
function journaliser(string $dossierClaude, array $lignes): void {
    $parFichier = [];
    foreach ($lignes as $l) {
        $f = fJournal($dossierClaude, $l['t']);
        $parFichier[$f] = ($parFichier[$f] ?? '') . json_encode($l, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION) . "\n";
    }
    foreach ($parFichier as $f => $texte) {
        if (file_put_contents($f, $texte, FILE_APPEND | LOCK_EX) === false) erreur(500, 'SERVER_ERROR', 'Journal impossible a ecrire.');
    }
}

function lireJournal(string $dossierClaude, string $t): array {
    $f = fJournal($dossierClaude, $t);
    if (!is_file($f)) return [];
    $lignes = [];
    foreach (explode("\n", (string)file_get_contents($f)) as $l) {
        if (trim($l) === '') continue;
        $d = json_decode($l, true);
        if (is_array($d)) $lignes[] = $d;
    }
    return $lignes;
}

function promptEtSchema(string $usage = 'analyse'): array {
    [$fPrompt, $fSchema] = FICHIERS_PAR_USAGE[$usage] ?? FICHIERS_DEFAUT;
    $prompt = lirePrompt((string)@file_get_contents(__DIR__ . '/' . $fPrompt));
    // Le schema en objets : `{}` et `[]` doivent repartir tels quels vers l'API.
    $s = json_decode((string)@file_get_contents(__DIR__ . '/' . $fSchema));
    if (!is_object($s) || !isset($s->schema)) throw new RuntimeException($fSchema . ' illisible');
    return [$prompt, ['version' => (int)$s->version, 'schema' => $s->schema]];
}

/** Le prompt et le schema de chaque usage des requetes, lus une fois. */
function promptsDesRequetes(array $requetes): array {
    $par = [];
    foreach ($requetes as $r) if (!isset($par[$r['usage']])) $par[$r['usage']] = promptEtSchema($r['usage']);
    return $par;
}

/** Un appel HTTP : [statut, texte]. Statut 0 si le serveur est injoignable. */
function appelHttp(string $methode, string $url, array $entetes, ?string $corps = null): array {
    if ($corps !== null) $entetes[] = 'content-type: application/json';
    if (function_exists('curl_init')) {
        $h = curl_init($url);
        curl_setopt_array($h, [CURLOPT_CUSTOMREQUEST => $methode, CURLOPT_HTTPHEADER => $entetes, CURLOPT_RETURNTRANSFER => true,
                               CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 120]);
        if ($corps !== null) curl_setopt($h, CURLOPT_POSTFIELDS, $corps);
        $texte = curl_exec($h);
        $statut = (int)curl_getinfo($h, CURLINFO_HTTP_CODE);
        curl_close($h);
        return [$texte === false ? 0 : $statut, $texte === false ? '' : (string)$texte];
    }
    $contexte = stream_context_create(['http' => ['method' => $methode, 'header' => implode("\r\n", $entetes), 'content' => $corps ?? '',
                                                  'ignore_errors' => true, 'timeout' => 120]]);
    $texte = @file_get_contents($url, false, $contexte);
    $statut = 0;
    foreach ($http_response_header ?? [] as $l) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $l, $m)) $statut = (int)$m[1];
    return [$texte === false ? 0 : $statut, $texte === false ? '' : (string)$texte];
}

/** Un appel a l'API d'Anthropic : [statut, texte]. */
function anthropic(string $methode, string $chemin, ?string $corps = null): array {
    global $anthropicUrl, $cle;
    return appelHttp($methode, $anthropicUrl . $chemin, ['x-api-key: ' . $cle, 'anthropic-version: ' . VERSION_API], $corps);
}

/**
 * Qui appelle : l'administrateur (session d'admin.php), ou un utilisateur de la plateforme, dont le
 * jeton est verifie aupres d'elle a chaque appel (`/me/context`, spec-connexion-plateforme 3.4) : la
 * plateforme seule sait s'il vaut encore, et son organisation est celle qui paie l'analyse.
 */
function acteur(bool $sessionAdmin, ?string $jeton, string $plateformeUrl): array {
    if ($sessionAdmin) return ['admin' => true, 'organisation' => 'admin'];
    if ($jeton === null) erreur(401, 'UNAUTHENTICATED', 'Mot de passe ou jeton de la plateforme requis.');
    [$statut, $texte] = appelHttp('GET', $plateformeUrl . '/api/v1/me/context', ['Authorization: Bearer ' . $jeton, 'X-Product: ' . PRODUIT_PLATEFORME, 'Accept: application/json']);
    if ($statut === 0) erreur(502, 'UPSTREAM', 'Plateforme injoignable.');
    if ($statut === 401) erreur(401, 'UNAUTHENTICATED', 'Jeton de la plateforme refusé.');
    if ($statut !== 200) erreur(403, 'FORBIDDEN', 'Ce compte ne tient pas Plan (' . $statut . ').');
    $c = json_decode($texte, true);
    $org = is_array($c) && is_array($c['tenant'] ?? null) ? (string)($c['tenant']['id'] ?? '') : '';
    if (!preg_match(ID_VALIDE, $org) || $org === 'admin') erreur(502, 'UPSTREAM', 'Réponse de la plateforme illisible.');
    $permissions = is_array($c['permissions'] ?? null) ? $c['permissions'] : [];
    if (!in_array(PERMISSION_ANALYSE, $permissions, true)) erreur(403, 'FORBIDDEN', 'Le droit d’écrire les projets est requis pour lancer une analyse.');
    return ['admin' => false, 'organisation' => $org];
}

// --- Les audits partages pour le corpus (spec-audit 15, lot L21 ; buildsg/analyseAdmin.mjs, memes noms)
// Deposer passe par `acteur` : la session admin, ou le jeton d'un compte qui peut ecrire les projets
// (l'audit de la parcelle demande deja ce droit).

const ID_AUDIT = '/^\d{8}-\d{6}-[0-9a-f]{8}$/';
// L'IDU d'une parcelle, ou son point de calage (`48.900000,2.130000`) pour un plan sans IDU.
const IDU_AUDIT = '/^[A-Za-z0-9_.,-]{1,64}$/';

/** Ce que le serveur verifie d'un audit : sa forme, pas son contenu (la page le relit en entier). */
function verifierAudit($d): array {
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-audit-parcelle') throw new Refus('Ce n’est pas un fichier d’audit de parcelle.');
    if (($d['version'] ?? null) !== 1) throw new Refus('Version du fichier d’audit inconnue.');
    $p = $d['parcelle'] ?? null;
    if (!is_array($p) || !is_string($p['idu'] ?? null) || !preg_match(IDU_AUDIT, $p['idu'])) throw new Refus('Parcelle du fichier d’audit invalide.');
    if (!is_array($d['batiments'] ?? null) || !is_array($d['propositions'] ?? null)) throw new Refus('Fichier d’audit incomplet.');
    $adresse = is_string($p['adresse'] ?? null) ? mb_substr($p['adresse'], 0, 300) : null;
    return ['idu' => $p['idu'], 'adresse' => $adresse];
}

function fAudit(string $dossierAudits, string $id): string { return $dossierAudits . '/' . $id . '.json'; }
function fFicheAudit(string $dossierAudits, string $id): string { return $dossierAudits . '/' . $id . '.fiche.json'; }

/** Les fiches des audits recus, les plus recents d'abord, sans l'empreinte du secret. */
function listeAudits(string $dossierAudits): array {
    $liste = [];
    foreach (glob($dossierAudits . '/*.fiche.json') ?: [] as $f) {
        $fiche = lireJson($f);
        if ($fiche === null) continue;
        unset($fiche['retrait']);
        $liste[] = $fiche;
    }
    usort($liste, fn($a, $b) => strcmp((string)($b['recuLe'] ?? ''), (string)($a['recuLe'] ?? '')));
    return $liste;
}

function messageApi(string $texte): string {
    $d = json_decode($texte, true);
    return is_array($d) && isset($d['error']['message']) ? (string)$d['error']['message'] : mb_substr($texte, 0, 200);
}

function vueBatch(array $b): array {
    return ['id' => $b['id'] ?? null, 'etat' => $b['processing_status'] ?? null, 'compte' => $b['request_counts'] ?? null,
            'creeLe' => $b['created_at'] ?? null, 'finLe' => $b['ended_at'] ?? null, 'expireLe' => $b['expires_at'] ?? null];
}

function fBatch(string $dossierBatches, string $id): string { return $dossierBatches . '/' . $id . '.json'; }

/** La fiche d'un batch, `requetes` toujours en objet (un identifiant « 0 » ferait une liste). */
function ecrireFiche(string $dossierBatches, array $fiche): void {
    $fiche['requetes'] = (object)$fiche['requetes'];
    ecrireJson(fBatch($dossierBatches, $fiche['id']), $fiche);
}

/**
 * Les resultats d'un batch termine ; le journal les recoit une fois, a la premiere lecture. La
 * fiche est verrouillee le temps de le faire : deux lectures simultanees ne journalisent pas deux fois.
 */
function resultats(string $dossierClaude, string $dossierBatches, array $fiche): array {
    [$statut, $texte] = anthropic('GET', '/v1/messages/batches/' . rawurlencode($fiche['id']) . '/results');
    if ($statut !== 200) return ['erreur' => [$statut, $texte]];
    $lus = [];
    foreach (explode("\n", $texte) as $l) {
        if (trim($l) === '') continue;
        $lus[] = lireResultat(json_decode($l));
    }
    $fin = is_string($fiche['finLe'] ?? null) ? strtotime($fiche['finLe']) : false;
    $t = $fin !== false ? gmdate('Y-m-d\TH:i:s\Z', $fin) : maintenant();
    $table = tarifs($dossierClaude);
    $sortie = [];
    foreach ($lus as $x) {
        $req = $fiche['requetes'][$x['id']] ?? ['passe' => null, 'images' => 0, 'facades' => 0];
        // Une requete du renfort dans le batch de l'analyse a son usage, son modele, son prompt et son schema.
        $modeleR = (string)($req['modele'] ?? $fiche['modele']);
        $ligneTarif = tarifEnVigueur($table, $modeleR, substr($t, 0, 10));
        $sortie[] = $x + ['passe' => $req['passe'], 'usage' => (string)($req['usage'] ?? $fiche['usage']), 'modele' => $modeleR, 'cout' => coutAppel($x['tokens'], $ligneTarif, true),
                          'tarif' => $ligneTarif['depuis'] ?? null, 'images' => $req['images'], 'facades' => (int)($req['facades'] ?? 0),
                          'prompt' => (int)($req['prompt'] ?? $fiche['promptVersion']), 'schema' => (int)($req['schema'] ?? $fiche['schemaVersion'])];
    }
    $verrou = fopen(fBatch($dossierBatches, $fiche['id']) . '.verrou', 'c');
    if ($verrou) flock($verrou, LOCK_EX);
    $actuelle = lireJson(fBatch($dossierBatches, $fiche['id'])) ?? $fiche;
    if (empty($actuelle['journalise'])) {
        $lignes = [];
        foreach ($sortie as $x) {
            $lignes[] = ['t' => $t, 'organisation' => $fiche['organisation'], 'projet' => $fiche['projet'], 'idu' => $fiche['idu'],
                         'adresse' => $fiche['adresse'], 'audit' => $fiche['audit'], 'usage' => $x['usage'], 'modele' => $x['modele'],
                         'batch' => true, 'idBatch' => $fiche['id'], 'requete' => $x['id'], 'passe' => $x['passe'], 'tokens' => $x['tokens'],
                         'images' => $x['images'], 'facades' => $x['facades'], 'cout' => $x['cout'], 'tarif' => $x['tarif'], 'statut' => $x['statut'],
                         'arret' => $x['arret'], 'prompt' => $x['prompt'], 'schema' => $x['schema']];
        }
        journaliser($dossierClaude, $lignes);
        ecrireFiche($dossierBatches, ['journalise' => true, 'etat' => 'ended', 'finLe' => $fiche['finLe'] ?? null] + $actuelle);
    }
    if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
    foreach ($sortie as &$x) { unset($x['images'], $x['facades'], $x['tarif'], $x['modele'], $x['prompt'], $x['schema']); }
    unset($x);
    return ['sortie' => $sortie];
}

/** Les requetes des batches encore ouverts d'une organisation ; ceux finis sont journalises en passant. */
function engagements(string $dossierClaude, string $dossierBatches, string $organisation, bool $avecCle): int {
    $ouverts = 0;
    foreach (scandir($dossierBatches) ?: [] as $n) {
        if (!str_ends_with($n, '.json')) continue;
        $fiche = lireJson($dossierBatches . '/' . $n);
        if ($fiche === null || !empty($fiche['journalise']) || ($fiche['organisation'] ?? null) !== $organisation) continue;
        if ($avecCle) {
            [$statut, $texte] = anthropic('GET', '/v1/messages/batches/' . rawurlencode((string)$fiche['id']));
            $b = $statut === 200 ? json_decode($texte, true) : null;
            if (is_array($b) && ($b['processing_status'] ?? null) === 'ended') {
                $lu = resultats($dossierClaude, $dossierBatches, ['finLe' => $b['ended_at'] ?? null] + $fiche);
                if (!isset($lu['erreur'])) continue;
            }
        }
        $ouverts += count($fiche['requetes'] ?? []);
    }
    return $ouverts;
}

/**
 * Les appels immediats a l'API Messages, en parallele quand cURL est la (trois passes en une
 * dizaine de secondes, pas trente) : pour chaque requete, une ligne au format des resultats d'un
 * batch, que `lireResultat` lit comme les autres.
 */
function appelsImmediats(array $corpsParId): array {
    global $anthropicUrl, $cle;
    $entetes = ['x-api-key: ' . $cle, 'anthropic-version: ' . VERSION_API, 'content-type: application/json'];
    $bruts = [];
    if (function_exists('curl_multi_init')) {
        $multi = curl_multi_init();
        $poignees = [];
        foreach ($corpsParId as $id => $corps) {
            $h = curl_init($anthropicUrl . '/v1/messages');
            curl_setopt_array($h, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => $entetes, CURLOPT_RETURNTRANSFER => true, CURLOPT_POSTFIELDS => $corps,
                                   CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 120]);
            curl_multi_add_handle($multi, $h);
            $poignees[$id] = $h;
        }
        do {
            $etat = curl_multi_exec($multi, $actifs);
            if ($actifs) curl_multi_select($multi, 1.0);
        } while ($actifs && $etat === CURLM_OK);
        foreach ($poignees as $id => $h) {
            $texte = curl_multi_getcontent($h);
            $bruts[$id] = [(int)curl_getinfo($h, CURLINFO_HTTP_CODE), is_string($texte) ? $texte : ''];
            curl_multi_remove_handle($multi, $h);
            curl_close($h);
        }
        curl_multi_close($multi);
    } else {
        foreach ($corpsParId as $id => $corps) $bruts[$id] = anthropic('POST', '/v1/messages', $corps);
    }
    $lignes = [];
    foreach ($bruts as $id => [$statut, $texte]) {
        $m = json_decode($texte);
        if ($statut === 200 && is_object($m)) {
            $lignes[$id] = (object)['custom_id' => (string)$id, 'result' => (object)['type' => 'succeeded', 'message' => $m]];
            continue;
        }
        $e = is_object($m) && isset($m->error) && is_object($m->error) ? $m->error : (object)['type' => $statut === 0 ? 'reseau' : 'http-' . $statut, 'message' => mb_substr($texte, 0, 200)];
        $lignes[$id] = (object)['custom_id' => (string)$id, 'result' => (object)['type' => 'errored', 'error' => (object)['type' => 'error', 'error' => $e]]];
    }
    return $lignes;
}

/**
 * L'appel immediat (le bouton « Demander de l'aide » du releve, spec facades 12 bis) : les memes
 * plafonds qu'un batch, l'API Messages au tarif normal (sans la remise Batch), une ligne de journal
 * par requete, et la reponse au format des resultats d'un batch.
 */
function appelImmediat(string $dossierClaude, string $dossierBatches, array $demande, string $organisation, bool $admin, bool $avecCle, array $p): array {
    $t = maintenant();
    $identite = ['organisation' => $organisation, 'projet' => $demande['projet'] ?? ($admin ? 'admin' : null), 'idu' => $demande['idu'], 'adresse' => $demande['adresse'], 'audit' => $demande['audit']];
    $prompts = promptsDesRequetes($demande['requetes']);
    $premier = $demande['requetes'][0];
    [$p0, $s0] = $prompts[$premier['usage']];
    $ouverts = engagements($dossierClaude, $dossierBatches, $organisation, $avecCle);
    $fait = depenses(lireJournal($dossierClaude, $t), $organisation, substr($t, 0, 10));
    $engage = ($ouverts + count($demande['requetes'])) * $p['estimationRequete'];
    $plafond = plafondDe($p, $organisation);
    if ($fait['jour'] + $engage > $plafond['jour'] || $fait['mois'] + $engage > $plafond['mois']) {
        journaliser($dossierClaude, [['t' => $t] + $identite + ['usage' => $demande['usage'], 'modele' => $premier['modele'], 'batch' => false, 'idBatch' => null, 'requete' => null,
            'passe' => null, 'tokens' => tokensDeUsage(null), 'images' => array_sum(array_column($demande['requetes'], 'images')), 'facades' => 0, 'cout' => 0, 'tarif' => null,
            'statut' => 'plafond', 'arret' => null, 'prompt' => $p0['version'], 'schema' => $s0['version']]]);
        erreur(429, 'BUDGET_EXCEEDED', 'Plafond de l’analyse atteint pour aujourd’hui ou ce mois-ci.', ['depense' => $fait, 'engage' => $engage, 'plafond' => $plafond]);
    }
    $corps = [];
    foreach ($demande['requetes'] as $r) {
        [$pR, $sR] = $prompts[$r['usage']];
        $corps[$r['id']] = (string)json_encode(parametresRequete($r['modele'], $pR['texte'], $sR['schema'], $r['contenu']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    $lignesApi = appelsImmediats($corps);
    $table = tarifs($dossierClaude);
    $journal = [];
    $resultats = [];
    foreach ($demande['requetes'] as $r) {
        $x = lireResultat($lignesApi[$r['id']] ?? null);
        $ligneTarif = tarifEnVigueur($table, $r['modele'], substr($t, 0, 10));
        $cout = coutAppel($x['tokens'], $ligneTarif, false);
        [$pR, $sR] = $prompts[$r['usage']];
        $journal[] = ['t' => $t] + $identite + ['usage' => $r['usage'], 'modele' => $r['modele'], 'batch' => false, 'idBatch' => null, 'requete' => $r['id'], 'passe' => $r['passe'],
            'tokens' => $x['tokens'], 'images' => $r['images'], 'facades' => $r['facades'], 'cout' => $cout, 'tarif' => $ligneTarif['depuis'] ?? null, 'statut' => $x['statut'],
            'arret' => $x['arret'], 'prompt' => $pR['version'], 'schema' => $sR['version']];
        $resultats[] = ['id' => $r['id'], 'statut' => $x['statut'], 'arret' => $x['arret'], 'tokens' => $x['tokens'], 'sortie' => $x['sortie'], 'erreur' => $x['erreur'],
                        'passe' => $r['passe'], 'usage' => $r['usage'], 'cout' => $cout];
    }
    journaliser($dossierClaude, $journal);
    return ['modele' => $premier['modele'], 'prompt' => $p0['version'], 'schema' => $s0['version'], 'resultats' => $resultats];
}

function lireCorps(int $max) {
    $texte = (string)file_get_contents('php://input', false, null, 0, $max + 1);
    if (strlen($texte) > $max) erreur(413, 'TOO_LARGE', 'Demande trop grosse (48 Mo au plus).');
    $d = json_decode($texte, true);
    if ($d === null) throw new Refus('JSON illisible.');
    return $d;
}

$sansCle = fn() => erreur(503, 'NOT_CONFIGURED', 'Clé Anthropic absente : anthropicCle dans plan-admin-config.php.');

// --- Les routes ---------------------------------------------------------------------------------
try {
    // `admin/audits` (.htaccess : `chemin=@audits/<id>`) : les audits de parcelle partages (15, L21).
    if ($routeAudits) {
        $id = trim(substr($chemin, strlen('@audits')), '/');
        if ($id === '') {
            if ($lecture) {
                if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
                repondre(200, ['audits' => listeAudits($dossierAudits)]);
            }
            if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
            $organisation = acteur($sessionAdmin, jetonPorteur(), $plateformeUrl)['organisation'];
            $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
            if (strlen($texte) > TAILLE_MAX) erreur(413, 'TOO_LARGE', 'Fichier d’audit trop gros (48 Mo au plus).');
            $d = json_decode($texte, true);
            if ($d === null) throw new Refus('JSON illisible.');
            $parcelle = verifierAudit($d);
            if (!is_dir($dossierAudits) && !@mkdir($dossierAudits, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier audits/ impossible a creer.');
            $t = maintenant();
            $id = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
            $retrait = bin2hex(random_bytes(24));
            // Le fichier tel qu'il est arrive : le corpus le rejoue a l'octet pres.
            $tmp = fAudit($dossierAudits, $id) . '.' . bin2hex(random_bytes(6)) . '.tmp';
            if (file_put_contents($tmp, $texte) === false || !rename($tmp, fAudit($dossierAudits, $id))) { @unlink($tmp); erreur(500, 'SERVER_ERROR', 'Écriture impossible.'); }
            ecrireJson(fFicheAudit($dossierAudits, $id), ['id' => $id, 'recuLe' => $t, 'organisation' => $organisation] + $parcelle
                + ['taille' => strlen($texte), 'retrait' => hash('sha256', $retrait)]);
            repondre(201, ['id' => $id, 'retrait' => $retrait]);
        }
        if (!preg_match(ID_AUDIT, $id)) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $id . ' ».');
        $fiche = lireJson(fFicheAudit($dossierAudits, $id));
        if ($fiche === null) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $id . ' ».');
        if ($lecture) {
            if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(200);
            if ($methode !== 'HEAD') readfile(fAudit($dossierAudits, $id));
            exit;
        }
        if ($methode !== 'DELETE') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        // Le secret rendu a l'envoi, ou l'administrateur : personne d'autre ne retire un audit.
        $secret = (string)($_SERVER['HTTP_X_PLAN_RETRAIT'] ?? '');
        if (!$sessionAdmin && !($secret !== '' && hash_equals((string)($fiche['retrait'] ?? ''), hash('sha256', $secret)))) erreur(403, 'FORBIDDEN', 'Secret de retrait invalide.');
        @unlink(fAudit($dossierAudits, $id));
        @unlink(fFicheAudit($dossierAudits, $id));
        @unlink(fFicheAudit($dossierAudits, $id) . '.bak');
        repondre(200, ['id' => $id, 'retire' => true]);
    }

    $qui = acteur($sessionAdmin, jetonPorteur(), $plateformeUrl);
    $organisation = $qui['organisation'];
    $reserveAdmin = function () use ($qui): void { if (!$qui['admin']) erreur(403, 'FORBIDDEN', 'Réservé à l’administrateur.'); };

    if ($chemin === 'etat') {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        [$prompt, $schema] = promptEtSchema();
        // Un deploiement d'avant le lot L18 n'a pas les fichiers du renfort : l'etat le dit, sans tomber.
        try {
            [$promptR, $schemaR] = promptEtSchema('renfort');
            $renfort = ['prompt' => $promptR['version'], 'schema' => $schemaR['version']];
        } catch (Throwable $e) {
            $renfort = null;
        }
        repondre(200, ['actif' => $avecCle, 'modeles' => MODELES, 'usages' => USAGES, 'prompt' => $prompt['version'], 'schema' => $schema['version'], 'effort' => EFFORT,
                       'renfort' => $renfort, 'organisation' => $organisation, 'admin' => $qui['admin']]);
    }

    // `admin/consommation` (.htaccess : `chemin=@consommation`) : il ne fait que relire le journal.
    if ($chemin === '@consommation') {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $reserveAdmin();
        $aujourdhui = gmdate('Y-m-d');
        $f = lireFiltres($_GET, $aujourdhui);
        $p = plafonds($dossierClaude);
        // Chaque fichier mensuel est lu une fois, meme s'il sert a la periode, aux sept derniers
        // jours et au mois des plafonds.
        $lus = [];
        $mois = function (array $liste) use (&$lus, $dossierClaude): array {
            $l = [];
            foreach ($liste as $m) {
                if (!isset($lus[$m])) $lus[$m] = lireJournal($dossierClaude, $m . '-01');
                array_push($l, ...$lus[$m]);
            }
            return $l;
        };
        $periode = $mois(moisEntre($f['du'], $f['au']));
        $debutRecents = decalerJour($aujourdhui, -6);
        repondre(200, [
            'format' => 'plan-claude-consommation', 'du' => $f['du'], 'au' => $f['au'], 'aujourdhui' => $aujourdhui,
            'filtres' => ['organisation' => $f['organisation'], 'modele' => $f['modele'], 'usage' => $f['usage'], 'parcelle' => $f['parcelle']],
            'lignes' => filtrerConsommation($periode, $f),
            'recents' => filtrerConsommation($mois(moisEntre($debutRecents, $aujourdhui)), ['du' => $debutRecents, 'au' => $aujourdhui]),
            'organisations' => etatOrganisations($mois([substr($aujourdhui, 0, 7)]), $p, $aujourdhui),
            'choix' => choixConsommation($periode, $p),
        ]);
    }

    if ($chemin === 'tarifs' || $chemin === 'plafonds') {
        $reserveAdmin();
        if ($lecture) repondre(200, $chemin === 'tarifs' ? tarifs($dossierClaude) : plafondsJson(plafonds($dossierClaude)));
        if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $d = lireCorps(1024 * 1024);
        if ($chemin === 'tarifs') {
            verifierTarifs($d);
            if (!passeGarde(tarifs($dossierClaude), $d, substr(maintenant(), 0, 10))) erreur(409, 'PAST_PRICES', 'Un tarif passé ne se réécrit pas : ajoutez une ligne datée.');
            ecrireJson($dossierClaude . '/tarifs.json', $d);
            repondre(200, $d);
        }
        $d = plafondsJson(verifierPlafonds($d));
        ecrireJson($dossierClaude . '/plafonds.json', $d);
        repondre(200, $d);
    }

    if ($chemin === 'batches') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!$avecCle) $sansCle();
        $p = plafonds($dossierClaude);
        $demande = verifierDemande(lireCorps(TAILLE_MAX), $p);
        $t = maintenant();
        $identite = ['organisation' => $organisation, 'projet' => $demande['projet'] ?? ($qui['admin'] ? 'admin' : null), 'idu' => $demande['idu'], 'adresse' => $demande['adresse'],
                     'audit' => $demande['audit'], 'usage' => $demande['usage'], 'modele' => $demande['modele'], 'batch' => true];
        [$prompt, $schema] = promptEtSchema($demande['usage']);
        $prompts = promptsDesRequetes($demande['requetes']);
        $images = array_sum(array_column($demande['requetes'], 'images'));
        // Les passes d'une maison couvrent les memes facades : on les compte sur la premiere passe.
        $facades = array_sum(array_map(fn($r) => ($r['passe'] ?? 1) === 1 ? $r['facades'] : 0, $demande['requetes']));
        $ligneVide = fn(string $statut, array $extra = []) => ['t' => $t] + $identite + ['idBatch' => null, 'requete' => null, 'passe' => null,
            'tokens' => tokensDeUsage(null), 'images' => $images, 'facades' => $facades, 'cout' => 0, 'tarif' => null, 'statut' => $statut, 'arret' => null,
            'prompt' => $prompt['version'], 'schema' => $schema['version']] + $extra;

        // Les plafonds : ce qui est depense, plus ce qui est engage dans les batches ouverts, plus
        // une estimation de celui-ci. Un batch se paie a la fin : sans l'engage, dix batches lances
        // d'un coup passeraient tous sous le plafond.
        $ouverts = engagements($dossierClaude, $dossierBatches, $organisation, $avecCle);
        $fait = depenses(lireJournal($dossierClaude, $t), $organisation, substr($t, 0, 10));
        $engage = ($ouverts + count($demande['requetes'])) * $p['estimationRequete'];
        $plafond = plafondDe($p, $organisation);
        if ($fait['jour'] + $engage > $plafond['jour'] || $fait['mois'] + $engage > $plafond['mois']) {
            journaliser($dossierClaude, [$ligneVide('plafond')]);
            erreur(429, 'BUDGET_EXCEEDED', 'Plafond de l’analyse atteint pour aujourd’hui ou ce mois-ci.', ['depense' => $fait, 'engage' => $engage, 'plafond' => $plafond]);
        }

        $requetes = [];
        foreach ($demande['requetes'] as $r) {
            [$pR, $sR] = $prompts[$r['usage']];
            $requetes[] = ['custom_id' => $r['id'], 'params' => parametresRequete($r['modele'], $pR['texte'], $sR['schema'], $r['contenu'])];
        }
        $corps = json_encode(['requests' => $requetes], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        [$statut, $texte] = anthropic('POST', '/v1/messages/batches', $corps === false ? '' : $corps);
        if ($statut === 0) {
            journaliser($dossierClaude, [$ligneVide('echoue', ['erreur' => 'reseau'])]);
            erreur(502, 'UPSTREAM', 'Anthropic injoignable.');
        }
        if ($statut < 200 || $statut >= 300) {
            journaliser($dossierClaude, [$ligneVide('echoue', ['erreur' => 'http-' . $statut])]);
            erreur(502, 'UPSTREAM', 'Anthropic a refusé le batch (' . $statut . ') : ' . messageApi($texte));
        }
        $b = json_decode($texte, true);
        if (!is_array($b) || !is_string($b['id'] ?? null) || !preg_match(ID_BATCH, $b['id'])) erreur(502, 'UPSTREAM', 'Réponse d’Anthropic illisible.');
        $parRequete = [];
        foreach ($demande['requetes'] as $r) {
            $parRequete[$r['id']] = ['passe' => $r['passe'], 'images' => $r['images'], 'facades' => $r['facades'], 'usage' => $r['usage'], 'modele' => $r['modele'],
                                     'prompt' => $prompts[$r['usage']][0]['version'], 'schema' => $prompts[$r['usage']][1]['version']];
        }
        ecrireFiche($dossierBatches, ['id' => $b['id'], 'creeLe' => $t] + $identite + ['promptVersion' => $prompt['version'], 'schemaVersion' => $schema['version'],
                    'requetes' => $parRequete, 'etat' => $b['processing_status'] ?? null, 'journalise' => false]);
        repondre(201, ['batch' => vueBatch($b), 'modele' => $demande['modele'], 'prompt' => $prompt['version'], 'schema' => $schema['version']]);
    }

    if ($chemin === 'messages') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!$avecCle) $sansCle();
        $p = plafonds($dossierClaude);
        $d = lireCorps(TAILLE_MAX);
        if (is_array($d) && !isset($d['usage'])) $d['usage'] = 'renfort';
        $demande = verifierDemande($d, ['requetesParBatch' => min(REQUETES_IMMEDIATES, (int)$p['requetesParBatch'])] + $p);
        repondre(200, appelImmediat($dossierClaude, $dossierBatches, $demande, $organisation, $qui['admin'], $avecCle, $p));
    }

    if (preg_match('#^batches/([^/]+)(/resultats)?$#', $chemin, $mb)) {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $id = rawurldecode($mb[1]);
        // Seuls les batches crees par ce serveur se lisent, et par l'organisation qui les a crees : la
        // cle ne sert pas a fouiller le compte, ni une organisation a lire les resultats d'une autre.
        $fiche = preg_match(ID_BATCH, $id) ? lireJson(fBatch($dossierBatches, $id)) : null;
        if ($fiche === null || (!$qui['admin'] && ($fiche['organisation'] ?? null) !== $organisation)) erreur(404, 'NOT_FOUND', 'Aucun batch « ' . $id . ' ».');
        if (!$avecCle) $sansCle();
        [$statut, $texte] = anthropic('GET', '/v1/messages/batches/' . rawurlencode($id));
        if ($statut !== 200) erreur(502, 'UPSTREAM', 'Anthropic : ' . $statut . ' ' . messageApi($texte));
        $b = json_decode($texte, true);
        if (!is_array($b)) erreur(502, 'UPSTREAM', 'Réponse d’Anthropic illisible.');
        if (empty($mb[2])) {
            if (($fiche['etat'] ?? null) !== ($b['processing_status'] ?? null)) ecrireFiche($dossierBatches, ['etat' => $b['processing_status'] ?? null] + $fiche);
            repondre(200, vueBatch($b));
        }
        if (($b['processing_status'] ?? null) !== 'ended') erreur(409, 'NOT_READY', 'Le batch n’est pas terminé (' . (string)($b['processing_status'] ?? '?') . ').');
        $lu = resultats($dossierClaude, $dossierBatches, ['finLe' => $b['ended_at'] ?? null] + $fiche);
        if (isset($lu['erreur'])) erreur(502, 'UPSTREAM', 'Anthropic : ' . $lu['erreur'][0] . ' ' . messageApi($lu['erreur'][1]));
        repondre(200, ['batch' => vueBatch($b), 'modele' => $fiche['modele'], 'prompt' => $fiche['promptVersion'], 'schema' => $fiche['schemaVersion'], 'resultats' => $lu['sortie']]);
    }
    erreur(404, 'NOT_FOUND', 'Introuvable');
} catch (Refus $e) {
    erreur(400, 'BAD_REQUEST', $e->getMessage());
} catch (Throwable $e) {
    error_log('Plan analyse : ' . $e->getMessage());
    erreur(500, 'SERVER_ERROR', 'Erreur du serveur.');
}
