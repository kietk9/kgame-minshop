import type { APIRoute } from 'astro';
import { adminActor } from '../../../features/auth/staffPolicy';
import { env } from 'cloudflare:workers';
import { returnPurchase } from '../../../features/kgame/purchaseReturns.ts';
export const prerender=false;
export const POST: APIRoute=async({request,redirect,locals})=>{
  const json=request.headers.get('content-type')?.includes('application/json');let receiptId=0;
  try{
    let input:any;
    if(json)input=await request.json();
    else{
      const form=await request.formData();
      input={receipt_id:Number(form.get('receipt_id')),request_id:form.get('request_id'),reason:form.get('reason'),confirmed:form.get('confirmed')==='on',
        items:[...form.entries()].filter(([key,value])=>key.startsWith('quantity:')&&Number(value)!==0).map(([key,value])=>({purchase_item_id:Number(key.slice(9)),quantity:Number(value)}))};
    }
    receiptId=Number(input.receipt_id)||0;
    const result=await returnPurchase(env.DB,{...input,created_by:adminActor(locals.adminPrincipal)});
    return json?Response.json(result):redirect(`/admin/purchases/${receiptId}?returned=${result.id}`,303);
  }catch(error){const message=error instanceof Error?error.message:'Không ghi được phiếu trả hàng.';
    return json?Response.json({success:false,error:message},{status:/D1_ERROR|SQLITE_ERROR/.test(message)?500:400}):redirect(`/admin/purchases/${receiptId||''}?error=${encodeURIComponent(message)}`,303);
  }
};
