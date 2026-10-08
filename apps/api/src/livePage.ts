/** Self-contained page for Safari: sign in, then watch connections refresh. The token lives only in this tab's memory. */
export const livePageHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>choisys · conexiones en directo</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#000;color:#fff;font:16px/1.4 -apple-system,system-ui,sans-serif;font-weight:300;padding:20px}
h1{font-size:22px;font-weight:300;margin:0 0 14px}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #333;background:#111;color:#fff;width:100%;margin:6px 0;box-sizing:border-box}
button{background:#fff;color:#000}.row{border:1px solid #222;border-radius:12px;padding:12px;margin:10px 0}.row b{font-weight:500}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;background:#555}.on{background:#39ff14}.muted{color:#888;font-size:13px}#err{color:#ff2a2a}
</style></head><body>
<h1>Conexiones en directo</h1>
<form id="login"><input id="email" type="email" placeholder="Correo" autocomplete="username" required>
<input id="pass" type="password" placeholder="Contraseña" autocomplete="current-password" required><button>Entrar</button></form>
<p id="err"></p><div id="list"></div><p class="muted" id="meta"></p>
<script>
let token='';const $=id=>document.getElementById(id);
const ago=iso=>{const s=Math.max(0,Math.round((Date.now()-Date.parse(iso))/1000));return s<60?s+' s':s<3600?Math.round(s/60)+' min':Math.round(s/3600)+' h'};
async function api(path,opt){const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}});return{status:r.status,body:await r.json().catch(()=>({}))}}
async function tick(){if(!token)return;const r=await api('/admin/connections');
if(r.status===401){token='';$('login').hidden=false;$('err').textContent='Sesión caducada.';return}
if(r.status===403){$('err').textContent='Solo sudev puede ver esto.';return}
$('err').textContent='';const rows=r.body.connections||[];
$('list').innerHTML=rows.map(c=>'<div class="row"><span class="dot '+(c.active?'on':'')+'"></span><b>'+esc(c.displayName)+'</b> <span class="muted">'+esc(c.role==='SUPERDEV'?'sudev':c.role.toLowerCase())+'</span><br><span class="muted">'+esc(c.device)+' · '+esc(c.address)+'<br>desde hace '+ago(c.since)+' · última actividad hace '+ago(c.lastSeen)+' · '+c.requests+' peticiones</span></div>').join('')||'<p class="muted">Nadie conectado.</p>';
$('meta').textContent=rows.filter(c=>c.active).length+' activas · se actualiza cada 3 s'}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
$('login').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('pass').value})});
$('pass').value='';if(r.status!==200){$('err').textContent='Correo o contraseña incorrectos.';return}token=r.body.token;$('login').hidden=true;tick()});
setInterval(tick,3000);
</script></body></html>`;
