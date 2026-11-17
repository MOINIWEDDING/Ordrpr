import { printDb, validToken } from '@/lib/print/db';
import { renderText } from '@/lib/print/receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Star CloudPRNT: la impresora consulta esta dirección cada pocos segundos.
//   POST   ¿hay trabajo?            → { jobReady, mediaTypes }
//   GET    dame el trabajo          → el ticket en texto
//   DELETE ya lo imprimí (?code=…)  → se marca como impreso
// En la impresora se configura como "Server URL" de CloudPRNT.

async function token(params) {
  const { token: t } = await params;
  return validToken(t) ? t : null;
}

export async function POST(req, { params }) {
  const t = await token(params);
  const db = printDb();
  if (!t || !db) return new Response(null, { status: 404 });
  const { data } = await db.rpc('print_peek', { token_input: t });
  return Response.json({ jobReady: Boolean(data), mediaTypes: ['text/plain'] });
}

export async function GET(req, { params }) {
  const t = await token(params);
  const db = printDb();
  if (!t || !db) return new Response(null, { status: 404 });
  const { data } = await db.rpc('print_take', { token_input: t });
  if (!data || !data.job) return new Response(null, { status: 204 });
  return new Response(renderText(data.job, data.printer && data.printer.paper), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Star-Cut': 'partial; feed=true' },
  });
}

export async function DELETE(req, { params }) {
  const t = await token(params);
  const db = printDb();
  if (!t || !db) return new Response(null, { status: 404 });
  const code = new URL(req.url).searchParams.get('code') || '';
  const ok = /^2/.test(code.trim()) || code === '';
  await db.rpc('print_ack', { token_input: t, job_input: null, ok_input: ok, error_input: ok ? null : code });
  return new Response(null, { status: 200 });
}
