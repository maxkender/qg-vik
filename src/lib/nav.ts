import {
  Activity, Calendar, Gauge, HeartPulse, LayoutGrid, Mail,
  Images, CalendarDays, CalendarRange, ChartColumn, Columns3, KeyRound, Link2, ListTodo, Milestone, Receipt, Users, Video, Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; key?: string };

export const NAV_PLANNING: NavItem[] = [
  { href: "/", label: "À faire", icon: ListTodo, key: "1" },
  { href: "/semaine", label: "Semaine", icon: Activity },
  { href: "/boite", label: "Ma boîte", icon: Mail },
  { href: "/reunions", label: "Réunions", icon: Video },
  { href: "/horizons", label: "Horizons", icon: Columns3, key: "2" },
  { href: "/jours", label: "Jours", icon: CalendarDays, key: "3" },
  { href: "/semaines", label: "Semaines", icon: CalendarRange, key: "4" },
  { href: "/mois", label: "Mois", icon: Calendar, key: "5" },
  { href: "/annees", label: "Années", icon: Milestone, key: "6" },
];

export const NAV_PILOTAGE: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn, key: "7" },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/control", label: "Control", icon: Gauge },
  { href: "/depenses", label: "Dépenses", icon: Receipt, key: "8" },
  { href: "/process", label: "Process", icon: Workflow, key: "9" },
  { href: "/liens", label: "Liens & guides", icon: Link2 },
  { href: "/ressources", label: "Ressources", icon: Images },
  { href: "/acces", label: "Légal & accès", icon: KeyRound },
  { href: "/sante", label: "Santé de l'agent", icon: HeartPulse },
];

export const NAV_EQUIPE: NavItem[] = [
  { href: "/profils", label: "Profils", icon: Users },
];

export const NAV_ALL = [...NAV_PLANNING, ...NAV_PILOTAGE, ...NAV_EQUIPE];
