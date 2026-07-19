import { useState } from "react";
import { Input, type InputProps } from "@heroui/react";
import { Icon } from "@iconify/react";

/**
 * Password input with a show/hide toggle. Drop-in replacement for a HeroUI
 * <Input type="password" />; all Input props are forwarded.
 */
export function PasswordInput(props: Omit<InputProps, "type" | "endContent">) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      endContent={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="text-default-400 outline-none transition-colors hover:text-default-600 focus:text-default-600"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <Icon icon={visible ? "solar:eye-closed-linear" : "solar:eye-linear"} width={18} />
        </button>
      }
    />
  );
}
