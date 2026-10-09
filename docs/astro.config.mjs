// @ts-check

import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://purplepanda.holtbosse.com',
	integrations: [
		starlight({
			title: 'Purple Panda Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/holtbosse/purplepanda' }],
			sidebar: [
				{
					label: 'Users',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Getting Started', slug: 'users/getting-started' },
					],
				},
				{
					label: 'Devs',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Installation', slug: 'devs/install' },
						{ label: 'Tenancy', slug: 'devs/tenancy' },
						{ label: 'Components', slug: 'devs/components' },
						{ label: 'Site Components', slug: 'devs/site-components' },
						{ label: 'Content Types', slug: 'devs/content-types' },
						{ label: 'Themes', slug: 'devs/themes' },
						{ label: 'Fonts', slug: 'devs/fonts' },
						{ label: 'AI Assistant', slug: 'devs/ai-assistant' },
						{ label: 'Image REST API', slug: 'devs/image-rest-api' },
						{ label: 'Actions API', slug: 'devs/actions-api' },
						{ label: 'Hooks', slug: 'devs/hooks' },
						{ label: 'Hook Reference', slug: 'devs/hooks-reference' },
					],
				},
			],
		}),
	],
});
