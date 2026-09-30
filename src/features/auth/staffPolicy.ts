import { hasPermission, defaultPermissions, type Permission } from './permissions.ts';
export type StaffRole = 'VIEWER' | 'CASHIER';
export interface AdminPrincipal {
 role: 'OWNER' | StaffRole;
 id: number | null;
 username: string;
 name: string;
 mustChangePassword?: boolean;
 permissions?: Permission[];
}
export const roleLabels = {OWNER:'Chủ cửa hàng',VIEWER:'Chỉ xem bán hàng',CASHIER:'Thu ngân'};
export function adminActor(principal?: AdminPrincipal): string {
 if (!principal) throw new Error('Thiếu danh tính người thực hiện.');
 return principal.id === null ? principal.username : `NV#${principal.id} (${principal.username})`;
}
export function canonicalAdminPath(path: string): string {
 try { return decodeURIComponent(path).replace(/\/{2,}/g,'/').replace(/\/$/,'') || '/'; }
 catch { return path; }
}
/** Explicit allowlist: new routes and unknown actions remain owner-only. */
export function staffCanAccess(role: StaffRole, path: string, method: string, action='', permissions:Permission[]=defaultPermissions(role)): boolean {
 path=canonicalAdminPath(path);
 const can=(p:Permission)=>hasPermission({role,permissions},p);
 if(path==='/admin/my-access'||path==='/admin/change-password')return method==='GET'||method==='HEAD';
 if(path==='/api/admin/staff-password')return method==='POST';
 if(path==='/admin/logout')return method==='GET'||method==='POST';
 if(method==='GET'||method==='HEAD'){
  if(/^\/admin\/orders(?:\/\d+(?:\/print)?)?$/.test(path))return can('sales.view');
  if(path==='/admin/sale'||path==='/admin/orders/new')return can('sales.create')||can('sales.fulfill');
  if(path==='/api/admin/geo')return can('sales.create')||can('purchases.manage');
  if(/^\/admin\/purchases(?:\/(?:new|\d+(?:\/print)?))?$/.test(path))return can('purchases.manage')&&can('cost.view');
  if(path==='/admin/inventory'||path==='/admin/inventory/outbound/new')return can('inventory.adjust');
  if(path==='/admin/reports/staff')return can('reports.view');
  if(/^\/admin\/reports\/(daily|sales|orders|products|customers|financial)$/.test(path))return can('reports.view')&&can('cost.view');
  return false;
 }
 if(method!=='POST')return false;
 if(path==='/api/admin/orders'){
  const permission=({create:'sales.create',add_payment:'sales.collect',fulfill_preorder:'sales.fulfill',update_status:'sales.cancel'} as const)[action as 'create'];
  return !!permission&&can(permission);
 }
 if(path==='/api/admin/customer-returns')return can('sales.return');
 if(path==='/api/admin/order-refunds')return can('sales.refund');
 if(path==='/api/admin/return-inspections'||path==='/api/admin/return-disposals'||path==='/api/admin/inventory/outbound')return can('inventory.adjust');
 if(['/api/admin/purchases','/api/admin/purchase-returns','/api/admin/purchase-refunds'].includes(path))return can('purchases.manage')&&can('cost.view');
 return false;
}
export async function staffRequestAllowed(principal: AdminPrincipal, request: Request): Promise<boolean> {
 if(principal.role==='OWNER') return true;
 const path=canonicalAdminPath(new URL(request.url).pathname);
 if (principal.mustChangePassword && path!=='/admin/change-password' && path!=='/api/admin/staff-password' && path!=='/admin/logout') return false;
 let action='';
 if(request.method==='POST' && path==='/api/admin/orders') {
  try {
   const copy=request.clone();
   if(copy.headers.get('content-type')?.includes('application/json')) action=(await copy.json() as {action?: string}).action || 'create';
   else action=String((await copy.formData()).get('action') || 'create');
  } catch {return false;}
 }
  if(action==='update_status'){
  const copy=request.clone();
  try {const status=copy.headers.get('content-type')?.includes('application/json')?(await copy.json() as {status?:string}).status:(await copy.formData()).get('order_status');if(status!=='CANCELLED')return false;}catch{return false;}
 }
 return staffCanAccess(principal.role,path,request.method,action,principal.permissions ?? []);
}
