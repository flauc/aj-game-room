import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

/** Reactive auth state — use authUser.current and authLoading.current in components */
let _user = $state<User | null>(null);
let _loading = $state(true);

export const authUser = {
  get current() {
    return _user;
  }
};

export const authLoading = {
  get current() {
    return _loading;
  }
};

/** Call once on app init (in root layout) to start listening */
export function initAuth(): () => void {
  return onAuthStateChanged(auth, (u) => {
    _user = u;
    _loading = false;
  });
}

export async function signUp(email: string, password: string, displayName: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
