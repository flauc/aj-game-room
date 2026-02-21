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
  {
    id: 'shooter',
    title: 'Blaster Arena',
    description: 'Survive monster waves while battling other players. Last one standing wins!',
    thumbnail: '/games/shooter/thumb.svg',
    path: '/play/shooter',
    type: 'phaser'
  }
];
