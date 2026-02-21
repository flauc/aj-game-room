<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Andy & Jake's Game Room</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-950 text-gray-100">
	<header class="border-b border-gray-800 bg-gray-900 px-6 py-4">
		<a href="/" class="text-2xl font-bold tracking-tight text-indigo-400">
			Andy &amp; Jake's Game Room
		</a>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>
