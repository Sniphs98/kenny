import assert from 'node:assert/strict';

const origin = 'http://localhost:3000';
const create = process.env.SMOKE_PHASE === 'create';
const credentials = { email: 'smoke@example.com', password: 'smoke-secret-12345' };
const auth = await fetch(`${origin}/api/auth/${create ? 'sign-up' : 'sign-in'}/email`, {
	method: 'POST',
	headers: { 'content-type': 'application/json', origin },
	body: JSON.stringify({ ...credentials, ...(create ? { name: 'Container Test' } : {}) })
});
assert.equal(auth.status, 200, await auth.text());
const cookie = auth.headers
	.getSetCookie()
	.map((value) => value.split(';')[0])
	.join('; ');
assert.ok(cookie);
async function request(path, method = 'GET', body) {
	const response = await fetch(`${origin}/api/v1${path}`, {
		method,
		headers: { cookie, origin, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`);
	return response.json();
}
if (create) {
	await request('/projects', 'POST', { name: 'Docker test', key: 'DOCKER' });
	const ticket = await request('/projects/DOCKER/tickets', 'POST', { title: 'Persistent container ticket' });
	const body = new FormData();
	body.append('file', new File(['persistent attachment'], 'smoke.txt', { type: 'text/plain' }));
	const response = await fetch(`${origin}/api/v1/tickets/${ticket.id}/attachments`, {
		method: 'POST',
		headers: { cookie, origin },
		body
	});
	assert.equal(response.status, 201, await response.text());
} else {
	const tickets = await request('/projects/DOCKER/tickets');
	assert.equal(tickets.length, 1);
	assert.equal(tickets[0].title, 'Persistent container ticket');
	const attachments = await request(`/tickets/${tickets[0].id}/attachments`);
	assert.equal(attachments.length, 1);
	const response = await fetch(`${origin}${attachments[0].url}`, { headers: { cookie } });
	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'persistent attachment');
}
