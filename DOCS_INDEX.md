# GymPrenuer Documentation Index

## Start Here

### 🚀 Getting Started
- **[QUICKSTART.md](./QUICKSTART.md)** - **START HERE** if you're seeing `P1013` error
  - 5-minute setup guide
  - Copy-paste instructions
  - Common troubleshooting

### 💾 Database Setup
- **[DATABASE_SETUP.md](./DATABASE_SETUP.md)** - Detailed database configuration
  - Supabase setup (recommended)
  - Local PostgreSQL
  - Docker Compose
  - Connection string format
  - Common mistakes and fixes

### 📖 Full Setup Guide
- **[SETUP.md](./SETUP.md)** - Comprehensive development guide
  - Prerequisites
  - All database options
  - OAuth provider setup
  - Development workflow
  - Production deployment

### 🔐 Authentication Details
- **[AUTH_FIX.md](./AUTH_FIX.md)** - Technical auth documentation
  - How JWT sessions work
  - NextAuth configuration
  - Dev login credentials
  - Session management

### 📋 Project Overview
- **[README.md](./README.md)** - Main project documentation
  - Feature overview
  - Project structure
  - API routes
  - Tech stack

### ⚙️ Configuration
- **[.env.example](./.env.example)** - Environment variables template
  - Copy to `.env.local` to get started
  - All required and optional variables documented

### 🐛 Troubleshooting
- **[TROUBLESHOOT_P1001.md](./TROUBLESHOOT_P1001.md)** - Can't reach database server
  - Supabase project paused (most common)
  - Wrong database credentials
  - Network connectivity issues
  - Connection pooling configuration

---

## By Problem

### "P1001: Can't reach database server"
→ See [TROUBLESHOOT_P1001.md](./TROUBLESHOOT_P1001.md) **(START HERE if you see this error)**

### "P1013: Invalid database string"
→ See [QUICKSTART.md](./QUICKSTART.md#youre-seeing-p1013-error)

### "DATABASE_URL is not set" 
→ See [DATABASE_SETUP.md](./DATABASE_SETUP.md)

### "Dev login not working / CredentialsSignin error"
→ See [TROUBLESHOOT_P1001.md](./TROUBLESHOOT_P1001.md) first (usually database connection issue)
→ If database is working, see [AUTH_FIX.md](./AUTH_FIX.md#dev-login)

### "PostgreSQL connection failed"
→ See [DATABASE_SETUP.md](./DATABASE_SETUP.md#troubleshooting)

### "How do I deploy to production?"
→ See [SETUP.md](./SETUP.md#building-for-production)

### "How do I set up Google/Discord OAuth?"
→ See [SETUP.md](./SETUP.md#oauth-setup-optional)

### "How do I use Supabase?"
→ See [DATABASE_SETUP.md](./DATABASE_SETUP.md#supabase-setup-easiest)

### "How do I use Docker?"
→ See [DATABASE_SETUP.md](./DATABASE_SETUP.md#docker-setup-fastest)

---

## By Role

### I'm Setting Up for the First Time
1. Start with [QUICKSTART.md](./QUICKSTART.md)
2. If you get stuck on database, jump to [DATABASE_SETUP.md](./DATABASE_SETUP.md)
3. Once running, refer to [README.md](./README.md) for feature overview

### I'm Contributing Code
1. Read [README.md](./README.md) for project structure
2. Reference [SETUP.md](./SETUP.md) for dev workflow
3. Check auth docs if modifying authentication

### I'm Deploying to Production
1. Review [SETUP.md](./SETUP.md#building-for-production)
2. Set environment variables in production platform
3. Run `npm run build && npm start`

### I'm Debugging Database Issues
1. Check [DATABASE_SETUP.md](./DATABASE_SETUP.md#troubleshooting)
2. Run `npx prisma studio` to inspect database
3. Verify `DATABASE_URL` format with examples in [DATABASE_SETUP.md](./DATABASE_SETUP.md#correct-databaseurl-format)

### I'm Setting Up OAuth Providers
1. See [SETUP.md](./SETUP.md#oauth-setup-optional)
2. Get credentials from provider (Google, Discord, etc.)
3. Add to `.env.local` with exact variable names from [.env.example](./.env.example)

---

## Command Quick Reference

### Setup Commands
```bash
cp .env.example .env.local          # Create env file
npx prisma migrate dev --name init  # Initialize database
npx prisma studio                   # Open database UI
npm run dev                          # Start dev server
```

### Database Commands
```bash
npx prisma db push           # Sync schema with database
npx prisma migrate dev       # Create new migration
npx prisma migrate reset     # Reset database (destroys data!)
npx prisma generate         # Regenerate Prisma client
```

### Development Commands
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Check code quality
```

---

## File Structure

```
/
├── README.md                    # Main project documentation
├── QUICKSTART.md                # 5-minute setup (START HERE)
├── DATABASE_SETUP.md            # Database configuration guide
├── SETUP.md                     # Full development guide
├── AUTH_FIX.md                  # Authentication technical docs
├── DOCS_INDEX.md                # This file
├── .env.example                 # Environment variables template
├── src/
│   ├── app/                     # Next.js routes
│   ├── lib/                     # Game engine, DB, utilities
│   ├── components/              # Reusable UI components
│   └── auth.ts                  # NextAuth configuration
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── migrations/              # Database migration history
└── package.json                 # Dependencies
```

---

## Environment Variables

**Required to run the app:**
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - JWT signing secret

**Optional (for OAuth login):**
- `AUTH_GOOGLE_ID` - Google OAuth client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret
- `AUTH_DISCORD_ID` - Discord OAuth client ID
- `AUTH_DISCORD_SECRET` - Discord OAuth client secret

See [.env.example](./.env.example) for details on each.

---

## Troubleshooting Decision Tree

```
Error on startup?
├─ "Cannot find module"
│  └─ Run: npm install
│
├─ "DATABASE_URL is not set"
│  └─ See: QUICKSTART.md → Step 2
│
├─ "P1013: Invalid database string"
│  └─ See: DATABASE_SETUP.md → Troubleshooting
│
├─ "ECONNREFUSED" (connection refused)
│  └─ Is your database running?
│     ├─ Supabase: Check supabase.com
│     ├─ Local PostgreSQL: Run `psql --version`
│     └─ Docker: Run `docker-compose up -d`
│
└─ "AUTH_SECRET is invalid"
   └─ Run: openssl rand -base64 32
      └─ Add result to .env.local as AUTH_SECRET
```

---

## Getting Help

1. **Check the relevant doc** using the "By Problem" section above
2. **Search in documentation** - Use Ctrl+F to find keywords
3. **Check error messages** - Copy exact error and search docs
4. **Review logs** - Run `npm run dev` and check terminal output
5. **Try troubleshooting** - Most docs include a troubleshooting section

---

## What to Read Based on Your Task

| Task | Read This |
|------|-----------|
| First-time setup | QUICKSTART.md |
| Database issues | DATABASE_SETUP.md |
| OAuth setup | SETUP.md (OAuth section) |
| Production deployment | SETUP.md (Building for Production) |
| Understanding auth | AUTH_FIX.md |
| Code structure | README.md (Project Structure) |
| API routes | README.md (API Routes) |
| Feature overview | README.md (Features) |
| Contributing | README.md (Contributing) |

---

## Quick Links

- [GymPrenuer GitHub](https://github.com/gmachalo/gymtyc-miniapp)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Supabase Dashboard](https://supabase.com)
- [NextAuth Documentation](https://authjs.dev/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Last Updated:** 2025  
**For questions:** Check docs first, then open an issue on GitHub
