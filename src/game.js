export const TIKIS = [
  { name: '日耀', icon: '🌞', color: '#df554b' },
  { name: '海龜', icon: '🐢', color: '#e8843d' },
  { name: '鸚鵡', icon: '🦜', color: '#e0b63e' },
  { name: '豹影', icon: '🐆', color: '#91a948' },
  { name: '花冠', icon: '🌺', color: '#4e9a68' },
  { name: '章魚', icon: '🐙', color: '#45a7a5' },
  { name: '蜥蜴', icon: '🦎', color: '#568fc0' },
  { name: '螃蟹', icon: '🦀', color: '#8c70b7' },
  { name: '海魚', icon: '🐠', color: '#89949b' },
];
const HAND = ['up1', 'up1', 'up2', 'up2', 'up3', 'topple', 'toast'];
const shuffled = (items, random) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random.Number() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const playerIndex = id => Number(id);

export const TikiTopple = {
  name: 'tiki-topple',
  minPlayers: 2,
  maxPlayers: 4,
  setup: ({ ctx, random }, setupData) => ({
    targetScore: Math.max(1, Math.min(60, Number(setupData?.targetScore) || 30)),
    hostID: '0', round: 1, phase: 'lobby',
    players: Array.from({ length: ctx.numPlayers }, (_, i) => ({ name: `玩家 ${i + 1}`, joined: false, color: null, preferredColor: null, hand: [], secret: [], total: 0, roundScore: 0, roundPlays: 0, rps: null, emoji: null, continue: null })),
    board: shuffled(TIKIS.map((tiki, id) => ({ id, ...tiki, active: true })), random),
    played: [], removed: [], lastMove: null, roundStarter: 0, roundTurn: 0, gameWinner: null,
  }),
  playerView: ({ G, playerID }) => ({ ...G, players: G.players.map((p, i) => ({ ...p, hand: String(i) === String(playerID) ? p.hand : [], secret: String(i) === String(playerID) ? p.secret : [] })) }),
  turn: {
    order: {
      first: ({ G }) => G.players[G.roundStarter]?.joined ? G.roundStarter : Math.max(0, G.players.findIndex(p => p.joined)),
      next: ({ G, ctx }) => {
        let next = (ctx.playOrderPos + 1) % ctx.numPlayers;
        for (let attempts = 0; attempts < ctx.numPlayers; attempts++) {
          if (G.players[next]?.joined) return next;
          next = (next + 1) % ctx.numPlayers;
        }
        return ctx.playOrderPos;
      },
    },
    stages: {
      lobby: { moves: {
        SetProfile: ({ G, playerID }, profile) => { const p = G.players[playerIndex(playerID)]; if (!p || !['lobby', 'roundEnd'].includes(G.phase)) return; p.joined = true; p.name = String(profile.name || p.name).trim().slice(0, 20) || p.name; p.preferredColor = profile.color || null; p.color = profile.color || null; },
        StartGame: (...args) => TikiTopple.moves.StartGame(...args),
        ContinueNext: (...args) => TikiTopple.moves.ContinueNext(...args),
        LeaveGame: (...args) => TikiTopple.moves.LeaveGame(...args),
      } },
      rps: { moves: {
        PickRps: ({ G, playerID }, hand) => { const p = G.players[playerIndex(playerID)]; if (p && ['rock', 'paper', 'scissors'].includes(hand)) p.rps = hand; },
        ResolveRps: (...args) => TikiTopple.moves.ResolveRps(...args),
        LeaveGame: (...args) => TikiTopple.moves.LeaveGame(...args),
      } },
      play: { moves: {
        PlayCard: ({ G, playerID, ctx, events }, cardIndex, tikiId) => {
          const p = G.players[playerIndex(playerID)];
          if (!p || G.phase !== 'playing' || String(playerID) !== String(ctx.currentPlayer)) return;
          const card = p.hand[cardIndex];
          if (!card) return;
          const active = G.board.filter(t => t.active);
          const index = active.findIndex(t => t.id === tikiId);
          if (index < 0) return;
          if (card === 'toast' && p.roundPlays === 0) return;
          if (card.startsWith('up')) {
            const amount = Number(card.slice(2));
            if (index < amount) return;
            const destination = index - amount;
            const [tiki] = active.splice(index, 1); active.splice(destination, 0, tiki);
            G.board = [...active, ...G.board.filter(t => !t.active)];
            G.lastMove = { type: 'move', tikiId, from: index, to: destination, by: playerID, stamp: G.roundTurn };
          } else if (card === 'topple') {
            const [moving] = active.splice(index, 1); active.push(moving);
            G.board = [...active, ...G.board.filter(t => !t.active)];
            G.lastMove = { type: 'topple', tikiId, by: playerID, stamp: G.roundTurn };
          } else {
            const bottom = active.at(-1);
            if (!bottom || bottom.id !== tikiId) return;
            bottom.active = false; G.removed.push(tikiId);
            G.lastMove = { type: 'toast', tikiId, by: playerID, stamp: G.roundTurn };
          }
          p.hand.splice(cardIndex, 1); p.roundPlays++; G.played.push({ playerID, card }); G.roundTurn++;
          if (G.board.filter(t => t.active).length <= 3 || G.players.every(pl => pl.hand.length === 0)) scoreRound(G, events);
          else events.endTurn();
        },
        SendEmote: ({ G, playerID }, emoji) => { const p = G.players[playerIndex(playerID)]; if (p) p.emoji = emoji; },
        LeaveGame: (...args) => TikiTopple.moves.LeaveGame(...args),
      } },
    },
    onBegin: ({ G, events }) => {
      const stage = G.phase === 'playing' ? 'play' : G.phase === 'rps' ? 'rps' : 'lobby';
      events.setActivePlayers({ all: stage });
    },
  },
  moves: {
    StartGame: ({ G, playerID, ctx, random, events }, scoreGoal) => {
      if (playerID !== G.hostID || G.phase !== 'lobby' || G.players.filter(p => p.joined).length < 2) return;
      G.targetScore = Math.max(1, Math.min(60, Number(scoreGoal) || G.targetScore));
      const palette = ['coral', 'jade', 'sun', 'lavender'];
      const chosen = G.players.map(p => p.preferredColor).filter(Boolean);
      G.players.filter(p => p.joined && !p.preferredColor).forEach(p => {
        const available = palette.filter(color => !chosen.includes(color) && !G.players.some(other => other !== p && other.color === color));
        p.color = available[0] || palette.find(color => !G.players.some(other => other !== p && other.color === color)) || palette[0];
      });
      const duplicates = chosen.filter((c, i) => chosen.indexOf(c) !== i);
      if (duplicates.length) { G.phase = 'rps'; events.setActivePlayers({ all: 'rps' }); return; }
      beginRound(G, ctx, random, events, true);
    },
    ResolveRps: ({ G, playerID, ctx, random, events }) => {
      if (playerID !== G.hostID || G.phase !== 'rps' || G.players.some(p => p.joined && !p.rps)) return;
      const duplicateColors = [...new Set(G.players.map(p => p.preferredColor).filter((c, i, a) => c && a.indexOf(c) !== i))];
      const palette = ['coral', 'jade', 'sun', 'lavender'];
      for (const color of duplicateColors) {
        const involved = G.players.filter(p => p.preferredColor === color);
        const beats = { rock:'scissors', paper:'rock', scissors:'paper' };
        const winners = involved.filter(p => involved.every(q => p === q || (p.rps === q.rps ? true : beats[p.rps] === q.rps)));
        const winner = winners.length === 1 ? winners[0] : involved[Math.floor(random.Number() * involved.length)];
        involved.filter(p => p !== winner).forEach(p => { const available = palette.filter(c => !G.players.some(q => q !== p && q.color === c)); p.color = available[Math.floor(random.Number() * available.length)] || palette[Math.floor(random.Number() * 4)]; });
      }
      G.players.forEach(p => { p.color ||= palette[Math.floor(random.Number() * palette.length)]; p.rps = null; });
      beginRound(G, ctx, random, events, true);
    },
    ContinueNext: ({ G, playerID, ctx, random, events }, stay) => {
      if (G.phase !== 'roundEnd') return;
      const p = G.players[playerIndex(playerID)]; if (!p?.joined) return;
      p.continue = Boolean(stay);
      if (!stay) p.joined = false;
      const stillHere = G.players.filter(pl => pl.joined);
      if (stillHere.some(pl => pl.continue === null)) return;
      const continuing = stillHere.filter(pl => pl.continue === true);
      if (continuing.length < 2) { G.phase = 'gameEnd'; G.gameWinner = null; events.setActivePlayers({ all: 'lobby' }); return; }
      G.players.forEach(pl => { if (pl.joined) pl.continue = null; });
      G.round++; G.roundStarter = (G.roundStarter + 1) % G.players.length;
      for (let i = 0; i < G.players.length && !G.players[G.roundStarter].joined; i++) G.roundStarter = (G.roundStarter + 1) % G.players.length;
      beginRound(G, ctx, random, events, false);
    },
    LeaveGame: ({ G, playerID, ctx, random, events }) => {
      const p = G.players[playerIndex(playerID)]; if (!p?.joined) return;
      p.joined = false; p.continue = false;
      const remaining = G.players.filter(pl => pl.joined);
      if (String(G.hostID) === String(playerID) && remaining[0]) G.hostID = String(G.players.indexOf(remaining[0]));
      if (remaining.length < 2) { G.phase = 'gameEnd'; G.gameWinner = null; events.setActivePlayers({ all: 'lobby' }); }
      else if (G.phase === 'rps') { G.phase = 'lobby'; G.players.forEach(pl => { pl.rps = null; }); events.setActivePlayers({ all: 'lobby' }); }
      else if (G.phase === 'playing' && ctx.currentPlayer === playerID) events.endTurn();
      else if (G.phase === 'roundEnd' && remaining.length >= 2 && remaining.every(pl => pl.continue === true)) {
        const nextID = String(G.players.indexOf(remaining[0]));
        TikiTopple.moves.ContinueNext({ G, playerID: nextID, ctx, random, events }, true);
      }
    },
  },
};

