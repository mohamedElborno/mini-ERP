"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type ActiveOrgGroup = Id<"groups"> | "all";

type OrgGroupContextValue = {
  orgGroups: { _id: Id<"groups">; name: string }[];
  activeOrgGroupId: ActiveOrgGroup;
  setActiveOrgGroupId: (id: ActiveOrgGroup) => void;
  /** Pass to list queries */
  orgGroupFilter: ActiveOrgGroup | undefined;
  /** Pass to create mutations when a specific company is selected */
  orgGroupIdForCreate: Id<"groups"> | undefined;
  /** Use for settings mutations when "all" is selected (first assigned company) */
  effectiveOrgGroupId: Id<"groups"> | undefined;
  isLoading: boolean;
};

const STORAGE_KEY = "Mini-ERP-active-org-group";

const OrgGroupContext = createContext<OrgGroupContextValue | null>(null);

export function OrgGroupProvider({ children }: { children: ReactNode }) {
  const orgGroupsRaw = useQuery(api.groups.getMyOrgGroups) ?? [];
  const orgGroups = orgGroupsRaw.filter((g) => g != null);
  const [activeOrgGroupId, setActiveOrgGroupIdState] =
    useState<ActiveOrgGroup>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setActiveOrgGroupIdState(stored as ActiveOrgGroup);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || orgGroups.length === 0) return;
    if (activeOrgGroupId === "all") return;
    const exists = orgGroups.some((g) => g._id === activeOrgGroupId);
    if (!exists) setActiveOrgGroupIdState("all");
  }, [hydrated, orgGroups, activeOrgGroupId]);

  const setActiveOrgGroupId = useCallback((id: ActiveOrgGroup) => {
    setActiveOrgGroupIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<OrgGroupContextValue>(
    () => ({
      orgGroups: orgGroups.map((g) => ({ _id: g._id, name: g.name })),
      activeOrgGroupId,
      setActiveOrgGroupId,
      orgGroupFilter: activeOrgGroupId,
      orgGroupIdForCreate:
        activeOrgGroupId === "all" ? undefined : activeOrgGroupId,
      effectiveOrgGroupId:
        activeOrgGroupId === "all" ? orgGroups[0]?._id : activeOrgGroupId,
      isLoading: !hydrated,
    }),
    [orgGroups, activeOrgGroupId, setActiveOrgGroupId, hydrated],
  );

  return (
    <OrgGroupContext.Provider value={value}>
      {children}
    </OrgGroupContext.Provider>
  );
}

export function useOrgGroup() {
  const ctx = useContext(OrgGroupContext);
  if (!ctx) {
    throw new Error("useOrgGroup must be used within OrgGroupProvider");
  }
  return ctx;
}

export function useOrgGroupOptional() {
  return useContext(OrgGroupContext);
}
