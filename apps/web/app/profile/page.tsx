import { ProfileScreen } from '@/components/profile/ProfileScreen';

// Tab 4. Not wrapped in RequireSession: this tab is reachable from the always
// visible tab bar, so a signed-out visitor tapping it is doing the ordinary
// thing rather than trying a door they should not have found. ProfileScreen
// sends them to /login?next=/profile itself.
export default function ProfilePage() {
  return <ProfileScreen />;
}
