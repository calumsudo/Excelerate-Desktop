import { useState } from 'react';
import {
  Button,
  Input,
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectItem,
} from '@heroui/react';
import { useAuth } from '@/contexts/auth-context';
import { AuthService } from '@services/auth-service';

export function InviteUser() {
  const { profile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form validation
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [fullNameError, setFullNameError] = useState<string | null>(null);

  // Only admins can invite users
  if (profile?.role !== 'admin') {
    return (
      <Card>
        <CardBody>
          <p className="text-default-500">
            Only administrators can invite new users.
          </p>
        </CardBody>
      </Card>
    );
  }

  const validateFullName = (value: string): boolean => {
    if (!value || value.trim().length === 0) {
      setFullNameError('Full name is required');
      return false;
    }
    setFullNameError(null);
    return true;
  };

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError('Password is required');
      return false;
    }
    if (value.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate all fields
    const isFullNameValid = validateFullName(fullName);
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isFullNameValid || !isEmailValid || !isPasswordValid) {
      return;
    }

    setLoading(true);

    try {
      // Create the user account
      const { user, error: signUpError } = await AuthService.signUp({
        email,
        password,
        fullName,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!user) {
        throw new Error('Failed to create user account');
      }

      // Update the user's role if not member
      if (role !== 'member') {
        await AuthService.updateUserProfile(user.id, { role });
      }

      setSuccess(`User ${fullName} (${email}) has been invited successfully!`);

      // Reset form
      setEmail('');
      setPassword('');
      setFullName('');
      setRole('member');
    } catch (err) {
      console.error('Invite user error:', err);
      if (err instanceof Error) {
        if (err.message.includes('already registered')) {
          setError('This email is already registered.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to invite user. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-1 px-6 pt-6">
        <h2 className="text-xl font-bold">Invite New User</h2>
        <p className="text-sm text-default-500">
          Create an account for a new team member
        </p>
      </CardHeader>
      <CardBody className="gap-4 px-6 pb-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-success-50 p-3 text-sm text-success">
              {success}
            </div>
          )}

          <Input
            label="Full Name"
            type="text"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (fullNameError) validateFullName(e.target.value);
            }}
            onBlur={(e) => validateFullName(e.target.value)}
            isInvalid={!!fullNameError}
            errorMessage={fullNameError}
            isRequired
            variant="bordered"
          />

          <Input
            label="Email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) validateEmail(e.target.value);
            }}
            onBlur={(e) => validateEmail(e.target.value)}
            isInvalid={!!emailError}
            errorMessage={emailError}
            isRequired
            variant="bordered"
          />

          <Input
            label="Temporary Password"
            type="password"
            placeholder="Create a temporary password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) validatePassword(e.target.value);
            }}
            onBlur={(e) => validatePassword(e.target.value)}
            isInvalid={!!passwordError}
            errorMessage={passwordError}
            isRequired
            variant="bordered"
            description="User should change this on first login (minimum 8 characters)"
          />

          <Select
            label="Role"
            placeholder="Select a role"
            selectedKeys={[role]}
            onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
            variant="bordered"
            isRequired
          >
            <SelectItem key="member" value="member">
              Member - Can access assigned portfolios
            </SelectItem>
            <SelectItem key="admin" value="admin">
              Admin - Full access and can invite users
            </SelectItem>
          </Select>

          <Button
            type="submit"
            color="primary"
            isLoading={loading}
            className="w-full"
          >
            {loading ? 'Inviting user...' : 'Invite User'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
