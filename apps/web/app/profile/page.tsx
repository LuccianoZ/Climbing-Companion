import { TabPlaceholder } from '@/components/shell/AppShell';

export default function ProfilePage() {
  return (
    <TabPlaceholder title="Profile" owningStory="Epic 5 — Profiles & Logbook">
      Your logbook, favourite routes and privacy controls. Signing in and out
      already works from the menu in the top-left; what lands here is the
      profile itself.
    </TabPlaceholder>
  );
}
