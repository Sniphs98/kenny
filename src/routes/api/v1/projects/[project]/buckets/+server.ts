import { bucketSchema } from '#lib/contracts/index.js';
import { apiHandler, readJson } from '#lib/server/api.js';
import { getProject } from '#lib/server/services/projects.js';
import { createBucket, listBuckets } from '#lib/server/services/buckets.js';
export const GET = apiHandler((e) => listBuckets(getProject(e.params.project!).id), {
	responseSchema: bucketSchema.array()
});
export const POST = apiHandler(async (e, user) => createBucket(user.id, e.params.project!, await readJson(e)), {
	status: 201,
	responseSchema: bucketSchema
});
