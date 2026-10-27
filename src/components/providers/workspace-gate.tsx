"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthLayout, ConfigProblem, CreateStudioView, GateMessage, SignInView } from "@/components/auth/auth-views";
import { getDataMode } from "@/lib/config";
import { createLocalRepository, createSupabaseRepository } from "@/lib/data";
import { toRepositoryError } from "@/lib/data/supabase-errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { SessionContext, type SessionInfo, type StudioMembership } from "./session-provider";
import { StudioProvider } from "./studio-provider";

const STUDIO_CHOICE_KEY = "studio-os:studio";
const SESSION_ENDED = "Your session has ended. Sign in again to continue.";

/**
 * Decides where data comes from before anything else renders:
 * - the local demo, when no backend is configured (or it is chosen explicitly);
 * - otherwise Supabase, which requires sign-in and studio membership.
 * A misconfigured backend shows an error; it never falls back to the browser.
 */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const mode = useMemo(() => getDataMode(), []);
  if (mode.kind === "local") {
    return (
      <SessionContext.Provider value={{ mode: "local" }}>
        <StudioProvider key="local" createRepository={createLocalRepository}>
          {children}
        </StudioProvider>
      </SessionContext.Provider>
    );
  }
  if (mode.kind === "misconfigured") {
    return (
      <AuthLayout>
        <ConfigProblem problem={mode.problem} />
      </AuthLayout>
    );
  }
  return <SupabaseGate supabase={getBrowserSupabase(mode.url, mode.anonKey)}>{children}</SupabaseGate>;
}

type AuthState = { status: "loading" } | { status: "signed_out"; notice?: string } | { status: "signed_in"; user: User };

type Memberships =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; list: StudioMembership[] };

function SupabaseGate({ supabase, children }: { supabase: SupabaseClient; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const signingOut = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuth(data.session ? { status: "signed_in", user: data.session.user } : { status: "signed_out" });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setAuth((current) => (current.status === "signed_in" && current.user.id === session.user.id ? current : { status: "signed_in", user: session.user }));
      } else if (event === "SIGNED_OUT") {
        // A sign-out nobody asked for means the session could not be refreshed.
        setAuth({ status: "signed_out", notice: signingOut.current ? undefined : SESSION_ENDED });
        signingOut.current = false;
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    await supabase.auth.signOut();
  }, [supabase]);

  const expire = useCallback(() => {
    void supabase.auth.signOut({ scope: "local" }).finally(() => setAuth({ status: "signed_out", notice: SESSION_ENDED }));
  }, [supabase]);

  if (auth.status === "loading") return <GateMessage title="Loading…" busy />;
  if (auth.status === "signed_out") {
    return (
      <AuthLayout>
        <SignInView supabase={supabase} notice={auth.notice} />
      </AuthLayout>
    );
  }
  return (
    <MembershipGate key={auth.user.id} supabase={supabase} user={auth.user} signOut={signOut} expire={expire}>
      {children}
    </MembershipGate>
  );
}

function MembershipGate({
  supabase,
  user,
  signOut,
  expire,
  children,
}: {
  supabase: SupabaseClient;
  user: User;
  signOut: () => Promise<void>;
  expire: () => void;
  children: ReactNode;
}) {
  const [memberships, setMemberships] = useState<Memberships>({ status: "loading" });
  const [chosen, setChosen] = useState<string | null>(() => readChoice());

  const loadMemberships = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_studios");
    if (error) {
      const problem = toRepositoryError(error);
      if (problem.code === "session") return expire();
      setMemberships({ status: "error", message: problem.message });
      return;
    }
    const list = (data as { studio_id: string; name: string; role: StudioMembership["role"]; display_name: string }[]).map((row) => ({
      studioId: row.studio_id,
      name: row.name,
      role: row.role,
      displayName: row.display_name,
    }));
    setMemberships({ status: "ready", list });
  }, [supabase, expire]);

  useEffect(() => {
    // Fetching on mount is the point of this effect; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMemberships();
  }, [loadMemberships]);

  if (memberships.status === "loading") return <GateMessage title="Loading your studio…" busy />;
  if (memberships.status === "error") {
    return <GateMessage title="Your studio could not be loaded" description={`${memberships.message} Reload the page to try again.`} action={{ label: "Sign out", onClick: signOut }} />;
  }
  if (memberships.list.length === 0) {
    return (
      <AuthLayout>
        <CreateStudioView supabase={supabase} email={user.email ?? null} onCreated={loadMemberships} onSignOut={signOut} />
      </AuthLayout>
    );
  }

  const studio = memberships.list.find((m) => m.studioId === chosen) ?? memberships.list[0];
  const session: SessionInfo = {
    mode: "supabase",
    supabase,
    user,
    memberships: memberships.list,
    studio,
    switchStudio: (studioId) => {
      writeChoice(studioId);
      setChosen(studioId);
    },
    signOut,
  };

  return (
    <SessionContext.Provider value={session}>
      <StudioProvider
        key={`${user.id}:${studio.studioId}`}
        createRepository={() => createSupabaseRepository(supabase, studio.studioId, { id: user.id, email: user.email ?? null })}
        onSessionExpired={expire}
      >
        {children}
      </StudioProvider>
    </SessionContext.Provider>
  );
}

function readChoice(): string | null {
  try {
    return window.localStorage.getItem(STUDIO_CHOICE_KEY);
  } catch {
    return null;
  }
}

function writeChoice(studioId: string) {
  try {
    window.localStorage.setItem(STUDIO_CHOICE_KEY, studioId);
  } catch {
    // Remembering the choice is a convenience only.
  }
}
