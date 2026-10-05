import { DNS_PROVIDERS, dnsInstructionsFor } from '../tenant/dns-records';
import { parseDomainList } from '../tenant/domains';

// The site form's DNS walkthrough: for the provider picked, the records each hostname in the
// Domains field needs, redrawn as either changes. The records themselves come from
// src/tenant/dns-records.ts; the hosting hostname from the page.
const root = document.querySelector<HTMLElement>('#domain-dns');
const provider = document.querySelector<HTMLSelectElement>('#dns-provider');
const domainsField = document.querySelector<HTMLTextAreaElement>('textarea[name="domains"]');
const output = document.querySelector<HTMLElement>('#domain-dns-records');

const PROVIDER_KEY = 'purplepanda:dns-provider';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

if (root && provider && domainsField && output) {
    const target = root.dataset.target ?? '';

    for (const option of DNS_PROVIDERS) {
        provider.append(new Option(option.label, option.id));
    }
    try {
        const remembered = localStorage.getItem(PROVIDER_KEY);
        if (remembered && DNS_PROVIDERS.some((option) => option.id === remembered)) provider.value = remembered;
    } catch {
        // No storage (private window, blocked): start on the first provider.
    }

    const render = () => {
        const { domains } = parseDomainList(domainsField.value);
        if (domains.length === 0) {
            output.replaceChildren(el('p', 'text-sm opacity-70', 'Enter the site’s domains above to see the records each needs.'));
            return;
        }
        output.replaceChildren(...domains.map((domain) => {
            const instructions = dnsInstructionsFor(domain, provider.value, target);
            const block = el('div', 'space-y-2');
            const heading = el('h3', 'font-medium');
            heading.append(el('code', '', domain), ` — ${instructions.kind === 'apex' ? 'apex domain' : instructions.kind === 'subdomain' ? 'subdomain' : 'nothing to do'}`);
            block.append(heading);
            if (instructions.records.length > 0) {
                if (instructions.alternatives) {
                    block.append(el('p', 'text-sm', 'Add one of these, the first your provider supports:'));
                }
                const table = el('table', 'table table-sm');
                const head = el('tr');
                head.append(el('th', '', 'Type'), el('th', '', 'Name'), el('th', '', 'Value / target'));
                table.append(el('thead'), el('tbody'));
                table.tHead!.append(head);
                for (const record of instructions.records) {
                    const row = el('tr');
                    const name = record.name ? el('code', '', record.name) : el('span', 'opacity-70', '(leave blank)');
                    const nameCell = el('td');
                    nameCell.append(name);
                    const valueCell = el('td', 'break-all');
                    valueCell.append(el('code', 'select-all', record.value));
                    row.append(el('td', 'font-mono', record.type), nameCell, valueCell);
                    table.tBodies[0]!.append(row);
                }
                const scroll = el('div', 'overflow-x-auto');
                scroll.append(table);
                block.append(scroll);
            }
            if (instructions.note) block.append(el('p', 'text-sm opacity-70', instructions.note));
            return block;
        }));
    };

    provider.addEventListener('change', () => {
        try {
            localStorage.setItem(PROVIDER_KEY, provider.value);
        } catch {
            // Remembering the choice is only a convenience.
        }
        render();
    });
    domainsField.addEventListener('input', render);
    render();
}
