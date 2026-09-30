import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, object, text, requestKey, fingerprint, executeOperation, commitOperation } from './atomic.ts';
import { parseItem } from './posInput.ts';
import { prepareStock, writeStock } from './posStock.ts';
export async function createStockOutboundReceipt(db:D1Database,raw:unknown){
 const input=object(raw), kind=input.outbound_type, reason=text(input.reason), actor=text(input.created_by);
 if(kind!=='DISPOSAL'&&kind!=='INTERNAL_USE')throw new Error('Loại xuất kho không hợp lệ.');
 if(!reason)throw new Error('Cần ghi lý do xuất kho.');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw new Error('Phiếu cần từ 1 đến 100 dòng hàng.');
 const items=input.items.map(i=>parseItem({...object(i),unit_price_cents:0,discount_cents:0}));
 const key='outbound:'+requestKey(input.request_id), hash=await fingerprint({kind,reason,actor,items});
 return executeOperation(db,key,hash,async()=>{
  const batch=new AtomicBatch(db), lines=await prepareStock(batch,items);
  for(const line of lines){
   writeStock(batch,line,'NULL',[],false,{type:kind,reference:'OUTBOUND',note:reason+' — '+actor});
   if(line.product_unit_id)batch.add("UPDATE product_units SET availability=? WHERE id=?",kind==='DISPOSAL'?'DISPOSED':'INTERNAL_USE',line.product_unit_id);
  }
  batch.add('INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,?,?,?)',key,'STOCK_OUTBOUND',hash,JSON.stringify({success:true,count:lines.length}));
  return commitOperation<{success:boolean;count:number}>(batch,key,hash);
 });
}
