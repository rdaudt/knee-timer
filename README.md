# Knee Timer

A motivational rehabilitation timer web app for knee recovery exercises. Provides encouraging audio coaching every 30 seconds during timed sessions, with milestone callouts and background music to keep you moving through your physio.

**Live:** https://knee-timer.vercel.app

## Features

- **Timed sessions** from 1-180 minutes
- **Voice coaching** with OpenAI TTS - motivational messages every 30 seconds
- **Milestone callouts** at 25%, 50%, 75%, and 90% completion
- **Background music** that automatically ducks during voice messages
- **Personalization** - set your name and activity for custom encouragement
- **Multiple voices** - choose from 5 OpenAI voices (Echo, Alloy, Fable, Onyx, Shimmer)
- **Adjustable speed and volume** for voice coaching

## Getting Started

### Prerequisites

- Node.js 18+
- OpenAI API key

### Installation

```bash
git clone https://github.com/rdaudt/knee-timer.git
cd knee-timer
npm install
```

### Configuration

Copy `.env.example` to `.env.local` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-...
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
- **TTS:** OpenAI TTS API (tts-1 model)

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev:vercel` | Local dev with API |
| `npm run dev` | Frontend only |
| `npm run build` | Production build |
| `npm run test` | Run tests |
| `npm run lint` | ESLint |

## License

MIT
