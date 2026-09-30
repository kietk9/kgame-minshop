import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { listBrands, createBrand, updateBrand, deleteBrand } from '../../../features/kgame/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const brands = await listBrands(env.DB);
    return new Response(JSON.stringify({ success: true, brands }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';

  // 1. JSON handling
  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as any;
      const action = body.action || 'create';

      if (action === 'create') {
        const res = await createBrand(env.DB, body.name, body.description);
        return new Response(JSON.stringify({ success: true, brand: res }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'update') {
        await updateBrand(env.DB, Number(body.id), body.name, body.description);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete') {
        await deleteBrand(env.DB, Number(body.id));
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Hành động không hợp lệ' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 2. FormData handling
  try {
    const form = await request.formData();
    const action = String(form.get('action') || 'create');

    if (action === 'create') {
      const name = String(form.get('name') || '').trim();
      const desc = String(form.get('description') || '').trim();
      await createBrand(env.DB, name, desc);
      return redirect('/admin/brands?success=created', 303);
    }

    if (action === 'update') {
      const id = Number(form.get('id'));
      const name = String(form.get('name') || '').trim();
      const desc = String(form.get('description') || '').trim();
      await updateBrand(env.DB, id, name, desc);
      return redirect('/admin/brands?success=updated', 303);
    }

    if (action === 'delete') {
      const id = Number(form.get('id'));
      await deleteBrand(env.DB, id);
      return redirect('/admin/brands?success=deleted', 303);
    }

    return redirect('/admin/brands', 303);
  } catch (err: any) {
    return redirect('/admin/brands?error=' + encodeURIComponent(err.message), 303);
  }
};
