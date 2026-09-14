import { redirect } from 'next/navigation';

/** Legacy device detail route kept only as a canonical redirect. */
export default async function LegacyDeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  redirect(`/tenant/perangkat/${encodeURIComponent(deviceId)}`);
}
