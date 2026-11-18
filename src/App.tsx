import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PLAYER_COUNT, TOTAL_ROUNDS } from './config';
import {
  buildHistoryFromRounds,
  buildLiveInfo,
  createDemoRoundScores,
  determineWinner,
  exportResultsCsv,
  exportScheduleCsv,
  generateRound,
  isRoundReady,
  rankPlayers,
  shuffle,
  uniqueValidPlayers,
} from './lib/tournament';
import { localStorageAdapter, resolveStorageAdapter } from './lib/storage';
import type { MatchResult, RoundRecord, TournamentState } from './types';

const DEMO_PLAYER_NAMES = [
  'Avery', 'Blake', 'Cameron', 'Charlie', 'Dakota',
  'Drew', 'Eden', 'Ellis', 'Finley', 'Frankie',
  'Hayden', 'Jamie', 'Jesse', 'Jordan', 'Kai',
  'Kendall', 'Lee', 'Morgan', 'Nico', 'Parker',
  'Quinn', 'Reese', 'Riley', 'Rowan', 'Skyler',
];

const emptyState: TournamentState = {
  players: Array.from({ length: DEFAULT_PLAYER_COUNT }, () => ''),
  started: false,
  currentRound: 1,
  rounds: [],
  winner: null,
  demoMode: false,
};

