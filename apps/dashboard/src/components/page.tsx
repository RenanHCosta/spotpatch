import { AdminGate } from "./admin-gate";
import { Shell } from "./shell";
export function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <Shell>{children}</Shell>
    </AdminGate>
  );
}
