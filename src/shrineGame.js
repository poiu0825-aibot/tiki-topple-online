import { PUSH_RADIUS, START_POSITIONS, WALK_STEP, clampPlayerPosition, distance2D, nearestTikiIndex, tilePosition } from './layout.js';

export const TIKIS = [
  { name: '瞌睡', icon: '😴', color: '#9CD337', expression: 'sleepy' },
  { name: '翻白眼', icon: '🙄', color: '#FF842E', expression: 'roll' },
  { name: '笑臉', icon: '😄', color: '#FFD83E', expression: 'smile' },
  { name: '不爽', icon: '😠', color: '#EF4149', expression: 'angry' },
  { name: '不屑', icon: '😏', color: '#00AF93', expression: 'smirk' },
  { name: '汗顏', icon: '😓', color: '#3989F3', expression: 'sweat' },
  { name: '眨眼', icon: '😉', color: '#8758DF', expression: 'wink' },
  { name: '驚訝', icon: '😲', color: '#F06AA8', expression: 'surprised' },
  { name: '平靜', icon: '😐', color: '#344360', expression: 'neutral' },
];
const HAND = ['up1', 'up1', 'up2', 'up2', 'up3', 'topple', 'toast', 'swap'];
const shuffled = (items, random) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random.Number() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const playerIndex = id => Number(id);
const SHRINE_START = [{x:-4,z:2.7},{x:-2.8,z:3.4},{x:2.8,z:3.4},{x:4,z:2.7}];
const shrineGround = point => ({x:Math.max(-5.3,Math.min(5.3,point.x)),z:Math.max(1.1,Math.min(5.3,point.z))});

