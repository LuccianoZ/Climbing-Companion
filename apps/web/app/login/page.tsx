import { Suspense } from 'react';
import { AuthGateway } from '@/components/auth/AuthGateway';

// AR-23: /login and /register render the same component in two modes.
// The Suspense boundary is required because AuthGateway reads
// useSearchParams() for ?next= -- Next's App Router will not statically
// render a route whose tree reads the query string outside one.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthGateway mode="login" />
    </Suspense>
  );
}
