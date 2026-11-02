// Base URLs come from env so the app works on any host. See client/.env.example.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(/\/$/, "");
export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL || API_URL.replace(/^http/, "ws")).replace(/\/$/, "");
