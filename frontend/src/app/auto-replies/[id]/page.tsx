export const dynamic = "force-dynamic";

import EditRuleClientPage from "./page.client";

export default function Page({ params }: { params: { id: string } }) {
  return <EditRuleClientPage params={params} />;
}
