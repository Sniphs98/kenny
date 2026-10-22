<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { PRIORITY_LABELS } from '#lib/api.js';
	import { INTAKE_MAX_FILES, PRIORITIES, intakeSubmissionSchema, type IntakeFieldMode } from '#lib/contracts/index.js';
	import { localizeError } from '#lib/i18n.js';
	import { EMBED_RESIZE_MESSAGE } from '#lib/embed.js';
	import { accentStyle, accentVars } from '#lib/theme.js';
	import { m } from '#lib/paraglide/messages.js';
	import { rememberTicketStatus } from '#lib/ticket-status-storage.js';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import FileDrop from '#lib/components/FileDrop.svelte';
	import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
	import TagBadge from '#lib/components/TagBadge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Toggle } from '#lib/components/ui/toggle/index.js';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Inbox from '@lucide/svelte/icons/inbox';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const intake = $derived(data.intake);
	const fields = $derived(intake.fields);
	const enableDesign = $derived(intake.design === 'enable');
	const chooseProject = $derived(intake.projects.length > 1);
	const showEmail = $derived(!data.signedInAs && intake.emailMode !== 'hidden');
	const systems = $derived(intake.systems.find((entry) => entry.key === project?.key)?.systems ?? []);

	/** Schlüssel des eingereichten Tickets; '' bei erfolgreicher Einreichung ohne Schlüssel, null = Formular zeigen */
	let submitted = $state<string | null>(null);
	let submittedPath = $state<string | null>(null);
	let inlineImages = $state<{ file: File; url: string }[]>([]);
	let inlineInput: HTMLInputElement;

	function clearInlineImages() {
		for (const image of inlineImages) URL.revokeObjectURL(image.url);
		inlineImages = [];
	}

	onDestroy(clearInlineImages);

	function addInlineImage(blob: Blob) {
		if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(blob.type)) {
			toast.error(m.unsupported_image_format());
			return null;
		}
		if (inlineImages.length >= INTAKE_MAX_FILES) {
			toast.error(m.at_most_files({ count: String(INTAKE_MAX_FILES) }));
			return null;
		}
		const file = new File([blob], `image-${inlineImages.length + 1}.${blob.type.split('/')[1]}`, { type: blob.type });
		const url = URL.createObjectURL(file);
		inlineImages = [...inlineImages, { file, url }];
		const transfer = new DataTransfer();
		for (const image of inlineImages) transfer.items.add(image.file);
		inlineInput.files = transfer.files;
		return { url, name: file.name };
	}

	const { form, errors, message, enhance, submitting } = superForm(
		untrack(() => data.form),
		{
			validationMethod: 'onsubmit',
			validators: zod4Client(intakeSubmissionSchema),
			onResult: ({ result }) => {
				if (result.type === 'success') {
					const key = String(result.data?.submitted ?? '');
					const statusTicket = result.data?.statusTicket;
					const statusPath = typeof statusTicket?.path === 'string' ? statusTicket.path : null;
					if (key && statusPath)
						rememberTicketStatus({
							key,
							title: $form.title,
							path: statusPath,
							status: typeof statusTicket.status === 'string' ? statusTicket.status : undefined,
							closed: statusTicket.closed === true,
							updatedAt: typeof statusTicket.updatedAt === 'number' ? statusTicket.updatedAt : undefined,
							projectName: typeof statusTicket.projectName === 'string' ? statusTicket.projectName : undefined,
							projectColor: typeof statusTicket.projectColor === 'string' ? statusTicket.projectColor : undefined
						});
					clearInlineImages();
					submitted = key;
					submittedPath = statusPath;
				}
			}
		}
	);

	const project = $derived(chooseProject ? intake.projects.find((p) => p.key === $form.project) : intake.projects[0]);
	/** Tags des gewählten Projekts; beim Projektwechsel gelten nur noch dessen Tags */
	const availableTags = $derived(project?.tags ?? []);
	$effect(() => {
		const names = availableTags.map((t) => t.name);
		untrack(() => {
			if ($form.tags.some((t) => !names.includes(t))) $form.tags = $form.tags.filter((t) => names.includes(t));
			if ($form.system && !systems.includes($form.system)) $form.system = '';
		});
	});

	// Farbe des (gewählten) Projekts als Primärfarbe; <html> für Auswahllisten, die in <body> gerendert werden
	const accent = $derived(project?.color);
	$effect(() => {
		const root = document.documentElement;
		const vars = accentVars(accent);
		for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
		return () => Object.keys(vars).forEach((k) => root.style.removeProperty(k));
	});

	/** Eingebettet per iframe (?embed): ohne Seitenhintergrund, Höhe an die einbettende Seite melden */
	const embedded = $derived(page.url.searchParams.has('embed'));
	let root = $state<HTMLElement>();
	$effect(() => {
		if (!embedded || !root || window.parent === window) return;
		const el = root;
		const post = () =>
			window.parent.postMessage({ type: EMBED_RESIZE_MESSAGE, height: Math.ceil(el.offsetHeight) }, '*');
		const observer = new ResizeObserver(post);
		observer.observe(el);
		return () => observer.disconnect();
	});

	function toggleTag(name: string, on: boolean) {
		$form.tags = on ? [...$form.tags, name] : $form.tags.filter((t) => t !== name);
	}
