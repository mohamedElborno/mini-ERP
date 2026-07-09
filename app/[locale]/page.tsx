import { auth } from "@clerk/nextjs/server";

import DashboardPageClient from "@/components/dashboard/DashboardPageClient";

export default async function DashboardRoutePage() {
  const { userId } = await auth();
  if (!userId) return null;

  return <DashboardPageClient />;
}
