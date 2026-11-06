// Provisions a driver: the dispatcher console posts { email, name } here, and Auth
// emails the driver an invite carrying a one-time code. The driver app turns that code
// and a password of their choosing into their first sign-in.
//
// This is an Edge Function and not an RPC because inviting is the Admin API, and the
// Admin API needs the service-role key, which no browser may hold. It does the least
// it can with that key: everything a dispatcher may know about drivers is still read
// through RPCs, under the dispatcher's own JWT.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Postgres' insufficient_privilege, which `public.console_profile()` raises to refuse. */
const REFUSED = "42501";

// The console is a browser app on another origin.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return reply(405, { error: "POST only" });

  const refusal = await refuseUnlessDispatcher(request);
  if (refusal) return refusal;

  const invitation = await readInvitation(request);
  if ("error" in invitation) return reply(400, invitation);

  return provision(invitation);
});

/**
 * The same question the console asks after a sign-in, asked with the caller's own JWT:
 * only an active dispatcher gets past it.
 */
async function refuseUnlessDispatcher(request: Request): Promise<Response | null> {
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: request.headers.get("authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { error } = await caller.rpc("console_profile");
  if (error?.code === REFUSED) {
    return reply(403, { error: "only an active dispatcher may invite drivers" });
  }
  return error ? reply(401, { error: error.message }) : null;
}

async function readInvitation(
  request: Request,
): Promise<{ email: string; name: string } | { error: string }> {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!email.includes("@")) return { error: "an email address is required" };
  if (!name) return { error: "a name is required" };
  return { email, name };
}

async function provision({ email, name }: { email: string; name: string }) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Created first, with the role and name in app metadata, so the profile is a driver's
  // from the start. Inviting directly would create the user with only user metadata --
  // a customer until something corrected it. (GoTrue writes the app metadata in a second
  // statement; `app.settle_profile_from_app_metadata` picks it up.)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    app_metadata: { role: "driver", name },
  });
  if (createError?.code === "email_exists") {
    return reply(409, { error: "an account with that email already exists" });
  }
  if (createError || !created.user) {
    return reply(500, {
      error: createError?.message ?? "the driver could not be created",
    });
  }

  // Inviting an existing, unconfirmed user sends the invite to them as they are.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError) {
    // No invite, no way in: leave nothing half-provisioned behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return reply(502, { error: `the invite could not be sent: ${inviteError.message}` });
  }

  return reply(201, { id: created.user.id });
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
