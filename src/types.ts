export interface Round {
  id: number;
  name: string;
}

export interface Match {
  table: number;
  playerOne: string;
  playerTwo: string;
  result: string | null;
}

export interface Standing {
  rank: number;
  name: string;
  points: number;
  record: string;
}

export interface TournamentSnapshot {
  tournamentId: string;
  round: Round;
  matches: Match[];
  standings: Standing[];
  observedAt: Date;
}

export interface MeleeSource {
  getRounds(tournamentId: string): Promise<Round[]>;
  getMatches(tournamentId: string, roundId: number): Promise<Match[]>;
  getStandings(tournamentId: string, roundId: number): Promise<Standing[]>;
}
