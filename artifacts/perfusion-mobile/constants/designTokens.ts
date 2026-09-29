export const designTokens = {
  color: {
    coral: "#F0654A",
    plum: "#7A2E4D",
    plumDark: "#5C2039",
    coralDark: "#C94B33",
    canvas: "#FDF6F1",
    card: "#FFFFFF",
    ink: "#2E2220",
    inkSoft: "#8C7A75",
    border: "#EEDFD8",
    coralTint: "#FCE9E3",
    plumTint: "#F3E6EB",
    gold: "#B98334",
    goldTint: "#FAF1E2",
    green: "#1FA971",
    greenBright: "#3CC583",
    greenTint: "#E6F6EE",
    blue: "#5576B6",
    blueTint: "#EAF0FA",
    red: "#C94B43",
    redTint: "#FBEAE8",
    terminal: "#A99A94",
    callScrim: "#2E1F28",
    callDecline: "#3A2530",
    endCallStart: "#F5473A",
    endCallEnd: "#C4291F",
  },
  gradient: {
    brand: ["#F0654A", "#7A2E4D"] as const,
    incoming: ["#5C2039", "#7A2E4D", "#C94B33"] as const,
    accept: ["#3CC583", "#1FA971"] as const,
    endCall: ["#F5473A", "#C4291F"] as const,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    gutter: 16,
    lg: 20,
    xl: 24,
    section: 28,
    page: 32,
  },
  radius: {
    small: 10,
    medium: 14,
    card: 18,
    hero: 24,
    sheet: 22,
    pill: 999,
  },
  shadow: {
    card: {
      color: "#3A1914",
      opacity: 0.1,
      radius: 12,
      offset: { width: 0, height: 5 },
      elevation: 3,
    },
    elevated: {
      color: "#3A1914",
      opacity: 0.16,
      radius: 18,
      offset: { width: 0, height: 9 },
      elevation: 6,
    },
  },
} as const;

export const BRAND_GRADIENT = designTokens.gradient.brand;
export const INCOMING_CALL_GRADIENT = designTokens.gradient.incoming;
export const ACCEPT_CALL_GRADIENT = designTokens.gradient.accept;
export const END_CALL_GRADIENT = designTokens.gradient.endCall;
