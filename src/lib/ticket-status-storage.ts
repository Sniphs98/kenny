import { publicTicketStatusSchema } from '#lib/contracts/index.js';

export type StoredTicketStatus = {
	key: string;
	title: string;
	path: string;
	lastViewedAt: number;
	updatedAt?: number;
	status?: string;
	closed?: boolean;
	projectName?: string;
	projectColor?: string;
};

const STORAGE_KEY = 'kenny.ticket-statuses.v1';
const STATUS_PATH = /^\/status\/[A-Za-z][A-Za-z0-9]*-\d+\/[A-Za-z0-9_-]{43}$/;

function valid(value: unknown): value is StoredTicketStatus {
	if (!value || typeof value !== 'object') return false;
	const item = value as Record<string, unknown>;
	return (
		typeof item.key === 'string' &&
		/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(item.key) &&
		typeof item.title === 'string' &&
		item.title.length <= 300 &&
		typeof item.path === 'string' &&
		STATUS_PATH.test(item.path) &&
		typeof item.lastViewedAt === 'number' &&
		(item.updatedAt === undefined || typeof item.updatedAt === 'number') &&
		(item.status === undefined || (typeof item.status === 'string' && item.status.length <= 60)) &&
		(item.closed === undefined || typeof item.closed === 'boolean') &&
		(item.projectName === undefined || (typeof item.projectName === 'string' && item.projectName.length <= 120)) &&
		(item.projectColor === undefined ||
			(typeof item.projectColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.projectColor)))
	);
}

export function storedTicketStatuses(): StoredTicketStatus[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
		return Array.isArray(value) ? value.filter(valid).slice(0, 50) : [];
	} catch {
		return [];
	}
}

export function rememberTicketStatus(ticket: Omit<StoredTicketStatus, 'lastViewedAt'>) {
	if (!valid({ ...ticket, lastViewedAt: Date.now() })) return;
	try {
		const items = storedTicketStatuses().filter((item) => item.key !== ticket.key);
		localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...ticket, lastViewedAt: Date.now() }, ...items].slice(0, 50)));
	} catch {
		// Private Browsermodi oder volle Speicher dürfen den Ticketfluss nicht unterbrechen.
	}
}

export async function refreshStoredTicketStatuses() {
	const items = storedTicketStatuses();
	const refreshed = await Promise.all(
		items.map(async (item): Promise<StoredTicketStatus | null> => {
			const response = await fetch(`/api/v1${item.path}`);
			if (response.status === 404) return null;
			if (!response.ok) throw new Error('Ticketstatus konnte nicht geladen werden.');
			const current = publicTicketStatusSchema.parse(await response.json());
			return {
				...item,
				title: current.title,
				status: current.status,
				closed: current.closed,
				updatedAt: current.updatedAt.getTime(),
				projectName: current.project.name,
				projectColor: current.project.color
			};
		})
	);
	const current = refreshed.filter((item): item is StoredTicketStatus => item !== null);
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
	} catch {
		// Die aktuelle Ansicht funktioniert auch dann, wenn der Browser nicht speichern kann.
	}
	return current;
}
