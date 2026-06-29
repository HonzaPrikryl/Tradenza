'use server'

import { auth } from '@clerk/nextjs/server'
import { randomUUID } from 'node:crypto'
import { isR2Configured, uploadToR2 } from '@/lib/r2'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type UploadResult =
  | { status: 'ok'; url: string }
  | { status: 'notConfigured' } // R2 env not set (e.g. local/self-host) → caller falls back to inline
  | { status: 'error'; message?: string }

/**
 * Store a note image in R2 and return its public URL. Falls back gracefully:
 * if R2 isn't configured the caller keeps embedding the image inline, so the
 * editor still works without object storage (local dev / self-host).
 */
export async function uploadNoteImage(form: FormData): Promise<UploadResult> {
  const { userId } = await auth()
  if (!userId) return { status: 'error', message: 'Unauthorized' }

  if (!isR2Configured()) return { status: 'notConfigured' }

  const file = form.get('file')
  if (!(file instanceof File)) return { status: 'error', message: 'No file' }
  if (file.size > MAX_BYTES) return { status: 'error', message: 'File too large' }

  const ext = EXT_BY_TYPE[file.type]
  if (!ext) return { status: 'error', message: 'Unsupported image type' }

  const key = `notes/${userId}/${randomUUID()}.${ext}`
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const url = await uploadToR2(key, bytes, file.type)
    return { status: 'ok', url }
  } catch (e) {
    console.error('[uploads] R2 upload failed', e)
    return { status: 'error', message: 'Upload failed' }
  }
}
