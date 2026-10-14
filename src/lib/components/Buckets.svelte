<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { createBucketSchema, type BucketDto } from '#lib/contracts/index.js';
	import { createBucket, updateBucket, deleteBucket } from '#lib/api.js';
	import { m } from '#lib/paraglide/messages.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { toast } from 'svelte-sonner';
	let { projectKey, buckets }: { projectKey: string; buckets: BucketDto[] } = $props();
	let selected = $state<BucketDto | null>(null);
	let confirmOpen = $state(false);
	let busy = $state(false);
	async function run(action: () => Promise<unknown>) {
		busy = true;
		try {
			await action();
			await refreshAll();
		} catch (e) {
			toast.error((e as Error).message);
			await refreshAll();
		} finally {
			busy = false;
		}
	}
	const { form, errors, enhance, reset, submitting } = superForm(
		{ name: '' },
		{
			SPA: true,
			validators: zod4Client(createBucketSchema),
			multipleSubmits: 'prevent',
			resetForm: false,
			async onUpdate({ form: validated }) {
				if (!validated.valid) return;
				try {
					await createBucket(projectKey, validated.data);
					reset();
					await refreshAll();
				} catch (e) {
					toast.error((e as Error).message);
				}
			}
		}
	);
</script>

<Card.Root>
	<Card.Header
		><Card.Title>{m.buckets()}</Card.Title><Card.Description>{m.buckets_description()}</Card.Description></Card.Header
	>
	<Card.Content class="space-y-3">
		<ul class="space-y-2">
			{#each buckets as bucket (bucket.id)}
				<li class="flex items-center gap-2">
					<Input
						aria-label={m.bucket_name({ name: bucket.name })}
						value={bucket.name}
						maxlength={80}
						disabled={busy}
						onchange={(e) => run(() => updateBucket(projectKey, bucket.id, { name: e.currentTarget.value }))}
					/>
					<Button
						variant="outline"
						disabled={busy}
						onclick={() => {
							selected = bucket;
							confirmOpen = true;
						}}>{m.delete()}</Button
					>
				</li>
			{/each}
		</ul>
		<form method="POST" use:enhance class="flex flex-wrap gap-2">
			<Input
				aria-label={m.new_bucket()}
				placeholder={m.new_bucket()}
				name="name"
				bind:value={$form.name}
				required
				maxlength={80}
			/>
			<Button type="submit" disabled={$submitting || busy}>{m.add_bucket()}</Button>
			{#if $errors.name}<p class="text-destructive text-sm">{$errors.name}</p>{/if}
		</form>
	</Card.Content>
</Card.Root>
<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header
			><AlertDialog.Title>{m.delete_bucket()}</AlertDialog.Title><AlertDialog.Description
				>{m.delete_bucket_description({ name: selected?.name ?? '' })}</AlertDialog.Description
			></AlertDialog.Header
		>
		<AlertDialog.Footer
			><AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel><AlertDialog.Action
				onclick={() => {
					if (selected) {
						const id = selected.id;
						void run(() => deleteBucket(projectKey, id));
					}
					confirmOpen = false;
				}}>{m.delete()}</AlertDialog.Action
			></AlertDialog.Footer
		>
	</AlertDialog.Content>
</AlertDialog.Root>
