import { expect, test, type BrowserType, type BrowserContextOptions, type Page } from '@playwright/test';
import { api, card, createProject, createTicket, getTicket, open } from './helpers';

async function freshBrowser(browserType: BrowserType, options: BrowserContextOptions) {
	const browser = await browserType.launch();
	try {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		return { browser, context, page };
	} catch (error) {
		await browser.close();
		throw error;
	}
}

async function openSubtasksCardField(page: Page) {
	await page.getByRole('button', { name: /Aktuelle Einstellungen/ }).click();
	await page.getByRole('button', { name: /Eigenschaften ausgewählt/ }).click();
	return page.getByRole('menuitemcheckbox', { name: 'Unteraufgaben', exact: true });
}

for (const mode of ['root', 'subtask-card', 'expanded-subtask'] as const) {
	test(`completed ${mode} remains visible after closing and reopening the browser`, async ({
		playwright,
		browserName,
		request,
		baseURL
	}) => {
		const browserType = playwright[browserName];
		const p = await createProject(request, 'Browser persistence');
		const parent = mode === 'root' ? null : await createTicket(request, p.key, { title: 'Parent of completed ticket' });
		const t = await createTicket(request, p.key, {
			title: 'Completed ticket',
			...(parent ? { parent: parent.key } : {})
		});
		const options: BrowserContextOptions = {
			baseURL,
			storageState: 'playwright/.auth/user.json',
			locale: 'de-DE',
			viewport: { width: 1600, height: 1000 }
		};
		const first = await freshBrowser(browserType, options);
		let state: BrowserContextOptions['storageState'];
		try {
			await open(first.page, `/projects/${p.key}/board`);
			if (mode === 'subtask-card') {
				const subtasks = await openSubtasksCardField(first.page);
				await subtasks.click();
				await first.page.keyboard.press('Escape');
				await first.page.getByRole('button', { name: /Aktuelle Einstellungen/ }).click();
			}
			if (mode === 'expanded-subtask') {
				await card(first.page, parent!.title)
					.getByRole('button', { name: /Unteraufgaben/ })
					.click();
				await api(request, 'POST', `/tickets/${t.key}/close`);
				await expect(card(first.page, parent!.title).getByRole('link', { name: new RegExp(t.title) })).toBeVisible();
			} else {
				await first.page
					.locator(`[data-card="${t.id}"]`)
					.dragTo(first.page.getByRole('region', { name: 'Allgemein: Erledigt', exact: true }));
				await expect(
					first.page
						.getByRole('region', { name: 'Allgemein: Erledigt', exact: true })
						.getByRole('link', { name: t.title, exact: true })
				).toBeVisible();
			}
			await expect.poll(async () => (await getTicket(request, t.key)).closed).toBe(true);
			state = await first.context.storageState();
		} finally {
			await first.browser.close();
		}

		const second = await freshBrowser(browserType, { ...options, storageState: state });
		try {
			await open(second.page, `/projects/${p.key}/board`);
			expect(await getTicket(request, t.key)).toMatchObject({ closed: true, status: 'Erledigt' });
			if (mode === 'expanded-subtask') {
				await expect(card(second.page, parent!.title).getByRole('button', { name: /Unteraufgaben/ })).toHaveAttribute(
					'aria-expanded',
					'true'
				);
				await expect(card(second.page, parent!.title).getByRole('link', { name: new RegExp(t.title) })).toBeVisible();
			} else {
				await expect(
					second.page
						.getByRole('region', { name: 'Allgemein: Erledigt', exact: true })
						.getByRole('link', { name: t.title, exact: true })
				).toBeVisible();
			}
			if (mode === 'subtask-card') {
				await expect(await openSubtasksCardField(second.page)).not.toBeChecked();
				const other = await createProject(request, 'Independent board view');
				await open(second.page, `/projects/${other.key}/board`);
				await expect(await openSubtasksCardField(second.page)).toBeChecked();
				await open(second.page, `/projects/${p.key}/board`);
				await expect(await openSubtasksCardField(second.page)).not.toBeChecked();
			}
		} finally {
			await second.browser.close();
		}
	});
}

test('failed completion saves show an error and revert the optimistic board move', async ({ page, request }) => {
	const p = await createProject(request);
	const t = await createTicket(request, p.key, { title: 'Completion rejected' });
	await open(page, `/projects/${p.key}/board`);
	await page.route(`**/api/v1/tickets/${t.id}`, (route) =>
		route.request().method() === 'PATCH'
			? route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'Speichern fehlgeschlagen' })
				})
			: route.continue()
	);
	await card(page, t.title).dragTo(page.getByRole('region', { name: 'Allgemein: Erledigt', exact: true }));
	await expect(page.getByText('Speichern fehlgeschlagen', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Allgemein: Offen', exact: true }).getByRole('link', {
			name: t.title,
			exact: true
		})
	).toBeVisible();
	expect((await getTicket(request, t.key)).closed).toBe(false);
	await page.reload();
	await expect(
		page.getByRole('region', { name: 'Allgemein: Offen', exact: true }).getByRole('link', {
			name: t.title,
			exact: true
		})
	).toBeVisible();
});
