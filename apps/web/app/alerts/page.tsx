import { TabPlaceholder } from '@/components/shell/AppShell';

export default function AlertsPage() {
  return (
    <TabPlaceholder title="Alerts" owningStory="Epic 9 — Notifications">
      Friend requests, photo-rejection notices and moderation alerts land here
      once their epic is scheduled. Direct messages will not — messaging is cut
      from MVP scope.
    </TabPlaceholder>
  );
}
