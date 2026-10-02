import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import { useAuthStore } from "../../store/auth";
import {
  MessageSquare,
  Settings,
  Moon,
  Sun,
  Users,
  LogOut,
  TicketIcon,
  Building2,
  ShieldCheck,
  LayoutTemplate,
  Radio,
  LayoutDashboard,
} from "lucide-react";
import { useFeatureFlag, useEnabledChannelTypes } from "../../api";
import { cn } from "../../utils/utils";
import { ChannelHealthBanner } from "../ui/ChannelHealthBanner";

function roleShort(role?: string) {
  switch (role) {
    case "SUPER_ADMIN":
      return "S.Admin";
    case "ADMIN":
      return "Admin";
    case "MANAGER":
      return "Manager";
    case "AGENT":
      return "Agent";
    default:
      return "";
  }
}

export function DashboardLayout() {
  const { theme, toggleTheme } = useAppStore();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const canManageUsers =
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "MANAGER";
  const canViewTeams =
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "MANAGER";

  const mainLinks = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/inbox", icon: MessageSquare, label: "Inbox" },
    { to: "/contacts", icon: Users, label: "Contacts" },
    { to: "/tickets", icon: TicketIcon, label: "Tickets" },
  ];

  const { data: featureFlag } = useFeatureFlag("whatsapp_templates_enabled");
  const { data: broadcastFlag } = useFeatureFlag("broadcast_enabled");
  const { enabledChannels } = useEnabledChannelTypes();
  const hasWhatsapp = enabledChannels.includes("whatsapp");

  const orgLinks = [
    ...(canManageUsers ? [{ to: "/users", icon: ShieldCheck, label: "Users" }] : []),
    ...(canViewTeams ? [{ to: "/teams", icon: Building2, label: "Teams" }] : []),
    ...(featureFlag?.enabled && hasWhatsapp && (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") ? [{ to: "/templates", icon: LayoutTemplate, label: "Templates" }] : []),
    ...(broadcastFlag?.enabled && hasWhatsapp ? [{ to: "/broadcast", icon: Radio, label: "Broadcast" }] : []),
  ];

  const bottomLinks =
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
      ? [{ to: "/settings", icon: Settings, label: "Settings" }]
      : [];

  const renderLink = (link: {
    to: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }) => (
    <NavLink
      key={link.to}
      to={link.to}
      title={link.label}
      className={({ isActive }) =>
        cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 transition-colors",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <link.icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">{link.label}</span>
    </NavLink>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="z-10 flex w-[4.75rem] shrink-0 flex-col border-r border-border bg-card">
        <div className="flex flex-col items-center gap-2 border-b border-border px-2 py-4">
          <div
            className="flex h-9 w-9 flex-col items-center justify-center rounded-lg bg-[#12122b] text-[9px] font-bold leading-none tracking-tight text-white shadow-sm"
            title="FyBud"
            aria-label="FyBud"
          >
            <span>Fy</span>
            <span className="text-[#b8a7f5]">Bud</span>
          </div>
          {user && (
            <span
              className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-foreground"
              title={`${user.username} · ${user.role}`}
            >
              {roleShort(user.role)}
            </span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          <p className="mb-1 px-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Work
          </p>
          {mainLinks.map(renderLink)}

          {orgLinks.length > 0 && (
            <>
              <div className="my-2 mx-1 border-t border-border" />
              <p className="mb-1 px-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Org
              </p>
              {orgLinks.map(renderLink)}
            </>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 py-3">
          {bottomLinks.map(renderLink)}

          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="text-[10px] font-medium leading-none">Theme</span>
          </button>

          <button
            id="logout-btn"
            type="button"
            onClick={handleLogout}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Logout</span>
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <ChannelHealthBanner />
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