</script>

<!-- Beschriftung mit Hinweis „optional“ bzw. Pflicht-Sternchen -->
{#snippet fieldLabel(text: string, mode: IntakeFieldMode, id?: string)}
	<Label for={id}>
		{text}{#if mode === 'required'}<span class="text-destructive" aria-hidden="true">*</span>{:else}<span
				class="text-muted-foreground font-normal">{m.optional_suffix()}</span
			>{/if}
	</Label>
{/snippet}

<svelte:head><title>{intake.name} · Kenny</title></svelte:head>

<!-- Drei Zeilen: Kopf über der Karte, die Karte selbst sitzt in der Bildschirmmitte.
     Eingebettet: nur Titel und Karte, so hoch wie der Inhalt. -->
<div
	bind:this={root}
	class={embedded
		? 'grid justify-items-center p-1'
		: 'grid min-h-screen grid-rows-[1fr_auto_1fr] justify-items-center bg-background bg-[radial-gradient(circle_at_50%_0%,var(--primary-soft),transparent_60%)] p-4'}
	style={accentStyle(accent)}
	data-embedded={embedded || undefined}
	data-design={intake.design}
>
	<div class="contents">
		{#if embedded}
			<h1 class="mb-3 w-full max-w-lg text-lg font-semibold tracking-tight">{intake.name}</h1>
		{:else}
			<div class="mb-6 flex w-full max-w-lg flex-col items-center justify-end self-end text-center">
				{#if enableDesign}
					<img src="/brands/ecomplete_software_icon.png" alt="e.complete" class="size-20 object-contain" />
				{:else}
					<span class="bg-primary text-primary-foreground inline-grid size-11 place-items-center rounded-xl shadow-lg">
						<Inbox class="size-5" />
					</span>
				{/if}
				<h1 class="mt-4 text-2xl font-semibold tracking-tight">{intake.name}</h1>
				<p class="text-muted-foreground mt-1 text-sm">
					{#if data.signedInAs}{m.signed_in_as({ name: data.signedInAs })}{:else}{m.submit_ticket()}{/if}
				</p>
			</div>
		{/if}

		<Card.Root class="w-full max-w-lg">
			<Card.Content>
				{#if submitted !== null}
					<div class="flex flex-col items-center gap-3 py-4 text-center" role="status">
						<CircleCheck class="text-success size-10" />
						<h2 class="text-lg font-semibold">{m.submitted_title()}</h2>
						<p class="text-muted-foreground text-sm">
							{submitted ? m.submitted_text({ key: submitted }) : m.submitted_text_plain()}
						</p>
						<div class="flex flex-wrap justify-center gap-2">
							{#if submittedPath}<Button href="/status">{m.my_tickets()}</Button>{/if}
							<Button variant="outline" onclick={() => (submitted = null)}>{m.submit_another()}</Button>
						</div>
					</div>
				{:else}
					<form class="grid gap-4" method="POST" enctype="multipart/form-data" use:enhance novalidate>
						{#each intake.fieldOrder as field (field)}
							{#if field === 'project' && chooseProject}
								<div class="grid gap-2">
									<Label for="s-project">{m.project()}<span class="text-destructive" aria-hidden="true">*</span></Label>
									<Select.Root type="single" name="project" bind:value={$form.project}>
										<Select.Trigger id="s-project" class="w-full">
											<span class={project ? '' : 'text-muted-foreground'}>{project?.name ?? m.choose_project()}</span>
										</Select.Trigger>
										<Select.Content>
											{#each intake.projects as p (p.key)}
												<Select.Item value={p.key} label={p.name}>
													<span class="size-2.5 rounded-full" style="background: {p.color}"></span>
													{p.name}
												</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
							{/if}
							{#if field === 'title'}
								<div class="grid gap-2">
									<Label for="s-title">{m.title()}<span class="text-destructive" aria-hidden="true">*</span></Label>
									<Input
										id="s-title"
										name="title"
										bind:value={$form.title}
										maxlength={300}
										aria-invalid={$errors.title ? 'true' : undefined}
									/>
									{#if $errors.title}<p class="text-destructive text-sm">{localizeError($errors.title[0])}</p>{/if}
								</div>
							{/if}
							{#if field === 'description' && fields.description !== 'hidden'}
								<div class="grid gap-2">
									{@render fieldLabel(m.description(), fields.description)}
									<div class="overflow-hidden rounded-md border">
										<MarkdownEditor
											bind:value={$form.description}
											autoSave={false}
											onSave={() => {}}
											onImageBlob={addInlineImage}
											ariaLabel={m.description()}
										/>
									</div>
									<input type="hidden" name="description" value={$form.description} />
									<input
										bind:this={inlineInput}
										type="file"
										name="inlineImages"
										multiple
										class="hidden"
										tabindex="-1"
										aria-hidden="true"
									/>
									{#each inlineImages as image (image.url)}<input
											type="hidden"
											name="inlineImageUrls"
											value={image.url}
										/>{/each}
								</div>
							{/if}
							{#if field === 'priority' && fields.priority !== 'hidden'}
								<div class="grid gap-2">
									{@render fieldLabel(m.priority_2(), fields.priority, 's-priority')}
									<Select.Root type="single" name="priority" bind:value={$form.priority}>
										<Select.Trigger id="s-priority" class="w-full">
											{#if $form.priority}
												<span class="flex items-center gap-2"
													><span class="prio prio-{$form.priority}"></span>{PRIORITY_LABELS[$form.priority]}</span
												>
											{:else}
												<span class="text-muted-foreground">{m.choose_priority()}</span>
											{/if}
										</Select.Trigger>
										<Select.Content>
											{#each PRIORITIES as p (p)}
												<Select.Item value={p} label={PRIORITY_LABELS[p]}
													><span class="prio prio-{p}"></span>{PRIORITY_LABELS[p]}</Select.Item
												>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
							{/if}
							{#if field === 'system' && fields.system !== 'hidden'}
								<div class="grid gap-2">
									{@render fieldLabel(m.system(), fields.system, 's-system')}
									<Select.Root
										type="single"
										name="system"
										bind:value={$form.system}
										disabled={!project || !systems.length}
									>
										<Select.Trigger id="s-system" class="w-full"
											><span class={$form.system ? '' : 'text-muted-foreground'}
												>{$form.system || m.choose_system()}</span
											></Select.Trigger
										>
										<Select.Content
											>{#each systems as system (system)}<Select.Item value={system}>{system}</Select.Item
												>{/each}</Select.Content
										>
									</Select.Root>
									{#if project && !systems.length}<p class="text-muted-foreground text-xs">
											{m.no_systems_in_project()}
										</p>{/if}
								</div>
							{/if}
							{#if field === 'startDate' && fields.startDate !== 'hidden'}
								<div class="grid gap-2">
									{@render fieldLabel(m.start(), fields.startDate, 's-start')}
									<DatePicker
										id="s-start"
										value={$form.startDate || null}
										onchange={(d) => ($form.startDate = d ?? '')}
									/>
									<input type="hidden" name="startDate" value={$form.startDate} />
								</div>
							{/if}
							{#if field === 'dueDate' && fields.dueDate !== 'hidden'}
								<div class="grid gap-2">
									{@render fieldLabel(m.due(), fields.dueDate, 's-due')}
									<DatePicker
										id="s-due"
										value={$form.dueDate || null}
										min={$form.startDate || null}
										onchange={(d) => ($form.dueDate = d ?? '')}
									/>
									<input type="hidden" name="dueDate" value={$form.dueDate} />
								</div>
								{#if $errors.dueDate}<p class="text-destructive text-sm">{localizeError($errors.dueDate[0])}</p>{/if}
							{/if}
							{#if field === 'tags' && fields.tags !== 'hidden' && availableTags.length}
								<div class="grid gap-2">
									{@render fieldLabel(m.tags(), fields.tags)}
									<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.tags()}>
										{#each availableTags as t (t.name)}
											<Toggle
												size="sm"
												variant="outline"
												class="h-7 min-w-0 p-0"
												style={`border-color: color-mix(in srgb, ${t.color} ${$form.tags.includes(t.name) ? '90%' : '25%'}, transparent)`}
												pressed={$form.tags.includes(t.name)}
												onPressedChange={(on) => toggleTag(t.name, on)}
												aria-label={t.name}
											>
												<TagBadge name={t.name} color={t.color} class="h-full rounded-[inherit] border-0 px-2">
													{#if $form.tags.includes(t.name)}<Check class="size-3" />{/if}
												</TagBadge>
											</Toggle>
										{/each}
									</div>
									{#each $form.tags as name (name)}<input type="hidden" name="tags" value={name} />{/each}
								</div>
							{/if}
							{#if field === 'attachments' && fields.attachments !== 'hidden'}
								<div class="grid gap-2">
									{@render fieldLabel(m.attachments(), fields.attachments, 's-attachments')}
									<FileDrop id="s-attachments" name="attachments" max={INTAKE_MAX_FILES} />
									<p class="text-muted-foreground text-xs">{m.attachments_hint({ count: INTAKE_MAX_FILES })}</p>
								</div>
							{/if}
							{#if field === 'email' && showEmail}
								<div class="grid gap-2">
									{@render fieldLabel(m.your_email(), intake.emailMode, 's-email')}
									<Input
										id="s-email"
										name="email"
										type="email"
										autocomplete="email"
										bind:value={$form.email}
										aria-invalid={$errors.email ? 'true' : undefined}
									/>
									{#if $errors.email}
										<p class="text-destructive text-sm">{localizeError($errors.email[0])}</p>
									{:else}
										<p class="text-muted-foreground text-xs">{m.email_hint()}</p>
									{/if}
								</div>
							{/if}
						{/each}
						<!-- Fallen-Feld gegen Bots: für Menschen unsichtbar und nicht per Tab erreichbar -->
						<div class="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
							<label>
								{m.leave_empty()}
								<input name="website" tabindex="-1" autocomplete="off" bind:value={$form.website} />
							</label>
						</div>
						{#if $message}<p class="text-destructive text-sm" role="alert">{localizeError($message)}</p>{/if}
						<Button type="submit" disabled={$submitting}>
							{#if $submitting}<LoaderCircle class="animate-spin" />{/if}
							{m.submit()}
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
