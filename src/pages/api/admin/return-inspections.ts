import type { APIRoute } from 'astro';
import { adminActor } from '../../../features/auth/staffPolicy';
import { env } from 'cloudflare:workers';
import { inspectCustomerReturn } from '../../../features/kgame/returnInspection.ts';
export const prerender=false;
export const POST:APIRoute=async({request,redirect,locals})=>{
 const json=request.headers.get('content-type')?.includes('application/json');let orderId=0;
 try{
  let input:any;
  if(json)input=await request.json();
  else{const f=await request.formData();input={return_item_id:Number(f.get('return_item_id')),quantity:Number(f.get('quantity')),decision:f.get('decision'),condition:f.get('condition'),note:f.get('note'),confirmed:f.get('confirmed')==='on',resale_confirmed:f.get('resale_confirmed')==='on',request_id:f.get('request_id')};}
  const source=await env.DB.prepare('SELECT r.order_id FROM customer_return_items ri JOIN customer_returns r ON r.id=ri.return_id WHERE ri.id=?').bind(input.return_item_id).first<{order_id:number}>();orderId=source?.order_id??0;
  const result=await inspectCustomerReturn(env.DB,{...input,created_by:adminActor(locals.adminPrincipal)});return json?Response.json(result):redirect(`/admin/orders/${result.order_id}?success=return_inspected`,303);
 }catch(error){const message=error instanceof Error?error.message:'Không ghi được kết quả kiểm tra.';return json?Response.json({success:false,error:message},{status:/D1_ERROR|SQLITE_ERROR/.test(message)?500:400}):redirect(`/admin/orders/${orderId||''}?error=${encodeURIComponent(message)}`,303);}
};
