# Knee Timer

A motivational rehabilitation timer web app for knee recovery exercises. Provides encouraging audio coaching every 30 seconds during timed sessions, with milestone callouts to keep you moving through your physio.

**Live:** https://knee-timer.vercel.app

## Features

- **Timed sessions** from 1–15 minutes
- **Voice coaching** with OpenAI TTS — motivational messages every 30 seconds
- **Milestone callouts** at 25%, 50%, 75%, and 90% completion
- **Background music** that automatically ducks during voice messages
- **Static pre-generated audio** served from CDN for zero API cost on common phrases
- **Optional video recording** for user's review of form and improvements
- **Access code gate** —  `ACCESS_CODE` env var to restrict access
- **Anonymous analytics** — session events stored in Supabase (no PII collected)
- **Privacy info** — accessible from the app footer

## Getting Started

### Prerequisites

- Node.js 18+
- OpenAI API key (for TTS fallback / audio generation)
- Supabase KEY
- Vercel CLI (`npm i -g vercel`) for local API development

### Installation

```bash
git clone https://github.com/rdaudt/knee-timer.git
cd knee-timer
npm install
```

### Configuration

Copy `.env.example` to `.env.local` and fill in values:

```
OPENAI_API_KEY=sk-...              # Required for TTS
ACCESS_CODE=your-secret            # restricts app access
SUPABASE_URL=https://...           # analytics backend
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # analytics backend
```

### Development

```bash
npm run dev:vercel    # Frontend + Vercel serverless API
```

Open http://localhost:3000

### Production Build

```bash
npm run build         # TypeScript compile + Vite build
vercel --prod         # Deploy to Vercel
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Vercel serverless functions
- **TTS:** OpenAI TTS API (tts-1 model), static audio CDN fallback
- **Analytics:** Supabase (anonymous session events)

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev:vercel` | Local dev with API |
| `npm run dev` | Frontend only |
| `npm run build` | Production build |
| `npm run test` | Run vitest unit tests |
| `npm run lint` | ESLint |

## Architecture Notes

- Static pre-generated audio lives in `public/audio/echo-1.00/` and is served from Vercel's CDN
- The client tries static audio first, then falls back to `/api/tts`
- After 3 consecutive TTS failures, speech is disabled and a muted banner is shown
- Cache key format: `SHA256("voice|speed|text")` — shared between client and server

## License

MIT
