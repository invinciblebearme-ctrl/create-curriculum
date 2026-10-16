import { Env } from '../../../types';
import { verifyAdminAuth } from '../../../middleware/auth';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await verifyAdminAuth(request, env);
  if (!auth.success) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB not bound' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json() as { orders: { id: string; sort_order: number }[] };
    const orders = body?.orders || [];

    for (const item of orders) {
      if (item.id && item.sort_order !== undefined) {
        try {
          await env.DB.prepare(
            'UPDATE books SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?'
          ).bind(item.sort_order, item.id).run();
        } catch {
          // Ignore if column doesn't exist yet
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: orders.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
