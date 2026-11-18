import { supabase } from './supabase'

async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message
    try {
      const j = await error.context.json()
      if (j?.error) msg = j.error
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Edge Function "admin-users" (criar cliente, trocar senha, excluir).
export const adminUsers = (body) => callFunction('admin-users', body)

// Edge Function "create-checkout": cria o pedido e devolve o link de pagamento do Mercado Pago.
export const createCheckout = (body) => callFunction('create-checkout', body)
