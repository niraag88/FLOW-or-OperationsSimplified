// Mock user for public access - no authentication required
export const getCurrentUser = () => ({
  id: 'public-user',
  full_name: 'Public User',
  email: 'public@opsuite.com',
  role: 'Admin'
});

export const isLoggedIn = () => true;

// Override any User.me() calls to return our mock user
export const mockUserMe = () => Promise.resolve(getCurrentUser());