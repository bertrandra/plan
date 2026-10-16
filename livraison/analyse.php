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
//   GET|PUT admin/claude/modeles              le modele de chaque usage, choisi par l'administrateur
//   GET  admin/consommation                  le journal filtre, pour le tableau de bord (13.3, L16 bis)
//   POST admin/audits                         depose un fichier `plan-audit-parcelle` (15, lot L21)
//   GET  admin/audits                         la liste des audits recus (administrateur)
//   GET  admin/audits/<id>                    un audit recu (administrateur)
//   PUT  admin/audits/<id>                    le remplace (la sauvegarde de la capture) : son secret, ou l'administrateur
//   DELETE admin/audits/<id>                  le retire : son secret de retrait, ou l'administrateur
//   GET|POST admin/conformite                 l'historique des mesures de conformite, une mesure de plus (T13.5, G3)
//
// Les audits partages pour le corpus (spec-audit 15, decision D7) : l'utilisateur coche « Partager
// cet audit pour améliorer Plan » ; le fichier arrive ici, par la session admin ou le jeton de la
// plateforme (`Authorization: Bearer`, verifie aupres d'elle, `plateformeUrl` de la configuration).
// Ils se rangent dans `data/audits/` (donnees.php), avec les autres donnees de l'admin, hors du dossier
// publie. L'envoi rend un secret de retrait, garde sur l'appareil, seul a pouvoir retirer le fichier
// quand la personne decoche la case ; le serveur n'en garde que l'empreinte. La sauvegarde de la
// capture (15) arrive par la meme route, marquee `X-Plan-Depot: sauvegarde`, et chaque envoi remplace
// son depot (PUT) ; sans marque, un depot est un partage pour le corpus.
//
// Taille : 48 Mo au plus (TAILLE_MAX). Le fichier se lit par `php://input`, que `post_max_size`
// (8 Mo par defaut) ne coupe pas pour un corps JSON (PHP n'en ecrit qu'un avertissement au journal) ;
// un hebergement qui le jetterait quand meme laisse un corps vide, et la route le dit. La vraie borne
// est `memory_limit` (128 Mo par defaut) : le texte et son JSON decode tiennent ensemble en memoire,
// ~3 fois la taille du fichier. A regler dans la configuration de PHP de l'hebergement (php.ini, ou
// `.user.ini` du dossier publie) : `memory_limit = 256M`, et `post_max_size = 64M` pour le journal.
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
// `candidats` (lot G3 bis) : les cas candidats Panoramax du skill regles-toits, qui observent un
// batiment sur des photos de rue avec le prompt et le schema de l'analyse ; un usage a part pour que
// le journal et le tableau de bord en disent le cout.
// `rejeu` (15.5) : l'analyse d'un audit stocke, rejouee par l'administrateur pour comparer les modeles
// et les versions du prompt ; un usage a part pour que le tableau de bord en dise le cout.
const USAGES = ['analyse', 'escalade', 'renfort', 'immediat', 'candidats', 'rejeu'];
// Le modele de chaque usage tant que l'administrateur n'a rien regle (`admin/claude/modeles`,
// buildsg/analyseAdmin.mjs, memes valeurs). Le modele rapide partout, decision de l'utilisateur du
// 15 octobre 2026 : le "rien trouve" des audits venait du schema que l'API refusait (PR #317), pas
// du modele. L'administrateur passe un usage au plus fin dans Reglages > Modeles s'il le faut.
const MODELE_PAR_USAGE = ['analyse' => 'claude-haiku-5-5', 'escalade' => 'claude-haiku-5-5', 'renfort' => 'claude-haiku-5-5', 'immediat' => 'claude-haiku-5-5', 'candidats' => 'claude-haiku-5-5', 'rejeu' => 'claude-haiku-5-5'];
// Le prompt et le schema de chaque usage : le renfort du calage et de la detection (lot L18) a les
// siens ; les autres usages (cas candidats compris) lisent ceux de l'analyse d'une maison.
const FICHIERS_PAR_USAGE = ['renfort' => ['prompt-renfort.md', 'schema-renfort.json']];
const FICHIERS_DEFAUT = ['prompt-analyse.md', 'schema-analyse.json'];
// Un appel immediat (bouton « Demander de l'aide » du releve) : les trois passes d'une facade, pas plus.
const REQUETES_IMMEDIATES = 3;
// Assez pour la reflexion a l'effort `low` et le JSON avec indices : ~600 tokens par facade, et le
// rejeu d'AE 101 (15 octobre 2026) a coupe a 8 000 la passe d'une maison de huit murs
// (reponse perdue, un vote sur deux passes). On ne paie que ce que le modele ecrit.
const MAX_TOKENS = 16000;
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
$fichierConfig = null;
$racineWeb = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
foreach ([getenv('PLAN_ADMIN_CONFIG') ?: null, $racineWeb !== '' ? dirname($racineWeb) . '/plan-admin-config.php' : null,
          dirname(__DIR__) . '/plan-admin-config.php', __DIR__ . '/admin-config.php'] as $f) {
    if ($f && is_file($f)) { $config = require $f; $fichierConfig = $f; break; }
}
$motDePasse = is_array($config) ? (string)($config['motDePasse'] ?? '') : '';
if ($motDePasse === '' || $motDePasse === 'A-CHANGER') erreur(404, 'NOT_FOUND', 'Introuvable');
$cle = (string)($config['anthropicCle'] ?? '');
$avecCle = $cle !== '' && $cle !== 'A-CHANGER';
$anthropicUrl = rtrim((string)($config['anthropicUrl'] ?? 'https://api.anthropic.com'), '/');
$plateformeUrl = rtrim((string)($config['plateformeUrl'] ?? 'https://www.raillard.org'), '/');
// Les donnees vivent dans data/, a cote de public_html/ (donnees.php) ; claude/, audits/ et
// conformite/ y ont le meme nom dans les deux dispositions, l'ancienne comprise.
require __DIR__ . '/donnees.php';
$donnees = dossiersDonnees($config, $racineWeb, __DIR__, $fichierConfig);
migrerDonnees($donnees);
$dossier = $donnees['racine'];
$dossierAudits = $dossier . '/audits';
$dossierClaude = $dossier . '/claude';
$dossierBatches = $dossierClaude . '/batches';
if (!is_dir($dossierBatches) && !@mkdir($dossierBatches, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier claude/ impossible a creer (droits du dossier des donnees) : ' . $dossierBatches . '.');

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
function verifierDemande($d, array $plafonds, array $modeles = MODELE_PAR_USAGE): array {
    if (!is_array($d) || array_is_list($d)) throw new Refus('Demande illisible.');
    $meta = [];
    foreach (['projet' => 128, 'idu' => 64, 'adresse' => 300, 'audit' => 64] as $cle => $max) {
        $v = texteCourt($d[$cle] ?? null, $max);
        if ($v === false) throw new Refus('Champ « ' . $cle . ' » invalide.');
        $meta[$cle] = $v;
    }
    // L'audit du serveur dont la demande est l'analyse (`depot`, 15.5) : sa trace s'y range.
    $depot = $d['depot'] ?? null;
    if ($depot !== null && (!is_string($depot) || !preg_match(ID_AUDIT, $depot))) throw new Refus('Champ « depot » invalide.');
    $meta['depot'] = $depot;
    $usage = $d['usage'] ?? 'analyse';
    if (!in_array($usage, USAGES, true)) throw new Refus('Usage inconnu : ' . (is_string($usage) ? $usage : '?') . '.');
    $modele = $d['modele'] ?? $modeles[$usage];
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
        $modeleR = isset($d['modele']) ? $modele : $modeles[$usageR];
        $requetes[] = ['id' => $r['id'], 'passe' => $passe, 'images' => $images, 'facades' => $facades, 'usage' => $usageR, 'modele' => $modeleR, 'contenu' => $contenu];
    }
    return $meta + ['usage' => $usage, 'modele' => $modele, 'requetes' => $requetes];
}

// --- La forme de la reponse ---------------------------------------------------------------------
// Le schema ne part plus en sortie structuree (`output_config.format`) : l'API le compile en
// grammaire, et celle de l'analyse d'une maison depasse sa limite (« The compiled grammar is too
// large », audit d'AE 101, 15 octobre 2026) ; aucune reponse n'etait lue. Il part a la suite du
// prompt, et la reponse y est ramenee ici (`conformer`) : un terme hors vocabulaire devient
// `indetermine`, un champ manquant prend sa valeur par defaut, un element de liste illisible est
// ecarte. La page recoit donc la meme forme qu'avant. buildsg/analyseAdmin.mjs fait de meme.

const CONSIGNE_JSON = 'Répondez par un seul objet JSON, sans texte avant ni après et sans bloc de code, conforme à ce schéma JSON :';

/** Le prompt envoye en system : la partie fixe, puis le schema de la reponse (les deux en cache). */
function promptAvecSchema(string $prompt, $schema): string {
    return $prompt . "\n\n# Forme de la réponse\n\n" . CONSIGNE_JSON . "\n\n" . json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** L'objet JSON d'une reponse : le texte entier, sinon ce qui va de la premiere accolade a la derniere. */
function objetJsonDuTexte(string $texte) {
    $t = trim($texte);
    $d = json_decode($t);
    if (is_object($d)) return $d;
    $i = strpos($t, '{');
    $j = strrpos($t, '}');
    if ($i === false || $j === false || $j <= $i) return null;
    $d = json_decode(substr($t, $i, $j - $i + 1));
    return is_object($d) ? $d : null;
}

/** Un terme ecrit par Claude, ramene a la graphie du vocabulaire (minuscules, sans accents, tirets). */
function termeNormalise(string $v): string {
    $v = strtr(mb_strtolower(trim($v)), ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i',
                                         'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', '_' => '-', ' ' => '-']);
    return $v;
}

function schemaResolu($s, $defs) {
    for ($n = 0; is_object($s) && isset($s->{'$ref'}) && $n < 8; $n++) {
        $nom = preg_replace('~^#/\$defs/~', '', (string)$s->{'$ref'});
        $s = is_object($defs) && isset($defs->$nom) ? $defs->$nom : null;
    }
    return $s;
}

/**
 * La valeur d'un champ manquant ou illisible, `[vrai, valeur]` quand il en a une sans rien inventer :
 * `indetermine` si son vocabulaire l'a, une liste vide, un texte vide, un objet ramene a son schema.
 * Un nombre (un numero d'ouverture, une cote, une image) ou un terme sans `indetermine` n'en a pas :
 * l'objet qui le porte est alors ecarte de sa liste plutot que complete.
 */
function valeurParDefaut($s, $defs): array {
    $s = schemaResolu($s, $defs);
    if (!is_object($s)) return [false, null];
    if (isset($s->anyOf) && is_array($s->anyOf)) {
        foreach ($s->anyOf as $b) {
            $b = schemaResolu($b, $defs);
            if (is_object($b) && is_array($b->enum ?? null) && in_array('indetermine', $b->enum, true)) return [true, 'indetermine'];
        }
        return [false, null];
    }
    if (is_array($s->enum ?? null)) return in_array('indetermine', $s->enum, true) ? [true, 'indetermine'] : [false, null];
    switch ($s->type ?? null) {
        case 'array': return [true, []];
        case 'string': return [true, ''];
        case 'object': $o = conformer(new stdClass(), $s, $defs, $ok); return [$ok, $o];
        default: return [false, null];
    }
}

/**
 * `$v` ramene au schema `$s` ; `$ok` faux quand il ne s'y ramene pas (le parent decide alors). A la
 * racine, un terme manquant sans `indetermine` prend le premier du vocabulaire : c'est `confiance`,
 * et son premier terme, `faible`, est le plus prudent.
 */
function conformer($v, $s, $defs, ?bool &$ok = null, bool $racine = false) {
    $ok = true;
    $s = schemaResolu($s, $defs);
    if (!is_object($s)) return $v;
    if (isset($s->anyOf) && is_array($s->anyOf)) {
        foreach ($s->anyOf as $b) { $r = conformer($v, $b, $defs, $okB); if ($okB) return $r; }
        $ok = false;
        return null;
    }
    if (is_array($s->enum ?? null)) {
        if (is_string($v)) { $t = termeNormalise($v); if (in_array($t, $s->enum, true)) return $t; }
        $ok = false;
        return null;
    }
    switch ($s->type ?? null) {
        case 'object':
            if (!is_object($v)) break;
            $o = new stdClass();
            foreach ((array)($s->properties ?? []) as $k => $p) {
                $r = conformer(property_exists($v, (string)$k) ? $v->$k : null, $p, $defs, $okP);
                if ($okP) { $o->$k = $r; continue; }
                [$a, $d] = valeurParDefaut($p, $defs);
                if ($a) { $o->$k = $d; continue; }
                $p = schemaResolu($p, $defs);
                if ($racine && is_object($p) && is_array($p->enum ?? null) && $p->enum) { $o->$k = $p->enum[0]; continue; }
                $ok = false;
                return null;
            }
            return $o;
        case 'array':
            if (!is_array($v)) break;
            $l = [];
            foreach ($v as $x) { $r = conformer($x, $s->items ?? null, $defs, $okI); if ($okI) $l[] = $r; }
            return $l;
        case 'integer':
            if (is_int($v)) return $v;
            if (is_float($v) && is_finite($v)) return (int)round($v);
            if (is_string($v) && preg_match('/^\s*-?\d+\s*$/', $v)) return (int)trim($v);
            break;
        case 'number':
            if (is_int($v) || (is_float($v) && is_finite($v))) return $v;
            if (is_string($v) && preg_match('/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/', trim($v))) return 0 + trim($v);
            break;
        case 'string':
            if (is_string($v)) return $v;
            break;
        case 'boolean':
            if (is_bool($v)) return $v;
            break;
        default:
            return $v;
    }
    $ok = false;
    return null;
}

/** La sortie d'une reponse dans la forme de son schema, ou `null` si elle n'est pas un objet JSON. */
function sortieConforme(string $texte, $schema) {
    $d = objetJsonDuTexte($texte);
    if ($d === null) return null;
    if (!is_object($schema)) return $d;
    $r = conformer($d, $schema, $schema->{'$defs'} ?? null, $ok, true);
    return $ok && is_object($r) ? $r : null;
}

/** Les parametres d'une requete du batch : le prompt et le schema en cache, l'effort. */
function parametresRequete(string $modele, string $prompt, $schema, array $contenu): array {
    return [
        'model' => $modele,
        'max_tokens' => MAX_TOKENS,
        'system' => [['type' => 'text', 'text' => promptAvecSchema($prompt, $schema), 'cache_control' => ['type' => 'ephemeral']]],
        'messages' => [['role' => 'user', 'content' => $contenu]],
        'output_config' => ['effort' => EFFORT],
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

/**
 * Le modele de chaque usage : le reglage de l'administrateur, sinon celui par defaut. Un modele
 * regle qui n'est plus admis (un deploiement l'a retire) retombe sur le defaut, sans tomber.
 */
function modelesParUsage($reglage): array {
    $choisis = is_array($reglage) && is_array($reglage['usages'] ?? null) ? $reglage['usages'] : [];
    $m = [];
    foreach (USAGES as $u) $m[$u] = in_array($choisis[$u] ?? null, MODELES, true) ? $choisis[$u] : MODELE_PAR_USAGE[$u];
    return $m;
}

/** Un reglage des modeles valide : un modele admis par usage connu ; un usage absent garde son defaut. */
function verifierModeles($d): array {
    $msg = 'Ce n’est pas un réglage des modèles (format, un modèle admis par usage).';
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-claude-modeles' || !is_array($d['usages'] ?? null)) throw new Refus($msg);
    if ($d['usages'] !== [] && array_is_list($d['usages'])) throw new Refus($msg);
    foreach ($d['usages'] as $u => $m) {
        if (!in_array($u, USAGES, true)) throw new Refus('Usage inconnu : ' . $u . '.');
        if (!in_array($m, MODELES, true)) throw new Refus('Modèle non admis : ' . (is_string($m) ? $m : '?') . '.');
    }
    return ['format' => 'plan-claude-modeles', 'usages' => $d['usages']];
}

/** Ce que `admin/claude/modeles` rend : le modele de chaque usage, les defauts, les modeles admis. */
function vueModeles(?array $reglage): array {
    return ['format' => 'plan-claude-modeles', 'usages' => modelesParUsage($reglage), 'defaut' => MODELE_PAR_USAGE, 'admis' => MODELES, 'regle' => $reglage !== null];
}

// --- Ce que les reponses contiennent (13.3 : comparer les modeles sur ce qu'ils trouvent) ---------
// Le journal ne garde pas la reponse : seulement ces comptes, lus quand le serveur la relit, par la
// forme du schema de l'usage (schema-analyse.json, schema-renfort.json ; buildsg, memes noms).

const COMPTES = ['ouvertures', 'manquees', 'enTrop', 'bouts', 'lucarnes', 'elements', 'ecarts', 'coins', 'determines'];
// Un compte ecrit par le modele est borne : un nombre aberrant ne doit pas noyer le tableau de bord.
const COMPTE_MAX = 999;
const BOUTS_TROUVES = ['pignon', 'croupe', 'demi-croupe', 'brisis'];

/** Un entier positif ecrit par le modele (`2` ou `2.0`), sinon zero : `indetermine` ne compte pas. */
function compte($v): int {
    return nombre($v) && $v > 0 && floor((float)$v) == $v ? (int)min(COMPTE_MAX, $v) : 0;
}
function listeDe($v): array { return is_array($v) && array_is_list($v) ? $v : []; }
function objetDe($v): array { return is_array($v) && ($v === [] || !array_is_list($v)) ? $v : []; }
function determine($v): bool { return is_string($v) && $v !== '' && $v !== 'indetermine'; }

/** Les comptes d'une sortie lue (`null` sans sortie) ; `vide` quand la reponse ne dit rien. */
function comptesSortie($sortie, string $usage): ?array {
    if ($sortie === null) return null;
    // La sortie arrive en objets (elle repart telle quelle vers la page) : relue ici en tableaux.
    $s = objetDe(json_decode((string)json_encode($sortie), true));
    $c = array_fill_keys(COMPTES, 0);
    if ($usage === 'renfort') {
        foreach (listeDe($s['ouvertures'] ?? null) as $o) {
            $decision = objetDe($o)['decision'] ?? null;
            if ($decision === 'garder') $c['ouvertures']++;
            if ($decision === 'retirer') $c['enTrop']++;
        }
        $c['manquees'] = count(listeDe($s['manquees'] ?? null));
        $coins = objetDe($s['coins'] ?? null);
        foreach (['hautGauche', 'hautDroit', 'basDroit', 'basGauche'] as $k) if (is_array($coins[$k] ?? null)) $c['coins']++;
        $c['determines'] = in_array(objetDe($s['mur'] ?? null)['vu'] ?? null, ['attendu', 'autre'], true) ? 1 : 0;
    } else {
        foreach (listeDe($s['facades'] ?? null) as $f) {
            $o = objetDe(objetDe($f)['ouvertures'] ?? null);
            foreach (listeDe($o['parNiveau'] ?? null) as $n) $c['ouvertures'] += compte($n);
            $c['manquees'] += compte($o['manquees'] ?? null);
            $c['enTrop'] += compte($o['enTrop'] ?? null);
        }
        $bouts = objetDe($s['bouts'] ?? null);
        foreach (['gauche', 'droite'] as $k) if (in_array($bouts[$k] ?? null, BOUTS_TROUVES, true)) $c['bouts']++;
        $c['lucarnes'] = compte(objetDe($s['lucarnes'] ?? null)['nombre'] ?? null);
        $c['elements'] = count(listeDe($s['elements'] ?? null));
        $c['ecarts'] = count(listeDe($s['ecarts'] ?? null));
        foreach ([['forme', 'valeur'], ['profil', 'valeur'], ['faitage', 'sens'], ['couverture', 'valeur'], ['terrasse', 'type']] as [$k, $champ]) {
            if (determine(objetDe($s[$k] ?? null)[$champ] ?? null)) $c['determines']++;
        }
    }
    foreach ($c as $k => $n) $c[$k] = min(COMPTE_MAX, $n);
    return $c + ['vide' => array_sum($c) === 0];
}

/** Les comptes d'un resultat relu : seulement d'une reponse reussie dont la sortie s'est lue. */
function trouvailles(array $x, string $usage): ?array {
    return $x['statut'] === 'reussi' && $x['erreur'] === null ? comptesSortie($x['sortie'], $usage) : null;
}

// --- Le tableau de bord de la consommation (13.3, lot L16 bis ; buildsg/analyseAdmin.mjs, memes noms)

// Le journal est garde 24 mois : une periode n'en demande pas plus (25 fichiers mensuels au plus).
const MOIS_CONSULTABLES = 25;
// `idBatch` compte les batches par modele ; `trouve`, les comptes de la reponse (null sur un journal d'avant).
const CHAMPS_CONSOMMATION = ['t', 'organisation', 'projet', 'idu', 'adresse', 'audit', 'usage', 'modele', 'batch', 'idBatch', 'passe', 'tokens', 'images', 'facades', 'cout', 'statut', 'trouve'];

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
function lireResultat($ligne, $schema = null): array {
    $r = is_object($ligne) && isset($ligne->result) && is_object($ligne->result) ? $ligne->result : new stdClass();
    $type = $r->type ?? '';
    $statut = ['succeeded' => 'reussi', 'errored' => 'echoue', 'expired' => 'expire', 'canceled' => 'annule'][$type] ?? 'echoue';
    $message = $type === 'succeeded' && isset($r->message) && is_object($r->message) ? $r->message : null;
    // `usage` se relit en tableau : les compteurs, rien d'autre.
    $tokens = tokensDeUsage($message && isset($message->usage) ? json_decode(json_encode($message->usage), true) : null);
    $sortie = null;
    $erreur = null;
    if ($message) {
        // Les blocs de texte bout a bout : la reflexion vient dans ses propres blocs, ignores ici.
        $texte = null;
        foreach ((is_array($message->content ?? null) ? $message->content : []) as $b) {
            if (is_object($b) && ($b->type ?? null) === 'text') $texte = ($texte ?? '') . (string)($b->text ?? '');
        }
        $arret = $message->stop_reason ?? null;
        if ($arret === 'refusal') $erreur = ['type' => 'refusal', 'message' => 'Analyse refusée par le modèle.'];
        elseif ($arret === 'max_tokens') $erreur = ['type' => 'max_tokens', 'message' => 'Réponse coupée (max_tokens).'];
        else {
            // En objets, pas en tableaux : `{}` et `[]` repartent tels quels vers la page.
            $sortie = $texte === null ? null : sortieConforme($texte, $schema);
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

/** Le reglage des modeles par l'administrateur, ou `null` tant qu'il n'a rien regle. */
function reglageModeles(string $dossierClaude): ?array { return lireJson($dossierClaude . '/modeles.json'); }

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
    // Une promenade des toits (`plan-audit`, model/audit.ts) : deposee par l'administrateur.
    if (is_array($d) && ($d['format'] ?? null) === 'plan-audit') {
        if (!is_int($d['version'] ?? null) || $d['version'] < 1 || $d['version'] > 2) throw new Refus('Version du fichier de promenade inconnue.');
        if (!is_array($d['promenade'] ?? null) || !is_array($d['cas'] ?? null) || !array_is_list($d['cas'])) throw new Refus('Fichier de promenade incomplet.');
        $commune = is_string($d['promenade']['commune'] ?? null) ? mb_substr($d['promenade']['commune'], 0, 120) : null;
        return ['nature' => 'promenade', 'idu' => '', 'adresse' => $commune, 'commune' => $commune];
    }
    if (!is_array($d) || ($d['format'] ?? null) !== 'plan-audit-parcelle') throw new Refus('Ce n’est pas un fichier d’audit de parcelle ni de promenade.');
    if (($d['version'] ?? null) !== 1) throw new Refus('Version du fichier d’audit inconnue.');
    $p = $d['parcelle'] ?? null;
    if (!is_array($p) || !is_string($p['idu'] ?? null) || !preg_match(IDU_AUDIT, $p['idu'])) throw new Refus('Parcelle du fichier d’audit invalide.');
    if (!is_array($d['batiments'] ?? null) || !is_array($d['propositions'] ?? null)) throw new Refus('Fichier d’audit incomplet.');
    $adresse = is_string($p['adresse'] ?? null) ? mb_substr($p['adresse'], 0, 300) : null;
    return ['nature' => 'parcelle', 'idu' => $p['idu'], 'adresse' => $adresse];
}

// Les marques d'un depot (en-tete `X-Plan-Depot`) : absente, c'est un partage pour le corpus.
const MARQUES_AUDIT = ['corpus', 'sauvegarde'];

/** La marque demandee, ou un refus ; `$defaut` : celle d'un depot qui n'en dit rien. */
function marqueAudit(string $entete, string $defaut = 'corpus'): string {
    if ($entete === '') return $defaut;
    if (!in_array($entete, MARQUES_AUDIT, true)) throw new Refus('Marque de dépôt inconnue (corpus ou sauvegarde).');
    return $entete;
}

/**
 * Ce que la fiche dit du fichier pour le catalogue de l'administrateur, sans le relire : ses photos,
 * sa phase (`capture` tant que « Lancer l'analyse » n'est pas passe), le debut de la visite, et sa
 * conclusion : les propositions (de Claude, des mesures) et ce qui en a ete fait, ou les cas d'une
 * promenade et leur statut.
 */
function resumeAudit(array $d): array {
    $nb = fn($l) => is_array($l) ? count($l) : 0;
    if (($d['format'] ?? null) === 'plan-audit') {
        $photos = 0;
        $statuts = [];
        foreach ($d['cas'] as $c) {
            if (!is_array($c)) continue;
            $constat = is_array($c['constat'] ?? null) ? $c['constat'] : [];
            $photos += is_array($constat['photos'] ?? null) ? count($constat['photos']) : (is_array($constat['photo'] ?? null) ? 1 : 0);
            $s = is_string($c['statut'] ?? null) ? $c['statut'] : 'a_corriger';
            $statuts[$s] = ($statuts[$s] ?? 0) + 1;
        }
        $debut = is_string($d['promenade']['debut'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T/', $d['promenade']['debut']) ? substr($d['promenade']['debut'], 0, 40) : null;
        return ['photos' => $photos, 'phase' => 'analyse', 'debut' => $debut, 'cas' => count($d['cas']), 'statuts' => (object)$statuts];
    }
    $photos = $nb($d['cloture']['photos'] ?? null) + $nb($d['portail']['photos'] ?? null);
    foreach ($d['batiments'] as $b) {
        if (!is_array($b)) continue;
        $photos += $nb($b['photos'] ?? null);
        foreach (is_array($b['facades'] ?? null) ? $b['facades'] : [] as $f) $photos += $nb(is_array($f) ? ($f['photos'] ?? null) : null);
    }
    $debut = is_string($d['debut'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T/', $d['debut']) ? substr($d['debut'], 0, 40) : null;
    $p = ['total' => 0, 'claude' => 0, 'mesures' => 0, 'validees' => 0, 'refusees' => 0, 'enAttente' => 0];
    foreach ($d['propositions'] as $x) {
        if (!is_array($x)) continue;
        $p['total']++;
        $p[($x['source'] ?? null) === 'claude' ? 'claude' : 'mesures']++;
        $decision = $x['decision'] ?? null;
        $p[$decision === 'validee' ? 'validees' : ($decision === 'refusee' ? 'refusees' : 'enAttente')]++;
    }
    return ['photos' => $photos, 'phase' => is_string($d['finCapture'] ?? null) && $d['finCapture'] !== '' ? 'analyse' : 'capture', 'debut' => $debut, 'propositions' => $p];
}

/**
 * La conclusion d'un audit, a part, lisible a la main (`decisions.json`) : chaque proposition, d'ou
 * elle vient et ce qu'elle est devenue (validee, refusee, en attente) ; pour une promenade, chaque
 * cas et son statut. Rien n'est calcule : le fichier de l'audit reste la reference.
 */
function decisionsAudit(array $d): array {
    if (($d['format'] ?? null) === 'plan-audit') {
        $cas = [];
        foreach ($d['cas'] as $c) {
            if (!is_array($c)) continue;
            $k = is_array($c['constat'] ?? null) ? $c['constat'] : [];
            $id = is_array($c['identite'] ?? null) ? $c['identite'] : [];
            $cas[] = ['id' => $c['id'] ?? null, 'cle' => $c['cle'] ?? null, 'cleBdtopo' => $id['cleBdtopo'] ?? null, 'adresse' => $id['adresse'] ?? null,
                      'statut' => $c['statut'] ?? null, 'categorie' => $k['categorie'] ?? null, 'problemes' => is_array($k['problemes'] ?? null) ? $k['problemes'] : [],
                      'note' => is_string($k['note'] ?? null) ? $k['note'] : '', 'photos' => is_array($k['photos'] ?? null) ? count($k['photos']) : (is_array($k['photo'] ?? null) ? 1 : 0)];
        }
        return ['format' => 'plan-audit-decisions', 'version' => 1, 'nature' => 'promenade', 'cas' => $cas];
    }
    $propositions = [];
    foreach ($d['propositions'] as $x) {
        if (!is_array($x)) continue;
        $propositions[] = ['id' => $x['id'] ?? null, 'objet' => $x['objet'] ?? null, 'source' => $x['source'] ?? null, 'avant' => $x['avant'] ?? null,
                           'apres' => $x['apres'] ?? null, 'confiance' => $x['confiance'] ?? null, 'decision' => $x['decision'] ?? null];
    }
    $decisions = [];
    foreach (is_array($d['decisions'] ?? null) ? $d['decisions'] : [] as $x) {
        if (is_array($x)) $decisions[] = ['t' => $x['t'] ?? null, 'acceptees' => $x['acceptees'] ?? [], 'refusees' => $x['refusees'] ?? []];
    }
    return ['format' => 'plan-audit-decisions', 'version' => 1, 'nature' => 'parcelle', 'propositions' => $propositions, 'decisions' => $decisions];
}

/**
 * Le corps d'un fichier d'audit, ou un refus qui dit sa cause. Un corps annonce mais vide : PHP l'a
 * jete (`post_max_size` d'un hebergement plus strict) ; une page qui n'aurait que « JSON illisible »
 * ne saurait quoi faire.
 */
function texteAudit(): string {
    $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
    if (strlen($texte) > TAILLE_MAX) erreur(413, 'TOO_LARGE', 'Fichier d’audit trop gros (48 Mo au plus).');
    $longueur = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($texte === '' && $longueur > 0) {
        $taille = $longueur >= 1048576 ? (int)ceil($longueur / 1048576) . ' Mo' : (int)ceil($longueur / 1024) . ' Ko';
        erreur(413, 'TOO_LARGE', 'Fichier d’audit trop gros pour ce serveur (' . $taille . ' refusés par PHP ; post_max_size = ' . ini_get('post_max_size') . ' dans sa configuration, à porter à 64M).');
    }
    return $texte;
}

// --- Les indicateurs de conformite (spec-regles-toits 13.5, lot G3 ; buildsg/analyseAdmin.mjs, memes noms)
// L'ecran Admin › Conformité mesure le corpus du depot et les audits partages, puis range sa mesure
// ici : l'historique dit si le taux monte, phase apres phase. Le serveur n'en calcule rien.

// Les dernieres mesures gardees : plus, l'historique ne se lit plus d'un coup d'oeil.
const MESURES_CONFORMITE_MAX = 200;
const TAILLE_MESURE_MAX = 2 * 1024 * 1024;
const RESUME_CONFORMITE = ['total', 'observes', 'conformes', 'nonConformes', 'aRevoir', 'sansObservation', 'ecartes', 'horsCalcul'];

/** Ce que le serveur verifie d'une mesure : sa forme et son resume, le reste est relu par la page. */
function verifierMesureConformite($d): array {
    if (!is_array($d) || array_is_list($d) || ($d['format'] ?? null) !== 'plan-conformite-mesure') throw new Refus('Ce n’est pas une mesure de conformité.');
    if (($d['version'] ?? null) !== 1) throw new Refus('Version de la mesure de conformité inconnue.');
    if (!is_string($d['t'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $d['t'])) throw new Refus('Date de la mesure invalide.');
    $r = $d['toits'] ?? null;
    if (!is_array($r)) throw new Refus('Résumé de la mesure invalide.');
    foreach (RESUME_CONFORMITE as $k) if (!nombre($r[$k] ?? null) || $r[$k] < 0) throw new Refus('Résumé de la mesure invalide.');
    foreach (['parForme', 'parRegion', 'parProbleme', 'cas'] as $k) if (!is_array($d[$k] ?? null) || !array_is_list($d[$k])) throw new Refus('Mesure de conformité incomplète.');
    return $d;
}

// --- Le rangement des audits (MD/spec-audit.md 15.4 ; buildsg/analyseAdmin.mjs, memes noms) ---------
// Chaque audit a son dossier, classe pour s'y retrouver a la main (gestionnaire de fichiers, FTP) :
//
//   audits/parcelle/<IDU>/<id>/        audit.json (le fichier tel qu'il est arrive), fiche.json,
//                                      decisions.json (la conclusion, lisible), analyses/, images/
//   audits/promenade/<commune>/<id>/   les memes
//   audits/index.json                  les fiches, sans les secrets : la liste se lit d'un coup ; il
//                                      se reconstruit en relisant l'arborescence s'il manque
//
// `<id>` commence par la date et l'heure de reception (AAAAMMJJ-HHMMSS-xxxxxxxx). Les noms sont en
// ASCII, sans espaces. Les audits d'avant ce rangement (`audits/<id>.json` et `<id>.fiche.json`, a
// plat) y sont ranges au premier passage, sans rien perdre.

const FORMAT_INDEX_AUDITS = 'plan-audits-index';
const ACCENTS_NOMS = ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'å' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
                 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ì' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ò' => 'o', 'õ' => 'o', 'ù' => 'u', 'û' => 'u',
                 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'ý' => 'y', 'ñ' => 'n', 'œ' => 'oe', 'æ' => 'ae', 'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Ç' => 'C',
                 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Î' => 'I', 'Ï' => 'I', 'Ô' => 'O', 'Ö' => 'O', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U',
                 'Œ' => 'OE', 'Æ' => 'AE'];

/** Un nom de dossier sur : ASCII, lettres, chiffres, `-` et `_`, 64 au plus. */
function nomSur(?string $v, string $defaut, bool $minuscules = false): string {
    $t = strtr((string)$v, ACCENTS_NOMS);
    if ($minuscules) $t = strtolower($t);
    $t = trim((string)preg_replace('/[^A-Za-z0-9_-]+/', '-', $t), '-');
    return $t === '' ? $defaut : substr($t, 0, 64);
}

/** Le dossier d'un audit, relatif a `audits/`. */
function dossierRelatifAudit(array $fiche): string {
    if (($fiche['nature'] ?? 'parcelle') === 'promenade') return 'promenade/' . nomSur($fiche['commune'] ?? null, 'sans-commune', true) . '/' . $fiche['id'];
    return 'parcelle/' . nomSur($fiche['idu'] ?? null, 'sans-idu') . '/' . $fiche['id'];
}

/** Les fiches de l'arborescence, relues : ce que l'index dit quand il manque. */
function reconstruireIndex(string $dA): array {
    $index = [];
    foreach (glob($dA . '/*/*/*/fiche.json') ?: [] as $f) {
        $fiche = lireJson($f);
        if ($fiche === null || !is_string($fiche['id'] ?? null) || !preg_match(ID_AUDIT, $fiche['id'])) continue;
        unset($fiche['retrait']);
        $fiche['dossier'] = substr(dirname($f), strlen($dA) + 1);
        $index[$fiche['id']] = $fiche;
    }
    return $index;
}

/** Change l'index sous verrou : deux depots simultanes ne s'effacent pas. */
function majIndex(string $dA, callable $f): void {
    if (!is_dir($dA)) @mkdir($dA, 0750, true);
    $verrou = fopen($dA . '/.index.verrou', 'c');
    if ($verrou) flock($verrou, LOCK_EX);
    $lu = lireJson($dA . '/index.json');
    $index = is_array($lu['audits'] ?? null) ? $lu['audits'] : reconstruireIndex($dA);
    $index = $f($index);
    ecrireJson($dA . '/index.json', ['format' => FORMAT_INDEX_AUDITS, 'version' => 1, 'audits' => (object)$index]);
    if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
}

/**
 * Les audits d'avant le rangement (`<id>.json` et `<id>.fiche.json` a plat dans audits/) : chacun dans
 * son dossier. Un dossier deja la n'est pas ecrase ; l'audit reste alors a plat, toujours lu.
 */
function rangerAnciensAudits(string $dA): void {
    $ranges = false;
    foreach (glob($dA . '/*.fiche.json') ?: [] as $fFiche) {
        $id = basename($fFiche, '.fiche.json');
        $fiche = preg_match(ID_AUDIT, $id) ? lireJson($fFiche) : null;
        if ($fiche === null) continue;
        $fiche += ['id' => $id, 'nature' => 'parcelle'];
        $dir = $dA . '/' . dossierRelatifAudit($fiche);
        if (file_exists($dir . '/audit.json') || (!is_dir($dir) && !@mkdir($dir, 0750, true))) continue;
        if (is_file($dA . '/' . $id . '.json') && !@rename($dA . '/' . $id . '.json', $dir . '/audit.json')) continue;
        $texte = json_encode($fiche, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        if ($texte === false || file_put_contents($dir . '/fiche.json', $texte . "\n") === false) continue;
        $d = lireJson($dir . '/audit.json');
        if ($d !== null) { try { verifierAudit($d); ecrireJson($dir . '/decisions.json', decisionsAudit($d)); } catch (Refus $e) { /* illisible : la fiche suffit */ } }
        if (is_file($fFiche . '.bak')) @rename($fFiche . '.bak', $dir . '/fiche.json.bak');
        @unlink($fFiche);
        $ranges = true;
    }
    if ($ranges) majIndex($dA, fn() => reconstruireIndex($dA));
}

/** L'index des audits (id => fiche sans secret, avec `dossier`), apres le rangement des anciens. */
function indexAudits(string $dA): array {
    rangerAnciensAudits($dA);
    $lu = lireJson($dA . '/index.json');
    if (is_array($lu['audits'] ?? null)) return $lu['audits'];
    $index = reconstruireIndex($dA);
    if ($index) majIndex($dA, fn() => $index);
    return $index;
}

/** Le dossier d'un audit range, ou null. */
function dossierAudit(string $dA, string $id): ?string {
    $e = indexAudits($dA)[$id] ?? null;
    if (!is_array($e) || !is_string($e['dossier'] ?? null)) return null;
    $dir = $dA . '/' . $e['dossier'];
    return is_file($dir . '/fiche.json') ? $dir : null;
}

/** Le fichier tel qu'il est arrive, ecrit d'un coup : le corpus le rejoue a l'octet pres. */
function ecrireAudit(string $dir, string $texte): void {
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier de l’audit impossible a creer.');
    $tmp = $dir . '/audit.json.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $texte) === false || !rename($tmp, $dir . '/audit.json')) { @unlink($tmp); erreur(500, 'SERVER_ERROR', 'Écriture impossible.'); }
}

/** La fiche, la conclusion et l'index d'un audit, apres son fichier. */
function ecrireFicheAudit(string $dA, string $dir, array $fiche, array $d): void {
    ecrireJson($dir . '/fiche.json', $fiche);
    ecrireJson($dir . '/decisions.json', decisionsAudit($d));
    $vue = $fiche;
    unset($vue['retrait']);
    $vue['dossier'] = substr($dir, strlen($dA) + 1);
    majIndex($dA, function (array $index) use ($vue) { $index[$vue['id']] = $vue; return $index; });
}

/** Un dossier et tout ce qu'il contient. */
function effacerDossier(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..') continue;
        is_dir($dir . '/' . $n) && !is_link($dir . '/' . $n) ? effacerDossier($dir . '/' . $n) : @unlink($dir . '/' . $n);
    }
    @rmdir($dir);
}

/** Les fiches des audits recus, les plus recents d'abord, sans l'empreinte du secret. */
function listeAudits(string $dA): array {
    $liste = array_values(indexAudits($dA));
    usort($liste, fn($a, $b) => strcmp((string)($b['recuLe'] ?? ''), (string)($a['recuLe'] ?? '')));
    return $liste;
}

// --- Les traces des analyses et des rejeux (MD/spec-audit.md 15.5) -----------------------------
// Un batch qui nomme son audit (`depot`, l'identifiant du serveur : l'analyse de la session apres sa
// sauvegarde, ou un rejeu) garde, dans le dossier de l'audit, tout ce qui est parti et tout ce qui
// est revenu : rien n'est jete. Le journal de claude/, lui, ne garde toujours ni photo ni reponse.
//
//   analyses/<AAAAMMJJ-HHMMSS>-<modele>-<xxxx>/entrant.json   prompt et schema envoyes (texte complet),
//                                                             modele, effort, chaque requete et ses
//                                                             blocs, les images par reference
//   .../sortant.json   chaque reponse : texte brut, sortie ramenee au schema, erreur, tokens, cout
//   .../resume.json    nature (analyse ou rejeu), etat, versions, comptes : ce que la liste montre
//   images/<sha256>.jpg   les images envoyees, une fois par audit (deux rejeux partagent les memes)

const ID_TRACE = '/^\d{8}-\d{6}-[a-z0-9-]{1,48}-[0-9a-f]{4}$/';
const EXTENSIONS_IMAGE = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
const IMAGE_TRACE = '/^[0-9a-f]{64}\.(jpg|png|webp|gif)$/';

/** Ce qui est parti chez Claude : les images rangees dans `images/`, remplacees par leur nom. */
function entrantTrace(array $demande, array $prompts, string $dir): array {
    $requetes = [];
    foreach ($demande['requetes'] as $r) {
        $blocs = [];
        foreach ($r['contenu'] as $b) {
            if ($b['type'] !== 'image') { $blocs[] = $b; continue; }
            $octets = (string)base64_decode($b['source']['data'], true);
            $nom = hash('sha256', $octets) . '.' . EXTENSIONS_IMAGE[$b['source']['media_type']];
            if (!is_dir($dir . '/images')) @mkdir($dir . '/images', 0750, true);
            if (!is_file($dir . '/images/' . $nom)) @file_put_contents($dir . '/images/' . $nom, $octets);
            $blocs[] = ['type' => 'image', 'media_type' => $b['source']['media_type'], 'image' => $nom, 'octets' => strlen($octets)];
        }
        $requetes[] = ['id' => $r['id'], 'passe' => $r['passe'], 'usage' => $r['usage'], 'modele' => $r['modele'], 'facades' => $r['facades'], 'images' => $r['images'], 'contenu' => $blocs];
    }
    $usages = [];
    foreach ($prompts as $usage => [$p, $s]) {
        $usages[$usage] = ['prompt' => $p['version'], 'schema' => $s['version'], 'systeme' => promptAvecSchema($p['texte'], $s['schema']), 'schemaJson' => $s['schema']];
    }
    return ['format' => 'plan-audit-entrant', 'version' => 1, 'max_tokens' => MAX_TOKENS, 'effort' => EFFORT, 'usages' => (object)$usages, 'requetes' => $requetes];
}

/** Le texte brut d'une ligne de resultats, tel que Claude l'a ecrit (blocs de texte bout a bout). */
function texteBrut($ligne): ?string {
    $m = is_object($ligne) && isset($ligne->result->message) && is_object($ligne->result->message) ? $ligne->result->message : null;
    if (!$m) return null;
    $texte = null;
    foreach (is_array($m->content ?? null) ? $m->content : [] as $b) if (is_object($b) && ($b->type ?? null) === 'text') $texte = ($texte ?? '') . (string)($b->text ?? '');
    return $texte;
}

/** Le dossier d'une trace, ou null. */
function dossierTrace(string $dA, string $audit, string $trace): ?string {
    $dir = preg_match(ID_TRACE, $trace) ? dossierAudit($dA, $audit) : null;
    return $dir !== null && is_file($dir . '/analyses/' . $trace . '/resume.json') ? $dir . '/analyses/' . $trace : null;
}

/** Les resumes des analyses et rejeux d'un audit, les plus recents d'abord. */
function listeTraces(string $dir): array {
    $liste = [];
    foreach (glob($dir . '/analyses/*/resume.json') ?: [] as $f) { $r = lireJson($f); if ($r !== null) $liste[] = $r; }
    usort($liste, fn($a, $b) => strcmp((string)($b['creeLe'] ?? ''), (string)($a['creeLe'] ?? '')));
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
    $schemas = [];
    $bruts = [];
    foreach (explode("\n", $texte) as $l) {
        if (trim($l) === '') continue;
        $ligne = json_decode($l);
        // Chaque reponse se ramene au schema de son usage (le renfort a le sien dans le batch de l'analyse).
        $usageL = (string)($fiche['requetes'][(string)(is_object($ligne) ? ($ligne->custom_id ?? '') : '')]['usage'] ?? $fiche['usage']);
        if (!array_key_exists($usageL, $schemas)) { try { $schemas[$usageL] = promptEtSchema($usageL)[1]['schema']; } catch (RuntimeException $e) { $schemas[$usageL] = null; } }
        $lus[] = lireResultat($ligne, $schemas[$usageL]);
        $bruts[(string)(is_object($ligne) ? ($ligne->custom_id ?? '') : '')] = texteBrut($ligne);
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
        $usageR = (string)($req['usage'] ?? $fiche['usage']);
        $sortie[] = $x + ['passe' => $req['passe'], 'usage' => $usageR, 'modele' => $modeleR, 'cout' => coutAppel($x['tokens'], $ligneTarif, true), 'trouve' => trouvailles($x, $usageR),
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
                         'arret' => $x['arret'], 'prompt' => $x['prompt'], 'schema' => $x['schema'], 'trouve' => $x['trouve']];
        }
        journaliser($dossierClaude, $lignes);
        if (is_array($fiche['trace'] ?? null)) completerTrace($fiche, $sortie, $bruts, $t);
        ecrireFiche($dossierBatches, ['journalise' => true, 'etat' => 'ended', 'finLe' => $fiche['finLe'] ?? null] + $actuelle);
    }
    if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
    foreach ($sortie as &$x) { unset($x['images'], $x['facades'], $x['tarif'], $x['modele'], $x['prompt'], $x['schema'], $x['trouve']); }
    unset($x);
    return ['sortie' => $sortie];
}

/**
 * La trace d'un batch qui nomme son audit, completee a la lecture de ses resultats (15.5) : chaque
 * reponse brute et remise en forme dans `sortant.json`, les comptes dans `resume.json`. Un audit
 * retire entre-temps n'a plus de dossier : rien ne s'ecrit.
 */
function completerTrace(array $fiche, array $sortie, array $bruts, string $t): void {
    global $dossierAudits;
    $dt = dossierTrace($dossierAudits, (string)($fiche['trace']['audit'] ?? ''), (string)($fiche['trace']['id'] ?? ''));
    if ($dt === null) return;
    $ordre = array_flip(array_map('strval', array_keys((array)$fiche['requetes'])));
    usort($sortie, fn($a, $b) => ($ordre[$a['id']] ?? PHP_INT_MAX) <=> ($ordre[$b['id']] ?? PHP_INT_MAX));
    $complets = [];
    $resume = [];
    $cout = null;
    $tokens = tokensDeUsage(null);
    foreach ($sortie as $x) {
        $commun = ['id' => $x['id'], 'passe' => $x['passe'], 'usage' => $x['usage'], 'modele' => $x['modele'], 'statut' => $x['statut'], 'arret' => $x['arret'],
                   'erreur' => $x['erreur'], 'tokens' => $x['tokens'], 'cout' => $x['cout'], 'trouve' => $x['trouve']];
        $complets[] = $commun + ['texte' => $bruts[$x['id']] ?? null, 'sortie' => $x['sortie'], 'tarif' => $x['tarif']];
        $resume[] = $commun;
        if ($x['cout'] !== null) $cout = ($cout ?? 0) + $x['cout'];
        foreach ($tokens as $k => $v) $tokens[$k] = $v + (int)($x['tokens'][$k] ?? 0);
    }
    ecrireJson($dt . '/sortant.json', ['format' => 'plan-audit-sortant', 'version' => 1, 'idBatch' => $fiche['id'], 'finLe' => $t, 'resultats' => $complets]);
    $r = lireJson($dt . '/resume.json') ?? [];
    ecrireJson($dt . '/resume.json', array_merge($r, ['etat' => 'termine', 'finLe' => $t, 'resultats' => $resume, 'cout' => $cout, 'tokens' => $tokens]));
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
        [$pR, $sR] = $prompts[$r['usage']];
        $x = lireResultat($lignesApi[$r['id']] ?? null, $sR['schema']);
        $ligneTarif = tarifEnVigueur($table, $r['modele'], substr($t, 0, 10));
        $cout = coutAppel($x['tokens'], $ligneTarif, false);
        $journal[] = ['t' => $t] + $identite + ['usage' => $r['usage'], 'modele' => $r['modele'], 'batch' => false, 'idBatch' => null, 'requete' => $r['id'], 'passe' => $r['passe'],
            'tokens' => $x['tokens'], 'images' => $r['images'], 'facades' => $r['facades'], 'cout' => $cout, 'tarif' => $ligneTarif['depuis'] ?? null, 'statut' => $x['statut'],
            'arret' => $x['arret'], 'prompt' => $pR['version'], 'schema' => $sR['version'], 'trouve' => trouvailles($x, $r['usage'])];
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
    // `admin/conformite` (.htaccess : `chemin=@conformite`) : les mesures des indicateurs (13.5, G3),
    // a l'administrateur seul.
    if ($chemin === '@conformite') {
        if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
        $fConformite = $dossier . '/conformite/mesures.json';
        $lu = lireJson($fConformite);
        $mesures = is_array($lu['mesures'] ?? null) ? $lu['mesures'] : [];
        if ($lecture) repondre(200, ['format' => 'plan-conformite', 'version' => 1, 'mesures' => $mesures]);
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MESURE_MAX + 1);
        if (strlen($texte) > TAILLE_MESURE_MAX) erreur(413, 'TOO_LARGE', 'Mesure trop grosse (2 Mo au plus).');
        $d = json_decode($texte, true);
        if ($d === null) throw new Refus('JSON illisible.');
        $mesure = verifierMesureConformite($d);
        $mesure['recuLe'] = maintenant();
        $mesures[] = $mesure;
        $gardees = array_slice($mesures, -MESURES_CONFORMITE_MAX);
        ecrireJson($fConformite, ['format' => 'plan-conformite', 'version' => 1, 'mesures' => $gardees]);
        repondre(201, ['recuLe' => $mesure['recuLe'], 'mesures' => count($gardees)]);
    }

    // `admin/audits` (.htaccess : `chemin=@audits/<id>`) : les audits de parcelle et de promenade
    // (15, L21), et pour chacun ses analyses et rejeux (15.5).
    if ($routeAudits) {
        $reste = trim(substr($chemin, strlen('@audits')), '/');
        $parts = $reste === '' ? [] : explode('/', $reste);
        $id = $parts[0] ?? '';
        if ($id === '') {
            if ($lecture) {
                if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
                repondre(200, ['audits' => listeAudits($dossierAudits)]);
            }
            if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
            $organisation = acteur($sessionAdmin, jetonPorteur(), $plateformeUrl)['organisation'];
            $texte = texteAudit();
            $d = json_decode($texte, true);
            if ($d === null) throw new Refus('JSON illisible.');
            $parcelle = verifierAudit($d);
            // Une promenade se depose par l'administrateur seul (son ecran des audits).
            if ($parcelle['nature'] === 'promenade' && !$sessionAdmin) erreur(403, 'FORBIDDEN', 'Réservé à l’administrateur.');
            $marque = marqueAudit((string)($_SERVER['HTTP_X_PLAN_DEPOT'] ?? ''));
            $t = maintenant();
            $id = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
            $retrait = bin2hex(random_bytes(24));
            $fiche = ['id' => $id, 'recuLe' => $t, 'organisation' => $organisation] + $parcelle
                + ['taille' => strlen($texte), 'marque' => $marque] + resumeAudit($d) + ['retrait' => hash('sha256', $retrait)];
            $dir = $dossierAudits . '/' . dossierRelatifAudit($fiche);
            ecrireAudit($dir, $texte);
            ecrireFicheAudit($dossierAudits, $dir, $fiche, $d);
            repondre(201, ['id' => $id, 'retrait' => $retrait]);
        }
        if (!preg_match(ID_AUDIT, $id)) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $id . ' ».');
        $dir = dossierAudit($dossierAudits, $id);
        $fiche = $dir !== null ? lireJson($dir . '/fiche.json') : null;
        if ($fiche === null || $dir === null) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $id . ' ».');

        // Ses analyses et rejeux, et les images qu'ils ont envoyees : a l'administrateur seul, en lecture.
        if (count($parts) > 1) {
            if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
            if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
            if ($parts[1] === 'analyses' && count($parts) === 2) repondre(200, ['analyses' => listeTraces($dir)]);
            if ($parts[1] === 'analyses' && count($parts) === 3) {
                $dt = dossierTrace($dossierAudits, $id, $parts[2]);
                if ($dt === null) erreur(404, 'NOT_FOUND', 'Aucune analyse « ' . $parts[2] . ' ».');
                repondre(200, ['format' => 'plan-audit-analyse-complete', 'version' => 1, 'audit' => $id, 'resume' => lireJson($dt . '/resume.json'),
                               'entrant' => lireJson($dt . '/entrant.json'), 'sortant' => lireJson($dt . '/sortant.json')]);
            }
            if ($parts[1] === 'images' && count($parts) === 3 && preg_match(IMAGE_TRACE, $parts[2]) && is_file($dir . '/images/' . $parts[2])) {
                $type = array_search(pathinfo($parts[2], PATHINFO_EXTENSION), EXTENSIONS_IMAGE, true);
                header('Content-Type: ' . $type);
                header('Cache-Control: private, max-age=86400, immutable');
                http_response_code(200);
                if ($methode !== 'HEAD') readfile($dir . '/images/' . $parts[2]);
                exit;
            }
            erreur(404, 'NOT_FOUND', 'Introuvable');
        }

        if ($lecture) {
            if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(200);
            if ($methode !== 'HEAD') readfile($dir . '/audit.json');
            exit;
        }
        if ($methode !== 'DELETE' && $methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        // Le secret rendu a l'envoi, ou l'administrateur : personne d'autre ne remplace ni ne retire un audit.
        $secret = (string)($_SERVER['HTTP_X_PLAN_RETRAIT'] ?? '');
        $proprietaire = $secret !== '' && hash_equals((string)($fiche['retrait'] ?? ''), hash('sha256', $secret));
        if ($methode === 'PUT') {
            // Remplacer : comme deposer (session admin ou jeton), et par le secret de ce depot ou
            // l'administrateur. L'identifiant, le secret, l'organisation et le dossier du premier envoi restent.
            acteur($sessionAdmin, jetonPorteur(), $plateformeUrl);
            if (!$sessionAdmin && !$proprietaire) erreur(403, 'FORBIDDEN', 'Secret de retrait invalide.');
            $texte = texteAudit();
            $d = json_decode($texte, true);
            if ($d === null) throw new Refus('JSON illisible.');
            $parcelle = verifierAudit($d);
            $marque = marqueAudit((string)($_SERVER['HTTP_X_PLAN_DEPOT'] ?? ''), (string)($fiche['marque'] ?? 'corpus'));
            ecrireAudit($dir, $texte);
            ecrireFicheAudit($dossierAudits, $dir, array_merge($fiche, ['recuLe' => maintenant()], $parcelle, ['taille' => strlen($texte), 'marque' => $marque], resumeAudit($d)), $d);
            repondre(200, ['id' => $id, 'remplace' => true]);
        }
        if (!$sessionAdmin && !$proprietaire) erreur(403, 'FORBIDDEN', 'Secret de retrait invalide.');
        // Retirer emporte tout le dossier de l'audit, analyses et images comprises : la personne qui
        // reprend son accord reprend aussi ce qui en a ete tire.
        effacerDossier($dir);
        majIndex($dossierAudits, function (array $index) use ($id) { unset($index[$id]); return $index; });
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
        repondre(200, ['actif' => $avecCle, 'modeles' => MODELES, 'usages' => USAGES, 'modelesParUsage' => modelesParUsage(reglageModeles($dossierClaude)), 'prompt' => $prompt['version'], 'schema' => $schema['version'], 'effort' => EFFORT,
                       'renfort' => $renfort, 'organisation' => $organisation, 'admin' => $qui['admin']]
                       + ($qui['admin'] ? ['donnees' => vueDonnees($donnees)] : []));
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

    // Le modele de chaque usage (13.2), a l'administrateur seul. Il vaut pour les envois suivants : un
    // batch deja cree garde le sien, ecrit dans sa fiche.
    if ($chemin === 'modeles') {
        $reserveAdmin();
        if ($lecture) repondre(200, vueModeles(reglageModeles($dossierClaude)));
        if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $d = verifierModeles(lireCorps(64 * 1024));
        // `usages` reste un objet en JSON, meme vide.
        ecrireJson($dossierClaude . '/modeles.json', ['format' => $d['format'], 'usages' => (object)$d['usages']]);
        repondre(200, vueModeles(reglageModeles($dossierClaude)));
    }

    if ($chemin === 'batches') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!$avecCle) $sansCle();
        $p = plafonds($dossierClaude);
        $demande = verifierDemande(lireCorps(TAILLE_MAX), $p, modelesParUsage(reglageModeles($dossierClaude)));
        // Le rejeu (15.5) : l'administrateur seul, sur un audit range, l'analyse des maisons seule.
        if ($demande['usage'] === 'rejeu') {
            $reserveAdmin();
            if ($demande['depot'] === null) throw new Refus('Un rejeu nomme son audit (depot).');
            foreach ($demande['requetes'] as $r) if ($r['usage'] !== 'rejeu') throw new Refus('Un rejeu ne porte que l’analyse des maisons.');
        }
        // La trace va dans le dossier de l'audit nomme. Un rejeu exige cet audit ; l'analyse de la
        // session, elle, part sans trace si son depot a ete retire entre-temps ou n'est pas le sien.
        $dirAudit = null;
        if ($demande['depot'] !== null) {
            $entree = indexAudits($dossierAudits)[$demande['depot']] ?? null;
            $sien = is_array($entree) && ($qui['admin'] || ($entree['organisation'] ?? null) === $organisation);
            if ($demande['usage'] === 'rejeu' && !is_array($entree)) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $demande['depot'] . ' ».');
            if ($sien) $dirAudit = dossierAudit($dossierAudits, $demande['depot']);
        }
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
        // La trace (15.5) : ce qui part, dans le dossier de l'audit ; ce qui revient la completera.
        $trace = null;
        if ($dirAudit !== null) {
            $idTrace = gmdate('Ymd-His') . '-' . nomSur($demande['modele'], 'modele', true) . '-' . bin2hex(random_bytes(2));
            $dt = $dirAudit . '/analyses/' . $idTrace;
            if (!is_dir($dt)) @mkdir($dt, 0750, true);
            ecrireJson($dt . '/entrant.json', entrantTrace($demande, $prompts, $dirAudit));
            $versions = [];
            foreach ($prompts as $u => [$pU, $sU]) $versions[$u] = ['prompt' => $pU['version'], 'schema' => $sU['version']];
            ecrireJson($dt . '/resume.json', ['format' => 'plan-audit-analyse', 'version' => 1, 'id' => $idTrace, 'audit' => $demande['depot'],
                'nature' => $demande['usage'] === 'rejeu' ? 'rejeu' : 'analyse', 'etat' => 'en_cours', 'creeLe' => $t, 'finLe' => null, 'idBatch' => $b['id'],
                'organisation' => $organisation, 'usage' => $demande['usage'], 'modele' => $demande['modele'], 'effort' => EFFORT, 'prompt' => $prompt['version'], 'schema' => $schema['version'],
                'versions' => (object)$versions, 'requetes' => count($demande['requetes']), 'images' => $images, 'facades' => $facades, 'resultats' => null, 'cout' => null, 'tokens' => null]);
            $trace = ['audit' => $demande['depot'], 'id' => $idTrace];
        }
        ecrireFiche($dossierBatches, ['id' => $b['id'], 'creeLe' => $t] + $identite + ['promptVersion' => $prompt['version'], 'schemaVersion' => $schema['version'],
                    'requetes' => $parRequete, 'etat' => $b['processing_status'] ?? null, 'journalise' => false, 'trace' => $trace]);
        repondre(201, ['batch' => vueBatch($b), 'modele' => $demande['modele'], 'prompt' => $prompt['version'], 'schema' => $schema['version'], 'trace' => $trace['id'] ?? null]);
    }

    if ($chemin === 'messages') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!$avecCle) $sansCle();
        $p = plafonds($dossierClaude);
        $d = lireCorps(TAILLE_MAX);
        if (is_array($d) && !isset($d['usage'])) $d['usage'] = 'renfort';
        if (is_array($d) && ($d['usage'] ?? null) === 'rejeu') throw new Refus('Un rejeu passe par un batch.');
        $demande = verifierDemande($d, ['requetesParBatch' => min(REQUETES_IMMEDIATES, (int)$p['requetesParBatch'])] + $p, modelesParUsage(reglageModeles($dossierClaude)));
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
