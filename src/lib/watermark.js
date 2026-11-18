// Gera, no navegador do administrador, uma cópia reduzida da foto com marca d'água
// repetida em diagonal. É essa cópia (e não o original) que o cliente vê antes de pagar.

function drawWatermark(ctx, w, h, text) {
  const size = Math.max(16, Math.round(Math.min(w, h) / 14))
  ctx.save()
  ctx.font = `600 ${size}px Inter, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-Math.PI / 6)

  const stepX = ctx.measureText(text).width + size * 2.2
  const stepY = size * 3.4
  const diag = Math.hypot(w, h)
  ctx.lineJoin = 'round' // evita "pontas" nos contornos das letras
  ctx.lineWidth = Math.max(1, size / 14)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'

  let row = 0
  for (let y = -diag / 2; y <= diag / 2; y += stepY, row++) {
    const offset = row % 2 ? stepX / 2 : 0
    for (let x = -diag / 2 + offset; x <= diag / 2; x += stepX) {
      ctx.strokeText(text, x, y)
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()
}

// file: File ou Blob da imagem original. Retorna um Blob JPEG.
export async function makePreview(file, text, maxSize = 1600) {
  const label = (text || '').trim() || 'AMOSTRA'
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  drawWatermark(ctx, w, h, label)

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a prévia.'))), 'image/jpeg', 0.82),
  )
  canvas.width = canvas.height = 0 // libera memória
  return blob
}
