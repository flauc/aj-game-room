export { db, rtdb } from './firebase';
export { games, type Game } from './games';
export { submitScore, getTopScores, type LeaderboardEntry } from './leaderboard';
export { createRoom, joinRoom, listenToRoom, startGame, leaveRoom, type Room } from './rooms';
