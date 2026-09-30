import type { D1Database } from '@cloudflare/workers-types';
import { hashPassword, verifyPassword } from './password.ts';
import { adminActor, type AdminPrincipal, type StaffRole } from './staffPolicy.ts';
import { defaultPermissions, parsePermissions, validatePermissions } from './permissions.ts';
export const STAFF_TTL=12*3600;
interface Account {id:number;username:string;display_name:string;password_hash:string;role:StaffRole;enabled:number;session_version:number;locked_until:number;must_change_password:number;permissions_json:string;}
const dummyHash='pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
async function digest(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function validStaffInput(input: {username?:unknown;name?:unknown;role?:unknown;password?:unknown;permissions?:unknown}) {
 const username=String(input.username ?? '').trim().toLowerCase(), name=String(input.name ?? '').trim();
 if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) throw new Error('Tên đăng nhập cần 3–40 ký tự chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.');
 if(!name || name.length>100) throw new Error('Tên hiển thị cần từ 1 đến 100 ký tự.');
 if(input.role!=='VIEWER' && input.role!=='CASHIER') throw new Error('Vai trò không hợp lệ.');
 const password=String(input.password ?? '');
 if(password.length<12 || password.length>128) throw new Error('Mật khẩu cần từ 12 đến 128 ký tự.');
 const permissions=input.permissions===undefined?defaultPermissions(input.role):validatePermissions(input.permissions);
 return {username,name,role:input.role,password,permissions};
}
function owner(principal:AdminPrincipal){if(principal.role!=='OWNER')throw new Error('Chỉ chủ cửa hàng được quản lý tài khoản.');return adminActor(principal);}
export async function createStaff(db:D1Database,principal:AdminPrincipal,input:Parameters<typeof validStaffInput>[0]) {
 const actor=owner(principal),v=validStaffInput(input),hash=await hashPassword(v.password);
 await db.batch([
  db.prepare('INSERT INTO staff_accounts(username,display_name,role,password_hash,permissions_json) VALUES(?,?,?,?,?)').bind(v.username,v.name,v.role,hash,JSON.stringify(v.permissions)),
  db.prepare("INSERT INTO staff_account_events(staff_id,action,actor) SELECT id,'CREATE:' || role || ':' || permissions_json,? FROM staff_accounts WHERE username=?").bind(actor,v.username),
 ]);
}
export async function updateStaff(db:D1Database,principal:AdminPrincipal,input:{id:unknown;role:unknown;enabled:unknown;password?:unknown;permissions?:unknown}) {
 const actor=owner(principal),id=Number(input.id),role=input.role;
 if(!Number.isSafeInteger(id)||id<1||(role!=='VIEWER'&&role!=='CASHIER')||(input.enabled!==true&&input.enabled!==false))throw new Error('Thông tin tài khoản không hợp lệ.');
 const password=String(input.password ?? '');
 if(password && (password.length<12||password.length>128))throw new Error('Mật khẩu cần từ 12 đến 128 ký tự.');
 const hash=password?await hashPassword(password):null;
 const permissions=input.permissions===undefined?defaultPermissions(role):validatePermissions(input.permissions);
 const results=await db.batch([
  db.prepare("UPDATE staff_accounts SET role=?,enabled=?,permissions_json=?,password_hash=COALESCE(?,password_hash),must_change_password=CASE WHEN ? IS NOT NULL THEN 1 ELSE must_change_password END,session_version=session_version+1,failed_attempts=0,locked_until=0,updated_at=datetime('now') WHERE id=?").bind(role,input.enabled?1:0,JSON.stringify(permissions),hash,hash,id),
  db.prepare('DELETE FROM staff_sessions WHERE staff_id=?').bind(id),
  db.prepare('INSERT INTO staff_account_events(staff_id,action,actor) SELECT id,?,? FROM staff_accounts WHERE id=?').bind(`UPDATE:${role}:${input.enabled?'ENABLED':'DISABLED'}${hash?':PASSWORD_RESET':''}:${JSON.stringify(permissions)}`,actor,id),
 ]);
 if(!results[0].meta.changes)throw new Error('Không tìm thấy tài khoản.');
}
export async function loginStaff(db:D1Database,username:string,password:string,ownerCredential:string,now=Math.floor(Date.now()/1000)):Promise<string|null> {
 if(!ownerCredential || username.length>40 || password.length>128)return null;
 const row=await db.prepare('SELECT * FROM staff_accounts WHERE username=?').bind(username.trim().toLowerCase()).first<Account>();
 const ok=await verifyPassword(password,row?.password_hash ?? dummyHash);
 if(!row || !row.enabled || row.locked_until>now)return null;
 if(!ok){
  await db.prepare('UPDATE staff_accounts SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN ? ELSE locked_until END WHERE id=? AND password_hash=? AND session_version=?').bind(now+600,row.id,row.password_hash,row.session_version).run();return null;
 }
 const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const result=await db.batch([
  db.prepare('DELETE FROM staff_sessions WHERE expires_at<=?').bind(now),
  db.prepare('INSERT INTO staff_sessions(token_hash,staff_id,session_version,owner_credential_tag,expires_at) SELECT ?,id,session_version,?,? FROM staff_accounts WHERE id=? AND enabled=1 AND password_hash=? AND session_version=? AND locked_until<=?').bind(await digest(token),await digest(ownerCredential),now+STAFF_TTL,row.id,row.password_hash,row.session_version,now),
  db.prepare('UPDATE staff_accounts SET failed_attempts=0,locked_until=0 WHERE id=? AND EXISTS(SELECT 1 FROM staff_sessions WHERE token_hash=?)').bind(row.id,await digest(token)),
 ]);
 return result[1].meta.changes?token:null;
}
export async function resolveStaff(db:D1Database,token:string|undefined,ownerCredential:string,now=Math.floor(Date.now()/1000)):Promise<AdminPrincipal|null> {
 if(!token || !/^[a-f0-9]{64}$/.test(token) || !ownerCredential)return null;
 const row=await db.prepare('SELECT a.id,a.username,a.display_name,a.role,a.must_change_password,a.permissions_json FROM staff_sessions s JOIN staff_accounts a ON a.id=s.staff_id WHERE s.token_hash=? AND s.expires_at>? AND s.owner_credential_tag=? AND s.session_version=a.session_version AND a.enabled=1').bind(await digest(token),now,await digest(ownerCredential)).first<Account>();
 return row?{id:row.id,username:row.username,name:row.display_name,role:row.role,mustChangePassword:!!row.must_change_password,permissions:parsePermissions(row.permissions_json)}:null;
}
export async function logoutStaff(db:D1Database,token:string|undefined){if(token&&/^[a-f0-9]{64}$/.test(token))await db.prepare('DELETE FROM staff_sessions WHERE token_hash=?').bind(await digest(token)).run();}

