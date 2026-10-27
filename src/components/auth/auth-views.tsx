"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Surface } from "@/components/ui/surface";
import { toRepositoryError } from "@/lib/data/supabase-errors";

/** A centered card for everything shown before the workspace: sign-in, setup, problems. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="mb-8">
        <BrandMark />
      </div>
      <div className="w-full max-w-[400px]">{children}</div>
    </main>
  );
}

export function GateMessage({
  title,
  description,
  busy,
  action,
}: {
  title: string;
  description?: string;
  busy?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center" role={busy ? "status" : "alert"} aria-live="polite">
        {busy ? <LoaderCircle aria-hidden className="size-5 animate-spin text-ink-subtle" /> : <TriangleAlert aria-hidden className="size-5 text-critical" />}
        <p className="text-[15px] font-medium text-ink">{title}</p>
        {description ? <p className="text-[13.5px] leading-relaxed text-ink-muted">{description}</p> : null}
        {action ? (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </AuthLayout>
  );
}

export function ConfigProblem({ problem }: { problem: string }) {
  return (
    <Surface className="p-6" role="alert">
      <h1 className="text-[17px] font-medium tracking-[-0.015em] text-ink">Studio OS is not configured correctly</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{problem}</p>
      <p className="mt-3 text-[12.5px] text-ink-subtle">
        Nothing is stored in this browser instead. See docs/persistence.md for the required settings.
      </p>
    </Surface>
  );
}

export function SignInView({ supabase, notice }: { supabase: SupabaseClient; notice?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(
          signInError.code === "invalid_credentials" || signInError.status === 400
            ? "That email and password do not match an account."
            : signInError.status === 429
              ? "Too many attempts. Wait a minute and try again."
              : toRepositoryError(signInError).message,
        );
      }
    } catch (failure) {
      setError(toRepositoryError(failure).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface className="p-6">
      <h1 className="text-[19px] font-medium tracking-[-0.02em] text-ink">Sign in</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Use the account your studio set up for you.</p>
      {notice ? (
        <p role="status" className="mt-4 rounded-[var(--radius-control)] border border-line bg-sunken px-3 py-2 text-[13px] text-ink">
          {notice}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" aria-label="Sign in">
        <Field id={`${id}-email`} label="Email">
          <TextInput id={`${id}-email`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id={`${id}-password`} label="Password">
          <TextInput id={`${id}-password`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="text-[13px] text-critical">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-[12.5px] leading-relaxed text-ink-subtle">
        There is no public sign-up. Ask your studio&apos;s administrator for an account.
      </p>
    </Surface>
  );
}

export function CreateStudioView({
  supabase,
  email,
  onCreated,
  onSignOut,
}: {
  supabase: SupabaseClient;
  email: string | null;
  onCreated: () => void;
  onSignOut: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim() || !displayName.trim()) {
      setError("Enter the studio's name and your own.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: createError } = await supabase.rpc("create_studio", { p_name: name.trim(), p_display_name: displayName.trim() });
    setPending(false);
    if (createError) setError(toRepositoryError(createError).message);
    else onCreated();
  }

  return (
    <Surface className="p-6">
      <h1 className="text-[19px] font-medium tracking-[-0.02em] text-ink">You&apos;re not in a studio yet</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
        If your team already uses Studio OS, ask an owner to add {email ? <span className="text-ink">{email}</span> : "your email"}. Otherwise, set up
        your studio. You will be its owner.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" aria-label="Create a studio">
        <Field id={`${id}-studio`} label="Studio name">
          <TextInput id={`${id}-studio`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Axivo" />
        </Field>
        <Field id={`${id}-name`} label="Your name" hint="Shown next to the changes you make.">
          <TextInput id={`${id}-name`} value={displayName} maxLength={120} autoComplete="name" onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="text-[13px] text-critical">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Creating…" : "Create studio"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
