import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { createStockOutboundReceipt } from '../../src/features/kgame/stockOutbound.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-20',d1Databases:['DB']});
try{
 const db=await mf.getD1Database('DB');await applyKgameMigrations(db);
 const p=await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,cost_price_cents) VALUES('Outbound','outbound-test',100,'vnd',4,4,0,'QUANTITY',40) RETURNING id").first();
 const input={request_id:crypto.randomUUID(),outbound_type:'DISPOSAL',reason:'Test disposal',created_by:'NV#1',items:[{product_id:p.id,quantity:1}]};
 const stock=async()=>(await db.prepare('SELECT stock FROM products WHERE id=?').bind(p.id).first()).stock;
 for(const quantity of [-1,0,0.5,5])await assert.rejects(createStockOutboundReceipt(db,{...input,items:[{product_id:p.id,quantity}]}));
 assert.equal(await stock(),4);
 await assert.rejects(createStockOutboundReceipt(db,{...input,items:[{product_id:p.id,quantity:1},{product_id:99999,quantity:1}]}));assert.equal(await stock(),4);
 const results=await Promise.all([createStockOutboundReceipt(db,input),createStockOutboundReceipt(db,input)]);assert.deepEqual(results[0],results[1]);assert.equal(await stock(),3);
 assert.equal((await db.prepare('SELECT count(*) n FROM inventory_transactions').first()).n,1);
 await db.prepare("CREATE TRIGGER fail_outbound BEFORE INSERT ON inventory_transactions BEGIN SELECT RAISE(ABORT,'test failure'); END").run();
 await assert.rejects(createStockOutboundReceipt(db,{...input,request_id:crypto.randomUUID()}));assert.equal(await stock(),3);
 await db.prepare('DROP TRIGGER fail_outbound').run();
 const race=await Promise.allSettled([1,2].map(()=>createStockOutboundReceipt(db,{...input,request_id:crypto.randomUUID(),items:[{product_id:p.id,quantity:2}]})));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(await stock(),1);
 console.log('✓ O01: outbound rejects invalid quantities and insufficient stock; retries are idempotent, concurrent writes cannot oversell, journal failure rolls back stock');
}finally{await mf.dispose();}
