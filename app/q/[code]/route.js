export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Enlace corto y permanente de una mesa (el que va en el QR impreso): busca a qué mesa apunta el
// código y redirige a su enlace. Así el QR nunca cambia aunque cambie la mesa o el enlace.
export async function GET(req, { params }) {
  const { code } = await params;
  const origin = new URL(req.url).origin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!/^[a-z0-9]{6}$/.test(code || '') || !url || !anon) return Response.redirect(`${origin}/menu`, 302);
  try {
    const res = await fetch(`${url}/rest/v1/table_links?code=eq.${code}&select=table_id`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      cache: 'no-store',
    });
    const rows = res.ok ? await res.json() : [];
    const tableId = rows && rows[0] && rows[0].table_id;
    // 302 y no 301: el destino puede cambiar y el navegador no debe recordarlo
    return Response.redirect(tableId ? `${origin}/mesa/${tableId}` : `${origin}/menu`, 302);
  } catch (e) {
    return Response.redirect(`${origin}/menu`, 302);
  }
}
