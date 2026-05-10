import { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-[10.5px] font-semibold text-t3 leading-none rounded-[4px] bg-s2 border border-b2 px-[5px] py-px">
      {children}
    </kbd>
  );
}
