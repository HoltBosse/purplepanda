// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

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
						{ label: 'Components', slug: 'devs/components' },
						{ label: 'Content Types', slug: 'devs/content-types' },
					],
				},
			],
		}),
	],
});
