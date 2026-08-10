import { CircleCheckBig, CircleX, Info, TriangleAlert } from "../puck/icons.js";
import { type Alert, alertType, getAlertClass } from "./index.js";

const ICONS: Record<alertType, typeof Info> = {
  [alertType.info]: Info,
  [alertType.success]: CircleCheckBig,
  [alertType.warning]: TriangleAlert,
  [alertType.error]: CircleX,
};

export function AlertItem({ alert }: { alert: Alert }) {
  const Icon = ICONS[alert.type] ?? Info;
  return (
    <div role="alert" className={`alert ${getAlertClass(alert.type)}`}>
      <Icon size={20} />
      <span>{alert.message}</span>
    </div>
  );
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className={`flex flex-col gap-4${alerts.length > 1 ? " mb-4" : ""}`}>
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
