import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './router/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsListPage } from './pages/ClientsListPage';
import { ClientProfilePage } from './pages/ClientProfilePage';
import { OverviewTab } from './pages/tabs/OverviewTab';
import { EvaluationsTab } from './pages/tabs/EvaluationsTab';
import { EvaluationFormPage } from './pages/tabs/EvaluationFormPage';
import { EvaluationDetailPage } from './pages/tabs/EvaluationDetailPage';
import { EvolutionTab } from './pages/tabs/EvolutionTab';
import { DietTab } from './pages/tabs/DietTab';
import { WorkoutTab } from './pages/tabs/WorkoutTab';
import { ReportsTab } from './pages/tabs/ReportsTab';
import { MessagesTab } from './pages/tabs/MessagesTab';
import { AgendaPage } from './pages/AgendaPage';
import { PlanPage } from './pages/PlanPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminProfessionalsPage } from './pages/admin/AdminProfessionalsPage';
import { AdminModerationPage } from './pages/admin/AdminModerationPage';
import { AdminMetricsPage } from './pages/admin/AdminMetricsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              element={
                <ProtectedRoute requireRole="professional">
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientsListPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/plano" element={<PlanPage />} />
              <Route path="/clients/:clientId" element={<ClientProfilePage />}>
                <Route index element={<OverviewTab />} />
                <Route path="evaluations" element={<EvaluationsTab />} />
                <Route path="evaluations/new" element={<EvaluationFormPage />} />
                <Route path="evaluations/:evaluationId" element={<EvaluationDetailPage />} />
                <Route path="evaluations/:evaluationId/edit" element={<EvaluationFormPage />} />
                <Route path="evolution" element={<EvolutionTab />} />
                <Route path="diet" element={<DietTab />} />
                <Route path="workout" element={<WorkoutTab />} />
                <Route path="reports" element={<ReportsTab />} />
                <Route path="messages" element={<MessagesTab />} />
              </Route>
            </Route>
            <Route
              element={
                <ProtectedRoute requireRole="admin">
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/admin" element={<AdminProfessionalsPage />} />
              <Route path="/admin/moderation" element={<AdminModerationPage />} />
              <Route path="/admin/metrics" element={<AdminMetricsPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
