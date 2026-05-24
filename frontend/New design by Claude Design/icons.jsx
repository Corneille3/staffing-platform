// Hand-authored, 1.6px stroke, currentColor
const Icon = ({ d, size=18, fill=false, stroke=1.6, children, viewBox="0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill?"currentColor":"none"} stroke={fill?"none":"currentColor"} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d}/> : children}
  </svg>
);
const I = {
  Bolt: (p) => <Icon {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z"/></Icon>,
  Clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Pin: (p) => <Icon {...p}><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></Icon>,
  Check: (p) => <Icon {...p}><path d="m5 12 4 4 10-10"/></Icon>,
  X: (p) => <Icon {...p}><path d="m6 6 12 12M18 6 6 18"/></Icon>,
  ArrowRight: (p) => <Icon {...p}><path d="M5 12h14m-5-6 6 6-6 6"/></Icon>,
  ArrowLeft: (p) => <Icon {...p}><path d="M19 12H5m6-6-6 6 6 6"/></Icon>,
  Calendar: (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Icon>,
  Bell: (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0"/></Icon>,
  Phone: (p) => <Icon {...p}><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></Icon>,
  Globe: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></Icon>,
  Search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Filter: (p) => <Icon {...p}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></Icon>,
  Plus: (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Menu: (p) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16"/></Icon>,
  More: (p) => <Icon {...p}><circle cx="5" cy="12" r="1" fill/><circle cx="12" cy="12" r="1" fill/><circle cx="19" cy="12" r="1" fill/></Icon>,
  User: (p) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></Icon>,
  Shield: (p) => <Icon {...p}><path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z"/></Icon>,
  Sparkle: (p) => <Icon {...p}><path d="M12 3v6m0 6v6M3 12h6m6 0h6M6 6l3 3m6 6 3 3M6 18l3-3m6-6 3-3"/></Icon>,
  Warn: (p) => <Icon {...p}><path d="M12 3 2 21h20zM12 10v5M12 18v.5"/></Icon>,
  Briefcase: (p) => <Icon {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></Icon>,
  Activity: (p) => <Icon {...p}><path d="M3 12h4l3-8 4 16 3-8h4"/></Icon>,
  ChevronDown: (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>,
  Settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="m19.4 15-1.5-1a7 7 0 0 0 0-4l1.5-1L18 6l-1.7.5a7 7 0 0 0-3.5-2L12.5 3h-1l-.3 1.5a7 7 0 0 0-3.5 2L6 6 4.6 9l1.5 1a7 7 0 0 0 0 4L4.6 15 6 18l1.7-.5a7 7 0 0 0 3.5 2L11.5 21h1l.3-1.5a7 7 0 0 0 3.5-2L18 18z"/></Icon>,
  Spark: (p) => <Icon {...p}><path d="m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/></Icon>,
  Heart: (p) => <Icon {...p}><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></Icon>,
  Logo: ({size=28}) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M6 22c0-7 4-12 10-12s10 5 10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="9" r="3" fill="currentColor"/>
      <path d="M11 26h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};
window.I = I;
window.Icon = Icon;
