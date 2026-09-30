import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { hashPassword } from '../../src/features/auth/password.ts';
import { signSession } from '../../src/features/auth/session.ts';
const state=await mkdtemp(join(tmpdir(),'kgame-staff-http-'));
const port=process.env.STAFF_TEST_PORT || '8794',base=`http://127.0.0.1:${port}`;
const worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--persist-to',state,'--var','AUTH_SECRET:staff-isolated-test-key','--ip','127.0.0.1','--port',port],{stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false',X_LOCAL_OBSERVABILITY:'false'}});
let log='';worker.stdout.on('data',c=>log+=c);worker.stderr.on('data',c=>log+=c);
async function fetchLocal(path,opts={}){return fetch(base+path,{...opts,redirect:'manual',signal:AbortSignal.timeout(10000)});}
async function sql(query,params=[]){
 const res=await fetchLocal('/cdn-cgi/explorer/api/d1/database/DB/raw',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql:query,params:params.map(String)})});
 assert.equal(res.status,200,'Local Explorer SQL failed');const body=await res.json();assert.ok(body.success,JSON.stringify(body));
 const result=body.result[0].results;return result.rows.map(row=>Object.fromEntries(result.columns.map((c,i)=>[c,row[i]])));
}
const db={prepare(query){return {run:()=>sql(query)}}};
function post(path,body,cookie='',json=false,origin=base){return fetchLocal(path,{method:'POST',headers:{'content-type':json?'application/json':'application/x-www-form-urlencoded',origin,cookie},body:json?JSON.stringify(body):new URLSearchParams(body).toString()});}
function sessionCookie(res,name){return res.headers.getSetCookie().find(s=>s.startsWith(name+'='))?.split(';')[0];}
try {
 let ready=false;for(let i=0;i<50;i++){if(worker.exitCode!==null)throw new Error('Preview exited before ready');try{const res=await fetchLocal('/cdn-cgi/explorer/api');if(res.ok){ready=true;break;}}catch{}await delay(200);}
 assert.ok(ready,'Preview did not start');await applyKgameMigrations(db);
 const password=crypto.randomUUID(),ownerHash=await hashPassword(crypto.randomUUID());
 await sql("INSERT INTO settings(key,value) VALUES('setup_complete','1'),('admin_password_hash',?)",[ownerHash]);
 const ownerCookie='admin_session='+await signSession('staff-isolated-test-key',ownerHash,3600,Date.now()/1000);
 assert.equal((await fetchLocal('/admin/staff')).status,303);assert.equal((await post('/api/admin/orders',{},'',true)).status,401);
 for(const [username,role] of [['http.viewer','VIEWER'],['http.cashier','CASHIER']]){
  const res=await post('/api/admin/staff',{action:'create',username,name:'HTTP staff test',role,password},ownerCookie);if(res.status!==303)throw new Error('Create account HTTP '+res.status+': '+(await res.text()).slice(0,1800));assert.equal(res.headers.get('location'),'/admin/staff?success=1');
 }
 const ownerPage=await fetchLocal('/admin/staff',{headers:{cookie:ownerCookie}});assert.equal(ownerPage.status,200);assert.ok((await ownerPage.text()).includes('http.cashier'));
 const passwords=new Map();
 async function login(username){
  const current=passwords.get(username)||password;
  const res=await post('/admin/login',{username,password:current});assert.equal(res.status,303);
  const cookie=sessionCookie(res,'staff_session');assert.ok(cookie,'Login should issue staff session');
  if(res.headers.get('location')==='/admin/change-password'){
   const blocked=await fetchLocal('/admin/orders',{headers:{cookie}});assert.equal(blocked.status,303);assert.equal(blocked.headers.get('location'),'/admin/change-password');
   assert.equal((await post('/api/admin/orders',{action:'create'},cookie,true)).status,403);
   assert.equal((await fetchLocal('/admin/change-password',{headers:{cookie}})).status,200);
   const next=crypto.randomUUID();
   const changed=await post('/api/admin/staff-password',{current_password:current,new_password:next,confirm_password:next,id:'999999',role:'OWNER'},cookie);
   assert.equal(changed.status,303);assert.equal(changed.headers.get('location'),'/admin/login?password=changed');
   assert.equal((await post('/api/admin/orders',{},cookie,true)).status,401);
   passwords.set(username,next);
   const signed=await post('/admin/login',{username,password:next});assert.equal(signed.headers.get('location'),'/admin/my-access');return sessionCookie(signed,'staff_session');
  }
  return cookie;
 }
 const viewer=await login('http.viewer'),cashier=await login('http.cashier');
 assert.equal((await fetchLocal('/admin/orders',{headers:{cookie:viewer}})).status,200);
 assert.equal((await fetchLocal('/admin/sale',{headers:{cookie:viewer}})).status,403);
 assert.equal((await fetchLocal('/admin/sale',{headers:{cookie:cashier}})).status,200);
 assert.equal((await sql("SELECT count(*) n FROM staff_account_events WHERE action='SELF_PASSWORD_CHANGE'"))[0].n,2);
 console.log('✓ H05: first login forces personal password; direct sales API blocked until change; body account ID and role cannot redirect credential update');
 console.log('✓ H01: production-mode anonymous gate, owner account management and individual staff login work');
 for(const cookie of [viewer,cashier]){
  for(const path of ['/admin/staff','/admin/settings','/admin/setup','/admin/customers','/admin/reports/financial','/admin/purchases','/admin/orders/1.legacy'])assert.equal((await fetchLocal(path,{headers:{cookie}})).status,403,path);
  for(const path of ['/api/admin/staff','/api/admin/order-refunds','/api/admin/purchase-refunds','/api/admin/customer-returns','/api/admin/return-inspections','/api/admin/return-disposals','/api/admin/inventory/outbound','/api/admin/partners/pay-debt','/api/admin/orders/1'])assert.equal((await post(path,{},cookie,true)).status,403,path);
  for(const json of [false,true])assert.equal((await post('/api/admin/orders',{action:'update_status',order_id:'1',status:'CANCELLED'},cookie,json)).status,403);
 }
 assert.equal((await post('/api/admin/orders',{},viewer,true)).status,403);
 assert.equal((await post('/api/admin/orders',{},cashier,true,'https://other.example')).status,403);
 console.log('✓ H02: direct API calls, alternate form/JSON actions, configuration, unknown paths and cross-origin staff writes are denied');
 const products=await sql("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,cost_price_cents) VALUES('Staff HTTP product','staff-http-product',100,'vnd',2,2,0,'QUANTITY',40) RETURNING id");
 const sale={request_id:crypto.randomUUID(),created_by:'FORGED_OWNER',order_type:'ORDER',items:[{product_id:products[0].id,condition:'NEW',quantity:1,unit_price_cents:100}],payment:{amount_paid_cents:100,payment_method:'CASH',created_by:'FORGED_OWNER'},shipment:{carrier:'PICKUP'}};
 const beforeDenied=(await sql('SELECT count(*) n FROM orders'))[0].n;
 for(const override of [
  {items:[{...sale.items[0],unit_price_cents:99}],payment:{amount_paid_cents:99}},
  {discount_cents:1,payment:{amount_paid_cents:99}},
  {payment:{amount_paid_cents:99}},
  {payment:{amount_paid_cents:100,payment_method:'CREDIT'}},
 ]){const denied=await post('/api/admin/orders',{...sale,...override,request_id:crypto.randomUUID()},cashier,true);assert.ok(denied.status>=400,await denied.text());}
 assert.equal((await sql('SELECT count(*) n FROM orders'))[0].n,beforeDenied);
 const posHtml=await (await fetchLocal('/admin/sale',{headers:{cookie:cashier}})).text();
 const dataScript=posHtml.match(/window.POS_DATA = ([\s\S]*?);/);
 assert.ok(dataScript);assert.ok(!posHtml.includes('"cost_price_cents":40'));
 console.log('✓ P01: default cashier cannot forge selling price, discount, credit or debt; denied writes leave orders unchanged and catalog cost is absent');
 const sold=await post('/api/admin/orders',sale,cashier,true);assert.equal(sold.status,200);const order=await sold.json();assert.ok(order.id);
 const account=(await sql("SELECT id FROM staff_accounts WHERE username='http.cashier'"))[0];
 const expected=`NV#${account.id} (http.cashier)`;
 assert.equal((await sql('SELECT created_by FROM orders WHERE id=?',[order.id]))[0].created_by,expected);
 assert.equal((await sql('SELECT created_by FROM payments WHERE order_id=?',[order.id]))[0].created_by,expected);
 assert.equal((await sql('SELECT stock FROM products WHERE id=?',[products[0].id]))[0].stock,1);
 assert.equal((await post('/api/admin/orders',sale,viewer,true)).status,403);
 const partner=(await sql("INSERT INTO partners(partner_code,name,is_customer) VALUES('HTTP-STAFF-CUSTOMER','HTTP test customer',1) RETURNING id"))[0];
 const preorderRes=await post('/api/admin/orders',{...sale,request_id:crypto.randomUUID(),customer_id:partner.id,order_type:'PREORDER',payment:{amount_paid_cents:0,payment_method:'CASH'}},cashier,true);
 assert.equal(preorderRes.status,200);const preorder=await preorderRes.json();
 const paid=await post('/api/admin/orders',{action:'add_payment',order_id:preorder.id,request_id:crypto.randomUUID(),amount_paid_cents:20,payment_method:'CASH',created_by:'FAKE'},cashier,true);assert.equal(paid.status,200);
 const deniedFulfill=await post('/api/admin/orders',{action:'fulfill_preorder',order_id:preorder.id,request_id:crypto.randomUUID(),payment:{amount_paid_cents:0}},cashier,true);assert.ok(deniedFulfill.status>=400);
 const fulfilled=await post('/api/admin/orders',{action:'fulfill_preorder',order_id:preorder.id,request_id:crypto.randomUUID(),payment:{amount_paid_cents:80,payment_method:'CASH',created_by:'FAKE'}},cashier,true);assert.equal(fulfilled.status,200);
 assert.equal((await sql('SELECT stock FROM products WHERE id=?',[products[0].id]))[0].stock,0);
 for(const payment of await sql('SELECT created_by FROM payments WHERE order_id=?',[preorder.id]))assert.equal(payment.created_by,expected);
 const detail=await fetchLocal('/admin/orders/'+order.id,{headers:{cookie:viewer}});assert.equal(detail.status,200);assert.ok(!(await detail.text()).includes('action="/api/admin/customer-returns"'));
 console.log('✓ H03: cashier completes sale, payment and preorder fulfillment; stock changes correctly and forged actor is replaced by signed-in staff identity');
 // Custom rights must survive the template role and remain owner-controlled.
 const grants=['sales.view','sales.create','sales.collect','sales.fulfill','sales.price','sales.discount','sales.debt','sales.credit','sales.cancel','sales.return','sales.refund','inventory.adjust','reports.view'];
 const form=new URLSearchParams({action:'update',id:String(account.id),role:'VIEWER',enabled:'on',permissions_present:'1'});for(const p of grants)form.append('permissions',p);
 const granted=await post('/api/admin/staff',form,ownerCookie);assert.equal(granted.headers.get('location'),'/admin/staff?success=1');
 assert.equal((await fetchLocal('/admin/sale',{headers:{cookie:cashier}})).status,303);
 const custom=await login('http.cashier');
 assert.equal((await fetchLocal('/admin/sale',{headers:{cookie:custom}})).status,200);
 assert.equal((await fetchLocal('/admin/my-access',{headers:{cookie:custom}})).status,200);
 for(const path of ['/admin/inventory','/admin/inventory/outbound/new','/admin/reports/staff'])assert.equal((await fetchLocal(path,{headers:{cookie:custom}})).status,200,path);
 assert.equal((await fetchLocal('/admin/reports/financial',{headers:{cookie:custom}})).status,403);
 assert.equal((await fetchLocal('/admin/purchases',{headers:{cookie:custom}})).status,403);
 assert.equal((await post('/api/admin/staff',form,custom)).status,403);
 const discounted=await post('/api/admin/orders',{...sale,request_id:crypto.randomUUID(),order_type:'PREORDER',customer_id:partner.id,discount_cents:2,items:[{...sale.items[0],unit_price_cents:90}],payment:{amount_paid_cents:0}},custom,true);assert.equal(discounted.status,200,await discounted.clone().text());
 const customOrder=await discounted.json();
 const canceled=await post('/api/admin/orders',{action:'update_status',order_id:customOrder.id,status:'CANCELLED',request_id:crypto.randomUUID()},custom,true);assert.equal(canceled.status,200,await canceled.text());
 for(const path of ['/api/admin/customer-returns','/api/admin/order-refunds','/api/admin/return-inspections','/api/admin/return-disposals','/api/admin/inventory/outbound']){const res=await post(path,{},custom,true);assert.notEqual(res.status,403,path);assert.notEqual(res.status,200,path);}
 const returnRes=await post('/api/admin/customer-returns',{order_id:order.id,customer_id:partner.id,request_id:crypto.randomUUID(),reason:'HTTP defective test',confirmed:true,items:[{order_line_id:(await sql('SELECT id FROM order_lines WHERE order_id=?',[order.id]))[0].id,quantity:1}]},custom,true);assert.equal(returnRes.status,200,await returnRes.clone().text());
 const returnId=(await returnRes.json()).id,returnItem=(await sql('SELECT id FROM customer_return_items WHERE return_id=?',[returnId]))[0].id;
 assert.equal((await post('/api/admin/return-inspections',{return_item_id:returnItem,quantity:1,decision:'REJECT',confirmed:true,note:'Faulty',request_id:crypto.randomUUID()},custom,true)).status,200);
 const disposePayload={return_item_id:returnItem,quantity:1,reason:'Disposed test only',confirmed:true,request_id:crypto.randomUUID(),created_by:'FORGED_OWNER'};
 assert.equal((await post('/api/admin/return-disposals',disposePayload,viewer,true)).status,403);
 const wrongOrigin=await post('/api/admin/return-disposals',disposePayload,custom,true,'https://other.example');assert.equal(wrongOrigin.status,403);
 const disposedRes=await post('/api/admin/return-disposals',disposePayload,custom,true);assert.equal(disposedRes.status,200,await disposedRes.clone().text());
 assert.equal((await sql('SELECT created_by FROM customer_return_disposals WHERE return_item_id=?',[returnItem]))[0].created_by,expected);
 const disposedDetail=await (await fetchLocal('/admin/orders/'+order.id,{headers:{cookie:viewer}})).text();assert.ok(disposedDetail.includes('THL000001'));assert.ok(!disposedDetail.includes('action="/api/admin/return-disposals"'));assert.ok(!disposedDetail.includes('original_cost_cents'));
 assert.equal((await sql('SELECT stock FROM products WHERE id=?',[products[0].id]))[0].stock,0);
 console.log('✓ RD06: granted staff disposes rejected return through HTTP; viewer and foreign origin denied; actor trusted, history visible and original cost omitted');
 const buyForm=new URLSearchParams(form);buyForm.append('permissions','cost.view');buyForm.append('permissions','purchases.manage');
 assert.equal((await post('/api/admin/staff',buyForm,ownerCookie)).headers.get('location'),'/admin/staff?success=1');
 const buyer=await login('http.cashier');
 assert.equal((await fetchLocal('/admin/purchases',{headers:{cookie:buyer}})).status,200);
 assert.equal((await fetchLocal('/admin/reports/financial',{headers:{cookie:buyer}})).status,200);
 assert.ok((await (await fetchLocal('/admin/sale',{headers:{cookie:buyer}})).text()).includes('"cost_price_cents":40'));
 console.log('✓ P02: owner custom grants override template, revoke sessions, enable allowed routes/actions and protect costs/reports; staff cannot self-grant');
 const changed=await post('/api/admin/staff',{action:'update',id:String(account.id),role:'VIEWER',enabled:'on'},ownerCookie);assert.equal(changed.headers.get('location'),'/admin/staff?success=1');
 assert.equal((await post('/api/admin/orders',sale,cashier,true)).status,401);
 const fresh=await login('http.cashier');assert.equal((await post('/api/admin/orders',sale,fresh,true)).status,403);
 const voluntary=crypto.randomUUID();
 const blockedOrigin=await post('/api/admin/staff-password',{current_password:passwords.get('http.cashier'),new_password:voluntary,confirm_password:voluntary},fresh,false,'https://other.example');assert.equal(blockedOrigin.status,403);
 const voluntaryResult=await post('/api/admin/staff-password',{current_password:passwords.get('http.cashier'),new_password:voluntary,confirm_password:voluntary},fresh);
 assert.equal(voluntaryResult.headers.get('location'),'/admin/login?password=changed');assert.equal((await post('/api/admin/orders',sale,fresh,true)).status,401);
 passwords.set('http.cashier',voluntary);const logoutSession=await login('http.cashier');
 const logout=await fetchLocal('/admin/logout',{headers:{cookie:logoutSession}});assert.equal(logout.status,303);assert.equal((await post('/api/admin/orders',sale,logoutSession,true)).status,401);
 // Even with a valid owner cookie alongside it, a revoked staff session fails closed.
 assert.equal((await post('/api/admin/orders',sale,`${cashier}; ${ownerCookie}`,true)).status,401);
 console.log('✓ H04: role change and logout revoke sessions immediately; stale staff cookies cannot fall back to owner');
} catch(error) {
 console.error('Staff HTTP check failed:',error.message);
 // Keep diagnostic output bounded and avoid emitting cookies, credentials or the temporary path.
 console.error(log.slice(-8000).replaceAll(state,'<isolated-state>'));
 throw error;
} finally {
 const ended=new Promise(resolve=>worker.once('exit',resolve));worker.kill('SIGTERM');await Promise.race([ended,delay(5000)]);if(worker.exitCode===null)worker.kill('SIGKILL');await rm(state,{recursive:true,force:true});
}
