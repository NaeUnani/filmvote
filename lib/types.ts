export type Movie = {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  year: string;
  runtime: string;
  genre: string;
  actors: string;
  director: string;
  synopsis: string;
  imdb: string;
  tomatoes: string;
  metacritic: string;
  imdbId: string;
  addedAt: number;
};
export type Playlist = { id: string; name: string; description: string };
export type Config = {
  playlists: Playlist[];
  votingOpen: boolean;
  startsAt?: number;
  endsAt?: number;
  roundId?: string;
  archivedAt?: number;
  lastMovies?: Movie[];
};
export type Snapshot = {
  config: Config;
  movies: Movie[];
  counts: Record<string, number>;
  voted: string[];
  remaining: number;
  storage: string;
  library: Movie[];
  phase: "scheduled" | "open" | "paused" | "ended";
};
