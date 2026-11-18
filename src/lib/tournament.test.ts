import { describe, expect, it } from 'vitest';
import { COURTS, RANDOM_ROUNDS, TOTAL_ROUNDS } from '../config';
import { buildHistoryFromRounds, buildLiveInfo, byeCountsWithinOne, exportScheduleCsv, generateRound, noConsecutiveByes, rankPlayers, tieBreakOrderIsAlphabetical, uniqueValidPlayers } from './tournament';
import type { RoundRecord } from '../types';

function makePlayers(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
}

function buildFullTournament(players: string[]): RoundRecord[] {
  let history = buildHistoryFromRounds([]);
  const rounds: RoundRecord[] = [];

  for (let roundNumber = 1; roundNumber <= TOTAL_ROUNDS; roundNumber += 1) {
    const generated = generateRound(players, history, { roundNumber }, roundNumber);
    const nextRound: RoundRecord = {
      roundNumber,
      byes: generated.byes,
      matches: generated.matches,
      submitted: true,
    };
    rounds.push(nextRound);
    history = buildHistoryFromRounds(rounds);
  }

  return rounds;
}

describe('tournament logic', () => {
  it('supports 16 players across 7 rounds', () => {
    const players = makePlayers(16);
    const rounds = buildFullTournament(players);

    expect(rounds).toHaveLength(TOTAL_ROUNDS);
    expect(rounds.every((round) => round.matches.length === COURTS)).toBe(true);
    expect(noConsecutiveByes(players, rounds)).toBe(true);
    expect(byeCountsWithinOne(players, rounds)).toBe(true);
  });

  it('supports 18 players across 7 rounds', () => {
    const players = makePlayers(18);
    const rounds = buildFullTournament(players);

    expect(rounds).toHaveLength(TOTAL_ROUNDS);
    expect(rounds.every((round) => round.matches.length === 4)).toBe(true);
    expect(noConsecutiveByes(players, rounds)).toBe(true);
    expect(byeCountsWithinOne(players, rounds)).toBe(true);
  });

  it('supports 20 players across 7 rounds', () => {
    const players = makePlayers(20);
    const rounds = buildFullTournament(players);

    expect(rounds).toHaveLength(TOTAL_ROUNDS);
    expect(rounds.every((round) => round.matches.length === 4)).toBe(true);
    expect(noConsecutiveByes(players, rounds)).toBe(true);
    expect(byeCountsWithinOne(players, rounds)).toBe(true);
  });

  it('supports 25 players across 7 rounds', () => {
    const players = makePlayers(25);
    const rounds = buildFullTournament(players);

    expect(rounds).toHaveLength(TOTAL_ROUNDS);
    expect(rounds.every((round) => round.matches.length === 4)).toBe(true);
    expect(noConsecutiveByes(players, rounds)).toBe(true);
    expect(byeCountsWithinOne(players, rounds)).toBe(true);
  });

  it('keeps player names unique and trims whitespace', () => {
    const players = [' Alice ', 'alice', 'Bob', 'Carol', 'David'];
    expect(uniqueValidPlayers(players)).toEqual(['Alice', 'Bob', 'Carol', 'David']);
  });

  it('has alphabetical tie-break order', () => {
    const ranking = rankPlayers(['Zed', 'Amy', 'Mia'], []);
    expect(ranking.map((item) => item.name)).toEqual(['Amy', 'Mia', 'Zed']);
    expect(tieBreakOrderIsAlphabetical()).toBe(true);
  });

  it('uses performance-based court groups starting in round 4', () => {
    const highPerformers = ['High 1', 'High 2', 'High 3', 'High 4'];
    const lowPerformers = ['Low 1', 'Low 2', 'Low 3', 'Low 4'];
    const players = [...highPerformers, ...lowPerformers];
    const history = buildHistoryFromRounds([]);

    history.playerStats = Object.fromEntries(players.map((name) => {
      const isHighPerformer = highPerformers.includes(name);
      return [name, {
        name,
        matchesPlayed: 1,
        byes: 0,
        points: isHighPerformer ? 3 : 0,
        gamesWon: isHighPerformer ? 6 : 0,
        gamesLost: isHighPerformer ? 0 : 6,
        wins: isHighPerformer ? 1 : 0,
        ties: 0,
        losses: isHighPerformer ? 0 : 1,
      }];
    }));

    expect(RANDOM_ROUNDS).toBe(3);

    const { matches } = generateRound(players, history, { roundNumber: 4 });

    expect(matches).toHaveLength(2);
    expect(matches.every((match) => {
      const group = [...match.teamA, ...match.teamB];
      return group.every((player) => highPerformers.includes(player))
        || group.every((player) => lowPerformers.includes(player));
    })).toBe(true);
  });

  it('reports the correct game distribution for 20 players', () => {
    const text = buildLiveInfo(makePlayers(20));
    expect(text).toContain('12 players are playing 6 games');
    expect(text).toContain('8 players are playing 5 games');
  });

  it('exports match schedules, results, byes, and submission status as CSV', () => {
    const rounds: RoundRecord[] = [
      {
        roundNumber: 1,
        byes: ['Sam, "The Ace"'],
        matches: [{
          teamA: ['Alice', 'Bob'],
          teamB: ['Carol', 'David'],
          scoreA: 6,
          scoreB: 4,
        }],
        submitted: true,
      },
      {
        roundNumber: 2,
        byes: [],
        matches: [{
          teamA: ['Eve', 'Frank'],
          teamB: ['Grace', 'Heidi'],
          scoreA: 0,
          scoreB: 0,
        }],
        submitted: false,
      },
    ];

    expect(exportScheduleCsv(rounds)).toBe([
      'round,court,team_a_player_1,team_a_player_2,score_a,score_b,team_b_player_1,team_b_player_2,submitted,bye',
      '1,1,Alice,Bob,6,4,Carol,David,true,',
      '1,,,,,,,,true,"Sam, ""The Ace"""',
      '2,1,Eve,Frank,0,0,Grace,Heidi,false,',
    ].join('\n'));
  });
});
