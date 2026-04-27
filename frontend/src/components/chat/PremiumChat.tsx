"use client";

import { forwardRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import styles from "./PremiumChat.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type GlyphName =
  | "gear"
  | "spark"
  | "clock"
  | "wallet"
  | "phone"
  | "note"
  | "send"
  | "pause"
  | "play"
  | "shield"
  | "user"
  | "trash"
  | "smile";

export function ChatGlyph({
  name,
  className,
}: {
  name: GlyphName;
  className?: string;
}) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (name) {
    case "gear":
      return (
        <svg {...commonProps}>
          <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
        </svg>
      );
    case "spark":
      return (
        <svg {...commonProps}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
          <path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17Z" />
          <path d="M19 14l.7 1.8L21.5 16l-1.8.7L19 18.5l-.7-1.8L16.5 16l1.8-.2L19 14Z" />
        </svg>
      );
    case "clock":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3 2" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...commonProps}>
          <path d="M4.5 7.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
          <path d="M4.5 9.5V7A1.5 1.5 0 0 1 6 5.5h10" />
          <path d="M16.5 13h3" />
        </svg>
      );
    case "phone":
      return (
        <svg {...commonProps}>
          <path d="M8 4.5h2l1 4-1.5 1.5a14.5 14.5 0 0 0 4.5 4.5L15.5 13l4 1v2a1.5 1.5 0 0 1-1.7 1.5c-7.2-.8-10.8-4.4-11.6-11.6A1.5 1.5 0 0 1 8 4.5Z" />
        </svg>
      );
    case "note":
      return (
        <svg {...commonProps}>
          <path d="M7 4.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
          <path d="M8.5 9h7" />
          <path d="M8.5 12h7" />
          <path d="M8.5 15h4.5" />
        </svg>
      );
    case "send":
      return (
        <svg {...commonProps}>
          <path d="M21 3L10 14" />
          <path d="M21 3l-7 18-4-7-7-4 18-7Z" />
        </svg>
      );
    case "pause":
      return (
        <svg {...commonProps}>
          <path d="M9 6.5v11" />
          <path d="M15 6.5v11" />
        </svg>
      );
    case "play":
      return (
        <svg {...commonProps}>
          <path d="M9 7.5l8 4.5-8 4.5Z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...commonProps}>
          <path d="M12 3.5l7 3v5.5c0 4.4-3 7.7-7 8.9-4-1.2-7-4.5-7-8.9V6.5l7-3Z" />
        </svg>
      );
    case "user":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19a6.7 6.7 0 0 1 13 0" />
        </svg>
      );
    case "trash":
      return (
        <svg {...commonProps}>
          <path d="M4.5 7h15" />
          <path d="M9 4.5h6" />
          <path d="M7 7l.8 11.2A1.5 1.5 0 0 0 9.3 19.5h5.4a1.5 1.5 0 0 0 1.5-1.3L17 7" />
          <path d="M10 10.5v5.5" />
          <path d="M14 10.5v5.5" />
        </svg>
      );
    case "smile":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.8 14.2a4.4 4.4 0 0 0 6.4 0" />
          <path d="M9.2 10.2h.01" />
          <path d="M14.8 10.2h.01" />
        </svg>
      );
    default:
      return null;
  }
}

export function ChatDockPanel({
  eyebrow,
  title,
  description,
  count,
  actions,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cx(styles.panel, className)}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        <div className={styles.panelAside}>
          {actions}
          {count !== undefined ? <span className={styles.counter}>{count}</span> : null}
        </div>
      </div>
      <div className={cx(styles.panelBody, bodyClassName)}>{children}</div>
    </div>
  );
}

type AvatarTone = "brand" | "teal" | "amber" | "danger" | "muted" | "success";
type BadgeTone = "neutral" | "brand" | "teal" | "success" | "warning" | "danger";

export function ChatAvatar({
  initials,
  label,
  tone = "brand",
  imageUrl,
}: {
  initials: string;
  label?: string;
  tone?: AvatarTone;
  imageUrl?: string | null;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const resolvedImageUrl = String(imageUrl || "").trim();
  const showImage = Boolean(resolvedImageUrl) && failedImageUrl !== resolvedImageUrl;

  return (
    <div
      className={cx(
        styles.avatar,
        tone === "brand" && styles.avatarBrand,
        tone === "teal" && styles.avatarTeal,
        tone === "amber" && styles.avatarAmber,
        tone === "danger" && styles.avatarDanger,
        tone === "muted" && styles.avatarMuted,
        tone === "success" && styles.avatarSuccess,
      )}
    >
      {showImage ? (
        <img
          className={styles.avatarImage}
          src={resolvedImageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedImageUrl(resolvedImageUrl)}
        />
      ) : (
        <div className={styles.avatarInner}>
          <span className={styles.avatarInitials}>{initials}</span>
          {label ? <small className={styles.avatarLabel}>{label}</small> : null}
        </div>
      )}
    </div>
  );
}

export function ChatBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        styles.badge,
        tone === "neutral" && styles.badgeNeutral,
        tone === "brand" && styles.badgeBrand,
        tone === "teal" && styles.badgeTeal,
        tone === "success" && styles.badgeSuccess,
        tone === "warning" && styles.badgeWarning,
        tone === "danger" && styles.badgeDanger,
      )}
    >
      {children}
    </span>
  );
}

