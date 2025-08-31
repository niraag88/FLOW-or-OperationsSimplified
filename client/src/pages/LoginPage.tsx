import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Shield } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim() || !formData.password.trim()) {
      setError('Username and password are required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(formData);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 opacity-90"></div>
      <div className="absolute inset-0 bg-gradient-to-tl from-blue-400 via-purple-500 to-pink-500 opacity-80 animate-pulse"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 opacity-70 animate-pulse" style={{animationDelay: '1s'}}></div>
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full opacity-60 animate-bounce" style={{animationDelay: '0.5s'}}></div>
      <div className="absolute bottom-32 right-24 w-24 h-24 bg-gradient-to-r from-green-400 to-blue-500 rounded-full opacity-50 animate-bounce" style={{animationDelay: '1.5s'}}></div>
      <div className="absolute top-1/2 left-10 w-16 h-16 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full opacity-40 animate-bounce" style={{animationDelay: '2s'}}></div>
      
      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 rounded-full flex items-center justify-center mb-4 shadow-2xl animate-pulse">
            <Shield className="h-8 w-8 text-white drop-shadow-lg" />
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent drop-shadow-lg">
            Operations Management
          </h2>
          <p className="mt-2 text-lg text-white/90 drop-shadow-md font-medium">
            Sign in to access the system
          </p>
        </div>

        {/* Login Form */}
        <Card className="w-full backdrop-blur-lg bg-white/20 border-white/30 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl bg-gradient-to-r from-white to-yellow-100 bg-clip-text text-transparent font-bold">Sign In</CardTitle>
            <CardDescription className="text-white/80 font-medium">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <Label htmlFor="username" className="text-white/90 font-semibold">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  data-testid="input-username"
                  className="bg-white/20 border-white/30 text-white placeholder:text-white/60 backdrop-blur-sm focus:bg-white/30 focus:border-white/50"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="password" className="text-white/90 font-semibold">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  data-testid="input-password"
                  className="bg-white/20 border-white/30 text-white placeholder:text-white/60 backdrop-blur-sm focus:bg-white/30 focus:border-white/50"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 border-0 text-white font-semibold py-3 shadow-2xl transform transition-all duration-200 hover:scale-105"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Admin Access Info */}
        <Card className="backdrop-blur-lg bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 border-white/30 shadow-xl">
          <CardContent className="pt-6">
            <div className="text-center text-sm">
              <p className="font-bold mb-2 text-white bg-gradient-to-r from-yellow-200 to-white bg-clip-text text-transparent">Admin Access</p>
              <p className="text-white/90 font-medium">Use your administrator credentials to access the business operations system.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}