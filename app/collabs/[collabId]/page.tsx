import TimeDashboard from "@/client/time-dashboard";

export default async function CollabWorkspacePage({ params }: { params: Promise<{ collabId: string }> }) {
  return <TimeDashboard collabId={(await params).collabId} />;
}
