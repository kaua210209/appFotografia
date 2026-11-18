import { supabase } from './supabase'

export const PUBLIC_BUCKET = 'site'
export const PRIVATE_BUCKET = 'private-photos'
export const PREVIEW_BUCKET = 'previews'

export function fileExt(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : 'jpg'
}

export function newPath(folder, file) {
  return `${folder}/${crypto.randomUUID()}.${fileExt(file.name)}`
}

export async function uploadFile(bucket, path, file, { upsert = false } = {}) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert,
    contentType: file.type || undefined,
  })
  if (error) throw error
  return path
}

export function publicUrl(path) {
  if (!path) return ''
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function removeFiles(bucket, paths) {
  if (!paths.length) return
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

// Retorna { [path]: signedUrl } para fotos de um bucket privado
// (originais em PRIVATE_BUCKET ou prévias com marca d'água em PREVIEW_BUCKET).
export async function signedUrlsFor(paths, expiresIn = 3600, bucket = PRIVATE_BUCKET) {
  const map = {}
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths.slice(i, i + 100), expiresIn)
    ;(data || []).forEach((u) => {
      if (u.signedUrl) map[u.path] = u.signedUrl
    })
  }
  return map
}

// Executa tarefas com concorrência limitada. Retorna a lista de erros.
export async function runPool(items, worker, size = 3, onProgress) {
  let next = 0
  let done = 0
  const errors = []
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++
      try {
        await worker(items[idx], idx)
      } catch (error) {
        errors.push({ item: items[idx], error })
      }
      done++
      onProgress?.(done, items.length)
    }
  })
  await Promise.all(runners)
  return errors
}
