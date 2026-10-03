import { RealtimeExperience } from '../../components/realtime-experience';
import { UserShell } from '../../components/user-shell';
export const dynamic = 'force-dynamic';
export default function RealtimePage() { return <UserShell title="Realtime" subtitle="Telemetry langsung dari perangkat yang memiliki izin VIEW"><RealtimeExperience /></UserShell>; }
