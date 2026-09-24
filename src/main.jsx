import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { TikiTopple, TIKIS } from './game.js';
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
  function sendChat(e) { e?.preventDefault(); if (!chatText.trim()) return; player?.chat?.emit('chat:message', { room:room.matchID, name, text:chatText.trim() }); setChatText(''); }
  function quickSend(item) { player?.chat?.emit('chat:emote', { room:room.matchID, name, emoji:item.emoji, phrase:item.phrase }); }
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
      {modal === 'rules' && <><div className="modal-kicker">一局一局，步步為營</div><h2>怎麼玩</h2><ul className="rules-list"><li><b>祕密圖騰</b>　每位玩家私有 3 個圖騰，結束時依排名得分。</li><li><b>出牌移動</b>　打出 Up 1／2／3，將任意圖騰向上移動；Topple 可把它推到隊尾。</li><li><b>爆破移除</b>　Toast 炸掉隊尾圖騰（每局首回合不能使用）。</li><li><b>回合計分</b>　前三名依序得 9、5、2 分；最先達到房主設定分數者勝。</li></ul><button className="primary-button modal-action" onClick={()=>setModal('')}>知道了</button></>}
    </section></div>}
  </>;
}

function TikiPortrait({tiki,size=48}) {
  const expression=tiki?.expression||'neutral';
  const skin=tiki?.color||'#96c86c';
  const closed=expression==='sleepy'||expression==='wink'||expression==='smirk';
  const eyes=[[34,45],[66,45]];
  const brow=expression==='angry'?'M22 31 Q34 22 45 34 M55 34 Q67 22 78 31':expression==='smirk'?'M22 31 Q34 25 45 31 M55 31 Q67 35 78 29':'M22 31 Q34 27 45 31 M55 31 Q67 27 78 31';
  return <svg className="tiki-portrait" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${tiki?.name||'提基'}圖騰`}>
    <path d="M24 78 Q17 83 21 94 L79 94 Q83 83 76 78Z" fill="#46414a"/>
    <path d="M17 39 Q10 35 9 48 Q9 59 20 60 M83 39 Q90 35 91 48 Q91 59 80 60" fill={skin} stroke="#45513c" strokeWidth="2"/>
    <path d="M19 26 Q22 10 50 9 Q78 10 81 26 L84 61 Q82 81 67 84 L33 84 Q18 81 16 61Z" fill={skin} stroke="#45513c" strokeWidth="2.5"/>
    <path d="M21 40 Q32 34 44 41 M56 41 Q68 34 79 40" fill="none" stroke="#45404a" strokeWidth="5" strokeLinecap="round"/>
    {eyes.map(([x,y],i)=>closed&&(expression==='sleepy'||(expression==='wink'&&i===0)||(expression==='smirk'&&i===0))
      ? <path key={i} d={`M${x-9} ${y} Q${x} ${y+6} ${x+9} ${y}`} fill="none" stroke="#45404a" strokeWidth="4" strokeLinecap="round"/>
      : <g key={i}><ellipse cx={x} cy={y} rx={expression==='angry'?8:10} ry={expression==='angry'?6:8} fill="#fff8ea"/><circle cx={x+(expression==='roll'?(i===0?2:-2):0)} cy={y+(expression==='roll'?-4:0)} r="4.3" fill="#332c32"/><circle cx={x-1.5} cy={y-2.3+(expression==='roll'?-4:0)} r="1.3" fill="white"/></g>)}
    <path d={brow} fill="none" stroke="#45404a" strokeWidth="5" strokeLinecap="round"/>
    <ellipse cx="50" cy="57" rx="13" ry="11" fill={skin}/><ellipse cx="50" cy="60" rx="7" ry="4" fill="#81ad5b" opacity=".55"/>
    {expression==='surprised'?<ellipse cx="50" cy="72" rx="6" ry="8" fill="#45404a"/>:expression==='smile'?<g><path d="M36 69 Q50 85 64 69" fill="#45404a"/><path d="M40 71 Q50 78 60 71" fill="#fff1cf"/></g>:expression==='smirk'?<path d="M38 73 Q52 75 63 66" fill="none" stroke="#45404a" strokeWidth="4" strokeLinecap="round"/>:expression==='angry'?<path d="M39 75 Q50 67 61 75" fill="none" stroke="#45404a" strokeWidth="4" strokeLinecap="round"/>:<path d="M39 71 Q50 76 61 71" fill="none" stroke="#45404a" strokeWidth="4" strokeLinecap="round"/>}
    {expression==='sweat'&&<path d="M75 42 Q84 53 76 59 Q68 57 75 42Z" fill="#77dff2" stroke="#fff" strokeWidth="1.5"/>}
    <path d="M19 83 Q50 90 81 83 L78 94 Q50 98 22 94Z" fill="#625d65" stroke="#39373c" strokeWidth="2"/>
  </svg>;
}

function GameRoom({G,ctx,player,room,name,isMyTurn,client,messages,chatRef,chatText,setChatText,sendChat,quickSend,currentID,rulesOpen,setRulesOpen,link,leaveRoom}) {
  const [copied,setCopied]=useState(false), [picked,setPicked]=useState(null), [showSecret,setShowSecret]=useState(false), [spectateClock,setSpectateClock]=useState(0);
  const [rps,setRps]=useState('');
  const [selectedHeads,setSelectedHeads]=useState([]);
  const isHost=player?.host||String(G?.hostID)===String(player?.playerID);
  const me=G?.players?.[Number(player?.playerID)];
  useEffect(()=>{ if(!G||!me||!client)return; if(['lobby','roundEnd'].includes(G.phase)) client.moves.SetProfile({name, color:me.preferredColor}); },[name,me?.preferredColor,G?.phase]);
  useEffect(()=>{const t=setInterval(()=>setSpectateClock(v=>v+1),1000);return()=>clearInterval(t)},[]);
  const active=G?.board?.filter(t=>t.active)||[];
  const selectedCard=picked===null?null:me?.hand?.[picked];
  const targetCount=selectedCard==='swap'?2:1;
  const firstTargetIndex=active.findIndex(t=>t.id===selectedHeads[0]);
  const targetAllowed=(tiki,index)=>!(selectedCard?.startsWith('up')&&index<Number(selectedCard.slice(2)))&&!(selectedCard==='toast'&&((me?.roundPlays||0)===0||index!==active.length-1));
  const selectedCardValid=Boolean(selectedCard)&&selectedHeads.length===targetCount&&selectedHeads.every(id=>active.some(t=>t.id===id))&&targetAllowed(active[firstTargetIndex],firstTargetIndex);
  const selectionHint=selectedCard?.startsWith('up')?`上移 ${selectedCard.slice(2)} 格：請選塔上第 ${Number(selectedCard.slice(2))+1} 位或更下方的圖騰。`:selectedCard==='toast'?'爆破牌只能選塔底圖騰。':selectedCard==='swap'?'互換需要依序選兩個不同圖騰。':'';
  const selectHead=(id)=>{
    const index=active.findIndex(t=>t.id===id),tiki=active[index];if(!tiki||!targetAllowed(tiki,index))return;
    setSelectedHeads(previous=>previous.includes(id)?previous.filter(item=>item!==id):targetCount===1?[id]:previous.length<2?[...previous,id]:[previous[1],id]);
  };
  const doMove=()=>{if(picked===null||!isMyTurn||!selectedCardValid)return;client.moves.PlayCard(picked,selectedHeads[0],selectedHeads[1]);setPicked(null);setSelectedHeads([])};
  const sortedPlayers=G?.players?.map((p,i)=>({...p,id:String(i)})).filter(p=>p.joined)||[];
  const start=()=>client.moves.StartGame(G.targetScore);
  const copy=async()=>{await navigator.clipboard?.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1300)};
  const targetTiki=G?.board?.filter(t=>t.active).at(-1);
  return <main className="game-screen">
    <header className="gamebar"><button className="back-button" onClick={leaveRoom}>← <span>返回首頁</span></button><div className="brand game-brand"><span className="brand-mark">T</span> ISLAND<span className="brand-light">TABLE</span></div><div className="room-code"><span>配對碼</span><b>{room?.matchID}</b><button onClick={copy}>{copied?'已複製':'複製連結 ↗'}</button></div></header>
    <div className="game-layout"><section className="table-column">
      <div className="round-strip"><span className="round-pill">第 {G?.round||1} 局</span><span className="turn-message">{G?.phase==='lobby'?'準備好顏色後，房主即可開始':G?.phase==='rps'?'顏色撞車！出拳決定誰保留顏色':G?.phase==='roundEnd'||G?.phase==='gameEnd'?'本局結束，看看誰的圖騰站上高位':isMyTurn?'輪到你出牌':'等待 '+(G?.players?.[Number(currentID)]?.name||'玩家')+' 出牌'}</span><button className="icon-button" onClick={()=>setRulesOpen(v=>!v)}>ⓘ 規則</button></div>
      <div className="board-wrap"><div className="seat seat-top">{sortedPlayers.find(p=>Number(p.id)===(Number(player?.playerID)+2)%Math.max(2,G?.players?.length||2))?.name||'等候玩家'}</div><div className="seat seat-left">{sortedPlayers.find(p=>Number(p.id)===(Number(player?.playerID)+1)%Math.max(2,G?.players?.length||2))?.name||'等候玩家'}</div><div className="seat seat-right">{sortedPlayers.find(p=>Number(p.id)===(Number(player?.playerID)+3)%Math.max(2,G?.players?.length||2))?.name||''}</div>
        <div className="scene-panel"><TikiScene board={G?.board||[]} lastMove={G?.lastMove} interactive onTikiClick={selectHead} secret={showSecret?me?.secret:[]} /><div className="scene-label">塔頂三座計分 · {active.length} 座圖騰仍在塔上</div><button className="rotate-tip" onClick={e=>e.currentTarget.classList.toggle('tip-hide')}>⟳　拖曳旋轉視角</button>
        {G?.phase==='playing'&&isMyTurn&&selectedCard&&<div className="head-picker" role="dialog" aria-label="選擇本次行動的圖騰"><div className="head-picker-header"><div><b>{selectedCard==='swap'?'選擇要互換的兩個圖騰':'選擇行動目標'}</b><small>{selectedCard==='swap'?`已選 ${selectedHeads.length}/2 個`:selectionHint}</small></div><button onClick={()=>{setPicked(null);setSelectedHeads([])}} aria-label="關閉選擇視窗">×</button></div><div className="head-picker-grid">{active.map((tiki,index)=>{const portrait=TIKIS[tiki.id],selected=selectedHeads.includes(tiki.id),disabled=!targetAllowed(tiki,index);return <button key={tiki.id} className={`head-choice ${selected?'selected':''}`} style={{'--tiki-color':portrait.color}} disabled={disabled} onClick={()=>selectHead(tiki.id)} title={`${tiki.name}，${index===0?'塔頂':index===active.length-1?'塔底':`第 ${index+1} 位`}`}><TikiPortrait tiki={portrait} size={52}/><span>{portrait.name}</span><small>{index===0?'塔頂':index===active.length-1?'塔底':`第 ${index+1} 位`}</small>{selected&&<i>{selectedHeads.indexOf(tiki.id)+1}</i>}</button>})}</div><div className="head-picker-footer"><span>{selectedCardValid?'目標已選好，可以執行。':`選擇 ${targetCount} 個圖騰（${selectedHeads.length}/${targetCount}）`}</span><button onClick={doMove} disabled={!selectedCardValid}>執行行動 →</button></div></div>}
        </div>
        <div className="seat seat-bottom">{me?.name||name} <span>你</span></div>
      </div>
      {G?.phase==='lobby'&&<div className="pre-game-panel"><div><b>選擇你的顏色</b><small>相同顏色會在開局前猜拳決定</small></div><div className="color-choices">{COLORS.map(c=><button key={c.id} title={c.name} className={me?.preferredColor===c.id?'selected':''} style={{'--swatch':c.hex}} onClick={()=>client.moves.SetProfile({name,color:me?.preferredColor===c.id?null:c.id})}><i/>{me?.preferredColor===c.id&&'✓'}</button>)}</div>{isHost?<button className="start-button" onClick={start} disabled={sortedPlayers.length<2}>{sortedPlayers.length<2?'等待至少 2 位玩家':'開始遊戲 →'}</button>:<span className="host-note">等待房主開始遊戲…</span>}</div>}
      {G?.phase==='rps'&&<div className="pre-game-panel rps-panel"><div><b>猜拳決定顏色</b><small>選一個手勢；房主完成後開始</small></div><div className="rps-buttons">{[['rock','✊'],['paper','✋'],['scissors','✌️']].map(([key,emoji])=><button className={rps===key?'selected':''} key={key} onClick={()=>{setRps(key);client.moves.PickRps(key)}}>{emoji}</button>)}</div>{isHost&&<button className="start-button" disabled={G.players.some(p=>p.joined&&!p.rps)} onClick={()=>client.moves.ResolveRps()}>揭曉結果 →</button>}</div>}
      {G?.phase==='playing'&&<div className="hand-zone">
        <div className="hand-header"><span><b>你的手牌</b> <small>{me?.hand?.length||0} 張</small></span><button onClick={()=>setShowSecret(v=>!v)}>{showSecret?'隱藏祕密圖騰':'查看祕密圖騰'} ◉</button></div>
        {showSecret&&<div className="secret-callout">你的祕密圖騰：{me?.secret?.map((id,index)=>{const tiki=TIKIS[id];return <span className="secret-tiki" key={id}><b>{['🥇','🥈','🥉'][index]}</b><TikiPortrait tiki={tiki} size={37}/><span>{tiki.name}</span></span>})}</div>}
        <div className="card-fan">{me?.hand?.map((card,index)=><button className={`action-card ${picked===index?'picked':''}`} key={`${card}-${index}`} style={{'--tilt':`${(index-(me.hand.length-1)/2)*3}deg`,'--order':index}} onClick={()=>{setPicked(index);setSelectedHeads([])}} disabled={!isMyTurn||(card==='toast'&&(me?.roundPlays||0)===0)} title={card==='toast'&&(me?.roundPlays||0)===0?'爆破牌不能在你本局第一回合使用':'選取行動牌'}><span className="card-spark">✳</span><b>{card==='topple'?'推倒':card==='toast'?'爆破':card==='swap'?'互換':`上移 ${card.slice(2)}`}</b><i>{card==='topple'?'↓↓':card==='toast'?'✹':card==='swap'?'⇄':`↑${card.slice(2)}`}</i><small>{card==='topple'?'TOPPLE':card==='toast'?'TOAST':card==='swap'?'SWAP':'TIKI UP'}</small></button>)}</div>
        <div className="play-row"><span>{!isMyTurn?'等待 '+(G?.players?.[Number(currentID)]?.name||'玩家')+' 出牌':picked===null?'選一張牌，再從獨立圖騰視窗選擇目標':selectedHeads.length<targetCount?`從視窗選擇目標（${selectedHeads.length}/${targetCount}）`:selectedHeads.map(id=>TIKIS[id]?.name).join(' ⇄ ')}</span><button className="play-button" disabled={!isMyTurn||picked===null||!selectedCardValid} onClick={doMove}>出牌並執行 →</button></div>
      </div>}
      {['roundEnd','gameEnd'].includes(G?.phase)&&<div className="round-end"><div className="winner-mark">✦</div><div><b>{G.phase==='gameEnd'?(G.gameWinner===null?'人數不足，這間島嶼已散場':`${G.players[G.gameWinner]?.name} 贏得整場！`):'本局結算完成'}</b><p>{sortedPlayers.map(p=>`${p.name} +${p.roundScore}分（累計 ${p.total}）`).join('　·　')}</p></div>{G.phase==='gameEnd'?<button onClick={leaveRoom}>回到首頁</button>:me?.continue!==null?<span className="host-note">已選擇留下，等待其他玩家…</span>:<><button onClick={()=>client.moves.ContinueNext(true)}>留下來再玩 →</button><button className="text-button" onClick={()=>{client.moves.ContinueNext(false);setTimeout(leaveRoom,220)}}>離開回首頁</button></>}</div>}
    </section>
    <aside className="side-column">{rulesOpen&&<div className="scoring-card"><div><b>計分規則</b><span>祕密圖騰結算</span></div><div className="scoring-points"><span>🥇 第一名　9 分</span><span>🥈 前二名　5 分</span><span>🥉 前三名　2 分</span></div><div className="target-score">整場目標 <b>{G?.targetScore||30} 分</b></div></div>}<div className="players-card"><div className="panel-heading"><b>島上玩家</b><span>{sortedPlayers.length}/{G?.players?.length||4} 人</span></div>{sortedPlayers.map((p,i)=>{const emote=[...messages].reverse().find(m=>m.kind==='emote'&&m.name===p.name);return <div className={`player-row ${p.id===currentID&&G?.phase==='playing'?'active-player':''}`} key={p.id}><div className="avatar-wrap"><div className="avatar" style={{'--swatch':COLORS.find(c=>c.id===p.color)?.hex||'#b2a180'}}>{p.name?.slice(0,1)||'T'}</div>{emote&&<span className="player-emoji">{emote.emoji}</span>}</div><div className="player-name">{p.name}{p.id===player?.playerID&&<small>你</small>}{String(G?.hostID)===p.id&&<em>房主</em>}</div><div className="points">{p.total}<small>分</small></div></div>})}<div className="score-goal-line"><span>達到目標結束整場</span><b>{G?.targetScore||30} 分</b></div></div>
      <div className="chat-card"><div className="panel-heading"><b>島上聊天室</b><span className="live-dot">即時</span></div><div className="chat-messages" ref={chatRef}>{messages.map((m,i)=><div className={`chat-msg ${m.kind}`} key={i}>{m.kind==='emote'?<div className="emote-bubble"><b>{m.emoji}</b><span>{m.name}　{m.phrase}</span></div>:m.kind==='system'?<span className="system-msg">{m.text}</span>:<><b>{m.name}</b><span>{m.text}</span></>}</div>)}</div><div className="quick-bar">{QUICK.map(item=><button key={item.emoji} title={item.phrase} onClick={()=>quickSend(item)}>{item.emoji}</button>)}</div><form className="chat-form" onSubmit={sendChat}><input value={chatText} maxLength={240} onChange={e=>setChatText(e.target.value)} placeholder="傳個訊息給大家…"/><button>↑</button></form></div>
    </aside></div>
  </main>;
}

function TikiScene({board=[],decorative=false,lastMove,interactive=false,secret=[],onTikiClick}) {
  const mount=useRef(null), activeRef=useRef([]), cameraRef=useRef(null), theta=useRef(.42), targetTheta=useRef(.42), animRef=useRef(0);
  const dataRef=useRef({board,lastMove,secret});dataRef.current={board,lastMove,secret};
  const sceneID=useMemo(()=>Math.random(),[]);
  useEffect(()=>{
    const node=mount.current; if(!node)return;
    const scene=new THREE.Scene(); scene.background=new THREE.Color(decorative?'#183e39':'#193f39'); scene.fog=new THREE.FogExp2('#193f39',.035);
    const camera=new THREE.PerspectiveCamera(38,node.clientWidth/node.clientHeight,.1,100); camera.position.set(0,12,23); camera.lookAt(0,6,0); cameraRef.current=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(node.clientWidth,node.clientHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; node.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#ddf5dc','#3a2d22',2.2)); const sun=new THREE.DirectionalLight('#fff0c9',3.3); sun.position.set(-6,10,7); sun.castShadow=true; scene.add(sun); const fill=new THREE.PointLight('#76d3a6',18,30); fill.position.set(5,5,-4); scene.add(fill);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(17,80),new THREE.MeshStandardMaterial({color:'#28614d',roughness:.93})); floor.rotation.x=-Math.PI/2; floor.position.y=-.2; floor.receiveShadow=true; scene.add(floor);
    const sand=new THREE.Mesh(new THREE.CircleGeometry(10,64),new THREE.MeshStandardMaterial({color:'#b99461',roughness:1})); sand.rotation.x=-Math.PI/2; sand.position.y=-.12; sand.receiveShadow=true; scene.add(sand);
    const table=new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.5,.42,64),new THREE.MeshStandardMaterial({color:'#694630',roughness:.62})); table.position.y=.06; table.castShadow=true; table.receiveShadow=true; scene.add(table);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(5.17,.11,8,80),new THREE.MeshStandardMaterial({color:'#d6b372',metalness:.28,roughness:.38}));rim.rotation.x=Math.PI/2;rim.position.y=.29;scene.add(rim);
    const mat=(color,roughness=.65,extra={})=>new THREE.MeshStandardMaterial({color,roughness,...extra});
    const darkMat=mat('#403f48'), whiteMat=mat('#fff6e7',.35), pupilMat=mat('#332c32',.26), toothMat=mat('#fff1cf',.35), sweatMat=mat('#75ddf4',.24,{metalness:.08});
    const makeTiki=(color='#96c86c',scale=1,expression='neutral')=>{
      const group=new THREE.Group();group.scale.setScalar(scale);
      const addSphere=(material,position,size)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,28,20),material);mesh.position.set(...position);mesh.scale.set(...size);mesh.castShadow=true;group.add(mesh);return mesh};
      const skin=mat(color,.48), skinLight=mat(new THREE.Color(color).lerp(new THREE.Color('#ffffff'),.16),.43), browMat=mat(new THREE.Color(color).multiplyScalar(.40),.78);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.48,.60,.26,24),mat('#45404a',.72));base.position.y=.23;base.castShadow=true;group.add(base);
      const collar=new THREE.Mesh(new THREE.TorusGeometry(.66,.075,8,32),mat('#d5d3ca',.38,{metalness:.18}));collar.rotation.x=Math.PI/2;collar.position.y=.40;group.add(collar);
      addSphere(skinLight,[0,1.16,0],[.92,1.06,.72]);
      addSphere(skin,[-.81,1.12,0],[.25,.36,.26]);addSphere(skin,[.81,1.12,0],[.25,.36,.26]);
      addSphere(skinLight,[-.48,.73,.42],[.35,.32,.29]);addSphere(skinLight,[.48,.73,.42],[.35,.32,.29]);
      const closed=expression==='sleepy';
      const eyePositions=[[-.31,1.22,.575],[.31,1.22,.575]];
      const browSlopes=expression==='angry'?[.33,-.33]:expression==='smirk'?[-.16,.2]:expression==='sweat'?[.2,-.24]:[0,0];
      eyePositions.forEach(([x,y,z],index)=>{
        if(closed||(expression==='wink'&&index===0)||(expression==='smirk'&&index===0)){
          const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x-.20,y,z),new THREE.Vector3(x,y-.085,z+.025),new THREE.Vector3(x+.20,y,z)]);
          const lid=new THREE.Mesh(new THREE.TubeGeometry(curve,12,.055,7,false),browMat);group.add(lid);
        }else{
          const eye=addSphere(whiteMat,[x,y,.575],[.245,expression==='angry'?.16:.205,.115]);
          const pupilY=expression==='roll'?y+.105:expression==='surprised'?y+.015:y-.015;
          const pupilX=x+(expression==='roll'?(index===0?.035:-.035):0);
          addSphere(pupilMat,[pupilX,pupilY,.685],[.092,.108,.052]);
          addSphere(whiteMat,[pupilX-.025,pupilY+.035,.729],[.026,.028,.016]);
          if(expression==='sleepy')eye.scale.y=.11;
        }
        const brow=new THREE.Mesh(new THREE.CapsuleGeometry(.057,.35,3,8),browMat);brow.rotation.z=Math.PI/2+browSlopes[index];brow.position.set(x,1.57,.58);brow.castShadow=true;group.add(brow);
      });
      addSphere(skin,[0,.98,.64],[.21,.19,.20]);
      const curveLine=(points,radius=.045)=>{const curve=new THREE.CatmullRomCurve3(points.map(([x,y,z])=>new THREE.Vector3(x,y,z)));const line=new THREE.Mesh(new THREE.TubeGeometry(curve,20,radius,8,false),browMat);group.add(line)};
      if(expression==='surprised')addSphere(darkMat,[0,.58,.59],[.16,.22,.075]);
      else if(expression==='smile'){
        addSphere(darkMat,[0,.61,.59],[.28,.17,.065]);addSphere(toothMat,[0,.70,.648],[.20,.055,.025]);
        curveLine([[-.30,.70,.59],[-.18,.53,.63],[0,.50,.65],[.18,.53,.63],[.30,.70,.59]],.035);
      }else if(expression==='smirk')curveLine([[-.29,.66,.59],[-.10,.58,.64],[.12,.60,.65],[.30,.77,.58]],.052);
      else if(expression==='angry')curveLine([[-.27,.73,.59],[-.12,.61,.64],[.12,.61,.64],[.27,.73,.59]],.05);
      else if(expression==='sleepy'||expression==='neutral')curveLine([[-.24,.64,.60],[0,.61,.65],[.24,.64,.60]],.04);
      else curveLine([[-.26,.70,.59],[-.12,.61,.64],[.10,.61,.64],[.26,.70,.59]],.045);
      if(expression==='sweat'){
        const drop=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),sweatMat);drop.scale.set(.7,1.35,.45);drop.position.set(.70,1.65,.43);group.add(drop);
        const tip=new THREE.Mesh(new THREE.ConeGeometry(.075,.20,10),sweatMat);tip.position.set(.70,1.81,.43);group.add(tip);
      }
      return group;
    };
    const pads=new THREE.Group(); scene.add(pads);
    const idolRoot=new THREE.Group();scene.add(idolRoot);
    const effectRoot=new THREE.Group();scene.add(effectRoot);
    const environment=new THREE.Group();scene.add(environment);
    const towerPedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.12,1.32,.42,12),mat('#9b7045'));towerPedestal.position.y=.04;towerPedestal.castShadow=true;towerPedestal.receiveShadow=true;pads.add(towerPedestal);
    const pedestalTrim=new THREE.Mesh(new THREE.TorusGeometry(1.18,.06,8,48),mat('#e6c779',.38));pedestalTrim.rotation.x=Math.PI/2;pedestalTrim.position.y=.27;pads.add(pedestalTrim);
    for(let i=0;i<9;i++){const palm=new THREE.Group(),x=(i%5-2)*5.1,z=(i<5?-6.4:6.4);const stem=new THREE.Mesh(new THREE.CylinderGeometry(.13,.25,3.1,7),mat('#8f683f'));stem.position.y=1.35;stem.rotation.z=(i%2?.1:-.1);stem.castShadow=true;palm.add(stem);for(let j=0;j<6;j++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.32,2.1,5),mat(j%2?'#386a46':'#548653'));leaf.position.set(Math.cos(j)*.8,2.9+Math.sin(j)*.15,Math.sin(j)*.8);leaf.rotation.z=-.8+Math.sin(j)*.5;leaf.rotation.x=Math.cos(j)*.6;palm.add(leaf)}palm.position.set(x,0,z);environment.add(palm)}
    // Silhouettes at the four table corners keep the board feeling like a shared tabletop.
    const seats=new THREE.Group();scene.add(seats);['#ed7965','#5db89b','#edbd58','#9b8ad7'].forEach((c,i)=>{const a=i*Math.PI/2+.5;const x=Math.cos(a)*6.25,z=Math.sin(a)*6.25;const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.43,.85,4,8),mat(c));torso.position.set(x,.75,z);torso.rotation.y=-a;torso.castShadow=true;seats.add(torso);const head=new THREE.Mesh(new THREE.SphereGeometry(.38,16,12),mat('#d9a876'));head.position.set(x,1.63,z);seats.add(head)});
    const explosions=[]; const current={};
    const createToastBurst=(tikiId)=>{
      const tiki=TIKIS[tikiId]||TIKIS[0], origin=new THREE.Vector3(0,.78,0), start=performance.now();
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.075,8,28),new THREE.MeshBasicMaterial({color:'#ffd778',transparent:true,opacity:1}));ring.position.copy(origin);effectRoot.add(ring);
      const shards=[];
      for(let i=0;i<14;i++){
        const shard=new THREE.Mesh(new THREE.TetrahedronGeometry(.11+Math.random()*.12),new THREE.MeshBasicMaterial({color:i%2?tiki.color:'#ffd778',transparent:true,opacity:1}));
        shard.position.copy(origin);effectRoot.add(shard);
        const angle=i*Math.PI*2/14, speed=1.1+Math.random()*1.8;
        shards.push({mesh:shard,velocity:new THREE.Vector3(Math.cos(angle)*speed,.8+Math.random()*1.8,Math.sin(angle)*speed)});
      }
      explosions.push({start,ring,shards});
    };
    const sync=()=>{
      const data=dataRef.current;const source=decorative&&data.board.length===0?TIKIS.map((tiki,id)=>({id,...tiki,active:true})):data.board;const live=source.filter(t=>t.active); const signature=live.map(t=>`${t.id}:${t.color}`).join(',')+`:${data.secret.join(',')}`;
      if(data.lastMove?.type==='toast'&&current.lastToastStamp!==data.lastMove.stamp){current.lastToastStamp=data.lastMove.stamp;createToastBurst(data.lastMove.tikiId)}
      if(current.signature===signature&&current.decorative===decorative)return;
      current.signature=signature;current.decorative=decorative;
      const oldPositions=new Map(idolRoot.children.map(idol=>[idol.userData.id,idol.position.clone()]));
      while(idolRoot.children.length){const old=idolRoot.children[0];old.traverse(object=>{if(object.isMesh){object.geometry.dispose();if(Array.isArray(object.material))object.material.forEach(material=>material.dispose());else object.material.dispose()}});idolRoot.remove(old)} activeRef.current=[];
      const stackStep=1.52, baseY=.28, scale=decorative?.70:.70;
      live.forEach((t,index)=>{const rank=index<3?index:-1,idol=makeTiki(t.color||TIKIS[t.id]?.color||'#96c86c',scale,t.expression||TIKIS[t.id]?.expression);const level=live.length-1-index;const target=new THREE.Vector3(level%2===0?.06:-.06,baseY+level*stackStep,0);const start=oldPositions.get(t.id)?.clone()||target.clone();idol.position.copy(start);const baseRotation=-.14;idol.rotation.y=baseRotation;idol.userData={id:t.id,start,target,moveStart:performance.now(),baseRotation,topple:data.lastMove?.type==='topple'&&data.lastMove.tikiId===t.id};
        if(rank>=0){const scoreColor=['#ffd45f','#e6edf0','#d99562'][rank],badge=new THREE.Mesh(new THREE.TorusGeometry(.72,.08,8,28),new THREE.MeshStandardMaterial({color:scoreColor,emissive:scoreColor,emissiveIntensity:.7,roughness:.28}));badge.rotation.x=Math.PI/2;badge.position.y=.36;idol.add(badge)}
        idolRoot.add(idol);activeRef.current.push(idol)});
      current.lookAtY=baseY+Math.max(0,live.length-1)*stackStep/2+.9;
    };
    sync();
    let down=null;
    const pointerDown=e=>{down={x:e.clientX,y:e.clientY,theta:targetTheta.current};renderer.domElement.setPointerCapture?.(e.pointerId)};
    const pointerMove=e=>{if(down){targetTheta.current=down.theta+(e.clientX-down.x)*.008}};
    const pointerUp=e=>{if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.abs(dx)+Math.abs(dy)<8){const rect=node.getBoundingClientRect();const mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(idolRoot.children,true)[0];if(hit){let root=hit.object;while(root.parent&&root.parent!==idolRoot)root=root.parent;if(root.parent===idolRoot)node.dispatchEvent(new CustomEvent('tiki-select',{detail:root.userData.id}))}}down=null};
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);
    const onResize=()=>{const w=node.clientWidth,h=node.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)};const resize=new ResizeObserver(onResize);resize.observe(node);
    let raf;const render=()=>{raf=requestAnimationFrame(render);sync();if(decorative)targetTheta.current+=.00045;theta.current+=(targetTheta.current-theta.current)*.035;const r=23,lookY=current.lookAtY??6;camera.position.x=Math.sin(theta.current)*r;camera.position.z=Math.cos(theta.current)*r;camera.position.y=lookY+6.8;camera.lookAt(0,lookY,0);const now=performance.now();idolRoot.children.forEach((idol,i)=>{const amount=Math.min(1,(now-idol.userData.moveStart)/620);const eased=1-Math.pow(1-amount,3);idol.position.lerpVectors(idol.userData.start,idol.userData.target,eased);if(idol.userData.topple&&amount<1){idol.position.x+=Math.sin(eased*Math.PI)*.85;idol.position.y+=Math.sin(eased*Math.PI)*1.05;idol.rotation.y=idol.userData.baseRotation+eased*Math.PI*2}else idol.rotation.y=idol.userData.baseRotation;idol.position.y+=Math.sin(Date.now()*.0015+i*.8)*.018});
      for(let i=explosions.length-1;i>=0;i--){const fx=explosions[i],progress=(now-fx.start)/900;if(progress>=1){effectRoot.remove(fx.ring);fx.ring.geometry.dispose();fx.ring.material.dispose();fx.shards.forEach(({mesh})=>{effectRoot.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()});explosions.splice(i,1);continue}fx.ring.scale.setScalar(.8+progress*3.6);fx.ring.material.opacity=1-progress;fx.shards.forEach(({mesh,velocity})=>{mesh.position.copy(fx.ring.position).addScaledVector(velocity,progress);mesh.position.y-=2.2*progress*progress;mesh.rotation.set(progress*7,progress*9,progress*5);mesh.material.opacity=1-progress})}
      renderer.render(scene,camera)};render();
    return()=>{cancelAnimationFrame(raf);resize.disconnect();renderer.dispose();node.removeChild(renderer.domElement)};
  },[sceneID,decorative]);
  useEffect(()=>{const el=mount.current;if(!el)return;const handle=e=>onTikiClick?.(e.detail);el.addEventListener('tiki-select',handle);return()=>el.removeEventListener('tiki-select',handle)},[onTikiClick]);
  return <div className={`three-scene ${decorative?'decorative':''} ${interactive?'interactive':''}`} ref={mount} aria-label="可旋轉的立體堤基圖騰場景"/>;
}

createRoot(document.getElementById('root')).render(<App/>);

