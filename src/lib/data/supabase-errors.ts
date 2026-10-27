import { RepositoryError } from "./repository";

interface DatabaseError {
  code?: string;
  message?: string;
  status?: number;
}

const GENERIC_PERMISSION = "You don't have permission to make this change. Ask a studio owner if you need access.";

/**
 * Turns a Supabase/PostgREST error into a message a person can act on.
 * Messages raised by our own database functions are already written for
 * people; anything else gets a plain explanation instead of SQL details.
 */
export function toRepositoryError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (error instanceof TypeError) {
    return new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
  }
  const { code = "", message = "", status } = (error ?? {}) as DatabaseError;

  if (status === 401 || code === "PGRST301" || code === "PGRST303" || /jwt expired|invalid jwt/i.test(message)) {
    return new RepositoryError("Your session has ended. Sign in again to continue.", "session");
  }
  if (code === "42501") {
    return new RepositoryError(/row-level security|permission denied/i.test(message) ? GENERIC_PERMISSION : message, "permission");
  }
  if (code === "SO409") return new RepositoryError(message, "conflict");
  if (code === "SO404") return new RepositoryError(message, "not_found");
  if (code === "23505") return new RepositoryError("This was already saved. Reload to see the latest version.", "conflict");
  if (["23502", "23503", "23514", "22001", "22P02", "22007"].includes(code)) {
    return new RepositoryError("The change was rejected because a value is missing, invalid or too long.", "validation");
  }
  if (/failed to fetch|network/i.test(message)) {
    return new RepositoryError("Studio OS could not reach the server. Check your connection and try again.", "network");
  }
  return new RepositoryError("The server could not save the change. Try again in a moment.", "storage");
}
