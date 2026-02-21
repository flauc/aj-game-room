<script lang="ts">
  import { signIn, signUp, signInWithGoogle } from '$lib/auth.svelte';

  let mode = $state<'login' | 'signup'>('login');
  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit() {
    error = '';
    loading = true;
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) {
          error = 'Enter a display name';
          loading = false;
          return;
        }
        await signUp(email, password, displayName.trim());
      } else {
        await signIn(email, password);
      }
    } catch (e: unknown) {
      const msg = (e as { code?: string }).code ?? (e as Error).message;
      if (msg === 'auth/email-already-in-use') error = 'Email already in use';
      else if (msg === 'auth/invalid-email') error = 'Invalid email address';
      else if (msg === 'auth/weak-password') error = 'Password must be at least 6 characters';
      else if (msg === 'auth/invalid-credential') error = 'Wrong email or password';
      else error = msg;
    } finally {
      loading = false;
    }
  }

  async function handleGoogle() {
    error = '';
    loading = true;
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const msg = (e as { code?: string }).code ?? (e as Error).message;
      if (msg !== 'auth/popup-closed-by-user') error = msg;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-[calc(100vh-65px)] items-center justify-center px-4">
  <div class="w-full max-w-sm">
    <h1 class="mb-2 text-center text-3xl font-bold text-white">
      {mode === 'login' ? 'Welcome Back' : 'Create Account'}
    </h1>
    <p class="mb-8 text-center text-gray-400">
      {mode === 'login' ? 'Sign in to play' : 'Sign up to get started'}
    </p>

    <div class="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        class="space-y-4"
      >
        {#if mode === 'signup'}
          <div>
            <label for="displayName" class="mb-1 block text-sm font-medium text-gray-400"
              >Display Name</label
            >
            <input
              id="displayName"
              type="text"
              maxlength="20"
              bind:value={displayName}
              class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Your name"
            />
          </div>
        {/if}

        <div>
          <label for="email" class="mb-1 block text-sm font-medium text-gray-400">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-400">Password</label
          >
          <input
            id="password"
            type="password"
            bind:value={password}
            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="••••••••"
          />
        </div>

        {#if error}
          <p class="text-sm text-red-400">{error}</p>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div class="my-5 flex items-center gap-3">
        <div class="h-px flex-1 bg-gray-700"></div>
        <span class="text-xs text-gray-500">or</span>
        <div class="h-px flex-1 bg-gray-700"></div>
      </div>

      <button
        onclick={handleGoogle}
        disabled={loading}
        class="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>

      <p class="mt-5 text-center text-sm text-gray-400">
        {#if mode === 'login'}
          Don't have an account?
          <button
            onclick={() => {
              mode = 'signup';
              error = '';
            }}
            class="text-indigo-400 hover:underline"
          >
            Sign up
          </button>
        {:else}
          Already have an account?
          <button
            onclick={() => {
              mode = 'login';
              error = '';
            }}
            class="text-indigo-400 hover:underline"
          >
            Sign in
          </button>
        {/if}
      </p>
    </div>
  </div>
</div>
