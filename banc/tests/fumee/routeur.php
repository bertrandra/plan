<?php
// Le routeur de la fumee du banc (scripts/fumee-banc.mjs), pour `php -S` : la page du banc a la racine (?banc), comme en ligne, avec
// la politique de contenu de son .htaccess (celui du paquet construit, dist-banc/). Un refus de CSP se voit donc ici comme il se
// verrait en ligne. Tout le reste (banc/assets/…, banc/api.php) est servi tel quel par le serveur de PHP.
// Le dossier servi ne contient que banc/ -> dist-banc/ ; le mot de passe et les donnees sont fabriques sur place par le script
// (BANC_CONFIG), jamais ranges dans le depot.
$chemin = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($chemin !== '/') return false;
$banc = $_SERVER['DOCUMENT_ROOT'] . '/banc';
$ht = (string) @file_get_contents($banc . '/.htaccess');
if (!preg_match('/Content-Security-Policy "([^"]+)"/', $ht, $m)) { http_response_code(500); exit('Politique de contenu introuvable dans banc/.htaccess'); }
header('Content-Security-Policy: ' . $m[1]);
header('Content-Type: text/html; charset=utf-8');
readfile($banc . '/index.html');
return true;
