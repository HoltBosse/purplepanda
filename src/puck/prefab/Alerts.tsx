import type { ComponentConfig } from "@puckeditor/core";
import type { Alert } from "../../alert/index.js";
import { AlertList } from "../../alert/AlertList.js";

export type AlertsProps = {
  alerts?: Alert[];
};

// Renders session flash alerts on published pages using the same AlertList/AlertItem markup
// as the admin panel (src/alert/AlertList.tsx), fed by whichever alerts the requesting page's
// data() context (Astro.locals) carries.
const Alerts: ComponentConfig<AlertsProps> = {
  label: "Session Alerts",
  locations: ["page", "template"],
  fields: {},
  data: async (_props, context) => {
    if (!import.meta.env.SSR) return { alerts: [] };
    return { alerts: context?.alerts ?? [] };
  },
  render: ({ alerts, puck }) => {
    const resolvedAlerts = alerts ?? [];

    return (
      <div ref={puck.dragRef}>
        {resolvedAlerts.length > 0 ? (
          <AlertList alerts={resolvedAlerts} />
        ) : puck.isEditing ? (
          <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
            No active session alerts
          </div>
        ) : null}
      </div>
    );
  },
};

export default Alerts;
