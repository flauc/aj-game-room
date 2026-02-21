export interface Game {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  /** Path under /static/games/{id}/index.html or a route */
  path: string;
  type: 'html5' | 'phaser';
}

/** Registry of available games. Add entries here as you build games. */
export const games: Game[] = [
  // Example:
  // {
  // 	id: 'pong',
  // 	title: 'Pong',
  // 	description: 'Classic two-player pong',
  // 	thumbnail: '/games/pong/thumb.png',
  // 	path: '/games/pong/index.html',
  // 	type: 'html5'
  // }
];
