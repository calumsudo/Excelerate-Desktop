import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ScrollShadow } from "@heroui/react";
import Sidebar from "@features/sidebar/sidebar";
import { AcmeIcon } from "@features/sidebar/acme";
import { items } from "@features/sidebar/sidebar-items";
import { useEffect, useState } from "react";

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState("dashboard");

  useEffect(() => {
    const path = location.pathname === "/" ? "/dashboard" : location.pathname;
    const key = path.substring(1);
    setSelectedKey(key);
  }, [location]);

  const handleSelect = (key: string) => {
    navigate(`/${key}`);
  };

  return (
    <div className="h-screen flex">
      <div className="border-r-small border-divider h-full w-72 p-6 flex flex-col">
        <div className="flex items-center gap-2 px-2 mb-4">
          <div className="bg-foreground flex h-8 w-8 items-center justify-center rounded-full">
            <AcmeIcon className="text-background" />
          </div>
          <span className="text-small font-bold uppercase">Excelerate</span>
        </div>
        <ScrollShadow className="h-full max-h-full py-[10vh]">
          <Sidebar 
            defaultSelectedKey={selectedKey} 
            items={items} 
            onSelect={(key: string) => handleSelect(key)}
          />
        </ScrollShadow>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export default Layout;