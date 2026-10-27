"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { UserPlus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { Section, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import type { MemberRole, RepositoryInfo } from "@/lib/data/repository";
import { toRepositoryError } from "@/lib/data/supabase-errors";

const ROLE_LABELS: Record<MemberRole, string> = { owner: "Owner", member: "Member", viewer: "Viewer" };
const ROLE_HINTS: Record<MemberRole, string> = {
  owner: "Can change everything and manage people.",
  member: "Can change clients, projects and the brief, and approve work.",
  viewer: "Can read everything, change nothing.",
};

/** Who has access to the studio. Owners add people who already have an account. */
export function PeopleSection({ supabase, info }: { supabase: SupabaseClient; info: Extract<RepositoryInfo, { kind: "supabase" }> }) {
  const store = useStudioStore();
  const toast = useToast();
  const id = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = info.role === "owner";

  async function add(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!email.trim() || !name.trim()) {
      setError("Enter their email and name.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: addError } = await supabase.rpc("add_studio_member", { p_studio: info.studio.id, p_email: email.trim(), p_display_name: name.trim(), p_role: role });
    setPending(false);
    if (addError) return setError(toRepositoryError(addError).message);
    toast.success(`${name.trim()} now has ${ROLE_LABELS[role].toLowerCase()} access.`);
    setEmail("");
    setName("");
    await store.reload().catch(() => undefined);
  }

  async function remove(userId: string, displayName: string) {
    const { error: removeError } = await supabase.rpc("remove_studio_member", { p_studio: info.studio.id, p_user: userId });
    if (removeError) return toast.error(toRepositoryError(removeError).message);
    toast.success(`${displayName} no longer has access.`);
    await store.reload().catch(() => undefined);
  }

  return (
    <Section id="people" title="People" count={info.members.length}>
      <Surface>
        <ul className="divide-y divide-line">
          {info.members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-[13.5px] text-ink">
                  {member.displayName}
                  {member.userId === info.user.id ? <span className="text-ink-subtle"> (you)</span> : null}
                </p>
                <p className="text-[12.5px] text-ink-subtle">{ROLE_LABELS[member.role]}</p>
              </div>
              {isOwner && member.userId !== info.user.id ? (
                <Button size="xs" variant="ghost" onClick={() => void remove(member.userId, member.displayName)}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <form onSubmit={add} className="grid gap-3 border-t border-line px-5 py-4 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end" aria-label="Add a person">
            <Field id={`${id}-email`} label="Email">
              <TextInput id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field id={`${id}-name`} label="Name">
              <TextInput id={`${id}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id={`${id}-role`} label="Access">
              <Select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value as MemberRole)} title={ROLE_HINTS[role]}>
                {(["member", "viewer", "owner"] as const).map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={pending}>
              <UserPlus aria-hidden />
              Add
            </Button>
            <p className="text-[12px] text-ink-subtle sm:col-span-4">
              {error ? <span className="text-critical" role="alert">{error} </span> : null}
              They need an account first; an administrator creates it in Supabase. {ROLE_HINTS[role]}
            </p>
          </form>
        ) : (
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-subtle">Only owners can add or remove people.</p>
        )}
      </Surface>
    </Section>
  );
}
