import { z } from 'zod';
import { ApiError } from './errors';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new ApiError(
			400,
			result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ')
		);
	}
	return result.data;
}
