export function PrivacyPolicy() {
  return (
    <div class="min-h-screen bg-dark text-white/80">
      <div class="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <a
          href="/"
          class="inline-flex items-center gap-2 text-teal hover:text-teal/80 mb-10 text-sm font-medium transition-colors"
        >
          ← Back to home
        </a>

        <h1 class="text-4xl font-extrabold text-white mb-2">Privacy Policy</h1>
        <p class="text-white/40 text-sm mb-10">Last updated: April 2025</p>

        <div class="space-y-8 text-white/70 leading-relaxed">
          <section>
            <h2 class="text-xl font-bold text-white mb-3">Overview</h2>
            <p>
              X Profile Location is a browser extension that displays the declared location of X / Twitter
              profiles as a flag emoji. We are committed to your privacy. This policy explains what data
              we collect and how we use it.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-white mb-3">Data We Do Not Collect</h2>
            <p>We do <strong class="text-white">not</strong> collect, store, or transmit:</p>
            <ul class="mt-3 space-y-2 list-disc list-inside">
              <li>Your browsing history or activity on X / Twitter</li>
              <li>Your X / Twitter account credentials or personal details</li>
              <li>Profile data of any users you view</li>
              <li>Any personally identifiable information (PII)</li>
            </ul>
            <p class="mt-3">
              All processing happens locally in your browser. No user data ever leaves your device.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-white mb-3">Anonymous Analytics</h2>
            <p>
              The extension uses{' '}
              <strong class="text-white">Google Analytics</strong> to collect anonymous, aggregated
              usage statistics — such as feature interactions and general geographic region (country
              level). This data is used solely to understand how the extension is used and to improve
              it. It cannot be used to identify you personally.
            </p>
            <p class="mt-3">
              Google Analytics data is governed by{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                class="text-teal hover:underline"
              >
                Google's Privacy Policy
              </a>
              . You can opt out via the{' '}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                class="text-teal hover:underline"
              >
                Google Analytics Opt-out Browser Add-on
              </a>
              .
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-white mb-3">Third-Party Services</h2>
            <p>
              The extension fetches publicly available location data directly from X / Twitter's own API
              on your behalf, exactly as your browser would when loading profile pages normally. We do
              not route this traffic through any intermediate server.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-white mb-3">Permissions</h2>
            <p>
              The extension requests only the permissions necessary to read location information from
              X / Twitter profile hover cards. These permissions are used exclusively for their stated
              purpose and grant us no access to your personal accounts or data.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-bold text-white mb-3">Changes to This Policy</h2>
            <p>
              If we update this privacy policy, we will post the revised version here with a new "last
              updated" date. Continued use of the extension after any changes constitutes acceptance of
              the revised policy.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
