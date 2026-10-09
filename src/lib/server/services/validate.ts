import { dateSchema } from '$lib/contracts';
import { ApiError } from '../errors';

export function str(v: unknown, field: string, opts: { max?: number } = {}): string {
	if (typeof v !== 'string' || !v.trim()) throw new ApiError(400, `Feld "${field}" ist erforderlich.`);
	const s = v.trim();
	if (opts.max && s.length > opts.max) throw new ApiError(400, `Feld "${field}" ist zu lang (max. ${opts.max}).`);
	return s;
}

export function optStr(v: unknown, field: string): string | null {
	if (v === undefined || v === null || v === '') return null;
	if (typeof v !== 'string') throw new ApiError(400, `Feld "${field}" muss ein Text sein.`);
	return v;
}

/** Datum im Format YYYY-MM-DD oder null */
export function optDate(v: unknown, field: string): string | null {
	if (v === undefined || v === null || v === '') return null;
	if (!dateSchema.safeParse(v).success)
		throw new ApiError(400, `Feld "${field}" muss ein Datum im Format YYYY-MM-DD sein.`);
	return dateSchema.parse(v);
}

export function optInt(v: unknown, field: string): number | null {
	if (v === undefined || v === null || v === '') return null;
	const n = Number(v);
	if (!Number.isInteger(n)) throw new ApiError(400, `Feld "${field}" muss eine ganze Zahl sein.`);
	return n;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
	if (typeof v !== 'string' || !allowed.includes(v as T))
		throw new ApiError(400, `Feld "${field}" muss einer von ${allowed.join(', ')} sein.`);
	return v as T;
}
