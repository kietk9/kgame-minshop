import type { APIRoute } from 'astro';
import { searchProvinces, searchWards, parseVietnameseAddress } from '../../../features/kgame/geoData';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get('type') || 'provinces';
  const q = url.searchParams.get('q') || '';
  const province = url.searchParams.get('province') || '';

  if (type === 'provinces') {
    const results = searchProvinces(q);
    return new Response(JSON.stringify({ success: true, data: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type === 'wards') {
    const results = searchWards(province, q);
    return new Response(JSON.stringify({ success: true, data: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type === 'parse') {
    const text = url.searchParams.get('text') || url.searchParams.get('address') || '';
    const parsed = parseVietnameseAddress(text);
    return new Response(JSON.stringify({ success: true, data: parsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: false, error: 'Invalid type' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
