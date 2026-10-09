<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance as enhanceAction } from '$app/forms';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { intakeFormSchema, type IntakeFormDto } from '$lib/contracts';
	import { localizeError } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages.js';
	import Hint from '$lib/components/Hint.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data } = $props();

	const EMAIL_MODES = {
		hidden: m.email_mode_hidden(),
		optional: m.email_mode_optional(),
		required: m.email_mode_required()
	};

	let open = $state(false);
	/** ID des bearbeiteten Formulars, null beim Anlegen */
	let editing = $state<number | null>(null);
	let confirmDelete = $state<IntakeFormDto | null>(null);
	let confirmRegenerate = $state<IntakeFormDto | null>(null);

	const { form, errors, message, enhance, submitting, reset } = superForm(
		untrack(() => data.form),
		{
			dataType: 'json',
			validationMethod: 'onsubmit',
			validators: zod4Client(intakeFormSchema),
			resetForm: false,
			onUpdated: ({ form: result }) => {
				if (result.valid && !result.message) {
					open = false;
					toast.success(m.form_saved());
				}
			}
		}
	);

	function openNew() {
		reset({ data: { name: '', projectIds: [], requireLogin: false, emailMode: 'optional', active: true } });
		editing = null;
		open = true;
	}

	function openEdit(f: IntakeFormDto) {
		reset({
			data: {
				name: f.name,
				projectIds: f.projects.map((p) => p.id),
				requireLogin: f.requireLogin,
				emailMode: f.emailMode,
				active: f.active
			}
		});
		editing = f.id;
		open = true;
	}

	function toggleProject(id: number, on: boolean) {
		$form.projectIds = on ? [...$form.projectIds, id] : $form.projectIds.filter((p) => p !== id);
	}

	const link = (f: IntakeFormDto) => `${page.url.origin}/submit/${f.token}`;

	async function copy(f: IntakeFormDto) {
		await navigator.clipboard.writeText(link(f));
		toast.success(m.link_copied());
	}

	/** Ergebnis der einfachen Aktionen (Löschen, Link neu erzeugen) */
	const afterAction =
		(success: string, close: () => void) =>
		() =>
		async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			close();
			if (result.type === 'failure') toast.error(localizeError(String(result.data?.error ?? '')));
			else toast.success(success);
			await update();
		};
</script>

