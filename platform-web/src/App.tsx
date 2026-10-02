import { useEffect } from "react";
import { Providers } from "./providers";
import { AppRoutes } from "./routes";
import { startRrwebTracker } from "./lib/rrwebTracker";
import { useAuthStore } from "./store/auth";

export function App() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    startRrwebTracker();
  }, [user?.username]);

  return (
    <Providers>
      <AppRoutes />
    </Providers>
  );
}
