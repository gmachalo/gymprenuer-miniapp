# Quick Start - 5 Minutes to Running GymPrenuer

## You're seeing: `P1013: The provided database string is invalid`

This means your `DATABASE_URL` is not set. Follow these steps:

---

## Step 1: Copy Example Environment File

```bash
cp .env.example .env.local
```

**You now have a file called `.env.local` in your project root.**

---

## Step 2: Choose Your Database (Pick ONE)

### A) Supabase (Easiest - Free Tier)

1. Go to https://supabase.com
2. Sign up and create a new project
3. Wait for initialization (2-3 minutes)
4. Click **Settings** → **Database** → **Connection String**
5. Click **URI** tab
6. Copy the entire connection string
7. Open `.env.local` and find this line:
   ```
   DATABASE_URL="postgresql://user:password@host:port/database"
   ```
8. Replace it with what you copied. It should look like:
   ```
   DATABASE_URL="postgresql://postgres.xxxxx:yyyyy@aws-0-us-east-1.pooling.supabase.com:6543/postgres?schema=public"
   ```
9. Save the file

### B) Local PostgreSQL (If you have it installed)

1. Open `.env.local`
2. Find the `DATABASE_URL` line
3. Replace with:
   ```
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/gymtyc_miniapp"
   ```
   (Use whatever password you set during PostgreSQL installation)
4. Save the file

### C) Docker (If you have Docker installed)

1. Create a file called `docker-compose.yml` in project root with:
   ```yaml
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
   ```

2. Start it:
   ```bash
   docker-compose up -d
   ```

3. Open `.env.local` and replace DATABASE_URL with:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gymtyc_miniapp"
   ```

4. Save the file

---

## Step 3: Generate Auth Secret

Run this command:

```bash
openssl rand -base64 32
```

You'll get something like: `abcd1234...xyz/+=`

Copy this entire string. Open `.env.local` and replace:
```
AUTH_SECRET="your-secret-key-at-least-32-characters-long"
```

With what you just copied:
```
AUTH_SECRET="abcd1234...xyz/+="
```

Save the file.

---

## Step 4: Initialize Database

```bash
npx prisma migrate dev --name init
```

You should see:
```
✔ Generated Prisma Client
✔ Created migration
✔ Applied 1 migration
```

**If you see that, you're done with setup!**

---

## Step 5: Start the App

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Step 6: Login

Click "Dev Login" and use:
- **Email:** `dev@gymtycoon.app`
- **No password needed**

Complete onboarding and enjoy!

---

## Verify It's Working

Once logged in, you should:
1. See onboarding flow
2. Create a character
3. See the dashboard with your stats
4. Click "Train" to log a workout
5. View your rewards

---

## Troubleshooting

### Still getting P1013 error?

Check these in order:

1. **Do you have `.env.local` file?**
   ```bash
   ls -la .env.local  # macOS/Linux
   dir .env.local     # Windows
   ```
   If not found, run: `cp .env.example .env.local`

2. **Is DATABASE_URL filled in?**
   ```bash
   cat .env.local | grep DATABASE_URL  # macOS/Linux
   type .env.local | findstr DATABASE_URL  # Windows
   ```
   Should show something like:
   ```
   DATABASE_URL="postgresql://..."
   ```
   If it's empty or still says `user:password@host`, it's not filled in.

3. **Restart dev server:**
   ```bash
   # Stop it: Press Ctrl+C
   # Restart:
   npm run dev
   ```

4. **Test database connection:**
   ```bash
   npx prisma studio
   ```
   Should open http://localhost:5555 with database UI.

### My database isn't running?

**Supabase:** Go to https://supabase.com and check project status. Should be green.

**Local PostgreSQL:** Run:
```bash
psql --version  # Should print version
```

**Docker:** Run:
```bash
docker-compose ps  # Should show "postgres ... Up"
```

### AUTH_SECRET error?

Run this in terminal:
```bash
openssl rand -base64 32
```

Copy the output and put it in `.env.local` as `AUTH_SECRET="..."`

---

## Next Steps

Once the app is running:
- Explore the **dashboard** to see character stats
- Log a **workout** and see rewards calculated
- Browse **gyms** and join one
- Check **rewards** history
- View your **profile**

See SETUP.md for more advanced configuration.

Need help? Check DATABASE_SETUP.md for detailed database instructions.
