# GymPrenuer MVP - Local Setup Guide

## Prerequisites

- Node.js 18+ installed
- npm/pnpm/yarn package manager
- PostgreSQL database (local or cloud)
- Supabase account (or use local PostgreSQL)

## Database Setup

### ⚠️ CRITICAL: DATABASE_URL Must Be Set First

If you see error `P1013: The provided database string is invalid`, your `DATABASE_URL` is either:
- Missing from `.env.local`
- Malformed (wrong format)
- Using wrong database provider

The correct format is:
```
postgresql://username:password@host:port/database
```

**Choose ONE option below:**

### Option 1: Supabase (Recommended - Free)

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create new project
   - Save your database password safely
   - Wait for initialization (2-3 minutes)
3. Once ready, click **Project Settings** (bottom left)
4. Go to **Database** tab
5. Look for **Connection String** section
6. Click on **URI** tab (important!)
7. Copy the connection string
8. Open `.env.local` and paste as `DATABASE_URL`:
   ```
   DATABASE_URL="postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-us-east-1.pooling.supabase.com:6543/postgres"
   ```
   - Replace `YOUR_PROJECT_REF` with your project reference
   - Replace `YOUR_PASSWORD` with your database password
   - **Keep `?schema=public` at the end if present**

9. Save the file and run:
   ```bash
   npx prisma migrate dev
   ```

### Option 2: Local PostgreSQL (Development)

**Install PostgreSQL:**
- macOS: `brew install postgresql && brew services start postgresql`
- Windows: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- Linux: `sudo apt-get install postgresql`

**Create database:**
```bash
createdb gymtyc_miniapp
```

**Add to `.env.local`:**
```
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/gymtyc_miniapp"
```

**Run migrations:**
```bash
npx prisma migrate dev
```

### Option 3: Docker (Quickest Setup)

```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: gymtyc_miniapp
    ports:
      - "5432:5432"
EOF

# Start database
docker-compose up -d

# Add to .env.local
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gymtyc_miniapp"' >> .env.local

# Initialize
npx prisma migrate dev
```

### Verify Connection

After setting DATABASE_URL, verify it works:
```bash
npx prisma db push
# OR
npx prisma studio  # Opens web UI to see database
```

## Environment Setup

1. **Copy the example file:**
   ```bash
   cp .env.example .env.local
   ```

2. **Fill in required values:**
   ```bash
   # Set a secure AUTH_SECRET
   AUTH_SECRET=$(openssl rand -base64 32)
   
   # Add your DATABASE_URL (from Supabase or local PostgreSQL)
   DATABASE_URL="your-database-url"
   
   # Optional: Add Google OAuth credentials
   AUTH_GOOGLE_ID="..."
   AUTH_GOOGLE_SECRET="..."
   
   # Optional: Add Discord OAuth credentials
   AUTH_DISCORD_ID="..."
   AUTH_DISCORD_SECRET="..."
   ```

3. **Verify `.env.local` is in `.gitignore`** (to keep secrets safe)

## Database Initialization

```bash
# Install dependencies
npm install

# Initialize database schema
npx prisma migrate dev

# (Optional) Seed with sample data
npx prisma db seed
```

## Development

```bash
# Start dev server
npm run dev

# Open http://localhost:3000 in browser
```

### Dev Login

For testing without OAuth, use:
- **Email:** `dev@gymtycoon.app`
- **Name:** `Dev Trainer` (or any name)

No password required during development.

## OAuth Setup (Optional)

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs
6. Copy Client ID and Secret to `.env.local`

### Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add `http://localhost:3000/api/auth/callback/discord` to redirect URIs
5. Copy Client ID and Secret to `.env.local`

## Troubleshooting

### "DATABASE_URL is not set"
- Ensure `.env.local` exists with `DATABASE_URL`
- Restart the dev server after updating `.env.local`

### "Invalid `prisma.user.upsert()`"
- Database might not be initialized. Run `npx prisma migrate dev`
- Check PostgreSQL is running and DATABASE_URL is correct

### Dev login not working
- Check `.env.local` has `AUTH_SECRET` set
- Clear browser cookies and try again
- Check server logs for specific errors

## Testing the MVP

1. **Login:** Click "Dev Login" and use `dev@gymtycoon.app`
2. **Onboarding:** Complete character creation with body type, name, plan, and mode
3. **Dashboard:** View character stats and streak
4. **Workouts:** Log a workout and see rewards calculated
5. **Gyms:** Browse system gyms
6. **Rewards:** View token balance and transaction history

## Building for Production

```bash
# Build Next.js app
npm run build

# Start production server
npm start
```

For deployment to Vercel:
1. Push changes to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

## Database Migrations

If schema changes, run:
```bash
npx prisma migrate dev --name description_of_changes
```

This creates a migration and updates the database.

## Need Help?

- Check logs: `npm run dev` will show server errors
- Prisma docs: https://www.prisma.io/docs/
- NextAuth docs: https://authjs.dev/getting-started/installation