/** Uses the live session as the sole account selector; body IDs and roles cannot retarget it. */
export async function changeStaffPassword(db:D1Database,token:string|undefined,ownerCredential:string,input:{current:unknown;password:unknown;confirmation:unknown},now=Math.floor(Date.now()/1000)) {
 const principal=await resolveStaff(db,token,ownerCredential,now);
 if(!principal || principal.id===null)throw new Error('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
 const current=String(input.current ?? ''),password=String(input.password ?? ''),confirmation=String(input.confirmation ?? '');
 if(!current || current.length>128)throw new Error('Vui lòng nhập mật khẩu hiện tại hợp lệ.');
 if(password.length<12 || password.length>128)throw new Error('Mật khẩu mới cần từ 12 đến 128 ký tự.');
 if(password!==confirmation)throw new Error('Hai lần nhập mật khẩu mới chưa khớp.');
 if(password===current)throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
 const row=await db.prepare('SELECT * FROM staff_accounts WHERE id=?').bind(principal.id).first<Account>();
 if(!row || !row.enabled)throw new Error('Tài khoản không còn hoạt động.');
 if(row.locked_until>now)throw new Error('Đã thử sai nhiều lần. Vui lòng đợi 10 phút hoặc liên hệ chủ cửa hàng.');
 if(!(await verifyPassword(current,row.password_hash))) {
  await db.prepare('UPDATE staff_accounts SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN ? ELSE locked_until END WHERE id=? AND password_hash=? AND session_version=?').bind(now+600,row.id,row.password_hash,row.session_version).run();
  throw new Error('Mật khẩu hiện tại không đúng.');
 }
 const hash=await hashPassword(password),tokenHash=await digest(token!),credentialTag=await digest(ownerCredential);
 // A concurrent reset, lock, logout or another password change must invalidate
 // this write after expensive hashing, with no partial audit/session changes.
 const guard=db.prepare(`SELECT CASE WHEN EXISTS(
  SELECT 1 FROM staff_accounts a JOIN staff_sessions s ON s.staff_id=a.id
  WHERE a.id=? AND a.enabled=1 AND a.password_hash=? AND a.session_version=? AND a.locked_until<=?
  AND s.token_hash=? AND s.session_version=a.session_version AND s.expires_at>? AND s.owner_credential_tag=?
 ) THEN 1 ELSE json('staff_password_change_conflict') END`).bind(row.id,row.password_hash,row.session_version,now,tokenHash,now,credentialTag);
 await db.batch([
  guard,
  db.prepare("UPDATE staff_accounts SET password_hash=?,must_change_password=0,session_version=session_version+1,failed_attempts=0,locked_until=0,updated_at=datetime('now') WHERE id=?").bind(hash,row.id),
  db.prepare('DELETE FROM staff_sessions WHERE staff_id=?').bind(row.id),
  db.prepare("INSERT INTO staff_account_events(staff_id,action,actor) VALUES(?,'SELF_PASSWORD_CHANGE',?)").bind(row.id,adminActor(principal)),
 ]);
}
