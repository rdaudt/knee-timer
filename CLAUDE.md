# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knee-Timer is a motivational rehabilitation timer web app for knee recovery exercises. It provides encouraging audio coaching every 30 seconds during timed sessions (1-15 minutes), with milestone callouts at 25%, 50%, 75%, and 90% completion.

**Live URL:** https://knee-timer.vercel.app

## Commands

```bash
npm run dev:vercel    # Local development (frontend + Vercel serverless API)
npm run dev           # Frontend only (no API)
npm run build         # TypeScript compile + Vite build
npm run test          # Run vitest unit tests
npm run lint          # ESLint
vercel --prod         # Deploy to production
```

## Architecture

### Frontend (src/)
- **React 19 + TypeScript** with Vite and Tailwind CSS
- **App.tsx** - Single main component handling timer state, TTS audio, and UI
- **ttsUtils.ts** - Utility functions for time formatting, milestone computation, motivation text generation, and prefetch line building

### Backend (api/)
Vercel serverless functions providing TTS capabilities:
- **tts.js** - POST `/api/tts` - Calls OpenAI TTS API (tts-1 model), returns MP3 blobs with server-side caching (500 entries, 7-day TTL)
- **voices.js** - GET `/api/voices` - Returns available voice options (6 OpenAI voices: nova, echo, alloy, fable, onyx, shimmer)
- **health.js** - GET `/api/health` - Health check endpoint
- **_config.js** - Shared voice definitions and speed constraints

### TTS Flow
1. On timer start, client prefetches audio for all expected utterances
2. Client-side cache (200 entries) stores audio blobs
3. Server-side cache prevents redundant OpenAI API calls
4. Fallback to browser Web Speech API if TTS unavailable

### Speaking Events
- Start (personalized with user's name + activity)
- Every 30 seconds (motivation from 120-item bank)
- Milestones (25%, 50%, 75%, 90%)
- Finish (congratulations)

## Environment Variables

Copy `.env.example` to `.env.local`:
```
OPENAI_API_KEY=sk-...     # Required for TTS
```

## Testing

Tests are in `src/ttsUtils.test.ts`. Run with `npm run test`. Tests run in node environment (not browser).
