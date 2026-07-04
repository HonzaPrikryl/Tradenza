import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

// Cloudflare R2 is S3-compatible, so we talk to it with the AWS S3 SDK pointed
// at the R2 endpoint. Used server-side to store binary uploads (e.g. note
// images) as objects and serve them by URL instead of bloating the database.

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL,
  )
}

let cached: S3Client | null = null

function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
      // R2 doesn't support the CRC32 checksum headers that @aws-sdk/client-s3
      // adds by default (since v3.729). Only send checksums when required, or
      // PutObject fails with "Header 'x-amz-checksum-crc32' not implemented".
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }
  return cached
}

/** Upload bytes to R2 and return the public URL (R2_PUBLIC_URL + key). */
export async function uploadToR2(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  const base = (process.env.R2_PUBLIC_URL as string).replace(/\/$/, '')
  return `${base}/${key}`
}

/**
 * Delete every object under a key prefix (paginated). Used to remove a user's
 * uploaded images when their account is deleted. Returns the number of objects
 * removed.
 */
export async function deleteR2Prefix(prefix: string): Promise<number> {
  const Bucket = process.env.R2_BUCKET_NAME
  let deleted = 0
  let ContinuationToken: string | undefined

  do {
    const list = await client().send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }))
    const objects = (list.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
    if (objects.length > 0) {
      await client().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects, Quiet: true } }))
      deleted += objects.length
    }
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (ContinuationToken)

  return deleted
}
