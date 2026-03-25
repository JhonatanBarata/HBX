"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { WorkspaceLayoutStore } from "./types";

const WorkspaceLayoutContext = createContext<WorkspaceLayoutStore | null>(null);

export function WorkspaceLayoutProvider({
  children,
  value,
}: Readonly<{
  children: ReactNode;
  value: WorkspaceLayoutStore;
}>) {
  return <WorkspaceLayoutContext.Provider value={value}>{children}</WorkspaceLayoutContext.Provider>;
}

export function useWorkspaceLayout() {
  const value = useContext(WorkspaceLayoutContext);
  if (!value) {
    throw new Error("useWorkspaceLayout must be used inside WorkspaceLayoutProvider.");
  }
  return value;
}
