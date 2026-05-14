/**
 * Auth.js v5 configuration.
 *
 * - **Adapter:** @auth/pg-adapter writes users/accounts/sessions/verification_token
 *   to Postgres. Tables live in the `auth` schema (see Alembic migration 0002);
 *   we set the connection's search_path so the adapter's unqualified queries
 *   resolve there.
 *
 * - **Provider:** Nodemailer (magic link). Points at Mailpit in dev — emails
 *   never leave the laptop. Inbox at http://localhost:8025.
 *
 * - **Session strategy:** database. Cookie is opaque; the truth lives in
 *   auth.sessions. The FastAPI backend reads the same cookie and looks up
 *   the same row to identify the caller.
 *
 * - **Role:** we extend the session callback to surface the user's `role`
 *   column (added by our migration on top of the standard Auth.js shape) so
 *   the frontend can branch on it.
 */
import NextAuth, { type DefaultSession } from "next-auth"
import Nodemailer from "next-auth/providers/nodemailer"
import PostgresAdapter from "@auth/pg-adapter"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
})

// The pg adapter issues unqualified `users` / `accounts` / `sessions` /
// `verification_token` queries. Resolve them to the auth schema by setting
// search_path on every new connection.
pool.on("connect", (client) => {
  client.query("SET search_path TO auth, public_corpus, public").catch(() => {
    /* swallow — connection will fail loudly elsewhere if this is wrong */
  })
})

// Cookie domain — share the session cookie across subdomains in prod.
//
// The FastAPI backend lives at api.lexhaiti.org while the Next.js
// frontend serves lexhaiti.org / www.lexhaiti.org. Auth.js's default
// cookie scope is "current host only" (lexhaiti.org without a leading
// dot), so the browser refuses to send the session cookie when the
// frontend calls api.lexhaiti.org → the API sees every request as
// anonymous and the editor only sees public/published content.
//
// Setting Domain=.lexhaiti.org makes the cookie readable on every
// subdomain. Dev (NEXTAUTH_URL on localhost) leaves Domain undefined
// so localhost:3000 ↔ localhost:8000 keeps working — modern browsers
// share host-only cookies on localhost across ports.
const _cookieDomain = (() => {
  try {
    if (!process.env.NEXTAUTH_URL) return undefined
    const u = new URL(process.env.NEXTAUTH_URL)
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return undefined
    // Strip the leftmost label so www.lexhaiti.org → .lexhaiti.org and
    // lexhaiti.org → .lexhaiti.org (root + www + any future *.foo
    // subdomain all share the cookie).
    const parts = u.hostname.split(".")
    return parts.length >= 2 ? `.${parts.slice(-2).join(".")}` : undefined
  } catch {
    return undefined
  }
})()

const _useSecureCookies = !!_cookieDomain

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PostgresAdapter(pool),
  trustHost: true,
  session: { strategy: "database" },
  useSecureCookies: _useSecureCookies,
  cookies: _cookieDomain
    ? {
        sessionToken: {
          name: "__Secure-authjs.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
            domain: _cookieDomain,
          },
        },
        callbackUrl: {
          name: "__Secure-authjs.callback-url",
          options: {
            sameSite: "lax",
            path: "/",
            secure: true,
            domain: _cookieDomain,
          },
        },
        csrfToken: {
          name: "__Host-authjs.csrf-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
            // ``__Host-`` prefix cookies cannot have Domain set —
            // they're locked to the issuing host by design. The CSRF
            // token only needs to be readable by the Auth.js handler
            // on the same origin, so this is fine.
          },
        },
      }
    : undefined,
  providers: [
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 1025),
        // Mailpit needs no auth in dev; production SMTP will set these.
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      },
      from: process.env.EMAIL_FROM ?? "no-reply@lexhaiti.local",
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
    error: "/sign-in/error",
  },
  callbacks: {
    /**
     * Gate non-authorized emails BEFORE sending the magic link.
     *
     * Auth.js calls this callback at sign-in time (with `email.verificationRequest=true`)
     * and again after the user clicks the magic link. We reject in both phases
     * if the email isn't pre-registered in `auth.users` (created by the
     * `scripts/create_admin.py` CLI). No fishing, no auto-account-creation.
     */
    async signIn({ user, email }) {
      const targetEmail = user?.email ?? null
      if (!targetEmail) return false

      const result = await pool.query(
        "SELECT id FROM auth.users WHERE email = $1 LIMIT 1",
        [targetEmail],
      )
      if (result.rows.length === 0) {
        // Surface a specific code on the error page.
        // Returning a URL is the v5 way to redirect with custom info.
        return "/sign-in/error?error=NotAuthorized"
      }

      // For the verification-request phase (email send) and the callback
      // phase (token redeem), both need this check. We only block here.
      void email
      return true
    },

    /**
     * Surface the role + id on the session so the client and the EditorBar
     * can branch on `useSession().data.user.role` without an extra fetch.
     */
    async session({ session, user }) {
      if (session.user) {
        // Auth.js's AdapterUser type doesn't know about our `role` column,
        // but the adapter selects all columns so it's there at runtime.
        const u = user as unknown as UserWithRole
        ;(session.user as SessionUser).role = u.role
        ;(session.user as SessionUser).id = String(u.id)
      }
      return session
    },
  },
})

/** Shape of `session.user` after our session callback adds the role. */
export type Role = "admin" | "reviewer" | "editor"

interface UserWithRole {
  id: number | string
  role: Role
}

/** session.user, with our role + id surfaced. */
export type SessionUser = NonNullable<DefaultSession["user"]> & {
  id?: string
  role?: Role
}

declare module "next-auth" {
  interface Session {
    user: SessionUser
  }
}
