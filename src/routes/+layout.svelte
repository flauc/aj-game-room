<script lang="ts">
  import './layout.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { initAuth, authUser, authLoading, signOut } from '$lib/auth.svelte';

  let { children } = $props();

  onMount(() => {
    const unsub = initAuth();
    return unsub;
  });

  // Redirect unauthenticated users to /login (except if already on /login)
  $effect(() => {
    if (!authLoading.current && !authUser.current && page.url.pathname !== '/login') {
      goto('/login');
    }
  });

  // Redirect authenticated users away from /login
  $effect(() => {
    if (!authLoading.current && authUser.current && page.url.pathname === '/login') {
      goto('/');
    }
  });

  const displayName = $derived(
    authUser.current?.displayName || authUser.current?.email?.split('@')[0] || 'Player'
  );
</script>

<svelte:head>
  <title>Andy & Jake's Game Room</title>
</svelte:head>

{#if authLoading.current}
  <div class="flex min-h-screen items-center justify-center bg-gray-950">
    <div class="text-center text-gray-400">
      <div
        class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500"
      ></div>
      Loading...
    </div>
  </div>
{:else}
  <div class="flex min-h-screen flex-col bg-gray-950 text-gray-100">
    <header class="border-b border-gray-800 bg-gray-900 px-6 py-4">
      <div class="flex items-center justify-between">
        <a href="/" class="text-2xl font-bold tracking-tight text-indigo-400">
          Andy &amp; Jake's Game Room
        </a>
        {#if authUser.current}
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-400">
              {displayName}
            </span>
            <button
              onclick={() => signOut()}
              class="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        {/if}
      </div>
    </header>

    <main class="flex-1">
      {@render children()}
    </main>
  </div>
{/if}
