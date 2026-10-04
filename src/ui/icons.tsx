/** Small stroke icons (24px grid). Decorative: always paired with a text label or aria-label. */
import type { ComponentChildren } from 'preact';

function Icon({ children, size = 24 }: { children: ComponentChildren; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ToriiIcon = () => (
  <Icon>
    <path d="M3 6.5c6 1.2 12 1.2 18 0" />
    <path d="M5 10h14M7 7.5V20M17 7.5V20M12 7.8V10" />
  </Icon>
);

export const CardsIcon = () => (
  <Icon>
    <rect x="7" y="4" width="13" height="16" rx="2.5" />
    <path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20" />
  </Icon>
);

export const BrushIcon = () => (
  <Icon>
    <path d="M5 5h10a4 4 0 0 1 4 4v10H9a4 4 0 0 1-4-4z" />
    <path d="M9 10h6M9 14h4" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const PlusIcon = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const PencilIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 20l4-1 11-11-3-3L5 16z" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon size={20}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const UploadIcon = () => (
  <Icon>
    <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
  </Icon>
);

export const FlagIcon = () => (
  <Icon>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Icon>
);

export const SwapIcon = () => (
  <Icon>
    <path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7" />
  </Icon>
);

export const BookIcon = () => (
  <Icon>
    <path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" />
    <path d="M12 6v14" />
  </Icon>
);
