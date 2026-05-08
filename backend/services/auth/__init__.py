"""Auth domain — users, sessions, role checks. Reads Auth.js's tables.

Auth.js (in the Next.js frontend) writes to auth.users / auth.sessions when an
editor signs in. The backend's job is read-only: receive the cookie, look up
the session, identify the user, enforce role.
"""