function beginRound(G, ctx, random, events, first) {
  G.players.forEach((p, i) => {
    if (!p.joined) { p.hand = []; p.secret = []; return; }
    p.hand = shuffled(HAND, random);
    if (G.players.filter(pl => pl.joined).length >= 3) p.hand.splice(p.hand.indexOf('up1'), 1);
    p.secret = shuffled(TIKIS.map((_, n) => n), random).slice(0, 3);
    p.roundScore = 0; p.roundPlays = 0; p.emoji = null;
    // Same-color picks are decided by the RPS winner, then remaining conflicts get an unused color.
    if (!p.color) p.color = p.preferredColor || ['coral', 'jade', 'sun', 'lavender'][i];
  });
  G.board = shuffled(TIKIS.map((tiki, id) => ({ id, ...tiki, active: true })), random);
  G.removed = []; G.played = []; G.roundTurn = 0; G.lastMove = null;
  G.phase = 'playing'; if (first) G.roundStarter = 0;
  events.setActivePlayers({ all: 'play' }); events.endTurn({ next: String(G.roundStarter) });
}

function scoreRound(G, events) {
  const ranked = G.board.filter(t => t.active);
  for (const p of G.players) {
    p.roundScore = p.secret.reduce((sum, id, order) => { const rank = ranked.findIndex(t => t.id === id); const qualifies = order === 0 ? rank === 0 : order === 1 ? rank >= 0 && rank <= 1 : rank >= 0 && rank <= 2; return sum + (qualifies ? [9, 5, 2][order] : 0); }, 0);
    p.total += p.roundScore;
  }
  const winner = G.players.find(p => p.joined && p.total >= G.targetScore);
  G.gameWinner = winner ? G.players.indexOf(winner) : null;
  G.phase = winner ? 'gameEnd' : 'roundEnd';
  events.setActivePlayers({ all: 'lobby' });
}

