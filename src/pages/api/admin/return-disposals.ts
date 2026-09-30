import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { adminActor } from '../../../features/auth/staffPolicy';
import { hasPermission } from '../../../features/auth/permissions';
import { disposeCustomerReturn } from '../../../features/kgame/returnDisposal.ts';
export const prerender=false;
export const POST:APIRoute=async({request,redirect,locals})=>{
 if(!hasPermission(locals.adminPrincipal,'inventory.adjust'))return new Response('Bạn chưa được cấp quyền xử lý kho.',{status:403});
 const json=request.headers.get('content-type')?.includes('application/json');let orderId=0;
 try{
  let input:any;
  if(json)input=await request.json();
  else{const f=await request.formData();input={return_item_id:Number(f.get('return_item_id')),quantity:Number(f.get('quantity')),reason:f.get('reason'),confirmed:f.get('confirmed')==='on',request_id:f.get('request_id')};}
  if(!Number.isSafeInteger(input.return_item_id)||input.return_item_id<1)throw new Error('Dòng trả hàng không hợp lệ.');
  const source=await env.DB.prepare('SELECT r.order_id FROM customer_return_items ri JOIN customer_returns r ON r.id=ri.return_id WHERE ri.id=?').bind(input.return_item_id).first<{order_id:number}>();orderId=source?.order_id??0;
  const result=await disposeCustomerReturn(env.DB,{...input,created_by:adminActor(locals.adminPrincipal)});
  return json?Response.json(result):redirect(`/admin/orders/${result.order_id}?success=return_disposed#return-inspections`,303);
 }catch(error){const message=error instanceof Error?error.message:'Không ghi được phiếu tiêu hủy.';return json?Response.json({success:false,error:message},{status:/D1_ERROR|SQLITE_ERROR/.test(message)?500:400}):redirect(`/admin/orders/${orderId||''}?error=${encodeURIComponent(message)}#return-inspections`,303);}
};
