# GymPrenuer MVP

A blockchain-ready fitness gaming platform where players earn tokens by training. Built with Next.js, TypeScript, Prisma, and PostgreSQL.

## Quick Start (5 Minutes)

**Getting error `P1013: Invalid database string`?**

See **[QUICKSTART.md](./QUICKSTART.md)** for step-by-step setup (fastest way to get running).

For detailed database setup options, see **[DATABASE_SETUP.md](./DATABASE_SETUP.md)**.

## Setup Overview

### 1. Prerequisites
- Node.js 18+ 
- npm/yarn/pnpm
- PostgreSQL database (local, Docker, or Supabase)

### 2. Environment Setup

```bash
# Copy example environment file
cp .env.example .env.local

# Edit .env.local and add:
# - DATABASE_URL (required) - see DATABASE_SETUP.md
# - AUTH_SECRET (required) - generate with: openssl rand -base64 32
# - Optional: Google/Discord OAuth credentials
```

### 3. Initialize Database

```bash
npx prisma migrate dev --name init
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Login

- Click "Dev Login"
- Email: `dev@gymtycoon.app`
- No password required

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - 5-minute setup guide
- **[DATABASE_SETUP.md](./DATABASE_SETUP.md)** - Detailed database configuration
- **[SETUP.md](./SETUP.md)** - Full development guide with OAuth setup
- **[AUTH_FIX.md](./AUTH_FIX.md)** - Authentication technical details

## Project Structure

```
src/
├── app/              # Next.js app routes
│   ├── login/        # Authentication page
│   ├── onboarding/   # Character creation flow
│   └── (game)/       # Protected game routes
│       ├── dashboard/ # Main hub
│       ├── workout/   # Training system
│       ├── gyms/      # Gym browser & management
│       ├── rewards/   # Token rewards & history
│       └── profile/   # User profile
├── lib/
│   ├── db/           # Prisma ORM setup
│   ├── game/         # Game engine & tokenomics
│   └── fitness/      # Mock fitness API adapter
├── components/       # Reusable UI components
└── auth.ts          # NextAuth v5 configuration
```

## Features

### MVP (Complete)
- ✅ Character creation with stat customization
- ✅ Workout tracking with real-time rewards
- ✅ Off-chain tokenomics with controlled emission
- ✅ Gym system (browse, create, join)
- ✅ Reward history and balance tracking
- ✅ Streak system with bonuses
- ✅ Google & Discord OAuth
- ✅ Dev login for testing

### Phase 2 (Planned)
- Farcaster native login (Frames/miniapp)
- ERC-20 token on-chain distribution
- ERC-721 character NFTs
- Marketplace transactions
- Advanced leaderboards
- Challenge system (1v1, group, gym vs gym)
- Gym co-ownership profit sharing

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/...` | * | NextAuth authentication |
| `/api/game/character` | POST | Create character |
| `/api/game/dashboard` | GET | Fetch dashboard data |
| `/api/game/workout` | POST | Complete workout & calculate rewards |
| `/api/game/gyms` | GET/POST | Browse/create gyms |
| `/api/fitness/sync` | GET/POST | Fitness API integration |

## Database Schema

Uses Prisma ORM with PostgreSQL. Key models:
- `User` - Player accounts
- `Character` - Character stats and progression
- `Workout` - Training sessions with rewards
- `Gym` - System and player-owned gyms
- `Reward` - Token reward history
- `Streak` - Daily streak tracking

See `prisma/schema.prisma` for full schema.

## Authentication

- **Google OAuth** - Optional, set `AUTH_GOOGLE_ID` & `AUTH_GOOGLE_SECRET`
- **Discord OAuth** - Optional, set `AUTH_DISCORD_ID` & `AUTH_DISCORD_SECRET`
- **Dev Login** - Built-in test account (email: `dev@gymtycoon.app`)
- **JWT Sessions** - Secure token-based sessions

## Token Economics (MVP)

**Design Principles:**
- Daily cap: 200 tokens/player
- Strong sinks prevent inflation
- Diminishing returns on multiple workouts
- Streak bonuses (up to +50%)
- Fitness boost cap (+30%)

**Key Mechanics:**
- Earn tokens by completing workouts
- Longer, harder workouts = more rewards
- Maintain streaks for bonus multipliers
- Gym fees create token sinks
- Challenge rewards for competitive play

## Deployment

### Vercel (Recommended)

```bash
# Push to GitHub
git push origin main

# Connect repo to Vercel
# Set environment variables in Vercel dashboard
# Auto-deploy on push
```

### Self-Hosted

```bash
npm run build
npm start
```

Set environment variables before running.

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Check code quality
npx prisma studio   # Open database UI
npx prisma migrate dev  # Create migration
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js v5
- **Styling:** Tailwind CSS
- **State:** SWR for client-side data fetching
- **Validation:** Custom validation (expandable)

## Environment Variables

See `.env.example` for all required variables. Minimum setup:

```env
DATABASE_URL="postgresql://..."      # Required
AUTH_SECRET="your-secret-key"         # Required
NODE_ENV="development"
```

## Troubleshooting

### Database Connection Error (P1013)
See [DATABASE_SETUP.md](./DATABASE_SETUP.md#error-p1013---invalid-database-string)

### Auth Errors
See [AUTH_FIX.md](./AUTH_FIX.md)

### Setup Issues
See [QUICKSTART.md](./QUICKSTART.md#troubleshooting)

## Contributing

1. Create feature branch: `git checkout -b feature/name`
2. Commit changes: `git commit -m "Add feature"`
3. Push branch: `git push origin feature/name`
4. Open pull request

## License

MIT - See LICENSE file

## Support

- **Docs:** Check QUICKSTART.md, SETUP.md, DATABASE_SETUP.md
- **Issues:** Open GitHub issue with error message and reproduction steps
- **Discord:** Join our community (link in repo)

---

Built for fitness gamers who want to earn while they play. 💪⚡🪙
