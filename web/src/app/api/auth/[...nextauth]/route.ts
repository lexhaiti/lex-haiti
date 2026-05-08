import { handlers } from "@/auth"

export const { GET, POST } = handlers

// Force the Node runtime — the pg adapter uses TCP sockets, which the Edge
// runtime doesn't support.
export const runtime = "nodejs"
