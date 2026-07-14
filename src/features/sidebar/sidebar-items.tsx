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
    key: "ai-chat",
    icon: "solar:chat-round-line-duotone",
    title: "AI Chat",
  },
];

export const settingsItem: SidebarItem = {
  key: "settings",
  icon: "solar:settings-outline",
  title: "Settings",
};
