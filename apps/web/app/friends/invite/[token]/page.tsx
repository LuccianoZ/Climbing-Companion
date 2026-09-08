import { RedeemInvite } from '@/components/friends/RedeemInvite';

// The path is a contract with the API: FriendInviteLinksService.create
// builds `${APP_BASE_URL}/friends/invite/${token}` (AR-55). The token is an
// opaque secret, not a UUID.
export default async function RedeemInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RedeemInvite token={token} />;
}
