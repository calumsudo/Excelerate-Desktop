import { type SidebarItem } from "./sidebar-types";

/**
 * Please check the https://heroui.com/docs/guide/routing to have a seamless router integration
 */

export const items: SidebarItem[] = [
  {
    key: "dashboard",
    icon: "solar:widget-add-line-duotone",
    title: "Dashboard",
  },
  {
    key: "alder-portfolio",
    icon: "solar:wallet-money-outline",
    title: "Alder Portfolio",
  },
  {
    key: "white-rabbit-portfolio",
    icon: "solar:safe-square-outline",
    title: "White Rabbit Portfolio",
  },
  {
    key: "deal-lookup",
    icon: "solar:magnifer-zoom-in-outline",
    title: "Deal Lookup",
  },
  {
    key: "pivot-tables",
    icon: "solar:widget-5-outline",
    title: "Pivot Tables",
  },
  {
    key: "database",
    icon: "solar:database-outline",
    title: "Database",
  },
  {
    key: "ai-chat",
    icon: "solar:chat-round-line-duotone",
    title: "AI Chat",
  },
];

// Shown only to admins (appended in layout.tsx based on the user's role).
export const usersItem: SidebarItem = {
  key: "users",
  icon: "solar:users-group-rounded-outline",
  title: "User Management",
};

export const settingsItem: SidebarItem = {
  key: "settings",
  icon: "solar:settings-outline",
  title: "Settings",
};
