export const HBX_THEME_IDS = ["shadcn", "mosaic", "tabler"] as const;
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

export const HBX_THEME_PALETTES: Record<HbxThemeId, HbxThemePalette> = {
  shadcn: {
    label: "Midnight Blue",
    shortLabel: "MB",
    inspiration: "Midnight blue / glass premium",
    description: "Azul noturno com leitura limpa, vidro profundo e brilho controlado para operacao.",
    personality: "Workspace imersivo, elegante e preciso, com base azul e acentos luminosos.",
    shellLabel: "Blue liquid cockpit",
    densityLabel: "Panoramico",
    depthLabel: "Liquido",
    chrome: {
      radiusXs: "12px",
      radiusSm: "16px",
      radiusMd: "22px",
      radiusLg: "28px",
      radiusXl: "36px",
      topbarWidth: "100vw",
      contentWidth: "100vw",
      contentGutter: "12px",
      topbarBlur: "30px",
    },
    typography: {
      bodyFont: "var(--font-plus-jakarta)",
      displayFont: "var(--font-plus-jakarta)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.2em",
    },
    workspace: {
      railWidth: "284px",
      contextWidth: "286px",
      shellGap: "14px",
      shellPadding: "14px",
      heroColumns: "1.34fr 0.9fr",
      heroMinHeight: "188px",
    },
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
  mosaic: {
    label: "Obsidian Pink",
    shortLabel: "OP",
    inspiration: "Obsidian pink / couture glass",
    description: "Rosa escuro sofisticado com leitura alta, vidro autoral e sensacao de produto premium.",
    personality: "Presenca forte, futurista e facil de enxergar, com contraste claro para navegar.",
    shellLabel: "Obsidian velvet shell",
    densityLabel: "Editorial",
    depthLabel: "Luminoso",
    chrome: {
      radiusXs: "12px",
      radiusSm: "16px",
      radiusMd: "22px",
      radiusLg: "28px",
      radiusXl: "36px",
      topbarWidth: "100vw",
      contentWidth: "100vw",
      contentGutter: "12px",
      topbarBlur: "32px",
    },
    typography: {
      bodyFont: "var(--font-sora)",
      displayFont: "var(--font-space-grotesk)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.18em",
    },
    workspace: {
      railWidth: "288px",
      contextWidth: "268px",
      shellGap: "14px",
      shellPadding: "14px",
      heroColumns: "1.3fr 0.82fr",
      heroMinHeight: "182px",
    },
    light: {
      brand: "#E941B8",
      brandStrong: "#6949F0",
      brandSoft: "#FBD7F2",
      brandContrast: "#FFF9FE",
      buttonPrimary: "#E941B8",
      buttonSecondary: "#6949F0",
      buttonSuccess: "#13A86B",
      buttonAccent: "#2675E8",
      background: "#FFF7FC",
      backgroundAlt: "#FCEFFD",
      surface: "#FFFFFF",
      surfaceSoft: "#FFF5FC",
      surfaceRaised: "#F8DDF8",
      headerSurface: "rgba(255,247,252,0.84)",
      navSurface: "rgba(252,239,253,0.94)",
      fieldSurface: "#FFFDFE",
      heroFrom: "rgba(255,255,255,0.98)",
      heroTo: "rgba(248,221,248,0.98)",
      heroSpotlight: "rgba(233,65,184,0.18)",
      tableHead: "#FFF0FA",
      chatInbound: "#FFFFFF",
      chatOutbound: "#F8D9F2",
      chatSystem: "#FFF0FA",
      foreground: "#24142B",
      foregroundSoft: "#42214E",
      muted: "#7D618A",
      line: "#E9BEE8",
      success: "#13A86B",
      warning: "#E08A31",
      danger: "#D53B77",
      info: "#2675E8",
      shadow: "#3B1738",
      overlay: "rgba(36,20,43,0.18)",
    },
    dark: {
      brand: "#FF4FCB",
      brandStrong: "#7C5CFF",
      brandSoft: "#3B214A",
      brandContrast: "#190A1E",
      buttonPrimary: "#FF4FCB",
      buttonSecondary: "#7C5CFF",
      buttonSuccess: "#19C37D",
      buttonAccent: "#2D8CFF",
      background: "#0A0A0F",
      backgroundAlt: "#101018",
      surface: "#14141C",
      surfaceSoft: "#191925",
      surfaceRaised: "#1D1D28",
      headerSurface: "rgba(10,10,15,0.8)",
      navSurface: "rgba(20,20,28,0.92)",
      fieldSurface: "#171722",
      heroFrom: "rgba(20,20,28,0.95)",
      heroTo: "rgba(10,10,15,0.99)",
      heroSpotlight: "rgba(255,79,203,0.22)",
      tableHead: "#171720",
      chatInbound: "#171720",
      chatOutbound: "#251B34",
      chatSystem: "#1E1A2A",
      foreground: "#F7F2FF",
      foregroundSoft: "#E7DBFA",
      muted: "#B9A8CD",
      line: "#2B2B3A",
      success: "#19C37D",
      warning: "#FFBF5A",
      danger: "#FF729B",
      info: "#2D8CFF",
      shadow: "#05050A",
      overlay: "rgba(5,5,10,0.68)",
    },
  },
  tabler: {
    label: "Black Neon Fusion",
    shortLabel: "BN",
    inspiration: "Black neon / fusion glass",
    description: "Base preta com neon azul e pink, mais energia visual sem perder leitura operacional.",
    personality: "Futurista, inclusivo e legivel, com brilho tecnico e profundidade cinematografica.",
    shellLabel: "Neon fusion shell",
    densityLabel: "Envolvente",
    depthLabel: "Neon",
    chrome: {
      radiusXs: "12px",
      radiusSm: "16px",
      radiusMd: "22px",
      radiusLg: "28px",
      radiusXl: "36px",
      topbarWidth: "100vw",
      contentWidth: "100vw",
      contentGutter: "10px",
      topbarBlur: "28px",
    },
    typography: {
      bodyFont: "var(--font-sora)",
      displayFont: "var(--font-space-grotesk)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.18em",
    },
    workspace: {
      railWidth: "304px",
      contextWidth: "284px",
      shellGap: "14px",
      shellPadding: "12px",
      heroColumns: "1.36fr 0.84fr",
      heroMinHeight: "186px",
    },
    light: {
      brand: "#008EE0",
      brandStrong: "#E844C0",
      brandSoft: "#D7F1FF",
      brandContrast: "#F8FCFF",
      buttonPrimary: "#008EE0",
      buttonSecondary: "#E844C0",
      buttonSuccess: "#00A874",
      buttonAccent: "#E0A52B",
      background: "#F8FBFF",
      backgroundAlt: "#EFF5FC",
      surface: "#FFFFFF",
      surfaceSoft: "#F4F8FD",
      surfaceRaised: "#E2EBF7",
      headerSurface: "rgba(248,251,255,0.84)",
      navSurface: "rgba(238,244,251,0.94)",
      fieldSurface: "#FFFFFF",
      heroFrom: "rgba(255,255,255,0.98)",
      heroTo: "rgba(226,235,247,0.98)",
      heroSpotlight: "rgba(0,142,224,0.16)",
      tableHead: "#EEF4FB",
      chatInbound: "#FFFFFF",
      chatOutbound: "#E9F3FF",
      chatSystem: "#F2F7FD",
      foreground: "#0C1220",
      foregroundSoft: "#243249",
      muted: "#61738D",
      line: "#C4D4E8",
      success: "#00A874",
      warning: "#E0A52B",
      danger: "#D84A6B",
      info: "#008EE0",
      shadow: "#0C1220",
      overlay: "rgba(12,18,32,0.18)",
    },
    dark: {
      brand: "#00A8FF",
      brandStrong: "#FF4FD8",
      brandSoft: "#12304A",
      brandContrast: "#02060B",
      buttonPrimary: "#00A8FF",
      buttonSecondary: "#FF4FD8",
      buttonSuccess: "#00C78C",
      buttonAccent: "#FFC247",
      background: "#05070B",
      backgroundAlt: "#090C12",
      surface: "#0D1118",
      surfaceSoft: "#101621",
      surfaceRaised: "#151B26",
      headerSurface: "rgba(5,7,11,0.82)",
      navSurface: "rgba(13,17,24,0.92)",
      fieldSurface: "#0F141D",
      heroFrom: "rgba(13,17,24,0.96)",
      heroTo: "rgba(5,7,11,0.99)",
      heroSpotlight: "rgba(0,168,255,0.22)",
      tableHead: "#101621",
      chatInbound: "#101621",
      chatOutbound: "#171E2B",
      chatSystem: "#121923",
      foreground: "#F3F8FF",
      foregroundSoft: "#D6E1F1",
      muted: "#94A7BE",
      line: "#223047",
      success: "#00C78C",
      warning: "#FFC247",
      danger: "#FF7A76",
      info: "#00A8FF",
      shadow: "#000205",
      overlay: "rgba(0,2,5,0.7)",
    },
  },
};

export function isHbxThemeId(value: string): value is HbxThemeId {
  return HBX_THEME_IDS.includes(value as HbxThemeId);
}

export function isHbxThemeMode(value: string): value is HbxThemeMode {
  return HBX_THEME_MODES.includes(value as HbxThemeMode);
}
