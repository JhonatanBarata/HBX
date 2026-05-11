export const HBX_THEME_IDS = ["shadcn"] as const;
export const HBX_THEME_MODES = ["light", "dark"] as const;

export type HbxThemeId = (typeof HBX_THEME_IDS)[number];
export type HbxThemeMode = (typeof HBX_THEME_MODES)[number];

type ThemeTone = {
  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandContrast: string;
  buttonPrimary: string;
  buttonSecondary: string;
  buttonSuccess: string;
  buttonAccent: string;
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceSoft: string;
  surfaceRaised: string;
  headerSurface: string;
  navSurface: string;
  fieldSurface: string;
  heroFrom: string;
  heroTo: string;
  heroSpotlight: string;
  tableHead: string;
  chatInbound: string;
  chatOutbound: string;
  chatSystem: string;
  foreground: string;
  foregroundSoft: string;
  muted: string;
  line: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  shadow: string;
  overlay: string;
};

type ThemeChrome = {
  radiusXs: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusXl: string;
  topbarWidth: string;
  contentWidth: string;
  contentGutter: string;
  topbarBlur: string;
};

type ThemeTypography = {
  bodyFont: string;
  displayFont: string;
  monoFont: string;
  eyebrowSpacing: string;
};

type ThemeWorkspace = {
  railWidth: string;
  contextWidth: string;
  shellGap: string;
  shellPadding: string;
  heroColumns: string;
  heroMinHeight: string;
};

const HBX_THEME_SHARED_CHROME = {
  radiusXs: "8px",
  radiusSm: "12px",
  radiusMd: "16px",
  radiusLg: "20px",
  radiusXl: "28px",
  topbarWidth: "100vw",
  contentWidth: "100vw",
  contentGutter: "12px",
  topbarBlur: "28px",
} as const satisfies ThemeChrome;

const HBX_THEME_SHARED_TYPOGRAPHY = {
  bodyFont: "var(--font-plus-jakarta)",
  displayFont: "var(--font-plus-jakarta)",
  monoFont: "var(--font-ibm-plex-mono)",
  eyebrowSpacing: "0.18em",
} as const satisfies ThemeTypography;

const HBX_THEME_SHARED_WORKSPACE = {
  railWidth: "260px",
  contextWidth: "248px",
  shellGap: "12px",
  shellPadding: "12px",
  heroColumns: "1.2fr 0.82fr",
  heroMinHeight: "172px",
} as const satisfies ThemeWorkspace;

export type HbxThemePalette = {
  label: string;
  shortLabel: string;
  inspiration: string;
  description: string;
  personality: string;
  shellLabel: string;
  densityLabel: string;
  depthLabel: string;
  chrome: ThemeChrome;
  typography: ThemeTypography;
  workspace: ThemeWorkspace;
  light: ThemeTone;
  dark: ThemeTone;
};

export const HBX_THEME_PALETTES = {
  shadcn: {
    label: "Tema HBX",
    shortLabel: "HBX",
    inspiration: "Tema HBX / glass premium",
    description: "Leitura limpa, vidro profundo e brilho controlado para operacao.",
    personality: "Workspace imersivo, elegante e preciso, com base personalizavel e acentos luminosos.",
    shellLabel: "Base liquida premium",
    densityLabel: "Panoramico",
    depthLabel: "Liquido",
    chrome: HBX_THEME_SHARED_CHROME,
    typography: HBX_THEME_SHARED_TYPOGRAPHY,
    workspace: HBX_THEME_SHARED_WORKSPACE,
    light: {
      brand: "#245CFF",
      brandStrong: "#009FD9",
      brandSoft: "#DDE8FF",
      brandContrast: "#F8FBFF",
      buttonPrimary: "#245CFF",
      buttonSecondary: "#009FD9",
      buttonSuccess: "#11A86B",
      buttonAccent: "#E63BC1",
      background: "#F4F9FF",
      backgroundAlt: "#EAF3FF",
      surface: "#FFFFFF",
      surfaceSoft: "#F0F6FF",
      surfaceRaised: "#D9E9FF",
      headerSurface: "rgba(240,247,255,0.82)",
      navSurface: "rgba(233,242,255,0.92)",
      fieldSurface: "#FDFEFF",
      heroFrom: "rgba(255,255,255,0.98)",
      heroTo: "rgba(223,236,255,0.98)",
      heroSpotlight: "rgba(36,92,255,0.16)",
      tableHead: "#EEF5FF",
      chatInbound: "#FFFFFF",
      chatOutbound: "#E6F0FF",
      chatSystem: "#EFF6FF",
      foreground: "#0A1730",
      foregroundSoft: "#183154",
      muted: "#4F6890",
      line: "#B7D0F7",
      success: "#11A86B",
      warning: "#F2A53A",
      danger: "#C92F7E",
      info: "#009FD9",
      shadow: "#041126",
      overlay: "rgba(5,20,45,0.18)",
    },
    dark: {
      brand: "#2F6BFF",
      brandStrong: "#00C2FF",
      brandSoft: "#0D2149",
      brandContrast: "#ECF7FF",
      buttonPrimary: "#2F6BFF",
      buttonSecondary: "#00C2FF",
      buttonSuccess: "#18C37E",
      buttonAccent: "#FF4FD8",
      background: "#07111F",
      backgroundAlt: "#0A1628",
      surface: "#0D1B2E",
      surfaceSoft: "#10213A",
      surfaceRaised: "#13253D",
      headerSurface: "rgba(7,17,31,0.8)",
      navSurface: "rgba(13,27,46,0.92)",
      fieldSurface: "#0E2036",
      heroFrom: "rgba(11,25,44,0.95)",
      heroTo: "rgba(7,17,31,0.99)",
      heroSpotlight: "rgba(0,194,255,0.22)",
      tableHead: "#0F2036",
      chatInbound: "#0E1F35",
      chatOutbound: "#17325A",
      chatSystem: "#12253F",
      foreground: "#EAF4FF",
      foregroundSoft: "#C8DBF7",
      muted: "#92A6C6",
      line: "#1E3A5F",
      success: "#18C37E",
      warning: "#FFB957",
      danger: "#FF68B8",
      info: "#00C2FF",
      shadow: "#010813",
      overlay: "rgba(1,8,19,0.66)",
    },
  },
} satisfies Record<string, HbxThemePalette>;

export function isHbxThemeId(value: string): value is HbxThemeId {
  return HBX_THEME_IDS.includes(value as HbxThemeId);
}

export function isHbxThemeMode(value: string): value is HbxThemeMode {
  return HBX_THEME_MODES.includes(value as HbxThemeMode);
}
