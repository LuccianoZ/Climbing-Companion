import { Suspense } from 'react';
import { AuthGateway } from '@/components/auth/AuthGateway';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthGateway mode="register" />
    </Suspense>
  );
}
