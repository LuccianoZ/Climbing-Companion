import { AlertsScreen } from '@/components/alerts/AlertsScreen';

// Tab 3. Epic 6 (BL-028) fills in what was a placeholder: image-rejected and
// strike-issued notifications, per Foundation §12. Friend requests join the
// same feed with Epic 7. Direct messages never will — messaging is cut from
// MVP scope.
export default function AlertsPage() {
  return <AlertsScreen />;
}
