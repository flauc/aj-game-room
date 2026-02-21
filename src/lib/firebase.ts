import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDzTDZdWZZMJQWN9EdXfcm5ub0Fy4FU_jE',
  authDomain: 'aj-game-room.firebaseapp.com',
  projectId: 'aj-game-room',
  storageBucket: 'aj-game-room.firebasestorage.app',
  messagingSenderId: '132674006261',
  appId: '1:132674006261:web:5c360608c2835710a969bc',
  measurementId: 'G-KHXXVRLBZJ'
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
