import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io } from 'socket.io-client';
import { TikiTopple, TIKIS } from './game.js';
import { nearestTikiIndex, walkingSpot } from './layout.js';
import { tikiImageUrl } from './tikiArt.js';
import TikiScene from './TikiScene.jsx';
import './style.css';

const SERVER_HOST = `${location.protocol}//${location.hostname}`;
const API = import.meta.env.VITE_GAME_SERVER || (import.meta.env.DEV ? `${SERVER_HOST}:8000` : location.origin);
const CHAT = import.meta.env.VITE_CHAT_SERVER || (import.meta.env.DEV ? `${SERVER_HOST}:8001` : location.origin);
const CHAT_PATH = import.meta.env.DEV ? '/socket.io' : '/chat/socket.io';
const COLORS = [{ id:'coral', name:'珊瑚紅', hex:'#ed7965' }, { id:'jade', name:'翡翠綠', hex:'#5db89b' }, { id:'sun', name:'日光黃', hex:'#edbd58' }, { id:'lavender', name:'薰衣草', hex:'#9b8ad7' }];
const QUICK = [{emoji:'⏰', phrase:'快點出牌啦！'}, {emoji:'😏', phrase:'這步真精彩呢。'}, {emoji:'😱', phrase:'不會吧！'}, {emoji:'🙏', phrase:'謝謝你！'}];
const newID = () => `guest-${Math.random().toString(36).slice(2,9)}`;

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
  const chatRef = useRef(null);

  useEffect(() => { const linkRoom = new URLSearchParams(location.search).get('room'); if (linkRoom) { setRoomInput(linkRoom); setAutoJoin(linkRoom); setModal('join'); } }, []);
  useEffect(() => { if (autoJoin && modal === 'join' && name.trim().length) { const code=autoJoin;setAutoJoin('');const saved=localStorage.getItem(`tiki-session:${code}`);if(saved){try{enterGame(JSON.parse(saved));return}catch{localStorage.removeItem(`tiki-session:${code}`)}}joinRoom(code); } }, [name, modal, autoJoin]);
  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [messages]);

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
      const data = await lobbyRequest('/games/tiki-topple/create', { numPlayers: seatCount, setupData: { targetScore } });
      const joined = await lobbyRequest(`/games/tiki-topple/${data.matchID}/join`, { playerID: '0', playerName: name.trim() });
      enterGame({ matchID: data.matchID, playerID:'0', credentials: joined.playerCredentials, host:true });
    } catch (e) { setError(e.message); }
  }
  async function joinRoom(code = roomInput) {
    if (!await saveName()) return;
    const normalized = code.trim(); if (!normalized) { setError('請輸入房間配對碼'); return; }
    try {
      const list = await lobbyRequest('/games/tiki-topple');
      const rooms = list.matches || list;
      let match = rooms.find(m => String(m.matchID).toLowerCase() === normalized.toLowerCase());
      if (!match) { try { match = await lobbyRequest(`/games/tiki-topple/${encodeURIComponent(normalized)}`); } catch {} }
      if (!match?.matchID) throw new Error('找不到這個房間，請確認配對碼。');
      const seat = (match.players || []).findIndex(s => !s.name && !s.isConnected);
      if (seat < 0) throw new Error('房間已滿');
      const joined = await lobbyRequest(`/games/tiki-topple/${match.matchID}/join`, { playerID:String(seat), playerName:name.trim() });
      enterGame({ matchID:match.matchID, playerID:String(seat), credentials:joined.playerCredentials, host:false });
    } catch (e) { setError(/full|player/i.test(e.message) ? '房間已滿' : e.message); }
  }
  function enterGame(session) {
    localStorage.setItem(`tiki-session:${session.matchID}`,JSON.stringify(session));
    setRoom(session); setPlayer(session); setModal(''); setScreen('game'); history.replaceState({}, '', `?room=${encodeURIComponent(session.matchID)}`);
    const bgio = Client({ game:TikiTopple, multiplayer:SocketIO({ server:API }), matchID:session.matchID, playerID:session.playerID, credentials:session.credentials });
    bgio.start(); bgio.subscribe(state => setGameState(state)); setClient(bgio);
    const chat = io(CHAT, { path: CHAT_PATH }); chat.on('connect', () => chat.emit('room:join', { room:session.matchID, name:name.trim() }));
    ['chat:message','chat:system','chat:emote'].forEach(event => chat.on(event, message => setMessages(prev => [...prev.slice(-70), { ...message, kind:event.replace('chat:','') }] )));
    setPlayer({ ...session, chat });
  }
  async function leaveRoom() {
    if (player && room && client) {
      try { client.moves.LeaveGame(); await new Promise(resolve=>setTimeout(resolve,180)); await fetch(`${API}/games/tiki-topple/${room.matchID}/leave`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerID:player.playerID,credentials:player.credentials})}); } catch {}
    }
    if(room?.matchID)localStorage.removeItem(`tiki-session:${room.matchID}`);
    player?.chat?.disconnect(); client?.stop(); setClient(null); setGameState(null); setMessages([]); setRoom(null); setPlayer(null); setScreen('home'); setModal(''); history.replaceState({}, '', location.pathname);
  }
  function sendChat(e) { e?.preventDefault(); if (!chatText.trim()) return; player?.chat?.emit('chat:message', { room:room.matchID, playerID:player.playerID, name, text:chatText.trim() }); setChatText(''); }
  function quickSend(item) { player?.chat?.emit('chat:emote', { room:room.matchID, playerID:player.playerID, name, emoji:item.emoji, phrase:item.phrase }); }
  const G = gameState?.G;
  const currentID = gameState?.ctx?.currentPlayer;
  const isMyTurn = currentID === player?.playerID && G?.phase === 'playing';
  const currentRoomLink = room ? `${location.origin}${location.pathname}?room=${encodeURIComponent(room.matchID)}` : '';

  return <>
    {screen === 'home' ? <main className="home-screen">
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <div className="home-art"><TikiScene board={[]} decorative /></div>
      <header className="topbar"><a className="brand" href="#"><span className="brand-mark">T</span><span>ISLAND<span className="brand-light">TABLE</span></span></a><div className="online"><i/> 島上有人等你 <b>24</b></div><button className="settings-button" onClick={()=>setModal('settings')} aria-label="設定">⚙</button></header>
      <div className="home-content"><div className="eyebrow"><span/> 一款圖騰策略桌遊 <span/></div><h1>推倒<span>堤基</span></h1><p className="subtitle">搶佔最佳位置，讓你的祕密圖騰<br/>站上榮耀之巔。</p>
        <div className="home-actions"><button className="primary-button" onClick={()=>{setError('');setModal('create')}}><span>＋</span> 創建遊戲 <b>→</b></button><button className="secondary-button" onClick={()=>{setError('');setModal('join')}}><span className="join-icon">↗</span> 加入遊戲</button></div>
        <div className="room-hint"><span className="link-icon">⌁</span> 和朋友分享房間連結，馬上開局 <span className="hint-line"/></div>
      </div>
      <div className="home-footer"><span>把握時機，圖騰由你掌握。</span><button onClick={()=>setModal('rules')}>遊戲規則 <span>↗</span></button><span className="footer-dots">✳　✳　✳</span></div>
    </main> : <GameRoom G={G} ctx={gameState?.ctx} player={player} room={room} name={name} isMyTurn={isMyTurn} client={client} messages={messages} chatRef={chatRef} chatText={chatText} setChatText={setChatText} sendChat={sendChat} quickSend={quickSend} currentID={currentID} rulesOpen={rulesOpen} setRulesOpen={setRulesOpen} link={currentRoomLink} leaveRoom={leaveRoom} />}
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal('')}}><section className="modal"><button className="modal-close" onClick={()=>setModal('')}>×</button>{modal === 'create' && <><div className="modal-kicker">新的島嶼冒險</div><h2>創建遊戲</h2><label>你的顯示名稱<input maxLength="20" value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="輸入名字（最多20字）"/></label><div className="field-note">{name.length}/20 字</div><div className="form-row"><label>房間人數<select value={seatCount} onChange={e=>setSeatCount(Number(e.target.value))}><option value="2">2 位玩家</option><option value="3">3 位玩家</option><option value="4">4 位玩家</option></select></label><label>整場目標分數<div className="score-input"><input type="number" min="1" max="60" value={targetScore} onChange={e=>setTargetScore(Math.max(1,Math.min(60,Number(e.target.value))))}/><span>分</span></div></label></div><p className="field-note">至少完成一局，最高可設為 60 分。</p>{error&&<p className="error">{error}</p>}<button className="primary-button modal-action" onClick={createRoom}>建立房間 <b>→</b></button></>}
      {modal === 'join' && <><div className="modal-kicker">朋友的島嶼正在等你</div><h2>加入遊戲</h2><label>你的顯示名稱<input maxLength="20" value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="輸入名字（最多20字）"/></label><label>房間配對碼<input className="code-input" value={roomInput} onChange={e=>setRoomInput(e.target.value)} placeholder="輸入房間配對碼" onKeyDown={e=>e.key==='Enter'&&joinRoom()}/></label>{error&&<p className="error">{error}</p>}<button className="primary-button modal-action" onClick={()=>joinRoom()}>搜尋並加入 <b>→</b></button></>}
      {modal === 'settings' && <><div className="modal-kicker">偏好設定</div><h2>設定</h2><label>顯示名稱<input maxLength="20" value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="輸入名字（最多20字）"/></label><p className="field-note">名稱只會保存在這台裝置上。</p><button className="primary-button modal-action" onClick={()=>{saveName();setModal('')}}>儲存設定 <b>✓</b></button></>}
       {modal === 'rules' && <><div className="modal-kicker">一局一局，步步為營</div><h2>怎麼玩</h2><ul className="rules-list"><li><b>祕密圖騰</b>　每位玩家私有 3 個圖騰，結束時依排名得分。</li><li><b>出牌移動</b>　打出 Up 1／2／3 將圖騰向上移動；Topple 推到隊尾；互換交換任意兩張圖騰。</li><li><b>爆破移除</b>　Toast 炸掉隊尾圖騰（每局首回合不能使用）。</li><li><b>玩家互動</b>　點其他玩家，角色會走過去推倒對方。</li><li><b>回合計分</b>　前三名依序得 9、5、2 分；最先達到房主設定分數者勝。</li></ul><button className="primary-button modal-action" onClick={()=>setModal('')}>知道了</button></>}
    </section></div>}
  </>;
}

