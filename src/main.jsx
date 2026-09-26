import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io } from 'socket.io-client';
import { TikiTopple, TIKIS } from './game.js';
import { TikiToppleShrine, TIKIS as SHRINE_TIKIS } from './shrineGame.js';
import { nearestTikiIndex, walkingSpot } from './layout.js';
import { tikiImageUrl } from './tikiArt.js';
import { DARUMA_GLYPHS, DARUMA_GLYPH_INKS } from './darumaTower.js';
import TikiScene from './TikiScene.jsx';
import ShrineScene from './ShrineScene.jsx';
import './style.css';

const SERVER_HOST = `${location.protocol}//${location.hostname}`;
const API = import.meta.env.VITE_GAME_SERVER || (import.meta.env.DEV ? `${SERVER_HOST}:8000` : location.origin);
const CHAT = import.meta.env.VITE_CHAT_SERVER || (import.meta.env.DEV ? `${SERVER_HOST}:8001` : location.origin);
const CHAT_PATH = import.meta.env.DEV ? '/socket.io' : '/chat/socket.io';
const SHRINE_MODE = new URLSearchParams(location.search).get('variant') !== 'flat';
const DISPLAY_TIKIS = SHRINE_MODE ? SHRINE_TIKIS : TIKIS;
const GAME = SHRINE_MODE ? TikiToppleShrine : TikiTopple;
const GAME_NAME = GAME.name;
const modeSuffix = SHRINE_MODE ? '&variant=shrine' : '&variant=flat';
const COLORS = [{ id:'coral', name:'珊瑚紅', hex:'#ed7965' }, { id:'jade', name:'翡翠綠', hex:'#5db89b' }, { id:'sun', name:'日光黃', hex:'#edbd58' }, { id:'lavender', name:'薰衣草', hex:'#9b8ad7' }];
const QUICK = [{emoji:'⏰', phrase:'快點出牌啦！'}, {emoji:'😏', phrase:'這步真精彩呢。'}, {emoji:'😱', phrase:'不會吧！'}, {emoji:'🙏', phrase:'謝謝你！'}];
const HOME_SHRINE_BOARD = SHRINE_TIKIS.map((tiki,id)=>({ ...tiki, id, active:true }));
const HOME_SHRINE_PLAYERS = [{ name:'玩家 1', joined:true, avatarTikiId:2, total:0, position:{x:-4,z:2.7}, ladderRank:null },{ name:'玩家 2', joined:true, avatarTikiId:6, total:0, position:{x:4,z:2.7}, ladderRank:null }];
const newID = () => `guest-${Math.random().toString(36).slice(2,9)}`;
const guestNameFor = players => { const taken=new Set((players||[]).map(p=>p?.name).filter(Boolean)); let number=1; while(taken.has(`路過玩家${number}`))number++; return `路過玩家${number}`; };

