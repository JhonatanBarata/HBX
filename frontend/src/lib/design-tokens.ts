/**
 * DESIGN SYSTEM TOKENS
 * Centralized design language for HBX 2026 Redesign
 * 
 * Principles:
 * - Premium SaaS aesthetic
 * - Strong visual hierarchy
 * - Subtle 3D depth without exaggeration
 * - Compact, efficient layout
 * - Professional, corporate feeling
 */

// ============================================================================
// SPACING SCALE
// ============================================================================
export const spacing = {
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "0.75rem", // 12px
  lg: "1rem", // 16px
  xl: "1.25rem", // 20px
  "2xl": "1.5rem", // 24px
  "3xl": "2rem", // 32px
  "4xl": "2.5rem", // 40px
  "5xl": "3rem", // 48px
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================
export const borderRadius = {
  none: "0",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "18px",
  "2xl": "24px",
  full: "999px",
} as const;

// ============================================================================
// SHADOWS
// Professional, layered elevation with subtle 3D effect
// ============================================================================
export const shadows = {
  // Subtle shadows for interactive elements
  xs: "0 1px 2px rgba(15, 23, 42, 0.04)",
  sm: "0 2px 8px rgba(15, 23, 42, 0.08)",
  
  // Standard elevation for cards and sections
  md: "0 8px 16px rgba(15, 23, 42, 0.12)",
  lg: "0 12px 28px rgba(15, 23, 42, 0.16)",
  
  // Strong elevation for modals, dropdowns, floating panels
  xl: "0 16px 40px rgba(15, 23, 42, 0.20)",
  "2xl": "0 20px 56px rgba(15, 23, 42, 0.24)",
  
  // Premium elevation for hero/spotlight sections
  premium: "0 24px 64px rgba(15, 23, 42, 0.28)",
  
  // Inset shadows for subtle inner depth
  inset: "inset 0 1px 2px rgba(255, 255, 255, 0.5)",
  "inset-soft": "inset 0 1px 3px rgba(15, 23, 42, 0.05)",
} as const;

// ============================================================================
// STATES
// ============================================================================
export const states = {
  // Hover states (elevation boost)
  hoverShadow: "0 10px 20px rgba(15, 23, 42, 0.15)",
  
  // Focus states (ring)
  focusRing: "0 0 0 3px var(--brand)",
  focusRingOffset: "2px",
  
  // Active states (depth increase)
  activeShadow: "0 2px 6px rgba(15, 23, 42, 0.08)",
  
  // Disabled opacity
  disabledOpacity: "0.5",
} as const;

// ============================================================================
// TRANSITIONS/ANIMATIONS
// ============================================================================
export const motion = {
  fast: "120ms cubic-bezier(0.2, 0.9, 0.2, 1)",
  base: "220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
  slow: "320ms cubic-bezier(0.14, 0.82, 0.2, 1)",
  enter: "250ms cubic-bezier(0.16, 1, 0.3, 1)",
  exit: "200ms cubic-bezier(0.7, 0, 0.84, 0)",
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================
export const typography = {
  // Font weights
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  } as const,
  
  // Font sizes with line heights
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1rem" },
    sm: { size: "0.875rem", lineHeight: "1.25rem" },
    base: { size: "1rem", lineHeight: "1.5rem" },
    lg: { size: "1.125rem", lineHeight: "1.75rem" },
    xl: { size: "1.25rem", lineHeight: "1.75rem" },
    "2xl": { size: "1.5rem", lineHeight: "2rem" },
    "3xl": { size: "1.875rem", lineHeight: "2.25rem" },
    "4xl": { size: "2.25rem", lineHeight: "2.5rem" },
  } as const,
  
  // Letter spacing
  tracking: {
    tight: "-0.02em",
    normal: "0",
    wide: "0.04em",
    wider: "0.08em",
    widest: "0.12em",
  } as const,
} as const;

// ============================================================================
// COMPONENT-LEVEL TOKENS
// ============================================================================
export const components = {
  button: {
    // Primary button
    primary: {
      padding: `${spacing.md} ${spacing.xl}`,
      minHeight: "40px",
      fontSize: "0.875rem",
      fontWeight: 500,
      borderRadius: borderRadius.md,
      shadow: shadows.sm,
      shadowHover: shadows.md,
    },
    
    // Secondary button
    secondary: {
      padding: `${spacing.md} ${spacing.xl}`,
      minHeight: "40px",
      fontSize: "0.875rem",
      fontWeight: 500,
      borderRadius: borderRadius.md,
      shadow: "none",
    },
    
    // Small button (compact)
    small: {
      padding: `${spacing.sm} ${spacing.lg}`,
      minHeight: "32px",
      fontSize: "0.8125rem",
      fontWeight: 500,
      borderRadius: borderRadius.sm,
    },
  } as const,
  
  // Input fields
  input: {
    padding: `${spacing.md} ${spacing.lg}`,
    minHeight: "40px",
    fontSize: "0.9375rem",
    borderRadius: borderRadius.md,
    borderWidth: "1px",
    shadow: shadows.xs,
  } as const,
  
  // Cards
  card: {
    padding: spacing["2xl"],
    borderRadius: borderRadius.lg,
    shadow: shadows.md,
    shadowHover: shadows.lg,
    border: "1px solid",
  } as const,
  
  // Compact cards (for lists/tables)
  cardCompact: {
    padding: `${spacing.lg} ${spacing.xl}`,
    borderRadius: borderRadius.md,
    shadow: shadows.xs,
    border: "1px solid",
  } as const,
  
  // Tabs
  tab: {
    padding: `${spacing.md} ${spacing.lg}`,
    minHeight: "40px",
    fontSize: "0.875rem",
    fontWeight: 500,
    borderRadius: `${borderRadius.md} ${borderRadius.md} 0 0`,
  } as const,
  
  // Badges
  badge: {
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: "0.75rem",
    fontWeight: 600,
    borderRadius: borderRadius.full,
    minHeight: "24px",
  } as const,
} as const;

// ============================================================================
// LAYOUT CONSTRAINTS
// ============================================================================
export const layout = {
  // Container widths (desktop-first)
  container: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1440px",
    max: "1600px",
  } as const,
  
  // Header/TopBar
  topbar: {
    height: "64px",
    paddingY: spacing.lg,
    paddingX: spacing["2xl"],
  } as const,
  
  // Module navigation
  moduleNav: {
    height: "48px",
    padding: `${spacing.sm} ${spacing.lg}`,
  } as const,
  
  // Sidebar (for future use)
  sidebar: {
    width: "280px",
    minWidth: "260px",
    maxWidth: "320px",
  } as const,
  
  // Content areas
  contentGap: spacing["2xl"],
  sectionGap: spacing.xl,
} as const;

// ============================================================================
// Z-INDEX SCALE
// ============================================================================
export const zIndex = {
  base: 0,
  overlay: 10,
  sticky: 20,
  fixed: 30,
  modal: 100,
  dropdown: 50,
  tooltip: 60,
  notification: 110,
} as const;

// ============================================================================
// DEFAULT EXPORTS
// ============================================================================
export const designTokens = {
  spacing,
  borderRadius,
  shadows,
  states,
  motion,
  typography,
  components,
  layout,
  zIndex,
} as const;

export default designTokens;
