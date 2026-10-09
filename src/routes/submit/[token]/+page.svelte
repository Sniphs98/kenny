<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { intakeSubmissionSchema } from '$lib/contracts';
	import { localizeError } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Inbox from '@lucide/svelte/icons/inbox';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let { data } = $props();

	const intake = $derived(data.intake);
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

	const projectLabel = $derived(intake.projects.find((p) => p.key === $form.project)?.name);
</script>

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
					<form class="grid gap-4" method="POST" use:enhance novalidate>
						{#if chooseProject}
							<div class="grid gap-2">
								<Label for="s-project">{m.project()}</Label>
								<Select.Root type="single" name="project" bind:value={$form.project}>
									<Select.Trigger id="s-project" class="w-full">
										<span class={projectLabel ? '' : 'text-muted-foreground'}>{projectLabel ?? m.choose_project()}</span
										>
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
							<Label for="s-title">{m.title()}</Label>
							<Input
								id="s-title"
								name="title"
								bind:value={$form.title}
								maxlength={300}
								aria-invalid={$errors.title ? 'true' : undefined}
							/>
							{#if $errors.title}<p class="text-destructive text-sm">{localizeError($errors.title[0])}</p>{/if}
						</div>
						<div class="grid gap-2">
							<Label for="s-description">{m.description()}</Label>
							<Textarea id="s-description" name="description" bind:value={$form.description} rows={6} />
						</div>
						{#if showEmail}
							<div class="grid gap-2">
								<Label for="s-email">
									{m.your_email()}
									{#if intake.emailMode === 'optional'}<span class="text-muted-foreground font-normal"
											>{m.optional_suffix()}</span
										>{/if}
								</Label>
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
