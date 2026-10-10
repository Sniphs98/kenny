import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { apiHandler } from '$lib/server/api';
import { createMcpServer } from '$lib/server/mcp';

/**
 * MCP-Endpunkt (Streamable HTTP, zustandslos) für KI-Assistenten.
 * Authentifizierung wie bei der REST-API, in der Regel mit "Authorization: Bearer kny_...".
 */
const handle = apiHandler(async (e, user) => {
	const server = createMcpServer(user.id);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(e.request);
	} finally {
		await server.close();
	}
});

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
