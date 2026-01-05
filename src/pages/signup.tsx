import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input, Card, CardBody, CardHeader } from '@heroui/react';
import { useAuth } from '@/contexts/auth-context';

export default function SignUp() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form validation errors
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(
    null
  );

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
    if (!/(?=.*[a-z])/.test(value)) {
      setPasswordError('Password must contain at least one lowercase letter');
      return false;
    }
    if (!/(?=.*[A-Z])/.test(value)) {
      setPasswordError('Password must contain at least one uppercase letter');
      return false;
    }
    if (!/(?=.*\d)/.test(value)) {
      setPasswordError('Password must contain at least one number');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const validateConfirmPassword = (value: string): boolean => {
    if (!value) {
      setConfirmPasswordError('Please confirm your password');
      return false;
    }
    if (value !== password) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validate all fields
    const isFullNameValid = validateFullName(fullName);
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

    if (
      !isFullNameValid ||
      !isEmailValid ||
      !isPasswordValid ||
      !isConfirmPasswordValid
    ) {
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, fullName);
      setSuccess(true);
      // Navigate to dashboard after successful signup
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      console.error('Sign up error:', err);
      if (err instanceof Error) {
        // Handle specific Supabase errors
        if (err.message.includes('already registered')) {
          setError('This email is already registered. Please sign in instead.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col gap-1 px-6 pt-6">
          <h1 className="text-2xl font-bold">Create an Account</h1>
          <p className="text-sm text-default-500">
            Join Excelerate to get started
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
                Account created successfully! Redirecting...
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
              placeholder="you@example.com"
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
              label="Password"
              type="password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) validatePassword(e.target.value);
                // Re-validate confirm password if it's already filled
                if (confirmPassword) {
                  validateConfirmPassword(confirmPassword);
                }
              }}
              onBlur={(e) => validatePassword(e.target.value)}
              isInvalid={!!passwordError}
              errorMessage={passwordError}
              isRequired
              variant="bordered"
              description="At least 8 characters with uppercase, lowercase, and number"
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (confirmPasswordError) validateConfirmPassword(e.target.value);
              }}
              onBlur={(e) => validateConfirmPassword(e.target.value)}
              isInvalid={!!confirmPasswordError}
              errorMessage={confirmPasswordError}
              isRequired
              variant="bordered"
            />

            <Button
              type="submit"
              color="primary"
              isLoading={loading}
              isDisabled={success}
              className="w-full"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </Button>

            <div className="text-center text-sm">
              <span className="text-default-500">Already have an account? </span>
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
