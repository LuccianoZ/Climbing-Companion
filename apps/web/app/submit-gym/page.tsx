import { RequireSession } from '@/components/auth/RequireSession';
import { SubmitGymForm } from '@/components/submit/SubmitGymForm';

export default function SubmitGymPage() {
  return (
    <RequireSession>
      <SubmitGymForm />
    </RequireSession>
  );
}
