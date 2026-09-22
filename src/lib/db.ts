import Dexie, { type Table } from "dexie";
import type { Prize } from "../config";
export interface Device {
  operatorLock?: import("./operator").OperatorLock;
  id: "device";
  deviceId: string;
  createdAt: string;
  auth?: string;
  authExpires?: number;
  paused: boolean;
  activeEntryId?: string;
  lastSync?: string;
  lastClock?: number;
  prizes: Prize[];
  configVersion?: string;
  retired?: boolean;
}
export interface Schedule {
  id: string;
  eventId: string;
  version: 1;
  createdAt: string;
  timezone: string;
  start: string;
  end: string;
  units: Unit[];
  prizes: Prize[];
  algorithm: string;
  deviceId: string;
}
export interface Unit {
  id: string;
  scheduleId: string;
  prizeId: string;
  releaseAt: string;
  window: number;
  awardedTo?: string;
  disabled?: boolean;
}
export interface Entry {
  id: string;
  deviceId: string;
  eventId: string;
  first: string;
  last: string;
  email: string;
  nameKey: string;
  duplicateName: boolean;
  createdAt: string;
  rulesVersion: string;
  ageAccepted: true;
  ageText: string;
  timezone: string;
}
export interface Consent {
  id: string;
  entryId: string;
  choice: boolean;
  text: string;
  version: string;
  source: "Demo Day booth";
  createdAt: string;
}
export interface Spin {
  id: string;
  entryId: string;
  prizeId: string;
  prize: Prize;
  unitId?: string;
  code: string;
  createdAt: string;
  scheduleId: string;
  completedAt?: string;
}
export type Tab = "Entries" | "Consents" | "Spins" | "Inventory" | "Audit";
export interface Queue {
  seq?: number;
  id: string;
  tab: Tab;
  version: 1;
  record: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "synced";
  attempts: number;
  nextAt: number;
  syncedAt?: string;
}
export interface Audit {
  id: string;
  action: string;
  createdAt: string;
  detail: Record<string, unknown>;
}
export class HavenDB extends Dexie {
  device!: Table<Device, string>;
  schedules!: Table<Schedule, string>;
  units!: Table<Unit, string>;
  entries!: Table<Entry, string>;
  consents!: Table<Consent, string>;
  spins!: Table<Spin, string>;
  queue!: Table<Queue, number>;
  audit!: Table<Audit, string>;
  constructor(name = "haven-demo-day-v1") {
    super(name);
    this.version(1).stores({
      device: "id",
      schedules: "id,&eventId",
      units: "id,prizeId,releaseAt,awardedTo",
      entries: "id,&email,nameKey",
      consents: "id,&entryId",
      spins: "id,&entryId,&code",
      queue: "++seq,&id,status,nextAt",
      audit: "id,action",
    });
  }
}
export const db = new HavenDB();
