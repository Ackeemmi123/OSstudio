export interface NavItem {
  href: string;
  label: string;
}

/** Two places: what needs to happen, and who we work for. Everything else lives inside a client. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Today" },
  { href: "/clients", label: "Clients" },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
