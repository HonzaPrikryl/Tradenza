import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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
