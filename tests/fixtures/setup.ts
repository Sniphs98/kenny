import { rmSync } from 'node:fs';
import { afterAll } from 'vitest';
import { env } from './env';

afterAll(() => rmSync(env.ATTACHMENTS_DIR, { recursive: true, force: true }));
