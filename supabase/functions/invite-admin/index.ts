// invite-admin Edge Function
// POST { email } → invites a new admin via Supabase Auth
// GET           → returns list of all admin users
//
// Auth: caller must send a valid user JWT in Authorization: Bearer <token>.
// The service role key (never exposed to frontend) is used only server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // -- Verify the caller has a valid session ----------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  // -- Admin client (service role — stays on the server) ----------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // -- GET: list all users ----------------------------------------------
  if (req.method === 'GET') {
    const { data, error } = await admin.auth.admin.listUsers()
    if (error) return json({ error: error.message }, 500)
    return json({ users: data.users })
  }

  // -- POST: invite a new admin -----------------------------------------
  if (req.method === 'POST') {
    const body  = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()

    if (!email || !email.includes('@')) {
      return json({ error: 'A valid email address is required.' }, 400)
    }

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://adminodac.github.io/internal-portal/admin/reset-password/',
    })

    if (error) {
      const msg = error.message ?? ''
      if (msg.toLowerCase().includes('already registered')) {
        return json({ error: 'An account with that email already exists.' }, 400)
      }
      return json({ error: 'Could not send the invitation. Please try again.' }, 500)
    }

    return json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
})
