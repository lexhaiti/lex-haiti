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
import { createTransport } from "nodemailer"
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
      // 10-minute expiry on the verification token. Editor-only app:
      // the user is right there at their keyboard when they request
      // the link, so a long window only widens the stolen-link attack
      // surface. The default 24h was the framework convention; 10 min
      // matches OWASP guidance + Notion / Linear / Slack practice
      // while leaving margin for slow SMTP relays.
      maxAge: 10 * 60,
      sendVerificationRequest: sendMagicLinkEmail,
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

// ---------------------------------------------------------------------------
// Branded magic-link email template
// ---------------------------------------------------------------------------
//
// Auth.js's default email is text/HTML with no styling — readable, but
// generic. The block below replaces it with a brand-consistent template:
// a navy header band that mirrors the website's hero, a clear greeting,
// the actual link as a single primary-color button, expiry guidance,
// and a quiet footer for the "didn't request this?" disclaimer.
//
// The transport is built from the same ``server`` config Auth.js passes
// through; in dev it points at Mailpit, in prod it points at the
// configured SMTP relay (Mailgun / SES / IONOS / etc.).

async function sendMagicLinkEmail(params: {
  identifier: string
  url: string
  // The Auth.js provider arg carries the resolved Nodemailer config.
  // We accept ``any`` here because the upstream type
  // (``NodemailerConfig.server``) allows ``undefined``, which doesn't
  // round-trip cleanly through nodemailer's ``createTransport``
  // signature — the runtime always sets ``server`` because we declare
  // it above, but the static type doesn't reflect that. Narrow + cast
  // inside the body.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: { server?: any; from?: string }
}): Promise<void> {
  const { identifier: to, url, provider } = params
  if (!provider.server || !provider.from) {
    throw new Error("Nodemailer provider not fully configured")
  }
  const { host } = new URL(url)
  const transport = createTransport(provider.server)
  const result = await transport.sendMail({
    to,
    from: provider.from,
    subject: `Votre lien de connexion — LexHaïti`,
    text: renderMagicLinkText({ url, host, to }),
    html: renderMagicLinkHtml({ url, host, to }),
  })
  const rejected = result?.rejected || []
  if (rejected.length) {
    throw new Error(`Email(s) (${rejected.join(", ")}) rejected by SMTP server.`)
  }
}

/** Friendly greeting derived from the email address — "Bonjour Glory,"
 *  rather than "Bonjour info@lexhaiti.org,". Picks up the local part,
 *  drops common punctuation, and title-cases. */
function deriveGreetingName(email: string): string {
  const local = email.split("@")[0] || email
  const cleaned = local.replace(/[._+-]+/g, " ").trim()
  if (!cleaned) return ""
  // Title-case each space-separated word.
  return cleaned
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function renderMagicLinkText(args: {
  url: string
  host: string
  to: string
}): string {
  const name = deriveGreetingName(args.to)
  const hello = name ? `Bonjour ${name},` : "Bonjour,"
  return [
    hello,
    "",
    "Voici votre lien de connexion sécurisé à LexHaïti :",
    args.url,
    "",
    "Ce lien expire dans 10 minutes et ne peut être utilisé qu'une seule fois.",
    "",
    `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — aucune action ne sera prise sur votre compte.`,
    "",
    "— L'équipe LexHaïti",
    "https://lexhaiti.org",
  ].join("\n")
}

function renderMagicLinkHtml(args: {
  url: string
  host: string
  to: string
}): string {
  const name = deriveGreetingName(args.to)
  const greeting = name ? `Bonjour ${escapeHtml(name)},` : "Bonjour,"
  const safeUrl = escapeHtml(args.url)
  // Inline CSS only — most email clients strip <style> and external
  // stylesheets. The palette mirrors the website's primary navy
  // (#0D1B4C) and a warm gold accent (#C9A227).
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connexion à LexHaïti</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
          <!-- Navy banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#0D1B4C 0%,#1a2a6c 60%,#0D1B4C 100%);padding:32px 36px;color:#ffffff;">
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C9A227;font-weight:700;">LexHaïti</p>
              <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.01em;color:#ffffff;">
                Votre lien de connexion
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 36px 8px 36px;font-size:15px;line-height:1.6;color:#0f172a;">
              <p style="margin:0 0 16px 0;font-weight:600;">${greeting}</p>
              <p style="margin:0 0 16px 0;color:#475569;">
                Cliquez sur le bouton ci-dessous pour vous connecter à LexHaïti. Ce lien est strictement personnel et n'a été envoyé qu'à votre adresse.
              </p>
            </td>
          </tr>
          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:8px 36px 24px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#0D1B4C;border-radius:8px;">
                    <a href="${safeUrl}" target="_blank" rel="noopener"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                      Se connecter à LexHaïti →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Fallback URL -->
          <tr>
            <td style="padding:0 36px 28px 36px;font-size:12px;color:#94a3b8;">
              <p style="margin:0 0 6px 0;">Le bouton ne fonctionne pas&nbsp;? Copiez-collez ce lien dans votre navigateur&nbsp;:</p>
              <p style="margin:0;word-break:break-all;color:#475569;">${safeUrl}</p>
            </td>
          </tr>
          <!-- Expiry callout -->
          <tr>
            <td style="padding:0 36px 28px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;border-left:3px solid #C9A227;border-radius:6px;">
                <tr>
                  <td style="padding:14px 16px;font-size:12.5px;color:#334155;line-height:1.5;">
                    <strong style="color:#0f172a;">Sécurité :</strong>
                    ce lien expire dans 10 minutes et ne fonctionne qu'une seule fois.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 36px 32px 36px;font-size:11.5px;color:#94a3b8;line-height:1.6;border-top:1px solid #e2e8f0;padding-top:20px;">
              <p style="margin:0 0 6px 0;">
                Vous n'êtes pas à l'origine de cette demande&nbsp;? Vous pouvez ignorer cet email — aucune action ne sera prise sur votre compte.
              </p>
              <p style="margin:0;">
                — L'équipe LexHaïti, <a href="https://lexhaiti.org" style="color:#0D1B4C;text-decoration:none;">lexhaiti.org</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;">
          Cet email a été envoyé depuis ${escapeHtml(args.host)}.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
