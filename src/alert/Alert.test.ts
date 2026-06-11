import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lucide/astro', async () => {
    const { createComponent, render } = await import('astro/compiler-runtime');
    const MockIcon = createComponent((_result: any, props: any) =>
        render`<svg data-testid="icon" data-size=${props.size}></svg>`
    );
    return {
        Info: MockIcon,
        TriangleAlert: MockIcon,
        CircleX: MockIcon,
        CircleCheckBig: MockIcon,
    };
});

import Alert from './Alert.astro';
import {
    alertType,
    createAlert,
    getAlertClass,
    getIconForAlert,
} from './index.js';

describe('getAlertClass', () => {
    it('returns correct class for each alert type', () => {
        expect(getAlertClass(alertType.info)).toBe('alert-info');
        expect(getAlertClass(alertType.success)).toBe('alert-success');
        expect(getAlertClass(alertType.warning)).toBe('alert-warning');
        expect(getAlertClass(alertType.error)).toBe('alert-error');
    });
});

describe('getIconForAlert', () => {
    it('returns a component for each alert type', () => {
        for (const type of Object.values(alertType)) {
            expect(getIconForAlert(type)).toBeDefined();
        }
    });
});

describe('createAlert', () => {
    it('creates an alert with the given type and message', () => {
        const alert = createAlert(alertType.info, 'Something happened');
        expect(alert.type).toBe(alertType.info);
        expect(alert.message).toBe('Something happened');
    });

    it('assigns a unique id to each alert', () => {
        const a = createAlert(alertType.error, 'err');
        const b = createAlert(alertType.error, 'err');
        expect(a.id).not.toBe(b.id);
    });
});

describe('Alert component', () => {
    it('renders with role="alert"', async () => {
        const container = await AstroContainer.create();
        const result = await container.renderToString(Alert, {
            props: { type: alertType.info },
        });
        expect(result).toContain('role="alert"');
    });

    it('applies the correct CSS class for each alert type', async () => {
        const container = await AstroContainer.create();

        for (const type of Object.values(alertType)) {
            const result = await container.renderToString(Alert, {
                props: { type },
            });
            expect(result).toContain(getAlertClass(type));
        }
    });
});
