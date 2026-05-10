import { ButtonHTMLAttributes, forwardRef } from "react";
import { Icon, IconName } from "../icons";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon: IconName;
  title: string;
  size?: number;
  iconSize?: number;
  active?: boolean;
}

const BASE =
  "rounded-md bg-transparent border-0 p-0 inline-flex items-center justify-center font-[inherit] cursor-pointer text-t3 transition-colors duration-[120ms] ease-out hover:bg-s3 hover:text-t1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-t3";

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, title, size = 28, iconSize, active, className = "", ...rest },
  ref
) {
  const cls = [BASE, active ? "bg-s3 text-t1" : "", className]
    .filter(Boolean)
    .join(" ");
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
