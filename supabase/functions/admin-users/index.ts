// Edge Function: admin-users
// Permite que SOMENTE o administrador crie clientes (com login e senha),
// troque a senha de um cliente e exclua um cliente.
// Usa a service role key (que nunca vai para o navegador).
//
// Deploy: supabase functions deploy admin-users

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1) Quem está chamando?
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return json({ error: 'Não autenticado.' }, 401)

    // 2) É administrador?
    const admin = createClient(url, service, { auth: { persistSession: false } })
    const { data: me } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (me?.role !== 'admin') return json({ error: 'Acesso negado.' }, 403)

    // 3) Executa a ação pedida
    const body = await req.json()

    if (body.action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const fullName = String(body.full_name ?? '').trim()
      if (!email || !fullName) return json({ error: 'Informe nome e e-mail.' }, 400)
      if (password.length < 8) return json({ error: 'A senha precisa ter ao menos 8 caracteres.' }, 400)

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
      if (error) {
        const msg = /already|registered|exists/i.test(error.message)
          ? 'Já existe um usuário com esse e-mail.'
          : error.message
        return json({ error: msg }, 400)
      }
      if (body.phone) {
        await admin.from('profiles').update({ phone: String(body.phone) }).eq('id', data.user.id)
      }
      return json({ id: data.user.id })
    }

    if (body.action === 'set_password') {
      const password = String(body.password ?? '')
      if (!body.id) return json({ error: 'Cliente não informado.' }, 400)
      if (password.length < 8) return json({ error: 'A senha precisa ter ao menos 8 caracteres.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.id, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'delete') {
      const id = String(body.id ?? '')
      if (!id) return json({ error: 'Cliente não informado.' }, 400)
      if (id === userData.user.id) return json({ error: 'Você não pode excluir a si mesmo.' }, 400)

      // Remove os arquivos do cliente do storage antes de apagar a conta.
      const { data: photos } = await admin.from('private_photos').select('path').eq('client_id', id)
      const paths = (photos ?? []).map((p: { path: string }) => p.path)
      for (let i = 0; i < paths.length; i += 100) {
        await admin.storage.from('private-photos').remove(paths.slice(i, i + 100))
      }

      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Erro inesperado.' }, 500)
  }
})
