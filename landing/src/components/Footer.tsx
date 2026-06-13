export function Footer() {
  return (
    <footer class="bg-dark border-border border-t py-8">
      <div class="text-secondary mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm sm:flex-row lg:px-8">
        <p>
          © {new Date().getFullYear()} X Profile Location. All rights reserved.
        </p>
        <nav class="flex gap-6">
          <a href="/privacy-policy" class="transition-colors hover:text-white">
            Privacy Policy
          </a>
        </nav>
      </div>
    </footer>
  )
}
