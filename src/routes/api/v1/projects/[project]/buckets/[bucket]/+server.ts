import { bucketSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { updateBucket, deleteBucket } from '#lib/server/services/buckets.js';
export const PATCH = apiHandler(
	async (e, user) => updateBucket(user.id, e.params.project!, Number(e.params.bucket), await readJson(e)),
	{ responseSchema: bucketSchema }
);
export const DELETE = apiHandler((e, user) => deleteBucket(user.id, e.params.project!, Number(e.params.bucket)));
