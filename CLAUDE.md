# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**UIGen** is an AI-powered React component generator that uses Claude to create and refine components in real-time. Users describe what they want, Claude generates code using a virtual file system (no files written to disk), and they can preview and iterate immediately.

**Tech Stack:**
- Next.js 15 (App Router) + React 19 + TypeScript
- Anthropic Claude AI via Vercel AI SDK (v4.3.16)
- Prisma with SQLite for persistence
- Tailwind CSS v4
- Vitest for testing
- Monaco Editor for code display

## Common Development Commands

**Setup:**
```bash
npm run setup
```
Installs dependencies, generates Prisma client, and runs database migrations. Required on first clone.

**Development:**
```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run dev:daemon      # Start in background, logs to logs.txt
npm run build           # Production build
npm run start           # Run production build
```

**Testing & Quality:**
```bash
npm run test            # Run all tests with Vitest
npm run test -- src/components/chat/MessageInput.test.tsx  # Run specific test
npm run lint            # Run ESLint
```

**Database:**
```bash
npm run db:reset        # Reset database (drops and re-runs migrations)
```

**Key Environment:**
- Node v18+ required
- Optional: `ANTHROPIC_API_KEY` in `.env` (falls back to mock provider if missing)
- Uses `cross-env` + `NODE_OPTIONS="--require ./node-compat.cjs"` for Node polyfills in Next.js

## Architecture

### High-Level Flow

1. **User Input**: Chat interface sends user message + current files to `/api/chat`
2. **AI Processing**: Claude receives system prompt with tool descriptions, can call:
   - `str_replace_editor`: Modify file content via string replacement
   - `file_manager`: Create/delete files
3. **Virtual File System**: Changes applied in-memory (VirtualFileSystem class), not to disk
4. **Persistence**: For authenticated users, messages and file data saved to Prisma (Project.messages, Project.data)
5. **Preview**: React components rendered live via PreviewFrame (iframe with generated code)

### Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home/login page (redirects authenticated users)
│   ├── main-content.tsx         # Anonymous user UI
│   ├── [projectId]/page.tsx     # Project detail page
│   ├── api/chat/route.ts        # POST /api/chat - AI generation endpoint
│   └── globals.css              # Global styles
├── components/
│   ├── auth/                    # Auth forms (SignInForm, SignUpForm, AuthDialog)
│   ├── chat/                    # Chat UI (ChatInterface, MessageList, MessageInput, MarkdownRenderer)
│   ├── editor/                  # Code editor (CodeEditor, FileTree)
│   ├── preview/                 # PreviewFrame (renders generated React components)
│   ├── ui/                      # Radix UI + shadcn/ui components (buttons, inputs, dialogs, etc.)
│   └── HeaderActions.tsx        # Header with export/save buttons
├── lib/
│   ├── file-system.ts           # VirtualFileSystem class (in-memory file management)
│   ├── provider.ts              # getLanguageModel() - initializes Claude via Vercel AI SDK
│   ├── auth.ts                  # Auth utilities (getSession, password hashing)
│   ├── prisma.ts                # Prisma client singleton
│   ├── anon-work-tracker.ts     # Session storage for anonymous users (localStorage)
│   ├── utils.ts                 # General utilities
│   ├── prompts/                 # System prompts for AI (generation.ts)
│   ├── tools/                   # Tool definitions for Claude (str-replace, file-manager)
│   ├── contexts/                # React context providers
│   └── transform/               # Code transformation utilities
├── hooks/                       # React hooks (useFileSystem, useProject, etc.)
├── actions/                     # Server actions (getUser, createProject, getProjects, getProject)
└── generated/prisma/            # Auto-generated Prisma client (do not edit)
```

### Key Concepts

**Virtual File System (VirtualFileSystem)**
- In-memory file representation: `files = { "path/to/file.tsx": { type: "file", name: "file.tsx", language: "typescript", content: "..." } }`
- Not synced to disk—lives in component state or database
- Serialized to/from JSON for persistence in `Project.data`
- Claude's tools operate on this in-memory representation

**Server Actions vs API Routes**
- `src/actions/`: Server actions for database queries (getUser, getProjects, etc.)—use `"use server"` directive
- `src/app/api/chat/route.ts`: API route for streaming AI responses (POST /api/chat)

**Authentication**
- JWT stored in `auth-token` cookie
- Optional—authenticated users get project persistence; anonymous users use localStorage (anon-work-tracker)
- Password hashed with bcrypt (v6)

**Database Schema** (Prisma)

- The database schema is defined in `prisma/schema.prisma`. Reference it anytime you need to understand the structure of data stored in the database.
- `User`: email, password, createdAt, updatedAt
- `Project`: name, userId, messages (stringified JSON), data (stringified JSON), createdAt, updatedAt
- Messages and file data stored as JSON strings for simplicity

## Testing

Tests colocated in `__tests__` folders, run with Vitest (jsdom environment). Examples:
- `src/components/chat/__tests__/ChatInterface.test.tsx`
- `src/lib/__tests__/file-system.test.ts`

Run tests:
```bash
npm run test
npm run test -- file-system.test.ts
```

Use React Testing Library for component testing (prefer user interactions over implementation details).

## Claude AI Integration

**Model Access:**
- `getLanguageModel()` from `lib/provider.ts` returns configured Claude model
- Falls back to mock provider (no-op responses) if `ANTHROPIC_API_KEY` is missing
- System prompt with cache control (`ephemeral`) in `lib/prompts/generation.ts`

**Tool System:**
- `str_replace_editor`: Replace file content by matching old_string
- `file_manager`: Create/delete files
- Max 40 steps (agentic), 4 for mock provider
- Responses streamed back to client via Vercel AI SDK

## Important Notes

- **No file I/O**: Generated code stays in-memory or database; use `VirtualFileSystem` APIs
- **Serialization**: Files and messages are stringified JSON in Prisma—deserialize before use
- **Next.js Turbopack**: Uses `--turbopack` flag for faster dev builds; Node polyfills via `node-compat.cjs`
- **Escape sequences**: Use `~~~` (triple tilde) in generation prompts to avoid conflicts with tool syntax
