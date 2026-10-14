<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { createBucketSchema, type BucketDto } from '#lib/contracts/index.js';
	import { createBucket } from '#lib/api.js';
	import { m } from '#lib/paraglide/messages.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { toast } from 'svelte-sonner';
	let {
		project,
		buckets,
		value,
		onchange,
		disabled = false,
		canManage = false,
		refresh = refreshAll
	}: {
		project: string;
		buckets: BucketDto[];
		value: number | null;
		onchange: (value: number | null) => void | Promise<void>;
		disabled?: boolean;
		canManage?: boolean;
		refresh?: () => Promise<void>;
	} = $props();
	const uid = $props.id();
	let open = $state(false);
	let query = $state('');
	let createOpen = $state(false);
	const selected = $derived(buckets.find((bucket) => bucket.id === value));
	const { form, errors, enhance, reset, submitting } = superForm(
		{ name: '' },
		{
			SPA: true,
			dataType: 'json',
			validators: zod4Client(createBucketSchema),
			multipleSubmits: 'prevent',
			resetForm: false,
			async onUpdate({ form: validated }) {
				if (!validated.valid || disabled || !canManage) return;
				try {
					const created = await createBucket(project, validated.data);
					await refresh();
					await onchange(created.id);
					createOpen = false;
				} catch (e) {
					toast.error((e as Error).message);
				}
			}
		}
	);
	async function select(next: number | null) {
		open = false;
		await onchange(next);
	}
	function startCreate() {
		reset({ data: { name: query.trim() } });
		open = false;
		createOpen = true;
	}
</script>

<Popover.Root bind:open onOpenChange={(next) => !next && (query = '')}>
	<Popover.Trigger
		role="combobox"
		aria-label={m.bucket()}
		disabled={disabled || $submitting}
		class={buttonVariants({ variant: 'outline', class: 'w-full justify-between font-normal' })}
	>
		<span class="truncate">{selected?.name ?? m.no_bucket()}</span><ChevronsUpDown class="text-muted-foreground" />
	</Popover.Trigger>
	<Popover.Content class="w-72 max-w-[calc(100vw-2rem)] p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={m.search_buckets()} bind:value={query} />
			<Command.List>
				<Command.Empty>{m.no_buckets_found()}</Command.Empty>
				<Command.Group>
					<Command.Item value="__none" keywords={[m.no_bucket()]} onSelect={() => select(null)}
						>{m.no_bucket()}{#if value === null}<Check class="ml-auto" />{/if}</Command.Item
					>
					{#each buckets as bucket (bucket.id)}<Command.Item
							value={String(bucket.id)}
							keywords={[bucket.name]}
							onSelect={() => select(bucket.id)}
							><span class="truncate">{bucket.name}</span>{#if value === bucket.id}<Check
									class="ml-auto"
								/>{/if}</Command.Item
						>{/each}
				</Command.Group>
				{#if canManage && !disabled}<Command.Separator /><Command.Item
						value="__create"
						forceMount
						onSelect={startCreate}><Plus />{m.new_bucket()}</Command.Item
					>{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<form method="POST" use:enhance class="grid gap-4">
			<Dialog.Header
				><Dialog.Title>{m.new_bucket()}</Dialog.Title><Dialog.Description
					>{m.create_bucket_inline_hint()}</Dialog.Description
				></Dialog.Header
			>
			<div class="grid gap-2">
				<Label for={`${uid}-name`}>{m.name()}</Label><Input
					id={`${uid}-name`}
					name="name"
					bind:value={$form.name}
					required
					maxlength={80}
					disabled={$submitting}
				/>{#if $errors.name}<p class="text-destructive text-sm">{$errors.name}</p>{/if}
			</div>
			<Dialog.Footer
				><Button type="button" variant="outline" disabled={$submitting} onclick={() => (createOpen = false)}
					>{m.cancel()}</Button
				><Button type="submit" disabled={$submitting || disabled || !canManage}>{m.add_bucket()}</Button></Dialog.Footer
			>
		</form>
	</Dialog.Content>
</Dialog.Root>
