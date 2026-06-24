# ODAC Internal Portal

Internal content submission and review platform for the
**Osoyoos & District Arts Council** (Osoyoos, BC, Canada).

---

## What This Is

A simple, secure form where ODAC member groups submit content
(events, exhibitions, artwork, announcements) for review and
publication on Facebook and the ODAC website.

**Live form:** https://adminodac.github.io/internal-portal

---

## Phases

| Phase | Target | Status |
|-------|--------|--------|
| **Phase 1** â€” Public intake form + email notifications | June 30, 2026 | âœ… Built |
| **Phase 2** â€” Admin dashboard, status tracking, 48h alerts | September 2026 | Planned |
| **Phase 3** â€” Monthly reports, handoff documentation | October 2026 | Planned |

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | HTML / CSS / JavaScript (no build step) |
| Hosting | GitHub Pages |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (Phase 2) |
| Storage | Supabase Storage |
| Email | Resend |
| Edge functions | Supabase Edge Functions (Deno) |

---

## Setup

See **[docs/SETUP.md](docs/SETUP.md)** for the complete
browser-first setup guide. No CLI tools required for Phase 1.

---

## Repository Structure

```
/
â”œâ”€â”€ index.html                          Public intake form
â”œâ”€â”€ style.css                           Form styles (ODAC brand)
â”œâ”€â”€ form.js                             Form logic and Supabase client
â”œâ”€â”€ config.js                           Supabase credentials (fill in after setup)
â”œâ”€â”€ supabase/
â”‚   â”œâ”€â”€ functions/
â”‚   â”‚   â””â”€â”€ notify-submission/
â”‚   â”‚       â””â”€â”€ index.ts               Edge Function: sends emails on new submission
â”‚   â””â”€â”€ sql/
â”‚       â”œâ”€â”€ 01_schema.sql              Create tables (run first)
â”‚       â””â”€â”€ 02_rls.sql                 Security policies (run second)
â””â”€â”€ docs/
    â””â”€â”€ SETUP.md                       Browser-first setup guide
```

---

## Member Groups (Phase 1)

18 member groups are in the dropdown:
Artists on Main Â· Best Cellar Books & Tours Â· OASIS Theatre Group Â·
Okanagan Art Gallery Â· Osoyoos Carvers Â· Osoyoos Desert Centre Â·
Osoyoos Elks #436 Â· Osoyoos Festival Society Â· Osoyoos Museum & Archives Â·
Osoyoos Music in the Park Â· Osoyoos Photography Club Â· Osoyoos Potters Â·
Osoyoos Quilters Guild Â· Rock Creek Fall Fair Assn Â·
Rumplestiltskein Fibre Arts Guild Â·
The Similkameen Country Development Association Â·
Wayside Books & Select Art Â· Wide Arts National Association (WANA)

---

## Security Notes

- The `config.js` anon key is safe to commit â€” it is designed to be public
- Never put the Supabase `service_role` key or `RESEND_API_KEY` in `config.js`
- Row Level Security (RLS) is enabled â€” the anon key can only INSERT, never read
- Email secrets are stored in Supabase Edge Function secrets (not in the repo)

---

*Built for ODAC Â· Phase 1 Â· June 2026*

