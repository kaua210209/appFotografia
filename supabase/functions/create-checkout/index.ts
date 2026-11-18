// Edge Function: create-checkout
// O cliente (logado) envia as fotos que escolheu. Aqui o PREÇO É CALCULADO NO SERVIDOR
// (o navegador nunca decide quanto cobrar), o pedido é gravado e uma preferência de
// pagamento do Mercado Pago (Pix, cartão de crédito e boleto) é criada.
//
// Segredos necessários (supabase secrets set ...):
//   MP_ACCESS_TOKEN  -> Access Token de PRODUÇÃO do Mercado Pago (APP_USR-...)
//   SITE_URL         -> endereço do site, ex.: https://meuestudio.com.br
//
// Deploy: supabase functions deploy create-checkout

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const toCents = (v: unknown) => Math.round(Number(v) * 100)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpToken) return json({ error: 'Os pagamentos ainda não foram configurados pelo estúdio.' }, 500)

    // 1) Quem está comprando?
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData } = await userClient.auth.getUser()
    const user = userData?.user
    if (!user) return json({ error: 'Não autenticado.' }, 401)

    // 2) O que ele quer comprar?
    const body = await req.json()
    const eventId = String(body.event_id ?? '')
    const photoIds: string[] = Array.from(new Set((body.photo_ids ?? []).map((x: unknown) => String(x))))
    if (!eventId || photoIds.length === 0) return json({ error: 'Selecione ao menos uma foto.' }, 400)
    if (photoIds.length > 1000) return json({ error: 'Selecione no máximo 1000 fotos por pedido.' }, 400)

    const admin = createClient(url, service, { auth: { persistSession: false } })

    const { data: ev } = await admin
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('client_id', user.id)
      .maybeSingle()
    if (!ev || !ev.gallery_released) return json({ error: 'Evento não encontrado.' }, 404)

    const { data: photos } = await admin
      .from('private_photos')
      .select('id, unlocked_at')
      .eq('event_id', ev.id)
      .eq('client_id', user.id)
      .in('id', photoIds)
    if (!photos || photos.length !== photoIds.length) {
      return json({ error: 'Algumas fotos não foram encontradas. Atualize a página.' }, 400)
    }
    if (photos.some((p: { unlocked_at: string | null }) => p.unlocked_at)) {
      return json({ error: 'Algumas dessas fotos já foram liberadas. Atualize a página.' }, 400)
    }

    // 3) Preço calculado aqui, com os valores gravados no evento.
    let totalCents = 0
    let includesAlbum = false

    if (ev.sale_mode === 'album') {
      const albumC = toCents(ev.album_price)
      const extraC = toCents(ev.extra_photo_price)
      const included = Number(ev.album_photos_included)
      if (!(albumC > 0) || !(extraC > 0) || !(included >= 1)) {
        return json({ error: 'Os valores deste álbum ainda não foram definidos pelo estúdio.' }, 400)
      }
      let remaining = included
      if (ev.album_paid) {
        const { count } = await admin
          .from('private_photos')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', ev.id)
          .not('unlocked_at', 'is', null)
        remaining = Math.max(0, included - (count ?? 0))
      }
      const extras = Math.max(0, photoIds.length - remaining)
      includesAlbum = !ev.album_paid
      totalCents = (ev.album_paid ? 0 : albumC) + extras * extraC
    } else {
      const unitC = toCents(ev.unit_price)
      if (!(unitC > 0)) return json({ error: 'O valor das fotos ainda não foi definido pelo estúdio.' }, 400)
      totalCents = photoIds.length * unitC
    }

    // 4) Pedidos pendentes antigos deste evento são substituídos por este novo.
    await admin
      .from('orders')
      .update({ status: 'cancelado' })
      .eq('client_id', user.id)
      .eq('event_id', ev.id)
      .eq('status', 'pendente')

    const free = totalCents === 0
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        client_id: user.id,
        event_id: ev.id,
        amount: totalCents / 100,
        includes_album: includesAlbum,
        status: free ? 'aprovado' : 'pendente',
        paid_at: free ? new Date().toISOString() : null,
      })
      .select()
      .single()
    if (orderErr || !order) return json({ error: 'Não foi possível criar o pedido.' }, 500)

    const { error: itemsErr } = await admin
      .from('order_items')
      .insert(photoIds.map((photo_id) => ({ order_id: order.id, photo_id })))
    if (itemsErr) {
      await admin.from('orders').delete().eq('id', order.id)
      return json({ error: 'Não foi possível criar o pedido.' }, 500)
    }

    // 5) Dentro da cota do álbum (nada a pagar): libera na hora.
    if (free) {
      await admin
        .from('private_photos')
        .update({ unlocked_at: new Date().toISOString() })
        .in('id', photoIds)
        .is('unlocked_at', null)
      return json({ free: true, order_id: order.id })
    }

    // 6) Mercado Pago: cria a preferência (Checkout Pro).
    const siteUrl = (Deno.env.get('SITE_URL') || req.headers.get('origin') || '').replace(/\/$/, '')
    if (!siteUrl) {
      await admin.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
      return json({ error: 'Endereço do site (SITE_URL) não configurado.' }, 500)
    }

    const title = `Fotos — ${ev.title}`.slice(0, 120)
    const preference: Record<string, unknown> = {
      items: [
        {
          id: order.id,
          title,
          description: `${photoIds.length} foto(s) em alta resolução, sem marca d'água`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: totalCents / 100,
        },
      ],
      payer: { email: user.email },
      external_reference: order.id,
      notification_url: `${url}/functions/v1/mp-webhook`,
      back_urls: {
        success: `${siteUrl}/minha-area?pagamento=sucesso`,
        pending: `${siteUrl}/minha-area?pagamento=pendente`,
        failure: `${siteUrl}/minha-area?pagamento=falha`,
      },
    }
    // O retorno automático exige endereço https.
    if (siteUrl.startsWith('https://')) preference.auto_return = 'approved'

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(preference),
    })
    const mp = await mpRes.json().catch(() => ({}))
    if (!mpRes.ok || !mp.init_point) {
      console.error('Mercado Pago recusou a preferência', mpRes.status, JSON.stringify(mp))
      await admin.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
      return json({ error: 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.' }, 502)
    }

    await admin
      .from('orders')
      .update({ mp_preference_id: mp.id, checkout_url: mp.init_point })
      .eq('id', order.id)

    return json({ checkout_url: mp.init_point, order_id: order.id })
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500)
  }
})
