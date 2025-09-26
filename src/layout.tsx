import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ScrollShadow, Button, Listbox, ListboxItem, Tooltip } from "@heroui/react";
import Sidebar from "@features/sidebar/sidebar";
import { items, settingsItem } from "@features/sidebar/sidebar-items";
import { useEffect, useState, useRef } from "react";
import { Icon } from "@iconify/react";

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState("dashboard");
  const [isCompact, setIsCompact] = useState(() => {
    const saved = localStorage.getItem("sidebarCompact");
    return saved === "true";
  });
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const path = location.pathname === "/" ? "/dashboard" : location.pathname;
    const key = path.substring(1);
    setSelectedKey(key);
    isNavigatingRef.current = false;
  }, [location]);

  useEffect(() => {
    localStorage.setItem("sidebarCompact", isCompact.toString());
  }, [isCompact]);

  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (key: string) => {
    // Prevent navigation with undefined or empty key
    if (!key || key === "undefined") {
      return;
    }
    
    if (isNavigatingRef.current) {
      return;
    }
    
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    isNavigatingRef.current = true;
    
    navigationTimeoutRef.current = setTimeout(() => {
      if (location.pathname !== `/${key}`) {
        navigate(`/${key}`);
      }
      navigationTimeoutRef.current = null;
    }, 50);
  };

  return (
    <div className="h-screen flex">
      <div 
        className={`border-r-small border-divider h-full ${isCompact ? 'w-20' : 'w-72'} p-2 pt-6 flex flex-col transition-all duration-300 ease-in-out relative`}
      >
        <div className={`flex items-center gap-2 px-2 mb-4 ${isCompact ? 'justify-center' : ''}`}>
          <img 
            src="/excelerate.png" 
            alt="Excelerate" 
            className="h-8 w-8 object-contain"
          />
          {!isCompact && (
            <span className="text-small font-bold uppercase">Excelerate</span>
          )}
        </div>
        
        <Button
          isIconOnly
          size="sm"
          variant="light"
          className="absolute -right-3 top-6 z-10 bg-content1 shadow-md"
          onPress={() => setIsCompact(!isCompact)}
        >
          <Icon 
            icon={isCompact ? "heroicons:chevron-right" : "heroicons:chevron-left"} 
            width={16} 
          />
        </Button>

        <ScrollShadow className="flex-1 max-h-full py-2">
          <Sidebar 
            defaultSelectedKey={selectedKey} 
            items={items} 
            isCompact={isCompact}
            onSelect={(key: string) => handleSelect(key)}
            className="select-none"
          />
        </ScrollShadow>
        
        {/* Settings button fixed at the bottom */}
        <div className="mt-auto pb-2">
          <Listbox
            as="nav"
            className="list-none select-none"
            selectedKeys={selectedKey === "settings" ? ["settings"] : []}
            selectionMode="single"
            hideSelectedIcon
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (key) handleSelect(key as string);
            }}
          >
            <ListboxItem
              key={settingsItem.key}
              className={`px-3 min-h-11 rounded-large h-[44px] ${
                selectedKey === "settings" ? "bg-default-100" : ""
              } select-none ${isCompact ? "w-11 h-11 gap-0 p-0" : ""}`}
              startContent={
                isCompact ? null : (
                  <Icon
                    className="text-default-500 group-data-[selected=true]:text-foreground"
                    icon={settingsItem.icon!}
                    width={24}
                  />
                )
              }
              textValue={settingsItem.title}
              title={isCompact ? null : settingsItem.title}
            >
              {isCompact ? (
                <Tooltip content={settingsItem.title} placement="right">
                  <div className="flex w-full items-center justify-center">
                    <Icon
                      className="text-default-500 group-data-[selected=true]:text-foreground"
                      icon={settingsItem.icon!}
                      width={24}
                    />
                  </div>
                </Tooltip>
              ) : null}
            </ListboxItem>
          </Listbox>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}

export default Layout;