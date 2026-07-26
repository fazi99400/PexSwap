import { Token } from "../config/tokens";

type P = { size?: number; className?: string };

/** Circular coin icon with the token's gradient and monogram — no emoji. */
export function TokenIcon({ token, size = 26 }: { token: Token; size?: number }) {
  const id = `tk-${token.symbol}`;
  const mark = token.symbol.replace(/^W/, "").slice(0, 1);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={token.symbol}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={token.color[0]} />
          <stop offset="1" stopColor={token.color[1]} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill={`url(#${id})`} />
      <circle cx="20" cy="20" r="19" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="17"
        fontWeight="800"
        fill="#fff"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {mark}
      </text>
      {token.symbol.startsWith("W") && (
        <circle cx="20" cy="20" r="13" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeDasharray="2 3" />
      )}
    </svg>
  );
}

/** Ethereum-style diamond (Solidity lane) / hexnut (Rust lane). */
export function LaneMark({ lane, size = 12 }: { lane: "solidity" | "rust"; size?: number }) {
  if (lane === "rust") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2l2.3 1.6 2.8-.3 1.2 2.5 2.5 1.2-.3 2.8L24 12l-1.6 2.3.3 2.8-2.5 1.2-1.2 2.5-2.8-.3L12 22l-2.3-1.6-2.8.3-1.2-2.5L2.9 17l.3-2.8L1.6 12l1.6-2.3-.3-2.8 2.5-1.2 1.2-2.5 2.8.3L12 2z"
          fill="currentColor"
        />
        <circle cx="12" cy="12" r="3.4" fill="#1f1a15" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2l7 10-7 4-7-4 7-10z" fill="currentColor" opacity="0.95" />
      <path d="M12 22l7-8-7 4-7-4 7 8z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function IconArrowDown({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 4v16m0 0l6-6m-6 6l-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlus({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevron({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClose({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconWallet({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2.5" y="5.5" width="19" height="14" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="14.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconSettings({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSun({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMoon({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLayers({ size = 18, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Lifelox brandmark — an orange coin with a stylized "L". */
export function BrandMark({ size = 34 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Lifelox">
      <defs>
        <linearGradient id="pex-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB35C" />
          <stop offset="1" stopColor="#E85D00" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#pex-brand)" />
      <path d="M15 10h4.5v15H29v4H15V10z" fill="#fff" />
    </svg>
  );
}
