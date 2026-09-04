// Small line icons for the contact channels — nav bar and contact pills both
// use these, so they live in one place instead of three copies of inline SVG.

type IconProps = {
  size?: number;
};

export function MailIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function PhoneIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h4l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v4a16 16 0 0 1-16-16z" />
    </svg>
  );
}

export function LinkedInIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 20.5V9.5" />
      <circle cx="5.5" cy="4.8" r="1.6" />
      <path d="M12 20.5V9.5m0 4.6a4.3 4.3 0 0 1 8.6 0v6.4" />
    </svg>
  );
}
