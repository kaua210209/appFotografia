// Edge Function: mp-webhook
// O Mercado Pago avisa aqui quando um pagamento muda de status. Em vez de confiar no
// aviso, consultamos o pagamento direto na API do Mercado Pago com o nosso token;
// só um pagamento realmente aprovado (e do valor certo) libera as fotos originais.
//
// Segredos: MP_ACCESS_TOKEN (obrigatório) e MP_WEBHOOK_SECRET (opcional, recomendado:
// "Assinatura secreta" do painel do Mercado Pago > Suas integrações > Webhooks).
//
// Deploy (precisa ficar público, o Mercado Pago não envia login):
//   supabase functions deploy mp-webhook --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ok = (msg = 'ok') => new Response(msg, { status: 200 })

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function validSignature(req: Request, url: URL, secret: string) {
  const header = req.headers.get('x-signature') ?? ''
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  if (!parts.ts || !parts.v1) return false
  const dataId = url.searchParams.get('data.id')
  const requestId = req.headers.get('x-request-id')
  let manifest = ''
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${parts.ts};`
  return safeEqual(await hmacHex(secret, manifest), parts.v1)
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpToken) return new Response('MP_ACCESS_TOKEN ausente', { status: 500 })

    const secret = Deno.env.get('MP_WEBHOOK_SECRET')
    if (secret && !(await validSignature(req, url, secret))) {
      return new Response('assinatura inválida', { status: 401 })
    }

    let type = url.searchParams.get('type') ?? url.searchParams.get('topic')
    let dataId: string | null = url.searchParams.get('data.id') ?? url.searchParams.get('id')
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (body) {
        type = body.type ?? body.topic ?? type
        dataId = body?.data?.id != null ? String(body.data.id) : dataId
      }
    }
    if (type !== 'payment' || !dataId) return ok('ignorado')

    // Consulta o pagamento na fonte.
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    })
    if (payRes.status === 404) return ok('pagamento desconhecido')
    if (!payRes.ok) return new Response('erro ao consultar o pagamento', { status: 502 }) // MP tenta de novo
    const payment = await payRes.json()

    const orderId = String(payment.external_reference ?? '')
    if (!orderId) return ok('sem pedido')

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    const { data: order } = await admin.from('orders').select('*').eq('id', orderId).maybeSingle()
    if (!order) return ok('pedido não encontrado')

    const { data: items } = await admin.from('order_items').select('photo_id').eq('order_id', order.id)
    const photoIds = (items ?? []).map((i: { photo_id: string }) => i.photo_id)
    const now = new Date().toISOString()

    switch (payment.status) {
      case 'approved': {
        // O valor pago precisa bater com o pedido.
        if (Math.round(Number(payment.transaction_amount) * 100) !== Math.round(Number(order.amount) * 100)) {
          console.error('Valor divergente', order.id, payment.transaction_amount, order.amount)
          return ok('valor divergente')
        }
        await admin
          .from('orders')
          .update({ status: 'aprovado', mp_payment_id: String(payment.id), paid_at: order.paid_at ?? now })
          .eq('id', order.id)
        if (photoIds.length) {
          await admin.from('private_photos').update({ unlocked_at: now }).in('id', photoIds).is('unlocked_at', null)
        }
        if (order.includes_album) {
          await admin.from('events').update({ album_paid: true }).eq('id', order.event_id)
        }
        break
      }

      case 'rejected':
      case 'cancelled': {
        if (order.status === 'pendente') {
          await admin
            .from('orders')
            .update({ status: payment.status === 'rejected' ? 'recusado' : 'cancelado', mp_payment_id: String(payment.id) })
            .eq('id', order.id)
        }
        break
      }

      case 'refunded':
      case 'charged_back': {
        if (order.status === 'aprovado') {
          await admin.from('orders').update({ status: 'reembolsado' }).eq('id', order.id)
          if (photoIds.length) {
            // Volta a bloquear as fotos que não estão em outro pedido aprovado.
            const { data: others } = await admin
              .from('order_items')
              .select('photo_id, orders!inner(status)')
              .in('photo_id', photoIds)
              .neq('order_id', order.id)
              .eq('orders.status', 'aprovado')
            const keep = new Set((others ?? []).map((o: { photo_id: string }) => o.photo_id))
            const relock = photoIds.filter((id: string) => !keep.has(id))
            if (relock.length) await admin.from('private_photos').update({ unlocked_at: null }).in('id', relock)
          }
          if (order.includes_album) {
            await admin.from('events').update({ album_paid: false }).eq('id', order.event_id)
          }
        }
        break
      }

      default:
        break // in_process, pending... aguardando
    }

    return ok()
  } catch (e) {
    console.error(e)
    return new Response('erro', { status: 500 })
  }
})
