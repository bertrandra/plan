<?php
// Les fonctions du relais Panoramax (banc/public/api.php) essayees une a une, sans reseau : le test (banc/tests/relais.test.ts) ecrit
// un scenario en JSON sur l'entree, ce script le joue avec un faux DNS et un faux catalogue, et rend ce qui s'est passe.
declare(strict_types=1);
require __DIR__ . '/../../public/api.php';

$s = json_decode((string)stream_get_contents(STDIN), true);
$dns = fn(string $hote): array => $s['dns'][$hote] ?? [];
$demandes = [];
$faux = function (string $url, string $hote, string $ip, int $max, int $delai) use (&$demandes, $s): array {
  $demandes[] = ['url' => $url, 'hote' => $hote, 'ip' => $ip, 'max' => $max];
  $r = $s['reponses'][$url] ?? ['code' => 404];
  $corps = isset($r['octets']) ? str_repeat("\0", (int)$r['octets']) : (isset($r['base64']) ? base64_decode($r['base64']) : (string)($r['corps'] ?? ''));
  $trop = strlen($corps) > $max;
  return ['code' => (int)$r['code'], 'entetes' => array_change_key_case($r['entetes'] ?? []), 'corps' => $trop ? '' : $corps, 'trop' => $trop];
};
$rendre = fn($v) => print(json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
try {
  switch ($s['mode']) {
    case 'ip': $rendre(array_map('relais_ip_publique', $s['ips'])); break;
    case 'destination':
      $rendre(array_map(function (string $u) use ($dns) { try { return relais_destination($u, $dns); } catch (RelaisRefus $e) { return $e->getMessage(); } }, $s['urls']));
      break;
    case 'image':
      try { $i = relais_image($s['id'], $s['taille'], $dns, $faux); $rendre(['type' => $i['type'], 'taille' => strlen($i['octets']), 'demandes' => $demandes]); }
      catch (RelaisRefus $e) { $rendre(['refus' => $e->getMessage(), 'code' => $e->getCode(), 'demandes' => $demandes]); }
      break;
    case 'demander':
      try { $r = relais_demander($s['url'], $s['hote'], $s['ip'], $s['max'], $s['delai'], false); $rendre(['code' => $r['code'], 'trop' => $r['trop'], 'taille' => strlen($r['corps']), 'location' => $r['entetes']['location'] ?? null]); }
      catch (RelaisRefus $e) { $rendre(['refus' => $e->getMessage(), 'code' => $e->getCode()]); }
      break;
    case 'https-seul':
      try { relais_demander($s['url'], $s['hote'], $s['ip'], 1000, 3); $rendre(['refus' => null]); } catch (RelaisRefus $e) { $rendre(['refus' => $e->getMessage()]); }
      break;
    case 'type': $rendre(array_map(fn(string $b) => relais_type(base64_decode($b)), $s['octets'])); break;
    case 'absolue': $rendre(array_map(fn(array $c) => relais_absolue($c[0], $c[1]), $s['cas'])); break;
  }
} catch (Throwable $e) { $rendre(['exception' => $e->getMessage()]); }
