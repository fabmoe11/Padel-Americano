import { COURTS, RANDOM_ROUNDS, RANKING_NOISE, TIE_POINTS, TOTAL_ROUNDS, WIN_POINTS } from '../config';
import type { MatchResult, PlayerMatchHistory, RoundHistory, RoundRecord } from '../types';

export type RankingEntry = {
  name: string;
  totalPoints: number;
  matchesPlayed: number;
  byes: number;
  avgPoints: number;
  avgGameDifferential: number;
  wins: number;
  ties: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
};

export function getActivePlayerCount(totalPlayers: number): number {
  const cap = Math.min(totalPlayers, COURTS * 4);
  return Math.floor(cap / 4) * 4;
}

export function getByeInfo(totalPlayers: number): { active: number; byes: number } {
  const active = getActivePlayerCount(totalPlayers);
  return { active, byes: Math.max(0, totalPlayers - active) };
}

export function uniqueValidPlayers(players: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const player of players) {
    const trimmed = player.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function shuffle<T>(values: T[]): T[] {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export function createEmptyHistory(): RoundHistory {
  return {
    byeCounts: {},
    lastByeRound: {},
    lastByeTimestamp: {},
    partnerCounts: {},
    opponentCounts: {},
    courtCounts: {},
    playerStats: {},
  };
}

function getPairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function playerStatsForRound(round: RoundRecord): Record<string, PlayerMatchHistory> {
  const stats: Record<string, PlayerMatchHistory> = {};

  for (const match of round.matches) {
    const aPoints = match.scoreA > match.scoreB ? WIN_POINTS : match.scoreA === match.scoreB ? TIE_POINTS : 0;
    const bPoints = match.scoreB > match.scoreA ? WIN_POINTS : match.scoreA === match.scoreB ? TIE_POINTS : 0;

    for (const player of match.teamA) {
      const entry = stats[player] ?? {
        name: player,
        matchesPlayed: 0,
        byes: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        wins: 0,
        ties: 0,
        losses: 0,
      };

      entry.matchesPlayed += 1;
      entry.points += aPoints;
      entry.gamesWon += match.scoreA;
      entry.gamesLost += match.scoreB;
      if (match.scoreA > match.scoreB) entry.wins += 1;
      else if (match.scoreA === match.scoreB) entry.ties += 1;
      else entry.losses += 1;
      stats[player] = entry;
    }

    for (const player of match.teamB) {
      const entry = stats[player] ?? {
        name: player,
        matchesPlayed: 0,
        byes: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        wins: 0,
        ties: 0,
        losses: 0,
      };

      entry.matchesPlayed += 1;
      entry.points += bPoints;
      entry.gamesWon += match.scoreB;
      entry.gamesLost += match.scoreA;
      if (match.scoreB > match.scoreA) entry.wins += 1;
      else if (match.scoreA === match.scoreB) entry.ties += 1;
      else entry.losses += 1;
      stats[player] = entry;
    }
  }

  for (const bye of round.byes) {
    const entry = stats[bye] ?? {
      name: bye,
      matchesPlayed: 0,
      byes: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0,
      wins: 0,
      ties: 0,
      losses: 0,
    };

    entry.byes += 1;
    stats[bye] = entry;
  }

  return stats;
}

export function buildHistoryFromRounds(rounds: RoundRecord[]): RoundHistory {
  const history = createEmptyHistory();
  const mergedStats: Record<string, PlayerMatchHistory> = {};

  for (const round of rounds) {
    for (const bye of round.byes) {
      history.byeCounts[bye] = (history.byeCounts[bye] ?? 0) + 1;
      history.lastByeRound[bye] = round.roundNumber;
      history.lastByeTimestamp[bye] = round.roundNumber;
    }

    for (const match of round.matches) {
      const players = [...match.teamA, ...match.teamB];

      for (const pair of [[match.teamA[0], match.teamA[1]], [match.teamB[0], match.teamB[1]]]) {
        const key = getPairKey(pair[0], pair[1]);
        history.partnerCounts[key] = (history.partnerCounts[key] ?? 0) + 1;
      }

      for (const current of players) {
        for (const other of players) {
          if (current !== other) {
            const key = getPairKey(current, other);
            history.opponentCounts[key] = (history.opponentCounts[key] ?? 0) + 1;
          }
        }
      }
    }

    const stats = playerStatsForRound(round);
    for (const [name, value] of Object.entries(stats)) {
      const existing = mergedStats[name] ?? {
        name,
        matchesPlayed: 0,
        byes: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        wins: 0,
        ties: 0,
        losses: 0,
      };

      existing.matchesPlayed += value.matchesPlayed;
      existing.byes += value.byes;
      existing.points += value.points;
      existing.gamesWon += value.gamesWon;
      existing.gamesLost += value.gamesLost;
      existing.wins += value.wins;
      existing.ties += value.ties;
      existing.losses += value.losses;
      mergedStats[name] = existing;
    }
  }

  history.playerStats = mergedStats;
  return history;
}

function pairingOptions(group: string[]): Array<[string, string][]> {
  const [a, b, c, d] = group;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

function partnerRepeatCost(pairing: [string, string][], history: RoundHistory): number {
  return pairing.reduce((total, [a, b]) => total + (history.partnerCounts[getPairKey(a, b)] ?? 0), 0);
}

function opponentRepeatCost(pairing: [string, string][], history: RoundHistory): number {
  const [firstA, firstB] = pairing[0];
  const [secondA, secondB] = pairing[1];
  let total = 0;

  for (const a of [firstA, firstB]) {
    for (const b of [secondA, secondB]) {
      total += history.opponentCounts[getPairKey(a, b)] ?? 0;
    }
  }

  return total;
}

function pairingCost(pairing: [string, string][], history: RoundHistory): number {
  return 10 * partnerRepeatCost(pairing, history) + 3 * opponentRepeatCost(pairing, history) + Math.random();
}

function groupHasAvoidableRepeat(group: string[], option: [string, string][], history: RoundHistory): boolean {
  if (partnerRepeatCost(option, history) === 0) return false;

  return pairingOptions(group).some((candidate) => partnerRepeatCost(candidate, history) === 0);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function selectByes(players: string[], history: RoundHistory, roundNumber: number): string[] {
  const byesNeeded = Math.max(0, players.length - getActivePlayerCount(players.length));
  if (byesNeeded === 0) return [];

  const sorted = [...players].sort((a, b) => {
    const aByes = history.byeCounts[a] ?? 0;
    const bByes = history.byeCounts[b] ?? 0;
    if (aByes !== bByes) return aByes - bByes;

    const aPrevRoundBye = (history.lastByeRound[a] ?? -1) === roundNumber - 1 ? 1 : 0;
    const bPrevRoundBye = (history.lastByeRound[b] ?? -1) === roundNumber - 1 ? 1 : 0;
    if (aPrevRoundBye !== bPrevRoundBye) return aPrevRoundBye - bPrevRoundBye;

    const aGap = roundNumber - (history.lastByeRound[a] ?? Number.NEGATIVE_INFINITY);
    const bGap = roundNumber - (history.lastByeRound[b] ?? Number.NEGATIVE_INFINITY);
    if (aGap !== bGap) return bGap - aGap;

    return Math.random() - 0.5;
  });

  return sorted.slice(0, byesNeeded);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateRound(
  players: string[],
  history: RoundHistory,
  settings: { roundNumber: number },
  roundNumber = settings.roundNumber,
): { matches: MatchResult[]; byes: string[] } {
  const validPlayers = uniqueValidPlayers(players);
  const byes = selectByes(validPlayers, history, roundNumber);
  const activePlayers = validPlayers.filter((player) => !byes.includes(player));

  if (activePlayers.length === 0) {
    return { matches: [], byes };
  }

  const matches: MatchResult[] = [];

  if (roundNumber <= RANDOM_ROUNDS) {
    let bestMatches: MatchResult[] = [];
    let bestTotal = Number.POSITIVE_INFINITY;

    for (let trial = 0; trial < 2500; trial += 1) {
      const shuffled = shuffle(activePlayers);
      const trialGroups = chunk(shuffled, 4);
      let totalCost = 0;
      const trialMatches: MatchResult[] = [];

      for (const group of trialGroups) {
        if (group.length < 4) continue;

        let bestChoice: [string, string][] = [];
        let bestCost = Number.POSITIVE_INFINITY;

        for (const option of pairingOptions(group)) {
          if (groupHasAvoidableRepeat(group, option, history)) continue;
          const cost = pairingCost(option, history);
          if (cost < bestCost) {
            bestCost = cost;
            bestChoice = option;
          }
        }

        if (bestChoice.length === 0) {
          bestChoice = pairingOptions(group)[0];
        }

        totalCost += bestCost;
        trialMatches.push({
          teamA: [bestChoice[0][0], bestChoice[0][1]],
          teamB: [bestChoice[1][0], bestChoice[1][1]],
          scoreA: 0,
          scoreB: 0,
        });
      }

      if (totalCost < bestTotal) {
        bestTotal = totalCost;
        bestMatches = trialMatches;
      }
    }

    return { matches: bestMatches, byes };
  }

  const rankedStats = history.playerStats ?? {};
  const rankedPlayers = [...activePlayers].sort((a, b) => {
    const aStats = rankedStats[a] ?? {
      name: a,
      matchesPlayed: 0,
      byes: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0,
      wins: 0,
      ties: 0,
      losses: 0,
    };
    const bStats = rankedStats[b] ?? {
      name: b,
      matchesPlayed: 0,
      byes: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0,
      wins: 0,
      ties: 0,
      losses: 0,
    };

    const aAvgPoints = aStats.matchesPlayed > 0 ? aStats.points / aStats.matchesPlayed : 0;
    const bAvgPoints = bStats.matchesPlayed > 0 ? bStats.points / bStats.matchesPlayed : 0;
    const aScore = aAvgPoints + randomBetween(-RANKING_NOISE, RANKING_NOISE);
    const bScore = bAvgPoints + randomBetween(-RANKING_NOISE, RANKING_NOISE);

    return bScore - aScore;
  });

  for (const group of chunk(rankedPlayers, 4)) {
    if (group.length < 4) continue;

    let bestChoice: [string, string][] = [];
    let bestCost = Number.POSITIVE_INFINITY;

    for (const option of pairingOptions(group)) {
      if (groupHasAvoidableRepeat(group, option, history)) continue;
      const cost = pairingCost(option, history);
      if (cost < bestCost) {
        bestCost = cost;
        bestChoice = option;
      }
    }

    if (bestChoice.length === 0) {
      bestChoice = pairingOptions(group)[0];
    }

    matches.push({
      teamA: [bestChoice[0][0], bestChoice[0][1]],
      teamB: [bestChoice[1][0], bestChoice[1][1]],
      scoreA: 0,
      scoreB: 0,
    });
  }

  return { matches, byes };
}

export function computePlayerStats(rounds: RoundRecord[]): Record<string, PlayerMatchHistory> {
  const stats: Record<string, PlayerMatchHistory> = {};

  for (const round of rounds) {
    const roundStats = playerStatsForRound(round);
    for (const [name, value] of Object.entries(roundStats)) {
      const existing = stats[name] ?? {
        name,
        matchesPlayed: 0,
        byes: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        wins: 0,
        ties: 0,
        losses: 0,
      };

      existing.matchesPlayed += value.matchesPlayed;
      existing.byes += value.byes;
      existing.points += value.points;
      existing.gamesWon += value.gamesWon;
      existing.gamesLost += value.gamesLost;
      existing.wins += value.wins;
      existing.ties += value.ties;
      existing.losses += value.losses;
      stats[name] = existing;
    }
  }

  return stats;
}

export function rankPlayers(players: string[], rounds: RoundRecord[]): RankingEntry[] {
  const stats = computePlayerStats(rounds);

  const rankings = players.map((name) => {
    const entry = stats[name] ?? {
      name,
      matchesPlayed: 0,
      byes: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0,
      wins: 0,
      ties: 0,
      losses: 0,
    };

    return {
      name,
      totalPoints: entry.points,
      matchesPlayed: entry.matchesPlayed,
      byes: entry.byes,
      avgPoints: entry.matchesPlayed > 0 ? entry.points / entry.matchesPlayed : 0,
      avgGameDifferential: entry.matchesPlayed > 0 ? (entry.gamesWon - entry.gamesLost) / entry.matchesPlayed : 0,
      wins: entry.wins,
      ties: entry.ties,
      losses: entry.losses,
      gamesWon: entry.gamesWon,
      gamesLost: entry.gamesLost,
    };
  });

  return rankings.sort((a, b) => {
    if (a.matchesPlayed === 0 && b.matchesPlayed !== 0) return 1;
    if (a.matchesPlayed !== 0 && b.matchesPlayed === 0) return -1;
    if (a.avgPoints !== b.avgPoints) return b.avgPoints - a.avgPoints;
    if (a.avgGameDifferential !== b.avgGameDifferential) return b.avgGameDifferential - a.avgGameDifferential;
    return a.name.localeCompare(b.name);
  });
}

export function buildLiveInfo(players: string[]): string {
  const total = uniqueValidPlayers(players).length;
  if (total === 0) {
    return `0 players, ${COURTS} courts → 0 play per round, 0 sit out per round. Over ${TOTAL_ROUNDS} rounds, everyone plays 0 games.`;
  }

  const { active, byes } = getByeInfo(total);
  const totalSlots = active * TOTAL_ROUNDS;
  const baseGames = Math.floor(totalSlots / total);
  const remainder = totalSlots % total;

  if (remainder === 0) {
    return `${total} players, ${COURTS} courts → ${active} play per round, ${byes} sit out per round. Over ${TOTAL_ROUNDS} rounds, everyone plays ${baseGames} games.`;
  }

  const playersWithMore = remainder;
  const playersWithLess = total - remainder;
  const moreGames = baseGames + 1;
  const lessGames = baseGames;

  return `${total} players, ${COURTS} courts → ${active} play per round, ${byes} sit out per round. Over ${TOTAL_ROUNDS} rounds, ${playersWithMore} players are playing ${moreGames} games and ${playersWithLess} players are playing ${lessGames} games.`;
}

export function exportResultsCsv(players: string[], rounds: RoundRecord[]): string {
  const rows: string[] = [];
  rows.push(csvRow(['name', 'avg_points', 'total_points', 'matches_played', 'byes', 'avg_game_diff', 'wins', 'ties', 'losses', 'games_won', 'games_lost']));

  for (const player of rankPlayers(players, rounds)) {
    rows.push(csvRow([
      player.name,
      player.avgPoints.toFixed(2),
      player.totalPoints,
      player.matchesPlayed,
      player.byes,
      player.avgGameDifferential.toFixed(2),
      player.wins,
      player.ties,
      player.losses,
      player.gamesWon,
      player.gamesLost,
    ]));
  }

  return rows.join('\n');
}

export function exportScheduleCsv(rounds: RoundRecord[]): string {
  const rows = [
    csvRow([
      'round',
      'court',
      'team_a_player_1',
      'team_a_player_2',
      'score_a',
      'score_b',
      'team_b_player_1',
      'team_b_player_2',
      'submitted',
      'bye',
    ]),
  ];

  for (const round of rounds) {
    round.matches.forEach((match, index) => {
      rows.push(csvRow([
        round.roundNumber,
        index + 1,
        ...match.teamA,
        match.scoreA,
        match.scoreB,
        ...match.teamB,
        round.submitted,
        '',
      ]));
    });

    for (const bye of round.byes) {
      rows.push(csvRow([round.roundNumber, '', '', '', '', '', '', '', round.submitted, bye]));
    }
  }

  return rows.join('\n');
}

function csvRow(values: (string | number | boolean)[]): string {
  return values.map((value) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',');
}

export function determineWinner(players: string[], rounds: RoundRecord[]): string | null {
  const ranking = rankPlayers(players, rounds);
  return ranking.length > 0 ? ranking[0].name : null;
}

export function createDemoRoundScores(round: RoundRecord): RoundRecord {
  return {
    ...round,
    matches: round.matches.map((match) => ({
      ...match,
      scoreA: Math.floor(Math.random() * 8),
      scoreB: Math.floor(Math.random() * 8),
    })),
    submitted: true,
  };
}

export function isRoundReady(round: RoundRecord): boolean {
  return round.matches.length > 0 && round.matches.every((match) => match.scoreA >= 0 && match.scoreB >= 0);
}

export function noConsecutiveByes(players: string[], rounds: RoundRecord[]): boolean {
  const byesByRound = rounds.map((round) => round.byes);

  for (let index = 1; index < byesByRound.length; index += 1) {
    const previous = byesByRound[index - 1];
    const current = byesByRound[index];
    const overlap = previous.filter((name) => current.includes(name));
    if (overlap.length > 0 && players.length > 4) return false;
  }

  return true;
}

export function byeCountsWithinOne(players: string[], rounds: RoundRecord[]): boolean {
  const counts: Record<string, number> = {};
  for (const player of players) counts[player] = 0;

  for (const round of rounds) {
    for (const bye of round.byes) {
      counts[bye] = (counts[bye] ?? 0) + 1;
    }
  }

  const values = Object.values(counts);
  return Math.max(...values) - Math.min(...values) <= 1;
}

export function tieBreakOrderIsAlphabetical(): boolean {
  const values = [
    { name: 'Zed', avgPoints: 3, avgGameDifferential: 1 },
    { name: 'Amy', avgPoints: 3, avgGameDifferential: 1 },
    { name: 'Mia', avgPoints: 3, avgGameDifferential: -1 },
  ];

  const sorted = [...values].sort((a, b) => {
    if (a.avgPoints !== b.avgPoints) return b.avgPoints - a.avgPoints;
    if (a.avgGameDifferential !== b.avgGameDifferential) return b.avgGameDifferential - a.avgGameDifferential;
    return a.name.localeCompare(b.name);
  });

  return sorted[0].name === 'Amy' && sorted[1].name === 'Zed';
}

export const tournamentSettings = {
  totalRounds: TOTAL_ROUNDS,
  courts: COURTS,
  randomRounds: RANDOM_ROUNDS,
  rankingNoise: RANKING_NOISE,
  winPoints: WIN_POINTS,
  tiePoints: TIE_POINTS,
};
