import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Avatar,
  User,
} from '@heroui/react';
import { useAuth } from '@/contexts/auth-context';
import { useNavigate } from 'react-router-dom';

export function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (!user) {
    return null;
  }

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'User';
  const email = user.email || '';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dropdown placement="bottom-start">
      <DropdownTrigger>
        <div className="cursor-pointer">
          <User
            name={displayName}
            description={email}
            avatarProps={{
              name: initials,
              size: 'sm',
              showFallback: true,
            }}
            classNames={{
              name: 'text-sm font-semibold',
              description: 'text-xs text-default-500',
            }}
          />
        </div>
      </DropdownTrigger>
      <DropdownMenu aria-label="User menu actions" variant="flat">
        <DropdownItem key="profile" className="h-14 gap-2">
          <p className="font-semibold">Signed in as</p>
          <p className="font-semibold">{email}</p>
        </DropdownItem>
        <DropdownItem key="role" showDivider>
          Role: {profile?.role || 'member'}
        </DropdownItem>
        <DropdownItem key="settings" onClick={() => navigate('/settings')}>
          Settings
        </DropdownItem>
        <DropdownItem key="logout" color="danger" onClick={handleSignOut}>
          Sign Out
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
