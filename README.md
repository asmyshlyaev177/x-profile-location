<div>
  >_<br />
  <br />
  <span style="color:#c792e9">B R O W S E R</span><br />
  <span style="color: #c3e88d">E X T E N S I O N</span><br />
  <span style="color: #8addff">D E V E L O P M E N T</span><br />
  <span style="color: #ffcb6b">F R A M E W O R K</span><br />
</div>

<br />

# . - Browser Extension

X Profile Location

A browser extension built with [Bedframe](https://bedframe.dev), a modern framework for cross-browser extension development.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Project Overview

This is a **overlay extension (content script)** that also embedded options page. The extension is built using the Bedframe framework, which provides a unified development experience across multiple browsers.

### Extension Type

- **Primary**: Overlay extension (content script)

- **Options**: embedded options page

### Supported Browsers

- Chrome
- Brave
- Firefox
- Safari

## Architecture & Tech Stack

### Core Framework

- **[Bedframe](https://bedframe.dev)** - Cross-browser extension development framework
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server

### Styling & UI

- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - Component library

### Development Tools

- **Npm** - Package manager and runtime
- **Vitest** - Testing framework with Happy DOM
- **oxfmt** - Code formatting
- **Oxlint** - Fast linting
- **Lint-staged** - Pre-commit linting

## Project Structure

```
src/
├── _config/                 # Configuration files
│   ├── bedframe.config.ts   # Main Bedframe configuration
│   └── tests.config.ts      # Test configuration
├── lib/                     # Utility helpers
│   └── utils.ts             # shadcn/ui utility helpers
├── assets/                  # Static assets
│   └── icons/              # Extension icons
├── components/             # React components
│   ├── app.tsx            # Main app component
│   ├── intro.tsx          # Welcome/intro component
│   └── layout.tsx         # Layout wrapper
│   └── content.tsx        # Content script component
│   └── options.tsx        # Options page component
├── manifests/             # Browser-specific manifests
│   ├── base.manifest.ts   # Base manifest configuration
│   ├── chrome.ts         # Chrome-specific manifest
│   ├── brave.ts         # Brave-specific manifest
│   ├── firefox.ts         # Firefox-specific manifest
│   ├── safari.ts         # Safari-specific manifest
├── pages/                # HTML entry points
│   └── main.html          # Main overlay page
│   └── options.html       # Options page
├── scripts/              # Extension scripts
│   └── service-worker.ts # Service worker
│   └── content.tsx       # Content script
├── index.css             # Tailwind + shadcn theme styles
└── components/
    └── theme-provider.tsx # Light/dark theme provider
```

## Configuration

The project configuration is centralized in `src/_config/bedframe.config.ts` and organized into three distinct categories:

### 1. Browser Configuration

Defines which browsers are targeted and their specific manifests:

```typescript
browser: [
  chrome.browser,
  brave.browser,
  firefox.browser,
  safari.browser,
]
```

### 2. Extension Configuration

Defines the extension type and behavior:

```typescript
extension: {
  type: 'overlay',
  options: 'embedded',
  manifest: [chrome, brave, firefox, safari],
  pages: {
    overlay: 'src/pages/main.html',
  },
}
```

### 3. Development Configuration

Defines the development stack and tooling:

```typescript
development: {
  template: {
    config: {
      framework: 'Preact',
      language: 'TypeScript',
      packageManager: 'Npm',
      lintFormat: true,
      tests: {/* Test configuration */},
    },
  },
}
```

## Development Workflow

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run test             # Run tests with coverage
npm run format           # Format code with oxfmt
npm run lint             # Lint code with Oxlint
npm run fix              # Format and lint code
# Extension Management
npm run zip              # Create extension zip file
npm run publish          # Publish extension
# Safari Conversion
npm run convert:safari   # Convert to Safari Web Extension
```
### Testing

- **Framework**: Vitest with Happy DOM
- **Coverage**: Istanbul provider with text, JSON, and HTML reports
- **Setup**: Global test environment with custom setup files

### Code Quality

- **Linting**: Oxlint for fast JavaScript/TypeScript linting
- **Formatting**: oxfmt
- **Type Safety**: TypeScript with strict configuration

## Deployment

### Local Building

```bash
# Build for all browsers
npm run build

# Build for specific browser
npm run build --mode chrome
npm run build --mode firefox
```

## Key Features

- **Cross-browser compatibility** - Works on Chrome, Brave, Firefox, Safari
- **Modern development stack** - React 19, TypeScript, Tailwind CSS
- **Quality assurance** - Automated testing, linting, and formatting
- **Git workflow** - Conventional commits with automated validation
- **Component library** - shadcn/ui components with New York theme
- **Service worker** - Background script for extension functionality

## License

UNLICENSED License - see [LICENSE](LICENSE) file for details.

## Resources

- [Bedframe Documentation](https://bedframe.dev)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [shadcn/ui Documentation](https://ui.shadcn.com)


