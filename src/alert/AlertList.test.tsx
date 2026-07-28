import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlertItem, AlertList } from './AlertList.js';
import { alertType, createAlert, getAlertClass } from './index.js';

describe('getAlertClass', () => {
    it('returns correct class for each alert type', () => {
        expect(getAlertClass(alertType.info)).toBe('alert-info');
        expect(getAlertClass(alertType.success)).toBe('alert-success');
        expect(getAlertClass(alertType.warning)).toBe('alert-warning');
        expect(getAlertClass(alertType.error)).toBe('alert-error');
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

describe('AlertItem', () => {
    it('renders with role="alert"', () => {
        const markup = renderToStaticMarkup(
            <AlertItem alert={createAlert(alertType.info, 'hello')} />
        );
        expect(markup).toContain('role="alert"');
    });

    it('applies the correct CSS class for each alert type', () => {
        for (const type of Object.values(alertType)) {
            const markup = renderToStaticMarkup(
                <AlertItem alert={createAlert(type, 'msg')} />
            );
            expect(markup).toContain(getAlertClass(type));
        }
    });

    it('renders the alert message', () => {
        const markup = renderToStaticMarkup(
            <AlertItem alert={createAlert(alertType.success, 'Saved successfully')} />
        );
        expect(markup).toContain('Saved successfully');
    });
});

describe('AlertList', () => {
    it('renders nothing for an empty list', () => {
        const markup = renderToStaticMarkup(<AlertList alerts={[]} />);
        expect(markup).toBe('');
    });

    it('renders one AlertItem per alert', () => {
        const alerts = [
            createAlert(alertType.info, 'first'),
            createAlert(alertType.warning, 'second'),
        ];
        const markup = renderToStaticMarkup(<AlertList alerts={alerts} />);
        expect(markup).toContain('first');
        expect(markup).toContain('second');
        expect(markup.match(/role="alert"/g)).toHaveLength(2);
    });
});
