<script lang="ts">
	import { intlLocale } from '#lib/i18n.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { UpdateTicketInput } from '#lib/contracts/index.js';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		closeTicket,
		createColumn,
		createTicket,
		reorderTickets,
		reopenTicket,
		updateTicket,
		PRIORITY_LABELS
	} from '#lib/api.js';
	import BoardCard from '#lib/components/BoardCard.svelte';
	import TagBadge from '#lib/components/TagBadge.svelte';
	import Hint from '#lib/components/Hint.svelte';
	import TicketDialog from '#lib/components/TicketDialog.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { cn } from '#lib/utils.js';
	import { scrollActivity } from '#lib/scroll-activity.js';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { playIfCompleted } from '#lib/sound.js';
	import { toast } from 'svelte-sonner';
	import ArrowDownUp from '@lucide/svelte/icons/arrow-down-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Eye from '@lucide/svelte/icons/eye';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import Save from '@lucide/svelte/icons/save';
	import Search from '@lucide/svelte/icons/search';
	import TagIcon from '@lucide/svelte/icons/tag';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserRound from '@lucide/svelte/icons/user-round';

	let { data } = $props();

	type Item = (typeof data.tickets)[number];

	const me = $derived(page.data.user?.id);

	let search = $state('');
	/** Leere Auswahl bedeutet: nicht filtern. Mehrere Werte innerhalb eines Filters werden mit O verknüpft. */
	let assigneeFilter = $state<string[]>([]);
	let tagFilter = $state<string[]>([]);
	let statusFilter = $state<string[]>([]);
	let priorityFilter = $state<string[]>([]);
	const tagFilterLabel = $derived(
		tagFilter.length
			? data.tags
					.filter((g) => tagFilter.includes(String(g.id)))
					.map((g) => g.name)
					.join(', ')
			: m.all_tags()
	);
	const statusFilterLabel = $derived(
		statusFilter.length
			? data.columns
					.filter((column) => statusFilter.includes(String(column.id)))
					.map((column) => column.name)
					.join(', ')
			: m.all_statuses()
	);
	const priorityFilterLabel = $derived(
		priorityFilter.length
			? priorityFilter.map((priority) => PRIORITY_LABELS[priority] ?? priority).join(', ')
			: m.all_priorities()
	);
	let dialog: TicketDialog;

	const filterLabel = $derived(
		assigneeFilter.length
			? assigneeFilter
					.map((id) =>
						id === 'me'
							? m.assigned_to_me()
							: id === 'none'
								? m.unassigned()
								: (data.users.find((u) => u.id === id)?.name ?? id)
					)
					.join(', ')
			: m.all_assignees()
	);

	// --- Sortierung und Gruppierung ---
	const SORTS = {
		manual: m.manual(),
		created_desc: m.newest_first(),
		created_asc: m.oldest_first(),
		updated_desc: m.recently_updated(),
		due_asc: m.due_date(),
		priority_desc: m.priority_high_low(),
		priority_asc: m.priority_low_high(),
		title_asc: m.title_a_z()
	} as const;
	type Sort = keyof typeof SORTS;

	const GROUPS = {
		main: m.main_task(),
		none: m.none(),
		tag: m.tag(),
		assignee: m.assignee(),
		priority: m.priority_2()
	} as const;
	type Group = keyof typeof GROUPS;
	type ColumnBy = 'status' | Exclude<Group, 'none'>;
	const COLUMNS: Record<ColumnBy, string> = {
		status: m.status(),
		main: m.main_task(),
		tag: m.tag(),
		assignee: m.assignee(),
		priority: m.priority_2()
	};
	const DEFAULT_CARD_FIELDS = [
		'parent',
		'tags',
		'priority',
		'dueDate',
		'blockers',
		'attachments',
		'assignees',
		'subtasks'
	] as const;
	type CardField = (typeof DEFAULT_CARD_FIELDS)[number] | 'status' | 'statusCheckbox';
	const CARD_FIELDS: CardField[] = ['status', 'statusCheckbox', ...DEFAULT_CARD_FIELDS];
	const CARD_FIELD_LABELS: Record<CardField, string> = {
		status: m.status(),
		statusCheckbox: m.status_checkbox(),
		parent: m.main_task(),
		tags: m.tags(),
		priority: m.priority_2(),
		dueDate: m.due_date(),
		blockers: m.card_blockers(),
		attachments: m.attachments(),
		assignees: m.assignee(),
		subtasks: m.subtasks()
	};
	type BoardViewSettings = {
		assigneeFilter: string[];
		tagFilter: string[];
		statusFilter: string[];
		priorityFilter: string[];
		sortBy: Sort;
		groupBy: Group;
		columnBy: ColumnBy;
		columnSort: Record<string, Sort>;
		cardFields: CardField[];
	};
	type SavedBoardView = {
		id: string;
		name: string;
		settings: BoardViewSettings;
	};

	let sortBy = $state<Sort>('manual');
	/** Abweichende Sortierung einzelner Spalten */
	let columnSort = $state<Record<string, Sort>>({});
	let groupBy = $state<Group>('main');
	let columnBy = $state<ColumnBy>('status');
	let cardFields = $state<CardField[]>([...DEFAULT_CARD_FIELDS]);
	let backlogOpen = $state(true);
	const collapsedLanes = new SvelteSet<string>();
	const initiallyVisibleMainIds = new Set(
		data.tickets
			.filter(
				(ticket) =>
					ticket.kind === 'main' &&
					(ticket.parentId === null ||
						(!!me &&
							ticket.columnId === data.columns.filter((column) => !column.isBacklog && !column.isDone)[1]?.id &&
							ticket.assigneeIds.includes(me)))
			)
			.map((ticket) => ticket.id)
	);
	const hiddenMainIds = new SvelteSet<number>(
		data.tickets
			.filter((ticket) => ticket.kind === 'main' && !initiallyVisibleMainIds.has(ticket.id))
			.map((ticket) => ticket.id)
	);
	let showGeneral = $state(true);
	let showTicketSystem = $state(true);
	/** Expanded subtask lists are part of the saved project view. */
	const expanded = new SvelteSet<number>();

	// Aktuelle Ansicht und benannte Ansichten pro Projekt im Browser merken
	const viewKey = $derived(`board-view:${data.project.key}`);
	const savedViewsKey = $derived(`board-views:${data.project.key}`);
	let viewLoaded = $state(false);
	let savedViewsLoaded = $state(false);
	let savedViews = $state<SavedBoardView[]>([]);
	let activeViewId = $state<string | null>(null);
	let viewDialogOpen = $state(false);
	let viewDialogMode = $state<'create' | 'rename'>('create');
	let viewName = $state('');
	let deleteViewOpen = $state(false);

	function validAssigneeFilter(value: unknown): string[] {
		const values = Array.isArray(value) ? value : typeof value === 'string' && value !== 'all' ? [value] : [];
		return values.filter(
			(item): item is string =>
				typeof item === 'string' && (['me', 'none'].includes(item) || data.users.some((user) => user.id === item))
		);
	}

	function validTagFilter(value: unknown): string[] {
		const values = Array.isArray(value) ? value : typeof value === 'string' && value !== 'all' ? [value] : [];
		return values.filter(
			(item): item is string => typeof item === 'string' && data.tags.some((tag) => String(tag.id) === item)
		);
	}

	function validStatusFilter(value: unknown): string[] {
		const values = Array.isArray(value) ? value : typeof value === 'string' && value !== 'all' ? [value] : [];
		return values.filter(
			(item): item is string => typeof item === 'string' && data.columns.some((column) => String(column.id) === item)
		);
	}

	function validPriorityFilter(value: unknown): string[] {
		const values = Array.isArray(value) ? value : typeof value === 'string' && value !== 'all' ? [value] : [];
		return values.filter((item): item is string => typeof item === 'string' && item in PRIORITY_LABELS);
	}

	function validColumnBy(value: unknown): ColumnBy {
		return value === 'status' || value === 'main' || value === 'tag' || value === 'assignee' || value === 'priority'
			? value
			: 'status';
	}

	function validColumnSort(value: unknown): Record<string, Sort> {
		if (!value || typeof value !== 'object') return {};
		return Object.fromEntries(
			Object.entries(value).filter(([, sort]) => typeof sort === 'string' && sort in SORTS)
		) as Record<string, Sort>;
	}

	function validCardFields(value: unknown): CardField[] {
		return Array.isArray(value)
			? value.filter(
					(field): field is CardField => typeof field === 'string' && CARD_FIELDS.includes(field as CardField)
				)
			: [...DEFAULT_CARD_FIELDS];
	}

	function parseViewSettings(value: unknown): BoardViewSettings | null {
		if (!value || typeof value !== 'object') return null;
		const settings = value as Partial<BoardViewSettings>;
		return {
			assigneeFilter: validAssigneeFilter(settings.assigneeFilter),
			tagFilter: validTagFilter(settings.tagFilter),
			statusFilter: validStatusFilter(settings.statusFilter),
			priorityFilter: validPriorityFilter(settings.priorityFilter),
			sortBy: settings.sortBy && settings.sortBy in SORTS ? settings.sortBy : 'manual',
			groupBy: settings.groupBy && settings.groupBy in GROUPS ? settings.groupBy : 'main',
			columnBy: validColumnBy(settings.columnBy),
			columnSort: validColumnSort(settings.columnSort),
			cardFields: validCardFields(settings.cardFields)
		};
	}

	function currentViewSettings(): BoardViewSettings {
		return {
			assigneeFilter,
			tagFilter,
			statusFilter,
			priorityFilter,
			sortBy,
			groupBy,
			columnBy,
			columnSort: { ...columnSort },
			cardFields: [...cardFields]
		};
	}

	function applyView(settings: BoardViewSettings) {
		assigneeFilter = validAssigneeFilter(settings.assigneeFilter);
		tagFilter = validTagFilter(settings.tagFilter);
		statusFilter = validStatusFilter(settings.statusFilter);
		priorityFilter = validPriorityFilter(settings.priorityFilter);
		sortBy = settings.sortBy;
		groupBy = settings.groupBy;
		columnBy = settings.columnBy === settings.groupBy ? 'status' : settings.columnBy;
		columnSort = validColumnSort(settings.columnSort);
		cardFields = validCardFields(settings.cardFields);
	}

	function setGroupBy(value: Group) {
		groupBy = value;
		if (value === columnBy) columnBy = 'status';
	}

	function setColumnBy(value: ColumnBy) {
		columnBy = value;
		if (value === groupBy) groupBy = 'none';
	}

	function toggleCardField(field: CardField, show: boolean) {
		cardFields = show ? [...new Set([...cardFields, field])] : cardFields.filter((item) => item !== field);
	}

	const activeView = $derived(savedViews.find((view) => view.id === activeViewId));
	const viewChanged = $derived(
		!!activeView && JSON.stringify(currentViewSettings()) !== JSON.stringify(activeView.settings)
	);

	function selectView(id: string) {
		if (id === 'current') {
			activeViewId = null;
			return;
		}
		const view = savedViews.find((item) => item.id === id);
		if (!view) return;
		activeViewId = view.id;
		applyView(view.settings);
	}

	function openViewDialog(mode: 'create' | 'rename') {
		viewDialogMode = mode;
		viewName = mode === 'rename' ? (activeView?.name ?? '') : '';
		viewDialogOpen = true;
	}

	function submitView(e: SubmitEvent) {
		e.preventDefault();
		const name = viewName.trim();
		if (!name) return;
		if (viewDialogMode === 'rename' && activeView) {
			savedViews = savedViews.map((view) => (view.id === activeView.id ? { ...view, name } : view));
		} else {
			const view = { id: crypto.randomUUID(), name, settings: currentViewSettings() };
			savedViews = [...savedViews, view];
			activeViewId = view.id;
		}
		viewDialogOpen = false;
	}

	function updateActiveView() {
		if (!activeView) return;
		savedViews = savedViews.map((view) =>
			view.id === activeView.id ? { ...view, settings: currentViewSettings() } : view
		);
		toast.success(m.board_view_updated({ name: activeView.name }));
	}

	function deleteActiveView() {
		if (!activeView) return;
		savedViews = savedViews.filter((view) => view.id !== activeView.id);
		activeViewId = null;
		deleteViewOpen = false;
	}

	$effect(() => {
		const key = viewKey;
		// Nur beim Projektwechsel laden, nicht bei Änderungen an der Ansicht selbst
		untrack(() => {
			viewLoaded = false;
			expanded.clear();
			hiddenMainIds.clear();
			showGeneral = true;
			showTicketSystem = true;
			search = '';
			assigneeFilter = [];
			tagFilter = [];
			statusFilter = [];
			priorityFilter = [];
			columnBy = 'status';
			cardFields = [...DEFAULT_CARD_FIELDS];
			try {
				const v = JSON.parse(localStorage.getItem(key) ?? '{}');
				showGeneral = v.showGeneral !== false;
				showTicketSystem = v.showTicketSystem !== false;
				for (const id of Array.isArray(v.hiddenMainIds) ? v.hiddenMainIds : []) {
					if (Number.isSafeInteger(id) && id > 0) hiddenMainIds.add(id);
				}
				for (const id of Array.isArray(v.expandedTickets) ? v.expandedTickets : []) {
					if (Number.isSafeInteger(id) && id > 0) expanded.add(id);
				}
				search = typeof v.search === 'string' ? v.search : '';
				assigneeFilter = validAssigneeFilter(v.assigneeFilter);
				tagFilter = validTagFilter(v.tagFilter);
				statusFilter = validStatusFilter(v.statusFilter);
				priorityFilter = validPriorityFilter(v.priorityFilter);
				sortBy = v.sortBy in SORTS ? v.sortBy : 'manual';
				groupBy = v.groupBy in GROUPS ? v.groupBy : 'main';
				columnBy = validColumnBy(v.columnBy);
				if (columnBy === groupBy) columnBy = 'status';
				columnSort = validColumnSort(v.columnSort);
				cardFields = validCardFields(v.cardFields);
				collapsedLanes.clear();
				for (const l of Array.isArray(v.collapsed) ? v.collapsed : []) collapsedLanes.add(String(l));
			} catch {
				/* Storage may be unavailable in private browsing. */
			}
			viewLoaded = true;
		});
	});
	$effect(() => {
		const v = {
			search,
			assigneeFilter,
			tagFilter,
			statusFilter,
			priorityFilter,
			sortBy,
			groupBy,
			columnBy,
			columnSort,
			cardFields,
			collapsed: [...collapsedLanes],
			showGeneral,
			showTicketSystem,
			hiddenMainIds: [...hiddenMainIds],
			expandedTickets: [...expanded]
		};
		if (!viewLoaded) return;
		try {
			localStorage.setItem(viewKey, JSON.stringify(v));
		} catch {
			/* Storage may be unavailable in private browsing. */
		}
	});
	$effect(() => {
		const key = savedViewsKey;
		untrack(() => {
			savedViewsLoaded = false;
			savedViews = [];
			activeViewId = null;
			try {
				const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
				if (Array.isArray(stored.views)) {
					savedViews = stored.views.flatMap((view: unknown) => {
						if (!view || typeof view !== 'object') return [];
						const candidate = view as Partial<SavedBoardView>;
						const settings = parseViewSettings(candidate.settings);
						return typeof candidate.id === 'string' && typeof candidate.name === 'string' && settings
							? [{ id: candidate.id, name: candidate.name, settings }]
							: [];
					});
				}
				activeViewId = savedViews.some((view) => view.id === stored.activeViewId) ? stored.activeViewId : null;
			} catch {
				/* Storage may be unavailable in private browsing. */
			}
			savedViewsLoaded = true;
		});
	});
	$effect(() => {
		if (!savedViewsLoaded) return;
		try {
			localStorage.setItem(savedViewsKey, JSON.stringify({ activeViewId, views: savedViews }));
		} catch {
			/* Storage may be unavailable in private browsing. */
		}
	});

	const sortOf = (columnKey: string): Sort => columnSort[columnKey] ?? sortBy;

	function setColumnSort(columnKey: string, value: Sort | 'board') {
		const next = { ...columnSort };
		if (value === 'board') delete next[columnKey];
		else next[columnKey] = value;
		columnSort = next;
	}

	const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
	const time = (d: Date | string) => new Date(d).getTime();
	const manual = (a: Item, b: Item) => a.position - b.position || a.number - b.number;

	const comparators: Record<Sort, (a: Item, b: Item) => number> = {
		manual,
		created_desc: (a, b) => time(b.createdAt) - time(a.createdAt),
		created_asc: (a, b) => time(a.createdAt) - time(b.createdAt),
		updated_desc: (a, b) => time(b.updatedAt) - time(a.updatedAt),
		// Ohne Fälligkeit ans Ende
		due_asc: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || manual(a, b),
		priority_desc: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || manual(a, b),
		priority_asc: (a, b) => PRIO_RANK[b.priority] - PRIO_RANK[a.priority] || manual(a, b),
		title_asc: (a, b) => a.title.localeCompare(b.title, intlLocale()) || manual(a, b)
	};

	// Lokale Kopie, damit Drag & Drop sofort sichtbar ist
	let tickets = $state<Item[]>([]);
	$effect(() => {
		tickets = data.tickets.map((t) => ({ ...t }));
	});

	const byId = $derived(new Map(data.tickets.map((t) => [t.id, t])));
	const mainTasks = $derived(data.tickets.filter((t) => t.kind === 'main'));
	const activeFilterCount = $derived(
		[assigneeFilter, tagFilter, statusFilter, priorityFilter].filter((value) => value.length).length
	);
	const inProgressColumn = $derived(data.columns.filter((column) => !column.isBacklog && !column.isDone)[1]);
	const mainTaskState = (task: Item) =>
		task.closed ? 'done' : task.columnId === inProgressColumn?.id ? 'active' : 'open';
	const quickMainTasks = $derived(
		mainTasks.filter(
			(task) =>
				task.parentId === null || (!!me && task.columnId === inProgressColumn?.id && task.assigneeIds.includes(me))
		)
	);
	const quickMainIds = $derived(new Set(quickMainTasks.map((task) => task.id)));
	const selectedMoreMainTasks = $derived(
		mainTasks.filter((task) => !quickMainIds.has(task.id) && !hiddenMainIds.has(task.id))
	);
	const moreMainTaskGroups = $derived.by(() => {
		const remaining = mainTasks.filter((task) => !quickMainIds.has(task.id) && hiddenMainIds.has(task.id));
		const versions = data.tickets
			.filter((ticket) => ticket.kind === 'version')
			.sort(
				(a, b) =>
					(a.startDate ?? a.dueDate ?? '9999-12-31').localeCompare(b.startDate ?? b.dueDate ?? '9999-12-31') ||
					(a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
					manual(a, b)
			);
		const groups = versions
			.map((version) => ({
				key: String(version.id),
				label: version.title,
				state: mainTaskState(version),
				tasks: remaining.filter((task) => task.parentId === version.id)
			}))
			.filter((group) => group.tasks.length);
		const withoutVersion = remaining.filter((task) => !versions.some((version) => version.id === task.parentId));
		if (withoutVersion.length)
			groups.push({ key: 'none', label: m.no_version(), state: 'open', tasks: withoutVersion });
		return groups;
	});
	function newTaskParentPreset(): { parentId?: string; columnId?: number } {
		const selected = [
			...(showTicketSystem ? ['tickets'] : []),
			...(showGeneral ? ['general'] : []),
			...mainTasks.filter((task) => !hiddenMainIds.has(task.id)).map((task) => task.id)
		];
		if (selected.length === 1 && typeof selected[0] === 'number') return { parentId: String(selected[0]) };
		const backlogColumn = data.columns.find((column) => column.isBacklog);
		return backlogColumn ? { columnId: backlogColumn.id } : {};
	}
	async function ensureBacklogColumn() {
		return (
			data.columns.find((column) => column.isBacklog) ??
			(await createColumn(data.project.key, { name: 'Backlog', isBacklog: true }))
		);
	}
	async function openNewTask() {
		try {
			const preset = newTaskParentPreset();
			if (!preset.parentId) {
				const missingBacklog = !data.columns.some((column) => column.isBacklog);
				preset.columnId = (await ensureBacklogColumn()).id;
				if (missingBacklog) await refreshAll();
			}
			backlogOpen = true;
			dialog.open(preset);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
	function showMainTask(id: number, show: boolean) {
		if (show) hiddenMainIds.delete(id);
		else hiddenMainIds.add(id);
	}
	function mainParentId(t: Item) {
		const seen = new Set<number>();
		for (let id = t.parentId; id !== null && !seen.has(id);) {
			seen.add(id);
			const parent = byId.get(id);
			if (!parent) break;
			if (parent.kind === 'main') return parent.id;
			id = parent.parentId;
		}
		return null;
	}
	function belongsToTicketSystem(t: Item) {
		const seen = new Set<number>();
		let submitted = false;
		for (
			let current: Item | undefined = t;
			current && !seen.has(current.id);
			current = current.parentId === null ? undefined : byId.get(current.parentId)
		) {
			seen.add(current.id);
			if (current.boardGroup !== null) return current.boardGroup === 'tickets';
			if (current.submitted) submitted = true;
		}
		return submitted;
	}
	function isTicketSystemTask(t: Item) {
		return mainParentId(t) === null && belongsToTicketSystem(t);
	}
	function matchesCategory(t: Item) {
		if (isTicketSystemTask(t)) return showTicketSystem;
		const mainId = mainParentId(t);
		return mainId === null ? showGeneral : !hiddenMainIds.has(mainId);
	}

	/** Unteraufgaben je Elternticket, für die aufklappbare Liste auf der Karte */
	const childrenOf = $derived.by(() => {
		const m = new Map<number, Item[]>();
		for (const t of data.tickets) {
			if (t.parentId === null) continue;
			if (!m.has(t.parentId)) m.set(t.parentId, []);
			m.get(t.parentId)!.push(t);
		}
		for (const list of m.values()) list.sort((a, b) => a.number - b.number);
		return m;
	});

	function toggleSubtasks(id: number) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	function matchesAssignee(t: Item) {
		return (
			!assigneeFilter.length ||
			assigneeFilter.some((filter) =>
				filter === 'me'
					? !!me && t.assigneeIds.includes(me)
					: filter === 'none'
						? !t.assigneeIds.length
						: t.assigneeIds.includes(filter)
			)
		);
	}

	const matchingTickets = $derived(
		tickets.filter(
			(t) =>
				t.kind === 'task' &&
				matchesCategory(t) &&
				matchesAssignee(t) &&
				(!tagFilter.length || t.tags.some((g) => tagFilter.includes(String(g.id)))) &&
				(!statusFilter.length || statusFilter.includes(String(t.columnId))) &&
				(!priorityFilter.length || priorityFilter.includes(t.priority)) &&
				(!search ||
					t.title.toLowerCase().includes(search.toLowerCase()) ||
					t.key.toLowerCase().includes(search.toLowerCase()))
		)
	);
	const backlogColumnIds = $derived(
		new Set(data.columns.filter((column) => column.isBacklog).map((column) => column.id))
	);
	const visible = $derived(matchingTickets.filter((ticket) => !backlogColumnIds.has(ticket.columnId)));
	const backlogTickets = $derived(
		tickets
			.filter((ticket) => ticket.kind === 'task' && backlogColumnIds.has(ticket.columnId))
			.sort(comparators[sortBy])
	);

	/**
	 * Swimlanes: jede Bahn hat einen Schlüssel, eine Beschriftung und die Felder,
	 * die ein Ticket beim Hineinziehen bzw. Anlegen in dieser Bahn bekommt.
	 */
	type AxisItem = {
		key: string;
		label: string;
		kind: Group | 'status';
		color?: string;
		userName?: string | null;
		priority?: string;
		status?: (typeof data.columns)[number];
		canCreate?: boolean;
		accept?: (t: Item) => boolean;
		match: (t: Item) => boolean;
		preset: UpdateTicketInput;
	};

	function dimensionItems(kind: Group): AxisItem[] {
		if (kind === 'main')
			return [
				...mainTasks
					.filter((t) => !hiddenMainIds.has(t.id))
					.map((parent) => ({
						key: `main:${parent.id}`,
						label: parent.title,
						kind: 'main' as const,
						match: (t: Item) => mainParentId(t) === parent.id,
						preset: { parentId: parent.id }
					})),
				...(showTicketSystem
					? [
							{
								key: 'main:tickets',
								label: m.ticket_system(),
								kind: 'main' as const,
								canCreate: false,
								match: (t: Item) => isTicketSystemTask(t),
								preset: { parentId: null }
							}
						]
					: []),
				...(showGeneral
					? [
							{
								key: 'main:none',
								label: m.general_tickets(),
								kind: 'main' as const,
								match: (t: Item) => !isTicketSystemTask(t) && mainParentId(t) === null,
								preset: { parentId: null }
							}
						]
					: [])
			];
		if (kind === 'tag') {
			return [
				...data.tags.map((g) => ({
					key: `tag:${g.id}`,
					label: g.name,
					kind: 'tag' as const,
					color: g.color,
					match: (t: Item) => t.tags.some((x) => x.id === g.id),
					preset: { tags: [g.id] }
				})),
				{ key: 'tag:none', label: m.no_tag(), kind: 'tag', match: (t) => !t.tags.length, preset: { tags: [] } }
			];
		}
		if (kind === 'assignee') {
			const users = [...data.users].sort(
				(a, b) => Number(b.id === me) - Number(a.id === me) || a.name.localeCompare(b.name)
			);
			return [
				...users.map((u) => ({
					key: `user:${u.id}`,
					label: u.id === me ? m.me_2({ value1: u.name }) : u.name,
					kind: 'assignee' as const,
					userName: u.name,
					match: (t: Item) => t.assigneeIds.includes(u.id),
					preset: { assignees: [u.id] }
				})),
				{
					key: 'user:none',
					label: m.unassigned(),
					kind: 'assignee',
					userName: null,
					match: (t) => !t.assigneeIds.length,
					preset: { assignees: [] }
				}
			];
		}
		if (kind === 'priority') {
			return (['urgent', 'high', 'medium', 'low'] as const).map((p) => ({
				key: `prio:${p}`,
				label: PRIORITY_LABELS[p],
				kind: 'priority' as const,
				priority: p,
				match: (t: Item) => t.priority === p,
				preset: { priority: p }
			}));
		}
		return [{ key: 'all', label: '', kind: 'none', match: () => true, preset: {} }];
	}

	const lanes = $derived.by(() => dimensionItems(groupBy));
	const boardColumns = $derived.by((): AxisItem[] =>
		columnBy === 'status'
			? data.columns
					.filter((column) => !column.isBacklog)
					.map((column) => ({
						key: `status:${column.id}`,
						label: column.name,
						kind: 'status',
						status: column,
						match: (ticket: Item) => ticket.columnId === column.id,
						preset: { columnId: column.id }
					}))
			: dimensionItems(columnBy)
	);
	const statusColumns = $derived(
		data.columns.map((column) => ({
			key: `status:${column.id}`,
			label: column.name,
			kind: 'status' as const,
			status: column,
			match: (ticket: Item) => ticket.columnId === column.id,
			preset: { columnId: column.id }
		}))
	);
	const backlogStatus = $derived(statusColumns.find((column) => column.status.isBacklog));
	const ungroupedBacklogLane: AxisItem = {
		key: 'backlog',
		label: '',
		kind: 'none',
		match: () => true,
		preset: {}
	};
	function backlogLane(t: Item) {
		return lanes.find((lane) => lane.match(t)) ?? ungroupedBacklogLane;
	}
	function backlogDropLane() {
		return lanes.find((lane) => lane.key === drag?.lane) ?? ungroupedBacklogLane;
	}

	/** Tickets je Bahn und Spalte, bereits sortiert */
	const cells = $derived.by(() => {
		const m = new Map<string, Item[]>();
		for (const lane of lanes) {
			const inLane = visible.filter(lane.match);
			for (const col of boardColumns) {
				m.set(`${lane.key}|${col.key}`, inLane.filter(col.match).sort(comparators[sortOf(col.key)]));
			}
		}
		return m;
	});
	const cell = (laneKey: string, columnKey: string) => cells.get(`${laneKey}|${columnKey}`) ?? [];
	const laneCount = (lane: AxisItem) => visible.filter(lane.match).length;
	const columnCount = (column: AxisItem) => visible.filter(column.match).length;
	// Leere Bahnen ausblenden, außer es gibt gar keine Tickets
	const shownLanes = $derived(groupBy === 'none' || groupBy === 'main' ? lanes : lanes.filter((l) => laneCount(l) > 0));

	// --- Drag & Drop ---
	let drag = $state<{ id: number; lane: string; column: string } | null>(null);
	let dropTarget = $state<{ lane: string; column: string; index: number } | null>(null);

	function onDragStart(e: DragEvent, t: Item, lane: string, column: string) {
		if (!data.canEdit) return;
		drag = { id: t.id, lane, column };
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', String(t.id));
	}

	/** Die ganze Spalte ist Ablagefläche, auch der freie Platz unter den Karten */
	function onDragOver(e: DragEvent, lane: string, column: string, zone: HTMLElement) {
		if (!drag) return;
		const targetLane =
			lanes.find((item) => item.key === lane) ?? (lane === ungroupedBacklogLane.key ? ungroupedBacklogLane : undefined);
		const targetColumn =
			boardColumns.find((item) => item.key === column) ?? statusColumns.find((item) => item.key === column);
		const dragged = tickets.find((ticket) => ticket.id === drag!.id);
		if (
			!targetLane ||
			!targetColumn ||
			!dragged ||
			(targetLane.accept && !targetLane.accept(dragged)) ||
			(targetColumn.accept && !targetColumn.accept(dragged))
		) {
			dropTarget = null;
			return;
		}
		e.preventDefault();
		const cards = [...zone.querySelectorAll<HTMLElement>('[data-card]')].filter(
			(c) => Number(c.dataset.card) !== drag!.id
		);
		let index = cards.length;
		for (let i = 0; i < cards.length; i++) {
			const r = cards[i].getBoundingClientRect();
			if (e.clientY < r.top + r.height / 2) {
				index = i;
				break;
			}
		}
		dropTarget = { lane, column, index };
	}

	/** Felder, die sich beim Wechsel der Bahn ändern */
	function axisChange(t: Item, from: AxisItem, to: AxisItem): UpdateTicketInput {
		if (from.key === to.key) return {};
		if (to.key === 'main:none') return { ...to.preset, boardGroup: 'general' };
		if (to.key === 'main:tickets') return { ...to.preset, boardGroup: 'tickets' };
		if (to.kind === 'tag') {
			// Tag der alten Bahn durch den der neuen ersetzen, andere Tags bleiben
			if (!(to.preset.tags as number[]).length) return { tags: [] };
			const fromTag = (from.preset.tags as number[] | undefined)?.[0];
			const ids = t.tags.map((g) => g.id).filter((id) => id !== fromTag);
			return { tags: [...new Set([...ids, ...(to.preset.tags as number[])])] };
		}
		if (to.kind === 'assignee') {
			// Wie bei Tags: Person der alten Bahn durch die der neuen ersetzen, weitere Zuständige bleiben
			if (!(to.preset.assignees as string[]).length) return { assignees: [] };
			const fromUser = (from.preset.assignees as string[] | undefined)?.[0];
			const ids = t.assigneeIds.filter((id) => id !== fromUser);
			return { assignees: [...new Set([...ids, ...(to.preset.assignees as string[])])] };
		}
		return to.preset;
	}

	async function onDrop(e: DragEvent) {
		e.preventDefault();
		if (!drag || !dropTarget) return;
		const { id, lane: fromLane, column: fromColumn } = drag;
		const { lane: toLane, column: toColumn, index } = dropTarget;
		drag = null;
		dropTarget = null;

		const moved = tickets.find((t) => t.id === id)!;
		const from = lanes.find((l) => l.key === fromLane) ?? ungroupedBacklogLane;
		const to = lanes.find((l) => l.key === toLane) ?? ungroupedBacklogLane;
		const fromCol =
			statusColumns.find((column) => column.key === fromColumn) ??
			boardColumns.find((column) => column.key === fromColumn)!;
		const toCol =
			boardColumns.find((column) => column.key === toColumn) ??
			statusColumns.find((column) => column.key === toColumn)!;
		const body: UpdateTicketInput = { ...axisChange(moved, from, to), ...axisChange(moved, fromCol, toCol) };
		if (!toCol.status && backlogColumnIds.has(moved.columnId)) {
			const defaultColumn = data.columns.find((column) => !column.isBacklog && !column.isDone);
			if (defaultColumn) body.columnId = defaultColumn.id;
		}
		const shown = cell(toLane, toColumn).filter((t) => t.id !== id);
		const anchor = shown[index];
		const wasClosed = moved.closed;
		const sort = sortOf(toColumn);
		// Sortierte Spalte: Landet die Karte dort, wo die Sortierung sie ohnehin einordnet, bleibt es dabei.
		// Sonst übernimmt die Spalte die gezeigte Reihenfolge als eigene und wechselt auf „Manuell“.
		const natural = [...shown, moved].sort(comparators[sort]).indexOf(moved);
		const reorder = columnBy === 'status' && sort !== 'manual' && natural !== index;
		const statusColumnId = toCol.status?.id;

		if (columnBy === 'status' && sort === 'manual' && statusColumnId) {
			// Position bezieht sich auf alle Tickets der Spalte, nicht nur die sichtbaren
			const col = tickets.filter((t) => t.columnId === statusColumnId && t.id !== id).sort(manual);
			const position = anchor ? col.indexOf(anchor) : col.length;
			col.splice(position, 0, moved);
			col.forEach((t, i) => (t.position = i));
			body.columnId = statusColumnId;
			body.position = position;
		}

		let order: number[] = [];
		if (reorder) {
			// Ganze Spalte in der bisher gezeigten Sortierung, die Karte an der Ablagestelle
			const col = tickets.filter((t) => t.columnId === statusColumnId && t.id !== id).sort(comparators[sort]);
			const last = shown.at(-1);
			const position = anchor ? col.indexOf(anchor) : last ? col.indexOf(last) + 1 : col.length;
			col.splice(position, 0, moved);
			col.forEach((t, i) => (t.position = i));
			order = col.map((t) => t.id);
			setColumnSort(toColumn, 'manual');
		}
		if (!Object.keys(body).length && !reorder) return;
		if (body.columnId) moved.columnId = body.columnId;

		try {
			const updated = Object.keys(body).length ? await updateTicket(id, body) : null;
			if (reorder) {
				await reorderTickets(data.project.key, { column: statusColumnId!, tickets: order });
				const name = toCol.label;
				toast.info(m.column_order_manual({ column: name }));
			}
			if (updated) playIfCompleted(wasClosed, updated);
		} catch (err) {
			toast.error((err as Error).message);
		}
		await refreshAll();
	}

	function onDragEnd() {
		drag = null;
		dropTarget = null;
	}

	function onBacklogDragOver(e: DragEvent, zone: HTMLElement) {
		if (drag && !backlogStatus) {
			e.preventDefault();
			dropTarget = { lane: backlogDropLane().key, column: 'backlog', index: 0 };
			return;
		}
		const lane = backlogDropLane();
		if (backlogStatus && lane) onDragOver(e, lane.key, backlogStatus.key, zone);
	}

	async function onBacklogDrop(e: DragEvent) {
		if (backlogStatus) return onDrop(e);
		e.preventDefault();
		const id = drag?.id;
		drag = null;
		dropTarget = null;
		if (!id) return;
		try {
			const column = await ensureBacklogColumn();
			await updateTicket(id, { columnId: column.id });
		} catch (err) {
			toast.error((err as Error).message);
		}
		await refreshAll();
	}

	async function moveTicket(t: Item, columnId: number) {
		try {
			playIfCompleted(t.closed, await updateTicket(t.id, { columnId }));
		} catch (err) {
			toast.error((err as Error).message);
		}
		await refreshAll();
	}

	async function toggleTicketStatus(t: Item) {
		try {
			playIfCompleted(t.closed, await (t.closed ? reopenTicket(t.id) : closeTicket(t.id)));
		} catch (err) {
			toast.error((err as Error).message);
		}
		await refreshAll();
	}

	async function assign(t: Item, ids: string[]) {
		const people = ids.map((id) => ({
			id,
			name: data.users.find((u) => u.id === id)?.name ?? t.assignees.find((a) => a.id === id)?.name ?? ''
		}));
		const names = people.map((p) => p.name);
		t.assigneeIds = ids;
		t.assigneeId = ids[0] ?? null;
		t.assignees = people;
		try {
			await updateTicket(t.id, { assignees: ids });
			toast.success(
				ids.length ? m.assigned_to({ value1: t.title, value2: names.join(', ') }) : m.unassigned_2({ value1: t.title })
			);
		} catch (err) {
			toast.error((err as Error).message);
		}
		await refreshAll();
	}

	// --- Schnell-Anlegen (übernimmt die Werte der Bahn, z.B. den Tag) ---
	let quickCell = $state<string | null>(null);
	let quickTitle = $state('');

	async function quickAdd(e: SubmitEvent, lane: AxisItem, column: AxisItem) {
		e.preventDefault();
		if (!quickTitle.trim()) return;
		try {
			const defaultColumn = data.columns.find((item) => !item.isBacklog && !item.isDone) ?? data.columns[0];
			if (!defaultColumn) return;
			const parentPreset = newTaskParentPreset();
			await createTicket(data.project.key, {
				...(parentPreset.parentId ? { parentId: Number(parentPreset.parentId) } : {}),
				...lane.preset,
				...column.preset,
				title: quickTitle,
				kind: 'task',
				columnId: column.status?.id ?? defaultColumn.id
			});
			quickTitle = '';
			await refreshAll();
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function toggleLane(key: string) {
		if (collapsedLanes.has(key)) collapsedLanes.delete(key);
		else collapsedLanes.add(key);
	}
</script>

{#snippet columnHeader(col: AxisItem, lane: AxisItem | null)}
	{@const sort = sortOf(col.key)}
	<header class="flex items-center gap-1.5 py-1 pr-1 pl-2 text-sm">
		{#if col.status?.isDone}<CircleCheck class="text-success size-4" />{/if}
		<strong class="font-semibold">{col.label}</strong>
		<span class="text-muted-foreground text-xs font-medium">{columnCount(col)}</span>
		<span class="grow"></span>
		<DropdownMenu.Root>
			<Hint text={m.sort_column({ value1: SORTS[sort] })}>
				{#snippet children(props)}
					<DropdownMenu.Trigger
						{...props}
						class={cn(
							'hover:bg-muted text-muted-foreground hover:text-foreground flex h-6 items-center gap-1 rounded-md px-1.5 text-xs',
							columnSort[col.key] && 'text-primary bg-primary/10'
						)}
						aria-label={m.sort_column_2({ value1: col.label })}
					>
						<ArrowDownUp class="size-3.5" />
						{#if columnSort[col.key]}<span class="max-w-20 truncate">{SORTS[sort]}</span>{/if}
					</DropdownMenu.Trigger>
				{/snippet}
			</Hint>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Label>{m.sort_column_3({ value1: col.label })}</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={columnSort[col.key] ?? 'board'}
					onValueChange={(v) => setColumnSort(col.key, v as Sort | 'board')}
				>
					<DropdownMenu.RadioItem value="board">{m.same_as_board({ value1: SORTS[sortBy] })}</DropdownMenu.RadioItem>
					<DropdownMenu.Separator />
					{#each Object.entries(SORTS) as [v, l] (v)}
						<DropdownMenu.RadioItem value={v}>{l}</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		{#if lane && data.canEdit && lane.canCreate !== false && col.canCreate !== false}
			<Hint text={m.add_ticket()}>
				{#snippet children(props)}
					<Button
						{...props}
						variant="ghost"
						size="icon-xs"
						aria-label={m.add_ticket()}
						onclick={() => ((quickCell = `${lane.key}|${col.key}`), (quickTitle = ''))}
					>
						<Plus />
					</Button>
				{/snippet}
			</Hint>
		{/if}
	</header>
{/snippet}

{#snippet columnCell(lane: AxisItem, col: AxisItem, grouped: boolean)}
	{@const list = cell(lane.key, col.key)}
	{@const target = dropTarget?.lane === lane.key && dropTarget.column === col.key}
	{@const cellKey = `${lane.key}|${col.key}`}
	<section
		class={cn(
			'bg-muted/60 dark:bg-card/50 flex w-72 shrink-0 flex-col gap-1.5 rounded-xl p-1.5 transition-shadow',
			!grouped && 'max-h-[calc(100vh-210px)]',
			target && 'ring-primary/30 ring-2'
		)}
		style={col.kind === 'tag' && col.color
			? `background: color-mix(in srgb, ${col.color} 12%, transparent)`
			: undefined}
		role="group"
		data-dropzone
		ondragover={(e) => onDragOver(e, lane.key, col.key, e.currentTarget as HTMLElement)}
		ondrop={onDrop}
	>
		{#if !grouped}{@render columnHeader(col, lane)}{/if}
		<div
			class={cn('flex flex-col gap-1.5', list.length && 'min-h-10', !grouped && 'scrollbar-soft overflow-y-auto')}
			use:scrollActivity
			role="region"
			aria-label={grouped ? `${lane.label}: ${col.label}` : col.label}
		>
			{#each list as t, i (t.id)}
				{#if target && dropTarget!.index === i && drag?.id !== t.id}
					<div class="bg-primary h-0.5 rounded-full"></div>
				{/if}
				<BoardCard
					readOnly={!data.canEdit}
					{t}
					inTicketSystem={isTicketSystemTask(t)}
					parent={t.parentId ? byId.get(t.parentId) : undefined}
					subtasks={childrenOf.get(t.id) ?? []}
					users={data.users}
					{me}
					expanded={expanded.has(t.id)}
					dragging={drag?.id === t.id}
					onToggleSubtasks={() => toggleSubtasks(t.id)}
					onToggleStatus={() => toggleTicketStatus(t)}
					onAssign={(id) => assign(t, id)}
					columns={data.columns}
					fields={cardFields}
					showMove={columnBy === 'status'}
					onMove={(id) => moveTicket(t, id)}
					ondragstart={(e) => onDragStart(e, t, lane.key, col.key)}
					ondragend={onDragEnd}
				/>
			{/each}
			{#if target && dropTarget!.index >= list.filter((t) => t.id !== drag?.id).length}
				<div class="bg-primary h-0.5 rounded-full"></div>
			{/if}
		</div>
		{#if quickCell === cellKey}
			<form onsubmit={(e) => quickAdd(e, lane, col)}>
				<!-- svelte-ignore a11y_autofocus -->
				<Input
					autofocus
					class="bg-card"
					placeholder={m.title_enter_to_create()}
					bind:value={quickTitle}
					onblur={() => !quickTitle && (quickCell = null)}
					onkeydown={(e) => e.key === 'Escape' && (quickCell = null)}
				/>
			</form>
		{:else if data.canEdit && lane.canCreate !== false && col.canCreate !== false}
			<Button
				variant="ghost"
				size="sm"
				class={cn(
					'text-muted-foreground justify-start',
					grouped && 'opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100'
				)}
				onclick={() => ((quickCell = cellKey), (quickTitle = ''))}
			>
				<Plus />
				{m.add_ticket()}
			</Button>
		{/if}
	</section>
{/snippet}

{#snippet backlogColumn()}
	{#if backlogOpen}
		<section
			class={cn(
				'bg-muted/60 dark:bg-card/50 flex w-72 shrink-0 flex-col gap-1.5 rounded-xl p-1.5 transition-shadow',
				dropTarget?.column === (backlogStatus?.key ?? 'backlog') && 'ring-primary/30 ring-2'
			)}
			role="group"
			data-dropzone
			aria-label={m.backlog()}
			ondragover={(event) => onBacklogDragOver(event, event.currentTarget as HTMLElement)}
			ondrop={onBacklogDrop}
		>
			<header class="flex items-center gap-1.5 px-2 py-1 text-sm">
				<strong class="font-semibold">{m.backlog()}</strong>
				<span class="text-muted-foreground text-xs font-medium">{backlogTickets.length}</span>
			</header>
			<div class="scrollbar-soft flex max-h-[calc(100vh-250px)] flex-col gap-1.5 overflow-y-auto">
				{#each backlogTickets as t (t.id)}
					{@const lane = backlogLane(t)}
					<BoardCard
						readOnly={!data.canEdit}
						{t}
						inTicketSystem={isTicketSystemTask(t)}
						parent={t.parentId ? byId.get(t.parentId) : undefined}
						subtasks={childrenOf.get(t.id) ?? []}
						users={data.users}
						{me}
						expanded={expanded.has(t.id)}
						dragging={drag?.id === t.id}
						onToggleSubtasks={() => toggleSubtasks(t.id)}
						onToggleStatus={() => toggleTicketStatus(t)}
						onAssign={(id) => assign(t, id)}
						columns={data.columns}
						fields={cardFields}
						showMove={true}
						onMove={(id) => moveTicket(t, id)}
						ondragstart={(event) => onDragStart(event, t, lane.key, `status:${t.columnId}`)}
						ondragend={onDragEnd}
					/>
				{:else}
					<p class="text-muted-foreground px-2 py-3 text-sm">{m.no_tickets_match_these_filters()}</p>
				{/each}
			</div>
		</section>
	{/if}
{/snippet}

{#if !data.canEdit}<p class="text-muted-foreground px-5 pt-3 text-sm">{m.um_read_only()}</p>{/if}
<div class="flex flex-wrap items-center gap-2 px-5 py-3.5">
	<Popover.Root>
		<Popover.Trigger
			class="border-border bg-background hover:bg-muted focus-visible:ring-ring/50 flex h-11 min-w-72 flex-1 items-center gap-3 rounded-lg border px-3 text-left shadow-xs outline-none focus-visible:ring-3 max-sm:w-full"
		>
			<Eye class="text-muted-foreground size-4 shrink-0" />
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm font-semibold">
					{activeView?.name ?? m.current_board_settings()}{#if viewChanged}
						· {m.changed()}{/if}
				</span>
				<span class="text-muted-foreground block truncate text-xs">
					{m.filters_active({ count: activeFilterCount })} · {GROUPS[groupBy]} / {COLUMNS[columnBy]} · {SORTS[sortBy]}
				</span>
			</span>
			<ChevronDown class="text-muted-foreground size-4 shrink-0" />
		</Popover.Trigger>
		<Popover.Content
			align="center"
			class="max-h-[calc(100vh-2rem)] w-[min(44rem,calc(100vw-2.5rem))] gap-0 overflow-y-auto p-0"
		>
			<div class="border-b p-4">
				<Popover.Title>{m.board_views()}</Popover.Title>
				<Popover.Description>{m.board_view_description()}</Popover.Description>
			</div>
			<div class="flex flex-wrap items-center gap-2 border-b p-4">
				<Select.Root
					type="single"
					value={activeViewId ?? 'current'}
					onValueChange={(value) => selectView(value ?? 'current')}
				>
					<Select.Trigger class="min-w-48 flex-1">
						<span class="truncate">{activeView?.name ?? m.current_board_settings()}</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="current">{m.current_board_settings()}</Select.Item>
						{#if savedViews.length}<Select.Separator />{/if}
						{#each savedViews as view (view.id)}
							<Select.Item value={view.id}>{view.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<Button variant="outline" size="sm" onclick={() => openViewDialog('create')}><Plus /> {m.save_as_view()}</Button
				>
				{#if activeView}
					<Button variant="outline" size="sm" disabled={!viewChanged} onclick={updateActiveView}>
						<Save />
						{m.update_view()}
					</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="border-border bg-background hover:bg-muted focus-visible:ring-ring/50 inline-flex size-8 items-center justify-center rounded-md border outline-none focus-visible:ring-3"
							aria-label={m.manage_view()}
						>
							<Ellipsis />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => openViewDialog('rename')}
								><Pencil /> {m.rename_view()}</DropdownMenu.Item
							>
							<DropdownMenu.Item variant="destructive" onclick={() => (deleteViewOpen = true)}>
								<Trash2 />
								{m.delete_view()}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			</div>
			<div class="p-4">
				<h2 class="mb-3 text-sm font-semibold">{m.filters()}</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-assignee">{m.assignee()}</label>
						<Select.Root type="multiple" bind:value={assigneeFilter}>
							<Select.Trigger id="board-view-assignee" class="w-full">
								<span class="flex items-center gap-2"><UserRound class="text-muted-foreground" />{filterLabel}</span>
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="me">{m.assigned_to_me()}</Select.Item>
								<Select.Item value="none">{m.unassigned()}</Select.Item>
								<Select.Separator />
								{#each data.users as u (u.id)}
									<Select.Item value={u.id}>{u.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-status-filter">{m.status()}</label>
						<Select.Root type="multiple" bind:value={statusFilter}>
							<Select.Trigger id="board-view-status-filter" class="w-full">
								<span class="truncate">{statusFilterLabel}</span>
							</Select.Trigger>
							<Select.Content>
								{#each data.columns as column (column.id)}
									<Select.Item value={String(column.id)}>{column.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-priority-filter">{m.priority_2()}</label>
						<Select.Root type="multiple" bind:value={priorityFilter}>
							<Select.Trigger id="board-view-priority-filter" class="w-full">
								<span class="truncate">{priorityFilterLabel}</span>
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(PRIORITY_LABELS) as [priority, label] (priority)}
									<Select.Item value={priority}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-tag">{m.tags()}</label>
						<Select.Root type="multiple" bind:value={tagFilter}>
							<Select.Trigger id="board-view-tag" class="w-full">
								<span class="flex items-center gap-2 truncate"
									><TagIcon class="text-muted-foreground" />{tagFilterLabel}</span
								>
							</Select.Trigger>
							<Select.Content>
								{#each data.tags as g (g.id)}
									<Select.Item value={String(g.id)}><TagBadge name={g.name} color={g.color} /></Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>
			</div>
			<div class="border-t p-4">
				<h2 class="mb-3 text-sm font-semibold">{m.appearance()}</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-group">{m.group()}</label>
						<Select.Root type="single" value={groupBy} onValueChange={(v) => setGroupBy(v as Group)}>
							<Select.Trigger id="board-view-group" class="w-full">
								<span class="flex items-center gap-2"><Rows3 class="text-muted-foreground" />{GROUPS[groupBy]}</span>
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(GROUPS) as [v, l] (v)}<Select.Item value={v}>{l}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-columns">{m.columns()}</label>
						<Select.Root type="single" value={columnBy} onValueChange={(v) => setColumnBy(v as ColumnBy)}>
							<Select.Trigger id="board-view-columns" class="w-full">
								<span class="flex items-center gap-2">{COLUMNS[columnBy]}</span>
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(COLUMNS) as [v, l] (v)}
									<Select.Item value={v} disabled={v === groupBy}>{l}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="board-view-sort">{m.sort()}</label>
						<Select.Root type="single" value={sortBy} onValueChange={(v) => (sortBy = v as Sort)}>
							<Select.Trigger id="board-view-sort" class="w-full">
								<span class="flex items-center gap-2"><ArrowDownUp class="text-muted-foreground" />{SORTS[sortBy]}</span
								>
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(SORTS) as [v, l] (v)}<Select.Item value={v}>{l}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<span class="text-sm font-medium">{m.card_properties()}</span>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="border-input bg-background hover:bg-muted focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none focus-visible:ring-3"
							>
								<span>{m.properties_selected({ count: cardFields.length })}</span>
								<ChevronDown class="text-muted-foreground size-4" />
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="w-56">
								{#each CARD_FIELDS as field (field)}
									<DropdownMenu.CheckboxItem
										checked={cardFields.includes(field)}
										onCheckedChange={(show) => toggleCardField(field, show)}
									>
										{CARD_FIELD_LABELS[field]}
									</DropdownMenu.CheckboxItem>
								{/each}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</div>
			</div>
		</Popover.Content>
	</Popover.Root>
	<Button disabled={!data.canEdit} onclick={openNewTask}><Plus /> {m.ticket()}</Button>
</div>

<div class="flex max-w-full flex-wrap items-center gap-1.5 px-5 pb-3">
	<div class="mr-2 border-r border-border pr-3">
		<button
			type="button"
			aria-expanded={backlogOpen}
			class="border-border hover:bg-accent focus-visible:ring-ring/50 inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-3"
			onclick={() => (backlogOpen = !backlogOpen)}
		>
			<ChevronRight class={cn('size-3 transition-transform', backlogOpen && 'rotate-90')} />
			{m.backlog()} <span class="text-muted-foreground">({backlogTickets.length})</span>
		</button>
	</div>
	<div class="flex max-w-full flex-wrap items-center gap-1.5" role="group" aria-label={m.board_categories()}>
		<span class="text-muted-foreground mr-1 text-xs font-medium">{m.visible_main_groups()}</span>
		<button
			type="button"
			aria-pressed={showTicketSystem}
			class={cn(
				'focus-visible:ring-ring/50 inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3',
				showTicketSystem ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
			)}
			onclick={() => (showTicketSystem = !showTicketSystem)}
		>
			{m.ticket_system()}
		</button>
		<button
			type="button"
			aria-pressed={showGeneral}
			class={cn(
				'focus-visible:ring-ring/50 inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3',
				showGeneral ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
			)}
			onclick={() => (showGeneral = !showGeneral)}
		>
			{m.general_tickets()}
		</button>
		{#each quickMainTasks as task (task.id)}
			<button
				type="button"
				aria-pressed={!hiddenMainIds.has(task.id)}
				class={cn(
					'focus-visible:ring-ring/50 inline-flex h-7 max-w-48 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3',
					!hiddenMainIds.has(task.id)
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border hover:bg-accent'
				)}
				onclick={() => showMainTask(task.id, hiddenMainIds.has(task.id))}
			>
				<span
					class={cn(
						'truncate',
						mainTaskState(task) === 'active' && 'font-bold',
						mainTaskState(task) === 'done' && 'line-through opacity-70'
					)}>{task.title}</span
				>
			</button>
		{/each}
		{#each selectedMoreMainTasks as task (task.id)}
			<button
				type="button"
				aria-pressed="true"
				class="border-primary bg-primary text-primary-foreground focus-visible:ring-ring/50 inline-flex h-7 max-w-48 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
				onclick={() => showMainTask(task.id, false)}
			>
				<span
					class={cn(
						'truncate',
						mainTaskState(task) === 'active' && 'font-bold',
						mainTaskState(task) === 'done' && 'line-through opacity-70'
					)}>{task.title}</span
				>
			</button>
		{/each}
		{#if moreMainTaskGroups.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="border-border hover:bg-accent focus-visible:ring-ring/50 inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-3"
				>
					{m.more_main_tasks()}
					<ChevronDown class="size-3" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="max-h-80 w-72 overflow-y-auto">
					{#each moreMainTaskGroups as group, index (group.key)}
						{#if index}<DropdownMenu.Separator />{/if}
						<DropdownMenu.Label
							class={cn(
								'truncate',
								group.state === 'active' && 'text-primary font-semibold',
								group.state === 'done' && 'text-muted-foreground line-through'
							)}>{group.label}</DropdownMenu.Label
						>
						{#each group.tasks as task (task.id)}
							<DropdownMenu.CheckboxItem
								checked={!hiddenMainIds.has(task.id)}
								onCheckedChange={(show) => showMainTask(task.id, show)}
							>
								<span
									class={cn(
										'truncate',
										mainTaskState(task) === 'active' && 'text-primary font-semibold',
										mainTaskState(task) === 'done' && 'text-muted-foreground line-through'
									)}>{task.title}</span
								>
							</DropdownMenu.CheckboxItem>
						{/each}
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
	<span class="grow"></span>
	<InputGroup.Root class="ml-2 w-60 max-sm:ml-0 max-sm:w-full">
		<InputGroup.Addon><Search /></InputGroup.Addon>
		<InputGroup.Input placeholder={m.search_tickets()} bind:value={search} />
	</InputGroup.Root>
</div>

{#if groupBy === 'none'}
	<div
		class="scrollbar-soft flex min-h-[calc(100vh-200px)] items-stretch gap-3.5 overflow-x-auto px-5 pb-5"
		use:scrollActivity
	>
		{@render backlogColumn()}
		{#each boardColumns as col (col.key)}
			{@render columnCell(lanes[0], col, false)}
		{/each}
	</div>
{:else}
	<div class="flex items-start gap-3.5 px-5 pb-5">
		{@render backlogColumn()}
		<div class="scrollbar-soft min-w-0 grow overflow-x-auto" use:scrollActivity>
			<div class="flex w-max min-w-full flex-col gap-2">
				<!-- Spaltenköpfe einmal oben, beim Scrollen sichtbar -->
				<div class="bg-background sticky top-0 z-10 flex gap-3.5 pb-1">
					{#each boardColumns as col (col.key)}
						<div class="w-72 shrink-0">{@render columnHeader(col, null)}</div>
					{/each}
				</div>
				{#each shownLanes as lane (lane.key)}
					{@const open = !collapsedLanes.has(lane.key)}
					<div class="group/lane flex flex-col gap-1.5">
						<Button
							variant="ghost"
							size="sm"
							class="sticky left-0 w-fit gap-2 font-semibold"
							aria-expanded={open}
							onclick={() => toggleLane(lane.key)}
						>
							<ChevronRight class={cn('text-muted-foreground size-4 transition-transform', open && 'rotate-90')} />
							{#if lane.kind === 'tag' && lane.color}
								<TagBadge name={lane.label} color={lane.color} />
							{:else if lane.kind === 'assignee'}
								<UserAvatar name={lane.userName} size="sm" />{lane.label}
							{:else if lane.kind === 'priority'}
								<span class="prio prio-{lane.priority}"></span>{lane.label}
							{:else}
								<span class="text-muted-foreground">{lane.label}</span>
							{/if}
							<span class="text-muted-foreground text-xs font-medium">{laneCount(lane)}</span>
						</Button>
						{#if open}
							<div class="flex items-stretch gap-3.5 border-b pb-3">
								{#each boardColumns as col (col.key)}
									{@render columnCell(lane, col, true)}
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-muted-foreground px-2 py-6 text-sm">{m.no_tickets_match_these_filters()}</p>
				{/each}
			</div>
		</div>
	</div>
{/if}

<Dialog.Root bind:open={viewDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submitView}>
			<Dialog.Header>
				<Dialog.Title>{viewDialogMode === 'rename' ? m.rename_view() : m.save_board_view()}</Dialog.Title>
				<Dialog.Description>{m.board_view_description()}</Dialog.Description>
			</Dialog.Header>
			<div class="py-5">
				<label for="board-view-name" class="mb-2 block text-sm font-medium">{m.name()}</label>
				<Input id="board-view-name" bind:value={viewName} maxlength={80} required autofocus />
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (viewDialogOpen = false)}>{m.cancel()}</Button>
				<Button type="submit" disabled={!viewName.trim()}>{m.save()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={deleteViewOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.delete_board_view()}</AlertDialog.Title>
			<AlertDialog.Description
				>{m.delete_board_view_description({ name: activeView?.name ?? '' })}</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={deleteActiveView}>{m.delete()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<TicketDialog
	bind:this={dialog}
	projectKey={data.project.key}
	users={data.users}
	tags={data.tags}
	parents={data.tickets.filter((t) => t.kind !== 'task').map((t) => ({ id: t.id, label: t.title, kind: t.kind }))}
	canCreate={data.canEdit}
	preset={newTaskParentPreset}
/>