function TikiPortrait({tiki,size=48}) {
  return <img className="tiki-portrait" width={size} height={size} src={tikiImageUrl(tiki)} alt={`${tiki?.name||'提基'}圖騰`}/>;
}

function GameRoom({G,ctx,player,room,name,isMyTurn,client,messages,chatRef,chatText,setChatText,sendChat,quickSend,currentID,rulesOpen,setRulesOpen,link,leaveRoom}) {
  const [copied,setCopied]=useState(false), [picked,setPicked]=useState(null), [showSecret,setShowSecret]=useState(true), [turnHint,setTurnHint]=useState(false);
  const [rps,setRps]=useState('');
  const [swapTarget,setSwapTarget]=useState(null);
  const [walkDestination,setWalkDestination]=useState(null);
  const isHost=player?.host||String(G?.hostID)===String(player?.playerID);
  const me=G?.players?.[Number(player?.playerID)];
  useEffect(()=>{ if(!G||!me||!client)return; if(['lobby','roundEnd'].includes(G.phase)) client.moves.SetProfile({name, color:me.preferredColor}); },[name,me?.preferredColor,G?.phase]);
  useEffect(()=>{if(!turnHint)return;const timer=setTimeout(()=>setTurnHint(false),2200);return()=>clearTimeout(timer)},[turnHint]);
  useEffect(()=>{if(G?.lastPush&&String(G.lastPush.targetID)===String(player?.playerID))setWalkDestination(null)},[G?.lastPush?.stamp,player?.playerID]);
  const active=G?.board?.filter(t=>t.active)||[];
  const selectedCard=picked===null?null:me?.hand?.[picked];
  const standingIndex=nearestTikiIndex(me?.position,active);
  const standingHead=standingIndex<0?null:active[standingIndex];
  const targetAllowed=Boolean(standingHead)&&!(selectedCard?.startsWith('up')&&standingIndex<Number(selectedCard.slice(2)))&&!(selectedCard==='toast'&&((me?.roundPlays||0)===0||standingIndex!==active.length-1));
  const selectedCardValid=Boolean(selectedCard)&&targetAllowed&&(selectedCard!=='swap'||(swapTarget!==null&&swapTarget!==standingHead.id&&active.some(t=>t.id===swapTarget)));
  const selectionHint=selectedCard?.startsWith('up')?`這張牌要站在第 ${Number(selectedCard.slice(2))+1} 位或更後方。`:selectedCard==='toast'?'爆破只能站在最後一位人頭旁使用。':selectedCard==='swap'?'第一張依站立位置決定；再選第二張。':'目標依目前站立位置決定。';
  const selectHead=(id)=>{
    if(G?.phase!=='playing'||!active.some(t=>t.id===id))return;
    if(selectedCard==='swap'&&standingHead&&id!==standingHead.id){setSwapTarget(id);return;}
    setWalkDestination({id});
  };
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
  const doMove=()=>{if(picked===null||!isMyTurn||!selectedCardValid)return;client.moves.PlayCard(picked,swapTarget);setPicked(null);setSwapTarget(null);setWalkDestination(null)};
  const sortedPlayers=G?.players?.map((p,i)=>({...p,id:String(i)})).filter(p=>p.joined)||[];
  const start=()=>client.moves.StartGame(G.targetScore);
  const copy=async()=>{await navigator.clipboard?.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1300)};
  const liveScore=me?.secret?.reduce((sum,id,order)=>{const rank=active.findIndex(t=>t.id===id);return sum+(rank>=0&&rank<=order?[9,5,2][order]:0)},0)||0;
  return <main className="game-screen">
    <header className="gamebar"><button className="back-button" onClick={leaveRoom}>← <span>返回首頁</span></button><div className="brand game-brand"><span className="brand-mark">T</span> ISLAND<span className="brand-light">TABLE</span></div><div className="room-code"><span>配對碼</span><b>{room?.matchID}</b><button onClick={copy}>{copied?'已複製':'複製連結 ↗'}</button></div></header>
    <div className="game-layout"><section className="table-column">
      <div className="round-strip"><span className="round-pill">第 {G?.round||1} 局</span><span className="turn-message">{G?.phase==='lobby'?'準備好顏色後，房主即可開始':G?.phase==='rps'?'顏色撞車！出拳決定誰保留顏色':G?.phase==='roundEnd'||G?.phase==='gameEnd'?'本局結束，看看誰的圖騰站上高位':isMyTurn?'輪到你出牌':'等待 '+(G?.players?.[Number(currentID)]?.name||'玩家')+' 出牌'}</span>{rulesOpen&&<span className="round-rules"><span>🥇1 位 9 分</span><span>🥈前 2 位 5 分</span><span>🥉前 3 位 2 分</span><span className="rule-goal">目標 {G?.targetScore||30} 分</span></span>}<button className="icon-button rules-toggle" aria-expanded={rulesOpen} onClick={()=>setRulesOpen(v=>!v)}>ⓘ 規則 {rulesOpen?'⌃':'⌄'}</button></div>
       <div className="board-wrap">
         <div className="scene-panel"><TikiScene board={G?.board||[]} players={G?.players||[]} myPlayerID={player?.playerID} canWalk={G?.phase==='playing'} lastMove={G?.lastMove} lastPush={G?.lastPush} messages={messages} selectedHead={standingHead?.id} interactive onTikiClick={selectHead} onPlayerClick={id=>{if(G?.phase==='playing'&&String(id)!==String(player?.playerID))setWalkDestination({playerID:String(id)})}} onWalk={(dx,dz)=>{setWalkDestination(null);client?.moves.MovePlayer(dx,dz)}} onGroundClick={point=>{if(isMyTurn)setTurnHint(true);setWalkDestination(point)}} /><div className="scene-label">第 1～3 位計分 · {active.length} 張人頭仍在地板上</div><div className="walk-tip">拖曳旋轉／上下調視角 · 雙指縮放 · 點玩家推擠</div>
         </div>
         {G?.phase==='playing'&&<div className={`scene-secret ${showSecret?'expanded':''}`}><button className="scene-secret-toggle" onClick={()=>setShowSecret(v=>!v)} aria-expanded={showSecret}>◉ 我的任務 {showSecret?'⌃':'⌄'}</button>{showSecret&&<div className="scene-secret-list">{me?.secret?.map((id,index)=>{const tiki=TIKIS[id];return <span className="scene-secret-item" key={id}><b>{['1','2','3'][index]}</b><TikiPortrait tiki={tiki} size={32}/><small>{tiki.name}</small></span>})}</div>}</div>}
         {turnHint&&isMyTurn&&<div className="turn-toast" role="status">輪到你行動了！</div>}
         {G?.phase==='playing'&&<div className="scene-quick" aria-label="快速對話">{QUICK.map(item=><button key={item.emoji} title={item.phrase} aria-label={item.phrase} onClick={()=>quickSend(item)}>{item.emoji}</button>)}</div>}
       </div>
       {G?.phase==='lobby'&&<div className="pre-game-panel"><div className="lobby-title"><b>選擇你的顏色</b><small>撞色會在開局前猜拳</small></div><span className="lobby-status">{sortedPlayers.length<2?`等待至少 2 位玩家 · ${sortedPlayers.length}/2`:`已加入 ${sortedPlayers.length} 位`}</span><div className="color-choices">{COLORS.map(c=><button key={c.id} title={c.name} className={me?.preferredColor===c.id?'selected':''} style={{'--swatch':c.hex}} onClick={()=>client.moves.SetProfile({name,color:me?.preferredColor===c.id?null:c.id})}><i/>{me?.preferredColor===c.id&&'✓'}</button>)}</div>{isHost?<button className="start-button" onClick={start} disabled={sortedPlayers.length<2}>開始遊戲 →</button>:<span className="host-note">等待房主…</span>}</div>}
      {G?.phase==='rps'&&<div className="pre-game-panel rps-panel"><div><b>猜拳決定顏色</b><small>選一個手勢；房主完成後開始</small></div><div className="rps-buttons">{[['rock','✊'],['paper','✋'],['scissors','✌️']].map(([key,emoji])=><button className={rps===key?'selected':''} key={key} onClick={()=>{setRps(key);client.moves.PickRps(key)}}>{emoji}</button>)}</div>{isHost&&<button className="start-button" disabled={G.players.some(p=>p.joined&&!p.rps)} onClick={()=>client.moves.ResolveRps()}>揭曉結果 →</button>}</div>}
      {G?.phase==='playing'&&<div className="live-score"><span>本場即時得分</span><b>{liveScore} 分</b><small>若依目前人頭順位結算</small></div>}
      {G?.phase==='playing'&&<div className="hand-zone">
        <div className="hand-header"><span><b>你的手牌</b> <small>{me?.hand?.length||0} 張</small></span><small>站立位置決定操作人頭</small></div>
        <div className="card-fan">{me?.hand?.map((card,index)=><button className={`action-card ${picked===index?'picked':''}`} key={`${card}-${index}`} style={{'--tilt':`${(index-(me.hand.length-1)/2)*3}deg`,'--order':index}} onClick={()=>{setPicked(index);setSwapTarget(null);setWalkDestination(null)}} disabled={!isMyTurn||(card==='toast'&&(me?.roundPlays||0)===0)} title={card==='toast'&&(me?.roundPlays||0)===0?'爆破牌不能在你本局第一回合使用':'選取行動牌'}><span className="card-spark">✳</span><b>{card==='topple'?'推倒':card==='toast'?'爆破':card==='swap'?'互換':`上移 ${card.slice(2)}`}</b><i>{card==='topple'?'↓↓':card==='toast'?'✹':card==='swap'?'⇄':`↑${card.slice(2)}`}</i><small>{card==='topple'?'TOPPLE':card==='toast'?'TOAST':card==='swap'?'SWAP':'TIKI UP'}</small></button>)}</div>
        {isMyTurn&&selectedCard&&<div className="standing-action"><span><b>目前操作：</b>{standingHead?`${TIKIS[standingHead.id].name} · 第 ${standingIndex+1} 位`:'尚未靠近人頭'}　{selectionHint}</span><button onClick={()=>{setPicked(null);setSwapTarget(null);setWalkDestination(null)}} aria-label="取消選擇">×</button></div>}
        {isMyTurn&&selectedCard==='swap'&&standingHead&&<div className="head-picker inline-picker" role="group" aria-label="選擇互換的第二張人頭"><div className="head-picker-header"><div><b>選擇互換的第二張人頭</b><small>第一張固定是你目前站立位置旁的人頭。</small></div></div><div className="head-picker-grid">{active.map((tiki,index)=>{const portrait=TIKIS[tiki.id],selected=swapTarget===tiki.id,disabled=tiki.id===standingHead.id;return <button key={tiki.id} className={`head-choice ${selected?'selected':''}`} disabled={disabled} onClick={()=>setSwapTarget(tiki.id)} title={`${portrait.name}，第 ${index+1} 位`}><TikiPortrait tiki={portrait} size={52}/><span>{portrait.name}</span><small>第 {index+1} 位</small>{selected&&<i>2</i>}</button>})}</div></div>}
        <div className="play-row"><span>{!isMyTurn?'等待 '+(G?.players?.[Number(currentID)]?.name||'玩家')+' 出牌':picked===null?'先靠近人頭，再選一張手牌':!standingHead?'請走到要操作的人頭旁':!targetAllowed?selectionHint:selectedCard==='swap'&&!selectedCardValid?'請選第二張人頭；第一張依站立位置決定':'已可行動；若被推擠，操作人頭會跟著改變'}</span><button className="play-button" disabled={!isMyTurn||picked===null||!selectedCardValid} onClick={doMove}>確定行動 →</button></div>
      </div>}
      {['roundEnd','gameEnd'].includes(G?.phase)&&<div className="round-end"><div className="winner-mark">✦</div><div><b>{G.phase==='gameEnd'?(G.gameWinner===null?'人數不足，這間島嶼已散場':`${G.players[G.gameWinner]?.name} 贏得整場！`):'本局結算完成'}</b><p>{sortedPlayers.map(p=>`${p.name} +${p.roundScore}分（累計 ${p.total}）`).join('　·　')}</p></div>{G.phase==='gameEnd'?<button onClick={leaveRoom}>回到首頁</button>:me?.continue!==null?<span className="host-note">已選擇留下，等待其他玩家…</span>:<><button onClick={()=>client.moves.ContinueNext(true)}>留下來再玩 →</button><button className="text-button" onClick={()=>{client.moves.ContinueNext(false);setTimeout(leaveRoom,220)}}>離開回首頁</button></>}</div>}
    </section>
    <aside className="side-column">
      <div className="chat-card"><div className="panel-heading"><b>島上聊天室</b><span className="live-dot">即時</span></div><div className="chat-messages" ref={chatRef}>{messages.map((m,i)=><div className={`chat-msg ${m.kind}`} key={i}>{m.kind==='emote'?<div className="emote-bubble"><b>{m.emoji}</b><span>{m.name}　{m.phrase}</span></div>:m.kind==='system'?<span className="system-msg">{m.text}</span>:<><b>{m.name}</b><span>{m.text}</span></>}</div>)}</div><form className="chat-form" onSubmit={sendChat}><input value={chatText} maxLength={240} onChange={e=>setChatText(e.target.value)} placeholder="傳個訊息給大家…"/><button>↑</button></form></div>
    </aside></div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
