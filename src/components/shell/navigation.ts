import {
  Bot,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  Settings2,
  Stamp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/agents", label: "AI Agents", icon: Bot },
  { href: "/approvals", label: "Approvals", icon: Stamp },
];

export const SECONDARY_NAV: NavItem[] = [{ href: "/settings", label: "Settings", icon: Settings2 }];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function sectionFor(pathname: string): NavItem | undefined {
  return [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) => isActive(pathname, item.href));
}
