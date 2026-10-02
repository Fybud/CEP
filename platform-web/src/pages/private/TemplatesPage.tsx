import { Navigate } from "react-router-dom";
import { WhatsAppTemplateManager } from "../../components/settings/WhatsAppTemplateManager";
import { useFeatureFlag, useEnabledChannelTypes } from "../../api";
import { useAuthStore } from "../../store/auth";

export function TemplatesPage() {
  const user = useAuthStore((s) => s.user);
  const { data: featureFlag, isLoading: loadingFeature } = useFeatureFlag("whatsapp_templates_enabled");
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();

  if (loadingFeature || !channelsReady) return null;

  const hasWhatsapp = enabledChannels.includes("whatsapp");
  const canView = user && (user.role === "SUPER_ADMIN" || user.role === "ADMIN") && featureFlag?.enabled && hasWhatsapp;

  if (!canView) {
    return <Navigate to="/inbox" replace />;
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8 pb-16 sm:px-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp Templates</h1>
        </div>
        <WhatsAppTemplateManager />
      </div>
    </div>
  );
}
