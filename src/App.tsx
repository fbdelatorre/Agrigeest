import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import { MachineryProvider } from './context/MachineryContext';
import { NotesProvider } from './context/NotesContext';
import { useAuth } from './hooks/useAuth';

// Layout
import Layout from './components/layout/Layout';

// Auth Pages
import Login from './pages/auth/Login';

// Pages
import Dashboard from './pages/Dashboard';
import Rainfall from './pages/Rainfall';
import FieldMonitoring from './pages/FieldMonitoring';
import PrecisionAgriculture from './pages/PrecisionAgriculture';

// Area Pages
import AreasList from './pages/area/AreasList';
import AreaDetail from './pages/area/AreaDetail';
import AreaCreate from './pages/area/AreaCreate';
import AreaEdit from './pages/area/AreaEdit';

// Farm Map
import { FarmMapScreen } from './pages/farmMap/FarmMap';

// Operation Pages
import OperationsList from './pages/operation/OperationsList';
import OperationCreate from './pages/operation/OperationCreate';
import OperationEdit from './pages/operation/OperationEdit';

// Inventory Pages
import InventoryList from './pages/inventory/InventoryList';
import ProductCreate from './pages/inventory/ProductCreate';
import ProductEdit from './pages/inventory/ProductEdit';

// Machinery Pages
import MachineryList from './pages/machinery/MachineryList';
import MachineryCreate from './pages/machinery/MachineryCreate';
import MachineryEdit from './pages/machinery/MachineryEdit';
import MachineryDetail from './pages/machinery/MachineryDetail';
import MaintenanceList from './pages/machinery/MaintenanceList';
import MaintenanceCreate from './pages/machinery/MaintenanceCreate';
import MaintenanceEdit from './pages/machinery/MaintenanceEdit';

// Notes Pages
import NotesList from './pages/notes/NotesList';
import NoteCreate from './pages/notes/NoteCreate';
import NoteEdit from './pages/notes/NoteEdit';

// Reports & Statistics
import Reports from './pages/Reports';
import Statistics from './pages/Statistics';

// Settings
import Settings from './pages/Settings';

// Notifications
import Notifications from './pages/Notifications';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!session) return <Navigate to="/login" replace />;

  return (
    <AppProvider key={session.user.id} userId={session.user.id} email={session.user.email}>
      <MachineryProvider>
        <NotesProvider>{children}</NotesProvider>
      </MachineryProvider>
    </AppProvider>
  );
};

const Router = import.meta.env.MODE === 'native' ? HashRouter : BrowserRouter;

function NativeBackNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    if (import.meta.env.MODE !== 'native') return;
    const hasPreviousPage = () => (window.history.state?.idx ?? 0) > 0;
    const handleBack = () => {
      if (hasPreviousPage()) {
        navigate(-1);
      } else if (!['', '#/', '#/login'].includes(window.location.hash)) {
        navigate('/', { replace: true });
      } else if (Capacitor.getPlatform() === 'android') {
        void NativeApp.minimizeApp();
      }
    };

    if (Capacitor.getPlatform() === 'android') {
      const listener = NativeApp.addListener('backButton', handleBack);
      return () => { void listener.then(handle => handle.remove()); };
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'BrowserBack' || (event.altKey && event.key === 'ArrowLeft')) {
        event.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return null;
}

function App() {
  return (
    <LanguageProvider>
      <Router>
        <NativeBackNavigation />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            {/* Dashboard */}
            <Route index element={<Dashboard />} />

            {/* Areas */}
            <Route path="areas" element={<AreasList />} />
            <Route path="areas/:id" element={<AreaDetail />} />
            <Route path="areas/new" element={<AreaCreate />} />
            <Route path="areas/:id/edit" element={<AreaEdit />} />

            {/* Farm Map */}
            <Route path="farm-map" element={<FarmMapScreen />} />
            <Route path="monitoring" element={<FieldMonitoring />} />
            <Route path="precision" element={<PrecisionAgriculture />} />
            <Route path="rainfall" element={<Rainfall />} />

            {/* Operations */}
            <Route path="operations" element={<OperationsList />} />
            <Route path="operations/new" element={<OperationCreate />} />
            <Route path="operations/:id/edit" element={<OperationEdit />} />

            {/* Inventory */}
            <Route path="inventory" element={<InventoryList />} />
            <Route path="inventory/new" element={<ProductCreate />} />
            <Route path="inventory/:id/edit" element={<ProductEdit />} />

            {/* Machinery */}
            <Route path="machinery" element={<MachineryList />} />
            <Route path="machinery/new" element={<MachineryCreate />} />
            <Route path="machinery/:id" element={<MachineryDetail />} />
            <Route path="machinery/:id/edit" element={<MachineryEdit />} />
            <Route path="maintenances" element={<MaintenanceList />} />
            <Route path="maintenances/new" element={<MaintenanceCreate />} />
            <Route path="maintenances/:id/edit" element={<MaintenanceEdit />} />

            {/* Notes */}
            <Route path="notes" element={<NotesList />} />
            <Route path="notes/new" element={<NoteCreate />} />
            <Route path="notes/:id/edit" element={<NoteEdit />} />

            {/* Reports & Statistics */}
            <Route path="reports" element={<Reports />} />
            <Route path="statistics" element={<Statistics />} />

            {/* Notifications */}
            <Route path="notifications" element={<Notifications />} />

            {/* Settings */}
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Fallback route for 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;
