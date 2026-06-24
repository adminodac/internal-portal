# ODAC Internal Portal â€” Browser-First Setup Guide

**Phase 1: Public Intake Form**
Estimated time: 45â€“60 minutes, no coding required.
You will need: a web browser, access to this GitHub repository.

> If you get stuck at any step, copy the error message and ask Claude.
> Every step here can be done entirely in your browser.

---

## What This Guide Covers

1. Create a Supabase account and project
2. Create the database tables
3. Enable security policies
4. Create the file storage bucket
5. Set up Resend for email
6. Deploy the Edge Function (email sender)
7. Connect the webhook (trigger emails on new submissions)
8. Update the form with your Supabase credentials
9. Enable GitHub Pages
10. Test everything
11. Common problems and fixes

---

## Step 1 â€” Create Your Supabase Account and Project

> **Browser action**

1. Go to **https://supabase.com**
2. Click **Start your project** (top right)
3. Sign in with GitHub (recommended) or create an account
4. After signing in, click **New project**
5. Fill in:
   - **Organization**: your personal org or create a new one named "ODAC"
   - **Name**: `odac-portal`
   - **Database Password**: click "Generate a password" â€” **save this password somewhere safe** (you'll need it if you ever need direct database access)
   - **Region**: `Canada (Central)` â€” ca-central-1
6. Click **Create new project**
7. Wait 1â€“2 minutes while Supabase sets up your project (you'll see a loading screen)

---

## Step 2 â€” Get Your API Keys

> **Browser action**

1. In your Supabase project dashboard, click **Settings** (gear icon in the left sidebar)
2. Click **API**
3. You will see:
   - **Project URL** â€” looks like `https://abcxyzabcxyz.supabase.co`
   - **Project API Keys** â†’ `anon` `public` â€” a long string starting with `eyJ...`
4. Keep this page open â€” you'll need these values in Step 8

---

## Step 3 â€” Create the Database Tables

> **SQL Editor action** â€” paste and run, one file at a time

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase/sql/01_schema.sql` from this repository
4. Copy the entire contents of that file
5. Paste it into the SQL editor
6. Click **Run** (or press `Ctrl+Enter` on Windows / `Cmd+Enter` on Mac)
7. You should see a green banner: **"Success. No rows returned"**

**Verify it worked:**
- Click **Table Editor** in the left sidebar
- You should see two tables: `submissions` and `submission_files`

---

## Step 4 â€” Enable Security Policies (RLS)

> **SQL Editor action**

1. In SQL Editor, click **New query** again
2. Open `supabase/sql/02_rls.sql` from this repository
3. Copy the entire contents
4. Paste it into the SQL editor
5. Click **Run**
6. You should see: **"Success. No rows returned"**

**What this does:** It locks down the database so only the intake form
(not random internet users) can write to it, and nobody can read submissions
except future authenticated admins.

---

## Step 5 â€” Create the File Storage Bucket

> **Browser action** (Storage section of Supabase dashboard)

1. In your Supabase project, click **Storage** in the left sidebar
2. Click **New bucket**
3. Fill in:
   - **Name**: `submission-files` (exactly this â€” lowercase, with hyphen)
   - **Public bucket**: leave this **OFF** (unchecked)
   - **File size limit**: type `10` and select `MB`
   - **Allowed MIME types**: type these one by one and press Enter:
     - `image/jpeg`
     - `image/png`
     - `application/pdf`
4. Click **Save**

**Then set the upload policy:**

1. Still in Storage, click **Policies** (top of the page or in the left sidebar under Storage)
2. Find the section for `storage.objects`
3. Click **New policy**
4. Choose **For full customization**
5. Fill in:
   - **Policy name**: `anon_can_upload_submission_files`
   - **Allowed operation**: `INSERT`
   - **Target roles**: `anon`
   - **USING expression**: leave empty
   - **WITH CHECK expression**: `bucket_id = 'submission-files'`
6. Click **Review** then **Save policy**

> **Alternative:** If you already ran `02_rls.sql` and it included the storage policy,
> you may see it already listed here. If so, skip the manual policy creation above.

---

## Step 6 â€” Set Up Resend (Email Provider)

> **Browser action** â€” new tab

Resend is the email service that sends confirmation emails to submitters and
alerts to the ODAC inbox. It has a generous free tier (3,000 emails/month).

1. Go to **https://resend.com**
2. Click **Sign up** â€” use your ODAC email address
3. After signing in, click **API Keys** in the left sidebar
4. Click **Create API Key**
   - Name: `odac-portal`
   - Permission: `Full access`
5. Copy the key that appears (starts with `re_...`) â€” **this is your only chance to see it**
   Save it in a secure place (password manager, or a private note)

**Verify your sending domain (important for deliverability):**

1. Click **Domains** in the left sidebar
2. Click **Add domain**
3. Enter `osoyoosartscouncil.com`
4. Resend will show you DNS records to add
5. You or your web host will need to add these DNS records to the domain
   (This step may require contacting whoever manages the ODAC website domain)

> **Temporary workaround:** If you can't verify the domain yet, Resend provides
> a test sender `onboarding@resend.dev` that works for testing. Use this temporarily
> and switch to your domain email later.

---

## Step 7 â€” Deploy the Email Edge Function

> **Browser action** (Supabase Edge Functions)

The Edge Function is the code that runs when a new submission arrives
and sends the two emails (confirmation + admin alert).

1. In your Supabase project, click **Edge Functions** in the left sidebar
2. Click **Create a new function**
3. **Name it exactly**: `notify-submission`
4. In the code editor, **delete all the default code**
5. Open `supabase/functions/notify-submission/index.ts` from this repository
6. Copy the entire contents
7. Paste it into the Supabase Edge Function editor
8. Click **Deploy function**
9. Wait a few seconds â€” you should see a green "Deployed" status

**Set the secrets (environment variables):**

1. In Edge Functions, click on your `notify-submission` function
2. Click **Manage secrets** (or look for "Secrets" in the function settings)
3. Add each of these:

| Secret name    | Value                                    |
|----------------|------------------------------------------|
| `RESEND_API_KEY` | Your Resend API key (starts with `re_`) |
| `ADMIN_EMAIL`  | The ODAC inbox to receive alerts (e.g. `info@osoyoosartscouncil.com`) |
| `FROM_EMAIL`   | The verified sender address (e.g. `submissions@osoyoosartscouncil.com`) |

4. Click **Save** after each secret

---

## Step 8 â€” Create the Database Webhook

> **Browser action** (Supabase Database Webhooks)

The webhook listens for new submissions and fires the Edge Function
to send emails automatically.

1. In your Supabase project, click **Database** in the left sidebar
2. Click **Webhooks** (you may see it under Database â†’ Webhooks)
3. Click **Create a new webhook** (or **Enable webhooks** first if prompted)
4. Fill in:
   - **Name**: `on-new-submission`
   - **Table**: `submissions`
   - **Events**: check only `INSERT`
   - **Type**: `Supabase Edge Functions`
   - **Edge Function**: select `notify-submission` from the dropdown
5. Click **Create webhook**

**Test the webhook:**
- Submit the intake form (after Step 9 below)
- Come back to Database â†’ Webhooks â†’ click your webhook â†’ **Recent deliveries**
- You should see a green delivery with status 200

---

## Step 9 â€” Add Your Supabase Credentials to the Form

> **Codebase action** â€” edit one file in the GitHub repository

1. Go to your GitHub repository: `https://github.com/adminodac/internal-portal`
2. Click on the file `config.js`
3. Click the pencil icon (Edit this file) in the top right
4. Replace the placeholder values:
   - Replace `https://YOUR-PROJECT-REF.supabase.co` with your **Project URL** from Step 2
   - Replace `YOUR-ANON-PUBLIC-KEY-HERE` with your **anon public key** from Step 2
5. Click **Commit changes**
   - Add a commit message like: `config: add Supabase credentials`
   - Keep "Commit directly to the main branch" selected
   - Click **Commit changes**

---

## Step 10 â€” Enable GitHub Pages

> **Browser action** (GitHub repository settings)

1. Go to your repository on GitHub
2. Click **Settings** (top tab, not the sidebar)
3. Click **Pages** in the left sidebar (under "Code and automation")
4. Under **Source**, select:
   - **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **Save**
6. Wait 1â€“2 minutes
7. GitHub will show you the URL: `https://adminodac.github.io/internal-portal`

This is your public intake form URL. Share it with member groups.

---

## Step 11 â€” Test Everything

> **Browser action**

Open your form at `https://adminodac.github.io/internal-portal`

**Test submission:**
1. Select a member group from the dropdown
2. Enter your own email address (for testing)
3. Choose a content type (e.g. Event)
4. Enter a title
5. Write a description (at least 20 characters)
6. Optionally attach a small JPG or PNG file
7. Click **Send to ODAC**

**What should happen:**
- The form shows a spinner for a few seconds
- The success screen appears with a summary of your submission
- Within 1â€“2 minutes, you receive a confirmation email
- The ADMIN_EMAIL address receives an alert email

**Verify in Supabase:**
1. Go to your Supabase dashboard â†’ **Table Editor** â†’ `submissions`
2. You should see your test submission as a new row
3. If you attached a file: **Storage** â†’ `submission-files` â†’ `submissions/` â†’ your submission folder

**If emails didn't arrive:**
- Check your spam folder
- Go to Supabase â†’ Edge Functions â†’ `notify-submission` â†’ **Logs**
- Look for any red error messages (see Troubleshooting below)

---

## Troubleshooting

### "Could not load the required libraries"
The page can't reach the Supabase CDN. Check your internet connection and refresh.

### "This form is not yet configured"
`config.js` still has the placeholder values. Repeat Step 9.

### "Could not save your submission"
Most likely the RLS policies aren't set correctly.
Go to Supabase â†’ SQL Editor â†’ run this check:
```sql
SELECT policyname, tablename FROM pg_policies
WHERE policyname LIKE 'anon_%';
```
You should see 3 rows. If not, re-run `02_rls.sql`.

### "We couldn't upload [filename]"
The storage bucket or its upload policy isn't configured.
Check: Storage â†’ Buckets â†’ `submission-files` exists.
Check: Storage â†’ Policies â†’ `anon_can_upload_submission_files` exists.

### Emails not arriving
1. Check Supabase â†’ Edge Functions â†’ `notify-submission` â†’ **Logs**
2. Check that all three secrets are set (RESEND_API_KEY, ADMIN_EMAIL, FROM_EMAIL)
3. Check that the webhook exists: Database â†’ Webhooks â†’ `on-new-submission`
4. Check that Resend shows the emails in their dashboard: **https://resend.com** â†’ Emails

### The form appears but submitting does nothing
Open your browser's Developer Tools (press F12) â†’ Console tab.
Look for red error messages and share them with Claude for diagnosis.

---

## Environment Variables Inventory

| Location | Name | What it is | Where to find it |
|----------|------|------------|------------------|
| `config.js` (repo) | `SUPABASE_URL` | Your Supabase project URL | Supabase â†’ Settings â†’ API â†’ Project URL |
| `config.js` (repo) | `SUPABASE_ANON_KEY` | Public anon key | Supabase â†’ Settings â†’ API â†’ anon public |
| Edge Function secret | `RESEND_API_KEY` | Resend sending key | Resend dashboard â†’ API Keys |
| Edge Function secret | `ADMIN_EMAIL` | ODAC admin inbox | Decided by ODAC |
| Edge Function secret | `FROM_EMAIL` | Verified sending address | Your verified Resend domain |

**Never put `RESEND_API_KEY` in `config.js`.** It belongs only as a Supabase Edge Function secret.

---

## What to Do When a Member Group Contact Changes

If a member group gets a new contact person:
- Nothing changes in the system â€” the group name is what matters, not the individual
- The new person just uses the same form URL
- They enter their own email on each submission for that submission's confirmation

---

## What to Do if You Forget the Supabase Database Password

1. Go to Supabase â†’ Settings â†’ Database
2. Click **Reset database password**
3. The portal itself doesn't use this password (it uses the anon key)
   â€” you only need it for direct database connections

---

*Last updated: Phase 1 Â· June 2026*
*Next: Phase 2 (Julyâ€“September) adds the admin dashboard, status tracking, and 48h alerts.*

