export type VehicleType = "car" | "bike" | "truck";
export type FlowType = "guard_managed" | "self_report";
export type SlotStatus =
  | "free"
  | "reserved_pending"
  | "self_reported"
  | "self_reported_leaving"
  | "occupied"
  | "mismatch";
export type UserRole = "guard" | "admin";

export interface Lot {
  id: string;
  name: string;
  location: string;
}

export interface Slot {
  id: string;
  zone: string;
  number: string;
  vehicle_type: VehicleType;
  status: SlotStatus;
  session: string | null;
}

export interface Alert {
  slot_id: string;
  zone: string;
  number: string;
  status: SlotStatus;
  session: string;
}

export interface LoginResponse {
  token: string;
  role: UserRole;
  name: string;
  lot_ids: string;
}

export interface CheckinResponse {
  session_id: string;
  zone: string;
  number: string;
  status: SlotStatus;
}

export interface TapResponse {
  status: SlotStatus;
  slot_status?: SlotStatus;
  session_id: string;
  terminal?: boolean;
  message?: string;
}

export interface LotOverview {
  lot_id: string;
  name: string;
  total: number;
  occupied: number;
  free: number;
  pct: number;
}

export interface Mismatch {
  slot_id: string;
  session_id: string;
  action: string;
  at: string;
}

export interface Overstay {
  session_id: string;
  slot_id: string;
  lot_id: string;
  vehicle_ref: string;
}

export interface StatsOverview {
  lots: LotOverview[];
  system_pct: number;
  mismatch_count: number;
  mismatches: Mismatch[];
  overstays: Overstay[];
}

export interface RecentSession {
  id: string;
  slot_id: string;
  lot_id: string;
  status: SlotStatus;
  flow: FlowType;
  vehicle_ref: string;
  start: string;
  end: string;
}

export interface WsMessage {
  event?: string;
  slot_id?: string;
  status?: SlotStatus;
  session_id?: string;
  terminal?: boolean;
  message?: string;
  lot_id?: string;
  slot_status?: SlotStatus;
}

export const VEHICLE_ICONS: Record<VehicleType, string> = {
  car: "🚗",
  bike: "🏍️",
  truck: "🚛",
};

export const STATUS_LABELS: Record<SlotStatus, string> = {
  free: "Available",
  reserved_pending: "Reserved",
  self_reported: "Unverified",
  self_reported_leaving: "Leaving",
  occupied: "Occupied",
  mismatch: "Mismatch",
};

export const STATUS_COLORS: Record<
  SlotStatus,
  { bg: string; text: string; dot: string }
> = {
  free: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  reserved_pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  self_reported: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  self_reported_leaving: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    dot: "bg-cyan-500",
  },
  occupied: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  mismatch: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
};
