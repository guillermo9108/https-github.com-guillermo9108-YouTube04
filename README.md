# SeaVerse React Template

AI-driven React application template. Users describe what they want, AI implements it with modern tooling.

## Essence

- Modern React stack (React 19 + TypeScript + Vite)
- Component-based architecture with routing
- Type-safe development with full IDE support
- Tailwind CSS for rapid styling

## File Structure

```
project/
├── src/
│   ├── pages/          # Page components
│   ├── App.tsx         # Root component with routing
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles + Tailwind
├── package.json        # Dependencies
├── vite.config.ts      # Vite config (API proxy pre-configured)
├── tsconfig.json       # TypeScript config
└── eslint.config.js    # ESLint config
```

## Architecture

**Component-based structure:**

| Section | Location | Purpose |
|---------|----------|---------|
| Pages | `src/pages/*.tsx` | Route components |
| Routing | `src/utils/router.ts` | Route definitions |
| Styles | `src/index.css` | Global styles, Tailwind directives |
| App Shell | `src/App.tsx` | Root component, router setup |

**API Proxy (pre-configured in vite.config.ts):**

| Route | Target | Type |
|-------|--------|------|
| `/api/*` | Backend server | HTTP |
| `/ws/*` | Backend server | WebSocket |

## Tech Stack

- **React 19** - Latest React with compiler
- **TypeScript** - Type safety
- **Vite** - Lightning-fast dev server and build
- **Tailwind CSS v4** - Utility-first CSS
- **React Router v7** - Client-side routing

## Common Patterns

Add a new page:
```tsx
// src/pages/NewPage.tsx
export default function NewPage() {
  return (
    <div className="container mx-auto p-4">
      {/* content */}
    </div>
  );
}

// src/utils/router.ts
import NewPage from '../pages/NewPage';
routes.push({ path: '/new', element: <NewPage /> });
```

Add styles:
```css
/* src/index.css */
@theme {
  --color-custom: #xxx;
}
```

Add interactivity:
```tsx
import { useState } from 'react';

export default function Component() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
```

## Development

```bash
pnpm install   # Install dependencies
pnpm dev       # Start dev server (default port: 5173)
pnpm build     # Build for production
pnpm preview   # Preview production build
```
