import {
	collection,
	addDoc,
	query,
	orderBy,
	limit,
	getDocs,
	serverTimestamp,
	where,
	type DocumentData
} from 'firebase/firestore';
import { db } from './firebase';

export interface LeaderboardEntry {
	playerName: string;
	score: number;
	gameId: string;
	createdAt: Date | null;
}

export async function submitScore(gameId: string, playerName: string, score: number) {
	return addDoc(collection(db, 'leaderboard'), {
		gameId,
		playerName,
		score,
		createdAt: serverTimestamp()
	});
}

export async function getTopScores(gameId: string, max = 10): Promise<LeaderboardEntry[]> {
	const q = query(
		collection(db, 'leaderboard'),
		where('gameId', '==', gameId),
		orderBy('score', 'desc'),
		limit(max)
	);

	const snapshot = await getDocs(q);
	return snapshot.docs.map((doc) => {
		const data = doc.data() as DocumentData;
		return {
			playerName: data.playerName,
			score: data.score,
			gameId: data.gameId,
			createdAt: data.createdAt?.toDate() ?? null
		};
	});
}
