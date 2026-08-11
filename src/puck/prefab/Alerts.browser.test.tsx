import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { alertType, createAlert } from '../../alert/index.js';
import Alerts, { type AlertsProps } from './Alerts';

const AlertsRender = Alerts.render as (props: Record<string, unknown>) => React.JSX.Element;

const puck = (isEditing: boolean) => ({
    renderDropZone: () => null,
    metadata: {},
    isEditing,
    dragRef: null,
});

function renderAlerts(props: AlertsProps, isEditing = false) {
    return render(<AlertsRender {...props} puck={puck(isEditing)} />);
}

describe('Alerts render', () => {
    it('renders each session alert', async () => {
        const screen = await renderAlerts({
            alerts: [createAlert(alertType.info, 'first'), createAlert(alertType.error, 'second')],
        });

        await expect.element(screen.getByText('first')).toBeInTheDocument();
        await expect.element(screen.getByText('second')).toBeInTheDocument();
        expect(screen.container.querySelectorAll('[role="alert"]')).toHaveLength(2);
    });

    it('renders nothing on a published page when there are no alerts', async () => {
        const screen = await renderAlerts({ alerts: [] });

        expect(screen.container.textContent).toBe('');
        expect(screen.container.querySelectorAll('[role="alert"]')).toHaveLength(0);
    });

    it('treats missing alerts the same as an empty list', async () => {
        const screen = await renderAlerts({});

        expect(screen.container.textContent).toBe('');
    });

    it('shows an editor placeholder when empty, so the block is visible to drag', async () => {
        const screen = await renderAlerts({ alerts: [] }, true);

        await expect.element(screen.getByText('No active session alerts')).toBeInTheDocument();
    });

    it('shows real alerts rather than the placeholder while editing', async () => {
        const screen = await renderAlerts({ alerts: [createAlert(alertType.success, 'saved')] }, true);

        await expect.element(screen.getByText('saved')).toBeInTheDocument();
        expect(screen.container.textContent).not.toContain('No active session alerts');
    });

    it('is offered only on pages and templates, not inside forms', () => {
        expect(Alerts.locations).toEqual(['page', 'template']);
    });
});
