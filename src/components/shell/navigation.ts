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
  if (href === "/") return pathname === "/";
  // A website inquiry is reviewed on its way to becoming a client.
  if (href === "/clients" && pathname.startsWith("/inquiries/")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}
