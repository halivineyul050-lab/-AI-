export function slide(board, direction) {
  if (!['left','right','up','down'].includes(direction)) throw new Error('Unknown direction');
  const result = Array(16).fill(0);
  let gain = 0;
  for (let line=0; line<4; line++) {
    const indices = Array.from({length:4}, (_,i) => direction==='left' ? line*4+i : direction==='right' ? line*4+3-i : direction==='up' ? i*4+line : (3-i)*4+line);
    const values = indices.map(i=>board[i]).filter(Boolean);
    const merged=[];
    for(let i=0;i<values.length;i++) {
      if(values[i]===values[i+1]) { merged.push(values[i]*2); gain+=values[i]*2; i++; }
      else merged.push(values[i]);
    }
    indices.forEach((index,i)=>{result[index]=merged[i] || 0;});
  }
  return {board:result,gain,changed:result.some((value,i)=>value!==board[i])};
}
function spawn(board, random) {
  const empty=board.map((value,i)=>value===0?i:-1).filter(i=>i>=0);
  if(!empty.length) return board;
  const result=board.slice();
  result[empty[Math.floor(random()*empty.length)]]=random()<0.9?2:4;
  return result;
}
export function createGame(random=Math.random) { return {board:spawn(spawn(Array(16).fill(0),random),random),score:0,previous:null}; }
export function move(state,direction,random=Math.random) {
  const result=slide(state.board,direction);
  if(!result.changed) return state;
  return {board:spawn(result.board,random),score:state.score+result.gain,previous:{...state,previous:null}};
}
export function undo(state) {return state.previous || state;}
export function canMove(board) {
  return board.includes(0) || board.some((value,i)=>(i%4<3 && value===board[i+1]) || (i<12 && value===board[i+4]));
}
