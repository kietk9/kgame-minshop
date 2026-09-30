import { describe,it,expect } from 'vitest';
import { defaultPermissions,validatePermissions,parsePermissions,withoutCosts,hasPermission,permissionKeys } from './permissions';
import { staffCanAccess,staffRequestAllowed } from './staffPolicy';
describe('individual permission boundary',()=>{
 it('defaults do not grant sensitive financial authority and malformed grants fail closed',()=>{
  expect(defaultPermissions('CASHIER')).toEqual(['sales.view','sales.create','sales.collect','sales.fulfill']);
  expect(parsePermissions('{bad')).toEqual([]);
  expect(()=>validatePermissions(['OWNER'])).toThrow();
  expect(()=>validatePermissions(['purchases.manage'])).toThrow();
  expect(()=>validatePermissions(['sales.refund'])).toThrow();
  expect(hasPermission(undefined,'sales.view')).toBe(false);
 });
 it('custom grants are independent of role templates and unknown endpoints remain closed',()=>{
  const cases=[['sales.view','/admin/orders','GET',''],['sales.create','/api/admin/orders','POST','create'],['sales.collect','/api/admin/orders','POST','add_payment'],['sales.fulfill','/api/admin/orders','POST','fulfill_preorder'],['sales.cancel','/api/admin/orders','POST','update_status'],['sales.return','/api/admin/customer-returns','POST',''],['sales.refund','/api/admin/order-refunds','POST',''],['inventory.adjust','/api/admin/inventory/outbound','POST',''],['inventory.adjust','/api/admin/return-disposals','POST',''],['reports.view','/admin/reports/staff','GET','']] as const;
  for(const [permission,path,method,action] of cases){
   expect(staffCanAccess('VIEWER',path,method,action,[permission])).toBe(true);
   expect(staffCanAccess('CASHIER',path,method,action,[])).toBe(false);
  }
  for(const path of ['/api/admin/staff','/api/admin/settings','/api/admin/quick-product'])expect(staffCanAccess('CASHIER',path,'POST','create',permissionKeys)).toBe(false);
  expect(staffCanAccess('VIEWER','/admin/purchases','GET','',['purchases.manage'])).toBe(false);
  expect(staffCanAccess('VIEWER','/admin/purchases','GET','',['purchases.manage','cost.view'])).toBe(true);
  expect(staffCanAccess('VIEWER','/admin/reports/financial','GET','',['reports.view'])).toBe(false);
 });
 it('cancel grant cannot authorize other status transitions in either transport',async()=>{
  const principal={role:'VIEWER' as const,id:1,name:'Staff',username:'staff',permissions:['sales.view','sales.cancel'] as const};
  for(const json of [true,false])for(const status of ['CANCELLED','COMPLETED']){
   const data=json?JSON.stringify({action:'update_status',status}):new URLSearchParams({action:'update_status',order_status:status}).toString();
   const req=new Request('https://shop.example/api/admin/orders',{method:'POST',headers:{'content-type':json?'application/json':'application/x-www-form-urlencoded'},body:data});
   expect(await staffRequestAllowed({...principal,permissions:[...principal.permissions]},req)).toBe(status==='CANCELLED');
  }
 });
 it('removes nested purchase costs and derived profits before serialization, preserving selling prices',()=>{
  const data={price_cents:100,lines:[{unit_cost_cents:47,profit:53}],cogs:47,meta:{margin:0.53,purchase_price_cents:47}};
  expect(withoutCosts(data)).toEqual({price_cents:100,lines:[{}],meta:{}});
  expect(data.lines[0].unit_cost_cents).toBe(47);
 });
});
