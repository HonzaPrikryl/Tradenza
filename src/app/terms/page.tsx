import type { Metadata } from 'next'
import { LegalShell, LH, LP, LUL, LA } from '@/components/legal/LegalShell'
import { LEGAL } from '@/lib/legal'
import { t } from '@/i18n'

export const metadata: Metadata = {
  title: t('legal.terms'),
  description: t('legal.termsDesc'),
}

export default function TermsPage() {
  return (
    <LegalShell title={t('legal.terms')} effectiveDate={LEGAL.effectiveDate}>
      <LP>
        These Terms govern your use of the hosted Tradenza service (the “Service”) operated by {LEGAL.operator}. By
        creating an account or using the Service, you agree to these Terms. If you do not agree, please do not use the
        Service.
      </LP>

      <LH>Eligibility</LH>
      <LP>You must be at least 18 years old and able to enter into a binding agreement to use the Service.</LP>

      <LH>The Service</LH>
      <LP>
        Tradenza is a trading journal and analytics tool for recording and reviewing your own trading activity. It helps
        you log trades, review executions, track statistics and build discipline.
      </LP>

      <LH>Not financial advice</LH>
      <LP>
        The Service is for informational and record-keeping purposes only. It does not provide financial, investment,
        tax or legal advice, and nothing in it is a recommendation to buy or sell any instrument. Statistics, charts and
        imported figures may contain errors or omissions. You are solely responsible for your trading decisions and
        should not rely on the Service as a basis for them.
      </LP>

      <LH>Your account</LH>
      <LP>
        You are responsible for keeping your login credentials secure and for all activity under your account. Notify us
        promptly of any unauthorised use.
      </LP>

      <LH>Your content</LH>
      <LP>
        You retain ownership of the data you enter or upload. You grant us a limited licence to store and process that
        data solely to operate the Service for you. You are responsible for ensuring you have the right to upload and
        use the content you provide, and that it is lawful.
      </LP>

      <LH>Acceptable use</LH>
      <LP>You agree not to:</LP>
      <LUL>
        <li>use the Service for any unlawful purpose;</li>
        <li>disrupt or interfere with the Service or other users’ access to it;</li>
        <li>attempt to bypass security controls or rate limits, or gain unauthorised access;</li>
        <li>scrape, or place undue automated load on, the Service.</li>
      </LUL>

      <LH>Availability</LH>
      <LP>
        The Service is provided on an “as is” and “as available” basis. It is under active, pre-1.0 development; we may
        change, suspend or discontinue features at any time and do not guarantee uninterrupted availability. Keep your
        own backups of important data (you can export your trades to CSV at any time).
      </LP>

      <LH>Disclaimers &amp; limitation of liability</LH>
      <LP>
        To the maximum extent permitted by law, the Service is provided without warranties of any kind, and we are not
        liable for any indirect, incidental or consequential damages, or for any trading losses, arising from your use
        of the Service. Nothing in these Terms limits liability that cannot be limited under applicable law.
      </LP>

      <LH>Termination</LH>
      <LP>
        You can stop using the Service and delete your account and data at any time from{' '}
        <strong>Settings → Global settings → Delete account</strong>. We may suspend or terminate access if you breach
        these Terms.
      </LP>

      <LH>Open-source software</LH>
      <LP>
        Tradenza’s source code is open source under the AGPL-3.0 licence (see the{' '}
        <LA href="https://github.com/HonzaPrikryl/tradenza">repository</LA>). Those licence terms govern the software
        itself; these Terms govern your use of this hosted Service.
      </LP>

      <LH>Governing law</LH>
      <LP>
        These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to its conflict-of-law rules.
      </LP>

      <LH>Changes</LH>
      <LP>
        We may update these Terms from time to time. We will revise the “Last updated” date above and, for material
        changes, take reasonable steps to notify you. Continued use after changes take effect constitutes acceptance.
      </LP>

      <LH>Contact</LH>
      <LP>
        Questions about these Terms? Email us at <LA href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</LA>.
      </LP>
    </LegalShell>
  )
}
