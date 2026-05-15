import { Info, TriangleAlert, CircleX, CircleCheckBig } from '@lucide/astro';
import type { AstroComponent } from '@lucide/astro';

export enum alertType {
    info = 'info',
    success = 'success',
    warning = 'warning',
    error = 'error',
}

export function getAlertClass(type: alertType): string {
    switch (type) {
        case alertType.info:
            return 'alert-info';
        case alertType.success:
            return 'alert-success';
        case alertType.warning:
            return 'alert-warning';
        case alertType.error:
            return 'alert-error';
        default:
            return '';
    }
}

export function getIconForAlert(type: alertType): AstroComponent {
    switch (type) {
        case alertType.info:
            return Info;
        case alertType.success:
            return CircleCheckBig;
        case alertType.warning:
            return TriangleAlert;
        case alertType.error:
            return CircleX;
        default:
            return Info;
    }
}

//nice type to store array of alerts in astro.session
export interface Alert {
    id: string;
    type: alertType;
    message: string;
}

export function createAlert(type: alertType, message: string): Alert {
    return {
        id: crypto.randomUUID(),
        type,
        message,
    };
}

export async function getAlertsFromSession(session: any): Promise<Alert[]> {
    return (await session.get('alerts')) || [];
}

export async function addAlertToSession(session: any, alert: Alert): Promise<void> {
    const alerts = await getAlertsFromSession(session);
    alerts.push(alert);
    session.set('alerts', alerts);
}

export function clearAlertsFromSession(session: any): void {
    session.set('alerts', []);
}