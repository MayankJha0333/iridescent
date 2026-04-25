import { ButtonHTMLAttributes, forwardRef } from "react";
import { Icon, IconName } from "../icons";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon: IconName;
  title: string;
  size?: number;
  iconSize?: number;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, title, size = 28, iconSize, active, className = "", ...rest },
  ref
) {
  const cls = ["icon-btn", active ? "active" : "", className].filter(Boolean).join(" ");
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      className={cls}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} />
    </button>
  );
});
