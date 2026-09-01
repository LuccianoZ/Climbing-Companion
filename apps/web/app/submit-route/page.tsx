import { RequireSession } from '@/components/auth/RequireSession';
import { SubmitRouteForm } from '@/components/submit/SubmitRouteForm';

// AR-29: the map's floating + is hidden from signed-out visitors, but hiding
// an entry point is not access control -- this page is reachable by deep link
// and by a pasted URL. Guarding the body is what stops someone filling in
// eight fields and meeting a 401 at the end.
export default function SubmitRoutePage() {
  return (
    <RequireSession>
      <SubmitRouteForm />
    </RequireSession>
  );
}
