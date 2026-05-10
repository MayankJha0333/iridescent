import { motion } from "framer-motion";
import { Icon } from "../../design/icons";
import { renderMarkdown } from "./markdown";

interface AssistantMessageProps {
  text: string;
  streaming?: boolean;
  showAvatar?: boolean;
}

export function AssistantMessage({ text, streaming, showAvatar = true }: AssistantMessageProps) {
  return (
    <motion.div
      className="flex items-start gap-2.5"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {showAvatar ? (
        <motion.div
          className="flex-shrink-0 w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[10.5px] font-bold tracking-[0.05em] mt-0.5 text-white bg-gradient-to-br from-accent to-accent-deep"
          style={{ boxShadow: "0 2px 12px var(--accent-shadow)" }}
          animate={
            streaming ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }
          }
          transition={
            streaming
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0 }
          }
        >
          <Icon name="sparkle" size={13} />
        </motion.div>
      ) : (
        <div
          className="flex-shrink-0 w-[26px] h-[26px] mt-0.5"
          aria-hidden
        />
      )}
      <div className="md flex-1 min-w-0 leading-[1.6] break-words text-[13.5px] pt-1 text-t2">
        {renderMarkdown(text)}
        {streaming && (
          <motion.span
            className="inline-block w-[7px] h-[1em] bg-accent ml-0.5 align-middle rounded-[1px]"
            style={{ boxShadow: "0 0 6px var(--accent-shadow)" }}
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        )}
      </div>
    </motion.div>
  );
}