function App() {
  const [screen, setScreen] = useState('home');
  const [modal, setModal] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [targetScore, setTargetScore] = useState(30);
  const [seatCount, setSeatCount] = useState(4);
  const [name, setName] = useState(localStorage.getItem('tiki-name') || '');
  const [room, setRoom] = useState(null);
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState('');
  const [client, setClient] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [rulesOpen, setRulesOpen] = useState(true);
  const [autoJoin, setAutoJoin] = useState('');
  const [joinProfile, setJoinProfile] = useState(null);
  const [joinClock, setJoinClock] = useState(Date.now());
  const chatRef = useRef(null);
  const lastSpeechAt = useRef(0);

  useEffect(() => { const linkRoom = new URLSearchParams(location.search).get('room'); if (linkRoom) { setRoomInput(linkRoom); setAutoJoin(linkRoom); setModal('join'); } }, []);
  useEffect(() => { if (autoJoin && modal === 'join') { const code=autoJoin;setAutoJoin('');const saved=localStorage.getItem(`tiki-session:${code}`);if(saved){try{const session=JSON.parse(saved);enterGame(session,!session.host,session.guestName||'路過玩家1');return}catch{localStorage.removeItem(`tiki-session:${code}`)}}joinRoom(code); } }, [modal, autoJoin]);
  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [messages]);
  useEffect(() => { if (!joinProfile) return; const timer=setInterval(()=>setJoinClock(Date.now()),250); return()=>clearInterval(timer); }, [joinProfile?.deadline]);
  useEffect(() => { if (joinProfile && joinClock >= joinProfile.deadline) finishJoinProfile(); }, [joinClock, joinProfile?.deadline]);
  useEffect(() => {
    const state=gameState?.G;
    if (!client || !player || player.host || joinProfile || !state || state.phase==='lobby') return;
    const current=state.players?.[Number(player.playerID)];
    if (current?.joined && (current.name!==name || (Number.isInteger(player.avatarTikiId) && current.avatarTikiId!==player.avatarTikiId))) {
      client.moves.UpdateIdentity({name,avatarTikiId:player.avatarTikiId});
    }
  }, [client,player?.playerID,player?.avatarTikiId,player?.host,joinProfile,name,gameState?.G?.phase,gameState?.G?.players?.[Number(player?.playerID)]?.name,gameState?.G?.players?.[Number(player?.playerID)]?.avatarTikiId]);

  async function lobbyRequest(path, payload) {
    const response = await fetch(`${API}${path}`, { method: payload ? 'POST' : 'GET', headers: { 'Content-Type':'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || '連線失敗，請確認遊戲伺服器已啟動。');
    return data;
  }
  async function saveName() {
    const cleaned = name.trim().slice(0,20);
    if (!cleaned) { setError('請先輸入顯示名稱'); return false; }
    setName(cleaned); localStorage.setItem('tiki-name', cleaned); setError(''); return true;
  }
  async function createRoom() {
    if (!await saveName()) return;
    try {
      const data = await lobbyRequest(`/games/${GAME_NAME}/create`, { numPlayers: seatCount, setupData: { targetScore } });
      const joined = await lobbyRequest(`/games/${GAME_NAME}/${data.matchID}/join`, { playerID: '0', playerName: name.trim() });
      enterGame({ matchID: data.matchID, playerID:'0', credentials: joined.playerCredentials, host:true });
    } catch (e) { setError(e.message); }
  }
  async function joinRoom(code = roomInput) {
    const normalized = code.trim(); if (!normalized) { setError('請輸入房間配對碼'); return; }
    try {
      const list = await lobbyRequest(`/games/${GAME_NAME}`);
      const rooms = list.matches || list;
      let match = rooms.find(m => String(m.matchID).toLowerCase() === normalized.toLowerCase());
      if (!match) { try { match = await lobbyRequest(`/games/${GAME_NAME}/${encodeURIComponent(normalized)}`); } catch {} }
      if (!match?.matchID) throw new Error('找不到這個房間，請確認配對碼。');
      const seat = (match.players || []).findIndex(s => !s.name && !s.isConnected);
      if (seat < 0) throw new Error('房間已滿');
      const guestName=guestNameFor(match.players);
      const joined = await lobbyRequest(`/games/${GAME_NAME}/${match.matchID}/join`, { playerID:String(seat), playerName:guestName });
      enterGame({ matchID:match.matchID, playerID:String(seat), credentials:joined.playerCredentials, host:false, guestName },true,guestName);
    } catch (e) { setError(/full|player/i.test(e.message) ? '房間已滿' : e.message); }
  }
  function enterGame(session,promptForName=false,guestName='') {
    if(promptForName){setName(guestName);setJoinProfile({guestName,deadline:Date.now()+15000,draft:'',avatarTikiId:null});setJoinClock(Date.now())}else setJoinProfile(null);
    localStorage.setItem(`tiki-session:${session.matchID}`,JSON.stringify(session));
    setRoom(session); setPlayer(session); setModal(''); setScreen('game'); history.replaceState({}, '', `?room=${encodeURIComponent(session.matchID)}${modeSuffix}`);
    const bgio = Client({ game:GAME, multiplayer:SocketIO({ server:API }), matchID:session.matchID, playerID:session.playerID, credentials:session.credentials });
    bgio.start(); bgio.subscribe(state => setGameState(state)); setClient(bgio);
    const chat = io(CHAT, { path: CHAT_PATH }); chat.on('connect', () => chat.emit('room:join', { room:session.matchID, name:promptForName?guestName:name.trim(), variant: SHRINE_MODE ? 'shrine' : 'flat' }));
    ['chat:message','chat:system','chat:emote'].forEach(event => chat.on(event, message => setMessages(prev => [...prev.slice(-70), { ...message, kind:event.replace('chat:','') }] )));
    setPlayer({ ...session, chat });
  }
  function finishJoinProfile() {
    if(!joinProfile)return;
    const others=gameState?.G?.players?.filter((_,i)=>i!==Number(player?.playerID));
    const finalName=joinProfile.draft.trim().slice(0,20)||(others?guestNameFor(others):joinProfile.guestName);
    setName(finalName);
    if(joinProfile.draft.trim())localStorage.setItem('tiki-name',finalName);
    if(gameState?.G?.phase==='lobby')client?.moves.SetProfile({name:finalName,color:gameState.G.players[Number(player?.playerID)]?.preferredColor,avatarTikiId:joinProfile.avatarTikiId,ready:true});
    else if(gameState?.G)client?.moves.UpdateIdentity({name:finalName,avatarTikiId:joinProfile.avatarTikiId});
    setPlayer(prev=>prev?{...prev,avatarTikiId:joinProfile.avatarTikiId}:prev);
    setJoinProfile(null);
  }
  async function leaveRoom() {
    if (player && room && client) {
      try { client.moves.LeaveGame(); await new Promise(resolve=>setTimeout(resolve,180)); await fetch(`${API}/games/${GAME_NAME}/${room.matchID}/leave`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerID:player.playerID,credentials:player.credentials})}); } catch {}
    }
    if(room?.matchID)localStorage.removeItem(`tiki-session:${room.matchID}`);
    player?.chat?.disconnect(); client?.stop(); setClient(null); setGameState(null); setMessages([]); setRoom(null); setPlayer(null); setJoinProfile(null); setScreen('home'); setModal(''); history.replaceState({}, '', `${location.pathname}${SHRINE_MODE?'':'?variant=flat'}`);
  }
  function maySpeak() { const now = Date.now(); if (SHRINE_MODE && now - lastSpeechAt.current < 2000) return false; lastSpeechAt.current = now; return true; }
  function sendChat(e) { e?.preventDefault(); if (!chatText.trim() || !maySpeak()) return; player?.chat?.emit('chat:message', { room:room.matchID, playerID:player.playerID, name, text:chatText.trim() }); setChatText(''); }
  function quickSend(item) { if (!maySpeak()) return; player?.chat?.emit('chat:emote', { room:room.matchID, playerID:player.playerID, name, emoji:item.emoji, phrase:item.phrase }); }
  const G = gameState?.G;
  const currentID = gameState?.ctx?.currentPlayer;
  const isMyTurn = currentID === player?.playerID && G?.phase === 'playing';
  const currentRoomLink = room ? `${location.origin}${location.pathname}?room=${encodeURIComponent(room.matchID)}${modeSuffix}` : '';

  return <>
    {screen === 'home' ? <main className={`home-screen ${SHRINE_MODE?'shrine-home':''}`}>
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <div className="home-art">{SHRINE_MODE?<ShrineScene board={HOME_SHRINE_BOARD} players={HOME_SHRINE_PLAYERS} interactive={false}/>:<TikiScene board={[]} decorative />}</div>
      <header className="topbar"><a className="brand" href="#"><span className="brand-mark">爆</span><span>爆破<span className="brand-light">不倒翁</span></span></a><a className="variant-link" href={SHRINE_MODE?'/?variant=flat':'/'}>{SHRINE_MODE?'↩ 原版場景':'⛩ 神社木梯版'}</a><button className="settings-button" onClick={()=>setModal('settings')} aria-label="設定">⚙</button></header>
      <div className="home-content"><div className="eyebrow"><span/> {SHRINE_MODE?'神社木梯 · 九色不倒翁':'多人策略遊戲'} <span/></div><h1>爆破<span>不倒翁</span></h1><p className="subtitle">{SHRINE_MODE?<>爬上木梯，打牌調動九色不倒翁；<br/>射擊、搖晃與烏鴉攪局，爆破底層讓祕密目標站上塔頂。</>:<>移動、交換或爆破不倒翁，<br/>讓祕密目標搶進最高的三個位置。</>}</p>
        <div className="home-actions"><button className="primary-button" onClick={()=>{setError('');setModal('create')}}><span>＋</span> 創建遊戲 <b>→</b></button><button className="secondary-button" onClick={()=>{setError('');setModal('join')}}><span className="join-icon">↗</span> 加入遊戲</button></div>
        <div className="room-hint"><span className="link-icon">⌁</span> 和朋友分享房間連結，馬上開局 <span className="hint-line"/></div>
      </div>
      <div className="home-footer"><span>塔頂前三得分，最下方會被爆破。</span><button onClick={()=>setModal('rules')}>遊戲規則 <span>↗</span></button><span className="footer-dots">✳　✳　✳</span></div>
    </main> : <GameRoom G={G} ctx={gameState?.ctx} player={player} room={room} name={name} joining={Boolean(joinProfile)} isMyTurn={isMyTurn} client={client} messages={messages} chatRef={chatRef} chatText={chatText} setChatText={setChatText} sendChat={sendChat} quickSend={quickSend} currentID={currentID} rulesOpen={rulesOpen} setRulesOpen={setRulesOpen} link={currentRoomLink} leaveRoom={leaveRoom} />}
    {joinProfile&&screen==='game'&&<div className="join-profile-overlay" role="dialog" aria-modal="true" aria-label="設定入房姓名與頭像"><section className="join-profile-panel"><div className="modal-kicker">入房設定</div><h2>讓朋友認出你</h2><p>請在 {Math.max(0,Math.ceil((joinProfile.deadline-joinClock)/1000))} 秒內輸入姓名；留白會顯示「{joinProfile.guestName}」。</p><label>顯示姓名<input autoFocus maxLength="20" value={joinProfile.draft} onChange={e=>setJoinProfile(v=>({...v,draft:e.target.value.slice(0,20)}))} onKeyDown={e=>e.key==='Enter'&&finishJoinProfile()} placeholder="最多 20 字，可留白"/></label><b className="avatar-chooser-title">選擇不倒翁頭像</b><div className="avatar-chooser">{SHRINE_TIKIS.map((tiki,id)=><button key={id} className={joinProfile.avatarTikiId===id?'selected':''} aria-label={`頭像 ${id+1}`} aria-pressed={joinProfile.avatarTikiId===id} onClick={()=>setJoinProfile(v=>({...v,avatarTikiId:id}))}><TikiPortrait tiki={tiki} size={55}/></button>)}</div><button className="primary-button" onClick={finishJoinProfile}>確認入房 →</button></section></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal('')}}><section className="modal"><button className="modal-close" onClick={()=>setModal('')}>×</button>{modal === 'create' && <><div className="modal-kicker">新的島嶼冒險</div><h2>創建遊戲</h2><label>你的顯示名稱<input maxLength="20" value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="輸入名字（最多20字）"/></label><div className="field-note">{name.length}/20 字</div><div className="form-row"><label>房間人數<select value={seatCount} onChange={e=>setSeatCount(Number(e.target.value))}><option value="2">2 位玩家</option><option value="3">3 位玩家</option><option value="4">4 位玩家</option></select></label><label>整場目標分數<div className="score-input"><input type="number" min="1" max="60" value={targetScore} onChange={e=>setTargetScore(Math.max(1,Math.min(60,Number(e.target.value))))}/><span>分</span></div></label></div><p className="field-note">至少完成一局，最高可設為 60 分。</p>{error&&<p className="error">{error}</p>}<button className="primary-button modal-action" onClick={createRoom}>建立房間 <b>→</b></button></>}
      {modal === 'join' && <><div className="modal-kicker">朋友的神社正在等你</div><h2>加入遊戲</h2><label>房間配對碼<input className="code-input" value={roomInput} onChange={e=>setRoomInput(e.target.value)} placeholder="輸入房間配對碼" onKeyDown={e=>e.key==='Enter'&&joinRoom()}/></label><p className="field-note">進入房間後有 15 秒設定姓名與不倒翁頭像。</p>{error&&<p className="error">{error}</p>}<button className="primary-button modal-action" onClick={()=>joinRoom()}>搜尋並加入 <b>→</b></button></>}
      {modal === 'settings' && <><div className="modal-kicker">偏好設定</div><h2>設定</h2><label>顯示名稱<input maxLength="20" value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="輸入名字（最多20字）"/></label><p className="field-note">名稱只會保存在這台裝置上。</p><button className="primary-button modal-action" onClick={()=>{saveName();setModal('')}}>儲存設定 <b>✓</b></button></>}
       {modal === 'rules' && <><div className="modal-kicker">爬梯、搶位、爆破</div><h2>怎麼玩</h2><ul className="rules-list"><li><b>祕密目標</b>　每人抽到 3 個不同表情與顏色的不倒翁；讓它們站在塔頂前三名，就能依任務卡得分。</li><li><b>行動手牌</b>　每人原有 8 張牌（含互換）；雙人局隨機移除 1 張，手上 7 張；三、四人局隨機移除 2 張，手上 6 張。</li><li><b>移動與交換</b>　爬到目標高度後，打出上移 1／2／3、推倒或互換。互換需再指定第二個不倒翁。</li><li><b>底層爆破</b>　爆破牌只能炸掉最下方的不倒翁，且不能在自己的本局首回合使用；梯上的玩家會被震落到地面。</li><li><b>玩家干擾</b>　{SHRINE_MODE?'點頭像或木梯爬到對應高度；站在地面的玩家能射擊樓梯上的人，或搖晃木梯改變其順位。烏鴉也可能撞落玩家。':'點其他玩家，角色會走過去推倒對方，改變其站立位置。'}</li>{SHRINE_MODE&&<li><b>出牌倒數</b>　每回合可思考 20 秒，接著倒數 10 秒並自動出牌；同一玩家累積逾時 2 分鐘會公告 10 秒後退出，留下的人以 0 分重開。</li>}<li><b>結算與續玩</b>　塔頂前三名依序可得 9、5、2 分。每局結算後自動倒數進入下一局，總分累計；達到房主設定目標分數時，才詢問大家是否留在房間再玩一場。</li></ul><button className="primary-button modal-action" onClick={()=>setModal('')}>知道了</button></>}
    </section></div>}
  </>;
}

