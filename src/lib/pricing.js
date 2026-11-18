// Regras de preço de um evento. Este cálculo serve só para MOSTRAR o valor na tela;
// o valor cobrado de verdade é recalculado no servidor (função create-checkout).
//
//  unit  -> cada foto custa unit_price
//  album -> album_price dá direito a album_photos_included fotos; cada foto a mais custa extra_photo_price

const cents = (v) => Math.round(Number(v) * 100)

export function saleConfigured(ev) {
  if (!ev) return false
  if (ev.sale_mode === 'album') {
    return cents(ev.album_price) > 0 && cents(ev.extra_photo_price) > 0 && Number(ev.album_photos_included) >= 1
  }
  return cents(ev.unit_price) > 0
}

// count = fotos escolhidas; unlockedCount = fotos do evento já liberadas
export function quote(ev, count, unlockedCount = 0) {
  if (ev.sale_mode === 'album') {
    const included = Number(ev.album_photos_included) || 0
    const remaining = ev.album_paid ? Math.max(0, included - unlockedCount) : included
    const extras = Math.max(0, count - remaining)
    const covered = count - extras
    const albumCents = ev.album_paid ? 0 : cents(ev.album_price)
    const totalCents = albumCents + extras * cents(ev.extra_photo_price)
    return {
      mode: 'album',
      included,
      remaining,
      covered,
      extras,
      chargesAlbum: !ev.album_paid,
      album: albumCents / 100,
      extraPrice: Number(ev.extra_photo_price) || 0,
      total: totalCents / 100,
    }
  }
  const unit = Number(ev.unit_price) || 0
  return { mode: 'unit', unitPrice: unit, total: (count * cents(unit)) / 100 }
}
