import { describe, it, expect } from 'vitest'
import { checkEnv } from './env'

const REQUIRED = {
  DATABASE_URL: 'postgres://x',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_x',
  CLERK_SECRET_KEY: 'sk_test_x',
}

const R2 = {
  R2_ACCOUNT_ID: 'a',
  R2_ACCESS_KEY_ID: 'b',
  R2_SECRET_ACCESS_KEY: 'c',
  R2_BUCKET_NAME: 'd',
  R2_PUBLIC_URL: 'https://e',
}

describe('checkEnv — required', () => {
  it('passes when all required variables are set', () => {
    const { errors, warnings } = checkEnv(REQUIRED)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('reports each missing required variable', () => {
    const { errors } = checkEnv({ DATABASE_URL: 'x' })
    expect(errors).toHaveLength(2)
    expect(errors.join(' ')).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
    expect(errors.join(' ')).toContain('CLERK_SECRET_KEY')
  })

  it('treats empty / whitespace values as unset', () => {
    const { errors } = checkEnv({ ...REQUIRED, DATABASE_URL: '   ' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('DATABASE_URL')
  })
})

describe('checkEnv — optional groups', () => {
  it('accepts a fully configured group without warnings', () => {
    const { errors, warnings } = checkEnv({ ...REQUIRED, ...R2 })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('warns when a group is partially configured', () => {
    const { errors, warnings } = checkEnv({ ...REQUIRED, R2_ACCOUNT_ID: 'a' })
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Cloudflare R2')
    expect(warnings[0]).toContain('R2_BUCKET_NAME')
  })

  it('warns on a partial Upstash config', () => {
    const { warnings } = checkEnv({ ...REQUIRED, UPSTASH_REDIS_REST_URL: 'https://x' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Upstash')
    expect(warnings[0]).toContain('UPSTASH_REDIS_REST_TOKEN')
  })
})
