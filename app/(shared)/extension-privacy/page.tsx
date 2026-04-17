import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — BiotechOS Quote Assistant Chrome Extension',
  description: 'Privacy policy for the BiotechOS Quote Assistant Chrome Extension.',
};

export default function ExtensionPrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif', fontSize: 15, lineHeight: 1.7, color: '#202124' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: '#5f6368', marginBottom: 32 }}>
        BiotechOS Quote Assistant — Chrome Extension<br />
        Last updated: April 2026
      </p>

      <Section title="Overview">
        The BiotechOS Quote Assistant (&ldquo;Extension&rdquo;) is a Chrome extension that helps
        preclinical Contract Research Organizations (CROs) generate quotes and proposals directly
        from Gmail. This policy explains what data the Extension accesses, how it is used, and
        what is never collected or stored.
      </Section>

      <Section title="Who we are">
        The Extension is published by BiotechOS. For privacy enquiries contact{' '}
        <a href="mailto:privacy@biotechos.com" style={{ color: '#1a73e8' }}>privacy@biotechos.com</a>.
      </Section>

      <Section title="What data the Extension accesses">
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Email content</strong> — when you click the &ldquo;✦ Quote&rdquo; button on an
            email, the Extension reads the body text and sender address of that email. This text is
            sent to the BiotechOS API to analyse the study request and generate a quote.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Email subject line</strong> — read from the current Gmail thread to provide
            context to the analysis.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Authentication state</strong> — the Extension checks whether you are signed in
            to BiotechOS by reading your BiotechOS session cookie. This check happens on every
            Gmail page load. The cookie value is never logged or stored by the Extension.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Extension settings</strong> — your API base URL preference and first-run
            onboarding flag are stored in <code>chrome.storage.sync</code> (synced to your Google
            account) and <code>chrome.storage.local</code>. No email content is stored here.
          </li>
        </ul>
      </Section>

      <Section title="What we do NOT collect">
        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
          <li style={{ marginBottom: 6 }}>We do not store, log, or index your email content on our servers beyond what is needed to generate the quote in real time.</li>
          <li style={{ marginBottom: 6 }}>We do not read emails unless you explicitly click the ✦ Quote button.</li>
          <li style={{ marginBottom: 6 }}>We do not access your Gmail contacts, calendar, or attachments.</li>
          <li style={{ marginBottom: 6 }}>We do not sell, rent, or share your data with third parties for advertising.</li>
          <li style={{ marginBottom: 6 }}>We do not track your browsing activity outside of Gmail.</li>
        </ul>
      </Section>

      <Section title="How email content is used">
        When you click ✦ Quote, the selected email body is sent over HTTPS to the BiotechOS API.
        The API uses Anthropic&rsquo;s Claude AI model to extract study parameters (assay type, species,
        timeline, etc.) and generate a draft proposal scope. The raw email text is used only for
        this generation step and is not retained in our database. The generated quote and its
        structured data are saved to your BiotechOS account.
      </Section>

      <Section title="Third-party AI processing">
        Quote generation uses the Anthropic Claude API. Email content sent for analysis is subject
        to{' '}
        <a href="https://www.anthropic.com/legal/privacy" style={{ color: '#1a73e8' }} target="_blank" rel="noopener">
          Anthropic&rsquo;s Privacy Policy
        </a>
        . Anthropic does not use API inputs to train its models by default.
      </Section>

      <Section title="Data security">
        All communication between the Extension and the BiotechOS API uses HTTPS. Authentication
        uses your existing BiotechOS session — no additional credentials are stored by the
        Extension.
      </Section>

      <Section title="Permissions used and why">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid #e8eaed' }}>Permission</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', border: '1px solid #e8eaed' }}>Why it is needed</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['storage', 'Save your API URL preference and first-run onboarding state.'],
              ['activeTab', 'Read the current Gmail tab state to show context in the popup.'],
              ['tabs', 'Find open Gmail tabs across windows so the popup can display email context even when Gmail is not the active tab.'],
              ['cookies', 'Check your BiotechOS session cookie to verify you are signed in before showing the quote button.'],
              ['clipboardWrite', 'Copy the generated quote share link to your clipboard.'],
              ['scripting', 'Re-inject content scripts into Gmail after the extension is updated without requiring you to reload the tab.'],
              ['mail.google.com', 'Read email content and inject the ✦ Quote button into Gmail\'s interface.'],
              ['*.biotechos.com', 'Send email content to the BiotechOS API for analysis and quote generation.'],
            ].map(([perm, reason]) => (
              <tr key={perm}>
                <td style={{ padding: '7px 10px', border: '1px solid #e8eaed', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{perm}</td>
                <td style={{ padding: '7px 10px', border: '1px solid #e8eaed', color: '#3c4043' }}>{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Children's privacy">
        The Extension is intended for professional use by CRO staff. It is not directed at
        children under 13 and we do not knowingly collect data from children.
      </Section>

      <Section title="Changes to this policy">
        We may update this policy as the Extension evolves. The &ldquo;Last updated&rdquo; date at the top
        reflects the most recent revision. Continued use of the Extension after changes constitutes
        acceptance.
      </Section>

      <Section title="Contact">
        Questions about this policy:{' '}
        <a href="mailto:privacy@biotechos.com" style={{ color: '#1a73e8' }}>privacy@biotechos.com</a>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: '#202124' }}>{title}</h2>
      <div style={{ color: '#3c4043' }}>{children}</div>
    </section>
  );
}
