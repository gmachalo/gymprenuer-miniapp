# Database Setup Guide for GymPrenuer

## Error: P1013 - Invalid Database String

This is the most common error. It means your `DATABASE_URL` environment variable is missing, empty, or malformed.

### Quick Fix Checklist

- [ ] Do you have a `.env.local` file in project root?
- [ ] Does it contain `DATABASE_URL=...`? (not `DATABASE_URL=""` - that's empty!)
- [ ] Is the URL in the correct format? Must start with `postgresql://`
- [ ] Did you restart `npm run dev` after adding `.env.local`?

### Correct DATABASE_URL Format

```
postgresql://username:password@host:port/database
```

**All parts are required.** If any part is missing, you'll get P1013 error.

---

## Step-by-Step: Supabase Setup (Easiest)

### 1. Create Supabase Account

- Go to https://supabase.com
- Click "Start your project"
- Sign up with email/GitHub/Google
- Verify your email

### 2. Create New Project

- Click "New Project"
- Choose organization (or create one)
- Project name: `gymtyc` (or anything)
- Database password: **Save this!** You'll need it later
- Region: Choose closest to you
- Click "Create new project"
- **Wait 2-3 minutes** for database to initialize

### 3. Get Your Connection String

Once the project is ready (green checkmark appears):

1. Click your project name (top left)
2. Go to **Settings** (gear icon, bottom left)
3. Click **Database** tab
4. Under "Connection string", look for the dropdown
5. Make sure **URI** is selected
6. Copy the full connection string

The string looks like:
```
postgresql://postgres.xxxxxx:yyyyyyyyyy@aws-0-us-east-1.pooling.supabase.com:6543/postgres?schema=public
```

### 4. Add to Your Project

In your project root, create/edit `.env.local`:

```env
DATABASE_URL="postgresql://postgres.xxxxxx:yyyyyyyyyy@aws-0-us-east-1.pooling.supabase.com:6543/postgres?schema=public"
AUTH_SECRET="your-secret-key"
NODE_ENV="development"
```

Replace the database URL with what you copied.

### 5. Initialize Database

```bash
npx prisma migrate dev --name init
```

This creates all tables. You should see:
```
✔ Generated Prisma Client (4.x.x)
✔ Created migration
✔ Applied 1 migration
```

**Done!** Your database is ready.

---

## Step-by-Step: Local PostgreSQL Setup

### 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
- Download from https://www.postgresql.org/download/windows/
- Run installer
- Remember the password you set!

**Linux:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2. Create Database

```bash
createdb gymtyc_miniapp
```

### 3. Get Connection String

**macOS/Linux:**
```
postgresql://postgres:your_password@localhost:5432/gymtyc_miniapp
```

**Windows:**
Same as above. If you don't remember your password, you can reset it using pgAdmin.

### 4. Add to `.env.local`

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/gymtyc_miniapp"
AUTH_SECRET="your-secret-key"
NODE_ENV="development"
```

### 5. Initialize Database

```bash
npx prisma migrate dev --name init
```

**Done!**

---

## Step-by-Step: Docker Setup (Fastest)

### 1. Create `docker-compose.yml`

In your project root, create a file called `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: gymtyc_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: gymtyc_miniapp
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### 2. Start Database

```bash
docker-compose up -d
```

You should see:
```
Creating gymtyc_db ... done
```

### 3. Add to `.env.local`

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gymtyc_miniapp"
AUTH_SECRET="your-secret-key"
NODE_ENV="development"
```

### 4. Initialize Database

```bash
npx prisma migrate dev --name init
```

### 5. Stop Database When Done

```bash
docker-compose down
```

---

## Verify Your Setup

After setting up DATABASE_URL, test the connection:

```bash
npx prisma studio
```

This opens a web UI at http://localhost:5555 where you can see all tables. If this works, your DATABASE_URL is correct!

---

## Common DATABASE_URL Mistakes

### ❌ Missing the scheme
```
user:password@host:5432/db  # WRONG - missing postgresql://
```
**Fix:** Add `postgresql://` at the start

### ❌ Empty string
```
DATABASE_URL=""  # WRONG - empty
```
**Fix:** Fill in with actual URL

### ❌ Special characters in password not escaped
```
DATABASE_URL="postgresql://user:p@ss@word@host:5432/db"  # WRONG
```
**Fix:** URL-encode special characters
- `@` → `%40`
- `#` → `%23`
- `:` → `%3A`
- `/` → `%2F`

Example: `p@ss#word` becomes `p%40ss%23word`

### ❌ Using Supabase connection pooling URL with wrong mode
```
# Sometimes Supabase gives different URLs. Use the "URI" mode, not others.
```
**Fix:** Copy from "URI" tab specifically

### ❌ Port number wrong for Supabase
```
DATABASE_URL="postgresql://...@aws-0-us-east-1.supabase.com:5432/..."  # WRONG for pooling
```
**Fix:** Use port `6543` for connection pooling

---

## After DATABASE_URL is Set

1. **Run migrations:**
   ```bash
   npx prisma migrate dev
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

4. **Login with dev credentials:**
   - Email: `dev@gymtycoon.app`
   - No password needed

---

## Still Having Issues?

### Check if PostgreSQL is running:
```bash
psql --version  # Should print version
```

### Check if DATABASE_URL is being read:
Add this to `src/lib/db/prisma.ts`:
```typescript
console.log('[v0] DATABASE_URL set:', process.env.DATABASE_URL ? 'YES' : 'NO');
```

Then run `npm run dev` and check the logs.

### Reset everything and start fresh:
```bash
# Remove node modules and reinstall
rm -rf node_modules
npm install

# Generate fresh Prisma client
npx prisma generate

# Reset database (careful - deletes all data!)
npx prisma migrate reset

# Now try again
npm run dev
```

### Last resort - Check raw file content:

```bash
cat .env.local  # macOS/Linux - shows file contents
type .env.local # Windows - shows file contents
```

Make sure you see:
```
DATABASE_URL="postgresql://..."
```

If you don't see it, the file doesn't have DATABASE_URL.

---

## Get Help

If still stuck:
1. Verify PostgreSQL is running: `psql --version`
2. Check `.env.local` exists with `DATABASE_URL`
3. Restart `npm run dev`
4. Check server logs for the exact error
5. Try `npx prisma studio` to verify connection