function App() {
  const [players, setPlayers] = useState<string[]>(Array.from({ length: DEFAULT_PLAYER_COUNT }, () => ''));
  const [tournament, setTournament] = useState<TournamentState>(emptyState);
  const [view, setView] = useState<'setup' | 'round' | 'leaderboard' | 'schedule'>('setup');
  const [pendingScores, setPendingScores] = useState<Record<string, Partial<{ scoreA: string; scoreB: string }>>>({});
  const [previewRound, setPreviewRound] = useState<RoundRecord | null>(null);

  useEffect(() => {
    const adapter = resolveStorageAdapter();
    adapter.read().then((saved) => {
      if (saved && saved.players.length > 0) {
        setTournament(saved);
        setPlayers(saved.players);
        setView(saved.started ? 'round' : 'setup');
      }
    });
  }, []);

  useEffect(() => {
    const adapter = resolveStorageAdapter();
    adapter.write(tournament).catch(() => undefined);
  }, [tournament]);

  const validPlayers = useMemo(() => uniqueValidPlayers(players), [players]);
  const leaderboard = useMemo(() => rankPlayers(validPlayers, tournament.rounds), [validPlayers, tournament.rounds]);
  const summary = buildLiveInfo(validPlayers);

  const currentRound = tournament.rounds.find((round) => round.roundNumber === tournament.currentRound) ?? previewRound;

  function addPlayer() {
    if (players.length >= 25) return;
    setPlayers((previous) => [...previous, '']);
  }

  function fillDemoNames() {
    setPlayers((previous) => shuffle(DEMO_PLAYER_NAMES).slice(0, previous.length));
  }

  function removePlayer(index: number) {
    if (players.length <= 4) return;
    setPlayers((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  function updatePlayer(index: number, value: string) {
    setPlayers((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
  }

  function validAndReady() {
    return validPlayers.length >= 4 && validPlayers.length <= 25;
  }

  function makeRound(roundNumber: number): RoundRecord {
    const history = buildHistoryFromRounds(tournament.rounds);
    const generated = generateRound(validPlayers, history, { roundNumber }, roundNumber);
    return {
      roundNumber,
      byes: generated.byes,
      matches: generated.matches,
      submitted: false,
    };
  }

  function startTournament() {
    if (!validAndReady()) return;

    const roundOne = makeRound(1);
    const nextState: TournamentState = {
      players: validPlayers,
      started: true,
      startedAt: Date.now(),
      currentRound: 1,
      rounds: [roundOne],
      winner: null,
      demoMode: false,
    };

    setTournament(nextState);
    setView('round');
  }

  function getKeyForMatch(match: MatchResult): string {
    return `${match.teamA.join('-')}::${match.teamB.join('-')}`;
  }

  function getScoreInputValue(match: MatchResult, team: 'scoreA' | 'scoreB'): string {
    const pendingScore = pendingScores[getKeyForMatch(match)]?.[team];
    if (pendingScore !== undefined) return pendingScore;

    const score = match[team];
    return score === 0 ? '' : String(score);
  }

  function submitRound() {
    const round = currentRound;
    if (!round) return;

    const updatedMatches = round.matches.map((match) => {
      const key = getKeyForMatch(match);
      const override = pendingScores[key];
      return {
        ...match,
        scoreA: Number(override?.scoreA ?? match.scoreA),
        scoreB: Number(override?.scoreB ?? match.scoreB),
      };
    });

    const finalisedRound: RoundRecord = {
      ...round,
      matches: updatedMatches,
      submitted: true,
    };

    const roundsWithCurrent = tournament.rounds.map((item) =>
      item.roundNumber === finalisedRound.roundNumber ? finalisedRound : item,
    );

    if (finalisedRound.roundNumber === TOTAL_ROUNDS) {
      setTournament({
        ...tournament,
        players: validPlayers,
        rounds: roundsWithCurrent,
        winner: determineWinner(validPlayers, roundsWithCurrent),
        currentRound: TOTAL_ROUNDS,
      });
      setView('leaderboard');
      return;
    }

    const nextRoundNumber = finalisedRound.roundNumber + 1;
    const history = buildHistoryFromRounds(roundsWithCurrent);
    const generated = generateRound(validPlayers, history, { roundNumber: nextRoundNumber }, nextRoundNumber);

    setTournament({
      ...tournament,
      players: validPlayers,
      rounds: roundsWithCurrent,
      currentRound: nextRoundNumber,
    });

    setPreviewRound({
      roundNumber: nextRoundNumber,
      matches: generated.matches,
      byes: generated.byes,
      submitted: false,
    });
    setView('round');
  }

  function confirmPreview() {
    if (!previewRound) return;

    const nextRounds = [...tournament.rounds, previewRound];
    setTournament({
      ...tournament,
      rounds: nextRounds,
      currentRound: previewRound.roundNumber,
    });
    setPreviewRound(null);
    setView('round');
  }

  function reshufflePreview() {
    if (!previewRound) return;

    const history = buildHistoryFromRounds(tournament.rounds);
    const generated = generateRound(validPlayers, history, { roundNumber: previewRound.roundNumber }, previewRound.roundNumber);

    setPreviewRound({
      roundNumber: previewRound.roundNumber,
      matches: generated.matches,
      byes: generated.byes,
      submitted: false,
    });
  }

  function exportCsv() {
    const csv = exportResultsCsv(validPlayers, tournament.rounds);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tournament-leaderboard.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSchedule() {
    const rounds = tournament.rounds.map((round) => {
      if (round.roundNumber !== tournament.currentRound) return round;

      return {
        ...round,
        matches: round.matches.map((match) => {
          const scores = pendingScores[getKeyForMatch(match)];
          return {
            ...match,
            ...(scores?.scoreA !== undefined && scores.scoreA !== '' ? { scoreA: Number(scores.scoreA) } : {}),
            ...(scores?.scoreB !== undefined && scores.scoreB !== '' ? { scoreB: Number(scores.scoreB) } : {}),
          };
        }),
      };
    });
    const csv = exportScheduleCsv(rounds);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tournament-schedule.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetTournament() {
    const first = window.confirm('Reset tournament?');
    if (!first) return;
    const second = window.confirm('This will clear the current tournament. Confirm?');
    if (!second) return;

    setTournament(emptyState);
    setPlayers(Array.from({ length: DEFAULT_PLAYER_COUNT }, () => ''));
    setPreviewRound(null);
    setView('setup');
    localStorageAdapter.clear();
  }

  function fillDemoMode() {
    const names = uniqueValidPlayers(players);
    if (names.length < 4) return;

    let history = buildHistoryFromRounds([]);
    const rounds: RoundRecord[] = [];

    for (let roundNumber = 1; roundNumber <= TOTAL_ROUNDS; roundNumber += 1) {
      const generated = generateRound(names, history, { roundNumber }, roundNumber);
      const demoRound = createDemoRoundScores({
        roundNumber,
        matches: generated.matches,
        byes: generated.byes,
        submitted: false,
      });

      rounds.push(demoRound);
      history = buildHistoryFromRounds(rounds);
    }

    setTournament({
      players: names,
      started: true,
      startedAt: Date.now(),
      currentRound: TOTAL_ROUNDS,
      rounds,
      winner: determineWinner(names, rounds),
      demoMode: true,
    });
    setView('leaderboard');
  }

  const roundReady = currentRound
    ? isRoundReady(currentRound) &&
      currentRound.matches.every((match) => {
        const scoreA = getScoreInputValue(match, 'scoreA');
        const scoreB = getScoreInputValue(match, 'scoreB');
        return scoreA !== '' &&
          scoreB !== '' &&
          Number.isFinite(Number(scoreA)) &&
          Number.isFinite(Number(scoreB)) &&
          Number(scoreA) >= 0 &&
          Number(scoreB) >= 0;
      })
    : false;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Americano / Mexicano</p>
          <h1>Padel tournament</h1>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={exportSchedule} disabled={!tournament.started}>Export schedule CSV</button>
          <button className="secondary" onClick={exportCsv}>Export leaderboard CSV</button>
          <button className="warning" onClick={resetTournament}>Reset tournament</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>Setup</button>
        <button className={view === 'round' ? 'active' : ''} onClick={() => setView('round')} disabled={!tournament.started}>Round</button>
        <button className={view === 'leaderboard' ? 'active' : ''} onClick={() => setView('leaderboard')} disabled={!tournament.started}>Leaderboard</button>
        <button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')} disabled={!tournament.started}>Schedule</button>
      </nav>

      {view === 'setup' && (
        <main className="panel">
          <div className="title-row">
            <h2>Player list</h2>
          </div>

          <div className="player-grid">
            {players.map((player, index) => (
              <div className="player-row" key={`player-row-${index}`}>
                <label className="player-label">Player {index + 1}</label>
                <input
                  value={player}
                  onChange={(event) => updatePlayer(index, event.target.value)}
                  placeholder="Player name"
                />
                <button className="ghost" disabled={players.length <= 4} onClick={() => removePlayer(index)}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="action-row">
            <button className="secondary" onClick={addPlayer}>Add player</button>
            <button className="secondary" onClick={fillDemoNames}>Fill random demo names</button>
          </div>

          <div className="info-box">
            <strong>Live info</strong>
            <p>{summary}</p>
          </div>

          <div className="action-row">
            <button className="primary" onClick={startTournament} disabled={!validAndReady()}>
              Start tournament
            </button>
            <button className="secondary" onClick={fillDemoMode}>Start Demo</button>
          </div>
        </main>
      )}

      {view === 'round' && tournament.started && (
        <main className="panel">
          <div className="round-header">
            <h2>{previewRound ? `Preview round ${previewRound.roundNumber}` : `Round ${tournament.currentRound} of ${TOTAL_ROUNDS}`}</h2>

            {previewRound && (
              <div className="preview-box">
                <span>Previewed round is not saved until confirmed.</span>
                <div className="preview-actions">
                  <button className="secondary" onClick={reshufflePreview}>Reshuffle</button>
                  <button className="primary" onClick={confirmPreview}>Confirm</button>
                </div>
              </div>
            )}
          </div>

          {previewRound ? (
            <>
              <div className="bye-box">
                <h3>Byes</h3>
                <div className="bye-list">{previewRound.byes.length ? previewRound.byes.join(', ') : 'No players on a bye'}</div>
              </div>

              <div className="court-grid">
                {previewRound.matches.map((match, index) => (
                  <div className="court-card" key={`preview-${index}`}>
                    <h3>Court {index + 1}</h3>
                    <div className="match-score-grid">
                      <div className="team-score-box team-a">
                        <div className="team-label">Team A</div>
                        <div className="team-player-list">
                          <span>{match.teamA[0]}</span>
                          <span>{match.teamA[1]}</span>
                        </div>
                      </div>
                      <div className="team-score-box team-b">
                        <div className="team-label">Team B</div>
                        <div className="team-player-list">
                          <span>{match.teamB[0]}</span>
                          <span>{match.teamB[1]}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : currentRound ? (
            <>
              <div className="bye-box">
                <h3>Byes</h3>
                <div className="bye-list">{currentRound.byes.length ? currentRound.byes.join(', ') : 'No players on a bye'}</div>
              </div>

              <div className="court-grid">
                {currentRound.matches.map((match, index) => (
                  <div className="court-card" key={`court-${index}`}>
                    <h3>Court {index + 1}</h3>
                    <div className="match-score-grid">
                      <div className="team-score-box team-a">
                        <div className="team-label">Team A</div>
                        <div className="team-player-list">
                          <span>{match.teamA[0]}</span>
                          <span>{match.teamA[1]}</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          placeholder="Score"
                          value={getScoreInputValue(match, 'scoreA')}
                          onChange={(event) => {
                            const key = getKeyForMatch(match);
                            setPendingScores((previous) => ({
                              ...previous,
                              [key]: { ...previous[key], scoreA: event.target.value },
                            }));
                          }}
                        />
                      </div>

                      <div className="team-score-box team-b">
                        <div className="team-label">Team B</div>
                        <div className="team-player-list">
                          <span>{match.teamB[0]}</span>
                          <span>{match.teamB[1]}</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          placeholder="Score"
                          value={getScoreInputValue(match, 'scoreB')}
                          onChange={(event) => {
                            const key = getKeyForMatch(match);
                            setPendingScores((previous) => ({
                              ...previous,
                              [key]: { ...previous[key], scoreB: event.target.value },
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="submit-area">
                <button
                  className="primary"
                  disabled={!roundReady}
                  onClick={() => {
                    const confirmed = window.confirm('Scores cannot be changed after submitting. Continue?');
                    if (confirmed) submitRound();
                  }}
                >
                  Submit round
                </button>
              </div>
            </>
          ) : null}
        </main>
      )}

      {view === 'leaderboard' && tournament.started && (
        <main className="panel">
          <h2>Leaderboard</h2>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Avg points</th>
                <th>Total points</th>
                <th>Matches</th>
                <th>Byes</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((player, index) => (
                <tr key={player.name} className={index < 3 ? 'top-three' : ''}>
                  <td>{index + 1}</td>
                  <td>{player.name}</td>
                  <td>{player.avgPoints.toFixed(2)}</td>
                  <td>{player.totalPoints}</td>
                  <td>{player.matchesPlayed}</td>
                  <td>{player.byes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      )}

      {view === 'schedule' && tournament.started && (
        <main className="panel">
          <h2>Schedule</h2>
          <div className="history-grid">
            {tournament.rounds.map((round) => (
              <div className="history-card" key={`round-${round.roundNumber}`}>
                <h3>Round {round.roundNumber}</h3>
                <div>
                  <strong>Byes:</strong> {round.byes.length ? round.byes.join(', ') : 'None'}
                </div>
                {round.matches.map((match, index) => (
                  <div className="history-match" key={`history-${round.roundNumber}-${index}`}>
                    <span>{match.teamA[0]} / {match.teamA[1]}</span>
                    <strong>{match.scoreA} - {match.scoreB}</strong>
                    <span>{match.teamB[0]} / {match.teamB[1]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
