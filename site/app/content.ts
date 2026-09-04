// Single source of truth for the contact channels — the nav icons and the
// contact-section pills both read from here, so the three links can't drift
// out of sync with each other.

export const contacts = [
  {
    key: "email",
    label: "Email",
    value: "prathamshirbhate1909@gmail.com",
    href: "mailto:prathamshirbhate1909@gmail.com",
    icon: "mail",
    external: false,
  },
  {
    key: "phone",
    label: "Phone",
    value: "+91 84462 78122",
    href: "tel:+918446278122",
    icon: "phone",
    external: false,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    value: "/in/prathamshirbhate",
    href: "https://www.linkedin.com/in/prathamshirbhate",
    icon: "linkedin",
    external: true,
  },
] as const;

export const targets = [
  {
    key: "microservices",
    title: "Microservices",
    copy: "Context that survives crossing a service boundary, instead of getting rebuilt from scratch on the other side.",
  },
  {
    key: "infra",
    title: "Infra",
    copy: "The layer sits close to what's already running — no fork, no rebuild, no new system to operate alongside it.",
  },
  {
    key: "databases",
    title: "Databases",
    copy: "Where state actually lives, made legible to the things that need to reason about it — without shipping it elsewhere.",
  },
] as const;
