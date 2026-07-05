import type { Metadata } from 'next'
import { LegalShell, LH, LP, LUL, LA } from '@/components/legal/LegalShell'
import { LEGAL } from '@/lib/legal'
import { t } from '@/i18n'

export const metadata: Metadata = {
  title: t('legal.privacy'),
  description: t('legal.privacyDesc'),
}

export default function PrivacyPage() {
  return (
    <LegalShell title={t('legal.privacy')} effectiveDate={LEGAL.effectiveDate}>
      <LP>
        This Privacy Policy explains how {LEGAL.operator} (“we”, “us”) collects, uses and protects your personal data
        when you use the hosted Tradenza service (the “Service”). We aim to collect as little as possible and to give
        you full control over your data — including deleting it at any time.
      </LP>

      <LH>Who is responsible</LH>
      <LP>
        {LEGAL.operator} is the controller of the personal data processed through the Service. For any privacy question
        or to exercise your rights, contact us at <LA href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</LA>.
      </LP>

      <LH>Data we collect</LH>
      <LUL>
        <li>
          <strong>Account data</strong> — handled by our authentication provider (Clerk): your email address, name (if
          provided) and authentication metadata needed to sign you in.
        </li>
        <li>
          <strong>Content you create</strong> — the trading data you enter or import: trades, journal notes, tags,
          trading accounts, discipline rules and daily reviews, and any images you upload.
        </li>
        <li>
          <strong>Preferences</strong> — settings such as timezone, display unit and filters, stored in cookies in your
          browser.
        </li>
        <li>
          <strong>Technical &amp; diagnostic data</strong> — limited server logs and, if enabled, error reports used to
          keep the Service secure and working.
        </li>
      </LUL>
      <LP>We do not sell your data, and we do not use it for advertising or third-party ad tracking.</LP>

      <LH>How we use your data</LH>
      <LUL>
        <li>To provide and operate the Service (store and display your trades, statistics and journal).</li>
        <li>To keep the Service secure and reliable, including per-user rate limiting to prevent abuse.</li>
        <li>To diagnose and fix errors.</li>
        <li>To communicate with you about your account or important changes, where necessary.</li>
      </LUL>

      <LH>Legal bases (GDPR)</LH>
      <LP>
        Where the GDPR applies, we process your data to perform our contract with you (providing the Service), on the
        basis of our legitimate interests (security, error monitoring and improving the Service), and — where required —
        with your consent. You can withdraw consent at any time.
      </LP>

      <LH>Service providers</LH>
      <LP>
        We rely on a small set of infrastructure providers that process data on our behalf. Depending on the deployment,
        these may include:
      </LP>
      <LUL>
        <li>
          <strong>Clerk</strong> — authentication and account management.
        </li>
        <li>
          <strong>Neon</strong> — managed PostgreSQL database that stores your content.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
        <li>
          <strong>Cloudflare R2</strong> (optional) — storage for images you upload.
        </li>
        <li>
          <strong>Databento</strong> (optional) — historical market data for charts. We send only instrument symbols and
          timestamps — never your personal data.
        </li>
        <li>
          <strong>Sentry</strong> (optional) — error monitoring.
        </li>
        <li>
          <strong>Upstash</strong> (optional) — rate-limiting counters keyed by your user identifier.
        </li>
        <li>
          <strong>PostHog</strong> (optional) — privacy-respecting, cookieless product analytics hosted in the EU. We
          record which pages are viewed to understand usage; we do not use cookies for this and do not track you across
          other sites.
        </li>
      </LUL>
      <LP>
        Some providers are located outside your country (e.g. in the United States). Where personal data is transferred
        internationally, it is protected by appropriate safeguards such as standard contractual clauses.
      </LP>

      <LH>Cookies</LH>
      <LP>
        We use essential cookies for authentication (set by Clerk) and cookies that remember your preferences (timezone,
        display unit, filters). These are necessary for the Service to function. We do not use advertising cookies.
      </LP>

      <LH>Retention &amp; deletion</LH>
      <LP>
        We keep your data for as long as your account exists. You can permanently delete your account and all associated
        data at any time from <strong>Settings → Global settings → Delete account</strong>, or by contacting us. When an
        account is deleted, we erase the associated trades, notes, tags, accounts, discipline history and uploaded
        images.
      </LP>

      <LH>Your rights</LH>
      <LP>Subject to applicable law (including the GDPR), you have the right to:</LP>
      <LUL>
        <li>access the personal data we hold about you;</li>
        <li>correct inaccurate data (you can edit your content directly in the app);</li>
        <li>delete your data (see above);</li>
        <li>export your data — you can export your trades to CSV from within the app;</li>
        <li>object to or restrict certain processing;</li>
        <li>lodge a complaint with your local data protection authority.</li>
      </LUL>

      <LH>Security</LH>
      <LP>
        Data is transmitted over encrypted connections (TLS) and access is restricted. No method of transmission or
        storage is completely secure, but we take reasonable measures to protect your information.
      </LP>

      <LH>Children</LH>
      <LP>The Service is not intended for anyone under 18, and we do not knowingly collect data from children.</LP>

      <LH>Changes</LH>
      <LP>
        We may update this policy from time to time. We will revise the “Last updated” date above and, for material
        changes, take reasonable steps to notify you.
      </LP>

      <LH>Contact</LH>
      <LP>
        Questions about this policy or your data? Email us at{' '}
        <LA href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</LA>.
      </LP>
    </LegalShell>
  )
}
