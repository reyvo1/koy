import { AlertsExperience } from '../../components/alerts-experience';
import { UserShell } from '../../components/user-shell';
export const dynamic = 'force-dynamic';
export default function AlertsPage() { return <UserShell title="Alerts" subtitle="WARNING dan CRITICAL hanya dari perangkat yang dapat Anda akses"><AlertsExperience /></UserShell>; }
