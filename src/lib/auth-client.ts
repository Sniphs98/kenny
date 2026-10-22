import { createAuthClient } from 'better-auth/svelte';
import { withBase } from '#lib/paths.js';

export const authClient = createAuthClient({ basePath: withBase('/api/auth') });
