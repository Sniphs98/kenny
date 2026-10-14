import { and, asc, eq, sql } from 'drizzle-orm';
import { bucketSchema, createBucketSchema, updateBucketSchema } from '#lib/contracts/index.js';
import { db } from '../db';
import { bucket, ticket } from '../db/schema';
import { ApiError } from '../errors';
import { publish } from '../live';
import { parseInput } from '../validation';
import { getProject } from './projects';
import { requireProjectAccess } from './access';

export function listBuckets(projectId: number) {
	return db
		.select({ id: bucket.id, name: bucket.name })
		.from(bucket)
		.where(eq(bucket.projectId, projectId))
		.orderBy(asc(bucket.name))
		.all();
}

function checkName(projectId: number, name: string, exceptId?: number) {
	const existing = db
		.select()
		.from(bucket)
		.where(and(eq(bucket.projectId, projectId), sql`lower(${bucket.name}) = lower(${name})`))
		.get();
	if (existing && existing.id !== exceptId) throw new ApiError(409, 'Bucket existiert bereits.');
}

export function resolveBucket(projectId: number, bucketId: number | null) {
	if (bucketId === null) return null;
	const found = db
		.select()
		.from(bucket)
		.where(and(eq(bucket.projectId, projectId), eq(bucket.id, bucketId)))
		.get();
	if (!found) throw new ApiError(400, 'Bucket gehört nicht zu diesem Projekt.');
	return found.id;
}

export function createBucket(actorId: string, projectRef: string | number, raw: unknown) {
	const input = parseInput(createBucketSchema, raw);
	const p = getProject(projectRef);
	requireProjectAccess(actorId, p.id, 'admin');
	const result = db.transaction((tx) => {
		checkName(p.id, input.name);
		return bucketSchema.parse(tx.insert(bucket).values({ projectId: p.id, name: input.name }).returning().get());
	});
	publish(p.id);
	return result;
}

export function updateBucket(actorId: string, projectRef: string | number, bucketId: number, raw: unknown) {
	const input = parseInput(updateBucketSchema, raw);
	const p = getProject(projectRef);
	requireProjectAccess(actorId, p.id, 'admin');
	const result = db.transaction((tx) => {
		resolveBucket(p.id, bucketId);
		if (input.name !== undefined) {
			checkName(p.id, input.name, bucketId);
			tx.update(bucket).set({ name: input.name }).where(eq(bucket.id, bucketId)).run();
		}
		return bucketSchema.parse(tx.select().from(bucket).where(eq(bucket.id, bucketId)).get());
	});
	publish(p.id);
	return result;
}

export function deleteBucket(actorId: string, projectRef: string | number, bucketId: number) {
	const p = getProject(projectRef);
	requireProjectAccess(actorId, p.id, 'admin');
	db.transaction((tx) => {
		resolveBucket(p.id, bucketId);
		tx.update(ticket).set({ bucketId: null, updatedAt: new Date() }).where(eq(ticket.bucketId, bucketId)).run();
		tx.delete(bucket).where(eq(bucket.id, bucketId)).run();
	});
	publish(p.id);
	return { ok: true };
}
