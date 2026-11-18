export const EVENT_TYPES = [
  'Casamento',
  'Aniversário',
  'Formatura',
  'Ensaio fotográfico',
  'Evento corporativo',
  'Batizado / Religioso',
  'Família / Newborn',
  'Outro',
]

export const BOOKING_STATUS = {
  pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800' },
  confirmado: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-800' },
  concluido: { label: 'Concluído', cls: 'bg-sky-100 text-sky-800' },
  cancelado: { label: 'Cancelado', cls: 'bg-neutral-200 text-neutral-700' },
}

export const ORDER_STATUS = {
  pendente: { label: 'Aguardando pagamento', cls: 'bg-amber-100 text-amber-800' },
  aprovado: { label: 'Pago', cls: 'bg-emerald-100 text-emerald-800' },
  recusado: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
  cancelado: { label: 'Cancelado', cls: 'bg-neutral-200 text-neutral-700' },
  reembolsado: { label: 'Reembolsado', cls: 'bg-sky-100 text-sky-800' },
}

export function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Aceita "12,50", "12.50" e "1.250,00". Retorna número com 2 casas ou null.
export function parseMoney(text) {
  let s = String(text ?? '').trim().replace(/[^\d.,]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export const ALLOWED_TYPES =['image/jpeg', 'image/png', 'image/webp']
export const MAX_FILE_MB = 50

export function formatDate(value) {
  if (!value) return '—'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00') : new Date(value)
  return d.toLocaleDateString('pt-BR')
}
