import { Suspense } from 'react';
import { ResetPassword } from '@/components/auth/ResetPassword';

// The path itself is a contract with the API's reset email, which builds
// `${APP_BASE_URL}/reset-password?token=...` (AR-12). Reading that token needs
// useSearchParams, hence the boundary.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