function TikiPortrait({tiki,size=48}) {
  const index=DISPLAY_TIKIS.indexOf(tiki);
  const src=SHRINE_MODE&&index>=0?`/assets/daruma-head-v2-${String(index).padStart(2,'0')}.png`:tikiImageUrl(tiki);
  if(SHRINE_MODE&&index>=0)return <span className="tiki-portrait daruma-portrait" style={{width:size,height:size,'--daruma-color':tiki.color,'--glyph-color':DARUMA_GLYPH_INKS[index]}}><img src={src} alt={`${tiki?.name||'不倒翁'}頭像`}/><i aria-hidden="true">{DARUMA_GLYPHS[index]}</i></span>;
  return <img className="tiki-portrait" width={size} height={size} src={src} alt={`${tiki?.name||'不倒翁'}頭像`}/>;
}

function GameRoom({G,ctx,player,room,name,joining,isMyTurn:turnOwned,client,messages,chatRef,chatText,setChatText,sendChat,quickSend,currentID,rulesOpen,setRulesOpen,link,leaveRoom}) {
  const [copied,setCopied]=useState(false), [picked,setPicked]=useState(null), [showSecret,setShowSecret]=useState(true), [turnHint,setTurnHint]=useState(false);
  const [rps,setRps]=useState('');
  const [swapTarget,setSwapTarget]=useState(null);
  const [swapFirst,setSwapFirst]=useState(null);
  const [towerFocus,setTowerFocus]=useState(false);
  const [towerBlastToken,setTowerBlastToken]=useState(0);
  const [walkDestination,setWalkDestination]=useState(null);
  const [clockNow,setClockNow]=useState(Date.now());
  const [shootMode,setShootMode]=useState(false);
  const [flashTikiId,setFlashTikiId]=useState(null);
  const [flashToken,setFlashToken]=useState(0);
  const [handOpen,setHandOpen]=useState(true);
  const liveGame=useRef(G);
  liveGame.current=G;
  const isHost=String(G?.hostID)===String(player?.playerID);
  const me=G?.players?.[Number(player?.playerID)];
  const isMyTurn=turnOwned&&!G?.idleRestart&&Boolean(me?.joined);
  useEffect(()=>{ if(!G||!me||!client||G.phase!=='lobby')return; client.moves.SetProfile({name, color:me.preferredColor, avatarTikiId:me.avatarTikiId, ready:!joining}); },[name,joining,me?.preferredColor,me?.avatarTikiId,me?.joined,G?.phase]);
  useEffect(()=>{if(!turnHint)return;const timer=setTimeout(()=>setTurnHint(false),2200);return()=>clearTimeout(timer)},[turnHint]);
  useEffect(()=>{if(G?.lastPush&&String(G.lastPush.targetID)===String(player?.playerID))setWalkDestination(null)},[G?.lastPush?.stamp,player?.playerID]);
  useEffect(()=>{if(!client)return;let lastTurnEnd=null,lastTurnAttempt=0,lastCrowAt=null,lastCrowAttempt=0,lastRestartAt=null,lastRestartAttempt=0,lastAdvanceAt=null,lastAdvanceAttempt=0;const timer=setInterval(()=>{const now=Date.now();setClockNow(now);const state=liveGame.current;if(!state?.players?.[Number(player?.playerID)]?.joined)return;if(state.phase==='roundEnd'&&state.roundEndAt&&now>=state.roundEndAt&&(state.roundEndAt!==lastAdvanceAt||now-lastAdvanceAttempt>2000)){lastAdvanceAt=state.roundEndAt;lastAdvanceAttempt=now;client.moves.AdvanceRound();return}if(!SHRINE_MODE||state.phase!=='playing')return;if(state.idleRestart){if(now>=state.idleRestart.at&&(state.idleRestart.at!==lastRestartAt||now-lastRestartAttempt>2000)){lastRestartAt=state.idleRestart.at;lastRestartAttempt=now;client.moves.RestartAfterIdle()}return}if(state?.turnEndsAt&&now>=state.turnEndsAt&&(state.turnEndsAt!==lastTurnEnd||now-lastTurnAttempt>2000)){lastTurnEnd=state.turnEndsAt;lastTurnAttempt=now;client.moves.AutoPlay();return}if(state?.nextCrowAt&&now>=state.nextCrowAt&&(state.nextCrowAt!==lastCrowAt||now-lastCrowAttempt>2000)){lastCrowAt=state.nextCrowAt;lastCrowAttempt=now;client.moves.CrowTick()}},950);return()=>clearInterval(timer)},[G?.phase,client,player?.playerID]);
  useEffect(()=>{setPicked(null);setSwapFirst(null);setSwapTarget(null);setWalkDestination(null)},[G?.round,G?.phase,G?.roundTurn]);
  const active=G?.board?.filter(t=>t.active)||[];
  const selectedCard=picked===null?null:me?.hand?.[picked];
  const standingIndex=SHRINE_MODE?(Number.isInteger(me?.ladderRank)&&me.ladderRank<active.length?me.ladderRank:-1):nearestTikiIndex(me?.position,active);
  const standingHead=standingIndex<0?null:active[standingIndex];
  const targetAllowed=Boolean(standingHead)&&!(selectedCard?.startsWith('up')&&standingIndex<Number(selectedCard.slice(2)))&&!(selectedCard==='toast'&&((me?.roundPlays||0)===0||standingIndex!==active.length-1));
  const selectedCardValid=Boolean(selectedCard)&&targetAllowed&&(selectedCard!=='swap'||(swapTarget!==null&&swapTarget!==standingHead.id&&active.some(t=>t.id===swapTarget)&&(SHRINE_MODE?swapFirst===standingHead.id:true)));
  const selectionHint=selectedCard?.startsWith('up')?`這張牌要站在第 ${Number(selectedCard.slice(2))+1} 位或更後方。`:selectedCard==='toast'?'爆破只能站在最後一位人頭旁使用。':selectedCard==='swap'?'第一張依站立位置決定；再選第二張。':'目標依目前站立位置決定。';
  const selectHead=(id)=>{
    if(G?.phase!=='playing'||G?.idleRestart||!active.some(t=>t.id===id))return;
    if(SHRINE_MODE&&selectedCard==='swap'){setPicked(null);setSwapFirst(null);setSwapTarget(null);return;}
    if(selectedCard==='swap'&&standingHead&&id!==standingHead.id){setSwapTarget(id);return;}
    if(SHRINE_MODE) client?.moves.SetLadderRank(active.findIndex(t=>t.id===id));
    else setWalkDestination({id});
  };
  const flashMission=(id)=>{if(!SHRINE_MODE||!active.some(t=>t.id===id))return;setFlashTikiId(id);setFlashToken(value=>value+1)};
  useEffect(()=>{
    if(!walkDestination||!client||G?.phase!=='playing'||!me?.position)return;
    if(walkDestination.playerID!==undefined){
      const target=G.players[Number(walkDestination.playerID)];
      if(!target?.joined){setWalkDestination(null);return}
      const dx=target.position.x-me.position.x,dz=target.position.z-me.position.z;
      if(Math.hypot(dx,dz)<=1.15){client.moves.PushPlayer(walkDestination.playerID);setWalkDestination(null);return}
      const timer=setTimeout(()=>client.moves.MovePlayer(dx,dz),105);
      return()=>clearTimeout(timer);
    }
    const index=walkDestination.id===undefined?-1:active.findIndex(t=>t.id===walkDestination.id);
    const destination=index>=0?walkingSpot(index,active.length):walkDestination.id===undefined?walkDestination:null;
    if(!destination){setWalkDestination(null);return;}
    const dx=destination.x-me.position.x,dz=destination.z-me.position.z;
    if(Math.hypot(dx,dz)<.2){setWalkDestination(null);return;}
    const timer=setTimeout(()=>client.moves.MovePlayer(dx,dz),105);
    return()=>clearTimeout(timer);
  },[walkDestination,me?.position?.x,me?.position?.z,G?.phase,G?.players?.[Number(walkDestination?.playerID)]?.position?.x,G?.players?.[Number(walkDestination?.playerID)]?.position?.z,active.map(t=>t.id).join(','),client]);
  const doMove=()=>{if(picked===null||!isMyTurn||!selectedCardValid)return;client.moves.PlayCard(picked,swapTarget);setPicked(null);setSwapFirst(null);setSwapTarget(null);setWalkDestination(null)};
  const chooseSwapHead=(id)=>{
    if(!isMyTurn||selectedCard!=='swap')return;
    if(swapFirst===null){setSwapFirst(id);setSwapTarget(null);client?.moves.SetLadderRank(active.findIndex(t=>t.id===id));return;}
    if(id===swapFirst){setSwapFirst(null);setSwapTarget(null);return;}
    setSwapTarget(swapTarget===id?null:id);
  };
  const sortedPlayers=G?.players?.map((p,i)=>({...p,id:String(i)})).filter(p=>p.joined)||[];
  const canAttack=G?.phase==='playing'&&!G?.idleRestart&&clockNow-(me?.lastAttackAt||0)>=2000;
  const shootTargets=sortedPlayers.filter(p=>p.id!==String(player?.playerID)&&Number.isInteger(p.ladderRank));
  const shoot=(id)=>{if(canAttack){client?.moves.ShootPlayer(id);setShootMode(false)}};
  const secondsLeft=SHRINE_MODE&&G?.phase==='playing'&&G?.turnEndsAt?Math.min(30,Math.max(0,Math.ceil((G.turnEndsAt-clockNow)/1000))):null;
  const idleRestartSeconds=G?.idleRestart?Math.max(0,Math.ceil((G.idleRestart.at-clockNow)/1000)):null;
  const idlePlayerName=G?.idleRestart?G.players[Number(G.idleRestart.playerID)]?.name||'一位玩家':'';
  const restartPlayerCount=G?.idleRestart?sortedPlayers.filter(p=>p.id!==String(G.idleRestart.playerID)).length:sortedPlayers.length;
  const roundSeconds=G?.phase==='roundEnd'&&G.roundEndAt?Math.max(0,Math.ceil((G.roundEndAt-clockNow)/1000)):null;
  const scoreFlash=roundSeconds!==null&&G.roundEndAt-clockNow>3000;
  const start=()=>client.moves.StartGame(G.targetScore);
  const copy=async()=>{await navigator.clipboard?.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1300)};
  const liveScore=me?.secret?.reduce((sum,id,order)=>{const rank=active.findIndex(t=>t.id===id);return sum+(rank>=0&&rank<=order?[9,5,2][order]:0)},0)||0;
  const swapChoosing=SHRINE_MODE&&isMyTurn&&selectedCard==='swap';
  const cardFan=<div className="card-fan">{me?.hand?.map((card,index)=><button className={`action-card ${picked===index?'picked':''}`} key={`${card}-${index}`} style={{'--tilt':`${(index-(me.hand.length-1)/2)*3}deg`,'--order':index}} onClick={()=>{setPicked(picked===index?null:index);setSwapFirst(null);setSwapTarget(null);setWalkDestination(null)}} disabled={!isMyTurn||(card==='toast'&&(me?.roundPlays||0)===0)} title={card==='toast'&&(me?.roundPlays||0)===0?'爆破牌不能在你本局第一回合使用':'選取行動牌'}><span className="card-spark">✳</span><b>{card==='topple'?'推倒':card==='toast'?'爆破':card==='swap'?'互換':`上移 ${card.slice(2)}`}</b><i>{card==='topple'?'↓↓':card==='toast'?'✹':card==='swap'?'⇄':`↑${card.slice(2)}`}</i><small>{card==='topple'?'DROP':card==='toast'?'BLAST':card==='swap'?'SWAP':`RAISE ${card.slice(2)}`}</small></button>)}</div>;
  return <main className={`game-screen ${SHRINE_MODE?'shrine-mode':''}`}>
    <header className="gamebar"><button className="back-button" onClick={leaveRoom}>← <span>返回首頁</span></button><div className="brand game-brand"><span className="brand-mark">爆</span> 爆破<span className="brand-light">不倒翁</span>{SHRINE_MODE&&<small> ⛩ 神社牆面版</small>}</div><div className="room-code"><span>配對碼</span><b>{room?.matchID}</b><button onClick={copy}>{copied?'已複製':'複製連結 ↗'}</button></div></header>
    <div className="game-layout"><section className="table-column">
      <div className="round-strip"><span className="round-pill">第 {G?.round||1} 局</span><span className="turn-message">{G?.idleRestart?'閒置玩家退出倒數中':G?.phase==='lobby'?'準備好顏色後，房主即可開始':G?.phase==='rps'?'顏色撞車！出拳決定誰保留顏色':G?.phase==='roundEnd'?'本局結算中':G?.phase==='gameEnd'?'整場結束':isMyTurn?'輪到你出牌':'等待 '+(G?.players?.[Number(currentID)]?.name||'玩家')+' 出牌'}</span>{secondsLeft!==null&&<span className={`shrine-clock ${secondsLeft<=10?'urgent':''}`}>{secondsLeft<=10?`自動出牌 ${secondsLeft} 秒`:`思考 ${secondsLeft} 秒`}</span>}{rulesOpen&&<span className="round-rules"><span>🥇1 位 9 分</span><span>🥈前 2 位 5 分</span><span>🥉前 3 位 2 分</span><span className="rule-goal">目標 {G?.targetScore||30} 分</span></span>}<button className="icon-button rules-toggle" aria-expanded={rulesOpen} onClick={()=>setRulesOpen(v=>!v)}>ⓘ 規則 {rulesOpen?'⌃':'⌄'}</button></div>
      {idleRestartSeconds!==null&&<div className="idle-restart-banner" role="alert">{idlePlayerName} 閒置過久，本局 {idleRestartSeconds} 秒後{restartPlayerCount>=2?`即將以 ${restartPlayerCount} 人重啟遊戲`:'因人數不足即將結束'}。</div>}
      {G?.phase==='playing'&&!me?.joined&&<div className="idle-restart-banner" role="status">你已因累積逾時離開本場。<button onClick={leaveRoom}>返回首頁</button></div>}
       <div className={`board-wrap ${G?.phase==='playing'?'is-playing':''}`} onClickCapture={e=>{if(!swapChoosing)return;if(e.target instanceof Element&&e.target.closest('.scene-swap-picker, .scene-card-dock'))return;setPicked(null);setSwapFirst(null);setSwapTarget(null);e.stopPropagation()}}>
         <div className="scene-panel">
           {SHRINE_MODE ? <ShrineScene board={G?.board||[]} players={G?.players||[]} phase={G?.phase} roundEndAt={G?.roundEndAt} myPlayerID={player?.playerID} currentPlayer={currentID} lastMove={G?.lastMove} lastAttack={G?.lastAttack} lastCrow={G?.lastCrow} messages={messages} backdrop={G?.backdropIndex||0} shootMode={shootMode} flashTikiId={flashTikiId} flashToken={flashToken} onHead={selectHead} onPlayer={shoot} onStairs={rank=>{if(G?.phase==='playing'&&!G?.idleRestart)client?.moves.SetLadderRank(rank)}} onGround={point=>{if(G?.phase==='playing'&&!G?.idleRestart){setShootMode(false);setWalkDestination(point);if(isMyTurn)setTurnHint(true)}}} onWalk={(dx,dz)=>{if(G?.phase==='playing'&&!G?.idleRestart){setWalkDestination(null);client?.moves.MovePlayer(dx,dz)}}} /> : <TikiScene board={G?.board||[]} players={G?.players||[]} myPlayerID={player?.playerID} canWalk={G?.phase==='playing'} lastMove={G?.lastMove} lastPush={G?.lastPush} messages={messages} selectedHead={standingHead?.id} towerFocus={towerFocus} previewBlastToken={towerBlastToken} interactive onTikiClick={selectHead} onPlayerClick={id=>{if(G?.phase==='playing'&&String(id)!==String(player?.playerID))setWalkDestination({playerID:String(id)})}} onWalk={(dx,dz)=>{setWalkDestination(null);client?.moves.MovePlayer(dx,dz)}} onGroundClick={point=>{if(isMyTurn)setTurnHint(true);setWalkDestination(point)}} />}
           <div className="scene-label">{SHRINE_MODE?'神社木梯 · 最上方三個計分 · '+active.length+' 個頭像':'第 1～3 位計分 · '+active.length+' 張人頭仍在地板上'}</div>
           {SHRINE_MODE?<div className="shrine-controls"><button onClick={()=>client?.moves.SetLadderRank(Math.max(0,(standingIndex<0?active.length:standingIndex)-1))} disabled={G?.phase!=='playing'||G?.idleRestart||!active.length}>▲ 爬上一階</button><button onClick={()=>client?.moves.SetLadderRank(Math.min(active.length-1,standingIndex<0?active.length-1:standingIndex+1))} disabled={G?.phase!=='playing'||G?.idleRestart||!active.length}>▼ 下一階</button><button onClick={()=>{setWalkDestination(null);client?.moves.MovePlayer(.01,0)}} disabled={G?.phase!=='playing'||G?.idleRestart||standingIndex<0}>落地</button></div>:<><button className="tower-preview-button" aria-pressed={towerFocus} onClick={()=>setTowerFocus(value=>!value)}>{towerFocus?'↩ 回看圓盤':'◉ 近看立體對照塔'}</button>{G?.phase==='lobby'&&<button className="tower-blast-button" onClick={()=>{setTowerFocus(true);setTowerBlastToken(value=>value+1)}}>✹ 預覽底部爆破</button>}</>}
           <div className="walk-tip">{SHRINE_MODE?'點頭像或木梯選順位 · 點地面走動 · WASD 移動 · 拖曳視角':'拖曳旋轉／上下調視角 · 雙指縮放 · 點玩家推擠'}</div>
         </div>
         {G?.phase==='playing'&&<div className={`scene-secret ${showSecret?'expanded':''}`}><div className="scene-secret-heading"><button className="scene-secret-toggle" onClick={()=>setShowSecret(v=>!v)} aria-expanded={showSecret}>◉ 我的任務 {showSecret?'⌃':'⌄'}</button>{SHRINE_MODE&&<span className="scene-secret-score">本場即將得分 <b>{liveScore} 分</b></span>}</div>{showSecret&&<div className="scene-secret-list">{me?.secret?.map((id,index)=>{const tiki=DISPLAY_TIKIS[id],available=active.some(t=>t.id===id);return <span className={`scene-secret-item ${SHRINE_MODE&&available?'clickable':''}`} key={id} role={SHRINE_MODE&&available?'button':undefined} tabIndex={SHRINE_MODE&&available?0:undefined} title={SHRINE_MODE?(available?'點擊讓場景中的頭像閃爍兩秒':'此頭像已被爆破'):undefined} onClick={()=>flashMission(id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flashMission(id)}}}><b>{['1','2','3'][index]}</b><TikiPortrait tiki={tiki} size={32}/><small>{tiki.name}</small></span>})}</div>}</div>}
         {turnHint&&isMyTurn&&<div className="turn-toast" role="status">輪到你行動了！</div>}
         {SHRINE_MODE&&G?.phase==='playing'&&<div className="scene-actions"><div className="attack-buttons"><button className={shootMode?'active':''} disabled={!canAttack||!shootTargets.length} onClick={()=>setShootMode(v=>!v)}>🎯 射擊</button><button disabled={!canAttack||String(currentID)===String(player?.playerID)||!Number.isInteger(G?.players?.[Number(currentID)]?.ladderRank)} onClick={()=>{setShootMode(false);client?.moves.KickStairs()}}>🪜 搖晃</button></div>{shootMode&&<div className="shoot-targets"><small>選擇樓梯上的玩家</small>{shootTargets.map(p=><button key={p.id} onClick={()=>shoot(p.id)}>{p.name} · 第 {p.ladderRank+1} 位</button>)}</div>}</div>}
         {G?.phase==='playing'&&<div className="scene-quick" aria-label="快速對話">{QUICK.map(item=><button key={item.emoji} title={item.phrase} aria-label={item.phrase} onClick={()=>quickSend(item)}>{item.emoji}</button>)}</div>}
         {swapChoosing&&<div className="scene-swap-picker" role="group" aria-label="場上不倒翁，依序選擇兩個頭像"><div className="scene-swap-title"><b>場上不倒翁</b><span>{swapFirst===null?'請選第一個頭像':swapTarget===null?'請選第二個頭像':'已選好兩個頭像'}</span></div><div className="scene-swap-grid">{active.map((tiki,index)=>{const selected=swapFirst===tiki.id?1:swapTarget===tiki.id?2:0;return <button key={tiki.id} className={`scene-swap-head ${selected?'selected':''}`} aria-pressed={Boolean(selected)} aria-label={`${tiki.name}，第 ${index+1} 位${selected?`，第 ${selected} 個已選取`:''}`} onClick={()=>chooseSwapHead(tiki.id)}><TikiPortrait tiki={DISPLAY_TIKIS[tiki.id]} size={42}/><small>{index+1}</small>{selected>0&&<i>{selected}</i>}</button>})}</div></div>}
         {SHRINE_MODE&&G?.phase==='playing'&&<div className={`scene-card-dock ${swapChoosing?'swap-active':''}`}>{cardFan}{isMyTurn&&selectedCard&&(!swapChoosing||selectedCardValid)&&<button className="scene-action-button" disabled={!selectedCardValid} onClick={doMove} title={!selectedCardValid?selectionHint:'開始行動'}>開始行動 →</button>}</div>}
         {roundSeconds!==null&&<div className={`scene-round-transition ${scoreFlash?'score-flash':''}`} role="status">{scoreFlash?<><b>本局結算</b><small>積分更新中</small></>:<><b>倒數三秒後下一局</b><strong>{Math.min(3,roundSeconds)}</strong><small>總積分繼續累計</small></>}</div>}
         {G?.phase==='gameEnd'&&<div className="scene-rematch" role="dialog" aria-label="整場結束是否留下"><div className="scene-rematch-heading">整場結束</div><h2>{G?.gameWinner===null?'人數不足，這場遊戲已結束':`${G?.players?.[G.gameWinner]?.name||'玩家'} 贏得整場！`}</h2><p>{sortedPlayers.map(p=>`${p.name} ${p.total} 分`).join(' · ')}</p>{G?.gameWinner===null||!me?.joined?<button className="rematch-home" onClick={leaveRoom}>返回首頁</button>:me?.continue===true?<div className="rematch-wait">已選 YES，等待其他玩家…</div>:<><span>要留在房間再玩一場嗎？</span><div className="rematch-buttons"><button onClick={()=>client.moves.ContinueNext(true)}>YES <small>重新從 0 分開始</small></button><button onClick={()=>{client.moves.ContinueNext(false);setTimeout(leaveRoom,220)}}>NO <small>返回首頁</small></button></div></>}</div>}
       </div>
       {G?.phase==='lobby'&&<div className="pre-game-panel"><div className="lobby-title"><b>選擇你的顏色</b><small>撞色會在開局前猜拳</small></div><span className="lobby-status">{sortedPlayers.length<2?`等待至少 2 位玩家 · ${sortedPlayers.length}/2`:sortedPlayers.some(p=>!p.profileReady)?'等待玩家設定姓名':'已加入 '+sortedPlayers.length+' 位'}</span><div className="color-choices">{COLORS.map(c=><button key={c.id} title={c.name} className={me?.preferredColor===c.id?'selected':''} style={{'--swatch':c.hex}} onClick={()=>client.moves.SetProfile({name,color:me?.preferredColor===c.id?null:c.id,avatarTikiId:me?.avatarTikiId,ready:!joining})}><i/>{me?.preferredColor===c.id&&'✓'}</button>)}</div>{isHost?<button className="start-button" onClick={start} disabled={sortedPlayers.length<2||sortedPlayers.some(p=>!p.profileReady)}>開始遊戲 →</button>:<span className="host-note">等待房主…</span>}</div>}
       {G?.phase==='lobby'&&SHRINE_MODE&&<div className="lobby-avatar-panel"><b>選你的不倒翁頭像</b><div className="avatar-chooser">{SHRINE_TIKIS.map((tiki,id)=><button key={id} aria-label={`頭像 ${id+1}`} aria-pressed={me?.avatarTikiId===id} className={me?.avatarTikiId===id?'selected':''} onClick={()=>client.moves.SetProfile({name,color:me?.preferredColor,avatarTikiId:id,ready:!joining})}><img src={`/assets/daruma-head-v2-${String(id).padStart(2,'0')}.png`} alt=""/></button>)}</div></div>}
      {G?.phase==='rps'&&<div className="pre-game-panel rps-panel"><div><b>猜拳決定顏色</b><small>選一個手勢；房主完成後開始</small></div><div className="rps-buttons">{[['rock','✊'],['paper','✋'],['scissors','✌️']].map(([key,emoji])=><button className={rps===key?'selected':''} key={key} onClick={()=>{setRps(key);client.moves.PickRps(key)}}>{emoji}</button>)}</div>{isHost&&<button className="start-button" disabled={G.players.some(p=>p.joined&&!p.rps)} onClick={()=>client.moves.ResolveRps()}>揭曉結果 →</button>}</div>}
      {!SHRINE_MODE&&G?.phase==='playing'&&<div className="live-score"><span>本場即時得分</span><b>{liveScore} 分</b><small>若依目前人頭順位結算</small></div>}
      {!SHRINE_MODE&&G?.phase==='playing'&&<div className="hand-zone">
        <div className="hand-header"><button className="hand-toggle" onClick={()=>setHandOpen(v=>!v)} aria-expanded={handOpen}><b>你的手牌</b> <small>{me?.hand?.length||0} 張</small> {handOpen?'⌄':'⌃'}</button>{handOpen&&<small>{SHRINE_MODE?'樓梯高度決定操作順位':'站立位置決定操作人頭'}</small>}</div>
        {handOpen&&<>
        {cardFan}
        {isMyTurn&&selectedCard&&<div className="standing-action"><span><b>目前操作：</b>{standingHead?`第 ${standingIndex+1} 位`:'尚未靠近人頭'}　{selectionHint}</span><button onClick={()=>{setPicked(null);setSwapTarget(null);setWalkDestination(null)}} aria-label="取消選擇">×</button></div>}
        {isMyTurn&&selectedCard==='swap'&&standingHead&&<div className="head-picker inline-picker" role="group" aria-label="選擇互換的第二張人頭"><div className="head-picker-header"><div><b>選擇互換的第二張人頭</b><small>第一張固定是你目前站立位置旁的人頭。</small></div></div><div className="head-picker-grid">{active.map((tiki,index)=>{const portrait=DISPLAY_TIKIS[tiki.id],selected=swapTarget===tiki.id,disabled=tiki.id===standingHead.id;return <button key={tiki.id} className={`head-choice ${selected?'selected':''}`} disabled={disabled} onClick={()=>setSwapTarget(tiki.id)} title={`${portrait.name}，第 ${index+1} 位`}><TikiPortrait tiki={portrait} size={52}/><span>{portrait.name}</span><small>第 {index+1} 位</small>{selected&&<i>2</i>}</button>})}</div></div>}
        <div className="play-row"><span>{!isMyTurn?'等待 '+(G?.players?.[Number(currentID)]?.name||'玩家')+' 出牌':picked===null?SHRINE_MODE?'先爬上樓梯，再選一張手牌':'先靠近人頭，再選一張手牌':!standingHead?SHRINE_MODE?'請爬到要操作的頭像旁':'請走到要操作的人頭旁':!targetAllowed?selectionHint:selectedCard==='swap'&&!selectedCardValid?'請選第二張人頭；第一張依站立位置決定':SHRINE_MODE?'已可行動；射擊、踹梯或烏鴉可能改變你的高度':'已可行動；若被推擠，操作人頭會跟著改變'}</span><button className="play-button" disabled={!isMyTurn||picked===null||!selectedCardValid} onClick={doMove}>確定行動 →</button></div>
        </>}
      </div>}
    </section>
    <aside className="side-column">
      <div className="chat-card"><div className="panel-heading"><b>島上聊天室</b><span className="live-dot">即時</span></div><div className="chat-messages" ref={chatRef}>{messages.map((m,i)=><div className={`chat-msg ${m.kind}`} key={i}>{m.kind==='emote'?<div className="emote-bubble"><b>{m.emoji}</b><span>{m.name}　{m.phrase}</span></div>:m.kind==='system'?<span className="system-msg">{m.text}</span>:<><b>{m.name}</b><span>{m.text}</span></>}</div>)}</div><form className="chat-form" onSubmit={sendChat}><input value={chatText} maxLength={240} onChange={e=>setChatText(e.target.value)} placeholder="傳個訊息給大家…"/><button>↑</button></form></div>
    </aside></div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
