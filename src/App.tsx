import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
// Radio pages
import SignFormPage from './pages/SignFormPage';
import SigningsPage from './pages/SigningsPage';
import SoldiersPage from './pages/SoldiersPage';
import ItemsPage from './pages/ItemsPage';
import LogsPage from './pages/LogsPage';
import UsersPage from './pages/UsersPage';
import ReportsPage from './pages/ReportsPage';
import UnitSignFormPage from './pages/UnitSignFormPage';
import UnitSigningsPage from './pages/UnitSigningsPage';
import UnitStockReportPage from './pages/UnitStockReportPage';
import SoldiersImportPage from './pages/SoldiersImportPage';
// Weapons pages
import WeaponsCheckoutPage from './pages/weapons/WeaponsCheckoutPage';
import WeaponsInventoryPage from './pages/weapons/WeaponsInventoryPage';
import WeaponsTransferPage from './pages/weapons/WeaponsTransferPage';
import WeaponsItemsPage from './pages/weapons/WeaponsItemsPage';
// Delek pages
import DelekPage from './pages/delek/DelekPage';
import DelekAdminPage from './pages/delek/DelekAdminPage';
// Bunker pages
import BunkerInventoryPage from './pages/bunker/BunkerInventoryPage';
import BunkerReceivePage from './pages/bunker/BunkerReceivePage';
import BunkerDispensePage from './pages/bunker/BunkerDispensePage';
import BunkerCreditPage from './pages/bunker/BunkerCreditPage';
import BunkerTransferPage from './pages/bunker/BunkerTransferPage';
import BunkerRegulatePage from './pages/bunker/BunkerRegulatePage';
import BunkerShatsalPage from './pages/bunker/BunkerShatsalPage';
import BunkerSummaryPage from './pages/bunker/BunkerSummaryPage';
// Personnel pages (שלישות)
import AttendanceReportPage from './pages/personnel/AttendanceReportPage';
import AttendanceRecordsPage from './pages/personnel/AttendanceRecordsPage';
// Vehicle pages (רכב)
import VehicleManagePage from './pages/vehicles/VehicleManagePage';
import VehicleSummaryPage from './pages/vehicles/VehicleSummaryPage';
// Maneuver pages (תמרון)
import ManeuverRequirementsPage from './pages/maneuver/ManeuverRequirementsPage';
import ManeuverEntriesPage from './pages/maneuver/ManeuverEntriesPage';
import ManeuverWorkPage from './pages/maneuver/ManeuverWorkPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Dashboard */}
        <Route index element={<DashboardPage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />

        {/* ── קשר (Radio) ── */}
        <Route path="sign" element={<SignFormPage />} />
        <Route path="signings" element={<SigningsPage />} />
        <Route path="soldiers" element={<SoldiersPage />} />
        <Route path="items" element={<ProtectedRoute requireAdmin><ItemsPage /></ProtectedRoute>} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="users" element={<ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="unit-sign" element={<ProtectedRoute requireAdmin><UnitSignFormPage /></ProtectedRoute>} />
        <Route path="unit-signings" element={<ProtectedRoute requireAdmin><UnitSigningsPage /></ProtectedRoute>} />
        <Route path="unit-stock" element={<UnitStockReportPage />} />
        <Route path="soldiers-import" element={<ProtectedRoute requireAdmin><SoldiersImportPage /></ProtectedRoute>} />

        {/* ── נשקים (Weapons) ── */}
        <Route path="weapons/checkout" element={<WeaponsCheckoutPage />} />
        <Route path="weapons/inventory" element={<WeaponsInventoryPage />} />
        <Route path="weapons/transfer" element={<WeaponsTransferPage />} />
        <Route path="weapons/armory" element={<ProtectedRoute requireAdmin><WeaponsItemsPage /></ProtectedRoute>} />

        {/* ── דלק (Delek) ── */}
        <Route path="delek" element={<DelekPage />} />
        <Route path="delek/admin" element={<ProtectedRoute requireAdmin><DelekAdminPage /></ProtectedRoute>} />

        {/* ── בונקר (Bunker) ── */}
        {/* רס"פ רשאי רק לדווח שצ"ל ולראות סיכום; שאר מסכי הבונקר — מנהל בלבד. */}
        <Route path="bunker/inventory" element={<ProtectedRoute requireAdmin><BunkerInventoryPage /></ProtectedRoute>} />
        <Route path="bunker/receive" element={<ProtectedRoute requireAdmin><BunkerReceivePage /></ProtectedRoute>} />
        <Route path="bunker/dispense" element={<ProtectedRoute requireAdmin><BunkerDispensePage /></ProtectedRoute>} />
        <Route path="bunker/credit" element={<ProtectedRoute requireAdmin><BunkerCreditPage /></ProtectedRoute>} />
        <Route path="bunker/transfer" element={<ProtectedRoute requireAdmin><BunkerTransferPage /></ProtectedRoute>} />
        <Route path="bunker/regulate" element={<ProtectedRoute requireAdmin><BunkerRegulatePage /></ProtectedRoute>} />
        <Route path="bunker/shatsal" element={<BunkerShatsalPage />} />
        <Route path="bunker/summary" element={<BunkerSummaryPage />} />

        {/* ── שלישות (Personnel) ── */}
        <Route path="personnel/attendance" element={<AttendanceReportPage />} />
        <Route path="personnel/records" element={<AttendanceRecordsPage />} />

        {/* ── רכב (Vehicles) ── */}
        <Route path="vehicles/manage" element={<VehicleManagePage />} />
        <Route path="vehicles/summary" element={<VehicleSummaryPage />} />

        {/* ── תמרון (Maneuver) ── */}
        <Route path="maneuver/requirements" element={<ManeuverRequirementsPage />} />
        <Route path="maneuver/entries" element={<ManeuverEntriesPage />} />
        <Route path="maneuver/work" element={<ManeuverWorkPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
