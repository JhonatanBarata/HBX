import type { Metadata } from "next";

import { WorkspaceClient } from "./page.client";

export const metadata: Metadata = { title: "HBX System — Workspace" };

export default function WorkspacePage() {
  return <WorkspaceClient />;
}
