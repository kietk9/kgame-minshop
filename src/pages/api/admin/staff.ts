import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createStaff, updateStaff } from '../../../features/auth/staff';
import { adminCredential } from '../../../features/auth/admin';
export const prerender=false;
export const POST:APIRoute=async({request,locals,redirect,url})=>{
 if(locals.adminPrincipal?.role!=='OWNER')return new Response('Chỉ chủ cửa hàng được quản lý tài khoản.',{status:403});
 if(request.headers.get('origin')!==url.origin)return new Response('Yêu cầu không hợp lệ.',{status:403});
 try {
  if(!(await adminCredential(env.DB)).enabled)throw new Error('Cần thiết lập mật khẩu chủ cửa hàng trước khi tạo tài khoản nhân viên.');
  const form=await request.formData();
  const permissions=form.has('permissions_present')?form.getAll('permissions'):undefined;
  if(form.get('action')==='create')await createStaff(env.DB,locals.adminPrincipal,{username:form.get('username'),name:form.get('name'),role:form.get('role'),password:form.get('password'),permissions});
  else if(form.get('action')==='update')await updateStaff(env.DB,locals.adminPrincipal,{id:form.get('id'),role:form.get('role'),enabled:form.get('enabled')==='on',password:form.get('password'),permissions});
  else throw new Error('Thao tác không hợp lệ.');
  return redirect('/admin/staff?success=1',303);
 }catch(error){
  const raw=error instanceof Error?error.message:'';
  const message=/UNIQUE constraint/.test(raw)?'Tên đăng nhập đã được sử dụng.':/D1_ERROR|SQLITE/.test(raw)?'Không lưu được tài khoản. Vui lòng thử lại.':raw;
  return redirect('/admin/staff?error='+encodeURIComponent(message),303);
 }
};
