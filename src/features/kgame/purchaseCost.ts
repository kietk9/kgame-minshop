import { integer } from './atomic.ts';

/** Largest remainder allocation: exact totals, stable line order on ties. */
function allocate(total: number, weights: number[]): number[] {
  integer(total, 'Tổng phân bổ');
  const sum=weights.reduce((a,b)=>a+BigInt(integer(b,'Trọng số')),0n);
  const effective=sum?weights:weights.map(()=>1),denominator=sum||BigInt(weights.length);
  if(!weights.length)throw new Error('Thiếu dòng hàng để phân bổ.');
  const shares=effective.map((weight,index)=>{const value=BigInt(total)*BigInt(weight);return {index,amount:Number(value/denominator),remainder:value%denominator};});
  let left=total-shares.reduce((s,x)=>s+x.amount,0);
  for(const row of [...shares].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!left)break;row.amount++;left--;}
  return shares.map(x=>x.amount);
}
export function purchaseCosts(items: Array<{quantity:number;unit_cost_cents:number;discount_cents?:number|null}>, discount=0, supplierFee=0, otherFee=0) {
  const net=items.map(it=>{const gross=integer(integer(it.quantity,'Số lượng',1)*integer(it.unit_cost_cents,'Giá nhập'),'Tổng dòng');const reduction=integer(it.discount_cents??0,'Giảm dòng');if(reduction>gross)throw new Error('Giảm giá vượt dòng hàng.');return gross-reduction;});
  const subtotal=integer(net.reduce((a,b)=>a+b,0),'Tổng hàng');
  if(integer(discount,'Giảm phiếu')>subtotal)throw new Error('Giảm giá vượt tổng hàng.');
  const discounts=allocate(discount,net),fees=allocate(integer(integer(supplierFee,'Phí NCC')+integer(otherFee,'Phí khác'),'Tổng phí'),net);
  return items.map((it,index)=>{const total=integer(net[index]-discounts[index]+fees[index],'Giá vốn dòng');return {discount:discounts[index],fee:fees[index],total,unit:Math.floor(total/it.quantity),remainder:total%it.quantity};});
}
