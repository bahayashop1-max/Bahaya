<?php
declare(strict_types=1);
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Content-Security-Policy: default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; form-action \'self\'; base-uri \'none\'');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', '1');
ini_set('session.cookie_samesite', 'Strict');
session_name('bahaya_orders_admin');
session_start();
$pin = getenv('BAHAYA_ORDERS_ADMIN_PIN') ?: '';
if (isset($_POST['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: /admin-ordrer.php');
    exit;
}
$loginError = '';
if (isset($_POST['pin'])) {
    $attempts = (int)($_SESSION['attempts'] ?? 0);
    $lastAttempt = (int)($_SESSION['last_attempt'] ?? 0);
    if (time() - $lastAttempt > 900) $attempts = 0;
    if ($attempts >= 5) {
        $loginError = 'For mange forsøg. Prøv igen om 15 minutter.';
    } elseif ($pin !== '' && is_string($_POST['pin']) && hash_equals($pin, $_POST['pin'])) {
        session_regenerate_id(true);
        $_SESSION['admin_authenticated'] = true;
        $_SESSION['attempts'] = 0;
        header('Location: /admin-ordrer.php');
        exit;
    } else {
        $_SESSION['attempts'] = $attempts + 1;
        $_SESSION['last_attempt'] = time();
        $loginError = 'Forkert pinkode.';
    }
}
if ($pin === '') {
    http_response_code(503);
    exit('Administrator-pinkode er ikke konfigureret.');
}
if (empty($_SESSION['admin_authenticated'])) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bahaya Shop · Admin</title><style>body{font:16px system-ui;background:#f3f6fa;display:grid;place-items:center;min-height:90vh}.card{background:white;padding:35px;border-radius:16px;box-shadow:0 5px 25px #0001;max-width:370px;width:90%}input,button{box-sizing:border-box;width:100%;padding:13px;margin-top:15px;border-radius:8px;font-size:18px}input{border:1px solid #aaa}button{background:#126b54;color:white;border:0}p{color:#a33}</style></head><body><form class="card" method="post" action="/admin-ordrer.php"><h2>Bahaya Shop</h2><div>Administrator · Ordrer og betalinger</div><label for="pin">Pinkode</label><input id="pin" type="password" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required autofocus><button type="submit">Log ind</button><p>'.htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8').'</p></form></body></html>';
    exit;
}
$key = getenv('STRIPE_SECRET_KEY') ?: '';
if (!preg_match('/\\A(?:sk|rk)_live_[A-Za-z0-9]+\\z/', $key)) {
    http_response_code(503);
    exit('Stripe er ikke konfigureret.');
}
function stripeGet(string $path, string $key): array {
    $ch = curl_init('https://api.stripe.com/v1/' . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>18, CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$key]]);
    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode(is_string($response) ? $response : '', true);
    if ($code !== 200 || !is_array($data)) {
        error_log('Bahaya admin Stripe list error HTTP ' . $code);
        http_response_code(502);
        exit('Kunne ikke hente data fra Stripe. Kontrollér Stripe-nøglens læserettigheder.');
    }
    return $data;
}
function h(mixed $value): string { return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function money(mixed $amount): string { return number_format(((int)$amount)/100, 2, ',', '.') . ' kr'; }
if (isset($_GET['session'])) {
    $id = (string)$_GET['session'];
    if (!preg_match('/\\Acs_(?:live|test)_[A-Za-z0-9]+\\z/', $id)) { http_response_code(400); exit('Ugyldigt ordre-id'); }
    $session = stripeGet('checkout/sessions/'.rawurlencode($id), $key);
    $lines = stripeGet('checkout/sessions/'.rawurlencode($id).'/line_items?limit=100', $key);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['session'=>[
        'id'=>$session['id']??'', 'payment_status'=>$session['payment_status']??'',
        'payment_method_types'=>$session['payment_method_types']??[],
        'amount_total'=>$session['amount_total']??0, 'currency'=>$session['currency']??'dkk',
        'customer'=>$session['metadata']['customer']??$session['customer_details']['name']??'',
        'phone'=>$session['metadata']['phone']??$session['customer_details']['phone']??'',
        'address'=>$session['metadata']['address']??'',
        'email'=>$session['customer_details']['email']??'',
        'created'=>$session['created']??0
    ], 'items'=>array_map(static fn($i)=>['name'=>$i['description']??'', 'qty'=>$i['quantity']??0, 'total'=>$i['amount_total']??0], $lines['data']??[])], JSON_UNESCAPED_UNICODE);
    exit;
}
$startingAfter = (string)($_GET['after'] ?? '');
$params = 'checkout/sessions?limit=50';
if ($startingAfter !== '' && preg_match('/\\Acs_(?:live|test)_[A-Za-z0-9]+\\z/', $startingAfter)) $params .= '&starting_after='.rawurlencode($startingAfter);
$sessions = stripeGet($params, $key);
$rows = $sessions['data'] ?? [];
$next = ($sessions['has_more']??false) && count($rows)>0 ? end($rows)['id'] : '';
?><!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bahaya Shop · Ordrer og betalinger</title><style>
:root{font-family:system-ui,Arial,sans-serif;color:#172437;background:#f3f6fa}*{box-sizing:border-box}body{margin:0}header{background:#103a31;color:white;padding:24px max(18px,calc((100vw - 1150px)/2))}h1{margin:0;font-size:25px}header p{margin:8px 0 0;color:#d7e9e3}main{max-width:1150px;margin:25px auto;padding:0 18px}.panel{background:white;border:1px solid #dce4e9;border-radius:13px;padding:18px;box-shadow:0 2px 10px #1020300b}.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}input{padding:12px;border:1px solid #c8d5de;border-radius:8px;min-width:250px;flex:1}button,.link{background:#136a54;color:white;border:0;padding:10px 15px;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #e6ebef;font-size:14px}th{color:#58687a}td{vertical-align:top}.paid{color:#096b40;font-weight:700}.unpaid{color:#a45b0b;font-weight:700}.muted{color:#66788b}.scroll{overflow:auto}.scroll table{min-width:780px}.details{margin-top:20px;display:none}.details.visible{display:block}.detailgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.detailgrid div{overflow-wrap:anywhere}small{display:block;color:#64748b;margin-bottom:5px}ul{padding-left:20px}.footer{margin-top:16px;color:#66788b;font-size:13px}</style></head><body>
<header><h1>Bahaya Shop · Ordrer & betalinger</h1><form method="post" action="/admin-ordrer.php" style="float:right"><button type="submit" name="logout" value="1">Log ud</button></form><p>Kun administrator · Stripe LIVE · Beløb og betalingsstatus hentes direkte fra Stripe</p></header><main><div class="panel"><div class="tools"><input id="search" type="search" placeholder="Søg navn, telefon, ordre eller adresse" aria-label="Søg ordrer"><button type="button" onclick="location.reload()">Opdater</button><span class="muted">Seneste <?=count($rows)?> bestillinger på denne side</span></div><div class="scroll"><table><thead><tr><th>Dato og tid</th><th>Kunde</th><th>Telefon</th><th>Adresse</th><th>Beløb</th><th>Betaling</th><th>Ordre</th></tr></thead><tbody>
<?php foreach($rows as $s): $m=$s['metadata']??[]; $paid=($s['payment_status']??'')==='paid'; $id=$s['id']??''; ?>
<tr><td><?=h(date('d-m-Y H:i',(int)($s['created']??0)))?></td><td><?=h($m['customer']??$s['customer_details']['name']??'—')?></td><td><?=h($m['phone']??$s['customer_details']['phone']??'—')?></td><td><?=h($m['address']??'—')?></td><td><?=h(money($s['amount_total']??0))?></td><td class="<?=$paid?'paid':'unpaid'?>"><?=$paid?'Betalt':h($s['payment_status']??'Afventer')?></td><td><button type="button" data-session="<?=h($id)?>" onclick="showOrder(this.dataset.session)">Vis varer</button></td></tr>
<?php endforeach; ?></tbody></table></div>
<?php if($next): ?><p><a class="link" href="?after=<?=rawurlencode($next)?>">Vis ældre ordrer</a></p><?php endif; ?>
<p class="footer">Bemærk: Betalingsmetoden kan kun vises præcist, hvis Stripe returnerer den. Betalingsstatus er Stripes aktuelle status. Denne oversigt indeholder Stripe Checkout-bestillinger, ikke manuelle butikskøb.</p></div>
<section class="panel details" id="details" aria-live="polite"><h2>Ordredetaljer</h2><div id="detailBody"></div></section></main>
<script>
document.getElementById('search').addEventListener('input',function(){const q=this.value.toLocaleLowerCase('da');document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLocaleLowerCase('da').includes(q));});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function showOrder(id){const box=document.getElementById('details'),target=document.getElementById('detailBody');box.classList.add('visible');target.textContent='Henter ordredetaljer…';box.scrollIntoView({behavior:'smooth'});try{const r=await fetch('?session='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Kunne ikke hente ordre');const d=await r.json(),s=d.session;target.innerHTML='<div class="detailgrid">'+[['Ordre-ID',s.id],['Kunde',s.customer],['Telefon',s.phone],['Adresse',s.address],['E-mail',s.email],['Betalingsstatus',s.payment_status],['Beløb',Number(s.amount_total/100).toLocaleString('da-DK',{minimumFractionDigits:2})+' kr'],['Dato',new Date(s.created*1000).toLocaleString('da-DK')]].map(([a,b])=>'<div><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong></div>').join('')+'</div><h3>Bestilte varer</h3><ul>'+d.items.map(i=>'<li>'+esc(i.name)+' · '+esc(i.qty)+' stk. · '+esc((i.total/100).toLocaleString('da-DK',{minimumFractionDigits:2}))+' kr</li>').join('')+'</ul>';}catch(e){target.textContent=e.message;}}
</script></body></html>