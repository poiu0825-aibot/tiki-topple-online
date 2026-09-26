import { PUSH_RADIUS, START_POSITIONS, WALK_STEP, clampPlayerPosition, distance2D, nearestTikiIndex, tilePosition } from './layout.js';

export const TIKIS = [
  { name: '瞌睡', icon: '😴', color: '#96c86c', expression: 'sleepy' },
  { name: '翻白眼', icon: '🙄', color: '#e8a159', expression: 'roll' },
  { name: '笑臉', icon: '😄', color: '#f0cd68', expression: 'smile' },
  { name: '不爽', icon: '😠', color: '#61bd78', expression: 'angry' },
  { name: '不屑', icon: '😏', color: '#48b2a6', expression: 'smirk' },
  { name: '汗顏', icon: '😓', color: '#72a9db', expression: 'sweat' },
  { name: '眨眼', icon: '😉', color: '#aa85ca', expression: 'wink' },
  { name: '驚訝', icon: '😲', color: '#dc7979', expression: 'surprised' },
  { name: '平靜', icon: '😐', color: '#82c5c9', expression: 'neutral' },
];
const HAND = ['up1', 'up1', 'up2', 'up2', 'up3', 'topple', 'toast', 'swap'];
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
    players: Array.from({ length: ctx.numPlayers }, (_, i) => ({ name: `玩家 ${i + 1}`, joined: false, profileReady: false, avatarTikiId: null, color: null, hand: [], secret: [], total: 0, roundScore: 0, roundPlays: 0, emoji: null, continue: null, position: { ...START_POSITIONS[i] } })),
    board: shuffled(TIKIS.map((tiki, id) => ({ id, ...tiki, active: true })), random),
    played: [], removed: [], lastMove: null, lastPush: null, pushCount: 0, roundStarter: 0, roundTurn: 0, roundEndAt: null, gameWinner: null,
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
        SetProfile: ({ G, playerID, random }, profile) => { const p = G.players[playerIndex(playerID)]; if (!p || G.phase !== 'lobby') return; p.joined = true; p.name = String(profile.name || p.name).trim().slice(0, 20) || p.name; if (!p.color) { const palette = ['coral', 'jade', 'sun', 'lavender']; const used = new Set(G.players.filter(other => other !== p && other.joined).map(other => other.color)); const available = palette.filter(color => !used.has(color)); p.color = available[Math.floor(random.Number() * available.length)]; } if (Number.isInteger(profile.avatarTikiId) && profile.avatarTikiId >= 0 && profile.avatarTikiId < 9) p.avatarTikiId = profile.avatarTikiId; else if (!Number.isInteger(p.avatarTikiId)) p.avatarTikiId = Math.floor(random.Number() * 9); if (profile.ready !== undefined) p.profileReady = Boolean(profile.ready); },
        UpdateIdentity: (...args) => TikiTopple.moves.UpdateIdentity(...args),
        StartGame: (...args) => TikiTopple.moves.StartGame(...args),
        ContinueNext: (...args) => TikiTopple.moves.ContinueNext(...args),
        AdvanceRound: (...args) => TikiTopple.moves.AdvanceRound(...args),
        LeaveGame: (...args) => TikiTopple.moves.LeaveGame(...args),
      } },
      play: { moves: {
        UpdateIdentity: (...args) => TikiTopple.moves.UpdateIdentity(...args),
        PushPlayer: ({ G, playerID }, targetID) => {
          const attacker = G.players[playerIndex(playerID)];
          const targetIndex = playerIndex(targetID);
          const target = G.players[targetIndex];
          if (G.phase !== 'playing' || !attacker?.joined || !target?.joined || String(playerID) === String(targetID)) return;
          const from = target.position || START_POSITIONS[targetIndex];
          const attackerAt = attacker.position || START_POSITIONS[playerIndex(playerID)];
          const separation = distance2D(attackerAt, from);
          if (separation > PUSH_RADIUS) return;
          const angle = separation > .01 ? Math.atan2(from.z - attackerAt.z, from.x - attackerAt.x) : targetIndex * Math.PI / 2;
          const to = clampPlayerPosition({ x: from.x + Math.cos(angle) * .94, z: from.z + Math.sin(angle) * .94 });
          target.position = to;
          G.pushCount++;
          G.lastPush = { by: playerID, targetID: String(targetID), from: { ...from }, to: { ...to }, stamp: `${G.round}:${G.pushCount}` };
        },
        MovePlayer: ({ G, playerID }, dx, dz) => {
          const p = G.players[playerIndex(playerID)];
          if (!p?.joined || G.phase !== 'playing' || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
          const length = Math.hypot(dx, dz);
          if (length < 0.001) return;
          const step = Math.min(WALK_STEP, length);
          const from = p.position || START_POSITIONS[playerIndex(playerID)];
          p.position = clampPlayerPosition({ x: from.x + dx / length * step, z: from.z + dz / length * step });
        },
        PlayCard: ({ G, playerID, ctx, events }, cardIndex, secondTikiId) => {
          const p = G.players[playerIndex(playerID)];
          if (!p || G.phase !== 'playing' || String(playerID) !== String(ctx.currentPlayer)) return;
          const card = p.hand[cardIndex];
          if (!card) return;
          const active = G.board.filter(t => t.active);
          const index = card === 'toast' ? active.length - 1 : nearestTikiIndex(p.position || START_POSITIONS[playerIndex(playerID)], active);
          if (index < 0) return;
          const tikiId = active[index].id;
          if (card === 'toast' && p.roundPlays === 0) return;
          if (card.startsWith('up')) {
            const amount = Number(card.slice(2));
            if (index < amount) return;
            const destination = index - amount;
            const [tiki] = active.splice(index, 1); active.splice(destination, 0, tiki);
            G.board = [...active, ...G.board.filter(t => !t.active)];
            G.lastMove = { type: 'move', tikiId, from: index, to: destination, by: playerID, stamp: `${G.round}:${G.roundTurn}` };
          } else if (card === 'topple') {
            const [moving] = active.splice(index, 1); active.push(moving);
            G.board = [...active, ...G.board.filter(t => !t.active)];
            G.lastMove = { type: 'topple', tikiId, by: playerID, stamp: `${G.round}:${G.roundTurn}` };
          } else if (card === 'swap') {
            const secondIndex = active.findIndex(t => t.id === secondTikiId);
            if (secondIndex < 0 || secondIndex === index) return;
            [active[index], active[secondIndex]] = [active[secondIndex], active[index]];
            G.board = [...active, ...G.board.filter(t => !t.active)];
            G.lastMove = { type: 'swap', tikiId, secondTikiId, by: playerID, stamp: `${G.round}:${G.roundTurn}` };
          } else {
            const bottom = active.at(-1);
            if (!bottom) return;
            const blastAt = tilePosition(index, active.length);
            const blastPlayers = [];
            G.players.forEach((person, personIndex) => {
              if (!person.joined) return;
              const from = person.position || START_POSITIONS[personIndex];
              const distance = distance2D(from, blastAt);
              if (distance > 2.2) return;
              const angle = distance > 0.01 ? Math.atan2(from.z - blastAt.z, from.x - blastAt.x) : personIndex * Math.PI / 2;
              const to = clampPlayerPosition({ x: from.x + Math.cos(angle) * 1.65, z: from.z + Math.sin(angle) * 1.65 });
              person.position = to;
              blastPlayers.push({ id: personIndex, from: { ...from }, to: { ...to } });
            });
            bottom.active = false; G.removed.push(tikiId);
            G.lastMove = { type: 'toast', tikiId, by: playerID, stamp: `${G.round}:${G.roundTurn}`, blastAt, blastPlayers };
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
      const stage = G.phase === 'playing' ? 'play' : 'lobby';
      events.setActivePlayers({ all: stage });
    },
  },
  moves: {
    UpdateIdentity: ({ G, playerID, random }, profile) => {
      const p = G.players[playerIndex(playerID)]; if (!p?.joined) return;
      const requested = String(profile?.name || '').trim().slice(0, 20);
      if (requested) p.name = requested;
      if (Number.isInteger(profile?.avatarTikiId) && profile.avatarTikiId >= 0 && profile.avatarTikiId < 9) p.avatarTikiId = profile.avatarTikiId;
      else if (!Number.isInteger(p.avatarTikiId)) p.avatarTikiId = Math.floor(random.Number() * 9);
    },
    StartGame: ({ G, playerID, ctx, random, events }, scoreGoal) => {
      if (playerID !== G.hostID || G.phase !== 'lobby' || G.players.filter(p => p.joined).length < 2 || G.players.some(p => p.joined && !p.profileReady)) return;
      G.targetScore = Math.max(1, Math.min(60, Number(scoreGoal) || G.targetScore));
      const palette = ['coral', 'jade', 'sun', 'lavender'];
      const used = new Set();
      G.players.filter(p => p.joined).forEach(p => {
        if (!palette.includes(p.color) || used.has(p.color)) {
          const available = palette.filter(color => !used.has(color));
          p.color = available[Math.floor(random.Number() * available.length)];
        }
        used.add(p.color);
        if (!Number.isInteger(p.avatarTikiId) || p.avatarTikiId < 0 || p.avatarTikiId >= 9) p.avatarTikiId = Math.floor(random.Number() * 9);
      });
      beginRound(G, ctx, random, events, true);
    },
    AdvanceRound: ({ G, playerID, ctx, random, events }) => {
      if (G.phase !== 'roundEnd' || !G.players[playerIndex(playerID)]?.joined || !G.roundEndAt || Date.now() < G.roundEndAt) return;
      if (G.players.filter(p => p.joined).length < 2) { G.phase = 'gameEnd'; G.gameWinner = null; events.setActivePlayers({ all: 'lobby' }); return; }
      G.round++; G.roundStarter = (G.roundStarter + 1) % G.players.length;
      for (let i = 0; i < G.players.length && !G.players[G.roundStarter].joined; i++) G.roundStarter = (G.roundStarter + 1) % G.players.length;
      beginRound(G, ctx, random, events, false);
    },
    ContinueNext: ({ G, playerID, ctx, random, events }, stay) => {
      if (G.phase !== 'gameEnd' || G.gameWinner === null) return;
      const p = G.players[playerIndex(playerID)]; if (!p?.joined) return;
      p.continue = Boolean(stay);
      if (!stay) p.joined = false;
      const stillHere = G.players.filter(pl => pl.joined);
      if (stillHere.some(pl => pl.continue === null)) return;
      const continuing = stillHere.filter(pl => pl.continue === true);
      if (continuing.length < 2) { G.gameWinner = null; events.setActivePlayers({ all: 'lobby' }); return; }
      G.players.forEach(pl => { pl.continue = null; pl.total = 0; pl.roundScore = 0; });
      G.round = 1; G.gameWinner = null; G.roundStarter = G.players.findIndex(pl => pl.joined);
      G.hostID = G.players[G.hostID]?.joined ? G.hostID : String(G.roundStarter);
      beginRound(G, ctx, random, events, true);
    },
    LeaveGame: ({ G, playerID, ctx, random, events }) => {
      const p = G.players[playerIndex(playerID)]; if (!p?.joined) return;
      p.joined = false; p.continue = false;
      const remaining = G.players.filter(pl => pl.joined);
      if (String(G.hostID) === String(playerID) && remaining[0]) G.hostID = String(G.players.indexOf(remaining[0]));
      if (remaining.length < 2) { G.phase = 'gameEnd'; G.gameWinner = null; events.setActivePlayers({ all: 'lobby' }); }
      else if (G.phase === 'playing' && ctx.currentPlayer === playerID) events.endTurn();
      else if (G.phase === 'gameEnd' && G.gameWinner !== null && remaining.length >= 2 && remaining.every(pl => pl.continue === true)) {
        const nextID = String(G.players.indexOf(remaining[0]));
        TikiTopple.moves.ContinueNext({ G, playerID: nextID, ctx, random, events }, true);
      }
    },
  },
};

function beginRound(G, ctx, random, events, first) {
  const cardsToRemove = G.players.filter(pl => pl.joined).length >= 3 ? 2 : 1;
  G.players.forEach((p, i) => {
    if (!p.joined) { p.hand = []; p.secret = []; return; }
    p.hand = shuffled(HAND, random).slice(cardsToRemove);
    p.secret = shuffled(TIKIS.map((_, n) => n), random).slice(0, 3);
    p.roundScore = 0; p.roundPlays = 0; p.emoji = null;
    p.position = { ...START_POSITIONS[i] };
    if (!p.color) p.color = ['coral', 'jade', 'sun', 'lavender'][i];
  });
  G.board = shuffled(TIKIS.map((tiki, id) => ({ id, ...tiki, active: true })), random);
  G.removed = []; G.played = []; G.roundTurn = 0; G.lastMove = null; G.lastPush = null; G.pushCount = 0;
  G.phase = 'playing'; G.roundEndAt = null; if (first) G.roundStarter = Math.max(0, G.players.findIndex(p => p.joined));
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
  G.roundEndAt = winner ? null : Date.now() + 4000;
  events.setActivePlayers({ all: 'lobby' });
}