export const TikiToppleShrine = {
  name: 'tiki-topple-shrine',
  minPlayers: 2,
  maxPlayers: 4,
  setup: ({ ctx, random }, setupData) => ({
    targetScore: Math.max(1, Math.min(60, Number(setupData?.targetScore) || 30)),
    hostID: '0', round: 1, phase: 'lobby',
    backdropIndex: Math.floor(random.Number() * 5),
    players: Array.from({ length: ctx.numPlayers }, (_, i) => ({ name: `玩家 ${i + 1}`, joined: false, profileReady: false, avatarTikiId: null, color: null, hand: [], secret: [], total: 0, roundScore: 0, roundPlays: 0, idleMs: 0, emoji: null, continue: null, position: { ...SHRINE_START[i] }, ladderRank: null, lastAttackAt: 0 })),
    board: shuffled(TIKIS.map((tiki, id) => ({ id, ...tiki, active: true })), random),
    played: [], removed: [], lastMove: null, lastPush: null, lastAttack: null, lastCrow: null, nextCrowAt: Date.now() + 5000, attackCount: 0, crowCount: 0, pushCount: 0, roundStarter: 0, roundTurn: 0, turnStartedAt: null, turnEndsAt: null, roundEndAt: null, idleRestart: null, gameWinner: null,
  }),
  playerView: ({ G, playerID }) => ({ ...G, players: G.players.map((p, i) => ({ ...p, hand: String(i) === String(playerID) ? p.hand : [], secret: String(i) === String(playerID) ? p.secret : [] })) }),
  turn: {
    onBegin: ({ G }) => { if (G.idleRestart) return; G.turnStartedAt = Date.now(); G.turnEndsAt = G.turnStartedAt + 30000; },
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
        UpdateIdentity: (...args) => TikiToppleShrine.moves.UpdateIdentity(...args),
        StartGame: (...args) => TikiToppleShrine.moves.StartGame(...args),
        ContinueNext: (...args) => TikiToppleShrine.moves.ContinueNext(...args),
        AdvanceRound: (...args) => TikiToppleShrine.moves.AdvanceRound(...args),
        LeaveGame: (...args) => TikiToppleShrine.moves.LeaveGame(...args),
      } },
      play: { moves: {
        UpdateIdentity: (...args) => TikiToppleShrine.moves.UpdateIdentity(...args),
        SetLadderRank: ({ G, playerID }, rank) => {
          const p = G.players[playerIndex(playerID)];
          const active = G.board.filter(t => t.active);
          if (G.phase !== 'playing' || G.idleRestart || !p?.joined || !Number.isInteger(rank) || rank < 0 || rank >= active.length) return;
          p.ladderRank = rank;
        },
        ShootPlayer: ({ G, playerID }, targetID) => {
          const attacker = G.players[playerIndex(playerID)];
          const target = G.players[playerIndex(targetID)];
          const count = G.board.filter(t => t.active).length;
          const now = Date.now();
          if (G.phase !== 'playing' || G.idleRestart || !attacker?.joined || !target?.joined || String(playerID) === String(targetID) || target.ladderRank === null || now - attacker.lastAttackAt < 2000) return;
          if (attacker.ladderRank !== null && attacker.ladderRank <= target.ladderRank) return;
          const from = target.ladderRank;
          target.ladderRank = Math.max(0, from - 1);
          attacker.lastAttackAt = now;
          G.lastAttack = { type: 'shot', by: String(playerID), targetID: String(targetID), from, to: target.ladderRank, stamp: ++G.attackCount };
        },
        KickStairs: ({ G, playerID, ctx }) => {
          const attacker = G.players[playerIndex(playerID)];
          const target = G.players[playerIndex(ctx.currentPlayer)];
          const count = G.board.filter(t => t.active).length;
          const now = Date.now();
          if (G.phase !== 'playing' || G.idleRestart || !attacker?.joined || !target?.joined || String(playerID) === String(ctx.currentPlayer) || target.ladderRank === null || now - attacker.lastAttackAt < 2000) return;
          if (attacker.ladderRank !== null && attacker.ladderRank <= target.ladderRank) return;
          const from = target.ladderRank;
          target.ladderRank = Math.min(count - 1, from + 1);
          attacker.lastAttackAt = now;
          G.lastAttack = { type: 'kick', by: String(playerID), targetID: String(ctx.currentPlayer), from, to: target.ladderRank, stamp: ++G.attackCount };
        },
        CrowTick: ({ G, ctx, random }) => {
          const now = Date.now();
          if (G.phase !== 'playing' || G.idleRestart || now < G.nextCrowAt) return;
          G.nextCrowAt = now + 5000 + Math.floor(random.Number() * 10001);
          const target = G.players[playerIndex(ctx.currentPlayer)];
          const count = G.board.filter(t => t.active).length;
          const hit = target?.joined && target.ladderRank !== null && random.Number() < .42;
          const from = hit ? target.ladderRank : null;
          if (hit) target.ladderRank = Math.min(count - 1, from + 1);
          G.lastCrow = { hit: Boolean(hit), targetID: String(ctx.currentPlayer), from, to: hit ? target.ladderRank : null, stamp: ++G.crowCount, at: now };
        },
        AutoPlay: ({ G, ctx, events, random }) => {
          if (G.phase !== 'playing' || G.idleRestart || !G.turnEndsAt || Date.now() < G.turnEndsAt) return;
          const playerID = String(ctx.currentPlayer);
          const p = G.players[playerIndex(playerID)];
          const active = G.board.filter(t => t.active);
          if (!p?.joined || !p.hand.length || !active.length) { events.endTurn(); return; }
          p.idleMs = (p.idleMs || 0) + 30000;
          if (p.idleMs >= 120000) {
            G.idleRestart = { playerID, at: Date.now() + 10000 };
            G.turnEndsAt = null;
            return;
          }
          const options = [];
          p.hand.forEach((card, cardIndex) => active.forEach((tiki, rank) => {
            if (card.startsWith('up') && rank < Number(card.slice(2))) return;
            if (card === 'toast' && (p.roundPlays === 0 || rank !== active.length - 1)) return;
            if (card === 'swap' && active.length < 2) return;
            options.push({ cardIndex, rank, secondTikiId: card === 'swap' ? active[(rank + 1 + Math.floor(random.Number() * (active.length - 1))) % active.length].id : null });
          }));
          if (!options.length) { events.endTurn(); return; }
          const movements = options.filter(option => p.hand[option.cardIndex] !== 'toast');
          const pool = movements.length ? movements : options;
          const choice = pool[Math.floor(random.Number() * pool.length)];
          p.ladderRank = choice.rank;
          TikiToppleShrine.turn.stages.play.moves.PlayCard({ G, playerID, ctx, events }, choice.cardIndex, choice.secondTikiId);
        },
        RestartAfterIdle: ({ G, playerID, ctx, events, random }) => {
          const restart = G.idleRestart;
          if (G.phase !== 'playing' || !restart || Date.now() < restart.at || !G.players[playerIndex(playerID)]?.joined) return;
          const idlePlayer = G.players[playerIndex(restart.playerID)];
          if (idlePlayer) { idlePlayer.joined = false; idlePlayer.hand = []; idlePlayer.secret = []; idlePlayer.ladderRank = null; }
          G.idleRestart = null;
          G.turnEndsAt = null;
          G.players.forEach(p => { p.total = 0; p.roundScore = 0; p.idleMs = 0; p.continue = null; });
          G.round = 1;
          G.gameWinner = null;
          const first = G.players.findIndex(p => p.joined);
          if (first < 0 || G.players.filter(p => p.joined).length < 2) {
            G.phase = 'gameEnd';
            events.setActivePlayers({ all: 'lobby' });
            return;
          }
          G.hostID = G.players[G.hostID]?.joined ? G.hostID : String(first);
          G.backdropIndex = Math.floor(random.Number() * 5);
          G.roundStarter = first;
          beginRound(G, ctx, random, events, true);
        },
        PushPlayer: ({ G, playerID }, targetID) => {
          const attacker = G.players[playerIndex(playerID)];
          const targetIndex = playerIndex(targetID);
          const target = G.players[targetIndex];
          if (G.phase !== 'playing' || G.idleRestart || !attacker?.joined || !target?.joined || String(playerID) === String(targetID)) return;
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
          if (!p?.joined || G.phase !== 'playing' || G.idleRestart || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
          const length = Math.hypot(dx, dz);
          if (length < 0.001) return;
          const step = Math.min(WALK_STEP, length);
          const from = p.ladderRank === null ? (p.position || SHRINE_START[playerIndex(playerID)]) : {x:.05 + playerIndex(playerID)*.22,z:1.75};
          p.ladderRank = null;
          p.position = shrineGround({ x: from.x + dx / length * step, z: from.z + dz / length * step });
        },
        PlayCard: ({ G, playerID, ctx, events }, cardIndex, secondTikiId) => {
          const p = G.players[playerIndex(playerID)];
          if (!p || G.phase !== 'playing' || G.idleRestart || String(playerID) !== String(ctx.currentPlayer)) return;
          const card = p.hand[cardIndex];
          if (!card) return;
          const active = G.board.filter(t => t.active);
          const index = card === 'toast' ? active.length - 1 : p.ladderRank;
          if (!Number.isInteger(index) || index < 0 || index >= active.length) return;
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
              if (!person.joined || person.ladderRank === null) return;
              const from = person.ladderRank;
              person.ladderRank = null;
              person.position = shrineGround({x:.15 + personIndex*.43,z:2.05 + personIndex*.15});
              blastPlayers.push({ id: personIndex, from, to: null });
            });
            bottom.active = false; G.removed.push(tikiId);
            G.lastMove = { type: 'toast', tikiId, by: playerID, stamp: `${G.round}:${G.roundTurn}`, blastAt, blastPlayers };
          }
          p.hand.splice(cardIndex, 1); p.roundPlays++; G.played.push({ playerID, card }); G.roundTurn++;
          G.players.forEach(person => { if (person.ladderRank !== null) person.ladderRank = Math.min(person.ladderRank, G.board.filter(t => t.active).length - 1); });
          G.turnStartedAt = Date.now(); G.turnEndsAt = G.turnStartedAt + 30000;
          if (G.board.filter(t => t.active).length <= 3 || G.players.every(pl => pl.hand.length === 0)) scoreRound(G, events);
          else events.endTurn();
        },
        SendEmote: ({ G, playerID }, emoji) => { const p = G.players[playerIndex(playerID)]; if (p) p.emoji = emoji; },
        LeaveGame: (...args) => TikiToppleShrine.moves.LeaveGame(...args),
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
      G.players.forEach(pl => { pl.continue = null; pl.total = 0; pl.roundScore = 0; pl.idleMs = 0; });
      G.round = 1; G.gameWinner = null; G.roundStarter = G.players.findIndex(pl => pl.joined);
      G.hostID = G.players[G.hostID]?.joined ? G.hostID : String(G.roundStarter);
      G.backdropIndex = Math.floor(random.Number() * 5);
      beginRound(G, ctx, random, events, true);
    },
    LeaveGame: ({ G, playerID, ctx, random, events }) => {
      const p = G.players[playerIndex(playerID)]; if (!p?.joined) return;
      p.joined = false; p.continue = false;
      const remaining = G.players.filter(pl => pl.joined);
      if (String(G.hostID) === String(playerID) && remaining[0]) G.hostID = String(G.players.indexOf(remaining[0]));
      if (remaining.length < 2) { G.idleRestart = null; G.turnEndsAt = null; G.phase = 'gameEnd'; G.gameWinner = null; events.setActivePlayers({ all: 'lobby' }); }
      else if (G.phase === 'playing' && ctx.currentPlayer === playerID && !G.idleRestart) events.endTurn();
      else if (G.phase === 'gameEnd' && G.gameWinner !== null && remaining.length >= 2 && remaining.every(pl => pl.continue === true)) {
        const nextID = String(G.players.indexOf(remaining[0]));
        TikiToppleShrine.moves.ContinueNext({ G, playerID: nextID, ctx, random, events }, true);
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
    p.position = { ...SHRINE_START[i] }; p.ladderRank = null; p.lastAttackAt = 0;
    if (!p.color) p.color = ['coral', 'jade', 'sun', 'lavender'][i];
  });
  G.board = shuffled(TIKIS.map((tiki, id) => ({ id, ...tiki, active: true })), random);
  G.removed = []; G.played = []; G.roundTurn = 0; G.lastMove = null; G.lastPush = null; G.lastAttack = null; G.lastCrow = null; G.nextCrowAt = Date.now() + 5000; G.pushCount = 0;
  G.phase = 'playing'; G.roundEndAt = null; if (first) G.roundStarter = Math.max(0, G.players.findIndex(p => p.joined));
  G.turnStartedAt = Date.now(); G.turnEndsAt = G.turnStartedAt + 30000;
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
