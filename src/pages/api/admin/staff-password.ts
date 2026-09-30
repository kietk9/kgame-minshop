import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { adminCredential } from '../../../features/auth/admin';
import { changeStaffPassword } from '../../../features/auth/staff';
export const prerender=false;
export const POST:APIRoute=async({request,locals,cookies,redirect,url})=>{
 if(!locals.adminPrincipal || locals.adminPrincipal.role==='OWNER')return new Response('Chức năng này chỉ dành cho nhân viên đang đăng nhập.',{status:403});
 if(request.headers.get('origin')!==url.origin)return new Response('Yêu cầu không hợp lệ.',{status:403});
 try {
  const f=await request.formData(),credential=await adminCredential(env.DB);
  await changeStaffPassword(env.DB,cookies.get('staff_session')?.value,credential.tagSource,{current:f.get('current_password'),password:f.get('new_password'),confirmation:f.get('confirm_password')});
  cookies.delete('staff_session',{path:'/'});
  cookies.delete('admin_session',{path:'/'});
  return redirect('/admin/login?password=changed',303);
 }catch(error){
  const raw=error instanceof Error?error.message:'';
  const message=/D1_ERROR|SQLITE/.test(raw)?'Không đổi được mật khẩu. Phiên có thể đã thay đổi; hãy đăng nhập lại hoặc thử lại sau.':raw;
  return redirect('/admin/change-password?error='+encodeURIComponent(message),303);
 }
};
