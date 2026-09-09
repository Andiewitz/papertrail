import TimeHistoryPage from "@/client/time-history-page";

export default async function CollabHistoryPage({ params }: { params: Promise<{ collabId: string }> }) {
  return <TimeHistoryPage collabId={(await params).collabId} />;
}
