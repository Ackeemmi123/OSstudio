"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";
import type { MemberRole } from "@/lib/data/repository";

export interface StudioMembership {
  studioId: string;
  name: string;
  role: MemberRole;
  displayName: string;
}

/** Who is signed in and to which studio. Absent in the local demo. */
export type SessionInfo =
  | { mode: "local" }
  | {
      mode: "supabase";
      supabase: SupabaseClient;
      user: User;
      memberships: StudioMembership[];
      studio: StudioMembership;
      switchStudio: (studioId: string) => void;
      signOut: () => Promise<void>;
    };

export const SessionContext = createContext<SessionInfo>({ mode: "local" });

export function useSession(): SessionInfo {
  return useContext(SessionContext);
}
