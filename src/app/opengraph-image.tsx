import { ImageResponse } from 'next/og'
import { t } from '@/i18n'

// Auto-wired by Next as the og:image (and used by Twitter as a fallback) for the
// whole site. Rendered on the server with next/og — no static asset needed.

export const alt = 'Tradenza — open-source trading journal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BG = '#0e1117'
const FG = '#e8eaf0'
const MUTED = '#8a93a6'
const PRIMARY = '#34d399'
const BORDER = '#272d38'

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: BG,
        padding: '72px',
        // Subtle emerald glow from the top, matching the landing hero.
        backgroundImage: `radial-gradient(900px 500px at 50% -10%, rgba(52,211,153,0.18), transparent 70%)`,
        fontFamily: 'sans-serif',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: PRIMARY,
          }}
        />
        <div style={{ display: 'flex', fontSize: '34px', fontWeight: 700, color: FG }}>Tradenza</div>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            fontSize: '68px',
            fontWeight: 700,
            lineHeight: 1.1,
            color: FG,
            maxWidth: '960px',
          }}
        >
          <span>Improve your trades with&nbsp;</span>
          <span style={{ color: PRIMARY }}>data, not feelings</span>
        </div>
        <div style={{ display: 'flex', marginTop: '28px', fontSize: '30px', color: MUTED, maxWidth: '900px' }}>
          {t('meta.ogDescription')}
        </div>
      </div>

      {/* Footer badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {['Open source', 'Self-hostable', 'Free forever'].map((label) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 18px',
              borderRadius: '999px',
              border: `1px solid ${BORDER}`,
              color: MUTED,
              fontSize: '22px',
            }}
          >
            <div
              style={{ display: 'flex', width: '10px', height: '10px', borderRadius: '999px', background: PRIMARY }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  )
}
