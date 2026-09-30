export const permissionLabels = {
 'sales.view':'Xem đơn bán', 'sales.create':'Lập đơn bán / đặt trước', 'sales.collect':'Thu tiền đơn bán', 'sales.fulfill':'Giao đơn đặt trước',
 'cost.view':'Xem giá vốn', 'sales.price':'Đổi giá bán trên đơn', 'sales.discount':'Giảm giá trên đơn',
 'sales.debt':'Xuất bán khi khách còn nợ', 'sales.credit':'Dùng số dư khách thanh toán',
 'sales.cancel':'Hủy đơn bán chưa giao', 'sales.return':'Nhận hàng khách trả', 'sales.refund':'Ghi hoàn tiền khách',
 'purchases.manage':'Nhập mua, hủy/trả NCC và nhận hoàn (cần xem giá vốn)',
 'inventory.adjust':'Xuất dùng/hủy kho và kiểm tra hàng trả', 'reports.view':'Xem báo cáo',
} as const;
export type Permission = keyof typeof permissionLabels;
export const permissionKeys=Object.keys(permissionLabels) as Permission[];
export function defaultPermissions(role:string):Permission[]{return role==='CASHIER'?['sales.view','sales.create','sales.collect','sales.fulfill']:['sales.view'];}
export function parsePermissions(raw:unknown):Permission[]{
 let value=raw;
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{return [];}}
 if(!Array.isArray(value))return [];
 return permissionKeys.filter(p=>value.includes(p));
}
export function validatePermissions(raw:unknown):Permission[]{
 if(!Array.isArray(raw)||raw.some(p=>typeof p!=='string'||!permissionKeys.includes(p as Permission)))throw new Error('Danh sách quyền không hợp lệ.');
 const permissions=parsePermissions(raw);
 if(permissions.includes('purchases.manage')&&!permissions.includes('cost.view'))throw new Error('Quyền nhập mua cần quyền xem giá vốn vì chứng từ có giá mua.');
 if(permissions.some(p=>p.startsWith('sales.')&&p!=='sales.view')&&!permissions.includes('sales.view'))throw new Error('Quyền thao tác bán hàng cần quyền xem đơn bán.');
 return permissions;
}
export function hasPermission(principal:{role:string;permissions?:Permission[]}|undefined,permission:Permission):boolean {
 return !!principal && (principal.role==='OWNER'||(principal.permissions ?? []).includes(permission));
}
/** Remove sensitive fields before serialization, including nested preorder lines. */
export function withoutCosts<T>(value:T):T {
 if(Array.isArray(value))return value.map(v=>withoutCosts(v)) as T;
 if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(cost|cogs|profit|margin|purchase_price)/i.test(k)).map(([k,v])=>[k,withoutCosts(v)])) as T;
 return value;
}
export function posAuthority(principal:{role:string;permissions?:Permission[]}|undefined){
 return {price:hasPermission(principal,'sales.price'),discount:hasPermission(principal,'sales.discount'),debt:hasPermission(principal,'sales.debt'),credit:hasPermission(principal,'sales.credit')};
}