<svelte:head><title>{m.forms()} · Kenny</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-8">
	<div class="flex items-end gap-4">
		<div class="grow">
			<h1 class="text-2xl font-semibold tracking-tight">{m.forms()}</h1>
			<p class="text-muted-foreground mt-1 text-sm">{m.forms_description()}</p>
		</div>
		<Button onclick={openNew}><Plus /> {m.new_form()}</Button>
	</div>

	{#each data.forms as f (f.id)}
		<Card.Root class={f.active ? '' : 'opacity-70'}>
			<Card.Header class="flex flex-wrap items-center gap-2">
				<Inbox class="text-muted-foreground size-4" />
				<Card.Title class="grow">{f.name}</Card.Title>
				{#if !f.active}<Badge variant="outline">{m.form_inactive()}</Badge>{/if}
				<Badge variant="secondary">{f.requireLogin ? m.require_login() : m.public_form()}</Badge>
				{#if !f.requireLogin}<Badge variant="secondary">{m.email()}: {EMAIL_MODES[f.emailMode]}</Badge>{/if}
			</Card.Header>
			<Card.Content class="gap-3">
				<div class="flex flex-wrap gap-1.5">
					{#each f.projects as p (p.id)}
						<Badge variant="outline"><span class="font-mono">{p.key}</span> {p.name}</Badge>
					{/each}
				</div>
				<div class="flex gap-2">
					<Input value={link(f)} readonly class="font-mono text-xs" aria-label={m.copy_link()} />
					<Hint text={m.copy_link()}>
						{#snippet children(props)}
							<Button {...props} variant="outline" size="icon" aria-label={m.copy_link()} onclick={() => copy(f)}
								><Copy /></Button
							>
						{/snippet}
					</Hint>
					<Hint text={m.open_form()}>
						{#snippet children(props)}
							<a
								{...props}
								href={link(f)}
								target="_blank"
								rel="noopener"
								class={buttonVariants({ variant: 'outline', size: 'icon' })}
								aria-label={m.open_form()}><ExternalLink /></a
							>
						{/snippet}
					</Hint>
				</div>
			</Card.Content>
			<Card.Footer class="gap-2">
				<Button variant="ghost" size="sm" onclick={() => openEdit(f)}><Pencil /> {m.edit()}</Button>
				<Button variant="ghost" size="sm" onclick={() => (confirmRegenerate = f)}
					><RefreshCw /> {m.regenerate_link()}</Button
				>
				<span class="grow"></span>
				<Button variant="ghost" size="sm" class="hover:text-destructive" onclick={() => (confirmDelete = f)}
					><Trash2 /> {m.delete()}</Button
				>
			</Card.Footer>
		</Card.Root>
	{:else}
		<Card.Root class="items-center px-6 py-12 text-center">
			<span class="bg-primary-soft text-primary grid size-12 place-items-center rounded-xl"
				><Inbox class="size-6" /></span
			>
			<p class="text-muted-foreground text-sm">{m.no_forms_yet()}</p>
			<Button onclick={openNew}><Plus /> {m.new_form()}</Button>
		</Card.Root>
	{/each}
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<form class="grid gap-4" method="POST" action={editing ? `?/save&id=${editing}` : '?/save'} use:enhance>
			<Dialog.Header>
				<Dialog.Title>{editing ? m.edit_form() : m.new_form()}</Dialog.Title>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="f-name">{m.name()}</Label>
				<Input id="f-name" bind:value={$form.name} maxlength={120} aria-invalid={$errors.name ? 'true' : undefined} />
				{#if $errors.name}<p class="text-destructive text-sm">{localizeError($errors.name[0])}</p>{/if}
			</div>
			<div class="grid gap-2">
				<Label>{m.projects()}</Label>
				<div class="grid max-h-48 gap-2 overflow-y-auto rounded-md border p-3">
					{#each data.projects as p (p.id)}
						<Label class="font-normal">
							<Checkbox checked={$form.projectIds.includes(p.id)} onCheckedChange={(on) => toggleProject(p.id, on)} />
							<span class="size-2.5 rounded-full" style="background: {p.color}"></span>
							{p.name} <span class="text-muted-foreground font-mono text-xs">{p.key}</span>
						</Label>
					{/each}
				</div>
				{#if $errors.projectIds?._errors}
					<p class="text-destructive text-sm">{localizeError($errors.projectIds._errors[0])}</p>
				{:else}
					<p class="text-muted-foreground text-xs">{m.form_projects_hint()}</p>
				{/if}
			</div>
			<Label class="font-normal"><Checkbox bind:checked={$form.requireLogin} /> {m.require_login()}</Label>
			<div class="grid gap-2">
				<Label>{m.email_field()}</Label>
				<Select.Root type="single" bind:value={$form.emailMode} disabled={$form.requireLogin}>
					<Select.Trigger class="w-full">{EMAIL_MODES[$form.emailMode]}</Select.Trigger>
					<Select.Content>
						{#each Object.entries(EMAIL_MODES) as [v, l] (v)}<Select.Item value={v}>{l}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
				<p class="text-muted-foreground text-xs">{m.email_only_without_login()}</p>
			</div>
			<Label class="font-normal"><Checkbox bind:checked={$form.active} /> {m.form_active()}</Label>
			{#if $message}<p class="text-destructive text-sm" role="alert">{localizeError($message)}</p>{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
				<Button type="submit" disabled={$submitting}>{m.save()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={!!confirmRegenerate} onOpenChange={(o) => !o && (confirmRegenerate = null)}>
	<AlertDialog.Content>
		<form
			method="POST"
			action="?/regenerate"
			use:enhanceAction={afterAction(m.link_regenerated(), () => (confirmRegenerate = null))}
		>
			<input type="hidden" name="id" value={confirmRegenerate?.id} />
			<AlertDialog.Header>
				<AlertDialog.Title>{m.regenerate_link_confirm_title()}</AlertDialog.Title>
				<AlertDialog.Description>{m.regenerate_link_confirm_text()}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer class="mt-4">
				<AlertDialog.Cancel type="button">{m.cancel()}</AlertDialog.Cancel>
				<Button type="submit"><RefreshCw /> {m.regenerate_link()}</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={!!confirmDelete} onOpenChange={(o) => !o && (confirmDelete = null)}>
	<AlertDialog.Content>
		<form
			method="POST"
			action="?/delete"
			use:enhanceAction={afterAction(m.form_deleted(), () => (confirmDelete = null))}
		>
			<input type="hidden" name="id" value={confirmDelete?.id} />
			<AlertDialog.Header>
				<AlertDialog.Title>{m.delete_form_confirm_title({ name: confirmDelete?.name ?? '' })}</AlertDialog.Title>
				<AlertDialog.Description>{m.delete_form_confirm_text()}</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer class="mt-4">
				<AlertDialog.Cancel type="button">{m.cancel()}</AlertDialog.Cancel>
				<Button type="submit" class="bg-destructive hover:bg-destructive/90 text-white"><Trash2 /> {m.delete()}</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