export const ChatQueue = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ChatQueue({
  children,
  className,
  ...props
}, ref) {
  return (
    <div ref={ref} className={cx(styles.queue, className)} {...props}>
      {children}
    </div>
  );
});

export function ChatQueueItem({
  initials,
  label,
  tone = "brand",
  imageUrl,
  title,
  subtitle,
  preview,
  meta,
  badges,
  active,
  className,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  initials: string;
  label?: string;
  tone?: AvatarTone;
  imageUrl?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  preview?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={disabled ? true : undefined}
      className={cx(styles.queueItem, active && styles.queueItemActive, disabled && styles.queueItemDisabled, className)}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(event) => {
        if (!disabled && onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.currentTarget.click();
        }
        onKeyDown?.(event);
      }}
      {...props}
    >
      <ChatAvatar initials={initials} label={label} tone={tone} imageUrl={imageUrl} />
      <div className={styles.queueContent}>
        <div className={styles.queueTop}>
          <strong>{title}</strong>
          {meta ? <div className={styles.queueMeta}>{meta}</div> : null}
        </div>
        {subtitle ? <p className={styles.queueSubtitle}>{subtitle}</p> : null}
        {preview ? <p className={styles.queuePreview}>{preview}</p> : null}
        {badges ? <div className={styles.queueBadges}>{badges}</div> : null}
      </div>
    </div>
  );
}

export function ChatSurface({
  children,
  className,
  muted,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return <div className={cx(styles.surface, muted && styles.surfaceMuted, className)}>{children}</div>;
}

export function ChatThread({
  avatar,
  title,
  subtitle,
  badges,
  actions,
  footer,
  children,
}: {
  avatar: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ChatSurface className={styles.thread}>
      <div className={styles.threadHeader}>
        <div className={styles.identity}>
          {avatar}
          <div className={styles.identityText}>
            <strong>{title}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className={styles.threadAside}>
          {badges ? <div className={styles.threadBadges}>{badges}</div> : null}
          {actions ? <div className={styles.actionRow}>{actions}</div> : null}
        </div>
      </div>
      <div className={styles.scrollArea}>{children}</div>
      {footer ? <div>{footer}</div> : null}
    </ChatSurface>
  );
}

export function ChatIconButton({
  icon,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: GlyphName;
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" className={cx(styles.iconButton, className)} {...props}>
      <ChatGlyph name={icon} />
      {label ? <span className={styles.iconButtonLabel}>{label}</span> : null}
    </button>
  );
}

export function ChatSettingsButton({
  title = "Configurar",
  "aria-label": ariaLabel = "Configurar",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return <ChatIconButton icon="gear" title={title} aria-label={ariaLabel} {...props} />;
}

type BubbleTone = "inbound" | "outbound" | "human" | "system";

export function ChatMessageBubble({
  tone,
  sender,
  messageType,
  meta,
  children,
}: {
  tone: BubbleTone;
  sender?: ReactNode;
  messageType?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        styles.bubble,
        tone === "inbound" && styles.bubbleInbound,
        tone === "outbound" && styles.bubbleOutbound,
        tone === "human" && styles.bubbleHuman,
        tone === "system" && styles.bubbleSystem,
      )}
    >
      {sender || messageType ? (
        <div className={styles.bubbleHeader}>
          {sender ? <span className={styles.bubbleLabel}>{sender}</span> : <span />}
          {messageType ? <span className={styles.bubbleType}>{messageType}</span> : null}
        </div>
      ) : null}
      <div>{children}</div>
      {meta ? <div className={styles.bubbleMeta}>{meta}</div> : null}
    </div>
  );
}

export function ChatComposer({
  title,
  description,
  toolbar,
  footer,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ChatSurface className={styles.composer}>
      <div className={styles.composerHeader}>
        <div className={styles.composerTitle}>
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
        {toolbar ? <div className={styles.actionRow}>{toolbar}</div> : null}
      </div>
      <div className={styles.composerBody}>{children}</div>
      {footer ? <div className={styles.composerFooter}>{footer}</div> : null}
    </ChatSurface>
  );
}

export function ChatSideGrid({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={styles.sideGrid}>{children}</div>;
}

export function ChatInfoCard({
  title,
  meta,
  children,
  muted,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <ChatSurface className={styles.infoCard} muted={muted}>
      <div className={styles.infoCardHeader}>
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      <div className={styles.infoCardBody}>{children}</div>
    </ChatSurface>
  );
}

export function ChatActionGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(styles.actionGrid, className)}>{children}</div>;
}

export function ChatActionButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cx(styles.actionButton, className)} {...props} />;
}

export function ChatEmptyState({
  title,
  children,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cx(styles.emptyState, className)}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ChatFieldNote({
  children,
}: {
  children: ReactNode;
}) {
  return <small className={styles.fieldNote}>{children}</small>;
}
