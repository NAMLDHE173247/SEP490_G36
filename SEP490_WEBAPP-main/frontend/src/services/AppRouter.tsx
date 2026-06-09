import { QueryClientProvider } from '@tanstack/react-query';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';

import { AutoTrainScreen } from '../pages/AutoTrainScreen';
import ChatPage from "../pages/ChatPage";
import { ConversionPage } from '../pages/ConversionPage';
import { HomePage } from '../pages/HomePage';
import { MainLayout } from '../layout/MainLayout';
import { TrainingHistoryScreen } from '../pages/TrainingHistoryScreen';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ProtectedRoute } from '../pages/ProtectedRoute';
import { AdminPage } from '../pages/AdminPage';

import { ModelEvalLeaderboardScreen } from '../pages/ModelEvalLeaderboardScreen';
import { ModelEvalResultScreen } from '../pages/ModelEvalResultScreen';
import { ModelEvalRunScreen } from '../pages/ModelEvalRunScreen';
import { ModelEvalHistoryScreen } from '../pages/ModelEvalHistoryScreen';
import { ModelEvalCompareScreen } from '../pages/ModelEvalCompareScreen';

import { EvaluationHistory } from '../pages/EvaluationHistory';
import { ModelRegistryPage } from '../pages/ModelRegistryPage';
import { ModelVersionsPage } from '../pages/ModelVersionsPage';
import { PublicProjectsHub } from '../pages/PublicProjectsHub';
import { queryClient } from './queryClient';

export default function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor', 'staff']}>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/chatbotconverter"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <MainLayout>
                  <ConversionPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/autotrain"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <AutoTrainScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/training-history"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <TrainingHistoryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/preparation-history"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <EvaluationHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/evaluation-history"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <EvaluationHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor', 'staff']}>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/community-hub"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor', 'staff']}>
                <PublicProjectsHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:id/labeling"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor', 'staff']}>
                <MainLayout>
                  <ConversionPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Model Registry flow */}
          <Route
            path="/model-registry"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelRegistryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model-registry/:registryId/versions"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelVersionsPage />
              </ProtectedRoute>
            }
          />

          {/* Model evaluation flow */}
          <Route
            path="/model-eval/leaderboard"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalLeaderboardScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model-eval/run"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalRunScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model-eval/history/:jobId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalHistoryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model-eval/compare"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalCompareScreen />
              </ProtectedRoute>
            }
          />
          {/* /model-eval/:evalId phải đứng SAU /model-eval/run, /history, /compare để không bị shadow */}
          <Route
            path="/model-eval/:evalId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalResultScreen />
              </ProtectedRoute>
            }
          />

          {/* Backward-compatible aliases for older URLs */}
          <Route
            path="/model/eval/leaderboard"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalLeaderboardScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model/eval/run"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalRunScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model/eval/history/:jobId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalHistoryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model/eval/compare"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalCompareScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/model/eval/:evalId"
            element={
              <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                <ModelEvalResultScreen />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
