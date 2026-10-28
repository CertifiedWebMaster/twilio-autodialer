import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Show, SignIn, SignUp } from "@clerk/react";
import { Toaster } from "sonner";
import ClerkAuthProvider from "./components/auth/ClerkAuthProvider";
import AuthShell from "./pages/AuthShell";
import Layout from "./components/Layout";
import Dialer from "./pages/Dialer";
import Lists from "./pages/Lists";
import ListDetail from "./pages/ListDetail";
import Calls from "./pages/Calls";
import Team from "./pages/Team";
import Settings from "./pages/Settings";

function Protected() {
  return (
    <>
      <Show when="signed-in">
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dialer />} />
            <Route path="lists" element={<Lists />} />
            <Route path="lists/:id" element={<ListDetail />} />
            <Route path="calls" element={<Calls />} />
            <Route path="team" element={<Team />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Show>
      <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ClerkAuthProvider>
        <Toaster theme="dark" position="top-right" richColors />
        <Routes>
          <Route path="/sign-in/*" element={<AuthShell><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></AuthShell>} />
          <Route path="/sign-up/*" element={<AuthShell><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></AuthShell>} />
          <Route path="/*" element={<Protected />} />
        </Routes>
      </ClerkAuthProvider>
    </BrowserRouter>
  );
}
