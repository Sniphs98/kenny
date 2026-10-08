/** Fachlicher Fehler, der von der API als JSON mit Statuscode zurückgegeben wird */
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}
