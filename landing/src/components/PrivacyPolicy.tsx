export function PrivacyPolicy() {
  return (
    <div class="bg-void">
      <div class="shell-narrow max-w-3xl! py-16">
        <a
          href="/"
          class="text-faint hover:text-signal mb-12 inline-flex items-center gap-2 text-sm font-medium transition-colors"
        >
          ← Back to home
        </a>

        <h1 class="t-h2">Privacy Policy</h1>
        <p class="t-data mt-4 mb-12">Last updated: July 2026</p>

        <div class="policy space-y-10">
          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Overview</h2>
            <p>
              X Profile Location is a browser extension that displays the
              declared location of X / Twitter profiles as a flag emoji and can
              highlight accounts by location or keyword. We are committed to
              your privacy. By default, everything the extension does happens
              locally in your browser. The one exception — an optional,
              off-by-a-single- toggle community cache — is described below.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Data We Do Not Collect</h2>
            <p>
              The extension does{' '}
              <strong class="text-text font-semibold">not</strong> collect,
              store, or transmit:
            </p>
            <ul class="mt-3 list-inside list-disc space-y-2">
              <li>Your browsing history or activity on X / Twitter</li>
              <li>
                Your X / Twitter account credentials, cookies, or session tokens
              </li>
              <li>
                Profile bios, display names, or other profile content of users
                you view
              </li>
              <li>Any personally identifiable information (PII)</li>
            </ul>
            <p class="mt-3">
              Location and other lookup results are cached locally in your
              browser (IndexedDB) and your settings are stored in the browser’s
              extension storage. This stays on your device.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">How Location Is Fetched</h2>
            <p>
              When you hover or swipe a profile, the extension requests that
              profile’s publicly declared location directly from X / Twitter’s
              own API, using the X session already present in your browser —
              exactly as the X website does when you view a profile. This
              request goes to X directly; it is not routed through, or seen by,
              us.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">
              Optional: Shared Community Location Cache
            </h2>
            <p>
              The extension includes an optional feature — controlled by the{' '}
              <strong class="text-text font-semibold">
                "Use shared community location cache"
              </strong>{' '}
              toggle in its options — that lets users share already-public
              location flags with one another, so everyone avoids repeating the
              same lookups. When it is enabled, the extension exchanges data
              with a server operated by us (a Cloudflare Worker) for that sole
              purpose.
            </p>
            <p class="mt-3">
              <strong class="text-text font-semibold">What is sent:</strong>
            </p>
            <ul class="mt-2 list-inside list-disc space-y-2">
              <li>
                the public handle you looked up (for example, <code>jack</code>
                );
              </li>
              <li>
                its location flag data: the location string (e.g.{' '}
                <code>JP</code>), the source (e.g.{' '}
                <code>Japan Android App</code>), and a "location may be
                inaccurate / VPN" indicator;
              </li>
              <li>
                an anonymous, randomly generated installation ID (a UUID created
                on first run) used only to agree on a consensus value across
                independent contributors and to resist abuse.
              </li>
            </ul>
            <p class="mt-3">
              <strong class="text-text font-semibold">
                What is never sent:
              </strong>{' '}
              your X account, username, email, cookies or session tokens;
              profile bios or display names; your browsing history; or any
              personal identifier beyond the ordinary network metadata of an
              HTTPS request.
            </p>
            <p class="mt-3">
              Contributions are stored on the community server only to build the
              shared cache, keyed by the public handle and the random
              installation ID — never by your identity. They are not sold,
              rented, or used for advertising.
            </p>
            <p class="mt-3">
              To keep the cache useful, the extension also looks up accounts
              that appear in your feed in the background, rather than only the
              ones you hover — the same public handles X has already sent your
              browser, at a deliberately slow pace. The toggle governs both:
              switch it off and background lookups stop with it, the extension
              makes no requests to the community server, and a location is only
              fetched when you hover or swipe a profile yourself.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Analytics on This Website</h2>
            <p>
              This website (the page you are reading) uses{' '}
              <strong class="text-text font-semibold">Google Analytics</strong>{' '}
              to collect anonymous, aggregated visit statistics so we can
              understand traffic and improve the site. This applies to the
              website only — the{' '}
              <strong class="text-text font-semibold">
                browser extension itself contains no analytics, telemetry, or
                tracking of any kind.
              </strong>
            </p>
            <p class="mt-3">
              Google Analytics data is governed by{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                class="text-signal hover:underline"
              >
                Google’s Privacy Policy
              </a>
              . You can opt out via the{' '}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                class="text-signal hover:underline"
              >
                Google Analytics Opt-out Browser Add-on
              </a>
              .
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Permissions</h2>
            <p>
              The extension requests only the permissions necessary to read
              location information from X / Twitter and to store your settings
              and local cache. These permissions are used exclusively for their
              stated purpose and grant us no access to your personal accounts or
              data.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Data Sharing and Selling</h2>
            <p>
              We do not sell your data and do not share it with third parties
              for advertising or any unrelated purpose. The only network
              destinations are X itself (for the location lookups your browser
              already makes) and, if you opt in, the community cache server
              described above.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Changes to This Policy</h2>
            <p>
              If we update this privacy policy, we will post the revised version
              here with a new "last updated" date. Continued use of the
              extension after any changes constitutes acceptance of the revised
              policy.
            </p>
          </section>

          <section>
            <h2 class="t-h3 mb-3 text-[1.25rem]">Contact</h2>
            <p>
              Questions or requests:{' '}
              <a
                href="mailto:asmyshlyaev177+x-ext@gmail.com"
                class="text-signal hover:underline"
              >
                asmyshlyaev177+x-ext@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
