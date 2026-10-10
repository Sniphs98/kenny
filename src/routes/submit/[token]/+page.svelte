<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { PRIORITY_LABELS } from '$lib/api';
	import { INTAKE_MAX_FILES, PRIORITIES, intakeSubmissionSchema, type IntakeFieldMode } from '$lib/contracts';
	import { localizeError } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import FileDrop from '$lib/components/FileDrop.svelte';
	import TagBadge from '$lib/components/TagBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Toggle } from '$lib/components/ui/toggle';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Inbox from '@lucide/svelte/icons/inbox';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let { data } = $props();

	const intake = $derived(data.intake);
	const fields = $derived(intake.fields);
	const chooseProject = $derived(intake.projects.length > 1);
	const showEmail = $derived(!data.signedInAs && intake.emailMode !== 'hidden');

	/** Schlüssel des eingereichten Tickets; '' bei erfolgreicher Einreichung ohne Schlüssel, null = Formular zeigen */
	let submitted = $state<string | null>(null);

	const { form, errors, message, enhance, submitting } = superForm(
		untrack(() => data.form),
		{
			validationMethod: 'onsubmit',
			validators: zod4Client(intakeSubmissionSchema),
			onResult: ({ result }) => {
				if (result.type === 'success') submitted = String(result.data?.submitted ?? '');
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
		});
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

<div
	class="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_50%_0%,var(--primary-soft),transparent_60%)] p-4"
>
	<div class="w-full max-w-lg">
		<div class="mb-6 text-center">
			<span class="bg-primary text-primary-foreground inline-grid size-11 place-items-center rounded-xl shadow-lg">
				<Inbox class="size-5" />
			</span>
			<h1 class="mt-4 text-2xl font-semibold tracking-tight">{intake.name}</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if data.signedInAs}{m.signed_in_as({ name: data.signedInAs })}{:else}{m.submit_ticket()}{/if}
			</p>
		</div>

		<Card.Root>
			<Card.Content>
				{#if submitted !== null}
					<div class="flex flex-col items-center gap-3 py-4 text-center" role="status">
						<CircleCheck class="text-success size-10" />
						<h2 class="text-lg font-semibold">{m.submitted_title()}</h2>
						<p class="text-muted-foreground text-sm">
							{submitted ? m.submitted_text({ key: submitted }) : m.submitted_text_plain()}
						</p>
						<Button variant="outline" onclick={() => (submitted = null)}>{m.submit_another()}</Button>
					</div>
				{:else}
					<form class="grid gap-4" method="POST" enctype="multipart/form-data" use:enhance novalidate>
						{#if chooseProject}
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
						{#if fields.description !== 'hidden'}
							<div class="grid gap-2">
								{@render fieldLabel(m.description(), fields.description, 's-description')}
								<Textarea id="s-description" name="description" bind:value={$form.description} rows={6} />
							</div>
						{/if}
						{#if fields.priority !== 'hidden'}
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
						{#if fields.startDate !== 'hidden' || fields.dueDate !== 'hidden'}
							<div class="grid gap-3 sm:grid-cols-2">
								{#if fields.startDate !== 'hidden'}
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
								{#if fields.dueDate !== 'hidden'}
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
								{/if}
							</div>
							{#if $errors.dueDate}<p class="text-destructive text-sm">{localizeError($errors.dueDate[0])}</p>{/if}
						{/if}
						{#if fields.tags !== 'hidden' && availableTags.length}
							<div class="grid gap-2">
								{@render fieldLabel(m.tags(), fields.tags)}
								<div class="flex flex-wrap gap-1.5" role="group" aria-label={m.tags()}>
									{#each availableTags as t (t.name)}
										<Toggle
											size="sm"
											variant="outline"
											class="h-7 px-1.5"
											pressed={$form.tags.includes(t.name)}
											onPressedChange={(on) => toggleTag(t.name, on)}
											aria-label={t.name}
										>
											<TagBadge name={t.name} color={t.color} />
										</Toggle>
									{/each}
								</div>
								{#each $form.tags as name (name)}<input type="hidden" name="tags" value={name} />{/each}
							</div>
						{/if}
						{#if fields.attachments !== 'hidden'}
							<div class="grid gap-2">
								{@render fieldLabel(m.attachments(), fields.attachments, 's-attachments')}
								<FileDrop id="s-attachments" name="attachments" max={INTAKE_MAX_FILES} />
								<p class="text-muted-foreground text-xs">{m.attachments_hint({ count: INTAKE_MAX_FILES })}</p>
							</div>
						{/if}
						{#if showEmail}
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
