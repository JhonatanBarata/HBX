export const HBX_THEME_IDS = ["shadcn", "tailadmin", "mosaic", "flowbite", "tabler"] as const;
export const HBX_THEME_MODES = ["light", "dark"] as const;

export type HbxThemeId = (typeof HBX_THEME_IDS)[number];
export type HbxThemeMode = (typeof HBX_THEME_MODES)[number];

type ThemeTone = {
  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandContrast: string;
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
    label: "HBX Shadcn",
    shortLabel: "SC",
    inspiration: "shadcn/ui",
    description: "Minimalista, premium e bem resolvido, com superficies suaves e contraste limpo.",
    personality: "Minimalismo premium com atmosfera SaaS limpa e silenciosa.",
    shellLabel: "Floating workspace",
    densityLabel: "Aireado",
    depthLabel: "Sombra suave",
    chrome: {
      radiusXs: "10px",
      radiusSm: "14px",
      radiusMd: "18px",
      radiusLg: "24px",
      radiusXl: "32px",
      topbarWidth: "1480px",
      contentWidth: "1540px",
      contentGutter: "18px",
      topbarBlur: "24px",
    },
    typography: {
      bodyFont: "var(--font-plus-jakarta)",
      displayFont: "var(--font-plus-jakarta)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.22em",
    },
    workspace: {
      railWidth: "292px",
      contextWidth: "286px",
      shellGap: "18px",
      shellPadding: "20px",
      heroColumns: "1.25fr 0.9fr",
      heroMinHeight: "196px",
    },
    light: {
      brand: "#111827",
      brandStrong: "#020617",
      brandSoft: "#e5ecf7",
      brandContrast: "#f8fafc",
      background: "#f4f7fb",
      backgroundAlt: "#ebf0f7",
      surface: "#ffffff",
      surfaceSoft: "#f8fbff",
      surfaceRaised: "#f2f6fb",
      headerSurface: "rgba(255,255,255,0.78)",
      navSurface: "rgba(248,250,252,0.92)",
      fieldSurface: "#ffffff",
      heroFrom: "rgba(255,255,255,0.96)",
      heroTo: "rgba(239,244,251,0.96)",
      heroSpotlight: "rgba(148,163,184,0.16)",
      tableHead: "#f7f9fc",
      chatInbound: "#ffffff",
      chatOutbound: "#e8eff8",
      chatSystem: "#f3f6fb",
      foreground: "#0f172a",
      foregroundSoft: "#1f2937",
      muted: "#5b6578",
      line: "#dde5ef",
      success: "#15803d",
      warning: "#b45309",
      danger: "#b91c1c",
      info: "#1d4ed8",
      shadow: "#0f172a",
      overlay: "rgba(15, 23, 42, 0.18)",
    },
    dark: {
      brand: "#e2e8f0",
      brandStrong: "#f8fafc",
      brandSoft: "#172030",
      brandContrast: "#020617",
      background: "#090e18",
      backgroundAlt: "#0d1420",
      surface: "#111827",
      surfaceSoft: "#172032",
      surfaceRaised: "#1c283b",
      headerSurface: "rgba(15,23,42,0.78)",
      navSurface: "rgba(17,24,39,0.94)",
      fieldSurface: "#111827",
      heroFrom: "rgba(17,24,39,0.94)",
      heroTo: "rgba(12,18,28,0.96)",
      heroSpotlight: "rgba(148,163,184,0.18)",
      tableHead: "#131d2c",
      chatInbound: "#141d2c",
      chatOutbound: "#1f2b40",
      chatSystem: "#1a2433",
      foreground: "#f8fafc",
      foregroundSoft: "#d8e1ee",
      muted: "#97a5ba",
      line: "#273244",
      success: "#4ade80",
      warning: "#f59e0b",
      danger: "#fb7185",
      info: "#93c5fd",
      shadow: "#020617",
      overlay: "rgba(2, 6, 23, 0.58)",
    },
  },
  tailadmin: {
    label: "HBX TailAdmin",
    shortLabel: "TA",
    inspiration: "TailAdmin",
    description: "Painel corporativo forte, com estrutura clara para operacao, filtros e tabelas.",
    personality: "Dashboard operacional com leitura empresarial e ritmo de controle.",
    shellLabel: "Control deck",
    densityLabel: "Equilibrado",
    depthLabel: "Corporativa",
    chrome: {
      radiusXs: "9px",
      radiusSm: "12px",
      radiusMd: "16px",
      radiusLg: "22px",
      radiusXl: "28px",
      topbarWidth: "1620px",
      contentWidth: "1680px",
      contentGutter: "18px",
      topbarBlur: "18px",
    },
    typography: {
      bodyFont: "var(--font-manrope)",
      displayFont: "var(--font-sora)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.18em",
    },
    workspace: {
      railWidth: "320px",
      contextWidth: "264px",
      shellGap: "16px",
      shellPadding: "18px",
      heroColumns: "1.35fr 0.85fr",
      heroMinHeight: "188px",
    },
    light: {
      brand: "#465fff",
      brandStrong: "#243fda",
      brandSoft: "#e1e8ff",
      brandContrast: "#f8faff",
      background: "#edf2ff",
      backgroundAlt: "#e4ebfb",
      surface: "#ffffff",
      surfaceSoft: "#f6f8ff",
      surfaceRaised: "#eff3ff",
      headerSurface: "rgba(255,255,255,0.82)",
      navSurface: "rgba(244,247,255,0.95)",
      fieldSurface: "#ffffff",
      heroFrom: "rgba(255,255,255,0.95)",
      heroTo: "rgba(232,238,255,0.98)",
      heroSpotlight: "rgba(70,95,255,0.18)",
      tableHead: "#f3f6ff",
      chatInbound: "#ffffff",
      chatOutbound: "#e4ebff",
      chatSystem: "#f0f4ff",
      foreground: "#111827",
      foregroundSoft: "#2a3550",
      muted: "#5e6a83",
      line: "#d8e1f4",
      success: "#0f9f73",
      warning: "#ca8a04",
      danger: "#c2410c",
      info: "#465fff",
      shadow: "#1d2954",
      overlay: "rgba(17, 24, 39, 0.2)",
    },
    dark: {
      brand: "#88a0ff",
      brandStrong: "#5b75ff",
      brandSoft: "#162353",
      brandContrast: "#060b1d",
      background: "#0a1224",
      backgroundAlt: "#101a31",
      surface: "#121e39",
      surfaceSoft: "#162542",
      surfaceRaised: "#1d2d50",
      headerSurface: "rgba(15,23,42,0.82)",
      navSurface: "rgba(18,30,57,0.96)",
      fieldSurface: "#13203a",
      heroFrom: "rgba(18,30,57,0.95)",
      heroTo: "rgba(13,23,42,0.98)",
      heroSpotlight: "rgba(91,117,255,0.2)",
      tableHead: "#172541",
      chatInbound: "#15223c",
      chatOutbound: "#20315b",
      chatSystem: "#1a2949",
      foreground: "#eef4ff",
      foregroundSoft: "#d4ddf8",
      muted: "#9daccc",
      line: "#243556",
      success: "#34d399",
      warning: "#fbbf24",
      danger: "#fb7185",
      info: "#93c5fd",
      shadow: "#030712",
      overlay: "rgba(3, 7, 18, 0.58)",
    },
  },
  mosaic: {
    label: "HBX Mosaic",
    shortLabel: "MO",
    inspiration: "Mosaic / Cruip",
    description: "Mais refinado e polido, com camadas premium, brilho controlado e acabamento maduro.",
    personality: "Produto maduro com brilho controlado, hierarquia refinada e sensação editorial.",
    shellLabel: "Premium studio",
    densityLabel: "Respirado",
    depthLabel: "Refinada",
    chrome: {
      radiusXs: "11px",
      radiusSm: "15px",
      radiusMd: "19px",
      radiusLg: "26px",
      radiusXl: "34px",
      topbarWidth: "1520px",
      contentWidth: "1580px",
      contentGutter: "20px",
      topbarBlur: "22px",
    },
    typography: {
      bodyFont: "var(--font-plus-jakarta)",
      displayFont: "var(--font-space-grotesk)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.26em",
    },
    workspace: {
      railWidth: "278px",
      contextWidth: "320px",
      shellGap: "20px",
      shellPadding: "22px",
      heroColumns: "1.08fr 0.92fr",
      heroMinHeight: "208px",
    },
    light: {
      brand: "#0f766e",
      brandStrong: "#115e59",
      brandSoft: "#d9fbf2",
      brandContrast: "#f7fffe",
      background: "#eff8f6",
      backgroundAlt: "#e4f3f0",
      surface: "#ffffff",
      surfaceSoft: "#f8fffd",
      surfaceRaised: "#eefaf6",
      headerSurface: "rgba(255,255,255,0.8)",
      navSurface: "rgba(246,255,252,0.94)",
      fieldSurface: "#fbfffe",
      heroFrom: "rgba(255,255,255,0.96)",
      heroTo: "rgba(230,247,242,0.98)",
      heroSpotlight: "rgba(15,118,110,0.18)",
      tableHead: "#f2fbf8",
      chatInbound: "#ffffff",
      chatOutbound: "#daf7ef",
      chatSystem: "#edf8f4",
      foreground: "#0f172a",
      foregroundSoft: "#24413e",
      muted: "#536a67",
      line: "#d4e7e1",
      success: "#0f8a6f",
      warning: "#c47a09",
      danger: "#c2410c",
      info: "#0f766e",
      shadow: "#123635",
      overlay: "rgba(7, 24, 23, 0.2)",
    },
    dark: {
      brand: "#63d4c4",
      brandStrong: "#2cb7a4",
      brandSoft: "#0f3634",
      brandContrast: "#031312",
      background: "#061514",
      backgroundAlt: "#0c201f",
      surface: "#102624",
      surfaceSoft: "#16302e",
      surfaceRaised: "#1b3a37",
      headerSurface: "rgba(7,26,24,0.84)",
      navSurface: "rgba(16,38,36,0.96)",
      fieldSurface: "#102624",
      heroFrom: "rgba(16,38,36,0.95)",
      heroTo: "rgba(8,23,22,0.98)",
      heroSpotlight: "rgba(99,212,196,0.18)",
      tableHead: "#122a28",
      chatInbound: "#122a28",
      chatOutbound: "#18413d",
      chatSystem: "#16302e",
      foreground: "#effefb",
      foregroundSoft: "#d6f5ef",
      muted: "#9bbcb7",
      line: "#23514c",
      success: "#34d399",
      warning: "#fbbf24",
      danger: "#fb7185",
      info: "#67e8f9",
      shadow: "#020d0d",
      overlay: "rgba(2, 13, 13, 0.58)",
    },
  },
  flowbite: {
    label: "HBX Flowbite",
    shortLabel: "FB",
    inspiration: "Flowbite",
    description: "Mais pratico e utilitario, com leitura direta, componentes fortes e operacao clara.",
    personality: "Utilitarismo moderno para operacao, CRUD e fluxos de execucao rapida.",
    shellLabel: "Utility board",
    densityLabel: "Compacto",
    depthLabel: "Pratica",
    chrome: {
      radiusXs: "8px",
      radiusSm: "11px",
      radiusMd: "14px",
      radiusLg: "18px",
      radiusXl: "24px",
      topbarWidth: "1640px",
      contentWidth: "1680px",
      contentGutter: "16px",
      topbarBlur: "14px",
    },
    typography: {
      bodyFont: "var(--font-manrope)",
      displayFont: "var(--font-manrope)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.18em",
    },
    workspace: {
      railWidth: "248px",
      contextWidth: "254px",
      shellGap: "14px",
      shellPadding: "16px",
      heroColumns: "1.42fr 0.78fr",
      heroMinHeight: "174px",
    },
    light: {
      brand: "#1d4ed8",
      brandStrong: "#1e40af",
      brandSoft: "#dbeafe",
      brandContrast: "#f8fbff",
      background: "#eff4ff",
      backgroundAlt: "#e7eefb",
      surface: "#ffffff",
      surfaceSoft: "#f7faff",
      surfaceRaised: "#eef3ff",
      headerSurface: "rgba(255,255,255,0.9)",
      navSurface: "rgba(248,250,255,0.96)",
      fieldSurface: "#ffffff",
      heroFrom: "rgba(255,255,255,0.98)",
      heroTo: "rgba(236,243,255,0.98)",
      heroSpotlight: "rgba(29,78,216,0.16)",
      tableHead: "#f4f8ff",
      chatInbound: "#ffffff",
      chatOutbound: "#e3edff",
      chatSystem: "#eff4ff",
      foreground: "#10203a",
      foregroundSoft: "#253658",
      muted: "#5e6f91",
      line: "#d6e0f3",
      success: "#0f8a6f",
      warning: "#d97706",
      danger: "#dc2626",
      info: "#1d4ed8",
      shadow: "#14284d",
      overlay: "rgba(7, 23, 54, 0.18)",
    },
    dark: {
      brand: "#7fb1ff",
      brandStrong: "#4c82ff",
      brandSoft: "#112c67",
      brandContrast: "#051025",
      background: "#071326",
      backgroundAlt: "#0c1b33",
      surface: "#10213f",
      surfaceSoft: "#142849",
      surfaceRaised: "#173057",
      headerSurface: "rgba(8,19,38,0.84)",
      navSurface: "rgba(16,33,63,0.96)",
      fieldSurface: "#10213f",
      heroFrom: "rgba(16,33,63,0.95)",
      heroTo: "rgba(9,19,37,0.98)",
      heroSpotlight: "rgba(127,177,255,0.18)",
      tableHead: "#132645",
      chatInbound: "#132645",
      chatOutbound: "#1c3c73",
      chatSystem: "#173057",
      foreground: "#f2f7ff",
      foregroundSoft: "#dae6fb",
      muted: "#9eb1cf",
      line: "#24436c",
      success: "#34d399",
      warning: "#fbbf24",
      danger: "#fb7185",
      info: "#93c5fd",
      shadow: "#020817",
      overlay: "rgba(2, 8, 23, 0.58)",
    },
  },
  tabler: {
    label: "HBX Tabler",
    shortLabel: "TB",
    inspiration: "Tabler",
    description: "Mais robusto e estrutural, com leitura forte, bordas firmes e cara de sistema pesado.",
    personality: "Console administrativo robusto, mais estrutural e orientado a volume de dados.",
    shellLabel: "Operations console",
    densityLabel: "Denso",
    depthLabel: "Estrutural",
    chrome: {
      radiusXs: "7px",
      radiusSm: "9px",
      radiusMd: "12px",
      radiusLg: "16px",
      radiusXl: "22px",
      topbarWidth: "1720px",
      contentWidth: "1760px",
      contentGutter: "16px",
      topbarBlur: "10px",
    },
    typography: {
      bodyFont: "var(--font-sora)",
      displayFont: "var(--font-space-grotesk)",
      monoFont: "var(--font-ibm-plex-mono)",
      eyebrowSpacing: "0.16em",
    },
    workspace: {
      railWidth: "324px",
      contextWidth: "296px",
      shellGap: "16px",
      shellPadding: "16px",
      heroColumns: "1.4fr 0.82fr",
      heroMinHeight: "186px",
    },
    light: {
      brand: "#3151a4",
      brandStrong: "#213a80",
      brandSoft: "#dbe5ff",
      brandContrast: "#f7faff",
      background: "#eff2f8",
      backgroundAlt: "#e4e9f2",
      surface: "#ffffff",
      surfaceSoft: "#f6f8fb",
      surfaceRaised: "#edf1f7",
      headerSurface: "rgba(250,251,253,0.92)",
      navSurface: "rgba(243,246,251,0.96)",
      fieldSurface: "#fdfefe",
      heroFrom: "rgba(250,251,253,0.98)",
      heroTo: "rgba(233,238,247,0.98)",
      heroSpotlight: "rgba(49,81,164,0.14)",
      tableHead: "#eef2f8",
      chatInbound: "#ffffff",
      chatOutbound: "#e3ebff",
      chatSystem: "#eef2f7",
      foreground: "#111827",
      foregroundSoft: "#253246",
      muted: "#66758b",
      line: "#d4dce8",
      success: "#0f8a6f",
      warning: "#c47a09",
      danger: "#c2410c",
      info: "#3151a4",
      shadow: "#172030",
      overlay: "rgba(15, 23, 42, 0.2)",
    },
    dark: {
      brand: "#97abff",
      brandStrong: "#6884ff",
      brandSoft: "#1b2651",
      brandContrast: "#081127",
      background: "#0a101b",
      backgroundAlt: "#121a28",
      surface: "#172131",
      surfaceSoft: "#1b2739",
      surfaceRaised: "#223147",
      headerSurface: "rgba(13,19,31,0.88)",
      navSurface: "rgba(23,33,49,0.97)",
      fieldSurface: "#172131",
      heroFrom: "rgba(23,33,49,0.96)",
      heroTo: "rgba(13,19,31,0.98)",
      heroSpotlight: "rgba(151,171,255,0.16)",
      tableHead: "#1a2536",
      chatInbound: "#1a2536",
      chatOutbound: "#243555",
      chatSystem: "#202c41",
      foreground: "#f4f7fb",
      foregroundSoft: "#d7dfeb",
      muted: "#a0adbf",
      line: "#2b3c54",
      success: "#34d399",
      warning: "#fbbf24",
      danger: "#fb7185",
      info: "#93c5fd",
      shadow: "#030712",
      overlay: "rgba(3, 7, 18, 0.62)",
    },
  },
};

export function isHbxThemeId(value: string): value is HbxThemeId {
  return HBX_THEME_IDS.includes(value as HbxThemeId);
}

export function isHbxThemeMode(value: string): value is HbxThemeMode {
  return HBX_THEME_MODES.includes(value as HbxThemeMode);
}
