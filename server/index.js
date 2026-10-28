import express from 'express';
import 'dotenv/config';
import {readFile} from 'node:fs/promises';
const app=express();
app.use(express.json({limit:'20kb'}));
const meals=JSON.parse(await readFile(new URL('./data/menus.json',import.meta.url),'utf8'));
const categories=['전체 랜덤',...new Set(meals.map(m=>m.category))];
const emojis=Object.fromEntries(meals.map(m=>[m.category,m.emoji]));emojis['전체 랜덤']='🎲';
const allowedModes=['상관없음','방문','배달'];
function validFilters(f={}) {return {category:typeof f.category==='string'&&categories.includes(f.category)?f.category:'전체 랜덤',budget:[0,10000,15000,20000].includes(f.budget)?f.budget:0,spice:[0,1,2,3].includes(f.spice)?f.spice:3,portion:['상관없음','가볍게','든든하게'].includes(f.portion)?f.portion:'상관없음',mode:allowedModes.includes(f.mode)?f.mode:'상관없음'};}
function validIds(ids){return Array.isArray(ids)?ids.filter(x=>Number.isInteger(x)).slice(0,300):[];}
function matches(f,excluded){return meals.filter(m=>(f.category==='전체 랜덤'||m.category===f.category)&&(!f.budget||m.price<=f.budget)&&m.spice<=f.spice&&(f.portion==='상관없음'||m.portion===f.portion)&&!excluded.includes(m.id));}
app.get('/api/health',(_req,res)=>res.json({ok:true,menuCount:meals.length}));
app.get('/api/categories',(_req,res)=>res.json({categories,categoryEmojis:emojis}));
app.get('/api/menus',(_req,res)=>res.json({menus:meals}));
app.post('/api/recommend/count',(req,res)=>{const f=validFilters(req.body?.filters);res.json({count:matches(f,validIds(req.body?.excluded)).length});});
app.post('/api/recommend',(req,res)=>{const f=validFilters(req.body?.filters);const excluded=validIds(req.body?.excluded);const seen=validIds(req.body?.seen);const eligible=matches(f,excluded);if(!eligible.length)return res.status(404).json({error:'조건에 맞는 메뉴가 없어요. 조건을 완화해 주세요.'});const unseen=eligible.filter(m=>!seen.includes(m.id));const pool=unseen.length?unseen:eligible;const meal=pool[Math.floor(Math.random()*pool.length)];res.json({meal,eligibleCount:eligible.length});});

// Kakao REST key remains on the server. Never send it to React.
const kakaoKey=(process.env.KAKAO_REST_API_KEY||'').trim();
function validKakaoKey(key){return /^[\x21-\x7E]+$/.test(key)&&!key.includes('여기에')&&!key.includes('입력하세요');}
async function kakao(path,params){
  if(!kakaoKey||!validKakaoKey(kakaoKey)){const e=new Error('카카오 REST API 키가 비어 있거나 올바르지 않습니다. 프로젝트 루트 .env의 KAKAO_REST_API_KEY를 실제 영문·숫자 키로 바꾸고 서버를 재시작해 주세요.');e.status=503;throw e;}
  const url=new URL('https://dapi.kakao.com'+path);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{headers:{Authorization:`KakaoAK ${kakaoKey}`},signal:controller.signal});
    if(!r.ok){const e=new Error(r.status===401||r.status===403?'카카오 API 인증에 실패했습니다. 키와 서비스 사용 설정을 확인해 주세요.':`카카오 API 요청 실패 (${r.status})`);e.status=502;throw e;}
    return await r.json();
  }finally{clearTimeout(timer);}
}
function coords(lat,lng){const a=Number(lat),b=Number(lng);return Number.isFinite(a)&&a>=-90&&a<=90&&Number.isFinite(b)&&b>=-180&&b<=180?{lat:a,lng:b}:null;}
app.get('/api/places',async(req,res)=>{
  const keyword=typeof req.query.menu==='string'?req.query.menu.trim():'';
  const c=coords(req.query.lat,req.query.lng);
  if(!keyword||keyword.length>50||!c)return res.status(400).json({error:'메뉴명과 올바른 위도·경도가 필요합니다.'});
  const radius=Math.min(20000,Math.max(100,Number(req.query.radius)||3000));
  try{
    const data=await kakao('/v2/local/search/keyword.json',{query:keyword,x:c.lng,y:c.lat,radius,sort:'distance',size:15});
    res.json({query:keyword,center:c,places:(data.documents||[]).map(p=>({id:p.id,name:p.place_name,address:p.road_address_name||p.address_name,phone:p.phone||'',distance:p.distance?Number(p.distance):null,category:p.category_name,url:p.place_url,lat:Number(p.y),lng:Number(p.x)})),note:'키워드 검색 결과이며 해당 메뉴의 실제 판매 여부와 배달 가능 여부는 확인되지 않았습니다.'});
  }catch(e){res.status(e.status||502).json({error:e.name==='AbortError'?'카카오 API 응답 시간이 초과되었습니다.':e.message||'장소 검색 실패'});}
});
app.get('/api/geocode',async(req,res)=>{
  const address=typeof req.query.address==='string'?req.query.address.trim():'';
  if(address.length<2||address.length>100)return res.status(400).json({error:'지역명 또는 주소를 2~100자로 입력해 주세요.'});
  try{
    const data=await kakao('/v2/local/search/keyword.json',{query:address,size:1});
    const p=data.documents?.[0];
    if(!p)return res.status(404).json({error:'해당 지역을 찾지 못했습니다. 역이나 주요 장소 이름을 입력해 주세요.'});
    res.json({name:p.place_name,address:p.road_address_name||p.address_name,lat:Number(p.y),lng:Number(p.x)});
  }catch(e){res.status(e.status||502).json({error:e.name==='AbortError'?'지역 검색 시간이 초과되었습니다.':e.message||'지역 검색 실패'});}
});

app.use((err,_req,res,_next)=>res.status(400).json({error:'요청 형식이 올바르지 않습니다.'}));
const port=Number(process.env.PORT)||3001;app.listen(port,()=>console.log(`API server: http://localhost:${port}`));
