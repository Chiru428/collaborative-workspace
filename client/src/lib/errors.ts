import axios from "axios";

/** Extracts a user-facing message from an unknown thrown value (API error body, network error, etc). */
export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};
