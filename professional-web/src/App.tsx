import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PublicSignupPage } from './signupLink/PublicSignupPage';
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
import { WorkoutAssistantPage } from './workoutAssistant/WorkoutAssistantPage';
import { DietAssistantPage } from './dietAssistant/DietAssistantPage';
import { ReportsTab } from './pages/tabs/ReportsTab';
import { MessagesTab } from './pages/tabs/MessagesTab';
import { TrackingTab } from './pages/tabs/TrackingTab';
import { AgendaPage } from './pages/AgendaPage';
import { EvaluationsPage } from './pages/EvaluationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AiPage } from './pages/AiPage';
import { TemplatesPage } from './templates/TemplatesPage';
import { ExerciseLibraryPage } from './exercises/ExerciseLibraryPage';
import { FoodLibraryPage } from './foods/FoodLibraryPage';
import { FormsPage } from './customForms/FormsPage';
import { FormEditorPage } from './customForms/FormEditorPage';
import { FormFillPage } from './customForms/FormFillPage';
import { PatientDietAiPage, PatientWorkoutAiPage } from './patientAi/PatientAiPages';
import { DietTemplateEditorPage, WorkoutTemplateEditorPage } from './templates/TemplateEditorPages';
import { AnamnesisPage } from './pages/AnamnesisPage';
import { PlanPage } from './pages/PlanPage';
import { SettingsPage } from './pages/SettingsPage';
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
            <Route path="/cadastro/:code" element={<PublicSignupPage />} />
            <Route
              element={
                <ProtectedRoute requireRole="professional">
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientsListPage />} />
              <Route path="/anamnese" element={<AnamnesisPage />} />
              <Route path="/avaliacao" element={<EvaluationsPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/relatorios" element={<ReportsPage />} />
              <Route path="/ia" element={<AiPage />} />
              <Route path="/modelos" element={<TemplatesPage />} />
              <Route path="/alimentos" element={<FoodLibraryPage />} />
              <Route path="/formularios" element={<FormsPage />} />
              <Route path="/formularios/novo" element={<FormEditorPage />} />
              <Route path="/formularios/:formId" element={<FormEditorPage />} />
              <Route path="/exercicios" element={<ExerciseLibraryPage />} />
              <Route path="/modelos/dietas/novo" element={<DietTemplateEditorPage />} />
              <Route path="/modelos/dietas/:templateId" element={<DietTemplateEditorPage />} />
              <Route path="/modelos/treinos/novo" element={<WorkoutTemplateEditorPage />} />
              <Route path="/modelos/treinos/:templateId" element={<WorkoutTemplateEditorPage />} />
              <Route path="/plano" element={<PlanPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
              <Route path="/clients/:clientId" element={<ClientProfilePage />}>
                <Route index element={<OverviewTab />} />
                <Route path="evaluations" element={<EvaluationsTab />} />
                <Route path="evaluations/new" element={<EvaluationFormPage />} />
                <Route path="evaluations/:evaluationId" element={<EvaluationDetailPage />} />
                <Route path="evaluations/:evaluationId/edit" element={<EvaluationFormPage />} />
                <Route path="evolution" element={<EvolutionTab />} />
                <Route path="tracking" element={<TrackingTab />} />
                <Route path="diet" element={<DietTab />} />
                <Route path="diet/assistant" element={<DietAssistantPage />} />
                <Route path="diet/ia" element={<PatientDietAiPage />} />
                <Route path="workout" element={<WorkoutTab />} />
                <Route path="workout/assistant" element={<WorkoutAssistantPage />} />
                <Route path="workout/ia" element={<PatientWorkoutAiPage />} />
                <Route path="reports" element={<ReportsTab />} />
                <Route path="messages" element={<MessagesTab />} />
                <Route path="forms/new" element={<FormFillPage />} />
                <Route path="forms/:responseId" element={<FormFillPage />} />
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
