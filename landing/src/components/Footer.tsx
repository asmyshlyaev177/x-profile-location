export function Footer() {
  return (
    <footer class="bg-dark border-t border-border py-8">
      <div class="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-secondary">
        <p>© {new Date().getFullYear()} X Profile Location. All rights reserved.</p>
        <nav class="flex gap-6">
          <a href="/privacy-policy" class="hover:text-white transition-colors">
            Privacy Policy
          </a>
        </nav>
      </div>
    </footer>
  )
}
