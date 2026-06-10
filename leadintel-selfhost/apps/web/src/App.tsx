import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import LeadDetail from "./pages/LeadDetail.tsx";
import LoginPage from "./pages/Login.tsx";
import ForgotPasswordPage from "./pages/ForgotPassword.tsx";
import ResetPasswordPage from "./pages/ResetPassword.tsx";
import AcceptInvitePage from "./pages/AcceptInvite.tsx";
import BillingPage from "./pages/Billing.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppSwitcher } from "./components/AppSwitcher";
import { SyncStatusBar } from "./components/SyncStatusBar";
import AdminTenantsPage from "./pages/admin/AdminTenantsPage";
import AdminTenantDetailPage from "./pages/admin/AdminTenantDetailPage";
import AdminTenantTransactionsPage from "./pages/admin/AdminTenantTransactionsPage";
import AdminAuditPage from "./pages/admin/AdminAuditPage";
import AdminProviderCostsPage from "./pages/admin/AdminProviderCostsPage";
import AdminBillingCustomersPage from "./pages/admin/AdminBillingCustomersPage";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppSwitcher />
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          <SyncStatusBar />
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitePage />} />
            {/* Protected app routes */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/leads/:id" element={<ProtectedRoute><LeadDetail /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
            {/* Super admin routes — gating is enforced inside AdminLayout */}
            <Route path="/admin" element={<ProtectedRoute><Navigate to="/admin/tenants" replace /></ProtectedRoute>} />
            <Route path="/admin/tenants" element={<ProtectedRoute><AdminTenantsPage /></ProtectedRoute>} />
            <Route path="/admin/tenants/:id" element={<ProtectedRoute><AdminTenantDetailPage /></ProtectedRoute>} />
            <Route path="/admin/tenants/:id/transactions" element={<ProtectedRoute><AdminTenantTransactionsPage /></ProtectedRoute>} />
            <Route path="/admin/audit" element={<ProtectedRoute><AdminAuditPage /></ProtectedRoute>} />
            <Route path="/admin/provider-costs" element={<ProtectedRoute><AdminProviderCostsPage /></ProtectedRoute>} />
            <Route path="/admin/billing-customers" element={<ProtectedRoute><AdminBillingCustomersPage /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
