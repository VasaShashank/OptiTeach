"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen, CalendarDays, Clock3, Database, FileText, LogOut, Menu, Network, School, Sun, Upload, X,
} from "lucide-react";
import { clearSession, useSession } from "@/lib/auth";
import { THEMES, useTheme } from "@/lib/theme";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number }> };

// Navigation tailored for Faculty / Teachers
export const TEACHER_NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Teach",
    items: [
      { href: "/", label: "Today's Agenda", icon: Sun },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/lesson-plans", label: "Lesson plans", icon: FileText },
    ],
  },
  {
    title: "Course",
    items: [
      { href: "/courses", label: "My Courses", icon: BookOpen },
      { href: "/curriculum", label: "Curriculum Graph", icon: Network },
      { href: "/optimization", label: "Time plan", icon: Clock3 },
      { href: "/upload", label: "Import syllabus", icon: Upload },
    ],
  },
  {
    title: "Database",
    items: [{ href: "/dbms", label: "DBMS showcase", icon: Database }],
  },
];

// Navigation strictly tailored for Department Administrators / HOD / Dean
export const ADMIN_NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Institution",
    items: [
      { href: "/admin", label: "Admin & Mappings", icon: School },
      { href: "/courses", label: "All Department Courses", icon: BookOpen },
    ],
  },
  {
    title: "Curriculum",
    items: [
      { href: "/upload", label: "Import Syllabus", icon: Upload },
    ],
  },
  {
    title: "Database",
    items: [
      { href: "/dbms", label: "DBMS Showcase", icon: Database },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const signOut = () => {
    clearSession();
    router.replace("/login");
  };

  const isAdmin = user?.role === "admin";
  const homeHref = isAdmin ? "/admin" : "/";
  const navGroups = isAdmin ? ADMIN_NAV_GROUPS : TEACHER_NAV_GROUPS;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Narrow screens: a slim bar with a menu button */}
      <div className="app-topbar">
        <Link href={homeHref} className="app-wordmark">OptiTeach</Link>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="app-sidebar">
          {open ? <X size={20} /> : <Menu size={20} />} <span className="visually-hidden">Menu</span>
        </button>
      </div>

      <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Main navigation">
        <div style={{ padding: "20px 20px 8px" }}>
          <Link href={homeHref} className="app-wordmark" style={{ display: "block" }}>OptiTeach</Link>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--primary)", marginTop: 2, letterSpacing: "0.03em" }}>
            {isAdmin ? "Administration Portal" : "Curriculum &amp; Autonomous OBE"}
          </div>
        </div>

        <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
          {navGroups.map((group) => (
            <div key={group.title} style={{ marginTop: 16 }}>
              <div style={{ padding: "0 10px 6px", fontSize: "0.8rem", fontWeight: 600, color: "var(--pencil-light)" }}>{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                    className={`app-nav-link${active ? " is-active" : ""}`}>
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: "12px 16px", borderTop: "var(--border-w) solid var(--rule)" }}>
          <div role="radiogroup" aria-label="Theme" className="theme-switch">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={theme === t.id}
                className={theme === t.id ? "is-on" : ""} onClick={() => setTheme(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.full_name}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--pencil)" }}>{user.role === "admin" ? "Administrator" : "Teacher"}</div>
              </div>
              <button type="button" onClick={signOut} className="btn btn-ghost" style={{ padding: 8 }} title="Sign out">
                <LogOut size={18} /><span className="visually-hidden">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </aside>
      {open && <div className="app-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
