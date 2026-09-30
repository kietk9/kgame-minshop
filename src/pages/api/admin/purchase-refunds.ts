import type { APIRoute } from 'astro';
import { adminActor } from '../../../features/auth/staffPolicy';
import { env } from 'cloudflare:workers';
import { settleRefund } from '../../../features/kgame/refunds.ts';
import { parseMoneyText } from '../../../features/kgame/posInput.ts';

export const prerender=false;
export const POST: APIRoute=async({request,redirect,locals})=>{
  const json=request.headers.get('content-type')?.includes('application/json');
  let sourceId=0;
  try {
    let input: any;
    if(json) input=await request.json();
    else {
      const form=await request.formData();
      input={obligation_id:Number(form.get('obligation_id')),amount_cents:parseMoneyText(form.get('amount_cents')),
        request_id:form.get('request_id'),account_type:form.get('account_type'),bank_name:form.get('bank_name'),
        reference_code:form.get('reference_code'),note:form.get('note'),confirmed:form.get('confirmed')==='on'};
    }
    const source=await env.DB.prepare("SELECT source_id FROM kgame_refund_obligations WHERE id = ? AND source_type = 'PURCHASE'").bind(input.obligation_id).first<{source_id:number}>();
    sourceId=source?.source_id??0;
    const result=await settleRefund(env.DB,{...input,created_by:adminActor(locals.adminPrincipal)});
    return json?Response.json(result):redirect(`/admin/purchases/${sourceId}?refund=received`,303);
  }catch(error){
    const message=error instanceof Error?error.message:'Không ghi được khoản hoàn tiền.';
    if(json)return Response.json({success:false,error:message},{status:/D1_ERROR|SQLITE_ERROR/.test(message)?500:400});
    return redirect(`${sourceId?`/admin/purchases/${sourceId}`:'/admin/purchases'}?error=${encodeURIComponent(message)}`,303);
  }
};
