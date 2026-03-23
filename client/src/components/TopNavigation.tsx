import { Search, Bell, LayoutDashboard, Building, Users, Settings, ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TopNavigation() {
  const { pathname: location } = useLocation();

  return (
    <header className="bg-slate-800 border-b border-slate-700">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <div className="text-white">
                <span className="font-semibold text-lg">FLOW</span>
              </div>
            </div>
          </div>

          {/* Main Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link to="/">
              <Button
                variant={location === "/" ? "default" : "ghost"}
                className={`flex items-center space-x-2 ${
                  location === "/"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
                data-testid="nav-dashboard"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Button>
            </Link>
            
            <Button
              variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-slate-700 flex items-center space-x-2"
              data-testid="nav-internal"
            >
              <Building className="w-4 h-4" />
              <span>Internal</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-slate-700 flex items-center space-x-2"
              data-testid="nav-external"
            >
              <Users className="w-4 h-4" />
              <span>External</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-slate-700 flex items-center space-x-2"
              data-testid="nav-settings"
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Button>
          </nav>

          {/* Search and Profile */}
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
            {/* Search Bar */}
            <div className="relative min-w-0 flex-1 max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </div>
              <Input
                type="text"
                placeholder="Search..."
                className="bg-slate-700 text-white placeholder-slate-400 border-slate-600 pl-10 w-full md:w-64 focus:ring-green-500 focus:border-green-500"
                data-testid="search-input"
              />
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white p-2"
                data-testid="notification-bell"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-yellow-400"></span>
              </Button>
            </div>

            {/* User Profile */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-white text-sm font-medium" data-testid="user-name">
                  Niraag Sheth
                </div>
              </div>
              <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium" data-testid="user-initials">NS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
