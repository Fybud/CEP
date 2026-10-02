import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../components/layouts/DashboardLayout";
import { ProtectedRoute } from "../components/layouts/ProtectedRoute";

import { InboxPage } from "../pages/private/Inbox";
import { ContactsPage } from "../pages/private/Contacts";
import { SettingsPage } from "../pages/private/Settings";
import { TicketsPage } from "../pages/private/Tickets";
import { TicketDetailPage } from "../pages/private/TicketDetail";
import { UsersPage } from "../pages/private/UsersPage";
import { TeamsPage } from "../pages/private/TeamsPage";
import { TemplatesPage } from "../pages/private/TemplatesPage";
import { BroadcastPage } from "../pages/private/BroadcastPage";
import { DashboardPage } from "../pages/private/Dashboard";
import { LoginPage } from "../pages/public/Login";
import { WebChatPage } from "../pages/public/WebChatPage";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/chat" element={<WebChatPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/inbox" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="tickets/:id" element={<TicketDetailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="broadcast" element={<BroadcastPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
