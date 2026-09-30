import { describe,it,expect } from 'vitest';
import { staffCanAccess,staffRequestAllowed,adminActor } from './staffPolicy';
const cashier={id:1,username:'cashier',name:'Same name',role:'CASHIER' as const};
describe('staff permissions',()=>{
 it('only allows the explicit read surface, including unknown routes and legacy paths',()=>{
  for(const role of ['VIEWER','CASHIER'] as const){
   expect(staffCanAccess(role,'/admin/orders/12','GET')).toBe(true);
   expect(staffCanAccess(role,'/admin/orders/12/print','GET')).toBe(true);
   for(const path of ['/admin/setup','/admin/staff','/admin/settings','/admin/customers','/admin/orders/12.legacy','/admin/orders/12/edit','/api/admin/orders/12','/admin/unknown'])expect(staffCanAccess(role,path,'GET')).toBe(false);
  }
 });
 it('denies every mutation to viewers and reserves cancellation, refund, stock and unknown actions for owner',()=>{
  for(const action of ['create','add_payment','fulfill_preorder','update_status','cancel',''])expect(staffCanAccess('VIEWER','/api/admin/orders','POST',action)).toBe(false);
  for(const action of ['create','add_payment','fulfill_preorder'])expect(staffCanAccess('CASHIER','/api/admin/orders','POST',action)).toBe(true);
  expect(staffCanAccess('CASHIER','/api/admin/orders','POST','update_status')).toBe(false);
  for(const path of ['/api/admin/staff','/api/admin/order-refunds','/api/admin/purchase-refunds','/api/admin/customer-returns','/api/admin/inventory/outbound','/api/admin/partners/pay-debt','/api/admin/orders/12'])expect(staffCanAccess('CASHIER',path,'POST','create')).toBe(false);
 });
 it('checks the same action in JSON and form payloads without consuming the request',async()=>{
  for(const [type,body] of [['application/json',JSON.stringify({action:'update_status'})],['application/x-www-form-urlencoded','action=update_status']]){
   const req=new Request('https://shop.example/api/admin/orders',{method:'POST',headers:{'content-type':type},body});
   expect(await staffRequestAllowed(cashier,req)).toBe(false);expect(await req.text()).toBe(body);
  }
  expect(await staffRequestAllowed(cashier,new Request('https://shop.example/api/admin/orders',{method:'POST',headers:{'content-type':'application/json'},body:'{invalid'}))).toBe(false);
 });
 it('required password change only allows password settings and logout',async()=>{
  const restricted={...cashier,mustChangePassword:true};
  expect(await staffRequestAllowed(restricted,new Request('https://shop.example/admin/orders'))).toBe(false);
  expect(await staffRequestAllowed(restricted,new Request('https://shop.example/admin/change-password'))).toBe(true);
  expect(await staffRequestAllowed(restricted,new Request('https://shop.example/api/admin/staff-password',{method:'POST'}))).toBe(true);
  expect(staffCanAccess('VIEWER','/api/admin/staff-password','DELETE')).toBe(false);
 });
 it('normalizes encoded and trailing path forms; identity uses immutable account id',()=>{
  expect(staffCanAccess('VIEWER','/%61dmin/staff/','GET')).toBe(false);
  expect(staffCanAccess('VIEWER','/admin/orders/','GET')).toBe(true);
  expect(adminActor(cashier)).toBe('NV#1 (cashier)');expect(()=>adminActor()).toThrow();
 });
});
