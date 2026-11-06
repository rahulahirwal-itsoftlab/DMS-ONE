import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import { AuthProvider, useAuth } from "./state/AuthContext.jsx";
import { dashboardRoute } from "./utils/roleRouting.js";
import { initTextFormatter } from "./utils/textFormatter.js";
import "./styles.css";

// Lazy-loaded routes for code splitting
const SuperAdmin = lazy(() => import("./pages/SuperAdmin.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const Dealer = lazy(() => import("./pages/Dealer.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));

initTextFormatter();

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-500">Loading module...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role && !(Array.isArray(role) ? role.includes(user.role) : user.role === role)) return <Navigate to="/" replace />;
  return children;
}

const dealerRoles = ["DEALER", "DEALER_CEO", "DEALER_STOCK_INVENTORY_MANAGER", "DEALER_STOCK_DELIVERY_MANAGER", "DEALER_SALES_FINANCE_MANAGER"];

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={dashboardRoute(user.role)} replace />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route element={<App />}>
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/super-admin" element={<Navigate to="/super-admin/dashboard" replace />} />
              <Route path="/super-admin/:section" element={<ProtectedRoute role={["SUPER_ADMIN", "SUPER_ADMIN_CEO"]}><SuperAdmin /></ProtectedRoute>} />
              <Route path="/super-admin-ceo/*" element={<Navigate to="/super-admin/dashboard" replace />} />
              <Route path="/super-admin-it/*" element={<Navigate to="/login" replace />} />
              <Route path="/super-admin-sales/*" element={<Navigate to="/login" replace />} />
              <Route path="/super-admin-finance/*" element={<Navigate to="/login" replace />} />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/:section" element={<ProtectedRoute role={["ADMIN", "ADMIN_CEO", "DEALER_MANAGER", "PRODUCT_DELIVERY_MANAGER", "FINANCE_MANAGER"]}><Admin /></ProtectedRoute>} />
              <Route path="/dealer" element={<Navigate to="/dealer/dashboard" replace />} />
              <Route path="/dealer/:section" element={<ProtectedRoute role={dealerRoles}><Dealer /></ProtectedRoute>} />
              <Route path="/dealer-ceo/dashboard" element={<ProtectedRoute role={["DEALER", "DEALER_CEO"]}><Dealer /></ProtectedRoute>} />
              <Route path="/dealer-stock-delivery/dashboard" element={<ProtectedRoute role={["DEALER_STOCK_INVENTORY_MANAGER", "DEALER_STOCK_DELIVERY_MANAGER"]}><Dealer /></ProtectedRoute>} />
              <Route path="/dealer-sales-finance/dashboard" element={<ProtectedRoute role="DEALER_SALES_FINANCE_MANAGER"><Dealer /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="*" element={<HomeRedirect />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
